// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.6, Integration AC (Rule 1) -- a real consumer against a real
// instance: a real createLoop, driven through Start with two players (Hot
// seat) and a genuine drain, piping each real FrameOutput through
// advanceBackglass()/renderFrame() exactly as src/host/boot.ts's onFrame
// body does. Follows test/rules-lifecycle-integration.test.ts:36-60's own
// real-loop pattern -- never a mock.
//
// The drain itself is real physics, not fabricated: c_pop_1/2/3 and
// c_sling_l/c_sling_r are disabled first (AD-5's own sanctioned coil-enable
// dev hatch -- the SAME one src/host/boot.ts exposes as
// window.__dragonwarBoot.setCoilEnabled) so the served ball's descent is
// governed by gravity and passive collision losses alone, which -- given
// this table's own "no permanent stranding" design invariant (2.1a-2.1d's
// many DW-119-class fixes) -- drains deterministically in a bounded number
// of ticks (measured during this story's own planning: ~4,278 ticks with
// this exact setup, reproduced 3/3 times). Disabling those five coils (three pops, two slingshots -- code review: this comment previously said "two") is a
// real, physically legitimate configuration (AD-5: "Disabled, they act as
// passive rubber and emit no actuation"), not a mock of the drain itself.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buttonSwitchEdges, createLoop, frameInForceAt, NO_FRAME } from '../src/sim/loop';
import { createMachine } from '../src/sim/physics/machine';
import { createRules } from '../src/sim/rules';
import { advanceBackglass, renderFrame, INITIAL_BACKGLASS_VIEW, type DmdScreen } from '../src/presentation/backglass/frame';
import { rasterise } from '../src/presentation/backglass/raster';
import { FONT_5X7 } from '../src/presentation/backglass/font';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { close, runRulesScript } from './util/switch-script';
import { BASE_GAME_STATE, buildPlayer, buildSnapshot } from './util/snapshot-factory';
import { MAX_OWED_TICKS } from '../src/sim/contracts/time';
import type { CoilCommand, CoilName, FrameOutput, GameStart, GameState, RecoverCommand, SwitchName } from '../src/sim/table/names';
import type { InputFrame, InputTransition } from '../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const DISABLED_HAZARD_COILS: readonly CoilName[] = ['c_pop_1', 'c_pop_2', 'c_pop_3', 'c_sling_l', 'c_sling_r'];
const MAX_TICKS = 15000;

/**
 * Story 2.9: this file's own served ball drains after ~4,278 real-physics
 * ticks (this file's own header) -- comfortably inside the production
 * ball-save window (8 s default), which this story's own drain
 * interception would otherwise turn into a SAVE (re-serving the ball, never
 * emitting ball_ended) rather than the real drain this whole describe block
 * exists to exercise. An override tuning with the window and grace both
 * shrunk to near-zero keeps this file's own drain mechanism (gravity and
 * passive collision losses alone, per this file's own header) and every
 * assertion EXACTLY as Story 2.6 authored them -- only the ball-save
 * timing (incidental to what this file actually covers) changes. Passed as
 * `createLoop()`'s own `tuning` option -- the loop's ACTUAL physics/rules
 * tuning, never `GameStart.tuning` alone, which `createLoop()` embeds in
 * `GameState` but does not itself resolve from.
 */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function gameStart(): GameStart {
	return {
		seed: 0,
		tuning: NO_BALL_SAVE_TUNING,
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0 },
		highscores: [],
	};
}

