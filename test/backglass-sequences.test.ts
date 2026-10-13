// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.5 -- headless coverage of the Backglass art sequences: every I/O &
// Edge-Case Matrix row, AC 1-3, and every protected-mask case of `raster.ts`'s
// art pass. Synthetic `FrameOutput`s are built with the same snapshot factory
// `test/backglass-frame.test.ts` uses; the real-loop half is
// `test/backglass-sequences-integration.test.ts` and
// `test/backglass-sequences-real-game.test.ts`.
//
// Expected values are authored here as literals (region rows, ms lengths,
// frame counts, the five key names, the sprites each event-keyed sequence
// shows first) in the AC 1, selection, timing and I/O cases. The legibility
// cases then probe every sequence over the host, the region and the frame
// boundaries the map declares -- values those cases bound.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	advanceBackglass,
	renderFrame,
	msToTicks,
	ATTRACT_PROMPT_HOLD_TICKS,
	DMD_COLS,
	DMD_ROWS,
	INITIAL_BACKGLASS_VIEW,
	type BackglassView,
	type DmdFrame,
	type DmdRow,
	type DmdScreen,
	type DmdSprite,
	type HeldMatch,
} from '../src/presentation/backglass/frame';
import { rasterise, type DmdRaster } from '../src/presentation/backglass/raster';
import { FONT_5X7, GLYPH_H, GLYPH_W } from '../src/presentation/backglass/font';
import { DMD_SPRITES, parseSprite } from '../src/presentation/backglass/dmd-art';
import {
	activeSequenceFrame,
	advanceSequences,
	composeSequence,
	BACKGLASS_SEQUENCES,
	INITIAL_SEQUENCE_VIEW,
	type SequenceView,
} from '../src/presentation/backglass/sequences';
import { BASE_GAME_STATE, buildPlayer, buildSnapshot } from './util/snapshot-factory';
import type { FrameOutput, GameState } from '../src/sim/table/names';

const REPO_ROOT = path.resolve(__dirname, '..');
const BACKGLASS_DIR = path.join(REPO_ROOT, 'src', 'presentation', 'backglass');

/** A synthetic semantic event of any `type`, including the three Epic 3 has not declared yet. */
function event(type: string, tick: number, extra: Record<string, unknown> = {}): FrameOutput['events'][number] {
	return { type, tick, ...extra } as unknown as FrameOutput['events'][number];
}

function output(game: GameState, tick: number, events: FrameOutput['events'] = []): FrameOutput {
	return { snapshot: buildSnapshot({ tick, game: { ...game, tick } }), events, contactEvents: [], commands: [] };
}

function gameWith(phase: GameState['phase'], playerCount: number, withFields: boolean): GameState {
	const players = Array.from({ length: playerCount }, (_, i) => buildPlayer({ score: 1000 * (i + 1) + 350, ballNumber: 2 }));
	const modes: GameState['modes'] = withFields ? [{ mode: 'skill_shot', priority: 200, player: 0, timerTicks: 4500, value: 7 }] : [];
	return { ...BASE_GAME_STATE, phase, players, currentPlayer: playerCount > 1 ? 1 : 0, modes };
}

/** The frame `renderFrame()` builds for `screen` over `game` -- the no-art baseline. */
function baseFrame(screen: DmdScreen, game: GameState, heldMatch: HeldMatch | null = null): DmdFrame {
	const view: BackglassView = { ...INITIAL_BACKGLASS_VIEW, screen, heldMatch };
	return renderFrame(view, buildSnapshot({ game }));
}

/** Every dot index inside some text row's protected box `[col-1, col+6n-1] x [row-1, row+7]`, clipped to the panel (authored here, not imported). */
function protectedIndices(rows: readonly DmdRow[]): Set<number> {
	const out = new Set<number>();
	for (const row of rows) {
		const n = Math.min(row.text.length, 21);
		for (let r = row.row - 1; r <= row.row + 7; r++) {
			for (let c = row.col - 1; c <= row.col + 6 * n - 1; c++) {
				if (r >= 0 && r < DMD_ROWS && c >= 0 && c < DMD_COLS) {
					out.add(r * DMD_COLS + c);
				}
			}
		}
	}
	return out;
}

/** Indices where two rasters differ. */
function diffIndices(a: DmdRaster, b: DmdRaster): number[] {
	const out: number[] = [];
	for (let i = 0; i < a.dots.length; i++) {
		if (a.dots[i] !== b.dots[i]) {
			out.push(i);
		}
	}
	return out;
}

/** The first tick of each frame of `key`'s sequence, relative to its start, plus one tick inside each frame. */
function frameProbeOffsets(key: string): number[] {
	const offsets: number[] = [];
	let at = 0;
	for (const frame of BACKGLASS_SEQUENCES[key]!.frames) {
		offsets.push(at, at + Math.floor(frame.holdTicks / 2));
		at += frame.holdTicks;
	}
	return offsets;
}

const FIVE_KEYS = ['mode_attract_started', 'match_drawn', 'lock_lane_mode_start', 'war_started', 'jackpot_awarded'];
const IN_GAME_KEYS = ['lock_lane_mode_start', 'war_started', 'jackpot_awarded'];
/**
 * The sprites each event-keyed sequence places on its FIRST frame, by name and
 * sorted -- authored here from the art's own descriptions (`dmd-art.ts`, the
 * `ATTRIBUTIONS.md` row), never read from the map: a wyrm for Match, two
 * pointers closing on a shield for the Mode prompt, two swords charging in for
 * the War start, the first two coins for the Jackpot. Two keys swapped in the
 * map must fail against this.
 */
