// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9, AC 1: "given the panel is open, when it enumerates TUNING,
// then every leaf TuningEntry appears exactly once with its value, source
// and confidence, and plungerSpeedByHoldMs does not appear." Plus the
// Integration AC: "the panel is the first real consumer of Story 1.8's
// replayRecorder.invalidate() seam, exercised against a real recorder, not
// a mock."
//
// This project has no DOM test environment (Vitest runs `environment:
// 'node'`; jsdom is not, and per CLAUDE.md/ATTRIBUTIONS.md cannot become, a
// dependency). `src/host/dev/tuning-panel.ts`'s own design keeps its DOM-free
// halves (`enumerateTuningRows()`, `buildOverriddenTuning()`) independently
// testable without any DOM at all; for `createTuningPanel()` itself, this
// file installs a MINIMAL hand-rolled `document.createElement` stub over
// exactly the element surface the panel actually uses -- the same
// "stub the one browser global under test" pattern
// `test/host-loop.test.ts`'s own `installRaf()`/keyboard-target stub already
// establishes for `requestAnimationFrame`/`addEventListener`.
//
// Falsifiability (spec):
// - AC 1 (enumeration): mutation: drop the 'materials' group from the
//   panel's enumeration -> the row-count assertion (against an INDEPENDENT
//   recursive walk written in THIS file, not the panel's own) goes red.
// - AC 1 (hot-apply): exercised via the real createHostLoop below (Rule 1:
//   a real recorder, not a mock).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTuningPanel, enumerateTuningRows, buildOverriddenTuning } from '../src/host/dev/tuning-panel';
import { createHostLoop } from '../src/host/loop';
import { createReplayRecorder } from '../src/host/dev/replay-recorder';
import { serialiseTuning } from '../src/host/dev/tuning-source';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { FrameOutput } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

// ---------------------------------------------------------------------------
// A minimal document.createElement stub -- exactly the element surface
// src/host/dev/tuning-panel.ts uses (className, textContent, dataset,
// value/type/step/readOnly, appendChild/append, addEventListener,
// setAttribute, focus/select/remove). Event dispatch is manual: tests call
// the stored listener directly (fireEvent below), the same way installRaf()
// lets a test choose exactly when a frame "fires".
// ---------------------------------------------------------------------------

interface FakeElement {
	tagName: string;
	className: string;
	textContent: string;
	value: string;
	type: string;
	step: string;
	readOnly: boolean;
	dataset: Record<string, string>;
	children: FakeElement[];
	readonly listeners: Map<string, Array<() => void>>;
	appendChild(child: FakeElement): FakeElement;
	append(...children: FakeElement[]): void;
	addEventListener(type: string, cb: () => void): void;
	setAttribute(name: string, value: string): void;
	focus(): void;
	select(): void;
	remove(): void;
}

function createFakeElement(tagName: string): FakeElement {
	const listeners = new Map<string, Array<() => void>>();
	const el: FakeElement = {
		tagName,
		className: '',
		textContent: '',
		value: '',
		type: '',
		step: '',
		readOnly: false,
		dataset: {},
		children: [],
		listeners,
		appendChild(child: FakeElement): FakeElement {
			el.children.push(child);
			return child;
		},
		append(...kids: FakeElement[]): void {
			el.children.push(...kids);
		},
		addEventListener(type: string, cb: () => void): void {
			if (!listeners.has(type)) {
				listeners.set(type, []);
			}
			listeners.get(type)!.push(cb);
		},
		setAttribute(): void {},
		focus(): void {},
		select(): void {},
		remove(): void {},
	};
	return el;
}

function fireEvent(el: FakeElement, type: string): void {
	for (const cb of el.listeners.get(type) ?? []) {
		cb();
	}
}

function installDocumentStub(): void {
	(globalThis as unknown as { document: unknown }).document = {
		createElement: (tag: string) => createFakeElement(tag),
	};
}

/** Every descendant of `root`, depth-first -- for locating a specific row's input by its dataset.path. */
function* walk(el: FakeElement): Generator<FakeElement> {
	yield el;
	for (const child of el.children) {
		yield* walk(child);
	}
}

// ---------------------------------------------------------------------------
// AC 1 (enumeration): an INDEPENDENT recursive walk, written here, never
// sharing code with src/host/dev/tuning-panel.ts's own enumerateTuningRows().
// ---------------------------------------------------------------------------

