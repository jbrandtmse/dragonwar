// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Real invocation of tools/check-licence-headers.mjs, in the shape of
// test/measure-cli.test.ts. The success path is a real `spawnSync` of the
// CLI against the repository as committed (real `git ls-files`, no mock).
// The failure path uses the tool's own exported `checkLicenceHeaders()`
// against one deliberately-violating fixture file this test creates and
// removes at runtime (so a permanent no-header fixture does not itself need
// an exemption from the very check it exists to violate) -- still the real
// shipped function, not a reimplementation.

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkLicenceHeaders } from '../tools/check-licence-headers.mjs';

const REPO_ROOT = path.resolve(__dirname, '..');
const CHECK_HEADERS_SCRIPT = path.join(REPO_ROOT, 'tools', 'check-licence-headers.mjs');
const RUN_TIMEOUT_MS = 30_000;

describe('tools/check-licence-headers.mjs -- the repository as committed', () => {
	it('exits 0 (real subprocess, real git ls-files)', () => {
		const result = spawnSync(process.execPath, [CHECK_HEADERS_SCRIPT], {
			cwd: REPO_ROOT,
			encoding: 'utf8',
			timeout: RUN_TIMEOUT_MS,
		});
		expect(result.stderr ?? '').toBe('');
		expect(result.status).toBe(0);
		expect(result.stdout ?? '').toMatch(/\[check-headers\] OK/);
	});
});

describe('tools/check-licence-headers.mjs -- checkLicenceHeaders() on a deliberately-violating fixture', () => {
	const relativeNoHeader = path.posix.join('test', 'fixtures', '__tmp-licence-headers-no-header.ts');
	const relativeWithHeader = path.posix.join('test', 'fixtures', '__tmp-licence-headers-with-header.ts');
	const relativeWithPortMarker = path.posix.join('test', 'fixtures', '__tmp-licence-headers-port-marker.ts');
	const relativeWithVpinballPortMarker = path.posix.join('test', 'fixtures', '__tmp-licence-headers-vpinball-port-marker.ts');
	const relativeExempt = path.posix.join('public', 'LICENSE.txt');

	beforeAll(() => {
		mkdirSync(path.join(REPO_ROOT, 'test', 'fixtures'), { recursive: true });
		writeFileSync(path.join(REPO_ROOT, relativeNoHeader), 'export const noHeader = 1;\n', 'utf8');
		writeFileSync(
			path.join(REPO_ROOT, relativeWithHeader),
			'// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.\nexport const withHeader = 1;\n',
			'utf8',
		);
		writeFileSync(
			path.join(REPO_ROOT, relativeWithPortMarker),
			'// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0\nexport const ported = 1;\n',
			'utf8',
		);
		writeFileSync(
			path.join(REPO_ROOT, relativeWithVpinballPortMarker),
			'// Ported from vpinball/vpinball (GPL-3.0-or-later); distributed with DragonWar under GPL-3.0\nexport const ported = 1;\n',
			'utf8',
		);
	});

	afterAll(() => {
		for (const relative of [relativeNoHeader, relativeWithHeader, relativeWithPortMarker, relativeWithVpinballPortMarker]) {
			rmSync(path.join(REPO_ROOT, relative), { force: true });
		}
	});

	it('names the file with neither the GPL-3.0 header nor the port marker', () => {
		const offenders = checkLicenceHeaders([relativeNoHeader]);
		expect(offenders).toEqual([relativeNoHeader]);
	});

	it('does not flag a file carrying the DragonWar GPL-3.0 header', () => {
		const offenders = checkLicenceHeaders([relativeWithHeader]);
		expect(offenders).toEqual([]);
	});

	it('does not flag a file carrying the vpx-js port marker instead', () => {
		const offenders = checkLicenceHeaders([relativeWithPortMarker]);
		expect(offenders).toEqual([]);
	});

	it('does not flag a file carrying the vpinball/vpinball port marker instead (Story 1.7)', () => {
		const offenders = checkLicenceHeaders([relativeWithVpinballPortMarker]);
		expect(offenders).toEqual([]);
	});

	it('does not flag the exempt licence-text files', () => {
		const offenders = checkLicenceHeaders([relativeExempt]);
		expect(offenders).toEqual([]);
	});

	it('does not flag files outside the authored extensions', () => {
		const offenders = checkLicenceHeaders(['ATTRIBUTIONS.md']);
		expect(offenders).toEqual([]);
	});

	it('does not flag files under the excluded BMad tooling trees', () => {
		const offenders = checkLicenceHeaders([
			'_bmad/scripts/resolve_config.py',
			'.claude/skills/bmad-advanced-elicitation/scripts/pick_methods.py',
		]);
		expect(offenders).toEqual([]);
	});
});
