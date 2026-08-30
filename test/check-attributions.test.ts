// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Real invocation of tools/check-attributions.mjs, in the shape of
// test/measure-cli.test.ts. The success path is a real `spawnSync` of the
// CLI against the repository as committed. The failure path uses the tool's
// own exported `checkAttributions()` against a temporary `package.json` this
// test writes and removes, so the fixture cannot itself trip the check it
// exists to violate.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkAttributions } from '../tools/check-attributions.mjs';

const REPO_ROOT = path.resolve(__dirname, '..');
const CHECK_ATTRIBUTIONS_SCRIPT = path.join(REPO_ROOT, 'tools', 'check-attributions.mjs');
const ATTRIBUTIONS_PATH = path.join(REPO_ROOT, 'ATTRIBUTIONS.md');
const RUN_TIMEOUT_MS = 30_000;

describe('tools/check-attributions.mjs -- the repository as committed', () => {
	it('exits 0 (real subprocess, real package.json/ATTRIBUTIONS.md)', () => {
		const result = spawnSync(process.execPath, [CHECK_ATTRIBUTIONS_SCRIPT], {
			cwd: REPO_ROOT,
			encoding: 'utf8',
			timeout: RUN_TIMEOUT_MS,
		});
		expect(result.stderr ?? '').toBe('');
		expect(result.status).toBe(0);
		expect(result.stdout ?? '').toMatch(/\[check-attributions\] OK/);
	});

	it('names every devDependency this story added', () => {
		const missing = checkAttributions();
		expect(missing).not.toContain('dependency-cruiser');
		expect(missing).not.toContain('@swc/core');
	});
});

describe('tools/check-attributions.mjs -- checkAttributions() against a fixture package.json', () => {
	let tmpDir: string;

	afterEach(() => {
		if (tmpDir) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it('names a package.json dependency with no ATTRIBUTIONS.md row', () => {
		tmpDir = mkdtempSync(path.join(tmpdir(), 'dragonwar-check-attributions-'));
		const pkgPath = path.join(tmpDir, 'package.json');
		writeFileSync(
			pkgPath,
			JSON.stringify({ dependencies: { 'totally-unattributed-package': '1.0.0' } }),
			'utf8',
		);
		const missing = checkAttributions(pkgPath, ATTRIBUTIONS_PATH);
		expect(missing).toEqual(['totally-unattributed-package']);
	});

	it('does not flag a devDependency that has a row', () => {
		tmpDir = mkdtempSync(path.join(tmpdir(), 'dragonwar-check-attributions-'));
		const pkgPath = path.join(tmpDir, 'package.json');
		writeFileSync(pkgPath, JSON.stringify({ devDependencies: { vite: '8.2.2' } }), 'utf8');
		const missing = checkAttributions(pkgPath, ATTRIBUTIONS_PATH);
		expect(missing).toEqual([]);
	});

	it('is not an error for a row to exist for a package no longer in package.json', () => {
		tmpDir = mkdtempSync(path.join(tmpdir(), 'dragonwar-check-attributions-'));
		const pkgPath = path.join(tmpDir, 'package.json');
		writeFileSync(pkgPath, JSON.stringify({}), 'utf8');
		const missing = checkAttributions(pkgPath, ATTRIBUTIONS_PATH);
		expect(missing).toEqual([]);
	});

	// Review finding, this story's own review pass: a plain substring match
	// (String.prototype.includes) would report "vite" as covered purely
	// because "vite" occurs inside "vitest" -- a real package with no row of
	// its own would silently pass. Word-boundary-aware matching must not fall
	// for that.
	it('does not let one package name hide a sibling with no row of its own (substring false-negative)', () => {
		tmpDir = mkdtempSync(path.join(tmpdir(), 'dragonwar-check-attributions-'));
		const pkgPath = path.join(tmpDir, 'package.json');
		const attrPath = path.join(tmpDir, 'ATTRIBUTIONS.md');
		writeFileSync(pkgPath, JSON.stringify({ devDependencies: { vite: '8.2.2', vitest: '4.1.11' } }), 'utf8');
		writeFileSync(attrPath, '| `vitest` @ `4.1.11` | https://github.com/vitest-dev/vitest | ... |\n', 'utf8');
		const missing = checkAttributions(pkgPath, attrPath);
		expect(missing).toEqual(['vite']);
	});

	it('still matches a scoped package name containing regex metacharacters', () => {
		tmpDir = mkdtempSync(path.join(tmpdir(), 'dragonwar-check-attributions-'));
		const pkgPath = path.join(tmpDir, 'package.json');
		const attrPath = path.join(tmpDir, 'ATTRIBUTIONS.md');
		writeFileSync(pkgPath, JSON.stringify({ dependencies: { '@babylonjs/core': '9.22.2' } }), 'utf8');
		writeFileSync(attrPath, '| `@babylonjs/core` @ `9.22.2` | https://github.com/BabylonJS/Babylon.js | ... |\n', 'utf8');
		const missing = checkAttributions(pkgPath, attrPath);
		expect(missing).toEqual([]);
	});
});