function independentLeafCount(node: unknown): number {
	if (node === null || typeof node !== 'object') {
		return 0;
	}
	if ('value' in node && 'source' in node && 'confidence' in node && typeof (node as { value: unknown }).value === 'number') {
		return 1;
	}
	let count = 0;
	for (const value of Object.values(node as Record<string, unknown>)) {
		count += independentLeafCount(value);
	}
	return count;
}

describe('src/host/dev/tuning-panel.ts -- enumerateTuningRows() (DOM-free)', () => {
	it('produces exactly one row per leaf TuningEntry -- row count matches an INDEPENDENT recursive walk over the real TUNING', () => {
		const rows = enumerateTuningRows();
		const expectedCount = independentLeafCount(TUNING);
		expect(expectedCount, 'sanity: the independent walk must find a non-trivial number of leaves').toBeGreaterThan(10);
		expect(rows.length).toBe(expectedCount);
	});

	it('every row carries a numeric value, a non-empty source and a valid confidence', () => {
		const rows = enumerateTuningRows();
		const validConfidences = ['high', 'medium', 'low', 'unverified'];
		for (const row of rows) {
			expect(typeof row.value).toBe('number');
			expect(Number.isFinite(row.value)).toBe(true);
			expect(typeof row.source).toBe('string');
			expect(row.source.length).toBeGreaterThan(0);
			expect(validConfidences).toContain(row.confidence);
		}
	});

	it('a function-valued node contributes NO row and is never descended into -- the guard AC 1\'s "plungerSpeedByHoldMs does not appear" clause rests on', () => {
		// Review finding, this pass (Rule 19): the assertion in the test below
		// -- `rows.some(r => r.path.includes('plungerSpeedByHoldMs')) === false`
		// against the live TUNING -- CANNOT FAIL. `plungerSpeedByHoldMs` is a
		// module-level `export function` in src/sim/table/tuning.ts, never a
		// TUNING property, so the walk never reaches it under ANY
		// implementation and enumerateTuningRows()'s own
		// `typeof node === 'function'` guard is never executed by it. That left
		// the AC clause pinned only by a statement about tuning.ts's module
		// shape, not about the panel. THIS test drives the guard directly.
		//
		// Demonstrated this pass, and note WHICH mutation: deleting the
		// `typeof node === 'function'` early return does NOT make this red --
		// that guard is redundant with the `typeof node !== 'object'` check
		// immediately below it (typeof a function is 'function', not 'object'),
		// so it is provably dead code and nothing can pin it. The guard that
		// actually carries the behaviour is the object check.
		//
		// The two guards are mutually redundant for a function, so the SMALLEST
		// change that violates the contract removes both.
		//
		// mutation: delete the `typeof node === 'function'` early return AND
		// weaken `node === null || typeof node !== 'object'` to `node === null`
		// -> this test goes red (demonstrated this pass: the run then yields
		// ['realLeaf', 'asFunction.nested'] instead of ['realLeaf']). The
		// fixture hangs exactly the shape plungerSpeedByHoldMs would have if it
		// were ever moved onto TUNING.
		const fnWithEntryShapedProps = Object.assign(() => 0, {
			nested: { value: 42, source: 'test fixture', confidence: 'unverified' as const },
		});
		const rows = enumerateTuningRows({
			realLeaf: { value: 1, source: 'test fixture', confidence: 'unverified' as const },
			asFunction: fnWithEntryShapedProps,
		});
		expect(rows.map((r) => r.path.join('.')), 'the function node must contribute nothing at all -- neither itself nor its properties').toEqual(['realLeaf']);
	});

	it('plungerSpeedByHoldMs never appears as a row -- a structural invariant of tuning.ts (it is a module export, not a TUNING property), not a panel behaviour', () => {
		const rows = enumerateTuningRows();
		expect(rows.some((r) => r.path.includes('plungerSpeedByHoldMs'))).toBe(false);
		// Stated explicitly so the assertion above is not mistaken for a pin on
		// the panel: it holds because of where plungerSpeedByHoldMs LIVES. The
		// falsifiable pin for the exclusion BEHAVIOUR is the test above.
		expect(typeof (TUNING as unknown as Record<string, unknown>).plungerSpeedByHoldMs, 'if this ever becomes a TUNING property, the test above is the load-bearing one').toBe('undefined');
	});

	it('nested groups (materials, flipper, cabinet, tiltBob, switchSettleMsByClass) are walked recursively -- each contributes rows with a multi-segment path', () => {
		const rows = enumerateTuningRows();
		for (const group of ['materials', 'flipper', 'cabinet', 'tiltBob', 'switchSettleMsByClass']) {
			const groupRows = rows.filter((r) => r.path[0] === group);
			expect(groupRows.length, `${group} must contribute at least one row`).toBeGreaterThan(0);
			expect(groupRows.every((r) => r.path.length >= 2), `${group}'s rows must carry the group prefix in their path`).toBe(true);
		}
	});

	it('hopControl (this story\'s own top-level tunable) appears as exactly one row', () => {
		const rows = enumerateTuningRows();
		const hopRows = rows.filter((r) => r.path.length === 1 && r.path[0] === 'hopControl');
		expect(hopRows).toHaveLength(1);
		expect(hopRows[0]!.value).toBe(TUNING.hopControl.value);
	});
});

