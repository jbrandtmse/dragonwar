// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1a (DW-105): `LoadedFlipper` hoisted out of `loader/index.ts` into
// this leaf module, re-exported from `loader/index.ts` unchanged so every
// existing import path (`from '../loader'`) keeps working. The hoist exists
// to break one edge of a real dependency cycle dependency-cruiser's own
// `no-circular` rule previously could not see: `flipper/flipper-config.ts`
// imported `LoadedFlipper` from `loader/index.ts`, which imports
// `game/player-physics.ts`, which imports the FROZEN port
// `flipper/flipper-mover.ts`, which imports back from
// `flipper/flipper-config.ts` -- a cycle spanning two authored files and two
// frozen ports. `flipper-config.ts` now imports `LoadedFlipper` from HERE
// instead, so it no longer imports `loader/index.ts` at all, and the cycle
// has no edge left to close on. See `tools/dependency-cruiser.config.mjs`'s
// `no-circular` rule, narrowed alongside this hoist to treat every authored
// physics file as a cycle origin instead of exempting the whole directory.

import type { Vec3 } from '../../table/frames';

/**
 * A flipper node's derived pivot/tip/length/half-width/z-range (Story 1.6,
 * task 8b; reconciled by Story 2.1a, DW-78): `col_flipper_l`/`col_flipper_r`
 * are surfaced here instead of being dispatched to `addBox()` -- a moving
 * bat must not ALSO exist as 24 static `HitTriangle`s (that static box is
 * ledger `DW-60`). See `loader/index.ts`'s header, "How the bat is derived
 * from the committed box" in this story's Design Notes, and
 * `sim/physics/flipper/flipper-config.ts`, which turns this into the ported
 * mover's `FlipperConfig`.
 */
export interface LoadedFlipper {
	readonly name: string;
	readonly side: 'l' | 'r';
	/**
	 * The bat's fixed rotation axis, INSET one `baseRadius` (the box's own
	 * half-width, `halfWidthMm` below) from the box's outer end -- DW-78: the
	 * committed box is authored as the WHOLE rubbered bat (baseRadius circle
	 * + flipperRadius arm + endRadius tip), so the pivot sits one baseRadius
	 * inside it, not at its edge. Still lands at the table-frame position the
	 * pivot always has (left 170.0 mm, right 344.4 mm) -- only the box moved
	 * outward around it (`tools/make-placeholder-blend.py`).
	 */
	readonly pivotMm: Vec3;
	/** The box's own opposite (inner) end -- the bat's free (moving) tip. */
	readonly tipMm: Vec3;
	/** The box's own full x extent (the whole rubbered bat, DW-78) -- `baseRadius + flipperRadius + endRadius` derives from THIS, not from the (now shorter) pivot-to-tip distance. */
	readonly lengthMm: number;
	readonly halfWidthMm: number;
	readonly zLowMm: number;
	readonly zHighMm: number;
	readonly physMaterial?: string;
}
