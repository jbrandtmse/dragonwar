// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.7: the headless scripted tests for every I/O & Edge-Case Matrix
// row (Rule 8), driven through `runRulesScript()` (`test/util/switch-script.ts`)
// only -- the mode stack's own behaviour (AD-3, AD-6, AD-7, AD-8, AD-19),
// never a raw switch and never `sim/loop`/`sim/physics` (AC 9, pinned
// transitively by `test/rules-devices-headless.test.ts`'s ENTRY_FILES gate).
//
// DEFERRED START (read before editing any test below that touches
// `ball_starting`): `src/sim/rules/modes/index.ts`'s own header explains why
// a `ball_starting` seen at tick T is actually started on tick T+1's
// `step()` call, never the SAME tick -- keeping `test/rules-lifecycle.test.ts`'s
// Story 2.5 AC 5 mode-teardown pin green through a same-tick
// `ball_ended` -> rotation -> `ball_starting`. Every test here that checks
// state right after `ball_starting` fires therefore reads
// `statesByTick.get(startTick + 1)`, never `startTick` itself.
//
// AC 2/AC 3/AC 4/AC 5 and the remaining Matrix rows script a MID-GAME
// `initialState` directly (mirroring `test/rules-lifecycle.test.ts`'s own AC
// 5/6/7 fixtures) with `modes[]` already populated -- this is headless
// GameState-level testing (Rule 8), not an Integration AC, so building the
// fixture directly (rather than driving a full Start-to-here script) is the
// established, permitted pattern; AC 1 and AC 6 below are the ones that
// exercise the REAL `ball_starting` -> `start()` wiring end to end.

import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { close, runRulesScript } from './util/switch-script';
import { createSkillShotMode } from '../src/sim/rules/modes/skill-shot';
import type { GameState, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();

/**
 * Story 2.9: `threeBallDrawSequence()` below drains each of its three balls
 * only 3-8 ticks after its own plunge -- comfortably inside the PRODUCTION
 * ball-save window (8 s default), which this story's own drain interception
 * would otherwise turn into a SAVE (re-serving the SAME ball, never rotating
 * to the next one, never drawing a new Top lane) rather than the real
 * drain/rotate/redraw this test's whole point is to exercise. An override
 * tuning with the window and grace both shrunk to near-zero keeps every
 * scripted tick number, and every assertion, EXACTLY as this story found
 * them (task 13: "preserving exactly what each test pins") -- only the
 * ball-save timing, which is incidental to what this test actually covers,
 * changes.
 */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

type LaneName = keyof typeof TABLE.laneWiring;
const LANE_NAMES = Object.keys(TABLE.laneWiring) as LaneName[];

/** Every lane currently lit within `set`, for `players[0]` -- the assertion shape almost every test below needs (AD-7: lit flags + completed sets are the whole of `PlayerLaneState`). */
function litLanesInSet(state: GameState, set: 'top' | 'inout'): LaneName[] {
	const lit = state.players[0]!.lanes.lit;
	return LANE_NAMES.filter((lane) => TABLE.laneWiring[lane].set === set && lit[lane] === true);
}

/** A fresh player, test-local (mirrors `ball-controller.ts`'s own `emptyPlayer()`, `test/rules-lifecycle.test.ts`'s own precedent) -- `lanes`/`letters`/`score`/`ballNumber` overridable per scenario. */
function player(overrides: {
	readonly score?: number;
	readonly letters?: string;
	readonly ballNumber?: number;
	readonly lit?: Record<string, boolean>;
	readonly completedSets?: readonly string[];
} = {}) {
	return {
		score: overrides.score ?? 0,
		letters: overrides.letters ?? '',
		lockCredits: 0,
		tiltWarnings: 0,
		bonus: { byCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1 },
		lanes: { lit: overrides.lit ?? {}, completedSets: overrides.completedSets ?? [] },
		extraBalls: 0,
		jackpotSeed: 0,
		warsStarted: 0,
		modesPlayed: [] as string[],
		ballNumber: overrides.ballNumber ?? 1,
	};
}

/** A single-player, mid-game `GameState` -- `ballsInPlay: 1` so an incidental parking-slot closure in a scripted switch (e.g. a Non-playfield-closure case) does not ALSO trigger an unrelated drain, which would confound the assertion under test. */
function gameState(options: {
	readonly players: readonly ReturnType<typeof player>[];
	readonly modes?: GameState['modes'];
	readonly rng?: number;
	readonly ballsInPlay?: number;
}): GameState {
	return {
		tick: 0,
		phase: 'game',
		machine: {
			ballsInPlay: options.ballsInPlay ?? 1,
			hardwareEnabled: true,
			ballSave: { untilTick: null, sources: [] },
			tilt: { tilted: false, slamTilted: false },
			multiball: null,
			highscores: [],
			deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [true], bd_lock: [false, false, false] },
		},
		players: options.players,
		currentPlayer: 0,
		modes: options.modes ?? [],
		rng: options.rng ?? 0,
	};
}

/** An active `{ base, skill_shot }` pair, `skill_shot` already `launched: true` -- the fixture AC 2/AC 3 and the Matrix's own no-Top-lit/all-letters rows share. */
function armedAfterLaunch(): GameState['modes'] {
	return [
		{ mode: 'base', priority: 100, player: 0 },
		{ mode: 'skill_shot', priority: 200, player: 0, launched: true },
	];
}

