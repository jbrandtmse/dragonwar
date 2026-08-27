// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.1, Spike 1 — the Node leg. Correctness (bounds, overlap, termination,
// determinism) plus the per-tick cost report. See docs/spikes/spike-1.md for the
// recorded numbers and the p95 method.

import { describe, expect, it } from 'vitest';
import {
	BALL_DIAMETER_MM,
	createSpikeScene,
	PLAYFIELD_HEIGHT_MM,
	PLAYFIELD_WIDTH_MM,
	step,
} from '../tools/spike-1/scene';

const TICKS = 10_000;
const MM_PER_VU = 0.53975; // must match tools/spike-1/scene.ts — see its conversion-site comment.
function mmToVu(mm: number): number {
	return mm / MM_PER_VU;
}

const WIDTH_VU = mmToVu(PLAYFIELD_WIDTH_MM);
const HEIGHT_VU = mmToVu(PLAYFIELD_HEIGHT_MM);
const BALL_RADIUS_VU = mmToVu(BALL_DIAMETER_MM) / 2;
const BALL_DIAMETER_VU = BALL_RADIUS_VU * 2;

// Collision tolerance: PHYS_TOUCH (0.05 VU) plus headroom for the one-tick lag
// between a hit being detected and C_DISP_GAIN's partial positional correction
// fully resolving it (verbatim upstream behaviour — see ball-hit.ts collide3DWall /
// collide). Generous on purpose: this is a bounds/overlap sanity check, not a
// sub-VU precision assertion. Observed in practice (both tests below log the
// worst value they actually saw): worst bounds excess ~0.013 VU, worst overlap
// penetration ~0.006 VU — both far under this 2.0 VU ceiling, so the generous
// tolerance is headroom, not something masking a near-miss.
const BOUNDS_TOLERANCE_VU = 2.0;
const OVERLAP_TOLERANCE_VU = 2.0;

