// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-6 (2026-09-03 amendment), AD-2, AD-11 -- the spinner: a pass-through
// gate, never a collision body. A ball crossing `sw_spinner`'s swept-segment
// zone imparts angular velocity proportional to its own entry speed; the
// spinner then runs free, closing `s_spinner` once per revolution until it
// decays back to rest (FR-26 awards per rotation). No `col_spinner_*` body
// exists in the committed document -- Story 2.1c measured thirteen-plus
// rigid-body variants and every one that genuinely contacted the ball
// produced a permanent DW-119-class stall, so the analytic swept-segment
// zone test (AD-11) is the physically correct model here, not a workaround
// for one (this story's Design Notes quote AD-6's own amendment in full).
//
// This module owns `s_spinner` end to end (AD-2: one source per switch),
// exactly the shape `sim/physics/pops.ts` uses for a skirt device -- but
// INVERTS one of that file's own invariants, deliberately: `pops.ts:146-156`
// throws when a switch MAKE has no ball resolvable in its own zone, because
// for a pop bumper that shape is a defect. Here it is the opposite of a
// defect -- a free-running closure with no ball present is this story's own
// discriminating observable for "the spinner keeps its own mechanical
// state, not the ball's" (AC 3's own "at least one closure lands on a tick
// when no ball's swept segment lies inside sw_spinner"). There is no
// counterpart throw here at all: `applyPostStep()` resolves each ball's own
// zone membership in a single pass, so there is no "the zone was crossed but
// no ball resolves to it" state for a defensive assertion to guard. (An
// earlier shape did carry such a throw, between a `.some()` and an identical
// `.find()` over the same array; it was unreachable by construction and both
// it and the duplicated scan were removed at this story's code review.)
//
// `s_spinner` is excluded from `switches.ts`'s own tracker (this module
// owns it, AD-2) -- see that file's widened `deviceModuleOwnedSwitches()`.
// This file is authored, not ported (AD-16, declared in
// `test/port-provenance.test.ts`'s `AUTHORED_PHYSICS_FILE_RELATIVE_PATHS`
// and `tools/dependency-cruiser.config.mjs`'s `AUTHORED_PHYSICS_FILES`).

import { TABLE } from '../table/dragonwar';
import type { ResolvedTuning } from '../table/tuning';
import type { SwitchName } from '../table/names';
import { SECONDS_PER_TICK } from '../contracts/time';
import { segmentIntersectsBox } from './geometry';
import type { Ball } from './ball/ball';
import type { BallStepMovement, ContactEventLike, SwitchEdgeLike } from './devices';
import type { LoadedSwitchZone } from './loader';
import type { SpinnerMechanismState } from '../contracts/snapshot';

const DEG_PER_REVOLUTION = 360;

/**
 * Degrees per second. An AUTHORED constant, the same non-tunable
 * detector-floor class `sim/physics/hop.ts`'s own trigger constants
 * document for themselves (AD-3/AD-15's two-class rule reserves `TUNING`
 * for FEEL knobs; this is where "at rest" is DEFINED, not something a feel
 * ritual would dial): below this the spinner is considered stopped, so the
 * decay authored in `TUNING.hardware.spinnerDecayPerTick` terminates in a
 * bounded number of ticks rather than relying on eventual float64
 * underflow -- AC 3's own "speed returns to 0" is a hard snap here, not an
 * asymptote.
 */
const SPINNER_AT_REST_DEG_PER_S = 1;

export interface SpinnerMechanicsResult {
	readonly switchEvents: SwitchEdgeLike[];
	readonly contactEvents: ContactEventLike[];
}

