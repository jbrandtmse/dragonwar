// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.5 (QA) -- the I/O & Edge-Case Matrix rows that had no pin in the
// REAL pipeline. `test/backglass-sequences-integration.test.ts` drives a cold
// boot and a one-player game over; these rows were held by synthetic frames
// only (`test/backglass-sequences.test.ts`):
//
// - "Attract with scores": the prompt/scores cycle only exists after a game,
//   and the one-player run stops 20 frames into its first PRESS START.
// - "Match" at 2-4 players: the real game_over screen with every player's
//   row, after a real end-of-ball hold for every player.
// - "Off-host screen": a keyed event while `ball_ended` is held. The only
//   keyed event this tree emits is `match_drawn`, and at the authored
//   `matchDelayMs` (5 s) it lands after the 3 s hold. Retuned below the hold
//   (the dev tuning panel can do exactly this; `frame.ts` already folds match
//   events during the hold for the same reason) a REAL `match_drawn` lands
//   inside a REAL hold.
// - "Restarted timeline": a tick count that really restarts, through the real
//   `createHostLoop().reset()` -- the seam `boot.ts`'s `reset()` hatch, the
//   tuning panel's hot-apply and replay playback all go through -- while the
//   Backglass view and the sequence view outlive it, as they do in `boot.ts`'s
//   closure.
//
// Every frame goes through `boot.ts`'s `onFrame` order, with the same
// `ViewConfig` it builds: `advanceBackglass()`, `advanceSequences()`, then
// `rasterise(composeSequence(renderFrame(...)))`. "Art" below is always a
// DIFFERENCE between that raster and the same frame rasterised without
// `composeSequence()` (what `setBackglassSequencesEnabled(false)` shows), so
// "no art" means byte-identical to the baseline. Nothing here claims a
// rendered pixel: that is AC 4, the lead's browser capture.
//
// Expected values are literals authored here. The regions (Match in rows
// 24-31, Attract in rows 8-31) are the intent contract's, and the end-of-ball
// hold and the Attract keys, prompt and scores holds are 3000 ticks each. The
// frame counts and holds (Match: ten frames of 250 ms; Attract: six of 500 ms)
// are the as-built art's, as the spec's Auto Run Result records them: the
// intent only bounds those lengths, so art re-timed within its bounds must
// update them here.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME, type Loop } from '../src/sim/loop';
import { createHostLoop } from '../src/host/loop';
import { viewConfigFromKeyMap } from '../src/host/input';
import { advanceBackglass, renderFrame, INITIAL_BACKGLASS_VIEW, type BackglassView, type DmdFrame, type DmdScreen } from '../src/presentation/backglass/frame';
import { rasterise, type DmdRaster } from '../src/presentation/backglass/raster';
import { FONT_5X7 } from '../src/presentation/backglass/font';
import { activeSequenceFrame, advanceSequences, composeSequence, INITIAL_SEQUENCE_VIEW, type SequenceView } from '../src/presentation/backglass/sequences';
import { resolveTuning, TUNING as RAW_TUNING, type ResolvedTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { CoilName, FrameOutput, GameStart } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const DISABLED_HAZARD_COILS: readonly CoilName[] = ['c_pop_1', 'c_pop_2', 'c_pop_3', 'c_sling_l', 'c_sling_r'];
/** One host frame, as a 60 Hz display delivers them. */
const FRAME_MS = 16;
const MAX_FRAMES = 6000;
const ATTRACT_KEY = 'mode_attract_started';
const MATCH_KEY = 'match_drawn';
/** What `boot.ts` hands `renderFrame()`: the real key map's view. */
const VIEW_CONFIG = viewConfigFromKeyMap();

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/**
 * The drain must be a real one, never a ball-save re-serve
 * (`test/game-over-integration.test.ts`). `matchDelayMs` is the lead-in from
 * the last drain to `match_drawn`; the authored 5000 is kept unless a case
 * retunes it.
 */
function tuningWith(matchDelayMs: number = RAW_TUNING.matchDelayMs.value): ResolvedTuning {
	return resolveTuning({
		...RAW_TUNING,
		ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
		ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
		matchDelayMs: { ...RAW_TUNING.matchDelayMs, value: matchDelayMs },
	});
}

/** One ball each, and a guaranteed Match win so the run is deterministic. */
function gameStart(tuning: ResolvedTuning): GameStart {
	return {
		seed: 0,
		tuning,
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 1, matchProbability: 1 },
		highscores: [],
	};
}

