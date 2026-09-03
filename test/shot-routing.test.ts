// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1b task 16a -- AC 1's BEHAVIOURAL half, and the single most
// important test in this story (spec's own words): "when a ball is driven
// into each shot at a plausible shot speed, then that shot's switches close
// in their approach order, the shot's exit or its most common miss arrives
// playable at a flipper rather than draining down the middle or stranding,
// and no drivable release point inside a shot's own mouth leaves the ball
// permanently at rest." Dimensional gates (test/asset-contract.test.ts's
// own Story 2.1b describe block) are the OTHER half -- neither alone closes
// AC 1 (2.1a shipped a drain triangle that passed every name-and-dimension
// check while both outlanes dead-ended on solid wall).
//
// Harness: the same createMachine() + hand-repositioned-served-ball
// technique test/switch-max-speed.test.ts's own Integration case uses
// (reset vel, angularVelocity AND angularMomentum -- residual spin walks
// the ball sideways under friction, test/machine-serve-drain.test.ts's own
// recipe). Every start position and switch name is read from the committed
// collision document via test/util/collision-doc.ts, never a bare literal.
//
// Scope, stated honestly rather than silently narrowed: this story's own
// planning pass (this file's own authoring) measured EVERY shot below by
// actually driving a ball through the real physics pipeline and reading the
// result, not by assuming a straight-line approach would work -- and it did
// not, twice: the pop-bumper switch zones and the DRAGON-bank/Dragon-body
// switch zones were BOTH physically unreachable as first authored (both
// closed a zone at or behind the one-ball-radius approach limit a solid
// col_ body imposes), caught and fixed only by actually driving a ball at
// them here and in test/switch-max-speed.test.ts. What remains, reported
// rather than hidden: this story's own tick budgets are bounded well short
// of every shot's full eventual fate (a loop or a lock-lane near-miss both
// continue rattling around the open field for thousands more ticks after
// the window this file checks). The FEEL judgment AC 6 names is
// `pending-author` for exactly this reason -- no automated check
// substitutes for the Reference-machine ritual.
//
// Story 2.1c, tasks 1-2 (the pin repair -- AC 1, AC 2; this ordering is
// binding and runs BEFORE any geometry edit in this story). Three separate
// defects made the OLD `assertReachesFlipperBandOrLeavesPlay` green over
// exactly the geometry this story exists to fix, all now closed:
//
// (1) `leftPlay` used to satisfy the routing clause on its own -- it is set
// by `physics.removeBall()`, which fires identically for a drain and a
// park, so "the Loop returned the ball to a flipper" and "the Loop dumped
// it down the outlane" were indistinguishable. `leftPlay` now survives only
// as the raw ball-departed-the-simulated-set flag `terminal` is classified
// from; the routing clause is `assertReachesFlipperBand`, which reads
// `reachedFlipperBand` alone.
//
// (2) The single `FLIPPER_BAND` (x 140..375) contained the centre drain
// corridor (x 240.875..273.525, between `col_guide_outer_l/r`) -- a
// dead-centre drain satisfied "reached a flipper". Replaced with
// `FLIPPER_BAND_L`/`FLIPPER_BAND_R`, each anchored on its OWN bat's x-span
// read from the committed document (`col_flipper_l`/`col_flipper_r`), y
// running from the bat's own top edge through 145 mm -- the gap between the
// two bats is outside BOTH bands by construction, for any y range, because
// neither bat's x-span reaches it.
//
// (3) `driveShot()` TELEPORTS the ball to `startMm` -- unlike a real shot,
// nothing about that placement is ever verified reachable -- and because
// `settleTicks` gates only the break, never the make (AD-2), a release
// point inside a zone closes that switch unconditionally on drive tick 1.
// Four blocks' own release points landed inside the very zone their own
// assertion checks (both Loops, the Ramp, both slingshots), and seven more
// release points across the file landed inside a solid `col_` footprint
// (DW-77: the solver ejects a ball spawned there, measured z -> -1.8e6 mm,
// 189 m/s) -- one of them (the Ramp) doubly so. `assertReleaseClear()`,
// below, makes this self-checking: every `driveShotChecked()` call fails
// naming the body or zone before `driveShot()` ever runs, if the release
// point does not clear it. Every release point in this file was moved to
// pass it (see the Spec Change Log for the individual measurements), and
// the missing descending-sweep column over `col_ramp_wall_r`'s own
// dead-flat north cap (x 389..401, task 2's own instruction) is added.
//
// A ball whose criterion requires a flipper arrival (both Loops, the Ramp)
// now asserts `assertReachesFlipperBand` outright; every other shot in this
// file keeps the liveness-only guard, `assertNotStillInPlay` (the shot's
// fate must conclude within the tick budget -- a flipper, a lane switch or
// the drain -- never that it conclude WELL; Lawlor's own "every miss comes
// back playable" judgement stays the `pending-author` Reference-machine
// ritual, not something this file can substitute for).

import { describe, expect, it } from 'vitest';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { NO_FRAME } from '../src/sim/loop';
import { resolveTuning } from '../src/sim/table/tuning';
import { toPhysics, fromPhysics, MM_PER_VU } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { nodeBboxMm, readCollisionDoc } from './util/collision-doc';
import type { SwitchName } from '../src/sim/table/names';

/**
 * Story 2.1c task 1: `terminal` names where the ball's own fate landed,
 * built from `firstMakes` -- `flipper` takes priority over everything else
 * (a ball that reached a bat band is the good outcome regardless of
 * anything it touched first); `locked` and the four lane switches are
 * checked next (a "half delivery" -- `s_inlane_r` closes but the ball never
 * reaches a bat, Design Notes' own "two obligations" -- still reports its
 * lane, not a bare drain); a ball that left play with none of those makes
 * genuinely fell through the centre; `still_in_play` is the residual bucket
 * when neither happened inside the tick budget.
 */
type Terminal = 'flipper' | 'inlane_l' | 'inlane_r' | 'outlane_l' | 'outlane_r' | 'centre_drain' | 'locked' | 'still_in_play';

const LOCK_SWITCHES: readonly SwitchName[] = ['s_lock_1', 's_lock_2', 's_lock_3'];

