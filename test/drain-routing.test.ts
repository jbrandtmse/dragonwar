// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1a, tasks 22-23 (DW-119): AC 1 passed on a checklist of node
// names, lane widths, guide ends and post surfaces while the drain triangle
// could not actually route a ball -- both outlanes dead-ended on
// col_wall_bottom_l/_r instead of reaching bd_trough (measured before the
// fix: a ball released in either outlane parked one ball radius above
// y = 0 and never drained). This file pins the BEHAVIOUR the checklist
// cannot see: a ball released in the left outlane, the right outlane, and
// at the centre drain all reach a trough switch zone within a bounded tick
// count (AC 7), and the centre channel between the two raised bats' pockets
// passes a ball without jamming regardless of lateral bias, matching the
// lead's own pre-fix measurement (AC 8).
//
// Same harness technique as test/flipper-collision.test.ts's own
// runFromCentre() (DW-60): loadCollision() + createFlipperMechanics() +
// createDeviceMechanics() driven by hand, because sim/loop's own createLoop()
// has no "place a ball anywhere" dev hatch (by design -- devices spawn
// balls, AD-6).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import { createFlipperMechanics } from '../src/sim/physics/flippers';
import { createDeviceMechanics, type BallStepMovement } from '../src/sim/physics/devices';
import { resolveTuning } from '../src/sim/table/tuning';
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST } from '../src/sim/physics/constants';
import { fromPhysics, toPhysics } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { NO_FRAME } from '../src/sim/loop';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };
const RADIUS_VU = TABLE.reference.ballMm / 2 / 0.53975;

