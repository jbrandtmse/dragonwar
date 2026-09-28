// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// The SAME two DW-169 bypass forms as ../leaks-via-namespace.ts and
// ../leaks-via-inline-type.ts, but INSIDE src/sim/rules/devices/ -- the one
// place AD-19 allows them. Exists so the widened check (g) is proved not to
// over-fire on the forms it was widened to catch: a directory exclusion that
// only ever covered the binding-list shape would be a silent regression here.
import * as Names from '../../table/names';

export function acceptsViaNamespace(event: Names.SwitchEvent): boolean {
	return event.closed;
}

export function acceptsViaInlineType(event: import('../../table/names').SwitchEvent): boolean {
	return event.closed;
}

// The same no-whitespace and default-binding shapes as
// ../leaks-no-space.ts and ../leaks-default-binding.ts, likewise legitimate
// inside src/sim/rules/devices/.
import{SwitchEvent as CompactSwitchEvent}from'../../table/names';
import Defaulted, { SwitchEvent as DefaultedSwitchEvent } from '../../table/names';

export const defaulted = Defaulted;

export function acceptsCompact(event: CompactSwitchEvent): boolean {
	return event.closed;
}

export function acceptsDefaulted(event: DefaultedSwitchEvent): boolean {
	return event.closed;
}
