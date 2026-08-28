// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-14, AD-15: GameStart is the one bundle host hands sim/loop at game
// start; a replay is ReplayHeader + InputTransition[] and must reproduce the
// state hash. Table-free (AD-1): `tuning` is generic rather than importing
// `sim/table/tuning.ts`'s resolved shape, so `sim/table/names.ts` can bind it
// without this file ever depending on the table.

import type { InputTransition } from './input';
import type { HighscoreEntry } from './state';

/**
 * Sim adjustments (AD-14): the player-tunable subset that layers table
 * defaults -> preset (deferred) -> player overrides and applies at the next
 * game. AD-14's own rule text names exactly these four.
 */
export interface GameAdjustments {
	readonly pitchDeg: number;
	readonly tiltWarnings: number;
	readonly ballsPerGame: number;
	readonly matchProbability: number;
}

/**
 * `{ seed, tuning, adjustments, highscores }` (Seam Contracts table): the one
 * bundle the host hands `sim/loop` at game start (AD-14). `TTuning` is the
 * resolved tuning set's type, bound to `sim/table/tuning.ts`'s
 * `ResolveTuningResult` by `sim/table/names.ts`.
 */
export interface GameStart<TTuning = unknown> {
	readonly seed: number;
	readonly tuning: TTuning;
	readonly adjustments: GameAdjustments;
	readonly highscores: readonly HighscoreEntry[];
}

/**
 * The whole `GameStart` embedded, not hashed, plus the physics-side seed and
 * the identity of everything else a replay must reproduce against (AD-15).
 */
export interface ReplayHeader<TTuning = unknown> {
	readonly gameStart: GameStart<TTuning>;
	readonly physicsSeed: number;
	readonly tickHz: number;
	readonly tableHash: string;
	readonly assetHash: string;
	readonly physicsVersion: string;
}

/** `ReplayHeader + InputTransition[]` (AD-15): must reproduce the state hash. */
export interface Replay<TTuning = unknown> {
	readonly header: ReplayHeader<TTuning>;
	readonly transitions: readonly InputTransition[];
}
