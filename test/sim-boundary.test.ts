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
	const physicsFiles = listFilesRecursive(PHYSICS_ROOT).filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f));

	it('finds at least one file under src/sim/physics/ (sanity check the test itself is wired up)', () => {
		expect(physicsFiles.length).toBeGreaterThan(0);
	});

	for (const file of physicsFiles) {
		const relative = path.relative(PHYSICS_ROOT, file);

		it(`${relative} carries an upstream copyright block immediately followed by the port-marker line`, () => {
			const lines = readFileSync(file, 'utf8').split('\n');

			const blockEndIdx = lines.findIndex((line) => line.trim() === '*/');
			expect(blockEndIdx, `${relative}: no closing "*/" of an upstream copyright block found`).toBeGreaterThanOrEqual(0);

			// The copyright block itself must be present above the closing "*/" —
			// spot-check the two lines the story's AC and ATTRIBUTIONS.md name
			// explicitly (VPDB project name + freezy's copyright line).
			const blockText = lines.slice(0, blockEndIdx + 1).join('\n');
			expect(blockText, `${relative}: missing "VPDB - Virtual Pinball Database"`).toContain('VPDB - Virtual Pinball Database');
			expect(blockText, `${relative}: missing freezy's copyright line`).toContain('Copyright (C) 2019 freezy <freezy@vpdb.io>');

			const nextLine = lines[blockEndIdx + 1];
			expect(nextLine, `${relative}: line after the copyright block must be the exact port-marker line`).toBe(PORT_MARKER);
		});
	}
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
