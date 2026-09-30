// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.3 (AD-18, AD-19, AD-9): the headless coverage of the Dragon's
// shows -- every row of the spec's I/O & Edge-Case Matrix, driven through
// `runRulesScript()` (`test/util/switch-script.ts`) with switch edges
// scripted by hand, plus direct unit tests of `dragonHitShows()`
// (`src/sim/rules/dragon-hit.ts`). No physics, no rendering, no `sim/loop`
// (gated by `test/rules-devices-headless.test.ts`'s ENTRY_FILES). The
// real-loop half (AC5, AC6) is `test/dragon-shows-physics.test.ts`.
//
// A Mouth request is an uncredited park (a hand-closed `s_lock_1` with no
// `s_lock_lane`, DW-171); a hit is a closed `s_dragon_body`. Every tick is
// derived from `resolveTuning()` (the spec's Boundaries): L is
// `mouthOpenLeadTicks`, I `mouthEjectIntervalTicks`, H `mouthCloseHoldTicks`.
// Every negative is paired with its positive.

import { describe, expect, it } from 'vitest';
import { createRules } from '../src/sim/rules';
import { dragonHitShows } from '../src/sim/rules/dragon-hit';
import { resolveTuning, shotWindowTicks, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { close, runRulesScript, type RunRulesScriptResult } from './util/switch-script';
import type { DeviceEvent } from '../src/sim/rules/devices';
import type { PlayerState } from '../src/sim/contracts/state';
import type { GameState, MachineState, ShowCommand, SwitchEvent } from '../src/sim/table/names';

const TUNING = resolveTuning();
const L = shotWindowTicks('mouthOpenLeadMs', TUNING);
const I = shotWindowTicks('mouthEjectIntervalMs', TUNING);
const H = shotWindowTicks('mouthCloseHoldMs', TUNING);
const POP = TUNING.popScore.value;

const MOUTH_COIL = 'c_mouth';
const OPEN = 'show_dragon_mouth_open';
const CLOSE = 'show_dragon_mouth_close';
const HIT = 'show_dragon_hit';

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

/** A mid-ball state (the Lock empty), or an Attract one. The base mode is active in a game, so a pop scores unless the score gate is shut. */
function gameState(options: { readonly phase?: GameState['phase']; readonly tilted?: boolean; readonly machine?: Partial<MachineState> } = {}): GameState {
	const phase = options.phase ?? 'game';
	const tilted = options.tilted ?? false;
	const inGame = phase === 'game';
	return {
		tick: 0,
		phase,
		machine: {
			ballsInPlay: inGame ? 1 : 0,
			hardwareEnabled: inGame && !tilted,
			ballSave: { untilTick: null, sources: [] },
			tilt: { tilted, slamTilted: false },
			multiball: null,
			highscores: [],
			deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] },
			...options.machine,
		},
		players: [player()],
		currentPlayer: 0,
		modes: inGame ? [{ mode: 'base', priority: 100, player: 0 }] : [],
		rng: 0,
	};
}

/** Every Mouth show (open or close), in order, as `[show, tick]` pairs. */
function mouthShows(result: RunRulesScriptResult): Array<readonly [string, number]> {
	return result.commands.filter((command) => command.show === OPEN || command.show === CLOSE).map((command) => [command.show, command.tick] as const);
}

function hitShows(result: RunRulesScriptResult): Array<readonly [string, number]> {
	return result.commands.filter((command) => command.show === HIT).map((command) => [command.show, command.tick] as const);
}

function mouthPulses(result: RunRulesScriptResult): number[] {
	return result.coilCommands.filter((command) => command.coil === MOUTH_COIL && command.action === 'pulse').map((command) => command.tick);
}

