// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.7's AC 5 (the slam sensor is independent of the bob), both
// directions, plus their mutations. `sim/physics/cabinet/slam.ts` holds no
// reference to the bob, its threshold or its state at all (structural
// independence -- read the file); this suite proves that independence is
// OBSERVABLE at the emitting seam (`createCabinetMechanics().applyFrame()`),
// not merely assumed from reading the source.

import { describe, expect, it } from 'vitest';
import { PlayerPhysics } from '../src/sim/physics/game/player-physics';
import { createCabinetMechanics } from '../src/sim/physics/cabinet';
import { NO_FRAME } from '../src/sim/loop';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import type { InputFrame } from '../src/sim/contracts/input';

function buildHarness(tuning = resolveTuning()) {
	const physics = new PlayerPhysics();
	const cabinetMechanics = createCabinetMechanics({ physics, tuning });
	return { cabinetMechanics, tuning };
}

function runFrames(cabinetMechanics: ReturnType<typeof buildHarness>['cabinetMechanics'], frames: ReadonlyMap<number, InputFrame>, totalTicks: number) {
	const slamEdges: Array<{ closed: boolean; tick: number }> = [];
	const bobEdges: Array<{ closed: boolean; tick: number }> = [];
	const bobLevels: boolean[] = [];
	for (let tick = 1; tick <= totalTicks; tick++) {
		const result = cabinetMechanics.applyFrame(tick, frames.get(tick) ?? NO_FRAME);
		bobLevels.push(cabinetMechanics.state.bob.isOverThreshold);
		for (const edge of result.switchEvents) {
			if (edge.switch === 's_slam_tilt') slamEdges.push({ closed: edge.closed, tick: edge.tick });
			if (edge.switch === 's_tilt_bob') bobEdges.push({ closed: edge.closed, tick: edge.tick });
		}
	}
	return { slamEdges, bobEdges, bobLevels };
}

describe('sim/physics/cabinet -- AC 5(a): slamNudgesPerWindow edges inside the window close s_slam_tilt while the bob (arranged to never cross) never closes', () => {
	it('3 nudge_up edges, widely spaced inside the 500-tick window (each individually too small to move the bob past its own, production threshold) -- slam closes, bob never does', () => {
		const { cabinetMechanics, tuning } = buildHarness();
		expect(tuning.slamNudgesPerWindow.value, 'sanity: this test is built around the production threshold count').toBe(3);
		expect(tuning.slamNudgeWindowTicks.value, 'sanity: this test is built around the production window').toBe(500);

		// Ticks 1, 250, 499: all inside any 500-tick trailing window ending at
		// or after tick 499 (499 - 1 = 498 < 500), and spaced far enough apart
		// that each nudge's own swing has almost fully decayed before the
		// next arrives (measured: a single nudge_up peaks at ~1.05 deg and
		// this exact three-nudge spacing measures a peak of ~1.05 deg too,
		// safely under thresholdDeg 1.3 -- see test/cabinet-nudge.test.ts and
		// this story's tuning `source` strings for the underlying
		// measurements). This spacing is deliberate, not arbitrary: closer
		// spacings compound constructively and DO cross the bob's threshold
		// (that compounding is exactly what test/cabinet-bob.test.ts's AC 3
		// burst exploits) -- this row exists to show that spacing ALONE, not
		// a different threshold, keeps the bob clear while still delivering
		// slamNudgesPerWindow edges inside the window.
		const frames = new Map<number, InputFrame>([
			[1, { ...NO_FRAME, nudge_up: true }],
			[2, NO_FRAME],
			[250, { ...NO_FRAME, nudge_up: true }],
			[251, NO_FRAME],
			[499, { ...NO_FRAME, nudge_up: true }],
			[500, NO_FRAME],
		]);
		const { slamEdges, bobEdges, bobLevels } = runFrames(cabinetMechanics, frames, 2000);

		// The bob's ACTUAL level is asserted, not merely "no edge fired" --
		// per the spec, "both runs assert the bob's actual level, so neither
		// is vacuous".
		expect(bobLevels.some(Boolean), 'the bob must never be over threshold in this run').toBe(false);
		expect(bobEdges, 's_tilt_bob must never close in this run').toEqual([]);

		expect(slamEdges.length, 's_slam_tilt must close exactly once (and re-open once, as the window empties)').toBeGreaterThanOrEqual(1);
		expect(slamEdges[0], 's_slam_tilt must close (closed:true) once the third edge lands inside the window').toMatchObject({ closed: true });
	});
});

