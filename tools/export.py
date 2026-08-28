# DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
#
# Story 1.4 -- the export pipeline's enforcer (AD-11), run inside Blender by
# tools/export-assets.mjs:
#
#   blender --background --factory-startup <blend> --python-exit-code <n> \
#       --python tools/export.py -- --table-json <tmp> --out public/assets
#
# Validates every object in the committed `.blend` -- name grammar,
# uniqueness, one material slot per mesh, a second UV layer on every static
# mesh this file exports, every `lightgroup`/`surface`/`phys_material`/
# `switch` value against a JSON dump of `TABLE`, the presence of every node
# `TABLE.nodes` names, and that every `col_` node carries a known
# `col_shape` -- BEFORE writing anything. On success, writes
# `dragonwar.glb` (the presentation subset: everything except `col_`/`sw_`
# collision scaffolding) and `dragonwar.collision.json` (every `col_`/`sw_`/
# ball-device node, reduced to the ported physics primitive set, in
# millimetres, table frame, computed from world matrices -- never from the
# glb).
#
# THE MEASURED TRAP (Code Map, "Verified upstream facts"): an uncaught
# Python exception inside `blender --python script.py` exits 0 by default.
# Every failure path below calls `sys.exit(n)` explicitly, and `main()`'s own
# outermost try/except is a second, redundant line of defence against any
# failure this file's author did not anticipate -- the driver's
# `--python-exit-code` flag is a THIRD, Blender-side backstop on top of both.

import json
import os
import re
import sys

import bpy
from mathutils import Vector

MIN_BLENDER_VERSION = (5, 2, 0)
NAME_PATTERN = re.compile(r'^[a-z][a-z0-9_]*$')
COL_SHAPES = {'plane', 'wall', 'box'}
BBOX_ROUND = 4  # decimal places -- diff-stable against float32 noise (Code Map, "Verified environment facts")
# Largest off-diagonal world-matrix term a col_/sw_ node may carry and still
# be treated as axis-aligned. Blender stores an identity rotation exactly, so
# every authored node measures 0.0; this is float slack, not a tolerance for
# "nearly axis-aligned" geometry (a 1 degree rotation measures ~0.017).
AXIS_ALIGNED_EPSILON = 1e-9
# Smallest extent a wall may have on an axis before its footprint collapses to
# a zero-length edge. Well below any authorable thickness (the placeholder's
# thinnest wall is 12 mm) and well above float32 bbox noise (~5e-6 mm).
DEGENERATE_EXTENT_MM = 1e-3


class ExportError(Exception):
	"""Raised for every validation failure -- caught once in main() and turned into sys.exit(1)."""


def fail(message):
	raise ExportError(message)


# ---------------------------------------------------------------------------
# Argument parsing (everything after Blender's own `--`).
# ---------------------------------------------------------------------------

def parse_args(argv):
	if '--' in argv:
		rest = argv[argv.index('--') + 1:]
	else:
		rest = []
	table_json = None
	out_dir = None
	i = 0
	while i < len(rest):
		if rest[i] == '--table-json' and i + 1 < len(rest):
			table_json = rest[i + 1]
			i += 2
		elif rest[i] == '--out' and i + 1 < len(rest):
			out_dir = rest[i + 1]
			i += 2
		else:
			fail(f'unrecognised argument: {rest[i]}')
	if table_json is None:
		fail('--table-json is required')
	if out_dir is None:
		fail('--out is required')
	return table_json, out_dir


# ---------------------------------------------------------------------------
# Object-level validation (every object in the file, task 9).
# ---------------------------------------------------------------------------

def mesh_objects():
	return [obj for obj in bpy.data.objects if obj.type == 'MESH']


def is_presentation_object(obj):
	"""AD-11 / Design Notes ("What goes into the glb"): everything except
	`col_` collision scaffolding and `sw_` switch zones. Name-prefix based,
	not Blender's own persisted UI selection state -- robust across however
	an artist last left the file selected in Epic 2+."""
	return not (obj.name.startswith('col_') or obj.name.startswith('sw_'))


