// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.3's fifth acceptance criterion: every tunable carries a
// unit-suffixed name, a value, a source and a confidence; every figure drawn
// from the PRD addendum's do-not-invent list, or authored by this story
// rather than transcribed, is marked `unverified` with the authoring stated
// in `source`. And the "Tunable conversion" I/O-matrix row: resolveTuning()
// produces a `…Ticks` counterpart for every `…Ms` entry using TICK_HZ,
// preserving source/confidence.

import { describe, expect, it } from 'vitest';
import { TICK_HZ } from '../src/sim/contracts/time';
import { plungerSpeedByHoldMs, resolveTuning, TUNING, type Confidence, type TuningEntry } from '../src/sim/table/tuning';

function isTuningEntry(value: unknown): value is TuningEntry<unknown> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'value' in value &&
		'source' in value &&
		'confidence' in value
	);
}

describe('TUNING -- every entry carries value, source and confidence', () => {
	it('every top-level scalar entry is a TuningEntry', () => {
		const scalarKeys = [
			'defaultPitchDeg',
			'pitchMinDeg',
			'pitchMaxDeg',
			'hopControl',
			'slamNudgesPerWindow',
			'slamNudgeWindowMs',
			'tiltWarningSpacingMs',
			'tiltSettleMs',
			'plungerMinHoldMs',
			'plungerMaxHoldMs',
			'plungerMinSpeedScale',
			'plungerMaxSpeedScale',
			'troughEjectSpeedMmPerS',
			'autolaunchSpeedMmPerS',
			'nudgeImpulseMs',
		] as const;
		for (const key of scalarKeys) {
			const entry = TUNING[key];
			expect(isTuningEntry(entry), `TUNING.${key} is not a TuningEntry`).toBe(true);
			expect(typeof entry.source).toBe('string');
			expect(entry.source.length).toBeGreaterThan(0);
			const validConfidences: Confidence[] = ['high', 'medium', 'low', 'unverified'];
			expect(validConfidences).toContain(entry.confidence);
		}
	});

	it('every switchSettleMsByClass entry is a TuningEntry, one per SettleClass', () => {
		const classes = ['rollover', 'standup', 'drop_target', 'bumper_skirt', 'tilt_bob', 'button', 'slam'] as const;
		for (const settleClass of classes) {
			const entry = TUNING.switchSettleMsByClass[settleClass];
			expect(isTuningEntry(entry), `switchSettleMsByClass.${settleClass} is not a TuningEntry`).toBe(true);
		}
	});

	it("AD-2's five default classes transcribe the spine's own numbers exactly", () => {
		expect(TUNING.switchSettleMsByClass.rollover.value).toBe(0);
		expect(TUNING.switchSettleMsByClass.standup.value).toBe(8);
		expect(TUNING.switchSettleMsByClass.drop_target.value).toBe(20);
		expect(TUNING.switchSettleMsByClass.bumper_skirt.value).toBe(2);
		expect(TUNING.switchSettleMsByClass.tilt_bob.value).toBe(0);
	});

	it('every materials.* entry (both named materials) is a TuningEntry', () => {
		for (const material of ['default', 'flipper_rubber'] as const) {
			for (const param of ['elasticity', 'elasticityFalloff', 'friction', 'scatter'] as const) {
				expect(isTuningEntry(TUNING.materials[material][param])).toBe(true);
			}
		}
	});

	it("VPX per-object defaults are 0.3 / 0.0 / 0.3 / 0.0 (addendum §2)", () => {
		expect(TUNING.materials.default.elasticity.value).toBe(0.3);
		expect(TUNING.materials.default.elasticityFalloff.value).toBe(0);
		expect(TUNING.materials.default.friction.value).toBe(0.3);
		expect(TUNING.materials.default.scatter.value).toBe(0);
	});

	it("the flipper-rubber material carries AR-17's starting values", () => {
		expect(TUNING.materials.flipper_rubber.elasticity.value).toBe(0.88);
		expect(TUNING.materials.flipper_rubber.elasticityFalloff.value).toBe(0.15);
		expect(TUNING.materials.flipper_rubber.friction.value).toBe(0.85);
		expect(TUNING.materials.flipper_rubber.scatter.value).toBe(0);
	});

	it("the authored friction midpoint (0.8-0.9 range) ships confidence 'unverified' with the authoring stated in source", () => {
		const friction = TUNING.materials.flipper_rubber.friction;
		expect(friction.confidence).toBe('unverified');
		expect(friction.source).toMatch(/authored/i);
		expect(friction.source).toMatch(/midpoint/i);
	});

	it('pitch bounds match FR-10 exactly (default 6.5, range 6.0-8.5)', () => {
		expect(TUNING.defaultPitchDeg.value).toBe(6.5);
		expect(TUNING.pitchMinDeg.value).toBe(6.0);
		expect(TUNING.pitchMaxDeg.value).toBe(8.5);
	});

	it('TUNING is deep-frozen', () => {
		expect(Object.isFrozen(TUNING)).toBe(true);
		expect(() => {
			(TUNING as unknown as { defaultPitchDeg: unknown }).defaultPitchDeg = null;
		}).toThrow();
	});

	// Story 1.9, AC 2: the pin flips from absence to presence -- FR-9's mechanism
	// and unit are no longer undecided (src/sim/physics/hop.ts), so this is a
	// deliberate edit to the pin, not a silent drop of what it was protecting.
	it('has a hopControl entry -- a TuningEntry, authored, unverified (Story 1.9 supplies the mechanism and unit FR-9 itself did not state)', () => {
		expect('hopControl' in TUNING).toBe(true);
		expect(isTuningEntry(TUNING.hopControl)).toBe(true);
		expect(TUNING.hopControl.confidence).toBe('unverified');
		expect(TUNING.hopControl.source).toMatch(/authored/i);
	});

	it('hopControl does not end in "Ms" -- it is a dimensionless scale, not a duration resolveTuning() converts', () => {
		// Review finding, this pass: this previously read
		// `expect('hopControl'.endsWith('Ms')).toBe(false)` -- a string LITERAL
		// asserted against itself, which cannot fail whatever TUNING actually
		// contains (the exact vacuous pattern a prior review finding already
		// fixed for troughEjectSpeedMmPerS/autolaunchSpeedMmPerS below). Read
		// the key off TUNING itself and pin the consequence that matters:
		// resolveTuning() CONVERTS a `...Ms` key into a `...Ticks` key, so a
		// hopControl misnamed `...Ms` would silently become a tick count and
		// vanish from the resolved shape hop.ts reads.
		const hopControlKeys = Object.keys(TUNING).filter((key) => TUNING[key as keyof typeof TUNING] === TUNING.hopControl);
		expect(hopControlKeys, 'hopControl must be reachable as a TUNING key').toHaveLength(1);
		expect(
			hopControlKeys[0]!.endsWith('Ms'),
			'TUNING.hopControl is a dimensionless scale, not a duration -- a name ending in "Ms" is converted to ticks by resolveTuning()',
		).toBe(false);
	});

	// Story 1.5, task 10(b): the two eject-speed tunables.
	it('troughEjectSpeedMmPerS is 300, unverified, sourced to AD-6\'s eject-speed requirement', () => {
		const t = TUNING.troughEjectSpeedMmPerS;
		expect(t.value).toBe(300);
		expect(t.confidence).toBe('unverified');
		expect(t.source).toMatch(/AD-6/);
	});

	it('autolaunchSpeedMmPerS is 2500, unverified, sourced to AD-6\'s eject-speed requirement', () => {
		const t = TUNING.autolaunchSpeedMmPerS;
		expect(t.value).toBe(2500);
		expect(t.confidence).toBe('unverified');
		expect(t.source).toMatch(/AD-6/);
	});

	it('neither new speed tunable\'s name ends in "Ms" -- both are mm/s speeds, not durations', () => {
		// Review finding 2026-08-28: this previously read
		// `expect('troughEjectSpeedMmPerS'.endsWith('Ms')).toBe(false)` -- two
		// string LITERALS asserted against themselves, which cannot fail
		// whatever TUNING actually contains. Read the names off TUNING itself,
		// and pin the consequence that matters: resolveTuning() CONVERTS a
		// `…Ms` key into a `…Ticks` key, so a speed misnamed `…Ms` would
		// silently become a tick count and vanish from the resolved shape its
		// only consumers (sim/physics/devices.ts) read.
		const speedEntries = [TUNING.troughEjectSpeedMmPerS, TUNING.autolaunchSpeedMmPerS];
		const speedKeys = Object.keys(TUNING).filter((key) => speedEntries.includes(TUNING[key as keyof typeof TUNING] as never));
		expect(speedKeys, 'both speed tunables must be reachable as TUNING keys').toHaveLength(2);
		for (const key of speedKeys) {
			expect(
				key.endsWith('Ms'),
				`TUNING.${key} is a speed, not a duration -- a name ending in "Ms" is converted to ticks by resolveTuning()`,
			).toBe(false);
		}

		// ...and they really do survive the conversion unconverted, with their
		// authored mm/s values intact.
		const resolved = resolveTuning();
		expect(resolved.troughEjectSpeedMmPerS.value).toBe(TUNING.troughEjectSpeedMmPerS.value);
		expect(resolved.autolaunchSpeedMmPerS.value).toBe(TUNING.autolaunchSpeedMmPerS.value);
	});
});

