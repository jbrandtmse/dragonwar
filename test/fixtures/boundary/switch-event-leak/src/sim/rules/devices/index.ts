// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// A LEGITIMATE import of SwitchEvent -- src/sim/rules/devices/ is the one
// place under src/sim/rules/** the rule must NOT fire (AD-19). Exists so
// this fixture proves the exclusion both ways: the rule fires on
// ../leaks-switch-event.ts and does not fire here.
import type { SwitchEvent } from '../../table/names';

export function acceptsSwitchEvent(event: SwitchEvent): boolean {
	return event.closed;
}
