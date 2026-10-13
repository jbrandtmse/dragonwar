// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.6 (AD-3, AD-7, AD-8, AD-9, FR-36): the Joust campaign Mode --
// alternating Loops build a Charge, capped at `joustChargeMax`, that
// multiplies the Loop award; a broken Loop or the same Loop twice loses it.
// Registered by Story 3.4 as a shell (priority 310); it starts only through
// `./campaign.ts`'s `startCampaignMode()` (called by the Lock arbiter), never
// at a ball start.
//
// - The figures (AD-3). V = `loopValue`, M = `joustChargeMax` and
//   T = max(1, `joustTicks`), resolved ONCE here in the factory. The two Loops
//   are `TABLE.modeWiring.joustLoops` (no `shot_` literal here, AD-16).
// - Publication (AD-7, AD-9). The entry is `{ mode, priority, player,
//   startTick, charge, timerTicks?, lastLoop?, fullCharge? }`; `charge` and
//   `timerTicks` are its `ModeView`. `onStart` stamps `startTick` with the
//   start tick, Charge 1 and the full timer, with no `lastLoop`.
// - The timer. With `e = tick - startTick`, the `tick` hook republishes
//   `timerTicks = T - e` while `e < T` and returns `stop: true` at `e >= T`.
//   The clock is `tick - startTick`, never a counter, so no higher mode can
//   pause it. The stack runs tick hooks before any event (`./index.ts`), so a
//   Loop arriving on the stopping tick finds no Joust to pay it.
// - A made Loop (`<loop>_made`). With no `lastLoop`, or the same Loop as
//   `lastLoop`, the Charge becomes 1: the first Loop of a Joust, and the
//   first after a break, OPENS the chain, and a repeat restarts it. Otherwise
//   the Charge becomes min(charge + 1, M). Then `lastLoop` is this Loop and
//   the entry's own player is paid V x the NEW Charge through `awardScore()`.
//   The first time the new Charge equals M, `joust_full_charge` fires and the
//   entry is marked `fullCharge` -- once per Joust entry.
// - A broken Loop (`<loop>_broken`, the tracker's fall-back signature,
//   `../devices/shots.ts`). `joust_charge_broken` fires carrying the Charge
//   that was lost -- even at Charge 1 -- then the Charge is 1 and `lastLoop`
//   is removed, so the next Loop opens a new chain.
// - The gate. Both event rules apply only while `scoringOpen()`: under Tilt
//   or outside a game a Loop event is ignored entirely -- no award, no Charge
//   change, no event. The timer runs on regardless.
// - Stopping. There is no `onStopping` / `onStopped`, so the ball end, the
//   Slam and the Attract entry stop it with no award. No `lamps` hook: the
//   Loop inserts' `joust` role is Story 3.3c's. Never a `CoilCommand` (AD-8).
// - Everything else is untouched: a Loop outside Joust still scores nothing,
//   and the base mode's Spinner scoring is independent of Joust.

import { TABLE } from '../../table/dragonwar';
import { shotWindowTicks, type ResolvedTuning } from '../../table/tuning';
import { awardScore, scoringOpen } from '../scoring';
import { MODE_PRIORITIES } from './priorities';
import type { ActiveModeState } from '../../contracts/state';
import type { GameState, ShotName } from '../../table/names';
import type { DeviceEvent } from '../devices';
import type { JoustChargeBrokenEvent, JoustFullChargeEvent } from './events';
import type { ModeDefinition, ModeHookResult } from './registry';

/** The two Loops Joust alternates between -- `TABLE.modeWiring.joustLoops`, never a spelled-out shot name (AD-16). */
const JOUST_LOOPS: readonly ShotName[] = TABLE.modeWiring.joustLoops;

/** Each Loop's `_made` event type, mapped to that Loop. */
const LOOP_BY_MADE_EVENT: ReadonlyMap<string, ShotName> = new Map(JOUST_LOOPS.map((loop): [string, ShotName] => [`${loop}_made`, loop]));

/** Each Loop's `_broken` event type, mapped to that Loop. */
const LOOP_BY_BROKEN_EVENT: ReadonlyMap<string, ShotName> = new Map(JOUST_LOOPS.map((loop): [string, ShotName] => [`${loop}_broken`, loop]));

