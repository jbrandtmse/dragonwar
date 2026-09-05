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
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { createPopMechanics, type PopCoilName } from '../src/sim/physics/pops';
import { createSwitchTracker } from '../src/sim/physics/switches';
import { loadCollision } from '../src/sim/physics/loader';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { toPhysics, MM_PER_VU } from '../src/sim/table/frames';
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

	// Code review, this pass: AC 3's final clause is "re-enabling restores
	// both kicks", and `test/slingshot.test.ts` proved it for the sling --
	// but `grep -n "coil: 'c_pop"` over the whole `test/` tree matched
	// exactly ONE line before this test existed (the `disable` above), so a
	// defect that made `disable` PERMANENT for a pop coil shipped green.
	// Drives the same approach three times through the real machine --
	// enabled, disabled, re-enabled -- so the restored kick is measured
	// against this device's own two other states rather than an absolute.
	it('AC 3 (pop half): re-enabling c_pop_1 restores the kick -- the same drive kicks, then does not while disabled, then kicks again', () => {
		const { machine, tick: bootTick } = bootMachine();
		let tick = bootTick;

		const kickDelta = (): number => {
			const { tick: madeAt, beforeVel, result } = driveToFirstPopMake(machine, tick);
			tick = madeAt;
			const v = machine.balls[0]!.hit.vel;
			return Math.hypot(v.x - beforeVel.x, v.y - beforeVel.y, v.z - beforeVel.z) * (result.contactEvents.some((c) => c.kind === 'coil_fire' && c.device === 'c_pop_1') ? 1 : -1);
		};

		const enabledFirst = kickDelta();
		expect(enabledFirst, 'baseline: the coil starts enabled and kicks, with its own coil_fire').toBeGreaterThan(1);

		tick += 1;
		machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_pop_1', action: 'disable', tick }]);
		const whileDisabled = kickDelta();
		expect(whileDisabled, 'disabled: no kick and no coil_fire (a negative value here is the "no coil_fire" marker, not a reversed impulse)').toBeLessThan(1);

		tick += 1;
		machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_pop_1', action: 'enable', tick }]);
		const afterReEnable = kickDelta();
		expect(afterReEnable, 're-enabled: the kick is restored, with its own coil_fire back').toBeGreaterThan(1);
		// Two-sided (this story's own Anti-vacuity trap 2): the restored kick
		// is the SAME kick, not a larger accumulated one -- a disable that
		// merely buffered its impulses would show up here.
		expect(Math.abs(afterReEnable - enabledFirst), 'the restored kick matches the original in magnitude -- a disable must drop its impulses, never queue them').toBeLessThan(0.5);
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

	// DERIVED from TABLE.popWiring's own key set (DW-149, code review this
	// pass -- this was a hand-typed three-coil literal sitting ~100 lines
	// above the `it.each` block whose own comment defends deriving the very
	// same set). A fourth pop bumper is now covered here automatically too.
	const ENABLED: Readonly<Record<PopCoilName, boolean>> = Object.fromEntries(
		(Object.keys(TABLE.popWiring) as PopCoilName[]).map((coil) => [coil, true]),
	) as Readonly<Record<PopCoilName, boolean>>;

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

	// QA pass (Story 2.2 code review finding): the settle-window test above
	// only drives ONE consecutive outside tick before re-entering, so it
	// never reaches the tick where AD-2's amended break gate
	// (`elapsedTicks >= tracked.settleTicks - 1`, Story 2.1d's DW-67
	// residual fix) and the pre-fix formula (`elapsedTicks >=
	// tracked.settleTicks`) actually disagree -- confirmed empirically:
	// re-running that exact test under the reverted (pre-fix) formula still
	// passes unchanged, so it is NOT this AC's own off-by-one pin, even
	// though the spec's own Verification section names it as one half of
	// this mutation's evidence (the other half,
	// test/cabinet-switch-tracker-agreement.test.ts, DOES redden). This
	// test closes that gap with the same "one tick early, one tick late"
	// shape test/switch-zones.test.ts's own off-by-one guards already use,
	// scoped to bumper_skirt's own settleTicks value (derived from
	// `resolveTuning()`, never hand-typed, DW-149) so a future change to
	// that class's tuning value is covered automatically.
	it("AD-2 off-by-one pin: bumper_skirt's break fires on EXACTLY the settleTicks-th consecutive outside tick -- not one early, not one late", () => {
		const tuning = resolveTuning();
		const settleTicks = tuning.switchSettleTicksByClass.bumper_skirt.value;
		expect(settleTicks, 'sanity: this pin is only meaningful while bumper_skirt has a non-trivial settle window').toBeGreaterThan(1);

		const { switchTracker } = realPopMechanicsAndZones();
		const zone = switchZoneMm('sw_pop_1');
		const insideMm = { x: (zone.minMm.x + zone.maxMm.x) / 2, y: (zone.minMm.y + zone.maxMm.y) / 2, z: 15 };
		const outsideMm = { x: insideMm.x, y: zone.minMm.y - 20, z: 15 };

		// Tick 1: make.
		expect(switchTracker.step(1, [{ before: outsideMm, after: insideMm }]), 'sanity: tick 1 must be a genuine make').toEqual([
			{ type: 'switch', switch: 's_pop_1', closed: true, tick: 1 },
		]);

		// Ticks 2 .. settleTicks: consecutive outside ticks, one short of the
		// settle window each time -- the break must NOT fire on any of them.
		for (let tick = 2; tick < 1 + settleTicks; tick++) {
			const edges = switchTracker.step(tick, [{ before: outsideMm, after: outsideMm }]);
			expect(edges, `tick ${tick}: one tick early -- the break must not fire before the ${settleTicks}-th consecutive outside tick`).toEqual([]);
		}

		// Tick (1 + settleTicks): the settleTicks-th consecutive outside tick
		// -- AD-2's amended text exactly ("the number of ticks the zone test
		// must read outside before closed: false is emitted"). The mutated
		// (pre-DW-67-residual-fix) gate `elapsedTicks >= settleTicks` would
		// only fire here one tick LATE, at `2 + settleTicks` -- confirmed by
		// hand-applying that exact mutation to switches.ts, observing this
		// assertion redden naming an empty array instead, and reverting
		// (`git status --short` / `git diff --stat` byte-identical
		// afterward).
		const settleTick = 1 + settleTicks;
		const settledEdges = switchTracker.step(settleTick, [{ before: outsideMm, after: outsideMm }]);
		expect(settledEdges, `tick ${settleTick}: the break must fire on EXACTLY the ${settleTicks}-th consecutive outside tick`).toEqual([
			{ type: 'switch', switch: 's_pop_1', closed: false, tick: settleTick },
		]);

		// One tick later: must not fire again (already settled).
		const afterEdges = switchTracker.step(settleTick + 1, [{ before: outsideMm, after: outsideMm }]);
		expect(afterEdges, 'one tick late: the break must not fire again once already settled').toEqual([]);
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
			// device's own centroid, not toward it and not along the wrong
			// axis -- this is what a sign/axis regression in pops.ts's dx/dy
			// computation, or a tie-break floor that over-widens a real
			// small offset, would break.
			//
			// FRAME (code review, this pass -- the previous version of this
			// block was measurably blind to the very regression it names).
			// `ball.hit.vel` is PHYSICS-frame: `toPhysics()` maps table +y to
			// physics -y (`frames.ts`, `y: (heightMm - v.y) / MM_PER_VU`), so
			// `tableSpeedToPhysicsVelocity()` returns a y component that is
			// the NEGATION of the table-frame one. `offset` below is
			// table-frame. Dotting the two frames directly puts the wrong
			// sign on the y term, which made the assertion decide on
			// `|offset.x| > |offset.y|` rather than on direction: with this
			// fixture's own (+15, +10) offset, inverting pops.ts's `dy` to
			// `device.centroidMm.y - resolved.afterMm.y` -- a full y-axis
			// sign inversion of the kick -- moved the mixed-frame dot from
			// +25.7 to +66.8 and the assertion passed MORE strongly
			// (reproduced twice, independently, in an isolated copy).
			// Converted back to one frame here, and asserted PER AXIS so a
			// single-axis inversion can never be masked by the other axis's
			// larger magnitude.
			const offset = { x: insideMm.x - centroid.x, y: insideMm.y - centroid.y };
			const kickTableFrame = { x: fakeBall.hit.vel.x, y: -fakeBall.hit.vel.y };

			expect(Math.sign(kickTableFrame.x), `the kick's x component must point away from ${coil}'s own centroid (offset.x = ${offset.x.toFixed(2)} mm)`).toBe(Math.sign(offset.x));
			expect(Math.sign(kickTableFrame.y), `the kick's y component must point away from ${coil}'s own centroid (offset.y = ${offset.y.toFixed(2)} mm)`).toBe(Math.sign(offset.y));

			const dot = kickTableFrame.x * offset.x + kickTableFrame.y * offset.y;
			expect(dot, "the kick must be directed away from this device's own centroid (positive table-frame dot product with the ball's own offset)").toBeGreaterThan(0);

			// MAGNITUDE (code review, this pass): a sign-only test also
			// cannot see `POP_KICK_TIE_BREAK_MM` growing until it dominates
			// ordinary off-centre approaches -- 5 -> 30 mm left every
			// assertion above green while silently overriding this fixture's
			// own real 15 mm offset. Pin the ANGLE instead: this offset is
			// comfortably clear of the floor, so the kick must lie along the
			// ball's own genuine radial, not along a tie-break-biased one.
			const offsetAngleDeg = (Math.atan2(offset.y, offset.x) * 180) / Math.PI;
			const kickAngleDeg = (Math.atan2(kickTableFrame.y, kickTableFrame.x) * 180) / Math.PI;
			expect(
				Math.abs(kickAngleDeg - offsetAngleDeg),
				`the kick's bearing (${kickAngleDeg.toFixed(2)} deg) must follow the ball's own radial from ${coil}'s centroid (${offsetAngleDeg.toFixed(2)} deg) -- a widened POP_KICK_TIE_BREAK_MM would bias it off-radial`,
			).toBeLessThan(1);
		},
	);
});

