// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-5 -- the cabinet hardware rule, mirroring `flippers.ts`/`plunger.ts`'s
// own shape: `createCabinetMechanics({ physics, tuning })` returning
// `applyFrame(tick, frame)` plus a per-tick `state` getter, called from
// `machine.ts`'s existing hardware-rule seam, BEFORE `physics.step()`.
// DragonWar-authored (no upstream equivalent for the facade itself, the edge
// collapsing, or the ball coupling -- this story's Design Notes table).
//
// Owns, in this order per tick: (1) detect nudge rising edges off `frame`;
// (2) queue one impulse per rising edge (`nudge-impulse.ts`); (3) step the
// oscillator (`oscillator.ts`); (4) step the bob with this tick's cabinet
// acceleration (`plumb-bob.ts`); (5) apply the TABLE-FRAME coupling to every
// ball in `physics.balls`; (6) feed the slam counter the same edge stream
// (`slam.ts`); (7) collapse both switch levels to edges (AD-2), reading
// `settleTicks` from `resolvedTuning.switchSettleTicksByClass` -- both
// classes resolve to 0 (`sim/table/tuning.ts`'s `switchSettleMsByClass`), so
// this reduces to a plain state-change test, which is correct (this story's
// Code Map: "not a reason to omit it").
//
// Why this conserves inertial velocity (this story's Design Notes): the
// table frame IS the cabinet frame -- playfield, walls and bats are rigidly
// attached to it, so in that frame the collision geometry is correctly
// static. A nudge makes that frame non-inertial: the exact and only
// consequence is a uniform pseudo-acceleration `-a_cabinet` on every free
// body in it. So each tick, every ball's TABLE-FRAME velocity changes by
// `-a_cabinet * dt`, and its INERTIAL velocity -- table-frame velocity plus
// cabinet velocity -- is unchanged. No energy enters the ball; the cabinet
// moves under it. This is the third of upstream's own commented-out
// `ball-mover.ts:85` line (`vel.sub(player.tableVelDelta)`); the DEFECT
// AD-5 names is the first two (`vel.x += nudgeX; vel.y += nudgeY`), which
// add the cabinet's acceleration to the ball ON TOP OF the frame term,
// injecting energy with no physical source. `ball-mover.ts` is never
// touched -- the coupling lives here so the direct test harness exercises
// the real coupling code, not a copy.
//
// Nudge directions (`NUDGE_DIRECTIONS` below) are an AUTHORED table-frame
// decision, not a transcribed constant: no authorized vpinball/vpinball file
// states its own core-script angle-to-action mapping (that mapping lives in
// vpinball's Lua-like scripting layer, out of this port's reach entirely --
// see nudge-impulse.ts's header). `nudge_l`/`nudge_r` push the cabinet along
// table -X/+X; `nudge_up` pushes it along table -Y (toward the player), so
// that by the frame relation above the ball's relative motion shifts toward
// +Y -- up the playfield, away from the player -- matching the action's own
// name and the PRD's "Space/arrow keys to Nudge" framing (Design Notes,
// "The key map: which key becomes which nudge").

import { CABINET_SUBSTEP_SECONDS, createCabinetOscillator, type CabinetOscillator } from './oscillator';
import { createNudgeImpulseQueue, type CabinetImpulseQueue } from './nudge-impulse';
import { createPlumbBob, type PlumbBob, type PlumbBobState } from './plumb-bob';
import { createSlamDetector, type SlamDetector } from './slam';
import type { PlayerPhysics } from '../game/player-physics';
import type { SwitchEdgeLike } from '../devices';
import { TABLE, type SettleClass } from '../../table/dragonwar';
import { toPhysics, type Vec3 } from '../../table/frames';
import type { ResolvedTuning } from '../../table/tuning';
import type { SwitchName } from '../../table/names';
import type { InputFrame } from '../../contracts/input';

export interface CabinetMechanicsResult {
	readonly switchEvents: readonly SwitchEdgeLike[];
}

export interface CabinetState {
	readonly oscillator: { readonly x: CabinetOscillator['x']; readonly y: CabinetOscillator['y'] };
	readonly bob: PlumbBobState;
	readonly slamOverThreshold: boolean;
}

export interface CabinetMechanics {
	/** The hardware rule, run once per tick from `machine.ts`, BEFORE `physics.step()` (AD-5). Reads only the three nudge actions off `frame`; the other five are none of this file's concern. */
	applyFrame(tick: number, frame: InputFrame): CabinetMechanicsResult;
	readonly state: CabinetState;
}

const NUDGE_ACTIONS = ['nudge_l', 'nudge_r', 'nudge_up'] as const;
type NudgeAction = (typeof NUDGE_ACTIONS)[number];

/** Authored table-frame unit directions -- see this file's header. */
const NUDGE_DIRECTIONS: Readonly<Record<NudgeAction, { readonly x: number; readonly y: number }>> = {
	nudge_l: { x: -1, y: 0 },
	nudge_r: { x: 1, y: 0 },
	nudge_up: { x: 0, y: -1 },
};

