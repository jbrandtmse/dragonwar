// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.5, AC 2 (wiring) -- `src/host/boot.ts` cannot be imported under
// test (it reads `document` at module load and needs WebGL2; the
// `test/module-coverage.test.ts` allowlist), so this pins its Backglass
// wiring by a comment-stripped source scan, the
// `test/boot-mechanisms-wiring.test.ts` idiom:
//
// - in the host loop's `onFrame`, `advanceSequences(...)` runs AFTER
//   `advanceBackglass(...)` (it reads the screen that fold just chose) and
//   BEFORE the frame is rasterised;
// - `rasterise(...)` is handed `composeSequence(renderFrame(...), ...)`,
//   gated only by the lead's negative control, `sequencesEnabled`;
// - the two console hatches exist: `setBackglassSequencesEnabled(on)` sets
//   that flag, and `backglassState()` reports screen, sequence and frame --
//   each pinned by its WHOLE body, so an extra statement cannot hide;
// - the host loop's reset seam sets the flag back to `true`, and nothing else
//   writes it or `sequenceView`.
//
// What this cannot prove: that the browser actually runs the hook. The real
// order is exercised over a real loop in
// `test/backglass-sequences-integration.test.ts`; the rendered pixels are the
// lead's AC 4.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const BOOT_TS = path.resolve(__dirname, '..', 'src', 'host', 'boot.ts');

const ADVANCE_BACKGLASS = 'backglassView = advanceBackglass(backglassView, output);';
const ADVANCE_SEQUENCES = 'sequenceView = advanceSequences(sequenceView, backglassView, output);';
const RASTERISE_OPEN = 'latestRaster = rasterise(';
const COMPOSED = 'composeSequence(renderFrame(backglassView, output.snapshot, viewConfig), sequenceView, output.snapshot.tick)';

/** boot.ts with every block comment and every whole-line `//` comment removed, so a commented-out call is not mistaken for a live one. */
function bootSourceWithoutComments(): string {
	return readFileSync(BOOT_TS, 'utf8')
		.replace(/\r\n/g, '\n')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('//'))
		.join('\n');
}

/**
 * The text between the bracket that ends `open` (a `(` or a `{`) and its
 * balanced partner: a call's whole argument list, or a function's whole body.
 * `from` is where the search for `open` starts.
 */
function balancedAfter(source: string, open: string, from = 0): string {
	const start = source.indexOf(open, from);
	expect(start, `boot.ts must contain "${open}"`).toBeGreaterThan(-1);
	const opener = open[open.length - 1];
	const closer = opener === '(' ? ')' : '}';
	let depth = 1;
	for (let i = start + open.length; i < source.length; i++) {
		const c = source[i];
		if (c === opener) {
			depth += 1;
		} else if (c === closer) {
			depth -= 1;
			if (depth === 0) {
				return source.slice(start + open.length, i);
			}
		}
	}
	throw new Error(`unbalanced bracket after "${open}"`);
}

/** Layout-insensitive text: whitespace runs collapsed to one space, and a wrapped list's trailing comma dropped, so re-indenting a call or joining its arguments onto one line cannot break a match. */
const squash = (text: string): string => text.replace(/\s+/g, ' ').trim().replace(/,$/, '');

const STATE_TYPE = 'backglassState: () => { screen: DmdScreen; sequence: string | null; frameIndex: number | null };';

describe('Story 5.5 -- boot.ts wires the Backglass art sequences into onFrame', () => {
	const source = bootSourceWithoutComments();

	it('advanceSequences runs after advanceBackglass and before the frame is rasterised, each exactly once', () => {
		for (const needle of [ADVANCE_BACKGLASS, ADVANCE_SEQUENCES, RASTERISE_OPEN]) {
			const first = source.indexOf(needle);
			expect(first, `boot.ts must contain "${needle}"`).toBeGreaterThan(-1);
			expect(source.indexOf(needle, first + 1), `"${needle}" appears once`).toBe(-1);
		}
		const backglass = source.indexOf(ADVANCE_BACKGLASS);
		const sequences = source.indexOf(ADVANCE_SEQUENCES);
		const raster = source.indexOf(RASTERISE_OPEN);
		expect(backglass).toBeLessThan(sequences);
		expect(sequences).toBeLessThan(raster);
	});

	it('rasterise() is passed composeSequence(renderFrame(...), sequenceView, tick), gated only by sequencesEnabled', () => {
		const args = squash(balancedAfter(source, RASTERISE_OPEN));
		// The whole argument list: the false branch (the lead's negative control) is the plain frame, never composed.
		expect(args).toBe(`sequencesEnabled ? ${COMPOSED} : renderFrame(backglassView, output.snapshot, viewConfig), FONT_5X7`);
		expect(source).toContain('let sequencesEnabled = true;');
		expect(source).toContain('let sequenceView = INITIAL_SEQUENCE_VIEW;');
	});

	it('the two console hatches are exposed and typed on window.__dragonwarBoot, and each body is exactly its one job', () => {
		expect(source).toContain('setBackglassSequencesEnabled: (on: boolean) => void;');
		expect(source).toContain(STATE_TYPE);
		// Whole bodies, not substrings: an extra statement in either hatch (say, one that also reset the timeline) must fail here.
		expect(squash(balancedAfter(source, 'setBackglassSequencesEnabled: (on: boolean) => {'))).toBe('sequencesEnabled = on;');
		// The implementation, not the `declare global` type line (which also starts `backglassState: () => {`): search from past that line.
		const typeAt = source.indexOf(STATE_TYPE);
		expect(typeAt).toBeGreaterThan(-1);
		// The latest sim frame's tick, and the key/index mapping, exactly (the lead's AC 4 sampler times captures by it).
		expect(squash(balancedAfter(source, 'backglassState: () => {', typeAt + STATE_TYPE.length))).toBe(
			'const shown = activeSequenceFrame(sequenceView, backglassView.screen, latestSnapshot?.tick ?? 0); return { screen: backglassView.screen, sequence: shown?.key ?? null, frameIndex: shown?.index ?? null };',
		);
	});

	it('the reset seam sets the negative control back to true; the flag and the sequence view have no other writer', () => {
		const seam = squash(balancedAfter(source, 'reset: (resetOptions?: ResetOptions): void => {'));
		expect(seam.startsWith('liveHostLoop.reset(resetOptions);'), 'sanity: this is the host loop reset wrapper').toBe(true);
		expect(seam).toContain('sequencesEnabled = true;');
		// Every assignment in boot.ts, in file order: the declaration, the reset seam and the hatch -- and, for the view, the declaration and the fold.
		expect(source.match(/\bsequencesEnabled = [^;]+;/g)).toEqual(['sequencesEnabled = true;', 'sequencesEnabled = true;', 'sequencesEnabled = on;']);
		expect(source.match(/\bsequenceView = [^;]+;/g)).toEqual(['sequenceView = INITIAL_SEQUENCE_VIEW;', ADVANCE_SEQUENCES]);
	});
});
