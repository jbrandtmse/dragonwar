// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.2's I/O matrix, pop-bumper rows (AC 2, AC 3, Integration AC,
// DW-148): "Pop kick, enabled" / "Pop, inside the settle window" / "Pop
// disabled" / "Pop skirt closed, no ball resolvable", plus the Integration
// AC's own claim for this device and DW-148's own strand.
//
// The pop is a SKIRT device (spec Code Map): its trigger is the switch edge
// `switches.ts`'s tracker produces, never a col_ contact, so "the impulse
// changed the ball's velocity" is proven by an A/B comparison against a
// DISABLED control run under otherwise byte-identical conditions -- with the
// coil disabled there is no collision at the switch-make tick at all (the
// ball is still ~38 mm short of `col_pop_1`'s own octagon), so ANY velocity
// delta in the enabled run is the impulse and nothing else (Anti-vacuity
// trap 2's "a speed-only check cannot distinguish a kick from a bounce" does
// not even apply here: there is no bounce to confuse it with).
//
// This file's own "pinnedBy" target for `machine.ts`'s
// `SWITCH_EDGE_HARDWARE_RULES` manifest (`test/hardware-rule-seam.test.ts`).
//
// Falsifiability (Rule 19, this story's own Verification section):
// mutation 1: TUNING.hardware.popKickMmPerS -> 0 -> the enabled-kick test's
// velocity-delta assertion goes red naming the (now zero) delta, while
// s_pop_1 still closes. mutation 2: in switches.ts, change the break gate
// from `elapsedTicks >= tracked.settleTicks - 1` to `>= tracked.settleTicks`
// -> the settle-window test's "no second make" assertion goes red at a named
// tick (and `test/cabinet-switch-tracker-agreement.test.ts` goes red
// separately, since only one of the two parallel trackers moved).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop } from '../src/sim/loop';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { createPopMechanics, type PopCoilName } from '../src/sim/physics/pops';
import { createSwitchTracker } from '../src/sim/physics/switches';
import { loadCollision } from '../src/sim/physics/loader';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { toPhysics, MM_PER_VU } from '../src/sim/table/frames';
import { NO_FRAME } from '../src/sim/loop';
import { switchZoneMm } from './util/collision-doc';
import type { Ball } from '../src/sim/physics/ball/ball';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

const POP_1_ENTRY_MM = { x: 130, y: 700, z: 13.5 };
const POP_1_ENTRY_SPEED_MM_PER_S = 1000;

function bootMachine(): { machine: Machine; tick: number } {
	const machine = createMachine(loadDoc(), resolveTuning());
	let tick = 0;
	for (let i = 0; i < 320; i++) {
		tick += 1;
		machine.step(tick, NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : []);
	}
	return { machine, tick };
}

/** Drives the served ball on a straight roll toward `sw_pop_1` (pop-bumper-1's own release, already proven by `test/shot-routing.test.ts`'s own passing "pop 1" case) until the FIRST tick that produces an `s_pop_1` make edge; returns that tick's own step result and the velocity immediately before it. */
function driveToFirstPopMake(machine: Machine, startTick: number): { tick: number; beforeVel: { x: number; y: number; z: number }; result: ReturnType<Machine['step']> } {
	const ball = machine.balls[0]!;
	const startPhysics = toPhysics(POP_1_ENTRY_MM);
	ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
	ball.hit.vel.set(0, -(POP_1_ENTRY_SPEED_MM_PER_S / (MM_PER_VU * 100)), 0);

	let tick = startTick;
	for (let i = 0; i < 200; i++) {
		tick += 1;
		const beforeVel = { x: ball.hit.vel.x, y: ball.hit.vel.y, z: ball.hit.vel.z };
		const result = machine.step(tick, NO_FRAME, []);
		if (result.switchEvents.some((e) => e.switch === 's_pop_1' && e.closed)) {
			return { tick, beforeVel, result };
		}
	}
	throw new Error('driveToFirstPopMake(): s_pop_1 never made within the drive window -- test fixture is broken');
}

function speedVuPerT(vel: { x: number; y: number; z: number }): number {
	return Math.hypot(vel.x, vel.y, vel.z);
}

