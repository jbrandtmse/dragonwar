// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.5, ledger DW-14's re-characterisation obligation: Spike 1's own
// number (test/spike-1.test.ts) is a FLOOR taken on a near-quiescent,
// harness-local scene -- this is the steady-state re-take on the REAL
// placeholder geometry and the REAL cabinet machine (sim/physics/machine.ts),
// with four balls in genuine motion, not six balls in an arbitrary local
// frame. Informational, non-gating, exactly like test/spike-1.test.ts's own
// cost report -- transcribe the printed numbers into this spec's
// `## Auto Run Result` (see spec-1-5's own instruction), not asserted here.
//
// docs/spikes/spike-1.md and tools/spike-1/scene.ts are UNTOUCHED (DW-14's
// standing instruction, honoured by every story since Story 1.1): this is a
// wholly new test against wholly new geometry and a wholly new machine, not
// an edit to the spike's own baseline.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMachine } from '../src/sim/physics/machine';
import { resolveTuning } from '../src/sim/table/tuning';
import { TICK_HZ } from '../src/sim/contracts/time';
import type { InputFrame } from '../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

const NO_FRAME: InputFrame = {
	flipper_l: false,
	flipper_r: false,
	plunger: false,
	nudge_l: false,
	nudge_r: false,
	nudge_up: false,
	start: false,
	menu: false,
};

// One 60 Hz display frame owes TICK_HZ / 60 simulated ticks; 17 is the
// worst-case whole-step count once the fractional remainder is carried
// (AD-4) -- the same derivation tools/spike-1/scene.ts's own
// STEPS_PER_FRAME_60HZ uses, recomputed here from the live TICK_HZ rather
// than copied as a literal (a 480 Hz fallback would change this too).
const STEPS_PER_FRAME_60HZ = Math.ceil(TICK_HZ / 60);
const FRAMES = 600;

describe('sim cost -- steady-state re-characterisation on the real placeholder geometry (DW-14)', () => {
	it('reports mean and p95 cost per 60 Hz frame with four balls in genuine motion (informational — does not gate)', () => {
		const doc = JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
		const tuning = resolveTuning();
		const machine = createMachine(doc, tuning);

		// Four balls in genuine motion, through the machine's own public API:
		// four trough ejects in a row (each removes the highest still-filled
		// slot), so all four leave the trough under real eject velocity rather
		// than being placed by hand.
		let tick = 0;
		for (let i = 0; i < 4; i++) {
			tick += 1;
			machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }]);
			// A few settling ticks between ejects so the four balls do not spawn
			// exactly on top of one another.
			for (let s = 0; s < 15; s++) {
				tick += 1;
				machine.step(tick, NO_FRAME, []);
			}
		}
		expect(machine.balls.length, 'sanity: four balls must actually be in motion for this measurement to mean anything').toBe(4);

		const samples: number[] = new Array(FRAMES);
		for (let frame = 0; frame < FRAMES; frame++) {
			const start = process.hrtime.bigint();
			for (let s = 0; s < STEPS_PER_FRAME_60HZ; s++) {
				tick += 1;
				machine.step(tick, NO_FRAME, []);
			}
			samples[frame] = Number(process.hrtime.bigint() - start);
		}

		const sorted = [...samples].sort((a, b) => a - b);
		const meanNs = samples.reduce((sum, v) => sum + v, 0) / samples.length;
		const p95Ns = sorted[Math.ceil(0.95 * sorted.length) - 1];

		// eslint-disable-next-line no-console
		console.log(
			`[sim-cost] Story 1.5 steady-state re-take: ${FRAMES} frames x ${STEPS_PER_FRAME_60HZ} ticks, ` +
			`four balls in motion — mean ${(meanNs / 1e6).toFixed(4)} ms/frame, p95 ${(p95Ns / 1e6).toFixed(4)} ms/frame ` +
			`(Spike 1's floor, six balls in a near-quiescent harness scene: see docs/spikes/spike-1.md).`,
		);

		// Reporting only, like test/spike-1.test.ts's own cost test.
		expect(meanNs).toBeGreaterThan(0);
		expect(p95Ns).toBeGreaterThan(0);
	});
});
