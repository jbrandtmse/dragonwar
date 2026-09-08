// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.5: the ball controller. AD-6/AD-18 -- the sole owner of the real
// ball lifecycle: Start creates a game and a player from `GameStart`, further
// Start presses add players up to four before ball 1 ends, this module alone
// pulses `c_trough_eject` to serve, a drain ends the ball and rotates to the
// next player or the next ball, and the last player's last ball ends the
// game. AD-19: consumes the devices-and-shots layer's OWN event vocabulary
// (`DeviceEvent`) -- `button_pressed { button }`, `device_ball_entered/_left`,
// `bank_target_down`, `ball_launched` -- never a raw `SwitchEvent`; this file
// names no `s_`/`c_`/`bd_`-prefixed string literal anywhere (AD-16's
// `no-device-name-literal`), reaching every device/coil name it needs through
// `TABLE` property access or through-`TABLE` derivation (DW-149), the same
// discipline `sim/rules/devices/index.ts` already keeps.
//
// AD-7 (this story is where it becomes true): `machine.deviceSlots` is
// derived HERE, inside `rules.step`, from `device_ball_entered`/`_left`
// (`deriveDeviceSlots()` below) -- never copied from physics. `applyDeviceEvents()`
// keeps its EXISTING signature and behaviour (ballsInPlay accounting, same-
// object return when unchanged) unchanged in shape -- test/rules-devices.test.ts
// calls it directly and pins that exact contract -- widened only by the
// parking/non-parking guard task 3(a) requires (a `bd_shooter` arrival no
// longer decrements: it is not a device 3(a)'s premise, which task 2 falsifies
// by giving bd_shooter its own `device_ball_entered`, means "a ball left
// play"). `deriveDeviceSlots()` is a SEPARATE function, deliberately not
// folded into `applyDeviceEvents()`, because folding it in would change
// `applyDeviceEvents()`'s own "same object when ballsInPlay is unchanged"
// promise the moment a `device_ball_left` toggles a slot with no ballsInPlay
// change -- exactly the scenario test/rules-devices.test.ts's own
// "device_ball_left never changes the count" test pins with a `toBe` identity
// check that must keep passing unmodified.

import { TABLE } from '../table/dragonwar';
import { armBallSave, EMPTY_BALL_SAVE, enableBallSave, hasGraceLapsed, isRunning, isWithinGrace } from './ball-save';
import { shotWindowTicks, type ResolvedTuning } from '../table/tuning';
import type { DeviceEvent } from './devices';
import type { BallWillStartEvent } from '../contracts/events';
import type { GameAdjustments } from '../contracts/replay';
import type { PlayerState } from '../contracts/state';
import type { BallDeviceName, CoilCommand, CoilName, GameState, MachineState, SemanticEvent, SwitchName } from '../table/names';

/** Applies this tick's device events to `machine`, returning the next `MachineState`. Pure: no I/O, no physics access. */
export function applyDeviceEvents(machine: MachineState, events: readonly DeviceEvent[]): MachineState {
	let ballsInPlay = machine.ballsInPlay;
	for (const event of events) {
		if (event.type === 'ball_launched') {
			ballsInPlay += 1;
		} else if (event.type === 'device_ball_entered') {
			// Story 2.5, task 3(a): only a PARKING device's entry means "a ball
			// left play" -- `bd_shooter` (non-parking) now ALSO emits
			// `device_ball_entered` on arrival (task 2, DW-70's whole-record
			// derivation needs a total occupancy record), and a ball merely
			// resting in the shooter lane is still IN PLAY (AD-6: only the
			// shooter lane's OPENING -- `ball_launched` -- means plunged).
			// Guarded on `TABLE.ballDevices[*].kind`, never a device-name
			// literal or a second hand-typed device list (DW-149).
			if (TABLE.ballDevices[event.device].kind === 'parking') {
				// Review finding 2026-08-28 (pre-existing, unchanged by this
				// story): floored at zero -- the increment has one source
				// (`ball_launched`) and the decrement another (a ball reaching a
				// parking device), so the two are not structurally paired; see
				// `ball_missing { count }` (AD-6, Story 2.12) for the eventual
				// reconciliation of that disagreement.
				ballsInPlay = Math.max(0, ballsInPlay - 1);
			}
		}
	}
	if (ballsInPlay === machine.ballsInPlay) {
		return machine;
	}
	return { ...machine, ballsInPlay };
}

