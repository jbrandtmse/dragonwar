// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (DW-290): the ball controller's pure accounting folds, moved
// unchanged out of the Epic 2 monolith -- `applyDeviceEvents()`,
// `deriveDeviceSlots()`, `applyRecovery()` (all three re-exported by
// `./index.ts`, whose public surface is unchanged) and the DRAGON-letters
// fold `step()` runs each tick.
//
// AD-7 (Story 2.5 is where it becomes true): `machine.deviceSlots` is
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

import { TABLE } from '../../table/dragonwar';
import { servesIntoOf } from '../ball-search';
import { addDragonLetters, scoringOpen } from '../scoring';
import type { DeviceEvent } from '../devices';
import type { BallDeviceName, GameState, MachineState } from '../../table/names';

/**
 * Story 2.12 (DW-187, task 2): every non-parking device's own serving set --
 * the parking devices whose declared `servesInto` equals that device's own
 * `entry`. At this tree: `bd_shooter -> {bd_trough}`. `bd_shooter`'s own
 * `servesInto` (it serves INTO ITSELF, the resting pose) is irrelevant here
 * -- this map is keyed by entry-matching, not by a device's own outgoing
 * `servesInto`, so it is never itself a member of its own serving set.
 * Module-level (mirrors `HARDWARE_COILS`): a pure function of the
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
 * S5: DRAGON-letter accumulation (AD-7: "player-scoped ... DRAGON letters"),
 * credited to whoever is currently playing. Story 3.0a: behind
 * `scoring.ts`'s gate (DW-246) and de-duplicated there (DW-283). Returns
 * `state` itself when no letter lands.
 */
export function foldDragonLetters(state: GameState, deviceEvents: readonly DeviceEvent[]): GameState {
	let lettersDelta = '';
	for (const event of deviceEvents) {
		if (event.type === 'bank_target_down') {
			lettersDelta += event.letter;
		}
	}
	if (lettersDelta.length > 0 && scoringOpen(state)) {
		const currentPlayer = state.currentPlayer;
		const players = state.players.map((player, index) =>
			index === currentPlayer ? { ...player, letters: addDragonLetters(player.letters, lettersDelta) } : player,
		);
		return { ...state, players };
	}
	return state;
}
