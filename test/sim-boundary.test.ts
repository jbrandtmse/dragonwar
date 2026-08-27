// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.1 stand-in for Story 1.3's dependency-cruiser (AD-16), plus an AD-15
// verbatim-constants pin (below). Plain textual checks only — no TypeScript
// compiler API, matching AD-16's constraint that no lint may depend on one
// (TypeScript 7.0 ships none).

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

const BANNED_GLOBALS = [
	'window',
	'document',
	'performance',
	'Math.random',
	'Date',
	'setTimeout',
	'setInterval',
	'requestAnimationFrame',
	'localStorage',
	'navigator',
	'globalThis',
];

/**
 * Strips `//` line comments (naive: does not understand string literals that
 * contain `//`, which none of the ported or authored sim/ files do — verified by
 * inspection). Good enough for this story's stand-in; Story 1.3's
 * dependency-cruiser replaces it with a real parse.
 */
function stripLineComments(source: string): string {
	return source
		.split('\n')
		.map((line) => {
			const idx = line.indexOf('//');
			return idx === -1 ? line : line.slice(0, idx);
		})
		.join('\n');
}

function bannedTokenPattern(token: string): RegExp {
	// `Math.random` contains a literal dot; escape it. Every other token is a bare
	// identifier, safe to wrap in word boundaries.
	const escaped = token.replace(/[.]/g, '\\.');
	return new RegExp(`\\b${escaped}\\b`);
}

describe('sim/ boundary (AD-16 stand-in)', () => {
	// Not just `.ts`: a `.js`/`.mjs`/`.cjs`/`.tsx` file dropped under src/sim/ would
	// otherwise bypass the boundary check entirely.
	const simFiles = listFilesRecursive(SIM_ROOT).filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f));

	it('finds at least one file under src/sim/ (sanity check the test itself is wired up)', () => {
		expect(simFiles.length).toBeGreaterThan(0);
	});

	for (const file of simFiles) {
		const relative = path.relative(SIM_ROOT, file);

		it(`${relative} references no banned global`, () => {
			const code = stripLineComments(readFileSync(file, 'utf8'));
			for (const token of BANNED_GLOBALS) {
				const pattern = bannedTokenPattern(token);
				const match = pattern.exec(code);
				if (match) {
					const lineNo = code.slice(0, match.index).split('\n').length;
					expect.fail(
						`${relative}:${lineNo} references banned token "${token}" ` +
						`(AD-16 forbids window/document/performance/Math.random/Date/` +
						`setTimeout/setInterval/requestAnimationFrame/localStorage/` +
						`navigator/globalThis inside sim/)`,
					);
				}
			}
		});

		it(`${relative} does not import @babylonjs/*`, () => {
			const code = readFileSync(file, 'utf8');
			const match = /@babylonjs\//.exec(code);
			if (match) {
				const lineNo = code.slice(0, match.index).split('\n').length;
				expect.fail(`${relative}:${lineNo} imports @babylonjs/* — banned under sim/ (AD-1, AD-16)`);
			}
		});
	}
});

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

describe('DragonWar-authored source files carry the GPL-3.0 header (AD-16)', () => {
	// This story's "Always" bullet requires every NEWLY AUTHORED source file to carry
	// the GPL-3.0 header. Two files shipped without it and both were caught by hand
	// (vitest.config.ts in the implement stage, tools/spike-1/index.html in review) --
	// nothing automated looked. The header check above covers only src/sim/physics/**,
	// and it checks the UPSTREAM notice, which is the opposite requirement.
	const AUTHORED_HEADER = 'DragonWar is licensed GPL-3.0';
	const PORT_MARKER_TEXT = 'Ported from vpdb/vpx-js';
	const REPO_ROOT = path.resolve(__dirname, '..');

	const roots = [
		path.resolve(REPO_ROOT, 'src', 'sim', 'contracts'),
		path.resolve(REPO_ROOT, 'tools'),
		path.resolve(REPO_ROOT, 'test'),
	];
	const authored = roots
		.flatMap((root) => listFilesRecursive(root))
		.filter((f) => /\.(ts|tsx|mjs|cjs|js)$/.test(f))
		.concat([path.resolve(REPO_ROOT, 'vitest.config.ts')]);

	it('finds the authored source files (sanity check the test itself is wired up)', () => {
		expect(authored.length).toBeGreaterThan(5);
	});

	for (const file of authored) {
		const relative = path.relative(REPO_ROOT, file).split(path.sep).join('/');
		it(`${relative} carries the DragonWar GPL-3.0 header`, () => {
			const code = readFileSync(file, 'utf8');
			// A ported file carries the upstream notice instead -- that is AD-16's other
			// half, asserted by the describe block above, and must not be overwritten here.
			if (code.includes(PORT_MARKER_TEXT)) {
				return;
			}
			expect(code, `${relative}: missing the "${AUTHORED_HEADER}" header line`).toContain(AUTHORED_HEADER);
		});
	}
});
