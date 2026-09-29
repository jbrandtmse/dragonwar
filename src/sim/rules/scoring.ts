// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.0a (AD-8 amended 2026-09-29, Rule 20; PRD FR-15 as decided at
// DW-246): the one scoring gate and the one score-write path.
//
// - `scoringOpen(state)` -- scoring is open only while a game runs
//   (`phase === 'game'`) and the ball is not Tilted. "While Tilted nothing
//   scores -- no switch or device award, no DRAGON letter, no bonus credit,
//   no skill-shot award" (FR-15). Every earner checks it: the base mode's
//   playfield awards, the skill shot's award and letter, the ball
//   controller's letters fold, and both bonus folds (`bonus.ts`).
// - `awardScore(state, player, points)` -- the only path a mode uses to add
//   to `players[player].score`. Later modes (Stories 3.5-3.9) add their
//   awards through it and never write `score` directly. The drain-tick bonus
//   write in `ball-controller/ball-end.ts` is deliberately outside it: it runs at
//   ball end and already forfeits the whole bonus on Tilt.
// - `addDragonLetters(existing, incoming)` -- the de-duplicating letter
//   append (DW-283). `players[p].letters` holds each DRAGON letter at most
//   once, in the order each was first struck, and keeps it across balls (FR-28, FR-40: the
//   letters reset only at War end, Story 3.9).
//
// Pure functions of their arguments: no closure state, no module state, and
// no import from `physics` or `presentation` (AD-1).

import type { GameState } from '../table/names';

/** Story 3.0a (DW-246): `true` only while a game runs and the ball is not Tilted -- the one gate every earner checks. */
export function scoringOpen(state: GameState): boolean {
	return state.phase === 'game' && !state.machine.tilt.tilted;
}

/**
 * Story 3.0a (AD-8): adds `points` to `players[player].score`. Returns the
 * SAME `state` reference when scoring is closed (`scoringOpen()`), when
 * `points <= 0`, or when `players[player]` does not exist.
 */
export function awardScore(state: GameState, player: number, points: number): GameState {
	if (!scoringOpen(state) || !(points > 0) || !state.players[player]) {
		return state;
	}
	const players = state.players.map((existing, index) => (index === player ? { ...existing, score: existing.score + points } : existing));
	return { ...state, players };
}

/**
 * Story 3.0a (DW-283): appends each letter of `incoming`, upper-cased, that
 * `existing` does not already hold, in the order it arrives -- so the result
 * never holds a letter twice. Returns `existing` unchanged when every
 * incoming letter is already present.
 */
export function addDragonLetters(existing: string, incoming: string): string {
	let letters = existing;
	for (const raw of incoming) {
		const letter = raw.toUpperCase();
		if (!letters.includes(letter)) {
			letters += letter;
		}
	}
	return letters;
}
