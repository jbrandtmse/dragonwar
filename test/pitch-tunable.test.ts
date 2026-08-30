// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9, AC 4: "given defaultPitchDeg set within 6.0-8.5 deg, when the sim
// rebuilds, then gravity and snapshot.effectivePitchDeg both follow and
// applyPitch rotates playfield_root to the new angle; outside that band the
// value is clamped." Two halves, per the spec's own Design Notes ("Pitch has
// three sources today -- which one wins"): physics reads the resolved
// tuning's defaultPitchDeg (clamped) instead of TABLE.reference.pitchDeg
// (machine.ts:119); presentation needs no change (boot.ts already feeds
// snapshot.effectivePitchDeg into applyPitch) -- this file's second describe
// block re-demonstrates that wiring is real, not merely unbroken.
//
// Falsifiability (spec): mutation: revert machine.ts:119 to
// TABLE.reference.pitchDeg -> effectivePitchDeg stays 6.5 regardless of
// tuning and the acceleration-difference assertion below goes red.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { createMachine } from '../src/sim/physics/machine';
import { NO_FRAME } from '../src/sim/loop';
import { loadCollision } from '../src/sim/physics/loader';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST } from '../src/sim/physics/constants';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { toPhysics, MM_PER_VU } from '../src/sim/table/frames';
import { applyPitch } from '../src/presentation/scene/playfield';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';
import type { CoilCommand } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function tuningWithPitch(pitchDeg: number) {
	return resolveTuning({
		...TUNING,
		defaultPitchDeg: { value: pitchDeg, source: 'test fixture', confidence: 'unverified' as const },
	});
}

describe('src/sim/physics/machine.ts -- effectivePitchDeg is read from the resolved tuning (AC 4)', () => {
	it('a pitch inside [pitchMinDeg, pitchMaxDeg] passes through unclamped, and gravity is set from it', () => {
		const machine = createMachine(loadDoc(), tuningWithPitch(7.25));
		expect(machine.effectivePitchDeg).toBe(7.25);
	});

	it('the shipped default (6.5) still resolves to 6.5 -- the SOURCE of the number changed, not the number itself', () => {
		const machine = createMachine(loadDoc(), resolveTuning());
		expect(machine.effectivePitchDeg).toBe(TABLE.reference.pitchDeg);
		expect(machine.effectivePitchDeg).toBe(6.5);
	});

	it('a defaultPitchDeg BELOW pitchMinDeg (5.0) is clamped to pitchMinDeg (6.0), never silently accepted out of band', () => {
		const machine = createMachine(loadDoc(), tuningWithPitch(5.0));
		expect(machine.effectivePitchDeg).toBe(6.0);
	});

	it('a defaultPitchDeg ABOVE pitchMaxDeg (9.9) is clamped to pitchMaxDeg (8.5)', () => {
		const machine = createMachine(loadDoc(), tuningWithPitch(9.9));
		expect(machine.effectivePitchDeg).toBe(8.5);
	});

	it('the two boundary values themselves (6.0 and 8.5) pass through unclamped', () => {
		expect(createMachine(loadDoc(), tuningWithPitch(6.0)).effectivePitchDeg).toBe(6.0);
		expect(createMachine(loadDoc(), tuningWithPitch(8.5)).effectivePitchDeg).toBe(8.5);
	});

	it('review finding: an inverted pitchMinDeg/pitchMaxDeg pair (min > max, e.g. a panel typo) still clamps against the NORMALISED band -- a value between the two bounds passes through unclamped regardless of which tunable holds the smaller number', () => {
		// Before this fix, clampToRange(x, min, max) checked `x < min` FIRST,
		// unconditionally -- with pitchMinDeg=8.5 and pitchMaxDeg=6.0 (swapped)
		// and x=7.0 (genuinely BETWEEN the two bounds, however they got
		// swapped), `7.0 < 8.5` was true and the function wrongly clamped a
		// value that should have passed through untouched, returning 8.5
		// instead of 7.0. Pin the exact value, not merely "within some range"
		// -- 8.5 is itself one of the two bounds, so a weaker
		// "between 6.0 and 8.5" assertion cannot tell the buggy clamp apart
		// from the correct pass-through.
		const inverted = resolveTuning({
			...TUNING,
			pitchMinDeg: { value: 8.5, source: 'test fixture', confidence: 'unverified' as const },
			pitchMaxDeg: { value: 6.0, source: 'test fixture', confidence: 'unverified' as const },
			defaultPitchDeg: { value: 7.0, source: 'test fixture', confidence: 'unverified' as const },
		});
		const machine = createMachine(loadDoc(), inverted);
		expect(machine.effectivePitchDeg, '7.0 sits between the two (swapped) bounds and must pass through unclamped').toBe(7.0);
	});
});

