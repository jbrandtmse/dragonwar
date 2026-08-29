// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-4 -- the key->InputAction map lives ONLY here; no key code,
// `KeyboardEvent` reference or `code` string exists anywhere under `src/sim/`
// (`pnpm lint:boundaries` plus the grep assertion in `test/host-input.test.ts`
// both prove it). Keyed on `KeyboardEvent.code` (never `.key`, which reads
// `'Shift'` for BOTH `ShiftLeft`/`ShiftRight` and so cannot tell the two
// flippers apart): `ShiftLeft` -> `flipper_l`, `ShiftRight` -> `flipper_r`,
// `Enter` -> `plunger`, `Digit1` -> `start`, `ArrowLeft` -> `nudge_l`,
// `ArrowRight` -> `nudge_r`, `ArrowUp` -> `nudge_up`, `Space` -> `nudge_up`
// (a second binding for the same action -- Story 1.7, "Space/arrow keys to
// Nudge"; `ArrowDown` stays unmapped, there is no fourth nudge action).
//
// `createKeyboardInput({ tickAt })` holds one `InputFrame` accumulator and
// emits a NEW `InputTransition` only when that frame actually CHANGES --
// which is what absorbs the OS's own key-repeat (a repeated `keydown` for an
// already-held action produces an identical frame, so nothing is pushed).
// `tickAt` (owned by `src/host/loop.ts`, the accumulator-origin owner) turns
// a DOM event's `timeStamp` into the sim tick it is stamped with; this
// module never reads a clock of its own (AD-3).
//
// `host/**` may import `sim/contracts` (AD-16); this file imports nothing
// from `sim/physics` or `sim/rules`.

import type { InputAction, InputFrame, InputTransition } from '../../sim/contracts/input';

/**
 * A minimal, DOM-shaped event -- `event.code`/`event.timeStamp` for
 * keydown/keyup, `event.preventDefault()` for mapped codes only. Structural,
 * not `KeyboardEvent` itself, so `test/host-input.test.ts` can drive this
 * module with plain synthetic objects (no jsdom).
 */
export interface KeyboardEventLike {
	readonly code: string;
	readonly timeStamp: number;
	preventDefault(): void;
}

/** A minimal, DOM-shaped focus event -- only `timeStamp` is read. */
export interface FocusEventLike {
	readonly timeStamp: number;
}

/**
 * Structural stand-in for `Window`/`EventTarget` -- `attach()`/`detach()`
 * below register exactly these three listeners and nothing else, so a test
 * stub (or `globalThis` in a real browser, where it IS `window`) needs to
 * implement no more than this.
 */
export interface KeyboardEventTarget {
	addEventListener(type: 'keydown' | 'keyup', listener: (event: KeyboardEventLike) => void): void;
	addEventListener(type: 'blur', listener: (event: FocusEventLike) => void): void;
	removeEventListener(type: 'keydown' | 'keyup', listener: (event: KeyboardEventLike) => void): void;
	removeEventListener(type: 'blur', listener: (event: FocusEventLike) => void): void;
}

export interface KeyboardInput {
	attach(target: KeyboardEventTarget): void;
	detach(): void;
	/** Every `InputTransition` produced since the last call; the internal queue is emptied. */
	drainTransitions(): InputTransition[];
}

/** Every action always present, none held -- `InputFrame`'s own contract ("there is no unset state"). */
const EMPTY_FRAME: InputFrame = {
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
 * The one place a `KeyboardEvent.code` is spelled out (AD-4). Exported
 * read-only so `test/host-input.test.ts`'s "and nothing else" exhaustiveness
 * check can assert against the map's REAL key set (Story 1.7 review finding:
 * a fixed expected-list test that never reads this map cannot detect a stray
 * extra or mistaken entry) -- the same shape as `TUNING.cabinet`'s own
 * `CABINET_KEYS` exhaustiveness check.
 */