interface CollisionDocForTest {
	nodes: Array<{ name: string; bboxMm: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } }>;
}

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function readCollisionDoc(): CollisionDocForTest {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function nodeBboxMm(name: string) {
	const doc = readCollisionDoc();
	const node = doc.nodes.find((n) => n.name === name);
	if (!node) {
		throw new Error(`nodeBboxMm(): expected a "${name}" node in the committed collision document, found none`);
	}
	return node.bboxMm;
}

function ballPosMm(ball: Ball) {
	return fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
}

/**
 * Releases a ball at (xMm, yMm) with both flipper keys released and drives
 * the real per-tick pipeline (flipper mechanics -> physics.step() ->
 * deviceMechanics.detectEntries()) until it parks in a device or maxTicks
 * elapses. Mirrors test/flipper-collision.test.ts's own runFromCentre()
 * harness, generalised to any release point and reporting the released
 * ball's own maximum lateral (X) drift from its release X, for AC 8.
 */
function releaseBall(xMm: number, yMm: number, maxTicks = 4000) {
	const { physics, flippers, switchZones, devices } = loadCollision(loadDoc());
	physics.setGravity(TABLE.reference.pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);
	const tuning = resolveTuning();
	const flipperMechanics = createFlipperMechanics({ physics, flippers, tuning });
	let nextBallId = 1;
	const deviceMechanics = createDeviceMechanics({ physics, devices, switchZones, tuning, nextBallId: () => nextBallId++ });

	// bd_trough starts with all four slots filled (AD-6: "4 balls, asserted
	// at boot") -- empty one first so a draining ball has somewhere to
	// park, then remove the ball that eject spawns so this test's own
	// released ball is the only one in play.
	deviceMechanics.applyCommands(0, [{ coil: 'c_trough_eject' }]);
	for (const spawned of [...physics.balls]) {
		physics.removeBall(spawned);
	}

	const startPosMm = { x: xMm, y: yMm, z: RADIUS_VU * 0.53975 };
	const posPhysics = toPhysics(startPosMm);
	const data = new BallData(RADIUS_VU, 1, 1);
	const state = new BallState('RouteBall', new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
	const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
	physics.addBall(ball);

	let drained = false;
	let drainedTick = -1;
	let lastPosMm = startPosMm;
	let maxLateralDriftMm = 0;
	for (let tick = 1; tick <= maxTicks && !drained; tick++) {
		flipperMechanics.applyFrame(tick, NO_FRAME, { l: true, r: true });
		const beforeMm = ballPosMm(ball);
		physics.step();
		if (!physics.balls.includes(ball)) {
			drained = true;
			drainedTick = tick;
			break;
		}
		const afterMm = ballPosMm(ball);
		maxLateralDriftMm = Math.max(maxLateralDriftMm, Math.abs(afterMm.x - xMm));
		const movement: BallStepMovement = { ball, beforeMm, afterMm };
		deviceMechanics.detectEntries(tick, [movement]);
		lastPosMm = afterMm;
		if (!physics.balls.includes(ball)) {
			drained = true;
			drainedTick = tick;
		}
	}
	return { drained, drainedTick, lastPosMm, deviceMechanics, maxLateralDriftMm };
}

describe('drain routing (AC 7, DW-119): every path the drain triangle offers actually drains', () => {
	it('a ball released in the LEFT outlane reaches a trough switch zone within a bounded tick count', () => {
		const bbox = nodeBboxMm('col_guide_divider_l');
		const wallBbox = nodeBboxMm('col_wall_left');
		const midXMm = (wallBbox.max.x + bbox.min.x) / 2; // midpoint of the left outlane's own clear width
		const { drained, drainedTick, lastPosMm, deviceMechanics } = releaseBall(midXMm, 300);
		expect(drained, `the left-outlane ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		expect(deviceMechanics.parkingSlots.bd_trough.filter(Boolean).length, 'the trough must be full again -- the pre-test eject left it at 3/4, so this drained ball must have filled the 4th slot').toBe(4);
		expect(drainedTick, 'sanity: must have taken a real, non-trivial number of ticks to travel from the outlane to the trough').toBeGreaterThan(10);
	});

	it('a ball released in the RIGHT outlane reaches a trough switch zone within a bounded tick count', () => {
		const bbox = nodeBboxMm('col_guide_divider_r');
		const wallBbox = nodeBboxMm('col_wall_lane');
		const midXMm = (bbox.max.x + wallBbox.min.x) / 2; // midpoint of the right outlane's own clear width
		const { drained, drainedTick, lastPosMm, deviceMechanics } = releaseBall(midXMm, 300);
		expect(drained, `the right-outlane ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		expect(deviceMechanics.parkingSlots.bd_trough.filter(Boolean).length, 'the trough must be full again -- the pre-test eject left it at 3/4, so this drained ball must have filled the 4th slot').toBe(4);
		expect(drainedTick, 'sanity: must have taken a real, non-trivial number of ticks to travel from the outlane to the trough').toBeGreaterThan(10);
	});

	it('a ball released at the CENTRE drain (playfield x-centre, both keys released) reaches a trough switch zone within a bounded tick count', () => {
		const centreX = TABLE.reference.playfieldMm.w / 2;
		const { drained, drainedTick, lastPosMm, deviceMechanics } = releaseBall(centreX, 200);
		expect(drained, `the centre-drain ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		expect(deviceMechanics.parkingSlots.bd_trough.filter(Boolean).length, 'the trough must be full again -- the pre-test eject left it at 3/4, so this drained ball must have filled the 4th slot').toBe(4);
		expect(drainedTick, 'sanity: must have taken a real, non-trivial number of ticks to travel from the drain to the trough').toBeGreaterThan(10);
	});
});

describe('centre channel (AC 8): the 32.65 mm gap between the two pockets passes a ball without jamming, at the authored width', () => {
	const centreX = TABLE.reference.playfieldMm.w / 2; // 257.2

	it('a CENTRED release traverses the channel with negligible lateral drift and reaches the trough', () => {
		const { drained, drainedTick, maxLateralDriftMm, lastPosMm } = releaseBall(centreX, 200);
		expect(drained, `the centred ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		// Measured by the lead before this iteration: 0.00 mm drift, exit at
		// tick 911. Bound kept close to the measurement (review finding,
		// intent-alignment pass: the previous <5 mm bound was 25x looser than
		// the measured 0.00 mm and would not have caught a real narrowing) --
		// still wide enough to absorb genuine solver float noise.
		expect(maxLateralDriftMm, 'a dead-centre release should barely rattle at all').toBeLessThan(2);
		expect(drainedTick, 'sanity: must have taken a real, non-trivial number of ticks to travel from the channel to the trough').toBeGreaterThan(10);
	});

	it('a LEFT-biased release still clears the channel (rattles, but does not jam) and reaches the trough', () => {
		const { drained, drainedTick, maxLateralDriftMm, lastPosMm } = releaseBall(centreX - 10, 200);
		expect(drained, `the left-biased ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		// Measured by the lead: ~12.27 mm of rattle, exit at tick 874. The
		// channel is only 32.65 mm clear, so this also proves the ball never
		// needed more than the authored width -- if a future change narrows
		// the channel enough to increase the rattle materially, this bound
		// (and the drain assertion above it) goes red. Bound tightened from a
		// 30 mm ceiling (review finding: 2.4x the measured figure, loose
		// enough that a channel narrowed by several mm could still pass) to a
		// still-generous ~1.5x margin over the measurement.
		expect(maxLateralDriftMm, 'a biased release must still stay within the channel, not vanish sideways').toBeLessThan(18);
		expect(drainedTick, 'sanity: must have taken a real, non-trivial number of ticks to travel from the channel to the trough').toBeGreaterThan(10);
	});

	it('a RIGHT-biased release still clears the channel (rattles, but does not jam) and reaches the trough', () => {
		const { drained, drainedTick, maxLateralDriftMm, lastPosMm } = releaseBall(centreX + 10, 200);
		expect(drained, `the right-biased ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		// Measured by the lead: ~11.78 mm of rattle, exit at tick 737. Same
		// tightened bound as the left-biased case above.
		expect(maxLateralDriftMm, 'a biased release must still stay within the channel, not vanish sideways').toBeLessThan(18);
		expect(drainedTick, 'sanity: must have taken a real, non-trivial number of ticks to travel from the channel to the trough').toBeGreaterThan(10);
	});
});
