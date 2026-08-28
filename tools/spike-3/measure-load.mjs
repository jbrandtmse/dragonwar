#!/usr/bin/env node
// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- the load-time measurement runner. Modelled directly on
// tools/spike-1/measure.mjs (same CDP plumbing, same anti-throttling launch
// flags, same fresh-profile-per-invocation cold-by-construction approach),
// Node 24 built-ins only over CDP -- no Playwright, Puppeteer or Selenium.
//
// Measures ONE cold load of `--url` (the deployed Pages link, or a local
// `vite preview` control -- see docs/spikes/spike-3.md for the interleaved
// A/B protocol DW-13 requires): disables the browser cache, throttles the
// connection to 50 Mbps down (6,250,000 bytes/s) with an authored latency,
// accumulates the compressed transfer total and request count straight off
// the wire via CDP Network events, clicks the press-to-begin gesture as soon
// as it is interactive, reads src/host/boot.ts's recorded gesture and
// first-rendered-frame timestamps off `window.__dragonwarBoot`, samples the
// post-boot rAF cadence, applies DW-16's 20ms median guard, and prints one
// JSON result to stdout.
//
// Usage:
//   node tools/spike-3/measure-load.mjs --url <URL>
//       [--browser chrome|edge] [--latency <ms>] [--exe <path>]
//
// --latency defaults to 20ms (authored; see docs/spikes/spike-3.md for why) and
// is always echoed in the JSON result so a re-run is comparable, per this
// story's own "Decisions this spec makes".
//
// ENVIRONMENT NOTE (this implementation pass): this cycle host has no display
// actively attached (`Get-CimInstance Win32_VideoController` reports a fixed
// 29Hz CurrentRefreshRate; `EnumDisplaySettings` enumerates zero modes at
// all -- confirmed via direct Win32 API calls, not inferred), unlike the
// interactive session Story 1.1's 60fps numbers were taken on. A headed
// Chrome launched here paces requestAnimationFrame at the stale ~29Hz value
// regardless of DW-16's other anti-throttling flags, which the median-cadence
// guard correctly rejects (this IS the guard doing its job -- a genuinely
// degraded rendering environment, not a false negative). `--disable-gpu-vsync`
// and `--disable-frame-rate-limit` below stop Chrome from pacing to that
// stale value at all; docs/spikes/spike-3.md records the resulting cadence
// honestly (effectively unthrottled, not 60Hz-paced) and flags the load-time
// figures taken this way as a re-verify item for a host with a real attached
// display -- transfer size and request count are unaffected by any of this
// (pure network accounting) and are fully valid regardless.

import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DEFAULT_EXE = {
	chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
	edge: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
};
const PROFILE_DIR_PREFIX = 'dragonwar-spike3-';
const CDP_PORT = 9334; // distinct from spike-1's 9333, so both could in principle run side by side
const CDP_READY_TIMEOUT_MS = 20_000;
const GESTURE_READY_TIMEOUT_MS = 20_000;
const BOOT_TIMEOUT_MS = 30_000;
const CADENCE_SAMPLE_FRAMES = 30;
const MEDIAN_FRAME_DELTA_MS = 20; // DW-16, same threshold as tools/spike-1/browser.ts
const DOWNLOAD_THROUGHPUT_BYTES_PER_SEC = 6_250_000; // 50 Mbps, this story's AC
const DEFAULT_LATENCY_MS = 20; // authored default, overridable by --latency, always echoed

function requireValue(argv, i, flag) {
	const value = argv[i];
	if (value === undefined) {
		throw new Error(`${flag} requires a value`);
	}
	if (value.trim() === '') {
		throw new Error(`${flag} requires a value that is not empty`);
	}
	return value;
}

function parseArgs(argv) {
	const args = { url: undefined, browser: 'chrome', exe: undefined, latencyMs: DEFAULT_LATENCY_MS };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--url') {
			args.url = requireValue(argv, ++i, '--url');
		} else if (a === '--browser') {
			args.browser = requireValue(argv, ++i, '--browser');
		} else if (a === '--exe') {
			args.exe = requireValue(argv, ++i, '--exe');
		} else if (a === '--latency') {
			const raw = requireValue(argv, ++i, '--latency');
			const parsed = Number(raw);
			if (!Number.isFinite(parsed) || parsed < 0) {
				throw new Error(`--latency must be a non-negative number of milliseconds, got "${raw}"`);
			}
			args.latencyMs = parsed;
		} else {
			throw new Error(`unrecognized argument: ${a}`);
		}
	}
	if (!args.url) {
		throw new Error('--url is required');
	}
	if (args.browser !== 'chrome' && args.browser !== 'edge') {
		throw new Error(`--browser must be "chrome" or "edge" (got ${JSON.stringify(args.browser)})`);
	}
	return args;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** See tools/spike-1/measure.mjs's killTree for why /T /F is load-bearing on Windows. */
