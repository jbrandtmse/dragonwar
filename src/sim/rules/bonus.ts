// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.10 (AD-19): the single owner of the bonus vocabulary and
// arithmetic -- AD-19 names "modes, scoring and the ball controller" as the
// consumers of device and shot events, and this is the scoring peer that
// AD-19 has always described and the tree never had. Two pure folds, each
// gated on `phase === 'game'` and a present `players[currentPlayer]`, each
// returning the SAME `GameState` reference when nothing changed, each
// writing only `players[currentPlayer].bonus`:
//
// - `creditBonusFromDeviceEvents()` -- called from `sim/rules/index.ts`
//   BEFORE the ball controller, over `deviceResult.events`, so a category
//   credited on the drain tick lands inside that ball's own `ball_ended`
//   payload (the ball controller reads `player.bonus` at `:596`, after this
//   fold has already run against `stateAfterAccounting`).
// - `advanceBonusMultiplier()` -- called from `sim/rules/index.ts` AFTER the
//   mode stack, over `modeStackResult.events` (`RulesStepResult.modeEvents`,
//   `sim/rules/modes/events.ts`) -- `DW-208`'s first production consumer:
//   `lanes_completed` does not exist before the mode stack runs, so this
//   fold cannot run any earlier. `LanesCompletedEvent` carries no player
//   field (it is a bare "this set completed" report), so -- like the credit
//   fold -- it keys off `state.currentPlayer`. This header is the one place
//   the ordering's residual is documented (code review 2026-09-08: the
//   previous text pointed at "`sim/rules/index.ts`'s own Design Notes",
//   which that file does not have -- its header's "Sequencing note" is about
//   the drop bank's `ball_will_start` reset). The residual, stated exactly:
//   a `lanes_completed` produced on the EXACT tick a drain also rotates
//   `currentPlayer` advances the NEW player's multiplier, never the ending
//   player's -- and because this fold runs on `modeStackResult.state`, which
//   is already past `startBall()`'s own per-ball reset, that means handing
//   the incoming player a 2x on their FIRST ball. On a game-over drain the
//   fold instead no-ops entirely (`phase` is `game_over` by then) and the
//   completion is discarded rather than deferred. Both are unreachable in
//   Epic 2 -- a Top-lane rollover and a trough entry are two switches one
//   ball cannot close on one tick, and Epic 2 has no multiball -- and "a
//   multiplier earned in the same millisecond the ball drained does not pay
//   on that ball" stays a defensible answer once Epic 3 makes it reachable.
//
// `strikes` is a declared category with no producer this epic (Epic 3's War
// is the first) -- `bonusTotal()` still sums it, so a seeded non-zero
// `strikes` count is proven to contribute, without this file ever
// fabricating an event that credits it.

import { TABLE } from '../table/dragonwar';
import type { DeviceEvent, ShotMadeEvent } from './devices';
import type { ModeEvent } from './modes';
import type { BonusCategory, PlayerBonusState } from '../contracts/state';
import type { GameState, ShotName } from '../table/names';
import type { ResolvedTuning } from '../table/tuning';

/** The declared category iteration order (PRD FR-20: letters, Loops, Strikes) -- the one place this order is authored; every fold and every total below walks it, never a hand-rolled second list. */
export const BONUS_CATEGORIES: readonly BonusCategory[] = ['letters', 'loops', 'strikes'];

/** Every category at 0, multiplier at the ladder's first rung -- `emptyPlayer()`'s own boot value and `startBall()`'s per-ball reset (AC 6), both in `ball-controller.ts`. */
export const BONUS_EMPTY: PlayerBonusState = { byCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1 };

/** The fixed multiplier ladder (PRD FR-20) -- 1x to start, capped at 5x. The one definition of both the steps and the cap: `advanceBonusMultiplier()` below never advances past its last member. */
export const MULTIPLIER_LADDER: readonly number[] = [1, 2, 3, 5];

/** Per-category scoring value, read from `tuning` -- the one place a `BonusCategory` resolves to a `TUNING` key (AD-15: `bonusLetterValue`/`bonusLoopValue`/`bonusStrikeValue`, `sim/table/tuning.ts`). */
function valueOf(category: BonusCategory, tuning: ResolvedTuning): number {
	switch (category) {
		case 'letters':
			return tuning.bonusLetterValue.value;
		case 'loops':
			return tuning.bonusLoopValue.value;
		case 'strikes':
			return tuning.bonusStrikeValue.value;
	}
}

/** AC 3: `Σ byCategory[c] × value(c)`, then the WHOLE subtotal scaled by `multiplier` once -- never per category. `strikes` sums like any other category even though nothing credits it this epic (Design Notes, "the arithmetic covers it"). */
export function bonusTotal(bonus: PlayerBonusState, tuning: ResolvedTuning): number {
	let subtotal = 0;
	for (const category of BONUS_CATEGORIES) {
		subtotal += bonus.byCategory[category] * valueOf(category, tuning);
	}
	return subtotal * bonus.multiplier;
}

/** One entry of `bonusCountUpSteps()` below: `category` names which category this step just added (the FINAL entry, the multiplier-applied grand total, carries `null`). */
export interface BonusCountUpStep {
	readonly category: BonusCategory | null;
	readonly running: number;
}

