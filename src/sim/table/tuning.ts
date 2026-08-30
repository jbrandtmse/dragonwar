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
// `hopControl` (Story 1.9, AC 2): FR-9's hop control ("Occasional ball hops
// are produced by one explicit tuning control... setting the control to
// zero produces no hops; the default produces occasional hops on hard
// hits") stated no unit, no magnitude and no mechanism when this file
// previously recorded the tunable as deliberately BLOCKED -- the
// architecture spine's own Deferred section listed "Hop control mechanism"
// as undecided ("vpx-js has no such knob"). Story 1.9 picks the mechanism
// (`src/sim/physics/hop.ts`, authored beside the port rather than inside
// it -- DW-79's freeze covers exactly the ported files a hop would
// naturally live in) and, with a mechanism now defined, a unit: `hopControl`
// is a DIMENSIONLESS scale on the ball's own post-step velocity-change
// excess above an authored trigger, in the same physics-internal units the
// solver already works in (`hop.ts`'s own header carries the measurement).
// `0` is the exact identity -- no hops, by construction, not by tuning close
// to zero; the shipped default is authored, unverified, and explicitly
// owed to Story 1.9's own feel ritual (`docs/feel-test.md`) for ratification
// against the Reference machine.

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
 * Story 1.6's `FlipperMover`/`FlipperHit` port parameters (AD-5, AD-15). Every
 * value here is transcribed from the pinned upstream source at
 * `lib/vpt/flipper/flipper-mover.ts` / `flipper-data.ts` @ `e8a6d6f`, never
 * invented — see each entry's own `source` below. No key ends in `Ms`: none
 * of these is a duration `resolveTuning()` converts, and `pnpm
 * lint:boundaries`'s tick/ms rule would reject one that did outside this
 * file's own top level.
 *
 * MPF's `~30 ms at 70%, then 25% hold` figures (`physics-tuning.md:29`) are
 * deliberately NOT one of these entries -- they are a calibration reference
 * for the feel ritual (Story 1.9), never a parameter this port reads.
 */