def validate_names_and_uniqueness():
	seen = {}
	for obj in bpy.data.objects:
		if not NAME_PATTERN.match(obj.name):
			fail(f'node "{obj.name}" violates the name grammar ^[a-z][a-z0-9_]*$')
		# Blender's own object namespace is globally unique by construction
		# (a colliding bpy.data.objects.new()/.name= assignment is
		# auto-suffixed, e.g. "foo.001", which the grammar check above already
		# rejects for its dot) -- this pass is deliberate defence in depth
		# against any future authoring path that could bypass that guarantee.
		seen.setdefault(obj.name, 0)
		seen[obj.name] += 1
	for name, count in seen.items():
		if count > 1:
			fail(f'duplicate node name "{name}" ({count} objects)')


def validate_material_slots():
	for obj in mesh_objects():
		if len(obj.data.materials) > 1:
			fail(f'node "{obj.name}" has {len(obj.data.materials)} material slots (AD-11: one material each)')


def validate_second_uv(exported_meshes):
	for obj in exported_meshes:
		layers = obj.data.uv_layers
		if len(layers) < 2:
			fail(f'node "{obj.name}" (exported static mesh) has {len(layers)} UV layer(s) -- needs a second UV layer for TEXCOORD_1 (AD-12)')


def validate_exported_mesh_contract(exported_meshes):
	"""AD-11/AD-12 state ONE asset contract for a static mesh in two halves:
	"static meshes carry TEXCOORD_1 lightmap UVs AND a `lightgroup` from
	TABLE.lightGroups", each mesh carrying "one material each".

	`validate_second_uv()` above enforces the UV half. This enforces the other
	two, both of which were previously value-only or one-sided:
	`validate_properties()` checks a `lightgroup`'s VALUE but never required
	the key to be present (the exact presence-vs-value gap this story's first
	review pass closed for `surface`/`phys_material`/`switch`, with
	`lightgroup` left behind -- re-review finding), and
	`validate_material_slots()` rejects two-or-more slots but not ZERO, so a
	mesh with no material at all shipped in the glb untextured.

	Scoped to EXPORTED meshes deliberately: `col_`/`sw_` meshes are collision
	scaffolding that never reaches the glb and correctly carries neither a
	material nor a lightgroup, and the roots and `bd_` devices are empties."""
	for obj in exported_meshes:
		if 'lightgroup' not in obj.keys():
			fail(f'node "{obj.name}" (exported static mesh) is missing required property "lightgroup" (AD-11/AD-12)')
		if len(obj.data.materials) == 0:
			fail(f'node "{obj.name}" (exported static mesh) has 0 material slots (AD-11: one material each)')


def validate_properties(dump):
	known_surfaces = set(dump['surfaces'])
	known_phys_materials = set(dump['physMaterials'].keys())
	known_switches = set(dump['switches'].keys())
	known_light_groups = set(dump['lightGroups'].keys())
	known_lamps = set(dump['lamps'].keys())
	known_ball_devices = set(dump['ballDevices'].keys())

	for obj in bpy.data.objects:
		props = obj.keys()
		is_col_or_sw = obj.name.startswith('col_') or obj.name.startswith('sw_')

		# Presence, not just value (Review Findings, MED): a col_/sw_ node
		# authored without "surface"/"phys_material" -- or an sw_ node without
		# "switch" -- previously escaped this function entirely (the checks
		# below only ever looked at a value that was already there) and
		# surfaced downstream as an unhandled KeyError with NO node or
		# property named -- measured verbatim, contradicting every failure
		# path's contract of naming the offending node and property. Task 7's
		# own spec requires these properties on every col_/sw_ node, so
		# absence is exactly as much a contract violation as a bad value.
		if is_col_or_sw:
			if 'surface' not in props:
				fail(f'node "{obj.name}" is missing required property "surface"')
			if 'phys_material' not in props:
				fail(f'node "{obj.name}" is missing required property "phys_material"')
		if obj.name.startswith('sw_') and 'switch' not in props:
			fail(f'node "{obj.name}" is missing required property "switch"')

		if 'surface' in props and obj['surface'] not in known_surfaces:
			fail(f'node "{obj.name}" property "surface" has unknown value "{obj["surface"]}"')
		if 'phys_material' in props and obj['phys_material'] not in known_phys_materials:
			fail(f'node "{obj.name}" property "phys_material" has unknown value "{obj["phys_material"]}"')
		if 'switch' in props and obj['switch'] not in known_switches:
			fail(f'node "{obj.name}" property "switch" has unknown value "{obj["switch"]}"')
		if 'lightgroup' in props and obj['lightgroup'] not in known_light_groups:
			fail(f'node "{obj.name}" property "lightgroup" has unknown value "{obj["lightgroup"]}"')
		if obj.name.startswith('l_') and obj.name not in known_lamps:
			fail(f'node "{obj.name}" is not a known TABLE.lamps name')
		if obj.name.startswith('bd_') and obj.name not in known_ball_devices:
			fail(f'node "{obj.name}" is not a known TABLE.ballDevices name')


