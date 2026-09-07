// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.8: the headless tests for `lampsOf()` (AC 1, AC 6) -- driven
// directly against hand-built `GameState` fixtures (mirroring
// `test/rules-modes.test.ts`'s own AC 2-5 pattern) and through
// `runRulesScript()` (`test/util/switch-script.ts`) for the scenarios that
// need a real transition (the skill shot resolving, a lane change). No
// physics, no rendering, no `sim/loop` (AC 9, gated by
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES).
//
// Every scenario below is run TWICE: once with the base mode's `player` at
// index 0 (matching `currentPlayer`), and once with it at index 1 while
// `currentPlayer` stays 0 -- Story 2.7's own third vacuity was AD-7 player
// scoping never being exercised at a player index other than 0 (this
// story's Code Map, task 21), and `lampsOf()` must read the base mode's OWN
// `player` field, never `state.currentPlayer` and never a literal `0`.

import { describe, expect, it } from 'vitest';
import { lampsOf } from '../src/sim/rules/lamps';
import { bootDeviceSlots } from '../src/sim/rules';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning } from '../src/sim/table/tuning';
import { close, runRulesScript } from './util/switch-script';
import type { GameState } from '../src/sim/table/names';

const TUNING = resolveTuning();

/** A fresh player, test-local (mirrors `test/rules-modes.test.ts`'s own `player()`). */
function player(overrides: {
	readonly letters?: string;
	readonly lit?: Record<string, boolean>;
} = {}) {
	return {
		score: 0,
		letters: overrides.letters ?? '',
		lockCredits: 0,
		tiltWarnings: 0,
		bonus: { byCategory: {}, multiplier: 1 },
		lanes: { lit: overrides.lit ?? {}, completedSets: [] },
		extraBalls: 0,
		jackpotSeed: 0,
		warsStarted: 0,
		modesPlayed: [] as string[],
		ballNumber: 1,
	};
}

/** A mid-game `GameState`, `currentPlayer` always 0 (AD-7's own distinguishing case: the base mode's `player` is what `lampsOf()` must read, never `currentPlayer`). */
function gameState(options: {
	readonly players: readonly ReturnType<typeof player>[];
	readonly modes?: GameState['modes'];
	readonly bdLock?: readonly boolean[];
}): GameState {
	return {
		tick: 0,
		phase: 'game',
		machine: {
			ballsInPlay: 1,
			hardwareEnabled: true,
			ballSave: { untilTick: null, sources: [] },
			tilt: { tilted: false, slamTilted: false },
			multiball: null,
			highscores: [],
			deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [true], bd_lock: options.bdLock ?? [false, false, false] },
		},
		players: options.players,
		currentPlayer: 0,
		modes: options.modes ?? [],
		rng: 0,
	};
}

const ALL_OFF = { role: 'off', step: 0 } as const;

/** Every `TABLE.lamps` key, `off/0` -- the shape `lampsOf()` must return when no base mode is active. */
function allLampsOff(): Record<string, { readonly role: string; readonly step: number }> {
	const result: Record<string, { readonly role: string; readonly step: number }> = {};
	for (const name of Object.keys(TABLE.lamps)) {
		result[name] = ALL_OFF;
	}
	return result;
}

