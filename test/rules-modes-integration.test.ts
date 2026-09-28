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
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { CoilName, GameStart, Snapshot } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const DISABLED_HAZARD_COILS: readonly CoilName[] = ['c_pop_1', 'c_pop_2', 'c_pop_3', 'c_sling_l', 'c_sling_r'];

// [ADDED 2026-09-12, Story 2.14] Same rationale as
// `test/game-over-integration.test.ts`'s own override: a real drain (each of
// the four Story 2.14 tests below that drive a served ball all the way to the
// trough) must be a genuine one, never intercepted as a ball-save re-serve.
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

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
//
// [AMENDED 2026-09-12, Story 2.14 -- DW-205/DW-214] The seed no longer decides
// a per-ball DRAW; it decides the game's own STARTING POSITION, which the
// lane then advances through one position per ball, wrapping, per the
// player's own `ballNumber` (Story 2.14's own rotation, `skill-shot.ts`).
// The three literals pinned below are UNCHANGED by that rotation -- measured
// (Story 2.14's Code Map): each of these three seeds' own ball-1 draw is
// identical whether the lane is drawn fresh each ball (the old mechanism) or
// only once per game and then advanced (the new one), since ball 1 is always
// the very first step either way. The named mutation -- `sim/loop/index.ts`'s
// `rng: options.gameStart?.seed ?? 0` collapsed to a bare `rng: 0` -- still
// collapses all three seeds to the SAME opening lane under the rotation too,
// so this block still pins DW-201's whole claim: `GameStart.seed` keeps a
// real, observable effect on the shipped product.
describe("Story 2.7, DW-201 -- GameStart.seed genuinely reaches GameState.rng and decides the game's starting Top lane in a REAL loop", () => {
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

	// [ADDED 2026-09-12, Story 2.14, AC 3] The two `it`s above pin only ball
	// 1's own opening lane -- exactly what a per-ball DRAW and a game-scoped
	// ROTATION both produce identically for the very first ball, so they
	// cannot by themselves prove the ROTATION is real. This one drives a seed
	// past its own drain into ball 2, in a REAL loop, and pins the advanced
	// lane as an authored literal -- carrying DW-201's own seed evidence
	// forward through the mechanism this story actually changed.
	//
	// [AMENDED 2026-09-12, code-review gate] The seed here MUST be a
	// discriminating one, and 12345 is not. Measured (this file's own
	// mulberry32 arithmetic, re-derived independently at the review gate):
	// seed 12345's shipped per-ball-draw sequence and its rotation sequence
	// are byte-identical (`top_3, top_1, top_2` either way), so pinning its
	// ball 2 at `top_1` stayed GREEN under a full revert to the per-ball
	// draw -- the exact "an expectation that both mechanisms satisfy" shape
	// this file's own sibling pin in `test/rules-modes.test.ts` excludes
	// 12345 for. Seed 42 (already pinned at ball 1 -> `top_2` by the first
	// `it` above) DOES discriminate: shipped draws `top_2, top_2, top_3`,
	// the rotation advances `top_2, top_3, top_1`. Ball 2 is therefore
	// `top_3` under the rotation and `top_2` under the mechanism this story
	// replaced, and the lanes differing across the two balls is itself the
	// discriminator (the shipped draw REPEATED `top_2` here).
	it("seed 42's rotation survives a real drain: ball 2 lights top_3 (starting position 1, advanced one), in a REAL loop -- the shipped per-ball draw repeated top_2 instead", () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(42), tuning: NO_BALL_SAVE_TUNING });
		pressStartOnce(loop);
		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}

		let sawBall1Arm = false;
		let ball1Lane: string | undefined;
		let pulsedAutolaunch = false;
		let ball2Lane: string | undefined;
		const MAX_TICKS = 20000;
		for (let tick = 4; tick <= MAX_TICKS && ball2Lane === undefined; tick++) {
			const output = loop.advance(1, []);
			const armed = output.snapshot.game.modes.some((m) => m.mode === 'skill_shot');
			if (!sawBall1Arm && armed) {
				sawBall1Arm = true;
				const lit = output.snapshot.game.players[0]!.lanes.lit;
				ball1Lane = (Object.keys(TABLE.laneWiring) as Array<keyof typeof TABLE.laneWiring>).find(
					(lane) => TABLE.laneWiring[lane].set === 'top' && lit[lane] === true,
				);
			}
			if (sawBall1Arm && !pulsedAutolaunch) {
				loop.pulseCoil('c_autolaunch');
				pulsedAutolaunch = true;
			}
			if (output.events.some((e) => e.type === 'ball_ended') && output.snapshot.game.phase === 'game') {
				// The drain rotated straight into ball 2's own deferred start
				// (this file's own DEFERRED START note in modes/index.ts): give
				// the mode stack one more tick to arm before reading its lane.
				const next = loop.advance(1, []);
				const lit = next.snapshot.game.players[0]!.lanes.lit;
				ball2Lane = (Object.keys(TABLE.laneWiring) as Array<keyof typeof TABLE.laneWiring>).find(
					(lane) => TABLE.laneWiring[lane].set === 'top' && lit[lane] === true,
				);
			}
		}

		expect(sawBall1Arm, 'ball 1 must genuinely arm, or this test proves nothing').toBe(true);
		expect(ball1Lane, "ball 1's own opening lane -- the seed's starting position").toBe('top_2');
		expect(ball2Lane, 'ball 2 must genuinely arm and light its own advanced lane, or this test is vacuous').toBeDefined();
		expect(ball2Lane, "ball 2's own lane: starting position 1, advanced one -- top_3").toBe('top_3');
		// The discriminator, paired with the two positives above: under the
		// per-ball draw this story replaced, seed 42's ball 2 drew `top_2`
		// again -- the same lane as its own ball 1. A rotation cannot repeat.
		expect(ball2Lane, "ball 2 must not repeat ball 1's own lane -- the shipped per-ball draw did exactly that at this seed").not.toBe(ball1Lane);
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
		let lettersAtResolution = '\u0000';
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