describe('resolveTuning() -- the single load-time …Ms -> …Ticks conversion (AD-3)', () => {
	const resolved = resolveTuning();

	it('produces a …Ticks counterpart for every top-level …Ms entry, computed from TICK_HZ, preserving source/confidence', () => {
		const cases: Array<[keyof typeof resolved, keyof typeof resolved]> = [
			['tiltWarningSpacingMs', 'tiltWarningSpacingTicks'],
			['tiltSettleMs', 'tiltSettleTicks'],
			['slamNudgeWindowMs', 'slamNudgeWindowTicks'],
			['plungerMinHoldMs', 'plungerMinHoldTicks'],
			['plungerMaxHoldMs', 'plungerMaxHoldTicks'],
			['nudgeImpulseMs', 'nudgeImpulseTicks'],
		];
		for (const [msKey, ticksKey] of cases) {
			const msEntry = resolved[msKey] as unknown as TuningEntry<number>;
			const ticksEntry = resolved[ticksKey] as unknown as TuningEntry<number>;
			expect(ticksEntry.value).toBe(Math.round((msEntry.value * TICK_HZ) / 1000));
			expect(ticksEntry.source).toBe(msEntry.source);
			expect(ticksEntry.confidence).toBe(msEntry.confidence);
		}
	});

	it('produces switchSettleTicksByClass with every class converted, preserving source/confidence', () => {
		const classes = ['rollover', 'standup', 'drop_target', 'bumper_skirt', 'tilt_bob', 'button', 'slam'] as const;
		for (const settleClass of classes) {
			const msEntry = resolved.switchSettleMsByClass[settleClass];
			const ticksEntry = resolved.switchSettleTicksByClass[settleClass];
			expect(ticksEntry.value).toBe(Math.round((msEntry.value * TICK_HZ) / 1000));
			expect(ticksEntry.source).toBe(msEntry.source);
			expect(ticksEntry.confidence).toBe(msEntry.confidence);
		}
	});

	it('at the current TICK_HZ, AD-2\'s five default ms figures survive unchanged as ticks (Design Notes reconciliation)', () => {
		expect(resolved.switchSettleTicksByClass.rollover.value).toBe(0);
		expect(resolved.switchSettleTicksByClass.standup.value).toBe(8);
		expect(resolved.switchSettleTicksByClass.drop_target.value).toBe(20);
		expect(resolved.switchSettleTicksByClass.bumper_skirt.value).toBe(2);
		expect(resolved.switchSettleTicksByClass.tilt_bob.value).toBe(0);
	});

	it('non-Ms entries (materials, pitch bounds) pass through unchanged', () => {
		expect(resolved.materials.flipper_rubber.elasticity.value).toBe(0.88);
		expect(resolved.defaultPitchDeg.value).toBe(6.5);
	});

	it('throws at load for a non-finite …Ms value, naming the tunable', () => {
		const broken = {
			...TUNING,
			tiltSettleMs: { value: Number.NaN, source: 'test fixture', confidence: 'unverified' as const },
		};
		expect(() => resolveTuning(broken)).toThrow(/tiltSettleMs/);
	});

	// Review finding, this story's review pass: at TICK_HZ = 1000,
	// Math.round(ms * 1000 / 1000) === ms for every integer tunable in TUNING,
	// so every assertion above is satisfied by a resolveTuning() that does no
	// conversion at all (`return ms` was verified to leave the whole suite
	// green). time.ts marks TICK_HZ PROVISIONAL -- "1000 on PASS, 480 on
	// FAIL" -- which is precisely when a regressed conversion would start
	// silently mis-scaling every debounce, tilt and plunger duration. These
	// cases evaluate the conversion at a rate where it is NOT the identity.
	describe('the conversion is real, not the identity it looks like at 1000 Hz', () => {
		const at480 = resolveTuning(TUNING, 480);

		it('scales a 500 ms tunable to 240 ticks at 480 Hz', () => {
			expect(at480.tiltWarningSpacingMs.value).toBe(500);
			expect(at480.tiltWarningSpacingTicks.value).toBe(240);
		});

		it('scales the AD-2 settle classes by the tick rate, not by copying the ms figures', () => {
			expect(at480.switchSettleTicksByClass.standup.value).toBe(4);
			expect(at480.switchSettleTicksByClass.drop_target.value).toBe(10);
			expect(at480.switchSettleTicksByClass.bumper_skirt.value).toBe(1);
			expect(at480.switchSettleTicksByClass.rollover.value).toBe(0);
		});

		it('rounds rather than truncates (3000 ms at 480 Hz is 1440 ticks)', () => {
			expect(at480.tiltSettleTicks.value).toBe(1440);
		});

		it('still preserves source and confidence at any rate', () => {
			expect(at480.tiltSettleTicks.source).toBe(TUNING.tiltSettleMs.source);
			expect(at480.tiltSettleTicks.confidence).toBe(TUNING.tiltSettleMs.confidence);
		});
	});

	it('throws for a …Ms key whose value is not a numeric TuningEntry (I/O matrix: load-time paths throw)', () => {
		// Previously a silent `continue`, so a mis-shaped …Ms tunable was
		// dropped from the conversion with no counterpart and no complaint.
		const broken = { ...TUNING, brokenMs: { source: 'test fixture', confidence: 'unverified' as const } };
		expect(() => resolveTuning(broken as unknown as typeof TUNING)).toThrow(/brokenMs/);
	});

	// Story 1.5, task 10(a): closes DW-35.
	describe('DW-35 -- negative and rounds-to-zero …Ms values throw', () => {
		it('throws naming the tunable and its ms value when a …Ms tunable is negative', () => {
			const broken = {
				...TUNING,
				tiltSettleMs: { value: -10, source: 'test fixture', confidence: 'unverified' as const },
			};
			expect(() => resolveTuning(broken)).toThrow(/tiltSettleMs/);
			expect(() => resolveTuning(broken)).toThrow(/-10/);
		});

		it('throws naming the tunable when a strictly positive …Ms value rounds to 0 ticks at the live tick rate', () => {
			// At tickHz = 1, 400 ms -> round(400 * 1 / 1000) = round(0.4) = 0 ticks
			// -- a nonzero duration that would silently become a no-op wait.
			const broken = {
				...TUNING,
				tiltSettleMs: { value: 400, source: 'test fixture', confidence: 'unverified' as const },
			};
			expect(() => resolveTuning(broken, 1)).toThrow(/tiltSettleMs/);
		});

		it('an authored 0 ms still converts to 0 ticks with no throw', () => {
			// At the DEFAULT tick rate deliberately (not the degenerate tickHz = 1
			// used above): every real switchSettleMsByClass entry still converts
			// cleanly there, so only the tunable under test is exercised.
			const zeroed = {
				...TUNING,
				tiltSettleMs: { value: 0, source: 'test fixture', confidence: 'unverified' as const },
			};
			const resolved = resolveTuning(zeroed);
			expect(resolved.tiltSettleTicks.value).toBe(0);
		});

		it('switchSettleMsByClass entries are guarded by the same rule (negative throws, naming the class)', () => {
			const broken = {
				...TUNING,
				switchSettleMsByClass: {
					...TUNING.switchSettleMsByClass,
					standup: { value: -1, source: 'test fixture', confidence: 'unverified' as const },
				},
			};
			expect(() => resolveTuning(broken)).toThrow(/switchSettleMsByClass\.standup/);
		});
	});
});

