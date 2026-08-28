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
	// as strict as before" (this story's task 15). Keying the authored branch
	// on the mere PRESENCE of the GPL-3.0 string anywhere in the file would let
	// a PORTED file that happens to contain it -- in a comment, in an error
	// message, or because its upstream copyright block was stripped and the
	// DragonWar header pasted on in its place -- skip the structural check
	// entirely. That last case is exactly the failure Story 1.2's review caught
	// three times, and it is the one this test exists to prevent. So: any file
	// carrying evidence of being a port takes the ported branch, whatever else
	// it contains; and the authored branch additionally requires the header at
	// the TOP of the file, where a licence header actually has to be, rather
	// than merely somewhere inside it.
	const takesAuthoredBranch = (content: string): boolean => {
		const looksPorted = content.includes(PORT_MARKER) || content.includes(UPSTREAM_PROJECT);
		const headOfFile = content.split('\n').slice(0, 5).join('\n');
		return !looksPorted && headOfFile.includes(AUTHORED_HEADER);
	};
	const physicsFiles = listFilesRecursive(PHYSICS_ROOT).filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f));

	it('finds at least one file under src/sim/physics/ (sanity check the test itself is wired up)', () => {
		expect(physicsFiles.length).toBeGreaterThan(0);
	});

	for (const file of physicsFiles) {
		const relative = path.relative(PHYSICS_ROOT, file);

		it(`${relative} carries either the upstream copyright block + port marker, or the DragonWar GPL-3.0 header`, () => {
			const content = readFileSync(file, 'utf8');

			if (takesAuthoredBranch(content)) {
				// The GPL-3.0 branch: an authored file, not a port. Accepted
				// without the ported-structure checks below.
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

	it('the ported and authored branches are disjoint -- carrying the GPL-3.0 header can never bypass the ported structural check', () => {
		// A port whose upstream copyright block was stripped and replaced with
		// the DragonWar header: the exact Story 1.2 regression. It must still
		// be routed to the ported branch, where the missing block fails it.
		const strippedPort = [
			'// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.',
			PORT_MARKER,
			'export const x = 1;',
		].join('\n');
		expect(takesAuthoredBranch(strippedPort), 'a file carrying the port marker must ALWAYS take the ported branch').toBe(false);

		// Likewise if only the upstream project name survives.
		const mentionsUpstream = [
			'// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.',
			`// adapted from ${UPSTREAM_PROJECT}`,
			'export const y = 2;',
		].join('\n');
		expect(takesAuthoredBranch(mentionsUpstream), 'a file naming the upstream project must take the ported branch').toBe(false);

		// The header has to be at the top of the file, not buried in it.
		const buriedHeader = ['// a', '// b', '// c', '// d', '// e', '// f', `// ${AUTHORED_HEADER}`].join('\n');
		expect(takesAuthoredBranch(buriedHeader), 'the authored header must sit at the TOP of the file').toBe(false);

		// A genuinely authored file still passes.
		const authored = ['// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.', 'export const z = 3;'].join('\n');
		expect(takesAuthoredBranch(authored), 'a genuinely authored file takes the GPL-3.0 branch').toBe(true);
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
	});
});
