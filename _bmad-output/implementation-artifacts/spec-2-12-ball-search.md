---
title: 'Story 2.12: Ball search'
type: 'feature'
created: '2026-09-10'
status: 'draft'
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

## Code Map

**Rules — the search's home and its consumers**
- `src/sim/rules/ball-controller.ts`: the owner of ball accounting and serving.
  - `applyDeviceEvents` `:44-73`. The floored decrement's comment `:59-65` already names `ball_missing` as the reconciliation.
  - `ballServingCoils`/`hardwareCoils`/`HARDWARE_COILS` `:148-178`: must not change.
  - `shooterLaunchCoil()` `:198-207` is the structural-derivation pattern to copy.
  - `createBallController` `:261`.
  - `startBall()` `:436-505`: resets at `:444-453`; the serve pulse at `:490` is the recovery serve's model.
  - `step()` `:507`: the save-arrival tilt guard at `:653` is the precedent for the search's autolaunch guard; the drain branch is `:673-772`; the game-over disable is `:738-742`.
- `src/sim/rules/index.ts`: the composition root.
  - `RulesStepResult` `:107-147` (`commands: readonly never[]` `:124`, `coilCommands` `:132`); `Rules.step` `:149-156`.
  - `createRules` `:222-306`, with `pendingLifecycleEvents` `:231` (the next-tick forwarding precedent for bank-reset requests).
  - Stage order: `devicesLayer.step` `:237`, `applyDeviceEvents`/`deriveDeviceSlots` `:245-250`, tilt `:259`, bonus credit `:268`, ball controller `:270-271`, modes `:279`.
  - `events` `:294`, `coilCommands` `:300`.
- `src/sim/rules/devices/index.ts`: `buildPlayfieldSwitches` `:190-213` (28); `PLAYFIELD_SWITCHES` `:223`; `step(switchEvents, lifecycleEvents, tick)` `:287`; the shooter-lane close/open → `device_ball_entered`/`device_ball_left`+`ball_launched` at `:303-323`; `playfield_switch_closed` `:390-392`; the drop bank at `:421-430` (lifecycle loop `:428-430`).
- `src/sim/rules/devices/drop-bank.ts`: `DropBankTracker` `:31-36`, `pulseResetCoil` `:55-57`, `onBallWillStart` `:92-94`. It is the sole owner of the reset pulse.
- `src/sim/rules/tilt.ts`: the stateful-controller precedent: factory closure, reset-safety at `:88-97`, ms→ticks once at `:81-82`.
- `src/sim/rules/modes/`: no mode publishes `timerTicks` at this tree. `src/presentation/backglass/frame.ts:507` treats `mode.timerTicks !== undefined` as "publishes one" (relevant only once AC 2 is unblocked).

**Physics**
- `src/sim/physics/machine.ts`:
  - `MachineStepResult` `:82-93`, whose comment `:85-91` must be updated.
  - `Machine.step` `:96`.
  - `PRE_STEP_HARDWARE_RULES` `:135-146` gains two rows. `test/hardware-rule-seam.test.ts:138-213` requires `receiver.method(` to appear before `physics.step();` and never after.
  - `coilEnabled` `:247-264`; the partition `:267-276` (the `else` is a catch-all); the plunger gate `:306`; `enabledPulses` `:318-319`; the drop reset `:323`; the `before` map `:325`; `physics.step()` `:338`; the return `:415-463`.
- `src/sim/physics/devices.ts`:
  - `DeviceFailure` `:67-79`.
  - `justEjected` `:258` and `overflowReported` `:272`: prune removed balls.
  - `applyCommands` `:423-487`: an empty parking device answers `eject_failed` at `:437-440`.
  - `launch()` `:490-510` and `isBallInsideZoneNow()` `:512-519`: the "inside the shooter" test `recover()` must reuse.
  - `detectEntries` overflow `:607-618`; the only existing removal `:624`.
- `src/sim/physics/pops.ts`: the MAKE-edge trigger `:130-156` and the radial impulse `:158-206`, to factor out for `applyPulses`. `createPopMechanics` holds each pop's `{coil, switchName, zones, centroidMm}` (`:112-119`) but no ball list, so pass `physics.balls`.
- `src/sim/physics/game/player-physics.ts:187-212`: `removeBall` throws on an unregistered ball; safe for several distinct balls before `physics.step()`.
- `src/sim/physics/switches.ts:125-188`: raw zone state is recomputed from `movements` each tick, so a ball despawned inside a zone yields the break edge on the settle path. That is an opening, which never counts as search activity.

**Loop and contracts**
- `src/sim/loop/index.ts`: `pendingCommands` `:282`; the two `state` writes at `:284` and `:433`; the per-tick body `:410-462` (`commandsForThisTick` `:417-423`, `machine.step` `:425`, `rules.step` `:428`, failures into `events` `:435`, coil queue `:459-461`).
- `src/sim/contracts/commands.ts`: `CoilCommand` `:12-17` and `RecoverCommand` `:20-23`. There is no union yet, even though the header `:3` says "closed command union".
- `src/sim/contracts/events.ts`: `BallMissingEvent` `:177-181`; the failure types `:248-266`; `SemanticEvent` `:273-290`.
- `src/sim/table/names.ts:57-58` binds contracts to `TABLE` unions.

**Table and tuning**
- `src/sim/table/dragonwar.ts`: coils `:301-318`; `bd_trough.ballSearchOrder` `:352-356` and `servesInto` `:364`; `bd_shooter` `:383-396`; `bd_lock` `:404-423`; `popWiring` `:498-501` (the shape `slingWiring` mirrors); `dropBankResetCoil` `:521`; `shows: {}` `:682`.
- `src/sim/table/tuning.ts`: `entry()` `:49`; the ball-save block `:344-358` and tilt block `:367-377` (style and placement for the two new entries); `resolveTuning` `:809-866`; `shotWindowTicks` `:898`.
- `src/sim/loop/replay.ts`: `tableHash` `:145-147` moves with `slingWiring`. `PHYSICS_VERSION` `:188-214` hashes solver constants only, so no physics edit here moves it. `StaleReplayHeaderError` `:240`; `assertHeaderMatchesLiveEnvironment` `:248-283`.

