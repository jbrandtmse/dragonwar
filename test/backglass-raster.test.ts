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

describe('rasterise() -- DmdRow.emphasis is rendered (Story 2.13, DW-198)', () => {
	// AC 10, I/O Matrix "Emphasis": the box [col-1, col+6n-1] x [row, row+7]
	// (n = the row's own text length) is inverted -- a dot is lit exactly
	// where the glyph pixel is unlit, and vice versa.
	it('the dot buffers genuinely differ: emphasised, dot (1,0) is lit and every pixel lit in the unemphasised "8" is unlit; unemphasised, dot (1,0) is unlit', () => {
		const unemphasised = rasterise(frameOf(row({ text: '8', col: 2, row: 0, emphasis: false })), FONT_5X7);
		const emphasised = rasterise(frameOf(row({ text: '8', col: 2, row: 0, emphasis: true })), FONT_5X7);

		expect(unemphasised.dots[0 * DMD_COLS + 1], 'unemphasised: dot (1,0), the gutter before the glyph, is unlit').toBe(0);
		expect(emphasised.dots[0 * DMD_COLS + 1], 'emphasised: dot (1,0) is inverted to lit').toBe(1);

		let anyLitGlyphPixelStillLit = false;
		for (let r = 0; r < GLYPH_H; r++) {
			for (let c = 0; c < GLYPH_W; c++) {
				const idx = r * DMD_COLS + (2 + c);
				if (unemphasised.dots[idx] === 1 && emphasised.dots[idx] === 1) {
					anyLitGlyphPixelStillLit = true;
				}
			}
		}
		expect(anyLitGlyphPixelStillLit, 'every pixel lit in the unemphasised "8" must be UNLIT once emphasised (a genuine invert, not an overlay)').toBe(false);

		expect(unemphasised.dots, 'the dot buffers must genuinely differ').not.toEqual(emphasised.dots);
	});

	// Code review (second pass): this case was titled as the author's named
	// Rule 19 mutation ("render with emphasis forced false") but did not model
	// it -- it rendered `emphasis: false`, which is simply an unemphasised row,
	// and its one assertion was byte-for-byte the last assertion of the test
	// above. The mutation's real pin IS that test's dots-differ assertion:
	// forcing emphasis false inside `rasterise()` makes the emphasised buffer
	// equal the unemphasised one, so `not.toEqual` reddens. What was NOT
	// covered anywhere is the strictly stronger claim below -- that the
	// emphasised buffer is the unemphasised one with the box inverted and
	// nothing else -- which a partial mutation (inverting the glyph pixels but
	// not the background, say) would break while `not.toEqual` stayed green.
	it('Rule 19: the emphasised buffer is EXACTLY the unemphasised buffer with the box inverted -- every dot inside the box flipped, every dot outside it untouched', () => {
		const unemphasised = rasterise(frameOf(row({ text: '8', col: 2, row: 0, emphasis: false })), FONT_5X7);
		const emphasised = rasterise(frameOf(row({ text: '8', col: 2, row: 0, emphasis: true })), FONT_5X7);

		// The box for a one-character row at col 2: cols [1, 7], rows [0, 7].
		const BOX_COL_LO = 1;
		const BOX_COL_HI = 7;
		const BOX_ROW_LO = 0;
		const BOX_ROW_HI = 7;
		let flippedInside = 0;
		for (let r = 0; r < DMD_ROWS; r++) {
			for (let c = 0; c < DMD_COLS; c++) {
				const idx = r * DMD_COLS + c;
				const inside = r >= BOX_ROW_LO && r <= BOX_ROW_HI && c >= BOX_COL_LO && c <= BOX_COL_HI;
				if (inside) {
					expect(emphasised.dots[idx], `inside the box, dot (${c},${r}) must be the INVERSE of the unemphasised buffer`).toBe(unemphasised.dots[idx] === 1 ? 0 : 1);
					flippedInside += 1;
				} else {
					expect(emphasised.dots[idx], `outside the box, dot (${c},${r}) must be IDENTICAL to the unemphasised buffer`).toBe(unemphasised.dots[idx]);
				}
			}
		}
		// The positive that the loop above genuinely visited the box: 7 cols x
		// 8 rows, an authored literal, never read back from the box bounds.
		expect(flippedInside, 'the box the loop checked must be the authored 7x8 one, not an empty range').toBe(56);
	});

	it('the emphasis box is clipped to the panel and inverts a genuinely unlit background dot within its own bounds, never past DMD_COLS/DMD_ROWS', () => {
		// Code review (second pass, Rule 19): this test used to assert only
		// `raster.dots.length === DMD_COLS * DMD_ROWS`, which `rasterise()`
		// makes true by construction (it allocates exactly that Uint8Array and
		// returns it), so NEITHER clause of the title was asserted and the
		// clamps below could be deleted with the suite green. A one-character
		// row at `col: DMD_COLS - 3` has a box of [col-1, col+6*1-1] =
		// [125, 130]: cols 128..130 are off-panel, and without the `colEnd`
		// clamp the writes at `idx = r * DMD_COLS + c` would land in row r+1,
		// cols 0..2 -- corrupting a neighbouring row, exactly what
		// `rasterise()`'s own doc comment promises never happens.
		const raster = rasterise(frameOf(row({ text: '1', col: DMD_COLS - 3, row: 0, emphasis: true })), FONT_5X7);
		expect(raster.dots.length).toBe(DMD_COLS * DMD_ROWS);

		// Within its own bounds: a genuinely unlit background dot IS inverted.
		expect(raster.dots[0 * DMD_COLS + (DMD_COLS - 4)], 'the box\'s left gutter dot, on-panel, is inverted to lit').toBe(1);
		// Clipped: nothing past DMD_COLS wrapped into the next dot row. Row 1
		// is inside the glyph band, so a wrap would light cols 0..2 there; the
		// row band [0, GLYPH_H) belongs to this row alone and its own text sits
		// at col 125, so every dot in row 1's first four columns must be dark.
		for (let c = 0; c < 4; c++) {
			expect(raster.dots[1 * DMD_COLS + c], `row 1, col ${c} must be dark -- an off-panel emphasis write must be dropped, never wrapped into the next row`).toBe(0);
		}
		// And the vertical clamp, the same claim one axis over: a row at the
		// LAST dot row has a box of rows [DMD_ROWS-1, DMD_ROWS-1+GLYPH_H], so
		// all but the first are off-panel. Out-of-range typed-array writes are
		// silent, so the observable is that the on-panel part still inverted
		// while the buffer stayed exactly its allocated size.
		const bottom = rasterise(frameOf(row({ text: '1', col: 2, row: DMD_ROWS - 1, emphasis: true })), FONT_5X7);
		expect(bottom.dots.length).toBe(DMD_COLS * DMD_ROWS);
		expect(bottom.dots[(DMD_ROWS - 1) * DMD_COLS + 1], 'the bottom row\'s own gutter dot is still inverted').toBe(1);
	});

	it('an UNEMPHASISED row is completely unaffected by this pass -- identical to a frame with no emphasis field exercised at all', () => {
		const a = rasterise(frameOf(row({ text: 'HELLO', col: 2, row: 8, emphasis: false })), FONT_5X7);
		const b = rasterise(frameOf(row({ text: 'HELLO', col: 2, row: 8 })), FONT_5X7);
		expect(a.dots).toEqual(b.dots);
	});
});
