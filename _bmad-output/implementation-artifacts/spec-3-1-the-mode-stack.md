---
title: 'Story 3.1: The mode stack'
type: 'feature'
created: '2026-09-29'
status: 'done'
baseline_revision: '0437b3e9c3a74c1adc2a3597c34d8a1be1e91d23'
baseline_commit: '0437b3e9c3a74c1adc2a3597c34d8a1be1e91d23'
review_loop_iteration: 0
followup_review_recommended: true
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

### Review Findings

_Code review 2026-09-29 (`bmad-code-review`, full mode, first review of this story). Scope: `git diff 0437b3e` (build commit `14ff9d4`) plus QA's untracked `test/rules-mode-stack-qa-integration.test.ts`, run from `C:/git/dragonwar/.worktrees/epic-3` (verified with `git rev-parse --show-toplevel`). The DW-290 split was compared against `git show 0437b3e:src/sim/rules/ball-controller.ts`, not re-reviewed as new code. Two layers checked the split line by line and found no drift: the seam order, the S8a early return, `pendingStrayClear`'s `===`, the S12 filter and the nine exports are unchanged. Review tier: `full-opus`. All four layers ran with no model override: blind-hunter, edge-case-hunter, verification-gap and acceptance-auditor. None failed, and no layer edited a file. Raw rows: 32 (blind 12, edge 3, verification 9, acceptance 8), grouped into 12 entries (13 rows patched, 5 closed at emission, 14 rejected): high 0, medium 3, low 9. After the patches: `pnpm test` passes 136 files / 2255 tests (2249 + 6 added by this review). `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` each exit 0. `git diff --stat -- test/replays` is empty. No review edit adds a non-ASCII byte. Rule 3: the real-runtime evidence is AC7 and QA's rows, which fold a real `createRules()` run through `advanceBackglass()`, `renderFrame()` and `rasterise()`, per the Story 2.11 precedent. Panel pixels are left to the lead's browser smoke._

**Lead observations:**

- **(a) `by-design`, with the gaps around it patched.** Lamp hooks are registered twice: in each mode's `ModeDefinition.lamps` and in `MODE_LAMP_ROLES`.
  - This is acceptable for Stories 3.4 to 3.10. A single registry is spec-bound: `lampsOf(state, hurryUpTicks)` keeps AD-9's pinned signature and has no registry in hand, and task 5 names `lamps?` in the `ModeDefinition` shape.
  - The table is a static, pure lookup, so AD-9's "pure projection, modes contribute roles by priority" holds.
  - Patched now:
    - The consistency test now requires the table's keys to equal *exactly* the production definitions that carry a hook. Before, a table entry for a definition with no hook passed.
    - `registry.ts` now tells a mode author about the second registration point. A later mode that fills in only one of the two turns that test red.
  - The constraint later stories inherit: a hook must be module-level and tuning-free, so a tuning threshold has to be published on the mode's own entry.
  - reopen_if: a mode's lamp step needs `ResolvedTuning`, or a test needs a stub definition's `lamps` composed by `lampsOf()`.
- **(b) The line scan could NOT fail for the realistic regression. MED under Rule 19, patched.** I checked `MODE_LIST_WRITE` against realistic write shapes. None of these is flagged:
  - a destructured write-back (`const { modes } = state; ... modes: modes.filter(...)`);
  - a helper (`modes: without(state.modes, e)`);
  - a spread copy;
  - a write split across lines.

  Planting the first shape in the skill shot's parking branch left `ad8-mode-lifecycle-path` green. AC2's behavioural half is now an invariant that `runRulesScript()` checks on every tick: `assertModesChangedOnlyByLifecycle()` in `test/util/switch-script.ts`. Across a step, the change in the (mode, player) multiset must equal that step's `_starting` adds minus its `_stopped` removals.
  - About 20 test files drive `runRulesScript()`, and every future mode story's rules-script tests will too. A direct write is therefore caught however it is spelled.
  - The line scan stays as a cheap second check.
  - The invariant held on all 2255 tests, so no hidden writer exists today.
  - Its controls are in `test/ad8-mode-lifecycle-path.test.ts`.
- **(c) Patched, as a mechanical LOW two-way door.** Six stale `ball-controller.ts` path mentions in comments are corrected:
  - three in `src/sim/loop/index.ts` (:33, :58, :449);
  - three in `src/sim/physics/devices.ts` (:136, :723, :748), which is authored, not ported.

  Each now names `ball-controller/`, `ball-controller/accounting.ts` or `ball-controller/ball-end.ts`. Neither path is contended with Epic 5. **Footprint extension to report:** `src/sim/loop/index.ts`, `src/sim/physics/devices.ts` and `test/util/switch-script.ts`.

**Patch (applied):**
- [x] [Review][Patch] (medium, Rule 19; lead observation (b)) **AC2's source scan could not fail for a destructured, helper-based or split-line write to `modes`.** A per-tick lifecycle-accounting invariant in `runRulesScript()` now catches it, with a control row per shape. [test/util/switch-script.ts `assertModesChangedOnlyByLifecycle`; test/ad8-mode-lifecycle-path.test.ts] fix-risk low: test harness only, and the full suite stays green under it. (verification-gap + blind-hunter + edge-case-hunter, 4 rows)
- [x] [Review][Patch] (medium) **`locateEntry()`'s fallback was untested.** It finds the same mode and player after a hook replaces its own entry, and it is the path a Hurry-up timer expiry (3.5) and any `onStopping` field write will take. Deleting it left the suite green. Added two rows:
  - a `tick` hook that decrements `timerTicks` to 0 and returns `stop: true` in the same result;
  - an `onStopping` that replaces its entry. The copy is removed, and `onStopped` sees it gone.

  [test/rules-mode-stack.test.ts, AC2 and AC4 describes] fix-risk low: test only. (blind-hunter)
- [x] [Review][Patch] (medium) **The spec's "the ball controller and the tilt controller run the stop hooks in place" had no test.** No production mode has a stop hook, so passing an empty lookup at the ball end or the Slam stayed green. Story 3.7's `_stopped` hook for `machine.multiball` depends on this. Added two rows:
  - `createBallController(…, lookup)` with logging stop hooks: each hook fires at its phase before the controller returns `ball_ended`;
  - `createTiltController(…, lookup)` on a Slam: the same order, and Attract is reached.

  [test/rules-mode-stack-integration.test.ts, AC5 describe] fix-risk low: test only. (blind-hunter)
