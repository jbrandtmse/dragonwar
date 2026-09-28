#!/usr/bin/env node
// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-16, AR-34: the per-file licence-header check. Every tracked source file
// (discovered from `git ls-files`, never a hand-maintained roots list -- the
// Story 1.1 stand-in's list needed widening twice, per review) carrying one
// of the authored extensions must contain the DragonWar GPL-3.0 header, the
// vpx-js port marker, or (Story 1.7) the vpinball/vpinball port marker.
// `public/LICENSE.txt` and
// `public/THIRD-PARTY-NOTICES.txt` are licence texts themselves; `pnpm-lock.yaml`
// is a machine-generated lockfile, not hand-authored source -- all three are
// exempt by exact path.
//
// `.claude/**`, `_bmad/**` and `_bmad-output/**` are excluded by tree, not by
// a hand-maintained roots ALLOWLIST (the defect this check replaces): they
// are the pre-existing BMad Method installation and its process output,
// already recorded in ATTRIBUTIONS.md's Code table as "Tooling only -- not
// part of the program, removable without affecting it" -- a DragonWar
// copyright header on a third-party tool's own script would misstate
// provenance, not correct it, and this check's own unconditional
// verification requirement ("pnpm check:headers -- expected: exit 0" on the
// repository as committed) is unsatisfiable without this exclusion: neither
// tree carries or is meant to carry DragonWar's header. Excluding a *tree*
// that is not this project's source is a different concern from the
// under-coverage bug a hand-picked roots list caused (missing DragonWar's
// own new directories); this check still discovers every DragonWar-owned
// file from `git ls-files` with no allowlist of which of *those* to include.
//
// Node built-ins only. Usage: node tools/check-licence-headers.mjs

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const AUTHORED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.html', '.css', '.py', '.yml', '.yaml']);
const EXEMPT_RELATIVE_PATHS = new Set(['public/LICENSE.txt', 'public/THIRD-PARTY-NOTICES.txt', 'pnpm-lock.yaml']);
const EXCLUDED_TREE_PREFIXES = ['.claude/', '_bmad/', '_bmad-output/'];

const AUTHORED_HEADER = 'DragonWar is licensed GPL-3.0';
const PORT_MARKER = 'Ported from vpdb/vpx-js';
// Story 1.7: the vpinball/vpinball port's own marker substring (the third
// class, `src/sim/physics/cabinet/**`) -- a flat third disjunct, exactly the
// same shape as PORT_MARKER above, no structural check (that belongs to
// test/port-provenance.test.ts's own, stricter third branch).
const VPINBALL_PORT_MARKER = 'Ported from vpinball/vpinball';

export class CheckHeadersError extends Error {}

function listTrackedFiles() {
	// `-z` (NUL-separated, never quoted) rather than plain `git ls-files`:
	// with the default `core.quotePath`, a tracked path containing a
	// non-ASCII byte comes back C-quoted, e.g. `"src/caf\303\251.ts"`. That
	// string's extension parses as `.ts"`, which is not in
	// AUTHORED_EXTENSIONS, so the file was silently skipped by the very check
	// that exists to leave no source file unexamined (review finding, this
	// story's review pass).
	const result = spawnSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf8' });
	if (result.status !== 0) {
		throw new CheckHeadersError(`"git ls-files" failed (exit ${result.status}): ${result.stderr}`);
	}
	const files = result.stdout.split('\0').filter((line) => line.length > 0);
	// Never report success over an empty file list: run from the wrong cwd or
	// against an empty index this check would otherwise print OK having read
	// nothing, the same vacuous-pass failure the boundary lint's coverage
	// guard exists to prevent.
	if (files.length === 0) {
		throw new CheckHeadersError('"git ls-files" reported no tracked files -- this check inspected nothing, which is a defect, not a pass');
	}
	return files;
}

export function checkLicenceHeaders(files = listTrackedFiles()) {
	const offenders = [];
	for (const relative of files) {
		const posix = relative.split(path.sep).join('/');
		if (EXEMPT_RELATIVE_PATHS.has(posix)) {
			continue;
		}
		if (EXCLUDED_TREE_PREFIXES.some((prefix) => posix.startsWith(prefix))) {
			continue;
		}
		const ext = path.extname(posix);
		if (!AUTHORED_EXTENSIONS.has(ext)) {
			continue;
		}
		const fullPath = path.join(REPO_ROOT, relative);
		let content;
		try {
			content = readFileSync(fullPath, 'utf8');
		} catch {
			// A file `git ls-files` reports but that no longer exists on disk
			// (e.g. mid-rename in a working tree) is not this check's concern.
			continue;
		}
		if (!content.includes(AUTHORED_HEADER) && !content.includes(PORT_MARKER) && !content.includes(VPINBALL_PORT_MARKER)) {
			offenders.push(posix);
		}
	}
	return offenders;
}

function main() {
	let offenders;
	try {
		offenders = checkLicenceHeaders();
	} catch (err) {
		console.error(`[check-headers] FAILED: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
		return;
	}

	if (offenders.length === 0) {
		console.log('[check-headers] OK -- every tracked authored-extension file carries a licence header');
		process.exit(0);
		return;
	}

	console.error(`[check-headers] FAILED -- ${offenders.length} file(s) missing "${AUTHORED_HEADER}", "${PORT_MARKER}" or "${VPINBALL_PORT_MARKER}":`);
	for (const file of offenders) {
		console.error(`  ${file}`);
	}
	process.exit(1);
}

const isMainModule = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMainModule) {
	main();
}
