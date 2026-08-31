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

import math
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

# ---------------------------------------------------------------------------
# Story 2.1a -- the drain triangle: both outlanes, both inlanes, the
# inlane/outlane divider guides, the inlane's own outer guide (the one that
# closes each flipper's cradle-pocket throat) and a rubber post at every
# guide's free end (DW-72, DW-77, DW-78). Authored from the reference
# dimensions alone -- no Bally template, PRD OQ-6 -- and from the flipper
# mover's own derived geometry (never a second, independently invented
# figure).
#
# The pocket closes at the bat's TIP, not its pivot -- this story's own
# physics probes (not merely derived by inspection) found the pivot end
# unusable: `hitCircleBase` is a FULL CIRCLE of radius `baseRadius`, always
# centred at the pivot regardless of stroke angle, so any post close enough
# to catch a ball there combines with that angle-invariant circle into a
# permanent geometric trap -- the ball never left even after the flipper
# mover's own angle genuinely returned to rest, which fails AC 2's negative
# control ("the same arrangement with the key released reaches bd_trough")
# outright. The bat's TIP -- its end circle, radius `endRadius`, centred
# `flipperRadius` from the pivot -- genuinely SWEEPS with the stroke: at the
# raised end-of-stroke angle its outer edge reaches `flipperRadius +
# endRadius` from the pivot (matching the committed box's own tip edge
# exactly); at rest it swings well clear. A post placed just past that
# raised-angle reach, verified against the swept envelope by hand from the
# same atan2(dx, -dy) convention `flipper-config.ts`'s header documents, can
# only ever meet the tip circle AT the raised angle, never the pivot's own
# fixed base circle and never the swinging arm at any other angle.
# ---------------------------------------------------------------------------
GUIDE_T_MM = WALL_T_MM  # divider-guide wall thickness -- matches every other authored wall
OUTER_GUIDE_T_MM = 6.0  # the TIP-side outer guide is deliberately thinner than GUIDE_T_MM: it sits inside the reconciled 40.65 mm tip gap between the two raised bats (DW-78), and that gap must stay clear enough for a ball to pass even with both flippers held (this story's own centre-drain acceptance case) -- see POST_RADIUS_MM/POCKET_OFFSET_ALONG_MM's own note for the shared clearance budget.
OUTLANE_WIDTH_MM = 34.9  # authored, unverified -- see src/sim/table/tuning.ts's outlaneWidthLeftMm/outlaneWidthRightMm for the full provenance note (geometry-r2-1.md's low-confidence 1-3/8 in figure, adopted symmetrically for both sides)
POST_RADIUS_MM = 4.0  # placeholder rubber-post radius. Deliberately SMALLER than a typical real post (which runs 12-16 mm across the rubber sleeve): this same radius closes the pivot-side divider guide's own free ends AND the tip-side pocket, and the pocket sits inside the reconciled 40.65 mm tip gap (DW-78) -- verified this story's own planning pass: with POCKET_OFFSET_ALONG_MM below, the two tip-side posts leave 40.65 - 2*1 - 2*4 = 30.65 mm of clear surface-to-surface gap between them, comfortably above the 26.99 mm reference ball, so a centre-aimed ball still passes with both flippers raised.
GUIDE_Y_TOP_MM = 420.0  # this story's own placeholder guide extent -- Story 2.1b draws the rest of the shot map above this
DIVIDER_Y_BOTTOM_MM = 120.0  # the outlane/inlane divider guide's own (higher, less pocket-critical) lower end
POCKET_OFFSET_ALONG_MM = 1.0  # pocket post centre, offset from the bat's own TIP further toward playfield centre (this story's own physics probes: the pivot end's base circle is angle-invariant and traps a ball regardless of stroke, so the pocket closes at the tip instead -- see add_drain_triangle_side()'s own doc comment). Kept small, together with the reduced POST_RADIUS_MM above, so the two posts never narrow the reconciled tip gap below the reference ball's own diameter.
POCKET_OFFSET_UP_MM = 24.0  # pocket post centre, offset from the pivot's own y (flipper centreline) UP-TABLE (away from the drain)

