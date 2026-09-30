// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.4 QA (AC 2, AC 5, AC 7; AD-7, AD-8, AD-18, FR-33): headless
// coverage the implement stage's `test/rules-campaign.test.ts` left
// constructed. Both runs start from Attract with a real Start on a real
// `createRules()` (through `runRulesScript()`), never a seeded
// `modesPlayed` or `modesLit`:
//
// - "The order restarts", through real play: a four-ball game plays
//   Hurry-up, Quick multiball and Joust on balls 1-3 (AC 7's own script),
//   then ball 4's Ramp lights Hurry-up again and its Lock capture starts it
//   a second time. The Matrix "Restart" row seeds `modesPlayed`; here the
//   log is built by the arbiter's own starts.
// - Per player (Hot seat, AD-7): a Ramp lights only the Ramp player's Mode,
//   and a capture starts only the capturing player's -- player 1's lit
//   Hurry-up survives player 2's capture untouched, and player 2's own Ramp
//   and capture start player 2's Hurry-up. At every tick, each player's
//   `lockCredits` and `letters` equal a control run with the Ramps removed.
//
// Headless (no physics, no loop, no rendering): listed in
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES.

import { describe, expect, it } from 'vitest';
import { DEFAULT_ADJUSTMENTS } from '../src/sim/rules';
import { resolveTuning, shotWindowTicks, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { close, runRulesScript, type RunRulesScriptResult } from './util/switch-script';
import type { ModeEvent } from '../src/sim/rules';
import type { SwitchEvent, SwitchName } from '../src/sim/table/names';

/** No ball save, so every scripted drain ends the ball rather than re-serving. */
const TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});
const L = shotWindowTicks('mouthOpenLeadMs', TUNING);
const LANE_LEAD = Math.floor(shotWindowTicks('lockCaptureWindowMs', TUNING) / 2);
const CAMPAIGN = ['hurryup', 'quickmb', 'joust'];

/** A captured Lock entry: the lane closes `LANE_LEAD` ticks before `slot` closes at `t` (inside the capture window). */
function capture(slot: SwitchName, t: number): readonly SwitchEvent[] {
	return close('s_lock_lane').at(t - LANE_LEAD).open().at(t - LANE_LEAD + 5).close(slot).at(t).build();
}

/** A made Ramp: `shot_ramp_made` fires at `t`. */
function ramp(t: number): readonly SwitchEvent[] {
	return close('s_ramp_enter').at(t - 20).open().at(t - 15).close('s_ramp_made').at(t).open().at(t + 5).build();
}

function press(button: SwitchName, at: number, release: number): readonly SwitchEvent[] {
	return close(button).at(at).open().at(release).build();
}

/** A served ball's arrival (its trough slot opening with the shooter lane closing, DW-187) at `arrive`, then its launch at `launch`. */
function serve(troughSlot: SwitchName, arrive: number, launch: number): readonly SwitchEvent[] {
	return close('s_shooter_lane').at(arrive).open(troughSlot).at(arrive).open('s_shooter_lane').at(launch).build();
}

/** Every campaign `mode_<name>_started`, as `[mode, player, tick]`. */
function campaignStarts(result: RunRulesScriptResult): [string, number, number][] {
	return result.modeEvents
		.filter((event): event is Extract<ModeEvent, { mode: string; player: number }> => 'mode' in event && CAMPAIGN.includes(event.mode) && event.type === `mode_${event.mode}_started`)
		.map((event) => [event.mode, event.player, event.tick]);
}

function sorted(script: readonly SwitchEvent[]): SwitchEvent[] {
	return [...script].sort((a, b) => a.tick - b.tick);
}

// ---------------------------------------------------------------------------
// AC 2 / AC 5: the order restarts, through real play.
// ---------------------------------------------------------------------------

/**
 * One player, four balls. Balls 1-3 are AC 7's own script (a Ramp, then a
 * Lock capture: two locks and a spit). Ball 4 is served from trough slot 2,
 * makes the Ramp when `ball4Ramp`, and enters the Lock lane with two
 * credits, so it is spat by the Mouth.
 */
