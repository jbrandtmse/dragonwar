// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.1's textual boundary stand-in (banned-global/`@babylonjs` scan over
// src/sim/**, and the hand-maintained GPL-header `roots` list that review had
// to widen twice) is superseded by Story 1.3's real tooling, each with its
// own test suite:
//   - tools/boundary-lint.mjs (test/boundary-lint.test.ts) -- the import
//     rules (dependency-cruiser + @swc/core), the banned-global textual scan,
//     the tick/ms rule and the device-name-literal rule, all over src/**,
//     discovered from real file listings rather than this file's old
//     hand-maintained `roots` array.
//   - tools/check-licence-headers.mjs (test/licence-headers.test.ts) -- the
//     per-file GPL-3.0-header check, discovered from `git ls-files`.
//
// What remains here is NOT superseded by either tool: the vpx-js
// port-header describe below asserts the exact upstream VPDB copyright block
// text is intact (stronger than "carries some header or other"), and the
// AD-15 solver-constants pin asserts values nothing else in this suite reads
// by name -- both stay owned by this file.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	BALL_BALL_RESTITUTION,
	C_CONTACTVEL,
	C_DISP_GAIN,
	C_DISP_LIMIT,
	C_INTERATIONS,
	C_LOWNORMVEL,
	C_PRECISION,
	PHYS_FACTOR,
	PHYS_SKIN,
	PHYS_TOUCH,
	PHYSICS_STEPTIME,
	STATICTIME,
	VELOCITY_EPSILON,
} from '../src/sim/physics/constants';
import { listFilesRecursive } from './util/list-files';

const SIM_ROOT = path.resolve(__dirname, '..', 'src', 'sim');
const PHYSICS_ROOT = path.resolve(SIM_ROOT, 'physics');

