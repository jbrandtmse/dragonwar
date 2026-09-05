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
// by rules) AND (Story 2.2) each sling's own `SlingshotSurfaceData.isDisabled`,
// mirrored from that same map every tick; (2) the flipper and manual-plunger
// HARDWARE RULES (`sim/physics/flippers.ts`, `sim/physics/plunger.ts`) read
// `frame` and the enabled map and command their movers -- this is the one
// place `InputFrame` is read, and it happens BEFORE `physics.step()` so a
// switch closing at tick *t* moves its coil in the SAME step (AD-5: "no
// rules round trip"); (3) this tick's `pulse`s apply to the devices layer
// (may spawn/launch a ball); (4) `PlayerPhysics.step()` runs exactly once --
// the SLINGSHOT hardware rule (Story 2.2, `sim/physics/slings.ts`) fires
// INSIDE this call, at the moment of contact, via the `KickReportingSlingshot`
// instances `loadCollision()` built; (5) the zone tests (`switches.ts`) and
// the device entry tests (`devices.ts`) run over every ball's swept segment
// this tick produced, and the POP-BUMPER hardware rule (Story 2.2,
// `sim/physics/pops.ts`) runs immediately after the zone tests, reacting to
// this tick's own switch edges (see `SWITCH_EDGE_HARDWARE_RULES`, below).
// Ball ids are assigned here and stable for a ball's lifetime; a ball parked
// and later ejected gets a NEW id (`devices.ts`'s own `nextBallId` callback).
// All table<->physics conversion goes through `sim/table/frames.ts`.
//
// This file is authored, not ported (AD-16, declared in
// `test/port-provenance.test.ts`'s `AUTHORED_FILES`).

import type { Ball } from './ball/ball';
import { createCabinetMechanics, type CabinetState } from './cabinet';
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST } from './constants';
import { createDeviceMechanics, type BallStepMovement, type ContactEventLike, type DeviceFailure, type SwitchEdgeLike } from './devices';
import { createFlipperMechanics } from './flippers';
import { createHopMechanics, type HopBallVelocitySample } from './hop';
import { createPlungerMechanics } from './plunger';
import { loadCollision } from './loader';
import { createPopMechanics, type PopCoilName } from './pops';
import { createSwitchTracker } from './switches';
import { TABLE } from '../table/dragonwar';
import { fromPhysics } from '../table/frames';
import type { ResolvedTuning } from '../table/tuning';
import type { BallDeviceName, CoilCommand, CoilName } from '../table/names';
import type { InputFrame } from '../contracts/input';
import type { MechanismsSnapshot } from '../contracts/snapshot';

/** The subset of `MechanismsSnapshot` this file's own `mechanisms` getter owns -- `sim/loop/index.ts` fills in `dropTargets`/`spinner` (both empty in Epic 1) and `devices` (from `deviceSlots` above) itself. */
export type HardwareMechanismsState = Pick<MechanismsSnapshot, 'flippers' | 'plunger'>;

/**
 * Local, so `sim/physics/**` never reaches into `sim/table/tuning.ts` for one
 * clamp (the same reasoning `tuning.ts`'s own local `clampNumber()` states
 * for not reaching the other way).
 *
 * Review finding, this pass: `pitchMinDeg`/`pitchMaxDeg` are ordinary
 * `TuningEntry<number>` leaves the panel enumerates and lets a developer
 * edit independently -- an edit that leaves `min > max` (e.g. a typo)
 * previously produced an inverted, out-of-either-band clamp (`x < min`
 * returning `min`, which could sit ABOVE the intended `max`). Normalising
 * the pair first makes the clamp well-defined for any `min`/`max` ordering.
 */
function clampToRange(x: number, minInput: number, maxInput: number): number {
	const min = Math.min(minInput, maxInput);
	const max = Math.max(minInput, maxInput);
	if (x < min) {
		return min;
	}
	if (x > max) {
		return max;
	}
	return x;
}

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
	/**
	 * Story 1.7: a frozen, per-tick snapshot of the cabinet oscillator, the
	 * tilt bob and the slam detector -- shaped exactly like `mechanisms`
	 * above, for the same reason (a fresh object per read, never a live
	 * reference a later tick could mutate out from under a caller). Epic 1
	 * renders no cabinet shake (Design Notes, "`MechanismsSnapshot` is
	 * deliberately not widened"), so this has no `Snapshot` counterpart yet --
	 * `test/cabinet-*.test.ts` and Story 1.9's tuning panel are its readers.
	 */
	readonly cabinet: CabinetState;
	readonly effectivePitchDeg: number;
}