/**
 * SI m/s^2 (table frame) -> physics U/T^2, by differencing two `toPhysics()`
 * calls for the axis/length part (cancels the affine playfield-height
 * translation, AD-10) and applying the VP time-unit scaling LOCALLY --
 * `devices.ts:126-141`'s own convention: "the remaining /100 ... is not part
 * of `frames.ts`'s contract". A table VELOCITY crossing divides by 100
 * (1 s = 100 T, `devices.ts`'s `tableSpeedToPhysicsVelocity()`); acceleration
 * scales as length/time^2, so this ACCELERATION crossing divides by
 * 100*100 = 10000. `test/frames.test.ts` pins this against `GRAVITYCONST`
 * (converting 9.81 m/s^2 reproduces it, and the y axis flips sign).
 */
export function cabinetAccelToPhysicsAccel(accelMPerS2: { readonly x: number; readonly y: number }): { readonly x: number; readonly y: number } {
	const mmPerS2: Vec3 = { x: accelMPerS2.x * 1000, y: accelMPerS2.y * 1000, z: 0 };
	const origin = toPhysics({ x: 0, y: 0, z: 0 });
	const tip = toPhysics(mmPerS2);
	return { x: (tip.x - origin.x) / 10000, y: (tip.y - origin.y) / 10000 };
}

/** One `CABINET_SUBSTEP_SECONDS` (0.001 s) expressed in physics T units (1 s = 100 T) -- a fixed constant, independent of `TICK_HZ`. */
const SUBSTEP_DT_T = CABINET_SUBSTEP_SECONDS * 100;

/**
 * Derives `s_tilt_bob` / `s_slam_tilt` STRUCTURALLY from their unique
 * `SettleClass`, never as a string literal (`pnpm lint:boundaries`'s
 * device-name-literal rule bans an `s_`-prefixed literal outside
 * `sim/table/dragonwar.ts`) -- mirrors `sim/loop/index.ts`'s
 * `buttonSwitchByAction()` and `sim/physics/plunger.ts`'s
 * `findManualPlungeDevice()`. Both classes are unique keys in
 * `TABLE.switches` (Code Map, "Verified environment facts": grep-counted 1
 * and 1), so exactly one match is expected; anything else is a `TABLE`
 * authoring defect, not a runtime condition to degrade gracefully from.
 */
function switchNameForSettleClass(settleClass: SettleClass): SwitchName {
	const matches = (Object.entries(TABLE.switches) as Array<[SwitchName, { readonly settleClass: SettleClass }]>).filter(
		([, sw]) => sw.settleClass === settleClass,
	);
	if (matches.length !== 1) {
		throw new Error(`createCabinetMechanics(): expected exactly one TABLE.switches entry with settleClass "${settleClass}", found ${matches.length}`);
	}
	return matches[0]![0];
}

/**
 * The AC-3 edge-collapsing shape `switches.ts`'s `TrackedSwitch` models for
 * zone-tested switches (`reported` / `pendingSince` / `pendingValue`, "back
 * to the last reported value cancels the window, it does not pause it") --
 * reused here structurally (not imported: the bob and the slam counter have
 * neither ball nor zone, so `switches.ts`'s zone machinery itself does not
 * apply) over a plain boolean LEVEL rather than a swept-segment test. At
 * `settleTicks` 0 (both `tilt_bob` and `slam`'s classes) this reduces to a
 * plain state-change test -- correct, not a reason to omit it.
 */
export interface LevelTracker {
	reported: boolean;
	pendingSince: number | null;
	pendingValue: boolean | null;
	readonly settleTicks: number;
}

/**
 * Story 2.1b task 14 (DW-67): identical semantics to
 * `switches.ts`'s `createSwitchTracker()` step -- settleTicks gates the
 * BREAK only, never the MAKE (AD-2, AMENDED 2026-09-01). Kept as a byte-for-
 * byte parallel implementation (this file's own header already explains why
 * it is not a shared import: the bob and the slam counter have neither ball
 * nor zone, so `switches.ts`'s zone machinery does not apply) -- any future
 * change to one MUST be mirrored in the other, and
 * `test/cabinet-switch-tracker-agreement.test.ts` pins the two against an
 * identical raw sequence so they cannot silently diverge.
 */
// Exported (test-only consumer: test/cabinet-switch-tracker-agreement.test.ts)
// so that suite can pin this function's own edges directly against
// switches.ts's createSwitchTracker() for an identical raw sequence -- the
// two implementations must never diverge (this function's own doc comment
// above).
export function stepLevel(tracked: LevelTracker, tick: number, raw: boolean): boolean | null {
	if (raw === tracked.reported) {
		tracked.pendingSince = null;
		tracked.pendingValue = null;
		return null;
	}
	if (raw) {
		tracked.reported = true;
		tracked.pendingSince = null;
		tracked.pendingValue = null;
		return true;
	}
	if (tracked.pendingValue !== raw) {
		tracked.pendingSince = tick;
		tracked.pendingValue = raw;
	}
	// Story 2.1d (DW-67 residual): identical correction to switches.ts's own
	// createSwitchTracker() step -- see that file's DW-67 comment block for
	// the full derivation. `pendingSince` latches on the first tick read
	// outside; requiring `elapsedTicks >= settleTicks` only becomes true on
	// the `settleTicks + 1`-th outside tick. Corrected to `settleTicks - 1`
	// so the break fires on the `settleTicks`-th consecutive outside tick,
	// per AD-2's amended text. `settleTicks = 0` (both `tilt_bob` and `slam`
	// today) is a fixed point of both formulations.
	const elapsedTicks = tick - (tracked.pendingSince as number);
	if (elapsedTicks >= tracked.settleTicks - 1) {
		tracked.reported = false;
		tracked.pendingSince = null;
		tracked.pendingValue = null;
		return false;
	}
	return null;
}