**Test infrastructure**
- `test/util/switch-script.ts`: `RunRulesScriptOptions` `:170-179`, `runRulesScript` `:228-251`. Gains `machineReports`; the result gains `recoverCommands`.
- `test/rules-devices-headless.test.ts:193-208`: `ENTRY_FILES`, where the new headless file goes; the completeness ratchet is `:222-243`.
- `test/contracts.test.ts:240-339`: `describeEvent`. The `never` tail is a typecheck gate; each arm needs an executing assertion.
- `test/tuning.test.ts:27-110`: `scalarKeys` and its ratchet.
- `test/coil-enable.test.ts:36-43, 90-147` and `test/plunger.test.ts`: the real-loop patterns (`pulseCoil`, `setCoilEnabled`, plunge by `InputTransition`).
- `test/machine-serve-drain.test.ts:293-325`: ball injection onto `machine.balls` for a machine-level test.
- `test/replay-goldens.test.ts:123` and `test/golden-line-endings.test.ts:23-29`: two independent five-name lists.

## Tasks & Acceptance

**Execution:**
1. `src/sim/contracts/commands.ts`: add `MachineCommand<TCoil> = CoilCommand<TCoil> | RecoverCommand`, the AD-9 rules→physics union the header already names. `src/sim/table/names.ts`: bind `MachineCommand` and `RecoverCommand` beside `CoilCommand`.
2. `src/sim/contracts/events.ts`: add `BallSearchStartedEvent { type: 'ball_search_started'; tick }` to `SemanticEvent`, payload-complete as a start marker (AD-9). Add `MachineReport<TBallDevice, TDevice> { recovered: number | null; failures: readonly (EjectFailedEvent|BrokenEvent|DeviceOverflowEvent)[] }`, documented as physics' per-step report that the loop forwards to rules; `recovered` is `null` on every tick that consumed no `RecoverCommand`. Bind it in `names.ts`.
3. `src/sim/table/dragonwar.ts`: add `slingWiring: { c_sling_l: { switch: 's_sling_l' }, c_sling_r: { switch: 's_sling_r' } }` beside `popWiring`. This is AD-11 wiring and the only structural source for "the slings". It is a deliberate `tableHash` move, refreshed in task 15.
4. `src/sim/table/tuning.ts`: add two top-level entries beside the tilt block.
   - `ballSearchMs: entry(15000, "PRD FR-23: 'If no switch closes for 15 s during play' (epics.md:64; the epic records it as an assumption)", 'unverified')`.
   - `ballSearchStepMs: entry(250, 'authored: no artifact states a per-step interval; long enough for a ball one pulse dislodges to close a playfield switch before the next pulse fires', 'unverified')`.

   `test/tuning.test.ts`: list both in `scalarKeys` with a Story 2.12 comment.
5. `src/sim/physics/devices.ts`: add `recover(tick): number` to `DeviceMechanics`. It removes every ball in a **copy** of `physics.balls` whose centre is not inside any non-parking device's entry zone (reuse `isBallInsideZoneNow`), prunes those balls from `justEjected` and `overflowReported`, and returns the count. It emits no switch edge; the tracker produces any break edge itself (Code Map, `switches.ts`).
6. `src/sim/physics/machine.ts`, in `step`:
   - Accept `readonly MachineCommand[]`. Partition `type === 'recover'` first; `CoilCommand` handling is otherwise unchanged.
   - Call `deviceMechanics.recover(tick)` once when at least one recover was consumed, before `deviceMechanics.applyCommands(`. Call `popMechanics.applyPulses(tick, enabledPulses, physics.balls)` pre-step after `enabledPulses`.
   - Return `recovered` (the count, or `null` when no recover was consumed) and merge the pop pulse's contacts into `contactEvents`.

   Elsewhere in the file:
   - Add `PRE_STEP_HARDWARE_RULES` rows `{ receiver: 'deviceMechanics', method: 'recover', pinnedBy: 'test/ball-search-physics.test.ts' }` and `{ receiver: 'popMechanics', method: 'applyPulses', pinnedBy: 'test/ball-search-physics.test.ts' }`.
   - Rewrite the `:85-91` comment: failures now also reach rules, through the loop.
7. `src/sim/physics/pops.ts`: add `applyPulses(tick, pulses, balls)`, which kicks every ball whose centre lies inside the pulsed pop's own skirt zone. It uses the same radial impulse as `applyPostSwitchEdges`, factored out rather than duplicated, and emits one `coil_fire` contact per kick. Only enabled pulses arrive (DW-74), so a disabled pop never kicks.
8. `src/sim/loop/index.ts`: queue each `rulesResult.recoverCommands` entry as a next-tick recover (AD-4). Include it in `commandsForThisTick` as `{ type: 'recover', tick }`. Pass `{ recovered: machineResult.recovered, failures: machineResult.semanticEvents }` as `rules.step`'s fourth argument, and keep `events.push(...machineResult.semanticEvents, ...)` unchanged. Add no write to `state`. Update the header comment `:9-15`.
9. `src/sim/rules/index.ts`:
   - Give `Rules.step` the optional `machineReport` (default `EMPTY_MACHINE_REPORT`), and add `RulesStepResult.recoverCommands: readonly RecoverCommand[]`.
   - Before `applyDeviceEvents`, apply `applyRecovery(state.machine, machineReport.recovered)`. The recover ran before this tick's physics step, so a `ball_launched` in the same tick still counts on top of the corrected 0.
   - Pass the report to `ballController.step`.
   - Forward `controllerResult.bankResetRequests` into the devices layer's lifecycle input on the **next** tick, exactly as `pendingLifecycleEvents` already does for `ball_will_start`.
10. `src/sim/rules/devices/index.ts` and `drop-bank.ts`: widen the lifecycle input to `readonly (BallWillStartEvent | BankResetRequest)[]`, where `BankResetRequest { type: 'bank_reset_requested'; tick }` is a rules-internal type in `devices/events.ts`, never a `SemanticEvent`. The drop bank pulses its reset for either kind: it stays the single owner (AD-19) and gains a third trigger (Design Notes, the proposed AD-19 write). `runSwitchScript`'s existing `BallWillStartEvent[]` argument stays assignable.
11. `src/sim/rules/ball-search.ts` (new, GPL-3.0 header): `createBallSearch(tuning)` resolves `ballSearchTicks` and `ballSearchStepTicks` once via `shotWindowTicks()`. It builds the stage list structurally at construction and throws on a `TABLE` authoring defect: an empty `slingWiring` or `popWiring`, or a device with no pulse step. `step(state, deviceEvents, tick)` returns `{ events, coilCommands, recoverCommands, bankResetRequests }` and implements the timer, the cancel, the fixed-slot schedule (a guarded slot keeps its time and issues nothing) and these guards:
    - the autolaunch slot issues nothing while `machine.tilt.tilted`;
    - each trough slot issues nothing while the non-parking device reads occupied in `machine.deviceSlots`;
    - Lock slots issue nothing pending AD-18.

    It also exposes `reset()` for `startBall()`. It is pure apart from its two closure marks. `test/rules-devices-headless.test.ts` needs no change for a `src/` file.
