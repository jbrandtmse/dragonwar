// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.0a QA (bmad-qa-generate-e2e-tests): real-runtime coverage the
// implement stage's pinning tests left constructed, weak or unobserved.
//
// - AC 4 on REAL physics: a real createMachine() + createRules() pair in
//   sim/loop's own step order, tilted by a GENUINE nudge burst (never a
//   seeded `machine.tilt`), whose ball then closes the Spinner while Tilted
//   -- the score stays 0 in the sim and on the DMD. The NEXT ball, plunged
//   the same way, pays the Spinner again on the DMD row.
// - AC 6 with the scoring player genuinely NOT the default: a Hot-seat game
//   played through player 1's real drain, so player 2 (index 1) is up by
//   the real rotation, never by a constructed fixture. Every tick is folded
//   through advanceBackglass()/renderFrame(), and the final frame is taken
//   to lit dots with rasterise() and READ BACK glyph by glyph against
//   FONT_5X7 -- the digits a player actually sees on the panel.
// - AC 3 across balls with a second COMPLETION: the six targets' reset
//   edges (what physics emits after the reset coil the completion pulsed)
//   re-arm the bank, the six fall again on ball 2, the award pays again, and
//   the letters stay DRAGON (six characters).
// - AC 5 through the REAL lifecycle: a one-player game played to
//   `game_over` by three genuine drains (never a constructed phase), then
//   pop, Spinner and DRAGON-target closures change nothing.
//
// `-integration.test.ts`-suffixed: it drives real physics and imports the
// presentation rasteriser, so test/rules-devices-headless.test.ts's
// ENTRY_FILES ratchet excludes it by name, as it does every other
// `rules-*-integration.test.ts`.
//
// Every expected score is built from `resolveTuning()` symbols; the DMD text
// is formatted by a test-local comma formatter and read back from dots by a
// test-local glyph matcher, never by the code under test.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buttonSwitchEdges, frameInForceAt, NO_FRAME } from '../src/sim/loop';
import { createMachine } from '../src/sim/physics/machine';
import { createRules } from '../src/sim/rules';
import { advanceBackglass, renderFrame, INITIAL_BACKGLASS_VIEW, type DmdFrame } from '../src/presentation/backglass/frame';
import { rasterise, type DmdRaster } from '../src/presentation/backglass/raster';
import { FONT_5X7, GLYPH_ADVANCE, GLYPH_H, GLYPH_W } from '../src/presentation/backglass/font';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { close, runRulesScript, type SwitchScript } from './util/switch-script';
import { buildSnapshot } from './util/snapshot-factory';
import type { CoilCommand, FrameOutput, GameState, RecoverCommand, SwitchName } from '../src/sim/table/names';
import type { InputFrame, InputTransition } from '../src/sim/contracts/input';

const TUNING = resolveTuning();
const POP = TUNING.popScore.value;
const SLING = TUNING.slingScore.value;
const SPIN = TUNING.spinnerScore.value;
const BANK = TUNING.dragonBankAward.value;

const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

type Letter = keyof typeof TABLE.dropBankWiring;
const LETTERS = Object.keys(TABLE.dropBankWiring) as Letter[];
const TARGET: Record<Letter, SwitchName> = Object.fromEntries(LETTERS.map((l) => [l, TABLE.dropBankWiring[l].switch])) as Record<Letter, SwitchName>;
const POP_SWITCHES = new Set<SwitchName>(Object.values(TABLE.popWiring).map((w) => w.switch as SwitchName));
const SLING_SWITCHES = new Set<SwitchName>(Object.values(TABLE.slingWiring).map((w) => w.switch as SwitchName));
const SPINNER_SWITCH = TABLE.spinnerWiring.s_spinner.switch as SwitchName;

