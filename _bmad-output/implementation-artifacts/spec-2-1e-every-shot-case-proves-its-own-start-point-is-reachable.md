---
title: 'Story 2.1e: Every shot case proves its own start point is reachable'
type: 'feature'
created: '2026-09-03'
status: 'done' # draft | ready-for-dev | in-progress | in-review | done | blocked
baseline_revision: 'da48b02eb72534a9ba39712902ff711d31f780fe'
baseline_commit: 'da48b02eb72534a9ba39712902ff711d31f780fe'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1c-the-loop-returns-and-the-inlane-feed.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Top lane 1's release point (110, 900 -- straight-up flipper-band
      approach) is not reached by any witness this story's in-suite or
      dense-sweep search could construct.
    evidence: >-
      Measured closest approach 65.435 mm (tolerance 13.495 mm) via the
      best available witness (a full-strength plunge). Both siblings
      (top-lane-2, top-lane-3) show the same shape (66.562-74.282 mm), and
      the whole cluster is far more likely a limitation of this story's
      single-left-bat witness technique (no right-bat origin exists via
      `bd_shooter`, and no multi-bounce chain was searched) than a genuine
      geometry defect -- top lanes are a basic, expected flipper shot in
      real play. Candidate DW-138 (reserved via `ledger.sh next-id`, not
      written -- Rule 15(a)).
    location: 'test/util/shot-cases.ts (top-lane-1)'
    severity: low
  - summary: >-
      Top lane 2's release point (245, 900) is not reached by any witness.
    evidence: >-
      Measured closest approach 66.562 mm. Same finding class as top-lane-1
      -- see that entry. Candidate DW-138.
    location: 'test/util/shot-cases.ts (top-lane-2)'
    severity: low
  - summary: >-
      Top lane 3's release point (345, 900) is not reached by any witness.
    evidence: >-
      Measured closest approach 74.282 mm. Same finding class as top-lane-1
      -- see that entry. Candidate DW-138.
    location: 'test/util/shot-cases.ts (top-lane-3)'
    severity: low
  - summary: >-
      Pop bumper 1's release point (130, 700) is not reached by any
      witness, while pop bumpers 2 and 3 (same witness family, nearby
      coordinates) ARE reached.
    evidence: >-
      Measured closest approach 32.976 mm. The witness that reaches pop 2
      (3.2 mm) and pop 3 (0.09 mm) misses pop 1 by a wide margin --
      suggests a slightly different flip parameter would close this, not a
      structural block. Candidate DW-138.
    location: 'test/util/shot-cases.ts (pop-bumper-1)'
    severity: low
  - summary: >-
      The descending-release column onto the left slingshot's own
      rebevelled face (col_sling_l, 115, 465) is not reached by any
      witness.
    evidence: >-
      Measured closest approach 51.859 mm. This is a DW-119-bevel
      regression pin (Rework iteration 2, item (e)), not a shot the routing
      map claims is a real player shot -- its own reachability was never
      claimed before this story either. Candidate DW-138.
    location: 'test/util/shot-cases.ts (descend-sling-l)'
    severity: low
  - summary: >-
      The descending-release column onto the right slingshot's own
      rebevelled face (col_sling_r, 350, 465) is not reached by any
      witness.
    evidence: >-
      Measured closest approach 39.979 mm. Same finding class as
      descend-sling-l -- see that entry. Candidate DW-138.
    location: 'test/util/shot-cases.ts (descend-sling-r)'
    severity: low
  - summary: >-
      The descending-release column onto the left Dragon leg
      (col_dragon_leg_l, 120, 660) is not reached by any witness.
    evidence: >-
      Measured closest approach 32.706 mm. Same DW-119-bevel-pin shape as
      descend-sling-l -- see that entry. Candidate DW-138.
    location: 'test/util/shot-cases.ts (descend-dragon-leg-l)'
    severity: low
  - summary: >-
      The descending-release column onto the right Dragon leg
      (col_dragon_leg_r, 220, 660) is not reached by any witness, and sits
      JUST outside tolerance.
    evidence: >-
      Measured closest approach 15.533 mm against the 13.495 mm tolerance
      -- a 2.038 mm shortfall, the closest miss in the whole unreachable
      set. Very likely resolves with a slightly different flip parameter;
      flagged for priority re-search over the rest of this cluster.
      Candidate DW-138.
    location: 'test/util/shot-cases.ts (descend-dragon-leg-r)'
    severity: low
  - summary: >-
      The descending-release column onto the Ramp left wall
      (col_ramp_wall_l, 332, 880) is not reached by any witness.
    evidence: >-
      Measured closest approach 68.446 mm. Sits inside the bottom-right
      corridor DW-137 already documents as unreachable from below -- likely
      the SAME root cause, not a new one; Story 2.1f's corridor re-solve is
      the natural place this resolves. Candidate DW-138 if it does not.
    location: 'test/util/shot-cases.ts (descend-ramp-wall-l)'
    severity: low
  - summary: >-
      The descending-release column onto the Ramp right wall cap
      (col_ramp_wall_r, 376, 758) is not reached by any witness.
    evidence: >-
      Measured closest approach 46.901 mm. Same DW-137-corridor-adjacent
      finding as descend-ramp-wall-l -- see that entry. Candidate DW-138.
    location: 'test/util/shot-cases.ts (descend-ramp-wall-r-cap)'
    severity: low
  - summary: >-
      The descending-release column onto the Ramp top turn cap
      (col_ramp_turn, 360, 895) is not reached by any witness.
    evidence: >-
      Measured closest approach 59.450 mm. Same DW-137-corridor-adjacent
      finding as descend-ramp-wall-l -- see that entry. Candidate DW-138.
    location: 'test/util/shot-cases.ts (descend-ramp-turn-cap)'
    severity: low
  - summary: >-
      The descending-release column onto the Ramp return rail
      (col_ramp_return_1, 396, 800) is not reached by the in-suite witness
      set, though the dense out-of-process sweep's own wider grid found a
      closer (but still short) approach.
    evidence: >-
      In-suite closest approach 25.987 mm; the dense sweep's own broader
      grid (test/fixtures/reachability/reachability-sweep.harness.ts)
      found 16.381 mm via a plunge-strength recipe not among the 9
      in-suite witnesses -- still over the 13.495 mm tolerance, but the
      gap is narrowing under a wider search. Same DW-137-corridor-adjacent
      family as descend-ramp-wall-l. Candidate DW-138.
    location: 'test/util/shot-cases.ts (descend-ramp-return-rail)'
    severity: low
  - summary: >-
      The descending-release column onto DRAGON bank target col_dragon_d
      (240, 750) is not reached by any witness, while its mirror
      (col_dragon_n, 310, 750) IS reached by the same witness family.
    evidence: >-
      Measured closest approach 25.841 mm. The asymmetry (col_dragon_n
      reachable at 11.2 mm, col_dragon_d not) suggests the witness family
      that reaches the DRAGON bank's right side needs a mirrored or
      differently-timed variant for the left side, not a structural block.
      Candidate DW-138.
    location: 'test/util/shot-cases.ts (descend-dragon-d)'
    severity: low
---

<intent-contract>

## Intent

**Problem:** `driveShot()` (`test/shot-routing.test.ts:226`) **teleports** the ball to each case's release point, so every case proves only what happens *after* that placement, never that the placement is reachable. Story 2.1c closed the "not inside a body or a zone" half with `assertReleaseClear()` (`:369`); the other half -- **can a real ball ever get there** -- is still unasked, and `DW-137` is the second real defect to walk through it. The Ramp channel is unreachable by any shot from below (a ball approaching cannot push its centre past x 300.505 while entering the channel needs x >= 351.495: a **50.990 mm** shortfall, and **256 swept releases close `s_ramp_enter` zero times**), yet the Ramp case passes, because the harness teleports the ball into a ~2 mm slot above the right slingshot. Two full code-review passes and the original implementation all missed it. The same blind spot has a dimensional twin, `DW-130`: `col_guide_inlane_feed_r` can be shifted 20 mm -- measured at -20/+20/+40/+60 -- with all 38 routing cases green, because no case's ball ever touches it (closest approach 13.515 mm against a 13.495 mm radius: **0.020 mm short of contact**).

**Approach:** Make the release point a first-class, enumerable declaration rather than a literal buried in a call site, then prove each one against real trajectories. Every case moves into one **manifest** that is the only source of a release point, so `test/shot-routing.test.ts` can no longer drive a coordinate that the reachability check has not seen. A small set of named **witness trajectories** -- real balls launched from the plunge or off a bat through the real physics pipeline, never teleported -- is replayed in the default suite, and each case must be within a stated tolerance of its own declared witness's swept path or be declared unreachable against its owning ledger entry with its measured closest approach. The expensive part -- the dense search that discovers a witness and, harder, **proves a negative** -- runs out of process behind `pnpm check:reachability`, the same shape as `check:ad7` and `check:corridor` but intended **green**. This story changes no geometry.

## Boundaries & Constraints

**Always:**

- **Every measurement is taken against the real physics pipeline and recorded.** A dimensional check is never the evidence for a reachability claim -- the epic has lost two iterations to dimensional designs that never routed a ball, and `test/fixtures/dw137-corridor/ramp-corridor.harness.ts` is deliberately a *restatement* of a physics result, not a substitute for one.
- **A witness trajectory never teleports.** Its ball is served by `c_trough_eject` and reaches its origin by the real input path: `frame.plunger` held and released (`src/sim/physics/plunger.ts:70-90`), or `frame.flipper_l`/`frame.flipper_r` held against a ball the machine itself delivered (AD-5, AD-6). Every witness's parameters are recorded so the trajectory is replayable and deterministic (AD-3: one clock, no unseeded randomness).
- **Reachability is measured against the ball's per-tick swept SEGMENT, never its end position** (AD-11's own model for `sw_` zones). The metric is the distance from a release point to the nearest swept segment of a witness's path.
- Table frame, millimetres, right-handed, origin bottom-left (AD-10). `TABLE.reference.ballMm = 26.99`, radius **13.495**. The reachability tolerance is derived from that radius and its derivation is written at the constant, matching `RELEASE_CLEAR_MARGIN_MM`'s existing convention (`test/shot-routing.test.ts:318`).
- **A case declared unreachable keeps its release point, its speed, its direction, its tick budget and every one of its assertions byte-identical.** It is marked against its owning ledger entry with the measured closest approach -- never deleted, weakened, skipped, or re-pointed at somewhere a ball can reach.
- Non-ASCII in source is authored as an escape sequence, never a literal byte (Rule 14).
- Device names enter through `src/sim/table/dragonwar.ts` only (AD-16) -- `test/**` is explicitly exempt from that lint, so the manifest may name `SwitchName` values directly.
- New `test/util/*.ts` and `test/*.test.ts` files are covered by `tsconfig.node.json` (`include: ["test/**/*.ts", ...]`); `test/fixtures/**` is **excluded** from typecheck, so a harness file there has no compiler safety net -- the same known gap `test/ad7-device-slots.test.ts:12` documents.

**Block If:**

