// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.6 QA (AC 1 to AC 10's real-runtime leg; AD-4, AD-8, AD-9, AD-19,
// FR-36): Joust on the object the browser runs -- one real `createLoop()`,
// physics and rules composed, from Attract. Nothing sits between physics and
// rules: every switch edge the rules read is one the loop's own machine
// produced, and the tracker and Joust are the loop's own.
//
// The story's other tests each hold one side still. `rules-joust*.test.ts`
// script the switch edges by hand; `loop-fall-back-physics.test.ts` feeds a
// real machine's edges to a tracker built by the test, with no rules stack and
// no game; `rules-joust-integration.test.ts` records a launch and replays it
// through the rules later. This file runs them together, once.
//
// WHAT EACH INPUT IS, exactly. The run has two parts, and the first
// teleport is the line between them.
//
// ONE THING IS NOT THE BROWSER'S: the game is started with `ballsPerGame: 5`.
// `src/host/boot.ts` starts every game with 3, and the real-input script
// below needs four balls to reach Joust (one witness Ramp per ball, then a
// Lock capture on the fourth), so at the browser's own adjustments this
// script would end at game over after ball 3, with Joust lit and never
// started. `ballsPerGame` is a `GameStart` adjustment, not seeded state, and
// nothing the tracker or Joust does reads it -- but "real input alone reaches
// Joust" is shown here for a five-ball game only. A three-ball game needs two
// shots on one ball, and this file has no recipe for that.
//
// 1. REAL INPUT ONLY (tick 1 to the first teleport). A real Start press; a
//    held and released plunger; flipper presses; a Start press in the
//    mode-select window. Nothing is repositioned and no state is seeded.
//    - Balls 1, 2 and 3: the reachability witness `plunge-then-bat-r-3899`
//      (`test/util/reachability.ts`: the MEDIUM 285-tick plunge, then the
//      right bat for 60 ticks, 3899 ticks after the release). The plunge
//      descends the Right Loop lane from above, the bat makes the Ramp, and
//      the Ramp's return comes down through `s_loop_r_in`. Each ball then
//      drains inside its ball save, and the saved ball is autolaunched by the
//      rules' own coil: it crosses the top and descends the LEFT lane.
//    - Ball 4: the witness `plunge-then-bat-l-3945` (the FULL 521-tick
//      plunge, then the left bat for 30 ticks). The plunge descends the Left
//      Loop lane, and the bat puts the ball in the Lock. Three Modes are lit,
//      so the mode-select window opens; one left-flipper press wraps the
//      selection back to Joust and Start confirms it.
//    - With Joust running, the Lock's replacement ball is autolaunched and
//      descends the Left Loop lane.
//    So real input gives eleven descents of a Loop lane from above (three
//    medium plunges, three Ramp returns, four autolaunches and one full
//    plunge), on a game in progress, the last of them under a running Joust.
// 2. TELEPORTED LAUNCHES (from the first teleport on). At this tree no real
//    flipper shot can enter a Loop (ledger DW-319, routed to Story 3.3d), so
//    a made Loop has to be put there by hand. Each time the ball closes an
//    inlane, the test repositions it at the manifest's release point on that
//    side (`left-loop-orbit-31` / `right-loop-orbit-31`, `test/util/shot-cases.ts`),
//    moving straight up the playfield with no spin: eleven times at the
//    manifest's 2200 mm/s (made Loops, alternating sides because an orbit
//    comes down the far lane), then once at 450 mm/s (the right fall-back
//    recipe of `loop-fall-back-physics.test.ts`). From the reposition on, the
//    ball, the switches, the tracker and Joust are all the loop's own.
//    A TELEPORTED LAUNCH PROVES THE WIRING, NOT REAL PLAY: it shows that a
//    ball on that path is read, paid and broken correctly by the composed
//    loop. It does not show that a player can put a ball there.
//
// HOW IT IS OBSERVED. `FrameOutput` carries no switch edge, no shot event and
// no `ModeEvent` (`joust_charge_broken` and `joust_full_charge` stay off
// `SemanticEvent`), so three factories are wrapped, each returning the REAL
// object's own results unchanged (the `test/dragon-shows-loop-qa-physics.test.ts`
// convention):
// - `createMachine()`: the loop's own machine is kept, so the test can
//   reposition its ball;
// - `createShotTracker()`: every event the loop's own tracker emits is
//   recorded;
// - `createRules()`: the switch edges the loop hands `step()` and the
//   `modeEvents` it returns are recorded.
// The wrappers add, drop and reorder nothing.
//
// Every expected tick is read from the run's own recorded switch closures,
// and every expected value from `resolveTuning()` -- never from Joust or the
// tracker. Known limits of the delivered signature (DW-321 to DW-326) are not
// asserted here either way.
//
// A `*-physics.test.ts` file: it drives real physics on purpose, so it is not
// a `rules-*` headless test and is not listed in
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { advanceBackglass, BALL_ENDED_HOLD_TICKS, INITIAL_BACKGLASS_VIEW, renderFrame, type BackglassView, type DmdFrame } from '../src/presentation/backglass/frame';
import { rasterise, type DmdRaster } from '../src/presentation/backglass/raster';
import { FONT_5X7, GLYPH_ADVANCE, GLYPH_H, GLYPH_W } from '../src/presentation/backglass/font';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { MODE_PRIORITIES } from '../src/sim/rules/modes';
import { TABLE } from '../src/sim/table/dragonwar';
import { MM_PER_VU, toPhysics } from '../src/sim/table/frames';
import { resolveTuning, shotWindowTicks } from '../src/sim/table/tuning';
import { shotCase } from './util/shot-cases';
import type { Machine } from '../src/sim/physics/machine';
import type { ActiveModeState } from '../src/sim/contracts/state';
import type { GameAdjustments } from '../src/sim/contracts/replay';
import type { InputFrame, InputTransition } from '../src/sim/contracts/input';
import type { GameStart, GameState, SemanticEvent, SwitchEvent, SwitchName } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

