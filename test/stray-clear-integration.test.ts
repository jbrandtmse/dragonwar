// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.13 (DW-244, AD-6 amended, AD-9, AD-4; author decision 2026-09-11):
// AC 5 (route 1, a loose voided ball) and AC 6 (route 1b, a resting served
// ball), driven through a REAL `createLoop()` with genuine input -- real
// physics, real devices, real rules, exactly `test/rules-tilt-integration.test.ts`'s
// own "the whole chain is actually connected" standard. Red first (spec Task
// 1): both routes were measured red on today's code before this story's
// `ball-controller.ts` edit -- see the Code Map's own "Measured at this
// tree" probes for the underlying defect these two tests pin.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { GameStart } from '../src/sim/table/names';
import type { InputTransition } from '../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** AC 5/AC 6's own Given: NO_BALL_SAVE_TUNING both ways -- a scripted drain/serve must never be intercepted as a save. */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

function gameStart(): GameStart {
	return {
		seed: 0,
		tuning: NO_BALL_SAVE_TUNING,
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0 },
		highscores: [],
	};
}

/** Ten `nudge_up` rising edges at the fastest achievable spacing (`test/cabinet-bob.test.ts`'s own cadence, `test/rules-tilt-integration.test.ts`'s own `burstTransitions()` precedent) -- enough to genuinely trip the slam detector (`slamNudgesPerWindow: 3`), unlike that file's own deliberately-under-count two-edge burst. */
function tenEdgeBurst(startTick: number): InputTransition[] {
	const transitions: InputTransition[] = [];
	for (let i = 0; i < 10; i++) {
		const onTick = startTick + i * 2;
		transitions.push({ tick: onTick, frame: { ...NO_FRAME, nudge_up: true } });
		transitions.push({ tick: onTick + 1, frame: NO_FRAME });
	}
	return transitions;
}

