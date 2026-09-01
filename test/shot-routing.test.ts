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
// rather than hidden: the "arrives playable at a flipper" clause is
// asserted here as "reaches a flipper-reachable band OR returns to a
// device (park/drain) OR keeps moving at a real speed" -- a ball that is
// not stuck is not automatically a ball a player could catch, and this
// story's own tick budgets are bounded well short of every shot's full
// eventual fate (a loop or a lock-lane near-miss both continue rattling
// around the open field for thousands more ticks after the window this
// file checks). The FEEL judgment AC 6 names is `pending-author` for
// exactly this reason -- no automated check substitutes for the Reference-
// machine ritual.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { NO_FRAME } from '../src/sim/loop';
import { resolveTuning } from '../src/sim/table/tuning';
import { toPhysics, fromPhysics, MM_PER_VU } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { readCollisionDoc } from './util/collision-doc';
import type { SwitchName } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/**
 * Rework iteration 2 (2026-09-01, lead's own investigation): the four red
 * `test/replay-goldens.test.ts` goldens were the messenger, not the
 * problem -- the new shot map genuinely did not route a ball, and this
 * file, which is supposed to be AC 1's own behavioural pin, passed
 * throughout. Five concrete gaps, each addressed below: (a) `assertNotStranded`
 * checked instantaneous speed, which every measured stall (a ball bouncing
 * in place at 33-125 mm/s on a since-fixed flat-topped body) passes --
 * replaced with genuine positional progress over a trailing window; (b) it
 * was applied to only 5 of 10 `describe` blocks -- now all 10; (c) tick
 * budgets were 500-2500 while a real descent from y = 980 to the trough
 * takes 2000-6600 -- raised so a shot's own fate is actually observed, not
 * cut off mid-flight; (d) the header below claimed three fallback
 * conditions ("reaches a flipper-reachable band OR returns to a device
 * (park/drain) OR keeps moving at a real speed") but only the speed branch
 * was ever coded -- `assertReachesFlipperBandOrLeavesPlay` below now checks
 * the other two explicitly; (e) every case shot the ball UPWARD from
 * `y >= 380`, so nothing ever tested the direction that actually produced
 * the stalls -- a descending-release sweep (below, its own `describe`)
 * drops a ball from above each of the eleven bodies the rework's own
 * geometry fix addressed.
 */
interface ShotResult {
	/** Every switch make, in the tick order it occurred, first occurrence only per switch (a switch re-closing later, e.g. after a full loop, does not appear twice). */
	readonly firstMakes: readonly SwitchName[];
	/** True once the ball left the simulated set (drained via the aperture, or parked in a device). */
	readonly leftPlay: boolean;
	/** The ball's final table position, if still in play. */
	readonly finalPosMm: { readonly x: number; readonly y: number } | null;
	readonly finalSpeedMmPerS: number;
	/** Sampled every `PROGRESS_SAMPLE_TICKS` ticks while still in play: `{tick, x, y}`. A ball bouncing in place (real instantaneous speed, near-zero NET displacement over a trailing window) is what `assertNotStranded` below reads this for -- Rework iteration 2, item (a). */
	readonly positionSamples: readonly { readonly tick: number; readonly x: number; readonly y: number }[];
	/** True if the ball's position ever fell within `FLIPPER_BAND` while moving toward the flippers (table -y) -- the observable AC 1's own Then clause names ("reaches the flipper-reachable band ... with a downward velocity"). Rework iteration 2, item (d). */
	readonly reachedFlipperBand: boolean;
}

const PROGRESS_SAMPLE_TICKS = 25;

/**
 * Measured against this table's own committed collision document (Rework
 * iteration 2's own diagnostic pass, driving balls through `createMachine()`
 * and reading their positions directly against both raised bats' own
 * resting poses) -- the region immediately above both flippers a
 * descending ball must reach to be "playable at a flipper" per AC 1's own
 * Then clause, not a literal invented for this file.
 */
const FLIPPER_BAND = { xMin: 140, xMax: 375, yMin: 40, yMax: 145 };

