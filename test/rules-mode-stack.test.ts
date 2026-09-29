// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (AD-8): the generalised mode stack, headless -- the registry
// (AC1), the lifecycle order (AC2), the event-major fan-out and accrual
// with stub modes (AC3), the per-tick hook under a higher mode (AC4), the
// no-coil wrap (AC6) and the lamp composition (AC3). The source scan that
// pins "no other path writes `modes[]`" (AC2) reads the filesystem, so it
// lives outside this headless set, in `test/ad8-mode-lifecycle-path.test.ts`
// (the `test/ad8-score-write-path.test.ts` precedent). The Slam, ball-end,
// event-major and Integration rows drive a whole `createRules()` in
// `test/rules-mode-stack-integration.test.ts`.
//
// Expected values come from `resolveTuning()`, `MODE_PRIORITIES` and
// `nextRngInt()`, never from the value under test.

import { describe, expect, it } from 'vitest';
import { lampsOf } from '../src/sim/rules/lamps';
import {
	BASE_MODE_PRIORITY,
	createModeRegistry,
	createModeStack,
	createProductionModeDefinitions,
	MODE_LAMP_ROLES,
	MODE_PRIORITIES,
	SKILL_SHOT_MODE_PRIORITY,
	startModes,
	stopAllModes,
	stopModes,
	type ModeDefinition,
	type ModeEvent,
	type ModeHookResult,
	type ModeName,
} from '../src/sim/rules/modes';
import { awardScore } from '../src/sim/rules/scoring';
import { renderFrame, INITIAL_BACKGLASS_VIEW } from '../src/presentation/backglass/frame';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning } from '../src/sim/table/tuning';
import { BASE_GAME_STATE, buildPlayer, buildSnapshot } from './util/snapshot-factory';
import type { DeviceEvent } from '../src/sim/rules/devices';
import type { ActiveModeState } from '../src/sim/contracts/state';
import type { CoilCommand, CoilName, GameState, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();

/** What each stub mode pays per device event, through `awardScore()` -- a test constant, not a tunable. */
const STUB_AWARD = 10;

function gameState(modes: GameState['modes'], overrides: Partial<GameState> = {}): GameState {
	return {
		...BASE_GAME_STATE,
		tick: 0,
		phase: 'game',
		players: [buildPlayer({ score: 0, ballNumber: 1 })],
		currentPlayer: 0,
		modes,
		...overrides,
	};
}

function entry(mode: string, player = 0, fields: Record<string, unknown> = {}): ActiveModeState {
	return { mode, priority: (MODE_PRIORITIES as Readonly<Record<string, number>>)[mode] ?? 100, player, ...fields };
}

/** A stub mode at its table priority: logs each delivery and pays `STUB_AWARD` through `awardScore()`. */
function stubMode(name: ModeName, log: string[], extra: Partial<ModeDefinition> = {}): ModeDefinition {
	return {
		name,
		priority: MODE_PRIORITIES[name],
		onEvent: (state, active) => {
			log.push(name);
			return { state: awardScore(state, active.player, STUB_AWARD) };
		},
		...extra,
	};
}

/** The production base mode with its `onEvent` wrapped to log each delivery. */
function loggedBase(log: string[]): ModeDefinition {
	const [base] = createProductionModeDefinitions(TUNING);
	return {
		...base!,
		onEvent: (state, active, event, tick) => {
			log.push('base');
			return base!.onEvent(state, active, event, tick);
		},
	};
}

function types(events: readonly ModeEvent[]): string[] {
	return events.map((event) => event.type);
}

function triple(mode: string, kind: 'start' | 'stop'): string[] {
	return kind === 'start'
		? [`mode_${mode}_will_start`, `mode_${mode}_starting`, `mode_${mode}_started`]
		: [`mode_${mode}_will_stop`, `mode_${mode}_stopping`, `mode_${mode}_stopped`];
}

// ---------------------------------------------------------------------------
// AC1 -- priorities come only from MODE_PRIORITIES; duplicates throw at load.
// ---------------------------------------------------------------------------

describe('AC1 -- the registry: one priority table, and a duplicate name or priority throws at construction naming both modes', () => {
	it('the table is AD-8\'s, and both Epic 2 priorities are read from it', () => {
		expect(MODE_PRIORITIES).toEqual({ base: 100, skill_shot: 200, hurryup: 300, joust: 310, quickmb: 400, war: 500 });
		expect(BASE_MODE_PRIORITY).toBe(MODE_PRIORITIES.base);
		expect(SKILL_SHOT_MODE_PRIORITY).toBe(MODE_PRIORITIES.skill_shot);
		const production = createModeStack(TUNING).registry.definitions.map((definition) => [definition.name, definition.priority]);
		expect(production, 'the production registry, descending priority').toEqual([
			['skill_shot', MODE_PRIORITIES.skill_shot],
			['base', MODE_PRIORITIES.base],
		]);
	});

	it('Matrix row "Duplicate registration": [joust@310, joust@310] throws, naming both', () => {
		const log: string[] = [];
		expect(() => createModeRegistry([stubMode('joust', log), stubMode('joust', log)])).toThrow(/joust@310 and joust@310/);
	});

	it('Matrix row "Duplicate registration": two definitions at priority 300 throw, naming both modes and the value', () => {
		const log: string[] = [];
		const clash: ModeDefinition = { ...stubMode('joust', log), priority: 300 };
		expect(() => createModeRegistry([stubMode('hurryup', log), clash])).toThrow(/duplicate priority 300 -- hurryup@300 and joust@300/);
	});

	it('positive: distinct names and priorities build, and the registry resolves each by name', () => {
		const log: string[] = [];
		const registry = createModeRegistry([stubMode('hurryup', log), stubMode('joust', log)]);
		expect(registry.definitions.map((definition) => definition.name)).toEqual(['joust', 'hurryup']);
		expect(registry.get('hurryup')?.priority).toBe(MODE_PRIORITIES.hurryup);
		expect(registry.get('stub'), 'an unregistered fixture name resolves to nothing').toBeUndefined();
	});

	it('the stack enforces the table: a stub whose priority is not its name\'s entry throws; the same stub at its table priority builds', () => {
		const log: string[] = [];
		const offTable: ModeDefinition = { ...stubMode('joust', log), priority: 300 };
		expect(() => createModeStack(TUNING, [offTable])).toThrow(/joust@300 does not match MODE_PRIORITIES \(joust: 310\)/);
		expect(() => createModeStack(TUNING, [stubMode('joust', log)])).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// AC2 -- the lifecycle: exactly the three events per mode, in order.
// ---------------------------------------------------------------------------

describe('AC2 -- startModes()/stopModes(): three events per mode, ascending to start and descending to stop, hooks at their phases', () => {
	function probe(name: ModeName, seen: string[]): ModeDefinition {
		const present = (state: GameState): boolean => state.modes.some((active) => active.mode === name);
		return {
			name,
			priority: MODE_PRIORITIES[name],
			onStart: (state) => {
				seen.push(`${name}.onStart present=${present(state)}`);
				return { timerTicks: 100 };
			},
			onStarting: (state) => {
				seen.push(`${name}.onStarting present=${present(state)}`);
				return state;
			},
			onEvent: (state) => ({ state }),
			onStopping: (state) => {
				seen.push(`${name}.onStopping present=${present(state)}`);
				return state;
			},
			onStopped: (state) => {
				seen.push(`${name}.onStopped present=${present(state)}`);
				return state;
			},
		};
	}

	it('start: will_start (no entry yet), starting (entry pushed, onStarting runs), started -- ascending priority, all three per mode before the next', () => {
		const seen: string[] = [];
		const joust = probe('joust', seen);
		const hurryup = probe('hurryup', seen);
		const result = startModes(gameState([]), [joust, hurryup], 0, 7);

		expect(types(result.events)).toEqual([...triple('hurryup', 'start'), ...triple('joust', 'start')]);
		expect(result.events.every((event) => 'mode' in event && event.player === 0 && event.tick === 7)).toBe(true);
		expect(seen).toEqual([
			'hurryup.onStart present=false',
			'hurryup.onStarting present=true',
			'joust.onStart present=false',
			'joust.onStarting present=true',
		]);
		expect(result.state.modes, 'entries pushed in start order, onStart\'s fields merged').toEqual([
			{ mode: 'hurryup', priority: MODE_PRIORITIES.hurryup, player: 0, timerTicks: 100 },
			{ mode: 'joust', priority: MODE_PRIORITIES.joust, player: 0, timerTicks: 100 },
		]);
	});

	it('stop: will_stop (entry present), stopping (onStopping runs, entry present), stopped (entry removed, onStopped runs) -- descending priority', () => {
		const seen: string[] = [];
		const registry = createModeRegistry([probe('hurryup', seen), probe('joust', seen)]);
		const state = gameState([entry('hurryup'), entry('joust')]);
		const result = stopModes(state, state.modes, 9, registry);

		expect(types(result.events)).toEqual([...triple('joust', 'stop'), ...triple('hurryup', 'stop')]);
		expect(seen).toEqual([
			'joust.onStopping present=true',
			'joust.onStopped present=false',
			'hurryup.onStopping present=true',
			'hurryup.onStopped present=false',
		]);
		expect(result.state.modes).toEqual([]);
	});

	it('stop: an onStopping hook that replaces its own entry with an updated copy -- the copy is what gets removed, and onStopped sees it gone', () => {
		const seen: string[] = [];
		const replacing: ModeDefinition = {
			...probe('hurryup', seen),
			onStopping: (state, active) => ({ ...state, modes: state.modes.map((m) => (m === active ? { ...m, timerTicks: 0 } : m)) }),
		};
		const state = gameState([entry('hurryup', 0, { timerTicks: 5 })]);
		const result = stopModes(state, state.modes, 9, createModeRegistry([replacing]));

		expect(types(result.events)).toEqual(triple('hurryup', 'stop'));
		expect(result.state.modes, 'the replaced copy is removed too').toEqual([]);
		expect(seen).toEqual(['hurryup.onStopped present=false']);
	});

	it('starting a mode already active for that player is a no-op (same state reference, no events); the same name for ANOTHER player still starts', () => {
		const seen: string[] = [];
		const hurryup = probe('hurryup', seen);
		const state = gameState([entry('hurryup', 0)], { players: [buildPlayer({ score: 0, ballNumber: 1 }), buildPlayer({ score: 0, ballNumber: 1 })] });

		const again = startModes(state, [hurryup], 0, 3);
		expect(again.state).toBe(state);
		expect(again.events).toEqual([]);

		const otherPlayer = startModes(state, [hurryup], 1, 3);
		expect(types(otherPlayer.events)).toEqual(triple('hurryup', 'start'));
		expect(otherPlayer.state.modes).toHaveLength(2);
	});

	it('an entry with no registered definition (the `stub` fixture) is stopped with the same three events and no hooks', () => {
		const registry = createModeRegistry([]);
		const state = gameState([{ mode: 'stub', priority: 100, player: 0 }]);
		const result = stopAllModes(state, 4, registry);
		expect(result.events).toEqual([
			{ type: 'mode_stub_will_stop', mode: 'stub', player: 0, tick: 4 },
			{ type: 'mode_stub_stopping', mode: 'stub', player: 0, tick: 4 },
			{ type: 'mode_stub_stopped', mode: 'stub', player: 0, tick: 4 },
		]);
		expect(result.state.modes).toEqual([]);
	});

	it('stopping nothing returns the same state and no events', () => {
		const state = gameState([entry('base')]);
		const result = stopModes(state, [], 1, createModeRegistry([]));
		expect(result.state).toBe(state);
		expect(result.events).toEqual([]);
	});

	it('self-resolution: a launched skill shot missed by a pop returns stop and the stack stops it through the lifecycle (its stop triple); the base mode still pays the pop', () => {
		const stack = createModeStack(TUNING);
		const popSwitch = Object.values(TABLE.popWiring)[0]!.switch as SwitchName;
		const state = gameState([entry('base'), entry('skill_shot', 0, { launched: true })]);
		const result = stack.step(state, [{ type: 'playfield_switch_closed', switch: popSwitch, tick: 3 }], [], 3);

		expect(types(result.events)).toEqual(triple('skill_shot', 'stop'));
		expect(result.state.modes).toEqual([entry('base')]);
		expect(result.state.players[0]!.score, 'the pop still pays through the base mode').toBe(TUNING.popScore.value);
	});

	it('ball start: a ball_starting in the lifecycle input starts base then skill_shot for currentPlayer in the same step, AFTER the fan-out', () => {
		const log: string[] = [];
		const stack = createModeStack(TUNING, [loggedBase(log), ...createProductionModeDefinitions(TUNING).slice(1)]);
		const state = gameState([], { currentPlayer: 0 });
		const spin: DeviceEvent = { type: 'spinner_spin', count: 1, tick: 2 };
		const result = stack.step(state, [spin], [{ type: 'ball_starting', tick: 2 }], 2);

		expect(types(result.events)).toEqual([...triple('base', 'start'), ...triple('skill_shot', 'start')]);
		expect(result.state.modes.map((active) => [active.mode, active.player])).toEqual([
			['base', 0],
			['skill_shot', 0],
		]);
		expect(log, 'the new modes receive no device event on their start tick').toEqual([]);
		expect(result.state.players[0]!.score, 'so the same-tick spin pays nothing').toBe(0);
	});
});

// ---------------------------------------------------------------------------
// AC3 -- event-major fan-out, accrual, lamps by priority.
// ---------------------------------------------------------------------------

describe('AC3 -- two stub modes and the base mode: highest priority first, event-major, every award accrues through scoring.ts', () => {
	it('Matrix row "Stub stack order": one spinner_spin is delivered [quickmb, hurryup, base]; both stubs pay STUB_AWARD and base pays spinnerScore', () => {
		const log: string[] = [];
		const stack = createModeStack(TUNING, [loggedBase(log), stubMode('hurryup', log), stubMode('quickmb', log)]);
		const state = gameState([entry('base'), entry('hurryup'), entry('quickmb')]);
		const result = stack.step(state, [{ type: 'spinner_spin', count: 1, tick: 1 }], [], 1);

		expect(log).toEqual(['quickmb', 'hurryup', 'base']);
		expect(result.state.players[0]!.score).toBe(STUB_AWARD + STUB_AWARD + TUNING.spinnerScore.value);
	});

	it('event-major: two events on one tick are each offered to every mode before the next -- [quickmb, hurryup, base] twice, not each mode\'s batch in turn', () => {
		const log: string[] = [];
		const stack = createModeStack(TUNING, [loggedBase(log), stubMode('hurryup', log), stubMode('quickmb', log)]);
		const state = gameState([entry('base'), entry('hurryup'), entry('quickmb')]);
		stack.step(state, [{ type: 'spinner_spin', count: 1, tick: 1 }, { type: 'bank_completed', tick: 1 }], [], 1);
		expect(log).toEqual(['quickmb', 'hurryup', 'base', 'quickmb', 'hurryup', 'base']);
	});

	it('a mode stopped by event k receives none of events k+1..; a mode with no definition receives nothing', () => {
		const log: string[] = [];
		const stopper = stubMode('quickmb', log, {
			onEvent: (state) => {
				log.push('quickmb');
				return { state, stop: true };
			},
		});
		const stack = createModeStack(TUNING, [stubMode('hurryup', log), stopper]);
		const state = gameState([entry('hurryup'), entry('quickmb'), { mode: 'stub', priority: 100, player: 0 }]);
		const result = stack.step(state, [{ type: 'bank_completed', tick: 1 }, { type: 'bank_completed', tick: 1 }], [], 1);
		expect(log).toEqual(['quickmb', 'hurryup', 'hurryup']);
		expect(result.state.modes.map((active) => active.mode)).toEqual(['hurryup', 'stub']);
		expect(types(result.events)).toEqual(triple('quickmb', 'stop'));
	});

	it('a mode started by event k receives events k+1.. and not k: quickmb starts hurryup on the first spinner_spin, and hurryup receives only the second', () => {
		const log: string[] = [];
		const hurryup: ModeDefinition = {
			name: 'hurryup',
			priority: MODE_PRIORITIES.hurryup,
			onEvent: (state, _active, event) => {
				log.push(`hurryup:${event.type === 'spinner_spin' ? event.count : event.type}`);
				return { state };
			},
		};
		const quickmb: ModeDefinition = {
			name: 'quickmb',
			priority: MODE_PRIORITIES.quickmb,
			onEvent: (state, active, event, tick) => {
				log.push(`quickmb:${event.type === 'spinner_spin' ? event.count : event.type}`);
				if (state.modes.some((m) => m.mode === 'hurryup')) {
					return { state };
				}
				const started = startModes(state, [hurryup], active.player, tick);
				return { state: started.state, events: started.events };
			},
		};
		const stack = createModeStack(TUNING, [hurryup, quickmb]);
		const result = stack.step(gameState([entry('quickmb')]), [
			{ type: 'spinner_spin', count: 1, tick: 1 },
			{ type: 'spinner_spin', count: 2, tick: 1 },
		], [], 1);

		expect(log).toEqual(['quickmb:1', 'quickmb:2', 'hurryup:2']);
		expect(types(result.events)).toEqual(triple('hurryup', 'start'));
		expect(result.state.modes.map((m) => m.mode)).toEqual(['quickmb', 'hurryup']);
	});

	it('MODE_LAMP_ROLES (what lampsOf() composes) is each production definition\'s own lamps hook, and names only production modes', () => {
		const production = createProductionModeDefinitions(TUNING);
		const withLamps = production.filter((definition) => definition.lamps !== undefined);
		expect(withLamps.map((definition) => definition.name), 'sanity: both production modes carry a lamps hook').toEqual(['base', 'skill_shot']);
		for (const definition of withLamps) {
			expect(MODE_LAMP_ROLES[definition.name], `${definition.name}: the table entry is the definition's own hook`).toBe(definition.lamps);
		}
		expect(
			Object.keys(MODE_LAMP_ROLES).sort(),
			'the table names exactly the production definitions that carry a lamps hook -- no extra key, none missing',
		).toEqual(withLamps.map((definition) => definition.name).sort());
	});

	it('lamps: a lit Top lane is lit/2 with the skill shot on the stack (higher priority wins over base\'s lit/1); base alone gives lit/1', () => {
		const lit = { top_1: true, inlane_l: true };
		const withShot = gameState([entry('base'), entry('skill_shot', 0, { launched: false })], {
			players: [{ ...buildPlayer({ score: 0, ballNumber: 1 }), lanes: { lit, completedSets: [] } }],
		});
		expect(lampsOf(withShot).l_top_1).toEqual({ role: 'lit', step: 2 });
		expect(lampsOf(withShot).l_inlane_l, 'the skill shot contributes Top lanes only').toEqual({ role: 'lit', step: 1 });

		const baseOnly = { ...withShot, modes: [entry('base')] };
		expect(lampsOf(baseOnly).l_top_1).toEqual({ role: 'lit', step: 1 });
	});

	it('lamps: the order of modes[] does not matter -- composition is by priority, not by list position', () => {
		const lit = { top_1: true };
		const reversed = gameState([entry('skill_shot', 0, { launched: false }), entry('base')], {
			players: [{ ...buildPlayer({ score: 0, ballNumber: 1 }), lanes: { lit, completedSets: [] } }],
		});
		expect(lampsOf(reversed).l_top_1).toEqual({ role: 'lit', step: 2 });
	});
});

// ---------------------------------------------------------------------------
// AC4 -- a timer under a higher mode keeps ticking.
// ---------------------------------------------------------------------------

describe('AC4 -- a mode\'s per-tick hook runs under a higher-priority mode', () => {
	/** A `tick` hook that logs `tick:<name>` and, when the entry carries `timerTicks`, decrements it by one. */
	function loggedTick(name: ModeName, log: string[], result: Partial<ModeHookResult> = {}): NonNullable<ModeDefinition['tick']> {
		return (state, active): ModeHookResult => {
			log.push(`tick:${name}`);
			const modes = state.modes.map((m) => (m === active && typeof m.timerTicks === 'number' ? { ...m, timerTicks: m.timerTicks - 1 } : m));
			return { ...result, state: { ...state, modes } };
		};
	}

	it('Matrix row "Timer under a higher mode": both tick hooks run every step, quickmb@400 before hurryup@300; hurryup\'s timer falls by exactly 1 per step, 100 -> 95; the Backglass shows quickmb\'s view', () => {
		const log: string[] = [];
		const hurryup = stubMode('hurryup', log, { tick: loggedTick('hurryup', log) });
		const quickmb = stubMode('quickmb', log, { tick: loggedTick('quickmb', log) });
		const stack = createModeStack(TUNING, [hurryup, quickmb]);

		let state = gameState([entry('hurryup', 0, { timerTicks: 100 }), entry('quickmb', 0, { value: 7 })]);
		const timerAfterStep: unknown[] = [];
		for (let tick = 1; tick <= 5; tick++) {
			log.length = 0;
			state = stack.step(state, [], [], tick).state;
			expect(log, `step ${tick}: both hooks ran, descending priority`).toEqual(['tick:quickmb', 'tick:hurryup']);
			timerAfterStep.push(state.modes.find((active) => active.mode === 'hurryup')?.timerTicks);
		}

		expect(timerAfterStep, 'exactly one tick per step').toEqual([99, 98, 97, 96, 95]);
		const frame = renderFrame({ ...INITIAL_BACKGLASS_VIEW, screen: 'score' }, buildSnapshot({ game: state }));
		expect(frame.rows.map((row) => row.text), 'quickmb (400) owns the fields line: its value, not hurryup\'s timer').toEqual(['0', 'BALL 1', '7']);
	});

	it('the tick hooks run before the step\'s first device event is delivered', () => {
		const log: string[] = [];
		const stack = createModeStack(TUNING, [
			stubMode('hurryup', log, { tick: loggedTick('hurryup', log) }),
			stubMode('quickmb', log, { tick: loggedTick('quickmb', log) }),
		]);
		const state = gameState([entry('hurryup', 0, { timerTicks: 100 }), entry('quickmb')]);
		stack.step(state, [{ type: 'spinner_spin', count: 1, tick: 1 }], [], 1);
		expect(log).toEqual(['tick:quickmb', 'tick:hurryup', 'quickmb', 'hurryup']);
	});

	it('a tick hook returning stop: true stops that mode through the lifecycle (its stop triple), and it receives none of the step\'s device events; the mode below still ticks and receives them', () => {
		const log: string[] = [];
		const stack = createModeStack(TUNING, [
			stubMode('hurryup', log, { tick: loggedTick('hurryup', log) }),
			stubMode('quickmb', log, { tick: loggedTick('quickmb', log, { stop: true }) }),
		]);
		const state = gameState([entry('hurryup', 0, { timerTicks: 100 }), entry('quickmb')]);
		const result = stack.step(state, [{ type: 'spinner_spin', count: 1, tick: 1 }], [], 1);

		expect(types(result.events)).toEqual(triple('quickmb', 'stop'));
		expect(log).toEqual(['tick:quickmb', 'tick:hurryup', 'hurryup']);
		expect(result.state.modes.map((active) => active.mode)).toEqual(['hurryup']);
		expect(result.state.players[0]!.score, 'only hurryup paid').toBe(STUB_AWARD);
	});

	it('a timer running out: the tick hook replaces its own entry (timerTicks 1 -> 0) AND returns stop: true -- the stack finds the replaced copy, stops it through the lifecycle, and it receives no device event', () => {
		const log: string[] = [];
		const expire: NonNullable<ModeDefinition['tick']> = (state, active) => ({
			state: { ...state, modes: state.modes.map((m) => (m === active ? { ...m, timerTicks: 0 } : m)) },
			stop: true,
		});
		const stack = createModeStack(TUNING, [stubMode('hurryup', log, { tick: expire })]);
		const result = stack.step(gameState([entry('hurryup', 0, { timerTicks: 1 })]), [{ type: 'spinner_spin', count: 1, tick: 1 }], [], 1);

		expect(types(result.events)).toEqual(triple('hurryup', 'stop'));
		expect(result.state.modes).toEqual([]);
		expect(log, 'stopped before the event, so it receives none').toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// AC6 -- no mode hook ever outputs a coil.
// ---------------------------------------------------------------------------

/** `true` if `value` holds, at any depth, an object with `type: 'coil'`. */
function containsCoil(value: unknown, seen = new Set<unknown>()): boolean {
	if (value === null || typeof value !== 'object' || seen.has(value)) {
		return false;
	}
	seen.add(value);
	if ((value as { type?: unknown }).type === 'coil') {
		return true;
	}
	return Object.values(value as Record<string, unknown>).some((child) => containsCoil(child, seen));
}

const HOOKS = ['onStart', 'onStarting', 'tick', 'onEvent', 'onStopping', 'onStopped', 'lamps'] as const;

function wrapHooks(definition: ModeDefinition, outputs: unknown[], called: Set<string>): ModeDefinition {
	const wrapped: Record<string, unknown> = { ...definition };
	for (const key of HOOKS) {
		const hook = definition[key] as ((...args: unknown[]) => unknown) | undefined;
		if (typeof hook === 'function') {
			wrapped[key] = (...args: unknown[]) => {
				const out = hook(...args);
				outputs.push(out);
				called.add(`${definition.name}.${key}`);
				return out;
			};
		}
	}
	return wrapped as unknown as ModeDefinition;
}

/** One instance of every `DeviceEvent` type (the Record forces every non-shot type at compile time), plus a made and a broken event for every declared shot. */
function everyDeviceEvent(tick: number): DeviceEvent[] {
	const popSwitch = Object.values(TABLE.popWiring)[0]!.switch as SwitchName;
	const topSwitch = TABLE.laneWiring.top_1.switch as SwitchName;
	type NonShotType = Exclude<DeviceEvent['type'], `${string}_made` | `${string}_broken`>;
	const byType: Record<NonShotType, DeviceEvent> = {
		ball_launched: { type: 'ball_launched', tick },
		device_ball_left: { type: 'device_ball_left', device: 'bd_trough', slot: 0, tick },
		bank_target_down: { type: 'bank_target_down', letter: 'd', tick },
		bank_completed: { type: 'bank_completed', tick },
		dragon_hit: { type: 'dragon_hit', tick },
		tilt_bob_closed: { type: 'tilt_bob_closed', tick },
		slam_tilt_closed: { type: 'slam_tilt_closed', tick },
		lock_lane_entered: { type: 'lock_lane_entered', tick },
		spinner_spin: { type: 'spinner_spin', count: 2, tick },
		lane_entered: { type: 'lane_entered', lane: 'top_1', tick },
		lane_change_pressed: { type: 'lane_change_pressed', side: 'right', tick },
		button_pressed: { type: 'button_pressed', button: 's_start' as SwitchName, tick },
		button_released: { type: 'button_released', button: 's_start' as SwitchName, tick },
		playfield_switch_closed: { type: 'playfield_switch_closed', switch: popSwitch, tick },
		device_ball_entered: { type: 'device_ball_entered', device: 'bd_trough', slot: 3, tick },
	};
	const shots = (Object.keys(TABLE.shots) as string[]).flatMap((shot) => [
		{ type: `${shot}_made`, tick } as DeviceEvent,
		{ type: `${shot}_broken`, tick } as DeviceEvent,
	]);
	// The skill shot resolves on its first playfield closure after launch --
	// a lit-lane hit first, so its award path runs, then every other type.
	const hit: DeviceEvent = { type: 'playfield_switch_closed', switch: topSwitch, tick };
	return [byType.ball_launched, hit, ...Object.values(byType), ...shots];
}

describe('AC6 -- every registered mode, wrapped: no hook output holds a coil, and the types admit none', () => {
	it('driving start, every DeviceEvent type, the lamps and the stop through the production modes yields no { type: "coil" } anywhere in any hook output', () => {
		const outputs: unknown[] = [];
		const called = new Set<string>();
		const definitions = createProductionModeDefinitions(TUNING).map((definition) => wrapHooks(definition, outputs, called));
		const stack = createModeStack(TUNING, definitions);

		let state = gameState([], { players: [{ ...buildPlayer({ score: 0, ballNumber: 1 }), lanes: { lit: {}, completedSets: [] } }] });
		state = stack.step(state, [], [{ type: 'ball_starting', tick: 1 }], 1).state;
		// Light top_1 so the skill shot's hit path runs on the scripted closure.
		state = { ...state, players: state.players.map((p) => ({ ...p, lanes: { ...p.lanes, lit: { top_1: true } } })) };
		let tick = 2;
		for (const event of everyDeviceEvent(tick)) {
			state = stack.step(state, [{ ...event, tick } as DeviceEvent], [], tick).state;
			for (const active of state.modes) {
				stack.registry.get(active.mode)?.lamps?.(state, active);
			}
			tick += 1;
		}
		const stopped = stopAllModes(state, tick, stack.registry);

		expect(stopped.state.modes, 'the stop genuinely ran').toEqual([]);
		for (const hook of ['base.onStarting', 'base.onEvent', 'base.lamps', 'skill_shot.onStart', 'skill_shot.onStarting', 'skill_shot.onEvent', 'skill_shot.lamps']) {
			expect(called.has(hook), `positive: ${hook} genuinely ran and was recorded`).toBe(true);
		}
		expect(outputs.length).toBeGreaterThan(20);
		expect(containsCoil(outputs), 'no hook output may hold an object with type "coil" (AD-8)').toBe(false);
	});

	it('control: the scan finds a coil planted anywhere in a hook output', () => {
		expect(containsCoil([{ state: {}, events: [{ type: 'coil', coil: 'c_x', action: 'pulse', tick: 1 }] }])).toBe(true);
		expect(containsCoil([{ state: { modes: [] }, events: [{ type: 'lanes_completed', set: 'top', tick: 1 }] }])).toBe(false);
	});

	it('every DeviceEvent type offered to a live skill shot, from a fresh entry each time (launched false, then launched true): no hook output holds a coil', () => {
		const outputs: unknown[] = [];
		const called = new Set<string>();
		let offered = 0;
		const definitions = createProductionModeDefinitions(TUNING).map((definition) => {
			const wrapped = wrapHooks(definition, outputs, called);
			if (definition.name !== 'skill_shot') {
				return wrapped;
			}
			return {
				...wrapped,
				onEvent: (...args: Parameters<ModeDefinition['onEvent']>): ModeHookResult => {
					offered += 1;
					return wrapped.onEvent(...args);
				},
			};
		});
		const stack = createModeStack(TUNING, definitions);
		const events = everyDeviceEvent(1);

		for (const launched of [false, true]) {
			events.forEach((event, index) => {
				const tick = index + 1;
				const fresh = gameState([], { tick, players: [{ ...buildPlayer({ score: 0, ballNumber: 1 }), lanes: { lit: {}, completedSets: [] } }] });
				const started = stack.step(fresh, [], [{ type: 'ball_starting', tick }], tick).state;
				const live: GameState = {
					...started,
					players: started.players.map((p) => ({ ...p, lanes: { ...p.lanes, lit: { ...p.lanes.lit, top_1: true } } })),
					modes: started.modes.map((m) => (m.mode === 'skill_shot' ? { ...m, launched } : m)),
				};
				stack.step(live, [{ ...event, tick } as DeviceEvent], [], tick);
			});
		}

		expect(offered, 'positive: the skill shot was offered every event, in both passes').toBe(2 * events.length);
		expect(containsCoil(outputs), 'no hook output may hold an object with type "coil" (AD-8)').toBe(false);
	});

	// The pin here is the two `@ts-expect-error` lines, enforced by `pnpm
	// typecheck` (vitest's esbuild transform strips types and never sees
	// them): if either assignment ever compiled, the directive would be
	// reported unused. There is no runtime assertion to make.
	it('type level: a CoilCommand is assignable to neither ModeEvent nor a hook result (pinned by pnpm typecheck)', () => {
		const coil: CoilCommand = { type: 'coil', coil: TABLE.ballDevices.bd_trough.ejectCoil as CoilName, action: 'pulse', tick: 1 };
		// @ts-expect-error -- AD-8: the mode event channel admits no CoilCommand.
		const asModeEvent: ModeEvent = coil;
		void asModeEvent;
		// @ts-expect-error -- a hook result has no coil channel.
		const asResult: ModeHookResult = { state: gameState([]), coilCommands: [coil] };
		void asResult;
	});
});
