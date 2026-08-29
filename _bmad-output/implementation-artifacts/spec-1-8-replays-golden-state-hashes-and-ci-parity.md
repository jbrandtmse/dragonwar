---
title: 'Story 1.8: Replays, golden state hashes and CI parity'
type: 'feature'
created: '2026-08-29'
status: 'done'
baseline_revision: '0607eebef58986b0054b8dc918072781a0cd1aa3'
baseline_commit: '0607eebef58986b0054b8dc918072781a0cd1aa3'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/story-1-8-sweep-mandate.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-nudge-the-tilt-bob-and-the-slam-sensor.md'
warnings: ['oversized']
deferred:
  - id: 'AD-2-residual'
    finding: >-
      AD-2's "rules never debounce" has a red test for the button-switch half only
      (test/loop.test.ts:336-360). The whole-claim invariant -- that no debounce window
      is ever added anywhere inside sim/rules/** -- has no test. No Phase 0 task in this
      story's plan assigns a fix.
    observable: >-
      Mutation: add a debounce/settle window inside sim/rules/** (e.g. sim/rules/devices.ts
      or ball-controller.ts) and observe no test goes red.
  - id: 'AD-14-gap'
    finding: >-
      AD-14 requires GameStart (seed, tuning, adjustments, highscores) to be the one
      bundle the host hands sim/loop at game start. CreateLoopOptions
      (src/sim/loop/index.ts:186-189) does not accept a GameStart at all -- the replay
      header (this story's Phase 1) embeds the whole GameStart per AC 1, but the loop
      itself never consumes it. Real gap, not merely untested; no Phase 0 task in this
      story's plan closes it (widening CreateLoopOptions is out of this story's scope).
    observable: >-
      Mutation: change header.gameStart.adjustments.pitchDeg between two otherwise-identical
      replays and observe the replay is unaffected (the loop always uses TABLE.reference.pitchDeg).
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

### Review Findings

Code review 2026-08-29 (Tier 1, review mode `full`; four layers — Blind Hunter, Edge Case Hunter,
Verification Gap, Acceptance Auditor — all at full-opus, no model overrides, since
`_bmad/custom/model-overrides.yaml` does not exist). Baseline `0607eeb`; 50 files, +5932/-109.
**18 patch (3 high, 7 medium, 8 low) — all applied. 0 decision-needed. 4 defer (ledgered). ~24 dismissed.**
Every finding was read at its call site before rating; the three highs and the `hold-and-release`
measurement were reproduced by this reviewer directly, not taken on a layer's word.

Suite after patches: **823 passed / 21 skipped across 61 files** (from 810/21/61 — +13 tests, 0 new skips).
`pnpm typecheck` / `lint:boundaries` / `check:headers` / `check:attributions` / `build` / `check-dist` /
`size-budget` all clean; `pnpm check:ad7` still exits 1 naming `DW-70`, `AD-7`, `bd_trough` and both
disagreeing slot arrays; the parity page re-verified live in Chrome 152 — **5/5 PASS**, no console errors.

**Applied — high**

- [x] [Review][Patch] `serve.mjs` called `main()` at module scope while `test/replay-parity-logic.test.ts` imports it, so every `pnpm test` run booted a real Vite dev server inside a Vitest worker (reproduced: the worker logged Vite's own "(client) Re-optimizing dependencies" and bound port 5300), and any throw out of `main()` — an unrecognised worker argv entry, or a `server.listen()` refused by a sandboxed runner — set `process.exitCode = 1`, reddening a fully green suite for a reason no test reports. Added the standard entry-point guard; the direct run re-verified to still serve all five goldens. [tools/replay-parity/serve.mjs:145] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] The `hold-and-release` golden's "real contact" evidence was vacuous: `ball.pos.z > 15` is true with **no flipper input at all**. Measured — replaying the identical golden with empty transitions reaches z = **20.63 mm** against **19.62 mm** with the flipper, because the ball hops off the bottom wall on its own; the flag could never fail for the state its own message denied ("real contact, not a miss"). The golden is sound and was NOT re-recorded: replaced the flag with a paired no-flipper **control run** (the idiom `cabinet-integration` and `cabinet-nudge` already use), asserting the trajectories diverge by more than 5 mm across the hold window (measured **48.30 mm**, first exceeding 1 mm at tick 7394) and that the control's bat never leaves its 141 deg rest angle. [test/replay-goldens.test.ts:430-449] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] `test/ad7-device-slots.test.ts`'s three content assertions (`DW-70`, `AD-7`, `bd_trough`) are all satisfied by Vitest's FAIL header, which echoes the harness's own describe/it titles — and Vitest prints that header for **any** post-collection failure. The wrapper therefore distinguished only a collection failure from a real one, not "failed for the DW-70 reason" from "the harness broke", which is exactly what the file's own header claims and exactly the polarity-inverted vacuity this story exists to hunt. Added assertions on the two disagreeing slot arrays (`[true,true,true,true]` and `[true,true,true,false]`), which only the real comparison running to completion produces and which appear in no title. [test/ad7-device-slots.test.ts:50-52] — fix-risk low · in-story · spec-clear

**Applied — medium**

- [x] [Review][Patch] `runReplay()` range-validated `coilPrologue` only; `durationTicks`, `replay.transitions[].tick` and `checkpointTicks` were unguarded despite the identical hazard the prologue guard's own comment states. `frameInForceAt()` applies a pending transition as soon as its tick is reached, so a tick at or below 1 fires earlier than the golden declares and one above `durationTicks` never fires — either way the hash silently stops describing the declared scenario. Added `InvalidReplayRangeError` (integer plus range, named index) and four tests including a non-vacuity control. [src/sim/loop/replay.ts:303-311] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] `GOLDEN_NAMES` was a hardcoded five-element tuple while `serve.mjs` enumerates the directory, so a sixth golden would be judged by the browser page yet silently untested in Node and CI — the authoritative leg. Added a completeness test asserting the two views agree. [test/replay-goldens.test.ts:76] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] AC 5's parity hash is insensitive to three of the five goldens' own bodies, and that was invisible. Measured: replaying with empty transitions leaves `finalGameStateHash` unchanged for `hold-and-release` (`872c62ad`) and `nudge-coupling` (`d6dc07ef`), and `two-ball-collision` has no body at all — so the page can report 5/5 PASS while a browser applies no input. This is a **property of AD-15's deliberate GameState-only parity**, not a defect, and re-recording is forbidden; the fix is visibility. Added a table-driven falsifiability test with an explicit `PARITY_INERT` allowlist naming each reason, an empty-body branch, and a requirement that an inert golden's **full** Node hash still depends on its body. [tools/replay-parity/browser.ts:68] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] AC 1's header claim was proved only by `expect(header).toEqual(buildHeader(...))` — both sides produced by the same function with the same arguments, the mandate's own named "compares a value against itself" shape, in the test for the header AC. `buildHeader()` could hard-code `physicsSeed: 0` or strip `gameStart` fields and the suite stayed green. Added concrete-field assertions on `physicsSeed`, the whole `gameStart`, `seed`, `adjustments`, `tickHz` and `physicsVersion`. [test/replay-recorder.test.ts:48] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] The `onAdvance` try/catch in `src/host/loop.ts` — itself added by the previous review pass so a dev-only recording tap could not stop live gameplay — had no test: all three `onAdvance` cases pass non-throwing callbacks, so deleting the guard left them green. Added a throwing-tap case asserting the throw is swallowed, `onFrame` still runs that frame, and the loop stays armed. [src/host/loop.ts:104-115] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] `test/ac6-scatter-and-prng.test.ts` claim 3 computed `scatterAngle = value * globalDifficulty` **in the test** and asserted it at most `1.0e-5`, with `value` asserted `toBe(0)` one line above — `0 * g <= 1e-5`, arithmetically incapable of failing, and a re-implementation of `ball-hit.ts`'s formula rather than an observation of it (changing the real one to `scatterAngle += 0.5` left it green). Replaced with a source-text pin on `ball-hit.ts`'s actual lines; its complement is this story's own DW-79 port-body freeze. [test/ac6-scatter-and-prng.test.ts:73-76] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] DW-64's four hull tests sit behind `describe.skipIf(!pythonCmd)`, and this story's **own** skip-visibility test — written to close "coverage lost to a `skipIf` is invisible" — never covered them: on a Python-less machine the entire DW-64 deliverable skipped silently and every assertion still passed. Added a structural pin (4 cases), the `pythonAvailable` term in the `expectedSkips` formula, and the file to the nested run; also fixed the summary regex, which **required** an "N passed" segment and so would have failed for a formatting reason on an all-skipped run. [test/export-py-skip-visibility.test.ts:59-101] — fix-risk low · in-story · spec-clear

**Applied — low**

- [x] [Review][Patch] `src/sim/contracts/replay.ts` still named `ResolveTuningResult`, a type that has never existed — the exact false claim this story's Phase 1 task set out to make true. The binding was added (`names.ts` to `ResolvedTuning`) but the stale name survived in a new form. Corrected. [src/sim/contracts/replay.ts:27-28] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] `recordTransitions`'s doc claimed it is "a no-op ... after `save()`/`invalidate()`". It is not a no-op after `invalidate()`, and `test/replay-recorder-invalidation.test.ts` explicitly pins the opposite. Corrected, with the reason (`onAdvance` cannot be detached mid-recording). [src/host/dev/replay-recorder.ts:53-54] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] `src/host/boot.ts` cited "the golden-recording script under `test/replays/`" — no such script exists anywhere in the repository. Corrected to point at the golden headers themselves and to state that re-recording is a deliberate act, never routine. [src/host/boot.ts:210] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] The goldens ship as `*.golden.json` while AD-15's rule text and the spine's repo-layout tree both name `test/replays/*.replay.json`, with the deviation recorded nowhere. The name is defensible (the file is a deliberate **superset** of `Replay`, carrying the prologue, duration, hashes and notes) and load-bearing forward (Epic 6's playtest story lands `playtest-*.replay.json` in the same directory, which neither `GOLDEN_NAMES` nor `serve.mjs` picks up — correctly). Recorded next to the artifact, per this story's own provenance thesis. [test/replays/*.golden.json] — fix-risk low · in-story · spec-bound name, doc-only fix
- [x] [Review][Patch] The CRLF-vs-LF hash-identity test degenerated on the very platform it exists for: with `core.autocrlf=true` the bytes on disk are already CRLF, so replacing LF with CRLF produced CR-CRLF and the test compared CRLF against CR-CRLF, never LF against CRLF. Normalised to LF first, with a sanity assertion and an honest note that the property is structural (nothing byte-compares a golden) rather than discriminating. [test/replay-goldens.test.ts:115-118] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] `test/host-loop.test.ts`'s title claimed `onAdvance` runs "AFTER advance() but before onFrame observes anything new", but `onFrame` was an empty callback and no relative order was recorded. Added the ordering assertion the title promises. [test/host-loop.test.ts:338] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] The new `toBeLessThanOrEqual(expectedMm * 4)` upper bound was the only assertion in that block with no message, so an upper-bound failure reported a bare number with none of the derivation the comment above it explains. Added one. [test/cabinet-integration.test.ts:219] — fix-risk low · in-story · spec-clear
- [x] [Review][Patch] `PRE_STEP_HARDWARE_RULES.pinnedBy` was destructured only to be interpolated into a test title — the one field per manifest row carried at its declared value and never verified, while `receiver` and `method` are both checked against real source. Added an existence check. A stronger "the cited file mentions the receiver" check was tried and **correctly failed**: the four behavioural pins drive the seam through its public surface and should not name internals to satisfy a manifest check; that reasoning is recorded in the test. [test/hardware-rule-seam.test.ts:81] — fix-risk low · in-story · spec-clear

**Deferred — ledgered, not fixed here**

- [x] [Review][Defer] `DW-86` — AC 3's "play" half is undelivered: `src/host/dev` records but nothing replays a saved recording through the live host loop, and `start()` captures no start tick, so a mid-session recording's absolute ticks provably cannot reproduce against `runReplay()`'s fresh tick-1 loop. The AC's own *Then* clause (invalidate blocks save) **is** delivered and tested. Routed to `1-9-dev-tuning-panel-and-the-first-feel-ritual` — fix-risk **high** (needs a loop-reset seam `createHostLoop` does not have) · in-epic
- [x] [Review][Defer] `DW-87` — `PHYSICS_VERSION` hashes only the 13 AD-15-pinned constants, so editing `GRAVITYCONST`, `STATICCNTS`, `C_EMBEDVELLIMIT`, `C_TOL_RADIUS` or `C_EMBEDSHOT` breaks every golden as a bare hash mismatch instead of the named re-record signal. Not fixable here — widening the payload changes `PHYSICS_VERSION` and re-records all five goldens, which this story's Never rule forbids. Routed to `2-5-the-real-ball-lifecycle-serve-drain-and-ball-over`, which already re-records them. fix-risk med · in-epic
- [x] [Review][Defer] `DW-88` — `.gitattributes` carries no `eol=lf` rule for `test/replays/**`, so the CRLF hazard is worked around in four places and prevented in none. Out of footprint. Routed to `burndown`. fix-risk low
- [x] [Review][Defer] `DW-89` — `serve.mjs`'s middleware routes (index, collision, per-golden, and their 404 paths) have no automated test; only its two exported regexes do. Covered end-to-end today by the live Chrome smoke. Routed to `burndown`. fix-risk med · in-epic

**Notable dismissals** (~24 total; the ones worth a line)

- *"Events from the seeding `advance(0, ...)` are dropped"* — **false positive**: `owedTicks === 0` hard-returns an empty events array, so there is provably nothing to drop.
- *`canonicalize()` flattens `Date`/`Map`/`Set` to `{}` and has no cycle guard* — `wontfix-theoretical`: `GameState` is typed plain data and nothing in Epic 1 can place one there; a prototype check risks false throws on `TABLE`/`collisionDoc`. Reopen if a mode ever stores a non-plain object through `ActiveModeState`'s open index signature.
- *Header tuning comparison includes `source`/`confidence` prose, so a comment-grade edit re-records every golden* — **by design**: `resolveTuning()`'s output is the tuning identity, provenance fields included (AD-15), and the failure is a named `StaleReplayHeaderError`, not a mysterious break.
- *`module-coverage.test.ts`'s `toBeLessThan(allSrcFiles.length)` forbids full reachability* — `wontfix-theoretical`: `boot.ts` can never be import-reachable headlessly, and the assertion is today's deliberate non-vacuity guard.
- *The sweep AC's "each row records the observed red verbatim" vs 8 rows reading "pre-existing, re-run green"* — **by design / spec-bound**: the convention is stated in the spec's own prose immediately above the table. Reopens only via spec amendment.
- *`physicsSeed` and `gameStart.adjustments` are inert* — **handled elsewhere**: already carried as `AD-14-gap` in this spec's frontmatter `deferred:` list.
- Also dismissed: speculative subprocess timeouts, per-golden `collision.json` re-fetch in a dev tool, the auto-run unhandled rejection, hand-transcribed geometry literals (`DW-65` owns that class), `MAX_POOL_SIZE` mirroring, suite wall-time, whitespace-exact source pins (deliberate and documented), the missing `serve.mjs` npm script, `.nvmrc`/`engines`, and `AUTHORED_FILES_LOCAL` duplication (both drift directions already fail loudly).

**The ledger entries this story owns — adjudication evidence for the lead**

| Entry | Genuinely closed by delivered code? |
| --- | --- |
| `DW-6` | **Yes.** `object-pool.ts` gains two readonly accessors (deviation recorded in the port's own existing deviation list, provenance intact); `test/object-pool.test.ts` drives the `MAX_POOL_SIZE` exhaustion branch and asserts `warned`/`skipped` at **non-default** values, closing vacuity shapes 2 and 7 together. |
| `DW-64` | **Yes.** `test/export-py-hull.test.ts` exercises `_convex_hull_2d` and `_rotate_to_lexicographic_first` under a real plain `python3` with a `bpy`/`mathutils` stub — collinear, concave-L, triangle and the rotation helper. Ran green here, not skipped. Its own skip is now counted (patch above). |
| `DW-66` | **Yes.** The full-plunge golden drives `createLoop()` with real physics and asserts both halves together — `ball_launched` exactly once **and** `ballsInPlay === 1` — plus the ball crossing the lane divider. That is the whole-run observable the ledger note anticipated. |
| `DW-73` | **Yes, on evidence — re-run independently by this review, not inspected.** Dropping the `entryResult.switchEvents` spread from `machine.ts` reproduced exactly the predicted red: "ballsInPlay must settle back to 0 once the SAME ball parks: expected 1 to be +0". Reverted; `git hash-object` confirmed byte-identical to HEAD. Bonus datum: the `roll-and-drain` golden **also** caught this mutation (`743dc554` vs `160c8181`), so `DW-85`'s insensitivity is specific to the AD-5 fourth-participant mutation, as its own note says. |
| `DW-79` | **Yes, and it is the provenance gate CLAUDE.md requires.** `PORT_BODY_HASHES` pins all 41 declared ported files over normalised line endings, with completeness **and** staleness checks in both directions. The residual — it proves forward drift, not byte-identity to upstream — is stated in the test's own header, as the spec instructed. |
| `DW-83` | **Yes.** Both residuals closed: two nudge rising edges in one tick driven through the real `createLoop()`/`physics.step()` seam with per-axis divergence against a paired control, and a `nudge_r` end-to-end ball-coupling test asserting a **signed** direction against the independently declared table-frame mapping — not against the oscillator run that produced it, which was Story 1.7's own failure. |
| `DW-82` (residual) | **Not closed, and correctly not attempted.** `NOTICE` line 41 still calls vpinball not-yet-present. `NOTICE` is out of footprint and in no authorization; no AC of this story requires it. For the lead at `ledger_adjudicated`. |

**The three user-directed deliverables — all re-verified this pass**

1. `pnpm check:ad7` exits **1** with a real failing assertion naming `DW-70`, `AD-7`, `bd_trough` and both disagreeing arrays; the in-suite wrapper keeps `pnpm test` and CI green and now asserts content that no test title can supply. `DW-70` was **not** fixed.
2. `PRE_STEP_HARDWARE_RULES` is exported and referenced **only** by its test — grep-confirmed, `step()` untouched, zero runtime change. The three return channels still spread in their three hand-picked orders.
3. Goldens carry `coilPrologue` as data, are `JSON.parse`d and never byte-compared, and **no golden was re-recorded**: the one golden that looked wrong (`hold-and-release`) was fixed at the assertion, not at the data.

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

### 2026-08-29 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 11 (high 0, medium 5, low 6)
- defer: 0
- reject: 16
- addressed_findings:
  - `[low]` `[patch]` Spec's own "Implementation Results" claimed the build size shows "no change ... since none of them ship in dist/" — false: `src/host/boot.ts` statically imports `createReplayRecorder` from `src/host/dev/replay-recorder.ts`, which statically imports `buildHeader` from `src/sim/loop/replay.ts`, so that module's code (canonicalize/fnv1aHex/tableHash/assetHash/PHYSICS_VERSION) does ship in `dist/` (only `tools/replay-parity/` is excluded). Corrected the wording in `## Implementation Results`.
  - `[low]` `[patch]` `test/module-coverage.test.ts`'s `reachableSrcModules()` doc comment claimed "BFS" while the traversal uses `queue.pop()` (LIFO/DFS). Corrected the comment; traversal and result unaffected.
  - `[low]` `[patch]` `tools/replay-parity/serve.mjs`'s `listGoldenNames()` silently excludes any `*.golden.json` file whose name fails `GOLDEN_NAME_PATTERN`, with no diagnostic — violates the I/O matrix's own "Browser parity" row ("Page reports per-golden PASS/FAIL, never a silent skip") for a hypothetical future oddly-named golden. Added a `console.warn` naming the excluded file.
  - `[medium]` `[patch]` `runReplay()` never validated that a `coilPrologue` entry's `tick` falls within `[1, durationTicks]` — an out-of-range entry silently never fires, producing a hash that no longer reflects the intended scenario with no error (exactly the "mysterious break" class this story's Always-rules exist to prevent). Added a named-path validation that throws before replay starts.
  - `[medium]` `[patch]` `src/host/boot.ts`'s new replay-recorder wiring (the `onAdvance` closure calling `recordTransitions`, and the console-exposed `start()` building a default `GameStart`) has zero test coverage anywhere in `test/**` (confirmed by repo-wide grep) — `boot.ts` is DOM-only and allowlisted out of `module-coverage.test.ts`, text-scanned instead by `test/entry-html-csp.test.ts`, which never mentions `replayRecorder`. Added a source-text pin to `test/entry-html-csp.test.ts` asserting the wiring is present, following that file's existing pattern for `boot.ts`'s other DOM-only glue.
  - `[medium]` `[patch]` `tools/replay-parity/browser.ts`'s `runOneGolden()` hash-field comparison (the AD-15 cross-engine-safety choice: compare `finalGameStateHash`, never `finalHash`) and `serve.mjs`'s golden-name routing have no automated test, unlike the precedent this story explicitly follows (`tools/spike-1/browser.ts`'s equivalent non-DOM logic is unit-tested in `test/spike-1-browser-guard.test.ts` without a live browser). Added a focused non-DOM unit test for both.
  - `[medium]` `[patch]` The two-ball-collision golden's failure message named only the measured separation, not the tick, contradicting the intent-contract's own I/O matrix Error Handling column verbatim ("Fails naming the tick and the measured separation"). Added tick tracking alongside `minSeparationEver` and included it in the assertion message.
  - `[low]` `[patch]` The sweep's invariant-to-mutation table has no row for AD-15's second clause ("table tunables carry `source` and `confidence`... mutation: add a tunable with no `source`") — verified this pass that `TuningEntry<T>`'s `source`/`confidence` fields are structurally required by the type and by the sole `entry()` constructor, so the mandate's mutation cannot be expressed without a compile error (the same "type makes the outcome impossible" shape as `RulesStepResult.commands: readonly never[]`). Added a row recording this as type-enforced, no runtime mutation applicable.
  - `[medium]` `[patch]` `src/host/loop.ts`'s `tick()` calls `onAdvance?.(...)` inside the same `try` block guarding `loop.advance()`/`onFrame()`, whose `catch` stops the whole host loop (`running = false`) on any throw — a throwing dev-only recording tap (`onAdvance`) would take down live gameplay, which the catch's own doc comment scopes to "simulation or presentation" only. Wrapped the `onAdvance?.()` call in its own try/catch that logs and continues.
  - `[low]` `[patch]` `canonicalizeAt()` only rejected non-finite numbers and `undefined`; a `symbol` or `function` value (reachable in principle through `ActiveModeState`'s open `[key: string]: unknown` index signature, which this story's own Code Map already flags as "the single largest ambiguity for a shipped canonical encoder") would fall through and be silently dropped by `JSON.stringify`, matching exactly the class of failure this function exists to prevent. Extended the guard to reject `bigint`/`symbol`/`function` with a named path too.
  - `[low]` `[patch]` `tools/replay-parity/serve.mjs`'s `/dragonwar-goldens/collision.json` route calls `readFileSync` with no `existsSync` guard, unlike its sibling `.golden.json` route two lines below which returns a clean 404. Added the same guard.

## Design Notes

### The sweep's invariant-to-mutation table (Phase 0, task 1 -- written first, before any golden)

Every `AD-*` invariant Epic 1 claims (spine + each Epic 1 spec's `### Governing ADs`), the mutation
that would violate it, where it is pinned, and what happened when the mutation was actually run this
pass. Four mutations are freshly run and reverted THIS implementation pass (the hardware-rule seam's
four participants, individually); the DW-73 mutation is freshly run and reverted this pass; the DW-79
port-body-freeze mechanism is freshly probed (a throwaway edit to `hit-point.ts`, reverted) to prove it
actually discriminates; the AD-7 violation (`DW-70`) is given a real, running, out-of-process red this
pass (`pnpm check:ad7`, verified exit 1) rather than fixed. Rows marked "pre-existing, re-run green" are
pins this story did not newly author -- their own mutation was run and recorded by an earlier story
(cited below) and this pass re-ran the pinning suite to confirm it is still live, rather than re-deriving
the mutation from scratch a second time.

| AD | Rule (short) | Mutation | Pin | This pass |
|----|----|----|----|----|
| AD-1 | `sim/**` DOM-free, Babylon-free, no upward imports; `presentation/**` reads only `sim/contracts`+`sim/table`; `host/**` never imports `sim/physics`/`sim/rules`; no `@babylonjs/havok` anywhere | Import `document`/`@babylonjs/*`/upward from `sim/**`; import `sim/physics` from `presentation/**`; import `sim/physics`/`sim/rules` from `host/**` | `test/boundary-lint.test.ts` over `test/fixtures/boundary/**` -- one deliberately-violating fixture per rule | Pre-existing (Story 1.3). Re-run this pass: **78/78 green**, confirming every fixture still trips its own rule (`test/boundary-lint.test.ts`, `npx vitest run` this pass). |
| AD-2 | `sim/loop` owns the four button switches (`s_start`, `s_flipper_l`, `s_flipper_r`, `s_plunger`); rules never debounce | Button-switch half: emit a button edge from physics instead of the loop | `test/loop.test.ts:336-360` (`buttonSwitchEdges()` unit tests) | Pre-existing (Story 1.5/1.6). Re-run this pass: green. |
| AD-2 (residual) | "Rules never debounce" as a *whole-claim* invariant (beyond the button-switch half above) | Add a debounce window inside `sim/rules/**` | **none** | **NO TEST. Deferred** -- no Phase 0 task in this story's plan assigns a fix; recorded in frontmatter `deferred:`. |
| AD-3 | One clock (`TICK_HZ`, named only in `contracts/time.ts` + `table/tuning.ts`); no literal ms/tick-rate elsewhere under `sim/**`; scatter 0 on every material; no `Math.random` under `sim/**` | Name `TICK_HZ` elsewhere; author a literal `…Ms` binding outside `tuning.ts`; use `Math.random` under `sim/**` | `test/boundary-lint.test.ts` fixtures (`tick-hz-misuse.ts`, `literal-ms.ts`, `ms-literal-spellings.ts`, banned-global fixtures) | Pre-existing. Re-run this pass: green (same 78/78 run as AD-1). Scatter-0 / no-PRNG-draw is Phase 2's honest AC 6 test (below). |
| AD-4 | `advance(elapsedMs, transitions)`; a transition applies at *t+1* at the earliest via `frameInForceAt`; key codes never enter `sim/`; N=0 -> unchanged snapshot | Apply a command the same tick it was issued; import a key code into `sim/` | `test/loop.test.ts:233` (t+1 ordering); `test/host-input.test.ts:409` (key codes stay in `host/input`) | Pre-existing (Story 1.3/1.6). Re-run this pass (`test/host-input.test.ts` in the same batch as boundary-lint above): green. |
| AD-5 | Hardware rules (flipper, plunger, cabinet, device pulses) run *inside* the physics step, before `physics.step()`, gated only by coil enable/disable -- "no rules round trip" | Move each of the four `machine.ts` seam calls to *after* `physics.step()`, one at a time | **NEW this pass:** `test/hardware-rule-seam.test.ts` (structural, table-driven over `PRE_STEP_HARDWARE_RULES`) + four behavioural pins: `test/flipper-mover.test.ts` (t/t+1), `test/plunger.test.ts` (release-tick displacement), `test/cabinet-integration.test.ts` (nudge-tick displacement band, rewritten this pass), `test/machine-serve-drain.test.ts` (new fourth-participant eject-displacement pin) | **All four mutations RUN and REVERTED this pass**, each producing a real observed red -- see "Mutations run and reverted this pass" below for the verbatim failures. |
| AD-6 | Device counts = closed slot switches only; opening `s_shooter_lane` is the one "plunged" event; parking devices fill lowest-empty/eject-highest-filled | Drop `entryResult.switchEvents` from `machine.ts`'s spread (or short-circuit the trough-park branch in `ball-controller.ts`) -- `DW-73`'s own mutation | `test/machine-serve-drain.test.ts:501` (`ballsInPlay` settles to 0 after drain) | **RUN and REVERTED this pass.** Dropping `...entryResult.switchEvents` at `machine.ts`'s `switchEvents` spread produced: `ballsInPlay must settle back to 0 once the SAME ball parks: expected 1 to be +0`, at exactly `:501`. Also recorded (per the mandate note): `:474-486` hand-repositions the ball before the drain half runs, so this test proves geometry-below-the-flippers only, not a full autolaunch-to-drain trajectory. |
| AD-7 | `GameState` mutated only inside `rules.step` | Write to `GameState.machine.deviceSlots` from `sim/loop` outside `rules.step` (the CURRENT, shipped behaviour -- `DW-70`) | **NEW this pass:** `test/fixtures/dw70-ad7/ad7-device-slots.harness.ts` (out-of-suite, via `pnpm check:ad7`) + `test/ad7-device-slots.test.ts` (in-suite content-assertion wrapper) | **Confirmed RED this pass** (`pnpm check:ad7` exits 1; message contains `DW-70`, `AD-7`, `bd_trough`, and the two disagreeing `[true,true,true,true]` vs `[true,true,true,false]` arrays). Deliberately **not fixed** (Never rule) and **not re-filed** (ledger entry already exists). |
| AD-10 | Exactly one file (`sim/table/frames.ts`) converts units/axes between table, glb, physics and scene frames | A second file performs its own unit/axis conversion | `test/collision-loader.test.ts:97,855`; `test/frames.test.ts` | Pre-existing (Story 1.4/1.5/1.7). Re-run this pass (same batch): green. |
| AD-14 | `GameStart` (seed, tuning, adjustments, highscores) is the one bundle the host hands `sim/loop` at game start | Change `header.gameStart.adjustments.pitchDeg` and observe the replay is unaffected | **none** -- `CreateLoopOptions` (`src/sim/loop/index.ts:186-189`) does not accept a `GameStart` at all | **NO TEST, real gap. Deferred** -- the replay header (Phase 1) embeds the whole `GameStart` per AC 1, but the loop itself does not yet consume it; recorded in frontmatter `deferred:`. Not a Phase 0 task in this story's plan. |
| AD-15 | Solver constants verbatim, never tunable; state hash = FNV-1a over canonical JSON of `GameState` + ball positions quantised to 0.01 mm; port bodies traceable to upstream | Edit a pinned solver constant; edit a ported file's body | `test/sim-boundary.test.ts:267` (constants pin); **NEW this pass:** the same file's port-body-freeze block (`DW-79`, 41 declared ported files, normalised-line-ending SHA-256) | Constants pin pre-existing, re-run green this pass. Port-body freeze **probed this pass**: a throwaway one-line comment appended to `hit-point.ts` (reverted immediately after) flipped its hash-comparison test red (`expected 'a469d831…' to be '64c6c0e2…'`); the header-provenance test also caught the same probe (an unrelated, pre-existing check) — both confirm the mechanism discriminates a real edit. The hash-promotion itself (Phase 1) is this story's own new AD-15 artifact. |
| AD-15 (tunables) | Table tunables carry `source` and `confidence` (no bare/invented numbers) | Add a tunable via `entry()` with no `source` (or no `confidence`) | `TuningEntry<T>`'s own field declarations (`src/sim/table/tuning.ts:30-34`, both `readonly`, neither optional) + `entry<T>(value, source, confidence)`'s signature (`:36`, both parameters required, no default) | **Type-enforced, no runtime mutation applicable** — the same "type makes the outcome impossible" shape as `RulesStepResult.commands: readonly never[]` (Design Notes, "The sweep, Part D — vacuity candidates", item 1). Verified this pass by reading both declarations: `source`/`confidence` are structurally required, so a tunable missing either fails `pnpm typecheck`, not a runtime test. No mutation was run because none can compile; no red test applies. |
| AD-16 | Ported files keep upstream header + port marker; new files carry the DragonWar GPL-3.0 header; `check:headers`/`check:attributions` enforce this in CI | Strip a port's header; add an unattributed dependency | `test/sim-boundary.test.ts` header-provenance describe block; `tools/check-licence-headers.mjs` / `check-attributions.mjs` (+ their own test files) | Pre-existing. Re-run this pass: `pnpm check:headers` / `pnpm check:attributions` both **OK** against the current tree (including this story's own new/edited files); the header-provenance suite is part of the 99/99 green `test/sim-boundary.test.ts` run above. |
| AD-17 | CI runs typecheck/boundary-lint/headers/attributions/test/build/CSP/size on every push and PR; ship is `main`-only | Add a CI step that shells to Blender or a browser | `.github/workflows/ci.yml`'s own fixed script list (no such step exists); `test/spike-1-harness-boundary.test.ts` et al. | Governs Phase 2's CI-parity task (Node version pin); no new mutation needed -- the existing workflow already adds no Blender/browser step, which this story's Phase 2 task preserves rather than changes. |

**Mutations run and reverted this pass, verbatim (AD-5's four hardware-rule participants):**

1. **Flipper** (`flipperMechanics.applyFrame(...)` moved after `physics.step()`):
   `test/hardware-rule-seam.test.ts` -- `"flipperMechanics.applyFrame(" must appear before "physics.step();" in
   machine.ts's step(): expected '...' to contain 'flipperMechanics.applyFrame('`.
   `test/flipper-mover.test.ts` (t/t+1 pin) -- `the mover MUST have visibly moved by tick t+1 ...: expected 141
   not to be 141`.
2. **Plunger** (`plungerMechanics.applyFrame(...)` moved after `physics.step()`):
   `test/hardware-rule-seam.test.ts` -- same shape, naming `plungerMechanics.applyFrame(`.
   `test/plunger.test.ts` (release-tick displacement) -- `the plunge must be applied BEFORE physics.step() on the
   release tick ...: expected 0.006976495069691228 to be greater than 1`.
3. **Cabinet** (`cabinetMechanics.applyFrame(...)` moved after `physics.step()`):
   `test/hardware-rule-seam.test.ts` -- same shape, naming `cabinetMechanics.applyFrame(`.
   `test/cabinet-integration.test.ts` (nudge-tick displacement band, this story's own rewrite) -- `expected ~7.702e-5
   mm, got 0.000e+0 mm ...: expected 0 to be greater than or equal to 0.000019255870821507414`.
   Bonus confirmation (not a required pin, but both went red too): the two new DW-83-residual tests in
   `test/cabinet-nudge.test.ts` (diagonal-nudge-through-the-real-loop, and nudge_r end-to-end) both failed under
   this exact mutation as well.
4. **Device pulses** (`deviceMechanics.applyCommands(...)` moved after `physics.step()`):
   `test/hardware-rule-seam.test.ts` -- same shape, naming `deviceMechanics.applyCommands(`.
   `test/machine-serve-drain.test.ts` (new fourth-participant pin) -- `expected the ball to have moved measurably
   (>0.05 mm) ... Measured displacement: 0.000018 mm.: expected 0.000017647812972511636 to be greater than 0.05`
   (against the unmutated, passing measurement of **0.296120 mm**, captured this pass and matching the Code Map's
   estimate of ~0.29 mm almost exactly).

All four were reverted immediately after their red was captured; `git diff --stat src/sim/physics/machine.ts`
after the full round showed only this story's own permanent addition (the `PRE_STEP_HARDWARE_RULES` manifest,
+26 lines, 0 deletions) -- confirmed clean before continuing.

**Vacuity shapes closed this pass (Part 1 of the mandate):** shape 1 (the `RulesStepResult.commands toEqual([])`
sites) is not deleted but re-commented at all four call sites (`test/rules-devices.test.ts:131`,
`test/loop.test.ts:54`, `test/flipper-mover.test.ts:44,92`) to state plainly why each is vacuous and where the
real AD-5 pin actually lives, rather than leaving the old "AD-5 proof" claim standing. Shape 2 (zero-reference
modules) and shape 7 (field only ever asserted at its default) are closed together for `object-pool.ts`'s
`warned`/`skipped` counters (`DW-6`, new `test/object-pool.test.ts`, four tests: default state, the
non-claimed-release branch, the exhaustion branch driven past `MAX_POOL_SIZE`, and the recovery-to-default
path) and, more broadly, by `test/module-coverage.test.ts`'s import-reachability sweep (new), whose
`ALLOWLIST_REASONS` names every module Part D item 2 originally flagged that is STILL genuinely unreached after
this pass (`anim-object.ts`, `anim-slingshot.ts`, `hit-3dpoly.ts`, `line-seg-slingshot.ts`, plus
`hit-line-3d.ts` and `src/host/{boot,build-info}.ts`, found fresh this pass) and explains, per entry, why three
of Part D's original seven (`game/event-proxy.ts`, `util/object-pool.ts`, `contracts/mode-view.ts`) turned out
to already be import-reachable and are correctly NOT on the allowlist.

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

**QA pass (2026-08-29) — new test files, appended per the file-list completeness rule:**
- `test/replay-hash-invariants.test.ts` (QA) — direct unit coverage of `src/sim/loop/replay.ts`'s
  `canonicalize()`/`quantize001Mm()`/`stateHash()`/`gameStateHash()`/`fnv1aHex()`, three properties nothing
  else in the suite pins directly: object-key order-independence (with an array-order-preserved control),
  quantisation-boundary stability (idempotency, same-bucket jitter hashing identically, cross-boundary jitter
  hashing differently), and discriminating power (a one-field `GameState`/ball-position difference changes
  the hash; content-based, not reference-based).
- `test/replay-recorder-invalidation.test.ts` (QA) — `src/host/dev/replay-recorder.ts` AC 3: the invalidated
  flag survives continued `recordTransitions()` calls after `invalidate()` (the recording is not stopped by
  invalidation — `src/host/loop.ts`'s `onAdvance` seam keeps calling it every tick), a second `invalidate()`
  still keeps the first reason across intervening recording activity, and a fresh `start()` after an
  invalidated (not merely saved) recording does not leak the old reason forward.
- `test/replay-parity-orchestration.test.ts` (QA) — `tools/replay-parity/browser.ts`'s `runReplayParity()`
  orchestration itself (not just `judgeGoldenResult()`, already covered by `test/replay-parity-logic.test.ts`),
  stubbing `globalThis.fetch` in Node: a genuinely passing golden (a real `runReplay()` call against the real
  `roll-and-drain` golden) and a genuinely throwing one (a deliberately staled `tableHash`, or a 404) both
  appear in the returned report — never silently dropped — and an empty golden index throws rather than
  reporting zero results as a clean run.

All three were mutation-verified (break the code, confirm red, restore) against the running suite: removing
`canonicalize()`'s `.sort()` on `Object.keys()` reddened the two order-independence tests; bypassing
`quantize001Mm()` inside `stateHash()`'s ball-position reduction reddened the same-bucket-jitter test;
injecting `invalidReason = undefined` into `recordTransitions()` reddened both invalidation-persistence tests;
and flipping `runOneGolden()`'s catch block to `pass: true` reddened both "never silently dropped" tests in
the orchestration file. Each mutation was reverted immediately after its red was observed and independently
confirmed clean via `git diff`/`git status` before continuing to the next.

**QA finding (2026-08-29) — the `roll-and-drain` golden is silently insensitive to the one AD-5 mutation most
relevant to its own scenario, recorded here per "Do not re-record any golden. If a golden looks wrong, report
it in `## Issues Encountered`":** moving `deviceMechanics.applyCommands(tick, pulses)` to after
`physics.step()` in `src/sim/physics/machine.ts` (the exact, already-established fourth-participant mutation)
was run against all five goldens' `finalHash`/`finalGameStateHash` assertions in
`test/replay-goldens.test.ts`. Four goldens (`hold-and-release`, `full-plunge`, `nudge-coupling`,
`two-ball-collision`) went red immediately. **`roll-and-drain` alone stayed green** — reverted and re-run
twice to confirm, not a flake. Root cause (read from the golden's own shape, not guessed): `roll-and-drain`'s
final `GameState` is a served ball fully drained back to its STARTING configuration (`balls: []`,
`ballsInPlay: 0`, `deviceSlots.bd_trough` back to all-`true`) — the same terminal state the run began in
before the coil pulse. The ~0.29 mm eject-pose displacement this mutation produces (the same displacement
`test/machine-serve-drain.test.ts`'s dedicated fourth-participant behavioural pin catches directly) is fully
absorbed by the ball's own roll-to-drain trajectory converging on that same closed-loop terminal state, so the
hashed `GameState` at `durationTicks` carries no trace of it. **No regression escapes `pnpm test` as a whole**
— `test/hardware-rule-seam.test.ts`'s structural manifest check and `test/machine-serve-drain.test.ts`'s own
behavioural pin both catch this exact mutation directly (confirmed already verified by the lead before this
QA pass) — but the golden mechanism specifically contributes zero unique discriminating signal for this
defect class on this golden. A control mutation (`cabinetMechanics.applyFrame` moved after `physics.step()`)
was also run against all five: only `nudge-coupling` (the one golden that actually issues nudge input) went
red, `roll-and-drain` stayed green there too — consistent with cabinet's per-tick effect on a ball under no
nudge/tilt being negligible, not evidence of a broader insensitivity. This is a property of the scenario's own
closed-loop terminus, not a defect in `runReplay()`/`stateHash()` (both proved discriminating in
`test/replay-hash-invariants.test.ts` above) and not something this pass fixes — re-recording or altering the
golden is out of scope by this story's own "Never" rule.

**Manual checks (if no CLI):**
- Each mutation in the sweep's invariant table: apply, run `pnpm test`, **observe the red**, restore, record
  the observed failure verbatim in `## Design Notes`. A mutation asserted but not run is not evidence — the
  epic has one recorded case of its central ordering invariant being genuinely broken with 590 tests green,
  and a second one story later with 654 green.
- The four hardware-rule mutations specifically: move each of `machine.ts:140`, `:141`, `:145`, `:147` to
  after `:154` in turn, confirm both the manifest test and that participant's behavioural pin go red,
  restore.
- The Safari leg of AC 5, on the author's macOS machine.

## Implementation Results (dev pass, 2026-08-29)

All commands above were run for real against this pass's implementation, not merely predicted:

- `pnpm typecheck` — clean (all three projects: `tsconfig.sim.json`, `tsconfig.app.json`, `tsconfig.node.json`).
- `pnpm lint:boundaries` — `OK -- 77 .ts file(s) under src/ cruised, no violations`.
- `pnpm check:headers` — `OK -- every tracked authored-extension file carries a licence header`.
- `pnpm check:attributions` — `OK -- every package.json dependency has an ATTRIBUTIONS.md row` (no new package).
- `pnpm test` — green: **778 passed / 21 skipped across 57 files** (up from the 659/21/48 baseline; +119
  tests, +9 files — the sweep's new pins, `replay.ts`'s own tests, the five golden runner's 35 tests, the
  recorder's 9, the AC6/DW-64/DW-70/skip-visibility suites, and the `hardware-rule-seam`/`module-coverage`
  structural tests). 21 skipped matches the pre-existing Blender-gated baseline exactly (confirmed by
  `test/export-py-skip-visibility.test.ts`'s own live, nested-run check, new this pass).
- `pnpm check:ad7` — exits 1 (non-zero, as required), message contains `DW-70`, `AD-7`, `bd_trough`, and both
  disagreeing `deviceSlots.bd_trough` arrays (`[true,true,true,true]` vs `[true,true,true,false]`).
- `node tools/replay-parity/serve.mjs` then opened in a real Chrome instance (this pass, via CDP): **5/5
  goldens report PASS** on the `GameState`-only hash — `full-plunge`, `hold-and-release`, `nudge-coupling`,
  `roll-and-drain`, `two-ball-collision` all matched their Node-recorded `expectedGameStateHash`. One real
  defect was found and fixed during this live check: the page's original JS-set `element.style.*` rendering
  violated the pinned CSP (`default-src 'self'`, no `style-src` widening) — moved to an external
  `tools/replay-parity/style.css` (same-origin, `'self'`-admitted), re-verified clean (no CSP console errors,
  correct rendering).
- `pnpm build` + `node tools/check-dist.mjs` + `node tools/size-budget.mjs` — all pass (`tools/replay-parity/`
  is correctly NOT part of the build, by design; measured size 0.824 MB against a 2.75 MB budget — `boot.ts`
  statically imports `createReplayRecorder` from `src/host/dev/replay-recorder.ts`, which statically imports
  `buildHeader` from `src/sim/loop/replay.ts`, so those two modules DO ship in `dist/`; the measured 0.824 MB
  figure already reflects that small addition, still comfortably inside budget — only `tools/replay-parity/`
  is excluded, by design).

**All four hardware-rule mutations were run and reverted this pass** (`machine.ts`'s
`flipperMechanics.applyFrame`, `plungerMechanics.applyFrame`, `cabinetMechanics.applyFrame`,
`deviceMechanics.applyCommands`, each moved individually to after `physics.step()`), each producing both the
structural (`test/hardware-rule-seam.test.ts`) and behavioural red, verbatim failures recorded in
`## Design Notes`. The `DW-73` mutation (dropping `...entryResult.switchEvents` from `machine.ts`'s spread)
was also run and reverted, producing exactly the predicted `:501` red. The `DW-79` port-body-freeze mechanism
was probed with a throwaway one-line comment appended to `hit-point.ts` (immediately reverted, confirmed
byte-identical to `HEAD` via `git hash-object` before continuing) to prove the hash comparison genuinely
discriminates a real edit.

**One residual, flagged for the reviewer**: `git status` reports `src/sim/physics/hit-point.ts` as modified,
but `git diff` shows no content difference and `git hash-object` on the working-tree file exactly matches the
committed blob hash (`bb662fb0...`) — a `core.autocrlf=true` stat-cache artefact from the DW-79 probe above
(a `git checkout --` mid-probe briefly re-introduced CRLF line endings, since corrected by rewriting the file
with LF endings only), not a real change. Safe to stage or ignore; recorded here rather than left silent.

**The Safari leg of AC 5 was not run** (this environment is Windows) — remains author-owned, exactly as this
spec's own Design Notes anticipated ("Risk carried into implementation: AC 5's Safari leg").

Two AD invariants were found to have no red test and no assigned Phase 0 task to close them; both are
recorded in this spec's own frontmatter `deferred:` list with their mutation named as the observable, per the
sweep's own rule ("Findings the sweep cannot fix in footprint -> spec frontmatter `deferred:`"): **AD-2's
"rules never debounce"** (whole-claim residual beyond the button-switch half) and **AD-14's gap**
(`CreateLoopOptions` does not accept a `GameStart`, so the replay header embeds a bundle the loop never
consumes).

## Auto Run Result

Status: done
Blocking condition: none

### Summary of implemented change

Story 1.8 shipped in full: Phase 0's blocking sweep (the `PRE_STEP_HARDWARE_RULES` manifest + table-driven
test; the fourth hardware rule's behavioural pin; `DW-73`/`DW-79`/`DW-83`/`DW-6` closed with named
observables; the four `toEqual([])` vacuous AD-5 "proofs" replaced; a `dependency-cruiser`-based
import-reachability substitute for coverage instrumentation; `DW-70`'s out-of-suite red harness + `check:ad7`
script + in-suite content-asserting wrapper); Phase 1's shipped `src/sim/loop/replay.ts` (canonicalize,
quantize001Mm, fnv1aHex, stateHash, gameStateHash, tableHash, assetHash, PHYSICS_VERSION, buildHeader,
runReplay, promoted verbatim from the test-local original); and Phase 2's `src/host/dev/replay-recorder.ts`
(record + invalidate/save, wired at `src/host/loop.ts`'s new `onAdvance` seam and exposed via
`window.__dragonwarBoot`), five golden replays under `test/replays/*.golden.json` (each carrying a declared
`coilPrologue` per the AC 4 amendment) with their runner `test/replay-goldens.test.ts`, the
`tools/replay-parity/` browser-parity page (Vite's programmatic API, no build-config edit), the Blender-free
hull test (`DW-64`) and skip-count visibility test, and the CI Node-version pin.

The sweep's mutations were run for real, not merely predicted (verbatim reds recorded in `## Design Notes` →
"The sweep's invariant-to-mutation table"), and every source file was restored afterward (`git diff` clean on
each, independently re-verified by this reviewing pass, including the one CRLF stat-cache artefact on
`src/sim/physics/hit-point.ts` — confirmed content-identical to `HEAD` via `git hash-object`, not a real
change).

A first code-review pass (Blind Hunter, Edge Case Hunter, Verification Gap, Intent Alignment — see
`## Review Triage Log`) found 11 real, fixable gaps, all applied in this pass: a factually wrong doc claim
about what ships in `dist/`; a misdescribed traversal algorithm in a comment; a silent-skip risk in the
parity page's golden-file filter; an unvalidated `coilPrologue` tick range in `runReplay()`; zero test
coverage on `boot.ts`'s replay-recorder wiring; zero non-DOM unit coverage on the parity harness's
hash-comparison and routing logic; a two-ball-collision failure message that didn't name the tick as the I/O
matrix requires verbatim; a missing sweep-table row for AD-15's tunable-`source`/`confidence` clause
(resolved as type-enforced, no runtime mutation possible); `onAdvance` sharing a catch block that could let a
dev-only recording-tap failure halt live gameplay; `canonicalizeAt()` not guarding `bigint`/`symbol`/
`function`; and an asymmetric missing-file guard on the parity page's `collision.json` route. All fixes were
independently re-verified (typecheck/lint/test all green; browser parity re-checked live in Chrome via
`chrome-devtools-mcp`, still 5/5 PASS).

### Files changed

**New source:** `src/sim/loop/replay.ts` (the shipped AD-15 hash + replay runner); `src/host/dev/replay-recorder.ts`
(record/invalidate/save seam); `tools/replay-parity/{index.html,browser.ts,serve.mjs,serve.d.mts,style.css}`
(browser-parity page + server).

**New tests/fixtures:** `test/replay-goldens.test.ts` (golden runner + matrix coverage); `test/replay-recorder.test.ts`
(AC 3); `test/replay-parity-logic.test.ts` (non-DOM parity-harness unit tests, added in review); `test/hardware-rule-seam.test.ts`
(manifest structural/set-equality test); `test/module-coverage.test.ts` (import-reachability substitute for
coverage); `test/object-pool.test.ts` (`DW-6`); `test/ad7-device-slots.test.ts` + `test/fixtures/dw70-ad7/`
(`DW-70`'s out-of-suite harness + in-suite wrapper); `test/export-py-hull.test.ts` + `test/fixtures/export-py/hull-runner.py`
(`DW-64`); `test/export-py-skip-visibility.test.ts`; `test/ac6-scatter-and-prng.test.ts`; `test/replays/*.golden.json`
(five goldens: roll-and-drain, hold-and-release, full-plunge, nudge-coupling, two-ball-collision).

**Modified source:** `src/sim/physics/machine.ts` (`PRE_STEP_HARDWARE_RULES` manifest); `src/sim/table/names.ts`
(`TTuning` binding); `src/host/boot.ts` (recorder wiring); `src/host/loop.ts` (`onAdvance` seam + review fix
isolating it from the simulation/presentation catch); `src/sim/physics/util/object-pool.ts` (`DW-6` accessors).

**Modified tests:** `test/loop-determinism.test.ts` (re-pointed at the shipped module); `test/cabinet-integration.test.ts`
(vacuity fix, review-cited); `test/cabinet-nudge.test.ts`, `test/machine-serve-drain.test.ts`, `test/sim-boundary.test.ts`
(`DW-83`/`DW-73`/`DW-79`); `test/rules-devices.test.ts`, `test/loop.test.ts`, `test/flipper-mover.test.ts`
(vacuous `toEqual([])` fix); `test/host-loop.test.ts`, `test/entry-html-csp.test.ts` (review: boot.ts wiring
pin).

**Other:** `.github/workflows/ci.yml` (Node version pinned to `24.16.0`); `package.json` (`check:ad7` script);
`src/host/dev/.gitkeep` and `test/replays/.gitkeep` removed (superseded by real content); this spec file
(`deferred:` frontmatter, `## Design Notes`, `## Review Triage Log`, this section).

### Review findings breakdown

- **Patches applied:** 11 (high 0, medium 5, low 6) — see `## Review Triage Log` → 2026-08-29 for the full
  list with file/line evidence and the fix applied to each.
- **Deferred:** 0 from this review pass (two items were already deferred by the implementation pass itself
  before review — `AD-2-residual` and `AD-14-gap`, both in frontmatter `deferred:` with named mutations; not
  re-counted here since they did not originate from this review's four layers).
- **Rejected:** 16 — real-but-out-of-contract observations (no local Node pinning; no golden-recording
  script; `ReplayRecorder` not exposing tick count; deferred-entry "ownership" — a false premise, this spec's
  `deferred:` schema carries no owner field; a duplicated `MAX_POOL_SIZE` test constant, already documented
  and low-risk since it mirrors a frozen port; subprocess-test CI cost, an established in-repo pattern;
  non-zero-padded hash length, intentionally spec-verbatim behaviour; cross-golden tuning-copy consistency,
  already guaranteed transitively by each golden's own live-environment check; a benign unhandled-rejection
  in a manually-run dev tool whose user-facing error path already works; `runCruise()`'s exit-status handling,
  where adding a check risks false negatives against dependency-cruiser's own violation-reporting semantics;
  an already-self-limiting unguarded `JSON.parse` in a test helper; four Intent Alignment observations that
  were verified and found to be either already resolved by this spec's own explicit Design Notes ("record"
  vs "play" scope, the coverage substitution, the port-body-freeze residual note) or a false positive (a
  "mislabeled" vacuity-shape citation that in fact correctly cites this spec's own Code Map Part D, not the
  mandate's differently-numbered shape list); and the sweep-ordering-is-only-provable-via-prose observation,
  which isn't code-fixable and was instead independently re-verified by this reviewing pass re-running
  `pnpm test` and `pnpm check:ad7` directly).

### Follow-up review recommendation

`followup_review_recommended: true`. Computed from this pass's `patch` findings only (high 0, medium 5, low
6): `3 × 5 + 1 × 6 = 21 ≥ 5`, so `true` regardless of the high-severity clause (which was not triggered — no
high-severity patch this pass).

### Verification performed

All commands re-run for real by this reviewing pass after the implementation subagent's own run, and again
after the 11 review patches:
- `pnpm typecheck` — clean, both times (all three projects).
- `pnpm lint:boundaries` — clean, both times (`77 .ts file(s) under src/ cruised, no violations`).
- `pnpm check:headers` / `pnpm check:attributions` — clean, both times (no new package; new files carry the
  GPL-3.0 header, including the review pass's new `tools/replay-parity/serve.d.mts`).
- `pnpm test` — green throughout: 659/21/48 baseline → 778/21/57 after implementation → **792 passed / 21
  skipped across 58 files** after the 11 review patches (+14 tests, 0 new skips, 0 regressions).
- `pnpm check:ad7` — exits 1 (non-zero, as designed) naming `DW-70`, `AD-7` and `bd_trough`, both disagreeing
  `deviceSlots.bd_trough` arrays shown; re-confirmed unchanged after the review patches.
- `node tools/replay-parity/serve.mjs` opened in a **real Chrome instance via `chrome-devtools-mcp`**, twice
  (once after implementation, once after the review patches touched `browser.ts`/`serve.mjs`): **5/5 goldens
  PASS** on the `GameState`-only hash both times; console/network inspected, only a harmless `favicon.ico`
  404 present.
- The four hardware-rule mutations and the `DW-73` mutation were run and reverted for real (verbatim reds
  recorded in `## Design Notes`); `git status`/`git diff`/`git hash-object` independently re-checked by this
  pass to confirm the tree carries no unintended residual changes from those probes.

### Residual risks

- **AC 5's Safari leg was not run** (this environment is Windows) — author-owned per this spec's own Design
  Notes, exactly as Spike 1's macOS legs were left. Becomes a ledger entry with its observable if unrun at
  epic close.
- **Two AD invariants have no red test and no assigned Phase 0 task**, recorded in frontmatter `deferred:`
  with named mutations: AD-2's whole-claim debounce residual (button-switch half only is pinned), and AD-14's
  gap (`CreateLoopOptions` doesn't accept a `GameStart`, so the replay header embeds a bundle the loop never
  consumes).
- **Every golden recorded by this story bakes `DW-70`'s loop-written `deviceSlots` value into the reference
  hash** (`stateHash()` covers the whole `game` tree) — harmless if Story 2.5's fix is faithful, and the
  provenance is written next to the goldens themselves (`test/replay-goldens.test.ts`'s header and each
  golden's own metadata) rather than left to be rediscovered.
- **`DW-79`'s port-body freeze proves forward-drift only**, not byte-identity to real upstream sources (no
  vendored copy exists in-repo); this residual is explicitly recorded in `test/sim-boundary.test.ts`'s own
  header, per this spec's own instruction.
- **`NOTICE` (`DW-82`'s residual)** remains untouched — out of footprint, in no authorization, no AC of this
  story requires it; recorded with its observable, re-owned at the `ledger_adjudicated` gate.
- `ATTRIBUTIONS.md`, `vite.config.ts`, `vitest.config.ts`, `.gitattributes`, `index.html` and `public/**`
  remain untouched; no new npm package was added anywhere (verified both by the implementation pass and
  independently by this reviewing pass).