export interface FlipperTuning {
	readonly mass: TuningEntry<number>;
	readonly strength: TuningEntry<number>;
	readonly rampUp: TuningEntry<number>;
	readonly returnRatio: TuningEntry<number>;
	readonly torqueDamping: TuningEntry<number>;
	readonly torqueDampingAngleDeg: TuningEntry<number>;
	readonly sweepDeg: TuningEntry<number>;
	readonly endRadiusRatio: TuningEntry<number>;
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
			elasticity: entry(0.3, "addendum \u00A72 physics tuning table, 'Per-object tunables': VPX per-object default", 'high'),
			elasticityFalloff: entry(0, "addendum \u00A72 physics tuning table, 'Per-object tunables': VPX per-object default", 'high'),
			friction: entry(0.3, "addendum \u00A72 physics tuning table, 'Per-object tunables': VPX per-object default", 'high'),
			scatter: entry(0, "addendum \u00A72 physics tuning table, 'Per-object tunables': VPX per-object default", 'high'),
		},
		flipper_rubber: {
			elasticity: entry(0.88, "addendum \u00A72 physics tuning table, 'Flipper elasticity' (AR-17)", 'medium'),
			elasticityFalloff: entry(
				0.15,
				"addendum \u00A72 physics tuning table, 'Elasticity falloff' (AR-17) -- \"the primary feel knob\"",
				'medium',
			),
			friction: entry(
				0.85,
				"authored: midpoint of addendum \u00A72's 'Flipper friction' range 0.8-0.9 (AR-17) -- \"what makes centre shots and backhands possible\"; no artifact states a single value",
				'unverified',
			),
			scatter: entry(0, "addendum \u00A72 physics tuning table, 'Scatter angle': \"0, for every era; randomness is tuned down\"", 'high'),
		},
	} satisfies Readonly<Record<'default' | 'flipper_rubber', PhysMaterialTuning>>,

	/**
	 * Story 1.6's mover parameters (see `FlipperTuning`'s own doc comment
	 * above). The flipper's COLLISION material (elasticity 0.88, falloff
	 * 0.15, friction 0.85) stays `materials.flipper_rubber` above -- already
	 * authored, reused rather than restated here.
	 */
	flipper: {
		mass: entry(
			1,
			"lib/vpt/flipper/flipper-data.ts @ e8a6d6f: FlipperData.updatePhysicsSettings()'s registry.getRegStringAsFloat('Player', 'FlipperPhysicsMass${idx}', 1) fallback default -- the vpx-js 'modern era' override value, transcribed since DragonWar has no per-table override-physics system of its own (AD-1) and this IS the modern band physics-tuning.md's 'Flipper strength' note says to inherit",
			'medium',
		),
		strength: entry(
			2200,
			"lib/vpt/flipper/flipper-data.ts @ e8a6d6f: FlipperPhysicsStrength${idx} fallback default 2200 (VPX internal solenoid-strength unit, dimensionless) -- the modern-era band",
			'medium',
		),
		rampUp: entry(
			2.5,
			'physics-tuning.md:28 "Coil ramp-up 2.5 -- Solenoid acceleration time -- enables the light tap. Source: VPE default via the brief addendum \u00A74" (supersedes flipper-data.ts\'s own FlipperPhysicsCoilRampUp fallback of 3.0 for this table)',
			'medium',
		),
		returnRatio: entry(
			0.058,
			'lib/vpt/flipper/flipper-data.ts @ e8a6d6f: FlipperPhysicsReturnStrength${idx} fallback default',
			'medium',
		),
		torqueDamping: entry(
			0.75,
			'lib/vpt/flipper/flipper-data.ts @ e8a6d6f: FlipperPhysicsEOSTorque${idx} fallback default',
			'medium',
		),
		torqueDampingAngleDeg: entry(
			6.0,
			'lib/vpt/flipper/flipper-data.ts @ e8a6d6f: FlipperPhysicsEOSTorqueAngle${idx} fallback default, degrees',
			'medium',
		),
		sweepDeg: entry(
			51,
			'lib/vpt/flipper/flipper-data.ts @ e8a6d6f: FlipperData field defaults startAngle 121.0 / endAngle 70.0 -> the ported ROTATION MAGNITUDE |121-70| = 51; the committed collision geometry supplies the flipper\'s absolute table-frame pose (see loader/index.ts and this story\'s Design Notes, "How the bat is derived from the committed box")',
			'medium',
		),
		endRadiusRatio: entry(
			13.0 / 21.5,
			'lib/vpt/flipper/flipper-data.ts @ e8a6d6f: FlipperData field defaults endRadius 13.0 / baseRadius 21.5 -- the ported dimensionless taper ratio; the committed collision geometry supplies the absolute base radius (half the bat\'s own width)',
			'medium',
		),
	} satisfies FlipperTuning,

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
	defaultPitchDeg: entry(6.5, 'FR-10 consequence text; AD-10 TABLE.reference.pitchDeg; addendum \u00A72 reference geometry ("pitch 6.5\u00B0... high confidence")', 'high'),
	pitchMinDeg: entry(6.0, 'FR-10 consequence text: "range 6.0-8.5\u00B0 [ASSUMPTION: bounds]"', 'medium'),
	pitchMaxDeg: entry(8.5, 'FR-10 consequence text: "range 6.0-8.5\u00B0 [ASSUMPTION: bounds]"; corroborated by addendum \u00A72 "competition range 6.5-8.5\u00B0"', 'medium'),

	/**
	 * FR-9 / AD-15 ("hop control; pitch bounds" -- the two tunables the
	 * architecture spine explicitly names): a dimensionless scale on the
	 * excess of a ball's own post-step velocity change above
	 * `src/sim/physics/hop.ts`'s authored trigger, applied ONLY while a
	 * flipper bat is ACTIVELY ROTATING (its own measured
	 * `angularVelDegPerSec`, threshold 30 deg/s) -- deliberately NOT "while a
	 * flipper coil is energised", which this story tried first and rejected:
	 * a held-but-settled bat is physically a wall, and gating on the raw coil
	 * boolean made the `roll-and-drain` golden's own multi-thousand-tick hold
	 * re-hop the ball every time it landed back on the stationary bat, an
	 * unbounded energy-adding feedback loop (see the spec's Spec Change Log).
	 * `0` is the exact identity (no hops, by
	 * construction -- `hop.ts`'s own short-circuit, not a tuning value close
	 * to zero). This story's own measurement (`test/hop-control.test.ts`,
	 * `## Verification`): at the default below, the paired stress replay's
	 * maximum ball height clears the `hopControl = 0` run's by a named
	 * margin, and no ball passes the glass. Story 1.9's feel ritual
	 * ratifies this default against the Reference machine.
	 */
	hopControl: entry(
		0.35,
		'authored: FR-9 states the two-endpoint behaviour (0 = no hops, default = occasional hops on hard hits) but no unit or magnitude; hop.ts (this story) supplies both -- measured this pass against the paired hopControl=0-vs-default stress replay (test/hop-control.test.ts) to produce a clear, glass-safe margin without every hard hit turning into a launch',
		'unverified',
	),

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

	/**
	 * Story 1.7 (AD-5, AD-15): the ported damped-harmonic cabinet oscillator's
	 * two axes (`sim/physics/cabinet/oscillator.ts`, transcribing
	 * `DampedHarmonicOscillator.h` + `CabinetPhysics.{h,cpp}`) and the
	 * keyboard-nudge impulse peak (`nudge-impulse.ts`, transcribing
	 * `KeyboardNudge.{h,cpp}`'s `CabModelKeyboardNudge`), all five figures
	 * transcribed verbatim from `vpinball/vpinball @
	 * 3f838c14bd2e37fb49a0b5aa6a9d76d421846bef` (ATTRIBUTIONS.md, the
	 * `src/sim/physics/cabinet/**` row) -- never invented (this story's Design
	 * Notes, "The tunables, and which are honestly transcribed"). No key ends
	 * in `Ms`: none of these is a duration.
	 */
	cabinet: {
		massKg: entry(113, 'vpinball/vpinball @ 3f838c14b: src/physics/cabinet/CabinetPhysics.h:24, CabinetPhysics(float mass = 113.f) default ctor argument', 'medium'),
		freqXHz: entry(9.3, 'vpinball/vpinball @ 3f838c14b: src/physics/cabinet/CabinetPhysics.cpp:12, m_cabinetOscillatorX(mass, 9.3f, 0.052f)', 'medium'),
		zetaX: entry(0.052, 'vpinball/vpinball @ 3f838c14b: src/physics/cabinet/CabinetPhysics.cpp:12, m_cabinetOscillatorX(mass, 9.3f, 0.052f)', 'medium'),
		freqYHz: entry(5.8, 'vpinball/vpinball @ 3f838c14b: src/physics/cabinet/CabinetPhysics.cpp:13, m_cabinetOscillatorY(mass, 5.8f, 0.055f)', 'medium'),
		zetaY: entry(0.055, 'vpinball/vpinball @ 3f838c14b: src/physics/cabinet/CabinetPhysics.cpp:13, m_cabinetOscillatorY(mass, 5.8f, 0.055f)', 'medium'),
		nudgePeakAccelG: entry(
			0.5,
			'vpinball/vpinball @ 3f838c14b: src/physics/cabinet/KeyboardNudge.cpp:162-164, comment "0.5g max peak accel on strong nudge" (baseScale = 0.5f * g / coreScriptStrength, with coreScriptStrength = 2.f the reference "full strength" nudge)',
			'medium',
		),
	} satisfies Readonly<Record<'massKg' | 'freqXHz' | 'zetaX' | 'freqYHz' | 'zetaY' | 'nudgePeakAccelG', TuningEntry<number>>>,

	/**
	 * Story 1.7 (AD-5, AD-15): the ONE new top-level duration this story
	 * adds -- the raised-cosine nudge-impulse length `nudge-impulse.ts`
	 * transcribes. Trap DW-34: this key MUST stay top-level (never nested
	 * inside `cabinet`), or `resolveTuning()`'s `assertNoNestedMsKeys` throws.
	 */
	nudgeImpulseMs: entry(25, 'vpinball/vpinball @ 3f838c14b: src/physics/cabinet/KeyboardNudge.cpp:169, m_impulses.emplace_back(25, ...)', 'medium'),

	/**
	 * Story 1.7 (AD-5, AD-15): the ported plumb-bob tilt pendulum
	 * (`sim/physics/cabinet/plumb-bob.ts`, transcribing `PlumbHandler.{h,cpp}`).
	 * `rodLengthM`, `cabAccelScale`, `dampingCoef0`, `dampingCoef1` and
	 * `ringBounceDamping` are transcribed verbatim. `dampingScale` and
	 * `thresholdDeg` are NOT constants in any authorized file --
	 * `PlumbHandler.cpp:18-20` reads both from `Settings::GetPlayer_
	 * PlumbDamping()` / `GetPlayer_PlumbThresholdAngle()`, a user setting with
	 * no value in any of the seven authorized files (this story's Spec Change
	 * Log, item 2) -- so both are authored here, `unverified`, chosen so a
	 * firm nudge tilts the bob past threshold and an ordinary one does not
	 * (measured against this story's own cabinet-bob test; see the spec's
	 * Verification section for the evidence). Story 1.9's feel ritual
	 * ratifies both against the Reference machine.
	 */
	tiltBob: {
		rodLengthM: entry(0.1, 'vpinball/vpinball @ 3f838c14b: src/physics/cabinet/PlumbHandler.h:30, m_plumbPoleLength = 0.10f', 'medium'),
		cabAccelScale: entry(1.0, 'vpinball/vpinball @ 3f838c14b: src/physics/cabinet/PlumbHandler.h:33, m_plumbCabAccelScale = 1.0f', 'medium'),
		dampingCoef0: entry(1.25, 'vpinball/vpinball @ 3f838c14b: src/physics/cabinet/PlumbHandler.h:45, m_dampingCoef0 = 1.25f', 'medium'),
		dampingCoef1: entry(0.75, 'vpinball/vpinball @ 3f838c14b: src/physics/cabinet/PlumbHandler.h:46, m_dampingCoef1 = 0.75f', 'medium'),
		ringBounceDamping: entry(0.8, 'vpinball/vpinball @ 3f838c14b: src/physics/cabinet/PlumbHandler.cpp:118, m_plumbOmega *= 0.8f; // magic damping factor', 'medium'),
		dampingScale: entry(
			1.0,
			"authored: upstream reads this from Settings::GetPlayer_PlumbDamping(), a user setting with no value in any of the seven authorized vpinball/vpinball files -- 1.0 (identity) is the most defensible 'no adjustment' choice against the transcribed dampingCoef0/dampingCoef1 ratio coefficients; measured during this story's implementation (see spec Verification section) to leave a single ordinary nudge's peak swing (~1.05 deg) well clear of thresholdDeg while still permitting a rapid nudge burst to cross it and decay away within a few seconds. Story 1.9's feel ritual ratifies it",
			'unverified',
		),
		thresholdDeg: entry(
			1.3,
			"authored: upstream reads this from Settings::GetPlayer_PlumbThresholdAngle(), a user setting with no value in any of the seven authorized vpinball/vpinball files -- measured during this story's implementation (see spec Verification section) so that ONE ordinary nudge_* rising edge (peak swing ~1.05 deg, measured) never crosses it, while a rapid burst of nudges (a deliberate, violent 'slam'-style burst) does. Story 1.9's feel ritual ratifies it against the Reference machine",
			'unverified',
		),
	} satisfies Readonly<Record<'rodLengthM' | 'cabAccelScale' | 'dampingCoef0' | 'dampingCoef1' | 'ringBounceDamping' | 'dampingScale' | 'thresholdDeg', TuningEntry<number>>>,
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
function isTuningEntryLike(value: unknown): value is TuningEntry<unknown> {
	return typeof value === 'object' && value !== null && 'value' in value && 'source' in value && 'confidence' in value;
}