describe('AC 5 -- DW-244 route 1: a voided game\'s loose ball is removed before the serve (red first)', () => {
	it('the loose ball IS removed (positive); no stacking, no misattributed drain (negatives) -- all in the same run', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });

		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 3, frame: NO_FRAME }]);

		// The manual plunge, 401 -> 1601 (a ~1200-tick hold, this suite's own
		// full-strength idiom) -- long enough after Start that the served ball
		// has genuinely settled in the shooter lane first.
		let out = loop.advance(1, []);
		for (let i = 0; i < 398; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 1199; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);

		let sawLaunch = false;
		for (let i = 0; i < 500 && !sawLaunch; i++) {
			out = loop.advance(1, []);
			if (out.events.some((e) => e.type === 'ball_launched')) {
				sawLaunch = true;
			}
		}
		expect(sawLaunch, 'sanity: the manual plunge must genuinely launch the ball onto the field').toBe(true);

		// Ten nudge_up edges from 2501 -- enough to trip the slam detector.
		const burstStart = 2501;
		while (out.snapshot.tick < burstStart - 1) {
			out = loop.advance(1, []);
		}
		let sawSlam = false;
		const burst = tenEdgeBurst(burstStart);
		for (let tick = burstStart; tick < burstStart + 400 && !sawSlam; tick++) {
			const pending = burst.filter((t) => t.tick === tick);
			out = loop.advance(1, pending);
			if (out.events.some((e) => e.type === 'slam_tilt')) {
				sawSlam = true;
			}
		}
		expect(sawSlam, 'the ten-edge burst must genuinely slam-tilt the machine').toBe(true);
		expect(out.snapshot.game.phase, 'a Slam voids the game to Attract').toBe('attract');

		// The premise at tick 3500 -- moved 1000 ticks past the Slam (AC 5's
		// own instruction) so the cabinet's own residual ringing cannot
		// self-launch the served ball before the deliberate Start below.
		while (out.snapshot.tick < 3500) {
			out = loop.advance(1, []);
		}
		expect(out.snapshot.game.machine.ballsInPlay, 'the premise: ballsInPlay is still stale at 1').toBe(1);
		expect(out.snapshot.mechanisms.devices.bd_trough.slots.filter(Boolean).length, 'the premise: the trough still reads 3').toBe(3);
		expect(out.snapshot.balls, 'the premise: exactly one ball exists').toHaveLength(1);
		const looseBallId = out.snapshot.balls[0]!.id;
		// The premise: the voided ball is genuinely loose -- out of the shooter
		// lane (never resting in `bd_shooter`, the one device `recover()`
		// spares) and still on the open field (measured at this tree: still
		// rolling back down the playfield at tick 3500, well outside the lane
		// corridor `outsideLaneCorridor()` names for a settled rest position).
		expect(out.snapshot.mechanisms.devices.bd_shooter.slots, 'the premise: the ball is not resting in the shooter lane').toEqual([false]);

		// Start at T = 3501 (released 3502).
		const T = 3501;
		while (out.snapshot.tick < T - 1) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: T, frame: { ...NO_FRAME, start: true } }]);
		expect(out.snapshot.game.machine.ballsInPlay, 'DW-244: ballsInPlay is zeroed on the Start tick itself').toBe(0);

		out = loop.advance(1, [{ tick: T + 1, frame: NO_FRAME }]);
		const missing = out.events.find((e) => e.type === 'ball_missing');
		expect(missing, 'the positive: the loose ball is recovered, reported at T+1').toMatchObject({ count: 1 });
		// DW-257 (this same story, author decision 2026-09-11, AC 14): physics'
		// `recover()` now RETURNS the recovered ball to the trough's own lowest
		// empty slot instead of destroying it outright -- which, in this exact
		// route, IS the one slot the new serve's own eject (issued the same
		// tick, AD-4) immediately re-opens again to spawn the served ball. The
		// two exactly cancel at the SLOT-COUNT level (recover parks into the
		// trough's only open slot; the eject pulls from the trough's highest
		// filled slot -- now the very one recover() just closed), so the
		// trough reads 3 here, unchanged, rather than dropping to 2 -- ball
		// supply is conserved, never destroyed. The recovered ball's own id is
		// still gone (below): recover() always destroys the SPECIFIC Ball
		// object it removes; the served ball spawned by the eject is a
		// genuinely NEW one.
		expect(out.snapshot.mechanisms.devices.bd_trough.slots.filter(Boolean).length, 'the trough reads 3, unchanged -- DW-257 conserves the ball supply').toBe(3);
		expect(out.snapshot.mechanisms.devices.bd_shooter.slots, 'the served ball is in the lane at T+1').toEqual([true]);
		expect(out.snapshot.balls, 'exactly the served ball remains -- the loose one is gone').toHaveLength(1);
		expect(out.snapshot.balls.some((b) => b.id === looseBallId), 'the recorded loose ball id must be gone').toBe(false);
		// Rework iteration 1 (CR-1/DW-269): the RULES side must net to the
		// SAME 3 physics reads -- a wrongly-ordered recover/eject switch edge
		// (the close reaching rules AFTER the eject's own open, rather than
		// before -- see `devices.ts`'s `drainRecoverSwitchEvents()` doc
		// comment) would leave `deriveDeviceSlots()` believing the slot is
		// STILL closed, stuck at 4 here instead of netting back to 3. This is
		// the ONE route where the fix's presence and its absence coincide by
		// arithmetic accident (`deriveDeviceSlots()`'s identity guard
		// swallows the eject's lone open edge either way) -- so this
		// assertion pins the ORDER specifically, not the edge's mere
		// presence. Corrected at code review: the presence pin is
		// `test/ball-search-integration.test.ts`'s own "AC 2 + AC 7" (2.12)
		// case, whose recover shares no tick with any eject -- measured by
		// mutation (remove `recover()`'s `pendingRecoverSwitchEvents.push`:
		// that case reddens "the RULES-derived trough count must also rise to
		// 3", as does `test/ad7-device-slots.test.ts`). This comment
		// previously named `test/physics-recover-trough.test.ts`, whose own
		// rework-iteration change is comment-only and adds no assertion --
		// and whose header says the opposite.
		expect(
			out.snapshot.game.machine.deviceSlots.bd_trough.filter(Boolean).length,
			'CR-1: the rules-derived trough slot count must net to 3 (open), matching physics, never stuck at 4 (closed) from a wrongly-ordered edge',
		).toBe(3);
		// DW-269: the recover's own park at T+1 must never be misread as a
		// drain of the brand-new ball 1 -- `parkingEntryThisTick` is true this
		// tick (the recover's own close edge) at `ballsInPlay === 0`, exactly
		// the drain branch's trigger shape, guarded off by
		// `machineReport.recovered === null` in `ball-controller.ts`. Checked
		// at T+1 itself (Rule 19: a check that never ran is not a check) --
		// the "quiet run" loop below only starts sampling `ball_ended` from
		// T+2 onward, which would never have observed this exact tick.
		expect(
			out.events.some((e) => e.type === 'ball_ended'),
			'DW-269: no spurious ball_ended at T+1, the stray clear\'s own report tick',
		).toBe(false);

		// Release Start (a real press must not stay held into the run below).
		out = loop.advance(1, [{ tick: T + 2, frame: NO_FRAME }]);

		// Quiet run to T + 10000 -- the negatives: no stacking, no
		// misattributed drain.
		let sawBallEnded = false;
		let sawSecondLaunch = false;
		for (let i = 0; i < 9997; i++) {
			out = loop.advance(1, []);
			if (out.events.some((e) => e.type === 'ball_ended')) {
				sawBallEnded = true;
			}
			if (out.events.some((e) => e.type === 'ball_launched')) {
				sawSecondLaunch = true;
			}
		}
		expect(sawBallEnded, 'no ball_ended may arrive from T+1 through the quiet run').toBe(false);
		expect(sawSecondLaunch, 'no ball_launched may arrive from T+1 through the quiet run (the ball never self-launches)').toBe(false);
		expect(out.snapshot.balls, 'balls.length stays 1 through the quiet run').toHaveLength(1);
		expect(out.snapshot.mechanisms.devices.bd_trough.slots.filter(Boolean).length, 'the trough stays 3 through the quiet run').toBe(3);

		// The plunge -- the served ball finally launches for real.
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 1199; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);

		let sawFinalLaunch = false;
		for (let i = 0; i < 500 && !sawFinalLaunch; i++) {
			out = loop.advance(1, []);
			if (out.events.some((e) => e.type === 'ball_launched')) {
				sawFinalLaunch = true;
			}
		}
		expect(sawFinalLaunch, 'the plunge must genuinely launch the served ball').toBe(true);
		expect(out.snapshot.game.currentPlayer).toBe(0);
		expect(out.snapshot.game.players[0]!.ballNumber).toBe(1);
		expect(out.snapshot.game.machine.ballsInPlay).toBe(1);
	}, 60000);
});

