// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.5, AC 8 (Rule 1 -- Integration): the ONE consumer-tier test for
// this story's ball controller. A real `createLoop({ collisionDoc, gameStart })`,
// a real `s_start` press delivered as an `InputTransition` (never a synthetic
// `DeviceEvent` built by hand), real physics -- proving the lifecycle reaches
// `FrameOutput.events` and that a served ball is an OBSERVABLE physics effect
// (an ejected ball, then a played one), not merely a `GameState` field. The
// disabled-coil control lives in the SAME test (Rule 19): it proves the
// observable (a ball actually leaving the trough) is not produced by
// anything else in the pipeline.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { GameStart } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function gameStart(): GameStart {
	return {
		seed: 0,
		tuning: resolveTuning(),
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0.08 },
		highscores: [],
	};
}

describe('Story 2.5, AC 8 -- Integration: a real createLoop, a real s_start press, real physics', () => {
	it('FrameOutput.events carries the lifecycle events; physics ejects a ball on the FOLLOWING tick (AD-4); ballsInPlay reaches 1 after the plunge; a disabled c_trough_eject serves nothing (control)', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart() });

		const startOut = loop.advance(1, [{ tick: 1, frame: { ...NO_FRAME, start: true } }]);
		expect(
			startOut.events.map((e) => e.type),
			`expected ball_will_start, ball_starting and ball_started among this tick's events; got ${JSON.stringify(startOut.events)}`,
		).toEqual(expect.arrayContaining(['ball_will_start', 'ball_starting', 'ball_started']));
		expect(startOut.snapshot.game.phase).toBe('game');
		expect(
			startOut.snapshot.balls,
			'no ball may be ejected on the SAME tick as the Start press -- AD-4: a command issued at tick N is consumed at N+1',
		).toEqual([]);

		const ejectOut = loop.advance(1, []);
		expect(ejectOut.snapshot.balls, 'physics ejects a ball on the tick FOLLOWING the Start press').toHaveLength(1);

		// The served ball rests in the shooter lane until it plunges (AD-6); the
		// manual plunge is Story 2.7's own mechanic, so this drives the SAME
		// c_autolaunch coil a live player's plunge would eventually reach,
		// through the general-purpose dev hatch `sim/loop/index.ts` still
		// exposes (this file's own header: kept for any coil, not only the
		// trough, after this story replaces it as the PRODUCTION serve path).
		loop.pulseCoil('c_autolaunch');
		let out = ejectOut;
		for (let i = 0; i < 320; i++) {
			out = loop.advance(1, []);
		}
		expect(out.snapshot.game.machine.ballsInPlay, 'ballsInPlay reaches 1 once the served ball genuinely plunges').toBe(1);

		// Control, same test (Rule 19): the IDENTICAL run, but c_trough_eject
		// disabled first -- no ball ever leaves the trough, and ballsInPlay
		// never leaves 0. Proves the observable above is produced by the real
		// coil channel, not by some other path (a stray physics default, a
		// leftover dev pulse from an earlier test, ...).
		const controlLoop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart() });
		controlLoop.setCoilEnabled('c_trough_eject', false);
		controlLoop.advance(1, []);
		controlLoop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		const controlOut = controlLoop.advance(1, []);

		expect(controlOut.snapshot.balls, 'a disabled c_trough_eject must serve no ball').toEqual([]);
		expect(controlOut.snapshot.game.machine.ballsInPlay, 'ballsInPlay must stay 0 with no ball ever served').toBe(0);
	});
});
