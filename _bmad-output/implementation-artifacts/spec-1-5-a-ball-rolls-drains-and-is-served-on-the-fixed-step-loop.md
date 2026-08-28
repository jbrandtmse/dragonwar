---
title: 'Story 1.5: A ball rolls, drains and is served on the fixed-step loop'
type: 'feature'
created: '2026-08-28'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md'
warnings: ['oversized']
deferred:
  - summary: >-
      src/sim/physics/loader's addBox() emits 12 HitTriangles and no edge or vertex primitives, so a box's
      EDGES are uncovered exactly the way a wall's corners were (DW-7). Measured: a ball centred in the
      15.65 mm slot between the two static flipper boxes passes straight through geometry narrower than
      its own 26.99 mm diameter. Story 1.6 replaces both flipper boxes with the ported FlipperMover, so
      the defect is transient for the flippers, but addBox() is generic and Epic 2 authors more boxes.
    evidence: |-
      Planning probe on the committed public/assets/dragonwar.collision.json: balls released from rest at
      y=300 for x in 236..282 step 2 rest against a flipper's up-slope face at y=96 for x in [236,248] and
      [266,282], and fall through to y<-50000 for x in [252,260] -- the gap between col_flipper_l
      (x 170..249.375) and col_flipper_r (x 265.025..344.4). src/sim/physics/loader/index.ts addBox() at
      lines 409-444 adds only HitTriangles; the analogous wall path (addWall, 354-390) does add corner
      primitives.
    location: >-
      src/sim/physics/loader/index.ts:409-444
    severity: low
  - summary: >-
      The two static flipper boxes block most of the placeholder's drain aperture, so a ball rolling
      straight down the playfield comes to rest against a flipper's up-slope face at y=96 for most x
      rather than draining. Arguably correct placeholder behaviour (a cradled ball) and Story 1.6 makes
      the flippers move, so no change is planned here -- recorded so the lead knows the drain path is
      narrow by construction and that this story's drain tests deliberately drive a ball whose path
      reaches the aperture.
    evidence: |-
      Drain aperture is x in [200, 314.4] (between col_wall_bottom_l and col_wall_bottom_r); the flippers
      cover 200..249.375 and 265.025..314.4 of it, leaving a 15.65 mm slot. Measured drain window in the
      planning probe: x in [252, 260] out of a 236..282 sweep.
    location: >-
      tools/make-placeholder-blend.py:210-241
    severity: low
---

<intent-contract>

## Intent

**Problem:** Everything the vertical slice needs exists in pieces and nothing joins them. `src/sim/loop/`
and `src/sim/rules/` hold only `.gitkeep`; there is no `src/host/loop.ts`, no `requestAnimationFrame`
accumulator, no `advance()`, no `rules.step()`, no snapshot publisher, and nothing ever calls
`loadCollision()` or `PlayerPhysics.step()` outside a test. `src/host/boot.ts` loads the glb, renders one
frame and stops; no ball is ever created, rendered, served or drained. The placeholder geometry Story 1.4
delivered is also not yet *playable*: measured against the committed
`public/assets/dragonwar.collision.json`, `bd_trough`'s authored eject pose (255, −60, 10) puts a ball in
the drain gap and pins its x at 255.000 forever (ledger `DW-51`); nothing deflects at the lane top, so a
launched ball runs to the top wall and returns straight down the lane at x = 497; the four `sw_trough_*`
zones leave 14 mm gaps that a real draining ball falls through; and the corner primitives the loader emits
sit at physics z = 0, tangent to a deck-rolling ball, so a 36-trajectory sweep produces **zero**
`HitPoint.collide()` calls (ledger `DW-7`).

**Approach:** Build the whole slice — host → loop → physics → rules → scene — on the contracts Story 1.3
froze and the geometry Story 1.4 exported, and close the three geometry gaps in the same `.blend`
re-authoring pass the user has already approved. `sim/loop` becomes the fixed-step conductor
(`advance(elapsedMs, transitions)`, remainder carried, 200 ms cap, rules after every physics step,
`FrameOutput` over all N steps); `sim/physics` gains the cabinet-side machine (swept-segment switch zones,
ball devices that park and eject on command, ball removal); `sim/rules` gains the minimal devices layer and
ball controller AD-19 and AD-6 name; `host/loop.ts` drives it from `requestAnimationFrame` and
`presentation/scene` renders each snapshot's balls at `toScene(pos)` with no interpolation. The geometry
work is `tools/make-placeholder-blend.py` plus one reduction change in `tools/export.py` (an angled
deflector cannot survive the current axis-aligned-bounding-box wall reduction), then a `.blend`
regeneration and re-export.

## Boundaries & Constraints

**Always:**
- **One clock, one arithmetic site (AD-3).** `TICK_HZ` may be *named* only in `src/sim/contracts/time.ts`
  and `src/sim/table/tuning.ts` — `pnpm lint:boundaries` enforces this literally, including through a
  barrel re-export. The loop therefore never names `TICK_HZ`: `time.ts` grows the small helpers the
  accumulator needs and the loop imports those. No binding under `src/sim/**` outside `tuning.ts` may be
  named `…Ms`/`…_MS` and assigned a numeric literal — so the 200 ms cap is expressed in **ticks** in
  `time.ts`, not as a millisecond constant in the loop.
- **`sim/` is DOM-free, engine-free, wall-clock-free and unseeded-random-free (AD-1, AD-3, AD-16).**
  `tsconfig.sim.json` removes the DOM lib and every ambient type, so `fetch`, `performance` and
  `requestAnimationFrame` are compile errors there. The host fetches and parses
  `dragonwar.collision.json`; `sim/loop` receives the already-parsed value.
- **`host/**` never imports `sim/physics` or `sim/rules` (AD-16).** The host talks to `sim/loop`,
  `sim/contracts`, `sim/table` and `presentation/**` only, so the loop must expose the factory that
  internally calls `loadCollision()`.
- **`presentation/**` imports only `sim/contracts` and `sim/table` (AD-16).** The ball mesh reads its
  diameter from `TABLE.reference.ballMm` and its position through `toScene()`; it never touches physics.
- **Edges from one source per class (AD-2).** Physics emits playfield and mechanism `SwitchEvent`s from
  swept-segment zone tests with per-switch hysteresis and `settleTicks`; `sim/loop` emits the **button**
  switches (`s_start`, `s_flipper_l`, `s_flipper_r`, `s_plunger`) from `InputFrame` transitions; rules
  never debounce. A parking device's slot switches are closed and opened by the **device** (AD-6), so
  their `sw_` zones are the device's entry geometry and must not also emit switch edges.
