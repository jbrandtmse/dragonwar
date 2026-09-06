// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.6 -- unit tests for `rasterise()` and `toRgba()`: dot-buffer
// length, a known glyph's exact lit-dot pattern (the real FONT_5X7, so this
// file is also font.ts's own test entry point), the unlit gutter between
// adjacent dot cells, the unknown-character fallback, and clamping -- both
// the horizontal line-width clamp AND the buffer-edge bounds check that
// stops an over-wide glyph from wrapping its dots into the NEXT row (the
// specific corruption a flat row-major index without a column bounds check
// would produce).

import { describe, expect, it } from 'vitest';
import { rasterise, toRgba, DOT_PITCH_PX, DOT_SIZE_PX, type DmdRaster } from '../src/presentation/backglass/raster';
import { DMD_COLS, DMD_ROWS, type DmdFrame, type DmdRow } from '../src/presentation/backglass/frame';
import { FONT_5X7, GLYPH_ADVANCE, GLYPH_H, GLYPH_W } from '../src/presentation/backglass/font';

function row(overrides: Partial<DmdRow>): DmdRow {
	return { text: '', col: 0, row: 0, emphasis: false, ...overrides };
}

function frameOf(...rows: DmdRow[]): DmdFrame {
	return { screen: 'score', rows };
}

/** The set of lit (row, col) dot coordinates, for compact assertions. */
function litDots(raster: DmdRaster): Array<[number, number]> {
	const dots: Array<[number, number]> = [];
	for (let r = 0; r < raster.rows; r++) {
		for (let c = 0; c < raster.cols; c++) {
			if (raster.dots[r * raster.cols + c] === 1) {
				dots.push([r, c]);
			}
		}
	}
	return dots;
}

describe('rasterise() -- dot-buffer shape', () => {
	it('the dots buffer is exactly DMD_COLS * DMD_ROWS long, unlit for an empty frame', () => {
		const raster = rasterise(frameOf(), FONT_5X7);
		expect(raster.cols).toBe(DMD_COLS);
		expect(raster.rows).toBe(DMD_ROWS);
		expect(raster.dots.length).toBe(DMD_COLS * DMD_ROWS);
		expect(litDots(raster)).toEqual([]);
	});
});

describe('rasterise() -- a known glyph\'s exact lit-dot pattern (the real font)', () => {
	it('"I" at (col 0, row 0) lights exactly the bits FONT_5X7.I declares, at the expected absolute coordinates', () => {
		const raster = rasterise(frameOf(row({ text: 'I', col: 0, row: 0 })), FONT_5X7);
		const glyph = FONT_5X7['I']!;
		expect(glyph.length).toBe(GLYPH_H);

		const expected: Array<[number, number]> = [];
		for (let gy = 0; gy < GLYPH_H; gy++) {
			for (let gx = 0; gx < GLYPH_W; gx++) {
				const lit = (glyph[gy]! >> (GLYPH_W - 1 - gx)) & 1;
				if (lit) {
					expected.push([gy, gx]);
				}
			}
		}
		expect(expected.length, 'sanity: "I" must actually light some dots, or this test proves nothing').toBeGreaterThan(0);
		expect(litDots(raster).sort()).toEqual(expected.sort());
	});

	it('a non-zero (col, row) offset shifts every lit dot by exactly that amount', () => {
		const atOrigin = litDots(rasterise(frameOf(row({ text: 'I', col: 0, row: 0 })), FONT_5X7));
		const shifted = litDots(rasterise(frameOf(row({ text: 'I', col: 10, row: 16 })), FONT_5X7));
		expect(shifted.sort()).toEqual(atOrigin.map(([r, c]) => [r + 16, c + 10]).sort());
	});
});

describe('rasterise() -- unknown-character fallback', () => {
	it('a character outside the authored set lights nothing and does not throw', () => {
		expect(() => rasterise(frameOf(row({ text: '@', col: 0, row: 0 })), FONT_5X7)).not.toThrow();
		const raster = rasterise(frameOf(row({ text: '@', col: 0, row: 0 })), FONT_5X7);
		expect(litDots(raster)).toEqual([]);
	});

	it('a known character beside an unknown one still renders correctly (the fallback does not corrupt its neighbours)', () => {
		const withUnknown = litDots(rasterise(frameOf(row({ text: 'I@I', col: 0, row: 0 })), FONT_5X7));
		const firstIOnly = litDots(rasterise(frameOf(row({ text: 'I', col: 0, row: 0 })), FONT_5X7));
		const secondIOnly = litDots(rasterise(frameOf(row({ text: 'I', col: 2 * GLYPH_ADVANCE, row: 0 })), FONT_5X7));
		expect(withUnknown.sort()).toEqual([...firstIOnly, ...secondIOnly].sort());
	});
});