- [x] [Review][Patch] (low; lead observation (a)) **The lamp-table consistency test passed a table entry for a definition with no hook, and `registry.ts` never mentioned `MODE_LAMP_ROLES`.** The test now checks exact key-set equality, and both doc comments are corrected. [test/rules-mode-stack.test.ts "MODE_LAMP_ROLES ..."; src/sim/rules/modes/registry.ts `ModeLampRoles`, `lamps`] fix-risk low: a doc comment and a test. (acceptance-auditor + blind-hunter + verification-gap, 3 rows)
- [x] [Review][Patch] (low) **`test/rules-lamps.test.ts` still cited the `if (!player)` guard in `lamps.ts`.** This story removed it. The comment is rewritten and the over-long re-flowed line is wrapped. [test/rules-lamps.test.ts:103-114] fix-risk low: comment only. (blind-hunter)
- [x] [Review][Patch] (low; lead observation (c)) **Six stale `ball-controller.ts` paths in `sim/loop` and `sim/physics` comments.** See (c) above. [src/sim/loop/index.ts; src/sim/physics/devices.ts] fix-risk low: comment only.
- [x] [Review][Patch] (low, Rule 19) **AC2's event-order half and AC9 had no `mutation:` line.** Three mutations were demonstrated and recorded under `## Verification` (Code review):
  - `_will_stop` and `_stopping` swapped;
  - `onStarting` run before the entry is pushed;
  - an import cycle planted in the split, for AC9's gate.

  (verification-gap + acceptance-auditor, 3 rows)

**Closed at emission:**
- [x] [Review][Dismiss] (low, `by-design`) **The published state at a player rotation already holds the next player's `[base, skill_shot]`, so "`modes[]` is empty between balls" is not visible between two published states.**
  - This is the Matrix row "Ball end, rotation" ("End state = p1's entries only") and AD-8's 2026-09-29 amendment (modes start in the same `rules.step` that emits `ball_starting`).
  - AD-7's clause is defined by its own colon: every mode gets `_will_stop` before `ball_ended`. AC5 pins that at the controller level, where `modes` is `[]` beside `ball_ended`.
  - Reopens only via an AD-7/AD-8 amendment. (blind-hunter)
- [x] [Review][Dismiss] (low, `wontfix-theoretical`) **`createRules()` handing `modeStack.registry` to both controllers is unpinned.**
  - The controllers' default is a fresh production registry holding the same definitions, and stop hooks are pure and tuning-free. So no observable outcome differs.
  - This would become real if `createRules()` accepted custom definitions, or a production stop hook closed over per-instance state. (blind-hunter)
- [x] [Review][Dismiss] (low, `wontfix-theoretical`) **A handler that stops a mode and restarts the same name for the same player on event k would deliver event k to the new entry.** The cause is `locateEntry()`'s (mode, player) fallback.
  - No mode restarts itself, and the Epic 3 plan has none.
  - This would become real if a mode's handler called `stopModes` then `startModes` for its own name on one event. (edge-case-hunter, 2 rows)
- [x] [Review][Dismiss] (low, `wontfix-accepted`, DW-294) **Nothing pins `lampsOf()`'s machine-lamp guard.** No production hook names a machine lamp, and a pin needs a `vi.mock` of `./modes` in a new file, which is past the two-way-door size. reopen_if: a `ModeLampHook` returns a key whose `TABLE.lamps` subject kind is `lock` or `ball_save` (3.2, 3.4). (verification-gap)
- [x] [Review][Dismiss] (low, `wontfix-theoretical`) **A ball start silently skips a `BALL_START_MODES` name the registry lacks.** The production registry always holds both. Only a test's stub-definition stack omits them, and it does so on purpose. This would become real if a production definition set could omit `base` or `skill_shot`. (blind-hunter)

**Rejected (14 rows):**
- `false` (blind-hunter): the P8 test "proves started-by-event-k through an illegitimate channel". `startModes()` IS the lifecycle, and `ModeEvent` includes `ModeLifecycleEvent` by the spec. Which registry Story 3.4's arbiter resolves from is 3.4's design question, not a defect here.
- `low` reject (blind-hunter): the spec's frontmatter says `status: done` while review runs. That is `bmad-build-auto`'s contract, and the reviewer does not change it.
- `low` reject (blind-hunter): the Finalize breakdown miscounts the patched rows. That is historical tracking text, and no behaviour depends on it.
- `low` reject (blind-hunter): `ModeLifecycleEvent` does not tie `type` to `mode`. `lifecycleEvent()` is the only production constructor, and tying the two needs generic template types.
- `low` reject (blind-hunter): `game-over.ts` re-exports `GameOverSequence` and nothing imports it. The re-export keeps task 1's file map, where the type lives in `game-over.ts`. It is harmless.
- `false` (verification-gap): QA's saved-drain score clause "checks two zeros". If the skill shot survived the save, the tick-12 lit-lane closure would pay the award and `withShot` would equal `control + award`. The clause fails for exactly that regression.
- `false` (verification-gap + acceptance-auditor, 2 rows): the QA file is uncommitted. That is the pipeline's normal state: QA may not commit, and the lead commits it (Rule 16).
- `low` reject (verification-gap): the "Slam control" `hasDuplicate` and the Attract-score assertions cannot fail alone. They are controls, not pins, and each row's pin is elsewhere, as the build review recorded.
- `low` reject (acceptance-auditor): `ball-controller/shared.ts` is 411 lines. The target is approximate, and the build review closed it (B20).
- `low` reject (acceptance-auditor): two Story 2.14 rows shifted one tick. Task 13's defer clause permits it, and the Auto Run Result lists it.
- `low` reject (acceptance-auditor): a second `backglass-frame` row flipped. The same DW-206 author decision drives it, and it is listed under "Unplanned".
- `false` (acceptance-auditor): the file-map deviations. The headless gate forbids `node:fs` in `rules-*` tests, and `no-circular` forbids the planned `GameOverSequence` placement. Both are recorded, and neither changes behaviour.
- `false` (acceptance-auditor): `src/sim/table/tuning.ts` is missing from the footprint-extension list. `src/sim/table/**` is inside Epic 3's footprint.

## Spec Change Log

- 2026-09-29, lead spec gate: the "AD-8 sentence" under Design Notes was written into the spine's AD-8 verbatim (Rule 20, DW-209). The AD-7 inventory is written by the lead at adjudication, from the code as delivered. Kept as one story (split first, green checkpoint), per the planner's recommendation. No spec text changed.

## Review Triage Log

