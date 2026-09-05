---
title: 'Story 2.4: The devices-and-shots layer'
type: 'feature'
created: '2026-09-05'
status: 'done' # draft | ready-for-dev | in-progress | in-review | done | blocked
baseline_revision: '6aca2b830cee0213c8b1f00f01eb58b80374c225'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The new rules-no-switch-event-outside-devices boundary-lint check (tools/boundary-lint.mjs) is a
      textual pattern match that does not catch every syntactically valid way to import or use SwitchEvent
      outside src/sim/rules/devices/.
    evidence: |-
      Confirmed bypassable, via a fresh probe outside the repo run against the real checker, by (a) a
      namespace import combined with property access (`import * as Names from '../table/names'; ...:
      Names.SwitchEvent`) and (b) an inline type-import expression (`event: import('../table/names').SwitchEvent`)
      -- both produced zero violations. Neither form is used anywhere in the current tree; the check does
      catch the canonical `import type { SwitchEvent } from '...'` / `export { SwitchEvent }` binding-list
      forms this codebase actually writes throughout, which is what AC 1's own fixture proves. Closing the
      gap fully would require extending the tokenizer to track namespace-import
      aliases and their later property-access usages across the file -- materially bigger than the existing
      pattern-match checks (c)-(f), and out of this story's own effort budget.
    location: >-
      tools/boundary-lint.mjs (the rules-no-switch-event-outside-devices check)
    severity: medium
  - summary: >-
      pendingLockLaneClosure in src/sim/rules/devices/index.ts tracks at most one outstanding Lock-lane
      closure at a time; two balls approaching the Lock lane in overlapping windows would have the second
      closure silently discard the first's still-open window.
    evidence: |-
      Not reachable today: GameState.machine.multiball is always null in the current tree (no story has
      wired up multiball yet), so at most one ball can be near the Lock lane at once. Flagged for whichever
      future story first makes two simultaneous balls possible near the Lock lane -- likely wherever
      multiball itself lands, or Story 3.2 (the Lock arbiter, AD-18), which already owns lock_lane_entered
      as its sole consumer.
    location: >-
      src/sim/rules/devices/index.ts (pendingLockLaneClosure)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Every rules story after this one — the ball lifecycle, the skill shot, lane change, ball save, bonus, tilt, ball search, and all of Epic 3's modes — needs to know what "a Loop", "a Ramp", "a letter" and "a Lock-lane entry" mean. Today nothing does: `TABLE.shots` is `{}`, `src/sim/rules/devices.ts` reads only the shooter-lane entry switch and parking-device slot switches, and every other switch edge reaching `rules.step()` (`s_dragon_*`, `s_spinner`, `s_lock_lane`, the Top lanes, the inlane/outlane set, the cabinet buttons) is silently dropped. Two measured ambiguities make "just read the switch" actively wrong: a bare `s_loop_*_in` edge is closed by every outlane drain **and by a made Ramp** (`DW-133`), and `s_lock_lane` closes on an under-powered shot that is never captured (`DW-166`).

**Approach:** Grow `src/sim/rules/devices.ts` into `src/sim/rules/devices/` — the AD-19 devices-and-shots layer, the only consumer of `SwitchEvent` — declare the three shots as ordered switch sequences in `TABLE.shots` with tick windows converted from new `…WindowMs` tunables, and emit the payload-complete device and shot events AD-19 names. Build the rules→physics coil channel the drop bank needs (it does not exist today), enforce the AD-19 import boundary with a new `tools/boundary-lint.mjs` rule and its own fixture, and test the whole layer headless in Node through a new `SwitchName`-typed switch-script DSL.

## Boundaries & Constraints

**Always:**

- **AD-19 is the governing decision.** `src/sim/rules/devices/` is the only place under `src/sim/rules/` that names `SwitchEvent`. Modes, scoring and the ball controller consume device and shot events, never a raw switch.
- **Shots are declared data, not code.** The sequence, its window tunable and its entry-exclusivity live in `TABLE.shots`; the layer contains no shot-specific branch and no shot-name literal.
- **A bare `s_loop_*_in` edge is never a Loop entry** (`DW-133`, measured: a made Ramp's `firstMakes` is `s_ramp_enter, s_ramp_made, s_loop_r_in, s_inlane_r`; every outlane drain also closes it). Only the ordered pair completing inside the window is a Loop.
- **`lock_lane_entered` must not fire for a non-capturing entry** (`DW-166`, measured capture threshold 550–600 mm/s on-axis at the corridor centreline). The fix is a discriminating condition on the event, never a geometry change.
- **The layer holds cross-tick state, so it is instantiated, not module-global.** One instance per `createLoop()`, mirroring `createMachine()`. `rules.step(state, switchEvents, tick)`'s three-argument signature (AD-4's own pin) is unchanged.
- **`GameState` gains nothing.** Bank letters, shot progress, spinner counts and lock bookkeeping are layer-local. Per-player letters and counts belong to `players[i]` and land in later stories (AD-7).
- Device names reach code only through `TABLE` (AD-11, AD-16, `pnpm lint:boundaries` rule (e) — the `shot_` prefix is on its banned-literal list). Millisecond literals and `TICK_HZ` exist only in `src/sim/table/tuning.ts` (AD-3, rule (d)).
- Every new authored file carries the GPL-3.0 header line 1 (AD-16); non-ASCII in source is written as an escape (Rule 14).
- Re-measure every baseline at this tree. Never carry a figure forward.

**Block If:**

- A `TABLE.shots` declaration, a new tunable or the layer's event vocabulary would require changing an AD's Rule (Rule 6) — HALT `intent gap`, naming the AD.
- The golden trace shows a **trajectory** change (any ball position differing before/after), not just a header change — that is a grant-bound re-record, not a header refresh. HALT and report rather than re-recording silently.
- `pnpm check:ad7` goes green, or its failure stops naming `DW-70` / `AD-7` / `bd_trough`.
- The measured `lock_lane_entered` capture latency cannot be established from a real driven shot — the window tunable must be measured, not guessed.

**Never:**