export interface SpinnerMechanics {
	/**
	 * Runs AFTER `physics.step()`, before `step()`'s own return
	 * (`SWITCH_EDGE_HARDWARE_RULES` -- see that manifest's own doc comment
	 * for why: this module needs this tick's own ball MOVEMENTS, which do
	 * not exist until the solve has run, exactly `pops.ts`'s own
	 * reasoning). On a genuine rising-edge crossing of `sw_spinner`
	 * (resolved the same way `pops.ts:145` resolves its own skirt make),
	 * adds angular velocity proportional to the resolved ball's own entry
	 * speed. Every call decays the spinner's current angular speed by
	 * `TUNING.hardware.spinnerDecayPerTick`, snapping to exactly 0 below
	 * `SPINNER_AT_REST_DEG_PER_S`, then accumulates angle and emits one
	 * `{ closed: true }` + `{ closed: false }` pair on `s_spinner` plus one
	 * `ContactEvent { kind: 'spinner_tick' }` per full revolution completed
	 * this tick (a `while` loop, not an `if` -- a single tick can complete
	 * more than one revolution at high angular speed). Applies no impulse
	 * to any ball -- a gate, not a body (AD-6).
	 */
	applyPostStep(tick: number, movements: readonly BallStepMovement[]): SpinnerMechanicsResult;
	/** The current mechanical state for the snapshot, keyed by `s_spinner` (`MechanismsSnapshot.spinner`'s own shape -- `Record<string, SpinnerMechanismState>`, since a future second spinner would be a second key). */
	readonly spinner: Readonly<Record<string, SpinnerMechanismState>>;
}

/**
 * Builds the spinner's own hardware rule. `switchZones` is the SAME
 * `LoadedSwitchZone[]` `switches.ts`'s own tracker was built over, filtered
 * here to the one zone `TABLE.spinnerWiring` declares (mirrors
 * `createPopMechanics()`'s own per-device zone filter).
 */
