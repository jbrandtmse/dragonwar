// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.12, Integration ACs 2, 4c and 7 -- ball search driven through a
// REAL `createLoop()`, real physics, over the committed collision document
// (the cradle) and a test-only ADDENDUM to an in-memory copy of it (the
// V-cup). Proves the properties no headless test can: physics' own
// `recovered` count genuinely reaches rules through the loop (AC 2), a held
// flipper's own `button_pressed`/`button_released` edges genuinely reach
// ball search through the devices layer and the real loop -- pausing a
// running search and resuming it, never restarting it (AC 4c) -- and the
// drop-bank component genuinely consumes the search's own request and
// pulses the real coil (AC 7).
//
// AC 2's and AC 4c's instrument is the spec's own designed V-cup (Design
// Notes, "AC 2's instrument: the test-only stuck ball"): two convex wall
// bars, `col_test_cup_l`/`col_test_cup_r`, apex (165, 240), appended to an
// in-memory copy of the committed collision document and passed through
// `createLoop()`'s existing `collisionDoc` option -- `public/assets/` is
// never written and no `col_test_cup` name ever reaches `src/`. The served
// ball is moved into the cup ONCE, via the file-scoped `vi.doMock` capture
// of the real machine the spec sketches, and the cup's own real contact
// physics holds it for the rest of the run -- never a per-tick re-pin. This
// file also independently re-measures the cup's own stability (the
// within-0.1-mm-of-L+3000 window AC 2 states) rather than assuming the
// plan-stage probe's figures carry over unchanged.
//
// AC 4c's cradle half is the OTHER, unmodified half of the same AC: a real
// plunge caught on a held left flipper, over the committed document, with no
// test-only geometry and no mock at all -- the negative subject a held
// flipper is never searched against.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { toPhysics } from '../src/sim/table/frames';
import { loadCollision } from '../src/sim/physics/loader';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { advanceBackglass, renderFrame, INITIAL_BACKGLASS_VIEW } from '../src/presentation/backglass/frame';
import type { GameStart } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
// Authored literals (never re-imported from `TUNING` -- Boundaries: "never
// compute an expected value from ballSearchMs/ballSearchStepMs by
// re-importing it"). `BALL_SEARCH_TICKS` anchors S = O+15000 below; the
// spec's own fixed slot offsets (S+1252, S+2001, S+2251, S+2501, S+2751) are
// themselves command-latency literals, not re-derived from a step interval.
const BALL_SEARCH_TICKS = 15000;
const BALL_REST_Z_MM = 13.5;

type MachineType = import('../src/sim/physics/machine').Machine;
type LoopType = import('../src/sim/loop/index').Loop;
type FrameOutputType = ReturnType<LoopType['advance']>;
type InputFrameType = typeof import('../src/sim/loop/index').NO_FRAME;

const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

function gameStart(): GameStart {
	return {
		seed: 0,
		tuning: NO_BALL_SAVE_TUNING,
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0 },
		highscores: [],
	};
}

interface RawCollisionDoc {
	readonly [key: string]: unknown;
	readonly nodes: readonly unknown[];
}

function loadCommittedDoc(): RawCollisionDoc {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8')) as RawCollisionDoc;
}

// ---------------------------------------------------------------------------
// The V-cup (Design Notes, "AC 2's instrument: the test-only stuck ball"):
// apex (165, 240); each wall a 30 mm inner face at 45 deg, 6 mm thick,
// zLowMm 0 / zHighMm 50, physMaterial copied from `col_ramp_wall_r`
// ("default"). A 90-degree wedge symmetric about x = 165: a ball of radius
// 13.5 mm resting against both inner faces sits at the apex plus
// 13.5 * sqrt(2) along the bisector, i.e. (165, 259.09) -- which is exactly
// why the test below places it at (165, 262), a few mm short of that on the
// bisector, and lets contact physics settle it the rest of the way (the
// plan-stage probe's own placement band, x 157-173 / y 262-275). Footprints
// verified convex and counter-clockwise in the table frame (the same test
// `loadCollision()`'s own `assertConvexCcwFootprint()` runs) before being
// committed here.
// ---------------------------------------------------------------------------
const CUP_WALL_L = {
	name: 'col_test_cup_l',
	shape: 'wall',
	physMaterial: 'default',
	zLowMm: 0,
	zHighMm: 50,
	bboxMm: { min: { x: 139.544156, y: 235.757359, z: 0 }, max: { x: 165, y: 261.213203, z: 50 } },
	footprintMm: [
		{ x: 165, y: 240 },
		{ x: 143.786797, y: 261.213203 },
		{ x: 139.544156, y: 256.970563 },
		{ x: 160.757359, y: 235.757359 },
	],
} as const;