const TUNING = resolveTuning();
const V = TUNING.loopValue.value;
const M = TUNING.joustChargeMax.value;
const T = Math.max(1, shotWindowTicks('joustMs', TUNING));
const SPINNER_SCORE = TUNING.spinnerScore.value;
const LOOP_WINDOW_TICKS = TUNING.loopWindowTicks.value;
const LOOP_BREAK_TICKS = TUNING.loopBreakWindowTicks.value;
const LOOP_DESCENT_TICKS = TUNING.loopDescentWindowTicks.value;
/** Ticks per second of the Joust clock, from the tunable's own two forms. */
const TICKS_PER_SECOND = T / (TUNING.joustMs.value / 1000);
/** `ballsPerGame: 5` is NOT the browser's 3 -- see this file's header: the real-input script needs a fourth ball. */
const ADJUSTMENTS: GameAdjustments = { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 3, ballsPerGame: 5, matchProbability: 0 };

/** The two reachability witnesses (`test/util/reachability.ts`), by their own recorded parameters. */
const RAMP_WITNESS = { plungeHoldTicks: 285, side: 'r', flipAt: 3899, flipHold: 60 } as const;
const LOCK_WITNESS = { plungeHoldTicks: 521, side: 'l', flipAt: 3945, flipHold: 30 } as const;
/** A witness's plunge begins 321 ticks after its ball's `ball_started` (settle 320, eject on tick 1 -- `test/hurry-up-physics.test.ts`'s offset). */
const PLUNGE_AFTER_BALL_STARTED = 321;
/** The mode-select window's two presses, in ticks after the capture opened it. */
const MOVE_AFTER_CAPTURE = 10;
const CONFIRM_AFTER_CAPTURE = 20;

/** Made Loops driven by teleport: one more than the cap, so the cap is seen holding. */
const ORBITS = M + 1;
/** The fall-back launch speed on each side -- the recipes of `test/loop-fall-back-physics.test.ts`. */
const FALL_BACK_MM_PER_S = { l: 800, r: 450 } as const;
/** Guards against a run that never ends: this one measured about 87,000 ticks at this tree. */
const CAP_TICKS = 140_000;
/** Ticks the run continues past ball 5's start, so the ball-ended screen's hold releases and the score screen is drawn again. */
const AFTER_BALL_5_TICKS = BALL_ENDED_HOLD_TICKS + 100;

type Side = 'l' | 'r';

/** Each Loop's own switches, its shot and its manifest release point, by side. */
const LOOP = {
	l: { in: 's_loop_l_in', out: 's_loop_l_out', inlane: 's_inlane_l', outlane: 's_outlane_l', shot: 'shot_left_loop', release: shotCase('left-loop-orbit-31') },
	r: { in: 's_loop_r_in', out: 's_loop_r_out', inlane: 's_inlane_r', outlane: 's_outlane_r', shot: 'shot_right_loop', release: shotCase('right-loop-orbit-31') },
} as const;

/** Every switch any declared shot reads -- its sequence and, for a Loop, its `fallBack` descents and exits. Derived from `TABLE.shots`. */
const SHOT_SWITCHES: ReadonlySet<SwitchName> = new Set(
	Object.values(TABLE.shots).flatMap((shot): SwitchName[] => ('fallBack' in shot ? [...shot.sequence, ...shot.fallBack.descents, ...shot.fallBack.exits] : [...shot.sequence])),
);

// ---------------------------------------------------------------------------
// The three recording wrappers. Each hands back the REAL object's results.
// ---------------------------------------------------------------------------

const recorder = vi.hoisted(() => ({
	/** Every machine `createLoop()` built. */
	machines: [] as unknown[],
	/** Every switch edge the loop handed `rules.step()`, in order. */
	switches: [] as unknown[],
	/** Every event the loop's own shot tracker emitted, in order. */
	shots: [] as { type: string; tick: number }[],
	/** Every `ModeEvent` `rules.step()` returned, in order. */
	modeEvents: [] as unknown[],
}));

vi.mock('../src/sim/physics/machine', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/sim/physics/machine')>();
	return {
		...actual,
		createMachine: (...args: Parameters<typeof actual.createMachine>) => {
			const machine = actual.createMachine(...args);
			recorder.machines.push(machine);
			return machine;
		},
	};
});

vi.mock('../src/sim/rules/devices/shots', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/sim/rules/devices/shots')>();
	return {
		...actual,
		createShotTracker: (...args: Parameters<typeof actual.createShotTracker>) => {
			const tracker = actual.createShotTracker(...args);
			return {
				step: (switchEvents: Parameters<typeof tracker.step>[0], tick: number) => {
					const emitted = tracker.step(switchEvents, tick);
					for (const event of emitted) {
						recorder.shots.push({ type: event.type, tick: event.tick });
					}
					return emitted;
				},
			};
		},
	};
});

