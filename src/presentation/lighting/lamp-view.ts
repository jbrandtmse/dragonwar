// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.8 -- the lamp channel's own pure composition layer, mirroring
// `presentation/backglass/frame.ts`'s `advanceBackglass()`: one function
// folds a `FrameOutput` into the next view, kept presentation-side so it is
// unit-testable with no Babylon scene at all (`test/lighting-grammar.test.ts`
// exercises the latest-wins fold rule this file implements).
//
// `FrameOutput.commands` may carry more than one `LampCommand` for the SAME
// lamp within a single frame (the I/O matrix's own "two changes to one lamp
// in one frame" row -- `sim/loop/index.ts` accumulates every tick's diff
// across the whole frame, and a lamp can change twice across two ticks of
// one 16-tick frame): `commands` is append-order == tick order, so folding
// left-to-right and overwriting on every match is what makes the LAST
// command per lamp the one that lands (AC 4, "the later one is the state
// that lands").

import type { FrameOutput, LampCommand, LampName } from '../../sim/table/names';
import { LAMP_ROLES, type LampProjectionEntry } from '../../sim/contracts/commands';
import { TABLE } from '../../sim/table/dragonwar';

/** The presentation-held view of every lamp `syncLamps()` has ever heard about -- a lamp `advanceLamps()` has never seen a command for is simply absent (`Partial`), never defaulted to `off` here; `lamp-driver.ts` is what resolves an absent entry, since it alone knows every `TABLE.lamps` key. */
export type LampView = Partial<Record<LampName, LampProjectionEntry>>;

/**
 * The view a fresh boot (or a fresh test) starts from: nothing heard yet.
 *
 * Frozen (code review pass 3): this is a SHARED exported object, and
 * `src/host/boot.ts` re-seeds `lampView` from it on every reset path, so a
 * single in-place write anywhere would poison every subsequent reset and
 * every test that starts from it. `advanceLamps()` below already copies
 * before its first write -- and `test/lighting-grammar.test.ts` asserts that
 * copy-on-write by reference equality, which makes the shared identity
 * load-bearing rather than incidental -- so freezing costs nothing today and
 * turns a future in-place write into a throw instead of silent corruption.
 */
export const INITIAL_LAMP_VIEW: LampView = Object.freeze({});

function isLampCommand(command: FrameOutput['commands'][number]): command is LampCommand {
	return command.type === 'lamp';
}

/**
 * Folds every `type === 'lamp'` command in `output.commands`, IN ARRAY
 * ORDER (tick order), into the next `LampView` -- the last command for a
 * given lamp within this one frame overwrites any earlier one (AC 4). Pure:
 * same inputs, same output, no Babylon and no clock of its own.
 */
export function advanceLamps(view: LampView, output: FrameOutput): LampView {
	let next: LampView = view;
	for (const command of output.commands) {
		if (!isLampCommand(command)) {
			continue;
		}
		if (next === view) {
			next = { ...view };
		}
		next[command.lamp] = { role: command.role, step: command.step };
	}
	return next;
}

/**
 * Story 5.2 (DW-271) -- the dev hatch's pure overlay: `override`'s entries
 * laid over `view`, every other lamp exactly as `view` has it. `null` returns
 * `view` itself (the same reference), so the production path allocates
 * nothing and `syncLamps()` sees exactly what it saw before the hatch
 * existed. Presentation-only view state: it never reaches `sim/`, and
 * `src/host/boot.ts`'s `setLampOverride()` hatch (dev-only, console-only) is
 * its one caller -- the lead's lever for lighting any insert through the REAL
 * `LampDriver` in the browser check.
 */
export function overlayLampView(view: LampView, override: LampView | null): LampView {
	if (override === null) {
		return view;
	}
	return { ...view, ...override };
}

/**
 * Story 5.2: why a `setLampOverride()` argument (`src/host/boot.ts`'s dev
 * hatch) is unusable, or `null` when it is fine. Pure, so the I/O matrix's
 * "Bad override" row is testable without a browser. Every key must be a
 * `TABLE.lamps` name, and every value a `{ role, step }` with a role from the
 * closed `LAMP_ROLES` set and a step in 0..3 -- anything else would reach
 * `syncLamps()` as a lamp it cannot resolve or a grammar lookup it cannot
 * answer.
 */
export function lampOverrideProblem(override: unknown): string | null {
	if (override === null) {
		return null;
	}
	if (typeof override !== 'object' || Array.isArray(override)) {
		return `expected an object of { lampName: { role, step } } or null, got ${Array.isArray(override) ? 'an array' : typeof override}`;
	}
	for (const [name, entry] of Object.entries(override as Record<string, unknown>)) {
		if (!Object.prototype.hasOwnProperty.call(TABLE.lamps, name)) {
			return `"${name}" is not a TABLE.lamps insert`;
		}
		const { role, step } = (entry ?? {}) as { role?: unknown; step?: unknown };
		if (typeof entry !== 'object' || entry === null || !(LAMP_ROLES as readonly unknown[]).includes(role) || !(step === 0 || step === 1 || step === 2 || step === 3)) {
			return `${name}: expected { role: one of ${LAMP_ROLES.join('/')}, step: 0..3 }, got ${JSON.stringify(entry)}`;
		}
	}
	return null;
}

/**
 * Story 5.2 (code review): the `setLampOverride()` hatch's whole store rule,
 * pure so the I/O matrix's "Bad override" row -- "logs an error and keeps its
 * previous override" -- is testable without a browser. A bad `requested`
 * keeps `previous` and names the problem (the hatch logs it); `null` clears;
 * a good one is stored as a frozen COPY, entry by entry, so a console caller
 * mutating its own object afterwards can never slip an unvalidated role or
 * step past `lampOverrideProblem()` into `syncLamps()`.
 */
export function nextLampOverride(previous: LampView | null, requested: unknown): { override: LampView | null; problem: string | null } {
	const problem = lampOverrideProblem(requested);
	if (problem !== null) {
		return { override: previous, problem };
	}
	if (requested === null) {
		return { override: null, problem: null };
	}
	const copy: LampView = {};
	for (const [name, entry] of Object.entries(requested as Record<LampName, LampProjectionEntry>)) {
		copy[name as LampName] = Object.freeze({ role: entry.role, step: entry.step });
	}
	return { override: Object.freeze(copy), problem: null };
}
