---
title: 'Story 2.9: Ball save'
type: 'feature'
created: '2026-09-07'
status: 'done'
baseline_revision: '411da335f5fa0ed9ac753c5efa0985447b116c8f'
baseline_commit: '411da335f5fa0ed9ac753c5efa0985447b116c8f'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      `test/contracts.test.ts`'s exhaustive-switch test gained three new `case` arms
      for the ball-save events, but their string bodies are never exercised by the
      one `expect(describeEvent(...))` call in that test.
    evidence: |-
      Found by the verification-gap reviewer during Story 2.9's review pass: the
      `describeEvent()` helper's new `ball_save_enabled` / `ball_save_timer_started`
      / `ball_saved` arms exist only to satisfy the `const neverEvent: never`
      exhaustiveness gate at compile time. A wrong field reference inside one of
      those arms (e.g. templating `event.tick` where `event.player` was intended)
      would still type-check and would not be caught by any assertion. The reviewer
      confirmed this mirrors an existing, unchanged pattern already present for
      other event variants in the same switch (`ball_missing`, `eject_failed`,
      etc.) -- Story 2.9 extended an existing gap rather than introducing a new one,
      so it is recorded here rather than patched in this story's own pass.
    location: >-
      test/contracts.test.ts:209-244
    severity: low
---

<intent-contract>

## Intent

**Problem:** `machine.ballSave` exists in `GameState` (`src/sim/contracts/state.ts:35-43`) but is completely inert — written twice as a reset, read nowhere. An early drain therefore always ends the ball, so a plunge that dribbles straight down the outlane costs a ball with no recourse, and PRD FR-19's enable/timer-start/hurry-up/grace vocabulary has no implementation at all.

**Approach:** Make `machine.ballSave` a live device owned by the ball controller (AD-18) with a rules-internal `arm({ ticks, source })` / `disarm(source)` surface: enabled at `ball_starting` with the timer stopped, started on `ball_launched`, projected to a new `l_ball_save` insert through the existing `lampsOf()` seam, and consulted at the drain so a save re-serves instead of ending the ball. Three new `…Ms` tunables and one new lamp move `header.gameStart.tuning` and `tableHash`, so the story also owes a **header-only** refresh of all five replay goldens.

## Boundaries & Constraints

**Always:**
- **AD-18 is the shape.** One machine-scoped device; the ball controller alone pulses `c_trough_eject` and `c_autolaunch` and alone mutates `ballsInPlay`; sources stack; the longest live window wins; Tilt disarms all.
- **AD-3 / AD-15.** The three durations are authored in ms **only** at the top level of `src/sim/table/tuning.ts`, each with a `source` string and a `confidence`. Every rules-side reader reaches ticks through `shotWindowTicks('<key>Ms', tuning)` — never `TICK_HZ`, never a hand-derived `'…Ticks'` name, never a nested key (`assertNoNestedMsKeys` throws).
- **AD-19.** The ball controller consumes `DeviceEvent`s only (`ball_launched`, `device_ball_entered/_left`); it never reaches for a `SwitchEvent`.
- **AD-9 / AD-16.** No colour anywhere under `src/sim/`; no `s_`/`c_`/`l_`/`bd_`-prefixed string literal outside `src/sim/table/dragonwar.ts` and `test/**` — reach every name through `TABLE` property access or a `TABLE`-derived expression.
- **The window comparison is inclusive `<=`, matching the project's only two existing tick windows** (`src/sim/rules/devices/shots.ts:67`, `src/sim/rules/devices/index.ts:258,296-300`). Expiry is evaluated **before** this tick's own device events are read, the same ordering both of those use.
- **`BallSaveState`'s serialized field set stays exactly `{ untilTick, sources }`.** It is inside the hashed `GameState`, so adding or renaming a field moves `expectedHash` and `expectedGameStateHash` on all five goldens — which is neither a header-only refresh nor a granted trajectory re-record.
- **Arming must be unreachable in `phase: 'attract'`.** All five goldens plunge (`ball_launched` fires) but never press `s_start`; if the timer could start outside a game, `machine.ballSave.untilTick` would change and every golden's state hash would go stale.
- `assets/src/dragonwar.blend` and `public/assets/*` are re-generated together with the `TABLE` change in one commit — `tools/export.py:194` rejects an `l_` node that is not a `TABLE.lamps` key, and `lamp-driver.ts:343` throws on a `TABLE.lamps` key with no glb node.
- `export BLENDER="C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe"` in every shell before any test or export command. Unset, the Blender-gated cases **skip** rather than fail, which reads as success.

