// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-4 -- the key->InputAction map lives ONLY here; no key code,
// `KeyboardEvent` reference or `code` string exists anywhere under `src/sim/`
// (`pnpm lint:boundaries` plus the grep assertion in `test/host-input.test.ts`
// both prove it). Keyed on `KeyboardEvent.code` (never `.key`, which reads
// `'Shift'` for BOTH `ShiftLeft`/`ShiftRight` and so cannot tell the two
// flippers apart): `ShiftLeft` -> `flipper_l`, `ShiftRight` -> `flipper_r`,
// `Enter` -> `plunger`, `Digit1` -> `start`.
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

/** The one place a `KeyboardEvent.code` is spelled out (AD-4). */
const KEY_MAP: Readonly<Record<string, InputAction>> = {
	ShiftLeft: 'flipper_l',
	ShiftRight: 'flipper_r',
	Enter: 'plunger',
	Digit1: 'start',
};

export function createKeyboardInput(options: { readonly tickAt: (domTimeStampMs: number) => number }): KeyboardInput {
	const { tickAt } = options;

	let frame: InputFrame = EMPTY_FRAME;
	const pending: InputTransition[] = [];
	let attachedTarget: KeyboardEventTarget | undefined;

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
		if (frame[action]) {
			return; // OS auto-repeat: an identical frame emits nothing
		}
		push({ ...frame, [action]: true }, event.timeStamp);
	}

	function onKeyUp(event: KeyboardEventLike): void {
		const action = KEY_MAP[event.code];
		if (!action) {
			return;
		}
		event.preventDefault();
		if (!frame[action]) {
			return; // already released -- no change, no transition
		}
		push({ ...frame, [action]: false }, event.timeStamp);
	}

	function onBlur(event: FocusEventLike): void {
		const anyHeld = (Object.keys(frame) as InputAction[]).some((action) => frame[action]);
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
