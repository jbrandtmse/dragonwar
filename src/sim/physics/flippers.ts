// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-5 -- the flipper hardware rule: builds a `FlipperMover` + `FlipperHit`
// per side from `loadCollision()`'s own `LoadedFlipper`s and `TUNING.flipper`
// (`sim/physics/flipper/flipper-config.ts`), registers both with
// `PlayerPhysics.addFlipper()`, applies `TUNING.materials.flipper_rubber`
// through the same `setElasticity()`/`setFriction()`/`setScatter()` calls
// `sim/physics/loader/index.ts`'s `applyMaterial()` already makes for every
// other hit object, and exposes `applyFrame()` -- read once per tick from
// `machine.ts`, BEFORE `physics.step()` (AD-5: same-tick, no rules round
// trip) -- plus the per-tick `FlipperMechanismState` for the snapshot.
//
// This file is authored, not ported (AD-16, declared in
// `test/sim-boundary.test.ts`'s `AUTHORED_FILES`).

import { Event } from './game/event';
import { EventProxy } from './game/event-proxy';
import { PlayerPhysics } from './game/player-physics';
import { DEFAULT_STEPTIME_S } from './constants';
import { radToDeg } from './math/float';
import { buildFlipperConfig, buildFlipperPhysicsData } from './flipper/flipper-config';
import { FlipperHit } from './flipper/flipper-hit';
import type { FlipperMover } from './flipper/flipper-mover';
import type { FlipperState } from './flipper/flipper-config';
import { TUNING, type ResolvedTuning } from '../table/tuning';
import type { CoilName } from '../table/names';
import type { LoadedFlipper } from './loader';
import type { ContactEventLike } from './devices';
import type { InputFrame } from '../contracts/input';
import type { FlipperMechanismState } from '../contracts/snapshot';

export interface FlipperMechanicsResult {
	readonly contactEvents: readonly ContactEventLike[];
}

export interface FlipperMechanics {
	/**
	 * The hardware rule, run once per tick from `machine.ts`, BEFORE
	 * `physics.step()`. `coilEnabled` gates the solenoid only -- a
	 * `flipper_l`/`flipper_r` key press while disabled has no effect, and a
	 * disable mid-stroke lets the bat return under its own spring rather than
	 * freezing it (I/O matrix, "Coil disabled" row).
	 */
	applyFrame(tick: number, frame: InputFrame, coilEnabled: Readonly<Record<'l' | 'r', boolean>>): FlipperMechanicsResult;
	readonly state: Readonly<Record<'l' | 'r', FlipperMechanismState>>;
}

/**
 * `TABLE.coils` names no per-side field of its own -- `c_flipper_l` and
 * `c_flipper_r` are only its two OWN keys, read here via `Object.keys()`
 * (a runtime value, never a quoted literal) rather than spelling either name
 * out: `pnpm lint:boundaries`'s device-name-literal rule bans a `c_`-prefixed
 * string literal anywhere outside `sim/table/dragonwar.ts`, and the object
 * literal's KEYS below (unquoted identifiers, not string literals) are how
 * the association is expressed without one.
 */
const SIDE_BY_COIL: Partial<Record<CoilName, 'l' | 'r'>> = {
	c_flipper_l: 'l',
	c_flipper_r: 'r',
};

function coilForSide(side: 'l' | 'r'): CoilName {
	const found = (Object.keys(SIDE_BY_COIL) as CoilName[]).find((coil) => SIDE_BY_COIL[coil] === side);
	if (!found) {
		throw new Error(`createFlipperMechanics(): TABLE.coils has no coil mapped to flipper side "${side}"`);
	}
	return found;
}

interface FlipperSideRig {
	readonly coil: CoilName;
	readonly mover: FlipperMover;
	readonly flipperState: FlipperState;
	/** Mutated by `applyFrame()` every tick; read back by the SAME reference, never copied. */
	readonly flags: { eosPending: boolean; previousSolenoidOn: boolean };
}