# ---------------------------------------------------------------------------
# Story 2.1a task 22 (DW-119): the below-deck outlane return channel. Both
# outlanes used to dead-end on col_wall_bottom_l/_r -- a ball released there
# came to rest against the wall and stayed (measured: parked one ball radius
# above y = 0), because gravity here has no X-component at all, only Y and Z
# (the table's pitch axis), so nothing ever pushed it sideways toward the
# drain aperture without a wall to redirect it.
#
# A real machine solves this by dropping the outlane ball through the
# playfield into a subway that delivers it to the same trough the centre
# drain feeds -- the flippers physically occupy the direct on-deck path from
# an outlane to centre, so going under is the only route that does not
# require moving the flippers or the drain aperture. This is modelled the
# same way: col_wall_bottom_l/_r each open a gap EXACTLY as wide as the
# outlane above them, no wider (see the wall table below -- widening it any
# further removes wall coverage from the CENTRE/inlane area a ball can rest
# on during ordinary, unrelated gameplay, reproduced directly this task's
# own implementation pass: a first attempt that widened the gap broke an
# existing golden replay whose ball rests well outside the true outlane's
# own width). A single rail per side (add_outlane_return_channel()), on the
# side of the gap TOWARD the true perimeter, picks the ball up on the far
# side of that gap and walks it into the SAME untouched
# DRAIN_X0_MM..DRAIN_X1_MM aperture the centre drain already uses -- never a
# new hole, never a moved trough zone.
#
# Getting here took three rejected designs, all found empirically this
# task's own implementation pass, not by inspection:
#
# (1) A single straight rail alone. col_wall_bottom_l/_r's own face
# (unwidened, right at the true outlane boundary) is reachable by a ball's
# CENTRE anywhere within one ball radius (~13.5 mm) of that face in X, for
# ANY Y within one ball radius of that wall's OWN y in [-12, 0] -- i.e. Y
# roughly in [-25.5, +13.5], not merely [-12, 0], because the ball's own
# body extends a radius past its centre. A rail shallow enough to also
# reach the drain aperture within the trough zones' own y budget (~68 mm
# over ~200 mm of X) does not clear that widened Y reach before its own X
# has already carried the ball into the wall's X reach -- the ball settles
# into a genuine resting GRAZE simultaneously against BOTH faces (near-zero
# relative velocity, a real two-wall pinch, not "a shallow wall alone") and
# never reaches the rest of the channel. Reproduced directly: the identical
# lock persisted, at the identical table position, regardless of the rail's
# own slope, including a manifestly steep 45 deg one -- proving the shallow
# angle itself was never the defect. A diagnostic (col_wall_bottom_l's face
# temporarily moved out of reach, the same shallow rail re-tested in
# isolation) confirmed it carries the ball to the aperture cleanly once
# nothing else is nearby -- the fix therefore had to remove that face from
# reach, not out-race it. add_bottom_wall_trapezoid() (below) does exactly
# that, chamfering col_wall_bottom_l/_r's own inner corner away from the
# outlane by BOTTOM_SWEEP_MM.
#
# (2) A SECOND, parallel rail added on the centre side, to "fully enclose"
# the ball -- rejected twice over. A steep (45 deg) shared entrance shrinks
# the two rails' own PERPENDICULAR interior width to
# OUTLANE_WIDTH_MM * cos(entrance angle), 24.68 mm at 45 deg: narrower than
# the 26.99 mm reference ball itself, physically impossible to pass through
# (reproduced directly: wedged at the entrance's own start corner). A wider,
# funnelled second rail (starting wide of the first, narrowing to the exit)
# fixed THAT, but a ball on the first rail's own face was then, at some
# point along the run, always within one ball radius of the second rail's
# own corner or back edge too (both rails are convex QUADS, not bare lines
# -- add_channel_rail()'s own thickness, offset straight down, still puts a
# second real corner within reach at certain angles) -- a genuine two-wall
# pinch again, just between this story's OWN two rails rather than against
# col_wall_bottom_l/_r. Reproduced at three different attempted offsets,
# each relocating the identical pinch rather than removing it.
#
# The design that actually ships is (1) alone, once (2)'s own chamfer
# removes the one nearby surface a lone rail's own face could ever pinch
# against: a SINGLE rail, bent once (KNEE_DROP_MM below) to clear
# col_wall_bottom_l/_r's own remaining, unavoidable TOP corner too (the one
# add_bottom_wall_trapezoid()'s chamfer cannot move, since it still blocks
# an on-deck ball crossing y = 0 outside the outlane). No second rail
# "fully encloses" the ball, so its exit X is verified empirically (this
# story's own AC 7 routing test) rather than guaranteed by construction --
# sanctioned by this task's own text ("the mechanism is yours to choose").
#
# BOTTOM_SWEEP_MM: how far col_wall_bottom_l/_r's own bottom (y = -WALL_T_MM)
# inner corner sweeps away from the outlane, versus its TOP (y = 0) inner
# corner, turning that wall's inner edge from a vertical face into a
# diagonal one -- see add_bottom_wall_trapezoid()'s own doc comment for the
# full mechanism this closes. Sized with margin past the rail's own knee
# (KNEE_DROP_MM below, whose own corner reaches ~55 mm from the true
# perimeter): 90 mm keeps col_wall_bottom_l/_r's own bottom-inner corner
# (34.9 + 90 = 124.9 mm on the left; the mirror image on the right) on the
# FAR side of the rail's own knee corner, so the two never geometrically
# overlap -- confirmed directly against the exported collision document,
# not by inspection alone.
BOTTOM_SWEEP_MM = 90.0

