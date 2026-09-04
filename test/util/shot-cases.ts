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
		reachability: { kind: 'reachable', witness: 'plunge-medium-285' },
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
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-137',
			closestApproachMm: 44.979,
			note: 'the Ramp channel is unreachable by any shot from below (a 50.990 mm shortfall per the DW-137 corridor harness); this story\'s own in-suite witness search corroborates it at 44.979 mm (a bat-flip witness that reaches deeper into the corridor than a straight-line sweep, but still short), confirmed by the dense out-of-process sweep (task 7) -- Story 2.1f owns the fix.',
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
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-3911' },
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
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 66.56,
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
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 32.98,
			note: 'no witness the in-suite search could construct reaches close enough to pop 1 specifically -- see DW-138 (pops 2 and 3 ARE reached by the same witness family).',
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
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-3945' },
	},
	{
		id: 'pop-bumper-3',
		label: 'Pop bumper 3',
		startMm: { x: 180, y: 770, z: 13.5 },
		speedMmPerS: 1000,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: ['s_pop_3'],
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-3945' },
	},

	// -- Descending release sweep, twelve columns (test/shot-routing.test.ts:949-1005) --
	{
		id: 'descend-sling-l',
		label: 'Descending release onto the left slingshot (col_sling_l)',
		startMm: { x: 115, y: 465, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 51.86,
			note: 'no witness the in-suite search could construct reaches this drop point -- see DW-138.',
		},
	},
	{
		id: 'descend-sling-r',
		label: 'Descending release onto the right slingshot (col_sling_r)',
		startMm: { x: 350, y: 465, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 39.98,
			note: 'same finding class as descend-sling-l -- see DW-138.',
		},
	},
	{
		id: 'descend-dragon-leg-l',
		label: 'Descending release onto the left Dragon leg (col_dragon_leg_l)',
		startMm: { x: 120, y: 660, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 32.71,
			note: 'same finding class as descend-sling-l -- see DW-138.',
		},
	},
	{
		id: 'descend-dragon-leg-r',
		label: 'Descending release onto the right Dragon leg (col_dragon_leg_r)',
		startMm: { x: 220, y: 660, z: 13.5 },
		speedMmPerS: 1,
		dirDeg: 0,
		ticks: 6600,
		switchesUnderTest: [],
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 15.53,
			note: 'measured 15.53 mm against the 13.495 mm tolerance -- just short; no witness parameter tried closes the remaining margin -- see DW-138.',
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
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 68.45,
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
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 46.901,
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
		reachability: {
			kind: 'unreachable',
			ledger: 'DW-138',
			closestApproachMm: 25.84,
			note: 'no witness the in-suite search could construct reaches this drop point (descend-dragon-n, the mirrored rightmost target, IS reached by the same witness family) -- see DW-138.',
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
		reachability: { kind: 'reachable', witness: 'plunge-then-bat-l-3944-35' },
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
];

/** Looks a case up by id, throwing naming the id if it is not declared -- `driveCase(id)` (`test/shot-routing.test.ts`) is the only entry point to a release point, so a missing id is always a caller bug, not a data gap. */
export function shotCase(id: string): ShotCase {
	const found = SHOT_CASES.find((c) => c.id === id);
	if (!found) {
		throw new Error(`shotCase(): no case named "${id}" in SHOT_CASES`);
	}
	return found;
}
