// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.3's fourth acceptance criterion: TABLE.reference equals AD-10's
// figures exactly, every switch carries a settleClass, and every ball
// device its slots in fill order (bd_trough) / entry (bd_shooter). Also the
// integration AC: an unknown device name fails `pnpm typecheck`, not a
// runtime surprise -- proven by a real consumer module (sim/table/names.ts)
// with a type-level negative.

import { describe, expect, it } from 'vitest';
import { TABLE, deepFreeze } from '../src/sim/table/dragonwar';
import { resolveTuning } from '../src/sim/table/tuning';
import type {
	BallDeviceName,
	CoilName,
	SwitchName,
	CoilCommand as BoundCoilCommand,
	MachineState as BoundMachineState,
	SwitchEvent as BoundSwitchEvent,
} from '../src/sim/table/names';

describe('TABLE.reference -- AD-10 / AR-16 exact figures', () => {
	it('matches the spine\'s reference dimensions exactly', () => {
		expect(TABLE.reference).toEqual({
			playfieldMm: { w: 514.4, h: 1066.8 },
			ballMm: 26.99,
			pitchDeg: 6.5,
			flipperBatIn: 3.125,
		});
	});
});

describe('TABLE -- no Table interface, loader API, plugin API or runtime table selection', () => {
	it('TABLE is a plain frozen object, not a class instance or a factory result', () => {
		expect(Object.getPrototypeOf(TABLE)).toBe(Object.prototype);
		expect(Object.isFrozen(TABLE)).toBe(true);
	});

	it('is deep-frozen: a nested collection cannot be mutated', () => {
		expect(() => {
			(TABLE.switches as unknown as { s_start: unknown }).s_start = null;
		}).toThrow();
		expect(() => {
			(TABLE.ballDevices.bd_trough.slots as unknown as string[]).push('s_trough_5');
		}).toThrow();
	});
});

describe('deepFreeze() -- DW-33: freezing is unconditional; only cycles are guarded', () => {
	it('a PRE-FROZEN sub-object handed in still gets its own children frozen (the previous !Object.isFrozen(value) short-circuit skipped this entirely)', () => {
		const input = Object.freeze({ inner: { a: 1 } });
		const frozen = deepFreeze(input);
		expect(Object.isFrozen(frozen), 'sanity: the pre-frozen root stays frozen').toBe(true);
		expect(Object.isFrozen(frozen.inner), 'the pre-frozen root\'s OWN CHILD must also end up frozen').toBe(true);
		expect(() => {
			(frozen.inner as unknown as { a: number }).a = 2;
		}, 'mutating the child must throw in strict mode once it is actually frozen').toThrow();
	});

	it('a self-referential input terminates instead of recursing forever', () => {
		const cyclic: { self?: unknown } = {};
		cyclic.self = cyclic;
		expect(() => deepFreeze(cyclic)).not.toThrow();
		expect(Object.isFrozen(cyclic)).toBe(true);
		expect(cyclic.self).toBe(cyclic);
	});
});

describe('TABLE.switches -- Epic 1\'s eleven, each with a settleClass', () => {
	const epic1Switches: SwitchName[] = [
		's_start',
		's_flipper_l',
		's_flipper_r',
		's_plunger',
		's_shooter_lane',
		's_trough_1',
		's_trough_2',
		's_trough_3',
		's_trough_4',
		's_tilt_bob',
		's_slam_tilt',
	];

	it.each(epic1Switches)('%s carries a settleClass', (name) => {
		expect(typeof TABLE.switches[name].settleClass).toBe('string');
		expect(TABLE.switches[name].settleClass.length).toBeGreaterThan(0);
	});

	it('s_tilt_bob uses AD-2\'s named tilt_bob class (0 ms default)', () => {
		expect(TABLE.switches.s_tilt_bob.settleClass).toBe('tilt_bob');
	});
});

