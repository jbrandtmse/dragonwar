// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1e task 4 -- the reachability engine. Proves a release point is
// reachable (or genuinely is not) by replaying a small, named set of
// WITNESS trajectories through the real `createMachine()` pipeline and
// measuring the minimum distance from the release point to the witness
// ball's own per-tick SWEPT SEGMENTS (AD-11's own model for `sw_` zones --
// never the ball's end position, per this story's own Boundaries).
//
// No witness teleports. Every witness's ball is served by `c_trough_eject`
// (`sim/physics/devices.ts`'s `bd_shooter`, non-parking) and reaches its
// own origin by the real input path: `frame.plunger` held for a recorded
// tick count then released (`sim/physics/plunger.ts:70-90`, the SAME code
// path `pulse c_autolaunch` uses, AD-6), optionally followed, in the SAME
// run, by `frame.flipper_l` / `frame.flipper_r` held at a recorded tick
// against the ball the plunge has already delivered onto that bat (AD-5,
// AD-6) -- "chaining a bat witness off a plunge witness" (Design Notes).
// Every witness's own parameters are recorded in `WITNESSES` below, so a
// witness is replayable and deterministic (AD-3: one clock, no unseeded
// randomness) and memoised per test process (a witness referenced by ten
// cases is replayed once).

import { expect } from 'vitest';
import { createMachine, type Machine } from '../../src/sim/physics/machine';
import { NO_FRAME } from '../../src/sim/loop';
import { resolveTuning } from '../../src/sim/table/tuning';
import { fromPhysics } from '../../src/sim/table/frames';
import { TABLE } from '../../src/sim/table/dragonwar';
import { readCollisionDoc } from './collision-doc';
import { pointToSegmentDistanceMm } from './plan-geometry';
import type { InputFrame } from '../../src/sim/contracts/input';
import type { CoilCommand, SwitchName } from '../../src/sim/table/names';

/**
 * Half the reference ball's own diameter (`TABLE.reference.ballMm`) -- the
 * release point lay inside the swept body of a real ball, the same
 * derivation convention `RELEASE_CLEAR_MARGIN_MM` follows
 * (`test/shot-routing.test.ts:318`).
 */
export const REACHABILITY_TOLERANCE_MM = TABLE.reference.ballMm / 2;

export type WitnessId = string;

/**
 * A witness's own input program, replayed from a fresh `createMachine()`
 * every time (never a live reference reused across witnesses -- each
 * witness gets its own ball, its own machine). Every witness begins with
 * the SAME serve: `c_trough_eject` pulses on the first tick, then
 * `settleTicks` of `NO_FRAME` let the served ball settle onto the plunger
 * tip (`driveShot()`'s own 320-tick precedent, `test/shot-routing.test.ts:231`).
 * `plungeHoldTicks` then holds `frame.plunger` true, and its release is the
 * one event that launches the ball (`s_shooter_lane` opens -- AD-6). An
 * optional `flip` applies `frame.flipper_l` / `frame.flipper_r` for
 * `holdTicks` starting `atTick` ticks after the plunger's own release --
 * "a bat witness chained off a plunge witness" (Design Notes) -- against
 * whatever ball state the plunge has produced by then, never a fresh spawn.
 */
interface WitnessRecipe {
	readonly id: WitnessId;
	readonly label: string;
	readonly settleTicks: number;
	readonly plungeHoldTicks: number;
	readonly flip?: { readonly side: 'l' | 'r'; readonly atTick: number; readonly holdTicks: number };
	/** Ticks to run AFTER the plunger releases (i.e., after the ball leaves `bd_shooter`), or until the ball leaves play, whichever comes first. */
	readonly ticksAfterRelease: number;
	/**
	 * At least one switch this witness's own trajectory is expected to close
	 * -- `assertWitnessCorpusHealthy()`'s dead-witness guard reads this.
	 *
	 * [CORRECTED 2026-09-03, code review] It MUST be a switch the ball can
	 * only close AFTER the plunger releases. `s_shooter_lane` is
	 * `bd_shooter`'s own ENTRY switch (`src/sim/table/dragonwar.ts`:
	 * `bd_trough.servesInto: 's_shooter_lane'`), so it CLOSES on the trough
	 * eject at tick 1 -- before any plunger hold begins -- and AD-6's "one
	 * event that means plunged" is its OPENING, not its closing. A witness
	 * declaring it would satisfy this guard on the serve alone, which is
	 * exactly the dead witness the guard exists to catch.
	 */
	readonly expectedSwitch: SwitchName;
}

