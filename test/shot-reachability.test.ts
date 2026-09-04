// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1e task 5 -- the in-suite reachability gate. AC 1, AC 2, AC 3:
// every `SHOT_CASES` entry (`test/util/shot-cases.ts`) either has its
// declared witness measured within `REACHABILITY_TOLERANCE_MM` of its
// release point, or is missed by EVERY witness by more than the tolerance
// and its recorded `closestApproachMm` agrees with the live measurement --
// the baseline cannot rot in either direction. Order matters: anti-vacuity
// first (an empty manifest or a dead witness must never let an
// `unreachable` verdict look "confirmed"), then declaration completeness,
// then the per-case proof, then the evaluation-count floor, then the
// structural "cannot be bypassed" gate.
//
// Task 6 -- DW-130: the feed-rail proximity record, the behavioural
// falsifier that did not exist when DW-130 was filed. Measured from the
// SAME driven (teleported-then-launched) trajectories `test/shot-
// routing.test.ts` already produces for the cases whose criterion requires
// a flipper arrival (both Loops' orbit cases, and the Ramp's return
// geometry) -- not a witness trajectory; DW-130 is about the shape of an
// EXISTING shot, not about proving a release point reachable.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { NO_FRAME } from '../src/sim/loop';
import { resolveTuning } from '../src/sim/table/tuning';
import { toPhysics, fromPhysics, MM_PER_VU } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { SHOT_CASES, MIN_SHOT_CASES, shotCase } from './util/shot-cases';
import {
	REACHABILITY_TOLERANCE_MM,
	assertWitnessCorpusHealthy,
	closestApproachMm,
	closestApproachOverAll,
	witnessIds,
} from './util/reachability';
import { readCollisionDoc } from './util/collision-doc';
import { pointToSegmentDistanceMm, pointInPolygon } from './util/plan-geometry';

const REPO_ROOT = path.resolve(__dirname, '..');
const SHOT_ROUTING_PATH = path.resolve(REPO_ROOT, 'test', 'shot-routing.test.ts');

// ---------------------------------------------------------------------------
// Anti-vacuity FIRST (I/O matrix: "Vacuous pass -- zero cases evaluated" /
// "Vacuous pass -- a dead witness"). Neither an unreachable verdict nor a
// pass may be honoured before both hold.
// ---------------------------------------------------------------------------

describe('shot reachability -- anti-vacuity floor (must run before any verdict is honoured)', () => {
	it('MIN_SHOT_CASES is a real, positive floor', () => {
		expect(MIN_SHOT_CASES, 'MIN_SHOT_CASES must be a genuine positive floor, or the count check below is vacuous').toBeGreaterThan(0);
	});

	it('the manifest declares at least MIN_SHOT_CASES cases', () => {
		expect(
			SHOT_CASES.length,
			`SHOT_CASES has only ${SHOT_CASES.length} entries, below the recorded floor of ${MIN_SHOT_CASES} -- an empty or truncated manifest must fail loudly, never report success`,
		).toBeGreaterThanOrEqual(MIN_SHOT_CASES);
	});

	it('every declared witness is alive: enough swept segments, enough cumulative travel, and its own expected switch closed', () => {
		// A witness that never launched (or launched and immediately parked)
		// would make every "unreachable" verdict look confirmed for the wrong
		// reason -- this must be checked before any such verdict is honoured.
		assertWitnessCorpusHealthy();
	});
});

// ---------------------------------------------------------------------------
// Declaration completeness: every SHOT_CASES entry declares `reachable` with
// a witness present in WITNESSES, or `unreachable` with a ledger id, a
// finite closestApproachMm and a note. There is no third state, no default.
// ---------------------------------------------------------------------------

