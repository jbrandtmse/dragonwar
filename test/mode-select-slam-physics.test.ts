// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.4 QA (AC 4, AD-18, AD-6): the implement stage's one named
// unverified risk, on REAL physics. A Slam while a mode-select window holds
// an UNLOCKED capture (release 'mouth': the player already holds two
// credits) discards the window with no event and no start, but still
// requests the ball's owed Mouth eject (`stepModeSelect`'s phase-change
// branch). The headless row in `test/rules-campaign.test.ts` pins the
// request; nothing pinned what physics does with it, nor how the ejected
// ball meets the NEXT game's Start-time stray clear (AD-6, DW-244).
//
// Every run composes a real `createMachine()` and a real `createRules()` in
// `sim/loop`'s own step order (the `test/lock-arbiter-physics.test.ts` spit
// run's convention, `createLoop()` cannot seed two lit Modes and two
// credits): each tick's `InputFrame` drives the machine (so the Slam is a
// GENUINE ten-edge nudge burst through the cabinet's slam detector, never a
// scripted `s_slam_tilt`), `buttonSwitchEdges()` turns the frame's Start
// into the loop's own `s_start` edges ahead of physics' edges, and each
// tick's rules coil and recover commands reach physics on the next tick
// (AD-4).
//
// 1. The Slam, then the spat ball drains in Attract, then Start: the Lock is
//    empty in both views, the stray clear finds nothing, one ball is served.
// 2. The Slam, then Start while the spat ball is still loose: the stray clear
//    recovers it, and the new game still has exactly one ball.
// 3. A windowed LOCK on the real input path: a flipper frame moves, a Start
//    frame confirms, and only then does the serve run.
//
// 4. Code review (DW-296): a Start pressed INSIDE the Mouth's lead after the
//    Slam used to start the new game with the eject still owed -- the pulse
//    then fired into it, and the Slam-era ball's drain ended the new ball 1.
//    No new game starts while a Mouth eject is pending (`handleStartButton`);
//    the Start on the tick after the pulse is honoured, and its stray clear
//    recovers the just-spat ball. Story 3.2's spit shares the root cause
//    (pinned headless in `test/rules-campaign.test.ts`).
//
// A `*-physics.test.ts` file: it drives real physics on purpose, so it is
// not a `rules-*` headless test and is not listed in
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buttonSwitchEdges, NO_FRAME } from '../src/sim/loop';
import { createMachine } from '../src/sim/physics/machine';
import { bootDeviceSlots, createRules } from '../src/sim/rules';
import { TABLE } from '../src/sim/table/dragonwar';
import { MM_PER_VU, toPhysics } from '../src/sim/table/frames';
import { resolveTuning, shotWindowTicks, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import type { GameAdjustments } from '../src/sim/contracts/replay';
import type { InputFrame } from '../src/sim/contracts/input';
import type { GameState, MachineCommand, SemanticEvent, SwitchEvent } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

/** No ball save: the ejected ball's drain in Attract, and the new game's own ball, are never intercepted as a save. */
const TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});
const LEAD = shotWindowTicks('mouthOpenLeadMs', TUNING);
const W = shotWindowTicks('modeSelectMs', TUNING);
const ADJUSTMENTS: GameAdjustments = { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 };

const MOUTH_OPEN_SHOW = TABLE.lockLaneWiring.mouthOpenShow;
const MODE_START_SHOW = TABLE.modeWiring.startShow;

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** A game with nothing in play yet: player 0 holds two credits and has Hurry-up and Quick multiball lit, so a capture opens a 'mouth' window. */
function windowedGameState(): GameState {
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
				modesLit: ['hurryup', 'quickmb'],
				ballNumber: 1,
			},
		],
		currentPlayer: 0,
		modes: [],
		rng: 0,
	};
}

