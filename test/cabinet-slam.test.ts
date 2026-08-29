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

// QA audit (2026-08-29): the AC 5(a) test above only asserted
// slamEdges.length >= 1 and the FIRST edge's polarity -- it never checked
// that s_slam_tilt re-OPENS exactly once, nor exercised a level that rises,
// falls and rises again (AD-2's "exactly one closing edge and exactly one
// opening edge" claim, for a level that FLICKERS across tick boundaries
// driven by the trailing window's own prune arithmetic -- not just a single
// sustained crossing). `test/cabinet-bob.test.ts` already proves this
// independent-oracle shape for the bob; this block proves the SAME
// edge-collapsing code path (`cabinet/index.ts`'s `stepLevel()`, shared by
// both switches) is equally correct for the slam detector, which had no
// oracle-based coverage at all.
describe('sim/physics/cabinet -- AD-2 edge collapsing for s_slam_tilt (independent oracle), including a level that flickers across tick boundaries', () => {
	/** Same independent-oracle transform test/cabinet-bob.test.ts already uses: derives the edge sequence a correct settleTicks-0 edge-collapser must produce from a raw per-tick level series. Diffs consecutive booleans -- a generic, obviously-correct utility, not a copy of the collapsing logic under test. */
	function edgesFromLevels(levels: readonly boolean[]): Array<{ closed: boolean; tick: number }> {
		const edges: Array<{ closed: boolean; tick: number }> = [];
		let previous = false;
		for (let i = 0; i < levels.length; i++) {
			if (levels[i] !== previous) {
				edges.push({ closed: levels[i], tick: i + 1 });
				previous = levels[i];
			}
		}
		return edges;
	}

	it('a hand-verified two-cycle flicker (threshold 2 edges / 3-tick window, both overridden -- see this test\'s own header for the tick-by-tick trace) produces an emitted s_slam_tilt sequence that equals, in order, the edge sequence derived independently from the raw per-tick level -- proving one closing edge in, one opening edge out, even when a transition is driven purely by the trailing window aging an edge out rather than by a new edge arriving', () => {
		// Overridden ONLY for this test (the same test-local technique AC
		// 5(b) above already uses on tiltBob.thresholdDeg): slamNudgesPerWindow
		// -> 2 and slamNudgeWindowMs -> 3 (= 3 ticks at TICK_HZ 1000). This
		// makes a fast, deterministic, hand-verifiable flicker constructible
		// from a handful of individual nudge edges; the production values
		// (3 edges / 500-tick window) are already exercised by AC 5(a)/(b)
		// above and by the same-tick multi-nudge test below.
		//
		// Edge schedule (a DIFFERENT nudge action per closely-spaced edge, so
		// each is its own rising edge regardless of any other action's held
		// state -- nudge_l @1, nudge_r @2, nudge_up @3, nudge_l @6, nudge_r @7):
		//   tick 1: edgeTicks=[1]            len1 -> false
		//   tick 2: edgeTicks=[1,2]          len2 -> TRUE   (close @2)
		//   tick 3: edgeTicks=[1,2,3]        len3 -> true   (still true)
		//   tick 4: prune 1 (4-1=3>=3)  -> [2,3]      len2 -> true   (still true)
		//   tick 5: prune 2 (5-2=3>=3)  -> [3]        len1 -> FALSE  (open @5)
		//   tick 6: push 6, prune 3 (6-3=3>=3) -> [6]      len1 -> still false
		//   tick 7: push 7 (7-6=1<3)    -> [6,7]      len2 -> TRUE   (close @7)
		//   tick 8: (8-6=2<3)           -> [6,7]      len2 -> still true
		//   tick 9: prune 6 (9-6=3>=3)  -> [7]        len1 -> FALSE  (open @9)
		//   tick 10+: decays to [] and stays false
		const overridden = {
			...TUNING,
			slamNudgesPerWindow: { ...TUNING.slamNudgesPerWindow, value: 2 },
			slamNudgeWindowMs: { ...TUNING.slamNudgeWindowMs, value: 3 },
		};
		const tuning = resolveTuning(overridden as typeof TUNING);
		expect(tuning.slamNudgeWindowTicks.value, 'sanity: the override resolves to a 3-tick window at TICK_HZ 1000').toBe(3);
		const { cabinetMechanics } = buildHarness(tuning);

		const frames = new Map<number, InputFrame>([
			[1, { ...NO_FRAME, nudge_l: true }],
			[2, { ...NO_FRAME, nudge_r: true }],
			[3, { ...NO_FRAME, nudge_up: true }],
			[6, { ...NO_FRAME, nudge_l: true }],
			[7, { ...NO_FRAME, nudge_r: true }],
		]);

		const levels: boolean[] = [];
		const emittedEdges: Array<{ closed: boolean; tick: number }> = [];
		for (let tick = 1; tick <= 15; tick++) {
			const result = cabinetMechanics.applyFrame(tick, frames.get(tick) ?? NO_FRAME);
			levels.push(cabinetMechanics.state.slamOverThreshold);
			for (const edge of result.switchEvents) {
				if (edge.switch === 's_slam_tilt') emittedEdges.push({ closed: edge.closed, tick: edge.tick });
			}
		}

		// The raw level series must match the hand-verified trace exactly, or
		// the rest of this test proves nothing about the ARRANGE.
		expect(levels, 'the raw per-tick level must match the hand-verified trace in this test\'s own header').toEqual([
			false, true, true, true, false, false, true, true, false, false, false, false, false, false, false,
		]);

		const expectedEdges = edgesFromLevels(levels);
		expect(expectedEdges, 'sanity: this arrange must produce a two-cycle flicker (4 edges), or the test proves nothing').toEqual([
			{ closed: true, tick: 2 },
			{ closed: false, tick: 5 },
			{ closed: true, tick: 7 },
			{ closed: false, tick: 9 },
		]);

		// (b) ordered equality against the independently-derived oracle --
		// the actual claim: the emitter produces exactly this sequence, no
		// more, no fewer, in this exact order.
		expect(emittedEdges).toEqual(expectedEdges);

		// (c) strict alternation, starting closed:true.
		expect(emittedEdges[0]!.closed).toBe(true);
		for (let i = 1; i < emittedEdges.length; i++) {
			expect(emittedEdges[i]!.closed, `edge ${i} must alternate polarity from edge ${i - 1}`).toBe(!emittedEdges[i - 1]!.closed);
		}
	});
});

