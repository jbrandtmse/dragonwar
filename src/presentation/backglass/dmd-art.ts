// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.5 -- the Backglass's dot art: 1-bit sprites and the frames of the
// five DMD sequences, authored as data at the panel's own resolution
// (128 x 32). Provenance: `ATTRIBUTIONS.md`'s "Generated content" row for this
// file, recorded BEFORE it was created -- drawn in code as ASCII dot masks at
// 128x32; no third-party art or font; nothing traced from a commercial
// machine.
//
// A sprite is an array of equal-width strings using only `#` (lit) and `.`
// (unlit). `parseSprite()` turns each one into a `DmdSprite` once, at module
// load; a ragged row or any other character throws, naming the sprite
// (Consistency Conventions: load-time paths throw).
//
// No font: this file never imports `font.ts`, and no sequence adds a text
// row. The frames below only PLACE sprites; `sequences.ts` decides which
// frame shows and `raster.ts` draws it inside the sequence's region and
// outside every text row's protected box.

import type { DmdSprite, DmdSpritePlacement } from './frame';

const LIT = '#';
const UNLIT = '.';

/**
 * Parses one ASCII dot mask into a `DmdSprite`. Throws, naming the sprite,
 * on an empty mask, a ragged row, or any character other than `#` and `.`.
 */
export function parseSprite(name: string, lines: readonly string[]): DmdSprite {
	const width = lines[0]?.length ?? 0;
	if (lines.length === 0 || width === 0) {
		throw new Error(`dmd-art: sprite "${name}" is empty`);
	}
	const dots = new Uint8Array(width * lines.length);
	lines.forEach((line, y) => {
		if (line.length !== width) {
			throw new Error(`dmd-art: sprite "${name}" has a ragged row ${y}: ${line.length} dots wide, expected ${width}`);
		}
		for (let x = 0; x < width; x++) {
			const ch = line[x];
			if (ch === LIT) {
				dots[y * width + x] = 1;
			} else if (ch !== UNLIT) {
				throw new Error(`dmd-art: sprite "${name}" row ${y} col ${x} has an invalid character (code ${line.charCodeAt(x)}); only "${LIT}" and "${UNLIT}" are allowed`);
			}
		}
	});
	return { name, width, height: lines.length, dots };
}

/** The dragon, side view, facing left toward the knight: horns, open jaws, a raised wing, a tail curled under. 42 x 22. */
const DRAGON = parseSprite('dragon', [
	'..............................##..........',
	'............................####..........',
	'..........................######...#......',
	'........................########..##......',
	'......................##########.###......',
	'....................###########.####......',
	'...##..............###########.#####......',
	'....###...........##########.#######......',
	'..#######........##########.#######.......',
	'.##..######.....##########.#######........',
	'###########.....#########.#######.........',
	'.......#####...########################...',
	'##.......######################...######..',
	'.###.......#####################.....####.',
	'.............###################......###.',
	'..............##################.....###..',
	'...............################....####...',
	'...............####...######...#######....',
	'..............####....####.....#####......',
	'.............####.....####................',
	'............##.##....##.##................',
	'...........##..##...##..##................',
]);

/** The knight, facing right toward the dragon: visored helm, shield, sword raised. 18 x 18. */
const KNIGHT = parseSprite('knight', [
	'......###.........',
	'.....#####......#.',
	'.....#...#.....#..',
	'.....#####....#...',
	'......###....#....',
	'..#..#####..#.....',
	'.###########......',
	'####.#######......',
	'####.######.......',
	'####.######.......',
	'####.######.......',
	'.##..######.......',
	'..#..######.......',
	'.....##..##.......',
	'.....##..##.......',
	'.....##..##.......',
	'.....##..##.......',
	'....###..###......',
]);

/** Fire breath, the long burst, pointing left out of the dragon's jaws. 25 x 7. */
const FLAME = parseSprite('flame', [
	'.......#......#.......#..',
	'..#...###....###....####.',
	'.####.#####.######.######',
	'#########################',
	'.####.#####.######.######',
	'..#...###....###....####.',
	'.......#......#.......#..',
]);

/** Fire breath, the first short puff. 14 x 7. */
const FLAME_SHORT = parseSprite('flame_short', [
	'.......#......',
	'..#...###...##',
	'.####.########',
	'##############',
	'.####.########',
	'..#...###...##',
	'.......#......',
]);

/** A small flying wyrm, wings up, heading right. 14 x 7. */
const WYRM_UP = parseSprite('wyrm_up', [
	'......#.......',
	'......##......',
	'.......##.....',
	'.......###.##.',
	'##..#########.',
	'..#######...##',
	'.....#.#......',
]);