/** One observed host frame. */
interface Sample {
	readonly tick: number;
	readonly output: FrameOutput;
	readonly view: BackglassView;
	readonly seq: SequenceView;
	/** `renderFrame()`'s frame: the no-art baseline. */
	readonly frame: DmdFrame;
	/** What `boot.ts` rasterises: `composeSequence(frame, ...)`. */
	readonly composedFrame: DmdFrame;
	/** What `backglassState()` reports: the sequence frame due on this screen. */
	readonly shown: { readonly key: string; readonly index: number } | null;
	readonly composed: DmdRaster;
	/** Dot indices where the composed raster differs from the baseline raster. */
	readonly art: readonly number[];
}

/** `boot.ts`'s `onFrame` order, replicated. The two views live outside whatever loop feeds it, as they do in `boot.ts`'s closure. */
function makeFold(): (output: FrameOutput) => Sample {
	let view = INITIAL_BACKGLASS_VIEW;
	let seq = INITIAL_SEQUENCE_VIEW;
	return (output) => {
		const tick = output.snapshot.tick;
		view = advanceBackglass(view, output);
		seq = advanceSequences(seq, view, output);
		const frame = renderFrame(view, output.snapshot, VIEW_CONFIG);
		const composedFrame = composeSequence(frame, seq, tick);
		const composed = rasterise(composedFrame, FONT_5X7);
		const plain = rasterise(frame, FONT_5X7);
		const art: number[] = [];
		for (let i = 0; i < composed.dots.length; i++) {
			if (composed.dots[i] !== plain.dots[i]) {
				art.push(i);
			}
		}
		return { tick, output, view, seq, frame, composedFrame, shown: activeSequenceFrame(seq, view.screen, tick), composed, art };
	};
}

/** Art dots above `regionRowMin`, or inside a text row's protected box `[col-1, col+6n-1] x [row-1, row+7]` (authored here). */
function strayDots(sample: Sample, regionRowMin: number): number[] {
	const box = new Set<number>();
	for (const row of sample.frame.rows) {
		const n = Math.min(row.text.length, 21);
		for (let r = Math.max(0, row.row - 1); r <= Math.min(31, row.row + 7); r++) {
			for (let c = Math.max(0, row.col - 1); c <= Math.min(127, row.col + 6 * n - 1); c++) {
				box.add(r * 128 + c);
			}
		}
	}
	return sample.art.filter((i) => Math.floor(i / 128) < regionRowMin || box.has(i));
}

const textsOf = (sample: Sample): string[] => sample.frame.rows.map((row) => row.text);

/**
 * A whole real game over a real `createLoop()`: one Start press per player,
 * every ball a gravity drain (hazard coils off, the dev autolaunch standing in
 * for the plunge), through game over and the Match, then `attractTicks` ticks
 * of the Attract that follows. Returns every frame observed.
 */
