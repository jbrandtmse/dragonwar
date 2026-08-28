// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-3, AD-15: every duration under sim/ is authored in ms here and converted
// to ticks exactly once, at load, by resolveTuning() -- this is the other
// permitted arithmetic site for TICK_HZ (the first is contracts/time.ts
// itself). Every tunable carries `source` and `confidence`; anything on the
// PRD addendum's do-not-invent list, or authored by this story rather than
// transcribed, ships `confidence: 'unverified'` with the authoring stated in
// `source` (this story's own "Always" rule).
//
// BLOCKED tunable, named rather than invented (this story's own "Block If"
// rule): FR-9's hop control ("Occasional ball hops are produced by one
// explicit tuning control... setting the control to zero produces no hops;
// the default produces occasional hops on hard hits") states no unit, no
// magnitude and no mechanism -- the architecture spine's own Deferred section
// lists "Hop control mechanism" itself as undecided ("vpx-js has no such
// knob"). A number cannot be defensibly authored when even its *unit* is
// unknown, unlike the tunables below (each of which has a known unit and a
// stated behavioural bound to author within). No `hopControl` entry exists
// in `TUNING`; the first story that implements the mechanism must add it
// alongside its unit and formula, not before.

import { deepFreeze, type SettleClass } from './dragonwar';
import { TICK_HZ } from '../contracts/time';

/** The rough provenance scale the PRD addendum's own tuning table uses in prose (high/medium/low measurement confidence, or an authored default). */
export type Confidence = 'high' | 'medium' | 'low' | 'unverified';

/** Every tunable carries its value alongside where it came from and how sure that source is (AD-15). */
export interface TuningEntry<T> {
	readonly value: T;
	readonly source: string;
	readonly confidence: Confidence;
}

function entry<T>(value: T, source: string, confidence: Confidence): TuningEntry<T> {
	return { value, source, confidence };
}

/** The four VPX per-object physics parameters (addendum §2: "The only four"), by named material. */
export interface PhysMaterialTuning {
	readonly elasticity: TuningEntry<number>;
	readonly elasticityFalloff: TuningEntry<number>;
	readonly friction: TuningEntry<number>;
	readonly scatter: TuningEntry<number>;
}

/**
 * `TABLE as const`-adjacent, deep-frozen tuning registry. Seeds exactly the
 * tunables Epic 1's later stories consume (this story's task 7); flipper
 * mover parameters (strength, ramp-up, end-of-stroke, return) are Story
 * 1.6's to add, transcribed from the vpx-js port itself rather than this
 * story's planning-artifact sources.
 */