// [ADDED 2026-09-12, Story 2.14, AC 6] A real createLoop(), never a mock:
// game 1's own starting draw, a genuine drain, the Match's own single rng
// step, a Start press past the game-over sequence's resolution, and game 2's
// own FRESH starting draw -- proving the GAME-BOUNDARY half of AC 6 end to
// end, through real physics, not merely headlessly (test/rules-modes.test.ts's
// own "AC 6" pin already covers the headless shape).
//
// [CLARIFIED 2026-09-12, code-review gate] This test runs `ballsPerGame: 1`,
// under which "one draw per GAME" and "one draw per BALL" are the same
// proposition -- measured at the review gate, it stays GREEN under a full
// revert to the per-ball draw. It pins the boundary (game 2 must not
// continue game 1's rotation), and nothing more. The "one draw per game, not
// one per ball" half is pinned separately and discriminatingly by this
// file's own 3-ball real-Match test below, and headlessly by
// test/rules-modes.test.ts's own "AC 4".
describe("Story 2.14, Integration AC -- a real loop: a second game after game over takes a fresh starting draw, not a repeat of game 1's", () => {
	it('game 1 opens on top_1 (seed 7\'s own first draw); after a real drain, the Match, and a Start press past its resolution, game 2 opens on top_3 -- a fresh draw', () => {
		// Measured (scratch harness, src/sim/rules/rng.ts's own arithmetic,
		// never guessed): from rng 7, game 1 draws index 0 (top_1); the Match's
		// own single nextRng() step at game over (AD-3: "Match still draws
		// last") then advances rng once more; game 2's own fresh draw from
		// THAT value is index 2 (top_3) -- discriminating, since it differs
		// from game 1's own opening lane.
		const SEED = 7;
		const loop = createLoop({
			collisionDoc: loadDoc(),
			gameStart: {
				seed: SEED,
				tuning: resolveTuning(),
				adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 1, matchProbability: 0 },
				highscores: [],
			},
			tuning: NO_BALL_SAVE_TUNING,
		});
		pressStartOnce(loop);
		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}

		let game1Lane: string | undefined;
		for (let tick = 4; tick <= 200 && game1Lane === undefined; tick++) {
			const output = loop.advance(1, []);
			if (output.snapshot.game.modes.some((m) => m.mode === 'skill_shot')) {
				const lit = output.snapshot.game.players[0]!.lanes.lit;
				game1Lane = (Object.keys(TABLE.laneWiring) as Array<keyof typeof TABLE.laneWiring>).find(
					(lane) => TABLE.laneWiring[lane].set === 'top' && lit[lane] === true,
				);
			}
		}
		expect(game1Lane, 'game 1 must genuinely arm and draw, or this test is vacuous').toBe('top_1');

		loop.pulseCoil('c_autolaunch');

		let G = -1;
		let lastOutput = loop.advance(1, []);
		for (let i = 0; i < 20000 && G === -1; i++) {
			lastOutput = loop.advance(1, []);
			if (lastOutput.events.some((e) => e.type === 'ball_ended')) {
				G = lastOutput.snapshot.tick;
			}
		}
		expect(G, 'the served ball must genuinely drain within the bound, ending the only ball of the only player').toBeGreaterThan(0);
		expect(lastOutput.snapshot.game.phase, 'a single-ball game is over the instant it drains').toBe('game_over');

		// Production tuning's own game-over pacing, authored as literals
		// (never re-derived from tuning -- test/game-over-integration.test.ts's
		// own precedent): matchTick = G + 5000, resolvedTick = matchTick + 2500.
		const resolvedTick = G + 5000 + 2500;
		while (lastOutput.snapshot.tick < resolvedTick) {
			lastOutput = loop.advance(1, []);
		}
		expect(lastOutput.snapshot.game.phase, 'still game_over at the resolution tick, before any Start press').toBe('game_over');

		const pressTick = lastOutput.snapshot.tick + 1;
		loop.advance(1, [{ tick: pressTick, frame: { ...NO_FRAME, start: true } }]);
		lastOutput = loop.advance(1, [{ tick: pressTick + 1, frame: { ...NO_FRAME, start: false } }]);

		let game2Lane: string | undefined;
		for (let i = 0; i < 200 && game2Lane === undefined; i++) {
			lastOutput = loop.advance(1, []);
			if (lastOutput.snapshot.game.modes.some((m) => m.mode === 'skill_shot')) {
				const lit = lastOutput.snapshot.game.players[0]!.lanes.lit;
				game2Lane = (Object.keys(TABLE.laneWiring) as Array<keyof typeof TABLE.laneWiring>).find(
					(lane) => TABLE.laneWiring[lane].set === 'top' && lit[lane] === true,
				);
			}
		}

		expect(game2Lane, 'game 2 must genuinely arm and draw its own opening lane, or this test is vacuous').toBe('top_3');
		expect(game2Lane, 'game 2\'s opening lane must be a FRESH draw, not a repeat of game 1\'s own opening lane').not.toBe(game1Lane);
	}, 60000);
});

