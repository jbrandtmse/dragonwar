// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9 QA pass, then FIXED at code review. This file began as a
// CHARACTERIZATION test confirming one of this story's own deferred findings
// (below). The review pass fixed the gap it characterised -- DW-93 gap 3, the
// one the ledger's own note calls "a correctness hole inside DW-86's own
// deliverable ... expected fix-now at code review" -- by giving
// src/host/dev/replay-player.ts an optional narrowed `replayRecorder` dep and
// invalidating an in-progress recording in start(), the same contract and the
// same ordering as the tuning panel's hot-apply (AD-15). So the expectations
// below have FLIPPED, exactly the way this file's own header said they would
// ("This test will need updating -- its isRecording/save().ok expectations
// flip -- the day a future story wires the missing invalidation"). It is now
// a regression pin on the fix rather than a record of the gap.
//
// mutation: remove the `deps.replayRecorder?.isRecording` invalidation from
// replay-player.ts's start() -> the save().ok assertion below goes red.
//
// The original finding, for the record: "No coordination exists between the tuning
// panel, the replay player and the replay recorder, even though all three
// independently call hostLoop.reset() or otherwise touch shared loop state
// ... (3) Calling play() while a recording is in progress feeds replayed
// transitions into the live recording without ever calling
// replayRecorder.invalidate() (only the panel's hotApply() does that), so a
// saved 'golden' could silently include replayed rather than player-driven
// input. None of these three-way interactions is named by any AC."
//
// Confirmed directly by reading src/host/dev/replay-player.ts in full: it
// imports and touches only `HostLoop` (reset/injectTransitions/pulseCoil)
// and `sim/loop/replay`'s pure hash functions -- it has no reference to
// `ReplayRecorder` at all, so there is no code path by which starting
// playback could ever invalidate an in-progress recording. This test proves
// that gap is not merely a code-reading inference but REACHABLE end to end
// through the real `src/host/loop.ts` `onAdvance` seam
// `src/host/dev/replay-recorder.ts` taps, the same real-runtime evidence
// Rule 3 asks for.
//
// This is a CHARACTERIZATION test, not an acceptance-criterion pin -- no AC
// in this story's `## Tasks & Acceptance` or `## I/O & Edge-Case Matrix`
// names this three-way interaction (the deferred finding says so verbatim),
// so Rule 19's per-AC mutation discipline does not apply to it. It is,
// however, falsifiable on its own terms: it would go RED the moment a future
// story wires replayPlayer.start() to call replayRecorder.invalidate() when
// a recording is in progress -- which is the intended fix, and exactly the
// signal that would make this test worth updating rather than deleting.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHostLoop } from '../src/host/loop';
import { createReplayRecorder } from '../src/host/dev/replay-recorder';
import { createReplayPlayer } from '../src/host/dev/replay-player';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { GameStart, Snapshot } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function testGameStart(): GameStart {
	return {
		seed: 0,
		tuning: resolveTuning(),
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 },
		highscores: [],
	};
}

/** Same manual rAF queue test/host-loop.test.ts and test/replay-round-trip.test.ts each already use. */
interface RafQueue {
	readonly pending: () => number;
	fire(nowMs: number): void;
}

