// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.3's fourth acceptance criterion: TABLE.reference equals AD-10's
// figures exactly, every switch carries a settleClass, and every ball
// device its slots in fill order (bd_trough) / entry (bd_shooter). Also the
// integration AC: an unknown device name fails `pnpm typecheck`, not a
// runtime surprise -- proven by a real consumer module (sim/table/names.ts)
// with a type-level negative.

import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';
import type { BallDeviceName, CoilName, SwitchName } from '../src/sim/table/names';

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
});

describe('TABLE.giChannels -- AD-9\'s three architectural channels', () => {
	it('has exactly gi_backbox, gi_cabinet, gi_arch', () => {
		expect(Object.keys(TABLE.giChannels).sort()).toEqual(['gi_arch', 'gi_backbox', 'gi_cabinet']);
	});
});

describe('TABLE\'s empty collections -- Design Notes "Scope decisions on the closed unions"', () => {
	it('lamps, flashers, shows, shots, lightGroups are empty, so their name unions are never', () => {
		expect(TABLE.lamps).toEqual({});
		expect(TABLE.flashers).toEqual({});
		expect(TABLE.shows).toEqual({});
		expect(TABLE.shots).toEqual({});
		expect(TABLE.lightGroups).toEqual({});
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
});
