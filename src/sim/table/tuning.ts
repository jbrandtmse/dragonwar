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

import { deepFreeze, type Confidence, type SettleClass } from './dragonwar';
import { TICK_HZ } from '../contracts/time';

// Story 2.1b (task 12a): `Confidence` moved DOWN into `dragonwar.ts`, beside
// `SettleClass`, so `TABLE.authoredCounts` can carry the same
// `{ value, source, confidence }` shape `TuningEntry<T>` does. This file
// already imports FROM `dragonwar.ts` (for `deepFreeze`/`SettleClass`), so
// declaring `Confidence` here and importing it the OTHER way (dragonwar.ts
// -> tuning.ts) would be a cycle -- re-exporting the moved type here instead
// keeps the two existing call sites (`src/host/dev/tuning-panel.ts:22`,
// `test/tuning.test.ts:13`) importing it from `./tuning` unchanged.
export type { Confidence };

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
		// Story 2.2 (AD-11, AD-15, AC 4): the three material names the
		// geometry has always implied but the table never named -- every
		// `col_` body but the two flipper faces shared `default` until now
		// (101 nodes), even though a rubber band, a rubber post and a bumper
		// skirt are three physically distinct surfaces. All three are
		// AUTHORED (no do-not-invent artifact states any of the four VPX
		// parameters for a specific rubber-band/rubber-post/bumper material),
		// so every entry ships `confidence: 'unverified'` -- `scatter: 0` on
		// every one, matching AD-3's "scatter is 0 on every material by
		// default" and covered for free by `test/ac6-scatter-and-prng.test.ts`'s
		// own `Object.keys(TUNING.materials)` sweep.
		rubber_band: {
			// Kept at the VPX per-object default's own figures, DELIBERATELY --
			// see this story's Spec Change Log. An earlier pass authored this
			// material closer to `flipper_rubber`'s own energetic figures
			// (elasticity 0.85), reasoning that a slingshot's rubber ought to
			// read as livelier than bare `default` even passively. Measured
			// consequence: `col_sling_l/r` sit in the flight path of a large
			// fraction of the reachability/routing corpus's own witness
			// trajectories, and a passive elasticity change that large
			// reroutes many of them within a few contacts -- several DRAGON-
			// bank witnesses and both Top-lane routing cases regressed
			// (`pnpm check:reachability` and `test/shot-routing.test.ts`),
			// which this story's own Block If forbids ("never edit an
			// unreachable verdict ... to reach green"). The device's real
			// energy source is the AUTHORED kick impulse
			// (`TUNING.hardware.slingshotForce`, applied only while enabled and
			// above threshold), never the passive collision response -- AC 3's
			// own "measurably slower [rebound], not passive-vs-different-
			// material" compares ENABLED against DISABLED on the SAME
			// material, so naming this material distinctly from `default`
			// satisfies AC 4 without needing its own four numbers to differ.
			elasticity: entry(0.3, "authored: matches materials.default -- an earlier, livelier figure (0.85) measurably rerouted multiple DRAGON-bank reachability witnesses and both Top-lane routing cases (this story's Spec Change Log); the sling's real energy source is the authored kick impulse (TUNING.hardware.slingshotForce), not the passive collision response, so this material is named for AC 4 without changing established trajectories", 'unverified'),
			elasticityFalloff: entry(0, 'authored: matches materials.default -- see this entry\'s own elasticity note', 'unverified'),
			friction: entry(0.3, 'authored: matches materials.default -- no artifact names a slingshot-band-specific friction', 'unverified'),
			scatter: entry(0, 'authored: AD-3 requires scatter 0 on every material by default', 'unverified'),
		},
		// Every col_post_* node (45 of them, Code Map "Current census") -- a
		// passive rubber post, distinct from the sling's own energised band
		// and from bare `default` plastic/wood/metal. No artifact names a
		// rubber-post elasticity/friction pair, so this is authored at the
		// VPX per-object default's own figures (the pre-Story-2.2 behaviour
		// every one of these 45 nodes already had under `default`) --
		// naming the material changes WHAT the body is tagged, not how it
		// currently behaves, the intentionally conservative choice for a
		// body this story does not otherwise touch.
		rubber_post: {
			elasticity: entry(0.3, "authored: no artifact names a rubber-post elasticity -- kept at the VPX per-object default (materials.default), the same figure every col_post_* node already carried under 'default' before this story named the material", 'unverified'),
			elasticityFalloff: entry(0, 'authored: matches materials.default -- no artifact names a rubber-post-specific falloff', 'unverified'),
			friction: entry(0.3, 'authored: matches materials.default -- no artifact names a rubber-post-specific friction', 'unverified'),
			scatter: entry(0, 'authored: AD-3 requires scatter 0 on every material by default', 'unverified'),
		},
		// The three col_pop_* skirts (sim/physics/pops.ts supplies the
		// actual kick as an authored impulse, never a collision-response
		// parameter): livelier than a rubber post's passive elasticity, short
		// of the sling's own energised band, matching the "bumper" `surface`
		// these nodes already carry today.
		bumper: {
			// Kept at the VPX per-object default's own figures, the same
			// reasoning `rubber_band` above records: a livelier passive
			// elasticity (an earlier pass tried 0.5) measurably rerouted
			// multiple reachability witnesses that pass near the pop
			// cluster. The pop's real energy source is the AUTHORED radial
			// kick impulse (`TUNING.hardware.popKickMmPerS`,
			// `sim/physics/pops.ts`), fired only on a genuine skirt-edge
			// make with its own coil enabled -- never the passive collision
			// response, which stays identical to bare `default` rubber.
			elasticity: entry(0.3, "authored: matches materials.default -- an earlier, livelier figure (0.5) measurably rerouted multiple reachability witnesses near the pop cluster (this story's Spec Change Log); the pop's real energy source is the authored kick impulse (TUNING.hardware.popKickMmPerS), not the passive collision response, so this material is named for AC 4 without changing established trajectories", 'unverified'),
			elasticityFalloff: entry(0, 'authored: matches materials.default -- see this entry\'s own elasticity note', 'unverified'),
			friction: entry(0.3, 'authored: matches materials.default -- no artifact names a bumper-specific friction', 'unverified'),
			scatter: entry(0, 'authored: AD-3 requires scatter 0 on every material by default', 'unverified'),
		},
	} satisfies Readonly<Record<'default' | 'flipper_rubber' | 'rubber_band' | 'rubber_post' | 'bumper', PhysMaterialTuning>>,

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
	 * Story 2.4 (AD-19, task 1): the three shot-sequence tick windows
	 * `TABLE.shots[*].windowMs` points at. PRD FR-26/FR-27 and AD-19/AR-19
	 * state the Loop, the Ramp and the Lock lane as MECHANISMS -- none states
	 * a window duration, and `rampWindowMs`/`lockCaptureWindowMs` are not
	 * named by any artifact at all -- so every one of the three below is
	 * derived from a real driven shot at THIS tree (Block If: "the window
	 * tunable must be measured, not guessed"), never authored from nothing.
	 * Top-level scalars, never nested under `hardware` (DW-34,
	 * `assertNoNestedMsKeys()` throws on a nested `...Ms` key).
	 */
	loopWindowMs: entry(
		600,
		'authored: PRD FR-26/FR-27 and AD-19 name the Loop as a mechanism (an ordered s_loop_*_in -> s_loop_*_out pair) but no window duration -- measured 2026-09-05 at this tree by driving the Left Loop (createMachine(), served ball repositioned to (31, 415, 13.5), straight-line launch at dirDeg 0) across a speed sweep: s_loop_l_in-close to s_loop_l_out-close intervals of 223 ticks at 2200 mm/s, 303 at 1800, 403 at 1500, and 452 ticks at 1400 mm/s -- the SLOWEST speed that still produced a clean single-pass orbit (s_loop_l_in and s_loop_l_out each closing exactly once before the next switch); below 1400 mm/s (1350, 1300, 1250 mm/s all measured) the ball no longer completes a single clean pass and instead rattles between the two switches over several thousand ticks, which is not "a made Loop" by any reading. 600 ms sits 148 ticks (33%) above the slowest genuine completion measured (452 ticks); TABLE.shots[*].entryExclusive being false for both Loops (task 2) means this window governs only whether a genuine orbit reads as shot_<side>_loop_made, never a spurious _broken (DW-133).',
		'unverified',
	),
	rampWindowMs: entry(
		800,
		'authored: no artifact names this figure at all (not even the two-endpoint form FR-16 gives slamNudgeWindowMs above) -- measured 2026-09-05 at this tree by driving the Ramp (served ball repositioned to (315, 470, 13.5), the re-solved DW-137 mouth, straight-line launch at dirDeg 0) across a speed sweep: s_ramp_enter-close to s_ramp_made-close intervals of 142 ticks at 2400 mm/s down to 656 ticks at 1000 mm/s -- the SLOWEST speed that still closed s_ramp_made at all; at 900 mm/s and below (900, 800, 700, 600, 500 mm/s all measured) the ball never reaches s_ramp_made and instead falls back and re-closes s_ramp_enter later, a rejected shot (shot_ramp_broken territory, not a make). 800 ms sits 144 ticks (22%) above the slowest genuine completion measured (656 ticks).',
		'unverified',
	),
	lockCaptureWindowMs: entry(
		180,
		"authored: DW-166 -- no artifact names this figure. Measured 2026-09-05 at this tree by driving the Lock lane on-axis from (170, 440, 13.5) (the sw_lock_lane / sw_lock_1..3 corridor's own centreline, x = (150+190)/2): at ~800 mm/s (a capturing shot) s_lock_lane closes at tick 378 and the first bd_lock slot (s_lock_1) closes at tick 512 -- a 134-tick capture latency. At the measured non-capturing band's own ~575 mm/s (epic-2-context.md: \"measured threshold 550-600 mm/s\"), s_lock_lane closes at tick 415 and s_lock_1 does not close until tick 696 -- a 281-tick gap, the ball having rattled back down the corridor and only settling into the slot much later than any real capture would read as resolved. 180 ms sits 46 ticks (34%) above the fast, genuine capture (134 ticks) and 101 ticks (56% of the gap) below the slow shot's own late, non-credited settle (281 ticks) -- inside that gap, DW-166's discriminating condition (this story's Design Notes) correctly reads the fast shot as captured and the slow one as an unresolved closure, emitting nothing for it, exactly as AC 6 requires.",
		'unverified',
	),

	/**
	 * Story 2.9 (AD-18): the three ball-save durations `machine.ballSave`
	 * resolves through `shotWindowTicks('<key>Ms', tuning)`. PRD FR-19 names
	 * the mechanism (enable / timer-start / hurry-up / grace) but states a
	 * duration for only one of the three -- see each entry's own `source`.
	 * Top-level scalars, never nested under `hardware` (DW-34,
	 * `assertNoNestedMsKeys()` throws on a nested `...Ms` key).
	 */
	ballSaveMs: entry(
		8000,
		'authored: PRD FR-19 names the ball-save window as a mechanism (enable at ball start, timer starts at the plunge) but states no duration for it -- 8 s is a common early-ball-save figure on real machines and is authored here pending Epic 3\'s playtest freeze, never transcribed from any artifact',
		'unverified',
	),
	ballSaveHurryUpMs: entry(
		2000,
		'authored: PRD FR-19 names a hurry-up (fast-blink) phase before the window closes but states no duration for it -- authored, adjustable until Epic 3\'s playtest freeze',
		'unverified',
	),
	ballSaveGraceMs: entry(
		2000,
		'PRD FR-19 [ASSUMPTION]: "a drain inside the Grace period (default 2 s [ASSUMPTION]) is still saved" -- transcribed directly from that named default, not authored here',
		'unverified',
	),

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
	 * Story 2.11 (`DW-36`, AD-15): the tilt-warning count `GameAdjustments.tiltWarnings`
	 * layers a table default for (AD-14) -- the one place AD-15's own Rule
	 * names it, "sim/table/tuning.ts". No unit suffix: a count, never a
	 * duration, following `skillShotAward`'s own shape above, so it derives
	 * no `…Ticks` sibling.
	 */
	tiltWarnings: entry(1, "PRD FR-14: 'up to the Settings count (default 1 [ASSUMPTION: default; the research gives only the Competition preset value of 2])'", 'unverified'),

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
	 * Story 2.1d Phase 5 (review finding, AD-15): the tick-based backstop on
	 * `bd_lock`'s own per-ball ejection exemption (`justEjected` /
	 * `buildClearBeyond()`, `src/sim/physics/devices.ts`) used to be a bare
	 * `export const EJECT_EXEMPTION_TIMEOUT_TICKS = 600` in that file --
	 * every OTHER duration in this codebase is authored in ms here and
	 * converted once by `resolveTuning()` (AD-3, AD-15's own "one file, with
	 * provenance" Rule), so a bare tick constant's wall-clock meaning would
	 * silently change if `TICK_HZ` (explicitly provisional) ever moved, and
	 * nothing would fail to say so.
	 *
	 * [CORRECTED, code review 2026-09-04 (build-auto review pass,
	 * blind-hunter finding): this comment previously justified 600 as a
	 * generous multiple of a "~135-tick normal clear" (eject at tick 344,
	 * clear/re-capture-eligible by tick 479) measured BEFORE rework
	 * iteration 2's corridor-seal redesign. That trace no longer describes
	 * the shipped mechanism: `DRAGON_MOUTH_Y_MM` now sits south of the
	 * whole Lock-lane corridor (460, versus every `sw_lock_*` zone's own
	 * y >= 544), so `buildClearBeyond()`'s one-directional threshold on
	 * `bd_lock`'s -y eject axis is satisfied by the ball's OWN SPAWN
	 * position -- the exemption clears essentially immediately (the tick
	 * after eject, not 135 ticks later), regardless of eject speed. The
	 * 600 ms backstop is unchanged and, if anything, now MORE generous
	 * relative to the normal case than when it was set: it exists purely
	 * to bound the pathological case (a deflected/stalled/reversed ball
	 * that never satisfies `clearBeyond()`), which this geometry change
	 * does not affect -- see `test/lock-device-behaviour.test.ts`'s own
	 * "the just-ejected exemption times out" case for that scenario,
	 * exercised directly.]
	 */
	lockEjectExemptionTimeoutMs: entry(
		600,
		"authored: a conservative backstop against the per-ball ejection exemption never clearing (deflection/stall/reversal) -- see this entry's own doc comment for the measured ~135-tick normal-case clear time this is a generous multiple of",
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
	 * Story 2.1a (AD-15, AC 1): the drain triangle's three do-not-invent
	 * figures -- none is on the PRD addendum's do-not-invent list by name,
	 * but each is a geometric figure this story authors rather than
	 * transcribes from a verified source, so every one ships `unverified`
	 * per this story's own "Always" rule. `…Mm`, not `…Ms` -- these are
	 * millimetre lengths, not durations, so none trips `resolveTuning()`'s
	 * `…Ms` -> `…Ticks` conversion.
	 */
	flipperTipGapMm: entry(
		40.65,
		'authored: derived arithmetic, not a second invented figure -- the gap between the right bat\'s tip (col_flipper_r.bboxMm.min.x = 277.525 mm) and the left bat\'s tip (col_flipper_l.bboxMm.max.x = 236.875 mm) at end-of-stroke, both a direct consequence of DW-78\'s reconciliation (each box moved outward by baseRadius = 12.5 mm around its own unchanged pivot). No planning artifact states a tip gap; the sourced 9.5-12.7 mm figure (digests/geometry-r1-1.md:91,204, low confidence) is narrower than the 26.99 mm reference ball and therefore unusable as authored truth (Code Map, "Read-only evidence")',
		'unverified',
	),
	outlaneWidthLeftMm: entry(
		34.9,
		'authored: no sourced figure carries a left/right split -- the closest artifact is geometry-r2-1.md:16,78\'s 1-3/8 in = 34.9 mm inlane/outlane width (low confidence, no side named), adopted here as the LEFT outlane\'s clear width, measured from col_wall_left\'s interior face (table x = 0) to col_guide_divider_l\'s outlane-facing face (tools/make-placeholder-blend.py)',
		'unverified',
	),
	outlaneWidthRightMm: entry(
		34.9,
		'authored: the same geometry-r2-1.md low-confidence 1-3/8 in = 34.9 mm figure as outlaneWidthLeftMm, adopted symmetrically for the RIGHT outlane -- but measured from col_wall_lane\'s main-field face (table x = LANE_X0_MM = 468.4 mm), not the true right perimeter wall, because the plunger lane already claims the space between col_wall_lane and that wall (tools/make-placeholder-blend.py, add_drain_triangle_side())',
		'unverified',
	),

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

	/**
	 * Story 2.2 (AD-5, AD-15): the two hardware-rule kicks' own tunables --
	 * exactly the three paths this story's spec names verbatim (its own
	 * `## Verification` mutations name them by path). No key ends in `Ms`
	 * (`assertNoNestedMsKeys()` above): `slingshotThresholdMmPerS` is a speed,
	 * not a duration, which is why it is spelled `...MmPerS` rather than
	 * tripping the tick-conversion rule.
	 *
	 * `slingshotForce` is in the ported `LineSegSlingshot`'s own VP velocity
	 * units (`sim/physics/line-seg-slingshot.ts`'s `public force: number`,
	 * upstream's own commented-out `//-80` hint) -- NEGATIVE, so the scaled
	 * per-tick profile (0..0.5 in magnitude) drives `ball.hit.vel.sub(hitNormal
	 * * force)` to ADD speed along the outward `hitNormal` rather than
	 * subtract it (the port's own sign convention: a positive `force` would
	 * pull the ball INTO the band instead of kicking it away). No planning
	 * artifact states a slingshot kick strength, so upstream's own commented
	 * reference value is the authored starting point, measured against AC 1's
	 * own outgoing-vs-incoming speed assertion during this story's
	 * implementation.
	 */
	hardware: {
		slingshotForce: entry(
			-80,
			"authored: sim/physics/line-seg-slingshot.ts's own commented-out `//-80` hint (vpx-js @ e8a6d6f, lib/physics/line-seg-slingshot.ts) is the only reference figure anywhere in this tree for the ported model's own force scale -- no planning artifact states a slingshot kick strength; taken as the starting point and measured against this story's own AC 1 (outgoing speed exceeds incoming) rather than invented from nothing",
			'unverified',
		),
		slingshotThresholdMmPerS: entry(
			500,
			'authored: no planning artifact states a slingshot contact-speed threshold below which the band should NOT fire -- measured during this story\'s implementation so a flipper-band-speed strike clears it and a slow graze does not (AC 1 vs the I/O matrix\'s "Sling graze, below threshold" row)',
			'unverified',
		),
		popKickMmPerS: entry(
			200,
			"authored: no planning artifact states a pop-bumper kick strength. [CORRECTED, Story 2.3, DW-160: the three claims this string previously made -- a ~180 mm/s floor, a ~220 mm/s ceiling from Top-lane cross-pop bouncing, and 126.8 mm of trailing progress at 200 as the representative escape -- were re-swept directly against the DW-148 column ((130, 850), test/pop-bumper.test.ts's own dw148TrailingProgressMm(v)) and only the last one reproduces.] There is NO floor beyond \"nonzero\": every positive kick tried down to 0.5 mm/s clears the strand (progress ~309 mm); only 0 mm/s (no kick) reproduces the original permanent rest. The landscape above that is NOT a clean one-sided window -- it is chaotic (this is a ball descending onto a near-symmetric octagon apex, POP_KICK_TIE_BREAK_MM only resolves the exact on-axis tie): a fine sweep at 1 mm/s resolution through 155-221 mm/s finds narrow re-strand dips interleaved with clearing bands (e.g. 164-169, 175, 178, 185-195, 197-198 mm/s each re-strand at a NEW equilibrium near (93, 840) -- just outside sw_pop_1's own north edge -- while 196, 199-202 and 205-220 clear, some robustly (~309 mm, e.g. 215-220) and some marginally (~50-130 mm, e.g. 200's own 126.8 mm)); a clean re-strand band then holds from 221 mm/s (measured 1.3 mm progress) through at least 230, with one anomalous escape at 245 before re-stranding again by 260. The ORIGINAL ceiling reasoning (Top-lane cross-pop-bouncing tick-budget exhaustion) is real but starts far higher (~425-600 mm/s per lane) than previously claimed and is not what bounds the safe range from above -- the 221 mm/s re-strand is. 200 sits inside a locally-clearing pocket (199-202 all clear) but its nearest re-strand neighbour is only 2 mm/s away at 198, not the 21 mm/s the far (221 mm/s) cliff alone would suggest -- the true margin is narrower than a single-sided reading implies, a property of the chaos itself rather than of this particular value: no nearby integer value sits in a wider uniformly-clearing pocket without moving toward the robust-but-still-cliff-bounded 215-220 band, which trades a marginal-but-real escape for a razor-thin (1 mm/s) upper margin instead. 200 is kept: it reproduces the same 126.8 mm escape this constant has always shipped with, that escape is measured, not merely inferred from the far cliff, and Story 2.3's own re-record already carries this correction.",
			'unverified',
		),

		/**
		 * Story 2.3 (AD-6's 2026-09-03 amendment, AD-15): the spinner's own
		 * spin-up gain -- degrees per second of spinner angular speed added
		 * per mm/s of a ball's own entry speed through `sw_spinner`, applied
		 * once per genuine zone entry (`sim/physics/spinner.ts`). No planning
		 * artifact states a gain (AD-6 only states the mechanism: "imparts
		 * rotation proportional to entry speed"), so this is authored and
		 * measured against this story's own AC 3 -- at the Left Loop's own
		 * measured 1789.8 mm/s ascending-column entry speed this produces an
		 * initial spin of ~894.9 deg/s, which this story's own decay (below)
		 * resolves into roughly 5 revolutions before returning to rest,
		 * comfortably above AC 3's "more than one" floor and giving AC 3b's
		 * speed sweep (~900-2200 mm/s) room to separate on closure count.
		 */
		spinnerGainDegPerSPerMmPerS: entry(
			0.5,
			"authored: AD-6 states the mechanism (rotation proportional to entry speed) but no gain -- chosen so the Left Loop's own measured 1789.8 mm/s entry speed (this story's Design Notes) produces several revolutions before the decay below returns the spinner to rest, measured against this story's own AC 3/AC 3b tests",
			'unverified',
		),
		/**
		 * Story 2.3 (AD-3, AD-6): the spinner's own per-tick decay, spelled as
		 * a plain multiplicative ratio -- deliberately NOT a millisecond
		 * duration (`assertNoNestedMsKeys()`, DW-34, throws on any nested
		 * `...Ms` key below `hardware`'s own top level, and a decay HALF-LIFE
		 * would need exactly that). Applied once per tick to the spinner's own
		 * angular speed (`angularSpeedDegPerS *= spinnerDecayPerTick` before
		 * that tick's angle accumulates), so it is tick-native by construction
		 * and needs no `...Ms` -> `...Ticks` conversion at all. No planning
		 * artifact states a decay rate; authored and measured against AC 3's
		 * "the interval between consecutive closures strictly increases ...
		 * speed returns to 0" -- at the Left Loop's own 1789.8 mm/s entry
		 * speed (~895 deg/s initial) this decays to the spinner's own
		 * at-rest floor (1 deg/s, `sim/physics/spinner.ts`'s own authored
		 * constant) in ~13,600 ticks, comfortably inside this story's own
		 * test budgets.
		 */
		spinnerDecayPerTick: entry(
			0.9995,
			"authored: AD-6 states the spinner \"closes once per revolution until it decays\" but no rate -- a multiplicative per-tick ratio (never a millisecond duration, DW-34) chosen so the Left Loop's own measured entry speed produces a strictly-increasing inter-closure interval and a finite return to rest within this story's own test tick budgets, measured against AC 3",
			'unverified',
		),
	} satisfies Readonly<
		Record<'slingshotForce' | 'slingshotThresholdMmPerS' | 'popKickMmPerS' | 'spinnerGainDegPerSPerMmPerS' | 'spinnerDecayPerTick', TuningEntry<number>>
	>,

	/**
	 * Story 2.7 (AD-3, AD-15): the skill shot's fixed award -- the first
	 * scoring value in this file. No unit suffix (a raw score point, never a
	 * duration -- must not end in `Ms`, `assertNoNestedMsKeys`/
	 * `sim-no-literal-ms`).
	 */
	skillShotAward: entry(
		25000,
		'authored: PRD FR-18 states the mechanism (the Skill shot "awards a fixed value plus lighting a letter") and marks the figure itself "[ASSUMPTION: award]"; the PRD review rubric records that no planning artifact states any scoring value, and the spine defers every scoring value to the post-playtest freeze (Story 3.11). No artifact states this figure. It is the first scoring value in the game, so it sets the scale rather than fitting one -- change it by playtest, not by argument',
		'unverified',
	),

	/**
	 * Story 2.10 (AD-3, AD-15): how often the end-of-ball bonus count-up
	 * emits its next `bonus_count_step` -- a top-level scalar (never nested,
	 * `assertNoNestedMsKeys()`/DW-34), converted once by `resolveTuning()`
	 * to `bonusCountTicks` (`shotWindowTicks('bonusCountMs', tuning)`, the
	 * `ballSaveMs` precedent).
	 */
	bonusCountMs: entry(
		400,
		'authored: PRD FR-20 states the count-up mechanism ("categories count up, then the multiplier is applied") but no pace for it. Constrained, not guessed: at most BONUS_CATEGORIES.length (3) nonzero-category steps plus one final step means at most 4 steps x 400 ms = 1600 ms, comfortably inside the Backglass\'s existing 3000 ms ball_ended hold (BALL_ENDED_HOLD_TICKS, presentation/backglass/frame.ts) with room for the screen to settle before the hold releases -- adjustable until Epic 3\'s playtest freeze (Story 3.11)',
		'unverified',
	),

	/**
	 * Story 2.10 (AD-3, AD-15, PRD FR-20): the three per-category bonus
	 * scoring values `sim/rules/bonus.ts`'s `bonusTotal()` sums and scales
	 * by `multiplier`. No unit suffix (raw score points, never durations --
	 * must not end in `Ms`, `assertNoNestedMsKeys`/`sim-no-literal-ms`),
	 * following `skillShotAward` above -- the only other scoring value in
	 * the file. No planning artifact states any of the three figures; all
	 * three are authored on the SAME scale `skillShotAward` already set
	 * (25000, the game's first scoring value), rather than fitting one of
	 * their own, and are adjustable until Epic 3's playtest freeze (Story
	 * 3.11) exactly as `skillShotAward` is.
	 */
	bonusLetterValue: entry(
		5000,
		'authored: PRD FR-20 names DRAGON letters as a bonus category but states no per-letter value. Set to 1/5 of skillShotAward\'s own 25000 -- a bonus letter is a lesser, cumulative credit toward the same "collect DRAGON" goal the skill shot\'s own letter-lighting effect serves, not a standalone award on that scale',
		'unverified',
	),
	bonusLoopValue: entry(
		10000,
		'authored: PRD FR-20 names the Loops as a bonus category but states no per-loop value. Set to 2x bonusLetterValue -- a completed Loop shot is a harder, more deliberate shot than an incidental DRAGON-bank hit, so it is weighted above a single letter without approaching skillShotAward\'s own 25000',
		'unverified',
	),
	bonusStrikeValue: entry(
		25000,
		'authored: PRD FR-20 names Strikes as a bonus category but states no per-strike value; the War mode that produces one does not exist until Epic 3 (Story 3.7), so this figure has no producer to measure against yet. Set equal to skillShotAward\'s own 25000 as the highest-value category, pending Epic 3\'s own War design and this story\'s shared Story 3.11 playtest freeze',
		'unverified',
	),

	/**
	 * Story 2.8 (AD-12): the live cap on simultaneously-enabled dynamic
	 * insert lights `presentation/lighting/lamp-driver.ts`'s `syncLamps()`
	 * enforces, counting ENABLED lights only. A dimensionless count, never a
	 * duration -- must not end in `Ms` (`assertNoNestedMsKeys`/
	 * `sim-no-literal-ms`), so it and the derived-`Ticks` machinery never
	 * apply to it.
	 */
	liveLightBudget: entry(
		20,
		'<AD-12: "the live dynamic-light budget on the floor is 20 per frame [ASSUMPTION]", verified 2026-08-26 at ~23 Babylon clustered-forward lights per WebGL2 batch, re-verify 2026-09-26. No artifact states a measured figure>',
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
	// `TUNING` itself. Story 2.1a (DW-33): `deepFreeze()` no longer skips a
	// subtree merely because its root arrives already frozen -- freezing is
	// unconditional now, and only a genuine cycle (its own `visited`
	// `WeakSet`) is ever skipped -- so this call re-walks the already-frozen
	// pieces spread in from `tuning` too (harmless: `Object.freeze()` is
	// idempotent), not only the freshly built `scalarTicks`/
	// `switchSettleTicksByClass`.
	return deepFreeze({
		...tuning,
		...(scalarTicks as ResolvedScalarTicks),
		switchSettleTicksByClass: switchSettleTicksByClass as Readonly<Record<SettleClass, TuningEntry<number>>>,
	}) as ResolvedTuning;
}

/**
 * Story 2.4 (task 1): `TABLE.shots[*].windowMs`'s declared key name -- one of
 * the real top-level `…Ms` scalar tunables (`'loopWindowMs'`, `'rampWindowMs'`,
 * `'lockCaptureWindowMs'`, or any future one), never a bare `string`, so a
 * typo in `TABLE.shots` is a `pnpm typecheck` failure rather than a runtime
 * `undefined`.
 */
export type ShotWindowMsKey = TuningMsKey<typeof TUNING>;

/**
 * Story 2.4 (task 1, AD-3's tuning.ts exemption): resolves any top-level
 * `…Ms` tunable key (e.g. `'loopWindowMs'`) to its `resolveTuning()`-derived
 * tick count. The ONE function a caller under `sim/rules/**` may use to
 * reach a tick count from an `…Ms` key -- AD-3 confines
 * ms->tick arithmetic and the `…Ms` -> `…Ticks` naming convention to this
 * file; without this helper, a shot-window comparison in `sim/rules/**`
 * would have to either name `TICK_HZ` itself (banned everywhere but here and
 * `contracts/time.ts`) or hand-derive the `…Ticks` sibling name, both of
 * which `pnpm lint:boundaries`'s tick/ms rule already forbids outside this
 * file.
 *
 * [Story 2.9 code review: the IDENTIFIER is historical and now narrower than
 * the helper. It was introduced for `TABLE.shots[*].windowMs` keys read from
 * `sim/rules/devices/**`, but Story 2.4 itself already used it for the
 * non-shot `lockCaptureWindowMs`, and Story 2.9 added three more non-shot
 * call sites -- `ball-controller.ts` (`ballSaveMs`, `ballSaveGraceMs`) and
 * `sim/loop/index.ts` (`ballSaveHurryUpMs`). It is and always was generic
 * over any top-level `…Ms` key (`ShotWindowMsKey` = `TuningMsKey<typeof
 * TUNING>`, not a shots-only union); only the name still says "shot".]
 */
export function shotWindowTicks(windowMsKey: ShotWindowMsKey, tuning: ResolvedTuning): number {
	const ticksKey = `${windowMsKey.slice(0, -2)}Ticks`;
	const resolved = (tuning as unknown as Record<string, TuningEntry<number>>)[ticksKey];
	if (!resolved || typeof resolved.value !== 'number') {
		throw new Error(`shotWindowTicks(): "${windowMsKey}" has no resolved "${ticksKey}" entry on this tuning set`);
	}
	return resolved.value;
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
