// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.5, task 8 -- the standing gate: for every TABLE.ballDevices entry
// that declares `servesInto`, its authored eject pose (read from the
// committed collision document) must lie inside the `sw_` zone bounds of the
// switch it names, on all three axes. Derived entirely from TABLE.ballDevices
// -- no device name appears as a literal here -- so a device added later is
// covered automatically. A companion case proves the assertion is
// discriminating (not vacuous) by replaying it against a hand-built document
// carrying Story 1.4's original bd_trough pose (255, -60, 10) -- which the
// DW-51 ledger entry recorded as sitting in the drain gap, not the shooter
// lane -- and asserting the check FAILS.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

interface Vec3Mm {
	x: number;
	y: number;
	z: number;
}

interface DeviceDoc {
	name: string;
	ejectPose: { posMm: Vec3Mm; dir: Vec3Mm };
}

interface SwitchZoneDoc {
	name: string;
	switch: string;
	minMm: Vec3Mm;
	maxMm: Vec3Mm;
}

interface CollisionDocForTest {
	devices: DeviceDoc[];
	switchZones: SwitchZoneDoc[];
}

function loadCommittedDoc(): CollisionDocForTest {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** Reads `TABLE.ballDevices[name].servesInto` without assuming which of the two device shapes `name` has -- both may or may not carry the field. */
function servesIntoOf(device: unknown): string | undefined {
	return (device as { servesInto?: string }).servesInto;
}

/**
 * Asserts `deviceName`'s eject pose (from the collision document's `devices`
 * array) lies inside the `sw_` zone whose `switch` equals `servesInto`, on
 * all three axes -- failing (via `expect`, so it throws) with a message
 * naming the device, the pose, the zone and the axis that missed.
 */
function assertPoseInsideServesInto(doc: CollisionDocForTest, deviceName: string, servesInto: string): void {
	const deviceDoc = doc.devices.find((d) => d.name === deviceName);
	expect(deviceDoc, `${deviceName}: no entry in the collision document's "devices" array`).toBeDefined();

	const zone = doc.switchZones.find((z) => z.switch === servesInto);
	expect(zone, `${deviceName}.servesInto names "${servesInto}", but no switchZones entry has that switch`).toBeDefined();

	const pose = deviceDoc!.ejectPose.posMm;
	for (const axis of ['x', 'y', 'z'] as const) {
		const value = pose[axis];
		const min = zone!.minMm[axis];
		const max = zone!.maxMm[axis];
		const message =
			`${deviceName}'s eject pose ${JSON.stringify(pose)} falls outside zone "${zone!.name}" ` +
			`(switch "${servesInto}") on axis ${axis}: ${value} not in [${min}, ${max}]`;
		expect(value, message).toBeGreaterThanOrEqual(min);
		expect(value, message).toBeLessThanOrEqual(max);
	}
}

describe('device eject pose vs its servesInto zone (Story 1.5, standing gate)', () => {
	const doc = loadCommittedDoc();

	for (const [deviceName, device] of Object.entries(TABLE.ballDevices)) {
		const servesInto = servesIntoOf(device);
		if (servesInto === undefined) {
			continue;
		}
		it(`${deviceName}'s authored eject pose lies inside the "${servesInto}" zone`, () => {
			assertPoseInsideServesInto(doc, deviceName, servesInto);
		});
	}

	it('at least one device declares servesInto -- otherwise this suite tests nothing', () => {
		const withTarget = Object.values(TABLE.ballDevices).filter((d) => servesIntoOf(d) !== undefined);
		expect(withTarget.length).toBeGreaterThan(0);
	});
});

describe('device eject pose vs its servesInto zone -- the check is discriminating, not vacuous', () => {
	it("fails against Story 1.4's original bd_trough pose (255, -60, 10), which DW-51 found in the drain gap", () => {
		const doc = loadCommittedDoc();
		const servesInto = servesIntoOf(TABLE.ballDevices.bd_trough);
		expect(servesInto, 'sanity: bd_trough must declare servesInto for this test to mean anything').toBeDefined();

		const badDoc: CollisionDocForTest = {
			...doc,
			devices: doc.devices.map((d) =>
				d.name === 'bd_trough' ? { ...d, ejectPose: { ...d.ejectPose, posMm: { x: 255, y: -60, z: 10 } } } : d,
			),
		};

		expect(() => assertPoseInsideServesInto(badDoc, 'bd_trough', servesInto!)).toThrow();
	});
});
