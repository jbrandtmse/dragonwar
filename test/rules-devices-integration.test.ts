// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.4, task 10 -- the two obligations a headless switch-script test
// cannot discharge on its own (Rule 1, DW-166's own honest closure):
//
//   - The Integration AC (AC 5): a REAL `createLoop({ collisionDoc, tuning })`
//     driving real physics, proving the rules -> physics coilCommands
//     channel this story builds actually reaches `machine.step()` and comes
//     back out through `FrameOutput.contactEvents` and
//     `snapshot.mechanisms.dropTargets` -- the headless AC 4 tests
//     (test/rules-devices.test.ts) prove the LAYER pulses; this proves the
//     pulse is CONSUMED.
//   - DW-166 (AC 6): the measured 550-600 mm/s non-capturing band and the
//     ~800 mm/s capturing shot, both driven through the REAL physics
//     pipeline (`createMachine().step()`, mirroring
//     test/drop-targets.test.ts's own `driveStraight()` convention) from the
//     table-frame release point AC 6 itself names, then REPLAYED tick by
//     tick into a fresh `createDevicesLayer()` instance -- never a mock, and
//     never the scripted DSL, which cannot produce a genuine capture-vs-miss
//     distinction on its own.
//
// Both halves are driven at the `machine.step()` / `createLoop()` level, per
// this story's own Consumes clause: "Its Integration AC exercises a real
// createLoop with real physics -- never a mock."

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { createDevicesLayer } from '../src/sim/rules/devices';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import { toPhysics, MM_PER_VU } from '../src/sim/table/frames';
import type { SwitchEvent } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** A deep-copied collision doc, safe to mutate (`bd_trough.ejectPose`) without disturbing any other test's cached parse. */
function loadMutableDoc(): { devices: Array<{ name: string; ejectPose: { posMm: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } } }> } {
	return JSON.parse(JSON.stringify(loadDoc()));
}

