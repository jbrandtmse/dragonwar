// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.3's own I/O matrix, drop-target-bank rows (AC 1, AC 1b, AC 2):
// "Target struck, drops" / "Neighbour grazed, own target NOT struck
// (DW-122-adjacent)" / "Dropped target re-struck" / "Bank reset" / "Bank
// reset with coil disabled" / "Bank reset with nothing down".
//
// The bank is now device-owned end to end (AD-2): `s_dragon_*` reaches
// `machine.step().switchEvents` from `sim/physics/drop-targets.ts` alone,
// never from `switches.ts`'s generic tracker (see that file's own widened
// `deviceModuleOwnedSwitches()`). A target drops on a GENUINE STRIKE on its
// own body -- `HitObject.collide()` firing on one of its 8 retained hit
// objects -- never on a zone make alone; this file's own release points are
// measured against the real committed geometry, in the `test/pop-bumper.test.ts`
// mould (drive `machine.step()` directly, read both `switchEvents` and
// `contactEvents`).
//
// Falsifiability (Rule 19, this story's own Verification section):
// mutation 1: make the drop non-latching (clear the down flag and
// re-enable the hit objects at the end of each tick) -> "stays down through
// further contact" goes red naming the second closed:true/drop_target_down.
// mutation 2: skip setEnabled(false) while still emitting the edge/contact
// -> the "non-collidable" test goes red naming the ball's measured rebound.
// mutation 3: replace the body-strike condition with the zone make alone ->
// the AC 1b case goes red naming s_dragon_d closed when col_dragon_r was
// the one measurably struck. Both mutations were applied by hand this pass,
// observed red, and reverted (see this story's completion report).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { NO_FRAME, createLoop } from '../src/sim/loop';
import { loadCollision } from '../src/sim/physics/loader';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { toPhysics, MM_PER_VU } from '../src/sim/table/frames';
import type { DropTargetLetter } from '../src/sim/physics/drop-targets';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** DW-149 anti-vacuity: derived from TABLE.dropBankWiring's own key set, never a hand-typed letter list. */
const LETTERS = Object.keys(TABLE.dropBankWiring) as DropTargetLetter[];

function bootMachine(): { machine: Machine; tick: number } {
	const machine = createMachine(loadDoc(), resolveTuning());
	let tick = 0;
	for (let i = 0; i < 320; i++) {
		tick += 1;
		machine.step(tick, NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : []);
	}
	return { machine, tick };
}

/** Repositions the served ball at `startMm`, launching straight north (table +y, dirDeg 0) at `speedMmPerS`, and steps `ticks` times, collecting every switchEvent/contactEvent produced. Mirrors `test/shot-routing.test.ts`'s own driveShot() convention (residual spin zeroed, or friction walks the ball sideways). */
function driveStraight(machine: Machine, startTick: number, startMm: { x: number; y: number; z: number }, speedMmPerS: number, ticks: number) {
	const ball = machine.balls[0];
	if (!ball) {
		throw new Error('driveStraight(): no served ball to reposition');
	}
	const startPhysics = toPhysics(startMm);
	ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
	const speedVuPerT = speedMmPerS / (MM_PER_VU * 100);
	ball.hit.vel.set(0, -speedVuPerT, 0);
	ball.hit.angularVelocity.set(0, 0, 0);
	ball.hit.angularMomentum.set(0, 0, 0);

	let tick = startTick;
	const switchEvents: Array<{ switch: string; closed: boolean; tick: number }> = [];
	const contactEvents: Array<{ kind: string; ballId?: number; tick: number }> = [];
	for (let i = 0; i < ticks; i++) {
		tick += 1;
		const result = machine.step(tick, NO_FRAME, []);
		switchEvents.push(...result.switchEvents.map((e) => ({ switch: e.switch, closed: e.closed, tick: e.tick })));
		contactEvents.push(...result.contactEvents.map((c) => ({ kind: c.kind, ballId: c.ballId, tick: c.tick })));
	}
	return { tick, switchEvents, contactEvents };
}