function classifyTerminal(firstMakes: readonly SwitchName[], leftPlay: boolean, reachedFlipperBand: boolean): Terminal {
	if (reachedFlipperBand) {
		return 'flipper';
	}
	if (LOCK_SWITCHES.some((s) => firstMakes.includes(s))) {
		return 'locked';
	}
	if (firstMakes.includes('s_inlane_l')) {
		return 'inlane_l';
	}
	if (firstMakes.includes('s_inlane_r')) {
		return 'inlane_r';
	}
	if (firstMakes.includes('s_outlane_l')) {
		return 'outlane_l';
	}
	if (firstMakes.includes('s_outlane_r')) {
		return 'outlane_r';
	}
	if (leftPlay) {
		return 'centre_drain';
	}
	return 'still_in_play';
}

interface ShotResult {
	/** Every switch make, in the tick order it occurred, first occurrence only per switch (a switch re-closing later, e.g. after a full loop, does not appear twice). */
	readonly firstMakes: readonly SwitchName[];
	/** True once the ball left the simulated set (drained via the aperture, or parked in a device). */
	readonly leftPlay: boolean;
	/** The ball's final table position -- the LAST position observed while still in the simulated set, i.e. at or immediately before the tick it left play (never nulled: Story 2.1c task 1 -- a failure message with no idea where the ball was cannot be acted on). */
	readonly finalPosMm: { readonly x: number; readonly y: number } | null;
	readonly finalSpeedMmPerS: number;
	/** Sampled every `PROGRESS_SAMPLE_TICKS` ticks while still in play: `{tick, x, y}`. A ball bouncing in place (real instantaneous speed, near-zero NET displacement over a trailing window) is what `assertNotStranded` below reads this for -- Rework iteration 2, item (a). */
	readonly positionSamples: readonly { readonly tick: number; readonly x: number; readonly y: number }[];
	/** True if the ball's position ever fell within a flipper band while moving toward the flippers (table -y) at more than a genuine floor speed -- the observable AC 1's own Then clause names ("reaches the flipper-reachable band ... with a downward velocity"). */
	readonly reachedFlipperBand: boolean;
	/** Story 2.1c task 1 -- see `classifyTerminal()`'s own doc comment. */
	readonly terminal: Terminal;
}

const PROGRESS_SAMPLE_TICKS = 25;

/**
 * Story 2.1c task 1: two bands, each anchored on its OWN bat's x-span, read
 * from the committed document rather than invented -- replaces the single
 * `FLIPPER_BAND`, whose x span (140..375) contained the centre drain
 * corridor (x 240.875..273.525) and so was satisfied by a dead-centre
 * drain. y runs from the bat's own top edge through 145 mm ("above the bat
 * tops through 145 mm", spec task 1) -- the region a descending ball must
 * reach to be "playable at a flipper" per AC 1's own Then clause.
 */
const flipperLBox = nodeBboxMm('col_flipper_l');
const flipperRBox = nodeBboxMm('col_flipper_r');
const FLIPPER_BAND_L = { xMin: flipperLBox.min.x, xMax: flipperLBox.max.x, yMin: flipperLBox.max.y, yMax: 145 };
const FLIPPER_BAND_R = { xMin: flipperRBox.min.x, xMax: flipperRBox.max.x, yMin: flipperRBox.max.y, yMax: 145 };

function inFlipperBand(x: number, y: number): boolean {
	return (
		(x >= FLIPPER_BAND_L.xMin && x <= FLIPPER_BAND_L.xMax && y >= FLIPPER_BAND_L.yMin && y <= FLIPPER_BAND_L.yMax) ||
		(x >= FLIPPER_BAND_R.xMin && x <= FLIPPER_BAND_R.xMax && y >= FLIPPER_BAND_R.yMin && y <= FLIPPER_BAND_R.yMax)
	);
}

// Story 2.1c task 1: the old condition (`vel.y > 0`) admitted 1e-9 -- a ball
// at the bottom of a bounce, or resting with residual solver jitter, could
// satisfy it. 20 mm/s is far below every driven shot's own speed in this
// file (the slowest is 1000 mm/s) and far above solver jitter, so it only
// ever excludes a ball that is not genuinely travelling toward the
// flippers.
const DESCENT_SPEED_FLOOR_MM_PER_S = 20;
const DESCENT_SPEED_FLOOR_VU_PER_T = DESCENT_SPEED_FLOOR_MM_PER_S / (MM_PER_VU * 100);

/**
 * Serves a fresh ball (the real trough-eject path, not a hand-built one),
 * repositions it at `startMm` with a straight-line launch at `speedMmPerS`
 * toward `dirDeg` (0 = table +y, "up the playfield", positive rotates
 * toward +x), and drives it for `ticks` real physics steps through the
 * actual `createMachine()` pipeline (so every hardware rule -- flippers,
 * the plunger, DW-67's own debounced switch tracker -- is the real one).
 * `readCollisionDoc()` (Story 2.1c task 2) replaces the old per-call
 * `JSON.parse` -- confirmed safe: `loadCollision()`/`parseCollisionDoc()`
 * only ever read from their `doc` argument (building fresh objects via
 * `.map()`), never assign into it, so handing every call the SAME frozen,
 * cached document changes nothing about what gets loaded.
 */
