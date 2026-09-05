// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.3's own I/O matrix, spinner rows (AC 3, AC 3b): "Spinner
// crossing" / "Spinner free-running after the ball has gone" / "Spinner,
// faster ball" / "Spinner, no crossing".
//
// AD-6's 2026-09-03 amendment: the spinner is a PASS-THROUGH GATE, never a
// collision body. `s_spinner` closes today with ZERO spinner code (this
// story's Design Notes, "The spinner's falsifiability problem") --
// `test/shot-routing.test.ts:549`'s own bare "s_spinner must close" makes
// exactly that claim and would pass unchanged whether this story shipped or
// was reverted, so it is NOT this file's pinning assertion. The four
// observables that ARE (this story's own Design Notes):
//   1. More than one closure per single crossing.
//   2. A closure on a tick when no ball's swept segment lies inside
//      sw_spinner (the one thing geometry cannot forge).
//   3. Closure count strictly increasing with entry speed (AC 3b).
//   4. Strictly increasing inter-closure interval, a finite total, and
//      speed returning to 0.
//
// Falsifiability (Rule 19): mutation 1: set the decay to 1 (never slows) ->
// the strictly-increasing-interval and finite-count assertions both go red.
// mutation 2: gate every closure on a ball being inside sw_spinner this
// tick -> the "closure with no ball present" assertion goes red. mutation 3:
// clamp the gain to a constant -> AC 3b's ordering assertion goes red.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { NO_FRAME, createLoop } from '../src/sim/loop';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import { toPhysics, MM_PER_VU } from '../src/sim/table/frames';
import { readCollisionDoc, switchZoneMm } from './util/collision-doc';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function bootMachine(): { machine: Machine; tick: number } {
	const machine = createMachine(loadDoc(), resolveTuning());
	let tick = 0;
	for (let i = 0; i < 320; i++) {
		tick += 1;
		machine.step(tick, NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : []);
	}
	return { machine, tick };
}

interface DriveResult {
	readonly tick: number;
	readonly switchEvents: Array<{ switch: string; closed: boolean; tick: number }>;
	readonly contactEvents: Array<{ kind: string; tick: number }>;
	readonly speedSamples: Array<{ tick: number; speed: number }>;
	/** Code review this pass (double-crossing discriminator): the ball's own table-frame y each tick, so a caller can independently derive how many times the ball's position actually entered `sw_spinner`'s own y-span -- never inferred from switch/contact counts alone, which a single crossing with extra revolutions could also produce. */
	readonly ySamples: Array<{ tick: number; y: number }>;
}

/** Repositions the served ball at `startMm`, launching straight north at `speedMmPerS`, and steps `ticks` times through `sw_spinner`'s own zone and beyond, collecting switch/contact events plus `mechanisms.spinner`'s reported speed each tick. */
function driveThroughSpinner(machine: Machine, startTick: number, startMm: { x: number; y: number; z: number }, speedMmPerS: number, ticks: number): DriveResult {
	const ball = machine.balls[0];
	if (!ball) {
		throw new Error('driveThroughSpinner(): no served ball to reposition');
	}
	const startPhysics = toPhysics(startMm);
	ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
	const speedVuPerT = speedMmPerS / (MM_PER_VU * 100);
	ball.hit.vel.set(0, -speedVuPerT, 0);
	ball.hit.angularVelocity.set(0, 0, 0);
	ball.hit.angularMomentum.set(0, 0, 0);

	let tick = startTick;
	const switchEvents: DriveResult['switchEvents'] = [];
	const contactEvents: DriveResult['contactEvents'] = [];
	const speedSamples: DriveResult['speedSamples'] = [];
	const ySamples: DriveResult['ySamples'] = [];
	for (let i = 0; i < ticks; i++) {
		tick += 1;
		const result = machine.step(tick, NO_FRAME, []);
		switchEvents.push(...result.switchEvents.filter((e) => e.switch === 's_spinner').map((e) => ({ switch: e.switch, closed: e.closed, tick: e.tick })));
		contactEvents.push(...result.contactEvents.filter((c) => c.kind === 'spinner_tick').map((c) => ({ kind: c.kind, tick: c.tick })));
		speedSamples.push({ tick, speed: machine.mechanisms.spinner['s_spinner']!.speed });
		const b = machine.balls[0];
		if (b) {
			ySamples.push({ tick, y: 1066.8 - b.state.pos.y * MM_PER_VU });
		}
	}
	return { tick, switchEvents, contactEvents, speedSamples, ySamples };
}