// Release points measured against the committed document, D-R-A-G-O-N order
// x 217.4-227.4 / 228.4-238.4 / 239.4-249.4 / 250.4-260.4 / 261.4-271.4 /
// 272.4-282.4, all y 700-708 (test/util/shot-cases.ts's own Code Map
// measurement). 227.4 (d's own east edge) is the SAME release
// `dragon-target-d` uses -- re-verified this story (apex (227.40, 686.48),
// inside col_dragon_d's own span).
const D_CENTRE_RELEASE = { x: 227.4, y: 520, z: 13.5 };
const RELEASE_SPEED_MM_PER_S = 1600;
const RELEASE_TICKS = 2000;

describe('drop-target bank (AC 1) -- a genuine strike latches, disables, and reports exactly once', () => {
	it("s_dragon_d closes exactly once, mechanisms.dropTargets['s_dragon_d'] becomes true, and exactly one drop_target_down contact fires", () => {
		const { machine, tick: startTick } = bootMachine();
		const { switchEvents, contactEvents } = driveStraight(machine, startTick, D_CENTRE_RELEASE, RELEASE_SPEED_MM_PER_S, RELEASE_TICKS);

		const dMakes = switchEvents.filter((e) => e.switch === 's_dragon_d' && e.closed);
		expect(dMakes.length, `s_dragon_d must close exactly once -- events: ${JSON.stringify(switchEvents)}`).toBe(1);
		expect(switchEvents.filter((e) => e.switch === 's_dragon_d' && !e.closed).length, 'no bank reset happened -- s_dragon_d must not open').toBe(0);

		const drops = contactEvents.filter((c) => c.kind === 'drop_target_down');
		expect(drops.length, `exactly one drop_target_down contact expected -- contacts: ${JSON.stringify(contactEvents)}`).toBe(1);
		expect(drops[0]!.ballId, 'the contact must carry the striking ball\'s id').toBeDefined();

		expect(machine.mechanisms.dropTargets['s_dragon_d'], 'mechanisms.dropTargets must report the struck target down').toBe(true);
		for (const letter of LETTERS) {
			if (letter === 'd') {
				continue;
			}
			expect(machine.mechanisms.dropTargets[TABLE.dropBankWiring[letter].switch], `only s_dragon_d struck -- ${letter} must stay up`).toBe(false);
		}
	});

	it('a dropped target is non-collidable: driven again on the same column, D itself never re-triggers, and the ball makes genuine forward progress past its first-strike resting point (passes through rather than rebounding)', () => {
		const { machine, tick: startTick } = bootMachine();
		const first = driveStraight(machine, startTick, D_CENTRE_RELEASE, RELEASE_SPEED_MM_PER_S, RELEASE_TICKS);
		expect(machine.mechanisms.dropTargets['s_dragon_d']).toBe(true);
		const ballAfterFirst = machine.balls[0]!;
		const firstRestYMm = 1066.8 - ballAfterFirst.state.pos.y * MM_PER_VU;

		// Re-drive the SAME served ball back down the SAME column -- the
		// target's own collidability, not the ball's identity, is under
		// test (AD-6: "a dropped target is non-collidable until reset").
		// D's own pitch (11 mm) is narrower than the ball's own diameter
		// (26.99 mm), so once D no longer blocks it the ball's straight path
		// genuinely comes within reach of its immediate neighbour R (the
		// same geometry AC 1b's own release measures) -- this is real
		// bank-packing geometry, not a collision D itself produced, which is
		// exactly why this assertion is scoped to D's OWN switch/contact
		// rather than to "zero further contacts of any kind".
		const second = driveStraight(machine, first.tick, D_CENTRE_RELEASE, RELEASE_SPEED_MM_PER_S, RELEASE_TICKS);
		expect(second.switchEvents.filter((e) => e.switch === 's_dragon_d'), `no further s_dragon_d edge expected -- events: ${JSON.stringify(second.switchEvents)}`).toEqual([]);
		// Code review finding (this pass): drop_target_down carries no
		// letter/device identifier (see the frontmatter `deferred:` entry this
		// pass adds), so this count alone cannot distinguish "D re-dropped"
		// from "R (D's own neighbour) genuinely dropped for the first time" --
		// only the s_dragon_d switchEvents assertion above actually pins that
		// D specifically did not re-fire. This assertion is a looser backup
		// bound: at most one drop_target_down for this ball across the whole
		// second drive, whichever target produced it.
		expect(second.contactEvents.filter((c) => c.kind === 'drop_target_down' && c.ballId === ballAfterFirst.id).length, 'at most one drop_target_down for this ball is expected across the second drive (D re-dropping, or any single genuine neighbour drop) -- two would mean D re-dropped in addition to a neighbour').toBeLessThanOrEqual(1);

		// "No collision response" from D itself: the ball must make genuine
		// NET forward progress past where D's own (now-removed) body used to
		// stop it, rather than resting at the same point or rebounding south
		// of it.
		const ball = machine.balls[0];
		expect(ball, 'the ball must still be in the simulated set').toBeDefined();
		const posMm = { x: ball!.state.pos.x * MM_PER_VU, y: 1066.8 - ball!.state.pos.y * MM_PER_VU };
		expect(posMm.y, `the ball must have progressed north of its first-strike resting y (${firstRestYMm.toFixed(3)}) -- second-pass y ${posMm.y.toFixed(3)}`).toBeGreaterThan(firstRestYMm + 1);

		// [ADDED, code review this pass.] The resting-position assertion above
		// is the ONLY one that can observe collidability at all (the
		// s_dragon_d assertion is made true by `applyPostStep()`'s own
		// already-down guard whether or not the body was disabled, and the
		// drop_target_down bound is satisfied by zero drops), and it is far
		// weaker than it looks: both values it compares are "wherever the ball
		// settled at the drain after RELEASE_TICKS", not "where D's body used
		// to stop it". Measured read-only this pass by pulsing
		// c_dragon_bank_reset to make D a body again before the second drive:
		// D-still-collidable rests at y = 85.654 against the first drive's
		// 85.636 -- 0.018 mm apart. The whole regression is caught by the
		// literal `+ 1`, i.e. by 0.982 mm on a chaotic drain path, and any
		// change to drain dynamics that moves the second resting point a
		// millimetre north defeats it entirely.
		//
		// The sharp observable was already being collected and thrown away.
		// D's own pitch (11 mm) is narrower than the ball's diameter, so once
		// D is gone the same straight column reaches its neighbour R and
		// genuinely strikes it -- an event that is IMPOSSIBLE while D is still
		// a body, because D stops the ball short of it. Measured: with D
		// disabled the second drive emits exactly one `s_dragon_r closed:true`
		// (contact at (227.396, 686.527), against the bank's own y 700..708
		// face); with D re-enabled it emits none at all.
		expect(
			second.switchEvents.filter((e) => e.switch === 's_dragon_r' && e.closed).length,
			`the second drive must genuinely strike D's neighbour R -- reachable ONLY because D is no longer a body -- got ${JSON.stringify(second.switchEvents)}. This is the assertion that actually observes setEnabled(false); the resting-position bound above is a 1 mm coincidence on a drain path.`,
		).toBe(1);
	});
});

