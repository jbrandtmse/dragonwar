// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Fixture (Story 3.2): the SANCTIONED consumer (the Lock arbiter) -- must
// never be reported.
import type { LockLaneEnteredEvent } from '../devices/lock-lane-event';
export type ConsumedByArbiter = LockLaneEnteredEvent;
