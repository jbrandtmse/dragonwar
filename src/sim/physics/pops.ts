// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-5, AD-2, DW-148 -- the pop-bumper hardware rule. A pop bumper is a
// SKIRT device (spec Code Map: `sw_pop_1` is a 76 mm square around a 40 mm
// octagon, the ball need never touch `col_pop_1` at all), so its trigger is
// a SWITCH EDGE -- which exists only after `switches.ts`'s tracker has run
// -- never a contact-time collision like the slingshot's own placement
// (`sim/physics/slings.ts`). This file therefore runs as a POST-switch-edge
// participant, in the mould `sim/physics/hop.ts` already legitimises: called
// from `machine.ts` immediately after `switchTracker.step()` and before the
// tick's own return, gated only by `CoilCommand enable | disable` (AD-5),
// never routed through `sim/rules` (AD-2's "rules never receive a
// ContactEvent").
//
// The kick itself is AUTHORED, not ported (see this story's spec Design
// Notes and `ATTRIBUTIONS.md`'s own record) -- no bumper model exists
// anywhere in this tree (vpx-js's own lives in `lib/vpt/bumper/`, outside the
// `lib/physics/` closure Story 1.1 ported), so no `// Ported from` marker and
// no provenance row is owed.
//
// This file is authored, not ported (AD-16, declared in
// `test/port-provenance.test.ts`'s `AUTHORED_PHYSICS_FILE_RELATIVE_PATHS`
// and `tools/dependency-cruiser.config.mjs`'s `AUTHORED_PHYSICS_FILES`).

import { TABLE } from '../table/dragonwar';
import type { ResolvedTuning } from '../table/tuning';
import type { SwitchName } from '../table/names';
import { segmentIntersectsBox } from './geometry';
import { tableSpeedToPhysicsVelocity, type BallStepMovement, type ContactEventLike, type SwitchEdgeLike } from './devices';
import type { LoadedSwitchZone } from './loader';

/** The three pop coils, matching `TABLE.popWiring`'s own key set (DW-149: this file never hand-types a second copy of the set -- see `createPopMechanics()`'s own derivation). */
export type PopCoilName = keyof typeof TABLE.popWiring;

/** Each pop bumper's own collision-node centroid, table-frame millimetres, DERIVED by `sim/physics/loader/index.ts` from the committed document's own `footprintMm` -- never hand-typed (this story's spec, "Anti-vacuity"). */
export type PopCentroidsByCoil = Readonly<Record<PopCoilName, { readonly x: number; readonly y: number }>>;

export interface PopMechanicsResult {
	readonly contactEvents: ContactEventLike[];
}

export interface PopMechanics {
	/**
	 * Runs AFTER `switches.ts`'s tracker has produced this tick's edges and
	 * BEFORE `machine.ts`'s own `step()` returns (never before
	 * `physics.step()` -- this is not a `PRE_STEP_HARDWARE_RULES` participant;
	 * see `machine.ts`'s own `SWITCH_EDGE_HARDWARE_RULES` manifest). For every
	 * `s_pop_N` MAKE edge this tick whose own `c_pop_N` is enabled, resolves
	 * the ball whose swept segment lies inside `sw_pop_N` this tick and adds
	 * an impulse radially away from `col_pop_N`'s own centroid; emits exactly
	 * one `ContactEvent { kind: 'coil_fire' }` per kick. A make edge with NO
	 * resolvable ball throws (I/O matrix: "fail loudly ... rather than
	 * kicking an arbitrary ball or silently doing nothing") -- a switch
	 * closing with no ball in its own zone is an internal-consistency defect,
	 * the same class `PlayerPhysics.removeBall()`'s own step-time
	 * consistency checks already throw for, never a foreseeable game
	 * situation to swallow.
	 */
	applyPostSwitchEdges(
		tick: number,
		switchEdges: readonly SwitchEdgeLike[],
		movements: readonly BallStepMovement[],
		coilEnabled: Readonly<Record<PopCoilName, boolean>>,
	): PopMechanicsResult;
}