- **A case the committed suite demonstrably drives a real ball through is nonetheless found unreachable.** The plunge's own measured switch sequence closes `s_loop_l_out` then `s_loop_l_in` then `s_inlane_l`, so a ball genuinely traverses the Left Loop lane at the Loop entry band. If the search cannot find a witness for the Left or Right Loop entry release points, the tolerance or the witness construction is wrong, not the geometry: fix the instrument, do not record a false unreachable verdict. If it still cannot be resolved, HALT with the traces.
- **The in-suite reachability file cannot be brought under 10 s of self-time** without weakening the proof. Test files run in parallel (measured: 88 files, 151 s of cumulative test time in 32.9 s wall on 8 CPUs), so a file under ~10 s is absorbed; beyond that it becomes the suite's critical path and every run pays. If the honest witness set cannot fit, HALT and report the measured cost rather than trimming the proof to fit or moving the whole check out of the default suite (which would make it opt-in, and AC 1 requires a new case to inherit the guarantee without opting in).
- **Closing DW-137, DW-136 or the corridor.** Measuring and recording the Ramp's unreachability is this story's work; re-solving the corridor is **Story 2.1f's**, and `pnpm check:corridor` must still exit 1.
- **A change to `assertReleaseClear()`'s existing behaviour, or to any release point's coordinates, would be needed to make a case reachable.** Moving a release point to a reachable spot is exactly the "quietly re-pointed" failure AC 2 forbids: HALT rather than move one.
- The refactor cannot preserve `test/shot-routing.test.ts`'s driven behaviour -- a case's speed, direction, tick budget, `switchesUnderTest` or assertion set would have to change to make the manifest work. HALT: the manifest is a re-expression, not a re-authoring.

**Never:**

