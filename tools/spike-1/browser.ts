// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.1, Spike 1 — the browser leg. Served at tools/spike-1/index.html, from a
// PRODUCTION build (`vite build` + `vite preview`) for any number meant to gate --
// the amended AC bans a dev-page figure from setting TICK_HZ. `vite dev` serves the
// same page and is fine for iterating, just not for the recorded measurement.
//
// `performance` and `requestAnimationFrame` live here, not in sim/, per AD-3
// ("all timing code lives outside src/sim/").
//
// 60 warm-up frames are discarded, then 600 measured frames of `STEPS_PER_FRAME_60HZ`
// steps each are timed with `performance.now()` around the step calls only (no DOM
// work in the sample). `window.__spike1Run()` is what `tools/spike-1/measure.mjs`
// (and the chrome-devtools-mcp fallback) call via CDP; this file also renders the
// result to the page for a human looking at the served page directly.

import { createSpikeScene, step, STEPS_PER_FRAME_60HZ, type SpikeScene } from './scene';

const WARMUP_FRAMES = 60;
const MEASURED_FRAMES = 600;
const MAX_FRAME_DELTA_MS = 100; // per-frame background-throttle guard, see the I/O matrix
// DW-16: the per-frame 100ms guard missed MODERATE throttling -- a browser
// reporting `visible`/`focused` while actually running rAF at 28.9 fps
// (34.6ms/frame) sailed straight through it, inflating the recorded p95 about
// 2.7x. 20ms is authored: 60 fps is a 16.67ms delta, 20ms leaves about 20%
// slack, and 34.6ms is rejected comfortably. Checked once per run, on the
// MEDIAN of every inter-frame delta -- not per-frame, so one legitimate GC
// pause mid-run doesn't fail an otherwise-healthy run the way tightening
// MAX_FRAME_DELTA_MS itself would.
const MEDIAN_FRAME_DELTA_MS = 20;

export interface Spike1Result {
	samples: number;
	p95Ms: number;
	meanMs: number;
	warmupFrames: number;
	stepsPerFrame: number;
	/** DW-16: the measured window's median inter-frame rAF delta, reported beside every p95. */
	medianFrameDeltaMs: number;
}

// Exported (not just used internally) so it can be unit-tested directly under
// Node — see test/spike-1-browser-guard.test.ts — rather than only indirectly,
// through a live browser's window.__spike1Run(), which is where the PASS/FAIL
// verdict's numbers actually come from.
export function nearestRankP95(sortedAscending: number[]): number {
	return sortedAscending[Math.ceil(0.95 * sortedAscending.length) - 1];
}

// Exported for the same reason as nearestRankP95 above: test/spike-1-browser-guard.test.ts
// asserts it directly against a known-correct expected value rather than only
// indirectly through a live run.
export function median(sortedAscending: number[]): number {
	const n = sortedAscending.length;
	if (n === 0) {
		return 0;
	}
	const mid = Math.floor(n / 2);
	return n % 2 === 0 ? (sortedAscending[mid - 1] + sortedAscending[mid]) / 2 : sortedAscending[mid];
}

export interface RunFramesResult {
	/** DW-16: median of every inter-frame rAF delta observed during this run, ms. */
	medianFrameDeltaMs: number;
}

/**
 * Runs `frameCount` requestAnimationFrame-paced frames of `STEPS_PER_FRAME_60HZ`
 * physics steps each. When `collectInto` is given, each frame's step-only wall-clock
 * cost (ms) is pushed into it. Rejects if any inter-frame delta exceeds
 * `MAX_FRAME_DELTA_MS` — a backgrounded/occluded window throttles
 * requestAnimationFrame and would otherwise silently ruin the numbers -- or if
 * the whole run's MEDIAN inter-frame delta exceeds `MEDIAN_FRAME_DELTA_MS`
 * (DW-16), checked once the run completes rather than per-frame.
 */
