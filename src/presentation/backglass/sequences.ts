// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.5 -- which DMD art sequence plays, and which of its frames shows.
// Three pure pieces, beside `advanceBackglass()`/`renderFrame()`:
//
// - `BACKGLASS_SEQUENCES`: the one presentation-side map from an event name
//   to a sequence -- its host screen, its draw region, whether it repeats, and
//   its frames (the art is `dmd-art.ts`'s). Exactly five keys. `match_drawn`
//   is declared in `sim/contracts/events.ts`, so its key is typed `satisfies
//   EventName`. The Mode-prompt, War-start and Jackpot events are not declared
//   in this tree yet: they are plain event-name strings here, under the names
//   `epics.md` gives them (spine Conventions, "Backglass sequences"), and fire
//   through the same lookup the moment an event of that `type` arrives.
//   Attract is a phase, not an event: presentation raises its key,
//   `mode_attract_started` (MPF's mode-start name), itself on the first frame
//   of each PRESS START screen.
// - `advanceSequences()`: folds one `FrameOutput` into the next
//   `SequenceView`. The latest keyed event in the output, by `tick`, wins and
//   restarts its sequence at THAT event's own `tick` (AD-9: the payload is
//   complete) -- never at `snapshot.tick`.
// - `activeSequenceFrame()` / `composeSequence()`: the frame shown is a pure
//   function of `tick - startTick` (AD-3, AD-4: sim ticks are the only clock;
//   no `performance.now()`), drawn only while the current screen is the
//   sequence's host. A tick below `startTick` is a restarted timeline and
//   shows nothing (the `frame.ts` half-open-window discipline).
//
// Nothing here writes text: `composeSequence()` adds `art` to a `DmdFrame`
// and leaves its rows exactly as `renderFrame()` built them.

import type { EventName } from '../../sim/contracts/events';
import type { FrameOutput } from '../../sim/table/names';
import { msToTicks, type BackglassView, type DmdArt, type DmdFrame, type DmdScreen, type DmdSpritePlacement } from './frame';
import { ATTRACT_FRAMES, JACKPOT_FRAMES, MATCH_FRAMES, MODE_PROMPT_FRAMES, WAR_START_FRAMES, type DmdArtFrame } from './dmd-art';

/** One sequence frame, its hold converted to sim ticks. */
export interface SequenceFrame {
	readonly placements: readonly DmdSpritePlacement[];
	readonly holdTicks: number;
}

/** One entry of `BACKGLASS_SEQUENCES`. */
export interface BackglassSequence {
	/** The only screen this sequence is ever drawn on. */
	readonly host: DmdScreen;
	/** Inclusive; `raster.ts` draws nothing outside it. */
	readonly region: DmdArt['region'];
	/** A repeating sequence loops for as long as it is active; any other shows nothing from `startTick + durationTicks`. */
	readonly repeat: boolean;
	readonly frames: readonly SequenceFrame[];
	/** The sum of every frame's `holdTicks`. */
	readonly durationTicks: number;
}

/** The Attract stage: everything below the PRESS START row. */
const ATTRACT_REGION: DmdArt['region'] = { rowMin: 8, rowMax: 31, colMin: 0, colMax: 127 };
/** The in-game strip: the bottom line of the panel. */
const STRIP_REGION: DmdArt['region'] = { rowMin: 24, rowMax: 31, colMin: 0, colMax: 127 };

/** Builds one sequence, converting each authored ms hold with `msToTicks`. Load-time: throws on an empty sequence or a hold shorter than one tick. */
function sequence(name: string, host: DmdScreen, region: DmdArt['region'], repeat: boolean, authored: readonly DmdArtFrame[]): BackglassSequence {
	if (authored.length === 0) {
		throw new Error(`sequences: "${name}" has no frames`);
	}
	const frames = authored.map((frame, index) => {
		const holdTicks = msToTicks(frame.holdMs);
		if (!(holdTicks >= 1)) {
			throw new Error(`sequences: "${name}" frame ${index} holds for less than one tick`);
		}
		return { placements: frame.placements, holdTicks };
	});
	return { host, region, repeat, frames, durationTicks: frames.reduce((sum, frame) => sum + frame.holdTicks, 0) };
}

/** The key presentation raises itself on each PRESS START screen (Design Notes: Attract has no event; MPF's own `mode_<name>_started`). */
const ATTRACT_SEQUENCE_KEY = 'mode_attract_started';
/** The one key this tree's event union already declares. */
const MATCH_SEQUENCE_KEY = 'match_drawn' satisfies EventName;

/**
 * Event name -> sequence. Exactly five keys: `mode_attract_started`,
 * `match_drawn`, and the three plain strings Epic 3 will declare as events
 * (`lock_lane_mode_start` -- the Mode prompt, `war_started`,
 * `jackpot_awarded`).
 */
