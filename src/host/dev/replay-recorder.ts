// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-15, Story 1.8 AC 3: record and play, attached at the seam
// `src/host/loop.ts`'s `onAdvance` callback exposes (its own header:
// "called with this frame's elapsedMs and the transitions this call
// actually applied, immediately after loop.advance() returns"). Exposed via
// `window.__dragonwarBoot.replayRecorder` (`src/host/boot.ts`), the same
// dev-only, console-only pattern `pulseCoil()`/`setCoilEnabled()` already
// establish there.
//
// `invalidate(reason)` is the seam a hot-apply calls (Story 1.9's dev tuning
// panel: "a hot-apply during a recording invalidates the recording so it
// cannot be saved as a golden" -- epic context).
//
// `host/**`, not `sim/**` (AD-1): this file composes a recording session
// over `sim/loop/replay.ts`'s `buildHeader()`; it owns no physics of its
// own and performs no file I/O itself (AD-1's own "sim/ never does I/O" is
// about sim/, but this file follows the same discipline -- SAVING a
// recording to disk/localStorage is Story 1.9's dev-tuning-panel UI, not
// this seam).
//
// Story 1.9 (DW-86), the play half: `start()` now takes the loop's CURRENT
// tick and throws a named error (`NonZeroStartTickError`) unless it is
// exactly 0 -- rebasing the recorded ticks alone would fix only their
// ALIGNMENT, not the initial WORLD STATE (balls in play, device slots, a
// cabinet oscillator mid-decay), none of which a fresh `createLoop()`
// reproduces (this story's Design Notes, "`DW-86` -- the loop reset is an
// ADDITION, not a redesign"). `save()` rebases every recorded transition's
// tick relative to the captured start tick and emits `durationTicks` (the
// last tick actually observed, via `recordTransitions()`/`recordCoilPulse()`
// -- whichever ran most recently), plus the recorded `coilPrologue` -- the
// same nine-field shape `GoldenFile` (`test/replay-goldens.test.ts`) uses
// for its own header/transitions/coilPrologue/durationTicks quartet, making
// a saved recording directly promotable to a golden by hand (this is the
// link-to-golden mechanism `docs/feel-test.md`, AC 5, needs).

import { buildHeader } from '../../sim/loop/replay';
import type { CoilPrologueEntry } from '../../sim/loop/replay';
import type { InputTransition } from '../../sim/contracts/input';
import type { CoilName, GameStart, Replay } from '../../sim/table/names';

export interface RecordingResult {
	readonly ok: true;
	/** `{ header, transitions }` -- AC 1's own, unwidened shape (never carries the prologue or the duration itself). */
	readonly replay: Replay;
	/** The coil pulses recorded during this session, rebased the same way `replay.transitions` is -- `sim/loop/replay.ts`'s own `RunReplayOptions.coilPrologue` shape. */
	readonly coilPrologue: readonly CoilPrologueEntry[];
	/** The last tick actually observed during this recording, rebased relative to its own start -- `runReplay()`'s own `durationTicks` argument. */
	readonly durationTicks: number;
}

export interface InvalidRecordingResult {
	readonly ok: false;
	/** Names WHY the recording could not be saved -- e.g. the reason passed to `invalidate()`. Never a silent, unnamed failure. */
	readonly reason: string;
}

/** Thrown by `start()` when the loop's current tick is not exactly 0 (DW-86): rebasing the recorded ticks alone would fix only their alignment, not the initial world state a fresh `createLoop()` reproduces. Named, so a caller sees WHY, rather than silently saving an unreproducible recording. The panel's Record control resets the loop first, which is what makes a normal Record click satisfy this. */
export class NonZeroStartTickError extends Error {}

