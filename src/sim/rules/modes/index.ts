// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-8: the minimal Epic 2 mode stack -- base (priority 100) and skill shot
// (priority 200), directly constructed and explicitly delegated to, exactly
// as `sim/rules/devices/index.ts` registers `./drop-bank.ts`/`./shots.ts`:
// no registry, no plugin table, no auto-discovery. Story 3.1
// (`epics.md:1648`) generalises this into the real framework -- a
// once-declared priority table with a duplicate-registration assertion, the
// four-phase `mode_<name>_will_start/_starting/_started`/`_will_stop/
// _stopping/_stopped` lifecycle as the only start/stop path, and the
// highest-priority-first event fan-out as a real abstraction. This module
// deliberately does not build any of that (this story's own Never section).
//
// `createModeStack()` is instantiated ONCE per `Rules` instance
// (`sim/rules/index.ts`'s `createRules()`, mirroring `createDevicesLayer()`/
// `createBallController()`) and returns `{ step }` closing over the two mode
// instances -- Story 2.3's own module-level `occupied` leak is exactly what
// this factory-per-instance shape avoids (this story's "Always" rule).
//
// Never produces a `CoilCommand` and never touches `machine.*` (AD-8's own
// rule text) -- this module and both modes it drives read and write only
// `players[*].lanes`, `modes[]` and `rng`.
//
// DEFERRED START (implementation finding, recorded here because it overrides
// this spec's own Design Notes prose): a `ball_starting` this tick is
// recorded and started on the FOLLOWING tick's `step()` call -- mirroring
// `sim/rules/index.ts`'s own `pendingLifecycleEvents` (N -> N+1) idiom --
// rather than starting the new modes in the SAME tick `ball_starting` fires.
// This spec's Design Notes ("Scope boundary against Story 3.1") states the
// opposite ("the stack starts the next ball's modes at ball_starting ...
// in the same tick"), but this spec's own Block If ALSO names
// `test/rules-lifecycle.test.ts:160-180` (Story 2.5's AC 5 mode-teardown
// pin) as a test that "must keep passing unmodified" -- and that exact test
// drains player 0 mid-game with a SECOND player still to play, which is a
// same-tick `ball_ended` -> rotation -> `ball_starting` for player 1 (not
// the last player, `ballsPerGame` not reached). Verified empirically: a
// same-tick push makes `after.modes` (asserted `[]` at that test's own
// `durationTicks: 1`) become `[base, skill_shot]` for player 1, reddening a
// previously-green, explicitly-protected regression pin. The two spec
// statements are irreconcilable for that exact scenario; this file follows
// the concrete, file-and-line Block If over the descriptive prose, on the
// reasoning that a Block If exists precisely to protect a shipped story's
// pinned behaviour from being silently broken by a later one. AC 1's own
// Given/When/Then ("ball_starting fires for player p ... modes[] contains
// exactly ...") does not require same-tick timing, and is satisfied one
// tick later; AC I1/AC I2 (real physics, many ticks between `s_start` and
// any assertion) are unaffected either way.
//
// [Story 2.14] This one-tick defer is also what makes `players[p].ballNumber`
// already correct by the time `skillShot.start()` reads it: `startBall()`
// increments `ballNumber` the SAME tick it emits `ball_starting`
// (`ball-controller.ts`), one tick before the deferred `start()` call above
// reads it -- so the skill shot's own per-ball lane advance (keyed on that
// same `ballNumber`) needs no counter of its own. A reader tempted to "fix"
// the defer into same-tick timing must see this: doing so would hand
// `skillShot.start()` the PRE-increment `ballNumber`, silently shifting every
// player's own lane rotation by one ball.

import type { DeviceEvent } from '../devices';
import type { GameState, SemanticEvent } from '../../table/names';
import type { ResolvedTuning } from '../../table/tuning';
import { createBaseMode } from './base';
import { createSkillShotMode } from './skill-shot';
import type { ModeEvent } from './events';

