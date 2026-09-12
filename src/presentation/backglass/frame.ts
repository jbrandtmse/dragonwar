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
import type { BallEndedEvent, BonusCountStepEvent, MatchDrawnEvent, MatchRevealStepEvent, TiltWarningEvent } from '../../sim/contracts/events';
import type { InputAction } from '../../sim/contracts/input';
import type { ModeView } from '../../sim/contracts/mode-view';
import type { FrameOutput, GameState, Snapshot } from '../../sim/table/names';
import { GLYPH_ADVANCE } from './font';
import { EMPTY_VIEW_CONFIG, type ViewConfig } from './view-config';

function isBallEndedEvent(event: { readonly type: string }): event is BallEndedEvent {
	return event.type === 'ball_ended';
}

/** Story 2.10 (AD-9): the end-of-ball count-up's own step event -- `advanceBackglass()`'s hold branch folds these into `heldBallEnded.bonusRunning`, never joining to a later snapshot. */
function isBonusCountStepEvent(event: { readonly type: string }): event is BonusCountStepEvent {
	return event.type === 'bonus_count_step';
}

/** Story 2.11 (AD-9): the transient tilt-warning event -- `advanceBackglass()` arms the `tilt_warning` screen from this alone, never from `players[i].tiltWarnings` (AC 9's own control). */
function isTiltWarningEvent(event: { readonly type: string }): event is TiltWarningEvent {
	return event.type === 'tilt_warning';
}

/** Story 2.13 (AD-9): the Match draw -- `foldMatchEvents()` below reads `winners` from this alone, never re-deriving it from `number` and a snapshot. */
function isMatchDrawnEvent(event: { readonly type: string }): event is MatchDrawnEvent {
	return event.type === 'match_drawn';
}

/** Story 2.13 (AD-9): one paced reveal step -- the Backglass shows only `shown`, never `match_drawn.number` itself (the "never reveals early" rule). */
function isMatchRevealStepEvent(event: { readonly type: string }): event is MatchRevealStepEvent {
	return event.type === 'match_reveal_step';
}

/** The DMD's physical dot grid -- 128 columns by 32 rows, the shape `raster.ts` rasterises into. */
export const DMD_COLS = 128;
export const DMD_ROWS = 32;

/**
 * One line of text at a dot position.
 *
 * `emphasis` flags the current player's score row. Story 2.13 (DW-198):
 * `raster.ts`'s `rasterise()` now RENDERS it, as inverse video over the
 * row's own text box (computed from that row's own glyph mask) -- the
 * current player's row is genuinely distinguishable from the others on the
 * real, 1-bit panel. `frame.ts` itself still only DECIDES which rows carry
 * it (the score screen's current-player row; never the `game_over` screen's
 * players block, which shows no emphasis at all) -- rendering it stays
 * `raster.ts`'s sole job.
 */
export interface DmdRow {
	readonly text: string;
	readonly col: number;
	readonly row: number;
	readonly emphasis: boolean;
}

/**
 * The closed set of screens the Backglass can show. Later stories ADD
 * members (Story 2.11 added 'tilt_warning' and 'tilt') -- this union is a
 * contract, not an implementation detail (Consumed-by, Rule 2). Story 2.7's
 * ARM YOURSELF shipped as a ROW label on the score screen, not as a screen.
 *
 * Story 2.13: 'attract_keys' is the keys screen every fresh Attract entry
 * opens with, for `ATTRACT_KEYS_HOLD_TICKS` (built from a host-supplied
 * `ViewConfig`, `renderFrame()`'s new third argument); 'game_over' is the
 * final-scores/Match screen `game_over` phase now shows, instead of falling
 * through to 'score' the way it used to (this union's own `never`-guarded
 * default in `renderFrame()` is what forces every new member to be handled
 * here, not silently rendered as the score screen).
 */
export type DmdScreen = 'attract_prompt' | 'attract_scores' | 'attract_keys' | 'score' | 'ball_ended' | 'tilt_warning' | 'tilt' | 'game_over';

/** One rendered frame: which screen, and the rows to rasterise. */
export interface DmdFrame {
	readonly screen: DmdScreen;
	readonly rows: readonly DmdRow[];
}

/**
 * Story 2.13 (AD-9): the game-over sequence's own held payload -- folded
 * incrementally from `match_drawn`/`match_reveal_step` events, exactly the
 * pattern `heldBallEnded`'s own `bonusRunning` already uses for the count-up
 * (never re-derived from a later snapshot). `shown` is `null` until the
 * first reveal step arrives (I/O Matrix: "the status line shows no number"
 * before then) -- `number` itself is deliberately NOT carried here at all,
 * so there is no field this screen COULD read early even by mistake (AD-9:
 * "the Backglass reveals only the `shown` of the steps it has received,
 * never `match_drawn.number` early"). `winners` is captured from
 * `match_drawn` alone, read only once `resolved` (the tenth step has
 * arrived) to decide MATCH-or-not.
 */
export interface HeldMatch {
	readonly shown: number | null;
	readonly resolved: boolean;
	readonly winners: readonly number[];
}

/**
 * Folds this frame's OWN `match_drawn`/`match_reveal_step` events into
 * `current` (Design Notes, `advanceBackglass()`'s order, item 2: "folding
 * this frame's `match_drawn` and `match_reveal_step` into `heldMatch`, so a
 * retuned lead-in could never lose them" -- called from BOTH the live
 * `ball_ended` hold branch and the `game_over` branch below, so a
 * hypothetically retuned `matchDelayMs` shorter than the 3 s hold still
 * accumulates correctly). Pure; `current` is never mutated.
 */