describe('drop-target bank -- Integration AC (Rule 1, AC 9): a strike reaches FrameOutput through the real host seam (createLoop().advance())', () => {
	it('a genuine strike is observable in FrameOutput.contactEvents (drop_target_down) AND FrameOutput.snapshot.mechanisms.dropTargets, not only MachineStepResult', () => {
		const doc = JSON.parse(JSON.stringify(loadDoc())) as { devices: Array<{ name: string; ejectPose: { posMm: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } } }> };
		doc.devices.find((d) => d.name === 'bd_trough')!.ejectPose = { posMm: D_CENTRE_RELEASE, dir: { x: 0, y: 1, z: 0 } };
		const tuning = resolveTuning({ ...TUNING, troughEjectSpeedMmPerS: { ...TUNING.troughEjectSpeedMmPerS, value: RELEASE_SPEED_MM_PER_S } });

		const loop = createLoop({ collisionDoc: doc, tuning });
		loop.pulseCoil('c_trough_eject');
		const allContacts: Array<{ readonly kind: string; readonly ballId?: number }> = [];
		let lastOutput = loop.advance(0, []);
		for (let i = 0; i < 60; i++) {
			lastOutput = loop.advance(50, []);
			allContacts.push(...lastOutput.contactEvents);
		}

		// The contactEvents half -- checked FIRST, so a mutation that breaks
		// only the mechanisms-snapshot half (below) still lets this half run
		// and pass, proving the two are asserted independently (Rule 19).
		const drops = allContacts.filter((c) => c.kind === 'drop_target_down');
		expect(drops, `drop_target_down must reach FrameOutput.contactEvents, not only MachineStepResult -- contacts: ${JSON.stringify(allContacts)}`).toHaveLength(1);

		// The mechanisms-snapshot half.
		expect(lastOutput.snapshot.mechanisms.dropTargets['s_dragon_d'], 'FrameOutput.snapshot.mechanisms.dropTargets must report the struck target down').toBe(true);
	});
});