// [ADDED 2026-09-12, Story 2.14 -- epic-cycle stage: qa] Every existing
// Hot-seat pin -- this file's own DW-201 block above, and
// test/rules-modes.test.ts's own "AC 5" -- runs at most TWO players, either
// headless (a scripted `runRulesScript()`) or through a single real drain.
// The Design Notes' own stated risk ("Why the advance is per player") is
// arithmetic and surfaces ONLY at a player count that is a multiple of the
// lane count (3): a machine-wide plunge counter -- incremented once per
// `start()` call regardless of WHICH player it is for, in place of that
// player's OWN `players[p].ballNumber` -- gives every player's own balls the
// SAME residue mod 3 at exactly 3 (or 6, ...) players, so every player would
// face the SAME lane on every one of their own balls, the exact defect
// DW-205 exists to remove, made certain rather than merely likely.
//
// [CORRECTED 2026-09-12, code-review gate] What is invisible below 3 players
// is the DEFECT'S OWN SYMPTOM, not the mutation: at 1 or 2 players the
// residue keeps changing ball to ball, so no player ever faces one lane on
// every ball. The mutation itself IS still caught at 2 players -- verified
// by applying it: `test/rules-modes.test.ts`'s own "AC 5" runs at seed 1
// (starting position 1) and authors `top_2` for player 1's own ball 1,
// where the machine-wide counter gives (1 + 2 - 1) mod 3 = 2 -> `top_3`,
// red. So this test's value is that it exhibits the DW-205 symptom itself,
// which no pin below 3 players can show -- and that is why the player COUNT
// is the seam, not "more of the same" as the existing 2-player pins.
//
// Seed 0 (this file's own DW-201-pinned default, starting position 0 =
// top_1, measured above): ball 1 -> index (0+1-1)%3=0 -> top_1 for EVERY
// player (one shared starting draw, AC 5); ball 2 -> index (0+2-1)%3=1 ->
// top_2 for EVERY player's own second ball -- each an authored literal,
// never re-derived from the `(gameLaneStart + ballNumber - 1) % n` formula
// under test.
describe("Story 2.14, QA seam -- a REAL 3-player Hot-seat game through createLoop(): each player's OWN lane sequence, keyed on that player's OWN ballNumber, never a machine-wide plunge counter", () => {
	it("3 players, 2 balls each: every player's ball 1 lights the ONE shared starting lane (top_1); every player's OWN ball 2 advances to top_2; no player repeats their own ball 1 lane on their own ball 2", () => {
		const SEED = 0;
		const loop = createLoop({
			collisionDoc: loadDoc(),
			gameStart: {
				seed: SEED,
				// The live tuning is `createLoop`'s own `tuning` option below;
				// `gameStart.tuning` is the replay PROVENANCE record, which
				// `runReplay()` validates against live `resolveTuning()`
				// (`sim/loop/replay.ts`), so a test override never belongs here
				// (`createLoop()` does not read this field at all).
				tuning: resolveTuning(),
				adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 5, ballsPerGame: 2, matchProbability: 0 },
				highscores: [],
			},
			tuning: NO_BALL_SAVE_TUNING,
		});
		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}

		// Start (player 0's game begins), then Hot seat TWICE MORE while player
		// 0's ball 1 is still in progress -- `ball-controller.ts`'s own Hot-seat
		// window (`currentPlayer === 0 && players[0].ballNumber === 1`) is the
		// ONLY tick range in which a Start press adds a player, so all three
		// players must be added before player 0's own ball 1 drains. Hot-seat
		// additions are pure roster bookkeeping (append one `emptyPlayer()`) and
		// touch neither `modes[]` nor the ball already in play, so interleaving
		// them here is safe regardless of where ball 1 currently sits in its own
		// arm/serve/launch sequence.
		let out = loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		out = loop.advance(1, [{ tick: 3, frame: NO_FRAME }]);
		out = loop.advance(1, [{ tick: 4, frame: { ...NO_FRAME, start: true } }]);
		out = loop.advance(1, [{ tick: 5, frame: NO_FRAME }]);
		out = loop.advance(1, [{ tick: 6, frame: { ...NO_FRAME, start: true } }]);
		out = loop.advance(1, [{ tick: 7, frame: NO_FRAME }]);
		expect(out.snapshot.game.players, "three Start presses before player 0's ball 1 drains must genuinely add three players, or this test is vacuous").toHaveLength(3);

		function litTopLaneOfPlayer(playerIndex: number): string | undefined {
			const lit = out.snapshot.game.players[playerIndex]!.lanes.lit;
			return (Object.keys(TABLE.laneWiring) as Array<keyof typeof TABLE.laneWiring>).find(
				(lane) => TABLE.laneWiring[lane].set === 'top' && lit[lane] === true,
			);
		}

		/** Scans forward (bounded) until `skill_shot` genuinely arms for `forPlayer`'s own ball, records that player's own lit Top lane, launches the served ball via the sanctioned dev hatch, then scans forward (bounded) until it genuinely drains. Returns the lane recorded at arm. */
		function playOneBallAndReadItsLane(forPlayer: number, label: string): string | undefined {
			let lane: string | undefined;
			for (let i = 0; i < 200 && lane === undefined; i++) {
				out = loop.advance(1, []);
				if (out.snapshot.game.modes.some((m) => m.mode === 'skill_shot')) {
					expect(out.snapshot.game.currentPlayer, `${label} must genuinely be player ${forPlayer}'s own ball, or this test proves nothing about player isolation`).toBe(forPlayer);
					lane = litTopLaneOfPlayer(forPlayer);
				}
			}
			expect(lane, `${label} must genuinely arm and light a Top lane, or this test is vacuous`).toBeDefined();

			loop.pulseCoil('c_autolaunch');
			let ended = false;
			for (let i = 0; i < 20000 && !ended; i++) {
				out = loop.advance(1, []);
				if (out.events.some((e) => e.type === 'ball_ended')) {
					ended = true;
				}
			}
			expect(ended, `${label} must genuinely drain, or this test is vacuous`).toBe(true);
			return lane;
		}

		const p0Ball1 = playOneBallAndReadItsLane(0, "player 0's ball 1");
		const p1Ball1 = playOneBallAndReadItsLane(1, "player 1's ball 1");
		const p2Ball1 = playOneBallAndReadItsLane(2, "player 2's ball 1");
		const p0Ball2 = playOneBallAndReadItsLane(0, "player 0's ball 2");
		const p1Ball2 = playOneBallAndReadItsLane(1, "player 1's ball 2");
		const p2Ball2 = playOneBallAndReadItsLane(2, "player 2's ball 2");

		expect(out.snapshot.game.phase, 'the last ball of the last player must genuinely end the game').toBe('game_over');

		expect(p0Ball1, "player 0's ball 1 -- the game's one shared starting position, as an authored literal").toBe('top_1');
		expect(p1Ball1, "player 1's own ball 1 lights the SAME shared starting lane as player 0's -- one draw per GAME, not per player").toBe('top_1');
		expect(p2Ball1, "player 2's own ball 1 lights the SAME shared starting lane too").toBe('top_1');

		expect(p0Ball2, "player 0's own ball 2 advances one position from their own ball 1, as an authored literal").toBe('top_2');
		expect(p1Ball2, "player 1's own ball 2 advances one position from THEIR OWN ball 1 -- the same index as player 0's ball 2, since both are that player's own second ball").toBe('top_2');
		expect(p2Ball2, "player 2's own ball 2 advances one position from THEIR OWN ball 1 too").toBe('top_2');

		// The discriminating negatives (paired with the positives above,
		// Anti-vacuity: "a negative with no positive"): the exact property a
		// machine-wide plunge counter would falsify at precisely 3 players.
		expect(p0Ball1, "player 0 must not repeat their own ball 1 lane on their own ball 2 -- a machine-wide plunge counter would GUARANTEE a repeat here at exactly 3 players (each player's own residue mod 3 stays constant)").not.toBe(p0Ball2);
		expect(p1Ball1, 'player 1 must not repeat their own ball 1 lane on their own ball 2').not.toBe(p1Ball2);
		expect(p2Ball1, 'player 2 must not repeat their own ball 1 lane on their own ball 2').not.toBe(p2Ball2);
	}, 120000);
});

