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
// `col_sling_r` is different and gets its OWN kick test (added by this
// story's code review): its south face is genuinely unobstructed -- a
// node-set sweep of the committed document over x [318.4, 384.4],
// y [360, 420] finds only `col_guide_inlane_r`, entirely east of the face --
// so the right sling is proven on its real rubber face, not a proxy.
//
// The switch-timing half ("s_sling_l is reported closed on the kick tick")
// is proven separately, by driving the ball through `sw_sling_l`'s own zone
// (which leads contact, spec Code Map), holding it there for a real
// multi-tick gap, and then teleporting it to the east-edge contact point
// while `standup`'s settle window -- DERIVED from `resolveTuning()`, never
// hand-typed -- still holds the switch closed. Both phases use the same
// `createMachine()` + direct `ball.state.pos.set()`/`ball.hit.vel.set()`
// teleport `test/elasticity-falloff.test.ts` already establishes as this
// codebase's own answer to "createLoop() gives no seam to place a ball at a
// controlled velocity."
//
// Falsifiability (Rule 19, this story's own Verification section):
// mutation 1: TUNING.hardware.slingshotForce -> 0 -> the enabled-kick test's
// outgoing/incoming ratio assertion goes red naming the measured ratio,
// while the ball still rebounds (the contact itself is unaffected). mutation
// 2: buffer the sling's own contactEvents push by one tick in machine.ts ->
// the same-tick assertion (kick tick === contact-event tick === switch-still-
// closed tick) goes red naming both ticks.
// Added by this story's code review, both applied and observed red in an
// isolated copy, then reverted: mutation 3: point SLING_NODE_BY_COIL's
// c_sling_r at col_sling_l -> the right-sling test goes red naming the coil
// (before it existed, this mutation reddened only the LEFT sling's tests --
// nothing pinned c_sling_r's own kick directly). mutation 4: write
// `isDisabled = false` in machine.ts's disable mirror -> AC 3's test goes
// red; note that AC 3's own "zero coil_fire" + "slower than incoming"
// assertions are BOTH satisfied by a clean miss (measured: 795.9 vs 800.0
// in open field), which is why that test now also carries a contact witness
// and a rebound-direction assertion.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { resolveTuning, TUNING, type ResolvedTuning } from '../src/sim/table/tuning';
import { toPhysics, MM_PER_VU } from '../src/sim/table/frames';
import { distanceToPolygonMm } from './util/plan-geometry';
import { readCollisionDoc } from './util/collision-doc';
import type { CoilCommand } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** `col_sling_l`'s own committed footprint (table-frame mm) -- the geometric witness every kick assertion below is paired against, never a switch edge alone (this story's spec, "Anti-vacuity" trap 1). */
const SLING_L_FOOTPRINT = readCollisionDoc().nodes.find((n) => n.name === 'col_sling_l')!.footprintMm!;
/** `col_sling_r`'s own committed footprint -- the same geometric witness for the right sling's own kick test (code review, this pass). */
const SLING_R_FOOTPRINT = readCollisionDoc().nodes.find((n) => n.name === 'col_sling_r')!.footprintMm!;
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

		// Code review, this pass: the two assertions above are BOTH satisfied
		// by a clean MISS, so on their own they are not evidence of a disabled
		// coil. Measured directly against this same machine -- a ball
		// teleported to open field at (250, 600) and stepped once with the
		// coil left ENABLED reports `coil_fire 0` and `outgoing 795.9 <
		// incoming 800.0` (gravity and roll friction net out slightly
		// negative), i.e. it passes both. The story's own Anti-vacuity trap 1
		// ("a coil_fire count is not evidence that the intended body was
		// struck") applies in its negative form too: zero coil_fire is not
		// evidence that the intended body was struck AND stayed passive. Pin
		// the contact itself, exactly as AC 1's own half does.
		const disabledBall = machine.balls[0]!;
		const disabledPosMm = { x: disabledBall.state.pos.x * MM_PER_VU, y: 1066.8 - disabledBall.state.pos.y * MM_PER_VU };
		expect(
			distanceToPolygonMm(disabledPosMm.x, disabledPosMm.y, SLING_L_FOOTPRINT) - BALL_RADIUS_MM,
			'disabled: the ball must genuinely be at contact distance of col_sling_l -- otherwise "no coil_fire" only proves it never arrived',
		).toBeLessThanOrEqual(3);
		expect(
			disabledBall.hit.vel.x,
			'disabled: the ball must have REBOUNDED (physics +x, i.e. back east) off the east face -- a miss keeps travelling west',
		).toBeGreaterThan(0);
		expect(
			disabledOutgoing,
			'disabled: the rebound must be a real elastic response (rubber_band elasticity 0.3 of an 800 mm/s approach), not a graze and not a stop',
		).toBeGreaterThan(100);

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

		// Code review, this pass: the previous version of this block carried
		// three assertions that could not fail -- `edge.switch === 's_sling_l'
		// ? edge.closed : true` was literally `expect(true).toBe(true)` for
		// every other switch; the loop exited on the make tick, so
		// `kickTick - makeTick` was arithmetically ALWAYS 1 and `< 8` could
		// never fail; and with exactly one outside tick elapsed a break edge
		// at the kick tick was arithmetically impossible. Rebuilt so all
		// three are real: EVERY s_sling_l edge across the whole span is
		// accumulated (a break anywhere fails), the settle window is DERIVED
		// from `resolveTuning()` rather than the hand-typed 8, and the gap
		// between the make and the kick is deliberately driven out to
		// `settleTicks - 1` so "still inside the window" is a claim that a
		// one-tick change to the window would actually break.
		const settleTicks = resolveTuning().switchSettleTicksByClass.standup.value;
		expect(settleTicks, "sanity: this pin is only meaningful while standup has a settle window wide enough to hold a gap").toBeGreaterThan(2);

		const slingEdges: { tick: number; closed: boolean }[] = [];
		const recordEdges = (stepResult: ReturnType<Machine['step']>, at: number): void => {
			for (const edge of stepResult.switchEvents) {
				if (edge.switch === 's_sling_l') {
					slingEdges.push({ tick: at, closed: edge.closed });
				}
			}
		};

		let makeTick: number | null = null;
		for (let i = 0; i < 10 && makeTick === null; i++) {
			tick += 1;
			const stepResult = machine.step(tick, NO_FRAME, []);
			recordEdges(stepResult, tick);
			if (stepResult.switchEvents.some((e) => e.switch === 's_sling_l' && e.closed)) {
				makeTick = tick;
			}
		}
		expect(makeTick, 's_sling_l must have made within the drive window').not.toBeNull();

		// Hold the ball inside the zone for a REAL gap -- the sling's zone
		// leads contact by up to 26.5 mm (spec Code Map), so a genuine
		// make-to-kick gap is what AC 1's "still reported closed" claim is
		// about. Driving it out to settleTicks - 1 makes the window
		// assertion below falsifiable in both directions.
		for (let i = 0; i < settleTicks - 2; i++) {
			tick += 1;
			recordEdges(machine.step(tick, NO_FRAME, []), tick);
		}

		// Now teleport to the east-edge contact point and deliver the kick.
		teleportWestward(machine, EAST_EDGE_CONTACT_MM, 800);
		tick += 1;
		const kickTick = tick;
		const kickResult = machine.step(kickTick, NO_FRAME, []);
		recordEdges(kickResult, kickTick);

		const gap = kickTick - makeTick!;
		expect(gap, 'the make-to-kick gap must be a REAL multi-tick gap, not the trivial next tick').toBeGreaterThanOrEqual(2);
		expect(gap, `the kick must still land inside standup's own derived settle window (${settleTicks} ticks), which is what keeps s_sling_l reported closed`).toBeLessThan(settleTicks);

		// "Reported closed at the kick tick" == a make edge at makeTick and
		// NO break edge anywhere from there through the kick tick inclusive.
		expect(slingEdges, `s_sling_l's edge stream across the whole span must be exactly one make at tick ${makeTick} and nothing else`).toEqual([{ tick: makeTick, closed: true }]);
		expect(kickResult.contactEvents.filter((c) => c.kind === 'coil_fire' && c.device === 'c_sling_l'), 'the kick fires on the same tick').toHaveLength(1);
	});

	// Code review, this pass. The frontmatter `deferred:` item claiming
	// col_sling_r needs "the same measured investigation" col_sling_l did
	// rests on a false premise: col_sling_l's south face IS shadowed (by
	// col_post_sling_l, x [110,118] y [416,424], sitting directly on it),
	// which is why AC 1 above had to fall back to the east edge -- but a
	// node-set sweep of the committed document over col_sling_r's own south
	// band (x [318.4, 384.4], y [360, 420]) finds only col_guide_inlane_r at
	// x [370.4, 382.4], entirely EAST of the face. col_sling_r's south face
	// is therefore unobstructed and needs no investigation at all. Worth
	// closing rather than deferring: mutating SLING_NODE_BY_COIL so
	// c_sling_r silently loses its own body reddened only col_sling_l's own
	// tests (measured in an isolated copy), so before this test nothing
	// pinned the right sling's kick directly -- its only coverage was
	// test/shot-reachability.test.ts's descend-ramp-wall-r-cap verdict,
	// which sits 3.011 mm inside its own tolerance.
	it('AC 1 (right sling): col_sling_r kicks on its own unobstructed south face, firing its OWN coil c_sling_r and no other', () => {
		const { machine, tick: bootTick } = bootMachine();

		// col_sling_r's south face is y = 420, x [332.4, 370.4]. Approach
		// from due south at mid-face, one tenth of a mm outside contact.
		const contactMm = { x: 351.4, y: 420 - BALL_RADIUS_MM - 0.1, z: 13.5 };
		const ball = machine.balls[0]!;
		const startPhysics = toPhysics(contactMm);
		ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
		// Table +y (north, into the face) is physics -y.
		ball.hit.vel.set(0, -(800 / (MM_PER_VU * 100)), 0);
		const incomingSpeed = speedMmPerS(ball.hit.vel);

		const result = machine.step(bootTick + 1, NO_FRAME, []);
		const outgoingSpeed = speedMmPerS(machine.balls[0]!.hit.vel);
		const afterMm = { x: machine.balls[0]!.state.pos.x * MM_PER_VU, y: 1066.8 - machine.balls[0]!.state.pos.y * MM_PER_VU };

		expect(
			distanceToPolygonMm(afterMm.x, afterMm.y, SLING_R_FOOTPRINT) - BALL_RADIUS_MM,
			'the ball must be at contact distance of col_sling_r itself, not a neighbouring body',
		).toBeLessThanOrEqual(3);
		expect(outgoingSpeed, `outgoing (${outgoingSpeed.toFixed(1)}) must exceed incoming (${incomingSpeed.toFixed(1)})`).toBeGreaterThan(incomingSpeed);
		expect(outgoingSpeed, 'the kick must not be an absurd, unbounded impulse').toBeLessThan(incomingSpeed * 5);

		const fires = result.contactEvents.filter((c) => c.kind === 'coil_fire');
		expect(fires.map((c) => c.device), 'exactly one coil_fire, and it must be c_sling_r -- never the left sling').toEqual(['c_sling_r']);
		expect(fires[0]!.surface).toBe('rubber_band');
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
