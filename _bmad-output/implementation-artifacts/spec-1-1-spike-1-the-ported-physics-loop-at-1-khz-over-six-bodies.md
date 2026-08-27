---
title: 'Story 1.1: Spike 1 - the ported physics loop at 1 kHz over six bodies'
type: 'feature'
created: '2026-08-27'
status: 'done'
baseline_revision: 'bc8a47b0aa8973ea301dd7c324b9af313997f2cb'
baseline_commit: 'bc8a47b0aa8973ea301dd7c324b9af313997f2cb'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      AGENTS.md's scaffold-stage TODOs (real pnpm commands, CI workflow path)
      are now answerable from this story's package.json/tsconfig.json/
      vitest.config.ts, but were not updated.
    evidence: |-
      AGENTS.md still reads "TODO — no package.json yet... Verify the real
      scripts here on the first refresh after scaffolding" and "TODO — CI is
      .github/workflows/ci.yml, not yet written." This story adds the actual
      package.json/tsconfig.json/vitest.config.ts (the "first refresh after
      scaffolding" the TODO names), but this run is barred from touching
      AGENTS.md per its footprint instructions.
    location: >-
      AGENTS.md
    severity: low
  - summary: >-
      util/object-pool.ts's pool-exhaustion counters are tracked but never
      surfaced anywhere.
    evidence: |-
      release() sets this.warned = true and increments this.skipped when the
      pool is full, but nothing ever reads either field — no assertion, no
      dev-mode surfacing. A real exhaustion regression in a later story would
      be invisible until it manifested as a physics anomaly. Not exercised by
      this story's fixed six-ball scene.
    location: >-
      src/sim/physics/util/object-pool.ts
    severity: low
  - summary: >-
      The six ball start poses in tools/spike-1/scene.ts may never bring a
      ball into contact with a corner HitPoint, leaving that ported collision
      primitive header-tested but not exercised by either correctness leg.
    evidence: |-
      Ball positions are mid-field (110-410mm on a 514mm-wide table) with
      moderate velocities; whether a corner HitPoint is ever hit in the
      10,000-tick Node run or the 600-frame browser run was not confirmed.
      Fixing this would need a scene redesign plus revalidation of the
      recorded measurements, which this story's scope doesn't call for.
    location: >-
      tools/spike-1/scene.ts
    severity: low
  - summary: >-
      The "terminates every step" test asserts a wall-clock ceiling on the
      ordinary scene rather than constructing a genuinely non-convergent input
      that exercises the STATICTIME forced-advance mechanism itself.
    evidence: |-
      test/spike-1.test.ts's termination test never constructs a case where
      the time-of-impact loop would otherwise not converge (the I/O matrix's
      "Step termination" row's stated input) — it runs the same six-ball
      scene as the other tests and asserts elapsed time per tick is under
      250ms, which is a sanity net around STATICTIME's guarantee, not a
      targeted test of it. Constructing a genuinely adversarial input for a
      time-of-impact solver safely (without introducing a flaky or
      meaningless test) needs deeper solver expertise than this pass budgeted
      for.
    location: >-
      test/spike-1.test.ts
    severity: medium
  - summary: >-
      The background-throttle guard is unit-tested at the runFrames() level
      but not end-to-end through measure.mjs's actual process exit code via a
      real CDP-driven throttled frame.
    evidence: |-
      test/spike-1-browser-guard.test.ts drives runFrames() directly with a
      fake requestAnimationFrame; it doesn't confirm the page-exception ->
      CDP exceptionDetails -> exitCode=1 chain in measure.mjs itself, which
      exists in the code but is only checked by inspection. An end-to-end
      test would need either a mocked CDP layer (against this project's
      real-runtime testing preference) or manipulating a real browser
      window's visibility state from automation.
    location: >-
      tools/spike-1/measure.mjs
    severity: low
  - summary: >-
      measure.mjs hardcodes its CDP debugging port with no free-port check or
      guard against two concurrent invocations targeting the same port.
    evidence: |-
      CDP_PORT = 9333 is a fixed constant; two simultaneous measure.mjs runs
      (or a leftover process still holding the port) would have the second
      run's CDP calls silently target the wrong browser instance. No present
      risk: this story's documented usage runs the Chrome and Edge legs
      sequentially, never in parallel.
    location: >-
      tools/spike-1/measure.mjs
    severity: low
---

<intent-contract>

## Intent

**Problem:** DragonWar's whole browser-first premise rests on an unmeasured claim: that a
time-of-impact pinball solver stepping six balls at 1000 Hz fits inside a 60 Hz frame budget
in a browser. No published benchmark covers the 1-6 body regime, so `TICK_HZ`, every solver
constant and every golden replay downstream are being chosen on argument rather than
measurement. Nothing else in Epic 1 may land until this is settled.

**Approach:** Stand up the greenfield single-package repository far enough to run a port,
port the minimum `vpdb/vpx-js` physics surface at commit `e8a6d6f` under `src/sim/physics/`
with its licence provenance recorded first, build one shared six-ball harness, and measure it
two ways - 10,000 ticks in Node (correctness plus per-tick cost) and 17 steps per animation
frame over 600 frames in Windows Chrome and Windows Edge (per-frame p95). Record the numbers
in `docs/spikes/spike-1.md` and set `TICK_HZ` from them, provisionally, pending the author's
macOS leg.

## Boundaries & Constraints

**Always:**
- The `ATTRIBUTIONS.md` entry for `vpdb/vpx-js` lands BEFORE any ported file is written to
  disk. It records: `vpdb/vpx-js`, commit `e8a6d6f` (v1.3.4, 2020-11-12), authors freezy
  <freezy@vpdb.io> (Copyright (C) 2019) with contributors Jason Millard <jsm174@gmail.com>
  and Michael Vogt <michael@neeo.com>, licence `GPL-2.0-or-later` **as verified in the source
  file headers, NOT `package.json`**, and verification date `2026-08-27`. The entry must state
  explicitly that `package.json` declares only `GPL-2.0` while the file headers grant "version
  2 of the License, or (at your option) any later version", and that DragonWar exercises the
  or-later clause to distribute under GPL-3.0.
- Every ported file keeps its ORIGINAL upstream copyright header byte-for-byte, immediately
  followed by the single line
  `// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0`.
  Upstream notices are never stripped, reworded or replaced.
- Every newly authored source file carries the GPL-3.0 header (AD-16).
- Solver constants are transcribed verbatim from the pinned upstream source (AD-15). The
  values named in the story ACs are a restatement; the upstream file is the authority.
- `src/sim/**` references none of: `window`, `document`, `performance`, `Math.random`, `Date`,
  `setTimeout`, `setInterval`, `requestAnimationFrame`, `localStorage`, `navigator`,
  `globalThis`, `@babylonjs/*` (AD-1, AD-3, AD-16). All timing code lives outside `src/sim/`.
- `tsc --noEmit` passes over the whole repository, and the default `vitest run` suite is green.

**Block If:**
- The `vpdb/vpx-js` source at `e8a6d6f` cannot be retrieved, or its file headers cannot be
  read to establish the licence. A licence that cannot be established at source means the file
  is NOT added - HALT with status `blocked`, blocking condition `provenance unverifiable`.
- A ported file's upstream licence header, once read, is anything other than
  GPL-2.0-or-later - HALT, blocking condition `provenance unverifiable`.
- Neither Chrome nor Edge can be driven on this Windows host to produce a measurement, after
  both the CDP runner and the chrome-devtools-mcp fallback have been tried - HALT, blocking
  condition `windows browser legs unmeasurable`. Do NOT fabricate, estimate or extrapolate a
  browser number, and do NOT quietly downgrade the Windows legs to author-owned.

**Never:**
- Never file a new `deferred-work.md` entry for the macOS/Safari legs or for the `TICK_HZ`
  ratification. Both are already adjudicated under "Author-owned: macOS / Safari measurement
  legs" and "Author-owned: TICK_HZ ratification from Spike 1" - reference them by name.
- Never weaken, skip or mark-pending the Windows Chrome and Windows Edge legs. They are hard,
  measured, blocking acceptance criteria.
- Never port `lib/vpt/flipper/` (Story 1.6), the plunger, kicker, trigger, bumper, spinner or
  gate trees, any mesh/render/asset code, or anything pulling `three` or a renderer into `src/`.
- Never build Story 1.3's work here (the full directory seed, the seam contracts beyond
  `time.ts`, `TABLE`, `names.ts`, `tuning.ts`, `frames.ts`, dependency-cruiser) or Story 1.2's
  work (root `index.html`, CSP tag, `vite build`, `.github/workflows/**`, Pages deploy,
  size budget, `@babylonjs/*`). Reference them as the consuming stories instead.
- Never introduce a browser-automation dependency (Playwright, Puppeteer, Selenium). The CDP
  runner uses only Node 24 built-ins.
- Never let the harness or its measurement code live under `src/sim/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Node correctness leg | Harness scene: 514.4 x 1066.8 mm playfield plane, thick walls on all four sides, gravity for 6.5 deg pitch, six 26.99 mm balls at distinct start poses; 10,000 ticks stepped | Every ball stays inside the playfield bounds every tick; no two ball centres ever closer than one ball diameter; the run completes 10,000 ticks without a non-terminating step | Test fails naming the tick, ball id and the violated bound |
| Step termination | A tick whose time-of-impact loop would otherwise not converge | Forced advance by `STATICTIME` bounds the step; the tick returns | Test fails if any step exceeds the forced-advance iteration bound |
| Determinism | The same harness run twice in one Node process from identical initial state | Byte-identical final ball positions and velocities across both runs | Test fails printing the first differing ball and component |
| Node cost report | The 10,000-tick run, per-tick timing via `process.hrtime.bigint()` | Mean and p95 nanoseconds per tick written to stdout and into `docs/spikes/spike-1.md`, plus a derived informational per-frame equivalent (`p95_tick x 17`) | n/a - reporting only, does not gate |
| Browser measurement leg | The same harness in the Vite dev page, driven by `requestAnimationFrame`; 60 warm-up frames discarded, then 600 measured frames of 17 steps each | Per-frame sim-cost samples collected; p95 (nearest-rank) reported per browser as JSON on stdout | Runner exits non-zero if the page errors, the target never appears, or fewer than 600 samples are collected |
| Background-throttle guard | The measuring window is occluded or backgrounded so `requestAnimationFrame` throttles | Run is rejected: any frame whose wall-clock delta exceeds 100 ms invalidates the run | Runner exits non-zero naming the throttled frame; measurement is re-run foregrounded |
| Pass verdict | p95 per frame from each measured Windows path | PASS if p95 <= 4 ms on both Windows paths, FAIL otherwise; verdict written to `docs/spikes/spike-1.md` | n/a - both outcomes are valid results |
| macOS / Safari legs | No macOS host available on this cycle host | The Chrome-macOS and Safari-macOS rows exist in `docs/spikes/spike-1.md` and read `PENDING - author's macOS leg` | Not an error; referenced to the existing ledger entry |
| Boundary guard | Any file under `src/sim/` containing a banned global or a `@babylonjs/` import | Boundary test fails naming the file, line and the banned token | Test fails; this is the Story 1.1 stand-in until Story 1.3's dependency-cruiser |
| Header guard | A file under `src/sim/physics/` that is a port | Boundary test asserts the file contains the exact port-marker line and a preceding upstream copyright block | Test fails naming the file |
| Integration (consumer) | `test/spike-1.test.ts` and `tools/spike-1/browser.ts` both import the harness, which imports only `src/sim/physics/**` and `src/sim/contracts/time.ts` | Both consumers step the identical scene and produce their observable effects: the Node test's assertions pass, and the browser page renders a p95 figure and resolves `window.__spike1Run()` with it | A consumer failing to construct the scene fails its own tier |

</intent-contract>

## Code Map

Greenfield: there is no `src/`, no `package.json`, no `docs/` in this repository yet. Everything
below is created by this story except where marked read-only.

**Read-only governing sources (do not edit):**
- `CLAUDE.md` -- the provenance rule; the `package.json`-vs-headers trap is named there explicitly.
- `_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md`
  -- invariants AD-1..AD-17; AD-3 (line ~81), AD-4 (~87), AD-10 (~168), AD-15 (~198), AD-16 (~204)
  govern this story. Stack table at ~275; Structural Seed at ~291.
- `_bmad-output/planning-artifacts/epics.md` -- Story 1.1 ACs at lines 306-336.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the two pre-adjudicated
  author-owned entries to reference (macOS/Safari legs; TICK_HZ ratification).
- `ATTRIBUTIONS.md` -- edited by this story; its "Planned dependencies" table already carries
  the `vpdb/vpx-js` row and states the or-later reasoning.

**Upstream port source, `vpdb/vpx-js` @ `e8a6d6f` (verified reachable 2026-08-27):**
- `lib/physics/` (20 files): `constants.ts`, `functions.ts`, `collision-event.ts`,
  `collision-type.ts`, `hit-object.ts`, `hit-plane.ts`, `hit-point.ts`, `hit-line-3d.ts`,
  `hit-line-z.ts`, `hit-circle.ts`, `hit-triangle.ts`, `hit-3dpoly.ts`, `hit-quadtree.ts`,
  `hit-kd.ts`, `hit-kd-node.ts`, `line-seg.ts`, `line-seg-slingshot.ts`, `mover-object.ts`,
  `anim-object.ts`, `anim-slingshot.ts`.
- `lib/math/` -- the transitive dependency the story AC names as "math": `vertex3d.ts`,
  `vertex2d.ts`, `vertex.ts`, `float.ts`, `functions.ts`, `frect3d.ts`, `matrix3d.ts`,
  `matrix2d.ts` (port only what the closure needs; `catmull-curve`, `dragpoint`, `edge-set`,
  `progressive-mesh`, `spline-vertex` are mesh authoring and are out).
- `lib/vpt/ball/`: `ball.ts`, `ball-data.ts`, `ball-hit.ts`, `ball-mover.ts`, `ball-state.ts`
  (skip `*.spec.ts`, `ball-api.ts`, `ball-mesh-generator.ts`, `ball-updater.ts`).
- `lib/game/player-physics.ts` -- the fixed-step outer loop and the time-of-impact cycle.
- `lib/game/` interface/event surface (`event.ts`, `event-proxy.ts`, `ihittable.ts`,
  `imovable.ts`, `iplayable.ts`) -- upstream physics files import these; sever or minimally
  stub, see Design Notes.

**Verified upstream facts (checked at source 2026-08-27, cite these rather than re-deriving):**
- `lib/physics/constants.ts` has **no licence header at all** and begins at line 1 with
  `export const PHYSICS_STEPTIME = 1000;`. Handling: see Design Notes.
- Values confirmed in that file: `PHYSICS_STEPTIME = 1000` (usec), `PHYS_SKIN = 25.0` (L48),
  `PHYS_TOUCH = 0.05` (L52), `C_LOWNORMVEL = 0.0001` (L54), `C_CONTACTVEL = 0.099` (L55),
  `C_PRECISION = 0.01` (L41), `C_DISP_GAIN = 0.9875` (L67), `C_DISP_LIMIT = 5.0` (L68),
  `STATICTIME = 0.005` (L75), `VELOCITY_EPSILON = 0.05` (L82), `PHYS_FACTOR = 0.1` (derived, L8).
  The unit note is in that file: `1 U = .53975 mm`, `1 T = 10 ms`.
- Ball-ball restitution is hardcoded at `lib/vpt/ball/ball-hit.ts:303`:
  `const impulse = -(1.0 + 0.8) * dot / (myInvMass + ball.hit.invMass);` -- coefficient `0.8`.
- Header form on files that have one (e.g. `lib/physics/hit-object.ts`, `lib/vpt/ball/ball.ts`,
  `lib/game/player-physics.ts`): `VPDB - Virtual Pinball Database / Copyright (C) 2019 freezy
  <freezy@vpdb.io>` followed by the GPL "version 2 ... or (at your option) any later version"
  paragraph. `package.json` says `"license": "GPL-2.0"` -- the exact trap CLAUDE.md warns about.
- `lib/vpt/ball/ball-hit.ts` uses a `Vertex3D` object pool (`clone(true)`, `release`,
  `addAndRelease`). This is load-bearing for the frame budget, not clutter - preserve it.

**Files this story creates:**
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` (edit).
- `src/sim/physics/**` -- the port.
- `src/sim/contracts/time.ts` -- `TICK_HZ`, this story's only contracts file.
- `tools/spike-1/{scene.ts,index.html,browser.ts,measure.mjs}` -- the harness and runners.
- `test/spike-1.test.ts`, `test/sim-boundary.test.ts`.
- `ATTRIBUTIONS.md` (edit), `docs/spikes/spike-1.md`.

## Tasks & Acceptance

**Execution:** (in dependency order; the first task is a hard gate on every later task)

- `ATTRIBUTIONS.md` -- BEFORE any other file: fetch `lib/physics/hit-object.ts` at `e8a6d6f`,
  read its header, and add the `vpdb/vpx-js` row to the **Code** table with commit, authors,
  `GPL-2.0-or-later`, verification date `2026-08-27`, and a note recording the
  `package.json` (`GPL-2.0`) vs header (or-later) divergence and the GPL-3.0 or-later exercise
  -- rationale: CLAUDE.md's hard gate; the entry precedes the file.
- `package.json` + `pnpm-lock.yaml` + `tsconfig.json` + `vitest.config.ts` + `.gitignore` --
  scaffold the single package: `"packageManager": "pnpm@11.24.0"`, `"engines": {"node": ">=24"}`,
  `"type": "module"`, devDependencies `typescript@7.0.2`, `vite@8.2.2`, `vitest@4.1.11`,
  `@types/node`; scripts `dev` (`vite`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`).
  `tsconfig.json`: `strict: true`, `module: esnext`, `moduleResolution: bundler`, explicit
  `"types": ["node"]`, **no `baseUrl`**, `include` covering `src`, `test`, `tools`.
  `vitest.config.ts`: `environment: 'node'`, `include: ['test/**/*.test.ts']`. `.gitignore`:
  add `node_modules/`, `dist/`, `.vite/` -- rationale: TS 7.0 makes `baseUrl` and
  `moduleResolution: node` hard errors and ships `types: []` with no auto-discovery; without
  `node_modules/` ignored the finalize clean-tree check cannot pass.
- `src/sim/physics/**` -- port the minimum transitive closure from the four upstream trees
  named in the Code Map, each file keeping its upstream header plus the port marker line.
  Extract the hardcoded `0.8` ball-ball restitution into `constants.ts` as a named export
  citing `ball-hit.ts:303`. Sever `lib/game/` coupling per Design Notes. Replace any upstream
  wall-clock or random usage with tick-driven deterministic equivalents, commenting each site
  -- rationale: the story's deliverable; AD-15 verbatim solver constants; AD-16 headers.
- `src/sim/contracts/time.ts` -- export `TICK_HZ` with the GPL-3.0 header and the loud
  provisional comment quoted in Design Notes -- rationale: AD-3, one clock behind one constant.
- `tools/spike-1/scene.ts` -- the shared harness: build the 514.4 x 1066.8 mm plane, four
  thick walls, 6.5 deg pitch gravity vector, six 26.99 mm balls at distinct poses, scatter 0
  on every material; export `createSpikeScene()` and `step(scene)`. DOM-free, timing-free,
  allocation-free in the step path -- rationale: one scene, two consumers, comparable numbers.
- `tools/spike-1/index.html` + `tools/spike-1/browser.ts` -- the Vite dev page: 60 warm-up
  frames then 600 measured frames of 17 steps, `performance.now()` around the 17 steps only;
  render the result and expose `window.__spike1Run(): Promise<Spike1Result>`
  -- rationale: `performance` is banned inside `sim/`, so the timing lives here.
- `tools/spike-1/measure.mjs` -- Node-24-builtins-only CDP runner: `--browser chrome|edge`,
  launches the browser headed with a temp profile, remote debugging and the
  background-throttling flags, evaluates `window.__spike1Run()`, prints the JSON, exits
  non-zero on failure -- rationale: makes both Windows legs agent-executable with no new dep.
- `test/spike-1.test.ts` -- the Node leg: 10,000 ticks, the bounds / overlap / termination /
  determinism assertions from the I/O Matrix, per-tick mean and p95 reported
  -- rationale: correctness and the Node cost figure, inside the default suite.
- `test/sim-boundary.test.ts` -- assert no banned global or `@babylonjs/` import anywhere under
  `src/sim/`, and assert every file under `src/sim/physics/` carries an upstream copyright block
  followed by the exact port-marker line -- rationale: Story 1.3's lint does not exist yet.
- `docs/spikes/spike-1.md` -- the result document: the four measurement rows, the verdict, the
  p95 method, the "17 steps" derivation, the port deviation list, and the two ledger references
  -- rationale: the AC's named output artefact.

**Acceptance Criteria:**

- Given `ATTRIBUTIONS.md` has no `vpdb/vpx-js` entry in its Code table and no file exists under
  `src/sim/physics/`, when the port begins, then the `ATTRIBUTIONS.md` entry is written first and
  records commit `e8a6d6f`, the named authors, `GPL-2.0-or-later` **verified in the source file
  headers and explicitly not from `package.json`**, and the date - and only then is any ported
  file written to disk.
- Given any file under `src/sim/physics/`, when it is inspected, then it contains a verbatim
  upstream copyright block immediately followed by the exact line
  `// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0`,
  and `pnpm test` asserts this for every such file.
- Given the scaffolded repository, when `pnpm typecheck` runs, then `tsc --noEmit` exits 0 over
  `src`, `test` and `tools` with `strict: true`, explicit `types` and no `baseUrl`.
- Given `src/sim/physics/constants.ts`, when it is read, then `PHYS_SKIN` is `25.0`,
  `PHYS_TOUCH` is `0.05`, `C_DISP_GAIN` is `0.9875`, `STATICTIME` is `0.005`, and the ball-ball
  restitution `0.8` is a named exported constant citing `lib/vpt/ball/ball-hit.ts:303` - each
  value transcribed from the pinned upstream source, none of them tunable.
- Given `pnpm test`, when the suite runs, then `test/sim-boundary.test.ts` passes, proving no
  file under `src/sim/` references `window`, `document`, `performance`, `Math.random`, `Date`,
  `setTimeout`, `setInterval`, `requestAnimationFrame`, `localStorage`, `navigator`,
  `globalThis` or imports `@babylonjs/*`.
- Given the Vite dev server is running and the harness page is served, when
  `node tools/spike-1/measure.mjs --browser chrome` is run on this Windows 11 host, then it
  exits 0 and prints a JSON result containing 600 samples and a nearest-rank p95 in milliseconds.
- Given the same, when `node tools/spike-1/measure.mjs --browser edge` is run, then it likewise
  exits 0 and prints a 600-sample p95. **Both Windows legs are blocking; neither may be skipped,
  estimated, or recorded as pending.**
- Given both Windows p95 figures and the Node per-tick figures, when `docs/spikes/spike-1.md` is
  written, then it carries a four-row table (Chrome/Windows, Edge/Windows, Chrome/macOS,
  Safari/macOS) with the two Windows rows filled with measured numbers, machine identification,
  browser versions and the date the runs were made, and the two macOS rows present and marked
  `PENDING - author's macOS leg`, referencing the existing `deferred-work.md` entry
  "Author-owned: macOS / Safari measurement legs" - with no new ledger entry filed.
- Given the recorded Windows numbers, when the verdict is computed, then `docs/spikes/spike-1.md`
  states PASS if p95 <= 4 ms on both Windows paths and FAIL otherwise, and `TICK_HZ` in
  `src/sim/contracts/time.ts` is set to 1000 on PASS or 480 on FAIL - and in both files the value
  is marked loudly as **provisional, pending the author's macOS leg**, referencing the existing
  ledger entry "Author-owned: TICK_HZ ratification from Spike 1" with no new entry filed.
- Given the verdict is FAIL, when `docs/spikes/spike-1.md` is finished, then the solver re-tune
  is logged there as the next piece of work **before Story 1.3**, with the measured shortfall.
- Given the port is complete, when `docs/spikes/spike-1.md` is read, then it lists every
  deviation from a verbatim port: severed `lib/game/` couplings, the extracted restitution
  constant, any wall-clock or random substitution, and any upstream file that carried no header.

### Review Findings

**Code review, 2026-08-27** (stage: `code-review`, full review mode, spec-anchored).
Review tier: all four layers run in parallel at the session's Opus tier, no model override
(`_bmad/custom/model-overrides.yaml` does not exist in this project) — blind-hunter,
edge-case-hunter, verification-gap, acceptance-auditor. Baseline `bc8a47b`, 58 tracked files
plus QA's 5 untracked test files, `pnpm-lock.yaml`'s 931 generated lines elided. No layer
failed. Reviewed in full, no chunking.

Counts: **2 high, 5 medium, 6 low resolved by patch · 2 routed to the ledger · 9 closed at
emission · 6 dismissed** (false positives and already-adjudicated re-reports).

Suite after patches: `pnpm typecheck` exits 0; `pnpm test` **155/155 across 9 files**
(was 149 across 8 — one new test file, four new guard tests, two new z-bounds assertions).

#### HIGH — fixed

1. **The harness measured a scene at ~55% of gravity, invalidating every recorded p95.**
   `tools/spike-1/scene.ts` passed the bare `DEFAULT_TABLE_GRAVITY` multiplier (`0.97`) as the
   gravity *strength*. Upstream's `PlayerPhysics.init()` consumes `TableData.gravity`, which is
   already `GRAVITYCONST`-scaled — `vpx-js lib/vpt/table/table-api.ts:156-158` defines
   `get Gravity() { return this.data.gravity / GRAVITYCONST; }` and the matching setter — and
   `GRAVITYCONST` (1.81751) was ported into `constants.ts` and then referenced by nothing, which
   is the tell. Effect: 0.593 m/s² of down-slope acceleration instead of ~1.08 m/s² on a 6.5°
   playfield, so the six-ball collision workload — the entire point of the spike — was materially
   lighter than the machine it stands in for.
   *Empirically quantified before rating:* correcting it raises the Node leg's p95 **1.40×**
   (171,300 → 240,500 ns/tick; derived per-frame 2.91 → **4.09 ms**, over the 4 ms bar). The
   correctness legs still pass (worst bounds excess 0.0149 VU, worst overlap 0.0083 VU).
   *Fixed* in `scene.ts` with the upstream citation inline. fix-risk: low for the line, high for
   the consequence — **the browser legs have not been re-run and the PASS verdict no longer
   stands.** `TICK_HZ` deliberately left at 1000 (unchanged): the fail branch bundles a solver
   re-tune and both are the author's call. Recorded as an occurrence on the existing ledger entry
   "Author-owned: TICK_HZ ratification from Spike 1" — no new entry, per this spec's Never list.

2. **`package.json` declared `GPL-3.0-only`, contradicting `NOTICE`'s or-later grant.**
   `NOTICE` (committed before this story) grants "either version 3 of the License, or (at your
   option) any later version" = `GPL-3.0-or-later`. The story's new `package.json` declared
   `GPL-3.0-only` — a narrower, contradictory SPDX identifier, and precisely the failure mode
   `CLAUDE.md` names as the trap that "decided the whole licensing plan" (vpx-js's `package.json`
   saying `GPL-2.0` while its headers granted `GPL-2.0-or-later`). Nothing anywhere recorded a
   decision to be GPL-3.0-only. *Fixed:* `"license": "GPL-3.0-or-later"`. fix-risk: low (one
   line; combining inbound GPL-2.0-or-later into GPL-3.0-or-later is the exercise
   `ATTRIBUTIONS.md` already documents).