function foldMatchEvents(current: HeldMatch | null, events: FrameOutput['events']): HeldMatch | null {
	let next = current;
	for (const event of events) {
		if (isMatchDrawnEvent(event)) {
			next = { shown: next?.shown ?? null, resolved: next?.resolved ?? false, winners: event.winners };
		} else if (isMatchRevealStepEvent(event)) {
			next = { shown: event.shown, resolved: event.step >= event.steps, winners: next?.winners ?? [] };
		}
	}
	return next;
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
 *
 * Story 2.10: `heldBallEnded.bonusRunning` is `null` until the first
 * `bonus_count_step` for this hold arrives (so a zero-bonus or tilted ball
 * end -- neither of which ever emits one -- renders no BONUS row at all,
 * DW-200's own "no entry means no row" precedent), then the running
 * un-multiplied subtotal through the most recent step, ending at that
 * step's own `total` on the LAST one -- read from the event alone, per
 * AD-9, never derived from `snapshot.game.players[...].score` (which
 * already includes the bonus by the time this same-tick snapshot arrives,
 * and would still be wrong for every frame before the count-up finishes).
 *
 * Smoke rework (DW-247, reopened `by=smoke`): `pendingTiltWarning` is
 * presentation state, never `GameState` -- no golden moves. A `tilt_warning`
 * event that arrives on the SAME frame as a `ball_ended` arming, or while a
 * `ball_ended` hold is already live, sets this `true` rather than being
 * dropped: one `FrameOutput` carries every owed tick's events, and the
 * ball_ended screen's own priority (task 10's intent, kept) means the
 * warning cannot show immediately. It is consumed -- shown for a fresh
 * `TILT_WARNING_HOLD_TICKS` measured from the moment the `ball_ended` hold
 * ends, never from when the event originally arrived -- the instant the
 * hold's own end is reached, UNLESS at that moment the machine is genuinely
 * tilted (TILT supersedes) or `phase` is no longer `'game'` (the warning
 * belongs to a game that is no longer live) -- both of which drop it
 * instead. Before this fix, both the `ball_ended` arming branch and its
 * live-hold branch returned above the warning-arming check with no memory
 * of the event, so a warning landing inside a hold was swallowed for good:
 * the player never saw WARNING, and the next eligible closure could tilt
 * them with no visible warning at all (found by browser smoke, 2026-09-11).
 *
 * Code review (cycle 2): the arming branch also carries a WARNING screen
 * that is still SHOWING when a `ball_ended` arrives (DW-250 -- a drain one
 * frame after the warning otherwise cut it to ~16 ms, while the same two
 * events inside ONE `FrameOutput` were carried), and a TILTED ball end
 * inherits nothing (TILT supersedes, and `ball_will_start` clears
 * `machine.tilt` before the hold ends, so only the payload can say so).
 */
export interface BackglassView {
	readonly screen: DmdScreen;
	readonly holdUntilTick: number | null;
	readonly attractCycleOriginTick: number;
	readonly heldBallEnded: { readonly player: number; readonly score: number; readonly bonusRunning: number | null } | null;
	readonly pendingTiltWarning: boolean;
	/** Story 2.13: the game-over sequence's own held Match payload -- see `HeldMatch`'s own doc comment. `null` on every screen except the live `ball_ended` hold (accumulating ahead of time) and `game_over` itself. */
	readonly heldMatch: HeldMatch | null;
}

/** The view a fresh boot (or a fresh test) starts from: the Attract keys screen (Story 2.13), nothing held, cycle counting from tick 0. */
export const INITIAL_BACKGLASS_VIEW: BackglassView = {
	screen: 'attract_keys',
	holdUntilTick: null,
	attractCycleOriginTick: 0,
	heldBallEnded: null,
	pendingTiltWarning: false,
	heldMatch: null,
};

const msToTicks = (ms: number): number => Math.round((ms * TICK_HZ) / 1000);

/**
 * How long the end-of-ball screen holds before the next frame may move on.
 *
 * Exported since Story 2.10's code review: `bonusCountMs`'s own `source`
 * prose argues the whole count-up (at most `BONUS_CATEGORIES.length + 1` = 4
 * steps) fits inside this hold, and that argument lived only in a string.
 * `test/backglass-frame.test.ts` now pins the inequality, so retuning
 * `bonusCountMs` past the point where the count-up outlives the hold is a red
 * test rather than a silently truncated animation.
 */
export const BALL_ENDED_HOLD_TICKS = msToTicks(3000);
/**
 * Story 2.11: how long the transient tilt-warning screen holds before the
 * live view (score, or a later warning/tilt) may show again -- a
 * PRESENTATION constant, exactly like its neighbour above, never a tunable
 * (moves no golden).
 */
export const TILT_WARNING_HOLD_TICKS = msToTicks(2000);
/** Attract's own two-screen cycle: PRESS START, then both players' scores, then back. */
const ATTRACT_PROMPT_HOLD_TICKS = msToTicks(3000);
const ATTRACT_SCORES_HOLD_TICKS = msToTicks(3000);
const ATTRACT_CYCLE_TICKS = ATTRACT_PROMPT_HOLD_TICKS + ATTRACT_SCORES_HOLD_TICKS;
/**
 * Story 2.13: how long a FRESH Attract entry opens with the keys screen,
 * before the existing prompt/scores cycle takes over (Design Notes,
 * "Attract": "a presentation constant beside the Attract holds") -- never a
 * tunable (moves no golden, exactly like its two neighbours above).
 */
const ATTRACT_KEYS_HOLD_TICKS = msToTicks(3000);

/** Story 2.13: 'attract_keys' joins the two cycling screens -- `advanceBackglass()`'s Attract branch reads this to decide whether `view.attractCycleOriginTick` survives (a continuing Attract stay) or resets (a fresh entry); including the keys screen here is what stops the keys hold from restarting itself every tick it is showing. */
function isAttractScreen(screen: DmdScreen): boolean {
	return screen === 'attract_prompt' || screen === 'attract_scores' || screen === 'attract_keys';
}

/**
 * The Attract screen for `tick`, from `originTick` (E): `attract_keys` for
 * the first `ATTRACT_KEYS_HOLD_TICKS` (I/O Matrix, "Attract keys": "does not
 * return until Attract is re-entered" -- never revisited by the cycle
 * below), then the EXISTING prompt/scores cycle, now measured from
 * `originTick + ATTRACT_KEYS_HOLD_TICKS` rather than from `originTick`
 * itself. `hasScores` false (cold boot, `players: []`) pins the prompt for
 * the whole of that second phase -- never an empty scores screen (I/O
 * Matrix: "Attract at cold boot" / "cold boot shows keys, then the prompt
 * only").
 */
function attractScreenAt(tick: number, originTick: number, hasScores: boolean): DmdScreen {
	// Code review (second pass): the `tick >= originTick` lower bound is the
	// keys branch's own reset-safety, the same hazard the cycle below already
	// normalises for with its `((x % N) + N) % N`. `hostLoop.reset()` (the dev
	// tuning panel's hot-apply, replay playback, and the two dev hatches in
	// `boot.ts`) restarts the tick count at 0 while `boot.ts`'s `backglassView`
	// survives in its closure, and `advanceBackglass()`'s Attract branch
	// carries a STALE `attractCycleOriginTick` forward whenever the pre-reset
	// screen was itself an Attract screen. Without this bound every tick of the
	// old count satisfies `tick < originTick + 3000`, pinning the keys screen
	// for minutes -- verbatim the "DMD froze for the whole of the old tick
	// count" shape this file's own header warns about. A `tick` below the origin
	// can only be a restarted timeline, so it falls through to the cycle, which
	// handles a negative phase correctly.
	if (tick >= originTick && tick < originTick + ATTRACT_KEYS_HOLD_TICKS) {
		return 'attract_keys';
	}
	if (!hasScores) {
		return 'attract_prompt';
	}
	const cycleOrigin = originTick + ATTRACT_KEYS_HOLD_TICKS;
	const phase = ((tick - cycleOrigin) % ATTRACT_CYCLE_TICKS + ATTRACT_CYCLE_TICKS) % ATTRACT_CYCLE_TICKS;
	return phase < ATTRACT_PROMPT_HOLD_TICKS ? 'attract_prompt' : 'attract_scores';
}

/**
 * Folds one `FrameOutput` into the next `BackglassView`. Pure: same inputs,
 * same output, no Babylon, no clock of its own -- every tick comes from
 * `input.snapshot.tick` (AD-3: `sim/`'s own tick is the only time).
 *
 * Order of decisions, each one a discriminator Rule 19's mutations target:
 * 1. A `ball_ended` event this frame (re-)arms the hold, overriding
 *    whatever screen was showing -- reading the payload, never the snapshot
 *    (AD-9; AC 3's own sharpest case). `bonusRunning` starts `null` (Story
 *    2.10): the arming frame never carries a `bonus_count_step` itself
 *    (`ball-controller.ts`'s own schedule fires no earlier than
 *    `bonusCountTicks` ticks later), so nothing to show yet. Smoke rework
 *    (DW-247): a `tilt_warning` landing on this SAME frame (one
 *    `FrameOutput` can carry both) is not dropped -- it sets
 *    `pendingTiltWarning`, carried forward through the whole hold. Code
 *    review (cycle 2): it also inherits a pending warning or a WARNING
 *    screen still showing (DW-250) unless the ball ended TILTED (TILT
 *    supersedes), and it never arms in Attract.
 * 2. Still inside a live hold: a `bonus_count_step` this frame updates
 *    `heldBallEnded.bonusRunning`; a `tilt_warning` this frame (smoke
 *    rework, DW-247) sets `pendingTiltWarning` so it is not lost; otherwise
 *    the view is unchanged (Story 2.10 widens this branch -- it used to
 *    return `view` unconditionally). Story 2.13: this frame's own
 *    `match_drawn`/`match_reveal_step` (if any) are folded into `heldMatch`
 *    here too, ahead of the `game_over` screen ever showing -- a
 *    hypothetically retuned `matchDelayMs` shorter than this hold could
 *    otherwise lose them.
 * 3. Story 2.11: `machine.tilt.tilted` in `phase: 'game'` shows the TILT
 *    screen -- a CONTINUOUS condition read off the snapshot (AD-9: that is
 *    what the snapshot is for), superseding even a live warning hold (a
 *    tilt always follows warnings) but never an armed/held `ball_ended`
 *    (the more specific event, decided above this). A genuine Tilt here
 *    also DROPS any `pendingTiltWarning` carried out of a hold (smoke
 *    rework, DW-247): TILT supersedes a warning that never got shown too.
 * 4. Story 2.11 (smoke rework, DW-247): a `tilt_warning` event THIS frame,
 *    OR a `pendingTiltWarning` carried out of a `ball_ended` hold that has
 *    just ended, arms the transient warning hold -- reading the event (or
 *    the carried flag) alone, never `players[i].tiltWarnings` (AD-9; AC 9's
 *    own control). Both are gated on `phase === 'game'`: a carried warning
 *    whose game is no longer live (game over, or a slam already in
 *    Attract) is dropped here rather than shown late, by simply not
 *    reaching this branch (every branch below it returns a fresh view that
 *    sets `pendingTiltWarning: false` explicitly).
 * 5. Story 2.11: still inside a live warning hold, the SAME reset-safe
 *    half-open window `ball_ended`'s own hold uses -- the view is
 *    unchanged (there is no incremental payload to fold, unlike the BONUS
 *    count-up).
 * 6. Story 2.13: `phase === 'game_over'` shows the `game_over` screen --
 *    final scores, GAME OVER, and the Match reveal folded from `heldMatch`
 *    (via the SAME `foldMatchEvents()` helper item 2 uses, so the two call
 *    sites can never drift). Positioned after TILT/WARNING (both
 *    `game`-gated, so `game_over` never reaches them) and before Attract (a
 *    Slam voids the game straight to Attract, never through here).
 * 7. Attract phase: the keys screen for a fresh entry's first
 *    `ATTRACT_KEYS_HOLD_TICKS`, then the existing prompt/scores cycle (or
 *    pin to the prompt with no scores).
 * 8. Anything else (`game`, `highscore_entry`): the score screen -- the
 *    only non-Attract, non-held, non-tilt, non-game_over screen this
 *    story's union names.
 *
 * Every branch other than item 2 (the live `ball_ended` hold) and item 6
 * (`game_over`) returns `heldMatch: null` explicitly.
 */
export function advanceBackglass(view: BackglassView, input: FrameOutput): BackglassView {
	const tick = input.snapshot.tick;
	const game = input.snapshot.game;
	const tiltWarningEvent = input.events.find(isTiltWarningEvent);

	const ballEndedEvent = input.events.find(isBallEndedEvent);
	// Code review (Story 2.11, cycle 2): never in Attract. A `ball_ended` and a
	// LATER `slam_tilt` can share one `FrameOutput` (~16 owed ticks), whose
	// snapshot is then already 'attract'; arming here flashed the voided
	// game's end-of-ball screen over Attract for a frame. Same gate as the
	// hold branch below.
	if (ballEndedEvent && game.phase !== 'attract') {
		const player = ballEndedEvent.player;
		const score = game.players[player]?.score ?? 0;
		// What this arming inherits (code review, cycle 2):
		// - a warning already pending from an earlier hold (DW-247);
		// - a WARNING screen still SHOWING, inside its own reset-safe half-open
		//   window (DW-250). Without this, a drain one frame after the warning
		//   armed cut it to ~16 ms and lost it, while the same two events inside
		//   ONE `FrameOutput` were carried -- the panel hinged on a frame
		//   boundary. It is re-shown for a full `TILT_WARNING_HOLD_TICKS` after
		//   this hold, exactly as a warning that never got shown is.
		// Neither survives a TILTED ball end: that ball tilted after the warning,
		// so TILT supersedes it, and the TILT branch below cannot see a tilt that
		// `ball_will_start` has already cleared by the time this hold ends (the
		// payload's `tilted` can -- AD-9). This frame's OWN `tilt_warning` is
		// kept even then: a tilted ball earns no warning (`sim/rules/tilt.ts`),
		// so a warning sharing a tilted ball's end frame is the NEXT ball's.
		const warningShowing =
			view.screen === 'tilt_warning' &&
			view.holdUntilTick !== null &&
			tick < view.holdUntilTick &&
			tick >= view.holdUntilTick - TILT_WARNING_HOLD_TICKS;
		const inherited = !ballEndedEvent.tilted && (view.pendingTiltWarning || warningShowing);
		return {
			screen: 'ball_ended',
			holdUntilTick: tick + BALL_ENDED_HOLD_TICKS,
			attractCycleOriginTick: view.attractCycleOriginTick,
			heldBallEnded: { player, score, bonusRunning: null },
			pendingTiltWarning: inherited || Boolean(tiltWarningEvent),
			// Story 2.13: a fresh arming starts a fresh hold -- `matchDelayTicks`
			// exceeds this hold's own length by construction (AC 12), so no
			// match event can ever share this exact arming tick.
			heldMatch: null,
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
	//
	// Code review (Story 2.11): and never in Attract. Only a Slam tilt reaches
	// 'attract' from a game, and it can land inside this hold (a slam within
	// BALL_ENDED_HOLD_TICKS of the previous drain); without this gate the
	// previous ball's end-of-ball/BONUS screen stayed up in Attract for the
	// rest of the hold -- the shape the tilt_warning hold's own phase gate
	// below already closes. 'game_over' still holds (the last ball's screen).
	if (
		game.phase !== 'attract' &&
		view.screen === 'ball_ended' &&
		view.holdUntilTick !== null &&
		tick < view.holdUntilTick &&
		tick >= view.holdUntilTick - BALL_ENDED_HOLD_TICKS
	) {
		// Story 2.10 (AD-9): fold this frame's OWN `bonus_count_step` (if any)
		// into the frozen payload -- reading the event, never re-deriving the
		// running subtotal from the snapshot (AC 8's own control: a fake built
		// off `snapshot.game.players[...].bonus` would look identical on every
		// POSITIVE frame and only be caught by that control). Matched on
		// `player` against the held payload's own ending player -- defensive,
		// since only one ball's schedule is ever live at a time, but payload
		// completeness (AD-9) means never trusting "the only one running" by
		// convention alone.
		//
		// Smoke rework (DW-247): a `tilt_warning` arriving while this hold is
		// live must not be lost either -- it sets `pendingTiltWarning` so the
		// warning surfaces the instant the hold releases (branch 4 below),
		// rather than being dropped the way this whole fix exists to stop.
		const stepEvent = input.events.find(isBonusCountStepEvent);
		const pendingTiltWarning = view.pendingTiltWarning || Boolean(tiltWarningEvent);
		// Story 2.13 (Design Notes, `advanceBackglass()` order item 2): fold
		// this frame's OWN match events into `heldMatch` even while the
		// `ball_ended` screen is still showing -- a retuned `matchDelayMs`
		// shorter than this hold could otherwise lose them, since none of the
		// three returns below otherwise touch `heldMatch` at all.
		const heldMatch = foldMatchEvents(view.heldMatch, input.events);
		if (stepEvent && view.heldBallEnded && stepEvent.player === view.heldBallEnded.player) {
			return { ...view, heldBallEnded: { ...view.heldBallEnded, bonusRunning: stepEvent.running }, pendingTiltWarning, heldMatch };
		}
		if (pendingTiltWarning !== view.pendingTiltWarning || heldMatch !== view.heldMatch) {
			return { ...view, pendingTiltWarning, heldMatch };
		}
		return view;
	}

	// Story 2.11: the TILT condition, read off the SNAPSHOT (a continuous
	// machine condition, not a one-tick event) -- supersedes a live warning
	// hold (checked below) because a tilt always follows warnings, but stays
	// BELOW the ball_ended arming/hold branches above: a ball ending on the
	// tilting tick still wins the panel for its own hold (AC 9). Smoke
	// rework (DW-247): also drops any `pendingTiltWarning` carried out of
	// that hold -- a genuine Tilt supersedes a warning that never got shown,
	// exactly as it supersedes one already showing.
	if (game.phase === 'game' && game.machine.tilt.tilted) {
		return { screen: 'tilt', holdUntilTick: null, attractCycleOriginTick: view.attractCycleOriginTick, heldBallEnded: null, pendingTiltWarning: false, heldMatch: null };
	}

	// Code review finding (Blind Hunter / Edge Case Hunter, converged
	// independently): both this arming check and the hold-continuation check
	// below are gated on `game.phase === 'game'`, mirroring the TILT branch's
	// own gate immediately above. Both are LOAD-BEARING in production, not
	// defence in depth (corrected at Story 2.11's code review): one
	// `FrameOutput` carries every owed tick's events (`sim/loop`'s
	// `advance()`, ~16 ticks per 60 Hz frame), so a single frame can carry a
	// `tilt_warning` from tick k beside a snapshot already in 'attract' from a
	// Slam tilt at tick k+j -- `sim/rules/tilt.ts`'s slam-first pass orders
	// the two within ONE tick only. And a warning hold still counting down
	// when a LATER frame's slam ends the game (`phase` moves to 'attract' well
	// inside `TILT_WARNING_HOLD_TICKS`, 2000 ms) would otherwise keep showing
	// WARNING instead of the Attract screen the game already reached.
	//
	// Smoke rework (DW-247): this frame's OWN `tiltWarningEvent` is only one
	// of two ways to reach this branch now -- `view.pendingTiltWarning`,
	// carried out of a `ball_ended` hold that has just released (branches 1
	// and 2 above), is the other. Both are measured from `tick` HERE: a
	// carried warning is shown for a fresh `TILT_WARNING_HOLD_TICKS` counted
	// from the moment the hold ended, never from when the event originally
	// arrived. The same `phase === 'game'` gate that protects a live event
	// protects the carried flag too -- if phase is no longer 'game' by the
	// time control would reach this branch, every branch between here and
	// the final score/Attract fallback returns a FRESH view that sets
	// `pendingTiltWarning: false` explicitly, so the flag is dropped there.
	//
	// Code review (Blind Hunter, corroborated by Verification Gap): a bare
	// carried boolean has none of this file's OWN reset-safety discipline
	// (the half-open windows above and below both bound themselves against
	// `holdUntilTick`; this flag had no bound at all). A reset restarts
	// `tick` near 0 while the closure-held `BackglassView` survives
	// (`host/loop.ts`'s `reset()`, and the hold branch's own reset comment
	// above), so a stale `pendingTiltWarning:
	// true` paired with a stale, far-future `holdUntilTick` would otherwise
	// reach this branch unfiltered -- the SAME shape of bug the hold
	// branches above already guard against for `screen`/`holdUntilTick`.
	// `view.holdUntilTick` is exactly the bound needed and is already
	// carried alongside the flag (the hold branch carries `holdUntilTick`
	// forward unchanged; the arming branch sets the fresh deadline of the
	// hold it arms): the legitimate
	// release case reaches this line only once `tick` has caught up to or
	// passed the hold's own recorded end (the hold branch's own upper bound,
	// `tick < view.holdUntilTick`, just failed), so `tick >=
	// view.holdUntilTick` is true there and false whenever `tick` instead
	// jumped BACKWARD past a stale, far-future `holdUntilTick` -- no new
	// field needed. (In the wired product this exact leak is not reachable
	// today: `sim/loop`'s fresh `GameState` always boots `phase: 'attract'`
	// and `host/loop.ts`'s `reset()` forces the very next frame to advance
	// zero ticks, so an 'attract' frame always intervenes and clears the
	// flag via the branch below before `phase` can read 'game' again -- but
	// `advanceBackglass()` is a pure fold with no such guarantee of its own,
	// and this file's history is exactly why it does not rely on a caller's
	// invariant to stay correct.)
	if (game.phase === 'game' && (tiltWarningEvent || (view.pendingTiltWarning && view.holdUntilTick !== null && tick >= view.holdUntilTick))) {
		return {
			screen: 'tilt_warning',
			holdUntilTick: tick + TILT_WARNING_HOLD_TICKS,
			attractCycleOriginTick: view.attractCycleOriginTick,
			heldBallEnded: null,
			pendingTiltWarning: false,
			heldMatch: null,
		};
	}

	// The SAME reset-safe half-open window the ball_ended hold branch above
	// uses (this file's own header, `src/host/loop.ts`'s `reset()`): a tick
	// below the lower bound is a tick from a different timeline, not "still
	// holding". Nothing to fold here (unlike the BONUS count-up) -- the
	// warning screen carries no incremental payload -- so the view is simply
	// unchanged while the hold is live.
	if (
		game.phase === 'game' &&
		view.screen === 'tilt_warning' &&
		view.holdUntilTick !== null &&
		tick < view.holdUntilTick &&
		tick >= view.holdUntilTick - TILT_WARNING_HOLD_TICKS
	) {
		return view;
	}

	// Story 2.13 (Design Notes, `advanceBackglass()` order item 4): the
	// game-over screen. Positioned AFTER the TILT/WARNING branches above
	// (both `game`-gated, so they never fire once `phase` has moved past
	// 'game') and BEFORE Attract, since a Slam voids the game (never reaches
	// `game_over`) while an ordinary last-ball drain always does. Folds this
	// frame's own match events forward exactly as the live `ball_ended` hold
	// above does -- the single shared `foldMatchEvents()` helper, so the two
	// call sites can never drift.
	if (game.phase === 'game_over') {
		return {
			screen: 'game_over',
			holdUntilTick: null,
			attractCycleOriginTick: view.attractCycleOriginTick,
			heldBallEnded: null,
			pendingTiltWarning: false,
			heldMatch: foldMatchEvents(view.heldMatch, input.events),
		};
	}

	if (game.phase === 'attract') {
		const originTick = isAttractScreen(view.screen) ? view.attractCycleOriginTick : tick;
		const screen = attractScreenAt(tick, originTick, game.players.length > 0);
		return { screen, holdUntilTick: null, attractCycleOriginTick: originTick, heldBallEnded: null, pendingTiltWarning: false, heldMatch: null };
	}

	return { screen: 'score', holdUntilTick: null, attractCycleOriginTick: view.attractCycleOriginTick, heldBallEnded: null, pendingTiltWarning: false, heldMatch: null };
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
 * Story 2.7: the sole table of authored mode display names (DW-200: there is
 * no mechanical fallback below any more -- see that entry just below). The
 * skill shot's sim id (`skill_shot`) would otherwise have no display name at
 * all, but Story 2.6's own Design Notes name the intended text specifically:
 * "`ARM YOURSELF` on the plunge, from the skill-shot `ModeView`". Naming the
 * sim mode `arm_yourself` instead would also render correctly with zero
 * change here, but would put the English phrase into `sim/` -- this table is
 * the alternative that keeps it here, per the Consistency Conventions
 * ("English literals live in `presentation/backglass` only").
 *
 * DW-200 (author decision, 2026-09-06): a mode line shows an AUTHORED name
 * or nothing at all -- there is deliberately no mechanical
 * `split('_').join(' ').toUpperCase()` fallback below any more. Before this
 * fix, the base mode (AD-8: present in `modes[]` at priority 100 for the
 * whole ball, so it becomes the top mode the instant the skill shot
 * resolves) rendered the literal internal identifier `BASE` on the score
 * screen for the rest of every ball. Generalising the fix -- "no entry here
 * means no row", rather than special-casing `mode === 'base'` -- also
 * protects every future mode Story 3.1+ adds: an unlabelled mode id can
 * never leak onto the panel by omission, it can only be silently absent
 * until someone deliberately authors an entry for it here.
 */
const MODE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
	skill_shot: 'ARM YOURSELF',
};

/** `snake_case` mode id -> `UPPER CASE WORDS` display text -- the only place a mode's name becomes English (AD-9: "rules never format text"). Returns `undefined` for a mode with no authored entry (DW-200) -- `buildScoreRows()` (Story 2.13: the status/fields line replacing the old `buildModeRows()`) reads that as "render nothing for this mode", not as licence to derive one mechanically. */
function modeDisplayName(mode: string): string | undefined {
	return MODE_DISPLAY_NAMES[mode];
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
 * Story 2.13 (DW-197): mirrors `raster.ts`'s own `LINE_WIDTH_COLS` (128 dot
 * columns / `GLYPH_ADVANCE`, floored to 21) -- duplicated rather than
 * imported, since `raster.ts` already imports `DMD_COLS`/`DmdFrame` FROM
 * this file and importing back would be a cycle. Used only to size the
 * status line's mode-name truncation ahead of rasterisation, never to
 * re-implement the clamp itself (which stays `raster.ts`'s sole job).
 */
const STATUS_LINE_WIDTH_COLS = 21;

/** Story 2.13 (DW-197): the right edge every right-aligned status-line field shares (`BALL n`, a reveal step's two-digit `shown`, `MATCH nn`) -- mirrors the left margin's own one-dot gutter on the panel's far side. `GLYPH_ADVANCE * text.length - 1` is the text's own rendered width in dots (every glyph but the last needs no trailing gutter). */
function rightAlignCol(text: string): number {
	return DMD_COLS - LEFT_MARGIN_COL - (GLYPH_ADVANCE * text.length - 1);
}

/**
 * Story 2.13 (DW-197, Design Notes "Players block"): P <= 2 stacks one score
 * per line at col 2; P >= 3 lays out a 2x2 grid, player `i` at row
 * `floor(i/2)*8`, col 2 (even `i`) or 66 (odd `i`) -- so four players plus a
 * mode still fit inside the panel's 32 rows. `emphasisIndex` is `null` for
 * the `game_over` screen (Design Notes: "Players block ... no emphasis"),
 * never inferred from `currentPlayer` there.
 */
function buildPlayersRows(players: GameState['players'], emphasisIndex: number | null): DmdRow[] {
	const grid = players.length >= 3;
	return players.map((player, index) => ({
		text: formatScoreCell(player.score),
		col: grid ? (index % 2 === 0 ? LEFT_MARGIN_COL : 66) : LEFT_MARGIN_COL,
		row: (grid ? Math.floor(index / 2) : index) * LINE_PITCH_ROWS,
		emphasis: index === emphasisIndex,
	}));
}

/** Story 2.13 (DW-197): the players block's own line count -- P, or 2 once the 2x2 grid engages at P >= 3 (the status/fields lines sit right below it). */
function playerBlockLines(playerCount: number): number {
	return playerCount >= 3 ? 2 : playerCount;
}

/** Story 2.13 (DW-197, I/O Matrix "Grid overflow"): each cell is at most 10 characters -- `formatScore`'s comma-separated form, or plain digits if that would exceed it. */
function formatScoreCell(score: number): string {
	const separated = formatScore(score);
	return separated.length > 10 ? Math.trunc(score).toString() : separated;
}

/**
 * Story 2.13 (DW-197, Design Notes "Fields line"): the top mode's published
 * fields, in the authored order `timerTicks` (seconds, one decimal), `value`,
 * `charge`, `strikesRemaining`, joined with two spaces -- never a row per
 * field any more (DW-197's whole point: a shared line, not four). Absent
 * fields contribute nothing (I/O Matrix: "absent fields produce no row and
 * no placeholder"), exactly `buildModeRows()`'s old per-field guards, folded
 * into one line instead of several.
 */
function buildFieldsText(mode: ModeView): string {
	const parts: string[] = [];
	if (mode.timerTicks !== undefined) {
		parts.push(formatSecondsFromTicks(mode.timerTicks));
	}
	if (mode.value !== undefined) {
		parts.push(String(mode.value));
	}
	if (mode.charge !== undefined) {
		parts.push(String(mode.charge));
	}
	if (mode.strikesRemaining !== undefined) {
		parts.push(String(mode.strikesRemaining));
	}
	return parts.join('  ');
}

/**
 * AC 2, widened by Story 2.13 (DW-197): the players block (AC 2's own
 * per-player rows, now `buildPlayersRows()` above), then ONE status line
 * sharing the current player's mode name (truncated to
 * `STATUS_LINE_WIDTH_COLS - |BALL text| - 1` characters, none for an
 * unlabelled/base mode -- DW-200) with `BALL <n>` right-aligned on the same
 * line, then -- only for a NAMED top mode with at least one published field
 * -- one fields line (`buildFieldsText()`). This is what makes DW-197's
 * "silently drops" claim false: every score, the ball number, the mode name
 * and its fields are all visible at once, at any player count up to four.
 */
function buildScoreRows(state: GameState): DmdRow[] {
	const rows: DmdRow[] = buildPlayersRows(state.players, state.currentPlayer);
	const blockLines = playerBlockLines(state.players.length);
	const statusRow = blockLines * LINE_PITCH_ROWS;

	const current = state.players[state.currentPlayer];
	const topMode = selectTopMode(state);
	const modeName = topMode ? modeDisplayName(topMode.mode) : undefined;

	if (current) {
		const ballText = `BALL ${current.ballNumber}`;
		if (modeName !== undefined) {
			const maxNameLen = STATUS_LINE_WIDTH_COLS - ballText.length - 1;
			rows.push({ text: modeName.slice(0, maxNameLen), col: LEFT_MARGIN_COL, row: statusRow, emphasis: false });
		}
		rows.push({ text: ballText, col: rightAlignCol(ballText), row: statusRow, emphasis: false });
	}

	if (topMode && modeName !== undefined) {
		const fieldsText = buildFieldsText(topMode);
		if (fieldsText.length > 0) {
			rows.push({ text: fieldsText, col: LEFT_MARGIN_COL, row: (blockLines + 1) * LINE_PITCH_ROWS, emphasis: false });
		}
	}

	return rows;
}

/**
 * Story 2.13 (DW-198): each row now identifies its player -- `PLAYER <n+1>`
 * (1-indexed for display, the `buildBallEndedRows()` precedent) followed by
 * the score -- rather than the bare number Attract used to show. No
 * highlighting (Attract has no "current player"). Never called with an
 * empty `players[]` in production -- `advanceBackglass()` never selects
 * `attract_scores` for a scoreless machine -- but returns no rows rather
 * than an empty score row if it ever is.
 */
function buildAttractScoresRows(players: GameState['players']): DmdRow[] {
	return players.map((player, index) => ({
		text: `PLAYER ${index + 1} ${formatScore(player.score)}`,
		col: LEFT_MARGIN_COL,
		row: index * LINE_PITCH_ROWS,
		emphasis: false,
	}));
}

/**
 * Story 2.13: the game-over screen's own players block (no emphasis, Design
 * Notes) plus its status line -- `GAME OVER` at col 2, and, once the game-
 * over sequence has produced at least one reveal step, the right-aligned
 * two-digit `shown` value, upgraded to `MATCH <nn>` the instant the Match
 * has both resolved (the tenth step) AND paid (`winners` non-empty). Before
 * the first reveal step (`heldMatch === null` or `heldMatch.shown === null`)
 * the right side is simply empty (I/O Matrix: "on the right nothing").
 */
function buildGameOverRows(state: GameState, heldMatch: HeldMatch | null): DmdRow[] {
	const rows: DmdRow[] = buildPlayersRows(state.players, null);
	const statusRow = playerBlockLines(state.players.length) * LINE_PITCH_ROWS;
	rows.push({ text: 'GAME OVER', col: LEFT_MARGIN_COL, row: statusRow, emphasis: false });

	if (heldMatch && heldMatch.shown !== null) {
		const shownText = String(heldMatch.shown).padStart(2, '0');
		const text = heldMatch.resolved && heldMatch.winners.length > 0 ? `MATCH ${shownText}` : shownText;
		rows.push({ text, col: rightAlignCol(text), row: statusRow, emphasis: false });
	}

	return rows;
}

/**
 * Story 2.13 (Design Notes "Attract"): formats one `KeyboardEvent.code`
 * (`ShiftLeft`, `Digit1`, `KeyZ`, `Enter`, ...) into display text -- a
 * mechanical rule over the W3C code vocabulary, never a key->action map (that
 * stays `host/input`'s `KEY_MAP` alone, AD-16/Story 6.4's "the key->action
 * map is the only place key codes exist"). Splits at a lower->upper or
 * letter->digit boundary (`ShiftLeft` -> `Shift`/`Left`, `Digit1` ->
 * `Digit`/`1`, `KeyZ` -> `Key`/`Z`), drops a leading `Key`/`Digit` word when
 * the remainder is exactly one character (`Key`+`Z` -> `Z`, `Digit`+`1` ->
 * `1`), then uppercases each remaining word, drops any character outside
 * `FONT_5X7`'s own set, and joins with spaces.
 */
function keyLabel(code: string): string {
	let words = code.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Za-z])(?=[0-9])/);
	if (words.length === 2 && (words[0] === 'Key' || words[0] === 'Digit') && words[1]!.length === 1) {
		words = [words[1]!];
	}
	return words
		.map((word) => word.toUpperCase().replace(/[^A-Z0-9., :-]/g, ''))
		.filter((word) => word.length > 0)
		.join(' ');
}

/** Story 2.13: the four Attract keys rows, each an action label followed by `keyLabel()` for every code `viewConfig` binds to it (Design Notes: "each followed by `keyLabel(code)` for the action's codes") -- an unbound action (or `EMPTY_VIEW_CONFIG`, `renderFrame()`'s own default) renders the label alone, per the "No ViewConfig" I/O row. */
const ATTRACT_KEYS_ROW_SPECS: ReadonlyArray<{ readonly prefix: string; readonly action: InputAction }> = [
	{ prefix: 'L FLIP', action: 'flipper_l' },
	{ prefix: 'R FLIP', action: 'flipper_r' },
	{ prefix: 'PLUNGE', action: 'plunger' },
	{ prefix: 'START', action: 'start' },
];

function buildAttractKeysRows(viewConfig: ViewConfig): DmdRow[] {
	return ATTRACT_KEYS_ROW_SPECS.map((spec, index) => {
		const codes = viewConfig.bindings[spec.action] ?? [];
		const labels = codes.map(keyLabel).filter((label) => label.length > 0);
		const text = labels.length > 0 ? `${spec.prefix} ${labels.join(' ')}` : spec.prefix;
		return { text, col: LEFT_MARGIN_COL, row: index * LINE_PITCH_ROWS, emphasis: false };
	});
}

/**
 * The frozen end-of-ball payload: `PLAYER <n+1>` (1-indexed for display, AC
 * 3) then the ending player's own score, read off the SAME snapshot the
 * event arrived with (captured by `advanceBackglass()`, never re-derived
 * here). Story 2.10 (AD-9, AC 8): a BONUS row is the third line, present
 * only once `bonusRunning` is non-`null` -- DW-200's "no entry means no
 * row" precedent -- so a zero-bonus or tilted ball end, which never
 * receives a `bonus_count_step`, renders no BONUS row at all.
 */
function buildBallEndedRows(held: { readonly player: number; readonly score: number; readonly bonusRunning: number | null }): DmdRow[] {
	const rows: DmdRow[] = [
		{ text: `PLAYER ${held.player + 1}`, col: LEFT_MARGIN_COL, row: 0, emphasis: false },
		{ text: formatScore(held.score), col: LEFT_MARGIN_COL, row: LINE_PITCH_ROWS, emphasis: false },
	];
	if (held.bonusRunning !== null) {
		rows.push({ text: `BONUS ${formatScore(held.bonusRunning)}`, col: LEFT_MARGIN_COL, row: 2 * LINE_PITCH_ROWS, emphasis: false });
	}
	return rows;
}

/** Story 2.11: the TILT screen -- one row, no dynamic content (the CONDITION is the whole message; `machine.tilt.tilted` is what selected this screen). */
function buildTiltRows(): DmdRow[] {
	return [{ text: 'TILT', col: LEFT_MARGIN_COL, row: 0, emphasis: false }];
}

/** Story 2.11: the transient tilt-warning screen -- one row, no dynamic content (the EVENT'S arrival is the whole message; `remaining` is payload-complete for a future consumer but this story's own panel does not render it, per the I/O matrix's own "rendering a WARNING row" wording). */
function buildTiltWarningRows(): DmdRow[] {
	return [{ text: 'WARNING', col: LEFT_MARGIN_COL, row: 0, emphasis: false }];
}

/**
 * Turns `view` plus the CURRENT `snapshot` into a `DmdFrame`. Pure, and
 * never throws (I/O Matrix: every row here is "no error expected") --
 * `raster.ts` is what clamps and bounds-checks the result.
 *
 * Story 2.13: `viewConfig` is a new, OPTIONAL third argument -- every
 * pre-existing two-argument call site keeps compiling unchanged, defaulting
 * to `EMPTY_VIEW_CONFIG` (the "No ViewConfig" I/O row: the keys rows carry
 * their action labels only). The one reader is the `attract_keys` screen.
 */
export function renderFrame(view: BackglassView, snapshot: Snapshot, viewConfig: ViewConfig = EMPTY_VIEW_CONFIG): DmdFrame {
	switch (view.screen) {
		case 'attract_prompt':
			return { screen: 'attract_prompt', rows: [{ text: 'PRESS START', col: LEFT_MARGIN_COL, row: 0, emphasis: false }] };
		case 'attract_scores':
			return { screen: 'attract_scores', rows: buildAttractScoresRows(snapshot.game.players) };
		case 'attract_keys':
			return { screen: 'attract_keys', rows: buildAttractKeysRows(viewConfig) };
		case 'ball_ended':
			return { screen: 'ball_ended', rows: view.heldBallEnded ? buildBallEndedRows(view.heldBallEnded) : [] };
		case 'tilt':
			return { screen: 'tilt', rows: buildTiltRows() };
		case 'tilt_warning':
			return { screen: 'tilt_warning', rows: buildTiltWarningRows() };
		case 'game_over':
			return { screen: 'game_over', rows: buildGameOverRows(snapshot.game, view.heldMatch) };
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
			// NOTE: `advanceBackglass()`'s documented `highscore_entry`
			// fallthrough is unaffected -- that fallthrough lives in the PHASE
			// switch there, not in this SCREEN switch.
			const unhandledScreen: never = view.screen;
			void unhandledScreen;
			return { screen: 'score', rows: buildScoreRows(snapshot.game) };
		}
	}
}