function playRealGame(options: { readonly players: number; readonly tuning: ResolvedTuning; readonly attractTicks: number }): Sample[] {
	const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(options.tuning), tuning: options.tuning });
	const fold = makeFold();
	const trace: Sample[] = [];
	const step = (ms: number, transitions: Parameters<Loop['advance']>[1] = []): Sample => {
		const sample = fold(loop.advance(ms, transitions));
		trace.push(sample);
		return sample;
	};

	// Hot seat: every press lands while player 1's ball 1 is still in the shooter lane.
	const presses: Array<Parameters<Loop['advance']>[1][number]> = [];
	for (let player = 0; player < options.players; player++) {
		presses.push({ tick: 2 + 8 * player, frame: { ...NO_FRAME, start: true } }, { tick: 3 + 8 * player, frame: NO_FRAME });
	}
	let sample = step(1, presses);
	while (sample.tick < 4 + 8 * (options.players - 1)) {
		sample = step(1);
	}
	for (const coil of DISABLED_HAZARD_COILS) {
		loop.setCoilEnabled(coil, false);
	}
	loop.pulseCoil('c_autolaunch');

	let launchAt = -1;
	let attractAt = -1;
	for (let i = 0; i < MAX_FRAMES; i++) {
		sample = step(FRAME_MS);
		// Every later ball is served to the shooter lane at the previous drain: plunge it a second later.
		if (sample.output.events.some((e) => e.type === 'ball_started')) {
			launchAt = sample.tick + 1000;
		}
		if (launchAt !== -1 && sample.tick >= launchAt) {
			loop.pulseCoil('c_autolaunch');
			launchAt = -1;
		}
		if (attractAt === -1 && sample.output.snapshot.game.phase === 'attract') {
			attractAt = sample.tick;
		}
		if (attractAt !== -1 && sample.tick >= attractAt + options.attractTicks) {
			return trace;
		}
	}
	throw new Error(`playRealGame(): no return to Attract plus ${options.attractTicks} ticks of it within ${MAX_FRAMES} frames`);
}

/** Where the run's milestones fall. Each must genuinely occur, or every case reading them is vacuous. */
function landmarks(trace: readonly Sample[]): { drainIndex: number; drainTick: number; matchIndex: number; matchTick: number; attractIndex: number } {
	let drainIndex = -1;
	let drainTick = -1;
	let matchIndex = -1;
	let matchTick = -1;
	let attractIndex = -1;
	trace.forEach((sample, index) => {
		for (const e of sample.output.events) {
			if (e.type === 'ball_ended') {
				// The last one: the drain that ends the game.
				drainIndex = index;
				drainTick = e.tick;
			} else if (e.type === 'match_drawn' && matchIndex === -1) {
				matchIndex = index;
				matchTick = e.tick;
			}
		}
		if (matchIndex !== -1 && attractIndex === -1 && sample.output.snapshot.game.phase === 'attract') {
			attractIndex = index;
		}
	});
	expect(drainIndex, 'a ball must genuinely drain').toBeGreaterThan(0);
	expect(matchIndex, 'match_drawn must genuinely arrive').toBeGreaterThan(drainIndex);
	expect(attractIndex, 'the machine must genuinely return to Attract').toBeGreaterThan(matchIndex);
	expect(trace[matchIndex]!.tick, 'sanity: match_drawn lands strictly INSIDE its frame, so "timed from event.tick" and "timed from the frame" are different answers').toBeGreaterThan(matchTick);
	return { drainIndex, drainTick, matchIndex, matchTick, attractIndex };
}

/** Consecutive frames grouped by the screen they show. */
function screenRuns(samples: readonly Sample[]): Array<{ screen: DmdScreen; samples: Sample[] }> {
	const runs: Array<{ screen: DmdScreen; samples: Sample[] }> = [];
	for (const sample of samples) {
		const last = runs[runs.length - 1];
		if (last !== undefined && last.screen === sample.view.screen) {
			last.samples.push(sample);
		} else {
			runs.push({ screen: sample.view.screen, samples: [sample] });
		}
	}
	return runs;
}

// ---------------------------------------------------------------------------
// I/O "Match" at 2-4 players, then I/O "Attract with scores"
// ---------------------------------------------------------------------------

