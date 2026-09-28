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
// `rules.step(state, switchEvents, tick, machineReport)` -- every step, even
// with no events. Story 2.12 (AD-4, amended): `machineReport` is the fourth,
// OPTIONAL argument this file now always supplies -- `{ recovered,
// failures }`, forwarded whole from `machine.step()`'s own return, and
// physics' own failures keep reaching `FrameOutput.events` exactly as
// before, never re-emitted by rules. A `RecoverCommand` rules issues (its
// own `coilCommands`-sibling channel, `recoverCommands`) lands in the SAME
// next-tick `pendingCommands` queue a coil command already does (AD-4: a
// command issued at tick N is consumed at N+1). Assembles the `Snapshot` and
// returns a `FrameOutput` carrying every event, contact event and command of
// all N steps in tick order, with empty arrays and the UNCHANGED previous
// snapshot when N = 0.
//
// This file never names `TICK_HZ` (AD-3): every tick-rate arithmetic site
// lives in `sim/contracts/time.ts`, imported directly (not through the
// barrel, which deliberately does not re-export it). The 200 ms owed-time
// cap is `MAX_OWED_TICKS`, already expressed in ticks there.
//
// `pulseCoil(coil)` is a DEV-ONLY escape hatch (Design Notes, "Why the dev
// pulse exists"): kept for general dev/test use (any coil, not only the
// trough) after Story 2.5, which replaces it as the PRODUCTION serve path --
// the ball controller (`sim/rules/ball-controller.ts`) is now the only thing
// that pulses `c_trough_eject` in real play (AD-18); this hatch enqueues into
// EXACTLY the same next-tick command queue a rules-issued `CoilCommand`
// would use, so physics cannot tell the difference.
//
// Story 2.5, task 5/6 (AD-14, AD-7, DW-70): `gameStart?: GameStart` seeds the
// initial `GameState` (`rng` from `gameStart.seed`, `machine.highscores` from
// `gameStart.highscores`) and its `adjustments` ride `createRules()`'s SECOND
// constructor argument -- never `step()`'s three-argument signature, which
// stays AD-4's pin. `initialMachineState()`'s `deviceSlots` is now seeded from
// `bootDeviceSlots()` (`sim/rules`, TABLE-derived) rather than the physics
// machine's own `deviceSlots` getter -- the boot seed is construction, not
// the DW-70 violation itself (Design Notes, "the boot seed is construction,
// not mutation"), but this removes even that one physics read, so
// `initialMachineState()` no longer needs a physics-shaped argument at all.
// `hardwareEnabled` now boots `false` (was hardcoded `true`): AD-7 says
// "ball_starting enables hardware", which is vacuous if the boot value is
// already `true` (Design Notes, "why hardwareEnabled must start false").
//
// DW-70's own live violation -- `state = { ...rulesResult.state, machine: {
// ...rulesResult.state.machine, deviceSlots: machine.deviceSlots } }`,
// overwriting `GameState.machine.deviceSlots` from the physics machine's own
// live view AFTER `rules.step()` returns -- is DELETED in this story:
// `state = rulesResult.state` is now the whole assignment. `deviceSlots` is
// derived entirely inside `rules.step()` (`sim/rules/index.ts`,
// `sim/rules/ball-controller.ts`'s `deriveDeviceSlots()`) from this tick's
// device events, never copied from physics. `buildSnapshot()` below is
// UNCHANGED -- it still reads `machine.deviceSlots` directly for the
// snapshot's own `mechanisms.devices` view, which is now the INDEPENDENT
// second derivation the AD-7 gate (`test/fixtures/dw70-ad7/`) cross-checks
// against.

