# DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
#
# Story 1.4 -- the ONE-TIME seeding script that built the committed
# assets/src/dragonwar.blend. Run once, headlessly, through Blender 5.2+:
#
#   blender --background --factory-startup --python tools/make-placeholder-blend.py
#
# From the moment assets/src/dragonwar.blend is committed, AD-11 makes the
# `.blend` itself the sole source of truth -- Epic 2 edits it directly in
# Blender's UI. This script is kept afterwards only as the reviewable record
# of how the placeholder was made (a binary .blend is not a reviewable diff)
# and as a way to regenerate a placeholder from nothing; it is NOT a build
# step, and no npm script or CI step runs it (mirrors how Story 1.2 framed
# tools/make-placeholder-glb.mjs, with the difference that this one is
# honest about being one-shot).
#
# Authored entirely in the table frame (AD-10): millimetres-as-metres/1000,
# right-handed, origin bottom-left nearest the player, X right, Y up the
# playfield, Z toward the glass. Geometry is UNPITCHED -- every object's
# rotation is identity; pitch is applied later, only by presentation
# (rotating playfield_root about pivot_pitch) and physics (the gravity
# vector), never baked into a mesh here.
#
# `playfield_root`, `cabinet_root` and `pivot_pitch` are the three, and only
# three, top-level (unparented) objects (epics.md line 437, authoritative
# over AD-11's looser phrasing). Every other object here is parented under
# `playfield_root`, whose own transform is identity at authoring time, so a
# child's LOCAL coordinates equal its TABLE-frame world coordinates directly
# -- this script places every mesh vertex and every empty's `.location`
# straight in table millimetres-as-metres, with no separate object offset,
# which keeps both this script and `tools/export.py`'s world-matrix reduction
# simple and easy to verify by inspection.
#
# Built entirely from `bmesh` + low-level `bpy.data.*` calls, not
# `bpy.ops.*`: operator calls need a window/view-layer context that a
# `--background` invocation does not reliably provide, while the data API
# works identically headless or interactive.

import os

import bpy
import bmesh
from mathutils import Vector

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MM = 1.0 / 1000.0  # table millimetres -> Blender metres (this file's own, one-shot conversion -- NOT sim/table/frames.ts, which owns every *runtime* conversion; this script only ever writes literal metre coordinates once, at seed time)

# ---------------------------------------------------------------------------
# AD-10 reference dimensions (TABLE.reference, src/sim/table/dragonwar.ts).
# ---------------------------------------------------------------------------
PLAYFIELD_W_MM = 514.4
PLAYFIELD_H_MM = 1066.8
FLIPPER_BAT_MM = 79.375  # 3.125 in
BALL_MM = 26.99  # TABLE.reference.ballMm -- Story 1.5's bd_trough eject-pose relocation

WALL_T_MM = 12.0
WALL_H_MM = 50.0
PLAYFIELD_THICKNESS_MM = 19.0
GLASS_Z_MM = 400.0
GLASS_THICKNESS_MM = 10.0

# col_wall_lane's interior (lane-facing) clearance, main-field wall to
# right-perimeter wall. Widened from the original 20 mm (Review Findings,
# HIGH): once tools/export.py's wall reduction preserves real thickness
# instead of a zero-thickness centreline, col_wall_lane's lane-facing face
# becomes real collision geometry rather than being silently absent -- and
# 20 mm is narrower than the 26.99 mm reference ball. 34 mm clears the ball
# with a comfortable margin either side.
LANE_CLEAR_MM = 34.0
LANE_X0_MM = PLAYFIELD_W_MM - LANE_CLEAR_MM - WALL_T_MM  # 468.4 -- main-field-facing edge of col_wall_lane
LANE_WALL_TOP_Y_MM = 950.0  # gap above this lets a launched ball cross into the main field

DRAIN_X0_MM = 200.0
DRAIN_X1_MM = 314.4

