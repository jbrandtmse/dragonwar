// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// QA pass, Story 2.1f. The right-bat origin (`test/util/reachability.ts`'s
// `WITNESSES` entries `plunge-then-bat-r-3899/-3890/-3906`) is the ONLY
// thing that makes AC 1 (the Ramp) and AC 3 (the DRAGON bank) provable at
// all -- Story 2.1e shipped no witness that ever reached the right bat. A
// witness family this load-bearing must be shown to discriminate a REAL hit
// from a near-miss, not merely to exist and close its own declared switch
// once (already covered by `assertWitnessCorpusHealthy()`,
// `test/shot-reachability.test.ts:66`). This file duplicates the minimal
// serve/settle/plunge/flip mechanics of `replayWitness()`
// (`test/util/reachability.ts`) -- deliberately, in the same spirit as
// `test/fixtures/reachability/reachability-sweep.harness.ts`'s own
// duplication note: it needs to vary a parameter (`flip.atTick`) the fixed
// `WITNESSES` table does not expose, not to pay for a second abstraction.
// No witness here teleports: every trajectory is served by `c_trough_eject`
// and moved only by `frame.plunger` / `frame.flipper_r` (AD-6).
//
// Two claims, both from this story's own frontmatter `deferred:` and
// Design Notes ("where to spend effort"):
//
// 1. `dragon-targets-d-and-r-not-right-bat-reachable` -- the two westernmost
//    DRAGON targets are reached by their OWN witness (`plunge-then-bat-r-
//    3906`) but that flip tick (3906) is not itself a multiple of the dense
//    sweep's own 10-tick step from its 3780 origin
//    ((3906 - 3780) % 10 === 6), so the grid neighbours either side of it
//    (3900, 3910) are a real, present demonstration of "declared-and-
//    verified", not "independently rediscovered by a coarse search" -- the
//    exact distinction this story's QA stage was asked to pin.
// 2. The Ramp shot (AC 1/AC 2) is a precision window, not a wide target: a
//    flip 40 ticks late -- the same magnitude Story 2.1f's own Rule 19
//    demonstration for AC 2 used on the manifest witness -- must miss
//    `s_ramp_made` entirely rather than the assertion being vacuously
//    satisfied by any flip in the neighbourhood.

import { describe, expect, it } from 'vitest';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { NO_FRAME } from '../src/sim/loop';
import { resolveTuning } from '../src/sim/table/tuning';
import { fromPhysics } from '../src/sim/table/frames';
import { readCollisionDoc } from './util/collision-doc';
import { pointToSegmentDistanceMm } from './util/plan-geometry';
import { REACHABILITY_TOLERANCE_MM } from './util/reachability';
import { shotCase } from './util/shot-cases';
import type { InputFrame } from '../src/sim/contracts/input';
import type { CoilCommand, SwitchName } from '../src/sim/table/names';

interface Segment {
	readonly fromMm: { readonly x: number; readonly y: number };
	readonly toMm: { readonly x: number; readonly y: number };
}

interface FlipReplay {
	readonly segments: readonly Segment[];
	readonly closedSwitches: ReadonlySet<SwitchName>;
}

/**
 * The SAME serve (`c_trough_eject`) / settle (320 ticks) / plunge-hold /
 * flip mechanics `replayWitness()` uses (`test/util/reachability.ts`),
 * parameterised so this file can sweep `atTick` around a declared witness's
 * own value without editing the manifest. Never assigns `ball.state.pos` or
 * `ball.hit.vel` -- the ball's only inputs are `frame.plunger` and
 * `frame.flipper_r`.
 */
function replayRightBatFlip(plungeHoldTicks: number, atTick: number, holdTicks: number, ticksAfterRelease = 7000): FlipReplay {
	const tuning = resolveTuning();
	const machine: Machine = createMachine(readCollisionDoc(), tuning);
	let tick = 0;
	const segments: Segment[] = [];
	const closedSwitches = new Set<SwitchName>();
	let lastPosMm: { x: number; y: number } | null = null;

	function step(frame: InputFrame, commands: readonly CoilCommand[]): boolean {
		tick += 1;
		const result = machine.step(tick, frame, commands);
		for (const event of result.switchEvents) {
			if (event.closed) {
				closedSwitches.add(event.switch);
			}
		}
		const ball = machine.balls[0];
		if (!ball) {
			return false;
		}
		const posMm = fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
		const here = { x: posMm.x, y: posMm.y };
		if (lastPosMm) {
			segments.push({ fromMm: lastPosMm, toMm: here });
		}
		lastPosMm = here;
		return true;
	}

	for (let i = 0; i < 320; i++) {
		if (!step(NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick: tick + 1 }] : [])) {
			return { segments, closedSwitches };
		}
	}
	const held: InputFrame = { ...NO_FRAME, plunger: true };
	for (let i = 0; i < plungeHoldTicks; i++) {
		if (!step(held, [])) {
			return { segments, closedSwitches };
		}
	}
	for (let i = 0; i < ticksAfterRelease; i++) {
		const frame: InputFrame = i >= atTick && i < atTick + holdTicks ? { ...NO_FRAME, flipper_r: true } : NO_FRAME;
		if (!step(frame, [])) {
			break;
		}
	}
	return { segments, closedSwitches };
}

