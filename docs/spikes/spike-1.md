# Spike 1 — the ported physics loop at 1 kHz over six bodies

Story 1.1. Measures whether a time-of-impact pinball solver stepping six balls at
1000 Hz fits inside a 60 Hz frame budget in a browser, before anything else in
Epic 1 is built on the answer.

## Verdict: **PASS** — by a narrow margin on the Edge leg

Both measured Windows paths clear the p95 ≤ 4 ms bar, but the margin is thin, not
wide: median p95 is 3.90 ms on Chrome and 3.75 ms on Edge, leaving as little as
0.1-0.25 ms of headroom on the median run and roughly 12.8 ms left in a 16.67 ms
frame for everything else (rendering, input, audio). `TICK_HZ` in
`src/sim/contracts/time.ts` is set to **1000**, marked **provisional** pending the
author's macOS leg (see References below). No solver re-tune is required to reach
PASS, but see "Repeat-run variance" below — this is a closer result than a single
run would suggest, and the author should read that section before treating the
margin as comfortable.

## Measurements

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
