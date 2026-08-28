// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-1, AD-11: the one table. Imported directly wherever a device is named --
// no `Table` interface, no loader API, no plugin/registration API, no
// runtime table selection. `sim/table` may import `sim/contracts`; this file
// does not need to (it names no seam type), keeping it a flat, self-contained
// literal.
//
// AD-2's reconciliation (see this story's spec, "Reconciling AD-2's
// settleTicks with AD-3's 'no literal millisecond'"): switches carry a
// `settleClass`, never a raw tick count. `sim/table/tuning.ts` owns
// `switchSettleMsByClass` (authored in ms) and `resolveTuning()` converts it
// to ticks once, using `TICK_HZ` -- so a future tick-rate change does not
// silently change debounce meaning.

/**
 * The debounce-class vocabulary a switch may carry. AD-2's own rule text
 * names five defaults (`rollover` 0 ms, `standup` 8 ms, `drop_target` 20 ms,
 * `bumper_skirt` 2 ms, `tilt_bob` 0 ms); Epic 1 adds two more its own
 * switches need and no artifact names a class for:
 *
 * - `button` (`s_start`, `s_flipper_l`, `s_flipper_r`, `s_plunger`) -- AD-2's
 *   own rule text: "`sim/loop` emits only the **button** switches... from
 *   `InputFrame` transitions." These never pass through physics's
 *   hysteresis/debounce pipeline at all; the class exists only so every
 *   switch in `TABLE.switches` carries one, per the schema, and is 0 ms
 *   because there is no physical bounce to settle.
 * - `slam` (`s_slam_tilt`) -- AD-5: its closure is a tick-windowed nudge-count
 *   threshold in physics, not a debounced analog switch, so 0 ms.
 *
 * `s_trough_1..4` and `s_shooter_lane` are simple ball-presence levers with
 * no bounce of their own to speak of -- electromechanically closest to a
 * rollover switch -- so they carry the `rollover` class rather than inventing
 * unverified numbers for classes AD-2 did not name.
 */
export type SettleClass =
	| 'rollover'
	| 'standup'
	| 'drop_target'
	| 'bumper_skirt'
	| 'tilt_bob'
	| 'button'
	| 'slam';

/**
 * Recursively `Object.freeze`s `value` and every plain-object / array it
 * reaches, and returns it re-typed as `Readonly` deep-down via `DeepReadonly`
 * -- identity-typed, so `TABLE`'s literal (`as const`) types are unaffected
 * beyond gaining `readonly`. The single homomorphic-mapped-type branch below
 * (`{ readonly [K in keyof T]: ... }`) is deliberate, not merged with a
 * separate array-only branch: applied to a tuple type (as every `as const`
 * array literal in `TABLE` is), a homomorphic mapped type preserves the
 * tuple's exact length and per-element literal order; a `T extends readonly
 * (infer U)[] ? readonly DeepReadonly<U>[]` branch would collapse it to a
 * same-length-unknown array of the union of element types instead, losing
 * `bd_trough.slots`' fill order at the type level.
 */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
	? T
	: T extends object
		? { readonly [K in keyof T]: DeepReadonly<T[K]> }
		: T;

/** Exported so `sim/table/tuning.ts` freezes `TUNING` the same way, rather than duplicating this logic. */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
	if (value !== null && (typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const key of Object.keys(value)) {
			deepFreeze((value as Record<string, unknown>)[key]);
		}
	}
	return value as DeepReadonly<T>;
}

/**
 * `TABLE as const`, deep-frozen. AD-10's reference dimensions
 * (`TABLE.reference`), the eleven switches Epic 1 needs (each with a
 * `settleClass`), the four coils, the two ball devices (AD-6), the three GI
 * channels (AD-9), and the empty `lamps`/`flashers`/`shows`/`shots`/
 * `lightGroups` collections whose derived name unions are therefore `never`
 * until Epic 2+ populates them (this story's Design Notes, "Scope decisions
 * on the closed unions").
 */
export const TABLE = deepFreeze({
	/** AD-10, AR-16: the canonical reference dimensions, asserted by Story 1.4's loader. */
	reference: {
		playfieldMm: { w: 514.4, h: 1066.8 },
		ballMm: 26.99,
		pitchDeg: 6.5,
		flipperBatIn: 3.125,
	},

	switches: {
		s_start: { settleClass: 'button' },
		s_flipper_l: { settleClass: 'button' },
		s_flipper_r: { settleClass: 'button' },
		s_plunger: { settleClass: 'button' },
		s_shooter_lane: { settleClass: 'rollover' },
		s_trough_1: { settleClass: 'rollover' },
		s_trough_2: { settleClass: 'rollover' },
		s_trough_3: { settleClass: 'rollover' },
		s_trough_4: { settleClass: 'rollover' },
		s_tilt_bob: { settleClass: 'tilt_bob' },
		s_slam_tilt: { settleClass: 'slam' },
	},

	// No coil-specific descriptor fields exist yet -- Epic 1 names each coil
	// and nothing else. `Record<string, never>` is a deliberately empty
	// object type, not `{}` (which would accept any non-nullish value).
	coils: {
		c_flipper_l: {} as Record<string, never>,
		c_flipper_r: {} as Record<string, never>,
		c_trough_eject: {} as Record<string, never>,
		c_autolaunch: {} as Record<string, never>,
	},

	ballDevices: {
		// AD-6: parking device. Physics parks an entering ball into the lowest
		// empty slot unconditionally and ejects the highest filled slot, one per
		// pulse of `ejectCoil`. `slots` is fill order.
		bd_trough: {
			kind: 'parking',
			capacity: 4,
			slots: ['s_trough_1', 's_trough_2', 's_trough_3', 's_trough_4'],
			ejectCoil: 'c_trough_eject',
			// AD-6: ball search is tick-timed pulses ending in the one command that
			// lets physics despawn a loose ball. Two eject attempts before
			// recovering is this story's authored default -- no artifact states a
			// pulse count, and it is not on the PRD addendum's do-not-invent list.
			ballSearchOrder: [
				{ action: 'pulse', coil: 'c_trough_eject' },
				{ action: 'pulse', coil: 'c_trough_eject' },
				{ action: 'recover' },
			],
		},
		// AD-6: non-parking mechanical-eject device. The served ball stays
		// simulated on the plunger tip; the manual plunge (AD-5) or a pulse of
		// `c_autolaunch` are its two exits. The opening of `s_shooter_lane` is
		// the one event that means "plunged" (AD-6).
		bd_shooter: {
			kind: 'non-parking',
			entry: 's_shooter_lane',
			// A stuck ball on the plunger tip has one recovery path: fire the
			// autolauncher, then recover if it still has not left. Authored default,
			// same rationale as bd_trough's above.
			ballSearchOrder: [
				{ action: 'pulse', coil: 'c_autolaunch' },
				{ action: 'recover' },
			],
		},
	},

	/** AD-9: the architectural GI channels, set once per phase via `GiCommand.level`. */
	giChannels: {
		gi_backbox: {} as Record<string, never>,
		gi_cabinet: {} as Record<string, never>,
		gi_arch: {} as Record<string, never>,
	},

	// Empty on purpose (Design Notes, "Scope decisions on the closed unions"):
	// `keyof typeof TABLE.lamps` (etc.) is `never` until Epic 2+ adds entries,
	// so an early lamp/flasher/show/shot/light-group name is a type error
	// rather than a runtime string.
	lamps: {},
	flashers: {},
	shows: {},
	shots: {},
	lightGroups: {},
} as const);
