// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.4: rewritten onto the switch-script DSL (test/util/switch-script.ts,
// AD-15's own "typed by SwitchName"), deleting the `as SwitchEvent`-cast
// `edge()` helper this file used to hand-roll -- that cast erased
// `SwitchName` typing entirely, so a typo'd switch name compiled and
// silently matched nothing. Every device and shot event AD-19 names has at
// least one scripted test here (AC 9); no physics or rendering module is
// imported by this file.
//
// AD-19: "sim/rules/devices/ is the only consumer of SwitchEvent ... and
// emits device events only". AD-6: "the opening of s_shooter_lane is the one
// event that means 'plunged'"; "device counts in GameState are the number of
// closed slot switches and nothing else".

import { describe, expect, it, vi } from 'vitest';
import { createDevicesLayer, PLAYFIELD_SWITCHES } from '../src/sim/rules/devices';
import { applyDeviceEvents, applyRecovery } from '../src/sim/rules/ball-controller';
import { createRules } from '../src/sim/rules';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning } from '../src/sim/table/tuning';
import { close, open, runSwitchScript } from './util/switch-script';
import type { GameState, MachineState, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const LOOP_WINDOW_TICKS = TUNING.loopWindowTicks.value;
const RAMP_WINDOW_TICKS = TUNING.rampWindowTicks.value;
const LOCK_CAPTURE_WINDOW_TICKS = TUNING.lockCaptureWindowTicks.value;

function machine(overrides: Partial<MachineState> = {}): MachineState {
	return {
		ballsInPlay: 0,
		hardwareEnabled: true,
		ballSave: { untilTick: null, sources: [] },
		tilt: { tilted: false, slamTilted: false },
		multiball: null,
		highscores: [],
		deviceSlots: { bd_trough: [true, true, true, true], bd_shooter: [false], bd_lock: [false, false, false] },
		...overrides,
	};
}

function state(overrides: Partial<GameState> = {}): GameState {
	return {
		tick: 0,
		phase: 'attract',
		machine: machine(),
		players: [],
		currentPlayer: 0,
		modes: [],
		rng: 0,
		...overrides,
	};
}

describe('sim/rules/devices/ -- ball launch and ball-device slot bookkeeping (AD-6, AD-19)', () => {
	it('the OPENING of the shooter lane is ball_launched (plus its own device_ball_left, DW-70 task 2); the closing is device_ball_entered, never a launch', () => {
		// Story 2.5, task 2 (DW-70): bd_shooter now has occupancy too, so BOTH
		// edges carry a bookkeeping event alongside whatever they already meant
		// -- the CLOSE (arrival) is `device_ball_entered`, never a launch; the
		// OPEN (plunge) is STILL the one event that means "plunged" (AD-6), now
		// paired with its own `device_ball_left`. Whole-array `toEqual` per
		// `:114-116` -- a defect that widened either edge's meaning would show up
		// as an extra or missing member here, not merely a filtered subset.
		const launch = runSwitchScript(open('s_shooter_lane').at(7).build(), { durationTicks: 10 });
		expect(launch.events).toEqual([
			{ type: 'device_ball_left', device: 'bd_shooter', slot: 0, tick: 7 },
			{ type: 'ball_launched', tick: 7 },
		]);

		const arrival = runSwitchScript(close('s_shooter_lane').at(7).build(), { durationTicks: 10 });
		expect(
			arrival.events,
			'a ball ARRIVING in the shooter lane is not a launch -- it is device_ball_entered only',
		).toEqual([{ type: 'device_ball_entered', device: 'bd_shooter', slot: 0, tick: 7 }]);
	});

	it('a parking device\'s slot switch edges become device_ball_entered/_left with the slot index from TABLE, not a literal', () => {
		const slots = TABLE.ballDevices.bd_trough.slots;
		const entered = runSwitchScript(close(slots[0]).at(3).build(), { durationTicks: 5 });
		expect(entered.events).toEqual([{ type: 'device_ball_entered', device: 'bd_trough', slot: 0, tick: 3 }]);

		const left = runSwitchScript(open(slots[3]).at(4).build(), { durationTicks: 5 });
		expect(left.events).toEqual([{ type: 'device_ball_left', device: 'bd_trough', slot: 3, tick: 4 }]);
	});
});

describe('sim/rules/devices/ -- shots: the Loop, sequence-based (AC 2)', () => {
	it('Loop made: s_loop_l_in closes at t, s_loop_l_out closes at t + loopWindowTicks - 1 -> exactly one shot_left_loop_made, no _broken', () => {
		const script = close('s_loop_l_in').at(100).close('s_loop_l_out').at(100 + LOOP_WINDOW_TICKS - 1).build();
		const result = runSwitchScript(script, { durationTicks: 100 + LOOP_WINDOW_TICKS + 50 });
		// Story 2.7: both loop-entry switches are also playfield switches, so
		// each closure reports its own playfield_switch_closed alongside the
		// shot vocabulary this test is actually about.
		expect(result.events).toEqual([
			{ type: 'playfield_switch_closed', switch: 's_loop_l_in', tick: 100 },
			{ type: 'playfield_switch_closed', switch: 's_loop_l_out', tick: 100 + LOOP_WINDOW_TICKS - 1 },
			{ type: 'shot_left_loop_made', tick: 100 + LOOP_WINDOW_TICKS - 1 },
		]);
	});

	// The Ramp gets a window straddle (AC 2, below) but the Loop did not, and
	// the Loop's expiry has NO emitted observable of its own -- `entryExclusive:
	// false` means expiry only deletes the in-flight entry and never pushes
	// `_broken`. So without this pair, `loopWindowMs` (one of the three
	// tunables this story exists to introduce) was unpinned in BOTH directions:
	// measured at code review, gating the whole expiry on `entryExclusive`
	// (i.e. never enforcing the Loop window at all) left the entire suite green
	// while a `_out` closing 10x the window later still scored a made Loop.
	it('window straddle: s_loop_l_out at exactly +loopWindowTicks still makes it; at +loopWindowTicks + 1 the window has lapsed and nothing at all is emitted', () => {
		const lastInWindow = runSwitchScript(
			close('s_loop_l_in').at(100).close('s_loop_l_out').at(100 + LOOP_WINDOW_TICKS).build(),
			{ durationTicks: 100 + LOOP_WINDOW_TICKS + 50 },
		);
		expect(lastInWindow.events, 'the exact boundary tick is still inside the window (expiry is `tick > start + window`)').toEqual([
			{ type: 'playfield_switch_closed', switch: 's_loop_l_in', tick: 100 },
			{ type: 'playfield_switch_closed', switch: 's_loop_l_out', tick: 100 + LOOP_WINDOW_TICKS },
			{ type: 'shot_left_loop_made', tick: 100 + LOOP_WINDOW_TICKS },
		]);

		const justOutside = runSwitchScript(
			close('s_loop_l_in').at(100).close('s_loop_l_out').at(100 + LOOP_WINDOW_TICKS + 1).build(),
			{ durationTicks: 100 + LOOP_WINDOW_TICKS + 50 },
		);
		expect(
			justOutside.events,
			'one tick past the window the sequence has already been expired, and a Loop never emits _broken (entryExclusive: false) -- so only the two playfield_switch_closed reports remain, no shot event',
		).toEqual([
			{ type: 'playfield_switch_closed', switch: 's_loop_l_in', tick: 100 },
			{ type: 'playfield_switch_closed', switch: 's_loop_l_out', tick: 100 + LOOP_WINDOW_TICKS + 1 },
		]);
	});

	it('a Loop taken the wrong way (s_loop_l_out then s_loop_l_in) emits nothing; the same test drives the correct direction and observes shot_left_loop_made', () => {
		const wrongWay = runSwitchScript(
			close('s_loop_l_out').at(100).close('s_loop_l_in').at(110).build(),
			{ durationTicks: 110 + LOOP_WINDOW_TICKS + 5 },
		);
		// The WHOLE event array, not a filtered subset: the sibling tests in
		// this file all assert `toEqual([...])`, and "nothing is emitted for
		// this shot" is a weaker claim than the test's own name makes. Story
		// 2.7: both switches are still playfield switches regardless of order,
		// so their own playfield_switch_closed reports remain -- only the Loop
		// SHOT vocabulary is silent.
		expect(
			wrongWay.events,
			`no Loop shot event on the wrong-direction script -- got: ${JSON.stringify(wrongWay.events)}`,
		).toEqual([
			{ type: 'playfield_switch_closed', switch: 's_loop_l_out', tick: 100 },
			{ type: 'playfield_switch_closed', switch: 's_loop_l_in', tick: 110 },
		]);

		const rightWay = runSwitchScript(
			close('s_loop_l_in').at(100).close('s_loop_l_out').at(150).build(),
			{ durationTicks: 200 },
		);
		expect(rightWay.events).toContainEqual({ type: 'shot_left_loop_made', tick: 150 });
	});
});

describe('sim/rules/devices/ -- shots: the Ramp, entryExclusive (AC 2, AC 2 straddle)', () => {
	it('Ramp rejected: s_ramp_enter at t, s_ramp_made never -> exactly one shot_ramp_broken on the tick the window expires; no _made', () => {
		const enterTick = 100;
		const script = close('s_ramp_enter').at(enterTick).build();
		const result = runSwitchScript(script, { durationTicks: enterTick + RAMP_WINDOW_TICKS + 20 });
		expect(result.events).toEqual([
			{ type: 'playfield_switch_closed', switch: 's_ramp_enter', tick: enterTick },
			{ type: 'shot_ramp_broken', tick: enterTick + RAMP_WINDOW_TICKS + 1 },
		]);
	});

	it('window straddle: completing at rampWindowTicks - 1 makes it; completing at rampWindowTicks + 1 breaks it first and the late close starts nothing', () => {
		const enterTick = 100;

		const inWindow = runSwitchScript(
			close('s_ramp_enter').at(enterTick).close('s_ramp_made').at(enterTick + RAMP_WINDOW_TICKS - 1).build(),
			{ durationTicks: enterTick + RAMP_WINDOW_TICKS + 20 },
		);
		expect(inWindow.events).toEqual([
			{ type: 'playfield_switch_closed', switch: 's_ramp_enter', tick: enterTick },
			{ type: 'playfield_switch_closed', switch: 's_ramp_made', tick: enterTick + RAMP_WINDOW_TICKS - 1 },
			{ type: 'shot_ramp_made', tick: enterTick + RAMP_WINDOW_TICKS - 1 },
		]);

		const straddled = runSwitchScript(
			close('s_ramp_enter').at(enterTick).close('s_ramp_made').at(enterTick + RAMP_WINDOW_TICKS + 1).build(),
			{ durationTicks: enterTick + RAMP_WINDOW_TICKS + 20 },
		);
		expect(
			straddled.events,
			'the window expires (shot_ramp_broken) and the late s_ramp_made starts nothing -- no shot_ramp_made anywhere in the run, but both closures still report their own playfield_switch_closed',
		).toEqual([
			{ type: 'playfield_switch_closed', switch: 's_ramp_enter', tick: enterTick },
			{ type: 'playfield_switch_closed', switch: 's_ramp_made', tick: enterTick + RAMP_WINDOW_TICKS + 1 },
			{ type: 'shot_ramp_broken', tick: enterTick + RAMP_WINDOW_TICKS + 1 },
		]);
	});

	it('re-entry restarts the window: a second s_ramp_enter closure BEFORE the first attempt expires completes against the SECOND entry, never a stale _broken from the first', () => {
		const firstEnter = 100;
		// Still within the first attempt's own window (not yet expired) --
		// the ball re-touching the mouth without having completed the shot.
		const secondEnter = firstEnter + RAMP_WINDOW_TICKS - 5;
		// Within the SECOND entry's window, but well past the FIRST entry's
		// own window (proving the anchor genuinely moved, not just that both
		// windows happened to overlap).
		const madeTick = secondEnter + RAMP_WINDOW_TICKS - 5;
		const script = close('s_ramp_enter').at(firstEnter)
			.close('s_ramp_enter').at(secondEnter)
			.close('s_ramp_made').at(madeTick)
			.build();
		const result = runSwitchScript(script, { durationTicks: madeTick + 20 });

		expect(
			result.events,
			`expected exactly one shot_ramp_made at ${madeTick}, measured from the SECOND entry -- got: ${JSON.stringify(result.events)}`,
		).toEqual([
			{ type: 'playfield_switch_closed', switch: 's_ramp_enter', tick: firstEnter },
			{ type: 'playfield_switch_closed', switch: 's_ramp_enter', tick: secondEnter },
			{ type: 'playfield_switch_closed', switch: 's_ramp_made', tick: madeTick },
			{ type: 'shot_ramp_made', tick: madeTick },
		]);
	});
});

describe('sim/rules/devices/ -- DW-133: a bare s_loop_*_in is never, on its own, a Loop entry (AC 3)', () => {
	it('the measured made-Ramp make order (s_ramp_enter, s_ramp_made, s_loop_r_in, s_inlane_r) produces shot_ramp_made and lane_entered, but zero shot_right_loop_made/_broken', () => {
		const script = close('s_ramp_enter').at(100)
			.close('s_ramp_made').at(120)
			.close('s_loop_r_in').at(130)
			.close('s_inlane_r').at(140)
			.build();
		const result = runSwitchScript(script, { durationTicks: 140 + LOOP_WINDOW_TICKS + 20 });

		expect(result.events).toContainEqual({ type: 'shot_ramp_made', tick: 120 });
		expect(result.events).toContainEqual({ type: 'lane_entered', lane: 'inlane_r', tick: 140 });
		expect(
			result.events.filter((e) => e.type === 'shot_right_loop_made' || e.type === 'shot_right_loop_broken'),
			`expected zero shot_right_loop_*, got: ${JSON.stringify(result.events)}`,
		).toEqual([]);
	});

	it('an outlane drain (s_loop_r_in then s_outlane_r then s_drain) produces lane_entered { lane: outlane_r } only -- zero shot_right_loop_*', () => {
		const script = close('s_loop_r_in').at(100).close('s_outlane_r').at(110).close('s_drain').at(120).build();
		const result = runSwitchScript(script, { durationTicks: 120 + LOOP_WINDOW_TICKS + 20 });

		expect(result.events).toEqual([
			{ type: 'playfield_switch_closed', switch: 's_loop_r_in', tick: 100 },
			{ type: 'playfield_switch_closed', switch: 's_outlane_r', tick: 110 },
			{ type: 'lane_entered', lane: 'outlane_r', tick: 110 },
			{ type: 'playfield_switch_closed', switch: 's_drain', tick: 120 },
		]);
	});

	// The THIRD closer of a bare `s_loop_*_in`, and the most frequent one in
	// real play -- absent from `TABLE.shots`'s own comment, the Design Notes
	// and AC 3, all of which enumerate only the outlane drain and the made
	// Ramp. `test/shot-routing.test.ts:562` already asserts in-tree that one
	// ball making the LEFT Loop closes `s_loop_l_in, s_loop_l_out,
	// s_loop_r_out, s_loop_r_in` in approach order: every made Loop is an
	// orbit that ends by closing the OPPOSITE Loop's own entry switch. Driving
	// that measured order through the layer is what proves a single orbit
	// scores once and only for the side actually shot.
	it('the measured Left Loop ORBIT order (s_loop_l_in, s_loop_l_out, s_loop_r_out, s_loop_r_in) scores exactly one shot_left_loop_made and nothing for the right Loop', () => {
		const result = runSwitchScript(
			close('s_loop_l_in').at(100)
				.close('s_loop_l_out').at(200)
				.close('s_loop_r_out').at(240)
				.close('s_loop_r_in').at(280)
				.build(),
			{ durationTicks: 280 + LOOP_WINDOW_TICKS + 50 },
		);
		expect(result.events).toEqual([
			{ type: 'playfield_switch_closed', switch: 's_loop_l_in', tick: 100 },
			{ type: 'playfield_switch_closed', switch: 's_loop_l_out', tick: 200 },
			{ type: 'shot_left_loop_made', tick: 200 },
			{ type: 'playfield_switch_closed', switch: 's_loop_r_out', tick: 240 },
			{ type: 'playfield_switch_closed', switch: 's_loop_r_in', tick: 280 },
		]);
	});

	it('a genuine s_loop_r_in -> s_loop_r_out pair, in the SAME test file, still observes exactly one shot_right_loop_made', () => {
		const script = close('s_loop_r_in').at(100).close('s_loop_r_out').at(150).build();
		const result = runSwitchScript(script, { durationTicks: 200 });
		expect(result.events).toEqual([
			{ type: 'playfield_switch_closed', switch: 's_loop_r_in', tick: 100 },
			{ type: 'playfield_switch_closed', switch: 's_loop_r_out', tick: 150 },
			{ type: 'shot_right_loop_made', tick: 150 },
		]);
	});
});

describe('sim/rules/devices/ -- the DRAGON drop bank (AC 4)', () => {
	function letterSwitch(letter: keyof typeof TABLE.dropBankWiring): SwitchName {
		return TABLE.dropBankWiring[letter].switch;
	}

	/** Extends `builder` with `action` (close/open) on every letter in `letters`, at consecutive ticks starting at `firstTick`. */
	function scriptLetters(
		builder: ReturnType<typeof close>,
		letters: ReadonlyArray<keyof typeof TABLE.dropBankWiring>,
		action: 'close' | 'open',
		firstTick: number,
	): ReturnType<typeof close> {
		let next = builder;
		letters.forEach((letter, index) => {
			next = next[action](letterSwitch(letter)).at(firstTick + index);
		});
		return next;
	}

	it('middle count: three non-adjacent letters (d, g, n) close -> three bank_target_down with their own letter; no bank_completed, no coil command', () => {
		// All three land in the SAME tick's switchEvents array -- not spread
		// across separate ticks -- so a loop that only handles the FIRST
		// matching edge and drops the rest (Story 2.3's own "break after the
		// first match" defect shape) is actually exercised here, not merely
		// invisible behind three single-event ticks.
		const script = close(letterSwitch('d')).at(10)
			.close(letterSwitch('g')).at(10)
			.close(letterSwitch('n')).at(10)
			.build();
		const result = runSwitchScript(script, { durationTicks: 20 });

		expect(result.events).toEqual([
			{ type: 'playfield_switch_closed', switch: letterSwitch('d'), tick: 10 },
			{ type: 'playfield_switch_closed', switch: letterSwitch('g'), tick: 10 },
			{ type: 'playfield_switch_closed', switch: letterSwitch('n'), tick: 10 },
			{ type: 'bank_target_down', letter: 'd', tick: 10 },
			{ type: 'bank_target_down', letter: 'g', tick: 10 },
			{ type: 'bank_target_down', letter: 'n', tick: 10 },
		]);
		expect(result.coilCommands).toEqual([]);
	});

	it('bank completed: the remaining three close -> one bank_target_down each, then exactly one bank_completed and exactly one c_dragon_bank_reset pulse; a further tick with all six still down emits neither again', () => {
		const letters: Array<keyof typeof TABLE.dropBankWiring> = ['d', 'r', 'a', 'g', 'o', 'n'];
		const builder = scriptLetters(close(letterSwitch(letters[0])), letters, 'close', 10);
		// Story 2.3's own QA precedent: redundantly re-close every letter on a
		// LATER tick, ALL AT THE SAME TICK -- "a further tick with all six
		// still down" -- to prove the latch, not merely the absence of a
		// second segment. Each `.close(...).at(50)` pair commits its own
		// step, so all six land on tick 50.
		const script = letters
			.reduce((b, letter) => b.close(letterSwitch(letter)).at(50), builder)
			.build();
		const result = runSwitchScript(script, { durationTicks: 60 });

		const bankTargetDowns = result.events.filter((e) => e.type === 'bank_target_down');
		const bankCompleteds = result.events.filter((e) => e.type === 'bank_completed');
		expect(bankTargetDowns, `expected exactly 6 bank_target_down (never a 7th from the redundant re-close), got: ${JSON.stringify(bankTargetDowns)}`).toHaveLength(6);
		expect(bankCompleteds, `expected exactly one bank_completed, got: ${JSON.stringify(bankCompleteds)}`).toHaveLength(1);
		expect(result.coilCommands).toEqual([{ type: 'coil', coil: 'c_dragon_bank_reset', action: 'pulse', tick: 15 }]);
	});

	it('bank reset absorbed: the six closed:false edges physics emits on reset clear the letters -- no bank_target_down, no second bank_completed; a fresh completion afterward genuinely re-arms it', () => {
		const letters: Array<keyof typeof TABLE.dropBankWiring> = ['d', 'r', 'a', 'g', 'o', 'n'];
		let builder = scriptLetters(close(letterSwitch(letters[0])), letters, 'close', 10);
		builder = scriptLetters(builder, letters, 'open', 30);
		builder = scriptLetters(builder, letters, 'close', 50);
		const result = runSwitchScript(builder.build(), { durationTicks: 60 });

		const bankTargetDowns = result.events.filter((e) => e.type === 'bank_target_down');
		const bankCompleteds = result.events.filter((e) => e.type === 'bank_completed');
		// 6 from the first completion + 6 from the second (post-reset) -- the
		// six OPEN edges themselves must never produce a bank_target_down.
		expect(bankTargetDowns).toHaveLength(12);
		expect(bankCompleteds, 'the reset must genuinely re-arm the latch: a second real completion fires a second bank_completed').toHaveLength(2);
		expect(result.coilCommands).toHaveLength(2);
	});

	it('ball_will_start pulses c_dragon_bank_reset exactly once, whatever the bank state', () => {
		const empty = runSwitchScript([], { durationTicks: 10, lifecycleEvents: [{ type: 'ball_will_start', tick: 5 }] });
		expect(empty.coilCommands).toEqual([{ type: 'coil', coil: 'c_dragon_bank_reset', action: 'pulse', tick: 5 }]);

		const partiallyDown = runSwitchScript(close(letterSwitch('d')).at(3).build(), {
			durationTicks: 10,
			lifecycleEvents: [{ type: 'ball_will_start', tick: 5 }],
		});
		expect(partiallyDown.coilCommands).toEqual([{ type: 'coil', coil: 'c_dragon_bank_reset', action: 'pulse', tick: 5 }]);

		// The state the AC's "whatever the bank state" clause actually exists
		// for, and the one neither case above reaches: all six letters down and
		// the `completed` latch already set. Measured at code review that
		// without this case, guarding onBallWillStart() on the latch left the
		// whole suite green -- and the consequence is not cosmetic: a new ball
		// would begin with six letters down and `bank_completed` already
		// latched, so the DRAGON bank is dead for that entire ball.
		const letters: Array<keyof typeof TABLE.dropBankWiring> = ['d', 'r', 'a', 'g', 'o', 'n'];
		const allDown = runSwitchScript(scriptLetters(close(letterSwitch(letters[0])), letters, 'close', 10).build(), {
			durationTicks: 40,
			lifecycleEvents: [{ type: 'ball_will_start', tick: 30 }],
		});
		expect(allDown.coilCommands, 'the completion pulse at tick 15, then the start-of-ball pulse at tick 30 -- the latch must not suppress the second').toEqual([
			{ type: 'coil', coil: 'c_dragon_bank_reset', action: 'pulse', tick: 15 },
			{ type: 'coil', coil: 'c_dragon_bank_reset', action: 'pulse', tick: 30 },
		]);
	});
});

describe('sim/rules/devices/ -- the spinner (AC 8)', () => {
	it('three make/break pairs on s_spinner in one tick -> exactly one spinner_spin { count: 3 }, the count of closed:true edges', () => {
		const script = close('s_spinner').at(50)
			.open().at(50)
			.close().at(50)
			.open().at(50)
			.close().at(50)
			.open().at(50)
			.build();
		const result = runSwitchScript(script, { durationTicks: 55 });
		expect(result.events).toEqual([
			{ type: 'playfield_switch_closed', switch: 's_spinner', tick: 50 },
			{ type: 'playfield_switch_closed', switch: 's_spinner', tick: 50 },
			{ type: 'playfield_switch_closed', switch: 's_spinner', tick: 50 },
			{ type: 'spinner_spin', count: 3, tick: 50 },
		]);
	});

	it('a tick with no s_spinner edge produces no spinner_spin at all (never a count: 0 event)', () => {
		const result = runSwitchScript(close('s_top_1').at(10).build(), { durationTicks: 15 });
		expect(result.events.some((e) => e.type === 'spinner_spin')).toBe(false);
	});

	it('QA (DW-172 probe): an ASYMMETRIC number of closed:true vs closed:false edges in one tick proves the count is of CLOSED edges specifically, not of open edges nor of all edges', () => {
		// The "three make/break pairs" test above scripts an EQUAL number of
		// closes and opens (3 and 3) -- real spinner physics always emits them
		// that way, one matched pair per completed revolution on the same tick
		// (src/sim/physics/spinner.ts's own applyPostStep()). That symmetry
		// means the test above cannot tell "count of closed:true edges" apart
		// from "count of closed:false edges" -- a sign-flip bug (counting
		// OPENS instead of CLOSES) would report the identical count: 3 and the
		// test would stay green for the wrong reason. Confirmed empirically
		// (QA mutation probe, 2026-09-05): inverting `event.closed` to
		// `!event.closed` in src/sim/rules/devices/index.ts's spinner-counting
		// loop left the test above green. This script closes FOUR times
		// against only TWO opens in the same tick (an unrealistic switch
		// trace physics itself would never emit, but the layer does not
		// validate physical plausibility -- it only counts edges, and this is
		// the scripted shape that discriminates the property AC 8 actually
		// names) so "count opens", "count all edges" (6) and "count closed"
		// (4) are three different numbers, and only one of them is correct.
		const script = close('s_spinner').at(50)
			.open().at(50)
			.close().at(50)
			.open().at(50)
			.close().at(50)
			.close().at(50)
			.build();
		const result = runSwitchScript(script, { durationTicks: 55 });
		expect(result.events).toEqual([
			{ type: 'playfield_switch_closed', switch: 's_spinner', tick: 50 },
			{ type: 'playfield_switch_closed', switch: 's_spinner', tick: 50 },
			{ type: 'playfield_switch_closed', switch: 's_spinner', tick: 50 },
			{ type: 'playfield_switch_closed', switch: 's_spinner', tick: 50 },
			{ type: 'spinner_spin', count: 4, tick: 50 },
		]);
	});
});

describe('sim/rules/devices/ -- the Lock lane, DW-166 (AC 6)', () => {
	it('captured: s_lock_lane closes, a bd_lock slot switch closes within lockCaptureWindowTicks -> one lock_lane_entered, one device_ball_entered', () => {
		const laneTick = 100;
		const captureTick = laneTick + Math.floor(LOCK_CAPTURE_WINDOW_TICKS / 2);
		const script = close('s_lock_lane').at(laneTick).close('s_lock_1').at(captureTick).build();
		const result = runSwitchScript(script, { durationTicks: laneTick + LOCK_CAPTURE_WINDOW_TICKS + 20 });

		expect(result.events).toContainEqual({ type: 'lock_lane_entered', tick: captureTick });
		expect(result.events).toContainEqual({ type: 'device_ball_entered', device: 'bd_lock', slot: 0, tick: captureTick });
		expect(result.events.filter((e) => e.type === 'lock_lane_entered')).toHaveLength(1);
	});

	it('not captured: s_lock_lane closes, no slot switch closes at all, bd_lock not full -> nothing is emitted', () => {
		const script = close('s_lock_lane').at(100).build();
		const result = runSwitchScript(script, { durationTicks: 100 + LOCK_CAPTURE_WINDOW_TICKS + 50 });
		expect(result.events).toEqual([{ type: 'playfield_switch_closed', switch: 's_lock_lane', tick: 100 }]);
	});

	it('window straddle (Rule 19, mirroring AC 2\'s Ramp straddle): a slot closing at EXACTLY lockCaptureWindowTicks is credited; one tick later it is not', () => {
		// The existing "captured" test above drives the slot switch at the
		// window's MIDPOINT, never its edge -- this is the discriminating
		// boundary test the DW-166 capture-resolution gate (src/sim/rules/
		// devices/index.ts) needs, the same shape AC 2's Ramp test already
		// applies to src/sim/rules/devices/shots.ts's own window check.
		const laneTick = 100;

		const atBoundary = runSwitchScript(
			close('s_lock_lane').at(laneTick).close('s_lock_1').at(laneTick + LOCK_CAPTURE_WINDOW_TICKS).build(),
			{ durationTicks: laneTick + LOCK_CAPTURE_WINDOW_TICKS + 20 },
		);
		expect(atBoundary.events).toContainEqual({ type: 'lock_lane_entered', tick: laneTick + LOCK_CAPTURE_WINDOW_TICKS });

		const pastBoundary = runSwitchScript(
			close('s_lock_lane').at(laneTick).close('s_lock_1').at(laneTick + LOCK_CAPTURE_WINDOW_TICKS + 1).build(),
			{ durationTicks: laneTick + LOCK_CAPTURE_WINDOW_TICKS + 20 },
		);
		expect(
			pastBoundary.events.filter((e) => e.type === 'lock_lane_entered'),
			`the closure resolved past the window -- no lock_lane_entered credit, even though the ball still physically parks: ${JSON.stringify(pastBoundary.events)}`,
		).toEqual([]);
		expect(pastBoundary.events).toContainEqual({ type: 'device_ball_entered', device: 'bd_lock', slot: 0, tick: laneTick + LOCK_CAPTURE_WINDOW_TICKS + 1 });
	});

	it('device full: a scripted s_lock_lane closure while all three bd_lock slots are already closed -> one lock_lane_entered immediately', () => {
		const script = close('s_lock_1').at(10)
			.close('s_lock_2').at(11)
			.close('s_lock_3').at(12)
			.close('s_lock_lane').at(100)
			.build();
		const result = runSwitchScript(script, { durationTicks: 120 });

		const lockLaneEntries = result.events.filter((e) => e.type === 'lock_lane_entered');
		expect(lockLaneEntries).toEqual([{ type: 'lock_lane_entered', tick: 100 }]);
	});
});

describe('sim/rules/devices/ -- the remaining bare device/shot events (AC 7)', () => {
	it('Dragon body: s_dragon_body closes -> one dragon_hit', () => {
		const result = runSwitchScript(close('s_dragon_body').at(10).build(), { durationTicks: 15 });
		// dragon_hit is checked BEFORE the Story 2.7 playfield_switch_closed
		// report in Stage 3's own switch statement, so it comes first here.
		expect(result.events).toEqual([
			{ type: 'dragon_hit', tick: 10 },
			{ type: 'playfield_switch_closed', switch: 's_dragon_body', tick: 10 },
		]);
	});

	it('Lane entry: s_top_2 closes -> one lane_entered { lane: top_2 }', () => {
		const result = runSwitchScript(close('s_top_2').at(10).build(), { durationTicks: 15 });
		// Story 2.7: playfield_switch_closed is emitted BEFORE lane_entered for
		// the same switch (task 6's own ordering rule).
		expect(result.events).toEqual([
			{ type: 'playfield_switch_closed', switch: 's_top_2', tick: 10 },
			{ type: 'lane_entered', lane: 'top_2', tick: 10 },
		]);
	});

	// `s_plunger` is `settleClass: 'button'` in TABLE.switches, so the derived
	// button set (DW-149) now includes it and every plunge emits a
	// `button_pressed`. That is a deliberate consequence of deriving the set
	// from the registry rather than hand-listing it, and it is consistent with
	// AD-2 (which names s_plunger as one of the four cabinet buttons) -- but
	// the pre-2.4 test that asserted `s_plunger` produced NOTHING was deleted
	// in this story without a replacement, so the changed behaviour went
	// unpinned at exactly the moment it changed. Pinned here instead.
	it('Plunger: s_plunger is a cabinet button, so its close emits button_pressed and its own open emits button_released (Story 2.12, AD-19 amended: AC 14)', () => {
		const result = runSwitchScript(close('s_plunger').at(10).open().at(20).build(), { durationTicks: 25 });
		expect(result.events).toEqual([
			{ type: 'button_pressed', button: 's_plunger', tick: 10 },
			{ type: 'button_released', button: 's_plunger', tick: 20 },
		]);
	});

	it('Button: s_start closes, then opens -> button_pressed { button: s_start } on the close, button_released { button: s_start } on the open (Story 2.12, AD-19 amended: AC 14)', () => {
		const result = runSwitchScript(close('s_start').at(10).open().at(20).build(), { durationTicks: 25 });
		expect(result.events).toEqual([
			{ type: 'button_pressed', button: 's_start', tick: 10 },
			{ type: 'button_released', button: 's_start', tick: 20 },
		]);
	});

	it('Lane change: s_flipper_r closes -> one lane_change_pressed { side: right } and one button_pressed { button: s_flipper_r }', () => {
		const result = runSwitchScript(close('s_flipper_r').at(10).build(), { durationTicks: 15 });
		expect(result.events).toEqual(
			expect.arrayContaining([
				{ type: 'lane_change_pressed', side: 'right', tick: 10 },
				{ type: 'button_pressed', button: 's_flipper_r', tick: 10 },
			]),
		);
		expect(result.events).toHaveLength(2);
	});

	it('the same for the left flipper button', () => {
		const result = runSwitchScript(close('s_flipper_l').at(10).build(), { durationTicks: 15 });
		expect(result.events).toEqual(
			expect.arrayContaining([
				{ type: 'lane_change_pressed', side: 'left', tick: 10 },
				{ type: 'button_pressed', button: 's_flipper_l', tick: 10 },
			]),
		);
		expect(result.events).toHaveLength(2);
	});

	// Story 2.12 (AD-19, amended 2026-09-11): AC 14 -- the devices layer
	// reports each cabinet button's own RELEASE edge, and only a button's own
	// opening edge does -- a non-button switch's opening edge (s_top_2) adds
	// nothing at all, paired in the SAME test with its own closing edge's
	// positive (playfield_switch_closed + lane_entered), per this story's own
	// anti-vacuity rule (never assert a negative without its positive in the
	// same test).
	it('AC 14: all four buttons report button_released on their own opening edge; a flipper release adds no second lane_change_pressed; a non-button switch (s_top_2) opening edge adds nothing, while its own closing edge still yields playfield_switch_closed and lane_entered', () => {
		const script = [
			...close('s_start').at(10).open().at(20).build(),
			...close('s_plunger').at(10).open().at(20).build(),
			...close('s_flipper_l').at(10).open().at(20).build(),
			...close('s_flipper_r').at(10).open().at(20).build(),
			...close('s_top_2').at(10).open().at(20).build(),
		];
		const result = runSwitchScript(script, { durationTicks: 25 });

		for (const button of ['s_start', 's_plunger', 's_flipper_l', 's_flipper_r'] as const) {
			expect(result.events, `${button} must report button_pressed at 10`).toContainEqual({ type: 'button_pressed', button, tick: 10 });
			expect(result.events, `${button} must report button_released at 20`).toContainEqual({ type: 'button_released', button, tick: 20 });
		}

		// A flipper's release adds no SECOND lane_change_pressed -- exactly one
		// per flipper, from the close only.
		const laneChangeEvents = result.events.filter((e) => e.type === 'lane_change_pressed');
		expect(laneChangeEvents).toHaveLength(2);

		// s_top_2's own CLOSE is the positive: playfield_switch_closed and
		// lane_entered both fire from it.
		expect(result.events).toContainEqual({ type: 'playfield_switch_closed', switch: 's_top_2', tick: 10 });
		expect(result.events).toContainEqual({ type: 'lane_entered', lane: 'top_2', tick: 10 });

		// s_top_2's own OPEN adds nothing at all -- no button_released (it is
		// not a button), no playfield_switch_closed (an opening edge is never
		// one), no lane_entered.
		const atOpenTick = result.events.filter((e) => e.tick === 20 && !(e.type === 'button_released'));
		expect(atOpenTick, 's_top_2 opening at tick 20 must add no event beyond the four buttons\' own button_released above').toEqual([]);
	});
});

// Restores (and widens) the pre-2.4 negative test "a switch that belongs to no
// device produces nothing", which drove only `s_tilt_bob` through the old
// module-level `processSwitchEvents()` and was dropped when this file was
// rewritten onto the DSL. Without it nothing pins the NEGATIVE direction of
// every stage in `sim/rules/devices/index.ts`: a stage that widened its match
// (a lane lookup that fell back to a default, a button test that keyed off
// something other than `settleClass`, a spinner counter that counted any edge)
// would emit for these switches and no other test in this file would notice.
// The sibling positive tests above prove each stage fires; this proves each
// one also STOPS.
//
// Story 2.7 (task 6): `s_sling_l`/`s_sling_r`/`s_pop_1..3`/`s_drain` moved OUT
// of this negative set -- they are genuine PLAYFIELD switches (none of the
// button/tilt/slam/parking-slot/non-parking-entry exclusions apply to them),
// so they now correctly produce exactly one `playfield_switch_closed`.
//
// Story 2.11: `s_tilt_bob`/`s_slam_tilt` also moved OUT -- Stage 3 now emits
// their own `tilt_bob_closed`/`slam_tilt_closed` (task 15, AD-19's
// 2026-09-08 amendment). Their own dedicated describe block, immediately
// below, replaces this one's old "maps to nothing" claim for the two of
// them. That was the last member of this negative set: nothing under this
// file remains genuinely unmapped, so the describe block itself is retired
// here rather than left standing empty (vitest errors on a suite with zero
// `it()`s) -- a future genuinely-unmapped switch should re-introduce it in
// the same shape (`const unmapped: readonly SwitchName[] = [...]`, one `it()`
// per entry via a `for` loop) rather than reaching for something new.

// Story 2.11 (task 15, AC 12): the two cabinet-mechanism switches now emit
// their OWN dedicated device event on the closed edge only -- never on the
// open edge, and never `playfield_switch_closed` either (they stay excluded
// from `PLAYFIELD_SWITCHES` by construction, unchanged by this story -- the
// AC 8 block above must stay green at 28, and does).
describe('sim/rules/devices/ -- Story 2.11: the two cabinet-mechanism switches report their own dedicated event, never playfield_switch_closed', () => {
	it('s_tilt_bob closing produces exactly one tilt_bob_closed; re-opening produces nothing more; no playfield_switch_closed, no coil command either way', () => {
		const result = runSwitchScript(close('s_tilt_bob').at(5).open().at(9).build(), { durationTicks: 15 });
		expect(result.events, 's_tilt_bob must report exactly one tilt_bob_closed, on the close edge, and nothing on the open').toEqual([
			{ type: 'tilt_bob_closed', tick: 5 },
		]);
		expect(result.coilCommands, 's_tilt_bob must issue no coil command').toEqual([]);
	});

	it('s_slam_tilt closing produces exactly one slam_tilt_closed; re-opening produces nothing more; no playfield_switch_closed, no coil command either way', () => {
		const result = runSwitchScript(close('s_slam_tilt').at(5).open().at(9).build(), { durationTicks: 15 });
		expect(result.events, 's_slam_tilt must report exactly one slam_tilt_closed, on the close edge, and nothing on the open').toEqual([
			{ type: 'slam_tilt_closed', tick: 5 },
		]);
		expect(result.coilCommands, 's_slam_tilt must issue no coil command').toEqual([]);
	});
});

// Story 2.11 (task 2, spec I/O matrix "Derivation is structural"): the two
// switch names are resolved ONCE, at module construction, by filtering
// TABLE.switches for each SettleClass and throwing unless exactly one entry
// matches (devices/index.ts's own switchNameForSettleClass(), file-private,
// mirroring cabinet/index.ts's physics-side sibling that sim/rules may not
// import, AD-1). The real, shipped TABLE is single-source -- exactly one
// 'tilt_bob' entry and one 'slam' entry -- so this throw can only be
// observed against a mocked TABLE with a manufactured duplicate. Same
// isolated-module-graph pattern as test/lock-device-behaviour.test.ts's own
// AD-6 boot-invariant throw tests (vi.resetModules() + vi.doMock(
// '../src/sim/table/dragonwar', ...)), never touching the statically
// imported TABLE the rest of this file/suite uses.
describe('sim/rules/devices/ -- Story 2.11: switchNameForSettleClass() throws a named TABLE-authoring error on a non-unique count, at module construction (never degrades silently)', () => {
	it('a TABLE with two settleClass: "tilt_bob" entries throws naming the class and the count, on import -- not on first use', async () => {
		vi.resetModules();
		vi.doMock('../src/sim/table/dragonwar', async (importOriginal) => {
			const actual = await importOriginal<typeof import('../src/sim/table/dragonwar')>();
			return {
				...actual,
				TABLE: {
					...actual.TABLE,
					switches: {
						...actual.TABLE.switches,
						// s_start normally carries settleClass 'button'; mutating it to
						// 'tilt_bob' manufactures a second match beside the real
						// s_tilt_bob, without touching s_tilt_bob itself or the
						// (still-unique) 'slam' class.
						s_start: { ...actual.TABLE.switches.s_start, settleClass: 'tilt_bob' },
					},
				},
			};
		});

		try {
			await expect(import('../src/sim/rules/devices')).rejects.toThrow(
				'sim/rules/devices switchNameForSettleClass() (module load): expected exactly one TABLE.switches entry with settleClass "tilt_bob", found 2',
			);
		} finally {
			vi.doUnmock('../src/sim/table/dragonwar');
			vi.resetModules();
		}
	});
});

// Story 2.7 (task 6, AD-6, AD-19): the switches above that DID map to nothing
// before this story now report the new `playfield_switch_closed` event on
// their own CLOSE edge (never the re-open) and issue no coil command --
// `s_drain` is the notable one: it is closed on every drain and the DW-133
// outlane case above drives it, but only incidentally, so this is its first
// dedicated assertion.
describe('sim/rules/devices/ -- Story 2.7: the derived playfield-switch set reports playfield_switch_closed on close only', () => {
	const playfieldOnly: readonly SwitchName[] = ['s_sling_l', 's_sling_r', 's_pop_1', 's_pop_2', 's_pop_3', 's_drain'];

	for (const name of playfieldOnly) {
		it(`${name} closing produces exactly one playfield_switch_closed; re-opening produces nothing more; no coil command either way`, () => {
			const result = runSwitchScript(close(name).at(5).open().at(9).build(), { durationTicks: 15 });
			expect(result.events, `${name} must report exactly one playfield_switch_closed, on the close edge`).toEqual([
				{ type: 'playfield_switch_closed', switch: name, tick: 5 },
			]);
			expect(result.coilCommands, `${name} must issue no coil command`).toEqual([]);
		});
	}
});

// AC 8: the derived set, judged against an explicit expected list -- never
// trusting the derivation to check itself. 42 switches in TABLE.switches
// (test/table.test.ts's own count) minus the 4 button switches, s_tilt_bob,
// s_slam_tilt, s_shooter_lane (bd_shooter's non-parking entry), bd_trough's
// 4 slots and bd_lock's 3 slots = 14 excluded, 28 remaining.
describe('sim/rules/devices/ -- AC 8: PLAYFIELD_SWITCHES is exactly the 28 genuine playfield switches', () => {
	it('matches an explicit expected list, and excludes every button/tilt/slam/parking-slot/non-parking-entry switch by name', () => {
		const expected: readonly SwitchName[] = [
			's_loop_l_in',
			's_loop_l_out',
			's_loop_r_in',
			's_loop_r_out',
			's_spinner',
			's_ramp_enter',
			's_ramp_made',
			's_dragon_d',
			's_dragon_r',
			's_dragon_a',
			's_dragon_g',
			's_dragon_o',
			's_dragon_n',
			's_dragon_body',
			's_lock_lane',
			's_top_1',
			's_top_2',
			's_top_3',
			's_inlane_l',
			's_inlane_r',
			's_outlane_l',
			's_outlane_r',
			's_sling_l',
			's_sling_r',
			's_pop_1',
			's_pop_2',
			's_pop_3',
			's_drain',
		];

		expect([...PLAYFIELD_SWITCHES].sort()).toEqual([...expected].sort());
		expect(PLAYFIELD_SWITCHES.size, 'sanity: exactly 28 (AC 8)').toBe(28);

		const excluded: readonly SwitchName[] = [
			's_start',
			's_flipper_l',
			's_flipper_r',
			's_plunger',
			's_tilt_bob',
			's_slam_tilt',
			's_shooter_lane',
			's_trough_1',
			's_trough_2',
			's_trough_3',
			's_trough_4',
			's_lock_1',
			's_lock_2',
			's_lock_3',
		];
		for (const name of excluded) {
			expect(PLAYFIELD_SWITCHES.has(name), `${name} must be excluded from PLAYFIELD_SWITCHES`).toBe(false);
		}
		expect(Object.keys(TABLE.switches).length, 'sanity: 28 + 14 excluded = the whole switch set').toBe(
			expected.length + excluded.length,
		);
	});
});

describe('sim/rules/devices/ -- construction: one instance per createDevicesLayer(), never module-global', () => {
	it('two independently-constructed layers do not share state (Story 2.3\'s own spinner defect, guarded against here)', () => {
		const tuning = resolveTuning();
		const layerA = createDevicesLayer(tuning);
		const layerB = createDevicesLayer(tuning);

		// Story 2.7: s_ramp_enter/s_ramp_made are both playfield switches now,
		// so each closure also reports its own playfield_switch_closed --
		// unrelated to the Ramp SHOT sequence this test is actually about,
		// which is what the `shot_ramp_made` absence below still pins.
		const resultA = layerA.step([{ type: 'switch', switch: 's_ramp_enter', closed: true, tick: 1 }], [], 1);
		expect(resultA.events, 'just starts tracking the Ramp sequence -- no shot event yet, but the playfield report fires').toEqual([
			{ type: 'playfield_switch_closed', switch: 's_ramp_enter', tick: 1 },
		]);

		// layerB has never seen s_ramp_enter -- if state leaked between
		// instances, this late s_ramp_made would wrongly complete layerB's own
		// (nonexistent) in-flight sequence.
		const resultB = layerB.step([{ type: 'switch', switch: 's_ramp_made', closed: true, tick: 2 }], [], 2);
		expect(resultB.events, 'layerB must not see layerA\'s in-flight Ramp sequence').toEqual([
			{ type: 'playfield_switch_closed', switch: 's_ramp_made', tick: 2 },
		]);
	});
});

describe('sim/rules/ball-controller.ts -- ballsInPlay accounting (AD-6, unchanged by this story)', () => {
	it('ball_launched increments; a ball parking in a device decrements', () => {
		const launched = applyDeviceEvents(machine(), [{ type: 'ball_launched', tick: 1 }]);
		expect(launched.ballsInPlay).toBe(1);

		const parked = applyDeviceEvents(launched, [{ type: 'device_ball_entered', device: 'bd_trough', slot: 0, tick: 2 }]);
		expect(parked.ballsInPlay).toBe(0);
	});

	it('device_ball_left never changes the count -- only a launch does', () => {
		const before = machine({ ballsInPlay: 1 });
		const after = applyDeviceEvents(before, [{ type: 'device_ball_left', device: 'bd_trough', slot: 3, tick: 1 }]);
		expect(after.ballsInPlay).toBe(1);
		expect(after, 'an unchanged count must return the SAME MachineState object, not a copy').toBe(before);
	});

	it('a ball parking while nothing is in play floors the count at zero, never negative', () => {
		const after = applyDeviceEvents(machine({ ballsInPlay: 0 }), [
			{ type: 'device_ball_entered', device: 'bd_trough', slot: 0, tick: 1 },
		]);
		expect(after.ballsInPlay).toBe(0);

		const drained = applyDeviceEvents(machine({ ballsInPlay: 1 }), [
			{ type: 'device_ball_entered', device: 'bd_trough', slot: 0, tick: 1 },
			{ type: 'device_ball_entered', device: 'bd_trough', slot: 1, tick: 1 },
			{ type: 'device_ball_entered', device: 'bd_trough', slot: 2, tick: 1 },
		]);
		expect(drained.ballsInPlay).toBe(0);
		expect(applyDeviceEvents(drained, [{ type: 'ball_launched', tick: 2 }]).ballsInPlay).toBe(1);
	});
});

// Story 2.12 (DW-187, AC 13): a served ball's own arrival at bd_shooter is
// PAIRED, same batch, against a device_ball_left from the parking device
// that serves into it -- never counted. An UNPAIRED bd_shooter arrival
// (DW-187's own rolled-back-plunge shape) now correctly leaves play.
describe('sim/rules/ball-controller.ts -- DW-187: a served arrival is never counted as a return (AC 13)', () => {
	it('device_ball_left bd_trough + device_ball_entered bd_shooter, in EITHER order, is a served arrival -- same reference, ballsInPlay unchanged', () => {
		const before = machine({ ballsInPlay: 1 });

		const forward = applyDeviceEvents(before, [
			{ type: 'device_ball_left', device: 'bd_trough', slot: 3, tick: 1 },
			{ type: 'device_ball_entered', device: 'bd_shooter', slot: 0, tick: 1 },
		]);
		expect(forward.ballsInPlay).toBe(1);
		expect(forward, 'a served arrival changes nothing -- same MachineState reference').toBe(before);

		const reverse = applyDeviceEvents(before, [
			{ type: 'device_ball_entered', device: 'bd_shooter', slot: 0, tick: 1 },
			{ type: 'device_ball_left', device: 'bd_trough', slot: 3, tick: 1 },
		]);
		expect(reverse.ballsInPlay).toBe(1);
		expect(reverse, 'order within the batch must not matter -- pairing is membership-only').toBe(before);
	});

	it('device_ball_entered bd_shooter ALONE (no device_ball_left in the batch) is an UNPAIRED arrival -- a ball genuinely returning to the lane, floored at 0 like a parking decrement', () => {
		const before = machine({ ballsInPlay: 1 });
		const lone = applyDeviceEvents(before, [{ type: 'device_ball_entered', device: 'bd_shooter', slot: 0, tick: 1 }]);
		expect(lone.ballsInPlay).toBe(0);
		expect(lone, 'a genuine decrement must be a NEW reference').not.toBe(before);
	});

	it('at ballsInPlay 0, the lone (unpaired) arrival floors at 0 and returns the SAME reference', () => {
		const before = machine({ ballsInPlay: 0 });
		const lone = applyDeviceEvents(before, [{ type: 'device_ball_entered', device: 'bd_shooter', slot: 0, tick: 1 }]);
		expect(lone.ballsInPlay).toBe(0);
		expect(lone, 'floored at 0 with no change -- same reference').toBe(before);
	});
});

// Story 2.12 (AD-4, AD-18, AC 2): applyRecovery()'s own reference-sharing
// contract, pinned directly (mirrors applyDeviceEvents' own pinning above,
// build-auto step 4's own review-triage addition -- previously only
// exercised indirectly through integration-level toEqual checks).
describe('sim/rules/ball-controller.ts -- applyRecovery(): the recover-count correction (AC 2)', () => {
	it('recovered: null -- the machine is untouched, and the SAME reference returns', () => {
		const before = machine({ ballsInPlay: 1 });
		const after = applyRecovery(before, null);
		expect(after.ballsInPlay).toBe(1);
		expect(after, 'a null recovered report changes nothing -- same MachineState reference').toBe(before);
	});

	it('recovered: 0 (or any number) with ballsInPlay ALREADY 0 -- still the SAME reference, never a needless copy', () => {
		const before = machine({ ballsInPlay: 0 });
		const after = applyRecovery(before, 0);
		expect(after.ballsInPlay).toBe(0);
		expect(after, 'nothing to correct at ballsInPlay 0 -- same reference').toBe(before);

		const afterNonZeroCount = applyRecovery(before, 3);
		expect(afterNonZeroCount.ballsInPlay).toBe(0);
		expect(afterNonZeroCount, 'the recovered COUNT never matters once ballsInPlay is already 0 -- same reference').toBe(before);
	});

	it('recovered: 0 with ballsInPlay > 0 -- corrects to 0, a NEW reference (count 0 still means "a recover genuinely ran")', () => {
		const before = machine({ ballsInPlay: 1 });
		const after = applyRecovery(before, 0);
		expect(after.ballsInPlay).toBe(0);
		expect(after, 'a genuine correction must be a NEW reference').not.toBe(before);
	});

	it('recovered: 2 with ballsInPlay > 0 -- corrects to 0 regardless of the count\'s own value', () => {
		const before = machine({ ballsInPlay: 1 });
		const after = applyRecovery(before, 2);
		expect(after.ballsInPlay).toBe(0);
		expect(after, 'a genuine correction must be a NEW reference').not.toBe(before);
	});
});

describe('sim/rules/index.ts -- createRules().step() runs on every physics step (AD-4)', () => {
	it('stamps the tick and returns empty presentation commands and empty coilCommands even with NO switch events', () => {
		const rules = createRules(resolveTuning());
		const result = rules.step(state(), [], 42);
		expect(result.state.tick).toBe(42);
		expect(result.events).toEqual([]);
		// `RulesStepResult.commands` (the PRESENTATION-only channel, AD-9's
		// Seam Contracts table) stays `readonly never[]` -- vacuous by its own
		// type, a fact restated at runtime rather than evidence this test
		// exercised (Story 1.8 sweep, vacuity shape 1). Story 2.4 adds a
		// SEPARATE `coilCommands` channel (rules -> physics, never
		// presentation) -- also empty here, but for a REAL reason: no switch
		// event and no lifecycle event reached the devices layer at all, so
		// nothing had cause to pulse a coil.
		expect(result.commands, 'the presentation-only channel: vacuous by readonly never[], not an AD-5 proof by itself').toEqual([]);
		expect(result.coilCommands, 'no switch or lifecycle event reached the layer, so nothing pulsed a coil').toEqual([]);
	});

	it('only ball_launched crosses into FrameOutput.events -- device_ball_entered/_left stay internal', () => {
		const rules = createRules(resolveTuning());
		const slots = TABLE.ballDevices.bd_trough.slots;
		const result = rules.step(
			state(),
			[
				{ type: 'switch', switch: TABLE.ballDevices.bd_shooter.entry, closed: false, tick: 5 },
				{ type: 'switch', switch: slots[0], closed: true, tick: 5 },
			],
			5,
		);

		expect(result.events).toEqual([{ type: 'ball_launched', tick: 5 }]);
		// ...but the internal one still did its accounting work.
		expect(result.state.machine.ballsInPlay).toBe(0); // +1 launched, -1 parked
	});

	it('a bank completion issues exactly one coilCommand through the SEPARATE coilCommands channel, never through commands', () => {
		const rules = createRules(resolveTuning());
		const letters: Array<keyof typeof TABLE.dropBankWiring> = ['d', 'r', 'a', 'g', 'o', 'n'];
		let result = rules.step(state(), [], 0);
		for (const [index, letter] of letters.entries()) {
			result = rules.step(result.state, [{ type: 'switch', switch: TABLE.dropBankWiring[letter].switch, closed: true, tick: index + 1 }], index + 1);
		}
		expect(result.coilCommands).toEqual([{ type: 'coil', coil: 'c_dragon_bank_reset', action: 'pulse', tick: letters.length }]);
		expect(result.commands, 'the presentation-only channel: vacuous by readonly never[], not itself a proof -- the real assertion is result.coilCommands above').toEqual([]);
	});
});