function driveShot(startMm: { x: number; y: number; z: number }, speedMmPerS: number, dirDeg: number, ticks: number): ShotResult {
	const tuning = resolveTuning();
	const machine: Machine = createMachine(readCollisionDoc(), tuning);

	let tick = 0;
	for (let i = 0; i < 320; i++) {
		tick += 1;
		machine.step(tick, NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : []);
	}
	const ball = machine.balls[0];
	if (!ball) {
		throw new Error('driveShot(): no served ball to reposition -- c_trough_eject did not serve one');
	}

	const startPhysics = toPhysics(startMm);
	ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
	const speedVuPerT = speedMmPerS / (MM_PER_VU * 100);
	const rad = (dirDeg * Math.PI) / 180;
	const vTableX = speedVuPerT * Math.sin(rad);
	const vTableY = speedVuPerT * Math.cos(rad);
	// toPhysics() flips table y -> physics -y (this file's own convention,
	// matching test/switch-max-speed.test.ts's Integration case).
	ball.hit.vel.set(vTableX, -vTableY, 0);
	ball.hit.angularVelocity.set(0, 0, 0);
	ball.hit.angularMomentum.set(0, 0, 0);

	const seen = new Set<SwitchName>();
	const firstMakes: SwitchName[] = [];
	let finalPosMm: { x: number; y: number } | null = null;
	let finalSpeedMmPerS = speedMmPerS;
	let leftPlay = false;
	const positionSamples: { tick: number; x: number; y: number }[] = [];
	let reachedFlipperBand = false;

	for (let i = 0; i < ticks; i++) {
		tick += 1;
		const result = machine.step(tick, NO_FRAME, []);
		for (const event of result.switchEvents) {
			if (event.closed && !seen.has(event.switch)) {
				seen.add(event.switch);
				firstMakes.push(event.switch);
			}
		}
		const b = machine.balls[0];
		if (!b) {
			leftPlay = true;
			// Story 2.1c task 1: finalPosMm is NOT nulled -- it keeps the last
			// position recorded below, at (or immediately before) the tick the
			// ball left play, so a failure message can say where it went.
			break;
		}
		const posMm = fromPhysics({ x: b.state.pos.x, y: b.state.pos.y, z: b.state.pos.z });
		finalPosMm = { x: posMm.x, y: posMm.y };
		finalSpeedMmPerS = Math.hypot(b.hit.vel.x, b.hit.vel.y, b.hit.vel.z) * MM_PER_VU * 100;
		if (i % PROGRESS_SAMPLE_TICKS === 0) {
			positionSamples.push({ tick, x: posMm.x, y: posMm.y });
		}
		if (
			!reachedFlipperBand &&
			inFlipperBand(posMm.x, posMm.y) &&
			// toPhysics() flips table y -> physics -y (this file's own
			// convention, above): table_vel_y = -physics_vel_y, so a
			// POSITIVE physics vel.y is a NEGATIVE table vel.y -- moving
			// DOWN the playfield, toward the flippers -- and now must clear
			// a genuine speed floor (DESCENT_SPEED_FLOOR_MM_PER_S, above).
			b.hit.vel.y > DESCENT_SPEED_FLOOR_VU_PER_T
		) {
			reachedFlipperBand = true;
		}
	}

	const terminal = classifyTerminal(firstMakes, leftPlay, reachedFlipperBand);
	return { firstMakes, leftPlay, finalPosMm, finalSpeedMmPerS, positionSamples, reachedFlipperBand, terminal };
}

// ---------------------------------------------------------------------------
// Story 2.1c task 2 -- assertReleaseClear(): driveShot() TELEPORTS the ball
// to startMm, so nothing about that placement is ever verified reachable by
// a real shot. Two hazards this catches, both found empirically (this
// story's own planning pass, driving a ball at the measured maximum speed
// and reading the result, not by inspection): (a) DW-77 -- a release point
// inside a col_ body's own footprint; the solver ejects it (measured
// z -> -1.8e6 mm, 189 m/s) rather than resolving a real contact response;
// (b) a release point inside the very sw_ zone the case's own assertion
// checks closes -- AD-2 latches a make on the tick it is first observed, so
// that switch closes unconditionally on drive tick 1 regardless of whatever
// happens afterward, making the assertion vacuous.
// ---------------------------------------------------------------------------

/** Half the reference ball's own diameter (TABLE.reference.ballMm) -- the DW-77 clearance margin every release point must exceed. */
const RELEASE_CLEAR_MARGIN_MM = TABLE.reference.ballMm / 2;

function pointToSegmentDistanceMm(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) {
		return Math.hypot(px - ax, py - ay);
	}
	let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function pointInPolygon(px: number, py: number, poly: readonly { readonly x: number; readonly y: number }[]): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i]!;
		const b = poly[j]!;
		const intersects = a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x;
		if (intersects) {
			inside = !inside;
		}
	}
	return inside;
}

/** 0 if `(px, py)` is inside the (convex, per AD-11) `poly`; otherwise the shortest distance to any of its edges. */
function distanceToPolygonMm(px: number, py: number, poly: readonly { readonly x: number; readonly y: number }[]): number {
	if (pointInPolygon(px, py, poly)) {
		return 0;
	}
	let min = Infinity;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i]!;
		const b = poly[(i + 1) % poly.length]!;
		min = Math.min(min, pointToSegmentDistanceMm(px, py, a.x, a.y, b.x, b.y));
	}
	return min;
}

/**
 * Fails naming the body or zone if `startMm` is within `RELEASE_CLEAR_MARGIN_MM`
 * of any `col_` footprint, or inside the `sw_` zone of any switch named in
 * `switchesUnderTest` (the switches THIS case's own assertions require to
 * close -- not every zone on the table, only the ones a vacuous placement
 * would corrupt). Every `col_` node is checked: wall-shaped nodes read
 * their own `footprintMm` polygon; the two box-shaped flippers fall back to
 * their `bboxMm` rectangle; `plane`-shaped nodes (`col_playfield`,
 * `col_glass`) are not lateral obstacles and are skipped.
 */