describe.each([2, 3, 4])('Story 5.5 (QA) -- a real %i-player game through Match and into the Attract cycle, in boot.ts onFrame order', (playerCount) => {
	let trace: Sample[] = [];

	beforeAll(() => {
		// Attract: keys 3 s, then prompt / scores / prompt / scores / prompt -- half of the third prompt.
		trace = playRealGame({ players: playerCount, tuning: tuningWith(), attractTicks: 16500 });
	}, 120000);

	it('nothing is selected through every player\'s real end-of-ball hold; from match_drawn the Match art plays in rows 24-31 under unchanged player, GAME OVER and reveal rows; none after its window', () => {
		const { matchIndex, matchTick, attractIndex } = landmarks(trace);

		// The game itself: every player is up and every player's ball really ends, each with its own hold.
		const beforeMatch = trace.slice(0, matchIndex);
		const allEvents = trace.flatMap((s) => s.output.events);
		expect(allEvents.filter((e) => e.type === 'ball_ended').length, 'one real drain per player').toBe(playerCount);
		const gameEnded = allEvents.find((e) => e.type === 'game_ended');
		expect(gameEnded !== undefined && gameEnded.type === 'game_ended' ? gameEnded.scores.length : -1, 'Hot seat really added every player').toBe(playerCount);
		const runsBeforeMatch = screenRuns(beforeMatch).map((run) => run.screen);
		expect(runsBeforeMatch.filter((screen) => screen === 'ball_ended').length, 'one end-of-ball screen per player').toBe(playerCount);
		expect(runsBeforeMatch[runsBeforeMatch.length - 1], 'sanity: game_over is already showing when match_drawn arrives (the authored 5 s lead-in outlasts the 3 s hold)').toBe('game_over');
		for (const s of beforeMatch) {
			expect(s.seq.active, `tick ${s.tick}: nothing is selected before match_drawn (${s.view.screen})`).toBeNull();
			expect(s.art, `tick ${s.tick}: no art before match_drawn (${s.view.screen})`).toEqual([]);
		}

		// The player rows as they stood on game_over BEFORE any sequence was active: the baseline for "unchanged".
		const playerRowsBefore = trace[matchIndex - 1]!.frame.rows.slice(0, playerCount);
		expect(playerRowsBefore.map((row) => row.text).every((text) => /^[0-9,]+$/.test(text)), 'sanity: these are the score rows').toBe(true);

		expect(trace[matchIndex]!.seq.active, 'Match is selected from the event, timed from event.tick').toEqual({ key: MATCH_KEY, startTick: matchTick });
		let lastShown: number | null = null;
		let windowFrames = 0;
		let framesWithDigits = 0;
		let afterFrames = 0;
		for (const s of trace.slice(matchIndex, attractIndex)) {
			for (const e of s.output.events) {
				if (e.type === 'match_reveal_step') {
					lastShown = e.shown;
				}
			}
			expect(s.view.screen, `tick ${s.tick}`).toBe('game_over');
			if (s.tick < matchTick + 2500) {
				expect(s.shown, `tick ${s.tick}: ten 250 ms frames from the event's tick`).toEqual({ key: MATCH_KEY, index: Math.floor((s.tick - matchTick) / 250) });
				// Text: the rows are renderFrame()'s own, and they say what they said without the art.
				expect(s.composedFrame.rows, `tick ${s.tick}: no text row is added, removed or moved`).toBe(s.frame.rows);
				expect(s.frame.rows.slice(0, playerCount), `tick ${s.tick}: every player's row is unchanged`).toEqual(playerRowsBefore);
				const digits = lastShown === null ? [] : [String(lastShown).padStart(2, '0')];
				expect(textsOf(s).slice(playerCount), `tick ${s.tick}: GAME OVER, and the reveal digits from the steps received so far`).toEqual(['GAME OVER', ...digits]);
				framesWithDigits += digits.length;
				// Geometry: no text box reaches the strip on this layout, at any player count.
				expect(Math.max(...s.frame.rows.map((row) => row.row + 7)), `tick ${s.tick}: every text box ends above row 24`).toBeLessThanOrEqual(23);
				expect(s.art.length, `tick ${s.tick}: Match art lights dots`).toBeGreaterThan(0);
				expect(strayDots(s, 24), `tick ${s.tick}: Match art stays in rows 24-31, outside every text box`).toEqual([]);
				windowFrames += 1;
			} else {
				expect(s.art, `tick ${s.tick}: no art after the Match window`).toEqual([]);
				afterFrames += 1;
			}
		}
		expect(windowFrames, 'Match art showed for its 2.5 s window').toBeGreaterThan(140);
		expect(framesWithDigits, 'the reveal digits were on the panel for most of that window').toBeGreaterThan(100);
		expect(afterFrames, 'the game_over screen continued after the window').toBeGreaterThan(100);
	});

	it('Attract with scores: keys and scores rasters are byte-identical to the no-art baseline while the sequence is live, and the art starts afresh at each PRESS START phase', () => {
		const { attractIndex } = landmarks(trace);
		const runs = screenRuns(trace.slice(attractIndex));
		expect(runs.map((run) => run.screen), 'keys once, then the prompt/scores cycle').toEqual(['attract_keys', 'attract_prompt', 'attract_scores', 'attract_prompt', 'attract_scores', 'attract_prompt']);

		const keys = runs[0]!.samples;
		expect(keys.length, 'the keys screen held for 3 s').toBeGreaterThan(150);
		for (const s of keys) {
			expect(s.art, `tick ${s.tick}: no art on the keys screen`).toEqual([]);
		}

		for (const run of runs.filter((r) => r.screen === 'attract_scores')) {
			expect(run.samples.length, 'a scores phase holds for 3 s').toBeGreaterThan(150);
			for (const s of run.samples) {
				expect(textsOf(s).length, `tick ${s.tick}: one row per player`).toBe(playerCount);
				textsOf(s).forEach((text, player) => expect(text.startsWith(`PLAYER ${player + 1} `), `tick ${s.tick}: "${text}"`).toBe(true));
				// The Attract sequence is still the live one here (it repeats, so it never expires): only its host screen keeps it off.
				expect(s.seq.active?.key, `tick ${s.tick}: sanity, the sequence is live while the scores show`).toBe(ATTRACT_KEY);
				expect(s.art, `tick ${s.tick}: the scores raster is byte-identical to the baseline`).toEqual([]);
				expect(s.composedFrame, `tick ${s.tick}: and nothing was composed on the scores screen at all`).toBe(s.frame);
			}
		}

		const prompts = runs.filter((r) => r.screen === 'attract_prompt');
		const starts = prompts.map((run) => run.samples[0]!.tick);
		expect(starts[1]! - starts[0]!, 'prompt 3 s + scores 3 s between one phase and the next').toBe(6000);
		expect(starts[2]! - starts[1]!).toBe(6000);
		prompts.forEach((run, phase) => {
			const start = run.samples[0]!.tick;
			// 6000 is two whole loops of the 3 s sequence, so a sequence that was NOT restarted would show the same dots: the start tick is what tells them apart.
			expect(run.samples[0]!.seq.active, `phase ${phase}: the sequence starts afresh at this phase's own first frame`).toEqual({ key: ATTRACT_KEY, startTick: start });
			const indices = new Set<number>();
			for (const s of run.samples) {
				expect(textsOf(s), `tick ${s.tick}`).toEqual(['PRESS START']);
				expect(s.shown, `tick ${s.tick}: six 500 ms frames from this phase's start`).toEqual({ key: ATTRACT_KEY, index: Math.floor((s.tick - start) / 500) });
				expect(s.art.length, `tick ${s.tick}: Attract art lights dots`).toBeGreaterThan(0);
				expect(strayDots(s, 8), `tick ${s.tick}: Attract art stays in rows 8-31, outside PRESS START's box`).toEqual([]);
				indices.add(s.shown!.index);
			}
			if (phase < 2) {
				expect(run.samples.length, `phase ${phase}: a prompt phase holds for 3 s`).toBeGreaterThan(150);
				expect(indices.size, `phase ${phase}: all six frames were shown`).toBe(6);
			}
		});
	});
});

