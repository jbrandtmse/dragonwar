// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.2 QA: real-physics coverage beside `test/lock-arbiter-physics.test.ts`
// (AC 12). Every run composes a real `createMachine()` and a real
// `createRules()` by hand -- the `driveLockLane()` convention of
// `test/rules-devices-integration.test.ts`, which the AC 12 spit run also
// follows: each tick's rules `coilCommands` and `recoverCommands` are fed to
// physics on the next tick (AD-4), and physics' own `recovered` count and
// device failures reach rules as the `MachineReport`. The hand composition
// is used, rather than `createLoop()`, because each run needs a rules
// precondition `gameStart` cannot express (a live save with no Start serve,
// a tilted ball) and must read the rules' own command stream.
//
// 1. DW-221 with a LIVE save: an 800 mm/s Lock shot inside the player's own
//    ball-save window is locked, never saved or ended, and the served ball
//    is autolaunched without re-arming the save.
// 2. DW-281 on a real ball-search run: a genuinely stuck ball (Story 2.12's
//    test-only V-cup, appended to an in-memory copy of the committed
//    collision document) under Tilt -- no trough serve from the pass, and
//    the recover's answer (physics' real `recovered` count) ends the ball
//    with `ball_ended { tilted: true }` and rotates to the next ball.
// 3. DW-282 on a real ball-search run: the same stuck ball, untilted, freed
//    onto a playfield rollover after both trough slots and before the
//    recover -- the search never served, so there is never a second ball on
//    the table.
//
// A `*-physics.test.ts` file: it drives real physics on purpose, so it is not
// a `rules-*` headless test and is not listed in
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NO_FRAME } from '../src/sim/loop';
import { createMachine } from '../src/sim/physics/machine';
import { BALL_SAVE_SOURCE } from '../src/sim/rules/ball-controller';
import { bootDeviceSlots, createRules } from '../src/sim/rules';
import { PLAYFIELD_SWITCHES } from '../src/sim/rules/devices';
import { TABLE } from '../src/sim/table/dragonwar';
import { MM_PER_VU, toPhysics } from '../src/sim/table/frames';
import { resolveTuning, shotWindowTicks } from '../src/sim/table/tuning';
import type { GameAdjustments } from '../src/sim/contracts/replay';
import type { GameState, MachineCommand, SemanticEvent, SwitchEvent, SwitchName } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

const TUNING = resolveTuning();
const SEARCH = shotWindowTicks('ballSearchMs', TUNING);
const STEP = shotWindowTicks('ballSearchStepMs', TUNING);
const ADJUSTMENTS: GameAdjustments = { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 };
const BALL_REST_Z_MM = 13.5;

interface RawCollisionDoc {
	readonly [key: string]: unknown;
	readonly nodes: readonly unknown[];
}

function loadDoc(): RawCollisionDoc {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8')) as RawCollisionDoc;
}

// Story 2.12's test-only V-cup (`test/ball-search-integration.test.ts`,
// Design Notes "AC 2's instrument: the test-only stuck ball"), copied
// verbatim: apex (165, 240), two convex 45-degree walls, appended to an
// in-memory copy of the committed document -- never written to
// `public/assets/`, and no `col_test_cup` name ever reaches `src/`.
const CUP_WALL_L = {
	name: 'col_test_cup_l',
	shape: 'wall',
	physMaterial: 'default',
	zLowMm: 0,
	zHighMm: 50,
	bboxMm: { min: { x: 139.544156, y: 235.757359, z: 0 }, max: { x: 165, y: 261.213203, z: 50 } },
	footprintMm: [
		{ x: 165, y: 240 },
		{ x: 143.786797, y: 261.213203 },
		{ x: 139.544156, y: 256.970563 },
		{ x: 160.757359, y: 235.757359 },
	],
} as const;

const CUP_WALL_R = {
	name: 'col_test_cup_r',
	shape: 'wall',
	physMaterial: 'default',
	zLowMm: 0,
	zHighMm: 50,
	bboxMm: { min: { x: 165, y: 235.757359, z: 0 }, max: { x: 190.455844, y: 261.213203, z: 50 } },
	footprintMm: [
		{ x: 169.242641, y: 235.757359 },
		{ x: 190.455844, y: 256.970563 },
		{ x: 186.213203, y: 261.213203 },
		{ x: 165, y: 240 },
	],
} as const;