- **Never fix `DW-70`.** `pnpm check:ad7` exits 1 **by design** and Story 2.5 owns the fix; `test/ad7-device-slots.test.ts` passes by asserting that failure. A green `check:ad7` is a regression to revert and report.
- Never change geometry, `assets/src/dragonwar.blend`, or anything under `public/assets/`. `git diff --stat -- public/assets/` must be empty and `header.assetHash` must not move.
- Never emit `ball_will_start` / `ball_starting` / `ball_ended`, create players, or touch `phase` — Story 2.5 owns the ball lifecycle. This layer **consumes** `ball_will_start`; it does not produce it.
- Never emit `lane_lit` or write lane lit-flags / completed sets — that is the base mode's (AD-7, AD-19). Lane *change* behaviour itself is Story 2.7.
- Never pulse `c_mouth`, `c_trough_eject` or `c_autolaunch` — AD-18 gives those to the ball controller alone. This layer pulses `c_dragon_bank_reset` and nothing else.
- Never widen `FrameOutput.commands` to carry a `CoilCommand` — the spine's Seam Contracts table pins it to `(Lamp | Gi | Flasher | Show)Command[]`. The coil channel is a separate field.
- Never weaken, skip or delete an existing test; never relax an assertion in `test/shot-routing.test.ts` (the standing rule from `DW-119`).
- Never re-record a golden to make a suite green, and never touch `transitions`, `coilPrologue`, `durationTicks`, `expectedHash` or `expectedGameStateHash`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Loop made | `s_loop_l_in` closes at t, `s_loop_l_out` closes at t + `loopWindowTicks` − 1 | exactly one `shot_left_loop_made`; no `_broken` | No error expected |
| **DW-133 — made Ramp** | the measured made-Ramp make order `s_ramp_enter, s_ramp_made, s_loop_r_in, s_inlane_r` | exactly one `shot_ramp_made`, one `lane_entered { lane: 'inlane_r' }`; **zero `shot_right_loop_made` and zero `shot_right_loop_broken`** | No error expected |
| **DW-133 — outlane drain** | `s_loop_r_in` then `s_outlane_r` then `s_drain` | `lane_entered { lane: 'outlane_r' }` only; **zero `shot_right_loop_*`** | No error expected |
| Loop wrong direction | `s_loop_l_out` then `s_loop_l_in`, both inside the window | nothing emitted for `shot_left_loop` | No error expected |
| Ramp rejected | `s_ramp_enter` at t, `s_ramp_made` never | exactly one `shot_ramp_broken` on the tick the window expires; no `_made` | No error expected |
| Ramp window straddle | `s_ramp_made` at t + `rampWindowTicks` + 1 | `shot_ramp_broken` at expiry; the late `s_ramp_made` starts nothing | No error expected |
| Bank partial (**middle count**) | three non-adjacent letters close (`d`, `g`, `n`) | three `bank_target_down` with `letter` `d`/`g`/`n`; **no `bank_completed`, no coil command** | No error expected |
| Bank completed | the remaining three close | one `bank_target_down` each, then exactly one `bank_completed` and **exactly one** `c_dragon_bank_reset` pulse | Latched: a further tick with all six still down emits nothing more |
| Bank reset absorbed | the six `closed:false` edges physics emits on reset | letters cleared; no `bank_target_down`, no second `bank_completed` | No error expected |
| Ball will start | a `ball_will_start` event reaches the layer | exactly one `c_dragon_bank_reset` pulse, whatever the bank state | No error expected |
| **Integration (Rule 1)** | consumer `sim/loop`: real `createLoop`, six real strikes walk the bank down | at the completing tick the layer pulses; **on the next tick** `FrameOutput.contactEvents` carries exactly one `{ kind: 'bank_reset', device: 'c_dragon_bank_reset' }` and `snapshot.mechanisms.dropTargets` returns all six to `false` | Control: with `setCoilEnabled('c_dragon_bank_reset', false)` the six stay `true` and no `bank_reset` contact appears |
| Spinner | 3 make/break pairs on `s_spinner` in one tick | exactly one `spinner_spin { count: 3 }` — the count of `closed:true` edges, never of all edges | No error expected |
| Spinner idle | a tick with no `s_spinner` edge | no `spinner_spin` (never a `count: 0` event) | No error expected |
| **DW-166 — captured** | `s_lock_lane` closes, a `bd_lock` slot switch closes within `lockCaptureWindowTicks` | one `lock_lane_entered`, one `device_ball_entered { device: 'bd_lock', slot }` | No error expected |
| **DW-166 — not captured** | `s_lock_lane` closes, no slot switch inside the window, `bd_lock` not full | **nothing emitted** | No error expected |
| **DW-166 — device full** | `s_lock_lane` closes while all three `bd_lock` slots are closed | one `lock_lane_entered` immediately (physics parks nothing; the arbiter's spit case still needs the credit) | No error expected |
| Dragon body | `s_dragon_body` closes | one `dragon_hit` | No error expected |
| Lane entry | `s_top_2` closes | one `lane_entered { lane: 'top_2' }` | No error expected |
| Button | `s_start` closes, then opens | one `button_pressed { button: 's_start' }` on the close only | No error expected |
| Lane change | `s_flipper_r` closes | one `lane_change_pressed { side: 'right' }` **and** one `button_pressed { button: 's_flipper_r' }` | No error expected |
| Launch | `s_shooter_lane` opens | one `ball_launched` (unchanged from today) | Its close emits nothing |
| AD-19 boundary | a file under `src/sim/rules/` outside `devices/` imports `SwitchEvent` | `pnpm lint:boundaries` exits non-zero naming the rule and the file | The same import inside `src/sim/rules/devices/` does **not** fire |

</intent-contract>

## Code Map

**The layer and its seam**

- `src/sim/rules/devices.ts` (71 lines) — becomes the directory `src/sim/rules/devices/`. `processSwitchEvents()` at `:47-70` is the whole of today's layer: non-parking `entry` switch OPENING → `ball_launched`; parking slot switch edge → `device_ball_entered` / `_left`, device and slot resolved by scanning `TABLE.ballDevices`, never by a literal. Keep that resolution idiom verbatim and extend it.
- `src/sim/rules/index.ts:26-53` — `RulesStepResult` (`:26-31`, `commands: readonly never[]` at `:30`), `isBallLaunched` (`:33-39`, why `device_ball_entered/_left` never cross into `FrameOutput.events`), `step()` (`:46-53`). `:23` currently imports `SwitchEvent` — **this is the AD-19 violation the new lint rule will catch**; see Design Notes.
- `src/sim/rules/ball-controller.ts:19-43` — `applyDeviceEvents()`, `ballsInPlay` accounting with the floored-at-zero regression comment. Unchanged by this story except its import of the `DeviceEvent` union.
- `src/sim/loop/index.ts` — `:95-114` `BUTTON_SWITCH_BY_ACTION` derives the button-switch set from `TABLE.switches` where `settleClass === 'button'` (copy this derivation, do not hand-list); `:174-184` `initialMachineState`; `:219` `pendingCommands`; `:271-357` `advance()` — `:329-331` button edges, `:333-341` the previous tick's commands drained **before** rules run, `:342` `[...edges, ...machineResult.switchEvents]`, `:344` the rules call, `:352` `commands.push(...rulesResult.commands)` into the **presentation** array only; `:359-365` `pulseCoil` / `setCoilEnabled`; `:367` the returned `Loop` is exactly `{ advance, pulseCoil, setCoilEnabled }`.
- `src/sim/contracts/commands.ts:9-17` — `CoilAction`, `CoilCommand<TCoil>`. `src/sim/contracts/snapshot.ts:96-101,120` — `PresentationCommand` and `FrameOutput.commands`; **`CoilCommand` is deliberately not a member and must not become one.**
- `src/sim/contracts/events.ts:8-18` `SwitchEvent`; `:96-99` `BallWillStartEvent`; `:112-115` `BallLaunchedEvent`; `:165-174` the closed `SemanticEvent` union.
- `src/sim/table/names.ts:32-39` the name unions (`ShotName = keyof typeof TABLE.shots` at `:38` — today `never`); `:54-66` the bound seam aliases.

**Registry and tunables (the only legal home for names and numbers)**

- `src/sim/table/dragonwar.ts:136-193` `switches` with `settleClass`; `:198-215` `coils`; `:217-347` `ballDevices` (`bd_lock` at `:301-346`, capacity 3, slots `s_lock_1..3`); `:395-399` `popWiring`, `:413-420` `dropBankWiring` (D-R-A-G-O-N order, `{ switch, node }`), `:429` `dropBankResetCoil`, `:442-444` `spinnerWiring` — **the four existing wiring blocks are the shape every new one copies**; `:462-464` `flashers`/`shows`/`shots`, all `{}`.
- `src/sim/table/tuning.ts` — `:42-52` `TuningEntry<T>` / `entry()`; `:298-307` the canonical authored-`…Ms` declaration (`slamNudgeWindowMs`, source prose "authored: FR-16 states the mechanism but no window duration", confidence `unverified`) — copy this shape; `:587-602` `ResolvedTuning` / `TuningMsKey` / `MsToTicksKey`; `:604-627` `msToTicks()`; `:662-680` `assertNoNestedMsKeys()` — **throws on any `…Ms` key below the top level (`DW-34`), so the new window tunables must be top-level scalars, not inside `hardware`**; `:682-715` `resolveTuning(tuning = TUNING, tickHz = TICK_HZ)` — the override seam tests use without perturbing a golden hash.

**Physics surfaces this layer consumes (read-only — do not reopen)**

- `src/sim/physics/switches.ts:62-78` `deviceModuleOwnedSwitches()` — the AD-2 carve-out. 14 switches are excluded from the tracker and owned end to end by their device module: `s_trough_1..4`, `s_lock_1..3` (parking slots), the six `s_dragon_*` (`dropBankWiring`), `s_spinner` (`spinnerWiring`). **Trap:** `s_dragon_*` still declare `settleClass: 'drop_target'` (20 ms) in the registry and nothing reads it any more.
- `src/sim/physics/drop-targets.ts:310-334` `applyPreStepReset()` — runs **pre-step**; `:326-329` emits `closed:false` **only for letters that were down** (zero down → zero edges); `:331` emits one `ContactEvent { kind: 'bank_reset', device: 'c_dragon_bank_reset' }` **unconditionally, outside the per-letter loop** — this is the Integration AC's observable. `:336-369` `applyPostStep()` — a `closed:true` edge only on a genuine resolved collision. `:373-381` the `dropTargets` getter, always all six keys, keyed by switch name.
- `src/sim/physics/spinner.ts:151-205` `applyPostStep()` — `:192-197` pushes **one `closed:true` + one `closed:false` on the same tick, per completed revolution**, in a `while` loop, so one tick may carry several pairs.
- `src/sim/physics/devices.ts:607-621` `detectEntries()` — `:614-617` a slot beyond capacity produces a `device_overflow` **failure** (routed to `FrameOutput.events` via `machine.ts:462`), **no slot write and no switch edge**; `:620-621` a real park writes the slot and pushes the slot switch's `closed:true`.
- `src/sim/physics/machine.ts:247-264` `coilEnabled` defaults (`c_dragon_bank_reset: true` at `:262`); `:318` the `DW-74` enabled-pulse filter; `:416-430` the **hand-picked, golden-hashed** `switchEvents` return order — the bank's pre-step reset edges appear **after** the tracker's, not in chronological order.
- `src/sim/contracts/snapshot.ts:50-55,76` `DropTargetMechanismState = Readonly<Record<string, boolean>>` on `MechanismsSnapshot`.

**Lint, tests and goldens**

- `tools/boundary-lint.mjs` — `:89` `TEXTUAL_SCAN_EXTENSION_PATTERN`, `:139-158` `listFilesRecursive`/`toPosix`, `:189-346` `tokenize()` (fails closed on an unterminated span), `:349-362` `maskForCodeOnly()`, `:393-422` the suppression mechanism, `:429-451` `checkBannedGlobals()` — **the exact shape a new textual rule copies**, `:507-536` `checkDeviceNameLiterals()` (path exemption by exact string equality), `:710-715` where a new check is wired into `textualViolations`, `:720-723` `formatViolation`, `:760` exit 2 for import-graph violations / 1 for textual.
- `tools/dependency-cruiser.config.mjs:105-199` — eight `forbidden` rules; `path`/`pathNot` are regex source strings over posix, cwd-relative, extension-included module paths. `tsPreCompilationDeps: false` + `parser: 'swc'` (`:84-94`) mean an `import type` edge is reported identically to a value import, so a module-graph rule cannot see `SwitchEvent`.
- `test/boundary-lint.test.ts:16-39` — `run(args)` spawns the real tool; each late-added rule got its **own sibling fixture root** plus a dedicated `describe` (see the `table-reaches-physics` block at `:223-230`). `test/fixtures/boundary/` has **no `src/sim/rules/` path today**.
- `test/rules-devices.test.ts` — `:23-48` local `machine()`/`state()` factories, `:50-51` the `edge()` helper whose `as SwitchEvent` cast **erases `SwitchName` typing** (the DSL replaces it), `:132-145` the `commands` assertion whose comment says the channel *cannot* carry anything.
- `test/util/` — the six existing helpers; conventions: GPL-3.0 header line 1, a provenance block naming the story, kebab-case, no `.test.` infix, named exports, imported as `./util/<name>`.
- `test/replays/*.golden.json` (five) — shared `tableHash: "ba1541bd"`, `assetHash: "ab163ff"`. `src/sim/loop/replay.ts:109-116` `stateHash` = `{ game, quantized balls }`, `:127-129` `gameStateHash` = `game` only, `:139-141` `tableHash()` = the **whole** `TABLE`, `:240-247` the `header.gameStart.tuning` string comparison against live `resolveTuning()`. Events are **never** hashed (`:356,:368,:375-381`). `test/replay-goldens.test.ts:140-144` — every golden's `notes` must still contain `DW-70` and `deviceSlots`.
- `test/fixtures/dw70-ad7/ad7-device-slots.harness.ts:49` — `import { step as rulesStep } from '../../../src/sim/rules';`. **Not typechecked** (`tsconfig.node.json:31` excludes `test/fixtures/**`), so a stale import here silently changes the failure reason. `test/ad7-device-slots.test.ts` is the in-suite wrapper.
- Other importers of `sim/rules`: `test/machine-serve-drain.test.ts:25`. Prose that goes stale when the coil channel lands: `test/flipper-mover.test.ts:69-73,123-127`, `test/replay-goldens.test.ts:23`.
- `test/drop-targets.test.ts:183-207` — the loop-level precedent: deep-copy the collision doc, rewrite `bd_trough.ejectPose`, override `troughEjectSpeedMmPerS`, then `pulseCoil` + `advance`. Collision-doc field names are `ejectPose.posMm` and `ejectPose.dir` (**`dir` is not normalised** — `devices.ts:147-149,457` multiplies componentwise).
- `test/hardware-rule-seam.test.ts:183-213`, `test/module-coverage.test.ts`, `test/switch-zones.test.ts` — structural gates a new module must satisfy.

## Tasks & Acceptance

**Execution:**

1. `src/sim/table/tuning.ts` — add three **top-level** scalar tunables beside `slamNudgeWindowMs`, each declared with `entry(value, source, 'unverified')` in that function's existing house shape: `loopWindowMs`, `rampWindowMs`, `lockCaptureWindowMs`. **No artifact states any of the three** (PRD FR-26/FR-27 state the shot, AD-19/AR-19 state the mechanism, neither states a duration; `rampWindowMs` and `lockCaptureWindowMs` are not named anywhere at all), so **each value is derived from a measurement taken at this tree, never guessed**, and each `source` string states the measurement, the drive that produced it, the margin applied, and that no artifact states the figure:
   - `loopWindowMs` — drive a real Loop shot and measure the tick interval from the `s_loop_*_in` close to the `s_loop_*_out` close; set the window above the slowest such interval with a stated margin.
   - `rampWindowMs` — same, from `s_ramp_enter` to `s_ramp_made` on a made Ramp.
   - `lockCaptureWindowMs` — same, from the `s_lock_lane` close to the `bd_lock` slot-switch close on a capturing shot (task 10 drives one at ~800 mm/s).

   Also export a typed helper from this file (the only AD-3-exempt one) that resolves a shot's `…Ms` key to its derived `…Ticks` entry, so no file under `src/sim/rules/**` does ms→tick arithmetic or names `TICK_HZ`. *Rationale: AD-3 + `assertNoNestedMsKeys()` (`DW-34`) forbid a nested or rules-side millisecond; a window guessed rather than measured is the shape that produces an untestable threshold.*

2. `src/sim/table/dragonwar.ts` — declare `shots` and four new wiring blocks, each in the `popWiring`/`dropBankWiring` shape with a comment naming its consumer. `shots`: `shot_left_loop = { sequence: ['s_loop_l_in','s_loop_l_out'], windowMs: 'loopWindowMs', entryExclusive: false }`, `shot_right_loop` likewise on the `r` switches, `shot_ramp = { sequence: ['s_ramp_enter','s_ramp_made'], windowMs: 'rampWindowMs', entryExclusive: true }`. `entryExclusive` records the measured geometric fact `DW-133` reports and carries its evidence in the comment. Then `laneWiring` (lane id → switch, covering `s_top_1..3`, `s_inlane_l/r`, `s_outlane_l/r`), `dragonBodyWiring` (`{ switch: 's_dragon_body' }`), `lockLaneWiring` (`{ switch: 's_lock_lane', device: 'bd_lock' }`), `flipperButtonWiring` (`{ left: { switch: 's_flipper_l' }, right: { switch: 's_flipper_r' } }`). *Rationale: AD-11 — `TABLE` owns wiring; AD-16 bans these literals anywhere else.*

3. `src/sim/contracts/commands.ts`, `src/sim/rules/index.ts`, `src/sim/loop/index.ts` — build the rules→physics coil channel. Add a **separate** `coilCommands: readonly CoilCommand[]` to `RulesStepResult` (leave `commands: readonly never[]` alone — `FrameOutput.commands` stays presentation-only per the spine's Seam Contracts table) and have `advance()` push them into `pendingCommands` so they apply on the **next** tick, exactly as `pulseCoil()` does. *Rationale: AD-9 sanctions the command; AD-4's "commands next tick" fixes when it lands. This channel does not exist today and AC 4 cannot be met without it.*

4. `src/sim/rules/devices/` — replace `src/sim/rules/devices.ts` with the directory: an `index.ts` exposing `createDevicesLayer()` (the layer instance and its per-tick step), the event union, a shots component and a drop-bank component. Extend the event union with `shot_<name>_made` / `_broken`, `bank_target_down { letter }`, `bank_completed`, `dragon_hit`, `lock_lane_entered`, `spinner_spin { count }`, `lane_entered { lane }`, `lane_change_pressed { side }`, `button_pressed { button }`, keeping `ball_launched`, `device_ball_entered`, `device_ball_left`. Every subject set is derived from `TABLE` (`DW-149`: never a second hand-typed list). The layer's per-tick step takes the tick's switch edges **and** the rules-internal lifecycle events it reacts to, so `ball_will_start` has a declared input channel: `sim/rules`'s `step()` passes an empty lifecycle list in this story (nothing produces `ball_will_start` until Story 2.5 wires the ball controller in), and the headless AC 4 test drives the layer's own entry point directly. *Rationale: AD-19 names the directory, the ownership and the vocabulary, and requires the drop bank to pulse the reset on `ball_will_start`.*

5. `src/sim/rules/index.ts` — export `createRules()` returning `{ step }`; `createLoop()` owns one instance. `step`'s three-argument signature is unchanged (AD-4's pin); only its provenance moves from a module function to an instance, because the layer now holds cross-tick state (in-flight sequences, letters down, the bank latch, `bd_lock` occupancy, the pending lock-lane closure) and a module-global would leak between two loops in one process — the exact defect Story 2.3's spinner hit. Ensure this file no longer names `SwitchEvent` (derive the parameter type from the devices layer's own exported signature). *Rationale: AD-19's boundary, and determinism.*