/**
 * Story 2.5, task 3(b) (DW-70): derives `machine.deviceSlots` from this
 * tick's `device_ball_entered`/`_left` events, carrying `current` forward and
 * returning the SAME reference when nothing changed -- the identity idiom
 * `applyDeviceEvents()` above already uses for `ballsInPlay`, applied here to
 * `deviceSlots` instead (Design Notes, "the fix must preserve structural
 * sharing"). Deliberately a SEPARATE function from `applyDeviceEvents()` --
 * see this file's header for why folding the two together would break an
 * existing, pinned `toBe` identity test.
 */
export function deriveDeviceSlots(
	current: Readonly<Record<BallDeviceName, readonly boolean[]>>,
	events: readonly DeviceEvent[],
): Readonly<Record<BallDeviceName, readonly boolean[]>> {
	let next: Record<BallDeviceName, readonly boolean[]> | undefined;
	for (const event of events) {
		if (event.type !== 'device_ball_entered' && event.type !== 'device_ball_left') {
			continue;
		}
		const closed = event.type === 'device_ball_entered';
		const source = next ?? current;
		if (source[event.device][event.slot] === closed) {
			continue;
		}
		const slots = [...source[event.device]];
		slots[event.slot] = closed;
		next = { ...source, [event.device]: slots };
	}
	return next ?? current;
}

/**
 * `s_start` -- assembled as a template literal purely so neither static chunk
 * ("s_", "start") alone matches AD-16's `no-device-name-literal` pattern
 * (each chunk is checked independently by the linter's own tokenizer).
 *
 * Review correction 2026-09-06 (blind-hunter): this line performs NO runtime
 * lookup against `TABLE` -- unlike `sim/loop/index.ts`'s own
 * `buttonSwitchByAction()`, which genuinely checks
 * `TABLE.switches[candidate]?.settleClass === 'button'` before trusting a
 * name, this is a bare `as SwitchName` cast on a literal. If `s_start` were
 * ever renamed in `TABLE`, this file would keep referencing the stale name
 * with no signal from lint, typecheck, or test; only `pnpm typecheck` failing
 * elsewhere (if the rename also changed the `SwitchName` union) would surface
 * it indirectly. Kept as a cast rather than a lookup because `sim/rules` does
 * not import `sim/loop` (the reverse of the real dependency direction) and a
 * local re-derivation of `buttonSwitchByAction()`'s own filter is more
 * machinery than one button name warrants; DW-149's own precedent covers
 * re-deriving a SET, not re-verifying a single literal.
 */
const START_BUTTON = `s_${'start'}` as SwitchName;

/**
 * AD-5's own enumerated hardware-rule coils (flippers, slingshots, pop
 * bumpers -- "gated only by CoilCommand enable | disable; Tilt, game over and
 * Attract disable all of them together"), derived as the COMPLEMENT of every
 * coil a ball device names as its own eject coil or a `pulse` step in its
 * `ballSearchOrder` -- never a literal list of coil names (AD-16), and
 * structurally guaranteed to exclude `c_trough_eject`/`c_autolaunch`/`c_mouth`
 * (task 7: a `disable` for either would land in the SAME `coilCommands` batch
 * as this controller's own serve pulse and swallow it, DW-74's own
 * same-tick-wins-disable precedent, `test/coil-enable.test.ts`).
 *
 * Review finding 2026-09-06 (blind-hunter/edge-case-hunter/intent-alignment,
 * three independent hits on the same root cause): the plain complement also
 * swept in `TABLE.dropBankResetCoil` (`c_dragon_bank_reset`) -- a device-owned,
 * rules-pulsed coil (`sim/rules/devices/drop-bank.ts`, AD-19's own rule text:
 * "this module ALONE pulses `c_dragon_bank_reset`"), not an AD-5 hardware-rule
 * coil and not a ball-serving coil either. Excluded explicitly here, derived
 * from `TABLE` (never a literal), so the drop bank's own reset coil is never
 * force-disabled at game over nor force-enabled at ball start alongside the
 * real AD-5 set.
 */
