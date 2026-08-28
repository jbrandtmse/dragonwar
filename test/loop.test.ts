// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-4's own loop contract, this story's I/O matrix: remainder carry; N = 0
// producing empty arrays and an unchanged snapshot; the 200 ms cap producing
// exactly one sim_time_discarded as events[0] and resetting the carried
// remainder to zero; commands issued via pulseCoil() consumed the tick
// AFTER they were enqueued, never the same tick; rules running on every
// step including empty ones (state.tick tracks physics tick 1:1, even when
// nothing else happens); tick-stamped InputTransitions applying from the
// correct tick, including the "before the first tick" / "after the last
// tick, carried to the next frame" edge cases; and button-switch edges from
// consecutive InputFrames (tested directly against the exported
// buttonSwitchEdges() helper -- FrameOutput deliberately carries no
// SwitchEvent, so there is no other observable surface for this).
//
// (Cadence independence -- the 30/60/120 Hz determinism comparison -- is
// test/loop-determinism.test.ts's own file, per this story's task list.)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, buttonSwitchEdges, NO_FRAME } from '../src/sim/loop';
import { MAX_OWED_TICKS } from '../src/sim/contracts/time';
import type { InputTransition } from '../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

describe('sim/loop -- remainder carry (AD-4)', () => {
	it('advance(16.667, []) at TICK_HZ = 1000 runs 16 whole ticks, carrying the 0.667 tick remainder', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const out = loop.advance(16.667, []);
		expect(out.snapshot.tick).toBe(16);
	});

	it('the carried remainder accumulates into the NEXT call\'s owed-tick count', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		loop.advance(16.667, []); // tick 16, remainder 0.667
		const out = loop.advance(16.667, []); // owed = 0.667 + 16.667 = 17.334 -> 17 ticks
		expect(out.snapshot.tick).toBe(33);
	});
});

describe('sim/loop -- N = 0 (AD-4)', () => {
	it('advance(0.4, []) with no carried remainder owes 0 ticks: empty arrays, the SAME (unchanged) snapshot object, same tick', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const before = loop.advance(0, []);
		const after = loop.advance(0.4, []);
		expect(after.events).toEqual([]);
		expect(after.contactEvents).toEqual([]);
		expect(after.commands).toEqual([]);
		expect(after.snapshot).toBe(before.snapshot);
		expect(after.snapshot.tick).toBe(before.snapshot.tick);
	});
});

describe('sim/loop -- the 200 ms owed-time cap (AD-4)', () => {
	it('advance(2000, []) runs exactly MAX_OWED_TICKS steps; sim_time_discarded{ms} is events[0]; the remainder resets to zero', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const out = loop.advance(2000, []);

		expect(out.snapshot.tick).toBe(MAX_OWED_TICKS);
		expect(out.events.length).toBeGreaterThan(0);
		expect(out.events[0].type).toBe('sim_time_discarded');
		expect((out.events[0] as { ms: number }).ms).toBe(2000 - MAX_OWED_TICKS);
		// Exactly one discard event for this frame, never zero and never two.
		expect(out.events.filter((e) => e.type === 'sim_time_discarded')).toHaveLength(1);

		// The remainder reset to zero: a tiny follow-up frame owes 0 ticks, not
		// "almost 1" from carried fractional cap overflow.
		const after = loop.advance(0.4, []);
		expect(after.snapshot.tick).toBe(out.snapshot.tick);
	});
});

// Review finding 2026-08-28: a non-finite elapsedMs previously poisoned
// owedRemainderTicks with NaN permanently -- every subsequent advance() call
// would silently run zero steps forever, with no thrown error, since
// `0 < NaN` and `NaN > MAX_OWED_TICKS` are both false. advance() now throws
// immediately instead.
describe('sim/loop -- a non-finite elapsedMs throws immediately, rather than silently freezing forever', () => {
	it('advance(NaN, []) throws, and does not leave the loop in a state where the NEXT call also owes zero ticks', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		expect(() => loop.advance(NaN, [])).toThrow(/finite/i);

		// If the guard were missing (or placed after owedRemainderTicks was
		// already mutated), a well-formed follow-up call would still owe 0
		// ticks forever. Confirm the loop is unaffected by the rejected call.
		const out = loop.advance(16.667, []);
		expect(out.snapshot.tick).toBe(16);
	});

	it('advance(Infinity, []) also throws', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		expect(() => loop.advance(Infinity, [])).toThrow(/finite/i);
	});
});

