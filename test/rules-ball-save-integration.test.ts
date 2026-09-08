// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.9, AC 8 (Rule 1 -- Integration): the ONE consumer-tier test for
// `l_ball_save` -- a real `createLoop({ collisionDoc, gameStart })`, a real
// `s_start` press and a real plunge (mirroring
// `test/rules-lifecycle-integration.test.ts`'s own proven recipe: the dev
// `pulseCoil('c_autolaunch')` hatch drives the SAME coil a live player's
// plunge would eventually reach), proving `lampsOf()` + `sim/loop`'s own
// lamp diff produce an OBSERVABLE `LampCommand` stream on `FrameOutput`, not
// merely a `machine.ballSave` field -- asserted on the loop's own command
// stream (AC 8's own wording), never by reading `machine.ballSave` directly.
//
// A `*-integration.test.ts` file (this file's own name): exempt, by the
// established naming convention, from `test/rules-devices-headless.test.ts`'s
// ENTRY_FILES/headless-closure gate (mirrors
// `rules-lifecycle.test.ts`/`rules-lifecycle-integration.test.ts`'s own
// split) -- this file drives `sim/loop` and real physics on purpose, so it
// could never satisfy that gate's own headless claim, and does not try to.
//
// `ballSaveMs`/`ballSaveHurryUpMs` are overridden to a tiny window here
// (100 / 40 ticks) purely so the test does not need to run the production
// 8 s window in real physics ticks -- every OTHER tunable, and the plunge
// mechanics themselves, are untouched production values, matching this
// file's own "real physics" claim.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { GameStart } from '../src/sim/table/names';
import type { LampCommand } from '../src/sim/contracts/commands';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

const FAST_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 100 },
	ballSaveHurryUpMs: { ...RAW_TUNING.ballSaveHurryUpMs, value: 40 },
});

function gameStart(): GameStart {
	return {
		seed: 0,
		tuning: FAST_BALL_SAVE_TUNING,
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0.08 },
		highscores: [],
	};
}

describe('Story 2.9, AC 8 -- Integration: a real createLoop, the ball-save insert drives a real LampCommand stream', () => {
	it('l_ball_save projects lit/1 at the plunge, later lit/3 in the hurry-up span, and finally off/0 past the displayed expiry -- observed on FrameOutput.commands, and no tick of the run carries more than two LampCommands', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: FAST_BALL_SAVE_TUNING });

		const lampCommands: LampCommand[] = [];
		const commandCountByTick = new Map<number, number>();
		let ballLaunchedTick: number | null = null;

		function advanceAndCollect(): void {
			const out = loop.advance(1, []);
			for (const cmd of out.commands) {
				commandCountByTick.set(cmd.tick, (commandCountByTick.get(cmd.tick) ?? 0) + 1);
				if (cmd.type === 'lamp' && cmd.lamp === 'l_ball_save') {
					lampCommands.push(cmd as LampCommand);
				}
			}
			for (const event of out.events) {
				if (event.type === 'ball_launched' && ballLaunchedTick === null) {
					ballLaunchedTick = event.tick;
				}
			}
		}

		// Boot (tick 1), a real s_start press (tick 2), the eject (tick 3) --
		// the identical recipe test/rules-lifecycle-integration.test.ts's own
		// AC 8 test already proves works.
		advanceAndCollect();
		{
			const out = loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
			for (const cmd of out.commands) {
				commandCountByTick.set(cmd.tick, (commandCountByTick.get(cmd.tick) ?? 0) + 1);
				if (cmd.type === 'lamp' && cmd.lamp === 'l_ball_save') lampCommands.push(cmd as LampCommand);
			}
		}
		advanceAndCollect(); // tick 3: the served ball is ejected from the trough

		// The served ball rests in the shooter lane until it plunges (AD-6);
		// drive the SAME c_autolaunch coil a live player's plunge would
		// eventually reach, through the general-purpose dev hatch.
		loop.pulseCoil('c_autolaunch');
		for (let i = 0; i < 320; i++) {
			advanceAndCollect();
		}
		expect(ballLaunchedTick, 'the plunge must have genuinely fired within the travel window this recipe already proves sufficient').not.toBeNull();

		// Run well past the (tiny, overridden) ball-save window's own displayed
		// expiry -- 100 ticks of window plus a generous margin for the hurry-up
		// span and the off transition to both land inside the observed run.
		for (let i = 0; i < 200; i++) {
			advanceAndCollect();
		}

		const step1 = lampCommands.filter((c) => c.role === 'lit' && c.step === 1);
		const step3 = lampCommands.filter((c) => c.role === 'lit' && c.step === 3);
		const off = lampCommands.filter((c) => c.role === 'off' && c.step === 0);

		expect(step1.length, 'a lit/1 LampCommand must appear at the plunge').toBeGreaterThan(0);
		expect(step3.length, 'a lit/3 LampCommand must appear in the hurry-up span').toBeGreaterThan(0);
		expect(off.length, 'an off/0 LampCommand must appear once the displayed window has passed').toBeGreaterThan(0);

		expect(Math.min(...step3.map((c) => c.tick)), 'every step-3 tick must be later than every step-1 tick').toBeGreaterThan(
			Math.max(...step1.map((c) => c.tick)),
		);
		expect(Math.min(...off.map((c) => c.tick)), 'the off transition must be later than every step-3 tick').toBeGreaterThan(
			Math.max(...step3.map((c) => c.tick)),
		);

		for (const [tick, count] of commandCountByTick) {
			expect(count, `tick ${tick} carried ${count} LampCommands -- no tick of the run may carry more than two`).toBeLessThanOrEqual(2);
		}
	});
});