### 2026-09-29 — Review pass
- verdicts: 49 findings — high 0, medium 16, low 22, false 11, maybe-false 0
- Patches P1-P17 were applied by a fresh patch subagent (Rule 18: the step-03 subagent is never re-engaged). The patch list it worked from is summarised in each row below. After the patches: `pnpm test` 135 files / 2238 tests, all gates exit 0, and `test/replays` byte-identical.
- findings (blind-hunter B1-B22, edge-case-hunter E1-E11, verification-gap V1-V8, intent-alignment I1-I8):
  - B1 `[medium]` `[patch]` `lampsOf()` composes from a static `MODE_LAMP_ROLES` table, not `ModeDefinition.lamps`, so each mode's lamp hook is registered twice and nothing ties the two together. — P1: a test asserts that every production definition's `lamps` is identical to its `MODE_LAMP_ROLES` entry and that the table names only production modes. The static table itself stays: `lampsOf` keeps its pure signature per Always and has no registry in hand.
  - B2 `[low]` `[patch]` `onStart` fields could overwrite `mode`, `priority` and `player`. — P17: `startModes` builds the entry as `{ ...fields, mode, priority, player }`, a direct reorder. The hash canonicalises key order (`sim/loop/replay.ts`).
  - B3 `[low]` `[reject]` a handler's `events` could carry a forged `ModeLifecycleEvent`. — The spec pins the handler result as `{ state, events?: ModeEvent[], stop?: true }`. No mode does this, and narrowing the type adds surface the spec did not ask for.
  - B4 `[low]` `[reject]` the test drivers (`start` / `step`) ride on the production definition objects. — Both route through `startModes` / `stopModes`, so they add no second path that writes `modes[]`. Separating them is a restructure, not a direct correction.
  - B5 `[false]` `[reject]` nothing checks that `createRules()` passes `modeStack.registry` to the controllers. — Stop hooks are pure and tuning-free by contract (Always), and no production mode has one today. A fallback registry's instances therefore stop modes identically, and no observable outcome differs.
  - B6 `[medium]` `[patch]` (with V1) tick hooks: nothing pinned their descending order, their precedence over device events, a tick hook's `stop: true`, or the per-tick decrement. — P2: logging `tick` hooks on both stubs, a per-step `[99..95]` assertion, a "tick before event" row and a tick-`stop` row, with 4 mutations recorded.
  - B7 `[low]` `[reject]` the `isMachineLamp` guard in `lampsOf()` is unreachable by any production lamp hook. — No mode returns a machine-lamp role. A test would need a new injectable surface on `lampsOf`, whose signature is pinned. reopen_if: a mode's `lamps` hook names `l_lock` or `l_ball_save`.
  - B8 `[medium]` `[patch]` (with E8, V2, I5) the AC2 source scan missed `modes = [` and several array methods. — P3: the regex is widened (`modes = [`; `.modes.` concat/slice/toSpliced/unshift/pop/shift/with/flatMap) with a control line per shape. The sanctioned count is unchanged at `modes/lifecycle.ts: 2`.
  - B9 `[medium]` `[patch]` (with V5) the AC6 type-level row: its runtime `expect` was tautological, and its real pin runs only under typecheck. — P4: the runtime assertion is removed, a comment names `pnpm typecheck` as the pin, and a mutation is recorded (a `coilCommands?` field turns TS2578 red).
  - B10 `[medium]` `[patch]` the AC8 Slam rows did not assert `modeEvents` on every tick, or scores in the "Slam and Start on one tick" row. — P5: empty `modeEvents` on ticks 7-19, exactly one start pair at tick 20, and scores 0 on ticks 6-7. The one unmutated assertion is noted in Verification.
  - B11 `[low]` `[patch]` `rules-mode-stack-integration.test.ts` escaped the headless gate by its suffix, although it drives no loop or physics. — P16: added to `ENTRY_FILES`. The completeness ratchet now ignores explicitly listed `-integration` files. The closure gate passes, and a planted `node:fs` import turns it red.
  - B12 `[low]` `[patch]` the `lifecycle.ts` header named the wrong scan test file. — P10: it now names `test/ad8-mode-lifecycle-path.test.ts`.
  - B13 `[low]` `[patch]` (with V8) stale deferred-start comments remained in the rules tests. — P11: comment-only fixes in `rules-modes.test.ts`, `rules-modes-integration.test.ts` and `rules-lamps.test.ts`.
  - B14 `[low]` `[patch]` about 25 comments still cited the deleted `ball-controller.ts`. — P12: rewritten to `ball-controller/` or the specific file within `src/sim/rules`, `src/sim/table`, `src/sim/contracts` and `test/`. Left alone: the one deliberate historical mention, and runtime strings and `describe` names. `src/sim/loop/**` and `src/sim/physics/**` are left untouched (outside footprint, comment-only). reopen_if: someone follows a stale path there.
  - B15 `[low]` `[patch]` the `RulesStepResult.modeEvents` doc said `lanes_completed` only. — P13: it now lists the lifecycle events and the tilt → controller → stack order.
  - B16 `[low]` `[patch]` the `MODE_DISPLAY_NAMES` comment said the base mode becomes top when the skill shot resolves. — P14: it now says the base mode is transparent.
  - B17 `[low]` `[reject]` `hasSomethingToShow()` repeats `buildFieldsText()`'s field list. — The spec defines "something to show" by those four fields, and this story freezes the `ModeView` shape. Deriving it from the rendered text would couple the rule to formatting. Not worth the change.
  - B18 `[false]` `[reject]` skill-shot correctness depends on the devices layer's closure-before-lane order, with no stack-level test. — `test/rules-modes.test.ts:278` ("s_top_1 (an UNLIT Top lane -- top_2 is the lit one)") runs that exact miss through `runRulesScript`, the real devices layer and the stack, and pays no award.
  - B19 `[low]` `[reject]` a new game does not stop leftover modes before starting. — No path reaches Start with `modes` non-empty: Attract is entered only through `enterAttract()`, which stops every mode. reopen_if: a state in `phase: 'attract'` with non-empty `modes`.
  - B20 `[low]` `[reject]` (with E10) `ball-controller/shared.ts` is 411 lines against the ~350 target. — The target is approximate, and the excess is the moved history comments of the five `ControllerState` fields. Every other file is at most 278 lines, and `step()` is about 55. Trimming the comments would lose provenance.
  - B21 `[low]` `[patch]` `rules-lifecycle.test.ts` used literal priorities 100/200. — P15: they now come from `MODE_PRIORITIES`.
  - B22 `[low]` `[reject]` "only through the lifecycle" rests on a source scan and a comment. — Spec-bound: task 11 specifies the scan-by-count enforcement and allows `.modes.map(`.
  - E1 `[low]` `[patch]` identity override by `onStart`. — Grouped with B2 (P17).
  - E2 `[false]` `[reject]` `stopModes` would fire a stop triple for an absent or duplicated target. — Every caller passes entries read from the state it passes: `stopAllModes` passes `state.modes`, the stack's `apply` passes `[live]` after `locateEntry`, and the solo driver passes `[live]` or `[]`.
  - E3 `[false]` `[reject]` a stop hook could leave an entry in `modes[]` at the ball end or in Attract. — No production mode has a stop hook, and any hook that adds an entry is a `modes = [` / `modes: [` write the widened scan (P3) flags outside `lifecycle.ts`.
  - E4 `[false]` `[reject]` `stop: true` after the entry is gone is silently dropped. — The stack checks `locateEntry` before every hook call, and a hook cannot remove its own entry (scan), so a `stop` with no live entry cannot arise.
  - E5 `[medium]` `[patch]` lamp hooks come from the static table. — Grouped with B1 (P1).
  - E6 `[low]` `[reject]` a stop hook's writes to the bonus or score would miss `ball_ended.total`. — Stop hooks are pure and tuning-free, and none exists. `total` is the bonus, computed before the stop exactly as before. reopen_if: a stop hook writes `players[*].bonus`.
  - E7 `[low]` `[reject]` a non-number `ModeView` field would render `null` or `NaN`. — `ModeView` types these fields `number | undefined`, their only writers are mode code, and this path already existed for named modes.
  - E8 `[medium]` `[patch]` scan regex gaps. — Grouped with B8 (P3).
  - E9 `[false]` `[reject]` removing the unconditional `modes: []` makes emptiness depend on the stop hooks. — `stopModes` removes every target it is given, whatever the hooks do, and a hook cannot add an entry without tripping the scan. The AC5 and AC8 rows assert `[]`.
  - E10 `[low]` `[reject]` `shared.ts` size. — Grouped with B20.
  - E11 `[false]` `[reject]` the `modes/index.ts` header still holds a `ballNumber` note. — The false claim ("the defer protects `ballNumber`") is gone. The remaining sentence ("`startBall()` has already incremented … `ballNumber`") is true and measured (Design Notes).
  - V1 `[medium]` `[patch]` tick-hook gaps. — Grouped with B6 (P2).
  - V2 `[medium]` `[patch]` scan regex. — Grouped with B8 (P3).
  - V3 `[medium]` `[patch]` AC6 offered every `DeviceEvent` type to the base mode only, since the skill shot resolves at event 1. — P6: every event type is offered to a freshly started skill shot, both un-launched and launched. A coil in the parking branch now turns this row red, and only this row.
  - V4 `[medium]` `[patch]` `charge` and `strikesRemaining` in `hasSomethingToShow()` were untested. — P7: two `backglass-frame` rows, each pinned by deleting its own check.
  - V5 `[medium]` `[patch]` the tautological AC6 runtime `expect`. — Grouped with B9 (P4).
  - V6 `[low]` `[patch]` AC7's listed mutation list included one that its own row cannot see. — P9: Verification now records "skill-shot award removed → AC7 row" as AC7's pin, and names the tests that pin the `currentPlayer` mutant. AC9 is pinned by the gate commands. Every mutation line has moved into `## Verification` (Rule 19).
  - V7 `[medium]` `[patch]` `ModeDefinition.lamps` has no production reader. — Grouped with B1 (P1).
  - V8 `[low]` `[patch]` stale deferred-start comments. — Grouped with B13 (P11).
  - I1 `[false]` `[reject]` the split's no-behaviour-change checkpoint is not visible in the combined diff. — The spec's mechanism is a recorded checkpoint (Auto Run Result: 132 files / 2195 tests green, replays empty after tasks 1-2). The final tree keeps every pre-existing test and the byte-identical goldens.
  - I2 `[medium]` `[patch]` lamp source reading R3b. — Grouped with B1 (P1).
  - I3 `[medium]` `[patch]` "a mode started by event k receives k+1.." had no test. — P8: a stub `quickmb` starts `hurryup` on the first of two `spinner_spin` events, and `hurryup` receives only the second. Taking the recipients once turns it red.
  - I4 `[false]` `[reject]` the timer matrix row gives `quickmb` a `value` to make it showable. — "the Backglass shows quickmb's view" presupposes that quickmb has a view, and the DW-206 rule makes a view-less mode transparent. The fixture is the only reading consistent with both, so there is no ambiguity.
  - I5 `[medium]` `[patch]` the scan is syntactic. — Grouped with B8 (P3).
  - I6 `[false]` `[reject]` the skill shot lights `lit/2` without a base entry present. — This is exactly the Always text ("the skill shot contributes `lit/2` for each lit Top lane of its player"), and no production state has a skill shot without base.
  - I7 `[low]` `[patch]` the AC7 mutant. — Grouped with V6 (P9).
  - I8 `[false]` `[reject]` test edits beyond the split's one allowed edit. — They sit in the mode-stack tasks, not the split. Each is required by a matrix row or the DW-206 decision, and task 13 lists them. The auditor itself found no conflict.

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