vi.mock('../src/sim/rules', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/sim/rules')>();
	return {
		...actual,
		createRules: (...args: Parameters<typeof actual.createRules>) => {
			const rules = actual.createRules(...args);
			return {
				...rules,
				step: (state: Parameters<typeof rules.step>[0], switchEvents: Parameters<typeof rules.step>[1], tick: number, report?: Parameters<typeof rules.step>[3]) => {
					recorder.switches.push(...switchEvents);
					const result = rules.step(state, switchEvents, tick, report);
					recorder.modeEvents.push(...result.modeEvents);
					return result;
				},
			};
		},
	};
});

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------

/** A witness's input transitions, offset from its own ball's `ball_started` tick. */
function witnessInputs(ballStarted: number, witness: typeof RAMP_WITNESS | typeof LOCK_WITNESS): InputTransition[] {
	const plungeOn = ballStarted + PLUNGE_AFTER_BALL_STARTED;
	const releaseOn = plungeOn + witness.plungeHoldTicks;
	const flipOn = releaseOn + witness.flipAt;
	const flipper: keyof InputFrame = witness.side === 'l' ? 'flipper_l' : 'flipper_r';
	return [
		{ tick: plungeOn, frame: { ...NO_FRAME, plunger: true } },
		{ tick: releaseOn, frame: NO_FRAME },
		{ tick: flipOn, frame: { ...NO_FRAME, [flipper]: true } },
		{ tick: flipOn + witness.flipHold, frame: NO_FRAME },
	];
}

/** Reads one DMD text row back from the lit dots (the `test/rules-hurry-up-integration.test.ts` reader). */
function readRow(raster: DmdRaster, col: number, row: number): string {
	const dot = (r: number, c: number): number => raster.dots[r * raster.cols + c] ?? 0;
	const inverse = col > 0 && dot(row, col - 1) === 1;
	let text = '';
	for (let origin = col; origin + GLYPH_W <= raster.cols; origin += GLYPH_ADVANCE) {
		const bits: number[] = [];
		for (let gy = 0; gy < GLYPH_H; gy++) {
			let mask = 0;
			for (let gx = 0; gx < GLYPH_W; gx++) {
				mask = (mask << 1) | (dot(row + gy, origin + gx) ^ (inverse ? 1 : 0));
			}
			bits.push(mask);
		}
		const match = Object.entries(FONT_5X7).find(([, glyph]) => glyph.every((m, i) => m === bits[i]));
		if (!match) {
			break;
		}
		text += match[0];
	}
	return text.trimEnd();
}

/** Every row of `frame`, read back from its rasterised dots at the row's own origin. */
function panel(frame: DmdFrame): string[] {
	const raster = rasterise(frame, FONT_5X7);
	return frame.rows.map((row) => readRow(raster, row.col, row.row));
}

interface Teleport {
	/** The tick after whose step the ball was repositioned -- the tick the inlane closed. */
	readonly tick: number;
	readonly side: Side;
	readonly speedMmPerS: number;
}

interface Run {
	readonly games: Map<number, GameState>;
	readonly frames: Map<number, DmdFrame>;
	readonly events: SemanticEvent[];
	readonly switches: readonly SwitchEvent[];
	readonly shots: readonly (readonly [string, number])[];
	readonly modeEvents: readonly { readonly type: string; readonly tick: number }[];
	readonly ballStarted: number[];
	readonly teleports: Teleport[];
	readonly machinesBuilt: number;
	readonly lastTick: number;
}

/**
 * From Attract: Start; balls 1 to 3 on the Ramp witness; ball 4 on the Lock
 * witness, then the window's two presses. Once Joust runs, every inlane
 * closure repositions the ball on that side: `ORBITS` times at the manifest
 * speed, then once at the fall-back speed. Runs until `AFTER_BALL_5_TICKS`
 * after ball 5 starts.
 */