const CUP_PLACEMENT_MM = { x: 165, y: 262, z: BALL_REST_Z_MM };

function cupDoc(): unknown {
	const doc = loadDoc();
	return { ...doc, nodes: [...doc.nodes, CUP_WALL_L, CUP_WALL_R] };
}

/** A mid-game rules state with nothing in play yet: one player, the boot device slots. */
function gameState(machine: Partial<GameState['machine']> = {}, lockCredits = 0): GameState {
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
			...machine,
		},
		players: [
			{
				score: 0,
				letters: '',
				lockCredits,
				tiltWarnings: 0,
				bonus: { byCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1 },
				lanes: { lit: {}, completedSets: [] },
				extraBalls: 0,
				jackpotSeed: 0,
				warsStarted: 0,
				modesPlayed: [],
				modesLit: [],
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
	readonly pulses: readonly string[];
	readonly recover: boolean;
	readonly switchEdges: readonly SwitchEvent[];
	readonly balls: number;
	readonly troughClosed: number;
	/** Physics' own device failures this tick (`eject_failed` / `device_overflow`), as rules received them. */
	readonly failures: readonly { readonly type: string; readonly device?: string }[];
}

/**
 * A hand-composed `createMachine()` + `createRules()` (AD-4: this tick's
 * rules commands reach physics on the next tick). The first ball is served
 * by a real trough eject on tick 1 and left 320 ticks to settle on the
 * plunger tip (the `driveLockLane()` convention).
 */
function createHarness(doc: unknown, initialState: GameState) {
	const machine = createMachine(doc, TUNING);
	const rules = createRules(TUNING, ADJUSTMENTS);
	let state = initialState;
	let pending: MachineCommand[] = [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick: 1 }];
	let tick = 0;
	const records: TickRecord[] = [];

	function stepOnce(): TickRecord {
		tick += 1;
		const result = machine.step(tick, NO_FRAME, pending.map((command) => ({ ...command, tick })));
		const switchEdges = result.switchEvents as readonly SwitchEvent[];
		const rulesResult = rules.step(state, switchEdges, tick, { recovered: result.recovered, failures: result.semanticEvents });
		state = rulesResult.state;
		pending = [
			...rulesResult.coilCommands.map((command): MachineCommand => ({ type: 'coil', coil: command.coil, action: command.action, tick })),
			...rulesResult.recoverCommands.map((): MachineCommand => ({ type: 'recover', tick })),
		];
		const record: TickRecord = {
			tick,
			state,
			events: rulesResult.events,
			pulses: rulesResult.coilCommands.filter((command) => command.action === 'pulse').map((command) => command.coil),
			recover: rulesResult.recoverCommands.length > 0,
			switchEdges,
			balls: machine.balls.length,
			troughClosed: machine.deviceSlots.bd_trough.filter(Boolean).length,
			failures: result.semanticEvents,
		};
		records.push(record);
		return record;
	}

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
		/** Between two steps: a machine command physics consumes on the next step, which rules never issued (a test-only second serve). */
		inject(command: MachineCommand): void {
			pending = [...pending, command];
		},
		/** Between two steps: move one live ball, by id, and zero its motion. */
		placeBall(ballId: number, pointMm: { readonly x: number; readonly y: number; readonly z: number }): void {
			const ball = machine.balls.find((candidate) => candidate.id === ballId);
			expect(ball, `placeBall(): no live ball with id ${ballId}`).toBeDefined();
			const p = toPhysics(pointMm);
			ball!.state.pos.set(p.x, p.y, p.z);
			ball!.hit.vel.set(0, 0, 0);
			ball!.hit.angularVelocity.set(0, 0, 0);
			ball!.hit.angularMomentum.set(0, 0, 0);
		},
		/** Between two steps: move the one live ball and zero its motion (the `place()` seam of `test/ball-search-integration.test.ts`). */
		place(pointMm: { readonly x: number; readonly y: number; readonly z: number }, velocityMmPerS: { readonly x: number; readonly y: number } = { x: 0, y: 0 }): void {
			expect(machine.balls, 'place(): exactly one ball on the table').toHaveLength(1);
			const ball = machine.balls[0]!;
			const p = toPhysics(pointMm);
			ball.state.pos.set(p.x, p.y, p.z);
			// The AC 12 spit run's own conversion: table mm/s -> physics units
			// per step, with the table's y axis pointing the other way.
			ball.hit.vel.set(velocityMmPerS.x / (MM_PER_VU * 100), -(velocityMmPerS.y / (MM_PER_VU * 100)), 0);
			ball.hit.angularVelocity.set(0, 0, 0);
			ball.hit.angularMomentum.set(0, 0, 0);
		},
	};
}