12. `src/sim/rules/ball-controller.ts`:
    - Construct the search inside `createBallController`. `step()` gains the `machineReport` parameter and, after the Start and drain handling, does the following in order:
      - (a) if `recovered !== null`: emit `ball_missing { count: recovered, tick }`, and serve with one `pulse` of `TABLE.ballDevices.bd_trough.ejectCoil` only if `phase === 'game'` and the non-parking device reads empty;
      - (b) for each `device_overflow` on a parking device other than the Lock: one immediate `pulse` of its `ejectCoil`;
      - (c) tolerate `eject_failed` and `broken` as no-ops;
      - (d) run the search and merge its outputs.
    - Export `applyRecovery(machine, recovered)`: `ballsInPlay: 0` when `recovered !== null`, otherwise the same reference.
    - `startBall()` calls the search's `reset()`.
    - `BallControllerStepResult` gains `recoverCommands` and `bankResetRequests`.
13. `test/util/switch-script.ts`: add `machineReports?: ReadonlyMap<number, MachineReport>`, passed as the fourth argument on its tick. Add `recoverCommands` to the result.
14. Tests. Each follows `## Verification`'s mutation plan and pairs every negative with its positive in the same test.
    - `test/rules-ball-search.test.ts`: headless, driven by `runRulesScript` with a mid-game `initialState` and injected `machineReports`. Covers ACs 1, 4, 5, 6, 10 and the matrix rows. Add it to `ENTRY_FILES`.
    - `test/ball-search-integration.test.ts`: a real `createLoop` with real input. Covers ACs 3, 7, 8, 9 and the Integration ACs.
    - `test/ball-search-physics.test.ts`: `createMachine` level. Covers AC 11 and the recover mechanics, and is the manifest's `pinnedBy`.
    - `test/contracts.test.ts`: the `ball_search_started` arm with an executing assertion.
15. Goldens: run a scratchpad-only harness that refreshes all five goldens' `header.tableHash` and `header.gameStart.tuning`, adding `ballSearchMs`, `ballSearchTicks`, `ballSearchStepMs` and `ballSearchStepTicks` in `resolveTuning()` order, and appends a `notes` line naming Story 2.12. Verify per field (`## Verification`).

**Acceptance Criteria:**
- **AC 1 — the search starts on its bound and walks its stages in order.**
  - **Given** phase `'game'`, `ballsInPlay` rising to 1 by `ball_launched` at tick O, and no `playfield_switch_closed` afterwards.
  - **When** rules step through O+17750 at production tuning.
  - **Then** no `ball_search_started` appears through O+14999. It appears exactly once at O+15000. The ball controller's commands follow the schedule in the matrix's "Stage schedule" row, at O+15000+250·k, and the drop-bank module's reset follows at O+15000+1251.
  - **[BLOCKED — AD-18]:** the AC's "then the Lock … ejects" clause, slots k=6 and 7.
- **AC 2 — [BLOCKED — AD-18].**
  - **Given** any active mode publishes a `timerTicks`.
  - **When** the search runs.
  - **Then** `c_mouth` is skipped.
  - Its positive case is a search Mouth pulse, which AD-18 forbids at this tree (`## Auto Run Result`). Under recommendation (A) this AC moves to Story 3.2. Under (B) it is pinned with a seeded `modes[i].timerTicks` against the same run with none.
- **AC 3 — the final stage recovers once and a ball is ready.**
  - **Given** a real `createLoop` at a pitch-0 override plus `NO_BALL_SAVE_TUNING`, Start, and a plunge whose ball comes to rest on the playfield. The plan-stage probe found it resting near (58, 391) with no events for 30,000 ticks.
  - **When** the search completes with no playfield closure.
  - **Then:**
    - exactly one `RecoverCommand` is issued;
    - `FrameOutput.events` carries `ball_missing { count: 1 }`;
    - `snapshot.game.machine.ballsInPlay` is 0;
    - `snapshot.balls` holds exactly one ball, resting in the shooter lane (`deviceSlots.bd_shooter` `[true]`), which the search's trough step served;
    - the trough holds one ball fewer than before the search;
    - a later plunge produces `ball_launched` with the same `currentPlayer` and `ballNumber`, and no `ball_ended`.
- **AC 4 — a playfield closure cancels and restarts the timer.**
  - **Given** a search that has started.
  - **When** a `playfield_switch_closed` arrives at tick C.
  - **Then** that pass issues no further slot command and no `RecoverCommand`, and the next `ball_search_started` is at exactly C+15000.
  - Control: the identical script without the closure runs to its `RecoverCommand`.
  - Non-playfield closures (the matrix row) delay nothing; the same run shows a playfield closure doing so.
- **AC 5 — the failure vocabulary is tolerated, and overflow is answered.**
  - **Given** machine reports carrying `eject_failed` (each ball device), `broken { c_pop_1 }` and `device_overflow { bd_trough }`, and the controller's own `ball_missing` reaching the mode stack.
  - **When** rules step.
  - **Then** nothing throws. `eject_failed` and `broken` change nothing (the same `GameState` reference, no command). `device_overflow { bd_trough }` yields exactly one `pulse c_trough_eject` on the same tick.
  - **[BLOCKED — AD-18]:** the `bd_lock` overflow answer.
- **AC 6 — the phase, in-play and tilt gates hold.**
  - **Given** a quiet window of 15000 ticks.
  - **When** phase is `'attract'` or `'game_over'`, or `ballsInPlay` is 0 with a served ball resting in `bd_shooter`.
  - **Then** no `ball_search_started` is ever emitted; the paired run in `'game'` with `ballsInPlay` 1 emits it.
  - **And, when tilted**, the search runs but its autolaunch slot issues nothing; the paired untilted run issues it.
- **AC 7 — Integration: at today's tree the search launches a rolled-back ball.**
  - **Given** a real `createLoop` at production pitch, Start, and a manual plunge held 20 ticks, which the plan measured rolling back onto the tip with `ballsInPlay` 1.
  - **When** the loop runs past the search's autolaunch slot.
  - **Then** `ball_search_started` arrives in `FrameOutput.events` no earlier than the plunge's own `ball_launched` tick + 15000. The origin can move later if the climbing ball closed a playfield switch, and `FrameOutput` does not expose that; the exact bound is AC 1's, pinned headlessly.
  - **And** a second `ball_launched` arrives after `ball_search_started.tick + 2000`, the autolaunch slot, and within 50 ticks of it. `deviceSlots.bd_shooter` reads `[false]` after it, and the ball's `pos.y` rises past the roll-back's measured apex.
  - Paired negative in the same file: AC 8's disabled-coil run shows no second `ball_launched`.