export const TUNING = deepFreeze({
	/**
	 * Per-`phys_material` table. `default` is the VPX per-object default
	 * (addendum §2: "VPX per-object defaults 0.3 / 0.0 / 0.3 / 0.0");
	 * `flipper_rubber` is the addendum's flipper-rubber row (AR-17).
	 */
	materials: {
		default: {
			elasticity: entry(0.3, "addendum §2 physics tuning table, 'Per-object tunables': VPX per-object default", 'high'),
			elasticityFalloff: entry(0, "addendum §2 physics tuning table, 'Per-object tunables': VPX per-object default", 'high'),
			friction: entry(0.3, "addendum §2 physics tuning table, 'Per-object tunables': VPX per-object default", 'high'),
			scatter: entry(0, "addendum §2 physics tuning table, 'Per-object tunables': VPX per-object default", 'high'),
		},
		flipper_rubber: {
			elasticity: entry(0.88, "addendum §2 physics tuning table, 'Flipper elasticity' (AR-17)", 'medium'),
			elasticityFalloff: entry(
				0.15,
				"addendum §2 physics tuning table, 'Elasticity falloff' (AR-17) -- \"the primary feel knob\"",
				'medium',
			),
			friction: entry(
				0.85,
				"authored: midpoint of addendum §2's 'Flipper friction' range 0.8-0.9 (AR-17) -- \"what makes centre shots and backhands possible\"; no artifact states a single value",
				'unverified',
			),
			scatter: entry(0, "addendum §2 physics tuning table, 'Scatter angle': \"0, for every era; randomness is tuned down\"", 'high'),
		},
	} satisfies Readonly<Record<'default' | 'flipper_rubber', PhysMaterialTuning>>,

	/**
	 * AD-2's five default classes, transcribed verbatim from the spine's own
	 * rule text, plus the two classes Epic 1's own switches need
	 * (`button`, `slam`) that no artifact names a duration for -- both
	 * authored at 0 ms because neither passes through physics's
	 * hysteresis/debounce pipeline at all (see `sim/table/dragonwar.ts`'s
	 * `SettleClass` doc comment).
	 */
	switchSettleMsByClass: {
		rollover: entry(0, "AD-2 rule text: \"defaults by class: rollover 0, standup target 8, drop target 20, bumper skirt 2, tilt bob 0\"", 'high'),
		standup: entry(8, 'AD-2 rule text (as above)', 'high'),
		drop_target: entry(20, 'AD-2 rule text (as above)', 'high'),
		bumper_skirt: entry(2, 'AD-2 rule text (as above)', 'high'),
		tilt_bob: entry(0, 'AD-2 rule text (as above)', 'high'),
		button: entry(
			0,
			'authored: AD-2 states button switches (s_start, s_flipper_l, s_flipper_r, s_plunger) are emitted by sim/loop from InputFrame transitions, never through physics debounce, so there is no bounce to settle',
			'unverified',
		),
		slam: entry(
			0,
			"authored: AD-5 states the slam detector's closure is a tick-windowed nudge-count threshold computed in physics, not a debounced analog switch",
			'unverified',
		),
	} satisfies Readonly<Record<SettleClass, TuningEntry<number>>>,

	/** FR-10: "default 6.5°; range 6.0-8.5° [ASSUMPTION: bounds]". Default corroborated by AD-10's `TABLE.reference.pitchDeg` and the addendum's reference geometry (high confidence there). */
	defaultPitchDeg: entry(6.5, 'FR-10 consequence text; AD-10 TABLE.reference.pitchDeg; addendum §2 reference geometry ("pitch 6.5°... high confidence")', 'high'),
	pitchMinDeg: entry(6.0, 'FR-10 consequence text: "range 6.0-8.5° [ASSUMPTION: bounds]"', 'medium'),
	pitchMaxDeg: entry(8.5, 'FR-10 consequence text: "range 6.0-8.5° [ASSUMPTION: bounds]"; corroborated by addendum §2 "competition range 6.5-8.5°"', 'medium'),

	/**
	 * FR-16: "triggered by a rapid repeated Nudge past a threshold distinct
	 * from the Tilt bob's [ASSUMPTION]". No count or window is stated by any
	 * artifact; both are authored defaults for a burst of violent nudges
	 * clearly distinct from ordinary nudge play, pending the feel ritual
	 * (Story 1.9) tuning them against the Reference machine.
	 */
	slamNudgesPerWindow: entry(3, 'authored: FR-16 states the mechanism (a repeated-nudge threshold distinct from the tilt bob) but no count', 'unverified'),
	slamNudgeWindowMs: entry(500, 'authored: FR-16 states the mechanism but no window duration', 'unverified'),

	/**
	 * AD-3/AD-7: "tilt spacing and settle" is named as a rules timer concept
	 * (AD-3) and the bob's decay plus this settle is how Tilt clears (AD-7);
	 * FR-14 states the debounce need ("the bob's continued swing cannot
	 * produce two warnings inside the debounce window") without a number.
	 * Both authored, pending the feel ritual.
	 */
	tiltWarningSpacingMs: entry(500, 'authored: AD-3 names "tilt spacing" as a rules timer; FR-14 states the debounce requirement, no duration', 'unverified'),
	tiltSettleMs: entry(3000, 'authored: AD-3/AD-7 name "tilt... settle" as a rules timer keyed to the bob\'s physical decay; no duration stated', 'unverified'),

	/**
	 * AD-5: "the manual plunge maps s_plunger hold ticks through
	 * plungerSpeedByHoldMs in tuning.ts." No artifact states a curve, so this
	 * is authored as the two boundary points of a linear hold-time ->
	 * launch-power ramp (a bare tap still launches at `plungerMinSpeedScale`
	 * of full power; holding to `plungerMaxHoldMs` or beyond reaches full
	 * power) -- Story 1.6 (which owns the actual plunger hardware rule)
	 * interpolates between them and converts the scale to its own physics
	 * speed units. Not on the PRD addendum's do-not-invent list (that list
	 * names only manufacturer *coil pulse duration*, a different figure).
	 */
	plungerMinHoldMs: entry(0, 'authored: AD-5 states the mapping exists ("plungerSpeedByHoldMs"), not its curve; a bare tap is the ramp\'s lower bound', 'unverified'),
	plungerMaxHoldMs: entry(500, 'authored: AD-5 states the mapping exists, not its curve; the ramp\'s upper bound before the plunge is full power', 'unverified'),
	plungerMinSpeedScale: entry(0.3, 'authored: fraction of full plunger power at plungerMinHoldMs', 'unverified'),
	plungerMaxSpeedScale: entry(1.0, 'authored: fraction of full plunger power at plungerMaxHoldMs and beyond', 'unverified'),

	/**
	 * Story 1.5, task 10(b): the two eject-speed tunables AD-6's own rule text
	 * requires ("spawns the ball ... at the device's authored eject pose AND
	 * SPEED") and Story 1.4 explicitly deferred authoring. Neither name ends
	 * in `Ms` -- these are mm/s speeds, not durations -- so neither trips
	 * `pnpm lint:boundaries`' literal-millisecond rule; a later reader must
	 * not "fix" that by renaming them.
	 *
	 * `troughEjectSpeedMmPerS` is measured against the REAL running loop, not
	 * only against a standalone physics probe: an earlier planning figure of
	 * 500 mm/s reproduces exactly (peak y = 105.6 mm, verified here too) but
	 * OVERSHOOTS `sw_shooter_lane`'s own y <= 60 mm zone ceiling before
	 * falling back -- which fires a spurious `s_shooter_lane` open/close pair
	 * (and, per AD-6's own "the opening of s_shooter_lane is the one event
	 * that means plunged" rule, a spurious `ball_launched`) during an
	 * ORDINARY serve, before autolaunch is ever pulsed. 300 mm/s peaks at
	 * y ~= 50.6 mm -- comfortably inside the zone the whole arc, ~9.4 mm of
	 * margin below its ceiling -- and settles at the same y ~= 13.5 mm every
	 * speed does (the resting position is set by `col_wall_lane_bottom`, not
	 * by launch speed): the "served ball closes the lane switch with exactly
	 * one edge" behaviour this story's I/O matrix names, actually achieved
	 * rather than merely approximated. No planning artifact states a
	 * trough-kicker speed, so the figure itself is `unverified`.
	 */
	troughEjectSpeedMmPerS: entry(
		300,
		"authored: AD-6 requires an eject speed, no artifact states one -- measured against the real loop (not just a standalone physics probe) to stay inside sw_shooter_lane's own y <= 60 mm zone ceiling for its whole arc (peak y ~50.6 mm), avoiding the spurious ball_launched a higher speed (500 mm/s, peak y ~105.6 mm) produces by overshooting the zone before settling",
		'unverified',
	),

	/**
	 * `autolaunchSpeedMmPerS` clears `col_lane_deflector` (Story 1.5's own new
	 * geometry) at every measured speed >= 1800 mm/s; 1600 mm/s falls short
	 * and returns down the lane. 2500 mm/s carries a deliberate margin above
	 * that measured threshold.
	 */
	autolaunchSpeedMmPerS: entry(
		2500,
		"authored: AD-6 requires an eject speed, no artifact states one -- measured during Story 1.5 planning against col_lane_deflector, whose clearance threshold sits between 1600 and 1800 mm/s; this carries margin above it",
		'unverified',
	),
} as const);

