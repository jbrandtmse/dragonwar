// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// DW-88: the five golden replays are hashed and diffed byte-for-byte across
// engines (test/replay-goldens.test.ts, tools/replay-parity/**); a CRLF
// checkout on a fresh clone (`core.autocrlf=true` in this repo -- see
// .gitattributes) would corrupt that comparison. Every downstream reader
// already normalises line endings as a workaround; `.gitattributes`'
// `test/replays/** eol=lf` rule makes the LF guarantee structural instead,
// so this test pins the rule through the actual mechanism Git enforces it
// with -- `git check-attr eol` -- rather than re-reading the files' current
// on-disk bytes (which would pass "by accident" even without the rule, per
// this story's own Code Map: "the five goldens are LF in this worktree
// incidentally -- the recorder wrote them; Git guaranteed nothing").

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const GOLDENS_DIR = path.join(REPO_ROOT, 'test', 'replays');

const GOLDEN_NAMES = [
	'full-plunge.golden.json',
	'hold-and-release.golden.json',
	'nudge-coupling.golden.json',
	'roll-and-drain.golden.json',
	'two-ball-collision.golden.json',
];

function checkAttrEol(relativePath: string): string {
	const result = spawnSync('git', ['check-attr', 'eol', '--', relativePath], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
	});
	if (result.status !== 0) {
		throw new Error(`"git check-attr eol -- ${relativePath}" failed (exit ${result.status}): ${result.stderr}`);
	}
	// Single-path output shape: "<path>: eol: <value>\n"
	const match = /:\s*eol:\s*(\S+)\s*$/.exec(result.stdout.trim());
	if (!match) {
		throw new Error(`could not parse "git check-attr eol" output for ${relativePath}: ${JSON.stringify(result.stdout)}`);
	}
	return match[1];
}

describe('.gitattributes -- test/replays/** eol=lf (DW-88)', () => {
	it('GOLDEN_NAMES matches every *.golden.json actually on disk under test/replays/ -- a golden renamed, added, or removed here can never go silently unchecked (verification-gap review, this pass: "git check-attr eol" resolves purely from the .gitattributes glob and reports "lf" even for a path that does not exist, so this is the ONLY assertion in this file that would catch a golden going missing)', () => {
		const onDisk = readdirSync(GOLDENS_DIR)
			.filter((name) => name.endsWith('.golden.json'))
			.sort();
		expect([...GOLDEN_NAMES].sort()).toEqual(onDisk);
		for (const name of GOLDEN_NAMES) {
			expect(existsSync(path.join(GOLDENS_DIR, name)), `${name} is named in GOLDEN_NAMES but does not exist on disk`).toBe(true);
		}
	});

	it.each(GOLDEN_NAMES)('git check-attr eol reports "lf" for test/replays/%s', (name) => {
		const relative = `test/replays/${name}`;
		expect(checkAttrEol(relative)).toBe('lf');
	});
});
