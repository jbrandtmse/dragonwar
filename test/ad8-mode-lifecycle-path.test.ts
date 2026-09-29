// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (AD-8, AC2): a mode starts and stops ONLY through
// `src/sim/rules/modes/lifecycle.ts`. A source-level ratchet over every file
// under `src/sim/rules/**` (recursively): outside `modes/lifecycle.ts`, no
// line may build or assign a `modes` list literal (`modes:` or `modes =`
// followed by `[`) or call an array method that adds or removes an entry, or
// copies the list with one added or removed, on `.modes` (`filter`, `splice`,
// `push`, `concat`, `slice`, `toSpliced`, `unshift`, `pop`, `shift`, `with`,
// `flatMap`). A mode updating its OWN entry's fields through
// `.modes.map(` is allowed: it neither adds nor removes one. The sanctioned
// writer is pinned by count, like `test/ad8-score-write-path.test.ts`. The
// scan does not skip comments, so no comment may spell those shapes either.
// Kept out of the headless `test/rules-*.test.ts` set because it reads the
// filesystem (`test/rules-devices-headless.test.ts`).

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AD-8 (Story 3.1): no file under src/sim/rules/** adds or removes a modes[] entry except modes/lifecycle.ts', () => {
	const RULES_DIR = path.resolve(__dirname, '..', 'src', 'sim', 'rules');
	const MODE_LIST_WRITE = /\bmodes\s*[:=]\s*\[|\.modes\.(?:filter|splice|push|concat|slice|toSpliced|unshift|pop|shift|with|flatMap)\(/;
	/** Lines of `source` holding a mode-list write. */
	const writeLines = (source: string): number => source.split('\n').filter((line) => MODE_LIST_WRITE.test(line)).length;
	/** The sanctioned writer, by file (POSIX path under `src/sim/rules`) and exact line count: the start's push and the stop's removal. */
	const SANCTIONED: Readonly<Record<string, number>> = { 'modes/lifecycle.ts': 2 };

	it('no file under src/sim/rules/** holds a mode-list write beyond the sanctioned ones', () => {
		const files = (readdirSync(RULES_DIR, { recursive: true }) as string[]).map((f) => f.split(path.sep).join('/')).filter((f) => f.endsWith('.ts'));
		expect(files, 'sanity: the scan reaches the modes and ball-controller subdirectories').toEqual(
			expect.arrayContaining(['modes/base.ts', 'modes/skill-shot.ts', 'modes/lifecycle.ts', 'ball-controller/ball-end.ts', 'ball-controller/shared.ts', 'tilt.ts']),
		);
		const hits = Object.fromEntries(files.map((f) => [f, writeLines(readFileSync(path.join(RULES_DIR, f), 'utf8'))] as const).filter(([, n]) => n > 0));
		expect(hits).toEqual(SANCTIONED);
	});

	it('control: the pattern flags each add/remove shape and passes a field update and a read', () => {
		const count = writeLines;
		expect(count('nextState = { ...nextState, players: playersAfterTeardown, modes: [] };'), 'the Epic 2 ball-end teardown').toBe(1);
		expect(count("return { ...state, players, modes: [...state.modes, activeMode] };"), 'the Epic 2 base start').toBe(1);
		expect(count('const modes = nextState.modes.filter((_mode, index) => index !== activeIndex);'), 'the Epic 2 skill-shot removal').toBe(1);
		expect(count('state.modes.push(entry);')).toBe(1);
		expect(count('state.modes.splice(0, 1);')).toBe(1);
		expect(count('let modes = [];'), 'an assignment').toBe(1);
		expect(count('next.modes = [entry];'), 'a member assignment').toBe(1);
		expect(count('const modes = state.modes.concat([entry]);')).toBe(1);
		expect(count('const modes = state.modes.slice(1);')).toBe(1);
		expect(count('const modes = state.modes.toSpliced(0, 1);')).toBe(1);
		expect(count('state.modes.unshift(entry);')).toBe(1);
		expect(count('state.modes.pop();')).toBe(1);
		expect(count('state.modes.shift();')).toBe(1);
		expect(count('const modes = state.modes.with(0, entry);')).toBe(1);
		expect(count('const modes = state.modes.flatMap((mode) => (mode === entry ? [] : [mode]));')).toBe(1);
		expect(count('if (modes === [] || modes == []) {'), 'a comparison is not an assignment').toBe(0);
		expect(count('const modes = state.modes.map((mode) => (mode === entry ? { ...mode, launched: true } : mode));'), 'a mode updating its own entry').toBe(0);
		expect(count('const active = state.modes.find((mode) => mode.mode === name);'), 'a read').toBe(0);
	});
});
