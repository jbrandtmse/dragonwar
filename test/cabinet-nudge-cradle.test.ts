// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.7's AC 2 (a nudge frees a ball resting on a raised bat), plus its
// control-run discriminating negative (Hazard 1 in this story's spec). Built
// on `test/flipper-collision.test.ts`'s harness SHAPE (`loadCollision()` +
// `createFlipperMechanics()`) WITHOUT importing from or modifying that file
// (ledger DW-72: Story 2.1a re-asserts the full 5 s cradle against that exact
// file's own tests).
//
// Story 2.1a re-derivation (DW-77): the superseded spawn (195, 85) sat
// embedded in the pre-reconciliation modelled body, and even after DW-78's
// fix a ball merely PLACED near the drain-triangle's new tip-side pocket
// drifts continuously rather than resting -- only a ball the PHYSICS ITSELF
// settles (dropped from clear of the modelled body, then held through an
// arrange window) reaches the same tight, near-zero-drift equilibrium
// `test/flipper-collision.test.ts`'s own `arrangeCradleBall()` measures. This
// file mirrors that SHAPE (drop at `pivotMm.x + 30`, `y = 100`, a 2500-tick
// arrange) rather than importing it, matching this file's own established
// "mirror the shape, do not import" convention.
//
// Measured finding (recorded in the spec): a SINGLE nudge_up rising edge
// changes this ball's departure timing only within measurement noise (an
// ordinary nudge is a small perturbation by design -- AD-5's own "a firm
// nudge should result in around 3 to 5 mm cabinet displacement", not a
// violent one). A rapid BURST of rising edges (the same "firm/violent nudge"
// realisation `test/cabinet-bob.test.ts`'s AC 3 and `test/cabinet-slam.test.ts`'s
// AC 5 already needed) produces a large, unambiguous effect. This test
// arranges that burst; its first rising edge is "the nudge tick" AC 2 names.
// Re-measured against the reconciled geometry: all four constants below
// (`FIRST_NUDGE_TICK`, `OBSERVE_TICK`, `DEPARTED_DRIFT_MM`,
// `CONTROL_STILL_ON_BAT_DRIFT_MM`) still hold without change -- the new
// pocket is markedly MORE stable than the old embedded placement was (the
// settled control drifts under 0.13 mm over the whole 600-tick window,
// against this file's already-generous 10 mm bound), so nothing here needed
// loosening.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import { createFlipperMechanics } from '../src/sim/physics/flippers';
import { createCabinetMechanics } from '../src/sim/physics/cabinet';
import { NO_FRAME } from '../src/sim/loop';
import { resolveTuning } from '../src/sim/table/tuning';
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST } from '../src/sim/physics/constants';
import { fromPhysics, toPhysics } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';
import type { InputFrame } from '../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };
const RADIUS_VU = TABLE.reference.ballMm / 2 / 0.53975;

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** Mirrors flipper-collision.test.ts's buildFlipperHarness() SHAPE, extended with the cabinet mechanics this story adds -- not imported from that file. */
function buildRig() {
	const { physics, flippers } = loadCollision(loadDoc());
	physics.setGravity(TABLE.reference.pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);
	const tuning = resolveTuning();
	const flipperMechanics = createFlipperMechanics({ physics, flippers, tuning });
	const cabinetMechanics = createCabinetMechanics({ physics, tuning });
	return { physics, flipperMechanics, cabinetMechanics };
}

