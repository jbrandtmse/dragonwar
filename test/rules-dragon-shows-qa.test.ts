// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.3 QA (AD-18, AD-19, AD-9, AD-8): the headless gaps the build
// stage's matrix file (`test/rules-dragon-shows.test.ts`) leaves open. Every
// row there drives the Mouth through ONE request path, the uncredited park;
// this file drives every OTHER path that requests a Mouth eject and pins the
// same close rule on each:
// 1. Every request path -- the spit, the `bd_lock` overflow answer (in a
//    game and in Attract), ball search's two Lock stages, a three-eject
//    sequence -- ends with exactly one `show_dragon_mouth_close`, exactly H
//    after its LAST pulse, and the Mouth shows strictly alternate with every
//    `c_mouth` pulse between an open and its close (AC2, AC3).
// 2. A request inside the hold from a path other than the park -- the
//    overflow answer and the spit -- closes first, then opens (AC3); a
//    request on the last pulse's own tick and on the close's own due tick
//    each give exactly one close (AC3's boundaries).
// 3. The hit reaction in all four phases (`attract`, `game`,
//    `highscore_entry`, `game_over`), under Tilt and under a Slam, one per
//    closed edge across ticks, none while the switch is merely held; a hit
//    on the close tick composes after the close; and the hit is
//    presentation only -- it emits no coil and changes no state, and the
//    `dragon_hit` still reaches the mode stack (AC4, Boundaries).
//
// No physics, no rendering, no `sim/loop` (listed in
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES). Every tick is
// derived from `resolveTuning()`: L `mouthOpenLeadTicks`, I
// `mouthEjectIntervalTicks`, H `mouthCloseHoldTicks`. Every negative is
// paired with its positive.

import { describe, expect, it, vi } from 'vitest';
import { resolveTuning, shotWindowTicks } from '../src/sim/table/tuning';
import { close, runRulesScript, type RunRulesScriptResult } from './util/switch-script';
import type { ModeDefinition } from '../src/sim/rules/modes';
import type { PlayerState } from '../src/sim/contracts/state';
import type { GameState, MachineReport, MachineState, SwitchEvent, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const L = shotWindowTicks('mouthOpenLeadMs', TUNING);
const I = shotWindowTicks('mouthEjectIntervalMs', TUNING);
const H = shotWindowTicks('mouthCloseHoldMs', TUNING);
const CAPTURE_WINDOW = shotWindowTicks('lockCaptureWindowMs', TUNING);
const SEARCH = shotWindowTicks('ballSearchMs', TUNING);
const STEP = shotWindowTicks('ballSearchStepMs', TUNING);
const LANE_LEAD = Math.floor(CAPTURE_WINDOW / 2);

const MOUTH_COIL = 'c_mouth';
const OPEN = 'show_dragon_mouth_open';
const CLOSE = 'show_dragon_mouth_close';
const HIT = 'show_dragon_hit';

// ---------------------------------------------------------------------------
// The delivery log (Boundaries: "`dragon_hit` still reaches the mode stack
// unchanged"): the production base mode, wrapped to log every event type it
// receives -- `test/ad18-lock-lane-consumer.test.ts`'s pattern. The rest of
// the modes barrel is the real module, and the wrapped mode's own result is
// returned untouched, so every other test here runs the production stack.
// ---------------------------------------------------------------------------

const delivered = vi.hoisted(() => ({ types: [] as string[] }));

vi.mock('../src/sim/rules/modes', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/sim/rules/modes')>();
	return {
		...actual,
		createModeStack: (tuning: Parameters<typeof actual.createModeStack>[0], definitions?: readonly ModeDefinition[]) => {
			if (definitions !== undefined) {
				return actual.createModeStack(tuning, definitions);
			}
			const [base, ...rest] = actual.createProductionModeDefinitions(tuning);
			const logged: ModeDefinition = {
				...base!,
				onEvent: (state, entry, event, tick) => {
					delivered.types.push(event.type);
					return base!.onEvent(state, entry, event, tick);
				},
			};
			return actual.createModeStack(tuning, [logged, ...rest]);
		},
	};
});

function player(overrides: Partial<PlayerState> = {}): PlayerState {
	return {
		score: 0,
		letters: '',
		lockCredits: 0,
		tiltWarnings: 0,
		bonus: { byCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1 },
		lanes: { lit: {}, completedSets: [] },
		extraBalls: 0,
		jackpotSeed: 0,
		warsStarted: 0,
		modesPlayed: [],
		ballNumber: 1,
		...overrides,
	};
}

