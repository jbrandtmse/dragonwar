// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-7: GameState is one plain-data tree with fixed ownership scopes, no
// class instances or closures, JSON-serializable (it is hashed -- AD-15 --
// and embedded in ReplayHeader via GameStart). Mutated only inside
// `rules.step`. This file is table-free (AD-1): device-naming fields are
// generic over the relevant name union, bound to TABLE only in
// sim/table/names.ts.
//
// The top-level field list below (`tick`, `phase`, `machine`, `players`,
// `currentPlayer`, `modes`, `rng`) is AD-7's own binding rule text. The
// internal shape of each sub-tree is this story's reasonable rendering of
// the scopes AD-7's ER diagram and prose name for it (score, letters, lock
// credits, tilt warnings, bonus, lanes, jackpot seed, extra balls, modes
// played, Wars started for players; ballsInPlay, hardwareEnabled, ballSave,
// tilt, multiball, highscores, device slot states for the machine) -- none of
// it is Epic 2+ mode content, and every mode's own fields stay opaque here
// per AD-7 ("mode-local... published to presentation only as its typed
// ModeView").

/**
 * The closed top-level phases AD-5/AD-14 name: the pre-game walk-up
 * (`attract`), an active game, the cabinet-switch-driven initials entry after
 * a qualifying score (`highscore_entry`, AD-14), and the post-game state
 * before the next Attract cycle (`game_over`, AD-5).
 */
export type GamePhase = 'attract' | 'game' | 'highscore_entry' | 'game_over';

/** One recorded high score, read-only inside `sim/` and supplied only via `GameStart` (AD-14). */
export interface HighscoreEntry {
	readonly initials: string;
	readonly score: number;
}

/**
 * Ball save is one machine device owned by the ball controller (AD-18):
 * sources stack and the longest live window wins. `untilTick` is `null` when
 * disarmed.
 */
export interface BallSaveState {
	readonly untilTick: number | null;
	readonly sources: readonly string[];
}

/**
 * Machine-wide Tilt/slam condition (AD-5, AD-7): distinct from a player's own
 * `tiltWarnings` count. Tilt disables hardware and ball save together
 * (AD-5, AD-18); the tilt bob is never reset by command, only its physical
 * decay plus `tiltSettleMs` settles it (AD-7).
 */
export interface TiltState {
	readonly tilted: boolean;
	readonly slamTilted: boolean;
}

/**
 * Machine-scoped state (AD-7): device slot states and `ballsInPlay`,
 * `hardwareEnabled`, `ballSave`, `tilt`, `multiball`, `highscores`.
 * `deviceSlots` is generic over `BallDeviceName`: for each ball device, the
 * closed state of its slots in the fill order `TABLE.ballDevices[*].slots`
 * declares (AD-6: "device counts... are the number of closed slot switches
 * and nothing else").
 */
export interface MachineState<TBallDevice extends string = string> {
	readonly ballsInPlay: number;
	readonly hardwareEnabled: boolean;
	readonly ballSave: BallSaveState;
	readonly tilt: TiltState;
	/** `null` unless the `_starting` phase of Quick multiball or the War has set it; cleared only in their `_stopped` phase (AD-18). */
	readonly multiball: 'quickmb' | 'war' | null;
	readonly highscores: readonly HighscoreEntry[];
	readonly deviceSlots: Readonly<Record<TBallDevice, readonly boolean[]>>;
}

/**
 * Story 2.10, PRD FR-20: the closed bonus-category vocabulary -- DRAGON
 * letters, the two Loops, and the War's Strikes (Epic 3, `strikes` seeded 0
 * all epic since nothing in Epic 2 produces one -- `sim/rules/bonus.ts`'s
 * own header). One definition; `sim/rules/bonus.ts` is the only file that
 * ever writes a value under one of these keys.
 */
export type BonusCategory = 'letters' | 'loops' | 'strikes';

/** Player-scoped bonus accounting (AD-7/AD-9: "bonus by category and multiplier"). A TOTAL record over `BonusCategory` (Story 2.10) -- every category is always present, so a typo'd key is a `pnpm typecheck` failure rather than a silently-ignored one, and the bonus total's own Σ is exhaustive by construction. */
export interface PlayerBonusState {
	readonly byCategory: Readonly<Record<BonusCategory, number>>;
	readonly multiplier: number;
}

/** Player-scoped lane state (AD-7: "lanes (lit flags and completed sets, owned by the base mode)"). */
export interface PlayerLaneState {
	readonly lit: Readonly<Record<string, boolean>>;
	readonly completedSets: readonly string[];
}

