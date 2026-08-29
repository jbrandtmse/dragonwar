---
title: 'Story 1.7: Nudge, the tilt bob and the slam sensor'
type: 'feature'
created: '2026-08-29'
status: 'draft'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-flippers-and-the-manual-plunger-as-hardware-rules.md'
warnings: ['oversized', 'multiple-goals']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Nothing in the build reacts to a nudge. `src/host/input/index.ts:74-79`'s `KEY_MAP` binds only
`ShiftLeft`/`ShiftRight`/`Enter`/`Digit1`, so `nudge_l`/`nudge_r`/`nudge_up` — three of the eight members of the
closed `InputAction` union (`src/sim/contracts/input.ts:12-20`) — can never be `true` in any `InputFrame`.
`src/sim/physics/machine.ts:124-129` reads that frame for the flipper and plunger hardware rules only. There is no
cabinet oscillator, no tilt bob and no slam counter anywhere under `src/sim/`, and the ported `BallMover` still
carries upstream's unimplemented `// todo nudge` at `src/sim/physics/ball/ball-mover.ts:82-85`. `s_tilt_bob` and
`s_slam_tilt` already exist in `TABLE.switches` (`src/sim/table/dragonwar.ts:104-105`) with nothing that can ever
close them.

**Approach:** Add one cabinet module beside the existing hardware rules in `src/sim/physics/`, reading the same
`InputFrame` at the same `machine.ts` seam, **before** `physics.step()` (AD-5): a damped-harmonic cabinet
oscillator taking an impulse per nudge rising edge, a pendulum tilt bob driven by the cabinet's acceleration, and a
tick-windowed nudge counter that is structurally independent of the bob. The ball is coupled to the cabinet as
**table-frame motion** — its inertial velocity is conserved across a nudge — never as a force or impulse on the
ball. Extend `host/input`'s existing map with Space and the arrow keys.

## Boundaries & Constraints

**Always:**
- The cabinet rules run at the **existing** seam in `src/sim/physics/machine.ts:124-129`, before `physics.step()`,
  alongside `flipperMechanics.applyFrame()` / `plungerMechanics.applyFrame()` (AD-5). Extend that seam; never add a
  second one and never move the existing calls.