// ---------------------------------------------------------------------------
// I/O "Off-host screen"
// ---------------------------------------------------------------------------

describe('Story 5.5 (QA) -- off-host screen: a real match_drawn that lands inside the real end-of-ball hold (matchDelayMs retuned below the 3 s hold)', () => {
	it('lead-in 1 s: Match is selected on the event, nothing is drawn while ball_ended holds, and on game_over it resumes at the frame due then -- frame 8, for the 500 ms left', () => {
		const trace = playRealGame({ players: 1, tuning: tuningWith(1000), attractTicks: 4000 });
		const { drainIndex, drainTick, matchIndex, matchTick, attractIndex } = landmarks(trace);
		expect(matchTick, 'sanity: the retuned lead-in is what the sim used').toBe(drainTick + 1000);
		expect(trace[matchIndex]!.view.screen, 'sanity: match_drawn arrived while the end-of-ball screen is held').toBe('ball_ended');
		expect(trace[matchIndex]!.seq.active, 'the keyed event is selected off its host screen: the timeline runs').toEqual({ key: MATCH_KEY, startTick: matchTick });

		const runs = screenRuns(trace.slice(matchIndex, attractIndex));
		expect(runs.map((run) => run.screen)).toEqual(['ball_ended', 'game_over']);

		const hidden = runs[0]!.samples;
		expect(hidden.length, 'two seconds of the hold remained').toBeGreaterThan(100);
		for (const s of hidden) {
			expect(s.seq.active, `tick ${s.tick}: the sequence stays selected through the hold`).toEqual({ key: MATCH_KEY, startTick: matchTick });
			expect(s.art, `tick ${s.tick}: the end-of-ball raster is byte-identical to the baseline`).toEqual([]);
			expect(s.composedFrame, `tick ${s.tick}: and nothing was composed on ball_ended at all`).toBe(s.frame);
		}

		const onHost = runs[1]!.samples;
		expect(onHost[0]!.tick, 'sanity: the hold ran its full 3 s from the frame that carried the drain').toBeGreaterThanOrEqual(trace[drainIndex]!.tick + 3000);
		expect(onHost[0]!.shown, 'it resumes at the frame due at that tick, not at frame 0').toEqual({ key: MATCH_KEY, index: 8 });
		let resumed = 0;
		let after = 0;
		for (const s of onHost) {
			if (s.tick < matchTick + 2500) {
				expect(s.shown, `tick ${s.tick}`).toEqual({ key: MATCH_KEY, index: Math.floor((s.tick - matchTick) / 250) });
				expect(s.art.length, `tick ${s.tick}: Match art lights dots`).toBeGreaterThan(0);
				expect(strayDots(s, 24), `tick ${s.tick}: Match art stays in rows 24-31, outside every text box`).toEqual([]);
				resumed += 1;
			} else {
				expect(s.art, `tick ${s.tick}: no art once the window that began at the event has closed`).toEqual([]);
				after += 1;
			}
		}
		// 500 ticks of the window are left at the first game_over frame: 31 frames at most.
		expect(resumed, 'it showed only for what was left of its window').toBeGreaterThanOrEqual(25);
		expect(resumed).toBeLessThanOrEqual(32);
		expect(after, 'the game_over screen continued after the window').toBeGreaterThan(100);
	});

	it('lead-in 100 ms: the whole 2.5 s window passes behind the hold, so Match is selected and never drawn -- game_over is byte-identical to the baseline from its first frame', () => {
		const trace = playRealGame({ players: 1, tuning: tuningWith(100), attractTicks: 4000 });
		const { drainTick, matchIndex, matchTick, attractIndex } = landmarks(trace);
		expect(matchTick, 'sanity: the retuned lead-in is what the sim used').toBe(drainTick + 100);
		// Positive: the sequence WAS selected, so "never drawn" below is the window, not a missing event.
		expect(trace[matchIndex]!.seq.active).toEqual({ key: MATCH_KEY, startTick: matchTick });

		const runs = screenRuns(trace.slice(matchIndex, attractIndex));
		expect(runs.map((run) => run.screen)).toEqual(['ball_ended', 'game_over']);
		const onHost = runs[1]!.samples;
		expect(onHost.length, 'the host screen showed for seconds').toBeGreaterThan(100);
		expect(onHost[0]!.tick, 'sanity: the window that began at the event had closed before game_over first showed').toBeGreaterThanOrEqual(matchTick + 2500);
		for (const s of [...runs[0]!.samples, ...onHost]) {
			expect(s.art, `tick ${s.tick}: byte-identical to the baseline (${s.view.screen})`).toEqual([]);
			expect(s.shown, `tick ${s.tick}: nothing is due (${s.view.screen})`).toBeNull();
			expect(s.seq.active, `tick ${s.tick}: and it is still the selected sequence, timed from the event (${s.view.screen})`).toEqual({ key: MATCH_KEY, startTick: matchTick });
		}

		// Positive for the instrument: the same run does show art once a sequence is due on its host.
		const prompts = trace.slice(attractIndex).filter((s) => s.view.screen === 'attract_prompt');
		expect(prompts.length).toBeGreaterThan(20);
		for (const s of prompts) {
			expect(s.art.length, `tick ${s.tick}: Attract art lights dots`).toBeGreaterThan(0);
		}
	});
});