/** A state in `phase` (default `game`, the base mode active), the Lock holding `held` balls. */
function state(options: {
	readonly phase?: GameState['phase'];
	readonly held?: number;
	readonly tilted?: boolean;
	readonly slamTilted?: boolean;
	readonly players?: readonly PlayerState[];
	readonly machine?: Partial<MachineState>;
} = {}): GameState {
	const phase = options.phase ?? 'game';
	const inGame = phase === 'game';
	const tilted = options.tilted ?? false;
	const held = options.held ?? 0;
	return {
		tick: 0,
		phase,
		machine: {
			ballsInPlay: inGame ? 1 : 0,
			hardwareEnabled: inGame && !tilted,
			ballSave: { untilTick: null, sources: [] },
			tilt: { tilted, slamTilted: options.slamTilted ?? false },
			multiball: null,
			highscores: [],
			deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [0, 1, 2].map((slot) => slot < held) },
			...options.machine,
		},
		players: options.players ?? [player()],
		currentPlayer: 0,
		modes: inGame ? [{ mode: 'base', priority: 100, player: 0 }] : [],
		rng: 0,
	};
}

/** A captured Lock entry: the lane closes `LANE_LEAD` ticks before `slot` closes at `t` (inside the capture window). */
function capture(slot: SwitchName, t: number): readonly SwitchEvent[] {
	return close('s_lock_lane').at(t - LANE_LEAD).open().at(t - LANE_LEAD + 5).close(slot).at(t).build();
}

function overflowAt(tick: number): ReadonlyMap<number, MachineReport> {
	return new Map([[tick, { recovered: null, failures: [{ type: 'device_overflow', device: 'bd_lock', tick }] }]]);
}

function mouthShows(result: RunRulesScriptResult): Array<readonly [string, number]> {
	return result.commands.filter((command) => command.show === OPEN || command.show === CLOSE).map((command) => [command.show, command.tick] as const);
}

function hitTicks(result: RunRulesScriptResult): number[] {
	return result.commands.filter((command) => command.show === HIT).map((command) => command.tick);
}

function mouthPulses(result: RunRulesScriptResult): number[] {
	return result.coilCommands.filter((command) => command.coil === MOUTH_COIL && command.action === 'pulse').map((command) => command.tick);
}

function showsAt(result: RunRulesScriptResult, tick: number): string[] {
	return result.commands.filter((command) => command.tick === tick).map((command) => command.show);
}

/**
 * AC3's run-wide invariant, and AD-18's one-pulser rule seen from outside:
 * the Mouth shows strictly alternate open/close, starting with open and
 * ending with close, and every `c_mouth` pulse falls between an open and
 * its close -- a bare pulse from anywhere but the arbiter's sequence has no
 * open around it.
 */
function expectAlternatingWithPulsesInside(result: RunRulesScriptResult): void {
	const shows = mouthShows(result);
	expect(shows.length % 2, `an even number of Mouth shows: ${JSON.stringify(shows)}`).toBe(0);
	shows.forEach(([show], index) => {
		expect(show, `show #${index} alternates, starting with open`).toBe(index % 2 === 0 ? OPEN : CLOSE);
	});
	for (const pulse of mouthPulses(result)) {
		const inside = shows.some(([show, tick], index) => show === OPEN && tick <= pulse && shows[index + 1]![1] >= pulse);
		expect(inside, `the pulse at ${pulse} falls between an open and its close`).toBe(true);
	}
}

describe('Story 3.3 QA -- the premises every row below derives from', () => {
	it('L, I and H resolve to positive ticks, and I > H: a close recorded after a non-last pulse would land before the next pulse', () => {
		expect(L).toBeGreaterThan(0);
		expect(H).toBeGreaterThan(0);
		expect(I, 'I > H, so the three-eject row can see an early close between pulses').toBeGreaterThan(H);
		expect(STEP, 'ball search\'s second Lock stage lands inside the hold').toBeLessThan(H);
	});
});

// ---------------------------------------------------------------------------
// 1. Every request path closes exactly H after its last pulse (AC2, AC3).
// ---------------------------------------------------------------------------

