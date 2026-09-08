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
	 * Boots straight into Attract at `rng: 12345` -- the SAME seed AC 6 below
	 * pins, whose own `EXPECTED_SEQUENCE` records the first ball's draw as
	 * `top_3` (verified there against `src/sim/rules/rng.ts`'s own
	 * algorithm, never guessed). Driving this test through the REAL
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

describe('AC 6 -- deterministic under a fixed seed; a different seed diverges', () => {
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

	// Seeds and their expected sequences were computed directly from
	// src/sim/rules/rng.ts's own algorithm (a scratch Node harness, verified
	// at implementation time) -- never guessed. Seed 0 was rejected for the
	// PRIMARY seed specifically because it draws [top_1, top_1, top_1] (all
	// three the SAME lane), which AC 6 explicitly forbids as the pinned case.
	// [CORRECTED 2026-09-06, code review] This comment previously named
	// [top_3, top_3, top_3]. Seed 0's first three bound-3 draws are indices
	// 0,0,0 -- lane index 0 is `top_1`, not `top_3` -- re-derived here from
	// the shipped `nextRng`/`nextRngInt` and agreeing with the three other
	// artifacts that record it (`src/host/game-seed.ts`'s header, spec task
	// 22, and DW-201's own ledger evidence line, all of which say index 0).
	// Only the lane NAME was wrong; the "all three the same lane" half --
	// the reason seed 0 is unusable here -- was and is correct.
	const SEED = 12345;
	const EXPECTED_SEQUENCE: readonly LaneName[] = ['top_3', 'top_1', 'top_2'];
	const OTHER_SEED = 42;
	const OTHER_SEQUENCE: readonly LaneName[] = ['top_2', 'top_2', 'top_3'];

	it(`seed ${SEED}: the recorded sequence is pinned literally, replays identically twice, and is not all three draws the same lane`, () => {
		const first = threeBallDrawSequence(SEED);
		const second = threeBallDrawSequence(SEED);

		expect(first, 'the pinned sequence for this seed').toEqual(EXPECTED_SEQUENCE);
		expect(second, 'replaying the identical script from the identical seed must reproduce the identical sequence').toEqual(first);
		expect(new Set(first).size, 'not all three draws may be the same lane').toBeGreaterThan(1);
	});

	it(`seed ${OTHER_SEED}: a different seed produces a genuinely different sequence`, () => {
		const other = threeBallDrawSequence(OTHER_SEED);
		expect(other).toEqual(OTHER_SEQUENCE);
		expect(other).not.toEqual(EXPECTED_SEQUENCE);
	});
});