describe('lampsOf -- Attract / no base mode: every lamp is off/0, never a player read', () => {
	it('modes: [] (the boot state) -- every lamp off, players[] empty', () => {
		const state = gameState({ players: [], modes: [] });
		expect(lampsOf(state)).toEqual(allLampsOff());
	});

	it('modes: [] with a non-empty players[] (a mid-game gap between balls) -- still every lamp off, no read of players[0]', () => {
		const state = gameState({ players: [player({ letters: 'DRAGON', lit: { top_1: true } })], modes: [] });
		expect(lampsOf(state)).toEqual(allLampsOff());
	});

	// !!! DIVERGENCE FROM THE FROZEN INTENT CONTRACT -- pinned here so it is
	// visible, NOT endorsed. Code review pass 2 found that neither attract
	// test above combines `modes: []` with an OCCUPIED `bd_lock`, which is the
	// one case that separates the code from the spec:
	//   - the spec's execution task 5 says "if no base mode is on the stack,
	//     return every lamp off/0", and the frozen I/O matrix says the same
	//     twice ("Attract, no modes" -> every lamp off; "Active player is not
	//     index 0" -> "If modes[] is empty, all lamps are off");
	//   - `src/sim/rules/lamps.ts` resolves `subject.kind === 'lock'` BEFORE
	//     the `if (!player)` guard, so an occupied bd_lock projects dragon/1
	//     with no base mode on the stack. Its own comment argues this is
	//     RIGHT (the Lock is machine-scoped, AD-7) -- but `## Spec Change Log`
	//     is empty, so the deviation is undocumented.
	// It is reachable in a real game: modes are popped on ball end and
	// re-pushed one tick after `ball_starting`, and Epic 2 has no Lock
	// arbiter to eject a parked ball, so the slot stays true across that
	// window. It does NOT threaten the golden/attract argument the loop leans
	// on -- `bootDeviceSlots()` leaves bd_lock empty, and `previousLamps` is
	// seeded from the same state either way -- but that precondition was
	// unstated. Whether the code or the contract is wrong is the lead's call
	// (ledgered as a decision-pending finding); this test exists so the next
	// reader cannot mistake the divergence for an accident.
	it('modes: [] with an OCCUPIED bd_lock -- l_lock reads dragon/1 (machine-scoped, AD-7) while every other lamp is off', () => {
		const state = gameState({
			players: [player({ letters: 'DRAGON', lit: { top_1: true } })],
			modes: [],
			bdLock: [true, false, false],
		});
		const lamps = lampsOf(state);
		expect(lamps.l_lock, 'l_lock is resolved from machine.deviceSlots.bd_lock BEFORE the no-base-mode guard').toEqual({ role: 'dragon', step: 1 });
		for (const name of Object.keys(TABLE.lamps)) {
			if (name === 'l_lock') {
				continue;
			}
			expect(lamps[name as keyof typeof lamps], `${name} must still be off with no base mode on the stack`).toEqual(ALL_OFF);
		}
	});
});

