// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.6 -- a small shared Snapshot/GameState factory for test/**'s
// presentation-tier tests (Design Notes, "No shared snapshot factory
// exists"): `test/util/switch-script.ts`'s `DEFAULT_INITIAL_STATE` is not
// exported, and `test/ball-render.test.ts`'s `BASE_GAME_STATE` /
// `buildSnapshot()` are file-local. Device-name literals are unrestricted
// under `test/**` (`boundary-lint`'s device-name check exempts it), and this
// file is never imported from `src/`.
//
// The bound `Snapshot` requires all three ball devices present in
// `mechanisms.devices` and in `machine.deviceSlots`; `dropTargets` and
// `spinner` are string-keyed records, so `{}` is legal for both.

import { TABLE } from '../../src/sim/table/dragonwar';
import type { PlayerState } from '../../src/sim/contracts/state';
import type { GameState, Snapshot } from '../../src/sim/table/names';

/** A fresh Attract-phase GameState with no players -- the same shape `sim/loop/index.ts` boots with. */
export const BASE_GAME_STATE: GameState = {
	tick: 0,
	phase: 'attract',
	machine: {
		ballsInPlay: 0,
		hardwareEnabled: true,
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

/** One player at neutral defaults, overridden per test (score, ballNumber, ...). */
export function buildPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
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
		ballNumber: 0,
		...overrides,
	};
}

/** A full Snapshot: `BASE_GAME_STATE`'s attract-phase game, every ball device present and empty, `TABLE.reference.pitchDeg` -- override `game` (and anything else) per test. */
export function buildSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
	return {
		tick: 0,
		balls: [],
		mechanisms: {
			flippers: { l: { angleDeg: 0, angularVelDegPerSec: 0 }, r: { angleDeg: 0, angularVelDegPerSec: 0 } },
			plunger: { posMm: 0, holdTicks: 0 },
			dropTargets: {},
			spinner: {},
			devices: { bd_trough: { slots: [true, true, true, true] }, bd_shooter: { slots: [false] }, bd_lock: { slots: [false, false, false] } },
		},
		game: BASE_GAME_STATE,
		effectivePitchDeg: TABLE.reference.pitchDeg,
		...overrides,
	};
}