describe('src/host/dev/tuning-panel.ts -- buildOverriddenTuning() (DOM-free)', () => {
	it('with no overrides, resolves to a tuning set numerically identical to the live default', () => {
		const resolved = buildOverriddenTuning(new Map());
		expect(resolved.defaultPitchDeg.value).toBe(TUNING.defaultPitchDeg.value);
		expect(resolved.materials.flipper_rubber.elasticityFalloff.value).toBe(TUNING.materials.flipper_rubber.elasticityFalloff.value);
	});

	it('an override replaces ONLY the targeted leaf\'s value -- source/confidence and every sibling untouched', () => {
		const resolved = buildOverriddenTuning(new Map([['materials.flipper_rubber.elasticityFalloff', 0.42]]));
		expect(resolved.materials.flipper_rubber.elasticityFalloff.value).toBe(0.42);
		expect(resolved.materials.flipper_rubber.elasticityFalloff.source).toBe(TUNING.materials.flipper_rubber.elasticityFalloff.source);
		expect(resolved.materials.flipper_rubber.elasticity.value, 'a sibling entry must be untouched').toBe(TUNING.materials.flipper_rubber.elasticity.value);
		expect(resolved.defaultPitchDeg.value, 'an unrelated top-level entry must be untouched').toBe(TUNING.defaultPitchDeg.value);
	});
});