/** Runs the whole scenario matrix once for `basePlayer` (0 or 1) -- `player()`'s OWN index in `state.players`, always distinct from `currentPlayer` (pinned at 0 by `gameState()` above) when `basePlayer` is 1. */
function describeMatrix(basePlayer: 0 | 1): void {
	const otherIndex = basePlayer === 0 ? 1 : 0;
	/** A players[] array of length >= basePlayer+1, with `target` at `basePlayer` and an inert filler at the other index (when basePlayer is 1) so `currentPlayer` (0) never accidentally aliases the lamp-bearing player. */
	function playersWith(target: ReturnType<typeof player>): ReturnType<typeof player>[] {
		const players: ReturnType<typeof player>[] = [];
		players[basePlayer] = target;
		players[otherIndex] = player();
		return players;
	}

	describe(`base mode player === ${basePlayer} (currentPlayer stays 0)`, () => {
		it('one lit Top lane, skill shot live -- l_top_2 is lit/2, l_top_1/l_top_3 are off', () => {
			const state = gameState({
				players: playersWith(player({ lit: { top_2: true } })),
				modes: [
					{ mode: 'base', priority: 100, player: basePlayer },
					{ mode: 'skill_shot', priority: 200, player: basePlayer, launched: true },
				],
			});
			const lamps = lampsOf(state);
			expect(lamps.l_top_2).toEqual({ role: 'lit', step: 2 });
			expect(lamps.l_top_1).toEqual(ALL_OFF);
			expect(lamps.l_top_3).toEqual(ALL_OFF);
		});

		it('same lit lane, skill shot resolved (left modes[] this step) -- l_top_2 drops to lit/1', () => {
			const initial = gameState({
				players: playersWith(player({ lit: { top_2: true } })),
				modes: [
					{ mode: 'base', priority: 100, player: basePlayer },
					{ mode: 'skill_shot', priority: 200, player: basePlayer, launched: true },
				],
			});
			// Confirm the BEFORE state is genuinely step 2 -- otherwise this test
			// could not tell a real drop from a lamp that was never step 2 at all.
			expect(lampsOf(initial).l_top_2).toEqual({ role: 'lit', step: 2 });

			const result = runRulesScript(close('s_top_2').at(1).build(), { durationTicks: 1, initialState: initial });
			const after = result.finalState;

			expect(after.modes.map((m) => m.mode)).toEqual(['base']);
			expect(after.players[basePlayer]!.lanes.lit.top_2, 'the lit flag itself survives the skill shot leaving modes[]').toBe(true);
			expect(after.players[basePlayer]!.score).toBe(TUNING.skillShotAward.value);

			const lamps = lampsOf(after);
			expect(lamps.l_top_2).toEqual({ role: 'lit', step: 1 });
		});

		it('lane change (right press) rotates the lit flag from top_2 to top_3 -- l_top_2 turns off, l_top_3 turns lit/1', () => {
			const initial = gameState({
				players: playersWith(player({ lit: { top_2: true } })),
				modes: [{ mode: 'base', priority: 100, player: basePlayer }],
			});
			expect(lampsOf(initial).l_top_2).toEqual({ role: 'lit', step: 1 });
			expect(lampsOf(initial).l_top_3).toEqual(ALL_OFF);

			const result = runRulesScript(close('s_flipper_r').at(1).build(), { durationTicks: 1, initialState: initial });
			const after = lampsOf(result.finalState);

			expect(after.l_top_2).toEqual(ALL_OFF);
			expect(after.l_top_3).toEqual({ role: 'lit', step: 1 });
		});

		it("letters 'DRA' -- l_dragon_d/r/a are dragon/1; l_dragon_g/o/n are off", () => {
			const state = gameState({ players: playersWith(player({ letters: 'DRA' })), modes: [{ mode: 'base', priority: 100, player: basePlayer }] });
			const lamps = lampsOf(state);
			expect(lamps.l_dragon_d).toEqual({ role: 'dragon', step: 1 });
			expect(lamps.l_dragon_r).toEqual({ role: 'dragon', step: 1 });
			expect(lamps.l_dragon_a).toEqual({ role: 'dragon', step: 1 });
			expect(lamps.l_dragon_g).toEqual(ALL_OFF);
			expect(lamps.l_dragon_o).toEqual(ALL_OFF);
			expect(lamps.l_dragon_n).toEqual(ALL_OFF);
		});

		it('a letter not in TABLE.dropBankWiring is ignored, never thrown -- letters carrying a stray, non-DRAGON character', () => {
			const state = gameState({ players: playersWith(player({ letters: 'DRAX' })), modes: [{ mode: 'base', priority: 100, player: basePlayer }] });
			expect(() => lampsOf(state)).not.toThrow();
			const lamps = lampsOf(state);
			expect(lamps.l_dragon_d).toEqual({ role: 'dragon', step: 1 });
			expect(lamps.l_dragon_a).toEqual({ role: 'dragon', step: 1 });
			expect(lamps.l_dragon_g).toEqual(ALL_OFF);
		});

		it('an occupied bd_lock slot -- l_lock is dragon/1, independent of which player is active', () => {
			const state = gameState({ players: playersWith(player()), modes: [{ mode: 'base', priority: 100, player: basePlayer }], bdLock: [false, true, false] });
			expect(lampsOf(state).l_lock).toEqual({ role: 'dragon', step: 1 });
		});

		it('no bd_lock slot occupied -- l_lock is off', () => {
			const state = gameState({ players: playersWith(player()), modes: [{ mode: 'base', priority: 100, player: basePlayer }], bdLock: [false, false, false] });
			expect(lampsOf(state).l_lock).toEqual(ALL_OFF);
		});

		it('a lit inlane/outlane lamp is lit/1 always -- the step-2 promotion is exclusive to the Top set (AC 6)', () => {
			const state = gameState({
				players: playersWith(player({ lit: { inlane_l: true } })),
				modes: [
					{ mode: 'base', priority: 100, player: basePlayer },
					{ mode: 'skill_shot', priority: 200, player: basePlayer, launched: true },
				],
			});
			expect(lampsOf(state).l_inlane_l).toEqual({ role: 'lit', step: 1 });
		});

		it('AC 6 composite: lit Top lane (step 2 while armed), lit inlane, letters DRA, occupied Lock -- everything else off', () => {
			const state = gameState({
				players: playersWith(player({ lit: { top_1: true, inlane_r: true }, letters: 'DRA' })),
				modes: [
					{ mode: 'base', priority: 100, player: basePlayer },
					{ mode: 'skill_shot', priority: 200, player: basePlayer, launched: true },
				],
				bdLock: [true, false, false],
			});
			const lamps = lampsOf(state);
			expect(lamps.l_top_1).toEqual({ role: 'lit', step: 2 });
			expect(lamps.l_inlane_r).toEqual({ role: 'lit', step: 1 });
			expect(lamps.l_dragon_d).toEqual({ role: 'dragon', step: 1 });
			expect(lamps.l_dragon_r).toEqual({ role: 'dragon', step: 1 });
			expect(lamps.l_dragon_a).toEqual({ role: 'dragon', step: 1 });
			expect(lamps.l_lock).toEqual({ role: 'dragon', step: 1 });
			// Everything else this scenario did not light is off. Code review
			// pass 3 (acceptance-auditor, DW-149): DERIVED from
			// `Object.keys(TABLE.lamps)` minus the lamps asserted above, never
			// a second hand-typed lamp list -- Story 2.9 adds `l_ball_save` to
			// `TABLE.lamps`, and against the old literal array it would have
			// joined the projection without joining this assertion. The same
			// file's own `allLampsOff()` already used this idiom.
			const litHere = new Set(['l_top_1', 'l_inlane_r', 'l_dragon_d', 'l_dragon_r', 'l_dragon_a', 'l_lock']);
			const restOff = Object.keys(TABLE.lamps).filter((name) => !litHere.has(name));
			expect(restOff.length, 'the derived "everything else" set must not be empty, or this assertion proves nothing').toBeGreaterThan(0);
			for (const name of restOff) {
				expect(lamps[name as keyof typeof lamps], `${name} was not lit by this scenario and must read off/0`).toEqual(ALL_OFF);
			}
		});
	});
}