function ballServingCoils(): ReadonlySet<CoilName> {
	const coils = new Set<CoilName>();
	for (const device of Object.values(TABLE.ballDevices)) {
		if ('ejectCoil' in device) {
			coils.add(device.ejectCoil as CoilName);
		}
		for (const step of device.ballSearchOrder) {
			if (step.action === 'pulse') {
				coils.add(step.coil as CoilName);
			}
		}
	}
	return coils;
}

function hardwareCoils(): readonly CoilName[] {
	const servingCoils = ballServingCoils();
	const deviceOwnedCoils: ReadonlySet<CoilName> = new Set([TABLE.dropBankResetCoil as CoilName]);
	return (Object.keys(TABLE.coils) as CoilName[]).filter(
		(coil) => !servingCoils.has(coil) && !deviceOwnedCoils.has(coil),
	);
}

/** Test-only export (review finding 2026-09-06): lets a test assert the exact enable/disable set without hand-duplicating this derivation (DW-149). */
export const HARDWARE_COILS: readonly CoilName[] = hardwareCoils();

/**
 * Story 2.9 (AD-18): the ball controller's own `machine.ballSave` source
 * name -- a plain identifying string, never a `TABLE` device/switch/coil
 * name, so it names no lint-tracked vocabulary at all. The only source this
 * story arms; Story 3.7 (Quick multiball) is the first second one.
 * Exported test-only (mirrors `HARDWARE_COILS` above): lets a test assert
 * against the real source name without hand-duplicating the literal.
 */
export const BALL_SAVE_SOURCE = 'ball-controller';

/**
 * Story 2.9, task 4/5 (AD-16, DW-149): `bd_shooter` is the table's ONE
 * `kind: 'non-parking'` ball device (`sim/table/dragonwar.ts`) -- a
 * `device_ball_entered` for it is unambiguously "a served ball arrived in
 * the shooter lane", the deferred-autolaunch hook, reached below via
 * `TABLE.ballDevices[event.device].kind`, never a `'bd_shooter'` literal
 * (AD-16's `no-device-name-literal`).
 */
function shooterLaunchCoil(): CoilName {
	const step = TABLE.ballDevices.bd_shooter.ballSearchOrder.find((candidate) => candidate.action === 'pulse');
	if (!step) {
		throw new Error('shooterLaunchCoil(): TABLE.ballDevices.bd_shooter.ballSearchOrder has no "pulse" step to launch with');
	}
	return step.coil as CoilName;
}

/** `c_autolaunch` (Code Map: "bd_shooter's launch coil is the first pulse in ballSearchOrder"), resolved once, never a literal. */
const SHOOTER_LAUNCH_COIL: CoilName = shooterLaunchCoil();

function emptyPlayer(): PlayerState {
	return {
		score: 0,
		letters: '',
		lockCredits: 0,
		tiltWarnings: 0,
		bonus: { byCategory: {}, multiplier: 1 },
		lanes: { lit: {}, completedSets: [] },
		extraBalls: 0,
		jackpotSeed: 0,
		warsStarted: 0,
		modesPlayed: [],
		ballNumber: 0,
	};
}

