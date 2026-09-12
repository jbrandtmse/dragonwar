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
//         a real trough eject AND (Story 2.13 rework iteration 1, the
//         reviewer's own finding) a real stray-clear RECOVER, driven by a
//         genuine Slam-tilt-then-Start, never a dev seam. Still ONE `it()`
//         (the wrapper's exact-3 count is load-bearing, Rule 19) -- the
//         recover phase is a SECOND scenario inside the SAME body, not a
//         fourth case.
//   (iii) anti-vacuity self-check -- `bd_trough` must be OBSERVED leaving
//         `[true,true,true,true]` (i.e. the eject genuinely ran), so a
//         harness that silently never drove anything cannot pass (i) or (ii)
//         by never having anything to disagree about.
//
// Story 2.13 rework iteration 1 (CR-1's own third finding): before this
// pass, (ii)'s only recover-adjacent coverage was a bare `c_trough_eject`
// pulse -- a PARKING entry, never a RECOVER -- so this harness would not
// have caught CR-1 (`devices.ts`'s `recover()` parking a ball without
// closing the trough slot switch, leaving `GameState.machine.deviceSlots
// .bd_trough` under-reporting physics). (ii) now ALSO drives a real Slam
// (ten `nudge_up` edges, mirroring `test/rules-tilt-integration.test.ts`'s
// own burst) followed by a real Start, reaching a STANDALONE recover
// deliberately -- NOT `test/stray-clear-integration.test.ts`'s own AC 5
// route-1 shape, whose paired recover+eject on the same trough slot makes
// `deriveDeviceSlots()`'s identity guard swallow a MISSING recover edge
// exactly as completely as it nets a present, correctly-ordered one (see
// that file's own comment for the worked derivation). This scenario dev-
// pulses a second ball into the lane before the Slam (this file's own (ii)
// scenario above already uses that seam) so the eventual Start sees the
// lane occupied and issues no eject of its own -- the recover this reaches
// has nothing to pair with, and a missing or wrongly-ordered edge is an
// undisguised divergence from physics, measured and verified by mutation at
// this rework pass (reverting the switch-edge push reddens this exact case
// with `bd_trough` stuck at 2 closed slots instead of physics' own 3).
// Cross-checks EVERY ball device, not only `bd_trough`, at the recover's
// own report tick.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../../../src/sim/loop';
import { resolveTuning, TUNING as RAW_TUNING } from '../../../src/sim/table/tuning';
import { TABLE } from '../../../src/sim/table/dragonwar';
import type { BallDeviceName, GameStart } from '../../../src/sim/table/names';
import type { InputTransition } from '../../../src/sim/contracts/input';

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
		/** (ii), rework iteration 1: every ball device's rules-derived slots, one tick after a real Slam-then-Start's own stray-clear recover. */
		recoverRulesDerivedByDevice?: Record<string, readonly boolean[]>;
		/** (ii), rework iteration 1: the same tick's independent physics-derived slots, for every ball device. */
		recoverPhysicsDerivedByDevice?: Record<string, readonly boolean[] | undefined>;
		/** (ii), rework iteration 1: the recover's own `ball_missing` count -- must be 1, the anti-vacuity guard that the recover genuinely ran and found the voided ball loose. */
		recoverBallMissingCount?: number;
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

	it('(ii) whole-record cross-derivation: the rules-derived deviceSlots agree with the snapshot\'s own independent physics-derived view, for all three ball devices, across a real trough eject AND a real stray-clear recover', ({ task }) => {
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

		// ---------------------------------------------------------------
		// Rework iteration 1 (CR-1's own third finding): a SECOND scenario,
		// same `it()` -- a real Slam-then-Start, which is the ONLY way to
		// reach a genuine `RecoverCommand` through rules (AD-6: ball search
		// gates on `ballsInPlay > 0`, and the stray clear only fires from a
		// ball start). Built as a STANDALONE recover (no same-tick eject
		// paired with it) deliberately, not `test/stray-clear-integration
		// .test.ts`'s own AC 5 route-1 shape: on a bottom-filled contiguous
		// trough (AD-6), a PAIRED recover+eject on the SAME slot makes
		// `deriveDeviceSlots()`'s identity guard swallow a MISSING recover
		// edge exactly as completely as it nets a present, correctly-ordered
		// one (see that file's own comment for the fully worked derivation)
		// -- a harness built on that shape alone would not have caught
		// CR-1's own "no switch event at all" half. So: dev-pulse a SECOND
		// ball into the lane while ball 1 is still rolling (never a rules
		// decision -- the same seam this file's own (ii) scenario above
		// already uses), THEN Slam -- ball 1 is voided loose, ball 2 stays
		// resting in `bd_shooter` untouched, so the Start below sees the
		// lane occupied and issues no eject of its own. The recover this
		// scenario reaches has nothing to pair with.
		// ---------------------------------------------------------------
		const noBallSaveTuning = resolveTuning({
			...RAW_TUNING,
			ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
			ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
		});
		const recoverGameStart: GameStart = {
			seed: 0,
			tuning: noBallSaveTuning,
			adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0 },
			highscores: [],
		};
		const recoverLoop = createLoop({ collisionDoc: loadDoc(), gameStart: recoverGameStart, tuning: noBallSaveTuning });

		recoverLoop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		recoverLoop.advance(1, [{ tick: 3, frame: NO_FRAME }]);
		let rOut = recoverLoop.advance(1, []);
		for (let i = 0; i < 398; i++) {
			rOut = recoverLoop.advance(1, []);
		}
		rOut = recoverLoop.advance(1, [{ tick: rOut.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 1199; i++) {
			rOut = recoverLoop.advance(1, []);
		}
		rOut = recoverLoop.advance(1, [{ tick: rOut.snapshot.tick + 1, frame: NO_FRAME }]);
		let sawLaunch = false;
		for (let i = 0; i < 500 && !sawLaunch; i++) {
			rOut = recoverLoop.advance(1, []);
			if (rOut.events.some((e) => e.type === 'ball_launched')) {
				sawLaunch = true;
			}
		}
		expect(sawLaunch, 'the recover phase\'s own premise: the manual plunge must genuinely launch ball 1 onto the field').toBe(true);
		const ball1Id = rOut.snapshot.balls[0]!.id;

		// The dev pulse: a second ball served into the now-empty lane while
		// ball 1 is still rolling -- `test/ball-search-integration.test.ts`'s
		// own former AC 7 (route 2) technique, reused here for the SAME
		// reason it was reused there: this reaches the identical rules-level
		// state ("bd_shooter occupied while another ball is loose") a
		// genuine ball-search pass would too, without that pass's own
		// ~15,000-tick timeline.
		recoverLoop.pulseCoil('c_trough_eject');
		let sawArrival = false;
		for (let i = 0; i < 500 && !sawArrival; i++) {
			rOut = recoverLoop.advance(1, []);
			if (rOut.snapshot.mechanisms.devices.bd_shooter.slots[0] === true) {
				sawArrival = true;
			}
		}
		expect(sawArrival, 'the recover phase\'s own premise: ball 2 must genuinely settle in the lane').toBe(true);
		expect(rOut.snapshot.balls, 'the recover phase\'s own premise: two balls now exist').toHaveLength(2);

		// Ten nudge_up edges, starting 50 ticks after ball 2 settles (the
		// margin `test/stray-clear-integration.test.ts`'s own `tenEdgeBurst()`
		// spacing needs, inlined here -- this harness runs out-of-process and
		// never imports a `test/**` sibling).
		const burstStart = rOut.snapshot.tick + 50;
		while (rOut.snapshot.tick < burstStart - 1) {
			rOut = recoverLoop.advance(1, []);
		}
		const burst: InputTransition[] = [];
		for (let i = 0; i < 10; i++) {
			const onTick = burstStart + i * 2;
			burst.push({ tick: onTick, frame: { ...NO_FRAME, nudge_up: true } });
			burst.push({ tick: onTick + 1, frame: NO_FRAME });
		}
		let sawSlam = false;
		for (let tick = burstStart; tick < burstStart + 400 && !sawSlam; tick++) {
			const pending = burst.filter((t) => t.tick === tick);
			rOut = recoverLoop.advance(1, pending);
			if (rOut.events.some((e) => e.type === 'slam_tilt')) {
				sawSlam = true;
			}
		}
		expect(sawSlam, 'the recover phase\'s own premise: the ten-edge burst must genuinely slam-tilt the machine').toBe(true);
		expect(rOut.snapshot.game.phase, 'the recover phase\'s own premise: a Slam voids the game to Attract').toBe('attract');
		expect(rOut.snapshot.mechanisms.devices.bd_shooter.slots, 'the recover phase\'s own premise: ball 2 still rests in the lane after the Slam').toEqual([true]);
		expect(rOut.snapshot.balls.some((b) => b.id === ball1Id), 'the recover phase\'s own premise: ball 1 has not yet drained').toBe(true);

		// A margin past the Slam, mirroring AC 5/AC 6's own reasoning, so the
		// cabinet's residual ringing cannot self-launch or self-recover
		// anything before this deliberate Start.
		const recoverStartTick = rOut.snapshot.tick + 1000;
		while (rOut.snapshot.tick < recoverStartTick - 1) {
			rOut = recoverLoop.advance(1, []);
		}
		expect(rOut.snapshot.balls.some((b) => b.id === ball1Id), 'the recover phase\'s own premise, re-checked after the wait: ball 1 is still loose, not yet drained').toBe(true);
		rOut = recoverLoop.advance(1, [{ tick: recoverStartTick, frame: { ...NO_FRAME, start: true } }]);
		// No eject: `bd_shooter` reads occupied (ball 2) at Start time, so
		// `startBall()`'s own lane-occupied check skips the trough pulse --
		// this recover has nothing to pair with, unlike AC 5's own route 1.
		rOut = recoverLoop.advance(1, [{ tick: recoverStartTick + 1, frame: NO_FRAME }]);

		const missing = rOut.events.find((e) => e.type === 'ball_missing');
		task.meta.recoverBallMissingCount = missing && missing.type === 'ball_missing' ? missing.count : undefined;
		expect(
			missing,
			"anti-vacuity: the recover must genuinely have found ball 1 loose (ball_missing { count: 1 }) at T+1, standalone -- or the cross-derivation below would compare two views that never disagreed about anything",
		).toMatchObject({ count: 1 });
		expect(rOut.snapshot.balls, 'the positive: exactly the resting lane ball (ball 2) remains -- ball 1 is gone, and no eject was drawn from the trough').toHaveLength(1);

		const recoverRulesDerived = rOut.snapshot.game.machine.deviceSlots;
		const recoverPhysicsDerived = rOut.snapshot.mechanisms.devices;
		const recoverRulesByDevice: Record<string, readonly boolean[]> = {};
		const recoverPhysicsByDevice: Record<string, readonly boolean[] | undefined> = {};
		for (const device of Object.keys(TABLE.ballDevices) as BallDeviceName[]) {
			recoverRulesByDevice[device] = recoverRulesDerived[device];
			recoverPhysicsByDevice[device] = recoverPhysicsDerived[device]?.slots;
		}
		task.meta.recoverRulesDerivedByDevice = recoverRulesByDevice;
		task.meta.recoverPhysicsDerivedByDevice = recoverPhysicsByDevice;
		console.log(`DW-70 (recover phase) rules-derived: ${JSON.stringify(recoverRulesByDevice)}`);
		console.log(`DW-70 (recover phase) physics-derived: ${JSON.stringify(recoverPhysicsByDevice)}`);

		for (const device of Object.keys(TABLE.ballDevices) as BallDeviceName[]) {
			expect(
				recoverRulesByDevice[device],
				`CR-1 (Story 2.13 rework iteration 1): GameState.machine.deviceSlots.${device} (rules-derived) disagrees ` +
					`with the snapshot's own independent physics-derived view ONE TICK AFTER a real stray-clear recover -- ` +
					`exactly the class of defect CR-1 shipped (recover() parking a ball without closing the trough slot ` +
					`switch, so the rules-derived view under-reported physics). Rules-derived: ` +
					`${JSON.stringify(recoverRulesByDevice[device])}. Physics-derived: ${JSON.stringify(recoverPhysicsByDevice[device])}.`,
			).toEqual(recoverPhysicsByDevice[device]);
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
