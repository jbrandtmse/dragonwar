// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.2's I/O matrix, slingshot rows (AC 1, AC 3, Integration AC):
// "Sling kick, enabled" / "Sling graze, below threshold" / "Sling disabled",
// plus the Integration AC's own claim that a fired kick reaches
// `FrameOutput.contactEvents` through the real host seam, not only
// `MachineStepResult`.
//
// Both `col_sling_l`'s own rubber posts (`col_post_sling_l`,
// `col_post_sling_l_north`) sit almost exactly in front of its south face --
// measured this story's implementation pass, a ball approaching that face
// from due south at ANY x within the sling's own footprint (98..130) always
// contacts the post first (its own contact circle, [96.505, 131.495],
// covers the whole face). AC 1's own kick-physics half is therefore proven
// here against the sling's EAST edge (x = 130, y [420, 435]) instead --
// genuinely unobstructed (measured: nothing else stands between it and open
// field east of the sling) -- with a geometric witness (the east edge's own
// footprint segment) pairing every kick assertion to the intended body,
// never inferred from a switch alone (this story's spec, "Anti-vacuity").
// The switch-timing half ("s_sling_l is reported closed on the kick tick")
// is proven separately, by first driving the ball through `sw_sling_l`'s own
// zone (which leads contact, spec Code Map) and then teleporting it to the
// east-edge contact point BEFORE `standup`'s 8-tick settle window could ever
// break it -- both phases use the same `createMachine()` + direct
// `ball.state.pos.set()`/`ball.hit.vel.set()` teleport `test/
// elasticity-falloff.test.ts` already establishes as this codebase's own
// answer to "createLoop() gives no seam to place a ball at a controlled
// velocity."
//
// Falsifiability (Rule 19, this story's own Verification section):
// mutation 1: TUNING.hardware.slingshotForce -> 0 -> the enabled-kick test's
// outgoing/incoming ratio assertion goes red naming the measured ratio,
// while the ball still rebounds (the contact itself is unaffected). mutation
// 2: buffer the sling's own contactEvents push by one tick in machine.ts ->
// the same-tick assertion (kick tick === contact-event tick === switch-still-
// closed tick) goes red naming both ticks.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop } from '../src/sim/loop';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { resolveTuning, TUNING, type ResolvedTuning } from '../src/sim/table/tuning';
import { toPhysics, MM_PER_VU } from '../src/sim/table/frames';
import { NO_FRAME } from '../src/sim/loop';
import { distanceToPolygonMm } from './util/plan-geometry';
import { readCollisionDoc } from './util/collision-doc';
import type { CoilCommand } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** `col_sling_l`'s own committed footprint (table-frame mm) -- the geometric witness every kick assertion below is paired against, never a switch edge alone (this story's spec, "Anti-vacuity" trap 1). */
const SLING_L_FOOTPRINT = readCollisionDoc().nodes.find((n) => n.name === 'col_sling_l')!.footprintMm!;
const BALL_RADIUS_MM = 13.495;

function speedMmPerS(vel: { x: number; y: number; z: number }): number {
	return Math.hypot(vel.x, vel.y, vel.z) * MM_PER_VU * 100;
}

/** Boots a served, resting ball through the real `createMachine()` pipeline and returns the machine plus the tick already reached -- the same "serve, then take over" shape `test/shot-routing.test.ts`'s own `driveShot()` uses. */
function bootMachine(tuning: ResolvedTuning = resolveTuning()): { machine: Machine; tick: number } {
	const machine = createMachine(loadDoc(), tuning);
	let tick = 0;
	for (let i = 0; i < 320; i++) {
		tick += 1;
		machine.step(tick, NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : []);
	}
	return { machine, tick };
}

/** Teleports the served ball to `startMm` moving at `speedMmPerS` due WEST (table -x) -- the sling's east-edge contact geometry this file's header explains. */
function teleportWestward(machine: Machine, startMm: { x: number; y: number; z: number }, speedMmPerSValue: number): void {
	const ball = machine.balls[0]!;
	const startPhysics = toPhysics(startMm);
	ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
	ball.hit.vel.set(-speedMmPerSValue / (MM_PER_VU * 100), 0, 0);
}

/** East-edge contact point, at rest-to-contact distance (col_sling_l's east face is x = 130; a ball centred at 130 + BALL_RADIUS_MM + 0.1 mm margin is just outside contact, so the FIRST tick's own step is the collision). */
const EAST_EDGE_CONTACT_MM = { x: 130 + BALL_RADIUS_MM + 0.1, y: 427.5, z: 13.5 };