describe('rasterise() -- clamping (I/O Matrix: "Text exceeds the panel")', () => {
	it('a row of 30 identical characters is truncated to the 21-column line width -- no dot appears past the clamp', () => {
		const text = 'A'.repeat(30);
		const raster = rasterise(frameOf(row({ text, col: 0, row: 0 })), FONT_5X7);
		const rightmostLitCol = Math.max(...litDots(raster).map(([, c]) => c));
		const clampedWidthCols = 21 * GLYPH_ADVANCE; // the line-width clamp in dots
		expect(rightmostLitCol).toBeLessThan(clampedWidthCols);

		// Non-vacuity: an UNCLAMPED render of the same text would need far more
		// than 21 characters' worth of columns, so this is a genuine truncation,
		// not merely "the text happened to fit".
		const naiveWidthNeeded = text.length * GLYPH_ADVANCE;
		expect(naiveWidthNeeded).toBeGreaterThan(clampedWidthCols);
	});

	it('a glyph authored to overflow the RIGHT edge of the buffer never wraps its dots into the row below', () => {
		// "I" is GLYPH_W (5) wide; starting two columns from the right edge
		// forces its rightmost columns past DMD_COLS.
		const overflowRow = 8;
		const raster = rasterise(frameOf(row({ text: 'I', col: DMD_COLS - 2, row: overflowRow })), FONT_5X7);

		for (const [r, c] of litDots(raster)) {
			expect(c, 'no lit dot may sit at or past the buffer\'s right edge').toBeLessThan(DMD_COLS);
			expect(r, `every lit dot must stay within this glyph's own row band (${overflowRow}..${overflowRow + GLYPH_H - 1}) -- a dot outside it means the overflow wrapped into a neighbouring row`).toBeGreaterThanOrEqual(overflowRow);
			expect(r).toBeLessThan(overflowRow + GLYPH_H);
		}
		// The glyph must still have drawn SOMETHING (its left, in-bounds columns) -- proves the clip is partial, not "silently drew nothing at all".
		expect(litDots(raster).length).toBeGreaterThan(0);
	});

	it('DW-196: a glyph authored to overflow the BOTTOM edge of the buffer never wraps its dots into an earlier row (the symmetric counterpart of the right-edge overflow test above)', () => {
		// "I" is GLYPH_H (7) tall; starting two rows from the bottom edge
		// forces its bottom rows past DMD_ROWS.
		const overflowRow = DMD_ROWS - 2;
		const overflowCol = 40;
		const raster = rasterise(frameOf(row({ text: 'I', col: overflowCol, row: overflowRow })), FONT_5X7);

		for (const [r, c] of litDots(raster)) {
			expect(r, `every lit dot must stay within this glyph's own row band (${overflowRow}..${DMD_ROWS - 1}) -- a dot outside it (e.g. wrapped to an earlier row) means the overflow was not clipped`).toBeGreaterThanOrEqual(overflowRow);
			expect(r, 'no lit dot may sit at or past the buffer\'s bottom edge').toBeLessThan(DMD_ROWS);
			expect(c, `every lit dot must stay within this glyph's own column band (${overflowCol}..${overflowCol + GLYPH_W - 1}) -- a dot outside it means the overflow wrapped into a neighbouring column`).toBeGreaterThanOrEqual(overflowCol);
			expect(c).toBeLessThan(overflowCol + GLYPH_W);
		}
		// The glyph must still have drawn SOMETHING (its top, in-bounds rows) -- proves the clip is partial, not "silently drew nothing at all".
		expect(litDots(raster).length).toBeGreaterThan(0);
	});

	it('a row authored partially above the buffer (negative row) clips the off-buffer portion and renders only the in-bounds rows, at the correct coordinates', () => {
		const raster = rasterise(frameOf(row({ text: 'I', col: 0, row: -4 })), FONT_5X7);
		const glyph = FONT_5X7['I']!;
		const expected: Array<[number, number]> = [];
		for (let gy = 0; gy < GLYPH_H; gy++) {
			const destRow = -4 + gy;
			if (destRow < 0) {
				continue;
			}
			for (let gx = 0; gx < GLYPH_W; gx++) {
				const lit = (glyph[gy]! >> (GLYPH_W - 1 - gx)) & 1;
				if (lit) {
					expected.push([destRow, gx]);
				}
			}
		}
		expect(expected.length, 'sanity: at least one in-bounds row must remain lit, or this test proves nothing').toBeGreaterThan(0);
		expect(litDots(raster).sort()).toEqual(expected.sort());
	});

	it('DW-196: a row authored partially left of the buffer (negative column) clips the off-buffer portion and renders only the in-bounds columns, at the correct coordinates (the symmetric counterpart of the negative-row test above)', () => {
		const raster = rasterise(frameOf(row({ text: 'I', col: -2, row: 0 })), FONT_5X7);
		const glyph = FONT_5X7['I']!;
		const expected: Array<[number, number]> = [];
		for (let gy = 0; gy < GLYPH_H; gy++) {
			for (let gx = 0; gx < GLYPH_W; gx++) {
				const destCol = -2 + gx;
				if (destCol < 0) {
					continue;
				}
				const lit = (glyph[gy]! >> (GLYPH_W - 1 - gx)) & 1;
				if (lit) {
					expected.push([gy, destCol]);
				}
			}
		}
		expect(expected.length, 'sanity: at least one in-bounds column must remain lit, or this test proves nothing').toBeGreaterThan(0);
		expect(litDots(raster).sort()).toEqual(expected.sort());
	});
});

