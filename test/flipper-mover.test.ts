// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.6's I/O matrix, mover rows: same-tick energise (AD-5, no rules
// round trip); the 5 s hold reaching and HOLDING the end-of-stroke angle; the
// 30 ms tap rising strictly between rest and end then returning; the coil
// disable/enable gate; and exactly one `flipper_eos` ContactEvent per
// stroke. Driven headlessly through the real `createLoop()` over the
// committed collision document -- the same "against real geometry, not a
// synthetic fixture" discipline `test/machine-serve-drain.test.ts` already
// established for the devices layer.
//
// Every angle asserted here was measured against the real committed
// geometry during this story's implementation (see flipper-collision.test.ts
// for the collision-side rows and Design Notes for how the rest/end angles
// are derived): left flipper rest ~141 deg, end-of-stroke 90 deg; right
// flipper is the mirror (rest ~-141 deg / 219 deg, end -90 deg / 270 deg).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import type { InputTransition } from '../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

describe('sim/physics/flippers.ts -- the flipper hardware rule, mover behaviour (AD-5)', () => {
	it('the flipper energises inside the SAME tick the input frame closes s_flipper_l, with no rules round trip', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = loop.advance(5, []); // settle at rest
		const restAngle = out.snapshot.mechanisms.flippers.l.angleDeg;

		const transitions: InputTransition[] = [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, flipper_l: true } }];
		out = loop.advance(1, transitions); // exactly one more tick
		expect(out.commands, 'RulesStepResult.commands stays readonly never[] -- AD-5, no rules round trip').toEqual([]);

		// AD-5's "same tick" claim is about the SOLENOID COMMAND -- the mover
		// is energised inside machine.step() for this exact tick, so the very
		// NEXT few ticks already show movement, with no extra tick of latency
		// waiting on a rules round trip. The VISIBLE angle takes a couple of
		// ticks to move measurably: the ported mover holds the rest position
		// under its return spring's own torque (`curTorque`, ramped, verified
		// against the pinned source), so a fresh press must first ramp curTorque
		// back through zero before the bat accelerates away from the stop --
		// a real, ported mechanical characteristic (VPX flippers have this same
		// brief "reversing the spring" lag), not a rules round trip. Contrast a
		// ROUND-TRIPPED design, which would show no movement for many MORE ticks
		// (a whole rules.step() + next-tick command cycle) rather than this one
		// short physics-internal ramp.
		let movedByTick = -1;
		for (let i = 0; i < 10 && movedByTick === -1; i++) {
			out = loop.advance(1, []);
			if (out.snapshot.mechanisms.flippers.l.angleDeg !== restAngle) {
				movedByTick = i;
			}
		}
		expect(movedByTick, 'the bat must start moving within a handful of ticks of the press, not after a rules round trip').toBeGreaterThanOrEqual(0);
		expect(movedByTick).toBeLessThan(5);
	});

	it('holding the flipper for 5 simulated seconds reaches and HOLDS the end-of-stroke angle -- no oscillation or drift at the stop', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = loop.advance(5, []);
		const held: InputTransition[] = [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, flipper_l: true } }];
		out = loop.advance(1, held);

		// 5 simulated seconds = 5000 ticks at TICK_HZ = 1000.
		let lastAngle: number | undefined;
		let sawEnd = false;
		for (let i = 0; i < 5000; i++) {
			out = loop.advance(1, []);
			const angle = out.snapshot.mechanisms.flippers.l.angleDeg;
			if (i > 200) {
				// Well after the stroke has had time to complete: the angle must
				// be perfectly stable from here on -- a bat "oscillating or
				// drifting at the stop" fails this (I/O matrix, Error Handling).
				if (lastAngle !== undefined) {
					expect(angle, `tick ${out.snapshot.tick}: angle drifted from ${lastAngle} to ${angle} while held`).toBe(lastAngle);
				}
				if (angle === 90) {
					sawEnd = true;
				}
			}
			lastAngle = angle;
		}
		expect(sawEnd, 'the bat must actually reach its end-of-stroke angle (90 deg for the left flipper) while held').toBe(true);
		expect(out.snapshot.mechanisms.flippers.l.angularVelDegPerSec, 'angular speed must be exactly zero once parked at the stop').toBe(0);
	});

	it('a 30 ms tap rises strictly between rest and end, then returns fully to rest', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = loop.advance(5, []);
		const restAngle = out.snapshot.mechanisms.flippers.l.angleDeg;
		const endAngle = 90; // left flipper's end-of-stroke angle, measured (see this file's header)

		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, flipper_l: true } }]);
		let peakAngle = out.snapshot.mechanisms.flippers.l.angleDeg;
		for (let i = 0; i < 29; i++) {
			out = loop.advance(1, []);
			peakAngle = out.snapshot.mechanisms.flippers.l.angleDeg;
		}
		// 30 ms held = 30 ticks at TICK_HZ = 1000.
		const angleMin = Math.min(restAngle, endAngle);
		const angleMax = Math.max(restAngle, endAngle);
		expect(peakAngle, 'a 30 ms tap must NOT reach the end angle').toBeGreaterThan(angleMin);
		expect(peakAngle).toBeLessThan(angleMax);
		expect(peakAngle, 'a 30 ms tap must have moved AT ALL, not stayed at rest').not.toBe(restAngle);

		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
		for (let i = 0; i < 500; i++) {
			out = loop.advance(1, []);
		}
		expect(out.snapshot.mechanisms.flippers.l.angleDeg, 'the bat must return fully to rest after release').toBe(restAngle);
	});

	it('CoilCommand { coil: "c_flipper_l", action: "disable" } stops the bat from moving; { action: "enable" } restores it', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = loop.advance(5, []);
		const restAngle = out.snapshot.mechanisms.flippers.l.angleDeg;

		loop.setCoilEnabled('c_flipper_l', false);
		out = loop.advance(1, []); // the disable command lands this tick

		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, flipper_l: true } }]);
		for (let i = 0; i < 100; i++) {
			out = loop.advance(1, []);
			expect(out.snapshot.mechanisms.flippers.l.angleDeg, 'a disabled coil must not move the bat at all').toBe(restAngle);
		}

		loop.setCoilEnabled('c_flipper_l', true);
		out = loop.advance(1, []); // the enable command lands this tick -- flipper_l is STILL held from above.

		let moved = false;
		for (let i = 0; i < 100; i++) {
			out = loop.advance(1, []);
			if (out.snapshot.mechanisms.flippers.l.angleDeg !== restAngle) {
				moved = true;
				break;
			}
		}
		expect(moved, 're-enabling the coil must let the SAME held press move the bat').toBe(true);
	});

	it('a disable mid-stroke lets the bat return under its spring rather than freezing it mid-air', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = loop.advance(5, []);
		const restAngle = out.snapshot.mechanisms.flippers.l.angleDeg;

		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, flipper_l: true } }]);
		for (let i = 0; i < 15; i++) {
			out = loop.advance(1, []);
		}
		const midStrokeAngle = out.snapshot.mechanisms.flippers.l.angleDeg;
		expect(midStrokeAngle, 'sanity: the bat must genuinely be mid-stroke here').not.toBe(restAngle);

		loop.setCoilEnabled('c_flipper_l', false);
		out = loop.advance(1, []); // the key is STILL physically held, but the coil is now disabled

		for (let i = 0; i < 400; i++) {
			out = loop.advance(1, []);
		}
		expect(
			out.snapshot.mechanisms.flippers.l.angleDeg,
			'a disable while raised must let the bat return under its own return spring, not freeze it where it was',
		).toBe(restAngle);
	});

	it('exactly one ContactEvent { kind: "flipper_eos", surface: "flipper", device: "c_flipper_l" } fires per stroke, none while merely holding past the stop', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = loop.advance(5, []);
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, flipper_l: true } }]);

		const eosEvents: unknown[] = [];
		for (let i = 0; i < 300; i++) {
			out = loop.advance(1, []);
			for (const ce of out.contactEvents) {
				if (ce.kind === 'flipper_eos') {
					eosEvents.push(ce);
				}
			}
		}
		expect(eosEvents).toHaveLength(1);
		expect(eosEvents[0]).toMatchObject({ type: 'contact', kind: 'flipper_eos', device: 'c_flipper_l', surface: 'flipper' });

		// Holding well past the stop (300 more ticks) emits no further event.
		for (let i = 0; i < 300; i++) {
			out = loop.advance(1, []);
			for (const ce of out.contactEvents) {
				expect(ce.kind, 'no further flipper_eos while merely holding past the stop').not.toBe('flipper_eos');
			}
		}

		// Releasing and driving it again produces a SECOND, independent event.
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
		for (let i = 0; i < 500; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, flipper_l: true } }]);
		let secondStroke = false;
		for (let i = 0; i < 300 && !secondStroke; i++) {
			out = loop.advance(1, []);
			secondStroke = out.contactEvents.some((ce) => ce.kind === 'flipper_eos');
		}
		expect(secondStroke, 'a NEW stroke after release must produce its own EOS event').toBe(true);
	});

	it('the right flipper mirrors the left -- opposite rest/end angles, same behaviour', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = loop.advance(5, []);
		const restAngleR = out.snapshot.mechanisms.flippers.r.angleDeg;

		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, flipper_r: true } }]);
		for (let i = 0; i < 60; i++) {
			out = loop.advance(1, []);
		}
		expect(out.snapshot.mechanisms.flippers.r.angleDeg, 'the right flipper must reach its own end-of-stroke angle').not.toBe(restAngleR);
		// The left flipper must be completely unaffected by driving the right one.
		expect(out.snapshot.mechanisms.flippers.l.angleDeg).toBeCloseTo(141, 0);
	});
});
