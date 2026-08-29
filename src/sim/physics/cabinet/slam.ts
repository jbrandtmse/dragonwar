// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-5, FR-16 -- the slam-tilt sensor: a tick-windowed nudge-EDGE count,
// structurally independent of the tilt bob (this story's Always rule: "the
// slam detector is a tick-windowed nudge count beside the oscillator with
// its own threshold, never the bob's threshold and never reading the bob's
// state"). DragonWar-authored -- no upstream equivalent exists in any of the
// seven authorized vpinball/vpinball files (confirmed by reading all seven
// during planning; this story's Design Notes, "Which cabinet files are ports
// and which are authored").
//
// Takes the nudge RISING-EDGE stream as its only input (however many edges
// occurred this tick, 0-3 -- one per nudge action): each edge's tick is
// pushed into a small ring, ticks older than `slamNudgeWindowTicks` are
// pruned every call (so the level decays with no further input, exactly
// like the bob's physical decay, just by a different mechanism), and
// `isOverThreshold` is the current LEVEL -- `sim/physics/cabinet/index.ts`
// collapses it to `s_slam_tilt`'s edges (AD-2), the same edge-collapsing
// shape the bob uses.

import type { ResolvedTuning } from '../../table/tuning';

export interface SlamDetector {
	/** Call once per tick with the number of nudge-action rising edges that occurred THIS tick (0 most ticks). Also prunes expired edges even when `edgeCount` is 0, so the level decays with no further input. */
	recordEdges(tick: number, edgeCount: number): void;
	/** The current level: the trailing window (ending at the last tick passed to `recordEdges()`) holds at least `slamNudgesPerWindow` edges. */
	readonly isOverThreshold: boolean;
}

export function createSlamDetector(tuning: ResolvedTuning): SlamDetector {
	const threshold = tuning.slamNudgesPerWindow.value;
	const windowTicks = tuning.slamNudgeWindowTicks.value;

	// Ascending by tick (edges are always recorded in non-decreasing tick
	// order, so a plain array with `shift()` pruning is a correct, minimal
	// ring -- no separate write/read cursor is needed).
	const edgeTicks: number[] = [];

	return {
		recordEdges(tick: number, edgeCount: number): void {
			for (let i = 0; i < edgeCount; i++) {
				edgeTicks.push(tick);
			}
			while (edgeTicks.length > 0 && tick - edgeTicks[0]! >= windowTicks) {
				edgeTicks.shift();
			}
		},
		get isOverThreshold(): boolean {
			return edgeTicks.length >= threshold;
		},
	};
}