import { createMachine } from '../physics/machine';
import { createRules, bootDeviceSlots, lampsOf } from '../rules';
import { msToTicksExact, ticksToMs, MAX_OWED_TICKS } from '../contracts/time';
import { resolveTuning, shotWindowTicks, type ResolvedTuning } from '../table/tuning';
import { TABLE } from '../table/dragonwar';
import { fromPhysics, type Vec3 } from '../table/frames';
import type {
	BallDeviceName,
	CoilName,
	FrameOutput,
	GameStart,
	GameState,
	LampName,
	LampState,
	MachineCommand,
	MachineReport,
	MachineState,
	SemanticEvent,
	Snapshot,
	SwitchEvent,
	SwitchName,
} from '../table/names';
import type { CoilAction } from '../contracts/commands';
import type { InputAction, InputFrame, InputTransition } from '../contracts/input';
import type { BallSnapshot, MechanismsSnapshot } from '../contracts/snapshot';

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
	/**
	 * Dev-only, same terms as `pulseCoil()` above: enqueues a `CoilCommand
	 * { action: 'enable' | 'disable' }` for the next tick -- Story 1.6's own
	 * lever for the flipper/plunger coil-gating acceptance criterion, until a
	 * later story (service menu, ball save, tilt) drives it from real rules.
	 */
	setCoilEnabled(coil: CoilName, enabled: boolean): void;
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

/**
 * Story 2.5, task 6: `deviceSlots` is now TABLE-derived (`bootDeviceSlots()`,
 * `sim/rules`), never a physics read -- `initialMachineState()` no longer
 * takes the physics machine's `deviceSlots` getter as an argument at all.
 * `hardwareEnabled` now boots `false` (was hardcoded `true`) -- see this
 * file's header. `highscores` is seeded from `gameStart?.highscores` (AD-14:
 * "highscores (read-only, from GameStart)"), defaulting to `[]` exactly as
 * before this story when no `GameStart` is supplied.
 */
function initialMachineState(gameStart: GameStart | undefined): MachineState {
	return {
		ballsInPlay: 0,
		hardwareEnabled: false,
		ballSave: { untilTick: null, sources: [] },
		tilt: { tilted: false, slamTilted: false },
		multiball: null,
		highscores: gameStart?.highscores ?? [],
		deviceSlots: bootDeviceSlots(),
	};
}

export interface CreateLoopOptions {
	/** An already-parsed `dragonwar.collision.json` document (`sim/` never parses a file -- AD-1). */
	readonly collisionDoc: unknown;
	/**
	 * Story 1.9's rebuild seam: an already-RESOLVED tuning set to build this
	 * machine from, instead of the live `TUNING` default. Omitted (the
	 * default), behaviour is byte-identical to before this story --
	 * `resolveTuning()` is called bare, exactly as it always was. Provided
	 * (e.g. `resolveTuning(overrideTuning)`, computed once by the caller), it
	 * is used AS-IS -- never re-run through `resolveTuning()` here, since a
	 * `ResolvedTuning` already carries its own derived `…Ticks` keys and
	 * `switchSettleTicksByClass`, and re-resolving it would collide with
	 * itself (`resolveTuning()`'s own DW-34 "…Ticks collision" guard). This is
	 * the one seam Story 1.9 hangs the dev tuning panel's hot-apply, AC 4's
	 * pitch, AC 3's elasticity falloff and AC 2's hop-control A/B on -- see
	 * `src/host/loop.ts`'s `reset()`.
	 */
	readonly tuning?: ResolvedTuning;
	/**
	 * Story 2.5, task 5 (AD-14): the one bundle a caller hands the sim at game
	 * start. Seeds the initial `GameState` (`rng` from `.seed`,
	 * `machine.highscores` from `.highscores`) and its `.adjustments` ride
	 * `createRules()`'s second constructor argument -- never `step()`'s
	 * three-argument signature (AD-4's pin). Omitted, behaviour is
	 * byte-identical to before this story: `rng: 0`, `highscores: []`, and
	 * `createRules()`'s own default adjustments (`ballsPerGame: 3`).
	 */
	readonly gameStart?: GameStart;
}

