// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// The other half of the deliberate no-circular cycle -- see a.ts.
import { aValue } from './a';
export const bValue = 1;
// Referenced so swc's unused-import elimination (if any) cannot make this
// edge disappear from the cruised graph.
export const bReferencesA = () => aValue;