function fourBallScript(ball4Ramp: boolean): { readonly script: readonly SwitchEvent[]; readonly captures: readonly number[]; readonly ramp4: number; readonly duration: number } {
	const start = 10;
	const script: SwitchEvent[] = [...press('s_start', start, start + 5), ...serve('s_trough_4', start + 5, start + 50)];
	const c1 = start + 400;
	const d1 = c1 + 500;
	const c2 = d1 + 400;
	const d2 = c2 + 500;
	const c3 = d2 + 400;
	const d3 = c3 + L + 500;
	const c4 = d3 + 400;
	const d4 = c4 + L + 500;
	script.push(
		...ramp(c1 - 200),
		...capture('s_lock_1', c1),
		...serve('s_trough_3', c1 + 10, c1 + 30),
		...close('s_trough_3').at(d1).build(),
		...serve('s_trough_3', d1 + 10, d1 + 50),
		...ramp(c2 - 200),
		...capture('s_lock_2', c2),
		...serve('s_trough_2', c2 + 10, c2 + 30),
		...close('s_trough_2').at(d2).build(),
		...serve('s_trough_2', d2 + 10, d2 + 50),
		...ramp(c3 - 200),
		...capture('s_lock_3', c3),
		...close('s_lock_3').open().at(c3 + L + 1).build(),
		...close('s_trough_2').at(d3).build(),
		...serve('s_trough_2', d3 + 10, d3 + 50),
		...capture('s_lock_3', c4),
		...close('s_lock_3').open().at(c4 + L + 1).build(),
		...close('s_trough_2').at(d4).build(),
	);
	if (ball4Ramp) {
		script.push(...ramp(c4 - 200));
	}
	return { script: sorted(script), captures: [c1, c2, c3, c4], ramp4: c4 - 200, duration: d4 + 10 };
}

describe('Story 3.4 QA -- AC 2 / AC 5: once all three Modes are played, the order restarts -- through real play, from Attract', () => {
	const run = (ball4Ramp: boolean) => {
		const built = fourBallScript(ball4Ramp);
		return { built, result: runRulesScript(built.script, { durationTicks: built.duration, tuning: TUNING, adjustments: { ...DEFAULT_ADJUSTMENTS, ballsPerGame: 4 } }) };
	};
	const { built, result } = run(true);
	const control = run(false);

	it('the premise: balls 1-3 play Hurry-up, Quick multiball and Joust, and ball 4 starts with nothing lit -- a played round relights nothing by itself', () => {
		expect(campaignStarts(result).slice(0, 3)).toEqual([
			['hurryup', 0, built.captures[0]],
			['quickmb', 0, built.captures[1]],
			['joust', 0, built.captures[2]],
		]);
		const beforeRamp4 = result.statesByTick.get(built.ramp4 - 1)!;
		expect(beforeRamp4.players[0]!.ballNumber, 'ball 4 is in play').toBe(4);
		expect(beforeRamp4.players[0]!.modesPlayed).toEqual(['hurryup', 'quickmb', 'joust']);
		expect(beforeRamp4.players[0]!.modesLit).toEqual([]);
	});

	it('ball 4\'s Ramp lights Hurry-up again, and its Lock capture starts it a second time: modesPlayed [hurryup, quickmb, joust, hurryup]', () => {
		expect(result.statesByTick.get(built.ramp4)!.players[0]!.modesLit, 'the round rose to 1, so the first Mode lights again').toEqual(['hurryup']);
		expect(campaignStarts(result)).toEqual([
			['hurryup', 0, built.captures[0]],
			['quickmb', 0, built.captures[1]],
			['joust', 0, built.captures[2]],
			['hurryup', 0, built.captures[3]],
		]);
		expect(result.events.filter((event) => event.type === 'lock_lane_mode_start').map((event) => event.tick)).toEqual([...built.captures]);
		expect(result.finalState.players[0]!.modesPlayed).toEqual(['hurryup', 'quickmb', 'joust', 'hurryup']);
		expect(result.finalState.players[0]!.modesLit).toEqual([]);
		expect(result.finalState.phase, 'the four-ball game ran to its end').toBe('game_over');
	});

	it('control: the same ball 4 without its Ramp -- the capture is 3.2\'s uncredited spit and nothing starts', () => {
		expect(campaignStarts(control.result).map(([mode]) => mode)).toEqual(['hurryup', 'quickmb', 'joust']);
		expect(control.result.events.filter((event) => (event.type === 'lock_lane_spit' || event.type === 'lock_lane_mode_start') && event.tick === built.captures[3])).toEqual([
			{ type: 'lock_lane_spit', player: 0, credits: 2, credited: false, tick: built.captures[3] },
		]);
		expect(control.result.finalState.players[0]!.modesPlayed).toEqual(['hurryup', 'quickmb', 'joust']);
	});
});

// ---------------------------------------------------------------------------
// AC 2 / AC 5 / AC 7, per player (Hot seat, AD-7).
// ---------------------------------------------------------------------------

/**
 * Two players, from Attract. Player 1 (index 0) scores a DRAGON letter and
 * makes the Ramp (when `withRamps`), then drains. Player 2 (index 1) scores
 * a letter, locks a ball with nothing of their own lit, makes the Ramp
 * (when `withRamps`) and locks again.
 */