describe('src/sim/physics/machine.ts -- a steeper effective pitch produces a measurably larger downfield acceleration (AC 4)', () => {
	// Bypasses machine.step()/devices entirely -- setGravity() then a single
	// free ball at rest on the open playfield, well clear of every device
	// zone, so the ONLY thing that can move it is gravity's slope component.
	// Mirrors exactly the two arguments machine.ts:119-120 itself passes to
	// physics.setGravity() (effectivePitchDeg, DEFAULT_TABLE_GRAVITY *
	// GRAVITYCONST) -- the test computes its OWN expected clamp/pitch value
	// independently rather than importing machine.ts's clamp helper, so this
	// cannot be satisfied by the same bug it is checking.
	function yVelocityAfterFreefall(pitchDeg: number, steps: number): number {
		const { physics } = loadCollision(loadDoc());
		physics.setGravity(pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);

		const radiusMm = TABLE.reference.ballMm / 2;
		const { w, h } = TABLE.reference.playfieldMm;
		const restPosPhysics = toPhysics({ x: w / 2, y: h / 2, z: radiusMm });
		const radiusVu = radiusMm / MM_PER_VU;
		const data = new BallData(radiusVu, 1, 1);
		const state = new BallState('pitch-probe', new Vertex3D(restPosPhysics.x, restPosPhysics.y, restPosPhysics.z));
		const ball = new Ball(1, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
		physics.addBall(ball);

		for (let i = 0; i < steps; i++) {
			physics.step();
		}
		return ball.hit.vel.y;
	}

	it('8.5 deg produces a larger-magnitude downfield velocity than 6.0 deg after the same number of steps, from the same rest start', () => {
		const shallow = yVelocityAfterFreefall(6.0, 200);
		const steep = yVelocityAfterFreefall(8.5, 200);
		// Review finding, this pass: the sanity check here used to be
		// `Number.isFinite(shallow) && Number.isFinite(steep)`, which is true of
		// 0 -- so it did not check "both runs actually moved" at all, and the
		// movement floor below was applied only to `shallow`. Both are now
		// checked for real.
		expect(Math.abs(shallow), 'sanity: the shallow run must genuinely have moved, or "greater than" is vacuous').toBeGreaterThan(0.001);
		expect(Math.abs(steep), 'sanity: the steep run must genuinely have moved too').toBeGreaterThan(0.001);
		expect(Math.abs(steep), 'a steeper pitch must accelerate the ball downfield FASTER (sin(8.5deg) > sin(6.0deg))').toBeGreaterThan(Math.abs(shallow));
	});

	it('the shipped default (6.5 deg, via TUNING unmodified) produces the SAME downfield velocity as machine.ts read directly off TABLE.reference.pitchDeg (6.5) -- the source changed, not the number', () => {
		const viaTuning = yVelocityAfterFreefall(resolveTuning().defaultPitchDeg.value, 100);
		const viaReferenceDirect = yVelocityAfterFreefall(TABLE.reference.pitchDeg, 100);
		expect(viaTuning).toBe(viaReferenceDirect);
	});
});

describe('src/sim/physics/machine.ts -- the tuned pitch really reaches physics.setGravity(), observed through the REAL public Machine.step() (AC 4, gravity half)', () => {
	// Review finding, this pass. AC 4 says "gravity AND
	// snapshot.effectivePitchDeg both follow". The block above measures a real
	// acceleration difference, but it builds its own loadCollision() and calls
	// physics.setGravity(pitchDeg, ...) BY HAND -- so it is a property of
	// PlayerPhysics.setGravity(), not of this story's derivation. Every other
	// assertion in this file reads machine.effectivePitchDeg, which comes from
	// machine.ts's `const effectivePitchDeg = clampToRange(...)` line and NOT
	// from the setGravity() call on the line after it. Mutating ONLY the
	// setGravity() argument back to TABLE.reference.pitchDeg therefore left
	// this entire file, test/host-loop.test.ts's reset block and all five
	// goldens green: the snapshot and the rendered playfield tilt would report
	// the tuned angle while the ball kept falling at 6.5 deg.
	//
	// This block closes that. It drives a genuinely physics-registered ball
	// through createMachine().step() itself, reusing
	// test/hop-machine-step.test.ts's own serve-then-reposition technique (a
	// real c_trough_eject pulse through step()'s public command channel, then
	// the SAME ball repositioned to open playfield).
	//
	// mutation: change machine.ts's `physics.setGravity(effectivePitchDeg, ...)`
	// to `physics.setGravity(TABLE.reference.pitchDeg, ...)`, leaving the
	// effectivePitchDeg derivation itself intact -> the assertion below goes
	// red while every other test in this file stays green (which is the point).
	function downfieldVelocityThroughMachineStep(pitchDeg: number, steps: number): number {
		const machine = createMachine(loadDoc(), tuningWithPitch(pitchDeg));
		let tick = 0;
		const step = (commands: readonly CoilCommand[] = []): void => {
			tick += 1;
			machine.step(tick, NO_FRAME, commands);
		};

		step([{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick: 1 }]);
		const ball = machine.balls[0];
		if (!ball) {
			throw new Error('sanity: the trough eject must have spawned a ball for this test to mean anything');
		}

		// The same open-playfield rest pose the hand-wired block above uses --
		// well clear of every device zone, so the only thing that can move the
		// ball is gravity's slope component.
		const radiusMm = TABLE.reference.ballMm / 2;
		const { w, h } = TABLE.reference.playfieldMm;
		const restPosPhysics = toPhysics({ x: w / 2, y: h / 2, z: radiusMm });
		ball.state.pos.set(restPosPhysics.x, restPosPhysics.y, restPosPhysics.z);
		ball.hit.vel.set(0, 0, 0);
		ball.hit.angularVelocity.set(0, 0, 0);
		ball.hit.angularMomentum.set(0, 0, 0);

		for (let i = 0; i < steps; i++) {
			step();
		}
		return ball.hit.vel.y;
	}

	it('a ball stepped through createMachine(doc, tuning@8.5) accelerates downfield measurably faster than the same ball at tuning@6.0 -- so the value setGravity() receives really is effectivePitchDeg', () => {
		const shallow = downfieldVelocityThroughMachineStep(6.0, 200);
		const steep = downfieldVelocityThroughMachineStep(8.5, 200);
		expect(Math.abs(shallow), 'sanity: the shallow run must genuinely have moved').toBeGreaterThan(0.001);
		expect(Math.abs(steep), 'sanity: the steep run must genuinely have moved').toBeGreaterThan(0.001);
		expect(
			Math.abs(steep),
			'the TUNED pitch must reach physics.setGravity() -- a ball inside a createMachine()-built machine must fall faster at 8.5 deg than at 6.0 deg',
		).toBeGreaterThan(Math.abs(shallow));
	});
});

describe('src/presentation/scene/playfield.ts -- applyPitch() actually differs between two tuning-resolved effective pitches (AC 4, presentation half)', () => {
	// Presentation itself needs no change (spec Design Notes: boot.ts already
	// feeds snapshot.effectivePitchDeg into applyPitch every frame) -- this
	// re-demonstrates end to end that two DIFFERENT tuning-derived
	// effectivePitchDeg values actually produce two DIFFERENT playfield_root
	// rotations, using the same lightweight TransformNode harness
	// test/scene-smoke.test.ts's off-axis pivot case uses (no glb load
	// required: applyPitch() only touches the three TransformNodes it is
	// given).
	function rotatedWorldMatrixFor(pitchDeg: number) {
		const engine = new NullEngine();
		try {
			const scene = new Scene(engine);
			try {
				const playfieldRoot = new TransformNode(TABLE.nodes.playfieldRoot, scene);
				const cabinetRoot = new TransformNode(TABLE.nodes.cabinetRoot, scene);
				const pivotPitch = new TransformNode(TABLE.nodes.pivotPitch, scene);
				applyPitch({ playfieldRoot, cabinetRoot, pivotPitch }, pitchDeg);
				const world = playfieldRoot.computeWorldMatrix(true);
				return world.asArray().slice();
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	}

	it('defaultPitchDeg 8.5 vs 6.0 (both clamped-through unchanged) rotate playfield_root to two genuinely different world matrices', () => {
		const machineShallow = createMachine(loadDoc(), tuningWithPitch(6.0));
		const machineSteep = createMachine(loadDoc(), tuningWithPitch(8.5));
		expect(machineShallow.effectivePitchDeg).toBe(6.0);
		expect(machineSteep.effectivePitchDeg).toBe(8.5);

		const shallowWorld = rotatedWorldMatrixFor(machineShallow.effectivePitchDeg);
		const steepWorld = rotatedWorldMatrixFor(machineSteep.effectivePitchDeg);
		expect(shallowWorld).not.toEqual(steepWorld);
	});
});