describe('src/sim/physics/** header provenance (AD-16)', () => {
	const PORT_MARKER = '// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0';
	const UPSTREAM_PROJECT = 'VPDB - Virtual Pinball Database';
	// AD-16's own wording (spine line 204): "Files ported from vpx-js live
	// under src/sim/physics/ with their original copyright headers preserved
	// plus [the port marker] ... new files carry the GPL-3.0 header." Story
	// 1.4's task 15 widens this test to that literal EITHER/OR: a file here
	// carries the ported structure asserted below, OR the plain DragonWar
	// GPL-3.0 header (src/sim/physics/loader/index.ts, Story 1.4's new,
	// authored collision loader, is the first file that exercises the second
	// branch). The ported branch's own structural assertion is untouched --
	// this is an added acceptance path, not a relaxation of the existing one.
	const AUTHORED_HEADER = 'DragonWar is licensed GPL-3.0';

	// The two branches must be DISJOINT, or the ported branch is not "exactly
	// as strict as before" (this story's task 15).
	//
	// The authored branch is earned BY DECLARATION, never by the file's own
	// text. A content-based rule -- "does this file carry the GPL-3.0 header
	// and no evidence of being a port?" -- cannot distinguish a genuinely
	// authored file from a port whose upstream copyright block AND port-marker
	// line were BOTH stripped and the DragonWar header pasted on in their
	// place: that file has no port evidence left to detect, so every
	// content-based rule accepts it and the ported structural check below is
	// bypassed in exactly the case it exists to catch (the Story 1.2
	// regression, caught three times by that story's review; re-found by this
	// story's re-review as the residual of the first fix, which keyed the
	// branch on `!content.includes(PORT_MARKER) && ...` and so still let a
	// fully-stripped port through with ZERO assertions executed).
	//
	// A declared allowlist has no such blind spot. Every file under
	// src/sim/physics/** that is not named here MUST satisfy the ported
	// structure, so stripping a port's provenance turns that file RED rather
	// than green, and adding a genuinely authored file is a deliberate,
	// reviewable one-line edit in this list. Membership is necessary but not
	// sufficient -- a declared file must still positively carry the GPL-3.0
	// header at the TOP and must NOT carry either port signal (asserted, not
	// returned past, so the authored branch can never report as a pass while
	// checking nothing).
	const AUTHORED_FILES = new Set([
		'loader/index.ts',
		'switches.ts',
		'devices.ts',
		'machine.ts',
		'flipper/flipper-config.ts',
		'flippers.ts',
		'plunger.ts',
		'cabinet/slam.ts',
		'cabinet/index.ts',
	]);

	const toPosix = (relative: string): string => relative.split(path.sep).join('/');
	const isDeclaredAuthored = (relative: string): boolean => AUTHORED_FILES.has(toPosix(relative));
	const physicsFiles = listFilesRecursive(PHYSICS_ROOT).filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f));

	// Story 1.7: the third provenance branch, for the seven-file
	// vpinball/vpinball port authorized 2026-08-29 (ATTRIBUTIONS.md's
	// `src/sim/physics/cabinet/**` row). Branch selection is BY DECLARATION
	// (`VPINBALL_PORTED_FILES`, mirroring `AUTHORED_FILES` above), never by
	// content -- an undeclared file falls through to the vpx-js branch by
	// default, which a vpinball-derived file cannot pass (this story's Design
	// Notes, "The third provenance branch"). This branch is exactly as
	// strict as the other two: it asserts every element positively AND
	// asserts the other two classes' markers absent, so the three classes
	// stay mutually exclusive.
	const VPINBALL_PORT_MARKER = '// Ported from vpinball/vpinball (GPL-3.0-or-later); distributed with DragonWar under GPL-3.0';
	const VPINBALL_HOLDER = 'Visual Pinball development team and contributors';
	const VPINBALL_PIN = '3f838c14bd2e37fb49a0b5aa6a9d76d421846bef';
	const VPINBALL_GRANT_PHRASE = 'either version 3 of the License, or (at your option) any later version';
	const VPINBALL_PORTED_FILES = new Set(['cabinet/oscillator.ts', 'cabinet/nudge-impulse.ts', 'cabinet/plumb-bob.ts']);
	const isDeclaredVpinballPort = (relative: string): boolean => VPINBALL_PORTED_FILES.has(toPosix(relative));

	it('finds at least one file under src/sim/physics/ (sanity check the test itself is wired up)', () => {
		expect(physicsFiles.length).toBeGreaterThan(0);
	});

	for (const file of physicsFiles) {
		const relative = path.relative(PHYSICS_ROOT, file);

		it(`${relative} carries either the upstream copyright block + port marker, or the DragonWar GPL-3.0 header`, () => {
			const content = readFileSync(file, 'utf8');

			if (isDeclaredAuthored(relative)) {
				// The GPL-3.0 branch: a DECLARED authored file, not a port.
				// Asserts positively rather than returning early -- a branch
				// that returns without an `expect` reports as a passing test
				// while checking nothing (the same pattern this story replaced
				// with `it.skipIf` in test/blender-resolve.test.ts).
				const headOfFile = content.split('\n').slice(0, 5).join('\n');
				expect(headOfFile, `${relative}: declared authored, so it must carry "${AUTHORED_HEADER}" in its first 5 lines`).toContain(AUTHORED_HEADER);
				expect(content, `${relative}: declared authored, so it must NOT carry the vpx-js port marker`).not.toContain(PORT_MARKER);
				expect(content, `${relative}: declared authored, so it must NOT carry the upstream VPDB copyright block`).not.toContain(UPSTREAM_PROJECT);
				return;
			}

			if (isDeclaredVpinballPort(relative)) {
				// Story 1.7's third branch: a DECLARED vpinball/vpinball port.
				// Asserts every element positively (never returns past an
				// unchecked branch, same discipline as the authored branch
				// above) AND asserts the other two classes' markers absent, so
				// the three classes stay mutually exclusive.
				const lines = content.split('\n');
				const blockEndIdx = lines.findIndex((line) => line.trim() === '*/');
				expect(blockEndIdx, `${relative}: no closing "*/" of an upstream copyright block found`).toBeGreaterThanOrEqual(0);

				const blockText = lines.slice(0, blockEndIdx + 1).join('\n');
				expect(blockText, `${relative}: missing "${VPINBALL_HOLDER}"`).toContain(VPINBALL_HOLDER);
				expect(blockText, `${relative}: missing the GPL-3-or-later grant phrase`).toContain(VPINBALL_GRANT_PHRASE);

				const nextLine = lines[blockEndIdx + 1];
				expect(nextLine, `${relative}: line after the copyright block must be the exact vpinball port-marker line`).toBe(VPINBALL_PORT_MARKER);

				expect(content, `${relative}: missing "${VPINBALL_PIN}"`).toContain(VPINBALL_PIN);
				expect(content, `${relative}: missing an upstream "// Source: src/physics/cabinet/..." path`).toMatch(/\/\/ Source: src\/physics\/cabinet\//);

				expect(content, `${relative}: a vpinball port must NOT carry the vpx-js port marker`).not.toContain(PORT_MARKER);
				expect(content, `${relative}: a vpinball port must NOT carry the upstream VPDB project name`).not.toContain(UPSTREAM_PROJECT);
				expect(content, `${relative}: a vpinball port must NOT carry the DragonWar GPL-3.0 header`).not.toContain(AUTHORED_HEADER);
				return;
			}

			// The ported branch: EXACTLY as strict as before this story -- no
			// weakening, only a second, disjoint way to pass.
			const lines = content.split('\n');
			const blockEndIdx = lines.findIndex((line) => line.trim() === '*/');
			expect(blockEndIdx, `${relative}: no closing "*/" of an upstream copyright block found`).toBeGreaterThanOrEqual(0);

			// The copyright block itself must be present above the closing "*/" —
			// spot-check the two lines the story's AC and ATTRIBUTIONS.md name
			// explicitly (VPDB project name + freezy's copyright line).
			const blockText = lines.slice(0, blockEndIdx + 1).join('\n');
			expect(blockText, `${relative}: missing "${UPSTREAM_PROJECT}"`).toContain(UPSTREAM_PROJECT);
			expect(blockText, `${relative}: missing freezy's copyright line`).toContain('Copyright (C) 2019 freezy <freezy@vpdb.io>');

			const nextLine = lines[blockEndIdx + 1];
			expect(nextLine, `${relative}: line after the copyright block must be the exact port-marker line`).toBe(PORT_MARKER);
		});
	}

	it('the ported and authored branches are disjoint -- an UNDECLARED file can never reach the authored branch, however its header reads', () => {
		// THE case a content-based rule cannot catch, and the reason the branch
		// is keyed on a declared list: a port whose upstream copyright block
		// AND port-marker line were both stripped and the DragonWar header
		// pasted on in their place. Nothing in such a file's text says "port"
		// any more, so no textual test can route it correctly -- but it is not
		// on the list, so it takes the ported branch and fails there.
		const fullyStrippedPort = [
			'// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.',
			'export class HitCircle { }',
		].join('\n');
		expect(
			isDeclaredAuthored(path.join('hit-circle.ts')),
			'a file that is not on AUTHORED_FILES must take the ported branch even when its text carries no port evidence at all',
		).toBe(false);
		// ...and the ported branch genuinely rejects it (no closing "*/").
		expect(fullyStrippedPort.split('\n').findIndex((line) => line.trim() === '*/')).toBe(-1);

		// A declared authored file takes the authored branch.
		expect(isDeclaredAuthored(path.join('loader', 'index.ts')), 'the declared authored file takes the GPL-3.0 branch').toBe(true);

		// The list is deliberately tiny, and every entry must be a real file --
		// a stale entry would silently exempt a path that no longer exists, and
		// a typo would silently exempt nothing while looking like it did.
		for (const declared of AUTHORED_FILES) {
			const absolute = path.resolve(PHYSICS_ROOT, declared);
			expect(
				physicsFiles.map((f) => toPosix(path.relative(PHYSICS_ROOT, f))),
				`AUTHORED_FILES entry "${declared}" does not name a real file under src/sim/physics/`,
			).toContain(toPosix(path.relative(PHYSICS_ROOT, absolute)));
		}
	});

	it('Story 1.7: VPINBALL_PORTED_FILES names only real files, and the three provenance sets (authored, vpinball-ported, vpx-js-default) are mutually disjoint', () => {
		for (const declared of VPINBALL_PORTED_FILES) {
			const absolute = path.resolve(PHYSICS_ROOT, declared);
			expect(
				physicsFiles.map((f) => toPosix(path.relative(PHYSICS_ROOT, f))),
				`VPINBALL_PORTED_FILES entry "${declared}" does not name a real file under src/sim/physics/`,
			).toContain(toPosix(path.relative(PHYSICS_ROOT, absolute)));
		}

		// No path is declared in both sets -- a file that took the vpinball
		// branch could not also silently qualify for the authored branch (or
		// vice versa), which would make "exactly as strict as before" false.
		for (const declared of VPINBALL_PORTED_FILES) {
			expect(AUTHORED_FILES.has(declared), `"${declared}" is declared in BOTH AUTHORED_FILES and VPINBALL_PORTED_FILES -- the three provenance classes must stay mutually exclusive`).toBe(false);
		}

		// A declared vpinball port takes the vpinball branch, never the
		// authored one -- isDeclaredAuthored() must not also fire for it.
		for (const declared of VPINBALL_PORTED_FILES) {
			expect(isDeclaredVpinballPort(declared), `"${declared}" must take the vpinball branch`).toBe(true);
			expect(isDeclaredAuthored(declared), `"${declared}" must NOT also take the authored branch`).toBe(false);
		}
	});

	it('an authored file (GPL-3.0 header, no upstream block, no port marker) is accepted only via the GPL-3.0 branch -- src/sim/physics/loader/index.ts', () => {
		const loaderPath = path.resolve(PHYSICS_ROOT, 'loader', 'index.ts');
		const content = readFileSync(loaderPath, 'utf8');
		expect(content, 'src/sim/physics/loader/index.ts must carry the DragonWar GPL-3.0 header (it is authored, not ported)').toContain(AUTHORED_HEADER);
		expect(content, 'src/sim/physics/loader/index.ts must NOT carry the ported port-marker line -- it never claims to be a vpx-js port').not.toContain(PORT_MARKER);
		expect(content, 'src/sim/physics/loader/index.ts must NOT carry the upstream VPDB copyright block either').not.toContain('VPDB - Virtual Pinball Database');
	});
});