- **Never move, add or remove geometry.** No edit to `tools/make-placeholder-blend.py`, no Blender run, no `pnpm export:assets`, no change to `assets/src/dragonwar.blend`, `public/assets/dragonwar.glb` or `public/assets/dragonwar.collision.json`. This story needs none, and touching any of them moves `assetHash` and re-records all five goldens (AD-6's own batching note) for no benefit.
- Never touch `DW-70` / `pnpm check:ad7`. It exits 1 **by design** naming `AD-7`, `DW-70`, `bd_trough`; a green run is a regression (Story 2.5 owns it).
- Never touch `pnpm check:corridor` / `test/dw137-corridor-gate.test.ts` / `test/fixtures/dw137-corridor/**`. Also intended-red, owned by Story 2.1f.
- Never touch `NOTICE`'s vpinball claim (`DW-82`, Story 6.7) or the `flipperTipGapMm` provenance wording (`DW-113`, Story 2.5).
- Never delete, skip or weaken a test, and never add a `.skip`, an `it.fails()` or a Blender-gated case (the last would move `test/export-py-skip-visibility.test.ts`'s `expectedSkips` formula for no reason).
- Never declare `TABLE.shots` -- it stays exactly `{}` (Story 2.4, AD-19).
- Never change `TICK_HZ` or a solver constant (AD-3, AD-15).
- Never add a third-party dependency, asset or code fragment. Provenance is a hard gate (`CLAUDE.md`) and this story needs nothing new.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| A reachable case, proven | a manifest case declaring `witness: <id>`; that witness replayed through `createMachine()` from a plunge or a bat | the witness's swept path passes within `REACHABILITY_TOLERANCE_MM` of the release point; the case's verdict is `reachable` | failure names the case id, the witness id, the measured closest approach and the tolerance |
| A case no witness reaches | the Ramp case's release point `(355, 465)`, declared `unreachable` with `ledger: 'DW-137'` and its measured `closestApproachMm` | the gate passes on the recorded baseline **and** re-asserts the miss: no witness comes within tolerance | if a witness *does* reach it, the gate fails -- the baseline may not rot in either direction, and a genuinely-fixed case must be re-declared (Story 2.1f) |
| A new case added later | a new entry appended to `SHOT_CASES` with neither a `witness` nor an `unreachable` declaration | the gate fails naming the new case id and stating that every case must declare one or the other | there is no default and no opt-out; a release point cannot be driven at all without a manifest entry, because `driveCase(id)` is the only entry point |
| Vacuous pass -- zero cases evaluated | the manifest empties, fails to load, or a filter silently excludes everything | the gate fails loudly on the case-count floor (`SHOT_CASES.length >= MIN_SHOT_CASES` and `evaluated === SHOT_CASES.length`), never reports success | a run that evaluated nothing is a failure, not a pass |
| Vacuous pass -- a dead witness | a witness whose ball never launched (no serve, a flip that misses, zero motion) yields an empty or trivial path | the corpus-health gate fails naming that witness, before any `unreachable` verdict is honoured -- an empty corpus would otherwise make every miss look "confirmed" | asserts a minimum swept-segment count, a minimum cumulative path length, and at least one expected switch closure per witness |
| `DW-130` -- the feed rail moves | `col_guide_inlane_feed_r` shifted 20 mm in the committed collision document | the per-side feed-rail proximity record goes red: the measured closest approach of the driven trajectory to that body's `footprintMm` has moved outside the recorded band | this is the behavioural falsifier that did not exist before; the recorded margin is measured, not invented |
| `DW-130` -- the feed rail deleted | `col_guide_inlane_feed_r` absent from the committed document | a named failure -- "the feed-rail proximity record cannot be evaluated: node absent" | must NOT be an opaque top-level `nodeBboxMm()` throw at import that fails the whole file for the wrong reason |
| The dense sweep proves a negative | `pnpm check:reachability` over a swept release/aim/speed grid | exit 0, reporting per-case verdicts and the number of releases actually evaluated | a sweep that evaluated zero releases exits non-zero on its own floor rather than reporting success |
| Geometry moved under a recorded number | a later story moves a body the recorded closest approaches depend on | the in-suite gate re-measures every number from live witnesses each run, so a moved body changes the measurement and the gate fails rather than describing geometry that no longer exists | no frozen corpus artifact is committed -- see Design Notes, "Why nothing is cached to disk" |

</intent-contract>

## Code Map

Read at HEAD `27ed299e3b4bbbeba0b87f383e41dd018324f7a2` (tree clean, branch `DW-1-epic2`). Story 2.1c's Code Map is a superset for everything this story does not touch. **No geometry file is read for authoring here -- only the committed collision document, read-only.**

**The subject -- `test/shot-routing.test.ts` (1005 lines, 15 `describe`, 38 `it`, 39 `driveShotChecked()` calls at 36 distinct release points)**

- `:226-301` **`driveShot(startMm, speedMmPerS, dirDeg, ticks)`** -- 320 warm-up ticks pulsing `c_trough_eject` at `i === 0` (`:231-234`), then `:241` **teleports** `ball.state.pos`, `:242` `speedVuPerT = speedMmPerS / (MM_PER_VU * 100)`, `:248` `ball.hit.vel.set(vTableX, -vTableY, 0)`, `:249-250` zeroes `angularVelocity` **and** `angularMomentum`. Measured: the 320-tick warm-up buys nothing for a teleport (every field it settles is overwritten) and costs ~5 ms per call.
- `:369-400` **`assertReleaseClear(startMm, switchesUnderTest)`** -- the half Story 2.1c closed: fails if the release point is within `RELEASE_CLEAR_MARGIN_MM` of any `col_` footprint (`DW-77`) or inside a `sw_` zone the case asserts (`AD-2` latches a make on the tick it is first observed).
- `:318` `RELEASE_CLEAR_MARGIN_MM = TABLE.reference.ballMm / 2` -- **the derivation convention this story's tolerance follows.**
- `:320-357` `pointToSegmentDistanceMm()`, `pointInPolygon()`, `distanceToPolygonMm()` -- private today; both new consumers need them.
- `:403-412` **`driveShotChecked(startMm, speed, dirDeg, ticks, switchesUnderTest)`** -- the single guarded entry point. **This is the seam the manifest replaces.**
- `:132-149` `ShotResult`; `:103-130` `Terminal` + `classifyTerminal()`; `:186-191` `FLIPPER_BAND_L/_R`, whose `yMax` reads `nodeBboxMm('col_guide_inlane_feed_l'/'_r').min.y` **at module top level** -- so deleting either node fails the whole file at import with a `nodeBboxMm()` throw, not a behavioural red (`DW-130` relevance).
- `:457-463` `assertNotStranded`; `:475-482` `assertReachesFlipperBand(result, label, side)` (side now required); `:492-497` `assertNotStillInPlay`; `:504-515` `assertOrbitOrder`; `:643-668` `assertLoopMissOutcome`.
- **The 36 release points, by block** (all `z: 13.5`): `:544` Left Loop orbit x 28/31/34 y 415 @2200/0deg/9000t; `:583` Right Loop mirrored `laneX0Mm - 28/31/34`; `:600` DW-123 orbit `laneX0Mm - 31`; `:677` off-column x 18/45/`laneX0-18`/`laneX0-45` y 415; `:690` Left Loop x 31 y 415 @**1200**; `:734` **Ramp (355, 465) @2400/9000t -- the `DW-137` case, release point already documented unreachable at `:708-733`**; `:779` centre drain (257.2, 200) @1/6600t; `:798` Dragon body (140, 380) @1500; `:824`+`:828` Lock lane (170, 380) @1600, **two drives, budgets 500 and 5000**; `:852` DRAGON bank (294, 400) and (300, 400) @1600; `:878` Top lanes (110/245/345, 900) @1500/6600t; `:895` slingshots (115, 370) dir -10 and (350, 370) dir +10 @1200; `:917` pops (130, 700), (200, 700), (180, 770) @1000/6600t; `:1002` **twelve descending-drop columns** @1/6600t: (115, 465), (350, 465), (120, 660), (220, 660), (332, 880), (376, 758), (360, 895), (396, 800), (240, 750), (310, 750), (150, 1035), (300, 1035).
- `:538` `laneX0Mm = nodeBboxMm('col_wall_lane').min.x` -- three release points are derived from it, so the manifest must carry derived expressions, not frozen floats.

**The machine and the two real origins**

- `src/sim/physics/machine.ts:140` `createMachine(collisionDoc, tuning): Machine`; `:87` `step(tick, frame: InputFrame, commands: readonly CoilCommand[]): MachineStepResult`; `:73-84` result carries `switchEvents`; `:89` `balls` is the live array. `CoilCommand` = `{ type: 'coil', coil, action: 'pulse'|'enable'|'disable', tick }` (`src/sim/contracts/commands.ts:12-17`). `InputFrame` = `Readonly<Record<InputAction, boolean>>` over the closed 8-member union (`src/sim/contracts/input.ts:12-27`); `NO_FRAME` at `src/sim/loop/index.ts:73-82`.
- **Plunge origin** -- `src/sim/physics/plunger.ts:59` `createPlungerMechanics`, `:70` reads `frame.plunger`, `:90` calls `deviceMechanics.launch()` on the **falling edge**. Full strength = hold >= `plungerMaxHoldMs` 500 (`src/sim/table/tuning.ts:258-261`, scale 0.3 -> 1.0, full = `autolaunchSpeedMmPerS` 2500 at `:299`). Canonical recipe: `test/replays/full-plunge.golden.json` (eject@1, `plunger:true`@21, `plunger:false`@542). **Measured full plunge through `createMachine`: 4276 ticks in 169 ms, makes `s_shooter_lane`@1, `s_loop_l_out`@1975, `s_loop_l_in`@2558, `s_inlane_l`@3198, `s_drain`@4224, `s_trough_4`@4276** -- i.e. the default plunge is itself an orbit that traverses the Left Loop lane and delivers to the **left** inlane and bat. That single trajectory is a strong witness candidate for the Left Loop entry band, the top lanes and the left inlane.
- **Bat origin** -- `src/sim/physics/flippers.ts:154-164`: a bat is driven **only** by `frame.flipper_l`/`frame.flipper_r`; `c_flipper_*` coil commands only `enable`/`disable`. There is no pulse path to a bat. Existing call shapes: through the real machine, `test/hop-machine-step.test.ts:161,171` (`machine.step(tick, { ...NO_FRAME, flipper_l: true }, [])`); mechanics-level, `test/flipper-collision.test.ts:128-133`. **`arrangeCradleBall()` at `test/flipper-collision.test.ts:122-170`** is the proven physics-only recipe for getting a ball onto a raised bat (60 + 2500 ticks, asserts the bat is fully raised first and that the ball settled). Flipper-leg maximum ball speed **2085.54 mm/s** (`test/util/max-speed.ts`).

**Reusable helpers**

- `test/util/collision-doc.ts` -- `:69` `readCollisionDoc()` (parse-once, deep-frozen, cached; motivated in its own header by the 60 s per-case timeout), `:77` `nodeBboxMm(name)` (throws naming the node), `:85` `switchZoneMm(name)`. Node records carry `shape: 'plane'|'wall'|'box'` and `footprintMm?`.
- `test/util/max-speed.ts` -- `MEASURED_PLUNGE_MAX_MM_PER_S = 2497.92`, `MEASURED_MAX_SPEED_MM_PER_S = 2547.8784`. The precedent for a **measured literal frozen in source with a staleness pin** (`test/switch-max-speed.test.ts:156-162` pins it against live `TUNING`).
- `src/sim/table/frames.ts:51` `MM_PER_VU = 0.53975`; mm/s -> VU/T is `/ 53.975`, table +y flips to physics -y.
- `src/sim/physics/geometry.ts:29-57` `segmentIntersectsBox()` -- inclusive slab bounds.
- `src/sim/physics/switches.ts:138-143` -- a make **latches on the tick it is first observed**; `settleTicks` gates the break only (AD-2 `[AMENDED 2026-09-01, DW-67]`).

**The intended-red / out-of-process precedent this story mirrors (but inverts to green)**

- `test/fixtures/dw70-ad7/ad7-device-slots.harness.ts` + `vitest.harness.config.ts` + `test/ad7-device-slots.test.ts` (`check:ad7`); `test/fixtures/dw137-corridor/ramp-corridor.harness.ts` + config + `test/dw137-corridor-gate.test.ts` (`check:corridor`); `test/fixtures/solver-termination/wedge.harness.ts`. Three live instances. A `*.harness.ts` never matches `vitest.config.ts`'s `include: ['test/**/*.test.ts']` and `tsconfig.node.json`'s `exclude: ["test/fixtures/**"]` keeps it out of typecheck.
- `test/fixtures/dw137-corridor/ramp-corridor.harness.ts:81-112` is **pure static bbox arithmetic** -- `col_sling_r.min.x - r = 300.505` vs `col_ramp_wall_l.max.x + r = 351.495`, shortfall **50.990** -- a sufficient-condition restatement of the 256-release sweep, which **was never committed as code** (`git log --all -S "256 swept"` finds only prose and comments; no sweep source file has ever existed in this repository). **This story builds the sweep that did not survive.**
- `package.json:23-24` -- `check:ad7` and `check:corridor`, each `vitest run --config <nested config>`. Thirteen scripts today, enumerated with their counts in `AGENTS.md:21`.

**Measured cost model (this planning pass, on this host: 8 CPUs)**

- **~33.3 us per `machine.step()` tick with one live ball** (0 balls 6.30 us; 2 balls 59.45 us). `createMachine()` = 5.5 ms warm / 20.8 ms cold.
- `vitest.config.ts:19` `testTimeout: 60_000` **per case** -> **~1.80 million ticks per case**.
- `npx vitest run test/shot-routing.test.ts` -> **38 passed, 5.02 s** (tests 4.24 s; slowest case 248 ms).
- One full plunge-to-drain trajectory = ~4300 ticks ~= **145-170 ms**. A bat witness chained off a plunge (~2600 arrange or ~3300 delivered + flip + ~4000 flight) ~= **220-300 ms**.
- **Files run in parallel** (no `pool`/`poolOptions`/`maxWorkers` anywhere): full suite 88 files, 1199 passed + 22 skipped, cumulative test time 151 s, **wall 32.93 s**. A new file under ~10 s of self-time is absorbed; beyond that it becomes the critical path.
- Sweep precedents: `test/drain-routing.test.ts` 35 physics runs, file ~2.6 s; `test/vertical-containment.test.ts` 5 sweeps of 4000 ticks, ~0.9 s; `test/spike-1.test.ts` a single 4855 ms case.

**Read-only evidence**

- `col_flipper_r` (277.525, 57.5)-(356.9, 82.5); `col_guide_inlane_feed_r` (**356**, **110**)-(416.4, 165); `col_flipper_l` (157.5, 57.5)-(236.875, 82.5); `col_guide_inlane_feed_l` (52, **103**)-(175, 165). So `FLIPPER_BAND_R` = x [277.525, 356.9] y [82.5, 110]; `FLIPPER_BAND_L` = x [157.5, 236.875] y [82.5, 103].
- **`DW-130`, measured at Story 2.1c code review pass 3**: all three Left Loop orbit shots (the cases that assert `side: 'r'`) come within **13.515 / 13.566 / 13.589 mm** of `col_guide_inlane_feed_r`'s polygon against a 13.495 mm radius -- margins of **0.020 / 0.071 / 0.094 mm**, i.e. never contact. The left mirror **contacts by 0.006 mm**. Shifting the right rail -20/+20/+40/+60 mm leaves all 38 routing cases green. The dimensional gate that does catch +20 is `test/asset-contract.test.ts:664-678`, and it passes today by only **0.9 mm** (`feedR.min.x` 356.0 against `col_flipper_r.max.x` 356.9); a **-20 mm** (westward) shift keeps `feedR.min.x` = 336 inside that gate's window, so the westward direction may be entirely ungated today -- **measure it, do not assume it**.
- Suite baseline at HEAD: **88 files / 1221 passed / 0 failed** with `BLENDER` exported; **1199 passed / 22 skipped** without. `pnpm check:ad7` exits 1; `pnpm check:corridor` exits 1 naming `DW-137`, `2.1f`, `50.990`.
- The spine has **zero** occurrences of `reachab`, `teleport` or `driveShot` anywhere in the architecture folder. "orbit exits feed the flippers" and Lawlor's miss test live in the spine's `## Deferred` (line 366) as acceptance carried from the brief, bound by no AD -- see Design Notes' Rule 20 candidates.

## Tasks & Acceptance

**Execution:**

**Phase 1 -- make the release point enumerable. Nothing in Phase 2 can be a property of the harness until this lands.**

1. `test/util/plan-geometry.ts` (new) -- move `pointToSegmentDistanceMm()`, `pointInPolygon()` and `distanceToPolygonMm()` verbatim out of `test/shot-routing.test.ts:320-357` and export them, with their existing doc comments. Both new consumers and the existing `assertReleaseClear()` need them; nothing about their behaviour changes.
2. `test/util/shot-cases.ts` (new) -- **the manifest: the single source of truth for every release point.** Export a `ShotCase` type and a `SHOT_CASES` array with one entry per driven case, each carrying: a stable `id` (kebab-case, e.g. `left-loop-orbit-28`, `ramp-return-geometry`, `descend-ramp-wall-r-cap`), a human `label`, `startMm` (`{x, y, z}` -- derived expressions such as `laneX0Mm - 28` stay derived, not frozen to floats), `speedMmPerS`, `dirDeg`, `ticks`, `switchesUnderTest`, and a **`reachability`** field that is either `{ kind: 'reachable', witness: <WitnessId> }` or `{ kind: 'unreachable', ledger: 'DW-<n>', closestApproachMm: <measured>, note: <one line> }`. There is no third state and no default. Export `shotCase(id)` throwing naming the id, and `MIN_SHOT_CASES` -- the count recorded at implementation time. Transcribe all 39 driven cases from the Code Map's block-by-block list **without changing a single driven parameter**; the two cases sharing `(170, 380)` at budgets 500 and 5000 are two entries.
3. `test/shot-routing.test.ts` -- **replace `driveShotChecked(startMm, ...)` with `driveCase(id)`**, which looks the case up in `SHOT_CASES`, runs `assertReleaseClear()` against the manifest's own `switchesUnderTest`, and drives it. Remove every release-point coordinate literal from this file; `driveShot()` stays module-private and gains no exported free-coordinate form, so a release point cannot be driven without a manifest entry. Import the three helpers from task 1. **Every `describe`, `it` title, assertion, tolerance and message stays as it is** -- this is a re-expression of where the numbers live, not a re-authoring. Drop the 320-tick warm-up only if the run stays byte-identical in outcome; if in any doubt, leave it (it is not this story's saving to bank).

**Phase 2 -- the witnesses and the in-suite proof.**

4. `test/util/reachability.ts` (new) -- **the reachability engine.**
   - `REACHABILITY_TOLERANCE_MM = TABLE.reference.ballMm / 2` (13.495), with a comment stating the derivation ("the release point lay inside the swept body of a real ball") in the shape of `RELEASE_CLEAR_MARGIN_MM`'s own.
   - A `WITNESSES` table of named origin trajectories. Each witness declares its origin -- `plunge` (serve, hold `frame.plunger` for a recorded tick count, release) or `bat_l` / `bat_r` (the ball is delivered to that bat by the machine itself, then `frame.flipper_*` is held at a recorded tick) -- plus every parameter needed to replay it, and a tick budget. **No witness teleports a ball.** Prefer chaining a bat witness off a plunge witness (the measured plunge already delivers to `s_inlane_l` at tick 3198 and thence to the left bat); `arrangeCradleBall()`'s recipe (`test/flipper-collision.test.ts:122-170`) is the proven fallback for placing a ball on a raised bat by physics alone. Which chain reaches which region is **empirical -- measure it, and record the parameters you measured**.
   - `witnessPath(id)` -- replays a witness through `createMachine()` and returns its per-tick swept segments (`{ fromMm, toMm }` pairs) plus the switches it closed and its cumulative path length. Memoised per test process, so a witness referenced by ten cases is replayed once.
   - `closestApproachMm(startMm, witnessId)` -- the minimum distance from the release point to any of that witness's swept segments, via `pointToSegmentDistanceMm()`. `closestApproachOverAll(startMm)` -- the same across every witness, returning the winning witness id, for failure messages and for the unreachable verdict.
   - `assertWitnessCorpusHealthy()` -- per witness: at least `MIN_WITNESS_SEGMENTS` swept segments, at least `MIN_WITNESS_PATH_MM` of cumulative travel, and at least one of its own declared expected switch closures. Each constant carries the measured value that chose it.
5. `test/shot-reachability.test.ts` (new) -- **the in-suite gate.** In order:
   - **Anti-vacuity first**: `expect(SHOT_CASES.length).toBeGreaterThanOrEqual(MIN_SHOT_CASES)` and `MIN_SHOT_CASES > 0`; then `assertWitnessCorpusHealthy()`. Neither an unreachable verdict nor a pass may be honoured before both hold, because an empty corpus makes every miss look confirmed.
   - **Declaration completeness**: every `SHOT_CASES` entry declares `reachable` with a `witness` present in `WITNESSES`, or `unreachable` with a `ledger` matching `/^DW-\d+$/`, a finite `closestApproachMm` and a note. Anything else fails naming the case id.
   - **Per case, both directions** (`it.each` over the manifest, so a new case is covered the moment it is added): a `reachable` case's declared witness must come within `REACHABILITY_TOLERANCE_MM` of its release point; an `unreachable` case must be missed by **every** witness by more than the tolerance, and its recorded `closestApproachMm` must agree with the live measurement within a stated band. Failure messages name the case id, the witness id, the measured closest approach and the tolerance -- AC 1's "naming the case and the closest approach achieved".
   - **Evaluation count**: assert the number of cases actually evaluated equals `SHOT_CASES.length`.
   - **The harness cannot be bypassed**: read `test/shot-routing.test.ts`'s own source and assert it contains no `driveShot(` call site and no release-point coordinate literal outside the manifest import -- the structural guarantee behind "a new case inherits it without opting in", in the shape of the repo's existing source-reading gates.
6. `test/shot-reachability.test.ts` -- **`DW-130`: the feed-rail proximity record.** For each side, drive the manifest cases whose criterion requires that side's flipper arrival and record the **minimum distance from the driven ball's own swept path to `col_guide_inlane_feed_l`/`_r`'s `footprintMm`**, minus the ball radius, i.e. the contact margin. Assert each side's margin within a stated band of the value measured at implementation time (expected: left contacts by ~0.006 mm; right clears by ~0.020 mm). Look the node up defensively so an absent node fails naming it ("the feed-rail proximity record cannot be evaluated: `col_guide_inlane_feed_r` is absent from the committed document") rather than as an opaque import-time `nodeBboxMm()` throw. This is the behavioural falsifier `DW-130` says does not exist: the margin is measured from a real driven trajectory, so it moves when the body moves **or** when the trajectory changes -- strictly more sensitive than a dimensional gate.

**Phase 3 -- the negative proof, out of process.**

7. `test/fixtures/reachability/reachability-sweep.harness.ts` (new) -- **the dense search that proves a negative**, mirroring `test/fixtures/dw137-corridor/ramp-corridor.harness.ts`'s file shape and header conventions but **intended green**. It sweeps origin parameters (plunge strength; bat side, delivery and flip tick) far more densely than the in-suite witness set, accumulates the union of swept paths, and reports for **every** `SHOT_CASES` entry the best closest approach found and the parameters that found it. It asserts: each `reachable` case is reached; each `unreachable` case is missed by every release in the sweep; and -- the anti-vacuity floor -- that the number of releases actually evaluated is at least a declared minimum, so a sweep that ran nothing exits non-zero instead of reporting success. Its header states that its output is what a later story reads to move a case from `unreachable` to `reachable`, and that `DW-137`/`DW-136` are **not** its to fix. Keep its runtime within a stated budget and record the measured figure.
8. `test/fixtures/reachability/vitest.harness.config.ts` (new) -- `include: ['test/fixtures/reachability/**/*.harness.ts']`, mirroring the two existing nested configs verbatim in shape.
9. `package.json` -- add `"check:reachability": "vitest run --config test/fixtures/reachability/vitest.harness.config.ts"` beside `check:ad7` and `check:corridor`. **No in-suite wrapper test** -- unlike those two, this check is intended **green**, so a wrapper would either run the dense sweep inside `pnpm test` (defeating the point) or assert a failure that must not happen. State that reasoning in the harness header.
10. `AGENTS.md:21` -- update the script count from thirteen to fourteen, add `check:reachability` to the enumerated list, and add one sentence distinguishing it: opt-in and **intended green** (a real check kept out of `pnpm test` for cost), as against `check:ad7` and `check:corridor`, which are intended red and each carry an in-suite wrapper.

**Phase 4 -- record the baseline.**

11. `_bmad-output/implementation-artifacts/spec-2-1e-every-shot-case-proves-its-own-start-point-is-reachable.md` (`## Spec Change Log`) -- **record the verdict for every case** as a table: case id, release point, verdict, closest approach, witness id or ledger id. This is AC 2's deliverable and it is a measured fact, not a summary. Record the witness set with its parameters, the measured runtime of both the in-suite file and the dense sweep, and the `DW-130` margins for both sides. Run every command in `## Verification` and record each result; demonstrate every mutation below (applied, red observed, reverted, tree confirmed byte-identical via `git status --short` and `git diff --stat`).
12. `_bmad-output/implementation-artifacts/spec-2-1e-every-shot-case-proves-its-own-start-point-is-reachable.md` (frontmatter `deferred:`) -- **every case the search proves unreachable that is not already `DW-137`** gets an entry there with its measured closest approach, its location and a severity, for the lead to harvest into the ledger (Rule 15(a): `bmad-build-auto` never writes the ledger). Expect candidates among the twelve descending-drop columns -- `(376, 758)` sits in the Ramp channel band and `(396, 800)` on the Ramp return rail, both inside the corridor `DW-137` says no ball enters. Also file the residual on `DW-130` if task 6's record does not fully close it, stating precisely what remains.

**Acceptance Criteria:**

- **AC 1** -- **Given** a shot case that declares a release point, **when** `test/shot-reachability.test.ts` runs, **then** the harness proves that release point reachable by replaying a named witness trajectory whose ball originated at a plunge or at a bat through the real physics pipeline and came within `REACHABILITY_TOLERANCE_MM` of it, **and** a case no witness reaches fails naming the case id and the closest approach achieved, **and** the proof iterates the shared manifest rather than living in each case, so a case appended to `SHOT_CASES` is checked without opting in and a release point cannot be driven at all without a manifest entry.
- **AC 2** -- **Given** the committed geometry, **when** the reachability check is applied to every existing case, **then** each case's verdict is recorded in this spec's `## Spec Change Log` with its measured closest approach -- which are genuinely reachable and which (the Ramp, per `DW-137`) are not -- **and** every unreachable case keeps its release point, speed, direction, tick budget and assertions byte-identical, marked in the manifest against its owning ledger entry, **and** the gate fails if a case declared unreachable is in fact reached or a case declared reachable is not, so the baseline cannot rot in either direction.
- **AC 3** -- **Given** Rule 19, **when** the check ships, **then** moving one genuinely-reachable case's release point into a region no ball reaches turns `test/shot-reachability.test.ts` red naming that case and its closest approach, reverted with the tree byte-identical, **and** the check cannot pass vacuously: a run in which the manifest is empty, fewer than `MIN_SHOT_CASES` cases were evaluated, or any witness produced a dead trajectory fails loudly rather than reporting success.
- **AC 4 (Integration -- Rule 1)** -- **Given** `test/util/shot-cases.ts` as the sole source of every release point, **when** `test/shot-routing.test.ts` drives its cases from it, **then** the file still reports **38 passed** with every driven parameter, assertion and message unchanged in effect, **and** editing one manifest entry's `speedMmPerS` changes what that routing case actually drives -- so the manifest is the real input to the consumer, not a parallel description of it.
- **AC 5 (`DW-130`)** -- **Given** the driven trajectories of the cases that assert a flipper arrival, **when** the feed-rail proximity record runs, **then** the measured contact margin to `col_guide_inlane_feed_l` and `col_guide_inlane_feed_r` is asserted within a stated band of its recorded value, **and** shifting `col_guide_inlane_feed_r` 20 mm in the committed collision document turns that assertion red -- the behavioural falsifier that did not exist when `DW-130` was filed -- **and** an absent node fails naming it rather than throwing opaquely at import.
- **AC 6** -- **Given** the dense out-of-process sweep, **when** `pnpm check:reachability` runs, **then** it exits **0**, reports the per-case verdicts and the number of releases actually evaluated, and fails non-zero if that number falls below its declared floor, **and** `AGENTS.md` documents it as the fourteenth script, opt-in and intended green, distinguished from the two intended-red checks.
- **AC 7** -- **Given** the whole suite, **when** it runs, **then** it is at or above **88 files / 1221 passed / 0 failed** with `BLENDER` exported and **1199 passed / 22 skipped** without, with the 22 skips unchanged, no test deleted, skipped or weakened, `pnpm check:ad7` and `pnpm check:corridor` still exiting **1**, `TABLE.shots` still exactly `{}`, and `assets/src/dragonwar.blend`, `public/assets/dragonwar.glb`, `public/assets/dragonwar.collision.json` and all five `test/replays/*.golden.json` byte-identical to this story's baseline.

## Spec Change Log

**2026-09-03 -- implementation pass.** Phases 1-4 complete. `test/util/plan-geometry.ts`, `test/util/shot-cases.ts`, `test/util/reachability.ts`, `test/shot-reachability.test.ts`, `test/fixtures/reachability/reachability-sweep.harness.ts` + `vitest.harness.config.ts` are new; `test/shot-routing.test.ts` is refactored to `driveCase(id)` with byte-identical driven behaviour (38 passed, unchanged); `package.json` gains `check:reachability`; `AGENTS.md` documents it. No geometry, tuning, or golden file touched (confirmed below).

**The single biggest finding of this pass, found by the Phase 3 dense sweep, not the Phase 2 in-suite search:** a **medium-strength plunge (hold ≈ 270-300 ticks, below `plungerMaxHoldTicks` = 500)** does not have enough energy to complete the top crossing, so it **ascends the RIGHT lane, barely enters the top of the loop channel (closing `s_loop_r_out` then `s_loop_r_in`), and falls back down the SAME lane it ascended** -- a real, non-teleported trajectory that passes within 1-5 mm of every Right Loop entry offset and both right off-column release points. This resolved what the Boundaries' Block-If clause anticipated as a possible HALT (no witness for the Right Loop entry release points): the Phase 2 in-suite search (weak-plunge sweep at 100-900 ticks in steps of 25-50, plus ~280 left-bat-flip combinations) never sampled this narrow window; the Phase 3 dense sweep's finer plunge-strength grid (240-380 in steps of 5) found it. `plunge-medium-285` (hold 285, the best point in that window) is now witness #3 in `WITNESSES`. **No case remains that the committed suite demonstrably drives a real ball through yet this story could not prove reachable** -- the Block-If HALT condition was never triggered in the end.

**Witness set (`test/util/reachability.ts`, `WITNESSES`), all origin `bd_shooter` via `c_trough_eject`, never a teleport:**

| id | recipe | switches closed (first-observed order) | segments | path (mm) |
| --- | --- | --- | --- | --- |
| `plunge-full` | settle 320, hold 521 (full strength, past `plungerMaxHoldTicks`=500), release, run 4300 | `s_shooter_lane, s_loop_l_out, s_loop_l_in, s_inlane_l, s_drain, s_trough_4` | 5109 | 2726.6 |
| `plunge-weak-345` | settle 320, hold 345 (partial strength -- fails the top crossing), release, run 5500 | `s_shooter_lane, s_loop_l_out, s_spinner, s_loop_l_in, s_outlane_l, s_drain` | 6164 | 2758.1 |
| `plunge-medium-285` | settle 320, hold 285 (weaker still -- ascends the RIGHT lane, falls back), release, run 5500 | `s_shooter_lane, s_loop_r_out, s_loop_r_in, s_outlane_r, s_drain, s_trough_4` | 4870 | 2319.8 |
| `plunge-then-bat-l-3911` | `plunge-full`, then `frame.flipper_l` held ticks 3911-3971 (relative to release), run 7000 | `..., s_dragon_body, s_drain, s_trough_4` | 6418 | 3590.9 |
| `plunge-then-bat-l-3918` | `plunge-full`, flip 3918-3978, run 7000 | `..., s_dragon_body, s_drain, s_trough_4` | 6610 | 3629.6 |
| `plunge-then-bat-l-3945` | `plunge-full`, flip 3945-3975 (a 30-tick tap), run 7000 | `..., s_lock_lane, s_pop_1, s_pop_3` | 7840 | 3912.1 |
| `plunge-then-bat-l-3944-35` | `plunge-full`, flip 3944-3979 (35-tick), run 7000 | `..., s_lock_lane, s_pop_1, s_pop_3, s_pop_2` | 7840 | 3876.1 |
| `plunge-then-bat-l-3960` | `plunge-full`, flip 3960-4040, run 6600 | `..., s_sling_l, s_drain, s_trough_4` | 6790 | 3498.2 |
| `plunge-then-bat-l-4040` | `plunge-full`, flip 4040-4070 (a 30-tick tap), run 7000 | `..., s_drain, s_trough_4` | 6589 | 3283.1 |
| `plunge-then-bat-l-4110` | `plunge-full`, flip 4110-4170, run 7000 | `..., s_sling_r, s_drain, s_trough_4` | 6538 | 3572.1 |

Every witness clears `MIN_WITNESS_SEGMENTS` (500) and `MIN_WITNESS_PATH_MM` (500) by a wide margin and closes its own declared `expectedSwitch`. **No `bat_r` witness exists**: `bd_shooter` has exactly one exit (the manual plunge / `pulse c_autolaunch`, AD-6's "one code path"), and at every swept plunge strength (33 values 20-900 ticks, plus the fine 240-380 window) the trajectory reaches the LEFT bat or falls back into the shooter lane -- never the right. This was searched exhaustively (see the Phase 3 harness's own header) and is recorded as this story's own significant negative finding, not asserted lightly.

**Verdict table -- all 39 driven cases (AC 2):**

| case id | release point (mm) | verdict | closest approach (mm) | witness / ledger |
| --- | --- | --- | --- | --- |
| `left-loop-orbit-28` | (28, 415) | reachable | 4.868 | `plunge-weak-345` |
| `left-loop-orbit-31` | (31, 415) | reachable | 1.868 | `plunge-weak-345` |
| `left-loop-orbit-34` | (34, 415) | reachable | 1.131 | `plunge-weak-345` |
| `right-loop-orbit-28` | (440.4, 415) | reachable | 1.088 | `plunge-medium-285` |
| `right-loop-orbit-31` | (437.4, 415) | reachable | 2.876 | `plunge-medium-285` |
| `right-loop-orbit-34` | (434.4, 415) | reachable | 4.874 | `plunge-medium-285` |
| `dw123-single-ball-orbit` | (437.4, 415) | reachable | 2.876 | `plunge-medium-285` |
| `loop-off-column-left-west-18` | (18, 415) | reachable | 11.166 | `plunge-weak-345` |
| `loop-off-column-left-east-45` | (45, 415) | reachable | 6.992 | `plunge-full` |
| `loop-off-column-right-west-18` | (450.4, 415) | reachable | 1.122 | `plunge-medium-285` |
| `loop-off-column-right-east-45` | (423.4, 415) | reachable | 5.123 | `plunge-medium-285` |
| `left-loop-1200` | (31, 415) | reachable | 1.868 | `plunge-weak-345` |
| `ramp-return-geometry` | (355, 465) | **unreachable** | 44.979 | `DW-137` |
| `centre-drain-descent` | (257.2, 200) | reachable | 0.825 | `plunge-then-bat-l-4040` |
| `dragon-body` | (140, 380) | reachable | 0.610 | `plunge-then-bat-l-3911` |
| `lock-lane-immediate` | (170, 380) | reachable | 6.975 | `plunge-then-bat-l-3945` |
| `lock-lane-long` | (170, 380) | reachable | 6.975 | `plunge-then-bat-l-3945` |
| `dragon-bank-left-column-294` | (294, 400) | reachable | 5.264 | `plunge-then-bat-l-3918` |
| `dragon-bank-right-column-300` | (300, 400) | reachable | 0.735 | `plunge-then-bat-l-3918` |
| `top-lane-1` | (110, 900) | **unreachable** | 65.435 | `DW-138` (candidate) |
| `top-lane-2` | (245, 900) | **unreachable** | 66.562 | `DW-138` (candidate) |
| `top-lane-3` | (345, 900) | **unreachable** | 74.282 | `DW-138` (candidate) |
| `slingshot-left` | (115, 370) | reachable | 2.316 | `plunge-then-bat-l-3960` |
| `slingshot-right` | (350, 370) | reachable | 1.515 | `plunge-then-bat-l-4110` |
| `pop-bumper-1` | (130, 700) | **unreachable** | 32.976 | `DW-138` (candidate) |
| `pop-bumper-2` | (200, 700) | reachable | 3.195 | `plunge-then-bat-l-3945` |
| `pop-bumper-3` | (180, 770) | reachable | 0.093 | `plunge-then-bat-l-3945` |
| `descend-sling-l` | (115, 465) | **unreachable** | 51.859 | `DW-138` (candidate) |
| `descend-sling-r` | (350, 465) | **unreachable** | 39.979 | `DW-138` (candidate) |
| `descend-dragon-leg-l` | (120, 660) | **unreachable** | 32.706 | `DW-138` (candidate) |
| `descend-dragon-leg-r` | (220, 660) | **unreachable** | 15.533 | `DW-138` (candidate) |
| `descend-ramp-wall-l` | (332, 880) | **unreachable** | 68.446 | `DW-138` (candidate) |
| `descend-ramp-wall-r-cap` | (376, 758) | **unreachable** | 46.901 | `DW-138` (candidate) |
| `descend-ramp-turn-cap` | (360, 895) | **unreachable** | 59.450 | `DW-138` (candidate) |
| `descend-ramp-return-rail` | (396, 800) | **unreachable** | 25.987 | `DW-138` (candidate) |
| `descend-dragon-d` | (240, 750) | **unreachable** | 25.841 | `DW-138` (candidate) |
| `descend-dragon-n` | (310, 750) | reachable | 11.221 | `plunge-then-bat-l-3944-35` |
| `descend-loop-top-west` | (150, 1035) | reachable | 5.844 | `plunge-weak-345` |
| `descend-loop-top-east` | (300, 1035) | reachable | 5.595 | `plunge-weak-345` |

25 reachable, 14 unreachable (1 `DW-137`, 13 `DW-138`-candidate -- recorded in frontmatter `deferred:`, not written to the ledger, per Rule 15(a); `ledger.sh next-id` confirmed 138 free both before and after this pass). `REACHABILITY_TOLERANCE_MM = 13.495`.

**`DW-130` -- the feed-rail proximity record (AC 5), measured from the cases whose own describe block asserts `assertReachesFlipperBand(..., 'r')` (the three Left Loop orbit cases + the Ramp case) against `col_guide_inlane_feed_r`, and `assertReachesFlipperBand(..., 'l')` (the three Right Loop orbit cases) against `col_guide_inlane_feed_l`:**

- **RIGHT** (`col_guide_inlane_feed_r`): margin **+0.019798458333 mm** (clears -- reproduced bit-identically across repeated runs; AD-3, no solver noise).
- **LEFT** (`col_guide_inlane_feed_l`): margin **-0.007077330733 mm** (contacts).

Both match this story's own Code Map citation of Story 2.1c's code review pass 3 ("left contacts by ~0.006 mm; right clears by ~0.020 mm") closely. `FEED_MARGIN_AGREEMENT_BAND_MM = 0.01` -- tight because the simulation is deterministic; a looser band (0.05, this pass's first attempt) let the required 20 mm mutation pass silently (the mutated margin moved to -0.0071, only 0.027 mm from the original +0.0198 -- DW-130's own point in miniature: the ball funnels along whichever surface bounds it, so contact margin stays near zero either way, and the SIGN is what actually moves). Tightened after catching this on the mutation demonstration itself (see below).

**Measured runtimes:**

- `npx vitest run test/shot-routing.test.ts` -- **38 passed**, 4.19-4.44 s tests / ~4.9-5.0 s total (baseline 5.02 s / 4.24 s tests -- unchanged in effect, within normal run-to-run variance).
- `npx vitest run test/shot-reachability.test.ts` -- **87 passed**, self-time **2.8-3.2 s** (well under the 10 s Block-If budget).
- `pnpm check:reachability` -- **exit 0**, **471 releases evaluated** in **~75-76 s**, all 39 cases agree with `SHOT_CASES`'s own declarations (0 mismatches). Sweep = 36 coarse plunge-only strengths (20-900 step 25) + 29 fine plunge-only strengths (240-380 step 5, the window that found `plunge-medium-285`) + 66 flip ticks (3650-4300 step 10) x 6 hold durations (396 combinations) + all 10 `WITNESSES` recipes verbatim (a few of which exactly overlap the surrounding grid, by design), so the dense sweep can never disagree with the in-suite gate merely by stepping over a narrow window a targeted search already found. (36 + 29 + 396 + 10 = 471, matching the reported count.)
- `npx vitest run` (full suite) -- **89 files / 1286 passed / 22 skipped**, 32.98-33.56 s wall. Baseline was 88 files / 1199 passed (without `BLENDER`) -- delta is exactly `test/shot-reachability.test.ts`'s own 87 new tests, 1 new file. 22 skips unchanged.

**Verification commands run, all as specified:**

- `pnpm typecheck` -- clean (all three projects).
- `pnpm lint:boundaries` -- OK, 83 `.ts` files under `src/`, no violations (unaffected by this story -- it authors no `src/` file).
- `pnpm check:headers` -- OK against tracked files; this story's 6 new files were manually verified to carry the exact sanctioned `// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.` marker (the check reads `git ls-files`, so untracked new files are invisible to it until staged/committed -- confirmed by inspection, not by the tool, pending the commit that makes them tracked).
- `pnpm check:attributions` -- OK (no new dependency; this story adds none).
- `pnpm check:ad7` -- exit 1, unchanged (still intended-red, DW-70).
- `pnpm check:corridor` -- exit 1, unchanged (still intended-red, DW-137, naming `2.1f` and `50.990`).
- `npx vitest run` -- 89 files / 1286 passed / 22 skipped (see above).
- `pnpm build && pnpm check:dist && pnpm check:size` -- all exit 0 (`check:dist`: 2 HTML pages, 141 files; `check:size`: 0.845 MB measured against a 2.750 MB budget).
- `git diff --stat -- assets/src/dragonwar.blend public/assets/dragonwar.glb public/assets/dragonwar.collision.json test/replays/` -- **empty**, confirmed both before and after every mutation demonstration below (SHA-256 of `dragonwar.collision.json` unchanged: `4955324fce88eab4b25f2930b3cf801f88c66c487f4d3b4e1756d3e2c603ecc1`).

**Mutations demonstrated (Rule 19 -- one per AC; applied, red observed with the required content, reverted, tree confirmed byte-identical):**

- **AC 1** -- `dragon-body`'s `startMm` moved from (140, 380) to (376, 470) (inside the Ramp channel band) -> `test/shot-reachability.test.ts` failed naming `"dragon-body"`, witness `"plunge-then-bat-l-3911"`, and the measured closest approach (121.400 mm) against the 13.495 mm tolerance. Reverted; tree confirmed unchanged by `git diff`.
- **AC 2** -- (a) the Ramp case's declaration flipped from `unreachable` to `{ kind: 'reachable', witness: 'plunge-full' }` -> failed naming `"ramp-return-geometry"` and the measured closest approach (142.400 mm). (b) Inverse: `dragon-body`'s declaration flipped to `{ kind: 'unreachable', ledger: 'DW-999', closestApproachMm: 50, note: '...' }` -> failed because witness `"plunge-then-bat-l-3911"` comes within 0.610 mm -- "a genuinely-fixed case must be re-declared reachable, not left marked unreachable." Both reverted.
- **AC 3** -- (a) `SHOT_CASES` emptied (wrapped in `true ? [] : [...]`) -> failed on `"SHOT_CASES has only 0 entries, below the recorded floor of 39"` -- the anti-vacuity test, not a downstream one. (b) `plunge-then-bat-l-3911`'s flip `atTick` moved to 99999 (past its own 7000-tick budget) -> `assertWitnessCorpusHealthy()` failed FIRST (before any per-case test even ran, confirmed by describe-block ordering) naming the witness and its missing `s_dragon_body` closure. Both reverted.
- **AC 4** -- `left-loop-orbit-28`'s `speedMmPerS` moved from 2200 to 800 -> `test/shot-routing.test.ts` failed on its own `assertOrbitOrder()` (`s_loop_l_out must close`) -- the manifest is genuinely the input the consumer drives, not a parallel description. Reverted; **38/38 confirmed passing again**.
- **AC 5** -- (a) `col_guide_inlane_feed_r`'s `bboxMm` and `footprintMm` shifted 20 mm west directly in `public/assets/dragonwar.collision.json` -> the RIGHT feed-rail proximity record failed, margin moved from +0.0198 to -0.0071 mm (0.0269 mm away from recorded, over the 0.01 mm band). Reverted; SHA-256 confirmed byte-identical. (b) `col_guide_inlane_feed_r` deleted from the document entirely -> failed with `"the feed-rail proximity record cannot be evaluated: \"col_guide_inlane_feed_r\" is absent from the committed collision document"` -- a named failure, not an opaque `nodeBboxMm()` import-time throw. Reverted; SHA-256 confirmed byte-identical both times.
- **AC 6** -- `buildSweepRecipes()` in `test/fixtures/reachability/reachability-sweep.harness.ts` short-circuited to return `[]` -> `pnpm check:reachability` exited **1** on `"only 0 releases were evaluated, below the anti-vacuity floor of 300"`. Reverted; re-ran clean (exit 0, 471 releases, 0 mismatches).
- **AC 7** -- no mutation (preservation gates). `git diff --stat` over the geometry/golden paths is the check itself, confirmed empty throughout.

**One methodology note, recorded rather than hidden:** the first `FEED_MARGIN_AGREEMENT_BAND_MM` chosen (0.05 mm, reasoned as "generous solver-noise headroom") let the AC 5(a) mutation pass silently on first attempt, because the simulation is fully deterministic (AD-3 -- there is no solver noise to be generous about) and this specific geometry's contact margin stays numerically tiny on both sides of a 20 mm shift (the ball funnels along whichever surface bounds it). Caught by actually running the required mutation before considering the story done, not by inspection; the band was tightened to 0.01 mm (guided by the measured deterministic values, not a reused convention) and the mutation re-run to confirm red.

## Review Triage Log

### 2026-09-03 — Review pass

Four parallel review layers run: Blind Hunter (10 findings), Edge Case Hunter (8 findings), Verification Gap (0 gaps; 2 incidental findings), Intent Alignment Auditor (descriptive report, no findings list). After dedup (the `CENTRE_X_MM` frozen-literal and the 33-vs-36 sweep-count miscount were each independently caught by two layers):

- intent_gap: 0
- bad_spec: 0
- patch: 10: (high 0, medium 1, low 9)
- defer: 5: (high 0, medium 1, low 4)
- reject: 3: (high 0, medium 0, low 3)
- addressed_findings:
  - `[medium]` `[patch]` `test/util/shot-cases.ts`'s `centre-drain-descent` release x was frozen as a plain literal (`257.2`) where the pre-refactor call site derived it live from `TABLE.reference.playfieldMm.w / 2` -- a direct violation of task 2's "derived expressions stay derived, not frozen to floats." Fixed: imported `TABLE`, restored the live derivation, corrected the doc comment. Re-verified: `check:reachability` re-run produces byte-identical verdicts (471 releases, 0 mismatches).
  - `[low]` `[patch]` The frontmatter `deferred:` entry for `top-lane-1` cited siblings' closest-approach range as "62.9-74.3 mm"; the actual recorded values are 66.562 and 74.282 mm. Fixed the range in the evidence text.
  - `[low]` `[patch]` `test/util/reachability.ts`'s doc comment above `MIN_WITNESS_SEGMENTS`/`MIN_WITNESS_PATH_MM` named `plunge-full` as "the shortest witness," but `plunge-medium-285` (4870 segments / 2319.8 mm) is shorter. Corrected the comment.
  - `[low]` `[patch]` The dense sweep's own doc comment and the Spec Change Log both undercounted the coarse plunge-strength loop as "33" when the actual loop (`20` to `900` step `25`) yields 36 values -- the stated breakdown didn't even sum to the reported 471. Corrected both to 36 + 29 + 396 + 10 = 471, and noted that a few of the 10 explicit `WITNESSES` recipes deliberately overlap the surrounding grid.
  - `[low]` `[patch]` `test/shot-routing.test.ts` imported `pointToSegmentDistanceMm` and `pointInPolygon` from `plan-geometry.ts` but only calls `distanceToPolygonMm`. Removed the two unused imports (the other two remain genuinely used by `test/shot-reachability.test.ts`).
  - `[low]` `[patch]` `test/fixtures/reachability/reachability-sweep.harness.ts` imported `toPhysics` and `MM_PER_VU` from `src/sim/table/frames` but used neither. Removed both (kept `fromPhysics`, which is used).
  - `[low]` `[patch]` The same harness reinvented `shotCase()` under a local name `shotCaseById()`, duplicating find-or-throw logic already exported from `test/util/shot-cases.ts` (which the file already imports from). Replaced the duplicate with the existing export.
  - `[low]` `[patch]` `test/shot-routing.test.ts`'s top-of-file header comment (near the `assertReleaseClear()` description) still read "every `driveShotChecked()` call fails naming the body or zone," a function this story's task 3 removed. Updated to `driveCase()`.
  - `[low]` `[patch]` No test asserted `SHOT_CASES` ids are unique; a duplicate id would make `shotCase()`/`driveCase()` silently resolve only the first entry, leaving a later same-id case undriven and unverified. Added a uniqueness assertion to the declaration-completeness describe block in `test/shot-reachability.test.ts`.
  - `[low]` `[patch]` `test/util/reachability.ts` exported `witnessLabel()`, unused anywhere in the repository (confirmed by grep). Removed.
  - `[medium]` `[defer]` Intent Alignment Auditor: the Boundaries' Block-If clause ("a case the committed suite demonstrably drives a real ball through is nonetheless found unreachable ... fix the instrument, do not record a false unreachable verdict") is anchored in specific, already-known independent evidence for the Left/Right Loop entries (the plunge's own measured switch sequence) -- evidence this spec does not record for the top lanes or `pop-bumper-1`. Assessed and NOT treated as a Block-If violation: the clause's literal trigger names only the Loop cases, and by the broader reading every one of the 38 pre-existing routing cases would qualify (since each "passes" its own teleported-then-launched assertion), which would make AC 2's entire unreachable-verdict mechanism incoherent. The underlying concern -- that `top-lane-1/2/3` and `pop-bumper-1`'s "unreachable" verdicts may reflect this story's single-origin (plunge, plunge-then-left-bat-flip only) witness-search technique rather than genuine geometry, since `bd_shooter` structurally never reaches the right bat and `arrangeCradleBall()`'s cradle-placement technique was never exercised -- is real, already self-reported by the implementation with correct epistemic framing in the frontmatter's own `deferred:` entries (only the sibling-range figure needed correcting, done above), and requires meaningfully new search machinery with no guaranteed payoff (high fix-risk). Left deferred, in-story, for the lead to route at harvest.
  - `[low]` `[defer]` Edge Case Hunter: `test/shot-reachability.test.ts`'s `segmentToPolygonDistanceMm()` measures distance via 4 point-to-segment distances and does not detect a swept segment that fully crosses a thin polygon edge between two out-of-polygon endpoints (no `segmentsIntersect` check) -- theoretically could underestimate a DW-130 margin for a fast, thin-rail crossing. Not currently exercised: the actual measured margins independently match Story 2.1c's own prior figures, and `verification-gap`'s dedicated pass found no live gap. Hardening item, not an observed defect.
  - `[low]` `[defer]` Edge Case Hunter: `minFeedRailMarginMm()`'s `footprintMm` fallback does not guard against an empty (but present) array, which would make every distance measure `Infinity`. No path in the committed collision document produces this today.
  - `[low]` `[defer]` Edge Case Hunter: `RIGHT_BAT_ARRIVAL_CASE_IDS`/`LEFT_BAT_ARRIVAL_CASE_IDS` in `test/shot-reachability.test.ts` are a hand-maintained list that could go stale if `shot-routing.test.ts`'s `assertReachesFlipperBand()` call sites change without updating them. No cross-check exists today.
  - `[low]` `[defer]` Blind Hunter: `test/util/reachability.ts`'s `replayWitness()`, `test/fixtures/reachability/reachability-sweep.harness.ts`'s `sweepOneRelease()`, and `test/shot-reachability.test.ts`'s `driveCaseSwept()` independently reimplement the same serve/settle/hold/flip/run stepping loop. The latter's own comment explains why it cannot import from a `.test.ts` module, but that constraint doesn't bar sharing between the two plain modules. Maintainability item, no behavioural risk.
  - `[low]` `[reject]` Edge Case Hunter: the bypass-detection source scan strips comments before strings (not after), and its coordinate-literal regex doesn't match every numeric literal syntax (`.5`, `+5`). Both are theoretical hardening against a deliberately obfuscated edit to a small, actively-reviewed test file this same project's own review discipline authors -- no realistic path to either triggering.
  - `[low]` `[reject]` Blind Hunter: the dense sweep's explicit `WITNESSES` recipes (`285`, `345`, one flip combo) partially overlap its own coarse/fine grids, evaluating a few releases twice. By design (documented in the corrected doc comment above) -- the overlap is deliberate insurance against the grid stepping over a narrow window, not a bug, and costs 3 of 471 releases.

