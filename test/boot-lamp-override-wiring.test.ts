// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.2 (DW-271), QA -- the `setLampOverride()` hatch's WIRING in
// `src/host/boot.ts`. The store rule itself is the pure `nextLampOverride()`
// and the overlay the pure `overlayLampView()` (both pinned in
// test/lighting-scene.test.ts); what had no executed test was the three
// pieces of boot.ts that connect them (the story's review: "the wiring is
// verified only by the lead's AC 2 browser check"):
//   - the hatch stores `nextLampOverride(lampOverride, override).override`
//     and logs `next.problem` with `console.error` (the I/O matrix's "Bad
//     override" row: "logs an error and keeps its previous override");
//   - the render hook hands `overlayLampView(lampView, lampOverride)` to
//     `syncLamps()` (Matrix rows 3 and 4);
//   - `reset()` clears it back to `null` (the spec's Always list: "`reset()`
//     clears it"), on the `hostLoopRef` seam every reset path goes through.
//
// `boot.ts` cannot be imported here (it reads `document` at module load and
// needs WebGL2 -- test/module-coverage.test.ts's allowlist), so this is a
// source scan with comments stripped, the test/boot-mechanisms-wiring.test.ts
// precedent (Story 5.0a, DW-293). Each scanner also runs against a mutated
// copy of the real source (the negative controls below), so a scanner that
// matched anything would be caught here, not in review.
//
// What this cannot prove: that the browser actually calls the hatch or
// renders the hook -- the lead's AC 2 (a)-(e) browser session does.
//
// Falsifiability (Rule 19, recorded in the spec's Verification section):
// deleting `lampOverride = null;` from the reset wrapper reddens the reset
// case; passing bare `lampView` to syncLamps() reddens the overlay case;
// storing `override` instead of `next.override` reddens the store case;
// deleting the `console.error(...)` line reddens the error-log case.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const BOOT_TS = path.resolve(__dirname, '..', 'src', 'host', 'boot.ts');

const HOOK_OPEN = 'await bootScene(canvas, GLB_URL, (scene, nodes) => {';
const HOOK_CLOSE = '\n\t\t});';
const HATCH_OPEN = 'setLampOverride: (override: LampView | null) => {';
const HATCH_CLOSE = '\n\t\t\t},';
const RESET_WRAPPER_OPEN = 'reset: (resetOptions?: ResetOptions): void => {';
const RESET_WRAPPER_CLOSE = '\n\t\t\t},';

/**
 * boot.ts with every whole-line `//` comment and every block comment removed,
 * so a commented-out line is not mistaken for a live one. Line comments go
 * FIRST ([Story 5.2 review]): a glob such as `host/` + `**` inside a `//` line
 * (boot.ts has one) would otherwise open a false block comment that any later
 * block-comment close ends, silently deleting the live code in between.
 */
function stripComments(source: string): string {
	return source
		.replace(/\r\n/g, '\n')
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('//'))
		.join('\n')
		.replace(/\/\*[\s\S]*?\*\//g, '');
}

function bootSource(): string {
	return stripComments(readFileSync(BOOT_TS, 'utf8'));
}

/** Whitespace-collapsed, so a re-wrapped call still matches. */
function squash(text: string): string {
	return text.replace(/\s+/g, ' ');
}

/** The text between the ONE occurrence of `open` and the next `close` after it; fails the test if either is missing or `open` repeats. */
function block(source: string, open: string, close: string, what: string): string {
	const at = source.indexOf(open);
	expect(at, `boot.ts must contain ${what}: "${open}"`).toBeGreaterThan(-1);
	expect(source.indexOf(open, at + 1), `boot.ts must contain ${what} exactly once`).toBe(-1);
	const end = source.indexOf(close, at);
	expect(end, `${what} must close at its own indentation`).toBeGreaterThan(at);
	return source.slice(at + open.length, end);
}

/** The body of the `{ ... }` block that `open` (ending in `{`) starts, braces balanced (a `${...}` inside a template literal included); `null` when `open` is absent. */
function braceBody(text: string, open: string): string | null {
	const at = text.indexOf(open);
	if (at === -1) {
		return null;
	}
	let depth = 1;
	for (let i = at + open.length; i < text.length; i++) {
		if (text[i] === '{') {
			depth += 1;
		} else if (text[i] === '}') {
			depth -= 1;
			if (depth === 0) {
				return text.slice(at + open.length, i);
			}
		}
	}
	return null;
}

/** Every statement in `source` that assigns `lampOverride` (declaration included), whitespace-collapsed. */
function lampOverrideWrites(source: string): string[] {
	return [...source.matchAll(/(?:let\s+)?\blampOverride\b(?:\s*:\s*[^=;]+)?\s*=(?!=)\s*[^;]+;/g)].map((m) => squash(m[0]));
}

// ---------------------------------------------------------------------------
// The checks, as functions of the source text so the negative controls can
// run them against a mutated copy.
// ---------------------------------------------------------------------------

function checkOverlayFedToSyncLamps(source: string): void {
	const hook = squash(block(source, HOOK_OPEN, HOOK_CLOSE, 'the bootScene() render hook'));
	const calls = [...hook.matchAll(/syncLamps\(([^;]*)\);/g)].map((m) => m[1]!.trim());
	expect(calls.length, 'the render hook calls syncLamps() exactly once per frame').toBe(1);
	expect(calls[0], 'syncLamps()\'s third (lamp-view) argument is the hatch overlay over the folded view').toMatch(/^scene, nodes\.playfieldRoot, overlayLampView\(lampView, lampOverride\), performance\.now\(\),/);
}

