// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation (Story 3.2): lock-lane-entered-only-arbiter (AD-18).
// A mode naming the Lock-lane entry's type, type-only -- a type-only import
// is still an edge, so the rule must fire.
import type { LockLaneEnteredEvent } from '../devices/lock-lane-event';
export type LeakedToMode = LockLaneEnteredEvent;