#### MEDIUM — fixed

3. **The two `PlayerPhysics` setup guards — one of them this story's own `high` fix — had zero
   test coverage.** Deleting either left all 149 tests green, because `tools/spike-1/scene.ts` is
   the only caller and always calls them in the right order. Added
   `test/player-physics-guards.test.ts` (4 tests), and made `finalizeStatics()` symmetric with
   `addStaticHitObject()` by throwing on a second call — it previously re-added every static to
   the octree, silently duplicating every wall and corner. fix-risk: low.
4. **The frame-budget multiplier was pinned only in prose.** `test/spike-1.test.ts` hardcoded
   `p95 * 17` while `docs/spikes/spike-1.md` claimed the derivation was automatic; changing
   `scene.ts`'s `Math.ceil` to `Math.floor` would have understated the budget ~6% with the suite
   green. Now imports `STEPS_PER_FRAME_60HZ`. fix-risk: low.
5. **The Node bounds test checked x and y only.** A ball tunnelling through the playfield plane or
   escaping above the glass passed the story's own "no ball leaves the bounds" AC. Added z
   assertions against the playfield and the glass (verified the real range is z ∈ [24.99, 37.64]
   VU, so the assertions have wide margin). fix-risk: low.
6. **`MM_PER_VU` was duplicated in the test.** `test/spike-1.test.ts` re-declared the harness's
   conversion behind a "must match" comment — two conversion sites, which is what AD-10 exists to
   prevent — so a change to the harness would leave the correctness leg asserting stale bounds and
   still passing. `scene.ts` now exports `mmToVu` / `MM_PER_VU` / `GLASS_HEIGHT_MM` and the test
   imports them. fix-risk: low.
