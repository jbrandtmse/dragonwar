#!/usr/bin/env node
// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.1, Spike 1 — the Windows Chrome / Windows Edge measurement runner.
// Node-24-builtins only (global `fetch` for the CDP HTTP endpoint, global
// `WebSocket` for the CDP protocol connection) — no Playwright, Puppeteer or
// Selenium (this story's Never list). Launches the target browser HEADED (never
// --headless: a background/occluded window throttles requestAnimationFrame and
// silently ruins the numbers), points it at the Spike 1 harness page, calls
// `window.__spike1Run()` over CDP, and prints its JSON result to stdout.
//
// MEASUREMENT SURFACE. Story 1.1's acceptance criterion was amended on 2026-08-27:
// the frame budget is measured against a PRODUCTION BUILD (`vite build` +
// `vite preview`), never the Vite dev page. Measure the production build because
// that is what ships and what the amended AC names. (The original justification --
// that the dev page measured one browser leg about 0.4 ms slower and flipped that
// leg's verdict -- was RETRACTED on 2026-08-27: a same-session A/B found the two
// surfaces indistinguishable on this host and that delta to be cross-session noise.
// The rule stands; only its stated evidence was wrong. See docs/spikes/spike-1.md.)
//
// Story 1.2 (DW-11) scripted the production build: `pnpm build` (`vite build`,
// this repository's own vite.config.ts) then `pnpm preview` (`vite preview`,
// fixed and strictPort on port 4173). `--url` now DEFAULTS to that preview URL
// rather than the dev server -- superseding the ad-hoc
// `npx vite build tools/spike-1 --base ./ --outDir <scratch>/...` invocation
// recorded at docs/spikes/spike-1.md lines 547-559. Every result now also
// carries `medianFrameDeltaMs` (DW-16): a run whose measured window's median
// requestAnimationFrame delta exceeds 20ms is rejected rather than recorded --
// see tools/spike-1/browser.ts.
//
// Usage:
//   node tools/spike-1/measure.mjs --browser chrome|edge
//       [--url http://localhost:4173/tools/spike-1/index.html] [--exe <path>]

import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DEFAULT_URL = 'http://localhost:4173/tools/spike-1/index.html';
const DEFAULT_EXE = {
	chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
	edge: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
};
const PROFILE_DIR_PREFIX = 'dragonwar-spike1-';
const CDP_PORT = 9333;
const CDP_READY_TIMEOUT_MS = 20_000;
const RUN_TIMEOUT_MS = 60_000; // 660 rAF frames at 60Hz ~= 11s; generous headroom.

/**
 * True when `url` looks like a Vite dev server rather than a production preview.
 * Deliberately a heuristic over host+port, not equality with DEFAULT_URL: the dev
 * page is still the dev page on 127.0.0.1, on the next free port Vite picks when
 * 5173 is taken, or with a query string appended, and an exact-match guard let
 * every one of those through unwarned.
 */
function looksLikeDevServer(url) {
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	const devHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
	// Vite dev defaults to 5173 and increments while ports are taken; `vite preview`
	// defaults to 4173 and increments the same way. Treat the 5173-5183 band as dev.
	const port = Number(parsed.port);
	return devHosts.has(parsed.hostname) && port >= 5173 && port <= 5183;
}

function requireValue(argv, i, flag) {
	const value = argv[i];
	if (value === undefined) {
		throw new Error(`${flag} requires a value`);
	}
	// An empty or whitespace-only value parses fine and then flows into spawn() as
	// an empty exe path or URL, which throws outside the try/finally -- leaking the
	// temp profile directory because cleanup never runs.
	if (value.trim() === '') {
		throw new Error(`${flag} requires a value that is not empty`);
	}
	return value;
}

function parseArgs(argv) {
	const args = { browser: undefined, url: DEFAULT_URL, exe: undefined };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--browser') {
			args.browser = requireValue(argv, ++i, '--browser');
		} else if (a === '--url') {
			args.url = requireValue(argv, ++i, '--url');
		} else if (a === '--exe') {
			args.exe = requireValue(argv, ++i, '--exe');
		} else {
			throw new Error(`unrecognized argument: ${a}`);
		}
	}
	if (args.browser !== 'chrome' && args.browser !== 'edge') {
		throw new Error(`--browser must be "chrome" or "edge" (got ${JSON.stringify(args.browser)})`);
	}
	return args;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Terminates the launched browser's whole process tree. Chrome and Edge fork into
 * several helper processes (GPU, renderer, crashpad, utility, ...) that outlive a
 * plain `child.kill()` on Windows — verified empirically while building this
 * runner: the spawned PID survived a `.kill()` call with every child process still
 * running. `taskkill /T /F` recurses the tree and reliably takes all of it down.
 */
