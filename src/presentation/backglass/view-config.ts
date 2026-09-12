// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.13 (AD-1, AD-14, AD-16): the host -> presentation seam for the
// Attract keys screen. `ViewConfig` names no key code and no `KeyboardEvent`
// shape of its own -- `bindings` is keyed on `InputAction` (`sim/contracts/
// input`, the same closed vocabulary `InputFrame` already uses) and each
// value is a plain `readonly string[]` of `KeyboardEvent.code` strings,
// carried as opaque data. `src/host/input/index.ts`'s `viewConfigFromKeyMap()`
// is the one place that builds a real instance, inverting its own `KEY_MAP`
// (the one place a key code is spelled out, AD-4) into this shape; this file
// itself names no code and no action->code binding of its own. `presentation/
// backglass/frame.ts`'s `keyLabel()` formats each code into display text --
// this file carries the data only, never the formatting rule.

import type { InputAction } from '../../sim/contracts/input';

/**
 * The Attract keys screen's own input: each `InputAction` maps to zero or
 * more `KeyboardEvent.code` strings, in the order `viewConfigFromKeyMap()`
 * discovers them (map order) -- `Partial` because an action with no bound
 * code (a future action `KEY_MAP` has not yet bound) renders its row with no
 * key label at all, never a placeholder.
 */
export interface ViewConfig {
	readonly bindings: Readonly<Partial<Record<InputAction, readonly string[]>>>;
}

/** `renderFrame()`'s own default (Design Notes, "No ViewConfig" I/O row): every keys row carries its action label only, with no code appended. */
export const EMPTY_VIEW_CONFIG: ViewConfig = { bindings: {} };