**Block If:**
- Any golden's `expectedHash`, `expectedGameStateHash`, `expectedCheckpointHashes`, `transitions`, `coilPrologue`, `durationTicks` or `assetHash` moves. That is not a header refresh — **HALT and report**; do not re-record around it and do not switch a parity check off. A trajectory re-record needs the author's explicit grant and is out of this story's budget.
- The acceptance criteria cannot be met inside `BallSaveState`'s existing `{ untilTick, sources }` shape. Widening it costs five state hashes — **HALT** with the specific AC that forces it and the field you would add.
- The suite baseline moves in a way this story does not explain (files, tests, skips, `lint:boundaries` file count, `check:ad7`'s exact passing count of 3).

**Never:**
- Do not build tilt. Story 2.11 owns `s_tilt_bob`, `s_slam_tilt`, the warning ladder and the coil-disable batch. This story reads `machine.tilt.tilted` and ships the guard; it emits no tilt event and closes no tilt switch.
- Do not build a second arming source. No Epic 2 mode arms ball save; Quick multiball (Story 3.7) is the first.
- Do not add a Backglass row, a `ShowCommand`, a flasher, audio, or a `ModeView` for ball save. Story 2.6 delivered the DMD and chartered no ball-save field.
- Do not touch `INSERT_EMISSIVE_LEVEL`, the light budget, exposure or tonemapping — Story 4.1/4.2 own the scene's headroom (AD-12 clause 3), and Epic 2 must not pre-empt them.
- Do not decide DW-212 (the Lock insert's attract behaviour) or DW-204 (the skill shot's lane freeze). Both are the author's.
- Do not make `disarm` a no-op on the last source: an empty `sources` must return `untilTick` to `null`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enable, timer stopped | `ball_starting` fires in `phase: 'game'` | `ball_save_enabled` emitted; `machine.ballSave.sources` contains the controller's source; `untilTick` stays `null`; `l_ball_save` projects `{ role: 'off', step: 0 }` | No error expected |
| Timer starts | `ball_launched` at tick `L`, save enabled | `ball_save_timer_started { untilTick, tick }`; `untilTick === L + ballSaveTicks`; `l_ball_save` projects `{ role: 'lit', step: 1 }` | No error expected |
| Hurry-up | current tick is within the last `ballSaveHurryUpTicks` of the window | `l_ball_save` projects `{ role: 'lit', step: 3 }`; no extra command traffic per blink (presentation times the cadence) | No error expected |
| Displayed expiry | current tick `> untilTick` | `l_ball_save` projects `{ role: 'off', step: 0 }` — the insert follows the *displayed* window, and the grace that follows is deliberately invisible (PRD FR-19 defines grace as *past the displayed expiry*) | No error expected |
| Grace lapsed | current tick `> untilTick + graceTicks` | The device is disarmed; a drain from here ends the ball | No error expected |
| Drain inside the window | drain (parking entry taking `ballsInPlay` to 0) at `tick <= untilTick` | `ball_saved { player, tick }`; **no** `ball_ended`; ball number, `currentPlayer` and `modes[]` unchanged; `c_trough_eject` pulsed | No error expected |
| Drain inside grace | `untilTick < tick <= untilTick + graceTicks` | Saved exactly as above — grace is past the **displayed** expiry, so the insert is already off | No error expected |
| Drain past grace | `tick > untilTick + graceTicks` | Normal Story 2.5 drain: `ball_ended`, teardown, rotation or game over | No error expected |
| Autolaunch of the saved ball | served ball reaches the shooter lane (`device_ball_entered { device: bd_shooter }`) after a save | `c_autolaunch` pulsed **then**, not in the drain tick's batch | A pulse into an empty lane launches nothing (`src/sim/physics/devices.ts:489`), so same-tick pulsing silently fails FR-19 |
| Enabled but never launched | drain while `sources` non-empty and `untilTick === null` | **Not** saved — the ball ends normally | No error expected |
| Two sources | `arm({ ticks: a, source: 'x' })` then `arm({ ticks: b, source: 'y' })` at ticks `t1`, `t2` | `untilTick === max(t1 + a, t2 + b)`; both names in `sources` | No error expected |
| Disarm one of two | `disarm('x')` while `'y'` is live | `'x'` removed, `'y'` remains, device still armed, `untilTick` non-`null` | No error expected |
| Disarm the last source | `disarm('y')` leaving `sources` empty | `untilTick` returns to `null`; `l_ball_save` off | No error expected |
| Disarm an unknown source | `disarm('never-armed')` | No change; same object returned | Must not throw (Conventions: step paths never throw) |
| Tilt | `machine.tilt.tilted === true` with a live window | No save on drain **and** `l_ball_save` projects off — the device is inert while tilted | No error expected |
| Attract | `phase: 'attract'`, `ball_launched` fires (every golden does this) | Nothing arms; `machine.ballSave` stays `{ untilTick: null, sources: [] }`; no state-hash movement | No error expected |
| Between balls | `ball_will_start` | `ballSave` reset to `{ untilTick: null, sources: [] }` (existing Story 2.5 behaviour, unchanged); `l_ball_save` off | No error expected |

</intent-contract>

## Code Map

**Rules — the device and its owner**
- `src/sim/contracts/state.ts:35-43` — `BallSaveState { untilTick: number | null; sources: readonly string[] }`, field at `:67`. **Shape is frozen** (see Boundaries). Its doc comment already states "sources stack and the longest live window wins".
- `src/sim/rules/ball-controller.ts` — the owner. `startBall()` at `:221-258` resets `ballSave` at `:234` and queues the trough pulse at `:248`; `step()` at `:260-366`; the **drain branch at `:319-363`** is the interception point (`parkingEntryThisTick && machine.ballsInPlay === 0`). `HARDWARE_COILS` at `:169`; `ballServingCoils()` at `:145-158` is the existing precedent for reaching a coil name through `TABLE.ballDevices[*].ballSearchOrder` with no literal.
- `src/sim/rules/index.ts:229` calls `applyDeviceEvents` (decrements `ballsInPlay`) **before** `:236` calls `ballController.step(...)`. The controller therefore sees the post-decrement count; `state.machine.ballsInPlay` is still the pre-decrement value at `:229-236` if a "would reach 0" reading is wanted there.
- `src/sim/rules/devices/index.ts:283` emits `ball_launched` (on the **open** edge of `s_shooter_lane`); `:291-293` emits `device_ball_entered`. `bd_shooter` also emits `device_ball_entered` on arrival — the hook for the deferred autolaunch.
- `src/sim/contracts/events.ts:180-190` — the ten-member `SemanticEvent` union; `EventName` is derived at `:86`. Template shape at `:117-130`. **`ball_save_*` is absent entirely** — three new members.
- `src/sim/table/dragonwar.ts:377-390` — `bd_shooter`, `kind: 'non-parking'`, **no `ejectCoil`**; its launch coil is the first `pulse` in `ballSearchOrder` (`c_autolaunch`, `:384`). `c_autolaunch` declared at `:299`. `c_autolaunch` is already excluded from `HARDWARE_COILS` by construction, so a `disable` batch cannot swallow the pulse.
- `src/sim/physics/devices.ts:478-479,489+` — `launch()` resolves a ball resting in the entry zone; **a pulse into an empty shooter lane launches nothing**. This is why the autolaunch must be deferred.

**Tunables**
- `src/sim/table/tuning.ts` — `entry()` factory at `:49-51`; the Story 2.4 window trio at `:312-334` is the closest precedent (top-level scalars, doc-commented block, `'unverified'`). `Confidence` is `'high' | 'medium' | 'low' | 'unverified'` (`dragonwar.ts:54`). `shotWindowTicks()` at `:815-822` is generic over any top-level `…Ms` key — Story 2.4 already used it for the non-shot `lockCaptureWindowMs` (`src/sim/rules/devices/index.ts:236-239`). `msToTicks()` at `:672` uses `Math.round` and is **not exported**.
- `tools/boundary-lint.mjs:511-514,541-552` — `sim-no-literal-ms`: any identifier ending `Ms`/`_MS` bound to a numeric literal anywhere under `src/sim/` except `tuning.ts`. `:533` — `sim-one-tick-constant` bans naming `TICK_HZ` outside `contracts/time.ts` and `tuning.ts`.

**Lamps**
- `src/sim/table/dragonwar.ts:219-222` — `LampSubject`, a three-arm union, module-private. `:638-653` — the fourteen inserts; each entry is `{ channel: 'insert', group: 'lg_inserts', subject: {...} satisfies LampSubject }` and the key **is** the glb node name.
- `src/sim/rules/lamps.ts:70-91` — `projectLamp()`. The `lock` arm at `:76-78` resolves **above** the `!player` guard at `:79-81`; `letter` and `lane` resolve below it. Constants at `:44-47` — **no `LIT_STEP_3` exists yet**. `lampsOf()` at `:101-110` iterates `TABLE.lamps` generically. **Only exhaustiveness failure: `:86` reads `subject.lane`** after excluding `lock`/`letter`, so a fourth arm fails `pnpm typecheck` there; there is no `assertNever`.
- `src/sim/loop/index.ts:439-447` — the per-lamp diff; `:301` seeds `previousLamps` at boot. Both generic; no change needed.
- `src/presentation/lighting/grammar.ts:33-40,56` — `lit`/step 3 is already a supported `(role, step)` (`intensity 1.8`, `blinkPeriodMs 160`). No presentation change is required.

**Assets**
- `tools/make-placeholder-blend.py:3324-3330` — `add_insert(name, cx, cy, half_lens, half_cup)`; z constants at `:3316-3318` (lens top at table z = **−0.3 mm**, cup to −7.0 mm); `LANE_INSERT_HALF_MM`/`LANE_CUP_HALF_MM` at `:3319-3322`; `l_lock`'s single call at `:3359` is the closest template. Every `cx/cy` is derived from an existing local, never a re-typed literal (DW-149).
- `tools/export.py:446-486,597-603` — the collision doc is built from `col_`, `sw_` and `ballDevices` only, so **an `l_` node cannot move `assetHash`** (already pinned by `test/asset-contract.test.ts:2706-2710`). `:194` requires every `l_` node to be a known `TABLE.lamps` key.

**Replay / goldens**
- `src/sim/loop/replay.ts:145-147` `tableHash()` hashes the whole `TABLE`; `:150-152` `assetHash(doc)`; `:248-283` `assertHeaderMatchesLiveEnvironment` runs five checks first thing in `runReplay` (`:339`) and throws `StaleReplayHeaderError` (`:240`); `:275-282` compares `canonicalize(resolveTuning())` against the header — **`source` prose and `confidence` included**.
- `test/replays/*.golden.json` — all five currently `tableHash "672573c"`, `assetHash "ab163ff"`, `physicsVersion "v1-ce6772ef"` (**measured at this tree, 2026-09-07**). `GoldenFile` shape at `test/replay-goldens.test.ts:98-121`. `roll-and-drain` alone carries `checkpointTicks` / `expectedCheckpointHashes`. `test/replay-goldens.test.ts:64` records that none of the five presses `s_start`.

**Tests in the blast radius (read these before editing them)**
- `test/rules-lifecycle.test.ts:88-100,111-127,131-148` — launch at tick 10, drain at tick 20. **Inside any real save window → these break.**
- `test/rules-lifecycle.test.ts:152-187` — seeds `ballSave: { untilTick: 500, sources: ['test'] }` **and** `tilt: { tilted: true }`, then drains at tick 1. Under the Tilt guard this stays green unmodified; it becomes an accidental pin of "Tilt disarms all".
- `test/rules-lifecycle.test.ts:190-305` — game-over cases; `untilTick: null` and no launch, so unaffected.
- `test/rules-modes.test.ts:478-495` — `threeBallDrawSequence()`, launches at 7 and drains at 10. **Breaks.**
- `test/table.test.ts:405-415` — a hard fourteen-name literal array; a fifteenth lamp reddens it. `:417-445` are both-directions lane/letter checks a `ball_save` subject passes.
- `test/asset-contract.test.ts:2607-2615` `subjectSwitchName()` — a fourth kind **falls through to the Lock's switch with no type error**, and `:2646-2662` then demands `l_ball_save`'s centre sit inside `sw_lock_lane`. Needs a structural fix, not an edit.
- `test/contracts.test.ts:209-244` — exhaustive `switch` with `const neverEvent: never`; three new events need three new arms or `pnpm typecheck` fails.
- `test/lighting-integration.test.ts:189-203` — **no tick may carry more than two `LampCommand`s.** Keeping `l_ball_save` off until the timer starts keeps this satisfied; lighting it at `ball_starting` (the same tick the base mode lights lanes) risks breaching it.
- `test/rules-devices-headless.test.ts:193-201` `ENTRY_FILES` — a new `test/rules-*.test.ts` is **required** by the ratchet at `:215-236` and must be hand-added, and its module closure may not touch `sim/physics`, `sim/loop`, `@babylonjs` or `node:fs`.
- `test/util/switch-script.ts` — `close/open/at/build` (`:44-81`), `runRulesScript(script, { durationTicks, initialState?, tuning?, adjustments? })` (`:228`), results at `:181-192` (`statesByTick`, `events`, `coilCommands`). `assertTicksInRange` (`:91-97`) requires `durationTicks >= ` the largest scripted tick. Measured: 2321 scripted ticks across 60 runner calls cost 79 ms of test time, so multi-thousand-tick runs are cheap.

## Tasks & Acceptance

**Execution:**

1. `src/sim/table/tuning.ts` — add three top-level scalars in one doc-commented block, following the `:312-334` precedent: `ballSaveMs: entry(8000, …, 'unverified')`, `ballSaveHurryUpMs: entry(2000, …, 'unverified')`, `ballSaveGraceMs: entry(2000, …, 'unverified')`. `ballSaveGraceMs`'s `source` **cites PRD FR-19's named default of 2 s `[ASSUMPTION]`** (a transcription); the other two `source` strings state plainly that no artifact names a figure and that the value is authored and adjustable until Epic 3's playtest freeze. — *AD-3/AD-15: the only place a literal ms may be bound.*

2. `src/sim/contracts/events.ts` — add `BallSaveEnabledEvent { type: 'ball_save_enabled', tick }`, `BallSaveTimerStartedEvent { type: 'ball_save_timer_started', untilTick, tick }` and `BallSavedEvent { type: 'ball_saved', player, tick }` to the union at `:180-190`, in the file's existing one-interface-per-event shape. — *AD-9 payload-completeness; the Conventions row already reserves `_enabled` vs `_timer_started` as distinct.*

3. `src/sim/rules/ball-save.ts` (new, under `src/sim/rules/`) — pure helpers over `BallSaveState`: `armBallSave(state, { ticks, source }, tick)` (adds the source; `untilTick = max(existing, tick + ticks)`), `disarmBallSave(state, source)` (removes the name; `untilTick` returns to `null` when `sources` empties; unknown source is a no-op returning the same object), `enableBallSave(state, source)` (records the source with `untilTick` left `null`), and predicates for *running*, *within hurry-up* and *within grace*, each taking `tick` and the resolved tick counts. Inclusive `<=` throughout. — *Keeps AD-7's "plain data, mutated only inside `rules.step`" while giving the device a testable surface; a separate file keeps `ball-controller.ts`'s pinned `applyDeviceEvents` contract untouched.*

4. `src/sim/rules/ball-controller.ts` — wire the device: enable at `ball_starting` inside `startBall()` and emit `ball_save_enabled`; on `ball_launched` (in `step()`, gated on `phase === 'game'`) call `armBallSave` with `shotWindowTicks('ballSaveMs', tuning)` and emit `ball_save_timer_started`; in the drain branch at `:319-363`, when the save is live and `machine.tilt.tilted` is false, emit `ball_saved` and pulse the trough-eject coil **instead of** running the teardown/`ball_ended`/rotation path; disarm once the grace has lapsed. Resolve `c_autolaunch` through `TABLE.ballDevices.bd_shooter.ballSearchOrder`'s first `pulse` step — no literal. The controller must now receive the resolved tuning (mirror `createBallController(adjustments)`'s existing construction-time resolution). — *AD-18: this module alone pulses both coils and alone mutates `ballsInPlay`.*

