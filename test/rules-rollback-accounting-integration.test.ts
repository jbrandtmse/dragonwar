// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.12, task 1 (DW-187, AC 12): the pinning test for the rolled-back-
// ball double count. Rule 19: written and run BEFORE task 2's fix, and
// observed RED on today's code at the roll-back assertion (see this file's
// own `## Verification` note in the story's implementation report -- today's
// code gives `ballsInPlay` 1 after the roll-back, 2 after the re-plunge, 1
// after the drain, and no `ball_ended`). Green after the fix
// (`sim/rules/ball-controller.ts`'s `applyDeviceEvents`, task 2).
//
// Driven entirely through a real `createLoop()`, real input (`InputTransition`s),
// and real physics -- no fabricated events, no stubbed accounting. Mirrors
// `test/backglass-integration.test.ts`'s own real-loop Start/hazard-disable
// pattern. Named `*-integration.test.ts` (not the bare
// `rules-rollback-accounting.test.ts` a first pass used) so
// `test/rules-devices-headless.test.ts`'s own ENTRY_FILES completeness ratchet
// -- which requires every OTHER `test/rules-*.test.ts` file to be headless --
// correctly exempts this one: it drives `sim/loop` on purpose.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { CoilName, GameStart } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const DISABLED_HAZARD_COILS: readonly CoilName[] = ['c_pop_1', 'c_pop_2', 'c_pop_3', 'c_sling_l', 'c_sling_r'];
const MAX_TICKS = 20000;

/** Mirrors `test/backglass-integration.test.ts`'s own NO_BALL_SAVE_TUNING -- a ball-save window shrunk to near-zero so this file's own weak-plunge roll-back and later drain are never intercepted as a save. */
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
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0 },
		highscores: [],
	};
}

describe('DW-187 (AC 12): a rolled-back ball leaves play, and its drain ends the ball -- real createLoop, real plunger input, production pitch', () => {
	it('a weak plunge counts ball_launched then rolls back to ballsInPlay 0; the re-plunge counts exactly 1 (not 2); the eventual drain emits ball_ended and ballsInPlay reads 0', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });

		// Start.
		let out = loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		out = loop.advance(1, [{ tick: 3, frame: { ...NO_FRAME, start: false } }]);
		for (let i = 0; i < 50 && out.snapshot.mechanisms.devices.bd_shooter.slots[0] !== true; i++) {
			out = loop.advance(1, []);
		}
		expect(out.snapshot.mechanisms.devices.bd_shooter.slots, 'the served ball must be resting on the plunger tip before the plunge').toEqual([true]);
		expect(out.snapshot.game.machine.ballsInPlay, 'a served, unlaunched ball is not counted in play').toBe(0);

		// A 20-tick plunge (well under plungerMaxHoldTicks -- a WEAK plunge
		// that climbs partway and rolls back, per this story's own AC 12
		// premise, never a full-strength launch).
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 19; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);

		let launchCount = 0;
		let launchTick = -1;
		let ballsInPlayAtLaunch = -1;
		let rollbackTick = -1;
		for (let i = 0; i < MAX_TICKS; i++) {
			out = loop.advance(1, []);
			const launched = out.events.some((e) => e.type === 'ball_launched');
			if (launched) {
				launchCount += 1;
				launchTick = out.snapshot.tick;
				ballsInPlayAtLaunch = out.snapshot.game.machine.ballsInPlay;
			}
			if (launchCount === 1 && out.snapshot.mechanisms.devices.bd_shooter.slots[0] === true) {
				rollbackTick = out.snapshot.tick;
				break;
			}
		}
		expect(launchCount, 'the weak plunge must fire exactly one ball_launched').toBe(1);
		expect(launchTick, 'sanity: a launch must genuinely have been observed').toBeGreaterThan(0);
		expect(ballsInPlayAtLaunch, 'ballsInPlay reads 1 on the launch tick itself (the instrument\'s own positive)').toBe(1);
		expect(rollbackTick, 'the weak plunge must genuinely roll back onto the tip within the drive window, or this test is vacuous').toBeGreaterThan(0);

		// The fix's own claim: once bd_shooter reads [true] again (the ball
		// rolled back), ballsInPlay reads 0 -- today's code (pre-fix) leaves
		// it at 1 here.
		expect(out.snapshot.game.machine.ballsInPlay, 'DW-187: a rolled-back ball must leave play -- it is resting on the tip, not in play').toBe(0);

		// Disable the five hazard coils (the same real, physically legitimate
		// AD-5 configuration test/backglass-integration.test.ts uses) so the
		// re-plunge's own descent drains deterministically.
		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}

		// The SAME ball, re-plunged at full strength (>= plungerMaxHoldTicks).
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 1199; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);

		let secondLaunchCount = 0;
		let ballsInPlayAtSecondLaunch = -1;
		let ballEndedEvent: { readonly type: 'ball_ended'; readonly player: number; readonly tilted: boolean } | undefined;
		let ballsInPlayAtDrain = -1;
		for (let i = 0; i < MAX_TICKS; i++) {
			out = loop.advance(1, []);
			if (out.events.some((e) => e.type === 'ball_launched')) {
				secondLaunchCount += 1;
				ballsInPlayAtSecondLaunch = out.snapshot.game.machine.ballsInPlay;
			}
			const ended = out.events.find((e) => e.type === 'ball_ended');
			if (ended && ended.type === 'ball_ended') {
				ballEndedEvent = ended;
				ballsInPlayAtDrain = out.snapshot.game.machine.ballsInPlay;
				break;
			}
		}

		expect(secondLaunchCount, 'the re-plunge must fire exactly one MORE ball_launched').toBe(1);
		expect(ballsInPlayAtSecondLaunch, 'DW-187: ballsInPlay must read 1 (not 2 -- today\'s code double-counts the rolled-back ball)').toBe(1);

		expect(ballEndedEvent, `the ball must genuinely drain within ${MAX_TICKS} advances after the re-plunge, or this test is vacuous`).toBeDefined();
		expect(ballEndedEvent!.player).toBe(0);
		expect(ballEndedEvent!.tilted).toBe(false);
		expect(ballsInPlayAtDrain, 'DW-187: the drain must genuinely end the ball -- ballsInPlay reads 0 (today\'s code hangs at 1 with no ball_ended)').toBe(0);
	});
});