# col_lane_deflector -- Story 1.5, provisional placeholder geometry not
# derived from any acceptance criterion (DW-58): the plunger lane has no
# deflector at the top, so a launched ball runs to the top wall and returns
# straight down the lane rather than entering the main field. A triangular
# prism whose hypotenuse runs from low-right to high-left turns a ball
# travelling up the lane toward -x, above LANE_WALL_TOP_Y_MM. Authored with
# an IDENTITY object transform and ANGLED MESH VERTICES (never a rotated
# object) so tools/export.py's validate_col_geometry_reducible() rotation
# guard -- which inspects only the object's world matrix -- still passes.
DEFLECTOR_BASE_Y_MM = 976.0
DEFLECTOR_TOP_Y_MM = 1010.0


def clear_scene():
	for obj in list(bpy.data.objects):
		bpy.data.objects.remove(obj, do_unlink=True)


def new_empty(name, location_mm, parent=None):
	obj = bpy.data.objects.new(name, None)
	obj.location = Vector((location_mm[0] * MM, location_mm[1] * MM, location_mm[2] * MM))
	obj.empty_display_size = 0.05
	obj.rotation_euler = (0.0, 0.0, 0.0)
	bpy.context.scene.collection.objects.link(obj)
	if parent is not None:
		obj.parent = parent
	return obj


def _box_bmesh(min_mm, max_mm):
	bm = bmesh.new()
	x0, y0, z0 = (v * MM for v in min_mm)
	x1, y1, z1 = (v * MM for v in max_mm)
	v000 = bm.verts.new((x0, y0, z0))
	v100 = bm.verts.new((x1, y0, z0))
	v110 = bm.verts.new((x1, y1, z0))
	v010 = bm.verts.new((x0, y1, z0))
	v001 = bm.verts.new((x0, y0, z1))
	v101 = bm.verts.new((x1, y0, z1))
	v111 = bm.verts.new((x1, y1, z1))
	v011 = bm.verts.new((x0, y1, z1))
	faces = [
		(v000, v010, v110, v100),  # -Z (bottom)
		(v001, v101, v111, v011),  # +Z (top)
		(v000, v100, v101, v001),  # -Y
		(v100, v110, v111, v101),  # +X
		(v110, v010, v011, v111),  # +Y
		(v010, v000, v001, v011),  # -X
	]
	for f in faces:
		bm.faces.new(f)
	bm.normal_update()
	return bm


def _prism_bmesh(plan_points_mm, z0_mm, z1_mm):
	"""Extrudes an arbitrary plan-view polygon (`plan_points_mm`, a list of
	`(x, y)` millimetre tuples of any length >= 3, wound in either order --
	`bm.normal_update()` below resolves the final face winding, and the
	physics loader orients every wall edge outward for itself regardless of
	source winding) between two z heights. The angled-footprint counterpart
	to `_box_bmesh()`'s fixed six-sided box: a bottom face, a top face and one
	side quad per polygon edge, built the same low-level bmesh + `bpy.data.*`
	way -- no `bpy.ops.*`, for the same headless-context reason `_box_bmesh()`
	documents."""
	bm = bmesh.new()
	z0 = z0_mm * MM
	z1 = z1_mm * MM
	bottom = [bm.verts.new((x * MM, y * MM, z0)) for x, y in plan_points_mm]
	top = [bm.verts.new((x * MM, y * MM, z1)) for x, y in plan_points_mm]
	bm.faces.new(bottom)
	bm.faces.new(reversed(top))
	count = len(plan_points_mm)
	for i in range(count):
		j = (i + 1) % count
		bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
	bm.normal_update()
	return bm


