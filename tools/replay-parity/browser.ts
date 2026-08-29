// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8, AC 5: the browser parity leg. Served (never bundled into the
// shipped app -- vite.config.ts is out of footprint, AD-17/AD-1) by
// tools/replay-parity/serve.mjs, driving Vite's own programmatic dev-server
// API rather than adding a new vite.config.ts entry point
// (tools/spike-1/{index.html,browser.ts} + measure.mjs is the precedent this
// story's Code Map names). Fetches every golden's OWN data from
// serve.mjs's `/dragonwar-goldens/*` middleware (never bundled statically,
// so a NEW golden added under test/replays/ needs no rebuild of this page)
// and replays each through the SAME `src/sim/loop/replay.ts` module the
// Node runner (test/replay-goldens.test.ts) uses -- literally the same
// source file, bundled once for Node (via Vitest) and once for the browser
// (via this page), never two implementations.
//
// AD-15's own Prevents entry: "a golden that fails because Safari's
// Math.sin differs from V8's" -- so this page compares ONLY
// `finalGameStateHash` (the GameState-only portion) against each golden's
// `expectedGameStateHash`. It intentionally never touches `finalHash` (the
// full hash including quantised ball positions), which is Node-only
// territory (test/replay-goldens.test.ts).

import { runReplay, type CoilPrologueEntry } from '../../src/sim/loop/replay';
import type { InputTransition } from '../../src/sim/contracts/input';
import type { Replay, ReplayHeader } from '../../src/sim/table/names';

interface GoldenFile {
	readonly name: string;
	readonly description: string;
	readonly header: ReplayHeader;
	readonly transitions: readonly InputTransition[];
	readonly coilPrologue: readonly CoilPrologueEntry[];
	readonly durationTicks: number;
	readonly expectedHash: string;
	readonly expectedGameStateHash: string;
	readonly notes: string;
}

interface GoldenReport {
	readonly name: string;
	readonly pass: boolean;
	/** Present on both pass and fail -- the actual computed hash, or the error message if the run itself threw. */
	readonly detail: string;
}

/** The two hash fields `judgeGoldenResult()` needs from `runReplay()`'s result -- deliberately narrower than the full `RunReplayResult`, so a test can construct one without running a real replay. */
export interface GoldenHashResult {
	readonly finalHash: string;
	readonly finalGameStateHash: string;
}

/** The two expected-hash fields `judgeGoldenResult()` needs from a golden file -- deliberately narrower than the full `GoldenFile`, for the same reason as `GoldenHashResult` above. */
export interface GoldenExpectedHashes {
	readonly expectedHash: string;
	readonly expectedGameStateHash: string;
}

/**
 * The AD-15 cross-engine-safety judgement, extracted as its own pure function
 * (Review finding 2026-08-29) so the field-selection choice is unit-tested
 * directly, without a live browser -- following `tools/spike-1/browser.ts`'s
 * own precedent (see `test/replay-parity-logic.test.ts`). PASS/FAIL is
 * decided on `finalGameStateHash` alone, NEVER `finalHash` (this file's own
 * header comment: the full hash, which includes quantised ball positions, is
 * exactly what a differing transcendental implementation -- e.g. Safari's
 * `Math.sin` vs V8's -- could disturb).
 */
export function judgeGoldenResult(result: GoldenHashResult, golden: GoldenExpectedHashes): Pick<GoldenReport, 'pass' | 'detail'> {
	const pass = result.finalGameStateHash === golden.expectedGameStateHash;
	return {
		pass,
		detail: pass
			? `finalGameStateHash=${result.finalGameStateHash} (matches)`
			: `finalGameStateHash=${result.finalGameStateHash}, expected ${golden.expectedGameStateHash}`,
	};
}

const resultEl = typeof document !== 'undefined' ? document.getElementById('result') : null;
const tableEl = typeof document !== 'undefined' ? (document.getElementById('results-table') as HTMLTableElement | null) : null;

