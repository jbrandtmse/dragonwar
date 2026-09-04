// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1e task 2 -- THE MANIFEST: the single source of truth for every
// release point `test/shot-routing.test.ts` drives. Transcribed verbatim
// from that file's own 39 driven cases (Code Map's block-by-block list) --
// not one driven parameter changed. Every entry declares a `reachability`
// verdict, measured against the real physics pipeline
// (`test/util/reachability.ts`) at this story's own planning/implementation
// pass; there is no third state and no default (AC 1, AC 2). A case proved
// `unreachable` keeps every driven parameter byte-identical to its
// pre-existing `driveShotChecked()` call site -- it is marked against its
// owning ledger entry, never deleted, weakened or re-pointed (Boundaries,
// "Always").
//
// `driveCase(id)` (`test/shot-routing.test.ts`) is the only entry point that
// can turn one of these into a driven ball -- a release point cannot be
// driven at all without a manifest entry here.

import { nodeBboxMm } from './collision-doc';
import { TABLE } from '../../src/sim/table/dragonwar';
import type { SwitchName } from '../../src/sim/table/names';

export type WitnessId = string;

export type Reachability =
	| { readonly kind: 'reachable'; readonly witness: WitnessId }
	| { readonly kind: 'unreachable'; readonly ledger: `DW-${number}`; readonly closestApproachMm: number; readonly note: string };

export interface ShotCase {
	readonly id: string;
	readonly label: string;
	readonly startMm: { readonly x: number; readonly y: number; readonly z: number };
	readonly speedMmPerS: number;
	readonly dirDeg: number;
	readonly ticks: number;
	readonly switchesUnderTest: readonly SwitchName[];
	readonly reachability: Reachability;
}

/**
 * `test/shot-routing.test.ts:538`'s own derivation, reproduced here rather
 * than frozen to a float -- three release points are DERIVED expressions
 * (the Right Loop's mirrored offsets), and a manifest that froze the float
 * would silently stop tracking a geometry change `laneX0Mm` itself already
 * tracks.
 */
const laneX0Mm = resolveLaneX0Mm();

/**
 * [ADDED 2026-09-03, code review] `nodeBboxMm()` is read at module top
 * level, and this module is now imported by four files
 * (`test/shot-routing.test.ts`, `test/shot-reachability.test.ts`,
 * `test/reachability-harness-integrity.test.ts` and the dense sweep
 * harness), so an absent `col_wall_lane` takes all four down at IMPORT --
 * the same opaque shape task 6 was told to avoid for
 * `col_guide_inlane_feed_r`, widened from one file to four. The lookup
 * cannot be made lazy without turning every `startMm` into a thunk, so the
 * failure is at least made self-explaining: which module, which node, and
 * what it is for.
 */
function resolveLaneX0Mm(): number {
	try {
		return nodeBboxMm('col_wall_lane').min.x;
	} catch (cause) {
		throw new Error(
			'test/util/shot-cases.ts cannot build SHOT_CASES: the node "col_wall_lane" is absent from the committed collision document, ' +
				'and six Right Loop release points are derived from its own west face. Every file that imports the manifest fails at import until it is restored.',
			{ cause },
		);
	}
}

/**
 * `test/shot-routing.test.ts:776`'s own derivation for the centre-drain
 * case, reproduced here rather than frozen to a float (code review
 * finding, this story's own review pass) -- the pre-refactor call site
 * derived this live from `TABLE.reference.playfieldMm.w / 2` (currently
 * 257.2 mm) and a manifest that froze the float would silently stop
 * tracking a playfield-width change, exactly the failure task 2's
 * "derived expressions stay derived" rule exists to prevent.
 */
const CENTRE_X_MM = TABLE.reference.playfieldMm.w / 2;

const DRAGON_BANK_LETTERS: readonly SwitchName[] = ['s_dragon_d', 's_dragon_r', 's_dragon_a', 's_dragon_g', 's_dragon_o', 's_dragon_n'];

/**
 * The count recorded at implementation time (this story's own planning
 * pass, transcribing `test/shot-routing.test.ts`'s 39 driven cases). AC 3's
 * anti-vacuity floor reads this.
 */
export const MIN_SHOT_CASES = 39;