**Mutations** (Rule 19). Each was applied, red observed, reverted, and `git status --short` and `git diff --stat` confirmed unchanged afterwards. The implement stage's lines come from the Auto Run Result's "Mutations observed"; the review-pass-1 lines (P1-P8, P16) were run by the patch subagent.
- AC1:
  - mutation: the registry's duplicate check dropped → `rules-mode-stack` AC1 "Matrix row "Duplicate registration": [joust@310, joust@310] throws, naming both" and "Matrix row "Duplicate registration": two definitions at priority 300 throw, naming both modes and the value".
- AC2:
  - mutation: a direct empty `modes` list restored in `enterAttract` → `ad8-mode-lifecycle-path` "no file under src/sim/rules/** holds a mode-list write beyond the sanctioned ones", plus `rules-mode-stack-integration` AC8 "Slam after start" and "Slam and Start on one tick".
  - mutation: a comment line holding a `.modes.slice(` call appended to `src/sim/rules/tilt.ts` → `ad8-mode-lifecycle-path` "no file under src/sim/rules/** holds a mode-list write beyond the sanctioned ones" (P3: the widened scan sees it).
  - mutation: `MODE_LIST_WRITE` narrowed back to `modes:` plus `filter|splice|push` → `ad8-mode-lifecycle-path` "control: the pattern flags each add/remove shape and passes a field update and a read" (P3).
  - mutation: a coil in the skill shot's resolution → `rules-mode-stack` AC2 "self-resolution: a launched skill shot missed by a pop returns stop ..." (with AC6 below).
