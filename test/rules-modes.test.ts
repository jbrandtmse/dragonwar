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
import { resolveTuning } from '../src/sim/table/tuning';
import { close, runRulesScript } from './util/switch-script';
import type { GameState, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();

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
		bonus: { byCategory: {}, multiplier: 1 },
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
	const inert: readonly SwitchName[] = ['s_shooter_lane', 's_trough_2', 's_lock_1', 's_flipper_l', 's_start', 's_tilt_bob', 's_slam_tilt'];

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
		const result = runRulesScript(script, { durationTicks: 35, initialState: attractState(seed) });
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
	// PRIMARY seed specifically because it draws [top_3, top_3, top_3] (all
	// three the SAME lane), which AC 6 explicitly forbids as the pinned case.
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
