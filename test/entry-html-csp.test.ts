// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- source-level regression pin for the two real HTML entry
// points this build ships: root index.html and tools/spike-1/index.html. Tasks
// & Acceptance requires the CSP meta tag "byte-for-byte as the planning
// artifacts now pin it" on both pages. tools/check-dist.mjs and its own test
// suite (test/check-dist.test.ts) validate that invariant's LOGIC against
// constructed fixture dist/ directories, and the real `pnpm build` output was
// verified manually/in CI (docs/spikes/spike-3.md; this story's own
// "Verification performed" record) -- but nothing in the default `pnpm test`
// run reads the actual committed source files directly, so a source edit that
// drops or alters either page's CSP tag would go undetected until the next
// real build. This is that guard: no build required, just the two files on disk.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PINNED_CSP_TAG =
	'<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; connect-src \'self\' blob:; img-src \'self\' blob:">';

const REPO_ROOT = path.resolve(__dirname, '..');
const ENTRY_HTML_FILES = [
	path.resolve(REPO_ROOT, 'index.html'),
	path.resolve(REPO_ROOT, 'tools', 'spike-1', 'index.html'),
];

describe('the two real HTML entry points -- CSP meta tag, byte-for-byte (Tasks & Acceptance)', () => {
	for (const file of ENTRY_HTML_FILES) {
		const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');

		it(`${rel} carries the exact pinned CSP tag`, () => {
			const html = readFileSync(file, 'utf8');
			expect(html).toContain(PINNED_CSP_TAG);
		});

		it(`${rel} carries no inline <style> block`, () => {
			const html = readFileSync(file, 'utf8');
			expect(html).not.toMatch(/<style\b/i);
		});
	}

	it('index.html links to THIRD-PARTY-NOTICES.txt from the press-to-begin panel', () => {
		const html = readFileSync(ENTRY_HTML_FILES[0], 'utf8');
		expect(html).toMatch(/href="\.\/THIRD-PARTY-NOTICES\.txt"/);
	});
});

// --- Review 2026-08-28 ---
// AD-17's boot invariants were asserted by nothing in the default test run.
// Renaming an id in index.html alone, deleting `#gate[hidden]{display:none}`,
// or hoisting the click listener above the WebGL2 guard each left all 288 tests
// green while breaking the shipped page -- in the id case fatally, because
// byId() throws at module scope before showError() can ever run, so the error
// panel that exists to prevent a dead page is itself disabled. These are
// source-level pins in the established test/sim-boundary.test.ts /
// test/spike-1-harness-boundary.test.ts style: no DOM environment needed.

const BOOT_TS = path.resolve(REPO_ROOT, 'src', 'host', 'boot.ts');
const STYLES_CSS = path.resolve(REPO_ROOT, 'public', 'styles.css');

describe('src/host/boot.ts -- the element-id contract with index.html (AD-17)', () => {
	const bootSource = readFileSync(BOOT_TS, 'utf8');
	const indexHtml = readFileSync(ENTRY_HTML_FILES[0], 'utf8');

	const requestedIds = [...bootSource.matchAll(/byId<[^>]*>\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);

	it('finds the ids boot.ts looks up (sanity check the pin itself is wired up)', () => {
		expect(requestedIds.length).toBeGreaterThanOrEqual(5);
	});

	for (const id of requestedIds) {
		it(`index.html defines #${id}, which boot.ts resolves at module scope`, () => {
			expect(indexHtml).toMatch(new RegExp(`id="${id}"`));
		});
	}

	it('reveals the error panel by re-querying the live canvas, not a stale module binding', () => {
		expect(bootSource).toMatch(/getElementById\(\s*'render-canvas'\s*\)/);
	});
});

describe('src/host/boot.ts -- WebGL2 is checked before anything is wired (AD-17)', () => {
	const bootSource = readFileSync(BOOT_TS, 'utf8');

	it('attaches the press-to-begin listener only inside the supportsWebGL2() true branch', () => {
		const guardIndex = bootSource.indexOf('if (supportsWebGL2())');
		const listenerIndex = bootSource.indexOf("beginButton.addEventListener('click'");
		expect(guardIndex, 'the supportsWebGL2() guard must exist').toBeGreaterThan(-1);
		expect(listenerIndex, 'the click listener must exist').toBeGreaterThan(-1);
		expect(
			listenerIndex,
			'the click listener must be attached after -- and therefore inside -- the WebGL2 guard, so a WebGL2-less browser never boots the engine',
		).toBeGreaterThan(guardIndex);
	});

	it('names Chrome, Edge and Safari in the unsupported-browser message', () => {
		expect(bootSource).toMatch(/Chrome, Edge or Safari/);
	});
});

// Story 1.3, AR-34 -- the commit-SHA stamp. tools/check-dist.mjs's
// checkBuildShaStamp() (see test/check-dist.test.ts) proves the SHA string
// ends up somewhere in the built bundle, but not that it got there via THIS
// mechanism: a regression that renamed the attribute (e.g. "data-buildsha")
// or replaced setAttribute() with, say, a console.log(BUILD_SHA) would still
// leave the literal SHA substring in the compiled bundle, so that check alone
// would keep passing. This source-level pin, in the same no-DOM-required
// style as the two describe blocks above, guards the mechanism itself.
describe('src/host/boot.ts -- the commit-SHA stamp is published as a DOM attribute (AR-34)', () => {
	const bootSource = readFileSync(BOOT_TS, 'utf8');

	it('imports BUILD_SHA from ./build-info', () => {
		expect(bootSource).toMatch(/import\s*\{\s*BUILD_SHA\s*\}\s*from\s*'\.\/build-info'/);
	});

	it('publishes it as the data-build-sha attribute on the document element', () => {
		expect(bootSource).toContain("document.documentElement.setAttribute('data-build-sha', BUILD_SHA);");
	});
});

describe('public/styles.css -- the [hidden] panels really hide (AD-17: never white-screen)', () => {
	const css = readFileSync(STYLES_CSS, 'utf8');

	// All three panels are `position: fixed; inset: 0` with no z-index, so DOM
	// order decides stacking and a [hidden] rule that does not set display:none
	// leaves a panel painted over the error message.
	// Plain string scanning rather than a built regex: the selectors contain
	// regex metacharacters ('#', '[', ']', '-') and the escaping is easy to get
	// silently wrong -- a mis-escaped pattern that never matches would fail
	// loudly, but one that matches too much would pass vacuously.
	function declarationBlockFor(selector: string): string {
		const at = css.indexOf(selector);
		if (at === -1) {
			return '';
		}
		const open = css.indexOf('{', at);
		const close = css.indexOf('}', open);
		if (open === -1 || close === -1) {
			return '';
		}
		return css.slice(open + 1, close);
	}

	for (const selector of ['#gate[hidden]', '#error-panel[hidden]', '#render-canvas[hidden]']) {
		it(`${selector} sets display: none`, () => {
			const block = declarationBlockFor(selector);
			expect(block, `${selector} has no rule in public/styles.css`).not.toBe('');
			expect(block.replace(/\s+/g, ' ')).toContain('display: none');
		});
	}
});
