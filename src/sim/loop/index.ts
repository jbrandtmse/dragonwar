// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-4 -- the fixed-step conductor. `createLoop({ collisionDoc })` builds
// the cabinet machine (internally calling `loadCollision()` -- AD-16's
// "host never imports sim/physics or sim/rules" is why this factory exists
// at all) and the initial `GameState`. `advance(elapsedMs, transitions)`
// accumulates owed ticks through `msToTicksExact()`, carries the fractional
// remainder, caps at `MAX_OWED_TICKS` emitting `sim_time_discarded { ms }`
// as the frame's FIRST event, and per step: resolves the `InputFrame` in
// force at that tick, emits button-switch edges from consecutive frames,
// calls `machine.step(tick, frame, commandsFromPreviousTick)`, then
// `rules.step(state, switchEvents, tick)` -- every step, even with no
// events. Assembles the `Snapshot` and returns a `FrameOutput` carrying
// every event, contact event and command of all N steps in tick order, with
// empty arrays and the UNCHANGED previous snapshot when N = 0.
//
// This file never names `TICK_HZ` (AD-3): every tick-rate arithmetic site
// lives in `sim/contracts/time.ts`, imported directly (not through the
// barrel, which deliberately does not re-export it). The 200 ms owed-time
// cap is `MAX_OWED_TICKS`, already expressed in ticks there.
//
// `pulseCoil(coil)` is a DEV-ONLY escape hatch (Design Notes, "Why the dev
// pulse exists"): the story's own acceptance criteria drive `bd_trough`'s
// eject and the autolauncher from a "dev action" because `advance()`'s
// signature (fixed by AD-4) carries no room for one. It enqueues into
// EXACTLY the same next-tick command queue a rules-issued `CoilCommand`
// would use, so physics cannot tell the difference. Story 2.5 ("Start, hot
// seat and the ball lifecycle") replaces it with the real serve path.

import { createMachine } from '../physics/machine';
import { step as rulesStep } from '../rules';
import { msToTicksExact, ticksToMs, MAX_OWED_TICKS } from '../contracts/time';
import { resolveTuning } from '../table/tuning';
import { TABLE } from '../table/dragonwar';
import { fromPhysics, type Vec3 } from '../table/frames';
import type {
	BallDeviceName,
	CoilCommand,
	CoilName,
	FrameOutput,
	GameState,
	MachineState,
	SemanticEvent,
	Snapshot,
	SwitchEvent,
	SwitchName,
} from '../table/names';
import type { InputAction, InputFrame, InputTransition } from '../contracts/input';
import type { BallSnapshot, FlipperMechanismState, MechanismsSnapshot } from '../contracts/snapshot';

export interface Loop {
	/**
	 * Advances the simulation by `elapsedMs` of wall-clock time (the caller's
	 * own measurement -- `sim/` never reads a clock), applying `transitions`
	 * (tick-stamped) as their ticks are reached. Returns the accumulated
	 * `FrameOutput` for every physics+rules step this call ran (possibly
	 * zero).
	 */
	advance(elapsedMs: number, transitions: readonly InputTransition[]): FrameOutput;
	/** Dev-only: enqueues a coil pulse for the next tick, exactly as a rules-issued command. See this file's header. */
	pulseCoil(coil: CoilName): void;
}

/** Test-only export: a convenience "nothing held" frame for building `InputTransition`s in tests without repeating all eight `InputAction` keys. */
export const NO_FRAME: InputFrame = {
	flipper_l: false,
	flipper_r: false,
	plunger: false,
	nudge_l: false,
	nudge_r: false,
	nudge_up: false,
	start: false,
	menu: false,
};

/**
 * Every `InputAction` that has a corresponding button switch, derived from
 * `TABLE.switches` rather than a device-name literal: a button switch's
 * name is always `s_` + its action name (verified for all four -- `s_start`,
 * `s_flipper_l`, `s_flipper_r`, `s_plunger` -- against the real `TABLE`),
 * and the `'button'` settle class is unique to exactly that set, so
 * filtering by it (rather than trusting the naming convention alone) is the
 * TABLE-derived confirmation. `nudge_l`/`nudge_r`/`nudge_up`/`menu` have no
 * button switch in Epic 1 and are correctly excluded (no `s_nudge_l` etc.
 * exists in `TABLE.switches`).
 */
function buttonSwitchByAction(): ReadonlyMap<InputAction, SwitchName> {
	const map = new Map<InputAction, SwitchName>();
	// Review finding 2026-08-28: this was a hand-written literal list of the
	// eight InputAction members, so a NINTH action added to the union would
	// silently get no button switch and no compile error -- while this doc
	// comment claimed derivation. `NO_FRAME` has exactly the union's key set
	// (`InputFrame` requires every action to be present), so reading the keys
	// off it makes the claim true and a new action a one-line change there.
	const actions = Object.keys(NO_FRAME) as InputAction[];
	for (const action of actions) {
		const candidate = `s_${action}` as SwitchName;
		const known = (TABLE.switches as Record<string, { settleClass: string }>)[candidate];
		if (known && known.settleClass === 'button') {
			map.set(action, candidate);
		}
	}
	return map;
}

