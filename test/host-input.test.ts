// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.6's I/O matrix, host-input rows: the code-based map (ShiftLeft ->
// flipper_l, ShiftRight -> flipper_r, Enter -> plunger, Digit1 -> start);
// left/right Shift distinctness (keyed on `.code`, never `.key`); OS
// auto-repeat absorption (an identical frame emits nothing); `blur` release
// (every mapped action, or nothing if none were held); and tick stamping
// (delegated to the injected `tickAt`, called with the DOM event's
// `timeStamp`). Mirrors `test/host-loop.test.ts`'s `installRaf()` harness
// style: synthetic, DOM-shaped objects on a stub target, no jsdom.
//
// AD-4's grep half of this story's first acceptance criterion -- "no key
// code, KeyboardEvent reference or code string exists anywhere under
// src/sim/" -- is asserted directly here too, alongside `pnpm
// lint:boundaries`'s own device-name/textual checks.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createKeyboardInput, type KeyboardEventTarget } from '../src/host/input';
import type { InputTransition } from '../src/sim/contracts/input';

interface StubEvent {
	readonly type: 'keydown' | 'keyup' | 'blur';
	readonly code?: string;
	readonly timeStamp: number;
	defaultPrevented: boolean;
}

/** A minimal, non-DOM stand-in for `Window`/`EventTarget` -- captures listeners so the test can dispatch synthetic events directly, the same spirit as `test/host-loop.test.ts`'s `installRaf()`. */
function installStubTarget(): { target: KeyboardEventTarget; dispatch(event: StubEvent): void } {
	const listeners = new Map<string, Set<(event: StubEvent) => void>>();
	const target: KeyboardEventTarget = {
		addEventListener: (type: string, listener: (event: never) => void) => {
			if (!listeners.has(type)) {
				listeners.set(type, new Set());
			}
			listeners.get(type)!.add(listener as (event: StubEvent) => void);
		},
		removeEventListener: (type: string, listener: (event: never) => void) => {
			listeners.get(type)?.delete(listener as (event: StubEvent) => void);
		},
	} as unknown as KeyboardEventTarget;

	return {
		target,
		dispatch(event: StubEvent): void {
			for (const listener of listeners.get(event.type) ?? []) {
				listener(event);
			}
		},
	};
}

function keyEvent(type: 'keydown' | 'keyup', code: string, timeStamp = 0): StubEvent {
	return { type, code, timeStamp, defaultPrevented: false };
}

/** Adds a REAL `preventDefault()` to `event` IN PLACE (never a spread copy -- the caller keeps its own `event` reference and must see the SAME object's `defaultPrevented` flip). */
function markPreventDefault(event: StubEvent): StubEvent & { preventDefault(): void } {
	return Object.assign(event, {
		preventDefault(): void {
			event.defaultPrevented = true;
		},
	});
}