/**
 * AC3's run-wide invariant: the Mouth shows strictly alternate open/close,
 * starting with open and ending with close, and every `c_mouth` pulse falls
 * between an open and its close (a pulse on its close's own tick counts:
 * the hold-0 close follows the pulse inside that tick).
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

// ---------------------------------------------------------------------------
// AC2: one close, exactly H after the sequence's last pulse (rows 1, 2, 5).
// ---------------------------------------------------------------------------

describe('Story 3.3 -- AC2: a Mouth sequence ends with show_dragon_mouth_close exactly H after its last pulse', () => {
	it('One eject: a park at t gives Mouth shows [open@t, close@t+L+H] and c_mouth only at t+L -- no close before t+L+H', () => {
		const t = 300;
		const script = close('s_lock_1').at(t).open().at(t + L + 1).build();
		const result = runRulesScript(script, { durationTicks: t + L + H + 50, initialState: gameState() });
		expect(mouthPulses(result)).toEqual([t + L]);
		expect(mouthShows(result)).toEqual([
			[OPEN, t],
			[CLOSE, t + L + H],
		]);
		expect(result.commands.filter((command) => command.show === CLOSE && command.tick < t + L + H), 'no close before t+L+H').toEqual([]);
		expectAlternatingWithPulsesInside(result);
	});

	it('Two ejects, one sequence: parks at t and t+5 give Mouth shows [open@t, close@t+L+I+H]; pulses at t+L and t+L+I; no close after the first pulse', () => {
		const t = 300;
		const script = [...close('s_lock_1').at(t).build(), ...close('s_lock_2').at(t + 5).build()];
		const result = runRulesScript(script, { durationTicks: t + L + I + H + 50, initialState: gameState({ machine: { ballsInPlay: 2 } }) });
		expect(mouthPulses(result)).toEqual([t + L, t + L + I]);
		expect(mouthShows(result)).toEqual([
			[OPEN, t],
			[CLOSE, t + L + I + H],
		]);
		expect(result.commands.filter((command) => command.show === CLOSE && command.tick === t + L + H), 'the first pulse owes no close').toEqual([]);
		expectAlternatingWithPulsesInside(result);
	});

	it('Hold 0 (dev tuning): mouthCloseHoldMs 0 closes on tick t+L itself, after that tick\'s c_mouth -- the SAME park at production tuning closes H later', () => {
		const tuned = resolveTuning({ ...RAW_TUNING, mouthCloseHoldMs: { ...RAW_TUNING.mouthCloseHoldMs, value: 0 } });
		expect(shotWindowTicks('mouthCloseHoldMs', tuned), 'the premise: a 0-tick hold resolves').toBe(0);
		expect(H, 'the premise: production holds for more than 0 ticks').toBeGreaterThan(0);
		const t = 300;
		const script = close('s_lock_1').at(t).build();
		const zero = runRulesScript(script, { durationTicks: t + L + 20, tuning: tuned, initialState: gameState() });
		expect(mouthPulses(zero)).toEqual([t + L]);
		// A close on the pulse tick itself proves the check ran after the pulse:
		// before it, the close would not yet be recorded and would land at t+L+1.
		expect(mouthShows(zero)).toEqual([
			[OPEN, t],
			[CLOSE, t + L],
		]);
		expectAlternatingWithPulsesInside(zero);

		const production = runRulesScript(script, { durationTicks: t + L + H + 20, initialState: gameState() });
		expect(mouthShows(production), 'control: production tuning holds H').toEqual([
			[OPEN, t],
			[CLOSE, t + L + H],
		]);
	});
});

// ---------------------------------------------------------------------------
// AC3: a request while a close is pending (rows 3, 4).
// ---------------------------------------------------------------------------

describe('Story 3.3 -- AC3: a request while the close is pending closes first, then opens a new sequence', () => {
	/** A park at t, its ball spat (the slot opened at t+L+1), and a second park into the same slot at r = t+L+k. */
	function twoParks(k: number): { readonly t: number; readonly r: number; readonly result: RunRulesScriptResult } {
		const t = 300;
		const r = t + L + k;
		const script = close('s_lock_1').at(t).open().at(t + L + 1).close().at(r).build();
		const result = runRulesScript(script, { durationTicks: r + L + H + 50, initialState: gameState() });
		return { t, r, result };
	}

	it('Request inside the hold (1 < k < H): at r the close then the open, in that order; the new pulse at r+L; the last close at r+L+H -- open, close, open, close', () => {
		const k = Math.floor(H / 2);
		expect(k > 1 && k < H, 'the premise: r lies inside the hold').toBe(true);
		const { t, r, result } = twoParks(k);
		expect(result.commands.filter((command) => command.tick === r).map((command) => command.show), 'at r: [close, open], in that order').toEqual([CLOSE, OPEN]);
		expect(mouthPulses(result)).toEqual([t + L, r + L]);
		expect(mouthShows(result)).toEqual([
			[OPEN, t],
			[CLOSE, r],
			[OPEN, r],
			[CLOSE, r + L + H],
		]);
		expectAlternatingWithPulsesInside(result);
	});

	it('Request after the hold (k > H): close@t+L+H, open@r, close@r+L+H -- nothing is emitted early at r', () => {
		const k = H + 50;
		const { t, r, result } = twoParks(k);
		expect(result.commands.filter((command) => command.tick === r).map((command) => command.show), 'at r: the open alone').toEqual([OPEN]);
		expect(mouthPulses(result)).toEqual([t + L, r + L]);
		expect(mouthShows(result)).toEqual([
			[OPEN, t],
			[CLOSE, t + L + H],
			[OPEN, r],
			[CLOSE, r + L + H],
		]);
		expectAlternatingWithPulsesInside(result);
	});
});

