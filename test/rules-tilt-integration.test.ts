// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.11, AC 10 (Rule 1 -- the load-bearing Integration AC): the whole
// physics -> devices -> rules -> presentation chain, driven through a real
// `createLoop()` with GENUINE nudge input (`test/cabinet-bob.test.ts`'s own
// measured `burstFrames()` shape) -- never a scripted `tilt_bob_closed`
// stand-in. Nothing else in this story proves the chain is actually
// connected: a headless test that SCRIPTS `close('s_tilt_bob')` (as
// `test/rules-tilt.test.ts` does throughout) proves the rules-side
// consequence, never that a real plumb bob crossing its threshold produces
// the device event in the first place.
//
// `-integration.test.ts`-suffixed, so `test/rules-devices-headless.test.ts`'s
// ENTRY_FILES ratchet excludes it automatically (the same naming convention
// `rules-lifecycle-integration.test.ts` already establishes).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME, buttonSwitchEdges, frameInForceAt } from '../src/sim/loop';
import { createMachine } from '../src/sim/physics/machine';
import { createRules } from '../src/sim/rules';
import { HARDWARE_COILS } from '../src/sim/rules/ball-controller';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { CoilName, GameState, GameStart, SemanticEvent } from '../src/sim/table/names';
import type { InputFrame, InputTransition } from '../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function gameStart(): GameStart {
	return {
		seed: 0,
		tuning: resolveTuning(),
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0.08 },
		highscores: [],
	};
}

/**
 * `nudge_up` rising edges at the fastest achievable spacing, the SAME cadence
 * `test/cabinet-bob.test.ts`'s own `burstFrames()` and
 * `test/cabinet-integration.test.ts`'s own AC 8 test use -- but only TWO
 * edges, not that file's own ten.
 *
 * Measured for this story, at this tree: `burstFrames()`'s full ten-edge
 * burst ALSO trips the slam detector (`slamNudgesPerWindow: 3` within
 * `slamNudgeWindowMs: 500` -- ten edges inside ~20 ticks is far past that
 * count), which Story 1.7's own cabinet-level tests never noticed because
 * nothing downstream consumed `slam_tilt_closed` at the time. Now that this
 * story wires a real consumer, the same burst ends the game on the very
 * first few edges (a genuine `slam_tilt`, verified directly against this
 * file's own header) before the bob's own tilt_warning/tilt path can ever be
 * observed -- a real interaction between two Story 1.7 mechanisms this
 * story is the first to compose. TWO edges (measured directly against
 * `createCabinetMechanics()` at this tree: the bob crosses `thresholdDeg`
 * by tick 36 of a two-edge burst) stays comfortably under the slam count
 * while still crossing the bob's own threshold reliably.
 */
function burstTransitions(startTick: number): InputTransition[] {
	const transitions: InputTransition[] = [];
	for (let i = 0; i < 2; i++) {
		const onTick = startTick + i * 2;
		transitions.push({ tick: onTick, frame: { ...NO_FRAME, nudge_up: true } });
		transitions.push({ tick: onTick + 1, frame: NO_FRAME });
	}
	return transitions;
}

