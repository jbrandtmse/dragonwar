// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-1, AD-5, AD-6, AD-10 -- the cabinet-side machine facade `sim/loop`
// drives. Builds from a parsed collision document via `loadCollision()`,
// sets gravity from the effective pitch (matching
// `tools/spike-1/scene.ts:115`'s own `setGravity(PITCH_DEG,
// DEFAULT_TABLE_GRAVITY * GRAVITYCONST)` call), and exposes `step(tick,
// frame, commands)` plus a read-only ball/device/mechanism view for the
// snapshot publisher (`sim/loop/index.ts`).
//
// Per tick, in order: (1) `commands` are partitioned into `pulse`s and
// `enable`/`disable`s -- the latter update the per-coil enabled map this file
// owns (AD-7: `hardwareEnabled`-like state, but physics-side and never read
// by rules); (2) the flipper and manual-plunger HARDWARE RULES
// (`sim/physics/flippers.ts`, `sim/physics/plunger.ts`) read `frame` and the
// enabled map and command their movers -- this is the one place `InputFrame`
// is read, and it happens BEFORE `physics.step()` so a switch closing at
// tick *t* moves its coil in the SAME step (AD-5: "no rules round trip");
// (3) this tick's `pulse`s apply to the devices layer (may spawn/launch a
// ball); (4) `PlayerPhysics.step()` runs exactly once; (5) the zone tests
// (`switches.ts`) and the device entry tests (`devices.ts`) run over every
// ball's swept segment this tick produced. Ball ids are assigned here and
// stable for a ball's lifetime; a ball parked and later ejected gets a NEW
// id (`devices.ts`'s own `nextBallId` callback). All table<->physics
// conversion goes through `sim/table/frames.ts`.
//
// This file is authored, not ported (AD-16, declared in
// `test/sim-boundary.test.ts`'s `AUTHORED_FILES`).

import type { Ball } from './ball/ball';
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST } from './constants';
import { createDeviceMechanics, type BallStepMovement, type ContactEventLike, type DeviceFailure, type SwitchEdgeLike } from './devices';
import { createFlipperMechanics } from './flippers';
import { createPlungerMechanics } from './plunger';
import { loadCollision } from './loader';
import { createSwitchTracker } from './switches';
import { TABLE } from '../table/dragonwar';
import { fromPhysics } from '../table/frames';
import type { ResolvedTuning } from '../table/tuning';
import type { BallDeviceName, CoilCommand, CoilName } from '../table/names';
import type { InputFrame } from '../contracts/input';
import type { MechanismsSnapshot } from '../contracts/snapshot';

/** The subset of `MechanismsSnapshot` this file's own `mechanisms` getter owns -- `sim/loop/index.ts` fills in `dropTargets`/`spinner` (both empty in Epic 1) and `devices` (from `deviceSlots` above) itself. */
export type HardwareMechanismsState = Pick<MechanismsSnapshot, 'flippers' | 'plunger'>;

export interface MachineStepResult {
	readonly switchEvents: readonly SwitchEdgeLike[];
	readonly contactEvents: readonly ContactEventLike[];
	/**
	 * `eject_failed` / `device_overflow` -- physics-native device failures
	 * (AD-9's Conventions vocabulary). Surfaced directly rather than routed
	 * through `sim/rules/index.ts`'s `step(state, switchEvents, tick)`, whose
	 * signature carries no channel for them; `sim/loop/index.ts` folds these
	 * straight into the frame's `events`, alongside whatever rules produces.
	 */
	readonly semanticEvents: readonly DeviceFailure[];
}

export interface Machine {
	step(tick: number, frame: InputFrame, commands: readonly CoilCommand[]): MachineStepResult;
	/** Read-only view of every currently-simulated ball, for the snapshot publisher. */
	readonly balls: readonly Ball[];
	/** Every ball device's current slot occupancy: a parking device's real slots, or a non-parking device's single-element "ball present in its entry zone" array (AD-6: "device counts ... are the number of closed slot switches and nothing else"). */
	readonly deviceSlots: Readonly<Record<BallDeviceName, readonly boolean[]>>;
	/** A frozen, per-tick snapshot of the flipper and plunger hardware rules -- the `deviceSlots` getter's own shape, applied to Story 1.6's mechanisms. `sim/loop/index.ts`'s `buildSnapshot()` is the only reader. */
	readonly mechanisms: HardwareMechanismsState;
	readonly effectivePitchDeg: number;
}

/**
 * Builds the cabinet machine from an already-parsed collision document
 * (`loadCollision()`'s own contract: `sim/` never parses a file, AD-1).
 * `tuning` is the caller's already-resolved tuning (`resolveTuning()`,
 * usually called once by `sim/loop`) so this file performs no `…Ms` -> ticks
 * arithmetic of its own.
 */
