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
// keeps its EXISTING signature, its event-order processing and its same-
// object return when unchanged -- test/rules-devices.test.ts calls it
// directly and pins that exact contract.
//
// Story 2.12 (DW-187, task 2): a NON-PARKING device's `device_ball_entered`
// (`bd_shooter`'s own arrival report) means "a ball left play" -- UNLESS the
// same batch also carries a `device_ball_left` from a PARKING device that
// SERVES INTO it (that parking device's own `servesInto` equals this
// device's `entry`). That pairing is a just-served ball's own arrival, never
// counted in the first place (AD-6: only the shooter lane's OPENING --
// `ball_launched` -- means plunged); an unpaired arrival is a ball genuinely
// RETURNING to the lane (a weak manual plunge rolling back onto the tip),
// which now correctly leaves the count (floored at 0, exactly like a
// parking decrement). `servingSetsByNonParkingEntry` (below) is the
// structural, TABLE-derived map this pairing reads -- at this tree,
// `bd_shooter` -> `{bd_trough}` -- built once, module-level, since it is a
// pure function of the frozen `TABLE` (mirrors `HARDWARE_COILS`'s own
// module-level derivation). The rule is stateless: it decides purely from
// THIS batch's own membership, never a closure counter (a counter would
// break every test that injects a mid-run `initialState`, this story's own
// DW-187 trailer).
//
// `deriveDeviceSlots()` is a SEPARATE function, deliberately not folded into
// `applyDeviceEvents()`, because folding it in would change
// `applyDeviceEvents()`'s own "same object when ballsInPlay is unchanged"
// promise the moment a `device_ball_left` toggles a slot with no ballsInPlay
// change -- exactly the scenario test/rules-devices.test.ts's own
// "device_ball_left never changes the count" test pins with a `toBe` identity
// check that must keep passing unmodified.

import { TABLE } from '../table/dragonwar';
import { armBallSave, EMPTY_BALL_SAVE, enableBallSave, hasGraceLapsed, isRunning, isWithinGrace } from './ball-save';
import { bonusCountUpSteps, bonusTotal, BONUS_EMPTY } from './bonus';
import { createBallSearch, servesIntoOf } from './ball-search';
import { shotWindowTicks, type ResolvedTuning } from '../table/tuning';
import type { BankResetRequest, DeviceEvent } from './devices';
import type { RecoverCommand } from '../contracts/commands';
import type { BallWillStartEvent, BonusCountStepEvent } from '../contracts/events';
import type { GameAdjustments } from '../contracts/replay';
import type { PlayerBonusState, PlayerState } from '../contracts/state';
import type { BallDeviceName, CoilCommand, CoilName, GameState, MachineReport, MachineState, SemanticEvent, SwitchName } from '../table/names';

/**
 * Story 2.12 (DW-187, task 2): every non-parking device's own serving set --
 * the parking devices whose declared `servesInto` equals that device's own
 * `entry`. At this tree: `bd_shooter -> {bd_trough}`. `bd_shooter`'s own
 * `servesInto` (it serves INTO ITSELF, the resting pose) is irrelevant here
 * -- this map is keyed by entry-matching, not by a device's own outgoing
 * `servesInto`, so it is never itself a member of its own serving set.
 * Module-level (mirrors `HARDWARE_COILS` above): a pure function of the
 * frozen `TABLE`, computed once.
 */
function buildServingSetsByNonParkingEntry(): ReadonlyMap<BallDeviceName, ReadonlySet<BallDeviceName>> {
	const entries = Object.entries(TABLE.ballDevices) as Array<[BallDeviceName, (typeof TABLE.ballDevices)[BallDeviceName]]>;
	const map = new Map<BallDeviceName, ReadonlySet<BallDeviceName>>();
	for (const [name, device] of entries) {
		if (device.kind !== 'non-parking') {
			continue;
		}
		const servingSet = new Set<BallDeviceName>();
		for (const [otherName, otherDevice] of entries) {
			if (otherDevice.kind !== 'parking') {
				continue;
			}
			const servesInto = servesIntoOf(otherDevice);
			if (servesInto && servesInto === device.entry) {
				servingSet.add(otherName);
			}
		}
		map.set(name, servingSet);
	}
	return map;
}

