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
// The hash function itself is implemented locally, test-only: Story 1.8
// ("Replays, golden state hashes and CI parity") owns it as a SHIPPED,
// production artifact; this story only needs a working implementation of
// AD-15's stated definition to prove the property holds, not to pre-empt
// where Story 1.8 places the reusable version.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import type { InputTransition } from '../src/sim/contracts/input';
import type { GameState } from '../src/sim/table/names';
import type { BallSnapshot } from '../src/sim/contracts/snapshot';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(canonicalize);
	}
	if (value !== null && typeof value === 'object') {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
		}
		return sorted;
	}
	return value;
}

function quantize001Mm(mm: number): number {
	return Math.round(mm * 100) / 100;
}

/** 32-bit FNV-1a, hex-encoded. */
function fnv1aHex(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}

/** AD-15: "FNV-1a over canonical JSON of GameState plus ball positions quantised to 0.01 mm". */
function stateHash(game: GameState, balls: readonly BallSnapshot[]): string {
	const quantizedBalls = balls.map((b) => ({
		id: b.id,
		pos: { x: quantize001Mm(b.pos.x), y: quantize001Mm(b.pos.y), z: quantize001Mm(b.pos.z) },
	}));
	const payload = canonicalize({ game, balls: quantizedBalls });
	return fnv1aHex(JSON.stringify(payload));
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