export function createMachine(collisionDoc: unknown, tuning: ResolvedTuning): Machine {
	const loaded = loadCollision(collisionDoc);
	const physics = loaded.physics;

	const effectivePitchDeg = TABLE.reference.pitchDeg;
	physics.setGravity(effectivePitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);

	let ballIdCounter = 0;
	const nextBallId = (): number => ballIdCounter++;

	const switchTracker = createSwitchTracker(loaded.switchZones, tuning);
	const deviceMechanics = createDeviceMechanics({
		physics,
		devices: loaded.devices,
		switchZones: loaded.switchZones,
		tuning,
		nextBallId,
	});
	const flipperMechanics = createFlipperMechanics({ physics, flippers: loaded.flippers, tuning });
	const plungerMechanics = createPlungerMechanics({ deviceMechanics, tuning });

	// AD-5: "gated only by CoilCommand enable | disable" -- a per-coil map,
	// default enabled, fed ONLY by `enable`/`disable` commands below. Every
	// coil key is written with an unquoted identifier (never a quoted string
	// literal): `pnpm lint:boundaries`'s device-name-literal rule bans a
	// `c_`-prefixed string literal outside `sim/table/dragonwar.ts`, and an
	// object-literal KEY (or a `.dotAccess`) is not a string literal token.
	const coilEnabled: Record<CoilName, boolean> = {
		c_flipper_l: true,
		c_flipper_r: true,
		c_trough_eject: true,
		c_autolaunch: true,
	};

	function step(tick: number, frame: InputFrame, commands: readonly CoilCommand[]): MachineStepResult {
		const pulses: Array<{ coil: CoilName }> = [];
		for (const command of commands) {
			if (command.action === 'pulse') {
				pulses.push({ coil: command.coil });
			} else if (command.action === 'enable') {
				coilEnabled[command.coil] = true;
			} else {
				coilEnabled[command.coil] = false;
			}
		}

		// AD-5: the hardware rules read `frame` and run BEFORE physics.step(),
		// so a button closing at tick *t* moves its coil in the SAME step --
		// never round-tripped through sim/rules (RulesStepResult.commands
		// stays readonly never[]).
		const flipperResult = flipperMechanics.applyFrame(tick, frame, { l: coilEnabled.c_flipper_l, r: coilEnabled.c_flipper_r });
		const plungerResult = plungerMechanics.applyFrame(tick, frame, coilEnabled.c_autolaunch);

		const commandResult = deviceMechanics.applyCommands(tick, pulses);

		const before = new Map<Ball, ReturnType<typeof fromPhysics>>();
		for (const ball of physics.balls) {
			before.set(ball, fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z }));
		}

		physics.step();

		const movements: BallStepMovement[] = [];
		for (const ball of physics.balls) {
			const beforeMm = before.get(ball);
			if (!beforeMm) {
				// Every ball present after step() was already present before it --
				// PlayerPhysics.step() never adds or removes a ball on its own
				// (only devices.ts's detectEntries(), which runs AFTER this loop).
				continue;
			}
			const afterMm = fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
			movements.push({ ball, beforeMm, afterMm });
		}

		const switchEdges = switchTracker.step(tick, movements.map((m) => ({ before: m.beforeMm, after: m.afterMm })));
		const entryResult = deviceMechanics.detectEntries(tick, movements);

		return {
			switchEvents: [...commandResult.switchEvents, ...plungerResult.switchEvents, ...switchEdges, ...entryResult.switchEvents],
			contactEvents: [...flipperResult.contactEvents, ...commandResult.contactEvents, ...plungerResult.contactEvents, ...entryResult.contactEvents],
			semanticEvents: [...commandResult.failures, ...plungerResult.failures, ...entryResult.failures],
		};
	}

	return {
		step,
		get balls(): readonly Ball[] {
			return physics.balls;
		},
		get deviceSlots(): Readonly<Record<BallDeviceName, readonly boolean[]>> {
			// A frozen COPY of each device's slots, not the live array
			// devices.ts keeps mutating on later ticks: a Snapshot (and
			// GameState.machine.deviceSlots, AD-7) is a point-in-time value --
			// callers that hold onto an earlier one (a test comparing frames, a
			// future replay consumer) must never see it change out from under
			// them because a LATER tick happened to reuse the same array.
			const slots: Partial<Record<BallDeviceName, readonly boolean[]>> = {};
			for (const [name, device] of Object.entries(TABLE.ballDevices) as Array<[BallDeviceName, (typeof TABLE.ballDevices)[BallDeviceName]]>) {
				slots[name] = device.kind === 'parking'
					? [...deviceMechanics.parkingSlots[name]]
					: [switchTracker.currentState(device.entry)];
			}
			return slots as Readonly<Record<BallDeviceName, readonly boolean[]>>;
		},
		get mechanisms(): HardwareMechanismsState {
			// Frozen per-tick, the same reasoning as `deviceSlots` above:
			// `flipperMechanics.state`/`plungerMechanics.state` already build a
			// fresh object on every read, so this is a plain pass-through, not a
			// live reference a later tick could mutate out from under a caller.
			return { flippers: flipperMechanics.state, plunger: plungerMechanics.state };
		},
		effectivePitchDeg,
	};
}
