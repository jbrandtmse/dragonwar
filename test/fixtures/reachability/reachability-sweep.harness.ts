// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1e, `pnpm check:reachability` -- the DENSE, out-of-process search
// that proves a negative, mirroring
// test/fixtures/dw137-corridor/ramp-corridor.harness.ts's own file shape and
// header conventions (DW-137's own precedent) but INTENDED GREEN: unlike
// that harness (and test/fixtures/dw70-ad7/ad7-device-slots.harness.ts),
// this one is not documenting a known, live defect -- it is the expensive
// confirmation that the small in-suite witness set
// (`test/util/reachability.ts`'s own `WITNESSES`) is not a lucky guess.
//
// What this sweeps that the in-suite set does not: every ORIGIN parameter
// this codebase's real input paths expose --
//   - plunge STRENGTH: `plungerHoldTicks` from a bare tap through well past
//     `plungerMaxHoldTicks` (500), far more densely than the in-suite set's
//     three values (285, 345, 521) -- three genuinely different fates
//     (285: ascends the RIGHT lane and falls back; 345: enters the LEFT
//     Loop lane and falls back; 521: completes the crossing and descends
//     the left lane), so the strength axis is swept with a fine step
//     through the 240-380 window that DISCOVERED 285's own fate, not
//     merely sampled at a few hand-picked points.
//   - LEFT-bat flip timing and hold, densely, over the full window the
//     ball is ever within the bat's reach (measured this story's own
//     planning pass: relative tick ~3650-4300 after the plunge releases;
//     outside that window a flip provably changes nothing, confirmed by
//     this same sweep's own earlier, wider passes).
//
// What it deliberately does NOT sweep, and why (state it, don't hide it):
// a RIGHT-bat flip. `bd_shooter` (the only serve device) has exactly one
// exit -- the manual plunge / `pulse c_autolaunch`, AD-6's "one code path"
// -- and no swept plunge strength ever delivers the ball onto the RIGHT
// bat: a full-strength plunge completes the crossing and descends onto the
// LEFT bat; weaker ones fall back part-way down whichever lane they were
// last climbing (285: down the right OUTLANE, past the flipper entirely;
// 345: down the left lane, short of the left bat) -- measured, not
// assumed, across every plunge strength this file sweeps (including the
// fine 240-380 window that discovered 285's own right-lane fate). A
// "right-bat flip" witness would therefore have no ball ever near the
// right bat to flip -- a vacuous sweep axis, not a real search. This is
// this story's own most significant finding and is recorded in the spec's
// own Spec Change Log and frontmatter `deferred:` list, not buried here.
//
// This story's own charter (Design Notes, "Alternatives considered and
// rejected") is explicit: DW-137 and DW-136 are NOT this harness's to fix.
// It reports; Story 2.1f (the Ramp/corridor) and the lead (everything else
// this sweep confirms unreached) decide what happens next.

import { describe, expect, it } from 'vitest';
import { createMachine, type Machine } from '../../../src/sim/physics/machine';
import { NO_FRAME } from '../../../src/sim/loop';
import { resolveTuning } from '../../../src/sim/table/tuning';
import { fromPhysics } from '../../../src/sim/table/frames';
import { TABLE } from '../../../src/sim/table/dragonwar';
import { readCollisionDoc } from '../../util/collision-doc';
import { pointToSegmentDistanceMm } from '../../util/plan-geometry';
import { SHOT_CASES, MIN_SHOT_CASES, shotCase } from '../../util/shot-cases';
import type { InputFrame } from '../../../src/sim/contracts/input';
import type { CoilCommand } from '../../../src/sim/table/names';

const REACHABILITY_TOLERANCE_MM = TABLE.reference.ballMm / 2;

interface Segment {
	readonly fromMm: { readonly x: number; readonly y: number };
	readonly toMm: { readonly x: number; readonly y: number };
}

interface ReleaseRecipe {
	readonly plungeHoldTicks: number;
	readonly flip?: { readonly atTick: number; readonly holdTicks: number };
}

/**
 * One release: serve, settle, hold the plunger for `recipe.plungeHoldTicks`,
 * release, optionally flip the LEFT bat at `recipe.flip`, and run out --
 * returning every per-tick swept segment. The SAME serve/settle/plunge
 * mechanics `test/util/reachability.ts`'s own `witnessPath()` uses (never a
 * teleport), duplicated here rather than imported: this file sweeps
 * hundreds of releases per run and must not pay `witnessPath()`'s own
 * per-id memoisation overhead or its fixed `WITNESSES` table shape for a
 * search that varies every parameter it fixes.
 */