Re-verified after all patches: `pnpm typecheck` clean; `npx vitest run test/shot-routing.test.ts test/shot-reachability.test.ts` -- 126 passed (38 + 88, the +1 being the new uniqueness test); `pnpm check:reachability` -- exit 0, 471 releases, 0 mismatches, byte-identical verdicts to the pre-patch run; `pnpm check:ad7` / `pnpm check:corridor` -- still exit 1 as designed; `pnpm lint:boundaries` / `check:headers` / `check:attributions` -- exit 0 (headers/attributions genuinely re-checked against the staged new files); `npx vitest run` -- 89 files / 1287 passed / 22 skipped without `BLENDER`, 89 files / 1309 passed / 0 failed with it; `pnpm build && check:dist && check:size` -- exit 0; geometry/goldens `git diff --stat` -- empty.

## Design Notes

**The design tension, and how it is resolved.** A reachability proof driven blind is unaffordable. Measured on this host: `machine.step()` costs **33.3 us/tick** with one ball, so a search over ~100 candidate trajectories per release point across 36 release points is ~3,600 trajectories at ~150 ms each -- about **9 minutes**, against a 60 s per-case timeout and a 32.9 s whole-suite wall. Even a modest per-case search (~14 s each) would put a single serial file at 8+ minutes and make it the critical path. Three properties make it affordable instead:

