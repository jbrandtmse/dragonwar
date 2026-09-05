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
// a RIGHT-bat flip. Along the axes this file DOES sweep, no plunge strength
// ever delivers the ball onto the RIGHT bat: a full-strength plunge
// completes the crossing and descends onto the LEFT bat; weaker ones fall
// back part-way down whichever lane they were last climbing (285: down the
// right OUTLANE, past the flipper entirely; 345: down the left lane, short
// of the left bat) -- measured, not assumed, across every plunge strength
// this file sweeps (including the fine 240-380 window that discovered 285's
// own right-lane fate). Within THAT space a "right-bat flip" witness would
// have no ball ever near the right bat to flip -- a vacuous axis.
//
// [SCOPED 2026-09-03, code review] That negative is real but it is NOT
// exhaustive over the machine, and this header previously overstated it as
// though it were (it called `bd_shooter` "the only serve device", which is
// wrong twice over -- `bd_trough` is what serves, `servesInto:
// 's_shooter_lane'`, and `bd_lock` is a third ball device entirely).
// THREE origin axes remain unsearched, all of them implemented today:
//   (a) `side: 'r'` -- CLOSED by Story 2.1f. `ReleaseRecipe` below now
//       carries `side`, the release loop drives `frame.flipper_r` for it,
//       and `buildSweepRecipes()` sweeps a right-bat grid chained off the
//       285-tick plunge (the strength whose ball descends the RIGHT Loop
//       lane onto the right bat). This was not a cosmetic gap: the Ramp is a
//       right-bat shot, so DW-137's own acceptance criterion was unprovable
//       at ANY corridor width until this axis existed. The bat-side axis is
//       now asserted, not merely swept -- see `axisCoverage()` below.
//   (b) a SECOND flip. `ReleaseRecipe` admits at most one, so no
//       left-flip-then-right-flip chain -- the ordinary way a real player
//       moves a ball across the table -- was ever searched.
//   (c) `bd_lock` / `pulse c_mouth`. AD-6 gives the Lock an authored eject
//       pose that IS the Mouth, "aimed at the flippers"; the committed
//       collision document carries it at (170, 650) with dir (0, -1, 0),
//       plus slot zones `sw_lock_1..3` (x 150-190, y 630-678); parking and
//       ejecting are generic over every parking device in
//       `src/sim/physics/devices.ts`; and `test/shot-routing.test.ts`
//       already models the outcome (`Terminal = 'locked'`). A ball parked
//       there and re-ejected is a genuine, never-teleported SECOND origin
//       in the middle of the table -- within ~50 mm of `pop-bumper-1`,
//       `descend-dragon-leg-l` and `descend-dragon-leg-r`, three of the
//       cases this sweep currently reports unreached.
// Those four cases (`top-lane-1/2/3`, `pop-bumper-1`) plus the drop-column
// verdicts are recorded against DW-138, whose own trailer carries these
// axes as the next probe. Read every "missed by every release in the sweep"
// verdict below as "missed along the axes this file sweeps", not as a
// property of the geometry.
//
// Story 2.1e's own charter was explicit that DW-137 and DW-136 were NOT this
// harness's to fix: it reports, and Story 2.1f decides. [STORY 2.1f] That
// story has now landed. The bottom-right corridor is re-solved, DW-137 is
// closed, `ramp-return-geometry` is `reachable` on a right-bat witness, and
// six per-letter DRAGON cases carry DW-136. What remains unsearched here is
// axes (b) and (c) above, both of which the 2026-09-04 adjudication routed to
// `burndown` rather than to a geometry story.

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
	// [STORY 2.1f] `side` added. Until this story the recipe had no such
	// field and the loop below only ever set `frame.flipper_l`, so the whole
	// sweep -- like the in-suite WITNESSES table it backs -- searched a
	// LEFT-bat-only space. The Ramp is a right-bat shot, so no release in
	// this file could reach it at any corridor width, and the "missed by
	// every release in the sweep" verdicts were verdicts about the search,
	// not about the table. See this file's own header, axis (a).
	readonly flip?: { readonly side: 'l' | 'r'; readonly atTick: number; readonly holdTicks: number };
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
			frame = { ...NO_FRAME, [recipe.flip.side === 'l' ? 'flipper_l' : 'flipper_r']: true };
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
 * `WITNESSES` table: 36 coarse plunge-only strengths (20-900 step 25) plus
 * 29 fine plunge-only strengths (240-380 step 5, the window that DISCOVERED
 * the Right Loop lane's own reachability -- Story 2.1e's own single biggest
 * finding, see that story's own Spec Change Log), and 66 flip ticks x 6
 * hold durations = 396 flipped releases, for 461 releases total, PLUS every
 * `WITNESSES`-table recipe explicitly (472 total -- so the dense sweep can
 * never disagree with the in-suite gate merely because its own coarse grid
 * stepped over a narrow window the in-suite search found by finer, targeted
 * search; a few of these exactly overlap the surrounding grid, which is by
 * design -- the sweep's job is to search WIDER, not to avoid all overlap).
 *
 * [CORRECTED, code review 2026-09-03 (MED finding)] `WITNESSES` holds 11
 * entries (Story 2.1d's own rework added `plunge-medium-295`); this
 * function's own explicit push list held only 10, so the comment's own
 * guarantee -- "the dense sweep can rediscover everything the in-suite gate
 * proved" -- did not in fact hold BY CONSTRUCTION for the 11th. It happened
 * to be covered anyway (295 lands exactly on the fine 240-380 step-5 grid),
 * which is how this went unnoticed rather than failing loudly. The missing
 * push is added below rather than left to incidental grid alignment.
 */
// [STORY 2.1f] Grid bounds named so the axis-coverage floor further below
// (`MIN_DISTINCT_PLUNGE_STRENGTHS` / `MIN_DISTINCT_FLIP_TICKS`) can be
// derived from the SAME numbers `buildSweepRecipes()` loops over, without
// re-deriving it FROM the recipe array those loops build -- a floor computed
// from the array itself cannot fail when the array shrinks along with it. If
// a loop below is ever deleted, its named bounds either go with it (and the
// floor computation fails to compile) or survive orphaned (and the floor
// computed from them exceeds what the shrunken recipe set actually reaches,
// so the assertion reddens). Either way the axis loss is loud.
const COARSE_PLUNGE_MIN_TICKS = 20;
const COARSE_PLUNGE_MAX_TICKS = 900;
const COARSE_PLUNGE_STEP_TICKS = 25;
const FINE_PLUNGE_MIN_TICKS = 240;
const FINE_PLUNGE_MAX_TICKS = 380;
const FINE_PLUNGE_STEP_TICKS = 5;
const LEFT_FLIP_MIN_TICK = 3650;
const LEFT_FLIP_MAX_TICK = 4300;
const LEFT_FLIP_STEP_TICKS = 10;
const RIGHT_FLIP_MIN_TICK = 3780;
const RIGHT_FLIP_MAX_TICK = 4050;
const RIGHT_FLIP_STEP_TICKS = 10;

function buildSweepRecipes(): readonly ReleaseRecipe[] {
	const recipes: ReleaseRecipe[] = [];
	// Plunge strength alone, no flip: a bare tap through well past full
	// power, with a finer step through the 240-380 window this story's own
	// planning pass found genuinely different lane behaviour in (the Left
	// Loop's own partial-crossing fallback around 330-370, and the Right
	// Loop's own partial-crossing fallback around 270-300).
	// [CORRECTED 2026-09-03, code review] This comment read "240-320", a
	// window that excludes the 330-370 fallback the same sentence cites as
	// its reason; the loop below has always been 240-380.
	for (let holdTicks = COARSE_PLUNGE_MIN_TICKS; holdTicks <= COARSE_PLUNGE_MAX_TICKS; holdTicks += COARSE_PLUNGE_STEP_TICKS) {
		recipes.push({ plungeHoldTicks: holdTicks });
	}
	for (let holdTicks = FINE_PLUNGE_MIN_TICKS; holdTicks <= FINE_PLUNGE_MAX_TICKS; holdTicks += FINE_PLUNGE_STEP_TICKS) {
		recipes.push({ plungeHoldTicks: holdTicks });
	}
	// Full-power plunge, LEFT-bat flip swept densely across the measured
	// contact window (this story's own planning pass) and beyond it on both
	// sides, so the boundary is demonstrated, not assumed.
	for (let atTick = LEFT_FLIP_MIN_TICK; atTick <= LEFT_FLIP_MAX_TICK; atTick += LEFT_FLIP_STEP_TICKS) {
		for (const holdTicks of [20, 40, 60, 100, 150, 250]) {
			recipes.push({ plungeHoldTicks: 521, flip: { side: 'l', atTick, holdTicks } });
		}
	}
	// [STORY 2.1f] The RIGHT-bat axis, axis (a) of this file's own header --
	// added because it was the reason AC 1 of Story 2.1f was unprovable, not
	// merely an unswept parameter. It chains off the 285-tick plunge, which
	// is the strength whose ball descends the RIGHT Loop lane and arrives on
	// the right bat: measured against the re-solved geometry, that ball
	// occupies the right-bat band (x 270..365, y 50..130) over relative ticks
	// 3811..4020, so the window below is that band with margin on each side.
	// A full-power plunge is NOT swept on this side: its ball arrives on the
	// LEFT bat and drains centre, so a right-bat flip has nothing to strike
	// -- the vacuous axis this file's own header warns against.
	for (let atTick = RIGHT_FLIP_MIN_TICK; atTick <= RIGHT_FLIP_MAX_TICK; atTick += RIGHT_FLIP_STEP_TICKS) {
		for (const holdTicks of [20, 40, 60, 100, 150, 250]) {
			recipes.push({ plungeHoldTicks: 285, flip: { side: 'r', atTick, holdTicks } });
		}
	}
	// Every WITNESSES-table recipe, explicitly (test/util/reachability.ts) --
	// guarantees the dense sweep can rediscover everything the in-suite gate
	// already proved, even where that proof depended on a flip tick this
	// file's own coarser step (10 ticks) would otherwise skip over.
	recipes.push({ plungeHoldTicks: 521 });
	recipes.push({ plungeHoldTicks: 345 });
	recipes.push({ plungeHoldTicks: 285 });
	recipes.push({ plungeHoldTicks: 295 }); // plunge-medium-295 (Story 2.1d) -- see this function's own [CORRECTED] note above
	recipes.push({ plungeHoldTicks: 521, flip: { side: 'l', atTick: 3911, holdTicks: 60 } });
	recipes.push({ plungeHoldTicks: 521, flip: { side: 'l', atTick: 3918, holdTicks: 60 } });
	recipes.push({ plungeHoldTicks: 521, flip: { side: 'l', atTick: 3945, holdTicks: 30 } });
	recipes.push({ plungeHoldTicks: 521, flip: { side: 'l', atTick: 3944, holdTicks: 35 } });
	recipes.push({ plungeHoldTicks: 521, flip: { side: 'l', atTick: 3960, holdTicks: 80 } });
	recipes.push({ plungeHoldTicks: 521, flip: { side: 'l', atTick: 4040, holdTicks: 30 } });
	recipes.push({ plungeHoldTicks: 521, flip: { side: 'l', atTick: 4110, holdTicks: 60 } });
	// [STORY 2.1f] The three recipes this story added to WITNESSES.
	recipes.push({ plungeHoldTicks: 521, flip: { side: 'l', atTick: 3969, holdTicks: 40 } });
	recipes.push({ plungeHoldTicks: 285, flip: { side: 'r', atTick: 3890, holdTicks: 100 } });
	recipes.push({ plungeHoldTicks: 285, flip: { side: 'r', atTick: 3899, holdTicks: 60 } });
	recipes.push({ plungeHoldTicks: 285, flip: { side: 'r', atTick: 3906, holdTicks: 60 } });
	return recipes;
}

interface CaseVerdict {
	readonly id: string;
	readonly bestMm: number;
	readonly recipeIndex: number;
}

function main(): {
	readonly verdicts: readonly CaseVerdict[];
	readonly releasesEvaluated: number;
	readonly runtimeMs: number;
	readonly realizedCoverage: AxisCoverage;
} {
	const startedAt = Date.now();
	const recipes = buildSweepRecipes();
	const best = new Map<string, CaseVerdict>();
	for (const c of SHOT_CASES) {
		best.set(c.id, { id: c.id, bestMm: Infinity, recipeIndex: -1 });
	}

	let releasesEvaluated = 0;
	// [STORY 2.1f] Tracks the SAME four axes as `axisCoverage()`, but only
	// over recipes that actually survive the anti-vacuity filters below --
	// the "realised" side of the built-vs-realised comparison the axis-floor
	// assertions make.
	const realizedPlungeStrengths = new Set<number>();
	const realizedFlipTicks = new Set<number>();
	const realizedFlipSides = new Set<string>();
	recipes.forEach((recipe, recipeIndex) => {
		const ticksAfterRelease = recipe.flip ? 7000 : 5500;
		const segments = sweepOneRelease(recipe, ticksAfterRelease);
		// Anti-vacuity per-release. [TIGHTENED 2026-09-03, code review] This
		// was `segments.length === 0`, which could only reject a release
		// whose ball did not exist on tick 1: a segment is pushed on EVERY
		// tick regardless of motion, so a plunge that never fired still
		// returned 800+ settle-and-hold segments and counted as "evaluated".
		// A release counts only if its ball actually TRAVELLED -- the ball
		// resting on the plunger tip through settle and hold covers only the
		// trough-to-tip distance, far under this floor.
		if (segments.length === 0) {
			return;
		}
		let pathMm = 0;
		for (const seg of segments) {
			pathMm += Math.hypot(seg.toMm.x - seg.fromMm.x, seg.toMm.y - seg.fromMm.y);
		}
		if (pathMm < MIN_RELEASE_PATH_MM) {
			return;
		}
		releasesEvaluated += 1;
		realizedPlungeStrengths.add(recipe.plungeHoldTicks);
		if (recipe.flip) {
			realizedFlipTicks.add(recipe.flip.atTick);
			realizedFlipSides.add(recipe.flip.side);
		}
		for (const c of SHOT_CASES) {
			const d = closestApproachMm(c.startMm.x, c.startMm.y, segments);
			const current = best.get(c.id)!;
			if (d < current.bestMm) {
				best.set(c.id, { id: c.id, bestMm: d, recipeIndex });
			}
		}
	});

	return {
		verdicts: [...best.values()],
		releasesEvaluated,
		runtimeMs: Date.now() - startedAt,
		realizedCoverage: {
			releases: releasesEvaluated,
			plungeStrengths: realizedPlungeStrengths.size,
			flipTicks: realizedFlipTicks.size,
			flipSides: realizedFlipSides.size,
		},
	};
}

/**
 * Anti-vacuity floor (I/O matrix, "The dense sweep proves a negative"): a
 * sweep that evaluated fewer than this many releases exits non-zero on its
 * own, rather than reporting success over a search that never really ran.
 *
 * [STORY 2.1f, lesson 5] Was the hand-typed 300 against a live 472. A floor
 * that lags its own subject set cannot see the subject set shrink, which is
 * the one thing it exists to see. It is now DERIVED from the recipe set the
 * sweep actually builds: every recipe must produce a release, so the floor is
 * the recipe count itself, and a release that dies before it launches (the
 * dead-witness failure this floor is really about) drops the evaluated count
 * below it immediately.
 */
function minReleasesEvaluated(recipes: readonly ReleaseRecipe[]): number {
	return recipes.length;
}

/** A release counts as evaluated only if its ball travelled at least this far. The served ball's own trough-to-plunger-tip settle covers well under this; every real trajectory measured by this story covers 2300 mm or more. */
const MIN_RELEASE_PATH_MM = 300;

/**
 * [ADDED 2026-09-03, code review] Per-AXIS coverage floors. A single total
 * cannot tell "the search shrank" from "the search lost the axis that made
 * it a proof": deleting the fine 240-380 plunge loop -- the axis that
 * DISCOVERED `plunge-medium-285`, this story's own headline finding --
 * leaves 442 releases, over the 300 total floor, and changes no verdict
 * (because every `WITNESSES` recipe is separately re-pushed below), so
 * the sweep would silently degrade into a replay of the in-suite witness
 * set and still report success. These floors make each axis fail on its own.
 */
/**
 * [STORY 2.1f, lesson 5 -- CORRECTED, code review] Both were hand-typed (50
 * and 60) against live figures well above them, so neither could see its own
 * axis thin -- only vanish. An earlier pass of this fix recomputed
 * `axisCoverage(allRecipes)` a second way and compared it to itself, which
 * cannot fail no matter how thin the BUILT grid becomes -- exactly the "a
 * floor that lags its own subject set" failure this lesson exists to close,
 * just dressed up. The floor that actually means something, mirroring
 * `minReleasesEvaluated()` above (`recipes.length`, checked against
 * `releasesEvaluated`, a genuinely independent RUNTIME count): compare each
 * axis's BUILT distinct-value count (`axisCoverage(allRecipes)`, computed
 * before the sweep runs) against that SAME axis's REALISED distinct-value
 * count (`main()`'s own `realizedCoverage`, accumulated only from recipes
 * that survived the per-release anti-vacuity filters below). A recipe that
 * is built and then silently dropped -- the one thing a build-time-only
 * count structurally cannot see -- shows up as realised < built and reddens
 * here. (What this does NOT catch: someone directly thinning or deleting a
 * grid loop in `buildSweepRecipes()` itself, which shrinks built and
 * realised together. `MIN_RELEASES_EVALUATED` has the identical blind spot
 * for the total. Guarding against that is a code-review discipline, not a
 * runtime assertion this file can make of itself.)
 */
interface AxisCoverage {
	readonly releases: number;
	readonly plungeStrengths: number;
	readonly flipTicks: number;
	readonly flipSides: number;
}
function axisCoverage(recipes: readonly ReleaseRecipe[]): AxisCoverage {
	return {
		releases: recipes.length,
		plungeStrengths: new Set(recipes.map((r) => r.plungeHoldTicks)).size,
		flipTicks: new Set(recipes.filter((r) => r.flip).map((r) => r.flip!.atTick)).size,
		flipSides: new Set(recipes.filter((r) => r.flip).map((r) => r.flip!.side)).size,
	};
}

/** Task 7's "stated budget", stated (code review: the measured figure was recorded, the budget it was measured against was not). Measured 75-76 s on this story's host across repeated runs; this is the ceiling above which the sweep has become too expensive to be run on demand and should be re-shaped rather than re-timed. Reported, not asserted -- a slower CI host is not a defect, and `testTimeout: 180_000` in the sibling config is the hard stop. */
const SWEEP_RUNTIME_BUDGET_MS = 120_000;

describe('reachability-sweep (pnpm check:reachability) -- the dense, out-of-process search that proves a negative (INTENDED GREEN)', () => {
	it(`sweeps far more densely than the in-suite WITNESSES set, evaluates every release its own recipe set builds, and every SHOT_CASES entry's own reachability declaration agrees with the sweep's own best closest approach`, () => {
		expect(
			SHOT_CASES.length,
			`SHOT_CASES has only ${SHOT_CASES.length} entries, below the derived floor of ${MIN_SHOT_CASES} -- refusing to report a verdict over a truncated manifest`,
		).toBeGreaterThanOrEqual(MIN_SHOT_CASES);

		// Per-axis coverage, measured from the recipe set itself (pure and
		// cheap to rebuild) BEFORE the sweep runs -- the BUILT side of the
		// built-vs-realised comparison the assertions below make.
		const allRecipes = buildSweepRecipes();
		const coverage = axisCoverage(allRecipes);
		const distinctStrengths = coverage.plungeStrengths;
		const distinctFlipTicks = coverage.flipTicks;

		const { verdicts, releasesEvaluated, runtimeMs, realizedCoverage } = main();

		// [STORY 2.1f, lesson 5] Each axis's REALISED distinct-value count
		// (only recipes that survived the anti-vacuity filters inside
		// `main()`) must not fall below what was BUILT for it. A recipe
		// silently dropped at runtime is invisible to a total release count
		// but not to this: if it was the only recipe carrying some plunge
		// strength or flip tick, that value vanishes from `realizedCoverage`
		// while `coverage` (computed before the sweep ran) still has it.
		expect(
			realizedCoverage.plungeStrengths,
			`the sweep REALISED only ${realizedCoverage.plungeStrengths} of the ${distinctStrengths} distinct plunge strengths it BUILT -- at least one strength's every release was silently dropped by the anti-vacuity filters`,
		).toBeGreaterThanOrEqual(distinctStrengths);
		expect(
			realizedCoverage.flipTicks,
			`the sweep REALISED only ${realizedCoverage.flipTicks} of the ${distinctFlipTicks} distinct flip ticks it BUILT -- at least one flip tick's every release was silently dropped by the anti-vacuity filters`,
		).toBeGreaterThanOrEqual(distinctFlipTicks);
		// [STORY 2.1f] The BAT-SIDE axis, asserted for the first time. Both
		// sides must be present: a sweep that is left-bat-only reports "no
		// release reaches here" for every right-bat shot on the table, which
		// is what made DW-137's own AC unprovable before this story.
		expect(
			coverage.flipSides,
			`the sweep flips only ${coverage.flipSides} bat side(s). Both are required: a single-sided sweep records "no shot reaches here" when the truth is "no shot of the side we searched reaches here" -- exactly the defect that hid the Ramp.`,
		).toBe(2);
		expect(
			realizedCoverage.flipSides,
			`the sweep BUILT ${coverage.flipSides} bat side(s) but REALISED only ${realizedCoverage.flipSides} -- one side's every release was silently dropped by the anti-vacuity filters`,
		).toBe(coverage.flipSides);

		console.log(`reachability-sweep.harness.ts: ${releasesEvaluated} releases evaluated in ${runtimeMs} ms (${SHOT_CASES.length} cases)`);
		console.log(`  axes: ${distinctStrengths} distinct plunge strengths, ${distinctFlipTicks} distinct flip ticks, ${coverage.flipSides} bat sides, ${allRecipes.length} recipes`);
		console.log(`  runtime budget: ${runtimeMs} ms against the ~${SWEEP_RUNTIME_BUDGET_MS} ms this story recorded (task 7's "stated budget")`);
		console.log('id\tdeclared\tbestApproachMm\trecipeIndex\tagreement\trecordedMm\tdelta');
		const mismatches: string[] = [];
		for (const v of verdicts) {
			const c = shotCase(v.id);
			const reachedWithinTolerance = v.bestMm <= REACHABILITY_TOLERANCE_MM;
			const declaredReachable = c.reachability.kind === 'reachable';
			const ok = reachedWithinTolerance === declaredReachable;
			// [ADDED 2026-09-03, code review] Report the recorded figure and
			// the delta alongside the boolean. This sweep already computes a
			// strictly BETTER closest approach than the in-suite gate can (it
			// searches wider), and previously discarded it: measured deltas
			// reach 27 mm (descend-sling-l, recorded 51.86, swept 24.716), so
			// a reader of the manifest's own numbers was reading the narrow
			// figure with nothing saying so. This is deliberately a REPORT,
			// not an assertion -- `closestApproachMm` in the manifest is
			// DEFINED as the in-suite measurement (that is what the in-suite
			// agreement band checks against), so the two instruments are
			// expected to differ; what was missing is that the difference was
			// invisible. DW-138 carries the residual.
			const recorded = c.reachability.kind === 'unreachable' ? c.reachability.closestApproachMm : null;
			const deltaText = recorded === null ? '-\t-' : `${recorded.toFixed(3)}\t${(recorded - v.bestMm).toFixed(3)}`;
			console.log(`${v.id}\t${declaredReachable ? 'reachable' : 'unreachable'}\t${v.bestMm.toFixed(3)}\t${v.recipeIndex}\t${ok ? 'OK' : 'MISMATCH'}\t${deltaText}`);
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
			`only ${releasesEvaluated} of the ${allRecipes.length} recipes the sweep BUILT actually produced a release -- the derived floor is the recipe count itself, so a shortfall means releases are dying before they launch and the sweep is proving less than it reports`,
		).toBeGreaterThanOrEqual(minReleasesEvaluated(allRecipes));

		expect(mismatches, `${mismatches.length} case(s) disagree with the manifest's own reachability declaration:\n${mismatches.join('\n')}`).toEqual([]);
	});
});
