// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.8 (AC 3, and the pure half of AC 4): `presentation/lighting/grammar.ts`
// (the one `(role, step)` -> RGB/intensity/cadence table) and
// `presentation/lighting/lamp-view.ts`'s `advanceLamps()` fold -- both pure,
// Babylon-free, so no scene is needed here at all (the `raster.ts` tier).

import { describe, expect, it } from 'vitest';
import { LAMP_GRAMMAR, isLampOnAt, lookupGrammar } from '../src/presentation/lighting/grammar';
import { INITIAL_LAMP_VIEW, advanceLamps } from '../src/presentation/lighting/lamp-view';
import { LAMP_ROLES } from '../src/sim/contracts';
import { buildSnapshot } from './util/snapshot-factory';
import type { LampRole, LampStep } from '../src/sim/contracts/commands';
import type { FrameOutput, LampName } from '../src/sim/table/names';

// Code review pass 2 (DW-149): DERIVED from the runtime closure this story
// introduced, never a second hand-typed role list. Re-typing it meant an
// eighth role added to `LAMP_ROLES` and `LAMP_GRAMMAR` together would have
// got zero coverage from the six `it.each(LIT_ROLES)` step-ladder blocks
// below, while line 31's own `LAMP_ROLES.filter(...)` assertion (in the same
// file) already derived correctly.
const LIT_ROLES: readonly Exclude<LampRole, 'off'>[] = LAMP_ROLES.filter((role): role is Exclude<LampRole, 'off'> => role !== 'off');

describe('LAMP_GRAMMAR -- PRD FR-44\'s held (role -> colour) mapping, pinned exactly', () => {
	it('pins every non-off role to its exact authored RGB triple', () => {
		expect(LAMP_GRAMMAR).toEqual({
			lit: { r: 1, g: 1, b: 1 },
			hurryup: { r: 1, g: 0, b: 0 },
			quickmb: { r: 0, g: 1, b: 0 },
			joust: { r: 0, g: 0, b: 1 },
			dragon: { r: 1, g: 0.5, b: 0 },
			special: { r: 0.6, g: 0, b: 1 },
		});
	});

	it('LAMP_GRAMMAR has an entry for every role except off (AD-9\'s seven-member set, minus one)', () => {
		expect(Object.keys(LAMP_GRAMMAR).sort()).toEqual(LAMP_ROLES.filter((role) => role !== 'off').sort());
	});
});

describe('lookupGrammar -- off at any step, and step 0 for any role, is all-zero, no blink', () => {
	it.each(LAMP_ROLES)('role "%s" at step 0 is intensity 0, no blink, all-zero RGB', (role) => {
		const entry = lookupGrammar(role, 0);
		expect(entry).toEqual({ r: 0, g: 0, b: 0, intensity: 0, blinkPeriodMs: null });
	});

	it.each([0, 1, 2, 3] as const)('role "off" at step %i is intensity 0, no blink, all-zero RGB', (step) => {
		const entry = lookupGrammar('off', step);
		expect(entry).toEqual({ r: 0, g: 0, b: 0, intensity: 0, blinkPeriodMs: null });
	});
});

describe('lookupGrammar -- steps 1/2/3 for a lit role', () => {
	it.each(LIT_ROLES)('role "%s" step 1: intensity 1.0, no blink, colour from LAMP_GRAMMAR', (role) => {
		const entry = lookupGrammar(role, 1);
		expect(entry).toEqual({ ...LAMP_GRAMMAR[role], intensity: 1.0, blinkPeriodMs: null });
	});

	it.each(LIT_ROLES)('role "%s" step 2: intensity 1.4, 500 ms blink, colour from LAMP_GRAMMAR', (role) => {
		const entry = lookupGrammar(role, 2);
		expect(entry).toEqual({ ...LAMP_GRAMMAR[role], intensity: 1.4, blinkPeriodMs: 500 });
	});

	it.each(LIT_ROLES)('role "%s" step 3: intensity 1.8, 160 ms blink, colour from LAMP_GRAMMAR', (role) => {
		const entry = lookupGrammar(role, 3);
		expect(entry).toEqual({ ...LAMP_GRAMMAR[role], intensity: 1.8, blinkPeriodMs: 160 });
	});

	it.each(LIT_ROLES)('role "%s": intensity is strictly increasing 1 -> 2 -> 3 (AC 3)', (role) => {
		const step1 = lookupGrammar(role, 1).intensity;
		const step2 = lookupGrammar(role, 2).intensity;
		const step3 = lookupGrammar(role, 3).intensity;
		expect(step1).toBeLessThan(step2);
		expect(step2).toBeLessThan(step3);
	});

	it.each(LIT_ROLES)('role "%s": blink period is strictly decreasing (faster) 1 -> 2 -> 3, none -> 500 -> 160', (role) => {
		const step1 = lookupGrammar(role, 1).blinkPeriodMs;
		const step2 = lookupGrammar(role, 2).blinkPeriodMs;
		const step3 = lookupGrammar(role, 3).blinkPeriodMs;
		expect(step1).toBeNull();
		expect(step2).toBe(500);
		expect(step3).toBe(160);
		expect(step3!).toBeLessThan(step2!);
	});
});

