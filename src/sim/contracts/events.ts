// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-2, AD-9: switches are edges from one source per class; contacts and
// actuations go to presentation only; semantic events are payload-complete.
// This file is table-free (AD-1): every type that names a device is generic
// over the relevant name union, bound to TABLE only in sim/table/names.ts.

/**
 * One edge of one named switch. Physics emits playfield and cabinet-mechanism
 * switches; `sim/loop` emits the button switches from `InputFrame`
 * transitions (AD-2). `sim/rules/devices` is the only consumer (AD-19).
 */
export interface SwitchEvent<TSwitch extends string = string> {
	readonly type: 'switch';
	readonly switch: TSwitch;
	readonly closed: boolean;
	readonly tick: number;
}

/**
 * The closed material enum a `col_` collision mesh carries (AD-11). Drives
 * contact sound selection in `presentation/audio` (AD-13).
 */
export type ContactSurface =
	| 'wood'
	| 'rubber_post'
	| 'rubber_band'
	| 'metal'
	| 'plastic'
	| 'ramp'
	| 'flipper'
	| 'target'
	| 'bumper'
	| 'glass'
	| 'ball'
	| 'dragon';

/** The closed set of physics actuation kinds a `ContactEvent` may report (AD-2). */
export type ContactKind =
	| 'hit'
	| 'coil_fire'
	| 'flipper_eos'
	| 'drop_target_down'
	| 'bank_reset'
	| 'eject'
	| 'spinner_tick';

/**
 * A ball contact or a mechanical actuation, for presentation's sound and
 * visual reaction only -- rules never receive a `ContactEvent` (AD-2).
 * `ballId` identifies a simulated ball instance (AD-6/8: "balls by id rather
 * than index"); it is not a `TABLE` name and so is not part of the generic.
 * `device` is generic because an actuation's originating device may be a coil
 * (`coil_fire`, `eject`) or a ball device/mechanism (`drop_target_down`,
 * `bank_reset`, `spinner_tick`) depending on `kind`.
 */
export interface ContactEvent<TDevice extends string = string> {
	readonly type: 'contact';
	readonly kind: ContactKind;
	readonly ballId?: number;
	readonly speed?: number;
	readonly surface?: ContactSurface;
	readonly pos?: { readonly x: number; readonly y: number; readonly z: number };
	readonly device?: TDevice;
	readonly tick: number;
}

/**
 * The closed vocabulary of semantic (rules-to-presentation) events. Bounded
 * to Epic 1's own events plus the device-failure vocabulary AD-9's
 * Conventions table requires to exist even if never emitted
 * (`eject_failed`, `ball_missing`, `broken`, `device_overflow`) -- a closed
 * union that later stories extend as they add the events they emit, not a
 * placeholder for events no artifact names yet.
 */
export type EventName = SemanticEvent['type'];

/** AD-4: the first event of a frame that discarded owed simulated time past the 200 ms cap. */
export interface SimTimeDiscardedEvent {
	readonly type: 'sim_time_discarded';
	readonly ms: number;
	readonly tick: number;
}

/** AD-7: resets `machine.ballSave`, `machine.tilt` and `machine.multiball` for the next ball. */
export interface BallWillStartEvent {
	readonly type: 'ball_will_start';
	readonly tick: number;
}

/** AD-7: enables hardware (flippers, coils) for the ball now in play. */
export interface BallStartingEvent {
	readonly type: 'ball_starting';
	readonly tick: number;
}

/**
 * AD-6: the one event that means "plunged" -- the opening of the shooter-lane
 * switch, from which the ball controller increments `ballsInPlay`, starts the
 * ball-save timer and arms the skill shot (later-story consumers).
 */
export interface BallLaunchedEvent {
	readonly type: 'ball_launched';
	readonly tick: number;
}

/** AD-6: ball search's final stage returned this many balls it could not find. */
export interface BallMissingEvent {
	readonly type: 'ball_missing';
	readonly count: number;
	readonly tick: number;
}

/** AD-7/AD-9's own payload-complete example: a ball has ended for a player. */
export interface BallEndedEvent {
	readonly type: 'ball_ended';
	readonly player: number;
	readonly bonusByCategory: Readonly<Record<string, number>>;
	readonly multiplier: number;
	readonly total: number;
	readonly tilted: boolean;
	readonly tick: number;
}

/**
 * Device-failure vocabulary (AD-9 Conventions): named so the vocabulary
 * exists, even though nothing in Epic 1 emits them. No artifact states a
 * payload beyond the device that failed, so none is invented here.
 */
export interface EjectFailedEvent<TBallDevice extends string = string> {
	readonly type: 'eject_failed';
	readonly device: TBallDevice;
	readonly tick: number;
}

/** Device-failure vocabulary (AD-9 Conventions): a mechanism reported itself broken. */
export interface BrokenEvent<TDevice extends string = string> {
	readonly type: 'broken';
	readonly device: TDevice;
	readonly tick: number;
}

/** Device-failure vocabulary (AD-9 Conventions, AD-6): a ball reached a device slot beyond its capacity. */
export interface DeviceOverflowEvent<TBallDevice extends string = string> {
	readonly type: 'device_overflow';
	readonly device: TBallDevice;
	readonly tick: number;
}

/**
 * The closed, discriminated semantic-event union. Generic over the ball
 * device / mechanism name unions used by the device-failure vocabulary;
 * `sim/table/names.ts` binds these to `TABLE`'s unions for consumers.
 */
export type SemanticEvent<TBallDevice extends string = string, TDevice extends string = string> =
	| SimTimeDiscardedEvent
	| BallWillStartEvent
	| BallStartingEvent
	| BallLaunchedEvent
	| BallMissingEvent
	| BallEndedEvent
	| EjectFailedEvent<TBallDevice>
	| BrokenEvent<TDevice>
	| DeviceOverflowEvent<TBallDevice>;