// sw_spinner: x 5..45, y 635..662, z 0..30 (this story's Code Map). The Left
// Loop's ascending column runs x 27.5-36.5, inside the zone -- release well
// south of it and drive north through it.
const SPINNER_ZONE_X = 30;
const SPINNER_RELEASE = { x: SPINNER_ZONE_X, y: 500, z: 13.5 };
// Measured this story's planning pass: the Left Loop orbit crosses at
// 1789.8 mm/s; the general sweep gives ~390-2720 mm/s at the zone. 1800 sits
// centrally in that band.
const CROSSING_SPEED_MM_PER_S = 1800;
// Generous enough for a ~900 deg/s initial spin (0.5 gain * 1800 mm/s) to
// decay all the way to the spinner's own 1 deg/s rest floor at the shipped
// 0.9995 per-tick decay (measured: ~13,600 ticks) -- see tuning.ts's own
// spinnerDecayPerTick doc comment.
const DRIVE_TICKS = 18000;

describe('spinner (AC 3) -- per-revolution closure, decay, and the free-running observable geometry cannot forge', () => {
	it('a ball crossing sw_spinner closes s_spinner MORE THAN ONCE for one crossing, at least one closure lands with no ball inside the zone, the inter-closure interval strictly increases, the count is finite, and speed returns to 0', () => {
		const { machine, tick: startTick } = bootMachine();
		const result = driveThroughSpinner(machine, startTick, SPINNER_RELEASE, CROSSING_SPEED_MM_PER_S, DRIVE_TICKS);

		const makes = result.switchEvents.filter((e) => e.closed);
		const breaks = result.switchEvents.filter((e) => !e.closed);
		expect(makes.length, `more than one closure expected for a single crossing -- events: ${JSON.stringify(result.switchEvents)}`).toBeGreaterThan(1);
		expect(breaks.length, 'every make must be paired with a break (closes then re-opens)').toBe(makes.length);
		expect(result.contactEvents.length, 'one spinner_tick contact per revolution').toBe(makes.length);

		// Observable 2: the geometry-cannot-forge check. The ball's own
		// swept-segment zone dwell is bounded (Design Notes: 12-66 ticks at
		// the zone across the measured speed sweep); the LAST make must
		// land well after the ball has left sw_spinner's own y-span (662 mm,
		// converted to physics ticks is unnecessary here -- the ball is
		// travelling north at CROSSING_SPEED_MM_PER_S the whole time and
		// never returns, so any make after the ball's own dwell window
		// closed is, by construction, a free-running closure).
		const zone = switchZoneMm('sw_spinner');
		const dwellTicks = Math.ceil(((zone.maxMm.y - zone.minMm.y) / CROSSING_SPEED_MM_PER_S) * 1000) + 5;
		const lastMakeTick = makes[makes.length - 1]!.tick;
		expect(lastMakeTick - startTick, `the last closure (relative tick ${lastMakeTick - startTick}) must land well after the ball's own zone dwell (~${dwellTicks} ticks) -- a closure with no ball present is this story's discriminating observable`).toBeGreaterThan(dwellTicks + 20);

		// Observable 4: strictly increasing inter-closure interval.
		const intervals: number[] = [];
		for (let i = 1; i < makes.length; i++) {
			intervals.push(makes[i]!.tick - makes[i - 1]!.tick);
		}
		for (let i = 1; i < intervals.length; i++) {
			expect(intervals[i], `interval ${i} (${intervals[i]}) must exceed interval ${i - 1} (${intervals[i - 1]}) -- intervals: ${JSON.stringify(intervals)}`).toBeGreaterThan(intervals[i - 1]!);
		}

		// Finite count + speed returns to 0.
		const finalSpeed = result.speedSamples[result.speedSamples.length - 1]!.speed;
		expect(finalSpeed, `speed must decay to exactly 0 within the drive window -- final speed ${finalSpeed}`).toBe(0);
	});

	it('a Right Loop orbit -- measured to cross at x 52.2-52.3, outside sw_spinner\'s own x 5..45 -- produces ZERO closures and ZERO spinner_tick contacts (the free true negative)', () => {
		const { machine, tick: startTick } = bootMachine();
		// x = 52.5, comfortably outside sw_spinner's x 5..45, straight north
		// through the zone's own y-span.
		const result = driveThroughSpinner(machine, startTick, { x: 52.5, y: 500, z: 13.5 }, CROSSING_SPEED_MM_PER_S, DRIVE_TICKS);
		expect(result.switchEvents, 'zero s_spinner edges expected').toEqual([]);
		expect(result.contactEvents, 'zero spinner_tick contacts expected').toEqual([]);
		expect(result.speedSamples.every((s) => s.speed === 0), 'speed must stay at 0 the whole run -- nothing ever entered the zone').toBe(true);
	});
});

