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
//   BEFORE the frame is rasterised -- and all three are statements of
//   `onFrame`'s own body, with no condition in front of any of them (the fold
//   keeps running while the negative control hides the art);
// - `rasterise(...)` is handed `composeSequence(renderFrame(...), ...)`,
//   gated only by the lead's negative control, `sequencesEnabled`;
// - the two console hatches exist: `setBackglassSequencesEnabled(on)` sets
//   that flag, and `backglassState()` reports screen, sequence and frame --
//   each pinned by its WHOLE body, so an extra statement cannot hide;
// - the host loop's reset seam sets the flag back to `true`, every reset path
//   is handed that seam, and nothing else writes the flag or `sequenceView`
//   (every mention of either name is accounted for).
//
// What this cannot prove: that the browser actually runs the hook. The real
// order is exercised over a real loop in
// `test/backglass-sequences-integration.test.ts` and, with the real
// `ViewConfig` and a real `createHostLoop().reset()`, in
// `test/backglass-sequences-real-game.test.ts`; the rendered pixels are the
// lead's AC 4.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const BOOT_TS = path.resolve(__dirname, '..', 'src', 'host', 'boot.ts');

const ADVANCE_BACKGLASS = 'backglassView = advanceBackglass(backglassView, output);';
const ADVANCE_SEQUENCES = 'sequenceView = advanceSequences(sequenceView, backglassView, output);';
const RASTERISE_OPEN = 'latestRaster = rasterise(';
const COMPOSED = 'composeSequence(renderFrame(backglassView, output.snapshot, viewConfig), sequenceView, output.snapshot.tick)';

/**
 * boot.ts with every whole-line `//` comment and every block comment removed,
 * so a commented-out call is not mistaken for a live one. Line comments go
 * FIRST (`test/boot-lamp-override-wiring.test.ts`'s order): a glob such as
 * `host/` + `**` inside a `//` line (boot.ts has one) would otherwise open a
 * false block comment that any later block-comment close ends, silently
 * deleting the live code in between -- a writer of the flag included.
 */
function bootSourceWithoutComments(): string {
	return readFileSync(BOOT_TS, 'utf8')
		.replace(/\r\n/g, '\n')
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('//'))
		.join('\n')
		.replace(/\/\*[\s\S]*?\*\//g, '');
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

/**
 * `statement` is a statement of `body`'s own top level, and it always runs:
 * the text before it ends a finished statement (no `if (...)`, `else` or `&&`
 * in front of it), every bracket opened before it is closed again (it sits
 * inside no nested block), and no `return` or `throw` above it can leave
 * `body` early. `body` is squashed text; `what` names it in the messages.
 */
function expectUnconditional(body: string, statement: string, what: string): void {
	const at = body.indexOf(statement);
	expect(at, `${what} must contain "${statement}"`).toBeGreaterThan(-1);
	const before = body.slice(0, at).trimEnd();
	expect(before.endsWith(';'), `no condition guards "${statement}" in ${what}; the text before it ends "${before.slice(-40)}"`).toBe(true);
	const opened = before.match(/[{([]/g)?.length ?? 0;
	const closed = before.match(/[})\]]/g)?.length ?? 0;
	expect(opened - closed, `"${statement}" is not nested inside a block of ${what}`).toBe(0);
	expect(before.match(/\b(return|throw)\b/g), `nothing above "${statement}" leaves ${what} early`).toBeNull();
}

const STATE_TYPE = 'backglassState: () => { screen: DmdScreen; sequence: string | null; frameIndex: number | null };';

describe('Story 5.5 -- boot.ts wires the Backglass art sequences into onFrame', () => {
	const source = bootSourceWithoutComments();

	it('advanceSequences runs after advanceBackglass and before the frame is rasterised, each exactly once and on every frame', () => {
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
		// And each runs on EVERY frame: a statement of onFrame's own body, never behind a condition. A fold gated on
		// the negative control, say, would freeze the timeline the hatch's JSDoc promises keeps running.
		const onFrame = squash(balancedAfter(source, '(output) => {'));
		for (const statement of [ADVANCE_BACKGLASS, ADVANCE_SEQUENCES, RASTERISE_OPEN]) {
			expectUnconditional(onFrame, statement, 'onFrame');
		}
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
		// The latest sim frame's tick, and the key/index mapping, exactly (the lead's AC 4 sampler times captures by it).
		expect(squash(balancedAfter(source, 'backglassState: () => {', typeAt + STATE_TYPE.length))).toBe(
			'const shown = activeSequenceFrame(sequenceView, backglassView.screen, latestSnapshot?.tick ?? 0); return { screen: backglassView.screen, sequence: shown?.key ?? null, frameIndex: shown?.index ?? null };',
		);
	});

	it('the reset seam sets the negative control back to true; the flag and the sequence view have no other writer', () => {
		const seam = squash(balancedAfter(source, 'reset: (resetOptions?: ResetOptions): void => {'));
		expect(seam.startsWith('liveHostLoop.reset(resetOptions);'), 'sanity: this is the host loop reset wrapper').toBe(true);
		expect(seam).toContain('sequencesEnabled = true;');
		// QA: and it restores it UNCONDITIONALLY. The `reset()` hatch and `replayRecorder.start()` call this
		// seam with no options, replay playback and the tuning panel's hot-apply with some, and the hatch's
		// JSDoc promises all of them. The restore is therefore a statement of the seam's own body.
		// (The whole body is not pinned: the other lines are other stories'.)
		expectUnconditional(seam, 'sequencesEnabled = true;', 'the reset seam');
		// That promise also needs every reset path to be handed THIS wrapper, never the unwrapped loop,
		// which is named only where the wrapper is built (its alias, the spread and the wrapped call).
		expect(source).toContain('createTuningPanel({ hostLoop: hostLoopRef, replayRecorder })');
		expect(source).toContain('replayPlayer.start(hostLoopRef, recording);');
		expect(source.match(/\bhostLoopRef\.reset\(\);/g), 'replayRecorder.start() and the reset() hatch').toHaveLength(2);
		expect(source.match(/\bliveHostLoop\b/g), 'the unwrapped loop has no other user').toHaveLength(3);
		// Every assignment in boot.ts, in file order: the declaration, the reset seam and the hatch -- and, for the view, the declaration and the fold.
		expect(source.match(/\bsequencesEnabled = [^;]+;/g)).toEqual(['sequencesEnabled = true;', 'sequencesEnabled = true;', 'sequencesEnabled = on;']);
		expect(source.match(/\bsequenceView = [^;]+;/g)).toEqual(['sequenceView = INITIAL_SEQUENCE_VIEW;', ADVANCE_SEQUENCES]);
		// And every MENTION is accounted for, so a write in a form those two patterns cannot read (`&&=`, a
		// destructuring, a call to the hatch) has nowhere to hide: the flag is named by its three writes and its
		// one read (the ternary pinned above); the view by its declaration, the fold (twice) and its two readers;
		// the hatch by its type line and its implementation.
		expect(source.match(/\bsequencesEnabled\b/g)).toHaveLength(4);
		expect(source.match(/\bsequenceView\b/g)).toHaveLength(5);
		expect(source.match(/\bsetBackglassSequencesEnabled\b/g)).toHaveLength(2);
		// Only whole-line comments are stripped. A TRAILING one may not share a line with either name, or
		// commented-out text would count as live in every assertion above.
		expect(source.split('\n').filter((line) => /\bsequence(?:sEnabled|View)\b/.test(line) && line.includes('//'))).toEqual([]);
	});
});