describe('AC 6 -- DW-244 route 1b: a resting served ball is the ball served (red first)', () => {
	it('the resting ball IS served and plays as ball 1 (positive); no stacking (negative) -- in the same run', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });

		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		let out = loop.advance(1, [{ tick: 3, frame: NO_FRAME }]);

		// Let the served ball settle into the shooter lane, never plunging it
		// manually -- route 1b's own premise (T0 ~= 400).
		for (let i = 0; i < 397; i++) {
			out = loop.advance(1, []);
		}
		expect(out.snapshot.mechanisms.devices.bd_shooter.slots, 'sanity: the served ball must genuinely be resting before the burst').toEqual([true]);
		expect(out.snapshot.balls).toHaveLength(1);
		const restingBallId = out.snapshot.balls[0]!.id;

		// Ten nudge_up edges from 451.
		const burstStart = 451;
		while (out.snapshot.tick < burstStart - 1) {
			out = loop.advance(1, []);
		}
		let sawSlam = false;
		const burst = tenEdgeBurst(burstStart);
		for (let tick = burstStart; tick < burstStart + 400 && !sawSlam; tick++) {
			const pending = burst.filter((t) => t.tick === tick);
			out = loop.advance(1, pending);
			if (out.events.some((e) => e.type === 'slam_tilt')) {
				sawSlam = true;
			}
		}
		expect(sawSlam, 'the ten-edge burst must genuinely slam-tilt the machine').toBe(true);
		expect(out.snapshot.game.phase).toBe('attract');
		expect(out.snapshot.mechanisms.devices.bd_shooter.slots, 'the premise: the ball still rests in the lane after the Slam').toEqual([true]);
		expect(out.snapshot.balls).toHaveLength(1);

		// Start at T = 1501, 1000+ ticks past the Slam (the same margin AC 5
		// uses, for the identical reason -- the cabinet's own residual
		// ringing must not launch the resting ball before this deliberate
		// Start).
		const T = 1501;
		while (out.snapshot.tick < T - 1) {
			out = loop.advance(1, []);
			// Guard the premise through the wait: the resting ball must not
			// have self-launched from the cabinet's own ringing.
			expect(out.events.some((e) => e.type === 'ball_launched'), `no self-launch before T (at tick ${out.snapshot.tick})`).toBe(false);
		}
		out = loop.advance(1, [{ tick: T, frame: { ...NO_FRAME, start: true } }]);
		out = loop.advance(1, [{ tick: T + 1, frame: NO_FRAME }]);

		// The negative (Red today: trough 3 -> 2 at T+1 and two balls in the
		// lane): no stacking.
		expect(out.snapshot.mechanisms.devices.bd_trough.slots.filter(Boolean).length, 'the trough must stay 3 -- no second ball is ejected').toBe(3);
		expect(out.snapshot.balls, 'balls.length must stay 1 -- the resting ball is never stacked under a second one').toHaveLength(1);
		expect(out.snapshot.balls[0]!.id, 'the SAME resting ball must still be the only one').toBe(restingBallId);
		expect(out.events.some((e) => e.type === 'ball_missing'), 'no ball_missing -- nothing was loose').toBe(false);

		// 3000 quiet ticks -- neither a stray recover nor a launch may arrive.
		let sawLaunchDuringQuiet = false;
		for (let i = 0; i < 3000; i++) {
			out = loop.advance(1, []);
			if (out.events.some((e) => e.type === 'ball_launched')) {
				sawLaunchDuringQuiet = true;
			}
			expect(out.events.some((e) => e.type === 'ball_missing'), `no ball_missing during the quiet run (tick ${out.snapshot.tick})`).toBe(false);
		}
		expect(sawLaunchDuringQuiet, 'the resting ball must not self-launch during the quiet run').toBe(false);
		expect(out.snapshot.mechanisms.devices.bd_trough.slots.filter(Boolean).length).toBe(3);
		expect(out.snapshot.balls).toHaveLength(1);

		// The plunge -- the positive: the SAME resting ball leaves the lane and plays as ball 1.
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 1199; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);

		let sawLaunch = false;
		for (let i = 0; i < 500 && !sawLaunch; i++) {
			out = loop.advance(1, []);
			const launched = out.events.some((e) => e.type === 'ball_launched');
			if (launched) {
				sawLaunch = true;
			}
		}
		expect(sawLaunch, 'the plunge must genuinely launch the resting ball').toBe(true);
		expect(out.snapshot.balls.some((b) => b.id === restingBallId), 'the SAME recorded ball id leaves the lane').toBe(true);
		expect(out.snapshot.game.players[0]!.ballNumber, 'it plays as ball 1').toBe(1);
		expect(out.snapshot.game.machine.ballsInPlay).toBe(1);
	}, 60000);
});