function closestApproachToMm(target: { readonly x: number; readonly y: number }, segments: readonly Segment[]): number {
	let min = Infinity;
	for (const seg of segments) {
		min = Math.min(min, pointToSegmentDistanceMm(target.x, target.y, seg.fromMm.x, seg.fromMm.y, seg.toMm.x, seg.toMm.y));
	}
	return min;
}

describe('right-bat witness precision (Story 2.1f QA) -- the Ramp shot is a timing window, not a wide target', () => {
	it('the declared witness recipe (285-tick plunge, right-bat flip at 3899, hold 60) closes s_ramp_enter then s_ramp_made -- sanity baseline this describe block\'s mutation is measured against', () => {
		const { closedSwitches } = replayRightBatFlip(285, 3899, 60);
		expect([...closedSwitches], 'the declared on-time flip must close s_ramp_enter').toContain('s_ramp_enter');
		expect([...closedSwitches], 'the declared on-time flip must close s_ramp_made').toContain('s_ramp_made');
	});

	// [MUTATION UNDER TEST -- keep in sync with the spec's own AC 2 Rule 19
	// mutation, `## Verification`: "change the right-bat witness's flip tick
	// by +40 ... the Ramp return misses the right inlane feed". That mutation
	// was demonstrated once, by hand, and reverted; this makes it a
	// permanent, always-run regression rather than a one-time demonstration.
	const LATE_TICK = 3899 + 40;
	it(`a flip ${LATE_TICK - 3899} ticks LATE (tick ${LATE_TICK} instead of 3899, same 60-tick hold) never closes s_ramp_made -- the shot is a precision window, and a late flip is a genuine miss, not a near-equivalent hit`, () => {
		const { closedSwitches } = replayRightBatFlip(285, LATE_TICK, 60);
		expect(
			[...closedSwitches],
			`a flip at tick ${LATE_TICK} closed: ${[...closedSwitches].join(', ') || '(nothing)'} -- if this now contains s_ramp_made, either the timing window widened (re-measure and update this test) or the mutation this test pins has been silently absorbed`,
		).not.toContain('s_ramp_made');
	});
});

describe('DRAGON targets d/r (Story 2.1f QA, deferred: dragon-targets-d-and-r-not-right-bat-reachable) -- declared-and-verified via their own witness, not independently rediscovered by the dense sweep\'s 10-tick grid', () => {
	// plunge-then-bat-r-3906's own atTick (3906) is not itself on the sweep's
	// 10-tick-step grid from 3780 (3906 - 3780 = 126, not a multiple of 10).
	// The nearest grid points either side are 3900 and 3910. If either of
	// those reached d or r within tolerance, the deferred entry's own claim
	// -- that only the exact declared witness, not the surrounding grid,
	// proves these two -- would be false and the entry stale.
	const GRID_NEIGHBOURS = [3900, 3910] as const;
	const TARGETS = ['dragon-target-d', 'dragon-target-r'] as const;

	it('the declared witness (285-tick plunge, right-bat flip at 3906, hold 60) reaches both d and r within tolerance -- sanity baseline', () => {
		const { segments } = replayRightBatFlip(285, 3906, 60);
		for (const id of TARGETS) {
			const startMm = shotCase(id).startMm;
			const distanceMm = closestApproachToMm(startMm, segments);
			expect(distanceMm, `witness at tick 3906 should reach "${id}" within ${REACHABILITY_TOLERANCE_MM} mm, measured ${distanceMm.toFixed(3)} mm`).toBeLessThanOrEqual(REACHABILITY_TOLERANCE_MM);
		}
	});

	it.each(GRID_NEIGHBOURS.flatMap((atTick) => TARGETS.map((id) => [atTick, id] as const)))(
		'grid neighbour tick %i (10-tick step from the sweep\'s own 3780 origin, hold 60) does NOT reach "%s" within tolerance -- the sweep\'s coarse grid cannot rediscover this target on its own',
		(atTick, id) => {
			const { segments } = replayRightBatFlip(285, atTick, 60);
			const startMm = shotCase(id).startMm;
			const distanceMm = closestApproachToMm(startMm, segments);
			expect(
				distanceMm,
				`grid-neighbour tick ${atTick} came within ${distanceMm.toFixed(3)} mm of "${id}" (tolerance ${REACHABILITY_TOLERANCE_MM} mm) -- if this is now <= tolerance, the target IS grid-reachable and the "dragon-targets-d-and-r-not-right-bat-reachable" deferred entry is stale and should be closed, not silently outrun`,
			).toBeGreaterThan(REACHABILITY_TOLERANCE_MM);
		},
	);
});
