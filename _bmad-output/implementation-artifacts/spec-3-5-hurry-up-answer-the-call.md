---
title: 'Story 3.5: Hurry-up -- answer the call'
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_revision: 'eb7e82ca610c0fdf7d3df990d4b34f683d45a742'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 3.4 registered Hurry-up (`modes/hurry-up.ts`, priority 300) as a shell. The shell has a name, a priority and a lifecycle, and nothing else. A started Hurry-up has no value and no timer, the Backglass shows nothing for it, and a Ramp shot collects nothing. FR-34 asks for a value that decays from 250,000 to a 50,000 floor over 20 s, collected at the Ramp, with the decaying value on the Backglass.

**Approach:**
- Fill the shell. At `_starting`, Hurry-up records its start tick.
- Every tick, its `tick` hook publishes the current `value`, and `timerTicks` while the value is still decaying, on its own `modes[]` entry (its `ModeView`).
- A `shot_ramp_made` pays the current value through `scoring.ts`, emits `hurryup_collected`, and stops the Mode through the lifecycle.
- The ball end stops the Mode and pays nothing.
- Four new tunables, one new `TABLE.modeWiring` key, and a Backglass display name.

**Author decision (2026-09-30, relayed by the lead; binding):** the Ramp insert's `hurryup` role, step 1 moving to step 3 in the last `hurryUpUrgentMs`, moved to Story 3.3c. This story still authors `hurryUpUrgentMs`, and it shows the running value on the Backglass.

## Boundaries & Constraints

**Always:**
- **Arithmetic (AD-3).** Write S = `hurryUpStartValue` (250000), F = `hurryUpFloor` (50000) and T = `max(1, shotWindowTicks('hurryUpMs'))` (20000 at `TICK_HZ` 1000). T is resolved once, in `createHurryUpMode(tuning)`.
  - `startTick` is the tick passed to `onStart`, the tick of `mode_hurryup_started`.
  - `e = max(0, tick - startTick)` is the elapsed time.
  - `value(e) = e >= T ? F : F + Math.floor((S - F) * (T - e) / T)`. It rounds down, so the value never pays above the straight line. Both ends are exact: `value(0) = S` and `value(T) = F`.
  - `timerTicks(e) = T - e` while `e < T`. At `e >= T` the field is absent, because the timer has run out.
  - At the defaults, `value(e) = 250000 - 10e` for 0 <= e <= 20000, which is a multiple of 10 on every tick. No other scoring grain exists: `awardScore` adds the integer it is given.
