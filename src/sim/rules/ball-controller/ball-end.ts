// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (DW-290): the ball controller's ball-end seams, moved unchanged
// out of the Epic 2 monolith -- the bonus count-down schedule
// (`armBonusCountSchedule()`) and its per-tick drain (S1), the drain gate
// (S8), the ball end itself (S8b, with the game-over / rotation dispatch,
// S8c, and the schedule arm, S8d) and the DW-235 filter (S12).
//
// Drain (AD-6/AD-18): the ball controller alone mutates `ballsInPlay`, and a
// PARKING device's entry bringing it to zero is what ends a ball (AD-6's
// device-agnostic "closed slot switches and nothing else" -- never a literal
// `bd_trough` check, so this reads the same whichever parking device the last
// ball happens to park in).

import { TABLE } from '../../table/dragonwar';
import { bonusCountDownSteps, bonusTotal } from '../bonus';
import { stopAllModes } from '../modes/lifecycle';
import { armGameOver } from './game-over';
import { pushStarted, startBall } from './start';
import type { ControllerContext, TickOutput } from './shared';
import type { DeviceEvent } from '../devices';
import type { BonusCountStepEvent } from '../../contracts/events';
import type { PlayerBonusState } from '../../contracts/state';
import type { GameState, MachineReport, SemanticEvent } from '../../table/names';

/**
 * Turns `bonusCountDownSteps()`'s arithmetic (`sim/rules/bonus.ts`) into a
 * timed schedule for `player`, the first step landing `bonusCountTicks`
 * after `endedTick` (the `ball_ended` tick) and each later one
 * `bonusCountTicks` after the previous -- leaving the schedule EMPTY when
 * `bonus`'s own total is 0. Story 3.0 (DW-236): the steps count DOWN, one
 * per nonzero category, each carrying the bonus still `remaining`, the
 * last at exactly 0. `total` is `bonusTotal()`, the SAME call the drain
 * branch's `ball_ended` payload reads.
 *
 * Code review 2026-09-08 (blind-hunter, edge-case-hunter, acceptance
 * auditor, independently): the clear happens FIRST, before the zero-total
 * early return, so "arming replaces any previous schedule wholesale" is
 * true on every path rather than only when the next ball also has a
 * nonzero bonus. Previously a zero-total end returned before assigning,
 * and the tilted end skipped this function entirely, so the PREVIOUS
 * ball's still-pending steps survived and kept draining -- and since
 * `advanceBackglass()` matches a step against the held payload's own
 * player, a single-player game (where both ends carry the same index)
 * rendered the previous ball's `BONUS` row over the new ball's own
 * `ball_ended` screen. That contradicts this story's "Zero bonus" and
 * "Tilted ball end" I/O rows, whose "no `bonus_count_step` is emitted"
 * otherwise held only by the accident of nothing having been armed
 * earlier in the run.
 */
function armBonusCountSchedule(ctx: ControllerContext, player: number, bonus: PlayerBonusState, endedTick: number): void {
	const { cs, tuning, bonusCountTicks } = ctx;
	cs.pendingBonusCountSteps = [];
	const total = bonusTotal(bonus, tuning);
	const steps = bonusCountDownSteps(bonus, tuning);
	if (total <= 0 || steps.length === 0) {
		return;
	}
	cs.pendingBonusCountSteps = steps.map((step, index) => {
		const stepNumber = index + 1;
		const dueTick = endedTick + bonusCountTicks * stepNumber;
		const event: BonusCountStepEvent = {
			type: 'bonus_count_step',
			player,
			step: stepNumber,
			steps: steps.length,
			remaining: step.remaining,
			total,
			tick: dueTick,
		};
		return { tick: dueTick, event };
	});
}

/**
 * S1. Story 2.10, task 7(e): drain any bonus_count_step(s) due THIS tick --
 * independent of every other concern (it reports a PAST ball_ended's own
 * payment, never this tick's own drain), so its position relative to the
 * ball-save expiries is arbitrary; kept first for visibility, mirroring the
 * schedule's own doc comment.
 *
 * Story 3.0 (DW-285): never in Attract. A Slam tilt ends the game
 * straight to Attract (`tiltController.step()` runs BEFORE this
 * controller in `sim/rules/index.ts`, so `phase` has already flipped by
 * the time this reads it -- this reads the INPUT state's phase), and a
 * count still running from the previous drain used to keep emitting into
 * Attract. The first time this controller sees Attract the schedule is
 * cleared, so nothing is emitted on that tick or any later one.
 * `game_over` is NOT gated: the last ball's own count runs there, inside
 * the end-of-ball hold.
 */
