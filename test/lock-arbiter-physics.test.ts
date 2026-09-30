// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.2, AC 12 (Rule 1 -- Integration): the Lock arbiter on real
// physics and a real `createRules()`. Two runs:
//
// - The Lock run: a real `createLoop({ collisionDoc, gameStart })`, a real
//   Start, and the input of the reachability witness
//   `plunge-then-bat-l-3945` (`test/util/reachability.ts`): the served ball
//   settles 320 ticks after its eject, the plunger is held 521 ticks, and
//   the left flipper taps for 30 ticks 3945 ticks after the release -- the
//   shot the witness records closing `s_lock_lane` then `s_lock_1`. The
//   witness ejects on physics tick 1; the loop's Start serve is consumed on
//   tick 3 (Start pressed on tick 2, AD-4), so every input tick here is the
//   witness's plus 2. Before this story the capture ended ball 1 inside its
//   live save (`ball_saved`, DW-221).
// - The spit run: `createMachine()` and `createRules()` composed by hand
//   (the `driveLockLane()` convention of
//   `test/rules-devices-integration.test.ts`), each tick's rules
//   `coilCommands` fed to physics on the next tick (AD-4). Player 1 already
//   holds 2 credits, so an 800 mm/s Lock shot is spat: the show on the
//   capture tick, `c_mouth` exactly `mouthOpenLeadTicks` later, physics
//   opening `s_lock_1`, and the ball ending only on its own later drain.
//
// A `*-physics.test.ts` file: it drives real physics on purpose, so it is
// not a `rules-*` headless test and is not listed in
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { createMachine } from '../src/sim/physics/machine';
import { bootDeviceSlots, createRules } from '../src/sim/rules';
import { TABLE } from '../src/sim/table/dragonwar';
import { MM_PER_VU, toPhysics } from '../src/sim/table/frames';
import { resolveTuning, shotWindowTicks } from '../src/sim/table/tuning';
import type { GameAdjustments } from '../src/sim/contracts/replay';
import type { GameStart, GameState, MachineCommand, SemanticEvent, ShowCommand, SwitchEvent } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

const TUNING = resolveTuning();
const LEAD = shotWindowTicks('mouthOpenLeadMs', TUNING);
const HOLD = shotWindowTicks('mouthCloseHoldMs', TUNING);
const ADJUSTMENTS: GameAdjustments = { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 };

/** `plunge-then-bat-l-3945`'s own recipe (`test/util/reachability.ts`). */
const WITNESS = { settleTicks: 320, plungeHoldTicks: 521, flipAt: 3945, flipHold: 30 } as const;

