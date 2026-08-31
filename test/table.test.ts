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

describe('TABLE.switches -- every Epic 1 switch, each with a settleClass', () => {
	const expectedSwitches: SwitchName[] = [
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

	it('has exactly the eleven Epic 1 switches', () => {
		expect(Object.keys(TABLE.switches).sort()).toEqual([...expectedSwitches].sort());
	});

	it.each(expectedSwitches)('%s carries a settleClass', (name) => {
		expect(typeof TABLE.switches[name].settleClass).toBe('string');
		expect(TABLE.switches[name].settleClass.length).toBeGreaterThan(0);
	});

	it('s_tilt_bob uses AD-2\'s named tilt_bob class (0 ms default)', () => {
		expect(TABLE.switches.s_tilt_bob.settleClass).toBe('tilt_bob');
	});
});

describe('TABLE.coils -- the four Epic 1 coils', () => {
	const expectedCoils: CoilName[] = ['c_flipper_l', 'c_flipper_r', 'c_trough_eject', 'c_autolaunch'];

	it('has exactly the four Epic 1 coils', () => {
		expect(Object.keys(TABLE.coils).sort()).toEqual([...expectedCoils].sort());
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
	it('has exactly default, flipper_rubber', () => {
		expect(Object.keys(TABLE.physMaterials).sort()).toEqual(['default', 'flipper_rubber']);
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
