// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// QA pass, Story 2.1e. This story's own deliverable IS test infrastructure
// (`test/util/plan-geometry.ts`, `test/util/reachability.ts`,
// `test/util/shot-cases.ts`) -- every one of `test/shot-reachability.test.ts`'s
// tests (167 today, re-measure at your own tree) and `pnpm check:reachability`'s
// dense sweep is built on three primitives this file is the FIRST to test
// directly, independent of the manifest (52 cases today, not 39 or 45 --
// [CORRECTED, Story 2.15, DW-151]): `pointToSegmentDistanceMm()` (the distance metric
// EVERY reachability measurement in this story reduces to), and the two
// "fails loudly, never silently" contracts the whole design leans on --
// `witnessPath()`/`closestApproachMm()` on an unknown witness id, and
// `shotCase()` on an unknown case id (the manifest gate `driveCase()`
// depends on). None of these are exercised by the routine per-case tests,
// because every REAL manifest entry already names a real witness and a real
// case id -- a bug in any of the three could rot the whole harness's
// guarantee without a single existing test noticing, exactly the "test the
// harness itself as a subject" gap this file closes (precedent:
// `test/geometry.test.ts`'s own DW-61 header -- "the FIRST direct test of
// the function itself" for a sibling geometry primitive).

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pointToSegmentDistanceMm, pointInPolygon, distanceToPolygonMm } from './util/plan-geometry';
import { closestApproachMm, closestApproachOverAll, witnessPath, witnessIds, REACHABILITY_TOLERANCE_MM } from './util/reachability';
import { shotCase, SHOT_CASES } from './util/shot-cases';

const REPO_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// pointToSegmentDistanceMm() -- the primitive every reachability measurement
// in this story (the in-suite gate, the dense sweep, and DW-130's proximity
// record) reduces to. Tested here with synthetic geometry chosen so a
// missing clamp or a degenerate-segment mishandling produces a WRONG number
// rather than a merely-imprecise one.
// ---------------------------------------------------------------------------

describe('plan-geometry.ts -- pointToSegmentDistanceMm() (the distance primitive the whole reachability metric reduces to)', () => {
	it('a point exactly on the segment is distance 0', () => {
		expect(pointToSegmentDistanceMm(5, 0, 0, 0, 10, 0)).toBe(0);
	});

	it('a point perpendicular off the segment midpoint returns the exact perpendicular distance', () => {
		expect(pointToSegmentDistanceMm(5, 5, 0, 0, 10, 0)).toBeCloseTo(5, 9);
	});

	it('a point beyond one endpoint, collinear with the segment, is CLAMPED to that endpoint -- not treated as an infinite line (an unclamped projection would wrongly report 0 here, since the point lies exactly on the line through the segment)', () => {
		expect(pointToSegmentDistanceMm(15, 0, 0, 0, 10, 0)).toBeCloseTo(5, 9);
	});

	it('a DEGENERATE zero-length segment (a === b) falls back to point-to-point distance, not NaN or Infinity', () => {
		expect(pointToSegmentDistanceMm(8, 9, 5, 5, 5, 5)).toBeCloseTo(5, 9);
		expect(pointToSegmentDistanceMm(5, 5, 5, 5, 5, 5)).toBe(0);
	});
});

describe('plan-geometry.ts -- pointInPolygon() / distanceToPolygonMm()', () => {
	const SQUARE = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 10 },
		{ x: 0, y: 10 },
	];

	it('a point inside a simple square is inside, and its polygon distance is 0', () => {
		expect(pointInPolygon(5, 5, SQUARE)).toBe(true);
		expect(distanceToPolygonMm(5, 5, SQUARE)).toBe(0);
	});

	it('a point outside is outside, and its polygon distance is the nearest edge, never 0', () => {
		expect(pointInPolygon(15, 5, SQUARE)).toBe(false);
		expect(distanceToPolygonMm(15, 5, SQUARE)).toBeCloseTo(5, 9);
	});
});

// ---------------------------------------------------------------------------
// witnessPath() / closestApproachMm() on an UNKNOWN witness id: the
// "declaration completeness" describe block in test/shot-reachability.test.ts
// checks every REAL manifest entry's witness id against `witnessIds()`
// before the per-case proof ever runs `closestApproachMm()` -- so the engine
// itself failing loudly on a bad id, rather than silently returning
// Infinity/0/undefined, is never exercised by the real manifest (52 cases
// today -- [CORRECTED, Story 2.15, DW-151]).
// It is the only thing standing between a typo'd witness id and a silently
// wrong verdict if that completeness check were ever weakened or bypassed.
// ---------------------------------------------------------------------------

describe('reachability.ts -- an unknown witness id fails loudly, never silently', () => {
	it('witnessPath() throws, naming the unknown id', () => {
		expect(() => witnessPath('not-a-real-witness-id')).toThrow(/not-a-real-witness-id/);
	});

	it('closestApproachMm() propagates the same throw -- a bad witness reference can never silently resolve to a distance', () => {
		expect(() => closestApproachMm({ x: 0, y: 0 }, 'not-a-real-witness-id')).toThrow(/not-a-real-witness-id/);
	});
});

// ---------------------------------------------------------------------------
// closestApproachOverAll() is not a stub: it must report FAR for a point no
// witness ever visits, and it must find EVERY declared witness's own path,
// not just the first one a naive loop-with-early-return might settle on.
// ---------------------------------------------------------------------------

