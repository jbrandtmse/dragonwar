// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.7, Integration ACs I1/I2 (Rule 1) -- the mode stack's two
// consumers, each exercised against a REAL `createLoop()` with real physics,
// never a mock and never a hand-built `modes[]` fixture (this story's own
// "Never" section). Follows `test/backglass-integration.test.ts`'s own
// real-loop-through-the-Backglass pattern and
// `test/rules-lifecycle-integration.test.ts`'s own real-Start-press pattern.
//
// AC I1 presses Start ONCE (one player) -- this story's own Design Notes
// ("The DW-197 boundary"): a second player would push the mode block off
// the DMD panel at three-plus players for a reason that has nothing to do
// with this story (DW-197, routed to 2.13), and copying
// `test/backglass-integration.test.ts`'s own two-press Hot-seat setup here
// would make a dot-level assertion fail for that unrelated reason.
//
// AC I2 disables the three pops and two slingshots (the SAME sanctioned
// `setCoilEnabled` dev hatch `test/backglass-integration.test.ts` uses) so a
// plunged ball's path to the first playfield switch is governed by gravity
// and passive collision alone -- bounded and reproducible, never a mock of
// the resolution itself.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { advanceBackglass, renderFrame, INITIAL_BACKGLASS_VIEW } from '../src/presentation/backglass/frame';
import { rasterise } from '../src/presentation/backglass/raster';
import { FONT_5X7 } from '../src/presentation/backglass/font';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { CoilName, GameStart, Snapshot } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const DISABLED_HAZARD_COILS: readonly CoilName[] = ['c_pop_1', 'c_pop_2', 'c_pop_3', 'c_sling_l', 'c_sling_r'];

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function gameStart(): GameStart {
	return {
		seed: 0,
		tuning: resolveTuning(),
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0 },
		highscores: [],
	};
}

/** Presses `s_start` once via a real `InputTransition` pair (press then release), one player. */
function pressStartOnce(loop: ReturnType<typeof createLoop>): void {
	loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
	loop.advance(1, [{ tick: 3, frame: { ...NO_FRAME, start: false } }]);
}

describe('Story 2.7, Integration AC I1 -- a real loop, one player: ARM YOURSELF renders once the skill shot arms', () => {
	it("the rendered DmdFrame rows contain 'ARM YOURSELF' and the rasterised buffer lights at least one dot", () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart() });
		pressStartOnce(loop);

		let view = INITIAL_BACKGLASS_VIEW;
		let armedFrame: ReturnType<typeof renderFrame> | undefined;
		const MAX_TICKS = 200;
		for (let tick = 4; tick <= MAX_TICKS; tick++) {
			const output = loop.advance(1, []);
			view = advanceBackglass(view, output);
			if (output.snapshot.game.modes.some((m) => m.mode === 'skill_shot')) {
				armedFrame = renderFrame(view, output.snapshot);
				break;
			}
		}

		expect(armedFrame, `the skill shot must genuinely arm within ${MAX_TICKS} ticks of a real Start press, or this test is vacuous`).toBeDefined();
		expect(armedFrame!.rows.some((r) => r.text === 'ARM YOURSELF')).toBe(true);

		const raster = rasterise(armedFrame!, FONT_5X7);
		expect(raster.dots.length).toBe(raster.cols * raster.rows);
		expect(raster.dots.some((d) => d === 1), 'the real armed frame must actually light a dot once rasterised').toBe(true);
	});

	it("control (Rule 19), mirroring test/backglass-integration.test.ts's own events-emptied control: the SAME decisive frame, with modes emptied, renders no 'ARM YOURSELF' row -- proving the assertion above reads modes[], not something else", () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart() });
		pressStartOnce(loop);

		let view = INITIAL_BACKGLASS_VIEW;
		let decisiveView = view;
		let decisiveSnapshot: Snapshot | undefined;
		const MAX_TICKS = 200;
		for (let tick = 4; tick <= MAX_TICKS; tick++) {
			const output = loop.advance(1, []);
			view = advanceBackglass(view, output);
			if (output.snapshot.game.modes.some((m) => m.mode === 'skill_shot')) {
				decisiveView = view;
				decisiveSnapshot = output.snapshot;
				break;
			}
		}

		expect(decisiveSnapshot, 'sanity: the real run must still genuinely arm the skill shot, or this control proves nothing').toBeDefined();
		const emptied: Snapshot = { ...decisiveSnapshot!, game: { ...decisiveSnapshot!.game, modes: [] } };
		const controlFrame = renderFrame(decisiveView, emptied);
		expect(controlFrame.rows.some((r) => r.text === 'ARM YOURSELF'), 'with modes[] emptied, no ARM YOURSELF row may appear').toBe(false);
	});
});

describe('Story 2.7, Integration AC I2 -- a real loop, real devices and real physics resolve the skill shot', () => {
	it('once a real plunge reaches the playfield, modes[] no longer contains skill_shot while still containing base', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart() });
		pressStartOnce(loop);

		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}

		let armed = false;
		let pulsedAutolaunch = false;
		let sawRealBallLaunched = false;
		let stillArmedAtRealLaunch: boolean | undefined;
		let resolvedAt = -1;
		let modesAtResolution: readonly string[] = [];
		let sawBase = false;
		const MAX_TICKS = 20000;

		for (let tick = 4; tick <= MAX_TICKS && resolvedAt < 0; tick++) {
			const output = loop.advance(1, []);
			const modes = output.snapshot.game.modes.map((m) => m.mode);

			if (!armed && modes.includes('skill_shot')) {
				armed = true;
			}
			if (armed && !pulsedAutolaunch) {
				// The ball is genuinely served (armed) but the plunge itself is a
				// real hardware action -- pulse c_autolaunch exactly once, the same
				// sanctioned dev hatch test/backglass-integration.test.ts uses for
				// its own drain, mirrored here for the plunge instead.
				loop.pulseCoil('c_autolaunch');
				pulsedAutolaunch = true;
			}
			// The REAL ball_launched SemanticEvent (never confused with this
			// test's own `pulsedAutolaunch` bookkeeping above) -- captured so the
			// assertion below can tell "resolves on the real first PLAYFIELD
			// closure" apart from "resolves as soon as the ball merely
			// launches", the exact discriminator this story's own Rule 19
			// mutation list names for AC I2 ("resolve the skill shot on
			// ball_starting instead of on the first playfield closure").
			if (!sawRealBallLaunched && output.events.some((e) => e.type === 'ball_launched')) {
				sawRealBallLaunched = true;
				stillArmedAtRealLaunch = modes.includes('skill_shot');
			}
			if (armed && !modes.includes('skill_shot')) {
				resolvedAt = tick;
				modesAtResolution = modes;
				sawBase = modes.includes('base');
			}
		}

		expect(armed, 'the skill shot must genuinely arm first, or this test proves nothing').toBe(true);
		expect(sawRealBallLaunched, 'the ball must genuinely launch, or the assertion below is vacuous').toBe(true);
		expect(
			stillArmedAtRealLaunch,
			'the skill shot must still be armed the tick the ball genuinely launches -- launching alone must not resolve it, only the FIRST real playfield closure after it may',
		).toBe(true);
		expect(resolvedAt, `the skill shot must genuinely resolve within ${MAX_TICKS} ticks of a real plunge, or this test is vacuous`).toBeGreaterThan(0);
		expect(modesAtResolution, 'skill_shot must be gone').not.toContain('skill_shot');
		expect(sawBase, 'base must still be present -- only skill_shot resolves').toBe(true);
	});
});
