---
title: 'Story 2.12: Ball search'
type: 'feature'
created: '2026-09-11'
status: 'done'
baseline_revision: '7c25c4d1c5b6b866c7607831ee70819ede5025af'
baseline_commit: '7c25c4d1c5b6b866c7607831ee70819ede5025af'
review_loop_iteration: 0
followup_review_recommended: true
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
  - summary: >-
      A ball at rest at the Ramp entrance, near x 377-380, y 508, either
      rattles there without settling or sinks through the playfield deck and
      falls below the table. Either way it closes no switch and never drains.
      This is the only resting spot outside every switch zone that a
      whole-table grid search found.
    evidence: |-
      Measured 2026-09-11 at ddbd946, with src/ and public/ unchanged since
      efe14f5: machine level, production tuning, ball placed at rest.
      - The grid had 2346 placements at 15 mm spacing, and 11 of them came to
        rest outside every zone, all in this one cluster, 24.5 mm from
        s_ramp_enter. It was reached from starts along x 385, y 515-650, and
        from (400, 500).
      - Placed at (376.9, 508.5), the ball rattled between x 376.9 and 379.6 at
        up to 7 mm/s for all 45,000 ticks.
      - Placed at (370.9, 508.5), (382.9, 508.5) or (376.9, 502.5), z fell from
        13.5 to about -6.5 mm over 3,200-5,400 ticks, then fell below -200 mm
        (the probe's cutoff) by tick 3,515-5,756, with no switch closure. From
        (384.9, 568.5), z was already at -6.1 mm by 6,000 ticks.
      Not measured: whether real play reaches the spot (a failed Ramp shot
      rolling back is the likely path). After this story, ball search recovers
      either outcome, because RecoverCommand despawns every simulated ball
      outside a device. The gap in the deck itself is geometry, and no
      collision node was identified.
    location: >-
      public/assets/dragonwar.collision.json, the Ramp entrance deck near x 370-385, y 500-570
    severity: medium
  - summary: >-
      A commanded pop pulse (PopMechanics.applyPulses()) kicks only the
      FIRST ball its scan finds inside a pulsed pop's own skirt zone; a
      second ball simultaneously in the same skirt zone is silently left
      alone (the scan loop breaks on the first match).
    evidence: |-
      src/sim/physics/pops.ts's applyPulses(): `for (const ball of balls) {
      ... break; }` -- the break exits after resolving one ball, so a
      second genuinely co-located ball is never kicked and gets no
      coil_fire contact either. This story is single-ball throughout (AC 9's
      own Given is one ball); the only caller of applyPulses() is ball
      search's own commanded pop stage, reached after 15 s of total
      silence, so a second ball being simultaneously stuck in the SAME
      skirt zone cannot arise before multiball exists. Story 3.7 ("Quick
      multiball", this spec's own Consumed-by list) is the first story
      where two loose balls coexist.
    location: >-
      src/sim/physics/pops.ts, applyPulses() (task 8)
    severity: low
  - summary: >-
      applyDeviceEvents' DW-187 serve-pairing and applyRecovery()'s (a)-(d)
      dispatch are both skipped on the ball-save re-serve's own early-return
      path (ball-controller.ts's `return { ... }` inside the drain branch).
      The path's own comment justifies skipping (a) recover-report handling
      and (d) the search's own step() as harmless, but does not address (b):
      a `device_overflow` arriving in the SAME machine report as a
      ball-save re-serve's own drain tick would also go unanswered (no
      immediate eject pulse for that overflow).
    evidence: |-
      src/sim/rules/ball-controller.ts's ball-save early-return branch
      (task 14's own comment: "skipping (a)-(d) on this path is harmless --
      it runs only at ballsInPlay 0 ... a recover report cannot arrive on a
      save's drain tick"). That argument covers only the recover case;
      (c) eject_failed/broken are no-ops either way, so they are genuinely
      unaffected, but (b) device_overflow on a DIFFERENT ball device in the
      SAME report is not a no-op (Task 14(b) issues an immediate eject
      pulse for it) and is not addressed by the comment's own reasoning.
      Reaching this requires two balls interacting with ball devices on the
      exact same tick as a ball-save drain -- unreachable in this story's
      single-ball scope; relevant again once Story 3.7 introduces
      multiball.
    location: >-
      src/sim/rules/ball-controller.ts, the ball-save re-serve early return (task 14)
    severity: low
  - summary: >-
      The ball-search quiet-tick clock accrues whenever a pass object
      exists and the flipper is not held, without an explicit gate on
      "a ball is genuinely in play" for the ACCRUAL itself (only stage
      APPLICATION is gated by inPlayNow). Correctness for a ball-save
      re-serve's own transient ballsInPlay-0 gap (which does not call
      startBall()/reset(), unlike a normal ball rotation) rests on that gap
      being shorter than any plausible ball-search threshold, not on
      an explicit guard.
    evidence: |-
      src/sim/rules/ball-search.ts's step(): `if (!held && tick > pass.origin)
      { pass.quietTicks += 1; }` has no `inPlayNow` conjunct. A ball-save
      re-serve (ball-controller.ts's early-return branch) does not call
      ballSearch.reset(), because it is the SAME ball, not a new one
      (Story 2.9's own design). At default production tuning this is
      unreachable in practice: a ball-save window is a few seconds at
      most, while ball search only fires after 15 s of total quiet, so any
      pass old enough to be mid-schedule has already long outlived any
      ball-save window's own expiry. A pathological custom tuning
      (ballSaveMs approaching or exceeding ballSearchMs) could make the gap
      relevant; production tuning cannot.
    location: >-
      src/sim/rules/ball-search.ts, step()'s quiet-tick accrual (task 13, "The clock")
    severity: low
  - summary: >-
      sim/rules/ball-controller.ts's buildServingSetsByNonParkingEntry()
      and sim/rules/ball-search.ts's servesIntoOf() both independently
      re-implement the identical `(device as { readonly servesInto?:
      string }).servesInto` cast to read BallDeviceEntry's optional field,
      rather than sharing one typed accessor.
    evidence: |-
      Neither file imports from the other (AD-1's rules-internal boundary
      permits this), so the duplication is not itself an AD violation, but
      it is the same shape DW-149 forbids for hand-typed device/coil name
      lists, applied to a type-narrowing cast instead. A third consumer of
      BallDeviceEntry.servesInto would make this a real maintenance
      hazard (two divergence points instead of one); today there are only
      the two.
    location: >-
      src/sim/rules/ball-controller.ts:buildServingSetsByNonParkingEntry() · src/sim/rules/ball-search.ts:servesIntoOf()
    severity: low
---

<intent-contract>

## Intent

**Problem:** A ball that stops moving without draining ends nothing and starts nothing, so the game hangs for good. `RecoverCommand` exists only as a type (`src/sim/contracts/commands.ts:20-23`). No physics or loop code handles it, and `Machine.step()` returns no `recovered` count (`src/sim/physics/machine.ts:82-93`). Nothing measures switch silence, and no `ball_search_started` event exists. Rules never see physics' `eject_failed` or `device_overflow` at all: `sim/loop` folds them straight into `FrameOutput.events` (`src/sim/loop/index.ts:435`), because `rules.step(state, switchEvents, tick)` has no channel for them (`machine.ts:85-91`). The stall is reachable in ordinary play today, and this plan measured it: any manual plunge held 1–100 ticks at production pitch rolls back onto the plunger tip with `ballsInPlay` still 1 (DW-187 — in scope by decision 3).

**Approach:** The ball controller gets a ball-search sub-module, `src/sim/rules/ball-search.ts`. It starts after `ballSearchMs` with no `playfield_switch_closed`, while a game ball is in play; the timer pauses while either flipper button is held and resumes from where it paused on release (decision 6). It walks a structurally derived stage list at `ballSearchStepMs` intervals:
1. the slings (a new `TABLE.slingWiring`);
2. the pops (`TABLE.popWiring`);
3. a bank reset, *requested* from the devices layer's drop-bank component, which alone pulses it (AD-19);
4. each ball device's `ballSearchOrder` pulse steps, ordered Lock, shooter, trough — the Lock's slots keep their times and issue nothing until Story 3.2 (decision 1);
5. exactly one `RecoverCommand`.

Physics honours `RecoverCommand` by despawning every ball outside a device. A ball resting in `bd_shooter`'s entry zone counts as inside its device. Physics returns the count. A new, optional fourth `rules.step` argument, the machine report, carries that count and physics' failure events into rules. The ball controller then emits `ball_missing { count }`, corrects `ballsInPlay` to 0, and serves a ball only when the shooter lane is empty, so it never stacks a second ball on the plunger tip.

**Author decisions, 2026-09-11 (Story 2.12 spec gate, relayed by the orchestrator) — binding on this re-plan:**
1. **AD-18 is phased, on AD-8's precedent.** Until Story 3.2 builds the Lock arbiter, ball search issues NOTHING at `bd_lock`'s `ballSearchOrder` steps, and a `bd_lock` `device_overflow` is tolerated without an eject. AC 1's Lock eject, all of AC 2 (the `c_mouth` skip for an active mode's `timerTicks`) and AC 5's Lock-overflow eject moved to Story 3.2 (`epics.md`, both blocks amended; AD-18 amended). Deciding fact: a ball parked in the Lock is out of the simulation and counted by its closed slot switch (AD-6), so it is never missing and a search Mouth pulse could never find one.
2. **DW-241 is by-design; AD-5 amended.** The manual plunger shares the autolauncher's serving coil `c_autolaunch`, outside `HARDWARE_COILS` by design (DW-74), so Tilt, game over and Attract leave it live. This story adds NONE of the three tilt additions the coupling trace listed (no tilted-recovery ball end, no end-on-shooter-arrival while tilted, no `c_autolaunch` re-enable in `startBall()`).
3. **DW-187 is IN this story's scope.** Fix the rolled-back-ball double count: a weak manual plunge rolls back onto the plunger tip still counted in play, a second launch of the same ball counts it twice, and after its drain `ballsInPlay` stays 1 with no ball and no `ball_ended` — a hard hang at today's tree. Rule 19: the pinning test IS the lead's two-weak-plunge probe (`createLoop()`, `NO_BALL_SAVE` tuning, production pitch: Start; a 20-tick plunge emits one `ball_launched`, the ball leaves the lane and rolls back to `deviceSlots.bd_shooter [true]`; a full plunge of the same ball; drain) — it must be observed RED on today's code before the fix (today: `ballsInPlay` 1 after the roll-back, 2 after the second launch, 1 after the drain, no `ball_ended`) and green after. If the fix moves any golden's trajectory, the re-record is PRE-AUTHORISED for this story on the standing condition: traced correct, and each golden must still assert its own subject, verified structurally field by field. A header-only golden refresh needs no grant.
4. **Spine writes approved and made at this gate:** AD-19 (ball search REQUESTS the bank reset; the drop-bank component stays the only caller of `c_dragon_bank_reset`), AD-4 (an optional fourth `rules.step` argument carrying physics' `recovered` count and device failure events), and the two tunables `ballSearchMs` 15000 (PRD FR-23) and `ballSearchStepMs` 250 (authored).
5. **DW-244 is NOT decided** — Start's meaning with balls not home belongs to the decision sheet or Story 2.13. The search is phase-gated to `game`; do not design Start semantics here.
6. **A held flipper suspends the ball-search timer** (author decision 2026-09-11, option (c), chosen against the lead's and the orchestrator's recommendation (b); PRD FR-23 carries the consequence note). While EITHER flipper button is held, the search timer PAUSES; on release it RESUMES from where it paused — pause, not restart. A flipper press does not restart the timer. How a hold that begins while a pass is already running is treated is the planner's to design; if that is a product choice, flag it `LEAD CHECK:` under Design Notes. Only the flipper-hold behaviour changes: the shooter lane, the trough slots, the tilt bob, the slam and Start still never start, delay or cancel a search. Seam (Rule 20, AD-19 amended 2026-09-11): the devices layer emits `button_released { button }` alongside `button_pressed { button }`, and ball search keeps which flipper buttons are held in its own closure state. Test constraints (Rule 19, binding):
   - **AC 4 — the held-flipper pause.** The negative (held, no search, well past 15 s) is paired with its positive in the SAME test: release, then the search lands at the correctly RESUMED tick. Use the real cradle (Design Notes, *The real-loop stuck ball*: settled under 1 mm, 76.9 mm from the nearest switch zone) as the negative's subject. Named mutation: remove the pause, so the held ball is searched at 15 s — observe it red. LEAD NOTE: on release a cradled ball rolls off the flipper and reaches a switch or the drain within a fraction of a second, so the resumed-tick positive may be unobservable with the cradle alone. If so, observe the pause/resume pair on AC 2's stuck ball with an empty-flipper hold in the same test, keep the cradle as the negative's subject, and mark the deviation `LEAD CHECK:` in Design Notes — never silently drop either half.
   - **AC 2 — the full search-and-recover path.** The cradle can no longer drive it (it is held, so the timer is paused). Use a TEST-ONLY stuck ball that goes through the REAL physics recover path (`RecoverCommand`, then the physics handler this story builds, then `recovered`), never a stubbed one. Place it genuinely outside every device and every switch zone, and PROVE the placement is stable (settled, spread, distance to the nearest zone), as the cradle measurement did, so the premise is not vacuous. Named mutation: disable recover (the physics handler despawns nothing) — the ball is not freed and the test goes red. Any test-only placement seam must not reach a production code path or the goldens; say where it lives.

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
  - the Start and plunger buttons, and a flipper button's press edge as a closure (a flipper HOLD pauses the timer instead — decision 6);
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
- **Any `c_mouth` pulse from ball search or from the overflow answer is required** (AD-18 is phased: nothing pulses `c_mouth` before Story 3.2 — decision 1).
- `check:ad7`, `check:corridor` or `check:reachability` goes red.

**Never:**
- Never pulse `c_mouth`, add `show_dragon_mouth_open` to `TABLE.shows`, add `mouthOpenLeadMs`, or widen `RulesStepResult.commands` beyond `readonly never[]`. The Lock arbiter, its show and its lead are Story 3.2's (AD-18). The epic routes them there (AD-18 phasing, decision 1).
- Never pulse `c_dragon_bank_reset` from the ball controller or `ball-search.ts`. Request it; the drop-bank component pulses it (AD-19).
- Never serve a ball into an occupied shooter lane. Neither the search's trough step nor the recovery serve fires while `machine.deviceSlots` reads the non-parking device occupied. That is DW-244's stacking shape, reproduced live at 2.11's smoke.
- Never let `RecoverCommand` despawn a ball inside a non-parking device's entry zone. Never add `s_shooter_lane`, a slot switch, a button or a cabinet sensor to `PLAYFIELD_SWITCHES`, which stays 28.
- Never disable `c_autolaunch` anywhere, and never add it to any disable batch. That is DW-241's decided call (by-design, AD-5 amended): the manual plunger stays live on it. Never issue the search's autolaunch step while `machine.tilt.tilted`: 2.11's shipped promise is "no autolaunch into a tilted playfield" (`ball-controller.ts:653`).
- Never decide or pre-empt these author-sheet entries: DW-244 (escalated), DW-204, DW-212, DW-221, DW-226, DW-232, DW-236, DW-237, DW-240, DW-245, DW-246, DW-251, DW-255 (escalated). A search-served ball touches the skill-shot and scoring-under-Tilt questions (DW-232, DW-246) only through the existing modes, and no test here asserts what the skill shot does with it. Never build a commanded sling kick.
- Never compute an expected value from `ballSearchMs` or `ballSearchStepMs` by re-importing it. Never derive a non-vacuity guard's expected count from the helper under test (vacuity #44).
- Never assert a negative ("no pulse", "not served", "search does not start", "no loop") without establishing its positive in the **same** test with the same instrument. Never compare a value with itself (vacuity #51).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Search starts on the bound | `phase: 'game'`, `ballsInPlay` 0 → 1 by `ball_launched` at tick O, then no `playfield_switch_closed` | nothing at O+14999. At O+15000: `ball_search_started { tick: O+15000 }` once, plus stage slot 0 (`pulse c_sling_l`) in the same tick's `coilCommands` | No error expected |
| Stage schedule | the same run, no closure | slot k is issued at O+15000+250·k, for k = 0..10: `c_sling_l`, `c_sling_r`, `c_pop_1`, `c_pop_2`, `c_pop_3`, bank-reset request (k=5), Lock slots k=6,7 issue nothing (AD-18 phasing, decision 1), `c_autolaunch` (k=8), `c_trough_eject` (k=9, 10; each only if the shooter lane is empty). Exactly one `RecoverCommand` at O+17750 | No error expected |
| Bank reset through its owner | slot k=5 at tick S | the ball controller's own `coilCommands` never name `c_dragon_bank_reset`. The merged `RulesStepResult.coilCommands` carries it at S+1, from the devices layer. The real-loop `contactEvents` carry `bank_reset` at S+2 | No error expected |
| Closure cancels | a search running; `playfield_switch_closed` at tick C | no further slot command and no `RecoverCommand` from that pass. The next `ball_search_started` is at exactly C+15000 | No error expected |
| Non-playfield closures | during the quiet window: `s_shooter_lane` close, a trough slot close, `button_pressed` (Start), `tilt_bob_closed` | none delay or cancel; `ball_search_started` still lands at O+15000 | No error expected |
| Flipper held pauses (decision 6) | quiet since origin O; a flipper button pressed at P (`button_pressed`) and released at R (`button_released`), P > O | nothing while held, however long; `ball_search_started` at exactly R + (15000 - (P - O)) — resumed, not restarted | No error expected |
| Not in play | `ballsInPlay` 0 (a served ball resting in `bd_shooter`, awaiting its plunge), or `phase` `'attract'` / `'game_over'` | no `ball_search_started`, ever | No error expected |
| Tilted | `machine.tilt.tilted` true, ball in play, quiet | the search runs. Sling and pop pulses are issued, and physics swallows them (disabled; no event). The autolaunch slot issues nothing. The trough and bank slots are unchanged | No error expected |
| Recover, loose ball | recover consumed by physics at tick R+1; one ball loose, none in the shooter lane | physics despawns it (`recovered: 1`). At R+1: `ball_missing { count: 1 }`, `ballsInPlay` 0. If the shooter lane is empty, one `pulse c_trough_eject`; if occupied, none | No error expected |
| Recover keeps the shooter ball | the only ball rests in `bd_shooter` (`deviceSlots.bd_shooter` `[true]`), `ballsInPlay` ≥ 1 | `recovered: 0`: the ball is inside its device. `ball_missing { count: 0 }`, `ballsInPlay` 0, no serve, and the search goes idle, so no second pass follows | No error expected |
| Recover outside a game | a recover issued at R, then `phase` → `'attract'` at R (a Slam) | at R+1: `ball_missing` emitted and `ballsInPlay` corrected, but no serve | No error expected |
| `device_overflow` on `bd_trough` | machine report `failures: [{ device_overflow, device: bd_trough }]` | a `pulse c_trough_eject` on the same tick, and nothing else changes | Must not throw |
| `device_overflow` on `bd_lock` | the same, for `bd_lock` | tolerated, no command (AD-18 phasing, decision 1) | Must not throw |
| `eject_failed` / `broken` | report failures for each ball device, and `broken { device: c_pop_1 }` | no command, no event, the same `GameState` reference | Must not throw |
| `ball_missing` downstream | the controller's own `ball_missing` reaches `modeStack.step()` and the real Backglass fold | no throw; the mode stack's state is unchanged by it | Must not throw |
| Restarted timeline | an origin mark at tick 9000, then `tick` restarts at 1 | the mark is discarded, so no search fires early from a stale mark | No error expected |
| Commanded pop kick | a ball resting inside `s_pop_1`'s skirt zone, an enabled `pulse c_pop_1` | the ball gains velocity radially away from `col_pop_1`'s centroid, with one `coil_fire` contact. Disabled: no kick | No error expected |
| DW-187: the served ball | real `createLoop`, `NO_BALL_SAVE_TUNING` as both `GameStart.tuning` and the loop's `tuning`, production pitch; Start | the serve's trough slot opens and `deviceSlots.bd_shooter` reads `[true]` on the same tick (tick 3, measured); `ballsInPlay` 0 | No error expected |
| DW-187: a weak plunge rolls back | the served ball, plunger held 20 ticks | exactly one `ball_launched`; `ballsInPlay` 1 while the ball climbs; the ball rolls back and `bd_shooter` reads `[true]` again; from that tick `ballsInPlay` is **0** (today: 1) | No error expected |
| DW-187: the same ball re-plunged | the rolled-back ball, plunger held 1200 ticks | exactly one further `ball_launched`; `ballsInPlay` **1** (today: 2) | No error expected |
| DW-187: its drain ends the ball | `c_pop_1..3`, `c_sling_l`, `c_sling_r` disabled before the re-plunge; the ball drains | on the tick a trough slot closes: `ball_ended { player: 0, tilted: false }` arrives and `ballsInPlay` reads 0; ball 2 starts (today: `ballsInPlay` stays 1, no `ball_ended`, no ball on the table) | No error expected |
| Served arrival while a ball is counted | one batch: `device_ball_left { bd_trough }` (whose `servesInto` is `bd_shooter`'s entry switch) and `device_ball_entered { bd_shooter }`; `ballsInPlay` 1 | `ballsInPlay` stays 1 and `applyDeviceEvents` returns the same `MachineState` reference, in either event order | No error expected |
| Unserved arrival (a ball returning to the lane) | `device_ball_entered { bd_shooter }` with no serving device's `device_ball_left` in the batch | `ballsInPlay` 1 → 0; at 0 it stays 0 (floored, same reference) | No error expected |
| The Lock's search slots (decision 1) | the contract's "Stage schedule" run | nothing is issued at O+16500 or O+16750, and no command in the run names `c_mouth`; the same run issues `pulse c_autolaunch` at O+17000 and `pulse c_trough_eject` at O+17250 | No error expected |
| `device_overflow` on `bd_lock` (decision 1) | one machine report carrying `device_overflow { bd_lock }` and `device_overflow { bd_trough }` | exactly one command that tick, `pulse c_trough_eject`; nothing for `bd_lock` | Must not throw |
| Goldens | the change is complete | all five: only `header.tableHash`, four `gameStart.tuning` blocks and appended `notes` differ | `StaleReplayHeaderError` if missed |

</intent-contract>

## I/O & Edge-Case Matrix — re-plan supplement (2026-09-11)

This section is only a pointer now. The lead folded the supplement's rows into the intent contract's matrix at the decision-6 re-dispatch. This plan adds no rows outside the contract. It pins the held-flipper cases the contract leaves to the planner in AC 4 (4c and 4d) and AC 14, and designs them under Design Notes, *The held flipper (decision 6)*.

## Code Map

Every anchor below was re-read at `ddbd946`. `src/`, `test/`, `tools/` and `public/` are unchanged since `efe14f5`.

**Rules: ball accounting, the search's home, and its consumers**
- `src/sim/rules/ball-controller.ts`: the owner of ball accounting and serving.
  - `applyDeviceEvents` `:44-73` is **where DW-187 is fixed**.
    - Today it increments on every `ball_launched` (`:47-48`) and decrements only on a parking entry (`:58-66`).
    - Its `bd_shooter` branch is a no-op, justified by the comment at `:50-55` ("a ball merely resting in the shooter lane is still IN PLAY"). The fix makes that comment false, and the file header at `:16-31` repeats the claim.
    - Callers: `rules/index.ts:245`, and `test/rules-devices.test.ts:782-812`, which pins the same-reference return and the parking floor. Both stay green.
  - `ballServingCoils`, `hardwareCoils` and `HARDWARE_COILS` (`:148-178`) must not change.
  - `shooterLaunchCoil()` (`:198-207`) is the structural-derivation pattern to copy.
  - `createBallController` is at `:261`, with closure state at `:297`, `:367` and `:388`.
  - `startBall()` (`:436-505`): the resets are at `:444-453`, and the serve pulse at `:490` is the recovery serve's model.
  - `step()` begins at `:507`.
    - Its first work, the bonus-step drain, is at `:518`, and the Start check is at `:567`.
    - The `ball_launched` arming loop is at `:621-666`. Its save-arrival tilt guard at `:653` is the precedent for the search's autolaunch guard.
    - The drain branch is at `:673-772`, and the game-over disable is at `:738-742`.
    - **The ball-save re-serve returns early at `:691-696`**, before the final return at `:774`. Anything placed after the drain handling is skipped on that tick. That is why the search's edge fold goes at the top of `step()` (task 14).
- `src/sim/rules/index.ts`: the composition root.
  - `RulesStepResult` is at `:107-147`: `commands: readonly never[]` at `:124`, `coilCommands` at `:132`. `Rules.step` is at `:149-156`.
  - `createRules` spans `:222-306`. `pendingLifecycleEvents` at `:231` is the next-tick forwarding precedent for bank-reset requests.
  - The stages run in this order:
    - `devicesLayer.step` (`:237`);
    - `applyDeviceEvents` and `deriveDeviceSlots` (`:245-250`);
    - tilt (`:259`);
    - bonus credit (`:268`);
    - the ball controller, which receives this tick's `DeviceEvent`s (`:270-271`);
    - modes (`:279`).
  - Then `events` (`:294`) keeps only `ball_launched` of the device events, and `coilCommands` is at `:300`.
- `src/sim/rules/devices/index.ts`:
  - `buildFlipperSideBySwitch()` (`:157-164`) reads `TABLE.flipperButtonWiring`, the structural source for "the flipper buttons".
  - `buildButtonSwitches()` (`:166-175`) is the `settleClass: 'button'` set, bound at `:268`.
  - `buildPlayfieldSwitches` (`:190-213`) derives the 28 switches, exported as `PLAYFIELD_SWITCHES` (`:223`).
  - `step(switchEvents, lifecycleEvents, tick)` is at `:287`.
  - The shooter lane (Stage 1): a close emits `device_ball_entered` (`:315-317`); an open emits `device_ball_left` plus `ball_launched` (`:318-322`). Parking slots are at `:329-345`.
  - **Stage 3** spans `:365-404`. `if (!event.closed) continue;` at `:368-370` drops every opening edge. `playfield_switch_closed` is at `:390-392`, `lane_change_pressed` at `:397-400`, and `button_pressed` at `:401-403`, closed edges only. **`button_released` goes here (task 12).**
  - The drop bank is at `:421-423`, and the lifecycle loop at `:428-430` is where the reset request joins.
- `src/sim/rules/devices/events.ts`:
  - `FlipperSide` is at `:111-112`, and `ButtonPressedEvent` at `:141-145`.
  - The `DeviceEvent` union spans `:179-195`.
  - No exhaustive `never` switch over `DeviceEvent` exists under `src/`: the only `never` tail is `lamps.ts:128`, over a different type. A new member therefore breaks no typecheck arm.
- `src/sim/rules/devices/drop-bank.ts`: `DropBankTracker` (`:31-36`), `pulseResetCoil` (`:55-57`), `onBallWillStart` (`:92-94`). It is the sole owner of the reset pulse, and the ball-search request entry point goes beside `onBallWillStart` (AD-19, amended).
- `src/sim/rules/tilt.ts`: the precedent for a stateful controller. It is a factory closure, with reset-safety at `:88-97` and ms→ticks resolved once at `:81-82`.

**Physics**
- `src/sim/physics/machine.ts`:
  - `MachineStepResult` is at `:82-93`; its comment at `:85-91` must be rewritten. `semanticEvents` is `DeviceFailure[]`.
  - `Machine.step` is at `:96`.
  - `PRE_STEP_HARDWARE_RULES` (`:135-146`) gains two rows. `test/hardware-rule-seam.test.ts:138-213` requires each `receiver.method(` to appear before `physics.step();` and never after it.
  - `coilEnabled` is at `:247-264`. The command partition is at `:267-276`, and its `else` is a catch-all.
  - Also in `step`: the plunger gate (`:306`), `enabledPulses` (`:318-319`), the drop reset (`:323`), the `before` map (`:325`), `physics.step()` (`:338`) and the return (`:415-463`).
  - `get balls()` (`:468`) returns `physics.balls`, the live array. The AC 2 test seam writes one ball's state through it (Design Notes).
- `src/sim/physics/devices.ts`:
  - `DeviceFailure = EjectFailedLike | DeviceOverflowLike` (`:67-79`), so physics never emits `broken`.
  - `justEjected` (`:258`) and `overflowReported` (`:272`): prune removed balls from both.
  - `spawnBall` is at `:409-421`.
  - `applyCommands` spans `:423-487`. An empty parking device answers `eject_failed` at `:437-440`, and a parking eject opens its slot switch at `:448`.
  - `launch()` (`:490-510`) answers `eject_failed` into an empty lane at `:497-499`. `isBallInsideZoneNow()` (`:512-519`) is the "inside the shooter" test that `recover()` must reuse.
  - `detectEntries`: overflow is at `:607-618`, and the only existing removal is at `:624`.
- `src/sim/physics/switches.ts`: zone tests run on each ball's **swept segment within one step** (`:32`, `:126`), and the `before` position comes from inside `machine.step` (`machine.ts:325`). So writing a ball's position between two steps sweeps nothing across the table.
  - A MAKE latches on the tick it is first observed (`:169-175`, DW-67). Only the break is debounced (`:177-188`).
  - The trough's eject pose lies inside its `servesInto` zone (`TABLE.ballDevices.bd_trough.servesInto`, `dragonwar.ts:364`, gated by `test/device-eject-pose.test.ts`).
  - Together these explain why a serve's slot opening and its lane closing arrive in **one** rules batch, which is the DW-187 fix's premise.
- `src/sim/physics/pops.ts`: the MAKE-edge trigger (`:130-156`) and the radial impulse (`:158-206`), to be factored out for `applyPulses`. `createPopMechanics` holds each pop's `{coil, switchName, zones, centroidMm}` (`:112-119`) but no ball list, so pass `physics.balls`.
- `src/sim/physics/game/player-physics.ts:187-212`: `removeBall` throws on an unregistered ball, but it is safe for several distinct balls before `physics.step()`.

**Loop and contracts**
- `src/sim/loop/index.ts`:
  - `buttonSwitchByAction()` (`:125-144`) and `buttonSwitchEdges()` (`:153-161`): **both edges of all four buttons already reach rules**.
    - `previousFrame` starts at `NO_FRAME`, all released (`:276`), and persists for the life of the loop (`:413-415`), across balls and games.
    - These edges are undebounced and never pass through the switch tracker, so rules see exactly the frame's button levels.
  - `CreateLoopOptions` (`:225-253`) takes `collisionDoc: unknown`. The AC 2 and AC 4 test instrument uses this existing parameter; production code needs nothing new.
  - `pendingCommands` (`:282`) holds `{coil, action}` only.
  - The two `state` writes are at `:284` and `:433`.
  - The per-tick body spans `:410-462`:
    - `commandsForThisTick` (`:417-423`);
    - `machine.step` (`:425`);
    - `rules.step` (`:428`);
    - failures pushed into `events` (`:435`);
    - the coil queue (`:459-461`).
  - `pulseCoil` and `setCoilEnabled` are at `:468-474`, and `advance`, `pulseCoil` and `setCoilEnabled` are the whole `Loop` (`:476`).
- `src/sim/loop/replay.ts`: `runReplay` (`:336-417`), `tableHash` (`:145-147`), `PHYSICS_VERSION` (`:188-214`) and `StaleReplayHeaderError` (`:240`).
- `src/sim/contracts/commands.ts`: `CoilCommand` (`:12-17`) and `RecoverCommand` (`:20-23`). There is no union yet, although the header at `:3` says "closed command union".
- `src/sim/contracts/events.ts`: `BallMissingEvent` (`:177-181`), the failure types (`:248-266`) and `SemanticEvent` (`:273-290`).
- `src/sim/table/names.ts:57-58` binds the contracts to the `TABLE` unions.

**Table and tuning**
- `src/sim/table/dragonwar.ts`:
  - `bd_trough` (`:330-378`): `ballSearchOrder` at `:352-356`, `servesInto` at `:364`.
  - `bd_shooter` (`:383-396`): `entry` at `:385`, `ballSearchOrder` at `:389-392`.
  - `bd_lock` is at `:404-423`. `TABLE.lockLaneWiring.device` names the Lock arbiter's device (read at `devices/index.ts:273`); it is the structural handle for the Lock skip.
  - `popWiring` (`:498-501`) is the shape `slingWiring` mirrors. `dropBankResetCoil` is at `:521`.
  - `flipperButtonWiring` (`:589-592`) is the source for the search's held set.
- `src/sim/table/tuning.ts`:
  - `entry()` is at `:49`, and `defaultPitchDeg` and `pitchMinDeg` at `:269-270`.
  - The ball-save block (`:344-358`) and the tilt block (`:367-377`) set the style and placement for the two new entries.
  - `resolveTuning` spans `:809-866`, and `shotWindowTicks` is at `:898`.

**Test infrastructure**
- `test/util/switch-script.ts`: `RunRulesScriptOptions` (`:170-179`) and `runRulesScript` (`:228-251`), which steps every tick from 1. The options gain `machineReports`, and the result gains `recoverCommands`.
- `test/rules-devices.test.ts`:
  - `:544-547` (`s_plunger`) and `:549-552` (`s_start`) close at tick 10, open at tick 20, and pin **the close only**. AD-19's `button_released` changes exactly that, so both are amended (task 12, AC 14).
  - `:554-574` script flipper closes only and stay green.
- `test/backglass-integration.test.ts:35, 53-57, 81-83`: the `NO_BALL_SAVE_TUNING` literal, the five hazard coils and the `setCoilEnabled` pattern.
- `test/plunger.test.ts:58-66, 87-91`: the plunge-by-`InputTransition` pattern.
- File-scoped `vi.resetModules()` + `vi.doMock(<src module>, importOriginal)` is established precedent: `test/cabinet-substep.test.ts:44`, `test/machine-serve-drain.test.ts:94`, `test/rules-devices.test.ts:642`. `vitest.config.ts` sets no `isolate: false`, so each test file runs in its own module registry.
- `test/machine-serve-drain.test.ts:293-325`: ball injection onto `machine.balls` for a machine-level test (AC 8's model).
- `test/rules-lifecycle.test.ts:401-410` drives a shooter arrival at `ballsInPlay` 0. It stays green unchanged, because the fix floors at 0.
- `test/rules-tilt.test.ts:390, 807, 845, 872, 913` and `test/rules-ball-save.test.ts:194, 658` close `s_shooter_lane` only after a drain has taken `ballsInPlay` to 0. They stay green unchanged.
- `test/rules-devices-headless.test.ts:193-208`: `ENTRY_FILES`, where the new headless file goes. The completeness ratchet is at `:222-243`.
- `test/contracts.test.ts:240-339`: `describeEvent`. Its `never` tail is a typecheck gate, and each arm needs an executing assertion.
- `test/tuning.test.ts:27-110`: `scalarKeys` and its ratchet.
- `test/replay-goldens.test.ts:123` and `test/golden-line-endings.test.ts:23-29`: two independent lists of the five golden names.

## Tasks & Acceptance

**Execution:**
1. `test/rules-rollback-accounting.test.ts` (new, GPL-3.0 header): the DW-187 pinning test (AC 12). It drives a real `createLoop` with real input, using only APIs that exist today.
   - Write it and run it **before task 2**. It must fail on today's code at the roll-back assertion.
   - Record the observed values in `## Verification`'s Rule 19 log. Today's code gives `ballsInPlay` 1 after the roll-back, 2 after the re-plunge and 1 after the drain, with no `ball_ended`. Then do task 2.
2. `src/sim/rules/ball-controller.ts`, `applyDeviceEvents` (DW-187). Keep its signature, its event-order processing and its same-reference return.
   - Add a module-level map, derived from `TABLE`, from each non-parking device to the set of **parking** devices whose `servesInto` equals its `entry`. At this tree that is `bd_shooter` → `{bd_trough}`. `bd_shooter`'s own `servesInto` is excluded, because it is non-parking.
   - Before the loop, count the batch's `device_ball_left` events from each serving set.
   - A non-parking `device_ball_entered` consumes one of those counts if any remain: that is a served ball's arrival, and nothing changes. Otherwise it is a return to the lane, and it decrements `ballsInPlay`, floored at 0 like the parking decrement.
   - Rewrite the comments at `:16-31` and `:50-65` to say so.

   Checkpoint before task 3, with no golden file touched: `pnpm test test/rules-rollback-accounting.test.ts test/replay-goldens.test.ts test/rules-devices.test.ts test/rules-lifecycle.test.ts test/rules-ball-save.test.ts test/rules-tilt.test.ts` is green. The plan measured zero moved ticks in all five goldens (Design Notes). If a golden reddens here, run task 18's trace before anything else.
3. `src/sim/contracts/commands.ts`: add `MachineCommand<TCoil> = CoilCommand<TCoil> | RecoverCommand`, the AD-9 rules→physics union the header already names. In `src/sim/table/names.ts`, bind `MachineCommand` and `RecoverCommand` beside `CoilCommand`.
4. `src/sim/contracts/events.ts`:
   - Add `BallSearchStartedEvent { type: 'ball_search_started'; tick }` to `SemanticEvent`. As a start marker it is payload-complete (AD-9).
   - Add `MachineReport<TBallDevice, TDevice> { recovered: number | null; failures: readonly (EjectFailedEvent|DeviceOverflowEvent|BrokenEvent)[] }`. Document it as physics' per-step report, which the loop forwards to rules (AD-4, amended). `recovered` is `null` on every step that consumed no `RecoverCommand`.
   - Bind both in `names.ts`.
5. `src/sim/table/dragonwar.ts`: add `slingWiring: { c_sling_l: { switch: 's_sling_l' }, c_sling_r: { switch: 's_sling_r' } }` beside `popWiring`. This is AD-11 wiring and the only structural source for "the slings". It moves `tableHash` on purpose, and task 18 refreshes it.
6. `src/sim/table/tuning.ts`: add two top-level entries beside the tilt block.
   - `ballSearchMs: entry(15000, "PRD FR-23: 'If no switch closes for 15 s during play' (epics.md:64; the epic records it as an assumption)", 'unverified')`.
   - `ballSearchStepMs: entry(250, 'authored: no artifact states a per-step interval; long enough for a ball one pulse dislodges to close a playfield switch before the next pulse fires', 'unverified')`.

   `test/tuning.test.ts`: list both in `scalarKeys` with a Story 2.12 comment.
7. `src/sim/physics/devices.ts`: add `recover(tick): number` to `DeviceMechanics`.
   - It removes every ball in a **copy** of `physics.balls` whose centre is outside every non-parking device's entry zone (reuse `isBallInsideZoneNow`).
   - It prunes those balls from `justEjected` and `overflowReported`, and returns the count.
   - It emits no switch edge. The tracker recomputes zone state from movements, so any break edge comes from the tracker itself.
8. `src/sim/physics/pops.ts`: add `applyPulses(tick, pulses, balls)`.
   - It kicks every ball whose centre lies inside the pulsed pop's own skirt zone, with the same radial impulse as `applyPostSwitchEdges`, factored out rather than duplicated.
   - It emits one `coil_fire` contact per kick.
   - Only enabled pulses reach it (DW-74), so a disabled pop never kicks.
9. `src/sim/physics/machine.ts`, in `step`:
   - Accept `readonly MachineCommand[]`, and partition out `type === 'recover'` **before** the enable/disable branch. `CoilCommand` handling is otherwise unchanged.
   - When at least one recover was consumed, call `deviceMechanics.recover(tick)` once. It runs before `deviceMechanics.applyCommands(` and before the `before` map, so a same-tick serve is never despawned.
   - Call `popMechanics.applyPulses(tick, enabledPulses, physics.balls)` pre-step, after `enabledPulses`.
   - Return `recovered` (the count, or `null`), and merge the pop pulse's contacts into `contactEvents`.

   Elsewhere in the file:
   - Add two `PRE_STEP_HARDWARE_RULES` rows: `{ receiver: 'deviceMechanics', method: 'recover', pinnedBy: 'test/ball-search-physics.test.ts' }` and `{ receiver: 'popMechanics', method: 'applyPulses', pinnedBy: 'test/ball-search-physics.test.ts' }`.
   - Rewrite the `:85-91` comment: failures now also reach rules, through the loop.
10. `src/sim/loop/index.ts`:
    - Widen `pendingCommands` to also hold a recover. Queue each `rulesResult.recoverCommands` entry for the next tick (AD-4), and emit it in `commandsForThisTick` as `{ type: 'recover', tick }`.
    - Pass `{ recovered: machineResult.recovered, failures: machineResult.semanticEvents }` as `rules.step`'s fourth argument.
    - Keep `events.push(...machineResult.semanticEvents, ...)` unchanged.
    - Add no write to `state`. Update the header comment at `:9-15`.
11. `src/sim/rules/devices/drop-bank.ts`, `devices/events.ts` and `devices/index.ts`: AD-19's third trigger.
    - Add a rules-internal `BankResetRequest { type: 'bank_reset_requested'; tick }` to `devices/events.ts`. It is a lifecycle *input*, never a `DeviceEvent` or a `SemanticEvent`.
    - Add `onResetRequested(tick)` to `DropBankTracker`, beside `onBallWillStart`.
    - Widen the devices layer's lifecycle input to `readonly (BallWillStartEvent | BankResetRequest)[]`, and dispatch each kind to its entry point. `runSwitchScript`'s existing `BallWillStartEvent[]` argument stays assignable.
    - The physics reset's six `closed: false` edges clear the letter latch silently (`drop-bank.ts:74-80`), exactly as after a ball-start reset.
12. `src/sim/rules/devices/events.ts` and `devices/index.ts`: `button_released`, AD-19 as amended 2026-09-11 (Rule 20 already written by the lead).
    - Add `ButtonReleasedEvent { type: 'button_released'; button: SwitchName; tick }` beside `ButtonPressedEvent` and into the `DeviceEvent` union.
    - In Stage 3, where `!event.closed` currently `continue`s (`:368-370`), first emit `button_released` for an opening edge of any switch in `buttonSwitches`. Emit nothing else on an opening edge: no `lane_change_pressed`, no playfield event.
    - Update the Stage 3 comment and the file header at `:9`.
    - `rules/index.ts:294` already keeps device events out of `SemanticEvent`, so no `describeEvent` arm is owed.
    - Amend `test/rules-devices.test.ts:544-552` to the two-event form (AC 14).
13. `src/sim/rules/ball-search.ts` (new, GPL-3.0 header).
    - `createBallSearch(tuning)` resolves `ballSearchTicks` and `ballSearchStepTicks` once, via `shotWindowTicks()`.
    - At construction it builds the stage list structurally, in this order:
      1. `slingWiring` keys;
      2. `popWiring` keys;
      3. the bank-reset request;
      4. each device's `ballSearchOrder` `pulse` steps: parking devices with no `servesInto`, then non-parking devices, then parking devices with a `servesInto`;
      5. one recover.
    - It derives the flipper button set from `TABLE.flipperButtonWiring[*].switch`. It throws on a `TABLE` authoring defect: an empty `slingWiring`, `popWiring` or `flipperButtonWiring`, or a ball device with no `pulse` step.

    **API (the seam is split so no tick's edges are ever lost):**
    - `observe(deviceEvents, tick)`. It folds `playfield_switch_closed`: the closure becomes the new origin and cancels a running pass. It also folds the flipper buttons' `button_pressed` / `button_released` into the **held set**, a map from each held flipper button to its press tick. It runs on every tick, in every phase, whatever `ballsInPlay` reads.
    - `step(state, tick)` returns `{ events, coilCommands, recoverCommands, bankResetRequests }`.
    - `reset()` clears the timer and schedule for `startBall()`. It does **not** clear the held set (Design Notes, design point 1).

    **The clock.** Search time is the **quiet count** `q(t)`: the number of ticks `u` with `origin < u ≤ t` at which no flipper button is held, after tick `u`'s own edges are folded.
    - A tick with both buttons held counts once.
    - The origin is the latest of two ticks: the one where "a ball is in play" became true, and the latest `playfield_switch_closed`.
    - The search starts on the first tick where `q ≥ ballSearchTicks`. Slot `k` is issued on the first tick where `q ≥ ballSearchTicks + k · ballSearchStepTicks`, and the recover is the last slot. So a hold pauses the start and a running pass alike (design point 3).

    **Guards.** Each guarded slot keeps its time and issues nothing:
    - the slots of `TABLE.lockLaneWiring.device` issue nothing until Story 3.2 (AD-18, amended);
    - the non-parking device's slot issues nothing while `machine.tilt.tilted`;
    - each slot of a parking device with a `servesInto` issues nothing while the non-parking device whose `entry` is that `servesInto` reads occupied in `machine.deviceSlots`.

    **Closure state.** Every mark is a tick (origin, pause accounting, pass progress, each held button's press tick). A mark strictly greater than `tick` is discarded, as in `tilt.ts:88-97`. Apart from that closure state the module is pure.
14. `src/sim/rules/ball-controller.ts`, the search wiring.
    - Construct the search inside `createBallController`. Call `ballSearch.observe(deviceEvents, tick)` as the **first** statement of `step()`, ahead of the bonus-step drain at `:518`, so the save re-serve's early return at `:695` can never skip a tick's edges.
    - `step()` gains the `machineReport` parameter. After the Start and drain handling it does the following, in order:
      - (a) if `recovered !== null`, emit `ball_missing { count: recovered, tick }`. Serve one `pulse` of `TABLE.ballDevices.bd_trough.ejectCoil` only if `phase === 'game'` and the non-parking device reads empty;
      - (b) for each `device_overflow` on a parking device other than `TABLE.lockLaneWiring.device`, issue one immediate `pulse` of its `ejectCoil`. A Lock overflow is tolerated (AD-18, amended);
      - (c) treat `eject_failed` and `broken` as no-ops;
      - (d) call `ballSearch.step(...)` and merge its outputs.

      On the `:695` path, skipping (a)–(d) is harmless. That path runs only at `ballsInPlay` 0, where the search is idle, and a recover report cannot arrive on a save's drain tick, because a recover leaves no ball to drain.
    - Export `applyRecovery(machine, recovered)`: it returns `ballsInPlay: 0` when `recovered !== null`, and otherwise the same reference.
    - `startBall()` calls `ballSearch.reset()`.
    - `BallControllerStepResult` gains `recoverCommands` and `bankResetRequests`.
15. `src/sim/rules/index.ts`:
    - `Rules.step` takes the optional `machineReport` (default `EMPTY_MACHINE_REPORT`). `RulesStepResult` gains `recoverCommands: readonly RecoverCommand[]`.
    - Before `applyDeviceEvents`, apply `applyRecovery(state.machine, machineReport.recovered)`.
    - Pass the report to `ballController.step`.
    - Forward `controllerResult.bankResetRequests` into the devices layer's lifecycle input on the **next** tick, beside `pendingLifecycleEvents`.
    - Update the header's three-argument quotation at `:4`.
16. `test/util/switch-script.ts`: add `machineReports?: ReadonlyMap<number, MachineReport>`, passed as the fourth argument on its tick. Add `recoverCommands` to the result.
17. Tests. Each follows `## Verification`'s mutation plan, and each pairs every negative with its positive in the same test.
    - `test/rules-ball-search.test.ts` (new, headless). It uses `runRulesScript` with a mid-game `initialState`, scripted switch edges and injected `machineReports`. It covers ACs 1, 3, 4a, 4b, 4d, 5 and 6, the headless half of AC 7, and AC 13. Add it to `ENTRY_FILES`.
    - `test/ball-search-integration.test.ts` (new): real `createLoop` runs with real input. It covers AC 2, AC 4c and the real-loop half of AC 7.
      - It is the **only** home of the test-only instrument (Design Notes, *AC 2's instrument*): the in-memory cup document, the file-scoped `vi.doMock` capture, and `place()`.
      - `vi.resetModules()` and `vi.doMock('../src/sim/physics/machine', …)` run before `await import('../src/sim/loop/index')`.
      - **Implement-pass correction (2026-09-11, build-auto step 3):** the first implementation pass substituted a per-tick position/velocity re-pin (teleporting the served ball back to a loose point after every `advance()` call for the full ~18,000-tick run) for the spec's designed instrument, and did not reproduce this AC's own literal tick-offset assertions (S+1252, S+2001, S+2251, S+2501, S+2751), instead asserting offsets it measured fresh against the substitute instrument. That is not this task: build the real test-only V-cup (`col_test_cup_l`, `col_test_cup_r`, apex (165, 240), per *AC 2's instrument* above) as an in-memory collision-document addendum passed through `createLoop`'s `collisionDoc` option, `place()` the served ball into it **once**, and let the cup's own contact physics hold it — exactly as designed and as the plan-stage measured (six placements settling within 0.03 mm of one point; 0.0147 mm drift over L+3000..S+2750). Assert AC 2's and AC 4c's literal tick offsets as written, not offsets re-measured against a substitute.
    - `test/ball-search-physics.test.ts` (new): at `createMachine` level. It covers ACs 8 and 9, and it is the manifest's `pinnedBy`.
    - `test/rules-devices.test.ts`: AC 14.
    - `test/contracts.test.ts`: the `ball_search_started` arm with an executing assertion (AC 11).
18. Goldens: `test/replays/{roll-and-drain,hold-and-release,full-plunge,nudge-coupling,two-ball-collision}.golden.json`.
    - Run a scratchpad-only harness that refreshes all five goldens' `header.tableHash` and `header.gameStart.tuning`. It adds `ballSearchMs`, `ballSearchTicks`, `ballSearchStepMs` and `ballSearchStepTicks` in `resolveTuning()` order, and appends a `notes` line naming Story 2.12. Verify per field (`## Verification`).
    - **DW-187 trace, if needed.** The plan measured that the fix moves no golden. If a golden's body field or state hash moves anyway, first establish whether the move is the DW-187 fix: re-run with task 2 reverted, from a saved copy.
      - A move traced to the fix is re-recorded under decision 3's pre-authorisation. The re-record must show the trajectory traced correct, the golden still asserting its own subject, and every field verified structurally.
      - Any other move is the contract's Block-If: HALT.

**Acceptance Criteria:**
- **AC 1: the search starts on its bound and walks its stages in order** (epics AC 1, as amended).
  - **Given** `runRulesScript` at production tuning with a mid-game `initialState`: `phase: 'game'`, one player, `ballsInPlay` 0, `deviceSlots.bd_shooter` `[true]`. `s_shooter_lane` opens at tick O, which emits `ball_launched` and makes `ballsInPlay` 1. No `playfield_switch_closed` and no flipper button follow.
  - **When** rules step through O+17750.
  - **Then:**
    - no `ball_search_started` appears through O+14999, and exactly one appears at O+15000, carrying `tick: O+15000`;
    - the merged `coilCommands` per tick equal this authored literal list:
      - `c_sling_l` at O+15000, `c_sling_r` at O+15250;
      - `c_pop_1` at O+15500, `c_pop_2` at O+15750, `c_pop_3` at O+16000;
      - nothing at O+16250, and `c_dragon_bank_reset` at O+16251;
      - nothing at O+16500 or O+16750;
      - `c_autolaunch` at O+17000;
      - `c_trough_eject` at O+17250 and O+17500;
    - exactly one `RecoverCommand` is issued, at O+17750;
    - no command in the run names `c_mouth`. The same run's O+17000 and O+17250 commands are the positive: device steps are issued.
- **AC 2: Integration AC — physics' `recovered` reaches rules through the loop, and a ball is ready** (epics AC 2).
  - **Given** a real `createLoop` at production pitch, with `NO_BALL_SAVE_TUNING` as both `GameStart.tuning` and the loop's `tuning`. It is built from the test-only cup document, with the machine captured by the file-scoped seam (Design Notes, *AC 2's instrument*).
  - Start. At T = 400 the served ball rests on the plunger tip: `deviceSlots.bd_shooter` `[true]`, `ballsInPlay` 0, three trough slots closed. The test then `place()`s it at rest at (165, 262).
  - **When** the loop runs with no input to S+3000, and then a 1200-tick plunge is made.
  - **Then**, reading only `FrameOutput`:
    - **the premise:**
      - `ball_launched` arrives at L = 401, and `ballsInPlay` reads 1 on that tick;
      - from L+3000 through S+2750, the cup ball (tracked by its `snapshot.balls[].id`) stays within 0.1 mm of its L+3000 position;
      - that position is more than 90 mm from every switch-zone box of the **committed** document's `loadCollision(...).switchZones` (measured: 97.9 mm to `s_inlane_l`);
    - no `ball_search_started` arrives through L+14999, and exactly one arrives at S = L+15000;
    - exactly one `bank_reset` contact arrives after S, at S+1252;
    - `eject_failed { device: 'bd_shooter' }` arrives at S+2001;
    - at S+2251 the trough's closed-slot count drops from 3 to 2, and `deviceSlots.bd_shooter` reads `[true]` on the same tick, while `ballsInPlay` stays 1;
    - the trough count is still 2 at S+2501;
    - at S+2751, exactly one `ball_missing { count: 1 }` appears in the whole run. `snapshot.balls.length` falls from 2 to 1 on that tick, and the ball that remains is not the cup ball;
    - `ballsInPlay` reads 0 from S+2751, and the trough count stays 2 until the plunge;
    - no second `ball_search_started` arrives before the plunge;
    - the plunge produces `ball_launched`, with `currentPlayer` 0 and `players[0].ballNumber` 1 unchanged, and no `ball_ended` arrives anywhere in the run up to and including that tick.
- **AC 3: the recover's rules-side answers.**
  - **Given** `runRulesScript` with injected `machineReports`.
  - **When** `recovered: 1` arrives with `bd_shooter` `[false]`; the identical script runs with `bd_shooter` `[true]`; and `recovered: 1` arrives on the tick a Slam moves `phase` to `'attract'`.
  - **Then** each run emits `ball_missing { count: 1 }` and reads `ballsInPlay` 0, but only the first issues `pulse c_trough_eject`. That positive sits in the same test as the two runs that issue nothing.
  - **And** consider a full search run whose report at O+17751 carries `recovered: 0` with `bd_shooter` `[true]`. It yields `ball_missing { count: 0 }`, `ballsInPlay` 0, no serve, and no second `ball_search_started` through O+33751. The same run's O+15000 start is the positive.
- **AC 4: a playfield closure cancels and restarts the timer; a held flipper pauses it** (epics AC 3, and epics AC 1's pause clause; decision 6).
  - **4a — cancel.**
    - **Given** a search that started at O+15000.
    - **When** a `playfield_switch_closed` arrives at C = O+15600.
    - **Then** that pass issues no command after C and no `RecoverCommand`, and the next `ball_search_started` is at exactly C+15000. The identical script without the closure runs to its `RecoverCommand` at O+17750, in the same test.
  - **4b — the non-playfield closures.**
    - **Given** AC 1's run, quiet since O.
    - **When** each of these arrives inside the quiet window:
      - an `s_shooter_lane` close;
      - a trough slot close;
      - an `s_start` close and open (Start's `button_pressed` and `button_released`);
      - an `s_plunger` close and open;
      - `tilt_bob_closed`.
    - **Then** `ball_search_started` stays at O+15000. The same test shows a playfield closure at O+9000 moving it to O+24000.
  - **4c — Integration AC: the held flipper in the real loop.**
    - **Given** one test that holds two real `createLoop` runs, both at production pitch with `NO_BALL_SAVE_TUNING` as both `GameStart.tuning` and the loop's `tuning`:
      - **the cradle, the negative's subject** (committed document): Start at tick 2, then the plunger pressed at 503 and released at 1703, with `flipper_l` pressed on 1703;
      - **the cup, which carries the pause/resume pair**: AC 2's instrument, placed at T = 400, so O = L = 401.
    - **When** the cradle's flipper is held until R_c = 31704 and then released, and the cup's empty flipper is pressed at P = 5401 and released at R = 25401.
    - **Then**, for the cradle:
      - the premise: `ball_launched` arrives, and `ballsInPlay` reads 1 from then until the release. From tick 6100 until the release, the ball stays within 3 mm of its tick-6100 position (measured spread under 1 mm), and that position is more than 70 mm from every switch-zone box (measured: 76.9 mm to `s_drain`);
      - no `ball_search_started` arrives through R_c−1, which is more than 25,000 ticks after the ball settled;
      - the instrument's own positive: after the release the ball drains, and `ball_ended { player: 0, tilted: false }` arrives within 1000 ticks (measured: R_c+593).
    - **And**, for the cup:
      - no `ball_search_started` arrives through 35400. In particular none arrives at O+15000 = 15401, while the flipper is held;
      - exactly one arrives at 35401, which is R + (15000 − (P − O)).
    - Every assertion reads `FrameOutput`. The flipper edges reach ball search only as the devices layer's `button_pressed` and `button_released`.
  - **4d — the held flipper's edge cases.**
    - **Given** `runRulesScript` with AC 1's mid-game `initialState`, and scripted `s_flipper_l` edges.
    - **When** each of these runs, **then** its negative and its positive hold in the same run:
      - **a hold from P = O+4000 to R = O+10000:** nothing at O+15000 or at O+20999, and `ball_search_started` at O+21000;
      - **a one-tick tap** (close at O+4000, open at O+4001): nothing at O+15000, and exactly one `ball_search_started` through O+19001, at O+15001. A press does not restart the count;
      - **a hold that spans a ball boundary** (design point 1):
        - The hold starts before ball 1's drain. Across the drain, the scripted re-serve (the trough slot opening and the lane closing in one batch) and ball 2's `ball_launched` at O2, `s_flipper_l` never opens.
        - It opens at R2 = O2+20000.
        - Nothing arrives at O2+15000 or at R2+14998, and `ball_search_started` arrives at R2+14999;
      - **a hold that begins during a pass** (design point 3):
        - The search starts at O+15000. `s_flipper_l` closes at O+15600 and opens at O+25600.
        - The slots at O+15000, O+15250 and O+15500 are issued, and nothing is issued from O+15600 through O+25749.
        - Each remaining slot lands exactly 10,000 ticks later than in AC 1:
          - `c_pop_2` at O+25750, `c_pop_3` at O+26000;
          - the merged `c_dragon_bank_reset` at O+26251;
          - `c_autolaunch` at O+27000;
          - `c_trough_eject` at O+27250 and O+27500;
          - one `RecoverCommand` at O+27750.
        - No second `ball_search_started` arrives;
      - **tilted** (design point 2): with `machine.tilt.tilted` true, a hold from O+4000 to O+10000 gives `ball_search_started` at O+21000 and nothing at O+15000.
- **AC 5: the failure vocabulary is tolerated, and overflow is answered** (epics AC 4, as amended).
  - **Given** machine reports carrying `eject_failed` for each ball device, `broken { device: 'c_pop_1' }`, and `device_overflow` for `bd_trough` and for `bd_lock`, plus the controller's own `ball_missing` reaching `modeStack.step()` and the real Backglass fold.
  - **When** rules step.
  - **Then** nothing throws. `eject_failed` and `broken` issue no command and no event, and leave `state.machine` as the same reference.
  - `device_overflow { bd_trough }` yields exactly one `pulse c_trough_eject` on the same tick. `device_overflow { bd_lock }` in the same report yields nothing (AD-18, amended).
- **AC 6: the phase, in-play and tilt gates hold.**
  - **Given** a 16,000-tick quiet window.
  - **When** `phase` is `'attract'` or `'game_over'`, or `ballsInPlay` is 0 with a ball resting in `bd_shooter`.
  - **Then** no `ball_search_started` is emitted. The paired run in `'game'` with `ballsInPlay` 1 emits it at O+15000.
  - **And, when tilted**, the search runs and its sling and pop slots are issued, but the O+17000 slot issues nothing. The untilted twin issues `c_autolaunch` there.
- **AC 7: Integration AC — the drop-bank component consumes the search's request** (AD-19, amended).
  - **Given** a search reaching its bank slot at S = O+16250.
  - **When** rules step through S+2.
  - **Then:**
    - a directly constructed `createBallController(...)`, stepped through the same script, returns one `bankResetRequests` entry at S and no `c_dragon_bank_reset` in its own `coilCommands`;
    - `runRulesScript`'s merged `coilCommands` carry `pulse c_dragon_bank_reset` at S+1, and not at S;
    - AC 2's real-loop run shows exactly one `bank_reset` contact after its search start, at S+1252. This was re-measured on the cup instrument.
- **AC 8: `RecoverCommand` in physics.**
  - **Given** a machine with one ball injected loose on the playfield, and a served ball resting in `bd_shooter`'s entry zone.
  - **When** a step carries `{ type: 'recover', tick }`.
  - **Then** `recovered` is 1, the loose ball is gone, and the lane ball remains. A step with no recover returns `recovered: null`. A recover and a `pulse c_trough_eject` in the same step keep the newly served ball.
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
  - **Given** a real `createLoop` at production pitch, with `NO_BALL_SAVE_TUNING` as both `GameStart.tuning` and the loop's `tuning`. Start. The served ball reads `deviceSlots.bd_shooter` `[true]` with `ballsInPlay` 0.
  - **When**, in order:
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
  - **Then**, all in one test:
    - each pair returns the same reference with `ballsInPlay` 1;
    - the lone arrival returns `ballsInPlay` 0;
    - at `ballsInPlay` 0, the lone arrival returns the same reference.
  - Two real-loop discriminators back this:
    - AC 2's S+2251 assertion. Re-measured on the cup instrument, the serve's slot opening and lane closing both land at S+2251 while the cup ball keeps `ballsInPlay` at 1.
    - The `two-ball-collision` golden.
- **AC 14: the devices layer reports each button's release edge** (AD-19, amended 2026-09-11).
  - **Given** `runSwitchScript` (the devices layer alone).
  - **When** `s_start`, `s_plunger`, `s_flipper_l` and `s_flipper_r` each close at tick 10 and open at tick 20, and `s_top_2` closes at 10 and opens at 20.
  - **Then:**
    - each button yields `button_pressed { button }` at 10 and `button_released { button }` at 20;
    - a flipper's release adds no second `lane_change_pressed`;
    - `s_top_2`'s opening edge adds no event. Its close still yields `playfield_switch_closed` and `lane_entered`, the same test's positive;
    - the two existing close-then-open tests (`test/rules-devices.test.ts:544-552`) assert the two-event form.

### Review Findings

Code review, 2026-09-11 (`bmad-code-review` under `/epic-cycle`; working directory `C:/git/dragonwar/.worktrees/epic-2`, branch `DW-1-epic2`). Diff: `git diff 7c25c4d` (committed `7c25c4d..2539905` plus QA's uncommitted edits; no untracked files), 34 files, reviewed in full. Review tier: full-opus (no `_bmad/custom/model-overrides.yaml`). Layers run, each synchronously from the worktree: blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor. No layer changed a file.

- **Rule 6:** every AD checked against its current text (AD-1, 2, 3, 4 amended, 5 amended, 6, 7, 9, 11, 15, 16, 18 amended, 19 amended). No violation.
- **Rule 1:** Integration ACs 2, 4c, 7 and 12 run against real instances.
- **Rule 3:** the real-runtime tier is `createLoop()`. `test/ball-search-integration.test.ts` and `test/rules-rollback-accounting-integration.test.ts` drive real input and assert on `FrameOutput`.
- **Rule 5:** no NFR workaround found.
- **Goldens:** header-only, verified structurally by the auditor, and untouched by this review.
- **Counts:** 0 decision-needed; 17 patch, all applied and verified (4 med, 13 low); 7 defer, each ledgered (2 med, 5 low); 10 dismissed; 0 high.

**Patch -- applied.** Each `mutation:` line below is this review's own demonstration. Every mutation was applied from a saved copy, observed red, then reverted; md5 and `git status --short` / `git diff --stat` were byte-identical afterwards.

- [x] [Review][Patch] (med) AC 3's count-0 test never issued a recover [test/rules-ball-search.test.ts:192, :141]. Fix-risk low (test only), in-story.
  - The defect: an unpaired `s_shooter_lane` close zeroed `ballsInPlay` ten ticks before the recover slot (DW-187). The search idled, and the injected report answered a recover that was never issued. The first test's occupied run had the same shape.
  - The fix: both runs now occupy the lane with a paired serve. The count-0 run asserts its own `RecoverCommand` at O+17750, `ballsInPlay` 1 before the report and 0 after, and runs through O+33751.
  - mutation: `applyRecovery(state.machine, machineReport.recovered || null)` in `src/sim/rules/index.ts` -> the AC 3 count-0 test red ("expected 1 to be +0").
- [x] [Review][Patch] (med) AC 5's assertions could not fail [test/rules-ball-search.test.ts:279]. Fix-risk low, in-story.
  - The defect: `expect(() => result).not.toThrow()` appeared twice, over an already-computed value. A `toEqual` claimed reference equality. The "no event" clause was unasserted, and the "real Backglass fold" was never exercised.
  - The fix: the machine check is now `toBe(before)`. No rules event lands on the report tick; the positive is the run's own `ball_launched`. The mode stack's `modes` reference is unchanged. AC 2's real loop folds every `FrameOutput` through `advanceBackglass` / `renderFrame` and reads `score` on the `ball_missing` frame [test/ball-search-integration.test.ts:405].
  - mutation: `events.push(failure)` in the controller's `(c)` no-op branch -> AC 5 red ("no rules event of any kind on the report tick").
- [x] [Review][Patch] (med) AC 1's expected coils came from the same `TABLE` expressions the module reads (Rule 19 shape 3; the spec's anti-vacuity #44) [test/rules-ball-search.test.ts:86]. Fix-risk low, in-story.
  - The fix: authored literals `c_sling_l`, `c_sling_r`, `c_pop_1..3`, `c_autolaunch`, `c_trough_eject` and `c_dragon_bank_reset`.
  - mutation: swap `c_sling_l` / `c_sling_r` in `TABLE.slingWiring` -> AC 1, AC 6 (tilted) and AC 4d (mid-pass) red.
- [x] [Review][Patch] (med) AC 9's clause "directed away from `col_pop_1`'s centroid" was unasserted [test/ball-search-physics.test.ts:166]. Fix-risk low, in-story.
  - The fix: the ball now rests off-axis at the centroid + (30, 20) mm, clear of the bumper body. The table-frame kick must have a cosine above 0.99 with the radial.
  - Why that placement: an injected ball is hit-tested, so a placement overlapping the body is pushed out on the priming tick (measured: speed 1.39).
  - mutation: negate `popKickMmPerS` in `applyPulses()` -> AC 9 red (cosine -1.0000).
- [x] [Review][Patch] (low) DW-259: `applyPulses()` stopped at the first ball in the pulsed skirt, while task 8 says it "kicks every ball" [src/sim/physics/pops.ts:260]. Fix-risk low, in-story, spec-clear.
  - The fix: it now kicks every ball in the zone, one `coil_fire` each, and its doc comment says so. The new test places two co-located balls, checks both are at rest after the priming tick, and asserts both are kicked [test/ball-search-physics.test.ts:202].
  - mutation: skip every ball after the device's first `coil_fire` -> the two-ball test red ("expected 0 to be greater than 1").
- [x] [Review][Patch] (low) `applyPulses()`'s pulsed-coil guard was unpinned, as the test file's header admitted [test/ball-search-physics.test.ts:166].
  - The fix: AC 9 first pulses an enabled `c_pop_2` beside the `sw_pop_1` ball.
  - mutation: `if (false)` in place of the `pulsedCoils.has` guard -> AC 9 red ("a pulse of a DIFFERENT pop must never kick", 3.71).
- [x] [Review][Patch] (low) AC 14's `s_top_2` negative filtered out every `button_released`, which would hide a spurious one [test/rules-devices.test.ts:620].
  - The fix: it excludes only the four buttons' own releases.
  - mutation: emit `button_released` on every opening edge -> AC 14 red, plus five other devices tests.
- [x] [Review][Patch] (low) The "Tilted" I/O row's clause "the trough and bank slots are unchanged" was unasserted [test/rules-ball-search.test.ts:360].
  - The fix: the tilted run asserts the merged bank reset at O+16251 and the trough pulse at O+17250.
  - mutation: tilt-guard the `laneOccupied` (trough) slot -> the AC 6 tilted run red.
- [x] [Review][Patch] (low) The AC 2 / AC 4c instrument returned at T = 3 with the served ball still rolling [test/ball-search-integration.test.ts:233].
  - The defect: its "resting before place()" message was false, and the ticks differed from the spec's literals. L read 4, not 401, and AC 4c's P / R / S read 5004 / 25004 / 35004, not 5401 / 25401 / 35401.
  - The fix: `startAndSettle()` runs to T = 400. The tests assert L = 401, O = 401 and the literal `[35401]` [:551]. Green, with every S+ offset unchanged.
- [x] [Review][Patch] (low) AC 12 asserted neither "on the tick a trough slot closes" nor "ball 2 starts" [test/rules-rollback-accounting-integration.test.ts:146]. Both are asserted now.
- [x] [Review][Patch] (low) AC 10's tick expectation, `Math.round(msEntry.value * TICK_HZ / 1000)`, was derived from the value under test [test/tuning.test.ts:280]. Now the authored literals 15000 and 250.
- [x] [Review][Patch] (low) The AC 4d ball-boundary test drove a drain at default tuning, against the Boundaries clause "every drain-driving test runs at NO_BALL_SAVE_TUNING" [test/rules-ball-search.test.ts:508]. It now passes `NO_BALL_SAVE_TUNING`; it already asserted that `ball_ended` arrived.
- [x] [Review][Patch] (low) DW-262: the `servesInto` narrowing cast was duplicated in two files, with a redundant `?? undefined` [src/sim/rules/ball-search.ts:53, src/sim/rules/ball-controller.ts:83].
  - The fix: one exported `servesIntoOf()` in `ball-search.ts`, which the controller imports. AC 1, AC 13 and the goldens stay green.
- [x] [Review][Patch] (low) `EMPTY_MACHINE_REPORT`'s comment said "frozen", but the object and its shared `failures` array were mutable [src/sim/rules/index.ts:87]. Both are now frozen with `Object.freeze`.
- [x] [Review][Patch] (low) DW-187's red-before-fix provenance was stated inaccurately [test/rules-rollback-accounting-integration.test.ts:4].
  - The defect: the test header and `## Auto Run Result` both say the test was "observed RED on today's pre-fix code (task 1, before the fix landed)". The cycle log records the red as shown after the fix, by a surgical revert.
  - The correct record: the lead's and the plan stage's scratch probes observed the scenario red on pre-fix code. This file's own red was demonstrated by the implement stage's revert and by the lead's AD-gate mutation.
  - The fix: the header is corrected. `## Auto Run Result` is build-auto's record, so it is left as written, and this line supersedes it.
- [x] [Review][Patch] (low) AC 8's same-step test title claimed to pin the recover-before-`applyCommands()` ordering, which it cannot distinguish [test/ball-search-physics.test.ts:109]. The title and comment are corrected; the residual is DW-264 below.
- [x] [Review][Patch] (low) AC 4b's test substitutes a PAIRED lane close (with a trough slot opening) for the matrix row's bare `s_shooter_lane` close and trough-slot close. The spec recorded no deviation [test/rules-ball-search.test.ts, AC 4b].
  - Recorded here: after DW-187 the row's literal edges cannot serve as a quiet-window premise, because an unpaired lane close, or a trough-slot close at `ballsInPlay` 1, ends play. The paired edges are the row's reachable equivalent, and the test's own comment says so. No code change.

**Defer -- each ledgered** (Rule 15, `by=cr`):

- [x] [Review][Defer] (med) A pass cancelled after its trough slot can leave an extra ball in the lane [src/sim/rules/ball-controller.ts:608; src/sim/rules/ball-search.ts:177].
  - The shape: a playfield closure between the trough slot (O+17250) and the recover (O+17750) cancels the pass, leaving a served, uncounted ball on the plunger tip. The next `startBall()` serve stacks a second ball on it, or a plunge starts an unplanned two-ball game.
  - Why deferred: the root cause is DW-244's (ball start serves with no balls-home or lane decision), and the intent contract forbids pre-empting DW-244. Filed as `DW-244 occurrence=2-12-ball-search` (escalated, owner burndown, for the decision sheet). Fix-risk high, in-epic, non-blocking.
- [x] [Review][Defer] (med) A plunge of the search-served ball in the ~500 ms before that pass's `RecoverCommand` is despawned by the recover [src/sim/rules/ball-search.ts:177].
  - Spec-bound: the shooter lane never cancels a search (decision 6's list), and `RecoverCommand` despawns every ball outside a device (AD-6).
  - DW-263 `by-design`, owner 2-12-ball-search. Reopens only by spec amendment. Fix-risk med.
- [x] [Review][Defer] (low) Recovered balls are never re-parked, so once the trough empties the game cannot end the ball, a hard hang [src/sim/physics/devices.ts, recover()]. An existing root cause: `DW-257 occurrence=2-12-ball-search` (wontfix-accepted; its reopen_if stands).
- [x] [Review][Defer] (low) AC 8 cannot distinguish recover-before from recover-after `applyCommands()`, because the trough's eject pose lies inside `bd_shooter`'s entry zone [src/sim/physics/machine.ts:356].
  - DW-264 `wontfix-accepted`, with reopen_if = a `c_mouth` eject lands (Story 3.2) and no test steps a recover and a `c_mouth` pulse in one step.
  - Not a two-way door: the discriminating instrument needs a ball parked in `bd_lock`.
- [x] [Review][Defer] (low) The `device_overflow` answer pulses with no phase, tilt or lane guard [src/sim/rules/ball-controller.ts:919].
  - DW-265 `wontfix-theoretical`. Unreachable today: the trough's capacity of 4 equals the machine's 4 balls, and a Lock overflow is tolerated until Story 3.2.
  - It becomes real once Story 3.2 answers a `bd_lock` overflow.
- [x] [Review][Defer] (low) No golden or determinism check covers a search pass, the loop's recover marker, `recover()` or `applyPulses()`.
  - DW-266 `wontfix-accepted`, with reopen_if = a game-starting golden is recorded, or two `createLoop` runs of AC 2's cup scenario diverge.
  - Not a two-way door: it falls outside this story's header-only golden budget.
- [x] [Review][Defer] (low) The reset-safety guard catches only a restart below the stale origin, and leaves `wasInPlay` true after discarding [src/sim/rules/ball-search.ts:267].
  - DW-267 `wontfix-theoretical`. Every production path builds a fresh Rules instance per loop and per replay.
  - It becomes real only if a host reused one Rules instance across a timeline restart.

**Ledger inbox** (the lead adjudicates):

- **DW-187:** the fix closes it.
  - The rolled-back ball reads 0, the re-plunge reads 1, and the drain ends the ball (AC 12; the AD gate's mutation reddened it).
  - The pairing is stateless and same-batch, and keeps the signature and the same-reference return.
  - Recommend `resolved-by:2-12-ball-search`. Sub-findings (a) and (c) stay declined, as the spec records.
- **DW-259:** patched above. Probe: the two-ball test under the first-match mutation.
- **DW-260:** not patched, because it is not a spec-clear two-way door.
  - Task 14 itself declares skipping (a)-(d) harmless on the save re-serve path.
  - Branch (b) can issue nothing in any reachable state at this tree: a `bd_trough` overflow needs a fifth ball, and a `bd_lock` overflow is tolerated with no answer until Story 3.2.
  - Recommend `wontfix-theoretical`, with reopen_if = Story 3.2 answers a `bd_lock` overflow (the save-drain early return must then run (b) too). That is DW-265's trigger.
- **DW-261:** not patched, because its premise does not hold.
  - Accrual while not in play is always discarded: `step()` re-origins a fresh pass on every false-to-true "in play" transition [src/sim/rules/ball-search.ts:298].
  - A ball-save re-serve always passes through at least one `step()` at `ballsInPlay` 0: the re-served ball's trough pulse lands at t+1 and its autolaunch at t+2 at the earliest. So no `ballSaveMs` tuning can carry quiet ticks across the gap.
  - An `inPlayNow` conjunct on the accrual (:311) would be a guard no test could redden.
  - Recommend `dropped` (invalid) or `wontfix-theoretical`.
- **DW-262:** patched above.

**Dismissed** (10; noise, or handled elsewhere):

- A tilted recover re-serves: author decision 2 adds no tilted-recovery ball end.
- The shooter slot answers `eject_failed` in single-ball play: the Design Notes keep the slot for Story 3.7.
- The two sling slots are inert: DW-256, and the spec's "Never build a commanded sling kick".
- `TABLE`'s per-device `recover` steps collapse into one `RecoverCommand`: as the Design Notes specify.
- `recover()` skips a non-parking device with no zone instead of throwing: already adjudicated at build-auto's triage, and the committed document is verified.
- `runRulesScript()` keeps a three-argument branch: the spec requires that call site to keep compiling.
- `roll-and-drain` has a re-serialised `checkpointTicks`: the values are identical, verified structurally.
- Same-batch serve pairing rests on a premise: `test/device-eject-pose.test.ts` gates it.
- The recovery serve names `bd_shooter` / `bd_trough`: task 14(a)'s own wording, with in-file precedent.
- AC 9's injected ball is not a registered mover: the AC asserts velocity, and the ball's hit-testing is now accounted for above.

**Verification after the patches:**

- `pnpm typecheck`: clean.
- `pnpm test`: 121 files, 2009 passed, 0 skipped.
- `pnpm lint:boundaries`: OK (108 files).
- `check:headers` and `check:attributions`: OK.
- `check:ad7`: exactly 3 passing tests.
- `check:corridor` and `check:reachability`: OK.
- `git diff --stat -- test/replays/ public/assets/`: unchanged by this review.

## Spec Change Log

- **2026-09-11 — re-dispatch after the plan-stage AD-18 halt (lead).** The author's five decisions are written into the intent contract (`Author decisions, 2026-09-11`), replacing the "Blocked on AD-18" paragraph. Frontmatter `status` reset `blocked` → `draft` for a re-plan on this spec path. Frontmatter `deferred` item 1 (DW-187's rolled-back-ball double count) removed because it is now in scope. Same-day planning writes: `epics.md` Story 2.12 (AC 1, AC 2, AC 5 amended, change log) and Story 3.2 (three clauses received, change log); spine AD-4, AD-5, AD-18 and AD-19 amended; ledger DW-241 `by-design`, DW-222 coupling-settled note, DW-187 corrected-severity and in-scope notes.
- **2026-09-11 — re-plan against the decisions (plan stage).** The intent contract was preserved verbatim, and everything outside it was re-derived.
  - **The ACs were renumbered to follow the amended epics text.** The old AC 2 (the `c_mouth` skip) moved to Story 3.2. The old ACs 7 and 8 were retired, because the decisions removed their premise. A rolled-back ball now reads `ballsInPlay` 0, so no search starts and no search launches it (DW-187 fixed). `c_autolaunch` is never disabled (DW-241 by-design), so the disabled-coil trace no longer describes a reachable state.
  - **DW-187 was added:** task 1, task 2, AC 12, AC 13 and the supplement rows.
  - **The real-loop stuck ball moved from a pitch-0 override to a held left flipper.** Measured at pitch 0, a served ball rolls up the lane by itself: `ball_launched` 182–184 ticks after the serve, with no plunge. So pitch 0 cannot hold a served ball on the tip, and the old AC 3's "the served ball rests in the shooter lane" was false there.
  - **KEEP:** the stage list and its structural order, the fixed-slot schedule, the bank request through AD-19's owner, the recover-before-`applyCommands` ordering, and the header-only golden budget.
- **2026-09-11 — decision 6 and the lead's fold (lead).** The author chose option (c) at the spec gate: a held flipper suspends the ball-search timer (pause, resume on release). Written into the intent contract as decision 6 with its two Rule 19 test constraints; row 126 split (a Start press still never delays; a new *Flipper held pauses* row); the Approach and *What counts as a switch closes* clauses amended. The lead also folded the re-plan supplement into the contract and retired the stale Lock-pending, DW-241-undecided and "Never fix" clauses. Status reset `ready-for-dev` to `draft` for a re-plan on this spec path. Same-day writes: AD-19 lists `button_released { button }`; PRD FR-23 consequence note; `epics.md` Story 2.12 AC 1 and change log, and the AR-12 digest; `SOLUTION-DESIGN.md:49`.
- **2026-09-11 — re-plan against decision 6 (plan stage, cycle 3).** The intent contract was preserved byte for byte, and everything outside it was re-derived against the contract as it now reads.
  - **AC 2's instrument changed.** A held flipper now pauses the timer, so the held-flipper cradle could no longer drive the search.
    - AC 2 now runs on a test-only stuck ball resting in a test-only cup. The cup is two wall bars added to an in-memory copy of the collision document, and the served ball is moved into it through a file-scoped `vi.doMock` capture of the real machine. It goes through the real `RecoverCommand` path.
    - Its stability is measured and asserted.
    - The only natural resting spot outside every zone is a deck defect, and it is recorded in frontmatter `deferred`.
  - **Timings re-measured on the cup:** S+1252, S+2001, S+2251 (with `ballsInPlay` 1), S+2501, and S+2751 for the recover. S is now exactly L+15000.
  - **AC 4 gained 4c and 4d.**
    - 4c is the real-loop pair: the cradle as the negative's subject, and the pause/resume positive on the cup (`LEAD CHECK:`, measured).
    - 4d is headless coverage of the tap, the ball-boundary, mid-pass and tilted holds.
    - 4b's flipper press was replaced by Start and plunger presses, per the contract's row.
  - **New:** task 12 and AC 14 (`button_released`, AD-19 amended), and the `observe`/`step` split of the search (task 14), so the save re-serve's early return cannot drop a tick's edges.
  - **Retired:** the *Reading the contract under the decisions* map (the lead's fold made it history), and the cradle product note, which the author answered with option (c).
  - **KEEP:** everything the previous entry's KEEP lists, DW-187's stateless serve pairing and its golden trace, and the quiet-count clock `q(t)`, which reproduces the contract's *Flipper held pauses* row exactly.
- **2026-09-11 — lead spec gate (cycle 3).** The lead ACCEPTED all three `LEAD CHECK:` lines as planned: a held button pauses the search even while tilted; a hold during a running pass pauses the pass where it stands; AC 4's resumed-tick positive runs on AC 2's cup ball in the same test as the cradle negative (the cradle drains at R+536, and the earliest resumed search is R+14999). They are decided, not open questions, for the implement and review stages.

## Review Triage Log

### 2026-09-11 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 0high, medium 0medium, low 4low)
- defer: 4: (high 0high, medium 0medium, low 4low)
- reject: 5: (high 0high, medium 0medium, low 5low)
- addressed_findings:
  - `[low]` `[patch]` All 5 refreshed golden replay JSON files carried a duplicated "[Story 2.12, header-only refresh, 2026-09-11]" notes paragraph (the golden-refresh harness ran twice), the second copy self-contradicting itself (`tableHash moved e22fbdcf -> e22fbdcf`). Fixed by surgical removal of the duplicate paragraph from all five files' `notes` field; re-verified structurally field-by-field (only `header.tableHash`, the 4 new `gameStart.tuning` blocks, and the now-de-duplicated `notes` differ from `efe14f5`; every other field byte-identical).
  - `[low]` `[patch]` `test/rules-ball-search.test.ts` had a dead, miscomputed `recoverTick` local (`O + 11*step + BALL_SEARCH_TICKS - BALL_SEARCH_TICKS`, discarded via `void recoverTick;`) left over from drafting, never used by the test's own assertions (which correctly use `trueRecoverTick`). Removed.
  - `[low]` `[patch]` `applyRecovery()` (`ball-controller.ts`) had no direct unit test for its documented same-reference/new-reference contract -- only indirect, structural (`toEqual`) coverage through integration tests. Added 4 direct reference-equality pinning tests in `test/rules-devices.test.ts`, mirroring the existing `applyDeviceEvents` pinning pattern in the same file.
  - `[medium]` `[patch]` AC 4's "a hold that spans a ball boundary" (design point 1) -- a documented design guarantee (the held set survives `startBall()`'s own `reset()`) -- had zero test coverage; the spec's own Rule 19 mutation-table row named a test that did not exist anywhere in the repository (confirmed by the verification-gap review layer via full-tree grep). Added the missing headless test to `test/rules-ball-search.test.ts`'s AC 4d block, scripting a genuine ball-1-drain-to-ball-2-launch sequence with the flipper held across the boundary; confirmed RED against a temporary mutation (`reset()` clearing `heldSince`), confirmed GREEN restored, source byte-identical after (md5 unchanged).

## Defer disposition detail (frontmatter `deferred` items 4-7 above)
- Item 4 (pop kick, first-match-only): `PopMechanics.applyPulses()` kicks only the first ball found in a pulsed pop's skirt zone; the code's own doc comment already frames this as deliberate ("the ball (if any)", singular). Real but unreachable before multiball (Story 3.7) exists; not this story's problem to redesign.
- Item 5 (device_overflow on the ball-save early-return path): the path's own harmlessness comment covers the recover and no-op cases but not a same-tick `device_overflow` on a different device; unreachable in single-ball play, relevant once Story 3.7 lands.
- Item 6 (quiet-tick clock accrual has no explicit in-play gate): correctness currently rests on production tuning's ball-save window being much shorter than the 15 s search threshold, not on an explicit guard; a pathological custom tuning could reach it.
- Item 7 (duplicated `servesInto` cast in two files): a minor DW-149-adjacent style duplication, bigger than a 15-line mechanical patch to fix properly (needs a shared typed accessor); worth revisiting once a third consumer appears.

## Rejected findings (noise, dropped)
- "A non-parking device's entry switch has no matching switchZones box, so `recover()` throws" (edge-case-hunter): the cited code does not throw -- `devices.ts`'s actual code silently omits the device from `nonParkingEntryZones` if no zone matches -- and the underlying scenario is unreachable given the committed, structurally-verified `TABLE`/collision document.
- "Formatting/indentation regression in `test/rules-ball-save.test.ts` at lines 1817-1869" (blind-hunter): the file is 916 lines long; the cited line range does not exist. Unverifiable, contradicted by direct inspection.
- "Unrelated formatting-only diff noise in `roll-and-drain.golden.json`'s `checkpointTicks`" (blind-hunter): confirmed cosmetic re-serialization by the golden-refresh harness, no value change (already verified structurally field-by-field); not a defect.
- "AD-18's coil-pulse-ownership surface is ambiguous between `ball-controller.ts` and `ball-search.ts`" (intent-alignment): the auditor's own report frames this as "a tension already latent in the contract... not an invention of the diff," self-resolved by the contract's own task-4 language. No action needed.
- "No physics-level test recovers more than one simultaneously loose ball" (blind-hunter): `DeviceMechanics.recover()` iterates every ball in physics with no early exit (verified by direct reading, unlike the pops.ts case above which does break early) -- the implementation already handles multiple balls correctly; AC 8's own Given is explicitly single-ball, so the missing multi-ball TEST is a coverage nit against an already-correct implementation, not a real gap.

## Design Notes

### Governing architecture decisions (Rule 6)

- **AD-4, as amended 2026-09-11:** the loop contract.
  - `rules.step`'s optional fourth argument is the machine report: `recovered` plus physics' device failures. Commands land on the next tick.
  - The report's `failures` type also admits `broken` from AD-9's vocabulary, so epics AC 4's `broken` clause can be exercised. Physics' own `DeviceFailure` is exactly AD-4's two names (`devices.ts:79`), so nothing physics produces changes.
  - AD-4 also fixes how button edges arise: physics derives edges per tick from consecutive frames, and the loop does the same for the four buttons.
- **AD-5, as amended 2026-09-11:** the coil-enable gate, which swallows a search pulse on a disabled sling or pop. The manual plunger shares `c_autolaunch`, which no rules path disables.
- **AD-6:** the protocol itself: `ballSearchOrder` pulses ending in `RecoverCommand`, the `recovered` count, and `ball_missing { count }`. Also "answer `device_overflow` with an immediate eject", excepting `bd_lock` under AD-18's phasing.
- **AD-7:** `GameState` ownership, and the closure-state class the search joins.
  - Its Rule sets the bar for a new closure field: "reproducible from tick 0, and bounded or restart-safe".
  - The held set meets it: it is a pure function of the input edges, holds at most two entries, and discards marks from the future.
  - AD-7's Rule does not require a `ball_will_start` reset of closure fields. The contract's Always clause asks for one only for "the search timer and schedule".
- **AD-9:** the closed rules→physics union, including `RecoverCommand`. `ball_search_started` is payload-complete.
- **AD-15:** two tunables with provenance, and the golden budget.
- **AD-16:** no name literals. The flipper buttons come from `TABLE.flipperButtonWiring`.
- **AD-18, as amended 2026-09-11:**
  - Only the ball controller pulses `c_trough_eject` and `c_autolaunch`, and only it mutates `ballsInPlay`.
  - `applyDeviceEvents` lives in `ball-controller.ts`.
  - The phasing: nothing pulses `c_mouth` before Story 3.2.
- **AD-19, as amended 2026-09-11:**
  - The devices layer is the only `SwitchEvent` consumer.
  - The drop-bank component alone pulses `c_dragon_bank_reset`, on three triggers: `ball_will_start`, `bank_completed` and ball search's reset request.
  - The derived `playfield_switch_closed` set answers "has anything closed?".
  - **The binding enumeration lists `button_released { button }`**, the release edge of the same button switches, "so ball search can pause its timer while a flipper is held and resume on release". Task 12 implements exactly that amendment; the lead has already written it to the spine (Rule 20).
- **Also relevant:**
  - **AD-1:** rules and physics never import each other, so the machine report is a contracts type.
  - **AD-2:** failures are semantic events, not contacts.
  - **AD-3:** both timers are authored in ms and converted once. `tick` is the only time; the quiet count is a tick count.
  - **AD-11:** `TABLE` owns wiring, hence `slingWiring`.

No AC contradicts any AD's Rule.

### The held flipper (decision 6)

**The clock.** Search time is the quiet count `q(t)` defined in task 13: in-play ticks after the origin at which no flipper button is held.
- **With no hold**, `q(t) = t − O`, and the search starts at O+15000 (AC 1).
- **With a hold from P to R, where O < P**, the held ticks are exactly P through R−1. So `q(t) = (t − O) − (R − P)`, and the search lands at R + (15000 − (P − O)), which is the contract's row verbatim.
- **With a hold already in force at the origin**, the count starts on the release tick itself, so the search lands at R+14999. The row's formula gives the same answer with P = O+1.
- **A tap of one tick** delays the search by one tick. A press never restarts the count.

**The seam.**
- `sim/loop` already delivers both edges of every button (`loop/index.ts:153-161`).
- The devices layer gains the opening-edge branch (task 12, AC 14).
- Ball search folds the flipper buttons' `button_pressed` / `button_released` into its own held set, as AD-19 says. It never reads a raw switch and never reads the input frame.

**Where the fold runs.** `observe()` is the first statement of `ballController.step()` (task 14).
- It runs every tick, in every phase, and at any `ballsInPlay`. A hold that begins in Attract, or before the plunge, is therefore known when the ball enters play. The cradle measurement below presses the flipper 19 ticks before `ball_launched`.
- Folding before evaluation means a press on a slot's tick, or on the start tick, stops that slot. That mirrors "a closure on the start tick cancels it first".

**Design point 1: a hold that spans a ball boundary. Decided: the held set is never reset at `ball_will_start`.** This is an engineering call, and the author's stated intent settles it.
- The held set is not a latch. It mirrors a physical input level, rebuilt from edges that arrive only on change.
- `sim/loop`'s `previousFrame` persists across balls, so a button still held at the ball boundary produces no new press edge. Resetting the set would forget a hold that is physically in progress. The next ball's search would then run while the player holds it on the flipper: searched at 15 s, then recovered, which is exactly what the author ruled out.
- The set meets AD-7's closure bar on its own terms:
  - it is reproducible from tick 0;
  - it is bounded by `flipperButtonWiring`'s two entries;
  - it is restart-safe, because an entry whose press tick exceeds `tick` is discarded.
- The timer and schedule are still reset in `startBall()`, as the contract requires. AC 4d's ball-boundary row pins the decision, and its mutation (clear the set at `ball_will_start`) turns that row red.

**Design point 2: a held but dead flipper under Tilt. Decided: the pause keys on the button, tilted or not.** The contract's own words are "While EITHER flipper button is held".

LEAD CHECK: a held flipper button pauses the search even while tilted, when the flipper itself is dead. Recommendation: keep it. The contract's words are "either flipper button is held". No ball can rest on a dead flipper, and a tilted stuck ball is searched as soon as the player lets go.

AC 4d's tilted row pins this. If the lead reverses it, that row reverses with a one-conjunct change (`&& !machine.tilt.tilted` on the pause).

**Design point 3: a hold that begins while a pass is running. Decided: the hold pauses the pass where it stands.**
- The slots already issued stay issued. Nothing further is issued while held.
- On release, the remaining slots and the `RecoverCommand` resume, each later by exactly the time held.
- No second `ball_search_started` is emitted, because the pass was paused, not restarted.
- This falls out of the single clock above: slot times are thresholds on `q`.
- The rejected options:
  - Ignoring the hold would recover a ball the player caught on a flipper mid-pass. That breaks the author's intent.
  - Cancelling the pass would make every tap restart a full 15 s. That is option (b) applied to the pass, and the author chose against (b).
- One residual. A ball released within the final interval can meet the recover before it reaches a switch, and the cradle closes `s_drain` 536 ticks after release. The ball number is kept, and a ball is served.

LEAD CHECK: a hold that begins during a running pass pauses the pass where it stands; on release the remaining slots and the RecoverCommand resume, each later by exactly the time held. Recommendation: keep it. It is decision 6's pause-not-restart applied to the search's one clock. Cancelling instead would let flipper taps hold off recovery for good, and ignoring the hold would remove a ball caught mid-pass.

AC 4d's mid-pass row pins it.

**A held cradle is never searched (the author's option (c)).** A plunged ball released into a held left flipper cradles near (220.5, 91.9) at production pitch. It is never searched and never replaced, however long the flipper is held. On release, play continues from the cradle. This replaces the earlier plan's product note, which said a held cradle is recovered and replaced. The cradle is now AC 4c's negative subject.

### AC 4's instrument (the cradle) and its measured release

These figures come from the real loop at `ddbd946` with `NO_BALL_SAVE_TUNING` and production pitch, using the `probe212c/cradle-release` scratch probe.
- **Setup:** Start at tick 2; the plunger held from 503 to 1702 and released at 1703; `flipper_l` pressed on that same tick, 1703; `ball_launched` at 1722.
- **The last playfield closure** was `s_inlane_l` at 4907, seen through the probe's step recorder.
- **Settled** by 6035 within 1 mm of (220.5, 91.9). The spread up to the release was 0.978 mm. The nearest zone, `s_drain`, is 76.9 mm away, then `s_trough_1` at 91.9 mm.
- **Held** until 31704, which is 26,797 ticks after the last closure. `ballsInPlay` stayed 1.
- **After release at R**, the ball rolls off. It closes `s_drain` at R+536 (its first closure), closes a trough slot and ends the ball at R+593.

The hold began before the ball's origin, so the earliest a resumed search could land is R+14999. The `s_drain` closure at R+536 resets the count long before that. The resumed-tick positive is therefore unobservable on the cradle, and 4c carries it on the cup instead.

LEAD CHECK: AC 4's resumed-tick positive is observed on AC 2's cup stuck ball with an empty-flipper hold, in the same test as the cradle negative. Measured: released at R, the cradled ball closes s_drain at R+536 and ends the ball at R+593, so its quiet count restarts long before any resumed search could land (the earliest is R+14999, because the hold began before the ball's origin).

**The cup's pause/resume run was measured with the schedule emulated.** O = L = 401, P = 5401, R = 25401, S = 35401.
- The empty flipper rose (left angle 141° → 90°) and closed nothing.
- No playfield closure occurred at any point after the placement.

### AC 2's instrument: the test-only stuck ball

**Where it sits.** It sits in a test-only V cup with its apex at (165, 240): two convex wall bars, `col_test_cup_l` and `col_test_cup_r`.
- Each has a 30 mm inner face at 45° and is 6 mm thick. `zLowMm` is 0 and `zHighMm` 50, and the `physMaterial` is copied from `col_ramp_wall_r`.
- The ball rests at (165.00, 259.09, 13.51), which is the apex plus r·√2 for the 13.5 mm ball radius. That is 97.9 mm from the nearest switch zone (`s_inlane_l`), then `s_sling_l` at 124.8 mm and `s_outlane_l` at 144.7 mm.
- The distance counts every zone box, device slots and the shooter entry included. So the ball is outside every device and every switch zone, and `recover()` must despawn it.

**The stability measurement.** Measured in the real loop (`probe212c/cup-nohold`) at `ddbd946`, with no hold: T = 400, L = 401, S = 15401 = L+15000.
- **It settles.** It is within 0.1 mm of its rest point by L+98. Six different placements, spread over x 157–173 and y 262–275, settle within 0.03 mm of one point, so the cup is a genuine attractor.
- **Its spread over time.** Over L+3000 to S+2750 it is 0.0147 mm from the first sample and 0.0111 mm from the centroid. Residual contact jitter reaches 16.8 mm/s, with no net displacement.
- **No closure.** No playfield switch closes after the placement.
- **The pass does not move it.** The emulated pass moved it 0.0016 mm.
- **The served ball stays put.** The ball served at S+2251 rests on the tip, with no `ball_launched` for the next 3000 ticks.

**Re-measured timings (AC 2, AC 7, AC 13).** The schedule was emulated with dev pulses. Rules issue a command at t, and it is consumed at t+1.
- one `bank_reset` contact at S+1252;
- `eject_failed:bd_shooter` at S+2001;
- the trough slot count drops 3→2 and the lane closes on the same tick, S+2251, with `ballsInPlay` 1;
- the trough is still 2 at S+2501.

These equal the cradle-era figures, because they are command latencies, not trajectories. The recover lands at S+2751 by the same latency. It cannot be emulated today, because no recover exists yet. Ball ids: the cup ball is 0 and the served ball is 1.

**Why not a natural pocket.** A grid of 2346 rest placements found only one resting spot outside every zone: the Ramp entrance near (377–380, 508).
- It is not stable: the ball rattles between x 376.9 and 379.6 at up to 7 mm/s and never settles.
- Placements 6 mm to either side sink through the playfield deck and fall below the table.
- A test resting on it would rest on a physics defect, and any geometry fix would silently change the premise. It is recorded in frontmatter `deferred` instead.

**The seam, and why it cannot reach production or the goldens.** All of it lives in `test/ball-search-integration.test.ts` (task 17), in three parts:
1. **The document.** An in-memory copy of the committed collision document, with the two bars appended, is passed through `createLoop`'s existing `collisionDoc` option. `public/assets/` is never written.
2. **The capture.** A file-scoped `vi.resetModules()` + `vi.doMock('../src/sim/physics/machine', importOriginal)` replaces `createMachine` with a wrapper. The wrapper calls the real one and records the instance it returns; it changes no behaviour.
3. **`place()`.** Between two `advance()` calls it writes the served ball's `state.pos` and zeroes `hit.vel`, `hit.angularVelocity` and `hit.angularMomentum`. The zone test sweeps only within a step, so the move crosses no zone. The lane switch's own break then yields the real `ball_launched` at T+1.

The seam stays out of production and out of the goldens for these reasons:
- **No production edit.** No file under `src/` gains a branch, option or export for it.
- **Mocks do not leak between files.** `vitest.config.ts` keeps per-file module isolation, and `vi.doMock` is registered only inside this file.
- **The goldens could not load the cup document anyway.** `test/replay-goldens.test.ts` runs `runReplay` from the committed asset in its own module registry. Its headers pin `assetHash ab163ff`, so a changed document would raise `StaleReplayHeaderError` there.
- **Verification checks it.** `git grep` finds no `col_test_cup` under `src/`, and `git diff --stat -- public/assets/` is empty.

```ts
// test/ball-search-integration.test.ts, the shape of the seam (not the final code)
vi.resetModules();
vi.doMock('../src/sim/physics/machine', async (orig) => {
  const actual = await orig<typeof import('../src/sim/physics/machine')>();
  return { ...actual, createMachine: (...a: Parameters<typeof actual.createMachine>) => (captured = actual.createMachine(...a)) };
});
const { createLoop, NO_FRAME } = await import('../src/sim/loop/index');
```

### DW-187: the rolled-back ball (in scope, decision 3)

**The fix.** A non-parking device's `device_ball_entered` means a ball left play, unless the same batch carries a `device_ball_left` from a parking device that serves into it (its `servesInto` equals the entry).
- That pair is a served ball's arrival, and a served ball was never counted.
- The rule is stateless. It keeps `applyDeviceEvents`' signature and its same-reference promise, and adds no closure counter.
- DW-187's own trailer records why a closure counter would break every test that injects an `initialState`.

**Why pairing, and not "every shooter arrival decrements".** Two served arrivals happen while a ball is counted:
- `two-ball-collision`'s second serve arrives at t=196 with `ballsInPlay` 1 (measured). The bare rule would move that golden's state hash.
- The search's own trough slot serves while the stuck ball is counted. The bare rule would zero `ballsInPlay` at S+2251. The search would then go idle, and no `RecoverCommand` would ever be issued, so AC 2 would fail. This is re-measured on the cup: the pair lands on one tick, S+2251.

**Why same-batch pairing is sound.**
- The trough's eject pose lies inside its `servesInto` zone, and a MAKE latches on its first tick. So the slot's opening and the lane's closing come from one physics step.
- That was measured at the Start serve (tick 3), at `two-ball-collision`'s t=196, and at a search-emulated serve beside the cup ball (S+2251).
- Every serve this story issues is guarded on the lane reading empty. An empty lane means the lane switch is reported open, so the served ball's close edge is certain.
- The one unpaired shape left is a ball returning to the lane on the exact tick of a serve into it. That is DW-244's stacking shape, and no guarded serve can produce it.

**Measured consequence on the goldens: none.**
- A shadow of today's accounting reproduced every golden's `ballsInPlay` on every tick, with zero model errors.
- With the fix applied, zero ticks differed in any of the five.
- No trajectory or state-hash re-record is expected. Decision 3's grant is held for task 18's trace, not planned on.

**What the fix changes in play.**
- A rolled-back ball waits on the tip at `ballsInPlay` 0, as a real machine's does, and the player plunges again.
- No search starts for it.
- In single-ball play, the search's shooter slot meets an empty lane and answers `eject_failed { bd_shooter }`, which the controller tolerates (AC 2 observes it). The slot stays in the schedule for two reasons: the amended AC 1 names "the shooter and trough ejects", and Story 3.7's multiball will have a counted ball in play beside a ball in the lane.
- A relaunch still re-arms the ball-save window and the skill shot, exactly as today, because both key on `ball_launched`, not on the count.

**DW-187's Story 2.5 sub-findings.**
- **(a)** A parking entry at `ballsInPlay` 0 ends a ball. Untouched: it stays unreachable in single-ball play.
- **(b)** The floor's order dependence. Touched only in that the new decrement is floored like the parking one. It pairs by batch membership, not position, so it adds no new order dependence.
- **(c)** `startBall()` never resets `ballsInPlay`. Untouched: resetting it is DW-244's undecided question.

**Spine.** No write is needed. AD-6 defines the increment but not the decrement, which is implementation under AD-18. The lead may still record the semantics as a Rule 20 note for Story 3.7: `ballsInPlay` counts balls launched and not yet arrived at any ball device.

### How the stage order was resolved: AC 1's order without name literals

- **What the device stages are.** The amended AC 1 reads "(slings, pops, bank reset, then the shooter and trough ejects); the Lock's own steps wait for Story 3.2". Only the three ball devices carry a `ballSearchOrder`, so that parenthetical is the schedule, and "each device's `ballSearchOrder`" supplies its device stages.
- **Where the slings come from.** A new `TABLE.slingWiring`, mirroring `popWiring`. `HARDWARE_COILS` also holds the flippers, and no field links a flipper coil.
- **The device stages are ordered by structure**, never by name:
  1. parking devices with no `servesInto` — the Lock;
  2. then non-parking devices;
  3. then parking devices with a `servesInto` — the trough, last, so the shooter's autolaunch never fires at the search's own served ball.

  Story 3.2's received clause ("after the bank reset, before the trough eject") matches this order.
- **The Lock's slots** keep their times and issue nothing, identified by `TABLE.lockLaneWiring.device` (AD-18, amended). **The seam for Story 3.2:** it replaces "issue nothing" at those two fixed slots with an arbiter request. The recover's tick does not move.
- **The recover.** The three `recover` steps collapse into one `RecoverCommand`.

### The bank reset through its owner (AD-19, as amended)

The ball controller never pulses `c_dragon_bank_reset`.
- It returns a `bank_reset_requested` request.
- `rules/index.ts` forwards the request on the next tick into the devices layer's lifecycle input, the same path `ball_will_start` already takes to the same component.
- The drop-bank component then pulses its own coil through `onResetRequested`.

### The machine report (AD-4, as amended)

- Physics' failures keep reaching `FrameOutput.events` from the loop exactly as today, and rules never re-emit them.
- Every existing three-argument `rules.step` call site compiles unchanged.
- `sim/loop`'s header, `rules/index.ts:4` and `machine.ts:85-91` quote the three-argument form or its absence. They are updated in the same change.
- `AD-20` stays the next claimable id.

### The golden budget

- The two top-level `…Ms` tunables add four blocks per golden.
- `slingWiring` moves `header.tableHash` on all five.
- `header.physicsVersion` does not move, because `PHYSICS_VERSION` hashes only solver constants and the tick rate.
- No golden starts a game, so the search, the recover and the pop pulse cannot fire in one.
- `button_released` is a device event that never enters `SemanticEvent` or `GameState`, and the held set is closure state. Neither is hashed.
- The DW-187 fix moves nothing (measured).

This is a header-only refresh, with the 2.4, 2.9 and 2.10 precedents.

### The search's seat and timing

- **Seat.** `ball-search.ts` is driven from inside `ballController.step()`, so the ball controller issues every serving pulse (AD-18).
  - `observe()` runs first, every tick.
  - `step()` runs **after** the Start and drain handling, so a drain that ends the ball idles the search on the same tick. `startBall()`'s `reset()` also lands in that same step.
- **Tilt.** The tilt stage runs before the controller, so a Tilt engaging on tick t already suppresses that tick's shooter slot.
- **Latency.** Commands land on t+1 (AD-4). A recover's report returns to rules on t+1, having been consumed before that step's physics. So the correction runs **before** `applyDeviceEvents`.

**"`ballsInPlay` is corrected from slot switches".** After a recover, every simulated ball is inside a device. A ball on the plunger tip is inside `bd_shooter` on both sides of the seam: physics keeps it, and with DW-187 fixed, rules no longer count it. So the count of balls outside every device is 0 by construction.
- **The slot switches decide the serve.** The trough serves only while the lane reads empty. A ball already waiting in the lane satisfies "a new ball is served", and serving another would stack two on the tip.
- **`ball_missing` is always emitted.** It fires for every recover, including `count: 0`.

**Why the shooter slot is tilt-guarded but the trough slots are not.** 2.11 shipped "no autolaunch into a tilted playfield" through the controller's guard at `:653`. `c_autolaunch` is never disabled, so the search keeps that promise the same way. A trough serve under Tilt only places a ball in the lane. Sling and pop pulses under Tilt are issued, and physics swallows them (AD-5, DW-74).

### Ledger entries touched (Rule 17 inbox: DW-187)

- **DW-187** (`routed`, owner `2-12-ball-search`): **addressed** by tasks 1–2, ACs 12–13, the contract's serve-pairing rows and the section above. Sub-findings (a) and (c) are declined with reasons; (b) is touched only as stated.
- **DW-230** (`wontfix-accepted`): not fired. `awaitingSaveLaunch` is set only by a save at `ballsInPlay` 0, and it is consumed at the re-served ball's paired arrival. No search runs at 0, and the search's trough serve cannot meet a stale flag.
- **DW-222** (resolved by 2.11): its coupling is settled.
- **DW-241:** decided by-design. **DW-244:** still undecided, and the design stays neutral.
- **New finding, not ledgered by this stage:** the Ramp-entrance deck gap. It is in frontmatter `deferred` for the lead's harvest (Rule 15).

### Consumes, Consumed-by, Integration ACs (Rules 1, 2)

**Consumes:**
- Stories 1.5 and 2.1d: parking, `eject_failed`, and the eject pose inside `s_shooter_lane`.
- `sim/loop` (Epic 1): the per-tick button edges from consecutive frames (`buttonSwitchEdges`), the producer beneath `button_pressed` and `button_released`.
- Story 2.2: the pop's radial kick and `popWiring`.
- Story 2.3: the drop bank and its reset, and the overflow latch.
- Story 2.4: the devices layer, `PLAYFIELD_SWITCHES`, `button_pressed` and the lifecycle input.
- Story 2.5: `startBall()`, `applyDeviceEvents()` and `HARDWARE_COILS`.
- Story 2.7: `TABLE.flipperButtonWiring`, the structural source of the flipper buttons.
- Story 2.9: `awaitingSaveLaunch` and its tilt guard, and the save re-serve's early return.
- Story 2.11: `machine.tilt` and the disable batch.
- DW-74: the `enabledPulses` gate.
- DW-187: the ledger entry this story closes.

**Produced here, and consumed here:**
- **`button_released { button }`.** The producer is the devices layer (`src/sim/rules/devices/index.ts`, task 12). The consumer is ball search's held set (`src/sim/rules/ball-search.ts` via `ballController.step()`, tasks 13–14). The integration is AC 4c, where a real loop's release moves the search to the resumed tick in `FrameOutput`.
- **The machine report.** The producer is physics (`recovered`, failures). The forwarder is `sim/loop`. The consumer is the ball controller (AC 2).
- **The bank-reset request.** The producer is ball search. The consumer is the drop-bank component (AC 7).

**Consumed-by:**
- **Story 2.13 (Match, game over, Attract):** the search is `phase`-gated, so 2.13's transitions stop it for free. The empty-trough `eject_failed` after repeated recoveries (frontmatter `deferred`) is the one end state a game could reach there.
- **Story 3.2 (the Lock arbiter):** it inherits `bd_lock`'s two fixed search slots, the `bd_lock` overflow answer and the `c_mouth` skip.
- **Story 3.7 (Quick multiball):** `RecoverCommand` despawns *every* loose ball, so a multiball search needs 15 s of total silence and then recovers all of them. The served-arrival pairing is one-to-one per batch.
- **Epic 4:** `ball_search_started` is available to a flasher or sound cue. None is added here.
- **`button_released`:** available to later consumers, such as Epic 6's initials entry and mode selection. None is pre-built.

**Integration ACs:**
- AC 2: `sim/loop` carries physics' `recovered` to the ball controller, observed in `FrameOutput`.
- AC 4c: the devices layer's `button_released` reaches ball search through a real loop.
- AC 7: the drop-bank component consumes the request.
- AC 12: DW-187 through real plunger input.

Each runs against real instances, never mocks. AC 2's and AC 4c's capture wrapper returns the real machine unchanged.

### Anti-vacuity plan, by named shape

- **Vacuity #43:** the search tunables are never overridden. `15000`, `250`, `2750` and the slot ticks are literals at the probe, and so are AC 4's `35401`, `R+14999` and `O+25750`. The mutation "set `ballSearchMs` to 1" must redden AC 1. The only override used is `NO_BALL_SAVE_TUNING`, which touches no tunable under test.
- **Vacuity #51:** every negative has its positive in the same test, on the same instrument:
  - no `ball_search_started` / the start on the bound;
  - no Recover / the uncancelled control;
  - no serve / the lane-empty serve;
  - no `c_mouth` / the O+17000 and O+17250 device commands;
  - no Lock-overflow answer / the trough overflow answer in the same report;
  - no second pass / the pass that ran;
  - no shooter pulse while tilted / the untilted twin;
  - `ballsInPlay` 0 after the roll-back / 1 on the weak plunge's own tick;
  - **no search while held / the resumed search on the same cup run** (4c), and the cradle's own drain and `ball_ended` on its release;
  - **no search while held across the ball boundary, mid-pass, or tilted / each run's resumed tick** (4d);
  - **no `button_released` for `s_top_2` / the four buttons' releases** (AC 14).
- **Vacuous premises refused.** AC 2's and AC 4c's stuck balls assert their own stability and distance to every zone in `FrameOutput`. The distance is computed from the committed document's zones, never assumed.
- **Vacuity #44:** the expected stage list, the resumed ticks and AC 13's counts are authored literals, never a second call of the module's own derivation.
- **Vacuity #48:** every mutation below is re-walked at the final tree if its target line moves.
- **Traps:**
  - `toPhysics()` negates y, and the table frame's y rises up-table.
  - Tilt warnings carry across a player's balls.
  - `game_over` is terminal until 2.13.
  - No flipper or plunger is rendered (DW-249).
  - `NullEngine` rasterises nothing.

### Coupling to DW-241 / DW-244 / DW-222

**DW-241 is settled** (by-design; AD-5, amended). `c_autolaunch` stays enabled under Tilt, game over and Attract, and this story adds none of the three tilt additions.

**DW-222's coupling is settled.** Its shape, a served ball at `ballsInPlay` 0, can still be plunged. So no search is needed, and none runs.

**DW-244 is still undecided, and the design stays neutral.** The search is `phase`-gated and never serves into an occupied lane.
- Under today's phase-only Start, a new game begun while a voided ball is still live carries a stale `ballsInPlay` ≥ 1 (DW-187(c)). That game may run a search after 15 s of silence. That is a side effect, not a design goal.
- If the author decides "refuse Start until balls are home" or "reuse the resting ball", nothing here changes.

**Where the search runs.**
- **While tilted: yes.** Disabled slings and pops swallow their pulses, the shooter slot issues nothing, and the trough slots and the recover behave as untilted. A held button still pauses it (design point 2).
- **In `game_over` and `attract`: no**, by the phase gate. The held set is still tracked there.
- **With a ball on the plunger tip:** that ball is always at `ballsInPlay` 0 once DW-187 is fixed, so the search is not involved.
- **What `RecoverCommand` counts as inside `bd_shooter`:** a ball whose centre is inside the device's entry zone, by the same instant box test `launch()` uses. That ball is never despawned.

## Verification

**Commands.** In every shell, first export `BLENDER="C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe"`. A result of `0 skipped` is the proof that it was exported.
- `pnpm typecheck`: exits 0 across all three tsconfigs. A missing `describeEvent` arm fails here first.
- `pnpm test`: 0 failing and **0 skipped**.
  - Measure the baseline at your own tree before editing. Do not transcribe the epic context's 117 files and 1971 tests.
  - Account for the delta: four new test files, plus new and amended cases in `test/rules-devices.test.ts`, `test/contracts.test.ts` and `test/tuning.test.ts`.
- `pnpm lint:boundaries`: prints `OK -- N .ts file(s)`, where N is one higher than the baseline you measure (`ball-search.ts`).
- `pnpm check:headers` and `pnpm check:attributions`: exit 0. `ball-search.ts` and the four new test files carry the GPL-3.0 header.
- `pnpm check:ad7`: exits 0 with **exactly 3** passing tests.
- `pnpm check:corridor`: exits 0.
- `pnpm check:reachability`: exits 0 over its 52 cases.
- `git ls-files --others --exclude-standard test/`: lists only the four new test files. The golden harness must never appear.
- `git diff --stat -- public/assets/`: empty.
- `git grep -n "col_test_cup" -- src/`: no match. The cup exists only inside `test/ball-search-integration.test.ts`.
- `git diff -- src/sim/table/dragonwar.ts`: only the `slingWiring` block.

**Manual checks:**
- **The DW-187 checkpoint (task 2).** Before any contract, table or tuning edit, `test/replay-goldens.test.ts` is green with no golden file modified.
- **Structural golden comparison (authoritative).** For each golden, parse the JSON at `efe14f5` and at HEAD, and compare field by field. Never use a substring grep.
  - `header.gameStart.tuning` gains exactly four blocks, in `resolveTuning()` order.
  - `header.tableHash` changed.
  - `notes` is a strict append.
  - Every other field is deeply equal:
    - in the header: `assetHash` `ab163ff`, `physicsVersion` `v1-ce6772ef`, `tickHz`, `physicsSeed` and `gameStart.{seed,adjustments,highscores}`;
    - in the body: `transitions`, `coilPrologue`, `durationTicks`, `expectedHash` and `expectedGameStateHash`;
    - for `roll-and-drain` also: `checkpointTicks` and `expectedCheckpointHashes`.
- Confirm `HARDWARE_COILS` is unchanged (7 coils) and still excludes `c_autolaunch` and `c_dragon_bank_reset`.
- Re-read `machine.ts:85-91`, `loop/index.ts:9-15`, `rules/index.ts:4`, `ball-controller.ts:16-31` and `:50-65`, and `devices/index.ts:9` and Stage 3's comment. Each must describe the new behaviour rather than predict or deny it.
- **The seam's isolation.** Confirm the following in `test/ball-search-integration.test.ts`:
  - `vi.doMock` is called only after `vi.resetModules()`, and `createLoop` is imported only after both;
  - the wrapper returns the real machine unchanged;
  - `place()` writes nothing but one ball's position and its three velocity fields, between two `advance()` calls.
- **Browser smoke (the lead's).** No flipper or plunger is rendered (DW-249), but the ball's own motion is visible.
  - **DW-187:** press Start, tap the plunger for well under 100 ms, and watch the ball roll back onto the tip. Give a full plunge and let the ball drain. The Backglass must advance to ball 2.
  - **A held cradle is never searched (decision 6):**
    - Give a full plunge while holding the left flipper key, so the ball cradles on the left flipper. Keep holding for well over 20 s. No new ball may appear in the shooter lane, and the cradled ball must stay.
    - Release: the ball rolls off and play continues.
    - Aimed play cannot lodge a ball in smoke, so the recover itself is pinned by AC 2, not by the smoke.

**Rule 19 mutations: at least one pinning mutation per AC.** State the expected red before each run. Revert from a saved copy, never with `git checkout --` or `git stash`, and confirm afterwards that `git status --short` and `git diff --stat` are unchanged.

| AC | Mutation | Expected red |
| --- | --- | --- |
| AC 1 | Change the start check `>=` to `>` | The bound probe: no event at O+15000. |
| AC 1 | Set `ballSearchMs` to `1` in `tuning.ts` | The same test, proving the tunable is on the path. |
| AC 1 | Issue the Lock device's slots (drop the `lockLaneWiring.device` skip) | "No `c_mouth`": a pulse appears at O+16500, while the same test's O+17000 positive stays green. |
| AC 2 | `recover()` despawns nothing and returns 0 | At S+2751, `ball_missing { count: 0 }` instead of `count: 1`, and `snapshot.balls.length` stays 2 with the cup ball still present. |
| AC 2 | Decrement on every non-parking arrival (drop the serve pairing) | `ballsInPlay` is 0 at S+2251, the search goes idle, and no `ball_missing` arrives. |
| AC 2 | Make `recover()` also despawn the entry-zone ball | `snapshot.balls.length` reads 0, and `count` reads 2. |
| AC 3 | Remove the lane-occupied check on the recovery serve | The occupied run issues `c_trough_eject`, while the empty-lane positive stays green. |
| AC 4 | Fold closures into the origin only while the search is idle | 4a: the Recover still arrives. |
| AC 4 | Remove the pause (ignore the held set) | 4c: the cup's search arrives at 15401 while held. The cradle is searched at its last closure + 15000, then recovered. 4d's hold rows redden. |
| AC 4 | A flipper press or release restarts the origin | 4c: the cup's search moves to 40401. 4d's tap row lands at O+19001. |
| AC 4 | Clear the held set at `ball_will_start` | 4d's ball-boundary row: a search at O2+15000 while held. |
| AC 4 | Ignore a hold while a pass runs | 4d's mid-pass row: `c_pop_2` at O+15750. |
| AC 4 | Count a Start `button_pressed` as activity | 4b: the start moves. |
| AC 4 | Pause only while `!machine.tilt.tilted` | 4d's tilted row: a search at O+15000. |
| AC 5 | Answer a `bd_lock` overflow with its `ejectCoil` | The tolerance assertion: `c_mouth` appears beside the trough answer. |
| AC 5 | Remove the `device_overflow` branch | The trough overflow: no pulse. |
| AC 6 | Remove the search's tilt guard | The tilted twin: a `c_autolaunch` pulse appears at O+17000. |
| AC 6 | Drop the `phase === 'game'` conjunct | The Attract and game-over rows. |
| AC 7 | Have `ball-search.ts` push `pulse TABLE.dropBankResetCoil` directly | The "controller emits no reset command" assertion. |
| AC 8 | Make `recover()` also despawn the entry-zone ball | The kept-ball assertion. |
| AC 9 | Make `applyPulses` a no-op | The kick assertion reddens, and the disabled control stays green. |
| AC 10 | Revert one golden's `gameStart.tuning` | `StaleReplayHeaderError` on exactly that golden. |
| AC 10 | Remove one key from `scalarKeys` | The ratchet, with its named message. |
| AC 11 | Template `event.tick` into a wrong arm | The executing assertion. |
| AC 12 | Today's code, run first (task 1); afterwards, the reverted decrement | `ballsInPlay` 1 after the roll-back. **Observed (build-auto step 3, 2026-09-11), by a surgical revert of just the pairing branch in `ball-controller.ts`'s `applyDeviceEvents` (restored immediately after, `git status --short`/`git diff --stat` confirmed unchanged before and after): `ballsInPlayAfterRollback=1`; `secondLaunchCount=1`, `ballsInPlayAtSecondLaunch=2`; over the full 20,000-tick drain-wait window `ball_ended` never fired even though the ball physically reached the trough (`finalTrough=[true,true,true,true]`), leaving `finalBallsInPlayAfter20000Ticks=1` -- a genuine hard hang, matching this row's and task 1's predicted values exactly. Re-run afterward on the restored fix: green (`pnpm vitest run test/rules-rollback-accounting-integration.test.ts test/replay-goldens.test.ts test/rules-devices.test.ts test/rules-lifecycle.test.ts test/rules-ball-save.test.ts test/rules-tilt.test.ts` -- 6 files, 187 tests, all passing, no golden touched).** |
| AC 13 | Drop the pairing condition | The served-pair case reads 0. `two-ball-collision` also reddens, because its t=196 serve arrives with `ballsInPlay` 1. |
| AC 14 | Drop the opening-edge branch | The four `button_released` are absent, and 4c's cup positive never arrives. |
| AC 14 | Emit `button_released` on every opening edge | `s_top_2`'s open yields a release. |
| I/O matrix, "Restarted timeline" | Neutralize the reset-safety guard (`ball-search.ts`'s `if (pass !== null && pass.origin > tick) { pass = null; }`) | `test/rules-ball-search.test.ts`'s dedicated reset-safety test (build-auto step 3 addition, Matrix Test Audit): the stale mark fires anyway. Confirmed red with the guard disabled, green restored, source byte-identical after (md5 `366f0dc04c18f73a303cf52cc95ff962`). |

### QA pass, 2026-09-11 -- falsification of every AC not already demonstrated at the AD gate

The AD gate had already demonstrated three mutations (AC 2's `recover()` despawn-nothing, which also reddens AC 8's "the loose ball is gone" assertion; AC 4's held-flipper pause via `!held &&`; AC 12's DW-187 revert, logged above). This pass audits and falsifies every other AC and the named I/O-matrix rows, each following Rule 19: name the mutation, apply it, confirm red, revert from the edit (never `git checkout --`/`git stash`), confirm `git status --short`/`git diff --stat` unchanged. All 17 mutations below were applied and reverted individually; the tree was confirmed byte-identical after every single one, and again after the full pass (`git diff --stat` shows only this spec file and the two test-file amendments noted in Decisions).

| AC / row | Mutation | Test that went red |
| --- | --- | --- |
| AC 1 (stage schedule) | `ball-search.ts`: `pass.quietTicks >= threshold` to `>` | AC 1's own test ("nothing through O+14999 ... c_mouth never appears"): the O+15000 slot shifted to O+15001. Also reddened AC 4d's mid-pass test (shares the same bound check). |
| AC 1 / the Lock issuing nothing | `ball-search.ts`: `guardFor()`'s `name === lockDevice` Lock guard neutralized | AC 1's own test, at "the Lock's first slot issues nothing": `c_mouth` appeared at O+16500, reddening the "no command names c_mouth" assertion. |
| AC 3 (recover's rules-side answers) | `ball-controller.ts`: dropped `!nextState.machine.deviceSlots.bd_shooter[0]` from the recovery-serve guard | AC 3's first test, both the "occupied does not serve" and "no second ball_search_started" sub-assertions. |
| AC 3 / recover outside a game | `ball-controller.ts`: dropped `nextState.phase === 'game' &&` from the recovery-serve guard | AC 3's first test, specifically the Slam/attract sub-case: a `c_trough_eject` pulse appeared under `phase: 'attract'`. |
| AC 4a (closure cancels) | `ball-search.ts`: `observe()`'s closure fold guarded to `closed && pass === null` (a running pass no longer cancels) | AC 4a's own test: the cancelled pass still reached its own `RecoverCommand` at O+17750 instead of being cut off at C. |
| AC 4b (non-playfield closures) | `ball-search.ts`: `observe()`'s `button_pressed` fold widened from `flipperButtons.has(event.button)` to every button | AC 4b's own test: Start's press paused the timer, so `ball_search_started` never landed at O+15000 within the test's window. |
| AC 5 (device failure vocabulary / overflow answer) | `ball-controller.ts`: neutralized the `device_overflow` loop (forced its body to always `continue`) | AC 5's first test: the `bd_trough` overflow's `c_trough_eject` pulse disappeared. |
| AC 6 (tilted) | `ball-search.ts`: `guardFor()`'s non-parking `tilt` guard neutralized | AC 6's second test: a `c_autolaunch` pulse appeared at O+17000 while tilted. |
| AC 6 (not-in-play) | `ball-search.ts`: dropped `state.phase === 'game' &&` from `inPlayNow` | **Vacuous against every pre-existing test first** (0 of 77 tests in the four ball-search files reddened -- every existing non-'game' case also had `ballsInPlay` 0, so it could not discriminate the phase conjunct from the ballsInPlay conjunct). A new sub-case was added to AC 6's own first test (`phase: 'attract', machine: { ballsInPlay: 1 }`, a synthetic-but-defensive state) and confirmed green on unmutated code, then red under this mutation, then the mutation was reverted with the new test kept. See Decisions. |
| AC 7 (bank reset through its owner) | `ball-search.ts`: `applyStage()`'s `bankReset` case changed to push `pulse TABLE.dropBankResetCoil` directly instead of a `bank_reset_requested` request | AC 7's own headless test: `c_dragon_bank_reset` appeared in the ball controller's own `coilCommands`, reddening the "no c_dragon_bank_reset in its own coilCommands" assertion. |
| AC 8 (recover keeping the shooter ball) | `devices.ts`: `recover()`'s `insideADevice` forced to `false` unconditionally | `test/ball-search-physics.test.ts`'s AC 8 test: `recovered` rose from 1 to 2 (both balls despawned), reddening "exactly one ball is outside every device". |
| AC 9 (commanded pop kick) | `pops.ts`: `applyPulses()` made a no-op (returns empty `contactEvents` before doing any work) | `test/ball-search-physics.test.ts`'s AC 9 test: the ball's speed stayed at 0 instead of rising off rest. |
| AC 10 (tunables ratchet) | `test/tuning.test.ts`: removed `'ballSearchMs'` from the `scalarKeys` list | The ratchet's own completeness assertion ("every top-level TuningEntry must be listed in scalarKeys above"): `declared` (derived from live `TUNING`) no longer matched the (now short) `scalarKeys`. |
| AC 10 (goldens / the tuning-drift detector) | `sim/loop/replay.ts`: `assertHeaderMatchesLiveEnvironment()`'s tuning-canonical comparison neutralized (`false && headerTuningCanonical !== liveTuningCanonical`) | `test/replay-goldens.test.ts`'s existing "a golden whose resolved tuning no longer matches the live resolveTuning() output fails naming the tuning, not the hash" test. This is the SAME whole-object canonicalized-JSON comparison a stale `ballSearchMs`/`ballSearchStepMs` block in a golden's own `header.gameStart.tuning` would trip -- confirming the mechanism the "goldens" I/O row depends on is genuinely wired, without needing to hand-edit a committed golden file. |
| AC 10 | `resolveTuning() derives ballSearchTicks/ballSearchStepTicks` -- no existing test asserted this DIRECTLY (only indirectly, through the search's own schedule assuming the 1:1 conversion at TICK_HZ 1000). A new test was added (`test/tuning.test.ts`, "AC 10: ballSearchMs ... and ballSearchStepMs ... derive ..."), confirmed green, then falsified | `tuning.ts`: `ballSearchMs`'s value changed 15000 -> 15001 reddened the new test's `msEntry.value` assertion. Reverted; new test kept. See Decisions. |
| AC 11 (the new event in the closed union) | `test/contracts.test.ts`: `describeEvent()`'s own `ball_search_started` arm re-templated to drop `${event.tick}` | The "narrows exhaustively on type" test: `'ball search started'` != `'ball search started at 19'`. |
| AC 13 (served arrival never counted as a return) | `ball-controller.ts`: `applyDeviceEvents()`'s pairing condition (`remaining > 0`) forced to `false` | `test/rules-devices.test.ts`'s AC 13 test: the paired-arrival case's `ballsInPlay` read 0 instead of 1 (expected `1`, got `+0`). |
| AC 14 (`button_released`) | `sim/rules/devices/index.ts`: Stage 3's opening-edge `button_released` emission removed | `test/rules-devices.test.ts`'s AC 14 test, plus the two amended Plunger/Start tests (3 tests total) -- all four buttons' releases disappeared. |

**mutations_demonstrated=17** (this QA pass), on top of the AD gate's own 3 and the implement stage's own 2 (AC 12's DW-187 revert and the "Restarted timeline" reset-safety guard, both logged above with their own Observed records) -- 22 named, falsified mutations covering every acceptance criterion and every I/O-matrix row this stage's brief named.

## Auto Run Result

Status: done
Blocking condition: none

### Implement + review record, 2026-09-11 (build-auto)

**Summary of implemented change.** Story 2.12's ball-search sub-module (`src/sim/rules/ball-search.ts`) is built and wired: a structurally-derived stage list (slings, pops, a bank-reset request, each ball device's `ballSearchOrder` pulses, one `RecoverCommand`) issued at `ballSearchStepMs` intervals after `ballSearchMs` of total playfield silence with a game ball in play; a held flipper pauses the pass and resumes it, never restarts it, including across a ball boundary. Physics gained `RecoverCommand` handling (`DeviceMechanics.recover()`) and a commanded pop-bumper pulse (`PopMechanics.applyPulses()`). The machine report (physics' `recovered` count and failure events) now reaches rules through an optional fourth `rules.step` argument (AD-4, amended). DW-187 (a weak plunge's rolled-back ball staying double-counted) is fixed via same-batch serve-arrival pairing in `applyDeviceEvents`, observed RED on today's pre-fix code (task 1, before the fix landed) and GREEN after, per Rule 19 -- both independently re-confirmed by this build-auto pass via a surgical, restored revert of just the pairing branch (see Verification below).

**Files changed:**
- `src/sim/rules/ball-search.ts` (new) -- the ball-search module itself.
- `src/sim/rules/ball-controller.ts` -- DW-187's serve-pairing fix; the search's wiring into `step()`; `applyRecovery()` export.
- `src/sim/rules/index.ts` -- the optional fourth `machineReport` argument; recover-command/bank-reset-request forwarding.
- `src/sim/rules/devices/{events,index}.ts`, `drop-bank.ts` -- `button_released`; the bank-reset request lifecycle input and its `onResetRequested()` handler.
- `src/sim/physics/devices.ts` -- `DeviceMechanics.recover()`.
- `src/sim/physics/pops.ts` -- `PopMechanics.applyPulses()`, the commanded pop kick, factored to share `radialKickVelocity()` with the existing switch-edge kick.
- `src/sim/physics/machine.ts` -- recover/pulse pre-step wiring, `recovered` in `MachineStepResult`.
- `src/sim/loop/index.ts` -- widens the pending-command queue for a recover marker; forwards the machine report to `rules.step()`.
- `src/sim/contracts/{commands,events}.ts`, `src/sim/table/names.ts` -- `MachineCommand`, `BallSearchStartedEvent`, `MachineReport`.
- `src/sim/table/dragonwar.ts` -- `TABLE.slingWiring`.
- `src/sim/table/tuning.ts` -- `ballSearchMs` (15000), `ballSearchStepMs` (250).
- `test/rules-rollback-accounting-integration.test.ts` (new) -- the DW-187 pinning test (task 1/AC 12), real `createLoop`.
- `test/ball-search-physics.test.ts` (new) -- AC 8/9 at the physics level.
- `test/rules-ball-search.test.ts` (new) -- headless coverage of AC 1, 3, 4a, 4b, 4d (including this pass's added "ball boundary" case), 5, 6, 7's headless half, the "Restarted timeline" I/O-matrix row (this pass's addition), and the applyRecovery/DW-187 supplements landed in `test/rules-devices.test.ts` instead (see below).
- `test/ball-search-integration.test.ts` (new) -- real-loop AC 2, 4c, 7, built on the spec's own designed test-only V-cup collision fixture (rebuilt during this pass after an earlier deviation -- see below).
- `test/rules-devices.test.ts` -- AC 13/14, and this pass's new `applyRecovery()` direct pinning tests.
- `test/contracts.test.ts`, `test/tuning.test.ts`, `test/rules-ball-save.test.ts`, `test/rules-devices-headless.test.ts`, `test/util/switch-script.ts` -- supporting amendments (the new event/tunable wiring, the fourth `machineReport` script argument).
- `test/replays/{roll-and-drain,hold-and-release,full-plunge,nudge-coupling,two-ball-collision}.golden.json` -- header-only refresh (see Golden change below); this pass also removed a duplicated notes paragraph the refresh harness had appended twice.

**Review findings breakdown (2026-09-11 pass, detailed triage log above):**
- **patch (4, all fixed):** duplicated golden `notes` paragraph in all 5 goldens (low); a dead, miscomputed test-local variable (low); `applyRecovery()`'s missing direct reference-equality pinning tests (low); AC 4d's "hold that spans a ball boundary" -- a documented design guarantee with zero prior test coverage, confirmed by the verification-gap review layer via full-tree grep (medium).
- **defer (4):** a commanded pop pulse kicks only the first ball found in a shared skirt zone (multiball, Story 3.7); a `device_overflow` on the ball-save early-return path is unanswered (same-tick multi-device interaction, Story 3.7); the quiet-tick clock's accrual has no explicit in-play gate (unreachable under production tuning); duplicated `servesInto` type-narrowing casts across two files (a style nit, not an AD violation). All recorded in frontmatter `deferred` with evidence and severity `low`.
- **reject (5):** a fabricated "recover() throws" claim (the actual code silently skips, and the scenario is unreachable against the verified `TABLE`); a fabricated line-range claim in `rules-ball-save.test.ts` (the file is 916 lines; the cited range does not exist); cosmetic-only JSON re-serialization noise in one golden's `checkpointTicks` (no value change); an AD-18 ownership-surface "ambiguity" the reviewing auditor itself resolved as consistent with the contract's own text; a missing multi-ball recover() test against an implementation that (verified by direct reading) already handles multiple balls correctly, with AC 8's own Given being explicitly single-ball.
- **Follow-up review recommendation:** patched-only counts this pass: 0 high, 1 medium, 3 low. Score = 3x1(medium) + 1x3(low) = 6 >= 5, so `followup_review_recommended: true`.

**Verification performed.**
- `pnpm typecheck`: clean (all 3 tsconfigs), both before and after this pass's patches.
- `pnpm test`: 2006 passed, 0 failed, 0 skipped, 121 files (5 new tests this pass: 4 `applyRecovery()` pins + 1 AC 4d ball-boundary case, over the 2001 the implement stage left).
- `pnpm lint:boundaries`: OK, 108 files.
- `pnpm check:headers`, `check:attributions`: OK.
- `pnpm check:ad7`: OK, exactly 3 passing tests (unchanged).
- `pnpm check:corridor`, `pnpm check:reachability`: OK (52 cases).
- `git ls-files --others --exclude-standard test/`: exactly the four new test files.
- `git grep -n "col_test_cup" -- src/`: no match. `git diff --stat -- public/assets/`: empty.
- `git diff -- src/sim/table/dragonwar.ts`: only the `slingWiring` block.
- **DW-187, Rule 19, independently re-confirmed this pass.** A surgical, temporary revert of just the serve-pairing `else` branch in `applyDeviceEvents` (not a full-file revert, which would also pull in this story's unrelated ball-search wiring) reproduced the RED state on `test/rules-rollback-accounting-integration.test.ts` genuinely: `ballsInPlayAfterRollback=1`, `secondLaunchCount=1` with `ballsInPlayAtSecondLaunch=2`, and over a full 20,000-tick drain-wait window `ball_ended` never fired despite the ball physically reaching the trough (`finalTrough=[true,true,true,true]`), leaving `finalBallsInPlayAfter20000Ticks=1` -- matching the spec's predicted values exactly. Restored (md5 identical to the pre-revert file), then re-confirmed GREEN on the checkpoint suite (`test/rules-rollback-accounting-integration.test.ts test/replay-goldens.test.ts test/rules-devices.test.ts test/rules-lifecycle.test.ts test/rules-ball-save.test.ts test/rules-tilt.test.ts`, 6 files / 187 tests, all passing, no golden touched). Recorded verbatim next to the AC 12 mutation-table row.
- **The "Restarted timeline" I/O-matrix row, added this pass.** The Matrix Test Audit found this row (a stale origin mark discarded across a tick restart) had no covering test anywhere in the suite. Added a direct unit-level test against `createBallSearch()` in `test/rules-ball-search.test.ts`; confirmed RED against a named mutation (neutralizing the `pass.origin > tick` discard guard), confirmed GREEN restored, source byte-identical after (md5 verified).
- **AC 4d's ball-boundary case, added this pass.** Confirmed RED against a named mutation (`reset()` also clearing `heldSince`), confirmed GREEN restored, source byte-identical after (md5 verified).
- **Goldens: structural, field-by-field comparison, this pass's own independent re-verification.** All five goldens differ from `efe14f5` only in `header.tableHash`, exactly four new `header.gameStart.tuning` blocks, and a strict-append `notes` (now de-duplicated by this pass's patch); every other field (`assetHash`, `physicsVersion`, `tickHz`, `physicsSeed`, `gameStart.{seed,adjustments,highscores}`, `transitions`, `coilPrologue`, `durationTicks`, `expectedHash`, `expectedGameStateHash`, and `roll-and-drain`'s `checkpointTicks`/`expectedCheckpointHashes`) is byte-identical. No trajectory or state-hash re-record occurred; the Block-If condition never triggered.

**Golden change.** Header-only refresh across all five goldens (tableHash + 4 tuning blocks + notes), exactly as pre-planned and pre-authorized -- no trajectory or state-hash moved. One golden-refresh artifact (a duplicated notes paragraph) was found and fixed during this pass's review triage; it carried no semantic weight (it did not touch any hash or assertion field) but was corrected for provenance-trail cleanliness.

**Test-only V-cup instrument, rebuilt during this pass (before the four-layer review ran).** The first implementation pass substituted a per-tick position/velocity re-pin for the spec's own designed AC 2/4c instrument (a genuine, natural-equilibrium test-only V-cup collision fixture) and asserted tick offsets it measured fresh against that substitute, not the spec's own literal offsets. A fresh, narrowly-scoped subagent rebuilt `test/ball-search-integration.test.ts` to the spec's own design: the real V-cup fixture (`col_test_cup_l`/`col_test_cup_r`, apex (165, 240)), a single `place()` teleport, and the cup's own real contact physics holding the ball for the run. Measured this run's own cup stability (0.0264 mm max drift, bound <=0.1 mm; 97.93 mm to the nearest switch zone, bound >90 mm) and reproduced the spec's literal relative tick offsets exactly (S+1252, S+2001, S+2251, S+2501, S+2751). This correction is recorded in the spec's own Tasks & Acceptance (task 17's "Implement-pass correction" note) for provenance.

**Residual risks.**
- The four newly-deferred items (frontmatter `deferred`, this pass) are real but require multiball (Story 3.7) or a pathological custom tuning to become reachable; none is reachable in this story's own single-ball, production-tuning scope.
- `followup_review_recommended: true` (score 6) -- the lead's own next gate should take a further look at this pass's patches, per the standing threshold, even though every patch was independently verified (tests run, and the two most substantive ones red/green mutation-tested) before this record was written.
- The browser smoke check the spec names as the lead's own manual verification (DW-187 and the held-cradle, watched visually) was not performed in this headless build-auto session -- unchanged from the implement stage's own report, and explicitly outside `pnpm test`'s scope per the spec's own "Manual checks" heading.

### Plan-stage record, 2026-09-11 (re-plan cycle 3, after decision 6)

- **Dispatch.** `spec-2-12-ball-search.md Halt after planning.` ran on a `draft` spec committed at `ddbd946`, on `DW-1-epic2`, with a clean tree.
  - The previous cycle-3 attempt died on a network failure before writing. Its scratch probes survived in the session scratchpad and were **re-run** here, not transcribed.
  - The committed `epic-2-context.md` was reused, not recompiled.
  - The intent contract is preserved byte for byte; the splice was verified against HEAD's block. Everything else was re-derived.
- **Ledger inbox:** DW-187 (`routed`, owner `2-12-ball-search`), addressed as in Design Notes.
- **Measurements.** All scratch probes ran from the scratchpad with their own vitest config, never under `test/`. `git status --short` was empty after each run.
  - **Cradle release** (`probe212c/cradle-release`):
    - pressed at 1703; `ball_launched` at 1722; last closure `s_inlane_l` at 4907;
    - settled by 6035 within 1 mm (spread 0.978 mm), 76.9 mm from `s_drain`;
    - no search while held; released at 31704;
    - `s_drain` closed at +536, `ball_ended` at +593.
  - **Cup, no hold** (`probe212c/cup-nohold`): T 400, L 401, S 15401.
    - Settled by L+98. The spread over L+3000 to S+2750 was 0.0147 mm, and 97.9 mm from `s_inlane_l`. No closure.
    - `bank_reset` at S+1252, `eject_failed:bd_shooter` at S+2001, trough 3→2 with the lane rising at S+2251 and `ballsInPlay` 1, and the trough still 2 at S+2501.
  - **Cup with an empty hold** (`probe212c/cup-loop`): P 5401, R 25401, S 35401. The same offsets, no closure, and the cup ball moved 0.0016 mm through the pass.
  - **Cup attractor:** six placements settle within 0.03 mm of (165.00, 259.09).
  - **Natural pocket** (`pockets`, `creep`, `fallpath`, `pocket-loop`): a single resting cluster at the Ramp entrance. It rattles at up to 7 mm/s, and its neighbours sink through the deck. Rejected as an instrument, and recorded in frontmatter `deferred`.
- **Nothing committed.** The spec is the only file written in the repository.

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