describe('sim/physics/cabinet -- slam window expiry (I/O matrix)', () => {
	it('2 nudge edges inside the window, a third after it (window has expired) -- s_slam_tilt does not close', () => {
		const { cabinetMechanics, tuning } = buildHarness();
		const windowTicks = tuning.slamNudgeWindowTicks.value;
		// Edges at tick 1 and tick 2 (well inside any window), then a third
		// at tick `windowTicks + 50` -- by then the first two have long since
		// aged out of the trailing window (slam.ts prunes on every call), so
		// at most ONE edge is ever in-window at a time; never 3.
		const frames = new Map<number, InputFrame>([
			[1, { ...NO_FRAME, nudge_l: true }],
			[2, NO_FRAME],
			[3, { ...NO_FRAME, nudge_r: true }],
			[4, NO_FRAME],
			[windowTicks + 50, { ...NO_FRAME, nudge_l: true }],
			[windowTicks + 51, NO_FRAME],
		]);
		const { slamEdges } = runFrames(cabinetMechanics, frames, windowTicks + 200);
		expect(slamEdges, 's_slam_tilt must never close -- the window expired before the third edge arrived').toEqual([]);
	});
});

describe('sim/physics/cabinet -- AC 5(b): the bob held past threshold for the whole window, with FEWER than slamNudgesPerWindow edges, does not close s_slam_tilt', () => {
	it('bob threshold overridden low enough that 2 edges (< 3) hold it over threshold for the whole 500-tick window -- s_slam_tilt never closes', () => {
		// A test-local tuning override on `tiltBob.thresholdDeg` ONLY --
		// `slamNudgesPerWindow` / `slamNudgeWindowTicks` stay at their
		// production values. This is legitimate: AC 5(b) is testing the SLAM
		// DETECTOR's structural independence from the bob (it holds no bob
		// reference at all -- read slam.ts), not the production threshold's
		// exact value. A low override is what makes "held past threshold for
		// the whole window" constructible with only two real nudge edges,
		// without which this direction of AC 5 could not be exercised at all
		// (the production threshold needs a much larger, sustained-energy
		// burst -- see test/cabinet-bob.test.ts's AC 3 arrangement -- to
		// cross, and that burst alone is already >= slamNudgesPerWindow
		// edges, which would make THIS direction's "fewer than" arrange
		// impossible to build against the production number).
		const overridden = {
			...TUNING,
			tiltBob: { ...TUNING.tiltBob, thresholdDeg: { ...TUNING.tiltBob.thresholdDeg, value: 0.02 } },
		};
		const tuning = resolveTuning(overridden as typeof TUNING);
		expect(tuning.slamNudgesPerWindow.value, 'sanity: slamNudgesPerWindow is UNCHANGED by the bob-only override').toBe(3);
		const { cabinetMechanics } = buildHarness(tuning);

		const frames = new Map<number, InputFrame>([
			[1, { ...NO_FRAME, nudge_up: true }],
			[2, NO_FRAME],
			[250, { ...NO_FRAME, nudge_up: true }],
			[251, NO_FRAME],
		]);
		const { slamEdges, bobLevels } = runFrames(cabinetMechanics, frames, 500);

		// The bob's ACTUAL level is asserted -- held over threshold for the
		// whole window (from shortly after the first nudge takes effect
		// through the window's own end), not merely "no slam edge fired".
		expect(bobLevels.slice(9, 500).every(Boolean), 'the bob must be held over threshold for (essentially) the whole 500-tick window').toBe(true);

		expect(slamEdges, 's_slam_tilt must never close -- only 2 edges occurred, fewer than slamNudgesPerWindow (3), regardless of the bob\'s own (asserted, genuinely over-threshold) state').toEqual([]);
	});
});
