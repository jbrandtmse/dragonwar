// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.3, AC5 and AC6 (Rule 1 -- Integration, DW-298): the Dragon's
// three shows reach `FrameOutput.commands` through a real
// `createLoop({ collisionDoc, gameStart, tuning })` on production tuning --
// the seam Story 3.3b's rig will read. Before this story no test saw a Mouth
// show leave `sim/loop`, so the loop's `commands.push(...rulesResult.commands)`
// could be deleted with every test green (DW-298).
//
// Both runs share the Lock run's set-up (`test/lock-arbiter-physics.test.ts`):
// Start on tick 2 (its serve is consumed on tick 3, AD-4), the plunger held
// from tick 323 for 521 ticks (the full plunge), released on tick 844, then
// one left-flipper tap measured at planning:
// - AC5: `flipper_l` at release+3957 held 25 -- an uncredited park (DW-171),
//   found in a 410-run sweep; its Mouth sequence is the only one in the run;
// - AC6: `plunge-then-bat-l-3911` (`test/util/reachability.ts`), `flipper_l`
//   at release+3911 held 60 -- `s_dragon_body`'s one closure in the run.
//
// Every Mouth tick is derived from `resolveTuning()`; the park tick (5506)
// and the hit tick (4990) are the two planning measurements the spec pins.
//
// A `*-physics.test.ts` file: it drives real physics on purpose, so it is
// not a `rules-*` headless test and is not listed in
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning, shotWindowTicks } from '../src/sim/table/tuning';
import type { GameAdjustments } from '../src/sim/contracts/replay';
import type { GameStart, GameState, SemanticEvent } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

const TUNING = resolveTuning();
const LEAD = shotWindowTicks('mouthOpenLeadMs', TUNING);
const HOLD = shotWindowTicks('mouthCloseHoldMs', TUNING);
const ADJUSTMENTS: GameAdjustments = { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 };

const MOUTH_OPEN = 'show_dragon_mouth_open';
const MOUTH_CLOSE = 'show_dragon_mouth_close';
const HIT = 'show_dragon_hit';

/**
 * Appended to each measured-tick assertion (5506, 4990). Both ticks are
 * planning measurements on the committed `public/assets/dragonwar.collision.json`
 * and the current physics, so a geometry or physics change moves them BY
 * DESIGN. The fix is a re-measurement (the spec's Design Notes: a sweep of
 * left-flipper taps after the full plunge, production tuning), never a
 * looser assertion.
 */
const REMEASURE =
	' -- a measured physics tick: if public/assets/dragonwar.collision.json or sim/physics changed (e.g. an Epic 5 asset regeneration), ' +
	're-measure this recipe (spec-3-3 Design Notes, the flipper-tap sweep) and update the pin; do not loosen it';

/** The full plunge: held from tick 323 for 521 ticks, released on tick 844. */
const PLUNGE_ON = 323;
const PLUNGE_HOLD = 521;
const RELEASE_ON = PLUNGE_ON + PLUNGE_HOLD;

interface ShowAt {
	readonly show: string;
	readonly tick: number;
}

interface RunResult {
	readonly shows: readonly ShowAt[];
	readonly events: readonly SemanticEvent[];
	readonly lockEjectContactTicks: readonly number[];
	/** The first tick `snapshot.game.machine.deviceSlots.bd_lock` read `[true, false, false]`, or -1. */
	readonly firstParkTick: number;
	readonly statesByTick: ReadonlyMap<number, GameState>;
}