describe('AC 1 -- ball_starting arms the stack', () => {
	it('modes[] gains exactly base + skill_shot for player p one tick after ball_starting; one Top lane lit; rng advanced; no inout lane lit', () => {
		const result = runRulesScript(close('s_start').at(5).build(), { durationTicks: 6 });
		const atStart = result.statesByTick.get(5)!;
		const after = result.statesByTick.get(6)!;

		expect(atStart.modes, 'not yet armed at the SAME tick ball_starting fires -- see this file\'s DEFERRED START header note').toEqual([]);

		expect(after.modes).toEqual([
			{ mode: 'base', priority: 100, player: 0 },
			{ mode: 'skill_shot', priority: 200, player: 0, launched: false },
		]);

		expect(litLanesInSet(after, 'top'), 'exactly one Top lane lit').toHaveLength(1);
		expect(litLanesInSet(after, 'inout'), 'no inout lane lit').toEqual([]);

		expect(after.rng, 'rng must have advanced from its pre-tick value').not.toBe(atStart.rng);
	});
});

describe('AC 2 -- skill shot made', () => {
	it('score += resolveTuning().skillShotAward, one new DRAGON letter, skill_shot leaves modes[] while base remains', () => {
		const initial = gameState({ players: [player({ lit: { top_2: true } })], modes: armedAfterLaunch() });
		const result = runRulesScript(close('s_top_2').at(1).build(), { durationTicks: 1, initialState: initial });
		const after = result.finalState;

		expect(after.players[0]!.score, 'read from resolveTuning() at the assertion, never a literal').toBe(TUNING.skillShotAward.value);
		expect(after.players[0]!.letters, 'the first unspelled DRAGON letter, D').toBe('D');
		expect(after.modes.map((m) => m.mode)).toEqual(['base']);
	});
});

describe('DW-203 -- the launched guard is falsifiable: a closure BEFORE ball_launched must not resolve the skill shot', () => {
	it('closing the drawn lane\'s own switch while the ball is still in the shooter lane (launched: false) leaves the skill shot armed, with no award', () => {
		// Closing the LIT lane's own switch, not an unrelated one, is what
		// makes this test mutation-provable (Rule 19): an observer who only
		// checked "some playfield closure doesn't resolve it early" could not
		// tell a real launched-guard from a lucky non-matching miss. Removing
		// the guard (`if (active.launched !== true) continue;` in
		// skill-shot.ts) would make THIS exact closure match and pay, since it
		// genuinely is the drawn, lit lane's switch.
		const initial = gameState({
			players: [player({ lit: { top_2: true } })],
			modes: [
				{ mode: 'base', priority: 100, player: 0 },
				{ mode: 'skill_shot', priority: 200, player: 0, launched: false },
			],
		});
		const result = runRulesScript(close('s_top_2').at(1).build(), { durationTicks: 1, initialState: initial });
		const after = result.finalState;

		expect(after.modes.map((m) => m.mode).sort(), 'skill_shot must still be armed -- ball_launched has not fired yet').toEqual(['base', 'skill_shot']);
		expect(after.players[0]!.score, 'no award before launch, even on the lit lane\'s own switch').toBe(0);
		expect(after.players[0]!.letters).toBe('');
	});
});