describe('src/host/input -- createKeyboardInput() (AD-4)', () => {
	it('a mapped keydown emits one InputTransition with only that action true, and calls preventDefault()', () => {
		let tickCalls: number[] = [];
		const input = createKeyboardInput({ tickAt: (ms) => { tickCalls.push(ms); return ms; } });
		const { target, dispatch } = installStubTarget();
		input.attach(target);

		const event = markPreventDefault(keyEvent('keydown', 'ShiftLeft', 42));
		dispatch(event);

		const transitions = input.drainTransitions();
		expect(transitions).toHaveLength(1);
		expect(transitions[0]!.frame.flipper_l).toBe(true);
		expect(transitions[0]!.frame.flipper_r).toBe(false);
		expect(transitions[0]!.frame.plunger).toBe(false);
		expect(transitions[0]!.frame.start).toBe(false);
		expect(event.defaultPrevented, 'a mapped code must call preventDefault()').toBe(true);
		expect(tickCalls).toEqual([42]);
	});

	it('an unmapped code emits nothing and does not call preventDefault()', () => {
		const input = createKeyboardInput({ tickAt: (ms) => ms });
		const { target, dispatch } = installStubTarget();
		input.attach(target);

		const event = markPreventDefault(keyEvent('keydown', 'KeyQ', 5));
		dispatch(event);

		expect(input.drainTransitions()).toEqual([]);
		expect(event.defaultPrevented, 'an unmapped code must not call preventDefault()').toBe(false);
	});

	it('left and right Shift are distinct -- keyed on .code, so both can be held independently', () => {
		const input = createKeyboardInput({ tickAt: (ms) => ms });
		const { target, dispatch } = installStubTarget();
		input.attach(target);

		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftLeft', 1)));
		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftRight', 2)));

		const transitions = input.drainTransitions();
		expect(transitions).toHaveLength(2);
		expect(transitions[0]!.frame).toMatchObject({ flipper_l: true, flipper_r: false });
		// The second transition holds BOTH -- the first press is not overwritten.
		expect(transitions[1]!.frame).toMatchObject({ flipper_l: true, flipper_r: true });
	});

	it('OS auto-repeat (a keydown for an action already held) produces no new transition; a keyup/keydown pair still emits two', () => {
		const input = createKeyboardInput({ tickAt: (ms) => ms });
		const { target, dispatch } = installStubTarget();
		input.attach(target);

		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftLeft', 1)));
		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftLeft', 2))); // repeat
		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftLeft', 3))); // repeat
		expect(input.drainTransitions(), 'repeats of an already-held action must not emit').toHaveLength(1);

		dispatch(markPreventDefault(keyEvent('keyup', 'ShiftLeft', 4)));
		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftLeft', 5)));
		const transitions = input.drainTransitions();
		expect(transitions.map((t) => t.frame.flipper_l)).toEqual([false, true]);
	});

	it('blur releases EVERY mapped action in one transition; a blur with nothing held emits nothing', () => {
		const input = createKeyboardInput({ tickAt: (ms) => ms });
		const { target, dispatch } = installStubTarget();
		input.attach(target);

		// blur with nothing held first.
		dispatch({ type: 'blur', timeStamp: 1, defaultPrevented: false });
		expect(input.drainTransitions()).toEqual([]);

		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftLeft', 2)));
		dispatch(markPreventDefault(keyEvent('keydown', 'Enter', 3)));
		input.drainTransitions();

		dispatch({ type: 'blur', timeStamp: 4, defaultPrevented: false });
		const transitions = input.drainTransitions();
		expect(transitions).toHaveLength(1);
		expect(transitions[0]!.frame).toMatchObject({ flipper_l: false, flipper_r: false, plunger: false, start: false });
	});

	it('Enter maps to plunger and Digit1 maps to start', () => {
		const input = createKeyboardInput({ tickAt: (ms) => ms });
		const { target, dispatch } = installStubTarget();
		input.attach(target);

		dispatch(markPreventDefault(keyEvent('keydown', 'Enter', 1)));
		dispatch(markPreventDefault(keyEvent('keydown', 'Digit1', 2)));
		const transitions = input.drainTransitions();
		expect(transitions[0]!.frame.plunger).toBe(true);
		expect(transitions[1]!.frame.start).toBe(true);
	});

	it('each transition is stamped via the injected tickAt(event.timeStamp), and detach() stops future events', () => {
		const seen: number[] = [];
		const input = createKeyboardInput({ tickAt: (ms) => { seen.push(ms); return ms * 2; } });
		const { target, dispatch } = installStubTarget();
		input.attach(target);

		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftLeft', 100)));
		expect(input.drainTransitions()[0]!.tick).toBe(200);
		expect(seen).toEqual([100]);

		input.detach();
		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftRight', 200)));
		expect(input.drainTransitions(), 'detach() must stop future events from reaching this module').toEqual([]);
	});

	it('drainTransitions() empties the queue -- a second call with nothing new returns []', () => {
		const input = createKeyboardInput({ tickAt: (ms) => ms });
		const { target, dispatch } = installStubTarget();
		input.attach(target);
		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftLeft', 1)));
		expect(input.drainTransitions()).toHaveLength(1);
		expect(input.drainTransitions()).toEqual([]);
	});

	it('two presses in one drain window are stamped in non-decreasing tick order', () => {
		let counter = 0;
		const input = createKeyboardInput({ tickAt: () => counter++ });
		const { target, dispatch } = installStubTarget();
		input.attach(target);
		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftLeft', 1)));
		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftRight', 2)));
		dispatch(markPreventDefault(keyEvent('keydown', 'Enter', 3)));
		const transitions: InputTransition[] = input.drainTransitions();
		const ticks = transitions.map((t) => t.tick);
		expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
	});
});

describe('AD-4 -- no key code, KeyboardEvent reference or "code" string exists anywhere under src/sim/', () => {
	const SIM_ROOT = path.resolve(__dirname, '..', 'src', 'sim');

	function listFiles(dir: string): string[] {
		const out: string[] = [];
		for (const entry of readdirSync(dir)) {
			const full = path.join(dir, entry);
			if (statSync(full).isDirectory()) {
				out.push(...listFiles(full));
			} else if (/\.ts$/.test(entry)) {
				out.push(full);
			}
		}
		return out;
	}

	it('no file under src/sim/** mentions KeyboardEvent, a host/input key code, or reads event.code', () => {
		const bannedTokens = ['KeyboardEvent', 'ShiftLeft', 'ShiftRight', '.code', 'keydown', 'keyup'];
		const offenders: string[] = [];
		for (const file of listFiles(SIM_ROOT)) {
			const content = readFileSync(file, 'utf8');
			for (const token of bannedTokens) {
				if (content.includes(token)) {
					offenders.push(`${path.relative(SIM_ROOT, file)}: "${token}"`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
