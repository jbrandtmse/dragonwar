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
// when no ball's swept segment lies inside sw_spinner"). The "no ball
// resolvable" throw below fires only on the ENTRY impulse itself (a rising
// edge computed from the SAME `movements` the raw test just read `true`
// from, so unreachable in practice -- the same defensive-assertion shape
// `pops.ts` uses for its own resolution, not a copy of its inverted
// invariant).
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
	/** Own rising-edge state (mirrors `switches.ts`'s `TrackedSwitch.reported`, without settle -- `s_spinner` is no longer tracker-owned at all, so this module must detect its own entry edge to fire the spin-up impulse exactly once per crossing, not once per tick of dwell). */
	let occupied = false;

	function applyPostStep(tick: number, movements: readonly BallStepMovement[]): SpinnerMechanicsResult {
		const switchEvents: SwitchEdgeLike[] = [];
		const contactEvents: ContactEventLike[] = [];

		const raw = movements.some((movement) => zones.some((zone) => segmentIntersectsBox(movement.beforeMm, movement.afterMm, zone.minMm, zone.maxMm)));
		if (raw && !occupied) {
			const resolved = movements.find((movement) => zones.some((zone) => segmentIntersectsBox(movement.beforeMm, movement.afterMm, zone.minMm, zone.maxMm)));
			if (!resolved) {
				// Defensive only (see this file's header): `raw` was just
				// computed `true` from this SAME `movements` array, so this
				// branch is unreachable in practice -- fail loudly rather
				// than spin the mechanism from nothing if it ever is.
				throw new Error(`createSpinnerMechanics(): "${spinnerSwitch}" crossed at tick ${tick} but no ball's swept segment resolves to it`);
			}
			const distanceMm = Math.hypot(
				resolved.afterMm.x - resolved.beforeMm.x,
				resolved.afterMm.y - resolved.beforeMm.y,
				resolved.afterMm.z - resolved.beforeMm.z,
			);
			const entrySpeedMmPerS = distanceMm / SECONDS_PER_TICK;
			angularSpeedDegPerS += gainDegPerSPerMmPerS * entrySpeedMmPerS;
		}
		occupied = raw;

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
