---
title: 'Story 3.4: Lighting Modes at the Ramp and starting them at the Lock lane'
type: 'feature'
created: '2026-09-29'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: [oversized]
deferred: []
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

## Auto Run Result

Status: ready-for-dev
Blocking condition: none

**Planning run 2 (2026-09-30, `bmad-build-auto`, halt after planning).**
- Planned at `b82acef435b0e9ac7073a513724ff0feffcb57a4` on `DW-1-epic3`.
- The worktree was verified as `C:/git/dragonwar/.worktrees/epic-3`, and the tree was clean.
- It reused the committed `epic-3-context.md`, which is newer than every planning artifact, and did not recompile it.
- The intent block is preserved. The only edit is one phrase in its Never list (see the Spec Change Log).
- Checked against READY FOR DEVELOPMENT: every task names its files, the tasks are in dependency order, and every AC is Given/When/Then with a planned mutation. There are no TBDs.
- The earlier run (2026-09-29) HALTed `blocked` with an intent gap (no insert lamp). The author answered it on 2026-09-30.
- No files other than this spec were written. No commit and no push.
