// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: host-no-physics-or-rules (AD-1). host/ never imports
// sim/physics or sim/rules directly.
import { dummyValue } from '../sim/physics/dummy';
export const value = dummyValue;