describe('sim/loop -- commands land the tick AFTER they were issued, never the same tick (AD-4)', () => {
	it('pulseCoil() enqueued between two advance() calls takes effect on the FIRST tick the next call processes, not before', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const before = loop.advance(0, []);
		expect(before.snapshot.balls).toEqual([]);

		loop.pulseCoil('c_trough_eject');
		// Advance by exactly one tick: the pulse must already have taken effect
		// by the time this single tick's machine.step() runs (it is consumed
		// as "this tick's commands", constructed at the moment each tick is
		// processed -- there is no earlier tick at which it could apply).
		const out = loop.advance(1, []);
		expect(out.snapshot.tick).toBe(before.snapshot.tick + 1);
		expect(out.snapshot.balls).toHaveLength(1);
	});
});

describe('sim/loop -- rules runs on every step, even with no switch events (AD-4)', () => {
	it('state.tick tracks the physics tick 1:1 on an ordinary frame with nothing else happening', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const out = loop.advance(50, []);
		expect(out.snapshot.game.tick).toBe(out.snapshot.tick);
	});
});

describe('sim/loop -- tick-stamped InputTransitions (AD-4)', () => {
	it('two transitions at ticks t and t+5 inside one frame each apply from their own tick', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const held = { ...NO_FRAME, flipper_l: true };
		const transitions: InputTransition[] = [
			{ tick: 3, frame: held },
			{ tick: 8, frame: NO_FRAME },
		];
		// 10 ticks owed, covering both transitions.
		const out = loop.advance(10, transitions);
		expect(out.snapshot.tick).toBe(10);
		// No public surface reports the button-switch state directly (see the
		// buttonSwitchEdges() unit tests below for the edge-emission contract
		// itself); this case only proves BOTH transitions are consumed without
		// throwing and the tick count is unaffected by having two transitions
		// instead of zero or one.
	});

	it('a transition stamped BEFORE the frame\'s first owed tick applies from the first tick', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		// tick 0 does not exist as an owed step (ticks start at 1) -- a
		// transition timestamped at or before the very first tick this frame
		// will run must still apply, not be silently dropped for being "in the
		// past".
		const transitions: InputTransition[] = [{ tick: 0, frame: { ...NO_FRAME, start: true } }];
		expect(() => loop.advance(5, transitions)).not.toThrow();
	});

	it('a transition stamped AFTER the frame\'s last owed tick is carried to the next frame, not dropped', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		// This frame owes 5 ticks (1..5); the transition is stamped for tick 50,
		// far beyond this frame's reach.
		const transitions: InputTransition[] = [{ tick: 50, frame: { ...NO_FRAME, start: true } }];
		const first = loop.advance(5, transitions);
		expect(first.snapshot.tick).toBe(5);

		// A later frame that reaches tick 50 must still apply it -- proving the
		// loop itself retained the pending transition rather than the caller
		// needing to re-supply it.
		let out = first;
		for (let i = 0; i < 10; i++) {
			out = loop.advance(16.667, []);
		}
		expect(out.snapshot.tick).toBeGreaterThanOrEqual(50);
	});
});

describe('buttonSwitchEdges() -- the button-switch edge source (AD-2), unit-level', () => {
	it('emits a closed:true edge for each action that transitions from not-held to held', () => {
		const previous = NO_FRAME;
		const current = { ...NO_FRAME, flipper_l: true, start: true };
		const edges = buttonSwitchEdges(previous, current, 42);
		expect(edges.sort((a, b) => a.switch.localeCompare(b.switch))).toEqual([
			{ type: 'switch', switch: 's_flipper_l', closed: true, tick: 42 },
			{ type: 'switch', switch: 's_start', closed: true, tick: 42 },
		]);
	});

	it('emits a closed:false edge on release, and no edge for an action held unchanged across ticks', () => {
		const previous = { ...NO_FRAME, flipper_r: true, plunger: true };
		const current = { ...NO_FRAME, flipper_r: false, plunger: true };
		const edges = buttonSwitchEdges(previous, current, 7);
		expect(edges).toEqual([{ type: 'switch', switch: 's_flipper_r', closed: false, tick: 7 }]);
	});

	it('nudge_l/nudge_r/nudge_up/menu produce no button-switch edges -- Epic 1 has no switch for them', () => {
		const previous = NO_FRAME;
		const current = { ...NO_FRAME, nudge_l: true, nudge_r: true, nudge_up: true, menu: true };
		expect(buttonSwitchEdges(previous, current, 1)).toEqual([]);
	});

	it('identical frames produce no edges at all', () => {
		const frame = { ...NO_FRAME, start: true };
		expect(buttonSwitchEdges(frame, { ...frame }, 1)).toEqual([]);
	});
});