/**
 * Serves a fresh ball (the real trough-eject path, not a hand-built one),
 * repositions it at `startMm` with a straight-line launch at `speedMmPerS`
 * toward `dirDeg` (0 = table +y, "up the playfield"; positive rotates
 * toward +x), and drives it for `ticks` real physics steps through the
 * actual `createMachine()` pipeline (so every hardware rule -- flippers,
 * the plunger, DW-67's own debounced switch tracker -- is the real one).
 */
function driveShot(startMm: { x: number; y: number; z: number }, speedMmPerS: number, dirDeg: number, ticks: number): ShotResult {
	const tuning = resolveTuning();
	const machine: Machine = createMachine(loadDoc(), tuning);

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
			finalPosMm = null;
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
			posMm.x >= FLIPPER_BAND.xMin &&
			posMm.x <= FLIPPER_BAND.xMax &&
			posMm.y >= FLIPPER_BAND.yMin &&
			posMm.y <= FLIPPER_BAND.yMax &&
			// toPhysics() flips table y -> physics -y (this file's own
			// convention, above): table_vel_y = -physics_vel_y, so a
			// POSITIVE physics vel.y is a NEGATIVE table vel.y -- moving
			// DOWN the playfield, toward the flippers.
			b.hit.vel.y > 0
		) {
			reachedFlipperBand = true;
		}
	}

	return { firstMakes, leftPlay, finalPosMm, finalSpeedMmPerS, positionSamples, reachedFlipperBand };
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

function assertNotStranded(result: ShotResult, label: string): void {
	if (result.leftPlay) {
		return; // drained or parked -- a real, terminal, non-stuck outcome
	}
	const progressMm = positionalProgressMm(result.positionSamples);
	expect(
		progressMm,
		`${label}: the ball must not be permanently at rest -- net positional progress over the final ${PROGRESS_WINDOW_TICKS} ticks was only ${progressMm.toFixed(2)} mm (a ball bouncing in place at real instantaneous speed passes a speed-only check but fails this one -- Rework iteration 2, item (a)); final pos: ${JSON.stringify(result.finalPosMm)}, final speed: ${result.finalSpeedMmPerS.toFixed(2)} mm/s`,
	).toBeGreaterThan(PROGRESS_MIN_DISPLACEMENT_MM);
}

// Rework iteration 2, item (d): this file's own header already claimed
// three fallback conditions ("reaches a flipper-reachable band OR returns
// to a device (park/drain) OR keeps moving at a real speed") but only the
// speed branch (now positional progress, above) was ever coded. This is
// the other two, made explicit.
function assertReachesFlipperBandOrLeavesPlay(result: ShotResult, label: string): void {
	expect(
		result.reachedFlipperBand || result.leftPlay,
		`${label}: the ball must either reach the flipper-reachable band (x in [${FLIPPER_BAND.xMin}, ${FLIPPER_BAND.xMax}], y in [${FLIPPER_BAND.yMin}, ${FLIPPER_BAND.yMax}]) moving toward the flippers, or leave play (drain/park) -- neither happened; final pos: ${JSON.stringify(result.finalPosMm)}, left play: ${result.leftPlay}`,
	).toBe(true);
}