6. `tools/boundary-lint.mjs` — add textual check (g), `rules-no-switch-event-outside-devices`: over `src/sim/rules/**`, excluding `src/sim/rules/devices/**`, on comment- and string-masked code, flag an `import`/`export` statement whose binding list names `SwitchEvent`. Wire it into `textualViolations` at `:710-715` (exit 1, the textual code). *Rationale: AC 1. A dependency-cruiser module rule cannot express this — see Design Notes.*

7. `test/fixtures/boundary/switch-event-leak/` + `test/boundary-lint.test.ts` — a new sibling fixture root containing a real `src/sim/table/names.ts` companion, a violating `src/sim/rules/leaks-switch-event.ts` and a **legitimate** `src/sim/rules/devices/index.ts` that imports it, plus a `describe` block asserting exit 1, the rule tag and the violating path in stderr, and `not.toContain` the devices path. *Rationale: the rule must be proved to fire and proved not to over-fire.*

8. `test/util/switch-script.ts` — the switch-script DSL, `SwitchName`-typed: `close('s_loop_l_in').at(100).open().at(120)…` building a tick-ordered `readonly SwitchEvent[]`, plus a runner that drives a devices-layer instance tick by tick and collects the events it emits. GPL-3.0 header line 1, provenance block naming Story 2.4, named exports. *Rationale: AC 9 and AD-15 ("Rules are tested headless in Vitest via a switch-script DSL typed by `SwitchName`"). Nothing like it exists today.*