// ---------------------------------------------------------------------------
// I/O "Restarted timeline"
// ---------------------------------------------------------------------------

/**
 * `src/host/loop.ts` touches no DOM global but these four
 * (`test/host-loop.test.ts`): a manual animation-frame queue, and a listener
 * target for the keyboard input it attaches on `start()`.
 */
function installHostGlobals(): { fire(nowMs: number): void; restore(): void } {
	const g = globalThis as unknown as Record<string, unknown>;
	const names = ['requestAnimationFrame', 'cancelAnimationFrame', 'addEventListener', 'removeEventListener'];
	const originals = names.map((name) => g[name]);
	let nextHandle = 1;
	const callbacks = new Map<number, (now: number) => void>();
	g.requestAnimationFrame = (cb: (now: number) => void): number => {
		const handle = nextHandle++;
		callbacks.set(handle, cb);
		return handle;
	};
	g.cancelAnimationFrame = (handle: number): void => {
		callbacks.delete(handle);
	};
	g.addEventListener = (): void => {};
	g.removeEventListener = (): void => {};
	return {
		fire(nowMs: number): void {
			const entry = callbacks.entries().next();
			if (entry.done) {
				throw new Error('fire(): no animation frame is queued');
			}
			callbacks.delete(entry.value[0]);
			entry.value[1](nowMs);
		},
		restore(): void {
			names.forEach((name, index) => {
				g[name] = originals[index];
			});
		},
	};
}