describe('Spike 1 — Node correctness leg (10,000 ticks, six balls)', () => {
	it('keeps every ball inside the playfield bounds on every tick', () => {
		const scene = createSpikeScene();
		// Tracks how much of BOUNDS_TOLERANCE_VU's ~1mm ceiling this run actually
		// used, so the tolerance comment above states an observed value rather than
		// only the chosen ceiling — see docs/spikes/spike-1.md.
		let maxExcessVu = 0;

		for (let tick = 0; tick < TICKS; tick++) {
			step(scene);

			for (const ball of scene.balls) {
				const { x, y } = ball.state.pos;
				const r = ball.data.radius;

				maxExcessVu = Math.max(
					maxExcessVu,
					-(x - r), -(WIDTH_VU - (x + r)), -(y - r), -(HEIGHT_VU - (y + r)),
				);

				expect(
					x - r,
					`tick ${tick}, ${ball.getName()}: left edge (x=${x}) escaped playfield bounds`,
				).toBeGreaterThanOrEqual(-BOUNDS_TOLERANCE_VU);
				expect(
					x + r,
					`tick ${tick}, ${ball.getName()}: right edge (x=${x}) escaped playfield bounds`,
				).toBeLessThanOrEqual(WIDTH_VU + BOUNDS_TOLERANCE_VU);
				expect(
					y - r,
					`tick ${tick}, ${ball.getName()}: bottom edge (y=${y}) escaped playfield bounds`,
				).toBeGreaterThanOrEqual(-BOUNDS_TOLERANCE_VU);
				expect(
					y + r,
					`tick ${tick}, ${ball.getName()}: top edge (y=${y}) escaped playfield bounds`,
				).toBeLessThanOrEqual(HEIGHT_VU + BOUNDS_TOLERANCE_VU);
			}
		}

		// eslint-disable-next-line no-console
		console.log(
			`[spike-1] bounds: worst observed excess over the nominal edge was ` +
			`${Math.max(maxExcessVu, 0).toFixed(4)} VU, against a ${BOUNDS_TOLERANCE_VU.toFixed(1)} VU tolerance ceiling.`,
		);
	});

	it('never lets two ball centres come closer than one ball diameter', () => {
		const scene = createSpikeScene();
		// See the bounds test above: tracks the worst observed penetration against
		// OVERLAP_TOLERANCE_VU's ceiling, for docs/spikes/spike-1.md.
		let maxPenetrationVu = 0;

		for (let tick = 0; tick < TICKS; tick++) {
			step(scene);

			for (let i = 0; i < scene.balls.length; i++) {
				for (let j = i + 1; j < scene.balls.length; j++) {
					const a = scene.balls[i].state.pos;
					const b = scene.balls[j].state.pos;
					const dx = a.x - b.x;
					const dy = a.y - b.y;
					const dz = a.z - b.z;
					const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

					maxPenetrationVu = Math.max(maxPenetrationVu, BALL_DIAMETER_VU - dist);

					expect(
						dist,
						`tick ${tick}: ${scene.balls[i].getName()} and ${scene.balls[j].getName()} overlapped ` +
						`(centre distance ${dist.toFixed(4)} VU, minimum ${BALL_DIAMETER_VU.toFixed(4)} VU)`,
					).toBeGreaterThanOrEqual(BALL_DIAMETER_VU - OVERLAP_TOLERANCE_VU);
				}
			}
		}

		// eslint-disable-next-line no-console
		console.log(
			`[spike-1] overlap: worst observed penetration was ${Math.max(maxPenetrationVu, 0).toFixed(4)} VU, ` +
			`against a ${OVERLAP_TOLERANCE_VU.toFixed(1)} VU tolerance ceiling.`,
		);
	});

	it('terminates every step (forced advance by STATICTIME bounds the time-of-impact loop)', () => {
		const scene = createSpikeScene();
		// physicsSimulateCycle's while-loop is bounded by STATICCNTS/STATICTIME
		// (verbatim upstream, see game/player-physics.ts) so it always terminates;
		// this is a wall-clock sanity net around that guarantee, not part of the
		// solver itself — sim/ contains no wall-clock code, this assertion lives in
		// test/ tooling instead.
		const MAX_STEP_MS = 250;

		for (let tick = 0; tick < TICKS; tick++) {
			const start = process.hrtime.bigint();
			step(scene);
			const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

			expect(elapsedMs, `tick ${tick}: step() took ${elapsedMs.toFixed(2)}ms — suspected non-terminating loop`).toBeLessThan(MAX_STEP_MS);
		}
	});

	it('is deterministic: the same harness run twice from identical initial state produces byte-identical results', () => {
		const sceneA = createSpikeScene();
		const sceneB = createSpikeScene();

		for (let tick = 0; tick < TICKS; tick++) {
			step(sceneA);
			step(sceneB);
		}

		for (let i = 0; i < sceneA.balls.length; i++) {
			const a = sceneA.balls[i];
			const b = sceneB.balls[i];

			expect(a.state.pos.x, `${a.getName()}: pos.x diverged`).toBe(b.state.pos.x);
			expect(a.state.pos.y, `${a.getName()}: pos.y diverged`).toBe(b.state.pos.y);
			expect(a.state.pos.z, `${a.getName()}: pos.z diverged`).toBe(b.state.pos.z);
			expect(a.hit.vel.x, `${a.getName()}: vel.x diverged`).toBe(b.hit.vel.x);
			expect(a.hit.vel.y, `${a.getName()}: vel.y diverged`).toBe(b.hit.vel.y);
			expect(a.hit.vel.z, `${a.getName()}: vel.z diverged`).toBe(b.hit.vel.z);
		}
	});

	it('reports mean and p95 per-tick cost (informational — does not gate)', () => {
		const scene = createSpikeScene();
		const samples: number[] = new Array(TICKS);

		for (let tick = 0; tick < TICKS; tick++) {
			const start = process.hrtime.bigint();
			step(scene);
			samples[tick] = Number(process.hrtime.bigint() - start);
		}

		const sorted = [...samples].sort((a, b) => a - b);
		const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
		const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1];
		const p95PerFrameEquivalent = (p95 * 17) / 1e6; // informational cross-check only, see Design Notes

		// eslint-disable-next-line no-console
		console.log(
			`[spike-1] Node leg: ${TICKS} ticks — mean ${(mean).toFixed(1)} ns/tick, ` +
			`p95 ${(p95).toFixed(1)} ns/tick, derived per-frame equivalent (p95 x 17) ` +
			`${p95PerFrameEquivalent.toFixed(4)} ms`,
		);

		// Reporting only — transcribe the numbers above into docs/spikes/spike-1.md.
		expect(mean).toBeGreaterThan(0);
		expect(p95).toBeGreaterThan(0);
	});
});