1. **One trajectory characterises many release points.** The cost of measuring closest approach is independent of the number of cases: the sweep produces swept segments, and every case is a distance query against them. 36 cases cost what 360 would.
2. **The search and the proof are separated.** *Finding* which trajectory reaches a point -- and, far harder, proving that **none** does -- is a dense search that runs once, out of process, behind `pnpm check:reachability`. The default suite replays only the **witnesses the search already found**, one per reachable case (heavily shared: a single plunge orbit covers the Left Loop entry band, the top lanes and the left inlane in one 4300-tick run). ~10 witnesses at ~150-300 ms is **~2-3 s**, well under the 10 s the parallel file scheduler absorbs for free.
3. **Nothing is cached to disk.** See below.

**Why nothing is cached to disk.** A committed corpus artifact was the obvious fourth option and is deliberately rejected. It would need a staleness header in the golden-replay shape (`assetHash`/`tuning`/`physicsVersion`, `src/sim/loop/replay.ts:205-246`) or it would silently describe geometry that no longer exists -- and this epic's own history is full of gates that stayed green over geometry that had moved. Replaying ~10 witnesses live costs ~2-3 s, which is less than the machinery a correct staleness gate would cost to build and less than the burden it would impose on every later geometry story. Live measurement is also strictly more honest: the number in the failure message was produced by this run, not by a file someone forgot to regenerate. The one thing the artifact would have bought -- a dense corpus in the default suite -- is exactly what the out-of-process sweep provides on demand.

