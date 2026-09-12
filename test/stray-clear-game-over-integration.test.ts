// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.13, QA pass (epic-cycle stage: qa) -- the seam between DW-244's
// stray clear (AC 5) and this same story's game-over/Match/Attract pipeline
// (ACs 1-3), which no per-AC test crosses: `test/stray-clear-integration.test.ts`
// stops the instant the recovered route's own ball is launched (`ballNumber:
// 1`, `ballsInPlay: 1`) and never lets it drain; `test/game-over-integration.test.ts`
// never has a loose stray ball anywhere in its run. This file drives AC 5's
// own route (a Slam voids a game, leaving a loose ball; Start clears it and
// serves a fresh single-ball game) all the way to that new game's OWN real
// drain, proving the stray-clear machinery leaves no residue -- no phantom
// ball, no stuck sequence, no misattributed event -- that could corrupt the
// real game_ended/match_drawn/Attract chain the served ball's drain then
// fires.
//
// `-integration.test.ts`-suffixed, so `test/rules-devices-headless.test.ts`'s
// ENTRY_FILES ratchet excludes it (it does not match `test/rules-*.test.ts`).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
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
		// ballsPerGame: 1 -- unlike AC 5's own test (ballsPerGame: 3), so the
		// NEW game DW-244's stray clear serves is a single-ball game: its
		// ball 1 is also its last ball, so that ball's own real drain is a
		// genuine game over. matchProbability: 1 -- a guaranteed match, so
		// the reveal's win text is deterministically observable in one run
		// (the draw distribution itself is test/rules-match.test.ts's job).
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 1, matchProbability: 1 },
		highscores: [],
	};
}

/** `test/stray-clear-integration.test.ts`'s own ten-edge burst, reused verbatim: enough to trip the slam detector. */
function tenEdgeBurst(startTick: number): InputTransition[] {
	const transitions: InputTransition[] = [];
	for (let i = 0; i < 10; i++) {
		const onTick = startTick + i * 2;
		transitions.push({ tick: onTick, frame: { ...NO_FRAME, nudge_up: true } });
		transitions.push({ tick: onTick + 1, frame: NO_FRAME });
	}
	return transitions;
}

