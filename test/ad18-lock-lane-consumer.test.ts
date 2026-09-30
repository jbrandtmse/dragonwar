// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.2 (AD-18, AC 1): the Lock arbiter
// (`src/sim/rules/ball-controller/lock-arbiter.ts`) is the ONLY consumer of
// `lock_lane_entered`. Three instruments pin it, each paired with a control
// that proves it can see what it looks for:
// - the import edge: `tools/dependency-cruiser.config.mjs`'s
//   `lock-lane-entered-only-arbiter` rule (pinned by
//   `test/boundary-lint.test.ts`'s `lock-lane-leak` fixture and by the
//   repository-as-committed lint run there);
// - the quoted event name: the source scan below, which pins every file
//   under `src/**` that spells `'lock_lane_entered'` and how many times;
// - the delivery: the mode stack's fan-out, observed through a logging
//   wrapper around the production base mode (below), never receives the
//   event, while it does receive the same tick's `device_ball_entered`.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { listFilesRecursive } from './util/list-files';
import { close, runRulesScript } from './util/switch-script';
import { resolveTuning, shotWindowTicks } from '../src/sim/table/tuning';
import type { ModeDefinition } from '../src/sim/rules/modes';
import type { GameState } from '../src/sim/table/names';

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(REPO_ROOT, 'src');

/** A single- or double-quoted `lock_lane_entered` -- the event name as code spells it. Backticks are prose in this codebase's comments and are not counted. */
const QUOTED_EVENT = /(['"])lock_lane_entered\1/g;

function countQuoted(text: string): number {
	return (text.match(QUOTED_EVENT) ?? []).length;
}

/**
 * The sanctioned spellings: the devices layer's two emits (the captured and
 * the full-device entry), the type's own discriminant, and the arbiter's one
 * type guard. Any new file, or a new spelling in one of these, reddens the
 * scan and must be argued for.
 */
const SANCTIONED: Readonly<Record<string, number>> = {
	'src/sim/rules/ball-controller/lock-arbiter.ts': 1,
	'src/sim/rules/devices/index.ts': 2,
	'src/sim/rules/devices/lock-lane-event.ts': 1,
};

describe('Story 3.2 -- AC 1: the quoted lock_lane_entered appears only in the sanctioned files', () => {
	it('control: the scan counts a quoted spelling on a code line and ignores a backticked or bare mention', () => {
		expect(countQuoted("if (event.type === 'lock_lane_entered') {")).toBe(1);
		expect(countQuoted('const name = "lock_lane_entered";')).toBe(1);
		expect(countQuoted('// the arbiter consumes `lock_lane_entered` -- lock_lane_entered alone')).toBe(0);
	});

	it('every .ts file under src/** that spells it, and how often, is exactly the sanctioned set', () => {
		const found: Record<string, number> = {};
		const files = listFilesRecursive(SRC_ROOT).filter((file) => file.endsWith('.ts'));
		expect(files.length, 'sanity: the scan must genuinely see the source tree').toBeGreaterThan(100);
		for (const file of files) {
			const count = countQuoted(readFileSync(file, 'utf8'));
			if (count > 0) {
				found[path.relative(REPO_ROOT, file).split(path.sep).join('/')] = count;
			}
		}
		expect(found).toEqual(SANCTIONED);
	});
});

// ---------------------------------------------------------------------------
// The delivery log: the production base mode, wrapped to log every event
// type it receives, stands in as the stack's recipient. `createRules()`
// builds its own stack, so the stack's factory is wrapped (the rest of the
// modes barrel is the real module).
// ---------------------------------------------------------------------------

const delivered = vi.hoisted(() => ({ types: [] as string[] }));

vi.mock('../src/sim/rules/modes', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/sim/rules/modes')>();
	return {
		...actual,
		createModeStack: (tuning: Parameters<typeof actual.createModeStack>[0], definitions?: readonly ModeDefinition[]) => {
			if (definitions !== undefined) {
				return actual.createModeStack(tuning, definitions);
			}
			const [base, ...rest] = actual.createProductionModeDefinitions(tuning);
			const logged: ModeDefinition = {
				...base!,
				onEvent: (state, entry, event, tick) => {
					delivered.types.push(event.type);
					return base!.onEvent(state, entry, event, tick);
				},
			};
			return actual.createModeStack(tuning, [logged, ...rest]);
		},
	};
});

function capturingState(): GameState {
	return {
		tick: 0,
		phase: 'game',
		machine: {
			ballsInPlay: 1,
			hardwareEnabled: true,
			ballSave: { untilTick: null, sources: [] },
			tilt: { tilted: false, slamTilted: false },
			multiball: null,
			highscores: [],
			deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] },
		},
		players: [
			{
				score: 0,
				letters: '',
				lockCredits: 0,
				tiltWarnings: 0,
				bonus: { byCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1 },
				lanes: { lit: {}, completedSets: [] },
				extraBalls: 0,
				jackpotSeed: 0,
				warsStarted: 0,
				modesPlayed: [],
				modesLit: [],
				ballNumber: 1,
			},
		],
		currentPlayer: 0,
		modes: [{ mode: 'base', priority: 100, player: 0 }],
		rng: 0,
	};
}

describe('Story 3.2 -- AC 1: no mode ever receives lock_lane_entered; the arbiter decides every entry', () => {
	it('a captured entry reaches the base mode as device_ball_entered but never as lock_lane_entered, and yields exactly one lock_lane_* outcome', () => {
		delivered.types.length = 0;
		const window = shotWindowTicks('lockCaptureWindowMs', resolveTuning());
		const t = 300;
		const script = close('s_lock_lane').at(t - Math.floor(window / 2)).close('s_lock_1').at(t).build();
		const result = runRulesScript(script, { durationTicks: t + 5, initialState: capturingState() });

		const outcomes = result.events.filter((event) => event.type === 'lock_lane_locked' || event.type === 'lock_lane_spit');
		expect(outcomes, 'the arbiter consumed the entry: exactly one outcome').toEqual([{ type: 'lock_lane_locked', player: 0, credits: 1, tick: t }]);
		expect(delivered.types, 'positive: the logged mode genuinely received the capture tick\'s batch').toContain('device_ball_entered');
		expect(delivered.types, 'the mode stack never delivers lock_lane_entered').not.toContain('lock_lane_entered');
	});
});