// ---------------------------------------------------------------------------
// Story 1.6: TUNING.flipper (the ported FlipperMover parameters) and the
// three DW-34 guards resolveTuning() now enforces (deep-frozen result,
// nested "…Ms" throws, "…Ticks" collision throws).
// ---------------------------------------------------------------------------

describe('TUNING.flipper -- the ported FlipperMover parameters (Story 1.6, AD-5, AD-15)', () => {
	const FLIPPER_KEYS = [
		'mass',
		'strength',
		'rampUp',
		'returnRatio',
		'torqueDamping',
		'torqueDampingAngleDeg',
		'sweepDeg',
		'endRadiusRatio',
	] as const;

	// Code review 2026-08-29 (iteration 2): the two tests below used to iterate
	// the FLIPPER_KEYS literal, so a NEW TUNING.flipper entry -- exactly the
	// "add a tunable with no source" mutation the Story 1.8 invariant sweep
	// names as its AD-15 proof case -- shipped with both of them green. They
	// now iterate the group itself; FLIPPER_KEYS is asserted to be the group's
	// real key set, so an added or removed parameter is a deliberate edit here
	// rather than a silent gap.
	it('FLIPPER_KEYS is the actual key set of TUNING.flipper, so the per-key checks below cover every entry', () => {
		expect([...Object.keys(TUNING.flipper)].sort()).toEqual([...FLIPPER_KEYS].sort());
	});

	it('every entry is a TuningEntry with a source naming the pinned upstream file (or physics-tuning.md) and an honest confidence', () => {
		for (const key of Object.keys(TUNING.flipper) as Array<keyof typeof TUNING.flipper>) {
			const entry = TUNING.flipper[key];
			expect(isTuningEntry(entry), `TUNING.flipper.${key} is not a TuningEntry`).toBe(true);
			expect(typeof entry.source).toBe('string');
			expect(entry.source.length).toBeGreaterThan(0);
			const validConfidences: Confidence[] = ['high', 'medium', 'low', 'unverified'];
			expect(validConfidences).toContain(entry.confidence);
			// Every figure here is transcribed from the pinned upstream commit
			// (flipper-mover.ts/flipper-data.ts @ e8a6d6f) or, for rampUp,
			// physics-tuning.md's own explicit override -- never
			// "authored"/invented outright the way the do-not-invent-list
			// figures are.
			expect(entry.source).toMatch(/e8a6d6f|physics-tuning\.md/);
		}
	});

	it('no key in the group ends in "Ms" -- none of these are durations resolveTuning() converts', () => {
		for (const key of Object.keys(TUNING.flipper)) {
			expect(key.endsWith('Ms'), `TUNING.flipper.${key} must not end in "Ms"`).toBe(false);
		}
	});

	it('rampUp is 2.5 -- physics-tuning.md\'s explicit override of flipper-data.ts\'s own 3.0 fallback, sourced to the brief addendum §4', () => {
		expect(TUNING.flipper.rampUp.value).toBe(2.5);
		expect(TUNING.flipper.rampUp.source).toMatch(/2\.5/);
	});

	it('strength/mass/returnRatio/torqueDamping/torqueDampingAngleDeg transcribe flipper-data.ts\'s own override-fallback defaults', () => {
		expect(TUNING.flipper.mass.value).toBe(1);
		expect(TUNING.flipper.strength.value).toBe(2200);
		expect(TUNING.flipper.returnRatio.value).toBe(0.058);
		expect(TUNING.flipper.torqueDamping.value).toBe(0.75);
		expect(TUNING.flipper.torqueDampingAngleDeg.value).toBe(6.0);
	});

	it('sweepDeg (51) and endRadiusRatio transcribe flipper-data.ts\'s own field defaults, not an invented figure', () => {
		expect(TUNING.flipper.sweepDeg.value).toBe(51);
		expect(TUNING.flipper.endRadiusRatio.value).toBeCloseTo(13.0 / 21.5, 10);
	});

	it('the flipper\'s collision material is NOT here -- it stays materials.flipper_rubber, already authored', () => {
		expect('elasticity' in TUNING.flipper).toBe(false);
		expect('friction' in TUNING.flipper).toBe(false);
		expect(TUNING.materials.flipper_rubber.elasticity.value).toBe(0.88);
	});

	it('MPF\'s pulse/hold figures appear only as prose in physics-tuning.md, never as a TUNING.flipper entry', () => {
		// physics-tuning.md's own words: "~30 ms at 70%, then 25% hold ... a
		// calibration reference, not a parameter". No key in this group may be
		// named after it.
		const keys = Object.keys(TUNING.flipper);
		for (const key of keys) {
			expect(key.toLowerCase()).not.toMatch(/pulse|mpf/);
		}
	});
});

