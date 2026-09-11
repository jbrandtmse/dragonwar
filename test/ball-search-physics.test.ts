// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.12: physics-level coverage of ball search's own two new physics
// participants -- `DeviceMechanics.recover()` (AC 8) and
// `PopMechanics.applyPulses()` (AC 9). This is `machine.ts`'s
// `PRE_STEP_HARDWARE_RULES`'s own `pinnedBy` target for both new manifest
// rows.
//
// Falsifiability (Rule 19): mutation 1 -- in `devices.ts`'s `recover()`,
// remove the `nonParkingEntryZones.some(...)` guard so every ball is
// despawned unconditionally -- AC 8's "the lane ball remains" assertion goes
// red. mutation 2 -- in `pops.ts`'s `applyPulses()`, drop the
// `pulsedCoils.has(device.coil)` guard so every pop kicks on every pulse --
// unreachable here since only one coil is ever pulsed per case, but the
// disabled-coil negative (AC 9) would still catch a dropped `coilEnabled`
// gate upstream in `machine.ts`'s own `enabledPulses` filter.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NO_FRAME } from '../src/sim/loop';
import { createMachine } from '../src/sim/physics/machine';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { MM_PER_VU, toPhysics } from '../src/sim/table/frames';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';
import { switchZoneMm } from './util/collision-doc';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };

function injectBallAt(posMm: { readonly x: number; readonly y: number; readonly z: number }, id: number): Ball {
	const posPhysics = toPhysics(posMm);
	const radiusVu = TABLE.reference.ballMm / 2 / MM_PER_VU;
	const data = new BallData(radiusVu, 1, 1);
	const state = new BallState(`probe-${id}`, new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
	return new Ball(id, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
}

describe('sim/physics/devices.ts -- DeviceMechanics.recover() (Story 2.12, AD-6, AC 8)', () => {
	it('a step with no recover command returns recovered: null, and changes nothing', () => {
		const machine = createMachine(loadDoc(), resolveTuning());
		const result = machine.step(1, NO_FRAME, []);
		expect(result.recovered).toBeNull();
	});

	it('AC 8: a loose ball outside every device is despawned (recovered: 1); a ball inside bd_shooter\'s own entry zone remains', () => {
		const machine = createMachine(loadDoc(), resolveTuning());
		expect(machine.deviceSlots.bd_trough).toEqual([true, true, true, true]);

		// Ball A: served from bd_trough (a REAL registered mover, via the
		// legitimate spawnBall() -> physics.addBall() path -- never an
		// unregistered direct push, which PlayerPhysics.removeBall() rightly
		// refuses). Let it settle inside sw_shooter_lane, then teleport it
		// (the same `place()` technique this story's own AC 2 instrument
		// uses: write `state.pos`, zero velocity, between two steps) out to
		// an open-field position well outside every switch zone -- now a
		// genuinely loose, properly-registered ball.
		let tick = 0;
		tick += 1;
		machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }]);
		for (let i = 0; i < 400; i++) {
			tick += 1;
			machine.step(tick, NO_FRAME, []);
		}
		expect(machine.balls, 'sanity: ball A must have settled before being moved').toHaveLength(1);
		const ballA = machine.balls[0]!;
		const loosePhysics = toPhysics({ x: 130, y: 700, z: 13.5 });
		ballA.state.pos.set(loosePhysics.x, loosePhysics.y, loosePhysics.z);
		ballA.hit.vel.set(0, 0, 0);

		// Ball B: served next, into the now-vacated shooter lane -- the
		// "resting in bd_shooter's entry zone" ball recover() must spare.
		tick += 1;
		machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }]);
		for (let i = 0; i < 400; i++) {
			tick += 1;
			machine.step(tick, NO_FRAME, []);
		}
		expect(machine.balls, 'both balls must be simulated before the recover').toHaveLength(2);
		const ballBId = machine.balls.find((b) => b.id !== ballA.id)!.id;

		tick += 1;
		const recoverResult = machine.step(tick, NO_FRAME, [{ type: 'recover', tick }]);
		expect(recoverResult.recovered, 'exactly one ball (A, loose) is outside every device').toBe(1);
		expect(machine.balls, 'the loose ball must be gone; the lane ball remains').toHaveLength(1);
		expect(machine.balls[0]!.id, 'the SURVIVING ball must be B (the lane ball), not A').toBe(ballBId);
	});

	it('a recover and a pulse c_trough_eject in the SAME step keep the newly served ball -- recover() runs BEFORE applyCommands(), so a ball that same tick\'s own pulse spawns is never despawned by the recover alongside it', () => {
		const machine = createMachine(loadDoc(), resolveTuning());
		expect(machine.balls).toHaveLength(0);

		const combined = machine.step(1, NO_FRAME, [
			{ type: 'recover', tick: 1 },
			{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick: 1 },
		]);
		expect(combined.recovered, 'nothing was loose before this tick\'s own serve').toBe(0);
		expect(machine.balls, 'the newly served ball must still be simulated').toHaveLength(1);
	});
});

