// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Fixture (Story 3.2): a SANCTIONED importer (the devices layer that emits
// the event) -- must never be reported.
import type { LockLaneEnteredEvent } from './lock-lane-event';
export type EmittedByDevices = LockLaneEnteredEvent;