function eventsOf(records: readonly TickRecord[], type: SemanticEvent['type']): SemanticEvent[] {
	return records.flatMap((record) => record.events.filter((event) => event.type === type));
}

function pulseTicksOf(records: readonly TickRecord[], coil: string): number[] {
	return records.filter((record) => record.pulses.includes(coil)).map((record) => record.tick);
}

// ---------------------------------------------------------------------------
// 1. DW-221: a Lock capture inside a LIVE ball save is not a drain.
// ---------------------------------------------------------------------------

describe('Story 3.2 QA -- DW-221 on real physics: a Lock capture inside a live ball save is locked, never saved', () => {
	it('an 800 mm/s Lock shot while the player\'s own save is live: lock_lane_locked { 0, 1 }, no ball_saved and no ball_ended; the serve is autolaunched, ballsInPlay is back to 1, and the save is never re-armed', () => {
		// The launch itself arms the save: BALL_SAVE_SOURCE enabled, as a ball
		// start leaves it.
		const harness = createHarness(loadDoc(), gameState({ ballSave: { untilTick: null, sources: [BALL_SAVE_SOURCE] } }));
		expect(harness.machine.deviceSlots.bd_shooter, 'the premise: the served ball rests on the plunger tip').toEqual([true]);

		// The AC 12 spit run's measured capturing shot: the Lock lane's own
		// centreline, straight up the lane at 800 mm/s.
		harness.place({ x: 170, y: 440, z: BALL_REST_Z_MM }, { x: 0, y: 800 });
		let lockedTick = -1;
		let relaunchTick = -1;
		for (let i = 0; i < 3000 && relaunchTick === -1; i++) {
			const record = harness.stepOnce();
			if (lockedTick === -1 && record.events.some((event) => event.type === 'lock_lane_locked')) {
				lockedTick = record.tick;
			}
			if (lockedTick !== -1 && record.tick > lockedTick && record.events.some((event) => event.type === 'ball_launched')) {
				relaunchTick = record.tick;
			}
		}
		const records = harness.records;
		const at = (tick: number): TickRecord => records[tick - 1]!;

		const armed = eventsOf(records, 'ball_save_timer_started');
		expect(armed, 'the premise: the launch armed the save exactly once').toHaveLength(1);
		expect(lockedTick, 'the shot is captured and locked').toBeGreaterThan(armed[0]!.tick);
		const saveUntil = at(lockedTick - 1).state.machine.ballSave.untilTick;
		expect(saveUntil, 'the premise: the save is LIVE at the capture').not.toBeNull();
		expect(saveUntil!).toBeGreaterThan(lockedTick);

		expect(records.flatMap((record) => record.events.filter((event) => event.type === 'lock_lane_locked' || event.type === 'lock_lane_spit'))).toEqual([
			{ type: 'lock_lane_locked', player: 0, credits: 1, tick: lockedTick },
		]);
		expect(eventsOf(records, 'ball_saved'), 'a Lock capture inside a live save is never a saved drain (DW-221)').toEqual([]);
		expect(eventsOf(records, 'ball_ended'), 'nor a drain').toEqual([]);
		expect(at(lockedTick).state.machine.ballsInPlay, 'the capture takes the ball out of play').toBe(0);
		expect(pulseTicksOf(records, 'c_trough_eject'), 'the lock serves exactly once, on the capture tick').toEqual([lockedTick]);
		const autolaunch = pulseTicksOf(records, 'c_autolaunch');
		expect(autolaunch, 'the served ball is autolaunched once, on its real arrival').toHaveLength(1);
		expect(relaunchTick, 'and its launch reaches rules').toBeGreaterThan(autolaunch[0]!);
		expect(at(relaunchTick).state.machine.ballsInPlay, 'the new ball\'s ball_launched restores ballsInPlay').toBe(1);
		expect(at(relaunchTick).state.machine.ballSave.untilTick, 'the relaunch never re-arms the save').toBe(saveUntil);
		expect(eventsOf(records, 'ball_save_timer_started'), 'still armed exactly once').toHaveLength(1);
		expect(harness.machine.deviceSlots.bd_lock, 'physics holds the locked ball').toEqual([true, false, false]);
	}, 120_000);
});

