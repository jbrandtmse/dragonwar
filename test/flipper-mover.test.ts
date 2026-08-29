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
// Rework iteration 3 added two rows: the mover is UNCHANGED at the press
// tick t itself but has ALREADY moved by t+1 (task 26, the AD-5 same-tick
// ordering pin -- fails when machine.ts's applyFrame() calls move after
// physics.step()), and a genuinely mid-stroke, non-zero angularVelDegPerSec
// checked against an independently derived value (Fix Pack 27b).
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
import { TICK_HZ } from '../src/sim/contracts/time';
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

		// A loose upper bound only: the bat starts moving within a handful of
		// ticks of the press. The PRECISE boundary AC 2 states is pinned by the
		// task-26 test immediately below, which is what actually goes red when
		// the hardware rule is moved after physics.step().
		//
		// Code review 2026-08-29 (iteration 2): the previous comment here
		// argued that a round-tripped design "would show no movement for many
		// MORE ticks". The demonstrated mutation shows it is exactly ONE more
		// tick -- which is precisely why this test stayed green under it and
		// why the task-26 test had to be added. The claim was removed rather
		// than left standing as a disproved rationale.
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

	// Task 26 (rework, iteration 3): the row above only bounds "within a
	// handful of ticks", which a ONE-TICK-LATE hardware rule (the exact
	// latency AD-5 forbids) also satisfies -- the code review demonstrated
	// this: moving both `applyFrame` calls in `machine.ts` to AFTER
	// `physics.step()` left the entire suite, including the test above,
	// green. This test pins the PRECISE boundary the amended AC-2 states:
	// unchanged AT the press tick t itself (never asserted -- deviating from
	// the verbatim port is impossible, see this spec's Design Notes, "The AC
	// 2 amendment"), but ALREADY changed by tick t+1, with no gap tick
	// between them. A rules-round-tripped (or simply one-tick-late) mover
	// shows its first change at t+2 instead, which this test catches and the
	// row above does not (t+2 is still "within a handful of ticks").
	// Demonstrated red for this exact test: moving `machine.ts`'s two
	// `applyFrame(...)` calls to after `physics.step()` (this spec's
	// `## Verification` records the mutation and the failure).
	it('AD-5: the mover is UNCHANGED at the press tick t itself, but has ALREADY moved by tick t+1 -- no extra tick of latency', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = loop.advance(5, []); // settle at rest
		const restTick = out.snapshot.tick;
		const restAngle = out.snapshot.mechanisms.flippers.l.angleDeg;

		const pressTick = restTick + 1;
		out = loop.advance(1, [{ tick: pressTick, frame: { ...NO_FRAME, flipper_l: true } }]);
		expect(out.snapshot.tick).toBe(pressTick);
		expect(out.commands, 'RulesStepResult.commands stays readonly never[] -- AD-5, no rules round trip').toEqual([]);
		expect(
			out.snapshot.mechanisms.flippers.l.angleDeg,
			'AC 2 (amended): the angle must be UNCHANGED at the press tick t itself -- the coil energises inside this same physics step, but the ported mover\'s torque needs one full step to ramp back through zero (Design Notes, "The AC 2 amendment")',
		).toBe(restAngle);

		out = loop.advance(1, []); // tick t+1, no new transition -- the press is already latched in the frame
		expect(out.snapshot.tick).toBe(pressTick + 1);
		expect(
			out.snapshot.mechanisms.flippers.l.angleDeg,
			'the mover MUST have visibly moved by tick t+1 -- a hardware rule applied one tick late (a rules round trip, or machine.ts running applyFrame() after physics.step()) instead first moves the bat at t+2, which this exact tick would NOT yet show',
		).not.toBe(restAngle);
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

	// Task 27 (Fix Pack, item b -- "Fix Pack 27b"): the row above only ever
	// asserts `angularVelDegPerSec` at ZERO (rest, and again once parked at
	// the stop) -- which a broken conversion (a 100x unit error dropping the
	// `/ DEFAULT_STEPTIME_S`, a 57x error dropping `radToDeg`, or simply
	// returning a hardcoded `0`) satisfies just as well as a correct one.
	// This test pins a genuinely MID-STROKE, non-zero value, checked against
	// an INDEPENDENT computation -- the tick-over-tick change in the same
	// snapshot's `angleDeg`, times `TICK_HZ` (ticks/second) -- rather than a
	// second hardcoded magic number, so it does not risk encoding the same
	// bug it is meant to catch. Demonstrated red: scaling
	// `angularVelDegPerSec`'s reported value in `flippers.ts` (this spec's
	// `## Verification` records the mutation and the failure).
	//
	// Why TICK_HZ (1000) here and DEFAULT_STEPTIME_S (0.01) in flippers.ts's
	// own conversion are not the same number, and that is expected: one sim
	// tick is exactly one `physics.step()` call (`src/sim/loop/index.ts`'s
	// `advance()` loop runs `machine.step()` once per owed tick), while the
	// ported mover's `angleSpeed` is expressed in vpx-js's own time-scaled
	// native units via `PHYS_FACTOR` (`constants.ts`) -- the same upstream
	// convention `physicsVelocityToTableMmPerS()` already accounts for with
	// its own x100 factor (`loop/index.ts:160-164`). This test's tick-based
	// derivative and `flippers.ts`'s own conversion describe the SAME real
	// angular velocity through two independently-derived paths; verified
	// empirically to agree here, not assumed.
	it('AD-5/AC-3 (Fix Pack 27b): angularVelDegPerSec mid-stroke matches the INDEPENDENTLY measured per-tick change in angleDeg, not a stuck zero', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = loop.advance(5, []);
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, flipper_l: true } }]);

		let previousAngle = out.snapshot.mechanisms.flippers.l.angleDeg;
		let sampledNonZero = 0;
		for (let i = 0; i < 30; i++) {
			out = loop.advance(1, []);
			const angle = out.snapshot.mechanisms.flippers.l.angleDeg;
			const reportedVel = out.snapshot.mechanisms.flippers.l.angularVelDegPerSec;
			const deltaPerTick = angle - previousAngle;
			// Mid-stroke only, deliberately clear of TWO boundaries this simple
			// derivative check cannot span: the very first ramp-up tick (the
			// torque is still reversing sign, per the AC 2 amendment) and the
			// end-of-stroke region, where the ported mover's hit-time clamp
			// produces a genuine, ported mechanical BOUNCE off the stop --
			// measured on the committed geometry: the bat first crosses 90 deg
			// around i=32, then overshoots to ~94.2 deg (i=38) before damping
			// back down, so a single tick's average angle-delta and the
			// instantaneous angleSpeed the mover reports genuinely diverge
			// there (a real transient, not a bug -- the same reason the "5 s
			// hold" test above waits until tick 200 before asserting
			// stability). i=5..25 is comfortably inside the smooth part of the
			// swing on this geometry, well clear of both edges.
			if (i >= 5 && i <= 25 && deltaPerTick !== 0) {
				const derivedVel = deltaPerTick * TICK_HZ;
				expect(
					reportedVel,
					`tick ${out.snapshot.tick}: angularVelDegPerSec (${reportedVel}) must match the measured per-tick angle change (${deltaPerTick} deg/tick * ${TICK_HZ} ticks/s = ${derivedVel} deg/s) -- a 100x or 57x conversion error, or a hardcoded 0, would diverge here`,
				).toBeCloseTo(derivedVel, 0);
				expect(reportedVel, 'sanity: this sample must be genuinely non-zero, not a degenerate mid-stroke tick').not.toBe(0);
				sampledNonZero++;
			}
			previousAngle = angle;
		}
		expect(sampledNonZero, 'the sampled window must have actually caught the bat mid-swing -- otherwise this test asserts nothing').toBeGreaterThan(10);
	});

	it('a 30 ms tap rises strictly between rest and end, then returns fully to rest', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = loop.advance(5, []);
		const restAngle = out.snapshot.mechanisms.flippers.l.angleDeg;
		const endAngle = 90; // left flipper's end-of-stroke angle, measured (see this file's header)

		// Code review 2026-08-29 (iteration 2): the PEAK excursion is tracked
		// across the hold AND the post-release coast, not sampled once at the
		// moment of release. The bat is still accelerating when the key comes
		// up, so it coasts well past the release angle under its own momentum:
		// measured on the committed geometry, release is at 104.4 deg but the
		// true peak is 90.04 deg -- only 0.04 deg short of the 90 deg stop.
		// The previous form sampled the release angle and called it `peak`,
		// which passed with a comfortable 14 deg margin while the observable
		// the AC actually names ("the bat's PEAK angle lies strictly between
		// the rest and end angles") was never measured. NOTE how tight the real
		// margin is: a 30 ms tap on this tuning very nearly completes the
		// stroke, so this assertion is genuinely load-bearing and any flipper
		// tuning change should expect to have to re-measure it (ledger DW-79).
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, flipper_l: true } }]);
		const angleMin = Math.min(restAngle, endAngle);
		const angleMax = Math.max(restAngle, endAngle);
		// The bat travels from rest (141) DOWN toward the end angle (90), so
		// its peak excursion is the MINIMUM angle it reaches.
		let peakAngle = out.snapshot.mechanisms.flippers.l.angleDeg;
		const trackPeak = (): void => {
			peakAngle = Math.min(peakAngle, out.snapshot.mechanisms.flippers.l.angleDeg);
		};
		for (let i = 0; i < 29; i++) {
			out = loop.advance(1, []); // 30 ms held = 30 ticks at TICK_HZ = 1000.
			trackPeak();
		}
		const angleAtRelease = out.snapshot.mechanisms.flippers.l.angleDeg;
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
		trackPeak();
		for (let i = 0; i < 500; i++) {
			out = loop.advance(1, []);
			trackPeak();
		}

		expect(peakAngle, 'a 30 ms tap must NOT reach the end angle, counting the post-release coast').toBeGreaterThan(angleMin);
		expect(peakAngle).toBeLessThan(angleMax);
		expect(peakAngle, 'a 30 ms tap must have moved AT ALL, not stayed at rest').not.toBe(restAngle);
		expect(peakAngle, 'the peak must be past the release angle -- the bat coasts on after the key comes up, which is the whole reason this is tracked rather than sampled').toBeLessThan(angleAtRelease);
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
		// Code review 2026-08-29 (iteration 2): asserts the right bat's real
		// mirrored angles, not merely "it moved". The previous form was
		// `not.toBe(restAngleR)`, which any movement at all satisfied while its
		// message claimed the end-of-stroke angle had been reached -- and no
		// test in the suite pinned ANY right-flipper angle value. Measured on
		// the committed geometry, mirroring the left bat's 141 -> 90 exactly.
		expect(restAngleR, 'the right flipper rests at the mirror of the left bat (141 deg)').toBeCloseTo(-141, 1);
		expect(out.snapshot.mechanisms.flippers.r.angleDeg, "the right flipper must reach its own end-of-stroke angle (the mirror of the left bat's 90 deg)").toBeCloseTo(-90, 1);
		// The left flipper must be completely unaffected by driving the right one.
		expect(out.snapshot.mechanisms.flippers.l.angleDeg).toBeCloseTo(141, 0);
	});
});