describe('Integration AC (Rule 1, AC 5) -- a real createLoop() consumes this story\'s own rules -> physics coilCommands channel', () => {
	it('six successive trough ejects walk the DRAGON bank down; on the tick after all six read true, contactEvents carries exactly one bank_reset and the six return to false; the middle count is observed on the way', () => {
		const doc = loadMutableDoc();
		// West of the bank (x = 200, the D-R-A-G-O-N span starts at x ~= 217.4)
		// aimed to sweep east across it (task 10's own release pose).
		doc.devices.find((d) => d.name === 'bd_trough')!.ejectPose = { posMm: { x: 200, y: 690, z: 13.5 }, dir: { x: 1, y: 0.15, z: 0 } };
		const tuning = resolveTuning({ ...TUNING, troughEjectSpeedMmPerS: { ...TUNING.troughEjectSpeedMmPerS, value: 1600 } });

		const loop = createLoop({ collisionDoc: doc, tuning });

		let tick = 0;
		let downCount = 0;
		let shots = 0;
		let firstAllTrueTick: number | null = null;
		let resetContactTick: number | null = null;
		let resetContactCount = 0;
		const middleCounts = new Set<number>();

		// Task 10: cap at 12 shots (a served ball can miss the trough's own
		// re-serve window, or the drive can need more than one attempt per
		// letter) -- ~700 ms (700 ticks at 1 kHz) per shot is this story's own
		// measured budget for one trough-to-bank-and-reset round trip. The
		// outer loop STOPS the instant completion is observed and its own
		// next-tick reset is captured -- it must not keep firing shots
		// afterward, which would silently overwrite `resetContactCount` with
		// a later, irrelevant tick's zero-contact observation (review finding,
		// this pass: reproduced before this guard was added).
		while (firstAllTrueTick === null && shots < 12) {
			loop.pulseCoil('c_trough_eject');
			shots += 1;
			for (let i = 0; i < 700 && firstAllTrueTick === null; i++) {
				tick += 1;
				const out = loop.advance(1, []);
				downCount = Object.values(out.snapshot.mechanisms.dropTargets).filter(Boolean).length;
				if (downCount > 0 && downCount < 6) {
					middleCounts.add(downCount);
				}
				if (downCount === 6 && firstAllTrueTick === null) {
					firstAllTrueTick = tick;
				}
			}
		}

		if (firstAllTrueTick !== null) {
			// The tick immediately after completion -- AC 5's own "on the next
			// tick" clause.
			tick += 1;
			const nextOut = loop.advance(1, []);
			const bankResets = nextOut.contactEvents.filter((c) => c.kind === 'bank_reset' && c.device === 'c_dragon_bank_reset');
			resetContactCount = bankResets.length;
			resetContactTick = tick;
			downCount = Object.values(nextOut.snapshot.mechanisms.dropTargets).filter(Boolean).length;
		}

		expect(firstAllTrueTick, `all six letters must go down within ${shots} shot(s) -- never reached 6`).not.toBeNull();
		expect(middleCounts.size, `expected at least one genuine middle count (1..5) on the way to 6, saw: ${[...middleCounts].sort()}`).toBeGreaterThan(0);
		expect(resetContactTick, 'a next-tick reset must have been observed').not.toBeNull();
		expect(resetContactCount, 'exactly one bank_reset contact on the tick after completion').toBe(1);
		expect(downCount, 'dropTargets must return to all false on the reset tick').toBe(0);
	});

	it('control: with c_dragon_bank_reset disabled, no bank_reset contact ever appears and the six stay true', () => {
		const doc = loadMutableDoc();
		doc.devices.find((d) => d.name === 'bd_trough')!.ejectPose = { posMm: { x: 200, y: 690, z: 13.5 }, dir: { x: 1, y: 0.15, z: 0 } };
		const tuning = resolveTuning({ ...TUNING, troughEjectSpeedMmPerS: { ...TUNING.troughEjectSpeedMmPerS, value: 1600 } });

		const loop = createLoop({ collisionDoc: doc, tuning });
		loop.setCoilEnabled('c_dragon_bank_reset', false);

		let downCount = 0;
		let shots = 0;
		let bankResetContacts = 0;
		let lastDropTargets: Record<string, boolean> = {};
		while (downCount < 6 && shots < 12) {
			loop.pulseCoil('c_trough_eject');
			shots += 1;
			for (let i = 0; i < 700; i++) {
				const out = loop.advance(1, []);
				lastDropTargets = out.snapshot.mechanisms.dropTargets as Record<string, boolean>;
				downCount = Object.values(lastDropTargets).filter(Boolean).length;
				bankResetContacts += out.contactEvents.filter((c) => c.kind === 'bank_reset').length;
			}
		}

		expect(downCount, `all six must still reach down with the coil disabled (only the RESET is gated) -- dropTargets: ${JSON.stringify(lastDropTargets)}`).toBe(6);
		expect(bankResetContacts, 'no bank_reset contact must ever appear while the coil is disabled').toBe(0);
	});
});

/**
 * Mirrors `test/shot-routing.test.ts`'s own `driveShot()` / `test/drop-targets.test.ts`'s
 * own `driveStraight()` convention: serves a fresh ball via a real trough
 * eject, repositions it at `startMm`, launches it straight up the playfield
 * (table +y) at `speedMmPerS`, and drives `ticks` real physics steps,
 * collecting every `SwitchEvent` produced with its own tick.
 */
function driveLockLane(speedMmPerS: number, ticks: number): readonly SwitchEvent[] {
	const machine: Machine = createMachine(loadDoc(), resolveTuning());

	let tick = 0;
	for (let i = 0; i < 320; i++) {
		tick += 1;
		machine.step(tick, NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : []);
	}
	const ball = machine.balls[0];
	if (!ball) {
		throw new Error('driveLockLane(): no served ball to reposition');
	}

	// AC 6's own release point: (170, 440) -- the sw_lock_lane / sw_lock_1..3
	// corridor's own centreline, on-axis (straight up the lane, dirDeg 0).
	const startPhysics = toPhysics({ x: 170, y: 440, z: 13.5 });
	ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
	const speedVuPerT = speedMmPerS / (MM_PER_VU * 100);
	ball.hit.vel.set(0, -speedVuPerT, 0);
	ball.hit.angularVelocity.set(0, 0, 0);
	ball.hit.angularMomentum.set(0, 0, 0);

	const events: SwitchEvent[] = [];
	for (let i = 0; i < ticks; i++) {
		tick += 1;
		const result = machine.step(tick, NO_FRAME, []);
		events.push(...result.switchEvents);
		if (!machine.balls[0]) {
			break;
		}
	}
	return events;
}

