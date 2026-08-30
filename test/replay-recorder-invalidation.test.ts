// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8 QA pass -- src/host/dev/replay-recorder.ts, AC 3's own seam:
// "a hot-apply during a recording invalidates the recording so it cannot be
// saved as a golden." test/replay-recorder.test.ts already pins the basic
// shape (invalidate() sets a refusal reason; the FIRST reason wins over a
// second invalidate() call). This file pins the two things left unpinned:
//
//   1. Once set, invalidReason cannot be CLEARED by anything short of a
//      fresh start() -- specifically, `src/host/loop.ts`'s own onAdvance
//      seam keeps calling recordTransitions() every tick for the REST of a
//      live recording after a hot-apply invalidates it (recording does not
//      stop just because it became invalid -- src/host/loop.ts still owns
//      the on/off switch). If recordTransitions() ever cleared or bypassed
//      invalidReason, a hot-apply mid-recording would go unnoticed and a
//      corrupted recording could still be saved as a golden.
//   2. A fresh start() after an INVALIDATED (not merely saved) recording
//      does not leak the old invalidReason into the new recording --
//      otherwise every recording after the first hot-apply would be
//      permanently unsaveable for the lifetime of the recorder instance.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createReplayRecorder } from '../src/host/dev/replay-recorder';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { NO_FRAME } from '../src/sim/loop';
import type { GameStart } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function testGameStart(): GameStart {
	return {
		seed: 1,
		tuning: resolveTuning(),
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 },
		highscores: [],
	};
}

describe('src/host/dev/replay-recorder.ts -- the invalidated flag cannot be cleared by continued recording activity', () => {
	it('recordTransitions() calls made AFTER invalidate() (the recording keeps running, exactly as src/host/loop.ts drives it every tick) do not clear or bypass the invalid reason -- save() still refuses', () => {
		const recorder = createReplayRecorder();
		recorder.start(testGameStart(), 1, loadDoc(), 0);
		recorder.recordTransitions([{ tick: 1, frame: NO_FRAME }], 1);

		recorder.invalidate('hot-apply mid-recording (dev tuning panel)');
		// The recording is NOT stopped by invalidate() -- src/host/loop.ts's
		// onAdvance seam has no way to know a hot-apply just happened, so it
		// keeps calling recordTransitions() every tick until the user
		// eventually calls save() themselves.
		expect(recorder.isRecording, 'invalidate() must not itself end the recording -- only save() does').toBe(true);
		for (let tick = 2; tick <= 50; tick++) {
			recorder.recordTransitions([{ tick, frame: NO_FRAME }], tick);
		}

		const result = recorder.save();
		expect(result.ok, '49 further recordTransitions() calls after invalidate() must NOT clear the invalid reason').toBe(false);
		if (result.ok) throw new Error('unreachable');
		expect(result.reason, 'the original reason must survive untouched').toBe('hot-apply mid-recording (dev tuning panel)');
	});

	it('a SECOND invalidate() after further recording activity still keeps the FIRST reason, not the second', () => {
		const recorder = createReplayRecorder();
		recorder.start(testGameStart(), 1, loadDoc(), 0);
		recorder.invalidate('first hot-apply');
		recorder.recordTransitions([{ tick: 1, frame: NO_FRAME }], 1);
		recorder.recordTransitions([{ tick: 2, frame: NO_FRAME }], 2);
		recorder.invalidate('second hot-apply, later in the same recording');

		const result = recorder.save();
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('unreachable');
		expect(result.reason, 'the earliest cause is the one worth keeping, even across intervening recordTransitions() calls').toBe('first hot-apply');
	});

	it('a fresh start() after an INVALIDATED recording does not leak the old invalid reason into the new one', () => {
		const recorder = createReplayRecorder();
		recorder.start(testGameStart(), 1, loadDoc(), 0);
		recorder.invalidate('poisoned the first recording');
		const first = recorder.save();
		expect(first.ok).toBe(false);

		recorder.start(testGameStart(), 2, loadDoc(), 0);
		recorder.recordTransitions([{ tick: 1, frame: NO_FRAME }], 1);
		const second = recorder.save();
		expect(second.ok, 'a fresh start() must clear the previous recording\'s invalid reason -- otherwise the recorder is permanently unsaveable after its first hot-apply').toBe(true);
		if (!second.ok) throw new Error('unreachable');
		expect(second.replay.transitions).toEqual([{ tick: 1, frame: NO_FRAME }]);
	});

	it('invalidate() called on a recording that already accumulated transitions still refuses save() -- the transitions are real, not merely an empty recording that happens to fail', () => {
		const recorder = createReplayRecorder();
		recorder.start(testGameStart(), 1, loadDoc(), 0);
		recorder.recordTransitions([{ tick: 1, frame: { ...NO_FRAME, flipper_l: true } }], 1);
		recorder.recordTransitions([{ tick: 2, frame: { ...NO_FRAME, nudge_l: true } }], 2);
		recorder.invalidate('mid-recording tunable change');

		const result = recorder.save();
		expect(result.ok, 'a recording with real, non-empty accumulated transitions must still refuse once invalidated -- the refusal is not merely "there was nothing to save"').toBe(false);
	});
});