**Alternatives considered and rejected.**
- *Per-case blind search inside the default suite* -- ~9 minutes of physics, and a single serial file far past the 60 s per-case timeout. Rejected on measurement.
- *A precomputed reachable **region*** (a polygon or grid the release point is tested against) -- cheaper still, but it converts a physics result into a dimensional one, which is precisely the failure mode `test/fixtures/dw137-corridor/ramp-corridor.harness.ts` is careful to describe itself as *not* being, and which the epic context calls out ("a dimensional check is never the evidence for a routing claim"). Rejected on principle, with evidence.
- *The whole check out of process, like `check:corridor`* -- affordable, but it makes the guarantee opt-in, and AC 1 requires a case added later to inherit it **without opting in**. CI runs a fixed script list that would never invoke it. Rejected on the AC.
- *An in-suite wrapper around the sweep, mirroring `test/ad7-device-slots.test.ts`* -- those wrappers exist to assert that an intended **red** is real. This check is intended **green**; a wrapper would either spawn the dense sweep inside `pnpm test` (defeating the cost split) or assert a failure that must not occur. Rejected; the reasoning is written into the harness header instead.

**How AC 1's "fails" and AC 2's "marked, not deleted" fit together.** They are not in tension and no reading has to be chosen between: AC 2 explicitly prescribes the disposition for a case proved unreachable (marked against its owning ledger entry), so AC 1's "fails" is the behaviour for a case that is unreachable and **not** so recorded. The design is therefore a recorded-baseline gate that fails in **both** directions -- an undeclared miss fails, and a declared miss that turns out reachable also fails. That second direction is what makes Story 2.1f's job crisp: 2.1f flips the Ramp case's declaration to `reachable` and this harness proves it, which is exactly how that story's own AC is worded.