interface TickRecord {
	readonly tick: number;
	readonly state: GameState;
	readonly events: readonly SemanticEvent[];
	readonly shows: readonly string[];
	readonly pulses: readonly string[];
	readonly recover: boolean;
	readonly recovered: number | null;
	readonly lockEdges: readonly SwitchEvent[];
	/** Live balls physics is simulating (parked balls are not simulated). */
	readonly balls: number;
	/** Physics' own view of each device's slots, after this step. */
	readonly physicsLock: readonly boolean[];
	readonly physicsTrough: readonly boolean[];
	readonly physicsShooter: readonly boolean[];
}

/** `sim/loop`'s step order, by hand: frame -> button edges, machine.step, rules.step with physics' report; commands land next tick (AD-4). */
function createHarness(initialState: GameState) {
	const machine = createMachine(loadDoc(), TUNING);
	const rules = createRules(TUNING, ADJUSTMENTS);
	let state = initialState;
	let pending: MachineCommand[] = [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick: 1 }];
	let previousFrame: InputFrame = NO_FRAME;
	let tick = 0;
	const records: TickRecord[] = [];

	function stepOnce(frame: InputFrame = NO_FRAME): TickRecord {
		tick += 1;
		const edges = buttonSwitchEdges(previousFrame, frame, tick);
		previousFrame = frame;
		const result = machine.step(tick, frame, pending.map((command) => ({ ...command, tick })));
		const switchEvents: SwitchEvent[] = [...edges, ...(result.switchEvents as readonly SwitchEvent[])];
		const rulesResult = rules.step(state, switchEvents, tick, { recovered: result.recovered, failures: result.semanticEvents });
		state = rulesResult.state;
		pending = [
			...rulesResult.coilCommands.map((command): MachineCommand => ({ type: 'coil', coil: command.coil, action: command.action, tick })),
			...rulesResult.recoverCommands.map((): MachineCommand => ({ type: 'recover', tick })),
		];
		const record: TickRecord = {
			tick,
			state,
			events: rulesResult.events,
			shows: rulesResult.commands.map((command) => command.show),
			pulses: rulesResult.coilCommands.filter((command) => command.action === 'pulse').map((command) => command.coil),
			recover: rulesResult.recoverCommands.length > 0,
			recovered: result.recovered,
			lockEdges: switchEvents.filter((edge) => (TABLE.ballDevices.bd_lock.slots as readonly string[]).includes(edge.switch)),
			balls: machine.balls.length,
			physicsLock: [...machine.deviceSlots.bd_lock],
			physicsTrough: [...machine.deviceSlots.bd_trough],
			physicsShooter: [...machine.deviceSlots.bd_shooter],
		};
		records.push(record);
		return record;
	}

	// Serve a ball and let it settle on the plunger tip (the driveLockLane() convention).
	for (let i = 0; i < 320; i++) {
		stepOnce();
	}

	return {
		machine,
		records,
		stepOnce,
		get tick(): number {
			return tick;
		},
		/** Between two steps: the AC 12 spit run's measured capturing shot -- the Lock lane's centreline, straight up at 800 mm/s. */
		shootTheLock(): void {
			expect(machine.balls, 'shootTheLock(): exactly one ball on the table').toHaveLength(1);
			const ball = machine.balls[0]!;
			const p = toPhysics({ x: 170, y: 440, z: 13.5 });
			ball.state.pos.set(p.x, p.y, p.z);
			ball.hit.vel.set(0, -(800 / (MM_PER_VU * 100)), 0);
			ball.hit.angularVelocity.set(0, 0, 0);
			ball.hit.angularMomentum.set(0, 0, 0);
		},
	};
}

type Harness = ReturnType<typeof createHarness>;

function eventsOf(records: readonly TickRecord[], type: SemanticEvent['type']): SemanticEvent[] {
	return records.flatMap((record) => record.events.filter((event) => event.type === type));
}

function pulseTicksOf(records: readonly TickRecord[], coil: string): number[] {
	return records.filter((record) => record.pulses.includes(coil)).map((record) => record.tick);
}

