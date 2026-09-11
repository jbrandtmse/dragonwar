---
title: 'Story 2.12: Ball search'
type: 'feature'
created: '2026-09-11'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      The search's two sling pulses are physically inert: physics has no
      commanded-pulse response for a slingshot, and none can be built from
      data physics already holds, because each sling's switch zone sits
      downhill of its kick face, away from where a ball rests against it.
    evidence: |-
      Measured at efe14f5 from public/assets/dragonwar.collision.json:
      sw_sling_l x 94-134, y 380.005-405.005; sw_sling_r x 328.4-374.4,
      same y; the sling bodies span y 420-455 (col_sling_l json:4172-4189,
      col_sling_r json:4210-4227), so a ball touching the south face has its
      centre near y 406.5, just outside the zone, and the slanted kick face
      points uphill. LineSeg.normal is protected (line-seg.ts:33) and
      slings.ts:202-208 keeps no segment; the only kick is the ported
      LineSegSlingshot.collide() on a real contact. A commanded sling kick
      needs a kick-face normal from the loader, a proximity band next to the
      face and a new mm/s tunable. Pops, by contrast, get a commanded kick in
      this story (task 7): a ball wedged against a bumper sits inside its
      skirt zone.
    location: >-
      src/sim/physics/slings.ts:89-97, 202-208 · src/sim/physics/loader/index.ts:935-942
    severity: low
  - summary: >-
      Recovered balls are never replenished. RecoverCommand despawns every
      ball outside a device (AD-6), nothing but a parking eject ever spawns a
      ball, so each recovery permanently shrinks the machine's ball count for
      the session; once the trough cannot serve, the serve answers
      eject_failed and play cannot continue.
    evidence: |-
      AD-6: "RecoverCommand, the one command that lets physics despawn every
      ball outside a device"; devices.ts:409-421 spawnBall() is reached only
      from a parking eject (:446-472). Single-ball play loses at most one ball
      per recovery, so four recoveries in one session are needed to exhaust
      the machine. This matches a real machine, where a lost ball stays lost
      until an operator finds it; the only escape in the sim is a host reset.
    location: >-
      src/sim/physics/devices.ts:409-487
    severity: low
---

<intent-contract>

## Intent

**Problem:** A ball that stops moving without draining ends nothing and starts nothing, so the game hangs for good. `RecoverCommand` exists only as a type (`src/sim/contracts/commands.ts:20-23`). No physics or loop code handles it, and `Machine.step()` returns no `recovered` count (`src/sim/physics/machine.ts:82-93`). Nothing measures switch silence, and no `ball_search_started` event exists. Rules never see physics' `eject_failed` or `device_overflow` at all: `sim/loop` folds them straight into `FrameOutput.events` (`src/sim/loop/index.ts:435`), because `rules.step(state, switchEvents, tick)` has no channel for them (`machine.ts:85-91`). The stall is reachable in ordinary play today, and this plan measured it: any manual plunge held 1–100 ticks at production pitch rolls back onto the plunger tip with `ballsInPlay` still 1 (frontmatter `deferred`, first item).

**Approach:** The ball controller gets a ball-search sub-module, `src/sim/rules/ball-search.ts`. It starts after `ballSearchMs` with no `playfield_switch_closed`, while a game ball is in play. It walks a structurally derived stage list at `ballSearchStepMs` intervals:
1. the slings (a new `TABLE.slingWiring`);
2. the pops (`TABLE.popWiring`);
3. a bank reset, *requested* from the devices layer's drop-bank component, which alone pulses it (AD-19);
4. each ball device's `ballSearchOrder` pulse steps, ordered Lock, shooter, trough;
5. exactly one `RecoverCommand`.

Physics honours `RecoverCommand` by despawning every ball outside a device. A ball resting in `bd_shooter`'s entry zone counts as inside its device. Physics returns the count. A new, optional fourth `rules.step` argument, the machine report, carries that count and physics' failure events into rules. The ball controller then emits `ball_missing { count }`, corrects `ballsInPlay` to 0, and serves a ball only when the shooter lane is empty, so it never stacks a second ball on the plunger tip.

