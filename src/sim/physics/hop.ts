// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9, AC 2 -- hop control. Authored BESIDE the port, never inside it
// (this story's Design Notes, "Hop control: authored beside the port, never
// inside it"): `DW-79`'s port-body freeze (`test/port-provenance.test.ts`'s
// "port-body freeze (DW-79)" describe block) covers `ball/ball-hit.ts`,
// `flipper/flipper-hit.ts` and `functions.ts` -- exactly where a hop would
// naturally live (`collide3DWall()` /
// `elasticityWithFalloff()`) -- so this file never edits any of them; it acts
// entirely AFTER `physics.step()` has already run, as a collision-RESPONSE
// modifier over what the step produced, mirroring `machine.ts`'s own
// post-step half (`switchTracker.step()`, `deviceMechanics.detectEntries()`).
//
// AD-3 forbids randomness -- `physics-tuning.md:31` is explicit: hops are
// "authored, not emergent; must not be implemented as scatter or
// randomness." The mechanism is therefore a DETERMINISTIC function of a
// ball's own post-step velocity CHANGE while a flipper is ACTIVELY
// ROTATING: a hard flipper strike changes a ball's velocity by ~40 VU/T
// within the ONE tick the port's own collision resolution runs (measured
// against `test/flipper-collision.test.ts`'s "a ball meeting a bat that is
// being driven up is struck" case -- see `test/hop-control.test.ts`'s own
// header for the exact figure); an ordinary roll, a ball merely resting on a
// raised (uncontacted) bat, or a wall bounce changes it by at most a few
// VU/T. `HOP_TRIGGER_DELTA_SPEED` sits well inside that gap. `hopControl`
// scales how much of the EXCESS above the trigger becomes vertical (z)
// launch speed, added directly to `ball.hit.vel.z` in the same
// physics-internal units the solver already uses -- exactly zero whenever
// `hopControl` is 0, whatever the delta (AC 2: "at zero there are none").
//
// GATED ON ACTIVE ROTATION, NOT MERE COIL STATE (found this pass, against the
// roll-and-drain golden's own multi-thousand-tick continuous flipper hold):
// gating on "coil energised" alone means a ball bumping repeatedly against
// an ALREADY-RAISED, STATIONARY bat (angular velocity ~0, long past its own
// end-of-stroke) reads exactly like a genuine strike -- a bat sitting still
// is physically a wall, not something that just hit anything. Real energy
// enters a ball only while the mover is actually swinging -- gating on each
// side's `angularVelDegPerSec` (already published by `flippers.ts`'s own
// `state` getter) instead of the coil boolean is both more physically
// honest AND excludes exactly this false-positive class: measured this
// pass, roll-and-drain's own two would-be triggers (deltaSpeed 23.7 and
// 31.4 VU/T, tick 5575 and 7370) both occur with the bat long settled at
// end-of-stroke (angular velocity ~0, per `test/flipper-collision.test.ts`'s
// own "unmoving ... without oscillating" measurement), while a genuine
// driven strike (this file's own "struck" reference) occurs while the mover
// is mid-stroke at several hundred deg/s.
//
// COOLDOWN: a hop that lands the ball back onto the bat while it is STILL
// actively rotating (a real possibility for a fast, repeated flip) could
// itself register as a fresh large delta and re-trigger without limit.
// Each ball gets its own per-tick cooldown after a hop fires
// (`HOP_COOLDOWN_TICKS`, authored, same non-tunable class as the trigger
// above) -- deterministic (keyed by tick number, never wall-clock or
// randomness), and the SAME mechanism a single hard strike (this file's AC 2
// test) only ever needs to clear once.

import type { Ball } from './ball/ball';
import type { ResolvedTuning } from '../table/tuning';

/** Each flipper side's angular velocity THIS tick, degrees per second (`flippers.ts`'s own `state.{l,r}.angularVelDegPerSec`) -- not merely "coil energised": a bat sitting still at end-of-stroke is physically a wall, not something that just struck anything (see this file's header). */
export interface HopFlipperState {
	readonly l: number;
	readonly r: number;
}

/** One ball, plus its velocity immediately BEFORE `physics.step()` ran this tick (physics-internal units, VU per T -- the same units `ball.hit.vel` already carries). The caller captures this; `applyPostStep()` reads the ball's CURRENT (post-step) velocity itself to compute the delta. */
export interface HopBallVelocitySample {
	readonly ball: Ball;
	readonly beforeVel: { readonly x: number; readonly y: number; readonly z: number };
}

