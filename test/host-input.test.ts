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
import { KEY_MAP, createKeyboardInput, type KeyboardEventTarget } from '../src/host/input';
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

	it('Story 1.7 I/O matrix "Blur mid-nudge": a blur while nudge_up is held by BOTH of its codes releases it in one transition, and the held-code tracking is left clean enough to nudge again afterwards', () => {
		// Code review 2026-08-29: the I/O matrix row names `nudge_up` held
		// across a blur, but the blur test above holds only ShiftLeft + Enter
		// and asserts on no nudge action at all. This story added
		// `heldCodesByAction.clear()` to onBlur precisely because an action can
		// now be held by TWO codes -- so the case that most needs covering is a
		// blur with both of nudge_up's codes down, and what the map looks like
		// afterwards (a stale entry would swallow the next ArrowUp press as
		// "already held" and the nudge would never fire again).
		const input = createKeyboardInput({ tickAt: (ms) => ms });
		const { target, dispatch } = installStubTarget();
		input.attach(target);

		dispatch(markPreventDefault(keyEvent('keydown', 'ArrowUp', 1)));
		dispatch(markPreventDefault(keyEvent('keydown', 'Space', 2))); // second code, same action
		expect(input.drainTransitions().map((t) => t.frame.nudge_up), 'only the FIRST code raises the action').toEqual([true]);

		dispatch({ type: 'blur', timeStamp: 3, defaultPrevented: false });
		const released = input.drainTransitions();
		expect(released, 'the blur must emit exactly one releasing transition').toHaveLength(1);
		expect(released[0]!.frame).toMatchObject({ nudge_up: false, nudge_l: false, nudge_r: false });

		// The real regression risk: stale held-codes surviving the blur.
		dispatch(markPreventDefault(keyEvent('keydown', 'ArrowUp', 4)));
		expect(
			input.drainTransitions().map((t) => t.frame.nudge_up),
			'after the blur, pressing ArrowUp again must raise nudge_up -- a stale held-code entry would swallow it as auto-repeat',
		).toEqual([true]);
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

	it('Story 1.7 AC 7: ArrowLeft maps to nudge_l, ArrowRight to nudge_r, ArrowUp to nudge_up, and Space ALSO to nudge_up (a second binding) -- each maps to nothing else, and each calls preventDefault()', () => {
		const input = createKeyboardInput({ tickAt: (ms) => ms });
		const { target, dispatch } = installStubTarget();
		input.attach(target);

		const arrowLeft = markPreventDefault(keyEvent('keydown', 'ArrowLeft', 1));
		dispatch(arrowLeft);
		let transitions = input.drainTransitions();
		expect(transitions).toHaveLength(1);
		expect(transitions[0]!.frame).toMatchObject({ nudge_l: true, nudge_r: false, nudge_up: false, flipper_l: false, flipper_r: false, plunger: false, start: false, menu: false });
		expect(arrowLeft.defaultPrevented).toBe(true);
		dispatch(markPreventDefault(keyEvent('keyup', 'ArrowLeft', 2)));
		input.drainTransitions();

		const arrowRight = markPreventDefault(keyEvent('keydown', 'ArrowRight', 3));
		dispatch(arrowRight);
		transitions = input.drainTransitions();
		expect(transitions[0]!.frame).toMatchObject({ nudge_l: false, nudge_r: true, nudge_up: false });
		expect(arrowRight.defaultPrevented).toBe(true);
		dispatch(markPreventDefault(keyEvent('keyup', 'ArrowRight', 4)));
		input.drainTransitions();

		const arrowUp = markPreventDefault(keyEvent('keydown', 'ArrowUp', 5));
		dispatch(arrowUp);
		transitions = input.drainTransitions();
		expect(transitions[0]!.frame).toMatchObject({ nudge_l: false, nudge_r: false, nudge_up: true });
		expect(arrowUp.defaultPrevented).toBe(true);
		dispatch(markPreventDefault(keyEvent('keyup', 'ArrowUp', 6)));
		input.drainTransitions();

		// Space is a SECOND binding for the same action, nudge_up.
		const space = markPreventDefault(keyEvent('keydown', 'Space', 7));
		dispatch(space);
		transitions = input.drainTransitions();
		expect(transitions[0]!.frame).toMatchObject({ nudge_l: false, nudge_r: false, nudge_up: true });
		expect(space.defaultPrevented).toBe(true);
	});

	it('Story 1.7 AC 7: ArrowDown stays unmapped -- emits no transition and never calls preventDefault()', () => {
		const input = createKeyboardInput({ tickAt: (ms) => ms });
		const { target, dispatch } = installStubTarget();
		input.attach(target);

		const arrowDown = markPreventDefault(keyEvent('keydown', 'ArrowDown', 1));
		dispatch(arrowDown);
		expect(input.drainTransitions()).toEqual([]);
		expect(arrowDown.defaultPrevented, 'ArrowDown must never call preventDefault() -- it is not a mapped code').toBe(false);
	});

	it('Story 1.7 AC 7: "and nothing else" -- KEY_MAP\'s full key set maps to exactly the eight documented codes, no more', () => {
		// Drives every code this file's own header/AC 7 documents and asserts
		// each produces exactly the action named; a stray extra mapping (or a
		// removed one) would desync this list from the shipped KEY_MAP.
		const expected: ReadonlyArray<readonly [string, string]> = [
			['ShiftLeft', 'flipper_l'],
			['ShiftRight', 'flipper_r'],
			['Enter', 'plunger'],
			['Digit1', 'start'],
			['ArrowLeft', 'nudge_l'],
			['ArrowRight', 'nudge_r'],
			['ArrowUp', 'nudge_up'],
			['Space', 'nudge_up'],
		];

		// Review finding: the per-code loop below only ever DISPATCHES this
		// fixed expected list, so on its own it cannot detect a STRAY extra
		// (or mistakenly removed) entry actually shipped in KEY_MAP -- it
		// would just never exercise it. Assert against KEY_MAP's own real key
		// set directly first, the same exhaustiveness shape TUNING.cabinet's
		// own CABINET_KEYS check uses (test/tuning.test.ts).
		expect(Object.keys(KEY_MAP).sort(), "KEY_MAP's real key set must equal exactly the eight documented codes").toEqual(expected.map(([code]) => code).sort());

		for (const [code, action] of expected) {
			const input = createKeyboardInput({ tickAt: (ms) => ms });
			const { target, dispatch } = installStubTarget();
			input.attach(target);
			dispatch(markPreventDefault(keyEvent('keydown', code, 1)));
			const transitions = input.drainTransitions();
			expect(transitions, `${code} must map to exactly one action`).toHaveLength(1);
			const heldActions = (Object.keys(transitions[0]!.frame) as Array<keyof typeof transitions[0]['frame']>).filter((a) => transitions[0]!.frame[a]);
			expect(heldActions, `${code} must map to "${action}" and nothing else`).toEqual([action]);
		}
	});

	it('Story 1.7 review finding: ArrowUp and Space are two DIFFERENT codes bound to the SAME action (nudge_up) -- releasing one while the other is still held must not clear nudge_up, and the later release of the other must still clear it', () => {
		const input = createKeyboardInput({ tickAt: (ms) => ms });
		const { target, dispatch } = installStubTarget();
		input.attach(target);

		dispatch(markPreventDefault(keyEvent('keydown', 'ArrowUp', 1)));
		let transitions = input.drainTransitions();
		expect(transitions, 'ArrowUp keydown must raise nudge_up').toHaveLength(1);
		expect(transitions[0]!.frame.nudge_up).toBe(true);

		// Space is a SECOND code for the SAME action, already held -- must
		// not emit a new transition (mirrors OS auto-repeat's "no change"),
		// but must be tracked as its own held code.
		dispatch(markPreventDefault(keyEvent('keydown', 'Space', 2)));
		expect(input.drainTransitions(), 'a second code for an already-held action must not emit a transition').toEqual([]);

		// Releasing ArrowUp while Space is STILL held must NOT clear nudge_up
		// -- the bug this test guards: a single per-action boolean would
		// clear here even though Space is still physically down.
		dispatch(markPreventDefault(keyEvent('keyup', 'ArrowUp', 3)));
		expect(input.drainTransitions(), 'releasing one of two codes bound to an action, while the other is still held, must not clear the action').toEqual([]);

		// Releasing the LAST held code for the action must clear it.
		dispatch(markPreventDefault(keyEvent('keyup', 'Space', 4)));
		transitions = input.drainTransitions();
		expect(transitions, 'releasing the last held code for an action must clear it').toHaveLength(1);
		expect(transitions[0]!.frame.nudge_up).toBe(false);
	});

	it('QA audit: a keyup for a code that was NEVER pressed down emits no transition and does not corrupt later state -- for a plain single-bound action, and for a multi-bound action (nudge_up) while its OTHER code is genuinely held', () => {
		const input = createKeyboardInput({ tickAt: (ms) => ms });
		const { target, dispatch } = installStubTarget();
		input.attach(target);

		// A bare keyup with no prior keydown, for a normal single-bound action.
		dispatch(markPreventDefault(keyEvent('keyup', 'ShiftLeft', 1)));
		expect(input.drainTransitions(), 'a keyup for a code never pressed down must emit nothing').toEqual([]);

		// The SAME code must still work normally afterward -- proves the
		// spurious keyup left no phantom held-code entry behind.
		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftLeft', 2)));
		let transitions = input.drainTransitions();
		expect(transitions, 'a normal keydown after a spurious keyup must still emit').toHaveLength(1);
		expect(transitions[0]!.frame.flipper_l).toBe(true);
		dispatch(markPreventDefault(keyEvent('keyup', 'ShiftLeft', 3)));
		transitions = input.drainTransitions();
		expect(transitions[0]!.frame.flipper_l, 'the real release must still clear the action').toBe(false);

		// The multi-bound-action case (Story 1.7's own review-found bug class):
		// ArrowUp genuinely held, then a keyup for Space -- the SAME action's
		// SECOND code -- that was NEVER pressed down.
		dispatch(markPreventDefault(keyEvent('keydown', 'ArrowUp', 4)));
		expect(input.drainTransitions()[0]!.frame.nudge_up).toBe(true);

		dispatch(markPreventDefault(keyEvent('keyup', 'Space', 5))); // never pressed
		expect(input.drainTransitions(), 'a keyup for Space, which was never held, must emit nothing while ArrowUp is still down').toEqual([]);

		// ArrowUp's own release must still correctly clear nudge_up -- the
		// spurious Space keyup above must not have corrupted the held-codes
		// set for nudge_up (e.g. by adding a phantom entry that would keep the
		// action wrongly "held" after ArrowUp's real release).
		dispatch(markPreventDefault(keyEvent('keyup', 'ArrowUp', 6)));
		transitions = input.drainTransitions();
		expect(transitions, "ArrowUp's real release must still clear nudge_up").toHaveLength(1);
		expect(transitions[0]!.frame.nudge_up).toBe(false);
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
		// Code review 2026-08-29: this test used `tickAt: () => counter++` and
		// then asserted `ticks` equalled a SORTED COPY OF ITSELF. Both halves
		// were vacuous -- an ascending counter cannot produce an unsorted
		// array, and comparing an array to its own sorted copy can only fail
		// if the module reorders pushes relative to its own tickAt() calls,
		// which `push()` makes structurally impossible. It asserted nothing
		// about stamping. Now stamped from the EVENT TIMESTAMPS through the
		// same `(ms) => ms` tickAt the rest of this file uses, and compared
		// against externally chosen values: a regression that stamped in
		// arrival order, reused one tick, or dropped the timestamp fails here.
		const input = createKeyboardInput({ tickAt: (ms) => ms });
		const { target, dispatch } = installStubTarget();
		input.attach(target);
		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftLeft', 4)));
		dispatch(markPreventDefault(keyEvent('keydown', 'ShiftRight', 9)));
		dispatch(markPreventDefault(keyEvent('keydown', 'Enter', 9)));
		const transitions: InputTransition[] = input.drainTransitions();
		const ticks = transitions.map((t) => t.tick);
		expect(ticks, 'each transition carries the tick its OWN event timestamp maps to').toEqual([4, 9, 9]);
		for (let i = 1; i < ticks.length; i++) {
			expect(ticks[i]!, 'ticks must be non-decreasing in emission order').toBeGreaterThanOrEqual(ticks[i - 1]!);
		}
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
		// Code review 2026-08-29 (iteration 2): all FOUR mapped codes are now
		// covered. The previous list omitted 'Enter' on the grounds that it is
		// a substring of sim/rules/devices.ts's DeviceBallEnteredEvent -- true
		// for a substring test, but not for a word-boundary one ('Entered'
		// gives no \b after 'Enter'), so the plunger key was the one mapped
		// code this AC's grep half never checked. Word-boundary matching keeps
		// the identifier-shaped tokens precise; '.code' stays a substring
		// because '.' is not a word character.
		// 'Space' is deliberately NOT in `bannedWords`: unlike the other mapped
		// codes (all clearly code-shaped identifiers unlikely to appear in
		// ordinary prose), 'Space' is a common English word -- a blanket
		// word-boundary grep for it would false-positive on legitimate prose
		// (found during this story's implementation: "Space/arrow keys to
		// Nudge", quoting the PRD, in this file's own header comment).
		//
		// Code review 2026-08-29: that omission left `Space` -- one of the
		// eight mapped codes AC 7 names -- as the ONE code this guard could no
		// longer detect leaking into src/sim/**. It is restored below as a
		// QUOTED token instead. A key code reaching src/sim/ would have to be
		// written as a string literal to be usable, so the quoted forms catch
		// the real leak while the prose that disabled the bare word (which
		// quotes "Space/arrow keys to Nudge", never the bare token `'Space'`)
		// stays clean. Verified at review time: neither quoted form appears
		// anywhere under src/sim/ today.
		const bannedWords = ['KeyboardEvent', 'ShiftLeft', 'ShiftRight', 'Enter', 'Digit1', 'keydown', 'keyup', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
		const bannedSubstrings = ['.code', "'Space'", '"Space"'];
		const offenders: string[] = [];
		for (const file of listFiles(SIM_ROOT)) {
			const content = readFileSync(file, 'utf8');
			for (const word of bannedWords) {
				if (new RegExp(`\\b${word}\\b`).test(content)) {
					offenders.push(`${path.relative(SIM_ROOT, file)}: "${word}"`);
				}
			}
			for (const token of bannedSubstrings) {
				if (content.includes(token)) {
					offenders.push(`${path.relative(SIM_ROOT, file)}: "${token}"`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