describe('shot reachability -- declaration completeness', () => {
	const knownWitnessIds = new Set(witnessIds());

	it('every SHOT_CASES id is unique (a duplicate id would make shotCase() silently resolve only the first entry, leaving the second undriven and unverified)', () => {
		const seen = new Set<string>();
		const duplicates: string[] = [];
		for (const c of SHOT_CASES) {
			if (seen.has(c.id)) {
				duplicates.push(c.id);
			}
			seen.add(c.id);
		}
		expect(duplicates, `SHOT_CASES has duplicate id(s): ${JSON.stringify(duplicates)} -- every case id must be unique or a later entry is silently unreachable via shotCase()/driveCase()`).toEqual([]);
	});

	it.each(SHOT_CASES.map((c) => [c.id, c] as const))('%s declares a well-formed reachability verdict', (id, c) => {
		if (c.reachability.kind === 'reachable') {
			expect(
				knownWitnessIds.has(c.reachability.witness),
				`case "${id}" declares witness "${c.reachability.witness}", which is not in WITNESSES (test/util/reachability.ts) -- every declared witness must actually exist`,
			).toBe(true);
			return;
		}
		expect(c.reachability.kind, `case "${id}" declares neither "reachable" nor "unreachable" -- there is no third state and no default`).toBe('unreachable');
		expect(c.reachability.ledger, `case "${id}"'s unreachable declaration must carry a ledger id matching /^DW-\\d+$/, got "${c.reachability.ledger}"`).toMatch(/^DW-\d+$/);
		expect(Number.isFinite(c.reachability.closestApproachMm), `case "${id}"'s unreachable declaration must carry a finite closestApproachMm, got ${c.reachability.closestApproachMm}`).toBe(true);
		expect(c.reachability.note.length, `case "${id}"'s unreachable declaration must carry a non-empty note`).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Per case, both directions (AC 1, AC 2, AC 3). it.each over the manifest,
// so a case appended to SHOT_CASES is covered the moment it is added --
// without opting in.
// ---------------------------------------------------------------------------

/** How far a live re-measurement may drift from a recorded `closestApproachMm` before the baseline is treated as stale (solver float noise across runs, never a geometry difference -- AC 2's "the baseline may not rot in either direction" is judged against this). */
const RECORDED_APPROACH_AGREEMENT_BAND_MM = 0.5;

let evaluatedCount = 0;

describe('shot reachability -- per case, proven or recorded unreachable (AC 1, AC 2, AC 3)', () => {
	it.each(SHOT_CASES.map((c) => [c.id, c] as const))('%s', (id, c) => {
		evaluatedCount += 1;
		if (c.reachability.kind === 'reachable') {
			const distanceMm = closestApproachMm(c.startMm, c.reachability.witness);
			expect(
				distanceMm,
				`case "${id}" (${c.label}) declares reachable via witness "${c.reachability.witness}", but the live measurement is ${distanceMm.toFixed(3)} mm -- ` +
					`over the ${REACHABILITY_TOLERANCE_MM} mm tolerance. Either the witness no longer reaches this point (geometry moved) or the declaration is wrong.`,
			).toBeLessThanOrEqual(REACHABILITY_TOLERANCE_MM);
			return;
		}
		// unreachable: EVERY witness must miss it by more than the tolerance,
		// and the recorded closestApproachMm must agree with the live
		// measurement within a stated band -- the baseline cannot rot in
		// either direction (AC 2).
		const best = closestApproachOverAll(c.startMm);
		expect(
			best.closestApproachMm,
			`case "${id}" (${c.label}) is declared unreachable (${c.reachability.ledger}), but witness "${best.witnessId}" now comes within ${best.closestApproachMm.toFixed(3)} mm -- ` +
				`at or under the ${REACHABILITY_TOLERANCE_MM} mm tolerance. A genuinely-fixed case must be re-declared reachable, not left marked unreachable.`,
		).toBeGreaterThan(REACHABILITY_TOLERANCE_MM);
		expect(
			Math.abs(best.closestApproachMm - c.reachability.closestApproachMm),
			`case "${id}"'s recorded closestApproachMm (${c.reachability.closestApproachMm}) disagrees with the live measurement (${best.closestApproachMm.toFixed(3)}) by more than the ${RECORDED_APPROACH_AGREEMENT_BAND_MM} mm agreement band -- the recorded number is stale`,
		).toBeLessThanOrEqual(RECORDED_APPROACH_AGREEMENT_BAND_MM);
	});

	it('every declared case was actually evaluated -- a run that skipped cases is not a pass', () => {
		expect(evaluatedCount, `expected exactly ${SHOT_CASES.length} cases evaluated (one per SHOT_CASES entry), got ${evaluatedCount}`).toBe(SHOT_CASES.length);
	});
});

// ---------------------------------------------------------------------------
// The harness cannot be bypassed (AC 1's structural half): a release point
// cannot be driven at all without a manifest entry. Reads shot-routing.
// test.ts's own source text -- in the shape of test/hardware-rule-
// seam.test.ts's own stripComments() convention -- and additionally strips
// string/template literal bodies, so an error message that happens to
// MENTION "driveShot(" in prose can never be mistaken for a real call site.
// ---------------------------------------------------------------------------

/** Strips `/* *\/` and `//` comments, then the CONTENTS of every quoted or backtick string (so a call site named only in an error message's prose text can never be mistaken for real code) -- mirrors test/hardware-rule-seam.test.ts's own stripComments(), extended for this file's own error-message strings that literally spell "driveShot(" in prose. */
function stripCommentsAndStrings(source: string): string {
	const noComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
	return noComments.replace(/`(?:\\.|[^`\\])*`/g, '``').replace(/'(?:\\.|[^'\\])*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""');
}

describe('shot reachability -- the harness cannot be bypassed (AC 1 structural half)', () => {
	it('driveShot( appears in shot-routing.test.ts ONLY as its own declaration and inside driveCase()\'s own body -- no other call site bypasses the manifest', () => {
		const codeOnly = stripCommentsAndStrings(readFileSync(SHOT_ROUTING_PATH, 'utf8'));
		const lines = codeOnly.split('\n');
		const offendingLines: number[] = [];
		lines.forEach((line, idx) => {
			if (!line.includes('driveShot(')) {
				return;
			}
			const isDeclaration = /^\s*function\s+driveShot\(/.test(line);
			const isTheOneCallSite = /\breturn\s+driveShot\(/.test(line);
			if (!isDeclaration && !isTheOneCallSite) {
				offendingLines.push(idx + 1);
			}
		});
		expect(
			offendingLines,
			`test/shot-routing.test.ts calls driveShot( directly (bypassing driveCase()/the manifest) at line(s) ${offendingLines.join(', ')} -- a release point must never be driven without a SHOT_CASES entry`,
		).toEqual([]);
	});

	it('no release-point coordinate literal (a numeric "x:" key) appears in shot-routing.test.ts outside the manifest import', () => {
		const codeOnly = stripCommentsAndStrings(readFileSync(SHOT_ROUTING_PATH, 'utf8'));
		const matches = codeOnly.match(/\bx:\s*-?\d/g) ?? [];
		expect(
			matches,
			`test/shot-routing.test.ts contains a numeric "x:" literal (${JSON.stringify(matches)}) -- every release-point coordinate must live in test/util/shot-cases.ts, the sole source of truth`,
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Story 2.1e task 6 -- DW-130: the feed-rail proximity record. For each
// side, drives the manifest cases whose criterion requires that side's
// flipper arrival (test/shot-routing.test.ts's own assertReachesFlipperBand
// call sites) and records the minimum distance from the driven ball's own
// swept path to col_guide_inlane_feed_l/_r's footprintMm, minus the ball
// radius -- the contact margin. This is the behavioural falsifier DW-130
// says does not exist: it moves when the body moves OR when the trajectory
// changes, strictly more sensitive than a dimensional gate.
// ---------------------------------------------------------------------------

/** Cases whose own describe block asserts `assertReachesFlipperBand(result, label, 'r')` -- the RIGHT bat's own arrival criterion. */
const RIGHT_BAT_ARRIVAL_CASE_IDS = ['left-loop-orbit-28', 'left-loop-orbit-31', 'left-loop-orbit-34', 'ramp-return-geometry'];
/** Cases whose own describe block asserts `assertReachesFlipperBand(result, label, 'l')` -- the LEFT bat's own arrival criterion. */
const LEFT_BAT_ARRIVAL_CASE_IDS = ['right-loop-orbit-28', 'right-loop-orbit-31', 'right-loop-orbit-34'];

interface Segment {
	readonly fromMm: { readonly x: number; readonly y: number };
	readonly toMm: { readonly x: number; readonly y: number };
}

/**
 * A small, self-contained replica of `test/shot-routing.test.ts`'s own
 * `driveShot()` -- serve, teleport to the manifest case's own `startMm`,
 * launch at its own `speedMmPerS`/`dirDeg`, drive for its own `ticks` --
 * returning only the per-tick swept segments the DW-130 record needs.
 * Deliberately NOT a shared import: `driveCase()`/`driveShot()` stay
 * module-private to `shot-routing.test.ts` (task 3's own boundary), and
 * importing a `describe`/`it`-registering `.test.ts` module from here would
 * re-run its whole suite under THIS file's own report (measured this
 * story's own implementation pass). This function reads its parameters from
 * the SAME `SHOT_CASES` entry `driveCase()` reads (`shotCase(id)`), so it
 * can never drive a different release point, speed, direction or tick
 * budget than the case it names -- only the bookkeeping it keeps differs.
 */
function driveCaseSwept(id: string): readonly Segment[] {
	const c = shotCase(id);
	const tuning = resolveTuning();
	const machine: Machine = createMachine(readCollisionDoc(), tuning);

	let tick = 0;
	for (let i = 0; i < 320; i++) {
		tick += 1;
		machine.step(tick, NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : []);
	}
	const ball = machine.balls[0];
	if (!ball) {
		throw new Error(`driveCaseSwept("${id}"): no served ball to reposition -- c_trough_eject did not serve one`);
	}

	const startPhysics = toPhysics(c.startMm);
	ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
	const speedVuPerT = c.speedMmPerS / (MM_PER_VU * 100);
	const rad = (c.dirDeg * Math.PI) / 180;
	const vTableX = speedVuPerT * Math.sin(rad);
	const vTableY = speedVuPerT * Math.cos(rad);
	ball.hit.vel.set(vTableX, -vTableY, 0);
	ball.hit.angularVelocity.set(0, 0, 0);
	ball.hit.angularMomentum.set(0, 0, 0);

	const segments: Segment[] = [];
	let lastPosMm: { x: number; y: number } = { x: c.startMm.x, y: c.startMm.y };
	for (let i = 0; i < c.ticks; i++) {
		tick += 1;
		machine.step(tick, NO_FRAME, []);
		const b = machine.balls[0];
		if (!b) {
			break;
		}
		const posMm = fromPhysics({ x: b.state.pos.x, y: b.state.pos.y, z: b.state.pos.z });
		const here = { x: posMm.x, y: posMm.y };
		segments.push({ fromMm: lastPosMm, toMm: here });
		lastPosMm = here;
	}
	return segments;
}

function segmentToPolygonDistanceMm(ax: number, ay: number, bx: number, by: number, poly: readonly { readonly x: number; readonly y: number }[]): number {
	if (pointInPolygon(ax, ay, poly) || pointInPolygon(bx, by, poly)) {
		return 0;
	}
	let min = Infinity;
	for (let i = 0; i < poly.length; i++) {
		const p1 = poly[i]!;
		const p2 = poly[(i + 1) % poly.length]!;
		const d = Math.min(
			pointToSegmentDistanceMm(ax, ay, p1.x, p1.y, p2.x, p2.y),
			pointToSegmentDistanceMm(bx, by, p1.x, p1.y, p2.x, p2.y),
			pointToSegmentDistanceMm(p1.x, p1.y, ax, ay, bx, by),
			pointToSegmentDistanceMm(p2.x, p2.y, ax, ay, bx, by),
		);
		if (d < min) {
			min = d;
		}
	}
	return min;
}

const BALL_RADIUS_MM = TABLE.reference.ballMm / 2;

/**
 * The minimum contact margin (distance from the driven ball's own swept
 * path to `nodeName`'s footprint, minus the ball radius) across every case
 * in `caseIds`. Looks the node up defensively (I/O matrix, "DW-130 -- the
 * feed rail deleted"): an absent node fails naming it, never an opaque
 * import-time `nodeBboxMm()` throw.
 */
function minFeedRailMarginMm(caseIds: readonly string[], nodeName: string): number {
	const doc = readCollisionDoc();
	const node = doc.nodes.find((n) => n.name === nodeName);
	expect(node, `the feed-rail proximity record cannot be evaluated: "${nodeName}" is absent from the committed collision document`).toBeDefined();
	const footprint =
		node!.footprintMm ?? [
			{ x: node!.bboxMm.min.x, y: node!.bboxMm.min.y },
			{ x: node!.bboxMm.max.x, y: node!.bboxMm.min.y },
			{ x: node!.bboxMm.max.x, y: node!.bboxMm.max.y },
			{ x: node!.bboxMm.min.x, y: node!.bboxMm.max.y },
		];
	let min = Infinity;
	for (const id of caseIds) {
		const segments = driveCaseSwept(id);
		for (const seg of segments) {
			const d = segmentToPolygonDistanceMm(seg.fromMm.x, seg.fromMm.y, seg.toMm.x, seg.toMm.y, footprint);
			if (d < min) {
				min = d;
			}
		}
	}
	return min - BALL_RADIUS_MM;
}

/**
 * Measured at this story's implementation pass, against the committed
 * collision document, from the cases named above: the LEFT feed rail
 * (col_guide_inlane_feed_l) is CONTACTED by the Right Loop orbit cases'
 * own driven trajectory (a negative margin -- the ball's swept path
 * overlaps the rail's own footprint by this many mm); the RIGHT feed rail
 * (col_guide_inlane_feed_r) CLEARS the Left Loop orbit cases' own driven
 * trajectory by a positive margin. Both match this story's own Code Map
 * citation of Story 2.1c's code review pass 3 ("left contacts by ~0.006 mm;
 * right clears by ~0.020 mm") closely. Reproduced bit-identically across
 * repeated runs of the SAME committed geometry (this simulation is fully
 * deterministic, AD-3 -- there is no run-to-run solver noise to absorb).
 */
const MEASURED_LEFT_FEED_MARGIN_MM = -0.007077330733434195;
const MEASURED_RIGHT_FEED_MARGIN_MM = 0.01979845833328575;
/**
 * The simulation is fully deterministic (AD-3): re-running the SAME
 * committed geometry reproduces the margin bit-identically, so this band
 * is not absorbing "noise" -- there is none -- it exists only for the
 * cross-platform float-summation drift a different host/CPU could
 * theoretically introduce over ~4000 accumulated ticks. Measured at this
 * story's own implementation pass: shifting `col_guide_inlane_feed_r` 20 mm
 * west moves this margin from +0.0198 to -0.0071 mm (a genuine flip from
 * clearing to contacting, not merely a large number -- DW-130's own point
 * is that the ball funnels along WHICHEVER surface bounds it, so contact
 * margin stays near zero either way; the SIGN and the segment the closest
 * approach occurs on are what move). A band any looser than this would
 * let that mutation pass silently.
 */
const FEED_MARGIN_AGREEMENT_BAND_MM = 0.01;

describe('shot reachability -- DW-130: the feed-rail proximity record (AC 5)', () => {
	it('the RIGHT feed rail (col_guide_inlane_feed_r) contact margin, measured from the driven trajectories that require a right-bat arrival, matches its recorded value', () => {
		const marginMm = minFeedRailMarginMm(RIGHT_BAT_ARRIVAL_CASE_IDS, 'col_guide_inlane_feed_r');
		expect(
			Math.abs(marginMm - MEASURED_RIGHT_FEED_MARGIN_MM),
			`the RIGHT feed rail's own measured contact margin is ${marginMm.toFixed(4)} mm, more than ${FEED_MARGIN_AGREEMENT_BAND_MM} mm away from the recorded ${MEASURED_RIGHT_FEED_MARGIN_MM} mm -- ` +
				'col_guide_inlane_feed_r has moved, or the driven trajectory has changed (DW-130\'s own falsifier)',
		).toBeLessThanOrEqual(FEED_MARGIN_AGREEMENT_BAND_MM);
	});

	it('the LEFT feed rail (col_guide_inlane_feed_l) contact margin, measured from the driven trajectories that require a left-bat arrival, matches its recorded value', () => {
		const marginMm = minFeedRailMarginMm(LEFT_BAT_ARRIVAL_CASE_IDS, 'col_guide_inlane_feed_l');
		expect(
			Math.abs(marginMm - MEASURED_LEFT_FEED_MARGIN_MM),
			`the LEFT feed rail's own measured contact margin is ${marginMm.toFixed(4)} mm, more than ${FEED_MARGIN_AGREEMENT_BAND_MM} mm away from the recorded ${MEASURED_LEFT_FEED_MARGIN_MM} mm -- ` +
				'col_guide_inlane_feed_l has moved, or the driven trajectory has changed (DW-130\'s own falsifier)',
		).toBeLessThanOrEqual(FEED_MARGIN_AGREEMENT_BAND_MM);
	});

	it('sanity: shotCase() resolves every id named above (a stale case id would silently drive nothing)', () => {
		for (const id of [...RIGHT_BAT_ARRIVAL_CASE_IDS, ...LEFT_BAT_ARRIVAL_CASE_IDS]) {
			expect(() => shotCase(id), `"${id}" must resolve in SHOT_CASES`).not.toThrow();
		}
	});
});