// Story 2.1b: the full shot map's switch set (epics.md:927), completed on
// top of Epic 1's eleven above -- named exactly, not merely counted, so a
// renamed or dropped switch fails naming which one, not just the total.
describe('TABLE.switches -- Story 2.1b completes the shot map\'s switch set (AC 3)', () => {
	const shotMapSwitches: SwitchName[] = [
		's_loop_l_in', 's_loop_l_out', 's_loop_r_in', 's_loop_r_out', 's_spinner',
		's_ramp_enter', 's_ramp_made',
		's_dragon_d', 's_dragon_r', 's_dragon_a', 's_dragon_g', 's_dragon_o', 's_dragon_n', 's_dragon_body',
		's_lock_lane', 's_lock_1', 's_lock_2', 's_lock_3',
		's_top_1', 's_top_2', 's_top_3',
		's_inlane_l', 's_inlane_r', 's_outlane_l', 's_outlane_r',
		's_sling_l', 's_sling_r',
		's_pop_1', 's_pop_2', 's_pop_3',
		's_drain',
	];

	it('has exactly Epic 1\'s eleven plus the shot map\'s switches, nothing more, nothing fewer', () => {
		const epic1Switches: SwitchName[] = [
			's_start', 's_flipper_l', 's_flipper_r', 's_plunger', 's_shooter_lane',
			's_trough_1', 's_trough_2', 's_trough_3', 's_trough_4', 's_tilt_bob', 's_slam_tilt',
		];
		expect(Object.keys(TABLE.switches).sort()).toEqual([...epic1Switches, ...shotMapSwitches].sort());
	});

	it.each(shotMapSwitches)('%s carries a settleClass', (name) => {
		expect(typeof TABLE.switches[name].settleClass).toBe('string');
		expect(TABLE.switches[name].settleClass.length).toBeGreaterThan(0);
	});

	// AC 3 mutation (spec ## Verification): change s_dragon_d's settleClass
	// from drop_target to rollover -> this assertion goes red naming
	// s_dragon_d, because 'rollover' !== 'drop_target'.
	it('the six DRAGON-bank targets carry settleClass drop_target (20 ms default), which resolves to a non-zero settleTicks', () => {
		for (const name of ['s_dragon_d', 's_dragon_r', 's_dragon_a', 's_dragon_g', 's_dragon_o', 's_dragon_n'] as const) {
			expect(TABLE.switches[name].settleClass, `${name} must carry settleClass 'drop_target'`).toBe('drop_target');
		}
		const resolved = resolveTuning();
		expect(resolved.switchSettleTicksByClass.drop_target.value, 'drop_target must resolve to a non-zero settleTicks').toBeGreaterThan(0);
	});

	it('the Dragon body and both slingshots carry settleClass standup (8 ms default)', () => {
		expect(TABLE.switches.s_dragon_body.settleClass).toBe('standup');
		expect(TABLE.switches.s_sling_l.settleClass).toBe('standup');
		expect(TABLE.switches.s_sling_r.settleClass).toBe('standup');
	});

	it('the three pop bumpers carry settleClass bumper_skirt (2 ms default)', () => {
		for (const name of ['s_pop_1', 's_pop_2', 's_pop_3'] as const) {
			expect(TABLE.switches[name].settleClass).toBe('bumper_skirt');
		}
	});

	it('the spinner stays rollover deliberately -- any settle would swallow revolutions', () => {
		expect(TABLE.switches.s_spinner.settleClass).toBe('rollover');
	});
});

describe('TABLE.coils -- Epic 1\'s four plus Story 2.1b\'s new hardware coils', () => {
	const expectedCoils: CoilName[] = [
		'c_flipper_l', 'c_flipper_r', 'c_trough_eject', 'c_autolaunch',
		'c_sling_l', 'c_sling_r', 'c_pop_1', 'c_pop_2', 'c_pop_3', 'c_dragon_bank_reset', 'c_mouth',
	];

	it('has exactly the eleven coils, nothing more, nothing fewer', () => {
		expect(Object.keys(TABLE.coils).sort()).toEqual([...expectedCoils].sort());
	});
});

describe('TABLE.ballDevices.bd_lock -- Story 2.1b (AD-6)', () => {
	it('is a parking device, capacity 3, slots in fill order, ejecting through c_mouth', () => {
		const lock = TABLE.ballDevices.bd_lock;
		expect(lock.kind).toBe('parking');
		expect(lock.capacity).toBe(3);
		expect(lock.slots).toEqual(['s_lock_1', 's_lock_2', 's_lock_3']);
		expect(lock.ejectCoil).toBe('c_mouth');
		expect(lock.ballSearchOrder.length).toBeGreaterThan(0);
		expect(lock.ballSearchOrder.at(-1)).toEqual({ action: 'recover' });
	});

	it('carries no servesInto -- the Mouth ejects onto open playfield, not into a zone', () => {
		expect((TABLE.ballDevices.bd_lock as { servesInto?: string }).servesInto).toBeUndefined();
	});
});