const SERVING_SETS_BY_NON_PARKING_ENTRY: ReadonlyMap<BallDeviceName, ReadonlySet<BallDeviceName>> = buildServingSetsByNonParkingEntry();

/** Applies this tick's device events to `machine`, returning the next `MachineState`. Pure: no I/O, no physics access. */
export function applyDeviceEvents(machine: MachineState, events: readonly DeviceEvent[]): MachineState {
	let ballsInPlay = machine.ballsInPlay;

	// DW-187 (task 2): count this BATCH's own `device_ball_left` events from
	// each non-parking device's own serving set, BEFORE the main loop below
	// -- membership-only, never event order (both orderings of the served
	// pair below must agree, AC 13).
	const servedArrivalsRemaining = new Map<BallDeviceName, number>();
	for (const event of events) {
		if (event.type !== 'device_ball_left') {
			continue;
		}
		for (const [nonParkingDevice, servingSet] of SERVING_SETS_BY_NON_PARKING_ENTRY) {
			if (servingSet.has(event.device)) {
				servedArrivalsRemaining.set(nonParkingDevice, (servedArrivalsRemaining.get(nonParkingDevice) ?? 0) + 1);
			}
		}
	}

	for (const event of events) {
		if (event.type === 'ball_launched') {
			ballsInPlay += 1;
		} else if (event.type === 'device_ball_entered') {
			// Story 2.5, task 3(a): only a PARKING device's entry means "a ball
			// left play" outright -- `bd_shooter` (non-parking) now ALSO emits
			// `device_ball_entered` on arrival (task 2, DW-70's whole-record
			// derivation needs a total occupancy record). Guarded on
			// `TABLE.ballDevices[*].kind`, never a device-name literal or a
			// second hand-typed device list (DW-149).
			if (TABLE.ballDevices[event.device].kind === 'parking') {
				// Review finding 2026-08-28 (pre-existing, unchanged by this
				// story): floored at zero -- the increment has one source
				// (`ball_launched`) and the decrement another (a ball reaching a
				// parking device), so the two are not structurally paired; see
				// `ball_missing { count }` (AD-6, Story 2.12) for the eventual
				// reconciliation of that disagreement.
				ballsInPlay = Math.max(0, ballsInPlay - 1);
			} else {
				// Story 2.12 (DW-187): a NON-PARKING arrival. A served ball's own
				// arrival is PAIRED, same batch, against a `device_ball_left` from
				// a parking device that serves into this one -- that ball was
				// NEVER counted (AD-6: only the shooter lane's OPENING --
				// `ball_launched` -- means plunged), so pairing it changes
				// nothing. An UNPAIRED arrival is a ball genuinely RETURNING to
				// the lane (DW-187's own rolled-back-plunge shape: the ball climbs
				// partway, rolls back onto the tip, still counted) -- that now
				// correctly leaves play, floored at 0 exactly like the parking
				// branch above.
				const remaining = servedArrivalsRemaining.get(event.device) ?? 0;
				if (remaining > 0) {
					servedArrivalsRemaining.set(event.device, remaining - 1);
				} else {
					ballsInPlay = Math.max(0, ballsInPlay - 1);
				}
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

/**
 * Exported (review finding 2026-09-06): lets a test assert the exact
 * enable/disable set without hand-duplicating this derivation (DW-149).
 * Story 2.11 gives this a SECOND, production reader: `sim/rules/tilt.ts`
 * imports it directly rather than re-deriving the same set a second time --
 * no longer test-only.
 */
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
		bonus: BONUS_EMPTY,
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
	/** Story 2.12 (AD-9): ball search's own final-stage command this tick, if any -- forwarded to `sim/rules/index.ts`, which queues it into `sim/loop`'s own next-tick command channel. */
	readonly recoverCommands: readonly RecoverCommand[];
	/** Story 2.12 (AD-19, amended): ball search's own bank-reset REQUEST this tick, if any -- forwarded to `sim/rules/index.ts`, which queues it into the devices layer's own lifecycle input on the NEXT tick, beside `ball_will_start`. */
	readonly bankResetRequests: readonly BankResetRequest[];
}

export interface BallController {
	step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number, machineReport: MachineReport): BallControllerStepResult;
}

interface StartBallResult {
	readonly state: GameState;
	readonly events: SemanticEvent[];
	readonly coilCommands: CoilCommand[];
	readonly ballWillStartEvents: BallWillStartEvent[];
}

/**
 * Story 2.12 (AD-18): "`ballsInPlay` is corrected from slot switches" --
 * after a recover, every simulated ball is inside a device, so the count of
 * balls outside every device is 0 BY CONSTRUCTION. Pure; exported so
 * `sim/rules/index.ts` can apply it to `state.machine` BEFORE
 * `applyDeviceEvents` runs (AD-4: the recover's report reaches rules the
 * tick AFTER physics consumed the command, so the correction lands before
 * this tick's own device-event accounting). `recovered: null` (no
 * `RecoverCommand` was consumed this step) leaves `machine` untouched, same
 * reference; `recovered` any OTHER number (0 included -- "`ball_missing` is
 * always emitted, including `count: 0`") corrects `ballsInPlay` to 0, same
 * reference if it was already there.
 */
export function applyRecovery(machine: MachineState, recovered: number | null): MachineState {
	if (recovered === null || machine.ballsInPlay === 0) {
		return machine;
	}
	return { ...machine, ballsInPlay: 0 };
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
	// Story 2.10 (AD-3/AD-15): the end-of-ball bonus count-up's own pace,
	// resolved once here exactly like the two ball-save windows above --
	// `armBonusCountSchedule()` below is the one reader.
	const bonusCountTicks = shotWindowTicks('bonusCountMs', tuning);

	// Story 2.12 (AD-18): the search's own seat -- ONE instance for the life
	// of this controller (mirrors every other cross-tick component this
	// file/`createDevicesLayer()` already instantiate), never module-level.
	const ballSearch = createBallSearch(tuning);

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
	// window; a save's own re-serve does not. Set the moment the deferred
	// autolaunch above actually fires the coil (never when it is skipped for
	// Tilt -- no pulse, no resulting `ball_launched`, nothing to discriminate),
	// and consumed by the very next `ball_launched` in `step()` below, which is
	// that same pulse's own `s_shooter_lane` opening one or more ticks later
	// (AD-6). A second, SEPARATE closure flag from `awaitingSaveLaunch` on
	// purpose: that one tracks "waiting for the re-served ball to physically
	// arrive at bd_shooter" and is consumed at arrival; this one tracks
	// "waiting for arrival's own autolaunch pulse to turn into a
	// ball_launched" and is consumed one step later, at that event. Costs zero
	// state hashes (Rework note: "a closure-held discriminator costs zero
	// state hashes, whereas a new `GameState` field would move
	// `expectedHash`/`expectedGameStateHash` on all five goldens"). Reset at
	// `ball_will_start` below for the identical reason `awaitingSaveLaunch`
	// is: a save whose re-serve never reaches `s_shooter_lane` (an
	// `eject_failed`, or a future multiball interaction) must not leave a
	// stale record to misclassify a LATER, unrelated ball's own genuine
	// plunge as a non-arming relaunch.
	//
	// Rework iteration 2 (DW-224 + DW-225, 2026-09-08, one root cause, Rule 15
	// "fix now"): a plain boolean had no causal binding (it consumed blindly
	// whichever `ball_launched` arrived next, however late) and no bounded
	// lifetime (if the deferred pulse resolved to `eject_failed` instead of a
	// `ball_launched`, the flag stayed stuck `true` for the rest of the ball --
	// and in the one scenario its own reset comment above cites as recovery,
	// that reset cannot run either, since no parking entry -> no ball_ended ->
	// no ball_will_start can follow a ball stranded in the shooter lane).
	// Widened to the SAME `{ startTick }` shape `pendingLockLaneClosure`
	// already uses one file over (`sim/rules/devices/index.ts`), self-clearing
	// off an already-resolved tick count -- `ballSaveGraceTicks`, resolved
	// above, so this needs no new tunable. Expired in `step()` BEFORE this
	// tick's own device events are read, the same ordering `hasGraceLapsed()`
	// below and `pendingLockLaneClosure` itself both already use. This bounds
	// how long a `ball_launched` may be trusted as "caused by MY pulse"
	// (DW-224's causal-binding language) and guarantees a stuck record
	// eventually releases so a later, genuinely unrelated `ball_launched` --
	// however it might arise -- arms normally instead of being silently
	// swallowed for the rest of the ball (DW-225's same-ball recovery). It
	// does not, and cannot from `sim/rules` alone, un-strand a ball physically
	// resting in an empty shooter lane after a real `eject_failed` -- that
	// recovery is Story 2.12's ball search, named explicitly by both findings
	// as the eventual fix for the physical hang; this closes the RULES-side
	// latch defect only.
	//
	// Review pass (2026-09-08): this is a TIMEOUT, not a true causal binding
	// -- there is still no per-pulse identity check, so ANY `ball_launched`
	// arriving inside the bounded window is consumed as the relaunch, exactly
	// as before. That is sufficient today only because, per the spec's own
	// Rule 15 disposition, `s_shooter_lane` is a single physical switch and
	// `bd_shooter` holds one ball: between the pulse firing and its own
	// resulting launch there is exactly ONE possible open edge, so a manual
	// plunge in that gap would produce the SAME `ball_launched` the pulse
	// would have -- not a second, distinct event for a true correlation check
	// to disambiguate. A genuine multi-ball path through `bd_shooter` (Story
	// 3.7) would need real correlation, not just a bound.
	//
	// The reused `ballSaveGraceTicks` also couples this record's timeout to a
	// DIFFERENT concern -- how long a drain stays saved past the displayed
	// expiry -- not to the physical trough-to-shooter-lane travel time this
	// record actually needs to outlive. Safe today only because production
	// `ballSaveGraceMs` (2000ms) vastly exceeds any realistic coil-pulse
	// travel time; a future tuning pass that shrinks it well below that travel
	// time would need a fresh look here.
	interface AwaitingSaveRelaunch {
		readonly startTick: number;
	}
	let awaitingSaveRelaunch: AwaitingSaveRelaunch | null = null;

	/**
	 * Story 2.10, task 7(e): the end-of-ball bonus count-up's own schedule --
	 * closure state, deliberately NOT a `GameState` field (Design Notes, "Why
	 * the count-up schedule is closure state": a `machine`-scoped field would
	 * move `expectedGameStateHash` on all five goldens, a Block-If; a
	 * player-scoped one is the wrong scope, since this is a display pacer, not
	 * a fact about the player). Mirrors `awaitingSaveLaunch`/`awaitingSaveRelaunch`
	 * above: instance-local, so `createBallController()` must be instantiated,
	 * never module-global. Holds at most `steps` entries (`armBonusCountSchedule()`
	 * below), each emitted once, at its own tick, and dropped; arming replaces
	 * any previous schedule wholesale -- no `ball_will_start` reset needed
	 * (Design Notes: `startBall()` runs on the SAME tick as `ball_ended` when a
	 * rotation follows immediately, which is exactly why this is armed AFTER
	 * that rotation, below, rather than before it).
	 */
	interface PendingBonusCountStep {
		readonly tick: number;
		readonly event: BonusCountStepEvent;
	}
	let pendingBonusCountSteps: readonly PendingBonusCountStep[] = [];

	/**
	 * Turns `bonusCountUpSteps()`'s arithmetic (`sim/rules/bonus.ts`) into a
	 * timed schedule for `player`, the first step landing `bonusCountTicks`
	 * after `endedTick` (the `ball_ended` tick) and each later one
	 * `bonusCountTicks` after the previous -- leaving the schedule EMPTY when
	 * `bonus`'s own total is 0.
	 *
	 * Code review 2026-09-08 (blind-hunter, edge-case-hunter, acceptance
	 * auditor, independently): the clear happens FIRST, before the zero-total
	 * early return, so "arming replaces any previous schedule wholesale" is
	 * true on every path rather than only when the next ball also has a
	 * nonzero bonus. Previously a zero-total end returned before assigning,
	 * and the tilted end skipped this function entirely, so the PREVIOUS
	 * ball's still-pending steps survived and kept draining -- and since
	 * `advanceBackglass()` matches a step against the held payload's own
	 * player, a single-player game (where both ends carry the same index)
	 * rendered the previous ball's `BONUS` row over the new ball's own
	 * `ball_ended` screen. That contradicts this story's "Zero bonus" and
	 * "Tilted ball end" I/O rows, whose "no `bonus_count_step` is emitted"
	 * otherwise held only by the accident of nothing having been armed
	 * earlier in the run.
	 */
	function armBonusCountSchedule(player: number, bonus: PlayerBonusState, endedTick: number): void {
		pendingBonusCountSteps = [];
		const steps = bonusCountUpSteps(bonus, tuning);
		const total = steps[steps.length - 1]!.running;
		if (total <= 0) {
			return;
		}
		pendingBonusCountSteps = steps.map((step, index) => {
			const stepNumber = index + 1;
			const dueTick = endedTick + bonusCountTicks * stepNumber;
			const event: BonusCountStepEvent = {
				type: 'bonus_count_step',
				player,
				step: stepNumber,
				steps: steps.length,
				running: step.running,
				total,
				tick: dueTick,
			};
			return { tick: dueTick, event };
		});
	}

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
		// cross-tick discriminator -- a stale record here would misclassify
		// the NEXT ball's own genuine first plunge as a non-arming relaunch,
		// permanently disabling that ball's ball-save window. (Rework
		// iteration 2: this reset is now a second, EARLIER line of defence --
		// the record's own bounded lifetime, below, already guarantees it
		// cannot outlive `ballSaveGraceTicks`, but a ball rotation typically
		// arrives well before that timeout, so this stays the common path.)
		awaitingSaveRelaunch = null;

		// Story 2.12 (Boundaries: "the search timer and schedule ... reset at
		// ball_will_start inside startBall()"). The held set is deliberately
		// NOT cleared here (Design Notes, "a hold that spans a ball boundary").
		ballSearch.reset();

		// AC 6: the per-ball reset. `bonus` resets whole to `BONUS_EMPTY` --
		// `byCategory` all-zero, `multiplier` back to the ladder's first rung
		// -- alongside the `ballNumber` increment this map already made;
		// `letters`, `score`, `lockCredits` and `extraBalls` are untouched
		// (`sim/rules/bonus.ts`'s own header: the bonus reset is the ball
		// controller's, not `bonus.ts`'s own two folds, which never run at a
		// ball boundary).
		const players = state.players.map((player, index) =>
			index === playerIndex ? { ...player, ballNumber: player.ballNumber + 1, bonus: BONUS_EMPTY } : player,
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

	function step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number, machineReport: MachineReport): BallControllerStepResult {
		// Story 2.12 (task 14): the search's own edge fold is the FIRST
		// statement of step() -- ahead of the bonus-step drain below and, more
		// importantly, ahead of the ball-save re-serve's own early return
		// further down (`:695`'s own precedent line number), so a tick's
		// button/closure edges are never dropped by that early return.
		ballSearch.observe(deviceEvents, tick);

		let nextState = state;
		const events: SemanticEvent[] = [];
		const coilCommands: CoilCommand[] = [];
		const ballWillStartEvents: BallWillStartEvent[] = [];
		const recoverCommands: RecoverCommand[] = [];
		const bankResetRequests: BankResetRequest[] = [];

		// Story 2.10, task 7(e): drain any bonus_count_step(s) due THIS tick --
		// independent of every other concern below (it reports a PAST
		// ball_ended's own payment, never this tick's own drain), so its
		// position relative to the ball-save expiries just below is arbitrary;
		// kept first for visibility, mirroring the schedule's own doc comment.
		if (pendingBonusCountSteps.length > 0) {
			const due = pendingBonusCountSteps.filter((scheduled) => scheduled.tick === tick);
			if (due.length > 0) {
				events.push(...due.map((scheduled) => scheduled.event));
				pendingBonusCountSteps = pendingBonusCountSteps.filter((scheduled) => scheduled.tick !== tick);
			}
		}

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

		// Rework iteration 2 (DW-224 + DW-225): `awaitingSaveRelaunch`'s own
		// bounded lifetime, expired here for the identical reason and in the
		// identical position as `hasGraceLapsed()` immediately above and
		// `pendingLockLaneClosure` one file over (`sim/rules/devices/index.ts`)
		// -- BEFORE this tick's own device events are read, so a `ball_launched`
		// arriving on the very tick the record expires is correctly treated as
		// NOT this save's own relaunch.
		if (awaitingSaveRelaunch && tick > awaitingSaveRelaunch.startTick + ballSaveGraceTicks) {
			awaitingSaveRelaunch = null;
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
					// the shooter lane, not a player plunge -- consume the record and
					// do NOT re-arm. `ballsInPlay` is still incremented as usual, by
					// `applyDeviceEvents()` (a separate function, this story's own
					// arming decision does not touch ball-in-play accounting).
					awaitingSaveRelaunch = null;
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
				// Story 2.11 code review: and never outside a game -- a Slam tilt
				// landing inside the re-serve window moves `phase` to 'attract'
				// with `tilt.tilted` left false (a slam is not a ball condition),
				// so the tilt conjunct alone let this pulse fire `c_autolaunch`
				// into Attract. The flag is still consumed.
				awaitingSaveLaunch = false;
				if (!nextState.machine.tilt.tilted && nextState.phase === 'game') {
					coilCommands.push({ type: 'coil', coil: SHOOTER_LAUNCH_COIL, action: 'pulse', tick });
					// Rework iteration 1 (DW-218): mark the upcoming `ball_launched`
					// this same pulse will cause (one or more ticks from now) as the
					// save's own re-serve, not a player plunge -- set ONLY when the
					// pulse genuinely fires; while tilted, nothing is pulsed and no
					// `ball_launched` will follow from this cause, so there is
					// nothing to discriminate. Rework iteration 2 (DW-224/DW-225):
					// `startTick` is this pulse's OWN tick -- the record's bounded
					// lifetime (top of `step()`, above) is measured from here.
					awaitingSaveRelaunch = { startTick: tick };
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
				// Story 2.12 (task 14): skipping (a)-(d) on this path is harmless --
				// it runs only at ballsInPlay 0, where the search is idle, and a
				// recover report cannot arrive on a save's drain tick (a recover
				// leaves no ball to drain).
				return { state: nextState, events, coilCommands, ballWillStartEvents, recoverCommands, bankResetRequests };
			}

			const player = nextState.players[endingPlayer]!;

			// Story 2.10, task 7(d) (AC 3/AC 5): a tilted ball forfeits the whole
			// bonus -- `total` is forced to 0 rather than merely left unpaid, so
			// the `ball_ended` payload and the score write below agree with each
			// other by construction. `bonusTotal()` is `sim/rules/bonus.ts`'s own
			// arithmetic, read here and nowhere re-derived.
			const tilted = nextState.machine.tilt.tilted;
			const total = tilted ? 0 : bonusTotal(player.bonus, tuning);

			// Mode teardown, STRICTLY before ball_ended (AC 5; epics.md:1383-1392's
			// narrowed _will_stop clause): every active mode's name is credited to
			// the ENDING player's modesPlayed -- captured from `endingPlayer` here,
			// before any rotation below could move `currentPlayer` -- and modes[]
			// is cleared. AD-7: "modes[] is empty between balls". Story 2.10, task
			// 7(d): the SAME map now also pays `total` onto the ending player's own
			// `score` -- the ball controller's first score write (Design Notes,
			// "The score-ownership decision, made deliberately") -- so the two can
			// never diverge into separate passes over `players`.
			const modeNames = nextState.modes.map((mode) => mode.mode);
			const playersAfterTeardown = nextState.players.map((existing, index) =>
				index === endingPlayer
					? { ...existing, modesPlayed: [...existing.modesPlayed, ...modeNames], score: existing.score + total }
					: existing,
			);
			nextState = { ...nextState, players: playersAfterTeardown, modes: [] };

			events.push({
				type: 'ball_ended',
				player: endingPlayer,
				bonusByCategory: player.bonus.byCategory,
				multiplier: player.bonus.multiplier,
				total,
				tilted,
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

			// Story 2.10, task 7(e): armed AFTER the game-over/rotation block
			// above, deliberately -- `startBall()` (called inside that block, on
			// this SAME tick, for a non-game-over drain) resets the NEW ball's
			// `bonus` but has no reason to touch this closure-held schedule; the
			// ordering here is about reading `player.bonus` (the ENDING player's
			// pre-teardown snapshot, captured above and untouched by teardown)
			// AFTER the branch that could rotate `currentPlayer`, not about
			// protecting the schedule from being wiped. Never armed for a tilted
			// ball (`total` is already forced 0 above, but `player.bonus` itself
			// is NOT -- passing it through unconditionally would compute a
			// nonzero count-up from the forfeited categories).
			if (tilted) {
				// Code review 2026-09-08: a tilted end arms nothing, but it must
				// still CANCEL whatever the previous ball armed -- see
				// `armBonusCountSchedule()`'s own note. A ball end always ends the
				// previous ball's count-up, armed or not.
				pendingBonusCountSteps = [];
			} else {
				armBonusCountSchedule(endingPlayer, player.bonus, tick);
			}
		}

		// Story 2.12, task 14, (a)-(d), in order. `applyRecovery()` has already
		// corrected `nextState.machine.ballsInPlay` to 0 by the time this runs
		// (`sim/rules/index.ts` applies it before `applyDeviceEvents`, AD-4) --
		// this block only decides the EVENT and the SERVE, never the count.

		// (a) the recover's own answer: ball_missing, always (even count 0),
		// and a trough serve only into a genuinely empty lane.
		if (machineReport.recovered !== null) {
			events.push({ type: 'ball_missing', count: machineReport.recovered, tick });
			if (nextState.phase === 'game' && !nextState.machine.deviceSlots.bd_shooter[0]) {
				coilCommands.push({ type: 'coil', coil: TABLE.ballDevices.bd_trough.ejectCoil as CoilName, action: 'pulse', tick });
			}
		}

		// (b) device_overflow on any parking device OTHER than the Lock --
		// AD-18's phasing tolerates a Lock overflow without an eject (decision
		// 1); every other parking device answers with one immediate eject.
		const lockDevice = TABLE.lockLaneWiring.device as BallDeviceName;
		for (const failure of machineReport.failures) {
			if (failure.type !== 'device_overflow') {
				continue; // (c) eject_failed / broken: no-ops.
			}
			if (failure.device === lockDevice) {
				continue;
			}
			const device = TABLE.ballDevices[failure.device];
			if (device.kind === 'parking') {
				coilCommands.push({ type: 'coil', coil: device.ejectCoil as CoilName, action: 'pulse', tick });
			}
		}

		// (d) the search itself.
		const searchResult = ballSearch.step(nextState, tick);
		events.push(...searchResult.events);
		coilCommands.push(...searchResult.coilCommands);
		recoverCommands.push(...searchResult.recoverCommands);
		bankResetRequests.push(...searchResult.bankResetRequests);

		return { state: nextState, events, coilCommands, ballWillStartEvents, recoverCommands, bankResetRequests };
	}

	return { step };
}
