# DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
#
# Test-only support script for test/export-py.test.ts: applies ONE
# deliberate contract violation to a loaded copy of the committed
# assets/src/dragonwar.blend and saves the result to a throwaway path, so
# the test can drive tools/export.py against a real, mutated .blend rather
# than a hand-authored stand-in.
#
# "duplicate node name" has no mutation here: Blender enforces object-name
# uniqueness at the API level -- `obj.name = "existing_name"` always
# auto-suffixes to "existing_name.001" rather than colliding (verified
# empirically, this story's implementation pass) -- so no .blend produced
# through the public API can ever hold two objects sharing one literal
# name. `name-collision-attempt` is the closest real scenario: renaming
# toward an existing name, which Blender auto-suffixes and export.py's own
# name-grammar rule then rejects (a `.` is not in `^[a-z][a-z0-9_]*$`).
#
# Usage: blender --background --factory-startup assets/src/dragonwar.blend \
#   --python test/fixtures/export-py/mutate-blend.py -- \
#   --out <path> --mutation <bad-name|two-materials|unknown-property|name-collision-attempt|missing-node|missing-uv|missing-switch-property|missing-surface-property|missing-phys-material-property|missing-lightgroup|no-material|rotated-wall|angled-wall-footprint|degenerate-wall|col-node-not-a-mesh>

import argparse
import math
import sys

import bpy


def mutate_bad_name():
	obj = bpy.data.objects['col_playfield']
	obj.name = 'Col_Playfield'  # a capital letter violates ^[a-z][a-z0-9_]*$


def mutate_two_materials():
	obj = bpy.data.objects['vis_playfield']
	extra = bpy.data.materials.new('mat_extra')
	obj.data.materials.append(extra)  # a second material slot violates AD-11's "one material each"


def mutate_unknown_property():
	obj = bpy.data.objects['col_playfield']
	obj['surface'] = 'unobtainium'  # not in CONTACT_SURFACES


def mutate_name_collision_attempt():
	obj = bpy.data.objects['col_glass']
	obj.name = 'col_playfield'  # Blender auto-suffixes this to 'col_playfield.001'


def mutate_missing_node():
	# A valid-grammar rename still removes the one object TABLE.nodes.pivotPitch
	# names -- every earlier validation pass (grammar, uniqueness, materials,
	# col_shape, properties) stays green, isolating validate_node_presence().
	obj = bpy.data.objects['pivot_pitch']
	obj.name = 'pivot_pitch_moved'


def mutate_missing_uv():
	# vis_playfield is authored with two UV layers (uv_base, uv_lightmap);
	# dropping the second one violates AD-12's TEXCOORD_1 contract.
	obj = bpy.data.objects['vis_playfield']
	layers = obj.data.uv_layers
	layers.remove(layers[-1])


def mutate_missing_switch_property():
	# An sw_ node authored WITHOUT a "switch" property previously escaped
	# validate_properties() entirely (it only ever checked a value that was
	# already present) and crashed inside build_switch_zones()'s bare
	# obj['switch'] as an unhandled, unnamed KeyError -- naming neither the
	# node nor the property, contradicting every other failure path's
	# contract (Review Findings, MED).
	obj = bpy.data.objects['sw_shooter_lane']
	del obj['switch']


def mutate_missing_surface_property():
	# A col_/sw_ node authored WITHOUT a "surface" property has the same
	# escape-then-crash shape as mutate_missing_switch_property() above, but
	# through a different downstream site: build_collision_nodes() reads
	# obj.get('surface') (which would silently serialise JSON null, not
	# crash) while the loader-side consumer (src/sim/physics/loader) is the
	# one that would eventually choke on it. validate_properties()'s presence
	# check closes this at the source instead (Review Findings, MED -- "Same
	# gap for absent surface/phys_material" alongside the switch gap fixed
	# above; this mutation and its sibling below give that half of the
	# finding the same dedicated coverage the switch half already has).
	obj = bpy.data.objects['col_playfield']
	del obj['surface']


def mutate_missing_phys_material_property():
	# Same shape as mutate_missing_surface_property() above, for
	# "phys_material" instead of "surface".
	obj = bpy.data.objects['col_playfield']
	del obj['phys_material']


def mutate_missing_lightgroup():
	# An EXPORTED static mesh authored without a "lightgroup" property.
	# validate_properties() checked a lightgroup's VALUE but never required the
	# key, so this shipped a glb node with no `extras` at all -- the half of
	# AD-11/AD-12's static-mesh contract the presence-check rework left behind
	# after closing surface/phys_material/switch (re-review finding).
	obj = bpy.data.objects['vis_playfield']
	del obj['lightgroup']


