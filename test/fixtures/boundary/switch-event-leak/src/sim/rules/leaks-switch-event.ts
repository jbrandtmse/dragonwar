// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: rules-no-switch-event-outside-devices (AD-19).
// src/sim/rules/** outside src/sim/rules/devices/** must not import
// SwitchEvent.
import type { SwitchEvent } from '../table/names';

export function leaksSwitchEvent(event: SwitchEvent): boolean {
	return event.closed;
}