function checkResetClears(source: string): void {
	const wrapper = squash(block(source, RESET_WRAPPER_OPEN, RESET_WRAPPER_CLOSE, 'the hostLoopRef reset wrapper (the seam every reset path goes through)'));
	expect(wrapper, 'the wrapper still resets the live loop').toContain('liveHostLoop.reset(resetOptions);');
	expect(wrapper, 'reset() clears the lamp override back to null, like the light budget').toContain('lampOverride = null;');
	// And window.__dragonwarBoot.reset() goes through that wrapper.
	const bootReset = squash(block(source, '\t\t\treset: () => {', '\n\t\t\t},', 'window.__dragonwarBoot.reset()'));
	expect(bootReset, 'window.__dragonwarBoot.reset() delegates to the clearing wrapper').toContain('hostLoopRef.reset();');
}

function checkHatchStoresValidated(source: string): void {
	const hatch = squash(block(source, HATCH_OPEN, HATCH_CLOSE, 'the setLampOverride() hatch'));
	expect(hatch, 'the hatch runs the pure store rule on the previous override and the request').toContain('const next = nextLampOverride(lampOverride, override);');
	expect(hatch, 'the hatch stores the store rule\'s result').toMatch(/lampOverride = next\.override;\s*$/);
	// Only three writers: the declaration (null), the reset clear, the hatch.
	const writes = lampOverrideWrites(source).sort();
	expect(writes, 'lampOverride is written only by its declaration, reset() and the hatch').toEqual(
		['lampOverride = null;', 'lampOverride = next.override;', 'let lampOverride: LampView | null = null;'].sort(),
	);
}

function checkBadOverrideLogged(source: string): void {
	const hatch = squash(block(source, HATCH_OPEN, HATCH_CLOSE, 'the setLampOverride() hatch'));
	const guard = braceBody(hatch, 'if (next.problem !== null) {');
	expect(guard, 'the hatch branches on next.problem').not.toBeNull();
	expect(guard, 'a bad override is logged with console.error naming next.problem').toMatch(/console\.error\(`[^`]*\$\{next\.problem\}[^`]*`\);/);
	expect(guard, 'the bad-override branch does not store anything itself (nextLampOverride already returned the previous one)').not.toMatch(/lampOverride\s*=/);
}

describe('Story 5.2 QA -- src/host/boot.ts (source scan): the setLampOverride() hatch is wired to the store rule, the overlay and reset()', () => {
	it('imports nextLampOverride and overlayLampView from presentation/lighting/lamp-view', () => {
		const imports = squash(bootSource()).match(/import \{([^}]*)\} from '\.\.\/presentation\/lighting\/lamp-view';/);
		expect(imports, 'boot.ts imports from lamp-view').not.toBeNull();
		const names = imports![1]!.split(',').map((n) => n.trim());
		expect(names).toContain('nextLampOverride');
		expect(names).toContain('overlayLampView');
	});

	it('the render hook feeds syncLamps() overlayLampView(lampView, lampOverride) (Matrix rows 3 and 4)', () => {
		checkOverlayFedToSyncLamps(bootSource());
	});

	it('the hatch stores nextLampOverride(lampOverride, override).override, and nothing else writes lampOverride', () => {
		checkHatchStoresValidated(bootSource());
	});

	it('a bad override is logged with console.error naming the problem (Matrix row "Bad override")', () => {
		checkBadOverrideLogged(bootSource());
	});

	it('reset() clears the override back to null (the spec: "reset() clears it")', () => {
		checkResetClears(bootSource());
	});
});

describe('Story 5.2 QA -- negative controls: each scanner fails on a mutated copy of the real boot.ts', () => {
	const real = bootSource();
	const mutate = (from: string | RegExp, to: string): string => {
		const next = real.replace(from, to);
		expect(next, `precondition: the mutation ${String(from)} applies to the real source`).not.toBe(real);
		return next;
	};

	it('bare lampView passed to syncLamps() fails the overlay check', () => {
		const mutated = mutate('overlayLampView(lampView, lampOverride),', 'lampView,');
		expect(() => checkOverlayFedToSyncLamps(mutated)).toThrow(/third \(lamp-view\) argument/);
	});

	it('the reset wrapper without `lampOverride = null;` fails the reset check', () => {
		const mutated = mutate(/\n\t*lampOverride = null;/, '');
		expect(() => checkResetClears(mutated)).toThrow(/reset\(\) clears the lamp override/);
	});

	it('the hatch storing the unvalidated `override` fails the store check', () => {
		const mutated = mutate('lampOverride = next.override;', 'lampOverride = override;');
		expect(() => checkHatchStoresValidated(mutated)).toThrow(/stores the store rule's result/);
	});

	it('the hatch without its console.error fails the error-log check', () => {
		const mutated = mutate(/console\.error\(`\[dragonwar\] setLampOverride\(\)[^`]*`\);/, '');
		expect(() => checkBadOverrideLogged(mutated)).toThrow(/logged with console\.error/);
	});

	it('the real source passes every check (the positive control, restated beside the negatives)', () => {
		expect(() => {
			checkOverlayFedToSyncLamps(real);
			checkResetClears(real);
			checkHatchStoresValidated(real);
			checkBadOverrideLogged(real);
		}).not.toThrow();
	});
});