// [ADDED 2026-09-12, Story 2.14 -- epic-cycle stage: qa] AD-3's own claim --
// "the lane path consumes exactly one step per game... before the Match's
// own single step at game end" -- is proven end to end ONLY headlessly
// today (test/rules-modes.test.ts's own "AC 4", three balls, no Match) or,
// in a REAL loop, only for a SINGLE ball (this file's own DW-201 "ball 2
// carries the evidence" test above) or a SINGLE-BALL game (this file's own
// "second game" test above, `ballsPerGame: 1`, which cannot show a
// MULTI-ball game leaves `rng` untouched across balls 2 AND 3 while still
// reaching a real Match). This test closes that gap: one real loop, one
// player, THREE real balls (`ballsPerGame: 3`), all the way to a real
// `match_drawn` -- `rng` must move exactly ONCE for the lane (at ball 1's
// own arm) and exactly ONCE MORE for the Match (strictly after all three
// balls' own real drains), never in between.
//
// `drawMatch()` (`ball-controller.ts`) is called, and consumes its own `rng`
// step, at `gameOverSequence.matchTick` UNCONDITIONALLY -- `matchProbability`
// only decides whether the draw counts as a WIN, never whether the draw (or
// its `rng` step) happens -- so `matchProbability: 0` here is sufficient;
// the `match_drawn` event still fires and this test watches for that event
// directly rather than hardcoding the production `matchDelayMs` pacing as a
// literal tick offset.
describe('Story 2.14, QA seam -- a REAL 3-ball single-player game to a real Match: the lane consumes exactly one rng step for the whole game, and the Match still draws last', () => {
	it("rng is byte-identical across balls 2 and 3's own real drains, then moves exactly once more at the real match_drawn event", () => {
		const SEED = 0;
		const loop = createLoop({
			collisionDoc: loadDoc(),
			gameStart: {
				seed: SEED,
				// The live tuning is `createLoop`'s own `tuning` option below;
				// `gameStart.tuning` is the replay PROVENANCE record, which
				// `runReplay()` validates against live `resolveTuning()`
				// (`sim/loop/replay.ts`), so a test override never belongs here
				// (`createLoop()` does not read this field at all).
				tuning: resolveTuning(),
				adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0 },
				highscores: [],
			},
			tuning: NO_BALL_SAVE_TUNING,
		});
		pressStartOnce(loop);
		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}

		/** Scans forward (bounded) until `skill_shot` genuinely arms, returning player 0's own lit Top lane AND `rng`, read from the SAME `FrameOutput` (never two different ticks). */
		function armLaneAndRng(): { readonly lane: string | undefined; readonly rng: number } {
			for (let i = 0; i < 200; i++) {
				const out = loop.advance(1, []);
				if (out.snapshot.game.modes.some((m) => m.mode === 'skill_shot')) {
					const lit = out.snapshot.game.players[0]!.lanes.lit;
					const lane = (Object.keys(TABLE.laneWiring) as Array<keyof typeof TABLE.laneWiring>).find(
						(l) => TABLE.laneWiring[l].set === 'top' && lit[l] === true,
					);
					return { lane, rng: out.snapshot.game.rng };
				}
			}
			return { lane: undefined, rng: Number.NaN };
		}
		/** Scans forward (bounded) until `ball_ended` genuinely fires, returning the resulting `rng` and `phase` from the SAME tick. */
		function drainToBallEnded(): { readonly rng: number; readonly phase: string } {
			for (let i = 0; i < 20000; i++) {
				const out = loop.advance(1, []);
				if (out.events.some((e) => e.type === 'ball_ended')) {
					return { rng: out.snapshot.game.rng, phase: out.snapshot.game.phase };
				}
			}
			throw new Error('the served ball must genuinely drain within the bound, or this test is vacuous');
		}

		const ball1 = armLaneAndRng();
		expect(ball1.lane, "ball 1's own opening lane -- the game's one starting position, as an authored literal").toBe('top_1');
		loop.pulseCoil('c_autolaunch');
		const afterBall1 = drainToBallEnded();
		expect(afterBall1.phase, "ball 1's drain must not itself end a 3-ball game").toBe('game');

		const ball2 = armLaneAndRng();
		expect(ball2.lane, "ball 2's own advanced lane, as an authored literal").toBe('top_2');
		expect(ball2.rng, "ball 2 must take NO draw of its own -- rng stays byte-identical to its value right after ball 1's own single draw").toBe(ball1.rng);
		loop.pulseCoil('c_autolaunch');
		const afterBall2 = drainToBallEnded();
		expect(afterBall2.phase, "ball 2's drain must not itself end a 3-ball game").toBe('game');

		const ball3 = armLaneAndRng();
		expect(ball3.lane, "ball 3's own advanced lane, as an authored literal").toBe('top_3');
		expect(ball3.rng, 'ball 3 must also take no draw of its own').toBe(ball1.rng);
		loop.pulseCoil('c_autolaunch');
		const afterBall3 = drainToBallEnded();
		expect(afterBall3.phase, 'the last ball of the only player must genuinely end the game').toBe('game_over');
		expect(afterBall3.rng, "the game must still sit at the lane's own one draw the instant it ends -- the Match has not drawn yet").toBe(ball1.rng);

		let matchRng: number | undefined;
		for (let i = 0; i < 10000 && matchRng === undefined; i++) {
			const out = loop.advance(1, []);
			if (out.events.some((e) => e.type === 'match_drawn')) {
				matchRng = out.snapshot.game.rng;
			}
		}
		expect(matchRng, 'the Match must genuinely draw within the bound, or this test is vacuous').toBeDefined();
		expect(matchRng, "the Match's own single step must move rng again -- AD-3's \"Match still draws last\", now proven end to end through three REAL balls").not.toBe(ball1.rng);
	}, 120000);
});