describe('reachability.ts -- closestApproachOverAll() genuinely discriminates near from far', () => {
	it('a point far outside the playfield is reported farther than REACHABILITY_TOLERANCE_MM by every witness -- "reachable" is not always true', () => {
		const far = closestApproachOverAll({ x: 100_000, y: 100_000 });
		expect(far.closestApproachMm).toBeGreaterThan(REACHABILITY_TOLERANCE_MM);
	});

	it.each(witnessIds().map((id) => [id] as const))(
		'a point taken from witness "%s"\'s own LAST swept segment (its point of maximum divergence from the other nine, which largely share an identical plunge-and-settle prefix) is found within a hair of 0 mm -- confirms the search actually considers this witness, not just the first one in the table',
		(id) => {
			const { segments } = witnessPath(id);
			expect(segments.length, `witness "${id}" produced no segments to sample a point from`).toBeGreaterThan(0);
			const onPath = segments[segments.length - 1]!.toMm;
			const best = closestApproachOverAll(onPath);
			expect(best.closestApproachMm).toBeCloseTo(0, 6);
		},
	);
});

// ---------------------------------------------------------------------------
// shotCase() on an unknown case id: this is the gate `driveCase()`
// (test/shot-routing.test.ts) depends on to refuse an undeclared coordinate.
// The existing suite only ever calls shotCase() with ids it already knows
// are good (the manifest's own 52 entries [CORRECTED, Story 2.15, DW-151 --
// was 39], or the DW-130 record's hand-maintained id lists) -- the refusal
// path itself has no direct test.
// ---------------------------------------------------------------------------

describe('shot-cases.ts -- shotCase() genuinely refuses an undeclared id', () => {
	it('an id not in SHOT_CASES throws, naming the id -- driveCase() can never drive a coordinate the manifest never declared', () => {
		expect(() => shotCase('not-a-real-case-id')).toThrow(/not-a-real-case-id/);
	});

	it('(contrast) a real manifest id resolves without throwing', () => {
		expect(() => shotCase(SHOT_CASES[0]!.id)).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// DW-151, the durable half (Story 2.15, task 9). The class of harm that
// misled this ledger entry was manifest-count PROSE going stale -- a
// comment quoting a case count (e.g. "39" or "45", each spelled with a
// hyphen before the word "case" and "manifest"/"suite" after it, so as not
// to itself match the pattern this gate scans for) long after SHOT_CASES
// grew past it (this file's own header carried exactly that defect until
// this story). No prior gate reads an in-code comment against
// the live subject it describes (frontmatter `deferred:`, "no gate resolves
// a `<file>.ts:<line>` comment anchor against the file it cites" -- the
// GENERAL form is declined as story-sized). This is the narrow, durable gate
// for the one class that actually caused harm: scans test/** and tools/**
// for the exact prose shape and asserts every quoted N against the live
// count, so the next story that grows the manifest is told, loudly, the
// moment it leaves a comment behind.
// ---------------------------------------------------------------------------

describe('DW-151 -- every "<N>-case manifest"/"<N>-case suite" comment agrees with the live SHOT_CASES.length', () => {
	// Review pass, Story 2.15: `\s+` (not a literal space) between "case"
	// and "manifest"/"suite" so a phrase wrapped across a line break (this
	// codebase's comments wrap prose routinely -- see the many multi-line
	// comments this very story added) is still matched. Scanned against
	// whole-file content below, never split into lines first, unlike a
	// naive per-line scan -- a per-line scan would silently miss exactly
	// that wrapped case, defeating the "durable" gate task 9 asks for.
	const MANIFEST_COUNT_PROSE_RE = /(\d+)-case\s+(?:manifest|suite)/g;
	const SCAN_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
		test: ['.ts'],
		tools: ['.py', '.mjs'],
	};

	function scanDir(dir: string, exts: readonly string[], out: string[]): void {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === 'node_modules') {
					continue;
				}
				scanDir(full, exts, out);
			} else if (exts.some((ext) => entry.name.endsWith(ext))) {
				out.push(full);
			}
		}
	}

	// mutation: change a live "<N>-case manifest/suite" comment (e.g. this
	// very describe block's own header prose, or any of the ones this
	// story corrected) to a wrong N -> this test goes red naming the file,
	// line, quoted text and the live SHOT_CASES.length -- it would have
	// passed silently under no gate at all before this story.
	it(`every quoted case count agrees with the live SHOT_CASES.length (${SHOT_CASES.length} today)`, () => {
		const files: string[] = [];
		for (const [dir, exts] of Object.entries(SCAN_EXTENSIONS)) {
			scanDir(path.join(REPO_ROOT, dir), exts, files);
		}

		const mismatches: string[] = [];
		let matchCount = 0;
		for (const file of files) {
			const content = readFileSync(file, 'utf8');
			const relative = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
			// Scanned against the WHOLE file's content, never split into
			// lines first (a phrase wrapped across a line break would
			// silently escape a per-line scan). The line number reported on
			// a mismatch is recovered from the match's own character offset.
			MANIFEST_COUNT_PROSE_RE.lastIndex = 0;
			let m: RegExpExecArray | null;
			while ((m = MANIFEST_COUNT_PROSE_RE.exec(content))) {
				matchCount += 1;
				const quotedN = parseInt(m[1]!, 10);
				if (quotedN !== SHOT_CASES.length) {
					const lineNo = content.slice(0, m.index).split(/\r\n|\n/).length;
					mismatches.push(`${relative}:${lineNo} quotes "${m[0].replace(/\s+/g, ' ')}" -- SHOT_CASES.length is ${SHOT_CASES.length}`);
				}
			}
		}
		// Anti-vacuity: a scan that never finds any manifest-count prose to
		// check proves nothing -- this file's own corrected comments above
		// (and shot-cases.ts's own header) guarantee at least one real hit.
		expect(matchCount, 'sanity: the scan must find at least one "<N>-case manifest/suite" comment, or this gate is vacuous').toBeGreaterThan(0);
		expect(mismatches, `${mismatches.length} comment(s) quote a stale case count:\n${mismatches.join('\n')}`).toEqual([]);
	});
});
