// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.13, Integration ACs 1, 2 and 3 -- a real `createLoop()`, a genuine
// drain (gravity and passive collision losses alone, `test/backglass-integration.test.ts`'s
// own DISABLED_HAZARD_COILS/dev-autolaunch idiom), piped through the REAL
// `advanceBackglass()` -> `renderFrame()` -> `rasterise()` pipeline exactly as
// `src/host/boot.ts`'s own `onFrame` body does. `matchProbability: 1`
// (guaranteed win) keeps this one run's assertions deterministic; the full
// win/loss draw distribution and the headless game-over TIMELINE are already
// pinned by `test/rules-match.test.ts` -- this file's own job is proving the
// real FrameOutput -> Backglass -> raster composition, never re-deriving the
// draw math.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { advanceBackglass, renderFrame, INITIAL_BACKGLASS_VIEW, BALL_ENDED_HOLD_TICKS } from '../src/presentation/backglass/frame';
import { rasterise } from '../src/presentation/backglass/raster';
import { FONT_5X7 } from '../src/presentation/backglass/font';
import { HARDWARE_COILS } from '../src/sim/rules/ball-controller';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { CoilName, GameStart } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const DISABLED_HAZARD_COILS: readonly CoilName[] = ['c_pop_1', 'c_pop_2', 'c_pop_3', 'c_sling_l', 'c_sling_r'];

/** Same reasoning as `test/backglass-integration.test.ts`'s own override: the drain must be a real one, never intercepted as a ball-save re-serve. */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function gameStart(): GameStart {
	return {
		seed: 0,
		tuning: NO_BALL_SAVE_TUNING,
		// ballsPerGame: 1 -- the served ball's own drain is the LAST ball of
		// the only player, so it is game over. matchProbability: 1 --
		// guarantees a win, so the Backglass's MATCH text is deterministically
		// observable in one run (the draw distribution itself is
		// test/rules-match.test.ts's own job, headless).
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 1, matchProbability: 1 },
		highscores: [],
	};
}

