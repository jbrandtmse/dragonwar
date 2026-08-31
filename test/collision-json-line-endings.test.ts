// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// DW-114 (Story 2.1a QA pass): task 21's carriage-return regression pin
// ("a fresh collision.json export contains no carriage-return byte
// anywhere...", test/export-py.test.ts) lives inside that file's
// `describe.skipIf(!blenderPath)` block, because proving the WRITER is fixed
// requires re-exporting through Blender. CI has no Blender (this story's own
// Boundaries & Constraints), so that pin -- and the LF-writer guarantee it
// protects -- never actually runs on the platform this project ships from;
// only a developer machine with Blender resolvable ever exercises it.
//
// public/assets/dragonwar.collision.json is itself committed to the repo,
// and `.gitattributes` pins it to a bare LF (`* text=auto eol=lf`, this
// story's own "Line endings are pinned LF repo-wide"). This test asserts the
// SAME invariant task 21's writer fix protects -- no carriage-return byte
// (0x0D) anywhere in the file -- by reading the COMMITTED artifact's bytes
// directly, with no Blender subprocess and no export step. That makes it
// Blender-free and therefore CI-visible.
//
// Code review 2026-08-31 -- what this DOES and does NOT close (DW-114). The
// shipped header claimed that reintroducing `tools/export.py`'s
// platform-dependent `open()` makes this test "go red everywhere". It does
// not, and the reason is the very pin this test quotes: `* text=auto eol=lf`
// makes git strip CR on commit and write LF on checkout, so a fresh clone --
// which is exactly what CI is -- reads an LF file no matter what the writer
// produced. What this test actually guards is the COMMITTED artifact's own
// bytes: a dirty working tree carrying a CRLF export that has not been
// checked out again, and the `.gitattributes` pin itself being removed,
// weakened, or overridden for this path (e.g. marking the JSON `binary` or
// `-text`). Both are real and both are CI-visible; the WRITER's own
// behaviour is not, and remains pinned only by test/export-py.test.ts's
// Blender-gated CR-byte case. Closing that residual needs a Blender-free
// exercise of export.py's write path itself, in the shape
// test/export-py-hull.test.ts already uses for its Blender-free helpers --
// see this story's deferred-work ledger entry DW-114.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const COMMITTED_COLLISION = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

describe('public/assets/dragonwar.collision.json -- committed bytes carry no CRLF (DW-114, Blender-free companion to task 21)', () => {
	it('the committed collision document contains no carriage-return byte (0x0D) anywhere, on any host platform, with no Blender required', () => {
		const committed = readFileSync(COMMITTED_COLLISION);
		expect(
			committed.length,
			`${COMMITTED_COLLISION} read as empty -- the CR-byte check below would pass vacuously against an empty buffer, so guard against that first.`,
		).toBeGreaterThan(0);

		const crIndex = committed.indexOf(0x0d);
		expect(
			crIndex,
			`public/assets/dragonwar.collision.json contains a carriage-return byte (0x0D) at offset ${crIndex} -- ` +
				'.gitattributes pins this file to a bare LF (`* text=auto eol=lf`); a CR byte here means the committed ' +
				'artifact has drifted from that guarantee (e.g. tools/export.py writing it in platform text mode again, ' +
				'see task 21 / test/export-py.test.ts\'s Blender-gated sibling pin). Re-run `pnpm export:assets` with ' +
				'Blender resolvable and commit the regenerated file.',
		).toBe(-1);
	});
});