function assertReleaseClear(startMm: { readonly x: number; readonly y: number }, switchesUnderTest: readonly SwitchName[] = []): void {
	const doc = readCollisionDoc();
	for (const node of doc.nodes) {
		if (node.shape === 'plane') {
			continue;
		}
		const footprint =
			node.footprintMm ?? [
				{ x: node.bboxMm.min.x, y: node.bboxMm.min.y },
				{ x: node.bboxMm.max.x, y: node.bboxMm.min.y },
				{ x: node.bboxMm.max.x, y: node.bboxMm.max.y },
				{ x: node.bboxMm.min.x, y: node.bboxMm.max.y },
			];
		const distMm = distanceToPolygonMm(startMm.x, startMm.y, footprint);
		expect(
			distMm,
			`assertReleaseClear(): release point (${startMm.x}, ${startMm.y}) is only ${distMm.toFixed(3)} mm from "${node.name}" -- driveShot() teleports the ball, so every release point must clear every col_ footprint by more than ${RELEASE_CLEAR_MARGIN_MM} mm (DW-77) or the solver ejects it`,
		).toBeGreaterThan(RELEASE_CLEAR_MARGIN_MM);
	}
	for (const switchName of switchesUnderTest) {
		for (const zone of doc.switchZones) {
			if (zone.switch !== switchName) {
				continue;
			}
			const inside = startMm.x >= zone.minMm.x && startMm.x <= zone.maxMm.x && startMm.y >= zone.minMm.y && startMm.y <= zone.maxMm.y;
			expect(
				inside,
				`assertReleaseClear(): release point (${startMm.x}, ${startMm.y}) is INSIDE "${zone.name}" (switch "${switchName}") -- driveShot() must not teleport the ball inside the zone this case asserts closes (AD-2 latches a make on the tick it is first observed), or the make is a placement artefact, not a result`,
			).toBe(false);
		}
	}
}

/** `driveShot()`, guarded by `assertReleaseClear()` -- every call site in this file goes through this, never the bare `driveShot()`. */
function driveShotChecked(
	startMm: { readonly x: number; readonly y: number; readonly z: number },
	speedMmPerS: number,
	dirDeg: number,
	ticks: number,
	switchesUnderTest: readonly SwitchName[] = [],
): ShotResult {
	assertReleaseClear(startMm, switchesUnderTest);
	return driveShot(startMm, speedMmPerS, dirDeg, ticks);
}

// Rework iteration 2, item (a): a ball bouncing in place on a flat-topped
// body (this rework's own measured evidence: parked to within 0.1 mm at
// 120000 ticks while still reading 33-125 mm/s of real, instantaneous
// speed -- a resting ball still carries velocity between bounces) passed
// the old speed-only check every time. NET positional progress over a
// trailing window is what actually distinguishes "still travelling" from
// "stuck oscillating": a ball genuinely rolling or falling covers real
// ground over half a second; one bouncing in a small patch does not,
// however fast it is at any single instant.
const PROGRESS_WINDOW_TICKS = 500;
// Comfortably above the reference ball's own diameter (26.99 mm, so this
// is a real net move, not a rounding artefact) and comfortably below what
// even a slow roll covers in PROGRESS_WINDOW_TICKS (500 ms).
const PROGRESS_MIN_DISPLACEMENT_MM = 15;

/** Net displacement between the earliest sample still inside the trailing `PROGRESS_WINDOW_TICKS` window and the last sample taken. `Infinity` (never fails the stranded check) when there are too few samples to judge -- that is a tick-budget problem for the caller to notice via DW-77's own `lastPosMm`-in-every-message discipline, not something this helper should paper over as a stall. */
function positionalProgressMm(samples: ShotResult['positionSamples']): number {
	if (samples.length < 2) {
		return Infinity;
	}
	const last = samples[samples.length - 1]!;
	let windowStart = samples[0]!;
	for (const s of samples) {
		if (last.tick - s.tick <= PROGRESS_WINDOW_TICKS) {
			windowStart = s;
			break;
		}
	}
	return Math.hypot(last.x - windowStart.x, last.y - windowStart.y);
}

/**
 * Story 2.1c task 1: the old `if (result.leftPlay) return` fully exempted
 * ANY run that eventually drained or parked, however it got there -- so a
 * ball that sat dead for 4900 of a 5000-tick budget and only trickled into
 * the trough over the final ~90 reported no stall at all (Code Map `:219-221`).
 * The trailing-window check now runs unconditionally: `positionSamples`
 * already stops recording the instant the ball leaves play, so the window
 * still ends at its true last-observed position whichever way the run
 * ended, and `positionalProgressMm()`'s own `< 2 samples -> Infinity`
 * convention (unchanged) still exempts a run that left play too fast to
 * ever be "stuck" in the first place.
 */
function assertNotStranded(result: ShotResult, label: string): void {
	const progressMm = positionalProgressMm(result.positionSamples);
	expect(
		progressMm,
		`${label}: the ball must not be permanently at rest -- net positional progress over the final ${PROGRESS_WINDOW_TICKS} ticks was only ${progressMm.toFixed(2)} mm (a ball bouncing in place at real instantaneous speed passes a speed-only check but fails this one -- Rework iteration 2, item (a)); terminal: "${result.terminal}", final pos: ${JSON.stringify(result.finalPosMm)}, final speed: ${result.finalSpeedMmPerS.toFixed(2)} mm/s`,
	).toBeGreaterThan(PROGRESS_MIN_DISPLACEMENT_MM);
}

/** The routing clause (AC 1, AC 3): the ball must genuinely arrive playable at a flipper -- `leftPlay` (a drain or a park) may never satisfy this. */
function assertReachesFlipperBand(result: ShotResult, label: string): void {
	expect(
		result.reachedFlipperBand,
		`${label}: the ball must reach a flipper-reachable band (left x [${FLIPPER_BAND_L.xMin}, ${FLIPPER_BAND_L.xMax}] or right x [${FLIPPER_BAND_R.xMin}, ${FLIPPER_BAND_R.xMax}], y [top-of-bat, 145]) moving downward at more than ${DESCENT_SPEED_FLOOR_MM_PER_S} mm/s -- terminal: "${result.terminal}", final pos: ${JSON.stringify(result.finalPosMm)}, left play: ${result.leftPlay}`,
	).toBe(true);
}

/**
 * Story 2.1c task 1: the liveness-only half of the old, conflated
 * `assertReachesFlipperBandOrLeavesPlay` -- checks only that the shot's
 * fate concluded within the tick budget (a flipper, a lane switch, or the
 * drain), never that it concluded WELL. `leftPlay` alone may never satisfy
 * the ROUTING clause (`assertReachesFlipperBand`, above) -- a drain and a
 * genuine flipper feed both set it identically.
 */
function assertNotStillInPlay(result: ShotResult, label: string): void {
	expect(
		result.terminal,
		`${label}: the ball must reach some terminal outcome (a flipper, a lane switch, or the drain) within the tick budget, not remain "still_in_play" -- final pos: ${JSON.stringify(result.finalPosMm)}, left play: ${result.leftPlay}`,
	).not.toBe('still_in_play');
}

