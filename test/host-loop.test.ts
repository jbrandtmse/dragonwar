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

describe('src/host/loop.ts -- the rAF driver (AD-4, task 21)', () => {
	let raf: RafQueue;
	let originalRaf: unknown;
	let originalCancel: unknown;

	beforeEach(() => {
		const g = globalThis as unknown as Record<string, unknown>;
		originalRaf = g.requestAnimationFrame;
		originalCancel = g.cancelAnimationFrame;
		raf = installRaf();
	});

	afterEach(() => {
		const g = globalThis as unknown as Record<string, unknown>;
		g.requestAnimationFrame = originalRaf;
		g.cancelAnimationFrame = originalCancel;
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
});
