---
title: 'Story 3.4: Lighting Modes at the Ramp and starting them at the Lock lane'
type: 'feature'
created: '2026-09-29'
status: 'draft'
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
- Never touch `TABLE.lamps`, `sim/rules/lamps.ts`'s projection, or any insert. The lit-Mode insert is the lead's open question (Design Notes, Q1).
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

- `src/sim/contracts/state.ts:100-114`: `PlayerState` (add `modesLit`; restate `modesPlayed`'s doc as the append-only log of campaign starts).
- `src/sim/contracts/events.ts:312-345, 391-414`: the lock-lane events and the `SemanticEvent` union. Add the three events and `CampaignModeName`.
- `src/sim/rules/modes/priorities.ts`: `MODE_PRIORITIES` already declares `hurryup` 300, `joust` 310 and `quickmb` 400.
- `src/sim/rules/modes/registry.ts`: the `ModeDefinition` shape. The shells need only `name`, `priority` and `onEvent`.
- `src/sim/rules/modes/lifecycle.ts:57-76`: `startModes()`. It is a no-op for a mode already active, which is why candidates exclude active Modes.
- `src/sim/rules/modes/index.ts`:
  - `BALL_START_MODES` (:66): unchanged;
  - `MODE_LAMP_ROLES` (:74): unchanged;
  - `createProductionModeDefinitions` (:80): append the shells.
- `src/sim/rules/modes/base.ts`: `onEvent` gains `shot_ramp_made` → light, behind `scoringOpen`. Check the `DeviceEvent` name in `devices/events.ts:170`.
- `src/sim/rules/modes/campaign.ts` (new): `CAMPAIGN_ORDER`, `nextModeToLight(player)`, `candidatesFor(state, player)` and `startCampaignMode(state, lookup, mode, player, tick)`.
- `src/sim/rules/ball-controller/lock-arbiter.ts`:
  - `decideEntry` (:273-304): the branches above;
  - `serveAfterLock` (:196-205): reuse it at the confirm;
  - `requestMouthEject` (:117-131);
  - `arbitrateLockLane` (:230-266): step the window first;
  - `discardStaleMouth` (:94-102): also discard `modeSelect`.
- `src/sim/rules/ball-controller/shared.ts:448-462`: `ControllerState` (add `modeSelect` with a doc comment) and `ControllerContext` (add `modeSelectTicks` and `modeSelectHoldTicks`). `ctx.modes` is the `ModeLookup` that `startCampaignMode` uses.
- `src/sim/rules/ball-controller/index.ts`:
  - :159-169: resolve the two ticks;
  - :172-180: seed `modeSelect: null`;
  - :211: S6 receives the events without Start presses while `cs.modeSelect !== null`.
- `src/sim/rules/ball-controller/start.ts:37` (`emptyPlayer`: `modesLit: []`) and :162 (S6's Start read).
- `src/sim/rules/ball-controller/ball-end.ts:196-208`: drop the `modesPlayed` credit (DW-293) and keep the score write.
- `src/sim/rules/index.ts:351`: the stack's device events also drop `lane_change_pressed` while a window is open. The ball controller exposes this as a flag on its step result, so the rules root never reads closure state.
- `src/sim/table/dragonwar.ts:716-720` (`shows`), beside `lockLaneWiring` (:606-616): `modeWiring`. `src/sim/table/tuning.ts:361`: add the two entries after `mouthCloseHoldMs`.
- `src/presentation/backglass/frame.ts`: `DmdScreen` (:81; add `mode_select`), `advanceBackglass`'s held payloads (the `HeldMatch` pattern, :96-130), and `renderFrame`'s `never`-guarded switch (:993). Display names live here only.
- Tests whose pins change by design:
  - `test/rules-lifecycle.test.ts:209-210` (the stub credit becomes "nothing credited at ball end");
  - `test/rules-mode-stack-integration.test.ts:254` (`['base','skill_shot']` becomes `[]`);
  - `test/table.test.ts:270-276` (three shows become four);
  - `test/tuning.test.ts:29` (`scalarKeys`);
  - `test/contracts.test.ts:291` (the `never` arms);
  - every `PlayerState` literal: `test/util/snapshot-factory.ts:50` and about 20 test files (grep `modesPlayed: \[`) gain `modesLit: []`.
  - `test/rules-mode-stack.test.ts:358` stays green: the shells carry no `lamps`.
- Reusable test helpers: `capture()`, `lockEvents()` and `pulseTicks()` in `test/rules-lock-arbiter.test.ts:105-126`; `runRulesScript()` in `test/util/switch-script.ts:279`, which already runs `assertModesChangedOnlyByLifecycle`.
- Real Ramp input for the smoke: `test/util/reachability.ts:309` `plunge-then-bat-r-3899` closes `s_ramp_enter` then `s_ramp_made` on real physics.

## Tasks & Acceptance

**Execution:**
1. `src/sim/contracts/state.ts` and `events.ts`: `modesLit`, `CampaignModeName` and the three events. Then `test/contracts.test.ts` arms, and `modesLit: []` in every `PlayerState` literal under `test/**`.
2. `src/sim/table/dragonwar.ts` and `tuning.ts`: the show, `modeWiring`, and the two tunables.
3. `src/sim/rules/modes/campaign.ts`, `hurry-up.ts`, `quick-multiball.ts` and `joust.ts` (new), plus `modes/index.ts` (register) and `modes/base.ts` (lighting).
4. `src/sim/rules/ball-controller/*`: `emptyPlayer`, DW-293 in `ball-end.ts`, `modeSelect` and the ticks, the arbiter branches and window, and S6's Start filter. `src/sim/rules/index.ts`: the lane-change filter.
5. `src/presentation/backglass/frame.ts`: the `mode_select` screen and the lit line.
6. `test/rules-campaign.test.ts` (new, headless, listed in `test/rules-devices-headless.test.ts`'s `ENTRY_FILES`): every Matrix row, and AC 7.
7. `test/backglass-mode-select.test.ts` (new): AC 6. The listed pin edits, and the header-only golden refresh. Diagnose any other red test; never loosen it.

**Acceptance Criteria:**
- AC1: Given `TABLE` and `TUNING`, when `table.test.ts` and `tuning.test.ts` run, then `shows` holds exactly the four shows, `modeWiring.startShow` names a declared show, and `modeSelectMs` and `modeSelectHoldMs` are `unverified` entries.
- AC2 (Matrix rows 1-3): Given a player in a game, when `shot_ramp_made` arrives, then `modesLit` gains the next Mode per the round rule, and never under Tilt or outside a game.
- AC3 (rows 4-8): Given candidates on a captured entry, then the lock is credited first and the one candidate starts on that tick, released by a serve or the Mouth. With no candidates, under Tilt or in a multiball, 3.2's outcome is unchanged.
- AC4 (rows 9-14): Given two or more candidates, then the ball stays in `bd_lock` for up to W. Flipper presses move the selection; Start, a hold of Hd or the expiry confirms; and only then do the start and the release run. Start adds no player, the lanes do not rotate, and a Tilt ends the window with no start.
- AC5 (row 4, row 15, DW-293): Given any campaign start, when `mode_<name>_started` fires, then `modesPlayed` gains that name, `modesLit` loses it, and `show_mode_start` is in that tick's `commands`. A ball end credits nothing.
- AC6: Given `advanceBackglass`/`renderFrame` fed a window's events, then the `mode_select` screen lists both candidates with the marker on `selected`, follows `mode_select_moved`, and drops at `mode_select_ended`. The score screen reads `HURRY-UP LIT` when `modesLit` is [hurryup], and has no lit line when it is [].
- AC7 (Integration, Rules 1/2): Given a real `createRules()` in `runRulesScript`, one player and three balls, when each ball makes the Ramp and then enters the Lock lane, then Hurry-up, Quick multiball and Joust start on balls 1, 2 and 3 in that order. At every tick, `lockCredits` and `letters` equal a control run with the Ramp closures removed.
- AC8: Given the story, when the gates run (`pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`), then all pass and the goldens differ only in their headers.

## Spec Change Log

- 2026-09-30, lead (re-dispatch after the plan HALT `intent gap -- no insert lamp`): the author chose (B) -- inserts move to the new Story 3.3c -- and accepted the four Q2 calls (every Ramp lights the next Mode per FR-33, flipper hold confirms via `modeSelectHoldMs`, a full-Lock entry never starts a Mode, Quick multiball single-ball until 3.7). Written into the intent block and Design Notes; `epics.md` Story 3.4 amended accordingly. Status reset to `draft` for a re-plan on this spec path.

## Review Triage Log

## Design Notes

**Q1 and Q2 are ANSWERED (2026-09-30, author) -- see the intent block's "Author decisions"; the text below records the question as it was asked.**

**Q1 -- blocking (intent gap, Rule 11 (c) and Rule 5 ask-first): there is no insert for a lit Mode.**
- The epics criteria want "its insert shows its role at step 1" and "its insert goes off". `TABLE.lamps` holds 15 inserts: seven lanes, six letters, `l_lock` and `l_ball_save`.
- A new lamp needs a glb mesh node of the same name (`test/asset-contract.test.ts:2792`). Those nodes come from `tools/make-placeholder-blend.py` and `public/assets/dragonwar.glb`, and both are contended with Epic 5.
- `l_lock` has its own author-decided meaning (DW-212: lockable), so reusing it would change another decision.
- The same gap will hit 3.5 (the Ramp insert), 3.6 (the Loop inserts), 3.7 (Dragon and Ramp), 3.8 and 3.9 (War and Jackpot) and 3.10 (the Extra-ball insert).
- **Recommended amendment (B):** move the insert clauses of 3.4's AC 1 and AC 4 to one new "Epic 3 inserts" story, sequenced after Epic 5 merges (beside 3.3b). That story adds every Epic 3 insert to the placeholder blend and `TABLE.lamps` at once, and binds each story's roles. Until then, 3.4 shows a lit Mode on the Backglass score screen, which this draft already plans.
- Alternatives:
  - (A) The orchestrator has Epic 5 add `l_mode_hurryup`, `l_mode_quickmb` and `l_mode_joust` (and the other Epic 3 inserts) during 5.0a, and 3.4 waits for them.
  - (C) The author grants Epic 3 a contended edit of the blend script and the glb.
- Either A or C would restore a `lampsOf` task here. The proposal is a `mode` lamp subject, zone-less like `ball_save`, projected by the base mode as `hurryup`, `quickmb` or `joust` at step 1 while the Mode is in `modesLit`.

**Q2 -- non-blocking, answered here unless the lead says otherwise.**
- A full-device entry (the Lock already holds three balls) never starts a Mode. Its ball is never captured, so there is nothing to hold for a window. It is reachable only in Hot seat, with the Lock full of other players' balls.
- The flipper "held" confirm needs a duration. It is the new `modeSelectHoldMs` (500, `unverified`), and a hold both moves the selection (its press edge) and then confirms it. The epics text names the press edge (`button_pressed`) as the mover.

**Decisions recorded.**
- "`shot_ramp_made` with no Mode lit" is read with FR-33 ("each Ramp shot advances the progression"): every Ramp lights the next Mode. The reading "only when none is lit" would make the several-lit window unreachable.
- The round rule makes "restart" need no new field. `modesPlayed` keeps repeats, so 3.10's "contains all three" still reads correctly.
- AD-18's "exactly one outcome" versus lock + start: AD-18 itself says "when lock and mode start both apply it credits the lock first", so `[lock_lane_locked, lock_lane_mode_start]` is its one sanctioned pair.
- The serve after a windowed lock waits for the confirm, so no ball is in play while the flippers select. With 0 balls in play, ball search is idle (`ball-search.ts:343`). The drain gate cannot open, because no non-Lock parking entry can occur.
- A shell started by the arbiter receives that tick's remaining device events from the stack (fan-out step 2). The shells ignore them. 3.5-3.7 must remember this.

**The interim, for the lead.**
- "Quick multiball" runs single-ball until 3.7: no second ball, `machine.multiball` stays `null`, and the Lock locks as usual meanwhile.
- Hurry-up and Joust score nothing until 3.5 and 3.6. All three run until the ball ends.

**What each later story inherits.**
- 3.5: `hurry-up.ts` (value, timer, `ModeView`, the Ramp collect).
- 3.6: `joust.ts`.
- 3.7: `quick-multiball.ts`. It adds `machine.multiball` in `_starting`, the second ball, and the bash-hit branch ahead of the lock and mode-start branches in `decideEntry`.
- 3.10: reads `modesPlayed`.
- Every one of them keeps `startCampaignMode()` as the only start path.

**Governing ADs:**
- AD-18: the arbiter, the lock-first pair, the window and the Mouth.
- AD-8: priorities, the lifecycle as the only path, no coils.
- AD-7: `modesLit` player-scoped, the `modeSelect` closure.
- AD-9: payload-complete events, `ShowCommand` in `TABLE.shows`, no text in rules.
- AD-19: `shot_ramp_made` and `button_pressed` as device events.
- AD-3 and AD-15: ms tunables converted once.
- AD-16: no `show_` literals.

**For the lead (Rule 20), sentences for the spine:**
- AD-18: "A capture with lit Modes emits `lock_lane_mode_start { candidates, selected }`, after `lock_lane_locked` when the lock applies -- the one sanctioned pair. With two or more candidates the ball stays in `bd_lock` for `modeSelectMs`: flipper presses move, Start / a `modeSelectHoldMs` hold / expiry confirm (`mode_select_ended`), and only then do the start and the release (serve, or Mouth) run; a Tilt ends the window with no start."
- AD-7: "Player-scoped `modesLit`; `modesPlayed` is the append-only log of campaign starts. Closure: `ControllerState.modeSelect` (at most one; discarded on a phase change or a backwards tick)."
- AD-8: "Campaign Modes start only through `startCampaignMode()`, called by the Lock arbiter."

**Integration (Rules 1/2).**
- Consumed-by:
  - 3.5, 3.6 and 3.7: the shells and the start path;
  - 3.10: `modesPlayed`;
  - 4.5: `show_mode_start` and the window's events.
- Consumes: 3.2's arbiter, Mouth and serve; 3.1's lifecycle; 2.4's `shot_ramp_made` and `button_pressed`.
- The Integration AC is AC 7, on a real `createRules()`.

**Ledger inbox (Rule 17).** DW-293 → AC 5 and the Ball-end row: the credit moves to the start, and the ball end credits nothing. No entry is declined.

**Footprint.**
- In the footprint: `src/sim/rules/**`, `src/sim/table/**`, and `test/replays/**` (headers only).
- Extensions to report (uncontended): `src/sim/contracts/{state,events}.ts`, `src/presentation/backglass/frame.ts` and `test/**`.

**Browser smoke (lead).**
- Real input reaches the Ramp (`plunge-then-bat-r-3899`). After one Ramp the DMD score screen should read `HURRY-UP LIT`, which an in-page DMD sampler can check.
- A Lock-lane capture then starts it. Replay the recording through `createLoop()` and check `lock_lane_mode_start` and `show_mode_start` in `FrameOutput`.

## Verification

**Commands** (run with `export BLENDER=C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe`; the baseline is 145 files / 2341 tests):
- `pnpm test` -- expected: all green.
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions && pnpm build && pnpm check:dist && pnpm check:size` -- expected: each exits 0.
- `git diff -- test/replays` -- expected: only `tableHash` and the four new `gameStart.tuning` keys.

**Mutations** (Rule 19; planned here, applied and recorded by the implement stage):
- AC1: delete `show_mode_start` from `shows`. `table.test.ts` goes red.
- AC2: drop the `scoringOpen` gate. The tilted control goes red. Use `count > r` in the round rule. The Restart row goes red.
- AC3: emit `lock_lane_mode_start` before `lock_lane_locked`. The lock-applies row goes red.
- AC4: serve at window open. The window-with-lock row goes red. Let Start reach S6. The Start row goes red (`players.length`).
- AC5: restore the ball-end credit. The Ball-end row goes red. Drop the `modesLit` removal. The lock-applies row goes red.
- AC6: render the first candidate as selected. The backglass move test goes red.
- AC7: remove the arbiter's `startCampaignMode` call. The AC 7 run goes red.
- AC8: the golden replay tests.

## Auto Run Result

Status: blocked
Blocking condition: intent gap -- there is no insert lamp for a lit Mode. Epics Story 3.4's AC 1 ("its insert shows its role at step 1") and AC 4 ("its insert goes off") need new `l_` inserts. `TABLE.lamps` holds only 15 inserts (lanes, letters, `l_lock`, `l_ball_save`), every `TABLE.lamps` key must have a glb mesh node (`test/asset-contract.test.ts:2792`), and those nodes come from `tools/make-placeholder-blend.py` and `public/assets/dragonwar.glb`, which are CONTENDED with Epic 5 (Rule 11 (c)). Deferring or narrowing the clause is Rule 5 ask-first. Recommended amendment (B): move the insert clauses of 3.4 to one new post-Epic-5 "Epic 3 inserts" story (beside 3.3b) that adds every Epic 3 insert at once -- 3.5, 3.6, 3.7, 3.8, 3.9 and 3.10 have the same gap -- and show a lit Mode on the Backglass score screen in 3.4 meanwhile, as this draft plans. Alternatives: (A) Epic 5 adds the `l_` nodes during 5.0a and 3.4 waits for them; (C) the author grants Epic 3 a contended edit.

**Planning run (2026-09-29, `bmad-build-auto`, halt after planning).** Planned at `968ff5dc1217547cdd697151090732a0e188123c` on `DW-1-epic3`.
- It used the committed `epic-3-context.md` without recompiling it, and Story 3.3's spec (`done`) for continuity. The worktree was verified as `C:/git/dragonwar/.worktrees/epic-3`, and the tree was clean before planning.
- The draft is complete under the recommended amendment. The intent contract, Code Map, Matrix (15 rows), ACs 1-8 and planned mutations are all in place. Only the lamp clauses are carved out (the Never list and Design Notes Q1).
- **Questions for the lead:**
  - Q1 (blocking): the insert, above.
  - Q2 (non-blocking; the draft answers it): a full-device entry never starts a Mode. The flipper-held confirm uses a new `modeSelectHoldMs` (500, `unverified`), and a hold moves the selection, then confirms.
- **Key decisions in the draft:**
  - Every Ramp lights the next Mode, per FR-33. The "with no Mode lit" wording would make the several-lit window unreachable.
  - A round rule over an append-only `modesPlayed` gives "restart" with no new field.
  - `[lock_lane_locked, lock_lane_mode_start]` is AD-18's lock-first pair.
  - The serve after a windowed lock waits for the confirm.
  - While the window is open, Start and lane change are withheld.
  - A Tilt ends the window with no start.
  - There are three campaign shells, and Quick multiball runs single-ball until 3.7.
  - `startCampaignMode()` is the single start path, crediting `modesPlayed` at `_started` (DW-293).
- **Goldens:** no golden starts a game (their `transitions` never press Start, so `players` stays `[]`). Only `tableHash` and the four new tuning keys move.
- **To resume:** the lead answers Q1 (and amends `epics.md` if B is chosen), sets `status: draft`, commits, and re-dispatches. The re-plan should then run the physics-free checks only; no probe was needed for this draft.
- No files other than this spec were written. No commit and no push.
