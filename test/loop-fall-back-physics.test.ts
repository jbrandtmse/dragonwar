// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.6 (AC 3; AD-19 amended 2026-09-30, DW-288, DW-173): the Loops'
// fall-back signature on REAL physics. Every switch edge here comes from a
// real `createMachine()` and is fed, tick by tick, to a real
// `createShotTracker()` (`src/sim/rules/devices/shots.ts`) -- no scripted
// edge anywhere. `test/rules-devices.test.ts` pins the same rules on
// hand-written edges; this file asks the table.
//
// What each input IS, exactly (a teleported launch proves the tracker reads
// the switches a ball on that path closes; it proves nothing about a flipper
// being able to put a ball there -- at this tree none can, DW-319):
//
// - TELEPORTED launches. A ball is served by a real `c_trough_eject`, left to
//   settle for 320 ticks, then repositioned by hand at a release point with a
//   straight-line velocity up the playfield (dirDeg 0) and no spin -- the
//   `driveShot()` technique of `test/shot-routing.test.ts`, copied here
//   because a `.test.ts` is never imported. The two release points are the
//   manifest's own (`test/util/shot-cases.ts`): `left-loop-orbit-31` (31, 415)
//   and `right-loop-orbit-31` (its mirror), centred in each Loop's entry
//   column; only the speed varies. `left-loop-1200` and
//   `ramp-return-geometry` are driven exactly as the manifest declares them.
// - REAL plunges. `plunge-full` (plunger held 521 ticks), `plunge-medium-285`
//   (285 ticks) and `plunge-weak-345` (345 ticks) are the reachability
//   witnesses of `test/util/reachability.ts`, replayed by their recorded
//   parameters: a real serve, the plunger held, then released. Nothing is
//   teleported.
//
// Every expected tick is read from the run's OWN recorded physical edges (the
// tick a named switch closed), never from the tracker.

