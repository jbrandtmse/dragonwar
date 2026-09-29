// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.0a: playfield scoring (DW-278), the scoring gate under Tilt and
// outside a game (DW-246), and de-duplicated DRAGON letters (DW-283).
// AC 1-5 and every I/O & Edge-Case Matrix row, driven headless through
// `runRulesScript()` (a real `createRules()`), plus direct unit tests of the
// three `src/sim/rules/scoring.ts` helpers and of the base mode's own
// `step()` for the `spinner_spin { count: 3 }` case.
//
// Every expected value is built from `resolveTuning()` symbols, never from
// a literal copy of the value under test. Every negative (Tilted, outside a
// game) is paired with its positive control: the same script, untilted and
// mid-ball, pays.
//
// Fixtures: a mid-game `initialState` is built directly (the
// `test/rules-modes.test.ts` precedent) where the row is about one tick's
// scoring; the rows that cross a ball boundary (across balls, next ball
// after a Tilt) drive the real Start -> launch -> drain -> next-ball path
// instead. Those use `NO_BALL_SAVE_TUNING`, so a scripted drain a few ticks
// after the plunge ends the ball rather than being saved.

import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { addDragonLetters, awardScore, scoringOpen } from '../src/sim/rules/scoring';
import { createBaseMode } from '../src/sim/rules/modes/base';
import { PLAYFIELD_SWITCHES, type DeviceEvent } from '../src/sim/rules/devices';
import { close, runRulesScript, type SwitchScript } from './util/switch-script';
import type { GameAdjustments } from '../src/sim/contracts/replay';
import type { GameState, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const POP = TUNING.popScore.value;
const SLING = TUNING.slingScore.value;
const SPIN = TUNING.spinnerScore.value;
const BANK = TUNING.dragonBankAward.value;
const SKILL = TUNING.skillShotAward.value;

const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

type Letter = keyof typeof TABLE.dropBankWiring;
const LETTERS = Object.keys(TABLE.dropBankWiring) as Letter[];
const TARGET: Record<Letter, SwitchName> = Object.fromEntries(LETTERS.map((l) => [l, TABLE.dropBankWiring[l].switch])) as Record<Letter, SwitchName>;
const POP_SWITCHES = Object.values(TABLE.popWiring).map((w) => w.switch as SwitchName);
const SLING_SWITCHES = Object.values(TABLE.slingWiring).map((w) => w.switch as SwitchName);
const SPINNER_SWITCH = TABLE.spinnerWiring.s_spinner.switch as SwitchName;

type Player = GameState['players'][number];

/** A fresh player (mirrors `ball-controller.ts`'s `emptyPlayer()`), overridable per scenario. */
function player(overrides: Partial<Player> = {}): Player {
	return {
		score: 0,
		letters: '',
		lockCredits: 0,
		tiltWarnings: 0,
		bonus: { byCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1 },
		lanes: { lit: {}, completedSets: [] },
		extraBalls: 0,
		jackpotSeed: 0,
		warsStarted: 0,
		modesPlayed: [],
		ballNumber: 1,
		...overrides,
	};
}

/** A mid-ball `GameState`: `ballsInPlay: 1`, hardware on, base mode active for player 0 unless `modes` says otherwise. */
function gameState(options: {
	readonly players?: readonly Player[];
	readonly modes?: GameState['modes'];
	readonly tilted?: boolean;
	readonly phase?: GameState['phase'];
	readonly currentPlayer?: number;
} = {}): GameState {
	const tilted = options.tilted ?? false;
	return {
		tick: 0,
		phase: options.phase ?? 'game',
		machine: {
			ballsInPlay: 1,
			hardwareEnabled: !tilted,
			ballSave: { untilTick: null, sources: [] },
			tilt: { tilted, slamTilted: false },
			multiball: null,
			highscores: [],
			deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] },
		},
		players: options.players ?? [player()],
		currentPlayer: options.currentPlayer ?? 0,
		modes: options.modes ?? [{ mode: 'base', priority: 100, player: 0 }],
		rng: 0,
	};
}

/** Base + a launched skill shot for player 0. */
function armedAfterLaunch(): GameState['modes'] {
	return [
		{ mode: 'base', priority: 100, player: 0 },
		{ mode: 'skill_shot', priority: 200, player: 0, launched: true },
	];
}