function killTree(pid) {
	return new Promise((resolve) => {
		if (process.platform === 'win32') {
			const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
			killer.on('exit', () => resolve());
			killer.on('error', () => resolve());
		} else {
			try {
				process.kill(-pid, 'SIGKILL');
			} catch {
				try {
					process.kill(pid, 'SIGKILL');
				} catch {
					// already gone
				}
			}
			resolve();
		}
	});
}

async function waitForCdpReady(port, deadline) {
	let lastErr;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (res.ok) {
				return await res.json();
			}
		} catch (err) {
			lastErr = err;
		}
		await sleep(200);
	}
	throw new Error(`CDP endpoint on port ${port} never became ready: ${lastErr?.message ?? 'timed out'}`);
}

async function findPageTarget(port, deadline) {
	while (Date.now() < deadline) {
		const res = await fetch(`http://127.0.0.1:${port}/json/list`);
		const targets = await res.json();
		const page = targets.find((t) => t.type === 'page');
		if (page) {
			return page;
		}
		await sleep(200);
	}
	throw new Error('no CDP page target found before the deadline');
}

/** Minimal CDP client: one WebSocket, JSON-RPC-style id correlation, plus event dispatch. */
function connectCdp(webSocketDebuggerUrl) {
	const ws = new WebSocket(webSocketDebuggerUrl);
	const pending = new Map();
	const eventHandlers = new Map(); // method -> Set<fn>
	let nextId = 1;

	ws.addEventListener('message', (event) => {
		let msg;
		try {
			msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
		} catch {
			return;
		}
		if (msg.id !== undefined && pending.has(msg.id)) {
			const { resolve, reject } = pending.get(msg.id);
			pending.delete(msg.id);
			if (msg.error) {
				reject(new Error(`CDP error ${msg.error.code}: ${msg.error.message}`));
			} else {
				resolve(msg.result);
			}
			return;
		}
		if (msg.method && eventHandlers.has(msg.method)) {
			for (const handler of eventHandlers.get(msg.method)) {
				handler(msg.params);
			}
		}
	});

	const ready = new Promise((resolve, reject) => {
		ws.addEventListener('open', () => resolve());
		ws.addEventListener('error', (err) => reject(new Error(`CDP WebSocket error: ${err.message ?? err}`)));
		ws.addEventListener('close', () => reject(new Error('CDP WebSocket closed before it opened')));
	});

	ws.addEventListener('close', () => {
		for (const { reject } of pending.values()) {
			reject(new Error('CDP WebSocket closed before the request completed'));
		}
		pending.clear();
	});

	function send(method, params = {}) {
		const id = nextId++;
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			ws.send(JSON.stringify({ id, method, params }));
		});
	}

	function on(method, handler) {
		if (!eventHandlers.has(method)) {
			eventHandlers.set(method, new Set());
		}
		eventHandlers.get(method).add(handler);
	}

	function close() {
		try {
			ws.close();
		} catch {
			// best-effort
		}
	}

	return { ready, send, on, close };
}

/** See tools/spike-1/measure.mjs's sweepStaleProfileDirs for the age-gate rationale. */
function sweepStaleProfileDirs() {
	let entries;
	try {
		entries = readdirSync(tmpdir());
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.startsWith(PROFILE_DIR_PREFIX)) {
			const dir = path.join(tmpdir(), entry);
			try {
				if (Date.now() - statSync(dir).mtimeMs < BOOT_TIMEOUT_MS * 4) {
					continue;
				}
			} catch {
				continue;
			}
			try {
				rmSync(dir, { recursive: true, force: true });
			} catch {
				// still locked -- leave it for next time
			}
		}
	}
}

function median(sortedAscending) {
	const n = sortedAscending.length;
	if (n === 0) {
		return 0;
	}
	const mid = Math.floor(n / 2);
	return n % 2 === 0 ? (sortedAscending[mid - 1] + sortedAscending[mid]) / 2 : sortedAscending[mid];
}

