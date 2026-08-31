// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8 (DW-64, ledger; Code Map: "test/export-py.test.ts:102 is the
// single describe.skipIf(!blenderPath) holding 21 it() blocks; the two hull
// pins are :256-278 and :280-293 ... tools/export.py:304 _convex_hull_2d and
// :331 _rotate_to_lexicographic_first are PURE PLAIN PYTHON; only the
// module-level import bpy / from mathutils import Vector block a plain
// python3 import"). This is the Blender-free unit test the Code Map calls
// for, over fixture polygons, exercising both hull helpers directly through
// a real Python interpreter -- not under `ubuntu-latest`'s "no Blender at
// all", so it runs in CI (unlike the 22 Blender-gated tests it does NOT
// replace or subsume -- was 21 through Story 1.8/1.10, now 22 after Story
// 2.1a task 21's LF regression pin: those still need a real .blend document
// and Blender's own mesh/material/property machinery for everything BEYOND
// these two pure helpers).
//
// Skips (never fails) when no plain python3/python is on PATH -- matching
// test/export-py-version-gate.test.ts's own rule: this suite must never turn
// `pnpm test` red on a Python-less machine, and must SAY that it skipped
// (Story 1.8's own "Blender-free hull" I/O matrix row: "Skips only if no
// Python at all, and says so").

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const EXPORT_PY = path.join(REPO_ROOT, 'tools', 'export.py');
const HULL_RUNNER = path.join(REPO_ROOT, 'test', 'fixtures', 'export-py', 'hull-runner.py');

/** Duplicated deliberately from test/export-py-version-gate.test.ts (this story's own convention -- test/solver-termination.test.ts's header states the same rule): each file that spawns a real subprocess stays independently reviewable. */
function resolvePlainPython(): string | undefined {
	for (const candidate of ['python3', 'python']) {
		const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
		if (probe.status === 0) {
			return candidate;
		}
	}
	return undefined;
}

const pythonCmd = resolvePlainPython();