describe('DW-202 -- lane change actually repositions the lane the skill shot pays on (composition, not each mechanism proven only in isolation)', () => {
	/**
	 * Boots straight into Attract at `rng: 12345` -- the SAME seed
	 * `test/rules-modes-integration.test.ts`'s own DW-201 block and
	 * `test/lighting-integration.test.ts` pin, whose first draw is `top_3`
	 * under EITHER mechanism ([AMENDED 2026-09-12, Story 2.14]: this seed's
	 * shipped per-ball draw and its rotation sequence are byte-identical --
	 * Story 2.14's own Code Map measured it -- which is exactly why Story
	 * 2.14's own sequence pin below excludes it as non-discriminating).
	 * Verified here against `src/sim/rules/rng.ts`'s own algorithm, never
	 * guessed. Driving this test through the REAL
	 * `ball_starting` -> `start()` path (rather than the hand-built
	 * `armedAfterLaunch()` fixture every other test in this file uses) is
	 * deliberate: it is the only way a mutation that caches the drawn lane
	 * AT DRAW TIME (rather than re-deriving it from `lanes.lit` live) can be
	 * distinguished from one that merely never populates a cache at all --
	 * see this file's own DW-203 block and this describe block's mutation
	 * notes for why a hand-built fixture cannot discriminate that claim.
	 */
	function attractState(): GameState {
		return {
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
			rng: 12345,
		};
	}

	/**
	 * Real Start -> arm (draws `top_3`, per the seed above) -> real
	 * `ball_launched` -> a real `lane_change_pressed` (right: `top_3` wraps
	 * to `top_1`, AC 4's own pinned rotation) -> a real playfield closure at
	 * `closeSwitch`, whichever the caller wants to test entering.
	 */
	function drawTop3ThenRotateToTop1AndClose(closeSwitch: SwitchName): GameState {
		const script = close('s_start').at(5)
			.open('s_shooter_lane').at(7)
			.close('s_flipper_r').at(8)
			.close(closeSwitch).at(9)
			.build();
		const result = runRulesScript(script, { durationTicks: 9, initialState: attractState() });

		// Sanity, both load-bearing for the assertions below: the draw
		// genuinely landed on top_3 (this seed's own pinned first draw, AC 6),
		// and the lane-change press genuinely rotated it to top_1 (AC 4's own
		// pinned top-set right-rotation, wrapping) -- if either failed this
		// test would prove nothing about composition.
		expect(litLanesInSet(result.statesByTick.get(6)!, 'top'), 'seed 12345\'s first draw must be top_3 (pinned by AC 6)').toEqual(['top_3']);
		expect(litLanesInSet(result.statesByTick.get(8)!, 'top'), 'a right press must rotate top_3 -> top_1 (pinned by AC 4)').toEqual(['top_1']);

		return result.finalState;
	}

	it('draw top_3, lane change rotates it to top_1, entering top_1 pays -- the award reads lanes.lit live, not a lane cached at draw time', () => {
		const after = drawTop3ThenRotateToTop1AndClose('s_top_1');

		expect(after.players[0]!.score, 'the award must pay on the NEW lit lane (top_1), not the originally-drawn one (top_3)').toBe(TUNING.skillShotAward.value);
		expect(after.players[0]!.letters, 'the first unspelled DRAGON letter, D').toBe('D');
		expect(after.modes.map((m) => m.mode)).toEqual(['base']);
	});

	it('control (the falsifying case): entering the ORIGINALLY drawn lane (top_3) AFTER lane change has moved the lit lane away from it must NOT pay', () => {
		// This is the mutation this ledger entry names made concrete as its
		// own second test, not merely a described mutation to apply and
		// revert: a skill shot that cached its drawn lane (top_3) at start()
		// time, instead of reading players[p].lanes.lit live, would incorrectly
		// pay HERE -- top_3 is no longer lit once lane change has rotated it
		// away to top_1.
		const after = drawTop3ThenRotateToTop1AndClose('s_top_3');

		expect(
			after.players[0]!.score,
			'top_3 is no longer lit after the rotation -- entering it must not pay, proving the mode reads lanes.lit live rather than the lane drawn at start()',
		).toBe(0);
		expect(after.players[0]!.letters).toBe('');
		expect(after.modes.map((m) => m.mode)).toEqual(['base']);
	});
});

describe('AC 3 -- skill shot missed', () => {
	const misses: readonly { readonly label: string; readonly switchName: SwitchName }[] = [
		{ label: 's_sling_l (an unrelated playfield switch)', switchName: 's_sling_l' },
		{ label: 's_pop_2 (an unrelated playfield switch)', switchName: 's_pop_2' },
		{ label: 's_drain', switchName: 's_drain' },
		{ label: 's_top_1 (an UNLIT Top lane -- top_2 is the lit one)', switchName: 's_top_1' },
	];

	for (const { label, switchName } of misses) {
		it(`${label}: modes[] loses skill_shot, keeps base; score and letters unchanged`, () => {
			const initial = gameState({ players: [player({ lit: { top_2: true } })], modes: armedAfterLaunch() });
			const result = runRulesScript(close(switchName).at(1).build(), { durationTicks: 1, initialState: initial });
			const after = result.finalState;

			expect(after.modes.map((m) => m.mode)).toEqual(['base']);
			expect(after.players[0]!.score).toBe(0);
			expect(after.players[0]!.letters).toBe('');
		});
	}

	it('no Top lane lit (cleared by an intervening set reset): the first playfield closure resolves the mode with NO award', () => {
		const initial = gameState({ players: [player({ lit: {} })], modes: armedAfterLaunch() });
		const result = runRulesScript(close('s_pop_1').at(1).build(), { durationTicks: 1, initialState: initial });
		const after = result.finalState;

		expect(after.modes.map((m) => m.mode)).toEqual(['base']);
		expect(after.players[0]!.score).toBe(0);
		expect(after.players[0]!.letters).toBe('');
	});
});

describe('Matrix row -- all six DRAGON letters already spelled', () => {
	it('the award still pays; letters is unchanged (no seventh letter, no duplicate)', () => {
		const initial = gameState({ players: [player({ lit: { top_1: true }, letters: 'DRAGON' })], modes: armedAfterLaunch() });
		const result = runRulesScript(close('s_top_1').at(1).build(), { durationTicks: 1, initialState: initial });
		const after = result.finalState;

		expect(after.players[0]!.score).toBe(TUNING.skillShotAward.value);
		expect(after.players[0]!.letters).toBe('DRAGON');
	});
});

