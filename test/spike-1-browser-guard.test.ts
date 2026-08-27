// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.1, Spike 1 — unit coverage for `tools/spike-1/browser.ts` pieces that
// only a live browser tab exercises end-to-end:
//
// 1. The "Background-throttle guard" row of the I/O & Edge-Case Matrix.
//    `runFrames()` rejects a run when an inter-frame `requestAnimationFrame`
//    delta exceeds 100ms (a backgrounded/occluded window throttling rAF). That
//    path is only reachable from a real browser tab in normal operation, so this
//    test drives it directly with a fake `requestAnimationFrame` feeding a
//    controlled timestamp sequence, rather than actually backgrounding a window.
// 2. `nearestRankP95()` — the function `runSpike1()` uses to compute the p95
//    figure that `docs/spikes/spike-1.md`'s PASS/FAIL verdict (and, through it,
//    `TICK_HZ`) is set from. Otherwise this formula is checked only by eyeballing
//    a manually-run browser measurement, never by an automated assertion against
//    a known-correct expected value.

import { afterEach, describe, expect, it } from 'vitest';
import { nearestRankP95, runFrames } from '../tools/spike-1/browser';
import { createSpikeScene } from '../tools/spike-1/scene';

type RafCallback = (timestamp: number) => void;

function installFakeRaf(timestamps: number[]): () => void {
	const original = globalThis.requestAnimationFrame;
	let call = 0;
	globalThis.requestAnimationFrame = ((cb: RafCallback) => {
		const ts = timestamps[call++];
		setTimeout(() => cb(ts), 0);
		return 0;
	}) as typeof requestAnimationFrame;
	return () => {
		globalThis.requestAnimationFrame = original;
	};
}

describe('Spike 1 browser harness — background-throttle guard (I/O matrix)', () => {
	afterEach(() => {
		// installFakeRaf's own restore covers the success path; this is a backstop
		// in case a test throws before calling it.
		delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
	});

	it('rejects the run when an inter-frame rAF delta exceeds 100ms, naming the frame', async () => {
		const scene = createSpikeScene();
		// frame 0 -> frame 1: 16.7ms (normal). frame 1 -> frame 2: 133.3ms (throttled).
		const restore = installFakeRaf([0, 16.7, 150]);
		try {
			await expect(runFrames(scene, 3, null)).rejects.toThrow(
				/frame 2: rAF delta 133\.3ms exceeded 100ms/,
			);
		} finally {
			restore();
		}
	});

	it('does not reject when every inter-frame delta stays within 100ms', async () => {
		const scene = createSpikeScene();
		const restore = installFakeRaf([0, 16.7, 33.4, 50.1]);
		try {
			await expect(runFrames(scene, 4, null)).resolves.toBeUndefined();
		} finally {
			restore();
		}
	});
});

describe('Spike 1 browser harness — nearestRankP95()', () => {
	it('picks the nearest-rank p95 element (sorted[ceil(0.95*n)-1]) for a known 600-sample array', () => {
		// Matches the browser leg's n=600, index 569 — see docs/spikes/spike-1.md's
		// "p95 method". Values 0..599 (already sorted): index 569's value is 569.
		const sorted = Array.from({ length: 600 }, (_, i) => i);
		expect(nearestRankP95(sorted)).toBe(569);
	});

	it('picks the nearest-rank p95 element for a small, hand-checkable array', () => {
		// n=20: ceil(0.95*20)-1 = 18 (0-indexed) -> the 19th smallest value.
		const sorted = Array.from({ length: 20 }, (_, i) => (i + 1) * 10); // 10, 20, ..., 200
		expect(nearestRankP95(sorted)).toBe(190);
	});
});
