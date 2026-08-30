// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9, AC 5: "given docs/feel-test.md, when the ritual's build side is
// run on ?renderer=webgl2 and on the default path, then the document defines
// cradling, flipper snap and rejection/rebound, carries one ISO-dated entry
// per item with its measured build-side numbers and a link to a real golden
// file, and names both renderer paths." Follows
// test/spike-1-docs.test.ts's own precedent: content-based, not
// heading-position-based (whitespace-normalised before matching), and
// cross-checks a linked golden file actually exists with fs.existsSync
// rather than trusting the doc's own prose.
//
// The comparative verdict against the Reference machine is the author's own
// leg (frontmatter deferred:, ac5-reference-machine-leg-is-author-owned) --
// see this file's own "verdict token" describe block below for how that gap
// stays visible in CI rather than silent.
//
// Falsifiability (spec):
// - mutation: delete the "rejection/rebound" item from docs/feel-test.md ->
//   the three-items assertion goes red.
// - mutation: point the golden link at a non-existent file -> the
//   fs.existsSync assertion goes red.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DOC_PATH = path.resolve(__dirname, '..', 'docs', 'feel-test.md');
const REPO_ROOT = path.resolve(__dirname, '..');

function normalize(text: string): string {
	return text.replace(/\s+/g, ' ');
}

describe('docs/feel-test.md -- the three items (AC 5)', () => {
	const normalized = normalize(readFileSync(DOC_PATH, 'utf8'));

	it('defines all three items by name: cradling, flipper snap, rejection/rebound', () => {
		expect(normalized).toMatch(/[Cc]radling/);
		expect(normalized).toMatch(/[Ff]lipper snap/);
		expect(normalized).toMatch(/[Rr]ejection\/rebound/);
	});

	it('names the Reference machine (Stern Dungeons & Dragons)', () => {
		expect(normalized).toMatch(/Stern/);
		expect(normalized).toMatch(/Dungeons\s*&\s*Dragons/);
	});
});

describe('docs/feel-test.md -- one ISO-dated entry per item, with measured build-side numbers (AC 5)', () => {
	const raw = readFileSync(DOC_PATH, 'utf8');
	const normalized = normalize(raw);
	const ISO_DATE = /\d{4}-\d{2}-\d{2}/;

	it('carries at least one ISO YYYY-MM-DD dated heading', () => {
		expect(normalized).toMatch(ISO_DATE);
	});

	it('the cradling entry carries a measured build-side number (drift in mm)', () => {
		const section = raw.slice(raw.indexOf('### Cradling'), raw.indexOf('### Flipper snap'));
		expect(section.length, 'the cradling section must exist and be non-empty').toBeGreaterThan(0);
		expect(normalize(section)).toMatch(/\d+(\.\d+)?\s*mm/);
	});

	it('the flipper-snap entry carries the DW-80 measured numbers (release/peak angles in degrees)', () => {
		const section = raw.slice(raw.indexOf('### Flipper snap'), raw.indexOf('### Rejection/rebound'));
		expect(section.length).toBeGreaterThan(0);
		const n = normalize(section);
		expect(n).toMatch(/90\.0416/);
		expect(n).toMatch(/104\.3998/);
		expect(n.toLowerCase()).toContain('dw-80');
	});

	it('the rejection/rebound entry carries the elasticity-falloff ratios and the hop-control margin', () => {
		const section = raw.slice(raw.indexOf('### Rejection/rebound'), raw.indexOf('## Both renderer paths'));
		expect(section.length).toBeGreaterThan(0);
		const n = normalize(section);
		expect(n).toMatch(/0\.7584/);
		expect(n).toMatch(/0\.6886/);
		expect(n.toLowerCase()).toContain('mm');
	});
});