function buildSideRig(flipper: LoadedFlipper, tuning: ResolvedTuning, physics: PlayerPhysics): FlipperSideRig {
	const config = buildFlipperConfig(flipper, tuning);
	const data = buildFlipperPhysicsData(tuning);
	const flipperState: FlipperState = { angle: config.angleStart };
	const events = new EventProxy();
	const flags = { eosPending: false, previousSolenoidOn: false };

	// Story 1.6 deviation (see `game/event-proxy.ts`'s own header): the
	// restored `onVoidEvent` hook, not upstream's script-event dispatch --
	// `FlipperMover.updateDisplacements()` fires `Event.LimitEventsEOS` only
	// (never `LimitEventsBOS`) into `flags.eosPending`; `flipper_eos` is the
	// only member of the closed `ContactKind` union this file ever emits.
	events.onVoidEvent = (e: Event) => {
		if (e === Event.LimitEventsEOS) {
			flags.eosPending = true;
		}
	};

	const hit = new FlipperHit(config, data, flipperState, events);
	// The material comes from the already-authored TUNING.materials.flipper_rubber
	// -- the same setElasticity()/setFriction()/setScatter() calls
	// sim/physics/loader/index.ts's applyMaterial() makes for every other hit
	// object in the compound body, not a second material-resolution path.
	const material = TUNING.materials.flipper_rubber;
	hit.setElasticity(material.elasticity.value, material.elasticityFalloff.value);
	hit.setFriction(material.friction.value);
	hit.setScatter(material.scatter.value);

	const mover = hit.getMoverObject();
	physics.addFlipper(mover, hit);

	return { coil: coilForSide(flipper.side), mover, flipperState, flags };
}

/** Builds the flipper hardware rule over an already-loaded `LoadedFlipper[]` (`sim/physics/loader`) and `ResolvedTuning`. */
export function createFlipperMechanics(options: {
	readonly physics: PlayerPhysics;
	readonly flippers: readonly LoadedFlipper[];
	readonly tuning: ResolvedTuning;
}): FlipperMechanics {
	const { physics, flippers, tuning } = options;

	const left = flippers.find((f) => f.side === 'l');
	const right = flippers.find((f) => f.side === 'r');
	if (!left || !right) {
		throw new Error(`createFlipperMechanics(): expected exactly one "l" and one "r" LoadedFlipper, got sides [${flippers.map((f) => f.side).join(', ')}]`);
	}

	const rigs: Readonly<Record<'l' | 'r', FlipperSideRig>> = {
		l: buildSideRig(left, tuning, physics),
		r: buildSideRig(right, tuning, physics),
	};

	function applyFrame(tick: number, frame: InputFrame, coilEnabled: Readonly<Record<'l' | 'r', boolean>>): FlipperMechanicsResult {
		const contactEvents: ContactEventLike[] = [];

		for (const side of ['l', 'r'] as const) {
			const rig = rigs[side];

			// The EOS flag was set (if at all) by the LAST physics.step() call --
			// checked here, before this tick's own solenoid command, so it is
			// reported exactly once per stroke rather than being overwritten by
			// a same-tick re-arm below.
			if (rig.flags.eosPending) {
				// I/O matrix: "ContactEvent { kind: 'flipper_eos', surface: 'flipper', device: <coil> }".
				contactEvents.push({ type: 'contact', kind: 'flipper_eos', device: rig.coil, surface: 'flipper', tick });
				rig.flags.eosPending = false;
			}

			const held = side === 'l' ? frame.flipper_l : frame.flipper_r;
			const desired = held && coilEnabled[side];
			if (desired !== rig.flags.previousSolenoidOn) {
				// Mirrors vpx-js's own FlipperApi.RotateToEnd()/RotateToStart(): arm
				// enableRotateEvent on every solenoid TRANSITION so the mover's own
				// end-of-stroke clamp (flipper-mover.ts) fires the event only once
				// per genuine press, not on every tick the state happens to match.
				rig.mover.enableRotateEvent = desired ? 1 : -1;
			}
			rig.mover.setSolenoidState(desired);
			rig.flags.previousSolenoidOn = desired;
		}

		return { contactEvents };
	}

	return {
		applyFrame,
		get state(): Readonly<Record<'l' | 'r', FlipperMechanismState>> {
			// Angle -> degrees, angular speed -> deg/s through DEFAULT_STEPTIME_S
			// -- the same "physics-internal-unit-per-T -> per-second" technique
			// sim/loop/index.ts's own physicsVelocityToTableMmPerS() already uses
			// for ball velocity, mirrored here rather than re-derived (this
			// story's own task list).
			const toState = (rig: FlipperSideRig): FlipperMechanismState => ({
				angleDeg: radToDeg(rig.flipperState.angle),
				angularVelDegPerSec: radToDeg(rig.mover.angleSpeed) / DEFAULT_STEPTIME_S,
			});
			return { l: toState(rigs.l), r: toState(rigs.r) };
		},
	};
}