function showTicksOf(records: readonly TickRecord[], show: string): number[] {
	return records.filter((record) => record.shows.includes(show)).map((record) => record.tick);
}

/** Shoots the Lock and steps until the capture opens the window; returns the capture tick. */
function openWindow(harness: Harness): number {
	harness.shootTheLock();
	for (let i = 0; i < 3000; i++) {
		const record = harness.stepOnce();
		if (record.events.some((event) => event.type === 'lock_lane_mode_start')) {
			return record.tick;
		}
	}
	throw new Error('openWindow(): the Lock shot never opened a mode-select window');
}

/** A genuine Slam: ten `nudge_up` rising edges, one every two ticks, through the machine's cabinet. Returns the slam_tilt tick. */
function slam(harness: Harness): number {
	for (let i = 0; i < 400; i++) {
		const frame: InputFrame = i < 20 && i % 2 === 0 ? { ...NO_FRAME, nudge_up: true } : NO_FRAME;
		const record = harness.stepOnce(frame);
		if (record.events.some((event) => event.type === 'slam_tilt')) {
			return record.tick;
		}
	}
	throw new Error('slam(): the ten-edge burst never slam-tilted the machine');
}

/** Presses Start for 5 ticks (the loop's own s_start edges); returns the tick of the press. */
function pressStart(harness: Harness): number {
	const pressedAt = harness.tick + 1;
	for (let i = 0; i < 5; i++) {
		harness.stepOnce({ ...NO_FRAME, start: true });
	}
	harness.stepOnce();
	return pressedAt;
}

