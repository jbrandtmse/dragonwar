// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.4 (AD-8, FR-33): the Hurry-up campaign Mode, registered as a SHELL
// -- its name, its `MODE_PRIORITIES` priority and an identity `onEvent`,
// nothing else: no scoring, no timer, no `ModeView` field and no `lamps`
// hook. It starts only through `./campaign.ts`'s `startCampaignMode()`
// (called by the Lock arbiter), never at a ball start, and stops only at the
// ball end or the Attract entry, through `./lifecycle.ts`. Story 3.5 fills it
// in: its value and timer, its `ModeView` and the Ramp collect.
//
// A shell started by the arbiter receives that tick's remaining device
// events from the stack (fan-out step 2); it ignores them.

import { MODE_PRIORITIES } from './priorities';
import type { ModeDefinition } from './registry';

/** The Hurry-up shell's `ModeDefinition`. */
export interface HurryUpMode extends ModeDefinition {
	readonly name: 'hurryup';
}

export function createHurryUpMode(): HurryUpMode {
	return {
		name: 'hurryup',
		priority: MODE_PRIORITIES.hurryup,
		onEvent: (state) => ({ state }),
	};
}