def mutate_no_material():
	# The other one-sided check: validate_material_slots() rejected TWO-or-more
	# slots but not ZERO, so an exported mesh with no material at all shipped
	# untextured against AD-11's "one material each" (re-review finding).
	obj = bpy.data.objects['vis_playfield']
	obj.data.materials.clear()


def mutate_rotated_wall():
	# A rotated wall. Every col_ reduction below world_bbox_mm() is an
	# AXIS-ALIGNED bounding-box reduction, so a rotated mesh is silently
	# AABB-ized into collision geometry unrelated to itself: measured during
	# this story's re-review, a 30-degree col_wall_lane exported exit 0 as a
	# 485 x 829 mm slab across most of the playfield in place of a 12 x 950 mm
	# divider. Epic 2 re-authors this same .blend behind this same validation,
	# which is where an unguarded rotation would first ship (re-review finding).
	obj = bpy.data.objects['col_wall_lane']
	obj.rotation_euler = (0.0, 0.0, math.radians(30.0))


def mutate_degenerate_wall():
	# A wall with no thickness: two of its four footprint corners coincide, so
	# the closed polygon gets a zero-length edge whose LineSeg normal is a
	# division by zero -- a NaN-normalled face that silently never collides.
	obj = bpy.data.objects['col_wall_lane']
	obj.scale = (0.0, 1.0, 1.0)


def mutate_angled_wall_footprint():
	# A wall whose MESH footprint is a genuine (non-rectangular) polygon,
	# authored with an IDENTITY object transform -- exactly Story 1.5's
	# col_lane_deflector technique, so validate_col_geometry_reducible()'s
	# axis-aligned guard (which inspects only the object's world matrix)
	# passes trivially while the true footprint is a triangle.
	# wall_footprint_mm()'s convex-hull-of-mesh-vertices reduction must report
	# that triangle; the OLD bounding-box reduction reported the same 4-corner
	# rectangle as any other box-shaped mesh, silently discarding the angle.
	# Index-independent (matches by POSITION, not bmesh vertex-creation
	# order): every vertex sitting at (x_max, y_min) -- at both z_low and
	# z_high -- is moved onto (x_max, y_max), collapsing the "x = x_max" face
	# onto the "x = x_max, y = y_max" edge and leaving three distinct
	# footprint corners instead of four.
	obj = bpy.data.objects['col_wall_bottom_l']
	mesh = obj.data
	xs = sorted({round(v.co.x, 6) for v in mesh.vertices})
	ys = sorted({round(v.co.y, 6) for v in mesh.vertices})
	x_max, y_min, y_max = xs[-1], ys[0], ys[-1]
	for v in mesh.vertices:
		if abs(v.co.x - x_max) < 1e-6 and abs(v.co.y - y_min) < 1e-6:
			v.co.y = y_max
	mesh.update()


def mutate_col_node_not_a_mesh():
	# A col_ node that is not a MESH. An EMPTY's bound_box is all zeros, so it
	# reduces to a degenerate collision node rather than failing.
	bpy.data.objects.remove(bpy.data.objects['col_wall_top'], do_unlink=True)
	empty = bpy.data.objects.new('col_wall_top', None)
	empty['col_shape'] = 'wall'
	empty['surface'] = 'wood'
	empty['phys_material'] = 'default'
	bpy.context.scene.collection.objects.link(empty)


MUTATIONS = {
	'bad-name': mutate_bad_name,
	'two-materials': mutate_two_materials,
	'unknown-property': mutate_unknown_property,
	'name-collision-attempt': mutate_name_collision_attempt,
	'missing-node': mutate_missing_node,
	'missing-uv': mutate_missing_uv,
	'missing-switch-property': mutate_missing_switch_property,
	'missing-surface-property': mutate_missing_surface_property,
	'missing-phys-material-property': mutate_missing_phys_material_property,
	'missing-lightgroup': mutate_missing_lightgroup,
	'no-material': mutate_no_material,
	'rotated-wall': mutate_rotated_wall,
	'angled-wall-footprint': mutate_angled_wall_footprint,
	'degenerate-wall': mutate_degenerate_wall,
	'col-node-not-a-mesh': mutate_col_node_not_a_mesh,
}


def main():
	argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
	parser = argparse.ArgumentParser()
	parser.add_argument('--out', required=True)
	parser.add_argument('--mutation', required=True, choices=list(MUTATIONS.keys()))
	args = parser.parse_args(argv)

	MUTATIONS[args.mutation]()
	bpy.ops.wm.save_as_mainfile(filepath=args.out, compress=True)


if __name__ == '__main__':
	main()