function hotSeatScript(withRamps: boolean): { readonly script: readonly SwitchEvent[]; readonly p1Ramp: number; readonly p1Drain: number; readonly c1: number; readonly p2Ramp: number; readonly c2: number; readonly duration: number } {
	const p1Ramp = 300;
	const p1Drain = 500;
	const c1 = 900;
	const p2Ramp = 1100;
	const c2 = 1400;
	const script: SwitchEvent[] = [
		...press('s_start', 10, 12),
		...press('s_start', 20, 22),
		...serve('s_trough_4', 15, 50),
		...close('s_dragon_d').at(100).build(),
		...close('s_trough_4').at(p1Drain).build(),
		...serve('s_trough_4', p1Drain + 10, p1Drain + 50),
		...close('s_dragon_r').at(600).build(),
		...capture('s_lock_1', c1),
		...serve('s_trough_3', c1 + 10, c1 + 30),
		...capture('s_lock_2', c2),
		...serve('s_trough_2', c2 + 10, c2 + 30),
	];
	if (withRamps) {
		script.push(...ramp(p1Ramp), ...ramp(p2Ramp));
	}
	return { script: sorted(script), p1Ramp, p1Drain, c1, p2Ramp, c2, duration: c2 + 100 };
}

describe('Story 3.4 QA -- per player (Hot seat, AD-7): a Ramp lights the Ramp player\'s Mode, and a capture starts only the capturing player\'s', () => {
	const campaign = hotSeatScript(true);
	const control = hotSeatScript(false);
	const run = (script: readonly SwitchEvent[], duration: number) => runRulesScript(script, { durationTicks: duration, tuning: TUNING });
	const result = run(campaign.script, campaign.duration);
	const controlResult = run(control.script, control.duration);
	const lit = (tick: number, player: number) => result.statesByTick.get(tick)!.players[player]!.modesLit;

	it('the premise: two players, and player 2 is up for the two captures', () => {
		expect(result.finalState.players).toHaveLength(2);
		expect(result.statesByTick.get(campaign.p1Ramp)!.currentPlayer).toBe(0);
		expect([campaign.c1, campaign.p2Ramp, campaign.c2].map((tick) => result.statesByTick.get(tick)!.currentPlayer)).toEqual([1, 1, 1]);
	});

	it('player 1\'s Ramp lights player 1\'s Hurry-up only', () => {
		expect(lit(campaign.p1Ramp, 0)).toEqual(['hurryup']);
		expect(lit(campaign.p1Ramp, 1)).toEqual([]);
	});

	it('player 2\'s first capture, with nothing of their own lit, is 3.2\'s lock alone: no start, and player 1\'s lit Hurry-up survives it untouched', () => {
		expect(result.events.filter((event) => event.tick === campaign.c1 && event.type.startsWith('lock_lane_'))).toEqual([
			{ type: 'lock_lane_locked', player: 1, credits: 1, tick: campaign.c1 },
		]);
		expect(campaignStarts(result).filter(([, , tick]) => tick === campaign.c1)).toEqual([]);
		expect(lit(campaign.c1, 0)).toEqual(['hurryup']);
		expect(result.statesByTick.get(campaign.c1)!.players[0]!.modesPlayed).toEqual([]);
	});

	it('player 2\'s own Ramp lights player 2\'s Hurry-up (their round, not player 1\'s), and their next capture starts it for player 2 -- player 1 keeps theirs lit and unplayed', () => {
		expect(lit(campaign.p2Ramp, 1)).toEqual(['hurryup']);
		expect(lit(campaign.p2Ramp, 0)).toEqual(['hurryup']);
		expect(result.events.filter((event) => event.tick === campaign.c2 && event.type.startsWith('lock_lane_'))).toEqual([
			{ type: 'lock_lane_locked', player: 1, credits: 2, tick: campaign.c2 },
			{ type: 'lock_lane_mode_start', player: 1, candidates: ['hurryup'], selected: 'hurryup', tick: campaign.c2 },
		]);
		expect(campaignStarts(result)).toEqual([['hurryup', 1, campaign.c2]]);
		const [p1, p2] = result.finalState.players;
		expect(p2!.modesPlayed).toEqual(['hurryup']);
		expect(p2!.modesLit).toEqual([]);
		expect(p1!.modesPlayed, 'player 1 played nothing').toEqual([]);
		expect(p1!.modesLit, 'player 1\'s Mode is still lit for their next ball').toEqual(['hurryup']);
	});

	it('the premise of the control: without the Ramps nothing lights or starts, while both locks and both letters happen exactly as with them', () => {
		expect(campaignStarts(controlResult)).toEqual([]);
		expect(controlResult.finalState.players.map((p) => p.modesLit)).toEqual([[], []]);
		expect(controlResult.finalState.players.map((p) => [p.letters, p.lockCredits])).toEqual([
			['D', 0],
			['R', 2],
		]);
	});

	it('at every tick, each player\'s lockCredits and letters equal the control run\'s -- lighting and starting Modes touches neither, for either player', () => {
		const mismatches: number[] = [];
		for (let tick = 1; tick <= campaign.duration; tick++) {
			const a = result.statesByTick.get(tick)!.players.map((p) => [p.lockCredits, p.letters]);
			const b = controlResult.statesByTick.get(tick)!.players.map((p) => [p.lockCredits, p.letters]);
			if (JSON.stringify(a) !== JSON.stringify(b)) {
				mismatches.push(tick);
			}
		}
		expect(mismatches).toEqual([]);
	});
});