export interface ReplayRecorder {
	/**
	 * Begins a new recording, discarding any prior one (started or not).
	 * Builds the header immediately (AC 1: "its header embeds the whole
	 * GameStart ... tableHash, assetHash and physicsVersion") -- these are
	 * fixed at the START of a recording, not re-derived at save time, so a
	 * TABLE/tuning/solver-constant edit mid-recording is caught the same way
	 * `runReplay()`'s own header check catches it on REPLAY: the saved
	 * header simply describes the environment as it was when recording began.
	 *
	 * `startTick` is the host loop's CURRENT tick (its latest snapshot's
	 * `tick`, or 0 for a freshly-constructed/just-reset loop) -- throws
	 * `NonZeroStartTickError` unless it is exactly 0 (DW-86, this file's own
	 * header).
	 */
	start(gameStart: GameStart, physicsSeed: number, collisionDoc: unknown, startTick: number): void;
	/**
	 * Called once per `src/host/loop.ts` `onAdvance` invocation while
	 * recording -- appends this call's transitions (already tick-stamped by
	 * `src/host/input/`) to the in-progress recording, and records `tick` as
	 * the latest tick observed (`save()`'s own `durationTicks`). A no-op if
	 * `start()` was never called, or after `save()`. NOT a no-op after
	 * `invalidate()`: invalidation marks the recording unsaveable but does
	 * not stop it, because `src/host/loop.ts`'s `onAdvance` seam keeps firing
	 * every frame and cannot be detached mid-recording -- `save()` is what
	 * refuses, naming the reason.
	 */
	recordTransitions(transitions: readonly InputTransition[], tick: number): void;
	/**
	 * Records one coil pulse into the in-progress recording's `coilPrologue`
	 * (DW-86's own play-half requirement: "nothing in an `InputTransition[]`
	 * body can put a ball in play"). The CALLER is responsible for invoking
	 * this alongside the real `pulseCoil()` call it makes on the host loop --
	 * this method never pulses anything itself. A no-op under the same terms
	 * as `recordTransitions()` above.
	 */
	recordCoilPulse(coil: CoilName, tick: number): void;
	/**
	 * Marks the in-progress recording invalid, naming why -- `save()` then
	 * refuses and returns that reason (AC 3: "a hot-apply during a recording
	 * invalidates the recording so it cannot be saved as a golden"). Never
	 * throws; never emits a golden. Idempotent -- a second call keeps the
	 * FIRST reason (the earliest cause is the one worth keeping).
	 */
	invalidate(reason: string): void;
	/**
	 * Ends the recording. Returns the assembled recording (AC 1's `Replay`
	 * shape, plus `coilPrologue` and `durationTicks` alongside it -- this
	 * file's own header) on success, or a named-reason failure if
	 * `invalidate()` was ever called during this recording, or if no
	 * recording was ever started. Always stops recording, win or lose -- a
	 * second `save()` call without a new `start()` fails naming "no
	 * recording in progress". Every recorded transition and coil pulse's
	 * `tick` is rebased relative to the captured start tick before being
	 * returned.
	 */
	save(): RecordingResult | InvalidRecordingResult;
	/** Whether a recording is currently in progress (started, not yet saved or invalidated-and-saved). */
	readonly isRecording: boolean;
}

const NOT_RECORDING_REASON = 'save(): no recording is in progress -- start() was never called, or a prior save()/invalidate() already ended it';

/** Rebases one tick, relative to a recording's captured start tick -- a pure, independently-testable step (this file's own "capture the start tick, rebase to tick 1" requirement), kept separate from the `start()` guard that makes it an identity transform in every LEGAL recording (a fresh loop's captured start tick is always 0). */
function rebaseTick(tick: number, capturedStartTick: number): number {
	return tick - capturedStartTick;
}

export function createReplayRecorder(): ReplayRecorder {
	let header: ReturnType<typeof buildHeader> | undefined;
	let transitions: InputTransition[] = [];
	let coilPrologue: CoilPrologueEntry[] = [];
	let capturedStartTick = 0;
	let lastTick = 0;
	let recording = false;
	let invalidReason: string | undefined;

	function start(gameStart: GameStart, physicsSeed: number, collisionDoc: unknown, startTick: number): void {
		if (startTick !== 0) {
			throw new NonZeroStartTickError(
				`replayRecorder.start(): the loop's current tick (${startTick}) is not 0 -- rebasing the recorded ticks alone would fix only their ALIGNMENT, not the initial world state (balls in play, device slots, a cabinet oscillator mid-decay) a fresh createLoop() reproduces. Reset the loop first (hostLoop.reset()), then start().`,
			);
		}
		header = buildHeader({ gameStart, physicsSeed, collisionDoc });
		transitions = [];
		coilPrologue = [];
		capturedStartTick = startTick;
		lastTick = startTick;
		invalidReason = undefined;
		recording = true;
	}

	function recordTransitions(newTransitions: readonly InputTransition[], tick: number): void {
		if (!recording) {
			return;
		}
		transitions.push(...newTransitions);
		lastTick = Math.max(lastTick, tick);
	}

	function recordCoilPulse(coil: CoilName, tick: number): void {
		if (!recording) {
			return;
		}
		coilPrologue.push({ tick, coil });
		lastTick = Math.max(lastTick, tick);
	}

	function invalidate(reason: string): void {
		if (!recording) {
			return;
		}
		// Idempotent, first reason wins (this interface's own doc comment).
		if (invalidReason === undefined) {
			invalidReason = reason;
		}
	}

	function save(): RecordingResult | InvalidRecordingResult {
		if (!recording || !header) {
			return { ok: false, reason: NOT_RECORDING_REASON };
		}
		recording = false;
		if (invalidReason !== undefined) {
			return { ok: false, reason: invalidReason };
		}
		const rebasedTransitions = transitions.map((t) => ({ tick: rebaseTick(t.tick, capturedStartTick), frame: t.frame }));
		const rebasedPrologue = coilPrologue.map((entry) => ({ tick: rebaseTick(entry.tick, capturedStartTick), coil: entry.coil }));
		return {
			ok: true,
			replay: { header, transitions: rebasedTransitions },
			coilPrologue: rebasedPrologue,
			durationTicks: rebaseTick(lastTick, capturedStartTick),
		};
	}

	return {
		start,
		recordTransitions,
		recordCoilPulse,
		invalidate,
		save,
		get isRecording(): boolean {
			return recording;
		},
	};
}
