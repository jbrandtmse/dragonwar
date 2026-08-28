#!/usr/bin/env node
// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- generates public/assets/dragonwar.glb: a minimal, valid
// glTF 2.0 binary carrying one playfield-sized box, so the spike can measure a
// real (if placeholder) asset load without depending on Blender or on Story
// 1.4's tools/export.py. Node built-ins only (fs, path, url) -- no third-party
// glTF library, so this generator itself needs no ATTRIBUTIONS.md entry.
//
// AD-11 deviation, recorded on purpose: the real pipeline's export.py produces
// a much richer glb (col_/sw_/vis_/l_ prefixed nodes, two top-level nodes plus
// pivot_pitch, a compound collision body, a paired collision.json). This
// generator borrows only two things from that contract so Story 1.4 can
// replace it behind the same path without anything downstream noticing: the
// node-name grammar `^[a-z][a-z0-9_]*$` (AD-11) and the top-level node name
// `playfield_root`. Everything else here is deliberately minimal.
//
// AD-10: geometry is authored UNPITCHED, glTF Y-up, metres. The box sits in
// the playfield's X-Z plane (glb +X = table +X, glb -Z = table +Y per AD-10's
// three sanctioned conversions), centred on the origin, with a small Y
// thickness standing in for playfield material.
//
// Usage: node tools/make-placeholder-glb.mjs [outFile]
//   Regenerate after editing this file; commit both the generator and its
//   output (public/assets/dragonwar.glb) so the asset is reproducible without
//   a build step, matching AD-11's "art must not block Epic 1" rule.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// AD-10's reference dimensions (TABLE.reference, per epics.md / ARCHITECTURE-SPINE.md AD-10):
// playfield 514.4mm x 1066.8mm, converted to metres for the glb frame.
const PLAYFIELD_WIDTH_M = 0.5144; // table +X
const PLAYFIELD_LENGTH_M = 1.0668; // table +Y -> glb -Z
const PLACEHOLDER_THICKNESS_M = 0.02; // small thickness standing in for playfield material

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'public', 'assets', 'dragonwar.glb');

/**
 * A standard indexed box (24 vertices -- 4 per face, so every face gets its
 * own flat normal -- 36 indices, CCW winding viewed from outside, matching
 * glTF's default front face). hx/hy/hz are half-extents in metres.
 */
function buildBox(hx, hy, hz) {
	// [nx, ny, nz, list of 4 corner signs as (sx, sy, sz) multiplying (hx, hy, hz)]
	// Each face's 4 corners are listed in CCW order as seen from outside along
	// the face normal.
	const faces = [
		{ normal: [1, 0, 0], corners: [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]] }, // +X
		{ normal: [-1, 0, 0], corners: [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]] }, // -X
		{ normal: [0, 1, 0], corners: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] }, // +Y
		{ normal: [0, -1, 0], corners: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]] }, // -Y
		{ normal: [0, 0, 1], corners: [[1, -1, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1]] }, // +Z
		{ normal: [0, 0, -1], corners: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]] }, // -Z
	];

	const positions = [];
	const normals = [];
	const indices = [];

	for (const face of faces) {
		const base = positions.length / 3;
		for (const [sx, sy, sz] of face.corners) {
			positions.push(sx * hx, sy * hy, sz * hz);
			normals.push(...face.normal);
		}
		indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
	}

	return { positions, normals, indices };
}

function minMax3(flat) {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < flat.length; i += 3) {
		for (let c = 0; c < 3; c++) {
			min[c] = Math.min(min[c], flat[i + c]);
			max[c] = Math.max(max[c], flat[i + c]);
		}
	}
	return { min, max };
}

/** Pads a Buffer to the next multiple of 4 bytes with the given fill byte. */
function pad4(buffer, fillByte) {
	const remainder = buffer.length % 4;
	if (remainder === 0) {
		return buffer;
	}
	const padding = Buffer.alloc(4 - remainder, fillByte);
	return Buffer.concat([buffer, padding]);
}