// ---------------------------------------------------------------------------
// 2 and 3. DW-281 and DW-282 on a real ball-search run.
// ---------------------------------------------------------------------------

/** Serve, settle, then move the served ball into the V-cup: the lane break is the real `ball_launched` (the search's origin). */
function stuckBallHarness(initialState: GameState) {
	const harness = createHarness(cupDoc(), initialState);
	expect(harness.machine.deviceSlots.bd_shooter, 'the premise: the served ball rests on the plunger tip').toEqual([true]);
	harness.place(CUP_PLACEMENT_MM);
	const launch = harness.stepOnce();
	expect(launch.events.some((event) => event.type === 'ball_launched'), 'the premise: the move out of the lane is a real ball_launched').toBe(true);
	expect(launch.state.machine.ballsInPlay).toBe(1);
	return { harness, origin: launch.tick };
}

describe('Story 3.2 QA -- DW-281 on real physics: under Tilt the recover\'s answer ends the ball instead of serving', () => {
	it('a genuinely stuck, tilted ball: the pass serves nothing; the recover really sweeps the stuck ball; its report gives ball_missing { 1 }, then ball_ended { tilted: true }, then the rotation\'s one serve -- one ball on the table, resting in the shooter lane, the new ball untilted', () => {
		const { harness, origin } = stuckBallHarness(gameState({ tilt: { tilted: true, slamTilted: false }, hardwareEnabled: false }));
		const recover = origin + SEARCH + 11 * STEP;
		while (harness.tick < recover + 600) {
			harness.stepOnce();
		}
		const records = harness.records.filter((record) => record.tick >= origin);
		const at = (tick: number): TickRecord => harness.records[tick - 1]!;

		expect(eventsOf(records, 'ball_search_started').map((event) => event.tick), 'the premise: one uninterrupted pass').toEqual([origin + SEARCH]);
		expect(records.filter((record) => record.recover).map((record) => record.tick), 'the pass\'s recover, then the rotation\'s stray clear on the report tick').toEqual([recover, recover + 1]);
		expect(at(recover + 1).state.machine.ballsInPlay, 'physics really recovered the stuck ball').toBe(0);
		expect(eventsOf(records, 'ball_missing'), 'physics\' own recovered count reaches rules').toEqual([{ type: 'ball_missing', count: 1, tick: recover + 1 }]);

		const atReport = at(recover + 1).events.map((event) => event.type);
		expect(atReport.slice(0, 3), 'ball_missing, then ball_ended, then the rotation').toEqual(['ball_missing', 'ball_ended', 'ball_will_start']);
		const ended = eventsOf(records, 'ball_ended');
		expect(ended).toHaveLength(1);
		expect(ended[0]).toMatchObject({ player: 0, tilted: true, total: 0, tick: recover + 1 });
		expect(at(recover + 1).state.players[0]!.ballNumber, 'the rotation starts ball 2').toBe(2);
		expect(at(recover + 1).state.machine.tilt.tilted, 'the new ball starts untilted').toBe(false);

		expect(pulseTicksOf(records, 'c_trough_eject'), 'no trough serve from the pass; the rotation\'s own serve is the only one').toEqual([recover + 1]);
		expect(pulseTicksOf(records, 'c_autolaunch'), 'the autolaunch stage is tilt-guarded').toEqual([]);
		expect(pulseTicksOf(records, 'c_mouth'), 'the empty Lock ejects nothing').toEqual([]);
		expect(Math.max(...records.map((record) => record.balls)), 'never more than one ball on the table').toBe(1);
		expect(harness.machine.balls, 'the rotation\'s ball is the only ball').toHaveLength(1);
		expect(harness.machine.deviceSlots.bd_shooter, 'and it rests in the shooter lane, waiting for the plunge -- the game is not stalled').toEqual([true]);
		expect(harness.machine.deviceSlots.bd_trough.filter(Boolean), 'the other three balls are in the trough').toHaveLength(3);
	}, 240_000);
});

