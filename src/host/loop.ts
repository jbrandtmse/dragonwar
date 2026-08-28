// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// The rAF driver (Structural Seed). Records an accumulator origin from
// `performance.now()`, calls `advance(elapsedMs, transitions)` once per
// animation frame with the elapsed time since the last frame, hands the
// resulting `FrameOutput` to presentation via `onFrame`, and exposes
// start/stop. Story 1.6 adds the key->action map and fills in `transitions`;
// this story passes an empty list and exposes the dev coil pulses
// (`pulseCoil()`) `src/host/boot.ts` wires up for the lead's manual smoke.
//
// `host/**` never imports `sim/physics` or `sim/rules` directly (AD-16) --
// this file talks only to `sim/loop`'s `createLoop()` factory, which
// internally calls `loadCollision()`.

import { createLoop } from '../sim/loop';
import type { CoilName, FrameOutput } from '../sim/table/names';

export interface HostLoop {
	start(): void;
	stop(): void;
	/** Dev-only: enqueues a coil pulse for the next tick. See `sim/loop/index.ts`'s `pulseCoil()` doc comment for why this exists and what replaces it (Story 2.5). */
	pulseCoil(coil: CoilName): void;
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

	function tick(nowMs: number): void {
		const elapsedMs = lastFrameMs === null ? 0 : nowMs - lastFrameMs;
		lastFrameMs = nowMs;
		// Story 1.6 fills this in from host/input's key->action map; key codes
		// never enter sim/ (AD-4), and this story issues every dev action
		// through pulseCoil() instead of a real InputTransition.
		const output = loop.advance(elapsedMs, []);
		onFrame(output);
		rafHandle = requestAnimationFrame(tick);
	}

	return {
		start(): void {
			if (rafHandle !== null) {
				return; // already running
			}
			lastFrameMs = null;
			rafHandle = requestAnimationFrame(tick);
		},
		stop(): void {
			if (rafHandle !== null) {
				cancelAnimationFrame(rafHandle);
				rafHandle = null;
			}
		},
		pulseCoil(coil: CoilName): void {
			loop.pulseCoil(coil);
		},
	};
}