9. `test/rules-devices.test.ts` — rewrite onto the DSL, deleting the `as SwitchEvent` cast at `:50-51`, and add the scripted test per event and per I/O-matrix row (every DW-133, DW-166, window-straddle, middle-count and spinner row above). Correct the now-false prose at `:132-145`. No physics, no rendering. *Rationale: AC 9; Rule 19.*

10. `test/rules-devices-integration.test.ts` (new) — the loop-level Integration AC and the physics-level `DW-166` closure. Loop half: deep-copy the collision doc, set `bd_trough.ejectPose` to `{ posMm: { x: 200, y: 690, z: 13.5 }, dir: { x: 1, y: 0.15, z: 0 } }` and `troughEjectSpeedMmPerS` to 1600, then repeat `pulseCoil('c_trough_eject')` + ~700 ms of `advance(50, [])` until all six letters read `true` (cap the loop at 12 shots), asserting the middle count on the way and the reset on the tick after completion. `DW-166` half: drive a real ball up the Lock lane at ~575 mm/s and at ~800 mm/s from (170, 440) at the `machine.step()` level, feed each run's switch edges into a devices-layer instance, and assert the first emits no `lock_lane_entered` while the second does. *Rationale: Rule 1; DW-166's honest closure.*

11. `test/fixtures/dw70-ad7/ad7-device-slots.harness.ts:49`, `test/machine-serve-drain.test.ts:25` — update to `createRules()`. The harness is **not typechecked**, so run `pnpm check:ad7` directly and confirm it still exits 1 with the assertion content, not a collection error. *Rationale: the deliberate red must stay red for its own reason.*

12. `test/replays/*.golden.json` (five) — one **header-only** re-record: `header.tableHash` (TABLE gains `shots` + four wiring blocks) and `header.gameStart.tuning` (three new `…Ms` plus their three derived `…Ticks`) only. Trace before recording per the Story 2.3 procedure; append to each `notes`, never rewrite, keeping the `DW-70` and `deviceSlots` literals. *Rationale: AD-15's 2026-09-05 amendment — the serialized tuning output, `source` prose included, is hashed.*

13. `test/flipper-mover.test.ts:69-73,123-127`, `test/replay-goldens.test.ts:23` — correct the prose that says the rules layer cannot issue a coil command. *Rationale: a comment that is now false is a review finding.*

**Acceptance Criteria:**

- **AC 1 (AD-19 boundary).** Given a file under `src/sim/rules/` outside `src/sim/rules/devices/` that imports `SwitchEvent`, when `pnpm lint:boundaries` runs, then it exits non-zero and names `rules-no-switch-event-outside-devices` and that file — while the identical import inside `src/sim/rules/devices/` produces no violation, both proved against `test/fixtures/boundary/switch-event-leak/` in the same test, and `pnpm lint:boundaries` exits 0 over the real tree.
- **AC 2 (shots).** Given `TABLE.shots` declares the three sequences with their window tunables, when the switches close in order inside the window, then `shot_<name>_made` is emitted exactly once; when `shot_ramp`'s window expires with only `s_ramp_enter` closed, then `shot_ramp_broken` is emitted once and no `_made` — with the in-window case at `rampWindowTicks` − 1 and the expiry case at `rampWindowTicks` + 1 asserted in the same test so the threshold is straddled; and when a Loop's switches close `_out` then `_in`, then nothing is emitted for that shot, proved in a test that also drives the correct direction and observes `shot_<name>_made`.
- **AC 3 (DW-133).** Given the measured made-Ramp make order `s_ramp_enter, s_ramp_made, s_loop_r_in, s_inlane_r`, and given an outlane drain closing `s_loop_r_in` then `s_outlane_r` then `s_drain`, when either is driven through the layer, then exactly zero `shot_right_loop_made` **and zero `shot_right_loop_broken`** are emitted, while the same test drives a genuine `s_loop_r_in` → `s_loop_r_out` pair and observes exactly one `shot_right_loop_made`.
- **AC 4 (drop bank).** Given three non-adjacent letters down, when the layer processes them, then three `bank_target_down` with their own `letter` are emitted and no `bank_completed` and no coil command; given the remaining three then close, then exactly one `bank_completed` and exactly one `c_dragon_bank_reset` pulse are emitted, and a further tick with all six still down emits neither again; and given a `ball_will_start` event, then exactly one `c_dragon_bank_reset` pulse is emitted whatever the bank state.
- **AC 5 (Integration — consumer `sim/loop`).** Given a real `createLoop({ collisionDoc, tuning })` with `bd_trough.ejectPose` moved west of the bank and six successive trough ejects walking the six letters down, when `advance()` runs, then on the tick after `snapshot.mechanisms.dropTargets` first reads all six `true`, `FrameOutput.contactEvents` contains exactly one `{ type: 'contact', kind: 'bank_reset', device: 'c_dragon_bank_reset' }` and `snapshot.mechanisms.dropTargets` returns all six to `false`; and given the identical run with `setCoilEnabled('c_dragon_bank_reset', false)` first, then no `bank_reset` contact appears and the six stay `true`.
- **AC 6 (DW-166).** Given a real ball driven on-axis up the Lock lane from (170, 440) at ~575 mm/s, whose edges are fed to a devices-layer instance, when the run completes, then no `lock_lane_entered` is emitted; given the same drive at ~800 mm/s, then exactly one `lock_lane_entered` is emitted and a `bd_lock` slot closes; and given a scripted `s_lock_lane` closure while all three `bd_lock` slots are already closed, then exactly one `lock_lane_entered` is emitted immediately.
- **AC 7 (event set).** Given switch edges from the Dragon body, the spinner, the Top lanes, the inlane/outlane set, the shooter lane and the cabinet buttons, when they arrive, then `dragon_hit`, `spinner_spin { count }`, `lane_entered { lane }`, `lane_change_pressed { side }`, `ball_launched`, `device_ball_entered { device, slot }`, `device_ball_left { device, slot }` and `button_pressed { button }` are emitted payload-complete.
- **AC 8 (spinner count).** Given three `s_spinner` make/break pairs arriving in a single tick, when the layer processes that tick, then exactly one `spinner_spin { count: 3 }` is emitted — the count of `closed:true` edges, not of all edges and not one event per closure; and given a tick with no `s_spinner` edge, then no `spinner_spin` is emitted at all.
- **AC 9 (headless).** Given the switch-script DSL typed by `SwitchName`, when `npx vitest run test/rules-devices.test.ts` runs, then every event above has at least one scripted test, no physics or rendering module is imported by that file, and the file's tests complete in under two seconds.
- **AC 10 (no regression).** Given the change is complete, when the gates run, then `pnpm test` is green with a recorded file/test/skip count, `pnpm typecheck` exits 0, `pnpm check:corridor` and `pnpm check:reachability` exit 0 with their case/reachable/unreachable/release counts re-measured, `git diff --stat -- public/assets/` is empty, the five goldens differ only in `header.tableHash`, `header.gameStart.tuning` and appended `notes`, and **`pnpm check:ad7` still exits 1 naming `DW-70`, `AD-7` and `bd_trough`**.

