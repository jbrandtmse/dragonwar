// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.2 (AD-18, AD-19): `lock_lane_entered`'s own type, in a file of its
// own so its consumers are enforceable. AD-18 makes the Lock arbiter
// (`sim/rules/ball-controller/lock-arbiter.ts`) the ONLY consumer of this
// event, and `tools/dependency-cruiser.config.mjs`'s
// `lock-lane-entered-only-arbiter` rule lets exactly three files import this
// one: the devices layer that emits it (`./index.ts`), the union that carries
// it (`./events.ts`) and the arbiter. Nothing re-exports it -- a re-export
// would let any module reach the type without importing this file, which
// the rule could not see. `test/ad18-lock-lane-consumer.test.ts` pins the
// quoted event name to the same sanctioned files.

/**
 * DW-166: a Lock-lane closure that RESOLVED -- either a real capture (a
 * `bd_lock` slot switch closed within `lockCaptureWindowTicks`, emitted in
 * the same batch as that slot's `device_ball_entered`) or the device was
 * already full at the moment of closure (physics parks nothing). An
 * unresolved closure (the measured 550-600 mm/s non-capturing band) emits
 * nothing at all; a ball that parks with no entry is the arbiter's
 * "uncredited park" (DW-171). The devices layer only resolves whether a
 * closure counts; the Lock arbiter decides what it means.
 */
export interface LockLaneEnteredEvent {
	readonly type: 'lock_lane_entered';
	readonly tick: number;
}