/**
 * Story 3.4 (AD-7, AD-18): the three campaign Modes, by their
 * `MODE_PRIORITIES` names (`sim/rules/modes/priorities.ts`). Campaign order
 * is declared once, in `sim/rules/modes/campaign.ts`. Declared HERE rather
 * than in `./events.ts` because `PlayerState.modesLit` below needs it and
 * `./events.ts` already imports this file (a type-only import back would be
 * a cycle `no-circular` rejects); `./events.ts` re-exports it, so both
 * modules name the one type.
 */
export type CampaignModeName = 'hurryup' | 'quickmb' | 'joust';

/**
 * Player-scoped state (AD-7): score, DRAGON letters, Lock credits, modes
 * played, tilt warnings, bonus by category and multiplier, extra balls,
 * lanes, Jackpot seed and Wars started.
 */
export interface PlayerState {
	/** Story 3.0a (AD-8): a mode adds to it only through `sim/rules/scoring.ts`'s `awardScore()`; the one other writer is the ball controller's drain-tick bonus. */
	readonly score: number;
	/** The DRAGON letters spelled so far, in the order each was first struck (e.g. `"DRA"`). Each letter at most once; persists across balls (Story 3.0a, DW-283: `sim/rules/scoring.ts`'s `addDragonLetters()`). */
	readonly letters: string;
	readonly lockCredits: number;
	readonly tiltWarnings: number;
	readonly bonus: PlayerBonusState;
	readonly lanes: PlayerLaneState;
	readonly extraBalls: number;
	readonly jackpotSeed: number;
	readonly warsStarted: number;
	/**
	 * Story 3.4 (AD-7, DW-293): the append-only log of this player's campaign
	 * Mode starts this game, one name per start, repeats allowed -- written
	 * only by `sim/rules/modes/campaign.ts`'s `startCampaignMode()`, on each
	 * `mode_<campaign>_started`. The ball end no longer credits anything
	 * here, so `base` and `skill_shot` never appear. Story 3.10 reads "all
	 * three Modes played" from it.
	 */
	readonly modesPlayed: readonly string[];
	/**
	 * Story 3.4 (AD-7, FR-33): the campaign Modes lit for this player and not
	 * yet started, in the order they were lit. The base mode appends one on
	 * each Ramp completion (`shot_ramp_made`, behind `scoringOpen()`);
	 * `startCampaignMode()` removes a Mode when it starts. Persists across
	 * balls, like `lockCredits`.
	 */
	readonly modesLit: readonly CampaignModeName[];
	/**
	 * Story 2.5: the ball number currently (or most recently) in play for
	 * THIS player, 1-indexed -- `0` before their first ball has started.
	 * Incremented by the ball controller every time `ball_will_start` starts
	 * a ball for them (AD-18: the ball controller alone owns the lifecycle),
	 * and is what `GameStart.adjustments.ballsPerGame` (AD-14) is compared
	 * against to decide "the last player's last ball" (AC 6). Necessarily
	 * player-scoped (AD-7): Hot seat lets each player be on a different ball
	 * number relative to the OTHERS only in the sense that this field, not a
	 * single game-wide counter, is what the rotation and game-over checks
	 * read.
	 */
	readonly ballNumber: number;
}

/**
 * Mode-local state (AD-7): each active mode owns its own timers and counters,
 * published to presentation only as its typed `ModeView` (contracts/mode-view.ts)
 * -- so this contract states only the fields every mode carries (its name,
 * stacking priority and the player it belongs to) and leaves the rest open.
 * `modes` is empty between balls (AD-7).
 */
export interface ActiveModeState {
	readonly mode: string;
	readonly priority: number;
	readonly player: number;
	readonly [key: string]: unknown;
}

/**
 * The seeded PRNG state all rules randomness draws from (AD-3) -- Match, the
 * skill-shot lane, and no other source. Physics has no randomness of its own
 * in the default (`scatter: 0`) configuration; if ever enabled it draws from
 * a second, physics-scoped seeded PRNG that is not part of `GameState`
 * (AD-3). A single opaque numeric state is sufficient for a deterministic,
 * JSON-serializable generator and is what the replay header's `physicsSeed`
 * seeds independently of this one.
 */
export type RngState = number;

/**
 * `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }`
 * (AD-7's own rule text, binding). Plain data, JSON-serializable, no class
 * instances or closures; mutated only inside `rules.step`.
 */
export interface GameState<TBallDevice extends string = string> {
	readonly tick: number;
	readonly phase: GamePhase;
	readonly machine: MachineState<TBallDevice>;
	readonly players: readonly PlayerState[];
	readonly currentPlayer: number;
	readonly modes: readonly ActiveModeState[];
	readonly rng: RngState;
}
