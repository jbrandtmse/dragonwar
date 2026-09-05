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

import { describe, expect, it } from 'vitest';
import { createDevicesLayer } from '../src/sim/rules/devices';
import { applyDeviceEvents } from '../src/sim/rules/ball-controller';
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
	it('the OPENING of the shooter lane is ball_launched; the closing is not (unchanged from before this story)', () => {
		const launch = runSwitchScript(open('s_shooter_lane').at(7).build(), { durationTicks: 10 });
		expect(launch.events).toEqual([{ type: 'ball_launched', tick: 7 }]);

		const arrival = runSwitchScript(close('s_shooter_lane').at(7).build(), { durationTicks: 10 });
		expect(arrival.events, 'a ball ARRIVING in the shooter lane is not a launch').toEqual([]);
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
		expect(result.events).toEqual([{ type: 'shot_left_loop_made', tick: 100 + LOOP_WINDOW_TICKS - 1 }]);
	});

	it('a Loop taken the wrong way (s_loop_l_out then s_loop_l_in) emits nothing; the same test drives the correct direction and observes shot_left_loop_made', () => {
		const wrongWay = runSwitchScript(
			close('s_loop_l_out').at(100).close('s_loop_l_in').at(110).build(),
			{ durationTicks: 110 + LOOP_WINDOW_TICKS + 5 },
		);
		expect(
			wrongWay.events.filter((e) => e.type === 'shot_left_loop_made' || e.type === 'shot_left_loop_broken'),
			`nothing emitted for shot_left_loop on the wrong-direction script -- got: ${JSON.stringify(wrongWay.events)}`,
		).toEqual([]);

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
		expect(result.events).toEqual([{ type: 'shot_ramp_broken', tick: enterTick + RAMP_WINDOW_TICKS + 1 }]);
	});

	it('window straddle: completing at rampWindowTicks - 1 makes it; completing at rampWindowTicks + 1 breaks it first and the late close starts nothing', () => {
		const enterTick = 100;

		const inWindow = runSwitchScript(
			close('s_ramp_enter').at(enterTick).close('s_ramp_made').at(enterTick + RAMP_WINDOW_TICKS - 1).build(),
			{ durationTicks: enterTick + RAMP_WINDOW_TICKS + 20 },
		);
		expect(inWindow.events).toEqual([{ type: 'shot_ramp_made', tick: enterTick + RAMP_WINDOW_TICKS - 1 }]);

		const straddled = runSwitchScript(
			close('s_ramp_enter').at(enterTick).close('s_ramp_made').at(enterTick + RAMP_WINDOW_TICKS + 1).build(),
			{ durationTicks: enterTick + RAMP_WINDOW_TICKS + 20 },
		);
		expect(
			straddled.events,
			'the window expires (shot_ramp_broken) and the late s_ramp_made starts nothing -- no shot_ramp_made anywhere in the run',
		).toEqual([{ type: 'shot_ramp_broken', tick: enterTick + RAMP_WINDOW_TICKS + 1 }]);
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
		).toEqual([{ type: 'shot_ramp_made', tick: madeTick }]);
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

		expect(result.events).toEqual([{ type: 'lane_entered', lane: 'outlane_r', tick: 110 }]);
	});

	it('a genuine s_loop_r_in -> s_loop_r_out pair, in the SAME test file, still observes exactly one shot_right_loop_made', () => {
		const script = close('s_loop_r_in').at(100).close('s_loop_r_out').at(150).build();
		const result = runSwitchScript(script, { durationTicks: 200 });
		expect(result.events).toEqual([{ type: 'shot_right_loop_made', tick: 150 }]);
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
		expect(result.events).toEqual([{ type: 'spinner_spin', count: 3, tick: 50 }]);
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
		expect(result.events).toEqual([{ type: 'spinner_spin', count: 4, tick: 50 }]);
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
		expect(result.events).toEqual([]);
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
		expect(result.events).toEqual([{ type: 'dragon_hit', tick: 10 }]);
	});

	it('Lane entry: s_top_2 closes -> one lane_entered { lane: top_2 }', () => {
		const result = runSwitchScript(close('s_top_2').at(10).build(), { durationTicks: 15 });
		expect(result.events).toEqual([{ type: 'lane_entered', lane: 'top_2', tick: 10 }]);
	});

	it('Button: s_start closes, then opens -> one button_pressed { button: s_start } on the close only', () => {
		const result = runSwitchScript(close('s_start').at(10).open().at(20).build(), { durationTicks: 25 });
		expect(result.events).toEqual([{ type: 'button_pressed', button: 's_start', tick: 10 }]);
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
});

describe('sim/rules/devices/ -- construction: one instance per createDevicesLayer(), never module-global', () => {
	it('two independently-constructed layers do not share state (Story 2.3\'s own spinner defect, guarded against here)', () => {
		const tuning = resolveTuning();
		const layerA = createDevicesLayer(tuning);
		const layerB = createDevicesLayer(tuning);

		const resultA = layerA.step([{ type: 'switch', switch: 's_ramp_enter', closed: true, tick: 1 }], [], 1);
		expect(resultA.events).toEqual([]); // just starts tracking, no event yet

		// layerB has never seen s_ramp_enter -- if state leaked between
		// instances, this late s_ramp_made would wrongly complete layerB's own
		// (nonexistent) in-flight sequence.
		const resultB = layerB.step([{ type: 'switch', switch: 's_ramp_made', closed: true, tick: 2 }], [], 2);
		expect(resultB.events, 'layerB must not see layerA\'s in-flight Ramp sequence').toEqual([]);
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