describe('drop-target bank (AC 1b, DW-122-adjacent) -- the drop is caused by the strike, not the zone', () => {
	it('a release at x = 228.9 measurably strikes col_dragon_r -- R drops and D does not, even though the OLD zone test would have closed s_dragon_d through its own +2 mm margin', () => {
		const { machine, tick: startTick } = bootMachine();
		const { switchEvents, contactEvents } = driveStraight(machine, startTick, { x: 228.9, y: 520, z: 13.5 }, RELEASE_SPEED_MM_PER_S, RELEASE_TICKS);

		expect(switchEvents.some((e) => e.switch === 's_dragon_r' && e.closed), `s_dragon_r must close -- this is the discriminating case AC 1b names -- events: ${JSON.stringify(switchEvents)}`).toBe(true);
		expect(switchEvents.some((e) => e.switch === 's_dragon_d' && e.closed), `s_dragon_d must NOT close -- a design that drops D here is the "switch make through a neighbour's margin" vacuity this epic already shipped once -- events: ${JSON.stringify(switchEvents)}`).toBe(false);

		expect(machine.mechanisms.dropTargets['s_dragon_r'], 'R must report down').toBe(true);
		expect(machine.mechanisms.dropTargets['s_dragon_d'], 'D must report up').toBe(false);
		expect(contactEvents.filter((c) => c.kind === 'drop_target_down').length, 'exactly one target genuinely dropped').toBe(1);
	});
});