function runGame(): Run {
	recorder.machines.length = 0;
	recorder.switches.length = 0;
	recorder.shots.length = 0;
	recorder.modeEvents.length = 0;

	const gameStart: GameStart = { seed: 0, tuning: TUNING, adjustments: ADJUSTMENTS, highscores: [] };
	const loop = createLoop({ collisionDoc: JSON.parse(readFileSync(COLLISION_PATH, 'utf8')), gameStart, tuning: TUNING });
	const machine = recorder.machines[0] as Machine | undefined;
	if (!machine) {
		throw new Error('runGame(): createLoop() built no machine through the wrapped createMachine()');
	}

	let transitions: InputTransition[] = [
		{ tick: 2, frame: { ...NO_FRAME, start: true } },
		{ tick: 3, frame: NO_FRAME },
	];
	const games = new Map<number, GameState>();
	const frames = new Map<number, DmdFrame>();
	const events: SemanticEvent[] = [];
	const ballStarted: number[] = [];
	const teleports: Teleport[] = [];
	let view: BackglassView = INITIAL_BACKGLASS_VIEW;
	let windowPressed = false;
	let switchesSeen = 0;
	let tick = 0;

	while (tick < CAP_TICKS && (ballStarted.length < 5 || tick < ballStarted[4]! + AFTER_BALL_5_TICKS)) {
		tick += 1;
		const out = loop.advance(1, transitions.filter((transition) => transition.tick === tick));
		games.set(tick, out.snapshot.game);
		events.push(...out.events);
		view = advanceBackglass(view, out);
		frames.set(tick, renderFrame(view, out.snapshot));

		for (const event of out.events) {
			if (event.type === 'ball_started') {
				ballStarted.push(tick);
				if (ballStarted.length <= 3) {
					transitions = transitions.concat(witnessInputs(tick, RAMP_WITNESS));
				} else if (ballStarted.length === 4) {
					transitions = transitions.concat(witnessInputs(tick, LOCK_WITNESS));
				}
			}
			if (event.type === 'lock_lane_mode_start' && !windowPressed) {
				windowPressed = true;
				transitions = transitions.concat([
					{ tick: tick + MOVE_AFTER_CAPTURE, frame: { ...NO_FRAME, flipper_l: true } },
					{ tick: tick + MOVE_AFTER_CAPTURE + 2, frame: NO_FRAME },
					{ tick: tick + CONFIRM_AFTER_CAPTURE, frame: { ...NO_FRAME, start: true } },
					{ tick: tick + CONFIRM_AFTER_CAPTURE + 1, frame: NO_FRAME },
				]);
			}
		}

		// The inlane this tick's step closed, if any -- read from the edges the
		// loop handed its own rules.
		let inlane: Side | undefined;
		for (; switchesSeen < recorder.switches.length; switchesSeen++) {
			const edge = recorder.switches[switchesSeen] as SwitchEvent;
			if (edge.closed && edge.switch === LOOP.l.inlane) {
				inlane = 'l';
			} else if (edge.closed && edge.switch === LOOP.r.inlane) {
				inlane = 'r';
			}
		}
		const joustRunning = out.snapshot.game.modes.some((entry) => entry.mode === 'joust');
		if (inlane && joustRunning && teleports.length <= ORBITS) {
			const ball = machine.balls[0];
			if (!ball || machine.balls.length !== 1) {
				throw new Error(`runGame(): expected exactly one ball to reposition at tick ${tick}, found ${machine.balls.length}`);
			}
			const speedMmPerS = teleports.length < ORBITS ? LOOP[inlane].release.speedMmPerS : FALL_BACK_MM_PER_S[inlane];
			const start = toPhysics(LOOP[inlane].release.startMm);
			ball.state.pos.set(start.x, start.y, start.z);
			// toPhysics() flips table y -> physics -y, so "up the playfield" is a
			// negative physics y velocity (test/shot-routing.test.ts's convention).
			ball.hit.vel.set(0, -speedMmPerS / (MM_PER_VU * 100), 0);
			ball.hit.angularVelocity.set(0, 0, 0);
			ball.hit.angularMomentum.set(0, 0, 0);
			teleports.push({ tick, side: inlane, speedMmPerS });
		}
	}

	return {
		games,
		frames,
		events,
		switches: [...(recorder.switches as SwitchEvent[])],
		shots: recorder.shots.map((shot) => [shot.type, shot.tick] as const),
		modeEvents: [...(recorder.modeEvents as { type: string; tick: number }[])],
		ballStarted,
		teleports,
		machinesBuilt: recorder.machines.length,
		lastTick: tick,
	};
}

