// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-4: key codes never enter sim/ -- the key-to-action map lives only in
// host/input, which emits InputTransitions. This file is table-free (AD-1):
// it names no device.

/**
 * The closed set of player actions the host may report. Spine Seam Contracts
 * table: `flipper_l · flipper_r · plunger · nudge_l · nudge_r · nudge_up ·
 * start · menu`.
 */
export type InputAction =
	| 'flipper_l'
	| 'flipper_r'
	| 'plunger'
	| 'nudge_l'
	| 'nudge_r'
	| 'nudge_up'
	| 'start'
	| 'menu';

/**
 * A bitset over `InputAction`: which actions are held (`true`) or not
 * (`false`) at the tick this frame is in force from. Every action is
 * represented -- there is no "unset" state.
 */
export type InputFrame = Readonly<Record<InputAction, boolean>>;

/**
 * One tick-stamped input frame. `sim/loop` applies the frame in force at
 * each tick (the frame from the most recent transition at or before that
 * tick) and physics derives switch edges from consecutive frames (AD-4).
 */
export interface InputTransition {
	readonly tick: number;
	readonly frame: InputFrame;
}