async function fetchJson<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`fetch(${url}) failed: ${response.status} ${response.statusText}`);
	}
	return (await response.json()) as T;
}

/**
 * Replays ONE golden and reports PASS/FAIL -- NEVER a silent skip (this
 * story's own I/O matrix row: "Page reports per-golden PASS/FAIL, never a
 * silent skip"). A thrown error (a stale header, a malformed golden, an
 * unexpected exception) reports as FAIL with the error's own message, rather
 * than being swallowed and simply absent from the table.
 */
async function runOneGolden(name: string): Promise<GoldenReport> {
	try {
		const [golden, collisionDoc] = await Promise.all([
			fetchJson<GoldenFile>(`/dragonwar-goldens/${name}.golden.json`),
			fetchJson<unknown>('/dragonwar-goldens/collision.json'),
		]);
		const replay: Replay = { header: golden.header, transitions: golden.transitions };
		const result = runReplay({
			replay,
			collisionDoc,
			durationTicks: golden.durationTicks,
			coilPrologue: golden.coilPrologue,
		});
		const { pass, detail } = judgeGoldenResult(result, golden);
		return { name, pass, detail };
	} catch (err) {
		return { name, pass: false, detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
	}
}

function renderReports(reports: readonly GoldenReport[]): void {
	if (resultEl) {
		const passCount = reports.filter((r) => r.pass).length;
		resultEl.textContent = `${passCount}/${reports.length} golden(s) PASS on the GameState-only hash (browser: ${navigator.userAgent})`;
	}
	if (tableEl) {
		// CSS classes only, never element.style.* -- the pinned CSP
		// (default-src 'self', no style-src widening) blocks JS-set inline
		// styles the same way it blocks a <style> block; tools/replay-parity/
		// style.css (an external, same-origin stylesheet) owns the look
		// (measured this pass: the inline-style version logged a real CSP
		// violation in Chrome and rendered unstyled).
		tableEl.innerHTML = '';
		const header = tableEl.insertRow();
		for (const label of ['golden', 'result', 'detail']) {
			const th = document.createElement('th');
			th.textContent = label;
			header.appendChild(th);
		}
		for (const report of reports) {
			const row = tableEl.insertRow();
			row.className = report.pass ? 'pass' : 'fail';
			const cells = [report.name, report.pass ? 'PASS' : 'FAIL', report.detail];
			for (const text of cells) {
				const td = row.insertCell();
				td.textContent = text;
			}
		}
	}
}

/**
 * Fetches the live golden index (never a hardcoded name list -- a golden
 * added under test/replays/ appears here with no rebuild), replays every
 * one, and renders PASS/FAIL. Exposed as `window.__replayParityRun()` for a
 * script/CDP caller and also runs once automatically on page load, unlike
 * Spike 1's own harness (which deliberately does NOT auto-run, to avoid
 * racing a measured sample) -- this page has no timing sample to protect,
 * so auto-running is the more useful default for a human opening the page.
 */
export async function runReplayParity(): Promise<readonly GoldenReport[]> {
	if (resultEl) {
		resultEl.textContent = 'Running…';
	}
	const names = await fetchJson<readonly string[]>('/dragonwar-goldens/index.json');
	if (names.length === 0) {
		throw new Error('no goldens found under test/replays/*.golden.json -- serve.mjs\'s index route returned an empty list');
	}
	const reports: GoldenReport[] = [];
	for (const name of names) {
		reports.push(await runOneGolden(name));
	}
	renderReports(reports);
	return reports;
}

declare global {
	interface Window {
		__replayParityRun: () => Promise<readonly GoldenReport[]>;
	}
}

if (typeof window !== 'undefined') {
	window.__replayParityRun = () =>
		runReplayParity().catch((err: unknown) => {
			if (resultEl) {
				resultEl.textContent = `Replay parity run failed: ${err instanceof Error ? err.message : String(err)}`;
			}
			throw err;
		});
	window.__replayParityRun();
}
