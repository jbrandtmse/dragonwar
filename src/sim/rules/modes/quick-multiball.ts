// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.4 (AD-8, FR-33): the Quick multiball campaign Mode, registered as a
// SHELL -- its name, its `MODE_PRIORITIES` priority and an identity
// `onEvent`, nothing else: no scoring, no timer, no `ModeView` field and no
// `lamps` hook. It starts only through `./campaign.ts`'s
// `startCampaignMode()` (called by the Lock arbiter), never at a ball start,
// and stops only at the ball end or the Attract entry, through
// `./lifecycle.ts`. Story 3.7 fills it in: its second ball,
// `machine.multiball` (set in `_starting`, AD-18) and the bash-hit branch.
//
// AD-18: "a multiball is running" means `machine.multiball !== null`, set
// only in THIS mode's `_starting` phase (or the War's). The shell never
// writes it, so until Story 3.7 a started Quick multiball runs single-ball
// and the Lock keeps locking as usual (the author's 2026-09-30 decision).
//
// A shell started by the arbiter receives that tick's remaining device
// events from the stack (fan-out step 2); it ignores them.

import { MODE_PRIORITIES } from './priorities';
import type { ModeDefinition } from './registry';

/** The Quick multiball shell's `ModeDefinition`. */
export interface QuickMultiballMode extends ModeDefinition {
	readonly name: 'quickmb';
}

export function createQuickMultiballMode(): QuickMultiballMode {
	return {
		name: 'quickmb',
		priority: MODE_PRIORITIES.quickmb,
		onEvent: (state) => ({ state }),
	};
}
