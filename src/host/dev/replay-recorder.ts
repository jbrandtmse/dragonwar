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
// cannot be saved as a golden" -- epic context). No consumer calls it in
// THIS story; `save()` refusing once invalidated is tested here by calling
// `invalidate()` directly.
//
// `host/**`, not `sim/**` (AD-1): this file composes a recording session
// over `sim/loop/replay.ts`'s `buildHeader()`; it owns no physics of its
// own and performs no file I/O itself (AD-1's own "sim/ never does I/O" is
// about sim/, but this file follows the same discipline -- SAVING a
// recording to disk/localStorage is Story 1.9's dev-tuning-panel UI, not
// this seam).

import { buildHeader } from '../../sim/loop/replay';
import type { InputTransition } from '../../sim/contracts/input';
import type { GameStart, Replay } from '../../sim/table/names';

export interface RecordingResult {
	readonly ok: true;
	readonly replay: Replay;
}

export interface InvalidRecordingResult {
	readonly ok: false;
	/** Names WHY the recording could not be saved -- e.g. the reason passed to `invalidate()`. Never a silent, unnamed failure. */
	readonly reason: string;
}

export interface ReplayRecorder {
	/**
	 * Begins a new recording, discarding any prior one (started or not).
	 * Builds the header immediately (AC 1: "its header embeds the whole
	 * GameStart ... tableHash, assetHash and physicsVersion") -- these are
	 * fixed at the START of a recording, not re-derived at save time, so a
	 * TABLE/tuning/solver-constant edit mid-recording is caught the same way
	 * `runReplay()`'s own header check catches it on REPLAY: the saved
	 * header simply describes the environment as it was when recording began.
	 */
	start(gameStart: GameStart, physicsSeed: number, collisionDoc: unknown): void;
	/**
	 * Called once per `src/host/loop.ts` `onAdvance` invocation while
	 * recording -- appends this call's transitions (already tick-stamped by
	 * `src/host/input/`) to the in-progress recording. A no-op if `start()`
	 * was never called, or after `save()`. NOT a no-op after `invalidate()`:
	 * invalidation marks the recording unsaveable but does not stop it,
	 * because `src/host/loop.ts`'s `onAdvance` seam keeps firing every frame
	 * and cannot be detached mid-recording -- `save()` is what refuses,
	 * naming the reason. `test/replay-recorder-invalidation.test.ts` pins
	 * exactly that (review finding 2026-08-29: this comment claimed the
	 * opposite of the implemented, test-pinned behaviour).
	 */
	recordTransitions(transitions: readonly InputTransition[]): void;
	/**
	 * Marks the in-progress recording invalid, naming why -- `save()` then
	 * refuses and returns that reason (AC 3: "a hot-apply during a recording
	 * invalidates the recording so it cannot be saved as a golden"). Never
	 * throws; never emits a golden. Idempotent -- a second call keeps the
	 * FIRST reason (the earliest cause is the one worth keeping).
	 */
	invalidate(reason: string): void;
	/**
	 * Ends the recording. Returns the assembled `Replay` (AC 1's own,
	 * unwidened shape) on success, or a named-reason failure if `invalidate()`
	 * was ever called during this recording, or if no recording was ever
	 * started. Always stops recording, win or lose -- a second `save()` call
	 * without a new `start()` fails naming "no recording in progress".
	 */
	save(): RecordingResult | InvalidRecordingResult;
	/** Whether a recording is currently in progress (started, not yet saved or invalidated-and-saved). */
	readonly isRecording: boolean;
}

const NOT_RECORDING_REASON = 'save(): no recording is in progress -- start() was never called, or a prior save()/invalidate() already ended it';

export function createReplayRecorder(): ReplayRecorder {
	let header: ReturnType<typeof buildHeader> | undefined;
	let transitions: InputTransition[] = [];
	let recording = false;
	let invalidReason: string | undefined;

	function start(gameStart: GameStart, physicsSeed: number, collisionDoc: unknown): void {
		header = buildHeader({ gameStart, physicsSeed, collisionDoc });
		transitions = [];
		invalidReason = undefined;
		recording = true;
	}

	function recordTransitions(newTransitions: readonly InputTransition[]): void {
		if (!recording) {
			return;
		}
		transitions.push(...newTransitions);
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
		return { ok: true, replay: { header, transitions: [...transitions] } };
	}

	return {
		start,
		recordTransitions,
		invalidate,
		save,
		get isRecording(): boolean {
			return recording;
		},
	};
}