- **No force, impulse or velocity delta is ever applied to a ball on account of a nudge.** The ball keeps its
  inertia; the cabinet moves under it (AD-5's explicit "prevents": "nudge as a force on the ball").
- `s_tilt_bob` and `s_slam_tilt` are emitted by **physics** as edges only (AD-2), through
  `MachineStepResult.switchEvents`, with `settleTicks` 0 from their existing `tilt_bob` / `slam` settle classes.
- The slam detector is a tick-windowed nudge count **beside** the oscillator with its **own** threshold
  (`slamNudgesPerWindow`), never the bob's threshold and never reading the bob's state (AD-5).
- The bob is **never reset by any command** — its physical decay is the only settle (AD-7 line 128, verbatim: "The
  bob is never reset by command").
- Every duration stays a **top-level** `…Ms` tunable in `src/sim/table/tuning.ts`. A `…Ms` key nested inside a
  group throws at load (`resolveTuning()`'s `assertNoNestedMsKeys`, `tuning.ts:342-360`, ledger `DW-34`).
- Key codes never enter `src/sim/**` (AD-4); the map stays only in `src/host/input/index.ts`.
- Every criterion below that names a mutation is only satisfied once that mutation has been **run** and the red
  **observed and recorded** in this spec. A green suite is not evidence (epic context; Story 1.6's AD-5 incident).
- Provenance is a hard gate (CLAUDE.md): the attribution row lands **before** the file, licences are verified in
  the fetched file header itself, and ported files keep their upstream notice alongside ours.

**Block If:**
- ~~The damped-harmonic cabinet oscillator AC 1 names as *ported* does not exist in this project's pinned,
  attributed upstream~~ — **RESOLVED 2026-08-29 by user authorization; this Block-If no longer fires.**
  `vpinball/vpinball` is now an attributed dependency of this repository, restricted to seven files. See
  `## Design Notes` -> "The vpinball authorization (2026-08-29)" for the exact terms, and `ATTRIBUTIONS.md`'s
  Code table for the recorded provenance. **Do not re-halt on this.** AC 1's word "ported" is now true and
  `epics.md` needs no amendment.
- The `col_*` geometry needed to hold a ball on a raised bat for longer than ~1 s is required by any test
  (it does not exist in Epic 1 — ledger `DW-72`, owned by Story 2.1).
- A tunable would have to be invented for a quantity on `physics-tuning.md:45-54`'s do-not-invent list.

**Never:**
- Never widen Story 1.6's 1 s ball-on-bat bound, alter the `FlipperMover`/`FlipperHit` port, or re-place the ball
  in `test/flipper-collision.test.ts` (the epic must leave that test's shape and placement intact for Story 2.1).
- Never build the replay/golden *machinery* — `test/replays/*.replay.json`, the shipped state hash, CI parity:
  that is Story 1.8's deliverable (`test/replays/.gitkeep`).
- Never implement tilt **warnings**, the Tilt rules, `machine.tilt` transitions or slam's game-ending behaviour —
  those are Story 2.11's. This story delivers sensors that close switches, nothing that consumes them.
- Never edit `ATTRIBUTIONS.md`, `_bmad-output/planning-artifacts/**`, `public/assets/**`, `index.html` or `docs/**`
  (outside the epic footprint; Story 1.6's two one-time widenings are spent and do not carry forward).
- Never add a `cabinet` key to `MechanismsSnapshot` — Epic 1 renders no cabinet shake, so it would be a contract
  widening with no consumer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Nudge rising edge | `nudge_l` false→true at tick *t*, oscillator at rest | One impulse enters the oscillator inside tick *t*'s own step, before `physics.step()`; ball inertial velocity unchanged across *t* | No error expected |
| Nudge held | `nudge_l` stays true for 500 ticks | Exactly **one** impulse (the rising edge), not one per tick | No error expected |
| Ball coupling | Free ball, cabinet oscillating | Ball's table-frame velocity changes by exactly −(cabinet velocity delta); its inertial velocity is conserved | No error expected |
| Bob crossing | Bob displacement crosses threshold and stays over it for 200 ticks | Exactly one `s_tilt_bob` `closed: true`, then exactly one `closed: false` on the return | No error expected |
| Bob decay | Bob swinging, no further input, no commands | Displacement envelope decays monotonically below threshold; sequence identical whether or not commands are issued | No error expected |
| Slam below bob threshold | 3 nudge edges inside the window, each too small to move the bob past its threshold | `s_slam_tilt` closes; `s_tilt_bob` never closes | No error expected |
| Slam window expiry | 2 nudge edges inside the window, a third after it | `s_slam_tilt` does not close | No error expected |
| Slam with bob over threshold | Bob held over threshold, fewer than `slamNudgesPerWindow` edges | `s_slam_tilt` does not close (independent of bob state) | No error expected |
| Unmapped key | `ArrowDown` keydown | No `InputTransition`, no `preventDefault()` | No error expected |
| Nudge key auto-repeat | OS repeats `ArrowLeft` keydown | Identical frame ⇒ no new transition (existing `host/input` behaviour) | No error expected |
| Blur mid-nudge | `nudge_up` held, window blurs | One transition releasing every held action | No error expected |

</intent-contract>

## Code Map

**Read-only governing sources (do not edit):**
- `_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md` — the ADR
  registry (there is no `docs/adr/`); each AD below was read in the spine text itself. **AD-5 at line 112** and
  **AD-2 at line 79** govern; AD-1 line 69, AD-3 line 85, AD-4 line 87, AD-7 line 128, AD-10 line 172,
  AD-15 line 202, AD-16, AD-19 line 222.
- `_bmad-output/planning-artifacts/epics.md:580-607` — this story's acceptance criteria verbatim; `:500-578` is
  Story 1.6 with the cradle and AC-2 change log the two hazards rest on.
- `_bmad-output/specs/spec-dragonwar/physics-tuning.md:62-63` — "Nudge as a damped-harmonic cabinet oscillator —
  **ported** — with the ball coupling re-derived as table-frame motion"; `:63` "Tilt bob as an actual pendulum"
  (note: **no** "ported" claim for the bob); `:45-54` the do-not-invent list (it does **not** name any nudge, bob
  or slam quantity); `:41-43` scopes "verbatim solver constants" to `vpdb/vpx-js @ e8a6d6f` only.
- `_bmad-output/planning-artifacts/prds/prd-dragonwar-2026-08-26/extract-research.md:199` and
  `research/technical-…-2026-08-26/research.md:102` — the oscillator/bob claim, cited to source **[3]**, which
  `research.md:223` resolves to **`https://github.com/vpinball/vpinball/tree/master/src/physics`** (C++), *not* to
  vpx-js. `research.md:182`: "Copying vpinball code requires checking each file's first line."
- `ATTRIBUTIONS.md:28` (the vpx-js row, `Component` = the glob `src/sim/physics/**`) and **`:89`** — vpinball is
  listed only under *"Planned dependencies… Not yet in the repository — record them properly here when they
  arrive"*, "Dual — GPLv3+ only where the first line reads `// license:GPLv3+`".
- `_bmad-output/implementation-artifacts/probe-1-6-cradle-energy.txt` — Story 1.6's cradle measurements.

**The seam this story extends:**
- `src/sim/physics/machine.ts:112-161` `step()`. `:124-129` is the hardware-rule block (the two `applyFrame()`
  calls, before `physics.step()` at `:138`); `:105-110` `coilEnabled`; `:113-122` the command partition;
  `:153` `switchTracker.step()`; `:156-160` the result assembly — `switchEvents` is where the two new switch edges
  join. `:183-189` the `mechanisms` getter is the pattern a `cabinet` getter follows. `:60-69` the `Machine`
  interface. Authored, not ported (`test/sim-boundary.test.ts:82` `AUTHORED_FILES`).
- `src/sim/physics/flippers.ts:35-46` / `src/sim/physics/plunger.ts:27-38` — the two existing hardware-rule module
  shapes to mirror: a `create…Mechanics(options)` factory returning `applyFrame(tick, frame, enabled)` plus a
  per-tick `state` getter. `flippers.ts:48-67` shows how a coil is named without a device-name string literal.
- `src/sim/physics/switches.ts:124-178` `createSwitchTracker()` — **zone-driven; not reusable here.** It tests a
  *ball's* swept segment against `LoadedSwitchZone`s (`:146-148`); the bob and the slam counter have no ball and
  no zone, so they are a separate emitter. Its `TrackedSwitch` debounce shape (`:101-110`, `:150-171`) is the
  reference for "one edge per genuine transition"; both new switches settle at 0 ticks, so the debounce reduces to
  a plain state-change test — the edge-collapsing logic must still exist, since that is the AC-3 mutation target.
- `src/sim/physics/ball/ball-mover.ts:66-89` `updateVelocities()` — **`:82-85` is upstream's `// todo nudge`**, the
  exact three commented-out lines that ARE the defect AD-5 names (`vel.x += nudgeX; vel.y += nudgeY;
  vel.sub(tableVelDelta)`). This file is ported and must stay verbatim: the re-derived coupling does **not** go
  here. `:79` is the gravity application, the only per-step velocity write.
- `src/sim/physics/game/player-physics.ts:448-452` `setGravity(slopeDeg, strength)` — the pitch-as-gravity-vector
  site (AD-10); `:106` `public gravity`. `:35-40` documents the port's own deviation convention. Grepped: the word
  `nudge` appears **nowhere** in this file — the original port dropped nothing here, because upstream has nothing.

**Table, tuning and contracts:**
- `src/sim/table/dragonwar.ts:104-105` — `s_tilt_bob` (`settleClass: 'tilt_bob'`) and `s_slam_tilt`
  (`settleClass: 'slam'`) **already exist**; `:36-43` the `SettleClass` union with both classes and their
  rationale. No `TABLE` edit is needed for the switches themselves.
- `src/sim/table/tuning.ts:165-181` `switchSettleMsByClass` — `tilt_bob: 0` and `slam: 0` **already authored**, so
  AC "settleTicks 0" is satisfied by `resolveTuning().switchSettleTicksByClass`. `:188-196`
  **`slamNudgesPerWindow: 3`** and **`slamNudgeWindowMs: 500`** already exist, both `unverified`, with FR-16 in
  their `source`. `:198-206` `tiltWarningSpacingMs` / `tiltSettleMs` are **rules-side (Story 2.11)** — this story
  must not read them. `:342-360` `assertNoNestedMsKeys` — a `…Ms` key below the top level **throws**; `:362-415`
  `resolveTuning()`; `:79` `TUNING` is `deepFreeze`d. `:108-155` `TUNING.flipper` is the model for a new
  transcribed-parameter group (each entry carrying the pinned upstream file in `source`).
- `src/sim/contracts/input.ts:12-20` — `nudge_l` / `nudge_r` / `nudge_up` are **already** in the closed
  `InputAction` union; `:27` `InputFrame`; `:34-37` `InputTransition`. No contract edit needed.
- `src/sim/contracts/snapshot.ts:73-79` `MechanismsSnapshot` — five keys, no cabinet slot (see Design Notes).
- `src/sim/contracts/replay.ts:41-54` — `ReplayHeader` / `Replay` types exist; **no runner, no hash, no goldens**
  (`test/replays/.gitkeep`: "Filled by Story 1.8").

**Loop and host:**
- `src/sim/loop/index.ts:95-114` `buttonSwitchByAction()` — derives button switches from `TABLE.switches` by
  `settleClass === 'button'`; its doc at `:91-93` already records that "`nudge_l`/`nudge_r`/`nudge_up`/`menu` have
  no button switch in Epic 1 and are correctly excluded". **That stays true** — the nudge actions must not gain
  button switches. `:123-131` `buttonSwitchEdges()`; `:149-155` `frameInForceAt()`; `:307-334` the per-tick body;
  `:322` `machine.step()`; `:73-82` `NO_FRAME` (the test-only all-false frame, and the key set
  `buttonSwitchByAction()` iterates).
- `src/host/input/index.ts:74-79` `KEY_MAP` — **the one edit**: add Space and the arrow keys. `:62-71`
  `EMPTY_FRAME` already lists all eight actions; `:93-115` the keydown/keyup handlers are action-generic and need
  no change; `:117-123` `onBlur`.
- `src/host/loop.ts:50-53` — already wires `input.drainTransitions()` into `loop.advance()` (Story 1.6).

**Tests (shapes to reuse):**
- `test/loop-determinism.test.ts:1-60` — **the Hazard-2 precedent**: a *test-local* FNV-1a state hash over
  canonical JSON + 0.01 mm-quantised ball positions, with an explicit header note that "Story 1.8 owns it as a
  SHIPPED, production artifact; this story only needs a working implementation of AD-15's stated definition".
  `:29-31` `loadDoc()`, `:36-60` `canonicalize()` / `quantize001Mm()` / `fnv1aHex()`.
- `test/flipper-collision.test.ts` — the ball-on-raised-bat rig (**do not re-place its ball**); `test/plunger.test.ts`
  and `test/flipper-mover.test.ts` — the tick-by-tick `createLoop()` driving pattern and the recorded-mutation
  convention from Story 1.6's rework.
- `test/host-input.test.ts:68-170` — the synthetic `KeyboardEventLike` harness (no jsdom) plus the `src/sim/**`
  key-code grep at `:12`; `:150` `'Enter maps to plunger and Digit1 maps to start'` is the row the new keys extend.
- `test/sim-boundary.test.ts:44` `PORT_MARKER`, `:82` `AUTHORED_FILES`, `:105-135` — the **disjoint two-branch**
  provenance regime for `src/sim/physics/**`: either the DragonWar GPL-3.0 header *and no* VPDB block/port marker,
  or a VPDB copyright block whose closing `*/` is immediately followed by the exact vpx-js port-marker line.
  `:170-192` the AD-15 solver-constant pin.
- `test/licence-headers.test.ts:38-72` and `tools/check-licence-headers.mjs` — the checker knows exactly two
  markers: the DragonWar GPL-3.0 header and the vpx-js port marker.
- `test/tuning.test.ts:27-41` (top-level scalar allowlist), `:103-108` (frozen), `:159-174` (the `…Ms`→`…Ticks` pin).
- `tools/boundary-lint.mjs` — rule (c) bans `Date`/`Math.random` under `src/sim/**`; rule (d) the `TICK_HZ`/ms-literal
  rule; rule (e) the device-name-literal rule over `src/**` except `src/sim/table/dragonwar.ts`.

**Upstream, read for provenance (nothing copied):** `vpdb/vpx-js @ e8a6d6f` — `lib/vpt/ball/ball-mover.ts:80-83`
`// todo nudge`, `lib/vpt/global-api.ts:124-142` `// TODO implement nudge`, and no file anywhere in the repository
whose path or contents implement a cabinet oscillator, a plumb bob or a tilt sensor (whole-tree grep).
`vpinball/vpinball @ 3f838c14bd2e37fb49a0b5aa6a9d76d421846bef` — `src/physics/cabinet/DampedHarmonicOscillator.h`,
`CabinetPhysics.{h,cpp}`, `KeyboardNudge.{h,cpp}`, `PlumbHandler.{h,cpp}`, `NudgeIntentHandler.{h,cpp}`,
`NudgeHandler.cpp` and `src/physics/hitball.cpp` each carry `// license:GPLv3+` as their exact first line;
**`src/physics/cabinet/NudgeHandler.h` does not** (its first line is `#pragma once`) and is therefore unusable.

## Tasks & Acceptance

**Execution:**

> **This story is HALTed at planning (`status: blocked`, `intent gap`) and the task list below is provisional
> beyond task 0.** Tasks 1-3 change shape depending on which amendment the lead chooses; tasks 4-12 hold either way.

- `_bmad-output/planning-artifacts/**` and `ATTRIBUTIONS.md` -- **task 0 (LEAD, out of footprint)** -- resolve the
  intent gap in `## Auto Run Result` before this spec is re-dispatched.
- `src/sim/physics/cabinet/oscillator.ts` -- create the damped-harmonic cabinet oscillator: state
  `{ displacement, velocity }` per horizontal axis, a per-step semi-implicit integration, and `impulse(axis, magnitude)`.
  Provenance (header, marker, tunable `source` fields) follows task 0's outcome.
- `src/sim/table/tuning.ts` -- add the cabinet and bob parameters as a group, with every duration kept as a
  **top-level** `…Ms` scalar (`assertNoNestedMsKeys` throws otherwise). Values and `confidence` follow task 0.
- `src/sim/physics/cabinet/plumb-bob.ts` -- create the pendulum bob driven by the cabinet's acceleration, with the
  threshold crossing collapsed to single edges and a purely physical decay.
- `src/sim/physics/cabinet/slam.ts` -- create the tick-windowed nudge counter: a ring of nudge-edge ticks, closing
  `s_slam_tilt` at `slamNudgesPerWindow` inside `slamNudgeWindowTicks`. It takes the nudge **edge stream** as its
  only input and holds **no reference** to the bob (structural independence, not merely a different number).
- `src/sim/physics/cabinet/index.ts` -- the hardware-rule facade mirroring `flippers.ts` / `plunger.ts`:
  `applyFrame(tick, frame)` returning the tick's `SwitchEdge`s, plus a `state` getter for the oscillator and bob.
- `src/sim/physics/machine.ts` -- construct the cabinet mechanics in `createMachine()`; call `cabinet.applyFrame()`
  in the `:124-129` block **before** `physics.step()`; fold its switch edges into `MachineStepResult.switchEvents`;
  add a read-only `cabinet` getter shaped like the existing `mechanisms` getter.
- `src/sim/physics/machine.ts` (same file, distinct change) -- apply the cabinet's per-tick table-frame
  displacement/velocity to the ball set as a **frame** transformation, never as a force on any ball, and never by
  editing the ported `ball-mover.ts`.
- `src/host/input/index.ts` -- extend `KEY_MAP` with `Space`, `ArrowLeft`, `ArrowRight`, `ArrowUp` (see Design
  Notes for the mapping and why `ArrowDown` is left unmapped).
- `test/cabinet-nudge.test.ts` -- AC 1 and its mutation; the inertial-velocity conservation observable.
- `test/cabinet-bob.test.ts` -- AC 3 and AC 4 and their two mutations.
- `test/cabinet-slam.test.ts` -- AC 5 and its mutation, in **both** directions.
- `test/cabinet-nudge-cradle.test.ts` -- AC 2, with its arrange-time on-the-bat assertion and its no-nudge control run.
- `test/host-input.test.ts` -- extend with the four new key rows and the "nothing else" assertion.
- `test/tuning.test.ts` -- extend the top-level scalar allowlist and the `…Ms`→`…Ticks` pin for any new duration.

**Acceptance Criteria:**

- **AC 1 (nudge is cabinet motion, not a force).** Given a free ball rolling on the playfield and the cabinet at
  rest, when `nudge_l` has a rising edge at tick *t*, then the oscillator receives exactly one impulse inside tick
  *t*'s own physics step (before `physics.step()`, `RulesStepResult.commands` still empty), and across that tick
  the ball's **inertial** velocity — its table-frame velocity plus the cabinet's velocity — is unchanged within
  tolerance, while its table-frame velocity changes by exactly the negative of the cabinet's velocity delta.
  **And** the test **fails when the nudge is applied instead as a force or velocity delta on the ball** (upstream's
  own `ball-mover.ts:82-85` shape); that red must be observed and recorded in this spec.
- **AC 2 (a nudge frees a ball resting on a raised bat).** Given a ball placed on a raised left bat exactly as
  `test/flipper-collision.test.ts` places it, and given the test **asserts at the nudge tick that the ball is
  genuinely still on the bat** (in contact, within tolerance of its placement, and not already departing), with
  that tick strictly inside the first 1 s of the hold, when `nudge_up` has a rising edge at that tick, then within
  a stated number of ticks the ball has left the bat by a stated observable — **and a control run identical in
  every respect except that no nudge occurs still has the ball on the bat at the same tick.** The control run is
  the discriminating negative: without it the criterion is satisfied by a ball that was leaving anyway.
  Verified by a deterministic replay assertion (see Design Notes, "Hazard 2").
- **AC 3 (`s_tilt_bob` closes as one edge and opens as one edge).** Given the bob at rest, when a nudge drives its
  displacement past the closure threshold and it stays past the threshold for at least 200 consecutive ticks,
  then `MachineStepResult.switchEvents` contains exactly **one** `s_tilt_bob` `closed: true` and, on the return,
  exactly **one** `closed: false` — never one per tick.
  **And** the test **fails when the bob emits an edge on every tick it is over the threshold**; red observed and recorded.
- **AC 4 (the bob decays physically; no command resets it).** Given the bob swinging after a nudge, when a
  `CoilCommand` (`enable`, `disable` and `pulse`, each exercised) is issued on a later tick, then the bob's
  per-tick displacement sequence is identical to a run in which no command was issued; and with no further input
  its amplitude envelope decays monotonically below the threshold and `s_tilt_bob` re-opens without any external reset.
  **And** the test **fails when a command resets the bob**; red observed and recorded.
- **AC 5 (the slam sensor is independent of the bob).** Given `slamNudgesPerWindow` and the tick window, when that
  many nudge rising edges occur inside the window **and each is small enough that the bob never crosses its own
  threshold**, then `s_slam_tilt` closes and `s_tilt_bob` never does; and when the bob is held past its threshold
  for the whole window but fewer than `slamNudgesPerWindow` edges occur, `s_slam_tilt` does not close.
  **And** the test **fails when the slam detector is coupled to the bob's threshold or state** — both directions
  are required, because a detector that silently shares the bob's threshold passes a one-directional test; red
  observed and recorded.
- **AC 6 (both switches are table-declared and reproduce in a replay).** Given `TABLE.switches`, when tuning is
  resolved, then `s_tilt_bob` and `s_slam_tilt` are both present and both resolve to `settleTicks` **0**; and
  replaying the same `InputTransition[]` through a fresh `createLoop()` twice produces the identical ordered
  sequence of both switches' edges.
- **AC 7 (the nudge keys).** Given `src/host/input`, when `Space`, `ArrowLeft`, `ArrowRight` and `ArrowUp`
  transition, then each maps to one of the three nudge actions and to **nothing else**, no other action becomes
  reachable from them, `ArrowDown` stays unmapped and emits nothing, and no key code appears anywhere under
  `src/sim/` (the existing grep in `test/host-input.test.ts` still passes).
- **AC 8 (Integration AC, Rule 1).** Driving the **real** `createLoop()` — not the cabinet module directly — with an
  `InputTransition` that raises `nudge_l` produces a `FrameOutput` whose ball trajectory diverges from an
  otherwise-identical no-nudge run, and a `machine.step()` whose `switchEvents` carry the bob's edges. The seam,
  not the module's internals, is what is observed.

## Spec Change Log

- 2026-08-29 (lead, re-dispatch after the user's decision): the plan's `intent gap` HALT is resolved by
  authorization rather than by amendment. `vpinball/vpinball` may now enter the repository at pin `3f838c14`,
  restricted to the seven `// license:GPLv3+`-marked files under `src/physics/cabinet/`, with `NudgeHandler.h`
  excluded. The `ATTRIBUTIONS.md` row was committed first (`38e51cd`), with no ported code in that commit, per
  CLAUDE.md's ordering rule; the planned-dependencies table was corrected in the same commit. `epics.md` is
  **not** amended — AC 1's word "ported" becomes true. Amended here: the fired Block-If in
  `## Boundaries & Constraints` (struck through, so it cannot re-fire) and a new `## Design Notes` subsection
  carrying the authorization's terms, the authorship-preservation requirement, the third `sim-boundary` header
  branch, and the `source`/`confidence` requirement for transcribed constants. Frontmatter `status` reset
  `blocked` -> `draft` so the plan stage re-derives the spec around the preserved intent block.

## Review Triage Log

## Design Notes

### The vpinball authorization (2026-08-29)

The plan stage correctly HALTed `intent gap`: AC 1 says *"the ported damped-harmonic cabinet oscillator"*, but
`vpdb/vpx-js @ e8a6d6f` implements no nudge at all (`lib/vpt/ball/ball-mover.ts:80` is `// todo nudge`;
`lib/vpt/global-api.ts:124` is `// TODO implement nudge`) — verified at source by both the plan and the lead.
The oscillator the planning artifacts describe is `vpinball/vpinball`'s. The user has now **authorized adding it**.

**Terms of the authorization — these are binding and narrow:**

- **Pin:** `vpinball/vpinball @ 3f838c14bd2e37fb49a0b5aa6a9d76d421846bef`.
- **Exactly seven files may be ported**, all under `src/physics/cabinet/`: `DampedHarmonicOscillator.h`,
  `CabinetPhysics.h`, `CabinetPhysics.cpp`, `KeyboardNudge.h`, `KeyboardNudge.cpp`, `PlumbHandler.h`,
  `PlumbHandler.cpp`. Each was fetched at the pin and its literal first line read: all seven are
  `// license:GPLv3+`.
- **`src/physics/cabinet/NudgeHandler.h` is EXCLUDED and must stay excluded.** Its first line is
  `#pragma once`, so it never completed vpinball's licence migration and remains under the inherited
  'old MAME'-like **non-commercial** terms, which GPL-3.0 cannot absorb and this project cannot distribute.
  Do not port, transcribe, quote or paraphrase it. It is dispatch-only (no physics), so nothing is lost.
  If the implementation appears to need it, that is a HALT, not a judgement call.
- **The attribution is already committed** (`38e51cd`), deliberately **before** any ported file, per CLAUDE.md's
  "the entry goes in before the file does". Do not edit `ATTRIBUTIONS.md` again — the one-time widening that
  allowed it is spent.
- **Ported files live under `src/sim/physics/cabinet/**`**, inside the `src/sim/physics/**` glob the
  `ATTRIBUTIONS.md` row is scoped to. Placing them anywhere else silently breaks the attribution and is a HALT.

**Preserving authorship (CLAUDE.md, hard gate).** These files carry **no per-file copyright line**, so the
holder comes from the root `LICENSE`: *"Visual Pinball development team and contributors"* (2000-2026,
"unless specifically noted differently in a respective source file"). Each ported file must carry, above our
own header and never replacing it: that holder, the GPL-3.0-or-later grant, the exact upstream source path,
the pin, and `// Deviation:` notes for every departure. Paraphrasing or trimming the grant breaks the licence
the port depends on.

**`test/sim-boundary.test.ts` needs a third header branch — this is in footprint and is this story's job.**
Its licence-header check is currently a strict two-way XOR: a file under `src/sim/` is *either* a vpx-js port
(VPDB copyright block + the exact port marker + freezy's line) *or* DragonWar-authored (GPL-3.0 header and no
VPDB markers). A vpinball port is legitimately neither and would fail as though it were a licence violation.
Add a third, disjoint branch that is exactly as strict as the other two — assert the vpinball holder line, the
GPLv3+ grant, its own port marker and the pin — rather than loosening the existing ones. (This guard is
itself an instance of the pattern this epic keeps finding: correct while there was one upstream, wrong on the
first legitimate exception. It is recorded as shape 8 in the Story 1.8 sweep mandate.)

**Transcribed constants must carry `source` and `confidence` in `tuning.ts`,** exactly as Story 1.6 did for
`TUNING.flipper`. Unlocking ~10 real, sourced figures — cabinet mass, both axes' frequency and damping, the
impulse shape, the bob's geometry and threshold — is the main reason this option was chosen over authoring our
own, so each one's provenance must be legible. A transcribed constant with no recorded source is no better
than an invented one. **Trap (`DW-34`):** any new `…Ms` tunable must be **top-level** — `resolveTuning()`'s
`assertNoNestedMsKeys` throws on a nested one.


### Governing ADs (Rule 6)

There is no `docs/adr/` in this project; the ADR registry is **AD-1..AD-19** in
`_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md`. Each was
read in the spine text itself, not from a list or a prior spec's summary.

- **AD-5 (line 112) — the governing decision.** Verbatim: "Nudge is an impulse to the cabinet oscillator; the
  oscillator is **ported**, but the **ball coupling is re-derived as table-frame motion** (the ball keeps its
  inertia while the cabinet moves — VPX's nudge-as-ball-force is a known open defect) and pinned by a golden
  replay. The tilt bob is a pendulum whose closure is `s_tilt_bob`. The slam detector is a tick-windowed nudge
  count in physics **beside** the oscillator, threshold `slamNudgesPerWindow` in `tuning.ts`, closure
  `s_slam_tilt`." Its "Prevents" list names this story's three failure modes exactly: "nudge as a force on the
  ball; slam tilt sharing the bob's threshold or living outside the replay". The same rule makes hardware rules
  "inside the physics step — switch or button → coil on the same tick", which is why the cabinet runs at
  `machine.ts:124-129` and not through rules. **The word "ported" in this AD is what fires the Block If.**
- **AD-2 (line 79) — which layer owns which switch.** Verbatim: "Physics emits **playfield and cabinet-mechanism**
  `SwitchEvent`s (`s_tilt_bob`, `s_slam_tilt` included) as edges only … with per-switch hysteresis and
  `settleTicks` from `TABLE.switches` (defaults by class: … tilt bob 0). `sim/loop` emits only the **button**
  switches … Rules never debounce a switch." So both new switches are physics-emitted, both settle at 0, and the
  three nudge actions must **not** acquire button switches in `sim/loop` (`loop/index.ts:91-93` already records this).
- **AD-7 (line 128).** Verbatim: "The bob is never reset by command — its physical decay plus `tiltSettleMs` is
  the settle." `tiltSettleMs` is a **rules-side** timer (Story 2.11); this story delivers only the physical decay.
- **AD-4 (line 87).** The host stamps transitions from the DOM `timeStamp`; key codes never enter `sim/`; a
  *command* lands next tick but a *hardware rule* reads the frame in the same step — the asymmetry the seam depends on.
- **AD-3 (line 85).** One clock; no literal ms inside `sim/`; durations authored in ms in `tuning.ts` and converted
  once. No wall clock and no unseeded randomness — the oscillator and bob must be fully deterministic.
- **AD-15 (line 202).** Two constant classes. Solver constants are ported verbatim and never tunable; **table
  tunables** — the spine names "slam threshold" among them — each carry `source` and `confidence`, with
  do-not-invent numbers shipped `unverified`. Also the source of the golden-replay testing shape.
- **AD-1 (line 69), AD-10 (line 172), AD-16, AD-19 (line 222)** constrain the wiring: linted layering and no table
  API; the table frame as canonical with exactly one conversion file; ported files keeping their upstream headers
  plus the port marker; the devices layer as the only switch consumer.
- **AD-6, AD-9, AD-11, AD-17** are untouched — no device, command-union, geometry, CSP, bundle or deploy change.

### The intent gap: the oscillator AC 1 calls "ported" is not in this project's pinned upstream

This is the blocking condition; the full statement and the recommended amendment are in `## Auto Run Result`. The
evidence, in short:

1. **`vpdb/vpx-js @ e8a6d6f` does not implement nudge.** Verified against the downloaded tree at the pinned commit,
   not from memory: `lib/vpt/ball/ball-mover.ts:80-83` is `// todo nudge` with the three intended lines commented
   out; `lib/vpt/global-api.ts:124-142` is `// TODO implement nudge`; `lib/game/player-physics.ts` mentions nudge
   only in a comment at `:377`; a whole-tree grep for `tableVel` / `nudgeSpring` / `nudgeDamping` /
   `tableDisplacement` returns exactly one hit, the commented-out line above. No file's path contains `nudge`,
   `plumb`, `tilt`, `slam`, `cabinet` or `oscill`. **Our own port faithfully carries that hole** —
   `src/sim/physics/ball/ball-mover.ts:82-85` is the same `// todo nudge`.
2. **The real source is `vpinball/vpinball` (C++).** The research's own citation `[3]`
   (`research.md:223`) points at `https://github.com/vpinball/vpinball/tree/master/src/physics`, and
   `src/physics/cabinet/` there holds `DampedHarmonicOscillator.h`, `CabinetPhysics.*`, `KeyboardNudge.*` and
   `PlumbHandler.*` — literally the damped-harmonic cabinet oscillator and the plumb-bob pendulum.
3. **It is legally usable, but it is not in the repository.** Every file needed carries `// license:GPLv3+` as its
   exact first line (`DampedHarmonicOscillator.h`, `CabinetPhysics.{h,cpp}`, `KeyboardNudge.{h,cpp}`,
   `PlumbHandler.{h,cpp}`, `NudgeIntentHandler.{h,cpp}`, `NudgeHandler.cpp`, `hitball.cpp`) — **except
   `NudgeHandler.h`, whose first line is `#pragma once`**, which therefore falls under the repository's
   "old MAME"-like non-commercial default and must not be used (it is dispatch-only and contains no physics, so
   nothing is lost). No source file carries a copyright line; the root `LICENSE` supplies it —
   "Copyright (C) 2000-2026 Visual Pinball development team and contributors", GPLv3-or-later.
   But `ATTRIBUTIONS.md:89` lists vpinball under **"Planned dependencies … Not yet in the repository — record them
   properly here when they arrive"**, and CLAUDE.md's hard gate is "**Record it in `ATTRIBUTIONS.md` first.** …
   The entry goes in before the file does." `ATTRIBUTIONS.md` is a root file, **outside this epic's footprint**.
4. **The header regime is a closed two-way choice.** `test/sim-boundary.test.ts:105-135` requires every file under
   `src/sim/physics/**` to be *either* declared-authored with the DragonWar GPL-3.0 header **and** to contain
   neither the VPDB copyright block nor the vpx-js port marker, *or* to carry a VPDB block followed by that exact
   marker line. `tools/check-licence-headers.mjs` knows the same two markers and no others. A file derived from
   vpinball fits neither branch, and declaring it "authored" would be a false provenance claim — precisely what
   CLAUDE.md forbids.

So both readings of AC 1 terminate outside the footprint: porting needs an `ATTRIBUTIONS.md` row, and authoring
instead contradicts AD-5, `physics-tuning.md:62` and AC 1's own word "ported" (a planning-artifact amendment).
Per Rule 5 this is an `intent gap` HALT, never something to plan around; per the dispatch, Story 1.6's two
one-time widenings are spent and neither carries forward.

**Note the bob is a smaller problem than the oscillator.** AD-5 says only "The tilt bob is a pendulum whose closure
is `s_tilt_bob`" and `physics-tuning.md:63` says only "Tilt bob as an actual pendulum" — **neither says "ported"**.
A rigid-rod angular pendulum is authorable without a provenance decision. The slam counter likewise: AD-5
describes it as "a tick-windowed nudge count", with its threshold already authored in `tuning.ts:195-196`. Only the
oscillator carries the explicit "ported" claim, which is what makes the gap narrow and cheap for the lead to close.

### Hazard 1 — AC 2's cradle window, and why the control run is the whole test

Story 1.6 established with measurements that Epic 1's collision document has **no geometry beside either flipper**
(twelve `col_*` nodes: playfield, glass, five outer walls, two lane walls, the lane deflector, two bats), so a ball
resting on a raised bat rolls along it under the 6.5° pitch and departs on its own after roughly **1.2-1.9
simulated seconds** — geometry, not a flipper defect (`probe-1-6-cradle-energy.txt`; ledger `DW-72`, now Story
2.1's). AC 2's nudge must therefore land **well inside the first 1 s**, and the test's arrange must assert the ball
is genuinely still on the bat at that tick.

Even so, "the ball leaves the flipper" is by itself vacuous — the ball leaves anyway. The criterion is only
falsifiable with the **paired control run**: identical seed, identical placement, identical tick budget, no nudge.
The nudged ball must have left; the control ball must still be on the bat. That is the same discriminating-negative
discipline Story 1.6's replacement cradle test was forced into after its first version was rejected for narrowing
the window until it passed. This story must not widen the 1 s bound, alter the port, or re-place
`test/flipper-collision.test.ts`'s ball (Story 2.1 re-asserts the full 5 s cradle against that exact placement and
its measured tolerances).

### Hazard 2 — "verified by a golden replay" when goldens are Story 1.8's deliverable

**Decision: build the minimal deterministic replay assertion this story needs, test-local, and let Story 1.8
generalise it. The golden *file* is deferred to 1.8; the in-spec observable standing in here is the paired
run described in AC 2 plus the two-run reproducibility of AC 6.**

Reasoning, and the precedent: `test/replays/.gitkeep` reads "Filled by Story 1.8", `src/sim/contracts/replay.ts`
has the types but no runner or hash, and Story 1.8's own ACs own the header, the shipped FNV-1a state hash, the
`test/replays/` goldens and browser parity. **Story 1.5 already faced this exact situation and resolved it the
same way**: `test/loop-determinism.test.ts:13-17` implements AD-15's hash definition test-locally and says so in
its header — "Story 1.8 … owns it as a SHIPPED, production artifact; this story only needs a working
implementation of AD-15's stated definition to prove the property holds, not to pre-empt where Story 1.8 places
the reusable version." Following that precedent keeps the epic consistent, keeps 1.8's deliverable intact, and
still gives AC 1 and AC 2 a replay-shaped, deterministic observable today: a fixed `InputTransition[]` driven
through the real `createLoop()`, asserted to reproduce identically across two fresh loops.

**Rejected alternative:** building a real `*.replay.json` golden here. It would require inventing the header
(`tableHash`, `assetHash`, `physicsVersion`) and the shipped hash ahead of the story that owns them, and every one
of those figures would be re-decided in 1.8 — leaving a golden recorded against a superseded header, which is
exactly the "re-record every golden" cost AD-15 warns about. Story 1.8's AC already names "nudge coupling" as one
of its five goldens, so the durable golden has an owner and a home.

### Integration ACs, Consumed-by and Consumes (Rules 1 and 2)

This story introduces one module tree, `src/sim/physics/cabinet/**` (oscillator, bob, slam counter, facade), plus
one edit to the existing `src/host/input/**`.

- `src/sim/physics/cabinet/**` → consumed **inside this story** by `src/sim/physics/machine.ts` and, transitively,
  by `src/sim/loop/index.ts`. **Integration AC: AC 8 above** — exercised through the real `createLoop()`'s own
  `FrameOutput` and through `MachineStepResult.switchEvents`, never by inspecting the cabinet module's internals.
- **The two switches have no consumer in this story.** `s_tilt_bob` and `s_slam_tilt` close inside physics, but
  nothing reads them: `src/sim/rules/**` in Epic 1 is the minimal step, and `machine.tilt` transitions, tilt
  warnings and slam's game-ending behaviour are explicitly Epic 2's (epic context: "the bob and the slam sensor
  here are sensors closing switches inside physics, and the rules that consume them are Epic 2's").
  **No consumers in this story; the first consumer will be Story 2.11 (Tilt warnings, Tilt and slam tilt.)**
  They are still asserted at the emitting seam's own output (AC 3, AC 5, AC 6), so neither is unverified.

**Consumed-by:** Story 1.8 (the nudge-coupling golden and the cradle-and-release golden replay this story's
deterministic assertion is the seed for) · Story 1.9 (the dev tuning panel hot-applies the cabinet and bob
tunables; the feel ritual tunes the nudge against the Reference machine) · Story 2.1 (re-asserts the real cradle,
ledger `DW-72`, against the geometry that makes a nudge-frees-the-cradle test meaningful) · **Story 2.11 (Tilt
warnings, Tilt and slam tilt — the first and only consumer of both switches)** · Story 6.4 (rebindable keys re-use
`host/input`'s map).

**Consumes:** `src/sim/contracts/{input,events,snapshot,commands}.ts` · `src/sim/table/{dragonwar,names,tuning,
frames}.ts` · `src/sim/physics/{machine,switches,constants}.ts`, `game/player-physics.ts`, `ball/ball.ts`,
`math/**` · `src/sim/loop/index.ts` (test side) · `src/host/loop.ts` (host side).

### The key map: which key becomes which nudge

`ArrowLeft` → `nudge_l`, `ArrowRight` → `nudge_r`, `ArrowUp` → `nudge_up`, and **`Space` → `nudge_up`** as a second
binding. `ArrowDown` stays unmapped: there is no fourth nudge action to give it, and AC 7's "and nothing else"
forbids inventing one. Space as the centre/forward nudge is the convention the reference implementation uses
(`vpx-js`'s own `lib/game/pin-input.ts:59-61` maps `CenterTiltKey` to `DIK_SPACE`, with left/right tilt on separate
keys), and the PRD's wording is "Space/arrow keys to Nudge" (`prd.md:281`) — a set of keys for a set of actions,
not a one-to-one list. Two keys for one action costs nothing: `host/input`'s frame accumulator already collapses a
second keydown for an already-held action into no transition (`input/index.ts:99-101`).

### Where the coupling goes, and where it must not

`src/sim/physics/ball/ball-mover.ts` is **ported and stays verbatim** — its `// todo nudge` at `:82-85` is
upstream's own hole, and filling it with `vel.x += nudgeX` would be implementing the exact defect AD-5 names. The
re-derived coupling belongs at the `machine.ts` seam, where the cabinet's per-tick table-frame displacement and
velocity are applied to the ball set as a change of reference frame. The discriminating property to hold onto:
under table-frame motion the ball's **inertial** velocity is conserved across a nudge tick and no energy enters
the ball; under a force on the ball it is not. That is what AC 1 asserts and what its mutation breaks.

The reference implementation is worth reading precisely because it shows the defect: in `vpinball/vpinball`,
`src/physics/hitball.cpp` subtracts the cabinet acceleration straight from the ball's velocity, while the
cabinet's actual displacement is consumed only by rendering — **no collision geometry moves**. That mismatch is
why its cabinet model needs 3.5×/2.0× "magic correction factors" to make the picture agree with a ball response
tuned separately. Re-deriving the coupling as genuine table-frame motion removes the need for both.

### `MechanismsSnapshot` is deliberately not widened

`src/sim/contracts/snapshot.ts:73-79` carries five mechanism keys and no cabinet slot. Epic 1 renders no cabinet
shake (no AC asks for one; the fixed authored camera and the placeholder scene are the deliverable), so adding a
sixth key would widen a Structural-Seed contract with no consumer. The cabinet and bob state is instead exposed
through a read-only `machine.cabinet` getter shaped exactly like the existing `mechanisms` getter
(`machine.ts:183-189`) — enough for the tests and for Story 1.9's tuning panel, with no contract change. If Epic 4
adds cabinet shake, that story adds the snapshot key alongside its renderer.

### Tunables: the `…Ms` nesting trap

Any duration this story authors (the impulse length, the slam window) must be a **top-level** `…Ms` scalar in
`TUNING`. `resolveTuning()`'s `assertNoNestedMsKeys` (`tuning.ts:342-360`, ledger `DW-34`) **throws** on a `…Ms`
key at any depth below the top level, because only top-level ones are converted. `slamNudgeWindowMs` is already
top-level and correct (`:196`). Non-duration parameters (frequencies in Hz, damping ratios, masses, lengths,
threshold angles) carry no `Ms` suffix and may live in a nested group, exactly as `TUNING.flipper` does.

### Ledger

`LEDGER slice 1-7-nudge-the-tilt-bob-and-the-slam-sensor` is **empty** — this story owns no entries. `DW-72` (the
full 5 s cradle) is Story 2.1's and constrains Hazard 1 only. `DW-70` (`machine.deviceSlots` written by `sim/loop`
rather than derived per AD-7) is a standing escalation owned by `burndown` and surfaced at the Epic 1 merge gate;
nothing here touches `deviceSlots`, so it is left alone.

### Multi-goal warning

`multiple-goals` is carried because the nudge oscillator, the tilt bob and the slam detector are three separately
shippable mechanisms. They stay in one spec deliberately: all three are AD-5 cabinet hardware rules reading the
same `InputFrame` at the same `machine.ts:124-129` seam, the bob is driven by the oscillator's acceleration, and
the slam counter consumes the same nudge edge stream — splitting them would triplicate that wiring and its tests.
`oversized` is carried because the spec exceeds the template's 1600-token guidance.

## Verification

**Commands:**
- `pnpm typecheck` — expected: clean across all three projects.
- `pnpm lint:boundaries` — expected: clean; in particular no `Date`/`Math.random` under `src/sim/**` (rule (c)),
  no literal ms or `TICK_HZ` outside the two permitted sites (rule (d)), and no device-name literal (rule (e)).
- `pnpm test` — expected: all green, including the new cabinet tests and the unchanged Story 1.5/1.6 suites.
- `pnpm check:headers` and `pnpm check:attributions` — expected: clean. **These two are the gate task 0 must clear
  first**: the header checker knows only the DragonWar GPL-3.0 header and the vpx-js port marker.
- `pnpm build` — expected: succeeds; no CSP, bundle-budget or deploy change is intended.

**Manual checks:**
- **Each mutation must be run and its red recorded in this spec**, per AC 1, AC 3, AC 4 and AC 5: apply the
  mutation, run `pnpm test`, record the failing test name and message, revert. A mutation asserted but not run is
  not evidence (epic context; Story 1.6's AD-5 incident, where moving the hardware rules after `physics.step()`
  left 590 tests green).
- Per-story browser smoke (lead-side): with a ball in play, the nudge keys visibly disturb the ball's path and the
  build still renders — a headless suite cannot see renderer breakage.

## Auto Run Result

Status: blocked
Blocking condition: intent gap

**The gap.** `epics.md:585-588` (Story 1.7, AC 1) reads "**Given** the ported damped-harmonic cabinet oscillator",
and AD-5 (spine line 116) says "the oscillator is **ported**". No such oscillator exists in this project's pinned,
attributed upstream. Verified against the downloaded tree at the pinned commit: `vpdb/vpx-js @ e8a6d6f` implements
no nudge at all — `lib/vpt/ball/ball-mover.ts:80-83` is `// todo nudge`, `lib/vpt/global-api.ts:124-142` is
`// TODO implement nudge`, and no file in the repository implements a cabinet oscillator, a plumb bob or a tilt
sensor. Our own port carries that hole faithfully at `src/sim/physics/ball/ball-mover.ts:82-85`.

The oscillator the planning artifacts describe is `vpinball/vpinball`'s — which is what the research actually
cited: `research.md:102`'s claim carries source `[3]`, and `research.md:223` resolves `[3]` to
`https://github.com/vpinball/vpinball/tree/master/src/physics`. `src/physics/cabinet/` there holds
`DampedHarmonicOscillator.h`, `CabinetPhysics.*`, `KeyboardNudge.*` and `PlumbHandler.*`. That code is legally
usable — every file needed carries `// license:GPLv3+` as its exact first line, verified in the fetched headers
themselves (the one exception, `NudgeHandler.h`, is unmarked and therefore unusable; it is dispatch-only and
contains no physics) — but **`vpinball/vpinball` is not in this repository**: `ATTRIBUTIONS.md:89` lists it under
"Planned dependencies … Not yet in the repository — record them properly here when they arrive."

Both readings of AC 1 therefore land outside this epic's footprint, so neither is a judgement call this stage may
make:

- **Port it** ⇒ a new third-party source enters the repository, which CLAUDE.md gates absolutely ("Record it in
  `ATTRIBUTIONS.md` first … The entry goes in before the file does"). `ATTRIBUTIONS.md` is a root file, outside the
  footprint. It also needs a pinned commit (none exists) and a third provenance branch in the header regime that
  `test/sim-boundary.test.ts:105-135` and `tools/check-licence-headers.mjs` currently enforce as a closed two-way
  choice — vpx-js port marker XOR DragonWar authored header. Declaring a vpinball-derived file "authored" to avoid
  this would be a false provenance claim.
- **Author it instead** ⇒ contradicts AD-5 (spine line 116), `physics-tuning.md:62` and AC 1's own word "ported",
  i.e. a planning-artifact amendment — also outside the footprint, and Story 1.6's two one-time widenings are
  spent and do not carry forward.

**Recommended amendment (preferred): authorize the vpinball port.** Add one `ATTRIBUTIONS.md` Code-table row
before any file lands —

- Component: `vpinball/vpinball` cabinet-physics port (`src/sim/physics/cabinet/**`)
- Source: `https://github.com/vpinball/vpinball` @ commit `3f838c14bd2e37fb49a0b5aa6a9d76d421846bef` (2026-08-29)
- Author: Visual Pinball development team and contributors, © 2000-2026 (no source file carries a copyright line;
  the root `LICENSE` supplies the holder)
- Licence: **GPL-3.0-or-later**, verified from the `// license:GPLv3+` first line of each file used — not from the
  root `LICENSE` and not from metadata. Files used: `src/physics/cabinet/DampedHarmonicOscillator.h`,
  `CabinetPhysics.{h,cpp}`, `KeyboardNudge.{h,cpp}`, `PlumbHandler.{h,cpp}`. **Excluding `NudgeHandler.h`**, whose
  first line is `#pragma once` and which therefore remains under the repository's non-commercial "old MAME"-like
  default and must not be used.
- Verified: 2026-08-29

…then widen this story's footprint to `ATTRIBUTIONS.md` for that row alone, and let the story add a third
provenance branch (a vpinball port marker) to `test/sim-boundary.test.ts` and `tools/check-licence-headers.mjs` —
both in-footprint. `epics.md` AC 1 needs no wording change under this option, because the oscillator really is
ported; a change-log entry recording *which* upstream and why is still worth adding, since the epic context and
`physics-tuning.md:41-43` currently imply vpx-js is the only port source.

**Why this is preferred over authoring:** it is the option AD-5, `physics-tuning.md:62` and the PRD addendum's
"Port; do not derive" (`addendum.md:150`) all already select, and it converts roughly ten invented physical
constants into transcribed ones with a real `source` and `medium` confidence — cabinet mass 113 kg, X-axis 9.3 Hz
at ζ 0.052, Y-axis 5.8 Hz at ζ 0.055, a 25 ms raised-cosine impulse peaking near 0.5 g, and for the bob a 0.10 m
rod with damping 1.25 + 0.75·|ω| and a 1.0° threshold. Authoring instead would ship all of them `unverified`, in a
story whose whole point is that "nudging without tilt risk is not nudging" — the feel this epic exists to get right.

**The rejected alternative, stated so the lead can weigh it:** amend AD-5, `physics-tuning.md:62` and `epics.md`
AC 1 to drop "ported" and author a damped-harmonic oscillator from first principles, shipping every constant
`unverified` pending Story 1.9's feel ritual. This needs no new third-party source and no attribution row, and it
touches three planning artifacts instead of one root file. It was not chosen because it discards a legally clean,
directly applicable, already-cited reference implementation and contradicts three separate artifacts' explicit
"port; do not derive" instruction.

**Not blocking, decided in this spec (recorded so the lead need not re-litigate them):** Hazard 1 (AC 2's cradle
window) is resolved by nudging well inside Story 1.6's measured 1 s bound and pairing the test with a no-nudge
control run — see `## Design Notes` → "Hazard 1". Hazard 2 (goldens are Story 1.8's) is resolved by building the
minimal test-local deterministic replay assertion and deferring the golden *file* to Story 1.8, following
`test/loop-determinism.test.ts:13-17`'s in-epic precedent — see `## Design Notes` → "Hazard 2". Neither needed an
amendment. The rest of the story (bob, slam counter, key map, both switches) is fully planned above and is
unaffected by the gap: only the oscillator carries the "ported" claim.