describe('Integration AC -- a real createLoop, Hot seat with two players, a genuine drain, piped through advanceBackglass()/renderFrame()', () => {
	it('the screen sequence passes through an in-game score screen and reaches ball_ended at the frame carrying that event, naming the PAYLOAD player', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });

		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 3, frame: { ...NO_FRAME, start: false } }]);
		loop.advance(1, [{ tick: 10, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 11, frame: { ...NO_FRAME, start: false } }]);

		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}
		loop.pulseCoil('c_autolaunch');

		let view = INITIAL_BACKGLASS_VIEW;
		const screenSequence: DmdScreen[] = [];
		let ballEndedScreen: ReturnType<typeof renderFrame> | undefined;
		let ballEndedTick = -1;
		let playersAtEnd = -1;
		let currentPlayerAtEnd = -1;
		let payloadPlayerAtEnd = -1;

		for (let iteration = 1; iteration <= MAX_TICKS; iteration++) {
			const output = loop.advance(1, []);
			view = advanceBackglass(view, output);
			screenSequence.push(view.screen);
			const ended = output.events.find((e) => e.type === 'ball_ended');
			if (ended && ended.type === 'ball_ended') {
				ballEndedTick = output.snapshot.tick;
				playersAtEnd = output.snapshot.game.players.length;
				currentPlayerAtEnd = output.snapshot.game.currentPlayer;
				payloadPlayerAtEnd = ended.player;
				ballEndedScreen = renderFrame(view, output.snapshot);
				break;
			}
		}

		expect(ballEndedTick, `the served ball must genuinely drain within ${MAX_TICKS} advances -- the whole test is vacuous otherwise`).toBeGreaterThan(0);

		// Code review: the PLAYER 1 / not-PLAYER 2 pair below only discriminates
		// payload-from-snapshot if Hot seat genuinely added a second player AND
		// currentPlayer genuinely rotated off the ending player. If Hot seat
		// ever regressed to a single player, `nextPlayer` would wrap to 0, the
		// two sources would AGREE, `PLAYER 1` would still be correct, and a
		// snapshot-reading implementation would pass silently. This story's own
		// unit sibling guards exactly this (test/backglass-frame.test.ts:89-90);
		// the Integration AC did not.
		expect(playersAtEnd, 'Hot seat must have genuinely added a second player, or the payload/snapshot discriminator below is vacuous').toBe(2);
		expect(payloadPlayerAtEnd, 'the ENDING player must be player 0').toBe(0);
		expect(currentPlayerAtEnd, 'currentPlayer must have genuinely rotated off the ending player by the time this same-frame snapshot arrives').not.toBe(payloadPlayerAtEnd);

		expect(screenSequence, 'the sequence must pass through an in-game score screen before ball_ended').toContain('score');
		// Code review: assert the ball_ended screen appears ONCE, at the end --
		// `expect(last).toBe('ball_ended')` alone was tautological, since the
		// loop pushes `view.screen` and breaks on that same iteration.
		expect(screenSequence[screenSequence.length - 1]).toBe('ball_ended');
		expect(
			screenSequence.slice(0, -1).includes('ball_ended'),
			'ball_ended must appear only at the frame carrying the event, never before it',
		).toBe(false);

		expect(ballEndedScreen!.screen).toBe('ball_ended');
		// This is the story's own sharpest discriminator (Design Notes): the
		// real loop's currentPlayer has ALREADY rotated by the time this
		// same-tick snapshot arrives, so a correct read of event.player, not
		// snapshot.game.currentPlayer, is what makes this assertion meaningful.
		expect(ballEndedScreen!.rows.some((r) => r.text === 'PLAYER 1'), 'must name PLAYER 1 (the ENDING player, 0-indexed 0, 1-indexed for display)').toBe(true);
		expect(ballEndedScreen!.rows.some((r) => r.text === 'PLAYER 2'), 'must NOT name PLAYER 2 -- that would mean reading currentPlayer post-rotation instead of the event payload').toBe(false);

		// Code review: the Integration AC stopped one call short of the
		// composition src/host/boot.ts:236 actually runs -- it is
		// `rasterise(renderFrame(...), FONT_5X7)`, not `renderFrame` alone. Take
		// the real loop's own end-of-ball frame all the way to lit dots, so the
		// frame -> raster leg is exercised against real loop output and not only
		// against synthetic frames.
		const realRaster = rasterise(ballEndedScreen!, FONT_5X7);
		expect(realRaster.dots.length).toBe(realRaster.cols * realRaster.rows);
		expect(
			realRaster.dots.some((d) => d === 1),
			'the real end-of-ball frame must actually light dots once rasterised -- a blank panel is the failure this pins',
		).toBe(true);

		// Story 2.10 (AC 8, this story's own "Zero bonus" I/O row): this
		// file's own drain is gravity-only with every scoring hazard (pops,
		// slingshots) disabled and never touches a DRAGON-bank target or a
		// Loop, so the ending player's real bonus is genuinely zero -- no
		// BONUS row, DW-200's own "no entry means no row" precedent. The
		// GENUINELY nonzero, discriminating case (the row present, changing
		// across steps, and a control that strips only the bonus_count_step
		// events) is test/backglass-frame.test.ts's own headless "AC 8" describe
		// block, built from a real runRulesScript run driven deliberately
		// through a bank target and a Loop -- forcing a real PHYSICS ball
		// through either one reliably, on top of this file's own from-rest
		// gravity drain, is not a tractable addition here.
		expect(ballEndedScreen!.rows.some((r) => r.text.startsWith('BONUS ')), 'this drain never credits a bonus category, so no BONUS row is expected').toBe(false);

		// Code review 2026-09-08 (verification-gap, Rule 19): the assertion just
		// above is evaluated on the ARMING frame. Story 3.0 (DW-236) made that
		// frame discriminating on its own -- a nonzero bonus now shows `BONUS
		// <total>` from the arming frame -- but a stray step could still land
		// later. Keep folding through the whole window in which one could
		// arrive, so the "Zero bonus" I/O row is asserted where a step COULD
		// have landed. The window (at most 3 steps, one per category, since
		// Story 3.0) is well inside the 3000-tick end-of-ball hold, so the
		// screen is still `ball_ended` throughout.
		const bonusWindowTicks = resolveTuning().bonusCountTicks.value * 3 + 10;
		let bonusRowTick = -1;
		for (let i = 0; i < bonusWindowTicks; i++) {
			const output = loop.advance(1, []);
			view = advanceBackglass(view, output);
			if (renderFrame(view, output.snapshot).rows.some((r) => r.text.startsWith('BONUS '))) {
				bonusRowTick = output.snapshot.tick;
				break;
			}
		}
		expect(view.screen, 'sanity: the end-of-ball hold must still be up across the whole count window, or this scan looked at the wrong screen').toBe('ball_ended');
		expect(
			bonusRowTick,
			'a genuinely zero-bonus ball emits no bonus_count_step, so no BONUS row may appear anywhere in the window one could have arrived in',
		).toBe(-1);
	});

	it('control (Rule 19): the identical composition, with this frame\'s events emptied, never shows ball_ended -- proving the assertion above reads events, not only the snapshot', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });
		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 3, frame: { ...NO_FRAME, start: false } }]);
		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}
		loop.pulseCoil('c_autolaunch');

		let view = INITIAL_BACKGLASS_VIEW;
		let sawBallEndedEvent = false;
		for (let tick = 1; tick <= MAX_TICKS; tick++) {
			const output = loop.advance(1, []);
			if (output.events.some((e) => e.type === 'ball_ended')) {
				sawBallEndedEvent = true;
				// The SAME snapshot the real event carried, but events emptied --
				// the composition src/host/boot.ts would never actually construct,
				// used only to prove the discriminator.
				view = advanceBackglass(view, { ...output, events: [] });
				break;
			}
			view = advanceBackglass(view, output);
		}

		expect(sawBallEndedEvent, 'sanity: the real run must still have produced the event this control strips').toBe(true);
		expect(view.screen, 'with events emptied, the ball_ended screen must never be selected').not.toBe('ball_ended');
	});
});