describe('Story 2.13, QA seam -- DW-244 route 1 (a Slam-voided loose ball) reaching a REAL game over/Match/Attract in the same run', () => {
	it('the stray clear serves a fresh single-ball game whose own real drain fires game_ended, match_drawn and Attract with no residue from the recovery', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });

		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 3, frame: NO_FRAME }]);

		// The manual plunge that serves the FIRST (soon-to-be-voided) game's ball 1.
		let out = loop.advance(1, []);
		for (let i = 0; i < 398; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 1199; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
		let sawLaunch = false;
		for (let i = 0; i < 500 && !sawLaunch; i++) {
			out = loop.advance(1, []);
			if (out.events.some((e) => e.type === 'ball_launched')) {
				sawLaunch = true;
			}
		}
		expect(sawLaunch, 'sanity: the first game\'s ball must genuinely launch').toBe(true);

		// Ten nudge_up edges from 2501 -- a genuine Slam, voiding the game.
		const burstStart = 2501;
		while (out.snapshot.tick < burstStart - 1) {
			out = loop.advance(1, []);
		}
		let sawSlam = false;
		const burst = tenEdgeBurst(burstStart);
		for (let tick = burstStart; tick < burstStart + 400 && !sawSlam; tick++) {
			const pending = burst.filter((t) => t.tick === tick);
			out = loop.advance(1, pending);
			if (out.events.some((e) => e.type === 'slam_tilt')) {
				sawSlam = true;
			}
		}
		expect(sawSlam, 'the burst must genuinely slam-tilt the machine').toBe(true);
		expect(out.snapshot.game.phase, 'a Slam voids the game to Attract').toBe('attract');

		// The premise at 3500 (AC 5's own margin past the Slam's cabinet ringing).
		while (out.snapshot.tick < 3500) {
			out = loop.advance(1, []);
		}
		expect(out.snapshot.game.machine.ballsInPlay, 'the premise: ballsInPlay is stale at 1').toBe(1);
		expect(out.snapshot.balls, 'the premise: exactly one (loose) ball exists').toHaveLength(1);
		const looseBallId = out.snapshot.balls[0]!.id;
		expect(out.snapshot.mechanisms.devices.bd_shooter.slots, 'the premise: the voided ball is not resting in the lane').toEqual([false]);

		// Start at T = 3501 -- clears the stray AND creates the new,
		// single-ball game in the same tick (DW-244 + task 5(b), the exact
		// seam this test targets).
		const T = 3501;
		while (out.snapshot.tick < T - 1) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: T, frame: { ...NO_FRAME, start: true } }]);
		expect(out.snapshot.game.phase, 'Start from Attract creates the new game the same tick').toBe('game');
		expect(out.snapshot.game.players).toHaveLength(1);
		expect(out.snapshot.game.players[0]!.score).toBe(0);

		out = loop.advance(1, [{ tick: T + 1, frame: NO_FRAME }]);
		const missing = out.events.find((e) => e.type === 'ball_missing');
		expect(missing, 'the positive: the loose ball is recovered, reported at T+1').toMatchObject({ count: 1 });
		expect(out.snapshot.balls.some((b) => b.id === looseBallId), 'the recorded loose ball id must be gone').toBe(false);
		expect(out.snapshot.balls, 'exactly the newly-served ball remains').toHaveLength(1);

		out = loop.advance(1, [{ tick: T + 2, frame: NO_FRAME }]);

		// The new game re-enables HARDWARE_COILS (task 5(b)'s Start-from-Attract
		// branch, same as any Start) -- disable the hazards again here so this
		// game's own drain is bounded and deterministic, exactly like every
		// other real-drain test in this suite.
		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}

		// The manual plunge that launches the STRAY-CLEAR-SERVED ball for real play.
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 1199; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
		let sawSecondLaunch = false;
		for (let i = 0; i < 500 && !sawSecondLaunch; i++) {
			out = loop.advance(1, []);
			if (out.events.some((e) => e.type === 'ball_launched')) {
				sawSecondLaunch = true;
			}
		}
		expect(sawSecondLaunch, 'the recovered-route\'s served ball must genuinely launch onto the field').toBe(true);
		expect(out.snapshot.game.players[0]!.ballNumber).toBe(1);
		expect(out.snapshot.game.machine.ballsInPlay).toBe(1);

		// Now let THIS ball drain for real -- it is the new game's only ball,
		// so its drain is a genuine game over, run through the full 2.13
		// pipeline exactly as if no stray had ever been involved.
		let G = -1;
		for (let i = 0; i < 20000 && G === -1; i++) {
			out = loop.advance(1, []);
			const types = out.events.map((e) => e.type);
			if (types.includes('ball_ended')) {
				G = out.snapshot.tick;
				expect(types.indexOf('game_ended'), 'game_ended must follow ball_ended in the SAME FrameOutput, even reached via the stray-clear route').toBeGreaterThan(types.indexOf('ball_ended'));
				const gameEnded = out.events.find((e) => e.type === 'game_ended');
				expect(gameEnded).toMatchObject({ scores: [out.snapshot.game.players[0]!.score] });
			}
		}
		expect(G, 'the stray-clear-served ball must genuinely drain, or this test is vacuous').toBeGreaterThan(0);
		expect(out.snapshot.game.phase).toBe('game_over');
		// No residue: exactly the drained ball is gone, nothing loose remains,
		// and no SECOND game_ended/ball_ended could have snuck in from a
		// leftover stray-clear artefact.
		expect(out.snapshot.balls, 'no residual ball anywhere after the drain').toHaveLength(0);

		// Fold forward: match_drawn at G+5000, and Attract at resolvedTick+8000
		// (R = G+7500). A lighter touch than test/game-over-integration.test.ts's
		// own exhaustive per-tick AC 1/2/3 assertions -- this test's own job is
		// the SEAM (the pipeline still runs correctly after the stray-clear
		// route), not re-pinning the timeline math again.
		const matchTick = G + 5000;
		const resolvedTick = matchTick + 2500;
		const attractTick = resolvedTick + 8000;
		let sawMatchDrawn = false;
		while (out.snapshot.tick < attractTick) {
			out = loop.advance(1, []);
			const drawn = out.events.find((e) => e.type === 'match_drawn');
			if (drawn && drawn.type === 'match_drawn') {
				sawMatchDrawn = true;
				expect(out.snapshot.tick, 'match_drawn must arrive exactly at matchTick, reached via the stray-clear route\'s own new game').toBe(matchTick);
				expect(drawn.winners, 'matchProbability 1 guarantees a win').not.toEqual([]);
			}
			if (out.snapshot.tick === attractTick) {
				expect(out.snapshot.game.phase, 'the machine must genuinely reach Attract afterward').toBe('attract');
			} else {
				expect(out.snapshot.game.phase, `still game_over before attractTick (tick ${out.snapshot.tick})`).toBe('game_over');
			}
		}
		expect(sawMatchDrawn, 'match_drawn must arrive').toBe(true);
		expect(out.snapshot.game.phase).toBe('attract');
	}, 60000);
});