function installRaf(): RafQueue {
	let nextHandle = 1;
	const callbacks = new Map<number, (now: number) => void>();
	(globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = (cb: (now: number) => void): number => {
		const handle = nextHandle++;
		callbacks.set(handle, cb);
		return handle;
	};
	(globalThis as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = (handle: number): void => {
		callbacks.delete(handle);
	};
	return {
		pending: () => callbacks.size,
		fire(nowMs: number): void {
			const entry = callbacks.entries().next();
			if (entry.done) {
				throw new Error('fire(): no animation frame is queued');
			}
			const [handle, cb] = entry.value;
			callbacks.delete(handle);
			cb(nowMs);
		},
	};
}

function installKeyboardTarget(): void {
	const listeners = new Map<string, Set<(event: unknown) => void>>();
	(globalThis as unknown as { addEventListener: unknown }).addEventListener = (type: string, listener: (event: unknown) => void): void => {
		if (!listeners.has(type)) {
			listeners.set(type, new Set());
		}
		listeners.get(type)!.add(listener);
	};
	(globalThis as unknown as { removeEventListener: unknown }).removeEventListener = (): void => {};
}

describe('src/host/dev/ -- cross-seam coordination gap between the recorder and the player (confirming, not fixing, this story\'s own deferred finding)', () => {
	let raf: RafQueue;
	let originalRaf: unknown;
	let originalCancel: unknown;
	let originalAddEventListener: unknown;
	let originalRemoveEventListener: unknown;

	beforeEach(() => {
		const g = globalThis as unknown as Record<string, unknown>;
		originalRaf = g.requestAnimationFrame;
		originalCancel = g.cancelAnimationFrame;
		originalAddEventListener = g.addEventListener;
		originalRemoveEventListener = g.removeEventListener;
		raf = installRaf();
		installKeyboardTarget();
	});

	afterEach(() => {
		const g = globalThis as unknown as Record<string, unknown>;
		g.requestAnimationFrame = originalRaf;
		g.cancelAnimationFrame = originalCancel;
		g.addEventListener = originalAddEventListener;
		g.removeEventListener = originalRemoveEventListener;
	});

	it('replayPlayer.start() during an ACTIVE recording never calls replayRecorder.invalidate() -- the live recording stays saveable (ok: true) despite the sim being reset and fed replayed input mid-session', () => {
		// Step 1: an independent, throwaway session produces a short recording
		// to play back later (the exact shape a saved recording / promoted
		// golden already has).
		let sourceSnapshot: Snapshot | undefined;
		const sourceRecorder = createReplayRecorder();
		const sourceHost = createHostLoop(
			loadDoc(),
			(output) => {
				sourceSnapshot = output.snapshot;
			},
			(_elapsedMs, transitions, tick) => {
				sourceRecorder.recordTransitions(transitions, tick);
			},
		);
		sourceHost.start();
		raf.fire(0);
		sourceRecorder.start(testGameStart(), 1, loadDoc(), sourceSnapshot!.tick);
		const ejectTick = sourceSnapshot!.tick + 1;
		sourceHost.pulseCoil('c_trough_eject');
		sourceRecorder.recordCoilPulse('c_trough_eject', ejectTick);
		for (let ms = 1; ms <= 20; ms++) {
			raf.fire(ms);
		}
		const saved = sourceRecorder.save();
		expect(saved.ok, 'sanity: the source recording must have saved cleanly').toBe(true);
		if (!saved.ok) throw new Error('unreachable');
		// Stop the source host so its own queued frame does not interleave with
		// the live host's below -- both share the SAME installed rAF stub.
		sourceHost.stop();

		// Step 2: the "live" host + recorder stand in for a user's in-progress
		// recording session -- exactly test/replay-round-trip.test.ts's own
		// wiring, reused here for a different scenario.
		const liveRecorder = createReplayRecorder();
		const activePlayer: { current: { onFrame(snapshot: Snapshot): void } } = { current: { onFrame: () => {} } };
		let liveSnapshot: Snapshot | undefined;
		const liveHost = createHostLoop(
			loadDoc(),
			(output) => {
				liveSnapshot = output.snapshot;
				activePlayer.current.onFrame(output.snapshot);
			},
			(_elapsedMs, transitions, tick) => {
				liveRecorder.recordTransitions(transitions, tick);
			},
		);
		liveHost.start();
		raf.fire(0);
		liveRecorder.start(testGameStart(), 2, loadDoc(), liveSnapshot!.tick);
		expect(liveRecorder.isRecording, 'sanity: a live recording must genuinely be in progress before playback starts').toBe(true);

		// A little genuine live activity first, so the scenario is realistic:
		// the user has already been recording for a moment before pressing Play.
		for (let ms = 1; ms <= 5; ms++) {
			raf.fire(ms);
		}
		expect(liveRecorder.isRecording, 'sanity: still recording just before Play is pressed').toBe(true);

		// Step 3: Play is pressed on the SAME live host, mid-recording -- the
		// exact scenario the deferred finding describes. player.start() calls
		// hostLoop.reset(...) (rebuilding the sim out from under the
		// in-progress recording) and hostLoop.injectTransitions(...), neither of
		// which touches liveRecorder in any way.
		let playResult: { finalHash: string; finalGameStateHash: string } | undefined;
		const player = createReplayPlayer(
			(result) => {
				playResult = result;
			},
			{ replayRecorder: liveRecorder },
		);
		activePlayer.current = player;
		player.start(liveHost, saved);

		// invalidate() marks the recording unsaveable; it does not END it (only
		// save()/invalidate-then-save do), exactly like the tuning panel's
		// hot-apply -- so isRecording is still true here, and the refusal shows
		// up at save() below.
		expect(
			liveRecorder.isRecording,
			'invalidate() marks a recording unsaveable without ending it -- the same semantics the panel hot-apply already relies on',
		).toBe(true);

		for (let ms = 6; ms <= saved.durationTicks + 10; ms++) {
			raf.fire(ms);
			if (!player.isPlaying) {
				break;
			}
		}
		expect(playResult, 'sanity: playback must have actually completed for this scenario to mean anything').toBeDefined();

		// The live recording spent the whole playback recording REPLAYED
		// transitions against a sim that was reset out from under it
		// mid-session, not genuine player-driven input. It must now REFUSE to
		// save rather than hand back a silently contaminated "golden".
		const result = liveRecorder.save();
		expect(
			result.ok,
			'a recording that was reset and fed replayed input mid-session must refuse to save -- silent contamination is exactly what DW-93 gap 3 warned about',
		).toBe(false);
		if (result.ok) throw new Error('unreachable');
		expect(result.reason, 'the refusal must name playback as the cause, not some unrelated invalidation').toContain('playback');
	});
});