7. **`measure.mjs` could silently measure the surface the amended AC bans.** It now prints its
   target and warns loudly when that target is the dev page, and its header records the amended
   measurement rule. The missing `build`/`preview` scaffold is Story 1.2's (routed below).
   fix-risk: low.

#### LOW — fixed

8. **`pnpm test` deleted `%TEMP%/dragonwar-spike1-*`.** `main()` swept before parsing arguments,
   and `test/measure-cli.test.ts` spawns the script six times — running the suite while a
   measurement was in flight destroyed that browser's live profile. Parse now happens first.
   Distinct root cause from the already-adjudicated CDP-port entry.
9. **A dropped CDP WebSocket hung the runner past every deadline.** `connectCdp()` had no `close`
   handler, so in-flight `send()`s never settled and the probe loop's deadline check (after the
   `await`) was unreachable. Pending requests are now rejected on close.
10. **`tools/spike-1/index.html` carried no GPL-3.0 header**, which this story's own "Always"
    bullet requires of every newly authored source file (the same class of miss the implement
    stage caught on `vitest.config.ts`). Added.
11. **Boundary-guard holes.** `test/sim-boundary.test.ts` scanned only `.ts`, so a `.js`/`.mjs`
    under `src/sim/` bypassed it entirely; `test/spike-1-harness-boundary.test.ts`'s regex
    required a `from` clause, so a bare side-effect `import '@babylonjs/core';` — the exact threat
    its own header names — passed, and it never covered `browser.ts`. Both extended; verified with
    a negative control (the injected side-effect import now fails the suite).