- AC3:
  - mutation: mode-major fan-out → `rules-mode-stack-integration` "Matrix row "Event-major fan-out"" and "Matrix row "Event-major control"", plus `rules-mode-stack` "event-major: two events on one tick are each offered to every mode before the next ...".
  - mutation: lamps composed in descending priority → `rules-mode-stack` "lamps: a lit Top lane is lit/2 with the skill shot on the stack ..." and "lamps: the order of modes[] does not matter ...", plus 7 `rules-lamps` rows.
  - mutation: one stub's award dropped → `rules-mode-stack` "Matrix row "Stub stack order": one spinner_spin is delivered [quickmb, hurryup, base] ...".
  - mutation: `MODE_LAMP_ROLES.skill_shot` pointed at a same-behaviour wrapper `(state, entry) => skillShotLamps(state, entry)` → `rules-mode-stack` "MODE_LAMP_ROLES (what lampsOf() composes) is each production definition's own lamps hook, and names only production modes", alone (P1).
  - mutation: `MODE_LAMP_ROLES.base` pointed at `skillShotLamps` → the same P1 test, plus "lamps: a lit Top lane is lit/2 ...".
  - mutation: the fan-out's recipients taken once before the event loop → `rules-mode-stack` "a mode started by event k receives events k+1.. and not k: quickmb starts hurryup on the first spinner_spin, and hurryup receives only the second" (P8).
  - The Backglass half of AC3 is pinned by the DW-206 lines below.
- AC4:
  - mutation: `tick` hooks run for the top mode only → `rules-mode-stack` "Matrix row "Timer under a higher mode": both tick hooks run every step, quickmb@400 before hurryup@300; ...", "the tick hooks run before the step's first device event is delivered" and "a tick hook returning stop: true stops that mode through the lifecycle ...".
  - mutation: `tick` hooks run in ascending priority → the same three tests (P2).
  - mutation: the `tick` hooks run after the device-event fan-out → "the tick hooks run before the step's first device event is delivered" and "a tick hook returning stop: true ..." (P2).
  - mutation: a `tick` hook's `stop: true` ignored → "a tick hook returning stop: true stops that mode through the lifecycle (its stop triple), and it receives none of the step's device events; ..." (P2).
- AC5:
  - mutation: the stop call removed from the ball-end teardown → `rules-mode-stack-integration` "Matrix row "Ball end, rotation" (controller level)", "(rules level)" and "Matrix row "Last ball"".
- AC6:
  - mutation: a `{ type: 'coil' }` in the skill shot's resolution → `rules-mode-stack` AC6 "driving start, every DeviceEvent type, the lamps and the stop through the production modes yields no { type: "coil" } ..." and AC2 "self-resolution".
  - mutation: a `{ type: 'coil' }` in the skill shot's parking branch for a launched entry → `rules-mode-stack` AC6 "every DeviceEvent type offered to a live skill shot, from a fresh entry each time (launched false, then launched true): no hook output holds a coil" (P6). The older AC6 row stays green: after its resolving hit the skill shot is gone, so it never reaches that branch.
  - mutation: `readonly coilCommands?: readonly CoilCommand[]` added to `ModeHookResult` → `pnpm typecheck` red, `test/rules-mode-stack.test.ts` TS2578 "Unused '@ts-expect-error' directive" (P4: the type-level row has no runtime assertion; its pin is the two `@ts-expect-error` lines).
- AC7:
  - mutation: the skill-shot award removed → `rules-mode-stack-integration` AC7 "Start, plunge, the lit Top lane, a pop: ...", plus "control, "Slam control"" and "Matrix row "Event-major fan-out"".
  - The "base pays `currentPlayer`" mutant leaves the AC7 row green: it is a single-player run, and a real run cannot make `currentPlayer` differ from the mode's player. That mutant is pinned by `rules-scoring` "Matrix row "Hot seat" -- the base mode pays its own active.player" / "the payee is the mode's own player, never currentPlayer ..." and `rules-modes` "AD-7 player scoping ..." / "base mode: a lane entry lights the lane for the mode's player, leaving the other player untouched".
- AC8:
  - mutation: the one-tick deferred start restored (a `pendingStartPlayer` closure in `createModeStack`) → `rules-mode-stack-integration` "Matrix row "Ball start, same tick"", "Matrix row "Slam after start"" (red on tick 6's `modes`), "Matrix row "Slam and Start on one tick"" (red on tick 6's `rng`), "Matrix row "Ball end, rotation" (rules level)" and AC7 (`ARM YOURSELF` first at tick 6, not 5).
  - mutation: `startModes()` orders by descending priority → "Matrix row "Slam after start"" red first on its new tick-20 `modeEvents` assertion ("the next Start: the base start triple, then the skill_shot one, and nothing else"), plus five other rows (P5).
  - mutation: a new player's `score: 0` set to 1 in `ball-controller/start.ts` → "Matrix row "Slam and Start on one tick"" red on "tick 6: every player's score is 0" (P5).
  - The P5 assertion that `modeEvents` is empty on ticks 7-19 has no mutant of its own: every mutant tried that leaks a lifecycle event into Attract also moves tick 6's `modes`, `rng` or stop triple, which the row asserts first.
- AC9: pinned by the gate commands above (`pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`, and the empty `git diff --stat -- test/replays`). Its mutation line is under "Code review (2026-09-29)" below.
- DW-206:
  - mutation: the `modeName` gate on the fields line restored → `backglass-frame` "an unmapped mode id that ALSO publishes a ModeView field (timerTicks) shows the field (1.0) ...", "Matrix row "Unlabelled field publisher"", the "control: a HIGHER unlabelled mode that publishes a field owns both lines ..." row, "DW-206: an unlabelled mode publishing timerTicks shows its field and no name, even with the 2x2 grid engaged", and `rules-mode-stack` AC4 "Matrix row "Timer under a higher mode"".
  - mutation: "highest priority regardless" restored in `selectTopMode()` → `backglass-frame` "Matrix row "Transparent unlabelled"".
  - mutation: `mode.charge !== undefined` deleted from `hasSomethingToShow()` → `backglass-frame` "an unlabelled mode above the skill shot publishing ONLY charge owns the fields line, and ARM YOURSELF is absent" (P7).
  - mutation: `mode.strikesRemaining !== undefined` deleted from `hasSomethingToShow()` → `backglass-frame` "an unlabelled mode above the skill shot publishing ONLY strikesRemaining owns the fields line, and ARM YOURSELF is absent" (P7).