const FIRST_FRAME_SPRITES: Readonly<Record<string, readonly string[]>> = {
	match_drawn: ['wyrm_up'],
	lock_lane_mode_start: ['pointer_left', 'pointer_right', 'shield'],
	war_started: ['sword_left', 'sword_right'],
	jackpot_awarded: ['coin', 'coin'],
};
/** The names of the sprites `frame`'s art places, sorted; `null` when it carries no art. */
function placedSpriteNames(frame: DmdFrame): string[] | null {
	return frame.art ? frame.art.placements.map((p) => p.sprite.name).sort() : null;
}
const ALL_SCREENS: readonly DmdScreen[] = ['attract_prompt', 'attract_scores', 'attract_keys', 'score', 'ball_ended', 'tilt_warning', 'tilt', 'game_over'];

// ---------------------------------------------------------------------------
// AC 1 -- authoring
// ---------------------------------------------------------------------------

describe('AC 1 -- the five sequences, as authored', () => {
	it('the map has exactly the five keys, on the host screens and regions the spec names', () => {
		expect(Object.keys(BACKGLASS_SEQUENCES).sort()).toEqual([...FIVE_KEYS].sort());
		const attract = BACKGLASS_SEQUENCES['mode_attract_started']!;
		expect([attract.host, attract.region, attract.repeat]).toEqual(['attract_prompt', { rowMin: 8, rowMax: 31, colMin: 0, colMax: 127 }, true]);
		const match = BACKGLASS_SEQUENCES['match_drawn']!;
		expect([match.host, match.region.rowMin, match.region.rowMax, match.repeat]).toEqual(['game_over', 24, 31, false]);
		for (const key of IN_GAME_KEYS) {
			const seq = BACKGLASS_SEQUENCES[key]!;
			expect([seq.host, seq.region.rowMin, seq.region.rowMax, seq.repeat], key).toEqual(['score', 24, 31, false]);
		}
	});

	it('the match_drawn key is typed against the declared event union (source: `satisfies EventName`)', () => {
		const source = readFileSync(path.join(BACKGLASS_DIR, 'sequences.ts'), 'utf8');
		expect(source).toContain("'match_drawn' satisfies EventName");
	});

	it('every sprite parses: named, non-empty, dots sized width x height and 1-bit', () => {
		const names = Object.keys(DMD_SPRITES);
		expect(names.length).toBeGreaterThanOrEqual(2);
		for (const [name, sprite] of Object.entries(DMD_SPRITES)) {
			expect(sprite.name).toBe(name);
			expect(sprite.width * sprite.height, name).toBeGreaterThan(0);
			expect(sprite.dots.length, name).toBe(sprite.width * sprite.height);
			expect(sprite.dots.every((d) => d === 0 || d === 1), name).toBe(true);
			expect(sprite.dots.some((d) => d === 1), `${name} must light at least one dot`).toBe(true);
		}
	});

	it('every sprite a frame places is the DMD_SPRITES entry of its name, and every entry is placed -- so the parse and glyph checks cover exactly what is drawn', () => {
		const placedNames = new Set<string>();
		let placed = 0;
		for (const [key, seq] of Object.entries(BACKGLASS_SEQUENCES)) {
			seq.frames.forEach((frame, index) => {
				for (const p of frame.placements) {
					placed += 1;
					placedNames.add(p.sprite.name);
					expect(DMD_SPRITES[p.sprite.name], `${key} #${index} places "${p.sprite.name}"`).toBe(p.sprite);
				}
			});
		}
		expect(placed, 'sanity: placements were checked').toBeGreaterThan(50);
		expect([...placedNames].sort()).toEqual(Object.keys(DMD_SPRITES).sort());
	});

	it('grid/region containment: every lit dot of every placement of every frame lies inside 128 x 32 AND inside its sequence region -- unclipped', () => {
		const violations: string[] = [];
		let checked = 0;
		for (const [key, seq] of Object.entries(BACKGLASS_SEQUENCES)) {
			seq.frames.forEach((frame, index) => {
				expect(frame.placements.length, `${key} #${index} must place something`).toBeGreaterThan(0);
				for (const p of frame.placements) {
					for (let sy = 0; sy < p.sprite.height; sy++) {
						for (let sx = 0; sx < p.sprite.width; sx++) {
							if (p.sprite.dots[sy * p.sprite.width + sx] !== 1) {
								continue;
							}
							checked += 1;
							const r = p.row + sy;
							const c = p.col + sx;
							const where = `${key} #${index} ${p.sprite.name} dot (${r},${c})`;
							if (!(r >= 0 && r < 32 && c >= 0 && c < 128)) {
								violations.push(`${where} is off the 128 x 32 grid`);
							} else if (!(r >= seq.region.rowMin && r <= seq.region.rowMax && c >= seq.region.colMin && c <= seq.region.colMax)) {
								violations.push(`${where} is outside the region`);
							}
						}
					}
				}
			});
		}
		expect(checked, 'sanity: dots were checked').toBeGreaterThan(1000);
		expect(violations).toEqual([]);
	});

	it('composed onto an empty host frame, every lit dot is inside the region (the rasteriser adds nothing outside it)', () => {
		for (const [key, seq] of Object.entries(BACKGLASS_SEQUENCES)) {
			seq.frames.forEach((frame, index) => {
				const raster = rasterise({ screen: seq.host, rows: [], art: { region: seq.region, placements: frame.placements } }, FONT_5X7);
				let lit = 0;
				raster.dots.forEach((d, i) => {
					if (d === 1) {
						lit += 1;
						const r = Math.floor(i / 128);
						expect(r >= seq.region.rowMin && r <= seq.region.rowMax, `${key} #${index} lit row ${r}`).toBe(true);
					}
				});
				expect(lit, `${key} #${index} lights dots`).toBeGreaterThan(0);
			});
		}
	});

	it('sequence lengths: Attract >= 4 frames and <= the PRESS START hold (3000 ms); Match <= 2500 ms; each in-game sequence <= 2000 ms', () => {
		const attract = BACKGLASS_SEQUENCES['mode_attract_started']!;
		expect(attract.frames.length).toBeGreaterThanOrEqual(4);
		expect(ATTRACT_PROMPT_HOLD_TICKS).toBe(msToTicks(3000));
		expect(attract.durationTicks).toBeLessThanOrEqual(ATTRACT_PROMPT_HOLD_TICKS);
		expect(BACKGLASS_SEQUENCES['match_drawn']!.durationTicks).toBeLessThanOrEqual(msToTicks(2500));
		for (const key of IN_GAME_KEYS) {
			expect(BACKGLASS_SEQUENCES[key]!.durationTicks, key).toBeLessThanOrEqual(msToTicks(2000));
		}
		for (const seq of Object.values(BACKGLASS_SEQUENCES)) {
			expect(seq.durationTicks).toBe(seq.frames.reduce((sum, f) => sum + f.holdTicks, 0));
		}
	});

	it('ATTRIBUTIONS.md carries the dmd-art.ts Generated-content row naming Claude Code and 2026-09-30', () => {
		const attributions = readFileSync(path.join(REPO_ROOT, 'ATTRIBUTIONS.md'), 'utf8');
		const row = attributions.split('\n').find((line) => line.startsWith('| `src/presentation/backglass/dmd-art.ts`'));
		expect(row, 'the dmd-art.ts row must exist').toBeDefined();
		expect(row).toContain('Claude Code');
		expect(row).toContain('2026-09-30');
		expect(row).toContain('drawn in code as ASCII dot masks at 128x32; no third-party art or font; nothing traced from a commercial machine');
	});

	it('no sequence uses a font: neither dmd-art.ts nor sequences.ts imports font.ts', () => {
		// Any module specifier ending in `/font`, with or without a `.js`/`.ts` extension -- a `from`, a bare or a dynamic import alike.
		const importsFont = /['"][^'"\n]*\/font(?:\.[jt]s)?['"]/;
		// Positive controls: the scan fires on the one Backglass file that does import the font, and on each form.
		expect(importsFont.test(readFileSync(path.join(BACKGLASS_DIR, 'raster.ts'), 'utf8')), 'control: raster.ts imports ./font').toBe(true);
		for (const form of ["from './font'", 'from "./font.js"', "import('../backglass/font.ts')"]) {
			expect(importsFont.test(form), `control: ${form}`).toBe(true);
		}
		for (const file of ['dmd-art.ts', 'sequences.ts']) {
			const source = readFileSync(path.join(BACKGLASS_DIR, file), 'utf8');
			expect(importsFont.test(source), `${file} must not import ./font`).toBe(false);
		}
	});
});