- **Devices park and eject only on command (AD-6).** `bd_trough` parks an entering ball unconditionally
  into the lowest empty slot, removes it from the simulated set and closes that slot's switch; on `pulse
  c_trough_eject` it spawns the highest filled slot's ball at the authored eject pose and speed and opens
  the switch. Device counts in `GameState` are the number of closed slot switches and nothing else.
- **One converter (AD-10).** `src/sim/table/frames.ts` stays the only file that converts units or axes.
  Every physics↔table crossing goes through `toPhysics()`/`fromPhysics()`/`toPhysicsPlane()`; every
  table→scene crossing through `toScene()`.
- **Blender owns placement; `export.py` is the enforcer (AD-11).** New collision geometry is authored in
  `assets/src/dragonwar.blend` (regenerated through `tools/make-placeholder-blend.py`) and reaches
  `sim/` only through `public/assets/dragonwar.collision.json`. No geometry constant is hard-coded in
  `src/**`.
- **Guards are never weakened to make geometry fit.** `tools/export.py`'s rotation guard
  (`validate_col_geometry_reducible()`, lines 215-266), its degenerate-extent guard, its property-presence
  checks and every `loadCollision()` throw stay exactly as strict; the angled deflector is authored with an
  identity world matrix and angled *mesh vertices*, and the reduction is generalised to represent that.
- **Provenance before the file (CLAUDE.md, hard gate).** `assets/src/dragonwar.blend`,
  `public/assets/dragonwar.glb` and `public/assets/dragonwar.collision.json` already carry
  `ATTRIBUTIONS.md` rows; regenerating them changes what those rows describe, so the rows' dates and
  wording are updated **before** the regeneration runs. No third-party file or dependency is added by this
  story; if one becomes necessary, its row lands first with the licence verified at its own source.
- **Every new source file carries the GPL-3.0 header** (`# ` form for `.py`), and non-ASCII characters in
  source are authored as escape sequences, never literal bytes.
- **CI has no Blender.** The committed `.glb` / `.collision.json` are what CI and the default suite
  consume; every Blender-dependent test skips cleanly when `BLENDER` is unset. The current baseline is 442
  passing with `BLENDER` set / 423 passing + 19 skipped without.
- **The pinned CSP is not touched.** `default-src 'self'; connect-src 'self' blob:; img-src 'self' blob:`
  already admits the same-origin `fetch` of `./assets/dragonwar.collision.json` under `connect-src 'self'`.

**Block If:**
- The determinism acceptance criterion ("final state hashes identical across 30/60/120 Hz cadences") turns
  out to be unachievable from the delivered physics — Rule 5 `intent gap` HALT naming it. *(Not expected:
  the accumulator was simulated numerically during planning and all three cadences produce exactly 5000
  steps over 5 s, and exactly 5200 with the 2 s gap. See Design Notes, "The determinism AC is achievable".)*
- Adding `removeBall()` to `src/sim/physics/game/player-physics.ts` would require weakening
  `test/sim-boundary.test.ts`'s ported-file assertion rather than leaving the file's existing vpx-js
  copyright block and port marker intact — HALT `blocked`.
- Generalising `tools/export.py`'s wall reduction turns out **not** to reproduce the committed
  `dragonwar.collision.json` byte-for-byte for the seven existing walls before any new geometry is added —
  HALT `blocked` rather than accepting an unexplained artifact diff. *(Verified during planning against the
  committed `.blend`: the plan-view convex hull equals the current AABB footprint for all seven, exactly.)*
- A geometric figure this story needs is neither derivable from the existing placeholder constants nor
  defensibly authorable as placeholder placement — HALT naming it rather than inventing it. A *physics
  tunable* with no stated unit, and anything on the PRD addendum's do-not-invent list, is never authored.
- The trough's entry mechanism cannot be expressed through `sw_` zones without adding a switch to
  `TABLE.switches` beyond Story 1.3's enumerated Epic 1 set — HALT rather than adding `s_drain` silently.
  *(Not expected: see Design Notes, "How a draining ball enters `bd_trough`".)*

**Never:**
- Never edit `tools/spike-1/scene.ts`, `test/spike-1.test.ts`'s scene construction, `docs/spikes/spike-1.md`
  or `docs/spikes/spike-3.md`. `DW-14` carries a standing instruction not to redesign the Spike 1 scene;
  this story re-takes the characterisation on the *new* geometry in a *new* test and leaves Spike 1's
  baseline valid.
- Never touch a solver constant in `src/sim/physics/constants.ts` (AD-15) or the AD-15 verbatim-constants
  pin in `test/sim-boundary.test.ts`.
- Never add a `Table` interface, a table-loading API, a plugin API or runtime table selection (AD-1).
- Never let a device-name string literal (`s_ c_ l_ f_ gi_ bd_ shot_ show_`) appear anywhere in `src/**`
  outside `src/sim/table/dragonwar.ts`.
- Never build what a later story owns: the `FlipperMover`, the manual plunger and key mapping (1.6);
  nudge, the tilt bob, the slam detector (1.7); replay record/play, goldens and the state hash *as a
  shipped artifact* (1.8); the dev tuning panel (1.9); real playfield geometry, the full switch set, ball
  search, ball save, the DMD, `lampsOf()` and the lighting grammar (Epic 2+).
- Never widen the deploy trigger, weaken the CSP, change `TICK_HZ`, or edit anything under
  `_bmad-output/planning-artifacts/`, `AGENTS.md`, `CLAUDE.md`, `NOTICE`, `LICENSE`, `index.html`,
  `vite.config.ts`, `vitest.config.ts`, `docs/**` or `.gitattributes`.
- Never write to `_bmad-output/implementation-artifacts/deferred-work.md`; deferred findings go in this
  spec's frontmatter `deferred:` list and the lead harvests them.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Frame owes whole steps | `advance(16.667, [])` at `TICK_HZ = 1000` | 16 physics+rules steps run; the 0.667 ms remainder is carried into the next frame | No error expected |
| Frame owes zero steps | `advance(0.4, [])` with no carried remainder | N = 0: `FrameOutput.events`, `.contactEvents` and `.commands` are empty arrays and `.snapshot` is the previous frame's snapshot, unchanged (same `tick`) | No error expected |
| Owed time past the cap | `advance(2000, [])` | Exactly `MAX_OWED_TICKS` steps run; `sim_time_discarded { ms }` is `events[0]`, `ms` is the discarded amount, and the carried remainder is reset to zero | Exactly one event per capped frame, never zero and never two |
| Tick-stamped input | Two `InputTransition`s at ticks *t* and *t+5* inside one frame | Each tick applies the frame in force at that tick (the most recent transition at or before it); button-switch edges are emitted at the tick the frame changes | A transition stamped before the frame's first tick applies from the first tick; a transition stamped after its last tick is carried to the next frame |
| Commands land next tick | Rules issue `pulse c_trough_eject` at tick *t* | Physics consumes it at tick *t+1*, never at *t* | No error expected |
| Boot ball count | A freshly created loop | `bd_trough`'s four slot switches are closed, `machine.deviceSlots.bd_trough` is `[true, true, true, true]`, `machine.ballsInPlay` is 0, and `snapshot.balls` is empty | A device whose closed-slot count is not `TABLE.ballDevices.bd_trough.capacity` at boot throws a descriptive load-time error naming the device, the count and the capacity |
| Trough eject | `pulse c_trough_eject` with all four slots filled | One ball spawns at the authored eject pose with the authored eject speed; the **highest** filled slot switch opens as one edge; `snapshot.balls` has one entry | A `pulse` with every slot empty emits `eject_failed { device }` and spawns nothing |
| Served ball closes the lane switch | The ejected ball settles in the shooter lane | `s_shooter_lane` closes exactly once (one `closed: true` edge) and the ball rests inside the `sw_shooter_lane` zone | A settle class of 0 ms still produces exactly one edge, not one per tick |
| Autolaunch | `pulse c_autolaunch` with a ball in the shooter lane | The ball leaves the lane, `s_shooter_lane` opens as one edge, the devices layer emits `ball_launched`, and `machine.ballsInPlay` becomes 1 | A `pulse` with no ball in the lane emits `eject_failed { device }` |
| Drain and park | A ball's swept segment enters any `sw_trough_*` zone | Physics parks it in the **lowest empty** slot, that slot switch closes as one edge, the ball is removed from the simulated set and leaves `snapshot.balls`; the ball controller decrements `ballsInPlay` from the closed-slot count | A ball entering when every slot is full emits `device_overflow { device }` and the ball stays simulated |
| Swept-segment zone crossing | A ball crossing a zone in a single tick, entering and leaving between two positions | The zone test uses the ball's per-tick swept **segment**, never its end position, so the crossing is detected | A ball fast enough to cross a zone entirely within one tick still produces a close/open pair |
| Collision-document handshake | A document whose `version`, `units` or `frame` is absent or not `1` / `"mm"` / `"table"` | `loadCollision()` throws naming the field, the value found and the value expected — a `units: "m"` document must never load silently at 1000x scale | Closes ledger `DW-45` |
| Tunable conversion guards | A `…Ms` tunable whose value is negative, or a positive value that rounds to 0 ticks at the live `TICK_HZ` | `resolveTuning()` throws naming the tunable, its ms value and the resulting tick count | A tunable authored as exactly `0` ms still converts to 0 ticks without throwing. Closes ledger `DW-35` |
| Wall corner reached | A ball rolling at deck height (centre z = ball radius) into a wall footprint corner | The corner primitive's `collide()` runs — the corner is reachable by a rolling ball, not only by one placed at z = 0 | Closes ledger `DW-7` |
| Non-convergent solver input | A ball driven at high speed into a slot narrower than its own diameter | Every step terminates by forced advance (`STATICTIME`), proven by an **out-of-process** run with a hard wall-clock timeout | An in-process assertion cannot detect the named failure — a non-terminating step hangs synchronously and defeats both a per-tick ceiling and Vitest's `testTimeout`. Closes ledger `DW-8` |
| Angled collision geometry | A `col_` wall whose mesh footprint is not a rectangle | `tools/export.py` emits its true plan-view footprint polygon; `loadCollision()` builds one oriented face per edge | A `col_`/`sw_` node with a rotated or sheared **world matrix** is still rejected non-zero, naming the node and the off-diagonal term |
| Eject pose vs its feed zone | Any ball device declaring a feed target | Its authored eject pose, read from the committed collision document, resolves inside that target's `sw_` zone bounds | A device whose pose falls outside fails the test naming the device, the pose, the zone and the axis that missed |
| Cadence independence | One scripted 5 s input sequence driven at 30, 60 and 120 Hz frame cadences, with one 2 s gap | The three runs execute the same number of steps and produce identical final state hashes; each produces exactly one `sim_time_discarded` event | A step-count difference fails before the hash comparison, so a hash mismatch is never misdiagnosed |
| Scene renders the ball | A `FrameOutput` whose snapshot holds one ball | The ball mesh exists at `toScene(pos)` with no interpolation, and `playfield_root` carries the snapshot's `effectivePitchDeg` | A ball that leaves the snapshot has its mesh removed on the same frame |

</intent-contract>

## Code Map

**Read-only governing sources (do not edit):**
- `_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md`
  — the ADR registry (there is no `docs/adr/`). Dependency graph at lines 37-61 (**`loop --> physics`,
  `loop --> rules`, `loop --> table`, `host --> loop`, `pres --> table` are all permitted arrows; `host`
  never reaches `physics` or `rules`**). AD-1 line 69, AD-2 line 75, AD-3 line 81, **AD-4 line 87** (the
  loop contract plus its own sequence diagram at lines 103-110), AD-5 line 112, **AD-6 line 118**, AD-7
  line 124, AD-9 line 162, AD-10 line 168, AD-11 line 174, AD-15 line 198, AD-16 line 204, AD-17 line 210,
  AD-18 line 218, **AD-19 line 224**.
- `_bmad-output/planning-artifacts/epics.md` lines 466-499 — Story 1.5's six acceptance criteria; lines
  500-534 — Story 1.6's, the immediate consumer.
- `docs/spikes/spike-1.md`, `docs/spikes/spike-3.md` — dated records. **Leave both unedited.**
- `tools/spike-1/scene.ts` — **read for shape, never edit.** `createSpikeScene()` at lines 96-176 is the
  worked example of the whole `PlayerPhysics` setup sequence (`setGravity` 115 → `setPlayfieldHit` 125 →
  `setTopGlassHit` 133 → `addStaticHitObject` 151/161 → `finalizeStatics` 163 → `addBall` 176) and
  `step()` at 182-184. `MM_PER_VU = 0.53975` line 44 (superseded for production code by `frames.ts`),
  `STEPS_PER_FRAME_60HZ = Math.ceil(TICK_HZ / 60) = 17` line 59.

**Existing code this story extends (anchors verified at `e4b132b`):**
- `src/sim/contracts/time.ts` — `TICK_HZ = 1000` at line 37, with the PROVISIONAL comment block that
  `test/time-contract.test.ts` pins by regex (lines 39-60 of that test: value ∈ {1000, 480}, the words
  `PROVISIONAL` and `NOT ratified`, the ledger entry name). **Keep every pinned phrase intact** when
  adding helpers below it.
- `src/sim/contracts/index.ts` lines 13-17 — `TICK_HZ` is deliberately **not** re-exported from the
  barrel, because `tools/boundary-lint.mjs` enforces "named anywhere" literally. Any new export from
  `time.ts` that the loop needs must be imported from `'../contracts/time'` directly for the same reason.
- `src/sim/contracts/snapshot.ts` — `Vec3Mm` line 22 ("table-frame position or velocity vector,
  millimetres"), `BallSnapshot` line 29 (`id`, `pos`, `vel`, `speed`, optional `surface`),
  `MechanismsSnapshot` line 73 (five keys; `devices` is `Record<TBallDevice, { slots: boolean[] }>`),
  `Snapshot` line 87 (`tick`, `balls`, `mechanisms`, `game`, `effectivePitchDeg`), `FrameOutput` line 109
  (`snapshot`, `events`, `contactEvents`, `commands`). **`FrameOutput` carries no switch events and no
  coil commands** — those are internal to the loop, by design.
- `src/sim/contracts/state.ts` — `GameState` line 137 (`tick`, `phase`, `machine`, `players`,
  `currentPlayer`, `modes`, `rng`), `MachineState` line 64 (`ballsInPlay`, `hardwareEnabled`, `ballSave`,
  `tilt`, `multiball`, `highscores`, `deviceSlots`), `GamePhase` line 27.
- `src/sim/contracts/events.ts` — `SwitchEvent` line 13, `ContactEvent` line 67 with `ContactKind` line 49
  (`eject` is already in the union), `SimTimeDiscardedEvent` line 89, `BallLaunchedEvent` line 112,
  `EjectFailedEvent` line 140, `DeviceOverflowEvent` line 154, `SemanticEvent` line 165.
  `CONTACT_SURFACES` line 30 is a runtime value.
- `src/sim/contracts/input.ts` — `InputAction` line 12, `InputFrame` line 27 (**every action always
  present**, no unset state), `InputTransition` line 34.
- `src/sim/table/dragonwar.ts` (219 lines) — `TABLE`, deep-frozen. `reference` line 87; `switches` line 94
  (eleven, each with a `settleClass`); `coils` line 111; `ballDevices` line 118 — `bd_trough` at 122
  (`kind: 'parking'`, `capacity: 4`, `slots` in fill order, `ejectCoil`, `ballSearchOrder`) and
  `bd_shooter` at 141 (`kind: 'non-parking'`, `entry: 's_shooter_lane'`, `ballSearchOrder`); `nodes` line
  197; `physMaterials` line 215. **`bd_trough` declares no feed target at all — that is the one small
  field this story adds.**
- `src/sim/table/names.ts` — `SwitchName` 28, `CoilName` 29, `BallDeviceName` 35, and the bound seam
  aliases 50-62 (`SwitchEvent`, `CoilCommand`, `Snapshot`, `FrameOutput`, `GameState`, `MachineState`).
  Every consumer imports the bound alias from here, never the generic from `contracts`.
- `src/sim/table/tuning.ts` — `TUNING` line 55; `materials` 61 (`default` and `flipper_rubber`, each with
  `scatter: 0`); `switchSettleMsByClass` 92; `msToTicks()` **lines 169-174** (`Math.round((ms * tickHz) /
  1000)` behind a single `Number.isFinite` check — the `DW-35` site); `resolveTuning()` line 191, with
  `tickHz` injectable so the conversion is observable at a rate other than 1000.
- `src/sim/table/frames.ts` — `MM_PER_VU` 51, `MM_PER_IN` 62, `glbToTable` 75, `toScene` 85, `toPhysics`
  94, `fromPhysics` 110, `toPhysicsPlane` 132. Header lines 31-46 explain the y flip: physics +y runs
  **down-slope toward the player**, table +Y runs up the playfield, so `physicsY = (h − tableY) /
  MM_PER_VU`. A table-frame **velocity** crosses the same way: `(vx, vy, vz)` → `(vx, −vy, vz) /
  MM_PER_VU`, and physics velocity is per VP time unit T (1 T = 10 ms), so mm/s → VU/T is
  `(v / MM_PER_VU) / 100`.
- `src/sim/physics/game/player-physics.ts` — `balls: Ball[]` is **`public readonly`** at line 89 (the
  array is mutable; the reference is not). `addBall()` 122-127 pushes to `balls`, `movers`,
  `hitObjectsDynamic` and rebuilds `hitOcTreeDynamic` via `fillFromVector`; `addStaticHitObject()` 138-148
  (throws after finalize); `setPlayfieldHit()` 150, `setTopGlassHit()` 154, `finalizeStatics()` 165-177
  (throws on a second call); `step()` 326-347 — **no arguments**, always advances exactly 1 ms
  (`PHYS_FACTOR = 0.1` T), and throws three descriptive guards if the playfield plane, the glass plane or
  `finalizeStatics()` are missing; `setGravity(slopeDeg, strength)` 349-353. **Header lines 60-65 state the
  deviation this story completes: "Dropped `createBall()`/`destroyBall()` … in favour of the simpler
  `addBall(ball)` … The harness never removes a ball, so `destroyBall()` has no caller and is not ported."**
- `src/sim/physics/ball/ball.ts` 42/50 — `Ball(id, data, state, initialVelocity, tableData)`; `id` is
  caller-assigned, nothing auto-generates it. Position: `ball.state.pos` (`Vertex3D`, VP units,
  `ball-state.ts:43`). Velocity: `ball.hit.vel` (`ball-hit.ts:89`, VU per T). Radius/mass:
  `ball.data.radius` / `ball.data.mass` (`ball-data.ts:34-38`, default radius 25 U). `TABLE.reference.ballMm
  / 2 / MM_PER_VU = 25.0` exactly.
- `src/sim/physics/loader/index.ts` (523 lines) — `CollisionDoc` interface **lines 99-102: only `nodes` and
  `switchZones`; `version`/`units`/`frame`/`reference`/`devices` are all read past** (`DW-45`, and the
  `devices` note at lines 90-98 names Story 1.5 as its first reader). `parseCollisionDoc()` 149,
  `assertReferenceDimensions()` 252, `applyMaterial()` 284, `orientedEdge()` 335, `addWall()` 354 — **the
  corner loop at lines 385-389 emits `new HitPoint(new Vertex3D(point.x, point.y, zLowVu))`, the `DW-7`
  site** — `addBox()` 409, `loadCollision()` 470 returning `{ physics, switchZones }` where each zone is
  `{ name, switch, minMm, maxMm }`.
- `src/sim/physics/hit-line-z.ts` — `HitLineZ(xy: Vertex2D, zlow?, zhigh?)` at lines 31-41: a **vertical**
  line segment spanning a z range at one (x, y). Already ported, already carries its vpx-js header and port
  marker, currently has no caller. This is the primitive a wall corner needs.
- `src/sim/physics/hit-point.ts` 34-42 — `HitPoint(p: Vertex3D)`, whose `hitBBox` is the single point;
  `collide()` at line 119.
- `src/sim/physics/constants.ts` — `PHYS_FACTOR = 0.1`, `GRAVITYCONST = 1.81751`,
  `DEFAULT_TABLE_GRAVITY = 0.97`, `STATICTIME = 0.005`, `STATICCNTS = 10`, `BALL_BALL_RESTITUTION = 0.8`.
  Unit block at lines 54-65: 1 U = 0.53975 mm, 1 T = 10 ms. **Verbatim; never edited.**
- `src/sim/physics/game/event-proxy.ts` 53-63 — `EventProxy.fireGroupEvent()` is an explicit **no-op stub**
  and no static hit object in the loaded body ever sets `.obj`/`.fe`, so `HitObject.fireHitEvent()` never
  reaches a consumer. `PlayerPhysics.contacts` (line 94) is cleared at the end of every
  `physicsSimulateCycle` iteration (302-303), so it is always empty by the time `step()` returns.
  **There is no working collision callback today** — see Design Notes, "Where switch edges and contact
  events come from".
- `src/host/boot.ts` — `GLB_URL = './assets/dragonwar.glb'` line 19; `showError()` 74-94; `onBegin()`
  96-126 (press-to-begin → `bootScene(canvas, GLB_URL)` at 109 → publishes `window.__dragonwarBoot` at
  111; every throw lands in `showError`); gate wiring 133-139. Header lines 12-14 already say
  "`src/host/loop.ts` … does not exist yet — it is Story 1.5's". **No `requestAnimationFrame` anywhere
  under `src/` today; no fetch of the collision document.**
- `src/presentation/scene/create-engine.ts` — `BootSceneResult { engine, scene, renderer, firstFrameMs,
  webgpuFallbackReason? }` 176-183; `LoadAndRenderResult { scene, firstFrameMs, playfieldNodes }` 226-232;
  private `loadAndRenderOnce()` 244-307 (sets `useRightHandedSystem` 246, camera, light, `ImportMeshAsync`,
  `resolvePlayfieldNodes` + `applyPitch(nodes, TABLE.reference.pitchDeg)` at 270-271, then
  `engine.runRenderLoop(...)` at 292-303 and resolves `firstFrameMs` from
  `scene.onAfterRenderObservable.addOnce` 288-291); `loadAndRenderOnceForTests()` 320-326;
  `bootScene()` 335-419. **`bootScene()` already returns `scene` and `engine` but not `playfieldNodes`,
  and `boot.ts` currently discards both.**
- `src/presentation/scene/playfield.ts` — `PlayfieldNodes` 20-24, `resolvePlayfieldNodes(scene)` 55-61
  (throws on a missing or duplicated node), `applyPitch(nodes, pitchDeg)` 76-86 (rotates `playfieldRoot`
  about `pivotPitch`, never touches `cabinetRoot`).
- `tools/export.py` — `COL_SHAPES` line 38; `AXIS_ALIGNED_EPSILON` 44; `DEGENERATE_EXTENT_MM` 48;
  `validate_col_geometry_reducible()` **215-266** (the rotation guard, with its own measured rationale);
  `world_bbox_mm()` 293-301; **`wall_footprint_mm(bbox_min, bbox_max)` 304-328 — the AABB reduction this
  story generalises**; `build_collision_nodes()` 331-355; `build_switch_zones()` 358-371;
  `build_devices()` 374-397 (pose = `matrix_world.translation`, dir = `matrix_world.to_3x3() @ (0,1,0)`);
  `run()` 436-521 with its build-in-memory-then-`.tmp`-then-`os.replace()` ordering.
- `tools/make-placeholder-blend.py` — lane constants **62-71** (`LANE_CLEAR_MM = 34.0`,
  `LANE_X0_MM = 468.4`, `LANE_WALL_TOP_Y_MM = 950.0`), `DRAIN_X0_MM = 200.0` / `DRAIN_X1_MM = 314.4` at
  73-74; walls 210-222; flippers 224-241; **switch zones 243-257** (`sw_shooter_lane` at
  `(484.4, 10, 0)`-`(510.4, 60, 30)`; `sw_trough_1..4` at `trough_slot_xs = [210, 240, 270, 300]`, each
  ±8 mm in x, y −80..−40); **ball devices 259-264** (`bd_trough` at `(255.0, −60.0, 10.0)`, `bd_shooter`
  at `(498.0, 35.0, 13.0)`, both with identity rotation so the exported dir is `(0, 1, 0)`); presentation
  selection 300-311 (`bd_trough`/`bd_shooter` **are** in the glb subset, so moving the trough empty changes
  `dragonwar.glb`).
- `tools/export-assets.mjs` — `buildTableDump()` 50-62 passes `table.ballDevices` **wholesale**, so a new
  field on a device flows into `export.py`'s validation dump with no change here.
- `tools/boundary-lint.mjs` — banned globals 72-87; `checkTickMsRule()` **386-423** (`TICK_HZ` exempt only
  in `src/sim/contracts/time.ts` and `src/sim/table/tuning.ts`; the literal-ms `MS_BINDING_PATTERN` at
  379-382 matches an identifier ending `Ms`/`_MS` assigned a numeric literal, exempt only in `tuning.ts`);
  `checkDeviceNameLiterals()` 426-449 with `DEVICE_NAME_PATTERN` at line 71, exempt only in
  `src/sim/table/dragonwar.ts`; the coverage line at 587 counts `.ts` files under `src/`.
- `tools/check-dist.mjs` 279-303 — requires both `dist/assets/dragonwar.glb` and
  `dist/assets/dragonwar.collision.json`; its message already says "Story 1.5 owns its runtime consumer".
- `tools/size-budget.mjs` line 56 — `BUDGET_BYTES = 2_750_000` gzipped against a ~0.75 MB baseline. The
  committed glb is 6,508 bytes and the collision file 8,642 bytes; no risk.
- `vitest.config.ts` line 8 — `include: ['test/**/*.test.ts']`, `environment: 'node'`, `testTimeout:
  60_000`, no setup files. **Out of footprint — do not edit.** A test file that must be excluded from the
  default run therefore needs its own config under `test/fixtures/**` (see task 24).
- `tsconfig.sim.json` — `lib: ["ES2023"]`, `types: []`. `tsconfig.app.json` covers `src/host/**` and
  `src/presentation/**` with DOM. `tsconfig.node.json` covers `test/**` and `tools/**`, excluding
  `test/fixtures/**`.
- `test/sim-boundary.test.ts` — **a trap for this story.** Lines 43-120 require every file under
  `src/sim/physics/**` to satisfy the ported structure (upstream VPDB copyright block + port marker)
  **unless it is named in the declared allowlist `AUTHORED_FILES` at line 82**, currently
  `new Set(['loader/index.ts'])`. The comment above it is explicit that membership is "a deliberate,
  reviewable one-line edit in this list" and that a content-based rule was rejected. The three new
  authored files under `src/sim/physics/` must therefore be **declared there** as well as carrying the
  GPL-3.0 header, or the suite goes red. Lines 73-95 are the AD-15 verbatim solver-constants pin: untouched.
- `tools/dependency-cruiser.config.mjs` line 98-105 — `host-no-physics-or-rules` is a **direct**-dependency
  rule (`from: '^src/host/'`, `to: '^src/sim/(physics|rules)/'`), so `host/boot.ts` → `sim/loop` →
  `sim/physics` is permitted; only a direct host import of physics or rules is an error.
- `test/table.test.ts` 85-107 — pins `bd_trough`'s `kind`/`capacity`/`slots`/`ejectCoil`/`ballSearchOrder`
  and `bd_shooter`'s `kind`/`entry`. Adding a field does not break these, but the new field wants its own
  assertion here.
- `test/collision-loader.test.ts` — **169-208 is the `DW-7` test**, which fires a ball placed at *z = 0*
  (its own comment concedes "a ball resting at z = ball radius … only ever comes within radius of a z = 0
  point when its horizontal offset is a fraction of a millimetre — exactly the reachability DW-7
  questioned"). Also 211-245 (LineSeg face guard), 247-291 (interior-divider guard), 293-350 (HitTriangle
  face guard), 562-645 (lane traversability, including a discriminating "…and the same run against the
  PRE-widening 20 mm lane does not" case).
- `test/asset-contract.test.ts` 116-181 — collision-document grammar, `surface`/`physMaterial`/`switch`
  value checks and the reference-dimension checks; 182-190 the `TABLE.physMaterials` ↔ `TUNING.materials`
  drift pin.
- `test/scene-smoke.test.ts` — `readFileSync` of the committed glb turned into a `data:` URL (35-39),
  hand-rolled `NullEngine` + `LoadAssetContainerAsync` describe at 78-118, and the **real shipped path**
  through `loadAndRenderOnceForTests()` at 153-374 including a pitch-about-pivot geometry test and a
  camera-frustum containment test. This is the pattern any new presentation test follows.
- `ATTRIBUTIONS.md` lines 66-76 — the three "Generated content" rows for the `.blend`, the `.glb` and the
  `.collision.json`, all dated 2026-08-28, plus the note that Blender itself is a GPL **tool** with no row.

**Verified facts established during planning on 2026-08-28 (cite, do not re-derive).** All physics figures
below come from running the committed `public/assets/dragonwar.collision.json` through the real
`loadCollision()` under Vitest, with `setGravity(6.5, DEFAULT_TABLE_GRAVITY * GRAVITYCONST)`; the Blender
figures come from running Blender 5.2.1 headlessly against the committed `.blend`:

- **`DW-51` reproduced exactly.** From `bd_trough`'s current pose (255, −60, 10) with dir (0, 1, 0), at
  eject speeds 500 / 1500 / 3000 / 6000 mm/s, the ball's x stays **255.000 for the entire 5000-step run**
  and it exits through the drain gap (final y −4298 to −12877 mm). No eject speed can steer it 243 mm.
- **The lane-foot pose works.** Spawned at the lane centre `LANE_X0_MM + WALL_T_MM + LANE_CLEAR_MM/2 =
  497.4`, y 20, z = ball radius 13.495, at 500 mm/s: x stays 497.400, the ball rises to y 105.6 and comes
  to rest at **(497.40, 13.49, 13.53)** — the top face of `col_wall_lane_bottom` plus one ball radius —
  which is **inside `sw_shooter_lane`** (x 484.4-510.4, y 10-60, z 0-30). At 0 / 250 / 500 / 800 / 1200
  mm/s it always rests there; at 1200 mm/s it already reaches y 515.7, so the eject speed must stay modest.
- **The second gap is real.** With the committed geometry and no deflector, a ball launched up the lane at
  2000 / 4000 / 6000 / 8000 mm/s reaches y ≈ 1051-1053 (the top wall minus a radius), **never leaves x =
  497.00**, and returns to rest at the lane foot. `enteredField` is false at every speed.
- **An angled deflector fixes it, and the geometry is verified.** A triangular prism whose plan-view
  footprint is `[(480.4, 1010), (514.4, 976), (514.4, 1010)]`, z 0-50, turns the launched ball into the
  main field at every speed ≥ 1800 mm/s (at 1600 mm/s the ball does not reach it and falls back —
  `maxY = 902`). At 2500 mm/s the ball leaves the `sw_shooter_lane` zone at tick 18, crosses into the main
  field, reaches the far left wall (min x ≈ 13.5) and drains, crossing y = 0 at x ≈ 234.5. The maximum
  ball-centre z over the whole flight is 20.7 mm against 50 mm walls, so nothing goes over a wall.
- **The current wall reduction cannot express that shape.** `wall_footprint_mm()` returns the four corners
  of the **axis-aligned bounding box**, and `validate_col_geometry_reducible()` rejects any `col_`/`sw_`
  node whose world matrix has an off-diagonal term > 1e-9. An angled deflector authored as a rotated box
  is rejected; one authored as an angled *mesh* is silently AABB-ised into a slab that blocks the whole
  lane. A reduction change is therefore mandatory, not optional.
- **The generalised reduction is byte-neutral.** Computing each wall's plan-view **convex hull** over its
  own world-space mesh vertices (rounded to `BBOX_ROUND = 4`, wound counter-clockwise, rotated so the
  lexicographically smallest (x, y) point is first) reproduces the current AABB footprint **exactly, for
  all seven committed walls** — measured in Blender against `assets/src/dragonwar.blend`:
  `col_wall_left`, `col_wall_top`, `col_wall_right`, `col_wall_lane`, `col_wall_bottom_l`,
  `col_wall_bottom_r`, `col_wall_lane_bottom` all compare `identical = true`.
- **The trough zones have holes a real ball falls through.** The drain aperture is x ∈ [200, 314.4]
  (between `col_wall_bottom_l` and `col_wall_bottom_r`); the four `sw_trough_*` zones cover only
  [202, 218], [232, 248], [262, 278], [292, 308]. Measured drain crossings from launched balls landed at
  x = 205.5, 224.9, 229.7, 231.7 and 244.9 — **three of five missed every zone.** Retiling the four zones
  as four contiguous 28.6 mm boxes spanning the full aperture, y −80 to 0, z 0-20, gives **zero misses**
  across a 0.5 mm sweep of the aperture, and the end-to-end launched ball then enters `sw_trough_2`.
- **`DW-7` answered, and its fix verified.** A 36-trajectory sweep of balls rolling at deck height into
  wall corners of the committed body produces **0** `HitPoint.collide()` calls. The reason is geometric:
  the corner `HitPoint` sits at physics z = 0 while a rolling ball's centre rides at exactly one radius
  (25.0 VU) above it, so the point is tangent to the ball's surface by construction. In a controlled
  side-by-side scene, the same ten rolling trajectories produce 1 corner `collide()` call with
  `HitPoint(z = zLow)` and **4** with `HitLineZ(zLow..zHigh)`.
- **The flippers are static boxes with uncovered edges.** `col_flipper_l` spans x 170-249.375 and
  `col_flipper_r` x 265.025-344.4 at y 57.5-82.5, so between them is a 15.65 mm slot — narrower than the
  26.99 mm ball. A ball dropped straight down rests against a flipper's up-slope face at y = 96 for x ∈
  [236, 248] and [266, 282], and passes **through** the slot for x ∈ [252, 260], because `addBox()` emits
  12 `HitTriangle`s and no edge or vertex primitives. Story 1.6 replaces both boxes with the ported
  `FlipperMover`; this story neither relies on nor repairs that behaviour, and simply drives its drain
  test with a ball whose path reaches the aperture.
- **The determinism AC is achievable.** Simulating the AD-4 accumulator (owed = elapsed × `TICK_HZ`,
  fractional remainder carried, 200 ms cap) over 5 s of frames: 30 Hz → 5000 steps, 60 Hz → 5000,
  120 Hz → 5000, with residual remainders of order 1e-13. Adding one 2000 ms frame: 5200 / 5200 / 5200
  steps and exactly one discard each. A ±0.0001 ms per-frame jitter changes nothing.
- **Solver termination under an adversarial input.** A ball driven at 9000 mm/s into a hand-built 5 mm slot
  (narrower than its diameter) completed 4000 steps in 77.2 ms with a **worst single step of 2.591 ms**,
  against roughly 0.04 ms for an ordinary step — the forced-advance path is genuinely stressed, and the
  step still terminates.
- **`DW-14` re-characterisation, Node leg.** Four balls in motion on the real placeholder geometry, 600
  frames × 17 ticks: **mean 0.613 ms, p95 0.687 ms** per 60 Hz frame — against Spike 1's derived
  3.75-4.09 ms Node figure on its own near-quiescent scene. Treat this as a planning measurement to be
  re-taken as a committed test, not as the story's result.
- **An out-of-process TS harness is feasible.** Plain `node --experimental-transform-types` cannot load
  `src/sim/physics/**` (it resolves the enum in `game/event.ts` but then fails on
  `math/vertex2d.ts:31`'s value-form import of the `Vertex` *type*). A nested `vitest run --config
  <config under test/fixtures/>` does work and costs about 2.4 s — measured. This is the only ready-made
  vehicle for `DW-8`'s hard timeout, and it needs no change to the out-of-footprint `vitest.config.ts`.
- Working tree clean at `e4b132b`; branch `DW-1-epic1`; Node 24.16.0; pnpm 11.24.0; Blender 5.2.1 LTS at
  the machine-specific path the `BLENDER` environment variable must carry (**never** committed).

**Files this story creates:**
- `src/sim/physics/switches.ts`, `src/sim/physics/devices.ts`, `src/sim/physics/machine.ts`
- `src/sim/rules/index.ts`, `src/sim/rules/devices.ts`, `src/sim/rules/ball-controller.ts`
- `src/sim/loop/index.ts`
- `src/host/loop.ts`
- `src/presentation/scene/balls.ts`
- `test/loop.test.ts`, `test/loop-determinism.test.ts`, `test/machine-serve-drain.test.ts`,
  `test/device-eject-pose.test.ts`, `test/switch-zones.test.ts`, `test/sim-cost.test.ts`,
  `test/solver-termination.test.ts`, `test/ball-render.test.ts`
- `test/fixtures/solver-termination/vitest.harness.config.ts`,
  `test/fixtures/solver-termination/wedge.harness.ts`

**Files this story edits:** `ATTRIBUTIONS.md` (first), `src/sim/contracts/time.ts`,
`src/sim/table/dragonwar.ts`, `src/sim/table/tuning.ts`, `src/sim/physics/loader/index.ts`,
`src/sim/physics/game/player-physics.ts`, `src/presentation/scene/create-engine.ts`, `src/host/boot.ts`,
`tools/export.py`, `tools/make-placeholder-blend.py`, `assets/src/dragonwar.blend` (regenerated),
`public/assets/dragonwar.glb` (regenerated), `public/assets/dragonwar.collision.json` (regenerated),
`test/table.test.ts`, `test/collision-loader.test.ts`, `test/asset-contract.test.ts`,
`test/export-py.test.ts`, `test/tuning.test.ts`, `test/player-physics-guards.test.ts`,
`test/sim-boundary.test.ts` (the `AUTHORED_FILES` allowlist only),
`test/fixtures/export-py/mutate-blend.py`.

**Files this story deletes:** none.

## Tasks & Acceptance

**Execution** (dependency order; task 1 is a hard gate on tasks 4-6, and tasks 2-6 gate every runtime task
that consumes the regenerated artifacts):

1. `ATTRIBUTIONS.md` — **before any asset is regenerated.** Update the three "Generated content" rows so
   each states what the file now contains and the date it was regenerated: the `.blend` row gains the
   relocated `bd_trough` eject empty, the new `col_lane_deflector` and the retiled `sw_trough_1..4`; the
   `.glb` and `.collision.json` rows are re-dated to the regeneration date. Every row keeps its
   "generated, not sourced — original primitives, nothing from any commercial machine" statement. Add no
   row for Blender itself. No third-party file or dependency is added by this story.

2. `tools/export.py` — replace `wall_footprint_mm(bbox_min, bbox_max)` (lines 304-328) with a reduction
   over the **object's own world-space mesh vertices**: project every vertex to (x, y) millimetres, round
   to `BBOX_ROUND`, de-duplicate, take the convex hull, wind counter-clockwise, and rotate the ring so the
   lexicographically smallest (x, y) point is first. Update `build_collision_nodes()` (331-355) to call it
   with the object. **Leave `validate_col_geometry_reducible()` (215-266) exactly as strict** — the
   rotation guard still protects `bboxMm`, `plane` and `box` reductions, which remain AABB-based — and
   leave the degenerate-extent guard in place. Add a `fail()` for a wall whose hull has fewer than three
   distinct points, naming the node. Document in the function's docstring why the hull replaced the AABB
   and that the change is byte-neutral for a rectangular wall.

3. `tools/make-placeholder-blend.py` — three authored geometry changes, each expressed from the existing
   named constants rather than magic numbers, each with a comment saying it is **provisional placeholder
   geometry not derived from any acceptance criterion** and pointing at `DW-58`:
   - **(a)** Move the `bd_trough` empty (line 260) from `(255.0, −60.0, 10.0)` to the shooter-lane foot:
     x = `LANE_X0_MM + WALL_T_MM + LANE_CLEAR_MM / 2` (497.4), y = 20.0, z = `BALL_MM / 2` (13.495), keeping
     its identity rotation so the exported eject direction stays `(0, 1, 0)`. Introduce `BALL_MM = 26.99`
     beside the other AD-10 reference constants.
   - **(b)** Add `col_lane_deflector`: a triangular prism, identity transform, `col_shape='wall'`,
     `surface='wood'`, `phys_material='default'`, z 0 to `WALL_H_MM`, plan-view vertices
     `(LANE_X0_MM + WALL_T_MM, DEFLECTOR_TOP_Y_MM)`, `(PLAYFIELD_W_MM, DEFLECTOR_BASE_Y_MM)`,
     `(PLAYFIELD_W_MM, DEFLECTOR_TOP_Y_MM)` with `DEFLECTOR_BASE_Y_MM = 976.0` and
     `DEFLECTOR_TOP_Y_MM = 1010.0` — the hypotenuse runs from low-right to high-left so a ball travelling
     up the lane is turned toward −x, above `LANE_WALL_TOP_Y_MM`. This needs a new `bmesh` helper beside
     `_box_bmesh()` (lines 93-116) that extrudes an arbitrary plan-view polygon between two z values,
     built the same low-level `bmesh` + `bpy.data.*` way (no `bpy.ops.*`) and creating the same `uv_base`
     layer `new_box_mesh()` does, so the two paths stay consistent.
   - **(c)** Retile `sw_trough_1..4` (lines 250-257) as four contiguous boxes spanning the drain aperture:
     slot *i* covers x ∈ [`DRAIN_X0_MM + i·w`, `DRAIN_X0_MM + (i+1)·w`] where
     `w = (DRAIN_X1_MM − DRAIN_X0_MM) / 4` (28.6 mm), y ∈ [−80, 0], z ∈ [0, 20], each keeping its
     `switch='s_trough_N'`, `surface`, `phys_material` and `col_shape='box'` properties.

4. Regenerate and re-export. Run `tools/make-placeholder-blend.py` headlessly to rewrite
   `assets/src/dragonwar.blend`, then `BLENDER=<this host's blender> pnpm export:assets`. **Before adding
   the deflector**, confirm task 2 alone reproduces `public/assets/dragonwar.collision.json` byte-for-byte;
   afterwards, confirm the only changes are the moved `bd_trough` pose, the new `col_lane_deflector` node
   and the four retiled zones, plus the corresponding `bd_trough` node position in `dragonwar.glb`.

5. `test/export-py.test.ts` — add two Blender-gated cases: one asserting a wall with a genuinely angled
   mesh footprint exports a three-point `footprintMm` rather than a four-corner bounding box, and one
   asserting a `col_` node whose *world matrix* is rotated is **still** rejected non-zero with the node and
   the off-diagonal term named. Extend `test/fixtures/export-py/mutate-blend.py` with the mutations these
   need, mirroring the existing mutation style.

6. `test/asset-contract.test.ts` — add ungated assertions against the committed collision document: the
   four `sw_trough_*` zones tile x ∈ [200, 314.4] with no gap; `col_lane_deflector` is present with a
   three-point footprint that is not axis-aligned; and every `wall` node's `footprintMm` has at least three
   points and encloses a non-zero area.

7. `src/sim/table/dragonwar.ts` — add one optional field, `servesInto`, to `TABLE.ballDevices`: the
   `SwitchName` whose `sw_` zone must contain the device's authored eject pose. Set
   `bd_trough.servesInto = 's_shooter_lane'` (its eject kicks the ball into the shooter lane) and
   `bd_shooter.servesInto = 's_shooter_lane'` (its served ball rests in its own lane). Document that a
   device with no zone-bounded destination — a future Mouth aimed at the flippers — simply omits the
   field. Extend `test/table.test.ts`'s device describe block to pin both values and to assert
   `servesInto` names a real `TABLE.switches` key.

8. `test/device-eject-pose.test.ts` (new) — **the standing gate.** Read the committed
   `public/assets/dragonwar.collision.json`; for **every** entry in `TABLE.ballDevices` that declares
   `servesInto`, look up that device's `ejectPose.posMm` in the document's `devices` array and the
   `switchZones` entry whose `switch` equals the declared target, and assert the pose lies inside that
   zone's `minMm`/`maxMm` on all three axes. Derive the whole test from the registry — no device name
   appears as a literal — so a device added later is covered automatically. Fail with a message naming the
   device, the pose, the zone and the axis that missed. Add a companion case that runs the same assertion
   against a hand-built document carrying Story 1.4's original `bd_trough` pose `(255, −60, 10)` and
   asserts it **fails**, so the test is proven discriminating rather than vacuous.

9. `src/sim/contracts/time.ts` — add, beneath the existing `TICK_HZ` block and **without altering any
   phrase `test/time-contract.test.ts` pins**, the only `TICK_HZ` arithmetic the loop needs:
   `msToTicksExact(ms): number` (unrounded, so the accumulator keeps its fraction), `ticksToMs(ticks):
   number`, and `MAX_OWED_TICKS`, derived from a seconds-valued constant expressing AD-4's 200 ms cap.
   Explain in a comment why the cap lives here in ticks rather than in `tuning.ts` in milliseconds (it is a
   loop-contract invariant, not a feel tunable; and `pnpm lint:boundaries` forbids a `…Ms` binding assigned
   a numeric literal outside `tuning.ts`). Do **not** re-export any of it from `contracts/index.ts`.

10. `src/sim/table/tuning.ts` — (a) close `DW-35`: `msToTicks()` (169-174) throws on a negative ms value,
    and throws when a strictly positive ms value converts to 0 ticks, both messages naming the tunable, its
    ms value, the tick rate and the resulting tick count; an authored `0` still converts to `0` silently.
    (b) Add the two tunables this story is the first to consume, each with `source` and `confidence`:
    `troughEjectSpeedMmPerS` (authored 500 — measured to place the ball in `sw_shooter_lane` and leave it
    there, reaching only y ≈ 106) and `autolaunchSpeedMmPerS` (authored 2500 — measured to clear the
    deflector, whose threshold is between 1600 and 1800 mm/s, with margin). Both `confidence: 'unverified'`,
    both `source` naming AD-6's "authored eject pose **and speed**" and the fact that no planning artifact
    states a figure. Neither name ends in `Ms`, so neither trips the literal-millisecond rule; state that in
    a comment so a later reader does not "fix" it. Extend `test/tuning.test.ts` with the new guard cases and
    the two new entries.

11. `src/sim/physics/loader/index.ts` — (a) close `DW-45`: extend `CollisionDoc` and `parseCollisionDoc()`
    to require `version === 1`, `units === 'mm'` and `frame === 'table'`, throwing a descriptive load-time
    error naming the field, the value found and the value expected. (b) Close `DW-7`: replace the corner
    `HitPoint` loop (385-389) with one `HitLineZ` per footprint vertex spanning the wall's own
    `zLow..zHigh`, applying the same material, and rewrite the surrounding comment to record *why* — a
    `HitPoint` at z = 0 is tangent to a deck-rolling ball's surface by construction, which is the measured
    answer to the entry's question. (c) Parse the document's `devices` array into the returned
    `LoadedCollision` as `{ name, ejectPose: { posMm, dir } }`, validating each name against
    `TABLE.ballDevices` and throwing on an unknown one; delete the "intentionally does not parse it" note
    at lines 90-98 now that the consumer exists.

12. `test/collision-loader.test.ts` — rewrite the `DW-7` describe (169-208) around the new primitive:
    a sweep of balls **rolling at deck height** (centre z = one ball radius) into wall corners of the
    committed body must produce a non-zero corner `collide()` count, and the test must state that the same
    sweep produced zero against the pre-change `HitPoint` construction. Add cases for the `DW-45`
    handshake (a document with `units: "m"`, one with `version: 2`, one with the field absent) and for the
    `devices` parsing (an unknown device name throws).

13. `src/sim/physics/game/player-physics.ts` — add `removeBall(ball: Ball): void`, the exact inverse of
    `addBall()` (122-127): remove the ball from `balls`, its mover from `movers` and its hit shape from
    `hitObjectsDynamic`, then rebuild `hitOcTreeDynamic` with `fillFromVector`. Extend the file header's
    deviation list (60-65), which already records that `destroyBall()` "has no caller and is not ported",
    to say that Story 1.5 gives it one and that `removeBall()` is the authored inverse of this project's own
    `addBall()`, not a port of upstream's `destroyBall()`. Leave the vpx-js copyright block and the port
    marker untouched. Throw if the ball is not present, rather than silently no-op'ing. Extend
    `test/player-physics-guards.test.ts` with a case proving a removed ball no longer moves and no longer
    collides.

13b. `test/sim-boundary.test.ts` — declare the three new authored physics files (`switches.ts`,
    `devices.ts`, `machine.ts`) in `AUTHORED_FILES` (line 82), the one-line-per-file allowlist edit its own
    comment describes. Each must carry the DragonWar GPL-3.0 header in its first five lines and must carry
    **neither** the vpx-js port marker nor the upstream VPDB copyright block. Do not touch the ported
    branch or the AD-15 constants pin.

14. `src/sim/physics/switches.ts` (new) — the AD-2 zone-edge source. Given the `LoadedSwitchZone[]` and,
    per tick, each ball's previous and current table-frame position, test the **swept segment** against each
    zone's axis-aligned box (never the end position), maintain per-switch inside/outside state with the
    `settleTicks` for that switch's `settleClass` from `resolveTuning()`, and emit one `SwitchEvent` per
    genuine edge. **Exclude every zone whose `switch` appears in a parking device's `slots`** — those
    switches have exactly one owner, the device (AD-6) — deriving the exclusion from `TABLE.ballDevices`,
    never from a name literal.

15. `src/sim/physics/devices.ts` (new) — the AD-6 device mechanics. Owns each ball device's slot occupancy.
    On a ball entering the union of a **parking** device's slot zones: park it into the lowest empty slot,
    call `removeBall()`, emit that slot switch's `closed: true` edge, and emit `ContactEvent { kind:
    'eject' | 'hit' }` only where the contract already provides a kind. On `pulse` of a device's
    `ejectCoil`: spawn a ball at the authored eject pose (from the collision document, converted through
    `toPhysics()`), with velocity `dir × TUNING.troughEjectSpeedMmPerS` for a parking device and
    `TUNING.autolaunchSpeedMmPerS` for `c_autolaunch`, open the highest filled slot's switch, and emit
    `ContactEvent { kind: 'eject', device }`. A pulse with nothing to eject emits `eject_failed { device }`;
    an entry with every slot full emits `device_overflow { device }` and leaves the ball simulated. Assert
    at construction that a parking device's initial closed-slot count equals its `capacity`, throwing a
    descriptive error otherwise (AD-6's "4 balls, asserted at boot").

16. `src/sim/physics/machine.ts` (new) — the cabinet facade the loop drives. Builds from a parsed
    collision document via `loadCollision()`, sets gravity from the effective pitch
    (`setGravity(pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST)`, matching `tools/spike-1/scene.ts:115`),
    and exposes `step(tick, frame, commands): { switchEvents, contactEvents }` plus a read-only view of the
    balls for the snapshot. Per step it applies the previous tick's `CoilCommand`s to the devices, calls
    `PlayerPhysics.step()` exactly once, then runs the zone tests and the device entry tests. Ball ids are
    assigned by the machine and are stable for a ball's lifetime; a ball parked and later ejected gets a
    **new** id. All table↔physics conversion goes through `frames.ts`.

17. `src/sim/rules/devices.ts` (new) — AD-19's devices-and-shots layer, the **only** consumer of
    `SwitchEvent`. Epic 1's minimum: it turns the *opening* of `s_shooter_lane` into `ball_launched`, and
    each ball-device slot switch edge into `device_ball_entered { device, slot }` /
    `device_ball_left { device, slot }`, resolving device and slot from `TABLE.ballDevices` rather than any
    literal. Nothing else — no shots, no lanes, no drop bank.

18. `src/sim/rules/ball-controller.ts` (new) — AD-6/AD-18 accounting only. Derives
    `machine.deviceSlots[device]` from the closed slot switches and nothing else; increments
    `machine.ballsInPlay` on `ball_launched` and decrements it when a ball is parked in the trough. Owns no
    physics state and never converts units.

19. `src/sim/rules/index.ts` (new) — `step(state, switchEvents, tick): { state, events, commands }`, run
    **after every physics step, even with no switch events** (AD-4). Returns the next immutable
    `GameState`, the semantic events produced, and the presentation commands — which in this story is
    always an empty array, because `TABLE.flashers`/`shows` are empty and the single lamp is never lit.

20. `src/sim/loop/index.ts` (new) — the fixed-step conductor. `createLoop({ collisionDoc, ... })` builds
    the machine and the initial `GameState`; `advance(elapsedMs, transitions): FrameOutput` accumulates
    owed ticks through `msToTicksExact()`, carries the fractional remainder, caps at `MAX_OWED_TICKS`
    emitting `sim_time_discarded { ms }` as the frame's **first** event, and per step: resolves the
    `InputFrame` in force at that tick, emits button-switch edges from consecutive frames, calls
    `machine.step(tick, frame, commandsFromPreviousTick)`, then `rules.step(...)`. It assembles the
    `Snapshot` (ball positions and velocities through `fromPhysics()`, `mechanisms.devices` from the device
    slots, `effectivePitchDeg` from tuning) and returns a `FrameOutput` carrying every event, contact event
    and command of all N steps in tick order — with empty arrays and the **unchanged previous snapshot**
    when N is 0. Expose a dev-only `pulseCoil(coil: CoilName)` that enqueues a `CoilCommand` for the next
    tick exactly as a rules-issued command, and say in a comment that Story 2.5's ball controller replaces
    it. The file must not name `TICK_HZ`.

21. `src/host/loop.ts` (new) — the rAF driver. Records an accumulator origin from `performance.now()`,
    calls `advance(elapsedMs, transitions)` once per animation frame with the elapsed time since the last
    frame, hands the `FrameOutput` to presentation, and exposes start/stop. Story 1.6 adds the key→action
    map; this story passes an empty transition list and exposes the dev coil pulses.

22. `src/presentation/scene/balls.ts` (new) — `syncBalls(scene, playfieldRoot, snapshot)`: create one
    sphere per `BallSnapshot.id` with diameter `TABLE.reference.ballMm / 1000` m, parented to
    `playfield_root` so pitch carries it, positioned at `toScene(pos)` with **no interpolation**, and
    dispose the mesh of any ball no longer in the snapshot. Imports only `sim/contracts` and `sim/table`.

23. `src/presentation/scene/create-engine.ts` and `src/host/boot.ts` — surface `playfieldNodes` on
    `BootSceneResult`, and let `loadAndRenderOnce()` accept an optional per-frame callback invoked inside
    the existing `runRenderLoop` (292-303) without disturbing the first-frame promise at 288-291. In
    `boot.ts`, add `COLLISION_URL = './assets/dragonwar.collision.json'` beside `GLB_URL` (19), fetch and
    `JSON.parse` it inside `onBegin()` (96-126) so any failure lands in the existing `showError` path, and
    wire the loop: create it from the parsed document, start `host/loop.ts`, and on each frame call
    `syncBalls(...)` and `applyPitch(nodes, snapshot.effectivePitchDeg)`.

24. `test/solver-termination.test.ts` + `test/fixtures/solver-termination/wedge.harness.ts` +
    `test/fixtures/solver-termination/vitest.harness.config.ts` (new) — close `DW-8`. The harness builds a
    genuinely non-convergent input (a ball driven at 9000 mm/s into a slot narrower than its own diameter,
    added to the real loaded body as extra wall nodes) and steps it; the test `spawnSync`s a nested
    `vitest run --config <the fixture config>` with a hard `timeout`, and asserts a zero exit code — an
    **out-of-process** guard, because a non-terminating `physicsSimulateCycle` hangs synchronously and
    defeats both a per-tick wall-clock ceiling and Vitest's own `testTimeout`. The harness config's
    `include` must match only `test/fixtures/solver-termination/**/*.harness.ts`, so the harness never runs
    in the default suite. Add an in-process companion assertion that the adversarial input really is
    adversarial — its worst single step is at least an order of magnitude above an ordinary step's — so the
    test cannot silently degrade into a benign one.

25. `test/sim-cost.test.ts` (new) — close `DW-14`'s re-characterisation obligation without touching Spike 1.
    Build the real machine from the committed collision document, put four balls in genuine motion, measure
    600 frames of 17 ticks, and report mean and p95 cost per frame. **Informational, non-gating** (like
    `test/spike-1.test.ts`'s own cost report), with a comment stating that Spike 1's number is a floor taken
    on a near-quiescent scene and that this is the steady-state re-take. Record the measured numbers in this
    spec's `## Auto Run Result`.