// ---------------------------------------------------------------------------
// QA pass (Story 2.2): AD-15 provenance -- TUNING.hardware.popKickMmPerS's
// own `source` string cited a floor ("below ~180 mm/s the DW-148 ball
// returns to a NEW, still-permanent equilibrium") and a ceiling ("above
// ~220 mm/s the extra energy sends a grazing ball into repeated cross-pop
// bouncing that exhausts the Top-lane cases' tick budget") that a re-sweep
// this pass could not reproduce -- DW-152's own class, a source string a
// re-run contradicted. Re-measured directly against the SAME (130, 850)
// DW-148 column (test/zz-investigation-sweep.test.ts, this pass's own
// throwaway harness, deleted before this pass ends -- these two tests are
// its permanent, corrected replacement):
//
//   - virtually any positive kick clears DW-148's own strand (progress
//     ~309 mm, measured down to 0.5 mm/s) -- there is no real floor beyond
//     "nonzero"; only 0 mm/s (no kick at all) reproduces the original
//     permanent rest point.
//   - a REAL, previously undocumented ceiling exists at 221 mm/s: a NEW
//     permanent equilibrium appears near (93, 840) mm -- just outside
//     sw_pop_1's own north edge (y = 838), a different location from the
//     original (130.00, 833.55) apex-vertex rest point -- and most values
//     re-measured from 221 through 300 mm/s re-strand there (one anomalous
//     escape at 245 mm/s -- the transition is a knife-edge, not a clean
//     step, so this pin sits well clear of it on both sides rather than
//     riding the exact boundary).
//   - the ORIGINAL ceiling reasoning (Top-lane cross-pop-bouncing tick-
//     budget exhaustion) is real but starts far higher (~425-600 mm/s,
//     per lane) than previously claimed, and is therefore NOT what bounds
//     the safe range from above -- the 221 mm/s DW-148 re-strand is. This
//     is not re-pinned here (out of this correction's own scope; the
//     corrected `source` string records the re-measured onsets for the
//     next person who touches this constant).
//
// NOT YET CORRECTED IN `tuning.ts` (code review, this pass -- the previous
// wording pointed the reader at a "corrected `source` string" that does not
// exist). `TUNING.hardware.popKickMmPerS`'s shipped `source` still carries
// all three disproved claims. That is deliberate and ledgered as **DW-160**,
// routed to Story 2.3: `resolveTuning()`'s ENTIRE serialized output --
// `source` and `confidence` prose included -- is hashed into every golden
// header (AD-15, as this story itself amended it), so a prose-only edit
// costs a five-golden re-record. Story 2.3 re-records anyway. Until then the
// two tests below, not the prose, are the authority on this constant's real
// bounds.
// These two tests pin the corrected floor and ceiling directly (never the
// production value alone, which the existing DW-148 test above already
// covers) so a future change to this constant, or to the physics it
// depends on, is caught here rather than by a shipped strand.
describe('AD-15 provenance: TUNING.hardware.popKickMmPerS -- the corrected floor and ceiling reproduce', () => {
	/** Same technique as the top-level DW-148 test above, parametrised on the kick value via `resolveTuning()`'s own override seam (this file's own Integration AC test already uses the identical pattern) instead of the production tuning, so this pin tracks the PHYSICS boundary, independent of whatever value `TUNING.hardware.popKickMmPerS` is set to in production. */
	function dw148TrailingProgressMm(popKickMmPerSValue: number): number {
		const tuning = resolveTuning({
			...TUNING,
			hardware: { ...TUNING.hardware, popKickMmPerS: { ...TUNING.hardware.popKickMmPerS, value: popKickMmPerSValue } },
		});
		const machine = createMachine(loadDoc(), tuning);
		let tick = 0;
		for (let i = 0; i < 320; i++) {
			tick += 1;
			machine.step(tick, NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : []);
		}
		const ball = machine.balls[0]!;
		const startPhysics = toPhysics({ x: 130, y: 850, z: 13.5 });
		ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
		ball.hit.vel.set(0, 0, 0);

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
		if (samples.length < 2) {
			return Infinity;
		}
		const last = samples[samples.length - 1]!;
		let windowStart = samples[0]!;
		for (const s of samples) {
			if (last.tick - s.tick <= 500) {
				windowStart = s;
				break;
			}
		}
		return Math.hypot(last.x - windowStart.x, last.y - windowStart.y);
	}

	it('corrected floor: 50 mm/s -- well below the old, unreproduced "~180 mm/s" claim -- still clears the DW-148 strand', () => {
		const progressMm = dw148TrailingProgressMm(50);
		expect(progressMm, `at 50 mm/s (well below the old floor claim) trailing-window progress was only ${progressMm.toFixed(2)} mm -- the strand should clear easily here`).toBeGreaterThan(15);
	});

	it('corrected ceiling: 225 mm/s -- just above the real (previously undocumented) 221 mm/s ceiling -- re-strands the ball at a NEW equilibrium, not the original apex', () => {
		const progressMm = dw148TrailingProgressMm(225);
		expect(
			progressMm,
			`at 225 mm/s trailing-window progress was ${progressMm.toFixed(2)} mm -- expected a re-strand (<= 15 mm) at this now-documented ceiling, distinct from the production value's own safe margin`,
		).toBeLessThanOrEqual(15);
	});
});