## Spec Change Log

- **2026-09-05, lead spec gate — `epics.md` AC 1 amended (Rule 5 tier-1), so the spec no longer stands alone on this.**
  The spec argued in Design Notes that the textual gate satisfies the AC's "when dependency-cruiser runs" without an
  amendment. I verified the reasoning and it holds — and it holds *more* strongly than the spec claimed: `tools/boundary-lint.mjs`
  check **(a) actually runs dependency-cruiser**, and its checks **(c)-(f) are already textual** for exactly this reason
  ("(a) and (b) need a real import graph, which only dependency-cruiser ... (c)-(f) are a hand-rolled textual pass instead").
  I confirmed `parser: 'swc'` and `tsPreCompilationDeps: false` in `tools/dependency-cruiser.config.mjs`, and confirmed
  `SwitchEvent` is re-exported from `src/sim/table/names.ts:54` and imported at `src/sim/rules/index.ts:23`.
  **But leaving the AC unamended would have left a trap**: a later story's plan stage reads `epics.md`, not this spec's
  Design Notes, and would look for a dependency-cruiser module rule — finding none, it would either file a false defect or
  "fix" it by adding the broken module rule that fires on innocent files. The AC now names the gate accurately and carries
  the measurement. **The promise is unchanged** and no task, AC or mutation in this spec changes as a result.

## Review Triage Log

### 2026-09-05 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5 (high 0, medium 3, low 2)
- defer: 2 (high 0, medium 1, low 1)
- reject: 6 (high 0, medium 0, low 6)
- addressed_findings:
  - `[medium]` `[patch]` `src/sim/rules/devices/shots.ts` silently ignored a repeated close of a shot's own entry switch while an attempt was already in flight (a ball re-entering the mouth without completing the shot), leaving the ORIGINAL, now-stale `startTick` as the window anchor — a genuinely timely completion measured from the real, later entry could be judged already-expired. Fixed: a repeated entry-switch closure now (re)starts the window from that touch. Added `test/rules-devices.test.ts` "re-entry restarts the window" — personally confirmed it reddens against the original code (a spurious `shot_ramp_broken` masking a real, later `shot_ramp_made`) and passes after the fix.
  - `[medium]` `[patch]` `test/util/switch-script.ts`'s `runSwitchScript()` silently dropped any scripted switch or lifecycle edge whose tick fell outside `[1, durationTicks]`, with no diagnostic — a future test author mis-sizing `durationTicks` would get a false pass or fail with no signal. Fixed: it now throws, naming the offending switch/event, tick and valid range. Verified no existing test relied on the silent-drop behavior (full suite re-run green, same 96 files).
  - `[medium]` `[patch]` DW-166's Lock-lane capture window (`src/sim/rules/devices/index.ts`) had no boundary-straddle test analogous to AC 2's own Ramp straddle — the existing "captured" test drives the slot closure at the window's midpoint and "not captured" never drives a slot closure at all, so an off-by-one in the window comparison would not have been caught. Added a straddle test (exact-boundary tick credited; boundary+1 not credited, though the ball still physically parks and `device_ball_entered` still fires). Personally applied the analogous off-by-one mutation to `index.ts`'s window comparison, confirmed the new test reddens naming the missing credit, then reverted.
  - `[low]` `[patch]` `test/rules-devices.test.ts`'s `expect(result.commands).toEqual([])` (the coilCommands-channel test) was a type-level tautology (`commands` is `readonly never[]`) with no disclaimer, unlike the pre-existing precedent elsewhere in the same file. Added the same disclaimer wording used at that precedent.
  - `[low]` `[patch]` (Rule 19 coverage) Of the 10 ACs' named mutations, only 4 (AC 1, AC 2, AC 4b, AC 10) had been independently re-applied and watched red by build-auto itself before this review pass; the rest rested solely on the implementation subagent's own self-report. Personally applied and watched red two more during this pass: **AC 3** (`shot_right_loop.entryExclusive` flipped to `true` — both the made-Ramp and outlane-drain DW-133 cases reddened naming the spurious `shot_right_loop_broken`, while the genuine `_in`→`_out` case in the same test stayed green) and **AC 8** (counting all spinner edges instead of only `closed:true` — reddened naming `count: 6` against the expected `3`). AC 1's second direction, AC 5, AC 6 and AC 7 and AC 9 remain backed only by the subagent's self-report; code inspection found no defect in any of their implementations, but the independently-observed red-then-green record Rule 19 asks for is still incomplete for those five — recorded honestly rather than closed prematurely.

Findings routed to `deferred:` (frontmatter): the boundary-lint textual check's bypassable-but-uncommon import forms (medium — see `deferred:` for the two confirmed bypass shapes and why closing them fully is out of this story's effort budget), and `pendingLockLaneClosure`'s single-outstanding-closure limitation (low — unreachable until multiball ships; no story has wired up multiball yet).