/** Replays `switchEvents` (already real, tick-stamped) into a FRESH `createDevicesLayer()` instance, tick by tick -- never a mock. */
function replayIntoDevicesLayer(switchEvents: readonly SwitchEvent[]) {
	const layer = createDevicesLayer(resolveTuning());
	const byTick = new Map<number, SwitchEvent[]>();
	let maxTick = 0;
	for (const event of switchEvents) {
		const list = byTick.get(event.tick) ?? [];
		list.push(event);
		byTick.set(event.tick, list);
		maxTick = Math.max(maxTick, event.tick);
	}
	const events = [];
	for (let tick = 1; tick <= maxTick; tick++) {
		const result = layer.step(byTick.get(tick) ?? [], [], tick);
		events.push(...result.events);
	}
	return events;
}

describe('DW-166 closure (AC 6) -- a real driven Lock-lane shot, replayed into a devices-layer instance', () => {
	it('~575 mm/s (the measured 550-600 mm/s non-capturing band) produces no lock_lane_entered; ~800 mm/s does', () => {
		const nonCapturing = driveLockLane(575, 5000);
		const nonCapturingEvents = replayIntoDevicesLayer(nonCapturing);
		expect(
			nonCapturingEvents.filter((e) => e.type === 'lock_lane_entered'),
			`~575 mm/s must not produce lock_lane_entered -- got: ${JSON.stringify(nonCapturingEvents)}`,
		).toEqual([]);
		expect(nonCapturing.some((e) => e.switch === 's_lock_lane' && e.closed), 's_lock_lane must still close at ~575 mm/s (the switch itself is not in question)').toBe(true);

		// QA (DW-171, context only -- routed to Story 3.2's Lock arbiter,
		// AD-18, and NOT this story's to fix): at this speed the ball still
		// PHYSICALLY PARKS in bd_lock even though no lock_lane_entered credit
		// was granted. 2.4's job was only to stop lock_lane_entered from
		// OVER-reporting (DW-166), and it does; the arbiter that decides what
		// to do with an uncredited-but-parked ball does not exist until Story
		// 3.2.
		//
		// SCOPE OF WHAT THIS CAN OBSERVE (corrected at code review; the
		// original wording claimed more than the harness can see). A park
		// removes the ball from the simulated set
		// (`src/sim/physics/devices.ts`'s `physics.removeBall()`), and
		// `driveLockLane()` breaks its loop the instant `machine.balls[0]` is
		// gone. Measured at this tree: the 575 mm/s drive asks for 5000 ticks,
		// breaks at iteration 375 -- tick 696, the exact tick `s_lock_1`
		// closes -- so ZERO ticks are simulated after the park. "The ball is
		// then never drained" is therefore not a property this run can
		// falsify: nothing after the park is observed at all. What the two
		// assertions below genuinely pin is the ordering -- the ball reaches
		// `bd_lock` and parks, and no drain happens BEFORE it does. A future
		// change that drained the ball instead of parking it reddens both.
		expect(nonCapturing.some((e) => e.switch === 's_lock_1' && e.closed), 'DW-171: the ball still physically parks in bd_lock despite the missed lock_lane_entered credit').toBe(true);
		expect(
			nonCapturing.some((e) => e.switch === 's_drain' && e.closed),
			'DW-171: no drain occurs before the bd_lock park -- the ball reaches the device (this run stops AT the park, so it says nothing about what would happen after it)',
		).toBe(false);

		const capturing = driveLockLane(800, 5000);
		const capturingEvents = replayIntoDevicesLayer(capturing);
		expect(
			capturingEvents.filter((e) => e.type === 'lock_lane_entered'),
			`~800 mm/s must produce exactly one lock_lane_entered -- got: ${JSON.stringify(capturingEvents)}`,
		).toHaveLength(1);
		expect(capturingEvents.some((e) => e.type === 'device_ball_entered' && e.device === 'bd_lock')).toBe(true);
	});
});
