// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8, DW-70's red test (spec Design Notes, "DW-70 gets a red test --
// a named deliverable of this story"). The OUT-OF-PROCESS half, mirroring
// test/fixtures/solver-termination/wedge.harness.ts's own precedent: a
// `*.harness.ts` file under test/fixtures/** never matches
// `test/**/*.test.ts` (vitest.config.ts's own `include`, out of footprint)
// and tsconfig.node.json:31 excludes `test/fixtures/**` from typecheck, so
// this file runs ONLY via its own nested vitest project
// (`test/fixtures/dw70-ad7/vitest.harness.config.ts`, driven by the
// `check:ad7` script in package.json) -- never inside `pnpm test` or
// `pnpm typecheck`, and CI's own fixed script list never picks it up.
// `test/ad7-device-slots.test.ts` is the IN-SUITE wrapper that spawns this
// as a subprocess and asserts the failure's own CONTENT.
//
// AD-7: "GameState mutated only inside rules.step". `DW-70` is a live,
// uncaught violation of exactly that: `src/sim/rules/ball-controller.ts`'s
// `applyDeviceEvents()` has two return paths and BOTH carry the SAME
// `deviceSlots` reference through (it provably cannot change
// `machine.deviceSlots`), while `src/sim/loop/index.ts:326-329` overwrites
// `GameState.machine.deviceSlots` with the physics machine's OWN live view
// every tick, OUTSIDE `rules.step`. This harness builds an AD-7-CONFORMING
// reference state (seeded from the machine's initial `deviceSlots`, exactly
// as `sim/loop/index.ts`'s own `initialMachineState()` does at boot, and
// NEVER overwritten again -- the one difference from the real loop) beside
// the real physics machine, drives one trough eject through both, and
// asserts they agree on `bd_trough`. They do not: this is RED TODAY, by
// design -- do NOT "fix" this harness to make it pass, and do NOT fix
// DW-70 itself here (Story 2.5 owns the fix; the fix-risk is high and this
// story's job is only to make the violation loudly, provably visible).
//
// Two mandatory constraints, both from the spec's Design Notes:
//   (a) Scoped to `bd_trough` ONLY. `bd_shooter` is non-parking and
//       `src/sim/rules/devices.ts` emits nothing on its entry switch
//       CLOSING, so its slot state is not derivable in rules at all yet --
//       a whole-record assertion would stay red even after a correct
//       partial fix to `bd_trough` alone, which would misreport progress.
//   (b) The failure message must carry real CONTENT (not just fail) --
//       `test/ad7-device-slots.test.ts` asserts the message string, "DW-70",
//       "AD-7" and "bd_trough" all appear in the spawned process's stdout,
//       so a future accidental pass (or a broken import silently "passing"
//       for the wrong reason) is distinguishable from the real, intended red.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMachine } from '../../../src/sim/physics/machine';
import { step as rulesStep } from '../../../src/sim/rules';
import { resolveTuning } from '../../../src/sim/table/tuning';
import type { CoilCommand, GameState } from '../../../src/sim/table/names';
import type { InputFrame } from '../../../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', '..', '..', 'public', 'assets', 'dragonwar.collision.json');

/** A local, minimal "nothing held" frame -- avoids importing sim/loop (which itself imports sim/physics/machine) purely to reuse its own NO_FRAME constant; this harness talks to sim/physics/machine and sim/rules directly. */
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

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

describe('DW-70 (AD-7 violation): GameState.machine.deviceSlots is written outside rules.step', () => {
	it('an AD-7-conforming reference state (rules.step() alone) disagrees with the physics machine\'s own live deviceSlots view for bd_trough, after a trough eject -- RED TODAY, by design', () => {
		const machine = createMachine(loadDoc(), resolveTuning());

		// The AD-7-conforming reference: seeded once, from the machine's initial
		// deviceSlots (mirroring sim/loop/index.ts's own initialMachineState()
		// at boot) -- and never touched again outside rulesStep's own return
		// value. This is the ONE difference from the real production loop,
		// which re-derives it from `machine.deviceSlots` every tick instead.
		let referenceState: GameState = {
			tick: 0,
			phase: 'attract',
			machine: {
				ballsInPlay: 0,
				hardwareEnabled: true,
				ballSave: { untilTick: null, sources: [] },
				tilt: { tilted: false, slamTilted: false },
				multiball: null,
				highscores: [],
				deviceSlots: machine.deviceSlots,
			},
			players: [],
			currentPlayer: 0,
			modes: [],
			rng: 0,
		};

		for (let tick = 1; tick <= 20; tick++) {
			const commands: CoilCommand[] = tick === 1 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : [];
			const machineResult = machine.step(tick, NO_FRAME, commands);
			const rulesResult = rulesStep(referenceState, machineResult.switchEvents, tick);
			// AD-7-CONFORMING: unlike sim/loop/index.ts's advance() (which spreads
			// `deviceSlots: machine.deviceSlots` back onto the state AFTER
			// rulesStep returns, every tick), this reference relies ENTIRELY on
			// rulesStep's own returned state -- exactly AD-7's own text,
			// "GameState mutated only inside rules.step".
			referenceState = rulesResult.state;
		}

		// PRODUCTION value: the physics machine's own live view -- what
		// src/sim/loop/index.ts:326-329 actually overwrites onto GameState
		// every tick, OUTSIDE rules.step. This is the live violation.
		const productionDeviceSlots = machine.deviceSlots.bd_trough;
		const referenceDeviceSlots = referenceState.machine.deviceSlots.bd_trough;

		expect(
			referenceDeviceSlots,
			`DW-70 (AD-7 violation): GameState.machine.deviceSlots.bd_trough disagrees between the AD-7-conforming ` +
			`reference (rules.step() alone -- src/sim/rules/ball-controller.ts's applyDeviceEvents() provably cannot ` +
			`change deviceSlots, both of its return paths carry the SAME reference through) and the physics machine's ` +
			`own live view that src/sim/loop/index.ts overwrites onto GameState AFTER rulesStep() returns (:326-329). ` +
			`Reference (rules-only, AD-7-conforming): ${JSON.stringify(referenceDeviceSlots)}. ` +
			`Production (loop-overwritten, the live violation): ${JSON.stringify(productionDeviceSlots)}. ` +
			`This is the live, uncaught AD-7 violation tracked as DW-70 -- Story 2.5 owns the fix; this harness only ` +
			`names it with a real, running red. Do NOT fix DW-70 here.`,
		).toEqual(productionDeviceSlots);
	});
});