interface PopDevice {
	readonly coil: PopCoilName;
	readonly switchName: SwitchName;
	readonly zones: readonly LoadedSwitchZone[];
	readonly centroidMm: { readonly x: number; readonly y: number };
}

/**
 * Millimetres. An AUTHORED constant, the same non-tunable class
 * `sim/physics/hop.ts`'s own trigger constants document for themselves
 * (AD-3/AD-15's two-class rule reserves `TUNING` for FEEL knobs; this is a
 * degenerate-input tie-break, not something a feel ritual would ever dial):
 * resolves the on-axis case `createPopMechanics()`'s own doc comment
 * describes -- deliberately for every `rawDx` WITHIN this floor, not only
 * a numerically-exact zero (code review finding, this pass: an
 * epsilon-gated version was tried and measurably reopens DW-148, since a
 * ball that re-descends after a kick lands back near, but not exactly on,
 * the same x -- see the kick-direction computation's own comment below for
 * the full reasoning). Sized well clear of this device's own switch zone
 * width (dozens of mm across), so no ordinary, well off-centre approach is
 * ever affected -- only a genuine near-apex descent is.
 */
const POP_KICK_TIE_BREAK_MM = 5;

/**
 * Builds the pop-bumper hardware rule. `popCentroidsMm` comes from
 * `loadCollision()` (derived from the document's own footprints);
 * `switchZones` is the SAME `LoadedSwitchZone[]` `switches.ts`'s own tracker
 * was built over, filtered here per device.
 */
