---
title: 'Story 3.4: Lighting Modes at the Ramp and starting them at the Lock lane'
type: 'feature'
created: '2026-09-29'
status: 'done'
baseline_revision: 'a33eb664e89fb141d191b5f7bfd4e74d7db73e2c'
baseline_commit: 'a33eb664e89fb141d191b5f7bfd4e74d7db73e2c'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: [oversized]
deferred:
  - summary: >-
      Ball save keeps expiring while a mode-select window holds the ball in bd_lock, so a 10 s window can outlast the 8 s save and the released ball returns unsaved.
    evidence: |-
      save-serve.ts expireBallSave clears machine.ballSave by tick (hasGraceLapsed), whatever ballsInPlay is; a window lasts up to modeSelectMs (10000) against ballSaveMs 8000. Whether the save pauses during the window is a product call the intent does not make (decision-pending for the epic decision sheet; Story 3.11's playtest owns both values).
    location: >-
      src/sim/rules/ball-controller/save-serve.ts:24 and src/sim/rules/ball-controller/lock-arbiter.ts (stepModeSelect)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** A Ramp completion lights nothing, and a Lock-lane capture can only lock or spit. `PlayerState` has no `modesLit`, the three campaign Modes (Hurry-up, Quick multiball, Joust) are not registered, and nothing ever emits `lock_lane_mode_start`, although AD-18 reserves it. `modesPlayed` is wrong too: the ball end credits every active mode's name, so `base` and `skill_shot` enter it on every ball (DW-293). Story 3.10 reads "all three Modes played" from it.

**Approach:**
- The base mode lights the next campaign Mode on each `shot_ramp_made`, into a new player-scoped `modesLit`.
- The Lock arbiter starts a lit Mode on a captured Lock-lane entry, crediting the lock first when both apply.
- With several Modes lit, the arbiter holds the ball in `bd_lock` for a `modeSelectMs` window driven by the flipper buttons and Start.
- Each Mode start credits `modesPlayed`, un-lights the Mode and emits `show_mode_start`.
- The three Modes ship as registered shells: name, priority, lifecycle, nothing else. Stories 3.5, 3.6 and 3.7 fill them in.
- The Backglass shows the candidates during the window, and a lit-Mode line on the score screen.

**Author decisions (2026-09-30, relayed by the orchestrator; binding for this re-plan):**
- **Inserts (Q1 = B):** every "insert shows its role" / "insert goes off" clause of this story moved to the new Story 3.3c (Epic 3 inserts), built after Epic 5 merges. This story does NOT touch `TABLE.lamps`, `lamps.ts`'s projection or any insert; a lit Mode is shown on the Backglass instead. `epics.md` Story 3.4 is amended with `[AMENDED 2026-09-30 — author decision: moved to Story 3.3c]` markers.
- **Every Ramp completion lights the next Mode** (FR-33); the epics criterion was amended from "with no Mode lit" to match, so the several-lit selection window is reachable.
- **The flippers select and a flipper HOLD confirms**, via a new tunable `modeSelectHoldMs` (500 ms, `unverified`, with an honest `source` and `confidence`); FR-33's "Start or either flipper confirms" is met by Start and the hold.
- **A Lock-lane entry while the Lock is full never starts a Mode:** an uncaptured ball cannot be parked for selection.
- **The Quick multiball shell stays single-ball until Story 3.7** (it never sets `machine.multiball`).

## Boundaries & Constraints

**Always:**
- **Campaign order and the round.** The order is `hurryup` → `quickmb` → `joust` (the `MODE_PRIORITIES` names), declared once in `modes/campaign.ts`.
  - `modesPlayed` becomes an append-only log of campaign Mode starts, and repeats are allowed.
  - A player's round is `r` = the smallest count, over the three Modes, of that Mode's entries in their `modesPlayed`.
  - The Mode a Ramp lights is the first Mode in campaign order whose count equals `r` and which is not already in `modesLit`. If there is none, the Ramp lights nothing.
  - So a fresh player lights Hurry-up, then Quick multiball, then Joust. Once all three have been played, `r` rises and the next Ramp lights Hurry-up again ("the order restarts").
- **Lighting (the base mode).** The base mode lights on `shot_ramp_made`, for its own entry's `player`, only behind `scoringOpen()`: no lighting under Tilt or outside a game, the same gate the DRAGON letters use.
  - `PlayerState` gains `modesLit: readonly CampaignModeName[]`, in the order the Modes were lit. `emptyPlayer()` seeds it `[]`.
  - `modesLit` persists across balls, like `lockCredits`.
- **Candidates.** The candidates of a capture are `modesLit` filtered to Modes not active for that player in `modes[]`, in campaign order. No candidates means "no Mode lit" everywhere below.
- **Deciding a captured entry** (`decideEntry`, in `phase === 'game'`):
  - Tilt, or `machine.multiball !== null`: unchanged from 3.2 (the uncredited spit). No Mode starts.
  - **The lock applies** (`lockCredits` below 2 and at most 2 held):
    - `lock_lane_locked`, then `lock_lane_mode_start { player, candidates, selected: candidates[0], tick }` when there are candidates.
    - With one candidate, the Mode starts on the same tick and the trough serves as in 3.2.
    - With two or more, the window opens and the serve waits for the confirm.
  - **The lock is full** (`lockCredits` below 2 and more than 2 held): the credited `lock_lane_spit`, then as above. The Mouth eject runs at once with one candidate, or at the confirm with two or more.
  - **Two credits:**
    - With candidates, `lock_lane_mode_start` is the entry's only outcome event. With one candidate the Mode starts and the Mouth ejects the ball (`requestMouthEject`). With two or more the window opens and the Mouth ejects at the confirm.
    - With no candidates: unchanged (the uncredited spit).
  - A **full-device entry** (the ball was never captured) never starts a Mode, and the lit Modes stay lit.
- **The mode-select window** is arbiter closure state, `ControllerState.modeSelect`: `{ player, candidates, selected, openTick, dueTick, release: 'serve' | 'mouth', pressedAt }`, at most one.
  - It runs in the SL seam each tick, before new entries are classified.
  - A `button_pressed` edge of `flipperButtonWiring.left` or `.right` moves the selection one step, wrapping, and emits `mode_select_moved { player, candidates, selected, tick }`.
  - The window confirms, emitting `mode_select_ended { player, mode, reason, tick }`, on the first of:
    - a Start press (`reason: 'start'`);
    - a flipper held continuously for `modeSelectHoldTicks` from a press edge made inside the window (`reason: 'flipper_held'`), the move included;
    - `dueTick = openTick + modeSelectTicks` (`reason: 'expired'`).
  - At the confirm, the selected Mode starts, then the release runs: the serve, or `requestMouthEject`.
  - While the window is open:
    - a Start press never reaches S6, so no Hot-seat player is added;
    - `lane_change_pressed` never reaches the mode stack, so no lane rotates.
  - A Tilt while the window is open ends it with `mode_select_ended { mode: null, reason: 'tilt' }` and runs the release. No Mode starts and `modesLit` is unchanged.
  - A phase change (Slam) discards the window with no event. So does a tick running backwards (`discardStaleMouth`'s rule).
- **A Mode start.**
  - Every campaign start goes through one helper, `startCampaignMode()` in `modes/campaign.ts`, which calls `lifecycle.ts`'s `startModes()`. Its lifecycle triple goes onto the controller's `modeEvents`.
  - For each `mode_<campaign>_started` in that result, the helper appends the Mode to the player's `modesPlayed` and removes it from `modesLit`.
  - The arbiter then pushes `ShowCommand { show: TABLE.modeWiring.startShow }` onto its `showCommands`, before any Mouth open for the same capture.
  - Nothing else ever starts a campaign Mode.
- **DW-293.** `endBall()` no longer writes `modesPlayed`: the score write stays, and the name credit goes. `base` and `skill_shot` never enter `modesPlayed`.
- **The shells.** `modes/hurry-up.ts`, `modes/quick-multiball.ts` and `modes/joust.ts` (each new, with a GPL header) export `createHurryUpMode`, `createQuickMultiballMode` and `createJoustMode`.
  - Each is `{ name, priority: MODE_PRIORITIES[name], onEvent: identity }`: no scoring, no timer, no `ModeView` field, no `lamps` hook.
  - They are appended to `createProductionModeDefinitions()` after `base` and `skill_shot`, and never join `BALL_START_MODES`.
  - They stop only at the ball end or the Attract entry, through the existing lifecycle.
  - The Quick-multiball shell never writes `machine.multiball` (AD-18: set only in 3.7's `_starting`).
- **TABLE and tuning.**
  - `shows` gains `show_mode_start`, and a new `modeWiring: { startShow: 'show_mode_start' }`.
  - `tuning.ts` gains `modeSelectMs` 10000 and `modeSelectHoldMs` 500, both `unverified`, each with an honest "authored placeholder" source that names 3.11 as the owner. Each is read once in `createBallController` through `shotWindowTicks`, clamped to at least 1 tick.
- **Events.** `contracts/events.ts` gains:
  - `CampaignModeName = 'hurryup' | 'quickmb' | 'joust'`;
  - `LockLaneModeStartEvent`, `ModeSelectMovedEvent` and `ModeSelectEndedEvent`, each added to `SemanticEvent`, with `test/contracts.test.ts`'s `never` arms.
- **Commands** stay in the order `[controller shows, hit shows]`. `show_mode_start` travels inside the controller's shows.
- **The Backglass** (`src/presentation/backglass/frame.ts`):
  - A `mode_select` screen, held from `lock_lane_mode_start` when there are two or more candidates. It is folded by `mode_select_moved` and dropped on `mode_select_ended` or on any phase other than `game`. It lists every candidate by its display name and marks the selected one.
  - The score screen names the current player's first lit Mode (`HURRY-UP LIT`, `QUICK MB LIT`, `JOUST LIT`) from `snapshot.game.players[current].modesLit`. This is continuous display (AD-9).
- **Goldens.** No golden starts a game (`players` stays `[]`), so only the headers move: `tableHash` and the four new `gameStart.tuning` keys (`modeSelectMs`/`Ticks`, `modeSelectHoldMs`/`Ticks`).
- **Tests.** Every AC has a pinning test with a `mutation:` line in `## Verification` (Rule 19). Every negative is paired with its positive. Ticks are derived from `resolveTuning()`. Non-ASCII in source is written as escapes (Rule 14).

**Never:**
- Never touch `TABLE.lamps`, `sim/rules/lamps.ts`'s projection, or any insert. It moved to Story 3.3c (author decision 2026-09-30).
- Never touch `src/presentation/mechanisms/**`, `src/presentation/scene/**`, `assets/src/**`, `public/assets/**`, `tools/make-placeholder-blend.py` or `ATTRIBUTIONS.md`. They are contended with Epic 5.
- Never build Hurry-up's value or timer, Joust's Charge, or Quick multiball's second ball or its `machine.multiball`.
- Never start a campaign Mode outside `startCampaignMode()`, and never write `modes[]` outside `lifecycle.ts`.
- Never emit a `CoilCommand` from a mode.
- Never let a golden's `expectedHash`, `expectedGameStateHash`, `transitions` or `checkpointTicks` move. That is an intent gap: HALT.
- Never add a `machine` field or a top-level `GameState` field.
- Never touch `src/sim/physics/**`, the spine or `epics.md`.

## I/O & Edge-Case Matrix

These rows are headless, through `runRulesScript`. W = `modeSelectTicks`, Hd = `modeSelectHoldTicks`, L = `mouthOpenLeadTicks`. A capture at t is 3.2's `capture(s_lock_N, t)`. The state is a game, untilted, with no multiball, unless the row says otherwise.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| First Ramp | fresh player; `shot_ramp_made` | `modesLit` = [hurryup]. Control: the same Ramp tilted gives [] | No error expected |
| Order | four Ramps | [hurryup], [hurryup, quickmb], [hurryup, quickmb, joust], then unchanged | No error expected |
| Restart | played [hurryup, quickmb, joust], lit []; Ramp | lit [hurryup]. Control: played [hurryup, quickmb] gives [joust] | No error expected |
| One lit, lock applies | lit [hurryup], credits 0; capture at t | events@t [locked, mode_start{[hurryup]}]; hurryup triple@t; played [hurryup], lit []; credits 1; trough pulse@t; commands@t [show_mode_start]; no `c_mouth` | No error expected |
| One lit, two credits | lit [joust], credits 2 | events@t [mode_start{[joust]}], no spit; commands@t [show_mode_start, open]; `c_mouth`@t+L; credits 2 | No error expected |
| None lit, two credits | lit [], credits 2 | uncredited spit, as in 3.2 | No error expected |
| Multiball / Tilt | lit [hurryup]; `multiball` 'quickmb', or tilted | uncredited spit; no mode_start; lit unchanged | No error expected |
| Active excluded | lit [hurryup, quickmb], hurryup active | candidates [quickmb]: it starts at once | No error expected |
| Window, Start | lit [hurryup, quickmb], credits 2; right flipper at t+10; Start at t+20 | mode_start{[hurryup, quickmb], selected hurryup}@t; moved{quickmb}@t+10; ended{quickmb, start}@t+20; quickmb starts@t+20; open@t+20; players.length unchanged | No error expected |
| Window, expiry | as above, no input | ended{hurryup, expired}@t+W | No error expected |
| Window, hold | left flipper pressed at t+10, held | moved (wraps)@t+10; ended{flipper_held}@t+10+Hd. Control: released before Hd gives no confirm | No error expected |
| Window with lock | lit two, credits 0 | [locked, mode_start]@t; no trough pulse before the confirm; serve at the confirm; credits 1 | No error expected |
| Tilt in window | a Tilt at t+5 | ended{null, tilt}@t+5; no start; lit unchanged; release runs | No error expected |
| Lane change in window | a flipper press inside the window | `lanes.lit` unchanged. Control: the same press outside a window rotates | No error expected |
| Ball end | hurryup active; drain | its stop triple before `ball_ended`; `modesPlayed` gains nothing (DW-293) | No error expected |

</intent-contract>

## Code Map

Measured at `b82acef435b0e9ac7073a513724ff0feffcb57a4` on `DW-1-epic3`. No source file changed since the first plan at `968ff5dc`; only the line anchors below were re-measured.

- `src/sim/contracts/state.ts:101-114`: `PlayerState`. Add `modesLit`, and restate `modesPlayed`'s doc (:114) as the append-only log of campaign starts.
- `src/sim/contracts/events.ts:320-345` (the lock-lane events) and `:391-414` (the `SemanticEvent` union): add `CampaignModeName` and the three events.
- `src/sim/rules/modes/priorities.ts`: `MODE_PRIORITIES` already declares `hurryup` 300, `joust` 310 and `quickmb` 400.
- `src/sim/rules/modes/registry.ts:70` `ModeLookup` (`get(name)`), and the `ModeDefinition` shape. The shells need only `name`, `priority` and `onEvent`.
- `src/sim/rules/modes/lifecycle.ts:59` `startModes(state, definitions, player, tick)`. It takes definitions, so `startCampaignMode` resolves the one definition through `lookup.get(mode)`. It is a no-op for a Mode that is already active, which is why the candidates exclude active Modes.
- `src/sim/rules/modes/index.ts`:
  - `BALL_START_MODES` (:65): unchanged;
  - `MODE_LAMP_ROLES` (:73): unchanged;
  - `createProductionModeDefinitions` (:79): append the three shells.
- `src/sim/rules/modes/base.ts:218` `onEvent`: add `shot_ramp_made` → light. Gate it with `scoringOpen()` from `src/sim/rules/scoring.ts:28`, which `base.ts` can already import (`awardScore` comes from the same module, :54). The event type is the shots union at `devices/events.ts:170`.
- `src/sim/rules/modes/campaign.ts` (new): `CAMPAIGN_ORDER`, `nextModeToLight(player)`, `candidatesFor(state, player)` and `startCampaignMode(state, lookup, mode, player, tick)`.
- `src/sim/rules/ball-controller/lock-arbiter.ts`:
  - `decideEntry` (:279-304): the branches. `held` (:291) counts the slots after this capture, so `held > 2` is "this capture fills the Lock";
  - `classify` (:211-226): captured versus full-device;
  - `serveAfterLock` (:190-199): reuse it at the confirm;
  - `requestMouthEject` (:129-144);
  - `arbitrateLockLane` (:236-271): step the window first, after the Mouth's pulse and close;
  - `discardStaleMouth` (:101-109): also discard `modeSelect`.
- `src/sim/rules/ball-controller/shared.ts`: `ControllerState` (:244-393; add `modeSelect` beside `mouthClose` at :393, with a doc comment) and `ControllerContext` (:402-418; add `modeSelectTicks` and `modeSelectHoldTicks`). `ctx.modes` (:418) is the `ModeLookup` that `startCampaignMode` uses.
- `src/sim/rules/ball-controller/index.ts`:
  - :164 and :194: resolve and pass the two ticks (the `mouthCloseHoldTicks` pattern);
  - :180: seed `modeSelect: null`;
  - :218: S6 (`handleStartButton`) receives the events without Start presses while `cs.modeSelect !== null`. S6 runs before SL (:222), so it reads the window as it stood at the start of the tick;
  - the step result gains the lane-change flag (see Design Notes).
- `src/sim/rules/ball-controller/ball-end.ts:144-172` `ballEndGateOpen`: read-only evidence. The gate needs a non-Lock parking entry, so it cannot open while a window holds the only ball. `:196-208`: drop the `modesPlayed` credit (DW-293) and keep the score write.
- `src/sim/rules/ball-controller/start.ts:26-37` (`emptyPlayer`: `modesLit: []`) and :159 (S6, `handleStartButton`).
- `src/sim/rules/devices/index.ts:416-423`: a flipper press emits both `lane_change_pressed` and `button_pressed`, and :386 emits `button_released` for the release. Read-only.
- `src/sim/rules/index.ts:344-347`: the stack's device events (`withoutLockLaneEntered(...)`). They also drop `lane_change_pressed` when the ball controller's flag is set, so the rules root never reads closure state.
- `src/sim/table/dragonwar.ts`: `shows` (:722-726), `lockLaneWiring` (:605-616; put `modeWiring` beside it) and `flipperButtonWiring` (:623-626). `src/sim/table/tuning.ts:361`: add the two entries after `mouthCloseHoldMs`.
- `src/presentation/backglass/frame.ts`:
  - `DmdScreen` (:93): add `mode_select`;
  - the held-payload pattern (`HeldMatch`, :114-130; `advanceBackglass`, :406);
  - the score rows (:826-830);
  - `renderFrame`'s `never`-guarded switch (:991).
  - Display names live here only.
- Tests whose pins change by design:
  - `test/rules-lifecycle.test.ts:209-210`: the stub credit becomes "nothing credited at ball end";
  - `test/rules-mode-stack-integration.test.ts:254`: `['base','skill_shot']` becomes `[]`;
  - `test/table.test.ts:270-276`: three shows become four;
  - `test/tuning.test.ts:29`: `scalarKeys`;
  - `test/contracts.test.ts:291`: the `never` arms;
  - every `PlayerState` literal gains `modesLit: []`: `test/util/snapshot-factory.ts:50` and the 20 hits of `grep -rn "modesPlayed: \[" test`.
  - `test/rules-mode-stack.test.ts:358` stays green, because the shells carry no `lamps`.
- Test helpers to reuse:
  - `capture()`, `lockEvents()` and `pulseTicks()` in `test/rules-lock-arbiter.test.ts:105-126`;
  - `runRulesScript()` in `test/util/switch-script.ts:279`, which already runs `assertModesChangedOnlyByLifecycle`;
  - the headless list `ENTRY_FILES` in `test/rules-devices-headless.test.ts:193`.
- Goldens: the five `test/replays/*.golden.json` carry `gameStart.tuning` (the `mouthCloseHoldMs`/`Ticks` pair is the precedent) and `tableHash`.
- Real input for the smoke:
  - `test/util/reachability.ts:309` `plunge-then-bat-r-3899` closes `s_ramp_enter` then `s_ramp_made` on real physics;
  - `plunge-then-bat-l-3945` (:166) is a Lock-capture witness (`s_lock_lane` then `s_lock_1`).

## Tasks & Acceptance

**Execution:**
1. `src/sim/contracts/state.ts`, `src/sim/contracts/events.ts`: add `modesLit`, `CampaignModeName` and the three events. Then add the `test/contracts.test.ts` arms, and `modesLit: []` in every `PlayerState` literal under `test/**`. This goes first because everything downstream type-checks against it.
2. `src/sim/table/dragonwar.ts`, `src/sim/table/tuning.ts`: add `show_mode_start`, `modeWiring` and the two tunables.
3. `src/sim/rules/modes/campaign.ts`, `hurry-up.ts`, `quick-multiball.ts` and `joust.ts` (new, GPL header), then `modes/index.ts` (register the shells) and `modes/base.ts` (lighting).
4. `src/sim/rules/ball-controller/{start,ball-end,shared,index,lock-arbiter}.ts`:
   - `emptyPlayer`;
   - DW-293;
   - `modeSelect` and the ticks;
   - the arbiter's branches and window;
   - S6's Start filter;
   - the lane-change flag.
   Then `src/sim/rules/index.ts`: the lane-change filter.
5. `src/presentation/backglass/frame.ts`: the `mode_select` screen and the lit line.
6. `test/rules-campaign.test.ts` (new, headless, added to `ENTRY_FILES`): every Matrix row, the two AC 3 entry rows, and AC 7.
7. `test/backglass-mode-select.test.ts` (new): AC 6.
8. Finish:
   - Make the listed pin edits.
   - Refresh the goldens' headers only.
   - Diagnose any other red test, and never loosen one.
   - Record one `mutation:` line per AC in `## Verification`.

**Acceptance Criteria:**
- AC1: Given `TABLE` and `TUNING`, when `table.test.ts` and `tuning.test.ts` run, then:
  - `shows` holds exactly the four shows;
  - `modeWiring.startShow` names a declared show;
  - `modeSelectMs` and `modeSelectHoldMs` are `unverified` entries.
- AC2 (Matrix rows 1-3): Given a player in a game, when `shot_ramp_made` arrives, then `modesLit` gains the next Mode under the round rule. It never does under Tilt or outside a game.
- AC3 (rows 4-8, plus two entry rows): Given candidates on a captured entry, then the lock is credited first, and the one candidate starts on that tick. The ball is released by a serve or by the Mouth. With no candidates, under Tilt, or in a multiball, 3.2's outcome is unchanged. The two entry rows:
  - A capture that fills the Lock (lit [hurryup], credits 0, two other balls held) gives `[lock_lane_spit{credited: true}, lock_lane_mode_start]`, one `show_mode_start`, exactly one Mouth sequence, and Hurry-up started.
  - A full-device entry with the same lit and credits (three held, so the ball is uncaptured) gives `lock_lane_spit` alone: no start, `modesLit` unchanged, and no Mouth request.
- AC4 (rows 9-14): Given two or more candidates, then the ball stays in `bd_lock` for up to W:
  - flipper presses move the selection;
  - Start, a hold of Hd or the expiry confirms, and only then do the start and the release run;
  - Start adds no player, the lanes do not rotate, and a Tilt ends the window with no start.
- AC5 (row 4, row 15, DW-293): Given any campaign start, when `mode_<name>_started` fires, then `modesPlayed` gains that name, `modesLit` loses it, and `show_mode_start` is in that tick's `commands`. A ball end credits nothing.
- AC6: Given `advanceBackglass`/`renderFrame` fed a window's events, then the `mode_select` screen:
  - lists both candidates, with the marker on `selected`;
  - follows `mode_select_moved`;
  - drops at `mode_select_ended`.
  The score screen reads `HURRY-UP LIT` when `modesLit` is [hurryup], and has no lit line when it is [].
- AC7 (Integration, Rules 1/2): Given a real `createRules()` in `runRulesScript`, one player and three balls, when each ball makes the Ramp and then enters the Lock lane, then Hurry-up, Quick multiball and Joust start on balls 1, 2 and 3, in that order. At every tick, `lockCredits` and `letters` equal a control run with the Ramp closures removed.
- AC8: Given the story, when the gates run, then every gate passes and the goldens differ only in their headers. The gates are `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size`.

### Review Findings

_Code review 2026-09-30 (`bmad-code-review`, full mode, first review of this story). Scope: `git diff a33eb66` (build commit `2e9d6c6`) plus QA's untracked `test/mode-select-slam-physics.test.ts`, `test/rules-campaign-qa.test.ts` and `test/rules-campaign-qa-integration.test.ts`, run from `C:/git/dragonwar/.worktrees/epic-3` (verified with `git rev-parse --show-toplevel`). Review tier: `full-opus`; all four layers ran with no model override: blind-hunter, edge-case-hunter, verification-gap and acceptance-auditor. None failed, and no layer edited a file. Raw rows: 23 (blind 12, edge 4, verification 3, acceptance 4), grouped into 18 entries: 6 patched, 3 closed at emission and ledgered, 9 rejected. Severity: high 0, medium 2, low 7 (both mediums dispositioned: DW-296 patched, DW-309 decision-pending). After the patches: `pnpm test` passes 150 files / 2424 tests. `typecheck`, `lint:boundaries` and `check:headers` each exit 0. The review's added lines are ASCII-only. Rule 3: the real-runtime tier is QA's real `createMachine()` + `createRules()` runs (`mode-select-slam-physics`) and the real `createRules()` run folded through `advanceBackglass()`/`renderFrame()`/`rasterise()` (`rules-campaign-qa-integration`), per the Story 2.11/3.0a/3.1 precedent; panel pixels are the lead's browser smoke. Rule 6: AD-18, AD-8, AD-7, AD-6, AD-9 and AD-19 were checked against the diff, with no mismatch. The DW-296 fix refines AD-6 and does not contradict it. See the Rule 20 sentence below._

Each entry: severity / fix-risk / footprint / spec-status.

- [x] [Review][Patch] **DW-296: a Start inside the Mouth's lead after a Slam started a new game with the eject still owed.** med / low / in-story / clear. The pulse fired into the new game, and the Slam-era ball's drain ended its ball 1 (QA measured this on real physics). 3.4's Slam fix widened the exposure to the whole 10 s window. `handleStartButton` now creates no new game while a Mouth eject is pending (`mouthEjectPending(ctx)`). The refusal ends with the sequence's last pulse, which runs in any phase. A Start from the next tick on finds the spat ball loose, and the stray clear recovers it. This follows Story 2.13's precedent that a Start during the reveal is ignored. Pinned on real physics (Start 1 tick after the Slam is refused; Start at pulse+1 is honoured, `recovered` 1, one serve, no `c_mouth` and no `ball_ended` over 4000 ticks). Also pinned headless for both root paths (window Slam and 3.2's uncredited spit), with the no-Mouth control (a Slam in a locked window, where Start is honoured at once). Ledger DW-296 `resolved-by`. (blind+verification-gap+acceptance) [src/sim/rules/ball-controller/start.ts:166]
- [x] [Review][Patch] **No window test ran for a player other than player 0.** low / low / in-story / clear. Swapping `selection.player` for `0` passed every test. Added the Hot-seat row: player 2's window moves, confirms and starts for player 2, and player 1 is untouched. (blind) [test/rules-campaign.test.ts]
- [x] [Review][Patch] **`LockLaneSpitEvent`'s doc promised a spit for every non-locking entry.** low / low / in-story / clear. It now names 3.4's two-credit Mode start (no spit) and the Lock-filling pair. (blind) [src/sim/contracts/events.ts:333]
- [x] [Review][Patch] **The `lock-arbiter.ts` file header was stale.** low / low / in-story / clear. It claimed "exactly one locked or spit" and listed only three any-phase exceptions. It now names the two-credit Mode start, the Slam's owed eject and the DW-296 Start refusal. (blind) [src/sim/rules/ball-controller/lock-arbiter.ts:14]
- [x] [Review][Patch] **AC1's `unverified` clause had no `mutation:` line.** low / low / in-story / clear. The mutation was applied, observed red and reverted; the line is recorded in `## Verification`. (verification-gap) [test/tuning.test.ts:357]
- [x] [Review][Patch] **A doubled blank line before the first `describe`.** low / low / in-story / clear. (blind) [test/mode-select-slam-physics.test.ts:236]
- [x] [Review][Defer] **A Tilt in a windowed LOCK serves a ball that S7 never autolaunches while tilted.** med / low / in-story / spec-bound. The tilted player's ball rests in the shooter lane until they plunge it by hand (the manual plunger stays live, AD-5). DW-281 called this shape a stall. The spec's Design Notes assumed a tilted serve drains on its own. AD-18 (3.4) says a Tilt "still runs the release", so ending the ball at once needs an AD-18 amendment: a product call. Ledger **DW-309** `decision-pending owner=burndown`. 3.2 has the same shape in a narrow window. (blind) [src/sim/rules/ball-controller/lock-arbiter.ts:319]
- [x] [Review][Defer] **An open window is invisible to the drain gate, the Lock overflow answer and the ball-end rotation.** low / med / in-story / clear. It is theoretical: every path needs a second loose ball while the window holds the only one. Single-ball play never produces that with DW-296 closed, and neither does 3.7's multiball (no candidates while `machine.multiball` is set). Ledger **DW-310** `wontfix-theoretical`. It becomes real if a story puts a second ball in play while `cs.modeSelect` is open. (blind+edge-case-hunter, three rows) [src/sim/rules/ball-controller/index.ts:264]
- [x] [Review][Defer] **The `<MODE> LIT` line is dropped when 2+ player lines and a fields line fill the panel.** low / med / in-epic / clear. It is unreachable until 3.5 publishes Hurry-up's fields line, and the layout choice belongs to 3.5. Ledger **DW-311** `wontfix-accepted`, reopen_if = a 2+ player game with Hurry-up's fields line live and a Mode lit renders no LIT row. (acceptance) [src/presentation/backglass/frame.ts]

**Rejected** (one line each):
- `low` (blind) The spec's intent block does not record the Slam's owed eject. The fix would edit the spec under review, so it is rejected here. The lead's Rule 20 sentence below carries it into the spine.
- `false` (blind+acceptance) The spec says `done` while sprint-status says `review`. That is pipeline state, which this stage's sprint sync sets. It is not a code defect.
- `low` (blind) The Auto Run Result and `test-summary.md` predate QA. Both are tracking prose, and the fix edits the spec.
- `low` (blind) A flipper hold can never confirm the already-selected Mode, because every press moves first. This is by design: the intent's "the move included", Matrix row "Window, hold", and author decision 3.
- `low` (blind) The `mode_select` screen shows no countdown or controls hint. This is by design: the intent defines the screen's content, and adding either is new scope.
- `low` (edge) A Start on the exact tick a Slam voids a windowed game is dropped. It needs a same-millisecond coincidence. The proposed guard would let S6 create a game that SL then continues the OLD window into. Dropping the press is also consistent with the DW-296 refusal.
- `low` (verification-gap) `expect(campaign.duration).toBe(control.duration)` cannot fail. It guards the test's own construction, not an AC. AC7's per-tick mismatch list is the pin, and it has a mutation.
- `false` (acceptance) DW-308 (ball save expires during the window): this story leaves it undecided, per the lead's instruction. The implementation matches the description: the confirm's serve is marked a re-serve and never re-arms, and the `'mouth'` release returns the same ball, so nothing makes it worse.
- `false` (acceptance) The two contract deviations (`CampaignModeName` declared in `state.ts`, `modeWiring.lightShot`) are documented and required by `no-circular` and AD-16.

**Rule 20 sentence for the lead (AD-6 / AD-18, not written here; the spine is the lead's):** "No new game starts while a Mouth eject is pending: its ball is parked in `bd_lock`, out of the Start-time stray clear's reach. A Start pressed meanwhile is ignored, and the refusal ends with the sequence's last pulse. A Slam in an unlocked capture's mode-select window still requests that capture's owed Mouth eject (DW-296, Story 3.4 code review)."

## Spec Change Log

- 2026-09-30, lead spec gate (cycle 2): the Rule 20 sentences were written into the spine (AD-18, AD-8, AD-7). Second read done on the lead's own answer text; no spec text changed.

- 2026-09-30, lead (re-dispatch after the plan HALT `intent gap -- no insert lamp`):
  - The author chose (B): inserts move to the new Story 3.3c.
  - The author accepted the four Q2 calls:
    - every Ramp lights the next Mode, per FR-33;
    - a flipper hold confirms, via `modeSelectHoldMs`;
    - a full-Lock entry never starts a Mode;
    - Quick multiball stays single-ball until 3.7.
  - These are written into the intent block and Design Notes, and `epics.md` Story 3.4 is amended to match. Status was reset to `draft` for a re-plan on this spec path.
- 2026-09-30, plan stage (re-plan, cycle iteration 2):
  - **Intent block.** One phrase changed in the Never list: "The lit-Mode insert is the lead's open question (Design Notes, Q1)" now reads "It moved to Story 3.3c (author decision 2026-09-30)". This removes a dangling reference to the answered question. No behaviour changed.
  - **Outside the intent block:**
    - the Q1/Q2 text is reduced to a one-line record;
    - the Code Map anchors were re-measured;
    - AC3 gains the Lock-filling and full-device rows, a positive and negative pair for author decision (4);
    - Design Notes record the readings of "Lock is full", the windowed-lock release and the flipper hold, and the lane-change flag;
    - the AD-18 sentence for the lead now names both lock-first pairs.
  - **KEEP:** the round rule, the single `startCampaignMode()` path, the window as arbiter closure, and the header-only goldens.

## Review Triage Log

### 2026-09-30 — Review pass
- verdicts: 37 findings — high 0, medium 7, low 25, false 4, maybe-false 1
- findings:
  - `[low]` `[patch]` (blind) `withoutStartPresses()` sits between `createBallController`'s JSDoc and the function, orphaning the export's doc — moved the helper above the doc block in `ball-controller/index.ts`.
  - `[medium]` `[patch]` (blind) a Slam during a `'mouth'` window discards the window and drops the owed Mouth eject, so the unlocked staging ball stays in `bd_lock` and the Lock stays full into later games (contradicts AD-18 "a Mouth sequence ... in any phase" and `MouthSequence`'s "never cancelled by a Slam") — `stepModeSelect`'s phase-change discard now still calls `requestMouthEject()` for `release: 'mouth'` (no event, no start; a `'serve'` window requests nothing); Slam test rewritten plus a locked-window control; docs in `lock-arbiter.ts` and `shared.ts` updated.
  - `[low]` `[reject]` (blind) `show_mode_start` is pushed even if `startCampaignMode()` starts nothing — unreachable in production: candidates exclude Modes active for the player, only one window exists, and the production registry (the stack's own) registers all three shells; only a stub registry could reach it, and the fix guards state not demonstrated.
  - `[medium]` `[patch]` (blind) flipper direction and wrapping are never exercised — every rules window has two candidates — added a three-candidate `rules-campaign` row (left back and wrap, right forward and wrap, Start confirms the selected Mode).
  - `[medium]` `[patch]` (blind) the backwards-tick discard of `cs.modeSelect` in `discardStaleMouth()` has no test — added a `runTimeline` restart test on 3.2's pattern (uninterrupted expires at t+W; restarted at tick 1 never confirms).
  - `[low]` `[patch]` (blind) the 1-tick floor on `modeSelectHoldTicks` is untested — added a `modeSelectHoldMs: 0` row (moves on the press tick, confirms one tick later).
  - `[low]` `[patch]` (blind) hold edge cases untested: re-press, exact-Hd release, overlapping flippers — added the re-press row (the hold counts from the second edge); the exact-Hd boundary and overlapping flippers are dispositioned below (EC6, EC7).
  - `[low]` `[reject]` (blind) a Start press on the capture tick itself reaches S6 — by design: the Code Map states S6 runs before SL and reads the window as it stood at the start of the tick; it needs a Start on the exact capture millisecond, and moving S6 after SL reorders the controller's seams.
  - `[low]` `[patch]` (blind) the Backglass tests miss the `warningShowing` carry, the `ball_ended` precedence and the lit line's placement and drop — added the WARNING-already-showing row (with its control) and the lit-line fields-line and crowded-panel rows; `ball_ended` precedence is the pre-existing branch-2 order, and no ball end can happen while a window holds the only ball.
  - `[low]` `[patch]` (blind) the lit-line test hard-codes row 16 — rewritten to derive the row from the rendered status line and pitch.
  - `[low]` `[reject]` (blind) `rules-lifecycle`'s "the other player is NOT credited" negative lost its positive — it still pins per-player isolation, and the positive (a campaign start credits only the starting player's `modesPlayed`) is pinned in `rules-campaign` "One lit, lock applies".
  - `[low]` `[patch]` (blind) window tests assert `arbiterEvents(result).slice(1)` / `.slice(2)` without checking the skipped `lock_lane_mode_start` — every such assertion (Window hold, Tilt in window, Tilt in windowed lock, Slam, and the new confirm-tick and hold-floor rows) now asserts the full list.
  - `[low]` `[reject]` (blind) `modesPlayed` stays `readonly string[]` — the spec restates only its doc; its only writer types the value `CampaignModeName`; narrowing is a contract change touching every test literal.
  - `[false]` `[reject]` (blind) `discardStaleMouth()`'s name no longer covers the window, and the Auto Run Result is stale — the Code Map itself assigns the window's discard to `discardStaleMouth`, and the Auto Run Result is rewritten at finalize.
  - `[low]` `[reject]` (edge) `heldModeSelect` has no backwards-tick bound in `advanceBackglass` — a restarted timeline passes through Attract, which drops the payload; only a replay seek straight into a mid-game checkpoint could hit it, and the fix adds a new guard field. reopen_if: a replay seek backwards within `phase: 'game'` leaves the DMD on `mode_select`.
  - `[false]` `[reject]` (edge) a `mode_select_moved` without a held window is ignored, so the DMD could miss the window — `sim/loop/index.ts:454` pushes every tick's events into the frame's `events`, and every `FrameOutput` is folded in order, so the opening event is never skipped.
  - `[low]` `[reject]` (edge) a Start on the capture tick adds a Hot-seat player and does not confirm — same root cause as the blind finding above; by design per the Code Map.
  - `[medium]` `[defer]` (edge) ball save keeps expiring while a window holds the ball, so a 10 s window can outlast the 8 s save — real (`hasGraceLapsed` is time-based), but whether the save pauses during the window is a product call the intent does not make; recorded in `deferred:` for the decision sheet.
  - `[low]` `[reject]` (edge) `show_mode_start` when `startCampaignMode()` returns no events — same root cause as the blind finding; unreachable in production.
  - `[low]` `[reject]` (edge) a flipper released on exactly `pressedAt + Hd` never confirms — a one-tick (1 ms) boundary where both readings are defensible; the Hd-1 control and the held row pin the rule.
  - `[low]` `[reject]` (edge) left held, right tapped and released: the left hold never confirms — per the Design Notes, `pressedAt` is the latest in-window press, cleared by that side's release; Start, a re-press and the expiry still confirm, and per-side tracking is new state the spec does not ask for.
  - `[maybe-false]` `[reject]` (edge) a second capture in the same batch after a window opened would eject the window's ball — it needs two balls captured on one tick with `machine.multiball === null`, which single-ball play does not produce; it would settle with a same-tick two-capture witness. If true it would be low (3.7 owns multiball).
  - `[false]` `[reject]` (edge) the lit line names a Mode that is still active — the intent defines the line as the first entry of `modesLit`; a Mode re-lit by the round rule is lit while its earlier start still runs.
  - `[low]` `[reject]` (edge) AC4 "Start adds no player" fails on the capture tick — same root cause as the blind Start finding; by design.
  - `[medium]` `[patch]` (verification-gap) the lane-change flag's open-at-start half is untested, and the lane test's title claimed the confirm tick — added a flipper press on the expiry (confirm) tick asserting `lanes.lit` unchanged, and corrected the title.
  - `[medium]` `[patch]` (verification-gap) selection direction and wrapping never tested — same root cause as the blind finding; the three-candidate row.
  - `[medium]` `[patch]` (verification-gap) the window's backwards-tick discard has no test — same root cause as the blind finding; the restart test.
  - `[low]` `[patch]` (verification-gap) the hold's 1-tick clamp is untested — same root cause as the blind finding; the hold-0 row.
  - `[low]` `[patch]` (verification-gap) the Backglass `warningShowing` term and the lit-line placement and drop are untested — same root cause as the blind Backglass finding; the rows above.
  - `[low]` `[reject]` (verification-gap) `expect(campaign.duration).toBe(control.duration)` cannot fail against product code — it guards the test's own construction, not an AC; the AC7 pins (per-tick mismatch list, credits 2) can fail.
  - `[low]` `[reject]` (verification-gap) some AC clauses have no `mutation:` line of their own — Rule 19 requires one per AC and all eight have one; the review pass added seven more lines for the clauses it pinned.
  - `[low]` `[reject]` (intent) the overlapping-flipper hold diverges from the literal "held continuously from an in-window press" — same root cause as the edge finding; the Design Notes settle it.
  - `[low]` `[reject]` (intent) the capture tick is closed for Start and moves but open for lane changes — same root cause as the blind Start finding; the Code Map and Design Notes settle both halves.
  - `[low]` `[reject]` (intent) the lit line is dropped with two or more player lines plus a fields line — a transient limit of the four-line panel; the line returns when the fields line clears, and the behaviour is now pinned.
  - `[false]` `[reject]` (intent) the contract shapes diverge (`modeWiring.lightShot`, `CampaignModeName` declared in `state.ts`) — `events.ts` exports `CampaignModeName` and `modeWiring.startShow` exists as specified; `lightShot` is what AD-16's `no-device-name-literal` requires.
  - `[low]` `[reject]` (intent) the Backglass tests feed hand-made events, not real `createRules()` output — the event types are shared contracts under `typecheck`, and the lead's browser smoke covers the real hand-off.
  - `[low]` `[patch]` (intent) no row covers the Lock-filling capture with two candidates, or `[controller shows, hit shows]` on one tick — added the Lock-filling window row; the command order is `sim/rules/index.ts`'s unchanged 3.3 path, pinned there.

## Design Notes

**Q1 and Q2 were answered by the author on 2026-09-30.** The intent block's "Author decisions" is the record. The earlier HALT text is in git history at `732960b`.

**Decisions recorded.**
- **Every Ramp lights the next Mode.** "`shot_ramp_made` with no Mode lit" is read with FR-33 ("each Ramp shot advances the progression"), and the epics are amended to match. The other reading would make the several-lit window unreachable.
- **Restarting needs no new field.** Under the round rule, `modesPlayed` keeps repeats, so 3.10's "contains all three" still reads correctly.
- **Two lock-first pairs.** AD-18's "exactly one outcome" says, in the same Rule, "when lock and mode start both apply it credits the lock first". So a captured entry that earns a credit and has candidates emits the credit's own outcome event first, and `lock_lane_mode_start` second:
  - `[lock_lane_locked, lock_lane_mode_start]` when the lock applies;
  - `[lock_lane_spit{credited: true}, lock_lane_mode_start]` when this capture fills the Lock ("the credit still counts", AD-18).

  These are the only two-event outcomes. Any other captured entry keeps exactly one.
- **"While the Lock is full" (author decision 4) means at entry.** The Lock already holds three balls, so the ball is never captured (`classify`'s `fullDevice`). The author's reason ("an uncaptured ball cannot be parked for selection") names that case. The intent's "the lock is full" branch is a different case: `held > 2` counts slots after the capture. That ball IS captured, parked in the staging slot, and can wait out a window, so a Mode starts there. It is reachable only in Hot seat, with other players' balls held.
- **The windowed lock serves at the confirm.** Epics AC 3 says "the Mouth then opens and ejects". Read with epics AC 2 ("or serves from the trough when the lock applied"), that applies to the unlocked capture (two credits, or the Lock filling). A locked ball stays locked, and its release is the serve (`release: 'serve'`).
- **No ball in play during the window, by design.** With 0 balls in play:
  - ball search is idle (`ball-search.ts:342`, `inPlayNow`);
  - the drain gate cannot open (`ballEndGateOpen` needs a non-Lock parking entry);
  - no ball end can happen before the release.
- **A Tilt in the window still runs the release.** A tilted serve or eject drains with dead flippers and ends the ball through the normal drain, which is also 3.2's behaviour for a lock just before a Tilt. Withholding the release would leave 0 balls in play and no ball end. Serving coils are outside Tilt's disable set (AD-5).
- **The flipper hold.** `pressedAt` is `{ side, tick } | null`:
  - it is set by the latest in-window `button_pressed` of a `flipperButtonWiring` switch (which also moves the selection);
  - it is cleared by that side's `button_released`;
  - it confirms when `tick - pressedAt.tick >= modeSelectHoldTicks`.

  A press made before the window opened never confirms.
- **The lane-change flag.** The ball controller's step result carries `modeSelectOpen`, which is true when a window was open at the start of the tick or is open at its end. While it is true, `sim/rules/index.ts` drops `lane_change_pressed` from the stack's events. So a press on the window's opening or confirm tick never rotates the lanes.
- **The arbiter-started shell and device events.** A shell started by the arbiter receives that tick's remaining device events from the stack (fan-out step 2), and the shells ignore them. Stories 3.5-3.7 must remember this.

**The interim, for the lead.**
- "Quick multiball" runs single-ball until 3.7: no second ball, and `machine.multiball` stays `null`. The Lock locks as usual meanwhile.
- Hurry-up and Joust score nothing until 3.5 and 3.6. All three run until the ball ends.
- A lit Mode is shown on the Backglass only. Its insert is Story 3.3c.

**What each later story inherits.**
- 3.3c: the `mode` lamp subject, read from `modesLit`.
- 3.5: `hurry-up.ts` (value, timer, `ModeView`, the Ramp collect).
- 3.6: `joust.ts`.
- 3.7: `quick-multiball.ts`. It adds `machine.multiball` in `_starting`, the second ball, and the bash-hit branch ahead of the lock and mode-start branches in `decideEntry`.
- 3.10: reads `modesPlayed`.
- Every one of them keeps `startCampaignMode()` as the only start path.

**Governing ADs:**
- AD-18: the arbiter, the lock-first pairs, the window and the Mouth.
- AD-8: priorities, the lifecycle as the only path, no coils.
- AD-7: `modesLit` is player-scoped; the `modeSelect` closure.
- AD-9: payload-complete events, `ShowCommand` in `TABLE.shows`, no text in rules, and the Backglass lit line as continuous display.
- AD-19: `shot_ramp_made`, `button_pressed` and `button_released` as device events.
- AD-3 and AD-15: ms tunables converted once.
- AD-16: no `show_` literals.

**For the lead (Rule 20), sentences for the spine:**
- AD-18: "A capture with lit Modes emits `lock_lane_mode_start { candidates, selected }`, after the credit's own outcome when a credit applies -- `lock_lane_locked`, or `lock_lane_spit { credited: true }` when that capture fills the Lock; these are the only two-event outcomes. A full-device entry never starts a Mode. With two or more candidates the ball stays in `bd_lock` for `modeSelectMs`: flipper presses move, Start / a `modeSelectHoldMs` hold / expiry confirm (`mode_select_ended`), and only then do the start and the release (serve, or Mouth) run; a Tilt ends the window with no start but runs the release."
- AD-7: "Player-scoped `modesLit`; `modesPlayed` is the append-only log of campaign starts. Closure: `ControllerState.modeSelect` (at most one; discarded on a phase change or a backwards tick)."
- AD-8: "Campaign Modes start only through `startCampaignMode()`, called by the Lock arbiter."

**Integration (Rules 1/2).**
- Consumed-by:
  - 3.3c: `modesLit`, for the lit-Mode inserts;
  - 3.5, 3.6 and 3.7: the shells and the start path;
  - 3.10: `modesPlayed`;
  - 4.5: `show_mode_start` and the window's events.
- Consumes:
  - 3.2's arbiter, Mouth and serve;
  - 3.1's lifecycle;
  - 2.4's `shot_ramp_made`, `button_pressed` and `button_released`.
- The Integration AC is AC 7, on a real `createRules()`: the three-ball switch script Hurry-up → Quick multiball → Joust.

**Ledger inbox (Rule 17).** DW-293 is addressed by AC 5 and the Ball-end row: the credit moves to the start, and the ball end credits nothing. No entry is declined.

**Footprint.**
- In the footprint: `src/sim/rules/**`, `src/sim/table/**`, and `test/replays/**` (headers only).
- Extensions to report (uncontended): `src/sim/contracts/{state,events}.ts`, `src/presentation/backglass/frame.ts` and `test/**`.
- No contended path is touched: no `src/presentation/mechanisms/**`, `src/presentation/scene/**`, `assets/src/**`, `public/assets/**`, `tools/make-placeholder-blend.py` or `ATTRIBUTIONS.md`.

**Browser smoke (lead).**
- **What to see:** start a game, then drive the `plunge-then-bat-r-3899` recipe (the medium 285-tick plunge, then a right-bat flip at relative tick 3899 held 60 ticks). After `s_ramp_made`, the DMD score screen shows `HURRY-UP LIT`; an in-page DMD sampler can read it.
- **The deciding check:** record that session and replay it through `createLoop()`. Then check:
  - `FrameOutput.snapshot.game.players[0].modesLit` equals `['hurryup']` from the `s_ramp_made` tick on;
  - `renderFrame` of that snapshot carries the `HURRY-UP LIT` row.
- **Optional Lock-lane leg:** the `plunge-then-bat-l-3945` Lock capture should show `lock_lane_locked` then `lock_lane_mode_start` and `show_mode_start` in `FrameOutput`, and the line should go away. The start itself is pinned headless by AC 3 and AC 7.

## Verification

**Commands** (first run `export BLENDER=C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe`; the baseline is 145 files / 2341 tests):
- `pnpm test` -- expected: all green, with the file count up by 2.
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions && pnpm build && pnpm check:dist && pnpm check:size` -- expected: each exits 0.
- `git diff -- test/replays` -- expected: only `tableHash` and the four new `gameStart.tuning` keys (`modeSelectMs`, `modeSelectTicks`, `modeSelectHoldMs`, `modeSelectHoldTicks`). If `expectedHash`, `expectedGameStateHash`, `transitions` or `checkpointTicks` moves, HALT with an intent gap.

**Mutations** (Rule 19). They are planned here; the implement stage applies each one, observes red, reverts, and records it as `mutation: <change> → <red test>`:
- AC1: delete `show_mode_start` from `shows`. `table.test.ts` goes red.
- AC2: drop the `scoringOpen` gate, and the tilted control goes red. Use `count > r` in the round rule, and the Restart row goes red.
- AC3: emit `lock_lane_mode_start` before `lock_lane_locked`, and the lock-applies row goes red. Let a `fullDevice` entry start a Mode, and the full-device row goes red.
- AC4: serve when the window opens, and the window-with-lock row goes red. Let Start reach S6, and the Start row goes red (`players.length`).
- AC5: restore the ball-end credit, and the Ball-end row goes red. Drop the `modesLit` removal, and the lock-applies row goes red.
- AC6: render the first candidate as selected. The backglass move test goes red.
- AC7: remove the arbiter's `startCampaignMode` call. The AC 7 run goes red.
- AC8: the golden replay tests.

**Implementation record (implement stage, 2026-09-30, at `a33eb66` + working tree).**

Gates: `pnpm test` 147 files / 2389 tests green (baseline 145 / 2341; +2 files: `test/rules-campaign.test.ts` 34 tests, `test/backglass-mode-select.test.ts` 13 tests; +1 test in `test/tuning.test.ts` for AC1's `unverified` pin). `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size` each exit 0. `git diff -- test/replays`: per golden, only `tableHash` (`e13b7b0f` -> `da937508`) and the four new `gameStart.tuning` keys; no `expectedHash`, `expectedGameStateHash`, `transitions` or `checkpointTicks` moved.

Mutations (each applied, observed red, reverted; suite green after):
- mutation: AC1 -- delete `show_mode_start` from `TABLE.shows` → `test/table.test.ts` "shows holds exactly the three Dragon shows ... and show_mode_start" red.
- mutation: AC2 -- drop the `scoringOpen()` conjunct in `base.ts`'s `lightNextMode` → `rules-campaign` "control: the same Ramp while tilted lights nothing" and "... outside a game ..." red.
- mutation: AC2 -- `playedCount(...) > round` in `nextModeToLight` → `rules-campaign` "Matrix Restart" (and its control, First Ramp, Order) red.
- mutation: AC3 -- push `lock_lane_mode_start` before `lock_lane_locked` → `rules-campaign` "Matrix One lit, lock applies" (and Active excluded, Window with lock) red.
- mutation: AC3 -- let a `fullDevice` entry read candidates → `rules-campaign` "entry row full-device" red.
- mutation: AC4 -- run the release when the window opens → `rules-campaign` "Matrix Window with lock" (trough pulse at t) and five other window rows red.
- mutation: AC4 -- hand S6 the unfiltered events (Start reaches S6 in the window) → `rules-campaign` "Matrix Window, Start" red (`players` length 2).
- mutation: AC5 -- restore the ball-end credit of every active mode's name → `rules-campaign` "Matrix Ball end" and the AC7 run red.
- mutation: AC5 -- drop the `modesLit` removal in `startCampaignMode` → `rules-campaign` "Matrix One lit, lock applies" (and five more) red.
- mutation: AC6 -- mark the first candidate (`index === 0`) instead of `selected` → `backglass-mode-select` "it follows mode_select_moved" red.
- mutation: AC7 -- replace the arbiter's `startCampaignMode()` call with a no-op → `rules-campaign` AC7 "each ball's Lock capture starts the Mode its Ramp lit" (and eight rows) red.
- mutation: AC8 -- `modeSelectHoldMs` 500 -> 501 in one golden header → `test/replay-goldens.test.ts` roll-and-drain rows red (`StaleReplayHeaderError`).

Mutations added by the review pass (2026-09-30; each applied, observed red, reverted; `git status --short` and `git diff --stat` byte-identical after):
- mutation: AC4 (Slam) -- drop the `'mouth'` window's owed `requestMouthEject()` in `stepModeSelect`'s phase-change discard → `rules-campaign` "a Slam in an unlocked capture's window ... owed Mouth eject still runs" red.
- mutation: AC4 (direction) -- step `+1` for both flippers instead of `side === 'right' ? 1 : -1` → `rules-campaign` "three candidates: the right flipper steps forward, the left steps back, and both wrap" red.
- mutation: AC4 (reset-safety) -- delete the `cs.modeSelect` discard in `discardStaleMouth()` → `rules-campaign` "an uninterrupted timeline expires at t+W; a timeline restarted at tick 1 never confirms" red.
- mutation: AC4 (hold floor) -- drop `Math.max(1, ...)` on `modeSelectHoldTicks` → `rules-campaign` "mode-select hold 0 ms: the hold is floored at 1 tick" red.
- mutation: AC4 (lanes) -- `modeSelectOpen: cs.modeSelect !== null` (drop the open-at-start half) → `rules-campaign` "a flipper press on the window's CONFIRM tick ... never rotates the lanes" red.
- mutation: AC6 (WARNING carry) -- drop `warningShowing ||` in `advanceBackglass`'s `mode_select` branch → `backglass-mode-select` "a WARNING already showing when the window opens is carried too" red.
- mutation: AC6 (lit line) -- drop `nextFreeRow += LINE_PITCH_ROWS` → `backglass-mode-select` "with a fields line ... it sits one line further down" (and the crowded row) red; drop `&& nextFreeRow < DMD_ROWS` → "two player lines plus a fields line leave no free line" red.

Mutations added by the code review (2026-09-30; each applied, observed red, reverted; `git status --short` and `git diff --stat` byte-identical after):
- mutation: AC4 (DW-296) -- `if (false && mouthEjectPending(ctx))` in `handleStartButton` (a Start honoured while a Mouth eject is pending) → `mode-select-slam-physics` "DW-296: a Start INSIDE the Mouth's lead after the Slam starts no game ..." red, and `rules-campaign` "DW-296: after a Slam in an unlocked capture's window ..." and "DW-296 (Story 3.2's path) ..." red.
- mutation: AC4/AC5 (AD-7, per player) -- `startMode(ctx, state, mode, 0, tick, out)` in `endWindow` → `rules-campaign` "AD-7: a window opened by player 2 (Hot seat) ..." red.
- mutation: AC1 (`unverified`) -- `modeSelectHoldMs` confidence `'unverified'` -> `'low'` → `tuning` "Story 3.4 AC1: modeSelectMs (10000) and modeSelectHoldMs (500) are unverified ..." red.

Implementation notes for review (choices the spec left open, or small deviations):
- `CampaignModeName` is declared in `contracts/state.ts` and re-exported from `contracts/events.ts`. `events.ts` already imports `state.ts`; declaring it in `events.ts` would need a type-only import back, which `no-circular` counts as a cycle.
- `TABLE.modeWiring` also carries `lightShot: 'shot_ramp'`, so the base mode builds `${lightShot}_made` instead of spelling a `shot_` literal (AD-16's `no-device-name-literal`).
- `test/rules-mode-stack.test.ts` "the table is AD-8's" pinned the production registry to `[skill_shot, base]`; it now lists the three shells too (a by-design pin change the Code Map did not list).
- `BackglassView` gains a required `heldModeSelect`; the four full `BackglassView` literals in `test/backglass-frame.test.ts` gain `heldModeSelect: null`.
- The `mode_select` screen: `SELECT MODE`, then one row per candidate; the selected row is marked with `emphasis` (inverse video in `raster.ts` -- the font has no marker glyph). It yields to an armed or live `ball_ended` hold and wins over TILT/WARNING; a `tilt_warning` inside the window is carried as `pendingTiltWarning` and shows on the first frame after it (`holdUntilTick` is the frame's own tick, keeping the reset-safety bound).
- Campaign display names live in a separate `CAMPAIGN_DISPLAY_NAMES` table, not `MODE_DISPLAY_NAMES`: an entry there would give an active shell a status-line name, which Stories 3.5-3.7 decide. The lit line sits on the first free line below the status and fields lines and is dropped when no line is left (two or more player lines plus a fields line).
- A capture while a window is already open (unreachable: no ball is in play meanwhile) starts nothing, keeping at most one window.

**QA stage (2026-09-30, `bmad-qa-generate-e2e-tests`, at `2e9d6c6` + working tree; no production file changed).**

Files (QA):
- `test/mode-select-slam-physics.test.ts` (QA) -- 3 tests on real physics (`createMachine()` + `createRules()` composed in `sim/loop`'s step order, a genuine ten-edge nudge Slam, the loop's own `buttonSwitchEdges()` for Start and the flippers).
- `test/rules-campaign-qa.test.ts` (QA) -- 9 headless tests, added to `test/rules-devices-headless.test.ts`'s `ENTRY_FILES`.
- `test/rules-campaign-qa-integration.test.ts` (QA) -- 7 tests: a real `createRules()` run folded through `advanceBackglass()`/`renderFrame()`, rasterised and read back from the dots.
- `test/rules-devices-headless.test.ts` (QA) -- `ENTRY_FILES` gains `rules-campaign-qa.test.ts`.

Gates: `pnpm test` 150 files / 2419 tests green (was 147 / 2400). `typecheck`, `lint:boundaries` and `check:headers` exit 0. New test files are ASCII-only.

Mutations (each applied, observed red, reverted; `git status --short -- src` empty and `git diff --stat -- src` empty after each):
- mutation: AC4 (Slam, real physics) -- drop the `'mouth'` window's `requestMouthEject()` in `stepModeSelect`'s phase-change discard → `mode-select-slam-physics` "the window opens on a real capture, a real nudge burst Slams ... then Start: the Lock is empty ..." and "Start while the spat ball is still loose ..." red.
- mutation: AC4 (windowed lock, real physics) -- run the serve when a `'serve'` window opens → `mode-select-slam-physics` "the capture locks and opens the window ... only then is the next ball served" red (`c_trough_eject` at the open and the confirm).
- mutation: AC2 (restart through play) -- `const round = 0 * campaignRound(player)` in `nextModeToLight` → `rules-campaign-qa` "ball 4's Ramp lights Hurry-up again ..." red.
- mutation: AC3/AC7 (per player, AD-7) -- `candidatesFor(nextState, 0)` in `decideEntry` → `rules-campaign-qa` "player 2's first capture ... player 1's lit Hurry-up survives it" and "player 2's own Ramp ... starts it for player 2" red.
- mutation: AC7 (per-tick control, per player) -- `startCampaignMode` also writes `letters: ''` → `rules-campaign-qa` "at every tick, each player's lockCredits and letters equal the control run's" red (ticks 1400-1500).
- mutation: AC6 (lit line, dots) -- `modesLit[modesLit.length - 1]` in the score screen's lit line → `rules-campaign-qa-integration` "the first Ramp puts HURRY-UP LIT on the panel's dots ... the second leaves it naming the FIRST lit Mode" red (`QUICK MB LIT`).
- mutation: AC6 (marker, dots) -- `emphasis: index === 0` in `buildModeSelectRows` → `rules-campaign-qa-integration` "the right flipper moves the inverse marker to QUICK MB on the move tick" red.

QA finding (not pinned; product code unchanged): a Start pressed INSIDE the Mouth's lead after a Slam (measured on real physics: Slam at 617, Start at 618, `mouthOpenLeadTicks` 1000) starts the new game and serves its ball, then the owed eject pulses `c_mouth` at 1617 INTO the new game -- two balls on the table, and the Slam-era ball's drain (tick 3027) ends the new game's ball 1 while its served ball still rests unplunged in the shooter lane. Story 3.2's credited-out spit (two credits, nothing lit) shows the same thing (pulse 1512, `ball_ended` 2899): the root cause is AD-18's "a Mouth sequence runs in any phase" meeting AD-6's Start-time stray clear, which recovers only loose balls, never a parked one waiting on the Mouth. Story 3.4's Slam fix makes it reachable across the whole 10 s window instead of only the 1 s lead after a spit. For the lead to ledger.

## Auto Run Result

Status: done
Blocking condition: none

**Implementation and review run (2026-09-30, `bmad-build-auto`, resumed at implement).**
- Baseline `a33eb664e89fb141d191b5f7bfd4e74d7db73e2c` on `DW-1-epic3`; worktree verified as `C:/git/dragonwar/.worktrees/epic-3`. One implementation-handoff subagent, then four review layers (blind, edge-case, verification-gap, intent-alignment). No subagent committed or pushed (HEAD unchanged until finalize).
- **What changed.** Each Ramp completion lights the next campaign Mode into the new player-scoped `modesLit` (round rule, behind `scoringOpen()`). The Lock arbiter starts a lit Mode on a captured entry, crediting the lock first (`[locked, mode_start]` or `[spit{credited}, mode_start]`), and with two or more candidates holds the ball in `bd_lock` for the mode-select window: flipper edges move, Start or a `modeSelectHoldMs` hold or the `modeSelectMs` expiry confirm, and a Tilt ends it with no start but runs the release. Every start goes through `startCampaignMode()`, which credits `modesPlayed` and un-lights the Mode; the arbiter pushes `show_mode_start`. DW-293: the ball end no longer writes `modesPlayed`. Three registered shells (Hurry-up, Quick multiball, Joust). The Backglass gains the `mode_select` screen and the `<MODE> LIT` score-screen line.
- **Files.**
  - `src/sim/contracts/state.ts` -- `CampaignModeName`, `PlayerState.modesLit`, `modesPlayed` doc restated.
  - `src/sim/contracts/events.ts` -- the three events and `ModeSelectEndReason`, in `SemanticEvent`; re-exports `CampaignModeName`.
  - `src/sim/table/dragonwar.ts` -- `show_mode_start`, `modeWiring { startShow, lightShot }`.
  - `src/sim/table/tuning.ts` -- `modeSelectMs` 10000 and `modeSelectHoldMs` 500, `unverified`, owned by Story 3.11.
  - `src/sim/rules/modes/campaign.ts` (new) -- campaign order, round rule, candidates, `startCampaignMode()`.
  - `src/sim/rules/modes/{hurry-up,quick-multiball,joust}.ts` (new) -- the shells.
  - `src/sim/rules/modes/index.ts` -- registers the shells; `src/sim/rules/modes/base.ts` -- lights on `shot_ramp_made`.
  - `src/sim/rules/ball-controller/lock-arbiter.ts` -- the start branches, the window, the Slam's owed eject, the backwards-tick discard.
  - `src/sim/rules/ball-controller/{shared,index,start,ball-end}.ts` -- `modeSelect` closure and ticks, S6's Start filter, the `modeSelectOpen` flag, `emptyPlayer`, DW-293.
  - `src/sim/rules/index.ts` -- drops `lane_change_pressed` from the stack while the flag is set.
  - `src/presentation/backglass/frame.ts` -- `mode_select` screen, `heldModeSelect`, lit line.
  - Tests: `test/rules-campaign.test.ts` (new, headless, in `ENTRY_FILES`), `test/backglass-mode-select.test.ts` (new); `modesLit: []` in every `PlayerState` literal; by-design pin edits in `contracts`, `table`, `tuning`, `rules-lifecycle`, `rules-mode-stack`, `rules-mode-stack-integration`, `backglass-frame`; the five goldens' headers.
- **Review findings.** 37 findings: 0 high, 7 medium, 25 low, 4 false, 1 maybe-false (full rows in the Review Triage Log).
  - Patched (15 rows; entries by verdict: 4 medium, 7 low): the Slam's owed Mouth eject for an unlocked capture's window (the one product-code fix); the orphaned JSDoc; tests for flipper direction and wrapping, the backwards-tick discard, the hold floor, the re-press hold, the confirm-tick lane flag, the Lock-filling window, the Backglass WARNING carry and lit-line placement and drop; full-list assertions in place of `slice(n)`.
  - Deferred (1): ball save keeps expiring during a window (medium, a product call, in `deferred:`).
  - Rejected (21), each with its reason in the triage log: `show_mode_start` on a no-op start (unreachable in production, x2); the capture-tick Start reaching S6 (by design per the Code Map, x4); the exact-Hd release boundary; overlapping-flipper holds (per the Design Notes, x2); the Backglass backwards-tick bound (reopen_if recorded); `moved` without an open (false); the lit line naming an active Mode (false); the second same-batch capture (maybe-false, low if true); the multiplayer lit-line drop; the contract shapes (false); hand-made Backglass events; the lifecycle negative's pair; `modesPlayed`'s type; `discardStaleMouth`'s name and the stale Auto Run Result (false); the test-construction guard; the per-clause mutation lines.
- **Follow-up review recommended: true.** Patched on this first pass: 0 high, 4 medium, 7 low entries (two or more medium). The named unverified risk is the one product-code patch: after a Slam, an unlocked capture's owed Mouth eject is now requested in Attract. It is pinned headless (`runRulesScript`) but not on real physics, and not against the next game's Start-time stray clear (AD-6), which could meet that ejected ball.
- **Verification.** Final tree: `pnpm test` 147 files / 2400 tests, all green (baseline 145 / 2341). `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` each exit 0 (size 0.890 MB of 2.750 MB). Goldens compared by JSON parse, field by field against the baseline: only `header.tableHash` and `header.gameStart.tuning.{modeSelectMs, modeSelectHoldMs, modeSelectTicks, modeSelectHoldTicks}` differ in all five; no `expectedHash`, `expectedGameStateHash`, `transitions` or `checkpointTicks` moved. Matrix Test Audit: all 15 rows are covered by `test/rules-campaign.test.ts` tests that ran green. Rule 19: 12 implement-stage mutations and 7 review-pass mutations recorded in `## Verification`, each observed red and reverted with the tree byte-identical. Added lines are ASCII-only; LF throughout.
- **Residual risks.**
  - The deferred ball-save question.
  - The Slam-eject interaction above.
  - A Start pressed on the exact capture tick still reaches S6 (by design).
  - The lit line is hidden while two or more player lines and a fields line fill the panel.
  - The browser smoke (lead) is not run here.

**Planning run 2 (2026-09-30, `bmad-build-auto`, halt after planning).**
- Planned at `b82acef435b0e9ac7073a513724ff0feffcb57a4` on `DW-1-epic3`.
- The worktree was verified as `C:/git/dragonwar/.worktrees/epic-3`, and the tree was clean.
- It reused the committed `epic-3-context.md`, which is newer than every planning artifact, and did not recompile it.
- The intent block is preserved. The only edit is one phrase in its Never list (see the Spec Change Log).
- Checked against READY FOR DEVELOPMENT: every task names its files, the tasks are in dependency order, and every AC is Given/When/Then with a planned mutation. There are no TBDs.
- The earlier run (2026-09-29) HALTed `blocked` with an intent gap (no insert lamp). The author answered it on 2026-09-30.
- No files other than this spec were written. No commit and no push.
