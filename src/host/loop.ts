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
// Story 1.8: `onAdvance`, an OPTIONAL third constructor argument, is the
// exact seam `src/host/dev/replay-recorder.ts` taps -- called with this
// frame's `elapsedMs`, the `transitions` this call actually applied, and
// (Story 1.9) this frame's resulting `tick`, immediately after
// `loop.advance()` returns (this file's own header line this comment
// replaces: "record and play attached at src/host/loop.ts"). Never called by
// anything else; a caller that ignores the third argument (or passes none)
// gets the exact same behaviour as before Story 1.9 added it.
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
// matrix).
//
// DW-75: a timestamp past what a frame actually reaches WAS carried forward
// unbounded by `sim/loop`'s own `pendingTransitions` queue until the sim
// caught up -- correct for `injectedTransitions` (the replay player's own
// explicit-tick path, still never clamped here), but not for a live keydown
// during a stall longer than `MAX_OWED_TICKS` (AD-4's 200 ms owed-time cap):
// `tickAt()` has no way to know a frame will discard time it has not been
// asked to process yet, so it could stamp a keydown past the tick the SAME
// frame is about to cap out at, leaving it queued for however many further
// frames it takes the sim to tick that far forward for real. The drain seam
// below (`tick()`, where `elapsedMs` and the drained transitions are both in
// hand) now bounds each KEYBOARD-drained transition to the last tick this
// frame will actually run -- `originTick + min(floor(msToTicksExact(elapsedMs)),
// MAX_OWED_TICKS)` -- floored at the existing `originTick + 1` lower bound,
// so it lands in THIS frame's own `frameInForceAt()` call instead of
// waiting. Provably a no-op inside the cap (`originMs` and `lastFrameMs` are
// both assigned from the same `nowMs`, so a DOM timestamp is always at or
// before it); the host cannot read `advance()`'s own carried
// `owedRemainderTicks`, so this bound can be conservative by at most one
// tick when a fractional remainder is in play -- accepted, not fixed here
// (frontmatter `deferred:`).

import { createLoop } from '../sim/loop';
import { createKeyboardInput, type KeyboardEventTarget } from './input';
import { msToTicksExact, MAX_OWED_TICKS } from '../sim/contracts/time';
import type { CoilName, FrameOutput } from '../sim/table/names';
import type { InputTransition } from '../sim/contracts/input';
import type { ResolvedTuning } from '../sim/table/tuning';

export interface ResetOptions {
	/** Story 1.9: an already-resolved tuning set to rebuild the sim from -- see `sim/loop/index.ts`'s `CreateLoopOptions.tuning` doc comment. Omitted, the rebuilt loop uses the live `TUNING` default (the same tuning it already had, unless `TUNING` itself changed). */
	readonly tuning?: ResolvedTuning;
}

export interface HostLoop {
	start(): void;
	stop(): void;
	/** Dev-only: enqueues a coil pulse for the next tick. See `sim/loop/index.ts`'s `pulseCoil()` doc comment for why this exists and what replaces it (Story 2.5). */
	pulseCoil(coil: CoilName): void;
	/** Dev-only passthrough to `sim/loop`'s `setCoilEnabled()` -- see its own doc comment. */
	setCoilEnabled(coil: CoilName, enabled: boolean): void;
	/**
	 * Story 1.9's rebuild seam (`DW-86`): stops the rAF chain if it was
	 * running, constructs a FRESH `sim/loop` (`createLoop({ collisionDoc,
	 * tuning })`) -- never mutates the live one, per `plumb-bob.ts`'s own
	 * design note ("rebuilds the machine rather than mutating live physics")
	 * -- resets the AD-4 accumulator origin (`originTick = 0`, `originMs =
	 * performance.now()`, `lastFrameMs = null`) so the next frame owes zero
	 * ticks exactly like a fresh boot, and restarts if it was running. This is
	 * the ONE seam the tuning panel's hot-apply, the replay player's
	 * reset-before-play, and every test that proves either uses -- `loop`
	 * itself is never widened with a `reset()` of its own (`sim/loop`'s
	 * contract is unchanged; only this file's binding of it moves).
	 */
	reset(options?: ResetOptions): void;
	/**
	 * Story 1.9's play seam (`DW-86`, `src/host/dev/replay-player.ts`):
	 * queues `transitions` for the loop's own `advance()` to apply -- exactly
	 * like a real keypress, merged into the SAME per-frame array
	 * `keyboardInput.drainTransitions()` already contributes to. Every
	 * transition may name any future tick (`sim/loop`'s own `pendingTransitions`
	 * queue and `frameInForceAt()` already carry a transition forward until
	 * its own tick is reached, exactly as `sim/loop/replay.ts`'s `runReplay()`
	 * relies on when it seeds a whole replay's transitions in one
	 * `advance(0, replay.transitions)` call) -- so a player may call this
	 * once, immediately after `reset()`, with an entire saved recording's
	 * transitions at once.
	 */
	injectTransitions(transitions: readonly InputTransition[]): void;
}