export function createPopMechanics(options: {
	readonly switchZones: readonly LoadedSwitchZone[];
	readonly popCentroidsMm: PopCentroidsByCoil;
	readonly tuning: ResolvedTuning;
}): PopMechanics {
	const { switchZones, popCentroidsMm, tuning } = options;

	// DW-149 anti-vacuity: the subject set is TABLE.popWiring's own key set,
	// never a hand-typed literal list or `<something>.length` -- a fourth pop
	// bumper added to that registry is covered automatically.
	const coils = Object.keys(TABLE.popWiring) as PopCoilName[];
	if (coils.length === 0) {
		throw new Error('createPopMechanics(): TABLE.popWiring has no pop-bumper entries -- nothing to kick');
	}

	const devices: readonly PopDevice[] = coils.map((coil) => {
		const switchName = TABLE.popWiring[coil].switch as SwitchName;
		const zones = switchZones.filter((zone) => zone.switch === switchName);
		if (zones.length === 0) {
			throw new Error(`createPopMechanics(): TABLE.popWiring names switch "${switchName}" for coil "${coil}", but no loaded switch zone uses it`);
		}
		return { coil, switchName, zones, centroidMm: popCentroidsMm[coil] };
	});

	function applyPostSwitchEdges(
		tick: number,
		switchEdges: readonly SwitchEdgeLike[],
		movements: readonly BallStepMovement[],
		coilEnabled: Readonly<Record<PopCoilName, boolean>>,
	): PopMechanicsResult {
		const contactEvents: ContactEventLike[] = [];

		for (const device of devices) {
			const madeThisTick = switchEdges.some((edge) => edge.switch === device.switchName && edge.closed);
			if (!madeThisTick) {
				continue;
			}
			// The switch itself is not the coil (I/O matrix, "Pop disabled"
			// row): the skirt still closes and the switch edge above still
			// fires, but a disabled coil kicks nobody and emits no
			// `coil_fire` -- the ball bounces off `col_pop_N` as a plain
			// wall (its `bumper` material's own collision response, applied
			// by `loader/index.ts`'s ordinary `addWall()` path, is
			// untouched by this file either way).
			if (!coilEnabled[device.coil]) {
				continue;
			}

			const resolved = movements.find((movement) => device.zones.some((zone) => segmentIntersectsBox(movement.beforeMm, movement.afterMm, zone.minMm, zone.maxMm)));
			if (!resolved) {
				// I/O matrix, "Pop skirt closed, no ball resolvable": a
				// degenerate input must not resolve to a silent pass, and
				// must not kick an arbitrary ball. `switches.ts`'s own
				// tracker and this function read the SAME `movements` this
				// tick, so a genuine make with no ball in the zone is an
				// internal-consistency defect, not a reachable game state.
				throw new Error(
					`createPopMechanics(): "${device.switchName}" made at tick ${tick} but no ball's swept segment lies inside its own zone(s) -- refusing to kick an arbitrary ball`,
				);
			}

			const rawDx = resolved.afterMm.x - device.centroidMm.x;
			const dy = resolved.afterMm.y - device.centroidMm.y;
			// DW-148's own strand: a ball descending EXACTLY onto the
			// octagon's apex vertex (x precisely equal to the centroid's
			// own x) has a `rawDx` of (numerically) zero, so the "radially
			// away from centroid" direction is a straight-up kick -- which
			// is itself symmetric about that same vertical line. A
			// perfectly symmetric operation applied to a perfectly
			// symmetric state can never break its own symmetry, however
			// many times it repeats: measured this pass, a ball kicked
			// straight up off col_pop_1's apex at every popKickMmPerS value
			// tried came straight back down onto the SAME x, landing in a
			// new but equally permanent vertical equilibrium rather than
			// genuinely escaping. `POP_KICK_TIE_BREAK_MM` resolves this
			// EXACT tie with a fixed, deterministic lateral floor (never
			// randomness, AD-3) -- physically honest, too: a real skirt is
			// never perfectly radially symmetric in practice, so a ball
			// entering dead-centre still leaves along some real edge, never
			// straight back the way it came. Gravity in this table has no
			// x-component (Code Map, "pure down-slope, no x-component"), so
			// even this small a sideways speed is never fought and persists
			// through the whole flight, carrying the ball genuinely clear.
			// DELIBERATELY floors every approach within `POP_KICK_TIE_BREAK_MM`
			// of dead-centre, not only the numerically-exact-zero case (code
			// review finding, this pass -- an epsilon-gated version was tried
			// and measurably reopens DW-148: with no x-component to gravity,
			// a ball that kicks clear and later re-descends lands back within
			// float64 noise of the SAME x, never exactly zero twice running,
			// so an epsilon gate hands it a series of near-zero-but-nonzero
			// `rawDx` values -- each one a nearly-straight-up kick, which is
			// exactly the "equally permanent vertical equilibrium" this
			// constant exists to prevent. `Math.max`/`Math.min` only ever
			// widens a real offset SMALLER than this fixed floor -- ordinary
			// approaches from well off-centre (this device's own switch zone
			// is dozens of mm across) are never touched by it.
			const dx = rawDx >= 0 ? Math.max(rawDx, POP_KICK_TIE_BREAK_MM) : Math.min(rawDx, -POP_KICK_TIE_BREAK_MM);
			const len = Math.hypot(dx, dy);
			// Guards a division by zero. Note (code review, this pass) that
			// this else-branch is DEAD BY CONSTRUCTION, not merely
			// unreachable from today's geometry as an earlier version of
			// this comment claimed: the line above guarantees
			// `|dx| >= POP_KICK_TIE_BREAK_MM` (5 mm), so `len` is never
			// below 5 and `len > 1e-6` always holds. It is retained as a
			// total-function guard -- the tie-break's own value is what
			// makes it dead, and a future change to that constant (or to
			// the floor's shape) is exactly when it would stop being.
			const dir = len > 1e-6 ? { x: dx / len, y: dy / len, z: 0 } : { x: 1, y: 0, z: 0 };
			const impulse = tableSpeedToPhysicsVelocity(dir, tuning.hardware.popKickMmPerS.value);
			resolved.ball.hit.vel.add(impulse);

			contactEvents.push({
				type: 'contact',
				kind: 'coil_fire',
				device: device.coil,
				ballId: resolved.ball.id,
				surface: 'bumper',
				pos: resolved.afterMm,
				tick,
			});
		}

		return { contactEvents };
	}

	return { applyPostSwitchEdges };
}
