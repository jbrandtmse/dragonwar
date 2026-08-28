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
import { createLoop, buttonSwitchEdges, frameInForceAt, NO_FRAME } from '../src/sim/loop';
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

	// Review finding 2026-08-28: the cap resets owedRemainderTicks to zero, so
	// the carried FRACTION is discarded too -- but it was computed out of the
	// reported amount, which under-reported by up to one tick on every capped
	// frame. The I/O matrix's wording is "`ms` is the discarded amount".
	it('the discarded ms includes the carried fractional remainder the cap also throws away', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const out = loop.advance(2000.5, []);

		expect(out.snapshot.tick).toBe(MAX_OWED_TICKS);
		expect(out.events[0].type).toBe('sim_time_discarded');
		// 2000.5 ms owed, MAX_OWED_TICKS run: everything else is gone, the
		// half-tick included. Reporting only the whole-tick part gives 1800.
		expect((out.events[0] as { ms: number }).ms).toBeCloseTo(2000.5 - MAX_OWED_TICKS, 9);
	});

	// The test above's frame has NOTHING else happening -- sim_time_discarded
	// is its only event, so `events[0].type === 'sim_time_discarded'` cannot
	// actually distinguish "prepended before the tick loop's own events" from
	// "the only event that happened to exist". This case forces a SECOND,
	// genuine per-tick event into the SAME capped frame (an eject_failed from
	// pulsing c_autolaunch with no ball ever served, which machine.ts's
	// step() produces on tick 1 -- see test/machine-serve-drain.test.ts's own
	// "eject_failed{device: bd_shooter}" case) and asserts the ordering is
	// discard-THEN-eject_failed, not the reverse -- proving events.push({...
	// sim_time_discarded}) genuinely runs before the tick loop, not merely
	// that it is alone.
	it('sim_time_discarded is ordered BEFORE a real per-tick event produced in the SAME capped frame, not merely the sole event', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		loop.pulseCoil('c_autolaunch'); // no ball has ever been served -- fails on tick 1.
		const out = loop.advance(2000, []);

		expect(out.events.length).toBeGreaterThanOrEqual(2);
		expect(out.events[0].type).toBe('sim_time_discarded');
		expect(out.events.some((e) => e.type === 'eject_failed')).toBe(true);
		// The eject_failed must not itself be mistaken for the first event.
		expect(out.events.findIndex((e) => e.type === 'eject_failed')).toBeGreaterThan(0);
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

	// Review finding 2026-08-28: the guard rejected only NON-FINITE values, so
	// a negative one slipped through and did the quieter damage --
	// Math.floor(-0.4) is -1, so owedTicks was -1: not 0, so AD-4's "N = 0 ->
	// EMPTY arrays and the UNCHANGED previous snapshot" early return was
	// skipped and a fresh Snapshot object was built and returned, while
	// owedRemainderTicks was credited +0.6 ticks of time that never elapsed.
	it('advance(-0.4, []) throws rather than skipping the N = 0 early return and crediting phantom time', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const first = loop.advance(10, []);
		expect(() => loop.advance(-0.4, [])).toThrow(/>= 0/);

		// The accumulator is untouched by the rejected call: 10 more ms owes
		// exactly 10 more ticks, not 11 (which is what the phantom +0.6 credit
		// plus a later fraction would eventually produce).
		const second = loop.advance(10, []);
		expect(second.snapshot.tick).toBe(first.snapshot.tick + 10);
	});
});

// Review finding 2026-08-28: `advance()` resolved the InputFrame in force at
// each tick, but NO test observed the result -- FrameOutput carries no
// SwitchEvent (by design) and machine.step() ignores `frame` in this story,
// so all three transition cases below asserted only a tick count or a
// no-throw and stayed green with the transition queue deleted outright.
// Story 1.6 wires the real key->action map into exactly this argument, so the
// rule is extracted as `frameInForceAt()` and pinned here directly.
describe('frameInForceAt() -- the InputFrame in force at a tick (AD-4), unit-level', () => {
	const held = { ...NO_FRAME, flipper_l: true };
	const alsoStart = { ...NO_FRAME, flipper_l: true, start: true };

	it('a transition applies from ITS OWN tick, not the tick before and not the tick after', () => {
		const pending: InputTransition[] = [{ tick: 3, frame: held }];
		let frame = NO_FRAME;

		frame = frameInForceAt(pending, 1, frame);
		expect(frame.flipper_l, 'tick 1 is before the transition').toBe(false);
		frame = frameInForceAt(pending, 2, frame);
		expect(frame.flipper_l, 'tick 2 is still before the transition').toBe(false);
		frame = frameInForceAt(pending, 3, frame);
		expect(frame.flipper_l, 'tick 3 IS the transition tick -- it must apply here, not at tick 4').toBe(true);
		expect(pending, 'a consumed transition must leave the queue').toHaveLength(0);
	});

	it('two transitions inside one frame each apply from their own tick, in order', () => {
		const pending: InputTransition[] = [
			{ tick: 3, frame: held },
			{ tick: 8, frame: NO_FRAME },
		];
		const seen: boolean[] = [];
		let frame = NO_FRAME;
		for (let tick = 1; tick <= 10; tick++) {
			frame = frameInForceAt(pending, tick, frame);
			seen.push(frame.flipper_l);
		}
		// Held from tick 3 through tick 7 inclusive; released at tick 8.
		expect(seen).toEqual([false, false, true, true, true, true, true, false, false, false]);
	});

	it('a transition stamped BEFORE the first tick applies from the first tick, not silently dropped', () => {
		const pending: InputTransition[] = [{ tick: 0, frame: held }];
		const frame = frameInForceAt(pending, 1, NO_FRAME);
		expect(frame.flipper_l).toBe(true);
		expect(pending).toHaveLength(0);
	});

	it('a transition stamped AFTER the last tick stays queued and applies on a later frame', () => {
		const pending: InputTransition[] = [{ tick: 50, frame: held }];
		let frame = NO_FRAME;
		for (let tick = 1; tick <= 5; tick++) {
			frame = frameInForceAt(pending, tick, frame);
		}
		expect(frame.flipper_l, 'tick 50 is far beyond this frame').toBe(false);
		expect(pending, 'the transition must be RETAINED, not consumed or dropped').toHaveLength(1);

		frame = frameInForceAt(pending, 50, frame);
		expect(frame.flipper_l).toBe(true);
		expect(pending).toHaveLength(0);
	});

	it('several transitions whose ticks have all passed collapse to the LAST one, and the queue drains', () => {
		// The documented consequence of "a transition stamped before the
		// frame's first owed tick applies from the first tick" (this story's
		// own I/O matrix row) when more than one has accumulated.
		const pending: InputTransition[] = [
			{ tick: 1, frame: held },
			{ tick: 2, frame: alsoStart },
		];
		const frame = frameInForceAt(pending, 9, NO_FRAME);
		expect(frame).toEqual(alsoStart);
		expect(pending).toHaveLength(0);
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
