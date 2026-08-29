// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.5's determinism acceptance criterion (AD-3, AD-15): one scripted
// 5 s input sequence, containing at least one input transition and one 2 s
// gap, driven through advance() at 30, 60 and 120 Hz elapsed patterns --
// the three runs must execute the SAME NUMBER OF STEPS (asserted first, so a
// step-count mismatch is diagnosed as what it is rather than misread as
// non-determinism), each must emit exactly one sim_time_discarded event as
// its frame's first event, and the three final state hashes -- FNV-1a over
// canonical JSON of GameState plus ball positions quantised to 0.01 mm
// (AD-15's own definition) -- must be identical.
//
// Story 1.8 ("Replays, golden state hashes and CI parity") promoted the hash
// function this test used to be local and test-only into the SHIPPED,
// production artifact `src/sim/loop/replay.ts` -- this file now imports it
// directly rather than carrying its own copy, so exactly one implementation
// of AD-15's hash exists anywhere in the repository.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { stateHash } from '../src/sim/loop/replay';
import type { InputTransition } from '../src/sim/contracts/input';
import type { GameState } from '../src/sim/table/names';
import type { BallSnapshot } from '../src/sim/contracts/snapshot';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/**
 * One scripted 5 s elapsed-ms sequence at `fps`'s native display cadence,
 * with one extra 2 s (2000 ms) gap frame appended at the end -- the Code
 * Map's own verified derivation ("Adding one 2000 ms frame: 5200/5200/5200
 * steps and exactly one discard each").
 */
function elapsedSequence(fps: number): number[] {
	const frameMs = 1000 / fps;
	const frames: number[] = [];
	let total = 0;
	while (total < 5000 - 1e-6) {
		frames.push(frameMs);
		total += frameMs;
	}
	frames.push(2000);
	return frames;
}

/** One input transition partway through the run -- a tick number, cadence-independent (the same simulated instant regardless of display fps). */
const SCRIPTED_TRANSITIONS: InputTransition[] = [{ tick: 2500, frame: { ...NO_FRAME, flipper_l: true } }];

interface RunResult {
	finalTick: number;
	discardCount: number;
	discardIsFirstEventEveryTime: boolean;
	hash: string;
}

function runCadence(fps: number): RunResult {
	const loop = createLoop({ collisionDoc: loadDoc() });
	const frames = elapsedSequence(fps);

	let discardCount = 0;
	let discardIsFirstEventEveryTime = true;
	let lastGame!: GameState;
	let lastBalls!: readonly BallSnapshot[];

	for (let i = 0; i < frames.length; i++) {
		// The scripted transition is supplied once, on the first call -- the
		// loop retains it internally (test/loop.test.ts's own "carried to the
		// next frame" case) until its tick is reached.
		const transitions = i === 0 ? SCRIPTED_TRANSITIONS : [];
		const out = loop.advance(frames[i], transitions);
		for (let e = 0; e < out.events.length; e++) {
			if (out.events[e].type === 'sim_time_discarded') {
				discardCount++;
				if (e !== 0) {
					discardIsFirstEventEveryTime = false;
				}
			}
		}
		lastGame = out.snapshot.game;
		lastBalls = out.snapshot.balls;
	}

	return {
		finalTick: lastGame.tick,
		discardCount,
		discardIsFirstEventEveryTime,
		hash: stateHash(lastGame, lastBalls),
	};
}

describe('cadence independence (AD-3, AD-15): 30 / 60 / 120 Hz produce identical final state', () => {
	it('all three cadences execute the SAME number of steps, each emits exactly one sim_time_discarded as its first event, and the final state hashes are identical', () => {
		const at30 = runCadence(30);
		const at60 = runCadence(60);
		const at120 = runCadence(120);

		// Step counts asserted FIRST: a step-count mismatch must be diagnosed as
		// what it is, never misread as a hash "mismatch" (this story's own
		// determinism acceptance criterion, verbatim).
		expect(at60.finalTick, '60 Hz step count differs from 30 Hz').toBe(at30.finalTick);
		expect(at120.finalTick, '120 Hz step count differs from 30 Hz').toBe(at30.finalTick);

		for (const [label, run] of [['30 Hz', at30], ['60 Hz', at60], ['120 Hz', at120]] as const) {
			expect(run.discardCount, `${label}: expected exactly one sim_time_discarded event`).toBe(1);
			expect(run.discardIsFirstEventEveryTime, `${label}: sim_time_discarded must be the first event of its frame`).toBe(true);
		}

		expect(at60.hash, '60 Hz final state hash differs from 30 Hz').toBe(at30.hash);
		expect(at120.hash, '120 Hz final state hash differs from 30 Hz').toBe(at30.hash);
	});
});