describe('Story 3.2, AC 12 -- the Lock run: a real game locks a ball and serves the next (DW-221)', () => {
	it('the plunge-then-bat-l-3945 shot in a real createLoop game: lock_lane_locked { 0, 1 } with no ball_saved or ball_ended; a new ball is served and autolaunched (ballsInPlay back to 1); bd_lock holds one ball', () => {
		const gameStart: GameStart = { seed: 0, tuning: TUNING, adjustments: ADJUSTMENTS, highscores: [] };
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart, tuning: TUNING });

		// The witness ejects on physics tick 1; Start on tick 2 serves on tick 3.
		const offset = 2;
		const plungeOn = WITNESS.settleTicks + 1 + offset;
		const releaseOn = plungeOn + WITNESS.plungeHoldTicks;
		const flipOn = releaseOn + WITNESS.flipAt;
		const flipOff = flipOn + WITNESS.flipHold;
		const transitions = [
			{ tick: 2, frame: { ...NO_FRAME, start: true } },
			{ tick: 3, frame: NO_FRAME },
			{ tick: plungeOn, frame: { ...NO_FRAME, plunger: true } },
			{ tick: releaseOn, frame: NO_FRAME },
			{ tick: flipOn, frame: { ...NO_FRAME, flipper_l: true } },
			{ tick: flipOff, frame: NO_FRAME },
		];

		const events: SemanticEvent[] = [];
		let lockedTick = -1;
		let relaunchTick = -1;
		let ballsInPlayAtRelaunch = -1;
		let lockSlotsAtRelaunch: readonly boolean[] = [];
		let lockMechanismSlotsAtRelaunch: readonly boolean[] = [];
		let ballsInPlayAtLock = -1;
		let tick = 0;
		const cap = flipOff + 3000;
		while (tick < cap && relaunchTick === -1) {
			tick += 1;
			const out = loop.advance(1, transitions.filter((transition) => transition.tick === tick));
			events.push(...out.events);
			if (lockedTick === -1 && out.events.some((event) => event.type === 'lock_lane_locked')) {
				lockedTick = tick;
				ballsInPlayAtLock = out.snapshot.game.machine.ballsInPlay;
			}
			if (lockedTick !== -1 && tick > lockedTick && out.events.some((event) => event.type === 'ball_launched')) {
				relaunchTick = tick;
				ballsInPlayAtRelaunch = out.snapshot.game.machine.ballsInPlay;
				lockSlotsAtRelaunch = out.snapshot.game.machine.deviceSlots.bd_lock;
				lockMechanismSlotsAtRelaunch = out.snapshot.mechanisms.devices.bd_lock.slots;
			}
		}

		const launches = events.filter((event) => event.type === 'ball_launched');
		expect(launches.length, 'the premise: the player\'s own plunge launched ball 1').toBeGreaterThanOrEqual(1);
		expect(events.filter((event) => event.type === 'ball_save_timer_started'), 'the premise: the plunge armed the save, so a capture inside it would have been saved before this story').toHaveLength(1);

		const outcomes = events.filter((event) => event.type === 'lock_lane_locked' || event.type === 'lock_lane_spit');
		expect(outcomes, `the witness shot is captured and locked -- events: ${JSON.stringify(events.map((e) => e.type))}`).toEqual([{ type: 'lock_lane_locked', player: 0, credits: 1, tick: lockedTick }]);
		expect(ballsInPlayAtLock, 'the capture takes the ball out of play').toBe(0);
		expect(events.filter((event) => event.type === 'ball_saved'), 'a Lock capture is never a saved drain (DW-221)').toEqual([]);
		expect(events.filter((event) => event.type === 'ball_ended'), 'nor a drain').toEqual([]);

		expect(relaunchTick, 'a new ball is served and autolaunched').toBeGreaterThan(lockedTick);
		expect(ballsInPlayAtRelaunch, 'the new ball\'s ball_launched restores ballsInPlay').toBe(1);
		expect(lockSlotsAtRelaunch, 'bd_lock holds the one locked ball').toEqual([true, false, false]);
		expect(lockMechanismSlotsAtRelaunch, 'and physics agrees: the real bd_lock holds that one ball').toEqual([true, false, false]);
		expect(events.filter((event) => event.type === 'ball_save_timer_started'), 'the relaunch never re-arms the save').toHaveLength(1);
	}, 120_000);
});

/** The rules initial state for the spit run: a game, player 1 holding 2 credits, the boot device slots, nothing in play yet. */
function spitRunState(): GameState {
	return {
		tick: 0,
		phase: 'game',
		machine: {
			ballsInPlay: 0,
			hardwareEnabled: true,
			ballSave: { untilTick: null, sources: [] },
			tilt: { tilted: false, slamTilted: false },
			multiball: null,
			highscores: [],
			deviceSlots: bootDeviceSlots(),
		},
		players: [
			{
				score: 0,
				letters: '',
				lockCredits: 2,
				tiltWarnings: 0,
				bonus: { byCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1 },
				lanes: { lit: {}, completedSets: [] },
				extraBalls: 0,
				jackpotSeed: 0,
				warsStarted: 0,
				modesPlayed: [],
				ballNumber: 1,
			},
		],
		currentPlayer: 0,
		modes: [],
		rng: 0,
	};
}

