// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9, AC 1: "given no edits, when Export runs, then the emitted text
// is byte-identical to src/sim/table/tuning.ts (LF-normalised). Given
// exactly one edited value, when Export runs, then the emitted text differs
// from the file on disk only at that value's line -- group order, JSDoc
// blocks, tab indentation, quote style and satisfies clauses all preserved."
//
// Falsifiability. Review finding, this pass -- the spec previously recorded
// "mutation: emit entry(value, source) WITHOUT the confidence argument ->
// the byte-identity assertion goes red" as this AC's demonstrated pin. That
// mutation names code that DOES NOT EXIST. What shipped is not an emitter: it
// is a template pass-through plus a line patcher. serialiseTuning([]) returns
// the `?raw` import of src/sim/table/tuning.ts VERBATIM (an early return that
// never touches applyOverride/replaceEntryValue/GROUP_OPEN/GROUP_CLOSE/
// ENTRY_OPEN at all), so the first case below compares that file's text to
// the same file's text read through fs -- it cannot fail for any FORMATTING
// regression, because nothing formats anything. There is no entry() emitter
// to drop an argument from.
//
// That matters beyond the assertion itself: deferred-work.md's DW-94 defers
// the parser's GROUP_CLOSE depth bug as "currently unreachable because
// test/tuning-source.test.ts's byte-identity assertion ... already covers
// every line shape that file actually contains". It covers none of them.
//
// The real, applicable pins for AC 1's Export clauses are therefore:
// - mutation: make serialiseTuning([]) return anything other than the raw
//   template -> the byte-identity case goes red. (Real, but narrow: it pins
//   the pass-through, not a format.)
// - mutation: change replaceEntryValue() to rewrite the `key: entry(` line
//   instead of the value line (or to slice from markerIdx instead of
//   markerIdx + marker.length) -> the single-edit cases, and the every-row
//   round trip at the bottom of this file, go red.
// - mutation: pop the group stack on any tab-indented `}` regardless of depth
//   (DW-94's own bug) -> the every-row round trip goes red for the first leaf
//   whose path the walk then misresolves.
// The every-row round trip is what turns "the parser handles the three paths
// someone happened to pick" into "the parser handles every leaf the panel can
// actually offer" -- which is the property Export needs, since the panel's
// Export click handler has no try/catch around serialiseTuning().

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { serialiseTuning, UnknownTuningPathError } from '../src/host/dev/tuning-source';
import { enumerateTuningRows } from '../src/host/dev/tuning-panel';
import { TUNING } from '../src/sim/table/tuning';

const TUNING_TS_PATH = path.resolve(__dirname, '..', 'src', 'sim', 'table', 'tuning.ts');

function normalise(text: string): string {
	return text.replace(/\r\n/g, '\n');
}

describe('src/host/dev/tuning-source.ts -- serialiseTuning() (AC 1, Export)', () => {
	it('with no overrides, is byte-identical (LF-normalised) to src/sim/table/tuning.ts on disk -- true BY CONSTRUCTION (the template is that file\'s own ?raw text), so read it as a pass-through pin, not a format pin', () => {
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

	it('EVERY leaf the panel can offer round-trips: one override per enumerated row changes exactly one line, and that line carries the new value', () => {
		// Review finding, this pass. Before this, the parser
		// (applyOverride/replaceEntryValue) was exercised on three hand-picked
		// paths, and the "byte-identical" case that was supposed to stand for
		// format fidelity never ran the parser at all (see this file's header).
		// Every path the PANEL enumerates is a path Export can be asked to
		// emit, and the panel's Export click handler has no try/catch -- so a
		// leaf whose line shape the walk mishandles throws
		// UnknownTuningPathError straight out of a DOM event handler. This
		// closes the gap for the whole set rather than a sample of it, and it
		// is what empirically supports DW-94's "currently unreachable" claim
		// instead of merely asserting it.
		const onDiskLines = normalise(readFileSync(TUNING_TS_PATH, 'utf8')).split('\n');
		const rows = enumerateTuningRows();
		expect(rows.length, 'sanity: the panel must genuinely enumerate leaves, or this loop is vacuous').toBeGreaterThan(20);

		for (const row of rows) {
			const dotted = row.path.join('.');
			// A value guaranteed to differ from the shipped one under
			// String(), including for 0 and for negative shipped values.
			const newValue = row.value + 1.5;
			let emitted: string;
			expect(() => {
				emitted = serialiseTuning([{ path: row.path, value: newValue }]);
			}, `serialiseTuning() threw for "${dotted}" -- the panel offers this row, and Export has no try/catch`).not.toThrow();
			const emittedLines = emitted!.split('\n');

			expect(emittedLines.length, `an edit to "${dotted}" must not add or remove a line`).toBe(onDiskLines.length);
			const differing = onDiskLines.reduce<number[]>((acc, l, i) => (l !== emittedLines[i] ? [...acc, i] : acc), []);
			expect(differing.length, `an edit to "${dotted}" must change exactly one line, not ${differing.length}`).toBe(1);
			expect(
				emittedLines[differing[0]!],
				`the changed line for "${dotted}" must carry the new value`,
			).toContain(String(newValue));
		}
	});
});