// Story 3.0 AC 10 (Integration, Rule 1): the count-DOWN end to end. A real
// createRules() (inside runRulesScript), driven through bank targets, a Left
// Loop and a trough drain, and every tick's own events and state folded
// through the same advanceBackglass()/renderFrame() calls src/host/boot.ts's
// onFrame body makes -- one tick per FrameOutput here, whereas the real loop
// batches several ticks per frame (that batching is pinned separately, by
// the AC 4 and AC 6 fold tests in test/backglass-frame.test.ts). The drain is
// scripted rather than physical: forcing a real physics ball through a bank
// target and a Loop is not tractable here (see the zero-bonus note above),
// and the fold under test only reads events and snapshots.
describe('Story 3.0 AC 10 -- a real createRules() run, folded tick by tick through advanceBackglass()/renderFrame(), counts BONUS down to 0 while the score line pays into the final score', () => {
	it('the ball_ended screen reads (pre, BONUS total) -> (pre + 15,000, BONUS 10,000) -> (final, BONUS 0), the final score landing exactly on the last step', () => {
		const loopOutTick = 30;
		const drainTick = 60;
		// Hot seat (two Start presses) so the ending player's own score is not
		// touched again by the same-tick rotation.
		const script = close('s_start').at(5).at(8)
			.open('s_shooter_lane').at(10)
			.close(TABLE.dropBankWiring.d.switch).at(15)
			.close(TABLE.dropBankWiring.r.switch).at(16)
			.close(TABLE.dropBankWiring.a.switch).at(17)
			.close('s_loop_l_in').at(20)
			.close('s_loop_l_out').at(loopOutTick)
			.close('s_trough_1').at(drainTick);
		const bonusCountTicks = NO_BALL_SAVE_TUNING.bonusCountTicks.value;
		const durationTicks = drainTick + bonusCountTicks * 2 + 50;
		const result = runRulesScript(script.build(), { durationTicks, tuning: NO_BALL_SAVE_TUNING });

		const ended = result.events.find((e) => e.type === 'ball_ended');
		expect(ended && ended.type === 'ball_ended' ? [ended.tick, ended.player, ended.total] : undefined, 'sanity: 3 letters (15,000) + 1 loop (10,000) at x1, paid by player 0 at the drain').toEqual([drainTick, 0, 25_000]);
		const pre = result.statesByTick.get(drainTick - 1)!.players[0]!.score;
		const final = result.statesByTick.get(drainTick)!.players[0]!.score;
		expect(final, 'sanity: the sim pays the whole bonus on the drain tick').toBe(pre + 25_000);

		// The boot.ts fold, one tick per FrameOutput.
		let view = INITIAL_BACKGLASS_VIEW;
		const shown: Array<{ tick: number; score: string | undefined; bonus: string | undefined }> = [];
		for (let tick = 1; tick <= durationTicks; tick++) {
			const output: FrameOutput = {
				snapshot: buildSnapshot({ tick, game: result.statesByTick.get(tick)! }),
				events: result.events.filter((e) => e.tick === tick),
				contactEvents: [],
				commands: [],
			};
			view = advanceBackglass(view, output);
			const frame = renderFrame(view, output.snapshot);
			if (frame.screen === 'ball_ended') {
				const last = shown[shown.length - 1];
				const score = frame.rows[1]?.text;
				const bonus = frame.rows.find((r) => r.text.startsWith('BONUS '))?.text;
				if (!last || last.score !== score || last.bonus !== bonus) {
					shown.push({ tick, score, bonus });
				}
			}
		}

		const commas = (value: number): string => value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		expect(shown).toEqual([
			{ tick: drainTick, score: commas(pre), bonus: 'BONUS 25,000' },
			{ tick: drainTick + bonusCountTicks, score: commas(pre + 15_000), bonus: 'BONUS 10,000' },
			{ tick: drainTick + bonusCountTicks * 2, score: commas(final), bonus: 'BONUS 0' },
		]);
		expect(view.screen, 'sanity: the hold is still up at the end of the window, so every step landed inside it').toBe('ball_ended');
	});
});