/** Mirrors flipper-collision.test.ts's spawnBallAt() SHAPE -- not imported from that file. */
function spawnBallAt(physics: ReturnType<typeof buildRig>['physics'], xMm: number, yMm: number, name: string): Ball {
	const posPhysics = toPhysics({ x: xMm, y: yMm, z: RADIUS_VU * 0.53975 });
	const data = new BallData(RADIUS_VU, 1, 1);
	const state = new BallState(name, new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
	const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
	physics.addBall(ball);
	return ball;
}

function ballPosMm(ball: Ball) {
	return fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
}
function ballSpeed(ball: Ball): number {
	return Math.hypot(ball.hit.vel.x, ball.hit.vel.y, ball.hit.vel.z);
}

/** The burst's ten rising edges: ticks 100, 102, ..., 118 -- the fastest achievable spacing via real true/false toggling, same shape as AC 3's and AC 5's own bursts. */
const BURST_TICKS = new Set(Array.from({ length: 10 }, (_, i) => 100 + i * 2));
const FIRST_NUDGE_TICK = 100;
const OBSERVE_TICK = 300;
const DEPARTED_DRIFT_MM = 20;
const CONTROL_STILL_ON_BAT_DRIFT_MM = 10;

interface RunResult {
	readonly startPos: { x: number; y: number };
	readonly driftAt: (tick: number) => number;
	readonly speedAt: (tick: number) => number;
}

// The arrange window flipper-collision.test.ts's own arrangeCradleBall()
// uses -- mirrored here (this file's own "mirror the shape" convention), not
// imported. 2500 ticks is comfortably past where the settled control's own
// drift stops moving at all (measured this pass: under 0.01 mm between the
// tick-2000 and tick-2500 samples).
const ARRANGE_TICKS = 2500;

function runCradle(nudge: boolean): RunResult {
	const rig = buildRig();
	const held: InputFrame = { ...NO_FRAME, flipper_l: true };

	// Raise the bat for 60 ticks first (it reaches end-of-stroke well inside
	// that), then DROP the ball from a position derived from the committed
	// geometry (the left bat's own pivotMm.x, offset toward the tip -- the
	// same derivation arrangeCradleBall() uses) and comfortably clear of the
	// modelled body (y = 100), rather than placing it already resting --
	// DW-77: a ball merely placed near the pocket does not reproduce the
	// same tight equilibrium a physics-settled one does.
	const { flippers } = loadCollision(loadDoc());
	// DW-112: a named diagnostic instead of a bare `!` non-null assertion, so
	// a missing/renamed "l"-side flipper node reports which node was expected
	// rather than an unhelpful "Cannot read properties of undefined".
	const leftFlipper = flippers.find((f) => f.side === 'l');
	if (!leftFlipper) {
		throw new Error('expected a "l"-side flipper (col_flipper_l) in the loaded collision document, found none');
	}
	const leftPivotXMm = leftFlipper.pivotMm.x;

	let tick = 0;
	for (let t = 1; t <= 60; t++) {
		tick = t;
		rig.flipperMechanics.applyFrame(t, held, { l: true, r: true });
		rig.cabinetMechanics.applyFrame(t, NO_FRAME);
		rig.physics.step();
	}
	const ball = spawnBallAt(rig.physics, leftPivotXMm + 30, 100, 'CradleBall');

	// Settle guard mirrors flipper-collision.test.ts's own arrangeCradleBall():
	// speed ALONE is not sufficient -- a ball that is still slowly sliding can
	// sit under the speed bound while genuinely still in motion, so drift over
	// a lookback window is checked too (code review, 2026-08-30).
	const SETTLE_CHECK_LOOKBACK = 500;
	let posAtLookback = ballPosMm(ball);
	for (let i = 1; i <= ARRANGE_TICKS; i++) {
		tick += 1;
		rig.flipperMechanics.applyFrame(tick, held, { l: true, r: true });
		rig.cabinetMechanics.applyFrame(tick, held);
		rig.physics.step();
		if (i === ARRANGE_TICKS - SETTLE_CHECK_LOOKBACK) {
			posAtLookback = ballPosMm(ball);
		}
	}
	const startPos = ballPosMm(ball);
	const settleDrift = Math.hypot(startPos.x - posAtLookback.x, startPos.y - posAtLookback.y);
	const settleSpeed = ballSpeed(ball);
	if (settleDrift >= 1 || settleSpeed >= 2) {
		throw new Error(
			`runCradle(): the ball never settled within the ${ARRANGE_TICKS}-tick arrange window -- drift over the last ` +
			`${SETTLE_CHECK_LOOKBACK} ticks was ${settleDrift.toFixed(3)} mm (must be < 1), speed ${settleSpeed.toFixed(3)} ` +
			`(must be < 2). Failing loudly rather than measuring free travel as if it were a resting contact.`,
		);
	}

	const drifts: number[] = [];
	const speeds: number[] = [];
	for (let i = 1; i <= 600; i++) {
		tick += 1;
		const frame: InputFrame = nudge && BURST_TICKS.has(i) ? { ...held, nudge_up: true } : held;
		rig.flipperMechanics.applyFrame(tick, frame, { l: true, r: true });
		rig.cabinetMechanics.applyFrame(tick, frame);
		rig.physics.step();
		const pos = ballPosMm(ball);
		drifts.push(Math.hypot(pos.x - startPos.x, pos.y - startPos.y));
		speeds.push(ballSpeed(ball));
	}
	// Recording starts at i=1 (drifts[0]), the first tick AFTER the arrange
	// window's own settled sample -- so relative tick T (1-indexed, matching
	// BURST_TICKS's own numbering) is stored at index T - 1.
	return {
		startPos,
		driftAt: (t: number) => drifts[t - 1]!,
		speedAt: (t: number) => speeds[t - 1]!,
	};
}

describe('sim/physics/cabinet -- AC 2: a nudge frees a ball resting on a raised bat', () => {
	it('arrange: the ball is genuinely still on the bat, strictly inside the first 1 s of the MEASUREMENT window, the tick before the burst\'s first rising edge (both runs, identically seeded)', () => {
		const nudged = runCradle(true);
		const control = runCradle(false);
		const arrangeTick = FIRST_NUDGE_TICK - 1;
		// Code review 2026-08-31: this bounds the 600-tick MEASUREMENT window
		// that opens once runCradle() has settled the ball -- not the hold as
		// a whole, which by then already spans 60 + ARRANGE_TICKS ticks.
		// BURST_TICKS, FIRST_NUDGE_TICK and OBSERVE_TICK are all offsets into
		// that same window (runCradle() indexes the burst and the recorded
		// samples by the window-relative counter, not the absolute tick), so
		// the message named the wrong clock. Guards a future edit of
		// FIRST_NUDGE_TICK, not today's constant.
		expect(arrangeTick, 'the arrange tick must be strictly inside the first 1000 ticks (1 s) of the measurement window').toBeLessThan(1000);
		// "In contact, within tolerance of its placement, and not already
		// departing" -- both runs are bit-identical up to here (the burst has
		// not started), so both are checked.
		expect(nudged.driftAt(arrangeTick), 'nudged run: the ball must still be close to its placement').toBeLessThan(5);
		expect(nudged.speedAt(arrangeTick), 'nudged run: the ball must still be slow (not already departing)').toBeLessThan(2);
		expect(control.driftAt(arrangeTick)).toBeLessThan(5);
		expect(control.speedAt(arrangeTick)).toBeLessThan(2);
	});

	it('within a stated tick budget after the burst, the nudged ball has left the bat by a stated observable (drift), while the control ball -- identical in every respect except the nudge -- has not', () => {
		const nudged = runCradle(true);
		const control = runCradle(false);

		expect(nudged.driftAt(OBSERVE_TICK), `by tick ${OBSERVE_TICK} the nudged ball must have measurably left the bat`).toBeGreaterThan(DEPARTED_DRIFT_MM);
		// The discriminating negative: the control run is the SAME arrange,
		// the SAME tick budget, no nudge -- and is still on the bat. Without
		// this, "the ball left the bat" would be satisfied by a ball that was
		// leaving anyway (Hazard 1, this story's spec).
		expect(control.driftAt(OBSERVE_TICK), `by tick ${OBSERVE_TICK} the control ball (no nudge) must still be on the bat`).toBeLessThan(CONTROL_STILL_ON_BAT_DRIFT_MM);

		// Sanity: the two runs are genuinely different (not a tolerance wide
		// enough to pass regardless of whether the nudge happened at all).
		expect(nudged.driftAt(OBSERVE_TICK)).toBeGreaterThan(control.driftAt(OBSERVE_TICK) * 3);
	});
});