describe('src/sim/physics/constants.ts — AD-15 verbatim solver constants pin', () => {
	// AD-15: these values are transcribed from the pinned upstream source
	// (vpdb/vpx-js @ e8a6d6f) and are never tunable — changing one is a
	// physics-version bump that re-records every golden replay downstream
	// (see this story's spec, "Verified upstream facts"). Nothing else in this
	// suite reads these constants by name, so without this pin a silent edit to
	// any of them would pass `pnpm test` undetected — confirmed empirically
	// during this story's review: mutating BALL_BALL_RESTITUTION and PHYS_SKIN
	// left every other test green.
	it('matches the values verified against the pinned upstream source', () => {
		expect(PHYSICS_STEPTIME, 'PHYSICS_STEPTIME').toBe(1000);
		expect(PHYS_FACTOR, 'PHYS_FACTOR (derived)').toBeCloseTo(0.1, 10);
		expect(PHYS_SKIN, 'PHYS_SKIN').toBe(25.0);
		expect(PHYS_TOUCH, 'PHYS_TOUCH').toBe(0.05);
		expect(C_PRECISION, 'C_PRECISION').toBe(0.01);
		expect(C_LOWNORMVEL, 'C_LOWNORMVEL').toBe(0.0001);
		expect(C_CONTACTVEL, 'C_CONTACTVEL').toBe(0.099);
		expect(C_DISP_GAIN, 'C_DISP_GAIN').toBe(0.9875);
		expect(C_DISP_LIMIT, 'C_DISP_LIMIT').toBe(5.0);
		expect(STATICTIME, 'STATICTIME').toBe(0.005);
		expect(VELOCITY_EPSILON, 'VELOCITY_EPSILON').toBe(0.05);
		expect(BALL_BALL_RESTITUTION, 'BALL_BALL_RESTITUTION (lib/vpt/ball/ball-hit.ts:303)').toBe(0.8);
		// Story 1.6: the flipper port (flipper-hit.ts's MFP root search) relies
		// on this one -- added to the pin per this story's own task list.
		expect(C_INTERATIONS, 'C_INTERATIONS (lib/physics/constants.ts, Flippers)').toBe(20);
	});
});