const BUTTON_SWITCH_BY_ACTION = buttonSwitchByAction();

/**
 * Test-only export: `FrameOutput` deliberately carries no `SwitchEvent`s
 * (they are internal to the loop, by design -- `sim/contracts/snapshot.ts`'s
 * own header), so button-switch edges have no other observable surface for
 * `test/loop.test.ts` to verify against. Never called from production code
 * outside this module.
 */
export function buttonSwitchEdges(previous: InputFrame, current: InputFrame, tick: number): SwitchEvent[] {
	const edges: SwitchEvent[] = [];
	for (const [action, switchName] of BUTTON_SWITCH_BY_ACTION) {
		if (previous[action] !== current[action]) {
			edges.push({ type: 'switch', switch: switchName, closed: current[action], tick });
		}
	}
	return edges;
}

/**
 * Test-only export: consumes every pending `InputTransition` whose tick has
 * been reached and returns the `InputFrame` in force at `tick` (AD-4: "the
 * loop applies the `InputFrame` in force at each tick"). `pending` is sorted
 * ascending by tick and is MUTATED -- consumed transitions are shifted off,
 * so a transition stamped beyond this frame's last tick stays queued and
 * applies on a later frame rather than being dropped.
 *
 * Extracted from `advance()` at review 2026-08-28 purely so the rule is
 * observable: `FrameOutput` carries no `SwitchEvent`s and `machine.step()`
 * ignores `frame` in this story, so the frame resolved for a given tick had
 * NO surface any test could see. All three of `test/loop.test.ts`'s
 * transition cases asserted only a tick count or a no-throw, and stayed green
 * with the transition queue deleted outright -- while Story 1.6 wires the
 * real key->action map into exactly this argument.
 */
export function frameInForceAt(pending: InputTransition[], tick: number, current: InputFrame): InputFrame {
	let frame = current;
	while (pending.length > 0 && pending[0].tick <= tick) {
		frame = pending.shift()!.frame;
	}
	return frame;
}

/**
 * Physics velocity (`Vertex3D`-shaped, VU per T) -> table mm/s -- the exact
 * inverse of `sim/physics/devices.ts`'s `tableSpeedToPhysicsVelocity()`,
 * mirrored here rather than shared: `fromPhysics()` is an affine map (linear
 * part + a translation by the playfield height on y); differencing two calls
 * one VU/T apart cancels the translation, leaving the linear part alone --
 * `(vx, -vy, vz) * MM_PER_VU` -- routed through `fromPhysics()` itself
 * (AD-10) rather than re-deriving the flip locally. `* 100` undoes the VP
 * time-unit convention (1 T = 10 ms), the same physics-internal scaling
 * `tableSpeedToPhysicsVelocity()` divides by.
 */
function physicsVelocityToTableMmPerS(vel: Vec3): Vec3 {
	const origin = fromPhysics({ x: 0, y: 0, z: 0 });
	const tip = fromPhysics(vel);
	return { x: (tip.x - origin.x) * 100, y: (tip.y - origin.y) * 100, z: (tip.z - origin.z) * 100 };
}

const NEUTRAL_FLIPPER: FlipperMechanismState = { angleDeg: 0, angularVelDegPerSec: 0 };

function initialMachineState(deviceSlots: Readonly<Record<BallDeviceName, readonly boolean[]>>): MachineState {
	return {
		ballsInPlay: 0,
		hardwareEnabled: true,
		ballSave: { untilTick: null, sources: [] },
		tilt: { tilted: false, slamTilted: false },
		multiball: null,
		highscores: [],
		deviceSlots,
	};
}

export interface CreateLoopOptions {
	/** An already-parsed `dragonwar.collision.json` document (`sim/` never parses a file -- AD-1). */
	readonly collisionDoc: unknown;
}