describe('Matrix row -- non-playfield closures are inert: the skill shot stays armed', () => {
	// ballsInPlay: 2 so a scripted parking-slot closure (s_trough_2, s_lock_1)
	// decrements without reaching 0 -- isolating "does this switch resolve
	// the skill shot" from the UNRELATED drain mechanism, which also clears
	// modes[] but for a completely different reason.
	//
	// Story 2.11: `s_slam_tilt` moved OUT of this set -- it is still true that
	// closing it produces no `playfield_switch_closed` (unchanged, AC 12), but
	// it is no longer INERT for `modes[]`: the tilt controller now consumes
	// its own `slam_tilt_closed` device event and, in `phase: 'game'`, clears
	// `modes: []` as part of ending every player's game (FR-16, this story's
	// own AC 6) -- a real, intentional side effect, not the drain mechanism
	// this describe block's own header carves out. `s_tilt_bob` stays: a
	// single closure here only WARNS (this player's `tiltWarnings` starts at
	// 0, below the default `adjustments.tiltWarnings` of 1), which touches
	// only `players[0].tiltWarnings`, never `modes[]`.
	const inert: readonly SwitchName[] = ['s_shooter_lane', 's_trough_2', 's_lock_1', 's_flipper_l', 's_start', 's_tilt_bob'];

	for (const switchName of inert) {
		it(`${switchName} closing: no playfield_switch_closed is produced, so the skill shot stays armed`, () => {
			const initial = gameState({
				players: [player({ lit: { top_1: true }, ballNumber: 2 })],
				modes: armedAfterLaunch(),
				ballsInPlay: 2,
			});
			const result = runRulesScript(close(switchName).at(1).build(), { durationTicks: 1, initialState: initial });
			const after = result.finalState;

			expect(after.modes.map((m) => m.mode).sort()).toEqual(['base', 'skill_shot']);
			expect(after.players[0]!.score).toBe(0);
		});
	}
});

describe('AC 4 -- lane change rotates lit flags within each set, wrapping, count-invariant', () => {
	it('Top set, right: rotates toward increasing order (top_2 -> top_3), and a further right wraps top_3 -> top_1', () => {
		const initial = gameState({ players: [player({ lit: { top_2: true } })], modes: [{ mode: 'base', priority: 100, player: 0 }] });
		const afterFirst = runRulesScript(close('s_flipper_r').at(1).build(), { durationTicks: 1, initialState: initial }).finalState;
		expect(litLanesInSet(afterFirst, 'top')).toEqual(['top_3']);

		const afterSecond = runRulesScript(close('s_flipper_r').at(1).build(), { durationTicks: 1, initialState: afterFirst }).finalState;
		expect(litLanesInSet(afterSecond, 'top'), 'a further right press wraps top_3 -> top_1').toEqual(['top_1']);
	});

	it('Top set, left: wraps the OTHER end, top_1 -> top_3', () => {
		const initial = gameState({ players: [player({ lit: { top_1: true } })], modes: [{ mode: 'base', priority: 100, player: 0 }] });
		const after = runRulesScript(close('s_flipper_l').at(1).build(), { durationTicks: 1, initialState: initial }).finalState;
		expect(litLanesInSet(after, 'top')).toEqual(['top_3']);
	});

	it('inout set, left: wraps to the HIGHEST-order member, outlane_l -> outlane_r', () => {
		const initial = gameState({ players: [player({ lit: { outlane_l: true } })], modes: [{ mode: 'base', priority: 100, player: 0 }] });
		const after = runRulesScript(close('s_flipper_l').at(1).build(), { durationTicks: 1, initialState: initial }).finalState;
		expect(litLanesInSet(after, 'inout')).toEqual(['outlane_r']);
	});

	it('inout set, right: wraps the OTHER end, outlane_r -> outlane_l', () => {
		const initial = gameState({ players: [player({ lit: { outlane_r: true } })], modes: [{ mode: 'base', priority: 100, player: 0 }] });
		const after = runRulesScript(close('s_flipper_r').at(1).build(), { durationTicks: 1, initialState: initial }).finalState;
		expect(litLanesInSet(after, 'inout')).toEqual(['outlane_l']);
	});

	it('a single press rotates BOTH sets on the same tick; the lit count per set is invariant', () => {
		const initial = gameState({ players: [player({ lit: { top_1: true, inlane_l: true } })], modes: [{ mode: 'base', priority: 100, player: 0 }] });
		const after = runRulesScript(close('s_flipper_r').at(1).build(), { durationTicks: 1, initialState: initial }).finalState;

		expect(litLanesInSet(after, 'top')).toHaveLength(1);
		expect(litLanesInSet(after, 'inout')).toHaveLength(1);
		expect(litLanesInSet(after, 'top'), 'the Top set genuinely moved').not.toEqual(['top_1']);
		expect(litLanesInSet(after, 'inout'), 'the inout set genuinely moved').not.toEqual(['inlane_l']);
	});
});

describe('AC 5 -- a completed set is recorded, emits lanes_completed, and resets', () => {
	it('Top set: the third Top-lane entry completes it', () => {
		const initial = gameState({ players: [player({ lit: { top_1: true, top_2: true } })], modes: [{ mode: 'base', priority: 100, player: 0 }] });
		const result = runRulesScript(close('s_top_3').at(1).build(), { durationTicks: 1, initialState: initial });
		const after = result.finalState;

		expect(after.players[0]!.lanes.completedSets).toEqual(['top']);
		expect(result.modeEvents).toEqual([{ type: 'lanes_completed', set: 'top', tick: 1 }]);
		expect(litLanesInSet(after, 'top'), 'all three Top flags false afterwards').toEqual([]);
	});

	it('inout set: the fourth member (same handling, set: "inout")', () => {
		const initial = gameState({
			players: [player({ lit: { outlane_l: true, inlane_l: true, inlane_r: true } })],
			modes: [{ mode: 'base', priority: 100, player: 0 }],
		});
		const result = runRulesScript(close('s_outlane_r').at(1).build(), { durationTicks: 1, initialState: initial });
		const after = result.finalState;

		expect(after.players[0]!.lanes.completedSets).toEqual(['inout']);
		expect(result.modeEvents).toEqual([{ type: 'lanes_completed', set: 'inout', tick: 1 }]);
		expect(litLanesInSet(after, 'inout')).toEqual([]);
	});
});

