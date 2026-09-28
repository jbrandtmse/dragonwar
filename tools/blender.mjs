#!/usr/bin/env node
// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.4 -- Blender discovery. `tools/export-assets.mjs`, the npm script
// that drives it and every test that touches Blender locate it through this
// file, never a hardcoded machine-specific path (this story's own "Always"
// rule; CLAUDE.md's provenance rule treats Blender itself as a GPL **tool**,
// not a vendored file -- nothing about the toolchain enters the repository).
//
// Resolution order:
//   1. `env.BLENDER`, used verbatim if it names an existing, executable file
//      -- and a clear, named error if it is SET but does not resolve, never a
//      silent fallback to the next step.
//   2. A PATH lookup for `blender` (POSIX) / `blender.exe` (Windows).
//   3. A short, per-platform list of conventional install locations: Windows
//      `C:\Program Files\Blender Foundation\Blender */blender.exe` and the
//      per-user `...\Programs\Blender Foundation\Blender */blender.exe`
//      equivalent; macOS `/Applications/Blender.app/Contents/MacOS/Blender`;
//      Linux `/usr/bin/blender`, `/usr/local/bin/blender`,
//      `/snap/bin/blender`, `/var/lib/flatpak/exports/bin/org.blender.Blender`.
//
// Node built-ins only (`node:fs`, `node:path`). Every failure path throws
// `BlenderNotFoundError`, naming every candidate tried and how to set
// `BLENDER` -- this is deliberately reachable with no Blender installed at
// all (test/blender-resolve.test.ts runs unconditionally, not gated).