export interface HopMechanics {
	/**
	 * Runs AFTER `physics.step()` (never before -- this is not a hardware
	 * rule, `test/hardware-rule-seam.test.ts`'s `NOT_A_HARDWARE_RULE`
	 * allowlist names this module's export by the same reasoning it already
	 * applies to `switchTracker`). Mutates `ball.hit.vel.z` in place for any
	 * sampled ball whose this-tick velocity delta exceeds the trigger while
	 * at least one flipper is ACTIVELY ROTATING (see this file's header) AND
	 * that ball is outside its own post-hop cooldown. A no-op call (no
	 * sample, no flipper rotating, `hopControl` 0) touches nothing --
	 * deterministic, no PRNG drawn (AD-3). `tick` is the current simulation
	 * tick, used only to key the cooldown.
	 */
	applyPostStep(tick: number, samples: readonly HopBallVelocitySample[], flippers: HopFlipperState): void;
}

/**
 * VU/T. An AUTHORED constant, not a `TUNING` entry -- AD-3/AD-15's
 * two-class rule reserves `TUNING` for FEEL knobs the panel and the ritual
 * tune; this is a detector's own discrimination threshold, sized once from a
 * measurement and not meant to be played with. See this file's header for
 * the measurement it sits between (~40 VU/T struck, ~1 VU/T settling).
 */
const HOP_TRIGGER_DELTA_SPEED = 15;

/**
 * Degrees per second. An AUTHORED constant, same non-tunable class as the
 * trigger above: a mover ramping toward or holding its end-of-stroke sits
 * near 0 deg/s once settled (`test/flipper-collision.test.ts`'s own
 * "unmoving ... without oscillating" measurement, deviation < 0.01 deg
 * across a 5 s hold); a stroke in progress runs at several hundred deg/s.
 * 30 deg/s sits comfortably inside that gap -- far above settle noise, far
 * below an actual swing.
 */
const HOP_ACTIVE_ROTATION_DEG_PER_S = 30;

/**
 * Ticks. An AUTHORED constant, same non-tunable class as the trigger above:
 * how long a ball that just hopped is immune to hopping again. 200 ticks
 * (0.2 s at the shipped 1000 Hz) is comfortably longer than a hop's own
 * flight time at this file's authored default (measured this pass) while
 * short enough that two genuinely separate hard hits, seconds apart, each
 * still hop normally.
 */
const HOP_COOLDOWN_TICKS = 200;

/** Builds the hop mechanism from an already-resolved tuning (`resolveTuning()`, usually called once by `sim/loop`) -- reads `tuning.hopControl.value` once at construction, exactly like every other `create*Mechanics()` in this directory. */
export function createHopMechanics(options: { readonly tuning: ResolvedTuning }): HopMechanics {
	const hopControl = options.tuning.hopControl.value;
	// WeakMap, not Map: a drained/parked ball's entry must not pin it in
	// memory forever, and the mechanism has no lifecycle hook to clear one
	// explicitly.
	const lastHopTick = new WeakMap<Ball, number>();

	function applyPostStep(tick: number, samples: readonly HopBallVelocitySample[], flippers: HopFlipperState): void {
		// AC 2's own "at zero there are none": hopControl <= 0 is a hard,
		// unconditional no-op -- never even reads a sample's velocity, so this
		// is exactly zero, not merely rounds to it. Likewise, no flipper
		// actively rotating this tick means nothing this file exists to detect
		// could have happened (a stationary bat, held or not, is a wall).
		const rotating = Math.abs(flippers.l) >= HOP_ACTIVE_ROTATION_DEG_PER_S || Math.abs(flippers.r) >= HOP_ACTIVE_ROTATION_DEG_PER_S;
		if (hopControl <= 0 || !rotating) {
			return;
		}
		for (const sample of samples) {
			const cooldownUntil = lastHopTick.get(sample.ball);
			if (cooldownUntil !== undefined && tick - cooldownUntil < HOP_COOLDOWN_TICKS) {
				continue;
			}
			const vel = sample.ball.hit.vel;
			const dx = vel.x - sample.beforeVel.x;
			const dy = vel.y - sample.beforeVel.y;
			const dz = vel.z - sample.beforeVel.z;
			const deltaSpeed = Math.sqrt(dx * dx + dy * dy + dz * dz);
			const excess = deltaSpeed - HOP_TRIGGER_DELTA_SPEED;
			if (excess > 0) {
				vel.z += hopControl * excess;
				lastHopTick.set(sample.ball, tick);
			}
		}
	}

	return { applyPostStep };
}