describeMatrix(0);
describeMatrix(1);

// Code review pass 3 (blind-hunter, Rule 19). `src/sim/rules/lamps.ts`'s own
// header rests two load-bearing arguments on ONE unstated-until-now
// precondition -- that `bootDeviceSlots()` leaves `bd_lock` empty:
//   (a) the golden argument ("every lamp really is off/0 throughout all
//       five"), which is why this story's refresh is header-only; and
//   (b) `sim/loop/index.ts`'s `previousLamps = lampsOf(state)` boot seed,
//       which agrees with `syncLamps()`'s own "absent means off" default
//       ONLY while the boot projection is all-off. A lamp already ON in the
//       boot projection would never be transmitted to presentation at all,
//       because the diff has nothing to report and the view starts empty.
// The precondition was written in prose and enforced by nothing.
describe('lampsOf -- the boot precondition both the golden argument and the loop seed rest on', () => {
	it('bootDeviceSlots() leaves every bd_lock slot empty, so the boot projection really is all-off', () => {
		const slots = bootDeviceSlots();
		expect(slots.bd_lock.some((slot) => slot === true), 'a ball device that starts FULL at boot would light l_lock in the boot projection -- which sim/loop seeds previousLamps from, so that lamp would never produce a command and presentation would show it off forever').toBe(false);
		expect(lampsOf(gameState({ modes: [], players: [], bdLock: [...slots.bd_lock] as boolean[] })), 'the boot projection must be all-off').toEqual(allLampsOff());
	});
});

// Code review pass 3 (blind-hunter). `epics.md` Story 2.8's AC 5 says "the
// skill-shot lane blinks at step 2" -- SINGULAR. `lampsOf()` promotes EVERY
// lit Top lane to step 2 whenever a `skill_shot` mode is anywhere on the
// stack; it reads the mode's presence, never which lane it drew. That is
// correct TODAY only because the base mode clears the lit set at ball start
// and any Top-lane closure resolves the skill shot in the same step, so at
// most one Top lane is ever lit while the skill shot is live -- an invariant
// that lives in `src/sim/rules/modes/skill-shot.ts` and was stated in
// `lamps.ts` and in no test. Story 2.14 (the lit-Top-lane rotation) and the
// still-open DW-204 both land on exactly this coupling, so it is pinned
// here, visibly, rather than left to be rediscovered.
describe('lampsOf -- the step-2 promotion is per-STACK, not per-lane (a coupling Story 2.14 lands on)', () => {
	it('two lit Top lanes with skill_shot on the stack: BOTH read step 2 -- pinned as the current behaviour, NOT endorsed as the AC wording', () => {
		const state = gameState({
			players: [player({ lit: { top_1: true, top_3: true } })],
			modes: [
				{ mode: 'base', priority: 100, player: 0 },
				{ mode: 'skill_shot', priority: 200, player: 0, launched: true },
			],
		});
		const lamps = lampsOf(state);
		expect(lamps.l_top_1, 'l_top_1 reads step 2').toEqual({ role: 'lit', step: 2 });
		expect(lamps.l_top_3, "l_top_3 ALSO reads step 2 -- lampsOf() reads the skill shot PRESENCE, never the lane it drew. epics.md AC 5 says the skill-shot lane (singular); the two agree only while at most one Top lane can be lit during a live skill shot, which is an invariant of skill-shot.ts and not of this module").toEqual({ role: 'lit', step: 2 });
		// The non-Top lit set is unaffected by the skill shot either way.
		expect(lamps.l_top_2).toEqual(ALL_OFF);
	});
});

describe('lampsOf -- purity and stability', () => {
	it('two calls against the same state produce a structurally-equal (though not necessarily reference-equal) projection', () => {
		const state = gameState({ players: [player({ lit: { top_1: true } })], modes: [{ mode: 'base', priority: 100, player: 0 }] });
		expect(lampsOf(state)).toEqual(lampsOf(state));
	});

	it('every TABLE.lamps key is present in the returned LampState, and no extra key is', () => {
		const state = gameState({ players: [], modes: [] });
		expect(Object.keys(lampsOf(state)).sort()).toEqual(Object.keys(TABLE.lamps).sort());
	});
});
