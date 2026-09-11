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
import type { BallEndedEvent, BonusCountStepEvent, TiltWarningEvent } from '../../sim/contracts/events';
import type { ModeView } from '../../sim/contracts/mode-view';
import type { FrameOutput, GameState, Snapshot } from '../../sim/table/names';

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

/** The closed set of screens the Backglass can show. Later stories ADD members (Story 2.11 added 'tilt_warning' and 'tilt'; 2.13 will add final scores/Match) -- this union is a contract, not an implementation detail (Consumed-by, Rule 2). Story 2.7's ARM YOURSELF shipped as a ROW label on the score screen, not as a screen. */
export type DmdScreen = 'attract_prompt' | 'attract_scores' | 'score' | 'ball_ended' | 'tilt_warning' | 'tilt';

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
}

/** The view a fresh boot (or a fresh test) starts from: the Attract prompt, nothing held, cycle counting from tick 0. */
export const INITIAL_BACKGLASS_VIEW: BackglassView = {
	screen: 'attract_prompt',
	holdUntilTick: null,
	attractCycleOriginTick: 0,
	heldBallEnded: null,
	pendingTiltWarning: false,
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
 *    return `view` unconditionally).
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
 * 6. Attract phase: cycle (or pin to the prompt with no scores).
 * 7. Anything else (`game`, `game_over`, `highscore_entry`): the score
 *    screen -- the only non-Attract, non-held, non-tilt screen this story's
 *    union names.
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
		if (stepEvent && view.heldBallEnded && stepEvent.player === view.heldBallEnded.player) {
			return { ...view, heldBallEnded: { ...view.heldBallEnded, bonusRunning: stepEvent.running }, pendingTiltWarning };
		}
		if (pendingTiltWarning !== view.pendingTiltWarning) {
			return { ...view, pendingTiltWarning };
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
		return { screen: 'tilt', holdUntilTick: null, attractCycleOriginTick: view.attractCycleOriginTick, heldBallEnded: null, pendingTiltWarning: false };
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

	if (game.phase === 'attract') {
		const originTick = isAttractScreen(view.screen) ? view.attractCycleOriginTick : tick;
		const screen = attractScreenAt(tick, originTick, game.players.length > 0);
		return { screen, holdUntilTick: null, attractCycleOriginTick: originTick, heldBallEnded: null, pendingTiltWarning: false };
	}

	return { screen: 'score', holdUntilTick: null, attractCycleOriginTick: view.attractCycleOriginTick, heldBallEnded: null, pendingTiltWarning: false };
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

/** `snake_case` mode id -> `UPPER CASE WORDS` display text -- the only place a mode's name becomes English (AD-9: "rules never format text"). Returns `undefined` for a mode with no authored entry (DW-200) -- `buildModeRows()` reads that as "render nothing for this mode", not as licence to derive one mechanically. */
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
 * One row for the mode's name, then ONE ROW PER PUBLISHED FIELD -- never a
 * row for a field the mode did not set (I/O Matrix: "Mode publishes a
 * subset ... absent fields produce no row and no placeholder"). `charge`
 * and `strikesRemaining` are shown as plain numbers; `timerTicks` is the
 * only field converted (ticks are never a display unit).
 *
 * DW-200: a mode with no `MODE_DISPLAY_NAMES` entry contributes NO rows at
 * all -- not its name, and not any of its published fields either, since a
 * lone `timerTicks`/`value` row with no name above it would be its own kind
 * of unlabelled leak. `selectTopMode()`'s caller still calls this
 * unconditionally whenever a mode is active; returning `[]` here is what
 * makes "the mode block is simply absent" true from the caller's side.
 */
function buildModeRows(mode: ModeView, startLine: number): DmdRow[] {
	const name = modeDisplayName(mode.mode);
	if (name === undefined) {
		return [];
	}
	const rows: DmdRow[] = [{ text: name, col: LEFT_MARGIN_COL, row: startLine * LINE_PITCH_ROWS, emphasis: false }];
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
 */
export function renderFrame(view: BackglassView, snapshot: Snapshot): DmdFrame {
	switch (view.screen) {
		case 'attract_prompt':
			return { screen: 'attract_prompt', rows: [{ text: 'PRESS START', col: LEFT_MARGIN_COL, row: 0, emphasis: false }] };
		case 'attract_scores':
			return { screen: 'attract_scores', rows: buildAttractScoresRows(snapshot.game.players) };
		case 'ball_ended':
			return { screen: 'ball_ended', rows: view.heldBallEnded ? buildBallEndedRows(view.heldBallEnded) : [] };
		case 'tilt':
			return { screen: 'tilt', rows: buildTiltRows() };
		case 'tilt_warning':
			return { screen: 'tilt_warning', rows: buildTiltWarningRows() };
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