/** Builds the cabinet hardware rule over an already-built `PlayerPhysics` (`sim/physics/game/player-physics.ts`) and `ResolvedTuning`. Throws at construction if `createCabinetOscillator()` throws (the `TICK_HZ`/sub-step guard, `oscillator.ts`) -- a load-time path. */
export function createCabinetMechanics(options: { readonly physics: PlayerPhysics; readonly tuning: ResolvedTuning }): CabinetMechanics {
	const { physics, tuning } = options;

	const oscillator = createCabinetOscillator(tuning);
	const impulseQueue: CabinetImpulseQueue = createNudgeImpulseQueue({ tuning, substepsPerTick: oscillator.substepsPerTick });
	const bob: PlumbBob = createPlumbBob(tuning);
	const slamDetector: SlamDetector = createSlamDetector(tuning);

	const tiltBobSwitchName = switchNameForSettleClass('tilt_bob');
	const slamTiltSwitchName = switchNameForSettleClass('slam');
	const bobTracked: LevelTracker = { reported: false, pendingSince: null, pendingValue: null, settleTicks: tuning.switchSettleTicksByClass.tilt_bob.value };
	const slamTracked: LevelTracker = { reported: false, pendingSince: null, pendingValue: null, settleTicks: tuning.switchSettleTicksByClass.slam.value };

	let previousNudge: Readonly<Record<NudgeAction, boolean>> = { nudge_l: false, nudge_r: false, nudge_up: false };

	function applyFrame(tick: number, frame: InputFrame): CabinetMechanicsResult {
		let edgeCount = 0;
		for (const action of NUDGE_ACTIONS) {
			const held = frame[action];
			if (held && !previousNudge[action]) {
				edgeCount += 1;
				const dir = NUDGE_DIRECTIONS[action];
				impulseQueue.queue(dir.x, dir.y);
			}
		}
		previousNudge = { nudge_l: frame.nudge_l, nudge_r: frame.nudge_r, nudge_up: frame.nudge_up };

		let deltaVelPhysicsX = 0;
		let deltaVelPhysicsY = 0;
		for (let s = 0; s < oscillator.substepsPerTick; s++) {
			const impulseAccel = impulseQueue.stepSubstep();
			oscillator.stepSubstep(oscillator.massKg * impulseAccel.x, oscillator.massKg * impulseAccel.y);

			const physicsAccel = cabinetAccelToPhysicsAccel({ x: oscillator.x.accelerationMPerS2, y: oscillator.y.accelerationMPerS2 });
			deltaVelPhysicsX += physicsAccel.x * SUBSTEP_DT_T;
			deltaVelPhysicsY += physicsAccel.y * SUBSTEP_DT_T;

			bob.stepSubstep(oscillator.x.accelerationMPerS2, oscillator.y.accelerationMPerS2);
		}

		// AD-5: table-frame coupling. No force, impulse or velocity delta is
		// ever added to a ball ON ACCOUNT OF THE NUDGE -- this is purely the
		// pseudo-acceleration term of a non-inertial frame (see this file's
		// header); the ball's INERTIAL velocity is unchanged.
		for (const ball of physics.balls) {
			ball.hit.vel.x -= deltaVelPhysicsX;
			ball.hit.vel.y -= deltaVelPhysicsY;
		}

		slamDetector.recordEdges(tick, edgeCount);

		const switchEvents: SwitchEdgeLike[] = [];
		const bobEdge = stepLevel(bobTracked, tick, bob.state.isOverThreshold);
		if (bobEdge !== null) {
			switchEvents.push({ type: 'switch', switch: tiltBobSwitchName, closed: bobEdge, tick });
		}
		const slamEdge = stepLevel(slamTracked, tick, slamDetector.isOverThreshold);
		if (slamEdge !== null) {
			switchEvents.push({ type: 'switch', switch: slamTiltSwitchName, closed: slamEdge, tick });
		}

		return { switchEvents };
	}

	return {
		applyFrame,
		get state(): CabinetState {
			// Frozen per-tick, the same reasoning as `machine.ts`'s own
			// `mechanisms`/`deviceSlots` getters: every field read here is
			// already a fresh value per read (the port modules' own getters),
			// so this is a plain pass-through, never a live reference a later
			// tick could mutate out from under a caller.
			return {
				oscillator: { x: oscillator.x, y: oscillator.y },
				bob: bob.state,
				slamOverThreshold: slamDetector.isOverThreshold,
			};
		},
	};
}