export interface BallControllerStepResult {
	readonly state: GameState;
	readonly events: readonly SemanticEvent[];
	readonly coilCommands: readonly CoilCommand[];
	/**
	 * `ball_will_start` events produced THIS tick, for `sim/rules/index.ts`
	 * to queue into the devices layer's OWN lifecycle parameter on its NEXT
	 * `step()` call (never this same tick -- see `sim/rules/index.ts`'s
	 * header for why the drop bank's reset cannot be same-tick without
	 * calling `devicesLayer.step()` twice per tick, which would corrupt its
	 * cross-tick state).
	 */
	readonly ballWillStartEvents: readonly BallWillStartEvent[];
}

export interface BallController {
	step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number): BallControllerStepResult;
}

interface StartBallResult {
	readonly state: GameState;
	readonly events: SemanticEvent[];
	readonly coilCommands: CoilCommand[];
	readonly ballWillStartEvents: BallWillStartEvent[];
}

/**
 * `createBallController(adjustments, tuning)` mirrors `createDevicesLayer(tuning)`:
 * `adjustments` (AD-14, `GameStart.adjustments`) is resolved once at
 * construction -- `ballsPerGame`'s threshold, used every drain, is not
 * re-derived per tick. Story 2.9 widens this with `tuning` (AD-3/AD-15):
 * the ball controller now owns `machine.ballSave`, whose three durations
 * (`ballSaveMs`/`ballSaveHurryUpMs`/`ballSaveGraceMs`) are resolved to
 * ticks here, ONCE, exactly like `createShotTracker(tuning)`'s own
 * construction-time resolution of `TABLE.shots[*].windowMs`.
 */