def new_prism_mesh(name, plan_points_mm, z0_mm, z1_mm, parent=None):
	"""A prism mesh extruded from an arbitrary plan-view polygon -- the
	angled-footprint counterpart to `new_box_mesh()` below, sharing its
	object/mesh-datablock naming convention and creating the same `uv_base`
	UV layer so the two mesh-building paths stay consistent."""
	bm = _prism_bmesh(plan_points_mm, z0_mm, z1_mm)
	mesh = bpy.data.meshes.new(name)
	bm.to_mesh(mesh)
	bm.free()
	mesh.uv_layers.new(name='uv_base')
	obj = bpy.data.objects.new(name, mesh)
	obj.data.name = name
	bpy.context.scene.collection.objects.link(obj)
	if parent is not None:
		obj.parent = parent
	return obj


def new_box_mesh(name, min_mm, max_mm, parent=None, material=None, second_uv=False):
	"""A box mesh, `name` shared by both the object and its mesh datablock
	(verified environment fact: glTF node names come from the object, glTF
	mesh names come from the mesh datablock -- naming both the same keeps the
	exported names predictable)."""
	bm = _box_bmesh(min_mm, max_mm)
	mesh = bpy.data.meshes.new(name)
	bm.to_mesh(mesh)
	bm.free()
	mesh.uv_layers.new(name='uv_base')
	if second_uv:
		mesh.uv_layers.new(name='uv_lightmap')
	if material is not None:
		mesh.materials.append(material)
	obj = bpy.data.objects.new(name, mesh)
	obj.data.name = name
	bpy.context.scene.collection.objects.link(obj)
	if parent is not None:
		obj.parent = parent
	return obj


def set_props(obj, **props):
	for key, value in props.items():
		obj[key] = value


def new_image(name, size=16, rgba=(0.6, 0.6, 0.6, 0.5)):
	"""A small generated image -- AD-11's placeholder allowance ("a small
	generated image is sufficient"); no third-party texture involved."""
	img = bpy.data.images.new(name, width=size, height=size, alpha=True)
	pixels = list(rgba) * (size * size)
	img.pixels = pixels
	img.pack()
	return img


def new_material(name, base_color=(0.55, 0.35, 0.2, 1.0), image=None, alpha_from_image=False):
	mat = bpy.data.materials.new(name)
	mat.use_nodes = True
	tree = mat.node_tree
	bsdf = tree.nodes.get('Principled BSDF')
	bsdf.inputs['Base Color'].default_value = base_color
	if image is not None:
		tex_node = tree.nodes.new('ShaderNodeTexImage')
		tex_node.image = image
		tex_node.label = 'translucency_mask'
		if alpha_from_image:
			tree.links.new(tex_node.outputs['Alpha'], bsdf.inputs['Alpha'])
			mat.blend_method = 'BLEND'
	return mat