5. `src/sim/rules/ball-controller.ts` — pulse `c_autolaunch` when the re-served ball reaches the shooter lane (`device_ball_entered { device: bd_shooter }`) following a save, **not** in the drain tick's command batch. — *`src/sim/physics/devices.ts:489` resolves a ball resting in the entry zone; a same-tick pulse fires into an empty lane and launches nothing, so the same-tick reading cannot satisfy FR-19's "a saved ball is auto-launched".*

6. `src/sim/table/dragonwar.ts` — add a fourth `LampSubject` arm `{ readonly kind: 'ball_save' }` at `:219-222` and a fifteenth entry `l_ball_save: { channel: 'insert', group: 'lg_inserts', subject: { kind: 'ball_save' } satisfies LampSubject }` at the end of the `lamps` block. — *AD-9: lamp state is a projection; the key is also the glb node name.*

7. `src/sim/rules/lamps.ts` — add a `LIT_STEP_3` constant and a `ball_save` branch in `projectLamp()` **beside the `lock` arm at `:76-78`, above the `!player` guard** (the subject is machine-scoped): off when not running or when `machine.tilt.tilted`; `lit`/1 while running; `lit`/3 within the last `ballSaveHurryUpTicks`; off from the displayed expiry onward (the grace window is deliberately invisible — PRD FR-19 defines grace as *past the displayed expiry*). `lampsOf` needs the resolved tick counts; thread them the same way the projection already receives what it needs, without adding a field to `GameState`. Add an explicit `never` exhaustiveness tail so a fifth kind fails to compile rather than falling through. — *Closes the `:86` narrowing hole this story would otherwise widen.*

