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
import { resolveTuning, TUNING, type Confidence, type TuningEntry } from '../src/sim/table/tuning';

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
			'slamNudgesPerWindow',
			'slamNudgeWindowMs',
			'tiltWarningSpacingMs',
			'tiltSettleMs',
			'plungerMinHoldMs',
			'plungerMaxHoldMs',
			'plungerMinSpeedScale',
			'plungerMaxSpeedScale',
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

	it('has no hopControl entry -- FR-9 states no unit or magnitude, so none is invented (this story\'s own Block-If rule)', () => {
		expect('hopControl' in TUNING).toBe(false);
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
});