describe('Story 3.2 QA -- DW-282 on real physics: a closure after the trough slots leaves no served ball behind', () => {
	it('a genuinely stuck, untilted ball freed onto a top rollover between the second trough slot and the recover: the pass never serves, no recover runs, and there is never a second ball on the table; the freed ball\'s own drain ends the ball and its rotation serves exactly once', () => {
		const { harness, origin } = stuckBallHarness(gameState());
		const troughSlot1 = origin + SEARCH + 9 * STEP;
		const troughSlot2 = origin + SEARCH + 10 * STEP;
		const recoverSlot = origin + SEARCH + 11 * STEP;
		const freeAt = troughSlot2 + STEP / 2;
		while (harness.tick < freeAt) {
			harness.stepOnce();
		}
		// Free the stuck ball: move it onto a top rollover's own zone, so the
		// very next step closes a playfield switch (the pass's reset).
		const rollover: SwitchName = 's_top_2';
		harness.place({ x: 245, y: 977, z: BALL_REST_Z_MM });
		let endedTick = -1;
		for (let i = 0; i < 20_000 && endedTick === -1; i++) {
			const record = harness.stepOnce();
			if (record.events.some((event) => event.type === 'ball_ended')) {
				endedTick = record.tick;
			}
		}
		const records = harness.records.filter((record) => record.tick >= origin);
		const before = records.filter((record) => record.tick < endedTick);

		expect(eventsOf(records, 'ball_search_started')[0]?.tick, 'the premise: the pass started').toBe(origin + SEARCH);
		expect(PLAYFIELD_SWITCHES.has(rollover), 'the premise: the rollover is a playfield switch').toBe(true);
		const closure = records.find((record) => record.switchEdges.some((edge) => edge.closed && PLAYFIELD_SWITCHES.has(edge.switch)) && record.tick > troughSlot1);
		expect(closure?.tick, 'the premise: the freed ball closes a playfield switch after both trough slots and before the recover').toBe(freeAt + 1);
		expect(closure!.tick).toBeGreaterThan(troughSlot2);
		expect(closure!.tick).toBeLessThan(recoverSlot);
		expect(endedTick, 'the premise: the freed ball genuinely drains').toBeGreaterThan(closure!.tick);

		expect(pulseTicksOf(before, 'c_trough_eject'), 'the pass never serves (DW-282)').toEqual([]);
		expect(before.filter((record) => record.recover), 'the closure reset the pass before its recover').toEqual([]);
		expect(eventsOf(before, 'ball_missing')).toEqual([]);
		expect(Math.max(...before.map((record) => record.balls)), 'never a second ball on the table').toBe(1);
		expect(Math.min(...before.map((record) => record.troughClosed)), 'the trough never dropped a ball').toBe(3);
		expect(pulseTicksOf(records, 'c_trough_eject'), 'the drain\'s rotation is the one serve').toEqual([endedTick]);
	}, 240_000);
});

// ---------------------------------------------------------------------------
// 4. The pulse-tick boundary on real physics: one parked ball, one eject.
// ---------------------------------------------------------------------------

