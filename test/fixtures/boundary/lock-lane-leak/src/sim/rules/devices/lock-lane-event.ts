// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Fixture (Story 3.2): the guarded type, at its real path, so the
// lock-lane-entered-only-arbiter rule's `to` pattern matches it.
export interface LockLaneEnteredEvent {
	readonly type: 'lock_lane_entered';
	readonly tick: number;
}