describe('Story 3.6 QA -- Joust on a real createLoop(): real input to a running Joust, then teleported Loops', () => {
	const run = runGame();
	const game = (tick: number): GameState => run.games.get(tick)!;
	const joust = (tick: number): ActiveModeState | undefined => game(tick).modes.find((entry) => entry.mode === 'joust');
	const score = (tick: number): number => game(tick).players[0]!.score;
	const paidOn = (tick: number): number => score(tick) - score(tick - 1);
	const eventsOf = (type: string): SemanticEvent[] => run.events.filter((event) => event.type === type);
	/** The ticks `name` closed on inside `(from, to]`. */
	const closes = (name: SwitchName, from = 0, to = run.lastTick): number[] =>
		run.switches.filter((edge) => edge.closed && edge.switch === name && edge.tick > from && edge.tick <= to).map((edge) => edge.tick);
	/** The shot switches closed inside `(from, to]`, in order, as names. */
	const shotCloses = (from: number, to: number): SwitchName[] =>
		run.switches.filter((edge) => edge.closed && SHOT_SWITCHES.has(edge.switch) && edge.tick > from && edge.tick <= to).map((edge) => edge.switch);
	/** The loop's own tracker's events inside `(from, to]`. */
	const shotsIn = (from: number, to: number): (readonly [string, number])[] => run.shots.filter(([, tick]) => tick > from && tick <= to);
	const joustEvents = run.modeEvents.filter((event) => event.type.startsWith('joust_'));

	const [ball1, ball2, ball3, ball4, ball5] = run.ballStarted;
	const joustStart = [...run.games.keys()].find((tick) => joust(tick) !== undefined) ?? -1;
	const firstTeleport = run.teleports[0]?.tick ?? -1;
	const orbits = run.teleports.slice(0, ORBITS);
	const fallBack = run.teleports[ORBITS];
	/** Each teleported orbit's own `_out` closure -- the tick its Loop is made on. */
	const madeTicks = orbits.map((teleport) => closes(LOOP[teleport.side].out, teleport.tick)[0] ?? -1);
	/** The fall-back's second entry closure -- the tick it is broken on. */
	const brokenTick = fallBack ? (closes(LOOP[fallBack.side].in, fallBack.tick)[1] ?? -1) : -1;
	const endOfBall4 = eventsOf('ball_ended').find((event) => event.tick > joustStart)?.tick ?? -1;
	/** The Charge an independent count of the made Loops gives at `tick`: the alternating run so far, capped, and 1 again from the break. */
	const chargeAt = (tick: number): number => (tick >= brokenTick ? 1 : Math.max(1, Math.min(M, madeTicks.filter((made) => made <= tick).length)));

	// -----------------------------------------------------------------------
	describe('the premises: real input alone takes a game from Attract to a running Joust', () => {
		it('a real Start from Attract, one machine, five balls started in one one-player game, and no teleport before Joust runs', () => {
			expect(run.machinesBuilt, 'createLoop() built exactly one machine, the one this test repositions a ball on').toBe(1);
			expect(game(1).phase, 'Attract before the Start press on tick 2').toBe('attract');
			expect(run.ballStarted, `the run reached ball 5 inside ${CAP_TICKS} ticks`).toHaveLength(5);
			expect([ball1, ball2, ball3, ball4, ball5].map((tick) => game(tick!).players[0]!.ballNumber)).toEqual([1, 2, 3, 4, 5]);
			expect(game(run.lastTick).players, 'one player: the window\'s Start added none').toHaveLength(1);
			expect(joustStart, 'Joust started').toBeGreaterThan(ball4!);
			expect(firstTeleport, 'everything up to and including the Joust start is real input').toBeGreaterThan(joustStart);
		});

		it('balls 1, 2 and 3: each real right-bat Ramp is made by the loop\'s own tracker and lights the next Mode -- Hurry-up, Quick multiball, Joust', () => {
			const ramps = closes('s_ramp_made', 0, ball4!);
			expect(ramps, 'one made Ramp per ball').toHaveLength(3);
			expect([ramps[0]! > ball1! && ramps[0]! < ball2!, ramps[1]! > ball2! && ramps[1]! < ball3!, ramps[2]! > ball3! && ramps[2]! < ball4!]).toEqual([true, true, true]);
			expect(shotsIn(0, ball4!)).toEqual(ramps.map((tick) => ['shot_ramp_made', tick]));
			expect(ramps.map((tick) => game(tick - 1).players[0]!.modesLit)).toEqual([[], ['hurryup'], ['hurryup', 'quickmb']]);
			expect(ramps.map((tick) => game(tick).players[0]!.modesLit)).toEqual([['hurryup'], ['hurryup', 'quickmb'], ['hurryup', 'quickmb', 'joust']]);
		});

		it('ball 4: the real Lock capture opens the window on Hurry-up, the left flipper wraps back to Joust, Start confirms it, and Joust starts on the confirm tick', () => {
			const captured = eventsOf('lock_lane_mode_start')[0]?.tick ?? -1;
			expect(captured).toBeGreaterThan(ball4!);
			const trace = run.events
				.filter((event) => event.type === 'lock_lane_mode_start' || event.type.startsWith('mode_select_'))
				.map((event) => [event.type, 'selected' in event ? event.selected : 'mode' in event ? event.mode : null, event.tick]);
			expect(trace).toEqual([
				['lock_lane_mode_start', 'hurryup', captured],
				['mode_select_moved', 'joust', captured + MOVE_AFTER_CAPTURE],
				['mode_select_ended', 'joust', captured + CONFIRM_AFTER_CAPTURE],
			]);
			expect(joustStart).toBe(captured + CONFIRM_AFTER_CAPTURE);
			expect(run.modeEvents.filter((event) => event.type === 'mode_joust_started').map((event) => event.tick)).toEqual([joustStart]);
			expect(joust(joustStart - 1)).toBeUndefined();
			expect(joust(joustStart)).toEqual({ mode: 'joust', priority: MODE_PRIORITIES.joust, player: 0, startTick: joustStart, charge: 1, timerTicks: T });
			expect(game(joustStart).players[0]!.modesLit, 'the start consumed the lit Mode').toEqual(['hurryup', 'quickmb']);
			expect(score(joustStart), 'the premise of every award below: nothing scored on the way here').toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	describe('REAL INPUT, a game in progress: a ball coming down a Loop lane from above produces no Loop event', () => {
		it.each([
			['1', () => [ball1!, ball2!] as const],
			['2', () => [ball2!, ball3!] as const],
			['3', () => [ball3!, ball4!] as const],
		])('ball %s: the medium plunge descends the right lane, the Ramp returns through s_loop_r_in, and the saved ball\'s autolaunch descends the left lane -- one shot_ramp_made and nothing else', (_label, span) => {
			const [from, to] = span();
			expect(shotCloses(from, to)).toEqual([
				// the medium 285-tick plunge, falling back down the right lane
				's_loop_r_out',
				's_loop_r_in',
				's_inlane_r',
				// the right bat's Ramp shot, and its return
				's_ramp_enter',
				's_ramp_made',
				's_loop_r_in',
				's_inlane_r',
				// the ball save's autolaunch, across the top and down the left lane
				's_loop_l_out',
				's_loop_l_in',
				's_inlane_l',
			]);
			expect(shotsIn(from, to)).toEqual([['shot_ramp_made', closes('s_ramp_made', from, to)[0]]]);
		});

		it('ball 4: the full plunge descends the left lane to the inlane before the Lock shot -- no shot event at all', () => {
			expect(shotCloses(ball4!, joustStart)).toEqual(['s_loop_l_out', 's_loop_l_in', 's_inlane_l']);
			expect(shotsIn(ball4!, joustStart)).toEqual([]);
		});

		it('the premise: every one of those descents reaches the entry switch inside loopDescentWindowTicks of the switch above it', () => {
			const gaps: number[] = [];
			for (const [above, entry] of [
				['s_loop_l_out', 's_loop_l_in'],
				['s_loop_r_out', 's_loop_r_in'],
				['s_ramp_made', 's_loop_r_in'],
			] as const) {
				for (const tick of closes(above, 0, firstTeleport)) {
					const next = closes(entry, tick, firstTeleport)[0];
					expect(next, `${above}@${tick} is followed by ${entry}`).toBeDefined();
					gaps.push(next! - tick);
				}
			}
			expect(gaps, 'eleven real descents: 3 medium plunges, 3 Ramp returns, 4 autolaunches, 1 full plunge').toHaveLength(11);
			expect(Math.max(...gaps)).toBeLessThanOrEqual(LOOP_DESCENT_TICKS);
		});

		it('with Joust RUNNING: the Lock\'s replacement ball is autolaunched down the left lane, and Joust sees nothing -- Charge 1, no lastLoop, no Joust event, nothing paid, the timer on T - e every tick', () => {
			expect(shotCloses(joustStart, firstTeleport), 'the premise: a real descent through the Left Loop\'s switches while Joust runs').toEqual(['s_loop_l_out', 's_loop_l_in', 's_inlane_l']);
			expect(shotsIn(joustStart, firstTeleport)).toEqual([]);
			expect(joustEvents.filter((event) => event.tick <= firstTeleport)).toEqual([]);
			const wrong: string[] = [];
			for (let tick = joustStart; tick <= firstTeleport; tick++) {
				const entry = joust(tick);
				if (entry?.charge !== 1 || entry === undefined || 'lastLoop' in entry || entry.timerTicks !== T - (tick - joustStart)) {
					wrong.push(`${tick}: ${JSON.stringify(entry)}`);
				}
			}
			expect(wrong.slice(0, 5)).toEqual([]);
			expect(score(firstTeleport)).toBe(0);
		});

		it('the whole real-input part: the loop\'s tracker emitted three shot_ramp_made and no Loop event, though the balls closed Loop entry switches eleven times', () => {
			const before = shotsIn(0, firstTeleport);
			expect(before.map(([type]) => type)).toEqual(['shot_ramp_made', 'shot_ramp_made', 'shot_ramp_made']);
			expect([closes('s_loop_l_in', 0, firstTeleport).length, closes('s_loop_r_in', 0, firstTeleport).length], 'the premise: 5 left and 6 right entry closures').toEqual([5, 6]);
		});

		it('control: the same recorder DOES see Loop events once a ball enters a Loop from below -- the teleported part', () => {
			const after = shotsIn(firstTeleport, run.lastTick).map(([type]) => type);
			expect(after.filter((type) => type.endsWith('_loop_made')).length).toBe(ORBITS);
			expect(after.filter((type) => type.endsWith('_loop_broken')).length).toBe(1);
		});
	});

	// -----------------------------------------------------------------------
	describe('TELEPORTED launches with Joust running (the wiring, not real play): made Loops pay loopValue x Charge, and a fall-back breaks the Charge', () => {
		it('the premise: M + 1 launches at the manifest\'s 2200 mm/s, alternating left and right from the tick an inlane closed, then one right launch at 450 mm/s -- all inside the Joust timer', () => {
			expect(run.teleports).toHaveLength(ORBITS + 1);
			expect(orbits.map((teleport) => teleport.side)).toEqual(Array.from({ length: ORBITS }, (_, index) => (index % 2 === 0 ? 'l' : 'r')));
			expect(orbits.every((teleport) => teleport.speedMmPerS === 2200)).toBe(true);
			expect([fallBack?.side, fallBack?.speedMmPerS]).toEqual(['r', FALL_BACK_MM_PER_S.r]);
			for (const teleport of run.teleports) {
				expect(closes(LOOP[teleport.side].inlane, teleport.tick - 1, teleport.tick), `the inlane closed on tick ${teleport.tick}`).toEqual([teleport.tick]);
			}
			expect(brokenTick, 'the fall-back resolved').toBeGreaterThan(fallBack!.tick);
			expect(brokenTick - joustStart, 'Joust is still running at the break').toBeLessThan(T);
			expect(endOfBall4).toBeGreaterThan(brokenTick);
		});

		it('each launch enters its Loop from below and closes the far switch inside loopWindowTicks; the fall-back closes the entry twice inside loopBreakWindowTicks and leaves by the outlane', () => {
			orbits.forEach((teleport, index) => {
				const entry = closes(LOOP[teleport.side].in, teleport.tick)[0]!;
				expect(madeTicks[index]! - entry, `orbit ${index + 1}`).toBeGreaterThan(0);
				expect(madeTicks[index]! - entry, `orbit ${index + 1}`).toBeLessThanOrEqual(LOOP_WINDOW_TICKS);
			});
			expect(shotCloses(fallBack!.tick, endOfBall4)).toEqual([LOOP.r.in, LOOP.r.in, LOOP.r.outlane]);
			const [first, second] = closes(LOOP.r.in, fallBack!.tick);
			expect(second! - first!).toBeLessThanOrEqual(LOOP_BREAK_TICKS);
			expect(second).toBe(brokenTick);
		});

		it('the loop\'s own tracker: exactly one _made per launch, on the tick its far switch closed, then exactly one _broken on the second entry closure -- and nothing else, no Loop event from any orbit\'s descent', () => {
			const expected: [string, number][] = orbits.map((teleport, index) => [`${LOOP[teleport.side].shot}_made`, madeTicks[index]!]);
			expected.push([`${LOOP.r.shot}_broken`, brokenTick]);
			expect(shotsIn(firstTeleport, run.lastTick)).toEqual(expected);
		});

		it('every orbit comes down the far lane (far _out, far _in, far inlane) between its _made and the next launch', () => {
			orbits.forEach((teleport, index) => {
				const far = LOOP[teleport.side === 'l' ? 'r' : 'l'];
				expect(shotCloses(madeTicks[index]!, run.teleports[index + 1]!.tick), `orbit ${index + 1}`).toEqual([far.out, far.in, far.inlane]);
			});
		});

		it('the Charge runs 1, 2, ... M and holds at M, with lastLoop the Loop just made', () => {
			expect(madeTicks.map((tick) => [joust(tick)?.charge, joust(tick)?.lastLoop])).toEqual(
				orbits.map((teleport, index) => [Math.min(index + 1, M), LOOP[teleport.side].shot]),
			);
			expect(madeTicks.map((tick) => joust(tick - 1)?.charge), 'and not before its own _made tick').toEqual(orbits.map((_, index) => Math.max(1, Math.min(index, M))));
			expect([M, ORBITS], 'at the defaults: ten, then an eleventh at the cap').toEqual([10, 11]);
		});

		it('each made Loop pays exactly loopValue x its Charge on its own _made tick -- V, 2V, ... 10V, 10V', () => {
			for (const tick of madeTicks) {
				expect(closes('s_spinner', tick - 1, tick), `the premise: no Spinner turn shares made tick ${tick}`).toEqual([]);
			}
			expect(madeTicks.map((tick) => paidOn(tick))).toEqual(orbits.map((_, index) => V * Math.min(index + 1, M)));
			expect([paidOn(madeTicks[0]!), paidOn(madeTicks[1]!), paidOn(madeTicks[ORBITS - 1]!)], 'at the defaults').toEqual([25000, 50000, 250000]);
		});

		it('joust_full_charge fires exactly once, on the M-th _made tick; the fall-back fires joust_charge_broken{player 0, the Right Loop, charge M} on its second entry closure -- the whole Joust event list', () => {
			expect(joustEvents).toEqual([
				{ type: 'joust_full_charge', player: 0, tick: madeTicks[M - 1] },
				{ type: 'joust_charge_broken', player: 0, shot: LOOP.r.shot, charge: M, tick: brokenTick },
			]);
		});

		it('the break pays nothing, and leaves Charge 1 with no lastLoop from that tick to the ball end', () => {
			expect(paidOn(brokenTick)).toBe(0);
			expect([joust(brokenTick - 1)!.charge, joust(brokenTick - 1)!.lastLoop], 'the premise: the Charge was at the cap, on the Left Loop').toEqual([M, LOOP.l.shot]);
			for (let tick = brokenTick; tick < endOfBall4; tick++) {
				const entry = joust(tick)!;
				expect([entry.charge, 'lastLoop' in entry], `tick ${tick}`).toEqual([1, false]);
			}
		});

		it('everything else Joust\'s ball scored is the real Spinner turning as an orbit passed it: the score before the ball end is V x (1 + ... + M + M) plus spinnerScore per turn', () => {
			const turns = closes('s_spinner', 0, endOfBall4 - 1).length;
			expect(turns, 'the premise: the real Left Loop turns the Spinner').toBeGreaterThan(0);
			const charges = orbits.map((_, index) => Math.min(index + 1, M));
			expect(score(endOfBall4 - 1)).toBe(V * charges.reduce((sum, charge) => sum + charge, 0) + turns * SPINNER_SCORE);
		});

		it('the timer ran on real ticks throughout: timerTicks is T - e on every tick from the start to the ball end', () => {
			const wrong: number[] = [];
			for (let tick = joustStart; tick < endOfBall4; tick++) {
				if (joust(tick)?.timerTicks !== T - (tick - joustStart)) {
					wrong.push(tick);
				}
			}
			expect(wrong.slice(0, 5)).toEqual([]);
			expect(endOfBall4 - joustStart, 'the premise: the ball ended before the timer did').toBeLessThan(T);
		});

		it('the real drain ends the ball and stops Joust with no award: the stop triple on the ball_ended tick, the entry gone, and the score changing there by exactly ball_ended.total', () => {
			const ended = eventsOf('ball_ended').find((event) => event.tick === endOfBall4) as { total: number; player: number } | undefined;
			expect(ended?.player).toBe(0);
			expect(run.modeEvents.filter((event) => event.type.startsWith('mode_joust_') && event.tick > joustStart)).toEqual(
				(['will_stop', 'stopping', 'stopped'] as const).map((phase) => ({ type: `mode_joust_${phase}`, mode: 'joust', player: 0, tick: endOfBall4 })),
			);
			expect(joust(endOfBall4 - 1), 'running the tick before').toBeDefined();
			expect(joust(endOfBall4)).toBeUndefined();
			expect(paidOn(endOfBall4)).toBe(ended!.total);
			for (let tick = endOfBall4; tick <= run.lastTick; tick++) {
				expect(joust(tick), `never restarted (tick ${tick})`).toBeUndefined();
			}
		});
	});

	// -----------------------------------------------------------------------
	describe('the DMD dots, folded from the loop\'s own FrameOutputs as src/host/boot.ts does', () => {
		/** The fields line an independent reading of the clock and the made Loops gives at `tick`. */
		const fieldsAt = (tick: number): string => `${((T - (tick - joustStart)) / TICKS_PER_SECOND).toFixed(1)}  CHARGE X${chargeAt(tick)}`;

		it('REAL INPUT: on the confirm tick the panel reads 0, JOUST, BALL 4 and "60.0  CHARGE X1", above the first Mode still lit', () => {
			expect(T, 'the premise of the timer literal').toBe(60000);
			expect(run.frames.get(joustStart - 1)!.screen, 'the premise: the window held the panel until the confirm').toBe('mode_select');
			expect(run.frames.get(joustStart)!.screen).toBe('score');
			expect(panel(run.frames.get(joustStart)!)).toEqual(['0', 'JOUST', 'BALL 4', '60.0  CHARGE X1', 'HURRY-UP LIT']);
		});

		it('REAL INPUT: the timer decays on the panel as the autolaunched ball plays -- 59.0 a second in, 57.0 three seconds in, still CHARGE X1', () => {
			expect(firstTeleport - joustStart, 'the premise: three whole seconds of real play before the first teleport').toBeGreaterThan(3 * TICKS_PER_SECOND);
			expect(panel(run.frames.get(joustStart + TICKS_PER_SECOND)!)).toEqual(['0', 'JOUST', 'BALL 4', '59.0  CHARGE X1', 'HURRY-UP LIT']);
			expect(panel(run.frames.get(joustStart + 3 * TICKS_PER_SECOND)!)[3]).toBe('57.0  CHARGE X1');
		});

		it('every whole second from the start to the ball end, the panel reads JOUST and the fields line the clock and the made Loops give', () => {
			const wrong: string[] = [];
			let seconds = 0;
			for (let tick = joustStart; tick < endOfBall4; tick += TICKS_PER_SECOND) {
				seconds += 1;
				const rows = panel(run.frames.get(tick)!);
				if (rows[1] !== 'JOUST' || rows[2] !== 'BALL 4' || rows[3] !== fieldsAt(tick)) {
					wrong.push(`${tick}: ${JSON.stringify(rows)} vs ${fieldsAt(tick)}`);
				}
			}
			expect(wrong.slice(0, 5)).toEqual([]);
			expect(seconds, 'the premise: many seconds were read').toBeGreaterThan(40);
		});

		it('the Charge moves on the panel on the tick the Loop is made: X1 then X2 across the second _made, CHARGE X10 at the cap, and X1 again on the break', () => {
			const charge = (tick: number): string => panel(run.frames.get(tick)!)[3]!.replace(/^.*  /, '');
			expect([charge(madeTicks[1]! - 1), charge(madeTicks[1]!)]).toEqual(['CHARGE X1', 'CHARGE X2']);
			expect([charge(madeTicks[M - 1]! - 1), charge(madeTicks[M - 1]!)]).toEqual([`CHARGE X${M - 1}`, `CHARGE X${M}`]);
			expect(charge(madeTicks[ORBITS - 1]!), 'the eleventh Loop holds at the cap').toBe('CHARGE X10');
			expect([charge(brokenTick - 1), charge(brokenTick)]).toEqual(['CHARGE X10', 'CHARGE X1']);
		});

		it('the score row follows the award: 0 the tick before the first Loop, 25,000 on it', () => {
			expect(panel(run.frames.get(madeTicks[0]! - 1)!)[0]).toBe('0');
			expect(panel(run.frames.get(madeTicks[0]!)!)[0]).toBe('25,000');
		});

		it('after the ball end the first score screen back shows BALL 5 with no JOUST and no CHARGE line', () => {
			expect(panel(run.frames.get(endOfBall4 - 1)!), 'the premise: still on the panel the tick before the ball end').toContain('JOUST');
			expect(run.frames.get(endOfBall4)!.screen, 'the premise: the ball end arms the ball-ended screen').toBe('ball_ended');
			const back = [...run.frames.keys()].find((tick) => tick > endOfBall4 && run.frames.get(tick)!.screen === 'score');
			expect(back, 'the premise: the score screen returns after the ball-ended hold').toBeDefined();
			const after = panel(run.frames.get(back!)!);
			expect(after, `the premise: ball 5's score screen at ${back}`).toContain('BALL 5');
			expect(after, `no JOUST at ${back}`).not.toContain('JOUST');
			expect(after.some((row) => row.includes('CHARGE')), `no CHARGE line at ${back}: ${JSON.stringify(after)}`).toBe(false);
		});
	});
});