export function createLoop(options: CreateLoopOptions): Loop {
	const tuning = options.tuning ?? resolveTuning();
	const machine = createMachine(options.collisionDoc, tuning);
	// Story 2.4: one devices-and-shots layer instance for the life of this
	// loop (mirrors createMachine() above) -- it holds cross-tick state
	// (in-flight shot sequences, the bank's own latch, bd_lock's tracked
	// occupancy, the pending Lock-lane closure), so a module-level instance
	// would leak between two loops in one process (Story 2.3's own spinner
	// defect, repeated).
	// Story 2.5, task 5: `options.gameStart?.adjustments` rides this SECOND
	// constructor argument (AD-4: never step()'s call signature).
	const rules = createRules(tuning, options.gameStart?.adjustments);
	// Story 2.9: `l_ball_save`'s own hurry-up window, resolved ONCE here
	// (mirrors `tuning` itself) and threaded into every `lampsOf()` call
	// below -- `sim/rules/lamps.ts` never reaches for `TUNING`/`TICK_HZ`
	// itself (AD-3/AD-15).
	const ballSaveHurryUpTicks = shotWindowTicks('ballSaveHurryUpMs', tuning);

	let tick = 0;
	let owedRemainderTicks = 0;
	let currentFrame: InputFrame = NO_FRAME;
	let previousFrame: InputFrame = NO_FRAME;
	const pendingTransitions: InputTransition[] = [];
	// Generalised (Story 1.6) from `pendingPulses: CoilName[]` to carry
	// `enable`/`disable` alongside `pulse` -- both `pulseCoil()` and
	// `setCoilEnabled()` below queue into this ONE array, exactly the same
	// "commands land next tick" semantics either action already had. Story
	// 2.12 (AD-4, amended): widened again to also carry a bare recover marker
	// (`{ kind: 'recover' }`) -- `rulesResult.recoverCommands` (below) queues
	// into the SAME array, so a `RecoverCommand` rules issues at tick N is
	// consumed by physics at tick N+1, exactly like a coil command.
	type PendingCommand = { readonly kind: 'coil'; readonly coil: CoilName; readonly action: CoilAction } | { readonly kind: 'recover' };
	let pendingCommands: PendingCommand[] = [];

	let state: GameState = {
		tick: 0,
		phase: 'attract',
		machine: initialMachineState(options.gameStart),
		players: [],
		currentPlayer: 0,
		modes: [],
		// Story 2.5, task 5 (AD-14, AD-3): seeded from GameStart's own seed when
		// supplied -- rules randomness (Match, the skill-shot lane) draws from
		// this field. Omitted, `0` exactly as before this story.
		rng: options.gameStart?.seed ?? 0,
	};

	// Story 2.8 (AD-9): seeded from the BOOT state above, so the first tick's
	// projection diffs to nothing -- `lampsOf(bootState)` is all-off (`modes`
	// is empty), and this is what keeps `test/flipper-mover.test.ts:73,127`
	// (real attract frames, `commands` asserted `[]`) green: an
	// implementation that pushed the whole projection every step instead of
	// the diff would redden them immediately (Design Notes, "Why the attract
	// case is load-bearing"). Never reassigned via a binding spelled
	// `state` (lower-case) -- `test/ad7-device-slots.test.ts`'s source-text
	// ratchet counts exactly two `state =` assignments under `src/sim/loop/`.
	let previousLamps: LampState = lampsOf(state, ballSaveHurryUpTicks);

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

		// Story 2.3, task 10: the machine's real dropTargets/spinner state --
		// DELIBERATELY read straight from `machine.mechanisms`, never through
		// `GameState`. Story 2.5 removed the post-`rules.step()` `deviceSlots`
		// overwrite this comment used to warn about (DW-70), so the warning is
		// retired; the deliberate part SURVIVES and is now load-bearing for a
		// different reason. `devices` above reads the physics machine's own
		// `deviceSlots` getter directly, which makes `buildSnapshot()` the
		// INDEPENDENT second derivation the AD-7 gate
		// (`test/fixtures/dw70-ad7/`) cross-checks `GameState`'s rules-derived
		// slots against -- routing either through the other would collapse the
		// two views into one and make that gate vacuous.
		const mechanisms: MechanismsSnapshot<BallDeviceName> = {
			flippers: machine.mechanisms.flippers,
			plunger: machine.mechanisms.plunger,
			dropTargets: machine.mechanisms.dropTargets,
			spinner: machine.mechanisms.spinner,
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

			// Story 2.12 (AD-4, amended): a recover marker becomes a bare
			// `{ type: 'recover', tick }`, no `coil`/`action` -- distinct from
			// every `PendingCommand` a coil pulse/enable/disable builds.
			const commandsForThisTick: MachineCommand[] = pendingCommands.map((c): MachineCommand =>
				c.kind === 'recover' ? { type: 'recover', tick } : { type: 'coil', coil: c.coil, action: c.action, tick },
			);
			pendingCommands = [];

			const machineResult = machine.step(tick, currentFrame, commandsForThisTick);
			const switchEvents: SwitchEvent[] = [...edges, ...machineResult.switchEvents];

			// Story 2.12 (AD-4, amended): physics' own per-step report, forwarded
			// whole as rules.step()'s optional fourth argument -- `failures` keeps
			// reaching `events` below exactly as before (machineResult.semanticEvents),
			// never re-emitted by rules.
			const machineReport: MachineReport = { recovered: machineResult.recovered, failures: machineResult.semanticEvents };
			const rulesResult = rules.step(state, switchEvents, tick, machineReport);
			// DW-70 (AD-7): `machine.deviceSlots` is derived entirely INSIDE
			// rules.step() now (sim/rules/index.ts, ball-controller.ts's
			// deriveDeviceSlots()) -- no longer overwritten here from the
			// physics machine's own live view. This is the whole assignment.
			state = rulesResult.state;

			events.push(...machineResult.semanticEvents, ...rulesResult.events);
			contactEvents.push(...machineResult.contactEvents);
			commands.push(...rulesResult.commands);
			// Story 2.8 (AD-9, AC 1): the lamp DIFF, computed here -- never in
			// rules (`RulesStepResult.commands` stays `readonly never[]`).
			// `lampsOf(state, ballSaveHurryUpTicks)` is a pure, whole-projection
			// recompute every tick;
			// only a lamp whose `role` OR `step` changed since the previous
			// tick's projection gets a `LampCommand` this tick (the
			// `previousFrame`/`currentFrame` diff idiom above, mirrored).
			const currentLamps = lampsOf(state, ballSaveHurryUpTicks);
			for (const lampName of Object.keys(TABLE.lamps) as LampName[]) {
				const previous = previousLamps[lampName];
				const current = currentLamps[lampName];
				if (previous.role !== current.role || previous.step !== current.step) {
					commands.push({ type: 'lamp', lamp: lampName, role: current.role, step: current.step, tick });
				}
			}
			previousLamps = currentLamps;
			// Story 2.4: the rules -> physics coil channel. Queued into
			// pendingCommands exactly like a dev pulseCoil()/setCoilEnabled()
			// call, so a command rules issues at tick N is consumed by physics
			// at tick N+1 (AD-4) -- the tick field is reassigned fresh at
			// consumption time above, exactly as a dev-queued command's already is.
			for (const coilCommand of rulesResult.coilCommands) {
				pendingCommands.push({ kind: 'coil', coil: coilCommand.coil, action: coilCommand.action });
			}
			// Story 2.12 (AD-4): ball search's own final-stage command, queued
			// into the SAME next-tick channel, so a RecoverCommand rules issues
			// at tick N is consumed by physics at tick N+1. AD-7's Boundaries
			// clause bounds a pass to "exactly one RecoverCommand", so this is
			// never more than a single push in practice -- the loop still
			// forwards every entry, rather than assuming the count.
			for (let i = 0; i < rulesResult.recoverCommands.length; i++) {
				pendingCommands.push({ kind: 'recover' });
			}
		}

		snapshot = buildSnapshot();
		return { snapshot, events, contactEvents, commands };
	}

	function pulseCoil(coil: CoilName): void {
		pendingCommands.push({ kind: 'coil', coil, action: 'pulse' });
	}

	function setCoilEnabled(coil: CoilName, enabled: boolean): void {
		pendingCommands.push({ kind: 'coil', coil, action: enabled ? 'enable' : 'disable' });
	}

	return { advance, pulseCoil, setCoilEnabled };
}
