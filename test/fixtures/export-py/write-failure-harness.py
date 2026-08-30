# DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
#
# Test-only harness for test/export-py.test.ts, proving the write-ordering /
# atomic-replace fix (Review Findings, MED -- tools/export.py used to write
# dragonwar.glb BEFORE building the collision document, so a failure in
# between left `out_dir` holding a fresh glb beside a stale, mismatched
# collision file; measured with a real Blender run against a mutated .blend)
# actually protects a run where every validate_*() call has already passed.
#
# No .blend mutation can reach this failure window any more: validate_*()
# now checks names, uniqueness, materials, col_shape, every property's
# presence AND value, UV layers, required-node presence and ball-device
# presence BEFORE run() ever starts building output, so nothing short of a
# genuine mid-pipeline fault (disk error, a real exporter bug, a killed
# process) can land here in production. This harness manufactures exactly
# that fault directly: it imports tools/export.py as a plain module (its
# own `if __name__ == '__main__'` guard means importing it this way runs no
# code beyond function/constant definitions), monkeypatches export_glb() --
# the first thing run()'s try/finally block calls -- to write a stray tmp
# file and then raise, simulating a real exporter that gets partway before
# failing, and calls run() directly (bypassing main()'s sys.exit() wrapping
# so this script can inspect the exception and the filesystem itself).
#
# Usage: blender --background --factory-startup assets/src/dragonwar.blend \
#   --python test/fixtures/export-py/write-failure-harness.py -- \
#   --table-json <path> --out <dir>
#
# Prints INJECTED_FAILURE_RAISED on success (the injected fault actually
# fired and run() propagated it) or INJECTED_FAILURE_DID_NOT_FIRE if run()
# unexpectedly returned normally (the monkeypatch did not take effect, or
# run()'s call order changed) -- test/export-py.test.ts asserts on the
# marker plus the filesystem state, and always treats a Blender-side crash
# report as a harness bug, not a pass.

import importlib.util
import os
import sys

# Never write a tools/__pycache__/*.pyc for this test-only import -- it would
# be a stray untracked artifact in a footprint-controlled directory outside
# test/**, and this script's own tracked footprint has no .gitignore entry
# for it to hide behind. Must be set BEFORE the importlib call below.
sys.dont_write_bytecode = True

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
EXPORT_PY_PATH = os.path.join(REPO_ROOT, 'tools', 'export.py')

spec = importlib.util.spec_from_file_location('dragonwar_export_py_under_test', EXPORT_PY_PATH)
export_py = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export_py)


def failing_export_glb(out_glb_path, dump):
	# Simulate a real exporter that gets partway -- writes SOMETHING at the
	# tmp glb path -- before failing, so this also proves run()'s `finally`
	# cleanup removes a leftover tmp file, not merely that the committed
	# paths are untouched.
	with open(out_glb_path, 'wb') as f:
		f.write(b'PARTIAL-EXPORT-INJECTED-BY-TEST-HARNESS')
	raise RuntimeError('injected failure for write-ordering regression test (after tmp glb write, before collision doc write)')


export_py.export_glb = failing_export_glb


def main():
	try:
		export_py.run(sys.argv)
	except SystemExit:
		# run() itself never calls sys.exit() directly (only main() does, on
		# the way out) -- a SystemExit here would mean something upstream of
		# the injected fault failed validation instead, which is not what
		# this harness is testing for.
		print('INJECTED_FAILURE_DID_NOT_FIRE (SystemExit escaped run() before the injected fault)')
	except Exception as err:  # noqa: BLE001 -- the injected fault, or a real regression, either is what this harness reports on
		print(f'INJECTED_FAILURE_RAISED: {err}')
	else:
		print('INJECTED_FAILURE_DID_NOT_FIRE (run() returned normally)')
	sys.exit(0)  # always 0 -- the test asserts on the printed marker and the filesystem, not the process exit code


if __name__ == '__main__':
	main()