describe('sim/physics/pops.ts -- the pop-bumper hardware rule (AD-5, AD-2, AC 2, AC 3, DW-148)', () => {
	it('AC 2: enabled -- s_pop_1 makes, an impulse changes the ball\'s velocity on the SAME tick, exactly one coil_fire for c_pop_1, and the geometric witness confirms the ball is inside sw_pop_1', () => {
		const { machine, tick: bootTick } = bootMachine();
		const { tick: kickTick, beforeVel, result } = driveToFirstPopMake(machine, bootTick);

		const ball = machine.balls[0]!;
		const afterVel = { x: ball.hit.vel.x, y: ball.hit.vel.y, z: ball.hit.vel.z };
		const afterMm = { x: ball.state.pos.x * MM_PER_VU, y: 1066.8 - ball.state.pos.y * MM_PER_VU };

		// Geometric witness (Anti-vacuity trap 1): the ball is genuinely
		// inside sw_pop_1's own zone, not merely near a neighbour's.
		const zone = switchZoneMm('sw_pop_1');
		expect(afterMm.x, 'ball must be inside sw_pop_1 (x)').toBeGreaterThanOrEqual(zone.minMm.x);
		expect(afterMm.x).toBeLessThanOrEqual(zone.maxMm.x);
		expect(afterMm.y, 'ball must be inside sw_pop_1 (y)').toBeGreaterThanOrEqual(zone.minMm.y);
		expect(afterMm.y).toBeLessThanOrEqual(zone.maxMm.y);

		// The impulse genuinely changed the ball's velocity on this same
		// tick -- not merely "a switch closed somewhere".
		const delta = Math.hypot(afterVel.x - beforeVel.x, afterVel.y - beforeVel.y, afterVel.z - beforeVel.z);
		expect(delta, 'the kick must measurably change the velocity').toBeGreaterThan(1);

		const coilFires = result.contactEvents.filter((c) => c.kind === 'coil_fire' && c.device === 'c_pop_1');
		expect(coilFires, 'exactly one coil_fire for c_pop_1 on the make tick').toHaveLength(1);
		expect(coilFires[0]!.tick).toBe(kickTick);
		expect(coilFires[0]!.surface).toBe('bumper');
	});

	it('I/O matrix "Pop disabled": s_pop_1 still makes, but zero velocity change and zero coil_fire -- the ball bounces off col_pop_1 as a plain wall', () => {
		const { machine, tick: bootTick } = bootMachine();
		let tick = bootTick;
		tick += 1;
		machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_pop_1', action: 'disable', tick }]);

		const { beforeVel, result } = driveToFirstPopMake(machine, tick);
		const ball = machine.balls[0]!;
		const afterVel = { x: ball.hit.vel.x, y: ball.hit.vel.y, z: ball.hit.vel.z };
		const delta = Math.hypot(afterVel.x - beforeVel.x, afterVel.y - beforeVel.y, afterVel.z - beforeVel.z);

		expect(result.switchEvents.some((e) => e.switch === 's_pop_1' && e.closed), 'the skirt is not the coil -- s_pop_1 still closes').toBe(true);
		expect(result.contactEvents.filter((c) => c.kind === 'coil_fire'), 'disabled: zero coil_fire').toHaveLength(0);
		expect(delta, 'disabled: no impulse -- only ordinary per-tick gravity/friction drift, nowhere near a real kick').toBeLessThan(1);
	});

	it('Integration AC (pop half): a kick fired through the real host seam (createLoop().advance()) is observable in FrameOutput.contactEvents', () => {
		const doc = JSON.parse(JSON.stringify(loadDoc())) as { devices: Array<{ name: string; ejectPose: unknown }> };
		doc.devices.find((d) => d.name === 'bd_trough')!.ejectPose = { posMm: POP_1_ENTRY_MM, dir: { x: 0, y: 1, z: 0 } };
		const tuning = resolveTuning({ ...TUNING, troughEjectSpeedMmPerS: { ...TUNING.troughEjectSpeedMmPerS, value: POP_1_ENTRY_SPEED_MM_PER_S } });

		const loop = createLoop({ collisionDoc: doc, tuning });
		loop.pulseCoil('c_trough_eject');
		const allContacts: Array<{ readonly kind: string; readonly device?: string }> = [];
		for (let i = 0; i < 100; i++) {
			const out = loop.advance(1, []);
			allContacts.push(...out.contactEvents);
		}
		const coilFires = allContacts.filter((c) => c.kind === 'coil_fire' && c.device === 'c_pop_1');
		expect(coilFires, 'the coil_fire must reach FrameOutput.contactEvents, not only MachineStepResult').toHaveLength(1);
	});

	it('DW-148: a ball released at rest directly above col_pop_1 is kicked clear of sw_pop_1 (assertNotStranded\'s own trailing-window progress, measured through the real pipeline) -- see also test/shot-routing.test.ts\'s "descend-pop-1" case', () => {
		const { machine, tick: bootTick } = bootMachine();
		const ball = machine.balls[0]!;
		const startPhysics = toPhysics({ x: 130, y: 850, z: 13.5 });
		ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
		ball.hit.vel.set(0, 0, 0);

		let tick = bootTick;
		const samples: { tick: number; x: number; y: number }[] = [];
		for (let i = 0; i < 6600; i++) {
			tick += 1;
			machine.step(tick, NO_FRAME, []);
			const b = machine.balls[0];
			if (!b) {
				break;
			}
			samples.push({ tick, x: b.state.pos.x * MM_PER_VU, y: 1066.8 - b.state.pos.y * MM_PER_VU });
		}

		expect(samples.length, 'sanity: the ball must still be simulated (not drained) for this to measure anything').toBeGreaterThan(2);
		const last = samples[samples.length - 1]!;
		let windowStart = samples[0]!;
		for (const s of samples) {
			if (last.tick - s.tick <= 500) {
				windowStart = s;
				break;
			}
		}
		const trailingProgressMm = Math.hypot(last.x - windowStart.x, last.y - windowStart.y);
		expect(trailingProgressMm, `net positional progress over the final 500 ticks was only ${trailingProgressMm.toFixed(2)} mm -- the ball is stranded, DW-148 not closed`).toBeGreaterThan(15);
	});
});

