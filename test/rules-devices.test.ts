// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Review finding 2026-08-28: src/sim/rules/** -- index.ts, devices.ts and
// ball-controller.ts, the whole AD-19 devices layer and the AD-6 ball
// accounting -- had NO dedicated test. Every assertion about it went through
// test/machine-serve-drain.test.ts's integration cases, which only ever drive
// the one balanced sequence (serve -> launch -> drain) real gravity happens
// to produce. The mapping rules themselves (which switch becomes which device
// event, and which switches must produce nothing) and the accounting's
// behaviour on an UNBALANCED sequence were unexercised.
//
// AD-19: "sim/rules/devices/ is the only consumer of SwitchEvent ... and
// emits device events only". AD-6: "the opening of s_shooter_lane is the one
// event that means 'plunged'"; "device counts in GameState are the number of
// closed slot switches and nothing else".

import { describe, expect, it } from 'vitest';
import { processSwitchEvents } from '../src/sim/rules/devices';
import { applyDeviceEvents } from '../src/sim/rules/ball-controller';
import { step as rulesStep } from '../src/sim/rules';
import { TABLE } from '../src/sim/table/dragonwar';
import type { GameState, MachineState, SwitchEvent } from '../src/sim/table/names';

function machine(overrides: Partial<MachineState> = {}): MachineState {
	return {
		ballsInPlay: 0,
		hardwareEnabled: true,
		ballSave: { untilTick: null, sources: [] },
		tilt: { tilted: false, slamTilted: false },
		multiball: null,
		highscores: [],
		deviceSlots: { bd_trough: [true, true, true, true], bd_shooter: [false] },
		...overrides,
	};
}

function state(overrides: Partial<GameState> = {}): GameState {
	return {
		tick: 0,
		phase: 'attract',
		machine: machine(),
		players: [],
		currentPlayer: 0,
		modes: [],
		rng: 0,
		...overrides,
	};
}

const edge = (name: string, closed: boolean, tick = 1): SwitchEvent =>
	({ type: 'switch', switch: name, closed, tick }) as SwitchEvent;

describe('sim/rules/devices.ts -- the AD-19 switch -> device-event mapping', () => {
	it('the OPENING of the non-parking device\'s entry switch is ball_launched; its closing is not', () => {
		const entry = TABLE.ballDevices.bd_shooter.entry;

		expect(processSwitchEvents([edge(entry, false, 7)])).toEqual([{ type: 'ball_launched', tick: 7 }]);
		expect(
			processSwitchEvents([edge(entry, true, 7)]),
			'a ball ARRIVING in the shooter lane is not a launch -- AD-6: the OPENING is the one event that means "plunged"',
		).toEqual([]);
	});

	it('a parking device\'s slot switch edges become device_ball_entered/_left with the slot index from TABLE, not a literal', () => {
		const slots = TABLE.ballDevices.bd_trough.slots;

		expect(processSwitchEvents([edge(slots[0], true, 3)])).toEqual([
			{ type: 'device_ball_entered', device: 'bd_trough', slot: 0, tick: 3 },
		]);
		expect(processSwitchEvents([edge(slots[3], false, 4)])).toEqual([
			{ type: 'device_ball_left', device: 'bd_trough', slot: 3, tick: 4 },
		]);
	});

	it('a button switch produces no device event at all -- the devices layer owns devices, not the cabinet buttons', () => {
		for (const name of ['s_start', 's_flipper_l', 's_flipper_r', 's_plunger']) {
			expect(processSwitchEvents([edge(name, true), edge(name, false)]), `${name} must map to nothing`).toEqual([]);
		}
	});

	it('a switch that belongs to no device produces nothing', () => {
		expect(processSwitchEvents([edge('s_tilt_bob', true)])).toEqual([]);
	});
});