function sweepOneRelease(recipe: ReleaseRecipe, ticksAfterRelease: number): readonly Segment[] {
	const tuning = resolveTuning();
	const machine: Machine = createMachine(readCollisionDoc(), tuning);
	let tick = 0;
	const segments: Segment[] = [];
	let lastPosMm: { x: number; y: number } | null = null;

	function step(frame: InputFrame, commands: readonly CoilCommand[]): boolean {
		tick += 1;
		machine.step(tick, frame, commands);
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
			return segments;
		}
	}
	const held: InputFrame = { ...NO_FRAME, plunger: true };
	for (let i = 0; i < recipe.plungeHoldTicks; i++) {
		if (!step(held, [])) {
			return segments;
		}
	}
	for (let i = 0; i < ticksAfterRelease; i++) {
		let frame: InputFrame = NO_FRAME;
		if (recipe.flip && i >= recipe.flip.atTick && i < recipe.flip.atTick + recipe.flip.holdTicks) {
			frame = { ...NO_FRAME, flipper_l: true };
		}
		if (!step(frame, [])) {
			break;
		}
	}
	return segments;
}

function closestApproachMm(x: number, y: number, segments: readonly Segment[]): number {
	let min = Infinity;
	for (const seg of segments) {
		const d = pointToSegmentDistanceMm(x, y, seg.fromMm.x, seg.fromMm.y, seg.toMm.x, seg.toMm.y);
		if (d < min) {
			min = d;
		}
	}
	return min;
}

/**
 * Recipes to sweep. Far denser than `test/util/reachability.ts`'s own
 * 10-entry `WITNESSES` table: 36 coarse plunge-only strengths (20-900 step
 * 25) plus 29 fine plunge-only strengths (240-380 step 5, the window that
 * DISCOVERED the Right Loop lane's own reachability -- this story's own
 * single biggest finding, see the Spec Change Log), and 66 flip ticks x 6
 * hold durations = 396 flipped releases, for 461 releases total, PLUS all
 * 10 `WITNESSES`-table recipes explicitly (471 total -- so the dense sweep
 * can never disagree with the in-suite gate merely because its own coarse
 * grid stepped over a narrow window the in-suite search found by finer,
 * targeted search; a few of the 10 exactly overlap the surrounding grid,
 * which is by design -- the sweep's job is to search WIDER, not to avoid
 * all overlap).
 */
function buildSweepRecipes(): readonly ReleaseRecipe[] {
	const recipes: ReleaseRecipe[] = [];
	// Plunge strength alone, no flip: a bare tap through well past full
	// power, with a finer step through the 240-320 window this story's own
	// planning pass found genuinely different lane behaviour in (the Left
	// Loop's own partial-crossing fallback around 330-370, and the Right
	// Loop's own partial-crossing fallback around 270-300).
	for (let holdTicks = 20; holdTicks <= 900; holdTicks += 25) {
		recipes.push({ plungeHoldTicks: holdTicks });
	}
	for (let holdTicks = 240; holdTicks <= 380; holdTicks += 5) {
		recipes.push({ plungeHoldTicks: holdTicks });
	}
	// Full-power plunge, LEFT-bat flip swept densely across the measured
	// contact window (this story's own planning pass) and beyond it on both
	// sides, so the boundary is demonstrated, not assumed.
	for (let atTick = 3650; atTick <= 4300; atTick += 10) {
		for (const holdTicks of [20, 40, 60, 100, 150, 250]) {
			recipes.push({ plungeHoldTicks: 521, flip: { atTick, holdTicks } });
		}
	}
	// Every WITNESSES-table recipe, explicitly (test/util/reachability.ts) --
	// guarantees the dense sweep can rediscover everything the in-suite gate
	// already proved, even where that proof depended on a flip tick this
	// file's own coarser step (10 ticks) would otherwise skip over.
	recipes.push({ plungeHoldTicks: 521 });
	recipes.push({ plungeHoldTicks: 345 });
	recipes.push({ plungeHoldTicks: 285 });
	recipes.push({ plungeHoldTicks: 521, flip: { atTick: 3911, holdTicks: 60 } });
	recipes.push({ plungeHoldTicks: 521, flip: { atTick: 3918, holdTicks: 60 } });
	recipes.push({ plungeHoldTicks: 521, flip: { atTick: 3945, holdTicks: 30 } });
	recipes.push({ plungeHoldTicks: 521, flip: { atTick: 3944, holdTicks: 35 } });
	recipes.push({ plungeHoldTicks: 521, flip: { atTick: 3960, holdTicks: 80 } });
	recipes.push({ plungeHoldTicks: 521, flip: { atTick: 4040, holdTicks: 30 } });
	recipes.push({ plungeHoldTicks: 521, flip: { atTick: 4110, holdTicks: 60 } });
	return recipes;
}

