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

function gameStart(seed = 0): GameStart {
	return {
		seed,
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

// Code review 2026-09-06 (DW-201, verification gap -- CONFIRMED by mutation):
// before this block, NOTHING in the suite executed the hop that DW-201's whole
// fix depends on. `GameStart.seed` becomes `GameState.rng` at exactly one line,
// `src/sim/loop/index.ts`'s `rng: options.gameStart?.seed ?? 0`, and every
// `createLoop(...)` caller in the whole suite passed either no `gameStart` or
// `seed: 0` -- so changing that line to a bare `rng: 0` left ALL 1697 tests
// green (personally applied and observed), silently restoring DW-201's exact
// user-visible defect: every real game lighting the same Top lane sequence.
// `test/host-game-seed.test.ts` could not catch it either -- it pins
// `deriveGameSeed()`'s own randomness and the TEXT of `src/host/boot.ts`, never
// the seed's effect on a running game.
//
// This block closes that gap with the real loop: two different seeds must draw
// different opening lanes, and the same seed must reproduce its own. The
// expected lanes are computed from `src/sim/rules/rng.ts`'s own published
// mulberry32 arithmetic (seed 12345 -> index 2 -> top_3; seed 42 -> index 1 ->
// top_2; seed 0 -> index 0 -> top_1) and independently re-derived at review
// time, never read back off a failing run.
describe("Story 2.7, DW-201 -- GameStart.seed genuinely reaches GameState.rng and decides the drawn lane in a REAL loop", () => {
	/** Drives a real `createLoop()` from `seed` to the tick the skill shot arms, and returns the Top lane it drew. */
	function drawnTopLaneForSeed(seed: number): string | undefined {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(seed) });
		pressStartOnce(loop);
		const MAX_TICKS = 200;
		for (let tick = 4; tick <= MAX_TICKS; tick++) {
			const output = loop.advance(1, []);
			if (!output.snapshot.game.modes.some((m) => m.mode === 'skill_shot')) {
				continue;
			}
			const lit = output.snapshot.game.players[0]!.lanes.lit;
			return (Object.keys(TABLE.laneWiring) as Array<keyof typeof TABLE.laneWiring>).find(
				(lane) => TABLE.laneWiring[lane].set === 'top' && lit[lane] === true,
			);
		}
		return undefined;
	}

	it('two different seeds draw two different opening Top lanes -- the assertion a bare `rng: 0` in sim/loop/index.ts must redden', () => {
		const a = drawnTopLaneForSeed(12345);
		const b = drawnTopLaneForSeed(42);

		expect(a, 'seed 12345 must genuinely arm and draw, or this test is vacuous').toBeDefined();
		expect(b, 'seed 42 must genuinely arm and draw, or this test is vacuous').toBeDefined();
		expect(a, "seed 12345's opening draw, computed from rng.ts's own arithmetic").toBe('top_3');
		expect(b, "seed 42's opening draw, computed from rng.ts's own arithmetic").toBe('top_2');
		expect(a, 'two different seeds must not produce the same opening lane -- if they do, the seed is not reaching GameState.rng').not.toBe(b);
	});

	it('the same seed reproduces its own opening lane, and seed 0 (this file\'s own default) draws top_1 -- pinning the default every other test here runs under', () => {
		expect(drawnTopLaneForSeed(12345)).toBe('top_3');
		expect(drawnTopLaneForSeed(0), 'seed 0 draws lane index 0 = top_1 -- the value DW-201 measured, not top_3').toBe('top_1');
	});
});

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

		// Code review 2026-09-06 (verification gap -- CONFIRMED by mutation):
		// `dots.some(d === 1)` above is satisfied by the score row and the
		// `BALL 1` row alone. It holds even on this file's OWN negative-control
		// frame below, where `modes` is emptied and no ARM YOURSELF row exists
		// at all -- so it proves the panel is not blank, never that the MODE row
		// reached it. Changing `frame.ts`'s `buildModeRows(topMode, nextLine)`
		// to `buildModeRows(topMode, 100)` puts every mode row at dot row 800+,
		// where `raster.ts:47-51` silently drops it, and ALL 1697 tests stayed
		// green (personally applied and observed): the DMD would ship with the
		// mode block invisible while `frame.rows`' text still read correctly.
		// This is the same shape as the LEFT_MARGIN_COL defect that would have
		// shipped a blank DMD past 33 green backglass tests in Story 2.6.
		//
		// So: bind the dot assertion to the ARM YOURSELF row's OWN band. The
		// band is read off the row the renderer actually emitted rather than
		// hardcoded, so it follows a legitimate re-layout and still fails a row
		// pushed off the panel.
		const modeRow = armedFrame!.rows.find((r) => r.text === 'ARM YOURSELF')!;
		const GLYPH_ROWS = 7; // FONT_5X7
		expect(
			modeRow.row,
			`the ARM YOURSELF row must actually FIT on the ${raster.rows}-row panel (row ${modeRow.row} + ${GLYPH_ROWS} glyph rows) -- a row rasterise() silently drops renders nothing on a real machine`,
		).toBeLessThanOrEqual(raster.rows - GLYPH_ROWS);
		const litInModeBand = Array.from({ length: GLYPH_ROWS }, (_, i) => modeRow.row + i).some((row) =>
			Array.from({ length: raster.cols }, (_, col) => raster.dots[row * raster.cols + col]).some((d) => d === 1),
		);
		expect(litInModeBand, "the ARM YOURSELF row's own 7-row band must carry lit dots -- not merely the score row elsewhere on the panel").toBe(true);
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
		let scoreAtResolution = -1;
		let lettersAtResolution = ' ';
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
				scoreAtResolution = output.snapshot.game.players[0]!.score;
				lettersAtResolution = output.snapshot.game.players[0]!.letters;
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

		// Code review 2026-09-06: AC I2 previously asserted only that `skill_shot`
		// left `modes[]`. It never read `score` or `letters` in either direction,
		// so an end-to-end regression that paid the award on EVERY closure -- not
		// just the lit lane's -- left this test green. The award is the story's
		// central product behaviour and was proven only against hand-built
		// `GameState` fixtures (headless AC 2/AC 3).
		//
		// This run is deterministic and is a genuine MISS: with `seed: 0` the
		// drawn lane is `top_1` (pinned by the DW-201 block at the top of this
		// file), and the ball's first real playfield closure under this setup is
		// not a Top-lane switch. Verified at review time across seeds 0, 42 and
		// 12345 -- lighting top_1, top_2 and top_3 respectively -- all three miss,
		// so no seed makes this particular trajectory an end-to-end HIT and the
		// hit path cannot be pinned here without re-authoring the setup. Pinning
		// the miss is still worth it: it is AC 3's shape proven through real
		// physics for the first time, and it falsifies "pays on every closure".
		expect(scoreAtResolution, 'a real MISS must pay nothing -- a regression paying on every playfield closure would score here').toBe(0);
		expect(lettersAtResolution, 'a real MISS must award no DRAGON letter').toBe('');
	});
});