describe('docs/feel-test.md -- the link-to-golden mechanism resolves to a REAL file (AC 5)', () => {
	const raw = readFileSync(DOC_PATH, 'utf8');

	it('links at least one real golden file under test/replays/, checked with fs.existsSync (not merely present in prose)', () => {
		const linkMatches = [...raw.matchAll(/\(\.\.\/(test\/replays\/[\w.-]+\.golden\.json)\)/g)];
		expect(linkMatches.length, 'the doc must link at least one golden file').toBeGreaterThan(0);
		for (const match of linkMatches) {
			const relativePath = match[1]!;
			const absolutePath = path.resolve(REPO_ROOT, relativePath);
			expect(existsSync(absolutePath), `linked golden "${relativePath}" does not exist on disk`).toBe(true);
		}
	});

	it('every item section links a golden file', () => {
		const normalized = normalize(raw);
		const goldenLinkPattern = /test\/replays\/[\w.-]+\.golden\.json/;
		for (const heading of ['### Cradling', '### Flipper snap', '### Rejection/rebound']) {
			const start = raw.indexOf(heading);
			expect(start, `heading "${heading}" must exist`).toBeGreaterThanOrEqual(0);
			const nextHeadingIdx = raw.indexOf('\n### ', start + heading.length);
			const nextSectionIdx = raw.indexOf('\n## ', start + heading.length);
			const end = [nextHeadingIdx, nextSectionIdx].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? raw.length;
			const section = normalize(raw.slice(start, end));
			expect(section, `section "${heading}" must link a golden file`).toMatch(goldenLinkPattern);
		}
	});
});

describe('docs/feel-test.md -- both renderer paths are named (AC 5)', () => {
	const normalized = normalize(readFileSync(DOC_PATH, 'utf8'));

	it('names the forced-WebGL2 path', () => {
		expect(normalized).toMatch(/\?renderer=webgl2/);
	});

	it('names the default (unforced) path', () => {
		expect(normalized.toLowerCase()).toMatch(/default path/);
	});
});

describe('docs/feel-test.md -- the Reference-machine verdict is the author\'s own leg (frontmatter deferred:)', () => {
	const specPath = path.resolve(REPO_ROOT, '_bmad-output', 'implementation-artifacts', 'spec-1-9-dev-tuning-panel-and-the-first-feel-ritual.md');
	const normalized = normalize(readFileSync(DOC_PATH, 'utf8'));

	it('references the deferred ledger id by name', () => {
		expect(normalized).toContain('ac5-reference-machine-leg-is-author-owned');
	});

	it('the referenced deferred entry actually exists in the spec\'s own frontmatter', () => {
		const spec = normalize(readFileSync(specPath, 'utf8'));
		expect(spec).toContain("id: 'ac5-reference-machine-leg-is-author-owned'");
	});

	// This story's own deferred entry: "Done when docs/feel-test.md's three
	// first dated entries each carry a verdict token
	// (no-material-difference | tuning-change | accepted-difference)
	// attributed to the author with an ISO date, and this assertion passes
	// WITHOUT the pending-author allowance below. Until then each entry
	// reads pending-author and this test asserts exactly that -- so the gap
	// is visible in CI, not silent."
	it('each of the three items\' first entry carries a verdict token -- currently "pending-author" (the allowance), until the author plays the Reference machine', () => {
		const raw = readFileSync(DOC_PATH, 'utf8');
		const VERDICT_TOKENS = ['no-material-difference', 'tuning-change', 'accepted-difference', 'pending-author'];
		const sections: Array<[string, string]> = [
			['Cradling', raw.slice(raw.indexOf('### Cradling'), raw.indexOf('### Flipper snap'))],
			['Flipper snap', raw.slice(raw.indexOf('### Flipper snap'), raw.indexOf('### Rejection/rebound'))],
			['Rejection/rebound', raw.slice(raw.indexOf('### Rejection/rebound'), raw.indexOf('## Both renderer paths'))],
		];
		for (const [name, section] of sections) {
			expect(section.length, `${name} section must exist`).toBeGreaterThan(0);
			const hasToken = VERDICT_TOKENS.some((token) => section.includes(token));
			expect(hasToken, `${name}'s first entry must carry a verdict token (currently must be "pending-author" -- no agent can play the Reference machine)`).toBe(true);
			// The PENDING half of the allowance: today every item must read
			// pending-author specifically (a REAL verdict token here would mean
			// someone claimed to have played the Reference machine, which no
			// agent can do -- this half of the assertion is the actual gate).
			expect(section, `${name}'s first entry must read "pending-author" until the author plays the Reference machine`).toContain('pending-author');
		}
	});
});