// QA audit (2026-08-29): ledger DW-83 ("no test exercises two nudge actions
// with rising edges on the same tick") -- partial coverage. The facade's
// per-tick loop (`cabinet/index.ts`'s applyFrame()) walks all three nudge
// actions and increments a SHARED edgeCount for every action that rises
// THIS tick, then feeds that one edgeCount to `slamDetector.recordEdges()`
// in a single call. This proves multiple same-tick rising edges are each
// individually credited (not capped at one edge per tick, a plausible
// regression) -- cheap to cover here per this story's own QA priorities;
// does not replace DW-83's broader remaining scope (still routed to Story
// 1.8), which also covers the ball-coupling side (see
// test/cabinet-nudge.test.ts's own DW-83-labelled additions).
describe('sim/physics/cabinet -- DW-83 partial coverage: same-tick multi-nudge credited to the slam window', () => {
	it('THREE simultaneous nudge-action rising edges in the SAME tick (nudge_l + nudge_r + nudge_up all true on tick 1) immediately satisfy slamNudgesPerWindow=3 and close s_slam_tilt on that one tick -- not spread across three separate ticks', () => {
		const { cabinetMechanics, tuning } = buildHarness();
		expect(tuning.slamNudgesPerWindow.value, 'sanity: production threshold').toBe(3);

		const diagonalFrame: InputFrame = { ...NO_FRAME, nudge_l: true, nudge_r: true, nudge_up: true };
		const result = cabinetMechanics.applyFrame(1, diagonalFrame);

		expect(cabinetMechanics.state.slamOverThreshold, 'three simultaneous rising edges in ONE tick must immediately satisfy slamNudgesPerWindow=3 -- if same-tick edges were capped at one, this would still be false after tick 1').toBe(true);
		expect(result.switchEvents).toEqual([{ type: 'switch', switch: 's_slam_tilt', closed: true, tick: 1 }]);
	});
});
