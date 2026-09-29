// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (DW-290): the ball controller's game-over seams, moved unchanged
// out of the Epic 2 monolith. Story 2.13: the last player's last ball ends
// the game by firing `game_ended { scores }` and arming a closure-held
// sequence (`ControllerState.gameOverSequence`) that, unattended, draws the
// Match from `GameState.rng` at `matchDelayTicks`, paces its ten
// `match_reveal_step`s at `matchRevealTicks`, and returns the machine to
// Attract at `attractTicks` past resolution via the shared `enterAttract()`
// helper (`./shared.ts`, which `sim/rules/tilt.ts`'s Slam path uses too).
// Start is honoured from `game_over` once that sequence has resolved
// (`gameOverResolved()` below, read by `./start.ts`).
//
// The game-over arm keeps its own `HARDWARE_COILS` disable loop: it is
// deliberately NOT merged with `enterAttract()`, which runs later, at the
// Attract tick.

import { drawMatch, MATCH_REVEAL_STEPS, revealShown } from '../match';
import { enterAttract, HARDWARE_COILS, type ControllerContext, type TickOutput } from './shared';
import type { GameState } from '../../table/names';

/** The sequence's own record lives in the leaf `./shared.ts` (`no-circular`: `ControllerState` holds it); re-exported here beside the seams that arm and drain it. */
export type { GameOverSequence } from './shared';

/**
 * S2 (game-over half). Story 2.13 (AD-7): reset-safety FIRST -- a mark
 * strictly greater than `tick` means a restarted timeline (`tilt.ts:88-97`'s
 * own precedent), discarded before the record is read below.
 */
export function discardStaleGameOverSequence(ctx: ControllerContext, tick: number): void {
	const { cs } = ctx;
	if (cs.gameOverSequence !== null && tick < cs.gameOverSequence.armTick) {
		cs.gameOverSequence = null;
	}
}

/**
 * S3. Story 2.13 (task 5(e)): the game-over sequence's own paced drain --
 * the Match draw, its ten reveal steps, and the eventual Attract
 * transition. Positioned beside the bonus drain (both report a PAST tick's
 * own scheduled consequence) and, critically, BEFORE the Start handling
 * (`./start.ts`): "a Start on the Attract tick starts a game" requires
 * `enterAttract()`'s own `phase: 'attract'` write to have already landed on
 * the state by the time Start is read this same tick.
 */
export function stepGameOverSequence(ctx: ControllerContext, state: GameState, tick: number, out: TickOutput): GameState {
	const { cs, adjustments, matchRevealTicks } = ctx;
	let nextState = state;
	if (cs.gameOverSequence !== null) {
		if (tick === cs.gameOverSequence.matchTick) {
			const draw = drawMatch(nextState.rng, cs.gameOverSequence.scores, adjustments.matchProbability);
			nextState = { ...nextState, rng: draw.rng };
			out.events.push({ type: 'match_drawn', number: draw.number, winners: draw.winners, tick });
			cs.gameOverSequence = { ...cs.gameOverSequence, drawn: { number: draw.number, winners: draw.winners } };
		}

		const ticksSinceMatch = tick - cs.gameOverSequence.matchTick;
		// `matchRevealTicks` is clamped to at least 1 at its single
		// derivation site (`./index.ts`), so this modulo can never see 0 (and
		// so can never evaluate to `NaN`). The `> 0` conjunct is kept as dead
		// defence-in-depth for a future caller that derives the value some
		// other way; it is NOT what makes a zero-valued `matchRevealMs`
		// safe -- see the derivation comment for why it never was.
		if (matchRevealTicks > 0 && cs.gameOverSequence.drawn !== null && ticksSinceMatch > 0 && ticksSinceMatch % matchRevealTicks === 0) {
			const revealStep = ticksSinceMatch / matchRevealTicks;
			if (revealStep <= MATCH_REVEAL_STEPS) {
				out.events.push({
					type: 'match_reveal_step',
					step: revealStep,
					steps: MATCH_REVEAL_STEPS,
					shown: revealShown(cs.gameOverSequence.drawn.number, revealStep),
					tick,
				});
			}
		}

		if (tick >= cs.gameOverSequence.attractTick) {
			const attract = enterAttract(nextState, tick, ctx.modes);
			out.coilCommands.push(...attract.coilCommands);
			out.modeEvents.push(...attract.modeEvents);
			nextState = attract.state;
			cs.gameOverSequence = null;
		}
	}
	return nextState;
}

/**
 * The gate S6 reads: Story 2.13 (task 5(b)) -- Start is ALSO honoured from
 * `game_over`, once the game-over sequence has resolved (I/O Matrix, "Start
 * after resolution" / "Start during the reveal") -- `gameOverSequence ===
 * null` covers the theoretical case where a game somehow reaches
 * `game_over` with no sequence armed (never true in production, but a test
 * can construct one directly), letting Start through rather than wedging
 * the machine.
 */
export function gameOverResolved(ctx: ControllerContext, state: GameState, tick: number): boolean {
	const { cs } = ctx;
	return state.phase === 'game_over' && (cs.gameOverSequence === null || tick >= cs.gameOverSequence.resolvedTick);
}

/**
 * S8c (game-over arm): the last player's last ball has ended. Disables the
 * AD-5 hardware set, moves `phase` to `game_over`, fires `game_ended` and
 * arms the sequence from THIS tick (G).
 */
export function armGameOver(ctx: ControllerContext, state: GameState, tick: number, out: TickOutput): GameState {
	const { cs, matchDelayTicks, matchRevealTicks, attractTicks } = ctx;
	for (const coil of HARDWARE_COILS) {
		out.coilCommands.push({ type: 'coil', coil, action: 'disable', tick });
	}
	const nextState: GameState = { ...state, phase: 'game_over', machine: { ...state.machine, hardwareEnabled: false } };

	// Story 2.13 (AD-6/AD-7/AD-9, task 5(e)): `game_ended` fires the
	// SAME tick, right after `ball_ended` (I/O Matrix, "Game over"):
	// `scores[i]` is `players[i]`'s score AFTER the bonus this drain just
	// paid -- read from the state the teardown (`./ball-end.ts`) already
	// updated. The game-over sequence is armed from THIS tick (G): the Match
	// draw, its ten reveal steps and the eventual Attract transition are all
	// paced from here, in `step()`'s own top-of-tick drain
	// (`stepGameOverSequence()` above).
	const scores = nextState.players.map((existing) => existing.score);
	out.events.push({ type: 'game_ended', scores, tick });
	// All three `...Ticks` below are clamped to at least 1 at their single
	// derivation site (see the comment there), so `matchTick` is always
	// STRICTLY greater than `armTick` (this same `tick`), `resolvedTick`
	// strictly greater than `matchTick`, and `attractTick` strictly
	// greater than `resolvedTick`. Every milestone therefore falls on a
	// tick the top-of-`step()` block has yet to see.
	const matchTick = tick + matchDelayTicks;
	const resolvedTick = matchTick + MATCH_REVEAL_STEPS * matchRevealTicks;
	cs.gameOverSequence = {
		armTick: tick,
		scores,
		matchTick,
		resolvedTick,
		attractTick: resolvedTick + attractTicks,
		drawn: null,
	};
	return nextState;
}