/**
 * DW-34, "nested `…Ms` silently dropped": the top-level loop below only ever
 * inspected `Object.entries(tuning)`'s OWN keys, so a `…Ms`-suffixed key one
 * level down (inside a group like `TUNING.flipper` or a future one) was never
 * even looked at -- neither converted nor rejected, just silently inert.
 * Walks the whole tree from `tuning` (depth 0); at every depth beyond the
 * top level, a key ending in `Ms` throws naming its dotted path, because
 * `resolveTuning()` never converts anything but a TOP-level `…Ms` scalar (and
 * `switchSettleMsByClass`, handled by its own dedicated loop above/below).
 * A `TuningEntry` is a leaf -- its own `value`/`source`/`confidence` fields
 * are never descended into, so a top-level tunable actually named `…Ms` (an
 * intentional, converted one) is correctly left alone at depth 0 and never
 * misread as "nested".
 */
function assertNoNestedMsKeys(node: unknown, path: string, depth: number): void {
	if (typeof node !== 'object' || node === null) {
		return;
	}
	for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
		const fullPath = path ? `${path}.${key}` : key;
		if (depth > 0 && key.endsWith('Ms')) {
			throw new Error(
				`resolveTuning(): "${fullPath}" is a NESTED tunable ending in "Ms" (DW-34) -- resolveTuning() only ` +
				`converts TOP-level "\u2026Ms" scalars (and switchSettleMsByClass) to ticks; a nested one would be silently ` +
				`never converted. Author it in ticks directly, or lift it to the top level.`,
			);
		}
		if (isTuningEntryLike(value)) {
			continue; // a leaf: never descend into its own value/source/confidence fields
		}
		assertNoNestedMsKeys(value, fullPath, depth + 1);
	}
}