/**
 * Story 2.1e task 4/7 (Design Notes, "Rule 20"): this table is the ONLY
 * place a witness trajectory is declared. Every entry's parameters were
 * measured empirically against the real committed geometry (this story's
 * own planning pass) -- see `## Spec Change Log` for the trajectory each one
 * produced (switches closed, tick count, final position).
 */
const WITNESSES: readonly WitnessRecipe[] = [
	{
		id: 'plunge-full',
		label: 'a full-strength manual plunge (hold 521 ticks, well past plungerMaxHoldTicks = 500), released and run out -- the measured orbit that clears the shooter lane, crosses the top (riding col_loop_top), descends the Left Loop lane, closes the left inlane and drains centre',
		settleTicks: 320,
		plungeHoldTicks: 521,
		ticksAfterRelease: 4300,
		// `s_inlane_l`, not `s_shooter_lane`: only a ball that actually
		// launched, completed the top crossing and descended the Left Loop
		// lane closes this. See `expectedSwitch`'s own note above.
		expectedSwitch: 's_inlane_l',
	},
	{
		id: 'plunge-weak-345',
		label: 'a partial-strength manual plunge (hold 345 ticks, below plungerMaxHoldTicks = 500) -- too weak to complete the crossing, so it enters the Left Loop lane, climbs partway (closing s_spinner and s_loop_l_in) and falls back down the same lane through the entry column -- the witness for the Left Loop entry offsets',
		settleTicks: 320,
		plungeHoldTicks: 345,
		ticksAfterRelease: 5500,
		expectedSwitch: 's_loop_l_in',
	},
	{
		id: 'plunge-medium-285',
		label: 'a medium-strength manual plunge (hold 285 ticks) -- discovered by the out-of-process dense sweep (task 7): too weak to complete the top crossing, so it ascends the RIGHT lane, barely enters the top of the loop channel (closing s_loop_r_out then s_loop_r_in) and falls back down the SAME lane it ascended -- the witness for the Right Loop entry offsets and the right off-column releases',
		settleTicks: 320,
		plungeHoldTicks: 285,
		ticksAfterRelease: 5500,
		expectedSwitch: 's_loop_r_in',
	},
	{
		// Story 2.1d task 8: added -- the out-of-process dense sweep
		// (pnpm check:reachability) found recipe #11 (a bare plunge, hold
		// 295 ticks, no flip) passes within tolerance of
		// loop-off-column-right-west-18 after this story's own geometry
		// changes moved plunge-medium-285's own trajectory (285 ticks) out
		// of range for that one case (21.430 mm, over tolerance) -- ten
		// ticks of additional hold is enough to recover it. Same lane
		// family as plunge-medium-285, a slightly stronger tap.
		id: 'plunge-medium-295',
		label: 'a medium-strength manual plunge (hold 295 ticks, 10 more than plunge-medium-285) -- discovered by the out-of-process dense sweep after Story 2.1d\'s own geometry changes: ascends the RIGHT lane slightly further than the 285-tick tap, recovering the off-column release point that tap no longer reaches',
		settleTicks: 320,
		plungeHoldTicks: 295,
		ticksAfterRelease: 5500,
		expectedSwitch: 's_loop_r_in',
	},
	{
		id: 'plunge-then-bat-l-3911',
		label: 'the full plunge, chained into a left-bat flip at relative tick 3911 (a 60-tick hold) once the ball has arrived on the left bat -- launches toward the Dragon body',
		settleTicks: 320,
		plungeHoldTicks: 521,
		flip: { side: 'l', atTick: 3911, holdTicks: 60 },
		ticksAfterRelease: 7000,
		expectedSwitch: 's_dragon_body',
	},
	{
		id: 'plunge-then-bat-l-3918',
		label: 'the full plunge, chained into a left-bat flip at relative tick 3918 (a 60-tick hold) -- passes within a ball radius of the DRAGON bank\'s own aim points en route to striking the Dragon body',
		settleTicks: 320,
		plungeHoldTicks: 521,
		flip: { side: 'l', atTick: 3918, holdTicks: 60 },
		ticksAfterRelease: 7000,
		expectedSwitch: 's_dragon_body',
	},
	{
		id: 'plunge-then-bat-l-3945',
		// [REWORK, Story 2.1d task 8] Used to launch up-table clear through to
		// the pop-bumper cluster (s_pop_3), before this story's own Lock lane
		// swallow fix. Measured against the real physics pipeline after that
		// fix landed: this SAME trajectory now closes s_lock_lane then
		// s_lock_1 -- the ball is genuinely captured by the Lock partway up,
		// exactly the AC 2 behaviour this story delivers -- and never reaches
		// the pop bumpers at all. Re-purposed as a Lock-capture witness
		// rather than retired, since its own approach (a weak up-table tap)
		// is still a useful, real trajectory for OTHER cases' own distance
		// measurements.
		label: 'the full plunge, chained into a left-bat flip at relative tick 3945 (a 30-tick tap) -- launches up-table and is captured by the Lock (s_lock_lane then s_lock_1) since Story 2.1d\'s own swallow fix; no longer reaches the pop-bumper cluster',
		settleTicks: 320,
		plungeHoldTicks: 521,
		flip: { side: 'l', atTick: 3945, holdTicks: 30 },
		ticksAfterRelease: 7000,
		expectedSwitch: 's_lock_1',
	},
	{
		id: 'plunge-then-bat-l-3944-35',
		// [REWORK, Story 2.1d task 8] Same finding as plunge-then-bat-l-3945's
		// own note: measured against the real physics pipeline after this
		// story's Lock lane swallow fix, this trajectory is ALSO captured
		// (s_lock_lane then s_lock_1) rather than reaching s_pop_2 or the
		// DRAGON bank's rightmost target.
		label: 'the full plunge, chained into a left-bat flip at relative tick 3944 (a 35-tick hold, 1 tick earlier and 5 ticks longer than the pop-bumper tap) -- captured by the Lock (s_lock_lane then s_lock_1) since Story 2.1d\'s own swallow fix; no longer reaches s_pop_2 or the DRAGON bank',
		settleTicks: 320,
		plungeHoldTicks: 521,
		flip: { side: 'l', atTick: 3944, holdTicks: 35 },
		ticksAfterRelease: 7000,
		expectedSwitch: 's_lock_1',
	},
	{
		id: 'plunge-then-bat-l-3960',
		label: 'the full plunge, chained into a left-bat flip at relative tick 3960 (an 80-tick hold) -- launches into the left slingshot',
		settleTicks: 320,
		plungeHoldTicks: 521,
		flip: { side: 'l', atTick: 3960, holdTicks: 80 },
		ticksAfterRelease: 6600,
		expectedSwitch: 's_sling_l',
	},
	{
		id: 'plunge-then-bat-l-4040',
		label: 'the full plunge, chained into a left-bat flip at relative tick 4040 (a 30-tick tap) -- a weak tap that drops the ball straight down the centre drain corridor',
		settleTicks: 320,
		plungeHoldTicks: 521,
		flip: { side: 'l', atTick: 4040, holdTicks: 30 },
		ticksAfterRelease: 7000,
		expectedSwitch: 's_drain',
	},
	{
		id: 'plunge-then-bat-l-4110',
		label: 'the full plunge, chained into a left-bat flip at relative tick 4110 (a 60-tick hold) -- launches into the right slingshot',
		settleTicks: 320,
		plungeHoldTicks: 521,
		flip: { side: 'l', atTick: 4110, holdTicks: 60 },
		ticksAfterRelease: 7000,
		expectedSwitch: 's_sling_r',
	},
];