export type { LaneSetName, LanesCompletedEvent, ModeEvent } from './events';
export { BASE_MODE_PRIORITY } from './base';
export { SKILL_SHOT_MODE_PRIORITY } from './skill-shot';

export interface ModeStackStepResult {
	readonly state: GameState;
	readonly events: readonly ModeEvent[];
}

export interface ModeStack {
	/**
	 * `deviceEvents` is this tick's `DeviceEvent[]` (AD-19: modes never see a
	 * raw `SwitchEvent`); `lifecycleEvents` is this tick's `SemanticEvent[]`
	 * from the ball controller -- the stack looks only for `ball_starting`
	 * in it (never widened to a lifecycle-specific type, since `SemanticEvent`
	 * is already the closed union the ball controller emits, and this is the
	 * exact channel `sim/rules/index.ts`'s own `controllerResult.events`
	 * carries).
	 */
	step(state: GameState, deviceEvents: readonly DeviceEvent[], lifecycleEvents: readonly SemanticEvent[], tick: number): ModeStackStepResult;
}

function isBallStarting(event: SemanticEvent): boolean {
	return event.type === 'ball_starting';
}

export function createModeStack(tuning: ResolvedTuning): ModeStack {
	const base = createBaseMode();
	const skillShot = createSkillShotMode(tuning);

	// See this file's header, "DEFERRED START": a `ball_starting` seen THIS
	// tick is recorded here and actually started on the FOLLOWING tick's
	// `step()` call, never the same one.
	let pendingStartPlayer: number | null = null;

	function step(state: GameState, deviceEvents: readonly DeviceEvent[], lifecycleEvents: readonly SemanticEvent[], tick: number): ModeStackStepResult {
		let nextState = state;

		if (pendingStartPlayer !== null) {
			const player = pendingStartPlayer;
			pendingStartPlayer = null;
			// AD-7/AC 1: ascending priority on start -- the base mode's lane
			// reset must land before the skill shot draws its own lit lane,
			// since the draw's write must not be clobbered by the reset.
			nextState = base.start(nextState, player);
			nextState = skillShot.start(nextState, player);
		}

		if (lifecycleEvents.some(isBallStarting)) {
			pendingStartPlayer = nextState.currentPlayer;
		}

		// AD-8: highest-priority mode delivered first -- skill shot (200) then
		// base (100). The two modes consume DISJOINT device-event types in this
		// story's minimal scope (base: lane_entered, lane_change_pressed; skill
		// shot: ball_launched, playfield_switch_closed) but they SHARE one piece
		// of state, `players[p].lanes.lit` -- the base mode writes it, the skill
		// shot reads it to decide the award -- so this ordering is load-bearing,
		// not decorative.
		//
		// [CORRECTED 2026-09-06, code review] This comment previously claimed the
		// ordering "has no observable effect yet". It does. Running the skill
		// shot first is exactly what makes a `lane_entered` arriving in the SAME
		// batch as the resolving `playfield_switch_closed` land AFTER the award
		// is judged, so the award reads the lit pattern as it stood when the ball
		// arrived rather than one the same closure had already changed.
		//
		// Note also that this fan-out is mode-MAJOR (each mode is handed the
		// whole batch in turn), not event-major (each event offered to every mode
		// highest-first). AD-8's rule text -- "each active mode receives every
		// device and shot event, highest priority first" -- is satisfiable by
		// either shape and does not yet say which. The two differ observably on a
		// tick carrying both a `lane_change_pressed` and the resolving closure:
		// mode-major judges the award against the PRE-rotation lane, event-major
		// against the post-rotation one. Story 3.1 (`epics.md:1648`) owns the
		// fan-out contract and is where that choice gets stated; it is recorded
		// in the ledger rather than settled here.
		const events: ModeEvent[] = [];
		const skillShotResult = skillShot.step(nextState, deviceEvents, tick);
		nextState = skillShotResult.state;
		events.push(...skillShotResult.events);

		const baseResult = base.step(nextState, deviceEvents, tick);
		nextState = baseResult.state;
		events.push(...baseResult.events);

		return { state: nextState, events };
	}

	return { step };
}