/** The same wyrm, wings down. 14 x 7. */
const WYRM_DOWN = parseSprite('wyrm_down', [
	'..............',
	'..............',
	'...........##.',
	'##..#########.',
	'..#######...##',
	'......###.....',
	'.......##.....',
]);

/** A heater shield with a chevron -- the Mode prompt's motif. 9 x 8. */
const SHIELD = parseSprite('shield', [
	'#########',
	'#.......#',
	'#.#...#.#',
	'#..#.#..#',
	'#...#...#',
	'.#.....#.',
	'..#...#..',
	'...###...',
]);

/** A selection pointer aimed right (placed left of the shield). 4 x 7. */
const POINTER_RIGHT = parseSprite('pointer_right', [
	'#...',
	'##..',
	'###.',
	'####',
	'###.',
	'##..',
	'#...',
]);

/** A selection pointer aimed left (placed right of the shield). 4 x 7. */
const POINTER_LEFT = parseSprite('pointer_left', [
	'...#',
	'..##',
	'.###',
	'####',
	'.###',
	'..##',
	'...#',
]);

/** A sword pointing right: grip, crossguard, blade, tip. 17 x 6. */
const SWORD_RIGHT = parseSprite('sword_right', [
	'.....#...........',
	'.....#...........',
	'####.###########.',
	'####.############',
	'.....#...........',
	'.....#...........',
]);

/** A sword pointing left. 17 x 6. */
const SWORD_LEFT = parseSprite('sword_left', [
	'...........#.....',
	'...........#.....',
	'.###########.####',
	'############.####',
	'...........#.....',
	'...........#.....',
]);

/** Two swords crossed -- the War's motif once the blades meet. 11 x 8. */
const CROSSED_SWORDS = parseSprite('crossed_swords', [
	'#.........#',
	'.#.......#.',
	'..#.....#..',
	'...#...#...',
	'....#.#....',
	'.....#.....',
	'..##.#.##..',
	'.#.......#.',
]);

/** A clash of sparks. 7 x 7. */
const SPARK = parseSprite('spark', [
	'...#...',
	'.#.#.#.',
	'..###..',
	'#######',
	'..###..',
	'.#.#.#.',
	'...#...',
]);

/** A gold coin -- the Jackpot's motif. 7 x 7. */
const COIN = parseSprite('coin', [
	'..###..',
	'.#...#.',
	'#..#..#',
	'#.###.#',
	'#..#..#',
	'.#...#.',
	'..###..',
]);

/** Every sprite, by name. */
export const DMD_SPRITES: Readonly<Record<string, DmdSprite>> = {
	dragon: DRAGON,
	knight: KNIGHT,
	flame: FLAME,
	flame_short: FLAME_SHORT,
	wyrm_up: WYRM_UP,
	wyrm_down: WYRM_DOWN,
	shield: SHIELD,
	pointer_right: POINTER_RIGHT,
	pointer_left: POINTER_LEFT,
	sword_right: SWORD_RIGHT,
	sword_left: SWORD_LEFT,
	crossed_swords: CROSSED_SWORDS,
	spark: SPARK,
	coin: COIN,
};

/** One authored frame of a sequence: what is placed, and for how long (ms; `sequences.ts` converts to ticks with `frame.ts`'s `msToTicks`). */
export interface DmdArtFrame {
	readonly placements: readonly DmdSpritePlacement[];
	readonly holdMs: number;
}

function place(sprite: DmdSprite, col: number, row: number): DmdSpritePlacement {
	return { sprite, col, row };
}

// --- Attract: the dragon and the knight, a scene on the PRESS START screen.
// Stage rows 8-31. Both stand on row 30; the fire comes out of the jaws
// (dragon row 11) toward the knight.
const DRAGON_COL = 84;
const DRAGON_ROW = 9;
const KNIGHT_ROW = 13;
const FLAME_ROW = DRAGON_ROW + 11 - 3;
const dragonAt = place(DRAGON, DRAGON_COL, DRAGON_ROW);

/** Six frames of 500 ms: 3000 ms in all, the length of the PRESS START hold. */
export const ATTRACT_FRAMES: readonly DmdArtFrame[] = [
	{ placements: [dragonAt], holdMs: 500 },
	{ placements: [dragonAt, place(KNIGHT, 2, KNIGHT_ROW)], holdMs: 500 },
	{ placements: [dragonAt, place(KNIGHT, 18, KNIGHT_ROW)], holdMs: 500 },
	{ placements: [dragonAt, place(KNIGHT, 34, KNIGHT_ROW), place(FLAME_SHORT, DRAGON_COL - FLAME_SHORT.width, FLAME_ROW)], holdMs: 500 },
	{ placements: [dragonAt, place(KNIGHT, 34, KNIGHT_ROW), place(FLAME, DRAGON_COL - FLAME.width, FLAME_ROW)], holdMs: 500 },
	{ placements: [dragonAt, place(KNIGHT, 46, KNIGHT_ROW)], holdMs: 500 },
];