describe('drop-target bank (AC 2) -- bank reset', () => {
	function pulseResetTick(machine: Machine, tick: number, enabled: boolean) {
		return machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_dragon_bank_reset', action: enabled ? 'enable' : 'disable', tick }]);
	}

	it('raises the struck target BEFORE the same tick\'s solve, emits one closed:false edge per target that was down, and one bank_reset contact', () => {
		const { machine, tick: startTick } = bootMachine();
		const struck = driveStraight(machine, startTick, D_CENTRE_RELEASE, RELEASE_SPEED_MM_PER_S, RELEASE_TICKS);
		expect(machine.mechanisms.dropTargets['s_dragon_d']).toBe(true);

		let tick = struck.tick;
		tick += 1;
		const resetResult = machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_dragon_bank_reset', action: 'pulse', tick }]);

		const breaks = resetResult.switchEvents.filter((e) => !e.closed && e.switch.startsWith('s_dragon_'));
		expect(breaks, `exactly one closed:false edge (s_dragon_d, the only one down) -- got ${JSON.stringify(breaks)}`).toEqual([
			{ type: 'switch', switch: 's_dragon_d', closed: false, tick },
		]);
		expect(resetResult.contactEvents.filter((c) => c.kind === 'bank_reset').length, 'exactly one bank_reset contact').toBe(1);
		expect(machine.mechanisms.dropTargets['s_dragon_d'], 'D must report up again').toBe(false);

		// Collidability restored: re-driven down the SAME column, d strikes
		// and drops again.
		const restruck = driveStraight(machine, tick, D_CENTRE_RELEASE, RELEASE_SPEED_MM_PER_S, RELEASE_TICKS);
		expect(restruck.switchEvents.some((e) => e.switch === 's_dragon_d' && e.closed), 'd must be strikable again after reset').toBe(true);
		expect(machine.mechanisms.dropTargets['s_dragon_d']).toBe(true);
	});

	it('with the coil DISABLED, a pulse produces nothing at all -- no edges, no contact, and the target stays down', () => {
		const { machine, tick: startTick } = bootMachine();
		const struck = driveStraight(machine, startTick, D_CENTRE_RELEASE, RELEASE_SPEED_MM_PER_S, RELEASE_TICKS);
		expect(machine.mechanisms.dropTargets['s_dragon_d']).toBe(true);

		let tick = struck.tick;
		tick += 1;
		pulseResetTick(machine, tick, false); // disable, same tick semantics as DW-74
		tick += 1;
		const result = machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_dragon_bank_reset', action: 'pulse', tick }]);

		expect(result.switchEvents, 'a disabled coil must produce no switch edges at all').toEqual([]);
		expect(result.contactEvents.filter((c) => c.kind === 'bank_reset'), 'a disabled coil must emit no bank_reset contact').toEqual([]);
		expect(machine.mechanisms.dropTargets['s_dragon_d'], 'the target must stay down -- the pulse was filtered').toBe(true);
	});

	it('with nothing down, a reset raises nothing new, emits ZERO closed:false edges, but the bank_reset contact still fires once', () => {
		const { machine, tick: startTick } = bootMachine();
		for (const letter of LETTERS) {
			expect(machine.mechanisms.dropTargets[TABLE.dropBankWiring[letter].switch]).toBe(false);
		}
		const tick = startTick + 1;
		const result = machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_dragon_bank_reset', action: 'pulse', tick }]);
		expect(result.switchEvents.filter((e) => e.switch.startsWith('s_dragon_')), 'an edge is a transition, not a restatement -- zero expected').toEqual([]);
		expect(result.contactEvents.filter((c) => c.kind === 'bank_reset').length, 'the reset contact fires regardless of whether anything was down').toBe(1);
	});

	// QA (Story 2.3 QA pass): every existing AC 2 case above pins the two
	// boundary counts a reset can emit -- zero down (0 edges) and one down (1
	// edge) -- but neither exercises a MIDDLE count. A per-letter bug that
	// (for example) breaks out of its own loop after the first down target it
	// finds, or hard-codes "the whole bank was down" whenever ANY target is
	// down, would pass both boundary cases unchanged: zero down still emits
	// zero edges either way, and one down still emits exactly one edge either
	// way (there is nothing else for a first-match-only or an
	// emit-for-everyone bug to get wrong with a subject set of size one).
	// D and N are the bank's own two ends (D-R-A-G-O-N order) -- struck on
	// two SEPARATE drives of the same served ball (a direct reposition, not a
	// physical traversal across the intervening four, so this does not
	// exercise or depend on G/O's own collidability), leaving R/A/G/O up.
	it('with D and N down (two of six, non-adjacent), a reset raises both, emits exactly two closed:false edges -- D and N, never the other four -- and one bank_reset contact', () => {
		const { machine, tick: startTick } = bootMachine();
		const firstDrive = driveStraight(machine, startTick, D_CENTRE_RELEASE, RELEASE_SPEED_MM_PER_S, RELEASE_TICKS);
		expect(machine.mechanisms.dropTargets['s_dragon_d'], 'sanity: D must be down before N is struck').toBe(true);

		const N_RELEASE = { x: 272.4, y: 480, z: 13.5 }; // test/util/shot-cases.ts's own 'dragon-target-n' release.
		const secondDrive = driveStraight(machine, firstDrive.tick, N_RELEASE, RELEASE_SPEED_MM_PER_S, RELEASE_TICKS);
		expect(machine.mechanisms.dropTargets['s_dragon_n'], `sanity: N must be down before the reset is pulsed -- dropTargets: ${JSON.stringify(machine.mechanisms.dropTargets)}`).toBe(true);
		for (const letter of LETTERS) {
			if (letter === 'd' || letter === 'n') {
				continue;
			}
			expect(machine.mechanisms.dropTargets[TABLE.dropBankWiring[letter].switch], `sanity: only D and N are down -- ${letter} must still be up`).toBe(false);
		}

		const tick = secondDrive.tick + 1;
		const resetResult = machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_dragon_bank_reset', action: 'pulse', tick }]);

		const breaks = resetResult.switchEvents.filter((e) => !e.closed && e.switch.startsWith('s_dragon_'));
		expect(
			breaks.map((e) => e.switch).sort(),
			`exactly two closed:false edges expected (s_dragon_d and s_dragon_n, the only two down) -- got ${JSON.stringify(breaks)}`,
		).toEqual(['s_dragon_d', 's_dragon_n']);
		expect(resetResult.contactEvents.filter((c) => c.kind === 'bank_reset').length, 'exactly one bank_reset contact regardless of how many targets were down').toBe(1);
		for (const letter of LETTERS) {
			expect(machine.mechanisms.dropTargets[TABLE.dropBankWiring[letter].switch], `${letter} must report up after the reset`).toBe(false);
		}
	});
});