/**
 * Task 7(e): the end-of-ball count-up's own arithmetic, laid out as an
 * ordered list so `sim/rules/ball-controller.ts` (the sole owner of the
 * count-up's TIMING -- it alone holds the pre-rotation `endingPlayer` and
 * the tick clock) only has to stamp each entry with a tick and a
 * `player`/`step`/`steps` field. One entry per NONZERO category, in
 * `BONUS_CATEGORIES` order, each `running` the UN-multiplied subtotal
 * through that category; then one final entry (`category: null`) whose
 * `running` is `bonusTotal()`'s own result, called directly so this list's
 * last entry can never drift from the `total` the controller separately
 * computes for the `ball_ended` payload (task 7(d)) -- one arithmetic path,
 * read twice, never two.
 */
export function bonusCountUpSteps(bonus: PlayerBonusState, tuning: ResolvedTuning): readonly BonusCountUpStep[] {
	const steps: BonusCountUpStep[] = [];
	let running = 0;
	for (const category of BONUS_CATEGORIES) {
		const count = bonus.byCategory[category];
		if (count <= 0) {
			continue;
		}
		running += count * valueOf(category, tuning);
		steps.push({ category, running });
	}
	steps.push({ category: null, running: bonusTotal(bonus, tuning) });
	return steps;
}

/** `TABLE.bonusWiring`'s own key set is a subset of `ShotName` (task 1: the Ramp is deliberately absent) -- cast once here, at the one file permitted to read `TABLE.bonusWiring` (AD-19's scoring peer). */
const BONUS_WIRING = TABLE.bonusWiring as Readonly<Partial<Record<ShotName, BonusCategory>>>;

const MADE_SUFFIX = '_made';

/** A `DeviceEvent` whose `type` is `${ShotName}_made` -- the only member of the union that ends in `_made` (`sim/rules/devices/events.ts`'s own closed list), so the suffix alone is a safe, exhaustive discriminator. */
function isShotMadeEvent(event: DeviceEvent): event is ShotMadeEvent {
	return event.type.endsWith(MADE_SUFFIX);
}

/** Recovers the shot name a `ShotMadeEvent` reports by stripping its own `_made` suffix -- never a spelled-out shot name (AD-16). */
function shotNameOf(event: ShotMadeEvent): ShotName {
	return event.type.slice(0, -MADE_SUFFIX.length) as ShotName;
}

/**
 * AC 1: one letter target (`bank_target_down`) or one wired shot
 * (`shot_left_loop_made`/`shot_right_loop_made`, via `TABLE.bonusWiring`)
 * credits its category by exactly 1. `shot_ramp_made` and every other device
 * event credit nothing -- `TABLE.bonusWiring` has no entry for the Ramp
 * (task 1). Gated on `phase === 'game'` and a present current player;
 * returns `state` unchanged (same reference) when nothing credits.
 */
export function creditBonusFromDeviceEvents(state: GameState, deviceEvents: readonly DeviceEvent[]): GameState {
	if (state.phase !== 'game') {
		return state;
	}
	const currentPlayer = state.currentPlayer;
	const player = state.players[currentPlayer];
	if (!player) {
		return state;
	}

	let delta: Partial<Record<BonusCategory, number>> | undefined;
	for (const event of deviceEvents) {
		let category: BonusCategory | undefined;
		if (event.type === 'bank_target_down') {
			category = 'letters';
		} else if (isShotMadeEvent(event)) {
			category = BONUS_WIRING[shotNameOf(event)];
		}
		if (category !== undefined) {
			delta ??= {};
			delta[category] = (delta[category] ?? 0) + 1;
		}
	}
	if (!delta) {
		return state;
	}

	const byCategory: Record<BonusCategory, number> = { ...player.bonus.byCategory };
	for (const category of BONUS_CATEGORIES) {
		const increment = delta[category];
		if (increment) {
			byCategory[category] += increment;
		}
	}
	const players = state.players.map((existing, index) =>
		index === currentPlayer ? { ...existing, bonus: { ...existing.bonus, byCategory } } : existing,
	);
	return { ...state, players };
}

/**
 * AC 2/AC 7 (`DW-208`): each `lanes_completed { set: 'top' }` advances the
 * current player's multiplier one rung, never past `MULTIPLIER_LADDER`'s
 * last member; `{ set: 'inout' }` moves nothing. Keys off
 * `state.currentPlayer` -- `LanesCompletedEvent` carries no player field
 * (this file's own header). Gated on `phase === 'game'` and a present
 * current player; returns `state` unchanged (same reference) when nothing
 * advances.
 */
export function advanceBonusMultiplier(state: GameState, modeEvents: readonly ModeEvent[]): GameState {
	if (state.phase !== 'game') {
		return state;
	}
	const currentPlayer = state.currentPlayer;
	const player = state.players[currentPlayer];
	if (!player) {
		return state;
	}

	let multiplier = player.bonus.multiplier;
	let changed = false;
	for (const event of modeEvents) {
		if (event.type !== 'lanes_completed' || event.set !== 'top') {
			continue;
		}
		const rung = MULTIPLIER_LADDER.indexOf(multiplier);
		const nextRung = Math.min(MULTIPLIER_LADDER.length - 1, (rung === -1 ? 0 : rung) + 1);
		const next = MULTIPLIER_LADDER[nextRung]!;
		if (next !== multiplier) {
			multiplier = next;
			changed = true;
		}
	}
	if (!changed) {
		return state;
	}

	const players = state.players.map((existing, index) =>
		index === currentPlayer ? { ...existing, bonus: { ...existing.bonus, multiplier } } : existing,
	);
	return { ...state, players };
}
