// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- tools/make-placeholder-glb.mjs's buildPlaceholderGlb()
// had no dedicated test of its own: test/scene-smoke.test.ts loads the
// COMMITTED public/assets/dragonwar.glb through Babylon's real glTF loader (a
// strong parse-correctness signal for whatever bytes happen to be on disk),
// but nothing pinned the relationship the task's own rationale names --
// "commit both the generator and its output so the asset is reproducible
// without a build step" (Tasks & Acceptance). A generator edit that is not
// re-run, or a committed .glb that has drifted from what the generator
// currently produces, would pass every other test in this repo. This file is
// that regression guard, plus a minimal sanity check of the glTF binary
// container format itself (the magic number, version and chunk-type fields
// buildPlaceholderGlb() writes by hand with no third-party glTF library).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPlaceholderGlb } from '../tools/make-placeholder-glb.mjs';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');

describe('tools/make-placeholder-glb.mjs -- buildPlaceholderGlb()', () => {
	it('is deterministic: two calls produce byte-identical output', () => {
		const first = buildPlaceholderGlb();
		const second = buildPlaceholderGlb();
		expect(Buffer.compare(first, second)).toBe(0);
	});

	it('matches the committed public/assets/dragonwar.glb byte-for-byte -- the reproducibility this task exists to guarantee', () => {
		const generated = buildPlaceholderGlb();
		const committed = readFileSync(GLB_PATH);
		expect(Buffer.compare(generated, committed)).toBe(0);
	});

	it('writes a valid glTF 2.0 binary container header (magic "glTF", version 2, correct total length)', () => {
		const glb = buildPlaceholderGlb();
		expect(glb.readUInt32LE(0)).toBe(0x46546c67); // magic 'glTF'
		expect(glb.readUInt32LE(4)).toBe(2); // version
		expect(glb.readUInt32LE(8)).toBe(glb.length); // declared total length matches the real buffer length
	});

	it('the JSON chunk header declares type "JSON" and the BIN chunk header declares type "BIN"', () => {
		const glb = buildPlaceholderGlb();
		const jsonChunkLength = glb.readUInt32LE(12);
		expect(glb.readUInt32LE(16)).toBe(0x4e4f534a); // 'JSON'
		const binChunkOffset = 12 + 8 + jsonChunkLength;
		expect(glb.readUInt32LE(binChunkOffset + 4)).toBe(0x004e4942); // 'BIN' + a NUL pad byte
	});

	it('every authored node name matches AD-11\'s grammar ^[a-z][a-z0-9_]*$', () => {
		const glb = buildPlaceholderGlb();
		const jsonChunkLength = glb.readUInt32LE(12);
		const json = JSON.parse(glb.subarray(20, 20 + jsonChunkLength).toString('utf8'));
		expect(json.nodes.length).toBeGreaterThan(0);
		for (const node of json.nodes) {
			expect(node.name, `node name "${node.name}" violates ^[a-z][a-z0-9_]*$`).toMatch(/^[a-z][a-z0-9_]*$/);
		}
		expect(json.nodes.map((n: { name: string }) => n.name)).toContain('playfield_root');
	});
});