Findings rejected as noise or theoretical (silently dropped per the classify step, summarized here for the record): a same-tick Lock-lane Stage-1/Stage-2 ordering artifact and a same-tick `s_lock_lane` double-edge dedup gap (both provably unreachable from real physics — the measured 134+-tick capture latency and the switch-edge-detection invariant that a switch cannot emit two consecutive `closed:true` edges without an intervening `closed:false` rule both scenarios out); an uncapped `c_dragon_bank_reset` pulse per `ball_will_start` event (unreachable in this story's own delivered code path — `lifecycleEvents` is hardcoded to `[]` in `sim/rules/index.ts` until Story 2.5 wires up a producer); the drop bank's latch-clearing "trusting" bank-reset atomicity (on inspection, the code only requires "at least one" `closed:false` edge to re-arm the latch, which is already how the header comment describes it and is safe regardless of reset ordering); `shotWindowTicks()`'s lack of a finiteness check (theoretical — the three window tunables are static, compile-time-checked `number` literals authored in `tuning.ts`, with no runtime-derived path to `NaN`/`Infinity`); and the intent-alignment auditor's two descriptive divergence points (both explicitly sanctioned by the intent-contract's own Never/Boundaries clauses — `ball_will_start` reachability and the new event vocabulary's reach are both deliberate, in-scope deferrals to Story 2.5 and later consumers, not defects).

## Design Notes

**Governing architecture decisions (Rule 6):** **AD-19** (the layer, its ownership and its exact event vocabulary) is primary. Also binding: **AD-2** (switch edges, one source per class, and the device-ownership carve-out that makes `s_dragon_*` / `s_spinner` device-owned end to end), **AD-3** (one clock; `…Ms` authored, `…Ticks` after load; no millisecond literal or `TICK_HZ` outside `tuning.ts`), **AD-4** (`rules.step(state, switchEvents, tick)` after every physics step; **commands issued at tick *N* are consumed by physics at *N+1***), **AD-6** (the shooter lane's opening is the one event that means "plunged"; device counts are closed slot switches and nothing else; a slot beyond capacity is answered by rules), **AD-7** (`GameState` scopes — lane lit-flags and per-player letters are the base mode's, not this layer's), **AD-9** (`CoilCommand` is the rules→physics command; every semantic event is payload-complete; `FrameOutput.commands` is presentation-only), **AD-11** (`TABLE` owns wiring), **AD-15** (tunables carry `source` + `confidence`, and those strings are hashed into every golden header), **AD-16** (the three-gate boundary regime), **AD-18** (the Lock arbiter, in the ball controller, is the only consumer of `lock_lane_entered` and alone pulses `c_mouth`).

**Consumed-by** (Rule 2) — every one of these consumes device and shot events, never a raw switch:

- Story 2.5 (Start, Hot seat, ball lifecycle) — `ball_launched`, `button_pressed { button: 's_start' }`, `device_ball_entered/_left`; and it becomes the producer of the `ball_will_start` this layer already consumes.
- Story 2.7 (Plunge, Skill shot, lane change) — `lane_entered { lane }`, `lane_change_pressed { side }`, `ball_launched`.
- Stories 2.9 (ball save), 2.10 (bonus), 2.11 (tilt), 2.12 (ball search), 2.13 (Match) — device events for arming, scoring categories, disabling and recovery.
- Story 3.1 (mode stack) and every Epic 3 mode — `shot_left_loop_made` / `shot_right_loop_made` (Joust's alternation, FR-36), `shot_ramp_made` (Hurry-up's collect, FR-34; the Modes qualifier, FR-27), `bank_target_down { letter }` / `bank_completed` (FR-28), `spinner_spin { count }` (FR-26 awards per rotation), `dragon_hit` (War Strikes, FR-39).
- Story 3.2 (the Lock arbiter, AD-18) — `lock_lane_entered`, and it is the only consumer of it.

**Consumes** (Rule 2): `TABLE` (switches, coils, ball devices, the new `shots` and wiring blocks); `resolveTuning()`'s derived `…Ticks` entries; `SwitchEvent`s produced by `sim/physics` (playfield and cabinet mechanisms) and by `sim/loop` (the four button switches from `InputFrame` transitions); the `ball_will_start` semantic event (no producer until Story 2.5). Its Integration AC exercises a **real** `createLoop` with real physics — never a mock.

**Why the AD-19 gate is textual, not a dependency-cruiser rule.** The AC says "when dependency-cruiser runs"; `pnpm lint:boundaries` is the command that runs it, and AD-16's own Rule puts the textual device-name-literal check in the same breath as "dependency-cruiser runs in CI", so the boundary gate as a whole is what the AC names. A module-graph rule genuinely cannot express this: `SwitchEvent` is re-exported from `src/sim/table/names.ts` alongside `GameState`, `SemanticEvent` and `MachineState`, which `src/sim/rules/index.ts` and `src/sim/rules/ball-controller.ts` legitimately need, and dependency-cruiser 18.2.0 collapses them to one `["local","import"]` edge — verified: with `parser: 'swc'` and `tsPreCompilationDeps: false` (pinned off because AD-16 forbids a compiler-API lint) even an `import type` edge is indistinguishable from a value import. So the rule would fire on two innocent files and still could not see a real leak. The textual check reads the identifier, which is the actual claim.

**`src/sim/rules/index.ts` must stop naming `SwitchEvent`.** It does today (`:23`), purely to type `step()`'s parameter — it never reads `.switch` or `.closed`. Rather than exempt it (this epic's guide-termination gate proved an unverified exemption is how a gate quietly stops asserting anything), derive the parameter type from the devices layer's own exported signature, so the rules tree depends on the layer's declared input contract instead of the raw switch vocabulary. That is AD-19's intent stated in types.

**DW-133 — addressed** (Rule 17). Sequence detection alone is not enough. A bare `s_loop_*_in` is closed by every outlane drain and by a made Ramp, so a naive implementation that starts a sequence on the first switch and emits `_broken` on expiry would emit `shot_right_loop_broken` on both — which *is* treating the bare edge as a Loop entry, the very thing the routed entry forbids. The same defect breaks the AC's own "wrong direction emits nothing" clause, since `_out` then `_in` also leaves a bare `_in` to expire. The resolution is data, not code: `TABLE.shots[*].entryExclusive` records whether anything but this shot closes the sequence's first switch — `false` for both Loops (measured), `true` for the Ramp (`s_ramp_enter` is closed by nothing else). A sequence with `entryExclusive: false` is tracked to completion but never emits `_broken`. `shot_ramp_broken` therefore stays a real, falsifiable event (a rejected Ramp is exactly what it is for), and the epics.md AC's `_broken` clause and its routed DW-133 bullet are both satisfied without an amendment. Addressed by task 2 and AC 3.

**DW-166 — addressed** (Rule 17). The routed entry names two options and rules out a third: a discriminating condition on the event, or an arbiter that tolerates a non-capturing entry — never a geometry change (it would undo the wedge fix Story 2.1c's bevel reversal exists for). The arbiter lives in the ball controller and does not exist until Story 3.2, so the discriminating condition is the only option inside this story, and it belongs here anyway: this layer owns `bd_lock`'s slot bookkeeping, which is what makes the condition expressible. `lock_lane_entered` is emitted only when the lane closure **resolves** — either a `bd_lock` slot switch closes within `lockCaptureWindowTicks` (a real capture), or the layer's own slot bookkeeping already shows all three slots closed at the moment of the lane closure (physics parks nothing and emits no slot switch, so waiting would be a false negative, and AD-18's `lock_lane_spit` still needs the credit). An unresolved closure emits nothing. The measured 550–600 mm/s non-capturing band therefore produces silence, and AD-18's arbiter keeps its single-consumer contract unchanged. Addressed by tasks 1, 4 and 10 and AC 6.

**Where the layer's state lives.** Not in `GameState`: AD-7 enumerates the machine scope (device slots, `ballsInPlay`, `hardwareEnabled`, `ballSave`, `tilt`, `multiball`, `highscores`) and shot progress is not in it, and adding it would move `expectedGameStateHash` and `expectedHash` on all five goldens for bookkeeping that is not replay state. Not module-global either — two loops in one process would share it, the exact defect Story 2.3's spinner hit with a module-level `occupied` boolean. So the layer is instantiated per loop, `createRules()` mirrors `createMachine()`, and `step`'s AD-4-pinned three-argument signature is untouched. Replays start from tick 0 with `GameStart`, so the layer's state rebuilds deterministically.

**Device events stay rules-internal.** Only `ball_launched` crosses into `FrameOutput.events`, exactly as today (`src/sim/rules/index.ts:33-39`). `SemanticEvent` is the closed rules→presentation union (AD-9); the device and shot events are the rules-internal vocabulary modes consume (AD-19, AD-8). Widening `SemanticEvent` is for the story that has a presentation consumer — no artifact names one for these events in Epic 2, and inventing presentation payloads now would be guessing. This also keeps the golden risk profile at header-only.

**`ramp_made` and `shot_ramp_made` are the same event.** AD-19's list names both `shot_<name>_made` and `ramp_made`; the epics.md AC declares `shot_ramp = [s_ramp_enter, s_ramp_made]` as one of the three shots and its own event list omits `ramp_made`. Emitting `shot_ramp_made` satisfies both readings; a second, separately-named event for the same occurrence would give presentation and modes two truths for one shot, which is what AD-19 exists to prevent. Recorded here so a reviewer can challenge the reading rather than discover it.

**`multiple-goals` is deliberately not flagged.** The sub-deliverables (the boundary rule, the shots, the drop bank, the lane and button events, the coil channel, the DSL) are the parts of one AD-19 component whose whole point is that "what a Loop is" is defined once; splitting them would ship a layer that some modes bypass.

**The two traps this codebase has already sprung.** `toPhysics()` negates y (AD-10) — the AC 6 Lock-lane drives and the AC 5 eject pose are stated in **table-frame millimetres**; convert once, at the boundary, and never compare a physics-frame vector against a table-frame offset. And every baseline in this spec's Verification section must be re-measured at the implementer's own tree: Story 2.2 needed three separate corrections for reusing a carried-forward count.

**Standing reds and greens.** `pnpm check:ad7` exits **1 by design** — `DW-70` is routed to Story 2.5 and `test/ad7-device-slots.test.ts` passes by asserting that failure names `DW-70`, `AD-7` and `bd_trough`. This story touches the harness's import (task 11) and nothing else about it; a green `check:ad7` is a regression to revert and report. `pnpm check:corridor` is intended **green** (`DW-137`, closed by 2.1f) and has no intended-red wrapper.

## Verification

**Commands** (re-measure every number at your own tree; the figures below are the recorded baseline, and `check:reachability` / `check:corridor` / `check:ad7` were **not** re-run at plan time):

- `pnpm test` — expected green. Recorded baseline measured at this tree on 2026-09-05: **95 files / 1521 tests / 1498 passed / 23 skipped / 0 failed**, ~45 s. Report the actual counts and explain any movement; no test deleted, skipped or weakened.
- `pnpm typecheck` — expected exit 0 (recorded baseline: exit 0, no output).
- `pnpm lint:boundaries` — expected exit 0 over the real tree (recorded baseline: exit 0, "87 .ts file(s) under src/ cruised"). The new rule's red is proved only against the fixture root.
- `npx vitest run test/boundary-lint.test.ts test/rules-devices.test.ts test/rules-devices-integration.test.ts test/replay-goldens.test.ts test/drop-targets.test.ts test/spinner.test.ts test/lock-device-behaviour.test.ts test/machine-serve-drain.test.ts test/module-coverage.test.ts test/hardware-rule-seam.test.ts` — expected green.
- `pnpm check:ad7` — expected **exit 1**, output containing `DW-70`, `AD-7`, `bd_trough`, and failing on the assertion rather than on module collection. A green run is a regression.
- `pnpm check:corridor` — expected exit 0. `pnpm check:reachability` — expected exit 0; re-measure cases / reachable / unreachable / releases against the recorded **52 / 32 / 20 / 644** and explain every moved verdict. Never edit an `unreachable` verdict.
- `pnpm check:headers` and `pnpm check:attributions` — expected exit 0 each. Both read `git ls-files`, so `git add` the new files first, then unstage. No third-party file enters, so no `ATTRIBUTIONS.md` row is owed.
- `pnpm build && pnpm check:dist && pnpm check:size` — expected exit 0 each (AD-17).
- `git diff --stat -- public/assets/` — expected **empty**. `git diff --stat -- assets/src/` — expected **empty**.
- `git diff -- test/replays/` — expected to touch only `header.tableHash`, `header.gameStart.tuning` and appended `notes` on all five; `header.assetHash`, `transitions`, `coilPrologue`, `durationTicks`, `expectedHash` and `expectedGameStateHash` byte-identical. Trace before recording: replay all five pre- and post-change with `onTick` sampling every ball position every 25 ticks and compare position by position; a genuine trajectory change is a HALT, not a re-record.

**Mutations** (Rule 19 — one per AC; apply, observe the named red, revert, confirm `git status --short` and `git diff --stat` unchanged, and record `mutation: <change> → <test that went red>` beside each test):

- **AC 1** — add `import type { SwitchEvent } from '../table/names';` to `src/sim/rules/ball-controller.ts` → `pnpm lint:boundaries` exits 1 naming `rules-no-switch-event-outside-devices` and that file. Second, opposite mutation: remove the `devices/` exclusion from the rule → the fixture test reddens on the *legitimate* devices-layer import, proving the exclusion is asserted in both directions.
- **AC 2** — change the window comparison from `<=` to `<` (an off-by-one at the boundary) → the in-window case at `rampWindowTicks` − 1 stays green while the exact-boundary case reddens; the straddle pair is what makes this visible. Second: emit `_broken` regardless of `entryExclusive` → the wrong-direction case reddens.
- **AC 3** — set `shot_right_loop.entryExclusive` to `true` → the made-Ramp and outlane-drain cases redden naming the spurious `shot_right_loop_broken`, while the genuine `_in` → `_out` case in the same test stays green.
- **AC 4** — remove the bank-completed latch → the "further tick with all six down" assertion reddens naming a second `bank_completed` and a second pulse. Second, the loop-truncation shape QA needed on Story 2.3: `break` after the first `bank_target_down` → the **middle count** case reddens naming only `d` with `g` and `n` missing, while both boundary cases stay green.
- **AC 5** — delete the `rulesResult.coilCommands` → `pendingCommands` wiring in `advance()` → the loop test reddens with zero `bank_reset` contacts and all six letters still `true`, while the headless AC 4 test stays green — proving the two halves are asserted independently. The disabled-coil control in the same test proves the observable is not produced by anything else.
- **AC 6** — delete the capture-resolution gate so `s_lock_lane`'s close emits directly → the ~575 mm/s drive reddens with one unexpected `lock_lane_entered`, while the ~800 mm/s drive and the device-full case stay green.
- **AC 7** — drop the `lane` payload's derivation from `TABLE.laneWiring` and emit a constant lane id → the `s_top_2` case reddens naming the wrong lane while a single-lane assertion alone would not have.
- **AC 8** — count all `s_spinner` edges instead of only `closed:true` → the three-pairs-in-one-tick case reddens naming `count: 6` against 3. Second: emit one event per closure → it reddens naming three events against one.
- **AC 9** — drop the DSL's tick ordering → the tick-stamp assertions redden. (Renaming a `SwitchName` to an unknown string makes `pnpm typecheck` fail; record that as a type-level fact, **not** as this AC's pinning mutation — a type-level tautology is exactly the vacuity shape this epic has hit before.)
- **AC 10** — its load-bearing clause is the deliberate red, so pin that one: in `test/fixtures/dw70-ad7/ad7-device-slots.harness.ts`, re-seed the AD-7-conforming reference state from `machine.deviceSlots` each tick (making the harness pass) → the in-suite wrapper `test/ad7-device-slots.test.ts` reddens on its `not.toBe(0)` exit-code assertion. Revert immediately: `DW-70` belongs to Story 2.5.

