// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.6 -- the DMD's pure composition layer. Every English display
// literal in this whole simulation lives HERE and nowhere under `sim/**`
// (AD-9, Consistency Conventions: "No i18n scaffolding: English literals
// live in `presentation/backglass` only"). Two pure functions:
// `advanceBackglass()` folds one `FrameOutput` into the next `BackglassView`
// (screen choice, the Attract cycle, the end-of-ball hold), and
// `renderFrame()` turns a `BackglassView` plus the CURRENT `Snapshot` into a
// `DmdFrame` -- plain rows of text at dot positions, no Babylon, no canvas,
// nothing that could throw on a malformed input (I/O & Edge-Case Matrix:
// every row here is "no error expected").
//
// AD-9's payload-complete rule, applied literally: the end-of-ball screen
// reads WHO from `event.player` (the payload), never from
// `snapshot.game.currentPlayer` (which has already rotated to the NEXT
// player by the time this same-tick snapshot arrives -- Design Notes, "AC
// 3's disagreement is real"). It reads the ENDING player's score from the
// SAME snapshot's `players[event.player].score` -- that is reading
// player-scoped state off the snapshot that ACCOMPANIES this event, not
// joining the event to a LATER snapshot, so AD-9's "never joins a tick-t
// event to a later snapshot" is not in tension with it.

import { ticksToMs, TICK_HZ } from '../../sim/contracts/time';
import type { BallEndedEvent } from '../../sim/contracts/events';
import type { ModeView } from '../../sim/contracts/mode-view';
import type { FrameOutput, GameState, Snapshot } from '../../sim/table/names';

function isBallEndedEvent(event: { readonly type: string }): event is BallEndedEvent {
	return event.type === 'ball_ended';
}

/** The DMD's physical dot grid -- 128 columns by 32 rows, the shape `raster.ts` rasterises into. */
export const DMD_COLS = 128;
export const DMD_ROWS = 32;

/**
 * One line of text at a dot position.
 *
 * `emphasis` flags the current player's score row. **It is a contract field
 * only: nothing renders it yet.** `rasterise()` reads `text`, `col` and `row`
 * and ignores `emphasis`, and the dot buffer is 1-bit, so on the real panel
 * the current player's row is currently indistinguishable from the others.
 * How to express emphasis on a 1-bit dot grid (invert the line, a leading
 * marker glyph, a brighter amber) is a display-design decision recorded in
 * the ledger for the epic's decision sheet rather than invented here -- do
 * not read this flag as "already visible" (code review, Story 2.6).
 */
export interface DmdRow {
	readonly text: string;
	readonly col: number;
	readonly row: number;
	readonly emphasis: boolean;
}

/** The closed set of screens this story's Backglass can show. Later stories ADD members (Story 2.7's ARM YOURSELF, 2.11's TILT, 2.13's final scores/Match) -- this union is a contract, not an implementation detail (Consumed-by, Rule 2). */
export type DmdScreen = 'attract_prompt' | 'attract_scores' | 'score' | 'ball_ended';

/** One rendered frame: which screen, and the rows to rasterise. */
export interface DmdFrame {
	readonly screen: DmdScreen;
	readonly rows: readonly DmdRow[];
}

/**
 * The presentation-held view state `advanceBackglass()` folds forward and
 * `renderFrame()` reads: which screen is showing, the tick at which a HELD
 * screen (end-of-ball) may next change (`null` when nothing is held), the
 * tick the current Attract cycle started counting from (reset whenever
 * Attract is freshly entered, so a later return to Attract -- Story 2.13 --
 * starts its own cycle cleanly rather than inheriting a stale phase), and
 * the end-of-ball payload frozen at the moment its event fired (read for as
 * long as that screen is held, since by the NEXT frame `snapshot.game` has
 * already moved on to the next player's ball -- AD-9).
 */
export interface BackglassView {
	readonly screen: DmdScreen;
	readonly holdUntilTick: number | null;
	readonly attractCycleOriginTick: number;
	readonly heldBallEnded: { readonly player: number; readonly score: number } | null;
}

/** The view a fresh boot (or a fresh test) starts from: the Attract prompt, nothing held, cycle counting from tick 0. */
export const INITIAL_BACKGLASS_VIEW: BackglassView = {
	screen: 'attract_prompt',
	holdUntilTick: null,
	attractCycleOriginTick: 0,
	heldBallEnded: null,
};

