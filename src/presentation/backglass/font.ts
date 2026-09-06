// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.6 -- a hand-authored 5x7 bitmap font, pure data, ASCII source only.
// No third-party font: `ATTRIBUTIONS.md`'s "Where to get assets that are
// safe to use" section warns that many retro and DMD-style fonts are
// commercial or unlicensed, and `tools/check-attributions.mjs`/CLAUDE.md's
// provenance rule forbid adding one without a verified licence anyway --
// see the `ATTRIBUTIONS.md` "Generated content" row this file's own entry
// occupies, recorded BEFORE this file was authored. Every glyph below was
// drawn by hand for this project; none is copied from any font, library or
// commercial machine.
//
// One row per glyph, MSB-first over GLYPH_W (5) columns: bit 4 is the
// leftmost pixel, bit 0 the rightmost. `raster.ts` reads these bitmasks
// directly -- this module never imports Babylon or touches a canvas.

/** Glyph width in dots. */
export const GLYPH_W = 5;
/** Glyph height in dots (one bitmask row per dot row). */
export const GLYPH_H = 7;
/** Horizontal advance per glyph in dots -- GLYPH_W plus a one-dot gutter column between adjacent characters. */
export const GLYPH_ADVANCE = 6;

/** Every row unlit -- the fallback glyph for a character outside the authored set, and the literal shape of `' '` (space). */
const BLANK: readonly number[] = [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000];

/**
 * The authored glyph set: `0`-`9`, `A`-`Z`, `.`, `,`, `:`, `-` and space.
 * `readonly Record<string, readonly number[]>` -- a plain data table,
 * exactly asserted by `test/backglass-raster.test.ts`.
 */
export const FONT_5X7: Readonly<Record<string, readonly number[]>> = {
	'0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
	'1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
	'2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
	'3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
	'4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
	'5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
	'6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
	'7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
	'8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
	'9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],

	A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
	B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
	C: [0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111],
	D: [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
	E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
	F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
	G: [0b01111, 0b10000, 0b10000, 0b10011, 0b10001, 0b10001, 0b01110],
	H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
	I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
	J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
	K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
	L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
	M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
	N: [0b10001, 0b11001, 0b10101, 0b10101, 0b10011, 0b10001, 0b10001],
	O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
	P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
	Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
	R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
	S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
	T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
	U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
	V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
	W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
	X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
	Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
	Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],

	'.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b01100],
	',': [0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b01100, 0b01000],
	':': [0b00000, 0b01100, 0b01100, 0b00000, 0b01100, 0b01100, 0b00000],
	'-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
	' ': BLANK,
};

/**
 * `FONT_5X7[char]`, falling back to `BLANK` for any character outside the
 * authored set (I/O & Edge-Case Matrix: "renders the fallback (blank)
 * glyph; does not throw").
 */
export function glyphFor(char: string): readonly number[] {
	return FONT_5X7[char] ?? BLANK;
}
