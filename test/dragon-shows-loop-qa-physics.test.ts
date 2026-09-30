// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.3 QA, AC5 and AC6 (Rule 1 -- Integration, DW-298, AD-4): the
// Dragon's shows reach `FrameOutput.commands` through a real
// `createLoop({ collisionDoc, gameStart, tuning })` EXACTLY as the rules
// emitted them -- the same shows, in the same order within a tick, on the
// same ticks, and in tick order across a multi-tick `advance()`.
//
// `test/dragon-shows-physics.test.ts` pins AC5 and AC6 at the loop seam,
// but in each of its runs no two shows ever share a tick, so a loop that
// reordered a tick's shows would stay green there. This file closes that:
// - `createRules()` is wrapped (the rest of `sim/rules` is the real module)
//   so every `step()`'s `commands` are recorded by tick, beside what the
//   loop hands back in `FrameOutput.commands`;
// - the wrapper also adds three hand-closed `s_dragon_body` edges to the
//   switch events the loop hands `step()` -- on the park tick T (AC5's
//   planning measurement, 5506), again on T+HIT_GAP, and on the close tick
//   T+L+H -- so the REAL rules emit [open, hit] on T, [hit] on T+HIT_GAP
//   and [close, hit] on T+L+H. The ball and the physics never see them: a
//   switch edge is a rules input only;
// - the same run is then driven in multi-tick `advance()` chunks, one of
//   which holds both T and T+HIT_GAP, and the loop must hand back the
//   identical show list, in tick order across the chunk.
//
// A `*-physics.test.ts` file: it drives real physics on purpose, so it is
// not a `rules-*` headless test and is not listed in
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning, shotWindowTicks } from '../src/sim/table/tuning';
import { MAX_OWED_TICKS, ticksToMs } from '../src/sim/contracts/time';
import { close } from './util/switch-script';
import type { GameAdjustments } from '../src/sim/contracts/replay';
import type { InputTransition } from '../src/sim/contracts/input';
import type { GameStart, ShowCommand, SwitchEvent } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

const TUNING = resolveTuning();
const L = shotWindowTicks('mouthOpenLeadMs', TUNING);
const H = shotWindowTicks('mouthCloseHoldMs', TUNING);
const ADJUSTMENTS: GameAdjustments = { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 };

const OPEN = 'show_dragon_mouth_open';
const CLOSE = 'show_dragon_mouth_close';
const HIT = 'show_dragon_hit';

/** AC5's recipe: Start on tick 2, the full plunge (323 held 521, released on 844), `flipper_l` at release+3957 held 25 -- an uncredited park whose show lands on T. */
const PLUNGE_ON = 323;
const RELEASE_ON = PLUNGE_ON + 521;
const FLIP_ON = RELEASE_ON + 3957;
const T = 5506;
/** The second hand-closed hit, a few ticks after T -- inside the same `advance()` chunk. */
const HIT_GAP = 10;
const LAST_TICK = T + L + H + 200;

// ---------------------------------------------------------------------------
// The recording wrapper around the REAL rules.
// ---------------------------------------------------------------------------

const recorder = vi.hoisted(() => ({
	/** Every `step()`'s `commands`, keyed by tick, as the rules returned them. */
	byTick: new Map<number, readonly unknown[]>(),
	/** Hand-closed switch edges added to the loop's own, keyed by tick. */
	inject: new Map<number, readonly unknown[]>(),
}));

vi.mock('../src/sim/rules', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/sim/rules')>();
	return {
		...actual,
		createRules: (...args: Parameters<typeof actual.createRules>) => {
			const rules = actual.createRules(...args);
			return {
				...rules,
				step: (state: Parameters<typeof rules.step>[0], switchEvents: Parameters<typeof rules.step>[1], tick: number, report?: Parameters<typeof rules.step>[3]) => {
					const extra = (recorder.inject.get(tick) ?? []) as typeof switchEvents;
					const result = rules.step(state, extra.length > 0 ? [...switchEvents, ...extra] : switchEvents, tick, report);
					recorder.byTick.set(tick, result.commands);
					return result;
				},
			};
		},
	};
});

/** `s_dragon_body` closed on T, T+HIT_GAP and T+L+H (opened in between), keyed by tick. */
function dragonBodyEdges(): Map<number, readonly SwitchEvent[]> {
	const edges = close(TABLE.dragonBodyWiring.switch)
		.at(T)
		.open()
		.at(T + 5)
		.close()
		.at(T + HIT_GAP)
		.open()
		.at(T + HIT_GAP + 30)
		.close()
		.at(T + L + H)
		.open()
		.at(T + L + H + 30)
		.build();
	return new Map(edges.map((edge) => [edge.tick, [edge]]));
}