# CHANNEL_Y_END_MM sits comfortably inside the trough zones' own Y range
# (-80..0, sw_trough_1..4), far short of -80, so the ball's X has already
# caught up to the aperture long before its Y could run past that box.
# CHANNEL_LEFT_X_END_MM/CHANNEL_RIGHT_X_END_MM (each rail's own exit X) sit
# inside the aperture as a whole (200..314.4). Both, like DRAIN_X0_MM/
# LANE_CLEAR_MM above, are authored placeholder figures, not derived from
# any acceptance criterion.
CHANNEL_Y_END_MM = -75.0
CHANNEL_LEFT_X_END_MM = 205.0
CHANNEL_RIGHT_X_END_MM = 304.9

# KNEE_DROP_MM: how far (in both X and Y -- a 45 deg knee, matching the
# proven col_lane_deflector's own angle) the rail's first segment runs
# before bending to the shallow angle used for the rest of the channel --
# see the constants block's own rejected-design (1) above for why a bend is
# needed at all. 55 mm puts col_wall_bottom_l/_r's own unavoidable
# TOP-inner corner (34.9 mm from the true perimeter, at y = 0) well over
# two ball radii (26.99 mm) from the rail's own first-segment line, so no
# point on that segment's own face can be within one ball radius of the
# corner at the same time.
KNEE_DROP_MM = 55.0