/**
 * AD-5's seam, as DATA: every entry below is called from `step()` BEFORE
 * `physics.step()` (Story 1.8's "hardware-rule registry", a manifest, never
 * an executable array -- see the spec's Design Notes, "The hardware-rule
 * registry is a manifest, not an executable array", for why: `step()`'s
 * three return channels (`switchEvents`/`contactEvents`/`semanticEvents`)
 * each spread these four participants in a DIFFERENT, hand-picked order,
 * none of which matches this list or the call order below, and that
 * ordering is hashed into Story 1.8's own golden replays -- an executable
 * loop would silently collapse to ONE order and change it).
 *
 * `test/hardware-rule-seam.test.ts` fails if any entry's call moves after
 * `physics.step()`, or if a `createMachine()`-constructed mechanics object
 * (a `const X = create…(...)` immediately below) is not listed here or on
 * that test's own `NOT_A_HARDWARE_RULE` allowlist. Names only -- `receiver`
 * and `method` are plain identifiers, never `c_`/`bd_`/`s_`-prefixed string
 * literals (`pnpm lint:boundaries` check (e) bans those outside
 * `sim/table/dragonwar.ts`), and this array is never executed.
 */
export const PRE_STEP_HARDWARE_RULES = [
	{ receiver: 'flipperMechanics', method: 'applyFrame', pinnedBy: 'test/flipper-mover.test.ts' },
	{ receiver: 'plungerMechanics', method: 'applyFrame', pinnedBy: 'test/plunger.test.ts' },
	{ receiver: 'cabinetMechanics', method: 'applyFrame', pinnedBy: 'test/cabinet-integration.test.ts' },
	{ receiver: 'deviceMechanics', method: 'applyCommands', pinnedBy: 'test/machine-serve-drain.test.ts' },
] as const;

/**
 * Story 2.2 (AD-5): the pop bumper's own manifest, DECLARED rather than
 * allowlisted onto `NOT_A_HARDWARE_RULE` -- AD-5 calls pop bumpers hardware
 * rules, so `test/hardware-rule-seam.test.ts`'s completeness check must keep
 * meaning what it says for this participant too. Unlike
 * `PRE_STEP_HARDWARE_RULES` above (checked BEFORE `physics.step();`), every
 * entry here is checked AFTER `switchTracker.step(` and BEFORE `step()`'s own
 * `return` -- the skirt edge this device reacts to does not exist until the
 * tracker has run (see this file's header, "Pop -- immediately after :296,
 * before the return"). The slingshot needs no entry here (and none in
 * `PRE_STEP_HARDWARE_RULES` either): its kick fires INSIDE `physics.step()`
 * itself, via the `KickReportingSlingshot` instances `loadCollision()` built
 * (`sim/physics/slings.ts`), so there is no separate `receiver.method(...)`
 * call site for a manifest to pin.
 */
export const SWITCH_EDGE_HARDWARE_RULES = [
	{ receiver: 'popMechanics', method: 'applyPostSwitchEdges', pinnedBy: 'test/pop-bumper.test.ts' },
] as const;

/**
 * Builds the cabinet machine from an already-parsed collision document
 * (`loadCollision()`'s own contract: `sim/` never parses a file, AD-1).
 * `tuning` is the caller's already-resolved tuning (`resolveTuning()`,
 * usually called once by `sim/loop`) so this file performs no `…Ms` -> ticks
 * arithmetic of its own.
 */