describe('Story 3.4 QA -- on real physics: a Slam in an unlocked capture\'s mode-select window empties the Lock through the Mouth, and the next game starts with one ball', () => {
	it('the window opens on a real capture, a real nudge burst Slams, the owed Mouth eject really releases the parked ball, it drains in Attract; then Start: the Lock is empty, the stray clear finds nothing, exactly one ball on the table', () => {
		const harness = createHarness(windowedGameState());
		expect(harness.machine.deviceSlots.bd_shooter, 'the premise: the served ball rests on the plunger tip').toEqual([true]);
		const capture = openWindow(harness);
		const at = (tick: number): TickRecord => harness.records[tick - 1]!;

		expect(at(capture).events.filter((event) => event.type.startsWith('lock_lane_')), 'the premise: two credits and two lit Modes -- the window opens, no spit').toEqual([
			{ type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'hurryup', tick: capture },
		]);
		expect(at(capture).physicsLock, 'the premise: physics parked the captured ball in the Lock').toEqual([true, false, false]);
		expect(at(capture).balls, 'and nothing else is on the table').toBe(0);

		// Hold the window a while (well inside W), then Slam.
		while (harness.tick < capture + 100) {
			harness.stepOnce();
		}
		expect(harness.tick + 400, 'the premise: the Slam lands inside the window').toBeLessThan(capture + W);
		const slamTick = slam(harness);
		expect(at(slamTick).state.phase, 'the Slam voids the game').toBe('attract');

		// Let the spat ball drain into the trough.
		let drained = -1;
		for (let i = 0; i < 20_000 && drained === -1; i++) {
			const record = harness.stepOnce();
			if (record.balls === 0 && record.physicsTrough.every(Boolean)) {
				drained = record.tick;
			}
		}
		const windowRecords = harness.records.filter((record) => record.tick > capture);
		expect(eventsOf(windowRecords, 'mode_select_ended'), 'the Slam discards the window with no event').toEqual([]);
		expect(windowRecords.flatMap((record) => record.state.modes).filter((entry) => entry.mode !== 'base'), 'no campaign Mode ever became active').toEqual([]);
		expect(showTicksOf(harness.records, MODE_START_SHOW), 'no show_mode_start').toEqual([]);
		expect(showTicksOf(harness.records, MOUTH_OPEN_SHOW), 'the owed eject opens the Mouth on the Slam tick').toEqual([slamTick]);
		expect(pulseTicksOf(harness.records, 'c_mouth'), 'and pulses it LEAD later, in Attract').toEqual([slamTick + LEAD]);
		expect(at(slamTick + LEAD + 1).lockEdges, 'physics really opens s_lock_1 on the tick it consumes the pulse').toEqual([
			{ type: 'switch', switch: 's_lock_1', closed: false, tick: slamTick + LEAD + 1 },
		]);
		expect(at(slamTick + LEAD + 1).physicsLock, 'the Lock is empty').toEqual([false, false, false]);
		expect(drained, 'the spat ball genuinely drains into the trough, in Attract').toBeGreaterThan(slamTick + LEAD + 1);
		expect(at(drained).state.phase).toBe('attract');
		expect(at(drained).state.machine.deviceSlots.bd_lock, 'rules agree: the Lock is empty').toEqual([false, false, false]);
		expect(at(drained).state.machine.deviceSlots.bd_trough, 'and all four balls are in the trough').toEqual([true, true, true, true]);

		// The next game.
		while (harness.tick < drained + 50) {
			harness.stepOnce();
		}
		const startTick = pressStart(harness);
		while (harness.tick < startTick + 600) {
			harness.stepOnce();
		}
		const game = harness.records.filter((record) => record.tick >= startTick);
		expect(at(startTick).state.phase, 'Start begins a new game').toBe('game');
		expect(at(startTick).state.players, 'one fresh player: no credits, nothing lit').toMatchObject([{ lockCredits: 0, modesLit: [], modesPlayed: [], ballNumber: 1 }]);
		expect(at(startTick).recover, 'the Start-time stray clear is issued').toBe(true);
		expect(at(startTick + 1).recovered, 'and physics finds no stray ball to recover').toBe(0);
		expect(eventsOf(game, 'ball_missing'), 'nothing is missing').toEqual([]);
		expect(pulseTicksOf(game, 'c_trough_eject'), 'the new game serves exactly once').toEqual([startTick]);
		expect(pulseTicksOf(game, 'c_mouth'), 'the Mouth never fires into the new game').toEqual([]);
		expect(Math.max(...game.map((record) => record.balls)), 'never more than one ball on the table').toBe(1);
		const last = game[game.length - 1]!;
		expect(last.physicsShooter, 'the served ball rests in the shooter lane').toEqual([true]);
		expect(last.physicsTrough.filter(Boolean), 'three balls in the trough').toHaveLength(3);
		expect(last.physicsLock, 'the Lock stays empty (physics)').toEqual([false, false, false]);
		expect(last.state.machine.deviceSlots.bd_lock, 'the Lock stays empty (rules)').toEqual([false, false, false]);
	}, 240_000);

	it('Start while the spat ball is still loose on the playfield (after the Mouth pulse, before its drain): the stray clear recovers it into the trough, the Lock is empty, and the new game has exactly one ball', () => {
		const harness = createHarness(windowedGameState());
		const capture = openWindow(harness);
		const at = (tick: number): TickRecord => harness.records[tick - 1]!;
		while (harness.tick < capture + 100) {
			harness.stepOnce();
		}
		const slamTick = slam(harness);
		// The Mouth pulses at slamTick + LEAD; the spat ball needs well over 200
		// ticks to reach the drain (Story 3.3's measurement: about 60 mm from
		// the Mouth pose 200 ticks after the pulse).
		while (harness.tick < slamTick + LEAD + 200) {
			harness.stepOnce();
		}
		expect(pulseTicksOf(harness.records, 'c_mouth'), 'the premise: the owed eject pulsed in Attract').toEqual([slamTick + LEAD]);
		expect(at(harness.tick).balls, 'the premise: the spat ball is loose on the playfield').toBe(1);
		expect(at(harness.tick).physicsLock, 'the premise: the Lock is already empty').toEqual([false, false, false]);
		expect(at(harness.tick).physicsTrough.filter(Boolean), 'the premise: three balls in the trough').toHaveLength(3);

		const startTick = pressStart(harness);
		while (harness.tick < startTick + 600) {
			harness.stepOnce();
		}
		const game = harness.records.filter((record) => record.tick >= startTick);
		expect(at(startTick).state.phase, 'Start begins a new game').toBe('game');
		expect(at(startTick).recover, 'the Start-time stray clear is issued').toBe(true);
		expect(at(startTick + 1).recovered, 'and physics recovers the loose spat ball').toBe(1);
		expect(pulseTicksOf(game, 'c_trough_eject'), 'the new game serves exactly once').toEqual([startTick]);
		expect(pulseTicksOf(game, 'c_mouth'), 'the Mouth never fires into the new game').toEqual([]);
		expect(Math.max(...game.filter((record) => record.tick > startTick).map((record) => record.balls)), 'from the recover on, never more than one ball on the table').toBe(1);
		expect(eventsOf(game, 'ball_ended'), 'the recovered ball ends no ball of the new game').toEqual([]);
		const last = game[game.length - 1]!;
		expect(last.state.players[0]!.ballNumber, 'still ball 1').toBe(1);
		expect(last.physicsShooter, 'the served ball rests in the shooter lane').toEqual([true]);
		expect(last.physicsLock, 'the Lock stays empty (physics)').toEqual([false, false, false]);
		expect(last.state.machine.deviceSlots.bd_lock, 'the Lock stays empty (rules)').toEqual([false, false, false]);
	}, 240_000);

	it('DW-296: a Start INSIDE the Mouth\'s lead after the Slam starts no game; the Start on the tick after the pulse starts one, its stray clear recovers the just-spat ball, and the Slam-era ball never ends the new ball 1', () => {
		const harness = createHarness(windowedGameState());
		const capture = openWindow(harness);
		const at = (tick: number): TickRecord => harness.records[tick - 1]!;
		while (harness.tick < capture + 100) {
			harness.stepOnce();
		}
		const slamTick = slam(harness);
		const pulseTick = slamTick + LEAD;

		// QA's measured timing: Start one tick after the Slam, deep inside the lead.
		const refusedStart = pressStart(harness);
		expect(refusedStart, 'the premise: the Start lands inside the lead').toBeLessThan(pulseTick);
		while (harness.tick < pulseTick) {
			harness.stepOnce();
		}
		const beforePulse = harness.records.filter((record) => record.tick >= refusedStart && record.tick <= pulseTick);
		expect(beforePulse.every((record) => record.state.phase === 'attract'), 'the Start inside the lead is ignored: still Attract up to the pulse').toBe(true);
		expect(eventsOf(beforePulse, 'ball_will_start'), 'no ball starts').toEqual([]);
		expect(pulseTicksOf(beforePulse, 'c_trough_eject'), 'nothing is served').toEqual([]);
		expect(pulseTicksOf(beforePulse, 'c_mouth'), 'the owed eject pulses on time, in Attract').toEqual([pulseTick]);

		// The earliest Start that is honoured: the tick after the pulse.
		const startTick = pressStart(harness);
		expect(startTick).toBe(pulseTick + 1);
		while (harness.tick < startTick + 4000) {
			harness.stepOnce();
		}
		const game = harness.records.filter((record) => record.tick >= startTick);
		expect(at(startTick).state.phase, 'Start begins a new game').toBe('game');
		expect(at(startTick).recover, 'the Start-time stray clear is issued').toBe(true);
		expect(at(startTick + 1).recovered, 'and physics recovers the just-spat ball').toBe(1);
		expect(pulseTicksOf(game, 'c_trough_eject'), 'the new game serves exactly once').toEqual([startTick]);
		expect(pulseTicksOf(game, 'c_mouth'), 'the Mouth never fires into the new game').toEqual([]);
		expect(Math.max(...game.filter((record) => record.tick > startTick).map((record) => record.balls)), 'from the recover on, never more than one ball on the table').toBe(1);
		expect(eventsOf(game, 'ball_ended'), 'no Slam-era ball ends the new game\'s ball 1').toEqual([]);
		const last = game[game.length - 1]!;
		expect(last.state.players[0]!.ballNumber, 'still ball 1').toBe(1);
		expect(last.physicsShooter, 'the served ball rests unplunged in the shooter lane').toEqual([true]);
		expect(last.physicsLock, 'the Lock is empty (physics)').toEqual([false, false, false]);
		expect(last.state.machine.deviceSlots.bd_lock, 'the Lock is empty (rules)').toEqual([false, false, false]);
	}, 240_000);
});