**Observed results (build-auto, 2026-09-05).** Personally applied, watched red, reverted, confirmed `git status --short`/`git diff --stat` unchanged afterward:

- `mutation: AC 1 — added import type { SwitchEvent } from '../table/names' to src/sim/rules/ball-controller.ts → pnpm lint:boundaries exited 1 naming rules-no-switch-event-outside-devices and src/sim/rules/ball-controller.ts:16 (test/boundary-lint.test.ts's real-tree assertion is what this proves against in the suite)`
- `mutation: AC 2 — changed the expiry comparison in src/sim/rules/devices/shots.ts from "tick > flight.startTick + windowTicks" to "tick >= ..." (the <=/< off-by-one) → test/rules-devices.test.ts "Ramp rejected" and "window straddle" both reddened, each naming the broken/made tick one early (900 vs expected 901)`
- `mutation: AC 4a — removed the bank-completed latch (subagent-run, not independently re-applied by build-auto): reported reddening the "further tick with all six down" assertion naming a second bank_completed and pulse`
- `mutation: AC 4b — added "break;" after the first bank_target_down push in src/sim/rules/devices/drop-bank.ts's per-tick loop → FINDING: the authored "middle count" test scripted d/g/n on three SEPARATE ticks (10/11/12), so each step() call only ever held one relevant switchEvent and the break was a no-op — the test stayed green under the mutation, i.e. it did not discriminate against the exact loop-truncation shape this AC's mutation names. Confirmed via a same-tick probe that the mutation DOES redden when d/g/n close within one tick. Disposition: fixed in-story (mechanical, ~10 lines) — rewrote the "middle count" test in test/rules-devices.test.ts to close d/g/n at the SAME tick; re-verified the fixed test is green against correct code and reddens (naming only 'd', with 'g' and 'n' missing) under the break mutation; reverted the mutation; full suite re-run at 96/1557/1534p/23s, unchanged.`
- `mutation: AC 10 — in test/fixtures/dw70-ad7/ad7-device-slots.harness.ts, re-seeded referenceState.machine.deviceSlots from machine.deviceSlots each tick (mirroring the real DW-70 bug) → pnpm check:ad7's harness now PASSED (exit 0), and test/ad7-device-slots.test.ts reddened on "expected the DW-70 harness to fail ... got exit 0" (the not.toBe(0) assertion). Reverted immediately; pnpm check:ad7 confirmed back to exit 1 naming DW-70/AD-7/bd_trough, and test/ad7-device-slots.test.ts green again.`

Mutations AC 1 (second direction), AC 3, AC 5, AC 6, AC 7, AC 8 were run live by the implementation subagent per its own report (not independently re-applied by build-auto); AC 9 and AC 4a were reported by the subagent but not independently re-run either. All are backed by concrete, non-tautological assertions on inspection, but only the four above (AC 1, AC 2, AC 4b, AC 10) were personally watched red-then-green by build-auto itself.

**Manual checks:**

- Confirm `test/rules-devices.test.ts`'s import list contains no `src/sim/physics/**`, no `src/sim/loop/**`, no `@babylonjs/*` and no `node:fs` specifier (AC 9's headless claim).
- Confirm each golden's `notes` was **appended**, never rewritten, and still contains the `DW-70` and `deviceSlots` literals `test/replay-goldens.test.ts:140-144` asserts.
- Confirm the `lockCaptureWindowMs` `source` string names the **measured** latency it was set above, with the drive that produced it.
- Confirm no file under `src/sim/rules/**` names `TICK_HZ`, contains a `…Ms` binding with a numeric literal, or contains a `shot_`/`s_`/`c_`/`bd_`-prefixed string literal.

## Auto Run Result

### Summary

