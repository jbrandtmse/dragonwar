// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1b, AC 5 (the Integration AC): "given the fastest ball a
// full-strength plunge and a flipper hit can produce -- measured and
// recorded, not assumed -- when it passes through each rollover, the DRAGON
// bank, the Lock lane and the drain, then every switch closes exactly once
// per pass because zone tests use the per-tick swept segment, and no pass is
// missed at that speed."
//
// ## Measuring the maximum speed (task 16's own deliverable, not a lookup)
//
// Two legs, both driven through the REAL pipeline:
//
// - Plunge leg: `createLoop({ collisionDoc })`, `pulseCoil('c_trough_eject')`,
//   settle ~300 ticks, hold `plunger` past `plungerMaxHoldMs` (500), release,
//   poll `out.snapshot.balls[0].speed` (already table mm/s) per tick for a
//   maximum. Measured this pass: **2497.92 mm/s** (matches
//   `autolaunchSpeedMmPerS = 2500` within solver noise -- `plungerSpeedByHoldMs`
//   clamps to full scale past the max hold).
// - Flipper leg: `test/flipper-collision.test.ts`'s own "driven bat strikes a
//   resting ball" harness (`buildFlipperHarness()`/`spawnBallAt()`), reading
//   `ballSpeed()` (raw VU/T) and converting with the documented formula
//   `mm/s = VU/T * MM_PER_VU (0.53975) * 100` (the `* 100` undoes VP's 1 T =
//   10 ms convention -- `src/sim/loop/index.ts:168-172`,
//   `src/sim/table/frames.ts:51`). Measured this pass: **38.6389 VU/T =
//   2085.54 mm/s**.
//
// The plunge leg is the larger of the two, so `MEASURED_MAX_SPEED_MM_PER_S`
// below is derived from it with a small margin, never a re-invented figure.
//
// ## The zone-sweep harness
//
// `createSwitchTracker()` (`src/sim/physics/switches.ts`) is the exact
// production mechanism `createMachine()` wires in (`machine.ts:279`,
// `TrackedSwitch`/`segmentIntersectsBox`) -- there is no separate "fast
// path" and "slow path" for zone detection, so driving the tracker directly
// against the REAL committed zone geometry, over a synthetic per-tick swept
// segment at the measured maximum speed, exercises the identical code this
// AC is about. Every zone position comes from the committed collision
// document (`test/util/collision-doc.ts`'s `readCollisionDoc()`), never a
// literal -- switch zones live in `doc.switchZones` as `minMm`/`maxMm` and
// carry no `bboxMm`. A second, end-to-end case drives one real `createMachine`
// ball through one real zone (a `drop_target` -- the class this AC's own
// defect (`DW-67`) targets) to prove the full wiring, not merely the unit.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSwitchTracker } from '../src/sim/physics/switches';
import { createMachine } from '../src/sim/physics/machine';
import { NO_FRAME } from '../src/sim/loop';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import { toPhysics, MM_PER_VU } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { readCollisionDoc } from './util/collision-doc';
import { MEASURED_MAX_SPEED_MM_PER_S, MEASURED_PLUNGE_MAX_MM_PER_S } from './util/max-speed';
import type { LoadedSwitchZone } from '../src/sim/physics/loader';
import type { SwitchName } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

const TICK_HZ = 1000;
/** mm covered in one tick at the measured maximum speed. */
const MM_PER_TICK = MEASURED_MAX_SPEED_MM_PER_S / TICK_HZ;