def validate_col_shapes():
	for obj in bpy.data.objects:
		if not obj.name.startswith('col_'):
			continue
		shape = obj.get('col_shape')
		if shape is None:
			fail(f'node "{obj.name}" is a col_ node with no col_shape property')
		if shape not in COL_SHAPES:
			fail(f'node "{obj.name}" has unknown col_shape "{shape}" (must be one of {sorted(COL_SHAPES)})')
		if shape == 'plane':
			normal_z = obj.get('col_normal_z')
			if normal_z not in (1, -1, 1.0, -1.0):
				fail(f'node "{obj.name}" is a plane-shaped col_ node with invalid col_normal_z "{normal_z}" (must be 1 or -1)')


def validate_col_geometry_reducible():
	"""AD-11: a `col_` node "must reduce to the ported primitive set". Every
	reduction below (`world_bbox_mm()`, and `wall_footprint_mm()` on top of
	it) is an AXIS-ALIGNED bounding-box reduction, which faithfully represents
	the authored mesh only when that mesh is itself axis-aligned. Nothing
	previously checked that, so a rotated wall was silently AABB-ized into
	collision geometry unrelated to its own mesh -- measured during this
	story's re-review: rotating `col_wall_lane` 30 degrees about Z and
	re-exporting exited 0 and emitted a 485 x 829 mm slab across most of the
	playfield in place of a 12 x 950 mm divider, with `export.py`,
	test/asset-contract.test.ts and `loadCollision()` all silent.

	Every wall in the placeholder is axis-aligned, so this changes no committed
	artifact -- it is a guard for Epic 2, which re-authors the real shot map
	inside this same .blend behind this same validation, where the first
	rotated wall would otherwise ship geometry the ball hits in the wrong
	place. An enforcer that cannot represent a shape must reject it loudly
	rather than approximate it silently.

	Also rejects the two other ways a reduction can go quietly wrong: a
	`col_`/`sw_` node that is not a MESH at all (an EMPTY's `bound_box` is all
	zeros, so it reduces to a degenerate node), and a `wall` whose footprint
	has no extent on an axis (two coincident corners, whose zero-length edge
	gives `LineSeg.calcNormal()` a division by zero and therefore a NaN normal
	-- a face that silently never collides)."""
	for obj in bpy.data.objects:
		if not (obj.name.startswith('col_') or obj.name.startswith('sw_')):
			continue
		if obj.type != 'MESH':
			fail(f'node "{obj.name}" is a col_/sw_ node of type {obj.type}, not MESH -- only a mesh has geometry to reduce')

		# Axis-aligned means the world matrix's 3x3 part is diagonal: it may
		# scale and translate, but any rotation or shear puts a non-zero value
		# off the diagonal.
		m = obj.matrix_world
		off_diagonal = max(abs(m[r][c]) for r in range(3) for c in range(3) if r != c)
		if off_diagonal > AXIS_ALIGNED_EPSILON:
			fail(
				f'node "{obj.name}" is rotated or sheared (largest off-diagonal world-matrix term '
				f'{off_diagonal:.6g} > {AXIS_ALIGNED_EPSILON}) -- col_/sw_ nodes reduce through an '
				f'axis-aligned bounding box, which cannot represent a rotated shape (AD-11)',
			)

		if obj.get('col_shape') == 'wall':
			bbox_min, bbox_max = world_bbox_mm(obj)
			for axis in ('x', 'y'):
				if abs(bbox_max[axis] - bbox_min[axis]) <= DEGENERATE_EXTENT_MM:
					fail(
						f'node "{obj.name}" is a wall with no {axis} extent '
						f'({bbox_min[axis]} .. {bbox_max[axis]} mm) -- its footprint would collapse to a '
						f'zero-length edge with an undefined normal (AD-11: walls have real thickness)',
					)


def validate_node_presence(dump):
	present = {obj.name for obj in bpy.data.objects}
	for key, node_name in dump['nodes'].items():
		if node_name not in present:
			fail(f'required node "{node_name}" (TABLE.nodes.{key}) is missing from the .blend')