/** Appends a closure of each of `switches` to `script`, one per tick from `fromTick`. */
function pressEach(script: SwitchScript, switches: readonly SwitchName[], fromTick: number): SwitchScript {
	switches.forEach((sw, i) => {
		script.close(sw).at(fromTick + i);
	});
	return script;
}

/** The six DRAGON targets closing one per tick from `fromTick`, appended to `script` (or starting a fresh one). */
function sixTargets(fromTick: number, script?: SwitchScript): SwitchScript {
	let result = script;
	LETTERS.forEach((letter, i) => {
		result = result ? result.close(TARGET[letter]).at(fromTick + i) : close(TARGET[letter]).at(fromTick + i);
	});
	return result!;
}

/** Every DRAGON target's reset edge (`closed: false`) at `tick` -- what physics emits after `c_dragon_bank_reset`. */
function resetEdges(script: SwitchScript, tick: number): SwitchScript {
	for (const letter of LETTERS) {
		script.open(TARGET[letter]).at(tick);
	}
	return script;
}

function run(script: SwitchScript, durationTicks: number, initialState: GameState, extra: { tuning?: typeof TUNING; adjustments?: GameAdjustments } = {}) {
	return runRulesScript(script.build(), { durationTicks, initialState, ...extra });
}

// ---------------------------------------------------------------------------
// The three scoring.ts helpers, directly.
// ---------------------------------------------------------------------------

describe('scoring.ts -- scoringOpen()', () => {
	it('open in a game, untilted; closed when Tilted, in game_over and in Attract', () => {
		expect(scoringOpen(gameState())).toBe(true);
		expect(scoringOpen(gameState({ tilted: true }))).toBe(false);
		expect(scoringOpen(gameState({ phase: 'game_over' }))).toBe(false);
		expect(scoringOpen(gameState({ phase: 'attract' }))).toBe(false);
	});
});

describe('scoring.ts -- awardScore()', () => {
	it('adds points to the named player only', () => {
		const state = gameState({ players: [player({ score: 10 }), player({ score: 20 })] });
		const after = awardScore(state, 1, 300);
		expect(after.players.map((p) => p.score)).toEqual([10, 320]);
		expect(after.players[0], 'the other player object is untouched').toBe(state.players[0]);
	});

	it('returns the SAME reference when scoring is closed (Tilted, game_over, Attract), when points <= 0, or when the player does not exist', () => {
		for (const closed of [gameState({ tilted: true }), gameState({ phase: 'game_over' }), gameState({ phase: 'attract' })]) {
			expect(awardScore(closed, 0, 1000)).toBe(closed);
		}
		const open = gameState();
		expect(awardScore(open, 0, 0)).toBe(open);
		expect(awardScore(open, 0, -5)).toBe(open);
		expect(awardScore(open, 3, 1000)).toBe(open);
		expect(awardScore(open, 0, 1000), 'control: an open gate with a real player and points pays').not.toBe(open);
	});
});

describe('scoring.ts -- addDragonLetters()', () => {
	it('appends each letter not already present, in arrival order, upper-cased', () => {
		expect(addDragonLetters('', 'DR')).toBe('DR');
		expect(addDragonLetters('DR', 'DA')).toBe('DRA');
		expect(addDragonLetters('', 'dr')).toBe('DR');
		expect(addDragonLetters('', 'DDR')).toBe('DR');
		expect(addDragonLetters('DRAGON', 'DRAGON')).toBe('DRAGON');
		expect(addDragonLetters('GO', 'DRAGON')).toBe('GODRAN');
	});
});

// ---------------------------------------------------------------------------
// AC 1 (FR-31, DW-278) -- pops and slings.
// ---------------------------------------------------------------------------

