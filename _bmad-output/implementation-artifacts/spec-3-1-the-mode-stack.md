---
title: 'Story 3.1: The mode stack'
type: 'feature'
created: '2026-09-29'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: [multiple-goals, oversized]
deferred:
  - summary: 'modesPlayed is credited with every mode name at each ball end, so base and skill_shot enter players[].modesPlayed on every ball; Story 3.4 AC 4 credits modesPlayed at mode_<name>_started for campaign Modes only'
    evidence: 'ball-controller.ts:1151-1154 copies nextState.modes names into the ending player''s modesPlayed; test/rules-lifecycle.test.ts:198 pins the credit with a stub mode. Story 3.1 keeps it (behaviour-preserving); Story 3.10 reads "modesPlayed containing all three Modes"'
    location: 'src/sim/rules/ball-controller.ts:1151-1154 (after the split: src/sim/rules/ball-controller/ball-end.ts)'
    severity: 'med'
---

<intent-contract>

## Intent

**Problem:** Epic 2's mode stack is minimal. Base (100) and skill shot (200) are constructed by hand. The stack holds its start decision in a closure (`pendingStartPlayer`) outside `GameState`. The ball end, the Slam and the skill shot's own resolution all remove modes directly. The fan-out is mode-major. Measured consequence (DW-209, retro D1): a Slam on the tick after `ball_starting` pushes `[base, skill_shot]` into Attract and advances `rng` there. The next Start then runs `[base, skill_shot, base, skill_shot]`. The Backglass hides a labelled mode under any unlabelled one and drops an unlabelled mode's fields (DW-206). `ball-controller.ts` is 1,340 lines, with one 566-line `step()` (DW-290). Every Epic 3 mode would land on top of this.

**Approach:** First split `ball-controller.ts` into a `ball-controller/` directory without changing behaviour. Then generalise `src/sim/rules/modes/`:
- a once-declared priority table and a registry that rejects duplicates;
- the six-event lifecycle as the only way to start or stop a mode, with modes starting in the same `rules.step` that emits `ball_starting`, so no arming state exists at all;
- event-major fan-out, highest priority first;
- a per-tick hook for timers;
- lamp roles composed by priority.

The Backglass then shows the highest-priority mode that has something to show.

## Boundaries & Constraints

**Always:**
- **Split first, and it changes no behaviour (DW-290).**
  - `src/sim/rules/ball-controller.ts` becomes `src/sim/rules/ball-controller/`, and the old file is deleted in the same change. If both exist, the `.ts` file wins resolution.
  - Every import path keeps resolving unchanged, and all nine public names stay exported from `ball-controller/index.ts`.
  - Every tick keeps the same order of operations, the same `events` / `coilCommands` / `recoverCommands` / `ballWillStartEvents` / `bankResetRequests` order, and the same state reference identities.
  - The one test edit this step allows is the `SANCTIONED` path keys in `test/ad8-score-write-path.test.ts:25`, with the total of 3 hits unchanged. With that edit in, the whole suite passes before any mode-stack task starts.
- **Priorities are declared once.** `MODE_PRIORITIES = { base: 100, skill_shot: 200, hurryup: 300, joust: 310, quickmb: 400, war: 500 }` (as const) lives in `src/sim/rules/modes/priorities.ts`.
  - `BASE_MODE_PRIORITY` and `SKILL_SHOT_MODE_PRIORITY` stay exported, and each reads its value from this table.
  - Mode names follow `machine.multiball` (`'quickmb' | 'war'`) and the lamp roles.
- **Registry.** `createModeRegistry(definitions)` validates at construction, which is load time; per the Conventions, load-time paths throw.
  - Two definitions with the same `priority`, or the same `name`, throw an `Error` whose message names both modes and the value.
  - The production registry also throws if a definition's priority is not `MODE_PRIORITIES[name]`.
  - `createModeStack(tuning, definitions?)` takes optional definitions so tests can supply stub modes. They must use names and priorities from the table. Production passes none.