export function buildPlaceholderGlb() {
	for (const name of ['playfield_root', 'vis_placeholder_box']) {
		if (!/^[a-z][a-z0-9_]*$/.test(name)) {
			throw new Error(`node name "${name}" violates AD-11's grammar ^[a-z][a-z0-9_]*$`);
		}
	}

	const { positions, normals, indices } = buildBox(
		PLAYFIELD_WIDTH_M / 2,
		PLACEHOLDER_THICKNESS_M / 2,
		PLAYFIELD_LENGTH_M / 2,
	);

	const positionBuffer = Buffer.from(new Float32Array(positions).buffer);
	const normalBuffer = Buffer.from(new Float32Array(normals).buffer);
	const indexBuffer = Buffer.from(new Uint16Array(indices).buffer);

	const positionByteOffset = 0;
	const normalByteOffset = positionByteOffset + positionBuffer.length;
	const indexByteOffset = normalByteOffset + normalBuffer.length;
	const binLength = indexByteOffset + indexBuffer.length;

	const { min: posMin, max: posMax } = minMax3(positions);

	const gltf = {
		asset: {
			version: '2.0',
			generator: 'DragonWar tools/make-placeholder-glb.mjs (Story 1.2 placeholder; Story 1.4 replaces via tools/export.py)',
		},
		scene: 0,
		scenes: [{ nodes: [0] }],
		nodes: [
			{ name: 'playfield_root', children: [1] },
			{ name: 'vis_placeholder_box', mesh: 0 },
		],
		meshes: [
			{
				name: 'vis_placeholder_box',
				primitives: [
					{
						attributes: { POSITION: 0, NORMAL: 1 },
						indices: 2,
						mode: 4, // TRIANGLES
					},
				],
			},
		],
		accessors: [
			{
				bufferView: 0,
				componentType: 5126, // FLOAT
				count: positions.length / 3,
				type: 'VEC3',
				min: posMin,
				max: posMax,
			},
			{
				bufferView: 1,
				componentType: 5126, // FLOAT
				count: normals.length / 3,
				type: 'VEC3',
			},
			{
				bufferView: 2,
				componentType: 5123, // UNSIGNED_SHORT
				count: indices.length,
				type: 'SCALAR',
			},
		],
		bufferViews: [
			{ buffer: 0, byteOffset: positionByteOffset, byteLength: positionBuffer.length, target: 34962 },
			{ buffer: 0, byteOffset: normalByteOffset, byteLength: normalBuffer.length, target: 34962 },
			{ buffer: 0, byteOffset: indexByteOffset, byteLength: indexBuffer.length, target: 34963 },
		],
		buffers: [{ byteLength: binLength }],
	};

	const jsonBuffer = pad4(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20); // space-padded
	const binBuffer = pad4(Buffer.concat([positionBuffer, normalBuffer, indexBuffer]), 0x00); // zero-padded

	const jsonChunkHeader = Buffer.alloc(8);
	jsonChunkHeader.writeUInt32LE(jsonBuffer.length, 0);
	jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

	const binChunkHeader = Buffer.alloc(8);
	binChunkHeader.writeUInt32LE(binBuffer.length, 0);
	binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

	const totalLength = 12 + jsonChunkHeader.length + jsonBuffer.length + binChunkHeader.length + binBuffer.length;

	const glbHeader = Buffer.alloc(12);
	glbHeader.writeUInt32LE(0x46546c67, 0); // magic 'glTF'
	glbHeader.writeUInt32LE(2, 4); // version
	glbHeader.writeUInt32LE(totalLength, 8);

	return Buffer.concat([glbHeader, jsonChunkHeader, jsonBuffer, binChunkHeader, binBuffer]);
}

function main() {
	const outFile = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUT;
	const glb = buildPlaceholderGlb();
	writeFileSync(outFile, glb);
	// eslint-disable-next-line no-console
	console.log(`[make-placeholder-glb] wrote ${glb.length} bytes to ${outFile}`);
}

// Only run when invoked directly (node tools/make-placeholder-glb.mjs), not
// when imported by a test that wants buildPlaceholderGlb() in isolation.
const isMainModule = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMainModule) {
	main();
}