const CUP_WALL_R = {
	name: 'col_test_cup_r',
	shape: 'wall',
	physMaterial: 'default',
	zLowMm: 0,
	zHighMm: 50,
	bboxMm: { min: { x: 165, y: 235.757359, z: 0 }, max: { x: 190.455844, y: 261.213203, z: 50 } },
	footprintMm: [
		{ x: 169.242641, y: 235.757359 },
		{ x: 190.455844, y: 256.970563 },
		{ x: 186.213203, y: 261.213203 },
		{ x: 165, y: 240 },
	],
} as const;

const CUP_PLACEMENT_MM = { x: 165, y: 262, z: BALL_REST_Z_MM };

/** An in-memory addendum to a FRESH parse of the committed document -- never the object `loadCommittedDoc()` elsewhere returns, and never written back to `public/assets/`. */
function buildCupDoc(): unknown {
	const doc = loadCommittedDoc();
	return { ...doc, nodes: [...doc.nodes, CUP_WALL_L, CUP_WALL_R] };
}

// ---------------------------------------------------------------------------
// The committed document's own switch-zone boxes (AC 2: "more than 90 mm
// from every switch-zone box of the committed document's loadCollision(...)
// .switchZones"). `loadCollision` is imported statically, ahead of any
// `vi.resetModules()`/`vi.doMock` below, so this reading is never touched by
// either test's machine-capture mock.
// ---------------------------------------------------------------------------
let cachedSwitchZones: ReturnType<typeof loadCollision>['switchZones'] | null = null;
function committedSwitchZones(): ReturnType<typeof loadCollision>['switchZones'] {
	if (!cachedSwitchZones) {
		cachedSwitchZones = loadCollision(loadCommittedDoc()).switchZones;
	}
	return cachedSwitchZones;
}

/** The distance from `point` to the nearest committed switch-zone box (0 if inside one), and that zone's own switch name -- the distance counts every zone box, device slots and the shooter entry included (Design Notes), because `switchZones` already carries all of them, never only the 28-member playfield set. */
function nearestZoneDistanceMm(
	point: { readonly x: number; readonly y: number; readonly z: number },
	zones: ReturnType<typeof loadCollision>['switchZones'],
): { readonly distanceMm: number; readonly switchName: string } {
	let best = Infinity;
	let bestSwitch = '';
	for (const zone of zones) {
		const dx = Math.max(zone.minMm.x - point.x, 0, point.x - zone.maxMm.x);
		const dy = Math.max(zone.minMm.y - point.y, 0, point.y - zone.maxMm.y);
		const dz = Math.max(zone.minMm.z - point.z, 0, point.z - zone.maxMm.z);
		const d = Math.hypot(dx, dy, dz);
		if (d < best) {
			best = d;
			bestSwitch = zone.switch;
		}
	}
	return { distanceMm: best, switchName: bestSwitch };
}

/**
 * `place()` (Design Notes, "The seam"): between two `advance()` calls, write
 * one ball's `state.pos` and zero `hit.vel`, `hit.angularVelocity` and
 * `hit.angularMomentum`. The zone test sweeps only within a step (never
 * across two), so this move crosses no zone -- the lane switch's own break
 * then yields the real `ball_launched` on the very next tick.
 */
function place(machine: MachineType, ballId: number, pointMm: { readonly x: number; readonly y: number; readonly z: number }): void {
	const ball = machine.balls.find((b) => b.id === ballId);
	if (!ball) {
		throw new Error(`place(): no live ball with id ${ballId} on the captured machine`);
	}
	const p = toPhysics(pointMm);
	ball.state.pos.set(p.x, p.y, p.z);
	ball.hit.vel.set(0, 0, 0);
	ball.hit.angularVelocity.set(0, 0, 0);
	ball.hit.angularMomentum.set(0, 0, 0);
}

/** A plain, unmocked `sim/loop` import -- the cradle's own loop (Design Notes: "unchanged real-loop cradle scenario", no test-only instrument, no capture seam). */
async function importPlainLoop(): Promise<{
	readonly createLoop: typeof import('../src/sim/loop/index').createLoop;
	readonly NO_FRAME: InputFrameType;
}> {
	vi.resetModules();
	const mod = await import('../src/sim/loop/index');
	return { createLoop: mod.createLoop, NO_FRAME: mod.NO_FRAME };
}