12. **No `testTimeout`.** Vitest's 5 s default was already 83% consumed by the heaviest test, and
    the gravity correction pushed it over — a real failure, not a hypothetical. Set to 60 s in
    `vitest.config.ts` as a hang guard, with the reasoning recorded there.
13. **Inherited/authored deviations missing from the results document.** Added to the deviation
    list: `HitLine3D.hitTest()`'s double position transform and untransformed velocity (**verbatim
    upstream — verified byte-identical against `e8a6d6f`, not a port defect**; unexercised here,
    and Story 1.4's loader is the first caller that must decide about it); `meshAsPlayfield` being
    dead but gating two live branches; `line-seg-slingshot.ts:100`'s literal `+ 100` ms as a
    recorded AD-3 carve-out that AD-15/AD-16 win (Story 1.3's dependency-cruiser must whitelist
    ported files for ms literals); and "thick walls" being satisfied by 50 mm-tall zero-thickness
    `LineSeg`s plus corner `HitPoint`s rather than volumetric geometry.

#### Routed to `deferred-work.md` (2 new canonical entries)

- **The production-build measurement surface has no scaffold in the repository** — `medium`,
  fix-risk low, out-of-footprint (this story's Never list bars it from `vite build`). Story 1.2.
- **`measure.mjs`'s non-Windows paths are untested, and the macOS legs are its next caller** —
  `low`, fix-risk low. Missing macOS `DEFAULT_EXE`, `detached` never set so the group kill falls
  through, and `process.exit()` can truncate the result JSON on POSIX pipes.

Occurrences appended (no new entries, per Rule 15 and this spec's Never list): **Author-owned:
TICK_HZ ratification from Spike 1** (basis invalidated), **Author-owned: macOS / Safari
measurement legs** (Windows legs now also need re-running, with machine/browser/date recorded in
the deciding table), **The "terminates every step" test does not construct a genuinely
non-convergent input**.

#### Closed at emission

- `by-design`: the `+ 100` ms literal inside the ported `line-seg-slingshot.ts` (AD-15/AD-16
  forbid editing ported bytes; recorded as a carve-out instead — the acceptance auditor rated this
  HIGH under "an AD violation is never a deferrable low", but the AD registry itself resolves the
  AD-3/AD-15 collision in the port's favour, so the defect is the missing record, now written).
- `by-design`: `test/time-contract.test.ts` accepting either 1000 or 480 — pinning 1000 would be
  wrong while finding 1 leaves the verdict unestablished.
- `by-design`: the AD-15 constants pin covering 12 of ~30 ported constants — it pins exactly the
  values the ACs name.
- `by-design`: `test/sim-boundary.test.ts`'s naive `//`-stripping and its not checking outward
  imports from `sim/` — a deliberate stand-in that AD-16 says Story 1.3's dependency-cruiser
  supersedes.
- `wontfix-theoretical`: the `ATTRIBUTIONS.md` entry landing in the *same* commit as the ported
  files rather than an earlier one. The AC says "before any ported file is **committed**", and no
  commit in history ever contains a ported file without the entry, so the substantive protection
  holds; "written to disk first" is unauditable post-hoc. *What would make it real:* a ported file
  appearing in any commit whose `ATTRIBUTIONS.md` lacks its entry.
- `wontfix-theoretical`: `nearestRankP95([])` returning `undefined`, and `runFrames(scene, 0, …)`
  still running one frame — no caller passes either.
- `wontfix-theoretical`: the throttle guard's `lastTimestamp` resetting between the warm-up and
  measured runs, so a gap spanning that boundary is undetected. It is one frame in 660, and a
  single inflated sample sorts above the nearest-rank p95 index (569 of 600), so it cannot move
  the reported statistic. *What would make it real:* reporting a mean, or a percentile at a rank
  one sample could occupy.
- `wontfix-theoretical`: `measure.mjs` not verifying that the browser answering CDP port 9333 is
  the one it launched — the concurrency root cause is already adjudicated in the ledger.
- `wontfix-theoretical`: `findPageTarget()` not catching a transient `fetch` failure inside its
  retry loop.

#### Dismissed

- **`HitLine3D` double-transform reported as a port-introduced bug** (blind-hunter *and*
  verification-gap, independently). Diffed against `vpdb/vpx-js@e8a6d6f`: the file is
  byte-identical apart from the port marker and rewritten import paths. Not a porting defect —
  re-authoring it would be the divergence AD-15/AD-16 forbid. Recorded in the deviation list
  instead (finding 13).
- **`deterministicScatterUnit()` returning the distribution endpoint.** `scatter = 0 * 2 - 1 = -1`
  looks wrong, but the next line's `(1.0 - scatter * scatter)` shaping is exactly zero at the
  endpoints, so the applied deflection is 0 — numerically identical to a neutral draw. Verified by
  reading the shaping, not the substitution alone.
- **`epic-1-context.md` "deletions".** That file is the lead's recompile after the `epics.md`
  amendment (commit `5d4202d`), not this story's deliverable.
- **Re-reports of adjudicated ledger items** (`ObjectPool` counters, corner `HitPoint`, the CDP
  port, the end-to-end throttle-guard test, the AGENTS.md TODOs) — already canonical; not re-filed.
- **Amended-AC framing treated as contradiction** — the production-build surface, Edge/Windows
  being best-effort for the gate, `TICK_HZ` provisional, and the deliberately retained superseded
  sections are all intended.
- **Cosmetic scaffold nits** (`.gitignore` lacking `coverage/`, `dist/` unused until Story 1.2).

#### Rule checks

- **Rule 1 (Integration AC):** satisfied and real, not decorative. The I/O matrix's last row is
  exercised by two genuine consumers against the real module — `test/spike-1.test.ts` and
  `tools/spike-1/browser.ts` via the shared harness — with `test/spike-1-harness-boundary.test.ts`
  pinning the import direction (now for both halves of the harness). No mocks.
- **Rule 3 (real-runtime evidence):** satisfied for the CLI — `test/measure-cli.test.ts` spawns the
  real `measure.mjs` as a subprocess and asserts real exit codes and stderr. The browser harness is
  developer measurement tooling that ships nothing to a player, so it is **exempt**; the residual
  gap is already adjudicated `wontfix-theoretical` in the ledger.
- **Rule 5 (NFR tripwire):** complied with, in the right direction. The Edge frame-budget problem
  was resolved by amending `epics.md` with a dated change log, not by code comments plus a ledger
  entry.
- **Rule 6 (AD conformance):** AD-1 clean (no banned global or `@babylonjs/*` in executable code
  under `src/sim/`; the harness sits outside `sim/`). AD-15 **verified byte-for-byte**:
  `constants.ts`'s body diffs identically against upstream `e8a6d6f`, and `FLT_MIN`/`FLT_MAX` match
  `lib/vpt/mesh.ts:27-28`. AD-16 clean: all 36 ported files carry an upstream copyright block
  immediately followed by the exact port marker. 22 of the 36 are code-identical to upstream; every
  one of the other 14 changes maps to a documented deviation. AD-3 is the one tension — see the
  `by-design` closure above. AD-10 was the *substance* of finding 1 (the harness's own conversion
  boundary) and finding 6.
- **Rule 13 (working directory):** `git rev-parse --show-toplevel` verified as
  `C:/git/dragonwar/.worktrees/epic-1` by this agent and independently by each of the four layers,
  which were each given the path and the verification requirement. No findings discarded.
- **Provenance (`CLAUDE.md`, hard requirement):** `ATTRIBUTIONS.md` records `vpdb/vpx-js` at
  `e8a6d6f` (tag v1.3.4, 2020-11-12), all three named authors, `GPL-2.0-or-later` **as verified in
  the source file headers with the `package.json`-says-`GPL-2.0` divergence stated explicitly**,
  and the verification date. Independently re-verified against upstream this pass. The one
  provenance defect found was on DragonWar's own side, not the port's — finding 2.

**Verdict: `in-progress`.** Finding 1 is fixed in code but not resolved in consequence: the browser
legs must be re-measured on the corrected scene, against a production build, before the PASS
verdict and `TICK_HZ = 1000` mean anything. That re-measurement is author-owned and already
ledgered.

## Spec Change Log

## Review Triage Log

### 2026-08-27 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 14 (high 2, medium 5, low 7)
- defer: 6 (medium 2, low 4)
- reject: 4 (low 4)
- addressed_findings:
  - `[high]` `[patch]` AD-15 solver constants (`PHYS_SKIN`, `PHYS_TOUCH`, `C_PRECISION`, `C_LOWNORMVEL`, `C_CONTACTVEL`, `C_DISP_GAIN`, `C_DISP_LIMIT`, `STATICTIME`, `VELOCITY_EPSILON`, `PHYS_FACTOR`, `PHYSICS_STEPTIME`, `BALL_BALL_RESTITUTION`) were never asserted by any test — empirically demonstrated (mutate two of them, `pnpm test` stays green). Added a values-pin block to `test/sim-boundary.test.ts`.
  - `[high]` `[patch]` `PlayerPhysics.addStaticHitObject()` called after `finalizeStatics()` silently excluded the new shape from collision detection (ball would pass through it, no error). Added a throw guard plus a `staticsFinalized` flag.
  - `[medium]` `[patch]` `PlayerPhysics.step()` threw a confusing "Cannot read properties of undefined" if `setPlayfieldHit()`/`setTopGlassHit()` were never called. Added explicit guards naming the missing call.
  - `[medium]` `[patch]` `tools/spike-1/browser.ts`'s `nearestRankP95()` (the function the PASS/FAIL verdict's p95 figures are computed by) had zero automated coverage — only ever exercised via a live browser run. Exported it and added `test/spike-1-browser-guard.test.ts` assertions against hand-computed expected values.
  - `[medium]` `[patch]` `vitest.config.ts` was missing the GPL-3.0 header required by this story's "Always" bullet (AD-16) for every newly authored source file. Added it.
  - `[medium]` `[patch]` `measure.mjs`'s `child.on('error', ...)` handler `throw`ing directly was an uncaught exception outside the surrounding try/catch, crashing the process before cleanup (`killTree`/`rmSync`) ran on a bad `--exe` path. Rewired through a promise raced against the main flow; verified by pointing `--exe` at a nonexistent path (now exits 1 cleanly).
  - `[medium]` `[patch]` `measure.mjs`'s temp browser-profile cleanup (`rmSync`) was silently failing on essentially every run (self-discovered during verification, not from a review layer: 30 leftover ~50MB profile directories had accumulated during this story's own testing). Added `maxRetries`/`retryDelay` backoff plus a startup sweep of stale directories from earlier runs; verified empirically that repeated runs now converge to zero accumulation.
  - `[low]` `[patch]` `measure.mjs`'s `--browser`/`--url`/`--exe` flags silently accepted a missing value (`undefined` flowing into `spawn()`'s argv) if the flag was last on the command line. Added explicit validation.
  - `[low]` `[patch]` `measure.mjs`'s top-level `main()` call had no `.catch()`, so a throw before the try block (e.g. `mkdtempSync` failing) would be an unhandled promise rejection rather than a clean exit. Added one.
  - `[low]` `[patch]` `docs/spikes/spike-1.md`'s median-of-repeated-runs figures (3.90 ms Chrome, 3.75 ms Edge) were stated without showing the sorted-array arithmetic behind them. Added it so the numbers are independently checkable.
  - `[low]` `[patch]` The bounds/overlap correctness tests' `2.0` VU tolerance comment justified the ceiling but never stated what the run actually observed. Instrumented both tests to log and report the worst value seen (~0.013 VU bounds excess, ~0.006 VU overlap penetration — both ~150-300x under the ceiling) and recorded it in the results doc.
  - `[low]` `[patch]` `game/player-physics.ts`'s `timeMsec` field is never advanced anywhere in this port, a latent trap for the future slingshot story that reads it. Documented in the deviation list.
  - `[low]` `[patch]` `ball/ball-hit.ts`'s `isRealBall()` always returns `true` in this port (`vpVolObjs` is never set to a falsy value) — the "false" branch every caller guards against is currently dead. Documented in the deviation list.
  - `[low]` `[patch]` `constants.ts`'s `DEFAULT_STEPTIME`/`DEFAULT_STEPTIME_S` carry an inherited-upstream comment bug (both say "1000Hz"; `0.01`s/step is actually 100Hz). Value is correct and verbatim per AD-15; documented the comment discrepancy in the deviation list rather than editing the ported file's comment.
  - `defer` (routed, out-of-footprint): `AGENTS.md`'s scaffold-stage TODOs (real `pnpm` commands, CI workflow) are now answerable by this story's `package.json`/`tsconfig.json`/`vitest.config.ts`, but this run is barred from touching `AGENTS.md`.
  - `defer` (low, not exercised by this story): `util/object-pool.ts`'s pool-exhaustion counters (`skipped`, `warned`) are tracked but never surfaced anywhere — a future real exhaustion would be invisible until it manifested as a physics anomaly.
  - `defer` (low-medium, would need a scene redesign + revalidation this story's scope doesn't call for): the six ball start poses may never bring a ball into contact with a corner `HitPoint`, so that ported collision primitive is header-tested but not exercised by either correctness leg.
  - `defer` (medium, high fix-risk): `test/spike-1.test.ts`'s "terminates every step" test asserts a wall-clock ceiling on the ordinary scene rather than constructing a genuinely non-convergent input that exercises the `STATICTIME` forced-advance mechanism itself.
  - `defer` (low-medium, high fix-risk/complexity for the value): the background-throttle guard is unit-tested at the `runFrames()` level but not end-to-end through `measure.mjs`'s actual process exit code via a real CDP-driven throttled frame.
  - `defer` (low, no present risk): `measure.mjs` hardcodes its CDP port with no free-port check or guard against two concurrent invocations; harmless under this story's documented sequential single-invocation usage.
  - `reject` (out of scope for a spike-only greenfield story, not named in this story's file list): no root `README.md` exists yet.
  - `reject` (already pre-adjudicated, not a new issue): the macOS Chrome / Safari rows remain `PENDING`.
  - `reject` (superseded by the `patch` items above plus the pre-existing "Author-owned: TICK_HZ ratification from Spike 1" ledger entry, which the spec explicitly forbids re-filing): the median-of-repeated-runs aggregation protocol isn't literally spelled out in the spec's Pass-verdict row.
  - `reject` (already properly justified by verbatim upstream behaviour, now backed by real observed-value data from the `patch` item above): the bounds/overlap tolerance being wider than the intent's literal "every ball stays inside bounds" wording.

## Design Notes

**Governing ADs (Rule 6)** - the registry for this project is the architecture spine's
invariants at
`_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md`,
not a `docs/adr/` directory:
- **AD-1** (ports-and-adapters, fixed dependency direction): the harness and all timing code sit
  outside `src/sim/`; `sim/` is DOM-free and engine-free.
- **AD-3** (one clock behind one constant): `TICK_HZ` is the single constant in
  `src/sim/contracts/time.ts`, set from the port's `PHYSICS_STEPTIME` (1000 usec -> 1000 Hz);
  no literal millisecond elsewhere in `sim/`; physics draws no randomness and scatter is 0.
- **AD-4** (loop contract): the time-of-impact loop inside a step is bounded by forced advance
  (`STATICTIME`) so every step terminates deterministically - the Node leg asserts this.
- **AD-10** (units and frames): physics keeps VP units internally, `1 U = 0.53975 mm`; the
  harness authors its dimensions in mm and converts at its own boundary. Story 1.4 owns
  `frames.ts`; this story's conversion is local to the harness and must be replaced by
  `frames.ts` later - say so in a comment at the conversion site.
- **AD-15** (solver constants verbatim, never tunable): `constants.ts` is transcribed, not
  authored. Changing one later is a physics-version bump that re-records every golden.
- **AD-16** (boundaries linted; ported files keep their notices): the header rules above.
  Story 1.3's dependency-cruiser supersedes `test/sim-boundary.test.ts`.
- **AD-17** is NOT in scope: the static build, CSP tag, size budget and CI belong to Story 1.2.

**Integration ACs / Consumed-by / Consumes (Rules 1 and 2).** This story introduces a shared
module (`src/sim/physics/**` plus `src/sim/contracts/time.ts`). It has two real in-story
consumers, both exercised against the real module and neither mocked - the Node test
`test/spike-1.test.ts` and the browser page `tools/spike-1/browser.ts`, via the shared harness
`tools/spike-1/scene.ts`. Their Integration AC is the last row of the I/O Matrix.
- `Consumes:` nothing. Story 1.1 is the first story of a greenfield epic; there is no previous
  `done` story and no existing module to consume.
- `Consumed-by:`
  - Story 1.3 - `src/sim/contracts/time.ts` (`TICK_HZ`) feeds the ms-to-ticks conversion and the
    dependency-cruiser rules that replace `test/sim-boundary.test.ts`.
  - Story 1.4 - `src/sim/physics/loader` builds the compound collision body from the ported
    primitive set and replaces the harness's local unit conversion with `frames.ts`.
  - Story 1.5 - `sim/loop` drives `physics.step` at `TICK_HZ` for the serve/roll/drain slice.
  - Story 1.6 - ports `lib/vpt/flipper/` on top of this base as the hardware-rule flipper.
  - Story 1.7 - the cabinet oscillator, tilt bob and slam sensor sit beside this physics state.
  - Story 1.8 - replay goldens hash the state this physics produces; a change to any solver
    constant here re-records all of them.

**Reading the pass threshold.** The story's AC says "p95 <= 4 ms on every measured path"
directly after the AC that defines the measured paths as "per browser and machine". The threshold
is therefore scoped to the **per-frame** browser figures - that is the gating number. The Node leg
reports **per-tick** cost, a different unit; record it, and record the derived per-frame
equivalent (`p95_tick x 17`) as an informational cross-check that does not gate. State this
reading in `docs/spikes/spike-1.md` so the author can overrule it cheaply.

**Why 17 steps.** At `TICK_HZ = 1000`, one 60 Hz frame owes 16.67 steps; 17 is the worst-case
whole-step count a frame can be asked for once the fractional remainder is carried (AD-4). The
planning artifacts state "17 steps (one 60 Hz frame of simulated time)" without deriving it -
this is the derivation; put it in the results document.

**p95 method (a spec decision - the artifacts do not specify one).** Nearest-rank on the sorted
sample array: `sorted[Math.ceil(0.95 * n) - 1]`. Browser: discard 60 warm-up frames, then collect
exactly 600 samples (n = 600, index 569). Node: 10,000 samples timed individually with
`process.hrtime.bigint()` (index 9499); note in the results document that per-tick timing adds
roughly 100 ns of instrumentation to each sample. Record the method in `docs/spikes/spike-1.md`
so a later re-run is comparable.

**Browser measurement must not be throttled.** Launch headed, never `--headless`: a background or
occluded window throttles `requestAnimationFrame` and silently ruins the numbers. Pass
`--disable-background-timer-throttling`, `--disable-backgrounding-occluded-windows`,
`--disable-renderer-backgrounding`, a fresh `--user-data-dir` in the OS temp directory, and
`--remote-debugging-port`. Reject the run if any frame's wall-clock delta exceeds 100 ms.
Time only the 17 `step()` calls - the page renders no 3D and must not include DOM work in the
sample. Windows executables to probe, with an `--exe` override:
Chrome `C:\Program Files\Google\Chrome\Application\chrome.exe`,
Edge `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
`measure.mjs` speaks CDP over Node 24's global `fetch` (`/json/list`) and global `WebSocket`
(`Runtime.evaluate` with `awaitPromise: true`) - no npm dependency. If it cannot drive Chrome,
the documented fallback for the Chrome leg only is `chrome-devtools-mcp`
(`new_page` on the dev URL, then `evaluate_script` calling `window.__spike1Run()`); the Edge leg
has no MCP fallback, which is why the runner exists.

**Severing the `lib/game/` coupling.** Upstream physics files import `EventProxy`, `Event`,
`IHittable`, `IMovable`, `IPlayable` from `lib/game/`. DragonWar has its own event model
(`SwitchEvent` / `ContactEvent`, Story 1.3), so do not port vpx-js's event system. Port the
minimal structural type surface these files need into `src/sim/physics/` (interfaces only, no
behaviour), leave event emission as a no-op seam with a `TODO(story-1.3)` comment naming what
will replace it, and list each severed import in the deviation list. Keep the surgery minimal -
the goal is a compiling, measurable solver, not a redesign.

**The header-less upstream file.** `lib/physics/constants.ts` at `e8a6d6f` carries no copyright
header. Do NOT give it a bare GPL-3.0 header - that would assert DragonWar authorship over
upstream work. Give it the project's canonical upstream header (the block from
`lib/physics/hit-object.ts`, unchanged), then the port-marker line, then a third line recording
that the upstream file itself carried no header and that the licence was established from the
repository's other source files. Record this in `ATTRIBUTIONS.md` and in the deviation list.

**Rule 14 and ported bytes.** Newly authored code uses escape sequences for any non-ASCII
character. Ported files are the deliberate exception: their upstream bytes - copyright headers
included - are preserved exactly, because AD-16 and the GPL grant require it. Note this in the
deviation list so a reviewer does not file it as a Rule 14 violation.

**Exact `time.ts` comment wording** (keep it loud; the reviewer and the merge gate look for it):

```ts
// PROVISIONAL - pending the author's macOS leg of Spike 1.
// Set from the Windows Chrome + Windows Edge p95 measured <YYYY-MM-DD of the runs>; see
// docs/spikes/spike-1.md. The macOS Chrome and Safari rows are still PENDING, so this
// value is NOT ratified. Ledger: "Author-owned: TICK_HZ ratification from Spike 1".
// Changing it re-records every golden replay (AD-3, AD-15).
export const TICK_HZ = 1000; // 1000 on PASS, 480 on FAIL
```

**Toolchain fallback.** `packageManager: "pnpm@11.24.0"` makes pnpm self-provision that version;
the host currently has pnpm 11.3.0. If self-provisioning is unavailable, proceed on the installed
pnpm 11.x - the story AC's own bar is "pnpm 11" - and record the deviation in the results
document. No `vite.config.ts` is created: Vite defaults serve the harness at
`http://localhost:5173/tools/spike-1/index.html`, and the root `index.html` plus the build
config belong to Story 1.2.

**Root-file footprint note.** Epic 1's `paths_hint` lists `src/**`, `test/**`, `tools/**`,
`assets/src/**`, `.github/workflows/**`, `package.json`. This story additionally touches
`tsconfig.json`, `vitest.config.ts`, `pnpm-lock.yaml`, `.gitignore`, `ATTRIBUTIONS.md` and
`docs/spikes/spike-1.md`. All are unavoidable for a greenfield scaffold, none is claimed by
another epic, and Epic 1 runs alone in wave 1.

## Verification

**Commands:** (run from `C:/git/dragonwar/.worktrees/epic-1`)

- `pnpm install` -- expected: exits 0; `pnpm-lock.yaml` written; `node_modules/` ignored by git.
- `pnpm typecheck` -- expected: `tsc --noEmit` exits 0 with no diagnostics.
- `pnpm test` -- expected: exits 0; `test/spike-1.test.ts` and `test/sim-boundary.test.ts` both
  pass; the Node per-tick mean and p95 appear in the output.
- `pnpm dev` (background) then
  `node tools/spike-1/measure.mjs --browser chrome --url http://localhost:5173/tools/spike-1/index.html`
  -- expected: exits 0, prints JSON with `samples: 600` and a numeric `p95Ms`.
- `node tools/spike-1/measure.mjs --browser edge --url http://localhost:5173/tools/spike-1/index.html`
  -- expected: exits 0, prints JSON with `samples: 600` and a numeric `p95Ms`.
- `git status --porcelain` -- expected: no untracked `node_modules/` or `dist/` entries.

**Manual checks:**
- `ATTRIBUTIONS.md` Code table carries the `vpdb/vpx-js` row with commit `e8a6d6f`, the authors,
  `GPL-2.0-or-later`, the date, and the explicit note that the licence was read from the source
  file headers while `package.json` says only `GPL-2.0`.
- Confirm by inspection that the attribution entry exists and is complete before any ported file
  is staged.
- `docs/spikes/spike-1.md` shows four measurement rows: two filled Windows rows and two macOS
  rows reading `PENDING - author's macOS leg`; a PASS/FAIL verdict; the p95 method; the "17
  steps" derivation; the deviation list; and references (not new entries) to the two existing
  `deferred-work.md` author-owned entries.
- `src/sim/contracts/time.ts` carries the provisional comment block verbatim as written above.
- `_bmad-output/implementation-artifacts/deferred-work.md` is unchanged by this story.

**Automated tests added (QA):** the four Manual checks above, plus the harness's Integration AC
import boundary and `measure.mjs`'s previously-untested CLI argument-validation path, converted
to regression tests. All discoverable and green under `pnpm test` (149/149 passing) alongside the
122 pre-existing tests; none duplicate existing coverage (bounds/overlap/termination/determinism/
per-tick cost, `sim/` purity + port-header provenance + AD-15 constant pins, or the
background-throttle guard / `nearestRankP95()`), and none touch the pre-adjudicated deferred gaps
(the adversarial STATICTIME input, an end-to-end CDP throttle-guard test, or the hardcoded CDP
port).
- `test/attributions.test.ts` (QA) -- pins `ATTRIBUTIONS.md`'s `vpdb/vpx-js` provenance record
  (commit, three authors, `GPL-2.0-or-later` verified in headers not `package.json`, the
  verification date, and the GPL-3.0 or-later exercise reasoning) so a future edit can't silently
  trim or corrupt it.
- `test/spike-1-docs.test.ts` (QA) -- pins `docs/spikes/spike-1.md`'s AC-required structure: the
  four measurement-path rows, the macOS/Safari `PENDING` rows referencing the existing
  `deferred-work.md` ledger entries by exact name (cross-checked that both entries actually exist
  there), a PASS/FAIL verdict, the p95 nearest-rank method, the "17 steps" derivation, and every
  required category of the port-deviation list.
- `test/time-contract.test.ts` (QA) -- pins `src/sim/contracts/time.ts`: `TICK_HZ` is `1000` or
  `480`, the comment is marked `PROVISIONAL` and explicitly `NOT ratified`, it names the
  pre-adjudicated `TICK_HZ` ratification ledger entry (cross-checked it exists in
  `deferred-work.md`), and it flags the still-pending macOS leg (AD-3, AD-15).
- `test/spike-1-harness-boundary.test.ts` (QA) -- pins the I/O matrix's "Integration (consumer)"
  row: `tools/spike-1/scene.ts` imports only from `src/sim/physics/**` or
  `src/sim/contracts/time` (AD-1), the direction `test/sim-boundary.test.ts` does not check.
- `test/measure-cli.test.ts` (QA) -- real subprocess invocations of `tools/spike-1/measure.mjs`
  (Rule 3) exercising its argument-validation error paths (missing `--browser`, an unrecognized
  `--browser` value, a flag left with no value, an unrecognized flag), none of which needs a
  browser or CDP and none of which had any prior test coverage.

## Auto Run Result

Status: done
Blocking condition: none

### Plan stage (2026-08-27)

Planned 2026-08-27 by `bmad-build-auto` (plan stage, halt-after-planning). Epic context reused
from the committed `_bmad-output/implementation-artifacts/epic-1-context.md`; no previous `done`
story exists (1.1 is the first story of Epic 1). Verified against the READY FOR DEVELOPMENT
standard: actionable, dependency-ordered, Given/When/Then throughout, surface-anchored on
`pnpm typecheck` / `pnpm test` / the CDP runner's exit code and JSON / the named artefact files,
no placeholders, no unresolved gaps. Left uncommitted for the lead's validation gate.

### Implement + review stage (2026-08-27)

**Summary of implemented change.** Stood up the greenfield single-package repository
(pnpm/TypeScript/Vite/Vitest scaffold), recorded the `vpdb/vpx-js` provenance entry in
`ATTRIBUTIONS.md` before porting a single file, ported the minimum `lib/physics/` +
`lib/math/` + `lib/vpt/ball/` + `lib/game/player-physics.ts` transitive closure under
`src/sim/physics/**`, built the shared six-ball harness (`tools/spike-1/scene.ts`), and
measured it two ways: 10,000 ticks in Node (correctness + per-tick cost) and 600
`requestAnimationFrame` frames of 17 steps each in Windows Chrome and Windows Edge
(per-frame p95, via a hand-rolled Node-builtins-only CDP runner). Recorded the results in
`docs/spikes/spike-1.md`. **Verdict: PASS** (Chrome p95 3.90 ms, Edge p95 3.75 ms, both
medians of repeated runs — see the doc's "Repeat-run variance" section for why a single
run is not a reliable signal on this host, and for the honest, narrow-margin framing).
`TICK_HZ` in `src/sim/contracts/time.ts` is set to **1000**, marked provisional pending
the author's macOS leg, per the pre-adjudicated ledger entries (no new ledger entries
filed for the macOS/Safari legs or the `TICK_HZ` ratification, as required).