describe('src/host/dev/tuning-panel.ts -- createTuningPanel() (hand-rolled DOM stub)', () => {
	let originalDocument: unknown;

	beforeEach(() => {
		originalDocument = (globalThis as unknown as { document: unknown }).document;
		installDocumentStub();
	});

	afterEach(() => {
		(globalThis as unknown as { document: unknown }).document = originalDocument;
	});

	it('renders one input row per enumerated tunable, each carrying its dotted path in dataset.path', () => {
		const hostLoop = createHostLoop(loadDoc(), () => {});
		const replayRecorder = createReplayRecorder();
		const panel = createTuningPanel({ hostLoop, replayRecorder });

		const inputs = [...walk(panel.element as unknown as FakeElement)].filter((el) => el.tagName === 'input');
		const rows = enumerateTuningRows();
		expect(inputs.length).toBe(rows.length);
		const paths = new Set(inputs.map((el) => el.dataset.path));
		for (const row of rows) {
			expect(paths.has(row.path.join('.')), `no input row found for ${row.path.join('.')}`).toBe(true);
		}
	});

	it('Integration AC (Rule 1): editing a row hot-applies via hostLoop.reset({ tuning }) -- the next frame reflects the new value, and invalidates a REAL in-progress recording (not a mock)', () => {
		let latestSnapshot: FrameOutput['snapshot'] | undefined;
		const hostLoop = createHostLoop(loadDoc(), (output) => {
			latestSnapshot = output.snapshot;
		});
		const replayRecorder = createReplayRecorder();

		// A manual rAF stub, same as test/host-loop.test.ts's own harness --
		// installed AFTER installDocumentStub() in beforeEach, alongside it.
		const callbacks: Array<(now: number) => void> = [];
		(globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = (cb: (now: number) => void): number => {
			callbacks.push(cb);
			return callbacks.length;
		};
		(globalThis as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = (): void => {};
		(globalThis as unknown as { addEventListener: unknown }).addEventListener = (): void => {};
		(globalThis as unknown as { removeEventListener: unknown }).removeEventListener = (): void => {};
		function fireFrame(nowMs: number): void {
			const cb = callbacks.shift();
			if (!cb) throw new Error('no frame queued');
			cb(nowMs);
		}

		hostLoop.start();
		fireFrame(0);
		expect(latestSnapshot!.effectivePitchDeg).toBe(6.5);

		// A REAL recorder, genuinely recording (Rule 1: "exercised against a
		// real recorder, not a mock").
		replayRecorder.start(
			{ seed: 0, tuning: resolveTuning(), adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 }, highscores: [] },
			1,
			loadDoc(),
			latestSnapshot!.tick,
		);
		expect(replayRecorder.isRecording).toBe(true);

		const panel = createTuningPanel({ hostLoop, replayRecorder });
		const pitchInput = [...walk(panel.element as unknown as FakeElement)].find((el) => el.tagName === 'input' && el.dataset.path === 'defaultPitchDeg')!;
		expect(pitchInput, 'sanity: the defaultPitchDeg row must exist').toBeDefined();

		pitchInput.value = '7.75';
		fireEvent(pitchInput, 'change');

		// The hot-apply invalidated the REAL recording.
		expect(replayRecorder.isRecording, 'reset() does not itself end a recording -- only save()/invalidate() mark it').toBe(true);
		const saveResult = replayRecorder.save();
		expect(saveResult.ok, 'a hot-apply mid-recording must make save() refuse').toBe(false);

		// The next frame reflects the new value (Phase 1's rebuild seam).
		fireFrame(0);
		expect(latestSnapshot!.tick, 'reset() rebuilds a FRESH sim -- tick 0 on its first frame').toBe(0);
		expect(latestSnapshot!.effectivePitchDeg).toBe(7.75);
	});

	it('a non-finite input is rejected at the input -- the sim is untouched (no reset() call)', () => {
		let resetCalls = 0;
		let latestSnapshot: FrameOutput['snapshot'] | undefined;
		const realHostLoop = createHostLoop(loadDoc(), (output) => {
			latestSnapshot = output.snapshot;
		});
		const hostLoop: typeof realHostLoop = {
			...realHostLoop,
			reset: (options) => {
				resetCalls += 1;
				realHostLoop.reset(options);
			},
		};
		const replayRecorder = createReplayRecorder();
		const panel = createTuningPanel({ hostLoop, replayRecorder });
		const pitchInput = [...walk(panel.element as unknown as FakeElement)].find((el) => el.tagName === 'input' && el.dataset.path === 'defaultPitchDeg')!;

		pitchInput.value = 'not-a-number';
		fireEvent(pitchInput, 'change');

		expect(resetCalls, 'a non-finite edit must never reach hostLoop.reset()').toBe(0);
		expect(pitchInput.value, 'the input must revert to the last known-good value').toBe('6.5');
		void latestSnapshot;
	});

	it('a blank (cleared) input is rejected exactly like a non-finite one -- Number(\'\') coerces to 0, which must NOT silently hot-apply an override of 0', () => {
		// Review finding, this pass: Number('') and Number('   ') both coerce
		// to 0, which passes Number.isFinite() -- so clearing the field and
		// tabbing away used to reach hostLoop.reset() with an override of 0,
		// contradicting the I/O matrix's "Non-finite / non-numeric edit is
		// rejected at the input, sim untouched" contract.
		let resetCalls = 0;
		const realHostLoop = createHostLoop(loadDoc(), () => {});
		const hostLoop: typeof realHostLoop = {
			...realHostLoop,
			reset: (options) => {
				resetCalls += 1;
				realHostLoop.reset(options);
			},
		};
		const replayRecorder = createReplayRecorder();
		const panel = createTuningPanel({ hostLoop, replayRecorder });
		const pitchInput = [...walk(panel.element as unknown as FakeElement)].find((el) => el.tagName === 'input' && el.dataset.path === 'defaultPitchDeg')!;

		pitchInput.value = '   ';
		fireEvent(pitchInput, 'change');

		expect(resetCalls, 'a blank edit must never reach hostLoop.reset() -- it must not silently become an override of 0').toBe(0);
		expect(pitchInput.value, 'the input must revert to the last known-good value').toBe('6.5');
	});

	it('Export (AC 1): clicking the export button writes serialiseTuning()\'s output for the panel\'s accumulated overrides into the export textarea -- the DOM wiring, not just the pure function', () => {
		// Review finding, this pass: test/tuning-source.test.ts tests
		// serialiseTuning() as a pure function directly, never through the
		// panel; this file's own DOM stub never located the export button or
		// fired a click on it. If the click handler were wired to the wrong
		// button, built overrideList incorrectly, or never assigned
		// exportArea.value at all, both of those files would still pass.
		const realHostLoop = createHostLoop(loadDoc(), () => {});
		const replayRecorder = createReplayRecorder();
		const panel = createTuningPanel({ hostLoop: realHostLoop, replayRecorder });
		const elements = [...walk(panel.element as unknown as FakeElement)];
		const pitchInput = elements.find((el) => el.tagName === 'input' && el.dataset.path === 'defaultPitchDeg')!;
		const exportButton = elements.find((el) => el.tagName === 'button' && el.className === 'dw-tuning-panel__export-button')!;
		const exportArea = elements.find((el) => el.tagName === 'textarea' && el.className === 'dw-tuning-panel__export-area')!;

		expect(exportArea.value, 'sanity: the export area must start empty, before any edit or click').toBe('');

		pitchInput.value = '7.75';
		fireEvent(pitchInput, 'change');
		fireEvent(exportButton, 'click');

		expect(exportArea.value, 'clicking Export must populate the textarea -- it must not stay empty').not.toBe('');
		expect(exportArea.value).toBe(serialiseTuning([{ path: ['defaultPitchDeg'], value: 7.75 }]));
	});

	it('AC 1: each rendered row really SHOWS its value, source and confidence -- asserted on the DOM a developer sees, not on enumerateTuningRows()\'s return value', () => {
		// Review finding, this pass: every assertion covering "with its value,
		// source and confidence" ran against enumerateTuningRows()'s rows, and
		// every DOM assertion filtered on input/button/textarea only -- nothing
		// ever inspected a span. Deleting both spans from the row builder (so
		// the panel rendered bare, unlabelled number inputs with no provenance
		// at all) left every test in this file green.
		//
		// mutation: drop the pathEl/metaEl appendChild calls in
		// createTuningPanel()'s row loop -> this test goes red.
		const hostLoop = createHostLoop(loadDoc(), () => {});
		const replayRecorder = createReplayRecorder();
		const panel = createTuningPanel({ hostLoop, replayRecorder });
		const elements = [...walk(panel.element as unknown as FakeElement)];

		const row = enumerateTuningRows().find((r) => r.path.join('.') === 'defaultPitchDeg')!;
		expect(row, 'sanity: the defaultPitchDeg row must exist').toBeDefined();

		const input = elements.find((el) => el.tagName === 'input' && el.dataset.path === 'defaultPitchDeg')!;
		expect(input.value, 'the input must be seeded with the shipped value before any edit').toBe(String(row.value));

		const pathSpan = elements.find((el) => el.className === 'dw-tuning-panel__path' && el.textContent === 'defaultPitchDeg');
		expect(pathSpan, 'the tunable\'s dotted path must be rendered').toBeDefined();

		const metaTexts = elements.filter((el) => el.className === 'dw-tuning-panel__meta').map((el) => el.textContent);
		expect(metaTexts, 'the row must render its confidence AND its source verbatim').toContain(`${row.confidence} \u2014 ${row.source}`);
		expect(row.source.length, 'sanity: the source is genuinely non-empty, so the assertion above is not matching an empty tail').toBeGreaterThan(0);
	});

	it('every class the panel puts on an element has a real rule in public/styles.css (AD-17: styles are bundled, never inline)', () => {
		// Review finding, this pass: test/entry-html-csp.test.ts already
		// establishes exactly this pin for the three boot panels, and it was
		// never applied to the tuning panel's own classes -- so renaming a
		// class on either side shipped a silently unstyled panel with every
		// test green, and pnpm check:dist's inline-style grep would not catch
		// it either. Collected from the BUILT DOM rather than hardcoded, so a
		// class added later is covered without touching this test.
		//
		// mutation: rename .dw-tuning-panel__status in public/styles.css (or in
		// src/host/dev/tuning-panel.ts) -> this test goes red.
		//
		// The selector match is anchored on a non-identifier boundary, NOT a
		// bare toContain(): demonstrated this pass, a plain substring check
		// passed against `.dw-tuning-panel__statusRENAMED`, which contains the
		// very name it was supposed to be looking for. Demonstrated red by
		// renaming `.dw-tuning-panel__heading` (a class with exactly one rule;
		// `__status` has two, so renaming only one of them is not a mutation).
		const css = readFileSync(path.resolve(__dirname, '..', 'public', 'styles.css'), 'utf8');
		const hostLoop = createHostLoop(loadDoc(), () => {});
		const replayRecorder = createReplayRecorder();
		const panel = createTuningPanel({ hostLoop, replayRecorder });

		const classNames = new Set(
			[...walk(panel.element as unknown as FakeElement)].map((el) => el.className).filter((c) => c.length > 0),
		);
		expect(classNames.size, 'sanity: the panel must genuinely put classes on its elements, or this check is vacuous').toBeGreaterThan(4);
		for (const className of classNames) {
			const selector = new RegExp(`\\.${className.replace(/[^\w-]/g, '\\$&')}(?![\\w-])`);
			expect(
				selector.test(css),
				`.${className} is used by src/host/dev/tuning-panel.ts but has no rule in public/styles.css`,
			).toBe(true);
		}
	});

	it('a finite but UNRESOLVABLE ...Ms edit is rejected without wedging the panel and without destroying an in-progress recording', () => {
		// Review finding, this pass. resolveTuning() -> msToTicks() (DW-35)
		// THROWS on a negative ...Ms duration and on a strictly positive one
		// that rounds to 0 ticks at the live tick rate. The panel enumerates
		// every ...Ms leaf, and -1 is ordinary typing in a plain number input,
		// so this is a routine edit rather than an exotic one. Before the fix
		// the throw escaped the change listener uncaught, having ALREADY
		// invalidated a live recording and ALREADY stored the bad value in
		// `overrides` -- so every later edit to ANY row re-applied it and threw
		// again, wedging the panel until a page reload (there is no close/reset
		// affordance; DW-95).
		//
		// mutation: remove the try/catch in createTuningPanel()'s hotApply()
		// -> this test goes red (the change listener throws).
		let resetCalls = 0;
		const realHostLoop = createHostLoop(loadDoc(), () => {});
		const hostLoop: typeof realHostLoop = {
			...realHostLoop,
			reset: (options) => {
				resetCalls += 1;
				realHostLoop.reset(options);
			},
		};
		const replayRecorder = createReplayRecorder();
		replayRecorder.start(
			{ seed: 0, tuning: resolveTuning(), adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 }, highscores: [] },
			1,
			loadDoc(),
			0,
		);
		const panel = createTuningPanel({ hostLoop, replayRecorder });
		const elements = [...walk(panel.element as unknown as FakeElement)];
		const msInput = elements.find((el) => el.tagName === 'input' && el.dataset.path === 'slamNudgeWindowMs')!;
		expect(msInput, 'sanity: slamNudgeWindowMs is a real ...Ms leaf the panel enumerates').toBeDefined();
		const shippedValue = msInput.value;

		expect(() => {
			msInput.value = '-1';
			fireEvent(msInput, 'change');
		}, 'a rejected edit must not throw out of the change listener').not.toThrow();

		expect(resetCalls, 'an unresolvable edit must never reach hostLoop.reset()').toBe(0);
		expect(msInput.value, 'the input must revert to the last known-good value').toBe(shippedValue);
		expect(panel.overrides.has('slamNudgeWindowMs'), 'the rejected value must not be retained in overrides').toBe(false);

		const statusEl = elements.find((el) => el.className === 'dw-tuning-panel__status')!;
		expect(statusEl.textContent, 'the reason must be surfaced, not swallowed').toContain('slamNudgeWindowMs');

		// An edit that never applied is not a hot-apply, so AD-15's
		// invalidation must not have fired.
		expect(replayRecorder.isRecording).toBe(true);
		const saveResult = replayRecorder.save();
		expect(saveResult.ok, 'a REJECTED edit must not invalidate an in-progress recording').toBe(true);

		// And the panel is still usable: a subsequent VALID edit on another row
		// still hot-applies (before the fix the poisoned override made every
		// later edit throw too).
		const pitchInput = elements.find((el) => el.tagName === 'input' && el.dataset.path === 'defaultPitchDeg')!;
		pitchInput.value = '7.25';
		fireEvent(pitchInput, 'change');
		expect(resetCalls, 'a later valid edit must still hot-apply -- the panel must not be wedged').toBe(1);
	});
});