describe('sim/rules/ball-controller.ts -- ballsInPlay accounting (AD-6)', () => {
	it('ball_launched increments; a ball parking in a device decrements', () => {
		const launched = applyDeviceEvents(machine(), [{ type: 'ball_launched', tick: 1 }]);
		expect(launched.ballsInPlay).toBe(1);

		const parked = applyDeviceEvents(launched, [{ type: 'device_ball_entered', device: 'bd_trough', slot: 0, tick: 2 }]);
		expect(parked.ballsInPlay).toBe(0);
	});

	it('device_ball_left never changes the count -- only a launch does', () => {
		const before = machine({ ballsInPlay: 1 });
		const after = applyDeviceEvents(before, [{ type: 'device_ball_left', device: 'bd_trough', slot: 3, tick: 1 }]);
		expect(after.ballsInPlay).toBe(1);
		expect(after, 'an unchanged count must return the SAME MachineState object, not a copy').toBe(before);
	});

	// Review finding 2026-08-28: the increment has one source (ball_launched)
	// and the decrement another (a ball reaching a parking device), so the two
	// are not structurally paired. Any ball that parks without having opened
	// s_shooter_lane first -- two dev c_trough_eject pulses in a row, a ball
	// knocked back out of the lane, Story 2.12's ball search dislodging a
	// stuck ball -- drove ballsInPlay to -1, and nothing ever brought it back.
	it('a ball parking while nothing is in play floors the count at zero, never negative', () => {
		const after = applyDeviceEvents(machine({ ballsInPlay: 0 }), [
			{ type: 'device_ball_entered', device: 'bd_trough', slot: 0, tick: 1 },
		]);
		expect(after.ballsInPlay).toBe(0);

		// And repeatedly: a drained multiball's worth of unmatched parks must
		// not dig a hole a later launch has to climb out of first.
		const drained = applyDeviceEvents(machine({ ballsInPlay: 1 }), [
			{ type: 'device_ball_entered', device: 'bd_trough', slot: 0, tick: 1 },
			{ type: 'device_ball_entered', device: 'bd_trough', slot: 1, tick: 1 },
			{ type: 'device_ball_entered', device: 'bd_trough', slot: 2, tick: 1 },
		]);
		expect(drained.ballsInPlay).toBe(0);
		expect(applyDeviceEvents(drained, [{ type: 'ball_launched', tick: 2 }]).ballsInPlay).toBe(1);
	});
});

describe('sim/rules/index.ts -- step() runs on every physics step (AD-4)', () => {
	it('stamps the tick and returns empty commands even with NO switch events', () => {
		const result = rulesStep(state(), [], 42);
		expect(result.state.tick).toBe(42);
		expect(result.events).toEqual([]);
		// Story 1.8 sweep (vacuity shape 1, Code Map Part D item 1): this used to
		// be cited as an AD-5 "no rules round trip" proof (the lead's own Story
		// 1.6 ADR verification logged and corrected exactly that). It is not one:
		// `RulesStepResult.commands` is typed `readonly never[]`
		// (src/sim/rules/index.ts), so this assertion holds for EVERY possible
		// implementation and can never go red -- it is a type-level fact restated
		// at runtime, not evidence of anything this test exercised. Kept only as
		// a literal type/shape check (AD-9: no presentation command exists yet to
		// emit). The real AD-5 pin -- "no rules round trip" as an ORDERING claim
		// -- lives in test/hardware-rule-seam.test.ts (structural) and the four
		// same-tick-integration tests it cross-references (behavioural):
		// test/flipper-mover.test.ts, test/plunger.test.ts,
		// test/cabinet-integration.test.ts, test/machine-serve-drain.test.ts's
		// fourth-participant pin.
		expect(result.commands, 'AD-9: this story emits no presentation command at all (vacuous by readonly never[] -- see the comment above; not an AD-5 proof)').toEqual([]);
	});

	it('only ball_launched crosses into FrameOutput.events -- device_ball_entered/_left stay internal', () => {
		const slots = TABLE.ballDevices.bd_trough.slots;
		const result = rulesStep(state(), [edge(TABLE.ballDevices.bd_shooter.entry, false, 5), edge(slots[0], true, 5)], 5);

		expect(result.events).toEqual([{ type: 'ball_launched', tick: 5 }]);
		// ...but the internal one still did its accounting work.
		expect(result.state.machine.ballsInPlay).toBe(0); // +1 launched, -1 parked
	});
});
