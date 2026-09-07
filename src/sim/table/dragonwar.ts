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
 * Story 2.1b (task 12a): moved DOWN from `sim/table/tuning.ts`, which
 * re-exports it, so `TABLE.authoredCounts` (below) can carry the exact same
 * `{ value, source, confidence }` provenance shape `TuningEntry<T>` uses,
 * without `dragonwar.ts` importing FROM `tuning.ts` (which already imports
 * `SettleClass` from here -- the reverse direction would be a cycle). The
 * rough provenance scale the PRD addendum's own tuning table uses in prose
 * (high/medium/low measurement confidence, or an authored default).
 */
export type Confidence = 'high' | 'medium' | 'low' | 'unverified';

/** The `{ value, source, confidence }` shape both `TUNING` (`tuning.ts`'s `TuningEntry<T>`) and `TABLE.authoredCounts` (below) carry -- declared once here so neither has to import the other's copy. */
export interface AuthoredEntry<T> {
	readonly value: T;
	readonly source: string;
	readonly confidence: Confidence;
}

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

/**
 * Exported so `sim/table/tuning.ts` freezes `TUNING` the same way, rather
 * than duplicating this logic.
 *
 * Story 2.1a (DW-33): `visited` (a `WeakSet`, never surfaced to a caller --
 * every external call site omits it and gets the default) is the ONLY cycle
 * guard now; freezing itself is unconditional. The previous
 * `!Object.isFrozen(value)` gate did BOTH jobs at once, and that conflation
 * was the defect: a value that arrives ALREADY frozen (e.g.
 * `Object.freeze({ inner: { a: 1 } })`, handed to this function un-descended)
 * short-circuited on that very first check and never recursed into `inner`
 * at all -- `DeepReadonly<T>`'s own type claims every descendant is
 * `readonly`, a claim this function did not keep. `Object.freeze()` is
 * idempotent (freezing an already-frozen object is a harmless no-op), so
 * calling it unconditionally costs nothing and fixes that gap; the
 * `visited` set exists purely so a SELF-REFERENTIAL input (a value that
 * reaches itself again through its own descendants) terminates instead of
 * recursing forever, which is the one thing `Object.freeze()`'s own
 * idempotence cannot provide by itself.
 */
export function deepFreeze<T>(value: T, visited: WeakSet<object> = new WeakSet()): DeepReadonly<T> {
	if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
		const asObject = value as unknown as object;
		if (visited.has(asObject)) {
			return value as DeepReadonly<T>;
		}
		visited.add(asObject);
		Object.freeze(value);
		for (const key of Object.keys(value)) {
			deepFreeze((value as Record<string, unknown>)[key], visited);
		}
	}
	return value as DeepReadonly<T>;
}

