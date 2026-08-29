---
title: 'Story 1.8: Replays, golden state hashes and CI parity'
type: 'feature'
created: '2026-08-29'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/story-1-8-sweep-mandate.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-nudge-the-tilt-bob-and-the-slam-sensor.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Nothing in the build can record or replay a session. `src/sim/contracts/replay.ts:41-54`
declares `ReplayHeader` / `Replay`, but **every field is type-only** — grep finds no producer for
`tableHash`, `assetHash`, `physicsVersion` or `physicsSeed`, and the only reference outside the barrel is a
type literal in `test/contracts.test.ts:289-301`. The state hash AD-15 defines exists once, **test-locally**,
in `test/loop-determinism.test.ts:36-68`, whose own header (`:13-17`) defers the shipped version to this
story. `test/replays/` holds only `.gitkeep`; `src/host/dev/` holds only `.gitkeep`. CI
(`.github/workflows/ci.yml:62-126`) runs no golden and no coverage, and 21 Blender-gated tests
(`test/export-py.test.ts:102`) skip on `ubuntu-latest`, so `tools/export.py`'s convex-hull wall-footprint
reduction is never exercised where it ships (`DW-64`).

**Approach:** Promote AD-15's hash to a shipped `src/sim/loop/replay.ts`; add record/play to `src/host/dev/`;
record five goldens under `test/replays/` and replay them in Node in CI; add a browser parity page under
`tools/`; and close the CI-parity gaps. **Sequenced first and blocking every golden: the test-vacuity and
architectural-invariant sweep** mandated by `story-1-8-sweep-mandate.md` — because a golden recorded over a
vacuous assertion promotes the masked defect to specification.

## Boundaries & Constraints

**Always:**
- **The sweep runs FIRST and BLOCKS.** No golden is recorded until the sweep's mutations have been run and
  the reds observed and recorded in this spec. This is the mandate's core requirement and its stated reason.
