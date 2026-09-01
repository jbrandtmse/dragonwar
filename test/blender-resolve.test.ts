// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.4's I/O & Edge-Case Matrix: Blender discovery (tools/blender.mjs).
// Every case here runs with an EXPLICIT, isolated `env` object -- never
// `process.env` -- so all are reachable WITHOUT Blender installed on the host
// running this suite (the story's own requirement: "this is the failure path;
// it must be reachable without Blender installed").
//
// ONE CAVEAT, stated because it was originally claimed away: `env` isolation
// does not make the "nothing resolvable" case host-INDEPENDENT. Resolution
// step 3 (`conventionalCandidates()`) probes absolute system locations --
// `C:\Program Files\Blender Foundation\*`, `/usr/bin/blender`,
// `/snap/bin/blender` -- that it reads from the real filesystem and not from
// `env` at all, so on a host with Blender installed at a CONVENTIONAL
// location that case resolves a path instead of throwing, and goes red. It
// passes on ubuntu-latest (no Blender) and on this project's own authoring
// host (a portable build outside every conventional location). Making step 3
// injectable is ledger DW-46; until then this file is honest about the
// dependency rather than asserting it away (re-review finding).

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BlenderNotFoundError, resolveBlender } from '../tools/blender.mjs';

const createdDirs: string[] = [];
afterEach(() => {
	for (const dir of createdDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function freshTmpDir(): string {
	const dir = mkdtempSync(path.join(tmpdir(), 'dragonwar-blender-resolve-'));
	createdDirs.push(dir);
	return dir;
}

/** Writes a stand-in Blender executable at `filePath` -- content is irrelevant
 * (`isExecutableCandidate()` only checks existence + isFile() on Windows,
 * where X_OK is a documented no-op; POSIX needs the executable bit set). */
function writeStubExecutable(filePath: string): void {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, '');
	if (process.platform !== 'win32') {
		chmodSync(filePath, 0o755);
	}
}

describe('tools/blender.mjs -- resolveBlender()', () => {
	it('BLENDER set to an existing executable is honoured verbatim, without consulting PATH or the fallback list', () => {
		// process.execPath is a real, executable file on every platform this
		// suite runs on -- a stand-in Blender binary, per this story's own task.
		const env = { BLENDER: process.execPath, PATH: '/definitely/not/a/real/path' };
		const resolved = resolveBlender(env);
		expect(resolved).toBe(process.execPath);
	});

	it('BLENDER set to a non-existent path fails with a message containing BLENDER, never a silent fallback to PATH', () => {
		const env = { BLENDER: 'C:/definitely/does/not/exist/blender.exe', PATH: `${process.env.PATH ?? ''}` };
		expect(() => resolveBlender(env)).toThrow(BlenderNotFoundError);
		try {
			resolveBlender(env);
			expect.fail('resolveBlender() should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(BlenderNotFoundError);
			const message = (err as Error).message;
			expect(message).toContain('BLENDER');
			expect((err as InstanceType<typeof BlenderNotFoundError>).candidates).toContain('C:/definitely/does/not/exist/blender.exe');
			// Never silently falls back to a PATH/conventional hit: the thrown
			// candidate list is exactly the one BLENDER value, not PATH entries.
			expect((err as InstanceType<typeof BlenderNotFoundError>).candidates).toHaveLength(1);
		}
	});

	it('nothing resolvable (BLENDER unset, empty PATH, no conventional install) fails the same way', () => {
		const env = { PATH: '' };
		expect(() => resolveBlender(env)).toThrow(BlenderNotFoundError);
		try {
			resolveBlender(env);
			expect.fail('resolveBlender() should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(BlenderNotFoundError);
			expect((err as Error).message).toContain('BLENDER');
			expect((err as Error).message.toLowerCase()).toMatch(/set|install/);
		}
	});

	it('resolveBlender() returns an absolute path even when BLENDER is set to a relative path', () => {
		// process.execPath is absolute; use it relative to cwd to exercise the
		// resolve-to-absolute branch without depending on a real relative file.
		const relative = path.relative(process.cwd(), process.execPath);
		const env = { BLENDER: relative };
		const resolved = resolveBlender(env);
		expect(path.isAbsolute(resolved)).toBe(true);
		expect(path.resolve(resolved)).toBe(path.resolve(process.execPath));
	});

	it('BLENDER unset, resolves via a PATH hit (resolution order step 2) without needing a real Blender install', () => {
		const dir = freshTmpDir();
		const exeName = process.platform === 'win32' ? 'blender.exe' : 'blender';
		const stubPath = path.join(dir, exeName);
		writeStubExecutable(stubPath);
		const env = { PATH: dir };
		const resolved = resolveBlender(env);
		expect(resolved).toBe(path.resolve(stubPath));
	});

	// `skipIf`, not a bare `return`: a body that returns early still reports as a
	// PASSING test, so on ubuntu-latest -- the only automated environment there
	// is -- this read as coverage of step 3 while asserting nothing at all
	// (review finding, this story's code-review pass). Skipping says the true
	// thing: step 3's non-Windows candidates are hardcoded absolute system paths
	// that cannot be injected through `env`, so they are covered on no platform.
	// See the ledger entry this review files against that residual gap.
	it.skipIf(process.platform !== 'win32')('BLENDER unset, no PATH hit, resolves via the conventional per-user install location (resolution order step 3; win32 -- the LOCALAPPDATA-based path is the only conventional candidate this suite can inject without touching real system directories)', () => {
		const dir = freshTmpDir();
		const stubPath = path.join(dir, 'Programs', 'Blender Foundation', 'Blender 5.2', 'blender.exe');
		writeStubExecutable(stubPath);
		const env = { PATH: '', LOCALAPPDATA: dir };
		const resolved = resolveBlender(env);
		expect(resolved).toBe(path.resolve(stubPath));
	});

	// DW-46: a non-English or non-C:-drive Windows install reports its own
	// Program Files directory through env.ProgramFiles (and the x86 sibling)
	// -- these are injected through `env`, not the real filesystem, so this
	// case is reachable on any host, with or without Blender installed at
	// the hardcoded 'C:\Program Files\Blender Foundation' literal.
	it.skipIf(process.platform !== 'win32')('DW-46: env.ProgramFiles naming a LOCALIZED (non-"Program Files") directory is honoured -- a Blender install there resolves even though the hardcoded literal does not name it', () => {
		const dir = freshTmpDir(); // stands in for e.g. "C:\Programme" on German Windows
		const stubPath = path.join(dir, 'Blender Foundation', 'Blender 5.2', 'blender.exe');
		writeStubExecutable(stubPath);
		const env = { PATH: '', ProgramFiles: dir };
		const resolved = resolveBlender(env);
		expect(resolved).toBe(path.resolve(stubPath));
	});

	it.skipIf(process.platform !== 'win32')('DW-46: env["ProgramFiles(x86)"] is honoured the same way, independently of env.ProgramFiles', () => {
		const dir = freshTmpDir();
		const stubPath = path.join(dir, 'Blender Foundation', 'Blender 5.2', 'blender.exe');
		writeStubExecutable(stubPath);
		const env = { PATH: '', 'ProgramFiles(x86)': dir };
		const resolved = resolveBlender(env);
		expect(resolved).toBe(path.resolve(stubPath));
	});

	// DW-46: the `platform` parameter (defaulting to `process.platform`) is
	// what makes the darwin and Linux branches reachable UNCONDITIONALLY --
	// on whatever host actually runs this suite, not only when that host
	// happens to BE darwin or Linux. Neither branch's candidates exist on
	// this (or any CI) host, so resolution still throws; the assertion is on
	// the THROWN candidate list, proving the right branch executed and built
	// the right literal paths, not merely that "something threw".
	it('DW-46: the darwin branch is reachable via the injectable platform parameter, on any host', () => {
		const env = { PATH: '' };
		expect(() => resolveBlender(env, 'darwin')).toThrow(BlenderNotFoundError);
		try {
			resolveBlender(env, 'darwin');
			expect.fail('resolveBlender() should have thrown');
		} catch (err) {
			const candidates = (err as InstanceType<typeof BlenderNotFoundError>).candidates;
			// tools/blender.mjs's darwin/Linux branches author these as literal
			// POSIX (forward-slash) strings, joined via `path.join()` only for
			// the FILENAME components -- asserted against the same literal
			// forward-slash form here rather than `path.join()`'d locally,
			// which would silently normalise to backslashes on a win32 test
			// host and never match.
			expect(candidates).toContain('/Applications/Blender.app/Contents/MacOS/Blender');
		}
	});

	it('DW-46: the Linux (and every other POSIX) branch is reachable via the injectable platform parameter, on any host', () => {
		const env = { PATH: '' };
		expect(() => resolveBlender(env, 'linux')).toThrow(BlenderNotFoundError);
		try {
			resolveBlender(env, 'linux');
			expect.fail('resolveBlender() should have thrown');
		} catch (err) {
			const candidates = (err as InstanceType<typeof BlenderNotFoundError>).candidates;
			expect(candidates).toContain('/usr/bin/blender');
			expect(candidates).toContain('/usr/local/bin/blender');
			expect(candidates).toContain('/snap/bin/blender');
			expect(candidates).toContain('/var/lib/flatpak/exports/bin/org.blender.Blender');
		}
	});

	it('DW-46: pathCandidates() (PATH lookup, resolution step 2) also honours the injectable platform parameter -- a "blender" (no .exe) PATH hit resolves under a non-win32 platform even on a win32 host', () => {
		const dir = freshTmpDir();
		const stubPath = path.join(dir, 'blender'); // no .exe -- the POSIX exe name
		writeStubExecutable(stubPath);
		const env = { PATH: dir };
		// On this test's OWN real host (win32), pathCandidates() would look
		// for "blender.exe" and miss this stub entirely -- forcing platform
		// 'linux' is what makes it look for the bare "blender" name instead.
		const resolved = resolveBlender(env, 'linux');
		expect(resolved).toBe(path.resolve(stubPath));
	});
});