describe('sim/physics/pops.ts -- I/O matrix edge cases (unit-level, matching test/switch-zones.test.ts\'s own direct-driving style)', () => {
	function realPopMechanicsAndZones() {
		const tuning = resolveTuning();
		const loaded = loadCollision(loadDoc(), tuning);
		const popMechanics = createPopMechanics({ switchZones: loaded.switchZones, popCentroidsMm: loaded.popCentroidsMm, tuning });
		const switchTracker = createSwitchTracker(loaded.switchZones, tuning);
		return { popMechanics, switchTracker, loaded };
	}

	const ENABLED: Readonly<Record<PopCoilName, boolean>> = { c_pop_1: true, c_pop_2: true, c_pop_3: true };

	it('I/O matrix "Pop, inside the settle window": a ball that exits and re-enters within bumper_skirt\'s 2-tick settle window produces no second make edge and therefore no second kick', () => {
		const { popMechanics, switchTracker } = realPopMechanicsAndZones();
		const zone = switchZoneMm('sw_pop_1');
		const insideMm = { x: (zone.minMm.x + zone.maxMm.x) / 2, y: (zone.minMm.y + zone.maxMm.y) / 2, z: 15 };
		const outsideMm = { x: insideMm.x, y: zone.minMm.y - 20, z: 15 };

		// A fake ball, structurally enough like the real one for
		// applyPostSwitchEdges() to read (.ball.id, .ball.hit.vel.add()) and
		// for the caller to inspect afterwards -- matching
		// test/switch-zones.test.ts's own hand-crafted BallMovement style,
		// one level up (this file also needs a `ball` reference, which that
		// file's own switchTracker-only test does not).
		const fakeBall = { id: 0, hit: { vel: { x: 0, y: 0, z: 0, add(v: { x: number; y: number; z: number }) { this.x += v.x; this.y += v.y; this.z += v.z; } } } } as unknown as Ball;

		// Tick 1: enters the zone -- a genuine make.
		let tick = 1;
		let edges = switchTracker.step(tick, [{ before: outsideMm, after: insideMm }]);
		let movements = [{ ball: fakeBall, beforeMm: outsideMm, afterMm: insideMm }];
		let result = popMechanics.applyPostSwitchEdges(tick, edges, movements, ENABLED);
		expect(edges, 'sanity: tick 1 must be a genuine make').toEqual([{ type: 'switch', switch: 's_pop_1', closed: true, tick: 1 }]);
		expect(result.contactEvents, 'the first entry kicks').toHaveLength(1);

		// Tick 2: exits (raw becomes false, pendingSince = 2 -- one
		// consecutive outside tick, one short of bumper_skirt's settleTicks=2).
		tick = 2;
		edges = switchTracker.step(tick, [{ before: insideMm, after: outsideMm }]);
		movements = [{ ball: fakeBall, beforeMm: insideMm, afterMm: outsideMm }];
		result = popMechanics.applyPostSwitchEdges(tick, edges, movements, ENABLED);
		expect(edges, 'no edge yet -- the break has not settled').toEqual([]);
		expect(result.contactEvents).toHaveLength(0);

		// Tick 3: re-enters BEFORE the break would have settled -- raw
		// returns to `reported` (true), so the pending break is CANCELLED
		// outright (switches.ts's own :112-120), never emitting a
		// closed:false/closed:true pair. No new make means no new kick.
		tick = 3;
		edges = switchTracker.step(tick, [{ before: outsideMm, after: insideMm }]);
		movements = [{ ball: fakeBall, beforeMm: outsideMm, afterMm: insideMm }];
		result = popMechanics.applyPostSwitchEdges(tick, edges, movements, ENABLED);
		expect(edges, 're-entry inside the settle window produces NO edge at all').toEqual([]);
		expect(result.contactEvents, 'and therefore no second kick').toHaveLength(0);
	});

	it('I/O matrix "Pop skirt closed, no ball resolvable": a make edge with no ball inside its own zone fails loudly rather than kicking an arbitrary ball or silently passing', () => {
		const { popMechanics } = realPopMechanicsAndZones();
		const fakeMakeEdge = [{ type: 'switch' as const, switch: 's_pop_1' as const, closed: true, tick: 1 }];
		// No movements at all -- the degenerate "no ball resolvable" case.
		expect(() => popMechanics.applyPostSwitchEdges(1, fakeMakeEdge, [], ENABLED)).toThrowError(/no ball's swept segment lies inside its own zone/);
	});

	// Code review finding, this pass: every prior test above drives only
	// c_pop_1, and always from a position dead-centre on col_pop_1's own x
	// (POP_1_ENTRY_MM.x === col_pop_1's own centroid x), so the tie-break
	// branch (POP_KICK_TIE_BREAK_MM) is the only path any test exercised --
	// the real dx/dy computation (":186" in pops.ts) and c_pop_2/c_pop_3's
	// own wiring were both unverified. This closes both gaps in one pass,
	// derived from TABLE.popWiring's own key set (DW-149), never a
	// hand-typed coil list.
	it.each(Object.keys(TABLE.popWiring) as PopCoilName[])(
		'wiring + kick direction (%s): a genuinely off-axis approach fires ONLY its OWN coil and kicks AWAY from its OWN centroid -- proving the real dx/dy path, not just the on-axis tie-break',
		(coil) => {
			const { popMechanics, switchTracker, loaded } = realPopMechanicsAndZones();
			const switchName = TABLE.popWiring[coil].switch;
			const zone = loaded.switchZones.find((z) => z.switch === switchName);
			if (!zone) {
				throw new Error(`test fixture is broken: no loaded switch zone for "${switchName}"`);
			}
			const centroid = loaded.popCentroidsMm[coil];

			// A position clamped inside this device's own zone AND offset
			// from its OWN centroid on both axes -- never the exact-zero
			// case POP_KICK_TIE_BREAK_MM exists for.
			const insideMm = {
				x: Math.min(Math.max(centroid.x + 15, zone.minMm.x + 2), zone.maxMm.x - 2),
				y: Math.min(Math.max(centroid.y + 10, zone.minMm.y + 2), zone.maxMm.y - 2),
				z: 15,
			};
			// Approach from the WEST (x decreasing toward the zone), holding
			// y fixed at insideMm.y -- not from the south. sw_pop_2/sw_pop_3
			// genuinely overlap in a small x[192,218]/y[832,838] corner (the
			// committed geometry), so a south-approaching sweep for c_pop_3
			// clips straight through sw_pop_2's own box and produces a
			// spurious second make; approaching along x at a y already
			// outside every OTHER pop's own y-range avoids every sibling
			// zone's bbox, for all three coils.
			const outsideMm = { x: zone.minMm.x - 20, y: insideMm.y, z: 15 };
			const fakeBall = { id: 0, hit: { vel: { x: 0, y: 0, z: 0, add(v: { x: number; y: number; z: number }) { this.x += v.x; this.y += v.y; this.z += v.z; } } } } as unknown as Ball;

			const tick = 1;
			const edges = switchTracker.step(tick, [{ before: outsideMm, after: insideMm }]);
			const movements = [{ ball: fakeBall, beforeMm: outsideMm, afterMm: insideMm }];
			const result = popMechanics.applyPostSwitchEdges(tick, edges, movements, ENABLED);

			expect(edges, `sanity: ${switchName} must genuinely make at this position`).toEqual([{ type: 'switch', switch: switchName, closed: true, tick }]);
			expect(result.contactEvents.map((c) => c.device), `exactly one coil_fire, and it must be ${coil} -- never a sibling pop`).toEqual([coil]);

			// Direction: the velocity change must point AWAY from THIS
			// device's own centroid (positive dot product with the ball's
			// own offset), not toward it and not along the wrong axis --
			// this is what a sign/axis regression in pops.ts's dx/dy
			// computation, or a tie-break floor that over-widens a real
			// small offset, would break.
			const offset = { x: insideMm.x - centroid.x, y: insideMm.y - centroid.y };
			const dot = fakeBall.hit.vel.x * offset.x + fakeBall.hit.vel.y * offset.y;
			expect(dot, "the kick must be directed away from this device's own centroid (positive dot product with the ball's own offset)").toBeGreaterThan(0);
		},
	);
});