describe('Story 2.13, Integration ACs 1/2/3 -- game over, the Match reveal and the return to Attract, through the REAL Backglass pipeline', () => {
	it('ball_ended then game_ended at G; ball_ended holds through G+2999; game_over from G+3000; the Match reveals to a win at R; Attract (with keys) at R+8000', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });

		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 3, frame: NO_FRAME }]);
		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}
		loop.pulseCoil('c_autolaunch');

		let view = INITIAL_BACKGLASS_VIEW;
		let out = loop.advance(1, []);
		view = advanceBackglass(view, out);
		expect(view.screen, 'sanity: before the drain, the live screen is score').toBe('score');

		// Find G: the drain that ends the only ball of the only player.
		let G = -1;
		let scoreAtG = -1;
		for (let i = 0; i < 20000 && G === -1; i++) {
			out = loop.advance(1, []);
			const eventsAtTick = out.events.map((e) => e.type);
			if (eventsAtTick.includes('ball_ended')) {
				G = out.snapshot.tick;
				const endedIndex = eventsAtTick.indexOf('ball_ended');
				const gameEndedIndex = eventsAtTick.indexOf('game_ended');
				expect(gameEndedIndex, 'AC 1: game_ended must arrive at G, after ball_ended, in the SAME FrameOutput').toBeGreaterThan(endedIndex);
				const gameEnded = out.events.find((e) => e.type === 'game_ended');
				scoreAtG = out.snapshot.game.players[0]!.score;
				expect(gameEnded).toMatchObject({ scores: [scoreAtG] });
				expect(out.snapshot.game.phase, 'phase moves to game_over the SAME tick').toBe('game_over');
			}
			view = advanceBackglass(view, out);
		}
		expect(G, 'the served ball must genuinely drain within the bound -- the whole test is vacuous otherwise').toBeGreaterThan(0);
		// The frame immediately before G showed 'score' -- the positive that the screen actually changed.
		expect(view.screen, 'AC 1: at G the live view is already ball_ended (armed this same tick)').toBe('ball_ended');

		// AC 1: the last ball's hold keeps 'ball_ended' through G + 2999, then 'game_over' from G + 3000.
		let sawGameOverScreen = false;
		let gameOverFrame: ReturnType<typeof renderFrame> | undefined;
		for (let tick = G + 1; tick <= G + BALL_ENDED_HOLD_TICKS + 5 && !sawGameOverScreen; tick++) {
			out = loop.advance(1, []);
			view = advanceBackglass(view, out);
			if (out.snapshot.tick < G + BALL_ENDED_HOLD_TICKS) {
				expect(view.screen, `the hold must still show ball_ended at tick ${out.snapshot.tick}`).toBe('ball_ended');
			} else if (out.snapshot.tick === G + BALL_ENDED_HOLD_TICKS) {
				expect(view.screen, 'the hold releases into game_over at exactly G + BALL_ENDED_HOLD_TICKS').toBe('game_over');
				sawGameOverScreen = true;
				gameOverFrame = renderFrame(view, out.snapshot);
			}
		}
		expect(sawGameOverScreen, 'the game_over screen must genuinely be reached').toBe(true);

		// AC 1: the game_over frame's player band carries the dots of the final
		// score, and its status band carries GAME OVER (nothing on the right
		// yet -- no reveal step has arrived).
		expect(gameOverFrame!.rows.some((r) => r.text === 'GAME OVER'), 'GAME OVER must be on the status line').toBe(true);
		const raster = rasterise(gameOverFrame!, FONT_5X7);
		const rows0to7Lit = Array.from({ length: 8 }, (_, r) => r).some((r) => Array.from({ length: raster.cols }, (_, c) => raster.dots[r * raster.cols + c]).some((d) => d === 1));
		expect(rows0to7Lit, 'the player band (rows 0-7) must carry the final score\'s dots').toBe(true);
		expect(gameOverFrame!.rows.some((r) => r.text.includes('MATCH')), 'no MATCH text before any reveal step has arrived').toBe(false);

		// Fold forward to the resolution tick R = matchTick + 2500, tracking
		// match_drawn/match_reveal_step and the reveal's own two-digit text.
		const matchTick = G + 5000;
		const resolvedTick = matchTick + 2500;
		let sawMatchDrawn = false;
		let sawTenSteps = 0;
		let matchNumber = -1;
		while (out.snapshot.tick < resolvedTick) {
			out = loop.advance(1, []);
			view = advanceBackglass(view, out);
			const drawn = out.events.find((e) => e.type === 'match_drawn');
			if (drawn && drawn.type === 'match_drawn') {
				sawMatchDrawn = true;
				matchNumber = drawn.number;
				expect(out.snapshot.tick, 'match_drawn must arrive exactly at matchTick').toBe(matchTick);
				expect(drawn.winners, 'matchProbability 1 guarantees a win').not.toEqual([]);
			}
			if (out.events.some((e) => e.type === 'match_reveal_step')) {
				sawTenSteps += 1;
			}
		}
		expect(sawMatchDrawn, 'match_drawn must arrive').toBe(true);
		expect(sawTenSteps, 'exactly ten match_reveal_step events must arrive').toBe(10);
		expect(matchNumber, 'a guaranteed win with a single player of score >= 0 draws 0 (the only multiple of ten a zero-mod-100 score can match)').toBe(0);

		// At resolution, the game_over screen's status line shows MATCH 00 (a win).
		const resolvedFrame = renderFrame(view, out.snapshot);
		expect(resolvedFrame.rows.some((r) => r.text === 'MATCH 00'), 'a winning resolution shows MATCH 00 on the status line').toBe(true);

		// AC 3: the machine returns to Attract at resolvedTick + 8000, via the
		// shared enterAttract() helper (the same disable batch a Slam issues).
		const attractTick = resolvedTick + 8000;
		let sawAttract = false;
		while (out.snapshot.tick < attractTick) {
			out = loop.advance(1, []);
			view = advanceBackglass(view, out);
			if (out.snapshot.tick === attractTick) {
				expect(out.snapshot.game.phase, 'the machine reaches Attract at exactly resolvedTick + 8000').toBe('attract');
				expect(out.snapshot.game.modes).toEqual([]);
				expect(out.snapshot.game.machine.hardwareEnabled).toBe(false);
				sawAttract = true;
			} else {
				expect(out.snapshot.game.phase, `still game_over before attractTick (tick ${out.snapshot.tick})`).toBe('game_over');
			}
		}
		expect(sawAttract, 'the machine must genuinely reach Attract').toBe(true);
		expect(view.screen, 'a fresh Attract entry opens with the keys screen').toBe('attract_keys');
		expect(HARDWARE_COILS.length, 'sanity: HARDWARE_COILS is non-empty, or the disable-batch claim above is vacuous').toBeGreaterThan(0);
	}, 60000);
});