def octagon_points_mm(center_mm, radius_mm):
	"""Eight plan-view points approximating a circular post -- convex by
	construction (every interior angle is 135 deg), the placeholder shape for
	every rubber post this story authors."""
	cx, cy = center_mm
	return [
		(cx + radius_mm * math.cos(i * math.pi / 4), cy + radius_mm * math.sin(i * math.pi / 4))
		for i in range(8)
	]


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
		('col_wall_lane_bottom', (LANE_X0_MM, -WALL_T_MM, 0), (PLAYFIELD_W_MM + WALL_T_MM, 0, WALL_H_MM)),
	]
	for name, min_mm, max_mm in walls:
		wall = new_box_mesh(name, min_mm, max_mm, parent=playfield_root)
		set_props(wall, col_shape='wall', surface='wood', phys_material='default')

	# Story 2.1a task 22 (DW-119): col_wall_bottom_l/_r -- a gap exactly as
	# wide as the outlane directly above it, no wider (this file's own
	# Story 2.1a task-22 constants block explains why not: widening it
	# removes wall coverage a ball can rest on during ordinary gameplay well
	# outside the true outlane, reproduced directly this task's own
	# implementation pass). Each is now a TRAPEZOID, not a box: its TOP edge
	# (y = 0) still runs the full OUTLANE_WIDTH_MM..DRAIN_X0_MM span, exactly
	# preserving what it always blocked on-deck, but its INNER (outlane-side)
	# edge sweeps BOTTOM_SWEEP_MM further away from the outlane as it
	# descends to y = -WALL_T_MM, so its own vertical face -- which a ball
	# descending the return channel used to be able to reach (within one
	# ball radius in X, for any Y within one ball radius of this wall's own
	# y range -- i.e. well past y = -WALL_T_MM alone) and settle into a
	# genuine resting graze against -- no longer exists anywhere near the
	# channel at all. Found and verified this task's own implementation
	# pass: a two-segment channel rail that instead tried to simply
	# out-race this wall's OLD vertical face (a steep entrance dropping
	# clear of it before turning shallow) still failed for a release close
	# enough to the wall already at drop time (the ball never needs to
	# travel through the channel's own redirect to reach the wall's old
	# reach at all) -- removing the reachable face itself, not merely
	# out-running it, is what actually closes the defect.
	def add_bottom_wall_trapezoid(name, inner_x_mm, outer_x_mm, sweep_toward_mm):
		top_inner = (inner_x_mm, 0.0)
		top_outer = (outer_x_mm, 0.0)
		bottom_outer = (outer_x_mm, -WALL_T_MM)
		bottom_inner = (inner_x_mm + sweep_toward_mm, -WALL_T_MM)
		wall = new_prism_mesh(name, [top_inner, top_outer, bottom_outer, bottom_inner], 0.0, WALL_H_MM, parent=playfield_root)
		set_props(wall, col_shape='wall', surface='wood', phys_material='default')
		return wall

	add_bottom_wall_trapezoid('col_wall_bottom_l', OUTLANE_WIDTH_MM, DRAIN_X0_MM, BOTTOM_SWEEP_MM)
	add_bottom_wall_trapezoid('col_wall_bottom_r', LANE_X0_MM - OUTLANE_WIDTH_MM, DRAIN_X1_MM, -BOTTOM_SWEEP_MM)

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
	# the authored bat length (unpitched, no rotation). Story 2.1a (DW-78):
	# the box is the WHOLE rubbered bat (FR-4, "3.125 in rubbered"), so it is
	# authored to extend BASE_RADIUS_MM beyond each pivot instead of ending
	# exactly at it -- the pivot sits one baseRadius in from the box's outer
	# end, matching the modelled collision body (a baseRadius circle at the
	# pivot + a flipperRadius arm + an endRadius tip) exactly, instead of the
	# base circle protruding behind authored geometry. The pivot's own
	# table-frame position (left 170.0, right 344.4) is UNCHANGED -- only the
	# box moves outward around it, which is also why the pivot SPACING here
	# stays 174.4 mm, inside the only sourced placement figure (173.0-177.8
	# mm). See src/sim/physics/loader/index.ts's loadFlipper() and this
	# story's spec Design Notes, "Why the box is the fixed side of DW-78". ----
	flipper_y0, flipper_y1 = 57.5, 82.5
	flipper_z0, flipper_z1 = 0.0, 20.0
	BASE_RADIUS_MM = (flipper_y1 - flipper_y0) / 2  # 12.5 -- half the bat's own width, the pivot's own base-circle radius
	left_pivot_x = 170.0
	right_pivot_x = PLAYFIELD_W_MM - left_pivot_x
	col_flipper_l = new_box_mesh(
		'col_flipper_l',
		(left_pivot_x - BASE_RADIUS_MM, flipper_y0, flipper_z0),
		(left_pivot_x - BASE_RADIUS_MM + FLIPPER_BAT_MM, flipper_y1, flipper_z1),
		parent=playfield_root,
	)
	set_props(col_flipper_l, col_shape='box', surface='flipper', phys_material='flipper_rubber')
	col_flipper_r = new_box_mesh(
		'col_flipper_r',
		(right_pivot_x + BASE_RADIUS_MM - FLIPPER_BAT_MM, flipper_y0, flipper_z0),
		(right_pivot_x + BASE_RADIUS_MM, flipper_y1, flipper_z1),
		parent=playfield_root,
	)
	set_props(col_flipper_r, col_shape='box', surface='flipper', phys_material='flipper_rubber')

	# ---- The drain triangle (Story 2.1a): both outlanes, both inlanes, the
	# divider guide between them, the outer guide that closes each flipper's
	# cradle-pocket throat, and a rubber post at every guide's free end. See
	# this file's constants block above for the derivation of every figure
	# here. `flipper_y_mid` is the flipper centreline both bats already share
	# (57.5..82.5), read once rather than repeating the literal. ----
	flipper_y_mid = (flipper_y0 + flipper_y1) / 2  # 70.0

	def add_guide_wall(name, x0, x1, y0, y1):
		wall = new_prism_mesh(name, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], 0.0, WALL_H_MM, parent=playfield_root)
		set_props(wall, col_shape='wall', surface='plastic', phys_material='default')
		return wall

	def add_rubber_post(name, center_mm):
		post = new_prism_mesh(name, octagon_points_mm(center_mm, POST_RADIUS_MM), 0.0, WALL_H_MM, parent=playfield_root)
		set_props(post, col_shape='wall', surface='rubber_post', phys_material='default')
		return post

	def add_channel_rail(name, p0, p1, thickness_mm):
		"""A single thin wall whose collision edge runs exactly along the line
		p0 -> p1, extending thickness_mm further STRAIGHT DOWN (more
		negative Y, deeper below the visible playfield) rather than
		perpendicular to the line. The shallow (well under 45 deg) segments
		this file authors have a perpendicular that points mostly STRAIGHT
		UP -- offsetting that way would push the wall's own far corner back
		above its own start Y, risking overlap with whatever sits just
		above it (confirmed by inspecting the exported collision document
		for an earlier, perpendicular-offset attempt, not merely by
		inspection of the authoring code). Downward-only offsetting keeps
		the whole wall at or below the line's own y at every point, so it
		can only ever touch a neighbour at a single shared corner, never
		overlap it -- and the ball only ever meets the p0->p1 edge itself
		(export.py's wall reduction turns every footprint edge into its own
		oriented collision line, so which way the "back" of the quad
		extends does not change what the FRONT edge blocks). Always a plane
		quadrilateral (a rectangle, since the offset is a constant vector)
		-- convex by construction, the same identity-transform/angled-mesh-
		vertices technique as every other angled wall this file authors
		(col_lane_deflector, task 22's own rationale block above). NOTE:
		this rail alone does not prevent a ball from RESTING against
		col_wall_bottom_l/_r's own face in a genuine, near-stationary graze
		-- that is what add_bottom_wall_trapezoid()'s own chamfer (this
		file's Story 2.1a task-22 constants block, BOTTOM_SWEEP_MM) exists
		to rule out; see its own comment for the mechanism, found and
		verified this task's own implementation pass by direct
		perpendicular-distance measurement against every nearby edge, not
		by assumption."""
		outer0 = (p0[0], p0[1] - thickness_mm)
		outer1 = (p1[0], p1[1] - thickness_mm)
		wall = new_prism_mesh(name, [p0, p1, outer1, outer0], 0.0, WALL_H_MM, parent=playfield_root)
		set_props(wall, col_shape='wall', surface='plastic', phys_material='default')
		return wall

	def add_outlane_return_channel(side, points):
		"""Story 2.1a task 22 (DW-119) -- see this file's own constants block
		("the below-deck outlane return channel") for the full rationale,
		including the two rejected designs (a second, parallel rail among
		them) this single rail replaces. `points` is a list of 2+ (x, y)
		waypoints; one rail segment (add_channel_rail()) is authored between
		every consecutive pair, so the rail can bend -- here, exactly once
		(KNEE_DROP_MM), to clear col_wall_bottom_l/_r's own unavoidable TOP
		corner. A single rail does not "fully enclose" the ball the way a
		matched pair would, so its exit X is verified empirically (this
		story's own AC 7 routing test), not guaranteed by construction --
		see the constants block's own note on why that is the sanctioned
		choice here."""
		for i in range(len(points) - 1):
			name = f'col_channel_{side}' if len(points) == 2 else f'col_channel_{side}_{i + 1}'
			add_channel_rail(name, points[i], points[i + 1], GUIDE_T_MM)

	def add_drain_triangle_side(side, tip_x, outlane_outer_wall_x, outlane_toward_wall):
		"""`outlane_toward_wall` is +1 if the outlane's outer wall sits at a
		HIGHER x than the outlane itself (the right side, against
		col_wall_lane's main-field face), else -1 (the left side, against
		col_wall_left's interior face). `toward_centre_sign` is the direction,
		from the bat's own TIP, that points further toward the playfield
		centre -- verified empirically (this story's own physics probes, not
		merely derived by inspection): the base circle at the PIVOT is
		angle-invariant (always present, full circle, regardless of stroke
		position), so a post placed close enough to combine with it forms a
		permanent trap that a held/released comparison can never
		discriminate -- AC 2's own negative control ("the same arrangement
		with the key released reaches bd_trough") would never pass. The pivot
		END of the bat is therefore the WRONG side to close (Design Notes,
		"Why the pocket closes at the tip, not the pivot"). The TIP end's
		circle, by contrast, genuinely MOVES with the stroke (it sweeps from
		the bat's own raised position, at radius flipperRadius + endRadius
		from the pivot, down to its rest position well clear of this post) --
		closing the throat there makes the pocket exist only while the flipper
		actually holds it shut."""
		toward_centre_sign = 1.0 if side == 'l' else -1.0

		# Divider guide: separates the outlane (against outlane_outer_wall_x)
		# from the inlane. Its outlane-facing face sits OUTLANE_WIDTH_MM
		# (src/sim/table/tuning.ts's outlaneWidthLeftMm/outlaneWidthRightMm)
		# from that wall.
		divider_face_x = outlane_outer_wall_x - outlane_toward_wall * OUTLANE_WIDTH_MM
		if outlane_toward_wall > 0:
			divider_x0, divider_x1 = divider_face_x - GUIDE_T_MM, divider_face_x
		else:
			divider_x0, divider_x1 = divider_face_x, divider_face_x + GUIDE_T_MM
		add_guide_wall(f'col_guide_divider_{side}', divider_x0, divider_x1, DIVIDER_Y_BOTTOM_MM, GUIDE_Y_TOP_MM)
		divider_cx = (divider_x0 + divider_x1) / 2
		add_rubber_post(f'col_post_divider_{side}_lo', (divider_cx, DIVIDER_Y_BOTTOM_MM))
		add_rubber_post(f'col_post_divider_{side}_hi', (divider_cx, GUIDE_Y_TOP_MM))

		# Outer guide: the inlane's own inner boundary, running down to close
		# the cradle pocket's throat just past the flipper's TIP (DW-72) --
		# see this function's own doc comment for why the tip, not the pivot.
		# Offset from the bat's own committed tip (tip_x, the box's own inner
		# edge) further toward the playfield centre and up-table, into the
		# quadrant the swept end circle's own maximum reach (radius
		# flipperRadius + endRadius from the pivot, reached only at the
		# raised end-of-stroke angle) never crosses -- verified this story's
		# own planning pass, not merely asserted.
		pocket_post_x = tip_x + toward_centre_sign * POCKET_OFFSET_ALONG_MM
		pocket_post_y = flipper_y_mid + POCKET_OFFSET_UP_MM
		outer_x0 = pocket_post_x - OUTER_GUIDE_T_MM / 2
		outer_x1 = pocket_post_x + OUTER_GUIDE_T_MM / 2
		add_guide_wall(f'col_guide_outer_{side}', outer_x0, outer_x1, pocket_post_y, GUIDE_Y_TOP_MM)
		add_rubber_post(f'col_post_pocket_{side}', (pocket_post_x, pocket_post_y))
		add_rubber_post(f'col_post_outer_{side}_hi', (pocket_post_x, GUIDE_Y_TOP_MM))

	# Left: outlane measured from col_wall_left's interior face (x = 0); tip
	# is the box's own inner edge (nearer the playfield centre).
	add_drain_triangle_side('l', left_pivot_x - BASE_RADIUS_MM + FLIPPER_BAT_MM, 0.0, -1.0)
	# Right: outlane measured from col_wall_lane's main-field face (x =
	# LANE_X0_MM) -- the plunger lane already claims the space between that
	# wall and the true right perimeter wall, so the right outlane sits
	# inboard of it rather than mirroring the left side's true-perimeter
	# anchor (this story's spec Design Notes explain the asymmetry).
	add_drain_triangle_side('r', right_pivot_x + BASE_RADIUS_MM - FLIPPER_BAT_MM, LANE_X0_MM, 1.0)

	# Story 2.1a task 22 (DW-119): the below-deck return channel that makes
	# each outlane actually reach bd_trough -- see the constants block above
	# ("the below-deck outlane return channel") for the rationale and the
	# two rejected designs (a second, parallel rail among them) this single-
	# rail-per-side shape replaces. Each rail bends once, KNEE_DROP_MM short
	# in both X and Y (steep enough -- dx = dy, the same 45 deg
	# col_lane_deflector's own proven deflector already uses -- that
	# col_wall_bottom_l/_r's own unavoidable TOP corner clears two ball
	# radii from this first segment's own line, so no point on the rail's
	# own face can be within one ball radius of that corner at the same
	# time), then continues at the SAME shallow angle used throughout this
	# file, proven safe in isolation once nothing else is nearby (this
	# task's own diagnostic: col_wall_bottom_l temporarily moved out of
	# reach, the shallow angle alone carried the ball to the aperture
	# cleanly). Both exits land inside the SAME untouched drain aperture,
	# split left/right of its own centre.
	def build_channel_rail_points(gap_x_mm, toward_centre_sign, exit_x_mm):
		"""toward_centre_sign is +1 if the centre (and therefore every
		subsequent waypoint) lies at HIGHER x than gap_x_mm (the left side),
		else -1 (the right side)."""
		p0 = (gap_x_mm, -WALL_T_MM)
		knee = (gap_x_mm + toward_centre_sign * KNEE_DROP_MM, -WALL_T_MM - KNEE_DROP_MM)
		exit_point = (exit_x_mm, CHANNEL_Y_END_MM)
		return [p0, knee, exit_point]

	add_outlane_return_channel('l', build_channel_rail_points(0.0, 1.0, CHANNEL_LEFT_X_END_MM))
	add_outlane_return_channel('r', build_channel_rail_points(LANE_X0_MM, -1.0, CHANNEL_RIGHT_X_END_MM))

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