/** Test-local thousands separator -- independent of `formatScore()`, the code that renders the row. */
function commas(value: number): string {
	return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The six DRAGON targets closing one per tick from `fromTick`, appended to `script`. */
function sixTargets(script: SwitchScript, fromTick: number): SwitchScript {
	LETTERS.forEach((letter, i) => {
		script.close(TARGET[letter]).at(fromTick + i);
	});
	return script;
}

/**
 * Reads one DMD text row back from the lit dots: each `GLYPH_ADVANCE`-wide
 * cell from `(col, row)` is matched against every `FONT_5X7` glyph. A row
 * `rasterise()` drew in inverse video (the current player's emphasis) is
 * detected by its lit left gutter dot (`col - 1`, never lit by a glyph) and
 * un-inverted before matching. Stops at the first cell no glyph matches
 * (past the end of an inverse box every cell reads all-lit); trailing
 * blanks are trimmed.
 */
function readRow(raster: DmdRaster, col: number, row: number): { text: string; inverse: boolean } {
	const dot = (r: number, c: number): number => raster.dots[r * raster.cols + c] ?? 0;
	const inverse = col > 0 && dot(row, col - 1) === 1;
	let text = '';
	for (let origin = col; origin + GLYPH_W <= raster.cols; origin += GLYPH_ADVANCE) {
		const bits: number[] = [];
		for (let gy = 0; gy < GLYPH_H; gy++) {
			let mask = 0;
			for (let gx = 0; gx < GLYPH_W; gx++) {
				mask = (mask << 1) | (dot(row + gy, origin + gx) ^ (inverse ? 1 : 0));
			}
			bits.push(mask);
		}
		const match = Object.entries(FONT_5X7).find(([, glyph]) => glyph.every((m, i) => m === bits[i]));
		if (!match) {
			break;
		}
		text += match[0];
	}
	return { text: text.trimEnd(), inverse };
}

/** Folds one tick's state and events through the Backglass exactly as `src/host/boot.ts` does, one tick per frame. */
function fold(view: typeof INITIAL_BACKGLASS_VIEW, tick: number, game: GameState, events: FrameOutput['events']): { view: typeof INITIAL_BACKGLASS_VIEW; frame: DmdFrame } {
	const output: FrameOutput = { snapshot: buildSnapshot({ tick, game }), events, contactEvents: [], commands: [] };
	const next = advanceBackglass(view, output);
	return { view: next, frame: renderFrame(next, output.snapshot) };
}

// ---------------------------------------------------------------------------
// The glyph reader itself (so a green below is not a reader that reads
// anything as anything).
// ---------------------------------------------------------------------------

describe('QA harness -- readRow() reads rasterise()d text back, plain and inverse', () => {
	it('reads a plain and an emphasised row exactly, and tells them apart', () => {
		const frame: DmdFrame = {
			screen: 'score',
			rows: [
				{ text: '1,000', col: 2, row: 0, emphasis: false },
				{ text: '53,250', col: 2, row: 8, emphasis: true },
			],
		};
		const raster = rasterise(frame, FONT_5X7);
		expect(readRow(raster, 2, 0)).toEqual({ text: '1,000', inverse: false });
		expect(readRow(raster, 2, 8)).toEqual({ text: '53,250', inverse: true });
		expect(readRow(rasterise({ ...frame, rows: [{ ...frame.rows[1]!, text: '53,000' }] }, FONT_5X7), 2, 8).text, 'control: a different number reads differently').toBe('53,000');
	});
});

// ---------------------------------------------------------------------------
// AC 6 -- Hot seat with player 2 genuinely up.
// ---------------------------------------------------------------------------

describe('Story 3.0a QA, AC 6 -- Hot seat after a REAL rotation: player 2 scores on its own row of the rasterised DMD, player 1\'s row keeps its own score', () => {
	it('player 1 pops and drains; player 2 (up by the real rotation) pops, slings, spins 3 and completes the bank; each lands on rows[1] and the lit dots read the same totals', () => {
		// Ball 1 (player 1): launch, one pop, drain. The end-of-ball hold
		// (3000 ticks) then gives way to the score screen; ball 2 (player 2)
		// launches after it, so every one of player 2's awards lands on a
		// tick the score screen is up.
		const P2 = 3200;
		const script = close('s_start').at(5).at(8)
			.open('s_shooter_lane').at(10)
			.close('s_pop_1').at(20)
			.close('s_trough_1').at(30)
			.open('s_shooter_lane').at(P2)
			.close('s_pop_2').at(P2 + 10)
			.close('s_sling_r').at(P2 + 20)
			.close(SPINNER_SWITCH).at(P2 + 30).open().at(P2 + 31).close().at(P2 + 32).open().at(P2 + 33).close().at(P2 + 34);
		sixTargets(script, P2 + 40);
		const durationTicks = P2 + 50;
		const result = runRulesScript(script.build(), { durationTicks, tuning: NO_BALL_SAVE_TUNING });

		const ended = result.events.find((e) => e.type === 'ball_ended');
		expect(ended && ended.type === 'ball_ended' ? ended.player : undefined, 'sanity: player 1\'s ball genuinely ended').toBe(0);
		expect(result.finalState.players, 'sanity: Hot seat added a second player').toHaveLength(2);
		expect(result.finalState.currentPlayer, 'sanity: player 2 is up by the real rotation, so the default index 0 is NOT the scorer').toBe(1);
		expect(result.finalState.modes.find((m) => m.mode === 'base')?.player, 'sanity: the base mode was started for player 2').toBe(1);

		const scoringTicks = [P2 + 10, P2 + 20, P2 + 30, P2 + 32, P2 + 34, P2 + 45];
		const expected = [POP, POP + SLING, POP + SLING + SPIN, POP + SLING + 2 * SPIN, POP + SLING + 3 * SPIN, POP + SLING + 3 * SPIN + BANK];

		let view = INITIAL_BACKGLASS_VIEW;
		let lastFrame: DmdFrame | undefined;
		const shown: Array<{ tick: number; screen: string; p1: string | undefined; p2: string | undefined; p2Emphasis: boolean | undefined }> = [];
		for (let tick = 1; tick <= durationTicks; tick++) {
			const folded = fold(view, tick, result.statesByTick.get(tick)!, result.events.filter((e) => e.tick === tick));
			view = folded.view;
			lastFrame = folded.frame;
			if (scoringTicks.includes(tick)) {
				shown.push({ tick, screen: folded.frame.screen, p1: folded.frame.rows[0]?.text, p2: folded.frame.rows[1]?.text, p2Emphasis: folded.frame.rows[1]?.emphasis });
			}
		}

		expect(shown).toEqual(scoringTicks.map((tick, i) => ({ tick, screen: 'score', p1: commas(POP), p2: commas(expected[i]!), p2Emphasis: true })));

		// What a player sees: the final frame's lit dots, read back glyph by glyph.
		const raster = rasterise(lastFrame!, FONT_5X7);
		const p1Row = lastFrame!.rows[0]!;
		const p2Row = lastFrame!.rows[1]!;
		expect(readRow(raster, p2Row.col, p2Row.row), 'player 2\'s row on the panel: the full total, in inverse video (the current player)').toEqual({ text: commas(POP + SLING + 3 * SPIN + BANK), inverse: true });
		expect(readRow(raster, p1Row.col, p1Row.row), 'player 1\'s row on the panel: its own pop only, not inverse').toEqual({ text: commas(POP), inverse: false });

		const [p1, p2] = result.finalState.players;
		expect(p1!.score, 'player 1 keeps exactly its own pop (no letters or Loops, so a zero bonus)').toBe(POP);
		expect(p2!.score).toBe(POP + SLING + 3 * SPIN + BANK);
		expect(p2!.letters, 'player 2 spelled DRAGON').toBe('DRAGON');
		expect(p1!.letters, 'player 1\'s letters are untouched by player 2\'s targets').toBe('');
	});
});

// ---------------------------------------------------------------------------
// AC 3 -- a second COMPLETION on a later ball.
// ---------------------------------------------------------------------------

describe('Story 3.0a QA, AC 3 -- the bank re-armed by its reset edges completes again on ball 2: a second award, letters still DRAGON', () => {
	it('ball 1 spells DRAGON (+dragonBankAward); drain; ball 2 knocks all six down again -> +dragonBankAward again, letters DRAGON (6 chars), ball-2 bonus letters 6', () => {
		// A switch script has no physics, so the six targets' reset edges
		// (`closed: false`, what physics emits once the coil pulsed on the
		// completion tick has raised them) are scripted at tick 23; they are
		// what clears drop-bank.ts's completion latch. The coil pulses
		// themselves come from the real rules and are pinned exactly below.
		const script = close('s_start').at(5).open('s_shooter_lane').at(7);
		sixTargets(script, 8);
		script.close('s_trough_1').at(20).open('s_shooter_lane').at(25);
		for (const letter of LETTERS) {
			script.open(TARGET[letter]).at(23);
		}
		sixTargets(script, 30);
		const result = runRulesScript(script.build(), { durationTicks: 40, tuning: NO_BALL_SAVE_TUNING });

		const ball1 = result.statesByTick.get(19)!.players[0]!;
		expect(ball1.letters).toBe('DRAGON');
		expect(ball1.score, 'ball 1: the first completion paid once').toBe(BANK);
		const beforeBall2Bank = result.statesByTick.get(34)!.players[0]!;
		expect(beforeBall2Bank.ballNumber, 'sanity: ball 2 is in play').toBe(2);

		const after = result.finalState.players[0]!;
		expect(after.score - beforeBall2Bank.score, 'ball 2: the second completion pays dragonBankAward again, exactly once').toBe(BANK);
		expect(after.letters, 'letters never duplicate across balls and completions').toBe('DRAGON');
		expect(after.bonus.byCategory.letters, 'the bonus letters category counts every target this ball').toBe(6);
		const resets = result.coilCommands.filter((c) => c.coil === TABLE.dropBankResetCoil && c.action === 'pulse').map((c) => c.tick);
		const ballStarts = result.events.filter((e) => e.type === 'ball_will_start').map((e) => e.tick);
		expect(ballStarts, 'sanity: two balls started').toHaveLength(2);
		expect(resets, 'the reset coil pulsed exactly once per ball start and once per completion tick (13, 35), never per target').toEqual([...ballStarts, 13, 35].sort((a, b) => a - b));
	});
});

// ---------------------------------------------------------------------------
// AC 5 -- after a REAL game_over.
// ---------------------------------------------------------------------------

describe('Story 3.0a QA, AC 5 -- a game played to game_over by three real drains: later pop, Spinner and DRAGON-target closures change nothing', () => {
	function gameScript(extra: (script: SwitchScript) => void): SwitchScript {
		// Three balls, each launched, each popping once, each drained.
		const script = close('s_start').at(5)
			.open('s_shooter_lane').at(7)
			.close('s_pop_1').at(8).open('s_pop_1').at(9)
			.close('s_trough_1').at(12).open('s_trough_1').at(4000)
			.open('s_shooter_lane').at(4005)
			.close('s_pop_1').at(4006).open('s_pop_1').at(4007)
			.close('s_trough_1').at(4010).open('s_trough_1').at(8000)
			.open('s_shooter_lane').at(8005)
			.close('s_pop_1').at(8006).open('s_pop_1').at(8007)
			.close('s_trough_1').at(8010);
		extra(script);
		return script;
	}

	// A baseline run (no late closures) finds where the real game_over hands
	// over to Attract, so each phase gets its own closures well inside it.
	// Run in beforeAll, never at collection, so a filtered run skips it and a
	// throw is reported against this describe rather than the whole file.
	let baseline: ReturnType<typeof runRulesScript>;
	let GAME_OVER_AT = -1;
	let ATTRACT_AT = -1;
	beforeAll(() => {
		baseline = runRulesScript(gameScript(() => undefined).build(), { durationTicks: 40000, tuning: NO_BALL_SAVE_TUNING });
		const firstTick = (phase: GameState['phase'], after: number): number => [...baseline.statesByTick].find(([tick, s]) => tick > after && s.phase === phase)?.[0] ?? -1;
		GAME_OVER_AT = firstTick('game_over', 0);
		ATTRACT_AT = firstTick('attract', GAME_OVER_AT);
	});

	it('sanity: the baseline game genuinely reaches game_over, then Attract, with its player and score still present', () => {
		expect(GAME_OVER_AT, 'game_over reached after the third drain').toBeGreaterThan(8010 - 1);
		expect(ATTRACT_AT, 'Attract follows game_over').toBeGreaterThan(GAME_OVER_AT);
		expect(baseline.finalState.phase).toBe('attract');
		expect(baseline.finalState.players.map((p) => p.score), 'Attract after a game keeps the player and the three pops').toEqual([3 * POP]);
	});

	for (const [phase, offset] of [['game_over', () => GAME_OVER_AT + 100], ['attract', () => ATTRACT_AT + 100]] as const) {
		it(`${phase} (reached by real play): a pop, the Spinner and a DRAGON target change no score, letter or bonus`, () => {
			const LATE = offset();
			const script = gameScript((s) => {
				s.close('s_pop_2').at(LATE).close(SPINNER_SWITCH).at(LATE + 1).close(TARGET.d).at(LATE + 2);
			});
			const result = runRulesScript(script.build(), { durationTicks: LATE + 3, tuning: NO_BALL_SAVE_TUNING });
			const before = result.statesByTick.get(LATE - 1)!;
			expect(before.phase, `sanity: the closures arrive in ${phase}`).toBe(phase);
			expect(result.finalState.phase, `sanity: still ${phase} after them`).toBe(phase);
			expect(before.players[0]!.score, 'sanity: the game scored three pops').toBe(3 * POP);
			const after = result.finalState.players[0]!;
			expect(after.score, 'score').toBe(before.players[0]!.score);
			expect(after.letters, 'letters').toBe(before.players[0]!.letters);
			expect(after.bonus, 'bonus').toEqual(before.players[0]!.bonus);
		});
	}

	it('control: the same three closures mid-ball (ball 3) pay the pop and the Spinner and add the letter', () => {
		const script = gameScript(() => undefined);
		// Insert them on ball 3, before its drain.
		script.close('s_pop_2').at(8007).close(SPINNER_SWITCH).at(8008).close(TARGET.d).at(8009);
		const result = runRulesScript(script.build(), { durationTicks: 8010, tuning: NO_BALL_SAVE_TUNING });
		const mid = result.statesByTick.get(8009)!;
		const p = mid.players[0]!;
		expect(mid.phase, 'sanity: ball 3 is still in play').toBe('game');
		expect(p.score).toBe(3 * POP + POP + SPIN);
		expect(p.letters).toBe('D');
		expect(p.bonus.byCategory.letters).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// AC 4 through the real lifecycle -- every earner after a real bob Tilt.
// ---------------------------------------------------------------------------

describe('Story 3.0a QA, AC 4 -- Start, launch, a real s_tilt_bob Tilt, then every earner: nothing pays; the same script with no bob pays each one', () => {
	const ADJUSTMENTS = { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 0, ballsPerGame: 3, matchProbability: 0 };
	const BOB = 9;
	const EARN = 12;
	const END = 40;

	/** The Top lane the real skill-shot draw lit for ball 1 (read, never assumed). */
	function litTopLane(): SwitchName {
		const launched = runRulesScript(close('s_start').at(5).open('s_shooter_lane').at(7).build(), { durationTicks: 8, adjustments: ADJUSTMENTS }).finalState;
		const lit = Object.entries(launched.players[0]!.lanes.lit).filter(([lane, on]) => on && TABLE.laneWiring[lane as keyof typeof TABLE.laneWiring].set === 'top');
		expect(lit, 'sanity: exactly one Top lane is lit for the skill shot').toHaveLength(1);
		expect(launched.modes.map((m) => m.mode), 'sanity: the skill shot is armed').toContain('skill_shot');
		return TABLE.laneWiring[lit[0]![0] as keyof typeof TABLE.laneWiring].switch as SwitchName;
	}

	function run(withBob: boolean) {
		const lit = litTopLane();
		const others = Object.values(TABLE.laneWiring).filter((w) => w.set === 'top' && w.switch !== lit).map((w) => w.switch as SwitchName);
		const script = close('s_start').at(5).open('s_shooter_lane').at(7);
		if (withBob) {
			script.close('s_tilt_bob').at(BOB);
		}
		// The skill shot's lit lane first (the first playfield closure), then the
		// other two Top lanes (the set completes: a multiplier rung), a pop, a
		// sling, one Spinner revolution, a Loop shot and the six targets.
		script.close(lit).at(EARN)
			.close(others[0]!).at(EARN + 1)
			.close(others[1]!).at(EARN + 2)
			.close('s_pop_3').at(EARN + 3)
			.close('s_sling_r').at(EARN + 4)
			.close(SPINNER_SWITCH).at(EARN + 5)
			.close('s_loop_l_in').at(EARN + 6)
			.close('s_loop_l_out').at(EARN + 7);
		sixTargets(script, EARN + 8);
		return runRulesScript(script.build(), { durationTicks: END, adjustments: ADJUSTMENTS });
	}

	it('Tilted by the real bob: score 0, no letters, bonus untouched, the skill shot leaves modes[] unpaid', () => {
		const result = run(true);
		expect(result.statesByTick.get(BOB)!.machine.tilt.tilted, 'sanity: the bob closure really tilted the ball').toBe(true);
		expect(result.statesByTick.get(EARN - 1)!.modes.map((m) => m.mode), 'sanity: the skill shot was still armed when its lit lane closed').toContain('skill_shot');
		const after = result.finalState;
		expect(after.phase, 'sanity: the ball is still in play').toBe('game');
		expect(after.players[0]!.score, 'score').toBe(0);
		expect(after.players[0]!.letters, 'letters').toBe('');
		expect(after.players[0]!.bonus, 'bonus categories and multiplier').toEqual({ byCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1 });
		expect(after.modes.map((m) => m.mode), 'the skill shot resolved and left, unpaid').toEqual(['base']);
		const resets = result.coilCommands.filter((c) => c.coil === TABLE.dropBankResetCoil && c.action === 'pulse' && c.tick === EARN + 13);
		expect(resets, 'the bank still completes and resets under Tilt -- only the award is withheld').toHaveLength(1);
	});

	it('control, no bob: every earner pays -- skill shot, pop, sling, Spinner, bank; DRAGON; letters 6, loops 1, multiplier 2', () => {
		const after = run(false).finalState;
		expect(after.machine.tilt.tilted).toBe(false);
		expect(after.players[0]!.score).toBe(TUNING.skillShotAward.value + POP + SLING + SPIN + BANK);
		expect(after.players[0]!.letters).toBe('DRAGON');
		expect(after.players[0]!.bonus).toEqual({ byCategory: { letters: 6, loops: 1, strikes: 0 }, multiplier: 2 });
		expect(after.modes.map((m) => m.mode)).toEqual(['base']);
	});
});

// ---------------------------------------------------------------------------
// AC 4 on real physics -- a genuine nudge Tilt, then the Spinner.
// ---------------------------------------------------------------------------

describe('Story 3.0a QA, AC 4 on real physics -- a genuine nudge Tilt silences the Spinner on the DMD; the next ball pays it again', () => {
	it('tilted by a real nudge burst, the ball closes the Spinner and the score stays 0 (sim and DMD); ball 2, plunged the same way, shows the oracle total on the DMD row', () => {
		const tuning = resolveTuning();
		const machine = createMachine(JSON.parse(readFileSync(COLLISION_PATH, 'utf8')), tuning);
		// tiltWarnings 0: the first bob crossing tilts.
		const rules = createRules(tuning, { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 0, ballsPerGame: 3, matchProbability: 0 });

		const HOLD_TICKS = 345;
		const HOLD_START = 1000;
		const RELEASE = HOLD_START + HOLD_TICKS;
		const NUDGE = RELEASE + 800;
		const pending: InputTransition[] = [
			{ tick: 2, frame: { ...NO_FRAME, start: true } },
			{ tick: 3, frame: NO_FRAME },
			{ tick: HOLD_START, frame: { ...NO_FRAME, plunger: true } },
			{ tick: RELEASE, frame: NO_FRAME },
			// test/rules-tilt-integration.test.ts's two-edge burst: crosses the
			// bob's threshold, stays under the slam count.
			{ tick: NUDGE, frame: { ...NO_FRAME, nudge_up: true } },
			{ tick: NUDGE + 1, frame: NO_FRAME },
			{ tick: NUDGE + 2, frame: { ...NO_FRAME, nudge_up: true } },
			{ tick: NUDGE + 3, frame: NO_FRAME },
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
		let view = INITIAL_BACKGLASS_VIEW;

		let tiltTick = -1;
		let ball1EndTick = -1;
		let ball1End: ReturnType<typeof rules.step>['events'][number] | undefined;
		let ball2Release = -1;
		let ball2EndTick = -1;
		let slam = false;
		let tiltedScoringEdges = 0;
		let ball2SpinnerEdges = 0;
		let oracle = 0;
		let maxBall1Score = 0;
		let ball2ScoreScreenTicks = 0;
		let maxShownBall2 = 0;
		const rowMismatches: Array<{ tick: number; row: string | undefined; oracle: string }> = [];

		const MAX_TICK = 40000;
		for (let tick = 1; tick <= MAX_TICK; tick++) {
			currentFrame = frameInForceAt(pending, tick, currentFrame);
			const edges = buttonSwitchEdges(previousFrame, currentFrame, tick);
			previousFrame = currentFrame;
			const commands = queued.map((c) => ({ ...c, tick }));
			queued = [];
			const machineResult = machine.step(tick, currentFrame, commands);
			const rulesResult = rules.step(state, [...edges, ...machineResult.switchEvents], tick, { recovered: machineResult.recovered, failures: machineResult.semanticEvents });
			state = rulesResult.state;
			queued.push(...rulesResult.coilCommands, ...rulesResult.recoverCommands);
			const events = [...machineResult.semanticEvents, ...rulesResult.events];
			slam ||= events.some((e) => e.type === 'slam_tilt');

			if (tiltTick < 0 && state.machine.tilt.tilted) {
				tiltTick = tick;
			}
			const gateOpen = state.phase === 'game' && !state.machine.tilt.tilted;
			for (const event of machineResult.switchEvents) {
				if (!event.closed) {
					continue;
				}
				const scoring = POP_SWITCHES.has(event.switch) || SLING_SWITCHES.has(event.switch) || event.switch === SPINNER_SWITCH;
				if (scoring && state.machine.tilt.tilted && ball1EndTick < 0) {
					tiltedScoringEdges += 1;
				}
				if (!gateOpen || !scoring) {
					continue;
				}
				oracle += POP_SWITCHES.has(event.switch) ? POP : SLING_SWITCHES.has(event.switch) ? SLING : SPIN;
				if (event.switch === SPINNER_SWITCH && ball1EndTick >= 0) {
					ball2SpinnerEdges += 1;
				}
			}
			if (ball1EndTick < 0) {
				maxBall1Score = Math.max(maxBall1Score, state.players[0]?.score ?? 0);
			}

			const folded = fold(view, tick, state, events);
			view = folded.view;
			if (folded.frame.screen === 'score' && state.players.length > 0) {
				const row = folded.frame.rows[state.currentPlayer]?.text;
				if (row !== commas(oracle)) {
					rowMismatches.push({ tick, row, oracle: commas(oracle) });
				}
				if (ball2Release > 0 && tick > ball2Release) {
					ball2ScoreScreenTicks += 1;
					maxShownBall2 = Math.max(maxShownBall2, Number((row ?? '0').replace(/,/g, '')));
				}
			}

			const endEvent = rulesResult.events.find((e) => e.type === 'ball_ended' || e.type === 'ball_saved');
			const ended = endEvent !== undefined;
			if (ended && ball1EndTick < 0) {
				ball1EndTick = tick;
				ball1End = endEvent;
			} else if (ended && ball2Release > 0) {
				ball2EndTick = tick;
				break;
			}
			// Ball 2: once the served ball rests in the shooter lane with the
			// base mode up, hold the plunger exactly as ball 1 did.
			if (ball1EndTick > 0 && ball2Release < 0 && state.phase === 'game' && state.machine.deviceSlots.bd_shooter[0] === true && state.modes.some((m) => m.mode === 'base')) {
				const hold = tick + 300;
				ball2Release = hold + HOLD_TICKS;
				pending.push({ tick: hold, frame: { ...NO_FRAME, plunger: true } }, { tick: ball2Release, frame: NO_FRAME });
			}
		}

		// Ball 1: genuinely tilted, and a scoring switch genuinely closed while Tilted.
		expect(slam, 'sanity: the two-edge burst stays under the slam count').toBe(false);
		expect(tiltTick, 'sanity: the nudge burst tilted the ball (no seeded machine.tilt)').toBeGreaterThan(NUDGE - 1);
		expect(ball1EndTick, 'sanity: the tilted ball ended').toBeGreaterThan(tiltTick);
		expect(ball1End && ball1End.type === 'ball_ended' ? { player: ball1End.player, tilted: ball1End.tilted } : ball1End?.type, 'sanity: ball 1 genuinely ENDED as a tilted ball (never saved), so ball 2 is the next ball').toEqual({ player: 0, tilted: true });
		expect(tiltedScoringEdges, 'sanity: a pop, sling or Spinner edge closed WHILE Tilted, or the negative is vacuous').toBeGreaterThan(0);
		expect(maxBall1Score, 'AC 4: nothing the Tilted ball touched scored').toBe(0);

		// Ball 2: the positive -- the same plunge pays the Spinner again, on the DMD.
		expect(ball2Release, 'sanity: ball 2 was served and plunged').toBeGreaterThan(ball1EndTick);
		expect(ball2EndTick, 'sanity: ball 2 reached its own end or save').toBeGreaterThan(ball2Release);
		expect(ball2SpinnerEdges, 'sanity: ball 2 closed the Spinner in-game and untilted').toBeGreaterThan(0);
		expect(ball2ScoreScreenTicks, 'sanity: the score screen was up during ball 2').toBeGreaterThan(0);
		expect(maxShownBall2, 'the next ball after the Tilt scores again, on the DMD row').toBe(oracle);
		expect(oracle, 'sanity: the oracle is nonzero, so the equality above is not 0 === 0').toBeGreaterThan(0);
		expect(rowMismatches.slice(0, 5), 'the DMD current-player row equals the gated oracle on every score-screen tick of both balls').toEqual([]);
	}, 120000);
});
