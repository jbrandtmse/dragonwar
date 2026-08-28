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
#   --out <path> --mutation <bad-name|two-materials|unknown-property|name-collision-attempt|missing-node|missing-uv>

import argparse
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


MUTATIONS = {
	'bad-name': mutate_bad_name,
	'two-materials': mutate_two_materials,
	'unknown-property': mutate_unknown_property,
	'name-collision-attempt': mutate_name_collision_attempt,
	'missing-node': mutate_missing_node,
	'missing-uv': mutate_missing_uv,
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
