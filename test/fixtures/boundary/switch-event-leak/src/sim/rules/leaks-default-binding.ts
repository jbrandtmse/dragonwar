// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: rules-no-switch-event-outside-devices (AD-19), via a
// DEFAULT BINDING preceding the list. The first version of check (g) required
// the `{` to follow `import`/`import type` immediately, so a default binding
// in front of it scored clean (measured at code-review time). Fixtures are
// excluded from tsconfig.node.json, so the absent default export in
// ../table/names is deliberate and inert -- this file exists to be SCANNED,
// never compiled.
import Names, { SwitchEvent } from '../table/names';

export const names = Names;

export function leaksDefaultBinding(event: SwitchEvent): boolean {
	return event.closed;
}