describe('Story 5.5 (QA) -- restarted timeline: a real createHostLoop().reset() under views that outlive it, as in boot.ts', () => {
	it('a reset drops the running sequence with no stale art; a reset while PRESS START shows restarts the Attract art at the new tick 0, from frame 0', () => {
		const globals = installHostGlobals();
		try {
			const fold = makeFold();
			const samples: Sample[] = [];
			const host = createHostLoop(loadDoc(), (output) => {
				samples.push(fold(output));
			});
			let nowMs = 1000;
			const frame = (): Sample => {
				globals.fire(nowMs);
				nowMs += FRAME_MS;
				return samples[samples.length - 1]!;
			};
			host.start();

			// 1. Cold boot, into the PRESS START art.
			let s = frame();
			while (s.tick < 5000) {
				s = frame();
			}
			expect(s.view.screen).toBe('attract_prompt');
			expect(s.seq.active?.key, 'sanity: the Attract sequence is running before the first reset').toBe(ATTRACT_KEY);
			expect(s.seq.active!.startTick, 'sanity: it started after the 3 s keys screen').toBeGreaterThanOrEqual(3000);
			expect(s.art.length).toBeGreaterThan(0);

			// 2. A reset with options: a retuned sim, as the tuning panel's hot-apply passes, plus this file's
			//    one-ball `gameStart` so step 3's game is short (no shipped caller passes one). The tick count restarts
			//    at 0 and this cold-boot view goes back to the keys screen: the sequence from the old count is dropped.
			const tuning = tuningWith();
			host.reset({ tuning, gameStart: gameStart(tuning) });
			s = frame();
			expect(s.tick, 'the rebuilt sim starts its count again').toBe(0);
			expect(s.view.screen).toBe('attract_keys');
			expect(s.seq.active, 'a sequence that started ahead of the restarted count is dropped').toBeNull();
			expect(s.art).toEqual([]);

			// 3. A real game on the new count, through game over and Match, back to Attract and a second into PRESS START.
			host.injectTransitions([
				{ tick: 2, frame: { ...NO_FRAME, start: true } },
				{ tick: 3, frame: NO_FRAME },
			]);
			s = frame();
			expect(s.output.snapshot.game.phase, 'sanity: Start was honoured on the new count').toBe('game');
			for (const coil of DISABLED_HAZARD_COILS) {
				host.setCoilEnabled(coil, false);
			}
			host.pulseCoil('c_autolaunch');
			let sawMatch = false;
			let firstPrompt: Sample | null = null;
			let previous = s;
			for (let i = 0; !(sawMatch && s.view.screen === 'attract_prompt' && s.shown !== null && s.shown.index >= 2); i++) {
				if (i > MAX_FRAMES) {
					throw new Error('the game did not reach PRESS START again');
				}
				previous = s;
				s = frame();
				sawMatch ||= s.output.events.some((e) => e.type === 'match_drawn');
				if (!sawMatch) {
					expect(s.seq.active, `tick ${s.tick}: nothing from the old count is ever selected again (${s.view.screen})`).toBeNull();
					expect(s.art, `tick ${s.tick}: no stale art (${s.view.screen})`).toEqual([]);
				}
				if (sawMatch && s.view.screen === 'attract_prompt' && previous.view.screen !== 'attract_prompt') {
					firstPrompt = s;
				}
			}
			const beforeReset = s;
			expect(firstPrompt, 'sanity: the first PRESS START frame after the game was seen').not.toBeNull();
			expect(firstPrompt!.shown).toEqual({ key: ATTRACT_KEY, index: 0 });
			const staleStart = beforeReset.seq.active!.startTick;
			expect(staleStart, 'sanity: the running sequence started far ahead of anything the next count will reach here').toBeGreaterThan(10000);
			expect(Array.from(beforeReset.composed.dots), 'sanity: the frame showing before the reset is not frame 0').not.toEqual(Array.from(firstPrompt!.composed.dots));

			// 4. Reset while PRESS START shows. The Backglass view outlives the reset and keeps PRESS START up
			//    on the restarted count, so the art must restart with it rather than vanish or keep its old place.
			host.reset();
			s = frame();
			expect(s.tick, 'the rebuilt sim starts its count again').toBe(0);
			expect(s.view.screen, 'sanity: PRESS START is still the screen on the first frame of the new count').toBe('attract_prompt');
			expect(Array.from(s.composed.dots), 'the panel shows frame 0 again: the same dots as the first PRESS START frame').toEqual(Array.from(firstPrompt!.composed.dots));
			expect(s.seq.active, 'Attract restarts at the current tick').toEqual({ key: ATTRACT_KEY, startTick: 0 });
			let frames = 0;
			const indices = new Set<number>();
			while (s.tick < 3400) {
				expect(s.view.screen, `tick ${s.tick}`).toBe('attract_prompt');
				expect(s.shown, `tick ${s.tick}: six 500 ms frames, looping, from the new tick 0`).toEqual({ key: ATTRACT_KEY, index: Math.floor((s.tick % 3000) / 500) });
				expect(s.art.length, `tick ${s.tick}: Attract art lights dots`).toBeGreaterThan(0);
				expect(strayDots(s, 8), `tick ${s.tick}: Attract art stays in rows 8-31, outside PRESS START's box`).toEqual([]);
				indices.add(s.shown!.index);
				frames += 1;
				s = frame();
			}
			expect(frames, 'more than one loop of the 3 s sequence was observed').toBeGreaterThan(200);
			expect(indices.size, 'all six frames were shown').toBe(6);
			host.stop();
		} finally {
			globals.restore();
		}
	}, 120000);
});