def main():
	clear_scene()

	# ---- The three, and only three, top-level nodes (epics.md line 437) ----
	playfield_root = new_empty('playfield_root', (0, 0, 0))
	cabinet_root = new_empty('cabinet_root', (0, 0, 0))
	# The physical tilt hinge: the playfield's bottom-front edge, centred on X.
	pivot_pitch = new_empty('pivot_pitch', (PLAYFIELD_W_MM / 2, 0, 0))
	# cabinet_root carries no children this story (nothing cabinet-mounted is
	# in scope yet); referenced so linters do not flag it as unused.
	_ = cabinet_root

	# ---- Materials -----------------------------------------------------
	translucency_img = new_image('img_playfield_translucency')
	mat_playfield = new_material(
		'mat_playfield', base_color=(0.45, 0.30, 0.15, 1.0), image=translucency_img, alpha_from_image=True,
	)
	mat_insert = new_material('mat_insert', base_color=(0.9, 0.9, 0.95, 1.0))

	# ---- col_playfield: plane shape, real thickness, full reference dims ----
	col_playfield = new_box_mesh(
		'col_playfield',
		(0, 0, -PLAYFIELD_THICKNESS_MM), (PLAYFIELD_W_MM, PLAYFIELD_H_MM, 0),
		parent=playfield_root,
	)
	set_props(
		col_playfield,
		col_shape='plane', col_normal_z=1, surface='wood', phys_material='default',
	)

	# ---- col_glass: plane shape, facing down, above the whole playfield ----
	col_glass = new_box_mesh(
		'col_glass',
		(0, 0, GLASS_Z_MM), (PLAYFIELD_W_MM, PLAYFIELD_H_MM, GLASS_Z_MM + GLASS_THICKNESS_MM),
		parent=playfield_root,
	)
	set_props(col_glass, col_shape='plane', col_normal_z=-1, surface='glass', phys_material='default')

	# ---- Perimeter + plunger-lane walls, wall shape, with a drain gap ----
	walls = [
		('col_wall_left', (-WALL_T_MM, 0, 0), (0, PLAYFIELD_H_MM, WALL_H_MM)),
		('col_wall_top', (0, PLAYFIELD_H_MM, 0), (PLAYFIELD_W_MM, PLAYFIELD_H_MM + WALL_T_MM, WALL_H_MM)),
		('col_wall_right', (PLAYFIELD_W_MM, 0, 0), (PLAYFIELD_W_MM + WALL_T_MM, PLAYFIELD_H_MM, WALL_H_MM)),
		('col_wall_lane', (LANE_X0_MM, 0, 0), (LANE_X0_MM + WALL_T_MM, LANE_WALL_TOP_Y_MM, WALL_H_MM)),
		('col_wall_bottom_l', (-WALL_T_MM, -WALL_T_MM, 0), (DRAIN_X0_MM, 0, WALL_H_MM)),
		('col_wall_bottom_r', (DRAIN_X1_MM, -WALL_T_MM, 0), (LANE_X0_MM, 0, WALL_H_MM)),
		('col_wall_lane_bottom', (LANE_X0_MM, -WALL_T_MM, 0), (PLAYFIELD_W_MM + WALL_T_MM, 0, WALL_H_MM)),
	]
	for name, min_mm, max_mm in walls:
		wall = new_box_mesh(name, min_mm, max_mm, parent=playfield_root)
		set_props(wall, col_shape='wall', surface='wood', phys_material='default')

	# ---- col_lane_deflector: angled triangular prism at the top of the
	# plunger lane (Story 1.5, provisional placeholder geometry not derived
	# from any acceptance criterion -- DW-58). Identity transform, angled MESH
	# vertices -- see this file's constants block above for why. The
	# hypotenuse runs from high-left (LANE_X0_MM + WALL_T_MM, DEFLECTOR_TOP_Y_MM
	# -- the lower x, higher y point) to low-right (PLAYFIELD_W_MM,
	# DEFLECTOR_BASE_Y_MM -- the higher x, lower y point; review finding
	# 2026-08-28 corrected this comment's labels, which had both points
	# backwards -- the constants block above already had it right: "low-right
	# to high-left"), turning a ball travelling up the lane (+Y) toward -X,
	# into the main field. ----
	col_lane_deflector = new_prism_mesh(
		'col_lane_deflector',
		[
			(LANE_X0_MM + WALL_T_MM, DEFLECTOR_TOP_Y_MM),
			(PLAYFIELD_W_MM, DEFLECTOR_BASE_Y_MM),
			(PLAYFIELD_W_MM, DEFLECTOR_TOP_Y_MM),
		],
		0.0, WALL_H_MM,
		parent=playfield_root,
	)
	set_props(col_lane_deflector, col_shape='wall', surface='wood', phys_material='default')

	# ---- Flippers: box shape, axis-aligned so their bounding box is exactly
	# the authored bat length (unpitched, no rotation) ----
	flipper_y0, flipper_y1 = 57.5, 82.5
	flipper_z0, flipper_z1 = 0.0, 20.0
	left_pivot_x = 170.0
	right_pivot_x = PLAYFIELD_W_MM - left_pivot_x
	col_flipper_l = new_box_mesh(
		'col_flipper_l',
		(left_pivot_x, flipper_y0, flipper_z0), (left_pivot_x + FLIPPER_BAT_MM, flipper_y1, flipper_z1),
		parent=playfield_root,
	)
	set_props(col_flipper_l, col_shape='box', surface='flipper', phys_material='flipper_rubber')
	col_flipper_r = new_box_mesh(
		'col_flipper_r',
		(right_pivot_x - FLIPPER_BAT_MM, flipper_y0, flipper_z0), (right_pivot_x, flipper_y1, flipper_z1),
		parent=playfield_root,
	)
	set_props(col_flipper_r, col_shape='box', surface='flipper', phys_material='flipper_rubber')

	# ---- Switch zones: box shape, paired with their TABLE switch ----
	sw_shooter_lane = new_box_mesh(
		'sw_shooter_lane', (LANE_X0_MM + WALL_T_MM + 4, 10, 0), (PLAYFIELD_W_MM - 4, 60, 30),
		parent=playfield_root,
	)
	set_props(sw_shooter_lane, col_shape='box', switch='s_shooter_lane', surface='metal', phys_material='default')

	# Story 1.5 (DW-58): retiled as four CONTIGUOUS boxes spanning the full
	# drain aperture (DRAIN_X0_MM..DRAIN_X1_MM), rather than four narrower
	# islands with gaps between them -- the original tiling covered only 64 mm
	# of the 114.4 mm aperture in four disconnected 16 mm-wide islands, and a
	# measured sweep of drain crossings missed three of five. The y extent
	# also widened, from -80..-40 to -80..0 (review finding 2026-08-28 asked
	# for this to be explained here, not only in the spec's own planning
	# notes): the upper bound now sits exactly at y = 0, the drain wall's own
	# inner face (col_wall_bottom_l/_r span y in [-12, 0]), so a ball crossing
	# the aperture at y = 0 is caught immediately rather than only after
	# falling a further 40 mm past the wall -- this is the same "zero misses
	# across a 0.5 mm sweep" figure the x-retiling above was measured against.
	# Provisional placeholder geometry, not derived from any acceptance
	# criterion.
	trough_switch_names = ['s_trough_1', 's_trough_2', 's_trough_3', 's_trough_4']
	trough_slot_w_mm = (DRAIN_X1_MM - DRAIN_X0_MM) / len(trough_switch_names)  # 28.6 mm
	for i, switch_name in enumerate(trough_switch_names):
		slot_x0 = DRAIN_X0_MM + i * trough_slot_w_mm
		slot_x1 = DRAIN_X0_MM + (i + 1) * trough_slot_w_mm
		sw = new_box_mesh(
			f'sw_trough_{i + 1}', (slot_x0, -80, 0), (slot_x1, 0, 20),
			parent=playfield_root,
		)
		set_props(sw, col_shape='box', switch=switch_name, surface='metal', phys_material='default')

	# ---- Ball devices: empties at their authored eject pose ----
	# bd_trough -- Story 1.5 (DW-51, DW-58): relocated from the original
	# (255, -60, 10) -- squarely inside the drain gap, where the ejected ball
	# could never reach sw_shooter_lane at any speed (measured during
	# planning) -- to the shooter-lane foot, the same resting pose a served
	# ball settles at. Provisional placeholder geometry, not derived from any
	# acceptance criterion; expressed from the existing named constants.
	BD_TROUGH_EJECT_X_MM = LANE_X0_MM + WALL_T_MM + LANE_CLEAR_MM / 2  # 497.4
	BD_TROUGH_EJECT_Y_MM = 20.0
	BD_TROUGH_EJECT_Z_MM = BALL_MM / 2  # 13.495
	bd_trough = new_empty(
		'bd_trough', (BD_TROUGH_EJECT_X_MM, BD_TROUGH_EJECT_Y_MM, BD_TROUGH_EJECT_Z_MM), parent=playfield_root,
	)
	bd_trough.rotation_euler = (0.0, 0.0, 0.0)  # local +Y is the eject direction: (0, 1, 0)

	bd_shooter = new_empty('bd_shooter', (498.0, 35.0, 13.0), parent=playfield_root)
	bd_shooter.rotation_euler = (0.0, 0.0, 0.0)  # local +Y is the eject direction: (0, 1, 0)

	# ---- vis_playfield: the one `vis_` placeholder mesh (visible geometry) ----
	vis_playfield = new_box_mesh(
		'vis_playfield', (0, 0, -1.0), (PLAYFIELD_W_MM, PLAYFIELD_H_MM, 0.0),
		parent=playfield_root, material=mat_playfield, second_uv=True,
	)
	set_props(vis_playfield, lightgroup='lg_playfield')

	# ---- l_insert_left: ONE object, lens + cup geometry joined, ONE material
	# slot (AD-11: "one material each") ----
	lens_bm = _box_bmesh((249.0, 492.0, -1.0), (265.0, 508.0, 0.5))
	cup_bm = _box_bmesh((247.0, 490.0, -7.0), (267.0, 510.0, -1.0))
	# Merge cup_bm's geometry into lens_bm via an explicit vertex map -- BMesh
	# vertex `.index` is stale (0 for every fresh vert) until an explicit
	# `index_update()`, so mapping by BMVert object identity is the robust way
	# to carry cup_bm's faces over onto the new verts (measured: an
	# index-based join here raised "found the same (BMVert) used multiple
	# times", every new vert's stale index reading 0).
	vert_map = {v: lens_bm.verts.new(v.co) for v in cup_bm.verts}
	for f in cup_bm.faces:
		lens_bm.faces.new([vert_map[v] for v in f.verts])
	cup_bm.free()
	lens_bm.normal_update()
	insert_mesh = bpy.data.meshes.new('l_insert_left')
	lens_bm.to_mesh(insert_mesh)
	lens_bm.free()
	insert_mesh.uv_layers.new(name='uv_base')
	insert_mesh.uv_layers.new(name='uv_lightmap')
	insert_mesh.materials.append(mat_insert)
	l_insert_left = bpy.data.objects.new('l_insert_left', insert_mesh)
	l_insert_left.data.name = 'l_insert_left'
	bpy.context.scene.collection.objects.link(l_insert_left)
	l_insert_left.parent = playfield_root
	set_props(l_insert_left, lightgroup='lg_inserts')

	# ---- Presentation selection (Design Notes, "What goes into the glb"):
	# the three roots, vis_playfield, l_insert_left, bd_trough, bd_shooter.
	# col_/sw_ nodes are excluded -- collision scaffolding, never rendered. ----
	for obj in bpy.data.objects:
		obj.select_set(False)
	presentation_objects = [
		playfield_root, cabinet_root, pivot_pitch,
		vis_playfield, l_insert_left, bd_trough, bd_shooter,
	]
	for obj in presentation_objects:
		obj.select_set(True)
	bpy.context.view_layer.objects.active = playfield_root

	# Purge anything left over from Blender's own factory-startup scene (e.g.
	# an unused default material datablock orphaned by clear_scene(), which
	# only unlinks OBJECTS) so the committed file holds nothing but what this
	# script authored.
	bpy.ops.outliner.orphans_purge(do_recursive=True)

	# Resolved relative to THIS script's own repository, not Blender's default
	# startup cwd or `//` (which resolves relative to the .blend being saved --
	# meaningless on a from-scratch run where that file does not exist yet).
	out_path = os.path.join(REPO_ROOT, 'assets', 'src', 'dragonwar.blend')
	bpy.ops.wm.save_as_mainfile(filepath=out_path, compress=True)
	print(f'[make-placeholder-blend] wrote {out_path}')


if __name__ == '__main__':
	main()