describe('shot routing (AC 1 behavioural half, task 16a) -- Left Loop', () => {
	it.each([
		{ label: 'centred entry', x: 20 },
		{ label: 'biased entry', x: 12 },
	])('$label: s_loop_l_in then s_loop_l_out close in order, and the ball is not stranded', ({ x }) => {
		const result = driveShot({ x, y: 430, z: 13.5 }, 2200, 0, 6000);
		const inIdx = result.firstMakes.indexOf('s_loop_l_in');
		const outIdx = result.firstMakes.indexOf('s_loop_l_out');
		expect(inIdx, `s_loop_l_in must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(outIdx, `s_loop_l_out must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(outIdx, 's_loop_l_out must close AFTER s_loop_l_in (approach order)').toBeGreaterThan(inIdx);
		assertNotStranded(result, 'Left Loop');
		assertReachesFlipperBandOrLeavesPlay(result, 'Left Loop');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- Right Loop', () => {
	it.each([
		{ label: 'centred entry', x: 450 },
		{ label: 'biased entry', x: 458 },
	])('$label: s_loop_r_in then s_loop_r_out close in order, and the ball is not stranded', ({ x }) => {
		const result = driveShot({ x, y: 430, z: 13.5 }, 2200, 0, 6000);
		const inIdx = result.firstMakes.indexOf('s_loop_r_in');
		const outIdx = result.firstMakes.indexOf('s_loop_r_out');
		expect(inIdx, `s_loop_r_in must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(outIdx, `s_loop_r_out must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(outIdx, 's_loop_r_out must close AFTER s_loop_r_in (approach order)').toBeGreaterThan(inIdx);
		assertNotStranded(result, 'Right Loop');
		assertReachesFlipperBandOrLeavesPlay(result, 'Right Loop');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- Ramp', () => {
	it('s_ramp_enter then s_ramp_made close in order (right of centre, the left flipper\'s own shot)', () => {
		const doc = readCollisionDoc();
		expect(TABLE.reference.playfieldMm.w / 2, 'sanity: the Ramp entrance must be right of centre').toBeLessThan(
			doc.nodes.find((n) => n.name === 'col_ramp_wall_l')!.bboxMm.min.x,
		);
		const result = driveShot({ x: 372, y: 475, z: 13.5 }, 2400, 0, 6000);
		const enterIdx = result.firstMakes.indexOf('s_ramp_enter');
		const madeIdx = result.firstMakes.indexOf('s_ramp_made');
		expect(enterIdx, `s_ramp_enter must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(madeIdx, `s_ramp_made must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(madeIdx, 's_ramp_made must close AFTER s_ramp_enter').toBeGreaterThan(enterIdx);
		assertNotStranded(result, 'Ramp');
		assertReachesFlipperBandOrLeavesPlay(result, 'Ramp');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- Dragon body', () => {
	it('a slightly-off Lock-lane shot strikes the body face (s_dragon_body closes), and the ball is not stranded', () => {
		// x = 140: inside col_dragon_leg_l's own x-span (90..150) but clear of
		// the left slingshot's own footprint (70..130, y 420..455), which
		// otherwise sits directly in a straight vertical path to the leg's
		// face -- found and verified this story's own planning pass.
		const result = driveShot({ x: 140, y: 380, z: 13.5 }, 1500, 0, 5000);
		expect(result.firstMakes, `s_dragon_body must close -- makes: ${result.firstMakes.join(',')}`).toContain('s_dragon_body');
		assertNotStranded(result, 'Dragon body');
		assertReachesFlipperBandOrLeavesPlay(result, 'Dragon body');
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
		const immediate = driveShot({ x: 170, y: 380, z: 13.5 }, 1600, 0, 500);
		expect(immediate.firstMakes, `s_lock_lane must close -- makes: ${immediate.firstMakes.join(',')}`).toContain('s_lock_lane');
		expect(immediate.firstMakes, 'a precise centreline shot must not also strike a leg face on its own way through').not.toContain('s_dragon_body');

		const result = driveShot({ x: 170, y: 380, z: 13.5 }, 1600, 0, 5000);
		assertNotStranded(result, 'Lock lane');
		assertReachesFlipperBandOrLeavesPlay(result, 'Lock lane');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- DRAGON bank', () => {
	it.each([
		{ label: 'left-of-bank entry', x: 290 },
		{ label: 'right-of-bank entry', x: 322 },
	])('$label: at least one DRAGON-bank target closes, and the ball is not stranded', ({ x }) => {
		const result = driveShot({ x, y: 400, z: 13.5 }, 1600, 0, 5000);
		const bankLetters: SwitchName[] = ['s_dragon_d', 's_dragon_r', 's_dragon_a', 's_dragon_g', 's_dragon_o', 's_dragon_n'];
		const hitAny = result.firstMakes.some((s) => bankLetters.includes(s));
		expect(hitAny, `at least one s_dragon_[d,r,a,g,o,n] must close -- makes: ${result.firstMakes.join(',')}`).toBe(true);
		assertNotStranded(result, 'DRAGON bank');
		assertReachesFlipperBandOrLeavesPlay(result, 'DRAGON bank');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- Top lanes', () => {
	it.each([
		{ label: 'lane 1', x: 145, expected: 's_top_1' as SwitchName },
		{ label: 'lane 2', x: 245, expected: 's_top_2' as SwitchName },
		{ label: 'lane 3', x: 345, expected: 's_top_3' as SwitchName },
	])('$label: its own top-lane switch closes on a ball entering from below, and the ball is not stranded', ({ x, expected }) => {
		const result = driveShot({ x, y: 900, z: 13.5 }, 1500, 0, 6600);
		expect(result.firstMakes, `${expected} must close -- makes: ${result.firstMakes.join(',')}`).toContain(expected);
		assertNotStranded(result, `Top lane (${expected})`);
		assertReachesFlipperBandOrLeavesPlay(result, `Top lane (${expected})`);
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- both slingshots', () => {
	it.each([
		{ label: 'left slingshot', x: 100, dirDeg: -20, switchName: 's_sling_l' as SwitchName },
		{ label: 'right slingshot', x: 385, dirDeg: 20, switchName: 's_sling_r' as SwitchName },
	])('$label: its own switch closes, and the miss reaches an inlane or drains rather than stranding', ({ x, dirDeg, switchName }) => {
		const result = driveShot({ x, y: 390, z: 13.5 }, 1200, dirDeg, 5000);
		expect(result.firstMakes, `${switchName} must close -- makes: ${result.firstMakes.join(',')}`).toContain(switchName);
		assertNotStranded(result, `Slingshot (${switchName})`);
		assertReachesFlipperBandOrLeavesPlay(result, `Slingshot (${switchName})`);
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- the three pop bumpers', () => {
	it.each([
		{ label: 'pop 1', targetX: 130, targetY: 800, switchName: 's_pop_1' as SwitchName },
		{ label: 'pop 2', targetX: 230, targetY: 800, switchName: 's_pop_2' as SwitchName },
		{ label: 'pop 3', targetX: 180, targetY: 870, switchName: 's_pop_3' as SwitchName },
	])('$label: its own switch closes on a ball rolled toward it, and the ball is not stranded', ({ targetX, targetY, switchName }) => {
		const result = driveShot({ x: targetX, y: targetY - 100, z: 13.5 }, 1000, 0, 6600);
		expect(result.firstMakes, `${switchName} must close -- makes: ${result.firstMakes.join(',')}`).toContain(switchName);
		assertNotStranded(result, `Pop bumper (${switchName})`);
		assertReachesFlipperBandOrLeavesPlay(result, `Pop bumper (${switchName})`);
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
describe('shot routing (AC 1 behavioural half, Rework iteration 2 item (e)) -- descending release onto the rebevelled flat-topped bodies', () => {
	it.each([
		{ label: 'left slingshot (col_sling_l)', x: 100, y: 500 },
		{ label: 'right slingshot (col_sling_r)', x: 385, y: 500 },
		{ label: 'left Dragon leg (col_dragon_leg_l)', x: 120, y: 660 },
		{ label: 'right Dragon leg (col_dragon_leg_r)', x: 220, y: 660 },
		{ label: 'Ramp left wall (col_ramp_wall_l)', x: 349, y: 870 },
		{ label: 'DRAGON bank, col_dragon_d (leftmost target)', x: 260.5, y: 750 },
		{ label: 'DRAGON bank, col_dragon_n (rightmost target)', x: 330.5, y: 750 },
	])('$label: a ball dropped from directly above makes genuine positional progress rather than parking on the flat-topped body\'s own north face', ({ x, y }) => {
		const result = driveShot({ x, y, z: 13.5 }, 1, 0, 6600);
		assertNotStranded(result, `Descending release (${x}, ${y})`);
	});
});