describe('Story 3.2 QA -- the pulse-tick boundary on real physics: a park on a Lock stage\'s due tick gets one Mouth eject, never a surplus pulse physics answers with eject_failed', () => {
	// QA found, and the code review fixed, a surplus eject here (see
	// `test/rules-lock-arbiter-qa.test.ts`'s pending-boundary rows): an
	// uncredited park landing on the very tick the first Lock stage falls due
	// makes that stage fall due after the pending eject's pulse tick, which
	// counts as pending because the rules-side Lock still shows the ball
	// being pulsed until the next tick. Before the fix the stage fell due ON
	// the pulse tick with nothing pending and requested a second eject, which
	// physics answered with eject_failed. CONSTRUCTED, not organic: the park
	// is a test-only move of a
	// second ball straight into s_lock_1's slot zone, bypassing s_lock_lane
	// (a playfield switch -- every organic path to the slot band crosses it
	// and resets the search's quiet count, so an organic park can never land
	// 16,500 quiet ticks into a pass).
	it('a second ball moved into s_lock_1 on the first Lock stage\'s own due tick, with the stuck ball still in play: one c_mouth at park+LEAD, no eject_failed { bd_lock }, ballsInPlay back to 2 and no ball ends', () => {
		const { harness, origin } = stuckBallHarness(gameState());
		const LEAD = shotWindowTicks('mouthOpenLeadMs', TUNING);
		const park = origin + SEARCH + 6 * STEP;
		const stuckBallId = harness.machine.balls[0]!.id;

		// A test-only second serve (rules never issued it), left to settle on
		// the plunger tip; the shooter lane is not a playfield switch, so the
		// pass runs on.
		harness.inject({ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick: harness.tick + 1 });
		while (harness.tick < origin + 1000) {
			harness.stepOnce();
		}
		expect(harness.machine.balls, 'the premise: the stuck ball and the second ball').toHaveLength(2);
		expect(harness.machine.deviceSlots.bd_shooter, 'the premise: the second ball rests on the plunger tip').toEqual([true]);
		const secondBall = harness.machine.balls.find((ball) => ball.id !== stuckBallId)!;

		while (harness.tick < park - 1) {
			harness.stepOnce();
		}
		// s_lock_1's own slot zone centre (x 150-190, y 544-558): past s_lock_lane.
		harness.placeBall(secondBall.id, { x: 170, y: 551, z: BALL_REST_Z_MM });
		while (harness.tick < park + 2 * LEAD + 50) {
			harness.stepOnce();
		}
		const records = harness.records.filter((record) => record.tick >= origin);
		const at = (tick: number): TickRecord => harness.records[tick - 1]!;

		expect(at(park).switchEdges.filter((edge) => edge.switch === 's_lock_1').map((edge) => edge.closed), 'the premise: physics parks the ball on the stage\'s due tick').toEqual([true]);
		expect(at(park).switchEdges.some((edge) => edge.switch === 's_lock_lane'), 'the premise: no lane closure').toBe(false);
		expect(eventsOf(records, 'ball_search_started').map((event) => event.tick), 'the premise: the pass was never reset').toEqual([origin + SEARCH]);
		expect(at(park).state.machine.ballsInPlay, 'the premise: the stuck ball is still in play').toBe(1);
		expect(eventsOf(records, 'lock_lane_locked').concat(eventsOf(records, 'lock_lane_spit')), 'an uncredited park: no outcome').toEqual([]);

		expect(pulseTicksOf(records, 'c_mouth'), 'one parked ball, one eject: no surplus pulse').toEqual([park + LEAD]);
		expect(at(park + LEAD + 1).switchEdges.filter((edge) => edge.switch === 's_lock_1').map((edge) => edge.closed), 'the real eject releases the parked ball').toEqual([false]);
		// Only the Lock's failures: the pass's own autolaunch stage (now due
		// inside this window, the pass no longer held by a surplus eject) pulses
		// c_autolaunch into the lane the test-moved ball left empty, which
		// physics answers with eject_failed { bd_shooter } -- ball search's
		// Story 2.12 behaviour, unrelated to the Mouth.
		expect(records.flatMap((record) => record.failures).filter((failure) => failure.device === 'bd_lock'), 'no Lock failure: physics never answers eject_failed { bd_lock }').toEqual([]);

		expect(at(park + LEAD + 1).state.machine.ballsInPlay, 'the spat ball is back in play').toBe(2);
		expect(at(park + 2 * LEAD + 1).state.machine.ballsInPlay, 'both balls stay in play').toBe(2);
		expect(eventsOf(records, 'ball_ended'), 'no ball ends').toEqual([]);
	}, 240_000);
});