/**
 * The file-scoped `vi.doMock` capture (Design Notes, "AC 2's instrument",
 * part 2): the wrapper calls the real `createMachine` and records the
 * instance it returns, changing no behaviour. `place()` reaches the live
 * ball list through the captured instance's own `balls` getter -- the same
 * live array `Machine.step()` mutates every tick.
 */
async function importLoopWithMachineCapture(): Promise<{
	readonly createLoop: typeof import('../src/sim/loop/index').createLoop;
	readonly NO_FRAME: InputFrameType;
	readonly getCaptured: () => MachineType | undefined;
}> {
	vi.resetModules();
	let captured: MachineType | undefined;
	vi.doMock('../src/sim/physics/machine', async (importOriginal) => {
		const actual = await importOriginal<typeof import('../src/sim/physics/machine')>();
		return {
			...actual,
			createMachine: (...args: Parameters<typeof actual.createMachine>) => (captured = actual.createMachine(...args)),
		};
	});
	const mod = await import('../src/sim/loop/index');
	return { createLoop: mod.createLoop, NO_FRAME: mod.NO_FRAME, getCaptured: () => captured };
}

/** Start, then settle the served ball on the plunger tip -- the common prefix every scenario below drives first. */
function startAndSettle(loop: LoopType, NO_FRAME: InputFrameType): FrameOutputType {
	let out = loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
	out = loop.advance(1, [{ tick: 3, frame: { ...NO_FRAME, start: false } }]);
	for (let i = 0; i < 500 && out.snapshot.mechanisms.devices.bd_shooter.slots[0] !== true; i++) {
		out = loop.advance(1, []);
	}
	// AC 2's own Given: "At T = 400 the served ball rests on the plunger tip".
	// Code review 2026-09-11: the loop above alone returned at T = 3, with the
	// ball still rolling onto the tip; running on to T = 400 puts it at rest
	// and makes L = 401 and AC 4c's P / R / S the spec's own literals
	// (5401, 25401, 35401).
	while (out.snapshot.tick < 400) {
		out = loop.advance(1, []);
	}
	return out;
}

afterEach(() => {
	vi.doUnmock('../src/sim/physics/machine');
	vi.resetModules();
});