def validate_ball_devices_present(dump):
	# validate_node_presence() above only iterates dump['nodes'] (the seven
	# TABLE.nodes entries) -- it never looks at dump['ballDevices'], so a
	# .blend missing bd_trough/bd_shooter previously exported a devices array
	# silently short one entry, with no failure anywhere in the pipeline
	# (review finding, this story's review pass).
	present = {obj.name for obj in bpy.data.objects}
	for device_name in dump['ballDevices'].keys():
		if device_name not in present:
			fail(f'required ball device "{device_name}" (TABLE.ballDevices) has no matching object in the .blend')


# ---------------------------------------------------------------------------
# World-space geometry helpers (millimetres, table frame -- computed from
# world matrices in Python, never from the glb).
# ---------------------------------------------------------------------------

def world_bbox_mm(obj):
	corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
	xs = [c.x * 1000 for c in corners]
	ys = [c.y * 1000 for c in corners]
	zs = [c.z * 1000 for c in corners]
	return (
		{'x': round(min(xs), BBOX_ROUND), 'y': round(min(ys), BBOX_ROUND), 'z': round(min(zs), BBOX_ROUND)},
		{'x': round(max(xs), BBOX_ROUND), 'y': round(max(ys), BBOX_ROUND), 'z': round(max(zs), BBOX_ROUND)},
	)


def _convex_hull_2d(points):
	"""Andrew's monotone chain convex hull over `points` (a list of distinct
	`(x, y)` tuples). Returns the hull vertices wound COUNTER-CLOCKWISE, with
	no repeated closing point -- the exact shape `build_collision_nodes()`
	needs for a `footprintMm` entry. `points` must already be de-duplicated;
	fewer than 3 points cannot form a polygon and is the caller's job to
	reject with a named `fail()`, not this helper's."""
	pts = sorted(points)

	def cross(o, a, b):
		return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

	lower = []
	for p in pts:
		while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
			lower.pop()
		lower.append(p)

	upper = []
	for p in reversed(pts):
		while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
			upper.pop()
		upper.append(p)

	return lower[:-1] + upper[:-1]


def _rotate_to_lexicographic_first(ring):
	"""Rotates a closed ring (no repeated closing point) so its
	lexicographically smallest `(x, y)` point comes first, without changing
	its winding order -- a diff-stable, deterministic starting point
	independent of which mesh vertex Blender happened to enumerate first."""
	start = min(range(len(ring)), key=lambda i: ring[i])
	return ring[start:] + ring[:start]


def wall_footprint_mm(obj):
	"""A wall's true plan-view footprint: the convex hull of its OWN
	world-space mesh vertices, projected to (x, y) millimetres, rounded to
	`BBOX_ROUND` (diff-stable against float32 noise), de-duplicated, wound
	counter-clockwise and rotated so the lexicographically smallest point
	comes first. The loader treats this as a CLOSED polygon (an edge between
	every consecutive pair, plus one closing the last point back to the
	first), so every face becomes real collision geometry.

	This replaced an axis-aligned-bounding-box reduction (the four corners of
	`world_bbox_mm()`) for one reason: an angled wall -- `col_lane_deflector`,
	Story 1.5's triangular lane deflector, authored with an IDENTITY object
	transform and angled MESH VERTICES so `validate_col_geometry_reducible()`'s
	rotation guard still passes -- has a real, non-rectangular footprint that
	an AABB silently discards, turning a deflecting triangle into a
	lane-blocking rectangular slab. Reducing over the mesh's own vertices
	instead of its bounding box represents that shape exactly, and needs no
	change to `src/sim/physics/loader`'s `addWall()`, which already treats
	`footprintMm` as a closed polygon of any length >= 3.

	Byte-neutral for every rectangular wall (verified for all seven walls
	committed before this story, and re-derivable by hand): a box's 8 mesh
	vertices project to exactly 4 distinct (x, y) points, whose convex hull is
	the same 4-corner counter-clockwise ring the old AABB reduction produced,
	already starting at the lexicographically smallest corner -- so this
	change reproduces the committed `dragonwar.collision.json` unchanged for
	every wall that has not itself changed shape."""
	world_points = set()
	for vertex in obj.data.vertices:
		world = obj.matrix_world @ vertex.co
		world_points.add((round(world.x * 1000, BBOX_ROUND), round(world.y * 1000, BBOX_ROUND)))

	if len(world_points) < 3:
		fail(
			f'node "{obj.name}" is a wall whose mesh reduces to {len(world_points)} distinct plan-view '
			f'point(s) after rounding -- a wall footprint needs at least 3 distinct points to enclose any area',
		)

	hull = _convex_hull_2d(world_points)
	if len(hull) < 3:
		fail(
			f'node "{obj.name}" is a wall whose convex hull has {len(hull)} point(s) -- '
			f'at least 3 are required to enclose any area',
		)

	hull = _rotate_to_lexicographic_first(hull)
	return [{'x': x, 'y': y} for x, y in hull]