describe('sim/physics/slings.ts -- the slingshot hardware rule (AD-5, AC 1, AC 3)', () => {
	it('AC 1: enabled, above threshold -- outgoing speed exceeds incoming, exactly one coil_fire for c_sling_l, and the geometric witness confirms the east edge (not a neighbour) was struck', () => {
		const { machine, tick: bootTick } = bootMachine();
		teleportWestward(machine, EAST_EDGE_CONTACT_MM, 800);
		const incomingSpeed = speedMmPerS(machine.balls[0]!.hit.vel);

		const result = machine.step(bootTick + 1, NO_FRAME, []);

		const ball = machine.balls[0]!;
		const outgoingSpeed = speedMmPerS(ball.hit.vel);
		const afterMm = { x: ball.state.pos.x * MM_PER_VU, y: 1066.8 - ball.state.pos.y * MM_PER_VU };

		// Geometric witness (this story's spec, Anti-vacuity trap 1): the ball
		// is at/close to contact distance of col_sling_l's own footprint, not
		// a neighbouring body -- a few mm of tolerance for the same tick's
		// OWN post-kick integration (the solver resolves the collision, then
		// keeps integrating position for the tick's remaining dt at the new,
		// much faster, outgoing speed), never enough to admit a genuinely
		// different body.
		expect(distanceToPolygonMm(afterMm.x, afterMm.y, SLING_L_FOOTPRINT) - BALL_RADIUS_MM, 'the ball must be at contact distance of col_sling_l itself, not a neighbouring body').toBeLessThanOrEqual(3);

		expect(outgoingSpeed, `outgoing (${outgoingSpeed.toFixed(1)}) must exceed incoming (${incomingSpeed.toFixed(1)})`).toBeGreaterThan(incomingSpeed);
		// Bounded above too (this story's spec, Anti-vacuity trap 2): an
		// absurd impulse should fail the same assertion an unbounded one would
		// hide from.
		expect(outgoingSpeed, 'the kick must not be an absurd, unbounded impulse').toBeLessThan(incomingSpeed * 5);

		const coilFires = result.contactEvents.filter((c) => c.kind === 'coil_fire' && c.device === 'c_sling_l');
		expect(coilFires, 'exactly one coil_fire for c_sling_l on the kick tick').toHaveLength(1);
		expect(coilFires[0]!.tick).toBe(bootTick + 1);
		expect(coilFires[0]!.surface).toBe('rubber_band');
	});

	it('I/O matrix "Sling graze, below threshold": no impulse, no coil_fire -- pure elastic bounce', () => {
		const { machine, tick: bootTick } = bootMachine();
		teleportWestward(machine, EAST_EDGE_CONTACT_MM, 400);
		const incomingSpeed = speedMmPerS(machine.balls[0]!.hit.vel);

		const result = machine.step(bootTick + 1, NO_FRAME, []);
		const outgoingSpeed = speedMmPerS(machine.balls[0]!.hit.vel);

		expect(result.contactEvents.filter((c) => c.kind === 'coil_fire'), 'no coil_fire below threshold').toHaveLength(0);
		expect(outgoingSpeed, 'a below-threshold graze still rebounds (elastic), but strictly slower than the incoming speed').toBeLessThan(incomingSpeed);
		expect(outgoingSpeed, 'the rebound must be real, not a full stop').toBeGreaterThan(0);
	});

	it('AC 3: disabled -- passive rubber, measurably slower rebound than enabled, and zero coil_fire; re-enabling restores the kick', () => {
		const { machine, tick: bootTick } = bootMachine();
		let tick = bootTick;

		tick += 1;
		machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_sling_l', action: 'disable', tick }]);

		teleportWestward(machine, EAST_EDGE_CONTACT_MM, 800);
		const incomingSpeed = speedMmPerS(machine.balls[0]!.hit.vel);
		tick += 1;
		const disabledResult = machine.step(tick, NO_FRAME, []);
		const disabledOutgoing = speedMmPerS(machine.balls[0]!.hit.vel);

		expect(disabledResult.contactEvents.filter((c) => c.kind === 'coil_fire'), 'disabled: zero coil_fire').toHaveLength(0);
		expect(disabledOutgoing, 'disabled: passive elastic rebound, slower than incoming').toBeLessThan(incomingSpeed);

		// Re-enable and repeat the SAME drive -- the kick must be restored.
		tick += 1;
		machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_sling_l', action: 'enable', tick }] satisfies CoilCommand[]);
		teleportWestward(machine, EAST_EDGE_CONTACT_MM, 800);
		tick += 1;
		const enabledResult = machine.step(tick, NO_FRAME, []);
		const enabledOutgoing = speedMmPerS(machine.balls[0]!.hit.vel);

		expect(enabledResult.contactEvents.filter((c) => c.kind === 'coil_fire' && c.device === 'c_sling_l'), 're-enabled: the kick fires again').toHaveLength(1);
		expect(enabledOutgoing, 'the re-enabled rebound is measurably faster than the disabled one').toBeGreaterThan(disabledOutgoing * 2);
		expect(enabledOutgoing, 'and genuinely exceeds incoming, exactly like AC 1').toBeGreaterThan(incomingSpeed);
	});

	it('AC 1 (switch-timing half): the sling zone leads contact -- s_sling_l latches closed on the make tick and is STILL reported closed on the later kick tick (no break in between)', () => {
		const { machine, tick: bootTick } = bootMachine();
		let tick = bootTick;

		// Drive the ball through sw_sling_l's own zone (x [94,134], y
		// [380.005,405.005]) -- a slow roll north, well inside the zone,
		// closing s_sling_l on a real swept-segment crossing rather than a
		// teleport landing inside it (AD-2's own "closes on a genuine
		// crossing" contract).
		const ball = machine.balls[0]!;
		const startPhysics = toPhysics({ x: 114, y: 378, z: 13.5 });
		ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
		ball.hit.vel.set(0, -(300 / (MM_PER_VU * 100)), 0); // table +y (north) is physics -y

		let makeTick: number | null = null;
		for (let i = 0; i < 10 && makeTick === null; i++) {
			tick += 1;
			const stepResult = machine.step(tick, NO_FRAME, []);
			for (const edge of stepResult.switchEvents) {
				if (edge.switch === 's_sling_l' && edge.closed) {
					makeTick = tick;
				}
				expect(edge.switch === 's_sling_l' ? edge.closed : true, 's_sling_l must not BREAK before the kick -- see this test\'s own assertion below').toBe(true);
			}
		}
		expect(makeTick, 's_sling_l must have made within the drive window').not.toBeNull();

		// Immediately teleport to the east-edge contact point (well within
		// standup's own 8-tick settle window) and deliver the kick.
		teleportWestward(machine, EAST_EDGE_CONTACT_MM, 800);
		tick += 1;
		const kickTick = tick;
		const kickResult = machine.step(kickTick, NO_FRAME, []);

		expect(kickTick - makeTick!, 'sanity: the kick must land well inside the standup settle window (8 ticks)').toBeLessThan(8);
		expect(
			kickResult.switchEvents.some((e) => e.switch === 's_sling_l' && !e.closed),
			's_sling_l must NOT have broken on the kick tick itself',
		).toBe(false);
		expect(kickResult.contactEvents.filter((c) => c.kind === 'coil_fire' && c.device === 'c_sling_l'), 'the kick fires on the same tick').toHaveLength(1);
	});

	it('Integration AC (sling half): a kick fired through the real host seam (createLoop().advance()) is observable in FrameOutput.contactEvents, the same object src/host/loop.ts hands to onFrame', () => {
		// createLoop() offers no seam to place a ball at a controlled velocity
		// (test/elasticity-falloff.test.ts's own header states this plainly),
		// so a device's own eject pose -- a real, declared field of the
		// collision document -- is overridden in a CLONE, never the committed
		// file, exactly like this project's own "mutate a copy" testing
		// convention (Rule 19).
		const doc = JSON.parse(JSON.stringify(loadDoc())) as { devices: Array<{ name: string; ejectPose: unknown }> };
		doc.devices.find((d) => d.name === 'bd_trough')!.ejectPose = { posMm: EAST_EDGE_CONTACT_MM, dir: { x: -1, y: 0, z: 0 } };
		const tuning = resolveTuning({ ...TUNING, troughEjectSpeedMmPerS: { ...TUNING.troughEjectSpeedMmPerS, value: 800 } });

		const loop = createLoop({ collisionDoc: doc, tuning });
		loop.pulseCoil('c_trough_eject');
		const out = loop.advance(1, []);

		const coilFires = out.contactEvents.filter((c) => c.kind === 'coil_fire' && c.device === 'c_sling_l');
		expect(coilFires, 'the coil_fire must reach FrameOutput.contactEvents, not only MachineStepResult').toHaveLength(1);
		expect(out.snapshot.balls[0]!.speed, 'the outgoing speed observed at this SAME outer surface also shows the kick').toBeGreaterThan(800);
	});
});