describe('Story 2.11, task 12 (AC 9) -- a real createLoop folds a tilted ball\'s frames into the WARNING and TILT screens, exactly as src/host/boot.ts\'s own frame fold does', () => {
	/**
	 * TWO `nudge_up` rising edges at the fastest achievable spacing -- the
	 * same cadence `test/cabinet-bob.test.ts`'s own `burstFrames()` uses, but
	 * only two edges (measured for this story, `test/rules-tilt-integration.test.ts`'s
	 * own header): the full ten-edge burst also trips the slam detector
	 * (`slamNudgesPerWindow: 3` within `slamNudgeWindowMs: 500`), which ends
	 * the game before the bob's own warning/tilt path can ever be observed.
	 * Two edges cross the bob's own `thresholdDeg` (measured directly:
	 * tick 36 of a two-edge burst) while staying under the slam count.
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

	it('the WARNING row appears at the warning tick, the TILT row appears after the tilt, and the events:[] control never shows WARNING', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart() });

		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 3, frame: { ...NO_FRAME, start: false } }]);
		loop.advance(1, []);
		loop.pulseCoil('c_autolaunch');

		let out = loop.advance(1, []);
		for (let i = 0; i < 320 && out.snapshot.game.machine.ballsInPlay < 1; i++) {
			out = loop.advance(1, []);
		}
		expect(out.snapshot.game.machine.ballsInPlay, 'sanity: the served ball must genuinely plunge, or this test is vacuous').toBe(1);

		let view = INITIAL_BACKGLASS_VIEW;
		let strippedView = INITIAL_BACKGLASS_VIEW;
		let sawWarningRow = false;
		let sawTiltRow = false;
		let sawStrippedWarningRow = false;
		// Code review (Story 2.11): the two-edge burst is measured to stay under
		// the slam detector's count; pinned here so a tuning drift fails as a
		// slam, not as a missing WARNING row.
		let sawSlam = false;

		const firstBurstStart = out.snapshot.tick + 1;
		const firstBurst = burstTransitions(firstBurstStart);
		for (let tick = firstBurstStart; tick < firstBurstStart + 1600 && !sawWarningRow; tick++) {
			const pending = firstBurst.filter((t) => t.tick === tick);
			out = loop.advance(1, pending);
			if (out.events.some((e) => e.type === 'slam_tilt')) {
				sawSlam = true;
			}
			view = advanceBackglass(view, out);
			strippedView = advanceBackglass(strippedView, { ...out, events: [] });
			if (renderFrame(view, out.snapshot).rows.some((r) => r.text === 'WARNING')) {
				sawWarningRow = true;
			}
			if (renderFrame(strippedView, out.snapshot).rows.some((r) => r.text === 'WARNING')) {
				sawStrippedWarningRow = true;
			}
		}
		expect(sawSlam, 'sanity: the two-edge burst must stay under the slam count').toBe(false);
		expect(sawWarningRow, 'a real nudge burst crossing the bob\'s threshold must produce a WARNING row').toBe(true);
		expect(sawStrippedWarningRow, 'the SAME frames, re-folded with events stripped, must never show WARNING').toBe(false);

		const secondBurstStart = out.snapshot.tick + 3000;
		const secondBurst = burstTransitions(secondBurstStart);
		for (let tick = out.snapshot.tick + 1; tick < secondBurstStart + 1600 && !sawTiltRow; tick++) {
			const pending = secondBurst.filter((t) => t.tick === tick);
			out = loop.advance(1, pending);
			view = advanceBackglass(view, out);
			if (renderFrame(view, out.snapshot).rows.some((r) => r.text === 'TILT')) {
				sawTiltRow = true;
			}
		}
		expect(sawTiltRow, 'a second real burst past the spacing window must tilt the machine and show the TILT row').toBe(true);
		expect(out.snapshot.game.machine.tilt.tilted, 'sanity: the machine must genuinely be tilted').toBe(true);
	}, 30000);
});

// Story 3.0 QA (AC 1, AC 4, AC 6, AC 10). The AC 10 test above counts a
// two-step, x1 bonus and folds one tick per FrameOutput. These tests close
// the gaps it leaves, all through a real createRules() (inside
// runRulesScript) and the same advanceBackglass()/renderFrame()/rasterise()
// calls src/host/boot.ts's onFrame body makes:
// - a THREE-step count (every category) with a multiplier the player EARNS
//   on real Top-lane switches, so each step pays `category value x
//   multiplier` into the rendered score line;
// - the real loop's batching: sim/loop/index.ts's advance() hands one
//   FrameOutput per rendered frame, carrying every owed tick's events in
//   order and the LAST tick's snapshot (up to MAX_OWED_TICKS). foldFrames()
//   below reproduces exactly that shape from the per-tick run.
describe('Story 3.0 QA -- a real createRules() run folded like the real loop: three steps at an earned multiplier, and batched frames', () => {
	interface Shown {
		readonly tick: number;
		readonly player: string | undefined;
		readonly score: string | undefined;
		readonly bonus: string | undefined;
		readonly dots: string;
	}

	const commas = (value: number): string => value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const parseScore = (text: string | undefined): number => Number((text ?? '').replace(/,/g, ''));

	/**
	 * Folds `result` through the Backglass in frames of `frameTicks` ticks,
	 * each FrameOutput carrying every tick's events in tick order and the
	 * snapshot of its LAST tick (sim/loop/index.ts advance()'s own shape).
	 * Returns every DISTINCT end-of-ball screen state, rasterised to lit dots
	 * so the change is observed on the DMD itself, not only in row text.
	 */
	function foldFrames(result: ReturnType<typeof runRulesScript>, durationTicks: number, frameTicks: number): Shown[] {
		let view = INITIAL_BACKGLASS_VIEW;
		const shown: Shown[] = [];
		for (let start = 1; start <= durationTicks; start += frameTicks) {
			const end = Math.min(durationTicks, start + frameTicks - 1);
			const output: FrameOutput = {
				snapshot: buildSnapshot({ tick: end, game: result.statesByTick.get(end)! }),
				events: result.events.filter((e) => e.tick >= start && e.tick <= end),
				contactEvents: [],
				commands: [],
			};
			view = advanceBackglass(view, output);
			const frame = renderFrame(view, output.snapshot);
			if (frame.screen !== 'ball_ended') {
				continue;
			}
			const entry: Shown = {
				tick: end,
				player: frame.rows[0]?.text,
				score: frame.rows[1]?.text,
				bonus: frame.rows.find((r) => r.text.startsWith('BONUS '))?.text,
				dots: rasterise(frame, FONT_5X7).dots.join(''),
			};
			const last = shown[shown.length - 1];
			if (!last || last.score !== entry.score || last.bonus !== entry.bonus || last.player !== entry.player) {
				shown.push(entry);
			}
		}
		return shown;
	}

	/** Hot seat, player 2 (index 1) up, base mode only, 1 strike seeded (nothing credits a strike before Story 3.9's Strikes; the arithmetic still counts it). */
	function midGame(preScore: number): GameState {
		const strikeSeeded = buildPlayer({ score: preScore, ballNumber: 1, bonus: { byCategory: { letters: 0, loops: 0, strikes: 1 }, multiplier: 1 } });
		return {
			...BASE_GAME_STATE,
			phase: 'game',
			machine: { ...BASE_GAME_STATE.machine, ballsInPlay: 1, deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] } },
			players: [buildPlayer({ score: 500, ballNumber: 1 }), strikeSeeded],
			currentPlayer: 1,
			modes: [{ mode: 'base', priority: 100, player: 1 }],
		};
	}

	/** The real switch script: one Top-lane set (x2, EARNED), D/R/A (3 letters), one Left Loop, then the trough drain. */
	function earnedBonusScript(drainTick: number) {
		return close('s_top_1').at(3).close('s_top_2').at(4).close('s_top_3').at(5)
			.close(TABLE.dropBankWiring.d.switch).at(10)
			.close(TABLE.dropBankWiring.r.switch).at(11)
			.close(TABLE.dropBankWiring.a.switch).at(12)
			.close('s_loop_l_in').at(20)
			.close('s_loop_l_out').at(30)
			.close('s_trough_1').at(drainTick)
			.build();
	}

	function tuningAtPace(bonusCountMs: number) {
		return resolveTuning({ ...RAW_TUNING, ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 }, ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 }, bonusCountMs: { ...RAW_TUNING.bonusCountMs, value: bonusCountMs } });
	}

	it('three steps at an earned x2: BONUS 100,000 -> 70,000 -> 50,000 -> 0 on the DMD, the score line paying 30,000 / 20,000 / 50,000 (each category x the multiplier) into the final score', () => {
		const drainTick = 60;
		const bonusCountTicks = NO_BALL_SAVE_TUNING.bonusCountTicks.value;
		const durationTicks = drainTick + bonusCountTicks * 3 + 50;
		const result = runRulesScript(earnedBonusScript(drainTick), { durationTicks, initialState: midGame(1234), tuning: NO_BALL_SAVE_TUNING });

		expect(result.statesByTick.get(drainTick - 1)!.players[1]!.bonus, 'sanity: 3 letters and 1 loop credited by real switches, x2 EARNED on the Top lanes, the seeded strike kept').toEqual({ byCategory: { letters: 3, loops: 1, strikes: 1 }, multiplier: 2 });
		const ended = result.events.find((e) => e.type === 'ball_ended');
		expect(ended && ended.type === 'ball_ended' ? [ended.tick, ended.player, ended.total] : undefined, 'sanity: (3 x 5,000 + 10,000 + 25,000) x 2, paid by player 2 at the drain').toEqual([drainTick, 1, 100_000]);
		const pre = result.statesByTick.get(drainTick - 1)!.players[1]!.score;
		const final = result.statesByTick.get(drainTick)!.players[1]!.score;
		expect(final, 'sanity: the sim pays the whole bonus on the drain tick').toBe(pre + 100_000);

		const shown = foldFrames(result, durationTicks, 1);
		expect(shown.map(({ tick, player, score, bonus }) => ({ tick, player, score, bonus }))).toEqual([
			{ tick: drainTick, player: 'PLAYER 2', score: commas(pre), bonus: 'BONUS 100,000' },
			{ tick: drainTick + bonusCountTicks, player: 'PLAYER 2', score: commas(pre + 30_000), bonus: 'BONUS 70,000' },
			{ tick: drainTick + bonusCountTicks * 2, player: 'PLAYER 2', score: commas(pre + 50_000), bonus: 'BONUS 50,000' },
			{ tick: drainTick + bonusCountTicks * 3, player: 'PLAYER 2', score: commas(final), bonus: 'BONUS 0' },
		]);

		// Read back from the RENDERED rows, not from this test's own arithmetic:
		// the score line strictly rises, each rise is exactly what that step's
		// BONUS row fell by, and the two always sum to the final score.
		const scores = shown.map((s) => parseScore(s.score));
		const bonuses = shown.map((s) => parseScore(s.bonus?.slice('BONUS '.length)));
		for (let i = 1; i < shown.length; i++) {
			expect(scores[i]!, `step ${i}: the rendered score line strictly rises`).toBeGreaterThan(scores[i - 1]!);
			expect(scores[i]! - scores[i - 1]!, `step ${i}: the score line rises by exactly what BONUS fell by`).toBe(bonuses[i - 1]! - bonuses[i]!);
		}
		for (const [i, s] of shown.entries()) {
			expect(scores[i]! + bonuses[i]!, `frame ${s.tick}: score line + BONUS is always the final score`).toBe(final);
		}
		// Each state reaches the DMD itself: every consecutive pair of rasters differs.
		for (let i = 1; i < shown.length; i++) {
			expect(shown[i]!.dots, `step ${i}: the rasterised DMD changes`).not.toBe(shown[i - 1]!.dots);
		}
	});

	it('batched like the real loop (17-tick frames, about 60 Hz, and MAX_OWED_TICKS stalls) at the production pace: the SAME screen states, in the same order, ending on BONUS 0 and the final score', () => {
		const drainTick = 60;
		const bonusCountTicks = NO_BALL_SAVE_TUNING.bonusCountTicks.value;
		const durationTicks = drainTick + bonusCountTicks * 3 + 50;
		const result = runRulesScript(earnedBonusScript(drainTick), { durationTicks, initialState: midGame(1234), tuning: NO_BALL_SAVE_TUNING });
		const final = result.statesByTick.get(drainTick)!.players[1]!.score;

		const perTick = foldFrames(result, durationTicks, 1).map(({ score, bonus }) => ({ score, bonus }));
		expect(perTick, 'sanity: the per-tick fold shows the four count states').toHaveLength(4);
		for (const frameTicks of [17, MAX_OWED_TICKS]) {
			const batched = foldFrames(result, durationTicks, frameTicks);
			expect(batched.map(({ score, bonus }) => ({ score, bonus })), `${frameTicks}-tick frames`).toEqual(perTick);
			expect(batched[batched.length - 1]!.score, `${frameTicks}-tick frames end on the final score`).toBe(commas(final));
		}
	});

	it('AC 4 through the real rules: at bonusCountMs 0 the whole count shares the drain\'s own frame, and that ARMING frame already shows BONUS 0 and the final score', () => {
		const drainTick = 60;
		const durationTicks = drainTick + 40;
		const result = runRulesScript(earnedBonusScript(drainTick), { durationTicks, initialState: midGame(1234), tuning: tuningAtPace(0) });
		const steps = result.events.filter((e) => e.type === 'bonus_count_step');
		expect(steps.map((e) => e.tick), 'sanity: the clamp puts the three steps one tick apart, right after the drain').toEqual([drainTick + 1, drainTick + 2, drainTick + 3]);
		const final = result.statesByTick.get(drainTick)!.players[1]!.score;

		// Frames of 17 from tick 1: ticks 52..68 form one frame, holding the
		// drain (60) and all three steps (61..63) -- the arming branch's fold.
		const shown = foldFrames(result, durationTicks, 17);
		expect(shown[0]!.tick, 'sanity: the arming frame holds the drain and every step').toBe(68);
		expect(shown.map(({ score, bonus }) => ({ score, bonus })), 'one screen state only: the arming frame is already at the end of the count').toEqual([{ score: commas(final), bonus: 'BONUS 0' }]);
	});

	it('AC 6 through the real rules: a frame carrying ONLY the three steps (the drain ended the previous frame) shows the LAST one -- BONUS 0 and the final score; the one-tick-per-frame fold is the control', () => {
		const drainTick = 51; // frames of 17 from tick 1: 35..51, then 52..68
		const durationTicks = drainTick + 40;
		const result = runRulesScript(earnedBonusScript(drainTick), { durationTicks, initialState: midGame(1234), tuning: tuningAtPace(0) });
		const pre = result.statesByTick.get(drainTick - 1)!.players[1]!.score;
		const final = result.statesByTick.get(drainTick)!.players[1]!.score;

		const batched = foldFrames(result, durationTicks, 17);
		expect(batched.map(({ tick, score, bonus }) => ({ tick, score, bonus }))).toEqual([
			{ tick: drainTick, score: commas(pre), bonus: 'BONUS 100,000' },
			{ tick: drainTick + 17, score: commas(final), bonus: 'BONUS 0' },
		]);

		const control = foldFrames(result, durationTicks, 1);
		expect(control.map(({ bonus }) => bonus), 'control: one tick per frame shows every step in turn').toEqual(['BONUS 100,000', 'BONUS 70,000', 'BONUS 50,000', 'BONUS 0']);
	});
});

