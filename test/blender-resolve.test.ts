// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.4's I/O & Edge-Case Matrix: Blender discovery (tools/blender.mjs).
// Every case here runs with an EXPLICIT, isolated `env` object -- never
// `process.env` -- so all three are reachable and deterministic WITHOUT
// Blender installed on the host running this suite (the story's own
// requirement: "this is the failure path; it must be reachable without
// Blender installed").

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

	it('BLENDER unset, no PATH hit, resolves via the conventional per-user install location (resolution order step 3; win32 -- the LOCALAPPDATA-based path is the only conventional candidate this suite can inject without touching real system directories)', () => {
		if (process.platform !== 'win32') {
			return;
		}
		const dir = freshTmpDir();
		const stubPath = path.join(dir, 'Programs', 'Blender Foundation', 'Blender 5.2', 'blender.exe');
		writeStubExecutable(stubPath);
		const env = { PATH: '', LOCALAPPDATA: dir };
		const resolved = resolveBlender(env);
		expect(resolved).toBe(path.resolve(stubPath));
	});
});
