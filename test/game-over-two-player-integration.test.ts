// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.13, QA pass (epic-cycle stage: qa) -- every real-loop game-over
// test elsewhere in this story (`test/game-over-integration.test.ts`,
// `test/stray-clear-integration.test.ts`, `test/stray-clear-game-over-integration.test.ts`)
// runs exactly one player. `players[i].tiltWarnings` is per-player state
// (Story 2.11) that this story's own new ball-start machinery (DW-244's
// stray clear, DW-235's bonus-schedule clear) runs alongside on EVERY ball
// start -- a real regression risk this epic has already measured seventy
// vacuities from is "a reset meant for one thing quietly resets another". A
// single-player run can never show that risk: with one row of state, a
// "fresh" first warning and a "carried" second warning are indistinguishable
// from a shared counter. Two players (Hot seat, Digit1 pressed twice) makes
// them distinguishable: player 0's own count must survive player 1's entire
// turn AND player 0's own ball 1 -> ball 2 transition, while player 1's own
// first warning must land on player 1's row, never player 0's. This file
// also gives `game_ended.scores`, the Match draw and the Attract score
// labels their first REAL, more-than-one-player exercise in this story.
//
// `-integration.test.ts`-suffixed, so `test/rules-devices-headless.test.ts`'s
// ENTRY_FILES ratchet excludes it (it does not match `test/rules-*.test.ts`).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { advanceBackglass, renderFrame, INITIAL_BACKGLASS_VIEW } from '../src/presentation/backglass/frame';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { GameStart } from '../src/sim/table/names';
import type { InputTransition } from '../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const DISABLED_HAZARD_COILS = ['c_pop_1', 'c_pop_2', 'c_pop_3', 'c_sling_l', 'c_sling_r'] as const;

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

function gameStart(): GameStart {
	return {
		seed: 0,
		tuning: NO_BALL_SAVE_TUNING,
		// tiltWarnings: 5 -- comfortably above the single warning each player
		// gets below, so neither ever actually Tilts (this test's own focus is
		// the WARNING COUNT's persistence and isolation, not a Tilt). ballsPerGame: 2,
		// matchProbability: 1 -- a guaranteed match (every score in this table
		// ends in 00, Design Notes) so BOTH players' winner status is
		// deterministic in one run.
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 5, ballsPerGame: 2, matchProbability: 1 },
		highscores: [],
	};
}

/** `test/rules-tilt-integration.test.ts`'s own two-edge burst: enough to cross the plumb bob's warning threshold while staying comfortably under the ten-edge slam count. */
function warningBurst(startTick: number): InputTransition[] {
	const transitions: InputTransition[] = [];
	for (let i = 0; i < 2; i++) {
		const onTick = startTick + i * 2;
		transitions.push({ tick: onTick, frame: { ...NO_FRAME, nudge_up: true } });
		transitions.push({ tick: onTick + 1, frame: NO_FRAME });
	}
	return transitions;
}