describe('Malformed sprite -- load-time throw naming the sprite', () => {
	it('a ragged row throws, naming the sprite -- a row shorter OR longer than the first', () => {
		expect(() => parseSprite('bad_ragged', ['##.', '#.'])).toThrow(/bad_ragged/);
		// A LONGER row is the case only the width check catches: its extra dots would otherwise be dropped in silence.
		// (A shorter row also trips the character check, so on its own it cannot tell the two guards apart.)
		expect(() => parseSprite('bad_long', ['#.', '##.'])).toThrow(/bad_long/);
	});
	it('a character other than # and . throws, naming the sprite', () => {
		expect(() => parseSprite('bad_char', ['#x#'])).toThrow(/bad_char/);
		expect(() => parseSprite('bad_space', ['# #'])).toThrow(/bad_space/);
	});
	it('an empty mask throws, naming the sprite -- no rows, or rows with no dots', () => {
		expect(() => parseSprite('bad_empty', [])).toThrow(/bad_empty/);
		// Rows of zero width: only the width half of the guard catches these (they would otherwise parse to a 0 x 1 sprite).
		expect(() => parseSprite('bad_blank', [''])).toThrow(/bad_blank/);
	});
	it('control: a well-formed mask parses to the expected dots', () => {
		const sprite = parseSprite('ok', ['#.', '.#']);
		expect([sprite.width, sprite.height, Array.from(sprite.dots)]).toEqual([2, 2, [1, 0, 0, 1]]);
	});
});

// ---------------------------------------------------------------------------
// Task 3 -- raster.ts's art pass: the protected mask and region clipping
// ---------------------------------------------------------------------------