**Author decisions, 2026-09-11 (Story 2.12 spec gate, relayed by the orchestrator) — binding on this re-plan:**
1. **AD-18 is phased, on AD-8's precedent.** Until Story 3.2 builds the Lock arbiter, ball search issues NOTHING at `bd_lock`'s `ballSearchOrder` steps, and a `bd_lock` `device_overflow` is tolerated without an eject. AC 1's Lock eject, all of AC 2 (the `c_mouth` skip for an active mode's `timerTicks`) and AC 5's Lock-overflow eject moved to Story 3.2 (`epics.md`, both blocks amended; AD-18 amended). Deciding fact: a ball parked in the Lock is out of the simulation and counted by its closed slot switch (AD-6), so it is never missing and a search Mouth pulse could never find one.
2. **DW-241 is by-design; AD-5 amended.** The manual plunger shares the autolauncher's serving coil `c_autolaunch`, outside `HARDWARE_COILS` by design (DW-74), so Tilt, game over and Attract leave it live. This story adds NONE of the three tilt additions the coupling trace listed (no tilted-recovery ball end, no end-on-shooter-arrival while tilted, no `c_autolaunch` re-enable in `startBall()`).
3. **DW-187 is IN this story's scope.** Fix the rolled-back-ball double count: a weak manual plunge rolls back onto the plunger tip still counted in play, a second launch of the same ball counts it twice, and after its drain `ballsInPlay` stays 1 with no ball and no `ball_ended` — a hard hang at today's tree. Rule 19: the pinning test IS the lead's two-weak-plunge probe (`createLoop()`, `NO_BALL_SAVE` tuning, production pitch: Start; a 20-tick plunge emits one `ball_launched`, the ball leaves the lane and rolls back to `deviceSlots.bd_shooter [true]`; a full plunge of the same ball; drain) — it must be observed RED on today's code before the fix (today: `ballsInPlay` 1 after the roll-back, 2 after the second launch, 1 after the drain, no `ball_ended`) and green after. If the fix moves any golden's trajectory, the re-record is PRE-AUTHORISED for this story on the standing condition: traced correct, and each golden must still assert its own subject, verified structurally field by field. A header-only golden refresh needs no grant.
4. **Spine writes approved and made at this gate:** AD-19 (ball search REQUESTS the bank reset; the drop-bank component stays the only caller of `c_dragon_bank_reset`), AD-4 (an optional fourth `rules.step` argument carrying physics' `recovered` count and device failure events), and the two tunables `ballSearchMs` 15000 (PRD FR-23) and `ballSearchStepMs` 250 (authored).
5. **DW-244 is NOT decided** — Start's meaning with balls not home belongs to the decision sheet or Story 2.13. The search is phase-gated to `game`; do not design Start semantics here.

## Boundaries & Constraints

**Always:**
- `sim/rules/**` never imports `sim/physics/**` (AD-1). The machine report's type lives in `sim/contracts`: physics produces it, the loop forwards it, rules consume it. `src/sim/rules/devices/` stays the only consumer of `SwitchEvent` (AD-19). The search reads `DeviceEvent`s only, and a failure event is neither a `SwitchEvent` nor a `ContactEvent` (AD-2).
- **Device, coil and switch names are never written as literals under `src/**` outside `src/sim/table/dragonwar.ts`** (AD-16, `tools/boundary-lint.mjs:97, 558-586`). Every stage is derived from `TABLE`:
  - slings from `TABLE.slingWiring` keys;
  - pops from `TABLE.popWiring` keys;
  - the bank-reset owner from `TABLE.dropBankResetCoil` through the drop-bank component;
  - device steps from `TABLE.ballDevices[*].ballSearchOrder`, ordered structurally: first parking devices with no `servesInto`, then non-parking devices, then parking devices that have one.
- **Only the ball controller pulses `c_trough_eject` and `c_autolaunch`, and only it mutates `ballsInPlay`** (AD-18). `applyRecovery()` is a `ball-controller.ts` export called from `rules/index.ts`, the precedent `applyDeviceEvents()` already sets. `c_dragon_bank_reset` is pulsed only by `src/sim/rules/devices/drop-bank.ts` (AD-19).
- **What counts as "a switch closes"** (AC 1, AC 4) is exactly a `playfield_switch_closed` device event, the derived 28-switch set (`devices/index.ts:190-213`). AD-19's 2026-09-06 amendment names that set as this story's answer to "has anything closed?". The following never start, delay or cancel a search:
  - device slot switches;
  - `s_shooter_lane`;
  - the four buttons;
  - `s_tilt_bob` and `s_slam_tilt`;
  - any switch-opening edge, including the bank reset's six `closed: false` edges.
- **"A ball is in play"** means `phase === 'game' && machine.ballsInPlay > 0`. The search timer's origin is the latest of two ticks: the one where this condition became true, and the latest `playfield_switch_closed`.
- Tick windows are inclusive (`>=`), and every test probes on the bound. The search starts on the first tick where `tick - origin >= ballSearchTicks`, after this tick's own closures have been folded. So a closure on the start tick cancels it first.
- **The search timer and schedule are closure state in `ball-search.ts`, never `GameState`** (AD-7's closure-state class; `machine` is in all five goldens' snapshots). The state is:
  - reset-safe: a mark strictly greater than `tick` is discarded, the `tilt.ts:88-97` precedent;
  - reset at `ball_will_start` inside `startBall()`;
  - bounded: at most one pass, which ends in a cancel or in exactly one `RecoverCommand`.
- **The machine report is an optional fourth argument**, `rules.step(state, switchEvents, tick, machineReport?)`, defaulting to `{ recovered: null, failures: [] }`. Every existing three-argument call site keeps compiling unchanged: `test/rules-devices.test.ts:817-854`, `test/machine-serve-drain.test.ts:486`, `test/rules-tilt-integration.test.ts:221` and `test/util/switch-script.ts:242`. Physics' failure events keep reaching `FrameOutput.events` from the loop exactly as today (`loop/index.ts:435`), and rules never re-emit them.
- `Machine.step()`'s command partition handles `type === 'recover'` **before** the enable/disable branch, whose `else` is a catch-all (`machine.ts:267-276`). `deviceMechanics.recover()` runs **before** `applyCommands()` and before the `before` map (`:325`), so a same-tick serve is never despawned. `PlayerPhysics.step()` also keeps its "never adds or removes a ball" premise (`:386-390`). `recover()` iterates a copy of `physics.balls`, which is the live array.
- Both new tunables are top-level `entry(value, source, confidence)` and are listed in `test/tuning.test.ts`'s `scalarKeys` (`:27-84`; the ratchet is at `:99-110`). Every test offset is authored as a literal at the probe (15000, 250, 2750, 3000) and never re-imported from the tunable. Each new `…Ms` key adds itself plus a derived `…Ticks` sibling to every golden header.
- Every drain-driving test runs at `NO_BALL_SAVE_TUNING` and asserts that `ball_ended` actually **arrived**.
- The golden refresh harness lives in the scratchpad, never under `test/`. It is verified per field by parsing JSON, never by grep, and its note is appended to `notes`.

**Block If:**
- Any golden's `expectedHash`, `expectedGameStateHash`, `expectedCheckpointHashes`, `checkpointTicks`, `transitions`, `coilPrologue`, `durationTicks`, `header.assetHash`, `header.physicsVersion`, `header.tickHz`, `header.physicsSeed` or `header.gameStart.{seed,adjustments,highscores}` moves. Only three fields may differ: `header.tableHash` (the `slingWiring` addition), `header.gameStart.tuning` (exactly four new blocks) and an appended `notes`. A moved body field or state hash means something ran in a golden that should not have: **HALT**. No golden starts a game, so the search, the recover and the pop pulse must never fire in one.
- Any widening of `GameState`, `MachineState`, `PlayerState` or `GamePhase` would be required.
- `src/sim/loop/**` would need to write any `GameState` field, or a third write to its `state` binding (`test/ad7-device-slots.test.ts:432-490`; `check:ad7` must stay at exactly 3 passing tests).
- `HARDWARE_COILS`' membership would change. It stays flippers, slings and pops: 7 coils. `slingWiring` is additive, and `c_autolaunch` and `c_dragon_bank_reset` stay out (DW-74).
- **Any `c_mouth` pulse from ball search or from the overflow answer is required before the AD-18 decision in `## Auto Run Result` is made.**
- `check:ad7`, `check:corridor` or `check:reachability` goes red.

**Never:**
- Never pulse `c_mouth`, add `show_dragon_mouth_open` to `TABLE.shows`, add `mouthOpenLeadMs`, or widen `RulesStepResult.commands` beyond `readonly never[]`. The Lock arbiter, its show and its lead are Story 3.2's (AD-18). The epic routes them there and forbids pre-building them.
- Never pulse `c_dragon_bank_reset` from the ball controller or `ball-search.ts`. Request it; the drop-bank component pulses it (AD-19).
- Never serve a ball into an occupied shooter lane. Neither the search's trough step nor the recovery serve fires while `machine.deviceSlots` reads the non-parking device occupied. That is DW-244's stacking shape, reproduced live at 2.11's smoke.
- Never let `RecoverCommand` despawn a ball inside a non-parking device's entry zone. Never add `s_shooter_lane`, a slot switch, a button or a cabinet sensor to `PLAYFIELD_SWITCHES`, which stays 28.
- Never disable `c_autolaunch` anywhere, and never add it to any disable batch. That is DW-241's undecided call. Never issue the search's autolaunch step while `machine.tilt.tilted`: 2.11's shipped promise is "no autolaunch into a tilted playfield" (`ball-controller.ts:653`).
- Never decide or pre-empt these author-sheet entries: DW-241, DW-244 (escalated), DW-204, DW-212, DW-221, DW-226, DW-232, DW-236, DW-237, DW-240, DW-245, DW-246, DW-251, DW-255 (escalated). A search-served ball touches the skill-shot and scoring-under-Tilt questions (DW-232, DW-246) only through the existing modes, and no test here asserts what the skill shot does with it. Never fix the roll-back double count (frontmatter `deferred`). Never build a commanded sling kick.
- Never compute an expected value from `ballSearchMs` or `ballSearchStepMs` by re-importing it. Never derive a non-vacuity guard's expected count from the helper under test (vacuity #44).
- Never assert a negative ("no pulse", "not served", "search does not start", "no loop") without establishing its positive in the **same** test with the same instrument. Never compare a value with itself (vacuity #51).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Search starts on the bound | `phase: 'game'`, `ballsInPlay` 0 → 1 by `ball_launched` at tick O, then no `playfield_switch_closed` | nothing at O+14999. At O+15000: `ball_search_started { tick: O+15000 }` once, plus stage slot 0 (`pulse c_sling_l`) in the same tick's `coilCommands` | No error expected |
| Stage schedule | the same run, no closure | slot k is issued at O+15000+250·k, for k = 0..10: `c_sling_l`, `c_sling_r`, `c_pop_1`, `c_pop_2`, `c_pop_3`, bank-reset request (k=5), Lock slots k=6,7 **[AD-18: issue nothing, pending]**, `c_autolaunch` (k=8), `c_trough_eject` (k=9, 10; each only if the shooter lane is empty). Exactly one `RecoverCommand` at O+17750 | No error expected |
| Bank reset through its owner | slot k=5 at tick S | the ball controller's own `coilCommands` never name `c_dragon_bank_reset`. The merged `RulesStepResult.coilCommands` carries it at S+1, from the devices layer. The real-loop `contactEvents` carry `bank_reset` at S+2 | No error expected |
| Closure cancels | a search running; `playfield_switch_closed` at tick C | no further slot command and no `RecoverCommand` from that pass. The next `ball_search_started` is at exactly C+15000 | No error expected |
| Non-playfield closures | during the quiet window: `s_shooter_lane` close, a trough slot close, `button_pressed` (flipper), `tilt_bob_closed` | none delay or cancel; `ball_search_started` still lands at O+15000 | No error expected |
| Not in play | `ballsInPlay` 0 (a served ball resting in `bd_shooter`, awaiting its plunge), or `phase` `'attract'` / `'game_over'` | no `ball_search_started`, ever | No error expected |
| Tilted | `machine.tilt.tilted` true, ball in play, quiet | the search runs. Sling and pop pulses are issued, and physics swallows them (disabled; no event). The autolaunch slot issues nothing. The trough and bank slots are unchanged | No error expected |
| Recover, loose ball | recover consumed by physics at tick R+1; one ball loose, none in the shooter lane | physics despawns it (`recovered: 1`). At R+1: `ball_missing { count: 1 }`, `ballsInPlay` 0. If the shooter lane is empty, one `pulse c_trough_eject`; if occupied, none | No error expected |
| Recover keeps the shooter ball | the only ball rests in `bd_shooter` (`deviceSlots.bd_shooter` `[true]`), `ballsInPlay` ≥ 1 | `recovered: 0`: the ball is inside its device. `ball_missing { count: 0 }`, `ballsInPlay` 0, no serve, and the search goes idle, so no second pass follows | No error expected |
| Recover outside a game | a recover issued at R, then `phase` → `'attract'` at R (a Slam) | at R+1: `ball_missing` emitted and `ballsInPlay` corrected, but no serve | No error expected |
| `device_overflow` on `bd_trough` | machine report `failures: [{ device_overflow, device: bd_trough }]` | a `pulse c_trough_eject` on the same tick, and nothing else changes | Must not throw |
| `device_overflow` on `bd_lock` | the same, for `bd_lock` | **[AD-18: pending]**. Under recommendation (A): tolerated, no command | Must not throw |
| `eject_failed` / `broken` | report failures for each ball device, and `broken { device: c_pop_1 }` | no command, no event, the same `GameState` reference | Must not throw |
| `ball_missing` downstream | the controller's own `ball_missing` reaches `modeStack.step()` and the real Backglass fold | no throw; the mode stack's state is unchanged by it | Must not throw |
| Restarted timeline | an origin mark at tick 9000, then `tick` restarts at 1 | the mark is discarded, so no search fires early from a stale mark | No error expected |
| Commanded pop kick | a ball resting inside `s_pop_1`'s skirt zone, an enabled `pulse c_pop_1` | the ball gains velocity radially away from `col_pop_1`'s centroid, with one `coil_fire` contact. Disabled: no kick | No error expected |
| Goldens | the change is complete | all five: only `header.tableHash`, four `gameStart.tuning` blocks and appended `notes` differ | `StaleReplayHeaderError` if missed |

</intent-contract>

## I/O & Edge-Case Matrix — re-plan supplement (2026-09-11)

The intent contract above is preserved verbatim, as the planning skill requires. Its **Author decisions, 2026-09-11** paragraph is binding on every older clause inside it. This table records what the decisions mean for observable behaviour and adds DW-187's rows. Where a contract row and this table differ, this table carries the decided behaviour. Design Notes, *Reading the contract under the decisions*, maps each superseded clause.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DW-187: the served ball | real `createLoop`, `NO_BALL_SAVE_TUNING` as both `GameStart.tuning` and the loop's `tuning`, production pitch; Start | the serve's trough slot opens and `deviceSlots.bd_shooter` reads `[true]` on the same tick (tick 3, measured); `ballsInPlay` 0 | No error expected |
| DW-187: a weak plunge rolls back | the served ball, plunger held 20 ticks | exactly one `ball_launched`; `ballsInPlay` 1 while the ball climbs; the ball rolls back and `bd_shooter` reads `[true]` again; from that tick `ballsInPlay` is **0** (today: 1) | No error expected |
| DW-187: the same ball re-plunged | the rolled-back ball, plunger held 1200 ticks | exactly one further `ball_launched`; `ballsInPlay` **1** (today: 2) | No error expected |
| DW-187: its drain ends the ball | `c_pop_1..3`, `c_sling_l`, `c_sling_r` disabled before the re-plunge; the ball drains | on the tick a trough slot closes: `ball_ended { player: 0, tilted: false }` arrives and `ballsInPlay` reads 0; ball 2 starts (today: `ballsInPlay` stays 1, no `ball_ended`, no ball on the table) | No error expected |
| Served arrival while a ball is counted | one batch: `device_ball_left { bd_trough }` (whose `servesInto` is `bd_shooter`'s entry switch) and `device_ball_entered { bd_shooter }`; `ballsInPlay` 1 | `ballsInPlay` stays 1 and `applyDeviceEvents` returns the same `MachineState` reference, in either event order | No error expected |
| Unserved arrival (a ball returning to the lane) | `device_ball_entered { bd_shooter }` with no serving device's `device_ball_left` in the batch | `ballsInPlay` 1 → 0; at 0 it stays 0 (floored, same reference) | No error expected |
| The Lock's search slots (decision 1) | the contract's "Stage schedule" run | nothing is issued at O+16500 or O+16750, and no command in the run names `c_mouth`; the same run issues `pulse c_autolaunch` at O+17000 and `pulse c_trough_eject` at O+17250 | No error expected |
| `device_overflow` on `bd_lock` (decision 1) | one machine report carrying `device_overflow { bd_lock }` and `device_overflow { bd_trough }` | exactly one command that tick, `pulse c_trough_eject`; nothing for `bd_lock` | Must not throw |
| A stuck ball in the real loop | production pitch, `NO_BALL_SAVE_TUNING`; Start; the served ball plunged with a 1200-tick hold and released into a held left flipper. The ball cradles near (220.5, 91.9): measured settled by tick 6035, spread under 1 mm, nearest switch zone `s_drain` 76.9 mm away | with S the tick of `ball_search_started`: one `bank_reset` contact at S+1252; `eject_failed { bd_shooter }` at S+2001 (the autolaunch fires into an empty lane); at S+2251 a trough slot opens and `bd_shooter` reads `[true]` on the same tick, and `ballsInPlay` stays 1; nothing at S+2501; at S+2751 `ball_missing { count: 1 }`, `snapshot.balls` 2 → 1 with the lane ball kept, `ballsInPlay` 0, no recovery serve | No error expected |

## Code Map

**Rules: ball accounting, the search's home, and its consumers**
- `src/sim/rules/ball-controller.ts`: the owner of ball accounting and serving.
  - `applyDeviceEvents` `:44-73` is **where DW-187 is fixed**. It increments on every `ball_launched` `:47-48` and decrements only on a parking entry `:58-66`. Its `bd_shooter` branch is a no-op, justified by the comment `:50-55` ("a ball merely resting in the shooter lane is still IN PLAY"), which the fix makes false. The file header `:16-31` repeats the claim. Callers: `rules/index.ts:245` and `test/rules-devices.test.ts:782-812`, which pins the same-reference return and the parking floor. Both stay green.
  - `ballServingCoils`/`hardwareCoils`/`HARDWARE_COILS` `:148-178`: must not change.
  - `shooterLaunchCoil()` `:198-207` is the structural-derivation pattern to copy.
  - `createBallController` `:261`; closure state `:297`, `:367`, `:388`.
  - `startBall()` `:436-505`: resets at `:444-453`; the serve pulse at `:490` is the recovery serve's model.
  - `step()` `:507`. The `ball_launched` arming loop is `:621-666`, and its save-arrival tilt guard at `:653` is the precedent for the search's autolaunch guard. The drain branch is `:673-772`, and the game-over disable is `:738-742`.
- `src/sim/rules/index.ts`: the composition root.
  - `RulesStepResult` `:107-147` (`commands: readonly never[]` `:124`, `coilCommands` `:132`); `Rules.step` `:149-156`.
  - `createRules` `:222-306`, with `pendingLifecycleEvents` `:231`, the next-tick forwarding precedent for bank-reset requests.
  - Stage order: `devicesLayer.step` `:237`, `applyDeviceEvents`/`deriveDeviceSlots` `:245-250`, tilt `:259`, bonus credit `:268`, ball controller `:270-271`, modes `:279`. Then `events` `:294` and `coilCommands` `:300`.
- `src/sim/rules/devices/index.ts`:
  - `buildPlayfieldSwitches` `:190-213` (28) and `PLAYFIELD_SWITCHES` `:223`.
  - `step(switchEvents, lifecycleEvents, tick)` `:287`.
  - The shooter lane: close → `device_ball_entered` `:315-317`; open → `device_ball_left` + `ball_launched` `:318-322`. Parking slots `:329-345`.
  - `playfield_switch_closed` `:390-392`.
  - The drop bank `:421-423` and the lifecycle loop `:428-430`, which is where the reset request joins.
- `src/sim/rules/devices/drop-bank.ts`: `DropBankTracker` `:31-36`, `pulseResetCoil` `:55-57`, `onBallWillStart` `:92-94`. It is the sole owner of the reset pulse, and the ball-search request entry point goes beside `onBallWillStart` (AD-19, amended).
- `src/sim/rules/tilt.ts`: the stateful-controller precedent. It is a factory closure, with reset-safety at `:88-97` and ms→ticks resolved once at `:81-82`.

**Physics**
- `src/sim/physics/machine.ts`:
  - `MachineStepResult` `:82-93`, whose comment `:85-91` must be rewritten; `semanticEvents` is `DeviceFailure[]`.
  - `Machine.step` `:96`.
  - `PRE_STEP_HARDWARE_RULES` `:135-146` gains two rows. `test/hardware-rule-seam.test.ts:138-213` requires `receiver.method(` to appear before `physics.step();` and never after.
  - `coilEnabled` `:247-264`.
  - The partition `:267-276`, whose `else` is a catch-all.
  - The plunger gate `:306`, `enabledPulses` `:318-319`, the drop reset `:323`, the `before` map `:325`, `physics.step()` `:338`, and the return `:415-463`.
- `src/sim/physics/devices.ts`:
  - `DeviceFailure = EjectFailedLike | DeviceOverflowLike` `:67-79`, so physics never emits `broken`.
  - `justEjected` `:258` and `overflowReported` `:272`: prune removed balls from both.
  - `spawnBall` `:409-421`.
  - `applyCommands` `:423-487`: an empty parking device answers `eject_failed` at `:437-440`; the parking eject opens its slot switch at `:448`.
  - `launch()` `:490-510` answers `eject_failed` into an empty lane at `:497-499`. `isBallInsideZoneNow()` `:512-519` is the "inside the shooter" test `recover()` must reuse.
  - `detectEntries`: overflow `:607-618`; the only existing removal `:624`.
- `src/sim/physics/switches.ts:169-175`: a MAKE latches on the tick it is first observed (DW-67). Only the break is debounced (`:177-188`). Together with the eject pose lying inside `servesInto`'s zone (`TABLE.ballDevices.bd_trough.servesInto` `dragonwar.ts:364`, gated by `test/device-eject-pose.test.ts`), this is why a serve's slot opening and its lane closing arrive in **one** rules batch. That is the DW-187 fix's premise.
- `src/sim/physics/pops.ts`: the MAKE-edge trigger `:130-156` and the radial impulse `:158-206`, to factor out for `applyPulses`. `createPopMechanics` holds each pop's `{coil, switchName, zones, centroidMm}` (`:112-119`) but no ball list, so pass `physics.balls`.
- `src/sim/physics/game/player-physics.ts:187-212`: `removeBall` throws on an unregistered ball, but is safe for several distinct balls before `physics.step()`.

**Loop and contracts**
- `src/sim/loop/index.ts`:
  - `pendingCommands` `:282`, holding `{coil, action}` only.
  - The two `state` writes at `:284` and `:433`.
  - The per-tick body `:410-462`: `commandsForThisTick` `:417-423`, `machine.step` `:425`, `rules.step` `:428`, failures into `events` `:435`, and the coil queue `:459-461`.
  - `setCoilEnabled`/`pulseCoil` `:468-474`.
- `src/sim/loop/replay.ts`: `runReplay` `:336-417`, whose `onTick` `:302` is the golden probe's hook; `tableHash` `:145-147`; `PHYSICS_VERSION` `:188-214`; `StaleReplayHeaderError` `:240`.
- `src/sim/contracts/commands.ts`: `CoilCommand` `:12-17` and `RecoverCommand` `:20-23`. There is no union yet, although the header `:3` says "closed command union".
- `src/sim/contracts/events.ts`: `BallMissingEvent` `:177-181`; the failure types `:248-266`; `SemanticEvent` `:273-290`.
- `src/sim/table/names.ts:57-58` binds contracts to the `TABLE` unions.

**Table and tuning**
- `src/sim/table/dragonwar.ts`:
  - `bd_trough` `:330-378`: `ballSearchOrder` `:352-356`, `servesInto` `:364`.
  - `bd_shooter` `:383-396`: `entry` `:385`, `ballSearchOrder` `:389-392`.
  - `bd_lock` `:404-423`.
  - `TABLE.lockLaneWiring.device` names the Lock arbiter's device (read at `devices/index.ts:273`). It is the structural handle for the Lock skip.
  - `popWiring` `:498-501` is the shape `slingWiring` mirrors; `dropBankResetCoil` `:521`.
- `src/sim/table/tuning.ts`: `entry()` `:49`; `defaultPitchDeg`/`pitchMinDeg` `:269-270`; the ball-save block `:344-358` and tilt block `:367-377` set the style and placement for the two new entries; `resolveTuning` `:809-866`; `shotWindowTicks` `:898`.

**Test infrastructure**
- `test/util/switch-script.ts`: `RunRulesScriptOptions` `:170-179` and `runRulesScript` `:228-251`. It gains `machineReports`; the result gains `recoverCommands`.
- `test/backglass-integration.test.ts:35, 53-57, 81-83` holds the `NO_BALL_SAVE_TUNING` literal, the five hazard coils and the `setCoilEnabled` pattern. `test/plunger.test.ts:58-66, 87-91` holds the plunge-by-`InputTransition` pattern.
- `test/rules-lifecycle.test.ts:401-410` drives a shooter arrival at `ballsInPlay` 0. It stays green unchanged: the fix floors at 0.
- `test/rules-tilt.test.ts:390, 807, 845, 872, 913` and `test/rules-ball-save.test.ts:194, 658` close `s_shooter_lane` only after a drain has taken `ballsInPlay` to 0. They stay green unchanged.
- `test/rules-devices-headless.test.ts:193-208`: `ENTRY_FILES`, where the new headless file goes; the completeness ratchet is `:222-243`.
- `test/contracts.test.ts:240-339`: `describeEvent`. Its `never` tail is a typecheck gate, and each arm needs an executing assertion.
- `test/tuning.test.ts:27-110`: `scalarKeys` and its ratchet.
- `test/machine-serve-drain.test.ts:293-325`: ball injection onto `machine.balls` for a machine-level test.
- `test/replay-goldens.test.ts:123` and `test/golden-line-endings.test.ts:23-29` are two independent five-name lists.

## Tasks & Acceptance

**Execution:**
1. `test/rules-rollback-accounting.test.ts` (new, GPL-3.0 header): the DW-187 pinning test (AC 12). It is a real `createLoop` driven by real input, using only APIs that exist today.
   - Write it and run it **before task 2**. It must fail on today's code at the roll-back assertion.
   - Record the observed today values (`ballsInPlay` 1 after the roll-back, 2 after the re-plunge, 1 after the drain, no `ball_ended`) in `## Verification`'s Rule 19 log. Then task 2.
2. `src/sim/rules/ball-controller.ts`, `applyDeviceEvents` (DW-187). Keep its signature, its event-order processing and its same-reference return. The change:
   - Add a module-level map, derived from `TABLE`: each non-parking device → the set of **parking** devices whose `servesInto` equals its `entry`. At this tree that is `bd_shooter` → `{bd_trough}`; `bd_shooter`'s own `servesInto` is excluded because it is non-parking.
   - Before the loop, count the batch's `device_ball_left` events from each serving set.
   - A non-parking `device_ball_entered` consumes one such count if any remain: a served ball's arrival, no change. Otherwise it is a return to the lane and decrements `ballsInPlay`, floored at 0 like the parking decrement.
   - Rewrite the comments at `:16-31` and `:50-65` to say so.

   Checkpoint before task 3, with no golden file touched: `pnpm test test/rules-rollback-accounting.test.ts test/replay-goldens.test.ts test/rules-devices.test.ts test/rules-lifecycle.test.ts test/rules-ball-save.test.ts test/rules-tilt.test.ts` is green. The plan measured zero moved ticks in all five goldens (Design Notes). If a golden reddens here, run task 17's trace before anything else.
3. `src/sim/contracts/commands.ts`: add `MachineCommand<TCoil> = CoilCommand<TCoil> | RecoverCommand`, the AD-9 rules→physics union the header already names. `src/sim/table/names.ts`: bind `MachineCommand` and `RecoverCommand` beside `CoilCommand`.
4. `src/sim/contracts/events.ts`:
   - Add `BallSearchStartedEvent { type: 'ball_search_started'; tick }` to `SemanticEvent`. It is payload-complete as a start marker (AD-9).
   - Add `MachineReport<TBallDevice, TDevice> { recovered: number | null; failures: readonly (EjectFailedEvent|DeviceOverflowEvent|BrokenEvent)[] }`, documented as physics' per-step report that the loop forwards to rules (AD-4, amended). `recovered` is `null` on every step that consumed no `RecoverCommand`.
   - Bind both in `names.ts`.
5. `src/sim/table/dragonwar.ts`: add `slingWiring: { c_sling_l: { switch: 's_sling_l' }, c_sling_r: { switch: 's_sling_r' } }` beside `popWiring`. This is AD-11 wiring and the only structural source for "the slings". It moves `tableHash` deliberately; task 17 refreshes it.
6. `src/sim/table/tuning.ts`: add two top-level entries beside the tilt block.
   - `ballSearchMs: entry(15000, "PRD FR-23: 'If no switch closes for 15 s during play' (epics.md:64; the epic records it as an assumption)", 'unverified')`.
   - `ballSearchStepMs: entry(250, 'authored: no artifact states a per-step interval; long enough for a ball one pulse dislodges to close a playfield switch before the next pulse fires', 'unverified')`.

   `test/tuning.test.ts`: list both in `scalarKeys` with a Story 2.12 comment.
7. `src/sim/physics/devices.ts`: add `recover(tick): number` to `DeviceMechanics`.
   - It removes every ball in a **copy** of `physics.balls` whose centre is not inside any non-parking device's entry zone (reuse `isBallInsideZoneNow`).
   - It prunes those balls from `justEjected` and `overflowReported`, and returns the count.
   - It emits no switch edge: the tracker recomputes zone state from movements, so any break edge comes from the tracker itself.
8. `src/sim/physics/pops.ts`: add `applyPulses(tick, pulses, balls)`. It kicks every ball whose centre lies inside the pulsed pop's own skirt zone, using the same radial impulse as `applyPostSwitchEdges`, factored out rather than duplicated. It emits one `coil_fire` contact per kick. Only enabled pulses reach it (DW-74), so a disabled pop never kicks.
9. `src/sim/physics/machine.ts`, in `step`:
   - Accept `readonly MachineCommand[]`, and partition `type === 'recover'` **before** the enable/disable branch. `CoilCommand` handling is otherwise unchanged.
   - Call `deviceMechanics.recover(tick)` once when at least one recover was consumed, before `deviceMechanics.applyCommands(` and before the `before` map, so a same-tick serve is never despawned. Call `popMechanics.applyPulses(tick, enabledPulses, physics.balls)` pre-step, after `enabledPulses`.
   - Return `recovered` (the count, or `null`), and merge the pop pulse's contacts into `contactEvents`.

   Elsewhere in the file:
   - Add `PRE_STEP_HARDWARE_RULES` rows `{ receiver: 'deviceMechanics', method: 'recover', pinnedBy: 'test/ball-search-physics.test.ts' }` and `{ receiver: 'popMechanics', method: 'applyPulses', pinnedBy: 'test/ball-search-physics.test.ts' }`.
   - Rewrite the `:85-91` comment: failures now also reach rules, through the loop.
10. `src/sim/loop/index.ts`:
    - Widen `pendingCommands` to also hold a recover. Queue each `rulesResult.recoverCommands` entry for the next tick (AD-4), and emit it in `commandsForThisTick` as `{ type: 'recover', tick }`.
    - Pass `{ recovered: machineResult.recovered, failures: machineResult.semanticEvents }` as `rules.step`'s fourth argument.
    - Keep `events.push(...machineResult.semanticEvents, ...)` unchanged.
    - Add no write to `state`, and update the header comment `:9-15`.
11. `src/sim/rules/devices/drop-bank.ts`, `devices/events.ts` and `devices/index.ts`: AD-19's third trigger.
    - Add a rules-internal `BankResetRequest { type: 'bank_reset_requested'; tick }` to `devices/events.ts`. It is a lifecycle *input*, never a `DeviceEvent` or a `SemanticEvent`, so AD-19's event enumeration is unchanged.
    - Add `onResetRequested(tick)` to `DropBankTracker`, beside `onBallWillStart`.
    - Widen the devices layer's lifecycle input to `readonly (BallWillStartEvent | BankResetRequest)[]`, dispatching each kind to its entry point. `runSwitchScript`'s existing `BallWillStartEvent[]` argument stays assignable.
    - The physics reset's six `closed: false` edges clear the letter latch silently (`drop-bank.ts:74-80`), exactly as after a ball-start reset.
12. `src/sim/rules/ball-search.ts` (new, GPL-3.0 header). `createBallSearch(tuning)` resolves `ballSearchTicks` and `ballSearchStepTicks` once via `shotWindowTicks()`. At construction it builds the stage list structurally, in this order:
    - `slingWiring` keys;
    - `popWiring` keys;
    - the bank-reset request;
    - each device's `ballSearchOrder` `pulse` steps: parking devices with no `servesInto`, then non-parking devices, then parking devices with a `servesInto`;
    - one recover.

    It throws on a `TABLE` authoring defect: an empty `slingWiring` or `popWiring`, or a ball device with no `pulse` step.

    `step(state, deviceEvents, tick)` returns `{ events, coilCommands, recoverCommands, bankResetRequests }`. It implements the timer, the cancel, and the fixed-slot schedule; a guarded slot keeps its time and issues nothing. The guards:
    - the slots of `TABLE.lockLaneWiring.device` (the Lock arbiter's device) issue nothing until Story 3.2 (AD-18, amended);
    - the non-parking device's slot issues nothing while `machine.tilt.tilted`;
    - each slot of a parking device with a `servesInto` issues nothing while the non-parking device whose `entry` is that `servesInto` reads occupied in `machine.deviceSlots`.

    It also exposes `reset()` for `startBall()`. It is pure apart from its two closure marks.
13. `src/sim/rules/ball-controller.ts`, the search wiring.
    - Construct the search inside `createBallController`.
    - `step()` gains the `machineReport` parameter. After the Start and drain handling it does the following, in order:
      - (a) if `recovered !== null`: emit `ball_missing { count: recovered, tick }`; serve one `pulse` of `TABLE.ballDevices.bd_trough.ejectCoil` only if `phase === 'game'` and the non-parking device reads empty;
      - (b) for each `device_overflow` on a parking device other than `TABLE.lockLaneWiring.device`: one immediate `pulse` of its `ejectCoil`. A Lock overflow is tolerated (AD-18, amended);
      - (c) tolerate `eject_failed` and `broken` as no-ops;
      - (d) run the search and merge its outputs.
    - Export `applyRecovery(machine, recovered)`: `ballsInPlay: 0` when `recovered !== null`, otherwise the same reference.
    - `startBall()` calls the search's `reset()`.
    - `BallControllerStepResult` gains `recoverCommands` and `bankResetRequests`.
14. `src/sim/rules/index.ts`:
    - `Rules.step` takes the optional `machineReport` (default `EMPTY_MACHINE_REPORT`), and `RulesStepResult` gains `recoverCommands: readonly RecoverCommand[]`.
    - Before `applyDeviceEvents`, apply `applyRecovery(state.machine, machineReport.recovered)`.
    - Pass the report to `ballController.step`.
    - Forward `controllerResult.bankResetRequests` into the devices layer's lifecycle input on the **next** tick, beside `pendingLifecycleEvents`.
    - Update the header's three-argument quotation at `:4`.
15. `test/util/switch-script.ts`: add `machineReports?: ReadonlyMap<number, MachineReport>`, passed as the fourth argument on its tick. Add `recoverCommands` to the result.
16. Tests. Each follows `## Verification`'s mutation plan and pairs every negative with its positive in the same test.
    - `test/rules-ball-search.test.ts`: headless, `runRulesScript` with a mid-game `initialState` and injected `machineReports`. Covers ACs 1, 3, 4, 5, 6, the headless half of AC 7, and AC 13. Add it to `ENTRY_FILES`.
    - `test/ball-search-integration.test.ts`: a real `createLoop` with real input. Covers AC 2 and the real-loop half of AC 7.
    - `test/ball-search-physics.test.ts`: at `createMachine` level. Covers ACs 8 and 9, and is the manifest's `pinnedBy`.
    - `test/contracts.test.ts`: the `ball_search_started` arm with an executing assertion (AC 11).
17. Goldens.
    - Run a scratchpad-only harness that refreshes all five goldens' `header.tableHash` and `header.gameStart.tuning`. It adds `ballSearchMs`, `ballSearchTicks`, `ballSearchStepMs` and `ballSearchStepTicks` in `resolveTuning()` order, and appends a `notes` line naming Story 2.12. Verify per field (`## Verification`).
    - **DW-187 trace, if needed.** The plan measured that the fix moves no golden. If a golden's body field or state hash nevertheless moves, first establish whether the move is the DW-187 fix: re-run with task 2 reverted, from a saved copy.
      - A move traced to the fix is re-recorded under decision 3's pre-authorisation. The re-record must show the trajectory traced correct, the golden still asserting its own subject, and every field verified structurally.
      - Any other move is the contract's Block-If: HALT.

**Acceptance Criteria:**
- **AC 1: the search starts on its bound and walks its stages in order** (epics AC 1, as amended).
  - **Given** `runRulesScript` at production tuning with a mid-game `initialState`: `phase: 'game'`, one player, `ballsInPlay` 0, `deviceSlots.bd_shooter` `[true]`. `s_shooter_lane` opens at tick O, which emits `ball_launched` and makes `ballsInPlay` 1. No `playfield_switch_closed` follows.
  - **When** rules step through O+17750.
  - **Then:**
    - no `ball_search_started` appears through O+14999, and exactly one appears at O+15000, carrying `tick: O+15000`;
    - the merged `coilCommands` per tick equal this authored literal list: `c_sling_l` O+15000, `c_sling_r` O+15250, `c_pop_1` O+15500, `c_pop_2` O+15750, `c_pop_3` O+16000; nothing at O+16250; `c_dragon_bank_reset` at O+16251; nothing at O+16500 or O+16750; `c_autolaunch` O+17000; `c_trough_eject` O+17250 and O+17500;
    - exactly one `RecoverCommand` is issued, at O+17750;
    - no command in the run names `c_mouth`. The O+17000 and O+17250 commands in the same run are the positive: device steps are issued.
- **AC 2: Integration AC — physics' `recovered` reaches rules through the loop, and a ball is ready** (epics AC 2).
  - **Given** a real `createLoop` at production pitch, with `NO_BALL_SAVE_TUNING` as both `GameStart.tuning` and the loop's `tuning`. Start; the served ball is plunged with a 1200-tick hold and released into `flipper_l: true`, held for the rest of the search.
  - **When** the loop runs until `ball_search_started` arrives in `FrameOutput.events`, then 3000 ticks more. The arrival must be asserted, bounded at 40,000 ticks after the release.
  - **Then**, with S the event's tick:
    - one `bank_reset` contact arrives at S+1252;
    - `eject_failed { device: 'bd_shooter' }` arrives at S+2001;
    - at S+2251 the trough's closed-slot count drops by one and `deviceSlots.bd_shooter` reads `[true]` on the same tick, while `ballsInPlay` stays 1;
    - the trough count is unchanged at S+2501;
    - at S+2751, exactly one `ball_missing { count: 1 }` appears in the whole run, and `snapshot.balls.length` falls from 2 to 1 on that tick, with the lane ball kept;
    - `snapshot.game.machine.ballsInPlay` is 0, and the trough count is unchanged from then on;
    - there is no second `ball_search_started` before the plunge;
    - after the flipper is released, a 1200-tick plunge produces `ball_launched` with `currentPlayer` 0 and `players[0].ballNumber` 1 unchanged, and no `ball_ended` arrives anywhere in the run up to and including that tick.
  - Every assertion reads `FrameOutput`, never the controller's closure.
- **AC 3: the recover's rules-side answers.**
  - **Given** `runRulesScript` with injected `machineReports`.
  - **When** `recovered: 1` arrives with `bd_shooter` `[false]`; the identical script runs with `bd_shooter` `[true]`; and `recovered: 1` arrives on the tick a Slam moves `phase` to `'attract'`.
  - **Then** each run emits `ball_missing { count: 1 }` and reads `ballsInPlay` 0, but only the first issues `pulse c_trough_eject`. Its positive sits in the same test as the two runs that issue nothing.
  - **And** in a full search run whose report at O+17751 carries `recovered: 0` with `bd_shooter` `[true]`: `ball_missing { count: 0 }`, `ballsInPlay` 0, no serve, and no second `ball_search_started` through O+33751. The same run's O+15000 start is the positive.
- **AC 4: a playfield closure cancels and restarts the timer** (epics AC 3).
  - **Given** a search that started at O+15000.
  - **When** a `playfield_switch_closed` arrives at C = O+15600.
  - **Then** that pass issues no command after C and no `RecoverCommand`, and the next `ball_search_started` is at exactly C+15000. The identical script without the closure runs to its `RecoverCommand`, in the same test.
  - **And** an `s_shooter_lane` close, a trough slot close, a flipper `button_pressed` and `tilt_bob_closed`, each inside the quiet window, leave `ball_search_started` at O+15000. The same test shows a playfield closure moving it.
- **AC 5: the failure vocabulary is tolerated, and overflow is answered** (epics AC 4, as amended).
  - **Given** machine reports carrying `eject_failed` for each ball device, `broken { device: 'c_pop_1' }`, and `device_overflow` for `bd_trough` and for `bd_lock`, plus the controller's own `ball_missing` reaching `modeStack.step()` and the real Backglass fold.
  - **When** rules step.
  - **Then** nothing throws. `eject_failed` and `broken` issue no command and no event, and leave `state.machine` the same reference.
  - `device_overflow { bd_trough }` yields exactly one `pulse c_trough_eject` on the same tick, while `device_overflow { bd_lock }` in the same report yields nothing (AD-18, amended).
- **AC 6: the phase, in-play and tilt gates hold.**
  - **Given** a 16,000-tick quiet window.
  - **When** `phase` is `'attract'` or `'game_over'`, or `ballsInPlay` is 0 with a ball resting in `bd_shooter`.
  - **Then** no `ball_search_started` is emitted; the paired run in `'game'` with `ballsInPlay` 1 emits it at O+15000.
  - **And, when tilted**, the search runs and its sling and pop slots are issued, but the O+17000 slot issues nothing. The untilted twin issues `c_autolaunch` there.
- **AC 7: Integration AC — the drop-bank component consumes the search's request** (AD-19, amended).
  - **Given** a search reaching its bank slot at S = O+16250.
  - **When** rules step through S+2.
  - **Then:**
    - a directly constructed `createBallController(...)`, stepped through the same script, returns one `bankResetRequests` entry at S and no `c_dragon_bank_reset` in its own `coilCommands`;
    - `runRulesScript`'s merged `coilCommands` carry `pulse c_dragon_bank_reset` at S+1 and not at S;
    - AC 2's real-loop run shows exactly one `bank_reset` contact, at its S+1252.
- **AC 8: `RecoverCommand` in physics.**
  - **Given** a machine with one ball injected loose on the playfield and a served ball resting in `bd_shooter`'s entry zone.
  - **When** a step carries `{ type: 'recover', tick }`.
  - **Then** `recovered` is 1, the loose ball is gone and the lane ball remains. A step with no recover returns `recovered: null`. A recover and a `pulse c_trough_eject` in the same step keep the newly served ball.
- **AC 9: a commanded pop pulse kicks the ball it can reach.**
  - **Given** a machine with a ball injected at rest inside `s_pop_1`'s skirt zone.
  - **When** `pulse c_pop_1` is stepped.
  - **Then** the ball's speed rises from rest, directed away from `col_pop_1`'s centroid, with one `coil_fire` contact. The same script with `c_pop_1` disabled first leaves the ball at rest.
- **AC 10: tunables and goldens.**
  - **Given** the finished change.
  - **When** `resolveTuning()` runs, and `test/replay-goldens.test.ts` loads the five goldens.
  - **Then** `ballSearchMs` (15000) and `ballSearchStepMs` (250) resolve with a non-empty `source` and a valid `confidence`, derive `ballSearchTicks` and `ballSearchStepTicks`, and are listed in `scalarKeys`.
  - **And** all five goldens differ from `efe14f5` only in `header.tableHash`, four `gameStart.tuning` blocks and appended `notes`, with no `StaleReplayHeaderError`.
- **AC 11: the new event is in the closed union.**
  - **Given** `SemanticEvent` with its new `ball_search_started` member.
  - **When** `describeEvent({ type: 'ball_search_started', tick: 7 })` executes in `test/contracts.test.ts`.
  - **Then** it returns that arm's authored text, and `pnpm typecheck` passes with the `never` tail intact.
- **AC 12: DW-187 — a rolled-back ball leaves play, and its drain ends the ball** (ledger; Integration).
  - **Given** a real `createLoop` at production pitch, with `NO_BALL_SAVE_TUNING` as both `GameStart.tuning` and the loop's `tuning`. Start; the served ball reads `deviceSlots.bd_shooter` `[true]` with `ballsInPlay` 0.
  - **When:**
    - a 20-tick plunge is made;
    - the ball rolls back onto the tip;
    - the five hazard coils are disabled with `setCoilEnabled`;
    - the same ball is plunged with a 1200-tick hold;
    - it drains.
  - **Then:**
    - the weak plunge emits exactly one `ball_launched`, and `ballsInPlay` reads 1 on that tick (the instrument's positive);
    - once `bd_shooter` reads `[true]` again, `ballsInPlay` reads 0;
    - the re-plunge emits exactly one more `ball_launched`, and `ballsInPlay` reads 1;
    - on the tick a trough slot closes, `ball_ended { player: 0, tilted: false }` arrives and `ballsInPlay` reads 0.
  - It must be observed red on today's code first (task 1).
- **AC 13: DW-187 — a served arrival is never counted as a return.**
  - **Given** `applyDeviceEvents` over a `MachineState` with `ballsInPlay` 1.
  - **When** the batch is `[device_ball_left bd_trough, device_ball_entered bd_shooter]`, the same pair in reverse order, or `[device_ball_entered bd_shooter]` alone.
  - **Then** the pairs return the same reference with `ballsInPlay` 1, and the lone arrival returns `ballsInPlay` 0, all in one test. At 0, the lone arrival returns the same reference.
  - AC 2's S+2251 assertion and the `two-ball-collision` golden are its real-loop discriminators.

## Spec Change Log

- **2026-09-11 — re-dispatch after the plan-stage AD-18 halt (lead).** The author's five decisions are written into the intent contract (`Author decisions, 2026-09-11`), replacing the "Blocked on AD-18" paragraph. Frontmatter `status` reset `blocked` → `draft` for a re-plan on this spec path. Frontmatter `deferred` item 1 (DW-187's rolled-back-ball double count) removed because it is now in scope. Same-day planning writes: `epics.md` Story 2.12 (AC 1, AC 2, AC 5 amended, change log) and Story 3.2 (three clauses received, change log); spine AD-4, AD-5, AD-18 and AD-19 amended; ledger DW-241 `by-design`, DW-222 coupling-settled note, DW-187 corrected-severity and in-scope notes.
- **2026-09-11 — re-plan against the decisions (plan stage).** The intent contract was preserved verbatim, and everything outside it was re-derived.
  - **The ACs were renumbered to follow the amended epics text.** The old AC 2 (the `c_mouth` skip) moved to Story 3.2. The old ACs 7 and 8 were retired, because the decisions removed their premise. A rolled-back ball now reads `ballsInPlay` 0, so no search starts and no search launches it (DW-187 fixed). `c_autolaunch` is never disabled (DW-241 by-design), so the disabled-coil trace no longer describes a reachable state.
  - **DW-187 was added:** task 1, task 2, AC 12, AC 13 and the supplement rows.
  - **The real-loop stuck ball moved from a pitch-0 override to a held left flipper.** Measured at pitch 0, a served ball rolls up the lane by itself: `ball_launched` 182–184 ticks after the serve, with no plunge. So pitch 0 cannot hold a served ball on the tip, and the old AC 3's "the served ball rests in the shooter lane" was false there.
  - **KEEP:** the stage list and its structural order, the fixed-slot schedule, the bank request through AD-19's owner, the recover-before-`applyCommands` ordering, and the header-only golden budget.

## Review Triage Log

## Design Notes

### Reading the contract under the decisions (2026-09-11)

The contract's own **Author decisions** paragraph governs. Each older clause inside the contract that it touches reads as follows:
- **Approach, "ordered Lock, shooter, trough", and the Lock-pending markers in the "Stage schedule" and `bd_lock` overflow rows.** Decided by decision 1: the Lock's two slots keep their times and issue nothing, and a `bd_lock` overflow is tolerated without a command. The contract's "recommendation (A)" is what the author adopted.
- **Block If, "Any `c_mouth` pulse … before the AD-18 decision in `## Auto Run Result` is made".** The decision is made. Nothing in this story pulses `c_mouth`, so needing one is a HALT.
- **Never, "Never disable `c_autolaunch` … That is DW-241's undecided call".** The constraint stands; only its reason changed. DW-241 is decided by-design, and AD-5, amended, keeps the manual plunger live on `c_autolaunch`.
- **Never, the author-sheet list.** DW-241 has left the sheet. The rest stand, including DW-244.
- **Never, "Never fix the roll-back double count (frontmatter `deferred`)".** Superseded by decision 3: the fix is in scope (tasks 1–2) and the frontmatter item is gone.
- **Block If, the golden budget.** It stands as written. Decision 3's re-record grant is conditional on the fix moving a golden, and the plan measured that it moves none (below). Task 17 carries the trace in case it does.

### Governing architecture decisions (Rule 6)

- **AD-4, as amended 2026-09-11:** the loop contract. `rules.step`'s optional fourth argument is the machine report: `recovered` plus physics' device failures. Commands land on the next tick. The report's `failures` type also admits `broken` from AD-9's vocabulary, so epics AC 4's `broken` clause can be exercised. Physics' own `DeviceFailure` is exactly AD-4's two names (`devices.ts:79`), so nothing physics produces changes.
- **AD-5, as amended 2026-09-11:** the coil-enable gate that swallows a search pulse on a disabled sling or pop. The manual plunger shares `c_autolaunch`, which no rules path disables.
- **AD-6:** the protocol itself (`ballSearchOrder` pulses ending in `RecoverCommand`, the `recovered` count, `ball_missing { count }`), and "answer `device_overflow` with an immediate eject", excepting `bd_lock` under AD-18's phasing.
- **AD-7:** `GameState` ownership, and the closure-state class the search timer joins.
- **AD-9:** the closed rules→physics union, including `RecoverCommand`. `ball_search_started` is payload-complete.
- **AD-15:** two tunables with provenance, and the golden budget.
- **AD-16:** no name literals.
- **AD-18, as amended 2026-09-11:** only the ball controller pulses `c_trough_eject`/`c_autolaunch` and mutates `ballsInPlay`. `applyDeviceEvents` lives in `ball-controller.ts`. The phasing: nothing pulses `c_mouth` before Story 3.2.
- **AD-19, as amended 2026-09-11:** the devices layer is the only `SwitchEvent` consumer. The drop-bank component alone pulses `c_dragon_bank_reset`, on `ball_will_start`, on `bank_completed` and on ball search's reset request. The derived `playfield_switch_closed` set is "has anything closed?".
- Also relevant:
  - **AD-1:** rules and physics never import each other, so the machine report is a contracts type.
  - **AD-2:** failures are semantic events, not contacts.
  - **AD-3:** both timers are authored in ms and converted once.
  - **AD-11:** `TABLE` owns wiring, hence `slingWiring`.

No AC contradicts any AD's Rule.

### DW-187: the rolled-back ball (in scope, decision 3)

**The fix.** A non-parking device's `device_ball_entered` means a ball left play, unless the same batch carries a `device_ball_left` from a parking device that serves into it (`servesInto` equals its `entry`). That pair is a served ball's arrival, which was never counted. The rule is stateless: it keeps `applyDeviceEvents`' signature and its same-reference promise, and adds no closure counter. DW-187's own trailer records why a closure counter breaks every `initialState`-injecting test.

**Why pairing, not "every shooter arrival decrements".** Two served arrivals happen while a ball is counted:
- `two-ball-collision`'s second serve arrives at t=196 with `ballsInPlay` 1 (measured). The bare rule moves that golden's state hash.
- The search's own trough slot serves while the stuck ball is counted. The bare rule zeroes `ballsInPlay` at S+2251, the search idles, and no `RecoverCommand` is ever issued: AC 2 fails.

**Why same-batch pairing is sound.** The trough's eject pose lies inside its `servesInto` zone (`test/device-eject-pose.test.ts`), and a MAKE latches on its first tick (`switches.ts:169-175`). So the slot's opening and the lane's closing come from one physics step. That was measured at the Start serve (tick 3), at `two-ball-collision`'s t=196, and at a search-emulated serve beside a cradled ball.

Every serve this story issues is guarded on the lane reading empty. An empty lane means the lane switch is reported open, so the served ball's close edge is certain. The one unpaired shape left is a ball returning to the lane on the exact tick of a serve into it. That is DW-244's stacking shape; no guarded serve can produce it.

**Measured consequence on the goldens: none.** A shadow of today's accounting reproduced every golden's `ballsInPlay` on every tick, with zero model errors. With the fix applied, zero ticks differed in any of the five. So no trajectory or state-hash re-record is expected. Decision 3's grant is held for task 17's trace, not planned on.

**What the fix changes in play.**
- A rolled-back ball waits on the tip at `ballsInPlay` 0, as a real machine's does, and the player plunges again.
- No search starts for it, so the old plan's "the search launches a rolled-back ball" is gone.
- In single-ball play, the search's shooter slot now meets an empty lane and answers `eject_failed { bd_shooter }`, which the controller tolerates (AC 2 observes it). The slot stays in the schedule because the amended AC 1 names "the shooter and trough ejects", and because Story 3.7's multiball will have a counted ball in play beside a ball in the lane.
- A relaunch still re-arms the ball-save window and the skill shot, exactly as today: both key on `ball_launched`, not on the count.

**DW-187's Story 2.5 sub-findings.**
- **(a)** A parking entry at `ballsInPlay` 0 ends a ball: untouched. It stays unreachable in single-ball play, because a ball at 0 rests in the lane and reaches no parking device without a `ball_launched` first.
- **(b)** The floor's order dependence: touched only in that the new decrement is floored like the parking one, and it pairs by batch membership, not position, so it adds no new order dependence.
- **(c)** `startBall()` never resets `ballsInPlay`: untouched. Resetting it at Start decides what a voided ball still live at Start means, which is DW-244's undecided question.

**Spine.** No write is needed. AD-6 defines the increment on `ball_launched` and the device counts, but not the decrement, which is implementation under AD-18's "only the ball controller mutates `ballsInPlay`". The lead may still record the semantics — `ballsInPlay` counts balls launched and not yet arrived at any ball device — as a Rule 20 note for Story 3.7's benefit.

### The real-loop stuck ball (AC 2's instrument)

A plunged ball released into a held left flipper cradles near (220.5, 91.9) at production pitch, with the pops on or off. Measured: it settled by tick 6035; its spread over the following 17,000 ticks was under 1 mm; the nearest switch zone, `s_drain`, is 76.9 mm away. No jitter can close a playfield switch, so the search must start within 15,000 ticks of the ball's last closure.

The same probe emulated the schedule with dev pulses:
- the sling and pop pulses moved the cradled ball less than 0.1 mm;
- the bank pulse gave `bank_reset` one tick later;
- the autolaunch gave `eject_failed:bd_shooter` one tick later;
- the trough pulse opened a slot and closed the lane in one tick, and the served ball rested on the tip, with no `ball_launched` for 5000 ticks.

The recover then despawns the cradled ball and keeps the lane ball.

**Product note.** The contract fixes "the four buttons never start, delay or cancel a search", so a flipper cradle held for 15 s is recovered and replaced. The player keeps their ball number; they lose only the cradle position. Many real machines suppress the search while a flipper is held. Changing that is an intent change, not this plan's to make. AC 2 pins the contract's behaviour.

### How the stage order was resolved: AC 1's order without name literals

- The amended AC 1 reads "(slings, pops, bank reset, then the shooter and trough ejects); the Lock's own steps wait for Story 3.2". Only the three ball devices carry a `ballSearchOrder`, so the parenthetical is the schedule and "each device's `ballSearchOrder`" supplies its device stages.
- Slings come from a new `TABLE.slingWiring`, mirroring `popWiring`. `HARDWARE_COILS` also holds the flippers, and no field links a flipper coil.
- The device stages are ordered by structure, never by name:
  - parking devices with no `servesInto` first — the Mouth ejects into open play, so this is the Lock;
  - then non-parking devices;
  - then parking devices with a `servesInto` — the trough, last, so the shooter's autolaunch never fires at the search's own served ball.

  Story 3.2's received clause ("after the bank reset, before the trough eject") matches this order.
- The Lock's slots keep their times and issue nothing, identified by `TABLE.lockLaneWiring.device`, the Lock arbiter's device (AD-18, amended). **The seam for Story 3.2:** it replaces "issue nothing" at those two fixed slots with an arbiter request. The recover tick does not move.
- The three `recover` steps collapse into one `RecoverCommand`.

### The bank reset through its owner (AD-19, as amended)

The ball controller never pulses `c_dragon_bank_reset`. It returns a `bank_reset_requested` request, which `rules/index.ts` forwards on the next tick into the devices layer's lifecycle input. That is the path `ball_will_start` already takes to the same component. The drop-bank component pulses its own coil through `onResetRequested`, conforming to AD-19's amended text: its three triggers, and "ball search *requests* a bank reset through it and never pulses the coil itself".

### The machine report (AD-4, as amended)

- Physics' failures keep reaching `FrameOutput.events` from the loop exactly as today, and rules never re-emit them.
- Every existing three-argument `rules.step` call site compiles unchanged.
- `sim/loop`'s header, `rules/index.ts:4` and `machine.ts:85-91` quote the three-argument form or its absence; they are updated in the same change.
- `AD-20` stays the next claimable id.

### The golden budget

- The two top-level `…Ms` tunables add four blocks per golden: `ballSearchMs`, `ballSearchTicks`, `ballSearchStepMs`, `ballSearchStepTicks`.
- `slingWiring` moves `header.tableHash` on all five goldens.
- `header.physicsVersion` does not move: `PHYSICS_VERSION` hashes solver constants and the tick rate only (`replay.ts:188-214`).
- No golden starts a game, so the search, the recover and the pop pulse cannot fire in one.
- The DW-187 fix moves none (measured above). This is a header-only refresh with the 2.4, 2.9 and 2.10 precedents.

### The search's seat and timing

- `ball-search.ts` is stepped from inside `ballController.step()`, so the ball controller issues every serving pulse (AD-18). It runs **after** the drain branch, so a drain that ends the ball idles the search on the same tick.
- The tilt stage runs before the controller, so a Tilt engaging on tick t already suppresses that tick's shooter slot.
- Commands land on t+1 (AD-4). A recover's report returns to rules on t+1, having been consumed before that step's physics. The correction therefore runs **before** `applyDeviceEvents`: a ball launched during that very step is the only ball that can be in play.

**"`ballsInPlay` is corrected from slot switches".** After a recover, every simulated ball is inside a device. A ball resting on the plunger tip is inside `bd_shooter` on both sides of the seam: physics keeps it, and with DW-187 fixed, rules no longer count it. So the count of balls outside every device is 0 by construction. The slot switches decide the one open question, whether to serve: the trough serves only while the lane reads empty. A ball already waiting in the lane satisfies "a new ball is served", and serving another would stack two on the tip (DW-244's reproduced shape). `ball_missing` is emitted for every recover, including `count: 0` (`events.ts:176`).

**Why the shooter slot is tilt-guarded but the trough slots are not.** 2.11 shipped "no autolaunch into a tilted playfield" through the controller's guard (`ball-controller.ts:653`). `c_autolaunch` is never disabled (AD-5, amended), so the search keeps that promise the same way. A trough serve under Tilt only places a ball in the lane. Sling and pop pulses under Tilt are issued and swallowed by physics (AD-5, DW-74).

### Ledger entries touched (Rule 17 inbox: DW-187)

- **DW-187** (`routed`, owner `2-12-ball-search`): **addressed** by tasks 1–2, ACs 12–13, the supplement rows and the section above. Sub-findings (a) and (c) are declined with reasons; (b) is touched only as stated.
- **DW-230** (`wontfix-accepted`): not fired. `awaitingSaveLaunch` is set only by a save at `ballsInPlay` 0 and is consumed at the re-served ball's paired arrival. No search runs at 0, and the search's trough serve cannot meet a stale flag.
- **DW-222** (resolved by 2.11): its coupling is settled. Its "reopens if DW-241 is decided disable" condition cannot fire.
- **DW-241:** decided by-design. **DW-244:** still undecided; the design stays neutral. See the coupling section below.

### Consumes, Consumed-by, Integration ACs (Rules 1, 2)

**Consumes:**
- Stories 1.5 and 2.1d: parking, `eject_failed`, the eject pose inside `s_shooter_lane`.
- Story 2.2: the pop's radial kick and `popWiring`.
- Story 2.3: the drop bank and its reset, and the overflow latch.
- Story 2.4: the devices layer, `PLAYFIELD_SWITCHES` and the lifecycle input.
- Story 2.5: `startBall()`, `applyDeviceEvents()`, `HARDWARE_COILS`.
- Story 2.9: `awaitingSaveLaunch` and its tilt guard.
- Story 2.11: `machine.tilt` and the disable batch.
- DW-74: the `enabledPulses` gate.
- DW-187: the ledger entry this story closes.

**Consumed-by:**
- **Story 2.13 (Match, game over, Attract):** the search is `phase`-gated, so 2.13's game-over and Attract transitions stop it for free. The empty-trough `eject_failed` after repeated recoveries (frontmatter `deferred`) is the one end state a game could reach there.
- **Story 3.2 (the Lock arbiter):** it inherits `bd_lock`'s two fixed search slots, the `bd_lock` overflow answer and the `c_mouth` skip, all through the arbiter, together with DW-221.
- **Story 3.7 (Quick multiball):** `RecoverCommand` despawns *every* loose ball, so a multiball search needs 15 s of total silence and then recovers all of them. The served-arrival pairing is one-to-one per batch, so a multiball serve into the lane while balls are in play is counted correctly, and the shooter slot becomes reachable.
- **Epic 4:** `ball_search_started` is available to a flasher or sound cue; none is added here.

**Integration ACs:** AC 2 (`sim/loop` carries physics' `recovered` to the ball controller: `ball_missing`, the corrected count and the serve decision, observed in `FrameOutput`), AC 7 (the drop-bank component consumes the request), and AC 12 (DW-187 through real plunger input). Each runs against real instances, never mocks.

### Anti-vacuity plan, by named shape

- **Vacuity #43:** the search tunables are never overridden. `15000`, `250`, `2750` and the slot ticks are literals at the probe, and the mutation "set `ballSearchMs` to 1" must redden AC 1. The only override used is `NO_BALL_SAVE_TUNING`, which touches no tunable under test.
- **Vacuity #51:** every negative has its positive in the same test, on the same instrument:
  - no `ball_search_started` / the start on the bound;
  - no Recover / the uncancelled control;
  - no serve / the lane-empty serve;
  - no `c_mouth` / the O+17000 and O+17250 device commands;
  - no Lock-overflow answer / the trough overflow answer in the same report;
  - no second pass / the pass that ran;
  - no shooter pulse while tilted / the untilted twin;
  - `ballsInPlay` 0 after the roll-back / 1 on the weak plunge's own tick.
- **Vacuity #44:** the expected stage list is authored as a literal, derived by hand from `TABLE`, never by calling the module's own derivation. AC 13's expected counts are literals, not a second call of `applyDeviceEvents`.
- **Vacuity #48:** every mutation below is re-walked at the final tree if its target line moves.
- **Traps:** `toPhysics()` negates y, and the table frame's y rises up-table (the plunger tip is at y ≈ 13.5). Tilt warnings carry across a player's balls. `game_over` is terminal until 2.13. No flipper or plunger is rendered (DW-249). `NullEngine` rasterises nothing.

### Coupling to DW-241 / DW-244 / DW-222

**DW-241: settled (by-design; AD-5, amended).** `c_autolaunch` stays enabled under Tilt, game over and Attract, and this story adds none of the three tilt additions. The previous plan's decision-dependency lines are closed: their assumption, "the manual plunger stays live", is now the design.

**DW-222: coupling settled.** Its shape — a served ball at `ballsInPlay` 0, stranded only if the plunger were dead — is plungeable, so no search is needed and none runs.

**DW-244: still undecided; the design stays neutral.** The search is `phase`-gated and never serves into an occupied lane.
- Under today's phase-only Start, a new game begun while a voided ball is still live carries a stale `ballsInPlay` ≥ 1 (DW-187(c)). That game may run a search after 15 s of silence. Its shooter slot would launch the new ball waiting in the lane, and its recover would despawn the leftover. That is a side effect, not a design goal.
- If the author decides "refuse Start until balls are home" or "reuse the resting ball", nothing here changes.

**Where the search runs, and the traces that remain true.**
- **While tilted: yes.** A tilted ball that lodges would otherwise hang the game. Disabled slings and pops swallow their pulses, the shooter slot issues nothing, and the trough slots and the recover behave as untilted.
- **In `game_over` and `attract`: no**, by the phase gate.
- **A ball on the plunger tip (served or rolled back) is always at `ballsInPlay` 0** once DW-187 is fixed. Untilted or tilted, the player plunges it — the plunger is live — and play continues. A tilted ball then drains to `ball_ended { tilted: true }`. The search is not involved.
- **`RecoverCommand` and a ball resting in `bd_shooter`:** "inside" means the ball's centre is inside the device's entry zone, by the same instant box test `launch()` uses. That ball is never despawned.

## Verification

**Commands.** Export `BLENDER="C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe"` first in every shell; `0 skipped` is the proof it was exported.
- `pnpm typecheck`: exits 0 across all three tsconfigs. A missing `describeEvent` arm fails here first.
- `pnpm test`: 0 failing and **0 skipped**. Measure the baseline at your own tree before editing; the epic context records 117 files and 1971 tests at 2.11's close, which must not be transcribed. Account for the delta: four new test files plus new cases.
- `pnpm lint:boundaries`: `OK -- N .ts file(s)`, where N is one higher than the baseline you measure (`ball-search.ts`). A device-name literal anywhere under `src/` outside `dragonwar.ts` fails as `no-device-name-literal`.
- `pnpm check:headers` and `pnpm check:attributions`: exit 0. `ball-search.ts` and the four new test files carry the GPL-3.0 header.
- `pnpm check:ad7`: exit 0 with **exactly 3** passing tests.
- `pnpm check:corridor`: exit 0.
- `pnpm check:reachability`: exit 0 over its 52 cases.
- `git ls-files --others --exclude-standard test/`: only the four new test files. The golden harness must never appear.
- `git diff --stat -- public/assets/`: empty.
- `git diff -- src/sim/table/dragonwar.ts`: only the `slingWiring` block.

**Manual checks:**
- **The DW-187 checkpoint (task 2).** Before any contract, table or tuning edit, `test/replay-goldens.test.ts` is green with no golden file modified. This is the direct proof the fix moves no golden.
- **Structural golden comparison (authoritative).** For each golden, parse the JSON at `efe14f5` and at HEAD and compare field by field. Never use a substring grep, which the appended `notes` would trip.
  - `header.gameStart.tuning` gains exactly four blocks, in `resolveTuning()` order.
  - `header.tableHash` changed.
  - `notes` is a strict append.
  - Every other field is deeply equal: `assetHash` `ab163ff`, `physicsVersion` `v1-ce6772ef`, `tickHz`, `physicsSeed`, `gameStart.{seed,adjustments,highscores}`, `transitions`, `coilPrologue`, `durationTicks`, `expectedHash`, `expectedGameStateHash`, and, for `roll-and-drain`, `checkpointTicks` and `expectedCheckpointHashes`.
- Confirm `HARDWARE_COILS` is unchanged (7 coils) and still excludes `c_autolaunch` and `c_dragon_bank_reset`.
- Re-read `machine.ts:85-91`, `loop/index.ts:9-15`, `rules/index.ts:4` and `ball-controller.ts:16-31, 50-65`. Each must describe the new behaviour rather than predict or deny it.
- **Browser smoke (the lead's).** Two user-visible behaviours; no flipper or plunger is rendered (DW-249), but the ball's own motion is visible.
  - **DW-187:** press Start, tap the plunger for well under 100 ms, and watch the ball roll back onto the tip. Then give a full plunge and let the ball drain. The Backglass must advance to ball 2. Before the fix it stays on ball 1 forever.
  - **Ball search:** give a full plunge and hold the left flipper key so the ball cradles on the left flipper. About 15 s after it settles, a new ball appears in the shooter lane, and about half a second later the cradled ball disappears.

**Rule 19 mutations: one pinning mutation per AC.** State the expected red before each run. Revert from a saved copy, never with `git checkout --` or `git stash`, and confirm `git status --short` and `git diff --stat` are unchanged afterwards.

| AC | Mutation | Expected red |
| --- | --- | --- |
| AC 1 | Change the start check `>=` to `>` | The bound probe: no event at O+15000. |
| AC 1 | Set `ballSearchMs` to `1` in `tuning.ts` | The same test, proving the tunable is on the path. |
| AC 1 | Issue the Lock device's slots (drop the `lockLaneWiring.device` skip) | "No `c_mouth`": a pulse appears at O+16500, while the same test's O+17000 positive stays green. |
| AC 2 | Decrement on every non-parking arrival (drop the serve pairing) | `ballsInPlay` 0 at S+2251, the search idles, and no `ball_missing` arrives. |
| AC 2 | Make `recover()` also despawn the entry-zone ball | `snapshot.balls.length` reads 0 and `count` reads 2. |
| AC 3 | Remove the lane-occupied check on the recovery serve | The occupied run issues `c_trough_eject`, while the empty-lane positive stays green. |
| AC 4 | Fold closures into the origin only while the search is idle | The cancel test: the Recover still arrives. |
| AC 4 | Count `button_pressed` as activity | The non-playfield row: the start moves. |
| AC 5 | Answer a `bd_lock` overflow with its `ejectCoil` | The tolerance assertion: `c_mouth` appears beside the trough answer. |
| AC 5 | Remove the `device_overflow` branch | The trough overflow: no pulse. |
| AC 6 | Remove the search's tilt guard | The tilted twin: a `c_autolaunch` pulse appears at O+17000. |
| AC 6 | Drop the `phase === 'game'` conjunct | The Attract and game-over rows. |
| AC 7 | Have `ball-search.ts` push `pulse TABLE.dropBankResetCoil` directly | The "controller emits no reset command" assertion. |
| AC 8 | Make `recover()` also despawn the entry-zone ball | The kept-ball assertion. |
| AC 9 | Make `applyPulses` a no-op | The kick assertion reddens; the disabled control stays green. |
| AC 10 | Revert one golden's `gameStart.tuning` | `StaleReplayHeaderError` on exactly that golden. |
| AC 10 | Remove one key from `scalarKeys` | The ratchet, with its named message. |
| AC 11 | Template `event.tick` into a wrong arm | The executing assertion. |
| AC 12 | Today's code, run first (task 1), and afterwards the reverted decrement | `ballsInPlay` 1 after the roll-back; the observed today values are recorded here. |
| AC 13 | Drop the pairing condition | The served-pair case reads 0; `two-ball-collision` also reddens, because its t=196 serve arrives with `ballsInPlay` 1. |

## Auto Run Result

Status: ready-for-dev
Blocking condition: none

### Plan-stage record, 2026-09-11 (re-plan)

- **Dispatch:** `spec-2-12-ball-search.md Halt after planning.`, on a `draft` spec committed at `6b1970d`; a clean tree on `DW-1-epic2`. The committed `epic-2-context.md` was reused, not recompiled; no planning artifact is newer. The intent contract is preserved byte for byte, and everything else was re-derived. `src/`, `test/`, `tools/` and `public/` are unchanged since `efe14f5`, so the Code Map anchors hold.
- **Ledger inbox:** DW-187 (`routed`, owner `2-12-ball-search`), addressed as above.
- **Measurements.** Scratch probes were run from the scratchpad with their own vitest config, never under `test/`. `git status --short` was empty after each run.
  - **Goldens × DW-187.** A shadow of today's `ballsInPlay` accounting matched all five goldens on every tick, and the serve-paired fix changed zero ticks. Each golden's serves pair on the same tick: t=1 in all five, and t=196 in `two-ball-collision` at `ballsInPlay` 1.
  - **The lead's two-weak-plunge probe at today's tree.** The serve paired at tick 3 with `ballsInPlay` 0. The 20-tick plunge gave `ball_launched`@568 and a roll-back to `[true]` at 1869, unpaired, with `ballsInPlay` 1. The 1200-tick re-plunge gave `ball_launched`@4090 and `ballsInPlay` 2. The drain closed a trough slot at 8352, after which `ballsInPlay` stayed 1, no `ball_ended` arrived, and no ball was left on the table. This is RED as the lead recorded; the fix's shadow gives 0 / 1 / 0.
  - **Pitch 0.** The served ball rolls up the lane by itself, with `ball_launched` 182–184 ticks after the serve and no plunge. This rules pitch 0 out as AC 2's instrument.
  - **Held-left-flipper cradle at production pitch.** Settled by tick 6035 near (220.5, 91.9), with spread under 1 mm and `s_drain` 76.9 mm away. The emulated schedule gave the timings AC 2 asserts.
- **Previous result, 2026-09-10:** blocked on an intent gap (AD-18), answered by the author's decisions of 2026-09-11.
- **Nothing committed.** The spec is the only file written in the repository.
