// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-7, AD-9: the only shape of an active mode presentation may read.
// Table-free (AD-1) -- ModeView names no device.

/**
 * `{ mode, priority, player, timerTicks?, value?, charge?, strikesRemaining? }`
 * (Seam Contracts table). Published by a mode every step; presentation reads
 * this instead of `GameState.modes[i]`'s mode-local fields.
 */
export interface ModeView {
	readonly mode: string;
	readonly priority: number;
	readonly player: number;
	readonly timerTicks?: number;
	readonly value?: number;
	readonly charge?: number;
	readonly strikesRemaining?: number;
}