export interface Segment {
	readonly fromMm: { readonly x: number; readonly y: number };
	readonly toMm: { readonly x: number; readonly y: number };
}

export interface WitnessResult {
	readonly segments: readonly Segment[];
	readonly closedSwitches: ReadonlySet<SwitchName>;
	readonly pathLengthMm: number;
}

const cache = new Map<WitnessId, WitnessResult>();

function replayWitness(recipe: WitnessRecipe): WitnessResult {
	const tuning = resolveTuning();
	const machine: Machine = createMachine(readCollisionDoc(), tuning);

	let tick = 0;
	const segments: Segment[] = [];
	const closedSwitches = new Set<SwitchName>();
	let pathLengthMm = 0;
	let lastPosMm: { x: number; y: number } | null = null;

	/** Advances one tick with `frame`/`commands`; returns false once the ball has left play (there is nothing left to sweep). */
	function stepOnce(frame: InputFrame, commands: readonly CoilCommand[]): boolean {
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
			pathLengthMm += Math.hypot(here.x - lastPosMm.x, here.y - lastPosMm.y);
		}
		lastPosMm = here;
		return true;
	}

	for (let i = 0; i < recipe.settleTicks; i++) {
		const commands: readonly CoilCommand[] = i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick: tick + 1 }] : [];
		if (!stepOnce(NO_FRAME, commands)) {
			return { segments, closedSwitches, pathLengthMm };
		}
	}

	const held: InputFrame = { ...NO_FRAME, plunger: true };
	for (let i = 0; i < recipe.plungeHoldTicks; i++) {
		if (!stepOnce(held, [])) {
			return { segments, closedSwitches, pathLengthMm };
		}
	}

	const flip = recipe.flip;
	for (let i = 0; i < recipe.ticksAfterRelease; i++) {
		let frame: InputFrame = NO_FRAME;
		if (flip && i >= flip.atTick && i < flip.atTick + flip.holdTicks) {
			frame = { ...NO_FRAME, [flip.side === 'l' ? 'flipper_l' : 'flipper_r']: true };
		}
		if (!stepOnce(frame, [])) {
			break;
		}
	}

	return { segments, closedSwitches, pathLengthMm };
}