/** The Joust `ModeDefinition`. */
export interface JoustMode extends ModeDefinition {
	readonly name: 'joust';
}

export function createJoustMode(tuning: ResolvedTuning): JoustMode {
	const loopValue = tuning.loopValue.value;
	const chargeMax = tuning.joustChargeMax.value;
	const timerTicks = Math.max(1, shotWindowTicks('joustMs', tuning));

	/** The elapsed ticks since `entry`'s own start -- never negative. Every entry `onStart` builds carries `startTick`, and only `./lifecycle.ts` adds entries; a hand-made fixture entry without one reads e = 0 on every tick, so its timer never runs down. */
	function elapsed(entry: ActiveModeState, tick: number): number {
		const startTick = typeof entry.startTick === 'number' ? entry.startTick : tick;
		return Math.max(0, tick - startTick);
	}

	/** `entry`'s Charge -- 1 for a hand-made fixture entry that carries none. */
	function chargeOf(entry: ActiveModeState): number {
		return typeof entry.charge === 'number' ? entry.charge : 1;
	}

	/** `state` with `entry` replaced by `updated` (the entry-update pattern of `./hurry-up.ts`; `./lifecycle.ts` stays the only file that adds or removes one). */
	function withEntry(state: GameState, entry: ActiveModeState, updated: ActiveModeState): GameState {
		return { ...state, modes: state.modes.map((mode) => (mode === entry ? updated : mode)) };
	}

	function onStart(_state: GameState, _player: number, tick: number): Readonly<Record<string, unknown>> {
		return { startTick: tick, charge: 1, timerTicks };
	}

	/** Republishes `timerTicks` on this entry while the timer runs, and asks the stack to stop the Mode once it has run out. */
	function onTick(state: GameState, entry: ActiveModeState, tick: number): ModeHookResult {
		const e = elapsed(entry, tick);
		if (e >= timerTicks) {
			return { state, stop: true };
		}
		return { state: withEntry(state, entry, { ...entry, timerTicks: timerTicks - e }) };
	}

	/** A made Loop: opens the chain at Charge 1 or builds it, pays V x the new Charge, and reports the first reach of the cap. */
	function onLoopMade(state: GameState, entry: ActiveModeState, loop: ShotName, tick: number): ModeHookResult {
		const opens = entry.lastLoop === undefined || entry.lastLoop === loop;
		const charge = opens ? 1 : Math.min(chargeOf(entry) + 1, chargeMax);
		const reachedFull = charge === chargeMax && entry.fullCharge !== true;
		const updated: ActiveModeState = reachedFull ? { ...entry, charge, lastLoop: loop, fullCharge: true } : { ...entry, charge, lastLoop: loop };
		const paid = awardScore(withEntry(state, entry, updated), entry.player, loopValue * charge);
		if (!reachedFull) {
			return { state: paid };
		}
		const full: JoustFullChargeEvent = { type: 'joust_full_charge', player: entry.player, tick };
		return { state: paid, events: [full] };
	}

	/** A broken Loop: reports the Charge that was lost, then the Charge is 1 and the chain is forgotten. */
	function onLoopBroken(state: GameState, entry: ActiveModeState, loop: ShotName, tick: number): ModeHookResult {
		const broken: JoustChargeBrokenEvent = { type: 'joust_charge_broken', player: entry.player, shot: loop, charge: chargeOf(entry), tick };
		const { lastLoop: _dropped, ...rest } = entry;
		return { state: withEntry(state, entry, { ...rest, charge: 1 }), events: [broken] };
	}

	/** One device event for the active entry -- a Loop made or broken, only while scoring is open. */
	function onEvent(state: GameState, entry: ActiveModeState, event: DeviceEvent, tick: number): ModeHookResult {
		if (!scoringOpen(state)) {
			return { state };
		}
		const made = LOOP_BY_MADE_EVENT.get(event.type);
		if (made !== undefined) {
			return onLoopMade(state, entry, made, tick);
		}
		const broken = LOOP_BY_BROKEN_EVENT.get(event.type);
		if (broken !== undefined) {
			return onLoopBroken(state, entry, broken, tick);
		}
		return { state };
	}

	return {
		name: 'joust',
		priority: MODE_PRIORITIES.joust,
		onStart,
		tick: onTick,
		onEvent,
	};
}
