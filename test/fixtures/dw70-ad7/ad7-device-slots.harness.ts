// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.5, task 8: the POST-FIX AD-7 gate, rewritten in the same change
// that fixes DW-70 (`src/sim/loop/index.ts`, `src/sim/rules/**`). The
// PRE-FIX version of this file deliberately avoided importing `sim/loop`,
// driving `machine.step()` + `rules.step()` by hand instead -- which made it
// structurally BLIND to the `:352-354`-area copy line it existed to guard
// against (a harness that never runs the loop cannot observe the loop's own
// copy). This rewrite drives a real `createLoop()` and asserts on
// `snapshot.game.machine.deviceSlots`, so a re-added copy line reddens it
// again immediately (Design Notes, "Why the new AD-7 gate is identity-based
// -- and why it must now import sim/loop").
//
// Still out-of-process only (mirrors `test/fixtures/solver-termination/
// wedge.harness.ts`'s own precedent): a `*.harness.ts` file under
// `test/fixtures/**` never matches `vitest.config.ts`'s own
// `test/**/*.test.ts` include, and `tsconfig.node.json:31` excludes
// `test/fixtures/**` from typecheck, so this file runs ONLY via its own
// nested vitest project (`vitest.harness.config.ts`, driven by `check:ad7`)
// -- never inside `pnpm test` or `pnpm typecheck`. `test/ad7-device-slots.test.ts`
// is the IN-SUITE wrapper that spawns this as a subprocess and asserts on the
// result's own content (task 9).
//
// Three assertions, each in its OWN `it()` so the wrapper's exact
// passing-test-count assertion has something real to count:
//
//   (i)   identity -- two quiet ticks (no ball-device edge at all) must leave
//         `snapshot.game.machine.deviceSlots` the SAME reference. Discriminates
//         ownership, not mere value agreement: `physics/machine.ts`'s own
//         `deviceSlots` getter allocates a fresh object AND fresh arrays on
//         EVERY read (verified in the Code Map), so a re-added
//         `deviceSlots: machine.deviceSlots` copy breaks `toBe` on every tick
//         while a `toEqual` value check would still pass.
//   (ii)  whole-record cross-derivation -- GameState's rules-derived slots
//         (this file's own subject) against `snapshot.mechanisms.devices[*].slots`
//         (`sim/loop/index.ts`'s buildSnapshot(), reading `machine.deviceSlots`
//         DIRECTLY and independently of rules -- untouched by this story,
//         Code Map: "Do not change this") -- for ALL THREE ball devices, across
//         a real trough eject.
//   (iii) anti-vacuity self-check -- `bd_trough` must be OBSERVED leaving
//         `[true,true,true,true]` (i.e. the eject genuinely ran), so a
//         harness that silently never drove anything cannot pass (i) or (ii)
//         by never having anything to disagree about.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop } from '../../../src/sim/loop';

const COLLISION_PATH = path.resolve(__dirname, '..', '..', '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

describe('DW-70 (AD-7): GameState.machine.deviceSlots is derived inside rules.step, never copied from physics -- post-fix gate, driven through a real createLoop()', () => {
	it('(i) identity across quiet ticks: snapshotA.game.machine.deviceSlots toBe snapshotB.game.machine.deviceSlots when no ball-device edge occurs between them', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		// Two 1-tick advances, no transitions, no coil pulses -- boot's own
		// quiescent state, well before anything is ever ejected.
		const outA = loop.advance(1, []);
		const outB = loop.advance(1, []);

		expect(
			outB.snapshot.game.machine.deviceSlots,
			`DW-70 (AD-7): GameState.machine.deviceSlots must be the SAME object reference across two ticks with no ` +
				`ball-device edge (structural sharing, AD-7's derivation carried forward unchanged) -- if this reddens, ` +
				`something is re-allocating (or re-copying from physics) every tick regardless of whether anything ` +
				`changed. A = ${JSON.stringify(outA.snapshot.game.machine.deviceSlots)}, B = ${JSON.stringify(outB.snapshot.game.machine.deviceSlots)}.`,
		).toBe(outA.snapshot.game.machine.deviceSlots);
	});

	it('(ii) whole-record cross-derivation: the rules-derived deviceSlots agree with the snapshot\'s own independent physics-derived view, for all three ball devices, across a real trough eject', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		loop.pulseCoil('c_trough_eject');
		let out = loop.advance(1, []);
		for (let i = 0; i < 300; i++) {
			out = loop.advance(1, []);
		}

		const rulesDerived = out.snapshot.game.machine.deviceSlots;
		const physicsDerived = out.snapshot.mechanisms.devices;

		for (const device of ['bd_trough', 'bd_lock', 'bd_shooter'] as const) {
			expect(
				rulesDerived[device],
				`DW-70 (AD-7): GameState.machine.deviceSlots.${device} (rules-derived) disagrees with the snapshot's own ` +
					`independent physics-derived view (sim/loop/index.ts's buildSnapshot(), which reads machine.deviceSlots ` +
					`directly and is NOT touched by this fix). Rules-derived: ${JSON.stringify(rulesDerived[device])}. ` +
					`Physics-derived: ${JSON.stringify(physicsDerived[device]?.slots)}.`,
			).toEqual(physicsDerived[device]?.slots);
		}
	});

	it('(iii) anti-vacuity: bd_trough is OBSERVED leaving [true,true,true,true] -- the drive genuinely happened, this is not a vacuous pass', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const before = loop.advance(1, []).snapshot.game.machine.deviceSlots.bd_trough;
		expect(before, `bd_trough must boot full -- got ${JSON.stringify(before)}`).toEqual([true, true, true, true]);

		loop.pulseCoil('c_trough_eject');
		let out = loop.advance(1, []);
		for (let i = 0; i < 300; i++) {
			out = loop.advance(1, []);
		}

		expect(
			out.snapshot.game.machine.deviceSlots.bd_trough,
			`DW-70 anti-vacuity: bd_trough never left [true,true,true,true] after a real c_trough_eject pulse and 300 ` +
				`ticks -- the harness drove nothing, so assertions (i)/(ii) above would be vacuous. Got: ` +
				`${JSON.stringify(out.snapshot.game.machine.deviceSlots.bd_trough)}.`,
		).toEqual([true, true, true, false]);
	});
});