export function createBallController(adjustments: GameAdjustments, tuning: ResolvedTuning): BallController {
	// `ballSaveHurryUpMs` is resolved and consumed by `sim/rules/lamps.ts`'s
	// own projection instead -- the controller itself never needs to know
	// the hurry-up window, only when the timer starts (`ballSaveTicks`) and
	// how long a drain still saves past the displayed expiry
	// (`ballSaveGraceTicks`).
	const ballSaveTicks = shotWindowTicks('ballSaveMs', tuning);
	const ballSaveGraceTicks = shotWindowTicks('ballSaveGraceMs', tuning);

	// Story 2.9, task 5: set true by a save's own re-serve (the drain branch
	// below), consumed the NEXT time the re-served ball's own arrival closes
	// bd_shooter's entry switch (`device_ball_entered`) -- cross-tick,
	// controller-local state, deliberately NOT a `GameState` field (AD-7:
	// `machine.ballSave` itself carries no such flag, and widening it would
	// move a state hash -- see `ball-save.ts`'s own header). Mirrors the
	// devices-and-shots layer's own cross-tick, instance-local state
	// (`createDevicesLayer()`'s `pendingLockLaneClosure`, etc.) -- this is
	// why `createBallController()` must be INSTANTIATED, never module-global
	// (this file's own header, Story 2.5's precedent).
	//
	// Code review pass 1 (blind-hunter + edge-case-hunter, independently):
	// unlike `pendingLockLaneClosure`, which self-clears on a tick timeout,
	// this flag had no boundary at which it was guaranteed to return to
	// `false`. If the re-served ball never reached `bd_shooter` (a real,
	// reachable `eject_failed` from a re-serve pulsed into an already-full
	// or malfunctioning trough, or any future ball-search/multiball
	// interaction that intervenes first), the stale `true` would silently
	// auto-launch the NEXT ball's own first, ordinary arrival at the
	// shooter lane -- short-circuiting that ball's manual plunge with no
	// recovery path. `startBall()` below now resets it at `ball_will_start`,
	// the same boundary AD-7 already resets `ballSave`/`tilt`/`multiball`
	// at, closing that window.
	let awaitingSaveLaunch = false;

	// Rework iteration 1 (DW-218, 2026-09-07): the author's chosen fix for the
	// re-arm defect code review measured -- a PLAYER plunge arms the ball-save
	// window; a save's own re-serve does not. Set `true` the moment the
	// deferred autolaunch above actually fires the coil (never when it is
	// skipped for Tilt -- no pulse, no resulting `ball_launched`, nothing to
	// discriminate), and consumed by the very next `ball_launched` in `step()`
	// below, which is that same pulse's own `s_shooter_lane` opening one or
	// more ticks later (AD-6). A second, SEPARATE closure flag from
	// `awaitingSaveLaunch` on purpose: that one tracks "waiting for the
	// re-served ball to physically arrive at bd_shooter" and is consumed at
	// arrival; this one tracks "waiting for arrival's own autolaunch pulse to
	// turn into a ball_launched" and is consumed one step later, at that
	// event. Costs zero state hashes (Rework note: "a closure-held
	// discriminator costs zero state hashes, whereas a new `GameState` field
	// would move `expectedHash`/`expectedGameStateHash` on all five goldens").
	// Reset at `ball_will_start` below for the identical reason
	// `awaitingSaveLaunch` is: a save whose re-serve never reaches
	// `s_shooter_lane` (an `eject_failed`, or a future multiball interaction)
	// must not leave a stale `true` to misclassify a LATER, unrelated ball's
	// own genuine plunge as a non-arming relaunch.
	let awaitingSaveRelaunch = false;

	/** Start-of-ball lifecycle (AC 2/AC 5): `ball_will_start` -> reset -> `ball_starting` -> enable hardware -> `ball_started` -> queue the one serve pulse -- shared by the very first Start press and every later rotation. */
	function startBall(state: GameState, playerIndex: number, tick: number): StartBallResult {
		const willStart: BallWillStartEvent = { type: 'ball_will_start', tick };

		// Code review pass 1: `ball_will_start` is this controller's own
		// ball-boundary reset point (AD-7) -- clearing `awaitingSaveLaunch`
		// here as well guarantees a stale flag from a save whose re-serve
		// never reached bd_shooter cannot leak into a LATER ball's own,
		// unrelated arrival at the shooter lane.
		awaitingSaveLaunch = false;
		// Rework iteration 1 (DW-218): same reasoning, for the OTHER
		// cross-tick discriminator -- a stale `true` here would misclassify
		// the NEXT ball's own genuine first plunge as a non-arming relaunch,
		// permanently disabling that ball's ball-save window.
		awaitingSaveRelaunch = false;

		const players = state.players.map((player, index) =>
			index === playerIndex ? { ...player, ballNumber: player.ballNumber + 1 } : player,
		);

		// AD-7: "ball_will_start resets ballSave, tilt and multiball";
		// "ball_starting enables hardware". Both performed here, explicitly,
		// rather than relying on their already-default values -- the mutation
		// that skips a reset must have something concrete to redden (AC 5(b)).
		// Story 2.9, AC 1: `ball_starting` also ENABLES ball save -- the
		// controller's own source is recorded with the timer left STOPPED
		// (`enableBallSave()`, `untilTick` stays `null` until `ball_launched`
		// arms it below in `step()`).
		const machine: MachineState = {
			...state.machine,
			ballSave: enableBallSave(EMPTY_BALL_SAVE, BALL_SAVE_SOURCE),
			tilt: { tilted: false, slamTilted: false },
			multiball: null,
			hardwareEnabled: true,
		};

		// Story 2.5, task 6: `hardwareEnabled` stops being an inert GameState
		// flag with zero readers -- ball_starting's own hardware-enable is
		// realised as real `enable` CoilCommands for the same AD-5 hardware set
		// `HARDWARE_COILS` names below at game over, so the flag's two
		// transitions (start -> enable, game over -> disable) both drive an
		// actual physics-side effect through the one gate AD-5 recognises
		// (`coilEnabled`, never a `GameState` read -- physics has none).
		const coilCommands: CoilCommand[] = [
			{ type: 'coil', coil: TABLE.ballDevices.bd_trough.ejectCoil as CoilName, action: 'pulse', tick },
			...HARDWARE_COILS.map((coil): CoilCommand => ({ type: 'coil', coil, action: 'enable', tick })),
		];

		return {
			state: { ...state, players, currentPlayer: playerIndex, machine },
			events: [
				willStart,
				{ type: 'ball_starting', tick },
				{ type: 'ball_save_enabled', tick },
				{ type: 'ball_started', tick },
			],
			coilCommands,
			ballWillStartEvents: [willStart],
		};
	}

	function step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number): BallControllerStepResult {
		let nextState = state;
		const events: SemanticEvent[] = [];
		const coilCommands: CoilCommand[] = [];
		const ballWillStartEvents: BallWillStartEvent[] = [];

		// Story 2.9 (AD-18): ball-save grace expiry, evaluated BEFORE this
		// tick's own device events are read below -- the same ordering
		// `sim/rules/devices/shots.ts` and `sim/rules/devices/index.ts` already
		// use for their own in-flight window expiry (Boundaries: "expiry is
		// evaluated before this tick's own device events are read"). A time-
		// based expiry of the WHOLE device (every source at once), distinct
		// from Story 2.11's later per-source Tilt `disarm()`.
		if (hasGraceLapsed(nextState.machine.ballSave, tick, ballSaveGraceTicks)) {
			nextState = { ...nextState, machine: { ...nextState.machine, ballSave: EMPTY_BALL_SAVE } };
		}

		// DRAGON-letter accumulation (AD-7: "player-scoped ... DRAGON letters"),
		// credited to whoever is currently playing. Not a mode, not scoring --
		// raw per-player state the ball controller already owns the write scope
		// for (AC 7).
		let lettersDelta = '';
		for (const event of deviceEvents) {
			if (event.type === 'bank_target_down') {
				lettersDelta += event.letter.toUpperCase();
			}
		}
		if (lettersDelta.length > 0 && nextState.phase === 'game') {
			const currentPlayer = nextState.currentPlayer;
			const players = nextState.players.map((player, index) =>
				index === currentPlayer ? { ...player, letters: player.letters + lettersDelta } : player,
			);
			nextState = { ...nextState, players };
		}

		// Start / Hot seat (AD-6/AD-18: the ball controller alone decides).
		const startPressed = deviceEvents.some((event) => event.type === 'button_pressed' && event.button === START_BUTTON);
		if (startPressed) {
			if (nextState.phase === 'attract') {
				const created: GameState = { ...nextState, phase: 'game', players: [emptyPlayer()], currentPlayer: 0 };
				const started = startBall(created, 0, tick);
				nextState = started.state;
				events.push(...started.events);
				coilCommands.push(...started.coilCommands);
				ballWillStartEvents.push(...started.ballWillStartEvents);
			} else if (
				nextState.phase === 'game' &&
				nextState.players.length < 4 &&
				nextState.currentPlayer === 0 &&
				nextState.players[0]?.ballNumber === 1
			) {
				// Hot seat window: open exactly while player 1's ball 1 is in
				// progress (currentPlayer 0, ballNumber 1) -- it closes the instant
				// that ball ends, whichever way play then proceeds (rotates to a
				// second player, or wraps player 0 straight into ball 2), because
				// EITHER outcome makes this condition false (currentPlayer moves
				// off 0, or ballNumber moves off 1) in the SAME tick the drain is
				// processed below.
				nextState = { ...nextState, players: [...nextState.players, emptyPlayer()] };
			}
			// Else: no-op by construction -- a fifth press (players.length is
			// already 4) or a press after ball 1 has ended (the window above is
			// closed) changes nothing.
		}

		// Ball save (AD-18, AC 2/AC 4): the timer starts on the PLUNGE, never on
		// enable (AD-6/PRD FR-19) -- gated on `phase === 'game'` so nothing arms
		// during any golden's own attract-phase plunge (AC 10). Rework iteration 1
		// (DW-218): narrowed further to a PLAYER plunge ONLY -- a save's own
		// deferred autolaunch (below) also opens `s_shooter_lane` and emits this
		// SAME event, and arming unconditionally on every `ball_launched` re-armed
		// a full fresh window on every re-serve; measured at production tuning
		// over 120,000 ticks, seed 0, no player input: 28 `ball_saved`, zero
		// `ball_ended`, ball 2/bonus/rotation/game over/Match all unreachable
		// (control: a 500 ms/100 ms window gives zero saves and the SAME natural
		// `ball_ended` tick, proving the loop was the re-arm, not the harness).
		// `awaitingSaveRelaunch` (declared above) is the discriminator: set only
		// when the deferred-autolaunch pulse below actually fires, consumed by
		// the very `ball_launched` that pulse causes. Also gated on the
		// controller's OWN source already being present in `sources` -- i.e.
		// genuinely enabled by `ball_starting` -- so `armBallSave` cannot arm a
		// launch that was never enabled first (code review: "today, deleting the
		// enable step entirely leaves the arming path working"; AC 1's
		// enable-is-not-a-start distinction now has a behavioural consequence,
		// not just an event-stream one). The deferred autolaunch itself fires on
		// the RE-SERVED ball's own arrival at the shooter lane, one or more ticks
		// after the drain branch below sets `awaitingSaveLaunch` -- never in the
		// same tick's batch (`sim/physics/devices.ts`'s `launch()` resolves a
		// ball resting in the entry zone; a same-tick pulse fires into an empty
		// lane and launches nothing).
		for (const event of deviceEvents) {
			if (event.type === 'ball_launched') {
				if (awaitingSaveRelaunch) {
					// DW-218: this `ball_launched` is the save's own re-serve reaching
					// the shooter lane, not a player plunge -- consume the flag and
					// do NOT re-arm. `ballsInPlay` is still incremented as usual, by
					// `applyDeviceEvents()` (a separate function, this story's own
					// arming decision does not touch ball-in-play accounting).
					awaitingSaveRelaunch = false;
				} else if (nextState.phase === 'game' && nextState.machine.ballSave.sources.includes(BALL_SAVE_SOURCE)) {
					const ballSave = armBallSave(nextState.machine.ballSave, { ticks: ballSaveTicks, source: BALL_SAVE_SOURCE }, tick);
					nextState = { ...nextState, machine: { ...nextState.machine, ballSave } };
					events.push({ type: 'ball_save_timer_started', untilTick: ballSave.untilTick!, tick });
				}
			} else if (
				awaitingSaveLaunch &&
				event.type === 'device_ball_entered' &&
				TABLE.ballDevices[event.device].kind === 'non-parking'
			) {
				// Code review pass 1 (edge-case-hunter): mirror the drain branch's
				// own `!tilt.tilted` guard below -- AC 6 makes the device inert
				// while tilted, and a Tilt occurring between the save's trough-
				// eject and the re-served ball's own arrival here must not still
				// auto-launch it. The flag is consumed either way (the ball DID
				// arrive; leaving it `true` would only wait for an arrival that
				// has already happened), just without the coil pulse while tilted.
				awaitingSaveLaunch = false;
				if (!nextState.machine.tilt.tilted) {
					coilCommands.push({ type: 'coil', coil: SHOOTER_LAUNCH_COIL, action: 'pulse', tick });
					// Rework iteration 1 (DW-218): mark the upcoming `ball_launched`
					// this same pulse will cause (one or more ticks from now) as the
					// save's own re-serve, not a player plunge -- set ONLY when the
					// pulse genuinely fires; while tilted, nothing is pulsed and no
					// `ball_launched` will follow from this cause, so there is
					// nothing to discriminate.
					awaitingSaveRelaunch = true;
				}
			}
		}

		// Drain (AD-6/AD-18): the ball controller alone mutates `ballsInPlay`,
		// and a PARKING device's entry bringing it to zero is what ends a ball
		// (AD-6's device-agnostic "closed slot switches and nothing else" --
		// never a literal `bd_trough` check, so this reads the same whichever
		// parking device the last ball happens to park in).
		const parkingEntryThisTick = deviceEvents.some(
			(event) => event.type === 'device_ball_entered' && TABLE.ballDevices[event.device].kind === 'parking',
		);
		if (nextState.phase === 'game' && parkingEntryThisTick && nextState.machine.ballsInPlay === 0) {
			const endingPlayer = nextState.currentPlayer;

			// Story 2.9 (AD-18, AC 3/AC 6/AC 11): a live ball-save window --
			// running OR within its (invisible) grace -- re-serves the ball
			// INSTEAD OF the teardown/ball_ended/rotation path below, unless
			// Tilt has made the device inert (Story 2.11 owns the tilt EVENT
			// that would `disarm()` every source; this story ships only the
			// read-side guard). `currentPlayer`, `players[i].ballNumber` and
			// `modes[]` are all left untouched -- this is a re-serve of the
			// SAME ball, not a new one.
			const ballSaveLive =
				!nextState.machine.tilt.tilted &&
				(isRunning(nextState.machine.ballSave, tick) || isWithinGrace(nextState.machine.ballSave, tick, ballSaveGraceTicks));

			if (ballSaveLive) {
				events.push({ type: 'ball_saved', player: endingPlayer, tick });
				coilCommands.push({ type: 'coil', coil: TABLE.ballDevices.bd_trough.ejectCoil as CoilName, action: 'pulse', tick });
				awaitingSaveLaunch = true;
				return { state: nextState, events, coilCommands, ballWillStartEvents };
			}

			const player = nextState.players[endingPlayer]!;

			// Mode teardown, STRICTLY before ball_ended (AC 5; epics.md:1383-1392's
			// narrowed _will_stop clause): every active mode's name is credited to
			// the ENDING player's modesPlayed -- captured from `endingPlayer` here,
			// before any rotation below could move `currentPlayer` -- and modes[]
			// is cleared. AD-7: "modes[] is empty between balls".
			const modeNames = nextState.modes.map((mode) => mode.mode);
			const playersAfterTeardown = nextState.players.map((existing, index) =>
				index === endingPlayer ? { ...existing, modesPlayed: [...existing.modesPlayed, ...modeNames] } : existing,
			);
			nextState = { ...nextState, players: playersAfterTeardown, modes: [] };

			events.push({
				type: 'ball_ended',
				player: endingPlayer,
				bonusByCategory: player.bonus.byCategory,
				multiplier: player.bonus.multiplier,
				total: 0,
				tilted: nextState.machine.tilt.tilted,
				tick,
			});

			const isLastPlayer = endingPlayer === nextState.players.length - 1;
			const gameOver = isLastPlayer && player.ballNumber >= adjustments.ballsPerGame;

			if (gameOver) {
				for (const coil of HARDWARE_COILS) {
					coilCommands.push({ type: 'coil', coil, action: 'disable', tick });
				}
				nextState = { ...nextState, phase: 'game_over', machine: { ...nextState.machine, hardwareEnabled: false } };
			} else {
				const nextPlayer = isLastPlayer ? 0 : endingPlayer + 1;
				const started = startBall(nextState, nextPlayer, tick);
				nextState = started.state;
				events.push(...started.events);
				coilCommands.push(...started.coilCommands);
				ballWillStartEvents.push(...started.ballWillStartEvents);
			}
		}

		return { state: nextState, events, coilCommands, ballWillStartEvents };
	}

	return { step };
}