describe('Story 2.11, AC 10 -- the bob is reached through real nudge input, end to end', () => {
	it('a real createLoop, driven by genuine nudge bursts, produces tilt_warning then tilt in FrameOutput.events, with no machine.tilt ever seeded by the test', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart() });

		// Start a game and serve/launch a ball (test/rules-lifecycle-integration.test.ts's
		// own canonical shape) -- a ball must be in play for this test's final
		// claim (the ball's own eventual drain).
		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 3, frame: { ...NO_FRAME, start: false } }]);
		loop.advance(1, []); // physics ejects the served ball on the tick following Start
		loop.pulseCoil('c_autolaunch');

		const events: SemanticEvent[] = [];
		let sawWarning = false;
		let sawTilt = false;
		let warningTick = -1;
		let tiltTick = -1;

		// First burst, once the served ball has genuinely plunged
		// (ballsInPlay reaches 1) -- mirrors the served-ball-in-play precondition
		// every other tilt scenario in this story assumes.
		let out = loop.advance(1, []);
		for (let i = 0; i < 320 && out.snapshot.game.machine.ballsInPlay < 1; i++) {
			out = loop.advance(1, []);
		}
		expect(out.snapshot.game.machine.ballsInPlay, 'sanity: the served ball must genuinely plunge, or this test is vacuous').toBe(1);
		expect(out.snapshot.game.machine.tilt, 'sanity: nothing has seeded machine.tilt -- it must still read the boot default').toEqual({ tilted: false, slamTilted: false });

		const firstBurstStart = out.snapshot.tick + 1;
		const firstBurst = burstTransitions(firstBurstStart);

		// Advance through the burst and well past it (the cabinet's own
		// residual ringing, this file's own header) watching for tilt_warning.
		for (let tick = firstBurstStart; tick < firstBurstStart + 1600 && !sawWarning; tick++) {
			const pending = firstBurst.filter((t) => t.tick === tick);
			out = loop.advance(1, pending);
			events.push(...out.events);
			if (out.events.some((e) => e.type === 'tilt_warning')) {
				sawWarning = true;
				warningTick = out.snapshot.tick;
			}
		}
		expect(sawWarning, 'a tilt_warning must arrive from a REAL nudge burst crossing the plumb bob\'s threshold').toBe(true);
		expect(out.snapshot.game.machine.tilt.tilted, 'sanity: the first burst alone must not yet tilt (production tiltWarnings default is 1: the FIRST eligible closure only warns)').toBe(false);

		// Second burst, well after tiltWarningSpacingTicks (500 at production
		// TICK_HZ) has elapsed past the first burst's own ringing tail -- a
		// generous margin, not a measured exact figure.
		const secondBurstStart = warningTick + 3000;
		const secondBurst = burstTransitions(secondBurstStart);
		for (let tick = warningTick + 1; tick < secondBurstStart + 1600 && !sawTilt; tick++) {
			const pending = secondBurst.filter((t) => t.tick === tick);
			out = loop.advance(1, pending);
			events.push(...out.events);
			if (out.events.some((e) => e.type === 'tilt')) {
				sawTilt = true;
				tiltTick = out.snapshot.tick;
			}
		}
		expect(sawTilt, 'a second burst past the spacing window must tilt the machine').toBe(true);
		expect(out.snapshot.game.machine.tilt.tilted).toBe(true);
		expect(out.snapshot.game.machine.hardwareEnabled, 'the tilt must disable hardware (the GameState-level flag startBall()/game-over already drive from the SAME HARDWARE_COILS batch)').toBe(false);

		// The ball's eventual drain (gravity alone, every hardware coil now
		// disabled) must still produce ball_ended with tilted:true, total:0 --
		// never an unresolved run.
		let sawBallEnded = false;
		for (let i = 0; i < 20000 && !sawBallEnded; i++) {
			out = loop.advance(1, []);
			events.push(...out.events);
			const ended = out.events.find((e) => e.type === 'ball_ended');
			if (ended && ended.type === 'ball_ended') {
				expect(ended.tilted, 'the drain must be recorded as tilted').toBe(true);
				expect(ended.total, 'a tilted drain pays nothing').toBe(0);
				sawBallEnded = true;
			}
		}
		expect(sawBallEnded, 'the tilted ball must eventually drain and end -- not hang indefinitely').toBe(true);

		expect(warningTick, 'sanity: the warning must have arrived strictly before the tilt').toBeLessThan(tiltTick);
	}, 60000);
});

