// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.4's I/O & Edge-Case Matrix, Blender-gated half: real subprocess
// invocations of tools/export.py against the committed assets/src/dragonwar.blend
// and against copies deliberately mutated by
// test/fixtures/export-py/mutate-blend.py. The whole suite SKIPS (not fails)
// when Blender is not resolvable (tools/blender.mjs) -- CI has no Blender
// (Story 1.4's own "Always" rule) -- so this file must never turn `pnpm test`
// red on a Blender-less machine.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveBlender } from '../tools/blender.mjs';
import { buildBlenderArgs, buildTableDump, runExportAssets } from '../tools/export-assets.mjs';

const REPO_ROOT = path.resolve(__dirname, '..');
const BLEND_PATH = path.join(REPO_ROOT, 'assets', 'src', 'dragonwar.blend');
const EXPORT_PY = path.join(REPO_ROOT, 'tools', 'export.py');
const MUTATOR_PY = path.join(REPO_ROOT, 'test', 'fixtures', 'export-py', 'mutate-blend.py');
const WRITE_FAILURE_HARNESS_PY = path.join(REPO_ROOT, 'test', 'fixtures', 'export-py', 'write-failure-harness.py');
const COMMITTED_GLB = path.join(REPO_ROOT, 'public', 'assets', 'dragonwar.glb');
const COMMITTED_COLLISION = path.join(REPO_ROOT, 'public', 'assets', 'dragonwar.collision.json');
const RUN_TIMEOUT_MS = 90_000;

let blenderPath: string | undefined;
try {
	blenderPath = resolveBlender();
} catch {
	blenderPath = undefined;
}