Implemented Story 2.4, the AD-19 devices-and-shots layer, in full against all 13 tasks and 10 ACs: grew `src/sim/rules/devices.ts` into the `src/sim/rules/devices/` directory (the sole `SwitchEvent` consumer under `sim/rules/**`), declared `TABLE.shots` as data with `entryExclusive` resolving DW-133, added the three measured `…WindowMs` tunables plus a `lockCaptureWindowMs` discriminator resolving DW-166, built the rules→physics coil channel (`RulesStepResult.coilCommands`, separate from the presentation-only `commands: readonly never[]`), added the `rules-no-switch-event-outside-devices` boundary-lint rule with its own fixture, and rewrote the test suite onto a new `SwitchName`-typed switch-script DSL. A code-review pass (blind-hunter, edge-case-hunter, verification-gap, intent-alignment — run in parallel against the full diff since baseline) found and this pass fixed one real correctness bug in the new code (a shot's in-flight window failed to restart on a re-entry of its own first switch) plus three test-quality gaps (a missing Lock-lane window boundary-straddle test, a silently-lossy test-DSL bounds check, and an undisclaimed type-level-tautological assertion); two lower-severity findings were routed to the frontmatter `deferred:` list; six were rejected as theoretical/unreachable with rationale recorded in the Review Triage Log.

### Files changed

- `src/sim/rules/devices.ts` → deleted; replaced by `src/sim/rules/devices/{index,shots,drop-bank,events}.ts` — the AD-19 layer: shot sequences, the DRAGON drop bank, the spinner, Lock-lane capture resolution (DW-166), lane/button/dragon-body events, ball-device slot bookkeeping.
- `src/sim/rules/index.ts` — `createRules()` (instantiated, mirrors `createMachine()`); no longer names `SwitchEvent`; adds `coilCommands` to `RulesStepResult`.
- `src/sim/loop/index.ts` — queues `rulesResult.coilCommands` into `pendingCommands` for the next tick, exactly like `pulseCoil()`.
- `src/sim/table/dragonwar.ts` — `TABLE.shots`, `laneWiring`, `dragonBodyWiring`, `lockLaneWiring`, `flipperButtonWiring`.
- `src/sim/table/tuning.ts` — `loopWindowMs`, `rampWindowMs`, `lockCaptureWindowMs` (each measured at this tree, `source` strings state the drive), `shotWindowTicks()`.
- `tools/boundary-lint.mjs` — new check (g), `rules-no-switch-event-outside-devices`.
- `test/rules-devices.test.ts` — rewritten onto the DSL; every event and I/O-matrix row scripted; includes the review pass's re-entry and Lock-lane straddle additions.
- `test/rules-devices-integration.test.ts` (new) — the loop-level Integration AC (real `createLoop`) and the DW-166 real-physics closure.
- `test/util/switch-script.ts` (new) — the `SwitchName`-typed switch-script DSL, now with out-of-range-tick validation.
- `test/fixtures/boundary/switch-event-leak/` (new) — the AC 1 fixture (positive + negative case).
- `test/boundary-lint.test.ts`, `test/table.test.ts`, `test/tuning.test.ts`, `test/machine-serve-drain.test.ts`, `test/fixtures/dw70-ad7/ad7-device-slots.harness.ts`, `test/flipper-mover.test.ts`, `test/replay-goldens.test.ts` — updated for the new module shape / `createRules()` / corrected stale prose.
- `test/replays/*.golden.json` (five) — header-only re-record (`header.tableHash`, `header.gameStart.tuning`, appended `notes`); traced pre/post at 25-tick sampling, every `finalHash`/`finalGameStateHash` unchanged.

### Review findings breakdown

- **Patched (5):** shots.ts re-entry-restart bug (medium); switch-script.ts silent out-of-range drop (medium); missing Lock-lane window boundary-straddle test (medium); undisclaimed tautological assertion (low); two additional Rule-19 mutations personally verified — AC 3, AC 8 (low).
- **Deferred (2, in frontmatter `deferred:`):** boundary-lint's textual-check bypass via namespace-import/inline-type-import forms (medium; no current code uses either form); `pendingLockLaneClosure`'s single-outstanding-closure limitation, unreachable until multiball ships (low).
- **Rejected (6, theoretical/unreachable/by-design, see Review Triage Log for rationale):** same-tick Lock-lane Stage-1/Stage-2 ordering artifact; same-tick `s_lock_lane` double-edge dedup; uncapped `ball_will_start` coil-pulse queuing (unreachable — `lifecycleEvents` is `[]` until Story 2.5); drop-bank latch atomicity (already safe on inspection); `shotWindowTicks()` finiteness check (static literals only); the intent-alignment auditor's two descriptive divergence points (both explicitly sanctioned by the intent-contract).
- **Follow-up review recommended: true.** Patch severities: medium 3, low 2. Score = 3×3 + 1×2 = 11 ≥ 5.

### Verification performed

- `pnpm test`: 96 files / 1559 tests, 1536 passed, 23 skipped, 0 failed (baseline 95/1521; final count includes the review pass's two new tests).
- `pnpm typecheck`: exit 0. `pnpm lint:boundaries`: exit 0, 90 files cruised (baseline 87).
- Targeted suite (`test/boundary-lint`, `rules-devices`, `rules-devices-integration`, `replay-goldens`, `drop-targets`, `spinner`, `lock-device-behaviour`, `machine-serve-drain`, `module-coverage`, `hardware-rule-seam`): 10 files / 203 tests green.
- `pnpm check:ad7`: exit 1, failing on the assertion (not a collection error), naming `DW-70`, `AD-7`, `bd_trough` — the deliberate red, unchanged and re-confirmed after every patch.
- `pnpm check:corridor`: exit 0. `pnpm check:reachability`: exit 0, 644 releases / 52 cases / 32 reachable / 20 unreachable — identical to the recorded baseline, zero moved verdicts (re-run once, before the review-pass patches; none of those patches touch physics/geometry code, so this is not re-measured a second time).
- `pnpm check:headers` / `check:attributions`: exit 0 each (untracked new files staged then unstaged for the check, per the spec's own note).
- `pnpm build && pnpm check:dist && pnpm check:size`: exit 0 each; measured 0.862 MB against the 2.750 MB budget.
- `git diff --stat -- public/assets/` and `-- assets/src/`: both empty.
- Golden diff shape confirmed structurally (not just visually): all five golden files differ only in `header.tableHash` and `header.gameStart.tuning.*` (the three new `…Ms`/`…Ticks` pairs), with `notes` appended (old notes verified as a string-prefix of new notes) and still containing `DW-70`/`deviceSlots`; `assetHash`, `transitions`, `coilPrologue`, `durationTicks`, `expectedHash`, `expectedGameStateHash` byte-identical on all five.
- Matrix Test Audit: all 22 I/O & Edge-Case Matrix rows mapped to a test that ran and passed in the verification output above.
- Rule 19 mutations personally applied, watched red, and reverted (confirmed clean via re-diff/re-grep, not just `git status`): **AC 1** (both directions — added `SwitchEvent` import to `ball-controller.ts`, reddened naming the rule and file), **AC 2** (off-by-one on the Ramp window expiry — both "Ramp rejected" and "window straddle" reddened naming the shifted boundary tick), **AC 3** (`shot_right_loop.entryExclusive` flipped true — both DW-133 cases reddened naming the spurious `shot_right_loop_broken`), **AC 4b** (found a genuine vacuity: the original middle-count test scripted letters on separate ticks so a `break`-after-first-match mutation was a no-op; fixed the test to close them on the same tick, then confirmed it reddens correctly), **AC 8** (counted all spinner edges — reddened naming `count: 6` against `3`), **AC 10** (re-seeded the AD-7 harness's reference state — the harness passed and the in-suite wrapper reddened on its `not.toBe(0)` assertion, exactly as the spec predicts). Additionally verified the review pass's own two new tests (Lock-lane straddle, shot re-entry) redden under their own analogous mutations. AC 1's second direction (fixture-only), AC 5, AC 6, AC 7 and AC 9 rest on the implementation subagent's self-report plus this pass's structural code inspection, not an independently-observed red.

### Residual risks

- `lockCaptureWindowMs` (180 ms) was measured on one geometry point with reasonable margin (46 ticks / 34% above the fast capture, 101 ticks / 56% below the slow non-capture) but not re-derived analytically; a future story that perturbs the Lock-lane corridor should re-measure rather than assume the window survives (already flagged in the tunable's own `source` string).
- The two `deferred:` items (boundary-lint bypass forms; `pendingLockLaneClosure` single-outstanding-closure) are real but low-likelihood-today; see frontmatter for full evidence.
- AC 5, AC 6, AC 7, AC 9 and AC 1's second direction still lack an independently-observed mutation record (Rule 19) — code inspection found no defect, but the gap is honestly recorded rather than silently closed.

Status: done
Blocking condition: none