// Task 12b: the pop-bumper count recorded in TABLE.authoredCounts must never
// silently drift from the switch/coil set it documents (AD-15).
describe('TABLE.authoredCounts.popBumpers -- Story 2.1b task 12a/12b (AD-15)', () => {
	it('records value 3, confidence unverified, with a non-empty source', () => {
		expect(TABLE.authoredCounts.popBumpers.value).toBe(3);
		expect(TABLE.authoredCounts.popBumpers.confidence).toBe('unverified');
		expect(TABLE.authoredCounts.popBumpers.source.length).toBeGreaterThan(0);
	});

	// Mutation (spec ## Verification, "AC 3 (provenance half)"): change
	// TABLE.authoredCounts.popBumpers.value from 3 to 4 without touching the
	// switch set -> this assertion goes red naming the mismatch; delete one
	// s_pop_* entry -> the same assertion goes red from the other direction.
	it('agrees with the declared s_pop_* switch set and c_pop_* coil set -- a record that can drift from what it documents is worse than none', () => {
		const popSwitches = Object.keys(TABLE.switches).filter((name) => name.startsWith('s_pop_'));
		const popCoils = Object.keys(TABLE.coils).filter((name) => name.startsWith('c_pop_'));
		expect(popSwitches.length, `TABLE.authoredCounts.popBumpers.value (${TABLE.authoredCounts.popBumpers.value}) must equal the number of s_pop_* switches`).toBe(TABLE.authoredCounts.popBumpers.value);
		expect(popCoils.length, `TABLE.authoredCounts.popBumpers.value (${TABLE.authoredCounts.popBumpers.value}) must equal the number of c_pop_* coils`).toBe(TABLE.authoredCounts.popBumpers.value);
	});

	it('is NOT part of buildTableDump()\'s emitted key set -- a provenance record is not geometry', async () => {
		const { buildTableDump } = await import('../tools/export-assets.mjs');
		const dump = buildTableDump();
		expect(Object.prototype.hasOwnProperty.call(dump, 'authoredCounts')).toBe(false);
	});
});

describe('TABLE.ballDevices -- bd_trough (parking) and bd_shooter (non-parking)', () => {
	it('bd_trough is a parking device, capacity 4, slots in fill order, with its eject coil and a search order', () => {
		const trough = TABLE.ballDevices.bd_trough;
		expect(trough.kind).toBe('parking');
		expect(trough.capacity).toBe(4);
		expect(trough.slots).toEqual(['s_trough_1', 's_trough_2', 's_trough_3', 's_trough_4']);
		expect(trough.ejectCoil).toBe('c_trough_eject');
		expect(trough.ballSearchOrder.length).toBeGreaterThan(0);
		expect(trough.ballSearchOrder.at(-1)).toEqual({ action: 'recover' });
	});

	it('bd_shooter is a non-parking device with its entry switch', () => {
		const shooter = TABLE.ballDevices.bd_shooter;
		expect(shooter.kind).toBe('non-parking');
		expect(shooter.entry).toBe('s_shooter_lane');
	});

	it('slots reference real switch names', () => {
		const slotNames: readonly string[] = TABLE.ballDevices.bd_trough.slots;
		for (const slot of slotNames) {
			expect(Object.keys(TABLE.switches)).toContain(slot);
		}
	});

	// Story 1.5, task 7: `servesInto` -- the `sw_` zone every device's
	// authored eject pose must lie inside (test/device-eject-pose.test.ts is
	// the standing gate that actually checks the pose; this pins the field's
	// value and that it names a real switch).
	it('bd_trough.servesInto is s_shooter_lane (its eject kicks the ball into the shooter lane)', () => {
		expect(TABLE.ballDevices.bd_trough.servesInto).toBe('s_shooter_lane');
	});

	it('bd_shooter.servesInto is s_shooter_lane (its served ball rests in its own lane)', () => {
		expect(TABLE.ballDevices.bd_shooter.servesInto).toBe('s_shooter_lane');
	});

	it('every declared servesInto names a real TABLE.switches key', () => {
		for (const [name, device] of Object.entries(TABLE.ballDevices)) {
			const servesInto: string | undefined = (device as { servesInto?: string }).servesInto;
			if (servesInto !== undefined) {
				expect(Object.keys(TABLE.switches), `${name}.servesInto names an unknown switch "${servesInto}"`).toContain(servesInto);
			}
		}
	});
});

describe('TABLE.giChannels -- AD-9\'s three architectural channels', () => {
	it('has exactly gi_backbox, gi_cabinet, gi_arch', () => {
		expect(Object.keys(TABLE.giChannels).sort()).toEqual(['gi_arch', 'gi_backbox', 'gi_cabinet']);
	});
});

describe('TABLE\'s empty collections -- Design Notes "Scope decisions on the closed unions"', () => {
	it('flashers, shows and shots are still empty, so their name unions are still never', () => {
		expect(TABLE.flashers).toEqual({});
		expect(TABLE.shows).toEqual({});
		expect(TABLE.shots).toEqual({});
	});
});

describe('TABLE.lamps -- Story 1.4 adds exactly one lamp', () => {
	it('has exactly l_insert_left', () => {
		expect(Object.keys(TABLE.lamps)).toEqual(['l_insert_left']);
	});
});