/**
 * Builds the host-side rAF driver over `sim/loop`'s `createLoop()`.
 * `onFrame` is called once per animation frame with that frame's
 * `FrameOutput` (possibly carrying zero steps, per AD-4).
 */
export function createHostLoop(
	collisionDoc: unknown,
	onFrame: (output: FrameOutput) => void,
	onAdvance?: (elapsedMs: number, transitions: readonly InputTransition[], tick: number) => void,
): HostLoop {
	// `let`, not `const` (Story 1.9): `reset()` below rebuilds this binding
	// wholesale rather than mutating the sim it points at -- every reader in
	// this file (tick(), pulseCoil(), setCoilEnabled()) reads `loop` at CALL
	// time, so a rebuild is transparent to them without any further change.
	let loop = createLoop({ collisionDoc });

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

	// Story 1.9's play seam: transitions queued via injectTransitions(),
	// drained into the SAME per-frame array keyboardInput.drainTransitions()
	// contributes to -- see the HostLoop interface's own doc comment.
	let injectedTransitions: InputTransition[] = [];

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
			// tick range advance() is about to process. injectedTransitions
			// (Story 1.9's play seam) are merged in and cleared the same way --
			// they carry their OWN absolute tick stamps (not relative to this
			// frame), so merging is correct regardless of when injectTransitions()
			// was called.
			//
			// DW-75: only the KEYBOARD-drained transitions are bounded to the last
			// tick THIS frame will actually run (this file's header comment) --
			// injectedTransitions are the replay player's explicit-tick path and
			// must never be clamped, or playback would corrupt itself.
			const lastTickThisFrame = Math.max(originTick + 1, originTick + Math.min(Math.floor(msToTicksExact(elapsedMs)), MAX_OWED_TICKS));
			const drained = keyboardInput.drainTransitions().map((transition) => ({
				...transition,
				tick: Math.min(transition.tick, lastTickThisFrame),
			}));
			const transitions = injectedTransitions.length > 0 ? [...drained, ...injectedTransitions] : drained;
			injectedTransitions = [];
			const output = loop.advance(elapsedMs, transitions);
			// The new origin, for events arriving before the NEXT frame.
			originMs = nowMs;
			originTick = output.snapshot.tick;
			try {
				// Review finding 2026-08-29: onAdvance is a dev-only recording tap
				// (replayRecorder.recordTransitions), not "the simulation or
				// presentation" this function's own catch block below is scoped
				// to -- a throw from it must not have the power to stop live
				// gameplay. Isolated in its own try/catch, still called before
				// onFrame() (see this file's header comment for why).
				onAdvance?.(elapsedMs, transitions, output.snapshot.tick);
			} catch (onAdvanceError) {
				// eslint-disable-next-line no-console
				console.error('src/host/loop.ts: onAdvance (dev-only recording tap) threw; continuing the loop unaffected:', onAdvanceError);
			}
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
		injectTransitions(transitions: readonly InputTransition[]): void {
			injectedTransitions.push(...transitions);
		},
		reset(resetOptions?: ResetOptions): void {
			// Mirrors stop()'s own rAF-teardown, but WITHOUT keyboardInput.detach()
			// -- a reset is not the player leaving the game, and re-attaching a
			// fresh listener on every hot-apply would be wasted churn (and a
			// legitimate double-attach hazard if start() below re-attaches too).
			const wasRunning = running;
			running = false;
			if (rafHandle !== null) {
				cancelAnimationFrame(rafHandle);
				rafHandle = null;
			}

			loop = createLoop({ collisionDoc, tuning: resetOptions?.tuning });
			// A stale injection from before this reset must never leak into the
			// fresh sim -- its tick numbers are meaningless against a new origin.
			injectedTransitions = [];

			// AD-4's accumulator origin, reset exactly as it is at construction
			// time (this file's own header) -- the fresh loop's tick 0 must line
			// up with a fresh origin, or the very next frame would compute a
			// stale elapsed-ticks count against a sim that no longer has that
			// history.
			originMs = performance.now();
			originTick = 0;
			lastFrameMs = null;

			if (wasRunning) {
				running = true;
				rafHandle = requestAnimationFrame(tick);
			}
		},
	};
}