type TuningMsKey<T> = {
	[K in keyof T]: K extends `${string}Ms` ? (T[K] extends TuningEntry<number> ? K : never) : never;
}[keyof T];

type MsToTicksKey<K extends string> = K extends `${infer Prefix}Ms` ? `${Prefix}Ticks` : never;

/** Every top-level `…Ms` scalar tunable in `TUNING`, converted to its `…Ticks` sibling name. */
type ResolvedScalarTicks = {
	readonly [K in TuningMsKey<typeof TUNING> as MsToTicksKey<K & string>]: TuningEntry<number>;
};

/** `resolveTuning()`'s full return shape: every original entry, plus every `…Ticks` counterpart. */
export type ResolvedTuning = typeof TUNING &
	ResolvedScalarTicks & {
		readonly switchSettleTicksByClass: Readonly<Record<SettleClass, TuningEntry<number>>>;
	};

function msToTicks(ms: number, label: string, tickHz: number): number {
	if (!Number.isFinite(ms)) {
		throw new Error(`resolveTuning(): "${label}" is not a finite number (got ${String(ms)})`);
	}
	// DW-35: a negative duration is never meaningful, and a strictly positive
	// one that rounds to 0 ticks at the live tick rate would silently become a
	// no-op wait -- both throw, naming the tunable, its ms value, the tick
	// rate and the resulting tick count. An authored `0` still converts to `0`
	// ticks with no throw (I/O matrix: "A tunable authored as exactly 0 ms
	// still converts to 0 ticks without throwing").
	if (ms < 0) {
		throw new Error(
			`resolveTuning(): "${label}" is negative (ms=${ms}, tickHz=${tickHz}) -- a tunable duration cannot be negative (DW-35).`,
		);
	}
	const ticks = Math.round((ms * tickHz) / 1000);
	if (ms > 0 && ticks === 0) {
		throw new Error(
			`resolveTuning(): "${label}" (ms=${ms}, tickHz=${tickHz}) rounds to 0 ticks -- a nonzero duration must not silently ` +
			`collapse to a no-op tick count (DW-35).`,
		);
	}
	return ticks;
}