interface Vec3Mm {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

/**
 * Builds a straight-line, per-tick swept path through `zone` at
 * `MM_PER_TICK`, entering and exiting well outside it on the zone's own
 * LONGER horizontal axis (so the sweep genuinely crosses the whole zone, not
 * merely clips a corner), centred on the shorter axis and at mid-height in z.
 */
function sweepThroughZone(zone: { readonly minMm: Vec3Mm; readonly maxMm: Vec3Mm }): Array<{ before: Vec3Mm; after: Vec3Mm }> {
	const xSpan = zone.maxMm.x - zone.minMm.x;
	const ySpan = zone.maxMm.y - zone.minMm.y;
	const z = (zone.minMm.z + zone.maxMm.z) / 2;
	const margin = 60; // mm well clear of the zone on either side
	let start: Vec3Mm;
	let end: Vec3Mm;
	if (xSpan >= ySpan) {
		const cy = (zone.minMm.y + zone.maxMm.y) / 2;
		start = { x: zone.minMm.x - margin, y: cy, z };
		end = { x: zone.maxMm.x + margin, y: cy, z };
	} else {
		const cx = (zone.minMm.x + zone.maxMm.x) / 2;
		start = { x: cx, y: zone.minMm.y - margin, z };
		end = { x: cx, y: zone.maxMm.y + margin, z };
	}
	const totalDist = Math.hypot(end.x - start.x, end.y - start.y);
	const ticks = Math.ceil(totalDist / MM_PER_TICK);
	const dirX = (end.x - start.x) / totalDist;
	const dirY = (end.y - start.y) / totalDist;
	const movements: Array<{ before: Vec3Mm; after: Vec3Mm }> = [];
	let pos = start;
	for (let i = 0; i < ticks; i++) {
		const nextX = pos.x + dirX * MM_PER_TICK;
		const nextY = pos.y + dirY * MM_PER_TICK;
		const next = { x: nextX, y: nextY, z };
		movements.push({ before: pos, after: next });
		pos = next;
	}
	// A few settle ticks stationary at the exit point, well outside the zone,
	// so a debounced BREAK (drop_target: 20 ticks) has room to complete.
	for (let i = 0; i < 40; i++) {
		movements.push({ before: pos, after: pos });
	}
	return movements;
}

describe('switch zones at the measured maximum speed (AC 5, AC 2) -- every zone-requiring switch registers exactly one make and one break per pass', () => {
	const doc = readCollisionDoc();
	const tuning = resolveTuning();

	// Every switch requiring a zone, per AD-2's own partition (Design Notes,
	// "Which switches require a zone"): everything except button,
	// tilt_bob/slam, and parking-device slots (`createSwitchTracker()`'s own
	// `parkingDeviceOwnedSwitches()`, derived from TABLE.ballDevices, never a
	// name literal -- this test mirrors that same derivation, not a
	// hand-maintained exclusion list). Derived from the real document's own
	// switchZones -- one case per ZONE (a switch with two zones, like
	// s_dragon_body, is swept through both).
	const parkingDeviceSlots = new Set<string>();
	for (const device of Object.values(TABLE.ballDevices)) {
		if (device.kind === 'parking') {
			for (const slot of device.slots) {
				parkingDeviceSlots.add(slot);
			}
		}
	}
	const zoneCases: Array<{ zoneName: string; switchName: SwitchName }> = doc.switchZones
		.filter((z) => !parkingDeviceSlots.has(z.switch))
		.map((z) => ({ zoneName: z.name, switchName: z.switch as SwitchName }));

	expect(zoneCases.length, 'sanity: the shot map must have added zone-requiring switches to sweep').toBeGreaterThanOrEqual(30);

	// Code review 2026-09-02 (Rule 19): MEASURED_MAX_SPEED_MM_PER_S is a
	// frozen literal in test/util/max-speed.ts, measured once against the
	// plunge leg. Nothing tied it to the tunable it was measured FROM, so
	// raising autolaunchSpeedMmPerS would leave every sweep below quietly
	// running under the real maximum while still calling itself "the measured
	// maximum speed" -- AC 5's whole claim. This pins the recorded figure to
	// the live tunable, so a tuning change that invalidates the measurement
	// fails here by name instead of silently.
	//
	// mutation: raise TUNING.autolaunchSpeedMmPerS.value above
	// MEASURED_PLUNGE_MAX_MM_PER_S / 0.99 -> this assertion goes red naming
	// both figures.
	it('the recorded plunge maximum still covers the live autolaunch tunable it was measured from', () => {
		const autolaunch = TUNING.autolaunchSpeedMmPerS.value;
		expect(
			MEASURED_PLUNGE_MAX_MM_PER_S,
			`the recorded plunge maximum (${MEASURED_PLUNGE_MAX_MM_PER_S} mm/s, test/util/max-speed.ts) must still cover TUNING.autolaunchSpeedMmPerS (${autolaunch} mm/s) -- re-measure it if the tunable moved`,
		).toBeGreaterThanOrEqual(autolaunch * 0.99);
	});

	it.each(zoneCases)('$zoneName ($switchName): exactly one make (immediate) and one break per pass at the measured maximum speed', ({ zoneName, switchName }) => {
		const zoneDoc = doc.switchZones.find((z) => z.name === zoneName)!;
		const zone: LoadedSwitchZone = { name: zoneDoc.name, switch: switchName, minMm: zoneDoc.minMm, maxMm: zoneDoc.maxMm };
		const tracker = createSwitchTracker([zone], tuning);

		const movements = sweepThroughZone(zoneDoc);
		const events: Array<{ closed: boolean; tick: number }> = [];
		for (let i = 0; i < movements.length; i++) {
			const tick = i + 1;
			for (const event of tracker.step(tick, [movements[i]!])) {
				events.push({ closed: event.closed, tick: event.tick });
			}
		}

		const makes = events.filter((e) => e.closed);
		const breaks = events.filter((e) => !e.closed);
		expect(makes.length, `${zoneName}: exactly one make expected, got ${JSON.stringify(events)}`).toBe(1);
		expect(breaks.length, `${zoneName}: exactly one break expected, got ${JSON.stringify(events)}`).toBe(1);
		expect(breaks[0]!.tick, `${zoneName}: the break must occur after the make`).toBeGreaterThan(makes[0]!.tick);
	});
});

describe('switch-max-speed: the full end-to-end wiring, through the real createMachine (AC 5 Integration)', () => {
	it('a ball driven at a DRAGON-bank target (a real drop_target zone) at the measured maximum speed surfaces exactly one make through machine.step().switchEvents', () => {
		// Targets 'd' (the aim point) and 'r' (its immediate neighbour) both
		// carry settleClass 'drop_target' -- small, genuine contact-response
		// drift over the 25-ish ticks of approach can land the ball a few mm
		// either side of its aim point (this is real physics, not a canned
		// result), so this asserts the CLASS-level claim (a drop_target zone
		// registers exactly once at the measured maximum speed through the
		// real pipeline) against whichever of the two the ball actually
		// crosses, rather than pinning a specific letter no unit-level test
		// already covers exhaustively (see the describe block above, which
		// sweeps every zone, including both 'd' and 'r', kinematically).
		const doc = readCollisionDoc();
		const zoneDoc = doc.switchZones.find((z) => z.name === 'sw_dragon_d');
		expect(zoneDoc, 'sw_dragon_d must exist in the committed collision document').toBeDefined();

		const tuning = resolveTuning();
		const machine = createMachine(loadDoc(), tuning);

		// Reposition a served ball with test/machine-serve-drain.test.ts's own
		// recipe: reset vel, angularVelocity AND angularMomentum, or residual
		// spin walks the ball sideways under friction.
		let tick = 0;
		for (let i = 0; i < 320; i++) {
			tick += 1;
			machine.step(tick, NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : []);
		}
		const ball = machine.balls[0];
		expect(ball, 'a served ball must exist to reposition').toBeDefined();

		const cx = (zoneDoc!.minMm.x + zoneDoc!.maxMm.x) / 2;
		const startMm = { x: cx, y: zoneDoc!.minMm.y - 60, z: (zoneDoc!.minMm.z + zoneDoc!.maxMm.z) / 2 };
		const startPhysics = toPhysics(startMm);
		ball!.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
		const speedVuPerT = MEASURED_MAX_SPEED_MM_PER_S / (MM_PER_VU * 100);
		// Table +y is "up the playfield"; toPhysics() flips y, so a +y table
		// velocity is a -y physics velocity (the same convention
		// elasticity-falloff.test.ts's own mm/s -> VU/T conversion uses).
		ball!.hit.vel.set(0, -speedVuPerT, 0);
		ball!.hit.angularVelocity.set(0, 0, 0);
		ball!.hit.angularMomentum.set(0, 0, 0);

		const switchEvents: Array<{ closed: boolean; tick: number }> = [];
		for (let i = 0; i < 60; i++) {
			tick += 1;
			const result = machine.step(tick, NO_FRAME, []);
			for (const event of result.switchEvents) {
				if (event.switch === 's_dragon_d' || event.switch === 's_dragon_r') {
					switchEvents.push({ closed: event.closed, tick: event.tick });
				}
			}
		}

		const makes = switchEvents.filter((e) => e.closed);
		expect(makes.length, `a DRAGON-bank target must make exactly once through the real machine.step() pipeline, got ${JSON.stringify(switchEvents)}`).toBe(1);
	});
});