8. `tools/make-placeholder-blend.py` — one `add_insert('l_ball_save', …)` call using `LANE_INSERT_HALF_MM`/`LANE_CUP_HALF_MM`, placed at the **bottom centre** of the playfield: centre x within ±40 mm of `playfieldMm.w / 2`, centre y below `playfieldMm.h * 0.2`, cx/cy derived from an existing local rather than a fresh literal (DW-149). Then re-build the blend and re-export (`pnpm export:assets`, `BLENDER` exported). — *AD-11: Blender owns placement; the insert must not overlap any existing cup and its lens top must stay at z ≤ −0.3 mm (DW-47).*

9. `test/table.test.ts:405-415` — extend the lamp-name array to fifteen. — *The only hard-coded lamp inventory in the suite; deliberately literal so a lamp cannot appear unnoticed.*

10. `test/asset-contract.test.ts:2607-2662` — make `subjectSwitchName()` return `string | null` for a subject with no `sw_` zone and skip the containment assertion for those, **and add a derived count assertion** that every zone-bearing subject was actually checked (so the loop cannot go silently vacuous). Add a replacement placement pin for `l_ball_save`: inside the playfield rectangle and within the bottom-centre bounds of task 8, measured off the exported glb. — *Ball Save has no switch; the fall-through would otherwise demand its centre sit inside `sw_lock_lane`.*

11. `test/contracts.test.ts:209-244` — add the three new `case` arms to the exhaustive event switch. — *`const neverEvent: never` makes this a `pnpm typecheck` failure otherwise.*

12. `test/rules-ball-save.test.ts` (new) — headless rules tests: the enable/timer-start distinction; the lamp step ladder; the four-probe boundary run (task 15); multi-source arbitration and `disarm`; the Tilt guard; the attract no-op. Then add its path to `ENTRY_FILES` in `test/rules-devices-headless.test.ts:193-201`. — *Rule 8 + the headless ratchet: the file is required by name the moment it exists, and its closure must not reach `sim/physics`, `sim/loop`, `@babylonjs` or `node:fs`.*

