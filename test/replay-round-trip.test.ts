// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9, DW-86: "record then replay -- recorder started on a freshly
// reset loop, transitions + coil pulses captured, saved | runReplay() on the
// saved recording reproduces the live loop's stateHash at the same tick."
// This is the claim `DW-86` says is provably false before this story
// (`src/host/dev/replay-recorder.ts`'s own pre-story doc comment: "no
// playback entry point; nothing under src/host/ calls runReplay()").
//
// Driven end to end through the REAL `src/host/loop.ts` `createHostLoop()`
// (never `sim/loop` directly), using `test/host-loop.test.ts`'s own manual
// rAF + keyboard-target harness -- the real-runtime evidence Rule 3 asks for
// at the host tier. Frames are fired ONE TICK APART (1 ms increments at the
// shipped 1000 Hz) throughout, both while recording and while playing back:
// `src/host/dev/replay-player.ts`'s own header discloses that its
// coil-pulse scheduler is exact only at that granularity (a real rAF session
// advancing many ticks per frame can fire a pulse late) -- this test
// exercises the case the mechanism is actually built for.
//
// Falsifiability (spec): mutation: remove the start-tick rebasing from
// save() -> the hash-equality assertion goes red. Second, independent:
// mutation: remove the non-zero-tick guard from start() and begin recording
// mid-session -> the same assertion goes red.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHostLoop } from '../src/host/loop';
import { createReplayRecorder, NonZeroStartTickError } from '../src/host/dev/replay-recorder';
import { createReplayPlayer } from '../src/host/dev/replay-player';
import { stateHash, gameStateHash } from '../src/sim/loop/replay';
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

/** Same manual rAF queue test/host-loop.test.ts's own harness uses. */
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

describe('DW-86: record through the real createHostLoop, save, play back, identical stateHash', () => {
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

	it('a served-and-rolling ball recorded live reproduces the IDENTICAL stateHash and gameStateHash when played back through the host loop', () => {
		const recorder = createReplayRecorder();
		// A mutable holder, not a variable reassigned later: host's own onFrame
		// closure below captures THIS object once, so swapping
		// activePlayer.current (once playback starts) is visible to it without
		// re-wiring createHostLoop() a second time.
		const activePlayer: { current: { onFrame(snapshot: Snapshot): void } } = { current: { onFrame: () => {} } };

		let latestSnapshot: Snapshot | undefined;
		const host = createHostLoop(
			loadDoc(),
			(output) => {
				latestSnapshot = output.snapshot;
				activePlayer.current.onFrame(output.snapshot);
			},
			(_elapsedMs, transitions, tick) => {
				recorder.recordTransitions(transitions, tick);
			},
		);

		host.start();
		raf.fire(0); // establishes the origin: tick 0, no owed time.
		expect(latestSnapshot!.tick, 'sanity: the loop must genuinely be at tick 0 before recording starts').toBe(0);

		recorder.start(testGameStart(), 12345, loadDoc(), latestSnapshot!.tick);
		expect(recorder.isRecording).toBe(true);

		// Serve a ball (trough eject), recording the pulse at the tick it will
		// actually land on (pulseCoil()'s own "next tick" contract).
		const ejectTick = latestSnapshot!.tick + 1;
		host.pulseCoil('c_trough_eject');
		recorder.recordCoilPulse('c_trough_eject', ejectTick);

		// One tick per frame throughout -- see this file's header.
		for (let ms = 1; ms <= 300; ms++) {
			raf.fire(ms);
		}
		expect(latestSnapshot!.balls.length, 'sanity: the served ball must actually be in play').toBeGreaterThan(0);

		const saved = recorder.save();
		expect(saved.ok, 'save() must succeed -- nothing invalidated this recording').toBe(true);
		if (!saved.ok) throw new Error('unreachable');
		expect(saved.coilPrologue).toEqual([{ tick: ejectTick, coil: 'c_trough_eject' }]);
		expect(saved.durationTicks, 'durationTicks must be the last tick actually observed').toBe(latestSnapshot!.tick);

		// The LIVE session's own final hash -- the target the played-back
		// recording must reproduce.
		const expectedHash = stateHash(latestSnapshot!.game, latestSnapshot!.balls);
		const expectedGameStateHash = gameStateHash(latestSnapshot!.game);

		// Play it back through the SAME host loop -- player.start() resets it
		// to a fresh sim first (DW-86: rebasing alone is insufficient; the
		// initial world state must also be fresh).
		let playResult: { finalHash: string; finalGameStateHash: string } | undefined;
		const realPlayer = createReplayPlayer((result) => {
			playResult = result;
		});
		activePlayer.current = realPlayer;
		realPlayer.start(host, saved);

		for (let ms = 1; ms <= saved.durationTicks + 5; ms++) {
			raf.fire(ms);
			if (!realPlayer.isPlaying) {
				break;
			}
		}

		expect(playResult, 'playback must have completed and reported a result').toBeDefined();
		expect(playResult!.finalHash, 'the played-back recording must reproduce the IDENTICAL stateHash the live session produced').toBe(expectedHash);
		expect(playResult!.finalGameStateHash).toBe(expectedGameStateHash);
	});

	it('start() throws NonZeroStartTickError when the loop\'s tick is not 0 -- a mid-session recording would be silently unreproducible otherwise', () => {
		const recorder = createReplayRecorder();
		let latestSnapshot: Snapshot | undefined;
		const host = createHostLoop(loadDoc(), (output) => {
			latestSnapshot = output.snapshot;
		});
		host.start();
		for (let ms = 0; ms <= 50; ms++) {
			raf.fire(ms);
		}
		expect(latestSnapshot!.tick, 'sanity: the loop must genuinely be past tick 0').toBeGreaterThan(0);

		expect(() => recorder.start(testGameStart(), 1, loadDoc(), latestSnapshot!.tick)).toThrow(NonZeroStartTickError);
		expect(recorder.isRecording, 'a throwing start() must not leave the recorder in a recording state').toBe(false);

		// Recovery: host.reset() brings the loop back to tick 0, and THEN
		// start() succeeds -- the documented workflow ("the panel's Record
		// resets first").
		host.reset();
		raf.fire(0);
		expect(() => recorder.start(testGameStart(), 1, loadDoc(), latestSnapshot!.tick)).not.toThrow();
	});
});