// Code review 2026-09-06 (verification gap): every other case in this file and
// in test/rules-modes-integration.test.ts runs ONE player at index 0 (AC I1
// deliberately presses Start once, per the DW-197 line-budget boundary), so
// `ActiveModeState.player` -- the field AC 1's own "for player *p*" rests on --
// could be replaced by the literal `0`, or by `state.currentPlayer`, and the
// whole suite would stay green. AD-7 makes `lanes` player-scoped, and
// test/rules-lifecycle.test.ts's rotating drain is the delivered path that
// makes p != 0 real, so the scoping is load-bearing rather than hypothetical.
//
// These cases pin it by setting `currentPlayer: 0` while the active modes carry
// `player: 1`. That discriminates all three implementations at once: reading
// `active.player` writes player 1 (correct); reading `state.currentPlayer` or a
// hardcoded `0` writes player 0 and reddens both assertions below.
describe('AD-7 player scoping -- the modes write the mode entry\'s OWN player, not currentPlayer and not player 0', () => {
	it('base mode: a lane entry lights the lane for the mode\'s player, leaving the other player untouched', () => {
		const initial = gameState({
			players: [player({}), player({})],
			modes: [{ mode: 'base', priority: 100, player: 1 }],
		});
		const result = runRulesScript(close('s_top_2').at(1).build(), { durationTicks: 1, initialState: initial });
		const after = result.finalState;

		expect(after.players[1]!.lanes.lit.top_2, "the mode's own player (1) must be the one lit").toBe(true);
		expect(after.players[0]!.lanes.lit, 'player 0 -- currentPlayer, but NOT this mode\'s player -- must be untouched').toEqual({});
	});

	it('skill shot: the award and the DRAGON letter land on the mode\'s player, not on currentPlayer', () => {
		const initial = gameState({
			players: [player({}), player({ lit: { top_2: true } })],
			modes: [
				{ mode: 'base', priority: 100, player: 1 },
				{ mode: 'skill_shot', priority: 200, player: 1, launched: true },
			],
		});
		const result = runRulesScript(close('s_top_2').at(1).build(), { durationTicks: 1, initialState: initial });
		const after = result.finalState;

		expect(after.players[1]!.score, "the mode's own player (1) must be paid").toBe(TUNING.skillShotAward.value);
		expect(after.players[1]!.letters, "the mode's own player (1) must get the letter").toHaveLength(1);
		expect(after.players[0]!.score, 'player 0 must not be paid').toBe(0);
		expect(after.players[0]!.letters, 'player 0 must get no letter').toBe('');
	});
});

describe('AC 7 -- Attract: no mode is ever pushed, rng is never advanced, lanes are never written', () => {
	it('closing a button, a lane and an unrelated playfield switch in Attract leaves modes/rng/lanes untouched', () => {
		const initial: GameState = {
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
			players: [player({})],
			currentPlayer: 0,
			modes: [],
			rng: 777,
		};
		const script = close('s_top_2').at(1).close('s_sling_l').at(2).close('s_flipper_r').at(3).build();
		const result = runRulesScript(script, { durationTicks: 3, initialState: initial });
		const after = result.finalState;

		expect(after.modes).toEqual([]);
		expect(after.rng).toBe(777);
		expect(after.players[0]!.lanes.lit).toEqual({});
		expect(after.players[0]!.lanes.completedSets).toEqual([]);
	});
});

// Story 2.14 (DW-205, DW-214): the lit Top lane no longer draws fresh from
// `GameState.rng` at every ball start -- a starting position is drawn ONCE
// per game, and the lane then advances one position through `TOP_LANES`,
// wrapping, per the player's own `players[p].ballNumber`. This block replaces
// the file's former "AC 6" (that title was Story 2.7's own numbering, not
// this story's -- see this spec's Code Map) with Story 2.14's own pins.
const FAST_GAME_OVER_TUNING = resolveTuning({
	...RAW_TUNING,
	// Same rationale as NO_BALL_SAVE_TUNING above: a scripted drain must be a
	// real one, never intercepted as a save.
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
	// Shrinks the game-over sequence's own three paced durations to 1 tick
	// each (still nonzero -- DW-35 rejects a duration that rounds to 0
	// ticks), so a "second game after game over" test needs tens of ticks,
	// not production's matchDelayMs 5000 + matchRevealMs 250*10 + attractMs
	// 8000 (~15,500 ticks). Only this describe block's own "second game"
	// test uses this tuning; every sequence/hot-seat/one-draw test above and
	// below it never reaches game_over, so production's game-over pacing is
	// irrelevant to them.
	matchDelayMs: { ...RAW_TUNING.matchDelayMs, value: 1 },
	matchRevealMs: { ...RAW_TUNING.matchRevealMs, value: 1 },
	attractMs: { ...RAW_TUNING.attractMs, value: 1 },
});