- Headless gate (P16):
  - mutation: `import { readFileSync } from 'node:fs'` added to `test/rules-mode-stack-integration.test.ts` → `rules-devices-headless` "no module anywhere in the closure names a forbidden specifier".

**QA stage (2026-09-29).** Each mutation below was applied, red observed, reverted, and `git status --short -- src test` plus `git diff -- src test` confirmed byte-identical afterwards (the untracked QA file by sha256). One suite per call, `BLENDER` exported.

*Files (QA):*
- `test/rules-mode-stack-qa-integration.test.ts` (QA, new): 11 real-runtime rows through `runRulesScript()` / `createRules()`, plus the Backglass fold and `rasterise()`.
- `test/rules-devices-headless.test.ts` (QA, edited): the new file is added to `ENTRY_FILES`. It drives no loop or physics, so it is gated as headless like `rules-mode-stack-integration.test.ts`.

*Independent re-verification of the implement stage's and the patch subagent's pins.* Each recorded mutation was re-applied by QA and went red on the named test: the one-tick deferred start restored as a `pendingStartPlayer` closure (AC8 rows, AC5 rules level, AC7), mode-major fan-out (the Event-major pair), P1 (`MODE_LAMP_ROLES.skill_shot` wrapper), P2 (tick hooks ascending: three AC4 rows), P3 (the regex narrowed: the control row), P5 (new player `score: 1`), P6 (a coil in the parking branch: the P6 row only), P7 (`charge` and `strikesRemaining` each deleted: its own row only), P8 (recipients taken once: the P8 row only) and P16 (a `node:fs` plant in `rules-mode-stack-integration.test.ts`). P16's ratchet change is sound: it only stops an explicitly listed `-integration` file from failing the ratchet. A stale listed path still fails loudly, because `importClosure()` reads every entry with `readFileSync`.

*QA mutations* (`rules-mode-stack-qa-integration` = RMSQ):
- DW-290 / the split (Always: "keep its early return"):
  - mutation: the S8a early return removed, so a saved drain still re-serves but then falls through to S9-S12 → RMSQ "the save's early return (S8a) still skips S9-S12: a trough overflow reported on the saved drain's tick gets no answer ...", **alone**. Every pre-existing suite stayed green under it (`rules-ball-save`, `rules-ball-save-integration`, `rules-bonus`, `rules-stray-clear`, `rules-ball-search`, and the whole `test/rules-*` / `ball-search*` / `stray-clear*` / `game-over*` / `backglass-integration` subset of 31 files). No test pinned the early return before this.
  - mutation (probe, already pinned): `pendingStrayClear === pendingStrayClearAtStart` replaced by `true` → `rules-stray-clear` DW-269 "the FIRST clear's own report at t+1 stays silent ...". No new test was needed.
- AC8:
  - mutation: the tilt controller's `modeEvents` dropped from the root concatenation (`rules/index.ts`) → RMSQ "a Slam during hot-seat player 1's ball ..." and "Slam + Start on one tick with the Start edge listed BEFORE the Slam ...".
  - mutation: `stopModes()` stamps `_will_stop` with player `0` instead of the entry's player → RMSQ "a Slam during hot-seat player 1's ball ...", **alone**. No earlier test read a stop event's `player`.
- AC3:
  - mutation: mode-major fan-out → RMSQ "the first Top lane lit, then the left flipper and the lane it rotates onto ..." and its control, plus the two existing Event-major rows.
