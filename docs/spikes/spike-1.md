# Spike 1 — the ported physics loop at 1 kHz over six bodies

> ## ⚠ EVERY MEASUREMENT BELOW IS INVALIDATED — code review, 2026-08-27
>
> **The harness measured the wrong scene.** `tools/spike-1/scene.ts` built its gravity
> vector from the bare `DEFAULT_TABLE_GRAVITY` multiplier (`0.97`) instead of the
> `GRAVITYCONST`-scaled strength upstream actually feeds that formula. vpx-js's
> `lib/vpt/table/table-api.ts:156-158` settles it: the script-facing property is
> `get Gravity() { return this.data.gravity / GRAVITYCONST; }` and
> `set Gravity(v) { this.data.gravity = v * GRAVITYCONST; }`, so `TableData.gravity` —
> the value `PlayerPhysics.init()` uses — is already scaled. `GRAVITYCONST` (1.81751,
> "Earth gravity in VP units") was ported into `constants.ts` and then referenced by
> nothing, which is the tell.
>
> **Effect:** the six balls ran at **0.593 m/s² of down-slope acceleration instead of
> ~1.08 m/s²** — about 55% of a real 6.5° playfield. Fewer collisions per second means
> a materially lighter solver workload, so **every p95 in this document is optimistic**.
>
> **Measured cost of the correction** (Node leg, same host, 10,000 ticks, back to back):
>
> | Gravity | p95 ns/tick | Derived per-frame (p95 × 17) |
> |---|---|---|
> | As measured (0.97) | 171,300 | 2.91 ms |
> | Corrected (0.97 × GRAVITYCONST = 1.76298) | 240,500 | **4.09 ms** |
>
> That is a **1.40× rise in p95**, and it puts the Node cross-check *over* the 4 ms bar.
> The browser legs measure the same solver on the same scene and will move with it —
> and the recorded production-build margins were 3.50 ms (Chrome) and 3.70 ms (Edge)
> against a 4.00 ms bar, with a known Edge tail already at 4.3–4.4 ms.
>
> **`tools/spike-1/scene.ts` has been corrected.** The numbers in this document have
> **not** been re-taken — re-measuring needs the production build and both browsers, and
> the verdict it feeds is the author's call. Until the browser legs are re-run on the
> corrected scene:
>
> - The **PASS verdict below is not established.**
> - **`TICK_HZ = 1000` rests on an invalidated measurement.** It has deliberately been
>   left at 1000 rather than changed, exactly as the earlier Edge escalation was handled:
>   the fail branch bundles a solver re-tune, and both are the author's decision. See the
>   ledger entry "Author-owned: TICK_HZ ratification from Spike 1".
> - The re-run must also record **machine identification, browser versions and the run
>   date in the deciding table itself** — the AC requires them and the production-build
>   table below carries none of the three (they appear only in the superseded dev-page
>   section).
>
> Everything below is kept unedited as the record of what was measured and why it did
> not hold.


Story 1.1. Measures whether a time-of-impact pinball solver stepping six balls at
1000 Hz fits inside a 60 Hz frame budget in a browser, before anything else in
Epic 1 is built on the answer.

## Verdict: **PASS on the gating paths** — `TICK_HZ = 1000`, provisional

> **Read this first. The rest of this section, and the two sections after it, are
> SUPERSEDED.** They measured the Vite **dev page**, which turned out not to be a
> valid proxy for the frame budget. The deciding measurement is the
> **production build**, in
> [Production-build measurement, 2026-08-27](#production-build-measurement-2026-08-27-orchestrator--this-is-the-deciding-result)
> near the end of this document. The superseded sections are kept deliberately and
> must not be deleted: the dev-vs-production delta is itself a finding.
>
> **Current result** — production build, gating paths only:
> Chrome/Windows **3.50 ms** median (5/5 under the bar). Chrome/macOS and
> Safari/macOS **PENDING — author's legs**; both gate. Edge/Windows **3.70 ms**
> median (18/20 under) is **best-effort for this gate** and never decides the
> verdict, though Edge remains a fully supported browser.
> `TICK_HZ` = **1000**, provisional: two of the three gating paths are unmeasured.

### Superseded: the original dev-page verdict (kept for the record)

Both measured Windows paths clear the p95 ≤ 4 ms bar, but the margin is thin, not
wide: median p95 is 3.90 ms on Chrome and 3.75 ms on Edge, leaving as little as
0.1-0.25 ms of headroom on the median run and roughly 12.8 ms left in a 16.67 ms
frame for everything else (rendering, input, audio). `TICK_HZ` in
`src/sim/contracts/time.ts` is set to **1000**, marked **provisional** pending the
author's macOS leg (see References below). No solver re-tune is required to reach
PASS, but see "Repeat-run variance" below — this is a closer result than a single
run would suggest, and the author should read that section before treating the
margin as comfortable.

## Measurements (dev page — SUPERSEDED, see the production-build section)

| Path | Machine | Browser | p95 (recorded) | Date | Result |
|---|---|---|---|---|---|
| Chrome / Windows | `NOMAD`, Windows 11 Pro 10.0.26200, Intel Core i5-8259U @ 2.30GHz | Chrome 151.0.7922.174 | **3.90 ms** (median of 5 runs; range 3.5-3.9 ms) | 2026-08-27 | PASS (≤ 4 ms) |
| Edge / Windows | `NOMAD`, Windows 11 Pro 10.0.26200, Intel Core i5-8259U @ 2.30GHz | Edge 151.0.4129.107 | **3.75 ms** (median of 10 runs; range 3.6-4.5 ms) | 2026-08-27 | PASS (≤ 4 ms) |
| Chrome / macOS | — | — | PENDING — author's macOS leg | — | — |
| Safari / macOS | — | — | PENDING — author's macOS leg | — | — |

The two macOS rows are not an error: they are pre-adjudicated in
`_bmad-output/implementation-artifacts/deferred-work.md` under **"Author-owned:
macOS / Safari measurement legs"** (no macOS/Safari host exists on this cycle
host). No new ledger entry has been filed for them.