**Files changed:**
- `ATTRIBUTIONS.md` — added the `vpdb/vpx-js` Code-table provenance entry (before any port).
- `.gitignore` — added `node_modules/`, `dist/`, `.vite/`.
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts` — the scaffold.
- `src/sim/contracts/time.ts` — `TICK_HZ = 1000`, provisional comment block.
- `src/sim/physics/**` (34 files under `physics/`, `physics/ball/`, `physics/game/`,
  `physics/math/`, `physics/util/`) — the vpx-js port, each keeping its upstream header
  plus the port-marker line; five headerless upstream files given the canonical header
  per Design Notes; `BALL_BALL_RESTITUTION` extracted as a named constant;
  `game/player-physics.ts` hardened with two new runtime guards (see Review below).
- `tools/spike-1/scene.ts`, `tools/spike-1/index.html`, `tools/spike-1/browser.ts`,
  `tools/spike-1/measure.mjs` — the harness, dev page, and CDP measurement runner
  (`browser.ts`'s `runFrames`/`nearestRankP95` exported for unit testing;
  `measure.mjs` hardened for CLI-arg validation, launch-error handling, and profile-dir
  cleanup — see Review below).
- `test/spike-1.test.ts`, `test/sim-boundary.test.ts`, `test/spike-1-browser-guard.test.ts`
  (new during review), `test/util/list-files.ts` — 122 tests total, all passing.
- `docs/spikes/spike-1.md` — the results document.
- This spec file — `status`, `baseline_revision`, `deferred`, `followup_review_recommended`,
  Review Triage Log.

**Review findings breakdown** (full detail in `## Review Triage Log` above): 4 review
layers (blind-hunter, edge-case-hunter, verification-gap, intent-alignment) run in
parallel against the diff since `baseline_revision`. 14 findings triaged `patch` and
fixed in this pass (2 high, 5 medium, 7 low — including two genuine correctness/reliability
bugs: `PlayerPhysics.addStaticHitObject()` silently excluding a static shape from
collision detection after `finalizeStatics()`, and the AD-15 solver constants having zero
test coverage, empirically demonstrated by mutating two of them with `pnpm test` staying
green). 6 findings deferred to the spec's `deferred:` frontmatter (1 medium, 5 low) for the
lead to harvest into `deferred-work.md`. 4 findings rejected (out of scope, already
pre-adjudicated, or superseded by a `patch` item). 0 `intent_gap`, 0 `bad_spec` — no spec
amendment or code-revert loopback was needed.

**Follow-up review recommendation:** `true` — 2 patched findings were `high` severity
(the AD-15 constants gap and the silent static-exclusion bug), which alone crosses the
threshold regardless of the `3×medium + 1×low` score (which independently computes to
`3×5 + 1×7 = 22`, also over the `>= 5` bar).

**Verification performed:**
- `pnpm install` — exit 0, `pnpm-lock.yaml` written, pnpm self-provisioned `11.24.0`.
- `pnpm typecheck` — `tsc --noEmit` exit 0, re-run after every code edit in this pass.
- `pnpm test` — exit 0, 122/122 tests passing (117 at implementation handoff, +5 added
  during review: the AD-15 constants pin, two `nearestRankP95` unit tests, and the
  background-throttle guard's non-rejecting case was already present — net new files
  `test/spike-1-browser-guard.test.ts`). Node per-tick mean/p95 confirmed printing on a
  plain `pnpm test` run (required adding `reporters: ['verbose']` to `vitest.config.ts` —
  Vitest 4's default reporter suppresses `console.log` from passing tests at this test
  count, which silently failed to meet the Verification section's literal expectation).
- Matrix Test Audit: all 11 I/O & Edge-Case Matrix rows confirmed covered by a passing
  test or a real executed command — including the "Background-throttle guard" row, found
  uncovered during the audit (`tools/spike-1/browser.ts` had top-level `document`/`window`
  access that threw under Vitest's Node environment) and fixed by guarding those accesses
  and adding `test/spike-1-browser-guard.test.ts`.
- `node tools/spike-1/measure.mjs --browser chrome` — exit 0, re-run independently by this
  stage (not just trusted from the implementation handoff) across 5+ invocations:
  3.5-3.9 ms, all individually under the 4 ms bar. Median (recorded): **3.90 ms**.
- `node tools/spike-1/measure.mjs --browser edge` — exit 0, re-run independently across
  10+ invocations: 3.6-4.5 ms, **3 of 10 individually exceeded 4 ms**. Median (recorded):
  **3.75 ms**. This variance is disclosed in full in `docs/spikes/spike-1.md` rather than
  masked behind a single favorable run.
- `git status --porcelain` — no untracked `node_modules/`/`dist/` entries, confirmed
  repeatedly through this pass.
- Manual inspection: `ATTRIBUTIONS.md` entry complete and precedes any ported file (order
  reconstructed from the implementation handoff's own account, since all changes landed as
  one working-tree diff prior to this stage's first commit); `docs/spikes/spike-1.md`'s
  four measurement rows, verdict, p95 method, "17 steps" derivation, deviation list, and
  ledger references all present; `src/sim/contracts/time.ts`'s provisional comment matches
  the spec's required wording verbatim; `deferred-work.md` confirmed unchanged.

**Residual risks:**
- The Edge PASS is thin (median 3.75 ms against a 4 ms bar, with individual runs on this
  host observed as high as 4.5 ms) — a slower machine, background load, or browser-version
  drift could tip it past the threshold in practice. Fully disclosed in the results doc;
  no code change can resolve host-level timing variance, and `TICK_HZ` is already marked
  provisional pending the author's own macOS-leg ratification.
- 6 items deferred (see `deferred:` frontmatter and the Review Triage Log) — none rise to
  a blocking severity for this story's own ACs, but the medium-severity one (the
  termination test not constructing a genuinely adversarial non-convergent input) is worth
  the lead's attention before Story 1.4+ builds further on this solver.
- This story's diff is large (~50 files, ~7,000 lines, mostly the vpx-js port) — the spec's
  own `warnings: ['oversized']` already flagged this; the review layers were run against
  the full diff (lockfile body elided for signal-to-noise) without chunking.

### Lead resolution of the HIGH-1 consequence (rework iteration 1, 2026-08-27)

Code review left the story `in-progress` on one open consequence: the gravity fix landed but the
browser legs had not been re-run, so the PASS verdict did not stand. Re-measuring is lead-side
work under this pipeline (ADR-tooled verification and smoke are never delegated to a spawned
subagent), so the lead closed it directly rather than through a dev re-spawn. Commit `1a5b5a2`.

**Re-measured on the corrected scene, production build** (`vite build` + `vite preview`, per the
amended AC): Chrome/Windows **1.8 ms** median, 8/8 runs under the 4 ms bar; Edge/Windows
**1.8 ms** median, 8/8 under. **PASS on the gating path**, ~14.9 ms of the frame left over.
`TICK_HZ` stays 1000 and stays provisional — Chrome/macOS and Safari/macOS gate and are unmeasured.

The re-measurement also produced three controlled same-session findings that revise earlier
conclusions in this spec and in `docs/spikes/spike-1.md` (full data there):

1. The gravity fix has **no measurable effect on browser p95** — pre-fix and post-fix builds
   measured alternately in one session both give 1.8 ms. It is a correctness fix, not a
   performance one. (The Node leg's 1.40x rise is real and unchanged; the two legs differ because
   Node times individual ticks over 10,000 samples while the browser times 17-tick frames over a
   window that is half quiescent — see finding 3.)
2. Dev page vs production build has **no measurable effect** — both 1.8 ms in one session. The
   earlier "the dev page is not a valid proxy" conclusion, drawn from a 0.4 ms cross-session
   delta, does not survive a same-session test. Measuring production remains correct practice, so
   the amended AC stands; its stated justification does not.
3. **This host's session-to-session variance is ~1.9x on byte-identical code** (3.50 ms vs 1.8 ms,
   same pre-fix build, different sessions), which dwarfs both effects above. Filed as an
   `escalated` ledger entry: no absolute p95 from this host should be treated as a
   characterization, and every later performance claim must be an A/B measured back-to-back in
   one session.

Also filed: the harness scene is near-quiescent for roughly half the measured window (total ball
speed 53.6 at the end of warm-up, ~1.4 from tick 6,000 of 11,220), so the recorded figure is a
floor rather than a characterization. Routed to Story 1.5, where a served ball on real geometry
gives a continuously-active workload. Deliberately NOT fixed here — redesigning the scene would
re-invalidate the baseline a third time.

Remaining open items are all ledger-tracked and none blocks the story: the two author-owned macOS
legs, the TICK_HZ ratification, and the two entries above.