def build_collision_nodes(dump):
	nodes = []
	for obj in bpy.data.objects:
		if not obj.name.startswith('col_'):
			continue
		bbox_min, bbox_max = world_bbox_mm(obj)
		shape = obj['col_shape']
		entry = {
			'name': obj.name,
			'shape': shape,
			'surface': obj.get('surface'),
			'physMaterial': obj.get('phys_material'),
			'bboxMm': {'min': bbox_min, 'max': bbox_max},
		}
		if shape == 'plane':
			normal_z = float(obj['col_normal_z'])
			relevant_z = bbox_max['z'] if normal_z > 0 else bbox_min['z']
			entry['normal'] = {'x': 0, 'y': 0, 'z': normal_z}
			entry['dMm'] = round(normal_z * relevant_z, BBOX_ROUND)
		elif shape == 'wall':
			entry['zLowMm'] = bbox_min['z']
			entry['zHighMm'] = bbox_max['z']
			entry['footprintMm'] = wall_footprint_mm(obj)
		nodes.append(entry)
	return nodes


def build_switch_zones(dump):
	zones = []
	for obj in bpy.data.objects:
		if not obj.name.startswith('sw_'):
			continue
		bbox_min, bbox_max = world_bbox_mm(obj)
		zones.append({
			'name': obj.name,
			'switch': obj['switch'],
			'shape': 'box',
			'minMm': bbox_min,
			'maxMm': bbox_max,
		})
	return zones