describe('sim/physics/pops.ts -- PopMechanics.applyPulses() (Story 2.12, AD-5, AD-6, AC 9)', () => {
	function popOneCentreMm(): { readonly x: number; readonly y: number; readonly z: number } {
		const zone = switchZoneMm('sw_pop_1');
		return {
			x: (zone.minMm.x + zone.maxMm.x) / 2,
			y: (zone.minMm.y + zone.maxMm.y) / 2,
			z: (zone.minMm.z + zone.maxMm.z) / 2,
		};
	}

	it('AC 9: a commanded pulse kicks a ball at rest inside sw_pop_1 -- speed rises from rest, and exactly one coil_fire fires for c_pop_1', () => {
		const machine = createMachine(loadDoc(), resolveTuning());
		const ball = injectBallAt(popOneCentreMm(), 501);
		(machine.balls as Ball[]).push(ball);
		expect(Math.hypot(ball.hit.vel.x, ball.hit.vel.y, ball.hit.vel.z), 'sanity: the probe starts genuinely at rest').toBe(0);

		// Prime tick, coil DISABLED: the switch tracker's own FIRST
		// observation of this ball (already resting inside the zone) is
		// itself a genuine MAKE edge -- settled here, with the coil disabled
		// so this priming step itself kicks nothing, so the commanded pulse
		// under test is the only thing that can move the ball on tick 2 (a
		// pulse into an ALREADY-closed switch produces no NEW switch edge, so
		// `applyPostSwitchEdges`'s own switch-edge trigger never doubles the
		// commanded kick this test is isolating).
		machine.step(1, NO_FRAME, [{ type: 'coil', coil: 'c_pop_1', action: 'disable', tick: 1 }]);
		expect(Math.hypot(ball.hit.vel.x, ball.hit.vel.y, ball.hit.vel.z), 'sanity: the priming tick itself must not have moved the ball').toBeLessThan(0.01);

		const result = machine.step(2, NO_FRAME, [
			{ type: 'coil', coil: 'c_pop_1', action: 'enable', tick: 2 },
			{ type: 'coil', coil: 'c_pop_1', action: 'pulse', tick: 2 },
		]);

		const speed = Math.hypot(ball.hit.vel.x, ball.hit.vel.y, ball.hit.vel.z);
		expect(speed, 'the kick must measurably raise the ball\'s speed off rest').toBeGreaterThan(1);

		const coilFires = result.contactEvents.filter((c) => c.kind === 'coil_fire' && c.device === 'c_pop_1');
		expect(coilFires, 'exactly one coil_fire for c_pop_1').toHaveLength(1);
		expect(coilFires[0]!.tick).toBe(2);
		expect(coilFires[0]!.surface).toBe('bumper');
	});

	it('the same script with c_pop_1 left disabled leaves the ball at rest -- the positive above is the paired, same-test-shape control (never asserting the negative alone)', () => {
		const machine = createMachine(loadDoc(), resolveTuning());
		const ball = injectBallAt(popOneCentreMm(), 502);
		(machine.balls as Ball[]).push(ball);

		machine.step(1, NO_FRAME, [{ type: 'coil', coil: 'c_pop_1', action: 'disable', tick: 1 }]);
		const result = machine.step(2, NO_FRAME, [{ type: 'coil', coil: 'c_pop_1', action: 'pulse', tick: 2 }]);

		const speed = Math.hypot(ball.hit.vel.x, ball.hit.vel.y, ball.hit.vel.z);
		expect(speed, 'a disabled pop must never kick').toBeLessThan(0.01);
		const coilFires = result.contactEvents.filter((c) => c.kind === 'coil_fire' && c.device === 'c_pop_1');
		expect(coilFires, 'a disabled pop emits no coil_fire').toHaveLength(0);
	});

	it('a pulse into an empty skirt silently kicks nothing (no ball at sw_pop_1) -- unlike a genuine switch-edge make, this never throws', () => {
		const machine = createMachine(loadDoc(), resolveTuning());
		expect(machine.balls).toHaveLength(0);
		expect(() => machine.step(1, NO_FRAME, [{ type: 'coil', coil: 'c_pop_1', action: 'pulse', tick: 1 }])).not.toThrow();
	});
});