**Governing architecture decisions (Rule 6).** **AD-11** governs AC 1 and AC 3: `sw_` zones are *analytic tests against the ball's per-tick swept segment, never the end position*, so the reachability metric is segment-based, not point-sampled; AD-11 also makes the `.blend` the sole owner of geometry, which is why this story authors none. **AD-10** governs the frame and the tolerance: table frame, millimetres, `TABLE.reference.ballMm = 26.99`, radius 13.495, from which `REACHABILITY_TOLERANCE_MM` is derived rather than invented. **AD-2** `[AMENDED 2026-09-01, DW-67]` governs the whole problem statement: `settleTicks` gates the **break**, never the make, so a release inside a zone latches that switch on drive tick 1 -- the sibling defect `assertReleaseClear()` closed and the reason a teleported placement can manufacture a green. **AD-6** `[AMENDED 2026-09-03 -- pass-through spinner]` governs the witnesses: physics owns ball bodies; `bd_shooter` is non-parking with the served ball resting on the plunger tip; the manual plunge and `pulse c_autolaunch` are one code path; the opening of `s_shooter_lane` is the one event that means "plunged". Its amended spinner clause also explains why the Left Loop case's `s_spinner` assertion pins the analytic zone rather than `col_spinner_l`'s placement -- relevant because that case's release point is in this story's manifest. **AD-5** governs the bat witnesses: hardware rules live in physics, gated by coil enable, and a bat is driven only from `InputFrame`. **AD-3** governs replayability: one clock, no unseeded randomness, so a recorded witness parameter set reproduces exactly. **AD-15** governs the test seam and names `test/` in its own `Binds`. **AD-16** exempts `test/**` from the device-name-literal lint, so the manifest may carry `SwitchName` values directly. **No AC contradicts an AD's Rule.**

**Rule 20 -- candidate spine writes, for the lead (not this story's to make).** Two, both flagged so they are not lost. (a) The spine has **zero** occurrences of `reachab`, `teleport` or `driveShot` across the entire architecture folder: this story introduces a concept the spine has no word for, and the natural home is the `## Deferred` acceptance line at `ARCHITECTURE-SPINE.md:366` ("every shot passes Lawlor's miss test; orbit exits feed the flippers"), which is bound by no AD and says nothing about how it is evidenced. (b) AD-15's Rule names exactly two physics-test shapes -- the rules-side switch-script DSL and golden replay against the state hash -- while the committed suite has shipped dozens of direct `createMachine()` drive tests across two epics. That is a gap in the spine's description, not a contradiction this story creates (treating it as one would invalidate the existing suite), and the fix is a Consistency Conventions row or an AD-15 clause naming the third shape. Neither write is this story's; both are the lead's at the moment of decision.

**Rule 17 -- ledger inbox.** One entry is owned: **`DW-130`** (`col_guide_inlane_feed_r` can be shifted 20 mm or deleted with every routing case green). It is **addressed, not declined** -- task 6, the two `DW-130` rows in the I/O matrix, and **AC 5**. Judgement asked for at dispatch, answered: **Story 2.1c closed the dimensional half only.** 2.1c's band `yMax` change (`FLIPPER_BAND_R.yMax` = `col_guide_inlane_feed_r.min.y`) and the side-specific `assertReachesFlipperBand` are real improvements, but they cannot close the behavioural half, and 2.1c's own code review pass 3 says so in writing: the rail can still be shifted -20/+20/+40/+60 mm with all 38 cases green, because **no ball on any `side: 'r'` case ever touches it** -- closest approach 13.515 mm against a 13.495 mm radius, 0.020 mm short of contact. The genuine closure at 2.1c was the new dimensional gate at `test/asset-contract.test.ts:664-678`, which passes today by 0.9 mm and may be blind to a westward move. Two further traps this story must avoid rather than repeat: the "delete the node" mutation is **not a valid falsifier for anything in this suite** -- `FLIPPER_BAND_L/_R` call `nodeBboxMm()` at module top level (`:188-189`) and `test/asset-contract.test.ts:667` uses a non-null assertion, so a delete produces an import throw or a `TypeError`, never a behavioural red (hence task 6's defensive lookup); and tightening the band further cannot help, because the band's x-span already **is** the bat's x-span, so the probe the original adjudication trailer prescribed ("assert the arriving ball's x lies over its own bat") is already satisfied by construction. What task 6 delivers instead is a **measured proximity record from the real driven trajectory**, which is sensitive to the body's position by construction and is the first behavioural observable in this suite that is. If it proves not to close the entry completely, the residual is filed in frontmatter `deferred:` (task 12) with what remains, for the lead to adjudicate -- not silently absorbed.

**Rule 17 -- one entry deliberately NOT claimed, and why it is flagged.** `DW-126` ("`col_loop_r_lower`'s `DW-119` bevel has no test that would catch its removal or reversal -- the descending-release sweep excludes this body, no column reaches it directly") currently sits `routed owner=burndown`. It is verbatim this story's problem shape, and its stated fix -- "a release point and speed verified to actually land on the cap" -- is a by-product of the dense sweep. This story does **not** claim it (it is not in this story's inbox and claiming another owner's entry is not a plan-stage call), but task 11's recorded verdict table and the sweep's own output are the evidence a burn-down pass would need, and the spec flags it so that is visible rather than rediscovered.

**Integration ACs (Rule 1 / Rule 2).** This story introduces shared modules -- `test/util/shot-cases.ts`, `test/util/reachability.ts` and `test/util/plan-geometry.ts` -- so **AC 4** is the Integration AC: the consumer `test/shot-routing.test.ts` reads the manifest and drives all 38 of its cases from it, with the observable effect that the file still passes 38/38 and that changing a manifest entry changes what that case actually drives. It is observed at the consumer's own tier (a real vitest run of the consumer file), never by inspecting the manifest's internal state. **Consumed-by:** **Story 2.1f** -- the named first downstream consumer; its own ACs are written in terms of this harness ("proven by the Story 2.1e reachability harness rather than by a teleported release"), and it closes by flipping the Ramp case's manifest declaration from `unreachable` to `reachable` and watching this gate prove it, and by re-running `pnpm check:reachability`; Story 2.1d (device behaviour and guide terminations -- any case it adds inherits the guarantee); Story 2.2 (slingshot and pop actuation, whose cases already sit in the manifest); Story 2.3 (drop targets, spinner and Lock, whose "all six droppable" requirement is a reachability claim); Story 2.4 (`TABLE.shots` over switch sequences whose reachability this proves); Story 2.7 (Skill shot and lane change over the inlane/outlane set). **Consumes:** Story 2.1c's repaired pin, `assertReleaseClear()`, the orbit routing and the inlane feed rails; Story 2.1b's shot map and switch set; Story 2.1a's drain triangle and reconciled flipper boxes; Story 1.6's ported flipper mover and hold-to-charge plunge (both witness origins); Story 1.5's `bd_trough`, `bd_shooter` and `createDeviceMechanics`; Story 1.4's export pipeline and the committed collision document.

**Why the manifest, and not just a reachability assertion inside each case.** AC 1 requires the proof to be "a property of the harness, not of each case, so a new case added later inherits it without opting in". An assertion added to each `it` body is the opposite: it is opted into, and the next case someone adds forgets it -- which is how both `DW-137` and `DW-130` got in. Making the manifest the *only* way to obtain a release point converts the guarantee from a convention into a structure: `driveCase(id)` is the only entry point, so a new case must be declared, and declaration is what the reachability file iterates. Task 5's source-scan assertion closes the remaining hole (someone re-adding a local `driveShot`) at negligible cost, in the shape of the repo's existing source-reading gates.

**What "reachable" means here, and what it deliberately does not.** Reachable = the ball's centre passed within `REACHABILITY_TOLERANCE_MM` (one ball radius: the release point lay inside a real ball's swept body) of the release point at some tick of a witness trajectory. It is **direction-agnostic on purpose**: a stronger definition requiring the ball to arrive descending, or at a comparable speed, would fail release points that are genuinely reachable and would import a judgement the AC does not ask for ("arrives within a stated tolerance of it"). The twelve descending-drop columns are subject to the same check as the shot releases, which is a feature rather than an oversight -- a `DW-119` bevel guarding a face no ball can reach is a bevel guarding nothing, which is `DW-126`'s complaint restated.

**Scope.** `warnings: ['oversized']`. `multiple-goals` is deliberately **not** set: the manifest gates the reachability check, the check gates the recorded verdict, the verdict is what the dense sweep proves and what `DW-130`'s record and Story 2.1f both consume. One deliverable, one dependency chain. The spec is long because two prior stories' measurements -- the cost model, the `DW-130` distances, the plunge's own switch sequence -- are carried here rather than rediscovered under time pressure.

**Human-only work.** None. No AC here needs the Reference machine. The seven-shot Lawlor ritual stays `pending-author` under Story 2.1b's AC 6 and the existing `sprint-status.yaml` action item; this story measures *whether a ball can get there*, never *whether the miss comes back playable*, and must not be recorded as touching the latter. Inventing a software proxy for that judgement is the failure mode this paragraph exists to prevent.

## Verification

**Commands:**

- `npx vitest run test/shot-routing.test.ts` -- expected: **38 passed**, unchanged count, after the manifest refactor. Record the wall-clock duration against the 5.02 s baseline.
- `npx vitest run test/shot-reachability.test.ts` -- expected: green, and **under 10 s of self-time**. Record the measured figure; it is the number the Block If is judged against.
- `pnpm check:reachability` -- expected: **exit 0**, reporting the per-case verdicts and the number of releases evaluated. Record the runtime.
- `pnpm check:ad7` -- expected: **exit 1**, naming `AD-7`, `DW-70` and `bd_trough`. A green run is a regression.
- `pnpm check:corridor` -- expected: **exit 1**, naming `DW-137`, `2.1f` and `50.990`. A green run from this story is a regression -- Story 2.1f owns that gate.
- `pnpm typecheck` -- expected: all three projects clean. (`test/util/*.ts` and `test/*.test.ts` are covered by `tsconfig.node.json`; `test/fixtures/**` is excluded, so the new harness has no compiler net -- check its imports by running it.)
- `pnpm lint:boundaries`, `pnpm check:headers`, `pnpm check:attributions` -- expected: exit 0 for each. Every new file carries the GPL-3.0 header line the repo's other test files carry.
- `npx vitest run` -- expected: **at or above 88 files / 1221 passed / 0 failed** with `BLENDER` exported, and **1199 passed / 22 skipped** without, with the skip count unchanged at 22 and no test deleted, skipped or weakened.
- `pnpm build && pnpm check:dist && pnpm check:size` -- expected: exit 0 for each.
- `git diff --stat -- assets/src/dragonwar.blend public/assets/dragonwar.glb public/assets/dragonwar.collision.json test/replays/` -- expected: **empty**. This story authors no geometry and re-records no golden.

**Mutations (Rule 19 -- one per AC; applied, red observed, reverted, tree verified byte-identical via `git status --short` and `git diff --stat`):**

- **AC 1** -- `mutation: change one genuinely-reachable case's startMm in test/util/shot-cases.ts to a point no ball reaches (e.g. inside the Ramp channel band at (376, 470), or above col_wall_top) -> test/shot-reachability.test.ts goes red naming that case id, its declared witness and the measured closest approach, while every other case stays green.` This is AC 3's demonstrated mutation verbatim and serves both.
- **AC 2** -- `mutation: flip the Ramp case's declaration from unreachable to { kind: 'reachable', witness: <any> } -> the gate goes red naming the Ramp case and its closest approach (expected on the order of the DW-137 shortfall).` Inverse, to prove the baseline cannot rot the other way: `mutation: flip one reachable case's declaration to unreachable with a fabricated closestApproachMm -> the gate goes red because a witness does reach it.`
- **AC 3** -- `mutation: empty SHOT_CASES (return []) -> the gate goes red on the MIN_SHOT_CASES floor, NOT green -- a run that evaluated nothing must fail loudly.` Second: `mutation: neutralise one witness (set its flip tick past its own budget, so no shot occurs) -> assertWitnessCorpusHealthy() goes red naming that witness, before any unreachable verdict is honoured.`
- **AC 4** -- `mutation: change one manifest entry's speedMmPerS (e.g. the Left Loop 2200 -> 800) -> that case in test/shot-routing.test.ts goes red on its own routing assertion, proving the manifest is genuinely the input to the consumer rather than a parallel description of it.`
- **AC 5** -- `mutation: shift col_guide_inlane_feed_r's bboxMm and footprintMm 20 mm west directly in public/assets/dragonwar.collision.json -> the feed-rail proximity record goes red naming the right side and the changed margin; revert via git checkout -- and confirm byte-identical.` (Mutating the committed JSON and reverting is this project's established substitute where Blender is not needed -- see Story 2.1c's own QA pass, which used it three times and confirmed the document byte-identical by SHA-256.) Second: `mutation: delete the col_guide_inlane_feed_r node from the committed document -> the record fails NAMING the absent node, not with an opaque nodeBboxMm() import throw.`
- **AC 6** -- `mutation: reduce the sweep's release grid to empty in test/fixtures/reachability/reachability-sweep.harness.ts -> pnpm check:reachability exits non-zero on its own minimum-release floor rather than reporting success.`
- **AC 7** -- `mutation: none -- these are preservation gates, not ACs.` `check:ad7` and `check:corridor` are intended-red checks this story must not touch; the geometry and golden files are asserted unchanged by `git diff --stat`, which is the check itself.

**Manual checks:**

- Read the recorded verdict table in `## Spec Change Log` and confirm every one of the 39 driven cases appears exactly once, with a verdict, a measured closest approach, and either a witness id or a ledger id. A missing row is a case that was never evaluated.
- Confirm each witness's recorded parameters replay to the same trajectory twice in a row (AD-3: one clock, no unseeded randomness). A witness that does not reproduce is not evidence.
- Confirm no witness teleports: read each witness's construction and check its ball reaches its origin through `frame.plunger` / `frame.flipper_*` and `c_trough_eject` alone, with no assignment to `ball.state.pos` or `ball.hit.vel` anywhere in `test/util/reachability.ts`.
- Confirm `test/shot-routing.test.ts` contains no release-point coordinate literal and no `driveShot(` call site -- the structural half of AC 1's "without opting in".
- Confirm no tracked file contains a Blender executable path (`DW-46`): `git grep -i "blender-5\|Program Files.*Blender" -- ':!tools/blender.mjs'` finds nothing.
- Confirm `ATTRIBUTIONS.md` needs no new row -- this story adds no third-party code, asset or dependency. If that ceases to be true, the entry lands **before** the file does (`CLAUDE.md`).

## Auto Run Result

**Summary of implemented change.** Every release point `test/shot-routing.test.ts` drives moved into one manifest (`test/util/shot-cases.ts`, `SHOT_CASES`), the only source of a release point; `driveCase(id)` replaced `driveShotChecked(startMm, ...)` as the sole entry point, so a coordinate cannot be driven without a manifest declaration. A reachability engine (`test/util/reachability.ts`) replays 10 named, non-teleporting witness trajectories (plunge and plunge-then-left-bat-flip, served by `c_trough_eject` through the real physics pipeline) and measures each case's release point against the nearest swept segment. The in-suite gate (`test/shot-reachability.test.ts`, 88 tests, ~3 s self-time) proves every case reachable-or-recorded-unreachable, with an anti-vacuity floor, declaration-completeness check, per-case bidirectional proof (the baseline cannot rot in either direction), a structural bypass-proof source scan, and the `DW-130` feed-rail proximity record (a genuine behavioural falsifier, where none existed before). A dense out-of-process sweep (`pnpm check:reachability`, 471 releases, ~75 s, intended green) proves the negative for unreachable cases. Of 39 driven cases: 25 reachable, 14 unreachable (1 = `DW-137`/Story 2.1f's Ramp case, 13 = candidate `DW-138`, recorded in frontmatter `deferred:` per Rule 15(a) for the lead to harvest). The single biggest finding: the Phase 3 dense sweep discovered a medium-strength plunge (hold ~270-300 ticks) that ascends the Right Loop lane and falls back -- resolving the Boundaries' Block-If risk for the Right Loop entry cases entirely; no case the committed suite demonstrably drives a real ball through (independent of this story's own teleported assertions) remains unproven reachable. No geometry, tuning, or golden file touched.