/**
 * Story 2.1c: the four Loop switches in orbit order, on ONE ball. Each name
 * must close, and each must close after the one before it -- which is what
 * makes the sequence an orbit rather than four unrelated makes.
 */
function assertOrbitOrder(result: ShotResult, order: readonly SwitchName[]): void {
	const idx = order.map((name) => result.firstMakes.indexOf(name));
	order.forEach((name, k) => {
		expect(idx[k], `${name} must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
	});
	for (let k = 1; k < order.length; k++) {
		expect(
			idx[k],
			`${order[k]} must close AFTER ${order[k - 1]} (orbit approach order) -- makes: ${result.firstMakes.join(',')}`,
		).toBeGreaterThan(idx[k - 1]!);
	}
}

// Story 2.1c -- THE ORBIT. A Loop is an orbit (prd.md's own glossary, and
// the spine's carried acceptance "orbit exits feed the flippers"): the ball
// is shot up one lane, crosses the joined top, and descends the OTHER lane.
// So the Right Loop feeds the LEFT inlane and the Left Loop feeds the RIGHT
// one -- the opposite side, not the same side. Phase 1 authored these two
// cases against the same-side reading, which is the reading the geometry
// could not deliver and which the lead's own re-ordering retires; they are
// corrected here, with the observable STRENGTHENED rather than relaxed: each
// case now requires all FOUR Loop switches in approach order on ONE ball
// (DW-123's own single-ball orbit, AC 7), the far side's inlane switch, and
// a genuine flipper arrival, across a SWEEP of entry offsets rather than one
// centreline.
//
// The entry band is measured, not assumed: the shot climbs the column
// between the return rail's own tip and the lane's inner rail (see
// LOOP_LANE_CLEAR_MM's own derivation in tools/make-placeholder-blend.py).
// An offset outside that column is a MISS -- the ball never reaches the top
// turn and comes straight back down its own lane -- which is correct
// behaviour, not a defect, and is why the sweep samples inside the band
// rather than across the whole lane.
const LOOP_ENTRY_OFFSETS_MM = [28, 31, 34] as const;
const laneX0Mm = nodeBboxMm('col_wall_lane').min.x;

describe('shot routing (AC 1/AC 3/AC 7 behavioural half) -- Left Loop, the orbit', () => {
	it.each(LOOP_ENTRY_OFFSETS_MM.map((x) => ({ label: `entry offset ${x} mm`, x })))(
		'$label: one ball closes s_loop_l_in, s_loop_l_out, s_loop_r_out and s_loop_r_in in approach order, the orbit feeds the OPPOSITE (right) inlane, and the ball arrives playable at a bat',
		({ x }) => {
			const result = driveShotChecked({ x, y: 415, z: 13.5 }, 2200, 0, 9000, ['s_loop_l_in', 's_loop_l_out', 's_inlane_r']);
			assertOrbitOrder(result, ['s_loop_l_in', 's_loop_l_out', 's_loop_r_out', 's_loop_r_in']);
			// Story 2.1c review fix (verification-gap finding): col_spinner_l
			// moved this story from the loop guide's own inner face to the
			// perimeter face; no test anywhere (registry-only checks in
			// test/table.test.ts / test/collision-loader.test.ts aside) ever
			// drove a ball through its actual physical location, so a
			// measurement error in the relocation could silently stop the
			// spinner from counting rollovers with a fully green suite.
			// Verified empirically (this fix's own diagnostic pass) that
			// s_spinner closes on the Left Loop's own ascending entry, at
			// every offset in this sweep.
			// mutation: move col_spinner_l's own x/y so it no longer sits
			// inside this ascending column and re-export -> s_spinner is
			// absent from firstMakes below.
			expect(result.firstMakes, `s_spinner must close on the Left Loop's own ascending entry -- makes: ${result.firstMakes.join(',')}`).toContain('s_spinner');
			expect(result.firstMakes, `s_inlane_r must close -- the Left Loop is an ORBIT and returns down the RIGHT lane, so it feeds the RIGHT inlane -- makes: ${result.firstMakes.join(',')}`).toContain('s_inlane_r');
			assertNotStranded(result, 'Left Loop');
			assertReachesFlipperBand(result, 'Left Loop');
		},
	);
});

describe('shot routing (AC 1/AC 3/AC 7 behavioural half) -- Right Loop, the orbit', () => {
	it.each(LOOP_ENTRY_OFFSETS_MM.map((x) => ({ label: `entry offset ${x} mm`, x: laneX0Mm - x })))(
		'$label: one ball closes s_loop_r_in, s_loop_r_out, s_loop_l_out and s_loop_l_in in approach order, the orbit feeds the OPPOSITE (left) inlane, and the ball arrives playable at a bat',
		({ x }) => {
			const result = driveShotChecked({ x, y: 415, z: 13.5 }, 2200, 0, 9000, ['s_loop_r_in', 's_loop_r_out', 's_inlane_l']);
			assertOrbitOrder(result, ['s_loop_r_in', 's_loop_r_out', 's_loop_l_out', 's_loop_l_in']);
			expect(result.firstMakes, `s_inlane_l must close -- the Right Loop is an ORBIT and returns down the LEFT lane, so it feeds the LEFT inlane -- makes: ${result.firstMakes.join(',')}`).toContain('s_inlane_l');
			assertNotStranded(result, 'Right Loop');
			assertReachesFlipperBand(result, 'Right Loop');
		},
	);
});