/** The same, but with no credits yet: the capture LOCKS, and the window's release is the trough serve. */
function windowedLockState(): GameState {
	const base = windowedGameState();
	return { ...base, players: [{ ...base.players[0]!, lockCredits: 0 }] };
}

describe('Story 3.4 QA -- on real physics: a windowed LOCK, driven by the real input frames -- the flipper moves, Start confirms, and only then is the next ball served', () => {
	it('the capture locks and opens the window with the ball held; a right-flipper frame moves to quickmb; a Start frame confirms it (no Hot-seat player); the serve then autolaunches a new ball while the locked ball stays locked', () => {
		const harness = createHarness(windowedLockState());
		const capture = openWindow(harness);
		const at = (tick: number): TickRecord => harness.records[tick - 1]!;
		expect(at(capture).events.filter((event) => event.type.startsWith('lock_lane_')).map((event) => event.type), 'the premise: the lock applies, then the window opens').toEqual([
			'lock_lane_locked',
			'lock_lane_mode_start',
		]);

		while (harness.tick < capture + 49) {
			harness.stepOnce();
		}
		const moveTick = harness.tick + 1;
		for (let i = 0; i < 5; i++) {
			harness.stepOnce({ ...NO_FRAME, flipper_r: true });
		}
		while (harness.tick < capture + 199) {
			harness.stepOnce();
		}
		const startTick = pressStart(harness);
		let relaunch = -1;
		for (let i = 0; i < 3000 && relaunch === -1; i++) {
			const record = harness.stepOnce();
			if (record.events.some((event) => event.type === 'ball_launched')) {
				relaunch = record.tick;
			}
		}
		const records = harness.records.filter((record) => record.tick >= capture);

		expect(records.flatMap((record) => record.events).filter((event) => event.type === 'mode_select_moved' || event.type === 'mode_select_ended')).toEqual([
			{ type: 'mode_select_moved', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'quickmb', tick: moveTick },
			{ type: 'mode_select_ended', player: 0, mode: 'quickmb', reason: 'start', tick: startTick },
		]);
		expect(pulseTicksOf(records, 'c_trough_eject'), 'no serve while the window is open; the serve at the confirm').toEqual([startTick]);
		expect(Math.max(...records.filter((record) => record.tick < startTick).map((record) => record.balls)), 'nothing on the table while the window holds the ball').toBe(0);
		expect(showTicksOf(records, MODE_START_SHOW)).toEqual([startTick]);
		expect(at(startTick).state.modes.map((entry) => entry.mode), 'Quick multiball is active from the confirm').toContain('quickmb');
		expect(at(startTick).state.players, 'the window\'s Start never added a Hot-seat player').toHaveLength(1);
		expect(at(startTick).state.players[0]).toMatchObject({ lockCredits: 1, modesPlayed: ['quickmb'], modesLit: ['hurryup'] });
		expect(pulseTicksOf(records, 'c_mouth'), 'a locked ball opens no Mouth').toEqual([]);
		expect(relaunch, 'the served ball is autolaunched').toBeGreaterThan(startTick);
		expect(at(relaunch).state.machine.ballsInPlay).toBe(1);
		expect(at(relaunch).physicsLock, 'physics still holds the locked ball').toEqual([true, false, false]);
		expect(at(relaunch).state.machine.deviceSlots.bd_lock, 'and rules agree').toEqual([true, false, false]);
	}, 240_000);
});
