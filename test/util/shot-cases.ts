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

import { nodeBboxMm, readCollisionDoc } from './collision-doc';
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
 * The manifest's own anti-vacuity floor.
 *
 * [STORY 2.1f, lesson 5] Was the hand-typed literal 39, against a live 46 --
 * a floor lagging its own subject set by seven, i.e. seven cases could have
 * been deleted before anything noticed. It is now DERIVED from the committed
 * collision document: every distinct switch the table declares a `sw_` zone
 * for is a shot the routing suite has to exercise from somewhere, so the
 * manifest can never hold fewer cases than the machine holds zone-backed
 * switches. That is a genuine lower bound rather than a transcription, it
 * moves on its own when the shot map grows, and it cannot be satisfied by a
 * manifest that has quietly emptied.
 *
 * It is deliberately NOT `SHOT_CASES.length`: a floor derived from the very
 * array it guards is not a floor at all.
 */
function deriveMinShotCases(): number {
	const doc = readCollisionDoc();
	const zoneBackedSwitches = new Set(doc.switchZones.map((z) => z.switch));
	return zoneBackedSwitches.size;
}

export const MIN_SHOT_CASES = deriveMinShotCases();

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

	// -- Ramp (test/shot-routing.test.ts; DW-137, CLOSED by Story 2.1f) --
	{
		// [STORY 2.1f] Was (355, 465) and declared `unreachable` against
		// DW-137 with a measured 58.646 mm closest approach: the release sat
		// inside the ~2 mm slot above the old slingshot that no shot could
		// reach, so this case proved the Ramp's RETURN geometry and nothing
		// about the Ramp being a shot at all. The corridor re-solve makes it
		// one. The release moves to (315, 470) -- inside the re-solved Ramp
		// mouth, 22.373 mm clear of every col_ footprint -- and the verdict
		// flips to `reachable`, witnessed by plunge-then-bat-r-3899, the
		// right-bat witness this story added, whose own trajectory passes
		// 2.153 mm from this point on its way to closing s_ramp_enter then
		// s_ramp_made. That witness is a real shot: a 285-tick plunge, the
		// Right Loop return onto the right bat, one flip.
		id: 'ramp-return-geometry',
		label: 'Ramp, entered from the re-solved bottom-right corridor (DW-137 closed)',
		startMm: { x: 315, y: 470, z: 13.5 },
		speedMmPerS: 2400,
		dirDeg: 0,
		ticks: 9000,
		switchesUnderTest: ['s_ramp_enter', 's_ramp_made', 's_inlane_r'],
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-r-3899' },
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
	// -- [STORY 2.1f, AC 3] One case PER DRAGON target. Until this story the
	// only bank assertion in the suite was "at least one of the six closes"
	// (test/shot-routing.test.ts), which the pre-2.1f corridor could satisfy
	// with two. Each release point below is inside its own letter's switch
	// zone, clear of every col_ footprint by more than the ball radius, and
	// on a witness trajectory -- five of the six on plunge-then-bat-r-3906,
	// the right-bat witness this story added, whose single flip crosses the
	// bank's own zone band from the east and closes s_dragon_a, s_dragon_g,
	// s_dragon_o and s_dragon_n in one pass.
	//
	// Measured, per release (clear / witness / closest approach), and each
	// verified to close its OWN letter when driven:
	//   d (228.9, 520) 15.500 / plunge-then-bat-r-3906 / 1.449
	//   r (233.4, 520) 20.000 / plunge-then-bat-r-3906 / 2.878
	//   a (244.4, 620) 36.892 / plunge-then-bat-r-3906 / 0.036
	//   g (255.4, 480) 31.401 / plunge-then-bat-r-3906 / 0.145
	//   o (265.4, 480) 21.587 / plunge-then-bat-l-3918  / 5.549
	//   n (272.4, 480) 14.866 / plunge-then-bat-r-3906 / 0.023
	// The zones overlap by 3.0 mm at DRAGON_BANK_PITCH_MM = 11 with a target
	// width of 10 and a +/-2 mm zone margin, so d's release also closes r and
	// n's also closes o; neither weakens the per-letter assertion, which is
	// that each case closes ITS OWN switch.
	{
		id: 'dragon-target-d',
		label: 'DRAGON target D, struck on its own column',
		startMm: { x: 228.9, y: 520, z: 13.5 },
		speedMmPerS: 1600,
		dirDeg: 0,
		ticks: 5000,
		switchesUnderTest: ['s_dragon_d'],
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-r-3906' },
	},
	{
		id: 'dragon-target-r',
		label: 'DRAGON target R, struck on its own column',
		startMm: { x: 233.4, y: 520, z: 13.5 },
		speedMmPerS: 1600,
		dirDeg: 0,
		ticks: 5000,
		switchesUnderTest: ['s_dragon_r'],
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-r-3906' },
	},
	{
		id: 'dragon-target-a',
		label: 'DRAGON target A, struck on its own column',
		startMm: { x: 244.4, y: 620, z: 13.5 },
		speedMmPerS: 1600,
		dirDeg: 0,
		ticks: 5000,
		switchesUnderTest: ['s_dragon_a'],
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-r-3906' },
	},
	{
		id: 'dragon-target-g',
		label: 'DRAGON target G, struck on its own column',
		startMm: { x: 255.4, y: 480, z: 13.5 },
		speedMmPerS: 1600,
		dirDeg: 0,
		ticks: 5000,
		switchesUnderTest: ['s_dragon_g'],
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-r-3906' },
	},
	{
		id: 'dragon-target-o',
		label: 'DRAGON target O, struck on its own column',
		startMm: { x: 265.4, y: 480, z: 13.5 },
		speedMmPerS: 1600,
		dirDeg: 0,
		ticks: 5000,
		switchesUnderTest: ['s_dragon_o'],
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-3918' },
	},
	{
		id: 'dragon-target-n',
		label: 'DRAGON target N, struck on its own column',
		startMm: { x: 272.4, y: 480, z: 13.5 },
		speedMmPerS: 1600,
		dirDeg: 0,
		ticks: 5000,
		switchesUnderTest: ['s_dragon_n'],
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-r-3906' },
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
			closestApproachMm: 122.746,
			note: 'same finding as top-lane-1 -- see DW-138.',
		},
	},
	{
		// [STORY 2.1f] Re-sited 345 -> 335 / 900 -> 935: col_ramp_turn's own
		// west edge follows ramp_lane_x0 and moved 338.0 -> 298.4, so the
		// turn's footprint now COVERS the old release point (measured 0.000 mm
		// clear, DW-77). (335, 935) sits 35.724 mm clear of every col_
		// footprint and still directly below Top lane 3's own mouth.
		id: 'top-lane-3',
		label: 'Top lane 3',
		startMm: { x: 335, y: 935, z: 13.5 },
		speedMmPerS: 1500,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: ['s_top_3'],
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 83.015,
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
		// [STORY 2.1f] Re-sited (200, 700) -> (230, 740). The DRAGON bank moved
		// west with the corridor budget, taking col_dragon_bank_backstop's own
		// west vertex from 225.0 to 202.4, which left the old release only
		// 8.352 mm clear (DW-77) AND put the backstop's own sloped face
		// between it and the pop. (230, 740) sits NORTH of the backstop,
		// directly below col_pop_2's own column, 27.1 mm clear.
		id: 'pop-bumper-2',
		label: 'Pop bumper 2',
		startMm: { x: 230, y: 740, z: 13.5 },
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
			closestApproachMm: 59.984,
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
			closestApproachMm: 113.656,
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
		// [STORY 2.1f] Re-witnessed. plunge-then-bat-l-3911's own trajectory
		// changed downstream of the moved DRAGON bank and no longer passes
		// within tolerance of this drop point (re-measured 62.005 mm). The
		// swept replacement, plunge-then-bat-l-3969, passes 5.934 mm from it.
		// The release point itself is unchanged and still clear (17.934 mm).
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-3969' },
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
		// [STORY 2.1f] RE-DECLARED reachable. The dense out-of-process sweep
		// found this drop point once its own RIGHT-bat axis existed: recipe
		// #530 (a 285-tick plunge, right-bat flip at relative tick 3890, a
		// 100-tick hold) passes 0.010 mm from it. That recipe is now the
		// in-suite witness plunge-then-bat-r-3890, so the in-suite gate and
		// the sweep agree. The release point itself is unchanged and still
		// clear (18.350 mm); col_sling_r moved east under it.
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-r-3890' },
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
		// [STORY 2.1f] Re-sited 220 -> 201.7: DRAGON_LEG_R_W_MM narrowed
		// 45.0 -> 23.4 in the corridor budget, so col_dragon_leg_r now spans
		// x 190..213.4 and the old column no longer sits above it at all.
		// 201.7 is the leg's own live centreline.
		id: 'descend-dragon-leg-r',
		label: 'Descending release onto the right Dragon leg (col_dragon_leg_r)',
		startMm: { x: 201.7, y: 660, z: 13.5 },
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
			closestApproachMm: 48.573,
			note: 'no witness the in-suite search could construct reaches this drop point -- see DW-138.',
		},
	},
	{
		// [STORY 2.1f] Re-sited (332, 880) -> (280, 860). col_ramp_wall_l moved
		// west with the channel (326..338 -> 286.4..298.4) and col_ramp_turn,
		// whose west edge follows the same constant, now COVERS the old point
		// (0.000 mm clear, DW-77). The strip directly above the wall's own
		// north cap is 12 mm wide and bounded east by the turn, so no ball
		// centre can descend it; (280, 860) is the closest clear column from
		// which a descending ball still meets that cap, 18.400 mm clear.
		id: 'descend-ramp-wall-l',
		label: 'Descending release onto the Ramp left wall (col_ramp_wall_l)',
		startMm: { x: 280, y: 860, z: 13.5 },
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
			closestApproachMm: 69.694,
			note: 'sits above the Ramp channel, which Story 2.1f re-solved (DW-137 closed); this drop point itself is still unreached by any witness -- see DW-138.',
		},
	},
	{
		// [STORY 2.1f] Re-sited (376, 758) -> (360.4, 760): col_ramp_wall_r
		// moved west with the channel (372..384 -> 354.4..366.4), and
		// col_ramp_return_1's own west end followed ramp_lane_x1, leaving the
		// old point 12.089 mm clear (DW-77). x = 352 is deliberately 2.4 mm
		// WEST of the wall's own live centreline (360.4): a ball released on
		// the centreline settles into a perfectly balanced equilibrium on
		// col_post_ramp_wall_r_crossing's own octagon apex (measured: 0.00 mm
		// of progress over the final 500 ticks, parked at (360.40, 757.52)),
		// the same knife-edge col_pop_1 produces for top-lane-1 and
		// col_loop_top's own ridge peak produces for the loop-top columns.
		// A ball at 352 still descends onto the wall's own north cap (its
		// body spans 338.5..365.5) and rolls off it.
		id: 'descend-ramp-wall-r-cap',
		label: 'Descending release onto the Ramp right wall cap (col_ramp_wall_r)',
		startMm: { x: 352, y: 760, z: 13.5 },
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
			closestApproachMm: 30.972,
			note: 'sits above the Ramp channel, which Story 2.1f re-solved (DW-137 closed); this drop point itself is still unreached by any witness -- see DW-138.',
		},
	},
	{
		// [STORY 2.1f] Re-sited (360, 895) -> (344, 940): col_ramp_turn grew
		// west and north with the channel (its bbox is now x 298.4..390.4,
		// y 800..918) and swallowed the old release point (0.000 mm clear).
		// (344, 940) is 29.732 mm clear and still directly above the turn's
		// own north face, which this story re-authored as a named 21 deg
		// grade so it stays above the real slide threshold at the longer run.
		id: 'descend-ramp-turn-cap',
		label: 'Descending release onto the Ramp top turn cap (col_ramp_turn)',
		startMm: { x: 344, y: 940, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 73.817,
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
		// [STORY 2.1f] RE-DECLARED reachable. This drop point was recorded
		// unreachable against DW-138 with no witness inside 22.9 mm. The
		// right-bat witness this story added (plunge-then-bat-r-3899, the
		// Ramp shot) rides the Ramp's own turn across the crossing gap and
		// down this rail on its way to the right inlane, passing 10.273 mm
		// from the release point -- inside the 13.495 mm tolerance. A
		// genuinely-fixed case is re-declared, never left marked unreachable
		// (this manifest's own AC 2).
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-r-3899' },
	},
	{
		// [STORY 2.1f] Re-sited 240 -> 222.4: the bank moved west with the
		// corridor budget and col_dragon_d now spans x 217.4..227.4.
		id: 'descend-dragon-d',
		label: 'Descending release onto DRAGON bank, col_dragon_d (leftmost target)',
		startMm: { x: 222.4, y: 750, z: 13.5 },
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
			closestApproachMm: 72.374,
			note: 'no witness the in-suite search could construct reaches this drop point -- see DW-138.',
		},
	},
	{
		// [STORY 2.1f] Re-sited 310 -> 270: the bank moved west and
		// col_dragon_n now spans x 272.4..282.4, but col_ramp_wall_l's own
		// west face at 286.4 leaves only a 0.5 mm window of x above the
		// target itself that still clears DW-77's 13.495 mm margin. 270 is
		// 16.400 mm clear and still descends onto the same body a ball above
		// this column actually meets first -- col_dragon_bank_backstop, the
		// wide sloped wall that spans the whole bank (this is the column that
		// exercises the backstop's own east end).
		id: 'descend-dragon-n',
		label: 'Descending release onto DRAGON bank, col_dragon_n (rightmost target)',
		startMm: { x: 270, y: 750, z: 13.5 },
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
			closestApproachMm: 50.919,
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
		reachability: { kind: 'unreachable', ledger: 'DW-138', closestApproachMm: 68.743, note: 'no witness the in-suite search could construct reaches this drop point -- same finding class as the DRAGON-bank/Ramp-turn descend probes -- see DW-138.' },
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
	// Rework iteration 4 (code review 2026-09-04, HIGH finding): the new
	// FR-31 terminator `col_post_dragon_leg_r`, added by this story's own
	// task 9, centred UNOFFSET on the right leg's cap midpoint (212.5, 610),
	// created a fresh permanent-rest strand -- descending releases at
	// (210, 680), (211, 680) and (212, 680) all came to rest at
	// (208.0-208.03, 626.76-626.77), 0.01-0.02 mm of trailing-1000-tick net
	// displacement. `descend-dragon-leg-r` above (x = 220) sits well outside
	// the 2 mm-step x = 210..212 band a sweep against the real pipeline
	// found, so it never covered this. Fixed with a 3.0 mm SOUTH offset on
	// the post alone (`DRAGON_LEG_R_POST_OFFSET_MM`, tools/make-placeholder-
	// blend.py) -- see that constant's own [REWORK ITERATION 4] note for the
	// full swept measurement. x = 211 is this band's own centre.
	{
		// [STORY 2.1f] The whole band moved with col_dragon_leg_r: the leg
		// narrowed to x 190..213.4 and col_post_dragon_leg_r followed its own
		// live cap midpoint to (201.70, 607.00), so the three columns that
		// pinned the 2.1d strand band re-site onto the post's new column.
		id: 'descend-dragon-leg-r-post',
		label: "Descending release onto col_dragon_leg_r, the col_post_dragon_leg_r strand location (rework iteration 4)",
		startMm: { x: 201.7, y: 680, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Measured via closestApproachOverAll({x:211,y:680}). See DW-138.
		reachability: { kind: 'unreachable', ledger: 'DW-138', closestApproachMm: 52.395, note: 'no witness the in-suite search could construct reaches this drop point -- same finding class as the DRAGON-bank/Ramp-turn descend probes -- see DW-138.' },
	},
	// Rework iteration 4 code review (2026-09-04, blind-hunter/edge-case-hunter
	// build-auto review pass): the HIGH finding's own reproduction swept and
	// verified a whole neighbourhood clear (x = 198..236, y = 640..720) but
	// this file pinned only the band's own CENTRE (x = 211, above). Widened to
	// the two other points the ORIGINAL pre-fix reproduction named exactly --
	// (210, 680) and (212, 680), the band's own measured edges -- so a future
	// edit that re-strands either edge without touching the centre is still
	// caught; a genuinely dense grid was judged disproportionate to one 2 mm
	// residual band already bounded by the review's own sweep.
	{
		id: 'descend-dragon-leg-r-post-200',
		label: 'Descending release onto col_dragon_leg_r, the col_post_dragon_leg_r strand band -- west edge (rework iteration 4)',
		startMm: { x: 200, y: 680, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Measured via closestApproachOverAll({x:210,y:680}). See DW-138.
		reachability: { kind: 'unreachable', ledger: 'DW-138', closestApproachMm: 54.059, note: 'no witness the in-suite search could construct reaches this drop point -- same finding class as the DRAGON-bank/Ramp-turn descend probes -- see DW-138.' },
	},
	{
		id: 'descend-dragon-leg-r-post-203',
		label: 'Descending release onto col_dragon_leg_r, the col_post_dragon_leg_r strand band -- east edge (rework iteration 4)',
		startMm: { x: 203, y: 680, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Measured via closestApproachOverAll({x:212,y:680}). See DW-138.
		reachability: { kind: 'unreachable', ledger: 'DW-138', closestApproachMm: 51.124, note: 'no witness the in-suite search could construct reaches this drop point -- same finding class as the DRAGON-bank/Ramp-turn descend probes -- see DW-138.' },
	},
	// Code review, rework iteration 4 (2026-09-04, verification-gap layer,
	// reproduced independently by the reviewer through the real
	// Blender -> export -> physics pipeline): the three columns above all
	// release at y = 680 and therefore pin only "the post is somewhere south
	// of 610", not "the post is far enough south". Measured: rebuilding with
	// `DRAGON_LEG_R_POST_OFFSET_MM = 2.0` -- the value the generator's own
	// [REWORK ITERATION 4] note records as INSUFFICIENT ("2.0 mm left one at
	// (212, 660) too") -- leaves all three of them GREEN (297.7 / 308.9 /
	// 305.5 mm of progress) while a ball released at (212, 650), (212, 660)
	// or (212, 670) comes to permanent rest at (211.08, 625.44) with 0.03 mm
	// of trailing-window progress against the 15 mm floor. So the single most
	// plausible future edit to that constant -- trimming it by 1 mm -- ships
	// a strand the whole suite calls green. This column releases inside that
	// residual band and closes it: green today (offset 3.0), red at offset
	// 2.0. Clearance to the nearest col_ footprint is 38.5 mm, well over
	// assertReleaseClear()'s own 13.495 mm floor.
	{
		id: 'descend-dragon-leg-r-post-660',
		label: 'Descending release into the col_post_dragon_leg_r residual band a 1 mm offset trim reopens (rework iteration 4 code review)',
		startMm: { x: 203, y: 660, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		// Measured via closestApproachOverAll({x:212,y:660}). See DW-138.
		reachability: { kind: 'unreachable', ledger: 'DW-138', closestApproachMm: 47.294, note: 'no witness the in-suite search could construct reaches this drop point -- same finding class as the DRAGON-bank/Ramp-turn descend probes -- see DW-138.' },
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
