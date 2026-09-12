// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.6 -- the dot rasteriser. Pure; no Babylon import (this file never
// imports `@babylonjs/*` at all -- `backglass.ts` is the one Babylon
// touchpoint). `rasterise()` turns a `DmdFrame`'s text rows into the exact
// lit/unlit dot buffer AC 1's "visible dot grid, no smoothing" is actually
// about (Design Notes: `readPixels()` returns `null` under `NullEngine`, so
// this dot buffer -- one step earlier in the pipeline -- is the only honest
// headless observable). `toRgba()` expands it into the DOT_PITCH_PX-per-dot
// pixel buffer `backglass.ts` blits into a `RawTexture`, with a genuine
// unlit gutter between adjacent lit cells -- the dot grid lives HERE, not in
// a shader.
//
// Story 2.13 (DW-198): `DmdRow.emphasis` is rendered here, as inverse video
// over the row's own text box -- the ONLY reader of that field (`frame.ts`
// itself still ignores it when composing rows). Computed from that row's
// own glyph mask alone (I/O Matrix, "Emphasis"): after every row's glyphs
// are drawn normally, a second pass over the emphasised rows inverts every
// dot inside `[col-1, col+6n-1] x [row, row+7]` (`n` the row's own,
// clamped, text length), clipped to the panel -- a dot ends up lit exactly
// where the glyph pixel was unlit, and vice versa. Unemphasised rows are
// completely unchanged by this pass.

import { DMD_COLS, DMD_ROWS, type DmdFrame } from './frame';
import { GLYPH_ADVANCE, GLYPH_H, GLYPH_W } from './font';

/** A row wider than this is truncated (I/O Matrix: "Text exceeds the panel"). 21 columns of GLYPH_ADVANCE (6) span 126 of the 128-dot-wide grid's columns, leaving 2 dots unused when a row starts at column 0 -- how those 2 dots split left/right in practice depends on the caller's own starting column (`frame.ts`'s `LEFT_MARGIN_COL` currently splits them 2 left / 1 right, not evenly). */
const LINE_WIDTH_COLS = 21;

/** Every row unlit -- the fallback glyph for a character `font` does not carry (I/O Matrix: "Glyph not in the font"). Font-shape-agnostic: `GLYPH_H` rows of the all-zero bitmask, not a re-import of `font.ts`'s own private fallback, so a test's minimal font fixture is not required to supply one. */
const FALLBACK_GLYPH: readonly number[] = new Array(GLYPH_H).fill(0);

/** The exact lit/unlit dot buffer `DMD_COLS * DMD_ROWS` long, row-major (`dots[row * cols + col]`), `1` lit / `0` unlit. */
export interface DmdRaster {
	readonly cols: number;
	readonly rows: number;
	readonly dots: Uint8Array;
}

/**
 * Renders every `frame.rows` entry's `text` into the dot buffer at
 * `(row.col, row.row)`, one glyph every `GLYPH_ADVANCE` columns. Clamps each
 * row's text to `LINE_WIDTH_COLS` characters (never wraps into another
 * row's dots) and drops any glyph pixel that would land outside the buffer
 * on either axis -- both axes are bounds-checked independently, so a row
 * authored above 0 or below `DMD_ROWS` is silently clipped rather than
 * corrupting a neighbouring row.
 */