export function resolveTuning(tuning: typeof TUNING = TUNING, tickHz: number = TICK_HZ): ResolvedTuning {
	assertNoNestedMsKeys(tuning, '', 0);

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
				`(got ${value === null ? 'null' : typeof value}); every \u2026Ms tunable must carry a numeric value.`,
			);
		}
		const entryValue = value as TuningEntry<number>;
		const ticksKey = `${key.slice(0, -2)}Ticks`;
		// DW-34, "…Ticks key collision silently overwritten": a hand-authored
		// top-level `fooTicks` sharing a name with this derived key must throw
		// naming the collision, not be silently clobbered by the spread below.
		if (Object.prototype.hasOwnProperty.call(tuning, ticksKey)) {
			throw new Error(
				`resolveTuning(): the derived key "${ticksKey}" (from "${key}") collides with an existing top-level ` +
				`tunable of the same name (DW-34) -- rename one of them.`,
			);
		}
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

	// DW-34, "unfrozen resolveTuning() result": deep-frozen exactly like
	// `TUNING` itself (`deepFreeze()` short-circuits on the already-frozen
	// pieces spread in from `tuning`, so this only does new work for
	// `scalarTicks`/`switchSettleTicksByClass`, freshly built above).
	return deepFreeze({
		...tuning,
		...(scalarTicks as ResolvedScalarTicks),
		switchSettleTicksByClass: switchSettleTicksByClass as Readonly<Record<SettleClass, TuningEntry<number>>>,
	}) as ResolvedTuning;
}

