// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9, AC 1: "given no edits, when Export runs, then the emitted text
// is byte-identical to src/sim/table/tuning.ts (LF-normalised). Given
// exactly one edited value, when Export runs, then the emitted text differs
// from the file on disk only at that value's line -- group order, JSDoc
// blocks, tab indentation, quote style and satisfies clauses all preserved."
//
// Falsifiability (spec): mutation: emit entry(value, source) WITHOUT the
// confidence argument -> the byte-identity assertion goes red (this file's
// own "no edits" case reads the real file's THIRD entry() argument through
// unchanged, so dropping it anywhere would already differ from the real
// tuning.ts -- demonstrated directly below by asserting confidence survives
// on a representative entry).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { serialiseTuning, UnknownTuningPathError } from '../src/host/dev/tuning-source';
import { TUNING } from '../src/sim/table/tuning';

const TUNING_TS_PATH = path.resolve(__dirname, '..', 'src', 'sim', 'table', 'tuning.ts');

function normalise(text: string): string {
	return text.replace(/\r\n/g, '\n');
}

describe('src/host/dev/tuning-source.ts -- serialiseTuning() (AC 1, Export)', () => {
	it('with no overrides, is byte-identical (LF-normalised) to src/sim/table/tuning.ts on disk', () => {
		const onDisk = normalise(readFileSync(TUNING_TS_PATH, 'utf8'));
		const emitted = serialiseTuning([]);
		expect(emitted).toBe(onDisk);
	});

	it('a representative entry\'s confidence argument survives untouched -- the falsifiability mutation (dropping the third entry() argument) would fail THIS assertion', () => {
		const emitted = serialiseTuning([]);
		expect(emitted).toContain("entry(0.88, \"addendum §2 physics tuning table, 'Flipper elasticity' (AR-17)\", 'medium')");
	});

	it('with exactly one edited value, the emitted text differs from the file on disk ONLY at that value\'s line', () => {
		// materials.flipper_rubber.elasticityFalloff is itself authored as a
		// MULTI-LINE entry() call (its own long source-attribution string
		// forces the wrap) -- the one line that must change is the value line
		// alone; the key line, the source-string line and the confidence line
		// must all survive untouched.
		const onDisk = normalise(readFileSync(TUNING_TS_PATH, 'utf8'));
		const onDiskLines = onDisk.split('\n');
		const emitted = serialiseTuning([{ path: ['materials', 'flipper_rubber', 'elasticityFalloff'], value: 0.42 }]);
		const emittedLines = emitted.split('\n');

		expect(emittedLines.length, 'an edit must never add or remove a line').toBe(onDiskLines.length);
		const differingIndices: number[] = [];
		for (let i = 0; i < onDiskLines.length; i++) {
			if (onDiskLines[i] !== emittedLines[i]) {
				differingIndices.push(i);
			}
		}
		expect(differingIndices, 'exactly one line must differ').toHaveLength(1);
		expect(onDiskLines[differingIndices[0]! - 1], 'the line immediately above the changed one must be the key/entry( opener, untouched').toContain('elasticityFalloff: entry(');
		expect(emittedLines[differingIndices[0]!]!.trim()).toBe('0.42,');
		// The next two lines (the source string, the confidence) are untouched.
		expect(emittedLines[differingIndices[0]! + 1]).toBe(onDiskLines[differingIndices[0]! + 1]);
		expect(emittedLines[differingIndices[0]! + 2]).toBe(onDiskLines[differingIndices[0]! + 2]);
	});

	it('an edit to a MULTI-LINE entry() call (value alone on the line after "entry(") replaces only that value line', () => {
		// TUNING.hopControl (this story's own new tunable) is authored as a
		// multi-line entry() call -- a genuinely different layout from the
		// single-line case above.
		const onDisk = normalise(readFileSync(TUNING_TS_PATH, 'utf8'));
		const onDiskLines = onDisk.split('\n');
		const emitted = serialiseTuning([{ path: ['hopControl'], value: 0.5 }]);
		const emittedLines = emitted.split('\n');

		expect(emittedLines.length).toBe(onDiskLines.length);
		const differingIndices = onDiskLines.reduce<number[]>((acc, l, i) => (l !== emittedLines[i] ? [...acc, i] : acc), []);
		expect(differingIndices).toHaveLength(1);
		expect(emittedLines[differingIndices[0]!]!.trim()).toBe('0.5,');
	});

	it('two edits differ from the file on disk at exactly two lines, each the correct one', () => {
		const onDisk = normalise(readFileSync(TUNING_TS_PATH, 'utf8'));
		const onDiskLines = onDisk.split('\n');
		const emitted = serialiseTuning([
			{ path: ['materials', 'flipper_rubber', 'elasticityFalloff'], value: 0.42 },
			{ path: ['defaultPitchDeg'], value: 7.25 },
		]);
		const emittedLines = emitted.split('\n');
		const differingIndices = onDiskLines.reduce<number[]>((acc, l, i) => (l !== emittedLines[i] ? [...acc, i] : acc), []);
		expect(differingIndices).toHaveLength(2);
		// elasticityFalloff (multi-line entry()): the value-only line changed.
		expect(emittedLines.some((l) => l.trim() === '0.42,')).toBe(true);
		// defaultPitchDeg (single-line entry()): key and value on the same line.
		expect(emittedLines.some((l) => l.includes('defaultPitchDeg: entry(') && l.includes('7.25'))).toBe(true);
	});

	it('an unknown path throws UnknownTuningPathError naming the path, never a silent no-op', () => {
		expect(() => serialiseTuning([{ path: ['materials', 'nonexistent_material', 'elasticity'], value: 1 }])).toThrow(UnknownTuningPathError);
		try {
			serialiseTuning([{ path: ['materials', 'nonexistent_material', 'elasticity'], value: 1 }]);
			expect.unreachable();
		} catch (err) {
			expect(String(err)).toContain('materials.nonexistent_material.elasticity');
		}
	});

	it('every leaf path this test edits is a REAL TUNING key, cross-checked at runtime -- the assertion cannot pass by editing a path that does not exist in the live TUNING', () => {
		expect(TUNING.materials.flipper_rubber.elasticityFalloff.value).toBe(0.15);
		expect(TUNING.hopControl.value).toBeGreaterThan(0);
		expect(TUNING.defaultPitchDeg.value).toBe(6.5);
	});
});
