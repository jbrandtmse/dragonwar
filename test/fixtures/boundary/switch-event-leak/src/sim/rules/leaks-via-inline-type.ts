// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: rules-no-switch-event-outside-devices (AD-19), via the
// INLINE TYPE-IMPORT bypass DW-169 measured against the shipped tool. There is
// no import STATEMENT in this file at all, so check (g)'s original
// binding-list-only pattern scored it clean.

export function leaksViaInlineType(event: import('../table/names').SwitchEvent): boolean {
	return event.closed;
}
