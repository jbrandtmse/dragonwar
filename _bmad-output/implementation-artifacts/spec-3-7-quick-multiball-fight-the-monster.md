---
title: 'Story 3.7: Quick multiball -- fight the monster'
type: 'feature'
created: '2026-10-13'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: [oversized]
deferred:
  - summary: >-
      A Mouth eject can create a ball on top of a ball that is in the Lock lane at the pulse tick, against FR-12 ("two balls never overlap"); first reachable once two balls are in play
    evidence: |-
      Measured 2026-10-13 at 5683305 (planning; a real createLoop(), machine.multiball state-injected, balls teleported; 130 runs with the Lock holding 2, ball A captured into slot 3 and ball B driven up the lane d ticks later). The Mouth spits straight down the Lock shot line (x = 170, y 460 to 135 over 676 ticks). Centre separation at the moment the spat ball is created, against a 26.99 mm ball: 24.4, 14.9 and 5.8 mm for d = 480, 500, 520 (B rolling back past the Mouth pose); 21.9, 20.5 and 8.2 mm for d = 1000 to 1010 (B passing upward); 26.7 down to 1.9 mm in the 800 mm/s series. What the solver does after an overlapping creation was not characterised; the same class of overlap at the trough (two trough pulses on one tick) dropped a ball through the playfield (z -58 mm).
      The spawn is physics (src/sim/physics/devices.ts applyCommands), which this story does not edit. The War (Story 3.8) fires the Lock at 500-tick intervals with a third ball in play.
    location: 'src/sim/physics/devices.ts (the parking eject); src/sim/rules/ball-controller/lock-arbiter.ts (pulseDueMouth)'
    severity: high
    footprint: out-of-footprint
  - summary: >-
      A Lock capture slower than lockCaptureWindowMs (180 ms) is parked and spat with no arbiter outcome: no lock credit in single-ball play, no strike in a multiball
    evidence: |-
      Measured 2026-10-13 at 5683305 (planning; 741 teleported zero-spin launches at a Lock holding 2: 19 speeds from 450 to 4000 mm/s, 5 angles, up to 11 lateral offsets). Of 359 captures, s_lock_lane-to-slot latency was 16 / 105 / 401 ticks (min / median / max) and 78 (21.7%) took longer than 180; those gave no lock_lane_entered, only the DW-171 park and a Mouth eject. On the centre line they are the 700 and 750 mm/s launches (316 and 217 ticks; 800 mm/s is 178). Zero-spin launches decelerate harder than a rolling ball, so the share by real input is not known; the real-input Lock witness captures in 63 ticks.
    location: 'src/sim/table/tuning.ts lockCaptureWindowMs; src/sim/rules/devices/index.ts (pendingLockLaneClosure)'
    severity: medium
    footprint: in-epic
  - summary: >-
      Two more one-record limits that two balls reach, the same class as DW-321: one pending Lock-lane closure (two balls in the lane inside the capture window give one outcome and one silent park) and one Ramp attempt in flight (two balls up the Ramp inside rampWindowMs give one shot_ramp_made, so Quick multiball pays one Ramp award for two)
    evidence: |-
      Probed 2026-10-13 at 5683305 (planning; runRulesScript on a real createRules()): s_lock_lane closed at 600 and 650 with slots at 690 and 740 gives one lock_lane_locked and a DW-171 park; s_ramp_enter at 100 and 200 with s_ramp_made at 400 and 500 gives one shot_ramp_made. On real physics (state-injected multiball, teleported balls) two captures 50 ticks apart gave one outcome event. SwitchEvent carries no ball id.
    location: 'src/sim/rules/devices/index.ts; src/sim/rules/devices/shots.ts'
    severity: medium
    footprint: in-epic
  - summary: >-
      A ball the Mouth returns drains unattended about 1.4 s after the pulse without closing a playfield switch, so every Lock-lane strike hands back a ball the player must flip at within about a second
    evidence: |-
      Measured 2026-10-13 at 5683305 (planning; a real createLoop(), 100 undisturbed spat balls across Lock occupancies 0 to 2): each reaches the trough 1402 to 1408 ticks after the c_mouth pulse and the first switch it closes is s_drain. An 80-tick left-flipper tap 950 to 1250 ticks after the pulse changes the path; a held left flipper cradles it. A feel question for the Story 3.11 playtest, not a defect in this story.
    location: 'the Mouth eject pose (Story 3.2); src/sim/table/dragonwar.ts bd_lock'
    severity: low
    footprint: in-epic
  - summary: >-
      Ball search's Lock stages release held balls while Quick multiball runs (the Mode publishes no timerTicks), leaving three balls in play with lockCredits unchanged; outside a multiball the same stage leaves two balls in play with machine.multiball null
    evidence: |-
      Probed 2026-10-13 at 5683305 (planning; runRulesScript, the shell active, the Lock holding 2): two Mouth sequences run and ballsInPlay ends at 3. Pre-existing behaviour (Story 3.2, FR-23 names only Mode timers). This story's one-ball stop and serve path tolerate it; credits without balls are Story 3.8's case ("fewer balls in the Lock").
    location: 'src/sim/rules/ball-search.ts:286-296'
    severity: low
    footprint: in-epic
  - summary: >-
      HostLoop.reset() called from inside onFrame leaves two requestAnimationFrame chains running
    evidence: |-
      Measured 2026-10-13 at 5683305 (planning probe on src/host/loop.ts): reset() from inside onFrame leaves two rAF callbacks firing per frame and stop() leaves one queued; test/host-loop.test.ts:488 covers only a reset from outside a frame. Not reached by Part B of this spec, which rebuilds inside createLoop() precisely so that the host never resets mid-frame.
    location: 'src/host/loop.ts:275-305'
    severity: medium
    footprint: out-of-footprint
  - summary: >-
      The dev tuning panel's hot-apply drops the boot GameStart (the real game seed is gone after any hot-apply), and with panel edits pending a recording is made on default tuning and played back on the overridden one
    evidence: |-
      Read 2026-10-13 at 5683305 (planning): src/host/dev/tuning-panel.ts:179 resets with tuning only; src/host/boot.ts:419-430 stamps the panel's tuning into the header while the recorded loop is reset bare. Part B of this spec makes the recorder and the player honour the stamped GameStart; the panel's own reset is left as it is.
    location: 'src/host/dev/tuning-panel.ts:179; src/host/boot.ts:419-430'
    severity: low
    footprint: out-of-footprint
---

<intent-contract>

## Intent

**Problem:** Quick multiball (`modes/quick-multiball.ts`, priority 400) is a shell: it starts at the Lock lane and does nothing. FR-35 asks for a second ball with its own ball save, awards on Dragon hits and Ramp shots, a Lock that answers with a bash hit instead of locking, and an end when one ball remains. Nothing in the ball controller has ever handled a second ball: measured at this tree, the first of two drains does nothing, a drain while the other ball waits for the Mouth is lost without a save, and two serves inside 19 ticks deadlock the shooter lane. Eleven ledger entries were routed here; the author's split of 2026-10-13 moved the game clock (DW-280) and the replay header (DW-185) to Story 3.7b.