export function createSpinnerMechanics(options: {
	readonly switchZones: readonly LoadedSwitchZone[];
	readonly tuning: ResolvedTuning;
}): SpinnerMechanics {
	const { switchZones, tuning } = options;
	const gainDegPerSPerMmPerS = tuning.hardware.spinnerGainDegPerSPerMmPerS.value;
	const decayPerTick = tuning.hardware.spinnerDecayPerTick.value;

	// DW-149 anti-vacuity: the subject is TABLE.spinnerWiring's own key set,
	// never a hand-typed "s_spinner" literal.
	const wiringKeys = Object.keys(TABLE.spinnerWiring) as Array<keyof typeof TABLE.spinnerWiring>;
	if (wiringKeys.length === 0) {
		throw new Error('createSpinnerMechanics(): TABLE.spinnerWiring has no entries -- nothing to spin');
	}
	if (wiringKeys.length > 1) {
		// This module keeps exactly one spinner's worth of mutable state
		// (angularSpeedDegPerS/angleAccumulatorDeg/occupied below) -- a second
		// spinner would need it widened to a per-key state map rather than
		// silently sharing this one's decay and revolution count.
		throw new Error(
			'createSpinnerMechanics(): TABLE.spinnerWiring has more than one entry -- this module owns exactly one spinner\'s mechanical state; widen it before adding a second.',
		);
	}
	const spinnerSwitch = TABLE.spinnerWiring[wiringKeys[0]!].switch as SwitchName;
	const zones = switchZones.filter((zone) => zone.switch === spinnerSwitch);
	if (zones.length === 0) {
		throw new Error(`createSpinnerMechanics(): TABLE.spinnerWiring names switch "${spinnerSwitch}", but no loaded switch zone uses it`);
	}

	let angularSpeedDegPerS = 0;
	let angleAccumulatorDeg = 0;
	/**
	 * Own rising-edge state, PER BALL (mirrors `switches.ts`'s
	 * `TrackedSwitch.reported`, without settle -- `s_spinner` is no longer
	 * tracker-owned at all, so this module must detect its own entry edge to
	 * fire the spin-up impulse exactly once per crossing, not once per tick
	 * of dwell).
	 *
	 * [WIDENED, code review this pass.] This was a single module-level
	 * `occupied: boolean` gating every impulse as `raw && !occupied`, where
	 * `raw` was `movements.some(...)` over ALL balls. That silently dropped a
	 * second ball's entire spin contribution whenever a first ball was still
	 * inside the zone -- and the dwell is 12-66 ticks at the measured entry
	 * speeds, so this was never limited to a genuinely simultaneous crossing:
	 * a stream of balls through the Left Loop registered only the first.
	 * DragonWar ships Quick multiball and the War (FR-35/37/38, AD-18) and
	 * FR-26 awards per rotation, so under multiball the spinner would
	 * under-award for a reason no consumer could see. A `WeakSet` keyed by
	 * the ball itself is the project's own precedent for per-ball state
	 * carried across ticks inside physics (`sim/physics/hop.ts`'s
	 * `WeakMap<Ball, number>`), weak so a drained or parked ball is not
	 * pinned. Single-ball behaviour is byte-identical: one ball still
	 * produces exactly one impulse per crossing.
	 */
	const ballsInZone = new WeakSet<Ball>();

	function applyPostStep(tick: number, movements: readonly BallStepMovement[]): SpinnerMechanicsResult {
		const switchEvents: SwitchEdgeLike[] = [];
		const contactEvents: ContactEventLike[] = [];

		// One pass over the movements, resolving each ball's own zone
		// membership once (the previous shape scanned `movements x zones`
		// twice -- a `.some()` for `raw` and then an identical `.find()` for
		// the ball -- with an unreachable `throw` between them, because the
		// second scan could not fail once the first had succeeded). Every
		// ball that is inside the zone THIS tick and was not inside it LAST
		// tick contributes its own entry impulse.
		for (const movement of movements) {
			const inside = zones.some((zone) => segmentIntersectsBox(movement.beforeMm, movement.afterMm, zone.minMm, zone.maxMm));
			if (!inside) {
				ballsInZone.delete(movement.ball);
				continue;
			}
			if (ballsInZone.has(movement.ball)) {
				continue;
			}
			ballsInZone.add(movement.ball);
			// Swept-segment length over the tick -- a MAGNITUDE, so the
			// physics frame's negated y (AD-10) cannot leak a sign into it.
			const distanceMm = Math.hypot(
				movement.afterMm.x - movement.beforeMm.x,
				movement.afterMm.y - movement.beforeMm.y,
				movement.afterMm.z - movement.beforeMm.z,
			);
			const entrySpeedMmPerS = distanceMm / SECONDS_PER_TICK;
			angularSpeedDegPerS += gainDegPerSPerMmPerS * entrySpeedMmPerS;
		}

		if (angularSpeedDegPerS > 0) {
			angularSpeedDegPerS *= decayPerTick;
			if (angularSpeedDegPerS < SPINNER_AT_REST_DEG_PER_S) {
				angularSpeedDegPerS = 0;
			}
		}

		if (angularSpeedDegPerS > 0) {
			angleAccumulatorDeg += angularSpeedDegPerS * SECONDS_PER_TICK;
			while (angleAccumulatorDeg >= DEG_PER_REVOLUTION) {
				angleAccumulatorDeg -= DEG_PER_REVOLUTION;
				switchEvents.push({ type: 'switch', switch: spinnerSwitch, closed: true, tick });
				switchEvents.push({ type: 'switch', switch: spinnerSwitch, closed: false, tick });
				contactEvents.push({ type: 'contact', kind: 'spinner_tick', tick });
			}
		} else {
			// At rest: no partial-revolution edge is ever owed for whatever
			// sub-360-degree remainder the decay left behind.
			angleAccumulatorDeg = 0;
		}

		return { switchEvents, contactEvents };
	}

	return {
		applyPostStep,
		get spinner(): Readonly<Record<string, SpinnerMechanismState>> {
			return { [spinnerSwitch]: { speed: angularSpeedDegPerS } };
		},
	};
}
