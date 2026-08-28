// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-1, AD-6, AD-10 -- the cabinet-side machine facade `sim/loop` drives.
// Builds from a parsed collision document via `loadCollision()`, sets
// gravity from the effective pitch (matching `tools/spike-1/scene.ts:115`'s
// own `setGravity(PITCH_DEG, DEFAULT_TABLE_GRAVITY * GRAVITYCONST)` call),
// and exposes `step(tick, frame, commands)` plus a read-only ball/device
// view for the snapshot publisher (`sim/loop/index.ts`).
//
// Per tick: applies the previous tick's `pulse` commands to the devices
// layer (may spawn/launch a ball), calls `PlayerPhysics.step()` exactly
// once, then runs the zone tests (`switches.ts`) and the device entry tests
// (`devices.ts`) over every ball's swept segment this tick produced. Ball
// ids are assigned here and stable for a ball's lifetime; a ball parked and
// later ejected gets a NEW id (`devices.ts`'s own `nextBallId` callback).
// All table<->physics conversion goes through `sim/table/frames.ts`.
//
// This file is authored, not ported (AD-16, declared in
// `test/sim-boundary.test.ts`'s `AUTHORED_FILES`).

import type { Ball } from './ball/ball';
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST } from './constants';
import { createDeviceMechanics, type BallStepMovement, type ContactEventLike, type DeviceFailure, type SwitchEdgeLike } from './devices';
import { loadCollision } from './loader';
import { createSwitchTracker } from './switches';
import { TABLE } from '../table/dragonwar';
import { fromPhysics } from '../table/frames';
import type { ResolvedTuning } from '../table/tuning';
import type { BallDeviceName, CoilCommand } from '../table/names';
import type { InputFrame } from '../contracts/input';

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

	function step(tick: number, frame: InputFrame, commands: readonly CoilCommand[]): MachineStepResult {
		// Story 1.6+ wires hardware rules (flippers, the manual plunger) here,
		// each gated behind its own coil enable/disable inside this same
		// step -- Epic 1's rules layer never round-trips them. Nothing in
		// Story 1.5 reads `frame` yet.
		void frame;

		const pulses = commands.filter((c) => c.action === 'pulse').map((c) => ({ coil: c.coil }));
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
			switchEvents: [...commandResult.switchEvents, ...switchEdges, ...entryResult.switchEvents],
			contactEvents: [...commandResult.contactEvents, ...entryResult.contactEvents],
			semanticEvents: [...commandResult.failures, ...entryResult.failures],
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
		effectivePitchDeg,
	};
}