- **Lifecycle.** A mode is started and stopped only by the stack's lifecycle functions in `src/sim/rules/modes/lifecycle.ts`.
  - Start, per mode: `mode_<name>_will_start` (no entry yet), then `_starting` (the entry is pushed and the mode's starting hook runs), then `_started`.
  - Stop, per mode: `_will_stop` (the entry is present), then `_stopping`, then `_stopped` (the entry is removed and the stopped hook runs).
  - Each event is a `ModeLifecycleEvent { type, mode, player, tick }` on the existing `ModeEvent` channel (`RulesStepResult.modeEvents`). None joins `SemanticEvent`.
  - When several modes start, they start in ascending priority, all three events per mode before the next mode. The base mode's lane reset therefore lands before the skill shot draws its lane. When several stop, they stop in descending priority.
  - Starting a mode whose `name` is already active for that player is a no-op: same state reference, no events.
  - Stop hooks are pure and tuning-free: `(state, entry, tick)`. The ball controller and the tilt controller run them in place.
  - An entry whose `mode` has no registered definition (the test fixtures `stub` and `some_unmapped_mode`) is stopped with the same three events and no hooks. It receives no device events.
- **Every removal of a mode goes through the stop path:**
  - the ball-end teardown (today `ball-controller.ts:1144-1157`), before `ball_ended` is pushed. `modesPlayed` is credited exactly as today, with the names captured before the stop;
  - `enterAttract` (today `:393-403`), called by the Slam (`tilt.ts:178`) and at the end of the game-over sequence;
  - the skill shot's own resolution (`skill-shot.ts:207,234`).

  The ball controller and the tilt controller return the stop events as `modeEvents`. `rules/index.ts` concatenates them in execution order: tilt, then controller, then stack.
- **No arming state (DW-209).**
  - When this tick's controller events contain `ball_starting`, the stack starts base and skill_shot for `currentPlayer` within the same `rules.step`. It does this after the tick's device-event fan-out, so the new modes first receive device events on the next tick, exactly as today.
  - `pendingStartPlayer` is deleted. No closure field replaces it. With a zero-length window, nothing needs to be cancelled.
  - The false `ballNumber` claim in `modes/index.ts:50-58` is deleted too: `startBall` increments `ballNumber` before the stack runs, which was measured.
- **Fan-out is event-major.**
  - Before any event is delivered, every active mode's optional `tick` hook runs once, in descending priority. A higher mode never suppresses a lower mode's hook.
  - Then each device event, in emission order, is offered to every active registered mode in descending priority before the next event is offered.
  - A mode stopped by event *k* receives none of events *k+1..*. A mode started by event *k* receives events *k+1..*.
  - Mode handlers receive only `DeviceEvent` (AD-19) and return `{ state, events?: ModeEvent[], stop?: true }`. They have no coil channel.
- **Lamps compose by priority.**
  - `lampsOf(state, hurryUpTicks)` keeps its signature. The machine lamps (`kind: 'lock' | 'ball_save'`) keep their current projection, and no mode may override them.
  - Every other lamp starts `off/0`. Each active mode's optional `lamps(state, entry)` contribution is then applied in ascending priority, so a higher priority overwrites per lamp.
  - The base mode contributes today's letter and lane roles for its own player. The skill shot contributes `lit/2` for each lit Top lane of its player.
  - Every existing `test/rules-lamps.test.ts` expectation stays unchanged.
- **Backglass (DW-206, author decision 2026-09-28).**
  - A mode *has something to show* if it has a `MODE_DISPLAY_NAMES` entry or publishes any of `timerTicks`, `value`, `charge`, `strikesRemaining`.
  - `selectTopMode()` returns the highest-priority mode that has something to show. That mode alone owns the status and fields lines, as AD-8's "presentation priority is the highest active mode" requires.
  - The status line shows its name only if it has one. The fields line shows its published fields whether or not it has a name.
  - A mode with nothing to show (the base mode) is transparent, so it never blanks a mode below it.
- Every AC has a pinning test with a `mutation:` line in `## Verification` (Rule 19). Every negative is paired with its positive. Expected values come from `resolveTuning()`, `MODE_PRIORITIES` and `nextRngInt()` applied to the seed, never from the value under test. Rule 14 applies: write non-ASCII characters in source as escapes.

**Never:**
- Never add a `GameState`, `machine` or `PlayerState` field, never change the `ActiveModeState` or `ModeView` shape, and never add a `SemanticEvent` member. Any golden's `expectedHash`, `expectedGameStateHash`, header, `transitions` or `checkpointTicks` moving is an intent gap: HALT. `test/replays/**` must stay byte-identical, since none of its goldens presses Start.
- Never build Hurry-up, Joust, Quick multiball, the War, the Lock arbiter, `modesLit`, `show_mode_start` or the `modesPlayed` move (Stories 3.2-3.10). Never touch `timerTicks`-based ball-search skipping (Story 3.2).
- Never invent behaviour inside the split. Keep its order, its early return (`:1129`, which skips the stray-clear, overflow, search and DW-235 seams) and its `pendingStrayClear` reference equality (`:1262`).
- Never write a device-name literal under `src/` outside `sim/table/dragonwar.ts`. Never import `sim/rules` from `presentation`.
- Never edit the architecture spine. Its text changes go to the lead (Design Notes).
- Never touch `src/presentation/mechanisms/**`, `src/presentation/scene/**`, `assets/src/**`, `public/assets/**`, `tools/make-placeholder-blend.py` or `ATTRIBUTIONS.md`. These are contended with Epic 5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ball start, same tick | Attract, `s_start` at tick 5 | Tick 5: `modes` = `[base:p0, skill_shot:p0 launched:false]`. `rng` = one `nextRngInt(seed, 3)` draw. `modeEvents` on tick 5 = the three base start events, then the three skill_shot start events | No error expected |
| **Slam after start (DW-209)** | `s_start` 5, `s_slam_tilt` 6. Then in Attract: a plunge and the lit Top lane. Then `s_start` 20 | Tick 6: `phase` `attract`, `modes` `[]`, `modeEvents` = skill_shot's stop triple then base's. Every Attract tick: `modes` `[]`, `rng` still exactly one draw, every player's score 0. Tick 20: exactly `[base, skill_shot]`, and `rng` exactly two draws | No error expected |
| Slam control | Same script without the Slam | The lit Top lane pays `skillShotAward` and letter `D` to player 0. `modes` never holds a duplicate | No error expected |
| Slam and Start on one tick | `s_start` 5, then `s_slam_tilt` + `s_start` 6 (the shape of `rules-stray-clear.test.ts:220`) | Tick 6: one fresh `[base, skill_shot]`, `rng` exactly two draws. Tick 7: unchanged | No error expected |
| Ball end, rotation | Hot seat, p0 active `[base, skill_shot]`, drain | Controller-level: `modes` `[]` in the state it returns alongside `ball_ended`. Rules-level on that tick: `modeEvents` = the stop triples (skill_shot, then base), then p1's start triples. End state = p1's entries only, nothing with `player: 0` | No error expected |
| Last ball | 1 player, last ball drains | `modes` `[]` after the drain tick, stop triples emitted, `game_over` | No error expected |
| Event-major fan-out | Skill shot launched, `top_3` lit. Same tick: right flipper edge, then `s_top_1` | Pays `skillShotAward`: the rotation lands first, top_3 → top_1 | No error expected |
| Event-major control | Same tick: flipper edge, then `s_top_3` | No award. The skill shot stops with no award | No error expected |
| Stub stack order | Stubs `hurryup@300` and `quickmb@400`, both active, one `spinner_spin` | Delivery log `[quickmb, hurryup, base]`. Both stubs pay 10 through `awardScore`, and base pays `spinnerScore`; the total accrues | No error expected |
| Timer under a higher mode | Stub `hurryup@300` with `timerTicks` 100 that decrements in `tick`; stub `quickmb@400` active | After 5 steps `timerTicks` is 95, and the Backglass shows quickmb's view | No error expected |
| Duplicate registration | Definitions `[joust@310, joust@310]`, or two with priority 300 | Construction throws, naming both | Throw at load |
| Unlabelled field publisher (DW-206) | `modes` = `[base, some_unmapped_mode@300 timerTicks 1000]` | The fields line shows `1.0`, and there is no name row | No error expected |
| Transparent unlabelled (DW-206) | `[skill_shot@200, some_unmapped_mode@300 no fields]` | The status line shows `ARM YOURSELF` | No error expected |
| Base only (DW-200 kept) | `[base]` | Rows are exactly `['0', 'BALL 1']` | No error expected |

</intent-contract>

## Code Map

- `src/sim/rules/ball-controller.ts` (1,340 lines; `createBallController` :415-1340; `step()` :772-1337). Its seams, in order:
  - S0 search observe :778;
  - S1 bonus count-down drain :801-810 (reads the input `phase`);
  - S2 resets and the snapshot :818-823, :847;
  - S3 game over / Match :857-891 (`enterAttract` :886);
  - S4 save expiries :900-913;
  - S5 letters fold :918-930;
  - S6 Start / Hot seat :945-985;
  - S7 plunge arm and autolaunch :1012-1057;
  - S8a drain gate and save re-serve :1064-1130 (**early return :1129**);
  - S8b ball end :1132-1168 (bonus write :1154; **`modes: []` teardown :1144-1157**);
  - S8c game over / rotation :1169-1212;
  - S8d bonus schedule arm :1225-1233;
  - S9 recover report / stray clear :1250-1293 (**`===` at :1262**);
  - S10 overflow ejects :1298-1310;
  - S11 search step :1313-1317;
  - S12 DW-235 filter :1334.

  `startBall` (:680-770) writes the save flags, `pendingStrayClear` and `ballSearch.reset()`. The five `let`s are at :497, :567, :589, :616 and :629. The exports are `applyDeviceEvents` :115, `deriveDeviceSlots` :188, `HARDWARE_COILS` :281, `BALL_SAVE_SOURCE` :291 (the value `'ball-controller'` is hardcoded in tests), the two types at :328 and :347, `applyRecovery` :373, `enterAttract` :393 and `createBallController` :415.
- Importers of ball-controller, all extensionless: `rules/index.ts:66`, `rules/tilt.ts:56`, and eight tests (`rules-devices`, `rules-derive-device-slots-fold`, `rules-ball-search`, `rules-ball-save`, `rules-lifecycle`, `game-over-integration`, `rules-tilt`, `rules-tilt-integration`, `rules-match`). `tsconfig.base.json` uses `moduleResolution: bundler`. The `./devices` and `./modes` directory-index precedent already exists.
- `src/sim/rules/modes/index.ts:93-161`: the stack.
  - `pendingStartPlayer` is at :100-117. Delete it.
  - The mode-major fan-out is at :148-157.
  - The false `ballNumber` note is at :50-58.
- `src/sim/rules/modes/base.ts:133-217`: `createBaseMode`, with `start` :134 and `step` :181. It keeps its scoring branches, which fold into the handler.
- `src/sim/rules/modes/skill-shot.ts:152-241`: `gameLaneStart` closure at :157 (kept); start draws at :167; direct removals at :207 and :234.
- `src/sim/rules/modes/events.ts:41`: `ModeEvent = LanesCompletedEvent`. Widen it with `ModeLifecycleEvent`.
- `src/sim/rules/index.ts:305` tilt, `:316` controller, `:329` stack, `:340` `advanceBonusMultiplier`, `:352` `modeEvents`.
- `src/sim/rules/tilt.ts:152-188`: the Slam calls `enterAttract` at :178.
- `src/sim/rules/lamps.ts:96-130` `projectLamp` (never-guard at :128) and `:146-156` `lampsOf`, which hard-codes `base` and `skill_shot`.
- `src/sim/rules/bonus.ts:207-220`: `advanceBonusMultiplier` filters `lanes_completed` with an `if`, which is safe for a wider union.
- `src/presentation/backglass/frame.ts`: `MODE_DISPLAY_NAMES` :681, `modeDisplayName` :686, `selectTopMode` :696, `buildFieldsText` :760, `buildScoreRows` :788-814 (fields gated on `modeName` at :806). Presentation may import only `sim/contracts` and `sim/table` (`dependency-cruiser.config.mjs:136-143`).
- `test/ad8-score-write-path.test.ts:25`: `SANCTIONED` exact-match map. It scans `src/sim/rules/**` line by line and does not skip comments, so no new file may contain `score:`.
- `tools/dependency-cruiser.config.mjs:164-187` `no-circular`, hence a leaf `ball-controller/shared.ts`. `test/module-coverage.test.ts` requires every `src/**/*.ts` to be reachable from a test. `test/rules-devices-headless.test.ts` forbids physics, loop, Babylon and `fs` imports in rules.
- Tests whose timing pin changes by design (DW-209):
  - `test/rules-modes.test.ts:128` ("not yet armed at the SAME tick") becomes "armed at tick 5";
  - `test/rules-lifecycle.test.ts:197` (`after.modes toEqual([])` on a same-tick rotation) becomes "no `player: 0` entry; exactly p1's fresh `[base, skill_shot]`; the stub's stop triple precedes p1's start triples in `modeEvents`". Its `modesPlayed` assertions at :198-199 stay.
- Test that flips by author decision (DW-206): `test/backglass-frame.test.ts:1539` (an unmapped mode with `timerTicks: 1000` now shows `1.0`). `:1486` (base only) stays unchanged.
- Tests that must stay unchanged: the two DW-202 composition tests (`rules-modes.test.ts:243`, `:251`), which put the flipper and the closure on different ticks; the Story 2.14 suite (`rules-modes.test.ts:588-830`); `rules-modes.test.ts:471/484` (exact `modeEvents`, base only); and every `rules-lamps` test.
- Helpers: `test/util/switch-script.ts:238` `runRulesScript` (`statesByTick`, `modeEvents`), `rules-modes.test.ts:66-120` builders, `rules-modes.test.ts:224-241` the DW-202 flipper helper, and `test/backglass-integration.test.ts:236-290` the `advanceBackglass`/`renderFrame` fold.

## Tasks & Acceptance

**Execution** (in this order):
1. `src/sim/rules/ball-controller/` (new; GPL header on each file) -- the DW-290 split. Move code, don't rewrite it. Files:
   - `index.ts`: the public re-exports and `createBallController`. `step()` is a short skeleton calling the seams in today's order and threading `nextState` plus one mutable `TickOutput` accumulator. It reproduces the early return.
   - `shared.ts`: the leaf module. `START_BUTTON`, the coil derivations, `HARDWARE_COILS`, `BALL_SAVE_SOURCE`, `SHOOTER_LAUNCH_COIL`, the types, and `enterAttract`.
   - `accounting.ts`: :80-207 and :360-378.
   - `start.ts`: `emptyPlayer`, `startBall` and S6.
   - `save-serve.ts`: S4, S7 and the S8a save branch.
   - `ball-end.ts`: `armBonusCountSchedule`, S1, the S8 gate, S8b, S8d and S12.
   - `game-over.ts`: the `GameOverSequence` type, the S2 game-over reset, S3, the resolved gate used at :948, and the S8c arm with its disable loop. Do not merge that loop with `enterAttract`.
   - `serve-recovery.ts`: the S2 stray reset and snapshot, S9, S10 and S11.

   The five `let`s become fields of one `ControllerState` record, created in `index.ts` and passed to the seams. The `{tick}` records stay the same objects. Delete `ball-controller.ts`. Size targets: no file over ~350 lines, and `step()` in `index.ts` at most ~120.
2. `test/ad8-score-write-path.test.ts` -- rewrite only the `SANCTIONED` keys to the new paths (`ball-controller/start.ts: 1`, `ball-controller/ball-end.ts: 1`). **Checkpoint:** the full suite and all gates are green, and `git diff --stat test/replays` is empty. Record it in the Auto Run Result before task 3.
3. `src/sim/rules/modes/priorities.ts` (new) -- `MODE_PRIORITIES`, and the `ModeName` type derived from it.
4. `src/sim/rules/modes/events.ts` -- `ModeLifecycleEvent`. `type` is a template literal `mode_${string}_${'will_start'|'starting'|'started'|'will_stop'|'stopping'|'stopped'}` and carries `mode`, `player` and `tick`. `ModeEvent` becomes `LanesCompletedEvent | ModeLifecycleEvent`.
5. `src/sim/rules/modes/registry.ts` and `lifecycle.ts` (new) --
   - the `ModeDefinition` shape: `name`, `priority`, `onStart?`, `onStarting?`, `tick?`, `onEvent`, `onStopping?`, `onStopped?`, `lamps?`;
   - `createModeRegistry` with its duplicate check;
   - `startModes` and `stopModes` (pure stop), per Always.
6. `src/sim/rules/modes/base.ts`, `skill-shot.ts` -- expose each as a `ModeDefinition` built by its factory. The base mode keeps its scoring. The skill shot's resolution returns `stop: true` instead of filtering `modes[]`. Priorities come from the table.
7. `src/sim/rules/modes/index.ts` -- `createModeStack(tuning, definitions?)`:
   - the per-tick hooks, the event-major fan-out and the same-tick `ball_starting` start, with no closure start state;
   - a header rewritten to state the new contract and remove the DEFERRED START and `ballNumber` notes.
8. `src/sim/rules/ball-controller/ball-end.ts`, `shared.ts` (`enterAttract`), `src/sim/rules/tilt.ts`, `src/sim/rules/index.ts` -- the ball-end teardown and `enterAttract` call `stopModes`. The controller and tilt results gain `modeEvents`, and the root concatenates tilt, then controller, then stack.
9. `src/sim/rules/lamps.ts` -- priority composition per Always. Keep the machine-lamp arms and the `never` guard. Rewrite the header ("no mode imports this file" becomes "this file reads each mode's `lamps` contribution").
10. `src/presentation/backglass/frame.ts` -- `selectTopMode` and `buildScoreRows` per the DW-206 rule, with the doc comments updated.
11. `test/rules-mode-stack.test.ts` (new) --
    - the registry (AC1);
    - the lifecycle order and the absence of any other path (AC2), including the source scan: outside `modes/lifecycle.ts`, no file under `src/sim/rules/**` holds `modes:` followed by `[`, `.modes.filter(`, `.modes.splice(` or `.modes.push(`, pinned by count like `ad8`. A mode updating its own entry's fields through `.modes.map(` is allowed, because it neither adds nor removes an entry;
    - the stub fan-out order and accrual (AC3);
    - the timer (AC4);
    - the no-coil wrap (AC6);
    - the lamps higher-wins case (AC3).
12. `test/rules-mode-stack-integration.test.ts` (new) -- the DW-209 Slam rows and their controls, the ball-end rows (AC5), the event-major pair, and the Integration AC through `runRulesScript` plus the Backglass fold (AC7).
13. `test/rules-modes.test.ts:128`, `test/rules-lifecycle.test.ts:197`, `test/backglass-frame.test.ts:1539` -- the planned edits listed in the Code Map, with nothing else changed. Also add the two DW-206 frame rows. Any other test that goes red must be diagnosed. A test may be updated only if it pins the one-tick start defer, and every such edit is listed in the Auto Run Result. Any other red is a defect.

**Acceptance Criteria:**
- AC1: Given the stack in `src/sim/rules/modes/`, when it is built, then priorities come only from `MODE_PRIORITIES`, and registering a duplicate priority or name throws at construction, naming both modes.
- AC2: Given a mode starts or stops, by any cause (ball start, self-resolution, ball end, Slam), when the transition runs, then exactly `mode_<name>_will_start → _starting → _started`, or `_will_stop → _stopping → _stopped`, fire in that order for that mode. The source scan shows no other path that writes `modes`.
- AC3: Given two active modes, when a device event arrives, then both receive it, higher priority first and event-major. Scoring from both accrues through `scoring.ts`. Each contributes lamp roles, and the higher wins per lamp: with the skill shot active, a lit Top lane is `lit/2` over base's `lit/1`. The Backglass shows the highest-priority mode that has something to show.
- AC4: Given a mode with a timer under a higher-priority mode, when ticks advance, then its `tick` hook runs and its published `timerTicks` decreases by one per tick.
- AC5: Given the ball ends, when `ball_ended` fires, then every active mode has received its stop triple, the controller's returned `modes` is `[]`, and no entry of the ending player survives into the next player's ball.
- AC6: Given every registered mode, when a test wraps its definition's hooks and drives start, every `DeviceEvent` type and stop, then no hook output holds an object with `type: 'coil'`. The result types admit no coil channel either: a `@ts-expect-error` assigns a `CoilCommand` to `ModeEvent`.
- AC7 (Integration, Rule 1): Given a real `createRules()` run via `runRulesScript`, folded through `advanceBackglass`/`renderFrame`, when Start, plunge, the lit Top lane and a pop occur, then:
  - the DMD shows `ARM YOURSELF` from the Start tick;
  - it clears on resolution;
  - the score row shows `skillShotAward`, then `+ popScore`: both modes' awards accrue.
- AC8 (DW-209): Given the three Slam rows of the Matrix, when their scripts run through `runRulesScript`, then `phase`, `modes`, `modeEvents`, every player's score and `rng` (checked against `nextRngInt` draws from the seed) match each row on every tick, and each row's control holds.
- AC9: Given the story, when the gates run, then `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` all pass, and `test/replays/**` is byte-identical.

## Spec Change Log

- 2026-09-29, lead spec gate: the "AD-8 sentence" under Design Notes was written into the spine's AD-8 verbatim (Rule 20, DW-209). The AD-7 inventory is written by the lead at adjudication, from the code as delivered. Kept as one story (split first, green checkpoint), per the planner's recommendation. No spec text changed.

## Review Triage Log

## Design Notes

**Measured at this tree** (`a2b8a1b`; four read-only probes; suite 132 files / 2195 tests green).
- **DW-209 is real in its structure; the scoring symptom is not.** A probe with Start at 5 and a Slam at 6 gives this at tick 6: `phase: 'attract'`, `modes: [base, skill_shot]`, and `rng` 0 → 1831565813, which is a draw in Attract. The next Start (20) then gives `[base, skill_shot, base, skill_shot]` at tick 21.
  - With Slam and Start both on tick 6, tick 7 already has duplicates.
  - The retro's "25,000 in Attract" no longer reproduces, because 3.0a's `scoringOpen` gate stops it. With a stale second skill shot left in play, a later lit lane still pays in game 2.
  - The only test on this path (`rules-stray-clear.test.ts:220`) never reads `modes`.
- **Every ball start happens in one tick.** `startBall` emits `ball_will_start`, `ball_starting`, `ball_save_enabled` and `ball_started` together, and increments `ballNumber` first. So a same-tick start reads the right `ballNumber`, and the "defer protects ballNumber" note is false.
- **Why the defer existed.** Two tests pin it:
  - `rules-modes.test.ts:128` pins it explicitly.
  - `rules-lifecycle.test.ts:197` pins it by accident: it asserts `modes: []` at the end of a same-tick rotation tick.

  Removing the defer, rather than moving the flag into `GameState`, is the smallest fix that leaves no arming state and no window. Moving the flag would need a new field (a golden-hash re-record and the author's grant). Deriving it from `phase` and `modes` fails for every mid-game fixture that has `modes: []`.
- **Fan-out.** The devices layer emits in stage order. Within Stage 3 it keeps the switch-array order, and the real loop puts button edges first (`loop/index.ts:440`). So a flipper press and a closure on one tick emit `lane_change_pressed` before `playfield_switch_closed`. Mode-major judges the skill shot against the pre-rotation lane; event-major judges it against the post-rotation one. No test puts both on one tick (the DW-202 pair uses ticks 8 and 9). Decided: **event-major**. It is the literal reading of the criterion ("when a device … event arrives … both receive it, higher priority first"), it processes events in the order they happened, and it agrees with DW-204's decision that lane change stays live in flight.
- **DW-206 reading.** Story 2.6 AC 5 says the Backglass shows the name and the fields of the highest-priority mode. The author's DW-206 decision says an unlabelled mode still shows its fields and never blanks a labelled mode below it. Splitting the name and the fields across two modes would let two modes claim the Backglass, which AD-8's Prevents forbids. So one mode, the highest-priority one with a label or a field, owns both lines. The base mode has neither, so it is transparent.
- **ModeView.** No projection function exists: `frame.ts:697` reads `state.modes` through the `ModeView` type, and a mode "publishes" by carrying the optional fields on its own entry. That stays. A `Snapshot` field would be a contract change and a hash risk.

**Governing ADs:**
- AD-7: no new state; `modes[]` is empty between balls; the closure-state class.
- AD-8: priorities, lifecycle, fan-out, lamps by priority, one score gate.
- AD-9: `lampsOf` stays a pure projection; no `CoilCommand` from modes.
- AD-19: modes consume device events only.
- AD-18: `_starting` / `_stopped` are the phases later multiball stories hook.
- AD-15: goldens untouched.
- AD-16: boundary lint and headers.
- AD-1: presentation imports only contracts and table.

**For the lead: AD-8 sentence** (Rule 20): "Fan-out is event-major. The stack delivers a tick's device and shot events in the order the devices layer emits them, and offers each event to every active mode in descending priority before the next event. A mode stopped by an event receives none of that tick's later events. Modes start in the same `rules.step` that emits `ball_starting`, after that tick's fan-out; no pending start lives outside `GameState`. Stop phases are pure and tuning-free, so the ball end and the Slam run them in place; `enterAttract` and the ball-end teardown stop modes only through them."

**For the lead: AD-7 inventory** (DW-291, re-derived from code, stated as it will stand after this story). The mutable closure bindings under `sim/rules/`, with none at module level:
- `rules/index.ts`: `pendingLifecycleEvents`.
- ball controller (`ball-controller/index.ts`), in its `ControllerState` record:
  - `awaitingSaveLaunch` (not time-bounded: it holds until the next ball start after an `eject_failed`);
  - `awaitingSaveRelaunch`;
  - `pendingBonusCountSteps` (the bonus **count-down** schedule, cleared on entering Attract);
  - `gameOverSequence`;
  - `pendingStrayClear`.
- ball search: `pass`, `heldSince`, `wasInPlay`.
- tilt:
  - `lastBobClosureTick`, a machine-wide scalar for spacing, set by every closure and never cleared by phase;
  - `lastWarningTick`, a per-player Map for settling, cleared whenever `phase !== 'game'`;
  - `idleBobClosureTick` is gone.
- devices layer: `occupancy` (duplicates `machine.deviceSlots`), `pendingLockLaneClosure`.
- drop bank: `down`, `completed`.
- shot tracker: `inFlight`.
- skill shot: `gameLaneStart`.
- `modes/index.ts`'s `pendingStartPlayer` is **removed**.

The "resume point" paragraph should also list a Match sequence in progress, the ball-search timer and the drop-bank latch, and say "count-down" instead of "count-up". Only the tilt, game-over, stray-clear and ball-search state guard against `tick` running backwards.

**Integration (Rules 1/2).** The generalised stack is a shared component.
- Consumed-by:
  - 3.2: skips `c_mouth` while any mode publishes `timerTicks`;
  - 3.4: the Lock arbiter starts lit Modes through `startModes`; `_started` credits `modesPlayed`;
  - 3.5: Hurry-up's `tick` timer, `value` and `timerTicks`, and the `hurryup` lamps;
  - 3.6: Joust's `charge` and the `joust` lamps;
  - 3.7: Quick multiball's `_starting` / `_stopped` for `machine.multiball`;
  - 3.8 and 3.9: the War;
  - 3.10: the achievements;
  - Epic 4: lamp roles.
- Consumes:
  - 3.0a's `scoring.ts`;
  - 2.4's device events;
  - 2.5 and 2.13's ball controller;
  - 2.6 and 2.13's Backglass;
  - 2.8's `lampsOf`;
  - 2.11's Slam.
- The Integration AC is AC7: a real `createRules()` with the Backglass as the observable consumer.

**Ledger inbox (Rule 17):**
- DW-206 → AC3 and the three Backglass rows.
- DW-209 → AC2, AC5 and AC8, the Slam rows, and the event-major pair plus the AD-8 sentence.
- DW-290 → tasks 1-2 and the checkpoint.
- DW-291 → the AD-7 inventory above. The lead writes the spine text.

None is declined.

**Size.** This is two goals in one story (`multiple-goals`). The split is mechanical and gated by its own green checkpoint before any mode work starts. That is why I recommend keeping it in one story: every later task edits the split's files, not the monolith. If the lead prefers a cut anyway, the clean line is tasks 1-2 as their own story, ahead of tasks 3-13. Neither half drops DW-290.

**Footprint extensions to report:** `src/presentation/backglass/frame.ts` and `test/*.test.ts`. Neither is contended.

**Browser smoke (lead-run), what it should observe:**
- a normal game plays and scores: pop and sling values on the DMD;
- `ARM YOURSELF` is on the DMD from the first frame of the ball and clears at the first playfield closure;
- a Slam from a live ball returns to Attract, and the sampler shows `game.modes` as `[]` there;
- the next Start shows one `ARM YOURSELF` and one skill shot;
- the deciding check: `window.__dragonwarBoot.replayRecorder` records a game including the Slam, and a headless `runReplay()` reproduces it, with `modes` `[]` on every Attract tick.

## Verification

**Commands** (run with `export BLENDER=C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe`; baseline 132 files / 2195 tests):
- `pnpm test` -- expected: all green, at the task-2 checkpoint and at the end.
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions && pnpm build && pnpm check:dist && pnpm check:size` -- expected: each exits 0.
- `git diff --stat -- test/replays` -- expected: empty. Also a JSON parse of all five goldens confirms that no `transitions[*].frame` has `start: true`.

**Mutations** (Rule 19). Apply each one, observe red, revert, and confirm `git status --short` and `git diff --stat` are unchanged. Record the actual test names here:
- AC1: drop the duplicate check → the registry test goes red.
- AC2: restore a direct `modes: []` in `enterAttract` → the source scan and the Slam `modeEvents` assertion go red.
- AC3:
  - revert to mode-major → the event-major pair goes red;
  - compose lamps in descending order → the `lit/2` case goes red;
  - drop one stub's handler → the accrual test goes red.
- AC4: skip `tick` hooks for non-top modes → the timer test goes red.
- AC5: remove the stop call from the ball-end teardown → the controller-level `modeEvents` test goes red.
- AC6: add a `{type:'coil'}` to the skill shot handler's events → the wrap test goes red.
- AC7: base pays `currentPlayer`, or the skill-shot award is removed → the AC7 row goes red.
- AC8: reintroduce the one-tick deferred start → the Slam row goes red on `modes` and `rng` in Attract.
- DW-206:
  - restore the `modeName` gate on the fields line → the `1.0` row goes red;
  - restore "highest priority regardless" → the `ARM YOURSELF` row goes red.

## Auto Run Result

Status: ready-for-dev
Blocking condition: none

Planned at `a2b8a1bea37a7e6461f31f2d00ee0d8bab950dee` on `DW-1-epic3`. The run halted after planning, as the invocation asked. It used the committed `epic-3-context.md` without recompiling it, and Story 3.0a's spec for continuity. Four read-only measurement subagents informed the plan: the ball-controller seams, the lifecycle timing and the Slam path (confirmed by probe), the fan-out, Backglass and lamps, and the closure-state inventory. Warnings: `multiple-goals` (the DW-290 split plus the stack; see Design Notes, "Size") and `oversized`. One deferred planning finding is in the frontmatter: `modesPlayed` credits base and skill_shot at every ball end, which matters for Story 3.4.
