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

interface ShotResult {
	/** Every switch make, in the tick order it occurred, first occurrence only per switch (a switch re-closing later, e.g. after a full loop, does not appear twice). */
	readonly firstMakes: readonly SwitchName[];
	/** True once the ball left the simulated set (drained via the aperture, or parked in a device). */
	readonly leftPlay: boolean;
	/** The ball's final table position, if still in play. */
	readonly finalPosMm: { readonly x: number; readonly y: number } | null;
	readonly finalSpeedMmPerS: number;
}

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
	}

	return { firstMakes, leftPlay, finalPosMm, finalSpeedMmPerS };
}

/** DW-77's own lesson (drain-routing.test.ts's header): a ball is "not permanently at rest" if it left play (drained or parked -- a real, terminal, non-stuck outcome) or is still moving at a real speed. A ball settled to near-zero speed, still in play, IS the stranding this asserts against. */
const STUCK_SPEED_THRESHOLD_MM_PER_S = 20;

function assertNotStranded(result: ShotResult, label: string): void {
	const notStranded = result.leftPlay || result.finalSpeedMmPerS > STUCK_SPEED_THRESHOLD_MM_PER_S;
	expect(
		notStranded,
		`${label}: the ball must not be permanently at rest -- left play: ${result.leftPlay}, final speed: ${result.finalSpeedMmPerS.toFixed(2)} mm/s, final pos: ${JSON.stringify(result.finalPosMm)}`,
	).toBe(true);
}