export function drainBonusCountSteps(ctx: ControllerContext, state: GameState, tick: number, out: TickOutput): void {
	const { cs } = ctx;
	if (cs.pendingBonusCountSteps.length > 0 && state.phase === 'attract') {
		cs.pendingBonusCountSteps = [];
	}
	if (cs.pendingBonusCountSteps.length > 0) {
		const due = cs.pendingBonusCountSteps.filter((scheduled) => scheduled.tick === tick);
		if (due.length > 0) {
			out.events.push(...due.map((scheduled) => scheduled.event));
			cs.pendingBonusCountSteps = cs.pendingBonusCountSteps.filter((scheduled) => scheduled.tick !== tick);
		}
	}
}

/**
 * S8: the drain gate -- `true` when this tick's parking entry ended the ball
 * in play.
 *
 * Story 2.13 (the "Stray drain on the Start tick" I/O row): a voided
 * ball's own parking entry landing on the EXACT tick Start just
 * created a new game must never end that brand-new ball 1 through
 * this branch -- `newGameStartedThisTick` is this tick's own guard
 * (the t+1 stray-clear recover removes the loose ball before physics
 * steps again, so this is a one-tick window, never reachable later).
 *
 * Rework iteration 1 (CR-1/DW-269): `newGameStartedThisTick` alone
 * covers only Start's OWN tick -- it says nothing about the stray
 * clear's own REPORT tick, one tick later, which is exactly where the
 * physics fix for CR-1 (`devices.ts`'s `recover()` now closing the
 * trough slot it parks into, AD-6 amended) introduces a second,
 * sibling hazard: that closed-slot edge is itself a
 * `device_ball_entered` on a parking device, landing on a tick where
 * `ballsInPlay` is still 0 (route 1's own brand-new ball 1, or any
 * mid-game rotation's fresh serve). Read naively, `parkingEntryThisTick`
 * would be true and this branch would fire a SPURIOUS `ball_ended` on
 * the ball that was just served -- DW-269, filed by Story 2.13's own
 * first code review and closed there. The recover's own park is never a
 * drain (a ball leaving the simulated set to be RETURNED to the
 * trough, never one arriving there from open play), so it is excluded
 * by the SAME kind of tick-scoped guard as `newGameStartedThisTick`
 * above: `machineReport.recovered` is non-null on (and only on) a tick
 * whose machine report answers a `RecoverCommand` this same tick
 * consumed -- the stray clear's own report tick (`pendingStrayClear.tick
 * + 1`) always carries one (Design Notes, "every ball start clears
 * strays itself"), and ball search's own recover answers the identical
 * way. A genuine drain reaching zero coincides with a recover's own
 * report tick only within that one-tick window right after a serve --
 * exactly where `applyRecovery()` has already forced `ballsInPlay` to
 * 0 by construction (every simulated ball is inside a device once a
 * recover has run), so there is no OTHER ball this guard could ever be
 * hiding a real drain for.
 */
export function ballEndGateOpen(
	state: GameState,
	deviceEvents: readonly DeviceEvent[],
	machineReport: MachineReport,
	newGameStartedThisTick: boolean,
): boolean {
	const parkingEntryThisTick = deviceEvents.some(
		(event) => event.type === 'device_ball_entered' && TABLE.ballDevices[event.device].kind === 'parking',
	);
	return (
		!newGameStartedThisTick &&
		machineReport.recovered === null &&
		state.phase === 'game' &&
		parkingEntryThisTick &&
		state.machine.ballsInPlay === 0
	);
}

/**
 * S8b-S8d: the ball ends for `currentPlayer` -- the bonus is paid (or
 * forfeited under Tilt), the modes are torn down, `ball_ended` fires, the
 * game ends (`armGameOver()`, `./game-over.ts`) or play rotates
 * (`startBall()`, `./start.ts`), and the bonus count-down is armed.
 */
