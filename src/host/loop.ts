// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// The rAF driver (Structural Seed). Records an accumulator origin from
// `performance.now()`, calls `advance(elapsedMs, transitions)` once per
// animation frame with the elapsed time since the last frame, hands the
// resulting `FrameOutput` to presentation via `onFrame`, and exposes
// start/stop. Story 1.6 adds the key->action map and fills in `transitions`
// (`src/host/input/`); it also exposes the dev coil pulses/enable-disable
// (`pulseCoil()`/`setCoilEnabled()`) `src/host/boot.ts` wires up for the
// lead's manual smoke.
//
// `host/**` never imports `sim/physics` or `sim/rules` directly (AD-16) --
// this file talks only to `sim/loop`'s `createLoop()` factory (which
// internally calls `loadCollision()`) and `sim/contracts/time.ts`'s
// `msToTicksExact()` (AD-3: "the host may import it").
//
// `tickAt()`: this file owns the AD-4 accumulator origin -- `originMs`/
// `originTick`, the timestamp and tick count as of the most recently
// processed frame -- and stamps a keyboard event's DOM `timeStamp` against
// exactly that pair, using the SAME `msToTicksExact()` arithmetic
// `sim/loop`'s own `advance()` uses. `Math.max(originTick + 1, ...)` clamps
// a timestamp at or before the origin to the frame's first tick (I/O
// matrix); a timestamp past what a frame actually reaches is not separately
// capped here -- `sim/loop`'s own `frameInForceAt()` already carries such a
// transition forward to a later frame rather than dropping it (also I/O
// matrix), so there is no second clamp to duplicate.

import { createLoop } from '../sim/loop';
import { createKeyboardInput, type KeyboardEventTarget } from './input';
import { msToTicksExact } from '../sim/contracts/time';
import type { CoilName, FrameOutput } from '../sim/table/names';

export interface HostLoop {
	start(): void;
	stop(): void;
	/** Dev-only: enqueues a coil pulse for the next tick. See `sim/loop/index.ts`'s `pulseCoil()` doc comment for why this exists and what replaces it (Story 2.5). */
	pulseCoil(coil: CoilName): void;
	/** Dev-only passthrough to `sim/loop`'s `setCoilEnabled()` -- see its own doc comment. */
	setCoilEnabled(coil: CoilName, enabled: boolean): void;
}

/**
 * Builds the host-side rAF driver over `sim/loop`'s `createLoop()`.
 * `onFrame` is called once per animation frame with that frame's
 * `FrameOutput` (possibly carrying zero steps, per AD-4).
 */
export function createHostLoop(collisionDoc: unknown, onFrame: (output: FrameOutput) => void): HostLoop {
	const loop = createLoop({ collisionDoc });

	let rafHandle: number | null = null;
	let lastFrameMs: number | null = null;
	// Review finding 2026-08-28: `rafHandle` alone cannot answer "is this loop
	// running". Inside tick() the handle it holds has ALREADY fired, so (a)
	// `stop()` called from within `onFrame` nulled it and the re-arm below
	// immediately resurrected the chain, and (b) a throw out of advance() or
	// onFrame left the stale non-null handle in place, which killed the chain
	// AND made start() refuse to restart it ("already running"). `running` is
	// the state; `rafHandle` is only what cancelAnimationFrame needs.
	let running = false;

	// AD-4's accumulator origin (this file's own header): initialised at
	// creation time (not left at 0) so a keyboard event firing in the brief
	// window between start() and the first rAF callback still stamps against
	// a real "now" rather than against the epoch, which would otherwise
	// compute an absurdly large owed-tick count and the transition would sit
	// queued for thousands of frames before sim/loop ever reached it.
	let originMs = performance.now();
	let originTick = 0;

	function tickAt(domTimeStampMs: number): number {
		const elapsedMs = domTimeStampMs - originMs;
		const ticksSinceOrigin = Math.floor(msToTicksExact(elapsedMs));
		return Math.max(originTick + 1, originTick + ticksSinceOrigin);
	}

	const keyboardInput = createKeyboardInput({ tickAt });

	function tick(nowMs: number): void {
		rafHandle = null;
		const elapsedMs = lastFrameMs === null ? 0 : nowMs - lastFrameMs;
		lastFrameMs = nowMs;
		try {
			// Transitions are drained BEFORE advance() runs -- they were stamped
			// against the OLD origin (the previous frame's), which is exactly the
			// tick range advance() is about to process.
			const transitions = keyboardInput.drainTransitions();
			const output = loop.advance(elapsedMs, transitions);
			// The new origin, for events arriving before the NEXT frame.
			originMs = nowMs;
			originTick = output.snapshot.tick;
			onFrame(output);
		} catch (error) {
			// A throw out of the simulation or presentation must not leave a
			// half-live loop behind: stop cleanly and let it reach the host's
			// own handler rather than dying silently mid-chain.
			running = false;
			throw error;
		}
		// Re-arm only if nothing stopped us during this frame -- `onFrame` may
		// legitimately call stop() (the error path in src/host/boot.ts does).
		if (running) {
			rafHandle = requestAnimationFrame(tick);
		}
	}

	return {
		start(): void {
			if (running) {
				return; // already running
			}
			running = true;
			lastFrameMs = null;
			// `globalThis`, not `window`: in a real browser main thread the two
			// are the same object, and using the former lets a headless/Node
			// test drive this exact path with a plain stub (no jsdom) the same
			// way it already stubs requestAnimationFrame/cancelAnimationFrame.
			keyboardInput.attach(globalThis as unknown as KeyboardEventTarget);
			rafHandle = requestAnimationFrame(tick);
		},
		stop(): void {
			running = false;
			keyboardInput.detach();
			if (rafHandle !== null) {
				cancelAnimationFrame(rafHandle);
				rafHandle = null;
			}
		},
		pulseCoil(coil: CoilName): void {
			loop.pulseCoil(coil);
		},
		setCoilEnabled(coil: CoilName, enabled: boolean): void {
			loop.setCoilEnabled(coil, enabled);
		},
	};
}
