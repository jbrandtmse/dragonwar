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
// Falsifiability. Review finding, this pass: the spec previously recorded
// "mutation: remove the start-tick rebasing from save() -> the hash-equality
// assertion goes red" as a demonstrated pin. It CANNOT go red.
// ReplayRecorder.start() throws NonZeroStartTickError unless startTick is 0,
// and capturedStartTick is assigned only from that argument -- so
// rebaseTick(t, 0) is the identity on every legal path (replay-recorder.ts's
// own doc comment concedes as much), and deleting the rebasing changes no
// output at all. The real, demonstrated pins for DW-86 are:
// - mutation: remove the non-zero-tick guard from start() and begin recording
//   mid-session -> the hash-equality assertion goes red (its own test below).
// - mutation: break save()'s coilPrologue or durationTicks -> the runReplay()
//   assertion below goes red, because runReplay() validates every transition
//   and prologue tick against [1, durationTicks] before hashing.
// The rebasing stays as a pure, independently-meaningful step (it is what
// makes the guard's contract expressible), but it is not evidence.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHostLoop } from '../src/host/loop';
import { createReplayRecorder, NonZeroStartTickError } from '../src/host/dev/replay-recorder';
import { createReplayPlayer } from '../src/host/dev/replay-player';
import { stateHash, gameStateHash, runReplay } from '../src/sim/loop/replay';
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

/**
 * Review finding, this pass: this file previously carried a STRIPPED copy of
 * test/host-loop.test.ts's harness whose `listeners` map was written and
 * never read -- so it could not dispatch a key event, and the recording this
 * file saved contained a coil pulse and ZERO input transitions. DW-86's AC
 * says "transitions + coil pulses captured", and HostLoop.injectTransitions()
 * plus the whole transition-rebasing path were therefore never exercised
 * end to end by the proof. Restored to the dispatch-capable form.
 */
interface KeyboardTargetStub {
	dispatch(type: 'keydown' | 'keyup' | 'blur', event: { readonly code?: string; readonly timeStamp: number; preventDefault?: () => void }): void;
}

function installKeyboardTarget(): KeyboardTargetStub {
	const listeners = new Map<string, Set<(event: unknown) => void>>();
	(globalThis as unknown as { addEventListener: unknown }).addEventListener = (type: string, listener: (event: unknown) => void): void => {
		if (!listeners.has(type)) {
			listeners.set(type, new Set());
		}
		listeners.get(type)!.add(listener);
	};
	(globalThis as unknown as { removeEventListener: unknown }).removeEventListener = (): void => {};
	return {
		dispatch(type, event): void {
			for (const listener of listeners.get(type) ?? []) {
				listener(event);
			}
		},
	};
}

describe('DW-86: record through the real createHostLoop, save, play back, identical stateHash', () => {
	let raf: RafQueue;
	let keyboardTarget: KeyboardTargetStub;
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
		keyboardTarget = installKeyboardTarget();
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

		// One tick per frame throughout -- see this file's header. A real
		// flipper press/release is dispatched mid-run so the recording carries
		// genuine INPUT TRANSITIONS as well as a coil pulse (the AC says both).
		for (let ms = 1; ms <= 300; ms++) {
			if (ms === 120) {
				keyboardTarget.dispatch('keydown', { code: 'ShiftLeft', timeStamp: 119.5, preventDefault: () => {} });
			}
			if (ms === 180) {
				keyboardTarget.dispatch('keyup', { code: 'ShiftLeft', timeStamp: 179.5, preventDefault: () => {} });
			}
			raf.fire(ms);
		}
		expect(latestSnapshot!.balls.length, 'sanity: the served ball must actually be in play').toBeGreaterThan(0);

		const saved = recorder.save();
		expect(saved.ok, 'save() must succeed -- nothing invalidated this recording').toBe(true);
		if (!saved.ok) throw new Error('unreachable');
		expect(saved.coilPrologue).toEqual([{ tick: ejectTick, coil: 'c_trough_eject' }]);
		expect(saved.durationTicks, 'durationTicks must be the last tick actually observed').toBe(latestSnapshot!.tick);
		expect(
			saved.replay.transitions.length,
			'the recording must carry genuine INPUT transitions, not only a coil pulse -- otherwise injectTransitions() and the whole transition path are unexercised by this proof',
		).toBeGreaterThan(0);

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

		// Review finding, this pass. The AC names runReplay() as the verifier
		// ("when it is saved and replayed, then runReplay() reproduces the live
		// loop's stateHash at the same tick"), and nothing in the repo ever fed
		// a save() result to it -- every runReplay() call site takes a
		// checked-in *.golden.json parsed from disk. Playback above is verified
		// only against src/host/dev/replay-player.ts, a SECOND implementation of
		// the same pipeline, so a saved recording could be unpromotable to a
		// golden (out-of-range transition ticks, an off-by-one durationTicks)
		// with every gate green. runReplay() validates every transition and
		// prologue tick against [1, durationTicks] and runs its own fresh loop,
		// so this is the promotability claim actually being asserted.
		const viaRunReplay = runReplay({
			replay: saved.replay,
			collisionDoc: loadDoc(),
			durationTicks: saved.durationTicks,
			coilPrologue: saved.coilPrologue,
		});
		expect(viaRunReplay.finalHash, 'runReplay() on the SAVED recording must reproduce the live session\'s own stateHash -- the AC\'s literal claim, and what makes a recording promotable to a golden').toBe(expectedHash);
		expect(viaRunReplay.finalGameStateHash).toBe(expectedGameStateHash);
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