export function createLoop(options: CreateLoopOptions): Loop {
	const tuning = resolveTuning();
	const machine = createMachine(options.collisionDoc, tuning);

	let tick = 0;
	let owedRemainderTicks = 0;
	let currentFrame: InputFrame = NO_FRAME;
	let previousFrame: InputFrame = NO_FRAME;
	const pendingTransitions: InputTransition[] = [];
	let pendingPulses: CoilName[] = [];

	let state: GameState = {
		tick: 0,
		phase: 'attract',
		machine: initialMachineState(machine.deviceSlots),
		players: [],
		currentPlayer: 0,
		modes: [],
		rng: 0,
	};

	function buildSnapshot(): Snapshot {
		const balls: BallSnapshot[] = machine.balls.map((ball) => {
			const posMm = fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
			const velMmPerS = physicsVelocityToTableMmPerS({ x: ball.hit.vel.x, y: ball.hit.vel.y, z: ball.hit.vel.z });
			return {
				id: ball.id,
				pos: posMm,
				vel: velMmPerS,
				speed: Math.hypot(velMmPerS.x, velMmPerS.y, velMmPerS.z),
			};
		});

		const devices: Partial<Record<BallDeviceName, { slots: readonly boolean[] }>> = {};
		for (const name of Object.keys(TABLE.ballDevices) as BallDeviceName[]) {
			devices[name] = { slots: machine.deviceSlots[name] };
		}

		const mechanisms: MechanismsSnapshot<BallDeviceName> = {
			flippers: { l: NEUTRAL_FLIPPER, r: NEUTRAL_FLIPPER },
			plunger: { posMm: 0, holdTicks: 0 },
			dropTargets: {},
			spinner: {},
			devices: devices as Readonly<Record<BallDeviceName, { slots: readonly boolean[] }>>,
		};

		return {
			tick,
			balls,
			mechanisms,
			game: state,
			effectivePitchDeg: machine.effectivePitchDeg,
		};
	}

	let snapshot: Snapshot = buildSnapshot();

	function advance(elapsedMs: number, transitions: readonly InputTransition[]): FrameOutput {
		// Review finding 2026-08-28: without this guard, a non-finite
		// elapsedMs (NaN in particular) propagates into owedRemainderTicks and
		// stays there forever -- `NaN - Math.floor(NaN)` is still NaN, so every
		// FUTURE call's owedExact is poisoned too, and `0 < NaN`/`NaN > x` are
		// both false, so the step loop below silently runs zero steps every
		// frame from then on: a permanent, silent freeze with no thrown error.
		// The real caller (host/loop.ts) differences two performance.now()
		// timestamps, which is always finite in practice, but advance() is a
		// public sim/loop API surface and a future or test caller passing a
		// bad value should fail loudly here rather than freeze invisibly.
		// Review finding 2026-08-28: the guard originally rejected only a
		// NON-FINITE value, leaving a negative one to do the same class of
		// damage more quietly. `advance(-0.4, [])` gives owedExact = -0.4 and
		// `Math.floor(-0.4) = -1`, so owedTicks is -1: the `owedTicks === 0`
		// early return is SKIPPED (breaking AD-4's "N = 0 -> unchanged
		// snapshot", since the frame rebuilds and returns a new Snapshot
		// object), the step loop runs zero times anyway, and
		// owedRemainderTicks is credited +0.6 ticks of time that never
		// elapsed -- a phantom extra step on some later frame. Wall-clock time
		// does not run backwards, so the real caller cannot reach this; a test
		// or a future caller should fail loudly here rather than silently
		// desynchronise the accumulator.
		if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
			throw new Error(`advance(): elapsedMs must be a finite number >= 0, got ${elapsedMs}`);
		}

		pendingTransitions.push(...transitions);
		pendingTransitions.sort((a, b) => a.tick - b.tick);

		const owedExact = owedRemainderTicks + msToTicksExact(elapsedMs);
		let owedTicks = Math.floor(owedExact);
		owedRemainderTicks = owedExact - owedTicks;

		if (owedTicks === 0) {
			return { snapshot, events: [], contactEvents: [], commands: [] };
		}

		const events: SemanticEvent[] = [];
		const contactEvents: FrameOutput['contactEvents'][number][] = [];
		const commands: FrameOutput['commands'][number][] = [];

		if (owedTicks > MAX_OWED_TICKS) {
			// Review finding 2026-08-28: the carried fraction is thrown away
			// here too (the cap resets the accumulator outright), so it is part
			// of the discarded amount and belongs in the reported `ms` -- the
			// I/O matrix's own wording is "`ms` is the discarded amount".
			// Reporting only the whole-tick part under-reported by up to one
			// tick on every capped frame.
			const discardedTicks = owedTicks - MAX_OWED_TICKS + owedRemainderTicks;
			events.push({ type: 'sim_time_discarded', ms: ticksToMs(discardedTicks), tick: tick + 1 });
			owedTicks = MAX_OWED_TICKS;
			owedRemainderTicks = 0;
		}

		for (let i = 0; i < owedTicks; i++) {
			tick += 1;

			currentFrame = frameInForceAt(pendingTransitions, tick, currentFrame);
			const edges = buttonSwitchEdges(previousFrame, currentFrame, tick);
			previousFrame = currentFrame;

			const commandsForThisTick: CoilCommand[] = pendingPulses.map((coil) => ({
				type: 'coil',
				coil,
				action: 'pulse',
				tick,
			}));
			pendingPulses = [];

			const machineResult = machine.step(tick, currentFrame, commandsForThisTick);
			const switchEvents: SwitchEvent[] = [...edges, ...machineResult.switchEvents];

			const rulesResult = rulesStep(state, switchEvents, tick);
			state = {
				...rulesResult.state,
				machine: { ...rulesResult.state.machine, deviceSlots: machine.deviceSlots },
			};

			events.push(...machineResult.semanticEvents, ...rulesResult.events);
			contactEvents.push(...machineResult.contactEvents);
			commands.push(...rulesResult.commands);
		}

		snapshot = buildSnapshot();
		return { snapshot, events, contactEvents, commands };
	}

	function pulseCoil(coil: CoilName): void {
		pendingPulses.push(coil);
	}

	return { advance, pulseCoil };
}
