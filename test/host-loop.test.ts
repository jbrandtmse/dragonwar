// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Review finding 2026-08-28: src/host/loop.ts -- the ONE module that decides
// how wall-clock time enters the fixed-step loop -- had no executed test
// anywhere. Nothing imported it. `test/entry-html-csp.test.ts` reads
// `src/host/boot.ts` as a STRING, and every other test called syncBalls() /
// applyPitch() / advance() directly, bypassing the driver entirely. Changing
// `nowMs - lastFrameMs` to `nowMs` (so every frame owes performance.now()
// milliseconds, permanently pinning the 200 ms discard cap and running the
// sim at roughly 12x real time) left the whole suite green.
//
// `host/loop.ts` touches no DOM global except requestAnimationFrame /
// cancelAnimationFrame, so a manual queue over those two is enough to drive
// it for real -- no Babylon, no jsdom.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHostLoop } from '../src/host/loop';
import type { FrameOutput } from '../src/sim/table/names';
import type { InputTransition } from '../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** A manual requestAnimationFrame queue: nothing fires until the test says so, and with the timestamp the test chooses. */
interface RafQueue {
	readonly pending: () => number;
	fire(nowMs: number): void;
	readonly cancelled: () => number;
}

function installRaf(): RafQueue {
	let nextHandle = 1;
	let cancelledCount = 0;
	const callbacks = new Map<number, (now: number) => void>();

	(globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = (cb: (now: number) => void): number => {
		const handle = nextHandle++;
		callbacks.set(handle, cb);
		return handle;
	};
	(globalThis as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = (handle: number): void => {
		if (callbacks.delete(handle)) {
			cancelledCount += 1;
		}
	};

	return {
		pending: () => callbacks.size,
		cancelled: () => cancelledCount,
		fire(nowMs: number): void {
			// Exactly one frame, the way a browser delivers them.
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
 * `src/host/loop.ts` (Story 1.6) attaches `src/host/input`'s keyboard
 * listeners to `globalThis` (which IS `window` in a real browser main
 * thread) inside `start()`, so every test below needs a stub target even
 * when it never dispatches a synthetic key event itself -- otherwise
 * `start()` throws on `target.addEventListener is not a function`, the same
 * way `installRaf()` above stubs requestAnimationFrame/cancelAnimationFrame
 * for the SAME reason.
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
	(globalThis as unknown as { removeEventListener: unknown }).removeEventListener = (type: string, listener: (event: unknown) => void): void => {
		listeners.get(type)?.delete(listener);
	};

	return {
		dispatch(type, event): void {
			for (const listener of listeners.get(type) ?? []) {
				listener(event);
			}
		},
	};
}

describe('src/host/loop.ts -- the rAF driver (AD-4, task 21)', () => {
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

	it('advances the sim by the DELTA between successive frame timestamps, not by the timestamp itself', () => {
		const outputs: FrameOutput[] = [];
		const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
		host.start();

		// A browser's rAF timestamp is time since navigation start, not since
		// the loop started: the first frame arrives at a large absolute value.
		raf.fire(5000);
		raf.fire(5016.667);
		raf.fire(5033.334);

		expect(outputs).toHaveLength(3);
		// Frame 1 is the accumulator origin: no previous timestamp, so no owed time.
		expect(outputs[0].snapshot.tick, 'the first frame establishes the origin and owes zero ticks').toBe(0);
		// Frames 2 and 3 owe their own elapsed time -- 16 then 17 ticks, the
		// 0.667 ms remainder carried (AD-4). If elapsedMs were the raw
		// timestamp, frame 2 would owe MAX_OWED_TICKS and emit sim_time_discarded.
		expect(outputs[1].snapshot.tick).toBe(16);
		expect(outputs[2].snapshot.tick).toBe(33);
		for (const output of outputs) {
			expect(
				output.events.some((e) => e.type === 'sim_time_discarded'),
				'an ordinary 60 Hz frame must never hit the 200 ms cap -- it would mean the driver passed an absolute timestamp as elapsed time',
			).toBe(false);
		}
	});

	it('keeps requesting frames while running, and stop() ends the chain', () => {
		const host = createHostLoop(loadDoc(), () => {});
		host.start();
		expect(raf.pending()).toBe(1);

		raf.fire(0);
		expect(raf.pending(), 'the driver must re-arm after each frame').toBe(1);
		raf.fire(16.667);
		expect(raf.pending()).toBe(1);

		host.stop();
		expect(raf.pending(), 'stop() must cancel the queued frame').toBe(0);
		expect(raf.cancelled()).toBe(1);
	});

	it('start() is idempotent -- a second call does not queue a second, parallel chain', () => {
		const host = createHostLoop(loadDoc(), () => {});
		host.start();
		host.start();
		expect(raf.pending()).toBe(1);
	});

	// Review finding 2026-08-28: tick() re-armed unconditionally after
	// onFrame, so stop() called from INSIDE onFrame nulled the handle and the
	// next line immediately queued another frame -- the loop ran forever.
	it('stop() called from inside onFrame actually stops the loop', () => {
		let frames = 0;
		let host: ReturnType<typeof createHostLoop> | undefined;
		host = createHostLoop(loadDoc(), () => {
			frames += 1;
			host!.stop();
		});
		host.start();

		raf.fire(0);
		expect(frames).toBe(1);
		expect(raf.pending(), 'stop() from within the frame must not be undone by the re-arm below it').toBe(0);
	});

	// Review finding 2026-08-28: a throw left the already-fired handle in
	// place, so the chain was dead AND start() reported "already running"
	// forever after. advance() now throws on a bad elapsedMs, making this
	// reachable rather than theoretical.
	it('a throw out of onFrame stops the chain cleanly and leaves the loop restartable', () => {
		let shouldThrow = true;
		let frames = 0;
		const host = createHostLoop(loadDoc(), () => {
			frames += 1;
			if (shouldThrow) {
				throw new Error('presentation blew up');
			}
		});
		host.start();

		expect(() => raf.fire(0)).toThrow(/presentation blew up/);
		expect(raf.pending(), 'a dead frame must not leave a queued successor').toBe(0);

		shouldThrow = false;
		host.start();
		expect(raf.pending(), 'start() must be able to restart after a throw, not report "already running" forever').toBe(1);
		raf.fire(16.667);
		expect(frames).toBe(2);
	});

	it('pulseCoil() reaches the sim loop -- the dev hatch src/host/boot.ts publishes', () => {
		const outputs: FrameOutput[] = [];
		const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
		host.start();
		raf.fire(0);

		host.pulseCoil('c_trough_eject');
		raf.fire(1);

		const last = outputs[outputs.length - 1];
		expect(last.snapshot.balls, 'a trough eject issued through the host must put a ball in the snapshot').toHaveLength(1);
	});

	it('setCoilEnabled() reaches the sim loop -- the dev hatch src/host/boot.ts publishes', () => {
		// Code review 2026-08-29 (iteration 2): this test used to assert only
		// `not.toThrow()` twice plus `outputs.length > 0`, all three of which an
		// EMPTY setCoilEnabled() body in src/host/loop.ts satisfies -- so the
		// one thing its own name claims ("reaches the sim loop") was the one
		// thing it did not observe, and the dev hatch boot.ts publishes had no
		// failing test anywhere. It now drives the disabled coil through the
		// real host -> sim stack and watches the bat.
		const outputs: FrameOutput[] = [];
		const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
		host.start();
		raf.fire(0);

		host.setCoilEnabled('c_flipper_l', false);
		raf.fire(16.667); // the disable command lands
		const angleBefore = outputs[outputs.length - 1]!.snapshot.mechanisms.flippers.l.angleDeg;

		keyboardTarget.dispatch('keydown', { code: 'ShiftLeft', timeStamp: 20, preventDefault: () => {} });
		for (let i = 2; i < 12; i++) {
			raf.fire(16.667 * i);
		}
		expect(
			outputs[outputs.length - 1]!.snapshot.mechanisms.flippers.l.angleDeg,
			'a coil disabled through the host dev hatch must leave the bat unmoved even while the key is held',
		).toBe(angleBefore);

		// ...and re-enabling it through the same hatch, with the key STILL
		// held, must let the bat move -- so the test fails in both directions.
		host.setCoilEnabled('c_flipper_l', true);
		for (let i = 12; i < 24; i++) {
			raf.fire(16.667 * i);
		}
		expect(
			outputs[outputs.length - 1]!.snapshot.mechanisms.flippers.l.angleDeg,
			're-enabling the coil through the host dev hatch must let the same held press move the bat',
		).not.toBe(angleBefore);
	});

	// Code review 2026-08-29 (iteration 2): src/host/loop.ts's tickAt() -- the
	// whole of AD-4's accumulator-origin arithmetic, and the only new host code
	// that decides WHEN a keypress reaches the sim -- had no test that observed
	// the tick it produces. test/host-input.test.ts always injects a stub
	// tickAt, and the integration test below runs the real one only with the
	// origin still at zero (raf.fire(0)), where `domTimeStampMs - originMs` and
	// `originTick + n` are both identities. Demonstrated: deleting `- originMs`
	// from tickAt() left the whole suite green at 594 passed -- in a browser
	// that stamps every keypress tens of thousands of ticks into the future and
	// no flipper ever responds. This test moves the origin off zero first.
	it('tickAt() stamps against the CURRENT accumulator origin, not the epoch -- a keypress after several frames still lands in the frame that follows it', () => {
		const outputs: FrameOutput[] = [];
		const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
		host.start();
		// Four frames, so originMs and originTick are both well away from 0.
		for (let i = 0; i < 4; i++) {
			raf.fire(16.667 * i);
		}
		const originTick = outputs[outputs.length - 1]!.snapshot.tick;
		const angleBefore = outputs[outputs.length - 1]!.snapshot.mechanisms.flippers.l.angleDeg;
		expect(originTick, 'sanity: the origin must be off zero for this test to mean anything').toBeGreaterThan(0);

		// A keypress 8 ms into the next frame. Stamped correctly it lands ~8
		// ticks after the origin, i.e. inside the frame raf.fire below runs;
		// stamped against the epoch it lands ~originTick ticks too far ahead
		// and sits in pendingTransitions instead.
		keyboardTarget.dispatch('keydown', { code: 'ShiftLeft', timeStamp: 16.667 * 3 + 8, preventDefault: () => {} });
		raf.fire(16.667 * 4);

		const after = outputs[outputs.length - 1]!.snapshot;
		expect(after.tick, 'the frame carrying the keypress must have run past the stamped tick').toBeGreaterThan(originTick);
		expect(
			after.mechanisms.flippers.l.angleDeg,
			'a keypress stamped against a NON-ZERO origin must still be applied inside the very next frame -- if tickAt() ignores originMs the transition is stamped thousands of ticks ahead and the bat never moves',
		).not.toBe(angleBefore);
	});

	// Story 1.6, Integration AC: "with the installRaf() harness, a synthetic
	// ShiftLeft keydown between two frames results in advance() being called
	// with a transition whose tick lies inside that frame's range, and the
	// resulting FrameOutput's flipper angle has moved."
	it("a synthetic ShiftLeft keydown between two frames reaches advance() with a tick inside the frame's range, and moves the flipper", () => {
		const outputs: FrameOutput[] = [];
		const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
		host.start();
		raf.fire(0); // establishes the origin: tick 0, no owed time.

		const beforeTick = outputs[outputs.length - 1]!.snapshot.tick;
		const angleBefore = outputs[outputs.length - 1]!.snapshot.mechanisms.flippers.l.angleDeg;

		// Fired BETWEEN frame 1 (nowMs = 0) and frame 2 (nowMs = 16.667) --
		// exactly the DOM-event timing this integration AC describes.
		keyboardTarget.dispatch('keydown', { code: 'ShiftLeft', timeStamp: 8, preventDefault: () => {} });

		raf.fire(16.667);
		const afterTick = outputs[outputs.length - 1]!.snapshot.tick;

		expect(afterTick, 'the frame carrying the keypress must have actually run some ticks').toBeGreaterThan(beforeTick);
		const angleAfter = outputs[outputs.length - 1]!.snapshot.mechanisms.flippers.l.angleDeg;
		expect(angleAfter, 'the left flipper must have moved once the key is held for a whole frame').not.toBe(angleBefore);
	});

	// Story 1.8 (AC 3): the third, OPTIONAL constructor argument
	// `src/host/dev/replay-recorder.ts` taps -- called with each frame's
	// elapsedMs and the transitions THAT CALL actually applied, immediately
	// after advance() returns.
	describe('createHostLoop()\'s third argument, onAdvance -- the record/play seam (AC 3)', () => {
		it('is called once per frame with that frame\'s elapsedMs and transitions, AFTER advance() but before onFrame observes anything new', () => {
			const calls: Array<{ elapsedMs: number; transitions: unknown }> = [];
			// Review finding 2026-08-29: this test's title claimed an ORDERING
			// ("AFTER advance() but before onFrame") that its body never
			// asserted -- onFrame was an empty callback and no relative order
			// was recorded. `order` makes the title's claim a real,
			// failing-capable check.
			const order: string[] = [];
			const host = createHostLoop(
				loadDoc(),
				() => {
					order.push('onFrame');
				},
				(elapsedMs, transitions) => {
					order.push('onAdvance');
					calls.push({ elapsedMs, transitions });
				},
			);
			host.start();

			raf.fire(0);
			raf.fire(16.667);
			expect(order, 'onAdvance must run BEFORE onFrame within each frame, exactly as this test\'s own name claims').toEqual(['onAdvance', 'onFrame', 'onAdvance', 'onFrame']);
			expect(calls, 'onAdvance must fire once per rAF frame, same as onFrame').toHaveLength(2);
			expect(calls[0]!.elapsedMs, 'the FIRST frame owes 0 elapsed ms (it establishes the origin)').toBe(0);
			expect(calls[1]!.elapsedMs, 'the second frame owes the DELTA since the first, not the raw timestamp').toBeCloseTo(16.667, 5);
		});

		it('is called with the SAME transitions advance() actually received -- a synthetic keypress reaches onAdvance\'s own transitions array', () => {
			const calls: InputTransition[][] = [];
			const host = createHostLoop(
				loadDoc(),
				() => {},
				(_elapsedMs, transitions) => {
					calls.push([...transitions]);
				},
			);
			host.start();
			raf.fire(0);

			keyboardTarget.dispatch('keydown', { code: 'ShiftLeft', timeStamp: 8, preventDefault: () => {} });
			raf.fire(16.667);

			const lastCall = calls[calls.length - 1]!;
			expect(lastCall.length, 'the frame carrying the synthetic keydown must have handed onAdvance a non-empty transitions array').toBeGreaterThan(0);
			expect(lastCall.some((t) => t.frame.flipper_l === true), 'the transition onAdvance received must be the SAME ShiftLeft -> flipper_l transition advance() applied').toBe(true);
		});

		// Review finding 2026-08-29: the inner try/catch around onAdvance was
		// itself added by an earlier review pass ("a throw from a dev-only
		// recording tap must not stop live gameplay"), but no test made
		// onAdvance throw -- deleting the guard left all three onAdvance tests
		// green, because none of their callbacks throws. This drives the guard
		// directly, and is the deliberate mirror image of "a throw out of
		// onFrame stops the chain cleanly" above: onFrame kills the loop, a
		// dev-only tap must not.
		it('a THROWING onAdvance is swallowed -- onFrame still runs that frame and the loop stays armed (unlike a throw out of onFrame)', () => {
			const outputs: FrameOutput[] = [];
			let advanceCalls = 0;
			const host = createHostLoop(
				loadDoc(),
				(output) => outputs.push(output),
				() => {
					advanceCalls += 1;
					throw new Error('the dev recording tap blew up');
				},
			);
			host.start();

			expect(() => raf.fire(0), 'a throwing recording tap must not escape the frame').not.toThrow();
			expect(advanceCalls, 'the tap must actually have been called and actually have thrown, or this proves nothing').toBe(1);
			expect(outputs, 'onFrame must still have run for that same frame -- presentation is unaffected by the tap').toHaveLength(1);
			expect(raf.pending(), 'the loop must still be armed: a dev-only tap has no power to stop live gameplay').toBe(1);

			expect(() => raf.fire(16.667), 'and the next frame must still run').not.toThrow();
			expect(outputs).toHaveLength(2);
			expect(advanceCalls).toBe(2);
		});

		it('omitting onAdvance entirely (the two-argument call every OTHER test in this file uses) behaves exactly as before this story -- optional, never required', () => {
			const outputs: FrameOutput[] = [];
			const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
			host.start();
			expect(() => raf.fire(0)).not.toThrow();
			expect(outputs).toHaveLength(1);
		});
	});
});