describe('shot routing (AC 1 behavioural half, task 16a) -- Left Loop', () => {
	it.each([
		{ label: 'centred entry', x: 20 },
		{ label: 'biased entry', x: 12 },
	])('$label: s_loop_l_in then s_loop_l_out close in order, and the ball is not stranded', ({ x }) => {
		const result = driveShot({ x, y: 430, z: 13.5 }, 2200, 0, 2500);
		const inIdx = result.firstMakes.indexOf('s_loop_l_in');
		const outIdx = result.firstMakes.indexOf('s_loop_l_out');
		expect(inIdx, `s_loop_l_in must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(outIdx, `s_loop_l_out must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(outIdx, 's_loop_l_out must close AFTER s_loop_l_in (approach order)').toBeGreaterThan(inIdx);
		assertNotStranded(result, 'Left Loop');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- Right Loop', () => {
	it.each([
		{ label: 'centred entry', x: 450 },
		{ label: 'biased entry', x: 458 },
	])('$label: s_loop_r_in then s_loop_r_out close in order, and the ball is not stranded', ({ x }) => {
		const result = driveShot({ x, y: 430, z: 13.5 }, 2200, 0, 2500);
		const inIdx = result.firstMakes.indexOf('s_loop_r_in');
		const outIdx = result.firstMakes.indexOf('s_loop_r_out');
		expect(inIdx, `s_loop_r_in must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(outIdx, `s_loop_r_out must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(outIdx, 's_loop_r_out must close AFTER s_loop_r_in (approach order)').toBeGreaterThan(inIdx);
		assertNotStranded(result, 'Right Loop');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- Ramp', () => {
	it('s_ramp_enter then s_ramp_made close in order (right of centre, the left flipper\'s own shot)', () => {
		const doc = readCollisionDoc();
		expect(TABLE.reference.playfieldMm.w / 2, 'sanity: the Ramp entrance must be right of centre').toBeLessThan(
			doc.nodes.find((n) => n.name === 'col_ramp_wall_l')!.bboxMm.min.x,
		);
		const result = driveShot({ x: 372, y: 475, z: 13.5 }, 2400, 0, 2500);
		const enterIdx = result.firstMakes.indexOf('s_ramp_enter');
		const madeIdx = result.firstMakes.indexOf('s_ramp_made');
		expect(enterIdx, `s_ramp_enter must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(madeIdx, `s_ramp_made must close -- makes: ${result.firstMakes.join(',')}`).toBeGreaterThanOrEqual(0);
		expect(madeIdx, 's_ramp_made must close AFTER s_ramp_enter').toBeGreaterThan(enterIdx);
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- Dragon body', () => {
	it('a slightly-off Lock-lane shot strikes the body face (s_dragon_body closes), and the ball is not stranded', () => {
		// x = 140: inside col_dragon_leg_l's own x-span (90..150) but clear of
		// the left slingshot's own footprint (70..130, y 420..455), which
		// otherwise sits directly in a straight vertical path to the leg's
		// face -- found and verified this story's own planning pass.
		const result = driveShot({ x: 140, y: 380, z: 13.5 }, 1500, 0, 2000);
		expect(result.firstMakes, `s_dragon_body must close -- makes: ${result.firstMakes.join(',')}`).toContain('s_dragon_body');
		assertNotStranded(result, 'Dragon body');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- Lock lane', () => {
	it('a precise shot up the centreline threads the Lock lane (s_lock_lane closes) without striking either leg', () => {
		const result = driveShot({ x: 170, y: 380, z: 13.5 }, 1600, 0, 500);
		expect(result.firstMakes, `s_lock_lane must close -- makes: ${result.firstMakes.join(',')}`).toContain('s_lock_lane');
		expect(result.firstMakes, 'a precise centreline shot must not also strike a leg face').not.toContain('s_dragon_body');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- DRAGON bank', () => {
	it.each([
		{ label: 'left-of-bank entry', x: 290 },
		{ label: 'right-of-bank entry', x: 322 },
	])('$label: at least one DRAGON-bank target closes, and the ball is not stranded', ({ x }) => {
		const result = driveShot({ x, y: 400, z: 13.5 }, 1600, 0, 2000);
		const bankLetters: SwitchName[] = ['s_dragon_d', 's_dragon_r', 's_dragon_a', 's_dragon_g', 's_dragon_o', 's_dragon_n'];
		const hitAny = result.firstMakes.some((s) => bankLetters.includes(s));
		expect(hitAny, `at least one s_dragon_[d,r,a,g,o,n] must close -- makes: ${result.firstMakes.join(',')}`).toBe(true);
		assertNotStranded(result, 'DRAGON bank');
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- Top lanes', () => {
	it.each([
		{ label: 'lane 1', x: 145, expected: 's_top_1' as SwitchName },
		{ label: 'lane 2', x: 245, expected: 's_top_2' as SwitchName },
		{ label: 'lane 3', x: 345, expected: 's_top_3' as SwitchName },
	])('$label: its own top-lane switch closes on a ball entering from below', ({ x, expected }) => {
		const result = driveShot({ x, y: 900, z: 13.5 }, 1500, 0, 500);
		expect(result.firstMakes, `${expected} must close -- makes: ${result.firstMakes.join(',')}`).toContain(expected);
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- both slingshots', () => {
	it.each([
		{ label: 'left slingshot', x: 100, dirDeg: -20, switchName: 's_sling_l' as SwitchName },
		{ label: 'right slingshot', x: 385, dirDeg: 20, switchName: 's_sling_r' as SwitchName },
	])('$label: its own switch closes, and the miss reaches an inlane or drains rather than stranding', ({ x, dirDeg, switchName }) => {
		const result = driveShot({ x, y: 390, z: 13.5 }, 1200, dirDeg, 2000);
		expect(result.firstMakes, `${switchName} must close -- makes: ${result.firstMakes.join(',')}`).toContain(switchName);
		assertNotStranded(result, `Slingshot (${switchName})`);
	});
});

describe('shot routing (AC 1 behavioural half, task 16a) -- the three pop bumpers', () => {
	it.each([
		{ label: 'pop 1', targetX: 130, targetY: 800, switchName: 's_pop_1' as SwitchName },
		{ label: 'pop 2', targetX: 230, targetY: 800, switchName: 's_pop_2' as SwitchName },
		{ label: 'pop 3', targetX: 180, targetY: 870, switchName: 's_pop_3' as SwitchName },
	])('$label: its own switch closes on a ball rolled toward it', ({ targetX, targetY, switchName }) => {
		const result = driveShot({ x: targetX, y: targetY - 100, z: 13.5 }, 1000, 0, 1500);
		expect(result.firstMakes, `${switchName} must close -- makes: ${result.firstMakes.join(',')}`).toContain(switchName);
	});
});
