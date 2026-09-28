// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-19/AD-2 -- the DRAGON drop bank's own letters and its reset coil. This
// module ALONE pulses `c_dragon_bank_reset` (AD-19's own rule text), on a
// genuine six-of-six completion, on `ball_will_start` (task 4) and (Story
// 2.12, AD-19 amended) on ball search's own reset request (`onResetRequested()`
// below) -- ball search itself never pulses this coil; it only asks.
// Physics
// (`sim/physics/drop-targets.ts`) owns the mechanical state end to end
// (AD-2: the six `s_dragon_*` switches are excluded from the generic
// tracker) and still emits their edges through the normal `switchEvents`
// channel every `machine.step()` call -- this module reads those edges
// exactly like any other switch, deriving its letter set from
// `TABLE.dropBankWiring` (DW-149: never a second hand-typed letter list).
//
// Latching: a `closed:true` edge for an already-down letter is a no-op (no
// duplicate `bank_target_down`); once six-of-six has fired `bank_completed`
// once, it does not fire again until a `closed:false` edge (the bank's own
// reset, physics-emitted) clears at least one letter -- "Bank reset
// absorbed" (I/O matrix): the six reset edges themselves emit nothing, they
// only clear the latch for the NEXT genuine completion.

import { TABLE } from '../../table/dragonwar';
import type { CoilCommand, CoilName, SwitchEvent, SwitchName } from '../../table/names';
import type { BankCompletedEvent, BankTargetDownEvent, DropBankLetter } from './events';

type DropBankEvent = BankTargetDownEvent | BankCompletedEvent;

export interface DropBankStepResult {
	readonly events: readonly DropBankEvent[];
	readonly coilCommands: readonly CoilCommand[];
}

export interface DropBankTracker {
	/** Runs one tick's switch edges through the bank's own letter bookkeeping. */
	step(switchEvents: readonly SwitchEvent[], tick: number): DropBankStepResult;
	/** `ball_will_start` reached the layer -- one unconditional `c_dragon_bank_reset` pulse, whatever the bank state (AC 4). */
	onBallWillStart(tick: number): CoilCommand;
	/**
	 * Story 2.12 (AD-19, amended): ball search's own reset request reached the
	 * layer -- the SAME unconditional pulse `onBallWillStart()` above issues,
	 * on AD-19's third trigger. This component stays the only caller of
	 * `c_dragon_bank_reset` (ball search itself never pulses it -- it only
	 * asks).
	 */
	onResetRequested(tick: number): CoilCommand;
}

export function createDropBankTracker(): DropBankTracker {
	const letters = Object.keys(TABLE.dropBankWiring) as DropBankLetter[];
	const switchToLetter = new Map<SwitchName, DropBankLetter>();
	for (const letter of letters) {
		switchToLetter.set(TABLE.dropBankWiring[letter].switch as SwitchName, letter);
	}
	// Never a `c_`-prefixed string literal of its own (pnpm lint:boundaries
	// rule (e)) -- resolved from TABLE, mirroring
	// sim/physics/drop-targets.ts's own idiom for the same coil.
	const resetCoil = TABLE.dropBankResetCoil as CoilName;

	const down = {} as Record<DropBankLetter, boolean>;
	for (const letter of letters) {
		down[letter] = false;
	}
	let completed = false;

	function pulseResetCoil(tick: number): CoilCommand {
		return { type: 'coil', coil: resetCoil, action: 'pulse', tick };
	}

	function step(switchEvents: readonly SwitchEvent[], tick: number): DropBankStepResult {
		const events: DropBankEvent[] = [];
		const coilCommands: CoilCommand[] = [];

		for (const event of switchEvents) {
			const letter = switchToLetter.get(event.switch);
			if (!letter) {
				continue;
			}
			if (event.closed) {
				if (down[letter]) {
					continue; // already down -- a duplicate edge, not a new strike.
				}
				down[letter] = true;
				events.push({ type: 'bank_target_down', letter, tick });
			} else {
				down[letter] = false;
				// The bank's own reset just cleared this letter -- the latch is
				// only meaningful while all six are genuinely down, so clear it
				// too. Absorbed silently: no event for the reset edge itself.
				completed = false;
			}
		}

		if (!completed && letters.every((letter) => down[letter])) {
			completed = true;
			events.push({ type: 'bank_completed', tick });
			coilCommands.push(pulseResetCoil(tick));
		}

		return { events, coilCommands };
	}

	function onBallWillStart(tick: number): CoilCommand {
		return pulseResetCoil(tick);
	}

	function onResetRequested(tick: number): CoilCommand {
		return pulseResetCoil(tick);
	}

	return { step, onBallWillStart, onResetRequested };
}
