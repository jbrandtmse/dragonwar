---
title: 'Story 3.2: Locking balls and the Lock arbiter'
type: 'feature'
created: '2026-09-29'
status: 'done'
baseline_revision: 'ccddb7a29954b1bad79c2b753351a3644c515cf8'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: [multiple-goals, oversized]
deferred:
  - summary: 'A Lock-lane shot that arrives while bd_lock is full is not parked (device_overflow); the ball climbs the slot band, rolls back and re-closes s_lock_lane ~518 ticks later, so the devices layer emits a SECOND lock_lane_entered for one shot while the device is still full. Under this story it can double-credit a lock; under the War (3.8) it would double-count a Strike'
    evidence: 'Measured at planning (real machine run, three parked + a fourth ball at 800 mm/s): s_lock_lane t1914 -> immediate lock_lane_entered (devices/index.ts:364-368), device_overflow t2048, ball max y 584.5, s_lock_lane re-closes t2432 -> second lock_lane_entered, s_drain t3864. Only reachable with 2+ balls on the table (a pending spit plus a second ball); this story reaches it only after a ball-search Lock release'
    location: 'src/sim/rules/devices/index.ts:357-372 (Stage 2 full-device branch)'
    severity: 'med'
  - summary: 'A Slam followed by Start inside mouthOpenLeadMs of a Lock spit leaves the spat ball loose in the new game: the pending Mouth eject survives the Slam (by design here) and fires after the new game''s t+1 stray clear'
    evidence: 'Design decision in this spec (pending Mouth ejects are never cancelled once their show is emitted); the stray clear runs at startBall''s t+1 (serve-recovery.ts reportRecovery), before a pulse due up to mouthOpenLeadTicks later. Requires Slam and Start within ~1 s of a Lock entry'
    location: 'src/sim/rules/ball-controller/lock-arbiter.ts (new)'
    severity: 'low'
  - summary: >-
      A Mouth pulse that ejects nothing (eject_failed) still clears the pending sequence, so if the rules-side bd_lock view ever disagrees with physics, ballsInPlay can stay 0 with no drain gate and no ball search, stalling the game.
    evidence: |-
      Review pass 2026-09-29 (BH8/EC2). pulseDueMouth() shifts the due tick unconditionally; eject_failed is a no-op in S10; ball search needs ballsInPlay > 0. No reachable divergence is known: every request comes from a physically parked ball or a search stage guarded by held > pending. What would settle it: a physics run where c_mouth pulses with a ball parked and physics reports eject_failed, or rules and physics bd_lock slots disagree at a pulse.
    location: >-
      src/sim/rules/ball-controller/lock-arbiter.ts pulseDueMouth()
    severity: medium (unverified)
  - summary: >-
      No test observes the Lock arbiter's show_dragon_mouth_open reaching FrameOutput.commands through createLoop; the pre-existing forwarding at sim/loop/index.ts:456 could be dropped with every test green.
    evidence: |-
      Review pass 2026-09-29 (VG5/IA6). Every show assertion goes through runRulesScript or the hand-composed createMachine()+createRules() spit run; the createLoop Lock run locks and never opens the Mouth. No loop input reaches a Mouth show deterministically today (credits cannot be preset through gameStart). Story 3.3, the first presentation consumer, should pin it on FrameOutput.commands.
    location: >-
      src/sim/loop/index.ts:456
    severity: low
---

<intent-contract>

## Intent

**Problem:** Nothing decides what a Lock-lane entry means.
- A captured ball takes `ballsInPlay` to 0, and the drain gate treats that as a drain. Measured: a Lock capture fires `ball_ended` and serves ball 2, or `ball_saved` inside a live save (DW-221).
- A slow shot parks with no `lock_lane_entered` and stays held forever (DW-171).
- A `bd_lock` `device_overflow` is ignored (DW-174), and ball search skips the Lock.
- `c_mouth` has no pulser, `TABLE.shows` is empty, and no `mouthOpenLeadMs` exists.
- `l_lock` lights from machine occupancy even with no mode on the stack (DW-212).
- Under Tilt, ball search serves a replacement ball, and the recover answers `ball_missing` with no `ball_ended` (DW-281).
- A closure after the search's trough stage leaves a second ball in the lane (DW-282).

**Approach:** Add `src/sim/rules/ball-controller/lock-arbiter.ts`, the only consumer of `lock_lane_entered` (AD-18). It does four things:
- credits player-scoped Lock credits;
- emits exactly one `lock_lane_locked` or `lock_lane_spit` per entry;
- serves a new ball after a lock;
- owns the one Mouth: `ShowCommand show_dragon_mouth_open`, then `c_mouth` exactly `mouthOpenLeadTicks` later, with successive ejects spaced `mouthEjectIntervalTicks` apart.