describe('Integration ACs 2, 4c, 7 -- ball search through a real createLoop (real physics, real devices layer)', () => {
	it(
		'AC 2 + AC 7: a genuinely stuck ball in the real V-cup is recovered through the real RecoverCommand path; the bank-reset request reaches the real drop-bank component',
		async () => {
			const { createLoop, NO_FRAME, getCaptured } = await importLoopWithMachineCapture();
			const loop = createLoop({ collisionDoc: buildCupDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });
			expect(getCaptured(), 'the machine-capture mock must have fired').toBeDefined();

			let out = startAndSettle(loop, NO_FRAME);
			expect(out.snapshot.mechanisms.devices.bd_shooter.slots, 'the served ball must be resting before place()').toEqual([true]);
			expect(out.snapshot.game.machine.ballsInPlay, 'a served, unlaunched ball is not counted in play').toBe(0);
			expect(
				out.snapshot.mechanisms.devices.bd_trough.slots.filter(Boolean).length,
				'three trough slots stay closed after the first (Start) serve',
			).toBe(3);
			const servedBallId = out.snapshot.balls[0]!.id;

			// place(): teleport the served ball into the V-cup ONCE. No further
			// intervention from here -- the cup's own real contact physics holds
			// it for the rest of the run (this file's header; task 17's own
			// correction).
			place(getCaptured()!, servedBallId, CUP_PLACEMENT_MM);
			out = loop.advance(1, []);
			const L = out.snapshot.tick;
			expect(out.events.some((e) => e.type === 'ball_launched'), "the premise: place() must genuinely produce ball_launched").toBe(true);
			expect(out.snapshot.game.machine.ballsInPlay, 'the premise: ballsInPlay reads 1 on the launch tick').toBe(1);
			expect(L, "AC 2's premise: ball_launched arrives at L = 401 (the ball placed at T = 400)").toBe(401);

			const O = L;
			const S = O + BALL_SEARCH_TICKS;

			let refPos: { readonly x: number; readonly y: number; readonly z: number } | null = null;
			let maxDriftMm = 0;
			let previousBallsLength = out.snapshot.balls.length;
			let sawBallEnded = false;
			const searchStartedTicks: number[] = [];
			const bankResetContactTicks: number[] = [];
			let ejectFailedShooterTick = -1;
			let troughDropTick = -1;
			let troughDropShooterSlots: readonly boolean[] | null = null;
			let troughDropBallsInPlay = -1;
			let troughAtS2501 = -1;
			const missingEvents: { readonly count: number; readonly tick: number }[] = [];
			let ballsLenBeforeMissing = -1;
			let ballsLenAfterMissing = -1;
			let cupBallGoneAfterMissing = false;
			let ballsInPlayAtS2751 = -1;
			// Code review 2026-09-11 (the I/O row "ball_missing downstream"): every
			// frame is folded through the REAL Backglass, as src/host/boot.ts's
			// onFrame does, so the controller's own ball_missing reaches it.
			let backglassView = INITIAL_BACKGLASS_VIEW;
			let screenAtMissing: string | null = null;

			function updateTrackers(): void {
				const tick = out.snapshot.tick;
				backglassView = advanceBackglass(backglassView, out);
				if (out.events.some((e) => e.type === 'ball_ended')) {
					sawBallEnded = true;
				}
				if (out.events.some((e) => e.type === 'ball_search_started')) {
					searchStartedTicks.push(tick);
				}
				for (const c of out.contactEvents) {
					if (c.kind === 'bank_reset') {
						bankResetContactTicks.push(tick);
					}
				}
				if (ejectFailedShooterTick === -1) {
					const ef = out.events.find((e) => e.type === 'eject_failed');
					if (ef && ef.type === 'eject_failed' && ef.device === 'bd_shooter') {
						ejectFailedShooterTick = tick;
					}
				}
				const cupBall = out.snapshot.balls.find((b) => b.id === servedBallId);
				if (cupBall) {
					if (tick === L + 3000) {
						refPos = { x: cupBall.pos.x, y: cupBall.pos.y, z: cupBall.pos.z };
					}
					if (refPos && tick >= L + 3000 && tick <= S + 2750) {
						const d = Math.hypot(cupBall.pos.x - refPos.x, cupBall.pos.y - refPos.y, cupBall.pos.z - refPos.z);
						if (d > maxDriftMm) {
							maxDriftMm = d;
						}
					}
				}
				const troughClosed = out.snapshot.mechanisms.devices.bd_trough.slots.filter(Boolean).length;
				if (troughDropTick === -1 && troughClosed === 2) {
					troughDropTick = tick;
					troughDropShooterSlots = out.snapshot.mechanisms.devices.bd_shooter.slots;
					troughDropBallsInPlay = out.snapshot.game.machine.ballsInPlay;
				}
				if (tick === S + 2501) {
					troughAtS2501 = troughClosed;
				}
				const missing = out.events.find((e) => e.type === 'ball_missing');
				if (missing && missing.type === 'ball_missing') {
					missingEvents.push({ count: missing.count, tick });
					ballsLenBeforeMissing = previousBallsLength;
					ballsLenAfterMissing = out.snapshot.balls.length;
					cupBallGoneAfterMissing = !out.snapshot.balls.some((b) => b.id === servedBallId);
					screenAtMissing = renderFrame(backglassView, out.snapshot).screen;
				}
				if (tick === S + 2751) {
					ballsInPlayAtS2751 = out.snapshot.game.machine.ballsInPlay;
				}
				previousBallsLength = out.snapshot.balls.length;
			}

			// The quiet window through the recover, and a margin past it so
			// "stays 2 until the plunge" is genuinely observed rather than assumed.
			while (out.snapshot.tick < S + 3000) {
				out = loop.advance(1, []);
				updateTrackers();
			}
			const troughUntilPlunge = out.snapshot.mechanisms.devices.bd_trough.slots.filter(Boolean).length;
			const ballsInPlayUntilPlunge = out.snapshot.game.machine.ballsInPlay;

			// The plunge (a 1200-tick hold -- full strength, the same idiom
			// test/rules-rollback-accounting-integration.test.ts's own re-plunge uses).
			out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
			updateTrackers();
			for (let i = 0; i < 1199; i++) {
				out = loop.advance(1, []);
				updateTrackers();
			}
			out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
			updateTrackers();

			let launchTick = -1;
			for (let i = 0; i < 2000 && launchTick === -1; i++) {
				out = loop.advance(1, []);
				updateTrackers();
				if (out.events.some((e) => e.type === 'ball_launched')) {
					launchTick = out.snapshot.tick;
				}
			}

			// --- the premise: stability and distance (re-measured on this run) ---
			expect(refPos, 'the L+3000 reference position must genuinely have been sampled').not.toBeNull();
			expect(
				maxDriftMm,
				`the cup ball must stay within 0.1 mm of its L+3000 position through S+2750 (measured max drift ${maxDriftMm.toFixed(4)} mm)`,
			).toBeLessThanOrEqual(0.1);
			const nearest = nearestZoneDistanceMm(refPos!, committedSwitchZones());
			expect(
				nearest.distanceMm,
				`the rest position must be more than 90 mm from every switch zone (nearest: ${nearest.switchName} at ${nearest.distanceMm.toFixed(2)} mm)`,
			).toBeGreaterThan(90);

			// --- the schedule (AC 1's own fixed offsets from S, re-measured from this run's own S) ---
			expect(searchStartedTicks, 'exactly one ball_search_started, at S = O+15000, none earlier').toEqual([S]);
			expect(bankResetContactTicks, 'AC 7: exactly one bank_reset contact, at S+1252').toEqual([S + 1252]);
			expect(ejectFailedShooterTick, "eject_failed { device: 'bd_shooter' } at S+2001").toBe(S + 2001);
			expect(troughDropTick, 'the trough 3->2 drop lands at S+2251').toBe(S + 2251);
			expect(troughDropShooterSlots, 'the served ball arrives in bd_shooter on the SAME tick as the trough drop').toEqual([true]);
			expect(troughDropBallsInPlay, 'a served arrival is never double-counted (DW-187): ballsInPlay stays 1').toBe(1);
			expect(troughAtS2501, 'the trough count is still 2 at S+2501').toBe(2);
			expect(missingEvents, 'exactly one ball_missing { count: 1 }, at S+2751, in the whole run').toEqual([{ count: 1, tick: S + 2751 }]);
			expect(ballsLenBeforeMissing, 'two balls (cup + served) exist just before the recover').toBe(2);
			expect(ballsLenAfterMissing, 'one ball remains after the recover').toBe(1);
			expect(cupBallGoneAfterMissing, 'the ball that remains is not the cup ball').toBe(true);
			expect(screenAtMissing, 'ball_missing through the real Backglass fold: no throw, and the score screen stays up -- never mistaken for an end of ball').toBe('score');
			expect(ballsInPlayAtS2751, 'ballsInPlay reads 0 from S+2751').toBe(0);
			// Story 2.13 (DW-257, amended expectation): `recover()` now RETURNS
			// the recovered cup ball to bd_trough's lowest empty slot instead of
			// despawning it (AC 14) -- the trough count rises 2 -> 3 at the
			// recover and stays there until the plunge ejects a ball for the
			// next serve, never dropping back to 2 the way the destroy-only
			// implementation left it.
			expect(troughUntilPlunge, 'the trough count rises to 3 (the recovered ball parked) and stays there until the plunge').toBe(3);
			expect(ballsInPlayUntilPlunge, 'ballsInPlay stays 0 until the plunge').toBe(0);

			// --- the plunge ---
			expect(launchTick, 'the plunge must genuinely produce ball_launched').toBeGreaterThan(0);
			expect(out.snapshot.game.currentPlayer, 'currentPlayer is unchanged by the whole run').toBe(0);
			expect(out.snapshot.game.players[0]!.ballNumber, "player 0's ballNumber is unchanged by the whole run").toBe(1);
			expect(sawBallEnded, 'no ball_ended may arrive anywhere in the run up to and including the plunge\'s ball_launched').toBe(false);
		},
		120_000,
	);

	it(
		'AC 4c (integration): a held flipper pauses the search through the real devices layer and the real loop -- the cradle is never searched while held, and the cup resumes rather than restarts on release',
		async () => {
			// ---------------------------------------------------------------
			// The cradle: the negative subject, over the committed document,
			// with no test-only geometry and no capture seam (Design Notes,
			// "A held cradle is never searched").
			// ---------------------------------------------------------------
			const cradle = await importPlainLoop();
			const cradleLoop = cradle.createLoop({ collisionDoc: loadCommittedDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });

			let cOut = cradleLoop.advance(1, [{ tick: 2, frame: { ...cradle.NO_FRAME, start: true } }]);
			cOut = cradleLoop.advance(1, [{ tick: 3, frame: { ...cradle.NO_FRAME, start: false } }]);
			// The plunger pressed at 503, held through 1702, released at 1703 --
			// flipper_l pressed on that SAME tick (Design Notes, "AC 4's
			// instrument (the cradle) and its measured release").
			while (cOut.snapshot.tick < 502) {
				cOut = cradleLoop.advance(1, []);
			}
			cOut = cradleLoop.advance(1, [{ tick: 503, frame: { ...cradle.NO_FRAME, plunger: true } }]);
			while (cOut.snapshot.tick < 1702) {
				cOut = cradleLoop.advance(1, []);
			}
			cOut = cradleLoop.advance(1, [{ tick: 1703, frame: { ...cradle.NO_FRAME, flipper_l: true } }]);

			let cLaunchTick = -1;
			let cBallsInPlayDroppedEarly = false;
			let cSawSearchWhileHeld = false;
			let cRefPos: { readonly x: number; readonly y: number; readonly z: number } | null = null;
			let cMaxSpreadMm = 0;

			// `duringHold`: the "ballsInPlay stays 1" invariant (AC 4c's own
			// premise) applies only from the launch UNTIL the release -- never
			// during the post-release drain-wait loop below, where ballsInPlay
			// correctly falls to 0 once the ball genuinely drains.
			function updateCradleTrackers(duringHold: boolean): void {
				const tick = cOut.snapshot.tick;
				if (cOut.events.some((e) => e.type === 'ball_launched') && cLaunchTick === -1) {
					cLaunchTick = tick;
				}
				if (duringHold && cLaunchTick !== -1 && cOut.snapshot.game.machine.ballsInPlay !== 1) {
					cBallsInPlayDroppedEarly = true;
				}
				if (duringHold && cOut.events.some((e) => e.type === 'ball_search_started')) {
					cSawSearchWhileHeld = true;
				}
				const ball = cOut.snapshot.balls[0];
				if (ball) {
					if (tick === 6100) {
						cRefPos = { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z };
					}
					if (cRefPos && tick >= 6100 && duringHold) {
						const d = Math.hypot(ball.pos.x - cRefPos.x, ball.pos.y - cRefPos.y, ball.pos.z - cRefPos.z);
						if (d > cMaxSpreadMm) {
							cMaxSpreadMm = d;
						}
					}
				}
			}

			const R_C = 31704;
			while (cOut.snapshot.tick < R_C - 1) {
				cOut = cradleLoop.advance(1, []);
				updateCradleTrackers(true);
			}
			// Release: flipper_l false (and every other action already false --
			// a fresh NO_FRAME, mirroring plunger.test.ts's own release idiom).
			cOut = cradleLoop.advance(1, [{ tick: R_C, frame: { ...cradle.NO_FRAME } }]);
			updateCradleTrackers(true);

			let cDrainTick = -1;
			let cBallEndedEvent: { readonly player: number; readonly tilted: boolean } | undefined;
			for (let i = 0; i < 1000 && cDrainTick === -1; i++) {
				cOut = cradleLoop.advance(1, []);
				updateCradleTrackers(false);
				const ended = cOut.events.find((e) => e.type === 'ball_ended');
				if (ended && ended.type === 'ball_ended') {
					cDrainTick = cOut.snapshot.tick;
					cBallEndedEvent = ended;
				}
			}

			expect(cLaunchTick, 'the cradle premise: ball_launched must genuinely arrive').toBeGreaterThan(0);
			expect(cBallsInPlayDroppedEarly, 'ballsInPlay must read 1 from launch until the release').toBe(false);
			expect(cRefPos, 'the tick-6100 reference position must genuinely have been sampled before the release').not.toBeNull();
			expect(cMaxSpreadMm, `the cradled ball must stay within 3 mm of its tick-6100 position (measured spread ${cMaxSpreadMm.toFixed(4)} mm)`).toBeLessThanOrEqual(3);
			const cNearest = nearestZoneDistanceMm(cRefPos!, committedSwitchZones());
			expect(
				cNearest.distanceMm,
				`the cradle rest position must be more than 70 mm from every switch zone (nearest: ${cNearest.switchName} at ${cNearest.distanceMm.toFixed(2)} mm)`,
			).toBeGreaterThan(70);
			expect(cSawSearchWhileHeld, 'no ball_search_started may arrive while the cradle is held, however long').toBe(false);
			expect(cDrainTick, 'the instrument\'s own positive: releasing the cradle must genuinely drain the ball within 1000 ticks').toBeGreaterThan(0);
			expect(cBallEndedEvent?.player).toBe(0);
			expect(cBallEndedEvent?.tilted).toBe(false);

			// ---------------------------------------------------------------
			// The cup: AC 2's own instrument, carrying the pause/resume pair.
			// ---------------------------------------------------------------
			const cup = await importLoopWithMachineCapture();
			const cupLoop = cup.createLoop({ collisionDoc: buildCupDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });

			let out = startAndSettle(cupLoop, cup.NO_FRAME);
			const servedBallId = out.snapshot.balls[0]!.id;
			place(cup.getCaptured()!, servedBallId, CUP_PLACEMENT_MM);
			out = cupLoop.advance(1, []);
			expect(out.events.some((e) => e.type === 'ball_launched'), 'the cup premise: place() must genuinely produce ball_launched').toBe(true);
			const O = out.snapshot.tick;

			const P = O + 5000;
			const R = O + 25000;
			const expectedResumedTick = R + (BALL_SEARCH_TICKS - (P - O));

			const searchStartedTicks: number[] = [];
			while (out.snapshot.tick < expectedResumedTick + 10) {
				const nextTick = out.snapshot.tick + 1;
				const transitions =
					nextTick === P
						? [{ tick: nextTick, frame: { ...cup.NO_FRAME, flipper_l: true } }]
						: nextTick === R
							? [{ tick: nextTick, frame: { ...cup.NO_FRAME } }]
							: [];
				out = cupLoop.advance(1, transitions);
				if (out.events.some((e) => e.type === 'ball_search_started')) {
					searchStartedTicks.push(out.snapshot.tick);
				}
			}

			expect(O, 'the cup premise: O = L = 401 (the ball placed at T = 400)').toBe(401);
			expect(
				searchStartedTicks,
				`exactly one ball_search_started, at the spec's literal 35401 = R + (15000 - (P - O)), none while held (formula here: ${expectedResumedTick})`,
			).toEqual([35401]);
		},
		180_000,
	);
});