import { describe, expect, it } from 'vitest';
import { NO_FRAME } from '../src/sim/loop';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { createShotTracker } from '../src/sim/rules/devices/shots';
import { TABLE } from '../src/sim/table/dragonwar';
import { MM_PER_VU, toPhysics } from '../src/sim/table/frames';
import { resolveTuning } from '../src/sim/table/tuning';
import { readCollisionDoc } from './util/collision-doc';
import { shotCase } from './util/shot-cases';
import type { InputFrame } from '../src/sim/contracts/input';
import type { CoilCommand, SwitchEvent, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const LOOP_WINDOW_TICKS = TUNING.loopWindowTicks.value;
const LOOP_BREAK_TICKS = TUNING.loopBreakWindowTicks.value;
const LOOP_DESCENT_TICKS = TUNING.loopDescentWindowTicks.value;

/** Ticks a served ball is left to settle on the plunger tip before it is launched (`driveShot()`'s own figure). */
const SETTLE_TICKS = 320;

/** Every switch any declared shot reads -- its sequence and, for a Loop, its `fallBack` descents and exits. Derived from `TABLE.shots`, so the "relevant closures" below are the table's, not this file's. */
const SHOT_SWITCHES: ReadonlySet<SwitchName> = new Set(
	Object.values(TABLE.shots).flatMap((shot): SwitchName[] => ('fallBack' in shot ? [...shot.sequence, ...shot.fallBack.descents, ...shot.fallBack.exits] : [...shot.sequence])),
);

interface Run {
	/** Every switch edge the machine produced, in tick order. */
	readonly edges: readonly SwitchEvent[];
	/** The last tick stepped. */
	readonly lastTick: number;
	/** Every event the real tracker emitted, as `[type, tick]`. */
	readonly shots: readonly (readonly [string, number])[];
}

/** Feeds `edges` to a fresh real tracker, one `step()` per tick from 1 to `lastTick`, and returns everything it emitted. */
function track(edges: readonly SwitchEvent[], lastTick: number): [string, number][] {
	const tracker = createShotTracker(TUNING);
	const byTick = new Map<number, SwitchEvent[]>();
	for (const edge of edges) {
		byTick.set(edge.tick, [...(byTick.get(edge.tick) ?? []), edge]);
	}
	const shots: [string, number][] = [];
	for (let tick = 1; tick <= lastTick; tick++) {
		for (const event of tracker.step(byTick.get(tick) ?? [], tick)) {
			shots.push([event.type, event.tick]);
		}
	}
	return shots;
}

/** Steps a real machine through `program`, recording every switch edge, and runs the real tracker over them. Stops early once the ball has left play after `launchTick`. */
function run(program: (tick: number) => { readonly frame: InputFrame; readonly commands: readonly CoilCommand[] }, totalTicks: number, launchTick: number, onLaunch?: (machine: Machine) => void): Run {
	const machine: Machine = createMachine(readCollisionDoc(), TUNING);
	const edges: SwitchEvent[] = [];
	let tick = 0;
	while (tick < totalTicks) {
		tick += 1;
		const { frame, commands } = program(tick);
		edges.push(...machine.step(tick, frame, commands).switchEvents);
		if (tick === launchTick && onLaunch) {
			onLaunch(machine);
		}
		if (tick > launchTick && machine.balls.length === 0) {
			break;
		}
	}
	return { edges, lastTick: tick, shots: track(edges, tick) };
}

/** The real serve every run begins with: `c_trough_eject` pulsed on tick 1. */
function serveCommands(tick: number): readonly CoilCommand[] {
	return tick === 1 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : [];
}

/**
 * A TELEPORTED launch: the served ball is repositioned at `startMm` after
 * `SETTLE_TICKS`, moving straight up the playfield at `speedMmPerS` with no
 * spin, and driven for `ticks` more real physics steps.
 */
function teleported(startMm: { readonly x: number; readonly y: number; readonly z: number }, speedMmPerS: number, ticks: number): Run {
	return run(
		(tick) => ({ frame: NO_FRAME, commands: serveCommands(tick) }),
		SETTLE_TICKS + ticks,
		SETTLE_TICKS,
		(machine) => {
			const ball = machine.balls[0];
			if (!ball) {
				throw new Error('teleported(): no served ball to reposition -- c_trough_eject did not serve one');
			}
			const start = toPhysics(startMm);
			ball.state.pos.set(start.x, start.y, start.z);
			// toPhysics() flips table y -> physics -y, so "up the playfield" is a
			// negative physics y velocity (test/shot-routing.test.ts's convention).
			ball.hit.vel.set(0, -speedMmPerS / (MM_PER_VU * 100), 0);
			ball.hit.angularVelocity.set(0, 0, 0);
			ball.hit.angularMomentum.set(0, 0, 0);
		},
	);
}

/** A REAL plunge: a real serve, the plunger held for `holdTicks` from tick `SETTLE_TICKS + 1`, released, and `ticksAfterRelease` more steps. Nothing is repositioned. */
function plunged(holdTicks: number, ticksAfterRelease: number): Run {
	const release = SETTLE_TICKS + holdTicks;
	return run(
		(tick) => ({ frame: tick > SETTLE_TICKS && tick <= release ? { ...NO_FRAME, plunger: true } : NO_FRAME, commands: serveCommands(tick) }),
		release + ticksAfterRelease,
		release,
	);
}

/** The closures of the switches the shots read, in order, as names -- spinner turns, the drain and the trough are not the tracker's. */
function shotCloses(result: Run): SwitchName[] {
	return result.edges.filter((edge) => edge.closed && SHOT_SWITCHES.has(edge.switch)).map((edge) => edge.switch);
}

/** The ticks `switchName` closed on, in order. */
function closeTicks(result: Run, switchName: SwitchName): number[] {
	return result.edges.filter((edge) => edge.closed && edge.switch === switchName).map((edge) => edge.tick);
}

/** `result`'s edges without any closure of `dropped`, run through a fresh tracker -- the control that shows which switch a verdict rests on. */
function trackWithout(result: Run, dropped: SwitchName): [string, number][] {
	return track(result.edges.filter((edge) => edge.switch !== dropped), result.lastTick);
}

const LEFT_ENTRY = shotCase('left-loop-orbit-31');
const RIGHT_ENTRY = shotCase('right-loop-orbit-31');

describe('Story 3.6 AC 3 -- the premises: the shot switches are the table\'s, and both release points are the manifest\'s', () => {
	it('SHOT_SWITCHES is the eight Loop switches and the two Ramp switches, derived from TABLE.shots', () => {
		expect([...SHOT_SWITCHES].sort()).toEqual(
			['s_inlane_l', 's_inlane_r', 's_loop_l_in', 's_loop_l_out', 's_loop_r_in', 's_loop_r_out', 's_outlane_l', 's_outlane_r', 's_ramp_enter', 's_ramp_made'].sort(),
		);
	});

	it('the two Loop release points are centred in their entry columns, launched straight up at 2200 mm/s in the manifest', () => {
		expect([LEFT_ENTRY.startMm.y, LEFT_ENTRY.dirDeg, LEFT_ENTRY.speedMmPerS]).toEqual([415, 0, 2200]);
		expect([RIGHT_ENTRY.startMm.y, RIGHT_ENTRY.dirDeg, RIGHT_ENTRY.speedMmPerS]).toEqual([415, 0, 2200]);
		expect(LEFT_ENTRY.startMm.x).toBe(31);
		expect(RIGHT_ENTRY.startMm.x, 'the mirror of the left point about the playfield (measured 437.4 at this tree)').toBeCloseTo(437.4, 6);
	});
});

describe('Story 3.6 AC 3 -- a MADE Loop on real physics (teleported launches): exactly one own _made, no _broken, and nothing for the opposite Loop', () => {
	const leftOrbit = teleported(LEFT_ENTRY.startMm, LEFT_ENTRY.speedMmPerS, LEFT_ENTRY.ticks);
	const rightOrbit = teleported(RIGHT_ENTRY.startMm, RIGHT_ENTRY.speedMmPerS, RIGHT_ENTRY.ticks);
	const leftOrbit1800 = teleported(LEFT_ENTRY.startMm, 1800, LEFT_ENTRY.ticks);

	it('left-loop-orbit-31 (2200 mm/s): the ball orbits -- s_loop_l_in, s_loop_l_out, then down the right lane as s_loop_r_out, s_loop_r_in, s_inlane_r', () => {
		expect(shotCloses(leftOrbit)).toEqual(['s_loop_l_in', 's_loop_l_out', 's_loop_r_out', 's_loop_r_in', 's_inlane_r']);
	});

	it('left-loop-orbit-31: the tracker emits exactly shot_left_loop_made, on the tick s_loop_l_out closed', () => {
		expect(leftOrbit.shots).toEqual([['shot_left_loop_made', closeTicks(leftOrbit, 's_loop_l_out')[0]]]);
	});

	// This is the ONE place the scripted orbit is checked against the machine.
	// Three files copy these four figures by hand as their `ORBIT` constant:
	// `test/rules-devices.test.ts`, `test/rules-joust.test.ts` and
	// `test/rules-joust-integration.test.ts`. If this pin moves, move all three.
	// (Their right orbit is this timeline mirrored, as the spec defines it; the
	// table is not symmetric, and the real right orbit's own timing differs.)
	it('left-loop-orbit-31: the orbit timeline the scripted rules rows use (ticks after s_loop_l_in: 223, 1759, 2618, 3568) is this tree\'s measured one', () => {
		const entry = closeTicks(leftOrbit, 's_loop_l_in')[0]!;
		const offsets = (['s_loop_l_out', 's_loop_r_out', 's_loop_r_in', 's_inlane_r'] as const).map((name) => closeTicks(leftOrbit, name)[0]! - entry);
		expect(offsets).toEqual([223, 1759, 2618, 3568]);
		expect(offsets[0]!, 'made inside the loop window').toBeLessThanOrEqual(LOOP_WINDOW_TICKS);
		expect(offsets[2]! - offsets[1]!, 'the descent crosses the far lane inside the descent window').toBeLessThanOrEqual(LOOP_DESCENT_TICKS);
	});

	it('right-loop-orbit-31 (2200 mm/s): s_loop_r_in, s_loop_r_out, then down the left lane -- and the tracker emits exactly shot_right_loop_made', () => {
		expect(shotCloses(rightOrbit)).toEqual(['s_loop_r_in', 's_loop_r_out', 's_loop_l_out', 's_loop_l_in', 's_inlane_l']);
		expect(rightOrbit.shots).toEqual([['shot_right_loop_made', closeTicks(rightOrbit, 's_loop_r_out')[0]]]);
	});

	it('the left entry point at 1800 mm/s: the same orbit, and exactly shot_left_loop_made', () => {
		expect(shotCloses(leftOrbit1800)).toEqual(['s_loop_l_in', 's_loop_l_out', 's_loop_r_out', 's_loop_r_in', 's_inlane_r']);
		expect(leftOrbit1800.shots).toEqual([['shot_left_loop_made', closeTicks(leftOrbit1800, 's_loop_l_out')[0]]]);
	});

	it('control (DW-173): what keeps the orbit from arming the right Loop is its s_loop_r_out -- without that closure the same edges break the right Loop at s_inlane_r', () => {
		expect(trackWithout(leftOrbit, 's_loop_r_out')).toEqual([
			['shot_left_loop_made', closeTicks(leftOrbit, 's_loop_l_out')[0]],
			['shot_right_loop_broken', closeTicks(leftOrbit, 's_inlane_r')[0]],
		]);
	});
});

describe('Story 3.6 AC 3 -- a FALL-BACK on real physics (teleported launches): exactly one own _broken, at the second entry closure or the exit, and no _made', () => {
	const left800 = teleported(LEFT_ENTRY.startMm, 800, LEFT_ENTRY.ticks);
	const right450 = teleported(RIGHT_ENTRY.startMm, 450, RIGHT_ENTRY.ticks);
	const left300 = teleported(LEFT_ENTRY.startMm, 300, LEFT_ENTRY.ticks);
	const slow = shotCase('left-loop-1200');
	const left1200 = teleported(slow.startMm, slow.speedMmPerS, slow.ticks);

	it('the left entry point at 800 mm/s: the ball climbs, falls back through s_loop_l_in and leaves by the outlane -- broken on the SECOND s_loop_l_in', () => {
		expect(shotCloses(left800)).toEqual(['s_loop_l_in', 's_loop_l_in', 's_outlane_l']);
		const [first, second] = closeTicks(left800, 's_loop_l_in');
		expect(second! - first!, 'the premise: the fall-back resolves inside the break window').toBeLessThanOrEqual(LOOP_BREAK_TICKS);
		expect(second! - first!, 'the re-entry figure the scripted "Break (re-entry)" rows quote is this tree\'s measured one').toBe(1372);
		expect(left800.shots).toEqual([['shot_left_loop_broken', second]]);
	});

	it('the right entry point at 450 mm/s: s_loop_r_in twice, then s_outlane_r -- broken on the SECOND s_loop_r_in', () => {
		expect(shotCloses(right450)).toEqual(['s_loop_r_in', 's_loop_r_in', 's_outlane_r']);
		expect(right450.shots).toEqual([['shot_right_loop_broken', closeTicks(right450, 's_loop_r_in')[1]]]);
	});

	it('the left entry point at 300 mm/s: s_loop_l_in once, then s_outlane_l -- broken on the outlane (the exit)', () => {
		expect(shotCloses(left300)).toEqual(['s_loop_l_in', 's_outlane_l']);
		const exit = closeTicks(left300, 's_outlane_l')[0]!;
		expect(exit - closeTicks(left300, 's_loop_l_in')[0]!, 'the premise: the exit is inside the break window').toBeLessThanOrEqual(LOOP_BREAK_TICKS);
		expect(exit - closeTicks(left300, 's_loop_l_in')[0]!, 'the exit figure the scripted "Break (exit)" rows quote is this tree\'s measured one').toBe(1281);
		expect(left300.shots).toEqual([['shot_left_loop_broken', exit]]);
	});

	it('left-loop-1200: s_loop_l_out closes twice, both past the loop window, and is ignored -- broken on the second s_loop_l_in', () => {
		expect(shotCloses(left1200)).toEqual(['s_loop_l_in', 's_loop_l_out', 's_loop_l_out', 's_loop_l_in', 's_outlane_l']);
		const entry = closeTicks(left1200, 's_loop_l_in')[0]!;
		expect(closeTicks(left1200, 's_loop_l_out')[0]! - entry, 'the premise: the first s_loop_l_out is too late to make the Loop').toBeGreaterThan(LOOP_WINDOW_TICKS);
		expect(left1200.shots).toEqual([['shot_left_loop_broken', closeTicks(left1200, 's_loop_l_in')[1]]]);
	});
});

describe('Story 3.6 AC 3 -- a NON-ENTRY path on real physics: a ball coming down a Loop lane from above produces no Loop event', () => {
	const plungeFull = plunged(521, 4300);
	const plungeMedium = plunged(285, 5500);
	const plungeWeak = plunged(345, 5500);
	const rampCase = shotCase('ramp-return-geometry');
	const rampReturn = teleported(rampCase.startMm, rampCase.speedMmPerS, rampCase.ticks);

	it('plunge-full (a REAL plunge, plunger held 521 ticks): the ball crosses the top and descends the LEFT lane -- s_loop_l_out, s_loop_l_in, s_inlane_l -- and the tracker emits nothing', () => {
		expect(shotCloses(plungeFull)).toEqual(['s_loop_l_out', 's_loop_l_in', 's_inlane_l']);
		expect(closeTicks(plungeFull, 's_loop_l_in')[0]! - closeTicks(plungeFull, 's_loop_l_out')[0]!, 'the premise: the entry switch closes inside the descent window').toBeLessThanOrEqual(LOOP_DESCENT_TICKS);
		expect(
			[closeTicks(plungeFull, 's_loop_l_in')[0]! - closeTicks(plungeFull, 's_loop_l_out')[0]!, closeTicks(plungeFull, 's_inlane_l')[0]! - closeTicks(plungeFull, 's_loop_l_in')[0]!],
			'the descent figures the scripted "Non-entry" rows quote (582, then 640 to the inlane) are this tree\'s measured ones',
		).toEqual([582, 640]);
		expect(plungeFull.shots).toEqual([]);
	});

	it('control: without its s_loop_l_out the same plunge-full edges ARE a broken Left Loop, at s_inlane_l', () => {
		expect(trackWithout(plungeFull, 's_loop_l_out')).toEqual([['shot_left_loop_broken', closeTicks(plungeFull, 's_inlane_l')[0]]]);
	});

	// Story 3.6 review: the third reachability witness, and the one whose
	// label this story corrected (`test/util/reachability.ts`). It is the real
	// plunge that descends a lane and leaves by the OUTLANE -- the shape that
	// would read as a break if the descent mark were not consumed.
	it('plunge-weak-345 (a REAL plunge, plunger held 345 ticks): the ball crosses the top, descends the LEFT lane and leaves by the outlane -- s_loop_l_out, s_loop_l_in, s_outlane_l -- and the tracker emits nothing', () => {
		expect(shotCloses(plungeWeak)).toEqual(['s_loop_l_out', 's_loop_l_in', 's_outlane_l']);
		expect(closeTicks(plungeWeak, 's_loop_l_in')[0]! - closeTicks(plungeWeak, 's_loop_l_out')[0]!, 'the premise: the entry switch closes inside the descent window').toBeLessThanOrEqual(LOOP_DESCENT_TICKS);
		expect(plungeWeak.shots).toEqual([]);
	});

	it('control: without its s_loop_l_out the same plunge-weak-345 edges ARE a broken Left Loop, at s_outlane_l', () => {
		expect(trackWithout(plungeWeak, 's_loop_l_out')).toEqual([['shot_left_loop_broken', closeTicks(plungeWeak, 's_outlane_l')[0]]]);
	});

	it('plunge-medium-285 (a REAL plunge, plunger held 285 ticks): the ball descends the RIGHT lane -- s_loop_r_out, s_loop_r_in, s_inlane_r -- and the tracker emits nothing', () => {
		expect(shotCloses(plungeMedium)).toEqual(['s_loop_r_out', 's_loop_r_in', 's_inlane_r']);
		expect(plungeMedium.shots).toEqual([]);
	});

	it('control: without its s_loop_r_out the same plunge-medium-285 edges ARE a broken Right Loop, at s_inlane_r', () => {
		expect(trackWithout(plungeMedium, 's_loop_r_out')).toEqual([['shot_right_loop_broken', closeTicks(plungeMedium, 's_inlane_r')[0]]]);
	});

	it('ramp-return-geometry (teleported into the Ramp mouth): s_ramp_enter, s_ramp_made, then the return through s_loop_r_in to s_inlane_r -- shot_ramp_made and no Loop event', () => {
		expect(shotCloses(rampReturn)).toEqual(['s_ramp_enter', 's_ramp_made', 's_loop_r_in', 's_inlane_r']);
		expect(closeTicks(rampReturn, 's_loop_r_in')[0]! - closeTicks(rampReturn, 's_ramp_made')[0]!, 'the premise: the return reaches s_loop_r_in inside the descent window').toBeLessThanOrEqual(LOOP_DESCENT_TICKS);
		// This recipe (2400 mm/s) returns in 1141 ticks. The scripted rows use
		// 1893, the slowest return of the planning sample, which is not re-driven
		// here; the inlane leg they quote (946) is this recipe's.
		expect(
			[closeTicks(rampReturn, 's_loop_r_in')[0]! - closeTicks(rampReturn, 's_ramp_made')[0]!, closeTicks(rampReturn, 's_inlane_r')[0]! - closeTicks(rampReturn, 's_loop_r_in')[0]!],
			'this recipe\'s return (1141) and the inlane figure the scripted "Non-entry" rows quote (946) are this tree\'s measured ones',
		).toEqual([1141, 946]);
		expect(rampReturn.shots).toEqual([['shot_ramp_made', closeTicks(rampReturn, 's_ramp_made')[0]]]);
	});

	it('control: without its s_ramp_made the same return IS a broken Right Loop, at s_inlane_r (and the Ramp, never completed, breaks on its own window)', () => {
		const shots = trackWithout(rampReturn, 's_ramp_made');
		expect(shots.filter(([type]) => type.startsWith('shot_right_loop'))).toEqual([['shot_right_loop_broken', closeTicks(rampReturn, 's_inlane_r')[0]]]);
		expect(shots.filter(([type]) => type.startsWith('shot_ramp')).map(([type]) => type)).toEqual(['shot_ramp_broken']);
	});
});
