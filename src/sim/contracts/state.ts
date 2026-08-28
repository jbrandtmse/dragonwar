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

/** Player-scoped bonus accounting (AD-7/AD-9: "bonus by category and multiplier"). */
export interface PlayerBonusState {
	readonly byCategory: Readonly<Record<string, number>>;
	readonly multiplier: number;
}

/** Player-scoped lane state (AD-7: "lanes (lit flags and completed sets, owned by the base mode)"). */
export interface PlayerLaneState {
	readonly lit: Readonly<Record<string, boolean>>;
	readonly completedSets: readonly string[];
}

/**
 * Player-scoped state (AD-7): score, DRAGON letters, Lock credits, modes
 * played, tilt warnings, bonus by category and multiplier, extra balls,
 * lanes, Jackpot seed and Wars started.
 */
export interface PlayerState {
	readonly score: number;
	/** The DRAGON letters spelled so far, in spelling order (e.g. `"DRA"`). */
	readonly letters: string;
	readonly lockCredits: number;
	readonly tiltWarnings: number;
	readonly bonus: PlayerBonusState;
	readonly lanes: PlayerLaneState;
	readonly extraBalls: number;
	readonly jackpotSeed: number;
	readonly warsStarted: number;
	/** Names of the modes this player has played this game. */
	readonly modesPlayed: readonly string[];
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