export function endBall(ctx: ControllerContext, state: GameState, tick: number, out: TickOutput): GameState {
	const { cs, adjustments, tuning } = ctx;
	let nextState = state;
	const endingPlayer = nextState.currentPlayer;
	const player = nextState.players[endingPlayer]!;

	// Story 2.10, task 7(d) (AC 3/AC 5): a tilted ball forfeits the whole
	// bonus -- `total` is forced to 0 rather than merely left unpaid, so
	// the `ball_ended` payload and the score write below agree with each
	// other by construction. `bonusTotal()` is `sim/rules/bonus.ts`'s own
	// arithmetic, read here and nowhere re-derived.
	const tilted = nextState.machine.tilt.tilted;
	const total = tilted ? 0 : bonusTotal(player.bonus, tuning);

	// Mode teardown, STRICTLY before ball_ended (AC 5; epics.md:1383-1392's
	// narrowed _will_stop clause): every active mode's name is credited to
	// the ENDING player's modesPlayed -- captured from `endingPlayer` here,
	// before any rotation below could move `currentPlayer`, and before the
	// stop below empties the list. AD-7: "modes[] is empty between balls".
	// Story 2.10, task 7(d): the SAME map now also pays `total` onto the
	// ending player's own score -- the ball controller's first score write
	// (Design Notes, "The score-ownership decision, made deliberately") -- so
	// the two can never diverge into separate passes over `players`.
	const modeNames = nextState.modes.map((mode) => mode.mode);
	const playersAfterTeardown = nextState.players.map((existing, index) =>
		index === endingPlayer
			? { ...existing, modesPlayed: [...existing.modesPlayed, ...modeNames], score: existing.score + total }
			: existing,
	);
	nextState = { ...nextState, players: playersAfterTeardown };
	// Story 3.1 (AD-8, AC 5): every active mode receives its stop triple
	// (`_will_stop / _stopping / _stopped`, descending priority, its stop
	// hooks run in place) BEFORE `ball_ended` is pushed -- the lifecycle is
	// the only path that empties the list.
	const stopped = stopAllModes(nextState, tick, ctx.modes);
	nextState = stopped.state;
	out.modeEvents.push(...stopped.events);

	out.events.push({
		type: 'ball_ended',
		player: endingPlayer,
		bonusByCategory: player.bonus.byCategory,
		multiplier: player.bonus.multiplier,
		total,
		tilted,
		tick,
	});

	const isLastPlayer = endingPlayer === nextState.players.length - 1;
	const gameOver = isLastPlayer && player.ballNumber >= adjustments.ballsPerGame;

	if (gameOver) {
		nextState = armGameOver(ctx, nextState, tick, out);
	} else {
		const nextPlayer = isLastPlayer ? 0 : endingPlayer + 1;
		const started = startBall(ctx, nextState, nextPlayer, tick);
		nextState = started.state;
		pushStarted(out, started);
	}

	// Story 2.10, task 7(e): armed AFTER the game-over/rotation block
	// above, deliberately -- `startBall()` (called inside that block, on
	// this SAME tick, for a non-game-over drain) resets the NEW ball's
	// `bonus` but has no reason to touch this closure-held schedule; the
	// ordering here is about reading `player.bonus` (the ENDING player's
	// pre-teardown snapshot, captured above and untouched by teardown)
	// AFTER the branch that could rotate `currentPlayer`, not about
	// protecting the schedule from being wiped. Never armed for a tilted
	// ball (`total` is already forced 0 above, but `player.bonus` itself
	// is NOT -- passing it through unconditionally would compute a
	// nonzero count-down from the forfeited categories).
	if (tilted) {
		// Code review 2026-09-08: a tilted end arms nothing, but it must
		// still CANCEL whatever the previous ball armed -- see
		// `armBonusCountSchedule()`'s own note. A ball end always ends the
		// previous ball's count-down, armed or not.
		cs.pendingBonusCountSteps = [];
	} else {
		armBonusCountSchedule(ctx, endingPlayer, player.bonus, tick);
	}
	return nextState;
}

/**
 * S12. Story 2.15 (DW-235): no `bonus_count_step` may be emitted on or
 * after the tick a new game is created. `pendingBonusCountSteps` IS
 * cleared on that tick (the Start handling, `./start.ts`, "clears BOTH
 * pendingBonusCountSteps (DW-235) and the old sequence"), but the
 * bonus-step drain (S1, `drainBonusCountSteps()` above) runs BEFORE
 * Start-handling in the SAME `step()` call -- so a step due on
 * EXACTLY the tick Start is pressed is drained into `events` before
 * the clear ever runs. Reproduced by this story's own pinning test in
 * test/rules-bonus.test.ts at tick 805 (drainTick 5, Start at 805);
 * Story 2.13's original ad-hoc probe measured the same structural
 * scenario at tick 810 under its own parameterisation. Filtered here rather than
 * reordered: the only OTHER return in `step()` (the ball-save
 * re-serve's early return) is gated on `!newGameStartedThisTick`, so
 * it is provably unreachable on this tick and this is the one place
 * that can ever see a stale-game `bonus_count_step` slip through.
 */
export function withoutStaleBonusSteps(events: SemanticEvent[], newGameStartedThisTick: boolean): SemanticEvent[] {
	return newGameStartedThisTick ? events.filter((event) => event.type !== 'bonus_count_step') : events;
}