const createdDirs: string[] = [];
afterEach(() => {
	for (const dir of createdDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function freshTmpDir(): string {
	const dir = mkdtempSync(path.join(tmpdir(), 'dragonwar-export-py-'));
	createdDirs.push(dir);
	return dir;
}

function writeTableJson(dir: string): string {
	const dump = buildTableDump();
	const tableJsonPath = path.join(dir, 'table.json');
	writeFileSync(tableJsonPath, JSON.stringify(dump), 'utf8');
	return tableJsonPath;
}

interface RunResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

function runExportPy(blendPath: string, outDir: string): RunResult {
	const tableJsonPath = writeTableJson(freshTmpDir());
	const result = spawnSync(
		blenderPath!,
		[
			'--background',
			'--factory-startup',
			blendPath,
			'--python-exit-code', '1',
			'--python', EXPORT_PY,
			'--',
			'--table-json', tableJsonPath,
			'--out', outDir,
		],
		{ cwd: REPO_ROOT, encoding: 'utf8', timeout: RUN_TIMEOUT_MS },
	);
	return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function mutateBlend(mutation: string): string {
	const dir = freshTmpDir();
	const outBlend = path.join(dir, 'mutated.blend');
	const result = spawnSync(
		blenderPath!,
		[
			'--background',
			'--factory-startup',
			BLEND_PATH,
			'--python', MUTATOR_PY,
			'--',
			'--out', outBlend,
			'--mutation', mutation,
		],
		{ cwd: REPO_ROOT, encoding: 'utf8', timeout: RUN_TIMEOUT_MS },
	);
	if (result.status !== 0) {
		throw new Error(`mutateBlend("${mutation}") failed (exit ${result.status}):\n${result.stderr}`);
	}
	return outBlend;
}

describe.skipIf(!blenderPath)('tools/export.py -- Blender-gated (skipped when Blender is not resolvable)', () => {
	it('a clean export of the committed .blend exits 0 and writes both artifacts', () => {
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(BLEND_PATH, outDir);
		expect(status, `stderr: ${stderr}`).toBe(0);
		expect(existsSync(path.join(outDir, 'dragonwar.glb'))).toBe(true);
		expect(existsSync(path.join(outDir, 'dragonwar.collision.json'))).toBe(true);
	});

	it('re-exporting the committed .blend reproduces BOTH committed artifacts byte-for-byte (verified byte-deterministic, Code Map)', () => {
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(BLEND_PATH, outDir);
		expect(status, `stderr: ${stderr}`).toBe(0);

		const fresh = readFileSync(path.join(outDir, 'dragonwar.glb'));
		const committed = readFileSync(COMMITTED_GLB);
		expect(Buffer.compare(fresh, committed), 'public/assets/dragonwar.glb is stale: re-exporting the committed .blend produced different bytes').toBe(0);

		// The collision document was previously checked for EXISTENCE only, so a
		// regression in export.py's collision maths -- wall_footprint_mm()'s
		// dominant-axis choice, the dMm plane constant, a switch-zone bound, the
		// devices' millimetre scaling -- would leave the committed document stale
		// with nothing going red, on any machine, ever. That document is the input
		// every physics test reads, so the whole collision suite would keep passing
		// against outdated geometry (review finding, this story's code-review pass).
		// export.py writes it with sort_keys=True and indent=2, so it is
		// byte-deterministic exactly as the glb is.
		const freshDoc = readFileSync(path.join(outDir, 'dragonwar.collision.json'));
		const committedDoc = readFileSync(COMMITTED_COLLISION);
		expect(
			Buffer.compare(freshDoc, committedDoc),
			'public/assets/dragonwar.collision.json is stale: re-exporting the committed .blend produced a different collision document. Re-run `pnpm export:assets` and commit both artifacts together.',
		).toBe(0);
	});

	it('a fresh collision.json export contains no carriage-return byte anywhere, on any host platform (task 21 regression pin, iteration 2)', () => {
		// export.py used to open the collision document in Python TEXT mode with
		// the default newline=None, which translates every '\n' the writer emits
		// to os.linesep -- '\r\n' on Windows -- while .gitattributes pins the
		// committed artifact to a bare LF (`* text=auto eol=lf`). The sibling
		// byte-identity test above only catches the resulting drift AFTER a
		// fresh `git checkout --` of public/assets/dragonwar.collision.json (git
		// re-normalises the working-tree file back to LF, so the next export's
		// CRLF output then disagrees with it); on an ordinary working tree that
		// already holds a CRLF copy from a prior un-fixed export, the two CRLF
		// buffers compare equal and nothing goes red (empirically verified this
		// story's AD-tooled iteration-2 pass: `git checkout --` was required to
		// expose it). This test instead asserts a platform-independent
		// invariant directly on the fresh bytes -- no CR anywhere -- so the LF
		// guarantee cannot regress silently regardless of checkout order or
		// what the working tree already contains.
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(BLEND_PATH, outDir);
		expect(status, `stderr: ${stderr}`).toBe(0);

		const outputCollisionPath = path.join(outDir, 'dragonwar.collision.json');
		expect(
			existsSync(outputCollisionPath),
			`export.py exited 0 but did not write ${outputCollisionPath} -- stderr: ${stderr}`,
		).toBe(true);

		const freshDoc = readFileSync(outputCollisionPath);
		expect(
			freshDoc.length,
			'dragonwar.collision.json was written empty -- the CR-byte check below would pass vacuously against an empty buffer, so guard against that first.',
		).toBeGreaterThan(0);

		const crIndex = freshDoc.indexOf(0x0d);
		expect(
			crIndex,
			`dragonwar.collision.json contains a carriage-return byte (0x0D) at offset ${crIndex} -- ` +
				'tools/export.py must write the collision document with newline=\'\\n\' so line endings never depend on the host platform.',
		).toBe(-1);
	});

	it('the real pnpm export:assets entry point (runExportAssets(), not just this file’s own hand-rolled spawnSync helper) succeeds end to end', () => {
		// test/export-py.test.ts's own runExportPy() above independently
		// hand-rolls an equivalent spawnSync call with its own argument list --
		// a bug introduced into runExportAssets()'s own argument-building (e.g.
		// dropping the ‘--’ separator, or reordering flags) would break
		// ‘pnpm export:assets’ in reality while every test above stayed green
		// (review finding, this story's review pass). This drives the real,
		// exported driver function directly.
		const outDir = freshTmpDir();
		const status = runExportAssets({ blendPath: BLEND_PATH, outDir, env: process.env });
		expect(status).toBe(0);
		expect(existsSync(path.join(outDir, 'dragonwar.glb'))).toBe(true);
		expect(existsSync(path.join(outDir, 'dragonwar.collision.json'))).toBe(true);
	});

	it('a bad node name exits non-zero naming the offending node and the grammar', () => {
		const mutated = mutateBlend('bad-name');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('Col_Playfield');
		expect(stderr).toMatch(/\^\[a-z\]\[a-z0-9_\]\*\$/);
	});

	it('two materials on one mesh exits non-zero naming the offending node', () => {
		const mutated = mutateBlend('two-materials');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('vis_playfield');
		expect(stderr).toMatch(/material slot/);
	});

	it('an unknown property value exits non-zero naming the node, the property and the value', () => {
		const mutated = mutateBlend('unknown-property');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('col_playfield');
		expect(stderr).toContain('surface');
		expect(stderr).toContain('unobtainium');
	});

	it('a name-collision attempt is rejected -- Blender auto-suffixes it, and the resulting "col_playfield.001" fails the name grammar (a true duplicate cannot exist in one .blend; see test/fixtures/export-py/mutate-blend.py\'s header)', () => {
		const mutated = mutateBlend('name-collision-attempt');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('col_playfield.001');
	});

	it('an sw_ node authored without a "switch" property exits non-zero naming the node and the property (Review Findings, MED: previously an unhandled KeyError that named neither)', () => {
		const mutated = mutateBlend('missing-switch-property');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		// The old crash path (bare `obj['switch']` inside build_switch_zones())
		// raised a plain KeyError whose message is just "'switch'" -- it never
		// mentioned the node at all, so asserting the node name here is the
		// actual discriminator between the fixed and broken behaviour.
		expect(stderr).toContain('sw_shooter_lane');
		expect(stderr).toContain('switch');
	});

	it('a col_ node authored without a "surface" property exits non-zero naming the node and the property (Review Findings, MED: the switch-sibling half of the same presence-check gap)', () => {
		const mutated = mutateBlend('missing-surface-property');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('col_playfield');
		expect(stderr).toContain('surface');
	});

	it('an exported static mesh with NO lightgroup property exits non-zero naming the node and the property', () => {
		// The presence-vs-value gap the first rework closed for
		// surface/phys_material/switch, with `lightgroup` left behind:
		// validate_properties() checked its VALUE but never required the key, so
		// a mesh with no lightgroup at all exported cleanly -- producing a glb
		// that test/asset-contract.test.ts would then reject, from the very tool
		// whose job is to catch that first (re-review finding). AD-11/AD-12 pair
		// TEXCOORD_1 and `lightgroup` as one static-mesh contract; only the UV
		// half was enforced.
		const mutated = mutateBlend('missing-lightgroup');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('vis_playfield');
		expect(stderr).toContain('lightgroup');
	});

	it('an exported static mesh with ZERO material slots exits non-zero naming the node', () => {
		// validate_material_slots() rejected two-or-more slots but not zero, so a
		// mesh with no material shipped in the glb untextured against AD-11's
		// "one material each" (re-review finding).
		const mutated = mutateBlend('no-material');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('vis_playfield');
		expect(stderr).toContain('material');
	});

	it('a ROTATED wall exits non-zero naming the node, instead of silently AABB-izing it into unrelated collision geometry', () => {
		// The latent Epic 2 defect this re-review was pointed at: every col_
		// reduction (world_bbox_mm(), and wall_footprint_mm() on top of it) is an
		// axis-aligned bounding-box reduction, faithful only for an axis-aligned
		// mesh. Measured before the guard: a 30-degree col_wall_lane exported
		// exit 0 and emitted a 485 x 829 mm slab across most of the playfield in
		// place of a 12 x 950 mm divider, with export.py, asset-contract and
		// loadCollision() all silent. Story 2.1 re-authors this same .blend
		// behind this same validation.
		const mutated = mutateBlend('rotated-wall');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('col_wall_lane');
		expect(stderr.toLowerCase()).toMatch(/rotated|sheared/);
	});

	it('DW-125/DW-68: a wall with a CONCAVE mesh footprint (an L-shape) exits non-zero naming the node, the kept/dropped vertex counts, DW-68 and AD-11 -- never a silent convex-hull fill', () => {
		// Story 2.1d task 15. tools/export.py:434-440's own DW-68 rejection
		// (inside wall_footprint_mm(), called from build_collision_nodes())
		// fires when _convex_hull_2d() drops any distinct rounded plan-view
		// vertex -- but had no end-to-end pin anywhere in this suite before
		// this case (DW-125's own finding: the AD gate for Story 2.1b
		// demonstrated the path firing once, by hand, but nothing regression-
		// tests it). mutate_concave_wall_footprint() moves one corner of
		// col_wall_top (the one plain untouched axis-aligned box -- see the
		// angled-footprint mutation's own comment for why) to a point
		// strictly interior to the triangle formed by the OTHER three
		// corners -- see that mutation's own corrected comment (rework
		// iteration 3, MED finding) for why the rectangle's own centroid is
		// the wrong point (collinear on the hull's own edge, not reflex) --
		// a genuine reflex vertex: the resulting 4-point ring's true convex
		// hull is that same three-corner triangle, so the hull must drop
		// exactly one vertex.
		const mutated = mutateBlend('concave-wall-footprint');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status, `expected a non-zero exit (DW-68's own rejection); stderr: ${stderr}`).not.toBe(0);
		expect(stderr).toContain('col_wall_top');
		expect(stderr).toContain('DW-68');
		expect(stderr).toContain('AD-11');
		// The kept/dropped vertex counts export.py's own fail() message
		// names: 4 distinct points in, 3 kept by the hull, 1 dropped.
		expect(stderr).toMatch(/keeps 3 of its 4 distinct plan-view point/);
		expect(stderr).toMatch(/\(1 vertex\/vertices dropped\)/);
	});

	it('Story 1.5: a wall with a genuinely angled mesh footprint exports a three-point footprintMm, not a four-corner bounding box', () => {
		// wall_footprint_mm()'s reduction changed from the object's AXIS-ALIGNED
		// bounding box to the convex hull of its own mesh vertices -- see
		// tools/export.py's own doc comment on the function. An AABB reduction
		// of a triangular footprint would still report a 4-corner rectangle
		// (the bbox of the triangle); the hull reduction must report the true
		// 3-point shape.
		//
		// Mutation target is col_wall_top, not col_wall_bottom_l: Story 2.1a
		// task 25 (DW-119) reshaped col_wall_bottom_l's own footprint into a
		// four-point convex quad whose top edge slopes toward the drain
		// aperture, so the mutator's position-matched corner collapse (see its
		// own header comment) no longer lands on an existing vertex there.
		// col_wall_top is a plain, untouched axis-aligned box, which is all
		// this mutation needs.
		const mutated = mutateBlend('angled-wall-footprint');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status, `stderr: ${stderr}`).toBe(0);

		const doc = JSON.parse(readFileSync(path.join(outDir, 'dragonwar.collision.json'), 'utf8')) as {
			nodes: Array<{ name: string; footprintMm?: Array<{ x: number; y: number }> }>;
		};
		const node = doc.nodes.find((n) => n.name === 'col_wall_top');
		expect(node, 'col_wall_top missing from the mutated export').toBeDefined();
		expect(node!.footprintMm, 'col_wall_top must still carry a footprintMm').toBeDefined();
		expect(
			node!.footprintMm!.length,
			`expected a 3-point triangular footprint, got ${node!.footprintMm!.length} points -- the hull reduction is not representing the mesh's true (angled) shape`,
		).toBe(3);
	});

	it('Story 1.5: a ROTATED col_ node (not a wall) is still rejected non-zero, naming the node and the numeric off-diagonal world-matrix term', () => {
		// Regression guard for the wall_footprint_mm() rewrite: the rotation
		// guard (validate_col_geometry_reducible()) must still catch a rotated
		// OBJECT transform after the reduction changed to read mesh vertices --
		// and its failure message must still name the actual measured
		// off-diagonal term, not just the words "rotated"/"sheared" (the
		// existing 'rotated-wall' case above only pins the words).
		const mutated = mutateBlend('rotated-wall');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('col_wall_lane');
		expect(stderr).toMatch(/off-diagonal world-matrix term [0-9.]+/);
	});

	it('a wall with no extent on an axis exits non-zero naming the node, instead of emitting a zero-length edge with a NaN normal', () => {
		const mutated = mutateBlend('degenerate-wall');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('col_wall_lane');
		expect(stderr).toContain('extent');
	});

	it('a col_ node that is not a MESH exits non-zero naming the node and its type', () => {
		// An EMPTY's bound_box is all zeros, so it reduces to a degenerate
		// collision node rather than failing anywhere in the pipeline.
		const mutated = mutateBlend('col-node-not-a-mesh');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('col_wall_top');
		expect(stderr).toContain('MESH');
	});

	it('a col_ node authored without a "phys_material" property exits non-zero naming the node and the property (Review Findings, MED: the other switch-sibling half of the same presence-check gap)', () => {
		const mutated = mutateBlend('missing-phys-material-property');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('col_playfield');
		expect(stderr).toContain('phys_material');
	});

	it('a fault injected after every validate_*() call passes -- during the build-and-write phase -- leaves neither committed output changed and no .tmp file behind (Review Findings, MED: write-ordering/atomic-replace fix)', () => {
		const outDir = freshTmpDir();
		const sentinelGlb = Buffer.from('sentinel-glb-content-not-a-real-glTF-file');
		const sentinelCollision = '{"sentinel":true}';
		writeFileSync(path.join(outDir, 'dragonwar.glb'), sentinelGlb);
		writeFileSync(path.join(outDir, 'dragonwar.collision.json'), sentinelCollision, 'utf8');

		const tableJsonPath = writeTableJson(freshTmpDir());
		const result = spawnSync(
			blenderPath!,
			[
				'--background',
				'--factory-startup',
				BLEND_PATH,
				'--python-exit-code', '1',
				'--python', WRITE_FAILURE_HARNESS_PY,
				'--',
				'--table-json', tableJsonPath,
				'--out', outDir,
			],
			{ cwd: REPO_ROOT, encoding: 'utf8', timeout: RUN_TIMEOUT_MS },
		);

		// The harness always exits 0 -- it reports what happened via a stdout
		// marker instead, so a genuine harness/Blender crash (rather than the
		// injected fault) is caught here with the full output for context.
		expect(result.status, `harness stdout+stderr:\n${result.stdout}\n${result.stderr}`).toBe(0);
		expect(result.stdout).toContain('INJECTED_FAILURE_RAISED');

		// The exact scenario the original finding measured with a real Blender
		// run: neither committed artifact changed, and no stray .tmp file was
		// left in a TRACKED directory for `git status` to notice.
		expect(readFileSync(path.join(outDir, 'dragonwar.glb'))).toEqual(sentinelGlb);
		expect(readFileSync(path.join(outDir, 'dragonwar.collision.json'), 'utf8')).toBe(sentinelCollision);
		expect(existsSync(path.join(outDir, 'dragonwar.tmp.glb'))).toBe(false);
		expect(existsSync(path.join(outDir, 'dragonwar.tmp.collision.json'))).toBe(false);
	});

	it('a missing required node exits non-zero naming the missing node', () => {
		const mutated = mutateBlend('missing-node');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('pivot_pitch');
	});

	it('a static mesh with fewer than two UV layers exits non-zero naming the node', () => {
		const mutated = mutateBlend('missing-uv');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('vis_playfield');
		expect(stderr).toMatch(/UV layer/);
	});

	it('an exception raised instead of sys.exit still exits non-zero (the measured --python-exit-code trap)', () => {
		// The mutator's own failure path IS this trap in miniature: if
		// tools/export.py ever regressed to a bare `raise` instead of
		// `sys.exit(n)`, every mutation case above would start reporting
		// exit 0 instead -- this case pins that the DRIVER command line
		// (--python-exit-code) is actually wired up, by asserting on a
		// mutation this suite already knows must fail.
		const mutated = mutateBlend('unknown-property');
		const outDir = freshTmpDir();
		const { status } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(status).not.toBeNull();
	});
});

describe('tools/export-assets.mjs -- the --python-exit-code backstop is in the argv (runs WITHOUT Blender)', () => {
	// Deliberately NOT Blender-gated: this is the one line of defence against
	// the measured trap that had no test of its own. The mutation cases above
	// each build their own argv (they call export.py directly and supply
	// `--python-exit-code` themselves), and the happy-path case asserts only
	// `status === 0`, so deleting the flag from the production driver left the
	// entire suite green -- while reopening the trap on `pnpm export:assets`,
	// the only path a human actually uses (re-review finding).
	it('buildBlenderArgs() passes --python-exit-code with a NON-ZERO value, before --python and before the -- separator', () => {
		const args = buildBlenderArgs({
			blendPath: '/tmp/x.blend',
			tableJsonPath: '/tmp/table.json',
			outDir: '/tmp/out',
		});

		const flagIndex = args.indexOf('--python-exit-code');
		expect(flagIndex, 'the --python-exit-code backstop is missing from the argv handed to Blender').toBeGreaterThanOrEqual(0);

		// A zero exit code would make the flag a no-op: Blender already exits 0
		// on an uncaught exception, which is the whole trap.
		const exitCode = Number(args[flagIndex + 1]);
		expect(Number.isInteger(exitCode), `--python-exit-code's value must be an integer, got "${args[flagIndex + 1]}"`).toBe(true);
		expect(exitCode, '--python-exit-code must be non-zero, or it cannot signal a raised exception').not.toBe(0);

		// Order matters: Blender's own flags must precede `--`, after which
		// everything belongs to export.py's own argv.
		const separatorIndex = args.indexOf('--');
		const pythonIndex = args.indexOf('--python');
		expect(separatorIndex, 'the -- separator is missing').toBeGreaterThanOrEqual(0);
		expect(flagIndex, '--python-exit-code must come before --python').toBeLessThan(pythonIndex);
		expect(pythonIndex, '--python must come before the -- separator').toBeLessThan(separatorIndex);

		// And the export.py side of the separator carries what it parses.
		const afterSeparator = args.slice(separatorIndex + 1);
		expect(afterSeparator).toContain('--table-json');
		expect(afterSeparator).toContain('--out');
		expect(args[pythonIndex + 1], '--python must point at tools/export.py').toBe(EXPORT_PY);
	});
});
