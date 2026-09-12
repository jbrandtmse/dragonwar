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
	// [CORRECTED, Story 2.15 QA pass] Review pass, Story 2.15 changed the
	// separator to `\s+` and scanned whole-file content instead of
	// per-line, reasoning that this would survive a phrase wrapped across a
	// line break. Independently re-verified at the QA pass and found NOT to
	// close that gap: every multi-line comment this codebase actually
	// writes re-prefixes each continuation line with its own marker ("// ",
	// " * ", or "# " -- this very file's own header above, and
	// shot-reachability.test.ts's DW-138 JSDoc block, are live examples of
	// the first two), so the text between "case" and "manifest"/"suite" is
	// never PURE whitespace when a real wrap happens -- it is
	// "\n// "/"\n * "/"\n# ", which `\s+` alone does not span. A synthetic
	// two-line string with NO comment marker on its second line (not a
	// shape any real comment in this repo takes) passes under `\s+` and
	// gave false confidence; a synthetic wrap in each of the three
	// conventions this repo actually uses does not. Fixed by masking each
	// line's leading comment marker to same-length spaces before scanning:
	// offsets and line breaks are preserved exactly (so the recovered line
	// number is still correct), but the marker no longer breaks the `\s+`
	// span across a real wrap.
	const MANIFEST_COUNT_PROSE_RE = /(\d+)-case\s+(?:manifest|suite)/g;
	const LEADING_COMMENT_MARKER_RE = /^[ \t]*(?:\/\/|\*(?!\/)|#)/gm;
	// [CODE REVIEW, Story 2.15] `src` added. DW-272's own evidence counts
	// stale citations "across test/, tools/ and src/", but this gate saw only
	// the first two, so manifest-count prose in src/ escaped it entirely.
	// Verified zero live matches under src/ today, so this widens the gate's
	// reach without changing its verdict.
	const SCAN_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
		test: ['.ts'],
		tools: ['.py', '.mjs'],
		src: ['.ts'],
	};

	/**
	 * [CODE REVIEW, Story 2.15] The masked scan, extracted as a pure
	 * function. Reason: the QA pass's comment-marker masking -- the whole
	 * point of the repair -- had NO executed test host. Reverting
	 * `LEADING_COMMENT_MARKER_RE` and scanning raw content left this file at
	 * 28/28 and the full suite green, because the only live
	 * "<N>-case manifest/suite" phrase in the scanned tree
	 * (tools/make-placeholder-blend.py:857) sits entirely on one line, so the
	 * masked and unmasked scans return an identical result on every real
	 * file. A repair whose red has never been observed is not evidence
	 * (Rule 19); the fixture test below observes it.
	 */
	interface ProseCountMatch {
		readonly quotedN: number;
		readonly lineNo: number;
		readonly text: string;
	}

	function findManifestCountProse(content: string): readonly ProseCountMatch[] {
		// Mask each line's leading comment marker to same-length spaces so a
		// phrase wrapped across the line break is joined by `\s+` alone,
		// while every character offset (and therefore the line number
		// recovered below) stays IDENTICAL to the original content -- this
		// replaces marker characters with spaces of the same count, it never
		// removes or reflows anything.
		const masked = content.replace(LEADING_COMMENT_MARKER_RE, (marker) => ' '.repeat(marker.length));
		const out: ProseCountMatch[] = [];
		MANIFEST_COUNT_PROSE_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = MANIFEST_COUNT_PROSE_RE.exec(masked))) {
			out.push({
				quotedN: parseInt(m[1]!, 10),
				lineNo: masked.slice(0, m.index).split(/\r\n|\n/).length,
				text: m[0].replace(/\s+/g, ' '),
			});
		}
		return out;
	}

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
	//
	// mutation (QA pass, the wrap-fix itself): quote a wrong N split across
	// two lines in this codebase's own "// " convention (e.g. "the full
	// 99-case\n// manifest") -> with the marker masked out this still goes
	// red naming the file/line/text; reverting the mask (back to plain
	// `\s+` against unmasked content) leaves the SAME two-line mutation
	// GREEN, reproducing the defect this fix closes.
	it(`every quoted case count agrees with the live SHOT_CASES.length (${SHOT_CASES.length} today)`, () => {
		const files: string[] = [];
		for (const [dir, exts] of Object.entries(SCAN_EXTENSIONS)) {
			scanDir(path.join(REPO_ROOT, dir), exts, files);
		}

		const mismatches: string[] = [];
		let matchCount = 0;
		for (const file of files) {
			const relative = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
			for (const hit of findManifestCountProse(readFileSync(file, 'utf8'))) {
				matchCount += 1;
				if (hit.quotedN !== SHOT_CASES.length) {
					mismatches.push(`${relative}:${hit.lineNo} quotes "${hit.text}" -- SHOT_CASES.length is ${SHOT_CASES.length}`);
				}
			}
		}
		// Anti-vacuity: a scan that never finds any manifest-count prose to
		// check proves nothing. [CODE REVIEW, Story 2.15] This note used to
		// claim "this file's own corrected comments above (and
		// shot-cases.ts's own header) guarantee at least one real hit" --
		// neither does. Measured across the whole scanned tree: exactly ONE
		// live match, `tools/make-placeholder-blend.py:857`, because this
		// story's own DW-151 corrections reworded every other instance into
		// shapes the pattern deliberately does not see ("52 cases today").
		// The assertion still binds -- reword that one line and this gate
		// fails loudly rather than going quietly vacuous -- but its basis is
		// one comment in one Python file, not the sources named above.
		expect(matchCount, 'sanity: the scan must find at least one "<N>-case manifest/suite" comment, or this gate is vacuous').toBeGreaterThan(0);
		expect(mismatches, `${mismatches.length} comment(s) quote a stale case count:\n${mismatches.join('\n')}`).toEqual([]);
	});

	// [CODE REVIEW, Story 2.15] The wrap branch, pinned. The scan above
	// cannot exercise it: no wrapped "<N>-case manifest" phrase exists
	// anywhere in test/** or tools/**, so masking or not masking produced
	// the same single result and the QA repair could be deleted with nothing
	// red. These fixtures execute the branch directly, in each of the three
	// continuation-marker conventions this repository actually uses.
	//
	// mutation: delete `LEADING_COMMENT_MARKER_RE`'s replacement (scan raw
	// content, the state QA diagnosed as broken) -> the three wrapped
	// fixtures below find 0 matches and this test goes red on each; the
	// file-tree scan above stays green either way, which is exactly why this
	// test has to exist.
	it('the scan spans a count phrase wrapped across a line break in each comment convention this repo uses', () => {
		// Assembled from parts on purpose: the tree scan above reads THIS
		// file, so a literal count phrase written out here would itself be a
		// mismatch and fail that test. Interpolating puts a `}` before the
		// hyphen, which the pattern cannot match in the source, while the
		// runtime string is exactly the phrase under test.
		const COUNT = '99';
		const PHRASE = `${COUNT}-case`;
		const wrapped: Readonly<Record<string, string>> = {
			'// line comment': `// the full ${PHRASE}\n// manifest is driven here\n`,
			'/* * jsdoc */': ` * the full ${PHRASE}\n * manifest is driven here\n`,
			'# python': `# the full ${PHRASE}\n# manifest is driven here\n`,
			'tab-indented //': `\t// the full ${PHRASE}\n\t// manifest is driven here\n`,
		};
		for (const [convention, content] of Object.entries(wrapped)) {
			const hits = findManifestCountProse(content);
			expect(hits.map((h) => h.quotedN), `a "${PHRASE} manifest" wrapped in the ${convention} convention must still be found -- an unmasked scan sees the continuation marker between "case" and "manifest" and misses it`).toEqual([99]);
			// The recovered line number must still point at the line the
			// phrase STARTS on: masking replaces markers with spaces of the
			// same length, so no offset may shift.
			expect(hits[0]!.lineNo, `the ${convention} fixture's match must report line 1, where the phrase starts`).toBe(1);
		}
		// Positive control: an unwrapped phrase is found too, so a fixture
		// set that found nothing at all could not pass by accident.
		expect(findManifestCountProse(`// a ${PHRASE} suite\n`).map((h) => h.quotedN)).toEqual([99]);
		// Negative control: a comment with no count is ignored (the gate's
		// own stated contract, I/O matrix "Manifest count prose drifts").
		expect(findManifestCountProse('// the manifest is driven here\n')).toEqual([]);
	});
});