def build_devices(dump):
	devices = []
	for name in dump['ballDevices'].keys():
		obj = bpy.data.objects.get(name)
		if obj is None:
			continue  # unreachable: validate_ball_devices_present() already failed the run above
		pos = obj.matrix_world.translation
		direction = (obj.matrix_world.to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized()
		devices.append({
			'name': name,
			'ejectPose': {
				'posMm': {
					'x': round(pos.x * 1000, BBOX_ROUND),
					'y': round(pos.y * 1000, BBOX_ROUND),
					'z': round(pos.z * 1000, BBOX_ROUND),
				},
				'dir': {
					'x': round(direction.x, 6),
					'y': round(direction.y, 6),
					'z': round(direction.z, 6),
				},
			},
		})
	return devices


# ---------------------------------------------------------------------------
# glTF export (presentation subset only).
# ---------------------------------------------------------------------------

def export_glb(out_glb_path, dump):
	for obj in bpy.data.objects:
		obj.select_set(False)
	export_objects = [obj for obj in bpy.data.objects if is_presentation_object(obj)]
	for obj in export_objects:
		obj.select_set(True)
	# Read from the dump, not a literal: this file enforces the no-string-
	# literal-node-name contract for everything else in the .blend, and a
	# hardcoded name here would go stale silently (`.get()` returns None) if
	# TABLE.nodes.playfieldRoot were ever renamed (Review Findings, LOW).
	bpy.context.view_layer.objects.active = bpy.data.objects.get(dump['nodes']['playfieldRoot'])

	bpy.ops.export_scene.gltf(
		filepath=out_glb_path,
		export_format='GLB',
		use_selection=True,
		export_yup=True,
		export_extras=True,
		export_apply=True,
		export_cameras=False,
		export_lights=False,
		export_animations=False,
		export_skins=False,
		export_morph=False,
	)
	return export_objects


# ---------------------------------------------------------------------------
# Entry point.
# ---------------------------------------------------------------------------

def run(argv):
	table_json_path, out_dir = parse_args(argv)

	# Version gate FIRST (task 9): the message must be about the toolchain,
	# not the model, when Blender itself is too old.
	if bpy.app.version < MIN_BLENDER_VERSION:
		fail(
			f'Blender {".".join(str(v) for v in bpy.app.version)} is too old -- '
			f'this export requires Blender {".".join(str(v) for v in MIN_BLENDER_VERSION)} or newer',
		)

	with open(table_json_path, 'r', encoding='utf-8') as f:
		dump = json.load(f)

	validate_names_and_uniqueness()
	validate_material_slots()
	validate_col_shapes()
	validate_col_geometry_reducible()
	validate_properties(dump)
	validate_node_presence(dump)
	validate_ball_devices_present(dump)

	export_objects = [obj for obj in bpy.data.objects if is_presentation_object(obj)]
	exported_meshes = [obj for obj in export_objects if obj.type == 'MESH']
	validate_second_uv(exported_meshes)
	validate_exported_mesh_contract(exported_meshes)

	os.makedirs(out_dir, exist_ok=True)
	out_glb_path = os.path.join(out_dir, 'dragonwar.glb')
	out_collision_path = os.path.join(out_dir, 'dragonwar.collision.json')
	# Suffixed BEFORE the real extension (not appended after it), so the temp
	# path still ends in `.glb` -- avoids relying on whether Blender's glTF
	# exporter would otherwise auto-correct a non-`.glb`-suffixed `filepath`
	# back onto one, which would silently defeat the final `os.replace()`.
	tmp_glb_path = os.path.join(out_dir, 'dragonwar.tmp.glb')
	tmp_collision_path = os.path.join(out_dir, 'dragonwar.tmp.collision.json')

	# Build the collision document FULLY IN MEMORY before writing anything to
	# disk at all -- previously the glb was written first, and only THEN did
	# the collision document get built; a failure in between (measured with a
	# real Blender run against a mutated .blend: every validate_*() passed,
	# the glb was written, then the run exited 1 with no collision JSON) left
	# `out_dir` holding a fresh glb beside a stale, mismatched collision file
	# (Review Findings, MED). Any defect in this construction now surfaces
	# before either output path is touched.
	collision_doc = {
		'version': 1,
		'units': 'mm',
		'frame': 'table',
		'reference': {'playfieldMm': dump['reference']['playfieldMm']},
		'nodes': build_collision_nodes(dump),
		'switchZones': build_switch_zones(dump),
		'devices': build_devices(dump),
	}

	# Belt and braces beyond build-before-write: write each artifact to a
	# `.tmp` path first and only `os.replace()` it over the real path once
	# the write itself has fully succeeded, so a mid-write failure (disk
	# full, killed process) can never leave a half-written file at either
	# committed path. `os.replace()` is an atomic rename on every platform
	# this project targets.
	try:
		export_glb(tmp_glb_path, dump)
		with open(tmp_collision_path, 'w', encoding='utf-8') as f:
			json.dump(collision_doc, f, indent=2, sort_keys=True)
			f.write('\n')
		os.replace(tmp_glb_path, out_glb_path)
		os.replace(tmp_collision_path, out_collision_path)
	finally:
		# Best-effort cleanup of any temp file left behind by a failure above
		# -- `out_dir` is `public/assets`, a TRACKED directory, so a stray
		# `.tmp` file is not merely clutter, it is something `git status`
		# would notice.
		# Each removal is individually guarded: an OSError raised INSIDE a
		# `finally` replaces the exception that is already propagating, so a
		# locked or read-only temp file would otherwise hide the real reason
		# the export failed behind a cleanup error (re-review finding).
		for tmp_path in (tmp_glb_path, tmp_collision_path):
			try:
				if os.path.exists(tmp_path):
					os.remove(tmp_path)
			except OSError as cleanup_error:
				print(f'[export.py] warning: could not remove temp file {tmp_path}: {cleanup_error}', file=sys.stderr)

	print(f'[export.py] wrote {out_glb_path}')
	print(f'[export.py] wrote {out_collision_path}')


def main():
	# argv after Blender's own args: with `--python-exit-code`, Blender still
	# passes the FULL argv through to sys.argv; parse_args() finds this
	# script's own `--` separator itself.
	try:
		run(sys.argv)
	except ExportError as err:
		print(f'[export.py] FAILED: {err}', file=sys.stderr)
		sys.exit(1)
	except SystemExit:
		raise
	except Exception as err:  # noqa: BLE001 -- the measured trap: an uncaught exception here exits 0 unless caught
		print(f'[export.py] FAILED (unexpected exception): {err}', file=sys.stderr)
		sys.exit(1)


if __name__ == '__main__':
	main()