/** Replays a witness through `createMachine()` and returns its per-tick swept segments, the switches it closed, and its cumulative path length. Memoised per test process. */
export function witnessPath(id: WitnessId): WitnessResult {
	const cached = cache.get(id);
	if (cached) {
		return cached;
	}
	const recipe = WITNESSES.find((w) => w.id === id);
	if (!recipe) {
		throw new Error(`witnessPath(): no witness named "${id}" in WITNESSES`);
	}
	const result = replayWitness(recipe);
	cache.set(id, result);
	return result;
}

/** The minimum distance from `startMm` to any of witness `witnessId`'s own swept segments. */
export function closestApproachMm(startMm: { readonly x: number; readonly y: number }, witnessId: WitnessId): number {
	const { segments } = witnessPath(witnessId);
	let min = Infinity;
	for (const seg of segments) {
		min = Math.min(min, pointToSegmentDistanceMm(startMm.x, startMm.y, seg.fromMm.x, seg.fromMm.y, seg.toMm.x, seg.toMm.y));
	}
	return min;
}

/** The minimum distance from `startMm` to ANY witness's own swept segments, and which witness achieved it -- for failure messages and for an `unreachable` verdict. */
export function closestApproachOverAll(startMm: { readonly x: number; readonly y: number }): { readonly witnessId: WitnessId; readonly closestApproachMm: number } {
	let bestWitnessId: WitnessId = '';
	let bestDistanceMm = Infinity;
	for (const recipe of WITNESSES) {
		const distanceMm = closestApproachMm(startMm, recipe.id);
		if (distanceMm < bestDistanceMm) {
			bestDistanceMm = distanceMm;
			bestWitnessId = recipe.id;
		}
	}
	return { witnessId: bestWitnessId, closestApproachMm: bestDistanceMm };
}