### Repeat-run variance (read before trusting the margin)

`node tools/spike-1/measure.mjs` was invoked repeatedly during implementation and
again independently during verification, back-to-back, same host, same idle
foreground window, no code changes between runs:

- **Chrome — 5 runs:** 3.9, 3.9, 3.9, 3.5, 3.8 ms. All 5/5 individual runs PASS.
- **Edge — 10 runs:** 4.5, 3.6, 3.7, 3.6, 3.8, 3.9, 4.5, 4.2, 3.7, 3.7 ms. **3 of
  10 individual runs (4.5, 4.5, 4.2 ms) exceed the 4 ms bar** — an isolated single
  invocation of the Edge leg is not a reliable PASS/FAIL signal on this host.

The recorded figures above are the **median of repeated runs**, not a single
invocation, precisely because a single run straddles the threshold on Edge.
Showing the arithmetic so it's independently checkable: Chrome's 5 runs sorted
are `[3.5, 3.8, 3.9, 3.9, 3.9]` — odd count, median is the middle (3rd) value,
**3.9**. Edge's 10 runs sorted are `[3.6, 3.6, 3.7, 3.7, 3.7, 3.8, 3.9, 4.2, 4.5,
4.5]` — even count, median is the mean of the two middle (5th and 6th) values,
`(3.7 + 3.8) / 2` = **3.75**. This is a documented measurement-protocol decision (the spec's Design Notes flags the
within-run p95 method as "a spec decision — the artifacts do not specify one";
the same applies here one level up, to how many across-run samples constitute
"the recorded number" when repeat runs disagree) — the median-of-N choice is
the implementer's, not a fabricated or extrapolated figure: every number that
went into it is a real, independently measured 600-sample browser run. The
author should treat this PASS as *provisional and thin*, not just because of the
macOS gap but because of this variance — a slower Windows machine, a background
task during the real game, or normal browser-version drift could tip Edge's
real-world p95 past 4 ms. This is exactly the kind of finding Spike 1 exists to
surface before Epic 1 builds further on `TICK_HZ = 1000`.

No root cause in the ported physics code was found for the Edge variance (the
solver's own `test/spike-1.test.ts` determinism assertion holds byte-identical
across repeated Node runs — see below — so the jitter is a browser/host
scheduling effect, not non-determinism in `src/sim/physics/**`). The likely
contributors: this host's CPU (a 4-core/8-thread ultrabook part) and, per
`Win32_ComputerSystem` reporting a placeholder manufacturer/model string, a
virtualized or otherwise non-bare-metal environment, either of which increases
susceptibility to scheduling jitter for a workload this tight (17 physics steps
must fit inside 4 ms — about 0.24 ms per step with zero slack for anything else
sharing the core).

### Node leg (informational — does not gate)

10,000 ticks, six balls, `process.hrtime.bigint()` around each tick (most recent
verification run):

- Mean: **86,020 ns/tick** (~86.0 µs)
- p95: **154,700 ns/tick** (~154.7 µs)
- Derived per-frame equivalent (`p95_tick x 17`): **2.63 ms** — comfortably under
  4 ms, consistent with (not a substitute for) the browser legs above.

Run-to-run variance on this host is roughly 85,000-93,000 ns mean / 154,000-168,000
ns p95, attributable to JIT warm-up and host scheduling jitter, not the solver
itself — see `test/spike-1.test.ts`'s determinism assertion, which holds exactly
regardless of timing noise. Per-tick `process.hrtime.bigint()` instrumentation
itself adds on the order of 100 ns per sample. Unlike the browser legs, every
observed Node run stayed well clear of the 4 ms-equivalent bar.

The same 10,000-tick Node run also logs the worst bounds/overlap values it
observed (`test/spike-1.test.ts`'s first two tests): worst bounds excess over the
nominal playfield edge ~0.013 VU, worst ball-ball overlap penetration ~0.006 VU —
both roughly two orders of magnitude under the tests' 2.0 VU tolerance ceiling.
That ceiling exists for a real, documented reason (the one-tick lag between a hit
being detected and `C_DISP_GAIN`'s partial positional correction fully resolving
it, verbatim upstream behaviour), but the observed numbers confirm it's headroom,
not something masking a near-miss.

## Reading the pass threshold

The story's AC states the p95 ≤ 4 ms bar for "every measured path," scoped (per
this story's Design Notes) to the **per-frame** browser figures — that is the
gating number. The Node leg reports **per-tick** cost, a different unit; it is
recorded above for its own value and as a derived per-frame cross-check
(`p95_tick x 17`), but it does not gate the verdict. This reading was left for the
author to overrule cheaply, and is echoed here for the same reason.

## p95 method

Nearest-rank on the sorted sample array: `sorted[Math.ceil(0.95 * n) - 1]`.

- **Browser**: 60 warm-up frames of `STEPS_PER_FRAME_60HZ` (`Math.ceil(TICK_HZ /
  60)`, computed from the same `TICK_HZ` in `src/sim/contracts/time.ts` used by
  physics itself) steps are discarded, then exactly 600 frames are measured
  (`n = 600`, index 569). Only the `step()` calls are timed
  (`performance.now()` immediately before the first step and immediately after
  the last of the frame's steps) — the page renders no 3D and does no DOM work
  inside the sample.
- **Node**: 10,000 ticks timed individually with `process.hrtime.bigint()`
  (`n = 10,000`, index 9,499).

Re-running this spike later with the same method (same warm-up/sample counts,
same nearest-rank formula) produces comparable numbers.

## "Why 17 steps"

At `TICK_HZ = 1000`, one 60 Hz display frame owes `1000 / 60 = 16.67` simulated
ticks. Because the fixed-step loop carries the fractional remainder from frame to
frame rather than discarding it (AD-4), the whole-step count a single frame can be
asked for varies — most frames owe 16 or 17, and 17 is the worst case. This
story's harness computes it as `Math.ceil(TICK_HZ / 60)` in
`tools/spike-1/scene.ts` rather than hardcoding `17`, so a change to `TICK_HZ`
(e.g. the 480 Hz fallback) keeps the derivation correct automatically
(`Math.ceil(480 / 60) = 8`).

## Background-throttle guard

`tools/spike-1/browser.ts` rejects a run if any two consecutive
`requestAnimationFrame` timestamps differ by more than 100 ms (a backgrounded or
occluded window throttles rAF and would otherwise silently corrupt the sample).
`tools/spike-1/measure.mjs` launches both browsers **headed** (never
`--headless`) with `--disable-background-timer-throttling`,
`--disable-backgrounding-occluded-windows` and `--disable-renderer-backgrounding`
for the same reason. Neither guard fired during any recorded run above.
`test/spike-1-browser-guard.test.ts` unit-tests the rejection directly (a fake
`requestAnimationFrame` feeds a controlled timestamp sequence including a
>100 ms gap), since a real backgrounding event isn't practical to trigger from
an automated Node-driven CDP run.

## Toolchain

`packageManager: "pnpm@11.24.0"` self-provisioned cleanly via corepack — the host
had pnpm 11.3.0 installed, and `pnpm install` silently fetched and used 11.24.0
with no fallback needed. No deviation to record here.

## Port deviation list

Every place this port is not a byte-for-byte, structurally-unchanged copy of
`vpdb/vpx-js` @ `e8a6d6f`. Grouped by cause; each ported file also carries its own
deviation comment at the point of change.

**Severed non-physics couplings** (AD-1: `sim/` is DOM-free and engine-free; the
same principle is applied here to vpx-js's table-loading, scripting and rendering
systems, not only to `lib/game/`):

- `hit-object.ts`: dropped `applyPhysics(data: IPhysicalData, table: Table)` — it
  resolved a material through `Table.getMaterial()` and then called the setters
  this story keeps (`setElasticity`/`setFriction`/`setScatter`); the harness (and
  DragonWar's future table tunables) call those setters directly.
- `ball-hit.ts`: `TableData` (`lib/vpt/table/table-data.ts`) replaced with the
  minimal structural `BallHitTableData` type (`{ tableHeight, globalDifficulty }`)
  — the only two fields this file reads.
- `ball-data.ts`: dropped `extends ItemData` (→ `BiffParser`, the `.vpx`
  binary-file parser) and the rendering-only fields (`color`, `environmentMap`,
  `frontDecal`, `decalMode`, `isReflectionEnabled`, `playfieldReflectionStrength`,
  `forceReflection`). Kept: `radius`, `mass`, `bulbIntensityScale`.
- `ball-state.ts`: dropped `extends ItemState` and its `Pool`-based
  `claim()`/`release()`/`clone()`/`diff()`/`equals()` lifecycle (VPX's
  live-editing/replication system) — this harness constructs each ball's state
  once, not per frame, so pooling the state object buys nothing. The hot-path
  pooling that **is** load-bearing (`Vertex3D`/`Vertex2D`/`Matrix2D`/
  `CollisionEvent` inside the collision math) is untouched.
- `ball.ts`: dropped `implements IPlayable, IMovable, IRenderable<BallState>,
  IScriptable<BallApi>` and everything that came with them — `EventProxy`
  wiring, `BallApi` (scripting), `BallMeshGenerator`/`BallUpdater`,
  `addToScene()`/`removeFromScene()`/`getMeshes()` (Babylon rendering),
  `setupPlayer()`/`getApi()` (VPX scripting), `oldVel` (write-only, from the
  unported `BallApi`) and the shared `idCounter` (the harness assigns each ball
  an explicit id). Kept: `id`, `data`, `state`, `hit`, the `coll` getter,
  `getMover()`, `getName()`.
- `event-proxy.ts`: `EventProxy` no longer holds a `playable: IPlayable` or
  dispatches into a `BallApi`/`IScriptable` emitter; `fireGroupEvent()` is a
  documented `TODO(story-1.3)` no-op seam. Never exercised by this story's scene
  (no switches, triggers or kickers), kept as a real method (not deleted) because
  `HitObject`/`BallHit`/`HitQuadtree` reference the `EventProxy` type
  structurally.
- `ihittable.ts`, `imovable.ts`, `iplayable.ts` (and their transitive `IItem`/
  `Player`/`Table` dependencies) are **not ported at all**: named in the Code Map
  as files "upstream physics files import," but once `Ball`'s interface
  implementations and `EventProxy`'s `playable` field are severed above, nothing
  in the closure imports them any more.
- `line-seg-slingshot.ts`: `Surface`/`SurfaceData` (`lib/vpt/surface/`) replaced
  with the minimal structural `SlingshotSurfaceData` type
  (`{ isDisabled, slingshotThreshold }`); the `surface` parameter was unused in
  the file body and is dropped entirely. Not exercised by this story's scene (no
  slingshot); ported to complete `lib/physics/`'s closure per the Code Map, for a
  later hardware-rule story to build on.
- `game/player-physics.ts` — the story's central deviation; see its own long
  in-file header comment for the full accounting. Summary: dropped `Table`,
  `PinInput`, `FlipperMover`, the timer system, the emulator hook, and every
  wall-clock/FPS bookkeeping field, replacing `updatePhysics()`'s host-driven
  frame loop with `step()` (`updateVelocities()` then
  `physicsSimulateCycle(PHYS_FACTOR)`, `PHYS_FACTOR` itself a verbatim solver
  constant); replaced `createBall()`/`destroyBall()` with `addBall()` (no
  `destroyBall()` — the harness never removes a ball); added
  `addStaticHitObject()` / `setPlayfieldHit()` / `setTopGlassHit()` /
  `finalizeStatics()` as the harness's way to populate what `init()` used to
  build from a `Table`. Hardening added during review (new DragonWar plumbing,
  not upstream behaviour): `step()` throws if `setPlayfieldHit()`/
  `setTopGlassHit()` were never called (previously a confusing "Cannot read
  properties of undefined" from deep inside `physicsSimulateCycle`), and
  `addStaticHitObject()` throws if called after `finalizeStatics()` (previously
  a silent no-op — the new shape would be pushed to the list but never added to
  the already-built octree, so a ball would pass straight through it with no
  error).

**Randomness and wall-clock substitutions** (AD-3: no unseeded randomness or
wall-clock inside `sim/`):

- `game/player-physics.ts`, `physicsSimulateCycle()`: both `Math.random() < 0.5`
  calls ("swap order of dynamic/static obj checks" and "swap order of contact
  handling") replaced with reads of `swapBallCollisionHandling` — a boolean the
  method already flips exactly once per while-iteration for the ball-ball
  collision order, so reusing it costs no new state and keeps replays
  byte-identical.
- `ball/ball-hit.ts`, `collide3DWall()`: the scatter draw (`Math.random() * 2 -
  1`) replaced with a `deterministicScatterUnit()` stand-in returning `0`. Dead
  code in every scene this story builds (scatter is 0 on every material, so
  `scatterAngle > 1.0e-5` is never true), kept because the literal `Math.random`
  token is banned under `sim/` regardless of reachability. A seeded PRNG in
  physics state is the eventual replacement, if scatter is ever enabled
  (Story 1.3+ territory per AD-3).
- `game/player-physics.ts`: dropped `now()`/`SLOW_MO` (`lib/refs.node`, a
  `performance.now()` wrapper) along with `updatePhysics()` — see above.
- `util/object-pool.ts`: dropped `setupDebug()`'s `setInterval`-driven stats
  print (opt-in, dead by default upstream too — `Pool.DEBUG = 0`) along with the
  rest of the debug/tracing path (see below).

**Relocated constants** (values unchanged, byte-for-byte, only their file moved):

- `FLT_MIN`/`FLT_MAX`: from `lib/vpt/mesh.ts:27-28` (a mesh-authoring file, out of
  scope) to this port's `constants.ts`. Needed by `math/vertex3d.ts`
  (`isZero()`) and `math/frect3d.ts` (`Clear()`).
- Ball-ball restitution `0.8`: extracted from its bare-literal use in
  `lib/vpt/ball/ball-hit.ts:303` into the named, exported, verbatim
  `BALL_BALL_RESTITUTION` constant in `constants.ts`, per this story's task list
  and AD-15.

**Headerless upstream files** — carried no licence header of their own at
`e8a6d6f`. Each is given the canonical vpx-js header (the unchanged block from
`lib/physics/hit-object.ts`) plus the port-marker line plus a third comment line
recording that the file itself had no header and that the licence was
established from the repository's other source files (see also
`ATTRIBUTIONS.md`):

- `lib/physics/constants.ts`
- `lib/physics/functions.ts`
- `lib/physics/collision-type.ts`
- `lib/physics/mover-object.ts`
- `lib/math/frect3d.ts`

**Not ported** (the transitive closure genuinely doesn't need them once the
couplings above are severed):

- `math/matrix3d.ts` and `Vertex3D`'s `multiplyMatrix()` /
  `multiplyMatrixNoTranslate()` methods (their only caller was `Ball`'s dropped
  render path) and `crossZ()`/`getRotatedAxis()` (only used by the unported
  flipper/gate/spinner movers).
- `math/vertex.ts` is trimmed to just the `Vertex` interface; `IRenderVertex`,
  `Vertex3DNoTex2`, `RenderVertex`, `RenderVertex3D` are mesh-rendering/VPX-buffer
  types nothing in the closure uses.
- `math/vertex2d.ts` drops the `RenderVertex` subclass, the buffer-reading
  `get()` static, and a commented-out `setTimeout(() => …, …)` debug line
  upstream left at the bottom of the file (the literal token is banned under
  `sim/` regardless of it already being dead/commented-out code).

**Known dormant/inherited quirks** (surfaced during review; not exercised by this
story's scene, so `pnpm test` cannot catch a future regression in them —
recorded here rather than silently left for a later story to rediscover):

- `game/player-physics.ts`'s `timeMsec` field is declared and initialized to `0`
  but nothing in this port ever advances it (upstream's dropped `updatePhysics()`
  was the only writer). It's read by the ported `line-seg-slingshot.ts`
  (`this.slingshotAnim.timeReset = this.physics.timeMsec + 100`) and
  `anim-slingshot.ts` (`this.timeReset < physics.timeMsec`). Harmless today — no
  slingshot is instantiated by this story's scene — but whichever future story
  wires up a slingshot needs to give `timeMsec` a real driver first, or the
  `iframe` flag it gates will stick `true` after the first trigger.
- `ball/ball-hit.ts`'s `isRealBall()` (`return !!this.vpVolObjs`) always returns
  `true` in this port: `vpVolObjs` is initialized to `[]` and only ever
  pushed/spliced, never set to a falsy value, so the "not a real ball" branch
  every caller (`hit-circle.ts`, `hit-3dpoly.ts`, `line-seg.ts`) guards against is
  currently unreachable. This mirrors upstream's own temporary-ball concept
  (physics/rendering-only balls that never get a real `vpVolObjs`), which this
  port doesn't build at all — kept verbatim rather than "simplified away" per
  this story's minimal-surgery approach; revisit if a later story adds temporary
  balls.
- `constants.ts`'s `DEFAULT_STEPTIME = 10000` and `DEFAULT_STEPTIME_S = 0.01` are
  each commented `// default physics rate: 1000Hz` in the pinned upstream source,
  but `0.01` s/step is 100 Hz, not 1000 Hz (`PHYSICS_STEPTIME`/`PHYSICS_STEPTIME_S`
  are the pair that's actually 1000 Hz). Transcribed verbatim per AD-15 — the
  *value* `PHYS_FACTOR` derives from it (`0.1`) is correct and already verified
  against upstream (see the spec's "Verified upstream facts") — but the comment
  itself is inherited upstream noise, not a transcription error introduced by
  this port. Flagged here so a future reader doesn't mistake it for one.

- `hit-line-3d.ts`'s `hitTest()` applies `this.matrix` to `ball.state.pos` **twice**
  (`:84-85`) and never applies it to `ball.hit.vel`, while still saving and restoring
  `oldVel` around the call — dead work unless the second line was meant to transform the
  velocity. The line geometry (`:59-61`) is built from a *single* application of the same
  matrix, so `HitLineZ.hitTest()` compares a doubly-rotated position, an untransformed
  velocity and singly-rotated geometry. **This is verbatim upstream at `e8a6d6f`** —
  byte-for-byte identical, confirmed by diffing against the pinned source — not a
  transcription slip introduced here, and AD-15/AD-16 forbid re-authoring it silently.
  Nothing in this story instantiates a `HitLine3D` (the harness scene uses only
  `HitPlane`, `LineSeg` and `HitPoint`), so it is untested and unexercised. **Story 1.4's
  collision loader is the first caller** and must decide deliberately whether to carry the
  upstream behaviour or fix forward as a recorded, ATTRIBUTIONS-consistent divergence.
- `game/player-physics.ts`'s `meshAsPlayfield` is declared `false` and never assigned
  (upstream's dropped `init()` was its only writer), so the two branches that read it —
  the playfield hit test at `:193` and `step()`'s guard at `:318` — are effectively
  unconditional. Same class as `timeMsec` above.
- `line-seg-slingshot.ts:100` contains a literal millisecond, `this.slingshotAnim.timeReset
  = this.physics.timeMsec + 100`. AD-3 says no literal millisecond belongs anywhere under
  `sim/` outside `tuning.ts`; AD-15 says ported solver files are transcribed verbatim.
  **The port wins here** — editing the line would be exactly the re-authoring AD-16 forbids
  — so this is a recorded AD-3 carve-out, not an oversight. It is unreachable today (no
  slingshot is instantiated, and `timeMsec` never advances), and Story 1.3's
  dependency-cruiser rules must whitelist ported files for ms literals or they will flag it.

**"Thick walls"**: the AC says "thick walls on all four sides" and AD-11 says "walls and
floor have real thickness", but the ported primitive set has no volumetric wall. Each side
is one zero-thickness `LineSeg` extruded from z=0 to `WALL_HEIGHT_MM` (50 mm), with a
`HitPoint` closing each corner. A swept time-of-impact solver cannot tunnel through a
`LineSeg`, so this is functionally equivalent for containment — the *height* is what stops
a ball hopping over — but it is a departure from the AC's wording and is recorded here.

**Rule 14 note**: every ported file's upstream bytes — copyright headers
included — are preserved exactly, non-ASCII and all, per AD-16 and the GPL grant;
this is the documented exception to escaping non-ASCII characters in newly
authored code.

**Tooling deviations** (not physics deviations, but load-bearing for measuring
correctly): `tools/spike-1/measure.mjs`'s first working version called
Node's `child.kill()` to tear down the launched browser between runs. Verified
empirically while building this runner: on Windows, Chrome/Edge fork into
several helper processes (GPU, renderer, crashpad, utility, ...), and
`child.kill()` left the entire tree running — the spawned PID and every child
survived. Fixed by shelling out to `taskkill /PID <pid> /T /F` (Windows) /
`process.kill(-pid, 'SIGKILL')` (elsewhere) instead, confirmed clean afterward
with `tasklist`. Three more issues surfaced during review, all fixed:

- The `--browser`/`--url`/`--exe` CLI flags accepted a missing value silently
  (`undefined` flowing into `spawn()`'s argv rather than a clear error) if the
  flag was the last argument. Each flag's value is now validated at parse time.
- `child.on('error', ...)` (fired if the browser executable can't be launched at
  all, e.g. a bad `--exe` override) used to `throw` directly inside the event
  handler — an uncaught exception outside the surrounding `try/catch`, crashing
  the process before its `finally` block's cleanup (`killTree`/`rmSync`) ever
  ran. It now rejects a promise raced against the main flow instead, so a failed
  launch hits the same catch/finally as every other failure. Verified by pointing
  `--exe` at a nonexistent path: exits 1 with a clear message, no crash.
  `main()`'s top-level call also gained a `.catch()`, so anything that throws
  before the `try` block is even entered (e.g. `mkdtempSync` failing) is a clean
  exit 1 rather than an unhandled promise rejection.
- The temp browser profile directory (`%TEMP%/dragonwar-spike1-<browser>-*`,
  ~50MB per run) was **not actually being cleaned up** — verified empirically:
  30 of them had accumulated during this story's own testing session before this
  was caught. Root cause: Windows can hold the just-killed browser's file
  handles on the profile for a few seconds (sometimes longer, under load) after
  `killTree()`'s `taskkill` resolves, so the immediate `rmSync` throws
  EBUSY/EPERM, which the original bare `try { rmSync(...) } catch {}` silently
  swallowed. Fixed two ways: (1) `rmSync` now passes Node's built-in
  `maxRetries`/`retryDelay` backoff, which closes most of the window; (2) every
  run also opportunistically sweeps `%TEMP%` for `dragonwar-spike1-*`
  directories left by *earlier* runs at startup, before launching anything —
  by then enough wall-clock time has necessarily passed that no handle on them
  can plausibly still be held, so this sweep is unconditional rather than
  retried. Together these mean at most one leftover directory can exist at any
  time (the current run's own, if its immediate retry loses the race), and it's
  guaranteed to be swept by the *next* invocation. Verified empirically:
  repeated runs after the fix converge to zero accumulation.

## References (no new ledger entries filed)

- `_bmad-output/implementation-artifacts/deferred-work.md` →
  **"Author-owned: macOS / Safari measurement legs"** — the two PENDING rows
  above.
- `_bmad-output/implementation-artifacts/deferred-work.md` →
  **"Author-owned: TICK_HZ ratification from Spike 1"** — the provisional
  `TICK_HZ = 1000` in `src/sim/contracts/time.ts`.

---

## Independent lead verification, 2026-08-27 — this CONTRADICTS the PASS verdict above

The epic-cycle lead re-ran the browser legs independently after the implement stage, on the
same idle host (CPU load 6%, no orphaned browser processes, dev server the only other load),
with no code changes between runs. **The Edge result did not reproduce.**

| Path | Runs | Median p95 | Range | Runs meeting p95 <= 4 ms |
|---|---|---|---|---|
| Chrome / Windows | 10 | **3.7 ms** | 3.5 - 3.8 ms | **10 / 10 (100%)** |
| Edge / Windows | 20 | **4.1 ms** | 3.8 - 4.6 ms | **7 / 20 (35%)** |

Edge, all 20 samples sorted (ms):
`3.8, 3.9, 4.0, 4.0, 4.0, 4.0, 4.0, 4.1, 4.1, 4.1, 4.1, 4.1, 4.2, 4.2, 4.2, 4.2, 4.2, 4.4, 4.5, 4.6`

Chrome, all 10 samples sorted (ms):
`3.5, 3.6, 3.6, 3.7, 3.7, 3.7, 3.7, 3.8, 3.8, 3.8`

### Why this is an engine difference, not session load

The five Chrome runs interleaved *after* the twenty Edge runs, in the same session, returned
3.7, 3.7, 3.8, 3.7, 3.8 ms — statistically flat against the five Chrome runs taken *before* the
Edge block. Chrome's mean per-frame cost rose only slightly across the session (1.44 -> 1.63 ms,
about 13%), while Edge's p95 sat a consistent ~0.4 ms above Chrome's throughout. A loaded host
would have moved both. It moved only Edge.

### Consequence for the verdict

The story's acceptance criterion reads: *"the spike passes if p95 <= 4 ms on **every measured
path**, fails otherwise."* On this measurement the Edge/Windows path does not meet it — the
median exceeds the bar and roughly two runs in three exceed it. **By the AC as written, Spike 1
FAILS on the Windows numbers**, which routes to the AC's own fail branch: `TICK_HZ = 480` and a
logged solver re-tune before Story 1.3.

The implement stage's Edge figures (median 3.75 ms, 10 runs) and the lead's (median 4.1 ms,
20 runs) were both taken honestly on the same host. Neither is wrong; the Edge leg simply sits
close enough to the threshold that the verdict flips between sessions. That instability is
itself the finding: **a metric that decides the project's core tick rate should not be one whose
pass/fail answer depends on which session measured it.**

### The 480 Hz fallback, estimated

Not measured directly (`STEPS_PER_FRAME_60HZ` is a compile-time constant in
`tools/spike-1/browser.ts`; varying it means editing source, which the lead did not do
mid-pipeline). Per-frame cost is very close to linear in step count, so a first-order estimate
from the measured per-step cost:

| Path | Measured p95 @ 17 steps (1 kHz) | Per-step | Estimated p95 @ 8 steps (480 Hz) |
|---|---|---|---|
| Chrome / Windows | 3.7 ms | 0.218 ms | ~1.74 ms |
| Edge / Windows | 4.1 ms | 0.241 ms | ~1.93 ms |

Both would clear the bar with wide margin at 480 Hz. Treat these as estimates, not measurements.

### Status

**Escalated to the author as an architectural fork before Story 1.3.** `TICK_HZ` remains at its
provisional 1000 pending that decision — it has NOT been changed to 480, because the fail branch
also mandates a solver re-tune, and both are the author's call. See the deferred-work ledger
entry "Author-owned: TICK_HZ ratification from Spike 1".

---

## Production-build measurement, 2026-08-27 (orchestrator) — THIS IS THE DECIDING RESULT

The two sections above measured the **Vite dev page**, which is what the story's original
acceptance criterion specified. The orchestrator then measured the **production build** — what
actually ships — on the same idle host (9% CPU, no stray browser processes), interleaving the
two browsers exactly as the lead did.

### Method

```
npx vite build tools/spike-1 --base ./ --outDir <scratch>/spike1-site/tools/spike-1
vite preview            # port 4174
node tools/spike-1/measure.mjs --browser <chrome|edge> \
     --url http://localhost:4174/tools/spike-1/index.html
```

Production bundle: 36 KB minified, 31 modules. Same harness, same host, `measure.mjs`
unmodified. One Chrome run failed to attach over CDP; it was discarded and not retried, so the
Chrome leg reports 5 samples rather than 6.

### Results

| Path | Runs | Median p95 | Range | Meeting p95 <= 4 ms | Gates? |
|---|---|---|---|---|---|
| Chrome / Windows | 5 | **3.50 ms** | 3.4 - 4.0 ms | **5 / 5 (100%)** | **yes** |
| Edge / Windows | 20 | **3.70 ms** | 3.0 - 4.4 ms | **18 / 20 (90%)** | no - best-effort |
| Chrome / macOS | — | PENDING — author's leg | — | — | **yes** |
| Safari / macOS | — | PENDING — author's leg | — | — | **yes** |

Chrome, all 5 production samples (ms): `3.4, 3.4, 3.5, 3.6, 4.0`

Edge, all 20 production samples (ms):
`3.0, 3.5, 3.5, 3.6, 3.6, 3.6, 3.7, 3.7, 3.7, 3.7, 3.7, 3.8, 3.8, 3.8, 3.9, 3.9, 3.9, 3.9, 4.3, 4.4`

**Known tail on Edge:** two of the twenty runs (4.3 and 4.4 ms) exceed the bar. Recorded, not
smoothed away. Edge is best-effort for this gate, so they do not change the verdict — but a
later story that tightens the frame budget should expect this tail to still be there.

### The dev-vs-production delta is itself a finding

| Path | Dev page | Production build | Delta |
|---|---|---|---|
| Chrome / Windows | 3.7 ms median, 10/10 under | 3.50 ms median, 5/5 under | -0.2 ms |
| Edge / Windows | 4.1 ms median, 7/20 under | 3.70 ms median, 18/20 under | **-0.4 ms, verdict flips** |

The dev page cost the Edge leg roughly 0.4 ms and flipped its pass/fail answer. Nothing was
wrong with the lead's dev-page measurement — the dev page is simply not a valid proxy for the
frame budget. **Measure the frame budget against a production build.** Story 1.2's size and
load-time numbers must come from the real production artifact for the same reason.

## Final verdict: **PASS on the gating paths**, macOS still PENDING

`TICK_HZ` in `src/sim/contracts/time.ts` is **1000**, set from the production numbers and still
marked **provisional**: two of the three gating paths (Chrome/macOS and Safari/macOS) are
unmeasured. Safari is the real remaining performance risk — it runs JavaScriptCore rather than
V8 and it **gates**; it has not been demoted.

Author decision, 2026-08-27: keep `TICK_HZ = 1000`; Chrome is the primary target; **Edge is
best-effort for the frame-budget gate only.** Edge remains a fully supported browser — it keeps
its place in Story 6.1's boot message and Story 6.6's release matrix. This is a perf-gate
carve-out, not a support-tier demotion; FR-54 and NFR-6 are unchanged.

---

## Post-fix re-measurement and a variance investigation, 2026-08-27 (lead)

Code review found that the harness fed `PlayerPhysics.setGravity()` the bare
`DEFAULT_TABLE_GRAVITY` (0.97) instead of the `GRAVITYCONST`-scaled strength upstream uses, so
the scene ran at about 55% of a real 6.5 deg playfield's down-slope acceleration. The fix is
correct and independently confirmed: `1 / GRAVITYCONST` = 0.550 exactly accounts for the
shortfall, and `g * sin(6.5 deg)` = 1.11 m/s^2 matches the corrected figure. Every measurement
above was taken on the under-gravity scene and had to be re-taken.

### Re-measured on the corrected scene, production build

| Path | Runs | Median p95 | Range | Meeting p95 <= 4 ms | Gates? |
|---|---|---|---|---|---|
| Chrome / Windows | 8 | **1.8 ms** | 1.7 - 1.9 ms | **8 / 8** | **yes** |
| Edge / Windows | 8 | **1.8 ms** | 1.7 - 1.9 ms | **8 / 8** | no - best-effort |
| Chrome / macOS | — | PENDING — author's leg | — | — | **yes** |
| Safari / macOS | — | PENDING — author's leg | — | — | **yes** |

Chrome (ms): `1.7, 1.7, 1.7, 1.8, 1.8, 1.8, 1.8, 1.9`
Edge (ms): `1.7, 1.7, 1.7, 1.8, 1.8, 1.8, 1.9, 1.9`

**PASS on the gating path, with wide margin** — about 14.9 ms of a 16.67 ms frame left over.

### But these numbers moved for a reason that is not the fix — read this

The corrected scene measured *faster* than the under-gravity scene did in earlier sessions
(1.8 ms against 3.50 ms), which is backwards: stronger gravity is a heavier workload. That
contradiction was investigated rather than reported as an improvement. Three controlled
experiments, all run back-to-back in one session on one host:

1. **Does the gravity fix change the browser p95?** Built the pre-fix `scene.ts` (from commit
   `6d2be83`) and the post-fix one side by side and measured them alternately, same session:

   | | Chrome p95 samples (ms) | Median |
   |---|---|---|
   | Pre-fix (under-gravity) | 1.6, 1.8, 1.8, 1.8 | 1.8 |
   | Post-fix (corrected) | 1.7, 1.8, 1.8, 1.8 | 1.8 |

   **No measurable difference.** The fix is a correctness fix, not a performance one.

2. **Is the dev page really a slower proxy than a production build?** Measured both in one
   session on identical code: dev `1.7, 1.8, 1.8, 2.0` (median 1.8) against production
   `1.7, 1.7, 1.7, 1.8, 1.8, 1.8, 1.8, 1.9` (median 1.8). **No measurable difference.**

3. **Does the scene stay representative for the whole measured window?** Probed total ball speed
   through a full 11,220-tick run. It falls from 72.3 at tick 0 to 53.6 at the end of the
   60-frame warm-up, 6.9 by tick 3,000, and about 1.4 from tick 6,000 onward — six balls
   creeping in the STATICTIME forced-advance regime. **Roughly half the measured window is a
   near-quiescent scene**, so the p95 reflects a short violent opening followed by a long quiet
   tail, not a steady-state pinball workload. Pre-fix and post-fix settle at the same rate, so
   this is a property of the harness, not of the fix.

### What actually moves these numbers: session-to-session variance

The same code measured on the same host in different sessions:

| Measurement | Session | Chrome p95 |
|---|---|---|
| Production build, pre-fix scene | orchestrator's | 3.50 ms |
| Production build, pre-fix scene | lead's (experiment 1) | 1.8 ms |
| Production build, post-fix scene | lead's | 1.8 ms |

**A 1.9x swing on byte-identical code.** That dwarfs every effect this document has attributed
to a code or build change. It follows that:

- The earlier conclusion that **"the dev page is not a valid proxy"** — drawn from a 0.4 ms
  cross-session delta — **does not survive a same-session test.** That delta was noise. Measuring
  against a production build is still the right standing practice, so the amended acceptance
  criterion stands; but its stated 0.4 ms justification is not reproducible.
- The earlier **Edge dev-page "failure"** (median 4.1 ms, 7/20 under the bar) and the implement
  stage's Edge PASS (3.75 ms) are the same measurement in two sessions. The Edge/Windows
  best-effort carve-out was decided on a difference this host cannot reliably resolve.
- **No single session's absolute p95 from this host should be treated as the characterization.**
  Across every session recorded here the figure has ranged roughly 1.6 - 4.6 ms, straddling the
  4 ms bar.

Likely cause: this is a 2018 mobile part (Intel Core i5-8259U, 4C/8T, 15 W) in a laptop, where
sustained-load thermal and power limits move single-thread throughput substantially, and the
measuring sessions differed in how much CPU work immediately preceded them. Not proven — nobody
instrumented package power or frequency — so it is offered as the likely mechanism, not a fact.

### Standing recommendation for every later performance story

Do not compare a number taken now against a number taken in another session. Any performance
claim on this host must come from an **A/B measured back-to-back in one session**, interleaved,
as experiments 1 and 2 above were. This applies directly to Story 1.2 (payload and load time),
Story 4.7 (Spike 2, the lightmap scaling envelope) and Story 6.6 (the browser matrix).

### Verdict after the fix

**PASS on the gating path**, comfortably, in this session. `TICK_HZ` stays **1000** and stays
**provisional**: Chrome/macOS and Safari/macOS are unmeasured and both gate, and this host's
variance means the Windows figure is a range rather than a point. Safari remains the real
outstanding risk.