describe('Story 2.11, AC 10 -- HARDWARE_COILS receive their disables, observed at the seam FrameOutput cannot surface', () => {
	// `FrameOutput` deliberately carries no `CoilCommand`s (they are an
	// internal loop -> physics channel, `sim/loop/index.ts`'s own
	// `pendingCommands`), so this is observed on a PARALLEL `createMachine()`
	// + `createRules()` pair driven by the IDENTICAL transition sequence --
	// the same seam `createLoop()` itself calls internally -- mirroring
	// `test/cabinet-integration.test.ts`'s own AC 8 precedent for the
	// identical reason (that test needed real `SwitchEvent`s FrameOutput also
	// hides). Button-switch edges are `sim/loop`'s own derivation, never
	// `machine.step()`'s (AD-2) -- reused directly (`buttonSwitchEdges()`,
	// `frameInForceAt()`, both exported test-only seams `sim/loop/index.ts`
	// already declares for exactly this reason) rather than hand-rolled a
	// second time, so this harness cannot silently diverge from the real one.
	it('a real nudge burst, run against real physics and a real rules instance directly (never through the opaque createLoop() seam), produces a disable CoilCommand for every HARDWARE_COILS coil on the tilt tick', () => {
		const tuning = resolveTuning();
		const machine = createMachine(loadDoc(), tuning);
		const rules = createRules(tuning, { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0.08 });

		let state: GameState = {
			tick: 0,
			phase: 'attract',
			machine: {
				ballsInPlay: 0,
				hardwareEnabled: false,
				ballSave: { untilTick: null, sources: [] },
				tilt: { tilted: false, slamTilted: false },
				multiball: null,
				highscores: [],
				deviceSlots: { bd_trough: [true, true, true, true], bd_shooter: [false], bd_lock: [false, false, false] },
			},
			players: [],
			currentPlayer: 0,
			modes: [],
			rng: 0,
		};

		// The exact `s_start` press/release shape
		// `test/rules-lifecycle-integration.test.ts`'s own canonical Integration
		// AC uses.
		const pending: InputTransition[] = [
			{ tick: 2, frame: { ...NO_FRAME, start: true } },
			{ tick: 3, frame: NO_FRAME },
		];
		let currentFrame: InputFrame = NO_FRAME;
		let previousFrame: InputFrame = NO_FRAME;
		let tiltEventTick = -1;
		let ballsInPlayReached = false;
		let pendingCoilCommands: Array<{ readonly coil: CoilName; readonly action: 'pulse' | 'enable' | 'disable' }> = [];
		let disableSetAtTilt: Set<string> | undefined;

		function step(tick: number): void {
			currentFrame = frameInForceAt(pending, tick, currentFrame);
			const edges = buttonSwitchEdges(previousFrame, currentFrame, tick);
			previousFrame = currentFrame;

			const commandsForThisTick = pendingCoilCommands.map((c) => ({ type: 'coil' as const, coil: c.coil, action: c.action, tick }));
			pendingCoilCommands = [];
			const machineResult = machine.step(tick, currentFrame, commandsForThisTick);
			const switchEvents = [...edges, ...machineResult.switchEvents];
			const rulesResult = rules.step(state, switchEvents, tick);
			state = rulesResult.state;
			for (const event of rulesResult.events) {
				if (event.type === 'ball_launched') {
					ballsInPlayReached = true;
				}
				if (event.type === 'tilt') {
					tiltEventTick = tick;
					// Capture the exact disable set for THIS tick, before any later
					// tick's own commands (e.g. a future rotation's enables) could be
					// confused for it.
					disableSetAtTilt = new Set(rulesResult.coilCommands.filter((c) => c.action === 'disable').map((c) => c.coil));
				}
			}
			for (const command of rulesResult.coilCommands) {
				pendingCoilCommands.push({ coil: command.coil, action: command.action });
			}
		}

		let tick = 0;
		// Serve the ball (the trough-eject pulse startBall() queues at tick 2
		// fires at tick 3, mirroring the loop's own AD-4 "command issued at N
		// is consumed at N+1"), then queue the SAME dev autolaunch pulse
		// `test/rules-lifecycle-integration.test.ts` uses, timed identically
		// (right after the serve tick, consumed the FOLLOWING tick).
		for (; tick < 3; ) {
			tick += 1;
			step(tick);
		}
		pendingCoilCommands.push({ coil: 'c_autolaunch' as CoilName, action: 'pulse' });
		for (; !ballsInPlayReached && tick < 400; ) {
			tick += 1;
			step(tick);
		}
		expect(ballsInPlayReached, 'sanity: the served ball must genuinely plunge').toBe(true);

		const firstBurst = burstTransitions(tick + 1);
		pending.push(...firstBurst);
		pending.sort((a, b) => a.tick - b.tick);

		const secondBurstStart = tick + 1 + 1600 + 3000;
		const secondBurst = burstTransitions(secondBurstStart);
		pending.push(...secondBurst);
		pending.sort((a, b) => a.tick - b.tick);

		while (tiltEventTick === -1 && tick < secondBurstStart + 1600) {
			tick += 1;
			step(tick);
		}
		expect(tiltEventTick, 'sanity: the real burst pair must genuinely tilt the machine').toBeGreaterThan(0);
		expect(disableSetAtTilt, 'sanity: the tilt tick must carry a captured disable set').toBeDefined();
		for (const coil of HARDWARE_COILS) {
			expect(disableSetAtTilt!.has(coil), `${coil} must receive a disable CoilCommand on the real tilt tick`).toBe(true);
		}
		expect(HARDWARE_COILS.length, 'sanity: the hardware set is non-empty, or the loop above is vacuous').toBeGreaterThan(0);
	}, 60000);
});