describe('Story 2.13, QA seam -- a two-player game to real game over: tilt warnings carry across a player\'s own balls and stay isolated per player', () => {
	it('Hot seat adds player 2; player 0\'s warning survives player 1\'s whole turn and player 0\'s own ball 1 -> ball 2 transition; player 1\'s own first warning lands fresh on player 1; game_ended carries both scores; Attract labels both players', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });

		// Start (player 0's game begins), then Hot seat: a second Digit1 press
		// while player 0's ball 1 is still in progress adds player 2 -- Story
		// 2.5's own unchanged mechanism, exercised here only as the setup this
		// story's new code must not disturb.
		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 3, frame: NO_FRAME }]);
		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}
		let out = loop.advance(1, []);
		for (let i = 0; i < 5; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, start: true } }]);
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
		expect(out.snapshot.game.players, 'Hot seat must genuinely add a second player before any ball ends').toHaveLength(2);
		expect(out.snapshot.game.players[1]!.tiltWarnings, 'the fresh second player must start at zero warnings').toBe(0);

		/** Holds the manual plunger for a real launch, from wherever `out` currently sits. */
		function plungeAndLaunch(): void {
			out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
			for (let i = 0; i < 1199; i++) {
				out = loop.advance(1, []);
			}
			out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
			let launched = false;
			for (let i = 0; i < 500 && !launched; i++) {
				out = loop.advance(1, []);
				if (out.events.some((e) => e.type === 'ball_launched')) {
					launched = true;
				}
			}
			expect(launched, `a plunge at tick ${out.snapshot.tick} must genuinely launch the served ball`).toBe(true);
		}

		/** Scans forward (bounded) until `ball_ended` arrives; returns the tick it arrived on. Fails the test if it never does. */
		function drainToBallEnded(label: string): number {
			let ended = -1;
			for (let i = 0; i < 20000 && ended === -1; i++) {
				out = loop.advance(1, []);
				if (out.events.some((e) => e.type === 'ball_ended')) {
					ended = out.snapshot.tick;
				}
			}
			expect(ended, `${label} must genuinely drain, or this test is vacuous`).toBeGreaterThan(0);
			return ended;
		}

		/** Fires a two-edge nudge burst from `out`'s current tick and scans (bounded) for `tilt_warning`. Returns its `{ player, remaining }`. */
		function warnAndCapture(): { player: number; remaining: number } {
			const startTick = out.snapshot.tick + 5;
			const burst = warningBurst(startTick);
			let captured: { player: number; remaining: number } | null = null;
			for (let tick = startTick; tick < startTick + 1600 && captured === null; tick++) {
				const pending = burst.filter((t) => t.tick === tick);
				out = loop.advance(1, pending);
				const warning = out.events.find((e) => e.type === 'tilt_warning');
				if (warning && warning.type === 'tilt_warning') {
					captured = { player: warning.player, remaining: warning.remaining };
				}
			}
			expect(captured, 'a two-edge burst must genuinely produce a tilt_warning').not.toBeNull();
			expect(out.snapshot.game.machine.tilt.tilted, 'this single warning must never itself Tilt (tiltWarnings: 5)').toBe(false);
			return captured!;
		}

		// --- Player 0, ball 1: settle, plunge, warn once. ---
		plungeAndLaunch();
		expect(out.snapshot.game.currentPlayer).toBe(0);
		expect(out.snapshot.game.players[0]!.ballNumber).toBe(1);
		const warning0 = warnAndCapture();
		expect(warning0, 'player 0\'s own first warning must land on player 0').toEqual({ player: 0, remaining: 4 });
		expect(out.snapshot.game.players[0]!.tiltWarnings).toBe(1);
		expect(out.snapshot.game.players[1]!.tiltWarnings, 'player 1 must be wholly unaffected by player 0\'s own warning').toBe(0);

		// --- Player 0's ball 1 drains; rotates to player 1's ball 1. Player 0's warning must survive the rotation untouched. ---
		drainToBallEnded('player 0\'s ball 1');
		expect(out.snapshot.game.currentPlayer, 'rotates to player 1').toBe(1);
		expect(out.snapshot.game.players[1]!.ballNumber).toBe(1);
		expect(out.snapshot.game.players[0]!.tiltWarnings, 'player 0\'s warning count must survive the rotation to player 1 -- neither DW-244\'s stray clear nor DW-235\'s bonus-schedule clear at this new ball start may touch it').toBe(1);
		expect(out.snapshot.game.phase, 'not yet the last player\'s last ball').toBe('game');

		// --- Player 1, ball 1: settle, plunge, warn once -- must land FRESH on player 1, not accumulate onto player 0's row. ---
		plungeAndLaunch();
		expect(out.snapshot.game.currentPlayer).toBe(1);
		const warning1 = warnAndCapture();
		expect(warning1, 'player 1\'s own first warning must land fresh on player 1, isolated from player 0\'s already-elevated count').toEqual({ player: 1, remaining: 4 });
		expect(out.snapshot.game.players[1]!.tiltWarnings).toBe(1);
		expect(out.snapshot.game.players[0]!.tiltWarnings, 'player 0\'s own count must stay exactly 1 -- player 1\'s warning must never have been misrouted onto it').toBe(1);

		// --- Player 1's ball 1 drains; rotates to player 0's ball 2 -- the core claim: player 0's warning carries across THEIR OWN ball transition. ---
		drainToBallEnded('player 1\'s ball 1');
		expect(out.snapshot.game.currentPlayer, 'rotates back to player 0').toBe(0);
		expect(out.snapshot.game.players[0]!.ballNumber, 'player 0\'s ball 2 begins').toBe(2);
		expect(out.snapshot.game.players[0]!.tiltWarnings, 'the core claim: player 0\'s warning count carries into their OWN ball 2, untouched by this story\'s new ball-start resets').toBe(1);
		expect(out.snapshot.game.players[1]!.tiltWarnings, 'player 1\'s own count also survives the rotation gap').toBe(1);
		expect(out.snapshot.game.phase).toBe('game');

		// --- Player 0's ball 2, then player 1's ball 2 (the last ball overall) -- no further warnings, just reaching real game over. ---
		plungeAndLaunch();
		expect(out.snapshot.game.currentPlayer).toBe(0);
		expect(out.snapshot.game.players[0]!.ballNumber).toBe(2);
		drainToBallEnded('player 0\'s ball 2');
		expect(out.snapshot.game.currentPlayer, 'rotates to player 1\'s ball 2').toBe(1);
		expect(out.snapshot.game.players[1]!.ballNumber).toBe(2);
		expect(out.snapshot.game.phase, 'still not game over -- player 1 has not yet played their last ball').toBe('game');

		plungeAndLaunch();
		expect(out.snapshot.game.currentPlayer).toBe(1);
		expect(out.snapshot.game.players[1]!.ballNumber).toBe(2);

		// The last ball of the last player: a real game over, with BOTH scores.
		let G = -1;
		for (let i = 0; i < 20000 && G === -1; i++) {
			out = loop.advance(1, []);
			const types = out.events.map((e) => e.type);
			if (types.includes('ball_ended')) {
				G = out.snapshot.tick;
				expect(types.indexOf('game_ended'), 'game_ended must follow ball_ended at G').toBeGreaterThan(types.indexOf('ball_ended'));
				const gameEnded = out.events.find((e) => e.type === 'game_ended');
				const scoresAtG = [out.snapshot.game.players[0]!.score, out.snapshot.game.players[1]!.score];
				expect(gameEnded, 'game_ended must carry BOTH players\' scores, in player order').toMatchObject({ scores: scoresAtG });
			}
		}
		expect(G, 'player 1\'s ball 2 must genuinely drain, or this test is vacuous').toBeGreaterThan(0);
		expect(out.snapshot.game.phase).toBe('game_over');
		expect(out.snapshot.game.players, 'both players must still be present at game over').toHaveLength(2);

		// Fold to Attract and confirm both players are labelled (AC 4/AC 10's
		// own format, exercised here for the first time against a REAL
		// multi-player game's own final scores rather than a constructed state).
		const matchTick = G + 5000;
		const resolvedTick = matchTick + 2500;
		const attractTick = resolvedTick + 8000;
		let view = INITIAL_BACKGLASS_VIEW;
		let sawMatchDrawn = false;
		while (out.snapshot.tick < attractTick) {
			out = loop.advance(1, []);
			view = advanceBackglass(view, out);
			const drawn = out.events.find((e) => e.type === 'match_drawn');
			if (drawn && drawn.type === 'match_drawn') {
				sawMatchDrawn = true;
				expect(drawn.winners, 'every score in this table ends in 00, so a guaranteed match wins for BOTH players').toEqual([0, 1]);
			}
		}
		expect(sawMatchDrawn).toBe(true);
		expect(out.snapshot.game.phase).toBe('attract');

		// AC 4: attract_keys holds for the first 3000 ticks of a fresh Attract
		// entry, then attract_prompt, then attract_scores -- advance past both
		// to reach the labelled scores screen before rendering.
		let sawScoresScreen = false;
		for (let i = 0; i < 9000 && !sawScoresScreen; i++) {
			out = loop.advance(1, []);
			view = advanceBackglass(view, out);
			if (view.screen === 'attract_scores') {
				sawScoresScreen = true;
			}
		}
		expect(sawScoresScreen, 'the Attract cycle must genuinely reach its scores screen').toBe(true);
		const attractFrame = renderFrame(view, out.snapshot);
		expect(attractFrame.rows.some((r) => r.text.startsWith('PLAYER 1')), 'Attract must label player 1\'s score').toBe(true);
		expect(attractFrame.rows.some((r) => r.text.startsWith('PLAYER 2')), 'Attract must label player 2\'s score').toBe(true);
	}, 60000);
});