**Approach:** This spec is Part A of the original two-part plan; Part B is Story 3.7b (see `## Spec Change Log`).
- **Part A, Quick multiball.** Teach the ball controller a second ball: one serve path with a queue, a multiball drain that saves, and a stop when one ball remains. Fill the Mode: `machine.multiball`, its own ball-save source, its awards. Give the Lock arbiter the `lock_lane_strike` outcome and hand it to the mode stack. Fix what two balls make reachable in ball save (DW-219, DW-226, DW-228), the Lock lane (DW-295), ball search (DW-268), the controller's closure ordering (DW-273) and the Loop tracker's serve pair (DW-321).

## Boundaries & Constraints

Symbols, each read from `resolveTuning()`: S = `quickMbBallSaveTicks`, G = `multiballServeGapTicks`, W = `lockFullReentryTicks`, D = `quickMbDragonValue`, R = `quickMbRampValue`, B = `ballSaveTicks`, C = `ballSaveGraceTicks`, L = `mouthOpenLeadTicks`, I = `mouthEjectIntervalTicks`.

**Live balls** = `machine.ballsInPlay` + serves outstanding (in flight or owed, below) + Mouth ejects pending (a pulse issued this tick still counts, as `ball-controller/index.ts` already computes).

### Part A -- Always

- **Tuning** (`tuning.ts`, after `loopDescentWindowMs`). Five entries, each `unverified` with an honest `source`:
  - `quickMbBallSaveMs` 15000, authored: FR-35 gives the Mode "its own Ball save" and no duration. Owner: Story 3.11.
  - `quickMbDragonValue` 10000 and `quickMbRampValue` 25000, authored on `skillShotAward`'s scale. Owner: Story 3.11.
  - `multiballServeGapMs` 1500, measured: see Design Notes, "Measurements", M2 and M5.
  - `lockFullReentryMs` 1000, measured: see Design Notes, "Measurements", L2.
- **Table** (`dragonwar.ts` `modeWiring`). `quickMbRampShot: 'shot_ramp'` (the Mode reads `${quickMbRampShot}_made`; AD-16) and `multiballBalls: { quickmb: 2 }`.
- **Contracts.**
  - `LockLaneStrikeEvent { type: 'lock_lane_strike'; player; tick }` joins `SemanticEvent` (`contracts/events.ts`).
  - `BallSaveState` gains an optional `deadlines?: Readonly<Record<string, number>>` (`contracts/state.ts`): one deadline per armed source. The key is omitted, never `undefined`, whenever no source is armed, so the empty value is still exactly `{ untilTick: null, sources: [] }`.
- **Ball save** (`ball-save.ts`; AD-18).
  - `armBallSave` sets that source's deadline to the later of its own previous deadline and `tick + ticks`; `untilTick` is the maximum over `deadlines`.
  - `disarmBallSave` removes the source and its deadline; `untilTick` becomes the maximum of the deadlines that remain, or `null` (DW-219).
  - A grace lapse (`expireBallSave`) clears `untilTick` and every deadline and keeps `sources` (DW-226). So a later player plunge in the same ball arms a fresh window; a served ball's launch still never arms.
  - Tilt, the Slam and `ball_will_start` behave as today.
- **The Mode** (`modes/quick-multiball.ts`, built from `tuning`; AD-8, AD-18).
  - `_starting` (`onStarting`) sets `machine.multiball = 'quickmb'` and arms `{ ticks: S, source: 'quickmb' }` at the start tick. Nothing else under `sim/rules/` writes a non-null `multiball`.
  - `_stopped` (`onStopped`, pure and tuning-free) sets `machine.multiball` to `null` and disarms `'quickmb'`.
  - While `scoringOpen(state)`: `dragon_hit` pays D, `${quickMbRampShot}_made` pays R and `lock_lane_strike` pays D, each to the entry's own player through `awardScore()`. Under Tilt or outside a game it pays nothing.
  - No timer, no `ModeView` field, no `lamps` hook, no `ModeEvent` of its own, no coil.
- **Mode input** (`modes/registry.ts`, `modes/index.ts`). `onEvent` receives `DeviceEvent | LockLaneStrikeEvent`. After a tick's device fan-out and before the ball-start step, the stack offers each `lock_lane_strike` in the controller's events to every active mode, highest priority first. Modes still never see `lock_lane_entered`.
- **One serve path** (`ball-controller/`; AD-6, AD-18). Every ball the controller owes to play after a ball has started (a save's re-serve, the serve after a lock, a multiball's added ball) goes through one `requestServe()`.
  - With nothing in flight, nothing owed and the gap satisfied: an empty shooter lane gets `pulse c_trough_eject` on this tick, as today; an occupied lane gets `pulse c_autolaunch` on this tick and that launch counts as a served launch (today only the serve after a lock checks the lane).
  - Otherwise the serve is **owed**, and S7 issues it on the first later tick on which those conditions hold.
  - **In flight** means a trough pulse whose ball has not arrived in the lane, or an autolaunch pulse whose `ball_launched` has not been seen. **Outstanding** means in flight or owed.
  - **The gap.** While `machine.multiball !== null`, no serve is issued sooner than G ticks after the last served ball's `ball_launched`. Outside a multiball there is no gap.
  - A served ball's `ball_launched` never arms ball save and emits no `ball_save_timer_started`. Ball search's own launch of a ball resting in the lane is a served launch too.
  - Owed serves are dropped on Tilt, when `phase` leaves `game` and at `ball_will_start`.
  - **Failures (DW-228).** `eject_failed` for the trough, reported on the tick after a serve's trough pulse, abandons that serve. `eject_failed` for the shooter lane, reported on the tick after a serve's autolaunch pulse, clears the launch record, so a later plunge arms normally. Both records also expire C ticks after their pulse.
  - In single-ball play every existing serve keeps its tick.
- **Drains** (`ball-controller/`, between the arbiter seam and the ball-end gate).
  - **Multiball drain.** In `phase === 'game'`, with `machine.multiball !== null`, on a tick whose machine report carries no recover: each ball that enters a parking device other than the Lock is saved when the ball is not Tilted and ball save is running or in grace: `ball_saved { player }` and one `requestServe()`. No early return.
  - **The one-ball stop.** On every tick, in `phase === 'game'`, not Tilted, with `machine.multiball !== null`: when live balls <= 1, the controller stops every active entry whose `mode` equals `machine.multiball` through `stopModes()`, and the stop triple rides out on `modeEvents`. Under Tilt the Mode ends with the ball instead (FR-15).
  - **The ball-end gate** also stays closed while a serve is outstanding or a mode-select window is open.
