---
title: 'Story 1.4: A placeholder table at real dimensions through the export pipeline'
type: 'feature'
created: '2026-08-28'
status: 'in-progress'
baseline_revision: '050eb9fa925895c9a647a7b1c6e5d324c28b7c12'
baseline_commit: '050eb9fa925895c9a647a7b1c6e5d324c28b7c12'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md'
warnings: ['oversized']
deferred:
  - summary: >-
      docs/spikes/spike-3.md describes public/assets/dragonwar.glb as the output of
      tools/make-placeholder-glb.mjs, which this story retires. docs/** is outside this epic's
      declared footprint and both spike records are dated, story-owned documents that Story 1.3's
      spec explicitly forbade editing, so the sentence is left standing as history.
    evidence: |-
      docs/spikes/spike-3.md lines 198-204 name the generator and the date; line 509 records the
      one-glb-versus-split decision against the 1,560-byte placeholder. Nothing in the automated
      suite reads those lines (grep over test/**: no reference to make-placeholder outside
      test/make-placeholder-glb.test.ts, which this story deletes with the tool), so no test goes
      red. The lead decides whether a dated spike record naming a since-retired generator is
      correct-as-history (recommended) or wants a pointer added at the epic gate.
    location: >-
      docs/spikes/spike-3.md
    severity: low
---

<intent-contract>

## Intent

**Problem:** The asset contract that AD-10 and AD-11 define exists only on paper. `public/assets/dragonwar.glb`
is a 1,560-byte single box emitted by `tools/make-placeholder-glb.mjs`, a Story 1.2 stand-in whose own
header says Story 1.4 replaces it; there is no `.blend`, no `tools/export.py`, no collision file, no
`src/sim/table/frames.ts`, and therefore no unit or axis conversion anywhere in the project — Story 1.1's
spike scene says so in its own comment ("an arbitrary local xy frame private to this harness ... Story 1.4
owns that mapping"). Nothing asserts the reference dimensions at load, so a wrong-size table is still a feel
problem waiting to be discovered months later, and Story 1.5 cannot serve a ball because there is no
geometry, no eject pose and no way to turn a simulated position into a rendered one.

**Approach:** Stand the whole pipeline up end to end at placeholder fidelity: a scripted-then-committed
`assets/src/dragonwar.blend` of primitives that already follows every AD-11 node prefix; `tools/export.py`
as the contract's enforcer, validating node names and every authored property against a JSON dump of
`TABLE` before it writes `public/assets/dragonwar.glb` (presentation) and `public/assets/dragonwar.collision.json`
(mm, table frame, physics); `src/sim/table/frames.ts` as the one sanctioned unit/axis converter;
`src/sim/physics/loader` building one compound collision body from the ported primitive set and asserting
`col_playfield` bounds and both flipper lengths against `TABLE.reference`; and `src/presentation/scene`
loading the glb, failing fast on a missing node, applying pitch to `playfield_root` about `pivot_pitch`
alone and rendering from an authored fixed camera. Blender is a local authoring tool that CI does not have,
so the committed artifacts are what CI and the test suite consume, and every step that shells out to
Blender resolves it through a `BLENDER` environment variable and skips cleanly when it cannot.

## Boundaries & Constraints

**Always:**
- **Blender is never hardcoded.** `tools/export.py`, the npm script that drives it and every test that
  touches it locate Blender through a `BLENDER` environment variable first, then a PATH lookup, then a
  short list of conventional per-platform install locations. When none resolves, the failure message names
  `BLENDER`, lists what was tried and says how to set it. No absolute path to any machine's Blender install
  may appear in a committed file.
- **CI has no Blender, and every push runs CI.** `.github/workflows/ci.yml` is `on: push:` with no branch
  filter (Story 1.3), so the `checks` job runs on `ubuntu-latest` for every push. The split is explicit:
  **the committed `public/assets/dragonwar.glb` and `public/assets/dragonwar.collision.json` are what CI and
  the default test suite consume; regenerating them from the `.blend` is a local authoring step.** No CI step
  invokes Blender, and every test that needs Blender skips — not fails — when it cannot resolve one.
- **Provenance before the file (CLAUDE.md, hard gate).** `assets/src/dragonwar.blend`,
  `public/assets/dragonwar.glb` and `public/assets/dragonwar.collision.json` are author-made generated
  assets: their `ATTRIBUTIONS.md` rows, naming the tool (Blender 5.2.1 LTS and the two scripts in this
  repository) and the date, land in an edit made BEFORE the files do. Blender itself is a GPL **tool**, not a
  vendored file — nothing about the toolchain enters the repository and it gets no Code-table row.
- **Nothing enters this pipeline that a placeholder does not need.** Geometry is primitives; the pipeline is
  the deliverable, not the art (AD-11).
- **Geometry is authored unpitched (AD-10).** The `.blend` is level. Pitch is presentation's rotation of
  `playfield_root` about `pivot_pitch` and, later, physics's gravity vector — never a tilt baked into a mesh.
- **One converter (AD-10).** `src/sim/table/frames.ts` is the only file in the repository that converts
  units or axes between the table, glb, physics and scene frames. If another file needs a conversion, it
  imports one from here.
- **The reference dimensions are asserted, not assumed (AD-10).** The collision loader throws a descriptive
  error naming the node, the measured value and the expected value when `col_playfield`'s bounds or either
  flipper node's length disagrees with `TABLE.reference` beyond tolerance.
- **`sim/` never parses glb and never reads a file (AD-1, AD-11).** The collision loader is a pure function
  over an already-parsed document; the caller does the I/O. `src/sim/**` typechecks with `lib: ["ES2023"]`
  and `types: []`, so `fs`, `fetch` and every DOM global are compile errors there.
- **Device names come from `TABLE`, never from a string literal** (`pnpm lint:boundaries` rule (e), prefixes
  `s_ c_ l_ f_ gi_ bd_ shot_ show_` outside `src/sim/table/dragonwar.ts` and `test/**`). The loaders and the
  scene read node names out of `TABLE.nodes` and the derived unions.
- **Every new source file carries the GPL-3.0 header line** — `.py` is in `check-licence-headers.mjs`'s
  `AUTHORED_EXTENSIONS`, so both Python files need one too (a `#` comment is fine; the check is a substring
  match on `DragonWar is licensed GPL-3.0`).
- Story 1.2's narrow-back stands: the deploy job runs from `main` plus `workflow_dispatch` only, and the
  pinned CSP `default-src 'self'; connect-src 'self'` is not touched.

**Block If:**
- The `.blend` cannot be produced or the export cannot be run because no Blender resolves on this host —
  HALT `blocked` naming what `resolveBlender()` tried. (It does resolve: see the Code Map's verified
  environment facts. This clause exists for a re-run on another machine.)
- A required geometric figure is neither stated by a planning artifact nor defensibly authorable as a
  placeholder dimension — HALT `blocked` naming it rather than inventing it. Placeholder *positions* are
  authorable by definition (AD-11: Blender owns placement, the art is not the deliverable); a *physics
  tunable* is not, and anything on the PRD addendum's do-not-invent list is not.
- Making the committed collision file assert against `TABLE.reference` would require changing
  `TABLE.reference` itself — it is AD-10's fixed reference block and Story 1.3 shipped it verbatim. HALT
  `blocked` instead.
- Widening `test/sim-boundary.test.ts`'s physics-header rule (task 15) turns out to require weakening the
  ported-file assertion itself rather than adding an authored-file branch beside it — HALT `blocked`.

**Never:**
- Never edit `tools/spike-1/scene.ts` or any Story 1.1 spike harness. DW-7's own standing note forbids it
  ("do NOT redesign the spike scene and invalidate the baseline"); the corner-`HitPoint` coverage this story
  owes comes from the new placeholder geometry, in a new test.
- Never edit any file under `src/sim/physics/` that carries the vpx-js port marker. Solver constants are
  ported verbatim (AD-15); the new loader is a new authored file beside them.
- Never add a `Table` interface, a table-loading API, a plugin API or runtime table selection (AD-1).
- Never let `presentation/**` import anything from `sim/` other than `sim/contracts` and `sim/table`, and
  never let `sim/**` import `presentation/**`, `host/**` or `@babylonjs/*`.
- Never relax, disable or narrow a boundary or lint rule so the build passes. Task 15's single sanctioned
  change aligns a test with AD-16's own wording (which already provides for authored files under
  `src/sim/physics/`) rather than weakening it, and must be argued that way in the diff.
- Never build what a later story owns: the fixed-step loop and `advance()` (1.5), the trough eject *speed*
  tunable and the ball serve (1.5), the `FlipperMover` and the plunger (1.6), nudge/tilt/slam (1.7), replay
  goldens (1.8), the dev panel (1.9), real playfield geometry or the full switch set (Epic 2), the lightmap
  bake (Epic 4), or any art (Epic 5).
- Never edit `docs/spikes/spike-1.md` or `docs/spikes/spike-3.md` — dated records owned by Stories 1.1
  and 1.2.
- Never widen the deploy trigger, weaken the CSP, or remove the third-party notices from `dist/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Blender resolved from `BLENDER` | `BLENDER` set to an existing executable | `resolveBlender()` returns that exact path without consulting PATH or the fallback list | No error expected |
| Blender resolved from PATH / conventional location | `BLENDER` unset, a `blender` binary on PATH or at a known install path | `resolveBlender()` returns the first hit, in that order | No error expected |
| Blender not found | `BLENDER` pointing at a non-existent path, or nothing anywhere | `pnpm export:assets` exits non-zero; the message contains `BLENDER`, the path(s) tried and how to set it | This is the failure path; it must be reachable **without Blender installed**, which is what makes it CI-testable |
| Blender too old | A resolved Blender older than 5.2 | `tools/export.py` exits non-zero naming `bpy.app.version` and the 5.2 minimum | Version gate runs before any validation, so the message is about the toolchain, not the model |
| Clean export | The committed `.blend` + a `TABLE` contract dump | `public/assets/dragonwar.glb` and `public/assets/dragonwar.collision.json` are written; exit 0 | No error expected |
| Bad node name | A node named `Cube.001` or `col_Playfield` | Exit non-zero naming the offending node and the rule `^[a-z][a-z0-9_]*$` | Validation runs over **every** object in the `.blend`, including nodes excluded from the glb |
| Duplicate node name | Two objects that would export under one name | Exit non-zero naming the repeated name | |
| Two materials on one mesh | A mesh with 2+ material slots | Exit non-zero naming the node and its slot count | AD-11's "one material each" |
| Unknown property value | `lightgroup`, `surface`, `phys_material` or `switch` carrying a value absent from the `TABLE` dump | Exit non-zero naming the node, the property and the value | The property-name/value pair must both appear in the message |
| Missing required node | The `.blend` lacking `playfield_root`, `cabinet_root`, `pivot_pitch`, `col_playfield`, `col_flipper_l` or `col_flipper_r` | Exit non-zero naming the missing node | |
| Python raises instead of exiting | Any uncaught exception inside `export.py` | Still a non-zero process exit | **Verified trap:** an uncaught exception in a `blender --python` script exits **0** by default. Every failure path must `sys.exit(n)` explicitly, and the driver must also pass `--python-exit-code` |
| Static mesh missing lightmap UVs | An exported mesh with fewer than two UV layers | Exit non-zero naming the node | `TEXCOORD_1` is AD-12's asset contract; it only exists if a second UV layer does |
| Collision doc loads | The committed `dragonwar.collision.json`, parsed and handed to `src/sim/physics/loader` | One compound body of ported primitives (`HitPlane`, `LineSeg`, `HitPoint`, `HitTriangle`), the glass plane, and every `sw_` zone registered against its `TABLE` switch | No error expected |
| Mis-sized collision doc | A doc whose `col_playfield` bounds or a flipper length differs from `TABLE.reference` beyond tolerance | The loader **throws** a descriptive `Error` naming the node, the measured value and the expected value | Load-time paths throw (AD-16 conventions); step paths never do |
| Corner reached | A ball fired into a wall corner of the loaded body | `HitPoint.collide()` runs — the corner primitive is exercised | Closes ledger `DW-7` from the new geometry, not from the spike scene |
| Scene loads the glb | `src/presentation/scene` given the committed glb | Every node named in `TABLE.nodes` resolves; pitch rotates `playfield_root` about `pivot_pitch`; `cabinet_root`'s world matrix is unchanged by pitch; the authored camera frames the whole playfield | A missing named node throws before the first frame, so `boot.ts` renders the host error panel (AD-17) |
| Round-trip through the frames | Any point | `glbToTable` → `toScene` and `toPhysics` → `fromPhysics` return the original within floating-point tolerance | A frames function is the only place either conversion may happen |
| CI, no Blender | `ubuntu-latest`, `BLENDER` unset, nothing on PATH | The Blender-dependent suites report **skipped**; every other check runs against the committed artifacts; the job is green | A Blender-dependent test that fails instead of skipping is a defect |

</intent-contract>

## Code Map

**Read-only governing sources (do not edit):**
- `_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md`
  — the ADR registry (there is no `docs/adr/`). The dependency graph at lines 37-61 (**`physics --> table`
  and `pres --> table` are both permitted arrows** — this is what lets the loader and the scene read
  `TABLE`). AD-1 line 69, AD-2 line 75, AD-3 line 81, AD-5 line 112, AD-6 line 118, AD-9 line 162,
  **AD-10 line 168** (the canonical frame, the three conversions, unpitched authoring, the asserted
  reference block), **AD-11 line 174** (Blender owns placement, `TABLE` owns devices/wiring/groups/tunables,
  the export script is the enforcer, the full node-prefix list), AD-12 line 180 (`TEXCOORD_1` + `lightgroup`
  as the asset contract now, bake later), AD-15 line 198, AD-16 line 204 (**"new files carry the GPL-3.0
  header"** — the clause task 15 aligns the test with), AD-17 line 210.
- `.../SOLUTION-DESIGN.md` §8 "Assets and frames", lines 111-123 — the same rules in prose, plus the
  reason for the glb/collision split ("a glb parser drags Babylon into the simulation and ends headless
  Node goldens").
- `_bmad-output/planning-artifacts/epics.md` lines 435-465 — Story 1.4's four acceptance criteria, and
  lines 466-500 — Story 1.5's, which consume this story's output. **Line 437's node list is authoritative
  over AD-11's looser phrasing: `playfield_root`, `cabinet_root` and `pivot_pitch` are the *only* top-level
  nodes** (verified reachable — see environment facts below).
- `docs/spikes/spike-1.md`, `docs/spikes/spike-3.md` — dated records. **Leave both unedited.**

**Existing code this story extends (anchors verified at `02afed4`):**
- `src/sim/table/dragonwar.ts` (177 lines) — `TABLE as const`, deep-frozen via `deepFreeze()`.
  `reference` at line ~88 (`playfieldMm {514.4, 1066.8}`, `ballMm 26.99`, `pitchDeg 6.5`,
  `flipperBatIn 3.125`); eleven `switches` with `settleClass`; four `coils`; `ballDevices.bd_trough`
  (parking, capacity 4, slots in fill order, `ejectCoil`, `ballSearchOrder`) and `bd_shooter`
  (non-parking, entry `s_shooter_lane`); `giChannels`; **`lamps`, `flashers`, `shows`, `shots`,
  `lightGroups` are all `{}`** with a comment explaining that their derived unions are therefore `never`.
  This story adds `nodes`, populates `lightGroups`, adds `physMaterials` and adds exactly one lamp.
- `src/sim/table/names.ts` — `LampName = keyof typeof TABLE.lamps`. Adding one lamp changes `LampName`
  from `never` to that one name; nothing else in the file needs editing.
- `src/sim/table/tuning.ts` — `TUNING.materials` is `{ default, flipper_rubber }`, each
  `{ elasticity, elasticityFalloff, friction, scatter }` with `source`/`confidence` (line 61 ff).
  **Not Node-importable** (see environment facts) — hence `TABLE.physMaterials` plus a drift-pinning test
  rather than reading this file from tooling.
- `src/sim/contracts/events.ts` line 24 — `ContactSurface` is a 12-member type union with **no runtime
  value**. `test/contracts.test.ts:65-67` pins the twelve members and the length.
- `src/sim/contracts/snapshot.ts` line 21 — `Vec3Mm` is documented "table-frame position or velocity
  vector, millimetres (AD-10)", and `BallSnapshot.pos` is a `Vec3Mm`. **This is the evidence that a
  physics→table inverse must exist**: Story 1.5 must publish table-mm ball positions from a physics
  simulation that keeps VP units internally.
- `src/sim/physics/**` — the vpx-js port. Primitive set already present: `hit-plane.ts` (`HitPlane`),
  `line-seg.ts` (`LineSeg`), `hit-point.ts` (`HitPoint`, with `hitTest()` at line 44 and **`collide()` at
  line 119** — the method the DW-7 test observes), `hit-triangle.ts`, `hit-line-3d.ts`, `hit-line-z.ts`,
  `hit-circle.ts`, `hit-3dpoly.ts`, `hit-quadtree.ts`, `hit-kd.ts`.
  `game/player-physics.ts`: `addStaticHitObject()` line 138, `finalizeStatics()` line 165,
  `setPlayfieldHit()` line 150, `setTopGlassHit()` line 154, `addBall()` line 122, `step()` line 326
  (**throws unless both planes were set**), `setGravity()` line 349 — `gravity.y = sin(slope)·strength`,
  i.e. **physics +y points down-slope toward the player**, which fixes `toPhysics`'s y flip.
- `tools/spike-1/scene.ts` — **read for shape, never edit.** Lines 91-165 build exactly the body this
  story's loader must build: a `HitPlane` floor, a `HitPlane` glass, four `LineSeg` walls wound
  counter-clockwise, and **one `HitPoint` per corner** with the comment explaining why (`LineSeg`'s
  tangential bounds check leaves the corner itself uncovered). `mmToVu()` at line 45,
  `MM_PER_VU = 0.53975` at line 44 — `frames.ts` supersedes both for production code.
- `src/presentation/scene/create-engine.ts` — `loadAndRenderOnce()` at line 240 sets
  `scene.useRightHandedSystem = true` (line 246), seeds the BRDF texture, then builds a **placeholder**
  `ArcRotateCamera` at line 252 whose own comment says "`presentation/camera/` owns the real fixed view".
  `ImportMeshAsync` at line 258; the first-frame promise below it must not be disturbed.
  `bootScene()` line 322 with its WebGL2 fallback path. `loadAndRenderOnceForTests()` line 307.
- `src/host/boot.ts` line 19 — `const GLB_URL = './assets/dragonwar.glb'`. Unchanged by this story.
- `test/scene-smoke.test.ts` — the NullEngine load smoke. **Asserts `vis_placeholder_box` at line 47**
  (a node this story's glb will not contain) and re-checks the `^[a-z][a-z0-9_]*$` grammar at line 54.
  Loads the glb as a `data:` URL, test-only, with the rationale in its header.
- `test/sim-boundary.test.ts` lines 43-71 — **requires an upstream copyright block immediately followed
  by the port-marker line on EVERY file under `src/sim/physics/**`**. A new authored file there fails this
  as written; task 15 is the fix. Lines 73-95 are the AD-15 verbatim solver-constants pin: keep untouched.
- `test/table.test.ts` lines 117-122 — asserts `lamps`, `flashers`, `shows`, `shots` and `lightGroups`
  are all `{}`. Two of those five change in this story.
- `tools/check-dist.mjs` — `checkRuntimeAssets()` at line 279 requires `dist/assets/dragonwar.glb`;
  `checkDist()` at line 288 composes the checks. `test/check-dist.test.ts` drives it against synthetic
  dist trees (fixture shape at lines 75, 218, 267 ff).
- `tools/check-licence-headers.mjs` line 37 — `AUTHORED_EXTENSIONS` **includes `.py`**; line 38 exempts
  three exact paths. `.json`, `.glb` and `.blend` are not authored extensions, so the two generated data
  files need no header.
- `tools/boundary-lint.mjs` line 71 — `DEVICE_NAME_PATTERN = /^(?:s|c|l|f|gi|bd|shot|show)_[a-z0-9_]+$/`,
  applied to string **and template** literals across `src/**` except `src/sim/table/dragonwar.ts`
  (line 428). Note `col_`, `sw_`, `vis_` and `lg_` do **not** match it; `c_flipper_l`, `bd_trough` and
  `l_insert_*` do.
- `tools/dependency-cruiser.config.mjs` — six forbidden rules; `presentation-only-contracts-and-table`
  (line 88) permits `presentation/** -> sim/table/**`, which is how the scene reaches `frames.ts`.
- `tools/make-placeholder-glb.mjs` (208 lines) + `tools/make-placeholder-glb.d.mts` +
  `test/make-placeholder-glb.test.ts` — Story 1.2's stand-in. Its header (lines 4-16) and its
  `ATTRIBUTIONS.md` row both say Story 1.4 replaces it. **Retired by task 21.**
- `tools/size-budget.mjs` line 56 — `BUDGET_BYTES = 2_750_000` gzipped, against a measured 0.75 MB
  baseline. The placeholder glb goes from 1,560 bytes to single-digit kilobytes; the budget is not at risk.
- `.github/workflows/ci.yml` — `on: push:` (no branch filter) + `pull_request` + `workflow_dispatch`;
  `checks` on `ubuntu-latest`; `deploy` guarded to `main`. **Keep both explanatory comment blocks intact.**
- `.gitignore` — ignores `dist/`, `node_modules/`, `.vite/`, `.worktrees/`. **`public/` is tracked**
  (`git ls-files public` returns `LICENSE.txt`, `THIRD-PARTY-NOTICES.txt`, `assets/dragonwar.glb`,
  `styles.css`), and `assets/src/` currently holds only `.gitkeep`. Confirmed at `02afed4`.
- `ATTRIBUTIONS.md` — "Generated content" table currently holds one row for
  `public/assets/dragonwar.glb`/`tools/make-placeholder-glb.mjs` dated 2026-08-27, whose last sentence
  says "Story 1.4 replaces it with the `tools/export.py` output behind the same path and node-name
  contract". The Assets table is empty and says so.

**Verified environment facts (established during planning on 2026-08-28 by running the tools; cite, do not
re-derive):**
- **Blender 5.2.1 LTS is installed at `C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe`**, a
  portable build: not on PATH, not a system install, outside the repository. Bundled Python 3.13.13.
  *This path is machine-specific — export with `BLENDER=<that path> pnpm export:assets`; it must never
  appear in a committed source file, npm script or test.*
- `bpy.ops.export_scene.gltf` exposes 111 properties, including `export_yup`, `export_extras`,
  `export_format`, `export_texcoords`, `export_apply`, `use_selection`, `export_cameras`, `export_lights`,
  `export_animations`, `export_skins`, `export_morph`.
- **Object custom properties export as glTF node `extras`** with `export_extras=True`. Confirmed:
  `ob["lightgroup"]="lg_playfield"` came back as `"extras": {"lightgroup": "lg_playfield"}` on the node.
- **Every UV layer exports, whether or not a material uses it.** A mesh with three UV layers produced
  `POSITION, NORMAL, TEXCOORD_0, TEXCOORD_1, TEXCOORD_2`. So `TEXCOORD_1` is achieved by authoring a
  second UV layer — no material wiring needed. (`bmesh`/primitive helpers add their own `UVMap`; name
  layers explicitly, e.g. `uv_base` / `uv_lightmap`, and count them rather than trusting names.)
- **Axis mapping, measured:** an object at Blender `(0.1, 0.2, 0.03)` m exported to glTF translation
  `(0.1, 0.03, -0.2)`. So glb `(x,y,z)` = blender `(bx, bz, -by)`, which — authoring the `.blend` directly
  in the table frame in metres — is exactly AD-10's "glb +X = table +X; glb +Y = table +Z; glb −Z = table +Y".
  Therefore `glbToTable(v) = { x: v.x*1000, y: -v.z*1000, z: v.y*1000 }`.
- **`use_selection=True` preserves the hierarchy of the selected objects.** Selecting the three roots plus
  the `vis_`/`l_`/mechanism meshes produced exactly those nodes, with `cabinet_root`, `pivot_pitch` and
  `playfield_root` as the three scene roots and the meshes correctly parented.
- **glTF node names come from the *object*; glTF mesh names come from the mesh datablock.** Name both the
  same so the exported names are predictable, and validate object names.
- **The exported glb is byte-deterministic** across runs of the same script on this host (identical
  SHA-256). A re-export equality check is therefore meaningful — but only where Blender exists.
- **A `.blend` is NOT byte-deterministic** (two saves of the identical scene differed). Do not assert
  byte equality on it. Save with `compress=True`: ~86 KB compressed vs ~493 KB uncompressed for a trivial
  scene.
- **THE TRAP: an uncaught Python exception inside `blender --python script.py` exits 0.** Measured:
  `sys.exit(3)` → exit 3; `raise RuntimeError` → **exit 0**; `--python-exit-code 4` + `raise` → exit 4.
  Every failure path in `export.py` must call `sys.exit(n)` explicitly *and* the driver must pass
  `--python-exit-code`, or a broken export silently "succeeds".
- `blender --background --factory-startup <file.blend> --python <script.py> -- <args>` opens the file,
  runs the script, and leaves `sys.argv` after `--` clean.
- A full placeholder-shaped probe (playfield + 3 walls + flipper + switch zone + insert lens/cup +
  device empty + a 16×16 generated translucency image) exported to **9,116 bytes** of glb, with
  `TEXCOORD_1` and `lightgroup` on every exported mesh. `col_playfield`'s world-space bounding box came
  out `x [0, 514.4000053405762]`, `y [0, 1066.7999982833862]`, `z [-19, 0]` mm — **float32 storage means a
  tolerance is mandatory; the observed error is ~5e-6 mm, so 0.1 mm is four orders of magnitude of margin
  while still catching any real mistake.**
- **Node 24.16.0 natively imports TypeScript modules.** `node -e "import('./src/sim/table/dragonwar.ts')"`
  returned `TABLE` and `deepFreeze` with `reference.playfieldMm` intact, and
  `src/sim/contracts/events.ts` imports too (its cross-imports are all `import type`, which type-stripping
  erases). **`src/sim/table/tuning.ts` does NOT import under Node** — it uses the extensionless specifier
  `'./dragonwar'`, which Node's ESM resolver rejects. This is why the `phys_material` name list belongs in
  `TABLE` (task 3) with a drift-pinning test (task 20), rather than being read from `tuning.ts` by tooling.
- Working tree clean at `02afed4`; branch `DW-1-epic1`; Node 24.16.0; pnpm 11.24.0; 23 test files.

**Files this story creates:**
- `src/sim/table/frames.ts`
- `src/sim/physics/loader/index.ts`
- `src/presentation/camera/fixed-camera.ts`, `src/presentation/scene/playfield.ts`
- `tools/blender.mjs` + `tools/blender.d.mts`
- `tools/export-assets.mjs` + `tools/export-assets.d.mts`
- `tools/export.py`, `tools/make-placeholder-blend.py`
- `assets/src/dragonwar.blend` (generated, committed)
- `public/assets/dragonwar.collision.json` (generated, committed)
- `test/frames.test.ts`, `test/blender-resolve.test.ts`, `test/collision-loader.test.ts`,
  `test/asset-contract.test.ts`, `test/export-py.test.ts`

**Files this story edits:** `ATTRIBUTIONS.md` (first), `src/sim/contracts/events.ts`,
`src/sim/table/dragonwar.ts`, `src/presentation/scene/create-engine.ts`, `tools/check-dist.mjs`,
`package.json`, `.github/workflows/ci.yml` (comment only), `public/assets/dragonwar.glb` (regenerated),
`test/sim-boundary.test.ts`, `test/table.test.ts`, `test/scene-smoke.test.ts`, `test/check-dist.test.ts`.

**Files this story deletes:** `tools/make-placeholder-glb.mjs`, `tools/make-placeholder-glb.d.mts`,
`test/make-placeholder-glb.test.ts`.

## Tasks & Acceptance

**Execution:** (dependency order; task 1 is a hard gate on tasks 7-10, and tasks 2-3 gate everything after)

1. `ATTRIBUTIONS.md` — **before any asset file is created.** Replace the single "Generated content" row
   with three, each naming the tool and the date the file was made: `assets/src/dragonwar.blend`
   (Blender 5.2.1 LTS via `tools/make-placeholder-blend.py`, this repository), `public/assets/dragonwar.glb`
   and `public/assets/dragonwar.collision.json` (both Blender 5.2.1 LTS via `tools/export.py` from that
   `.blend`). Each row states that the content is author-made — original primitives at published pinball
   dimensions, nothing sourced, nothing from any commercial machine. Add one sentence closing Story 1.2's
   loop: `tools/make-placeholder-glb.mjs` is **retired** by this story and `tools/export.py` is now the sole
   owner of `public/assets/dragonwar.glb`. Add one sentence recording that Blender is a GPL **tool** used to
   author these files, is not vendored into the repository and therefore has no Code-table row.
   — *rationale: CLAUDE.md's hard provenance rule, the story's first acceptance criterion, and the
   dispatch's "two competing claims about who owns dragonwar.glb".*
2. `src/sim/contracts/events.ts` — add `export const CONTACT_SURFACES = [...] as const` holding the twelve
   existing members in their existing order, and redefine `ContactSurface` as
   `(typeof CONTACT_SURFACES)[number]`. The type must remain identical; `test/contracts.test.ts:65-67`
   passes unchanged. — *rationale: AD-11's export validates `surface` values against a dump of the table
   contract, and a type union cannot be dumped. This file is Node-importable (verified), so the dump reads
   the real list rather than a hand-copied duplicate.*
3. `src/sim/table/dragonwar.ts` — extend `TABLE` with: `nodes` (the glb/collision node names AD-11 says
   `TABLE` owns — `playfieldRoot`, `cabinetRoot`, `pivotPitch`, `colPlayfield`, `colGlass`, `colFlipperL`,
   `colFlipperR`); `lightGroups` populated with the placeholder's groups (`lg_playfield`, `lg_inserts`,
   `lg_cabinet`); `physMaterials` naming the material keys `tuning.ts` defines (`default`,
   `flipper_rubber`); and exactly **one** lamp, `l_insert_left`, the `l_` insert the story's first
   acceptance criterion requires. Keep every existing field byte-identical, keep the `as const` +
   `deepFreeze` shape, and update the "empty on purpose" comment to say which collections are still empty
   and why. — *rationale: AD-11 — every `lightgroup`/`surface`/`phys_material`/`switch` an authored node
   carries must be validatable against `TABLE`, and a node the loaders name must come from `TABLE`, not a
   string literal (`pnpm lint:boundaries` rule (e)).*
4. `src/sim/table/frames.ts` — the one converter. Export `glbToTable()` (glb metres, y-up → table mm),
   `toScene()` (table mm → scene metres, the inverse permutation) and `toPhysics()` (table mm → VP units,
   y flipped about the playfield's far edge so physics +y runs down-slope as `setGravity()` assumes), each
   with the inverse the seam actually needs: `fromPhysics()` is required — `Snapshot.balls[].pos` is
   documented table-mm while physics keeps VP units internally, and this story's own acceptance criterion
   asks for a `table → physics → table` round trip. `MM_PER_VU = 0.53975` lives here and nowhere else in
   `src/`. No file other than this one may convert units or axes. — *rationale: AD-10; the story's third
   acceptance criterion.*
5. `tools/blender.mjs` + `tools/blender.d.mts` — export `resolveBlender(env = process.env)` returning an
   absolute path, and a `BlenderNotFoundError` carrying the ordered list of candidates tried. Order:
   `env.BLENDER` (used verbatim if it exists and is executable — and a clear error naming `BLENDER` if it
   is set but does not exist, never a silent fallback); then a PATH lookup for `blender`/`blender.exe`;
   then a short per-platform list (Windows `C:\Program Files\Blender Foundation\Blender */blender.exe` and
   the per-user `Programs` equivalent; macOS `/Applications/Blender.app/Contents/MacOS/Blender`; Linux
   `/usr/bin/blender`, `/usr/local/bin/blender`, `/snap/bin/blender`,
   `/var/lib/flatpak/exports/bin/org.blender.Blender`). Node built-ins only. — *rationale: the dispatch's
   first binding constraint; this is the unit the CI-safe failure test drives.*
6. `tools/export-assets.mjs` + `tools/export-assets.d.mts` — the driver. Import `TABLE` from
   `../src/sim/table/dragonwar.ts` and `CONTACT_SURFACES` from `../src/sim/contracts/events.ts` (Node 24
   imports both natively — verified), build the **table contract dump** (`reference`, `switches`, `coils`,
   `ballDevices`, `lamps`, `lightGroups`, `physMaterials`, `nodes`, `surfaces`), write it to a temp file,
   then spawn `resolveBlender()` with `--background --factory-startup <blend> --python-exit-code <n>
   --python tools/export.py -- --table-json <tmp> --out public/assets`, forward stdout/stderr, delete the
   temp file, and exit with the child's code. Exit non-zero with the `BLENDER` message if `resolveBlender()`
   throws. — *rationale: the dump is the export's contract input, and keeping it generated (never committed)
   makes drift impossible.*
7. `tools/make-placeholder-blend.py` — the one-time seeding script that builds `assets/src/dragonwar.blend`
   headlessly, authored **unpitched**, in the table frame, in metres (table mm ÷ 1000), with
   `playfield_root`, `cabinet_root` and `pivot_pitch` as the **only** top-level nodes. Contents, per the
   story's first acceptance criterion: `col_playfield` (514.4 × 1066.8 mm with real thickness), thick
   `col_wall_*` around the playfield and down the plunger lane, `col_glass` above it, `col_flipper_l` and
   `col_flipper_r` at the reference pivot geometry with 3.125 in (79.375 mm) bats, a plunger lane,
   `sw_shooter_lane`, `sw_trough_1..4`, a drain zone, `bd_trough` and `bd_shooter` empties positioned and
   oriented at their authored eject poses, one `vis_` placeholder mesh, `l_insert_left` with **both** lens
   and cup geometry below the playfield surface (never a decal), a playfield material carrying a
   translucency mask (a small generated image is sufficient), a second UV layer on every static mesh, and a
   `lightgroup` custom property on each. `col_`/`sw_` nodes carry `surface` and `phys_material`; `sw_` nodes
   carry `switch` naming their `TABLE` switch; each `col_` node carries `col_shape` from the closed set
   `plane | wall | box`. Its header states plainly that it seeded the committed `.blend` once and that from
   now on **the `.blend` is the source of truth** (AD-11) — the script is the record of how the placeholder
   was made and a way to regenerate one from scratch, not a build step. — *rationale: AD-11; and an
   unattended agent cannot author a binary `.blend` any other way, so the script is also the reviewable
   form of the diff.*
8. `assets/src/dragonwar.blend` — run task 7 through the resolved Blender and commit the result
   (`compress=True`). — *rationale: the story's first acceptance criterion.*
9. `tools/export.py` — the contract's enforcer, run inside Blender. Read `--table-json`; gate on
   `bpy.app.version >= (5, 2, 0)`; validate **every object in the file** (not only the exported subset) for
   the name grammar `^[a-z][a-z0-9_]*$`, uniqueness, at most one material slot per mesh, a second UV layer
   on every static mesh it exports, every `lightgroup`/`surface`/`phys_material`/`switch` value against the
   dump, the presence of every node named in `nodes`, and that a `col_` node carries a known `col_shape`;
   then export `public/assets/dragonwar.glb` with `export_yup=True, export_extras=True` over the
   presentation selection, and write `public/assets/dragonwar.collision.json` — `col_`, `sw_` and device
   nodes reduced to the ported primitive set, in **millimetres, table frame**, computed from world matrices
   in Python (never from the glb). **Every failure path calls `sys.exit(n)` after printing a message naming
   the offending node and property** — the exit-0-on-exception trap is measured, not theoretical. Carry the
   GPL-3.0 header line. — *rationale: AD-11, the story's second acceptance criterion.*
10. `public/assets/dragonwar.glb` + `public/assets/dragonwar.collision.json` — run
    `BLENDER=<path> pnpm export:assets` and commit both. The glb replaces Story 1.2's 1,560-byte box at the
    same path, so `src/host/boot.ts` needs no change. — *rationale: the committed artifacts are what CI
    consumes.*
11. `src/sim/physics/loader/index.ts` — a **pure function over an already-parsed document**
    (`loadCollision(doc: unknown)`; the caller owns the I/O, because `src/sim/**` has no `fs` and no
    `fetch`). It validates the document shape; asserts `col_playfield`'s bounds and **both** flipper node
    lengths against `TABLE.reference` within a 0.1 mm tolerance, throwing a descriptive `Error` naming the
    node, the measured value and the expected value on mismatch; builds **one compound body** from the
    ported primitive set — `HitPlane` for the playfield and glass, `LineSeg` per wall footprint edge with a
    **`HitPoint` at every corner** (the same construction `tools/spike-1/scene.ts` documents at lines
    153-160), `HitTriangle` for `box` shapes — converting through `toPhysics()` and nothing else; and
    returns each `sw_` zone paired with its `TABLE` switch name. Carries the GPL-3.0 header (it is authored,
    not ported). — *rationale: AD-6, AD-10, AD-11; the story's fourth acceptance criterion; and the corner
    `HitPoint`s are what close ledger `DW-7`.*
12. `src/presentation/camera/fixed-camera.ts` — the one fixed authored camera, no camera controls: a
    position and target in scene metres framing the whole playfield with the drain nearest the viewer,
    derived from `TABLE.reference` through `toScene()`. — *rationale: UJ-4 and the Structural Seed;
    `create-engine.ts`'s current inline camera comment already assigns this file the job.*
13. `src/presentation/scene/playfield.ts` — resolve each node named in `TABLE.nodes` from the loaded scene,
    **throwing on the first missing one** (so `boot.ts` shows AD-17's host error panel rather than a silent
    half-scene), and expose `applyPitch(nodes, pitchDeg)` rotating `playfield_root` about `pivot_pitch`'s
    position **only**, leaving `cabinet_root` untouched. Default the pitch to `TABLE.reference.pitchDeg`;
    Story 1.5 feeds it the snapshot's effective pitch. — *rationale: AD-10 (pitch is never baked into
    geometry, and the cabinet stays level), the story's fourth acceptance criterion.*
14. `src/presentation/scene/create-engine.ts` — replace the inline `ArcRotateCamera` with task 12's camera
    and call task 13's resolver + `applyPitch` after `ImportMeshAsync`. **Do not disturb**
    `useRightHandedSystem`, `seedEnvironmentBrdfTexture()`, the first-frame promise or `bootScene()`'s
    fallback path — all three carry closed review findings. — *rationale: the story's fourth acceptance
    criterion; the integration point where the pipeline output becomes an observable render.*
15. `test/sim-boundary.test.ts` — widen the `src/sim/physics/**` header rule from "upstream copyright block
    immediately followed by the port marker" to "**either** that exact ported structure **or** the DragonWar
    GPL-3.0 header", keeping the ported branch's structural assertion exactly as strict as it is today and
    adding a case asserting an authored file is accepted only via the GPL-3.0 branch. Leave the AD-15
    solver-constants pin (lines 73-95) untouched. — *rationale: AD-16 already reads "Files ported from
    vpx-js live under `src/sim/physics/` with their original copyright headers ... new files carry the
    GPL-3.0 header"; the current test assumes everything under that tree is ported, which the loader makes
    false. This aligns a test with its ADR — it is not a relaxation, and the diff must say so.*
16. `test/table.test.ts` — update the empty-collections assertion (lines 117-122) so it still proves
    `flashers`, `shows` and `shots` are empty while asserting the exact new contents of `lightGroups`,
    `lamps`, `physMaterials` and `nodes`. — *rationale: task 3 changes what the file asserts; leaving it is
    a red suite.*
17. `test/scene-smoke.test.ts` — repoint the node assertions from `vis_placeholder_box` to the nodes the
    new glb actually carries, read from `TABLE.nodes`; keep the node-name grammar check; keep the
    `loadAndRenderOnce` / BRDF-seed block intact. Add the pitch and camera assertions (see the acceptance
    criteria). — *rationale: the story's fourth acceptance criterion, and Rule 3's real-runtime evidence.*
18. `tools/check-dist.mjs` + `test/check-dist.test.ts` — extend `checkRuntimeAssets()` to require
    `dist/assets/dragonwar.collision.json` beside the glb, with a message naming which pipeline artifact is
    missing; add the matching fixture cases. — *rationale: both artifacts are pipeline output that must
    reach the deploy; Vite copies `public/` verbatim, so the check is the only thing that would notice a
    regression.*
19. `package.json` — add `"export:assets": "node tools/export-assets.mjs"`. No other script changes; **no
    CI step invokes it.** — *rationale: local authoring step, explicitly not a CI step.*
20. Tests for the I/O matrix — `test/frames.test.ts` (both round trips, the measured axis mapping, and a
    negative control proving the permutation is not the identity); `test/blender-resolve.test.ts`
    (`BLENDER` honoured verbatim — use `process.execPath` as a stand-in executable; `BLENDER` set to a
    non-existent path fails with a message containing `BLENDER`; nothing resolvable fails the same way —
    **all three run without Blender installed**); `test/collision-loader.test.ts` (loads the committed
    document; asserts the compound body's composition; a deliberately mis-sized document throws with the
    node named; and the **DW-7 case** — a ball fired into a wall corner of the loaded body causes
    `HitPoint.collide()` to run); `test/asset-contract.test.ts` (**the CI-safe half of the pipeline**: reads
    the committed glb and collision JSON off disk and validates both against `TABLE` — node grammar,
    `TEXCOORD_1` on every mesh, a `lightgroup` from `TABLE.lightGroups` on every static mesh, every
    `surface`/`phys_material`/`switch` value known, the three top-level nodes, the reference dimensions —
    plus the `TABLE.physMaterials` ↔ `TUNING.materials` drift pin); `test/export-py.test.ts`
    (**Blender-gated, skipped when `resolveBlender()` throws**: a clean export succeeds; a temporarily
    mutated copy of the `.blend` with a bad node name, a duplicate name, two materials on a mesh and an
    unknown property value each exit non-zero with the offending node and property in the message; a
    re-export of the committed `.blend` reproduces the committed glb). — *rationale: the matrix rows above,
    Rule 1's integration ACs, and the dispatch's requirement that Blender discovery have its own test.*
21. Delete `tools/make-placeholder-glb.mjs`, `tools/make-placeholder-glb.d.mts` and
    `test/make-placeholder-glb.test.ts`. — *rationale: task 1's ownership decision — one owner for
    `public/assets/dragonwar.glb`, not two.*
22. `.github/workflows/ci.yml` — add a short comment above the `checks` job recording that this story
    deliberately adds no step: Blender does not exist on `ubuntu-latest`, the committed glb and collision
    JSON are what CI consumes, and the Blender-dependent suites skip on their own. No step, trigger or guard
    changes. — *rationale: the dispatch's second binding constraint; an unwritten rule is one a later story
    breaks.*

**Acceptance Criteria:**

- Given `ATTRIBUTIONS.md` has no row for the `.blend`, the glb's new owner or the collision file, when the
  three generated assets are created, then all three rows are written **first**, each naming Blender 5.2.1
  LTS, the script in this repository that produced it and the date, and the file also records that
  `tools/make-placeholder-glb.mjs` is retired and that Blender is a tool rather than a vendored dependency.
- Given `assets/src/dragonwar.blend`, when it is opened, then `playfield_root`, `cabinet_root` and
  `pivot_pitch` are its only top-level nodes, the geometry is unpitched, and it contains every node the
  story's first acceptance criterion names — including `l_insert_left` with lens **and** cup geometry, a
  playfield material with a translucency mask, a second UV layer on every static mesh and a `lightgroup`
  custom property on each.
- Given `BLENDER` is unset and no Blender is reachable, when `pnpm export:assets` runs, then it exits
  non-zero with a message naming `BLENDER`, the candidates tried and how to set it — and this is proven by
  a test that does not require Blender to be installed.
- Given `BLENDER` points at an existing executable, when `resolveBlender()` runs, then it returns that path
  verbatim without consulting PATH or the fallback list.
- Given a resolved Blender and the committed `.blend`, when `pnpm export:assets` runs, then
  `public/assets/dragonwar.glb` and `public/assets/dragonwar.collision.json` are written and the process
  exits 0; and given any single contract violation is introduced into a copy of the `.blend`, then the
  process exits **non-zero** with the offending node and property named — including when the violation
  surfaces as a Python exception rather than a validation failure.
- Given `src/sim/table/frames.ts`, when it is read, then it is the only file under `src/` that converts
  units or axes, it exports `glbToTable()`, `toPhysics()`, `fromPhysics()` and `toScene()`, and unit tests
  round-trip a point through glb → table → scene and table → physics → table within floating-point
  tolerance.
- Given the committed `dragonwar.collision.json`, when `src/sim/physics/loader` loads it, then it asserts
  `col_playfield`'s bounds and both flipper node lengths against `TABLE.reference` within 0.1 mm, builds one
  compound body from the ported primitive set including a `HitPoint` at every wall corner, and pairs every
  `sw_` zone with its `TABLE` switch; and given a document whose playfield is 500 mm wide, then it throws an
  error naming `col_playfield`, 500 and 514.4.
- Given the compound body built from the committed collision document, when a ball is fired into a wall
  corner, then `HitPoint.collide()` runs — the corner primitive of the ported set is exercised by this
  story's own geometry, with `tools/spike-1/scene.ts` unmodified (ledger `DW-7`).
- Given the committed `dragonwar.glb`, when `src/presentation/scene` loads it under a `NullEngine`, then
  every node named in `TABLE.nodes` resolves, a glb with a node removed throws before the first frame, the
  effective pitch rotates `playfield_root` about `pivot_pitch` while `cabinet_root`'s world matrix is
  unchanged, and the eight corners of the playfield's bounding box project inside the viewport of the
  authored fixed camera.
- Given the repository as committed, when `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers &&
  pnpm check:attributions && pnpm test && pnpm build && pnpm check:dist && pnpm check:size` runs, then every
  command exits 0, no device-name string literal appears outside `src/sim/table/dragonwar.ts` and `test/**`,
  and `dist/assets/` contains both pipeline artifacts.
- Given a machine with no Blender — `ubuntu-latest` in CI — when the default test suite runs, then the
  Blender-dependent suites report **skipped** rather than failed, every other suite runs against the
  committed artifacts, and `.github/workflows/ci.yml` gained no step that shells out to Blender.

### Review Findings

Code review, 2026-08-28 (`bmad-code-review`, full-opus tier; layers: blind-hunter, edge-case-hunter,
verification-gap, acceptance-auditor). 26 raw findings triaged to 20 after dedupe and dismissal:
2 high, 7 medium, 11 low, plus 6 dismissed.
9 patched and verified here, 4 left as rework action items, 7 routed to the ledger. Suite after
patches: **426 passed** with `BLENDER` set / **416 passed + 10 skipped** without; `typecheck`,
`lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size` all exit 0.
The three committed assets are byte-identical to `HEAD` — this review regenerated nothing.

**Blocking (must be fixed before this story is `done`):**

- [ ] [Review][Patch] **HIGH — `wall` reduction discards thickness, so interior walls are one-sided and the plunger lane leaks.** `tools/export.py`'s `wall_footprint_mm()` collapses each authored 12 mm-thick wall box to a single zero-thickness centreline, and `src/sim/physics/loader/index.ts`'s `orientedEdge()` then orients every segment's normal toward the **table centre**. `LineSeg` is one-sided (`line-seg.ts` returns `-1` when `lateral && bcpd < 0`), so this is correct only for perimeter walls. `col_wall_lane` is an *interior divider* at table x = 488.4 with the table centre to its left, so its normal faces the main field and the **lane side is unguarded** — measured: a ball at table (504, 300, 13.5) moving −x ends at x = 331.3, straight through; the mirror shot from the main field correctly bounces. `bd_shooter` ejects at table x = 498.0, inside that lane, so the ball Story 1.5 serves passes through the divider on its first deflection. Violates **AD-11** ("`col_` … the only thing the ball hits"; "walls and floor have real thickness") and the story's own authored intent. Second-order: because the reduction gives back 6 mm per side, the authored lane clearance (494.4 → 514.4 = **20 mm**) is *narrower than the 26.99 mm reference ball* and only traversable by virtue of this same error — the two defects currently mask each other. Not patched here: the correct fix changes `wall_footprint_mm()` and **requires regenerating the byte-verified `dragonwar.collision.json`**, which this review is forbidden to do. [`tools/export.py:198`, `src/sim/physics/loader/index.ts:302`]
- [ ] [Review][Patch] MED — `tools/export.py` writes `dragonwar.glb` *before* it builds the collision document, so a failure in between leaves `public/assets/` holding a new glb beside a stale, mismatched collision file. Measured with a real Blender 5.2.1 run against a mutated copy: every `validate_*()` passed, the glb was written, then the run exited 1 with no collision JSON. Task 9 requires validation "before it writes". Fix shape: build both documents in memory, then write, or write to `.tmp` and `os.replace()` both. [`tools/export.py:341-352`]
- [ ] [Review][Patch] MED — `validate_properties()` validates a property's *value* only when the key is present and never requires presence, so an `sw_` node authored without a `switch` escapes the enforcer entirely and surfaces from `build_switch_zones()`'s bare `obj['switch']` as an "unexpected exception" KeyError — measured verbatim, **with no node named**, contradicting the AC's "exits non-zero naming the offending node and property". Same gap for absent `surface`/`phys_material`, which serialise as JSON `null`. [`tools/export.py:124-141`, `:248`]
- [ ] [Review][Patch] LOW — `export_glb()` hardcodes the string `playfield_root` — the one node name in the enforcer not read from `dump['nodes']` — in the file that enforces the no-literals contract for everything else, and `.get()` returns `None` silently if it is ever renamed. `boundary-lint`'s rule (e) scans only `src/**`, so nothing catches it. [`tools/export.py:292`]

**Patched and verified in this review:**

- [x] [Review][Patch] **HIGH — the widened AD-16 header rule let any `src/sim/physics/**` file bypass the ported-structure check.** `if (content.includes(AUTHORED_HEADER)) return;` matched the whole file, so a *ported* file containing `DragonWar is licensed GPL-3.0` anywhere — including one whose upstream copyright block was stripped and replaced with it — skipped the upstream-block and port-marker assertions entirely. That is precisely the failure mode Story 1.2's review caught three times, and task 15 explicitly required the ported branch stay "exactly as strict as it is today" (its Block-If clause says HALT rather than weaken it). Fixed: the branches are now disjoint — any file carrying the port marker or the upstream project name takes the ported branch whatever else it contains, and the authored branch additionally requires the header in the file's first five lines. Added a regression test pinning the disjointness against a stripped-port fixture. [`test/sim-boundary.test.ts:44`]
- [x] [Review][Patch] MED — the Blender-gated reproducibility test byte-compared only the glb; `dragonwar.collision.json` was existence-checked only, so a regression in `wall_footprint_mm()`, the `dMm` plane constant, a switch-zone bound or the devices' mm scaling would leave the committed document stale with nothing going red **on any machine** — and that document is the input every physics test reads. Fixed: both artifacts are now byte-compared. Verified against a real fresh Blender export (both identical). [`test/export-py.test.ts:109`]
- [x] [Review][Patch] MED — the pitch AC had no discriminating test. `pivot_pitch` is authored at scene (0.2572, 0, 0), which lies **on** `applyPitch()`'s `Vector3.Right()` rotation axis, so its `P − R·P` correction is identically zero and the "maps back to the same world position" assertion held for *any* rotation about *any* axis through the origin. Mutation-verified: negated `pitchDeg`, `Vector3.Up()`/`Forward()`, and deleting the correction line all passed. Fixed with two assertions: the far edge must rise by `sin(6.5°)·h` while the drain edge stays on the deck (catches sign and axis), and a new off-axis-pivot unit test (catches the dropped correction). Both re-verified to go red under those exact mutations. [`test/scene-smoke.test.ts:196`]
- [x] [Review][Patch] MED — the camera AC checked only that the eight corners land inside the viewport, which a camera placed behind the **far** edge (table rendered end-for-end) or **below** the playfield (looking up through its underside) also satisfies — measured. `fixed-camera.ts`'s own header claims the drain sits nearest the viewer (UJ-4, AD-10). Fixed: the drain edge must project below the far edge in NDC; mutation-verified. [`test/scene-smoke.test.ts:231`]
- [x] [Review][Patch] LOW — `asVec3Mm()` and the footprint parser accepted non-finite numbers while `requireNumber()` rejected them. Reachable through the loader's **documented** "already-parsed document" contract, not around it: `JSON.parse('1e999')` yields `Infinity`, and `Infinity − Infinity` is `NaN`, which silently satisfies every `<= TOLERANCE_MM` comparison — so the mis-sized-document guard would pass while a compound body of NaN geometry loaded. Fixed with `Number.isFinite` on both, plus a test driving the `1e999` path. [`src/sim/physics/loader/index.ts:124`, `:181`]
- [x] [Review][Patch] LOW — `IN_TO_MM = 25.4` performed a unit conversion outside `frames.ts`, against AD-10's "no other file converts units or axes" — the same reasoning that relocated `toPhysicsPlane()` during the implement pass. Moved to `frames.ts` as `MM_PER_IN`. [`src/sim/table/frames.ts:51`, `src/sim/physics/loader/index.ts:46`]
- [x] [Review][Patch] LOW — `test/blender-resolve.test.ts`'s conventional-install case used a bare `return` on non-Windows, so on `ubuntu-latest` — the only automated environment — it executed no `expect` and reported as a **passing** test. Changed to `it.skipIf`, which reports the truth. [`test/blender-resolve.test.ts:99`]
- [x] [Review][Patch] LOW — `src/sim/contracts/events.ts`'s comment claimed `test/contracts.test.ts` "still pins the twelve members and their order", but that test never imported `CONTACT_SURFACES` — it asserted `toHaveLength(12)` on its own literal, so adding a thirteenth member or reordering broke nothing. Since Story 1.4 the array is serialised into the dump `export.py` validates every `surface` against, making it a runtime contract. Added a real runtime pin on membership and order. [`test/contracts.test.ts:65`]
- [x] [Review][Patch] LOW — `ATTRIBUTIONS.md`'s Assets-section prose still read "the one asset present is project-generated" after three generated assets were listed. Corrected. (The three provenance rows themselves were audited and are correct: each names Blender 5.2.1 LTS, the in-repo script and the date, each states the content is author-made with nothing from a commercial machine, Story 1.2's retired generator no longer competes for `dragonwar.glb`, and Blender correctly has no Code-table row.) [`ATTRIBUTIONS.md:56`]

**Deferred to the ledger** (`_bmad-output/implementation-artifacts/deferred-work.md`; filed with `by=cr`):

- [x] [Review][Defer] MED — the DW-7 closure is geometrically vacuous: every corner `HitPoint` sits at `zLowVu` (physics z = 0), while a ball resting on the playfield has its centre at z = radius ≈ 25 VU, so contact is a pure tangency condition. The closing test has to start the ball at z = 0 — a full radius *inside* the playfield slab — and its own comment concedes this; a 96-trajectory sweep of realistic rolling balls produced **zero** `HitPoint.collide()` calls. Separately, each placeholder wall is an independent 2-point footprint sharing no endpoint with any other, so there are no wall *corners* in the sense the AC and `tools/spike-1/scene.ts` describe — only capped free segment ends. Occurrence appended to **DW-7** (owned by this story; the lead adjudicates at the ledger gate). [`src/sim/physics/loader/index.ts:334`, `test/collision-loader.test.ts:156`]
- [x] [Review][Defer] MED — the loader ignores the collision document's own `version`/`units`/`frame` handshake that `export.py` writes, so a `units: "m"` or `version: 2` document loads without complaint at 1000× scale. Filed as **DW-45**, owner `1-5` (which owns the host-side fetch). [`src/sim/physics/loader/index.ts:97`]
- [x] [Review][Defer] LOW — `resolveBlender()`'s conventional-location step hardcodes the `C:` drive and the English `Program Files` folder in the file whose own header forbids machine-specific paths, while its sibling per-user branch correctly reads `env.LOCALAPPDATA`; and its macOS/Linux candidates are absolute paths unreachable through the `env` parameter, so those branches are covered on no platform. Filed as **DW-46**, owner `burndown`. [`tools/blender.mjs:84-104`]
- [x] [Review][Defer] LOW — `l_insert_left`'s lens spans z −1.0 → **+0.5** mm against a playfield surface at z = 0, so it sits 0.5 mm proud, against AD-11's "lens **and** cup geometry below the surface". No physics effect (`l_` is visual; only `col_` is hit). Needs the `.blend` regenerated, which this review may not do. Filed as **DW-47**, owner `burndown` for re-owning to Epic 2. [`tools/make-placeholder-blend.py:268`]
- [x] [Review][Defer] LOW — the flipper-length assertion takes `Math.max` over all three bbox extents, so a bat with the right extent on the **wrong axis** passes; the `col_playfield` assertion beside it is correctly per-axis. Filed as **DW-48**, owner `1-6`. [`src/sim/physics/loader/index.ts:248`]
- [x] [Review][Defer] LOW — the loader parses each node's `surface` and then discards it (`applyMaterial()` keys only on `physMaterial`), so no hit object carries a `ContactSurface` and AD-13's contact-sound selection has no carrier. The sibling `devices` field got an explicit deferral comment; `surface` is dropped silently. Filed as **DW-49**, owner `burndown`. [`src/sim/physics/loader/index.ts:71`]
- [x] [Review][Defer] LOW — nothing automated covers `ATTRIBUTIONS.md`'s generated-asset rows: `check-attributions.mjs` maps only `package.json` dependency keys and has no concept of asset files, and `test/attributions.test.ts` pins every earlier story's code rows but adds nothing for the three assets this story commits. Given CLAUDE.md treats provenance as a hard gate, a future asset can land with no row and every check stays green. Filed as **DW-50**, owner `6-7`. [`tools/check-attributions.mjs:54-60`]

**Dismissed** (6): the QA stage's tests being uncommitted (by design — the lead commits them at the rework/smoke gate, Rule 16); `frames.ts` exporting five conversions against AD-10's "exactly three" (by design — the spec's Design Notes read this as three *conversions*, `fromPhysics()` is the inverse the AC's own round-trip demands and `toPhysicsPlane()` is the plane form of the same physics conversion; the protected invariant "no other file converts units or axes" is intact and was strengthened above); prototype-pollution guards on switch/material lookups (`wontfix-theoretical` — the document is generated by `export.py` from a validated `.blend`, never user input; would become real if a hand-authored collision document were ever loaded); `addWall()` not closing a 3+-point footprint polyline (`wontfix-theoretical` — `wall_footprint_mm()` emits exactly two points; would become real the first time a multi-point footprint is authored, and the blocking finding above is the natural place to handle it); asserting the glb's `asset.generator` string (`wontfix-theoretical` — proves provenance, not correctness, and both artifacts are now byte-compared against a fresh export on any Blender machine); and `test/asset-contract.test.ts`'s "exactly the three top-level names" title over-promising its body (cosmetic).

## Spec Change Log

- **2026-08-28 -- lead, rework iteration 1 (cycle_iteration 2).** Code review returned the story
  `in-progress` with one blocking HIGH and three further unresolved items, all in `tools/export.py`'s
  wall reduction and validation ordering. Re-opened the spec (`status: in-progress`) so
  `bmad-build-auto` resumes at its implement step against the unchecked `### Review Findings` items.
  The reviewer's nine applied patches and QA's tests are committed in the rework commit that precedes
  this re-spawn, so they are part of the new baseline rather than being absorbed silently into the
  next finalize diff. **Regenerating `public/assets/dragonwar.collision.json` is expected and
  authorised in this iteration** -- the blocking fix changes `wall_footprint_mm()`, so the byte-verified
  artifact must change; the lead re-verifies export round-trip byte-identity afterwards.

## Review Triage Log

### 2026-08-28 — Review pass

- intent_gap: 0
- bad_spec: 0
- patch: 16: (high 3, medium 6, low 7)
- defer: 0
- reject: 8: (high 0, medium 1, low 7)
- addressed_findings:
  - `[medium]` `[patch]` loader `switchZones` cast `zone.switch as SwitchName` with no runtime check -- now throws naming the zone and the unknown switch value before the cast.
  - `[medium]` `[patch]` loader `applyMaterial()` silently defaulted to `materials.default` on an unrecognized `physMaterial` -- now throws naming the node and the bad value (an unauthored/`undefined` value still defaults, per AD-15/AD-16 convention already used elsewhere in the file).
  - `[high]` `[patch]` AD-10 "one converter" violation: `planeToPhysics()` lived in `src/sim/physics/loader/index.ts` instead of `src/sim/table/frames.ts` -- moved verbatim (math byte-identical) into `frames.ts` as `toPhysicsPlane()`; the loader now imports and calls it.
  - `[medium]` `[patch]` loader had no guard that `col_playfield`/`col_glass` are actually `plane`-shaped before non-null-asserting `normal!`/`dMm!` -- added `assertPlaneShaped()`, throwing a descriptive error naming the node and its actual shape on mismatch.
  - `[low]` `[patch]` loader `findNode()` silently returned the first match on a duplicate node name -- now throws naming the duplicate.
  - `[low]` `[patch]` `test/asset-contract.test.ts`'s `toBeDefined()` checks on `surface`/`physMaterial` didn't reject `null` -- replaced with `typeof x === 'string'` assertions.
  - `[high]` `[patch]` no test proved a wall's FACE (not just its corner) actually blocks a ball -- `orientedEdge()`'s own header names this exact regression as having happened once already. Added a `test/collision-loader.test.ts` case firing a ball at a wall-footprint midpoint and asserting `LineSeg.prototype.collide` fires; verified it fails when `orientedEdge()`'s ternary is inverted, then restored the code.
  - `[high]` `[patch]` same gap for a flipper box face (`outwardTriangle()`/`addBox()`) -- added a matching test against `col_flipper_l`; a bare "collide() was called" assertion proved insufficient (an inverted winding still fires `collide()`, just traps the ball oscillating -- 3164 calls vs. 1), so the test bounds the call count instead. Verified it fails under inversion, then restored the code.
  - `[medium]` `[patch]` `runExportAssets()` (the real `pnpm export:assets` entry point) was never called by any test -- `test/export-py.test.ts` hand-rolled an equivalent but separate `spawnSync` call. Added a Blender-gated test that imports and calls `runExportAssets()` directly.
  - `[medium]` `[patch]` `tools/export-assets.mjs`'s Blender `spawnSync` call had no timeout -- added `timeout: 90_000` (matching the test suite's own convention) plus explicit signal/timeout error handling.
  - `[low]` `[patch]` `src/presentation/camera/fixed-camera.ts`'s header comment named `col_playfield` (collision-only, never in the glb) instead of `vis_playfield` -- corrected.
  - `[low]` `[patch]` no test asserted `bd_trough`/`bd_shooter` are present in the exported glb by name -- added an assertion in `test/asset-contract.test.ts`, reading the expected names from `TABLE.ballDevices`.
  - `[low]` `[patch]` `CollisionDoc`'s `devices` field is parsed by `tools/export.py` but silently dropped by the loader with no note -- added a comment explaining it's intentionally unparsed pending Story 1.5.
  - `[medium]` `[patch]` `tools/export.py`'s `build_devices()` comment incorrectly claimed a missing `TABLE.ballDevices` object was already caught by `validate_node_presence()` (it isn't -- that function never reads `dump['ballDevices']`) -- added `validate_ball_devices_present()`, called from `run()`, and corrected the comment.
  - `[low]` `[patch]` `tools/check-dist.mjs`'s missing-`dragonwar.collision.json` message claimed a live boot-time dependency (`src/host/boot.ts` doesn't fetch it yet -- that's Story 1.5's wiring) -- reworded to describe it as a required pipeline artifact instead.
  - `[low]` `[patch]` `fixed-camera.ts`'s comment claimed automated verification at a 405x720 portrait resolution no test exercises -- reworded to attribute only what `scene-smoke.test.ts` actually checks (the default `NullEngine` size), noting the portrait framing was checked by hand.

Rejected (real observations, not defects requiring action): the loader's `planeToPhysics`/`toPhysicsPlane` height-coupling term is unreachable given the current schema but is the correct general formula, not dead-code cruft (low); a hand-constructed `NaN` bypassing `JSON.parse` is outside `loadCollision()`'s documented "already-parsed document" contract (low); `export.py`'s `parse_args()` missing-value error message is less specific than ideal but still non-zero-exit and traceable (low); `loadCollision()` has no live caller in `src/` yet and `PlayerPhysics.setGravity()` is never invoked -- both are the spec's own deliberate Story-1.5 deferral, stated in its Design Notes and Consumed-by list, not a gap (low x2); the I/O matrix's "duplicate node name" row describes a mechanism (`export.py`'s own uniqueness check) that Blender's object-naming API makes unreachable in practice -- already candidly documented in `test/fixtures/export-py/mutate-blend.py`'s header and this spec's own Design Notes, not a hidden gap (low); the loss of `test/make-placeholder-glb.test.ts`'s unconditional (non-Blender-gated) byte-identity check is an inherent, spec-mandated consequence of moving asset generation behind Blender (which CI cannot run) -- named in the dispatch's own binding constraints, not an oversight (medium); `export.py`'s `validate_properties()` only validates property VALUES when present, never requires `surface`/`phys_material`/`switch` to be present at all -- the I/O matrix's "unknown property value" row is explicitly about values, and the committed asset already carries every required property correctly (low).

## Design Notes

### Governing ADs (Rule 6)

The ADR registry for this project is the architecture spine's numbered invariants (AD-1..AD-19) at
`_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md` —
there is no `docs/adr/`. Each of the following was re-read against the spine text, not taken from a list:

- **AD-1** (69) — the dependency graph is law, and the graph at spine lines 37-61 explicitly permits
  `physics --> table` and `pres --> table`. That is what lets `src/sim/physics/loader` assert against
  `TABLE.reference` and `src/presentation/scene` read `TABLE.nodes` and `frames.ts`. **One table**, imported
  directly — no loader API is introduced by "the collision loader"; it is a function over a parsed
  document, not a table-loading mechanism.
- **AD-6** (118) — `bd_trough` is a parking device that ejects "at the device's authored eject pose and
  speed"; `bd_shooter` is non-parking with entry `s_shooter_lane`. This story authors the **pose** (Blender
  owns placement) and deliberately leaves the **speed** to Story 1.5, which is the first code that ejects
  anything (see "What this story does not author" below).
- **AD-10** (168) — the canonical table frame, the three sanctioned conversions, unpitched authoring, and
  the asserted reference block. Shapes tasks 4, 7, 11 and 13. The spine's glb-frame statement was verified
  empirically rather than assumed (Code Map, environment facts).
- **AD-11** (174) — Blender owns placement and geometry; `TABLE` owns devices, wiring, groups and tunables;
  `tools/export.py` is the contract's enforcer, validating names and properties against a JSON dump of
  `TABLE` and writing the glb plus the collision file; `sim/` never parses glb; the node-prefix vocabulary;
  "Epic 1 ships a placeholder `.blend` of primitives that already follows every prefix — the pipeline, not
  the art, is the deliverable". This is the story's spine.
- **AD-12** (180) — "UV2 asset contract now, bake later": every static mesh carries `TEXCOORD_1` and a
  `lightgroup` from the first model so the eventual per-group bake needs no mesh or `TABLE` change. That is
  why `TABLE.lightGroups` stops being empty here even though nothing lights anything until Epic 4.
- **AD-15** (198) — solver constants are ported verbatim and never tunable. Nothing under
  `src/sim/physics/` that carries the port marker is touched.
- **AD-16** (204) — boundaries linted in CI; **"Files ported from vpx-js live under `src/sim/physics/` with
  their original copyright headers preserved plus [the port marker], checked per file; new files carry the
  GPL-3.0 header."** Task 15 exists because `test/sim-boundary.test.ts` currently implements only the first
  half of that sentence. Also the source of the provenance ordering rule task 1 obeys.
- **AD-17** (210) — static `dist/` with relative paths, the host error panel for any boot-stage failure
  (which is why the scene throws on a missing node instead of rendering a partial table), and the size
  budget. The placeholder glb measured 9,116 bytes in the planning probe against a 2,750,000-byte gzipped
  budget with a 0.75 MB baseline: not a risk, but `pnpm check:size` still runs.

### Why the `.blend` has a generator script, and what owns it afterwards

AD-11 makes the `.blend` "the sole owner of every position, mesh and switch zone" — which is in tension with
a script that can recreate it. The resolution is a **handover, not a build step**:
`tools/make-placeholder-blend.py` seeded the committed file once; from the moment that file is committed the
`.blend` is the source of truth and Epic 2 edits it in Blender directly. The script stays as the reviewable
record of what the placeholder is (a binary blob is not a reviewable diff) and as a way to regenerate a
placeholder from nothing. Its header must say exactly that, and no npm script or CI step runs it. This
mirrors how Story 1.2 framed `tools/make-placeholder-glb.mjs`, with the difference that this one is honest
about being one-shot. The `.blend` is deliberately **not** asserted to be byte-reproducible: two saves of an
identical scene differ (measured), unlike the glb, which is byte-deterministic on one host.

### What goes into the glb, and what goes only into the collision file

`col_` and `sw_` nodes are **excluded from the glb** and live only in `dragonwar.collision.json`. AD-11 calls
`col_` "invisible collision scaffolding, the only thing the ball hits", `sw_` an analytic zone tested against
the ball's swept segment, and the glb "for presentation"; AD-12's `TEXCOORD_1`+`lightgroup` contract is about
*static meshes that get lit*, which invisible scaffolding is not; and AD-17's payload budget has no reason to
carry geometry nothing renders. Validation still runs over **every object in the `.blend`**, so a malformed
`col_` name fails the export even though that node never reaches the glb. The glb therefore carries the three
roots, the `vis_` placeholder, `l_insert_left`'s lens and cup, and the mechanism nodes named as their device;
`use_selection=True` was verified to preserve the hierarchy of exactly that subset.

### The collision document's shape

`sim/` never parses glb, so the collision file is the physics loader's whole world. It is millimetres, table
frame, and **already reduced to the ported primitive set by `export.py`** — the enforcer does the reduction so
the loader stays a dumb instantiator, which is what AD-11 means by "the export script is the contract's
enforcer". Each `col_` node declares which primitive it reduces to via a `col_shape` custom property from the
closed set `plane | wall | box`, so the reduction is authored and validated rather than guessed from geometry.
Sketch (values illustrative, four-decimal rounding keeps the file diff-stable against float32 noise):

```json
{ "version": 1, "units": "mm", "frame": "table",
  "reference": { "playfieldMm": { "w": 514.4, "h": 1066.8 } },
  "nodes": [
    { "name": "col_playfield", "shape": "plane", "normal": {"x":0,"y":0,"z":1}, "dMm": 0,
      "bboxMm": {"min":{"x":0,"y":0,"z":-19},"max":{"x":514.4,"y":1066.8,"z":0}},
      "surface": "wood", "physMaterial": "default" },
    { "name": "col_wall_left", "shape": "wall", "zLowMm": 0, "zHighMm": 50,
      "footprintMm": [{"x":0,"y":0},{"x":0,"y":1066.8}], "surface": "wood", "physMaterial": "default" }
  ],
  "switchZones": [ { "name": "sw_shooter_lane", "switch": "s_shooter_lane", "shape": "box",
                     "minMm": {"x":0,"y":0,"z":0}, "maxMm": {"x":0,"y":0,"z":0} } ],
  "devices": [ { "name": "bd_trough", "ejectPose": { "posMm": {"x":0,"y":0,"z":0},
                                                     "dir": {"x":0,"y":1,"z":0} } } ] }
```

A `wall` becomes one `LineSeg` per consecutive footprint pair plus a `HitPoint` at every corner — the exact
construction `tools/spike-1/scene.ts` documents and the reason DW-7 closes here.

### The `phys_material` name list lives in `TABLE`, not in `tuning.ts`

`tools/export-assets.mjs` must dump the contract from real source, not a hand-copied duplicate. `TABLE` and
`src/sim/contracts/events.ts` both import natively under Node 24 (verified); `src/sim/table/tuning.ts` does
**not**, because it uses the extensionless specifier `'./dragonwar'` that Node's ESM resolver rejects.
Rather than rewrite Story 1.3's import specifiers across `src/sim/**` — a broad change with build-tool risk
for a tooling convenience — `TABLE` gains a `physMaterials` name list (AD-11 does say `TABLE` owns tunables,
and the dump is "a JSON dump of `TABLE`"), and `test/asset-contract.test.ts` pins
`Object.keys(TABLE.physMaterials)` against `Object.keys(TUNING.materials)` so the two can never drift apart
silently. Under Vitest both files import normally, so the pin costs nothing.

### `fromPhysics()` and the "exactly three conversions" wording

AD-10 and the story's third acceptance criterion say `frames.ts` exports "exactly `glbToTable()`,
`toPhysics()` and `toScene()`". The same acceptance criterion then requires a **`table → physics → table`
round-trip test**, which cannot exist without an inverse, and `Snapshot.balls[].pos` is documented as
table-frame millimetres while physics keeps VP units internally — so Story 1.5 must convert physics → table
somewhere, and AD-10 forbids anywhere else. Read as *three conversions* rather than *three functions*:
`glbToTable()` is load-only (nothing writes back into a glb), `toScene()` is one-way (nothing reads a
position back out of the renderer), and the physics conversion is the one the simulation's own output must
traverse in both directions, so it ships as `toPhysics()`/`fromPhysics()`. The invariant AD-10 actually
protects — "no other file converts units or axes" — is unweakened.

### Integration ACs, Consumed-by and Consumes (Rules 1 and 2)

This story introduces the asset pipeline and `src/sim/table/frames.ts`, the sole sanctioned converter, so
Rule 1 applies in full. It has **real in-story consumers, none mocked**:

- `src/presentation/scene/create-engine.ts` consumes the committed glb, `TABLE.nodes`, `frames.ts` and the
  authored camera, and produces the observable effect that a `NullEngine` render places the playfield's
  bounding box inside the viewport with `playfield_root` pitched and `cabinet_root` level
  (`test/scene-smoke.test.ts`, the real `loadAndRenderOnce` path — Rule 3's real-runtime evidence).
- `src/sim/physics/loader` consumes the committed collision document and `TABLE.reference`, and produces
  the observable effect that a ball fired into a corner triggers `HitPoint.collide()`
  (`test/collision-loader.test.ts`) and that a mis-sized document throws
  (the same file).
- `tools/export-assets.mjs` consumes `TABLE` and `CONTACT_SURFACES` by real import and `tools/export.py`
  consumes the resulting dump, with `test/export-py.test.ts` observing real process exit codes and messages.
- `tools/check-dist.mjs` consumes both pipeline artifacts after a real `pnpm build`.
- `src/host/boot.ts` consumes the glb over the shipped same-origin path, unchanged.

`Consumes:`
- **Story 1.1** — `src/sim/physics/**` (the ported primitive set the loader instantiates: `HitPlane`,
  `LineSeg`, `HitPoint`, `HitTriangle`, `PlayerPhysics`), `tools/spike-1/scene.ts` **read-only** as the
  worked example of that construction, `test/util/list-files.ts`.
- **Story 1.2** — `public/assets/dragonwar.glb` (path and node-name contract, content replaced),
  `src/presentation/scene/create-engine.ts`, `src/host/boot.ts`, `tools/check-dist.mjs`,
  `tools/size-budget.mjs`, `test/scene-smoke.test.ts`, `.github/workflows/ci.yml`, `ATTRIBUTIONS.md`'s
  Generated-content table.
- **Story 1.3** — `TABLE`, `src/sim/table/names.ts`, `src/sim/contracts/**`, `tsconfig.sim.json`'s
  DOM-free project, `pnpm lint:boundaries`, `pnpm check:headers`, `pnpm check:attributions`,
  `test/sim-boundary.test.ts`, `test/table.test.ts`. **First consumer of `TABLE` outside Story 1.3.**

`Consumed-by:`
- **Story 1.5** — the first big consumer. It serves a ball from `bd_trough` at **this story's authored eject
  pose**, steps it on the fixed-step loop over **this story's compound collision body**, drains it into the
  trough via **this story's `sw_trough_1..4` zones**, and renders it at `toScene(pos)` from the snapshot
  while the effective pitch drives `playfield_root` through **this story's `applyPitch`**. It also adds the
  eject-speed tunable this story deliberately does not author, and owns the host-side fetch of
  `dragonwar.collision.json` that hands the loader its parsed document.
- **Story 1.6** — the `FlipperMover` replaces `col_flipper_l`/`col_flipper_r`'s placeholder collision behind
  the same node names and the same asserted 3.125 in length.
- **Story 1.7** — nudge moves the cabinet under the ball in the table frame `frames.ts` defines.
- **Story 1.8** — golden replays hash ball positions quantised in table millimetres, and the replay header
  carries an **asset hash** of the artifacts this story commits.
- **Story 1.9** — the dev panel edits tunables against a table whose dimensions this story asserts.
- **Epic 2 (Story 2.1)** — replaces the placeholder geometry inside the same `.blend`, behind the same node
  prefixes, the same `TABLE` registry and the same `export.py` validation, and adds the full switch set.
- **Epic 4 (Stories 4.7, 4.8)** — consumes `TEXCOORD_1` and the `lightgroup` property this story establishes
  on every static mesh; **Epic 5** replaces `vis_`/`l_` placeholders with art behind the same contract.

### Ledger entries this story owns

- **`DW-7`** (open, low severity, med fix-risk, in-epic; owner is this story's key) — *"Corner HitPoint
  primitive may be unexercised by either correctness leg."* **Closed by task 11 + task 20**: the placeholder's
  wall footprints reduce to `LineSeg` edges plus a `HitPoint` at every corner, and
  `test/collision-loader.test.ts` fires a ball into one and asserts `HitPoint.collide()` runs. This honours
  the entry's standing note exactly — the coverage comes from the new placeholder geometry and
  `tools/spike-1/scene.ts` is not touched, so Spike 1's baseline stays valid. Recommended disposition at this
  story's ledger gate: `resolved-by:<this story key>` with that test as evidence. **This spec does not write
  to the ledger; the lead owns every ledger write.**

### What this story does not author, and why

- **The trough eject speed.** AD-6 says a parking device ejects "at the device's authored eject pose **and
  speed**". The pose is geometry and belongs in the `.blend` (AD-11); the speed is a tunable and belongs in
  `tuning.ts` with `source`/`confidence` (AD-15). No planning artifact states a figure and nothing in this
  story ejects anything, so authoring an unverified number here would be inventing a value with no consumer
  to validate it. Story 1.5 — which actually performs the eject and can observe whether the ball reaches the
  shooter lane — adds it. Named here so it is a handover, not an omission.
- **Switch-edge emission from `sw_` zones.** This story *registers* each zone against its `TABLE` switch, as
  its acceptance criterion says. The per-tick swept-segment test that turns a zone into a `SwitchEvent` is
  the loop's work (AD-2, Story 1.5).
- **The glass height and every placeholder position.** These are placement, which AD-11 gives to Blender and
  which the epic explicitly says is placeholder ("the pipeline, not the art, is the deliverable"). They are
  authored, not invented tunables, and Epic 2 re-authors them.

### Paths outside the stated footprint

Named here rather than planned silently, per the dispatch. The declared footprint is `src/**`, `test/**`,
`tools/**`, `assets/src/**`, `.github/workflows/**`, `package.json`, `pnpm-lock.yaml`, `tsconfig*.json`,
`public/**`, `ATTRIBUTIONS.md` and `_bmad-output/implementation-artifacts/**`. Every file this story creates,
edits or deletes is inside it — `assets/src/dragonwar.blend`, `public/assets/*` and the `ATTRIBUTIONS.md`
rows are all explicitly in scope.

Two adjacent files were considered and are **deliberately not edited**:

- **`docs/spikes/spike-3.md`** — describes `public/assets/dragonwar.glb` as `make-placeholder-glb.mjs`'s
  output. `docs/**` is out of footprint and Story 1.3's spec forbade editing either spike record; both are
  *dated records* of what was true on their date, so a retired generator does not make them wrong. No test
  reads those lines. Filed in this spec's frontmatter `deferred` list for the lead to adjudicate at the
  ledger gate.
- **`.gitattributes`** — a `*.blend binary` / `*.glb binary` attribute was considered and rejected as
  unnecessary: `public/assets/dragonwar.glb` already round-trips byte-for-byte through this repository today
  (Story 1.2's reproducibility test proves it), so Git's own binary detection is sufficient, and the file is
  out of footprint. If a future checkout is found to corrupt either binary, that is a lead decision, not a
  silent edit here.

No change is planned to `AGENTS.md`, `CLAUDE.md`, `NOTICE`, `LICENSE`, `docs/**`, `index.html`,
`vite.config.ts`, `vitest.config.ts` or anything under `_bmad-output/planning-artifacts/`.

## Verification

**Commands:**
- `git rev-parse --show-toplevel` — expected: exactly `C:/git/dragonwar/.worktrees/epic-1`. Stop if not.
- `node -e "import('./src/sim/table/dragonwar.ts').then(m=>console.log(Object.keys(m.TABLE)))"` — expected:
  the extended key list including `nodes`, `lightGroups`, `physMaterials`. Proves the dump's import path
  still works after task 3.
- `BLENDER=<this host's blender.exe> pnpm export:assets` — expected: exit 0, both artifacts written.
  Then `git status --short` should show only `public/assets/dragonwar.glb` and
  `public/assets/dragonwar.collision.json` as modified/added by that run.
- `pnpm export:assets` with `BLENDER` unset **and** no Blender on PATH — expected: non-zero exit, message
  containing `BLENDER`.
- `pnpm typecheck` — expected: all three projects exit 0. `src/sim/**` still has no DOM or Node reference.
- `pnpm lint:boundaries` — expected: exit 0, coverage line equal to the number of `.ts` files under `src/`
  (it grows by three this story). A device name that slipped into the loader or the scene fails here.
- `pnpm check:headers` — expected: exit 0, **including both new `.py` files** (`.py` is an authored
  extension).
- `pnpm check:attributions` — expected: exit 0 (no new package is added by this story).
- `pnpm test` — expected: all suites green; the Blender-gated suite **runs** locally with `BLENDER` set and
  **skips** with it unset. Run it both ways before finishing.
- `pnpm build && pnpm check:dist && pnpm check:size` — expected: exit 0; `dist/assets/` contains both
  `dragonwar.glb` and `dragonwar.collision.json`.
- `git status --short` — expected: only the files listed in the Code Map; no `dist/`, no `node_modules/`,
  no edits under `docs/`, no stray probe scripts or temporary `.blend`/`.glb` copies.

**Manual checks (if no CLI):**
- Open `public/assets/dragonwar.collision.json` and confirm every coordinate is a plausible millimetre
  figure in the table frame (playfield spanning roughly x 0..514.4, y 0..1066.8) — not metres, not VP units,
  not negative-y.
- Read `tools/export.py` and confirm **every** early return on a validation failure ends in an explicit
  `sys.exit(n)`. A `raise` alone exits 0 (measured); this is the single most likely way to ship an export
  that silently validates nothing.
- Read `.github/workflows/ci.yml` and confirm no step invokes Blender, the `deploy` job's `if:` still reads
  `github.event_name != 'pull_request' && github.ref == 'refs/heads/main'`, and both explanatory comment
  blocks are intact.
- Read `ATTRIBUTIONS.md` and confirm the three generated-asset rows were written before the assets, name the
  tool and the date, and that no row was added for Blender itself.

**Test files extended (QA, this stage):** `pnpm test` — 412 passed / 10 skipped with `BLENDER` unset (was
398/10); 422 passed / 0 skipped with `BLENDER` set (was 408). Every command above re-verified green after
these additions.
- `test/frames.test.ts` (QA) — a direct unit-test suite for `toPhysicsPlane()` (relocated into `frames.ts`
  during review; previously exercised only indirectly, and only with the committed doc's two horizontal
  planes, which never exercise its y-flip), plus a property-style round-trip pass (200 pseudo-random points,
  fixed seed) over `glbToTable()->toScene()` and `toPhysics()->fromPhysics()` beside the existing hand-picked
  cases.
- `test/collision-loader.test.ts` (QA) — six new cases driving `src/sim/physics/loader`'s previously-untested
  defensive branches with engineered-bad documents: `assertPlaneShaped()` on a non-plane `col_playfield`/
  `col_glass`, a third node illegally claiming `shape: "plane"`, `findNode()`'s duplicate-name rejection,
  `applyMaterial()`'s unknown-`phys_material` rejection, and the switch-zone loader's unknown-switch
  rejection — five review-triaged guards with no prior test reaching them.
- `test/export-py-version-gate.test.ts` (QA) — one new case proving `tools/export.py`'s outer
  `except Exception` handler (the second line of defence behind `--python-exit-code` against "an uncaught
  exception exits 0 under `blender --python`") actually fires for a genuinely unanticipated exception, not
  only for `fail()`/`ExportError` paths every existing mutation-driven test already covered. Verified
  discriminating by patching a throwaway copy outside the repo to drop that handler and confirming the
  test's message assertion (not just its exit-code assertion) goes red.

## Auto Run Result

**Summary of implemented change:** Stood up the placeholder-table asset pipeline end to end, at placeholder fidelity, exactly as scoped: a Blender-authored `assets/src/dragonwar.blend` of primitives following every AD-11 node prefix; `tools/export.py` as the contract's enforcer (validates node names/uniqueness/materials/UVs/properties/required-nodes/ball-devices against a JSON dump of `TABLE` before writing anything, with every failure path an explicit `sys.exit(n)` behind `--python-exit-code`); `tools/blender.mjs`/`tools/export-assets.mjs` as the `BLENDER`-env-driven, PATH-then-conventional-location discovery and driver (`pnpm export:assets`, never run in CI); `src/sim/table/frames.ts` as the one sanctioned unit/axis converter (`glbToTable`, `toScene`, `toPhysics`, `fromPhysics`, plus `toPhysicsPlane` added during review); `src/sim/physics/loader` building one compound collision body from the ported primitive set, asserting `col_playfield` and both flipper lengths against `TABLE.reference`; and `src/presentation/scene`/`camera` loading the glb, resolving `TABLE.nodes`, applying pitch about `pivot_pitch` only, and rendering from a new authored fixed camera. `tools/make-placeholder-glb.mjs` (Story 1.2's stand-in) is retired; `tools/export.py` is now the sole owner of `public/assets/dragonwar.glb`.

**Files changed (36):**
- `.github/workflows/ci.yml` — comment documenting the deliberate no-Blender-step decision; no functional change.
- `ATTRIBUTIONS.md` — three generated-asset rows (`.blend`, `.glb`, `.collision.json`) written before the files, plus the Blender-is-a-tool note; replaces Story 1.2's single row.
- `_bmad-output/implementation-artifacts/spec-1-4-*.md` — this spec: status/baseline bookkeeping, Review Triage Log, this section.
- `assets/src/dragonwar.blend` (new, binary) — the committed placeholder geometry; source of truth from commit onward (AD-11).
- `package.json` — adds the `export:assets` script; no CI step invokes it.
- `public/assets/dragonwar.collision.json` (new) — generated physics collision data, millimetres, table frame.
- `public/assets/dragonwar.glb` (regenerated, binary) — presentation geometry, same path/contract as Story 1.2's placeholder.
- `src/presentation/camera/.gitkeep` (deleted) — replaced by the real camera file below.
- `src/presentation/camera/fixed-camera.ts` (new) — the one authored fixed camera, no controls, derived through `toScene()`.
- `src/presentation/scene/create-engine.ts` — wires the fixed camera, resolves `TABLE.nodes`, applies pitch after `ImportMeshAsync`.
- `src/presentation/scene/playfield.ts` (new) — `resolvePlayfieldNodes()` (throws on first missing node) and `applyPitch()`.
- `src/sim/contracts/events.ts` — `CONTACT_SURFACES` runtime array now backs the `ContactSurface` type for the export dump.
- `src/sim/physics/loader/index.ts` (new) — the pure collision loader; reference-dimension asserts; compound body construction; switch-name/phys-material/shape validation added in review.
- `src/sim/table/dragonwar.ts` — `TABLE` extended with `nodes`, populated `lightGroups`, `physMaterials`, and `l_insert_left`.
- `src/sim/table/frames.ts` (new) — the one converter; gained `toPhysicsPlane()` during review (moved from the loader, AD-10 compliance).
- `test/asset-contract.test.ts` (new) — validates committed glb/collision.json against `TABLE`; gained null-rejection and ball-device-presence assertions in review.
- `test/blender-resolve.test.ts` (new) — `resolveBlender()` I/O-matrix coverage; gained PATH/conventional-location tests during the Matrix Test Audit.
- `test/check-dist.test.ts` — collision.json-in-dist fixture cases; message assertion reworded in review.
- `test/collision-loader.test.ts` (new) — loader tests including the DW-7 corner case, plus the wall-face and flipper-face orientation regression guards added in review.
- `test/export-py-version-gate.test.ts` (new, added during the Matrix Test Audit) — stubbed-`bpy` coverage of `tools/export.py`'s Blender-too-old gate, reachable without Blender installed.
- `test/export-py.test.ts` (new) — Blender-gated `export.py` behavior tests; gained missing-node/missing-UV mutations (Matrix Test Audit) and a direct `runExportAssets()` call (review).
- `test/fixtures/export-py/mutate-blend.py` (new) — mutation fixture script; gained `missing-node`/`missing-uv` mutations during the Matrix Test Audit.
- `test/frames.test.ts` (new) — round-trip and measured-axis-mapping tests.
- `test/make-placeholder-glb.test.ts` (deleted) — retired with its generator.
- `test/scene-smoke.test.ts` — repointed node assertions to `TABLE.nodes`; added pitch/camera-viewport assertions.
- `test/sim-boundary.test.ts` — widened the physics-header rule to accept the ported structure OR the GPL-3.0 header, per AD-16's own wording.
- `test/table.test.ts` — updated empty-collections assertions for the fields task 3 populates.
- `tools/blender.d.mts` (new), `tools/blender.mjs` (new) — `resolveBlender()`: env, then PATH, then per-platform conventional locations.
- `tools/check-dist.mjs` — requires `dragonwar.collision.json` in `dist/assets`; message reworded in review to not overstate current runtime wiring.
- `tools/export-assets.d.mts` (new), `tools/export-assets.mjs` (new) — `pnpm export:assets`'s driver; gained a `spawnSync` timeout in review.
- `tools/export.py` (new) — the contract's enforcer; gained a ball-device-presence check in review.
- `tools/make-placeholder-blend.py` (new) — one-time seeding script for the `.blend`.
- `tools/make-placeholder-glb.d.mts` (deleted), `tools/make-placeholder-glb.mjs` (deleted) — retired.

**Review findings breakdown:** 24 distinct findings from four parallel review layers (blind-hunter, edge-case-hunter, verification-gap, intent-alignment auditor) plus the implementation-step's own Matrix Test Audit (which separately found and closed 4 uncovered I/O-matrix rows before review started: Blender PATH/conventional resolution, the Blender-too-old gate, missing-required-node, and missing-lightmap-UV, each closed with a new passing test). Of the 24 review findings: **16 patched** (high 3, medium 6, low 7 — see Review Triage Log for the itemized list, including the two DW-7-style regression tests for wall/flipper collision orientation and the AD-10 "one converter" relocation), **0 deferred**, **0 rejected as intent_gap or bad_spec**, **8 rejected** as either by-design (the spec's own deliberate Story 1.5 deferral of live physics wiring and gravity), already candidly documented in-repo (the unreachable "duplicate node name" mechanism, an unreachable dead-code branch), or out of the matrix's literal scope (property-presence vs. property-value validation).

**Follow-up review recommendation:** `true` — this pass patched 3 high-severity findings, which alone triggers the recommendation regardless of the numeric score (patched-severity score for the record: 3 high, 6 medium, 7 low → `3×6 + 1×7 = 25`, also over the 5-point threshold).

**Verification performed:**
- `git rev-parse --show-toplevel` — confirmed `C:/git/dragonwar/.worktrees/epic-1` throughout.
- `node -e "import('./src/sim/table/dragonwar.ts')..."` — `TABLE`'s key list includes `nodes`, `lightGroups`, `physMaterials`.
- `BLENDER=<host Blender> pnpm export:assets` — exit 0, both artifacts written; re-run produced no further diff (byte-deterministic).
- `pnpm export:assets` with `BLENDER` unset and no Blender on PATH — exit 1 (non-zero), message names `BLENDER` and lists every candidate tried.
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions` — all exit 0 (lint:boundaries coverage: 55 `.ts` files under `src/`).
- `pnpm test` — run both ways per the spec's own instruction: with `BLENDER` set, **408/408 tests pass across 28 files** (every Blender-gated test runs, none skip); with `BLENDER` unset, **398 pass / 10 skip across 27 passed + 1 skipped file** (the Blender-gated suite skips cleanly, everything else green).
- `pnpm build && pnpm check:dist && pnpm check:size` — all exit 0; `dist/assets/` contains both `dragonwar.glb` and `dragonwar.collision.json`; measured size 0.729 MB against the 2.750 MB gzipped budget.
- `git status --short` — 36 files, matching the Code Map's create/edit/delete lists plus two reasonable additions (`src/presentation/camera/.gitkeep` deletion, `test/fixtures/export-py/mutate-blend.py`) and the Matrix-Test-Audit/review additions itemized above.
- Manual checks: `dragonwar.collision.json`'s coordinates confirmed plausible table-frame millimetres (not metres, not VP units, not negative-y); `tools/export.py` read in full, confirmed every failure path funnels through `sys.exit(1)` (via `ExportError`, plus a catch-all for any other exception); `.github/workflows/ci.yml` confirmed to add no Blender-invoking step, with the `deploy` job's `if:` guard and both explanatory comment blocks unchanged; `ATTRIBUTIONS.md` confirmed to carry all three generated-asset rows written before the files.
- Matrix Test Audit: all 18 I/O & Edge-Case Matrix rows verified covered by at least one passing test (4 gaps found and closed before review: PATH/conventional Blender resolution, Blender-too-old, missing-required-node, missing-lightmap-UV).
- The two new orientation-regression tests (wall face, flipper box face) were each verified to actually fail when their guarded function's orientation ternary was deliberately inverted, then the code was restored — confirming they are real regression guards, not tautologies.

**Residual risks:** `src/sim/physics/loader`'s `loadCollision()` has no live caller yet (`src/host/boot.ts` does not fetch `dragonwar.collision.json`), and `PlayerPhysics.setGravity()` is never invoked — both are Story 1.5's explicitly-stated scope per this spec's own Design Notes/Consumed-by list, not an oversight, but worth the lead's awareness heading into that story. `test/make-placeholder-glb.test.ts`'s retirement removes the only previously-unconditional (non-Blender-gated) CI check that the committed glb matches its generator's current output; this is an inherent, spec-mandated consequence of moving generation behind Blender (which CI cannot run) rather than a regression this story introduced carelessly — a human author is now trusted to run `pnpm export:assets` and verify locally before committing, exactly as the spec's own binding constraints describe. The frontmatter `deferred` entry about `docs/spikes/spike-3.md` (pre-existing, preserved from planning) still awaits the lead's ledger-gate adjudication.

Status: done
Blocking condition: none