describe('cadence independence WITH a ball in genuine motion (probes for a vacuous determinism claim)', () => {
	// The test above's scripted sequence never issues a coil pulse, so
	// snapshot.balls stays [] for its ENTIRE run, in all three cadences --
	// meaning AD-15's own hash definition ("GameState plus ball positions
	// quantised to 0.01 mm") has its ball-position half contribute NOTHING
	// distinguishing to that comparison: an empty array canonicalizes
	// identically regardless of whether the underlying physics driving it is
	// actually deterministic. This describe block drives the SAME scripted
	// sequence but ejects a ball on tick 1 (pulseCoil() is called BEFORE the
	// first advance(), so it lands on the very first tick processed
	// regardless of display cadence -- test/loop.test.ts's own "commands
	// land the tick AFTER they were issued" case establishes this timing),
	// so the hash's ball-position component is actually exercised by 5.2
	// simulated seconds of real, floating-point-sensitive rolling/settling
	// physics across all three cadences, not an empty array three times over.
	function runCadenceWithBall(fps: number): RunResult & { ballCount: number } {
		const loop = createLoop({ collisionDoc: loadDoc() });
		loop.pulseCoil('c_trough_eject');
		const frames = elapsedSequence(fps);

		let discardCount = 0;
		let discardIsFirstEventEveryTime = true;
		let lastGame!: GameState;
		let lastBalls!: readonly BallSnapshot[];

		for (let i = 0; i < frames.length; i++) {
			const transitions = i === 0 ? SCRIPTED_TRANSITIONS : [];
			const out = loop.advance(frames[i], transitions);
			for (let e = 0; e < out.events.length; e++) {
				if (out.events[e].type === 'sim_time_discarded') {
					discardCount++;
					if (e !== 0) {
						discardIsFirstEventEveryTime = false;
					}
				}
			}
			lastGame = out.snapshot.game;
			lastBalls = out.snapshot.balls;
		}

		return {
			finalTick: lastGame.tick,
			discardCount,
			discardIsFirstEventEveryTime,
			hash: stateHash(lastGame, lastBalls),
			ballCount: lastBalls.length,
		};
	}

	it('a served ball in motion for the whole run still produces the SAME step counts and identical final state hashes across 30/60/120 Hz -- and the ball genuinely exists, so the comparison is not vacuous', () => {
		const at30 = runCadenceWithBall(30);
		const at60 = runCadenceWithBall(60);
		const at120 = runCadenceWithBall(120);

		// Proves this comparison is not the same vacuous "empty array" check
		// as the bare test above: a served ball settles in the shooter lane
		// and stays there (test/machine-serve-drain.test.ts's own "settles
		// inside sw_shooter_lane" case), so it must still be present at the
		// end of a 5.2 s simulated run.
		expect(at30.ballCount, '30 Hz: the served ball must still exist at the end of the run').toBe(1);
		expect(at60.ballCount, '60 Hz: the served ball must still exist at the end of the run').toBe(1);
		expect(at120.ballCount, '120 Hz: the served ball must still exist at the end of the run').toBe(1);

		// Step counts asserted FIRST, same discipline as the bare test above.
		expect(at60.finalTick, '60 Hz step count differs from 30 Hz').toBe(at30.finalTick);
		expect(at120.finalTick, '120 Hz step count differs from 30 Hz').toBe(at30.finalTick);

		for (const [label, run] of [['30 Hz', at30], ['60 Hz', at60], ['120 Hz', at120]] as const) {
			expect(run.discardCount, `${label}: expected exactly one sim_time_discarded event`).toBe(1);
			expect(run.discardIsFirstEventEveryTime, `${label}: sim_time_discarded must be the first event of its frame`).toBe(true);
		}

		expect(at60.hash, '60 Hz final state hash differs from 30 Hz (with a ball genuinely in motion)').toBe(at30.hash);
		expect(at120.hash, '120 Hz final state hash differs from 30 Hz (with a ball genuinely in motion)').toBe(at30.hash);
	});
});