export function runFrames(scene: SpikeScene, frameCount: number, collectInto: number[] | null): Promise<RunFramesResult> {
	return new Promise((resolve, reject) => {
		let framesDone = 0;
		let lastTimestamp: number | null = null;
		const deltas: number[] = [];

		function onFrame(timestamp: number): void {
			if (lastTimestamp !== null) {
				const delta = timestamp - lastTimestamp;
				if (delta > MAX_FRAME_DELTA_MS) {
					reject(new Error(
						`frame ${framesDone}: rAF delta ${delta.toFixed(1)}ms exceeded ${MAX_FRAME_DELTA_MS}ms — ` +
						`the window was likely backgrounded or occluded, throttling requestAnimationFrame. ` +
						`Re-run foregrounded.`,
					));
					return;
				}
				deltas.push(delta);
			}
			lastTimestamp = timestamp;

			const start = performance.now();
			for (let i = 0; i < STEPS_PER_FRAME_60HZ; i++) {
				step(scene);
			}
			const elapsedMs = performance.now() - start;

			if (collectInto) {
				collectInto.push(elapsedMs);
			}

			framesDone++;
			if (framesDone >= frameCount) {
				const medianFrameDeltaMs = median([...deltas].sort((a, b) => a - b));
				if (deltas.length > 0 && medianFrameDeltaMs > MEDIAN_FRAME_DELTA_MS) {
					reject(new Error(
						`median rAF delta ${medianFrameDeltaMs.toFixed(1)}ms exceeded ${MEDIAN_FRAME_DELTA_MS}ms ` +
						`over ${framesDone} frames \u2014 the window was likely throttled below the per-frame guard's ` +
						`${MAX_FRAME_DELTA_MS}ms threshold. Re-run foregrounded.`,
					));
					return;
				}
				resolve({ medianFrameDeltaMs });
			} else {
				requestAnimationFrame(onFrame);
			}
		}

		requestAnimationFrame(onFrame);
	});
}

// `typeof document !== 'undefined'` guards let `runFrames` above be imported and
// unit-tested under Vitest's Node environment (see test/spike-1-browser-guard.test.ts,
// covering the background-throttle guard row of the I/O matrix) without this
// module's page-wiring side effects throwing on import outside a real browser.
const resultEl = typeof document !== 'undefined' ? document.getElementById('result') : null;
if (resultEl) {
	resultEl.textContent = `Spike 1 harness ready (${STEPS_PER_FRAME_60HZ} steps/frame). ` +
		`Call window.__spike1Run() from the console, or run tools/spike-1/measure.mjs, to measure.`;
}

/**
 * Runs the 60-warm-up / 600-measured-frame harness once and renders the result on
 * the page as a side effect of resolving — the single call both `measure.mjs` and
 * the chrome-devtools-mcp fallback make. Deliberately not invoked automatically on
 * page load: each caller is expected to call it exactly once per fresh page load,
 * and an unprompted auto-run here would race a second harness instance against
 * whichever run is actually being measured, corrupting the sample.
 */
export async function runSpike1(): Promise<Spike1Result> {
	const scene = createSpikeScene();

	await runFrames(scene, WARMUP_FRAMES, null);

	const samples: number[] = [];
	const { medianFrameDeltaMs } = await runFrames(scene, MEASURED_FRAMES, samples);

	if (samples.length !== MEASURED_FRAMES) {
		throw new Error(`expected ${MEASURED_FRAMES} samples, got ${samples.length}`);
	}

	const sorted = [...samples].sort((a, b) => a - b);
	const p95Ms = nearestRankP95(sorted);
	const meanMs = samples.reduce((sum, v) => sum + v, 0) / samples.length;

	const result: Spike1Result = {
		samples: samples.length,
		p95Ms,
		meanMs,
		warmupFrames: WARMUP_FRAMES,
		stepsPerFrame: STEPS_PER_FRAME_60HZ,
		medianFrameDeltaMs,
	};

	if (resultEl) {
		resultEl.textContent =
			`samples=${result.samples} p95Ms=${result.p95Ms.toFixed(4)} meanMs=${result.meanMs.toFixed(4)} ` +
			`stepsPerFrame=${result.stepsPerFrame} warmupFrames=${result.warmupFrames} ` +
			`medianFrameDeltaMs=${result.medianFrameDeltaMs.toFixed(2)}`;
	}

	return result;
}

declare global {
	interface Window {
		__spike1Run: () => Promise<Spike1Result>;
	}
}

if (typeof window !== 'undefined') {
	window.__spike1Run = () => runSpike1().catch((err: unknown) => {
		if (resultEl) {
			resultEl.textContent = `Spike 1 run failed: ${err instanceof Error ? err.message : String(err)}`;
		}
		throw err;
	});
}