- **The Lock arbiter** (`lock-arbiter.ts`; AD-18).
  - An entry with `machine.multiball !== null` and no Tilt is a strike: exactly one `lock_lane_strike { player }`; no credit, no candidates, no window. A captured ball is returned through `requestMouthEject()`; a full-device entry requests nothing.
  - A Tilted entry stays `lock_lane_spit { credited: false }`, as Story 3.2 built it.
  - After a Mode start sets `machine.multiball`, and after that capture's own release, the arbiter tops up: one `requestServe()` for each ball by which live balls fall short of `TABLE.modeWiring.multiballBalls[machine.multiball]`.
- **Full-Lock re-entry** (`devices/index.ts`; AD-19, DW-295). After a full-device `lock_lane_entered` at tick t, a full-device closure at or before t + W emits nothing. One new closure mark, discarded if it is greater than the current tick.
- **Ball search** (`ball-search.ts`, `serve-recovery.ts`; DW-268). When the shooter lane's own stage finds a ball resting there, it pulses and the pass restarts its clock at that tick, so the pass that launched a ball never recovers it. With the lane empty the stage and the recover behave as today.
- **Backglass** (`frame.ts`). `MODE_DISPLAY_NAMES.quickmb = 'QUICK MB'`: a running Quick multiball owns the status line (FR-41) and has no fields line.
- **Goldens.** Headers only: `tableHash` and the eight new `gameStart.tuning` keys (`quickMbBallSaveMs`/`Ticks`, `multiballServeGapMs`/`Ticks`, `lockFullReentryMs`/`Ticks`, `quickMbDragonValue`, `quickMbRampValue`).
- **Tests.** Every AC has a pinning test and a `mutation:` line (Rule 19). Every negative is paired with its positive control. Ticks and values come from `resolveTuning()` and from the run's own recorded events, never from the code under test. Every physics input is labelled real input, synthetic coil, teleport or state-injected. Non-ASCII by escape (Rule 14).

### Never