- **AC 8 — Integration: trace (b) as a test.**
  - **Given** AC 7's setup, with `loop.setCoilEnabled('c_autolaunch', false)` after the roll-back.
  - **When** the loop runs 40,000 ticks past the roll-back.
  - **Then:**
    - no `ball_launched` and no `eject_failed { bd_shooter }` follow the autolaunch slot; the pulse is swallowed (fact 7);
    - `ball_missing { count: 0 }` arrives;
    - `ballsInPlay` is 0;
    - `snapshot.balls.length` stays 1, with no trough serve and trough slots unchanged;
    - exactly one `ball_search_started` is seen in the whole run, so there is no loop.
  - AC 7's enabled run in the same file is the positive control.
- **AC 9 — Integration AC (the loop consumes physics' `recovered`).**
  - **Given** AC 3's real loop with a ball at rest on the playfield.
  - **When** the ball controller's `RecoverCommand` is consumed by physics on the next tick, and `sim/loop` forwards `MachineStepResult.recovered` in the machine report.
  - **Then** `FrameOutput.events` on that tick carries `ball_missing { count: 1 }`, which matches the number of balls that left `snapshot.balls` on that tick.
  - It is asserted on the real loop's output, never by reading the controller's closure.
- **AC 10 — Integration AC (the drop-bank component consumes the search's request).**
  - **Given** a search reaching slot k=5 at tick S.
  - **When** rules step through S, S+1 and S+2.
  - **Then:**
    - a direct `createBallController(...).step()` call at S returns one `bankResetRequests` entry and no `c_dragon_bank_reset` in its `coilCommands`;
    - `runRulesScript`'s merged `coilCommands` carry `pulse c_dragon_bank_reset` at S+1, from the devices layer;
    - a real-loop search shows exactly one `bank_reset` ContactEvent at S+2.
- **AC 11 — a commanded pop pulse kicks the ball it can reach.**
  - **Given** a machine with a ball injected at rest inside `s_pop_1`'s skirt zone.
  - **When** `pulse c_pop_1` is stepped.
  - **Then** the ball's speed rises from rest, directed away from `col_pop_1`'s centroid, with one `coil_fire` contact.
  - The same script with `c_pop_1` disabled first leaves the ball at rest.
- **AC 12 — tunables and goldens.**
  - **Given** the finished change.
  - **When** `resolveTuning()` runs, and `test/replay-goldens.test.ts` loads the five goldens.
  - **Then** `ballSearchMs` (15000) and `ballSearchStepMs` (250) resolve with a non-empty `source` and a valid `confidence`, derive `ballSearchTicks` and `ballSearchStepTicks`, and are listed in `scalarKeys`.
  - **And** all five goldens differ from `efe14f5` only in `header.tableHash`, four `gameStart.tuning` blocks and appended `notes`, with no `StaleReplayHeaderError`.
- **AC 13 — the new event is in the closed union.**
  - **Given** `SemanticEvent` with its new `ball_search_started` member.
  - **When** `describeEvent({ type: 'ball_search_started', tick: 7 })` executes in `test/contracts.test.ts`.
  - **Then** it returns that arm's authored text, and `pnpm typecheck` passes with the `never` tail intact.

## Spec Change Log

- **2026-09-11 — re-dispatch after the plan-stage AD-18 halt (lead).** The author's five decisions are written into the intent contract (`Author decisions, 2026-09-11`), replacing the "Blocked on AD-18" paragraph. Frontmatter `status` reset `blocked` → `draft` for a re-plan on this spec path. Frontmatter `deferred` item 1 (DW-187's rolled-back-ball double count) removed because it is now in scope. Same-day planning writes: `epics.md` Story 2.12 (AC 1, AC 2, AC 5 amended, change log) and Story 3.2 (three clauses received, change log); spine AD-4, AD-5, AD-18 and AD-19 amended; ledger DW-241 `by-design`, DW-222 coupling-settled note, DW-187 corrected-severity and in-scope notes.

## Review Triage Log

## Design Notes

### Author decisions at the spec gate (2026-09-11)

The five decisions in the intent contract supersede this section's earlier text wherever the two disagree. In particular, the `### Coupling to DW-241 / DW-244 / DW-222` section below was written before the decisions: its DW-241 `DECISION DEPENDENCY` lines are settled (the plunger stays live, so the assumption became the design); its DW-244 line stands (still undecided; the design stays neutral); and every `bd_lock` / `c_mouth` / `[AD-18]` mention now means "nothing is issued at the Lock until Story 3.2". The `PROPOSED SPINE WRITE` items for AD-4 and AD-19 are no longer proposals — the lead wrote them into the spine at this gate, alongside AD-5 and AD-18; conform to the spine's text.

**Governing architecture decisions (Rule 6).**
- **AD-4:** the loop contract. `recovered` returned from physics, commands landing the next tick. Proposed write 1 below.
- **AD-5:** the coil-enable gate that swallows a search pulse on a disabled coil (fact 6).
- **AD-6:** the protocol itself (`ballSearchOrder` pulses ending in `RecoverCommand`, the `recovered` count, `ball_missing { count }`), plus "the opening of `s_shooter_lane` is the one event that means plunged" and "answer `device_overflow` with an immediate eject".
- **AD-7:** `GameState` ownership and the closure-state class the search timer joins.
- **AD-9:** the closed rules→physics union, including `RecoverCommand`; `ball_search_started` is payload-complete.
- **AD-15:** two tunables with provenance, and the golden budget.
- **AD-16:** no name literals.
- **AD-18:** only the ball controller pulses `c_trough_eject`/`c_autolaunch` and mutates `ballsInPlay`, **and the Lock arbiter alone pulses `c_mouth`, with the Mouth-open show first**. That clause is this story's block.
- **AD-19:** the devices layer is the only `SwitchEvent` consumer, the drop-bank component alone pulses `c_dragon_bank_reset`, and the derived `playfield_switch_closed` set is "has anything closed?". Proposed write 2.

Also relevant:
- **AD-1:** rules and physics never import each other; the machine report is a contracts type.
- **AD-2:** rules never receive a `ContactEvent`; failures are semantic events, not contacts.
- **AD-3:** both timers authored in ms and converted once.
- **AD-11:** `TABLE` owns wiring, hence `slingWiring`.

**No AC contradicts any AD's Rule except through AD-18**, which is the HALT.

**How fact 2 was resolved — AC 1's order without name literals (an intent-preserving reading, not an amendment).**
- AC 1 reads "pulses coils in each device's `ballSearchOrder` on a tick schedule (slings, pops, bank reset, then the Lock and trough ejects)". Only the three ball devices carry a `ballSearchOrder`, so the parenthetical names stages the `TABLE` data does not.
- The reading adopted: the parenthetical is the schedule, and "each device's `ballSearchOrder`" supplies the device stages inside it. Slings come from a new `TABLE.slingWiring`. It mirrors `popWiring`, and `TABLE` has no other structural source for "the slings": `HARDWARE_COILS` also holds the flippers, and no field links a flipper coil.
- The device stages are ordered by a structural rule rather than a name. Parking devices with no `servesInto` come first: the Mouth ejects into open play, so it is the "Lock" of the AC. Then non-parking devices. Then parking devices with a `servesInto`: the trough, which serves into the shooter lane and so goes last, keeping the shooter's autolaunch from firing at the search's own served ball.
- The shooter's `pulse c_autolaunch` is not in the parenthetical, but it is in "each device's `ballSearchOrder`". The `TABLE` comment `dragonwar.ts:386-388` names it as the one recovery for a ball stuck on the plunger tip, which this plan measured is the common stall.
- The three `recover` steps collapse into AC 3's single `RecoverCommand`.

**How fact 3 was resolved — the bank reset through its owner (intent-preserving, with a proposed spine write).**
- The ball controller never pulses `c_dragon_bank_reset`. It returns a `bank_reset_requested` request, which `rules/index.ts` forwards on the next tick into the devices layer's lifecycle input, the very path `ball_will_start` already takes to the same component. The drop-bank component pulses its own coil, so AD-19's "alone" holds.
- The rules-side letter latch stays correct with no new code: the physics reset emits six `closed: false` edges, and `drop-bank.ts:74-80` clears them silently, exactly as it does after a ball-start reset.
- **PROPOSED SPINE WRITE (AD-19, lead-owned, Rule 20):**
  - The clause *"The drop-bank component alone pulses `c_dragon_bank_reset`, on `ball_will_start` and on `bank_completed`."* becomes *"The drop-bank component alone pulses `c_dragon_bank_reset`, on `ball_will_start`, on `bank_completed`, and on a ball-search reset request the ball controller delivers to it the next tick (Story 2.12); no other module pulses it."*
  - Also add `bank_reset_requested` beside `ball_will_start` as the layer's two lifecycle inputs. It is rules-internal and not a device event.

**How fact 4 was handled — AD-18 cannot be satisfied at this tree; this is the HALT.**
- AD-18 has three requirements: *"[the Lock arbiter] alone pulses `c_mouth` … every Mouth eject is preceded by `ShowCommand show_dragon_mouth_open` and follows it by `mouthOpenLeadMs`"*.
- At `efe14f5` none of that exists:
  - there is no Lock arbiter;
  - `TABLE.shows` is `{}` (`dragonwar.ts:682`), so `ShowName` is `never` and a `ShowCommand` cannot even typecheck;
  - `mouthOpenLeadMs` is absent;
  - `RulesStepResult.commands` is `readonly never[]`.
- The epic routes the Lock arbiter to Story 3.2 and forbids pre-building it. So AC 1's Lock clause, AC 2 in its entirety, and AC 5's `bd_lock` overflow answer each need a pulse AD-18 forbids.
- AC 2 cannot be kept honestly by skipping `c_mouth` unconditionally. Its "skipped" assertion would then have no positive case: vacuity #51 by construction.
- One physical fact supports recommendation (A) rather than a workaround: in this machine a Mouth pulse can never find a missing ball.
  - Parking is exact: a ball inside `bd_lock` is removed from simulation and counted by its closed slot switch (AD-6; `devices.ts:620-624`).
  - A search Mouth pulse therefore either answers `eject_failed` on an empty Lock (`:437-440`) or releases a counted locked ball.
  - A released ball enters play with no `ballsInPlay` increment: `applyDeviceEvents` counts only `ball_launched`. That is the accounting DW-221 already routes to 3.2.
- The plan leaves the Lock's two slots in the schedule so the recover tick does not move whichever way the author decides. Under (A) they issue nothing.

**How fact 5 was resolved — the golden budget, planned.**
- Two top-level `…Ms` tunables add four blocks per golden: `ballSearchMs`, `ballSearchTicks`, `ballSearchStepMs` and `ballSearchStepTicks`.
- `slingWiring` moves `header.tableHash` on all five goldens.
- `header.physicsVersion` does not move: `PHYSICS_VERSION` hashes 20 solver constants plus the tick rate and no source file (`replay.ts:188-214`).
- No golden starts a game (their `coilPrologue` pulses only `c_trough_eject`/`c_autolaunch` in Attract), so the search, the recover and the pop pulse cannot fire in one, and every state hash must hold.
- This is a header-only refresh with the 2.4/2.9/2.10 precedent. Anything else is a Block-If.

**PROPOSED SPINE WRITE (AD-4, lead-owned, Rule 20).** AD-4's diagram already returns `recovered` from physics, but its Rule and the rules call say only `rules.step(state, switchEvents, tick)`, so the count had no route to AD-6's ball controller. Suggested amendment:
- *"…then `rules.step(state, switchEvents, tick, machineReport)` runs — every step, even with none — where `machineReport { recovered, failures }` carries physics' `recovered` count (non-null only on a step that consumed a `RecoverCommand`) and its device-failure events (`eject_failed`, `device_overflow`, `broken`), which also still reach `FrameOutput.events` directly."*
- Also change the diagram's `L->>R` line accordingly.

It is an extension, not a contradiction: rules still run every step. `sim/loop`'s file header and `rules/index.ts:4` quote the three-argument form as "AD-4's pin" and are updated in the same change. **`AD-20` stays the next claimable id**; no new AD is needed.

**Consumes:**
- Story 1.5 / 2.1d: parking, `eject_failed`, the eject pose inside `s_shooter_lane`.
- Story 2.2: the pop's radial kick, `popWiring`.
- Story 2.3: the drop bank and its reset; the overflow latch.
- Story 2.4: the devices layer, `PLAYFIELD_SWITCHES`, the lifecycle input.
- Story 2.5: `startBall()`, `applyDeviceEvents()`, `HARDWARE_COILS`.
- Story 2.9: `awaitingSaveLaunch` and its tilt guard.
- Story 2.11: `machine.tilt` and the disable batch.
- DW-74: the `enabledPulses` gate.

**Consumed-by:**
- **Story 2.13 (Match, game over, Attract):** the search is `phase`-gated, so the game-over and Attract transitions 2.13 generalises stop it for free. The empty-trough `eject_failed` after repeated recoveries (frontmatter `deferred`) is the one end state a game could reach there.
- **Story 3.2 (the Lock arbiter):** under recommendation (A) it inherits bd_lock's two search slots, AC 2 and the `bd_lock` overflow answer, all through the arbiter with the Mouth-open show, together with DW-221.
- **Story 3.7 (Quick multiball):** `RecoverCommand` despawns *every* loose ball, so a multiball search needs 15 s of total silence and then recovers all of them. The roll-back double count (frontmatter `deferred`) and DW-187 become multi-ball questions there.
- **Epic 4:** `ball_search_started` is available to a flasher or sound cue; none is added here.

**Integration ACs (Rule 1).**
- `ball-search.ts` and the physics recover are new services.
- Their consumers are exercised against real instances:
  - `sim/loop` → the ball controller, via `recovered` (AC 9, through AC 3's real loop);
  - the drop-bank component, via the reset request (AC 10);
  - physics, via the pop pulse (AC 11);
  - rules, via device failures (AC 5).
- AC 7 and AC 8 drive the whole chain from real plunger input.

**The search timer lives in a sub-module the ball controller owns.**
- It lives in `src/sim/rules/ball-search.ts` and is stepped from inside `ballController.step()`, so "the ball controller pulses coils" is literally true, and AD-18's serving-coil and `ballsInPlay` monopoly holds.
- It runs **after** the drain branch, so a drain that ends the ball on tick t idles the search on that same tick (`ballsInPlay` is 0).
- `rules/index.ts` runs the tilt stage before the controller (2.11), so a Tilt engaging on tick t already suppresses that tick's autolaunch slot.
- Its commands land on t+1 (AD-4), and a recover's report returns to rules on t+1, when physics consumed it before its own step.
- The correction runs **before** `applyDeviceEvents` for that reason: a ball launched during the very step the recover preceded is the only ball that can be in play.

**"`ballsInPlay` is corrected from slot switches".**
- After a recover, every ball physics still simulates is inside a device, with its slot switch closed. A ball on the plunger tip counts as inside `bd_shooter`, by the non-parking device's single-element occupancy (fact 7).
- So the number of balls outside every device, which is what `ballsInPlay` counts, is 0 by construction. The slot switches decide the one thing left open: whether a new ball must be served. The trough serves only when the shooter slot reads empty.
- The AC's "a new ball is served" is met by the ball already resting in the lane when it is occupied. Serving another would stack two balls on the tip, DW-244's reproduced defect, which cannot be the AC's intent. This is why the search's trough slots carry the same guard: at most one ball is ever served by one search.
- `ball_missing` is emitted for every recover, including `count: 0`. The AC's clause is unconditional, and `events.ts:176` defines the count as "this many balls it could not find".

**Why the search's autolaunch slot is tilt-guarded but the trough slots are not.** 2.11 shipped "no autolaunch into a tilted playfield" through the controller's guard (`ball-controller.ts:653`), because `c_autolaunch` is never disabled. The search keeps that promise the same way. A trough serve under Tilt only places a ball in the shooter lane, which AC 3's literal "a new ball is served" asks for. The dependency this creates is recorded below. Sling and pop pulses under Tilt are issued and swallowed by physics (AD-5, DW-74), with no rules-side filter.

**Two measured facts this plan adds.**
- *(1) The roll-back stall is ordinary play.* Every weak plunge (1–100 ticks) rolls back onto the tip, reading `bd_shooter` `[true]` with `ballsInPlay` 1 and no further events (frontmatter `deferred`). The search's autolaunch slot is what rescues it (AC 7). The re-launch is counted a second time; that is the pre-existing root cause, which this story reconciles at its next recovery rather than fixes.
- *(2) Sling pulses cannot reach a resting ball* from any geometry physics holds (frontmatter `deferred`). They are issued, to keep AC 1's order, and are inert. Pop pulses are made physical (task 7), because a ball wedged against a bumper does sit inside its skirt zone.

**Ledger entries touched (the inbox for `2-12-ball-search` is empty; Rule 17).**
- **DW-230** (`wontfix-accepted`; `reopen_if` names this story): not fired. `awaitingSaveLaunch` is set only by a save, which requires `ballsInPlay` 0, and is consumed at the re-served ball's arrival. The search runs only with `ballsInPlay` > 0, and neither its trough slot nor its recovery serve can find the flag stale: a flag that strands, on a re-serve that never arrives, leaves `ballsInPlay` at 0, so no search runs.
- **DW-187** (`wontfix-theoretical`; `reopen_if` "ball search makes more than one ball countable at once"): fires in two ways, and the lead should adjudicate with an occurrence line.
  - (i) The search's autolaunch slot re-launches an already-counted rolled-back ball, which double counts. The same happens on a player's re-plunge today.
  - (ii) The trough slot serves a ball while the stuck ball is still counted. If the stuck ball then frees itself, two balls are live. They are counted correctly once both are launched.
- **DW-222** (resolved by 2.11): see the coupling section.

**Anti-vacuity plan, by named shape.**
- **Vacuity #43:** the search tunables are never overridden anywhere. `15000`, `250`, `2750` and the slot ticks are literals at the probe, and the mutation "set `ballSearchMs` to 1" must redden AC 1. The only overrides used are `NO_BALL_SAVE_TUNING` and a **pitch** override (`defaultPitchDeg` and `pitchMinDeg` 0) that manufactures a stuck ball. Neither touches the tunables under test.
- **Vacuity #51:**
  - "no `ball_search_started`" is paired with the same run showing it on the bound;
  - "no Recover" with the uncancelled control;
  - "no serve" with the trough slot firing when the lane is empty;
  - "no loop" with the one `ball_search_started` that did arrive;
  - "swallowed" with AC 7's launch in the same file;
  - "no autolaunch while tilted" with the untilted twin.
- **Vacuity #44:** the expected stage list is authored as a literal in the test, derived by hand from `TABLE`, never by calling the module's own derivation.
- **Vacuity #48:** every mutation below is re-walked at the final tree if its target line moves.

### Coupling to DW-241 / DW-244 / DW-222

**(a) Where the search runs.**
- **While tilted: yes.** A tilted ball that lodges would otherwise hang the game, because Tilt ends the ball only on the last drain. Disabled slings and pops are swallowed by physics. The autolaunch slot issues nothing (2.11's promise). The trough and bank slots and the recover behave as untilted.
- **In `game_over`: no.** The phase gate stops it. Game over is reached only when the last ball drains, so no ball is in play to find.
- **In `attract` with DW-244's voided ball still live: no.** The phase gate stops it, so the search never touches the voided ball in Attract. Under today's phase-only Start, a new game begun while that ball is loose and `ballsInPlay` is stale at ≥ 1 (DW-187(c): `startBall()` never resets it) may run a search that despawns the leftover. That is a side effect, not a design goal. The search never serves into an occupied lane, so it never creates DW-244's stacking shape itself.

**(b) `RecoverCommand` and a ball resting in `bd_shooter`.** For a non-parking device, "inside" means the ball's centre is inside the device's entry zone, by the same instant box test `launch()` uses (`devices.ts:512-519`). A ball on the plunger tip is **inside** and is never despawned (fact 7: `deviceSlots.bd_shooter` `[true]`).

*Trace: a ball stranded on the plunger tip, and `c_autolaunch` disabled* (the state DW-241's "disable under Tilt" option would create; Tilt is therefore true).
- **S0 — `ballsInPlay` 0.** This is a served or re-served ball never plunged, DW-222's shape.
  1. The search never starts, because no ball is in play.
  2. No pulse fires and no recover is issued; `ballsInPlay` stays 0 and nothing is served.
  3. Nothing can plunge the ball.
  - **Outcome: hard hang.** It is static: no loop, no stack.
- **S1 — `ballsInPlay` ≥ 1.** A plunged ball rolled back onto the tip, measured as ordinary play.
  1. The search starts at origin+15000.
  2. Slings and pops are swallowed (disabled under Tilt). The bank reset fires. The Lock slots issue nothing [AD-18].
  3. The autolaunch slot issues nothing (tilt guard). If issued, physics would swallow it: no `ball_launched`, no `eject_failed`.
  4. Both trough slots are skipped, because the lane is occupied.
  5. `RecoverCommand`: the ball is inside `bd_shooter` and kept, so `recovered: 0`.
  6. `ball_missing { count: 0 }`; `ballsInPlay` is corrected to 0.
  7. No serve (the lane is occupied, so no stacking). The search idles, because `ballsInPlay` is 0, and **does not restart**.
  - **Outcome: hard hang.** One pass, then static: no loop, no stack. AC 8 pins this path.

**(c) The same trace at today's tree, where `c_autolaunch` is never disabled.**
- **S0 untilted:** the player plunges manually and play continues. The search is not involved. **Outcome: recovers (player).**
- **S0 tilted (DW-222's exact shape):** the same. The manual plunge is live, and the ball drains to `ball_ended { tilted: true }`. The search adds no automatic recovery here, because nothing is in play. **Outcome: recovers (player), as 2.11 shipped.**
- **S1 untilted:**
  1. The autolaunch slot fires, and the ball launches at `autolaunchSpeedMmPerS`.
  2. `ball_launched` counts it a second time: `ballsInPlay` 2 (frontmatter `deferred`).
  3. Its playfield closures cancel the search. **Outcome: recovers (automatic; AC 7).**
  4. Residual: after its drain `ballsInPlay` is 1 with no ball. The next search's trough slot serves, then `recovered: 0`, `ball_missing { count: 0 }` and `ballsInPlay` 0. The player plunges the served ball, and the drained ball never produced its `ball_ended`.
- **S1 tilted:**
  1. The autolaunch slot issues nothing, and the trough slots are skipped.
  2. `recovered: 0`; `ballsInPlay` 0; no serve.
  3. The player plunges manually, the ball drains, and `ball_ended { tilted: true }` follows. **Outcome: recovers (player).**

**(d) Where the design had to assume an answer.**
- `DECISION DEPENDENCY: DW-241 — the spec assumes the manual plunger stays live under Tilt and game over (c_autolaunch is never disabled, today's shipped behaviour); if the author decides "disable the plunger under Tilt/game over" instead, a ball resting on the plunger tip while tilted becomes a hard hang this ball search does not recover — S0 (DW-222 reopens) because the search needs ballsInPlay > 0, and S1 because RecoverCommand keeps a ball inside bd_shooter — and so does a tilted recovery's replacement served into the lane; closing both needs a tilted recovery to end the ball (ball_ended tilted:true) instead of serving, a tilted ball arriving at or resting in bd_shooter to end the ball, and startBall() to re-enable c_autolaunch alongside HARDWARE_COILS.`
- `DECISION DEPENDENCY: DW-241 — the search's autolaunch slot is suppressed while tilted, which is neutral: under today's tree it keeps 2.11's "no autolaunch into a tilted playfield" promise, and under a disable decision the coil gate would swallow it anyway; nothing changes either way.`
- `DECISION DEPENDENCY: DW-244 — the spec assumes Start keeps its phase-only check (a new game can begin with a voided ball still live); if the author decides "refuse Start until balls are home", nothing here changes (the search is phase-gated, and the Attract-to-game leftover it could despawn simply never occurs); if the author decides "reuse the resting ball", nothing here changes either (RecoverCommand keeps a ball inside bd_shooter, and neither the trough slot nor the recovery serve fires into an occupied lane).`
- `DECISION DEPENDENCY: DW-222 — resolved by 2.11 on the premise that the stranded shooter-lane ball is manually plungeable; this spec keeps that premise (it adds no disable) and does not add automatic recovery for DW-222's shape (ballsInPlay 0); if DW-241 is decided "disable", DW-222 reopens as the S0 hard hang above.`

## Verification

**Commands.** Export `BLENDER="C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe"` first in every shell. `0 skipped` is the proof it was exported.
- `pnpm typecheck`: exits 0 across all three tsconfigs. A missing `describeEvent` arm fails here first.
- `pnpm test`: 0 failing, **0 skipped**. Measure the baseline at your own tree before editing; the epic context records 117 files and 1971 tests at 2.11's close, not to be transcribed. Account for the delta: three new test files plus new cases.
- `pnpm lint:boundaries`: `OK -- N .ts file(s)`, with N one higher than the baseline you measure (`ball-search.ts`). A device-name literal anywhere under `src/` outside `dragonwar.ts` fails as `no-device-name-literal`.
- `pnpm check:headers` and `pnpm check:attributions`: exit 0. `ball-search.ts` carries the GPL-3.0 header.
- `pnpm check:ad7`: exit 0 with **exactly 3** passing tests.
- `pnpm check:corridor`: exit 0.
- `pnpm check:reachability`: exit 0 over its 52 cases.
- `git ls-files --others --exclude-standard test/`: only the three new test files. The golden harness must never appear.
- `git diff --stat -- public/assets/`: empty.
- `git diff -- src/sim/table/dragonwar.ts`: only the `slingWiring` block.

**Manual checks:**
- **Structural golden comparison (authoritative).** For each golden, parse the JSON at `efe14f5` and at HEAD and compare per field.
  - `header.gameStart.tuning` gains exactly four blocks, in `resolveTuning()` order.
  - `header.tableHash` changed.
  - `notes` is a strict append.
  - Every other field is deeply equal: `assetHash` `ab163ff`, `physicsVersion` `v1-ce6772ef`, `tickHz`, `physicsSeed`, `gameStart.{seed,adjustments,highscores}`, `transitions`, `coilPrologue`, `durationTicks`, `expectedHash`, `expectedGameStateHash`, and, for `roll-and-drain`, `checkpointTicks` and `expectedCheckpointHashes`.
  - Never a substring grep: the appended `notes` would trip it.
- Confirm `HARDWARE_COILS` is unchanged (7 coils) and still excludes `c_autolaunch` and `c_dragon_bank_reset`.
- Re-read `machine.ts:85-91`, `loop/index.ts:9-15, 30-34, 244-250` and `rules/index.ts:4`, and confirm each now describes the four-argument form rather than predicting it.
- Browser smoke, the lead's. This is the one user-visible behaviour: press Start, tap the plunger for well under 100 ms, watch the ball roll back onto the tip, and wait. About 15 s later the machine launches it by itself. It is not rendered as a plunger (DW-249), but the ball's own motion is visible.

**Rule 19 mutations — one per AC.** State the expected red before each run. Revert from a saved copy, never with `git checkout --` or `git stash`, and confirm `git status --short` and `git diff --stat` are unchanged.

| AC | Mutation | Expected red |
| --- | --- | --- |
| AC 1 | Change the start check `>=` to `>` | The bound probe reddens: no event at O+15000. |
| AC 1 | Set `ballSearchMs` to `1` in `tuning.ts` | The same test reddens, proving the tunable is on the path. |
| AC 1 | Swap the sling and pop stages | The order assertion reddens. |
| AC 3 | Make `recover()` also despawn the entry-zone ball | AC 3's ball count and AC 8's `count: 0` both redden. |
| AC 3 | Drop the shooter-empty guard on the trough slots | AC 3's single-ball assertion reddens: two balls. |
| AC 4 | Fold closures into the origin only when the search is idle | The cancel test reddens: the Recover still arrives. |
| AC 4 | Count `button_pressed` as activity | The non-playfield row reddens. |
| AC 5 | Remove the `device_overflow` branch | The overflow case reddens: no pulse. |
| AC 5 | Make `eject_failed` also pulse | The tolerance case reddens. |
| AC 6 | Remove the search's tilt guard | The tilted twin reddens: an autolaunch pulse appears. |
| AC 6 | Drop the `phase === 'game'` conjunct | The Attract and game-over rows redden. |
| AC 7 | Delete the non-parking device's stage | AC 7 reddens: the ball stays on the tip for the whole run. |
| AC 8 | Remove the shooter-occupied check on the recovery serve | `snapshot.balls.length` reads 2. |
| AC 9 | Have the loop drop `recoverCommands` | No `ball_missing` ever arrives. |
| AC 10 | Have `ball-search.ts` push `pulse TABLE.dropBankResetCoil` directly | The "controller emits no reset command" unit assertion reddens. |
| AC 11 | Make `applyPulses` a no-op | The kick assertion reddens; the disabled control stays green. |
| AC 12 | Revert one golden's `gameStart.tuning` | `StaleReplayHeaderError` on exactly that golden. |
| AC 12 | Remove one key from `scalarKeys` | The ratchet reddens with its named message. |
| AC 13 | Template `event.tick` into a wrong arm | The executing assertion reddens. |

AC 2 and the blocked clauses of ACs 1 and 5 carry no mutation until the AD-18 decision is made.

## Auto Run Result

Status: blocked
Blocking condition: intent gap — AD-18. "[The Lock arbiter] alone pulses `c_mouth` … every Mouth eject is preceded by `ShowCommand show_dragon_mouth_open` and follows it by `mouthOpenLeadMs`." At efe14f5 there is no Lock arbiter, `TABLE.shows` is `{}` (so no `ShowCommand` can typecheck), `mouthOpenLeadMs` does not exist and `RulesStepResult.commands` is `readonly never[]`; the epic routes the Lock arbiter to Story 3.2 and forbids pre-building it. Three Story 2.12 clauses each require a `c_mouth` pulse that AD-18 forbids: AC 1's "then the Lock … ejects" (`bd_lock.ballSearchOrder` = pulse `c_mouth` ×2), AC 2 entire (its "skipped" assertion has no positive case without a search Mouth pulse), and AC 5's "`device_overflow` is answered with an immediate eject from that device" for `bd_lock` ("immediate" also contradicts AD-18's `mouthOpenLeadMs` lead). Recommended amendment (A): phase AD-18 as AD-8 was phased — until Story 3.2 builds the Lock arbiter, ball search issues nothing at `bd_lock`'s two slots and a `bd_lock` `device_overflow` is tolerated without an eject; move AC 2 and the two Lock clauses to Story 3.2's acceptance criteria. In this machine a Mouth pulse can never find a missing ball: a parked ball is removed from simulation and counted by its closed slot switch (AD-6), so the pulse either answers `eject_failed` or releases a counted locked ball whose `ballsInPlay` accounting is 3.2's (DW-221). Alternative (B): 2.12 builds AD-18's Mouth-eject primitive — a `show_dragon_mouth_open` `TABLE.shows` entry, a `mouthOpenLeadMs` tunable, a `ShowCommand` channel from rules, and `ballsInPlay` +1 for a Mouth eject into play — with an AD-18 amendment naming ball search and the overflow answer as sanctioned requesters; that pre-builds part of 3.2's arbiter against the epic's routing. Every other clause of the story is planned in full in this spec, so re-planning after the decision changes only the `bd_lock` slots, AC 2 and the `bd_lock` overflow row.

### Plan-stage record, 2026-09-10

- **Dispatch:** `2-12-ball-search Halt after planning.`; the committed `epic-2-context.md` (efe14f5) was reused, not recompiled. The continuity source is `spec-2-11-tilt-warnings-tilt-and-slam-tilt.md` (`done`). The ledger slice for `2-12-ball-search` is empty. The tree was clean on `DW-1-epic2` at the version-control check.
- **Measurement:** one scratch probe, run from the scratchpad with its own vitest config and never placed under `test/`; `git status --short` was empty afterwards.
  - A manual plunge held 1, 5, 20, 50 or 100 ticks at production pitch rolls back onto the plunger tip, and `bd_shooter` reads occupied again with `ballsInPlay` 1.
  - At a pitch-0 override a plunged ball comes to rest near (58, 391) with no events for 30,000 ticks.
- **Proposed spine writes (lead-owned, Rule 20):** AD-4 (the `rules.step` machine-report argument), and AD-19 (the drop-bank component's third trigger, a ball-search reset request). A third — an AD-18 phasing or amendment — follows from whichever option resolves the block.
- **Nothing committed.** The spec is the only file written in the repository.