13. `test/rules-lifecycle.test.ts`, `test/rules-modes.test.ts` — move the drains in the launch-then-drain scripts (`rules-lifecycle:88-100,111-127,131-148`; `rules-modes:478-495`) past `untilTick + graceTicks`, or disarm explicitly, **preserving exactly what each test pins** (rotation, the Hot-seat window's two conjuncts, the tick-20 event ordering, the three-ball sequence). Do not weaken an assertion to make it pass. — *These tests were written before a drain could be saved; the behaviour genuinely changed.*

14. `test/replays/*.golden.json` — **header-only** refresh of all five: rewrite `header.tableHash` and `header.gameStart.tuning`, **append** to `notes`, and leave `assetHash`, `transitions`, `coilPrologue`, `durationTicks`, `expectedHash`, `expectedGameStateHash` and `expectedCheckpointHashes` byte-identical. Build the recording harness **in the scratchpad, never under `test/`** (a `test/**/*.test.ts` file silently joins `pnpm test`), over the shipped `runReplay` / `buildHeader` / `tableHash()` / `assetHash(doc)` surface with a scratchpad vitest config naming the absolute harness path. Trace BEFORE and AFTER on a tick stride into full-precision per-ball TSV and diff them — expect no output; ~1,132 sampled rows across the five (80 / 32 / 371 / 384 / 265) is the known corpus, and a materially different row count means the instrument is wrong. **Serialize `gameStart.tuning` in `resolveTuning()`'s natural declaration order with `value`/`source`/`confidence` per entry** — DW-213's `reopen_if` fires if the order flips back to sorted/`confidence`-first, turning a `wontfix-accepted` into live work. — *Story 2.4 (`b9f5431`) is the precedent: 32 insertions / 2 deletions per golden, header-only, no author grant needed.*

15. `test/rules-ball-save.test.ts` — the boundary run must probe **four** ticks, not three: `untilTick − 1` (saved), `untilTick + graceTicks − 1` (saved), **`untilTick + graceTicks` exactly (saved)**, and `untilTick + graceTicks + 1` (ends). Use an override tuning built from **independently authored small literals** (e.g. 100 ms / 30 ms at 1 kHz) and script the drains at absolute ticks written out from those literals — never read back from `shotWindowTicks()`. — *The epic's own three probes cannot catch a `<=` → `<` mutation: `untilTick + grace − 1` passes under both. The exact-boundary probe is the one that reddens, exactly as Story 2.4's own boundary mutation did. Satisfies AC 11.*

**Acceptance Criteria:**

- **AC 1 — enable is not a start.** Given a game in progress, when `ball_starting` fires, then `ball_save_enabled` is emitted, `machine.ballSave.untilTick` is still `null`, and `l_ball_save` projects `{ role: 'off', step: 0 }`.
- **AC 2 — the timer starts at the plunge and the insert follows it.** Given the save is enabled, when `ball_launched` fires at tick `L`, then `ball_save_timer_started` is emitted, `untilTick === L + shotWindowTicks('ballSaveMs', tuning)`, and sampling `lampsOf()` across the whole window yields a **non-empty** step-1 span followed by a **non-empty** step-3 span, with every step-3 tick later than every step-1 tick, and `off` from the displayed expiry onward.
- **AC 3 — a save re-serves instead of ending the ball.** Given a live window, when a parking entry would take `ballsInPlay` to 0, then `ball_saved { player }` is emitted, **no** `ball_ended` is emitted, `currentPlayer`, `players[i].ballNumber` and `modes[]` are unchanged, and a `pulse` on `TABLE.ballDevices.bd_trough.ejectCoil` appears in that tick's `coilCommands`.
- **AC 4 — the autolaunch is deferred to the served ball's arrival.** Given a save has re-served, when `device_ball_entered { device: bd_shooter }` arrives, then and only then does a `pulse` on `bd_shooter`'s `ballSearchOrder` launch coil appear in `coilCommands` — and it is absent from the drain tick's batch.
- **AC 5 — arbitration.** Given `arm({ ticks: a, source: 'x' })` at `t1` and `arm({ ticks: b, source: 'y' })` at `t2` with `t1 + a !== t2 + b`, when both are live, then `untilTick === max(t1 + a, t2 + b)`; `disarm('x')` leaves `'y'` armed with `untilTick` non-`null`; `disarm('y')` then returns `untilTick` to `null`; and `disarm` of a never-armed source returns the same object without throwing.
- **AC 6 — Tilt makes the device inert.** Given a live window and `machine.tilt.tilted === true`, when a drain occurs, then the ball ends normally and `l_ball_save` projects off. (Story 2.11 will additionally call `disarm(source)` on the tilt event; this story ships the read-side guard, which is the only half testable at this tree.)
- **AC 7 — the goldens moved for exactly one reason.** Given the change is complete, when `git diff test/replays/` is inspected, then `header.tableHash`, `header.gameStart.tuning` and `notes` are the only fields that moved on any of the five, and `pnpm test` passes with no `StaleReplayHeaderError`.
- **AC 8 (Integration AC) — the device drives a real consumer through the real seam.** Given a game started through `createLoop`, when the ball is launched and the window expires, then `FrameOutput.commands` carries `LampCommand { lamp: 'l_ball_save', role: 'lit', step: 1 }`, later `step: 3`, and finally `{ role: 'off', step: 0 }` — asserted on the loop's own command stream, not by reading `machine.ballSave`, and with no tick of the run carrying more than two `LampCommand`s.
- **AC 9 — the tunables are pinned by consequence, not by re-import.** Given the **production** tuning, when a launch is followed by a drain 3,000 ticks later, then the ball is saved; when it is followed by a drain 30,000 ticks later, then the ball ends; and `0 < ballSaveHurryUpMs < ballSaveMs` and `ballSaveGraceMs > 0` hold on the resolved tuning. No expectation in these assertions may be computed from the tunable under test.
- **AC 10 — nothing arms outside a game.** Given `phase: 'attract'`, when `ball_launched` fires, then `machine.ballSave` remains `{ untilTick: null, sources: [] }` and all five goldens' `expectedGameStateHash` values are unchanged.
- **AC 11 — the drain boundary is straddled on both sides.** Given a switch-script test under an override tuning of independently authored literals, when drains occur at `untilTick − 1`, `untilTick + graceTicks − 1`, `untilTick + graceTicks` and `untilTick + graceTicks + 1`, then the first three save and the fourth ends the ball. (The epic's stated three probes are the first, second and fourth; the third is added because none of the three can distinguish `<=` from `<` at the boundary — see the Rule 19 mutation below.)

## Spec Change Log

## Review Triage Log

### 2026-09-07 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3 (medium 1, low 2)
- defer: 1 (low 1)
- reject: 5
- addressed_findings:
  - `[medium]` `[patch]` `awaitingSaveLaunch` (the deferred-autolaunch flag, `ball-controller.ts`) had no reset point tied to the ball lifecycle -- unlike `machine.ballSave` itself (reset at `ball_will_start`, AD-7) and unlike this file's own cited precedent `pendingLockLaneClosure` (self-clears on a tick timeout). Found independently by blind-hunter and edge-case-hunter. If a save's re-serve never reached `bd_shooter` (a real, reachable `eject_failed`, or any future ball-search/multiball interaction intervening first), the stale `true` would silently auto-launch the NEXT ball's own first, unrelated arrival at the shooter lane. Fixed: `startBall()` now resets the flag at `ball_will_start`, the same boundary AD-7 already resets `ballSave`/`tilt`/`multiball` at. Two new tests added to `test/rules-ball-save.test.ts` drive `createBallController()` directly (the flag has no `GameState` analogue `runRulesScript()`'s initial-state surface can seed) and were confirmed red against a saved-copy revert of the fix before being restored green.
  - `[low]` `[patch]` The deferred autolaunch's coil pulse (`ball-controller.ts`, the `awaitingSaveLaunch` arrival branch) had no Tilt guard, unlike the drain branch a few lines below it (`!nextState.machine.tilt.tilted`). Found by edge-case-hunter. A Tilt engaging between a save's trough-eject and the re-served ball's own arrival at `bd_shooter` would still fire the launch coil, in tension with AC 6's "the device is inert while tilted." Fixed: the arrival branch now checks `!nextState.machine.tilt.tilted` before pushing the coil pulse (still consuming the flag either way, so a later non-tilted arrival cannot also fire it) -- this stays inside the read-side guard this story is scoped to (no tilt event is emitted or consumed). Covered by the same two new tests above.
  - `[low]` `[patch]` `test/lighting-scene.test.ts` (6 spots) and `test/lighting-integration.test.ts` (3 spots) still described "fourteen" lit lamps/inserts in comments and assertion messages, made stale by this story's fifteenth lamp (`l_ball_save`). Found by blind-hunter. The underlying assertions are all derived from `Object.keys(TABLE.lamps)` and were never actually wrong, so this was cosmetic only. Fixed: updated the prose to "fifteen" in both files; no assertion logic changed.

## Design Notes

**Governing architecture decisions (Rule 6).** **AD-18** is the primary — it names `machine.ballSave` as one machine device owned by the ball controller, with `arm({ ticks, source })` / `disarm(source)`, stacking sources, the longest live window winning, Tilt disarming all, and the ball controller alone pulsing `c_trough_eject` / `c_autolaunch` and mutating `ballsInPlay`. **AD-6** supplies the plunge semantics: the *opening* of `s_shooter_lane` is the one event meaning "plunged", "on which the ball controller increments `ballsInPlay`, **starts the ball-save timer** and arms the skill shot" — this story is the one that makes the middle clause true. **AD-19** is the boundary the device sits inside: the controller consumes device events, never a raw `SwitchEvent`. **AD-3** and **AD-15** govern the three tunables (ms in `tuning.ts`, converted once, `source` + `confidence`, and the whole serialized output hashed into every golden header). **AD-9** governs the new lamp (`step ∈ {0,1,2,3}` is the only progression rules may express, and it names "ball-save hurry-up" explicitly) and the payload-completeness of the three new events. **AD-7** keeps `ballSave` machine-scoped and reset at `ball_will_start`. **AD-12** is read-only here: clause 3 records that a lit insert's dynamic light contributes 0.00 luma in the current scene, so the new insert inherits a grammar carried by the emissive material alone — Epic 2 must not touch the levers Story 4.1/4.2 own. **No AC contradicts any AD Rule.**

**Consumes:** Story 2.4 (`ball_launched`, `device_ball_entered/_left` from the devices layer) · Story 2.5 (the ball controller, the `ball_will_start` → `ball_starting` → `ball_started` lifecycle, `ballsInPlay`, `HARDWARE_COILS`) · Story 2.3/2.1d (`bd_shooter`, `c_autolaunch`, the physics eject/launch path) · Story 2.8 (`lampsOf()`, the `sim/loop` lamp diff, `grammar.ts`'s `lit`/step 3 row) · AD-15's tuning resolver (`shotWindowTicks()`).

**Consumed-by:** **Story 2.11 (Tilt)** — calls `disarm(source)` for every source on the tilt event; this story ships the `machine.tilt.tilted` read-side guard, which is the only half testable before 2.11 exists. **Story 3.7 (Quick multiball)** — the first *second* arming source (PRD FR-19: "multiball Modes set their own Ball save"; PRD:227). **Story 2.6's Backglass** is deliberately **not** a consumer: no ball-save row is chartered.

**Integration ACs (Rule 1).** AC 8 is the integration criterion: `lampsOf()` + the `sim/loop` diff read the device and produce an observable `LampCommand` stream on `FrameOutput`, asserted at the loop tier rather than by inspecting `machine.ballSave`. AC 3/AC 4 are the second consumer — the drain path — asserted on emitted events and `coilCommands`. **`arm({ ticks, source })` has no second caller in this story; the first will be Story 3.7**, so AC 5 exercises the arbitration through direct calls to the rules-internal surface in the headless test.

**Why DW-212 does not gate this story.** DW-212 asks whether `l_lock` should stay lit between balls and in Attract, because `lampsOf()` resolves the `lock` subject *above* the "no base mode ⇒ all off" guard (`src/sim/rules/lamps.ts:76-81`). The `ball_save` subject is machine-scoped too and sits in the same tier — but its answer is **independent of DW-212's**, and provably so: `machine.ballSave` is `{ untilTick: null }` at boot (`src/sim/loop/index.ts:217`) and is reset at every `ball_will_start` (`ball-controller.ts:234`), whereas `bd_lock`'s occupancy persists. So `l_ball_save` projects **off** in Attract and between balls under *either* guard placement, satisfying the frozen intent contract by construction. AC 1 and AC 10 assert that off-ness directly. Whichever way the author decides the Lock, nothing in this story changes. The story therefore neither builds on nor pre-empts the pending decision. **DW-204** (the skill shot's lane-freeze question) is untouched — this story reads no lane state.

**Why `BallSaveState`'s shape is frozen, and what it costs.** `machine.ballSave` is inside the hashed `GameState` (`src/sim/loop/replay.ts:115-122`), so adding a field would move `expectedHash` **and** `expectedGameStateHash` on all five goldens — a state-hash change, which is neither the header-only refresh this story is budgeted for nor a granted trajectory re-record. The consequence is that `sources` carries names only, with a single `untilTick` holding the *effective* (maximum) deadline. Disarming the source that set the maximum therefore leaves the deadline where it was rather than shrinking it to the next-longest source's. That satisfies AC 5's own wording ("`disarm(source)` of one leaves the other") and matches the shipped contract's own doc comment, which already pairs a name list with a single `untilTick`. It is recorded here as a decided limitation, not an oversight; the per-source form becomes affordable the moment a story is already re-recording state hashes.

**Anti-vacuity plan for three new tunables (epic vacuity #43).** `INSERT_EMISSIVE_LEVEL` could be set to 0 — blackening every insert — with the suite 1824 green, because every expectation was `colour × INSERT_EMISSIVE_LEVEL`. The same trap is live here three times over. So: **no expectation in this story may be computed from `ballSaveMs`, `ballSaveHurryUpMs` or `ballSaveGraceMs`.** AC 9 pins them by *observable consequence* with independently authored probe offsets (3,000 and 30,000 ticks) that bracket the window behaviourally, plus relational invariants that need no re-import. AC 2 pins the hurry-up *structurally* — a non-empty step-1 span, a non-empty step-3 span, step 3 strictly later — which reddens if `ballSaveHurryUpMs` is 0 (no step-3 span) or ≥ `ballSaveMs` (no step-1 span), again without naming a value. AC 5's boundary run uses an override tuning of authored literals and scripts its probes at absolute ticks spelled out from those literals, never read back through `shotWindowTicks()`. The relational assertions are the weakest of the three and are deliberately the *secondary* pin, following `test/lighting-scene.test.ts:561-565`'s model (measure against something else) rather than `:500,508`'s (`toBe(CONSTANT)`).

**What the lamp tests prove, and what they cannot (AD-15/epic vacuity #42).** Every lamp assertion in this story is a **lamp-state** claim — the `{ role, step }` a pure projection yields, and the `LampCommand`s the loop's diff emits. Those are honestly testable headlessly. **None of them proves a pixel changed.** `NullEngine` rasterises nothing, and AD-12 clause 3 records that in the current scene a lit insert's dynamic light moves the composited pixel by 0.00 luma. So a green suite here means "the projection and the command stream are correct", never "the ball-save insert is visible". Confirming the insert renders at all belongs to the lead's browser smoke; confirming it is *visibly* lit belongs to Story 4.1, whose own criterion is that Story 2.8's A/B goes non-zero.

**Golden budget, measured at this tree (2026-09-07).** All five goldens carry `tableHash 672573c` / `assetHash ab163ff` / `physicsVersion v1-ce6772ef` — matching the epic baseline with no drift. Adding `l_ball_save` moves `tableHash` (it hashes the whole `TABLE`); the three tunables add **six** header keys (each `…Ms` gains a derived `…Ticks` sibling carrying the same `source` and `confidence`) and move `header.gameStart.tuning`. `assetHash` does **not** move: an `l_` node matches none of `tools/export.py`'s three collision-builder prefixes. Story 2.4's `b9f5431` is the exact precedent — 32 insertions / 2 deletions per golden for the same reason — so this is routine and needs no author grant. **What would need a grant, and must instead HALT, is any movement in a body field or a state hash.**

**Ledger inbox (Rule 17).** `bash _bmad/scripts/ledger.sh _bmad-output/implementation-artifacts/deferred-work.md slice 2-9-ball-save` returns empty at this tree — verified during planning. This story owns no ledger entries; there is nothing to address or decline.

## Verification

**Commands** (export `BLENDER="C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe"` first, in every shell — unset, the Blender-gated cases skip and the counts change):
- `pnpm typecheck` — expected: exits 0 across all three tsconfigs. A missing `case` arm in `test/contracts.test.ts` or a missing `never` tail in `projectLamp()` fails here first.
- `pnpm test` — expected: 0 failing, **0 skipped**. Baseline before this story was 112 files / 1824 tests; report the counts as measured and account for the delta (one new test file plus the new cases). 23 skips means `BLENDER` was not exported.
- `pnpm lint:boundaries` — expected: `OK -- N .ts file(s)`; N grows by the new `src/sim/rules/ball-save.ts`. Any `sim-no-literal-ms`, `sim-one-tick-constant`, `no-device-name-literal` or `sim-no-colour` violation is a failure.
- `pnpm check:headers` and `pnpm check:attributions` — expected: exit 0; the new source file carries the GPL-3.0 header.
- `pnpm export:assets` — expected: exit 0, `l_ball_save` accepted by `tools/export.py:194`, `public/assets/dragonwar.glb` regenerated.
- `pnpm check:ad7` — expected: exit 0 with **exactly 3** passing tests. `pnpm check:corridor` and `pnpm check:reachability` — expected: exit 0 (reachability over its 52 cases, ~2 minutes).
- **Golden hash-identity gate:** `git diff test/replays/ | grep -E 'expected(Hash|GameStateHash|CheckpointHashes)|assetHash|"transitions"|coilPrologue|durationTicks'` — expected: **no output**. Any line here is the Block-If condition; HALT.
- `git diff --stat -- public/assets/dragonwar.collision.json` — expected: **empty** (an `l_` node cannot reach the collision doc).
- `git ls-files --others --exclude-standard test/` — expected: only the intended new test file; the re-record harness must never appear under `test/`.

**Rule 19 mutations — one per acceptance criterion, each applied, observed red, then reverted from a saved copy (never `git checkout --`, never `git stash`), with `git status --short` and `git diff --stat` confirmed unchanged afterwards. State the expected red BEFORE running each one; a mutation harness can itself be vacuous.**
- **AC 1** — make the `ball_starting` enable also set `untilTick` → the enable-is-not-a-start assertion in `test/rules-ball-save.test.ts` reddens.
- **AC 2** — set `LIT_STEP_3` back to step 1 in `projectLamp()`'s hurry-up branch → the "non-empty step-3 span" assertion reddens while the step-1 span stays green.
- **AC 3** — remove the save interception so the drain branch always runs → the `ball_saved`/no-`ball_ended` assertions redden.
- **AC 4** — move the `c_autolaunch` pulse into the drain tick's batch → the "absent from the drain tick" assertion reddens.
- **AC 5** — change `armBallSave`'s `max` to "last write wins" → the two-source arbitration assertion reddens.
- **AC 6** — drop the `machine.tilt.tilted` guard → `test/rules-lifecycle.test.ts:152-187` (which seeds `tilted: true` with `untilTick: 500` and drains at tick 1) reddens without being edited.
- **AC 7** — revert one golden's `header.tableHash` to `672573c` → `test/replay-goldens.test.ts` reddens with a named `StaleReplayHeaderError`.
- **AC 8** — drop the per-lamp diff guard in `src/sim/loop/index.ts:439-447` so the whole projection is pushed → the ≤2-commands-per-tick assertion reddens (fifteen commands on the arming tick).
- **AC 9** — set `ballSaveMs` to `1` → the "drain 3,000 ticks later is saved" probe reddens; set it to `60000` → the "drain 30,000 ticks later ends the ball" probe reddens. Run both.
- **AC 10** — remove the `phase === 'game'` gate on arming → all five goldens redden on `expectedGameStateHash`, which is exactly the state-hash movement the Block-If forbids.
- **AC 11** — change the grace comparison from `<=` to `<` → **only** the exact-`untilTick + graceTicks` probe reddens; the epic's own three stated probes all stay green under it, which is precisely why task 15 requires a fourth. Run it and record which test went red. (Story 2.4's boundary mutation took the identical form.)

**Manual checks:**
- The re-record trace diff (`trace-BEFORE` vs `trace-AFTER`, tick-stride sampled, full precision): expect **no output**, and a row count of the order of 1,132 across the five (80 / 32 / 371 / 384 / 265). A materially different row count means the instrument, not the change, is wrong.
- Inspect each golden's `notes`: **appended**, never rewritten, with the existing `DW-70` and `deviceSlots` provenance intact.
- Inspect the `gameStart.tuning` diff: only the six new blocks should appear. A four-figure reordering diff means the harness flipped the key order and has tripped DW-213's `reopen_if`.
- **Presentation limits (stated plainly, AD-15):** no automated test in this story can observe a rendered pixel. The lamp assertions prove the projection and the command stream; they cannot prove the ball-save insert is visible on the playfield. That is the lead's browser smoke, and its *visible brightness* is Story 4.1's criterion, not this story's.

## Auto Run Result

**Summary of implemented change.** `machine.ballSave` is now a live, machine-scoped device owned by `src/sim/rules/ball-controller.ts` (AD-18): enabled with the timer stopped at `ball_starting`, armed on `ball_launched` via a new `src/sim/rules/ball-save.ts` (`armBallSave`/`disarmBallSave`/`enableBallSave`/`isRunning`/`isWithinHurryUp`/`isWithinGrace`/`hasGraceLapsed`, inclusive `<=` throughout), projected to a new `l_ball_save` insert through the existing `lampsOf()`/`sim/loop` lamp-diff seam, and consulted at the drain so a live window or its grace re-serves the ball (`ball_saved`, a `c_trough_eject` pulse, the autolaunch coil deferred to the re-served ball's own arrival at `bd_shooter`) instead of ending it. Three new `…Ms` tunables (`ballSaveMs`, `ballSaveHurryUpMs`, `ballSaveGraceMs`) were added to `src/sim/table/tuning.ts`, each reached through `shotWindowTicks()`. All five replay goldens received the header-only refresh this story owed (`header.tableHash`, `header.gameStart.tuning`'s six new entries, `notes` appended) with no state-hash, trajectory, or `assetHash` movement. All 15 execution tasks and all 11 acceptance criteria are implemented and verified; no `Block If` condition was hit.

**Files changed:**
- `src/sim/table/tuning.ts` — three new top-level `…Ms` tunables (`ballSaveMs`, `ballSaveHurryUpMs`, `ballSaveGraceMs`), each with `source`/`confidence`.
- `src/sim/contracts/events.ts` — three new `SemanticEvent` members: `ball_save_enabled`, `ball_save_timer_started`, `ball_saved`.
- `src/sim/rules/ball-save.ts` (new) — pure `BallSaveState` helpers (arm/disarm/enable + running/hurry-up/grace predicates).
- `src/sim/rules/ball-controller.ts` — wires the device: enable at `ball_starting`, arm at `ball_launched`, drain-branch interception into a save, the deferred autolaunch on the re-served ball's arrival; two review-pass fixes (see below).
- `src/sim/rules/index.ts` — threads resolved `tuning` into `createBallController`.
- `src/sim/table/dragonwar.ts` — new `LampSubject` arm `{ kind: 'ball_save' }` and the fifteenth lamp, `l_ball_save`.
- `src/sim/rules/lamps.ts` — `projectBallSave()` (off/lit-1/lit-3 per Tilt/running/hurry-up), wired above the `!player` guard beside `lock`; explicit `never` exhaustiveness tail.
- `src/sim/loop/index.ts` — resolves `ballSaveHurryUpTicks` once and threads it to both `lampsOf()` call sites.
- `tools/make-placeholder-blend.py`, `assets/src/dragonwar.blend`, `public/assets/dragonwar.glb` — the `l_ball_save` insert (bottom-centre), rebuilt and re-exported; `dragonwar.collision.json` unaffected (confirmed empty diff).
- `test/rules-ball-save.test.ts` (new) — headless rules coverage for AC 1–7, 9–11, plus two review-pass regression tests (see below).
- `test/rules-ball-save-integration.test.ts` (new) — AC 8's real-`createLoop` `LampCommand`-stream integration test.
- `test/rules-devices-headless.test.ts` — registers the new headless test file in `ENTRY_FILES`.
- `test/table.test.ts` — fifteen-lamp inventory.
- `test/asset-contract.test.ts` — `subjectSwitchName()` widened to `string | null` with a non-vacuity count assertion; `l_ball_save` placement pin.
- `test/contracts.test.ts` — three new exhaustive-switch `case` arms.
- `test/rules-lifecycle.test.ts`, `test/rules-modes.test.ts`, `test/backglass-frame.test.ts`, `test/backglass-integration.test.ts` — collateral drains moved past the (overridden, near-zero) ball-save window so pre-existing scripts keep pinning what they always pinned.
- `test/replays/*.golden.json` (all five) — header-only refresh (`tableHash`, `gameStart.tuning`, `notes` appended); verified byte-identical elsewhere.
- `test/lighting-scene.test.ts`, `test/lighting-integration.test.ts` — review-pass cosmetic fix: stale "fourteen"-lamp prose updated to "fifteen" (assertions were already lamp-count-derived and unaffected).

**Review findings breakdown.** Four reviewers ran in parallel (blind-hunter, edge-case-hunter, verification-gap, intent-alignment). Two independently converged on the same root cause.
- **Patches applied (3, medium 1 / low 2):**
  - `[medium]` `awaitingSaveLaunch` (the deferred-autolaunch flag) had no ball-lifecycle reset point, unlike `machine.ballSave` itself and unlike the file's own cited `pendingLockLaneClosure` precedent (which self-clears on a timeout). A save whose re-serve never reached `bd_shooter` could leave the flag stuck `true` and silently auto-launch a later, unrelated ball. Fixed in `startBall()` (resets at `ball_will_start`, the same AD-7 boundary `ballSave`/`tilt`/`multiball` already reset at). Two new tests drive `createBallController()` directly and were confirmed red against a saved-copy revert before being restored green.
  - `[low]` The deferred autolaunch's coil pulse had no Tilt guard, unlike the drain branch a few lines below it. Fixed by mirroring the drain branch's `!tilt.tilted` check (still consuming the flag either way). Currently unreachable in production (no tilt event exists before Story 2.11), fixed defensively for consistency with AC 6's "inert while tilted" and covered by the same two new tests.
  - `[low]` Stale "fourteen"-lamp prose in two pre-existing lighting test files, made inaccurate by this story's fifteenth lamp. Cosmetic only; the underlying assertions were already correct (`Object.keys(TABLE.lamps)`-derived). Updated to "fifteen".
- **Deferred (1, low 1):** `test/contracts.test.ts`'s three new exhaustive-switch case-arm bodies are never exercised by that test's one assertion — an existing, unchanged pattern this story extended rather than introduced. Recorded in frontmatter `deferred:`.
- **Rejected (5):** (1) "the ball-save timer re-arms on every subsequent plunge" — verified against AD-18/AD-6's own text in the architecture spine, which unconditionally starts the ball-save timer on every opening of `s_shooter_lane`, including a save's own auto-relaunch; this is the architecture's specified behaviour, not a defect. (2) "Tilt 'disarms all' per AD-18/a pre-existing doc comment, vs. this story's read-only guard" — already explicitly scoped and accepted in the spec's own AC 6 and Design Notes ("Story 2.11 will additionally call disarm(source)... this story ships the read-side guard"). (3) "the 'Between balls' matrix row's isolated reset is never independently observable because `ball_starting`'s enable fuses into the same `startBall()` call" — pre-existing Story 2.5 architecture, correctly implemented and asserted exactly as AC 1 specifies. (4) "`disarm()` of the max-setting source doesn't shrink `untilTick` to the next-longest survivor's" — explicitly documented in the spec's own Design Notes as a decided, accepted limitation of the frozen `{untilTick, sources}` shape. (5) A stale `Status: ready-for-dev` line in this file's own (pre-finalize) Auto Run Result footer, flagged mid-review before this Finalize step had run — an artifact of review timing, not a diff defect.

**Follow-up review recommendation: `true`.** Only this pass's `patch`-triaged findings count (medium 1, low 2): `3 × 1 + 1 × 2 = 5`, which meets the "5 or more" threshold (no patched finding was itself `high`).

**Verification performed.**
- `pnpm typecheck` — clean across all three tsconfigs, both before and after the review-pass patches.
- `pnpm test` — **114 files / 1854 tests, 0 failed, 0 skipped** (2 more than the implementer's own 1852, from the two new review-pass regression tests; the story's cited 112/1824 baseline reflects the epic tree, not this multi-story-agent worktree at hand-off — the delta is fully explained by this story's own new/changed test files).
- `pnpm lint:boundaries` — `OK -- 105 .ts file(s)`, no violations.
- `pnpm check:headers`, `pnpm check:attributions` — both clean.
- `pnpm export:assets` — clean; `l_ball_save` accepted; `dragonwar.collision.json` diff confirmed empty.
- `pnpm check:ad7` — exactly 3 passing. `pnpm check:corridor` — 1 passing. `pnpm check:reachability` — 1 passing (52 cases, ~112 s).
- Golden hash-identity gate — re-verified structurally (per-field JSON comparison against `baseline_revision`, not raw substring grep, since golden `notes` prose itself contains the forbidden field names historically): only `tableHash` and `gameStart.tuning` moved on any of the five goldens; `expectedHash`/`expectedGameStateHash`/`expectedCheckpointHashes`/`assetHash`/`transitions`/`coilPrologue`/`durationTicks` are byte-identical to `baseline_revision` on all five.
- `git diff --stat -- public/assets/dragonwar.collision.json` — empty. `git ls-files --others --exclude-standard test/` — only the two intended new test files.
- Matrix Test Audit — all 17 I/O & Edge-Case Matrix rows confirmed covered by a passing, registered test (16 in `test/rules-ball-save.test.ts`/`-integration.test.ts`, "Between balls" by the pre-existing, story-updated `test/rules-lifecycle.test.ts:174-215`).
- Rule 19 mutations — the implementer's 11 AC mutations (one per AC) were each observed red then reverted (per their own report); this review pass additionally ran and confirmed red both of its own two new regression tests against saved-copy reverts of the tilt-guard and ball-boundary-reset fixes before restoring them green. No `git checkout --`/`git stash` used at any point; `git status --short`/`git diff --stat` confirmed unchanged after every revert-and-restore cycle.

**Residual risks.**
- The deferred-autolaunch Tilt guard is defensively fixed but currently untestable through any real game-triggered tilt event (Story 2.11 hasn't landed); it is exercised only via direct `GameState` seeding, the same technique the existing AC 6 test already uses for the same reason.
- `disarm()`'s "never shrinks `untilTick` below the max-setter's own deadline" behaviour (a spec-documented, accepted limitation) means a future multiball-arming story (3.7) inherits a slightly coarser arbitration semantics than a per-source deadline list would give; this is priced into the spec's own Design Notes, not new information from this pass.
- No automated test in this story observes a rendered pixel (`NullEngine` rasterises nothing, per AD-12 clause 3) — the lamp assertions prove projection and command-stream correctness only, exactly as the spec's own Verification section discloses.

Status: done
Blocking condition: none