export function rasterise(frame: DmdFrame, font: Readonly<Record<string, readonly number[]>>): DmdRaster {
	const dots = new Uint8Array(DMD_COLS * DMD_ROWS);

	for (const row of frame.rows) {
		const text = row.text.slice(0, LINE_WIDTH_COLS);
		for (let charIndex = 0; charIndex < text.length; charIndex++) {
			const glyph = font[text[charIndex]!] ?? FALLBACK_GLYPH;
			const originCol = row.col + charIndex * GLYPH_ADVANCE;
			for (let gy = 0; gy < GLYPH_H; gy++) {
				const destRow = row.row + gy;
				if (destRow < 0 || destRow >= DMD_ROWS) {
					continue;
				}
				const bits = glyph[gy] ?? 0;
				for (let gx = 0; gx < GLYPH_W; gx++) {
					const lit = (bits >> (GLYPH_W - 1 - gx)) & 1;
					if (!lit) {
						continue;
					}
					const destCol = originCol + gx;
					if (destCol < 0 || destCol >= DMD_COLS) {
						continue;
					}
					dots[destRow * DMD_COLS + destCol] = 1;
				}
			}
		}
	}

	// Story 2.13 (DW-198): the emphasis pass, second and separate -- every
	// row's glyphs are already drawn above, so this inverts in place rather
	// than tracking "was this dot lit by MY row" during the first pass.
	for (const row of frame.rows) {
		if (!row.emphasis) {
			continue;
		}
		const text = row.text.slice(0, LINE_WIDTH_COLS);
		const minCol = row.col - 1;
		const maxCol = row.col + GLYPH_ADVANCE * text.length - 1;
		const minRow = row.row;
		const maxRow = row.row + GLYPH_H;
		const rowStart = Math.max(0, minRow);
		const rowEnd = Math.min(DMD_ROWS - 1, maxRow);
		const colStart = Math.max(0, minCol);
		const colEnd = Math.min(DMD_COLS - 1, maxCol);
		for (let r = rowStart; r <= rowEnd; r++) {
			for (let c = colStart; c <= colEnd; c++) {
				const idx = r * DMD_COLS + c;
				dots[idx] = dots[idx] === 1 ? 0 : 1;
			}
		}
	}

	return { cols: DMD_COLS, rows: DMD_ROWS, dots };
}

/** Each dot occupies a `DOT_PITCH_PX`-square cell in the expanded pixel buffer. */
export const DOT_PITCH_PX = 4;
/** The lit square drawn inside each dot's cell, strictly smaller than `DOT_PITCH_PX` so a one-pixel unlit gutter always separates adjacent dots -- the "no smoothing" requirement made literal (AC 1). */
export const DOT_SIZE_PX = 3;

/** Amber -- a conventional DMD colour; placeholder art (AD-11), replaced behind this same contract in Epic 5. */
const LIT_R = 255;
const LIT_G = 140;
const LIT_B = 20;

/**
 * Expands `raster.dots` into an RGBA pixel buffer `(cols * DOT_PITCH_PX)` by
 * `(rows * DOT_PITCH_PX)`, opaque everywhere: unlit background (black,
 * alpha 255) with a `DOT_SIZE_PX`-square lit cell for every `1` in the dot
 * buffer, leaving `DOT_PITCH_PX - DOT_SIZE_PX` unlit pixels as the gutter on
 * each cell's far edge. This is what `backglass.ts` hands `RawTexture`.
 */
export function toRgba(raster: DmdRaster): Uint8Array {
	const widthPx = raster.cols * DOT_PITCH_PX;
	const heightPx = raster.rows * DOT_PITCH_PX;
	const rgba = new Uint8Array(widthPx * heightPx * 4);
	for (let i = 3; i < rgba.length; i += 4) {
		rgba[i] = 255; // fully opaque everywhere, lit or not
	}

	for (let dy = 0; dy < raster.rows; dy++) {
		for (let dx = 0; dx < raster.cols; dx++) {
			if (raster.dots[dy * raster.cols + dx] === 0) {
				continue;
			}
			const originX = dx * DOT_PITCH_PX;
			const originY = dy * DOT_PITCH_PX;
			for (let py = 0; py < DOT_SIZE_PX; py++) {
				const y = originY + py;
				for (let px = 0; px < DOT_SIZE_PX; px++) {
					const x = originX + px;
					const idx = (y * widthPx + x) * 4;
					rgba[idx] = LIT_R;
					rgba[idx + 1] = LIT_G;
					rgba[idx + 2] = LIT_B;
					rgba[idx + 3] = 255;
				}
			}
		}
	}

	return rgba;
}