const msToTicks = (ms: number): number => Math.round((ms * TICK_HZ) / 1000);

/** How long the end-of-ball screen holds before the next frame may move on. */
const BALL_ENDED_HOLD_TICKS = msToTicks(3000);
/** Attract's own two-screen cycle: PRESS START, then both players' scores, then back. */
const ATTRACT_PROMPT_HOLD_TICKS = msToTicks(3000);
const ATTRACT_SCORES_HOLD_TICKS = msToTicks(3000);
const ATTRACT_CYCLE_TICKS = ATTRACT_PROMPT_HOLD_TICKS + ATTRACT_SCORES_HOLD_TICKS;

function isAttractScreen(screen: DmdScreen): boolean {
	return screen === 'attract_prompt' || screen === 'attract_scores';
}

/**
 * The Attract screen for `tick`, cycling on `ATTRACT_CYCLE_TICKS` from
 * `originTick` -- `attract_prompt` for the first half, `attract_scores` for
 * the second, wrapping (I/O Matrix: "the screen id cycles ... and wraps").
 * `hasScores` false (cold boot, `players: []`) pins the prompt for the
 * WHOLE cycle -- never an empty scores screen (I/O Matrix: "Attract at cold
 * boot").
 */
function attractScreenAt(tick: number, originTick: number, hasScores: boolean): DmdScreen {
	if (!hasScores) {
		return 'attract_prompt';
	}
	const phase = ((tick - originTick) % ATTRACT_CYCLE_TICKS + ATTRACT_CYCLE_TICKS) % ATTRACT_CYCLE_TICKS;
	return phase < ATTRACT_PROMPT_HOLD_TICKS ? 'attract_prompt' : 'attract_scores';
}

/**
 * Folds one `FrameOutput` into the next `BackglassView`. Pure: same inputs,
 * same output, no Babylon, no clock of its own -- every tick comes from
 * `input.snapshot.tick` (AD-3: `sim/`'s own tick is the only time).
 *
 * Order of decisions, each one a discriminator Rule 19's mutations target:
 * 1. A `ball_ended` event this frame always (re-)arms the hold, overriding
 *    whatever screen was showing -- reading the payload, never the snapshot
 *    (AD-9; AC 3's own sharpest case).
 * 2. Still inside a live hold: keep showing it, unchanged.
 * 3. Attract phase: cycle (or pin to the prompt with no scores).
 * 4. Anything else (`game`, `game_over`, `highscore_entry`): the score
 *    screen -- the only non-Attract, non-held screen this story's union
 *    names.
 */
export function advanceBackglass(view: BackglassView, input: FrameOutput): BackglassView {
	const tick = input.snapshot.tick;
	const game = input.snapshot.game;

	const ballEndedEvent = input.events.find(isBallEndedEvent);
	if (ballEndedEvent) {
		const player = ballEndedEvent.player;
		const score = game.players[player]?.score ?? 0;
		return {
			screen: 'ball_ended',
			holdUntilTick: tick + BALL_ENDED_HOLD_TICKS,
			attractCycleOriginTick: view.attractCycleOriginTick,
			heldBallEnded: { player, score },
		};
	}

	// A live hold is a HALF-OPEN WINDOW, not merely "tick is below the
	// deadline": the hold was armed at `holdUntilTick - BALL_ENDED_HOLD_TICKS`,
	// so a tick BELOW that lower bound is not "still holding", it is a tick
	// from a different timeline. `src/host/loop.ts`'s `reset()` (called by the
	// tuning panel's hot-apply, by replay playback and by the two dev hatches
	// in `boot.ts`) rebuilds the sim with `createLoop()`, restarting the tick
	// count at 0 while `boot.ts`'s `backglassView` survives in its closure.
	// Without the lower bound, a reset landing inside an end-of-ball hold left
	// `tick` (~0) below a `holdUntilTick` of whatever the old timeline had
	// reached, so this branch returned the stale view on every frame and the
	// DMD froze on the previous game's end-of-ball screen -- for the whole of
	// the old tick count, i.e. minutes, not the intended 3 seconds
	// (code review, Story 2.6).
	if (
		view.screen === 'ball_ended' &&
		view.holdUntilTick !== null &&
		tick < view.holdUntilTick &&
		tick >= view.holdUntilTick - BALL_ENDED_HOLD_TICKS
	) {
		return view;
	}

	if (game.phase === 'attract') {
		const originTick = isAttractScreen(view.screen) ? view.attractCycleOriginTick : tick;
		const screen = attractScreenAt(tick, originTick, game.players.length > 0);
		return { screen, holdUntilTick: null, attractCycleOriginTick: originTick, heldBallEnded: null };
	}

	return { screen: 'score', holdUntilTick: null, attractCycleOriginTick: view.attractCycleOriginTick, heldBallEnded: null };
}