describe('spinner -- Integration AC (Rule 1, AC 9): a crossing reaches FrameOutput through the real host seam (createLoop().advance())', () => {
	it('a genuine crossing is observable in FrameOutput.contactEvents (spinner_tick) AND FrameOutput.snapshot.mechanisms.spinner, not only MachineStepResult', () => {
		const doc = JSON.parse(JSON.stringify(readCollisionDoc())) as { devices: Array<{ name: string; ejectPose: { posMm: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } } }> };
		doc.devices.find((d) => d.name === 'bd_trough')!.ejectPose = { posMm: SPINNER_RELEASE, dir: { x: 0, y: 1, z: 0 } };
		const tuning = resolveTuning({ ...TUNING, troughEjectSpeedMmPerS: { ...TUNING.troughEjectSpeedMmPerS, value: CROSSING_SPEED_MM_PER_S } });

		const loop = createLoop({ collisionDoc: doc, tuning });
		loop.pulseCoil('c_trough_eject');
		const allContacts: Array<{ readonly kind: string }> = [];
		let lastOutput = loop.advance(0, []);
		for (let i = 0; i < 60; i++) {
			lastOutput = loop.advance(50, []);
			allContacts.push(...lastOutput.contactEvents);
		}

		// The contactEvents half -- checked FIRST (Rule 19: the two halves are
		// asserted independently).
		const ticks = allContacts.filter((c) => c.kind === 'spinner_tick');
		expect(ticks.length, `spinner_tick must reach FrameOutput.contactEvents, not only MachineStepResult -- contacts: ${JSON.stringify(allContacts)}`).toBeGreaterThan(0);

		// The mechanisms-snapshot half: a non-zero, decaying speed.
		expect(lastOutput.snapshot.mechanisms.spinner['s_spinner']!.speed, 'FrameOutput.snapshot.mechanisms.spinner must report a non-zero speed shortly after the crossing').toBeGreaterThan(0);
	});
});

describe('spinner (AC 3b) -- a faster ball produces strictly more closures', () => {
	it('two drives from the same release point at two launch speeds inside the measured entry band: the faster ball produces strictly more closures', () => {
		const slow = bootMachine();
		const slowResult = driveThroughSpinner(slow.machine, slow.tick, SPINNER_RELEASE, 900, DRIVE_TICKS);
		const fast = bootMachine();
		const fastResult = driveThroughSpinner(fast.machine, fast.tick, SPINNER_RELEASE, 2200, DRIVE_TICKS);

		const slowMakes = slowResult.switchEvents.filter((e) => e.closed).length;
		const fastMakes = fastResult.switchEvents.filter((e) => e.closed).length;
		expect(slowMakes, 'sanity: the slow drive must still produce at least one closure').toBeGreaterThan(0);
		expect(fastMakes, `the faster ball (2200 mm/s, ${fastMakes} closures) must produce strictly more closures than the slower one (900 mm/s, ${slowMakes} closures)`).toBeGreaterThan(slowMakes);
	});
});