26. `test/switch-zones.test.ts`, `test/machine-serve-drain.test.ts` (new) — the I/O matrix's device and
    switch rows: swept-segment detection of a zone crossed entirely within one tick; exactly one edge per
    crossing under a 0 ms settle class; slot switches never emitted by the zone tester; boot slot count
    asserted; eject from the highest filled slot; park into the lowest empty slot with the ball leaving the
    simulated set; `eject_failed` and `device_overflow`; and the end-to-end serve → rest in
    `sw_shooter_lane` → autolaunch → main field → drain → trough sequence.

27. `test/loop.test.ts`, `test/loop-determinism.test.ts` (new) — the loop contract: remainder carry;
    N = 0 producing empty arrays and an unchanged snapshot; the 200 ms cap producing exactly one
    `sim_time_discarded` as `events[0]`; commands issued at tick *t* consumed at *t+1*; rules running on
    every step including empty ones; button-switch edges from `InputFrame` transitions; and the cadence
    comparison, which asserts **equal step counts first** and then equal final state hashes across 30, 60
    and 120 Hz with one 2 s gap.

28. `test/ball-render.test.ts` (new) — the presentation leg, following `test/scene-smoke.test.ts`'s
    `NullEngine` + committed-glb `data:` URL pattern: applying a `FrameOutput` whose snapshot holds one
    ball creates a mesh at `toScene(pos)` under `playfield_root`; applying one whose snapshot holds none
    disposes it; and `playfield_root`'s pitch follows the snapshot's `effectivePitchDeg`.

