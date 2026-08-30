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
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import { NO_FRAME } from '../src/sim/loop';
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

function countBallLaunched(outputs: readonly FrameOutput[]): number {
	return outputs.flatMap((output) => output.events).filter((event) => (event as { readonly type: string }).type === 'ball_launched').length;
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

	// Story 1.9's rebuild seam (DW-86): reset() stops the rAF chain, builds a
	// FRESH sim/loop and resets the AD-4 accumulator origin -- the ONE seam
	// hot-apply (AC 1), pitch (AC 4), elasticity falloff (AC 3) and the hop
	// A/B (AC 2) all hang off.
	//
	// Falsifiability (spec): pinning test -- run N frames, reset({ tuning:
	// override }), run N frames, assert the snapshot observable changed.
	// mutation: make reset() keep the existing loop instead of constructing a
	// fresh one -> the post-reset snapshot assertion goes red.
	describe('reset() -- the rebuild seam (Story 1.9, DW-86)', () => {
		it('rebuilds the sim with an overridden tuning: the next frame\'s snapshot reflects the new value (effectivePitchDeg)', () => {
			const outputs: FrameOutput[] = [];
			const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
			host.start();
			raf.fire(0);
			raf.fire(16.667);
			expect(outputs[outputs.length - 1]!.snapshot.effectivePitchDeg, 'sanity: starts at the shipped default').toBe(6.5);

			const overridden = resolveTuning({
				...TUNING,
				defaultPitchDeg: { value: 8.5, source: 'test fixture', confidence: 'unverified' as const },
			});
			host.reset({ tuning: overridden });

			// reset() re-arms the chain (the loop was running), so the queued
			// frame carries the FRESH sim's own first snapshot -- tick 0, no
			// owed time, exactly like the very first frame after start().
			expect(raf.pending(), 'reset() must leave the loop armed for its next frame, since it was running').toBe(1);
			raf.fire(0);
			const afterReset = outputs[outputs.length - 1]!.snapshot;
			expect(afterReset.tick, 'the rebuilt sim\'s accumulator origin must be fresh -- tick 0 on its first frame').toBe(0);
			expect(afterReset.effectivePitchDeg, 'the next frame\'s snapshot must reflect the overridden tuning -- this is the seam a hot-apply relies on').toBe(8.5);
		});

		it('omitting tuning entirely rebuilds with the live TUNING default -- byte-identical behaviour to before this story', () => {
			const outputs: FrameOutput[] = [];
			const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
			host.start();
			raf.fire(0);

			host.reset();
			raf.fire(0);
			expect(outputs[outputs.length - 1]!.snapshot.effectivePitchDeg).toBe(6.5);
		});

		it('reset() while stopped does not restart the chain', () => {
			const host = createHostLoop(loadDoc(), () => {});
			host.start();
			raf.fire(0);
			host.stop();
			expect(raf.pending()).toBe(0);

			host.reset();
			expect(raf.pending(), 'reset() must not resurrect a stopped loop').toBe(0);
		});

		it('reset() called while running cancels the currently-queued frame rather than leaving two chains alive', () => {
			const host = createHostLoop(loadDoc(), () => {});
			host.start();
			expect(raf.pending()).toBe(1);

			host.reset();
			// Exactly one frame queued afterward (the fresh loop's restart), not
			// two -- the stale pre-reset handle must have been cancelled.
			expect(raf.pending()).toBe(1);
			expect(raf.cancelled(), 'the pre-reset queued frame must have been cancelled, not merely orphaned').toBeGreaterThanOrEqual(1);
		});

		it('a hot-apply mid-flight genuinely rebuilds the sim, not merely relabels the same one -- balls in play are gone after reset (a fresh createLoop() starts with none)', () => {
			const outputs: FrameOutput[] = [];
			const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
			host.start();
			raf.fire(0);
			host.pulseCoil('c_trough_eject');
			raf.fire(16.667);
			expect(outputs[outputs.length - 1]!.snapshot.balls.length, 'sanity: a ball must actually be in play before reset').toBeGreaterThan(0);

			host.reset();
			raf.fire(0);
			expect(
				outputs[outputs.length - 1]!.snapshot.balls,
				'reset() must construct a FRESH createLoop() -- if it kept the existing loop instead, the ball ejected before reset would still be there',
			).toHaveLength(0);
		});
	});

	// DW-75: a keydown stamped by tickAt() against a stall longer than
	// MAX_OWED_TICKS (200 ticks / 200 ms, AD-4) could land past the tick the
	// SAME frame actually reaches (that frame's owed time beyond the cap is
	// discarded), leaving it queued in pendingTransitions until some LATER
	// frame's ticking caught up to the raw stamped tick for real. The fix
	// bounds each keyboard-drained transition to the last tick its own frame
	// actually runs. Falsifiability (Rule 19): mutation: remove the upper
	// bound from the drain seam, restoring the unbounded stamp -> the
	// long-frame assertion below goes red while the control stays green;
	// mutation: apply the bound unconditionally on every frame (not just
	// where it would exceed the frame's last tick) -> the control goes red.
	describe('tickAt() upper bound: a keyboard-drained transition never lands past its own frame\'s last tick (DW-75, AD-4)', () => {
		it('a frame longer than MAX_OWED_TICKS (500 ms) with a keydown 250 ms into the stall is consumed by THAT SAME (capped) frame, not left waiting in pendingTransitions for a later frame', () => {
			// Observable: mechanisms.plunger.holdTicks -- a discrete per-tick
			// counter (plunger.ts: +1 for every tick "plunger" reads true), unlike
			// angleDeg's continuous, ramp-up-governed integration, which cannot be
			// trusted to move measurably from exactly ONE tick of held input
			// landing on the frame's very last tick (verified empirically this
			// pass: it does not). "Enter" is the mapped key for the plunger
			// action (src/host/input's ACTION_KEY_MAP).
			const outputs: FrameOutput[] = [];
			const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
			host.start();
			raf.fire(0); // origin: tick 0, originMs 0, no owed time yet.
			expect(outputs[outputs.length - 1]!.snapshot.mechanisms.plunger.holdTicks, 'sanity: holdTicks must start at 0').toBe(0);
			// Unbounded, tickAt() would stamp this at tick 250 (TICK_HZ = 1000,
			// so 1 ms = 1 tick) -- past the 200-tick cap the SAME frame below is
			// about to hit.
			keyboardTarget.dispatch('keydown', { code: 'Enter', timeStamp: 250, preventDefault: () => {} });
			raf.fire(500); // a genuinely >200 ms frame.
			host.stop();
			const after = outputs[outputs.length - 1]!.snapshot;
			expect(after.tick, 'sanity: the 200 ms owed-time cap must actually have fired, or this test proves nothing about the bound').toBe(200);
			expect(
				after.mechanisms.plunger.holdTicks,
				'the keydown must be consumed by THIS SAME (capped) frame -- if it were still queued in pendingTransitions waiting for the sim to tick forward to the raw stamped tick (250), holdTicks would still read 0 here',
			).toBe(1);
		});

		it('CONTROL: an ordinary ~16.7 ms frame (well inside the cap) produces a BYTE-IDENTICAL stamped tick before and after the bound -- the bound must never bite on a normal frame', () => {
			const outputs: FrameOutput[] = [];
			const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
			host.start();
			raf.fire(0);
			// The exact scenario the pre-existing "tickAt() stamps against the
			// CURRENT accumulator origin" test above already pins to a specific
			// tick and a specific angle -- re-asserted here as this AC's own
			// no-op control, so a bound that fires unconditionally (rather than
			// only where it would exceed the frame's last tick) is caught.
			const angleBefore = outputs[outputs.length - 1]!.snapshot.mechanisms.flippers.l.angleDeg;
			keyboardTarget.dispatch('keydown', { code: 'ShiftLeft', timeStamp: 8, preventDefault: () => {} });
			raf.fire(16.667);
			const after = outputs[outputs.length - 1]!.snapshot;

			expect(after.tick, 'sanity: an ordinary frame must not have hit the 200-tick cap').toBeLessThan(200);
			expect(after.tick).toBeGreaterThan(0);
			expect(
				after.mechanisms.flippers.l.angleDeg,
				'inside the cap, a DOM timestamp is always at or before the frame\'s own nowMs, so the bound is provably a no-op -- the flipper must still move exactly as it did before this story',
			).not.toBe(angleBefore);
		});

		it('a zero-tick frame (advance() owes nothing) still defers the transition via the EXISTING originTick + 1 lower bound, exactly as before this story', () => {
			const outputs: FrameOutput[] = [];
			const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
			host.start();
			raf.fire(0);
			const originTick = outputs[outputs.length - 1]!.snapshot.tick;

			// A keydown timestamped BEFORE the current origin -- the existing
			// lower-bound scenario (I/O matrix: "a timestamp at or before the
			// origin clamps to the frame's first tick").
			keyboardTarget.dispatch('keydown', { code: 'ShiftLeft', timeStamp: -5, preventDefault: () => {} });
			// The very next frame at THE SAME timestamp: elapsedMs = 0, so
			// advance() owes zero ticks this frame -- the transition must still
			// be accepted (via originTick + 1), not dropped, and the sim must
			// still show no ticking yet.
			raf.fire(0);
			const after = outputs[outputs.length - 1]!.snapshot;
			expect(after.tick, 'a zero-tick frame must not advance the tick counter').toBe(originTick);
		});

		// Verification-gap review, this pass: every other test in this
		// describe block only exercises keyboard-drained transitions.
		// injectTransitions() (the replay player's own explicit-tick path) is
		// concatenated in UNCLAMPED at src/host/loop.ts's drain seam -- but
		// nothing combined a >MAX_OWED_TICKS frame with an injected transition
		// stamped past that frame's own last tick to prove it, so a future
		// refactor that folded injectedTransitions into the same .map() as the
		// keyboard-drained ones would corrupt replay playback with nothing to
		// catch it. Uses `plunger`/`holdTicks` rather than a flipper's
		// `angleDeg` -- same reason the FIRST test in this describe block does
		// (a discrete +1-per-tick counter, unlike angleDeg's continuous,
		// ramp-up-governed integration, is trusted to move from exactly ONE
		// tick of held input landing on a frame's very last tick; verified
		// empirically this pass that an angleDeg-based version of this same
		// test does NOT discriminate the mutation below -- it stayed green
		// under the bug too). Falsifiability (Rule 19): mutation: apply the
		// drain seam's clamp to injectedTransitions too (map them through the
		// same lastTickThisFrame bound as `drained`) -> this test's first
		// assertion goes red (holdTicks becomes 1 a whole frame early).
		it('an INJECTED transition stamped past a >MAX_OWED_TICKS frame\'s own last tick is NOT clamped into that frame -- it stays queued, exactly as before this story, until the sim really ticks that far', () => {
			const outputs: FrameOutput[] = [];
			const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
			host.start();
			raf.fire(0); // origin: tick 0, originMs 0.
			expect(outputs[outputs.length - 1]!.snapshot.mechanisms.plunger.holdTicks, 'sanity: holdTicks must start at 0').toBe(0);

			// Stamped at tick 500 -- deep past the 200-tick cap the frame below
			// is about to hit. A keyboard-drained transition at this same tick
			// WOULD be bounded into the capped frame (this describe block's
			// first test); an injected one must never be.
			host.injectTransitions([{ tick: 500, frame: { ...NO_FRAME, plunger: true } }]);
			raf.fire(500); // a genuinely >200 ms frame.
			const capped = outputs[outputs.length - 1]!.snapshot;
			expect(capped.tick, 'sanity: the 200 ms owed-time cap must actually have fired').toBe(200);
			expect(
				capped.mechanisms.plunger.holdTicks,
				'the injected transition is stamped at tick 500, past this capped frame\'s own last tick (200) -- if it had been clamped into this frame the same way a keyboard transition would be, holdTicks would already be nonzero here',
			).toBe(0);

			// Two more ordinary-length frames close the remaining 300-tick gap
			// (150 ticks each, comfortably inside the cap) -- proves the
			// transition was correctly DEFERRED, not silently dropped, once the
			// sim genuinely reaches tick 500.
			raf.fire(650);
			raf.fire(800);
			const settled = outputs[outputs.length - 1]!.snapshot;
			expect(settled.tick, 'sanity: the sim must have reached the injected transition\'s own stamped tick').toBe(500);
			expect(
				settled.mechanisms.plunger.holdTicks,
				'once the sim genuinely reaches tick 500, the injected transition must apply -- it was deferred, not dropped',
			).toBe(1);
		});

		// Code review, this pass: every other test in this describe block
		// dispatches exactly ONE keyboard event, so nothing observed what the
		// bound does to a PAIR. It collapsed them: a keydown and its keyup both
		// clamped to the same lastTickThisFrame, and frameInForceAt()
		// (sim/loop/index.ts) shifts every transition whose tick has been reached
		// and keeps only the LAST one's frame -- so the pressed frame was never in
		// force at any tick and the press vanished outright. Measured before the
		// fix: zero ball_launched, and plunger holdTicks 0 across the stall frame
		// AND every catch-up frame after it, where the pre-story unbounded stamp
		// produced 134 ticks of hold. That is a dropped plunger pull or flipper
		// tap during a GC pause or tab switch -- the exact condition DW-75 exists
		// for. Observed through ball_launched rather than holdTicks because the
		// press now begins AND ends inside one frame: holdTicks is reset by the
		// release before the frame's snapshot is taken, so the surviving evidence
		// of the press is the launch its falling edge produced (plunger.ts's
		// falling-edge branch). Falsifiability (Rule 19): mutation: restore the
		// single shared ceiling in src/host/loop.ts's drain seam (map every
		// drained transition through `tick: Math.min(transition.tick,
		// lastTickThisFrame)`) -> this test goes red (0 ball_launched, expected 1).
		it('a keydown AND its keyup, both inside one >MAX_OWED_TICKS frame, still produce a real press -- the bound must never collapse two transitions onto one tick, which would swallow the press entirely', () => {
			const outputs: FrameOutput[] = [];
			const host = createHostLoop(loadDoc(), (output) => outputs.push(output));
			host.start();
			raf.fire(0);
			// A ball in the shooter lane, so a completed plunger hold has an
			// observable effect that OUTLIVES the frame it happened in.
			host.pulseCoil('c_trough_eject');
			let nowMs = 0;
			for (let i = 1; i <= 150; i++) {
				nowMs = i * 16.667;
				raf.fire(nowMs);
			}
			expect(outputs[outputs.length - 1]!.snapshot.balls.length, 'sanity: a ball must be in the shooter lane, or a completed plunge has nothing to launch and this test proves nothing').toBeGreaterThan(0);
			const launchedBefore = countBallLaunched(outputs);
			expect(launchedBefore, 'sanity: nothing must have been launched before the plunge below').toBe(0);

			// Unbounded, tickAt() stamps these two past the 200-tick cap the single
			// frame below is about to hit, so BOTH meet the ceiling.
			keyboardTarget.dispatch('keydown', { code: 'Enter', timeStamp: nowMs + 250, preventDefault: () => {} });
			keyboardTarget.dispatch('keyup', { code: 'Enter', timeStamp: nowMs + 400, preventDefault: () => {} });
			const tickBefore = outputs[outputs.length - 1]!.snapshot.tick;
			raf.fire(nowMs + 500); // a genuinely >200 ms frame.
			expect(outputs[outputs.length - 1]!.snapshot.tick - tickBefore, 'sanity: the 200 ms owed-time cap must actually have fired, or this test proves nothing about the bound').toBe(200);
			// `ball_launched` is derived in the rules layer from s_shooter_lane
			// OPENING (sim/rules/devices.ts) -- the ball physically leaving the
			// lane -- so the plunge needs a few ordinary frames afterwards to
			// travel. Twenty frames is far too few for the ~12 mm/s residual drift
			// of an UNplunged ball to leave the lane on its own, so the event still
			// means "the plunger fired", not "time passed".
			for (let i = 1; i <= 20; i++) {
				raf.fire(nowMs + 500 + i * 16.667);
			}
			host.stop();
			expect(
				countBallLaunched(outputs) - launchedBefore,
				'the keydown must hold the plunger for at least one real tick before the keyup releases it -- if both transitions were clamped onto the SAME tick, frameInForceAt() would keep only the frame carried by the keyup, the press would never exist at any tick, and its falling edge would never launch the ball',
			).toBeGreaterThanOrEqual(1);
		});
	});
});