describe('Story 3.3 QA -- AC2 on every request path: one close, exactly H after the sequence\'s last pulse', () => {
	it('the spit (two credits, a capture into s_lock_3): lock_lane_spit, then Mouth shows [open@t, close@t+L+H] and c_mouth only at t+L', () => {
		const t = 300;
		const result = runRulesScript(capture('s_lock_3', t), {
			durationTicks: t + L + H + 50,
			initialState: state({ players: [player({ lockCredits: 2 })], held: 2 }),
		});
		expect(result.events.filter((event) => event.type === 'lock_lane_spit').map((event) => event.tick), 'the premise: the capture spat').toEqual([t]);
		expect(mouthPulses(result)).toEqual([t + L]);
		expect(mouthShows(result)).toEqual([
			[OPEN, t],
			[CLOSE, t + L + H],
		]);
		expectAlternatingWithPulsesInside(result);
	});

	it('the bd_lock overflow answer, in a game and in Attract alike: Mouth shows [open@t, close@t+L+H] and c_mouth only at t+L', () => {
		const t = 300;
		for (const phase of ['game', 'attract'] as const) {
			const result = runRulesScript([], { durationTicks: t + L + H + 50, initialState: state({ phase, held: 3 }), machineReports: overflowAt(t) });
			expect(mouthPulses(result), `${phase}: one pulse, L later`).toEqual([t + L]);
			expect(mouthShows(result), `${phase}: open, then the close H after the pulse`).toEqual([
				[OPEN, t],
				[CLOSE, t + L + H],
			]);
			expectAlternatingWithPulsesInside(result);
		}
	});

	it('a three-eject sequence (three parks): pulses at t+L, t+L+I, t+L+2I and ONE close, at t+L+2I+H -- none H after the first or the second pulse', () => {
		const t = 300;
		const script = [...close('s_lock_1').at(t).build(), ...close('s_lock_2').at(t + 1).build(), ...close('s_lock_3').at(t + 2).build()];
		const result = runRulesScript(script, { durationTicks: t + L + 2 * I + H + 50, initialState: state({ machine: { ballsInPlay: 3 } }) });
		expect(mouthPulses(result)).toEqual([t + L, t + L + I, t + L + 2 * I]);
		expect(mouthShows(result)).toEqual([
			[OPEN, t],
			[CLOSE, t + L + 2 * I + H],
		]);
		expectAlternatingWithPulsesInside(result);
	});

	it('ball search\'s two Lock stages (L holds 2): open@first, close@second then open@second, and the last close exactly H after the second pulse', () => {
		const O = 100;
		const firstShow = O + SEARCH + 6 * STEP;
		const secondShow = firstShow + L + STEP;
		const script = [
			// A stuck ball: launched at O, closing nothing afterwards.
			...close('s_shooter_lane').open().at(O).build(),
			// Each pulse spits the highest held slot, which opens a tick later.
			...close('s_lock_2').open().at(firstShow + L + 1).build(),
			...close('s_lock_1').open().at(secondShow + L + 1).build(),
		];
		const result = runRulesScript(script, {
			durationTicks: secondShow + L + H + 50,
			initialState: state({
				held: 2,
				machine: { ballsInPlay: 0, deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [true], bd_lock: [true, true, false] } },
			}),
		});
		expect(mouthPulses(result)).toEqual([firstShow + L, secondShow + L]);
		expect(mouthShows(result)).toEqual([
			[OPEN, firstShow],
			[CLOSE, secondShow],
			[OPEN, secondShow],
			[CLOSE, secondShow + L + H],
		]);
		expectAlternatingWithPulsesInside(result);
	});
});

// ---------------------------------------------------------------------------
// 2. A request while the close is pending, from paths other than the park
//    (AC3), and the two boundary ticks of the hold.
// ---------------------------------------------------------------------------

