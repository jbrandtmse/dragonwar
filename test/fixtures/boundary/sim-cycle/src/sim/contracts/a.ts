// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: no-circular (AD-1). A cycle introduced among the
// seam contracts -- this file and b.ts import each other.
import { bValue } from './b';
export const aValue = bValue + 1;