// ---------------------------------------------------------------------------
// Story 2.13, AC 7 -- DW-244 route 2: a lane ball already resting when the
// CURRENT ball drains is served as the NEXT ball, never stacked. Driven
// through a real createLoop(), using the SAME "dev pulse serves a second
// ball into the lane" construction the spec's own Code Map measures directly
// ("Measured at this tree", "The same shape via a dev pulse"): a genuine
// ball-search pass (the full V-cup instrument above) and a dev pulseCoil()
// serve both reach the identical rules-level state this route's own fix
// guards -- bd_shooter occupied while the CURRENT ball is still draining --
// so this reproduces route 2 without re-deriving the cup's own geometry.
// ---------------------------------------------------------------------------
describe('AC 7 -- DW-244 route 2: a lane ball already resting when the current ball drains plays as the NEXT ball, never stacked', () => {
	it(
		'a second ball served into the lane while ball 1 is still in play: ball 1\'s eventual drain gives ball_ended and ball_will_start with no re-serve; no ball_missing anywhere; the lane ball then plunges as ball 2',
		() => {
			const loop = createLoop({ collisionDoc: loadCommittedDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });

			loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
			let out = loop.advance(1, [{ tick: 3, frame: NO_FRAME }]);
			for (let i = 0; i < 398; i++) {
				out = loop.advance(1, []);
			}
			// The manual plunge -- ball 1 out onto the field.
			out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
			for (let i = 0; i < 1199; i++) {
				out = loop.advance(1, []);
			}
			out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
			let sawFirstLaunch = false;
			for (let i = 0; i < 500 && !sawFirstLaunch; i++) {
				out = loop.advance(1, []);
				if (out.events.some((e) => e.type === 'ball_launched')) {
					sawFirstLaunch = true;
				}
			}
			expect(sawFirstLaunch, 'sanity: ball 1 must genuinely be out on the field').toBe(true);
			expect(out.snapshot.balls, 'sanity: exactly one ball before the dev serve').toHaveLength(1);
			const ball1Id = out.snapshot.balls[0]!.id;

			// The dev pulse: a second ball served into the now-empty lane while
			// ball 1 is still rolling on the field.
			loop.pulseCoil('c_trough_eject');
			let sawArrival = false;
			for (let i = 0; i < 500 && !sawArrival; i++) {
				out = loop.advance(1, []);
				if (out.snapshot.mechanisms.devices.bd_shooter.slots[0] === true) {
					sawArrival = true;
				}
			}
			expect(sawArrival, 'the second ball must genuinely settle in the lane').toBe(true);
			expect(out.snapshot.balls, 'two balls now exist').toHaveLength(2);
			const laneBallId = out.snapshot.balls.find((b) => b.id !== ball1Id)!.id;
			expect(out.snapshot.game.machine.ballsInPlay, 'the served lane ball is never counted as a ball in play').toBe(1);

			// Ball 1's own eventual, natural drain (gravity alone -- the SAME
			// "no player input" idiom test/rules-tilt-integration.test.ts's own
			// tilted-ball drain uses).
			let sawBallEnded = false;
			let ballEndedTick = -1;
			let sawMissingAnywhere = false;
			for (let i = 0; i < 40000 && !sawBallEnded; i++) {
				out = loop.advance(1, []);
				if (out.events.some((e) => e.type === 'ball_missing')) {
					sawMissingAnywhere = true;
				}
				if (out.events.some((e) => e.type === 'ball_ended')) {
					sawBallEnded = true;
					ballEndedTick = out.snapshot.tick;
				}
			}
			expect(sawBallEnded, 'ball 1 must eventually drain on its own').toBe(true);
			expect(sawMissingAnywhere, 'no ball_missing anywhere in the run -- nothing was ever loose').toBe(false);

			const eventsAtDrain = out.events.filter((e) => e.tick === ballEndedTick).map((e) => e.type);
			expect(eventsAtDrain).toContain('ball_ended');
			expect(eventsAtDrain, 'ball_will_start must arrive the SAME tick -- the rotation is immediate').toContain('ball_will_start');

			// The negative (Red today: two balls in the lane the tick after the
			// drain): the ball count is unaffected by this drain -- the lane
			// ball was never re-served or stacked.
			expect(out.snapshot.balls, 'balls.length stays 1 (only the lane ball) at the drain tick').toHaveLength(1);
			expect(out.snapshot.balls[0]!.id, 'the surviving ball is the lane ball, not a re-serve').toBe(laneBallId);

			// Code review (second pass, Rule 19): the assertion pair above is
			// asserted ON `ballEndedTick`, and a `c_trough_eject` pulse issued
			// on that tick does not SPAWN until the next one (AD-4: commands
			// land on the next tick). So AC 7's own named mutation -- "drop the
			// lane-occupied check in startBall" -- puts the stacked second ball
			// at ballEndedTick+1, a tick this test never used to look at, and
			// every remaining assertion below (the lane ball still present,
			// ballNumber 2, ballsInPlay 1) holds just as well with two balls in
			// the lane. AC 7's own "the trough stays 3" clause was likewise
			// asserted nowhere. Both are pinned here, one tick later, where the
			// stacked ball can actually exist.
			out = loop.advance(1, []);
			expect(out.snapshot.balls, 'ballEndedTick+1, where a stacked serve WOULD have spawned: still exactly one ball').toHaveLength(1);
			expect(out.snapshot.balls[0]!.id, 'and it is still the lane ball').toBe(laneBallId);
			expect(
				out.snapshot.mechanisms.devices.bd_trough.slots.filter(Boolean).length,
				'AC 7: the trough stays 3 -- no second serve was drawn from it (Red today: 3 -> 2 at this exact tick)',
			).toBe(3);
			// And it holds through the quiet run up to the plunge, not just for
			// the one tick after.
			for (let i = 0; i < 2000; i++) {
				out = loop.advance(1, []);
			}
			expect(out.snapshot.balls, 'still one ball 2000 quiet ticks later').toHaveLength(1);
			expect(
				out.snapshot.mechanisms.devices.bd_trough.slots.filter(Boolean).length,
				'and the trough is still 3 through the quiet run',
			).toBe(3);

			// The positive: the plunge serves the lane ball as ball 2.
			out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
			for (let i = 0; i < 1199; i++) {
				out = loop.advance(1, []);
			}
			out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
			let sawSecondLaunch = false;
			for (let i = 0; i < 500 && !sawSecondLaunch; i++) {
				out = loop.advance(1, []);
				if (out.events.some((e) => e.type === 'ball_launched')) {
					sawSecondLaunch = true;
				}
			}
			expect(sawSecondLaunch, 'the plunge must genuinely launch the lane ball').toBe(true);
			expect(out.snapshot.balls.some((b) => b.id === laneBallId), 'the SAME lane ball leaves the lane').toBe(true);
			expect(out.snapshot.game.players[0]!.ballNumber, 'it plays as ball 2').toBe(2);
			expect(out.snapshot.game.machine.ballsInPlay).toBe(1);
		},
		60_000,
	);
});