describe('drop-target bank -- hit-object retention (task 5): setEnabled() is the only collidability mechanism', () => {
	it('loadCollision() retains exactly 8 hit objects per DRAGON letter (4 LineSeg edges + 4 HitLineZ corners of a 4-point footprint)', () => {
		const loaded = loadCollision(loadDoc(), resolveTuning());
		for (const letter of LETTERS) {
			const objects = loaded.dropTargetHitObjectsByLetter[letter];
			expect(objects.length, `letter "${letter}" must retain exactly 8 hit objects`).toBe(8);
			expect(objects.every((o) => o.isEnabled), `every hit object starts enabled (the bank is up at boot) -- letter "${letter}"`).toBe(true);
		}
	});

	it("loadCollision() derives each letter's own footprintMm from the committed document, never hand-typed", () => {
		const loaded = loadCollision(loadDoc(), resolveTuning());
		for (const letter of LETTERS) {
			const footprint = loaded.dropTargetFootprintsMm[letter];
			expect(footprint.length, `letter "${letter}" must have a real footprint polygon`).toBeGreaterThanOrEqual(3);
		}
	});
});

describe('drop-target bank -- DW-149 anti-vacuity: the letter subject set is derived from TABLE, never hand-typed', () => {
	it('exactly six letters, matching the committed document\'s own s_dragon_<letter> switch zones (excluding s_dragon_body)', () => {
		expect(LETTERS.length, 'the bank must own exactly six letters').toBe(6);
		const doc = loadDoc() as { switchZones: Array<{ switch: string }> };
		const declared = new Set(
			doc.switchZones.map((z) => z.switch).filter((sw) => /^s_dragon_[a-z]+$/.test(sw) && sw !== 's_dragon_body'),
		);
		expect(
			[...declared].sort(),
			'every s_dragon_<letter> zone in the committed document must have a TABLE.dropBankWiring entry',
		).toEqual(LETTERS.map((l) => TABLE.dropBankWiring[l].switch).sort());
	});
});
