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

import { createHash } from 'node:crypto';
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
		'hop.ts',
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
		//
		// Code review 2026-08-29: this loop previously also asserted
		// `isDeclaredVpinballPort(declared)).toBe(true)`, which is
		// `VPINBALL_PORTED_FILES.has(x)` for x drawn from VPINBALL_PORTED_FILES
		// -- self-referential, and true for any possible content. It is
		// replaced with the claim that actually matters and can actually fail:
		// each declared port's real file carries the vpinball marker, so the
		// declaration and the file's own content agree.
		for (const declared of VPINBALL_PORTED_FILES) {
			expect(isDeclaredAuthored(declared), `"${declared}" must NOT also take the authored branch`).toBe(false);
			const content = readFileSync(path.resolve(PHYSICS_ROOT, declared), 'utf8');
			expect(content, `"${declared}" is declared a vpinball port but its own header does not carry the vpinball port marker`).toContain(VPINBALL_PORT_MARKER);
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

// Story 1.8's sweep (DW-79, ledger; Code Map "Verified environment facts" --
// "test/sim-boundary.test.ts checks headers only, never bodies ... No
// vendored upstream copy and no checksum exists anywhere in the repo").
//
// RESIDUAL, STATED HONESTLY (per this file's own header discipline and the
// spec's Design Notes): this does NOT prove byte-identity to the real
// upstream vpx-js / vpinball sources -- no vendored upstream copy is
// available in this repository to hash against (out of footprint), and
// re-verifying against upstream byte-for-byte was done BY HAND during each
// port's own story (Story 1.1's spike, Story 1.6's flipper/plunger port,
// Story 1.7's vpinball cabinet port). What this DOES do is pin every
// declared ported file's body against THIS pass's own verified state, so
// any LATER edit to a port -- accidental or deliberate -- fails loudly here
// rather than silently drifting from what was actually reviewed, and
// requires a conscious two-step response: re-verify the new content against
// the upstream pin named in the file's own header, then deliberately update
// PORT_BODY_HASHES below (never routine, never silent).
//
// Hashed over NORMALISED line endings (the same CRLF hazard this story's
// goldens have: `core.autocrlf=true`, measured to flip a committed file's
// line endings between the worktree and the HEAD blob) -- a Windows
// checkout must hash identically to a Linux CI checkout of the exact same
// content.
describe('src/sim/physics/** port-body freeze (DW-79): every declared ported file\'s content is pinned, normalised line endings', () => {
	function normalizeLineEndings(text: string): string {
		return text.replace(/\r\n/g, '\n');
	}

	function sha256Hex(text: string): string {
		return createHash('sha256').update(text, 'utf8').digest('hex');
	}

	// AUTHORED_FILES (declared above, in the header-provenance describe
	// block) is the ONE list this manifest excludes -- every OTHER physics
	// file is a declared port, whichever branch (the default vpx-js branch,
	// or the declared VPINBALL_PORTED_FILES branch): both are "ported", and
	// DW-79's gap applies equally to both. Recomputed with
	// tools/scripts/nothing -- this manifest was generated once, by hand,
	// from a clean pass of this exact suite (see this describe block's own
	// header) and is a plain data literal from here on, never re-derived at
	// test time (a self-computed pin would be vacuous -- comparing a value
	// against itself, the mandate's own named vacuity shape).
	const PORT_BODY_HASHES: Readonly<Record<string, string>> = {
		'anim-object.ts': '0e6308f212fe171d2b12ba79e50058e34b18b77a1447565696b5991812072e83',
		'anim-slingshot.ts': '0837db71a134f7806333ae00e040822c832bdb59f8412bf9c98842eae5066c99',
		'ball/ball-data.ts': '75963b1fd8b92283ae1e5f884dd68185d883d82f4167ead39607fea35aef6c74',
		'ball/ball-hit.ts': '0435cce48fe0ff34d37b01c106309264794369450a0e3fb89bfbdb8390d2e39a',
		'ball/ball-mover.ts': 'ad74a85784ed124ca630a7e495f308bd0f65a45085db976b1be61ba9cbbec239',
		'ball/ball-state.ts': '9fea1d1f2e3e889ddabaecc8eb3abfad82f938953bf23a5b52901e6f954a8a61',
		'ball/ball.ts': 'b90d09d5d1c536464b76cef533b49860464a93c8599a543b4314a4d4b9dad18d',
		'cabinet/nudge-impulse.ts': '0cc794dfdd1f049560c1ef8666a0af6a9e788031a69030173406c28403fb3ce2',
		'cabinet/oscillator.ts': '257041a9009245580213136f4ce87f7aba692500816aaff29896dde3048161ee',
		'cabinet/plumb-bob.ts': 'f9d0884180279233fe4a71347fd62e7bcaf496802b556198c95152e4c0f90e22',
		'collision-event.ts': '73870c1dc64533a30f0dfed8db2db22c5c39aa76a309e3d70f04ce7e1d3b11a9',
		'collision-type.ts': '19c344da0d4aed3ab52fdb31b7e624922f0d25b9b3db3bba69e11e1bf7b3a562',
		'constants.ts': '79f2f08c87f752a67161a3a5cbe990a3b570e8d3ad307077bf15395ad0e8df03',
		'flipper/flipper-hit.ts': 'f4dc007980d0fadcf223eac05d81d540b99f2c31576d16b9d39f26466f91dc56',
		'flipper/flipper-mover.ts': '966b5a2d5b450256225de649fda9b57082115d9d6d2a3465b90f8641f35f0d48',
		'functions.ts': '13f583df279ab62f997092aaa13eea79b64601f5b103cb1a914ec5511655431f',
		'game/event-proxy.ts': 'c33e1fd4c4196520c984120972ebc22f22ec91fe29888efd245f7650c8b43533',
		'game/event.ts': 'c00f57466162eb16c33ba0e0abfbf9779bc46772831fa418561bbd455654aeaa',
		'game/player-physics.ts': '38cbd0136abc17eb2e6491068ad42ba9e9cf95299193939669f8edc5a41f39e5',
		'hit-3dpoly.ts': '8f1ac4173f08f6490c347ccde39400e39ab2b925fee45669060d1083f9d06968',
		'hit-circle.ts': '21ef77d8e45a877d3a6b7214b0d1f883ec7e34a97df4362e29577abf0cf1b617',
		'hit-kd-node.ts': 'd40715949946da407b8f7865823a8132b371a90f6ee316d21d3af5e7ac017fd5',
		'hit-kd.ts': 'f4cbc1d0c87b0d76bd0b11e881fc8a9bdb25f5fc0b710030c99dafbbc9a428c3',
		'hit-line-3d.ts': 'd1a56607a625bf406c03452fe358a6a90e85fd03168f0357c1325acaf1b6755c',
		'hit-line-z.ts': '74fe18b6b9d316c23cc996a431d32196965340aeb4107f07ca400cc7c5f25c7b',
		'hit-object.ts': '477d76adc6a25b9ec886bd44f0e2846df6629792501cec1c1870b5a450974168',
		'hit-plane.ts': 'e37a695ea45052fdc267a3c44216580c056fcf5d94d7bafd9c825cc2ff6ef7b1',
		'hit-point.ts': '64c6c0e23dc10c946bed4647cb17850cd6b3b08303068963d21c4cccee90ac3e',
		'hit-quadtree.ts': 'beca7cf1ad55c4f5d23f6b709cf7e6de812571989fc4f4c3fe0f20af3dec7917',
		'hit-triangle.ts': 'eb5ad6d526fea2eee6208f058f4bb3b3632a24c8e68f4be4d534f2162197e9a8',
		'line-seg-slingshot.ts': 'a676a0e3b48bf69ef440801f855dff38597d334eb8095fe44190257a16aa8658',
		'line-seg.ts': '42887ed246ee7627fa027baf4fa3bf429cf625f8aafeb99554b18c51e61fb95d',
		'math/float.ts': 'cb187ce23e432e7fa49035a7b34947bc5a6efaf3b1b97c4d0125a920941ac9c3',
		'math/frect3d.ts': 'b6a88851de4e884170c649e0331aa6856477885ba0abe26260c43880864cb244',
		'math/functions.ts': 'f3a4adacef5bf78149be8d6c13aff3d79f25bc36b0fc67857f5af37733da6ec0',
		'math/matrix2d.ts': '6d2ba509b8a1eeebec7ec6df7ba073114126965a20ff02047b0ea16b687f87d4',
		'math/vertex.ts': '7d544cd26671200dae83194e8649ad1793bb1f48a1d52867d6bfed002d819774',
		'math/vertex2d.ts': 'a143de691bf467476fe6fb153e8525ccd43bd6c9aab40d5a4554c12455902839',
		'math/vertex3d.ts': 'acd2fb57bc370f1072065371fea48f1803ce69d9e982976bde761d3ef6207bed',
		'mover-object.ts': 'b9bd6d5bd2c4b9ad291fb342683643872b8d0a993d45e6f5fee493b2ed4abc76',
		'util/object-pool.ts': '28a0fddc289da1c308e64ca918164508c9c0f421b7e1ef98c479948603962d02',
	};

	const toPosixLocal = (relative: string): string => relative.split(path.sep).join('/');
	const AUTHORED_FILES_LOCAL = new Set([
		'loader/index.ts',
		'switches.ts',
		'devices.ts',
		'machine.ts',
		'flipper/flipper-config.ts',
		'flippers.ts',
		'plunger.ts',
		'cabinet/slam.ts',
		'cabinet/index.ts',
		'hop.ts',
	]);
	const physicsFilesLocal = listFilesRecursive(PHYSICS_ROOT).filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f));
	const declaredPorts = physicsFilesLocal
		.map((f) => toPosixLocal(path.relative(PHYSICS_ROOT, f)))
		.filter((relative) => !AUTHORED_FILES_LOCAL.has(relative));

	it('sanity: this pass finds a non-trivial number of declared ported files, and the manifest is not empty, or every check below is vacuous', () => {
		expect(declaredPorts.length).toBeGreaterThan(0);
		expect(Object.keys(PORT_BODY_HASHES).length).toBeGreaterThan(0);
	});

	it('every declared ported file under src/sim/physics/** has a PORT_BODY_HASHES entry -- a NEW port added without one is unpinned and must fail loudly, not silently', () => {
		const missing = declaredPorts.filter((relative) => !(relative in PORT_BODY_HASHES));
		expect(missing, `the following declared ported file(s) have no PORT_BODY_HASHES entry: ${missing.join(', ')}`).toEqual([]);
	});

	it('every PORT_BODY_HASHES entry names a real, currently-declared ported file -- a stale entry (a file renamed, moved to AUTHORED_FILES, or deleted) must be trimmed', () => {
		const stale = Object.keys(PORT_BODY_HASHES).filter((relative) => !declaredPorts.includes(relative));
		expect(stale, `the following PORT_BODY_HASHES entries no longer name a real, currently-declared ported file: ${stale.join(', ')}`).toEqual([]);
	});

	for (const relative of declaredPorts) {
		it(`${relative}: content hash (normalised line endings) matches the pinned PORT_BODY_HASHES entry`, () => {
			const expectedHash = PORT_BODY_HASHES[relative];
			expect(expectedHash, `no PORT_BODY_HASHES entry for "${relative}" -- see the "every declared ported file has an entry" check above`).toBeDefined();

			const absolute = path.resolve(PHYSICS_ROOT, relative);
			const raw = readFileSync(absolute, 'utf8');
			const actualHash = sha256Hex(normalizeLineEndings(raw));

			expect(
				actualHash,
				`"${relative}" no longer matches its pinned port-body hash. This does NOT by itself mean the port is wrong -- ` +
				`it means the file changed since this manifest was last verified. Re-verify the new content against the ` +
				`upstream pin named in the file's own header comment, then deliberately update PORT_BODY_HASHES in ` +
				`test/sim-boundary.test.ts to the new hash (never routine, never silent).`,
			).toBe(expectedHash);
		});
	}
});