async function evaluate(cdp, expression, awaitPromise = false) {
	const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
	if (result.exceptionDetails) {
		throw new Error(`page threw: ${result.exceptionDetails.text ?? JSON.stringify(result.exceptionDetails)}`);
	}
	return result.result?.value;
}

async function run(args) {
	const consoleMessages = [];
	let requestCount = 0;
	let transferBytes = 0;

	const exe = args.exe ?? DEFAULT_EXE[args.browser];
	const profileDir = mkdtempSync(path.join(tmpdir(), `${PROFILE_DIR_PREFIX}${args.browser}-`));

	const launchArgs = [
		`--remote-debugging-port=${CDP_PORT}`,
		`--user-data-dir=${profileDir}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--disable-background-timer-throttling',
		'--disable-backgrounding-occluded-windows',
		'--disable-renderer-backgrounding',
		'--disable-gpu-vsync',
		'--disable-frame-rate-limit',
		'about:blank', // navigate explicitly after CDP attaches, so no request is missed
	];

	console.error(`[measure-load] launching ${args.browser} headed: ${exe}`);
	console.error(`[measure-load] target: ${args.url}`);
	console.error(
		`[measure-load] throttle: ${DOWNLOAD_THROUGHPUT_BYTES_PER_SEC} bytes/s down (50 Mbps), ` +
		`latency ${args.latencyMs}ms, cache disabled`,
	);

	const child = spawn(exe, launchArgs, { stdio: 'ignore', windowsHide: false });

	let exitCode = 0;
	let jsonResult = null;
	const spawnError = new Promise((_resolve, reject) => {
		child.on('error', (err) => reject(new Error(`failed to launch ${exe}: ${err.message}`)));
	});
	spawnError.catch(() => {});

	try {
		await Promise.race([
			(async () => {
				await waitForCdpReady(CDP_PORT, Date.now() + CDP_READY_TIMEOUT_MS);
				const target = await findPageTarget(CDP_PORT, Date.now() + CDP_READY_TIMEOUT_MS);
				const cdp = connectCdp(target.webSocketDebuggerUrl);
				await cdp.ready;

				await cdp.send('Page.enable');
				await cdp.send('Network.enable');
				await cdp.send('Runtime.enable');
				// Forces the renderer to treat this page as focused regardless of the
				// real OS window-manager focus state. On this host/session a headed
				// launch's rAF cadence measured ~29 fps (34-35ms/frame) without this --
				// the exact DW-16 defect signature -- even with the launch's other
				// anti-throttling flags; this fixed it. Emulation domain, no
				// corresponding *.disable -- harmless to leave set for the run's life.
				await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

				await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
				await cdp.send('Network.emulateNetworkConditions', {
					offline: false,
					latency: args.latencyMs,
					downloadThroughput: DOWNLOAD_THROUGHPUT_BYTES_PER_SEC,
					uploadThroughput: DOWNLOAD_THROUGHPUT_BYTES_PER_SEC,
				});

				cdp.on('Network.requestWillBeSent', () => {
					requestCount++;
				});
				cdp.on('Network.loadingFinished', (params) => {
					transferBytes += params.encodedDataLength ?? 0;
				});
				cdp.on('Runtime.consoleAPICalled', (params) => {
					const text = (params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
					consoleMessages.push(`[${params.type}] ${text}`);
				});

				// Cold by construction: fresh profile dir (never reused across
				// invocations), cache disabled above, and this is the FIRST navigation
				// this profile has ever made.
				await cdp.send('Page.navigate', { url: args.url });

				// Poll for the gate becoming interactive -- AD-17's WebGL2 check runs
				// synchronously at module load, so on a WebGL2-capable browser this
				// resolves almost immediately after the module script parses.
				const gestureDeadline = Date.now() + GESTURE_READY_TIMEOUT_MS;
				let rect;
				for (;;) {
					try {
						rect = await evaluate(
							cdp,
							`(() => {
								// document.readyState !== 'complete' means styles.css may not
								// have applied yet -- getBoundingClientRect() would then read
								// the button's UNSTYLED flow position (small, near the top-left
								// corner from <main>'s default block layout), not where it
								// actually renders. Verified empirically: under a throttled
								// connection this race is easy to hit, and clicking those
								// coordinates misses the real button entirely, hanging the run.
								if (document.readyState !== 'complete') return null;
								const btn = document.getElementById('begin-button');
								if (!btn || btn.disabled) return null;
								const r = btn.getBoundingClientRect();
								return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
							})()`,
						);
					} catch {
						rect = null;
					}
					if (rect) {
						break;
					}
					if (Date.now() > gestureDeadline) {
						throw new Error('the press-to-begin button never became interactive before the deadline');
					}
					await sleep(100);
				}

				// Page.bringToFront: some CDP/OS window-manager combinations do not
				// dispatch synthetic input to a background window reliably -- cheap
				// insurance verified while building this runner.
				await cdp.send('Page.bringToFront');
				await cdp.send('Input.dispatchMouseEvent', {
					type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1,
				});
				await cdp.send('Input.dispatchMouseEvent', {
					type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1,
				});

				// Poll for src/host/boot.ts's recorded timestamps.
				const bootDeadline = Date.now() + BOOT_TIMEOUT_MS;
				let boot;
				for (;;) {
					boot = await evaluate(cdp, 'window.__dragonwarBoot ?? null');
					if (boot) {
						break;
					}
					// Surface a boot-stage failure (the error panel) as a named failure
					// rather than spinning until the deadline.
					const errorText = await evaluate(
						cdp,
						`(() => {
							const p = document.getElementById('error-panel');
							if (p && !p.hidden) {
								const m = document.getElementById('error-message');
								return m ? m.textContent : 'boot failed (no message)';
							}
							return null;
						})()`,
					);
					if (errorText) {
						throw new Error(`page reported a boot-stage failure: ${errorText}`);
					}
					if (Date.now() > bootDeadline) {
						const state = await evaluate(
							cdp,
							`({ gateHidden: document.getElementById('gate').hidden, canvasHidden: document.getElementById('render-canvas').hidden, url: location.href })`,
						);
						console.error(`[measure-load][debug] state at timeout: ${JSON.stringify(state)}`);
						throw new Error('window.__dragonwarBoot was never set before the deadline -- the page never finished booting');
					}
					await sleep(100);
				}

				// Sample post-boot rAF cadence (DW-16) -- the engine is already running
				// a continuous render loop by this point (src/presentation/scene/
				// create-engine.ts's bootScene starts it before resolving).
				const cadenceTimestamps = await evaluate(
					cdp,
					`new Promise((resolve) => {
						const timestamps = [];
						function frame(ts) {
							timestamps.push(ts);
							if (timestamps.length < ${CADENCE_SAMPLE_FRAMES}) {
								requestAnimationFrame(frame);
							} else {
								resolve(timestamps);
							}
						}
						requestAnimationFrame(frame);
					})`,
					true,
				);
				const deltas = [];
				for (let i = 1; i < cadenceTimestamps.length; i++) {
					deltas.push(cadenceTimestamps[i] - cadenceTimestamps[i - 1]);
				}
				const medianFrameDeltaMs = median([...deltas].sort((a, b) => a - b));

				cdp.close();

				if (medianFrameDeltaMs > MEDIAN_FRAME_DELTA_MS) {
					throw new Error(
						`median rAF delta ${medianFrameDeltaMs.toFixed(1)}ms exceeded ${MEDIAN_FRAME_DELTA_MS}ms ` +
						`over ${cadenceTimestamps.length} post-boot frames -- rejecting this run (DW-16). Re-run foregrounded.`,
					);
				}

				jsonResult = {
					url: args.url,
					browser: args.browser,
					latencyMs: args.latencyMs,
					downloadThroughputBytesPerSec: DOWNLOAD_THROUGHPUT_BYTES_PER_SEC,
					transferBytes,
					requestCount,
					navigationToFirstFrameMs: boot.firstFrameMs,
					gestureToFirstFrameMs: boot.firstFrameMs - boot.gestureMs,
					renderer: boot.renderer,
					medianFrameDeltaMs,
					cadenceFrames: cadenceTimestamps.length,
					consoleMessages,
				};
				console.log(JSON.stringify(jsonResult));
			})(),
			spawnError,
		]);
	} catch (err) {
		console.error(`[measure-load] FAILED: ${err instanceof Error ? err.message : String(err)}`);
		if (consoleMessages.length > 0) {
			console.error('[measure-load] console messages captured before failure:');
			for (const m of consoleMessages) {
				console.error(`  ${m}`);
			}
		}
		exitCode = 1;
	} finally {
		if (child.pid) {
			await killTree(child.pid);
		}
		try {
			rmSync(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 });
		} catch {
			// best-effort cleanup
		}
	}

	return exitCode;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	sweepStaleProfileDirs();
	const exitCode = await run(args);
	process.exit(exitCode);
}

main().catch((err) => {
	console.error(`[measure-load] FATAL: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