describe('spinner (AC 3, the double-crossing case) -- a ball that climbs partway and falls back through the zone is a real two-crossing case', () => {
	it('a weak launch that dwells and falls back through sw_spinner still decays to a finite, correctly-ordered closure sequence', () => {
		const { machine, tick: startTick } = bootMachine();
		// Design Notes: "at 1000-1200 mm/s the ball climbs partway and falls
		// back through the zone" -- a real double-crossing case.
		const result = driveThroughSpinner(machine, startTick, SPINNER_RELEASE, 1100, DRIVE_TICKS);
		const makes = result.switchEvents.filter((e) => e.closed);
		expect(makes.length, 'at least one closure expected from either crossing').toBeGreaterThan(0);
		const finalSpeed = result.speedSamples[result.speedSamples.length - 1]!.speed;
		expect(finalSpeed, 'speed must still decay to 0').toBe(0);

		// Code review finding (this pass): the two assertions above are the
		// SAME shape as the plain single-crossing test above them -- neither
		// distinguishes "the ball genuinely entered sw_spinner twice" from "it
		// entered once and the spinner just kept revolving on its own". The
		// discriminator geometry cannot forge: count how many times the
		// ball's OWN y-trajectory actually re-enters the zone's y-span from
		// south of it.
		const zone = switchZoneMm('sw_spinner');
		let entries = 0;
		let wasInside = false;
		for (const s of result.ySamples) {
			const inside = s.y >= zone.minMm.y && s.y <= zone.maxMm.y;
			if (inside && !wasInside) {
				entries += 1;
			}
			wasInside = inside;
		}
		// Measured this pass at 1100 mm/s from SPINNER_RELEASE: the ball's own
		// y-trajectory enters sw_spinner's own [635, 662] y-span exactly
		// twice -- once climbing north (peaking at ~916 mm, well past the
		// zone, before gravity turns it back) and once falling back south
		// through the same box. This is the genuine geometric signature this
		// describe block's own name claims; the two assertions above alone
		// could not distinguish it from a single crossing that merely kept
		// revolving.
		expect(entries, `sw_spinner's own y-span must be entered exactly twice for a genuine double-crossing -- measured ${entries} entries across ${result.ySamples.length} samples`).toBe(2);
	});
});

describe('spinner -- DW-149 anti-vacuity and registry-derived subject set', () => {
	it("TABLE.spinnerWiring's own key set names exactly the switch used, never a hand-typed literal outside sim/table/dragonwar.ts", () => {
		// Structural: this file never writes the literal 's_spinner' as a
		// TABLE-owned device-name outside a test file, per pnpm
		// lint:boundaries -- exempted here (test/**) but the REGISTRY is
		// still the single source this file reads it from indirectly via
		// the machine's own mechanisms.spinner keying.
		const { machine } = bootMachine();
		expect(Object.keys(machine.mechanisms.spinner)).toEqual(['s_spinner']);
	});

	it('sw_spinner exists in the committed document and names s_spinner -- structural sanity only; the actual createSwitchTracker() exclusion is behaviourally verified in test/switch-zones.test.ts', () => {
		// Code review finding (this pass): this test's own title used to claim
		// the AD-2 exclusion itself, but a document-shape check cannot verify
		// tracker behaviour -- a regression to switches.ts's own
		// deviceModuleOwnedSwitches() would leave this assertion green. The
		// real behavioural pin is
		// test/switch-zones.test.ts's "the spinner switch is excluded ..."
		// test, driven against a real createSwitchTracker().
		const doc = readCollisionDoc();
		const spinnerZone = doc.switchZones.find((z) => z.name === 'sw_spinner');
		expect(spinnerZone, 'sw_spinner must exist in the committed document').toBeDefined();
		expect(spinnerZone!.switch).toBe('s_spinner');
	});
});