- **Every criterion naming a mutation is satisfied only once that mutation has been RUN and the red
  OBSERVED and recorded here.** A green suite is not evidence (epic context; Story 1.6's AD-5 incident;
  Story 1.7's repeat of it one story later).
- **Hash parsed structures, never raw file bytes.** `core.autocrlf=true`, and `.gitattributes` carries no
  rule matching `test/replays/**`. Measured proof: `public/assets/dragonwar.collision.json` begins `{\r\n`
  in the worktree and `{\n` in the HEAD blob. A byte-wise golden comparison is guaranteed to differ
  Windows-vs-CI.
- **A golden that breaks must say why.** The replay runner verifies `tickHz`, `tableHash`, `assetHash`,
  `physicsVersion` and the resolved tuning against the header BEFORE asserting the hash, and fails with a
  message naming which input changed and instructing a deliberate re-record. A golden whose break is
  mysterious gets re-recorded rather than questioned — the exact failure the mandate exists to prevent.
- **`physicsVersion` is derived from the pinned solver constants plus `TICK_HZ`**, so changing either
  invalidates every golden automatically (AD-15: "changing one is a physics-version bump that re-records
  every golden"; AD-3: a 480 Hz fallback re-records them).
- `sim/**` stays DOM-free, engine-free, wall-clock-free and unseeded-random-free (AD-1, AD-3, AD-16). The
  replay module is pure; all file I/O lives in `test/**` and `src/host/dev/**`.
- Provenance is a hard gate (CLAUDE.md, AD-16): every new authored file carries the GPL-3.0 header; no
  ported file is edited.

**Block If:**
- ~~AC 4's goldens cannot be expressed as `ReplayHeader + InputTransition[]`~~ — **RESOLVED 2026-08-29 by
  the user-authorized amendment; this Block-If no longer fires.** `epics.md` AC 4 now states that each
  golden carries a **declared coil prologue** alongside its `ReplayHeader + InputTransition[]`, recorded as
  data in the golden file and re-asserted on replay, with **Story 2.5** named as the owner that removes it
  and re-records. The same edit renamed `cradle-and-release` to **`hold-and-release`**. **Do not re-halt on
  this**, and do NOT resolve it instead by pre-building Story 2.5's ball lifecycle inside a determinism
  story. See `## Design Notes` -> "The AC 4 amendment (2026-08-29)".
- A new npm package would be required. `tools/check-attributions.mjs:54-60` merges `dependencies`,
  `devDependencies`, `optionalDependencies`, `peerDependencies` and `bundledDependencies`; `:75-80` matches
  each name against `ATTRIBUTIONS.md` and `:102-106` exits 1 on a miss. `ATTRIBUTIONS.md` is out of
  footprint and its one-time widening is spent. **This rules out `@vitest/browser`, every browser driver,
  and every coverage package.**
- An out-of-footprint file would have to change. `vite.config.ts`, `vitest.config.ts`, `.gitattributes`,
  `index.html`, `public/**`, `NOTICE` and `ATTRIBUTIONS.md` are all outside `src/**`, `test/**`, `tools/**`,
  `assets/src/**`, `.github/workflows/**`, `package.json`.

**Never:**
- Never widen Story 1.6's 1 s ball-on-bat bound, alter the `FlipperMover` / `FlipperHit` port, or re-place
  the ball in `test/flipper-collision.test.ts` — Story 2.1 needs that test's shape and placement intact to
  close `DW-72`.
- Never record a golden named "cradle", nor one whose ball-on-bat window reaches past ~1 s. This table
  cannot hold a cradle (`DW-72`); such a golden would encode roll-off as the cradle reference.
- Never fix `DW-70` (`deviceSlots` written by `sim/loop`, AD-7). It is a live, uncaught violation the sweep
  will legitimately rediscover — reference the existing entry, do not file a new one, do not expand scope.
- Never touch `DW-82` (`public/THIRD-PARTY-NOTICES.txt` / `NOTICE`): out of footprint, awaiting user
  authorization.
- Never build the dev **tuning panel** or hot-apply itself — Story 1.9's. This story delivers only the
  invalidation seam a hot-apply calls.
- Never re-record a golden to make a red test green. Re-recording is a deliberate, justified act.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hash determinism | Same header + body replayed twice | Identical state hash | No error expected |
| Golden replay in CI | `test/replays/*.golden.json`, Node | Recomputed hash equals recorded hash | Fails naming the golden and both hashes |
| Stale golden | Golden whose `physicsVersion` differs from current | **Fails before hashing**, naming `physicsVersion`, instructing a deliberate re-record | Never silently re-records |
| CRLF checkout | Golden checked out CRLF on Windows, LF on CI | Identical hash (JSON parsed, never byte-compared) | n/a |
| Two-ball golden | Two balls in play, colliding | Momentum transferred; separation never below one ball diameter | Fails naming the tick and the measured separation |
| Recording invalidated | `record()` in progress, then `invalidate()` | `save()` refuses and names the reason | Returns an error result; never emits a golden |
| Browser parity | Golden replayed in Chrome / Safari | `GameState` portion of the hash matches Node; ball positions asserted only in Node | Page reports per-golden PASS/FAIL, never a silent skip |
| Blender-free hull | Fixture polygon, no Blender | `_convex_hull_2d` exercised under plain `python3` | Skips only if no Python at all, and says so |
| Non-finite in state | `NaN` / `Infinity` / `undefined` reaches the canonicaliser | Rejected with a named path | Never silently collapsed to `null` by `JSON.stringify` |

</intent-contract>

## Code Map

**Read-only governing sources (do not edit):**
- `_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md` —
  the ADR registry (there is **no** `docs/adr/`). Read in the spine text this pass: **AD-15 at line 202**
  (the state-hash definition verbatim; `sim/loop/replay.ts` and `host/dev` are named in its Binds scope; its
  "Prevents" list includes "a golden that fails because Safari's `Math.sin` differs from V8's" — the reason
  browser parity is `GameState`-only); **AD-3 at line 85** (one clock; physics has no randomness; scatter 0;
  both seeds in the replay header); **AD-4 at line 91** ("A replay is `ReplayHeader + InputTransition[]` and
  must reproduce the state hash"); AD-5 line 116; AD-6 line 122; AD-7 line 128; AD-10 line 172; AD-14
  (`GameStart` is the one bundle into `sim/loop`); AD-16 line 208; **AD-17 line 214** (CI / ship).
- `_bmad-output/planning-artifacts/epics.md:609-647` — this story's six acceptance criteria verbatim,
  **as amended 2026-08-29** (AC 4's declared coil prologue and the `hold-and-release` rename; the change log
  sits under the story).
- `_bmad-output/implementation-artifacts/story-1-8-sweep-mandate.md` — the binding, user-approved sweep
  mandate. **Both parts are in scope**, and the mandate has been updated since the first plan pass: its
  coverage-instrumentation branch is now recorded BLOCKED with in-footprint substitutes endorsed; vacuity
  shape 8 gains Story 1.7's licence-header XOR; Part 2 records "pinning an invariant once does not keep it
  pinned" and "watch for assertions that compare a value against itself"; the burn-down story is **1.10**.
- `ATTRIBUTIONS.md` — **never edit**; the one-time widening is spent. Its existence gates every new package.

**Verified environment facts (measured across both planning passes — do not re-derive):**
- **No input transition can put a ball in play.** `src/sim/rules/index.ts:30` types
  `RulesStepResult.commands` as `readonly never[]` and `:52` returns `[]`, so the rules layer cannot issue a
  `CoilCommand` **at the type level**. A ball reaches the playfield only through
  `loop.pulseCoil('c_trough_eject')` (`src/sim/loop/index.ts:62,340`), a **dev-only escape hatch** whose own
  doc names Story 2.5 as its replacement (`src/host/loop.ts:36`). `InputAction`
  (`src/sim/contracts/input.ts:12-20`) has no member reaching a coil. **This is what the AC 4 amendment
  resolves** — each golden now declares its `pulseCoil` prologue as data. Do NOT re-halt on it.
- **No new npm package is possible.** `tools/check-attributions.mjs:54-60` merges five manifest keys;
  `:75-80` word-boundary-matches each package name against `ATTRIBUTIONS.md`; `:102-106` `process.exit(1)`.
  Run in CI (`ci.yml:103-104`) **and** as a real subprocess by `test/check-attributions.test.ts:23-32`
  expecting `status === 0`, so `pnpm test` goes red too. Consequence: **no `@vitest/browser`, no browser
  driver, no `@vitest/coverage-v8`.** Confirmed this pass: `package.json` `scripts` has exactly eleven
  entries and no coverage or browser script.
- **CRLF parity hazard is live and measured.** `core.autocrlf=true`; `.gitattributes` carries **no** rule
  matching `test/replays/**` and is out of footprint. Proof: `public/assets/dragonwar.collision.json` begins
  `{\r\n` in the worktree and `{\n` in the HEAD blob. **Goldens must be `JSON.parse`d, never byte-compared**
  — endorsed by the user without change. The same hazard applies to `DW-79`'s port-body hash manifest, which
  must therefore hash over normalised line endings.
- **`vite.config.ts:45-50` registers the two HTML entry points** (`index.html`, `tools/spike-1/index.html`)
  and is **out of footprint** — a new parity page cannot become a Vite build input. The in-footprint path is
  a `tools/` script driving Vite's programmatic API plus a local static server, following
  `tools/spike-1/{index.html,browser.ts}` + `tools/spike-1/measure.mjs` as the precedent.
- **`vitest.config.ts:8` is `include: ['test/**/*.test.ts']`** and is out of footprint, but needs no change:
  a new `*.test.ts` is discovered automatically and `*.golden.json` files are plain data.
- **Node 24 both sides** (CI `ci.yml:76` `node-version: 24`, floating on the latest 24.x; local v24.16.0).
  Floats are IEEE-754-identical across x64 Linux/Windows and `Math.fround` is used throughout
  (`src/sim/physics/math/float.ts:34,58`), but **V8's transcendental implementations are not specified
  across V8 versions** — pinning the CI Node version is the honest fix for a hash-exact golden.
- **`src/sim/physics/constants.ts` is a vpx-js PORT** (header `:1-20`), so `physicsVersion` must NOT be
  defined there. `test/sim-boundary.test.ts:83-93` `AUTHORED_FILES` lists the 9 authored physics files;
  `constants.ts` is not among them.
- **Scatter is 0 everywhere and there is no physics PRNG.** `src/sim/table/tuning.ts:90,104` set `scatter`
  to `entry(0, …)`; `src/sim/physics/ball/ball-hit.ts:67-71` `deterministicScatterUnit()` returns `0` as the
  stand-in for upstream's `Math.random()` draw, reached only at `:406-407` behind `scatterAngle > 1.0e-5` —
  **dead while scatter is 0**; `src/sim/physics/game/player-physics.ts:307,390` replaced upstream's two
  `Math.random() < 0.5` calls with `swapBallCollisionHandling`. `tools/boundary-lint.mjs:72` bans the
  `Math.random` token under `sim/**`. **AC 6 therefore has no counter to read** — see `## Design Notes`
  → "AC 6 has no PRNG to count".
- **`tools/boundary-lint.mjs` check (e) bans device-name literals (`c_`/`bd_`/`s_`) anywhere under `src/**`
  except `src/sim/table/dragonwar.ts`.** Any manifest authored under `src/**` must carry receiver and method
  names only. `test/**` is outside that scope.
- **`test/boundary-lint.test.ts:39` asserts the tool exits 0 on the real repo root.** Adding a lint rule the
  repo currently violates turns both `pnpm lint:boundaries` and that test red — so **`DW-70` cannot be
  pinned by a new boundary-lint rule.**

**The replay surface to build on:**
- `src/sim/contracts/replay.ts:30-54` — `GameStart` (`:30`), `ReplayHeader` (`:41`), `Replay` (`:51`).
  **Do not widen these** — AC 1 pins their shape; the prologue rides alongside in the golden file, not
  inside `Replay`. Note `:26-28` claims `sim/table/names.ts` binds `TTuning` to `ResolveTuningResult`;
  **it does not** (grep is empty) — a real, small gap worth closing.
- `test/loop-determinism.test.ts:33-68` — the hash to promote: `canonicalize()` (`:33-45`, recursive
  `Object.keys().sort()`), `quantize001Mm()` (`:47-49`, `Math.round(mm*100)/100`), `fnv1aHex()` (`:52-59`,
  32-bit, basis `0x811c9dc5`, prime `0x01000193`, `Math.imul`, `charCodeAt` — **UTF-16 code units**, hex
  **not zero-padded**), `stateHash(game, balls)` (`:62-69`, payload `{ game, balls }` with balls reduced to
  `{ id, pos }`). Its header `:13-17` hands this story ownership. `:71-135` is the loop-driving pattern a
  replay driver mirrors.
- `src/sim/loop/index.ts:52-70` the `Loop` interface (`advance` `:60`, `pulseCoil` `:62`, `setCoilEnabled`
  `:69`); `:186-189` `CreateLoopOptions` — **carries only `collisionDoc`, no `GameStart`**; `:191-214` the
  hard-coded initial `GameState`; `:216-248` `buildSnapshot()` (ball pos already in table mm at `:218`;
  `:230` fills `mechanisms.devices[name].slots`; `:245` sets `game: state` **by reference**); `:275-280` the
  `advance()` guards and the stable re-sort of pending transitions; `:286-288` the N=0 path returning the
  previous snapshot object unchanged; `:326-329` the `deviceSlots` overwrite that is `DW-70`; `:333` the
  `rulesStep(state, switchEvents, tick)` call.
- `src/sim/contracts/snapshot.ts:87-93` `Snapshot`, `:29-36` `BallSnapshot`, `:109-121` `FrameOutput` —
  **`FrameOutput` deliberately carries no `SwitchEvent`s** (`src/sim/loop/index.ts:117,142`), which is the
  whole of `DW-66`'s verification-shape problem.
- `src/sim/contracts/state.ts:137-145` `GameState` = `{ tick, phase, machine, players[], currentPlayer,
  modes[], rng }`; `:64-73` `MachineState` (`deviceSlots` at `:72`); `:92-105` `PlayerState`; `:114-119`
  `ActiveModeState` — **carries an open index signature `[key: string]: unknown`**, the single largest
  ambiguity for a shipped canonical encoder. `JSON.stringify` maps `NaN`/`Infinity` to `null` and drops
  `undefined` from objects, so the shipped canonicaliser must reject or normalise these rather than let them
  collide silently.
- `src/host/loop.ts:33-40` `HostLoop`, `:48` `createLoop()`, `:78-104` `tick()` — `:86` `drainTransitions()`,
  `:87` `loop.advance()`, `:91` `onFrame(output)`. **This is where a record tap and a play driver attach.**
  `src/host/boot.ts:44-61` and `:167` `window.__dragonwarBoot` is the existing dev affordance to extend.
  `src/host/dev/` holds only `.gitkeep`, whose text attributes replay record/play to Story 1.9 — **stale**;
  epics.md AC 3 assigns it here. `test/replays/` likewise holds only `.gitkeep`.

**The sweep, Part A — the AD-5 seam, and the registry the user directed:**
- `src/sim/physics/machine.ts` `step()` spans **`:124-177`**, `physics.step()` at **`:154`** (no arguments,
  returns void). Statement order, verified this pass: `:125-134` partition `commands` into `pulses` and
  `coilEnabled`; **`:140` `flipperMechanics.applyFrame(tick, frame, { l, r })`**; **`:141`
  `plungerMechanics.applyFrame(tick, frame, coilEnabled.c_autolaunch)`**; **`:145`
  `cabinetMechanics.applyFrame(tick, frame)`**; **`:147` `deviceMechanics.applyCommands(tick, pulses)`**;
  `:149-152` the `before` Map of one `fromPhysics()` per ball; **`:154` `physics.step()`**; `:156-167`
  `movements` (a ball absent from `before` hits `continue` at `:160-163`); `:169` `switchTracker.step()`;
  `:170` `deviceMechanics.detectEntries(tick, movements)`; `:172-176` the return.
- **LOAD-BEARING FINDING (new this pass): the three return channels spread in three different orders, and
  none of them is the call order.** `:173` `switchEvents` = command → plunger → cabinet → switchEdges →
  entry; `:174` `contactEvents` = flipper → command → plunger → entry; `:175` `semanticEvents` = command →
  plunger → entry. Each channel's order is hand-picked, is consumed in sequence by
  `rulesStep(state, switchEvents, tick)` (`src/sim/loop/index.ts:333`), and **will be hashed into this
  story's goldens**. This is why the registry must be a **manifest, not an executable array** — see
  `## Design Notes` → "The hardware-rule registry is a manifest, not an executable array".
- **The four participants' signatures are NOT uniform**, so no registry entry could call them without
  closures: `deviceMechanics` (built `machine.ts:100-106`, from `src/sim/physics/devices.ts:96`)
  `applyCommands(tick, commands: readonly PulseCommandLike[]) -> DeviceMechanicsResult`; `flipperMechanics`
  (`:107`, `src/sim/physics/flippers.ts:44`) `applyFrame(tick, frame, coilEnabled: Record<'l'|'r', boolean>)
  -> FlipperMechanicsResult {contactEvents}`; `plungerMechanics` (`:108`, `src/sim/physics/plunger.ts:36`)
  `applyFrame(tick, frame, enabled: boolean) -> DeviceMechanicsResult`; `cabinetMechanics` (`:109`,
  `src/sim/physics/cabinet/index.ts:72`) `applyFrame(tick, frame) -> CabinetMechanicsResult {switchEvents}`.
  Three take `frame`; one takes `pulses` computed inside `step()`; two take a `coilEnabled`-derived gate.
- Ordering pins that exist and their observables, read this pass:
  - flipper — `test/flipper-mover.test.ts:83` (assertions `:93-105`): `angleDeg` **unchanged at the press
    tick, changed at t+1**. Two-sided; mutation already demonstrated red. **Strong.**
  - plunger — `test/plunger.test.ts:55` (assertion `:71-76`): ball displacement on the release tick `> 1` mm
    against ~2.5 mm actual. ~50x margin. **Strong.**
  - cabinet — `test/cabinet-integration.test.ts:164` (assertion **`:191-194`**): paired control/nudged
    position delta `toBeGreaterThan(0)` against a measured **6.59e-5 mm**. Added by Story 1.7's commit
    `35636fe`. **Structurally sound, assertion weak** — see the verdict below.
- **`deviceMechanics.applyCommands()` at `:147` has NO ordering pin.** Third recurrence of the mandate's
  "pinning an invariant once does not keep it pinned". **Its observable exists and is sharp** (found this
  pass): the parking branch `src/sim/physics/devices.ts:220-239` calls `spawnBall()` -> `physics.addBall()`
  at 300 mm/s and emits an eject `ContactEvent` carrying the authored pose (`:238`, table mm). Run pre-step
  the ball is integrated by that same `physics.step()` and has moved **~0.29 mm** from the authored pose
  (`troughEjectSpeedMmPerS = 300` x `SECONDS_PER_TICK = 1e-3`; `test/machine-serve-drain.test.ts:333-347`
  already measures 293.25 mm/s at this exact tick). Run post-step it sits at **exactly** the authored pose.
  **Why the existing eject tests miss it:** `test/machine-serve-drain.test.ts:333` asserts `vel.y` inside a
  +/-10% band, and the mutated run's un-bled 300.0 vs 293.25 is *inside* that band. Green either way.
- **`test/cabinet-integration.test.ts:191-194` — verdict (refined this pass).** The "6.59e-5 is noise"
  reading is **wrong**: against table coordinates of order 1e3 mm that is ~1e-8 relative, eight orders above
  double precision, and the mutated value is *bit-identically* 0, so `> 0` does discriminate today. The real
  weakness is that **`toBeGreaterThan(0)` has no margin and no stated expectation** — any nonzero difference
  passes. Root cause of the small signal is by design: `src/sim/physics/cabinet/nudge-impulse.ts:26-27`
  ramps the impulse over `nudgeImpulseTicks` peaking halfway, so the rising-edge tick is near-zero
  acceleration. **Two dead ends, do not take them:** moving the pin to the impulse peak (~74x larger)
  *destroys* the discriminator, because by then the mutated run has also diverged and "exactly 0" no longer
  exists — the edge tick is the only tick where the mutation is bit-identical; and asserting "the cabinet
  energised" via the oscillator does not discriminate, since `applyFrame` runs within the tick either way.

**The sweep, Part B — invariants with no red test:**
- **AD-7 ownership clause — NO test**, and `DW-70` is the live violation. **Full flow established this
  pass:** `MachineState.deviceSlots` is declared at `src/sim/contracts/state.ts:72`; its producer is a
  **getter** at `src/sim/physics/machine.ts:184-198` that builds a **fresh object with fresh arrays on every
  read**; it is written into `GameState` at exactly two places, both in `src/sim/loop/index.ts` and both
  outside `rules.step` — `:206-214` (initial construction) and **`:326-329`** (per tick, overwriting
  `rulesResult.state.machine.deviceSlots` with `machine.deviceSlots` *after* `rulesStep` returns).
  `src/sim/rules/ball-controller.ts:19-43` **provably cannot change it**: both return paths (`:39-41` and
  `:42`) carry the same `deviceSlots` reference through. **There are ZERO readers of
  `GameState.machine.deviceSlots` anywhere in `src/**`** — it is write-only in production code and is read
  only by tests and by the state hash. See `## Design Notes` -> "DW-70 gets a red test".
- **AD-2's "rules never debounce" — NO test.** `test/loop.test.ts:336-360` pins the button-switch half only.
- **AD-14 — NO test, and a real gap:** `CreateLoopOptions` (`src/sim/loop/index.ts:186-189`) does not accept
  `GameStart`, so the replay header will embed a bundle the loop never consumed. Named mutation: change
  `header.gameStart.adjustments.pitchDeg` and observe the replay is unaffected.
- Pinned and verified: AD-1 / AD-3 / AD-16 via `test/boundary-lint.test.ts:45-65` (**all 10 rules have a
  red-path fixture**, asserting exit 2); AD-4 t+1 via `test/loop.test.ts:233`; AD-4 key codes via
  `test/host-input.test.ts:409`; AD-6 via `test/machine-serve-drain.test.ts:449-452`; AD-15 constants via
  `test/sim-boundary.test.ts:267`; AD-10 via `test/collision-loader.test.ts:97,855`.

**The sweep, Part C — the six owned ledger entries (read via `ledger.sh show` this pass):**
- **`DW-73`** (`status=routed`; note says **CLOSE ON EVIDENCE via mutation spot-check, not inspection**) —
  `test/machine-serve-drain.test.ts`; most load-bearing assertion `:501` (`ballsInPlay === 0` after drain),
  backed by `:451`. Mutation to run: drop `...entryResult.switchEvents` from the `switchEvents` spread at
  `src/sim/physics/machine.ts:173`, or short-circuit the trough-park branch in
  `src/sim/rules/ball-controller.ts`. **Also note `:474-486` hand-repositions the ball**, so the drain half
  proves geometry-below-the-flippers only — record that.
- **`DW-83`** (`status=routed`) — largely closed by Story 1.7's QA: same-tick multi-edge IS covered at
  `test/cabinet-slam.test.ts:252` (three actions on tick 1) and `test/cabinet-nudge.test.ts:275` (diagonal).
  **Residual:** never driven through `createLoop()` / `machine.step()` with a real `physics.step()`;
  `nudge_r` has no end-to-end ball-coupling test (`:349` checks cabinet velocity sign only). The mandate's
  own warning applies here — Story 1.7's `NUDGE_DIRECTIONS` had **no** test because every assertion compared
  the ball's delta against the same oscillator run that produced it; **the new test must not compare a value
  against itself.**
- **`DW-6`** (`status=open`) — `src/sim/physics/util/object-pool.ts`: `warned` `:50`, `skipped` `:55`
  (incremented `:84`, `:91`), all `private`, **nothing reads them**; exhaustion branch `:88-92` is
  `/* istanbul ignore next */`; `MAX_POOL_SIZE = 100` `:46`; **zero test references anywhere**. Reachable
  via `collision-event.ts:30,94`.
- **`DW-66`** (`status=routed`) — the two halves: `test/switch-zones.test.ts:106` (zone-tester half) and
  `test/machine-serve-drain.test.ts:449` (semantic half). A whole-run observable cannot see the raw edge
  (`FrameOutput` has no `switchEvents`), so it must observe `ball_launched` + `ballsInPlay`, or drive
  `machine.step()` in parallel as `test/cabinet-integration.test.ts:109-137` does. **The full-plunge golden
  is the natural place to pin both halves at once**, which is what the ledger note anticipates.
- **`DW-79`** (`status=routed`, `footprint: out-of-footprint`, one `occurrence` from Story 1.7) —
  `test/sim-boundary.test.ts` checks **headers only, never bodies**: `AUTHORED_FILES` `:83-93` (9 files),
  `VPINBALL_PORTED_FILES` `:113` (**three**: `cabinet/oscillator.ts`, `cabinet/nudge-impulse.ts`,
  `cabinet/plumb-bob.ts`), every other file under `src/sim/physics/**` (~40) defaulting to the vpx-js
  branch. **No vendored upstream copy and no checksum exists anywhere in the repo.** Provenance is a hard
  CLAUDE.md gate, so the reachable half is planned — see the task list and `## Design Notes`.
- **`DW-64`** (`status=routed`) — `test/export-py.test.ts:102` is the single `describe.skipIf(!blenderPath)`
  holding **21** `it()` blocks; the two hull pins are `:256-278` and `:280-293`. `tools/export.py:304`
  `_convex_hull_2d` and `:331` `_rotate_to_lexicographic_first` are **pure plain Python**; only the
  module-level `import bpy` (`:33`) and `from mathutils import Vector` (`:34`) block a plain `python3`
  import — and `test/export-py-version-gate.test.ts:60-74` **already writes a `bpy`/`mathutils` stub and
  injects `PYTHONPATH`** (`:87`), with `resolvePlainPython()` at `:31-39`. The precedent is in-repo and
  in-footprint.
- **`DW-82`** — its shipped-notice half is **already fixed by the lead**: `public/THIRD-PARTY-NOTICES.txt`
  now carries the vpinball block. The **residual** re-owned here is that `NOTICE` line 41 still reads "The
  remainder are not yet present" and lists vpinball, which is false. **`NOTICE` is NOT in any
  authorization.** No AC of this story requires closing it, so this is **not** a HALT — it is recorded with
  its observable and re-owned at the `ledger_adjudicated` gate. Never edit `NOTICE` silently.

**The sweep, Part D — vacuity candidates:**
1. `RulesStepResult.commands` asserted `toEqual([])` at `test/rules-devices.test.ts:131`,
   `test/loop.test.ts:54`, `test/flipper-mover.test.ts:44,92` **as an AD-5 "no rules round trip" proof** —
   it is `readonly never[]`, so the assertion holds for every possible implementation and proves nothing.
   **This is the worked template for the whole sweep**: a runtime assertion whose type makes the outcome
   impossible is vacuous. The lead's own Story 1.6 ADR verification cited it
   (`ad5_no_rules_round_trip=pass_commands_empty`) and has logged the correction.
2. Seven modules with **zero references in `test/**`**: `src/sim/physics/anim-object.ts`,
   `anim-slingshot.ts`, `line-seg-slingshot.ts`, `game/event-proxy.ts`, `hit-3dpoly.ts`,
   `util/object-pool.ts`, `src/sim/contracts/mode-view.ts`.
3. `state.machine.tilt.{tilted,slamTilted}` asserted **only ever `false`** despite Story 1.7 shipping a bob
   and a slam detector (`test/rules-devices.test.ts:29`, `machine-serve-drain.test.ts:419`,
   `ball-render.test.ts:38`, `contracts.test.ts:217,251`). Same shape: `multiball: null`,
   `ballSave.untilTick: null`, `rng: 0`. (Mandate shape 7 — a field only ever asserted at its default.)
4. `Snapshot.mechanisms.dropTargets` / `.spinner` hard-coded `{}` at `src/sim/loop/index.ts:236-237` and
   asserted `{}` — nothing distinguishes "empty in Epic 1" from "wired to nothing".
5. `test/cabinet-integration.test.ts:191-194` — `toBeGreaterThan(0)`, no margin, no stated expectation.
   Sibling inconsistency: `cabinet-nudge.test.ts:202-203` asserts at precision 3 what `:301-302` asserts at
   precision 6.
6. `src/sim/loop/index.ts:95-114` `buttonSwitchByAction()` enumerates by `settleClass === 'button'` and the
   name `'s_' + action`; a fifth button switch spelled otherwise silently gets no edge (**mandate shape 8** —
   a guard that encodes an assumption, correct today, wrong on the first exception).
7. No test asserts the **expected skip count** on the running platform, so coverage lost to a `skipIf` is
   invisible (`test/export-py.test.ts:102`, `export-py-version-gate.test.ts:76,143`,
   `blender-resolve.test.ts:117` — the last is win32-only, so local skips 21 and CI skips 22).

**The out-of-suite red-test precedent (found this pass — the mechanism `DW-70` needs):**
- `test/fixtures/solver-termination/{vitest.harness.config.ts,wedge.harness.ts}`, spawned by
  `test/solver-termination.test.ts:40-45` via `spawnSync(process.execPath, [vitest.mjs, 'run', '--config',
  HARNESS_CONFIG])`. Its own header states the rule: **a `*.harness.ts` file never matches
  `test/**/*.test.ts`, so no `exclude` entry is needed.** `tsconfig.node.json:31` also excludes
  `test/fixtures/**`, so a harness runs outside `pnpm typecheck` — **a real caveat, not a free lunch.**

## Tasks & Acceptance

**Execution — PHASE 0: the sweep (BLOCKING; no golden file is created until every task here is done).**

- `## Design Notes` (this spec) — **first task, before any code**: enumerate every `AD-*` invariant Epic 1
  claims, from the spine text and each Epic 1 spec's `### Governing ADs`, and for each one state the
  mutation that violates it. Write the table into `## Design Notes`. Every later Phase 0 task fills in one
  of its rows with an **observed** red.
- `src/sim/physics/machine.ts` (add a `PRE_STEP_HARDWARE_RULES` manifest) + new
  `test/hardware-rule-seam.test.ts` — the **hardware-rule registry the user directed**. A `const` array of
  `{ receiver, method, pinnedBy }` rows placed immediately above `createMachine` so an editor of `step()`
  sees it; **names only, no `c_`/`bd_`/`s_` literals** (boundary-lint check (e)). The test is table-driven
  over that manifest: split `machine.ts`'s `step()` source at `physics.step();` (comments stripped first —
  `:136-139` contains the literal string) and assert every `receiver.method(` appears in the pre-half and
  **not** in the post-half; plus one set-equality row cross-checking the manifest against the
  `const X = create…(` objects `createMachine` constructs, with a short explicit `NOT_A_HARDWARE_RULE`
  allowlist (`switchTracker` today). Run all four mutations, observe red, record each.
- `test/machine-serve-drain.test.ts` or a new sibling — **the fourth participant's behavioural pin**
  (`deviceMechanics.applyCommands()`): pulse `c_trough_eject`, advance exactly 1 tick, and assert the
  spawned ball has moved **> 0.05 mm** from the authored pose carried on the eject `ContactEvent`
  (expected ~0.29 mm; post-step ordering gives exactly 0). Structural and behavioural pins are both
  required — the manifest test catches a moved call site, this catches a deferred effect.
- `test/cabinet-integration.test.ts:191-194` — replace the bare `toBeGreaterThan(0)` with a band derived
  from the **measured** velocity delta of the same paired runs: `expected = |dv| * SECONDS_PER_TICK`
  (`src/sim/contracts/time.ts:87`), then assert `expected > 0` **first** (mandatory — without it a future
  change zeroing both dv and displacement passes vacuously) and the displacement within `[0.25x, 4x]` of it.
  Keep the pin on the rising-edge tick; do NOT move it to the impulse peak.
- `test/machine-serve-drain.test.ts` (`DW-73`) — **mutation spot-check, not inspection**: run the mutation
  named in the Code Map, confirm `:501` goes red, restore, record the observed failure. Also record that
  `:474-486` hand-repositions the ball, so the drain half proves geometry-below-the-flippers only.
- `test/rules-devices.test.ts`, `test/loop.test.ts`, `test/flipper-mover.test.ts` — replace the `commands`
  `toEqual([])` assertions used as an AD-5 proof with an assertion that can fail, or delete the claim and
  record in the test why the type makes it vacuous. Do not leave a vacuous assertion standing as a proof.
- New `test/module-coverage.test.ts` — **the in-footprint substitute for coverage instrumentation**
  (the attributions gate forbids the tool): a static import-reachability check over `src/**` using
  `dependency-cruiser` (already a devDependency, already used by `tools/boundary-lint.mjs`), asserting every
  module is reachable from a `test/**` entry point, with an explicit **visible allowlist** naming each
  knowingly-unreached module and its reason. Seeded from the seven modules in Part D. A newly unreached
  module then fails loudly.
- `src/sim/physics/util/object-pool.ts` + a new test (`DW-6`) — surface the exhaustion counters through a
  readonly accessor and drive the `:88-92` exhaustion branch (more than `MAX_POOL_SIZE` releases), asserting
  `skipped` and `warned` at **non-default** values. Closes `DW-6` and vacuity shapes 2 and 7 together.
- `test/cabinet-*.test.ts` (`DW-83` residual) — drive two nudge rising edges in one tick through
  `createLoop()` with a real `physics.step()`, and add the `nudge_r` end-to-end ball-coupling case. The
  `nudge_r` assertion must reference an **independent** expectation (the table-frame axis the key is
  declared to drive), never the oscillator run that produced the delta.
- `test/sim-boundary.test.ts` (`DW-79`) — add a **port-body freeze**: a manifest of content hashes for every
  declared ported file, computed over **normalised line endings** (the CRLF hazard applies here too), so any
  later edit to a port fails with a message requiring re-verification against the upstream pin and a
  deliberate manifest update. This does **not** prove byte-identity to upstream — that was verified by hand
  and vendoring upstream bytes is out of footprint — it pins drift from the verified state, which is the
  reachable half. Record the residual explicitly in the test's own header.
- New `test/fixtures/dw70-ad7/{ad7-device-slots.harness.ts,vitest.harness.config.ts}` + new
  `test/ad7-device-slots.test.ts` + a `check:ad7` script in `package.json` (**`DW-70`'s red test — a named
  deliverable, see `## Design Notes`**). The harness runs an AD-7-conforming reference loop beside the real
  loop and asserts `snapshot.game.machine.deviceSlots.bd_trough` equals what `rules.step` alone produced;
  it is **RED today**. The in-suite wrapper spawns it and asserts it fails **with content** (the message
  string and `bd_trough` both present in stdout), so `pnpm test` and CI stay green while the violation is
  named by a real, running, failing assertion. **Do not fix `DW-70`.**
- Findings the sweep cannot fix in footprint -> spec frontmatter `deferred:` with the mutation named as the
  observable. **Never a silent carry-forward.**

**Execution — PHASE 1: the shipped replay module (only after Phase 0).**

- `src/sim/loop/replay.ts` (new, authored, GPL-3.0 header) — promote `canonicalize` / `quantize001Mm` /
  `fnv1aHex` / `stateHash` from `test/loop-determinism.test.ts:33-68` verbatim in behaviour; add
  `gameStateHash()` (the `GameState`-only portion, for browser parity), `tableHash()`, `assetHash(doc)`,
  `PHYSICS_VERSION` derived from the pinned solver constants plus `TICK_HZ`, `buildHeader()`, and
  `runReplay()`. Reject non-finite and `undefined` values with a **named path** rather than letting
  `JSON.stringify` collapse them.
- `test/loop-determinism.test.ts` — re-point at the shipped module, deleting the local copy, so exactly one
  implementation of the hash exists.
- `src/sim/table/names.ts` — bind `GameStart` / `ReplayHeader`'s `TTuning` to `ResolveTuningResult`, which
  `src/sim/contracts/replay.ts:26-28` already claims and no code does.

**Execution — PHASE 2: record/play, goldens, browser parity, CI.**

- `src/host/dev/replay-recorder.ts` (new) — record and play attached at `src/host/loop.ts:86-91`; an
  `invalidate(reason)` seam and a `save()` that refuses once invalidated (AC 3). Exposed via
  `window.__dragonwarBoot` (`src/host/boot.ts:167`). Replace the stale `src/host/dev/.gitkeep` text that
  attributes this to Story 1.9.
- `test/replays/*.golden.json` (new) + `test/replay-goldens.test.ts` (new) — the five goldens
  (roll-and-drain, **hold-and-release**, full plunge, nudge coupling, two-ball collision) and their runner.
  Each golden file carries its **declared coil prologue** as data beside the header and body, and the runner
  **re-asserts the prologue on replay**. The runner verifies `tickHz`, `tableHash`, `assetHash`,
  `physicsVersion` and the resolved tuning **before** hashing, and fails with a message naming the changed
  input and instructing a deliberate re-record. `hold-and-release`'s ball-on-bat hold stays **well inside
  1 s**. The full-plunge golden also carries the `DW-66` observable (`ball_launched` + `ballsInPlay`).
- `tools/replay-parity/` (new) — the browser parity page plus a build/serve script using Vite's
  **programmatic** API (no `vite.config.ts` edit, no new package), following `tools/spike-1/`. Reports
  per-golden PASS/FAIL on the `GameState` portion, never a silent skip.
- `test/export-py-hull.test.ts` (new, `DW-64`) — a Blender-free unit test over fixture polygons, importing
  `_convex_hull_2d` / `_rotate_to_lexicographic_first` under a `bpy`/`mathutils` stub, following
  `test/export-py-version-gate.test.ts:60-87`. Skips only if no Python at all, and says so.
- `test/export-py.test.ts` (or a sibling) — assert the **expected skip count** for the running platform, so
  coverage silently lost to a `skipIf` becomes visible (Part D item 7).
- `.github/workflows/ci.yml` — pin `node-version` from the floating `24` to the exact version the goldens
  were recorded on (`ci.yml:76`), and add no step that needs Blender or a browser.

**Acceptance Criteria:**

- Given the sweep's invariant table in `## Design Notes`, when every mutation in it has been applied and the
  suite run, then each row records the **observed** red verbatim, and `test/replays/` still contains no
  golden file at that point.
- Given a fifth pre-`physics.step()` participant added to `machine.ts` without a manifest row, when
  `pnpm test` runs, then `test/hardware-rule-seam.test.ts` fails naming the unregistered receiver — and
  given any registered participant moved to after `physics.step()`, then the same test fails naming it.
- Given `deviceMechanics.applyCommands()` moved to after `physics.step()`, when the one-tick eject test
  runs, then it fails because the spawned ball sits exactly at the authored eject pose.
- Given `src/sim/loop/replay.ts`, when a replay is written, then its header embeds the whole `GameStart`,
  `physicsSeed`, `tickHz`, `tableHash`, `assetHash` and `physicsVersion`, and its body is the ordered
  `InputTransition[]` (AC 1).
- Given the same header, body and declared coil prologue, when the replay is run twice, then both runs
  produce the identical state hash (AC 2).
- Given a golden recorded on Windows and replayed on Linux CI, when the file is checked out with either line
  ending, then the recomputed hash is identical — because the runner parses JSON and never compares bytes.
- Given a golden whose `physicsVersion`, `tableHash`, `assetHash`, `tickHz` or resolved tuning no longer
  matches, when the runner runs, then it fails **before** hashing, naming the changed input and instructing
  a deliberate re-record.
- Given a golden file, when it is replayed, then its declared coil prologue is re-asserted as part of the
  run, and a golden whose prologue no longer reproduces fails naming the prologue (AC 4, as amended).
- Given a recording in progress, when `invalidate()` is called, then `save()` refuses and names the reason
  (AC 3). No consumer calls `invalidate()` in this story; the first is Story 1.9.
- Given the two-ball golden, when it replays, then momentum is transferred, no pair overlaps or sticks, and
  separation never drops below one ball diameter (AC 4).
- Given the parity page, when a golden is replayed in Chrome, then the `GameState` portion of the hash
  matches Node; ball positions are asserted only in Node (AC 5). The Safari leg is author-owned.
- Given any replay, when it runs, then `scatter` is 0 on every material and no `Math.random` token exists
  under `sim/**`, and the `scatterAngle > 1.0e-5` branch is asserted unreachable (AC 6, honest form).
- Given `pnpm test` on a machine with `python3` and no Blender, when it runs, then `_convex_hull_2d` is
  exercised (`DW-64`).
- Given the `DW-70` harness, when `pnpm check:ad7` is run, then it exits non-zero with a message naming
  `DW-70`, AD-7 and `bd_trough`; and given `pnpm test`, then `test/ad7-device-slots.test.ts` passes by
  asserting that failure's content — flipping red the day `DW-70` is fixed.

## Spec Change Log

- 2026-08-29 (lead, re-dispatch after the user's decision): the plan's `intent gap` is resolved by a
  user-authorized `epics.md` amendment (the fourth one-time widening, this amendment only). AC 4 now names
  a **declared coil prologue** carried alongside each golden's `ReplayHeader + InputTransition[]`, recorded
  as data and re-asserted on replay, with Story 2.5 owning its removal; and `cradle-and-release` is renamed
  **`hold-and-release`** with the hold kept inside the ~1 s stable window. Amended here: the fired Block-If
  in `## Boundaries & Constraints` (struck through so it cannot re-fire) and a new `## Design Notes`
  subsection carrying the amendment, the registry direction for the four-call seam, and the `never[]`
  vacuous-proof template. Frontmatter `status` reset `blocked` -> `draft` so the plan re-derives the spec
  around the preserved intent block. **`DW-82`'s shipped-notice half is already fixed** (the vpinball block
  is in `public/THIRD-PARTY-NOTICES.txt`); its residual — `NOTICE` still calling vpinball not-yet-present —
  is re-owned to this story with a named observable, but `NOTICE` is **not** in any authorization, so it is
  a `blocked` HALT if it turns out to be required. The burn-down story is **1.10**, not 1.9.
- 2026-08-29 (plan, second pass, post-amendment): re-derived around the preserved `<intent-contract>`, which
  is carried forward **verbatim and unedited**. The first pass's investigation is reused, not re-derived;
  it was **corrected and extended** in four places. (1) **The `machine.ts` return channels spread in three
  different orders, none matching the call order** (`:173`/`:174`/`:175`) — this is load-bearing and it
  changes the registry design from an executable array to a **manifest**, because an executing loop would
  silently reorder the `switchEvents` sequence that `rulesStep` consumes and that this story's goldens hash.
  (2) **The fourth participant's observable was found and is sharp** — the eject-spawned ball has moved
  ~0.29 mm from its authored pose after one pre-step tick and exactly 0 post-step, and the reason the
  existing eject tests miss it is that `machine-serve-drain.test.ts:333`'s +/-10% velocity band contains
  both 293.25 and the mutated 300.0. (3) **The cabinet assertion's weakness was re-characterised**: 6.59e-5
  mm is *not* numerical noise (~1e-8 relative), the mutated value is bit-identically 0, and the real defect
  is the missing margin and missing stated expectation — with two tempting fixes (move to the impulse peak;
  assert the oscillator) recorded here as **dead ends** so they are not re-attempted. (4) **`DW-70` can
  carry a real red test** — see the new `## Design Notes` subsection; this was an open question at the first
  pass and is now answered with the in-repo harness precedent. Added: the honest form of AC 6, and the
  finding that goldens recorded now bake `DW-70`'s value into the reference hash.

## Review Triage Log

_Empty — no review pass has occurred._

## Design Notes

### The AC 4 amendment (2026-08-29)

The plan stage HALTed `intent gap` and was right to: AC 1 and AD-4 define a replay as
`ReplayHeader + InputTransition[]`, but nothing in that body can put a ball in play, so all five goldens
would have replayed against an empty playfield. The constraint is **type-level, not behavioural** — verified
in the worktree by both the plan and the lead:

- `src/sim/rules/index.ts:30` types `RulesStepResult.commands` as `readonly never[]`, so the rules layer
  **cannot** issue a `CoilCommand` — not "does not yet".
- `InputAction` is closed at eight members (`flipper_l`, `flipper_r`, `plunger`, `nudge_l`, `nudge_r`,
  `nudge_up`, `start`, `menu`); none reaches a coil, and `start` reaches no serving path.
- `loop.pulseCoil()` is documented in-file as a dev-only escape hatch and is the only path a ball reaches
  the playfield; `src/host/loop.ts:36` already names Story 2.5 as its replacement.

**The user authorized amending `epics.md` AC 4** (the fourth one-time widening this epic, this amendment
only — it does not carry forward). Each golden now carries a **declared coil prologue** alongside its
`ReplayHeader + InputTransition[]`: the `pulseCoil` sequence that puts a ball in play, recorded **as data in
the golden file** and **re-asserted on replay**. **Story 2.5** removes the prologue when Start serves
through the rules layer, and re-records the goldens. **This Block-If is struck through in the intent
contract and must not re-fire.**

The rejected alternative is recorded so it is not revisited: having Story 1.8 implement the minimal
Start-to-serve rules path. That pre-builds Story 2.5's ball lifecycle inside a determinism story, and the
epic context states this epic's rules layer is "only the minimal step that runs after every physics step".

**The `cradle-and-release` -> `hold-and-release` rename rides on the same amendment.** Epic 1's placeholder
table cannot hold a cradle (`DW-72`, owned by Story 2.1, which authors the pocket): with no geometry beside
either flipper, a ball on a raised bat departs after roughly 1.2-1.9 s. A golden named "cradle" would freeze
roll-off *as* the cradle reference, and when Story 2.1 lands the pocket its breakage would read as
"re-record me" rather than "ask why". Keep the hold **well inside** the ~1 s window where behaviour is
stable, so this golden survives Story 2.1 intact. **A golden must not claim behaviour the table cannot
produce.** Do not disturb Story 1.6's cradle test in any way: never widen its 1 s ball-on-bat bound, never
alter the `FlipperMover` / `FlipperHit` port, never re-place the ball in `test/flipper-collision.test.ts`.

### The hardware-rule registry is a manifest, not an executable array

The user directed a registry, and it is the right call: `machine.ts`'s seam has **four** pre-`physics.step()`
participants and the fourth (`deviceMechanics.applyCommands()` at `:147`) is unpinned. That is the **third**
recurrence of "pinning an invariant once does not keep it pinned" — Story 1.6 pinned the flipper and
plunger; Story 1.7 added the cabinet rule unpinned (moving it after the step left 654 tests green); now the
device-command call. At three recurrences a structural fix beats a fourth hand-written test.

**But the registry must be a manifest — a list of names — and must NOT become an executable array that
`step()` iterates.** The reason is specific and load-bearing, and was found in this planning pass: `step()`
returns three event channels whose spread orders are **all different and none matches the call order**
(`:173` `switchEvents` = command/plunger/cabinet/switchEdges/entry; `:174` `contactEvents` =
flipper/command/plunger/entry; `:175` `semanticEvents` = command/plunger/entry). A loop collecting results
yields one order; preserving three would need per-channel ordering metadata in the registry — precisely the
general-purpose framework the user ruled out. And that sequence is consumed in order by `rulesStep`
(`src/sim/loop/index.ts:333`) and **will be hashed into this story's goldens**, so getting it wrong is a
silent behaviour change frozen into the reference. The four signatures are also non-uniform (three take
`frame`, one takes `pulses`; two take a `coilEnabled`-derived gate), so any executable entry would have to
hold a closure. The manifest changes nothing at runtime — zero risk to the 1 kHz hot loop — and that is the
deliberate trade.

Shape (keep it to this; a list plus one test, not a framework):

```ts
/**
 * AD-5's seam, as data: every entry is called from `step()` BEFORE `physics.step()`.
 * `test/hardware-rule-seam.test.ts` fails if any of them moves after it, or if a
 * mechanics object is constructed and not listed. Names only — never executed.
 */
export const PRE_STEP_HARDWARE_RULES = [
  { receiver: 'flipperMechanics', method: 'applyFrame',    pinnedBy: 'test/flipper-mover.test.ts' },
  { receiver: 'plungerMechanics', method: 'applyFrame',    pinnedBy: 'test/plunger.test.ts' },
  { receiver: 'cabinetMechanics', method: 'applyFrame',    pinnedBy: 'test/cabinet-integration.test.ts' },
  { receiver: 'deviceMechanics',  method: 'applyCommands', pinnedBy: 'test/machine-serve-drain.test.ts' },
] as const;
```

**What it guarantees, honestly.** A fifth participant written as `const fooMechanics = createFoo(…)` inside
`createMachine` fails the set-equality row immediately: the developer must either add a manifest row or
append to the visible `NOT_A_HARDWARE_RULE` allowlist, and that second choice is a deliberate edit rather
than a silent omission. Adding the row then forces the `it.each` row, and if the call later moves after the
step that row goes red for **any** participant without depending on physics sensitivity.

**What it does not guarantee — state these in the test's own header, do not oversell it.** (a) It only
catches a participant constructed as a `create*(…)` const inside `createMachine`; one built elsewhere or
inlined escapes the scan, and the allowlist — not the regex — is the place a developer would have to lie.
(b) It is a source-text check on `machine.ts` only: a participant that keeps its call site but buffers its
effect for the next tick passes, which is exactly why the four **behavioural** observables are not optional
decoration. (c) A sub-rule added inside an existing participant is invisible to both checks. (d) The check
is formatting-sensitive (it splits on `physics.step();` as its own statement and must strip comments first,
since `:136-139` contains that literal string) — a reformat surfaces as a clear failure, not a silent pass.

### DW-70 gets a red test — a named deliverable of this story

The user's direction: `DW-70` is a live, uncaught AD-7 violation, and a failing test that names it is
materially different at the merge gate from an escalated finding with no test — it may change whether the
user wants Epic 1 merged with it open. **This planning pass established that such a test is achievable**,
and it is planned. **Do not fix `DW-70`** (fix-risk is high and Story 2.5 is its natural home) and **do not
re-file it** (the ledger entry exists).

The proof is airtight rather than inferential. `src/sim/rules/ball-controller.ts:19-43` has two return paths
(`:39-41`, `:42`) and **both carry the same `deviceSlots` reference through**, so `rules.step` provably
cannot change `machine.deviceSlots`. Meanwhile `src/sim/loop/index.ts:326-329` overwrites it with the
physics machine's live view **after** `rulesStep` returns. So a 20-tick run after `pulseCoil('c_trough_eject')`
publishes `deviceSlots.bd_trough === [true,true,true,false]` in `GameState` while the rules layer alone
still holds `[true,true,true,true]`.

**Shape:** an AD-7-conforming reference loop beside the real one (the construction already exists at
`test/machine-serve-drain.test.ts:415-436`), asserting the two agree. It is **red today**. To keep `pnpm test`
and CI green while still producing a real running red, it goes in an **out-of-suite harness** using the
in-repo precedent (`test/fixtures/solver-termination/`): a `*.harness.ts` never matches
`test/**/*.test.ts`, so the harness runs only under its own config via a new `check:ad7` script in
`package.json` (in footprint), and CI — which runs a fixed list of scripts (`ci.yml:95-120`) — does not pick
it up. An in-suite wrapper spawns it and asserts it **fails with content**.

Two constraints on the implementation, both mandatory:

- **Scope the assertion to `bd_trough` only.** `bd_shooter` is non-parking and `src/sim/rules/devices.ts:52-57`
  emits nothing on its entry switch *closing*, so its slot is not derivable in rules until a new device
  event exists. A whole-record assertion would stay red even after a correct partial fix.
- **The wrapper must assert the failure's *content*, not just a non-zero exit.** Polarity-inverted tests are
  the vacuity class this epic keeps hitting, and `tsconfig.node.json:31` excludes `test/fixtures/**` so the
  harness gets **no typecheck coverage** — a stale import would otherwise make it "fail" for the wrong
  reason, silently. Assert the message string and `bd_trough` both appear in stdout. For the same reason,
  `it.fails()` is **rejected**: it passes on any throw and cannot tell "failed for the right reason" from
  "the test broke".

A static AD-7 rule was also evaluated and **rejected**: `test/boundary-lint.test.ts:39` asserts the tool
exits 0 on the real repo root, so a rule the repo violates turns both `pnpm lint:boundaries` and that test
red.

### The goldens bake DW-70's value into the reference hash — say so where the goldens live

`stateHash()` hashes the whole `game` tree, which includes `machine.deviceSlots`. Every golden recorded by
this story therefore freezes the **loop-written** value as the reference. If Story 2.5's fix is faithful the
values will be identical and nothing breaks — but the goldens are the artifact that will say so, and nobody
will know they were recorded over a known invariant breach unless it is written down next to them. **Record
this in `test/replay-goldens.test.ts`'s header and in each golden's own metadata**, naming `DW-70` and
Story 2.5. This is the mandate's own thesis applied to itself: the risk is not that the golden is wrong, it
is that its provenance is invisible to whoever sees it break.

### A vacuous proof this epic has been relying on

`RulesStepResult.commands` is asserted `toEqual([])` in four tests **as the proof of AD-5's "no rules round
trip"**. That assertion is vacuous by its own `readonly never[]` type — it can never fail. The lead's own
Story 1.6 ADR verification cited it too (`ad5_no_rules_round_trip=pass_commands_empty`) and has logged the
correction. The real pin is the ordering mutation test. Treat this as the template for the sweep: **a
runtime assertion whose type makes the outcome impossible is vacuous**, and this epic has at least one
shipped example. Its sibling shapes are in Code Map Part D, and the mandate's own additions apply: **a guard
that encodes an assumption** (item 6 — `buttonSwitchByAction()`), and **an assertion that compares a value
against itself** (Story 1.7's `NUDGE_DIRECTIONS`, which is why `DW-83`'s new `nudge_r` test must assert
against an independent expectation).

### AC 6 has no PRNG to count — assert the honest three things

AC 6 says "`scatter` is 0 on every material and the physics PRNG is never drawn, asserted by a test". There
**is** no physics PRNG: `deterministicScatterUnit()` returns `0` (`ball-hit.ts:67-71`), upstream's two
`Math.random() < 0.5` calls were replaced by `swapBallCollisionHandling`
(`game/player-physics.ts:307,390`), and `tools/boundary-lint.mjs:72` bans the `Math.random` token under
`sim/**`. So a test written as `expect(prngDraws).toBe(0)` would be **exactly the vacuity shape this
story's sweep exists to hunt** — a counter that can only ever read zero. The honest assertion is three
things: every material's `scatter` resolves to 0; the `Math.random` token ban holds (already pinned by
`test/boundary-lint.test.ts`'s red-path fixture, so it is a real failing-capable check); and the
`scatterAngle > 1.0e-5` branch at `ball-hit.ts:406-407` is unreachable under the resolved tuning. Write it
that way and say why in the test header. This is not an AC amendment — the AC is satisfiable as worded; it
is a note about which implementation of it is evidence and which is theatre.

### Governing ADs (Rule 6), read from the spine text

**AD-15 (line 202)** is the primary. Its rule text defines the artifact this story ships, verbatim:
"Physics is tested by replaying `test/replays/*.replay.json` (schema in `sim/contracts/replay.ts`) and
asserting the **state hash**: FNV-1a over canonical JSON of `GameState` plus ball positions quantised to
0.01 mm; goldens are recorded in Node in CI, and browser parity is asserted on `GameState` only." Its Binds
scope names `sim/loop/replay.ts` and `host/dev` — which is why the shipped hash goes to
`src/sim/loop/replay.ts` and record/play to `src/host/dev/`, not the other way round. Its Prevents list
contains "a golden that fails because Safari's `Math.sin` differs from V8's", which is the whole reason
browser parity is `GameState`-only and ball positions are asserted in Node alone.

**AD-4 (line 91)** — "A replay is `ReplayHeader + InputTransition[]` and must reproduce the state hash."
The amended AC 4 keeps the `Replay` type untouched and carries the prologue **alongside** it in the golden
file, so AD-4's sentence still describes the type; the Epic 1 deviation is that a golden needs one more
declared datum to be reproducible, and Story 2.5 removes it.

**AD-3 (line 85)** — one clock; `TICK_HZ` is provisional and "if spike 1 forces 480 Hz, that constant
changes and golden replays are re-recorded"; "Physics has no randomness: scatter is 0 on every material by
default"; "Both seeds are in the replay header." This is why `physicsVersion` is derived from the solver
constants and `TICK_HZ` rather than hand-written: the re-record obligation then enforces itself.

**AD-5 (line 116)** governs the seam and the registry. **AD-7 (line 128)** is the one this story pins with a
red rather than fixes. **AD-17 (line 214)** governs the CI half. **AD-16 (line 208)** governs provenance and
`DW-79`. **AD-2 (line 79)**, **AD-6 (line 122)**, **AD-14**, **AD-1**, **AD-10 (line 172)** are all in the
sweep's Part 2 scope and each needs a row in the invariant table.

### Why coverage instrumentation is not added

The mandate's original Part 1 said "propose adding it — in-footprint via `package.json` and the CI
workflow", and **the mandate now records that branch as BLOCKED with the reason**. Both files *are* in
footprint, but the dependency is not: every coverage package (`@vitest/coverage-v8`,
`@vitest/coverage-istanbul`, `c8`, `nyc`) is a new npm package, and `tools/check-attributions.mjs` fails CI
**and** `pnpm test` for any package with no `ATTRIBUTIONS.md` row. `ATTRIBUTIONS.md` is out of footprint with
its one-time widening spent. **The two in-footprint substitutes are the mandate's own and are endorsed:** a
static import-reachability check built on the already-attributed `dependency-cruiser` (which catches the
exact shape the mandate cites — "two modules with no executed test host" — statically rather than
dynamically, with a visible allowlist), and AC 5's own "browser test page" branch driven through Vite's
**programmatic** API under `tools/**` (`vite.config.ts` is out of footprint). The residual — statement-level
coverage inside a reached module — is a ledger entry, not a silent gap. A future epic with an
`ATTRIBUTIONS.md` widening should revisit the real tool.

### Integration ACs, Consumed-by and Consumes (Rules 1 and 2)

This story introduces two shared modules.

- `src/sim/loop/replay.ts` — **Consumed-by:** `test/replay-goldens.test.ts` and
  `test/loop-determinism.test.ts` (this story, real instances, not mocks); `src/host/dev/replay-recorder.ts`
  (this story); `tools/replay-parity/` (this story); **Story 1.9** (the feel ritual records and compares
  replays); **Story 2.5** (re-records the goldens without the prologue).
  **Consumes:** `src/sim/contracts/replay.ts`, `src/sim/contracts/state.ts`, `src/sim/contracts/snapshot.ts`,
  `src/sim/physics/constants.ts` (read-only, for `physicsVersion`), `src/sim/table/dragonwar.ts`,
  `src/sim/table/tuning.ts`.
- `src/host/dev/replay-recorder.ts` — **Consumed-by: Story 1.9**, whose dev tuning panel calls
  `invalidate()` on hot-apply. AC 3's hot-apply half therefore has **no consumer in this story**; the seam
  is tested here by calling `invalidate()` directly, and the first real consumer is Story 1.9.
  **Consumes:** `src/host/loop.ts`, `src/sim/loop/replay.ts`.

### Ledger

Owned and adjudicated at this story's `ledger_adjudicated` gate: `DW-6`, `DW-64`, `DW-66`, `DW-73`, `DW-79`,
`DW-83` — all six are planned in scope above, each with a named observable rather than an inspection.
`DW-82`'s residual is also owned here but **cannot be closed in footprint**: `NOTICE` is in no
authorization, no AC of this story requires it, so it is recorded with its observable (NOTICE marks
vpinball PRESENT since Story 1.7 with the same tag its vpx-js and Babylon entries carry) and re-owned at the
gate. Referenced but **not** this story's to fix: `DW-70` (live AD-7 violation — this story gives it a
running red test and nothing more), `DW-72` (owned by Story 2.1).

### Risk carried into implementation: AC 5's Safari leg

AC 5 names Chrome **and** Safari. Safari is macOS-only and this worktree is Windows; a Vitest browser run is
impossible in footprint (no new packages), so the AC's own "browser test page" branch is the path. Chrome is
runnable by the lead's per-story smoke; **Safari is an author-owned leg**, exactly as Spike 1's two macOS
gating legs were left author-owned and unmeasured while the story still closed. If the Safari leg is unrun
at story close it becomes a ledger entry with the observable named, not a silent pass. This is flagged as a
risk rather than an intent gap because the leg is measurable — just not by this agent on this platform.

## Verification

**Commands:**
- `pnpm typecheck` — expected: clean. Note `tsconfig.node.json:31` excludes `test/fixtures/**`, so the
  `DW-70` harness is **not** covered by this; its wrapper's content assertions are what protect it.
- `pnpm lint:boundaries` — expected: exit 0; `sim/**` stays DOM-free and random-free, and the new manifest
  carries no device-name literal.
- `pnpm check:headers` — expected: exit 0; every new authored `.ts` carries the GPL-3.0 header.
- `pnpm check:attributions` — expected: exit 0; **proves no new package was added**.
- `pnpm test` — expected: green, with the goldens, the sweep's new pins, and the inverted `DW-70` wrapper
  included. Baseline before this story: **659 passed / 21 skipped across 48 files** (the 21 are the
  pre-existing Blender-gated skips in `test/export-py.test.ts`).
- `pnpm check:ad7` — expected: **exit non-zero**, with `DW-70`, AD-7 and `bd_trough` in the message. This is
  the one command in this repo whose success criterion is a failure; it is deliberate.
- `node tools/replay-parity/serve.mjs` then open the printed URL in Chrome — expected: every golden reports
  PASS on the `GameState` portion.

**Manual checks (if no CLI):**
- Each mutation in the sweep's invariant table: apply, run `pnpm test`, **observe the red**, restore, record
  the observed failure verbatim in `## Design Notes`. A mutation asserted but not run is not evidence — the
  epic has one recorded case of its central ordering invariant being genuinely broken with 590 tests green,
  and a second one story later with 654 green.
- The four hardware-rule mutations specifically: move each of `machine.ts:140`, `:141`, `:145`, `:147` to
  after `:154` in turn, confirm both the manifest test and that participant's behavioural pin go red,
  restore.
- The Safari leg of AC 5, on the author's macOS machine.

## Auto Run Result

Status: ready-for-dev
Blocking condition: none

### What changed since the first plan pass

The `intent gap` that blocked the first pass is **resolved** by the user's `epics.md` AC 4 amendment and
does not re-fire; the Block-If is struck through in the preserved intent contract. No new intent gap was
found. AC 5's Safari leg and AC 6's absent PRNG were both examined against Rule 5 and **neither is an NFR
tripwire**: the Safari leg is measurable (just not on this platform, and Spike 1 set the precedent for an
author-owned macOS leg), and AC 6 is satisfiable as worded — what it needs is an honest implementation, not
an amendment.

### The three user directives are planned as deliverables

1. **The hardware-rule registry** is planned as a **manifest** plus one table-driven test, with the reason
   the executable-array form was rejected recorded so it is not re-attempted: the three return channels in
   `machine.ts` spread in three different orders, none matching the call order, and that sequence is hashed
   into this story's own goldens. The unpinned fourth participant gains a behavioural observable as well as
   a structural one.
2. **Goldens are JSON-parsed, never byte-compared** — endorsed and carried unchanged, and extended to
   `DW-79`'s port-body hash manifest, which has the same CRLF exposure.
3. **`DW-70` gets a running red test** and it is a named deliverable: an out-of-suite harness under
   `test/fixtures/`, a `check:ad7` script, and an in-suite wrapper that asserts the failure's *content* so
   `pnpm test` and CI stay green. It is scoped to `bd_trough`, and `it.fails()` was rejected as theatre.
   The violation is **not** fixed and **not** re-filed.

### The sweep is Phase 0 and blocks every golden

No golden file is created until every Phase 0 task has been run and its red observed and recorded. The
invariant-to-mutation table is the first task in the story, before any code. One further finding is recorded
prominently for the merge gate: because `stateHash()` covers the whole `game` tree, **every golden recorded
by this story bakes `DW-70`'s loop-written `deviceSlots` value into the reference hash** — harmless if
Story 2.5's fix is faithful, but its provenance must be written next to the goldens rather than left to be
rediscovered.

### Out-of-footprint items, recorded not actioned

`NOTICE` (`DW-82`'s residual) is in no authorization and no AC of this story requires it, so it is recorded
with its observable and re-owned at the `ledger_adjudicated` gate rather than halting the run.
`ATTRIBUTIONS.md`, `vite.config.ts`, `vitest.config.ts`, `.gitattributes`, `index.html` and `public/**` are
untouched, and the plan routes around each of them by design — no new npm package is required anywhere.