// ---------------------------------------------------------------------------
// The pending close is never cancelled -- except by a restarted timeline.
// ---------------------------------------------------------------------------

describe('Story 3.3 -- the pending close survives a Slam and is discarded only when tick runs backwards', () => {
	it('Close survives a Slam: a park at t and a Slam before t+L -- the pulse at t+L and the close at t+L+H both land, in Attract', () => {
		const t = 300;
		const slam = t + 10;
		const script = [...close('s_lock_1').at(t).build(), ...close('s_slam_tilt').at(slam).build()];
		const result = runRulesScript(script, { durationTicks: t + L + H + 50, initialState: gameState() });
		expect(result.statesByTick.get(slam)!.phase, 'the premise: the Slam entered Attract').toBe('attract');
		expect(mouthPulses(result)).toEqual([t + L]);
		expect(mouthShows(result)).toEqual([
			[OPEN, t],
			[CLOSE, t + L + H],
		]);
		expect(result.statesByTick.get(t + L + H)!.phase, 'the close lands in Attract').toBe('attract');
	});

	function runTimeline(restart: boolean): ShowCommand[] {
		const rules = createRules(TUNING);
		const park = 500;
		const pulse = park + L;
		const shows: ShowCommand[] = [];
		let state = gameState();
		const step = (tick: number, events: readonly SwitchEvent[]): void => {
			const result = rules.step(state, events, tick);
			state = result.state;
			shows.push(...result.commands);
		};
		const parkEvents = close('s_lock_1').at(park).build();
		for (let tick = 1; tick <= pulse + 10; tick++) {
			step(tick, tick === park ? parkEvents : []);
		}
		// The restarted timeline runs from tick 1 (< the last pulse) past the
		// original close's due tick; the control simply carries on.
		const from = restart ? 1 : pulse + 11;
		for (let tick = from; tick <= pulse + H + 20; tick++) {
			step(tick, []);
		}
		return shows;
	}

	it('Tick runs backwards: the uninterrupted control closes at P+H; a timeline restarted at tick 1 before P+H never closes', () => {
		const P = 500 + L;
		const control = runTimeline(false);
		expect(control.filter((command) => command.show === CLOSE).map((command) => command.tick), 'positive: the close lands at P+H').toEqual([P + H]);
		const restarted = runTimeline(true);
		expect(restarted.filter((command) => command.show === OPEN).map((command) => command.tick), 'the premise: the sequence opened').toEqual([500]);
		expect(restarted.filter((command) => command.show === CLOSE), 'the restarted timeline discarded the stale close').toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// AC4: the hit reaction (rows 8-11).
// ---------------------------------------------------------------------------

describe('Story 3.3 -- AC4: every dragon_hit gives exactly one show_dragon_hit, in every phase and under Tilt', () => {
	it('Hit: s_dragon_body closing at t in an untilted game gives exactly one show_dragon_hit@t. Control: s_dragon_d closing at t gives none', () => {
		const t = 200;
		const hit = runRulesScript(close('s_dragon_body').at(t).build(), { durationTicks: t + 20, initialState: gameState() });
		expect(hit.commands).toEqual([{ type: 'show', show: HIT, tick: t }]);

		const control = runRulesScript(close('s_dragon_d').at(t).build(), { durationTicks: t + 20, initialState: gameState() });
		expect(control.statesByTick.get(t)!.players[0]!.letters, 'the premise: the control\'s closure is a real DRAGON letter').not.toBe('');
		expect(hitShows(control), 'a non-Dragon closure emits no hit show').toEqual([]);
		expect(control.commands).toEqual([]);
	});

	it('Hit under Tilt and in Attract: one show_dragon_hit@t in each, and nothing scores -- the same hit and pop in an untilted game pays the pop', () => {
		const t = 200;
		const script = [...close('s_dragon_body').at(t).build(), ...close('s_pop_1').at(t).build()];

		const game = runRulesScript(script, { durationTicks: t + 20, initialState: gameState() });
		expect(hitShows(game), 'positive: in an untilted game').toEqual([[HIT, t]]);
		expect(game.finalState.players[0]!.score, 'positive: the untilted game scores the pop').toBe(POP);

		const tilted = runRulesScript(script, { durationTicks: t + 20, initialState: gameState({ tilted: true }) });
		expect(hitShows(tilted), 'under Tilt the Dragon still reacts').toEqual([[HIT, t]]);
		expect(tilted.finalState.players[0]!.score, 'nothing scores under Tilt').toBe(0);

		const attract = runRulesScript(script, { durationTicks: t + 20, initialState: gameState({ phase: 'attract' }) });
		expect(hitShows(attract), 'in Attract the Dragon still reacts').toEqual([[HIT, t]]);
		// No score assertion in Attract: it has no active mode and the score
		// gate needs phase game, so "nothing scores" there cannot fail. The
		// Tilt run above is the falsifiable half of that clause.
	});

	it('Two hits in one batch: dragonHitShows() gives two shows, in batch order, and ignores every other event; an empty or hit-free batch gives none', () => {
		const t = 42;
		const batch: DeviceEvent[] = [
			{ type: 'dragon_hit', tick: t },
			{ type: 'bank_target_down', letter: 'd', tick: t },
			{ type: 'dragon_hit', tick: t },
		];
		expect(dragonHitShows(batch)).toEqual([
			{ type: 'show', show: HIT, tick: t },
			{ type: 'show', show: HIT, tick: t },
		]);
		expect(dragonHitShows([{ type: 'bank_target_down', letter: 'd', tick: t }])).toEqual([]);
		expect(dragonHitShows([])).toEqual([]);
	});

	it('Same-tick hit and open: a park and s_dragon_body at t give commands at t = [open, hit], in that order', () => {
		const t = 300;
		const script = [...close('s_lock_1').at(t).build(), ...close('s_dragon_body').at(t).build()];
		const result = runRulesScript(script, { durationTicks: t + 5, initialState: gameState() });
		expect(result.commands.filter((command) => command.tick === t).map((command) => command.show)).toEqual([OPEN, HIT]);
	});
});