/** Every entry, by its stable `id`. */
export const SHOT_CASES: readonly ShotCase[] = [
	// -- Left Loop, the orbit (test/shot-routing.test.ts:540-577) --
	{
		id: 'left-loop-orbit-28',
		label: 'Left Loop orbit, entry offset 28 mm',
		startMm: { x: 28, y: 415, z: 13.5 },
		speedMmPerS: 2200,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: ['s_loop_l_in', 's_loop_l_out', 's_inlane_r'],
		reachability: { kind: 'reachable', witness: 'plunge-weak-345' },
	},
	{
		id: 'left-loop-orbit-31',
		label: 'Left Loop orbit, entry offset 31 mm',
		startMm: { x: 31, y: 415, z: 13.5 },
		speedMmPerS: 2200,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: ['s_loop_l_in', 's_loop_l_out', 's_inlane_r'],
		reachability: { kind: 'reachable', witness: 'plunge-weak-345' },
	},
	{
		id: 'left-loop-orbit-34',
		label: 'Left Loop orbit, entry offset 34 mm',
		startMm: { x: 34, y: 415, z: 13.5 },
		speedMmPerS: 2200,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: ['s_loop_l_in', 's_loop_l_out', 's_inlane_r'],
		reachability: { kind: 'reachable', witness: 'plunge-weak-345' },
	},

	// -- Right Loop, the orbit (test/shot-routing.test.ts:579-590) --
	{
		id: 'right-loop-orbit-28',
		label: 'Right Loop orbit, entry offset 28 mm (mirrored)',
		startMm: { x: laneX0Mm - 28, y: 415, z: 13.5 },
		speedMmPerS: 2200,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: ['s_loop_r_in', 's_loop_r_out', 's_inlane_l'],
		reachability: { kind: 'reachable', witness: 'plunge-medium-285' },
	},
	{
		id: 'right-loop-orbit-31',
		label: 'Right Loop orbit, entry offset 31 mm (mirrored)',
		startMm: { x: laneX0Mm - 31, y: 415, z: 13.5 },
		speedMmPerS: 2200,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: ['s_loop_r_in', 's_loop_r_out', 's_inlane_l'],
		reachability: { kind: 'reachable', witness: 'plunge-medium-285' },
	},
	{
		id: 'right-loop-orbit-34',
		label: 'Right Loop orbit, entry offset 34 mm (mirrored)',
		startMm: { x: laneX0Mm - 34, y: 415, z: 13.5 },
		speedMmPerS: 2200,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: ['s_loop_r_in', 's_loop_r_out', 's_inlane_l'],
		reachability: { kind: 'reachable', witness: 'plunge-medium-285' },
	},

	// -- DW-123, the re-joined top connector (test/shot-routing.test.ts:598-610) --
	{
		id: 'dw123-single-ball-orbit',
		label: 'DW-123: one ball closes both Loops\' switches (Right Loop entry, offset 31 mm)',
		startMm: { x: laneX0Mm - 31, y: 415, z: 13.5 },
		speedMmPerS: 2200,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: ['s_loop_r_in', 's_loop_r_out'],
		reachability: { kind: 'reachable', witness: 'plunge-medium-285' },
	},

	// -- Off-column, both lanes (test/shot-routing.test.ts:670-680) --
	{
		id: 'loop-off-column-left-west-18',
		label: 'Left Loop, west of the column (inside the return rail\'s own reach)',
		startMm: { x: 18, y: 415, z: 13.5 },
		speedMmPerS: 2200,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: [],
		reachability: { kind: 'reachable', witness: 'plunge-weak-345' },
	},
	{
		id: 'loop-off-column-left-east-45',
		label: 'Left Loop, east of the column (past the top connector\'s own end)',
		startMm: { x: 45, y: 415, z: 13.5 },
		speedMmPerS: 2200,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: [],
		reachability: { kind: 'reachable', witness: 'plunge-full' },
	},
	{
		id: 'loop-off-column-right-west-18',
		label: 'Right Loop, west of the column (mirrored)',
		startMm: { x: laneX0Mm - 18, y: 415, z: 13.5 },
		speedMmPerS: 2200,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: [],
		// Story 2.1d task 8: witness moved plunge-medium-285 -> plunge-medium-295
		// -- measured against the real physics pipeline after this story's
		// own geometry changes, the 285-tick tap now passes 21.430 mm clear
		// (over tolerance); the out-of-process dense sweep (pnpm
		// check:reachability) found the 295-tick tap recovers it at
		// 11.463 mm (recipe #11) -- within the 13.495 mm tolerance. Still
		// reachable throughout this story; only the witness changed.
		reachability: { kind: 'reachable', witness: 'plunge-medium-295' },
	},
	{
		id: 'loop-off-column-right-east-45',
		label: 'Right Loop, east of the column (mirrored) -- sneaks back to the shooter lane',
		startMm: { x: laneX0Mm - 45, y: 415, z: 13.5 },
		speedMmPerS: 2200,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: [],
		reachability: { kind: 'reachable', witness: 'plunge-medium-285' },
	},

	// -- A Loop shot below 2200 mm/s (test/shot-routing.test.ts:688-695) --
	{
		id: 'left-loop-1200',
		label: 'Left Loop at 1200 mm/s (centred in the entry column)',
		startMm: { x: 31, y: 415, z: 13.5 },
		speedMmPerS: 1200,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: ['s_loop_l_in'],
		reachability: { kind: 'reachable', witness: 'plunge-weak-345' },
	},

	// -- Ramp, return geometry only (test/shot-routing.test.ts:697-754; DW-137) --
	{
		id: 'ramp-return-geometry',
		label: 'Ramp return geometry (DW-137: release point acknowledged unreachable)',
		startMm: { x: 355, y: 465, z: 13.5 },
		speedMmPerS: 2400,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: ['s_ramp_enter', 's_ramp_made', 's_inlane_r'],
		// Story 2.1d task 8: closestApproachMm re-measured (44.979 -> 58.646,
		// best witness now plunge-then-bat-l-4110) against the real physics
		// pipeline after this story's own geometry changes -- still
		// unreachable; Story 2.1f still owns the fix.
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-137',
			closestApproachMm: 58.646,
			note: 'the Ramp channel is unreachable by any shot from below (a 50.990 mm shortfall per the DW-137 corridor harness); this story\'s own in-suite witness search corroborates it, confirmed by the dense out-of-process sweep (task 7) -- Story 2.1f owns the fix.',
		},
	},

	// -- Centre drain must not read as a flipper feed (test/shot-routing.test.ts:767-790) --
	{
		id: 'centre-drain-descent',
		label: 'Dead-centre descent through the centre drain corridor',
		startMm: { x: CENTRE_X_MM, y: 200, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-4040' },
	},

	// -- Dragon body (test/shot-routing.test.ts:792-803) --
	{
		id: 'dragon-body',
		label: 'A slightly-off Lock-lane shot strikes the Dragon body face',
		startMm: { x: 140, y: 380, z: 13.5 },
		speedMmPerS: 1500,
		dirDeg: 0,
		ticks: 5000,
		switchesUnderTest: ['s_dragon_body'],
		// Story 2.1d task 8: witness moved 3911 -> 3918 -- measured against
		// the real physics pipeline after the Lock lane swallow fix, 3911's
		// own trajectory now passes 33.761 mm clear (over tolerance,
		// deflected earlier by the same fix); 3918's own trajectory still
		// closes within 7.883 mm.
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-3918' },
	},

	// -- Lock lane, two drives at the same coordinates (test/shot-routing.test.ts:805-832) --
	{
		id: 'lock-lane-immediate',
		label: 'Lock lane, immediate approach (500-tick budget)',
		startMm: { x: 170, y: 380, z: 13.5 },
		speedMmPerS: 1600,
		dirDeg: 0,
		ticks: 500,
		switchesUnderTest: ['s_lock_lane'],
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-3945' },
	},
	{
		id: 'lock-lane-long',
		label: 'Lock lane, eventual fate (5000-tick budget)',
		startMm: { x: 170, y: 380, z: 13.5 },
		speedMmPerS: 1600,
		dirDeg: 0,
		ticks: 5000,
		switchesUnderTest: ['s_lock_lane'],
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-3945' },
	},

	// -- DRAGON bank (test/shot-routing.test.ts:834-858) --
	{
		id: 'dragon-bank-left-column-294',
		label: 'DRAGON bank, left column of the corridor',
		startMm: { x: 294, y: 400, z: 13.5 },
		speedMmPerS: 1600,
		dirDeg: 0,
		ticks: 5000,
		switchesUnderTest: DRAGON_BANK_LETTERS,
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-3918' },
	},
	{
		id: 'dragon-bank-right-column-300',
		label: 'DRAGON bank, right column of the corridor',
		startMm: { x: 300, y: 400, z: 13.5 },
		speedMmPerS: 1600,
		dirDeg: 0,
		ticks: 5000,
		switchesUnderTest: DRAGON_BANK_LETTERS,
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-3918' },
	},

	// -- Top lanes (test/shot-routing.test.ts:860-883) --
	{
		id: 'top-lane-1',
		label: 'Top lane 1',
		startMm: { x: 110, y: 900, z: 13.5 },
		speedMmPerS: 1500,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: ['s_top_1'],
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 65.43,
			note: 'no witness the in-suite search could construct reaches this high up-table at this x -- see DW-138.',
		},
	},
	{
		id: 'top-lane-2',
		label: 'Top lane 2',
		startMm: { x: 245, y: 900, z: 13.5 },
		speedMmPerS: 1500,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: ['s_top_2'],
		// Story 2.1d task 8: closestApproachMm re-measured (66.56 -> 130.135)
		// against the real physics pipeline after this story's own geometry
		// changes -- still unreachable, same witness family, further off.
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 130.135,
			note: 'same finding as top-lane-1 -- see DW-138.',
		},
	},
	{
		id: 'top-lane-3',
		label: 'Top lane 3',
		startMm: { x: 345, y: 900, z: 13.5 },
		speedMmPerS: 1500,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: ['s_top_3'],
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 74.282,
			note: 'same finding as top-lane-1 -- see DW-138.',
		},
	},

	// -- Both slingshots (test/shot-routing.test.ts:885-900) --
	{
		id: 'slingshot-left',
		label: 'Left slingshot',
		startMm: { x: 115, y: 370, z: 13.5 },
		speedMmPerS: 1200,
		dirDeg: -10,
		ticks: 5000,
		switchesUnderTest: ['s_sling_l'],
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-3960' },
	},
	{
		id: 'slingshot-right',
		label: 'Right slingshot',
		startMm: { x: 350, y: 370, z: 13.5 },
		speedMmPerS: 1200,
		dirDeg: 10,
		ticks: 5000,
		switchesUnderTest: ['s_sling_r'],
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-4110' },
	},

	// -- The three pop bumpers (test/shot-routing.test.ts:902-922) --
	{
		id: 'pop-bumper-1',
		label: 'Pop bumper 1',
		startMm: { x: 130, y: 700, z: 13.5 },
		speedMmPerS: 1000,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: ['s_pop_1'],
		// Story 2.1d task 8: closestApproachMm re-measured (32.98 -> 77.655)
		// against the real physics pipeline after this story's own geometry
		// changes -- still unreachable. The note's own "pops 2 and 3 ARE
		// reached" clause is now stale too (both are unreachable as of this
		// story -- see their own entries' notes); corrected below.
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 77.655,
			note: 'no witness the in-suite search could construct reaches close enough to pop 1 specifically -- see DW-138.',
		},
	},
	{
		id: 'pop-bumper-2',
		label: 'Pop bumper 2',
		startMm: { x: 200, y: 700, z: 13.5 },
		speedMmPerS: 1000,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: ['s_pop_2'],
		// Story 2.1d task 8: RE-DECLARED unreachable -- measured against the
		// real physics pipeline after this story's own Lock lane swallow
		// fix, witness plunge-then-bat-l-3945's own trajectory (the closest
		// of all ten) is now captured by the Lock (s_lock_lane then
		// s_lock_1, see that witness's own updated note in reachability.ts)
		// well before it would have reached the pop-bumper cluster --
		// 140.987 mm clear, over tolerance.
		// [REWORK iteration 2, re-measured 2026-09-04] The Lock lane's own
		// TRUE geometry fix (col_lock_ceiling/col_lock_ceiling_west_fill --
		// the corridor is now genuinely sealed, not merely re-sited) moved
		// this witness's own capture point slightly, re-measured 140.987 ->
		// 147.655 mm clear.
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 147.655,
			note: 'was reachable via plunge-then-bat-l-3945 before Story 2.1d\'s own Lock lane swallow fix; that witness is now captured by the Lock partway up-table and no longer reaches the pop-bumper cluster -- see DW-138.',
		},
	},
	{
		id: 'pop-bumper-3',
		label: 'Pop bumper 3',
		startMm: { x: 180, y: 770, z: 13.5 },
		speedMmPerS: 1000,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: ['s_pop_3'],
		// Story 2.1d task 8: RE-DECLARED unreachable -- same finding as
		// pop-bumper-2's own note (plunge-then-bat-l-3945 is now captured
		// by the Lock); the best remaining witness (plunge-full) passes
		// 127.546 mm clear, over tolerance.
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 127.546,
			note: 'was reachable via plunge-then-bat-l-3945 before Story 2.1d\'s own Lock lane swallow fix; that witness is now captured by the Lock partway up-table and no longer reaches the pop-bumper cluster -- see DW-138.',
		},
	},

	// -- Descending release sweep, twelve columns (test/shot-routing.test.ts:949-1005) --
	{
		// Story 2.1d task 13: two new termination posts landed close by
		// (col_post_sling_l_north at (114, 445) and col_post_dragon_leg_l_
		// south at (120, 480), both DW-77-adjacent to the original (115,
		// 465)). Moved to (130, 460) -- still directly above col_sling_l's
		// own footprint (x 98..130), clear of every col_ footprint by
		// 17.930 mm, re-verified against the real committed document.
		id: 'descend-sling-l',
		label: 'Descending release onto the left slingshot (col_sling_l)',
		startMm: { x: 130, y: 460, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Story 2.1d task 8: RE-DECLARED reachable -- measured against the
		// real physics pipeline after this story's own geometry changes,
		// witness plunge-then-bat-l-3911's own trajectory now passes within
		// 0.125 mm of this drop point (col_post_sling_l_north, the north
		// termination post task 13 added, sits almost exactly on that
		// witness's own path). A genuinely-fixed case must be re-declared
		// reachable, not left marked unreachable (this file's own AC 2).
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-3911' },
	},
	{
		id: 'descend-sling-r',
		label: 'Descending release onto the right slingshot (col_sling_r)',
		startMm: { x: 350, y: 465, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Story 2.1d task 8: closestApproachMm re-measured (39.98 -> 58.486)
		// against the real physics pipeline after this story's own geometry
		// changes -- still unreachable.
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 58.486,
			note: 'no witness the in-suite search could construct reaches this drop point -- see DW-138.',
		},
	},
	{
		// Story 2.1d task 8: col_dragon_leg_l is UNMOVED (the Lock-lane
		// swallow fix re-sites the three slot zones into the corridor the
		// legs already bound, rather than extending the legs themselves --
		// see tools/make-placeholder-blend.py's own [REWORK] note beside
		// DRAGON_LEG_Y1_MM). startMm's own x therefore stays exactly as
		// 2.1b authored it.
		//
		// [CORRECTED, rework iteration 3 round 7, HIGH review finding]
		// startMm's own y moved 660 -> 680: col_lock_ceiling_west_fill's
		// own thickness (LOCK_FILL_THICKNESS_MM, tools/make-placeholder-
		// blend.py) is now tied LIVE to col_lock_ceiling's own raised peak
		// (36 -> 54 mm, load-bearing for the HIGH finding's own west-side
		// fix -- see that constant's own comment), which moved west_fill's
		// own north edge up too. At (120, 660) that left this release
		// point 0.000 mm from west_fill's own material -- INSIDE it, not
		// merely close -- where DW-77 requires > 13.495 mm clearance for
		// any release point driveShot() teleports a ball to. 680 clears
		// west_fill's own true height at x = 120 (662, interpolated) by
		// 18 mm, comfortably past the 13.495 mm floor, and still drops the
		// ball onto the identical col_dragon_leg_l flat-topped face this
		// case exists to pin -- unrelated to the fix, only its own
		// clearance moved.
		id: 'descend-dragon-leg-l',
		label: 'Descending release onto the left Dragon leg (col_dragon_leg_l)',
		startMm: { x: 120, y: 680, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Story 2.1d task 8: closestApproachMm re-measured (32.71 -> 67.712)
		// against the real physics pipeline after this story's own geometry
		// changes -- still unreachable. Rework iteration 3 round 7:
		// re-measured again after startMm's own y moved (67.712 -> 67.684,
		// essentially unchanged -- the same witness, plunge-full, remains
		// the nearest one regardless of the small y shift).
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 67.684,
			note: 'no witness the in-suite search could construct reaches this drop point -- see DW-138.',
		},
	},
	{
		// Story 2.1d task 8: col_dragon_leg_r is UNMOVED too (see
		// descend-dragon-leg-l's own note) -- startMm stays as authored.
		id: 'descend-dragon-leg-r',
		label: 'Descending release onto the right Dragon leg (col_dragon_leg_r)',
		startMm: { x: 220, y: 660, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Story 2.1d task 8: closestApproachMm re-measured (15.53 -> 111.542,
		// best witness now plunge-then-bat-l-3945) against the real physics
		// pipeline after this story's own geometry changes -- the old
		// "just short" framing no longer applies (this point is now well
		// clear); still unreachable.
		// [REWORK iteration 2, re-measured 2026-09-04] The Lock lane's own
		// TRUE geometry fix moved this witness's own trajectory again,
		// 111.542 -> 129.388 mm clear (same underlying cause as pop-bumper-2's
		// own re-measurement, above).
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 129.388,
			note: 'no witness the in-suite search could construct reaches this drop point -- see DW-138.',
		},
	},
	{
		id: 'descend-ramp-wall-l',
		label: 'Descending release onto the Ramp left wall (col_ramp_wall_l)',
		startMm: { x: 332, y: 880, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Story 2.1d task 8: closestApproachMm re-measured (68.45 -> 87.896)
		// against the real physics pipeline after this story's own geometry
		// changes -- still unreachable.
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 87.896,
			note: 'sits inside the DW-137 bottom-right corridor band as well as being unreached by any witness -- see DW-138.',
		},
	},
	{
		id: 'descend-ramp-wall-r-cap',
		label: 'Descending release onto the Ramp right wall cap (col_ramp_wall_r)',
		startMm: { x: 376, y: 758, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Story 2.1d task 8: closestApproachMm re-measured (46.901 -> 47.930)
		// against the real physics pipeline after this story's own geometry
		// changes -- still unreachable, essentially unchanged.
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 47.930,
			note: 'sits inside the Ramp channel band DW-137 already documents as unreachable from below -- see DW-138.',
		},
	},
	{
		id: 'descend-ramp-turn-cap',
		label: 'Descending release onto the Ramp top turn cap (col_ramp_turn)',
		startMm: { x: 360, y: 895, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 59.45,
			note: 'same finding class as descend-ramp-wall-l -- see DW-138.',
		},
	},
	{
		id: 'descend-ramp-return-rail',
		label: 'Descending release onto the Ramp return rail (col_ramp_return_1)',
		startMm: { x: 396, y: 800, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 25.987,
			note: 'sits on the Ramp\'s own return rail, past the corridor -- see DW-138.',
		},
	},
	{
		id: 'descend-dragon-d',
		label: 'Descending release onto DRAGON bank, col_dragon_d (leftmost target)',
		startMm: { x: 240, y: 750, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Story 2.1d task 8: closestApproachMm re-measured (25.84 -> 183.653)
		// against the real physics pipeline after this story's own Lock
		// lane swallow fix -- still unreachable. The note's own "descend-
		// dragon-n IS reached" clause is now stale too (also unreachable as
		// of this story -- see its own entry's note); corrected below.
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 183.653,
			note: 'no witness the in-suite search could construct reaches this drop point -- see DW-138.',
		},
	},
	{
		id: 'descend-dragon-n',
		label: 'Descending release onto DRAGON bank, col_dragon_n (rightmost target)',
		startMm: { x: 310, y: 750, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Story 2.1d task 8: RE-DECLARED unreachable -- measured against the
		// real physics pipeline after this story's own Lock lane swallow
		// fix, witness plunge-then-bat-l-3944-35 is now captured by the
		// Lock (see that witness's own updated note in reachability.ts)
		// well before it would have reached the DRAGON bank; the best
		// remaining witness (plunge-medium-285) passes 114.250 mm clear.
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 114.250,
			note: 'was reachable via plunge-then-bat-l-3944-35 before Story 2.1d\'s own Lock lane swallow fix; that witness is now captured by the Lock partway up-table and no longer reaches the DRAGON bank -- see DW-138.',
		},
	},
	{
		id: 'descend-loop-top-west',
		label: 'Descending release onto col_loop_top, west of centre',
		startMm: { x: 150, y: 1035, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		reachability: { kind: 'reachable', witness: 'plunge-weak-345' },
	},
	{
		id: 'descend-loop-top-east',
		label: 'Descending release onto col_loop_top, east of centre',
		startMm: { x: 300, y: 1035, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		reachability: { kind: 'reachable', witness: 'plunge-weak-345' },
	},
	// Rework iteration 3 (code review 2026-09-04, HIGH finding): col_lock_
	// ceiling's own east flank stranded a ball at (182.6, 631.3) after
	// rework iteration 2's corridor seal, and neither new sealing body
	// (col_lock_ceiling, col_lock_ceiling_west_fill) had a column in this
	// describe block's own one-column-per-flat-topped-body sweep, the exact
	// discipline that already found col_loop_top's own strand above. Two
	// columns for col_lock_ceiling (one per flank of its own peak, raised
	// round 7 -- LOCK_CEILING_RIDGE_MM), one for col_lock_ceiling_west_
	// fill's own single diagonal slope. Release heights (y = 680, all
	// three) clear both bodies' own now-taller material by a real margin
	// (> one ball radius, DW-77) -- round 7 also raised west_fill's own
	// height (LOCK_FILL_THICKNESS_MM, tied LIVE to col_lock_ceiling's own
	// peak), which is why these sit higher than an earlier draft of this
	// same fix used (y = 660), verified via assertReleaseClear() when
	// driven.
	{
		id: 'descend-lock-ceiling-west',
		label: 'Descending release onto col_lock_ceiling, west flank',
		startMm: { x: 150, y: 680, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Measured via closestApproachOverAll({x:150,y:680}) -- same finding
		// class as the other descend-* probes above (col_dragon_d,
		// col_ramp_turn, etc.): no witness the in-suite search could
		// construct reaches this drop point. See DW-138.
		reachability: { kind: 'unreachable', ledger: 'DW-138', closestApproachMm: 97.684, note: 'no witness the in-suite search could construct reaches this drop point -- same finding class as the DRAGON-bank/Ramp-turn descend probes -- see DW-138.' },
	},
	{
		id: 'descend-lock-ceiling-east',
		label: 'Descending release onto col_lock_ceiling, east flank (the HIGH finding\'s own strand location)',
		startMm: { x: 185, y: 680, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Measured via closestApproachOverAll({x:185,y:680}). See DW-138.
		reachability: { kind: 'unreachable', ledger: 'DW-138', closestApproachMm: 132.684, note: 'no witness the in-suite search could construct reaches this drop point -- same finding class as the DRAGON-bank/Ramp-turn descend probes -- see DW-138.' },
	},
	{
		id: 'descend-lock-ceiling-west-fill',
		label: 'Descending release onto col_lock_ceiling_west_fill',
		// [CORRECTED, rework iteration 3 review: this release point used to
		// be byte-identical to descend-dragon-leg-l's own (120, 680) --
		// same speed, direction and tick budget -- so it drove the SAME
		// simulated trajectory rather than independently probing this
		// body's own material. x = 132 sits inside col_lock_ceiling_west_
		// fill's own x 90..150 span, clear of both descend-dragon-leg-l's
		// x = 120 and the pre-existing, deferred x = 92..110 residual (see
		// this story's own frontmatter deferred: entry) -- confirmed
		// against the real physics pipeline: the ball makes genuine net
		// progress (no strand) at this column.]
		startMm: { x: 132, y: 680, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Measured via closestApproachOverAll({x:132,y:680}). See DW-138.
		reachability: { kind: 'unreachable', ledger: 'DW-138', closestApproachMm: 79.684, note: 'no witness the in-suite search could construct reaches this drop point -- same finding class as the DRAGON-bank/Ramp-turn descend probes -- see DW-138.' },
	},
];

/** Looks a case up by id, throwing naming the id if it is not declared -- `driveCase(id)` (`test/shot-routing.test.ts`) is the only entry point to a release point, so a missing id is always a caller bug, not a data gap. */
export function shotCase(id: string): ShotCase {
	const found = SHOT_CASES.find((c) => c.id === id);
	if (!found) {
		throw new Error(`shotCase(): no case named "${id}" in SHOT_CASES`);
	}
	return found;
}