function transitions(): InputTransition[] {
	return [
		{ tick: 2, frame: { ...NO_FRAME, start: true } },
		{ tick: 3, frame: NO_FRAME },
		{ tick: PLUNGE_ON, frame: { ...NO_FRAME, plunger: true } },
		{ tick: RELEASE_ON, frame: NO_FRAME },
		{ tick: FLIP_ON, frame: { ...NO_FRAME, flipper_l: true } },
		{ tick: FLIP_ON + 25, frame: NO_FRAME },
	];
}

interface Run {
	/** The shows `FrameOutput.commands` carried, in the order the loop handed them back. */
	readonly loopShows: readonly ShowCommand[];
	/** The shows the rules emitted, tick by tick in ascending order. */
	readonly rulesShows: readonly ShowCommand[];
	readonly parkSlots: readonly boolean[] | undefined;
}

/** Drives AC5's recipe to LAST_TICK in `advance()` calls of `chunk` ticks each (the last one may be shorter). */
function run(chunk: number): Run {
	recorder.byTick.clear();
	recorder.inject = dragonBodyEdges();
	const gameStart: GameStart = { seed: 0, tuning: TUNING, adjustments: ADJUSTMENTS, highscores: [] };
	const loop = createLoop({ collisionDoc: JSON.parse(readFileSync(COLLISION_PATH, 'utf8')), gameStart, tuning: TUNING });
	const loopShows: ShowCommand[] = [];
	let parkSlots: readonly boolean[] | undefined;
	let done = 0;
	let first = true;
	while (done < LAST_TICK) {
		const ticks = Math.min(chunk, LAST_TICK - done);
		const out = loop.advance(ticksToMs(ticks), first ? transitions() : []);
		first = false;
		for (const command of out.commands) {
			if (command.type === 'show') {
				loopShows.push(command);
			}
		}
		done += ticks;
		if (done === T) {
			parkSlots = out.snapshot.game.machine.deviceSlots.bd_lock;
		}
	}
	const rulesShows = [...recorder.byTick.keys()].sort((a, b) => a - b).flatMap((tick) => recorder.byTick.get(tick) as readonly ShowCommand[]);
	return { loopShows, rulesShows, parkSlots };
}

const pairs = (shows: readonly ShowCommand[]): Array<readonly [string, number]> => shows.map((show) => [show.show, show.tick] as const);

describe('Story 3.3 QA -- AC5/AC6: FrameOutput.commands carries the rules\' shows unchanged -- same shows, same order within a tick, same ticks', () => {
	it('one tick per advance(): the loop hands back exactly the rules\' shows; the park tick carries [open, hit], T+HIT_GAP [hit] and the close tick [close, hit], in that order', () => {
		const result = run(1);
		expect(
			result.parkSlots,
			'the premise: AC5\'s uncredited park lands on T (5506) -- a measured physics tick: if public/assets/dragonwar.collision.json or sim/physics changed, ' +
				're-measure AC5\'s recipe (spec-3-3 Design Notes) and update T here and in dragon-shows-physics.test.ts; do not loosen it',
		).toEqual([true, false, false]);
		expect(pairs(result.rulesShows), 'the premise: the real rules emit both same-tick pairs').toEqual([
			[OPEN, T],
			[HIT, T],
			[HIT, T + HIT_GAP],
			[CLOSE, T + L + H],
			[HIT, T + L + H],
		]);
		expect(result.loopShows, 'FrameOutput.commands\' shows are the rules\' shows, whole and in order').toEqual(result.rulesShows);
	}, 120_000);

	it('multi-tick advance() chunks (one holding both T and T+HIT_GAP): the same shows, in tick order across the chunk, identical to the rules\' own', () => {
		// A chunk under the loop's own owed-tick ceiling (MAX_OWED_TICKS) that
		// holds T and T+HIT_GAP together, so shows from two ticks share one
		// FrameOutput.
		const chunk = Math.min(MAX_OWED_TICKS, 97);
		const chunkOf = (tick: number): number => Math.floor((tick - 1) / chunk);
		expect(chunkOf(T), 'the premise: T and T+HIT_GAP share one advance() chunk').toBe(chunkOf(T + HIT_GAP));
		expect(chunkOf(T + L + H), 'the premise: the close tick lies in a later chunk').toBeGreaterThan(chunkOf(T));
		const batched = run(chunk);
		expect(pairs(batched.loopShows)).toEqual([
			[OPEN, T],
			[HIT, T],
			[HIT, T + HIT_GAP],
			[CLOSE, T + L + H],
			[HIT, T + L + H],
		]);
		expect(batched.loopShows).toEqual(batched.rulesShows);
	}, 120_000);
});