/**
 * AD-5: "the manual plunge maps `s_plunger` hold ticks through
 * `plungerSpeedByHoldMs` in `tuning.ts`." A clamped linear interpolation from
 * `plungerMinSpeedScale` to `plungerMaxSpeedScale` across
 * `[plungerMinHoldTicks, plungerMaxHoldTicks]`, scaling
 * `autolaunchSpeedMmPerS` -- see this story's Design Notes, "Why the
 * plunger's full-strength speed is `autolaunchSpeedMmPerS`" and
 * "`plungerSpeedByHoldMs` is a function in `tuning.ts`, not a `TUNING` key"
 * for why this is a function here rather than a fifth scalar tunable.
 *
 * A function, not a `TUNING` key (Design Notes): `resolveTuning()` tests
 * `key.endsWith('Ms')` and then requires a `TuningEntry<number>`, so a
 * function value under a `…Ms`-suffixed name would throw at load; exporting
 * it as `(holdTicks, tuning) => number` keeps the four scalars it reads as
 * the tunables a dev panel edits, and never trips that rule at all.
 */
export function plungerSpeedByHoldMs(holdTicks: number, tuning: ResolvedTuning): number {
	const minTicks = tuning.plungerMinHoldTicks.value;
	const maxTicks = tuning.plungerMaxHoldTicks.value;
	const minScale = tuning.plungerMinSpeedScale.value;
	const maxScale = tuning.plungerMaxSpeedScale.value;
	const fullSpeed = tuning.autolaunchSpeedMmPerS.value;

	// Guard a zero-width hold window (I/O matrix: "plungerMinHoldTicks ===
	// plungerMaxHoldTicks yields the max scale rather than dividing by zero"):
	// with no interval to interpolate across, any nonzero hold is already "at
	// or past" the single boundary point, so the max (full-strength) scale is
	// the only value consistent with both clamps below collapsing to one point.
	if (maxTicks <= minTicks) {
		return fullSpeed * maxScale;
	}

	const t = clampNumber((holdTicks - minTicks) / (maxTicks - minTicks), 0, 1);
	const scale = minScale + t * (maxScale - minScale);
	return fullSpeed * scale;
}

/** Local, so `sim/table/**` (AD-1: no upward import) never reaches into `sim/physics/math/functions.ts` for one clamp. */
function clampNumber(x: number, min: number, max: number): number {
	if (x < min) {
		return min;
	}
	if (x > max) {
		return max;
	}
	return x;
}