describe('Story 3.3 QA -- AC3: a request inside the hold from any path closes first, then opens', () => {
	/** A park at t whose ball is spat (its slot opening at t+L+1); the last pulse is at P = t+L. */
	const t = 300;
	const P = t + L;
	const parkAndSpit = close('s_lock_1').at(t).open().at(P + 1).build();

	it('the overflow answer inside the hold: at r the close then the open; the new pulse at r+L; open, close, open, close -- the same overflow after the hold opens alone', () => {
		const r = P + Math.floor(H / 2);
		const inside = runRulesScript(parkAndSpit, { durationTicks: r + L + H + 50, initialState: state({ held: 0 }), machineReports: overflowAt(r) });
		expect(showsAt(inside, r), 'at r: [close, open], in that order').toEqual([CLOSE, OPEN]);
		expect(mouthPulses(inside)).toEqual([P, r + L]);
		expect(mouthShows(inside)).toEqual([
			[OPEN, t],
			[CLOSE, r],
			[OPEN, r],
			[CLOSE, r + L + H],
		]);
		expectAlternatingWithPulsesInside(inside);

		const r2 = P + H + 50;
		const after = runRulesScript(parkAndSpit, { durationTicks: r2 + L + H + 50, initialState: state({ held: 0 }), machineReports: overflowAt(r2) });
		expect(showsAt(after, r2), 'control: after the hold the overflow opens alone').toEqual([OPEN]);
		expect(mouthShows(after)).toEqual([
			[OPEN, t],
			[CLOSE, P + H],
			[OPEN, r2],
			[CLOSE, r2 + L + H],
		]);
	});

	it('the spit inside the hold: a capture at r (two credits) closes the pending sequence, then opens its own', () => {
		const r = P + Math.floor(H / 2);
		const script = [...parkAndSpit, ...capture('s_lock_1', r)];
		const result = runRulesScript(script, { durationTicks: r + L + H + 50, initialState: state({ players: [player({ lockCredits: 2 })] }) });
		expect(result.events.filter((event) => event.type === 'lock_lane_spit').map((event) => event.tick), 'the premise: the second entry spat').toEqual([r]);
		expect(showsAt(result, r)).toEqual([CLOSE, OPEN]);
		expect(mouthPulses(result)).toEqual([P, r + L]);
		expect(mouthShows(result)).toEqual([
			[OPEN, t],
			[CLOSE, r],
			[OPEN, r],
			[CLOSE, r + L + H],
		]);
		expectAlternatingWithPulsesInside(result);
	});

	it('a request on the last pulse\'s own tick P: the pulse, then [close, open] on P -- the pulse lies inside the first pair, and one close per sequence', () => {
		// The second park lands on another slot on the very tick the first
		// sequence's only pulse fires: that pulse ends the sequence (records
		// the close) before the park requests, so the request finds a close
		// pending and emits it at once.
		const script = [...close('s_lock_1').at(t).open().at(P + 1).build(), ...close('s_lock_2').at(P).build()];
		const result = runRulesScript(script, { durationTicks: P + L + H + 50, initialState: state({ machine: { ballsInPlay: 2 } }) });
		expect(mouthPulses(result)).toEqual([P, P + L]);
		expect(showsAt(result, P)).toEqual([CLOSE, OPEN]);
		expect(mouthShows(result)).toEqual([
			[OPEN, t],
			[CLOSE, P],
			[OPEN, P],
			[CLOSE, P + L + H],
		]);
		expectAlternatingWithPulsesInside(result);
	});

	it('a request on the close\'s own due tick P+H: exactly ONE close there, then the open -- and one tick later the due close has already gone out alone', () => {
		const onDue = runRulesScript([...parkAndSpit, ...close('s_lock_1').at(P + H).build()], {
			durationTicks: P + H + L + H + 50,
			initialState: state(),
		});
		expect(showsAt(onDue, P + H), 'one close, then the open').toEqual([CLOSE, OPEN]);
		expect(mouthShows(onDue)).toEqual([
			[OPEN, t],
			[CLOSE, P + H],
			[OPEN, P + H],
			[CLOSE, P + H + L + H],
		]);
		expectAlternatingWithPulsesInside(onDue);

		const after = runRulesScript([...parkAndSpit, ...close('s_lock_1').at(P + H + 1).build()], {
			durationTicks: P + H + 1 + L + H + 50,
			initialState: state(),
		});
		expect(showsAt(after, P + H), 'control: the due close alone').toEqual([CLOSE]);
		expect(showsAt(after, P + H + 1), 'control: the next request opens alone').toEqual([OPEN]);
		expectAlternatingWithPulsesInside(after);
	});
});

// ---------------------------------------------------------------------------
// 3. The hit reaction (AC4, Boundaries).
// ---------------------------------------------------------------------------