describe('toRgba() -- the expanded pixel buffer and its unlit gutter', () => {
	it('is opaque everywhere (alpha 255) and unlit (RGB 0) with no lit dots', () => {
		const raster = rasterise(frameOf(), FONT_5X7);
		const rgba = toRgba(raster);
		expect(rgba.length).toBe(DMD_COLS * DOT_PITCH_PX * DMD_ROWS * DOT_PITCH_PX * 4);
		for (let i = 0; i < rgba.length; i += 4) {
			expect(rgba[i + 3]).toBe(255);
		}
		expect([...rgba].some((v, i) => i % 4 !== 3 && v !== 0)).toBe(false);
	});

	it('two horizontally adjacent lit dots ("I"\'s middle row, columns 1-2-3 all lit) still carry a genuine unlit gutter pixel between their lit squares', () => {
		const raster = rasterise(frameOf(row({ text: 'I', col: 0, row: 0 })), FONT_5X7);
		// FONT_5X7.I's top row is 0b01110 -- columns 1, 2 and 3 lit, adjacent.
		expect(raster.dots[0 * DMD_COLS + 1]).toBe(1);
		expect(raster.dots[0 * DMD_COLS + 2]).toBe(1);

		const rgba = toRgba(raster);
		const widthPx = DMD_COLS * DOT_PITCH_PX;
		const dot1RightEdgePx = 1 * DOT_PITCH_PX + (DOT_SIZE_PX - 1); // rightmost lit pixel of dot column 1
		const gutterPx = dot1RightEdgePx + 1; // must be UNLIT: DOT_PITCH_PX - DOT_SIZE_PX = 1 gutter pixel
		const dot2LeftEdgePx = 2 * DOT_PITCH_PX; // leftmost lit pixel of dot column 2

		const pixelAt = (x: number, y: number): [number, number, number, number] => {
			const idx = (y * widthPx + x) * 4;
			return [rgba[idx]!, rgba[idx + 1]!, rgba[idx + 2]!, rgba[idx + 3]!];
		};
		const y = 0 * DOT_PITCH_PX + 1; // a row inside dot row 0's lit square

		expect(pixelAt(dot1RightEdgePx, y)[0], 'dot column 1\'s own lit square must actually be lit').toBeGreaterThan(0);
		expect(pixelAt(gutterPx, y), 'the gutter pixel between adjacent lit dots must be unlit').toEqual([0, 0, 0, 255]);
		expect(pixelAt(dot2LeftEdgePx, y)[0], 'dot column 2\'s own lit square must actually be lit').toBeGreaterThan(0);
	});

	it('AC 1 mutation rehearsal: DOT_SIZE_PX === DOT_PITCH_PX would leave no gutter (confirms the test above is discriminating, without actually mutating the shipped constant)', () => {
		expect(DOT_SIZE_PX).toBeLessThan(DOT_PITCH_PX);
	});
});