- **Publication (AD-7, AD-9).**
  - The entry is `{ mode, priority, player, startTick, value, timerTicks? }`.
  - `onStart` returns `{ startTick: tick, value: S, timerTicks: T }`.
  - The `tick` hook replaces its own entry each step through `state.modes.map(...)` (the skill shot's `launched` pattern), writing `value(e)` and `timerTicks(e)`, and drops `timerTicks` at `e >= T`.
  - The hook never pauses, and nothing else writes the entry. A higher mode never suppresses it (AD-8).
- **The collect.** The event is `${TABLE.modeWiring.hurryUpCollectShot}_made`, where the new wiring key is `hurryUpCollectShot: 'shot_ramp'` (AD-16: no `shot_` literal in rules). It is handled only while `scoringOpen(state)`:
  - `awardScore(state, entry.player, value(e))`;
  - the event `hurryup_collected { player, value, tick }`;
  - `stop: true`.

  Under Tilt, or outside a game, the event is ignored: no award, no event, no stop.
- **The collecting tick also lights (FR-27/FR-33 with FR-34, measured).** The fan-out is event-major, highest priority first (AD-8). So on the collecting tick:
  - Hurry-up (300) pays and stops;
  - then the base mode (100) receives the same `shot_ramp_made` and lights the round rule's next Mode.

  Both happen. FR-27 says "each Ramp shot advances the 'light a Mode' progression"; FR-34 collects at the Ramp. The two do not conflict.
- **The floor holds.** At `e >= T`, Hurry-up stays active with `value = F` until a Ramp collects it (paying exactly F) or the ball ends.
- **The ball end pays nothing.** Hurry-up has no `onStopping` or `onStopped` hook. The ball end, the Slam and the Attract entry stop it through `stopAllModes`, with no award and no `hurryup_collected`.
- **Under a higher mode (FR-41, AD-8).** The value depends only on the Mode's own `startTick`, so a Quick multiball start (400) changes nothing. The stack offers every event to every active mode, so a Ramp shot still reaches Hurry-up.
- **Events.** `HurryUpCollectedEvent { type: 'hurryup_collected'; player; value; tick }` joins the `ModeEvent` union (`modes/events.ts`). It deliberately has no `mode` field, so the lifecycle filters that test `'mode' in event` never count it. It stays off `SemanticEvent`: no presentation reader exists (the `lanes_completed` criterion).
- **Tuning** (`tuning.ts`, after `modeSelectHoldMs`). Every new entry is `unverified` and names Story 3.11 as its owner.
  - `hurryUpStartValue` 250000, `hurryUpFloor` 50000 and `hurryUpMs` 20000. Each source names PRD FR-34 and quotes it verbatim: `"start 250,000 decaying to a 50,000 floor over 20 s"`.
  - `hurryUpUrgentMs` 5000. Its source is an authored placeholder, "the last quarter of hurryUpMs", and names Story 3.3c as the consumer. It has no double-quoted phrase, because FR-34 does not state it.
- **The Backglass** (`frame.ts`):
  - `MODE_DISPLAY_NAMES` gains `hurryup: 'HURRY-UP'`, so the status line reads `HURRY-UP` with `BALL n`.
  - The existing fields line shows `timerTicks` and `value`: `20.0  250000` at e = 0, and `50000` alone on the floor.
  - No other layout change. DW-311 is measured and accepted: see Design Notes.
- **Goldens.** Only the headers move: `tableHash`, and six `gameStart.tuning` keys (`hurryUpStartValue`, `hurryUpFloor`, `hurryUpMs`/`Ticks`, `hurryUpUrgentMs`/`Ticks`).
- **Tests.** Every AC has a pinning test with a `mutation:` line (Rule 19). Every negative is paired with its positive. Ticks come from `resolveTuning()`. Expected values are computed in the test from the tunables, or written as hand literals, and never by calling Hurry-up's own function. Non-ASCII in source is written as escapes (Rule 14).

**Never:**
- Never touch `TABLE.lamps`, `sim/rules/lamps.ts`, `MODE_LAMP_ROLES` or any insert. They belong to Story 3.3c.
- Never touch the paths contended with Epic 5: `src/presentation/mechanisms/**`, `src/presentation/scene/**`, `assets/src/**`, `public/assets/**`, `tools/make-placeholder-blend.py` and `ATTRIBUTIONS.md`.
- Never write `score` except through `awardScore`. Never add or remove a `modes[]` entry outside `lifecycle.ts`. Never emit a `CoilCommand` from a mode.
- Never add a `machine` field or a top-level `GameState` field, and never change `ModeView` or `contracts/**`.
- Never let a golden's `expectedHash`, `expectedGameStateHash`, `transitions` or `checkpointTicks` move. That is an intent gap: HALT.
- Never build Quick multiball's second ball, or `machine.multiball`. That is Story 3.7.
- Never touch `src/sim/physics/**`, the spine or `epics.md`.

## I/O & Edge-Case Matrix

The rows are headless, through `runRulesScript` on a real `createRules()`, reusing `test/rules-campaign.test.ts`'s helpers: `gameState`, `capture`, `ramp` and `press`.
- **t0** is a capture of `s_lock_1` with lit `[hurryup]` and credits 0. It emits `[locked, mode_start]`, and Hurry-up starts at t0.
- **v(e)** is `S - (S - F) * e / T`, computed from `resolveTuning()` at an `e` that divides exactly. At the defaults it is 250000 - 10e.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Start | capture at t0 | entry at t0: `value` S, `timerTicks` T; at t0+1: v(1), T-1 | No error expected |
| Decay end | ticks advance | at t0+T-1: `value` F + (S-F)/T (50010 at the defaults), `timerTicks` 1. At t0+T: `value` F, no `timerTicks`. At t0+T+5000: F, no `timerTicks`, still in `modes[]` | No error expected |
| Rounding | override S 100, F 0, `hurryUpMs` 3 | values at e = 0..4: 100, 66, 33, 0, 0; `timerTicks` 3, 2, 1, absent, absent | No error expected |
| Zero ms | `hurryUpMs` 0 | T clamps to 1: at e0, S and `timerTicks` 1; at e1, F with no timer | No error expected |
| Collect | Ramp at t0+1000 | score += v(1000) (240000). `modeEvents`@t: `[hurryup_collected{0, 240000}, will_stop, stopping, stopped]`. `hurryup` has left `modes[]`. `modesLit` = [quickmb] on the same tick. Control: the same Ramp with no Hurry-up running also lights [quickmb] | No error expected |
| Tilted Ramp | tilted, then a Ramp at t0+1000 | score unchanged; no `hurryup_collected`; `hurryup` still active; `modesLit` unchanged. Control: the Collect row | No error expected |
| Floor collect | Ramp at t0+T+3000 | score += F exactly; `hurryup_collected{value: F}` | No error expected |
| Ball end | a drain while Hurry-up runs, with no Ramp | the stop triple comes before `ball_ended`; no `hurryup_collected` anywhere; the score's change at the drain tick equals `ball_ended.total` | No error expected |
| Hot seat | player index 1's Hurry-up; Ramp | `players[1].score` += v(e); `players[0]` untouched | No error expected |
| Quick MB on top | lit [hurryup, quickmb]; capture → window; Start confirms hurryup at t0; a second capture at t1 starts quickmb; Ramp at t2 | at t1+k, Hurry-up's value is v(t1+k-t0). At t2: score += v(t2-t0), `quickmb` still active, `hurryup` stopped, `modesLit` = [joust] | No error expected |
| 3.7 stand-in | `createModeStack` with base, the real Hurry-up, and a stub `quickmb`@400 that has a `tick` hook and pays 1000 on the Ramp | Hurry-up's value still v(e); the Ramp pays 1000 + v(e); Hurry-up stops, the stub stays | No error expected |
| Ball search | 3.2 AC 8's `stuckState({ held: 2 })` with a real `hurryup` entry, `startTick` 0, decaying at the Lock stage | no `show_dragon_mouth_open` and no `c_mouth`. Control: the entry at the floor (a `hurryUpMs` override short enough that e >= T at the Lock stage) opens the Mouth at `slotTick(O, 6)` | No error expected |

</intent-contract>

## Code Map

Measured at `50c97ce8522f7915ead265849eca5f04c9e7342d` on `DW-1-epic3`.

- `src/sim/rules/modes/hurry-up.ts`: the shell (`createHurryUpMode()`, an identity `onEvent`). Fill it in:
  - `createHurryUpMode(tuning: ResolvedTuning)`, with `onStart`, `tick` and `onEvent`;
  - rewrite the file header;
  - no `lamps`, and no stop hooks.
- `src/sim/rules/modes/index.ts:91` `createProductionModeDefinitions(tuning)`: pass `tuning` to `createHurryUpMode`. `createProductionModeRegistry` (:95) is used by the ball controller (`ball-controller/index.ts:105`) and the tilt controller (`tilt.ts:110`), and needs no change.
- `src/sim/rules/modes/index.ts:151-193` `step()`:
  - step 1 runs the `tick` hooks before the events;
  - step 2 is the event-major fan-out. `apply()` (:135) pushes the handler's events before the stop triple.
  - Read-only.
- `src/sim/rules/modes/registry.ts:49-67` `ModeDefinition`: `onStart` returns the entry's own fields; `tick` returns `ModeHookResult`. Read-only.
- `src/sim/rules/modes/lifecycle.ts:59` `startModes`, which the arbiter calls through `campaign.ts:86` `startCampaignMode`, with the tick. Read-only.
- `src/sim/rules/modes/skill-shot.ts:230-232`: the entry-update pattern (`state.modes.map((mode) => (mode === entry ? {...} : mode))`), which `test/ad8-mode-lifecycle-path.test.ts:27` allows.
- `src/sim/rules/modes/events.ts:60`: the `ModeEvent` union. Add `HurryUpCollectedEvent`, and re-export it from `modes/index.ts:60` and `sim/rules/index.ts:120`.
- `src/sim/rules/modes/base.ts:105,263` `LIGHT_MODE_EVENT`: build Hurry-up's collect event the same way from `TABLE.modeWiring.hurryUpCollectShot`. Base's lighting is unchanged, and it is what lights on the collecting tick.
- `src/sim/rules/scoring.ts:28` `scoringOpen` and `:37` `awardScore`.
- `src/sim/rules/ball-search.ts:292`: `timerRunning = state.modes.some((m) => m.timerTicks !== undefined)`. This is an existing consumer of `timerTicks`, now reachable with a real Mode. Read-only.
- `src/sim/table/dragonwar.ts:626-629` `modeWiring`: add `hurryUpCollectShot: 'shot_ramp'`.
- `src/sim/table/tuning.ts:375-384`: add the four entries after `modeSelectHoldMs`. `resolveTuning` (:983) derives `hurryUpTicks` and `hurryUpUrgentTicks` automatically. `shotWindowTicks` is at :1087.
- `src/presentation/backglass/frame.ts`:
  - :791 `MODE_DISPLAY_NAMES`: add `hurryup`. `CAMPAIGN_DISPLAY_NAMES` (:803) is declared after it, so use the literal `'HURRY-UP'`, or move the declaration;
  - :826 `hasSomethingToShow`, :847 `selectTopMode`, :914 `buildFieldsText` and :947 `buildScoreRows` (the lit line at :978): read-only.
- `test/util/switch-script.ts:252-261` `assertModesChangedOnlyByLifecycle`: reads `event.mode` after excluding only `lanes_completed`. It must also skip `hurryup_collected`, for example by continuing unless `'mode' in event`. `typecheck` will flag it.
- Test helpers to reuse:
  - `test/rules-campaign.test.ts:44-140`: `player`, `machine`, `gameState`, `capture`, `ramp`, `press`, `lifecycleOf` and `startTriple`;
  - `test/rules-lock-arbiter.test.ts:470` `stuckState`, and the 3.2 AC 8 block at :538 (`stuckFrom`, `slotTick`, `showTicks`, `pulseTicks`);
  - `test/rules-campaign-qa-integration.test.ts:37-90`: `readRow`, `panel`, `foldRun`, the DMD read-back;
  - `test/backglass-mode-select.test.ts:130-175`: the lit-line rows, with `inGame` and `buildPlayer`;
  - `test/util/snapshot-factory.ts`;
  - the headless list `ENTRY_FILES` in `test/rules-devices-headless.test.ts:193`.
- Pins that may change by design:
  - `test/tuning.test.ts:29` `scalarKeys` (+4);
  - any `test/table.test.ts` shape pin of `modeWiring`;
  - a 3.4 DMD test whose run starts Hurry-up and reads the rows below the score. It now sees the `HURRY-UP` status line and the fields line.

  Diagnose every other red test, and never loosen one.
- The goldens: the five `test/replays/*.golden.json` headers (`tableHash`, `gameStart.tuning`). The `modeSelect*` keys are the precedent.

## Tasks & Acceptance

**Execution:**
1. `src/sim/table/tuning.ts`, `src/sim/table/dragonwar.ts`: add the four tunables and `modeWiring.hurryUpCollectShot`. These go first, because everything reads them.
2. `src/sim/rules/modes/events.ts` (and the re-exports), `test/util/switch-script.ts`: add `HurryUpCollectedEvent`, and fix the helper so it skips non-lifecycle events.
3. `src/sim/rules/modes/hurry-up.ts`, `src/sim/rules/modes/index.ts`: add Hurry-up's value, timer and collect, per the Boundaries.
4. `src/presentation/backglass/frame.ts`: add `MODE_DISPLAY_NAMES.hurryup`.
5. `test/rules-hurry-up.test.ts` (new, headless, added to `ENTRY_FILES`): every Matrix row, as AC 2-5 and AC 8. The "3.7 stand-in" row drives `createModeStack(tuning, definitions)` directly.
6. `test/rules-hurry-up-integration.test.ts` (new, `-integration`-suffixed, so it is excluded from `ENTRY_FILES`): AC 7.
7. `test/backglass-hurry-up.test.ts` (new): AC 6. Then `test/tuning.test.ts` and `test/table.test.ts`: AC 1, extending Story 3.0a AC 8's FR-quote check to FR-34 for the three values.
8. Finish:
   - Refresh the goldens' headers only.
   - Update the by-design pins listed in the Code Map.
   - Diagnose any other red test.
   - Record one `mutation:` line per AC in `## Verification`.

**Acceptance Criteria:**
- **AC1.** Given `TUNING`, `resolveTuning()` and `TABLE`, when `tuning.test.ts` and `table.test.ts` run, then:
  - the four keys are `unverified`;
  - `hurryUpStartValue`, `hurryUpFloor` and `hurryUpMs` each name PRD FR-34, and every double-quoted phrase in their sources is FR-34's own words (at least one each);
  - `hurryUpUrgentMs` is 5000 and names Story 3.3c;
  - `hurryUpTicks` is 20000 and `hurryUpUrgentTicks` is 5000;
  - `modeWiring.hurryUpCollectShot` names a declared shot.
- **AC2** (Matrix rows Start, Decay end, Rounding, Zero ms). Given Hurry-up started at t0, when ticks advance, then its entry publishes `value(e)` and `timerTicks(e)` exactly as the Boundaries define them. Both ends are pinned, and `timerTicks` is absent from e = T on while the Mode stays active.
- **AC3** (rows Collect, Tilted Ramp, Hot seat). Given Hurry-up running, when `shot_ramp_made` arrives, then:
  - the entry's player gains v(e) through `awardScore`;
  - `hurryup_collected { player, value }` fires, followed by the stop triple, on that tick;
  - the base mode lights the next Mode on the same tick.
  Under Tilt nothing happens, and the Mode runs on.
- **AC4** (rows Floor collect, Ball end). Given Hurry-up on the floor, when a Ramp is made, then it pays exactly F. Given Hurry-up running, when the ball ends, then the Mode stops before `ball_ended` with no award and no `hurryup_collected`.
- **AC5** (rows Quick MB on top, 3.7 stand-in). Given Quick multiball started while Hurry-up runs, when ticks advance, then Hurry-up's value still follows its own `startTick`, and a Ramp still collects it. The higher mode stays active, and its own award accrues alongside.
- **AC6.** Given a game snapshot with a running Hurry-up entry, when `advanceBackglass`/`renderFrame` draw the score screen, then:
  - the status line reads `HURRY-UP`, with `BALL 1` right-aligned;
  - the fields line reads `20.0  250000` at e = 0, `19.0  240000` at e = 1000, and `50000` on the floor;
  - with the entry gone, there is no fields line.

  DW-311, measured with the real entry shape and Quick multiball lit:
  - one player: the `QUICK MB LIT` row is at row 24;
  - two players: there is no LIT row;
  - two players after Hurry-up stops: the LIT row is back at row 24.
- **AC7** (Integration, Rules 1/2). Given a real `createRules()` in `runRulesScript`, from Attract with a real Start, where a Ramp lights Hurry-up and a capture at t0 starts it, when a Ramp is made at t0+1000, then:
  - the score rises by exactly v(1000) at the collect;
  - the run, folded tick by tick through `advanceBackglass()`/`renderFrame()`/`rasterise()` and read back from the dots, shows `HURRY-UP` and the decaying fields line before the collect, then the new score and no fields line after it.
- **AC8** (Integration, row Ball search). Given the Lock holding balls, when a ball-search pass reaches its Lock stage, then:
  - while a real Hurry-up decays, the Lock stage requests no Mouth eject;
  - once it is on the floor, the stage opens the Mouth, as with no timer.
- **AC9.** Given the story, when the gates run, then every gate passes, and the goldens differ only in `tableHash` and the six tuning keys. The gates are `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size`.

## Spec Change Log

- 2026-09-30, lead spec gate: DW-311 kept `wontfix-accepted` with the planner's restated `reopen_if` (3.3c without a lit-Mode insert, or the 3.11 playtest missing a lit Mode in a 2+ player game). No spec text changed; no spine write (the timer-at-floor reading is mode behaviour inside AD-8, not a new rule).

## Review Triage Log

### 2026-09-30 — Review pass
- verdicts: 25 findings — high 0, medium 0, low 17, false 8, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) A `hurryup` entry with no `startTick` never decays: `elapsed()` falls back to the current tick, so it publishes S and T forever. — Only `lifecycle.ts` adds entries, and `onStart` always stamps `startTick`, so production cannot reach this. It shows only in hand-built 3.4 fixtures (`rules-campaign.test.ts:284`, `:718`), which never read the value. Every fix (stamp on first sight, or throw) adds a branch or breaks those fixtures.
  - `[low]` `[reject]` (blind) The `tick` hook builds a new `modes[]`/state every tick, even on the floor. — The decay rebuilds the entry every tick anyway, and no reader depends on the identity of `modes`. The only cost is one small array allocation per tick. The fix is an extra guard branch.
  - `[low]` `[reject]` (blind) `formatSecondsFromTicks` rounds to nearest, so the last 49 ticks of a running timer show `0.0`. — Real, but pre-existing shared formatter code (Stories 2.6/2.13). 49 ms is about 3 display frames at 60 fps. Changing it would alter every other mode's timer display. This is not the "frozen 0.0 for the rest of the ball" the Design Notes reject.
  - `[false]` `[reject]` (blind) The duplicated `'HURRY-UP'` literal could diverge with no test failing. — Both copies are pinned by literal tests: the status line in `backglass-hurry-up.test.ts`, and the lit line in `backglass-mode-select.test.ts:130-177`. The literal is also the Code Map's sanctioned option.
  - `[low]` `[reject]` (blind) The Ball end row never compares the stop triple against `ball_ended` directly, because they are on different channels. — The two channels have no cross-channel order you can observe within a tick. The test pins what can be observed: both on the drain tick, the entry gone at that tick, and the score change equal to `ball_ended.total`. Story 3.4's Ball end test measures it the same way.
  - `[false]` `[reject]` (blind) There are no tests for a capture, drain or tilt landing on the same tick as a Ramp. — The finding shows no defect. It describes the current outcomes as the correct ones and asks for extra coverage no AC or Matrix row names.
  - `[low]` `[reject]` (blind) No invariant enforces `hurryUpFloor <= hurryUpStartValue` or `hurryUpUrgentMs <= hurryUpMs`. — The values are authored constants that tests pin exactly (AC1). A bad 3.11 retune would show up in the AC2 decay rows. Adding the invariant means adding new guards or asserts.
  - `[low]` `[reject]` (blind) `hurryUpUrgentMs`'s source hard-codes "(5000 of 20000 ms)", which will go stale. — The source records why the value was authored, which the Boundaries require ("the last quarter of hurryUpMs"). A retune rewrites the source, as for every other entry, and 3.11 owns that.
  - `[low]` `[reject]` (blind) The new tests copy `rules-campaign.test.ts`'s helpers instead of importing them. — Test files export nothing, and importing a `.test.ts` would register its suites twice. Moving the helpers into `test/util/` would refactor tests from Stories 3.2 and 3.4 as well, which is more than a direct fix.
  - `[low]` `[patch]` (blind) The AC7 integration test never proves the run started in Attract. — Fixed: the premise test now asserts `phase === 'attract'` at tick 9, before the Start press at tick 10.
  - `[false]` `[reject]` (blind) The spec's bookkeeping is stale: `## Auto Run Result`, no gate results in `## Verification`. — Finalize writes those. The fix would also be an edit to this build's own spec.
  - `[low]` `[reject]` (blind) `hurryup_collected` has no reader and no owner for collect feedback. — The intent excludes it: "It stays off `SemanticEvent`: no presentation reader exists". Design Notes list "the first presentation reader" under Consumed-by.
  - `[low]` `[reject]` (edge) An entry with no numeric `startTick` stays at S/T forever. — Same root cause and reason as the first blind finding.
  - `[low]` `[reject]` (edge) Nothing validates `hurryUpStartValue`/`hurryUpFloor`: start below the floor, negative, or non-integer. — Same root cause as the tunable-invariant finding. The values are authored constants pinned by AC1, and the proposed fix is a new throw guard.
  - `[false]` `[reject]` (edge) `hurryup_collected` could report a value that `awardScore` never added. — With any reachable tuning, `value >= F >= 0` and `entry.player` is set by the lifecycle, so the reported value is always the amount added (`0` adds `0`, as in the Rounding row). Only a negative authored floor could break this, and that is a config error.
  - `[low]` `[reject]` (edge) The state is rebuilt every tick on the floor. — Same root cause and reason as the second blind finding.
  - `[low]` `[reject]` (verification-gap) An entry with no `startTick` never decays. — Same root cause and reason as the first blind finding.
  - `[low]` `[patch]` (verification-gap) The Collect control's `expect(collected(result)).toEqual([])` cannot fail, because no Hurry-up ever runs in it (Rule 19). — Fixed: the unfalsifiable assertion is deleted. The control keeps its `modesLit` and `score === 0` assertions, which can fail.
  - `[false]` `[reject]` (verification-gap) The spec's frontmatter `status` and `## Auto Run Result` disagree. — Finalize rewrites `## Auto Run Result`. The fix would also be an edit to this build's own spec.
  - `[low]` `[reject]` (intent) The running game is not exercised; the host loop copy in the AC7 fold is not `boot.ts`. — The Matrix names the headless surface, and AC7 reads the real rasterised dots. Design Notes give the browser smoke to the lead (Rule 3's lead smoke is a separate gate).
  - `[low]` `[reject]` (intent) The Slam, Attract-entry and outside-a-game paths are untested. — The no-award outcome is structural: there are no `onStopping`/`onStopped` hooks, and `stopAllModes` is 3.1's, already tested. `scoringOpen`'s phase branch is pinned by Story 3.0a. Adding rows would be new tests that no AC names.
  - `[false]` `[reject]` (intent) In "Quick MB on top", `quickmb` is a shell with no `tick` hook. — That is by the Matrix's design: the "3.7 stand-in" row exists to cover a real higher-priority `tick` hook, and it does.
  - `[false]` `[reject]` (intent) The `switch-script.ts` change edits test infrastructure whose premise was not true. — The Code Map ordered the change, and `typecheck` requires it. After the change the helper does what the intent says it does.
  - `[low]` `[reject]` (intent) The `elapsed()` fallback adds behaviour the intent does not specify. — Same root cause and reason as the first blind finding.
  - `[false]` `[reject]` (intent) The Rule 19 `mutation:` lines were not verified by the auditor. — This is a statement of scope, not a defect. The implement stage applied all 16 mutations and observed each one red.

## Design Notes

**Governing ADs:**
- AD-8: priority 300, the lifecycle as the only stop path, event-major fan-out, timers that keep running under a higher mode, no coils.
- AD-3: ms tunables converted once, clamped to at least 1 tick.
- AD-7: mode-local `startTick`, `value` and `timerTicks` under `modes[i]`; no new `GameState` or `machine` field.
- AD-9: `ModeView` is the only thing the Backglass reads; English only in `frame.ts`; no lamp change.
- AD-18: ball search skips the Mouth while `timerTicks` is published; the arbiter is the only start path.
- AD-16: no `shot_` literal in rules.
- AD-19: Hurry-up consumes the shot event only.

No AC contradicts an AD's Rule.

**Readings pinned here.**
- **The timer ends at the floor; the Mode does not.** "Published each tick as `ModeView.value` and `timerTicks`" is read over the decay. The epics' third criterion ("the timer reaches the floor, `hurryUpMs` elapses") ends the timer at T. FR-23 says "Ball search does not release locked balls while a Mode timer is running": a `timerTicks: 0` kept through the hold would block ball search for the rest of the ball, and would show a frozen `0.0`. AC 8's positive row falsifies the `0` reading.
- **Nothing under Tilt.** The lead's "nothing under Tilt" and FR-15 are read as: a tilted Ramp is not a collect. A Tilt ends the ball at the drain, and the ball end pays nothing, so the Mode ends there. This matches 3.4's tilted Ramp, which lights nothing.
- **Collect and light on one tick.** This is measured in `modes/index.ts:173-182`: each event goes to every active mode, and the base mode still receives the Ramp after Hurry-up stops. It is not an intent gap.
- **`hurryup_collected` stays on the mode channel.** No presentation reader exists (no AC asks the Backglass to show the collect). Moving it to `SemanticEvent` is the job of the first story that adds one (a DMD collect screen, or an Epic 4 cue).

**Quick multiball (3.7 inherits this).**
- Hurry-up's clock is `tick - startTick`, never a counter, so no multiball code can pause it.
- 3.7's `quickmb` must not return `stop`, and must not rewrite the `hurryup` entry, on `shot_ramp_made`.
- Once `quickmb` publishes a `ModeView` field or gains a display name, it becomes the Backglass's top mode (FR-41), and Hurry-up's fields line leaves the panel while the value still collects. That is 3.7's decision to make.

**DW-311 (Rule 17, not owned; measured for the lead).** The panel is 4 lines of 8 rows (`DMD_ROWS` 32). Hurry-up's layout:

| Players | Rows used | LIT row |
|---|---|---|
| 1 | score 0, status 8, fields 16, LIT 24 | fits |
| 2 | scores 0 and 8, status 16, fields 24 | dropped |
| 3-4 | the 2x2 grid takes rows 0 and 8, then the same as 2 | dropped |

- **Reachable:** in a Hot-seat game, two Ramps light [hurryup, quickmb], and the window confirms Hurry-up. Quick multiball stays lit while Hurry-up runs, until the Ramp collects it or the ball ends. So DW-311's `reopen_if` probe is now met.
- **Recommendation: keep the panel as it is, and keep DW-311 `wontfix-accepted`.** Restate its `reopen_if` as "Story 3.3c merges without a lit-Mode insert, or the 3.11 playtest reports a lit Mode missed in a 2+ player game". The reasons:
  - FR-34 requires the decaying value on the Backglass, and FR-41/AD-8 give the panel to the top Mode.
  - The LIT line is 3.4's interim stand-in for 3.3c's lit-Mode inserts (FR-44: the insert is the channel for lit state).
  - It returns on the tick Hurry-up stops, and the lit Mode is still startable.
  - Every fix changes an authored layout: Story 2.13's players block, or a time-shared FR-34 value line.
- AC 6 pins all three cases, so the behaviour is explicit. The lead decides whether to reopen DW-311.

**Integration (Rules 1/2).**
- This story introduces no shared component: Hurry-up consumes existing seams.
- Consumes:
  - 3.0a's `scoring.ts`;
  - 3.1's stack and lifecycle;
  - 3.4's `startCampaignMode()` path and `modesLit` round rule;
  - 2.4's `shot_ramp_made`;
  - 2.6/2.13's Backglass fields line;
  - 3.2's ball-search `timerTicks` guard.
- Consumed-by:
  - 3.3c: `hurryUpUrgentMs`/`Ticks`, and the entry's `timerTicks`, for the Ramp insert;
  - 3.7: coexistence, as above;
  - 3.11: a Hurry-up collect in the playtest;
  - the first presentation reader of `hurryup_collected`.
- The real-runtime Integration ACs are AC 7 (Ramp → `scoring.ts` → DMD) and AC 8 (ball search).

**Ledger inbox (Rule 17).** `LEDGER slice 3-5-hurry-up-answer-the-call` is empty. DW-311 is addressed above.

**Footprint.**
- In the footprint: `src/sim/rules/**`, `src/sim/table/**`, and `test/replays/**` (headers only).
- Extensions to report (uncontended): `src/presentation/backglass/frame.ts` and `test/**` (three new files, `switch-script.ts`, and the pins).
- No `contracts/**` or `loop/**` change, and no contended path.

**Browser smoke (lead).** Real input can reach the start, the decay and the ball-end stop. A post-lock collect needs a recipe that does not exist.
- Ball 1: `plunge-then-bat-r-3899` makes the Ramp, and the DMD shows `HURRY-UP LIT`. Let it drain.
- Ball 2: `plunge-then-bat-l-3945` captures into the Lock (lock applies, one candidate). Hurry-up starts, and the served ball is autolaunched (`serveAfterLock` sets `awaitingSaveLaunch`). The DMD shows `HURRY-UP` / `20.0  250000`, decaying.
- **What cannot be reached:** no recorded recipe makes the Ramp from a post-lock autolaunch, so the collect by real input cannot be reached. AC 3 and AC 7 pin it headless on a real `createRules()`.
- **The deciding check:** record the session and replay it through `createLoop()`. Then check:
  - from the capture tick t0 on, the snapshot's `hurryup` entry has `value` = 250000 - 10(t - t0) and `timerTicks` = 20000 - (t - t0);
  - `renderFrame` carries the `HURRY-UP` and fields rows;
  - the entry leaves `modes[]` at the ball end.

## Verification

**Commands** (first run `export BLENDER=C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe`; the baseline is 150 files / 2424 tests):
- `pnpm test` -- expected: all green, with the file count up by 3.
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions && pnpm build && pnpm check:dist && pnpm check:size` -- expected: each exits 0.
- `git diff -- test/replays` -- expected: only `tableHash` and the six new `gameStart.tuning` keys. If `expectedHash`, `expectedGameStateHash`, `transitions` or `checkpointTicks` moves, HALT with an intent gap.

**Mutations** (Rule 19). They are planned here; the implement stage applies each one, observes red, reverts, and records it as `mutation: <change> → <red test>`:
- AC1: set `hurryUpMs` confidence to `'low'`; the tuning pin goes red. Drop the FR-34 quote; the quote check goes red.
- AC2: `e > T` in place of `e >= T` for the timer drop; Decay end goes red. `Math.round` in place of `Math.floor`; Rounding goes red (67). Drop `max(1, ...)`; Zero ms goes red.
- AC3: drop `stop: true`; Collect goes red. Drop the `scoringOpen` guard; Tilted Ramp goes red. Pay player `0`; Hot seat goes red. Make the stack `break` after a stopping handler; Collect's same-tick `modesLit` goes red.
- AC4: return `stop` once `e >= T`; Floor collect goes red. Add an `onStopping` that awards `value`; Ball end goes red.
- AC5: skip Hurry-up's `tick` hook while a higher-priority mode is active; Quick MB on top goes red.
- AC6: remove `MODE_DISPLAY_NAMES.hurryup`; the status row goes red.
- AC7: award `value(e - 1)`; the AC 7 score delta goes red.
- AC8: publish `timerTicks: 0` on the floor instead of dropping it; the positive row goes red.
- AC9: change one golden header's `hurryUpMs` value; `test/replay-goldens.test.ts` goes red.

**Applied** (implement stage, 2026-09-30; each applied, observed red, reverted, and the tree re-checked identical by a fingerprint of `git status --short`, `git diff` and the three new files):
- mutation: `hurryUpMs` confidence `'unverified'` -> `'low'` (`tuning.ts`) → red `tuning.test.ts` "Story 3.5 AC1: the four Hurry-up tunables are unverified ..." and "Story 3.5 AC1 -- hurryUpMs: confidence 'unverified' ...".
- mutation: `hurryUpStartValue`'s source with the FR-34 phrase unquoted → red `tuning.test.ts` "Story 3.5 AC1 -- hurryUpStartValue: ... every quoted phrase is FR-34's own words (at least one)".
- mutation: timer published while `e <= T` (dropped only at `e > T`) → red `rules-hurry-up.test.ts` "Decay end: at t0+T: value F, and no timerTicks key at all" (and the every-tick row, Rounding, Zero ms).
- mutation: `Math.round` for `Math.floor` in `value(e)` → red `rules-hurry-up.test.ts` "Matrix Rounding" (67 at e = 1).
- mutation: `decayTicks = shotWindowTicks('hurryUpMs', tuning)` without `Math.max(1, ...)` → red `rules-hurry-up.test.ts` "Matrix Zero ms".
- mutation: `stop: true` dropped from the collect → red `rules-hurry-up.test.ts` "Collect: modeEvents on that tick ... hurryup has left modes[]" (and Floor collect, Quick MB on top, 3.7 stand-in).
- mutation: `scoringOpen(state)` guard dropped from the collect → red `rules-hurry-up.test.ts` "Tilted Ramp: the score is unchanged, no hurryup_collected, Hurry-up still active".
- mutation: `awardScore(state, 0, value)` (pay player 0) → red `rules-hurry-up.test.ts` "Matrix Hot seat".
- mutation: the stack `break`s after a handler returning `stop` (`modes/index.ts` fan-out) → red `rules-hurry-up.test.ts` "Collect: the base mode still receives the same Ramp: modesLit is [quickmb]" (and Quick MB on top's `[joust]`).
- mutation: the `tick` hook returns `stop: true` once `e >= T` → red `rules-hurry-up.test.ts` "Matrix Floor collect" (and Decay end, AC 8's control).
- mutation: an `onStopping` that awards the entry's `value` → red `rules-hurry-up.test.ts` "Ball end: the score's change at the drain tick equals ball_ended.total" (and every collect row).
- mutation: Hurry-up's `tick` hook skipped while a higher-priority mode is active → red `rules-hurry-up.test.ts` "Quick MB on top: at t1+k, Hurry-up's published value is still v(t1+k-t0)" and "3.7 stand-in: Hurry-up's value is still v(e) under the stub".
- mutation: `MODE_DISPLAY_NAMES.hurryup` removed (`frame.ts`) → red `backglass-hurry-up.test.ts` "e = 0: the status line reads HURRY-UP ..." (and e = 1000, floor, DW-311 two players).
- mutation: the collect pays `value(e - 1)` → red `rules-hurry-up-integration.test.ts` "the score rises by exactly v(1000) (240000) at the collect" (and the post-collect dots, `240,010`).
- mutation: `timerTicks: 0` published on the floor instead of dropping it → red `rules-hurry-up.test.ts` "AC 8 control: on the floor at the Lock stage ... opens the Mouth at slotTick(O, 6)" (`expected [] to deeply equal [16600]`).
- mutation: `full-plunge.golden.json` header `hurryUpMs.value` 20000 -> 20001 → red `replay-goldens.test.ts` "full-plunge: finalHash and finalGameStateHash match the recorded goldens" (`StaleReplayHeaderError`).

## Auto Run Result

Status: done
Blocking condition: none

**Implement and review run (2026-09-30, `bmad-build-auto`, resumed at step 03).**
- The worktree was verified as `C:/git/dragonwar/.worktrees/epic-3` on `DW-1-epic3`, and the tree was clean on entry. `baseline_revision` is `eb7e82ca610c0fdf7d3df990d4b34f683d45a742`.
- **Summary.** Hurry-up is filled in per FR-34.
  - Its value decays from 250,000 to 50,000 over 20 s, rounded down, and is published on its own `modes[]` entry with `timerTicks`. The timer drops at the floor while the Mode stays active.
  - A Ramp shot (`modeWiring.hurryUpCollectShot`) pays the value through `awardScore`, emits `hurryup_collected` and stops the Mode, but only while scoring is open. The base mode lights the next Mode on the same tick.
  - The ball end pays nothing.
  - The Backglass shows `HURRY-UP` and the decaying fields line.
- **Files changed:**
  - `src/sim/rules/modes/hurry-up.ts`: `createHurryUpMode(tuning)` with `onStart`, `tick` and `onEvent`, and a rewritten header.
  - `src/sim/rules/modes/index.ts`: passes `tuning` to Hurry-up, re-exports `HurryUpCollectedEvent`, and updates its comments.
  - `src/sim/rules/modes/events.ts`: adds `HurryUpCollectedEvent`, with no `mode` field, to the `ModeEvent` union.
  - `src/sim/rules/index.ts`: re-exports `HurryUpCollectedEvent`.
  - `src/sim/table/tuning.ts`: adds `hurryUpStartValue`, `hurryUpFloor` and `hurryUpMs` (each quoting FR-34), and `hurryUpUrgentMs` (authored, for Story 3.3c). All four are `unverified` and owned by Story 3.11.
  - `src/sim/table/dragonwar.ts`: `modeWiring.hurryUpCollectShot: 'shot_ramp'`.
  - `src/presentation/backglass/frame.ts`: `MODE_DISPLAY_NAMES.hurryup = 'HURRY-UP'`. The only other changes are comments.
  - `test/rules-hurry-up.test.ts` (new, headless, added to `ENTRY_FILES`): all 12 Matrix rows, covering AC2-AC5 and AC8.
  - `test/rules-hurry-up-integration.test.ts` (new): AC7. A real Start, a Ramp that lights Hurry-up, a capture that starts it, a Ramp that collects it, and the score and DMD dots read back.
  - `test/backglass-hurry-up.test.ts` (new): AC6, including the three DW-311 layout cases.
  - `test/tuning.test.ts` and `test/table.test.ts`: AC1, including the FR-34 quote audit with a misquote control.
  - `test/util/switch-script.ts`: `assertModesChangedOnlyByLifecycle` now skips every event that has no `mode` field.
  - `test/rules-devices-headless.test.ts`: `ENTRY_FILES` gains `rules-hurry-up.test.ts`.
  - `test/replays/*.golden.json` (5 files): header only.
- **Review findings.** 25 findings from four layers: blind 12, edge 4, verification-gap 3 (no gaps), intent 6.
  - Verdicts: high 0, medium 0, low 17, false 8.
  - **Patches applied (2, both low):**
    - The AC7 premise now asserts Attract before the Start press.
    - An unfalsifiable `collected(result)` assertion was removed from the Collect control.
  - **Deferred:** none.
  - **Rejected:** every other finding, each with its reason in the `## Review Triage Log`. The one root cause raised by several layers is the `startTick` fallback. It is rejected because only a hand-built fixture can reach it; production cannot.
- **Follow-up review:** `false`. The patched counts by verdict are high 0, medium 0, low 2.
- **Verification** (on the patched tree):
  - `pnpm test`: 153 files / 2473 tests, all passed. The baseline was 150 / 2424, so this is 3 more files as expected.
  - `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` (0.890 MB of 2.750 MB) all exit 0.
  - **Goldens:** each file was JSON-parsed and compared field by field with `HEAD`. Each of the 5 has exactly 7 changed paths: `tableHash` and the six new tuning keys. `expectedHash`, `expectedGameStateHash` and `transitions` are unchanged.
  - **Matrix Test Audit:** all 12 rows are covered by tests that ran (29 tests, none skipped).
  - **Rule 19:** all 16 planned mutations were applied, observed red and reverted (see `## Verification`).
- **By-design pins (Code Map):** `test/tuning.test.ts` `scalarKeys` +4. No `modeWiring` shape pin existed in `table.test.ts`, and no 3.4 DMD test changed; `rules-campaign-qa-integration.test.ts` still passes unchanged.
- **Residual risks:**
  - A hand-built `hurryup` fixture with no `startTick` shows S/T frozen. Story 3.4's `rules-campaign.test.ts:284` and `:718` do this and do not read the value.
  - The shared seconds formatter shows `0.0` during the last 49 ticks of the timer.
  - DW-311: the LIT row is dropped in games with 2 or more players while Hurry-up runs. This is pinned by AC6, and the lead decides.
  - The browser smoke belongs to the lead (Design Notes).
- **Footprint extensions (uncontended):** `src/presentation/backglass/frame.ts`, and under `test/**` the three new files, `util/switch-script.ts`, `rules-devices-headless.test.ts`, `tuning.test.ts` and `table.test.ts`. No contended path was touched, and neither were `contracts/**` or `loop/**`.

**Planning run (2026-09-30, `bmad-build-auto`, halt after planning).**
- Planned at `50c97ce8522f7915ead265849eca5f04c9e7342d` on `DW-1-epic3`.
- The worktree was verified as `C:/git/dragonwar/.worktrees/epic-3`, and the tree was clean.
- It reused the committed `epic-3-context.md` (valid, newer than every planning artifact) and did not recompile it. Continuity came from Story 3.4's `done` spec.
- Checked against READY FOR DEVELOPMENT:
  - every task names its files, and the tasks are in dependency order;
  - every AC is Given/When/Then, with a planned mutation;
  - there are no TBDs.
- No intent gap. FR-33 and FR-34 do not conflict: event-major fan-out lets the collecting Ramp both pay Hurry-up and light the next Mode. No NFR or AD is contradicted.
- DW-311: the LIT line is dropped in 2+ player games while Hurry-up runs. This is now reachable. The recommendation is to keep it `wontfix-accepted` with a restated `reopen_if` (Design Notes). The lead decides.
- No files other than this spec were written. No commit and no push.