- Never touch `TABLE.lamps`, `sim/rules/lamps.ts`, `MODE_LAMP_ROLES` or any insert (Story 3.3c), or the Dragon rig (Story 3.3b).
- Never touch a path contended with Epic 5: `assets/src/**`, `public/assets/**`, `src/presentation/mechanisms/**`, `src/presentation/scene/**`, `tools/make-placeholder-blend.py`, `ATTRIBUTIONS.md`. No third-party file or pasted third-party code.
- Never change geometry, `src/sim/physics/**`, `applyDeviceEvents()` or the shot tracker. DW-322 to DW-326 are Story 3.3d's.
- Never add a `GameState` or `machine` field other than the optional `ballSave.deadlines`.
- Never let `expectedHash`, `expectedGameStateHash`, `transitions`, `checkpointTicks` or `expectedCheckpointHashes` move in any golden, and never remove a coil prologue. If one would move, HALT with an intent gap.
- Never build the War, a War start, or `show_dragon_hit` on a strike (DW-303 is Story 3.9's). Never build on DW-308 or DW-309.
- Never write `score` except through `awardScore()`, never add or remove a `modes[]` entry outside `lifecycle.ts`, never emit a `CoilCommand` from a mode.
- Never edit `src/sim/loop/**`, `src/host/**` or any golden's `gameStart.seed`: the game clock and the replay header are Story 3.7b's.
- Never pin the DW-329 overlap as correct: a Mouth eject can create a ball on top of a ball that is in the Lock lane at the pulse tick (Story 3.7a fixes it). No test in this story may assert an overlapping creation, or a trajectory that follows one, as expected behaviour. If any run in this story produces one, report it in `## Auto Run Result` with the tick and the centre separation.

## I/O & Edge-Case Matrix

Part A rows run headless (`runRulesScript` on a real `createRules()`) unless marked physics. t0 is a capture of `s_lock_1` that starts Quick multiball; a served ball's arrival is scripted as the trough slot opening and `s_shooter_lane` closing on the tick after its pulse, and its launch as `s_shooter_lane` opening.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| A-Start (lock) | `[quickmb]` lit, credits 0, Lock empty; capture at t0; first launch at t1 | `lock_lane_locked { credits: 1 }`, `lock_lane_mode_start`, the start triple; from t0 `multiball` is `'quickmb'`, `sources` holds `'quickmb'`, `untilTick` is the later of its old value and t0 + S; `c_trough_eject` at t0 and next at exactly t1 + G; after the second launch `ballsInPlay` 2; neither launch emits `ball_save_timer_started` | No error expected |
| A-Start (Mouth) | credits 2, the Lock holding 2; capture at t0 | `lock_lane_mode_start` alone; `show_dragon_mouth_open` at t0, `c_mouth` at t0 + L; `c_trough_eject` at t0; `ballsInPlay` 2 once both are out | No error expected |
| A-Start (window) | two candidates; Start confirms at tc | the Mode, its serve and its added ball run from tc exactly as A-Start (lock) runs from t0 | No error expected |
| A-Awards | `dragon_hit`; `shot_ramp_made`; the same above a running Hurry-up at elapsed e; above a running Joust | +D; +R; the Ramp pays R + v(e) and Hurry-up stops while Quick multiball stays; Joust changes neither delta | No error expected |
| A-Strike | Quick multiball running; a capture | exactly one `lock_lane_strike { player }`; +D; `lockCredits`, `modesLit`, `modesPlayed` and `modes[]` unchanged; no `lock_lane_locked`, `_spit`, `_mode_start` or `mode_select_*`; Mouth open on that tick, `c_mouth` L later; the Mode stays active while `ballsInPlay` reads 1 | No error expected |
| A-Strike twice | both balls captured d apart, d < L | two strikes; one Mouth show; pulses at L and L + I after the first; no stop and no `ball_ended` while `ballsInPlay` reads 0 | No error expected |
| A-Full Lock (DW-295) | the Lock full; `s_lock_lane` closes at t and again at t + g, g in {66, 450, 829, W}; then g = W + 1 | one strike and +D once; at W + 1 a second strike. Control: with the Lock not full each capture strikes | No error expected |
| A-Exclusion | running, `[joust]` lit, credits 1, letters `DRAGON`; a capture. Also `multiball: 'war'` state-injected with `[quickmb]` lit | a strike only; no credit, no Mode start, no window; in the injected case no `mode_quickmb_*` | No error expected |
| A-Tilted entry | running and Tilted; a capture | `lock_lane_spit { credited: false }`, no strike, no award; the Mouth still ejects. Control: untilted, a strike | No error expected |
| A-Save | window live; one of two balls drains at td; then a drain at `untilTick` + C; then at `untilTick` + C + 1 | `ball_saved`, a serve (at td, or at the last served launch + G if later), no `ball_ended`, the Mode active; the second is saved; the third is not (row A-Stop) | No error expected |
| A-Save both | both drain on one tick, window live | two `ball_saved`; one `c_trough_eject` on that tick, the second G after the first's launch; no `ball_ended` | No error expected |
| A-Stop | window lapsed; one of two balls drains at td | the stop triple at td; `multiball` null; `sources` without `'quickmb'`; no `ball_ended`. The other ball's later drain ends the ball as usual | No error expected |
| A-Stop (serve fails) | `eject_failed { bd_trough }` on the tick after the added ball's pulse | the serve is abandoned and the Mode stops on that tick | No trough ball: the Mode ends rather than waiting |
| A-Tilt | Tilt with two in play; first drain; last drain | sources empty; no save and no stop at the first; at the last, the stop triple then `ball_ended { tilted: true }`. Control: row A-Stop | No error expected |
| A-Ball end / Slam | both drain unsaved on one tick; a Slam with a serve owed | the stop triple, then `ball_ended`, `multiball` null before `ball_will_start`; after the Slam no `c_trough_eject` in Attract | No error expected |
| A-Hot seat | player 1's Quick multiball; a Dragon hit | `players[1]` gains D; `players[0]` untouched | No error expected |
| A-Disarm (DW-219) | plunge at p; the Mode starts at t0 with t0 + S > p + B; an unpaired shooter arrival at ts stops it while its window is live. Mirror (`quickMbBallSaveMs` overridden so that p + B > t0 + S) | `untilTick` is p + B, not t0 + S. Mirror: `untilTick` stays p + B | No error expected |
| A-Lapse (DW-226) | plunge at p; no drain; a rolled-back ball is plunged again at q > p + B + C | from p + B + C + 1 the state is `{ untilTick: null, sources: ['ball-controller'] }`; the plunge at q emits `ball_save_timer_started { untilTick: q + B }` and a drain inside it is saved. Control: an Attract plunge never arms | No error expected |
| A-Launch record (DW-228) | a serve's autolaunch pulse at n answered `eject_failed { bd_shooter }` at n + 1; a plunge at n + 5 | the plunge arms. Control: with no failure report the launch at n + 5 is consumed and arms nothing | No error expected |
| A-Lane occupied (DW-273) | two in play, one comes to rest in the lane, the other drains with the save live | `ball_saved` and `c_autolaunch`, no `c_trough_eject` | No error expected |
| A-Two serves (DW-273) | no multiball; a capture that locks and the other ball's saved drain on one tick | one `c_trough_eject` on that tick; the second on the tick the first serve's launch is seen | No error expected |
| A-Gate (DW-273) | a drain to zero while a serve is in flight; a drain to zero while a mode-select window is open | no `ball_ended` and no second save meanwhile; the ball ends or plays on only once the serve has launched or the window has confirmed | No error expected |
| A-Search (DW-268) | one ball in play, one resting in the lane, no closure for `ballSearchTicks` | the shooter stage pulses `c_autolaunch`; no `RecoverCommand` three steps later; that launch arms nothing. Control: lane empty, the recover fires on that tick | No error expected |
| A-Backglass | a snapshot with a `quickmb` entry; the same above Hurry-up; the entry gone | `QUICK MB` over `BALL 1`, no fields line; `QUICK MB` owns the panel; Hurry-up's own lines return | No error expected |
| A-Loops (DW-321, physics) | real input to a Quick multiball start; then the same with `multiballServeGapMs` 300 | no `shot_*_loop_*` event from the two serves; with the short gap, `shot_left_loop_broken` | No error expected |

</intent-contract>

## Code Map

Measured at `5683305ba533edd6bdb4a350a34d769de33d991c` on `DW-1-epic3`.

**Part A**
- `src/sim/rules/modes/quick-multiball.ts`: the shell. Rewrite as `createQuickMultiballMode(tuning)` with `onStarting`, `onEvent` and `onStopped`. Follow `hurry-up.ts:49,91-98` for the `${TABLE.modeWiring...}_made` constant and the `scoringOpen` / `awardScore` use.
- `src/sim/rules/modes/index.ts:93-95` (pass `tuning`), `:154-196` `step()` (add the strike offer between step 2 and step 3; `lifecycleEvents` already carries the controller's `SemanticEvent`s).
- `src/sim/rules/modes/registry.ts:60`: `onEvent`'s event type. `base.ts`, `skill-shot.ts`, `hurry-up.ts`, `joust.ts`: the parameter type only.
- `src/sim/rules/modes/lifecycle.ts:59-112`: `startModes` runs `onStart`, pushes the entry, then `onStarting`; `stopModes` runs `onStopped` after the entry is removed. Read-only.
- `src/sim/rules/ball-save.ts`: the helpers. `tilt.ts:91-97` `disarmAllBallSave` folds `disarmBallSave` and needs no change.
- `src/sim/rules/ball-controller/shared.ts:277-441` `ControllerState`: add the owed-serve count and the last served launch tick; give `awaitingSaveLaunch` a pulse tick.
- `src/sim/rules/ball-controller/save-serve.ts`: `expireBallSave` (:24, the lapse and both record expiries), `armSaveOrAutolaunch` (:71, add the failure answers and the owed-serve step), `serveBallSave` (:133, becomes the classic path's use of `requestServe()`).
- `src/sim/rules/ball-controller/index.ts:224-301` `step()`: the seam order S7, SL, then the multiball drain, the one-ball stop, the gate. `mouthEjectsPending` is at :264. The early return at :270-281 is the classic save only; the multiball drain does not take it.
- `src/sim/rules/ball-controller/ball-end.ts:144-172` `ballEndGateOpen`: add the two conjuncts.
- `src/sim/rules/ball-controller/lock-arbiter.ts`: `serveAfterLock` (:214), `startOrOpenWindow` (:255), `endWindow` (:282), `decideEntry` (:449; `live` at :455 is the only reader of `machine.multiball`).
- `src/sim/rules/ball-controller/start.ts:45-64` `startBall`: the resets. `:89-95` keeps the AD-7 reset of `multiball`.
- `src/sim/rules/ball-controller/serve-recovery.ts:177-186` `stepBallSearch`: mark the search's lane launch as a served launch.
- `src/sim/rules/ball-search.ts:268-306` `applyStage`, `:336-378` `step`: the shooter stage is the non-parking device's pulse stage (`guard.kind === 'tilt'`); the lane's slot is `state.machine.deviceSlots[<that device>][0]`, reached through `TABLE`.
- `src/sim/rules/devices/index.ts:365-375`: the full-device branch.
- `src/sim/rules/index.ts:122-179` `RulesStepResult`, `:358-364` the stack call.
- `src/sim/contracts/events.ts:345-351,449-475`; `src/sim/contracts/state.ts:40-43`.
- `src/sim/table/tuning.ts:457` (after `loopDescentWindowMs`), `src/sim/table/dragonwar.ts:632-637` `modeWiring`.
- `src/presentation/backglass/frame.ts:801-805` `MODE_DISPLAY_NAMES`.
- Test helpers: `test/rules-hurry-up.test.ts:31-165` (`gameState`, `capture`, `ramp`, `press`, `entryAt`, `scoreAt`, `modeEventsAt`); `test/rules-lock-arbiter.test.ts:470` `stuckState`; `test/joust-loop-qa-physics.test.ts:152-229` (the three `vi.mock` wrappers and `witnessInputs`); `test/util/switch-script.ts:170-187` (`initialState`, `machineReports`). Copy helpers; never import a `.test.ts`.
- The real-input recipe (measured, seed-independent, `ballsPerGame: 3`): ball 1 and ball 2 are the Ramp witness (plunger held 285 ticks from 321 after `ball_started`; right flipper 60 ticks, 3899 after the release); ball 3 is the Lock witness (plunger 521; left flipper 30 ticks, 3945 after the release); in the window a right-flipper press 10 ticks after the capture and a Start press 20 after. Measured ticks: `ball_started` 2, 12532, 25062; Ramps made 4967, 17497; capture 30220; `mode_quickmb_started` 30240; the replacement ball's `ball_launched` 30259.
- Pins that change by design:
  - `test/rules-lock-arbiter.test.ts:280-288`, `test/rules-campaign.test.ts:264-280`: a multiball entry is now a strike.
  - `test/rules-campaign.test.ts:282-298,356-374,788-808`, `test/rules-campaign-qa.test.ts:118-157`, `test/mode-select-slam-physics.test.ts:395-437`: a started Quick multiball now serves a second ball and saves.
  - `test/rules-hurry-up.test.ts:400-428`: a Ramp under Quick multiball pays R as well.
  - `test/rules-ball-save.test.ts:301-304`: after a lapse `sources` keeps `'ball-controller'`.
  - `test/contracts.test.ts:240-300`: the exhaustive switch gains `lock_lane_strike`.
  - Any DSL script that drains again while a re-serve it never scripts the arrival of is still in flight: script the arrival and the launch.

  Diagnose every other red test; never loosen one.

## Tasks & Acceptance

**Execution -- Part A**
1. `src/sim/table/tuning.ts`, `src/sim/table/dragonwar.ts`: the five tunables and the two `modeWiring` keys.
2. `src/sim/contracts/events.ts`, `src/sim/contracts/state.ts`, `test/contracts.test.ts`: the strike event and `deadlines`.
3. `src/sim/rules/ball-save.ts`, `src/sim/rules/ball-controller/save-serve.ts` (`expireBallSave`): per-source deadlines and the lapse.
4. `src/sim/rules/ball-controller/shared.ts`, `save-serve.ts`, `lock-arbiter.ts`, `start.ts`, `serve-recovery.ts`: the one serve path, its queue, the gap and the failure answers.
5. `src/sim/rules/ball-controller/index.ts`, `ball-end.ts`: the multiball drain, the one-ball stop and the gate.
6. `src/sim/rules/ball-controller/lock-arbiter.ts`: the strike and the top-up.
7. `src/sim/rules/modes/registry.ts`, `modes/index.ts`, the four other modes' signatures, `modes/quick-multiball.ts`, `src/sim/rules/index.ts`: the Mode and the strike offer.
8. `src/sim/rules/devices/index.ts`: the full-Lock re-entry window. `src/sim/rules/ball-search.ts`: the lane launch.
9. `src/presentation/backglass/frame.ts`: `QUICK MB`.
10. Tests: `test/rules-quick-multiball.test.ts` and `test/rules-serve-path.test.ts` (new, headless, both added to `ENTRY_FILES` in `test/rules-devices-headless.test.ts`); `test/rules-ball-save.test.ts`, `test/rules-devices.test.ts`, `test/rules-ball-search.test.ts`, `test/tuning.test.ts`, `test/table.test.ts` (extended); `test/backglass-quick-multiball.test.ts`, `test/quick-multiball-physics.test.ts`, `test/lock-full-reentry-physics.test.ts` (new).
11. Finish Part A: refresh the golden headers only; update the by-design pins; record one `mutation:` line per AC.

**Acceptance Criteria -- Part A**
- **A1.** Given `TUNING`, `resolveTuning()` and `TABLE`, when the tuning and table tests run, then the five keys are `unverified` with the values above, the three `...Ticks` are 15000, 1500 and 1000, `modeWiring.quickMbRampShot` names a declared shot, and `modeWiring.multiballBalls.quickmb` is 2.
- **A2** (rows A-Disarm, A-Lapse, A-Launch record; DW-219, DW-226, DW-228). Given `machine.ballSave` with two sources, when the source that set the maximum is disarmed, then `untilTick` is the longest deadline that remains. Given a lapsed window, when the player plunges again in the same ball, then a fresh window arms. Given a serve's autolaunch that answered `eject_failed`, when the player plunges, then that plunge arms. The empty value is still `{ untilTick: null, sources: [] }`.
- **A3** (rows A-Start, all three). Given Quick multiball starts with `machine.multiball === null`, when its `_starting` fires, then `machine.multiball` is `'quickmb'` from that tick, the Mode's source is armed for S ticks, the controller serves so that two balls are live, and the second serve follows the first served launch by G. A source scan finds no other non-null write of `multiball` under `src/sim/rules/`.
- **A4** (rows A-Awards, A-Hot seat). Given Quick multiball running, when `dragon_hit` or `shot_ramp_made` arrives, then the entry's player gains D or R, on top of whatever a lower mode pays for the same event.
- **A5** (rows A-Strike, A-Strike twice, A-Tilted entry). Given Quick multiball running, when `lock_lane_entered` arrives, then the arbiter emits exactly one `lock_lane_strike`, the Mode pays D, no credit is added, and a captured ball leaves through the Mouth L ticks after `show_dragon_mouth_open`; the Mode does not stop while that ball is held. A Tilted entry is a `lock_lane_spit { credited: false }`.
- **A6** (row A-Full Lock; DW-295). Given a full Lock, when one ball closes `s_lock_lane` twice inside W ticks, then the arbiter emits exactly one outcome for it. On real physics (a teleported launch; the Lock filled by teleport after the game's Start): the manifest's 1600 mm/s shot gives one outcome, and with `lockFullReentryMs` overridden to 0 it gives two.
- **A7** (rows A-Save, A-Save both). Given Quick multiball inside its ball-save window, when a ball drains with another still live, then `ball_saved` fires, a ball is served through the serve path and the ball does not end.
- **A8** (rows A-Stop, A-Stop (serve fails), A-Tilt, A-Ball end / Slam). Given Quick multiball running and not Tilted, when live balls fall to one, then the Mode stops through the lifecycle on that tick, `machine.multiball` is cleared in `_stopped` and its source is disarmed. Under Tilt it stops with the ball.
- **A9** (row A-Exclusion). Given `machine.multiball !== null`, when a Lock-lane entry arrives that would otherwise lock or start a Mode, then neither happens, and `lockCredits` cannot reach the War's two.
- **A10** (rows A-Lane occupied, A-Two serves, A-Gate; DW-273). Given two balls on the table, when two serves are owed inside one launch, a save meets an occupied lane, or the last ball in play drains while a serve is outstanding or a window is open, then the trough is never pulsed twice on one tick or into an occupied lane, and the ball does not end early.
- **A11** (row A-Search; DW-268). Given ball search reaches its shooter stage with a ball resting in the lane, when it launches that ball, then the same pass issues no `RecoverCommand`.
- **A12** (row A-Backglass). Given a snapshot with a `quickmb` entry, when `renderFrame` draws the score screen, then the status line is `QUICK MB` over `BALL 1` with no fields line, and above a running Hurry-up `QUICK MB` owns the panel.
- **A13** (Integration, Rules 1/2; row A-Loops; DW-321). Given a real `createLoop()` with the browser's adjustments (`ballsPerGame: 3`), driven from Attract by the recorded real input alone, when the mode-select window is confirmed on `QUICK MB`, then:
  - `mode_quickmb_started` fires and `machine.multiball` is `'quickmb'`;
  - the second ball's trough pulse is issued G ticks after the first served `ball_launched`, and `ballsInPlay` is 2 after its own `ball_launched`;
  - the DMD, folded and rasterised, reads `QUICK MB`;
  - no `shot_*_loop_*` event is emitted between the Mode start and the second ball's first inlane or outlane closure; with `multiballServeGapMs` overridden to 300 a `shot_left_loop_broken` is;
  - with no further input, every drain before `untilTick` + C is followed by `ball_saved`, the first drain after it stops the Mode with no `ball_ended`, and the next drain ends the ball.
- **A14.** Given Part A, when the gates run, then every gate passes and the goldens differ from the baseline only in `tableHash` and the eight new tuning keys.

## Spec Change Log

- 2026-10-13, author decision at the plan gate (lead): the plan was two stories' worth and is SPLIT. This spec is cut to Part A, Quick multiball (criteria A1 to A14, tasks 1 to 11); Part A's criteria, tasks, boundaries and Matrix rows are unchanged; the lead added two Never items (Story 3.7b's files; the DW-329 overlap), a DW-329 smoke bullet and manual check, and one line recording the author's acceptance of the readings. Part B (the game clock and the replay header, DW-280 and DW-185, criteria B1 to B7) is Story 3.7b, built after Epic 5 merges; its planning is preserved verbatim in `story-3-7b-planning-notes.md` and in git at 6bffa64. Also decided: DW-329 (a Mouth eject can create a ball on top of a ball in the Lock lane) is its own Story 3.7a right after this one, and this story must not pin that overlap as correct; DW-175 is retired; the four FR-35 readings in Design Notes are accepted. DW-141 is re-owned to Story 3.3d.

## Review Triage Log

## Design Notes

**Governing ADs.**
- AD-18: the Lock arbiter alone decides a Lock-lane entry and emits `lock_lane_strike`; `machine.multiball` is set in `_starting` and cleared in `_stopped`; ball save is one device with `arm({ ticks, source })` / `disarm(source)`, the longest live window wins, Tilt disarms all; only the controller pulses the trough and the autolaunch.
- AD-8: priority 400; start and stop only through the lifecycle; stop phases pure and tuning-free; score only through `scoring.ts`; no coil from a mode.
- AD-6: `ballsInPlay`'s meaning; a ball resting in the shooter lane is the ball being served; four balls.
- AD-7: scopes, and the closure-state bar (reproducible from tick 0, bounded or restart-safe).
- AD-19: `lock_lane_entered` and the Lock lane's windows live in the devices layer; modes read events, never switches.
- AD-9: payload-complete events; English only in `frame.ts`.
- AD-3, AD-15: every duration in ms in `tuning.ts`; a tuning change moves golden headers.
- AD-16: no device-name literal in rules.

No AC contradicts an AD's Rule. AD-7 says `ball_will_start` resets `multiball` and AD-18 says it is cleared only in `_stopped`; both hold, because a ball end stops every mode before `ball_will_start`, so the reset there writes `null` over `null`. A8's mid-ball stop is the case that shows which one does the clearing.

**Rule 20 candidates (the lead's call).**
- AD-8 / AD-19: the mode stack also offers the arbiter's `lock_lane_strike` to active modes, after that tick's device events. Story 3.9 needs the same path.
- AD-18: every ball the controller owes to play goes through one serve path; a multiball's serves are G apart; the ball does not end while a serve is outstanding or a mode-select window is open; the Mode ends when live balls fall to one.
- AD-7: `machine.ballSave` carries an optional per-source `deadlines`; two more `ControllerState` fields and one devices-layer mark.
- AD-19: a full-device `lock_lane_entered` is emitted at most once per `lockFullReentryMs`.

**Readings pinned here.**
All four FR-35 readings below (a strike pays; Tilt wins over the strike; under Tilt the Mode ends with the ball; "one ball remains" counts balls still owed) were accepted by the author on 2026-10-13 and are recorded on the story block in `epics.md`.
- **A strike pays.** The brief's wording is "an under-leg shot *counts as* a bash hit, not a re-lock" (addendum section 8), and `machine-behaviour.md` says "in the War it is a Strike, in Quick multiball a bash hit". A hit on the bash toy is what the Mode pays for, so the strike pays D. It emits no `show_dragon_hit`: that question is Story 3.9's (DW-303).
- **Tilt wins over the strike.** A Tilted entry keeps Story 3.2's `lock_lane_spit { credited: false }`. Nothing scores under Tilt (FR-15).
- **Under Tilt the Mode ends with the ball.** FR-15: "during a multiball the ball ends when the last ball drains and the Mode ends with it".
- **"One ball remains" counts balls the controller still owes.** Measured: a strike holds a ball for 1001 ticks with `ballsInPlay` reading 1, and the added ball is not launched until 1.5 s after the start. Read literally, `ballsInPlay === 1` would end the Mode on its first tick.
- **No `ball_save_timer_started` for the Mode's own window.** That event is the plunge's (its contract says "on `ball_launched`"); `l_ball_save` follows the projection.
- **The Backglass.** FR-41 gives Quick multiball the panel over the timed Modes, so a running Hurry-up's value is hidden while it runs.

**Measurements** (2026-10-13, at 5683305; four synchronous planning subagents, repository read-only; data under the session scratchpad `s37-plan/`). Each states its instrument and its bounds.
- **M1, reachability.** Instrument: one real `createLoop()` from Attract, real input only, the browser's adjustments. 10 runs (3 seeds, `tiltWarnings` 1 and 3, 4 window variants, 2 other recipes). The recipe in the Code Map reaches `mode_quickmb_started` at tick 30240 on ball 3 of 3. Nothing depends on the seed. Bound: one prefix history; the Lock witness misses after a different ball 1 (a two-Ramp ball 1 moves its inlane by 10 ticks).
- **M2, the second serve.** Instrument: the M1 state, the second ball added by `loop.pulseCoil` (synthetic coil). 162 runs.
  - A trough pulse issued at N opens its slot and closes `s_shooter_lane` at N + 1, in one batch (769 of 769 serves with the lane open); an autolaunch issued on arrival gives `ball_launched` 18 ticks later. So a rules serve takes 19 ticks.
  - A second trough pulse before the first ball's `ball_launched` is unsafe: on the same tick both autolaunches fail and a ball falls through the playfield; 1 to 16 ticks later the balls overlap and the lane deadlocks; 17 and 18 later one `ball_launched` stands for two balls.
  - From that `ball_launched` on, both balls launch. They touch in the lane or the top-left corner in 32 of 34 delays below 177 ticks, and in none of 80 delays from 177 to 1320.
- **M3, the empty trough.** Synthetic coil, 3 failed pulses: `eject_failed { bd_trough }` on the tick after the pulse, and the rules do nothing. The trough holds 3 at the M1 start. By the accounting it always holds enough: a serve release leaves at most two in the Lock and so at least two in the trough; a Mouth release leaves at least one.
- **M4, two balls in play.** 200 clean runs (launch gaps 188 to 2019; no input, taps, holds, Lock-timed flips). Drain gap 57 / 618 / 3359 ticks (min / median / max, 168 runs); no same-tick drains among clean serves (one in a run where the balls had collided at the serve); no ball came to rest in the shooter lane. With the left flipper held both balls cradled and never drained (12 of 12).
- **M5, the Loop tracker.** The loop's own tracker, recorded through a wrapper. One ball alone: no Loop event in 9 lane descents. Two served balls: `shot_left_loop_broken` at every launch gap from 20 to 579 and 659 to 1199 (103 of 114 no-input runs), none at 599 to 639, and none at 1219 and above (27 runs across all input patterns, up to 2019). Cause: the two descents of the Left Loop lane interleave (`s_loop_l_out` to `_in` takes about 583 ticks, `_in` to the inlane about 645). G = 1500 puts the second launch 1519 after the first. Bound: pairs only. Three descents inside the windows gave a false `_made` in 11 of 16 synthetic runs.
- **L1, a capture in a multiball.** Instrument: a real `createLoop()`, `machine.multiball` state-injected, balls teleported; this proves wiring, not play. 12 runs: the outcome and the Mouth show on the capture tick, `c_mouth` 1000 later, the same slot opens at 1001, `ballsInPlay` dips for 1001 ticks.
- **L2, a full Lock.** 741 teleported zero-spin launches (19 speeds from 450 to 4000 mm/s, 5 angles, up to 11 offsets). Of 521 that reached `s_lock_lane`, 373 closed it twice and none three times; every ball that reached the slot band did. First-to-second gap 66 / 450 / 829 ticks. The ledger's own figure (518) is the 800 mm/s shot. Bound: zero spin; 1000 to 2400 mm/s gives 120 to 829.
- **L3, L4.** 130 and 15 runs: nothing ended the ball while a Mouth eject was pending, with `ballsInPlay` at 0 for up to 1001 ticks.
- **Sweep (DW-273).** All 18 closure fields under `sim/rules/`, read and write sites in seam order, the worst candidates probed headless. Two-ball defects: the classic save has no lane check; a drain to zero ends the ball while a serve or a window is still open; a lock and a drain on one tick pulse the trough twice. Single-ball, one-tick coincidences: the tilt settle mark survives a Slam and a Start on one tick; a Start is honoured on the tick a Lock overflow requests a Mouth eject. Story 3.7b dissolves the last two.

**Ledger inbox (Rule 17).**
- DW-219, DW-226, DW-228: addressed, A2.
- DW-273: addressed. The sweep is done (above); A10 pins the two-ball instances, Story 3.7b the two that a rebuild dissolves. The one-record limits are in `deferred`.
- DW-295: addressed, A6.
- DW-268: addressed, A11. Decision: a pass that launches a ball does not recover it. Measured: an autolaunched ball's first playfield closure is `s_loop_l_out` 1951 to 1995 ticks after the pulse (416 launches), and the recover came 750 after it, so the old pass always removed the ball it had launched.
- DW-321: addressed in part, A13. The serve pair no longer reaches the tracker interleaved. Residual: the tracker still keeps one mark and one attempt per Loop, so the other ball crossing an inlane or outlane during a served ball's descent can still arm and break that Loop. With no Loop makeable by real input (DW-319) this changes no Charge. Re-own the residual to Story 3.3d with DW-322 to DW-326.
- DW-280, DW-185: moved to Story 3.7b by the author's split of 2026-10-13 (ledger re-owned).
- DW-175: retired by the author on 2026-10-13 (`by-design`): the goldens keep their coil prologue. Recorded on the ledger entry and on `epics.md` Story 1.8; the `CoilPrologueEntry` doc comment follows with Story 3.7b.
- Declined DW-141: re-owned to Story 3.3d at the spec gate (ledger-only; that story is at its bullet cap). This story moves no geometry and does not rebuild the feed-rail record, which was the reason it was routed here. Story 3.3d moves the lane geometry and must re-record the two feed margins, so a shared `test/util/` driver belongs there (measured: 3 files, about 300 lines). The entry's "unreachable release point" half is stale: all seven cases are declared reachable since Story 2.1f.

**DW-308 and DW-309.** The plan depends on neither. The Mode's window is armed at the Mode's own start, after any mode-select window, and no window timing changes. The lapse rule keeps sources and does not decide whether the clock pauses during a window (DW-308). A Tilted arrival still consumes the serve record without a pulse, as today (DW-309).

**Integration (Rules 1/2).**
- Consumes: 3.1's stack and lifecycle; 3.2's arbiter and Mouth; 3.4's `startCampaignMode`; 2.9's ball save; 2.12's ball search; 3.0a's `scoring.ts`; 2.13's fields line.
- Consumed-by:
  - **3.8** arms the War's own source, tops up to three through the same serve path, and reads `machine.multiball`.
  - **3.9** counts `lock_lane_strike` as a Strike through the mode input, and ends the War on the one-ball stop.
  - **3.3c** shows the `quickmb` role on the Dragon and Ramp inserts.
  - **3.11** needs a Quick multiball in the playtest.
- A13 is the real-runtime Integration AC.

**Footprint.**
- In the footprint: `src/sim/rules/**`, `src/sim/table/**`, `test/replays/**` (headers only).
- Extensions to report (uncontended), Part A: `src/sim/contracts/events.ts`, `src/sim/contracts/state.ts`, `src/presentation/backglass/frame.ts`, `test/**`.
- No contended path.

**Browser smoke (lead).**
- **What real input can reach.** A Quick multiball start, in a default three-ball game, on ball 3: two Ramps (one per ball) and a Lock shot, then a flipper press and Start in the window. By hand it needs three aimed shots; the measured recipe is tick-exact, so replay it through the dev recorder rather than play it.
- **What the DMD should show.** `QUICK MB` on the status line from the confirm, two balls on the playfield about 1.5 s apart, `l_ball_save` lit, each early drain followed by a fresh ball, then the score screen again once one ball is left.
- **The deciding check, headless.** A13: the same recorded input through `createLoop()`, asserting the serve gap, `ballsInPlay` 2, the rasterised `QUICK MB` and the stop.
- **DW-329.** If the smoke or the A13 run shows a ball created on top of another at a Mouth eject, record it; it is Story 3.7a's defect and must be reported, not hidden.

## Verification

**Commands** (first `export BLENDER=C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe` and `export PNPM_CONFIG_STRICT_DEP_BUILDS=false`; one vitest invocation per tool call; the baseline is 159 files / 2632 tests):
- `pnpm test` -- expected: all green; this story adds 5 files.
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions && pnpm build && pnpm check:dist && pnpm check:size` -- expected: each exits 0.
- JSON-parse each `test/replays/*.golden.json` against the baseline -- expected: only the fields A14 names differ. Any movement in a hash, `transitions` or `checkpointTicks` means HALT with an intent gap.

**Mutations** (Rule 19; planned here, applied and recorded by the implement stage as `mutation: <change> → <red test>`):
- A1: change `multiballServeGapMs` confidence to `'low'`; the tuning pin goes red.
- A2: return `untilTick` unchanged from `disarmBallSave`; A-Disarm goes red. Reset to `EMPTY_BALL_SAVE` on a lapse; A-Lapse goes red. Ignore the shooter's `eject_failed`; A-Launch record goes red.
- A3: set `multiball` in `onStart` of another mode; the source scan goes red. Issue the added ball with no gap; A-Start (lock) goes red. Skip the top-up; `ballsInPlay` 2 goes red.
- A4: pay D on a Ramp; A-Awards goes red.
- A5: add a credit on a strike; A-Strike goes red. Count `ballsInPlay` alone in the one-ball stop; the strike dip stops the Mode and A-Strike goes red.
- A6: drop the re-entry window; A-Full Lock and the physics row go red.
- A7: skip the multiball save; A-Save goes red.
- A8: clear `multiball` in the controller instead of `_stopped`; the hook-level pin goes red. Apply the one-ball stop under Tilt; A-Tilt goes red.
- A9: read candidates before the multiball check; A-Exclusion goes red.
- A10: drop the lane check in the save; A-Lane occupied goes red. Drop the gate's serve conjunct; A-Gate goes red.
- A11: keep the pass running after the lane launch; A-Search goes red.
- A12: remove `MODE_DISPLAY_NAMES.quickmb`; A-Backglass goes red.
- A13: arm ball save on a served launch; the "no `ball_save_timer_started`" assertion goes red.
- A14: change one golden header's `quickMbRampValue`; `replay-goldens.test.ts` goes red.

**Manual checks:**
- In the A13 run, count every `shot_*_loop_*` event from the Mode start to the ball end and record the count in `## Auto Run Result`. It is expected to be zero, since consecutive served launches are at least G apart. A non-zero count is DW-321's residual and is reported, not hidden.
- In every run of this story that ejects a ball through the Mouth while another ball is live, compare the created ball's centre with every other ball's at the creation tick. A separation under one ball diameter (26.99 mm) is DW-329: report the count, the ticks and the smallest separation in `## Auto Run Result`. Never assert it as expected.

## Auto Run Result

Status: ready-for-dev
Blocking condition: none

**Planning run (2026-10-13, `bmad-build-auto`, halt after planning).**

- **Where it ran.** Planned at `5683305ba533edd6bdb4a350a34d769de33d991c` on `DW-1-epic3`. The worktree was verified as `C:/git/dragonwar/.worktrees/epic-3`, and the tree was clean on entry. The skill was rendered against the worktree's own copy.
- **Context.** It reused the committed `epic-3-context.md` (valid, newer than every planning artifact) without recompiling it. Continuity came from Story 3.6's `done` spec.
- **Measurements.** Four synchronous planning subagents ran on the real engine. They wrote only to the session scratchpad and to probe files under `test/` that they deleted; once all four had returned, `git status --short` showed nothing but this spec. The figures and their bounds are under Design Notes, "Measurements".

**Split decided (author, 2026-10-13).** This spec is Part A only. Part B is Story 3.7b (`story-3-7b-planning-notes.md`). See `## Spec Change Log`.

**The eleven inbox entries.**
- DW-141: declined, re-owned to Story 3.3d at the spec gate (ledger-only; that story is at its bullet cap). No geometry moves here; the feed-rail record is not rebuilt.
- DW-175: retired by the author on 2026-10-13 (`by-design`): the goldens keep their coil prologue (the record is named under Design Notes).
- DW-185: moved to Story 3.7b by the author's split of 2026-10-13 (ledger re-owned).
- DW-219, DW-226, DW-228: addressed, A2.
- DW-268: addressed, A11.
- DW-273: addressed, A10 (two-ball instances) and Story 3.7b (the two a rebuild dissolves); the sweep itself was done at planning.
- DW-280: moved to Story 3.7b by the author's split of 2026-10-13 (ledger re-owned).
- DW-295: addressed, A6.
- DW-321: addressed in part, A13; the per-ball residual is named for re-owning to Story 3.3d.

**Seven new findings are in the frontmatter `deferred:` list** for the lead to harvest. The first is high: a Mouth eject can create a ball on top of a ball in the Lock lane.

**Readings applied** (Rule 5, apply and report; Design Notes): a strike pays the Dragon award; a Tilted entry stays a spit; under Tilt the Mode ends with the ball; "one ball remains" counts balls the controller still owes.

**For the lead, before dispatching implement.**
- **Authored placeholders** for the Story 3.11 playtest: 15 s of ball save, 10,000 per Dragon hit or strike, 25,000 per Ramp, and a 1.5 s gap before the second ball.
- **`machine.ballSave` gains an optional `deadlines` key** in `contracts/state.ts`. Measured: no golden ever holds a non-empty `ballSave`, so no hash moves.

**Checked against READY FOR DEVELOPMENT.** Every task names its files and the tasks are in dependency order; every AC is Given/When/Then with a planned mutation; there are no TBDs; no NFR is unmeasurable and no AC contradicts an AD's Rule, so there is no intent gap.

**What was written.** This spec only. No commit and no push.
