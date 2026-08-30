// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9 (DW-86), the play half: plays a saved recording
// (`src/host/dev/replay-recorder.ts`'s `RecordingResult`) back through the
// LIVE `src/host/loop.ts` host loop -- reset (to a fresh sim built from the
// recording's own `header.gameStart.tuning`), inject the recorded
// transitions, then fire each declared `coilPrologue` pulse at its own
// scheduled tick as real frames advance -- and reports the resulting state
// hash once `durationTicks` is reached, in the SAME shape
// `sim/loop/replay.ts`'s `runReplay()` produces, so a caller can assert the
// two match (`DW-86`'s own claim: "a recording reproduces its own hash").
//
// `host/**`, not `sim/**` (AD-16): this file imports `sim/loop/replay`'s
// `stateHash()`/`gameStateHash()` (pure functions, legal from `host/**`) to
// compute the SAME hash `runReplay()` would, without importing `sim/physics`
// or `sim/rules` -- it never touches physics directly, only `HostLoop`'s own
// public seam (`reset()`, `injectTransitions()`, `pulseCoil()`).
//
// Scheduling note (honestly stated, not implied): `pulseCoil()`'s own
// contract queues a pulse for "the very next tick `advance()` processes"
// (`sim/loop/index.ts`'s own doc comment) -- there is no "pulse at tick N
// specifically" primitive. `onFrame()` below therefore fires a queued pulse
// the moment it observes `snapshot.tick >= pulse.tick - 1`, exactly
// mirroring `runReplay()`'s own "issued immediately before the advance()
// call for its own tick" ordering when `onFrame()` is called at least once
// at every tick boundary (true of the deterministic single-tick-per-frame
// harness `test/replay-round-trip.test.ts` drives this through). Review
// finding, this pass: the `>=` (previously strict `===`) is deliberate -- a
// real rAF session that advances many ticks inside one frame (the ORDINARY
// case at the shipped 1000 Hz sim against a ~60 fps rAF, not an edge case)
// can skip past `pulse.tick - 1` entirely; `>=` still fires that pulse (one
// or more ticks late) on the next `onFrame()` call instead of silently
// dropping it forever, which the original strict equality did. Late-but-
// fired is a known, disclosed limitation of the dev-only "Play" affordance,
// not of the recording itself -- a golden promoted from a saved recording is
// always replayed through `runReplay()`'s own exact per-tick loop, never
// through this file.

import { stateHash, gameStateHash } from '../../sim/loop/replay';
import type { CoilPrologueEntry } from '../../sim/loop/replay';
import type { HostLoop } from '../loop';
import type { Snapshot } from '../../sim/table/names';
import type { RecordingResult } from './replay-recorder';

/** The subset of `RecordingResult` a player needs -- the same three fields `save()` returns, so a caller can pass its result straight through. */
export type PlayableRecording = Pick<RecordingResult, 'replay' | 'coilPrologue' | 'durationTicks'>;

export interface ReplayPlayResult {
	/** AD-15's full hash (GameState + quantised ball positions), computed the SAME way `runReplay()`'s own `finalHash` is. */
	readonly finalHash: string;
	/** The GameState-only portion (AD-15's browser-parity hash), matching `runReplay()`'s own `finalGameStateHash`. */
	readonly finalGameStateHash: string;
}

export interface ReplayPlayer {
	/**
	 * Resets `hostLoop` to a fresh sim built from `recording`'s own header
	 * tuning, queues its transitions via `injectTransitions()`, and arms the
	 * coil-prologue scheduler. Must be followed by `onFrame()` being called
	 * once per host-loop frame (the same dev-only tap
	 * `src/host/boot.ts` already wires the recorder through) until playback
	 * completes.
	 */
	start(hostLoop: HostLoop, recording: PlayableRecording): void;
	/**
	 * Called once per host-loop frame with that frame's `snapshot` -- a
	 * no-op when not currently playing. Fires any coil pulse whose scheduled
	 * tick has just been reached (this file's own header explains the exact
	 * timing this depends on), and once `snapshot.tick` reaches
	 * `durationTicks`, computes the final hashes and calls the `onComplete`
	 * callback `start()`'s caller registered via `createReplayPlayer()`.
	 */
	onFrame(snapshot: Snapshot): void;
	/** Whether a recording is currently being played back (started, not yet completed). */
	readonly isPlaying: boolean;
}