/** Start on tick 2, the full plunge, then one left-flipper tap `flip.atTick` ticks after the release, held `flip.holdTicks`; runs until `lastTick(firstParkTick)`. */
function run(flip: { readonly atTick: number; readonly holdTicks: number }, lastTick: (firstParkTick: number) => number): RunResult {
	const gameStart: GameStart = { seed: 0, tuning: TUNING, adjustments: ADJUSTMENTS, highscores: [] };
	const loop = createLoop({ collisionDoc: JSON.parse(readFileSync(COLLISION_PATH, 'utf8')), gameStart, tuning: TUNING });
	const flipOn = RELEASE_ON + flip.atTick;
	const transitions = [
		{ tick: 2, frame: { ...NO_FRAME, start: true } },
		{ tick: 3, frame: NO_FRAME },
		{ tick: PLUNGE_ON, frame: { ...NO_FRAME, plunger: true } },
		{ tick: RELEASE_ON, frame: NO_FRAME },
		{ tick: flipOn, frame: { ...NO_FRAME, flipper_l: true } },
		{ tick: flipOn + flip.holdTicks, frame: NO_FRAME },
	];

	const shows: ShowAt[] = [];
	const events: SemanticEvent[] = [];
	const lockEjectContactTicks: number[] = [];
	const statesByTick = new Map<number, GameState>();
	let firstParkTick = -1;
	let tick = 0;
	while (tick < lastTick(firstParkTick)) {
		tick += 1;
		const out = loop.advance(1, transitions.filter((transition) => transition.tick === tick));
		for (const command of out.commands) {
			if (command.type === 'show') {
				shows.push({ show: command.show, tick: command.tick });
			}
		}
		events.push(...out.events);
		for (const contact of out.contactEvents) {
			if (contact.kind === 'eject' && contact.device === TABLE.lockLaneWiring.device) {
				lockEjectContactTicks.push(contact.tick);
			}
		}
		statesByTick.set(tick, out.snapshot.game);
		const lock = out.snapshot.game.machine.deviceSlots.bd_lock;
		if (firstParkTick === -1 && lock[0] === true && lock[1] === false && lock[2] === false) {
			firstParkTick = tick;
		}
	}
	return { shows, events, lockEjectContactTicks, firstParkTick, statesByTick };
}

describe('Story 3.3, AC5 (DW-298) -- a real loop carries the Mouth sequence into FrameOutput.commands', () => {
	it('flipper_l at release+3957 held 25 parks the ball uncredited: the Mouth shows are exactly [open@T, close@T+LEAD+HOLD], with the bd_lock eject contact between them at T+LEAD+1 and no lock_lane_* event', () => {
		// Cap the run at 9000 ticks until the park is seen, then at T+LEAD+HOLD+500.
		const result = run({ atTick: 3957, holdTicks: 25 }, (parkTick) => (parkTick === -1 ? 9000 : parkTick + LEAD + HOLD + 500));
		const T = result.firstParkTick;
		expect(T, `the planning measurement: bd_lock first reads [true,false,false] on tick 5506 (-1 = no park at all)${REMEASURE}`).toBe(5506);

		const mouthShows = result.shows.filter((entry) => entry.show === MOUTH_OPEN || entry.show === MOUTH_CLOSE);
		expect(mouthShows, 'one open on the park tick, one close HOLD after the pulse').toEqual([
			{ show: MOUTH_OPEN, tick: T },
			{ show: MOUTH_CLOSE, tick: T + LEAD + HOLD },
		]);
		expect(result.events.filter((event) => event.type.startsWith('lock_lane_')), 'an uncredited park: no lock_lane_* event').toEqual([]);
		expect(result.lockEjectContactTicks, 'physics consumes the pulse at T+LEAD on the next tick (AD-4), between the open and the close').toEqual([T + LEAD + 1]);
	}, 120_000);
});

describe('Story 3.3, AC6 -- a real loop carries the Dragon\'s hit reaction into FrameOutput.commands', () => {
	it('plunge-then-bat-l-3911 (flipper_l at release+3911 held 60), run to tick 7000: exactly one show_dragon_hit, at tick 4990, in an untilted game', () => {
		const result = run({ atTick: 3911, holdTicks: 60 }, () => 7000);
		const hitShows = result.shows.filter((entry) => entry.show === HIT);
		expect(hitShows, `the planning measurement: s_dragon_body closes once, at tick 4990${REMEASURE}`).toEqual([{ show: HIT, tick: 4990 }]);
		const atHit = result.statesByTick.get(4990)!;
		expect(atHit.phase, `the premise: phase game${REMEASURE}`).toBe('game');
		expect(atHit.machine.tilt.tilted, `the premise: untilted${REMEASURE}`).toBe(false);
	}, 120_000);
});