export function createMachine(collisionDoc: unknown, tuning: ResolvedTuning): Machine {
	// Story 1.9 review fix: loadCollision() previously ignored `tuning`
	// entirely (it read the bare module-level TUNING import for every
	// non-flipper material), so a hot-applied materials.default.* (or any
	// non-flipper material) override never reached the running sim even
	// though this function receives the caller's resolved tuning. See
	// src/sim/physics/loader/index.ts's loadCollision() doc comment.
	const loaded = loadCollision(collisionDoc, tuning);
	const physics = loaded.physics;

	// Story 1.9, AC 4: the resolved tuning's `defaultPitchDeg` is the runtime
	// pitch, clamped to `[pitchMinDeg, pitchMaxDeg]` -- never silently accepted
	// out of band (I/O matrix). `TABLE.reference.pitchDeg` stays the loader's
	// REFERENCE dimension only (AD-10); this file's Design Notes citation of
	// it above is now historical. Both are 6.5 today, so this changes the
	// SOURCE of the number, not the number itself -- trajectories do not move.
	const effectivePitchDeg = clampToRange(tuning.defaultPitchDeg.value, tuning.pitchMinDeg.value, tuning.pitchMaxDeg.value);
	physics.setGravity(effectivePitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);

	let ballIdCounter = 0;
	const nextBallId = (): number => ballIdCounter++;

	const switchTracker = createSwitchTracker(loaded.switchZones, tuning);
	// Story 2.1d (AD-6): this construction call is where "the machine carries
	// 4 balls, asserted at boot" is actually asserted -- createDeviceMechanics()
	// sums every parking device's declared `startsFullAtBoot` occupancy
	// (dragonwar.ts) and throws by name if the total is not 4. A reader
	// tracing why createMachine() failed to boot lands here.
	const deviceMechanics = createDeviceMechanics({
		physics,
		devices: loaded.devices,
		switchZones: loaded.switchZones,
		tuning,
		nextBallId,
	});
	const flipperMechanics = createFlipperMechanics({ physics, flippers: loaded.flippers, tuning });
	const plungerMechanics = createPlungerMechanics({ deviceMechanics, tuning });
	const cabinetMechanics = createCabinetMechanics({ physics, tuning });
	// Story 2.2 (AD-5): the pop bumper's own post-switch-edge participant --
	// see SWITCH_EDGE_HARDWARE_RULES above for why it is not a PRE_STEP one.
	const popMechanics = createPopMechanics({ switchZones: loaded.switchZones, popCentroidsMm: loaded.popCentroidsMm, tuning });
	// Story 1.9, AC 2: NOT a hardware rule -- runs AFTER physics.step(), a
	// collision-response modifier over what the step produced, never a
	// mover-commanding participant read from `frame` before it. See
	// test/hardware-rule-seam.test.ts's NOT_A_HARDWARE_RULE allowlist.
	const hopMechanics = createHopMechanics({ tuning });

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
		// Story 2.1b: the new hardware coils default enabled too, the same as
		// every existing one -- AD-5's own rule gates actuation by
		// enable/disable, default enabled, and this story authors only the
		// bodies and the coil names; slingshot/pop/bank-reset/Mouth actuation
		// is Story 2.2/2.3's.
		c_sling_l: true,
		c_sling_r: true,
		c_pop_1: true,
		c_pop_2: true,
		c_pop_3: true,
		c_dragon_bank_reset: true,
		c_mouth: true,
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

		// Story 2.2 (AD-5): mirrors this tick's coilEnabled state onto EACH
		// sling's own SlingshotSurfaceData -- held by reference inside the
		// KickReportingSlingshot instances loadCollision() built
		// (sim/physics/slings.ts), so a mutation here reaches the very next
		// contact with no re-load. Written every tick (not only on a
		// transition) and BEFORE physics.step() runs, so a same-tick
		// disable-then-contact is honoured with no rules round trip -- the
		// same DW-74 discipline the enabledPulses filter below already
		// applies to a pulsed coil.
		loaded.slingSurfaceData.c_sling_l.isDisabled = !coilEnabled.c_sling_l;
		loaded.slingSurfaceData.c_sling_r.isDisabled = !coilEnabled.c_sling_r;

		// AD-5: the hardware rules read `frame` and run BEFORE physics.step(),
		// so a button closing at tick *t* moves its coil in the SAME step --
		// never round-tripped through sim/rules (RulesStepResult.commands
		// stays readonly never[]).
		const flipperResult = flipperMechanics.applyFrame(tick, frame, { l: coilEnabled.c_flipper_l, r: coilEnabled.c_flipper_r });
		const plungerResult = plungerMechanics.applyFrame(tick, frame, coilEnabled.c_autolaunch);
		// Story 1.7: the cabinet hardware rule -- nudge impulse, oscillator,
		// tilt bob and slam detector, plus the table-frame ball coupling --
		// same seam, same "before physics.step()" reasoning (AD-5).
		const cabinetResult = cabinetMechanics.applyFrame(tick, frame);

		// DW-74: AD-5 says every coil is "gated only by CoilCommand enable |
		// disable" -- filtered here, AFTER every enable/disable in this tick has
		// already been written to coilEnabled above, so a same-tick
		// disable-then-pulse is swallowed regardless of the commands array's own
		// order. A no-op at the shipped defaults (every coil starts, and stays,
		// enabled unless something disables it).
		const enabledPulses = pulses.filter((pulse) => coilEnabled[pulse.coil]);
		const commandResult = deviceMechanics.applyCommands(tick, enabledPulses);

		const before = new Map<Ball, ReturnType<typeof fromPhysics>>();
		// Story 1.9, AC 2: the hop mechanism's own input -- each ball's velocity
		// immediately before physics.step() runs, captured alongside `before`
		// above for the same reason (a point-in-time snapshot this tick's own
		// step() call is about to move past). Physics-internal units (VU/T),
		// deliberately NOT converted through fromPhysics() -- hop.ts adds
		// directly to ball.hit.vel, so no round trip is needed.
		const beforeVel = new Map<Ball, { x: number; y: number; z: number }>();
		for (const ball of physics.balls) {
			before.set(ball, fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z }));
			beforeVel.set(ball, { x: ball.hit.vel.x, y: ball.hit.vel.y, z: ball.hit.vel.z });
		}

		physics.step();

		// Story 2.2, AD-1/AD-2: the sling's kick fires INSIDE physics.step()
		// itself (LineSegSlingshot.collide(), called by the solver at the
		// moment of contact) -- drained immediately after, since the solve
		// receives no `tick` argument of its own to stamp a ContactEvent
		// with. Order matters for AC 1's "same step" claim, not for
		// determinism: the kick already happened synchronously above: this
		// is bookkeeping, not physics.
		const slingContactEvents: ContactEventLike[] = loaded.drainSlingKicks().map((kick) => ({
			type: 'contact',
			kind: 'coil_fire',
			device: kick.coil,
			ballId: kick.ballId,
			surface: 'rubber_band',
			tick,
		}));

		// AC 2: runs immediately after physics.step() and before this tick's
		// switch/entry tests. Precisely what that buys (review finding, this
		// pass -- the previous wording overclaimed it): applyPostStep() mutates
		// ball.hit.vel.z ONLY. This tick's POSITIONS were already integrated by
		// physics.step() above, so the switch zones, the device-entry tests and
		// the published snapshot all still see the pre-hop position; a hop's
		// positional effect first appears on the NEXT tick's integration. What
		// the placement does guarantee is that the hop is inside the hashed
		// physics step -- never a presentation-side effect -- so every replay
		// and golden captures it.
		const hopSamples: HopBallVelocitySample[] = [];
		for (const ball of physics.balls) {
			const sampledBeforeVel = beforeVel.get(ball);
			if (sampledBeforeVel) {
				hopSamples.push({ ball, beforeVel: sampledBeforeVel });
			}
		}
		// flipperMechanics.state is read AFTER physics.step() so its
		// angularVelDegPerSec reflects THIS tick's own mover integration --
		// "was the bat actively swinging on the tick that produced this ball
		// movement", not last tick's value.
		const flipperState = flipperMechanics.state;
		hopMechanics.applyPostStep(tick, hopSamples, {
			l: flipperState.l.angularVelDegPerSec,
			r: flipperState.r.angularVelDegPerSec,
		});

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
		// Story 2.2 (AD-5): the pop's own placement -- immediately after the
		// switch tracker has produced this tick's edges, before the return.
		// The skirt edge this device reacts to does not exist until the line
		// above has run (see this file's header, "Pop -- immediately after
		// :296, before the return", and SWITCH_EDGE_HARDWARE_RULES above).
		const popResult = popMechanics.applyPostSwitchEdges(tick, switchEdges, movements, {
			c_pop_1: coilEnabled.c_pop_1,
			c_pop_2: coilEnabled.c_pop_2,
			c_pop_3: coilEnabled.c_pop_3,
		} satisfies Readonly<Record<PopCoilName, boolean>>);
		const entryResult = deviceMechanics.detectEntries(tick, movements);

		return {
			switchEvents: [...commandResult.switchEvents, ...plungerResult.switchEvents, ...cabinetResult.switchEvents, ...switchEdges, ...entryResult.switchEvents],
			// Story 2.2: two new sources join this deliberately hand-picked
			// order (this file's own header, ":301"). `slingContactEvents`
			// sits right after `plungerResult` -- chronologically, the sling's
			// kick fires during physics.step(), which runs immediately after
			// plungerResult/commandResult are computed and before
			// entryResult/popResult (both post-step). `popResult` sits LAST
			// in this array by deliberate placement, not by computation
			// order (code review finding, this pass -- the two are computed
			// in the opposite order: `popResult` above, then `entryResult`
			// immediately below, right before this return).
			contactEvents: [...flipperResult.contactEvents, ...commandResult.contactEvents, ...plungerResult.contactEvents, ...slingContactEvents, ...entryResult.contactEvents, ...popResult.contactEvents],
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
		get cabinet(): CabinetState {
			// `cabinetMechanics.state` already builds a fresh object per read
			// (its own getter, `cabinet/index.ts`) -- the same pass-through
			// reasoning as `mechanisms` above.
			return cabinetMechanics.state;
		},
		effectivePitchDeg,
	};
}