Ball search's Lock stages, the `bd_lock` overflow answer and the DW-171 park all go through that one Mouth. A Lock capture is not a drain, and a Mouth eject returns a ball to play. Ball search's trough stages stop serving (the recover's own answer is the one serve), and under Tilt the recover ends the ball.

## Boundaries & Constraints

**Always:**
- **The arbiter acts only in `phase === 'game'`.** In Attract and `game_over` it emits nothing, schedules nothing and credits nothing, and a captured ball stays parked, exactly as today. The one exception is the overflow answer below, which runs in any phase.
- **Classify each tick's device-event batch** (L = `TABLE.lockLaneWiring.device`, never a literal):
  - *Captured entry:* the batch holds `lock_lane_entered` AND a `device_ball_entered` for L. The devices layer emits both in one batch.
  - *Full-device entry:* `lock_lane_entered` with no L entry. The device was full, and the ball stays in play.
  - *Uncredited park (DW-171):* an L `device_ball_entered` with no `lock_lane_entered`.
- **Deciding an entry** (captured or full-device). Let `p = currentPlayer`, `credits = players[p].lockCredits`, and `canCredit = !tilt.tilted && machine.multiball === null && credits < 2`. When `canCredit`, credits rise by one.
  - A captured entry with `canCredit`, where L holds at most 2 balls after this tick's slot fold, emits `lock_lane_locked { player, credits }` (credits after the increment) and serves a new ball.
  - Every other entry emits `lock_lane_spit { player, credits, credited }`, where `credited` = `canCredit` and `credits` is the value after the entry. A captured spit requests one Mouth eject. A full-device spit requests none, because its ball was never parked.
  - Exactly one of the two events fires per entry. `lock_lane_mode_start` (3.4) and `lock_lane_strike` (3.8) are not built here.
  - `multiball !== null` is unreachable in this story. It takes the uncredited spit until 3.7/3.8 refine it.
- **An uncredited park** requests one Mouth eject. It emits no outcome event and changes no credit.
- **The serve after a lock** reuses the save re-serve path:
  - If `bd_shooter` is empty: pulse `bd_trough.ejectCoil` and set `awaitingSaveLaunch`. S7 then autolaunches on the ball's arrival and sets `awaitingSaveRelaunch`, so the launch never arms ball save.
  - If a ball already rests in `bd_shooter`: pulse `SHOOTER_LAUNCH_COIL` this tick and set `awaitingSaveRelaunch = { startTick: tick }`.
- **The Mouth** is one closure record in `ControllerState`: `mouth: { openTick, dueTicks: number[] } | null`.
  - A request with nothing pending pushes `ShowCommand { show: TABLE.lockLaneWiring.mouthOpenShow }` this tick and schedules `tick + mouthOpenLeadTicks`.
  - A request while pulses are pending emits no show and schedules `last due + mouthEjectIntervalTicks`.
  - Each due tick pushes `pulse` on `bd_lock.ejectCoil`, and the record clears after its last pulse.
  - It is never cancelled by a ball end, a Slam or a phase change. It is discarded only if `tick < openTick` (the tick-backwards reset, as `tilt.ts` does).
- **Overflow (DW-174).** A `device_overflow` for L, in any phase, requests one Mouth eject only when none is pending. A pending eject already releases the highest slot, the staging ball; a second one would release a legitimately held ball. The S10 answer for other devices is unchanged.
- **Accounting.**
  - `ballEndGateOpen` ignores `device_ball_entered` for L. It also stays closed while a Mouth eject is pending: a ball waiting to be spat is still the player's ball.
  - In `applyDeviceEvents`, a `device_ball_left` from a parking device with no `servesInto` (the Mouth) raises `ballsInPlay` by 1.
  - The capture tick still lowers it by 1 (AD-6), and the serve's `ball_launched` restores it.
- **Ball search.**
  - Each of `bd_lock`'s two pulse stages requests one Mouth eject through the arbiter. It issues nothing when L holds no more balls than are already pending, when tilted, or when any `modes[i]` publishes `timerTicks`. It never pushes a bare `c_mouth`.
  - The quiet count does not advance on a tick where a Mouth eject is pending, like a held flipper, so every Lock eject lands before the autolaunch, trough and recover stages.
  - The trough stages issue nothing (DW-282). The recover's own answer in `reportRecovery` is the pass's only serve.
  - Under Tilt, that answer emits `ball_missing` and then runs `endBall()` instead of serving (DW-281). The result is `ball_ended { tilted: true }`, then the rotation or game over.
- **Lamps (DW-212, author decision 2026-09-28).**
  - `l_lock` is `off/0` whenever `modes` is empty.
  - Otherwise it is `dragon/1` while `players[currentPlayer].lockCredits < 2`, and `off/0` at 2.
  - It stays a machine lamp that no mode overrides. Occupancy no longer matters.
- **Only-consumer enforcement.**
  - `LockLaneEnteredEvent` moves to `src/sim/rules/devices/lock-lane-event.ts`, with no re-export.
  - A dependency-cruiser rule lets only `devices/index.ts`, `devices/events.ts` and `ball-controller/lock-arbiter.ts` import it.
  - A source scan pins the files and counts of the quoted `lock_lane_entered` literal under `src/**`.
  - `rules/index.ts` hands the mode stack the device events without `lock_lane_entered`, via a filter exported by the arbiter.
- **Tunables.** Add `mouthOpenLeadMs` (1000) and `mouthEjectIntervalMs` (500), both `unverified`, in `tuning.ts` next to `lockCaptureWindowMs`. Read them with `shotWindowTicks`. Tests derive every tick from `resolveTuning()`, never a literal.
- **TABLE.** Add `shows: { show_dragon_mouth_open: {} as Record<string, never> }` and `lockLaneWiring.mouthOpenShow: 'show_dragon_mouth_open'`. Story 3.3 adds the close and hit shows.
- **Commands.** `RulesStepResult.commands` widens to `readonly ShowCommand[]` (the bound type in `names.ts:70`), fed from a new `TickOutput.showCommands`. `sim/loop/index.ts:456` already forwards it.
- **Events.** `lock_lane_locked` and `lock_lane_spit` join `SemanticEvent`, payload-complete (AD-9).
- **Goldens.** Only the headers are re-recorded: `tableHash` and the four new `gameStart.tuning` keys (3.0a precedent, `59d105b`).
- **Tests.** Every AC has a pinning test and a `mutation:` line in `## Verification` (Rule 19). Every negative is paired with its positive. Write non-ASCII characters in source as escapes (Rule 14).

**Never:**
- Never let a golden's `expectedHash`, `expectedGameStateHash`, `transitions` or `checkpointTicks` move: that is an intent gap, so HALT. No golden reaches the Lock (measured).
- Never add a `GameState`, `machine` or `PlayerState` field. `lockCredits` already exists.
- Never write a device-name or show literal under `src/` outside `sim/table/dragonwar.ts` (boundary check (e)).
- Never let a mode emit a coil, or let any module other than the arbiter pulse `c_mouth`.
- Never build `lock_lane_mode_start`, the mode-select window, `modesLit`, `lock_lane_strike`, the War, Quick multiball, `show_dragon_mouth_close`, `show_dragon_hit` or any presentation rig (Stories 3.3, 3.4, 3.7 and 3.8).
- Never touch `src/sim/physics/**`: DW-171 needs no physics change. Never touch `src/presentation/mechanisms/**`, `src/presentation/scene/**`, `assets/src/**`, `public/assets/**`, `tools/make-placeholder-blend.py` or `ATTRIBUTIONS.md` (contended with Epic 5).
- Never edit the architecture spine or `epics.md`. The text they need goes to the lead (Design Notes).

## I/O & Edge-Case Matrix

L = `mouthOpenLeadTicks`, I = `mouthEjectIntervalTicks`, both read from `resolveTuning()`. The scripts close and open slot switches by hand. There is no physics.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Lock and serve (DW-221) | game; p0 credits 0; L empty; 1 ball in play; ball save live. `s_lock_lane` closes, then `s_lock_1` closes inside the capture window, at t | At t: `lock_lane_locked { player 0, credits 1 }`, `c_trough_eject`, `ballsInPlay` 0, no `ball_ended`, no `ball_saved`. On the shooter arrival: `c_autolaunch`. On `ball_launched`: `ballsInPlay` 1 and no `ball_save_timer_started` | No error expected |
| Second lock | p0 credits 1, L holds 1 | `lock_lane_locked { credits 2 }`; serve; `l_lock` goes `dragon/1` → `off/0` | No error expected |
| UJ-3 spit | p0 locked 2 (slots 1-2) and drained; p1 up, credits 0; p1 captures into `s_lock_3` at t | `lock_lane_spit { player 1, credits 1, credited: true }`; show at t; `c_mouth` at exactly t+L (not t+L-1); no trough serve; p0 credits stay 2. `s_lock_3` opens → `ballsInPlay` 1 | No error expected |
| Two credits | p0 credits 2, L holds 2; capture | `lock_lane_spit { credits 2, credited: false }`; show; `c_mouth` at t+L; no serve | No error expected |
| Uncredited park (DW-171) | `s_lock_1` closes with no `lock_lane_entered` | No `lock_lane_*` event; credits unchanged; show at t; `c_mouth` at t+L; no `ball_ended` | No error expected |
| Tilted entry | tilted; capture | `lock_lane_spit { credited: false }`; eject at t+L; the spat ball's drain gives `ball_ended { tilted: true }` | No error expected |
| Attract | phase `attract`; capture | Nothing: no event, show, coil or credit. The slot stays closed | No error expected |
| Two ejects, one sequence | Two uncredited parks: `s_lock_1` closes at t and `s_lock_2` at t+5, with no lane closure | One show, at t; `c_mouth` at t+L and at t+L+I; no second show | No error expected |
| Overflow (DW-174) | L holds 3, nothing pending; `device_overflow { bd_lock }` in `machineReport` | Show; exactly one `c_mouth` at t+L | No error expected |
| Overflow with a spit pending | Overflow arrives while one eject is pending | No second show and no second `c_mouth` | No error expected |
| Drain while a spit is pending | Spit pending, and another ball drains to `ballsInPlay` 0 | No `ball_ended` until the spat ball's own drain | No error expected |
| Search reaches the Lock | Stuck ball; L holds 2; untilted | S+1500: show, then `c_mouth` exactly L later. The second Lock stage comes due only after that pulse (the quiet count is held while an eject is pending); it gives its own show, then `c_mouth` exactly L later. No `c_autolaunch` and no recover before the second pulse | No error expected |
| Search, empty Lock | L empty | The Lock stages issue nothing | No error expected |
| Search, `timerTicks` | L holds 2; a stub mode entry publishes `timerTicks` | No show and no `c_mouth` | No error expected |
| Search under Tilt (DW-281) | Stuck, tilted | No trough, autolaunch or Lock output. Recover report: `ball_missing`, then `ball_ended { tilted: true }`, then the rotation | No error expected |
| Search control | Stuck, untilted | The trough stages issue nothing. Recover report: `ball_missing` plus exactly one `c_trough_eject` | No error expected |
| Closure after the trough slot (DW-282) | Stuck, untilted, L empty; a playfield closure at S+2400 | The search issues no `c_trough_eject` at any tick. The closure resets the pass: no recover at S+2750 and no serve | No error expected |
| Lamps (DW-212) | `modes` `[]` with an occupied L / base with credits 0 / credits 2 | `off/0` / `dragon/1` / `off/0` | No error expected |

</intent-contract>

## Code Map

- `src/sim/rules/ball-controller/index.ts:166-229` -- `step()`, seams S0-S12. The arbiter seam goes after S7 (:180) and before the S8 gate (:182). S10 (:207) and S11 (:208) also hand requests to it. `ControllerContext` (:137) gains the two resolved tick values.
- `src/sim/rules/ball-controller/shared.ts` -- `ControllerState` (:216; add `mouth`), `TickOutput` (add `showCommands`), and `BallControllerStepResult` (:127; add `showCommands`). `SHOOTER_LAUNCH_COIL` is at :125. `c_mouth` is a serving coil, excluded from `HARDWARE_COILS` (:66-96), so Tilt never disables it.
- `src/sim/rules/ball-controller/accounting.ts:~100-125` -- `applyDeviceEvents`. Add the Mouth `device_ball_left` +1 (`servesIntoOf`, which it already imports). `test/rules-devices.test.ts:840` "device_ball_left never changes the count" uses `bd_trough` and stays green; narrow its title.
- `src/sim/rules/ball-controller/ball-end.ts:144-160` -- `ballEndGateOpen`: exclude L entries and add the pending-eject condition.
- `src/sim/rules/ball-controller/save-serve.ts` -- `armSaveOrAutolaunch` (S7) and `serveBallSave` (S8a): the serve precedent the lock serve reuses.
- `src/sim/rules/ball-controller/serve-recovery.ts` -- `reportRecovery` (:~60-118; its non-stray branch serves with no tilt check): return `GameState` and call `endBall` under Tilt. `answerOverflows` (:122-140) skips L: route L to the arbiter instead. `stepBallSearch` (:143) forwards the new `lockEjectRequests`.
- `src/sim/rules/ball-search.ts`:
  - `guardFor` :119-141 (`lock` :120-123, `tilt` :126-128, `laneOccupied` :138);
  - `applyStage` :249-258;
  - `observe` :263-288;
  - `step` :291-335, where a pass needs `phase === 'game' && ballsInPlay > 0` (:297-300);
  - the flipper-held pause :310-312;
  - the stage tick `ballSearchTicks + k*ballSearchStepTicks` :316.

  Stages: slings S/S+250; pops S+500..S+1000; bank reset S+1250; Lock S+1500/S+1750; autolaunch S+2000; trough S+2250/S+2500; recover S+2750. `ballSearchMs` is 15000 and `ballSearchStepMs` 250 (`tuning.ts:392-393`). The `bankResetRequests` result (:193-198) is the precedent for `lockEjectRequests`.
- `src/sim/rules/devices/events.ts:105-108` -- `LockLaneEnteredEvent`: move it to `devices/lock-lane-event.ts`; `DeviceEvent` (:220) imports it. `devices/index.ts:342-349` emits the captured entry and :364-368 the full-device entry. Both stay unchanged.
- `src/sim/rules/index.ts` -- `commands: readonly never[]` at :138, populated at :362; `modeStack.step(…, deviceResult.events, …)` at :342 (hand it the filtered events); `applyRecovery` at :293 and `applyDeviceEvents` at :302 run before the controller at :327.
- `src/sim/rules/lamps.ts:85-87` -- the `kind === 'lock'` arm (`lockOccupied`, :52-55). `isMachineLamp` is at :108-110.
- `src/sim/table/dragonwar.ts` -- `bd_lock` at :404-446, with `ballSearchOrder` (two `c_mouth` pulses, then a recover) at :419-423; `lockLaneWiring` at :597-600; `shows: {}` at :700.
- `src/sim/table/tuning.ts:330-334` -- `lockCaptureWindowMs`, the model entry. `shotWindowTicks` is at :1037.
- `src/sim/table/names.ts:41` -- `ShowName`; `:70` -- the bound `ShowCommand`.
- `src/sim/contracts/events.ts:359-380` -- the `SemanticEvent` union. `contracts/state.ts:106` -- `PlayerState.lockCredits` (exists, never written; `emptyPlayer()` sets 0).
- `tools/dependency-cruiser.config.mjs:105-199` -- `forbidden` rules. A type-only import counts as an edge (`parser: 'swc'`, `tsPreCompilationDeps: false`).
- `test/util/switch-script.ts` -- `runRulesScript` (:170-202). Its options include `initialState` and `machineReports`, and its result has no `commands`: add `commands`. The devices layer's own occupancy boots empty, so a "Lock holds N" state must script `s_lock_n` closes.
- `test/util/reachability.ts:164-183` -- witness `plunge-then-bat-l-3945`: plunge held 521 ticks, `flipper_l` at rel 3945 held 30 ticks, giving `s_lock_lane` at rel 4253 and `s_lock_1` at rel 4316. `lock-eject-drain` (:217-224) pulses `c_mouth`, and the ball drains 1355 ticks later without closing any switch.
- Tests whose pins change by design:
  - `rules-lamps.test.ts:119-133` flips to off; `:220-223` and `:225-228` are rewritten to credits;
  - `rules-ball-search.test.ts`: `:279-289` (L overflow) flips, `:369-372` (tilt trough serve) flips, and the trough-serve pins at `:122-123` and `:220` move to the recover report;
  - `ball-search-integration.test.ts`: the trough drop at S+2251 moves to S+2751;
  - `table.test.ts:260-264` (`shows` empty);
  - `contracts.test.ts:239-358` (the exhaustive `neverEvent` switch, plus an executing case per new event);
  - `tuning.test.ts:28-129` (`scalarKeys`).

  Tests that must stay green unchanged: `rules-ball-search.test.ts:100-137` (empty Lock: nothing issued), and `rules-devices` / `rules-device-slots-agreement` / `rules-devices-integration` on the capture window.
- `test/rules-devices-headless.test.ts:193` -- `ENTRY_FILES`: each new `rules-*` test file must be listed.

## Tasks & Acceptance

**Execution:**
1. `src/sim/table/tuning.ts`, `src/sim/table/dragonwar.ts` -- the two tunables, the show and `lockLaneWiring.mouthOpenShow`, per Always.
2. `src/sim/rules/devices/lock-lane-event.ts` (new, GPL header), `devices/events.ts`, `devices/index.ts` -- move the type, with no re-export. `tools/dependency-cruiser.config.mjs` -- rule `lock-lane-entered-only-arbiter`.
3. `src/sim/contracts/events.ts` -- `LockLaneLockedEvent` and `LockLaneSpitEvent` in `SemanticEvent`.
4. `src/sim/rules/ball-controller/lock-arbiter.ts` (new) -- classification, decision, credit write, serve, Mouth scheduler, the request API (`requestMouthEject`) and the mode-stack event filter. Wire it into `shared.ts` and `index.ts`.
5. `ball-controller/accounting.ts`, `ball-end.ts` -- the Mouth +1 and the gate.
6. `src/sim/rules/ball-search.ts`, `ball-controller/serve-recovery.ts` -- Lock stages as requests, the pending-eject pause, trough stages issuing nothing, the tilted recover ending the ball, and the L overflow through the arbiter.
7. `src/sim/rules/index.ts` -- widen `commands`, pass the filtered events to the stack. `src/sim/rules/lamps.ts` -- the `l_lock` arm.
8. `test/util/switch-script.ts` -- collect `commands`.
9. `test/rules-lock-arbiter.test.ts` (new, listed in `ENTRY_FILES`) -- every Matrix row, through `runRulesScript`.
10. `test/lock-arbiter-physics.test.ts` (new) -- the Integration AC on real physics.
11. `test/ad18-lock-lane-consumer.test.ts` (new) -- the source scan with a control line.
12. The listed test edits (Code Map), plus a header-only refresh of the five goldens. Any other red test is diagnosed, not edited. List every edit in the Auto Run Result.

**Acceptance Criteria:**
- AC1: Given `lock-arbiter.ts` is the only consumer of `lock_lane_entered`, when `pnpm lint:boundaries` and the scan run, then an import of `lock-lane-event.ts` from any other `src/` module fails the lint, and the quoted literal appears only in the sanctioned files. A stub mode's delivery log never holds `lock_lane_entered`. Every entry emits exactly one `lock_lane_*` event.
- AC2: Given credits below 2 and `multiball === null`, when an entry is captured, then `lock_lane_locked { player, credits }` fires and credits rise by one. The ball controller alone pulses `c_trough_eject`, then `c_autolaunch`. Across the lock and the serve `ballsInPlay` is unchanged: the capture takes it down by 1 and the new ball's `ball_launched` restores it. No `ball_ended` or `ball_saved` fires (DW-221).
- AC3: Given the Lock already holds two balls (another player's), when the current player's entry is captured, then `lock_lane_spit { credited: true }` fires, the show is issued, `c_mouth` follows exactly `mouthOpenLeadTicks` later, and the credit counts.
- AC4: Given two credits and no multiball, when an entry is captured, then there is no award, the show is issued and `c_mouth` follows the lead.
- AC5: Given credits below 2 with a mode on the stack, when `lampsOf` runs, then `l_lock` is `dragon/1`. At 2 credits it is `off/0`, and it is `off/0` whenever `modes` is empty (DW-212).
- AC6 (UJ-3): Given the UJ-3 Matrix row, when its switch script runs, then player 2's credits go 0 → 1, one ball is spat, and player 1's credits remain 2.
- AC7: Given ball search reaches `bd_lock`'s steps, when they fall due, then each eject is the show followed by `c_mouth` after the lead, never a bare pulse, and it lands before the autolaunch stage.
- AC8: Given any `modes[i]` publishes `timerTicks`, when ball search runs, then `c_mouth` is skipped.
- AC9: Given a `bd_lock` `device_overflow`, when rules process it, then it is answered with one arbiter eject after the lead, and no second eject is issued while one is pending (DW-174).
- AC10: Given a park with no `lock_lane_entered` (DW-171), when it lands, then the Mouth ejects the ball after the lead with no outcome event and no credit change.
- AC11 (DW-281, DW-282): Given a stuck ball and a running ball search, when the ball is tilted, then no stage serves or ejects, and the recover's answer emits `ball_missing` and then `ball_ended { tilted: true }`. When it is not tilted, then the trough stages issue nothing, the recover's answer is the pass's only serve, and a playfield closure after the trough slot leaves no served ball behind.
- AC12 (Integration, Rule 1): Given real physics and a real `createRules()`:
  - **Lock run.** A `createLoop({ gameStart })` game gets a Start and the `plunge-then-bat-l-3945` input. When the ball reaches the Lock, then `FrameOutput.events` holds `lock_lane_locked { player 0, credits 1 }` and no `ball_saved` or `ball_ended`; a new ball is served and autolaunched (`ballsInPlay` back to 1); and `bd_lock` holds one ball.
  - **Spit run.** `createMachine()` and `createRules()` are composed by hand, following the `driveLockLane` convention of `test/rules-devices-integration.test.ts:196-236`, with each tick's rules `coilCommands` fed to physics on the next tick. It starts from a `game` state where p0 holds 2 credits and one ball is in play, and drives an 800 mm/s Lock shot. When the ball is captured, then the rules `commands` hold `show_dragon_mouth_open` on the capture tick; `c_mouth` is issued exactly `mouthOpenLeadTicks` later; physics opens `s_lock_1`; `ballsInPlay` is 1 after the eject; and `ball_ended` fires only on the spat ball's own later drain, never at the capture.
- AC13: Given the story, when the gates run, then `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` pass. The goldens differ only in their headers.

## Spec Change Log

- 2026-09-29, lead spec gate: the Rule 20 sentences under Design Notes were written into the spine (AD-18, with `lock_lane_spit { credited }` recorded as the no-award outcome so each captured entry still yields exactly one outcome; AD-6; AD-7's `ControllerState.mouth`). Story 2.12's AC 1 wording in Epic 2's block is stale after the DW-282 fix; it is another epic's block and is reported to the orchestrator, not edited. No spec text changed.

## Review Triage Log

### 2026-09-29 — Review pass
- verdicts: 45 findings — high 0, medium 5, low 31, false 7, maybe-false 2
- findings:
  - `[low]` `[patch]` BH1: `rules-ball-search.test.ts` AC 5 overflow test still titled "device_overflow{bd_lock} ... yields nothing", although the Code Map said it flips — patched: retitled, plus a pin that the Lock overflow puts `show_dragon_mouth_open` in `commands` on the report tick (mutation line recorded).
  - `[low]` `[patch]` BH2: stale "`RulesStepResult.commands` stays `readonly never[]`" text — patched `lamps.ts` header, `rules-devices.test.ts` comment and two assertion messages, and the `replay-goldens.test.ts` comment. `src/sim/physics/machine.ts:332-333` is left as is: the spec forbids touching physics. Reported to the lead.
  - `[low]` `[patch]` BH3: stale comments at `dragonwar.ts` (lockLaneWiring: "does not exist until Story 3.2"), `ball-search.ts` (the `laneOccupied` lookup, which now only validates), and `rules-ball-search.test.ts:122` ("AD-18 phasing") — all three rewritten.
  - `[medium]` `[patch]` BH4: `l_lock`'s `players[currentPlayer]` read is unpinned: every lamp row runs with `currentPlayer` 0. Also, the `lamps.ts` header says "never `state.currentPlayer`" — patched: a new `rules-lock-arbiter.test.ts` AC 5 row with `currentPlayer` 1 and opposite credits both ways, plus the header now states the `l_lock` exception. Mutation `players[0]` → red.
  - `[low]` `[patch]` BH5: `discardStaleMouth()` (the Boundaries reset-safety rule) has no test — patched: a two-timeline test with an uninterrupted control. Mutation (delete the call) → red.
  - `[low]` `[reject]` BH6: the capacity cap and the `Math.max(1, …)` clamps are untested and beyond spec. Neither has any effect at the production values. The cap is unreachable: pending ejects map one-to-one to parked balls (≤ capacity 3). Adding tests or guards is complexity for a dev-tuning corner. Both are recorded in the Auto Run Result.
  - `[low]` `[patch]` BH7: the tilted recover's "not while a Mouth eject is pending" branch departs from the literal AC 11 and is untested. The untilted serve has no pending check — patched: a test drives the tilted branch (a park on the report tick). The branch applies the spec's own gate rule ("a ball waiting to be spat is still the player's ball"). The untilted half is unreachable: the quiet-count hold keeps the recover off any tick with a search-requested eject pending, and a same-tick capture needs a second ball.
  - `[maybe-false]` `[defer]` BH8: a Mouth pulse that ejects nothing (`eject_failed`) clears the sequence and could leave `ballsInPlay` 0 with no drain and no search, stalling the game. What would settle it: a physics run where rules' `bd_lock` view and physics disagree at a pulse. Every request comes from a physically parked ball or a guarded search stage, so none is known.
  - `[low]` `[reject]` BH9: a capture that locks while an eject is pending is the ball that eject then releases (highest slot first), so the result is a credit plus a serve plus the spat ball, i.e. two balls with `multiball` null. It is reachable only if a stuck ball frees itself without closing any switch, into the Lock inside the ~1 s lead after a search Lock stage, or with two balls in play. The fix changes the spec's "Deciding an entry" rule. reopen_if: Story 3.7/3.8/3.9 plans a capture while `requestMouthEject` is pending (the War fires the Lock).
  - `[low]` `[reject]` BH10: an `Extract<DeviceEvent, …>` or a template-literal spelling could evade the only-consumer instruments. AC 1 defines the three instruments (lint, scan, filter), each pinned. An evasion would be deliberate, and review would catch it.
  - `[false]` `[reject]` BH11: "no check of the sole `c_mouth` pulser". Every non-arbiter path that could pulse `c_mouth` (the search's Lock stages and the overflow answer) is pinned by the Matrix rows to the arbiter's schedule: pulses exactly at `t+LEAD` / `t+LEAD+INTERVAL`, none on the stage or report tick.
  - `[low]` `[reject]` BH12: `MAX_LOCK_CREDITS` is duplicated in `lamps.ts` and `lock-arbiter.ts`, and `MAX_HELD_AFTER_LOCK` is a literal. 2 is AD-18's product rule, not a tunable. Sharing it means a cross-module import for a value no story plans to change.
  - `[low]` `[reject]` BH13: `BallSearch.step()`'s `pendingMouthEjects` is optional. There is one production caller (`stepBallSearch`), which passes it. Making it required would force edits to every existing ball-search test call.
  - `[low]` `[patch]` BH14: the clamp comment suggested the 1-tick floor avoids collisions — patched: it now says the clamp only keeps the scheduler arithmetic sound, and the ~100-tick collision floor is why the interval is 500 ms.
  - `[low]` `[reject]` BH15: the AC 7 route 2 test was edited (it now uses the dev-hatch serve) despite Task 12's "diagnosed, not edited". DW-282 removes its premise by design. The edit keeps the same physics command on the same tick, so every measured figure stands. It is recorded in the Auto Run Result, and the alternatives (leaving it red or deleting the DW-244 coverage) are worse.
  - `[low]` `[patch]` BH16: the AC 12 Lock run asserts only the rules view of `bd_lock` — patched: it also asserts `snapshot.mechanisms.devices.bd_lock.slots` is `[true, false, false]`.
  - `[low]` `[reject]` BH17: `l_lock` lights under Tilt or multiball, where the arbiter will not credit. The intent fixes the lamp rule exactly (author decision 2026-09-28: off with no modes, else by credits). Changing it is out of scope by the intent itself.
  - `[medium]` `[patch]` BH18: the drain gate's pulse-tick-as-pending (`|| arbitrated.mouthPulsedThisTick`) is unpinned — patched: a row where the other ball drains on exactly the pulse tick. Mutation → red.
  - `[low]` `[reject]` EC1: a lock with another ball still in play serves an extra ball, and a same-tick drain also runs `startBall`. This needs two balls in play with `multiball` null (only after a search release), and "serves a new ball" is the spec's rule.
  - `[maybe-false]` `[defer]` EC2: a failed Mouth pulse stalls the game — same root cause as BH8, deferred with it.
  - `[false]` `[reject]` EC3: "a request past capacity is silently dropped, stranding a ball". Requests come only from parked balls (captures and parks), from search stages guarded by `held > pending`, and from overflow only when none is pending, so the pending count never exceeds the balls parked (≤ 3). A 4th request needs a 4th parked ball.
  - `[low]` `[reject]` EC4: a Lock stage falling due on a pulse tick requests a duplicate eject. Under production tuning the quiet count holds until the pulse, so the next stage falls due STEP−1 = 249 ticks later. Only `ballSearchStepMs` ≤ 1 tick (dev tuning) reaches it, and the harm is one extra show and an `eject_failed`.
  - `[false]` `[reject]` EC5: "a tilted recover report on the last pulse tick ends the ball early". The recover command at R needs the quiet count to advance at R, which needs no eject pending at R. A pulse at R+1 needs a request at or before R, so the two cannot coincide.
  - `[low]` `[reject]` EC6: Slam then Start inside the Mouth lead carries the spat ball into the new game. This is the spec's own recorded design decision, already in frontmatter `deferred` (item 2).
  - `[false]` `[reject]` EC7: "a `bd_lock` `device_ball_left` from a slot bounce inflates `ballsInPlay`". Parked balls are not simulated (Design Notes), so a Lock slot opens only through a `c_mouth` eject.
  - `[false]` `[reject]` EC8: "a capture while an eject is pending should subtract the pending eject from `held`". With 2 held and one pending, the capture lands in slot 3, and the pending pulse releases slot 3 (highest first), so spitting it is physically right. The proposed subtraction would lock a ball that is then spat (BH9's failure).
  - `[low]` `[reject]` EC9: a new sequence right after a previous one's last pulse can land closer than the interval if `mouthOpenLeadMs` < `mouthEjectIntervalMs`. Production values are 1000 > 500, so it is dev tuning only, and the fix adds state.
  - `[low]` `[patch]` EC10: AC 11: a tilted recover with an eject pending emits no `ball_ended` at the report — same root cause as BH7. The branch is now tested, and its rationale is recorded (the spat ball's own drain gives the one `ball_ended { tilted: true }`).
  - `[medium]` `[patch]` VG1: `l_lock` current-player read unpinned — same root cause as BH4, patched there.
  - `[medium]` `[patch]` VG2: gate pulse-tick unpinned — same root cause as BH18, patched there.
  - `[medium]` `[patch]` VG3: the overflow answer's `!mouthPulsedThisTick` is unpinned on its own — patched: an overflow row on the exact pulse tick. Mutation (drop only that conjunct) → red.
  - `[low]` `[patch]` VG4: the tilted-recover pending branch is untested — same root cause as BH7, patched there.
  - `[low]` `[defer]` VG5: no test sees the show reach `FrameOutput.commands` through `createLoop`. The forwarding at `sim/loop/index.ts:456` predates this story, and no loop input reaches a Mouth show deterministically: credits cannot be preset through `gameStart`. Story 3.3, the first presentation consumer, should pin it.
  - `[low]` `[patch]` VG6: `discardStaleMouth`, the cap and the `held > pending` guard are unpinned — `discardStaleMouth` patched (BH5). The cap is unreachable (EC3). The guard only binds at `ballSearchStepMs` ≤ 1 tick (EC4).
  - `[false]` `[reject]` VG7: "AC 13 has no mutation line". Its pin is the gate commands: the golden replay tests fail on any `expectedHash` move. The Verification line now says so.
  - `[low]` `[patch]` VG8: AC 11's "no stage ejects under Tilt" (the Lock-stage tilt guard) has a pin but no mutation line — closed in-pass: removing `!state.machine.tilt.tilted` turns "Search under Tilt (DW-281)" red. Line recorded.
  - `[low]` `[patch]` VG9: stale "AD-18 phasing" messages at `rules-ball-search.test.ts:122-123` — same root cause as BH3, patched there.
  - `[low]` `[reject]` IA1: mixed "pending" definition (the gate and overflow count the pulse tick, ball search and `requestMouthEject` do not) — same root cause as EC4. Safe under production timing by the quiet-count hold.
  - `[low]` `[patch]` IA2: the tilted recover defers `endBall` while an eject is pending (narrower than the literal AC 11) — same root cause as BH7, tested.
  - `[low]` `[reject]` IA3: the cap and clamps go beyond spec — same root cause as BH6.
  - `[low]` `[reject]` IA4: DW-171, DW-174 and DW-281 are exercised only at the rules surface. The Matrix fixes that surface ("the scripts close and open slot switches by hand; there is no physics"), and AC 12 fixes the physics scope, which the tests meet.
  - `[low]` `[reject]` IA5: `l_lock` is exercised through `lampsOf()` only, not the loop's `LampCommand` diff. `lampsOf` is AD-9's contract surface, and the diff in `sim/loop` is pre-existing generic code with its own tests.
  - `[low]` `[defer]` IA6: no `FrameOutput.commands` show test — same root cause as VG5, deferred there.
  - `[low]` `[reject]` IA7: route 2 now uses the dev hatch — same root cause as BH15.
  - `[false]` `[reject]` IA8: "literal anchor ticks break 'derive every tick from `resolveTuning()`'". The rule governs tuning durations (LEAD, INTERVAL, SEARCH, STEP, CAPTURE_WINDOW), all derived. Anchors like t=300 are arbitrary script times, not tunables.

## Design Notes

**Measured at this tree** (`db66ab4`; three read-only probe agents; every probe deleted and the tree left clean).
- **DW-221 is real and worse than filed.** A capture of the only ball fires `ball_ended` and serves ball 2 (`ball_saved` inside a save): the drain gate's parking entry plus `ballsInPlay === 0`. In a real `createLoop` game, the reachability witness parks at rel 4316 and produces `ball_saved`. The ball stays locked for the rest of the run.
- **The Mouth is uncounted.** `applyDeviceEvents` raises the count only on `ball_launched`. A spat ball left `ballsInPlay` at 1 and, when it drained, ended the ball while it was still live. Hence the +1 rule.
- **DW-171.** At 575 mm/s, `s_lock_lane` t415 and `s_lock_1` t696 (+281) give no entry. At 800 mm/s, t378 and t512 (+134) give both. `lockCaptureWindowMs` is 180 (`unverified`). DW-166 already judged the slow shot "not a Lock-lane entry", and AD-18 makes `lock_lane_entered` the arbiter's only input. So *credit it late* and *treat occupancy as truth* both contradict a recorded decision. The ball is held, so it must be ejected. No physics change is needed.
- **The physical Mouth.**
  - Pose (170, 460) at 300 mm/s (the shared `troughEjectSpeedMmPerS`). The highest slot goes first, one ball per pulse, and the filled slots always form a prefix. So a capture's ball is always the one ejected next.
  - A pulse on an empty Lock is only `eject_failed`.
  - The spat ball closes no switch for 1355 ticks, then drains, with no re-capture.
  - Pulse spacing: two pulses in one tick drop a ball **through the playfield** (the 4-ball invariant is broken). At 1 tick one ball stalls. At 3-10 ticks the second ball is shoved back over `s_lock_lane` (a spurious closure). At 100 ticks the separation is 27.03 mm against a 26.99 mm ball. Hence `mouthEjectIntervalMs` 500 (`unverified`, above the 100-tick floor).
- **`mouthOpenLeadMs` 1000 is `unverified`,** an authored placeholder. Story 3.3's rig must be fully open inside it. Story 3.11's playtest owns the value.
- **Overflow.** A full Lock does not park: the ball stays simulated and climbs the slot band. `device_overflow` comes 134 ticks after the lane closure, and it reaches rules as `machineReport.failures` (DW-174's "never reaches rules" is stale since 2.12). Pulsing on every overflow would release a held ball, which is DW-174's swap. Hence "only when none is pending". The roll-back's second entry is deferred in the frontmatter.
- **DW-281.** Reproduced headless and on real physics. Tilted, the trough stage serves at S+2250, and the recover gives `ball_missing{1}` with no `ball_ended` for 37,000 ticks. The game stalls until a manual plunge. `rules-ball-search.test.ts:369-372` pins it today.
- **DW-282: fix, not close.**
  - The window is (S+2250, S+2750]. On real physics, a ball freed into `sw_pop_1` at S+2541 cancelled the pass after the trough had served. A manual plunge then gave `ballsInPlay` 2 with `multiball` null.
  - No organic trigger exists today. This story creates one: Lock-stage ejects reach the flippers about 700 ticks later, inside the window.
  - In this simulation a trough pulse can never free a stuck ball, because parked balls are not simulated. Its only effect is an early serve, and the recover's answer already serves into an empty lane. So the trough stages issue nothing, like 2.12's existing lane-occupied guard, and the serve moves from S+2251 to S+2751.
  - **For the lead:** this changes 2.12's shipped pins, and 2.12's AC 1 text ("then the shooter and trough ejects") is now stale. That text is Epic 2's block, so it is not edited here.
- **Consequence for the author.** Following AC 7/8 as written, a search with balls in the Lock releases them, and the recover at S+2750 returns loose ones to the trough. Credits stay: the locks are virtual. Worth watching at the 3.11 playtest.
- **"Lock full of another player's balls"** is read physically: the capture lands in the staging slot. Credits below 2 means the player owns at most one held ball, so two held balls always include another player's, or a previous game's. A capture with 2 credits and fewer than 2 held (after a search release) still ejects, per AC 4.
- **Goldens.** None closes `s_lock_lane` or a Lock slot. The closest approach is 99.7 mm. `expectedHash` is `stateHash(game, balls)` at the final tick. Lamps and commands are not hashed. `players` is `[]`. So only `tableHash` and `gameStart.tuning` move, as a header re-record.
- **Browser smoke.** The Lock needs tick-exact input: a 15-tick flip window at rel 3942-3956. No switch-injection hook exists (`__dragonwarBoot`: `pulseCoil`, `replayRecorder`, `reset`, …). The smoke should play normally and confirm no regression. The deciding check is headless: AC 12's witness run, plus a recorded replay reproduced by `runReplay()`.

**Governing ADs:**
- AD-18: the arbiter, the Mouth lead, one pulser;
- AD-6: accounting, parking, overflow, ball search;
- AD-7: player-scoped credits, the new closure field;
- AD-8: modes emit no coils, and the stack's fan-out;
- AD-9: `ShowCommand`, payload-complete events, `lampsOf`;
- AD-19: device events only;
- AD-15: tunables and goldens;
- AD-16: the boundary lint;
- AD-4: commands consumed at N+1.

**For the lead (Rule 20), sentences for the spine:**
- AD-18: "The arbiter classifies each tick: captured entry, full-device entry, or a park with no entry. The last is ejected with no outcome. Mouth ejects are one sequence: one `show_dragon_mouth_open`, the first pulse `mouthOpenLeadMs` later, each further pulse `mouthEjectIntervalMs` after the previous (two pulses closer than about 100 ticks collide, and at 0 ticks a ball leaves the playfield). A `bd_lock` overflow requests an eject only when none is pending. Ball search's Lock stages request, never pulse, and hold the search's quiet count while an eject is pending."
- AD-6: "A Lock capture is not a drain: the drain gate ignores `bd_lock` entries and stays closed while a Mouth eject is pending. A `device_ball_left` from a parking device with no `servesInto` returns a ball to play (`ballsInPlay` +1). Ball search's trough stages issue nothing; the recover's own answer is the pass's one serve, and under Tilt it ends the ball."
- AD-7 inventory: the ball controller's `ControllerState` gains `mouth` (the pending Mouth sequence), which is bounded (at most 3) and discarded if `tick` runs backwards.

**Integration (Rules 1/2).**
- Consumed-by:
  - 3.3: the show timing; adds `show_dragon_mouth_close` after a sequence's last pulse;
  - 3.4: `lock_lane_mode_start`, the mode-select window, lock-before-mode;
  - 3.7: a Lock entry under Quick multiball (the bash hit), replacing the `multiball !== null` placeholder;
  - 3.8 and 3.9: the War fires the Lock through `requestMouthEject`, plus `lock_lane_strike`;
  - Epic 4: the show cue.
- Consumes:
  - 2.4's `lock_lane_entered` and slot events;
  - 2.5, 2.9 and 2.13's ball controller and save re-serve path;
  - 2.12's ball search;
  - 2.8 and 3.1's `lampsOf` and mode stack.
- Integration ACs: AC12 (real physics and a real `createRules()` in the loop) and AC6 (a switch script through `runRulesScript`).

**Ledger inbox (Rule 17).** None is declined.
- DW-171 → AC10.
- DW-174 → AC9.
- DW-212 → AC5.
- DW-221 → AC2 and the gate.
- DW-281 → AC11.
- DW-282 → AC11, measured, fixed with a pinned repro.

**Footprint extensions to report:** `src/sim/contracts/events.ts`, `tools/dependency-cruiser.config.mjs`, `test/*.test.ts`, `test/util/switch-script.ts`. None is contended.

## Verification

**Commands** (run with `export BLENDER=C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe`; baseline 136 files / 2255 tests):
- `pnpm test` -- expected: all green.
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions && pnpm build && pnpm check:dist && pnpm check:size` -- expected: each exits 0.
- `git diff -- test/replays` -- expected: only `tableHash` and the `gameStart.tuning` additions change. No `expectedHash`, `expectedGameStateHash`, `transitions` or `checkpointTicks` line changes.

**Mutations** (Rule 19; each planned below. The implement stage applied each one, observed red, reverted it, and confirmed `git status --short`, `git diff --stat` and the full `git diff` byte-identical to the pre-mutation tree afterwards; the harness restored each file's original bytes and asserted it):
- AC1: an `import type` of `lock-lane-event.ts` added to `modes/base.ts` → `lint:boundaries` red. A quoted `lock_lane_entered` added to `modes/base.ts` → the scan red. The mode-stack filter removed → the stub-log row red.
  - mutation: `import type { LockLaneEnteredEvent } from '../devices/lock-lane-event'` (and a type alias using it) added to `src/sim/rules/modes/base.ts` → `pnpm lint:boundaries` exit 2 (`[lock-lane-entered-only-arbiter] src/sim/rules/modes/base.ts`) and `boundary-lint.test.ts` "exits 0 and reports the number of .ts files under src/ it cruised".
  - mutation: `export const MUTATION_NAME = 'lock_lane_entered';` added to `src/sim/rules/modes/base.ts` → `ad18-lock-lane-consumer.test.ts` "every .ts file under src/** that spells it, and how often, is exactly the sanctioned set".
  - mutation: `withoutLockLaneEntered(deviceResult.events)` replaced by `deviceResult.events` in `src/sim/rules/index.ts` → `ad18-lock-lane-consumer.test.ts` "a captured entry reaches the base mode as device_ball_entered but never as lock_lane_entered, and yields exactly one lock_lane_* outcome".
  - mutation (added): the rule's `to` path pointed at a file that does not exist in `tools/dependency-cruiser.config.mjs` → `boundary-lint.test.ts` "exits 2 and reports lock-lane-entered-only-arbiter for a mode that imports lock-lane-event.ts, type-only".
- AC2: the gate's L exclusion removed → "Lock and serve" red (`ball_saved`).
  - mutation: `event.device !== TABLE.lockLaneWiring.device &&` deleted from `ballEndGateOpen()` → `rules-lock-arbiter.test.ts` "a captured entry with credits 0 locks: ... no ball_ended and no ball_saved inside a live save ...", "Second lock ...", "the serve reuses a ball already resting in bd_shooter ...", the UJ-3 row, and `lock-arbiter-physics.test.ts` "the plunge-then-bat-l-3945 shot in a real createLoop game ..." (the AC12 Lock run).
- AC3/AC4: the lead read as `L-1` → the UJ-3 and "Two credits" rows red.
  - mutation: `dueTicks: [tick + mouthOpenLeadTicks]` changed to `tick + mouthOpenLeadTicks - 1` in `lock-arbiter.ts` → `rules-lock-arbiter.test.ts` the UJ-3 row, "AC 4: two credits and a capture earn nothing ...", "AC 4 with the Lock under-full ...", the DW-171 row, "Tilted entry ...", "Two ejects, one sequence ...", both overflow rows and "Search reaches the Lock ..." (9 tests).
- AC5: the empty-modes check dropped → the DW-212 row red.
  - mutation: the `if (state.modes.length === 0) { return ALL_OFF; }` arm deleted from `projectLock()` in `lamps.ts` → `rules-lock-arbiter.test.ts` "modes [] with an occupied Lock -> off/0; ...", and `rules-lamps.test.ts` "DW-212: modes: [] with an OCCUPIED bd_lock ...", "modes: [] (the boot state) ...", "modes: [] with a non-empty players[] ..." and "bootDeviceSlots() leaves every bd_lock slot empty ...".
  - mutation (review pass): `state.players[state.currentPlayer]?.lockCredits` changed to `state.players[0]?.lockCredits` in `projectLock()` → `rules-lock-arbiter.test.ts` "l_lock reads the CURRENT player's credits: with currentPlayer 1, ...".
- AC6: credit written to player 0 → the UJ-3 row red.
  - mutation: `index === playerIndex` changed to `index === 0` in `decideEntry()`'s credit write → `rules-lock-arbiter.test.ts` "player 1 locks twice and drains; player 2 captures into s_lock_3: ...".
- AC7: the pending-eject pause removed → "Search reaches the Lock" red.
  - mutation: `!mouthPending &&` removed from the quiet-count increment in `ball-search.ts` → `rules-lock-arbiter.test.ts` "Search reaches the Lock (L holds 2): ...".
- AC8: the `timerTicks` guard dropped → its row red.
  - mutation: `&& !timerRunning` removed from the Lock stage's guard in `ball-search.ts` → `rules-lock-arbiter.test.ts` "L holds 2 and a stub mode entry publishes timerTicks: ...".
- AC9: "only when none pending" dropped → "Overflow with a spit pending" red.
  - mutation: `&& !mouthEjectPending(ctx) && !mouthPulsedThisTick` removed from the overflow answer in `lock-arbiter.ts` → `rules-lock-arbiter.test.ts` "Overflow with a spit pending: ...".
  - mutation (review pass): only `&& !mouthPulsedThisTick` removed from the overflow answer in `lock-arbiter.ts` → `rules-lock-arbiter.test.ts` "Overflow on the very tick the pending pulse fires: ...".
  - mutation (review pass): the overflow answer's `failure.device === LOCK_DEVICE` pointed at a non-device in `lock-arbiter.ts` → `rules-ball-search.test.ts` "eject_failed and broken issue no command/event ...; device_overflow{bd_lock} in the SAME report is answered by the Lock arbiter ...".
- AC10: the park branch dropped → the DW-171 row red.
  - mutation: the park loop bound `i < parks` changed to `i < 0` in `arbitrateLockLane()` → `rules-lock-arbiter.test.ts` "s_lock_1 closes with no lock_lane_entered: ..." and "Two ejects, one sequence ...".
- AC11: the trough guard dropped → the DW-282 row red. The tilted `endBall` dropped → the DW-281 row red.
  - mutation: the `if (stage.guard.kind === 'serve') { return; }` arm deleted from `applyStage()` → `rules-lock-arbiter.test.ts` "Closure after the trough slot (DW-282): ...", "Search under Tilt (DW-281): ..." and "Search control (untilted): ...".
  - mutation: `return mouthEjectPending(ctx) ? state : endBall(ctx, state, tick, out);` replaced by `return state;` in `reportRecovery()` → `rules-lock-arbiter.test.ts` "Search under Tilt (DW-281): ...".
  - mutation (review pass): the same line replaced by `return endBall(ctx, state, tick, out);` (the pending-eject deferral dropped) → `rules-lock-arbiter.test.ts` "Search under Tilt with a Mouth eject pending at the recover report: ...".
  - mutation (review pass): `!state.machine.tilt.tilted &&` removed from the Lock stage's guard in `ball-search.ts` → `rules-lock-arbiter.test.ts` "Search under Tilt (DW-281): ..." (no stage ejects under Tilt).
- AC12: the Mouth +1 dropped → the spit run red (`ballsInPlay` 0 after the eject). The gate's L exclusion removed → the Lock run red (`ball_saved` at the capture).
  - mutation: `&& false` appended to the Mouth `device_ball_left` condition in `applyDeviceEvents()` → `lock-arbiter-physics.test.ts` "two credits and an 800 mm/s Lock shot: ..." (the spit run) and `rules-devices.test.ts` "Story 3.2: a bd_lock device_ball_left ... returns a ball to play -- +1".
  - mutation: the gate's L exclusion removed (the AC2 line above) → `lock-arbiter-physics.test.ts` the Lock run.
- The drain gate's pending-eject condition (not planned; added):
  - mutation: `!mouthEjectPending &&` deleted from `ballEndGateOpen()` → `rules-lock-arbiter.test.ts` "two balls; one is captured and spat, the other drains to ballsInPlay 0 while the eject is pending: ...".
  - mutation (review pass): `ctx.cs.mouth !== null || arbitrated.mouthPulsedThisTick` changed to `ctx.cs.mouth !== null` in `ball-controller/index.ts` → `rules-lock-arbiter.test.ts` "the other ball drains on the very tick the Mouth pulses: ...".
- The Mouth sequence's reset-safety (Boundaries: discarded only if `tick < openTick`; review pass):
  - mutation: the `discardStaleMouth(ctx, tick);` call deleted from `ball-controller/index.ts` → `rules-lock-arbiter.test.ts` "control: an uninterrupted timeline pulses at park+LEAD; a timeline restarted at tick 1 ... never pulses".
- AC13: pinned by the gate commands (the golden replay tests fail on any `expectedHash` move; `git diff -- test/replays` parsed per field shows only `tableHash` and the four tuning keys).

## Auto Run Result

Status: done
Blocking condition: none

Planned at `db66ab45891f69041e1132a2ce1b45292234cec6` on `DW-1-epic3`. The run halted after planning, as the invocation asked.
- It used the committed `epic-3-context.md` without recompiling it, and Story 3.1's spec for continuity.
- Three read-only measurement subagents informed the plan:
  - Lock physics, the goldens and the reachability witnesses;
  - ball search, including DW-281 and DW-282 reproduced;
  - rules wiring, lamps, contracts, dependency-cruiser and `runRulesScript`.
- Every probe file was deleted, and `git status --short` was clean afterwards.
- Warnings: `multiple-goals` (the arbiter plus the ball-search fixes routed by the ledger) and `oversized`.
- Two deferred planning findings are in the frontmatter: the full-device roll-back double entry, for 3.7/3.8, and a Slam then Start inside the Mouth lead.
- The lead has three items (Design Notes): the Rule 20 spine sentences (AD-18, AD-6, AD-7), the stale Story 2.12 AC 1 wording after the DW-282 fix, and the footprint extensions.

**Implement stage** (from `ccddb7a` on `DW-1-epic3`; the context file, the spine, was loaded first).
- New: `src/sim/rules/ball-controller/lock-arbiter.ts` (classification, decision, credit write, the serve, the Mouth scheduler, `requestMouthEject()`, `withoutLockLaneEntered()`), `src/sim/rules/devices/lock-lane-event.ts` (the moved type, not re-exported), and the dependency-cruiser rule `lock-lane-entered-only-arbiter`.
- The arbiter runs as its own seam, SL, after S7 and before the S8 gate. A Mouth pulse fired on this tick still counts as pending for the gate, because the spat ball's `device_ball_left` (its +1) reaches rules only on the next tick.
- The `bd_lock` overflow answer lives in the SL seam, not S10: S10 is skipped by S8a's early return, and the Lock overflow must run in any phase. S10 still skips L, as the Code Map says.
- Ball search takes the pending eject count as an optional third `step()` argument and returns `lockEjectRequests`, which S11 hands to `requestMouthEject()`. The trough stages keep their slots (the recover stays at S+2750) but issue nothing.
- Two small additions beyond the spec, both inside the arbiter. First, a request beyond the Lock's capacity (3) is dropped, so the sequence is bounded by construction (AD-7). Second, `mouthOpenLeadTicks` and `mouthEjectIntervalTicks` are clamped to at least 1 tick, the precedent of the game-over durations. Production values (1000/500) are unaffected.
- The tilted recover answer does not end the ball while a Mouth eject is pending: the spat ball's own drain ends it through the gate.

**Test edits** (the Code Map's list, plus the diagnosed extras):
- `test/rules-lamps.test.ts`: the Story 3.1 divergence row now asserts DW-212, with a paired positive, and the two occupancy rows are rewritten to credits (three rows, each giving the other player the opposite credit count). The `player()` builder gains `lockCredits`.
- `test/rules-ball-search.test.ts`: the trough pins at AC 1 (slots 9 and 10), AC 3's full-search run (now paired with the shooter slot's pulse), AC 4d's hold-during-pass (O+27250 and O+27500) and AC 6's tilted row now assert "issues nothing". The empty-Lock assertions in `:100-137` are unchanged.
- `test/ball-search-integration.test.ts`, AC 2 + AC 7: the one trough drop is now the recover answer's serve, landing at S+2752 (not S+2751: the report arrives at S+2751, and the pulse lands a tick later, AD-4). The recover parks the cup ball first (3 -> 4 at S+2751, physics and rules alike), so the pins move: only the cup ball exists before the recover, none after it, the trough reads 3 at S+2501, and `ballsInPlay` is 0 at the served arrival.
- `test/ball-search-integration.test.ts`, AC 7 route 2 (not in the Code Map; diagnosed): its premise was the search's own trough serve at S+2251, which DW-282 removes by design. The lane ball is now served by `loop.pulseCoil('c_trough_eject')` on the same tick the search used to pulse, so the physics commands and every measured figure (the drop at S+2251, the drain at S+2577) are unchanged. The search pass is still in flight when the drain lands, so the cancellation clause stays non-vacuous.
- `test/table.test.ts`: `shows` holds exactly `show_dragon_mouth_open`, and `lockLaneWiring.mouthOpenShow` names it. `test/contracts.test.ts`: two `neverEvent` arms, each with an executing assertion. `test/tuning.test.ts`: the two new `scalarKeys`.
- `test/rules-devices.test.ts:840`: the title is narrowed to the trough's serve, with a new paired row for the Mouth's +1.
- `test/rules-devices-headless.test.ts`: `rules-lock-arbiter.test.ts` joins `ENTRY_FILES`.
- `test/boundary-lint.test.ts` and the new fixture root `test/fixtures/boundary/lock-lane-leak/`: the lint rule fires on a type-only import from a mode and never on the three sanctioned importers.
- `test/util/switch-script.ts`: `RunRulesScriptResult.commands`.
- New: `test/rules-lock-arbiter.test.ts` (every Matrix row, plus the full-device entry, the multiball placeholder and the resting-lane serve), `test/lock-arbiter-physics.test.ts` (AC 12: the Lock run on the `plunge-then-bat-l-3945` input in a real `createLoop` game, and the spit run on `createMachine()` + `createRules()`), and `test/ad18-lock-lane-consumer.test.ts` (the source scan with its control, and the stub-log row, via a `vi.mock` wrapper around the modes barrel's `createModeStack`).
- Five goldens: header-only. `tableHash` e22fbdcf -> 318c28b5, and `gameStart.tuning` gains `mouthOpenLeadMs`/`mouthEjectIntervalMs` and their two `...Ticks`. A parse-and-compare against `HEAD` confirms every other field, including `expectedHash`, `expectedGameStateHash`, `transitions` and `checkpointTicks`, is identical.
- Unrelated comments: `src/sim/loop/index.ts` (the `commands` channel is no longer `never[]`) and `src/sim/table/dragonwar.ts` (`shows` is no longer empty).

**Final verification.** `pnpm test`: 139 files / 2290 tests green (baseline 136 / 2255). `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` all exit 0. No non-ASCII character was added, and every changed or new file is LF. Every planned mutation, plus two added ones, went red and was reverted (see Verification). No browser smoke was run: the Design Notes leave it to the lead, and the headless AC 12 Lock run is the deciding check.

**Review and finalize** (bmad-build-auto step 04, 2026-09-29; `baseline_revision` `ccddb7a29954b1bad79c2b753351a3644c515cf8`).

*Summary.* This story adds the Lock arbiter (`src/sim/rules/ball-controller/lock-arbiter.ts`), the only consumer of `lock_lane_entered` and the only pulser of the Mouth. It sorts each tick's entries into captured, full-device and park, emits exactly one `lock_lane_locked` or `lock_lane_spit` per entry, and writes player-scoped `lockCredits`. After a lock it serves a new ball through the save re-serve path. It also owns the Mouth: one show, the pulse after `mouthOpenLeadMs`, and later pulses `mouthEjectIntervalMs` apart. Other changes:
- A Lock capture is no longer a drain (DW-221).
- A Mouth eject returns a ball to play.
- The `bd_lock` overflow is answered once (DW-174).
- A slow-shot park is spat back (DW-171).
- Ball search's Lock stages request ejects and pause the quiet count while one is pending.
- The trough stages issue nothing (DW-282), and the tilted recover ends the ball (DW-281).
- `l_lock` follows the mode stack and the current player's credits (DW-212).

*Files changed (review pass additions on top of the implement-stage list above):*
- `test/rules-lock-arbiter.test.ts`: five new rows:
  - an overflow on the pulse tick;
  - a drain on the pulse tick;
  - the tilted recover while an eject is pending;
  - `l_lock` with `currentPlayer` 1;
  - the Mouth sequence's reset-safety.
- `test/rules-ball-search.test.ts`: the AC 5 overflow test is retitled and pins the Lock overflow's show, and the stale "AD-18 phasing" messages are corrected.
- `test/lock-arbiter-physics.test.ts`: the Lock run also asserts the physics view of `bd_lock`.
- `test/rules-devices.test.ts`, `test/replay-goldens.test.ts`: stale `never[]` comments and messages are corrected.
- `src/sim/rules/lamps.ts`: header comments (the `commands` channel, and `l_lock`'s current-player exception).
- `src/sim/rules/ball-search.ts`: the lookup comment.
- `src/sim/table/dragonwar.ts`: the `lockLaneWiring` comment.
- `src/sim/rules/ball-controller/index.ts`: the clamp comment.

No production logic changed in the review pass.

*Review findings.* 45 findings in total (see the Review Triage Log for each one's reason):
- **Patched:** 18 rows in 11 root-cause entries, 3 of them `medium` (the `l_lock` current-player pin, the drain-gate pulse-tick pin and the overflow pulse-tick pin) and 8 `low`.
- **Deferred:** 4 rows in 2 entries, appended to frontmatter `deferred`: a failed Mouth pulse (medium, unverified) and the `FrameOutput.commands` show test (low).
- **Rejected:** 23 rows, 7 of them `false` and 16 `low`, each with its reason recorded.

The one I would flag to Stories 3.7-3.9 is BH9: a capture that locks while a Mouth eject is pending gets spat by that eject. It is rejected here as unreachable in normal single-ball play, with a `reopen_if` naming the War.

*Follow-up review recommendation:* `true`. This first pass patched 3 `medium` entries (0 `high`). The specific unverified risk is the mixed definition of "pending" (EC4/IA1):
- The drain gate and the overflow answer count the pulse tick as pending.
- Ball search and `requestMouthEject()` do not.
- Its safety under production timing rests on reasoning: the quiet-count hold keeps a Lock stage from falling due on a pulse tick. No test pins that.

*Verification (final, patched tree):*
- `pnpm test`: 139 files / 2295 tests green (baseline 136 / 2255).
- `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` all exit 0.
- Goldens: a per-field JSON parse against `HEAD` shows only `tableHash` and the four `gameStart.tuning` keys changed in all five files.
- No non-ASCII characters were added, and all changed files are LF.
- Every review-pass mutation (seven lines, marked "review pass" in Verification) went red and was restored byte-identical (`git status --short`, `git diff --stat` and the `git diff` hash compared).

*Residual risks and items for the lead:*
- The spine sentences (AD-18, AD-6, AD-7) were already written at the gate.
- Story 2.12's AC 1 wording is stale after DW-282 (Epic 2's block, not edited).
- `src/sim/physics/machine.ts:332-333` still says `commands` "stays readonly never[]". It is out of bounds for this story and is a comment only.
- **Footprint extensions**, none of them contended: `src/sim/contracts/events.ts`, `src/sim/loop/index.ts` (comment only), `tools/dependency-cruiser.config.mjs`, `test/*.test.ts`, `test/util/switch-script.ts` and `test/fixtures/boundary/lock-lane-leak/**`.
- No browser smoke was run (Design Notes: the deciding check is headless).
