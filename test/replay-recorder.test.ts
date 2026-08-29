// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8, AC 3: `src/host/dev/replay-recorder.ts`'s record/play seam.
// `invalidate()` has no real consumer in this story (Story 1.9's dev tuning
// panel is the first, calling it on a hot-apply) -- exercised here by
// calling it directly, exactly as this story's own AC 3 wording expects
// ("No consumer calls invalidate() in this story; the first is Story 1.9").

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createReplayRecorder } from '../src/host/dev/replay-recorder';
import { buildHeader } from '../src/sim/loop/replay';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { NO_FRAME } from '../src/sim/loop';
import type { GameStart } from '../src/sim/table/names';
import type { InputTransition } from '../src/sim/contracts/input';

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

describe('src/host/dev/replay-recorder.ts -- AC 3: record and save', () => {
	it('start() then save() with no transitions recorded yet succeeds with an empty transitions array, and the header matches buildHeader() called with the SAME inputs', () => {
		const recorder = createReplayRecorder();
		const collisionDoc = loadDoc();
		const gameStart = testGameStart();

		expect(recorder.isRecording, 'not recording before start()').toBe(false);
		recorder.start(gameStart, 42, collisionDoc);
		expect(recorder.isRecording, 'recording after start()').toBe(true);

		const result = recorder.save();
		expect(result.ok, 'save() must succeed -- nothing invalidated it').toBe(true);
		if (!result.ok) throw new Error('unreachable');
		expect(result.replay.transitions).toEqual([]);
		expect(result.replay.header).toEqual(buildHeader({ gameStart, physicsSeed: 42, collisionDoc }));

		// Review finding 2026-08-29: the assertion above compares
		// buildHeader(...) against buildHeader(...) with the same arguments --
		// the mandate's own named vacuity shape ("an assertion that compares a
		// value against itself"). It pins argument PLUMBING and nothing else:
		// hard-coding `physicsSeed: 0` or stripping fields out of `gameStart`
		// inside buildHeader() leaves both sides equally wrong and this test
		// green, while AC 1 ("the header embeds the WHOLE GameStart,
		// physicsSeed, tickHz, tableHash, assetHash and physicsVersion")
		// silently stops holding -- nothing else in the repository reads
		// header.physicsSeed or header.gameStart.seed/adjustments/highscores.
		// These assert the concrete values instead.
		expect(result.replay.header.physicsSeed, 'AC 1: the header must carry the physicsSeed it was started with, not a default').toBe(42);
		expect(result.replay.header.gameStart, 'AC 1: the header must embed the WHOLE GameStart handed to start(), field for field').toEqual(gameStart);
		expect(result.replay.header.gameStart.seed, 'AC 1: GameStart.seed specifically -- the rules-side seed, distinct from physicsSeed').toBe(gameStart.seed);
		expect(result.replay.header.gameStart.adjustments, 'AC 1: the player-chosen adjustments must survive into the header').toEqual(gameStart.adjustments);
		expect(result.replay.header.tickHz, 'AC 1: tickHz must be the live tick rate, computed by buildHeader() rather than passed in').toBeGreaterThan(0);
		expect(result.replay.header.physicsVersion, 'AC 1: physicsVersion must be the derived, non-empty solver-constant identity').toMatch(/^v1-[0-9a-f]+$/);
		expect(recorder.isRecording, 'not recording after save()').toBe(false);
	});

	it('recordTransitions() accumulates across multiple calls, in the order they were recorded', () => {
		const recorder = createReplayRecorder();
		recorder.start(testGameStart(), 1, loadDoc());

		const t1: InputTransition[] = [{ tick: 1, frame: { ...NO_FRAME, flipper_l: true } }];
		const t2: InputTransition[] = [{ tick: 5, frame: NO_FRAME }];
		const t3: InputTransition[] = [{ tick: 10, frame: { ...NO_FRAME, nudge_l: true } }];
		recorder.recordTransitions(t1);
		recorder.recordTransitions(t2);
		recorder.recordTransitions(t3);

		const result = recorder.save();
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('unreachable');
		expect(result.replay.transitions).toEqual([...t1, ...t2, ...t3]);
	});

	it('recordTransitions() before start() (or after save()) is a silent no-op -- never throws, never retroactively appears in a later recording', () => {
		const recorder = createReplayRecorder();
		// Before any start():
		expect(() => recorder.recordTransitions([{ tick: 1, frame: NO_FRAME }])).not.toThrow();

		recorder.start(testGameStart(), 1, loadDoc());
		recorder.save();
		// After save() ended the recording:
		recorder.recordTransitions([{ tick: 999, frame: NO_FRAME }]);

		recorder.start(testGameStart(), 1, loadDoc());
		const result = recorder.save();
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('unreachable');
		expect(result.replay.transitions, 'a transition recorded before start() or after a prior save() must never leak into a LATER recording').toEqual([]);
	});

	it('invalidate(reason) makes save() refuse and return the named reason -- AC 3', () => {
		const recorder = createReplayRecorder();
		recorder.start(testGameStart(), 1, loadDoc());
		recorder.recordTransitions([{ tick: 1, frame: NO_FRAME }]);

		recorder.invalidate('hot-apply mid-recording (dev tuning panel)');
		const result = recorder.save();

		expect(result.ok, 'an invalidated recording must never be saved as a golden').toBe(false);
		if (result.ok) throw new Error('unreachable');
		expect(result.reason).toBe('hot-apply mid-recording (dev tuning panel)');
	});

	it('invalidate() is idempotent -- the FIRST reason wins over a second call', () => {
		const recorder = createReplayRecorder();
		recorder.start(testGameStart(), 1, loadDoc());
		recorder.invalidate('first reason');
		recorder.invalidate('second reason (must be ignored)');

		const result = recorder.save();
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('unreachable');
		expect(result.reason).toBe('first reason');
	});

	it('invalidate() with no recording in progress is a silent no-op -- never throws, and does not poison the NEXT recording', () => {
		const recorder = createReplayRecorder();
		expect(() => recorder.invalidate('nothing is recording yet')).not.toThrow();

		recorder.start(testGameStart(), 1, loadDoc());
		const result = recorder.save();
		expect(result.ok, 'a stray invalidate() before start() must not poison the recording that follows').toBe(true);
	});

	it('save() with no recording ever started fails, naming that nothing was in progress', () => {
		const recorder = createReplayRecorder();
		const result = recorder.save();
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('unreachable');
		expect(result.reason.toLowerCase()).toContain('no recording');
	});

	it('a second save() without a new start() fails the same way (recording already ended)', () => {
		const recorder = createReplayRecorder();
		recorder.start(testGameStart(), 1, loadDoc());
		const first = recorder.save();
		expect(first.ok).toBe(true);

		const second = recorder.save();
		expect(second.ok, 'save() twice in a row without a new start() must fail the second time').toBe(false);
	});

	it('a fresh start() after a previous save() discards the prior recording\'s transitions entirely', () => {
		const recorder = createReplayRecorder();
		recorder.start(testGameStart(), 1, loadDoc());
		recorder.recordTransitions([{ tick: 1, frame: NO_FRAME }]);
		recorder.save();

		recorder.start(testGameStart(), 2, loadDoc());
		const result = recorder.save();
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('unreachable');
		expect(result.replay.transitions, 'the prior recording must not bleed into a fresh one').toEqual([]);
	});
});