- AC5 (the split's save / search / game-over paths under the real stack):
  - mutation: the stack also starts the ball-start modes on `ball_saved` → RMSQ "a saved drain re-serves the SAME ball ...", plus `rules-ball-save` "drain inside the window ...".
  - mutation: `machineReport.recovered === null` dropped from `ballEndGateOpen()` → RMSQ "a ball-search recover whose park lands in the trough is never a ball end ...", alone in the suites run.
  - mutation: the stack also starts the ball-start modes on `match_drawn` → RMSQ "a whole game over -> Match -> Attract -> Start ...", **alone**. The existing "Last ball" row runs only 2 ticks. A `game_ended` variant turns both red.
- DW-206 on the rasterised DMD:
  - mutation: `selectTopMode()` ignores `hasSomethingToShow()` → RMSQ "symptom 1 ("Transparent unlabelled") ... dot-for-dot identical".
  - mutation: the fields line gated on `modeName !== undefined` again → RMSQ "symptom 2 ("Unlabelled field publisher") ... exactly the base panel plus the fields-line dots ...".

*After QA:* `pnpm test` 136 files / 2249 tests green; `typecheck`, `lint:boundaries` and `check:headers` exit 0; `git diff --stat -- test/replays` is empty; both QA-touched test files are pure ASCII. `mutations_demonstrated=10` new, plus 11 re-verified.

**Code review (2026-09-29).** Each mutation below was applied, red observed, reverted, and `git status --short` plus a sha256 of `git diff` and the untracked QA file confirmed byte-identical afterwards. One test file set per call, `BLENDER` exported.
- AC2:
  - mutation: the skill shot's parking branch removes its own entry by a destructured write-back (`const { modes } = state; ... modes: modes.filter((m) => m !== entry)`) instead of returning `stop: true` → `ad8-mode-lifecycle-path` stays green (the line scan cannot see it). `rules-mode-stack-qa-integration` goes red through `runRulesScript()`'s `assertModesChangedOnlyByLifecycle()`: "a saved drain re-serves the SAME ball ..." ("tick 1: ... skill_shot/p0 removed x1") and "a ball-search recover whose park lands in the trough ...".
  - mutation: `_will_stop` and `_stopping` swapped in `stopModes()` → `rules-mode-stack` AC2 "stop: will_stop (entry present), stopping ..." plus 6 other stop-triple rows.
  - mutation: `onStarting` run before the entry is pushed in `startModes()` → `rules-mode-stack` AC2 "start: will_start (no entry yet), starting (entry pushed, onStarting runs), started ...", alone.
  - mutation: `locateEntry()`'s (mode, player) fallback replaced by `return undefined` → `rules-mode-stack` "stop: an onStopping hook that replaces its own entry ..." and AC4 "a timer running out: the tick hook replaces its own entry ...", alone in that file.
  - The invariant's own controls (`ad8-mode-lifecycle-path` "runRulesScript() rejects any tick ...") pin each shape directly: a removal with no stop triple, an add with no start triple, a missing `_stopped`, and another player's triple.
- AC5 / the stop hooks run in place:
  - mutation: `stopAllModes(nextState, tick, { get: () => undefined })` in `ball-controller/ball-end.ts` together with the same empty lookup passed to `enterAttract()` in `tilt.ts` → `rules-mode-stack-integration` "the ball end runs the registry's stop hooks in place ..." and "the Slam runs the registry's stop hooks in place ...". With `tilt.ts` alone mutated, only the Slam row goes red.
- AC9:
  - mutation: `import type { GameOverSequence as CycleProbe } from './game-over';` added to `ball-controller/shared.ts` → `pnpm lint:boundaries` exits 2 (`[no-circular] src/sim/rules/ball-controller/game-over.ts → src/sim/rules/ball-controller/shared.ts`). AC9's pin is the gate commands, and this shows the gate can fail on the split's own structure.

## Auto Run Result

Status: done
Blocking condition: none

Planned at `a2b8a1bea37a7e6461f31f2d00ee0d8bab950dee` on `DW-1-epic3`. The run halted after planning, as the invocation asked. It used the committed `epic-3-context.md` without recompiling it, and Story 3.0a's spec for continuity. Four read-only measurement subagents informed the plan: the ball-controller seams, the lifecycle timing and the Slam path (confirmed by probe), the fan-out, Backglass and lamps, and the closure-state inventory. Warnings: `multiple-goals` (the DW-290 split plus the stack; see Design Notes, "Size") and `oversized`. One deferred planning finding is in the frontmatter: `modesPlayed` credits base and skill_shot at every ball end, which matters for Story 3.4.

**Implement stage, task-2 checkpoint (DW-290 split).** `ball-controller.ts` moved with `git mv` to `ball-controller/index.ts` and split into `shared.ts` (leaf), `accounting.ts`, `start.ts`, `save-serve.ts`, `ball-end.ts`, `game-over.ts`, `serve-recovery.ts`. The one deviation from the file map: `GameOverSequence` is declared in `shared.ts` and re-exported from `game-over.ts`, because `ControllerState` (in the leaf) holds it and dependency-cruiser counts a type-only import as a cycle edge (measured: `no-circular` fired on `game-over.ts -> shared.ts`). The only test edit is `test/ad8-score-write-path.test.ts`'s `SANCTIONED` keys (`ball-controller/start.ts: 1`, `ball-controller/ball-end.ts: 1`; total 3). At the checkpoint: `pnpm test` 132 files / 2195 tests green, `typecheck`, `lint:boundaries` and `check:headers` green, `git diff --stat -- test/replays` empty.

**Implement stage, tasks 3-13 (the mode stack).**
- New: `modes/priorities.ts` (`MODE_PRIORITIES`, `ModeName`), `modes/registry.ts` (`ModeDefinition`, `createModeRegistry`, which throws on a duplicate name or priority and, with `requireTablePriorities`, on an off-table priority; `createModeStack` always passes it), `modes/lifecycle.ts` (`startModes`, `stopModes`, `stopAllModes`, `locateEntry`, and `soloModeDriver`). `ModeEvent` widened with `ModeLifecycleEvent`.
- `onStart` is read as "the new entry's mode-local fields" (the skill shot's `launched: false`), and `onStarting` does the start-of-life writes. `createBaseMode` / `createSkillShotMode` return the `ModeDefinition` plus a `start` / `step` pair (`soloModeDriver`) that goes through the same lifecycle functions. That keeps `test/rules-scoring.test.ts` and the Story 2.14 direct `start()` tests unchanged.
- Stop hooks reach the ball and tilt controllers through a registry parameter. `createRules()` builds the stack first and passes `modeStack.registry` to `createBallController(adjustments, tuning, modes?)` and `createTiltController(adjustments, tuning, modes?)`. When the parameter is omitted (tests), the default is a fresh production registry. `enterAttract(state, tick, modes)` now also returns `modeEvents`. `BallControllerStepResult` and `TiltControllerStepResult` gain `modeEvents`. The root concatenates tilt, then controller, then stack.
- Lamps: `lampsOf` reads `MODE_LAMP_ROLES`, a static name-to-hook table exported by `./modes`. It holds the same functions the production definitions carry, because `lampsOf` has no stack instance and keeps its signature. A stub definition's `lamps` hook is therefore not composed by `lampsOf`.

**Test edits beyond the planned three** (each diagnosed; listed per task 13):
- `test/rules-modes.test.ts`: the planned `:128` edit. The file's DEFERRED START header paragraph is rewritten to match. Two Story 2.14 rows pin the one-tick defer by reading the draw at `startTick + 1`, so their tick indices shift by one: AC 4 (`get(5)/get(6)` becomes `get(4)/get(5)`) and AC 6 (`get(31)/get(32)` becomes `get(30)/get(31)`). No assertion changed. **This conflicts with Code Map's "the Story 2.14 suite must stay unchanged":** both rows pin the defer, which is the class task 13 permits.
- `test/rules-lifecycle.test.ts:197`: as planned. The `modesPlayed` assertions are untouched.
- `test/backglass-frame.test.ts`: the planned `:1539` flip, plus the two new DW-206 rows and one control. **Unplanned:** a second DW-206 pin, the AC 9 (DW-197) row "an unlabelled mode publishing timerTicks contributes no row and no dot, even with the 2x2 grid engaged", asserted the pre-decision behaviour and went red. It flips by the same author decision and now asserts `1.0` at row 24 with no name.
- `test/rules-devices-headless.test.ts`: `rules-mode-stack.test.ts` is added to `ENTRY_FILES`, which that file's completeness ratchet requires.
- The AC2 source scan reads the filesystem, which the headless gate forbids in `test/rules-*.test.ts`. It therefore lives in `test/ad8-mode-lifecycle-path.test.ts` (the `ad8-score-write-path` precedent), with `modes/lifecycle.ts: 2` sanctioned. It is not in `test/rules-mode-stack.test.ts` as task 11 named.

**Final verification.** `pnpm test` 135 files / 2231 tests green. `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` all exit 0. `git diff --stat -- test/replays` is empty, and all five goldens' transitions have `start: false`. Size: `ball-controller/shared.ts` is 411 lines, over the ~350 target. The excess is the five `ControllerState` fields' moved history comments. Every other file is at most 278 lines, and `step()` in `ball-controller/index.ts` is about 55 lines.

**Mutations observed** (each applied, red observed, reverted; `git status --short` and `git diff` hashes unchanged after each):
- AC1, duplicate check dropped: `rules-mode-stack` AC1 "[joust@310, joust@310] throws" and "two definitions at priority 300 throw".
- AC2, direct empty `modes` in `enterAttract`: `ad8-mode-lifecycle-path` "no file ... holds a mode-list write", plus integration AC8 "Slam after start" and "Slam and Start on one tick".
- AC3:
  - mode-major fan-out: integration "Event-major fan-out" and "Event-major control", plus unit "event-major: two events on one tick".
  - lamps composed in descending order: unit "lamps: a lit Top lane is lit/2 ..." and "the order of modes[] does not matter", plus 7 `rules-lamps` rows.
  - one stub's award dropped: unit "Stub stack order".
- AC4, tick hooks for the top mode only: unit "Timer under a higher mode".
- AC5, ball-end stop removed: integration "Ball end, rotation (controller level)", "(rules level)" and "Last ball".
- AC6, a coil in the skill shot's resolution: unit AC6 "driving start, every DeviceEvent type ..." and AC2 "self-resolution".
- AC7:
  - skill-shot award removed: integration AC7 row, plus "Slam control" and "Event-major fan-out".
  - base pays `currentPlayer`: **the AC7 row stays green.** It is a single-player run, and a real run cannot make `currentPlayer` differ from the mode's player. The mutant is caught by `rules-scoring` "Hot seat -- the payee is the mode's own player" and `rules-modes` "AD-7 player scoping -- base mode: a lane entry lights the lane for the mode's player".
- AC8, one-tick deferred start restored: integration "Ball start, same tick", "Slam after start" (red on `modes` in Attract at tick 6), "Slam and Start on one tick", "Ball end, rotation (rules level)" and AC7.
- DW-206:
  - `modeName` gate restored: frame "an unmapped mode id that ALSO publishes ... shows the field (1.0)", "Unlabelled field publisher", the control, the 2x2-grid row and unit AC4.
  - highest priority regardless: frame "Transparent unlabelled".

**Finalize (build-auto step 04, 2026-09-29).**

*Summary.*
- **DW-290:** `ball-controller.ts` is split into `ball-controller/` with no behaviour change. The green checkpoint was recorded before the mode work.
- **Mode stack:** `src/sim/rules/modes/` is generalised:
  - one priority table and a registry that throws on duplicates;
  - the six-event lifecycle (`lifecycle.ts`) as the only writer of `modes[]`, proven by a source scan;
  - base and the skill shot start in the same `rules.step` as `ball_starting`, with no arming state (DW-209);
  - per-tick hooks, then event-major fan-out in descending priority;
  - stop triples from the ball end, the Slam and self-resolution, concatenated as tilt, then controller, then stack;
  - lamp roles composed in ascending priority over machine lamps that no mode can override.
- **Backglass (DW-206):** the Backglass shows the highest-priority mode with something to show.

*Files changed* (51 under `src/` and `test/`, plus this spec):
- `src/sim/rules/ball-controller.ts` → deleted. It is replaced by `ball-controller/{index,shared,accounting,start,save-serve,ball-end,game-over,serve-recovery}.ts`, which is the split plus the `stopAllModes` calls in `ball-end.ts` and `shared.ts` (`enterAttract`).
- `src/sim/rules/modes/priorities.ts`, `registry.ts`, `lifecycle.ts` (new): the table, the definition shape and registry, and `startModes` / `stopModes`.
- `src/sim/rules/modes/index.ts`, `base.ts`, `skill-shot.ts`, `events.ts`: the stack, the two modes as `ModeDefinition`s, and `ModeLifecycleEvent`.
- `src/sim/rules/index.ts`, `tilt.ts`: registry sharing, `modeEvents` concatenation, and the Slam stop path.
- `src/sim/rules/lamps.ts`: priority composition.
- `src/presentation/backglass/frame.ts`: `selectTopMode` / `buildScoreRows` per DW-206.
- Comment-only path fixes (P12) in `src/sim/rules/{ball-save,ball-search,bonus,match,scoring}.ts`, `devices/{events,index}.ts`, `src/sim/table/tuning.ts` and `src/sim/contracts/events.ts`.
- Tests:
  - new: `test/rules-mode-stack.test.ts`, `test/rules-mode-stack-integration.test.ts`, `test/ad8-mode-lifecycle-path.test.ts`;
  - edited: `test/ad8-score-write-path.test.ts`, `rules-modes`, `rules-lifecycle`, `backglass-frame`, `rules-devices-headless`, plus comment-only edits in 14 other test files.

*Review findings breakdown.*
- 49 findings: high 0, medium 16, low 22, false 11.
- Patched: 17 items (P1-P17), covering 30 rows. These are 8 medium entries (lamp-table consistency, tick hooks, scan regex, AC6 type row, AC8 per-tick assertions, AC6 skill-shot coverage, DW-206 `charge` / `strikesRemaining`, started-by-event-k) and 11 low (P9-P17).
- Deferred: 0 new. The one planning item (`modesPlayed` credit) stays.
- Rejected, with reasons in the triage log:
  - B3 and B22: spec-bound;
  - B4, B7, B17, B19, B20/E10, E6, E7: low and not worth a guard or restructure;
  - B5, B18, E2, E3, E4, E9, E11, I1, I4, I6, I8: false.

*Follow-up review recommendation: `true`.* Patched counts at entry verdict: high 0, medium 8, low 11. The specific unverified risk: the P1-P8 and P16 tests and their `mutation:` lines were written and self-observed by the patch subagent, and no independent review layer has re-read them. That includes P16's change to the headless completeness ratchet, which now ignores explicitly listed `-integration` files.

*Verification performed* (after the patches, by this stage, one suite per call, with `BLENDER` exported):
- `pnpm test`: 135 files / 2238 tests passed.
- `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` each exit 0.
- `git diff --stat 0437b3e -- test/replays` is empty, and no golden `transitions[*].frame.start` is `true`.
- No non-ASCII bytes in the changed rules, Backglass or new test sources.
- Matrix Test Audit: all 14 matrix rows are covered by named, executed, passing tests. The row "Base only" is `backglass-frame.test.ts:1486`, unchanged.

*Residual risks.*
- `ball-controller/shared.ts` is 411 lines, over the ~350 target.
- `MODE_LAMP_ROLES` is a second registration point for lamp hooks. It is now pinned by a consistency test, and every later mode must add its hook there too.
- The AC8 "empty `modeEvents` on ticks 7-19" assertion has no mutant of its own.
- Comments in `src/sim/loop/**` and `src/sim/physics/**` still cite `ball-controller.ts` (outside the footprint).
- Code Map said "the Story 2.14 suite must stay unchanged"; two of its rows shifted one tick under task 13's defer clause.
- Footprint extensions to report: `src/presentation/backglass/frame.ts`, `src/sim/contracts/events.ts` (comment only), `test/*.test.ts`.
- The lead-run browser smoke is still to do (Design Notes).