const createdDirs: string[] = [];
afterEach(() => {
	for (const dir of createdDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function freshTmpDir(): string {
	const dir = mkdtempSync(path.join(tmpdir(), 'dragonwar-export-py-hull-'));
	createdDirs.push(dir);
	return dir;
}

/** A minimal stand-in for the two Blender-provided modules tools/export.py imports at module scope -- neither hull helper touches bpy or mathutils, so this only needs to make the import machinery succeed. */
function writeBpyStub(dir: string): void {
	writeFileSync(path.join(dir, 'bpy.py'), '# Minimal stand-in for Blender\'s bpy module -- see test/export-py-hull.test.ts.\nclass app:\n\tversion = (5, 2, 0)\n');
	writeFileSync(path.join(dir, 'mathutils.py'), '# Minimal stand-in for Blender\'s mathutils module -- see test/export-py-hull.test.ts.\nclass Vector:\n\tdef __init__(self, *args, **kwargs):\n\t\tpass\n');
}

interface HullResult {
	readonly hull: readonly (readonly [number, number])[];
	readonly rotated: readonly (readonly [number, number])[];
}

function runHull(points: readonly (readonly [number, number])[]): HullResult {
	const stubDir = freshTmpDir();
	writeBpyStub(stubDir);
	const result = spawnSync(pythonCmd!, [HULL_RUNNER, EXPORT_PY], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
		env: { ...process.env, PYTHONPATH: stubDir },
		input: JSON.stringify({ points }),
	});
	if (result.status !== 0) {
		throw new Error(`hull-runner.py exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
	}
	return JSON.parse(result.stdout) as HullResult;
}

/** Twice the signed area (shoelace formula) -- positive for a counter-clockwise ring, in the same (x, y) convention tools/export.py's own footprintMm uses. */
function signedAreaX2(ring: readonly (readonly [number, number])[]): number {
	let sum = 0;
	for (let i = 0; i < ring.length; i++) {
		const [x1, y1] = ring[i]!;
		const [x2, y2] = ring[(i + 1) % ring.length]!;
		sum += x1 * y2 - x2 * y1;
	}
	return sum;
}

function pointSetsEqual(a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]): boolean {
	if (a.length !== b.length) return false;
	const key = (p: readonly [number, number]) => `${p[0]},${p[1]}`;
	const bKeys = new Set(b.map(key));
	return a.every((p) => bKeys.has(key(p)));
}

describe.skipIf(!pythonCmd)('tools/export.py -- _convex_hull_2d / _rotate_to_lexicographic_first, Blender-free (DW-64)', () => {
	it('a square with a redundant COLLINEAR point on one edge: the hull excludes the collinear point, keeps only the four corners, wound CCW', () => {
		const points: [number, number][] = [
			[0, 0],
			[2, 0],
			[2, 2],
			[0, 2],
			[1, 0], // collinear midpoint of the bottom edge -- must be excluded
		];
		const { hull } = runHull(points);
		expect(hull, 'the collinear midpoint must not appear in the hull').not.toContainEqual([1, 0]);
		expect(pointSetsEqual(hull, [[0, 0], [2, 0], [2, 2], [0, 2]]), `hull was ${JSON.stringify(hull)}`).toBe(true);
		expect(signedAreaX2(hull), 'the hull must be wound counter-clockwise (positive signed area)').toBeGreaterThan(0);
	});

	it('a concave L-shaped hexagon: the hull excludes the CONCAVE interior corner, keeping the five convex vertices, wound CCW', () => {
		// L-shape: (0,0) -> (2,0) -> (2,1) -> (1,1) -> (1,2) -> (0,2) -> close.
		// (1,1) is the concave (reflex) vertex -- strictly inside the convex
		// hull of the other five points (independently verified by hand:
		// segment (2,1)-(1,2) passes ABOVE (1,1)).
		const points: [number, number][] = [
			[0, 0],
			[2, 0],
			[2, 1],
			[1, 1],
			[1, 2],
			[0, 2],
		];
		const { hull } = runHull(points);
		expect(hull, 'the concave vertex (1,1) must not appear in the hull').not.toContainEqual([1, 1]);
		expect(pointSetsEqual(hull, [[0, 0], [2, 0], [2, 1], [1, 2], [0, 2]]), `hull was ${JSON.stringify(hull)}`).toBe(true);
		expect(signedAreaX2(hull), 'the hull must be wound counter-clockwise (positive signed area)').toBeGreaterThan(0);
	});

	it('a plain triangle (already convex, no reduction needed): the hull keeps all three vertices', () => {
		const points: [number, number][] = [
			[0, 0],
			[4, 0],
			[0, 3],
		];
		const { hull } = runHull(points);
		expect(pointSetsEqual(hull, points), `hull was ${JSON.stringify(hull)}`).toBe(true);
	});

	it('_rotate_to_lexicographic_first(): rotates a CCW ring so its lexicographically smallest point comes first, WITHOUT reversing the winding', () => {
		// _convex_hull_2d() sorts its own input, so the hull-runner always
		// calls _rotate_to_lexicographic_first() on a REAL hull result (never
		// a hand-built ring) -- the square fixture's own hull is already known
		// (the first test above), so this asserts the ROTATED output starts at
		// the lexicographically smallest point while preserving cyclic order.
		const { hull: squareHull, rotated: squareRotated } = runHull([[0, 0], [2, 0], [2, 2], [0, 2]]);
		expect(squareRotated[0], 'rotated must start at the lexicographically smallest point').toEqual([0, 0]);
		expect(squareRotated.length).toBe(squareHull.length);
		expect(pointSetsEqual(squareRotated, squareHull), 'rotation must not add, drop or duplicate any point').toBe(true);
		expect(signedAreaX2(squareRotated), 'rotation must not reverse the winding').toBeGreaterThan(0);
		// Cyclic order preserved: rotating squareRotated forward must reproduce
		// SOME rotation of the original hull's own cyclic sequence -- checked
		// by confirming each point's successor in `rotated` is also its
		// successor in `hull` (mod length), i.e. the cyclic adjacency survives.
		const hullIndexOf = (p: readonly [number, number]) => squareHull.findIndex((h) => h[0] === p[0] && h[1] === p[1]);
		for (let i = 0; i < squareRotated.length; i++) {
			const a = squareRotated[i]!;
			const b = squareRotated[(i + 1) % squareRotated.length]!;
			const ia = hullIndexOf(a);
			const ib = hullIndexOf(b);
			expect(ib, `point after ${JSON.stringify(a)} in rotated must be its successor in the original hull (cyclic order preserved)`).toBe((ia + 1) % squareHull.length);
		}
	});
});