describe('resolveTuning() -- DW-34 guards (Story 1.6)', () => {
	it('the returned object is frozen at every depth, including nested groups (materials, flipper, switchSettleTicksByClass)', () => {
		const resolved = resolveTuning();
		expect(Object.isFrozen(resolved)).toBe(true);
		expect(Object.isFrozen(resolved.flipper)).toBe(true);
		expect(Object.isFrozen(resolved.flipper.strength)).toBe(true);
		expect(Object.isFrozen(resolved.materials)).toBe(true);
		expect(Object.isFrozen(resolved.materials.flipper_rubber)).toBe(true);
		expect(Object.isFrozen(resolved.switchSettleTicksByClass)).toBe(true);
		expect(Object.isFrozen(resolved.switchSettleTicksByClass.standup)).toBe(true);
		expect(() => {
			(resolved as unknown as { flipper: unknown }).flipper = null;
		}).toThrow();
		expect(() => {
			(resolved.flipper as unknown as { strength: unknown }).strength = null;
		}).toThrow();
	});

	it('a nested "…Ms" key one level down throws naming its dotted path, rather than silently never converting it (DW-34)', () => {
		const broken = {
			...TUNING,
			flipper: { ...TUNING.flipper, rampUpMs: { value: 5, source: 'test fixture', confidence: 'unverified' as const } },
		};
		expect(() => resolveTuning(broken as unknown as typeof TUNING)).toThrow(/flipper\.rampUpMs/);
	});

	it('a nested key NOT ending in "Ms" passes through untouched', () => {
		expect(() => resolveTuning()).not.toThrow();
		const resolved = resolveTuning();
		// Code review 2026-08-29 (iteration 2): compared against the external
		// literal, not against TUNING.flipper.strength.value -- resolveTuning()
		// shallow-spreads `tuning`, so `resolved.flipper` IS `TUNING.flipper`
		// and the previous form compared the same object to itself.
		expect(resolved.flipper.strength.value).toBe(2200);
	});

	it('a hand-authored top-level "…Ticks" key colliding with a derived one throws naming the key, rather than being silently overwritten', () => {
		const broken = {
			...TUNING,
			tiltSettleTicks: { value: 999, source: 'test fixture', confidence: 'unverified' as const },
		};
		expect(() => resolveTuning(broken as unknown as typeof TUNING)).toThrow(/tiltSettleTicks/);
	});

	it('a "…Ticks" key with no colliding "…Ms" sibling survives untouched', () => {
		const withExtra = { ...TUNING, someUnrelatedTicks: { value: 7, source: 'test fixture', confidence: 'unverified' as const } };
		const resolved = resolveTuning(withExtra as unknown as typeof TUNING);
		expect((resolved as unknown as { someUnrelatedTicks: { value: number } }).someUnrelatedTicks.value).toBe(7);
	});
});