/** Every declared witness id, for `test/shot-reachability.test.ts`'s declaration-completeness check. */
export function witnessIds(): readonly WitnessId[] {
	return WITNESSES.map((w) => w.id);
}

/**
 * Measured on this host, this story's own planning pass: the shortest
 * witness (`plunge-medium-285`) produces 4870 segments / 2319.8 mm before
 * draining. A witness producing fewer than these floors is dead (never
 * launched, or launched and immediately parked) and must not be trusted for
 * an `unreachable` verdict.
 *
 * [RAISED 2026-09-03, code review] Both floors were 500, and the segment
 * floor could not fail for any witness whose ball merely existed: a segment
 * is pushed on EVERY tick regardless of motion, and every witness runs
 * `settleTicks` (320) + `plungeHoldTicks` (>= 285) = at least 604 ticks
 * BEFORE the plunger can release. A witness that never launched therefore
 * cleared the old 500-segment floor by construction -- a structurally
 * unfalsifiable assertion (Rule 19). The floors are now set between the
 * guaranteed pre-launch count (604) and the measured minimum (4870 / 2319.8),
 * so a witness that fails to launch, or that loses most of its trajectory,
 * fails here rather than silently making every `unreachable` verdict easier
 * to satisfy -- the failure direction that looks safe and is not.
 */
export const MIN_WITNESS_SEGMENTS = 2000;
export const MIN_WITNESS_PATH_MM = 1500;

/**
 * Anti-vacuity floor on the CORPUS itself, in the shape of `MIN_SHOT_CASES`
 * (`test/util/shot-cases.ts`): the count recorded at implementation time.
 * Every `unreachable` verdict is a claim about the BREADTH of this table --
 * `closestApproachOverAll()` quantifies over exactly these entries -- so a
 * table that silently shrinks makes every such verdict easier to satisfy,
 * and an emptied table makes `closestApproachOverAll()` return `Infinity`,
 * confirming every miss for the wrong reason. `assertWitnessCorpusHealthy()`
 * iterates `WITNESSES` and would otherwise pass vacuously over an empty one.
 */
export const MIN_WITNESSES = 10;

/**
 * Anti-vacuity floor (I/O matrix, "Vacuous pass -- a dead witness"): a
 * witness whose ball never launched, or launched and immediately parked,
 * would make every case's `unreachable` verdict look "confirmed" for the
 * wrong reason. Fails naming the witness before any `unreachable` verdict
 * is honoured.
 */
export function assertWitnessCorpusHealthy(): void {
	expect(
		WITNESSES.length,
		`assertWitnessCorpusHealthy(): the witness corpus has only ${WITNESSES.length} entries, below the recorded floor of ${MIN_WITNESSES} -- every "unreachable" verdict quantifies over exactly this table, so a shrunken corpus confirms every miss for the wrong reason`,
	).toBeGreaterThanOrEqual(MIN_WITNESSES);
	for (const recipe of WITNESSES) {
		const result = witnessPath(recipe.id);
		expect(
			result.segments.length,
			`assertWitnessCorpusHealthy(): witness "${recipe.id}" (${recipe.label}) produced only ${result.segments.length} swept segments -- a dead witness (never launched, or launched and immediately parked) would make every "unreachable" verdict look confirmed for the wrong reason`,
		).toBeGreaterThanOrEqual(MIN_WITNESS_SEGMENTS);
		expect(
			result.pathLengthMm,
			`assertWitnessCorpusHealthy(): witness "${recipe.id}" (${recipe.label}) travelled only ${result.pathLengthMm.toFixed(2)} mm of cumulative path -- too little to be a genuine trajectory`,
		).toBeGreaterThanOrEqual(MIN_WITNESS_PATH_MM);
		expect(
			[...result.closedSwitches],
			`assertWitnessCorpusHealthy(): witness "${recipe.id}" (${recipe.label}) never closed its own expected switch "${recipe.expectedSwitch}" -- makes: ${[...result.closedSwitches].join(',')}`,
		).toContain(recipe.expectedSwitch);
	}
}