describe('AC 1 -- pops and slings score for the base mode player, once per closure', () => {
	it('Matrix row "Pop / sling": s_pop_2 then s_sling_r -> +popScore, then +slingScore', () => {
		const result = run(close('s_pop_2').at(1).close('s_sling_r').at(2), 2, gameState());
		expect(result.statesByTick.get(1)!.players[0]!.score).toBe(POP);
		expect(result.statesByTick.get(2)!.players[0]!.score).toBe(POP + SLING);
	});

	it('every TABLE.popWiring switch pays popScore and every TABLE.slingWiring switch pays slingScore', () => {
		for (const sw of POP_SWITCHES) {
			expect(run(close(sw).at(1), 1, gameState()).finalState.players[0]!.score, `${sw}`).toBe(POP);
		}
		for (const sw of SLING_SWITCHES) {
			expect(run(close(sw).at(1), 1, gameState()).finalState.players[0]!.score, `${sw}`).toBe(SLING);
		}
		expect(POP_SWITCHES.length, 'sanity: the pop set is non-empty').toBeGreaterThan(0);
		expect(SLING_SWITCHES.length, 'sanity: the sling set is non-empty').toBeGreaterThan(0);
	});

	it('once per closure: three separate closures of one pop pay 3 x popScore', () => {
		const script = close('s_pop_1').at(1).open().at(2).close().at(3).open().at(4).close().at(5);
		expect(run(script, 5, gameState()).finalState.players[0]!.score).toBe(3 * POP);
	});

	it('several awards on ONE tick all land: a pop and a sling closing together pay both; a base-mode step fed a pop, a sling, spinner_spin { count: 2 } and bank_completed pays their sum', () => {
		expect(run(close('s_pop_1').at(1).close('s_sling_l').at(1), 1, gameState()).finalState.players[0]!.score).toBe(POP + SLING);
		const events: DeviceEvent[] = [
			{ type: 'playfield_switch_closed', switch: POP_SWITCHES[0]!, tick: 1 },
			{ type: 'playfield_switch_closed', switch: SLING_SWITCHES[0]!, tick: 1 },
			{ type: 'spinner_spin', count: 2, tick: 1 },
			{ type: 'bank_completed', tick: 1 },
		];
		expect(createBaseMode(TUNING).step(gameState(), events, 1).state.players[0]!.score).toBe(POP + SLING + 2 * SPIN + BANK);
	});

	it('a playfield switch outside both sets (a Loop switch) pays nothing', () => {
		expect(run(close('s_loop_l_in').at(1), 1, gameState()).finalState.players[0]!.score).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// AC 2 (FR-26) -- the Spinner.
// ---------------------------------------------------------------------------

describe('AC 2 -- spinner_spin { count } pays count x spinnerScore; the Spinner switch adds nothing further', () => {
	it('sanity: s_spinner IS a playfield switch, so its playfield_switch_closed genuinely reaches the base mode', () => {
		expect(PLAYFIELD_SWITCHES.has(SPINNER_SWITCH)).toBe(true);
	});

	it('Matrix row "Spinner": count 1 on each of 3 ticks -> exactly 3 x spinnerScore', () => {
		const script = close(SPINNER_SWITCH).at(1).open().at(2).close().at(3).open().at(4).close().at(5);
		const result = run(script, 5, gameState());
		expect(result.statesByTick.get(1)!.players[0]!.score, 'one revolution pays exactly spinnerScore -- nothing extra for its playfield_switch_closed').toBe(SPIN);
		expect(result.finalState.players[0]!.score).toBe(3 * SPIN);
	});

	it('Matrix row "Spinner": a base-mode step fed { count: 3 } pays 3 x spinnerScore', () => {
		const base = createBaseMode(TUNING);
		const events: DeviceEvent[] = [{ type: 'spinner_spin', count: 3, tick: 1 }];
		expect(base.step(gameState(), events, 1).state.players[0]!.score).toBe(3 * SPIN);
	});

	it('a base-mode step fed only the Spinner switch\'s playfield_switch_closed pays nothing (same state reference)', () => {
		const base = createBaseMode(TUNING);
		const state = gameState();
		const events: DeviceEvent[] = [{ type: 'playfield_switch_closed', switch: SPINNER_SWITCH, tick: 1 }];
		expect(base.step(state, events, 1).state).toBe(state);
	});
});

// ---------------------------------------------------------------------------
// AC 3 (FR-28, DW-283) -- the DRAGON bank.
// ---------------------------------------------------------------------------

describe('AC 3 -- a completed bank pays dragonBankAward once, pulses its reset, and letters never duplicate', () => {
	it('Matrix row "Bank completed": letters DRAGON, bonus letters 6, exactly one +dragonBankAward on the sixth tick, c_dragon_bank_reset pulsed that tick', () => {
		const result = run(sixTargets(1), 6, gameState());
		for (let tick = 1; tick <= 5; tick++) {
			expect(result.statesByTick.get(tick)!.players[0]!.score, `no award before the sixth target (tick ${tick})`).toBe(0);
		}
		const after = result.finalState.players[0]!;
		expect(after.score).toBe(BANK);
		expect(after.letters).toBe('DRAGON');
		expect(after.bonus.byCategory.letters).toBe(6);
		const resets = result.coilCommands.filter((c) => c.coil === TABLE.dropBankResetCoil && c.action === 'pulse');
		expect(resets.map((c) => c.tick)).toEqual([6]);
	});

	it('Matrix row "Re-completion" (DW-283): after the reset edges, all six down again -> a second +dragonBankAward, letters still DRAGON (6 chars)', () => {
		const script = resetEdges(sixTargets(1), 8);
		sixTargets(10, script);
		const result = run(script, 15, gameState());
		expect(result.statesByTick.get(14)!.players[0]!.score, 'no second award before the second completion').toBe(BANK);
		const after = result.finalState.players[0]!;
		expect(after.score).toBe(2 * BANK);
		expect(after.letters).toBe('DRAGON');
		expect(after.letters).toHaveLength(6);
		expect(after.bonus.byCategory.letters, 'the bonus letters category still counts every bank_target_down (Story 2.10)').toBe(12);
	});

	it('Matrix row "Across balls" (DW-283): ball 1 D, R; drain; ball 2 D, A -> letters DR then DRA, ball-2 bonus letters 2', () => {
		const script = close('s_start').at(5)
			.open('s_shooter_lane').at(7)
			.close(TARGET.d).at(8)
			.close(TARGET.r).at(9)
			.close('s_trough_1').at(20)
			.open(TARGET.d).at(23)
			.open(TARGET.r).at(23)
			.open('s_shooter_lane').at(25)
			.close(TARGET.d).at(27)
			.close(TARGET.a).at(28);
		const result = runRulesScript(script.build(), { durationTicks: 30, tuning: NO_BALL_SAVE_TUNING });
		expect(result.statesByTick.get(19)!.players[0]!.letters).toBe('DR');
		const after = result.finalState.players[0]!;
		expect(after.ballNumber, 'sanity: ball 2 is in play').toBe(2);
		expect(after.letters).toBe('DRA');
		expect(after.bonus.byCategory.letters).toBe(2);
	});

	it('a completed bank keeps its letters into the next ball (FR-28, FR-40): DRAGON on ball 1, then D on ball 2 -> still DRAGON, and the completion paid once', () => {
		const script = close('s_start').at(5).open('s_shooter_lane').at(7);
		sixTargets(8, script);
		resetEdges(script, 15);
		script.close('s_trough_1').at(20)
			.open('s_shooter_lane').at(25)
			.close(TARGET.d).at(27);
		const result = runRulesScript(script.build(), { durationTicks: 30, tuning: NO_BALL_SAVE_TUNING });
		expect(result.statesByTick.get(13)!.players[0]!.letters, 'DRAGON is spelled on the completion tick').toBe('DRAGON');
		expect(result.statesByTick.get(13)!.players[0]!.score).toBe(BANK);
		const after = result.finalState.players[0]!;
		expect(after.ballNumber, 'sanity: ball 2 is in play').toBe(2);
		expect(after.letters).toBe('DRAGON');
		expect(result.statesByTick.get(19)!.players[0]!.score, 'the completion paid once: nothing more before the drain').toBe(BANK);
		expect(after.score, 'the completion paid once: ball 2\'s D pays no second award').toBe(result.statesByTick.get(26)!.players[0]!.score);
		expect(after.bonus.byCategory.letters).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// AC 4 (DW-246, FR-15 as decided) -- nothing scores under Tilt.
// ---------------------------------------------------------------------------

describe('AC 4 -- while Tilted nothing scores; the untilted control pays each earner', () => {
	interface Earner {
		readonly name: string;
		readonly modes?: GameState['modes'];
		readonly lit?: Record<string, boolean>;
		readonly script: () => SwitchScript;
		readonly ticks: number;
		readonly read: (state: GameState) => unknown;
		readonly paid: unknown;
		readonly unpaid: unknown;
	}

	const EARNERS: readonly Earner[] = [
		{ name: 'pop', script: () => close('s_pop_1').at(1), ticks: 1, read: (s) => s.players[0]!.score, paid: POP, unpaid: 0 },
		{ name: 'sling', script: () => close('s_sling_l').at(1), ticks: 1, read: (s) => s.players[0]!.score, paid: SLING, unpaid: 0 },
		{ name: 'spinner', script: () => close(SPINNER_SWITCH).at(1), ticks: 1, read: (s) => s.players[0]!.score, paid: SPIN, unpaid: 0 },
		{ name: 'bank completion', script: () => sixTargets(1), ticks: 6, read: (s) => s.players[0]!.score, paid: BANK, unpaid: 0 },
		{ name: 'target letter', script: () => close(TARGET.d).at(1), ticks: 1, read: (s) => s.players[0]!.letters, paid: 'D', unpaid: '' },
		{
			name: 'bonus category (a letter and a Loop)',
			script: () => close(TARGET.d).at(1).close('s_loop_l_in').at(2).close('s_loop_l_out').at(3),
			ticks: 3,
			read: (s) => s.players[0]!.bonus.byCategory,
			paid: { letters: 1, loops: 1, strikes: 0 },
			unpaid: { letters: 0, loops: 0, strikes: 0 },
		},
		{
			name: 'multiplier rung (the Top lanes completed)',
			script: () => pressEach(close('s_top_1').at(1), ['s_top_2', 's_top_3'], 2),
			ticks: 3,
			read: (s) => s.players[0]!.bonus.multiplier,
			paid: 2,
			unpaid: 1,
		},
		{
			name: 'skill shot (award, letter, and the mode closes either way)',
			modes: armedAfterLaunch(),
			lit: { top_1: true },
			script: () => close('s_top_1').at(1),
			ticks: 1,
			read: (s) => ({ score: s.players[0]!.score, letters: s.players[0]!.letters, modes: s.modes.map((m) => m.mode) }),
			paid: { score: SKILL, letters: 'D', modes: ['base'] },
			unpaid: { score: 0, letters: '', modes: ['base'] },
		},
	];

	for (const earner of EARNERS) {
		const fixture = (tilted: boolean) => gameState({ tilted, players: [player({ lanes: { lit: earner.lit ?? {}, completedSets: [] } })], ...(earner.modes ? { modes: earner.modes } : {}) });

		it(`${earner.name}: Tilted -> unchanged`, () => {
			expect(earner.read(run(earner.script(), earner.ticks, fixture(true)).finalState)).toEqual(earner.unpaid);
		});

		it(`${earner.name}: control, untilted -> paid`, () => {
			expect(earner.read(run(earner.script(), earner.ticks, fixture(false)).finalState)).toEqual(earner.paid);
		});
	}

	/** Matrix row "Tilted": the whole I/O row as one script -- the lit Top lane with the skill shot launched, the Top lanes completed, pop, sling, spinner, six targets and a Loop shot. */
	function tiltedRowScript(): SwitchScript {
		const script = pressEach(close('s_top_1').at(1), ['s_top_2', 's_top_3'], 2)
			.close('s_pop_1').at(5)
			.close('s_sling_l').at(6)
			.close(SPINNER_SWITCH).at(7);
		sixTargets(8, script);
		return script.close('s_loop_l_in').at(15).close('s_loop_l_out').at(16);
	}

	function tiltedRowFixture(tilted: boolean): GameState {
		return gameState({ tilted, players: [player({ lanes: { lit: { top_1: true }, completedSets: [] } })], modes: armedAfterLaunch() });
	}

	it('Matrix row "Tilted": score, letters, bonus.byCategory and bonus.multiplier all unchanged; the skill shot leaves modes[] with no award', () => {
		const after = run(tiltedRowScript(), 16, tiltedRowFixture(true)).finalState;
		const p = after.players[0]!;
		expect(p.score).toBe(0);
		expect(p.letters).toBe('');
		expect(p.bonus).toEqual({ byCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1 });
		expect(after.modes.map((m) => m.mode)).toEqual(['base']);
	});

	it('Matrix row "Tilted", control: the same script untilted pays each one', () => {
		const after = run(tiltedRowScript(), 16, tiltedRowFixture(false)).finalState;
		const p = after.players[0]!;
		expect(p.score).toBe(SKILL + POP + SLING + SPIN + BANK);
		expect(p.letters).toBe('DRAGON');
		expect(p.bonus).toEqual({ byCategory: { letters: 6, loops: 1, strikes: 0 }, multiplier: 2 });
		expect(after.modes.map((m) => m.mode)).toEqual(['base']);
	});

	it('Matrix row "Same-tick Tilt": the tilting bob closure and a pop on one tick -> no pop score (the tilt controller runs first)', () => {
		// Default adjustments: tiltWarnings 1, so a player already holding one
		// warning tilts on the next (first, so spaced) bob closure.
		const script = close('s_pop_2').at(1).close('s_tilt_bob').at(1);
		const after = run(script, 1, gameState({ players: [player({ tiltWarnings: 1 })] })).finalState;
		expect(after.machine.tilt.tilted, 'sanity: the bob closure tilted the ball').toBe(true);
		expect(after.players[0]!.score).toBe(0);
	});

	it('Matrix row "Same-tick Tilt", control: a bob closure that only WARNS leaves the same-tick pop paid', () => {
		const script = close('s_pop_2').at(1).close('s_tilt_bob').at(1);
		const after = run(script, 1, gameState({ players: [player({ tiltWarnings: 0 })] })).finalState;
		expect(after.machine.tilt.tilted, 'sanity: a warning, not a tilt').toBe(false);
		expect(after.players[0]!.tiltWarnings).toBe(1);
		expect(after.players[0]!.score).toBe(POP);
	});

	it('Matrix row "Next ball after Tilt": the tilted ball\'s pop pays nothing; it drains; on the next ball a pop pays popScore', () => {
		// tiltWarnings 0: the first bob closure tilts.
		const adjustments: GameAdjustments = { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 0, ballsPerGame: 3, matchProbability: 0 };
		const script = close('s_start').at(5)
			.open('s_shooter_lane').at(7)
			.close('s_tilt_bob').at(9)
			.close('s_pop_1').at(10)
			.close('s_trough_1').at(20)
			.open('s_shooter_lane').at(25)
			.close('s_pop_1').at(27);
		const result = runRulesScript(script.build(), { durationTicks: 28, tuning: NO_BALL_SAVE_TUNING, adjustments });
		expect(result.statesByTick.get(9)!.machine.tilt.tilted, 'sanity: tilted by the bob').toBe(true);
		expect(result.statesByTick.get(10)!.players[0]!.score, 'the tilted ball\'s pop pays nothing').toBe(0);
		const ended = result.events.find((e) => e.type === 'ball_ended');
		expect(ended && ended.type === 'ball_ended' ? ended.tilted : undefined, 'sanity: the tilted ball ended').toBe(true);
		const after = result.finalState;
		expect(after.machine.tilt.tilted, 'the tilt reset at ball_will_start').toBe(false);
		expect(after.players[0]!.ballNumber, 'sanity: ball 2').toBe(2);
		expect(after.players[0]!.score).toBe(POP);
	});
});

// ---------------------------------------------------------------------------
// AC 5 -- outside a game nothing scores.
// ---------------------------------------------------------------------------

describe('AC 5 -- game_over and Attract after a game: pop, spinner and DRAGON-target closures change no score, letter or bonus', () => {
	const PLAYERS: readonly Player[] = [player({ score: 12000, letters: 'DR' }), player({ score: 3500, ballNumber: 3 })];
	const script = () => close('s_pop_1').at(1).close(SPINNER_SWITCH).at(2).close(TARGET.a).at(3);

	for (const phase of ['game_over', 'attract'] as const) {
		it(`${phase} with players present: every player unchanged`, () => {
			const initial = gameState({ phase, players: PLAYERS, modes: [], currentPlayer: 1 });
			const after = run(script(), 3, initial).finalState;
			// Separate assertions, so a red names which earner leaked. No base
			// mode exists here (modes: [], as after the real teardown), so the
			// score line can only catch a new score writer outside the modes;
			// the letters and bonus lines are what the phase conjunct of
			// `scoringOpen()` alone protects here. The constructed case below
			// pins the phase gate on the base mode's own awards.
			expect(after.players.map((p) => p.score), 'scores').toEqual(PLAYERS.map((p) => p.score));
			expect(after.players.map((p) => p.letters), 'letters').toEqual(PLAYERS.map((p) => p.letters));
			expect(after.players.map((p) => p.bonus), 'bonus').toEqual(PLAYERS.map((p) => p.bonus));
		});
	}

	for (const phase of ['game_over', 'attract'] as const) {
		it(`${phase}, a (constructed) base-mode entry still present: pop and spinner pay nothing -- awardScore's phase gate, not the teardown`, () => {
			const initial = gameState({ phase, players: PLAYERS, modes: [{ mode: 'base', priority: 100, player: 1 }], currentPlayer: 1 });
			const after = run(close('s_pop_1').at(1).close(SPINNER_SWITCH).at(2), 2, initial).finalState;
			expect(after.modes.map((m) => m.mode), 'sanity: the base entry was still there to pay').toEqual(['base']);
			expect(after.players.map((p) => p.score), 'scores').toEqual(PLAYERS.map((p) => p.score));
		});
	}

	it('control: the same closures mid-ball score and add the letter', () => {
		const after = run(script(), 3, gameState({ players: [PLAYERS[0]!] })).finalState.players[0]!;
		expect(after.score).toBe(12000 + POP + SPIN);
		expect(after.letters).toBe('DRA');
		expect(after.bonus.byCategory.letters).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Hot seat and the skill-shot miss.
// ---------------------------------------------------------------------------

describe('Matrix row "Hot seat" -- the base mode pays its own active.player', () => {
	it('two players, player 2 up: a pop raises only players[1].score', () => {
		const initial = gameState({ players: [player({ score: 7000 }), player()], currentPlayer: 1, modes: [{ mode: 'base', priority: 100, player: 1 }] });
		const after = run(close('s_pop_2').at(1), 1, initial).finalState;
		expect(after.players.map((p) => p.score)).toEqual([7000, POP]);
	});

	it('the payee is the mode\'s own player, never currentPlayer: a (constructed) base entry for player 2 while currentPlayer is 0 pays player 2', () => {
		// In production the two always agree during play (the mode stack starts
		// the base mode for `currentPlayer`); this fixture pulls them apart so
		// that the Always clause "never against currentPlayer" is observable.
		const initial = gameState({ players: [player(), player()], currentPlayer: 0, modes: [{ mode: 'base', priority: 100, player: 1 }] });
		const after = run(close('s_pop_2').at(1), 1, initial).finalState;
		expect(after.players.map((p) => p.score)).toEqual([0, POP]);
	});
});

describe('Matrix row "Skill-shot miss on a pop or sling"', () => {
	it('armed skill shot, first closure s_pop_2: the skill shot closes with no award; the score is exactly popScore', () => {
		const initial = gameState({ players: [player({ lanes: { lit: { top_2: true }, completedSets: [] } })], modes: armedAfterLaunch() });
		const after = run(close('s_pop_2').at(1), 1, initial).finalState;
		expect(after.modes.map((m) => m.mode)).toEqual(['base']);
		expect(after.players[0]!.score).toBe(POP);
		expect(after.players[0]!.letters).toBe('');
	});
});

// ---------------------------------------------------------------------------
// The tuning the base mode is given.
// ---------------------------------------------------------------------------

describe('the base mode reads the ResolvedTuning it is given, never the raw TUNING singleton', () => {
	it('an override of all four values reaches every branch through a real createRules() run', () => {
		const tuning = resolveTuning({
			...RAW_TUNING,
			popScore: { ...RAW_TUNING.popScore, value: 7 },
			slingScore: { ...RAW_TUNING.slingScore, value: 11 },
			spinnerScore: { ...RAW_TUNING.spinnerScore, value: 13 },
			dragonBankAward: { ...RAW_TUNING.dragonBankAward, value: 17 },
		});
		const script = sixTargets(4, close('s_pop_1').at(1).close('s_sling_l').at(2).close(SPINNER_SWITCH).at(3));
		expect(run(script, 9, gameState(), { tuning }).finalState.players[0]!.score).toBe(7 + 11 + 13 + 17);
		expect(run(script, 9, gameState()).finalState.players[0]!.score, 'control: the default tuning pays the default values').toBe(POP + SLING + SPIN + BANK);
	});
});