// Story 3.0a AC 6 (Integration, Rule 1): base playfield scoring reaches the
// DMD. A real createRules() (inside runRulesScript) in Hot seat -- a pop, a
// sling, a 3-tick Spinner and the six DRAGON targets -- with every tick
// folded through advanceBackglass()/renderFrame() exactly as src/host/boot.ts
// does. On the `score` screen, rows[i] is player i's score cell.
describe('Story 3.0a AC 6 -- a real createRules() Hot-seat run, folded through advanceBackglass()/renderFrame(), shows each playfield award on the current player\'s score row', () => {
	it('the current player\'s row reads popScore, + slingScore, + 3 x spinnerScore (one per tick), + dragonBankAward; the other player\'s row stays 0', () => {
		const tuning = resolveTuning();
		const pop = tuning.popScore.value;
		const sling = tuning.slingScore.value;
		const spin = tuning.spinnerScore.value;
		const bank = tuning.dragonBankAward.value;
		const letters = Object.keys(TABLE.dropBankWiring) as (keyof typeof TABLE.dropBankWiring)[];

		const script = close('s_start').at(5).at(8)
			.open('s_shooter_lane').at(10)
			.close('s_pop_1').at(20)
			.close('s_sling_l').at(30)
			.close('s_spinner').at(40).open().at(41).close().at(42).open().at(43).close().at(44);
		letters.forEach((letter, i) => {
			script.close(TABLE.dropBankWiring[letter].switch).at(50 + i);
		});
		const durationTicks = 60;
		const result = runRulesScript(script.build(), { durationTicks, tuning });
		expect(result.finalState.players, 'sanity: Hot seat added a second player').toHaveLength(2);
		expect(result.finalState.currentPlayer, 'sanity: player 1 is up, so rows[0] is the current player row').toBe(0);

		const commas = (value: number): string => value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		const scoringTicks = [20, 30, 40, 42, 44, 55];
		const expected = [pop, pop + sling, pop + sling + spin, pop + sling + 2 * spin, pop + sling + 3 * spin, pop + sling + 3 * spin + bank];

		let view = INITIAL_BACKGLASS_VIEW;
		const shownAtScoringTicks: Array<{ tick: number; screen: string; row: string | undefined }> = [];
		const otherRowNonZero: number[] = [];
		let scoreScreenTicks = 0;
		for (let tick = 1; tick <= durationTicks; tick++) {
			const output: FrameOutput = {
				snapshot: buildSnapshot({ tick, game: result.statesByTick.get(tick)! }),
				events: result.events.filter((e) => e.tick === tick),
				contactEvents: [],
				commands: [],
			};
			view = advanceBackglass(view, output);
			const frame = renderFrame(view, output.snapshot);
			if (frame.screen === 'score' && output.snapshot.game.players.length === 2) {
				scoreScreenTicks += 1;
				if (frame.rows[1]?.text !== '0') {
					otherRowNonZero.push(tick);
				}
			}
			if (scoringTicks.includes(tick)) {
				shownAtScoringTicks.push({ tick, screen: frame.screen, row: frame.rows[0]?.text });
			}
		}

		expect(shownAtScoringTicks).toEqual(scoringTicks.map((tick, i) => ({ tick, screen: 'score', row: commas(expected[i]!) })));
		expect(scoreScreenTicks, 'sanity: the two-player score screen was up').toBeGreaterThan(0);
		expect(otherRowNonZero, 'the other player\'s row stays 0 throughout').toEqual([]);
	});
});