**Files changed:**
- `test/util/plan-geometry.ts` (new) -- the three geometry helpers (`pointToSegmentDistanceMm`, `pointInPolygon`, `distanceToPolygonMm`) moved verbatim out of `shot-routing.test.ts` and exported.
- `test/util/shot-cases.ts` (new) -- the manifest: all 39 driven cases transcribed byte-identically from their prior call sites, each with a measured `reachability` verdict.
- `test/util/reachability.ts` (new) -- the reachability engine: `WITNESSES` table, `witnessPath()`, `closestApproachMm()`/`closestApproachOverAll()`, `assertWitnessCorpusHealthy()`.
- `test/shot-reachability.test.ts` (new) -- the in-suite gate (88 tests): anti-vacuity floor, declaration completeness (incl. id-uniqueness), per-case proof, bypass-proof source scan, `DW-130` feed-rail proximity record.
- `test/fixtures/reachability/reachability-sweep.harness.ts` + `vitest.harness.config.ts` (new) -- the dense out-of-process sweep behind `pnpm check:reachability`.
- `test/shot-routing.test.ts` (modified) -- refactored to `driveCase(id)`; every driven parameter, assertion, tolerance and message unchanged in effect (38/38 passing, byte-identical behaviour).
- `package.json` (modified) -- added `check:reachability` script.
- `AGENTS.md` (modified) -- documents the fourteenth script, opt-in and intended green.
- `_bmad-output/implementation-artifacts/spec-2-1e-every-shot-case-proves-its-own-start-point-is-reachable.md` (this file, modified) -- `## Spec Change Log` (verdict table, witness set, measured runtimes, mutations demonstrated), `## Review Triage Log`, frontmatter `deferred:` (13 candidate-`DW-138` entries).

**Review findings breakdown (2026-09-03 pass):** patch 10 (medium 1, low 9) -- all applied and re-verified; defer 5 (medium 1, low 4) -- surfaced, none blocking; reject 3 (low 3) -- theoretical/by-design, dropped. intent_gap 0, bad_spec 0. Full detail in `## Review Triage Log` above.

**Follow-up review recommendation:** `true`. Basis: no high-severity patch, but patched-finding score = 3 x 1 (medium) + 1 x 9 (low) = 12, at or above the 5 threshold.

**Verification performed** (all commands from `## Verification`, run twice -- once before and once after the review-pass patches, both green with identical outcomes):
- `npx vitest run test/shot-routing.test.ts test/shot-reachability.test.ts` -- 126 passed (38 + 88; 88 includes the new id-uniqueness test added during review).
- `pnpm check:reachability` -- exit 0, 471 releases evaluated (~75 s), 0 mismatches against `SHOT_CASES`'s own declarations, byte-identical verdicts pre- and post-patch.
- `pnpm check:ad7` -- exit 1, naming `AD-7`, `DW-70`, `bd_trough` (unchanged, by design).
- `pnpm check:corridor` -- exit 1, naming `DW-137`, `2.1f`, `50.990` (unchanged, by design).
- `pnpm typecheck` -- clean, all three projects.
- `pnpm lint:boundaries` -- OK, 83 files, no violations.
- `pnpm check:headers` / `pnpm check:attributions` -- OK, genuinely re-checked against the 6 new files after staging them (`git add`) so `git ls-files` (which both tools read from) actually sees them.
- `npx vitest run` -- 89 files / 1287 passed / 22 skipped without `BLENDER`; 89 files / 1309 passed / 0 failed with it exported (untracked env var only, never written to a tracked file per `DW-46`).
- `pnpm build && pnpm check:dist && pnpm check:size` -- exit 0 for each.
- `git diff --stat -- assets/src/dragonwar.blend public/assets/dragonwar.glb public/assets/dragonwar.collision.json test/replays/` -- empty, both before and after the patch pass.
- Matrix Test Audit: every I/O & Edge-Case Matrix row covered by a passing test (anti-vacuity floor, declaration completeness, per-case bidirectional proof, structural bypass gate, `DW-130` records, out-of-process sweep) -- confirmed by direct inspection of `test/shot-reachability.test.ts` and a live run of each.
- Rule 19 mutation demonstrations: not independently re-run by this orchestrating pass (time cost), but recorded in `## Spec Change Log` with each mutation's applied change, the observed red (naming the case/witness/measured value), the revert, and the byte-identical tree confirmation (SHA-256 of the collision document unchanged); the `verification-gap` review layer independently traced each AC's `mutation:` line against a real, non-tautological assertion and found no gap.

**Residual risks.**
- 13 candidate-`DW-138` unreachable verdicts are recorded in frontmatter `deferred:`, not yet ledgered (by design, Rule 15(a)) -- the lead must harvest them.
- Among those 13, `top-lane-1`/`top-lane-2`/`top-lane-3`/`pop-bumper-1` carry a live, self-reported uncertainty (also independently raised by this pass's Intent Alignment Auditor): their "unreachable" verdict may reflect this story's single-origin witness-search technique (plunge and plunge-then-left-bat-flip only; `bd_shooter` structurally never reaches the right bat, and `arrangeCradleBall()`'s cradle-placement technique was never exercised) rather than genuine geometry. Not treated as a Block-If violation (reasoned through in the Review Triage Log) and not fixed in this pass -- high fix-risk, no guaranteed payoff -- but flagged for the lead's attention alongside the other candidates.
- `test/shot-reachability.test.ts`'s `segmentToPolygonDistanceMm()` (`DW-130` record) has a theoretical, currently-unexercised gap for a swept segment that fully tunnels through a thin polygon edge; deferred (low severity, no observed failure).
- The `descend-ramp-wall-l`/`descend-ramp-wall-r-cap`/`descend-ramp-turn-cap`/`descend-ramp-return-rail` unreachable verdicts sit inside or adjacent to the `DW-137` bottom-right corridor band -- likely the same root cause, Story 2.1f's to resolve; not this story's to fix.

Status: done
Blocking condition: none
