// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: sim-no-upward-import (AD-1). sim/ never imports host/.
import { helperValue } from '../host/helper';
export const value = helperValue;