// --- The in-game strip: rows 24-31, the panel's bottom line. It is clear of
// text on game_over and on the 1-player score screen; with 2-4 players up the
// mode fields line shares these rows, and text wins there (DW-320).
const STRIP_ROW = 24;

/** Match: a small wyrm flaps across the strip, left to right. Ten frames of 250 ms: 2500 ms. No digits. */
export const MATCH_FRAMES: readonly DmdArtFrame[] = Array.from({ length: 10 }, (_, i) => ({
	placements: [place(i % 2 === 0 ? WYRM_UP : WYRM_DOWN, Math.round((i * (128 - WYRM_UP.width)) / 9), STRIP_ROW + 1)],
	holdMs: 250,
}));

/** The shield's left column: centred on the strip. */
const SHIELD_COL = 64 - Math.ceil(SHIELD.width / 2);
/** Mode prompt: two pointers close in on a shield, twice. Eight frames of 250 ms: 2000 ms. */
export const MODE_PROMPT_FRAMES: readonly DmdArtFrame[] = [24, 16, 8, 2, 24, 16, 8, 2].map((gap) => ({
	placements: [
		place(SHIELD, SHIELD_COL, STRIP_ROW),
		place(POINTER_RIGHT, SHIELD_COL - gap - POINTER_RIGHT.width, STRIP_ROW),
		place(POINTER_LEFT, SHIELD_COL + SHIELD.width + gap, STRIP_ROW),
	],
	holdMs: 250,
}));

/** The crossed swords' left column: centred on the strip. */
const CROSSED_COL = 64 - Math.ceil(CROSSED_SWORDS.width / 2);
const SWORD_ROW = STRIP_ROW + 1;
/** War start: two swords charge in from the panel's edges, cross at the centre and strike sparks. Eight frames of 250 ms: 2000 ms. */
export const WAR_START_FRAMES: readonly DmdArtFrame[] = [
	...[0, 14, 28, 40].map((offset) => ({
		placements: [place(SWORD_RIGHT, offset, SWORD_ROW), place(SWORD_LEFT, 128 - SWORD_LEFT.width - offset, SWORD_ROW)],
		holdMs: 250,
	})),
	{ placements: [place(CROSSED_SWORDS, CROSSED_COL, STRIP_ROW)], holdMs: 250 },
	{ placements: [place(CROSSED_SWORDS, CROSSED_COL, STRIP_ROW), place(SPARK, CROSSED_COL - 12, STRIP_ROW), place(SPARK, CROSSED_COL + CROSSED_SWORDS.width + 5, STRIP_ROW)], holdMs: 250 },
	{ placements: [place(CROSSED_SWORDS, CROSSED_COL, STRIP_ROW)], holdMs: 250 },
	{ placements: [place(CROSSED_SWORDS, CROSSED_COL, STRIP_ROW), place(SPARK, CROSSED_COL - 24, STRIP_ROW + 1), place(SPARK, CROSSED_COL + CROSSED_SWORDS.width + 17, STRIP_ROW + 1)], holdMs: 250 },
];

/** The eight coin slots' left columns, left to right. */
const COIN_COLS = [4, 20, 36, 52, 68, 84, 100, 116];
/** Coin slots in the order they appear: the centre pair first, then outward. */
const COIN_ORDER = [3, 4, 2, 5, 1, 6, 0, 7];
function coinsShown(count: number): DmdSpritePlacement[] {
	return COIN_ORDER.slice(0, count).map((slot) => place(COIN, COIN_COLS[slot]!, STRIP_ROW + (slot % 2)));
}
/** Jackpot: coins spill out from the centre until the strip is full, then glitter. Eight frames of 250 ms: 2000 ms. */
export const JACKPOT_FRAMES: readonly DmdArtFrame[] = [
	{ placements: coinsShown(2), holdMs: 250 },
	{ placements: coinsShown(4), holdMs: 250 },
	{ placements: coinsShown(6), holdMs: 250 },
	{ placements: coinsShown(8), holdMs: 250 },
	{ placements: [...coinsShown(8), place(SPARK, 12, STRIP_ROW), place(SPARK, 60, STRIP_ROW), place(SPARK, 108, STRIP_ROW)], holdMs: 250 },
	{ placements: coinsShown(8), holdMs: 250 },
	{ placements: [...coinsShown(8), place(SPARK, 28, STRIP_ROW + 1), place(SPARK, 76, STRIP_ROW + 1)], holdMs: 250 },
	{ placements: coinsShown(8), holdMs: 250 },
];