// DW-123, stated as its own case so the ledger entry has one assertion to
// point at: ONE ball, all four Loop switches. Both describes above prove it
// too, deliberately -- the ledger's own complaint was that no test anywhere
// showed a single ball closing both Loops' pairs, and once the top connector
// is re-joined the orbit makes that the ORDINARY case rather than a special
// one.
describe('shot routing (AC 7, DW-123) -- the re-joined top connector: ONE ball closes both Loops\' switches', () => {
	it('a single Right Loop shot closes s_loop_r_in, s_loop_r_out, s_loop_l_out and s_loop_l_in in one run', () => {
		const result = driveShotChecked({ x: laneX0Mm - 31, y: 415, z: 13.5 }, 2200, 0, 9000, ['s_loop_r_in', 's_loop_r_out']);
		for (const name of ['s_loop_r_in', 's_loop_r_out', 's_loop_l_out', 's_loop_l_in'] as const) {
			expect(result.firstMakes, `${name} must close on THIS ball -- makes: ${result.firstMakes.join(',')}`).toContain(name);
		}
		// mutation: shorten col_loop_top's left end back to x = 220 in the
		// seeding script and re-export -> this goes red (the ball drops into open
		// field partway across instead of reaching the far lane), reproducing
		// exactly the gap DW-123 records.
		expect(result.firstMakes.indexOf('s_loop_l_in'), 'the far Loop\'s own entrance switch closes LAST -- the ball leaves the orbit through it').toBeGreaterThan(result.firstMakes.indexOf('s_loop_l_out'));
	});
});