**Acceptance Criteria:**

- **Given** `pnpm test` with `BLENDER` unset, **when** the suite runs, **then** every Blender-dependent
  test reports **skipped** rather than failed, every other test passes, and `pnpm typecheck`,
  `pnpm lint:boundaries`, `pnpm check:headers`, `pnpm check:attributions`, `pnpm build`, `pnpm check:dist`
  and `pnpm check:size` all exit 0.
- **Given** the regenerated `public/assets/dragonwar.collision.json`, **when** `bd_trough`'s authored eject
  pose is compared against the `sw_` zone of the switch its `servesInto` names, **then** the pose lies
  inside that zone on all three axes; **and** the same assertion holds for `bd_shooter`; **and** the same
  assertion fails against Story 1.4's original `(255, −60, 10)` pose.
- **Given** a loop created from the committed collision document, **when** a dev action issues
  `pulse c_trough_eject`, **then** one ball appears in the snapshot, the highest filled trough slot switch
  opens as exactly one edge, `machine.deviceSlots.bd_trough` drops to three closed slots, and the ball
  comes to rest inside the `sw_shooter_lane` zone with `s_shooter_lane` closed by exactly one edge.
- **Given** a ball at rest in the shooter lane, **when** a dev action issues `pulse c_autolaunch`, **then**
  `s_shooter_lane` opens as exactly one edge, the devices layer emits exactly one `ball_launched`,
  `machine.ballsInPlay` becomes 1, and the ball's table-frame x falls below the plunger-lane divider's
  main-field face — it reaches the playfield rather than returning down the lane.
