// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.3 (AD-19, AD-9, FR-30): the Dragon's hit reaction. The devices
// layer (`./devices/index.ts`) reports each closed edge of
// `TABLE.dragonBodyWiring.switch` as a `dragon_hit`; this module turns each
// one into a `ShowCommand { show: TABLE.dragonBodyWiring.hitShow }` on the
// same tick, in batch order -- N hits give N shows.
//
// It fires in every phase and under Tilt: FR-30 says the Dragon "reacts
// visibly to every hit", and a show is presentation, not score, so the
// score gate (`./scoring.ts`'s `scoringOpen()`, FR-15) deliberately does not
// apply. It keeps no state, emits no coil, and consumes nothing: every
// `dragon_hit` still reaches the mode stack unchanged.
//
// A pure function of its argument: no closure state, no module state, and
// no import from `physics` or `presentation` (AD-1). The show is reached
// only through `TABLE` (AD-16).

import { TABLE } from '../table/dragonwar';
import type { DeviceEvent } from './devices';
import type { ShowCommand } from '../table/names';

/** One `show_dragon_hit` per `dragon_hit` in `deviceEvents`, in batch order, each on its event's own tick. */
export function dragonHitShows(deviceEvents: readonly DeviceEvent[]): ShowCommand[] {
	const shows: ShowCommand[] = [];
	for (const event of deviceEvents) {
		if (event.type === 'dragon_hit') {
			shows.push({ type: 'show', show: TABLE.dragonBodyWiring.hitShow, tick: event.tick });
		}
	}
	return shows;
}
