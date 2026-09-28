// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: rules-no-switch-event-outside-devices (AD-19), via the
// NAMESPACE-IMPORT bypass DW-169 measured against the shipped tool. No binding
// list ever names SwitchEvent here -- the alias does, at the use site -- so
// check (g)'s original binding-list-only pattern scored this file clean.
import * as Names from '../table/names';

export function leaksViaNamespace(event: Names.SwitchEvent): boolean {
	return event.closed;
}