export const BACKGLASS_SEQUENCES: Readonly<Record<string, BackglassSequence>> = {
	[ATTRACT_SEQUENCE_KEY]: sequence(ATTRACT_SEQUENCE_KEY, 'attract_prompt', ATTRACT_REGION, true, ATTRACT_FRAMES),
	[MATCH_SEQUENCE_KEY]: sequence(MATCH_SEQUENCE_KEY, 'game_over', STRIP_REGION, false, MATCH_FRAMES),
	lock_lane_mode_start: sequence('lock_lane_mode_start', 'score', STRIP_REGION, false, MODE_PROMPT_FRAMES),
	war_started: sequence('war_started', 'score', STRIP_REGION, false, WAR_START_FRAMES),
	jackpot_awarded: sequence('jackpot_awarded', 'score', STRIP_REGION, false, JACKPOT_FRAMES),
};

function sequenceFor(key: string): BackglassSequence | undefined {
	return Object.hasOwn(BACKGLASS_SEQUENCES, key) ? BACKGLASS_SEQUENCES[key] : undefined;
}

/**
 * Presentation-held sequence state, folded forward by `advanceSequences()`.
 * `active` is the sequence last started and the tick it started at (an
 * event's own `tick`, or the first PRESS START frame's tick for Attract);
 * `lastScreen` is the Backglass screen the previous fold saw, so a fresh
 * PRESS START screen can be told from a continuing one.
 */
export interface SequenceView {
	readonly active: { readonly key: string; readonly startTick: number } | null;
	readonly lastScreen: DmdScreen | null;
}

export const INITIAL_SEQUENCE_VIEW: SequenceView = { active: null, lastScreen: null };

/**
 * Folds one `FrameOutput` into the next `SequenceView`. `backglassView` is
 * the view `advanceBackglass()` has ALREADY folded from this same output, so
 * its `screen` is the screen this frame shows. Pure.
 *
 * 1. A restarted timeline (`snapshot.tick` below the active `startTick`)
 *    drops the active sequence: stale art is never replayed.
 * 2. The latest keyed event in `output.events`, by `tick`, starts its
 *    sequence at that event's own `tick`, replacing whatever was active (a
 *    new one restarts rather than queueing). Unkeyed events change nothing.
 * 3. Attract: on the first frame of each PRESS START screen -- or on a
 *    restarted timeline while that screen shows -- presentation starts the
 *    Attract sequence at this frame's tick.
 */
export function advanceSequences(seqView: SequenceView, backglassView: BackglassView, output: FrameOutput): SequenceView {
	const tick = output.snapshot.tick;
	const restarted = seqView.active !== null && tick < seqView.active.startTick;
	let active = restarted ? null : seqView.active;

	let latest: { readonly key: string; readonly tick: number } | null = null;
	for (const event of output.events) {
		if (sequenceFor(event.type) !== undefined && (latest === null || event.tick >= latest.tick)) {
			latest = { key: event.type, tick: event.tick };
		}
	}
	if (latest !== null) {
		active = { key: latest.key, startTick: latest.tick };
	}

	const attractHost = BACKGLASS_SEQUENCES[ATTRACT_SEQUENCE_KEY]!.host;
	if (backglassView.screen === attractHost && (seqView.lastScreen !== attractHost || restarted)) {
		active = { key: ATTRACT_SEQUENCE_KEY, startTick: tick };
	}

	return { active, lastScreen: backglassView.screen };
}

/**
 * Which sequence frame shows on `screen` at `tick`, or `null` for none: no
 * active sequence, a screen other than its host, a tick below its start, or
 * (for a sequence that does not repeat) a tick at or past its end.
 */
export function activeSequenceFrame(seqView: SequenceView, screen: DmdScreen, tick: number): { readonly key: string; readonly index: number } | null {
	const active = seqView.active;
	if (active === null) {
		return null;
	}
	const seq = sequenceFor(active.key);
	if (seq === undefined || screen !== seq.host) {
		return null;
	}
	let elapsed = tick - active.startTick;
	if (elapsed < 0) {
		return null;
	}
	if (seq.repeat) {
		elapsed %= seq.durationTicks;
	} else if (elapsed >= seq.durationTicks) {
		return null;
	}
	for (let index = 0; index < seq.frames.length; index++) {
		elapsed -= seq.frames[index]!.holdTicks;
		if (elapsed < 0) {
			return { key: active.key, index };
		}
	}
	return null;
}

/**
 * `frame` with the showing sequence frame's art attached, or `frame` itself
 * unchanged when nothing shows. Never adds, removes or moves a text row.
 */
export function composeSequence(frame: DmdFrame, seqView: SequenceView, tick: number): DmdFrame {
	const shown = activeSequenceFrame(seqView, frame.screen, tick);
	if (shown === null) {
		return frame;
	}
	const seq = BACKGLASS_SEQUENCES[shown.key]!;
	return { ...frame, art: { region: seq.region, placements: seq.frames[shown.index]!.placements } };
}