interface CaseVerdict {
	readonly id: string;
	readonly bestMm: number;
	readonly recipeIndex: number;
}

function main(): { readonly verdicts: readonly CaseVerdict[]; readonly releasesEvaluated: number; readonly runtimeMs: number } {
	const startedAt = Date.now();
	const recipes = buildSweepRecipes();
	const best = new Map<string, CaseVerdict>();
	for (const c of SHOT_CASES) {
		best.set(c.id, { id: c.id, bestMm: Infinity, recipeIndex: -1 });
	}

	let releasesEvaluated = 0;
	recipes.forEach((recipe, recipeIndex) => {
		const ticksAfterRelease = recipe.flip ? 7000 : 5500;
		const segments = sweepOneRelease(recipe, ticksAfterRelease);
		// Anti-vacuity per-release: a release that produced no segments never
		// launched at all (or launched and immediately left play) and must
		// not silently count toward the evaluated total.
		if (segments.length === 0) {
			return;
		}
		releasesEvaluated += 1;
		for (const c of SHOT_CASES) {
			const d = closestApproachMm(c.startMm.x, c.startMm.y, segments);
			const current = best.get(c.id)!;
			if (d < current.bestMm) {
				best.set(c.id, { id: c.id, bestMm: d, recipeIndex });
			}
		}
	});

	return { verdicts: [...best.values()], releasesEvaluated, runtimeMs: Date.now() - startedAt };
}

/** Anti-vacuity floor (I/O matrix, "The dense sweep proves a negative"): a sweep that evaluated fewer than this many releases exits non-zero on its own, rather than reporting success over a search that never really ran. */
const MIN_RELEASES_EVALUATED = 300;

describe('reachability-sweep (pnpm check:reachability) -- the dense, out-of-process search that proves a negative (INTENDED GREEN)', () => {
	it(`sweeps far more densely than the in-suite WITNESSES set, evaluates at least ${MIN_RELEASES_EVALUATED} releases, and every SHOT_CASES entry's own reachability declaration agrees with the sweep's own best closest approach`, () => {
		expect(
			SHOT_CASES.length,
			`SHOT_CASES has only ${SHOT_CASES.length} entries, below the recorded floor of ${MIN_SHOT_CASES} -- refusing to report a verdict over a truncated manifest`,
		).toBeGreaterThanOrEqual(MIN_SHOT_CASES);

		const { verdicts, releasesEvaluated, runtimeMs } = main();

		console.log(`reachability-sweep.harness.ts: ${releasesEvaluated} releases evaluated in ${runtimeMs} ms (${SHOT_CASES.length} cases)`);
		console.log('id\tdeclared\tbestApproachMm\trecipeIndex\tagreement');
		const mismatches: string[] = [];
		for (const v of verdicts) {
			const c = shotCase(v.id);
			const reachedWithinTolerance = v.bestMm <= REACHABILITY_TOLERANCE_MM;
			const declaredReachable = c.reachability.kind === 'reachable';
			const ok = reachedWithinTolerance === declaredReachable;
			console.log(`${v.id}\t${declaredReachable ? 'reachable' : 'unreachable'}\t${v.bestMm.toFixed(3)}\t${v.recipeIndex}\t${ok ? 'OK' : 'MISMATCH'}`);
			if (!ok) {
				mismatches.push(
					`"${v.id}" is declared ${declaredReachable ? 'reachable' : 'unreachable'} in SHOT_CASES, but the dense sweep's best closest approach is ${v.bestMm.toFixed(3)} mm ` +
						`(tolerance ${REACHABILITY_TOLERANCE_MM} mm, recipe #${v.recipeIndex}) -- disagrees with the manifest's own declaration`,
				);
			}
		}

		// Anti-vacuity floor FIRST in spirit (checked here, after the sweep
		// actually ran, because the count itself is the sweep's own output) --
		// a run that evaluated almost nothing must fail on this floor rather
		// than reporting success over a search that never really happened.
		expect(
			releasesEvaluated,
			`only ${releasesEvaluated} releases were evaluated, below the anti-vacuity floor of ${MIN_RELEASES_EVALUATED} -- a sweep that ran almost nothing must not report success`,
		).toBeGreaterThanOrEqual(MIN_RELEASES_EVALUATED);

		expect(mismatches, `${mismatches.length} case(s) disagree with the manifest's own reachability declaration:\n${mismatches.join('\n')}`).toEqual([]);
	});
});