// Story 3.0a AC 7 (real runtime, Rule 3): a real createMachine() +
// createRules() pair driven in sim/loop's own step order (button edges from
// the input frame, machine.step() with the previous tick's commands, then
// rules.step() with the machine report; commands issued at N reach physics
// at N+1) -- the harness test/rules-tilt-integration.test.ts established, and
// for the same reason: FrameOutput carries no SwitchEvent, and the oracle
// below is built from the physics switch edges themselves. Start, let the
// served ball settle on the plunger, hold the plunger 345 ticks, release,
// and run to the first ball end or save. The oracle predicts the score from
// the physics edges alone, and the DMD score row must show it on every tick.
describe('Story 3.0a AC 7 -- a real machine + rules plunge: the DMD score row equals an oracle built from the physics switch edges', () => {
	it('popScore x pop edges + slingScore x sling edges + spinnerScore x Spinner edges, counted in-game and untilted, equals the current player\'s row on every score-screen tick', () => {
		const tuning = resolveTuning();
		const machine = createMachine(loadDoc(), tuning);
		const rules = createRules(tuning, { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0 });

		const popSwitches = new Set<SwitchName>(Object.values(TABLE.popWiring).map((w) => w.switch as SwitchName));
		const slingSwitches = new Set<SwitchName>(Object.values(TABLE.slingWiring).map((w) => w.switch as SwitchName));
		const spinnerSwitch = TABLE.spinnerWiring.s_spinner.switch as SwitchName;
		const targetSwitches = new Set<SwitchName>(Object.values(TABLE.dropBankWiring).map((w) => w.switch as SwitchName));
		const topLaneSwitches = new Set<SwitchName>(Object.values(TABLE.laneWiring).filter((w) => w.set === 'top').map((w) => w.switch as SwitchName));

		const HOLD_START = 1000;
		const HOLD_TICKS = 345;
		const RELEASE = HOLD_START + HOLD_TICKS;
		const MAX_TICK = RELEASE + 12000;
		const pending: InputTransition[] = [
			{ tick: 2, frame: { ...NO_FRAME, start: true } },
			{ tick: 3, frame: NO_FRAME },
			{ tick: HOLD_START, frame: { ...NO_FRAME, plunger: true } },
			{ tick: RELEASE, frame: NO_FRAME },
		];

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
		let currentFrame: InputFrame = NO_FRAME;
		let previousFrame: InputFrame = NO_FRAME;
		let queued: Array<CoilCommand | RecoverCommand> = [];

		let oracle = 0;
		let spinnerEdgesInGame = 0;
		let settledAtHold: boolean | undefined;
		let endTick = -1;
		let scoreScreenTicks = 0;
		let maxShown = 0;
		const sanityBreaks: string[] = [];
		const rowMismatches: Array<{ tick: number; row: string | undefined; oracle: string }> = [];
		const stateMismatches: Array<{ tick: number; score: number | undefined; oracle: number }> = [];
		const commas = (value: number): string => value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		let view = INITIAL_BACKGLASS_VIEW;

		for (let tick = 1; tick <= MAX_TICK; tick++) {
			if (tick === HOLD_START) {
				settledAtHold = state.phase === 'game' && state.machine.deviceSlots.bd_shooter[0] === true;
			}
			currentFrame = frameInForceAt(pending, tick, currentFrame);
			const edges = buttonSwitchEdges(previousFrame, currentFrame, tick);
			previousFrame = currentFrame;

			const commands = queued.map((c) => ({ ...c, tick }));
			queued = [];
			const machineResult = machine.step(tick, currentFrame, commands);
			const rulesResult = rules.step(state, [...edges, ...machineResult.switchEvents], tick, { recovered: machineResult.recovered, failures: machineResult.semanticEvents });
			state = rulesResult.state;
			queued.push(...rulesResult.coilCommands, ...rulesResult.recoverCommands);

			// The gate for this tick, read from this tick's resulting state.
			const gateOpen = state.phase === 'game' && !state.machine.tilt.tilted;
			for (const event of machineResult.switchEvents) {
				if (!event.closed) {
					continue;
				}
				if (targetSwitches.has(event.switch) || topLaneSwitches.has(event.switch)) {
					sanityBreaks.push(`${event.switch}@${tick}`);
				}
				if (!gateOpen) {
					continue;
				}
				if (popSwitches.has(event.switch)) {
					oracle += tuning.popScore.value;
				} else if (slingSwitches.has(event.switch)) {
					oracle += tuning.slingScore.value;
				} else if (event.switch === spinnerSwitch) {
					oracle += tuning.spinnerScore.value;
					spinnerEdgesInGame += 1;
				}
			}

			if (state.phase === 'game' && state.players[state.currentPlayer]?.score !== oracle) {
				stateMismatches.push({ tick, score: state.players[state.currentPlayer]?.score, oracle });
			}

			const output: FrameOutput = {
				snapshot: buildSnapshot({ tick, game: state }),
				events: [...machineResult.semanticEvents, ...rulesResult.events],
				contactEvents: [],
				commands: [],
			};
			view = advanceBackglass(view, output);
			const frame = renderFrame(view, output.snapshot);
			if (frame.screen === 'score') {
				scoreScreenTicks += 1;
				const row = frame.rows[state.currentPlayer]?.text;
				if (row !== commas(oracle)) {
					rowMismatches.push({ tick, row, oracle: commas(oracle) });
				}
				maxShown = Math.max(maxShown, oracle);
			}

			if (rulesResult.events.some((e) => e.type === 'ball_saved' || e.type === 'ball_ended')) {
				endTick = tick;
				break;
			}
		}

		expect(settledAtHold, 'sanity: the served ball rests in the shooter lane before the hold').toBe(true);
		expect(endTick, 'sanity: the run reached its first ball end or save').toBeGreaterThan(RELEASE);
		expect(spinnerEdgesInGame, 'sanity: at least one in-game Spinner edge, or the oracle comparison is vacuous').toBeGreaterThan(0);
		expect(sanityBreaks, 'sanity break: a DRAGON-target or Top-lane edge on this path (measured: none) -- the oracle does not model either').toEqual([]);
		expect(scoreScreenTicks, 'sanity: the score screen was up').toBeGreaterThan(0);
		expect(maxShown, 'sanity: the oracle was nonzero on a score-screen tick (rowMismatches ties the row to it)').toBeGreaterThan(0);
		expect(rowMismatches.slice(0, 5), 'the DMD row equals the oracle on every score-screen tick').toEqual([]);
		expect(stateMismatches.slice(0, 5), 'the sim score equals the oracle on every in-game tick').toEqual([]);
	}, 120000);
});