describe('Story 3.2, AC 12 -- the spit run: real physics spits a ball through the Mouth after the lead', () => {
	it('two credits and an 800 mm/s Lock shot: show on the capture tick, c_mouth exactly LEAD later, physics opens s_lock_1, ballsInPlay 1 after the eject, and ball_ended only on the spat ball\'s own later drain', () => {
		const machine = createMachine(loadDoc(), TUNING);
		const rules = createRules(TUNING, ADJUSTMENTS);
		let state = spitRunState();
		let pending: MachineCommand[] = [];
		let tick = 0;

		const events: SemanticEvent[] = [];
		const shows: ShowCommand[] = [];
		const mouthPulses: number[] = [];
		const lockSlotOpens: number[] = [];
		const ballsInPlayByTick = new Map<number, number>();

		function stepOnce(): void {
			tick += 1;
			const result = machine.step(tick, NO_FRAME, pending.map((command) => ({ ...command, tick })));
			const switchEvents = result.switchEvents as readonly SwitchEvent[];
			for (const edge of switchEvents) {
				if (edge.switch === 's_lock_1' && !edge.closed) {
					lockSlotOpens.push(tick);
				}
			}
			const rulesResult = rules.step(state, switchEvents, tick, { recovered: result.recovered, failures: result.semanticEvents });
			state = rulesResult.state;
			events.push(...rulesResult.events);
			shows.push(...rulesResult.commands);
			for (const command of rulesResult.coilCommands) {
				if (command.coil === 'c_mouth' && command.action === 'pulse') {
					mouthPulses.push(tick);
				}
			}
			ballsInPlayByTick.set(tick, state.machine.ballsInPlay);
			pending = [
				...rulesResult.coilCommands.map((command): MachineCommand => ({ type: 'coil', coil: command.coil, action: command.action, tick })),
				...rulesResult.recoverCommands.map((): MachineCommand => ({ type: 'recover', tick })),
			];
		}

		// Serve a ball (the driveLockLane() convention: a real trough eject,
		// then 320 ticks to settle on the plunger tip).
		pending = [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick: 1 }];
		for (let i = 0; i < 320; i++) {
			stepOnce();
		}
		const ball = machine.balls[0];
		expect(ball, 'the premise: a served ball exists').toBeDefined();

		// Reposition it at the Lock lane's own centreline and launch it
		// straight up the lane at 800 mm/s -- the measured capturing shot.
		const startPhysics = toPhysics({ x: 170, y: 440, z: 13.5 });
		ball!.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
		ball!.hit.vel.set(0, -(800 / (MM_PER_VU * 100)), 0);
		ball!.hit.angularVelocity.set(0, 0, 0);
		ball!.hit.angularMomentum.set(0, 0, 0);

		let captureTick = -1;
		let endedTick = -1;
		for (let i = 0; i < 12000 && endedTick === -1; i++) {
			stepOnce();
			if (captureTick === -1 && events.some((event) => event.type === 'lock_lane_spit')) {
				captureTick = tick;
			}
			if (events.some((event) => event.type === 'ball_ended')) {
				endedTick = tick;
			}
		}

		expect(events.filter((event) => event.type === 'ball_launched'), 'the premise: the launched ball is in play').toHaveLength(1);
		const outcomes = events.filter((event) => event.type === 'lock_lane_locked' || event.type === 'lock_lane_spit');
		expect(outcomes).toEqual([{ type: 'lock_lane_spit', player: 0, credits: 2, credited: false, tick: captureTick }]);
		// Story 3.3 (AC2, AD-18): the sequence's one close follows its one
		// pulse by exactly mouthCloseHoldTicks -- a real-physics pin; this run
		// continues to ball_ended, far past the close.
		expect(shows, 'the open on the capture tick, the close HOLD after the pulse').toEqual([
			{ type: 'show', show: 'show_dragon_mouth_open', tick: captureTick },
			{ type: 'show', show: 'show_dragon_mouth_close', tick: captureTick + LEAD + HOLD },
		]);
		expect(mouthPulses, 'c_mouth exactly mouthOpenLeadTicks later').toEqual([captureTick + LEAD]);
		expect(ballsInPlayByTick.get(captureTick), 'the capture takes the ball out of play').toBe(0);
		expect(lockSlotOpens, 'physics opens s_lock_1 on the tick it consumes the pulse').toEqual([captureTick + LEAD + 1]);
		expect(ballsInPlayByTick.get(captureTick + LEAD + 1), 'the spat ball is back in play after the eject').toBe(1);

		expect(endedTick, 'the spat ball genuinely drains and ends the ball').toBeGreaterThan(captureTick + LEAD + 1);
		expect(ballsInPlayByTick.get(endedTick - 1), 'still in play the tick before its drain').toBe(1);
		const ended = events.filter((event) => event.type === 'ball_ended');
		expect(ended.map((event) => event.tick), 'ball_ended fires once, on the spat ball\'s own drain -- never at the capture').toEqual([endedTick]);
	}, 120_000);
});