describe('isLampOnAt -- blinking, timed entirely in presentation', () => {
	it('a steady grammar entry (blinkPeriodMs: null) is always on, at any nowMs', () => {
		expect(isLampOnAt(null, 0)).toBe(true);
		expect(isLampOnAt(null, 123456)).toBe(true);
	});

	it('true in the first half of the period, false in the second, for a real period', () => {
		expect(isLampOnAt(500, 0)).toBe(true);
		expect(isLampOnAt(500, 249)).toBe(true);
		expect(isLampOnAt(500, 250)).toBe(false);
		expect(isLampOnAt(500, 499)).toBe(false);
	});

	it('wraps correctly across multiple periods', () => {
		expect(isLampOnAt(160, 160)).toBe(true); // start of the 2nd period
		expect(isLampOnAt(160, 159)).toBe(false); // end of the 1st period
		expect(isLampOnAt(160, 320 + 79)).toBe(true);
		expect(isLampOnAt(160, 320 + 80)).toBe(false);
	});
});

function lampCommand(lamp: LampName, role: LampRole, step: LampStep, tick: number) {
	return { type: 'lamp' as const, lamp, role, step, tick };
}

function frameOutputWith(commands: readonly ReturnType<typeof lampCommand>[]): FrameOutput {
	return {
		snapshot: buildSnapshot(),
		events: [],
		contactEvents: [],
		commands,
	};
}

describe('advanceLamps -- folds a frame\'s LampCommands, last-per-lamp wins (AC 4)', () => {
	it('one command for a lamp lands in the view', () => {
		const output = frameOutputWith([lampCommand('l_top_1', 'lit', 1, 10)]);
		const view = advanceLamps(INITIAL_LAMP_VIEW, output);
		expect(view.l_top_1).toEqual({ role: 'lit', step: 1 });
	});

	it('two commands for the SAME lamp within one frame: the LATER one (last in array order) wins', () => {
		const output = frameOutputWith([
			lampCommand('l_top_1', 'lit', 1, 10),
			lampCommand('l_top_1', 'lit', 2, 11),
		]);
		const view = advanceLamps(INITIAL_LAMP_VIEW, output);
		expect(view.l_top_1).toEqual({ role: 'lit', step: 2 });
	});

	it('commands for different lamps in one frame each land independently', () => {
		const output = frameOutputWith([
			lampCommand('l_top_1', 'lit', 2, 10),
			lampCommand('l_top_2', 'off', 0, 10),
		]);
		const view = advanceLamps(INITIAL_LAMP_VIEW, output);
		expect(view.l_top_1).toEqual({ role: 'lit', step: 2 });
		expect(view.l_top_2).toEqual({ role: 'off', step: 0 });
	});

	it('a frame with no lamp commands leaves the view unchanged (reference-equal, an idle frame allocates nothing)', () => {
		const seeded = advanceLamps(INITIAL_LAMP_VIEW, frameOutputWith([lampCommand('l_top_1', 'lit', 1, 1)]));
		const next = advanceLamps(seeded, frameOutputWith([]));
		expect(next).toBe(seeded);
	});

	it('a lamp never named by any command is simply absent from the view (never defaulted to off here)', () => {
		const view = advanceLamps(INITIAL_LAMP_VIEW, frameOutputWith([lampCommand('l_top_1', 'lit', 1, 1)]));
		expect(view.l_top_2).toBeUndefined();
	});

	it('non-lamp commands (gi/flasher/show) in the same frame are ignored', () => {
		const output: FrameOutput = frameOutputWith([lampCommand('l_top_1', 'lit', 1, 1)]);
		const withOther: FrameOutput = { ...output, commands: [...output.commands, { type: 'gi' as const, channel: 'gi_backbox' as const, level: 0.5, tick: 1 }] };
		const view = advanceLamps(INITIAL_LAMP_VIEW, withOther);
		expect(view.l_top_1).toEqual({ role: 'lit', step: 1 });
		expect(Object.keys(view)).toEqual(['l_top_1']);
	});
});