describe('plungerSpeedByHoldMs() -- the manual-plunge hold->speed mapping (AD-5)', () => {
	const resolved = resolveTuning();

	it('clamps to plungerMinSpeedScale at or below plungerMinHoldTicks', () => {
		const expected = resolved.autolaunchSpeedMmPerS.value * resolved.plungerMinSpeedScale.value;
		expect(plungerSpeedByHoldMs(resolved.plungerMinHoldTicks.value, resolved)).toBeCloseTo(expected, 6);
		expect(plungerSpeedByHoldMs(0, resolved)).toBeCloseTo(expected, 6);
		expect(plungerSpeedByHoldMs(-5, resolved)).toBeCloseTo(expected, 6);
	});

	it('clamps to plungerMaxSpeedScale at or above plungerMaxHoldTicks -- it never extrapolates past either end', () => {
		const expected = resolved.autolaunchSpeedMmPerS.value * resolved.plungerMaxSpeedScale.value;
		expect(plungerSpeedByHoldMs(resolved.plungerMaxHoldTicks.value, resolved)).toBeCloseTo(expected, 6);
		expect(plungerSpeedByHoldMs(resolved.plungerMaxHoldTicks.value + 1000, resolved)).toBeCloseTo(expected, 6);
	});

	it('interpolates linearly between the two clamps', () => {
		const minTicks = resolved.plungerMinHoldTicks.value;
		const maxTicks = resolved.plungerMaxHoldTicks.value;
		const midTicks = minTicks + (maxTicks - minTicks) / 2;
		const minSpeed = resolved.autolaunchSpeedMmPerS.value * resolved.plungerMinSpeedScale.value;
		const maxSpeed = resolved.autolaunchSpeedMmPerS.value * resolved.plungerMaxSpeedScale.value;
		const expectedMid = (minSpeed + maxSpeed) / 2;
		expect(plungerSpeedByHoldMs(midTicks, resolved)).toBeCloseTo(expectedMid, 3);
	});

	it('a zero-width hold window (plungerMinHoldTicks === plungerMaxHoldTicks) yields the max scale rather than dividing by zero', () => {
		const zeroWidth = {
			...resolved,
			plungerMinHoldTicks: { value: 10, source: 'test fixture', confidence: 'unverified' as const },
			plungerMaxHoldTicks: { value: 10, source: 'test fixture', confidence: 'unverified' as const },
		};
		const expected = resolved.autolaunchSpeedMmPerS.value * resolved.plungerMaxSpeedScale.value;
		expect(plungerSpeedByHoldMs(10, zeroWidth)).toBeCloseTo(expected, 6);
		expect(plungerSpeedByHoldMs(999, zeroWidth)).toBeCloseTo(expected, 6);
		expect(Number.isFinite(plungerSpeedByHoldMs(10, zeroWidth))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Story 1.7: TUNING.cabinet and TUNING.tiltBob (the cabinet oscillator, the
// keyboard-nudge impulse peak and the plumb-bob tilt pendulum). Copies the
// FLIPPER_KEYS exhaustiveness pattern (:301-320 above) exactly, for the same
// reason: without it, a new tunable added to either group ships with no
// source/confidence check covering it.
// ---------------------------------------------------------------------------

describe('TUNING.cabinet -- the ported oscillator and nudge-impulse-peak parameters (Story 1.7, AD-5, AD-15)', () => {
	const CABINET_KEYS = ['massKg', 'freqXHz', 'zetaX', 'freqYHz', 'zetaY', 'nudgePeakAccelG'] as const;

	it('CABINET_KEYS is the actual key set of TUNING.cabinet, so the per-key checks below cover every entry', () => {
		expect([...Object.keys(TUNING.cabinet)].sort()).toEqual([...CABINET_KEYS].sort());
	});

	it('every entry is a TuningEntry with a source naming the pinned vpinball/vpinball file and an honest confidence', () => {
		for (const key of Object.keys(TUNING.cabinet) as Array<keyof typeof TUNING.cabinet>) {
			const entry = TUNING.cabinet[key];
			expect(isTuningEntry(entry), `TUNING.cabinet.${key} is not a TuningEntry`).toBe(true);
			expect(typeof entry.source).toBe('string');
			expect(entry.source.length).toBeGreaterThan(0);
			const validConfidences: Confidence[] = ['high', 'medium', 'low', 'unverified'];
			expect(validConfidences).toContain(entry.confidence);
			expect(entry.source, `TUNING.cabinet.${key}.source must name the pinned vpinball/vpinball commit`).toMatch(/3f838c14b/);
		}
	});

	it('no key in the group ends in "Ms" -- none of these is a duration resolveTuning() converts', () => {
		for (const key of Object.keys(TUNING.cabinet)) {
			expect(key.endsWith('Ms'), `TUNING.cabinet.${key} must not end in "Ms"`).toBe(false);
		}
	});

	it('transcribes CabinetPhysics.cpp\'s ctor arguments verbatim', () => {
		expect(TUNING.cabinet.massKg.value).toBe(113);
		expect(TUNING.cabinet.freqXHz.value).toBe(9.3);
		expect(TUNING.cabinet.zetaX.value).toBe(0.052);
		expect(TUNING.cabinet.freqYHz.value).toBe(5.8);
		expect(TUNING.cabinet.zetaY.value).toBe(0.055);
	});

	it('nudgePeakAccelG transcribes KeyboardNudge.cpp\'s "0.5g max peak accel on strong nudge" comment', () => {
		expect(TUNING.cabinet.nudgePeakAccelG.value).toBe(0.5);
	});
});

describe('TUNING.nudgeImpulseMs -- the ONE new top-level duration (Story 1.7, DW-34 trap)', () => {
	it('is top-level (not nested inside TUNING.cabinet), transcribing KeyboardNudge.cpp\'s 25 ms impulse length', () => {
		expect('nudgeImpulseMs' in TUNING.cabinet).toBe(false);
		expect(TUNING.nudgeImpulseMs.value).toBe(25);
		expect(TUNING.nudgeImpulseMs.source).toMatch(/3f838c14b/);
	});

	it('resolveTuning() does not throw (the DW-34 nested-Ms guard would fire if this were ever moved inside a group)', () => {
		expect(() => resolveTuning()).not.toThrow();
	});
});

describe('TUNING.tiltBob -- the ported plumb-bob tilt pendulum parameters (Story 1.7, AD-5, AD-15)', () => {
	const TILT_BOB_KEYS = ['rodLengthM', 'cabAccelScale', 'dampingCoef0', 'dampingCoef1', 'ringBounceDamping', 'dampingScale', 'thresholdDeg'] as const;

	it('TILT_BOB_KEYS is the actual key set of TUNING.tiltBob, so the per-key checks below cover every entry', () => {
		expect([...Object.keys(TUNING.tiltBob)].sort()).toEqual([...TILT_BOB_KEYS].sort());
	});

	it('every entry is a TuningEntry with a non-empty source and an honest confidence', () => {
		for (const key of Object.keys(TUNING.tiltBob) as Array<keyof typeof TUNING.tiltBob>) {
			const entry = TUNING.tiltBob[key];
			expect(isTuningEntry(entry), `TUNING.tiltBob.${key} is not a TuningEntry`).toBe(true);
			expect(typeof entry.source).toBe('string');
			expect(entry.source.length).toBeGreaterThan(0);
			const validConfidences: Confidence[] = ['high', 'medium', 'low', 'unverified'];
			expect(validConfidences).toContain(entry.confidence);
		}
	});

	it('no key in the group ends in "Ms" -- none of these is a duration resolveTuning() converts', () => {
		for (const key of Object.keys(TUNING.tiltBob)) {
			expect(key.endsWith('Ms'), `TUNING.tiltBob.${key} must not end in "Ms"`).toBe(false);
		}
	});

	it('the five transcribed figures (rodLengthM, cabAccelScale, dampingCoef0, dampingCoef1, ringBounceDamping) carry the pinned vpinball/vpinball commit in their source, and match PlumbHandler.{h,cpp} verbatim', () => {
		const transcribed = ['rodLengthM', 'cabAccelScale', 'dampingCoef0', 'dampingCoef1', 'ringBounceDamping'] as const;
		for (const key of transcribed) {
			expect(TUNING.tiltBob[key].source, `TUNING.tiltBob.${key}.source must name the pinned vpinball/vpinball commit`).toMatch(/3f838c14b/);
		}
		expect(TUNING.tiltBob.rodLengthM.value).toBe(0.1);
		expect(TUNING.tiltBob.cabAccelScale.value).toBe(1.0);
		expect(TUNING.tiltBob.dampingCoef0.value).toBe(1.25);
		expect(TUNING.tiltBob.dampingCoef1.value).toBe(0.75);
		expect(TUNING.tiltBob.ringBounceDamping.value).toBe(0.8);
	});

	it('dampingScale and thresholdDeg are the two AUTHORED figures (no authorized file supplies either), both shipped unverified', () => {
		expect(TUNING.tiltBob.dampingScale.confidence).toBe('unverified');
		expect(TUNING.tiltBob.thresholdDeg.confidence).toBe('unverified');
		expect(TUNING.tiltBob.dampingScale.source).toMatch(/authored/);
		expect(TUNING.tiltBob.thresholdDeg.source).toMatch(/authored/);
	});
});