describe('Story 3.3 QA -- AC4: one show_dragon_hit per closed edge of s_dragon_body, in every phase and under Tilt and a Slam', () => {
	const t = 200;
	const cases: ReadonlyArray<{ readonly label: string; readonly initial: GameState }> = [
		{ label: 'game', initial: state() },
		{ label: 'game, tilted', initial: state({ tilted: true }) },
		{ label: 'game, slam-tilted', initial: state({ tilted: true, slamTilted: true }) },
		{ label: 'attract', initial: state({ phase: 'attract' }) },
		{ label: 'highscore_entry', initial: state({ phase: 'highscore_entry' }) },
		{ label: 'game_over', initial: state({ phase: 'game_over' }) },
	];

	for (const { label, initial } of cases) {
		it(`${label}: s_dragon_body closing at t gives exactly one show_dragon_hit@t; s_dragon_d closing at t gives none`, () => {
			const hit = runRulesScript(close('s_dragon_body').at(t).build(), { durationTicks: t + 20, initialState: initial });
			expect(hit.statesByTick.get(t)!.phase, `the premise: phase ${initial.phase} at the hit`).toBe(initial.phase);
			expect(hitTicks(hit), `${label}: the Dragon reacts`).toEqual([t]);

			const control = runRulesScript(close('s_dragon_d').at(t).build(), { durationTicks: t + 20, initialState: initial });
			expect(hitTicks(control), `${label}: a non-Dragon closure gives none`).toEqual([]);
		});
	}

	it('one per closed edge across ticks: closes at t and t+100 give shows at [t, t+100]; the same switch held closed from t to t+300 gives exactly one', () => {
		const twice = runRulesScript(close('s_dragon_body').at(t).open().at(t + 30).close().at(t + 100).build(), { durationTicks: t + 150, initialState: state() });
		expect(hitTicks(twice)).toEqual([t, t + 100]);

		const held = runRulesScript(close('s_dragon_body').at(t).open().at(t + 300).build(), { durationTicks: t + 350, initialState: state() });
		expect(hitTicks(held), 'no repeat while held, none on the opening edge').toEqual([t]);
	});

	it('a hit on the close\'s own tick composes after it: commands at t+L+H are [close, hit]; a hit on the pulse tick is the only show there', () => {
		const park = 300;
		const script = [...close('s_lock_1').at(park).open().at(park + L + 1).build(), ...close('s_dragon_body').at(park + L).open().at(park + L + 30).close().at(park + L + H).build()];
		const result = runRulesScript(script, { durationTicks: park + L + H + 20, initialState: state() });
		expect(showsAt(result, park + L), 'the pulse emits no show: the hit alone').toEqual([HIT]);
		expect(showsAt(result, park + L + H), 'the Mouth\'s close first, then the hit').toEqual([CLOSE, HIT]);
		expect(mouthPulses(result)).toEqual([park + L]);
	});
});

describe('Story 3.3 QA -- the hit reaction is presentation only: no coil, no state change, and dragon_hit still reaches the mode stack', () => {
	it('a game with a park and a hit, against the same game without the hit: identical coil commands and states on every tick; the commands differ by the one show_dragon_hit alone; the base mode receives dragon_hit', () => {
		const t = 300;
		const hitAt = t + 40;
		const park = close('s_lock_1').at(t).open().at(t + L + 1).build();

		delivered.types.length = 0;
		const withHit = runRulesScript([...park, ...close('s_dragon_body').at(hitAt).build()], { durationTicks: t + L + H + 20, initialState: state() });
		expect(delivered.types.filter((type) => type === 'dragon_hit'), 'the base mode receives the dragon_hit').toHaveLength(1);

		delivered.types.length = 0;
		const without = runRulesScript(park, { durationTicks: t + L + H + 20, initialState: state() });
		expect(delivered.types.filter((type) => type === 'dragon_hit'), 'control: no hit, nothing delivered').toEqual([]);

		expect(withHit.coilCommands, 'the hit adds no coil command').toEqual(without.coilCommands);
		expect(mouthPulses(withHit), 'the premise: the arbiter pulsed the Mouth').toEqual([t + L]);
		expect(withHit.commands.filter((command) => command.show !== HIT), 'every other show is unchanged').toEqual(without.commands);
		expect(hitTicks(withHit)).toEqual([hitAt]);
		// This compares a run WITH an `s_dragon_body` closure against one
		// without, so it pins "the hit reaction changes no state" only while
		// no rules code consumes `dragon_hit` (true at Story 3.3). A later
		// story that gives `dragon_hit` a state-changing consumer (a mode that
		// scores or counts hits) turns it red by design: re-scope this loop to
		// the fields that consumer does not own -- keep the coil and show
		// checks above as they are.
		for (let tick = 1; tick <= t + L + H + 20; tick++) {
			expect(
				withHit.statesByTick.get(tick),
				`the hit changes no state (tick ${tick}) -- if a later story gave dragon_hit a state-changing consumer, re-scope this comparison (see the comment above), do not delete it`,
			).toEqual(without.statesByTick.get(tick));
		}
		expectAlternatingWithPulsesInside(withHit);
	});
});
