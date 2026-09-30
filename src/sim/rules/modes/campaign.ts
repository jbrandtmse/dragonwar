// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.4 (AD-7, AD-8, AD-18, FR-33): the campaign -- Hurry-up, Quick
// multiball and Joust, lit at the Ramp and started at the Lock lane.
//
// - Campaign order is declared once, here: `CAMPAIGN_ORDER`.
// - `modesPlayed` is the append-only log of campaign Mode starts (repeats
//   allowed). A player's ROUND `r` is the smallest count, over the three
//   Modes, of that Mode's entries in their `modesPlayed`. The Mode a Ramp
//   lights is the first Mode in campaign order whose count equals `r` and
//   which is not already lit; with none, the Ramp lights nothing. So a fresh
//   player lights Hurry-up, then Quick multiball, then Joust, and once all
//   three have been played `r` rises and the order restarts.
// - The CANDIDATES of a Lock capture are the player's lit Modes that are not
//   active for them in `modes[]`, in campaign order.
// - `startCampaignMode()` is the ONLY campaign start path (AD-8 amended
//   2026-09-30): it starts the Mode through `./lifecycle.ts`'s
//   `startModes()` -- the only writer of `modes[]` -- and, for each
//   `mode_<campaign>_started` that start fired, appends the Mode to the
//   player's `modesPlayed` and removes it from their `modesLit`. The Lock
//   arbiter (`../ball-controller/lock-arbiter.ts`) is its only caller.
//
// Pure functions of their arguments: no closure state, no module state
// beyond the frozen order, and no import from `physics` or `presentation`.

import { startModes } from './lifecycle';
import type { ModeLifecycleEvent } from './events';
import type { ModeLookup } from './registry';
import type { CampaignModeName, PlayerState } from '../../contracts/state';
import type { GameState } from '../../table/names';

/** Story 3.4 (FR-33): the campaign order -- Hurry-up, Quick multiball, Joust -- by their `MODE_PRIORITIES` names. The one declaration. */
export const CAMPAIGN_ORDER: readonly CampaignModeName[] = ['hurryup', 'quickmb', 'joust'];

/** `true` when `mode` names a campaign Mode. */
export function isCampaignMode(mode: string): mode is CampaignModeName {
	return (CAMPAIGN_ORDER as readonly string[]).includes(mode);
}

/** How many times `mode` appears in `player.modesPlayed`. */
function playedCount(player: PlayerState, mode: CampaignModeName): number {
	return player.modesPlayed.filter((played) => played === mode).length;
}

/** The player's round: the smallest count, over the three Modes, of that Mode's entries in `modesPlayed`. */
export function campaignRound(player: PlayerState): number {
	return Math.min(...CAMPAIGN_ORDER.map((mode) => playedCount(player, mode)));
}

/** The Mode a Ramp completion lights for `player`, or `null` when it lights nothing -- see this file's header for the round rule. */
export function nextModeToLight(player: PlayerState): CampaignModeName | null {
	const round = campaignRound(player);
	for (const mode of CAMPAIGN_ORDER) {
		if (playedCount(player, mode) === round && !player.modesLit.includes(mode)) {
			return mode;
		}
	}
	return null;
}

/** The candidates of a Lock capture for `playerIndex`: their lit Modes not active for them in `modes[]`, in campaign order. Empty for a missing player. */
export function candidatesFor(state: GameState, playerIndex: number): CampaignModeName[] {
	const player = state.players[playerIndex];
	if (!player) {
		return [];
	}
	return CAMPAIGN_ORDER.filter(
		(mode) => player.modesLit.includes(mode) && !state.modes.some((entry) => entry.mode === mode && entry.player === playerIndex),
	);
}

export interface CampaignStartResult {
	readonly state: GameState;
	/** The start's lifecycle triple (`_will_start / _starting / _started`), or `[]` when nothing started. */
	readonly events: readonly ModeLifecycleEvent[];
}

/**
 * Story 3.4 (AD-8): starts campaign Mode `mode` for `playerIndex` through
 * `startModes()`, resolving its one definition through `lookup`. For each
 * `mode_<campaign>_started` in the result, appends that Mode to the player's
 * `modesPlayed` and removes it from their `modesLit`. Returns `state` itself,
 * and no events, when `lookup` does not know the Mode or it is already active
 * for that player (`startModes()`'s no-op).
 */
export function startCampaignMode(state: GameState, lookup: ModeLookup, mode: CampaignModeName, playerIndex: number, tick: number): CampaignStartResult {
	const definition = lookup.get(mode);
	if (!definition) {
		return { state, events: [] };
	}
	const started = startModes(state, [definition], playerIndex, tick);
	let next = started.state;
	for (const event of started.events) {
		if (!isCampaignMode(event.mode) || event.type !== `mode_${event.mode}_started`) {
			continue;
		}
		const startedMode: CampaignModeName = event.mode;
		next = {
			...next,
			players: next.players.map((existing, index) =>
				index === event.player
					? {
							...existing,
							modesPlayed: [...existing.modesPlayed, startedMode],
							modesLit: existing.modesLit.filter((lit) => lit !== startedMode),
						}
					: existing,
			),
		};
	}
	return { state: next, events: started.events };
}