describe('Task 3 -- rasterise() art pass: text wins, region and grid clip', () => {
	const DOT = parseSprite('dot', ['#']);
	const FULL_REGION = { rowMin: 0, rowMax: 31, colMin: 0, colMax: 127 };
	const TEXT: DmdRow = { text: 'AB', col: 10, row: 10, emphasis: false };

	function litAt(frame: DmdFrame, r: number, c: number): boolean {
		return rasterise(frame, FONT_5X7).dots[r * 128 + c] === 1;
	}
	function withDot(rows: DmdRow[], r: number, c: number): DmdFrame {
		return { screen: 'score', rows, art: { region: FULL_REGION, placements: [{ sprite: DOT, col: c, row: r }] } };
	}

	it('a dot on each edge of the protected box [col-1, col+6n-1] x [row-1, row+7] is suppressed', () => {
		// n = 2: box cols 9..21, rows 9..17. The glyph pixels there are unlit (gutters, box rim).
		for (const [r, c] of [[9, 9], [9, 21], [17, 9], [17, 21], [9, 15], [13, 9], [13, 21]] as const) {
			expect(litAt(withDot([TEXT], r, c), r, c), `(${r},${c}) is inside the box`).toBe(false);
			expect(litAt({ screen: 'score', rows: [TEXT] }, r, c), `sanity: (${r},${c}) is unlit in the baseline`).toBe(false);
		}
	});

	it('a dot just outside each edge is drawn', () => {
		for (const [r, c] of [[8, 9], [18, 9], [13, 8], [13, 22]] as const) {
			expect(litAt(withDot([TEXT], r, c), r, c), `(${r},${c}) is outside the box`).toBe(true);
		}
	});

	it('the box uses the CLAMPED length (21 characters): a 25-character row at col 0 protects cols 0..125, not 126-127', () => {
		const long: DmdRow = { text: 'ABCDEFGHIJKLMNOPQRSTUVWXY', col: 0, row: 0, emphasis: false };
		expect(litAt({ screen: 'score', rows: [long] }, 3, 126), 'sanity: (3,126) is unlit in the baseline, so it is the art that lights it below').toBe(false);
		expect(litAt(withDot([long], 3, 126), 3, 126)).toBe(true);
		expect(litAt(withDot([long], 3, 125), 3, 125)).toBe(false);
	});

	it('every row is protected, emphasised or not, and the emphasis inversion is untouched', () => {
		const emph: DmdRow = { ...TEXT, emphasis: true };
		const baseline = rasterise({ screen: 'score', rows: [emph] }, FONT_5X7);
		const sprite = parseSprite('block', Array.from({ length: 32 }, () => '#'.repeat(128)));
		const composed = rasterise({ screen: 'score', rows: [emph], art: { region: FULL_REGION, placements: [{ sprite, col: 0, row: 0 }] } }, FONT_5X7);
		const box = protectedIndices([emph]);
		for (const i of box) {
			expect(composed.dots[i], `protected dot ${i}`).toBe(baseline.dots[i]);
		}
		// Positive: every dot outside the box is lit by the full block.
		for (let i = 0; i < composed.dots.length; i++) {
			if (!box.has(i)) {
				expect(composed.dots[i]).toBe(1);
			}
		}
	});

	it('region clipping: nothing is lit outside the region on any of its four edges, and the part inside it is drawn', () => {
		const sprite = parseSprite('bar', ['##########']);
		// A one-row region that ends ABOVE the panel's last row, so its bottom edge is the region's and not the grid's.
		const region = { rowMin: 24, rowMax: 24, colMin: 20, colMax: 24 };
		const raster = rasterise({ screen: 'score', rows: [], art: { region, placements: [{ sprite, col: 16, row: 24 }, { sprite, col: 16, row: 23 }, { sprite, col: 16, row: 25 }] } }, FONT_5X7);
		const lit: Array<[number, number]> = [];
		raster.dots.forEach((d, i) => d === 1 && lit.push([Math.floor(i / 128), i % 128]));
		expect(lit).toEqual([[24, 20], [24, 21], [24, 22], [24, 23], [24, 24]]);
	});

	it('placement off the grid (negative, or past the panel edge) is clipped and never throws', () => {
		const sprite = parseSprite('sq', ['###', '###', '###']);
		const frame: DmdFrame = {
			screen: 'score',
			rows: [],
			art: {
				region: { rowMin: -10, rowMax: 50, colMin: -10, colMax: 200 },
				placements: [
					{ sprite, col: -1, row: -1 },
					{ sprite, col: 126, row: 30 },
					{ sprite, col: 500, row: 500 },
					{ sprite, col: -500, row: 5 },
				],
			},
		};
		expect(() => rasterise(frame, FONT_5X7)).not.toThrow();
		const lit: Array<[number, number]> = [];
		rasterise(frame, FONT_5X7).dots.forEach((d, i) => d === 1 && lit.push([Math.floor(i / 128), i % 128]));
		expect(lit).toEqual([[0, 0], [0, 1], [1, 0], [1, 1], [30, 126], [30, 127], [31, 126], [31, 127]]);
	});

	it('a frame without art, and art with no placements, rasterise byte-identically to the text alone', () => {
		const rows = [TEXT];
		const plain = rasterise({ screen: 'score', rows }, FONT_5X7);
		const empty = rasterise({ screen: 'score', rows, art: { region: FULL_REGION, placements: [] } }, FONT_5X7);
		expect(Array.from(empty.dots)).toEqual(Array.from(plain.dots));
		expect(plain.dots.some((d) => d === 1), 'sanity: the text lights dots').toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC 2 -- selection and timing
// ---------------------------------------------------------------------------

describe('AC 2 (selection and timing) -- the map lookup, the event tick, restarts', () => {
	const gameOver = gameWith('game_over', 1, false);
	const scoreGame = gameWith('game', 1, false);
	const gameOverView: BackglassView = { ...INITIAL_BACKGLASS_VIEW, screen: 'game_over' };
	const scoreView: BackglassView = { ...INITIAL_BACKGLASS_VIEW, screen: 'score' };

	it('match_drawn selects Match, timed from event.tick -- NOT snapshot.tick', () => {
		// The event fired at 10000; the frame carrying it ends at 10016.
		const seq = advanceSequences(INITIAL_SEQUENCE_VIEW, gameOverView, output(gameOver, 10016, [event('match_drawn', 10000, { number: 0, winners: [0] })]));
		expect(seq.active).toEqual({ key: 'match_drawn', startTick: 10000 });
		// 250 ms frames: 10250 is frame 1 from the event's tick (it would still be frame 0 from 10016).
		expect(activeSequenceFrame(seq, 'game_over', 10249)).toEqual({ key: 'match_drawn', index: 0 });
		expect(activeSequenceFrame(seq, 'game_over', 10250)).toEqual({ key: 'match_drawn', index: 1 });
		expect(activeSequenceFrame(seq, 'game_over', 12499)).toEqual({ key: 'match_drawn', index: 9 });
		expect(activeSequenceFrame(seq, 'game_over', 12500), 'Match ends at startTick + 2500').toBeNull();
		// And it is the Match ART the key shows: the wyrm, by name.
		expect(placedSpriteNames(composeSequence(baseFrame('game_over', gameOver), seq, 10016))).toEqual(FIRST_FRAME_SPRITES['match_drawn']);
	});

	it.each(IN_GAME_KEYS)('future key %s: a synthetic event selects its sequence through the same lookup, and it composes on the score screen', (key) => {
		const seq = advanceSequences(INITIAL_SEQUENCE_VIEW, scoreView, output(scoreGame, 500, [event(key, 490)]));
		expect(seq.active).toEqual({ key, startTick: 490 });
		const composed = composeSequence(baseFrame('score', scoreGame), seq, 500);
		// Which ART the key shows, as a literal: reading it back from the map would pass with two keys' frames swapped.
		expect(placedSpriteNames(composed), `${key} shows its own motif on its first frame`).toEqual(FIRST_FRAME_SPRITES[key]);
	});

	it('control: events stripped -- the same game_over frames with events: [] never select or draw Match', () => {
		let withEvents: SequenceView = INITIAL_SEQUENCE_VIEW;
		let stripped: SequenceView = INITIAL_SEQUENCE_VIEW;
		let artFrames = 0;
		for (let tick = 9000; tick <= 13000; tick += 16) {
			const events = tick === 10008 ? [event('match_drawn', 10000, { number: 0, winners: [0] })] : [];
			withEvents = advanceSequences(withEvents, gameOverView, output(gameOver, tick, events));
			stripped = advanceSequences(stripped, gameOverView, output(gameOver, tick, []));
			if (composeSequence(baseFrame('game_over', gameOver), withEvents, tick).art) {
				artFrames += 1;
			}
			expect(stripped.active, `tick ${tick}: nothing selected without the event`).toBeNull();
			expect(composeSequence(baseFrame('game_over', gameOver), stripped, tick).art, `tick ${tick}`).toBeUndefined();
		}
		expect(artFrames, 'positive: with the event, Match draws for its window').toBeGreaterThan(100);
	});

	it('two keyed events in one output: the later tick wins, regardless of array order', () => {
		const a = advanceSequences(INITIAL_SEQUENCE_VIEW, scoreView, output(scoreGame, 120, [event('war_started', 100), event('jackpot_awarded', 110)]));
		expect(a.active).toEqual({ key: 'jackpot_awarded', startTick: 110 });
		const b = advanceSequences(INITIAL_SEQUENCE_VIEW, scoreView, output(scoreGame, 120, [event('jackpot_awarded', 110), event('war_started', 100)]));
		expect(b.active).toEqual({ key: 'jackpot_awarded', startTick: 110 });
	});

	it('a new keyed event restarts rather than queueing -- even the same key', () => {
		let seq = advanceSequences(INITIAL_SEQUENCE_VIEW, scoreView, output(scoreGame, 100, [event('war_started', 100)]));
		seq = advanceSequences(seq, scoreView, output(scoreGame, 600, [event('jackpot_awarded', 600)]));
		expect(seq.active).toEqual({ key: 'jackpot_awarded', startTick: 600 });
		seq = advanceSequences(seq, scoreView, output(scoreGame, 900, [event('jackpot_awarded', 900)]));
		expect(seq.active).toEqual({ key: 'jackpot_awarded', startTick: 900 });
		expect(activeSequenceFrame(seq, 'score', 900)).toEqual({ key: 'jackpot_awarded', index: 0 });
	});

	it('an unkeyed event changes nothing', () => {
		const start = advanceSequences(INITIAL_SEQUENCE_VIEW, scoreView, output(scoreGame, 100, [event('war_started', 100)]));
		// Including two names every object inherits: the map lookup must be by OWN key only.
		const next = advanceSequences(start, scoreView, output(scoreGame, 200, [event('ball_saved', 190), event('tilt_warning', 195, { remaining: 1 }), event('constructor', 196), event('toString', 197)]));
		expect(next).toEqual(start);
	});

	it('restarted timeline: a tick below startTick shows no art and drops the stale sequence', () => {
		const seq = advanceSequences(INITIAL_SEQUENCE_VIEW, scoreView, output(scoreGame, 5000, [event('war_started', 5000)]));
		expect(activeSequenceFrame(seq, 'score', 5000), 'positive: it shows at its start').not.toBeNull();
		expect(activeSequenceFrame(seq, 'score', 100)).toBeNull();
		expect(composeSequence(baseFrame('score', scoreGame), seq, 100).art).toBeUndefined();
		const after = advanceSequences(seq, scoreView, output(scoreGame, 100, []));
		expect(after.active).toBeNull();
	});

	it('restarted timeline on the PRESS START screen: Attract restarts at the current tick', () => {
		const promptView: BackglassView = { ...INITIAL_BACKGLASS_VIEW, screen: 'attract_prompt' };
		const attract = gameWith('attract', 0, false);
		const running = advanceSequences(INITIAL_SEQUENCE_VIEW, promptView, output(attract, 9000));
		expect(running.active).toEqual({ key: 'mode_attract_started', startTick: 9000 });
		const restarted = advanceSequences(running, promptView, output(attract, 40));
		expect(restarted.active).toEqual({ key: 'mode_attract_started', startTick: 40 });
		// Control: a continuing prompt frame does not restart it.
		const continuing = advanceSequences(running, promptView, output(attract, 9100));
		expect(continuing.active).toEqual({ key: 'mode_attract_started', startTick: 9000 });
	});

	it('off-host screen: a keyed event while ball_ended is held -- the timeline runs, nothing is drawn, it resumes on score only inside its window', () => {
		const heldView: BackglassView = { ...INITIAL_BACKGLASS_VIEW, screen: 'ball_ended', holdUntilTick: 3000 };
		const seq = advanceSequences(INITIAL_SEQUENCE_VIEW, heldView, output(scoreGame, 1000, [event('war_started', 1000)]));
		expect(seq.active).toEqual({ key: 'war_started', startTick: 1000 });
		const heldFrame = renderFrame({ ...heldView, heldBallEnded: { player: 0, score: 1350, bonusRunning: null } }, buildSnapshot({ game: scoreGame }));
		expect(composeSequence(heldFrame, seq, 1200)).toBe(heldFrame);
		expect(activeSequenceFrame(seq, 'score', 1500), 'resumes at the frame due at that tick').toEqual({ key: 'war_started', index: 2 });
		expect(activeSequenceFrame(seq, 'score', 3000), 'its window has closed').toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC 2 -- legibility, at every host layout
// ---------------------------------------------------------------------------

interface Layout {
	readonly label: string;
	readonly game: GameState;
	readonly heldMatch: HeldMatch | null;
}

function layoutsFor(host: DmdScreen): Layout[] {
	const layouts: Layout[] = [];
	for (let players = 0; players <= 4; players++) {
		if (host === 'score') {
			for (const fields of [false, true]) {
				layouts.push({ label: `${players} players ${fields ? 'with' : 'without'} fields`, game: gameWith('game', players, fields), heldMatch: null });
			}
		} else if (host === 'game_over') {
			layouts.push({ label: `${players} players, no reveal`, game: gameWith('game_over', players, false), heldMatch: null });
			layouts.push({ label: `${players} players, MATCH shown`, game: gameWith('game_over', players, false), heldMatch: { shown: 30, resolved: true, winners: [0] } });
		} else {
			layouts.push({ label: `${players} players`, game: gameWith('attract', players, false), heldMatch: null });
		}
	}
	return layouts;
}

describe.each(FIVE_KEYS)('AC 2 (legibility) -- %s', (key) => {
	const maybeSeq = BACKGLASS_SEQUENCES[key];
	if (maybeSeq === undefined) {
		// A missing key must fail as a test, not crash collection of the whole file.
		it('is a key of BACKGLASS_SEQUENCES', () => {
			expect(maybeSeq).toBeDefined();
		});
		return;
	}
	const seq = maybeSeq;
	const START = 20000;
	const active: SequenceView = { active: { key, startTick: START }, lastScreen: seq.host };

	it.each(layoutsFor(seq.host).map((l) => [l.label, l] as const))('%s: every dot inside every text protected box equals the no-art baseline, and the art stays in its region', (_label, layout) => {
		const frame = baseFrame(seq.host, layout.game, layout.heldMatch);
		const baseline = rasterise(frame, FONT_5X7);
		const box = protectedIndices(frame.rows);
		for (const offset of frameProbeOffsets(key)) {
			const composed = composeSequence(frame, active, START + offset);
			expect(composed.art, `offset ${offset}: art is composed`).toBeDefined();
			expect(composed.rows, 'no text row is added, removed or moved').toBe(frame.rows);
			const raster = rasterise(composed, FONT_5X7);
			const violations: string[] = [];
			for (const i of diffIndices(raster, baseline)) {
				const r = Math.floor(i / 128);
				if (box.has(i)) {
					violations.push(`offset ${offset}: dot (${r},${i % 128}) changed inside a protected box`);
				}
				if (!(r >= seq.region.rowMin && r <= seq.region.rowMax)) {
					violations.push(`offset ${offset}: changed dot row ${r} outside the region`);
				}
			}
			expect(violations).toEqual([]);
		}
	});

	it('on the 1-player layout (no text inside the region), at least one frame lights dots the baseline does not', () => {
		const layout = layoutsFor(seq.host).find((l) => l.game.players.length === 1)!;
		const frame = baseFrame(seq.host, layout.game, layout.heldMatch);
		const baseline = rasterise(frame, FONT_5X7);
		const boxInRegion = frame.rows.some((r) => r.row + 7 >= seq.region.rowMin && r.row - 1 <= seq.region.rowMax);
		expect(boxInRegion, 'sanity: no text box reaches into the region on this layout').toBe(false);
		const lighting = frameProbeOffsets(key).filter((offset) => diffIndices(rasterise(composeSequence(frame, active, START + offset), FONT_5X7), baseline).length > 0);
		expect(lighting.length).toBeGreaterThan(0);
	});

	it('non-host screens are always byte-identical to the baseline', () => {
		for (const screen of ALL_SCREENS.filter((s) => s !== seq.host)) {
			const game = gameWith(screen === 'score' ? 'game' : screen === 'game_over' ? 'game_over' : 'attract', 2, true);
			const frame = renderFrame({ ...INITIAL_BACKGLASS_VIEW, screen, heldBallEnded: { player: 0, score: 1, bonusRunning: 2 } }, buildSnapshot({ game }));
			for (const offset of frameProbeOffsets(key)) {
				const composed = composeSequence(frame, active, START + offset);
				// The very frame object, so its raster is the baseline's by construction.
				expect(composed, `${screen} at offset ${offset}`).toBe(frame);
			}
		}
	});

	if (!seq.repeat) {
		it('at startTick + duration (and after) the whole raster equals the baseline; one tick earlier it does not', () => {
			const layout = layoutsFor(seq.host).find((l) => l.game.players.length === 1)!;
			const frame = baseFrame(seq.host, layout.game, layout.heldMatch);
			const baseline = Array.from(rasterise(frame, FONT_5X7).dots);
			for (const offset of [seq.durationTicks, seq.durationTicks + 1, seq.durationTicks * 3 + 17]) {
				expect(Array.from(rasterise(composeSequence(frame, active, START + offset), FONT_5X7).dots), `offset ${offset}`).toEqual(baseline);
			}
			const lastTick = composeSequence(frame, active, START + seq.durationTicks - 1);
			expect(lastTick.art, 'positive: the last frame still shows one tick before the end').toBeDefined();
			expect(Array.from(rasterise(lastTick, FONT_5X7).dots), 'positive: and its raster differs from the baseline').not.toEqual(baseline);
		});
	} else {
		it('repeats: past its length it loops back to frame 0', () => {
			expect(activeSequenceFrame(active, seq.host, START + seq.durationTicks)).toEqual({ key, index: 0 });
			expect(activeSequenceFrame(active, seq.host, START + 2 * seq.durationTicks - 1)).toEqual({ key, index: seq.frames.length - 1 });
		});
	}
});

// ---------------------------------------------------------------------------
// I/O rows -- Attract, driven through advanceBackglass() as boot.ts does
// ---------------------------------------------------------------------------

function runAttract(players: GameState['players'], untilTick: number, step = 16): Array<{ tick: number; screen: DmdScreen; seq: SequenceView; frame: DmdFrame; composed: DmdFrame }> {
	const game: GameState = { ...BASE_GAME_STATE, phase: 'attract', players };
	let view = INITIAL_BACKGLASS_VIEW;
	let seq = INITIAL_SEQUENCE_VIEW;
	const out: Array<{ tick: number; screen: DmdScreen; seq: SequenceView; frame: DmdFrame; composed: DmdFrame }> = [];
	for (let tick = 0; tick <= untilTick; tick += step) {
		const frameOutput = output(game, tick);
		view = advanceBackglass(view, frameOutput);
		seq = advanceSequences(seq, view, frameOutput);
		const frame = renderFrame(view, frameOutput.snapshot);
		out.push({ tick, screen: view.screen, seq, frame, composed: composeSequence(frame, seq, tick) });
	}
	return out;
}

describe('I/O -- Cold boot Attract (players: []): keys for 3 s, then the prompt pinned, with the art looping under PRESS START', () => {
	const frames = runAttract([], 12000);

	it('the keys screen shows no art; the first prompt frame starts the Attract sequence at its own tick', () => {
		const firstPrompt = frames.find((f) => f.screen === 'attract_prompt')!;
		expect(firstPrompt.tick, 'sanity: the prompt follows the 3 s keys screen').toBeGreaterThanOrEqual(3000);
		const keys = frames.filter((x) => x.screen === 'attract_keys');
		expect(keys.length, 'sanity: the keys screen showed for its 3 s of 16-tick frames, so the loop below is not empty').toBeGreaterThan(150);
		for (const f of keys) {
			expect(f.composed, `tick ${f.tick}`).toBe(f.frame);
		}
		expect(firstPrompt.seq.active).toEqual({ key: 'mode_attract_started', startTick: firstPrompt.tick });
	});

	it('every prompt frame carries art (it loops), PRESS START stays byte-identical, and art lights rows 8-31 only', () => {
		const prompts = frames.filter((f) => f.screen === 'attract_prompt');
		expect(prompts.length).toBeGreaterThan(400);
		const first = prompts[0]!.tick;
		const indices = new Set<number>();
		for (const f of prompts) {
			const shown = activeSequenceFrame(f.seq, f.screen, f.tick);
			expect(shown, `tick ${f.tick}`).not.toBeNull();
			expect(shown!.index).toBe(Math.floor(((f.tick - first) % 3000) / 500));
			indices.add(shown!.index);
			const baseline = rasterise(f.frame, FONT_5X7);
			const box = protectedIndices(f.frame.rows);
			const diff = diffIndices(rasterise(f.composed, FONT_5X7), baseline);
			expect(diff.length, `tick ${f.tick}: art lights dots`).toBeGreaterThan(0);
			expect(diff.filter((i) => box.has(i) || Math.floor(i / 128) < 8), `tick ${f.tick}: dots changed in PRESS START's box or above row 8`).toEqual([]);
		}
		expect(indices.size, 'all six frames were shown').toBe(6);
	});
});

describe('I/O -- Attract with scores: the art restarts at each prompt phase; the keys and scores rasters are unchanged', () => {
	const frames = runAttract([buildPlayer({ score: 25000 }), buildPlayer({ score: 0 })], 16000);

	it('each prompt phase starts the sequence afresh at its own first frame', () => {
		const starts: number[] = [];
		frames.forEach((f, i) => {
			if (f.screen === 'attract_prompt' && frames[i - 1]?.screen !== 'attract_prompt') {
				starts.push(f.tick);
				expect(f.seq.active).toEqual({ key: 'mode_attract_started', startTick: f.tick });
			}
		});
		expect(starts.length, 'three prompt phases in 16 s (keys 0-3 s, prompt 3-6, scores 6-9, prompt 9-12, scores 12-15, prompt 15-)').toBe(3);
		expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(6000 - 16);
	});

	it('attract_keys and attract_scores rasters are byte-identical to the baseline; prompt frames carry art', () => {
		let prompts = 0;
		for (const f of frames) {
			if (f.screen === 'attract_prompt') {
				prompts += 1;
				expect(f.composed.art).toBeDefined();
				continue;
			}
			expect(Array.from(rasterise(f.composed, FONT_5X7).dots), `${f.screen} at ${f.tick}`).toEqual(Array.from(rasterise(f.frame, FONT_5X7).dots));
		}
		expect(prompts).toBeGreaterThan(0);
		expect(frames.some((f) => f.screen === 'attract_scores')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC 3 -- the Attract scene (proxy; SM-3 pending the author)
// ---------------------------------------------------------------------------

describe('AC 3 (proxy) -- a dragon and a knight, as a scene, in dots not text', () => {
	function litCount(sprite: DmdSprite): number {
		return sprite.dots.reduce((sum, d) => sum + d, 0);
	}

	it('named sprites dragon and knight exist, non-empty, at least 16 rows tall; dragon at least 32 columns wide', () => {
		const dragon = DMD_SPRITES['dragon']!;
		const knight = DMD_SPRITES['knight']!;
		expect(dragon.height).toBeGreaterThanOrEqual(16);
		expect(dragon.width).toBeGreaterThanOrEqual(32);
		expect(knight.height).toBeGreaterThanOrEqual(16);
		expect(litCount(dragon)).toBeGreaterThan(0);
		expect(litCount(knight)).toBeGreaterThan(0);
	});

	it('both-sprites: at least one Attract frame places both the dragon and the knight', () => {
		const both = BACKGLASS_SEQUENCES['mode_attract_started']!.frames.filter((f) => {
			const names = f.placements.map((p) => p.sprite.name);
			return names.includes('dragon') && names.includes('knight');
		});
		expect(both.length).toBeGreaterThan(0);
	});

	it('no Attract frame adds a text row', () => {
		const frame = baseFrame('attract_prompt', gameWith('attract', 0, false));
		const seq = BACKGLASS_SEQUENCES['mode_attract_started']!;
		const active: SequenceView = { active: { key: 'mode_attract_started', startTick: 0 }, lastScreen: 'attract_prompt' };
		let at = 0;
		for (const f of seq.frames) {
			const composed = composeSequence(frame, active, at);
			expect(composed.art, `positive: the frame at ${at} carries art, so the row check below is about a composed frame`).toBeDefined();
			expect(composed.rows).toEqual([{ text: 'PRESS START', col: 2, row: 0, emphasis: false }]);
			at += f.holdTicks;
		}
	});

	/** The FONT_5X7 glyph `sprite`'s bitmap equals, or `null`. A sprite whose size differs from a glyph's cannot equal one; a glyph-sized sprite is packed MSB-first per row, the encoding `raster.ts` reads. */
	function glyphEqualTo(sprite: DmdSprite): string | null {
		if (sprite.width !== GLYPH_W || sprite.height !== GLYPH_H) {
			return null;
		}
		const bits = Array.from({ length: GLYPH_H }, (_, y) => {
			let row = 0;
			for (let x = 0; x < GLYPH_W; x++) {
				row = (row << 1) | sprite.dots[y * GLYPH_W + x]!;
			}
			return row;
		});
		for (const [char, glyph] of Object.entries(FONT_5X7)) {
			if (glyph.length === bits.length && glyph.every((v, i) => v === bits[i])) {
				return char;
			}
		}
		return null;
	}

	it('no sprite bitmap equals a FONT_5X7 glyph', () => {
		// Positive control, cut from what the REAL rasteriser draws for 'R' -- a glyph asymmetric on both axes -- and
		// checked against the mask authored here, so the comparison can go red AND its bit order is the panel's:
		// that sprite is flagged, its mirror image is not.
		const drawn = rasterise({ screen: 'score', rows: [{ text: 'R', col: 0, row: 0, emphasis: false }] }, FONT_5X7);
		const cut = Array.from({ length: GLYPH_H }, (_, y) => Array.from({ length: GLYPH_W }, (_, x) => (drawn.dots[y * DMD_COLS + x] === 1 ? '#' : '.')).join(''));
		expect(cut, 'sanity: the rasterised R is the R authored here').toEqual(['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#']);
		expect(glyphEqualTo(parseSprite('glyph_r', cut)), 'positive control: a sprite cut from the rasterised glyph is flagged').toBe('R');
		const mirrored = cut.map((line) => [...line].reverse().join(''));
		expect(glyphEqualTo(parseSprite('glyph_r_mirrored', mirrored)), 'control: its mirror image is no glyph').toBeNull();
		const sprites = Object.values(DMD_SPRITES);
		expect(sprites.length, 'sanity: every authored sprite is compared').toBe(14);
		expect(sprites.map((s) => [s.name, glyphEqualTo(s)]).filter(([, char]) => char !== null)).toEqual([]);
	});
});