describe('Story 2.14 -- the lit Top lane rotates from a game-scoped starting position, per the player\'s own ballNumber', () => {
	/** Boots straight into Attract at `rng`, mirroring `test/util/switch-script.ts`'s own private `DEFAULT_INITIAL_STATE` (not exported -- duplicated here, test-local, per that file's own boot-seed convention). */
	function attractState(rng: number): GameState {
		return {
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
			rng,
		};
	}

	/**
	 * Drives one player through three balls, single-player (`isLastPlayer` is
	 * always true, so each drain wraps back to the SAME player -- ball 2,
	 * then ball 3, then game over at ball 3's own drain, `ballsPerGame: 3`
	 * default). Each ball: Start/drain, a plunge (`open('s_shooter_lane')`,
	 * simulated -- see this file's own DEFERRED START header, `ball_launched`
	 * only matters for the skill-shot's OWN `launched` gate, not for this
	 * test), then a parking-slot closure that drains it. The draw for ball N
	 * lands on the tick AFTER that ball's own `ball_starting` (this file's
	 * DEFERRED START note) -- ticks 6, 11 and 21 below.
	 */
	function threeBallDrawSequence(seed: number): readonly LaneName[] {
		const script = close('s_start').at(5)
			.open('s_shooter_lane').at(7)
			.close('s_trough_1').at(10)
			.open('s_shooter_lane').at(12)
			.close('s_trough_2').at(20)
			.open('s_shooter_lane').at(22)
			.close('s_trough_3').at(30)
			.build();
		const result = runRulesScript(script, { durationTicks: 35, initialState: attractState(seed), tuning: NO_BALL_SAVE_TUNING });
		const drawTicks = [6, 11, 21];
		return drawTicks.map((tick) => {
			const lit = result.statesByTick.get(tick)!.players[0]!.lanes.lit;
			const lane = LANE_NAMES.find((name) => TABLE.laneWiring[name].set === 'top' && lit[name] === true);
			expect(lane, `a Top lane must be lit at tick ${tick}`).toBeDefined();
			return lane!;
		});
	}

	/** `state.players[playerIndex]`'s own lit Top lane, or `undefined` if none is. */
	function litTopLaneFor(state: GameState, playerIndex: number): LaneName | undefined {
		const lit = state.players[playerIndex]!.lanes.lit;
		return LANE_NAMES.find((name) => TABLE.laneWiring[name].set === 'top' && lit[name] === true);
	}

	// Sequences computed directly from src/sim/rules/rng.ts's own algorithm (a
	// scratch Node harness transcribing its four lines verbatim, verified at
	// implementation time) -- never guessed, and never re-imported into the
	// expectation below (Anti-vacuity: "an expectation derived from the value
	// or table under test"). Seeds 0, 1 and 2 are each one of the three
	// possible starting positions (AC 2: "every starting position, not one
	// chosen seed") and were each measured, before this story's production
	// edit landed, to differ from their OWN shipped per-ball-draw sequence
	// (Rule 19 premise check -- see this spec's own `## Verification`).
	//
	// Seed 12345 -- this file's own FORMER primary pin here, and the seed
	// DW-202 above and `test/lighting-integration.test.ts` still reuse -- is
	// deliberately excluded: measured (Code Map), its shipped per-ball-draw
	// sequence and its rotation sequence are byte-identical (`top_3, top_1,
	// top_2` either way), so a pin on it stays green whether or not this
	// story's rotation exists at all (Anti-vacuity: "an expectation that both
	// mechanisms satisfy").
	const CASES: readonly { readonly seed: number; readonly sequence: readonly LaneName[] }[] = [
		{ seed: 0, sequence: ['top_1', 'top_2', 'top_3'] },
		{ seed: 1, sequence: ['top_2', 'top_3', 'top_1'] },
		{ seed: 2, sequence: ['top_3', 'top_1', 'top_2'] },
	];

	for (const { seed, sequence } of CASES) {
		it(`seed ${seed}: the starting position advances through TOP_LANES, wrapping, one position per ball; all three balls distinct; replays identically`, () => {
			const first = threeBallDrawSequence(seed);
			const second = threeBallDrawSequence(seed);

			expect(first, 'the rotation from this seed\'s own starting position, as authored literals').toEqual(sequence);
			expect(second, 'replaying the identical script from the identical seed must reproduce the identical sequence').toEqual(first);
			expect(new Set(first).size, 'AC 1/AC 2: a three-ball repeat is impossible BY CONSTRUCTION -- all three must be distinct').toBe(3);
		});
	}

	it('wrap: the starting-position-2 seed\'s own ball 3 is top_2 (wraps past top_3 back to the front of TOP_LANES)', () => {
		const sequence = threeBallDrawSequence(2);
		expect(sequence[2], 'ball 3 from starting position 2: (2 + 2) mod 3 = 1 -> top_2').toBe('top_2');
	});

	// I/O Matrix row "ballsPerGame above 3": driven directly against
	// createSkillShotMode().start() (mirroring the "AC 5 (direct)" technique
	// below) rather than a scripted 5-ball game, since the mode's own closure
	// state is exactly what needs exercising past the 3-ball window -- the
	// wrapping index arithmetic itself does not know how many balls a game
	// has. Starting position 2 (seed 2, top_3 -- see the CASES table above):
	// the five-ball rotation is an authored literal, never re-derived from
	// the `(gameLaneStart + ballNumber - 1) % n` formula under test.
	it('ballsPerGame above 3: a 5-ball game never repeats a lane on two consecutive balls, at any length', () => {
		const mode = createSkillShotMode(TUNING);
		const seed = 2;
		const sequence: (LaneName | undefined)[] = [];
		for (let ballNumber = 1; ballNumber <= 5; ballNumber++) {
			const state = gameState({ players: [player({ ballNumber })], rng: seed });
			const after = mode.start(state, 0);
			sequence.push(litTopLaneFor(after, 0));
		}

		expect(sequence, 'the authored five-ball rotation from starting position 2').toEqual([
			'top_3', 'top_1', 'top_2', 'top_3', 'top_1',
		]);
		for (let i = 1; i < sequence.length; i++) {
			expect(sequence[i], `ball ${i + 1} must not repeat ball ${i}'s own lane`).not.toBe(sequence[i - 1]);
		}
	});

	it('AC 4: one draw per game -- rng advances exactly once, at the game\'s first ball, and stays byte-identical at balls 2 and 3', () => {
		const seed = 0;
		const script = close('s_start').at(5)
			.open('s_shooter_lane').at(7)
			.close('s_trough_1').at(10)
			.open('s_shooter_lane').at(12)
			.close('s_trough_2').at(20)
			.open('s_shooter_lane').at(22)
			.close('s_trough_3').at(30)
			.build();
		const result = runRulesScript(script, { durationTicks: 35, initialState: attractState(seed), tuning: NO_BALL_SAVE_TUNING });

		const beforeBall1Draw = result.statesByTick.get(5)!.rng;
		const afterBall1Draw = result.statesByTick.get(6)!.rng;
		const atBall2 = result.statesByTick.get(11)!.rng;
		const atBall3 = result.statesByTick.get(21)!.rng;

		expect(afterBall1Draw, 'the game\'s first ball must genuinely draw -- rng must have moved from its pre-tick value').not.toBe(beforeBall1Draw);
		expect(atBall2, 'ball 2 must take NO draw of its own -- rng stays byte-identical to its post-ball-1 value').toBe(afterBall1Draw);
		expect(atBall3, 'ball 3 must also take no draw of its own').toBe(afterBall1Draw);

		// Positive, paired with the negatives above (Anti-vacuity: "a negative
		// with no positive"): a Top lane genuinely was lit at every ball.
		expect(litLanesInSet(result.statesByTick.get(6)!, 'top'), 'ball 1 genuinely lit a Top lane').toHaveLength(1);
		expect(litLanesInSet(result.statesByTick.get(11)!, 'top'), 'ball 2 genuinely lit a Top lane').toHaveLength(1);
		expect(litLanesInSet(result.statesByTick.get(21)!, 'top'), 'ball 3 genuinely lit a Top lane').toHaveLength(1);
	});

	it('AC 5: Hot seat -- two players share the one starting draw; each advances by their OWN ball number; no player disturbs the other', () => {
		// Starting position 1 (seed 1): ball 1 -> top_2 (both players' own ball
		// 1); ball 2 -> top_3 (both players' own ball 2) -- see the CASES table.
		const seed = 1;
		const script = close('s_start').at(5) // player 0's game begins (draw at tick 6)
			.close('s_start').at(7) // Hot seat: adds player 1 (currentPlayer 0, ballNumber 1)
			.open('s_shooter_lane').at(8) // player 0's ball 1 plunge (simulated)
			.close('s_trough_1').at(10) // drains player 0's ball 1 -> rotates to player 1's ball 1 (start deferred to tick 11)
			.open('s_shooter_lane').at(12) // player 1's ball 1 plunge
			.close('s_trough_2').at(20) // drains player 1's ball 1 -> rotates to player 0's ball 2 (start deferred to tick 21)
			.open('s_shooter_lane').at(22) // player 0's ball 2 plunge
			.close('s_trough_3').at(30) // drains player 0's ball 2 -> rotates to player 1's ball 2 (start deferred to tick 31)
			.build();
		const result = runRulesScript(script, { durationTicks: 35, initialState: attractState(seed), tuning: NO_BALL_SAVE_TUNING });

		expect(result.statesByTick.get(7)!.players, 'the Hot seat press must genuinely add player 1, or the rest of this test proves nothing').toHaveLength(2);

		const p0Ball1 = litTopLaneFor(result.statesByTick.get(6)!, 0);
		const p1Ball1 = litTopLaneFor(result.statesByTick.get(11)!, 1);
		const p0Ball2 = litTopLaneFor(result.statesByTick.get(21)!, 0);
		const p1Ball2 = litTopLaneFor(result.statesByTick.get(31)!, 1);

		expect(p0Ball1, 'player 0\'s own ball 1 -- the game\'s one starting position').toBe('top_2');
		expect(p1Ball1, 'player 1\'s own ball 1 lights the SAME lane as player 0\'s ball 1 -- one starting position, drawn once per game').toBe('top_2');
		expect(p0Ball2, 'player 0\'s own ball 2 advances one position by player 0\'s OWN ball number').toBe('top_3');
		expect(p1Ball2, 'player 1\'s own ball 2 advances one position by player 1\'s OWN ball number -- the same index as player 0\'s ball 2, since both are that player\'s second ball').toBe('top_3');

		expect(result.statesByTick.get(11)!.rng, 'player 1\'s ball 1 takes NO draw of its own -- rng stays exactly the game\'s one draw').toBe(result.statesByTick.get(6)!.rng);
		expect(result.statesByTick.get(21)!.rng, 'player 0\'s ball 2 takes no further draw either').toBe(result.statesByTick.get(6)!.rng);
		expect(result.statesByTick.get(31)!.rng, 'nor does player 1\'s ball 2 -- one draw for the whole game, however many balls or players').toBe(result.statesByTick.get(6)!.rng);

		expect(litTopLaneFor(result.statesByTick.get(21)!, 1), 'player 1\'s own lanes must be untouched by player 0\'s ball 2 starting').toBe(p1Ball1);
		expect(litTopLaneFor(result.statesByTick.get(31)!, 0), 'player 0\'s own lanes must be untouched by player 1\'s ball 2 starting').toBe(p0Ball2);
	});

	// [Rule 19 discriminator for AC 5] The scripted Hot-seat test above drives
	// the REAL ball controller's own rotation, which -- by construction of
	// `startBall()` (`ball-controller.ts:746`, `currentPlayer: playerIndex`)
	// and the one-tick DEFERRED START -- always has `state.currentPlayer`
	// already equal to the mode entry's own `player` argument by the time
	// `skillShot.start()` runs: `pendingStartPlayer` is captured from
	// `currentPlayer` the SAME tick `startBall()` sets it, and nothing can
	// rotate `currentPlayer` again in the one-tick gap before the deferred
	// call reads it. So a script driven through the real system, however
	// elaborate, CANNOT construct a `player` / `currentPlayer` mismatch --
	// verified by mutation: keying the advance's `ballNumber` lookup on
	// `state.currentPlayer` instead of `player` leaves the Hot-seat test
	// above GREEN. This direct call (mirroring this file's own "AD-7 player
	// scoping" describe block, which hand-builds the SAME kind of mismatch
	// for `step()` for the identical reason) closes that gap for `start()`.
	it('AC 5 (direct): the advance reads the mode entry\'s OWN player argument\'s ballNumber, never state.currentPlayer\'s', () => {
		const mode = createSkillShotMode(TUNING);
		// Establishes gameLaneStart = 1 (seed 1's own starting position, top_2 -- see the CASES table) in this mode's own closure.
		const afterBall1 = mode.start(gameState({ players: [player({ ballNumber: 1 })], rng: 1 }), 0);
		expect(litLanesInSet(afterBall1, 'top'), 'sanity: the game genuinely drew a starting position').toEqual(['top_2']);

		// player 1's own ball 2 (ballNumber 2) -- but state.currentPlayer is
		// DELIBERATELY left at 0, whose OWN ballNumber (4) differs. Correct:
		// advance by player 1's OWN ballNumber (2) -> (1 + 2 - 1) mod 3 = 2 ->
		// top_3. Mutant (currentPlayer's ballNumber, 4): (1 + 4 - 1) mod 3 = 1 -> top_2.
		const mismatched: GameState = {
			...afterBall1,
			players: [player({ ballNumber: 4 }), player({ ballNumber: 2 })],
			currentPlayer: 0,
		};
		const after = mode.start(mismatched, 1);
		expect(litTopLaneFor(after, 1), 'must advance by player 1\'s OWN ballNumber (2), not currentPlayer 0\'s ballNumber (4)').toBe('top_3');
		expect(litTopLaneFor(after, 0), 'player 0 must be untouched by player 1\'s own ball starting').toBeUndefined();
	});

	it('AC 6: a second game in one rules instance takes a fresh draw, not a repeat of game 1\'s own starting position', () => {
		// Measured (scratch harness, src/sim/rules/rng.ts's own arithmetic,
		// never guessed): from rng 2, game 1 (ballsPerGame: 1) draws index 2
		// (top_3); the Match's own single nextRng() step at game over (AD-3:
		// "Match still draws last") then advances rng once more; game 2's own
		// fresh draw from THAT value is index 0 (top_1) -- discriminating,
		// since it differs from game 1's own opening lane.
		const script = close('s_start').at(2)
			.open('s_shooter_lane').at(10)
			.close('s_trough_1').at(20) // G: the only ball of the only player drains -- game over
			.close('s_start').at(31) // Start once resolvedTick (G + 1 + 10, under FAST_GAME_OVER_TUNING) has passed
			.build();
		const result = runRulesScript(script, {
			durationTicks: 33,
			initialState: attractState(2),
			tuning: FAST_GAME_OVER_TUNING,
			adjustments: { pitchDeg: 0, tiltWarnings: 1, ballsPerGame: 1, matchProbability: 0 },
		});

		const game1Lane = litLanesInSet(result.statesByTick.get(3)!, 'top');
		expect(game1Lane, 'game 1\'s own opening lane (this test\'s own positive)').toEqual(['top_3']);
		expect(result.statesByTick.get(20)!.phase, 'the single-ball game ends the instant it drains').toBe('game_over');

		const rngBeforeGame2 = result.statesByTick.get(31)!.rng;
		const rngAfterGame2 = result.statesByTick.get(32)!.rng;
		expect(rngAfterGame2, 'game 2 must take a FRESH draw -- rng must move again').not.toBe(rngBeforeGame2);

		const game2Lane = litLanesInSet(result.statesByTick.get(32)!, 'top');
		expect(game2Lane, 'game 2\'s own freshly-drawn opening lane, as an authored literal').toEqual(['top_1']);
		expect(game2Lane, 'game 2 must NOT continue game 1\'s own rotation').not.toEqual(game1Lane);
	});
});
