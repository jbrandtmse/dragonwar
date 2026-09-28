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
import type { LampProjectionEntry } from '../../sim/contracts/commands';

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