function killTree(pid) {
	return new Promise((resolve) => {
		if (process.platform === 'win32') {
			const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
			killer.on('exit', () => resolve());
			killer.on('error', () => resolve());
		} else {
			try {
				process.kill(-pid, 'SIGKILL'); // negative pid: whole process group, when detached
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

async function findPageTarget(port, urlSubstring, deadline) {
	while (Date.now() < deadline) {
		const res = await fetch(`http://127.0.0.1:${port}/json/list`);
		const targets = await res.json();
		const page = targets.find((t) => t.type === 'page' && t.url && t.url.includes(urlSubstring));
		if (page) {
			return page;
		}
		await sleep(200);
	}
	throw new Error(`no CDP page target found for URL containing "${urlSubstring}" before the deadline`);
}

/** Minimal CDP client: one WebSocket, JSON-RPC-style id correlation. */
function connectCdp(webSocketDebuggerUrl) {
	const ws = new WebSocket(webSocketDebuggerUrl);
	const pending = new Map();
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
		}
	});

	const ready = new Promise((resolve, reject) => {
		ws.addEventListener('open', () => resolve());
		ws.addEventListener('error', (err) => reject(new Error(`CDP WebSocket error: ${err.message ?? err}`)));
		// A socket can close during the handshake without ever emitting `error`
		// (browser exits, target vanishes). Without this, `await cdp.ready` would
		// never settle and the run would hang past every deadline -- the same failure
		// mode the in-flight-send rejection below fixes, one step earlier.
		ws.addEventListener('close', () => reject(new Error('CDP WebSocket closed before it opened')));
	});

	// Without this, a socket that closes mid-run (browser crash, tab killed) leaves
	// every in-flight send() pending forever: the probe loop below awaits its result
	// before it re-checks its deadline, so the process would hang past every timeout.
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

	function close() {
		try {
			ws.close();
		} catch {
			// best-effort
		}
	}

	return { ready, send, close };
}

/**
 * Best-effort sweep of `dragonwar-spike1-*` profile directories left behind by
 * earlier invocations. This run's own cleanup (below, after killTree) retries
 * with backoff but can still occasionally lose the race against Windows
 * releasing the just-killed browser's file handles on the profile it was using
 * — verified empirically while building this runner, an immediate retry budget
 * of several seconds was sometimes not enough. A *previous* run's leftover,
 * by contrast, is safe to remove unconditionally: enough wall-clock time has
 * necessarily passed since that browser was killed (at minimum, this whole
 * process's own startup time) that no handle on it can plausibly still be held.
 * Doing this at the start of every run means leftovers never accumulate past
 * whatever this run's own cleanup fails to catch.
 */
function sweepStaleProfileDirs() {
	let entries;
	try {
		entries = readdirSync(tmpdir());
	} catch {
		return; // best-effort; a failure here should never block the actual measurement
	}
	for (const entry of entries) {
		if (entry.startsWith(PROFILE_DIR_PREFIX)) {
			const dir = path.join(tmpdir(), entry);
			try {
				// Age gate: a concurrent measure.mjs holds a profile dir that is, by
				// definition, recent. Without this, a second invocation would delete the
				// first one's live profile out from under its browser. RUN_TIMEOUT_MS is
				// the longest a healthy run can last, so anything older is certainly dead.
				if (Date.now() - statSync(dir).mtimeMs < RUN_TIMEOUT_MS * 2) {
					continue;
				}
			} catch {
				continue; // vanished or unreadable between readdir and stat; nothing to do
			}
			try {
				rmSync(dir, { recursive: true, force: true });
			} catch {
				// still locked or otherwise unremovable right now — leave it for next time
			}
		}
	}
}

async function main() {
	// Parse first, sweep second. `sweepStaleProfileDirs()` mutates global machine
	// state (%TEMP%), and test/measure-cli.test.ts spawns this script six times to
	// exercise argument validation alone -- with the sweep first, running `pnpm test`
	// while a measurement is in flight would delete that live browser's profile.
	const args = parseArgs(process.argv.slice(2));
	sweepStaleProfileDirs();
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
		args.url,
	];

	// eslint-disable-next-line no-console
	console.error(`[measure] launching ${args.browser} headed: ${exe}`);
	console.error(`[measure] target: ${args.url}`);
	// Heuristic, not string identity: `--url` may legitimately differ from
	// DEFAULT_URL in host (localhost vs 127.0.0.1), port (Vite picks the next free
	// one when 5173 is taken) or query string, and every one of those is still the
	// dev page. Matching only DEFAULT_URL let all of them through unwarned.
	if (looksLikeDevServer(args.url)) {
		console.error(
			'[measure] WARNING: this is the Vite DEV page. The amended Story 1.1 acceptance ' +
			'criterion measures the frame budget against a PRODUCTION build only -- a dev-page ' +
			'number must not be used to gate TICK_HZ. See docs/spikes/spike-1.md.',
		);
	}
	const child = spawn(exe, launchArgs, { stdio: 'ignore', windowsHide: false });

	let exitCode = 0;
	// `child.on('error', ...)` fires asynchronously from Node's event loop, not
	// synchronously inside the try block below — a `throw` in that handler would
	// become an uncaught exception that crashes the process before `finally`'s
	// cleanup (killTree / rmSync) ever runs. Routing it through a promise that
	// `Promise.race`s against the main flow lets a failed launch (e.g. `--exe`
	// pointing at a path that doesn't exist) hit the same catch/finally as every
	// other failure instead.
	const spawnError = new Promise((_resolve, reject) => {
		child.on('error', (err) => {
			reject(new Error(`failed to launch ${exe}: ${err.message}`));
		});
	});
	spawnError.catch(() => {}); // prevent an unhandled-rejection warning if the main flow settles first

	try {
		await Promise.race([
			(async () => {
				await waitForCdpReady(CDP_PORT, Date.now() + CDP_READY_TIMEOUT_MS);
				const target = await findPageTarget(CDP_PORT, '/tools/spike-1/', Date.now() + CDP_READY_TIMEOUT_MS);

				const cdp = connectCdp(target.webSocketDebuggerUrl);
				await cdp.ready;

				// The CDP page target appears as soon as navigation commits, which can be
				// well before the page's module script has run and assigned
				// `window.__spike1Run`. Poll for it rather than racing the page's own load.
				const readyDeadline = Date.now() + CDP_READY_TIMEOUT_MS;
				for (;;) {
					const probe = await cdp.send('Runtime.evaluate', {
						expression: 'typeof window.__spike1Run',
						returnByValue: true,
					});
					if (probe.result?.value === 'function') {
						break;
					}
					if (Date.now() > readyDeadline) {
						throw new Error('window.__spike1Run was never defined — the page never finished loading its module script');
					}
					await sleep(200);
				}

				const evalPromise = cdp.send('Runtime.evaluate', {
					expression: 'window.__spike1Run()',
					awaitPromise: true,
					returnByValue: true,
				});
				const timeoutPromise = new Promise((_, reject) => {
					setTimeout(() => reject(new Error(`window.__spike1Run() did not resolve within ${RUN_TIMEOUT_MS}ms`)), RUN_TIMEOUT_MS);
				});

				const result = await Promise.race([evalPromise, timeoutPromise]);
				cdp.close();

				if (result.exceptionDetails) {
					throw new Error(`window.__spike1Run() threw: ${result.exceptionDetails.text ?? JSON.stringify(result.exceptionDetails)}`);
				}

				const value = result.result?.value;
				if (
					!value ||
					typeof value.samples !== 'number' ||
					typeof value.p95Ms !== 'number' ||
					typeof value.medianFrameDeltaMs !== 'number'
				) {
					throw new Error(`unexpected result shape from window.__spike1Run(): ${JSON.stringify(result)}`);
				}

				// eslint-disable-next-line no-console
				console.log(JSON.stringify({ browser: args.browser, ...value }));
			})(),
			spawnError,
		]);
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error(`[measure] FAILED: ${err instanceof Error ? err.message : String(err)}`);
		exitCode = 1;
	} finally {
		if (child.pid) {
			await killTree(child.pid);
		}
		try {
			// maxRetries/retryDelay: verified empirically while building this runner —
			// on Windows, the OS can hold the just-killed browser's file handles open
			// on the profile directory for a while after killTree()'s taskkill resolves
			// (crashpad/leveldb LOCK files, observed up to several seconds under load),
			// so an immediate rmSync throws EBUSY/EPERM and (with the old bare
			// try/catch swallowing it) silently left the ~50MB profile behind on
			// essentially every run. Node's built-in retry-with-backoff (only honoured
			// when `recursive: true`, which this already sets) closes most of the
			// window; a leftover under `%TEMP%/dragonwar-spike1-*` after a run is a
			// known, harmless, non-blocking residual if the OS is unusually slow to
			// release the handle even across this backoff.
			rmSync(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 });
		} catch {
			// best-effort cleanup — still not fatal to the run if this ultimately fails
		}
	}

	process.exit(exitCode);
}

main().catch((err) => {
	// Backstop for anything that throws before the try block above is entered
	// (e.g. `mkdtempSync` failing) or otherwise escapes it — without this, main()
	// rejecting would be an unhandled promise rejection rather than a clean
	// non-zero exit.
	// eslint-disable-next-line no-console
	console.error(`[measure] FATAL: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
