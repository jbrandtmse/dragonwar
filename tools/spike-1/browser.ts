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
const MAX_FRAME_DELTA_MS = 100; // background-throttle guard, see the I/O matrix

export interface Spike1Result {
	samples: number;
	p95Ms: number;
	meanMs: number;
	warmupFrames: number;
	stepsPerFrame: number;
}

// Exported (not just used internally) so it can be unit-tested directly under
// Node — see test/spike-1-browser-guard.test.ts — rather than only indirectly,
// through a live browser's window.__spike1Run(), which is where the PASS/FAIL
// verdict's numbers actually come from.
export function nearestRankP95(sortedAscending: number[]): number {
	return sortedAscending[Math.ceil(0.95 * sortedAscending.length) - 1];
}

/**
 * Runs `frameCount` requestAnimationFrame-paced frames of `STEPS_PER_FRAME_60HZ`
 * physics steps each. When `collectInto` is given, each frame's step-only wall-clock
 * cost (ms) is pushed into it. Rejects if any inter-frame delta exceeds
 * `MAX_FRAME_DELTA_MS` — a backgrounded/occluded window throttles
 * requestAnimationFrame and would otherwise silently ruin the numbers.
 */
export function runFrames(scene: SpikeScene, frameCount: number, collectInto: number[] | null): Promise<void> {
	return new Promise((resolve, reject) => {
		let framesDone = 0;
		let lastTimestamp: number | null = null;

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
				resolve();
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
	await runFrames(scene, MEASURED_FRAMES, samples);

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
	};

	if (resultEl) {
		resultEl.textContent =
			`samples=${result.samples} p95Ms=${result.p95Ms.toFixed(4)} meanMs=${result.meanMs.toFixed(4)} ` +
			`stepsPerFrame=${result.stepsPerFrame} warmupFrames=${result.warmupFrames}`;
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