/**
 * The only two members of `ReplayRecorder` this file needs, narrowed exactly
 * the way `src/host/dev/tuning-panel.ts` narrows the same dependency for the
 * same reason -- so the player cannot reach into the rest of the recorder's
 * surface.
 */
export interface ReplayPlayerDeps {
	readonly replayRecorder?: { invalidate(reason: string): void; readonly isRecording: boolean };
}

/**
 * Builds a replay player. `onComplete` is called exactly once per `start()`
 * call, when `durationTicks` is reached.
 *
 * `deps.replayRecorder` is optional only so a test can construct a player in
 * isolation; `src/host/boot.ts` always passes the real recorder. See
 * `start()` for what it is for.
 */
export function createReplayPlayer(onComplete: (result: ReplayPlayResult) => void, deps: ReplayPlayerDeps = {}): ReplayPlayer {
	let coilQueue: CoilPrologueEntry[] = [];
	let durationTicks = 0;
	let activeHostLoop: HostLoop | undefined;
	let playing = false;

	function start(hostLoop: HostLoop, recording: PlayableRecording): void {
		// Review finding, this pass (DW-93 gap 3 -- the ledger's own note calls
		// it "a correctness hole inside DW-86's own deliverable ... expected
		// fix-now at code review"). Starting playback calls hostLoop.reset()
		// below, rebuilding the sim out from under any recording in progress,
		// and then feeds it REPLAYED transitions through the same onAdvance tap
		// the recorder is listening on. Without this, that recording stayed
		// saveable -- save() returned { ok: true } for a "golden" whose input
		// was replayed rather than player-driven. Same contract, and the same
		// ordering, as the tuning panel's hot-apply (AD-15: the thing that
		// invalidates a recording does so BEFORE it rebuilds the sim).
		if (deps.replayRecorder?.isRecording) {
			deps.replayRecorder.invalidate(
				'replay playback started while a recording was in progress -- the recording would otherwise contain REPLAYED input, not player-driven input',
			);
		}
		activeHostLoop = hostLoop;
		durationTicks = recording.durationTicks;
		coilQueue = [...recording.coilPrologue].sort((a, b) => a.tick - b.tick);
		playing = true;
		hostLoop.reset({ tuning: recording.replay.header.gameStart.tuning });
		hostLoop.injectTransitions(recording.replay.transitions);
	}

	function onFrame(snapshot: Snapshot): void {
		if (!playing || !activeHostLoop) {
			return;
		}
		// See this file's header: fires a pulse the moment the tick immediately
		// BEFORE its own target has just completed -- pulseCoil()'s own "next
		// tick" contract then lands it exactly on the target tick. Review
		// finding, this pass: the original strict `=== snapshot.tick + 1` check
		// could silently DROP a pulse forever (not merely fire it late) once a
		// multi-tick rAF frame advanced snapshot.tick PAST the target -- at the
		// shipped 1000 Hz sim against a ~60 fps rAF loop, a frame skipping past
		// the exact target tick is the ORDINARY case, not an edge case, so a
		// scheduled pulse (e.g. serving a ball) was more likely to be
		// permanently lost than "one or more ticks late" as this file
		// previously (and inaccurately) disclosed. `<=` lets a skipped-past
		// pulse still fire on the next onFrame() call instead of being lost --
		// still late under a multi-tick frame (the exact-timing limitation
		// below is real and unavoidable without a per-tick callback), but never
		// silently dropped.
		while (coilQueue.length > 0 && coilQueue[0]!.tick <= snapshot.tick + 1) {
			activeHostLoop.pulseCoil(coilQueue.shift()!.coil);
		}
		if (snapshot.tick >= durationTicks) {
			playing = false;
			onComplete({
				finalHash: stateHash(snapshot.game, snapshot.balls),
				finalGameStateHash: gameStateHash(snapshot.game),
			});
		}
	}

	return {
		start,
		onFrame,
		get isPlaying(): boolean {
			return playing;
		},
	};
}