export const KEY_MAP: Readonly<Record<string, InputAction>> = {
	ShiftLeft: 'flipper_l',
	ShiftRight: 'flipper_r',
	Enter: 'plunger',
	Digit1: 'start',
	ArrowLeft: 'nudge_l',
	ArrowRight: 'nudge_r',
	ArrowUp: 'nudge_up',
	Space: 'nudge_up',
};

export function createKeyboardInput(options: { readonly tickAt: (domTimeStampMs: number) => number }): KeyboardInput {
	const { tickAt } = options;

	let frame: InputFrame = EMPTY_FRAME;
	const pending: InputTransition[] = [];
	let attachedTarget: KeyboardEventTarget | undefined;

	// Story 1.7 review finding: `ArrowUp` and `Space` are now TWO codes bound
	// to the SAME action (`nudge_up`) -- the first two-codes-to-one-action
	// binding this module has ever had. A single `frame[action]` boolean
	// cannot represent "how many of this action's codes are currently held":
	// holding ArrowUp, then also pressing Space (swallowed as auto-repeat
	// since nudge_up is already true), then releasing ArrowUp would clear
	// nudge_up while Space is still physically held, and the later Space
	// release would then be silently swallowed as "already released". Each
	// action instead tracks the SET of its own currently-held codes; the
	// frame's boolean is derived from that set being non-empty, so an action
	// only transitions to released once EVERY code bound to it is released.
	const heldCodesByAction = new Map<InputAction, Set<string>>();

	function push(next: InputFrame, timeStampMs: number): void {
		frame = next;
		pending.push({ tick: tickAt(timeStampMs), frame });
	}

	function onKeyDown(event: KeyboardEventLike): void {
		const action = KEY_MAP[event.code];
		if (!action) {
			return; // an unmapped code emits nothing (I/O matrix)
		}
		event.preventDefault(); // only for mapped codes
		let heldCodes = heldCodesByAction.get(action);
		if (!heldCodes) {
			heldCodes = new Set<string>();
			heldCodesByAction.set(action, heldCodes);
		}
		if (heldCodes.has(event.code)) {
			return; // OS auto-repeat of a code already held: no change
		}
		const wasHeld = heldCodes.size > 0;
		heldCodes.add(event.code);
		if (wasHeld) {
			return; // a second code for an action already held: no frame change
		}
		push({ ...frame, [action]: true }, event.timeStamp);
	}

	function onKeyUp(event: KeyboardEventLike): void {
		const action = KEY_MAP[event.code];
		if (!action) {
			return;
		}
		event.preventDefault();
		const heldCodes = heldCodesByAction.get(action);
		if (!heldCodes || !heldCodes.has(event.code)) {
			return; // already released -- no change, no transition
		}
		heldCodes.delete(event.code);
		if (heldCodes.size > 0) {
			return; // another code still holds this action: no frame change
		}
		push({ ...frame, [action]: false }, event.timeStamp);
	}

	function onBlur(event: FocusEventLike): void {
		const anyHeld = (Object.keys(frame) as InputAction[]).some((action) => frame[action]);
		heldCodesByAction.clear();
		if (!anyHeld) {
			return; // nothing held -- emits nothing (I/O matrix)
		}
		push(EMPTY_FRAME, event.timeStamp);
	}

	return {
		attach(target: KeyboardEventTarget): void {
			attachedTarget = target;
			target.addEventListener('keydown', onKeyDown);
			target.addEventListener('keyup', onKeyUp);
			target.addEventListener('blur', onBlur);
		},
		detach(): void {
			if (!attachedTarget) {
				return;
			}
			attachedTarget.removeEventListener('keydown', onKeyDown);
			attachedTarget.removeEventListener('keyup', onKeyUp);
			attachedTarget.removeEventListener('blur', onBlur);
			attachedTarget = undefined;
		},
		drainTransitions(): InputTransition[] {
			const drained = pending.slice();
			pending.length = 0;
			return drained;
		},
	};
}
