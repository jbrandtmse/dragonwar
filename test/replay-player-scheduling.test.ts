// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9, DW-86: `src/host/dev/replay-player.ts`'s own coil-pulse
// scheduler.
//
// Review finding, this pass: `onFrame()` originally fired a queued pulse
// only on STRICT equality (`coilQueue[0].tick === snapshot.tick + 1`). Once
// a real rAF frame advances `snapshot.tick` PAST that exact value in one
// call -- the ORDINARY case at the shipped 1000 Hz sim against a ~60 fps
// rAF, not an edge case -- that equality can never hold again (tick only
// increases), so the queued pulse was silently DROPPED FOREVER, not merely
// fired late as the file's own header (before this fix) claimed.
// `test/replay-round-trip.test.ts` never exposed this: it deliberately
// drives exactly one tick per onFrame() call throughout, which is precisely
// the scenario that cannot skip past a target tick. This file drives
// onFrame() with a snapshot.tick that jumps past the queued pulse's target
// in one call, the way a real multi-tick rAF frame would.
//
// Falsifiability: mutation: revert the `<=` back to strict `===` ->
// the "pulse still fires after a skipped tick" assertion below goes red
// (pulseCoil is never called).

import { describe, expect, it } from 'vitest';
import { createReplayPlayer, type PlayableRecording } from '../src/host/dev/replay-player';
import type { HostLoop, ResetOptions } from '../src/host/loop';
import type { CoilName, GameStart, ReplayHeader } from '../src/sim/table/names';
import type { Snapshot } from '../src/sim/contracts/snapshot';

function fakeSnapshot(tick: number): Snapshot {
	return { tick } as unknown as Snapshot;
}

function fakeGameStart(): GameStart {
	return {} as unknown as GameStart;
}

function fakeHeader(): ReplayHeader {
	return { gameStart: fakeGameStart() } as unknown as ReplayHeader;
}

function fakeHostLoop(pulses: CoilName[]): HostLoop {
	return {
		start: () => {},
		stop: () => {},
		pulseCoil: (coil: CoilName) => {
			pulses.push(coil);
		},
		setCoilEnabled: () => {},
		reset: (_options?: ResetOptions) => {},
		injectTransitions: () => {},
	} as unknown as HostLoop;
}

describe('src/host/dev/replay-player.ts -- onFrame() coil-pulse scheduling', () => {
	it('a pulse whose target tick a frame skips PAST still fires (late), instead of being silently dropped forever', () => {
		const pulses: CoilName[] = [];
		const hostLoop = fakeHostLoop(pulses);
		const player = createReplayPlayer(() => {});
		const recording: PlayableRecording = {
			replay: { header: fakeHeader(), transitions: [] },
			coilPrologue: [{ tick: 50, coil: 'c_trough_eject' }],
			durationTicks: 100_000, // far beyond every tick this test drives -- onComplete() must never fire
		};

		player.start(hostLoop, recording);
		// The pulse targets tick 50 -- under the file's own contract, it should
		// fire the moment onFrame observes snapshot.tick === 49. A real
		// multi-tick rAF frame instead jumps straight to tick 80, skipping
		// past 49 entirely in ONE call.
		player.onFrame(fakeSnapshot(80));

		expect(pulses, 'the skipped-past pulse must still fire (late), not be lost').toEqual(['c_trough_eject']);
	});

	it('a pulse whose exact target-minus-one tick IS observed fires immediately, unaffected by the fix (regression guard)', () => {
		const pulses: CoilName[] = [];
		const hostLoop = fakeHostLoop(pulses);
		const player = createReplayPlayer(() => {});
		const recording: PlayableRecording = {
			replay: { header: fakeHeader(), transitions: [] },
			coilPrologue: [{ tick: 50, coil: 'c_trough_eject' }],
			durationTicks: 100_000,
		};

		player.start(hostLoop, recording);
		player.onFrame(fakeSnapshot(49));

		expect(pulses).toEqual(['c_trough_eject']);
	});

	it('a pulse whose target tick has not yet been reached does NOT fire early', () => {
		const pulses: CoilName[] = [];
		const hostLoop = fakeHostLoop(pulses);
		const player = createReplayPlayer(() => {});
		const recording: PlayableRecording = {
			replay: { header: fakeHeader(), transitions: [] },
			coilPrologue: [{ tick: 50, coil: 'c_trough_eject' }],
			durationTicks: 100_000,
		};

		player.start(hostLoop, recording);
		player.onFrame(fakeSnapshot(10));

		expect(pulses, 'a pulse must never fire before its own target tick region is reached').toEqual([]);
	});
});