/**
 * `TABLE as const`, deep-frozen. AD-10's reference dimensions
 * (`TABLE.reference`), the eleven switches Epic 1 needs (each with a
 * `settleClass`), the four coils, the two ball devices (AD-6), the three GI
 * channels (AD-9); Story 1.4 adds the one Epic 1 lamp (`l_insert_left`), the
 * populated `lightGroups`, the glb/collision `nodes` names and the
 * `physMaterials` name list. `flashers` and `shows` stay empty, so their
 * derived name unions are still `never` until a later story populates them
 * (Design Notes, "Scope decisions on the closed unions"). `shots` (Story
 * 2.4, AD-19) is populated with the three declared shots.
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

		// Story 2.1b -- the rest of the shot map (epics.md:927). The
		// `settleClass` mapping and its rationale are this story's spec Design
		// Notes, "The settleClass mapping, and why": `rollover` (0 ms) for
		// every simple ball-presence lever (loops, ramp, lock lane and its
		// slots, top lanes, inlanes/outlanes, the drain); `standup` (8 ms) for
		// the Dragon body and both slingshots (a slingshot leaf against
		// rubber is the same mechanical class as a standup target's leaf, and
		// no artifact names a dedicated class for it); `drop_target` (20 ms)
		// for the six DRAGON-bank targets; `bumper_skirt` (2 ms) for the pops
		// (Story 2.2's own AC names this class explicitly). `s_spinner` stays
		// `rollover` deliberately -- any settle would swallow revolutions,
		// and revolution counting is Story 2.3's mechanical state, not a
		// debounce.
		s_loop_l_in: { settleClass: 'rollover' },
		s_loop_l_out: { settleClass: 'rollover' },
		s_loop_r_in: { settleClass: 'rollover' },
		s_loop_r_out: { settleClass: 'rollover' },
		s_spinner: { settleClass: 'rollover' },
		s_ramp_enter: { settleClass: 'rollover' },
		s_ramp_made: { settleClass: 'rollover' },
		s_dragon_d: { settleClass: 'drop_target' },
		s_dragon_r: { settleClass: 'drop_target' },
		s_dragon_a: { settleClass: 'drop_target' },
		s_dragon_g: { settleClass: 'drop_target' },
		s_dragon_o: { settleClass: 'drop_target' },
		s_dragon_n: { settleClass: 'drop_target' },
		s_dragon_body: { settleClass: 'standup' },
		s_lock_lane: { settleClass: 'rollover' },
		s_lock_1: { settleClass: 'rollover' },
		s_lock_2: { settleClass: 'rollover' },
		s_lock_3: { settleClass: 'rollover' },
		s_top_1: { settleClass: 'rollover' },
		s_top_2: { settleClass: 'rollover' },
		s_top_3: { settleClass: 'rollover' },
		s_inlane_l: { settleClass: 'rollover' },
		s_inlane_r: { settleClass: 'rollover' },
		s_outlane_l: { settleClass: 'rollover' },
		s_outlane_r: { settleClass: 'rollover' },
		s_sling_l: { settleClass: 'standup' },
		s_sling_r: { settleClass: 'standup' },
		s_pop_1: { settleClass: 'bumper_skirt' },
		s_pop_2: { settleClass: 'bumper_skirt' },
		s_pop_3: { settleClass: 'bumper_skirt' },
		s_drain: { settleClass: 'rollover' },
	},

	// No coil-specific descriptor fields exist yet -- Epic 1 names each coil
	// and nothing else. `Record<string, never>` is a deliberately empty
	// object type, not `{}` (which would accept any non-nullish value).
	coils: {
		c_flipper_l: {} as Record<string, never>,
		c_flipper_r: {} as Record<string, never>,
		c_trough_eject: {} as Record<string, never>,
		c_autolaunch: {} as Record<string, never>,

		// Story 2.1b -- hardware coils for the new devices. Actuation
		// (slingshot/pop kick, drop-target reset, the Mouth eject) is Story
		// 2.2/2.3's; this story only declares the names and the bodies they
		// energise.
		c_sling_l: {} as Record<string, never>,
		c_sling_r: {} as Record<string, never>,
		c_pop_1: {} as Record<string, never>,
		c_pop_2: {} as Record<string, never>,
		c_pop_3: {} as Record<string, never>,
		c_dragon_bank_reset: {} as Record<string, never>,
		c_mouth: {} as Record<string, never>,
	},

	ballDevices: {
		// AD-6: parking device. Physics parks an entering ball into the lowest
		// empty slot unconditionally and ejects the highest filled slot, one per
		// pulse of `ejectCoil`. `slots` is fill order.
		//
		// Story 2.1d: each parking device below also declares
		// `startsFullAtBoot` -- AD-6's "the machine carries 4 balls, asserted
		// at boot" read from a property of the device rather than assumed.
		// `src/sim/physics/devices.ts`'s `createDeviceMechanics()` reads it to
		// seed `parkingSlots` and sums it across every parking device below,
		// throwing by name if the total is not 4 -- the one place both this
		// field and every device's `capacity` are in scope together.
		bd_trough: {
			kind: 'parking',
			capacity: 4,
			slots: ['s_trough_1', 's_trough_2', 's_trough_3', 's_trough_4'],
			ejectCoil: 'c_trough_eject',
			// Story 2.1d (AD-6): "the machine carries 4 balls, asserted at
			// boot" -- a declared property of the device, not the constant
			// `fill(true)` `src/sim/physics/devices.ts` used to boot every
			// parking device with regardless of what it actually holds at rest.
			// The Trough IS the machine's own ball supply, so it starts full;
			// `bd_lock` (below) starts empty for the identical reason. Added to
			// BOTH parking devices in the same edit -- `BallDevice`
			// (`devices.ts`) is a union of literal types with no shared
			// interface, so adding this field to one alone is a type error once
			// `kind === 'parking'` narrows the union.
			startsFullAtBoot: true,
			// AD-6: ball search is tick-timed pulses ending in the one command that
			// lets physics despawn a loose ball. Two eject attempts before
			// recovering is this story's authored default -- no artifact states a
			// pulse count, and it is not on the PRD addendum's do-not-invent list.
			ballSearchOrder: [
				{ action: 'pulse', coil: 'c_trough_eject' },
				{ action: 'pulse', coil: 'c_trough_eject' },
				{ action: 'recover' },
			],
			// Story 1.5: the `SwitchName` whose `sw_` zone the device's authored
			// eject pose must lie inside (`test/device-eject-pose.test.ts`'s
			// standing gate). bd_trough's eject kicks the ball into the shooter
			// lane, where it comes to rest before autolaunch/the manual plunge
			// sends it into the main field. A device with no zone-bounded
			// destination -- a future Mouth aimed loosely at the flippers, say --
			// simply omits this field.
			servesInto: 's_shooter_lane',
			// Story 2.1d (task 6, AD-15): no per-device override -- bd_trough
			// keeps using the shared tuning.troughEjectSpeedMmPerS (300 mm/s),
			// exactly as before this story. `null`, not `undefined` and not
			// omitted: both parking devices must carry this key (the same
			// reason `startsFullAtBoot` above is on both -- `BallDevice`,
			// devices.ts, is a union of literal types with no shared
			// interface, so a key present on one alone is a type error after
			// `kind === 'parking'` narrowing) -- and `tableHash()`'s own
			// `canonicalize()` throws on a literal `undefined` anywhere in
			// `TABLE` (verified: it did, before this fix), so `null` is the
			// only sentinel that is both JSON-canonical and distinguishable
			// from "no override".
			ejectSpeedMmPerS: null as AuthoredEntry<number> | null,
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
			// Story 1.5: bd_shooter's served ball rests in its own lane -- the
			// same `s_shooter_lane` zone it enters through.
			servesInto: 's_shooter_lane',
		},

		// Story 2.1b (AD-6): the Lock -- capacity 3 ("two held plus one
		// staging", AD-6's own rule text), slots in fill order, ejecting
		// through `c_mouth` at the Mouth pose. No `servesInto`: the Mouth
		// ejects onto open playfield toward the flippers, not into a
		// zone-bounded destination (unlike bd_trough's kick into the shooter
		// lane).
		bd_lock: {
			kind: 'parking',
			capacity: 3,
			slots: ['s_lock_1', 's_lock_2', 's_lock_3'],
			ejectCoil: 'c_mouth',
			// Story 2.1d (AD-6): the Lock is not part of the machine's boot
			// complement -- it starts empty. Previously assumed by
			// `devices.ts`'s unconditional `fill(true)`, which booted SEVEN
			// balls total (`bd_trough`'s 4 plus this device's 3) against AD-6's
			// "the machine carries 4 balls, asserted at boot".
			startsFullAtBoot: false,
			// AD-6: ball search is tick-timed pulses ending in the one command
			// that lets physics despawn a loose ball. Two eject attempts before
			// recovering, the same authored default `bd_trough` uses above -- no
			// artifact states a pulse count for the Lock either.
			ballSearchOrder: [
				{ action: 'pulse', coil: 'c_mouth' },
				{ action: 'pulse', coil: 'c_mouth' },
				{ action: 'recover' },
			],
			// Story 2.1d (task 6, AD-6/AD-15) originally carried a 500 mm/s
			// override here, measured against the Mouth's own then-pose (650,
			// 38 mm of open field above the re-sited slot band) needing to
			// clear every sw_lock_* zone inside the 200-tick I/O-matrix
			// window faster than the shared 300 mm/s trough speed could.
			// [REWORK, rework iteration 2] `DRAGON_MOUTH_Y_MM` moved south of
			// the whole corridor (460, see tools/make-placeholder-blend.py's
			// own [REWORK] note beside that constant) to close the AC 2
			// swallow properly (col_lock_ceiling seals the corridor's own
			// north side, so a pose north of it could no longer eject INTO
			// the corridor at all). The ejected ball now starts already past
			// every sw_lock_* zone along its own eject axis -- the zone-
			// clearing requirement this override existed to satisfy is now
			// met at spawn, by construction, regardless of speed -- so the
			// override is removed and bd_lock falls back to the shared
			// `tuning.troughEjectSpeedMmPerS`, exactly like bd_trough. This
			// also closes the AD-15 review finding this override's own
			// existence raised: "two eject speeds in two files" (this one
			// inside `TABLE`, moving `tableHash`; the shared one inside
			// `TUNING`, moving `gameStart.tuning`) is now the simplest
			// possible fix -- one eject speed, in the one file AD-15 asks
			// for. Re-verified against the real pipeline (task 5/AC 2's own
			// standing test): the ball is still in play and outside every
			// sw_lock_* zone 200 ticks after a pulse at the shared 300 mm/s.
			ejectSpeedMmPerS: null as AuthoredEntry<number> | null,
		},
	},

	/**
	 * Story 2.1b (task 12a, AD-15): registry facts recorded with the same
	 * `{ value, source, confidence }` provenance shape `TUNING` uses for
	 * do-not-invent figures, so an authored COUNT (as opposed to a switch or
	 * coil name, which the registry already types exactly) reads as an
	 * authored decision rather than a sourced fact. `popBumpers` is the only
	 * entry: the author fixed the pop-bumper count at three on 2026-08-31 (no
	 * artifact ever states a count -- see docs/decisions.md), and per-entry
	 * provenance on the pop switches/coils themselves is impossible (`coils`
	 * above is typed `Record<string, never>`, which forbids adding a field to
	 * ANY coil entry). `test/table.test.ts` pins `popBumpers.value` against
	 * the actual count of `s_pop_*` keys in `switches` above and `c_pop_*`
	 * keys in `coils` above, so this record can never silently drift from the
	 * switch/coil set it documents. **Not** part of `buildTableDump()`
	 * (`tools/export-assets.mjs`): a provenance record is not geometry, and
	 * `export.py` has no business validating it. **Consequence, and it is
	 * deliberate**: `tableHash()` hashes the whole `TABLE`
	 * (`src/sim/loop/replay.ts`), so this block's `source` prose is inside
	 * every golden's identity -- a later wording edit re-breaks all five
	 * golden headers, exactly as editing any other tunable's `source` string
	 * does, because the authored count really is part of the table's own
	 * identity.
	 */
	authoredCounts: {
		popBumpers: {
			value: 3,
			source: 'authored 2026-08-31: no artifact states a pop-bumper count -- FR-31/CAP-31 name only "pop bumpers", while the same sentence tags the neighbouring Top lanes [ASSUMPTION: count] and settles them at three, and settles the slingshots at two (epics.md, Story 2.1b Gap 2). Three matches the Top-lane count and is the standard arrangement for this shot density.',
			confidence: 'unverified',
		},
	} satisfies Readonly<Record<'popBumpers', AuthoredEntry<number>>>,

	/**
	 * Story 2.2 (AD-11 "TABLE owns ... wiring"): each pop bumper's coil
	 * paired with the SKIRT SWITCH that triggers its kick. `sim/physics/
	 * pops.ts` derives its three-entry subject set from `Object.keys()` here
	 * (DW-149: never a second hand-typed list) and never needs an `s_pop_*`
	 * string literal of its own to name the switch it reads -- `pnpm
	 * lint:boundaries`'s device-name-literal rule bans one outside this file
	 * (this section only exists because that correlation cannot be derived
	 * any other way -- unlike the coil<->collision-node pairing, which stays
	 * local to `sim/physics/pops.ts`/`loader/index.ts` as a plain `col_`-
	 * prefixed value, exactly the way `flippers.ts`'s own `SIDE_BY_COIL`
	 * keeps its coil<->side pairing local). Mirrors `bd_trough.slots`/
	 * `.ejectCoil` above, which already carry their own wiring as literal
	 * values in this exempt file.
	 */
	popWiring: {
		c_pop_1: { switch: 's_pop_1' },
		c_pop_2: { switch: 's_pop_2' },
		c_pop_3: { switch: 's_pop_3' },
	},

	/**
	 * Story 2.3 (AD-6, AD-11 "TABLE owns ... wiring", task 1): each DRAGON-bank
	 * target letter paired with the switch it closes AND the `col_` collision
	 * node whose hit objects the bank must retain a handle to (task 5) so it
	 * can `setEnabled(false)` them on a genuine strike and `setEnabled(true)`
	 * them on a bank reset. `sim/physics/drop-targets.ts` derives its
	 * six-entry subject set from `Object.keys()` here (DW-149: never a second
	 * hand-typed letter list) and `sim/physics/switches.ts` derives its own
	 * widened tracker-exclusion set from the same `Object.values()` --
	 * neither file needs an `s_dragon_*` / `col_dragon_*` string literal of
	 * its own. Letters are D-R-A-G-O-N order, matching `switches` above.
	 */
	dropBankWiring: {
		d: { switch: 's_dragon_d', node: 'col_dragon_d' },
		r: { switch: 's_dragon_r', node: 'col_dragon_r' },
		a: { switch: 's_dragon_a', node: 'col_dragon_a' },
		g: { switch: 's_dragon_g', node: 'col_dragon_g' },
		o: { switch: 's_dragon_o', node: 'col_dragon_o' },
		n: { switch: 's_dragon_n', node: 'col_dragon_n' },
	},

	/**
	 * Story 2.3 (AD-5): the coil that raises the whole bank. A plain string
	 * value (never a bare object key elsewhere) so `sim/physics/drop-
	 * targets.ts` can name it without a `c_`-prefixed literal of its own --
	 * `pnpm lint:boundaries`'s device-name-literal rule bans one outside this
	 * file, mirroring `bd_lock.ejectCoil` above.
	 */
	dropBankResetCoil: 'c_dragon_bank_reset',

	/**
	 * Story 2.3 (AD-6's 2026-09-03 amendment, AD-11): the spinner's own
	 * switch, in the same `{ switch: SwitchName }` shape `popWiring` above
	 * uses -- keyed by the switch's own name (there is exactly one spinner in
	 * this table) so a future second spinner is a second key, never a second
	 * hand-typed list. `sim/physics/spinner.ts` derives its subject set from
	 * `Object.keys()` here and its own zone from
	 * `switchZones.filter((z) => z.switch === wiring.switch)` on the one
	 * value here (this story's spec, task 1 rationale) -- it never names
	 * `s_spinner` as a literal of its own.
	 */
	spinnerWiring: {
		s_spinner: { switch: 's_spinner' },
	},

	/**
	 * Story 2.4 (AD-19, task 2): every lane the devices layer reports a bare
	 * `lane_entered { lane }` for -- the three Top lanes plus the full
	 * inlane/outlane set, each keyed by the lane id the event payload
	 * carries. Lane STATE (lit flags, completed sets, `lane_lit`) stays the
	 * base mode's (AD-7); this wiring only lets the layer resolve a switch
	 * edge to a lane id from `TABLE`, never a literal, mirroring
	 * `popWiring`/`spinnerWiring`'s own `Object.entries()` idiom.
	 */
	//
	// Story 2.7 (AD-7, AD-11, DW-149, task 1): each entry widened from a bare
	// `{ switch }` to `{ switch, set, order }` so the base mode (AD-7: "lanes
	// ... owned by the base mode") can resolve set membership and rotation
	// direction from TABLE alone, never by prefix-matching a lane id. `set`
	// is `'top'` for the three Top lanes and `'inout'` for the inlane/outlane
	// four; `order` is the 0-based PHYSICAL left-to-right index within that
	// set, measured from each lane's own `sw_` collision-zone x-centre in
	// `public/assets/dragonwar.collision.json` (test/table.test.ts pins this
	// against the live geometry): sw_top_1 145.0, sw_top_2 245.0, sw_top_3
	// 335.5 (already ascending in declaration order); sw_outlane_l 17.45,
	// sw_inlane_l 67.9, sw_inlane_r 400.5, sw_outlane_r 450.95. The `inout`
	// set's DECLARATION order below (inlane_l, inlane_r, outlane_l,
	// outlane_r) is deliberately NOT its physical order -- `order` alone
	// carries the physical left-to-right sequence (outlane_l=0, inlane_l=1,
	// inlane_r=2, outlane_r=3). Do not "tidy" the declaration order to match
	// `order`, and do not derive rotation direction from declaration order --
	// only `order` is physical.
	laneWiring: {
		top_1: { switch: 's_top_1', set: 'top', order: 0 },
		top_2: { switch: 's_top_2', set: 'top', order: 1 },
		top_3: { switch: 's_top_3', set: 'top', order: 2 },
		inlane_l: { switch: 's_inlane_l', set: 'inout', order: 1 },
		inlane_r: { switch: 's_inlane_r', set: 'inout', order: 2 },
		outlane_l: { switch: 's_outlane_l', set: 'inout', order: 0 },
		outlane_r: { switch: 's_outlane_r', set: 'inout', order: 3 },
	},

	/** Story 2.4 (AD-19, task 2): the Dragon body's own standup face -- a bare `dragon_hit` report, no letter or bank bookkeeping (that is `dropBankWiring` above). */
	dragonBodyWiring: {
		switch: 's_dragon_body',
	},

	/**
	 * Story 2.4 (AD-19/AD-18, task 2): the Lock lane's own entry switch,
	 * paired with the ball device its capture resolves against (DW-166: the
	 * devices layer owns `bd_lock`'s slot bookkeeping, which is what makes
	 * the capture-resolution condition expressible at all). The Lock
	 * arbiter that decides what a `lock_lane_entered` MEANS lives in the
	 * ball controller (AD-18) and does not exist until Story 3.2 -- this
	 * layer only resolves whether the closure captured.
	 */
	lockLaneWiring: {
		switch: 's_lock_lane',
		device: 'bd_lock',
	},

	/**
	 * Story 2.4 (AD-19, task 2): the two flipper buttons, wired for
	 * `lane_change_pressed { side }` (Story 2.7's own shot) alongside the
	 * bare `button_pressed { button }` every cabinet button reports.
	 */
	flipperButtonWiring: {
		left: { switch: 's_flipper_l' },
		right: { switch: 's_flipper_r' },
	},

	/**
	 * Story 2.4 (AD-19, task 2): the three declared shots, ordered switch
	 * sequences with a tick window converted from a top-level `…Ms` tunable
	 * (`sim/table/tuning.ts`'s `shotWindowTicks()` is the one sanctioned
	 * reader). `entryExclusive` records a MEASURED geometric fact, never a
	 * style choice (DW-133, this story's Design Notes, "DW-133 --
	 * addressed"): `false` when something OTHER than this shot also closes
	 * the sequence's own first switch, `true` when nothing else does.
	 *
	 * Both Loops are `false`: `s_loop_l_in`/`s_loop_r_in` each span their
	 * whole lane mouth, which also spans that side's outlane column, so
	 * every outlane drain closes it (measured: `s_loop_r_in` then
	 * `s_outlane_r` then `s_drain`), and a MADE Ramp's own return also
	 * crosses into the Right Loop lane on its way to the right inlane
	 * (measured `firstMakes`: `s_ramp_enter, s_ramp_made, s_loop_r_in,
	 * s_inlane_r`) -- a bare `_in` is therefore never, on its own, evidence
	 * of a Loop entry, so a sequence with `entryExclusive: false` is tracked
	 * to completion but never emits `_broken` on expiry (the naive
	 * alternative -- emit `_broken` whenever the window lapses without a
	 * completion -- would fire on both the outlane drain and the made Ramp,
	 * which IS treating the bare `_in` as a Loop entry, the exact thing this
	 * flag forbids).
	 *
	 * The Ramp is `true`: `s_ramp_enter` is closed by nothing else in this
	 * table, so a lapsed window genuinely means a rejected Ramp, and
	 * `shot_ramp_broken` stays a real, falsifiable event.
	 */
	shots: {
		shot_left_loop: {
			sequence: ['s_loop_l_in', 's_loop_l_out'],
			windowMs: 'loopWindowMs',
			entryExclusive: false,
		},
		shot_right_loop: {
			sequence: ['s_loop_r_in', 's_loop_r_out'],
			windowMs: 'loopWindowMs',
			entryExclusive: false,
		},
		shot_ramp: {
			sequence: ['s_ramp_enter', 's_ramp_made'],
			windowMs: 'rampWindowMs',
			entryExclusive: true,
		},
	},

	/** AD-9: the architectural GI channels, set once per phase via `GiCommand.level`. */
	giChannels: {
		gi_backbox: {} as Record<string, never>,
		gi_cabinet: {} as Record<string, never>,
		gi_arch: {} as Record<string, never>,
	},

	// Story 1.4's own AC: exactly one lamp, the `l_insert_left` insert the
	// placeholder `.blend` carries. `flashers` and `shows` stay empty on
	// purpose (Design Notes, "Scope decisions on the closed unions"):
	// `keyof typeof TABLE.flashers` (etc.) is `never` until a later story
	// adds entries, so an early flasher/show name is a type error rather
	// than a runtime string. `shots` (Story 2.4) is declared above,
	// alongside the other wiring blocks it is authored beside.
	lamps: {
		l_insert_left: {} as Record<string, never>,
	},
	flashers: {},
	shows: {},

	// AD-12: every static mesh the placeholder `.blend` exports carries a
	// `lightgroup` custom property from this closed set, so the eventual
	// per-group bake (Epic 4) needs no mesh or `TABLE` change.
	lightGroups: {
		lg_playfield: {} as Record<string, never>,
		lg_inserts: {} as Record<string, never>,
		lg_cabinet: {} as Record<string, never>,
	},

	// AD-11: the glb/collision node names `TABLE` owns -- the three top-level
	// scene roots plus the four collision nodes the physics loader asserts
	// against `reference` below. Keyed camelCase so a consumer writes
	// `TABLE.nodes.colPlayfield`, never a bare string literal (`pnpm
	// lint:boundaries` rule (e) covers the `s_/c_/l_/f_/gi_/bd_/shot_/show_`
	// device-name prefixes; these node names deliberately fall outside that
	// grammar -- `col_`, unlike `c_`, is not a device prefix -- but are still
	// routed through `TABLE` per AD-11's "Blender owns placement; `TABLE`
	// owns devices, wiring, groups and tunables" split applied to naming).
	// `src/presentation/scene/playfield.ts` resolves the first three from the
	// loaded glb; `src/sim/physics/loader` resolves the collision four from
	// the collision JSON. Other collision nodes (walls, the drain, etc.) are
	// generic geometry `tools/export.py` validates by grammar and `col_shape`
	// alone and need no individual `TABLE` entry.
	nodes: {
		playfieldRoot: 'playfield_root',
		cabinetRoot: 'cabinet_root',
		pivotPitch: 'pivot_pitch',
		colPlayfield: 'col_playfield',
		colGlass: 'col_glass',
		colFlipperL: 'col_flipper_l',
		colFlipperR: 'col_flipper_r',
	},

	// AD-11: the `phys_material` name list `tools/export-assets.mjs` dumps
	// for `tools/export.py` to validate every authored node's `phys_material`
	// property against. The real per-material tunables (elasticity, friction,
	// ...) live in `sim/table/tuning.ts`'s `TUNING.materials`, which is not
	// Node-importable (its `'./dragonwar'` specifier is Node-ESM-extensionless
	// -- verified, this story's Code Map); `test/asset-contract.test.ts` pins
	// `Object.keys(TABLE.physMaterials)` against `Object.keys(TUNING.materials)`
	// so the two name lists can never drift apart silently.
	physMaterials: {
		default: {} as Record<string, never>,
		flipper_rubber: {} as Record<string, never>,
		// Story 2.2 (AD-11, AC 4): the three material names the geometry has
		// always implied -- rubber_band (both slings), rubber_post (every
		// col_post_* node), bumper (all three col_pop_* nodes) -- named here
		// so `tools/export.py` validates the re-authored `.blend`'s
		// `phys_material` property against a real registry entry rather than
		// an unenforced convention. `test/asset-contract.test.ts` pins this
		// list against `Object.keys(TUNING.materials)` both ways.
		rubber_band: {} as Record<string, never>,
		rubber_post: {} as Record<string, never>,
		bumper: {} as Record<string, never>,
	},
} as const);
