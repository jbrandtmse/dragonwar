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
import { TABLE } from '../../../src/sim/table/dragonwar';
import type { BallDeviceName } from '../../../src/sim/table/names';

// Review finding 2026-09-06 (code-review re-review, DW-189): the device-slot
// views this harness computes are now published on `task.meta` as WELL as
// printed. `task.meta` is carried verbatim into vitest's JSON reporter
// (`assertionResults[].meta` -- verified in node_modules/vitest's own
// JsonReporter, which assigns `meta: t.meta`), so the wrapper
// (`test/ad7-device-slots.test.ts`) can read the VALUES this harness actually
// computed out of a structured reporter contract instead of scraping them
// back out of rendered console output. That is the whole point of DW-189: a
// reporter contract cannot drift with a terminal's colour support or with a
// runner's summary wording; rendered output can, and did (CI run
// 34038163487). The `console.log` calls below are KEPT -- they are what a
// human sees when they run `pnpm check:ad7` directly, where no JSON reporter
// is involved -- but no assertion anywhere depends on them any more.
//
// This `declare module` augmentation is vitest's own documented way to extend
// task metadata. `test/fixtures/**` is excluded from `tsconfig.node.json`, so
// this file is not typechecked today; the augmentation is written properly
// anyway so that stays true by choice rather than by luck.
declare module 'vitest' {
	interface TaskMeta {
		/** (iii) `bd_trough` at boot, before any eject -- expected `[true,true,true,true]`. */
		bdTroughAtBoot?: boolean[];
		/** (iii) `bd_trough` after a real `c_trough_eject` pulse -- expected `[true,true,true,false]`. */
		bdTroughAfterEject?: boolean[];
		/** (ii) the rules-derived `bd_trough` view after the eject (this harness's own subject). */
		bdTroughRulesDerivedAfterEject?: boolean[];
		/** (ii) the snapshot's independent physics-derived `bd_trough` view after the eject. */
		bdTroughPhysicsDerivedAfterEject?: boolean[];
	}
}

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

	it('(ii) whole-record cross-derivation: the rules-derived deviceSlots agree with the snapshot\'s own independent physics-derived view, for all three ball devices, across a real trough eject', ({ task }) => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		loop.pulseCoil('c_trough_eject');
		let out = loop.advance(1, []);
		for (let i = 0; i < 300; i++) {
			out = loop.advance(1, []);
		}

		const rulesDerived = out.snapshot.game.machine.deviceSlots;
		const physicsDerived = out.snapshot.mechanisms.devices;

		// Review finding 2026-09-06 (code-review, verification-gap): published
		// UNCONDITIONALLY, not only inside an `expect()` failure message. The
		// wrapper (`test/ad7-device-slots.test.ts`) asserts on these VALUES,
		// which restores the value-level evidence the pre-fix wrapper had
		// (`.toContain('[true,true,true,false]')`) and closes the
		// "gutted-in-place" hole: the exact passing-count assertion catches a
		// DELETED `it()`, but three bodies replaced by `expect(true).toBe(true)`
		// would leave the count, the exit code and the titles all intact.
		// DW-189 (code-review re-review, 2026-09-06): the wrapper now reads
		// these off `task.meta` through vitest's JSON reporter rather than out
		// of the printed lines; the `console.log`s stay for the human running
		// `pnpm check:ad7` directly.
		task.meta.bdTroughRulesDerivedAfterEject = rulesDerived.bd_trough;
		task.meta.bdTroughPhysicsDerivedAfterEject = physicsDerived.bd_trough?.slots;
		console.log(`DW-70 rules-derived bd_trough: ${JSON.stringify(rulesDerived.bd_trough)}`);
		console.log(`DW-70 physics-derived bd_trough: ${JSON.stringify(physicsDerived.bd_trough?.slots)}`);

		// Review finding 2026-09-06 (code-review, blind-hunter): iterated from
		// TABLE, never a second hand-typed device list (DW-149) -- a fourth
		// ball device would otherwise be silently outside this gate.
		for (const device of Object.keys(TABLE.ballDevices) as BallDeviceName[]) {
			expect(
				rulesDerived[device],
				`DW-70 (AD-7): GameState.machine.deviceSlots.${device} (rules-derived) disagrees with the snapshot's own ` +
					`independent physics-derived view (sim/loop/index.ts's buildSnapshot(), which reads machine.deviceSlots ` +
					`directly and is NOT touched by this fix). Rules-derived: ${JSON.stringify(rulesDerived[device])}. ` +
					`Physics-derived: ${JSON.stringify(physicsDerived[device]?.slots)}.`,
			).toEqual(physicsDerived[device]?.slots);
		}
	});

	it('(iii) anti-vacuity: bd_trough is OBSERVED leaving the boot-full view -- the drive genuinely happened, this is not a vacuous pass', ({ task }) => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const before = loop.advance(1, []).snapshot.game.machine.deviceSlots.bd_trough;
		// Published unconditionally -- see the note in (ii) above.
		task.meta.bdTroughAtBoot = before;
		console.log(`DW-70 bd_trough before the eject: ${JSON.stringify(before)}`);
		expect(before, `bd_trough must boot full -- got ${JSON.stringify(before)}`).toEqual([true, true, true, true]);

		loop.pulseCoil('c_trough_eject');
		let out = loop.advance(1, []);
		for (let i = 0; i < 300; i++) {
			out = loop.advance(1, []);
		}

		task.meta.bdTroughAfterEject = out.snapshot.game.machine.deviceSlots.bd_trough;
		console.log(`DW-70 bd_trough after the eject: ${JSON.stringify(out.snapshot.game.machine.deviceSlots.bd_trough)}`);

		expect(
			out.snapshot.game.machine.deviceSlots.bd_trough,
			`DW-70 anti-vacuity: bd_trough never left [true,true,true,true] after a real c_trough_eject pulse and 300 ` +
				`ticks -- the harness drove nothing, so assertions (i)/(ii) above would be vacuous. Got: ` +
				`${JSON.stringify(out.snapshot.game.machine.deviceSlots.bd_trough)}.`,
		).toEqual([true, true, true, false]);
	});
});