/**
 * The single load-time `…Ms` -> `…Ticks` conversion (AD-3): every top-level
 * scalar tunable whose name ends in `Ms`, plus the `switchSettleMsByClass`
 * dictionary, gets a `…Ticks` sibling computed once from `TICK_HZ`. Values
 * and `source`/`confidence` survive unchanged on every entry; a non-finite
 * `…Ms` value throws (load-time paths throw -- AD-16 Conventions).
 *
 * `tickHz` is injectable so the conversion can be observed at a rate other
 * than the current `TICK_HZ`. At 1000 Hz `Math.round(ms * 1000 / 1000) === ms`
 * for every integer tunable, so a test pinned to the default rate cannot tell
 * a real conversion from `return ms` -- and `TICK_HZ` is explicitly
 * PROVISIONAL ("1000 on PASS, 480 on FAIL", `sim/contracts/time.ts`), which is
 * exactly when a regressed conversion would start mattering (review finding,
 * this story's review pass).
 */
export function resolveTuning(tuning: typeof TUNING = TUNING, tickHz: number = TICK_HZ): ResolvedTuning {
	const scalarTicks: Record<string, TuningEntry<number>> = {};
	for (const [key, value] of Object.entries(tuning)) {
		if (!key.endsWith('Ms')) {
			continue;
		}
		if (typeof value !== 'object' || value === null || !('value' in value) || typeof (value as TuningEntry<number>).value !== 'number') {
			// The I/O matrix's "Tunable conversion" row requires a throw here:
			// "a tunable named `…Ms` whose value is not a finite number throws at
			// load". This branch used to `continue`, which silently skipped
			// exactly that case -- and its comment cited switchSettleMsByClass,
			// which ends in "Class" and is filtered out one branch earlier, so
			// the guard had no legitimate live use at all (review finding, this
			// story's review pass).
			throw new Error(
				`resolveTuning(): "${key}" ends in "Ms" but is not a TuningEntry<number> ` +
				`(got ${value === null ? 'null' : typeof value}); every …Ms tunable must carry a numeric value.`,
			);
		}
		const entryValue = value as TuningEntry<number>;
		const ticksKey = `${key.slice(0, -2)}Ticks`;
		scalarTicks[ticksKey] = entry(msToTicks(entryValue.value, key, tickHz), entryValue.source, entryValue.confidence);
	}

	const switchSettleTicksByClass: Record<string, TuningEntry<number>> = {};
	for (const [settleClass, value] of Object.entries(tuning.switchSettleMsByClass)) {
		switchSettleTicksByClass[settleClass] = entry(
			msToTicks(value.value, `switchSettleMsByClass.${settleClass}`, tickHz),
			value.source,
			value.confidence,
		);
	}

	return {
		...tuning,
		...(scalarTicks as ResolvedScalarTicks),
		switchSettleTicksByClass: switchSettleTicksByClass as Readonly<Record<SettleClass, TuningEntry<number>>>,
	};
}
