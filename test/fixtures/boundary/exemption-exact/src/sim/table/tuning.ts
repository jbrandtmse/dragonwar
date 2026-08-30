// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// DW-39 positive fixture: the exact exempt path for BOTH sim-one-tick-constant
// (naming TICK_HZ) and sim-no-literal-ms (a bare "…Ms"-suffixed binding
// authored with a numeric literal, NOT wrapped in an entry(...) call the way
// the real tuning.ts's own MS_BINDING_PATTERN match happens to be masked --
// DW-39's own load-bearing finding is that the real file's exemption is
// otherwise proven by nothing). Both must produce NO violation here.
import { TICK_HZ } from '../contracts/time';

export const tickHz = TICK_HZ;
export const nudgeImpulseMs = 25;