const LEFT_MARGIN_COL = 2;
/** One dot row of glyph height (7) plus a one-dot gutter -- four lines fill DMD_ROWS (32) exactly. */
const LINE_PITCH_ROWS = 8;

/** `n` with thousands separators, ASCII comma only (Rule 14) -- never `toLocaleString()`, whose separator and digit set depend on the host's ICU data. */
function formatScore(n: number): string {
	const sign = n < 0 ? '-' : '';
	const digits = Math.trunc(Math.abs(n)).toString();
	return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Story 2.7: named-mode overrides, consulted BEFORE the mechanical
 * `split('_').join(' ').toUpperCase()` fallback below -- the skill shot's
 * sim id (`skill_shot`) would otherwise mechanically render `SKILL SHOT`,
 * but Story 2.6's own Design Notes name the intended text specifically:
 * "`ARM YOURSELF` on the plunge, from the skill-shot `ModeView`". Naming the
 * sim mode `arm_yourself` instead would also render correctly with zero
 * change here, but would put the English phrase into `sim/` -- this table is
 * the alternative that keeps it here, per the Consistency Conventions
 * ("English literals live in `presentation/backglass` only").
 */
const MODE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
	skill_shot: 'ARM YOURSELF',
};

/** `snake_case` mode id -> `UPPER CASE WORDS` display text -- the only place a mode's name becomes English (AD-9: "rules never format text"). */
function modeDisplayName(mode: string): string {
	return MODE_DISPLAY_NAMES[mode] ?? mode.split('_').join(' ').toUpperCase();
}

/** Ticks -> seconds, one decimal place, via `TICK_HZ` (never a re-derived constant -- AD-3). */
function formatSecondsFromTicks(ticks: number): string {
	return (ticksToMs(ticks) / 1000).toFixed(1);
}

/** The active mode with the HIGHEST `priority` (AD-8), read through a `readonly ModeView[]` annotation -- `GameState.modes` is `readonly ActiveModeState[]`, structurally assignable with no cast (Code Map, mode-view.ts), and it is this annotation alone that narrows `timerTicks` etc. to `number | undefined` instead of `unknown`. */
function selectTopMode(state: GameState): ModeView | undefined {
	const modes: readonly ModeView[] = state.modes;
	let top: ModeView | undefined;
	for (const mode of modes) {
		if (!top || mode.priority > top.priority) {
			top = mode;
		}
	}
	return top;
}

/**
 * One row for the mode's name, then ONE ROW PER PUBLISHED FIELD -- never a
 * row for a field the mode did not set (I/O Matrix: "Mode publishes a
 * subset ... absent fields produce no row and no placeholder"). `charge`
 * and `strikesRemaining` are shown as plain numbers; `timerTicks` is the
 * only field converted (ticks are never a display unit).
 */
function buildModeRows(mode: ModeView, startLine: number): DmdRow[] {
	const rows: DmdRow[] = [{ text: modeDisplayName(mode.mode), col: LEFT_MARGIN_COL, row: startLine * LINE_PITCH_ROWS, emphasis: false }];
	let line = startLine + 1;
	if (mode.timerTicks !== undefined) {
		rows.push({ text: formatSecondsFromTicks(mode.timerTicks), col: LEFT_MARGIN_COL, row: line * LINE_PITCH_ROWS, emphasis: false });
		line += 1;
	}
	if (mode.value !== undefined) {
		rows.push({ text: String(mode.value), col: LEFT_MARGIN_COL, row: line * LINE_PITCH_ROWS, emphasis: false });
		line += 1;
	}
	if (mode.charge !== undefined) {
		rows.push({ text: String(mode.charge), col: LEFT_MARGIN_COL, row: line * LINE_PITCH_ROWS, emphasis: false });
		line += 1;
	}
	if (mode.strikesRemaining !== undefined) {
		rows.push({ text: String(mode.strikesRemaining), col: LEFT_MARGIN_COL, row: line * LINE_PITCH_ROWS, emphasis: false });
		line += 1;
	}
	return rows;
}