describe('TABLE.lightGroups -- Story 1.4 populates the placeholder\'s three groups (AD-12)', () => {
	it('has exactly lg_playfield, lg_inserts, lg_cabinet', () => {
		expect(Object.keys(TABLE.lightGroups).sort()).toEqual(['lg_cabinet', 'lg_inserts', 'lg_playfield']);
	});
});

describe('TABLE.physMaterials -- Story 1.4 names the phys_material keys tuning.ts defines', () => {
	// Story 2.2 (AC 4) added the three material names the geometry always
	// implied -- rubber_band (both slings), rubber_post (every col_post_*
	// node), bumper (all three col_pop_* nodes).
	it('has exactly default, flipper_rubber, rubber_band, rubber_post, bumper', () => {
		expect(Object.keys(TABLE.physMaterials).sort()).toEqual(['bumper', 'default', 'flipper_rubber', 'rubber_band', 'rubber_post']);
	});
});

describe('TABLE.nodes -- Story 1.4\'s glb/collision node names (AD-11)', () => {
	it('has exactly the three top-level nodes and the four collision nodes the physics loader asserts', () => {
		expect(TABLE.nodes).toEqual({
			playfieldRoot: 'playfield_root',
			cabinetRoot: 'cabinet_root',
			pivotPitch: 'pivot_pitch',
			colPlayfield: 'col_playfield',
			colGlass: 'col_glass',
			colFlipperL: 'col_flipper_l',
			colFlipperR: 'col_flipper_r',
		});
	});

	it('every node name matches AD-11\'s grammar ^[a-z][a-z0-9_]*$', () => {
		for (const name of Object.values(TABLE.nodes)) {
			expect(name, `node name "${name}" violates ^[a-z][a-z0-9_]*$`).toMatch(/^[a-z][a-z0-9_]*$/);
		}
	});
});

describe('Integration AC -- names.ts binds the name unions to TABLE; an unknown device name is a type error', () => {
	it('a real device name is assignable to SwitchName / BallDeviceName', () => {
		function acceptsSwitchName(name: SwitchName): SwitchName {
			return name;
		}
		function acceptsBallDeviceName(name: BallDeviceName): BallDeviceName {
			return name;
		}
		expect(acceptsSwitchName('s_start')).toBe('s_start');
		expect(acceptsBallDeviceName('bd_trough')).toBe('bd_trough');

		// @ts-expect-error -- 's_not_a_switch' is not a key of TABLE.switches;
		// the union is derived from `typeof TABLE`, so this is caught by
		// `pnpm typecheck`, not discovered at runtime (this story's own
		// I/O-matrix row, "Name unions bind to TABLE").
		acceptsSwitchName('s_not_a_switch');
	});

	// Review finding, this story's review pass: the thirteen BOUND seam
	// aliases in names.ts had no consumer and no test anywhere in src/, test/
	// or tools/. Every generic in sim/contracts/** is constrained
	// `TX extends string`, so loosening a binding to `ContractsSnapshot<string>`
	// (or binding the wrong union) still typechecks and every gate in this
	// story stays green -- the Integration AC was verified for `SwitchName`
	// read directly, but not for the seam types Stories 1.5/1.6 will import.
	// These cases exercise the bound aliases themselves.
	it('the bound seam aliases carry TABLE\'s unions, so a wrong device name is a type error', () => {
		const sw: BoundSwitchEvent = { type: 'switch', switch: 's_start', closed: true, tick: 0 };
		expect(sw.switch).toBe('s_start');

		const coil: BoundCoilCommand = { type: 'coil', coil: 'c_flipper_l', action: 'pulse', tick: 0 };
		expect(coil.coil).toBe('c_flipper_l');

		// @ts-expect-error -- bound to SwitchName, so an unknown switch fails here
		// exactly as it does on the bare name union above.
		const badSwitch: BoundSwitchEvent = { type: 'switch', switch: 's_nope', closed: true, tick: 0 };
		void badSwitch;

		// @ts-expect-error -- bound to CoilName; 's_start' is a switch, not a coil,
		// so binding the wrong union to this alias would be caught.
		const badCoil: BoundCoilCommand = { type: 'coil', coil: 's_start', action: 'pulse', tick: 0 };
		void badCoil;
	});

	it('the bound Snapshot/MachineState alias is keyed by BallDeviceName, not by string', () => {
		function acceptsBallDeviceKey(key: keyof BoundMachineState['deviceSlots']): string {
			return key;
		}
		expect(acceptsBallDeviceKey('bd_trough')).toBe('bd_trough');

		// @ts-expect-error -- if MachineState were bound to `string` (or to the
		// wrong union) this line would compile, and nothing else would notice.
		acceptsBallDeviceKey('bd_not_a_device');
	});
});
