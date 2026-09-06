// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: rules-no-switch-event-outside-devices (AD-19), via the
// NO-WHITESPACE binding-list forms. Both are valid TypeScript and both scored
// clean against the first version of check (g), whose pattern required `\s+`
// after `import` and after `type` (measured at code-review time).
import{SwitchEvent}from'../table/names';
import type{SwitchEvent as SwitchEventAlias}from'../table/names';

export function leaksNoSpace(event: SwitchEvent): boolean {
	return event.closed;
}

export function leaksTypeNoSpace(event: SwitchEventAlias): boolean {
	return event.closed;
}