/** AC 2: every player's score, the row at `currentPlayer`'s index flagged, then `BALL <n>` for the current player's `ballNumber`, then the top mode's rows (AC 5) if any mode is active. */
function buildScoreRows(state: GameState): DmdRow[] {
	const rows: DmdRow[] = state.players.map((player, index) => ({
		text: formatScore(player.score),
		col: LEFT_MARGIN_COL,
		row: index * LINE_PITCH_ROWS,
		emphasis: index === state.currentPlayer,
	}));

	const current = state.players[state.currentPlayer];
	let nextLine = state.players.length;
	if (current) {
		rows.push({ text: `BALL ${current.ballNumber}`, col: LEFT_MARGIN_COL, row: nextLine * LINE_PITCH_ROWS, emphasis: false });
		nextLine += 1;
	}

	const topMode = selectTopMode(state);
	if (topMode) {
		rows.push(...buildModeRows(topMode, nextLine));
	}

	return rows;
}

/** Both players' scores, no highlighting (Attract has no "current player"). Never called with an empty `players[]` in production -- `advanceBackglass()` never selects `attract_scores` for a scoreless machine -- but returns no rows rather than an empty score row if it ever is. */
function buildAttractScoresRows(players: GameState['players']): DmdRow[] {
	return players.map((player, index) => ({
		text: formatScore(player.score),
		col: LEFT_MARGIN_COL,
		row: index * LINE_PITCH_ROWS,
		emphasis: false,
	}));
}

/** The frozen end-of-ball payload: `PLAYER <n+1>` (1-indexed for display, AC 3) then the ending player's own score, read off the SAME snapshot the event arrived with (captured by `advanceBackglass()`, never re-derived here). */
function buildBallEndedRows(held: { readonly player: number; readonly score: number }): DmdRow[] {
	return [
		{ text: `PLAYER ${held.player + 1}`, col: LEFT_MARGIN_COL, row: 0, emphasis: false },
		{ text: formatScore(held.score), col: LEFT_MARGIN_COL, row: LINE_PITCH_ROWS, emphasis: false },
	];
}

/**
 * Turns `view` plus the CURRENT `snapshot` into a `DmdFrame`. Pure, and
 * never throws (I/O Matrix: every row here is "no error expected") --
 * `raster.ts` is what clamps and bounds-checks the result.
 */
export function renderFrame(view: BackglassView, snapshot: Snapshot): DmdFrame {
	switch (view.screen) {
		case 'attract_prompt':
			return { screen: 'attract_prompt', rows: [{ text: 'PRESS START', col: LEFT_MARGIN_COL, row: 0, emphasis: false }] };
		case 'attract_scores':
			return { screen: 'attract_scores', rows: buildAttractScoresRows(snapshot.game.players) };
		case 'ball_ended':
			return { screen: 'ball_ended', rows: view.heldBallEnded ? buildBallEndedRows(view.heldBallEnded) : [] };
		case 'score':
			return { screen: 'score', rows: buildScoreRows(snapshot.game) };
		default: {
			// `DmdScreen` is a GROWTH CONTRACT (see its own doc comment): Stories
			// 2.7, 2.11 and 2.13 each add a member. A bare `default:` would let
			// every one of those additions compile clean and silently render as
			// the score screen -- the exact "reaching around the union" the
			// Consumed-by note forbids. This `never` binding turns each future
			// addition into a compile error HERE, at the one place that must be
			// updated, while the runtime fallback keeps `renderFrame()`'s
			// documented "never throws" promise (code review, Story 2.6).
			// NOTE: `advanceBackglass()`'s documented `game_over` /
			// `highscore_entry` fallthrough is unaffected -- that fallthrough
			// lives in the PHASE switch there, not in this SCREEN switch.
			const unhandledScreen: never = view.screen;
			void unhandledScreen;
			return { screen: 'score', rows: buildScoreRows(snapshot.game) };
		}
	}
}