describe('shot routing (AC 1/AC 3 behavioural half) -- Ramp', () => {
	it('s_ramp_enter then s_ramp_made close in order (right of centre, the left flipper\'s own shot), and the ball reaches the right inlane feed onto the RIGHT flipper', () => {
		const doc = readCollisionDoc();
		expect(TABLE.reference.playfieldMm.w / 2, 'sanity: the Ramp entrance must be right of centre').toBeLessThan(
			doc.nodes.find((n) => n.name === 'col_ramp_wall_l')!.bboxMm.min.x,
		);
		// Story 2.1c: the Ramp moved west (RAMP_ENTER_X_MM 372 -> 355) to free
		// the widened Right Loop lane, and its entrance rose (RAMP_ENTER_Y_MM
		// 470 -> 485) to clear the re-sited right slingshot; the release moves
		// with it, and assertReleaseClear() is what caught both.
		const result = driveShotChecked({ x: 355, y: 465, z: 13.5 }, 2400, 0, 9000, ['s_ramp_enter', 's_ramp_made', 's_inlane_r']);
		const enterIdx = result.firstMakes.indexOf('s_ramp_enter');
		const madeIdx = result.firstMakes.indexOf('s_ramp_made');
		expect(enterIdx, `s_ramp_enter must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(madeIdx, `s_ramp_made must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(madeIdx, 's_ramp_made must close AFTER s_ramp_enter').toBeGreaterThan(enterIdx);
		// OQ-6/FR-27 (decided): the Ramp's return must deliver to the RIGHT
		// inlane. Checked explicitly, not inferred from reachedFlipperBand
		// alone -- Story 2.1c's own planning pass found a fluke path on the
		// UNFIXED geometry that reaches a flipper band by accident (the ball
		// sails past the return rail entirely at this shot speed, since
		// nothing caps the open top of the ramp channel, bounces off
		// unrelated geometry near the top of the table, and happens to fall
		// back through the right flipper band on its way to a CENTRE drain)
		// without ever closing s_inlane_r -- reachedFlipperBand alone would
		// have missed that this shot is not genuinely routed.
		expect(result.firstMakes, `s_inlane_r must close -- the Ramp's return must feed the right INLANE (OQ-6/FR-27) -- makes: ${result.firstMakes.join(',')}`).toContain('s_inlane_r');
		assertNotStranded(result, 'Ramp');
		assertReachesFlipperBand(result, 'Ramp');
	});
});

// Story 2.1c's own I/O & Edge-Case Matrix, "Centre drain must not read as a
// flipper feed" row -- the exact vacuity the pin repair (task 1) exists to
// close: the OLD single FLIPPER_BAND (x 140..375) contained the centre
// drain corridor (x 240.875..273.525, between col_guide_outer_l/r), so a
// dead-centre drain satisfied "reached a flipper". FLIPPER_BAND_L/_R
// (above) exclude that corridor BY CONSTRUCTION -- each band is anchored on
// its own bat's x-span, and neither bat's x-span reaches the centre -- but
// that structural guarantee was never exercised behaviourally until this
// case: a ball genuinely released on the centreline and driven through the
// real physics pipeline, read via the same ShotResult fields (terminal,
// reachedFlipperBand) every other case in this file uses.
describe('shot routing (matrix row: centre drain must not read as a flipper feed) -- dead-centre descent', () => {
	it('a ball released on the centreline and descending straight through the centre drain corridor leaves play WITHOUT ever reaching a flipper band, classified centre_drain', () => {
		// 257.2 -- TABLE.reference.playfieldMm.w / 2 -- sits inside the
		// 240.875..273.525 corridor the matrix row names, symmetric between
		// col_guide_outer_l/r (test/drain-routing.test.ts's own "centre
		// channel" describe block already measured this exact release point
		// clear, with 0.00 mm lateral drift and drainage by tick 911 -- this
		// solver's gravity has no x-component, so a centred release cannot
		// drift regardless of geometry).
		const centreXMm = TABLE.reference.playfieldMm.w / 2;
		// Near-zero initial speed: gravity alone drives the fall, the same
		// "drop" convention the descending-release sweep below uses.
		const result = driveShotChecked({ x: centreXMm, y: 200, z: 13.5 }, 1, 0, 6600, []);
		expect(
			result.leftPlay,
			`the ball must leave play (drain) within the tick budget for this case to be evidence -- final pos: ${JSON.stringify(result.finalPosMm)}, terminal: "${result.terminal}"`,
		).toBe(true);
		expect(
			result.reachedFlipperBand,
			`a dead-centre descent must NEVER read as "reached a flipper" -- mutation: widen FLIPPER_BAND_L/_R back to the pre-2.1c span (x 140..375) -> this goes red, which is exactly the vacuity the repair closes; makes: ${result.firstMakes.join(',')}, final pos: ${JSON.stringify(result.finalPosMm)}`,
		).toBe(false);
		expect(result.terminal, `terminal must classify as centre_drain, not "flipper" -- makes: ${result.firstMakes.join(',')}`).toBe('centre_drain');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- Dragon body', () => {
	it('a slightly-off Lock-lane shot strikes the body face (s_dragon_body closes), and the ball is not stranded', () => {
		// x = 140: inside col_dragon_leg_l's own x-span (90..150) but clear of
		// the left slingshot's own footprint (70..130, y 420..455), which
		// otherwise sits directly in a straight vertical path to the leg's
		// face -- found and verified this story's own planning pass.
		const result = driveShotChecked({ x: 140, y: 380, z: 13.5 }, 1500, 0, 5000, ['s_dragon_body']);
		expect(result.firstMakes, `s_dragon_body must close -- makes: ${result.firstMakes.join(',')}`).toContain('s_dragon_body');
		assertNotStranded(result, 'Dragon body');
		assertNotStillInPlay(result, 'Dragon body');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- Lock lane', () => {
	it('a precise shot up the centreline threads the Lock lane (s_lock_lane closes) without striking either leg', () => {
		// Two separate drives, deliberately: "does THIS shot clip a leg on
		// its own way through" is a claim about the immediate approach, not
		// about the ball's whole subsequent life on the table. Found this
		// rework's own review pass: raising the tick budget to observe the
		// eventual fate (item (c)) also let a genuinely UNRELATED later
		// event into `firstMakes` -- past the open lock lane the ball
		// sails on, clips the pop bumpers (s_pop_3, s_pop_1), ricochets back
		// down and THEN grazes a leg (s_dragon_body) around tick 2515,
		// thousands of ticks after clearing the lock lane -- before finally
		// draining normally (leftPlay). That is ordinary continued
		// gameplay, not the shot this test is pinning; asserting against it
		// would make the leg-clip check meaningless (anything that plays
		// long enough eventually touches something). The short drive below
		// is bounded to the shot's own immediate approach (500 ticks --
		// comfortably past DRAGON_LEG_Y1_MM = 620, this file's own original
		// budget for exactly this reason); the long drive covers the
		// eventual-fate assertions item (c) actually calls for.
		const immediate = driveShotChecked({ x: 170, y: 380, z: 13.5 }, 1600, 0, 500, ['s_lock_lane']);
		expect(immediate.firstMakes, `s_lock_lane must close -- makes: ${immediate.firstMakes.join(',')}`).toContain('s_lock_lane');
		expect(immediate.firstMakes, 'a precise centreline shot must not also strike a leg face on its own way through').not.toContain('s_dragon_body');

		const result = driveShotChecked({ x: 170, y: 380, z: 13.5 }, 1600, 0, 5000, ['s_lock_lane']);
		assertNotStranded(result, 'Lock lane');
		assertNotStillInPlay(result, 'Lock lane');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- DRAGON bank', () => {
	const bankLetters: readonly SwitchName[] = ['s_dragon_d', 's_dragon_r', 's_dragon_a', 's_dragon_g', 's_dragon_o', 's_dragon_n'];
	it.each([
		// Story 2.1c: the bank moved 20 mm west (DRAGON_BANK_X0_MM 255 -> 235)
		// so col_ramp_wall_l could clear the widened Right Loop lane; both
		// releases move with it, and the right one also has to stay clear of
		// the re-sited col_sling_r (314..370.4).
		// The reachable approach corridor to the bank is now bounded by
		// col_guide_outer_r's own east face (279.5) and the re-sited
		// col_sling_r's own west face (314), so both offsets sit inside it --
		// x 293..300.5 for a ball's own centre. assertReleaseClear() rejected
		// the wider pair this story first tried.
		{ label: 'left column of the corridor', x: 294 },
		{ label: 'right column of the corridor', x: 300 },
	])('$label: at least one DRAGON-bank target closes, and the ball is not stranded', ({ x }) => {
		const result = driveShotChecked({ x, y: 400, z: 13.5 }, 1600, 0, 5000, bankLetters);
		const hitAny = result.firstMakes.some((s) => bankLetters.includes(s));
		expect(hitAny, `at least one s_dragon_[d,r,a,g,o,n] must close -- makes: ${result.firstMakes.join(',')}`).toBe(true);
		assertNotStranded(result, 'DRAGON bank');
		assertNotStillInPlay(result, 'DRAGON bank');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- Top lanes', () => {
	it.each([
		// Story 2.1c task 2: lane 1's release moved 145 -> 110. 145 sat inside
		// sw_pop_3's own zone (x 142..218, y 832..908) -- a switch-zone
		// contamination this file's own Code Map flagged, though not a col_
		// footprint embed. The obvious replacement, x = 130, is col_pop_1's
		// own centre x -- the ball descends dead onto that octagon's single
		// apex vertex after bouncing off the top wall and settles into a
		// perfectly balanced, permanently stranded equilibrium (measured:
		// pinned to y = 833.5 +/- 0.05 mm for the remaining ~5600 ticks) --
		// this solver's own version of the DW-119 flat-face trap, but for a
		// single symmetric vertex under x-free gravity rather than a flat
		// face. x = 110 (verified this story's own diagnostic pass) makes a
		// genuinely off-centre, asymmetric graze instead and drains cleanly.
		{ label: 'lane 1', x: 110, expected: 's_top_1' as SwitchName },
		{ label: 'lane 2', x: 245, expected: 's_top_2' as SwitchName },
		{ label: 'lane 3', x: 345, expected: 's_top_3' as SwitchName },
	])('$label: its own top-lane switch closes on a ball entering from below, and the ball is not stranded', ({ x, expected }) => {
		const result = driveShotChecked({ x, y: 900, z: 13.5 }, 1500, 0, 6600, [expected]);
		expect(result.firstMakes, `${expected} must close -- makes: ${result.firstMakes.join(',')}`).toContain(expected);
		assertNotStranded(result, `Top lane (${expected})`);
		assertNotStillInPlay(result, `Top lane (${expected})`);
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- both slingshots', () => {
	it.each([
		// Story 2.1c: both slingshots moved inboard (the corridor between each
		// divider guide and its own sling measured 23.1 mm on the left and
		// 11.5 mm on the right against a 26.99 mm ball -- the inlanes were not
		// merely unfed, they were physically unreachable). Both releases move
		// with them, and both now clear the new col_guide_inlane_l/_r too.
		{ label: 'left slingshot', x: 115, y: 370, dirDeg: -10, switchName: 's_sling_l' as SwitchName },
		{ label: 'right slingshot', x: 350, y: 370, dirDeg: 10, switchName: 's_sling_r' as SwitchName },
	])('$label: its own switch closes, and the miss reaches an inlane or drains rather than stranding', ({ x, y, dirDeg, switchName }) => {
		const result = driveShotChecked({ x, y, z: 13.5 }, 1200, dirDeg, 5000, [switchName]);
		expect(result.firstMakes, `${switchName} must close -- makes: ${result.firstMakes.join(',')}`).toContain(switchName);
		assertNotStranded(result, `Slingshot (${switchName})`);
		assertNotStillInPlay(result, `Slingshot (${switchName})`);
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- the three pop bumpers', () => {
	it.each([
		{ label: 'pop 1', x: 130, y: 700, switchName: 's_pop_1' as SwitchName },
		// Story 2.1c task 2: y moved from targetY-100 (700, unchanged) is fine
		// here, but x moved 230 -> 220 -- (230, 700) sat 0.69 mm inside
		// col_dragon_bank_backstop's own sloped corner (Code Map). Then
		// 220 -> 200 in Phase 2, when the DRAGON bank moved 20 mm west
		// (DRAGON_BANK_X0_MM 255 -> 235) to clear the widened Right Loop
		// lane and carried its backstop with it (x 240..341 -> 220..321),
		// putting 220 back inside the same corner. [The "230 -> 220" half of
		// this comment stood alone against a shipped 200 until 2026-09-03;
		// completed at code review, no release point moved.]
		{ label: 'pop 2', x: 200, y: 700, switchName: 's_pop_2' as SwitchName },
		{ label: 'pop 3', x: 180, y: 770, switchName: 's_pop_3' as SwitchName },
	])('$label: its own switch closes on a ball rolled toward it, and the ball is not stranded', ({ x, y, switchName }) => {
		const result = driveShotChecked({ x, y, z: 13.5 }, 1000, 0, 6600, [switchName]);
		expect(result.firstMakes, `${switchName} must close -- makes: ${result.firstMakes.join(',')}`).toContain(switchName);
		assertNotStranded(result, `Pop bumper (${switchName})`);
		assertNotStillInPlay(result, `Pop bumper (${switchName})`);
	});
});

// Rework iteration 2, item (e): every case above shoots the ball UPWARD
// from y >= 380, so nothing ever descended onto the new bodies from above
// -- the only direction that produced the eleven measured stalls (this
// rework's own investigation: a plain axis-aligned rectangle's north edge
// is exactly perpendicular to this solver's gravity, so a ball landing on
// it from above has zero tangential force and parks). This sweep drops a
// ball (near-zero initial speed, so gravity alone drives it) from directly
// above each body the rework's own bevel fix (tools/make-placeholder-
// blend.py's add_box_wall_sloped()) addressed, and asserts genuine
// positional progress -- the exact mutation this rework's own review
// demands: reverting one body's bevel back to add_box_wall() (a flat north
// face) must turn its own case here red.
//
// Story 2.1c task 2: two columns were mislabelled and landed inside a
// DIFFERENT body than the one named -- "left slingshot (col_sling_l)" at
// (100, 500) was fully inside col_dragon_leg_l (y 500 is past the sling's
// own north face at 455, already inside the leg's own y-span starting at
// 480), and "right slingshot" at (385, 500) was 9.50 mm inside
// col_ramp_wall_r AND inside sw_ramp_enter -- neither actually swept
// col_sling_l/_r's own rebevelled face at all. Both moved to sit directly
// above their OWN named body's own north face instead. "DRAGON bank,
// col_dragon_n" moved 330.5 -> 326 (1.00 mm short of col_ramp_wall_l).
// A new column, "Ramp right wall cap (col_ramp_wall_r)", covers the
// dead-flat north cap at y = 825, x 389..401 -- ungated before this task
// (Code Map: "the descending sweep has no column there").
describe('shot routing (AC 1 behavioural half, Rework iteration 2 item (e)) -- descending release onto the rebevelled flat-topped bodies', () => {
	it.each([
		// Story 2.1c: every column below is re-sited over the body it names,
		// because this story moved most of them (both slingshots inboard, the
		// Ramp west and up, the DRAGON bank west). Two NEW flat-topped bodies
		// join the sweep as well -- col_ramp_turn's own cap and
		// col_loop_r_lower's -- both authored by this story and both bevelled
		// for the same DW-119 reason as the rest.
		{ label: 'left slingshot (col_sling_l)', x: 115, y: 465 },
		{ label: 'right slingshot (col_sling_r)', x: 350, y: 465 },
		{ label: 'left Dragon leg (col_dragon_leg_l)', x: 120, y: 660 },
		{ label: 'right Dragon leg (col_dragon_leg_r)', x: 220, y: 660 },
		{ label: 'Ramp left wall (col_ramp_wall_l)', x: 332, y: 880 },
		{ label: 'Ramp right wall cap (col_ramp_wall_r)', x: 376, y: 758 },
		{ label: 'Ramp top turn cap (col_ramp_turn)', x: 360, y: 895 },
		// col_loop_r_lower's own cap has no column of its own: the gap between
		// it and col_ramp_return_1 above measures 13 mm, under the reference
		// ball, so nothing can be dropped onto it from directly above. It is
		// exercised instead by the Ramp case, whose return lands on it and
		// slides east off it on every made shot (traced).
		{ label: 'Ramp return rail (col_ramp_return_1)', x: 396, y: 800 },
		{ label: 'DRAGON bank, col_dragon_d (leftmost target)', x: 240, y: 750 },
		{ label: 'DRAGON bank, col_dragon_n (rightmost target)', x: 310, y: 750 },
	])('$label: a ball dropped from directly above makes genuine positional progress rather than parking on the flat-topped body\'s own north face', ({ x, y }) => {
		const result = driveShotChecked({ x, y, z: 13.5 }, 1, 0, 6600, []);
		assertNotStranded(result, `Descending release (${x}, ${y})`);
	});
});