- **Given** a ball rolling into the drain, **when** its swept segment enters the trough's entry geometry,
  **then** it is parked in the **lowest empty** slot, that slot switch closes as exactly one edge, the ball
  leaves `snapshot.balls` on the same tick, and `machine.ballsInPlay` decrements — derived from the closed
  slot count and nothing else.
- **Given** one scripted 5 s input sequence containing at least one input transition and one 2 s gap,
  **when** it is driven through `advance` with 30, 60 and 120 Hz elapsed patterns, **then** the three runs
  execute the same number of steps, each emits exactly one `sim_time_discarded` event as its frame's first
  event, and the three final state hashes — FNV-1a over canonical JSON of `GameState` plus ball positions
  quantised to 0.01 mm — are identical.
- **Given** a running build in a real browser, **when** the author presses to begin and issues the two dev
  pulses, **then** a ball is visible on the pitched playfield, moves smoothly, and disappears when it
  drains; **and** the browser console reports no CSP violation and no unhandled error.
  *(Integration AC — the outermost surface. The automated equivalent is `test/ball-render.test.ts` under
  `NullEngine`, which is Rule 3's real-runtime evidence for the headless tier; the browser leg is the
  lead's per-story smoke.)*
- **Given** the adversarial wedge harness, **when** it is run out of process with a hard wall-clock
  timeout, **then** it exits zero; **and** the in-process companion shows its worst single step is at least
  an order of magnitude above an ordinary step's, proving the input is genuinely non-convergent.
- **Given** `git status --short` after the story completes, **when** the tree is inspected, **then** only
  the files this Code Map lists appear — no `dist/`, no stray probe scripts, no `.tmp` artifacts in
  `public/assets/`, and no edit under `docs/**` or `_bmad-output/planning-artifacts/`.

## Spec Change Log

## Review Triage Log

## Design Notes

### Governing ADs (Rule 6)

The ADR registry for this project is the architecture spine's numbered invariants (AD-1..AD-19) at
`_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md` —
there is no `docs/adr/`. Each of the following was re-read against the spine text, not taken from a list:

- **AD-3** (line 81) — "`TICK_HZ` is one constant in `sim/contracts/time.ts` … **nothing else in `sim/` may
  contain a literal millisecond**. `tick` (uint32, reset at game start) is the only time inside `sim/`. …
  All rules randomness … draws from a seeded PRNG in `GameState.rng`. Physics has no randomness: scatter is
  0 on every material by default." This is why the accumulator's helpers live in `time.ts` (task 9), why
  the 200 ms cap is expressed in ticks, and why nothing in this story reads a wall clock inside `sim/`.
- **AD-4** (line 87, with its own sequence diagram at 103-110) — the whole loop contract, quoted almost
  verbatim by the story's first acceptance criterion: "The accumulator owes `elapsed × TICK_HZ` steps and
  **carries the fractional remainder**; owed time beyond 200 ms is discarded and `sim_time_discarded { ms }`
  is the first event of that frame. For each step: physics consumes the frame and the commands issued at
  the previous tick and emits events; then `rules.step(state, switchEvents, tick)` runs — **every step,
  even with none**. … `FrameOutput` carries every event and command from all N steps in tick order (N = 0 →
  empty arrays, unchanged snapshot); presentation renders the latest snapshot **without interpolation**."
- **AD-6** (line 118) — "physics parks an entering ball unconditionally into the lowest empty slot,
  **removes it from the simulated set and closes that slot's switch**; on `pulse` of the eject coil it
  spawns the ball from the highest filled slot at the device's **authored eject pose and speed** and opens
  the switch … `bd_shooter` … is a **non-parking** mechanical-eject device: the served ball stays simulated
  resting on the plunger tip … **The opening of `s_shooter_lane` is the one event that means "plunged"** …
  Device counts in `GameState` are the number of closed slot switches and nothing else." Three consequences
  this spec turns into tasks: `removeBall()` must exist (task 13); the slot switches are device-owned, not
  zone-owned (task 14); and the eject *speed* — which Story 1.4 explicitly deferred here — is authored now
  (task 10).
- **AD-2** (line 75) — "Physics emits **playfield and cabinet-mechanism** `SwitchEvent`s … as edges only —
  one `closed: true` when a zone test transitions outside→inside, one `closed: false` on the reverse — with
  per-switch hysteresis and `settleTicks` from `TABLE.switches` … `sim/loop` emits only the **button**
  switches … Rules never debounce a switch." Also: "`sw_` switch zones (analytic tests against the ball's
  per-tick swept segment, **never the end position**)" from AD-11.
- **AD-7** (line 124) — the ownership scopes. `ballsInPlay`, `hardwareEnabled` and `deviceSlots` are
  **machine**-scoped; nothing player- or mode-scoped is touched by this story, and `modes[]` stays empty.
- **AD-9** (line 162) — the closed command union: rules→physics is `CoilCommand` and `RecoverCommand`
  only; rules→presentation is `LampCommand`/`GiCommand`/`FlasherCommand`/`ShowCommand` and nothing else.
  "A device eject is `pulse` on `TABLE.ballDevices[bd].ejectCoil`." This story emits no presentation
  command at all, which is why `FrameOutput.commands` is asserted empty rather than left unspecified.
- **AD-10** (line 168) — the canonical table frame, `frames.ts` as the only converter, pitch applied by
  physics as the gravity vector and by presentation as a rotation of `playfield_root` about `pivot_pitch`
  "by the effective pitch **read from the snapshot each frame**". The ball mesh and the physics body are
  the same position expressed twice, and neither computes its own conversion.
- **AD-11** (line 174) — Blender owns placement; the export script is the enforcer; `col_` nodes "must
  reduce to the ported primitive set … under the quadtree + k-d broadphase"; walls "have real thickness".
  Task 2's hull reduction is a change to *how* a wall reduces, not to *what* it reduces to: the output is
  still `LineSeg`s plus corner primitives.
- **AD-15** (line 198) — solver constants ported verbatim and never tunable; table tunables carry `source`
  and `confidence` and ship `unverified` when authored rather than measured. Both new speed tunables are
  `unverified` by that rule. Also the state hash's definition: "FNV-1a over canonical JSON of `GameState`
  plus ball positions quantised to 0.01 mm", which the determinism test uses even though Story 1.8 owns
  replays as a shipped artifact.
- **AD-16** (line 204) — the linted boundaries, the ported-file notice rule, and "new files carry the
  GPL-3.0 header". `host/**` may import `sim/contracts`, `sim/table`, `sim/loop` and `presentation/**`,
  "never `sim/physics` or `sim/rules`" — the single constraint that decides the loop's factory shape.
- **AD-19** (line 224) — "`sim/rules/devices/` is the only consumer of `SwitchEvent`. It owns … ball-device
  slots, the shooter lane … and emits device events only: … `ball_launched`, `device_ball_entered { device,
  slot }`, `device_ball_left { device, slot }` … Modes, scoring and the ball controller consume device and
  shot events and never a raw switch." This is why the ball controller reads `ball_launched`, not
  `s_shooter_lane`.
- **AD-1** (line 69) and **AD-17** (line 210) also bind: one table imported directly, no loading API; and
  any boot-stage failure — including a 404 or a malformed collision document — renders the existing host
  error panel rather than a partial table.

### Why an angled deflector forces an `export.py` change

The dispatch scoped both geometry fixes as `tools/make-placeholder-blend.py` edits. The trough relocation
is exactly that. The deflector is not, and the reason is measured rather than argued:
`wall_footprint_mm()` returns the four corners of the **axis-aligned bounding box**, so an angled mesh
becomes a rectangular slab that would block the entire lane; and `validate_col_geometry_reducible()`
rejects any `col_` node with a rotated world matrix, so the angle cannot come from the object transform
either. That guard exists for a good reason — it was added after a rotated `col_wall_lane` silently
exported a 485 × 829 mm slab — and weakening it is explicitly forbidden here.

The resolution keeps the guard and changes only the reduction: a wall's footprint becomes the plan-view
**convex hull of its own mesh vertices**. For a rectangular box that is the bounding box, verified exactly
against all seven committed walls, so the change is byte-neutral until the deflector is added; for a
triangular prism it is the triangle. The loader needs no change at all — `addWall()` already treats
`footprintMm` as a closed polygon of any length ≥ 3 and orients each edge outward from the footprint's own
centroid, which is correct for any convex polygon. The rotation guard stays because `bboxMm`, the `plane`
reduction and the `box` reduction are all still AABB-based; a rotated wall is now *representable* but not
yet *validated*, and admitting one is Epic 2's decision, not this story's.

### The geometry this story invents, and why it is provisional

Say it plainly: the relocated `bd_trough` eject pose, the deflector's position and angle, and the retiled
`sw_trough_*` zones are **invented placeholder geometry not derived from any acceptance criterion**. No
planning artifact states where a trough kicker sits, what angle a lane exit takes, or how wide a trough
slot is. They are authored so that Story 1.5's acceptance criteria are satisfiable at all, they are chosen
to be the smallest change that makes each measured failure stop, and every figure is expressed from the
existing named placeholder constants. `DW-58` is already filed against Story 2.1 to replace all of it with
real geometry; it is referenced from the `.blend` script's comments and is **not** re-filed here.

The third change — retiling the trough zones — was not in the dispatch and is reported here rather than
absorbed silently. It is the same class of defect as the other two, found the same way: the drain aperture
is 114.4 mm wide, the four zones covered 64 mm of it in four islands, and three of five measured drain
crossings from launched balls landed in the gaps. Without it, whether the story's own drain acceptance
criterion passes is a function of the launch speed rather than of the code.

### How a draining ball enters `bd_trough`

`bd_shooter` declares `entry: 's_shooter_lane'`; `bd_trough` declares no entry, and there is no `s_drain`
switch — Story 1.3's acceptance criterion enumerates the eleven switches Epic 1 has, and the full switch
set is Story 2.1's. Adding one would exceed that enumeration, so the trough's entry region is the **union
of its own slot zones**, retiled to tile the drain aperture with no gaps. That is physically honest for a
four-ball trough (four adjacent 28.6 mm ball positions in a 114.4 mm channel) and needs no new switch.

Those zones are entry *geometry*, not a switch source. AD-6 gives a parking device's slot switches exactly
one owner — the device closes them when it parks a ball and opens them when it ejects one — and AD-2
forbids two sources for one switch class. A zone test that also emitted `s_trough_N` would double-drive
them: at boot all four are closed with no ball anywhere near the zones. Task 14 therefore derives the
exclusion from `TABLE.ballDevices[*].slots` rather than naming any switch.

### Where switch edges and contact events come from

There is no working collision callback in the port today. `EventProxy.fireGroupEvent()` is an explicit
no-op stub, no static hit object in the loaded body sets `.obj`/`.fe`, and `PlayerPhysics.contacts` is
cleared inside every solver iteration, so it is always empty by the time `step()` returns. That is not a
problem to fix here — AD-2 and AD-11 already specify the mechanism this story needs: switches come from
**analytic `sw_` zone tests against the ball's per-tick swept segment**, computed by `sim/physics` after
each `step()` from the ball's before/after positions. Contact events for sound are AD-13's and Epic 4's;
this story emits only the `eject` actuation kind the contract already names, and does not attempt to
revive the event proxy.

### The determinism AC is achievable (Rule 5 scrutiny)

The dispatch asked for this to be examined rather than assumed. It was, numerically, before any code was
planned. Simulating AD-4's accumulator over 5 s: 30 Hz → 5000 steps, 60 Hz → 5000, 120 Hz → 5000, residual
remainders of order 1e-13; with one extra 2000 ms frame, 5200 / 5200 / 5200 and exactly one discard each;
with ±0.0001 ms of per-frame jitter, unchanged. The underlying physics is already bitwise-deterministic
(`test/spike-1.test.ts` runs two identical scenes for 10,000 ticks and compares positions and velocities
exactly), `scatter` is 0 on every material, and the two former `Math.random()` sites in
`physicsSimulateCycle` were replaced with a deterministic boolean. So the criterion holds, and it is **not**
a Rule 5 intent gap.

The one way it could still fail is a test-design mistake, so the test guards against it: it asserts the
three runs executed the **same number of steps** before comparing hashes, so a one-tick float discrepancy
is diagnosed as what it is rather than misread as non-determinism.

### Ball removal belongs in `player-physics.ts`

AD-6 requires physics to remove a parked ball "from the simulated set", and there is no way to do that from
outside: `movers`, `hitObjectsDynamic` and `hitOcTreeDynamic` are all private. The file's own header
already records the deviation — upstream's `createBall()`/`destroyBall()` were dropped in favour of
`addBall(ball)` because "the harness never removes a ball" — so `removeBall()` is the authored inverse of
this project's own API, documented in the same list, not a fresh port of upstream. The vpx-js copyright
block and the port marker stay exactly as they are, so
`test/sim-boundary.test.ts`'s ported-file assertion is unaffected; if that turns out not to hold, the
Block-If applies.

The alternative — freezing a parked ball in place — was rejected: a frozen ball stays in the dynamic
broadphase and in `snapshot.balls`, which contradicts both AD-6's "removes it from the simulated set" and
the story's own "the ball leaves the snapshot".

### Why the dev pulse exists, and what replaces it

The story's own acceptance criterion says "a **dev action** issues `pulse c_trough_eject` followed by
`pulse c_autolaunch`", and `advance(elapsedMs, transitions)`'s signature is fixed by AD-4, so the pulses
cannot arrive as input. `sim/loop` therefore exposes a dev-only `pulseCoil()` that enqueues a `CoilCommand`
into exactly the same next-tick queue rules use, so physics cannot tell the difference. AD-18 reserves
`c_trough_eject` and `c_autolaunch` for the ball controller *within rules*; a host-side dev injection is
not a second rules owner, and Story 2.5 ("Start, hot seat and the ball lifecycle") replaces it with the
real serve path. The comment on `pulseCoil()` must say so.

### Integration ACs, Consumed-by and Consumes (Rules 1 and 2)

This story introduces `sim/loop`, `sim/rules` and the physics machine, so Rule 1 applies in full. It has
**real in-story consumers, none mocked**:

- `src/host/loop.ts` and `src/host/boot.ts` consume `sim/loop`'s `advance()` and produce the observable
  effect that a ball mesh appears on the pitched playfield and disappears when it drains
  (`test/ball-render.test.ts` under `NullEngine`, plus the lead's browser smoke — Rule 3's real-runtime
  evidence).
- `src/presentation/scene/balls.ts` consumes `FrameOutput.snapshot` and `frames.ts`'s `toScene()` and
  produces a mesh at the converted position under `playfield_root`.
- `src/sim/rules/devices.ts` consumes `SwitchEvent`s emitted by `src/sim/physics/switches.ts` and produces
  `ball_launched`; `src/sim/rules/ball-controller.ts` consumes that and produces `machine.ballsInPlay`.
- `src/sim/physics/devices.ts` consumes the collision document's `devices` array — Story 1.4's authored
  eject poses, whose first reader this story is — and produces a spawned ball at that pose.

`Consumes:`
- **Story 1.1** — `src/sim/physics/**` (the ported solver, `PlayerPhysics`, `Ball`, the primitive set
  including the so-far-unused `HitLineZ`), `src/sim/physics/constants.ts`. `tools/spike-1/scene.ts` is read
  as the worked example and never edited.
- **Story 1.2** — `src/host/boot.ts`, `src/presentation/scene/create-engine.ts`, the pinned CSP,
  `tools/check-dist.mjs`, `tools/size-budget.mjs`, `.github/workflows/ci.yml`.
- **Story 1.3** — `src/sim/contracts/**` (every seam type this story instantiates), `src/sim/table/**`
  (`TABLE`, `names.ts`, `tuning.ts`), `tsconfig.sim.json`, `pnpm lint:boundaries`, `test/table.test.ts`,
  `test/tuning.test.ts`, `test/time-contract.test.ts`.
- **Story 1.4** — `public/assets/dragonwar.collision.json` and `dragonwar.glb`, `src/sim/table/frames.ts`,
  `src/sim/physics/loader/index.ts`, `src/presentation/scene/playfield.ts`,
  `src/presentation/camera/fixed-camera.ts`, `tools/export.py`, `tools/export-assets.mjs`,
  `tools/make-placeholder-blend.py`, `assets/src/dragonwar.blend`, `test/scene-smoke.test.ts`,
  `test/collision-loader.test.ts`, `test/asset-contract.test.ts`, `test/export-py.test.ts`.
  **First consumer of the authored eject poses and of `fromPhysics()`.**

`Consumed-by:`
- **Story 1.6** — the immediate consumer. Flippers and the manual plunger are hardware rules **inside the
  physics step** this story creates; `sim/loop` already emits `s_flipper_l`, `s_flipper_r`, `s_start` and
  `s_plunger` as button-switch edges from `InputFrame` transitions (task 20), and `host/input` fills in the
  key→action map this story leaves empty. The plunger replaces `c_autolaunch` as the ordinary way a ball
  leaves the shooter lane, against the same `s_shooter_lane` opening this story turns into `ball_launched`.
- **Story 1.7** — nudge moves the cabinet under the ball inside the same physics step, and the tilt bob and
  slam detector emit their switches through the same edge path.
- **Story 1.8** — replays are `ReplayHeader + InputTransition[]` replayed through this story's `advance()`,
  and the state hash this story's determinism test computes becomes the shipped golden.
- **Story 1.9** — the dev tuning panel hot-applies the tunables this story adds and any others.
- **Story 2.1** — replaces every piece of placeholder geometry this story authors (`DW-58`), behind the
  same node prefixes, the same `TABLE` registry and the same `export.py` validation.
- **Story 2.4 / 2.5 / 2.12** — the devices-and-shots layer, the real ball lifecycle (replacing the dev
  pulse) and ball search all extend `sim/rules/devices.ts` and the device mechanics rather than replacing
  them.

### Ledger entries this story owns

This spec does **not** write to the ledger; the lead owns every ledger write. Recommended dispositions:

- **`DW-51`** (escalated, owner this story) — closed by tasks 2, 3(a), 3(b) and 4, with `test/device-eject-pose.test.ts`
  (task 8) as the standing guard that the class of defect cannot recur silently. Recommend
  `resolved-by:<this story key>`.
- **`DW-45`** (routed) — closed by task 11(a) and its tests in task 12. Recommend `resolved-by:<this story key>`.
- **`DW-35`** (routed) — closed by task 10(a) and its tests. Recommend `resolved-by:<this story key>`.
- **`DW-7`** (routed) — answered and closed by task 11(b) and task 12. The entry's question is now settled:
  the corner primitive was unreachable *by construction*, because a `HitPoint` at z = 0 is tangent to a
  deck-rolling ball; giving the corner the wall's z extent via `HitLineZ` is the entry's own first
  suggested residual. Recommend `resolved-by:<this story key>`.
- **`DW-8`** (open) — closed by task 24, which builds the genuinely non-convergent input the entry says is
  missing and runs it out of process with a hard timeout, exactly as the entry's note directs. Recommend
  `resolved-by:<this story key>`.
- **`DW-14`** (routed) — the re-characterisation is task 25, taken on the real geometry in a **new** test.
  The Spike 1 scene, its test and `docs/spikes/spike-1.md` are untouched, honouring the entry's standing
  instruction. The planning measurement (Node, four balls, mean 0.613 ms / p95 0.687 ms per 60 Hz frame)
  suggests the characterisation is comfortably inside the 4 ms bar, but the browser legs remain the
  author's. Recommend the lead decide whether this closes the entry or re-owns its browser half.

Two observations found while planning that are **not** planned as work here, offered for the lead to
adjudicate (they are in this spec's frontmatter `deferred:` list, not the ledger):

- `addBox()` emits 12 `HitTriangle`s and no edge or vertex primitives, so a box's edges are uncovered the
  same way a wall's corners were: a ball centred in the 15.65 mm slot between the two static flipper boxes
  passes straight through. Story 1.6 replaces both boxes with the ported `FlipperMover`, so the defect is
  transient for the flippers — but the reduction is generic and Epic 2 will author more boxes.
- The two static flipper boxes block most of the drain aperture, so a ball rolling straight down the
  placeholder playfield comes to rest against a flipper's up-slope face at y = 96 for most x. This is
  arguably correct placeholder behaviour (a cradled ball) and Story 1.6 makes the flippers move, so no
  change is planned; the drain tests drive a ball whose path reaches the aperture.

### Paths outside the stated footprint

The declared footprint is `src/**`, `test/**`, `tools/**`, `assets/src/**`, `.github/workflows/**`,
`package.json`, `pnpm-lock.yaml`, `tsconfig*.json`, `public/**`, `ATTRIBUTIONS.md` and
`_bmad-output/implementation-artifacts/**`. Every file this story creates or edits is inside it.

Three adjacent files were considered and are **deliberately not edited**:

- **`vitest.config.ts`** — out of footprint. Task 24's harness must not run in the default suite, which
  would ordinarily be an `exclude` entry there; instead the harness lives under `test/fixtures/**` with its
  own config file, which the default `include: ['test/**/*.test.ts']` does not match. No change needed.
- **`index.html`** — out of footprint, and no change is needed: the pinned CSP's `connect-src 'self'`
  already admits the same-origin `fetch` of `./assets/dragonwar.collision.json`.
- **`docs/spikes/spike-1.md`** — out of footprint and, per `DW-14`'s standing note, a dated record that
  must keep its baseline. The re-characterisation this story owes is recorded in a new test and in this
  spec's `## Auto Run Result`, for the lead to route.

No change is planned to `AGENTS.md`, `CLAUDE.md`, `NOTICE`, `LICENSE`, `vite.config.ts`, `.gitattributes`,
`.github/workflows/**` or anything under `_bmad-output/planning-artifacts/`.

## Verification

**Commands:**
- `git rev-parse --show-toplevel` — expected: exactly `C:/git/dragonwar/.worktrees/epic-1`. Stop if not.
- `BLENDER=<this host's blender.exe> pnpm export:assets` — expected: exit 0, both artifacts written. Run it
  **once after task 2 and before task 3** and confirm `git status --short` shows **no** change to
  `public/assets/dragonwar.collision.json`; the hull reduction must be byte-neutral for the existing walls.
- `BLENDER=<...> blender --background --factory-startup --python tools/make-placeholder-blend.py` then
  `BLENDER=<...> pnpm export:assets` — expected: exit 0; `git status --short` then shows exactly
  `assets/src/dragonwar.blend`, `public/assets/dragonwar.glb` and
  `public/assets/dragonwar.collision.json` modified, and nothing else.
- `node --input-type=module -e "import {readFileSync} from 'node:fs'; const j=JSON.parse(readFileSync('public/assets/dragonwar.collision.json','utf8')); console.log(j.version,j.units,j.frame); console.log(j.devices); console.log(j.nodes.map(n=>n.name)); console.log(j.switchZones.map(z=>[z.name,z.minMm.x,z.maxMm.x]));"`
  — expected: the `1` / `mm` / `table` handshake, `bd_trough`'s pose at the lane foot,
  `col_lane_deflector` present, and the four trough zones tiling x 200 → 314.4 contiguously.
  (`--input-type=module` is required: the package is `"type": "module"` but `node -e` does not inherit
  that, so a bare `import` in `-e` is a syntax error without it.)
- `pnpm typecheck` — expected: all three projects exit 0; `src/sim/**` still compiles with no DOM lib and
  no ambient types.
- `pnpm lint:boundaries` — expected: exit 0. The coverage line grows by the number of new `.ts` files under
  `src/`. **This is the check that catches a `TICK_HZ` reference or a `…Ms = <number>` binding that leaked
  into `sim/loop`, and a device-name literal anywhere in `src/**`.**
- `pnpm check:headers` — expected: exit 0, including every new `.ts` file.
- `pnpm check:attributions` — expected: exit 0.
- `pnpm test` — expected: green **both ways**. Run once with `BLENDER` set (every Blender-gated suite runs)
  and once with it unset (they skip, nothing fails). Report both counts against the 442 / 423+19 baseline.
- `pnpm build && pnpm check:dist && pnpm check:size` — expected: exit 0; `dist/assets/` contains both
  `dragonwar.glb` and `dragonwar.collision.json`.
- `git status --short` — expected: only the files this Code Map lists; no `dist/`, no `node_modules/`, no
  `dragonwar.tmp.*` left in `public/assets/`, no probe scripts, no edit under `docs/**` or
  `_bmad-output/planning-artifacts/**`.

**Manual checks (if no CLI):**
- Open `public/assets/dragonwar.collision.json` and confirm `col_lane_deflector`'s `footprintMm` has three
  points, that no two of them share both an x and a y with the bounding box's corners in a way that makes
  the shape a rectangle, and that every other wall's footprint is unchanged from the previous commit.
- Read `tools/export.py` and confirm the rotation guard, the degenerate-extent guard, the property-presence
  checks and every `sys.exit(n)` failure path are untouched — a `raise` alone exits 0 under
  `blender --python`.
- Read `src/sim/loop/index.ts` and confirm it names neither `TICK_HZ` nor any device name, and that
  `sim_time_discarded` is pushed **before** any step's events on a capped frame.
- Read `src/sim/physics/game/player-physics.ts` and confirm the vpx-js copyright block and the port-marker
  line are byte-identical to the previous commit and that the new method is documented in the existing
  deviation list.
- Run a production build and drive it in a real browser: press to begin, issue the two dev pulses, and
  confirm a ball is visible, moves, reaches the playfield and disappears on drain, with an empty CSP-error
  console.

## Auto Run Result

Status: ready-for-dev
Blocking condition: none