import { accessSync, constants as fsConstants, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export class BlenderNotFoundError extends Error {
	constructor(candidates) {
		super(
			'Blender could not be found. Set the BLENDER environment variable to your Blender ' +
			'executable\'s path (e.g. BLENDER=/path/to/blender pnpm export:assets), or install ' +
			'Blender 5.2+ at a conventional location. Candidates tried:\n' +
			candidates.map((c) => `  - ${c}`).join('\n'),
		);
		this.name = 'BlenderNotFoundError';
		this.candidates = candidates;
	}
}

/** True if `candidate` exists, is a regular file, and is executable (POSIX X_OK; a no-op check on Windows, per Node's own docs, so existence + isFile() is what actually gates there). */
function isExecutableCandidate(candidate) {
	try {
		if (!statSync(candidate).isFile()) {
			return false;
		}
		accessSync(candidate, fsConstants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/** Absolute, without normalising an already-absolute path -- so a caller-supplied absolute BLENDER value comes back byte-identical ("verbatim", this story's own I/O-matrix row), while a relative one still resolves against cwd to honour resolveBlender()'s "returns an absolute path" contract. */
function toAbsolute(p) {
	return path.isAbsolute(p) ? p : path.resolve(p);
}

function pathCandidates(env, platform = process.platform) {
	const pathVar = env.PATH ?? env.Path ?? env.path ?? '';
	const dirs = pathVar.split(path.delimiter).filter((d) => d.length > 0);
	const exeName = platform === 'win32' ? 'blender.exe' : 'blender';
	return dirs.map((dir) => path.join(dir, exeName));
}

/** Every `Blender*` subdirectory of `baseDir` that contains `blender.exe`, as full candidate paths. Silently empty if `baseDir` does not exist -- this is a best-effort probe, not a required directory. */
function expandBlenderFoundationDir(baseDir) {
	if (!existsSync(baseDir)) {
		return [];
	}
	let entries;
	try {
		entries = readdirSync(baseDir, { withFileTypes: true });
	} catch {
		return [];
	}
	return entries
		.filter((entry) => entry.isDirectory() && entry.name.startsWith('Blender'))
		.map((entry) => path.join(baseDir, entry.name, 'blender.exe'));
}

// DW-46: a per-platform base directory an injected `env`/`platform` can
// steer -- `resolveBlender()`'s own `platform` parameter (defaulting to
// `process.platform`) is what lets test/blender-resolve.test.ts exercise
// every branch (Windows localized-path, darwin, Linux) unconditionally, on
// whatever host actually runs the suite, rather than only the one branch
// matching the real `process.platform`.
function darwinBase() {
	return '/Applications';
}

function linuxCandidates() {
	return [
		'/usr/bin/blender',
		'/usr/local/bin/blender',
		'/snap/bin/blender',
		'/var/lib/flatpak/exports/bin/org.blender.Blender',
	];
}

function conventionalCandidates(env, platform = process.platform) {
	if (platform === 'win32') {
		// DW-46: `env.ProgramFiles` (and the x86 sibling `env['ProgramFiles(x86)']`)
		// are the Windows environment variables an ACTUAL installation reports
		// through -- 'C:\Program Files\Blender Foundation' is an English/
		// C:-drive assumption that a non-English Windows install (whose
		// Program Files directory is itself localized, e.g. "C:\Programme" on
		// German Windows) or one installed to a non-system drive never
		// matches. Both env vars are read FIRST; the historical hardcoded
		// literal stays as a LAST-RESORT fallback (never removed -- an
		// environment with neither variable set, unusual but not impossible,
		// still gets a candidate), and every base is de-duplicated so an
		// ordinary Windows box (where `ProgramFiles` already equals the
		// literal) does not probe the same directory twice.
		const baseDirs = [];
		if (env.ProgramFiles) {
			baseDirs.push(env.ProgramFiles);
		}
		if (env['ProgramFiles(x86)']) {
			baseDirs.push(env['ProgramFiles(x86)']);
		}
		baseDirs.push('C:\\Program Files');

		const seenBlenderFoundationDirs = new Set();
		const candidates = [];
		for (const baseDir of baseDirs) {
			const blenderFoundationDir = path.join(baseDir, 'Blender Foundation');
			if (seenBlenderFoundationDirs.has(blenderFoundationDir)) {
				continue;
			}
			seenBlenderFoundationDirs.add(blenderFoundationDir);
			candidates.push(...expandBlenderFoundationDir(blenderFoundationDir));
		}

		const localAppData = env.LOCALAPPDATA
			?? (env.USERPROFILE ? path.join(env.USERPROFILE, 'AppData', 'Local') : undefined);
		if (localAppData) {
			candidates.push(...expandBlenderFoundationDir(path.join(localAppData, 'Programs', 'Blender Foundation')));
		}
		return candidates;
	}
	if (platform === 'darwin') {
		// A literal forward-slash join, deliberately NOT path.join(): this is a
		// POSIX path regardless of which OS is actually running this code
		// (test/blender-resolve.test.ts exercises the darwin branch by
		// injecting `platform`, unconditionally, on whatever host runs the
		// suite -- path.join() would use THAT host's own separator, silently
		// producing a backslash-joined path on a win32 test runner).
		return [`${darwinBase()}/Blender.app/Contents/MacOS/Blender`];
	}
	// Linux and every other POSIX platform.
	return linuxCandidates();
}

/**
 * Resolves an absolute path to a Blender executable, or throws
 * `BlenderNotFoundError` naming every candidate tried. `env` is injectable
 * (defaults to `process.env`) so tests can drive every branch without
 * mutating the real environment. `platform` is injectable too (DW-46,
 * defaults to `process.platform`) so test/blender-resolve.test.ts can
 * exercise the Windows, darwin and Linux candidate branches unconditionally,
 * on whatever host actually runs the suite.
 */
export function resolveBlender(env = process.env, platform = process.platform) {
	const candidates = [];

	if (env.BLENDER) {
		candidates.push(env.BLENDER);
		if (isExecutableCandidate(env.BLENDER)) {
			return toAbsolute(env.BLENDER);
		}
		// Set but does not resolve to a real executable -- a clear, named error,
		// never a silent fallback to PATH or the conventional list.
		throw new BlenderNotFoundError(candidates);
	}

	const pathCands = pathCandidates(env, platform);
	candidates.push(...pathCands);
	for (const candidate of pathCands) {
		if (isExecutableCandidate(candidate)) {
			return toAbsolute(candidate);
		}
	}

	const conventional = conventionalCandidates(env, platform);
	candidates.push(...conventional);
	for (const candidate of conventional) {
		if (isExecutableCandidate(candidate)) {
			return toAbsolute(candidate);
		}
	}

	throw new BlenderNotFoundError(candidates);
}
