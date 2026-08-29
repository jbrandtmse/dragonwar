# DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
#
# Test-only runner for test/export-py-hull.test.ts (DW-64): imports
# tools/export.py as a plain module -- its own `if __name__ == '__main__'`
# guard means importing it this way runs no code beyond function/constant
# definitions (test/fixtures/export-py/write-failure-harness.py's own
# precedent) -- and calls its pure, Blender-free `_convex_hull_2d()` /
# `_rotate_to_lexicographic_first()` helpers directly against a JSON payload
# read from stdin, printing the result as JSON to stdout.
#
# Runs under PLAIN python3 (no Blender): only the module-level `import bpy` /
# `from mathutils import Vector` need satisfying, via a minimal bpy/mathutils
# stub on PYTHONPATH (test/export-py-hull.test.ts's own writeBpyStub(),
# following test/export-py-version-gate.test.ts's precedent) -- neither hull
# helper touches bpy or mathutils at all.
#
# Usage: python3 hull-runner.py <path-to-tools/export.py>
#   stdin: {"points": [[x, y], ...]}
#   stdout: {"hull": [[x, y], ...], "rotated": [[x, y], ...]}

import importlib.util
import json
import sys

sys.dont_write_bytecode = True

export_py_path = sys.argv[1]
spec = importlib.util.spec_from_file_location('dragonwar_export_py_under_test', export_py_path)
export_py = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export_py)

payload = json.loads(sys.stdin.read())
points = [tuple(p) for p in payload['points']]

hull = export_py._convex_hull_2d(points)
rotated = export_py._rotate_to_lexicographic_first(hull)

print(json.dumps({'hull': [list(p) for p in hull], 'rotated': [list(p) for p in rotated]}))
