---
title: 'Story 1.8: Replays, golden state hashes and CI parity'
type: 'feature'
created: '2026-08-29'
status: 'blocked'
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
- **[FIRED — see `## Auto Run Result`] AC 4's goldens cannot be expressed as `ReplayHeader +
  InputTransition[]`.** No input transition can put a ball in play in Epic 1, so none of the five named
  goldens is reachable from a replay body alone. Evidence and recommended amendment below.
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
- `_bmad-output/planning-artifacts/epics.md:609-640` — this story's six acceptance criteria verbatim.
- `_bmad-output/implementation-artifacts/story-1-8-sweep-mandate.md` — the binding, user-approved sweep
  mandate. Both parts are in scope.
- `ATTRIBUTIONS.md` — **never edit**; the one-time widening is spent. Its existence gates every new package.

**Verified environment facts (measured this planning pass — do not re-derive):**
- **No input transition can put a ball in play.** `src/sim/rules/index.ts:30` types
  `RulesStepResult.commands` as `readonly never[]` and `:52` returns `[]`, so the rules layer cannot issue a
  `CoilCommand` **at the type level**. A ball reaches the playfield only through
  `loop.pulseCoil('c_trough_eject')` (`src/sim/loop/index.ts:62,340`), a **dev-only escape hatch** whose own
  doc names Story 2.5 as its replacement (`src/host/loop.ts:36`). `InputAction`
  (`src/sim/contracts/input.ts:12-20`) has no member reaching a coil. **This is the blocking finding.**
- **No new npm package is possible.** `tools/check-attributions.mjs:54-60` merges five manifest keys;
  `:75-80` word-boundary-matches each package name against `ATTRIBUTIONS.md`; `:102-106` `process.exit(1)`.
  Run in CI (`ci.yml:103-104`) **and** as a real subprocess by `test/check-attributions.test.ts:23-32`
  expecting `status === 0`, so `pnpm test` goes red too. Consequence: **no `@vitest/browser`, no browser
  driver, no `@vitest/coverage-v8`.** The mandate's "propose adding coverage" branch is closed by footprint.
- **CRLF parity hazard is live and measured** (see Boundaries). Goldens must be `JSON.parse`d.
- **`vite.config.ts:45-50` registers the two HTML entry points** (`index.html`, `tools/spike-1/index.html`)
  and is **out of footprint** — a new parity page cannot become a Vite build input. The in-footprint path is
  a `tools/` script driving Vite's programmatic API plus a local static server, following
  `tools/spike-1/{index.html,browser.ts}` + `tools/spike-1/measure.mjs` as the precedent for a harness page
  authored under `tools/**`.
- **`vitest.config.ts` is out of footprint** but needs no change: `include: ['test/**/*.test.ts']` already
  discovers a new test file, and `*.golden.json` files are plain data read by it.
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
  `Math.random` token under `sim/**`. So "the PRNG is never drawn" is assertable today only as a token ban
  plus a scatter-is-0 assertion plus the dead-branch guard — there is no counter and no injectable seam.

**The replay surface to build on:**
- `src/sim/contracts/replay.ts:30-54` — `GameStart` (`:30`), `ReplayHeader` (`:41`), `Replay` (`:51`).
  **Do not widen these** — AC 1 pins their shape. Note `:26-28` claims `sim/table/names.ts` binds `TTuning`
  to `ResolveTuningResult`; **it does not** (grep is empty) — a real, small gap worth closing.
- `test/loop-determinism.test.ts:33-68` — the hash to promote: `canonicalize()` (`:33-45`, recursive
  `Object.keys().sort()`), `quantize001Mm()` (`:47-49`, `Math.round(mm*100)/100`), `fnv1aHex()` (`:52-59`,
  32-bit, basis `0x811c9dc5`, prime `0x01000193`, `Math.imul`, `charCodeAt` — **UTF-16 code units**, hex
  **not zero-padded**), `stateHash(game, balls)` (`:62-69`, payload `{ game, balls }` with balls reduced to
  `{ id, pos }`). Its header `:13-17` hands this story ownership. `:71-135` is the loop-driving pattern a
  replay driver mirrors.
- `src/sim/loop/index.ts:52-70` the `Loop` interface (`advance` `:60`, `pulseCoil` `:62`, `setCoilEnabled`
  `:69`); `:186-189` `CreateLoopOptions` — **carries only `collisionDoc`, no `GameStart`**; `:191-214` the
  hard-coded initial `GameState`; `:216-248` `buildSnapshot()` (ball pos already in table mm at `:218`);
  `:275-280` the `advance()` guards and the stable re-sort of pending transitions; `:286-288` the N=0 path
  returning the previous snapshot object unchanged; `:328` the `deviceSlots` copy that is `DW-70`.
- `src/sim/contracts/snapshot.ts:87-93` `Snapshot`, `:29-36` `BallSnapshot`, `:109-121` `FrameOutput` —
  **`FrameOutput` deliberately carries no `SwitchEvent`s** (`src/sim/loop/index.ts:117,142`), which is the
  whole of `DW-66`'s verification-shape problem.
- `src/sim/contracts/state.ts:137-145` `GameState` = `{ tick, phase, machine, players[], currentPlayer,
  modes[], rng }`; `:64-73` `MachineState`; `:92-105` `PlayerState`; `:114-119` `ActiveModeState` —
  **carries an open index signature `[key: string]: unknown`**, the single largest ambiguity for a shipped
  canonical encoder. `JSON.stringify` maps `NaN`/`Infinity` to `null` and drops `undefined` from objects, so
  the shipped canonicaliser must reject or normalise these rather than let them collide silently.
- `src/host/loop.ts:33-40` `HostLoop`, `:48` `createLoop()`, `:78-104` `tick()` — `:86` `drainTransitions()`,
  `:87` `loop.advance()`, `:91` `onFrame(output)`. **This is where a record tap and a play driver attach.**
  `src/host/boot.ts:44-61` and `:167` `window.__dragonwarBoot` is the existing dev affordance to extend.
  `src/host/dev/.gitkeep` currently attributes replay record/play to Story 1.9 — stale; epics.md AC 3
  assigns it here.

**The sweep, Part A — the AD-5 seam:**
- `src/sim/physics/machine.ts` `step()` `:124-177`, `physics.step()` at **`:154`**. **Four** pre-step calls,
  hand-written with **no registry**: `flipperMechanics.applyFrame()` `:140`, `plungerMechanics.applyFrame()`
  `:141`, `cabinetMechanics.applyFrame()` `:145`, **`deviceMechanics.applyCommands()` `:147`**.
- Ordering pins that exist: flipper `test/flipper-mover.test.ts:83`; plunger `test/plunger.test.ts:55`;
  cabinet `test/cabinet-integration.test.ts:164` (added by Story 1.7's final commit `35636fe`).
  **The dispatch briefing was stale on the cabinet — it IS pinned.**
- **`deviceMechanics.applyCommands()` at `:147` has NO ordering pin.** The mandate's lesson recurring a
  third time: a fourth instance at the same seam, unpinned. Its preferred remedy — a table-driven pin over a
  registry — has no registry to drive; one must be introduced, or the pin must enumerate all four and fail
  when the enumeration and the call site diverge.
- `test/cabinet-integration.test.ts:191-194` — the cabinet ordering pin is `toBeGreaterThan(0)` against a
  measured **6.59e-5 mm**: the weakest of the three, and a vacuity candidate in its own right.

**The sweep, Part B — invariants with no red test:**
- **AD-7 ownership clause — NO test.** Nothing fails if `GameState` is mutated outside `rules.step`.
  `DW-70` is the live instance; reference it, do not re-file.
- **AD-2's "rules never debounce" — NO test.** `test/loop.test.ts:336-360` pins the button-switch half only.
- **AD-14 — NO test, and a real gap:** `CreateLoopOptions` (`src/sim/loop/index.ts:186-189`) does not accept
  `GameStart`, so the replay header will embed a bundle the loop never consumed. Named mutation: change
  `header.gameStart.adjustments.pitchDeg` and observe the replay is unaffected.
- Pinned and verified: AD-1 / AD-3 / AD-16 via `test/boundary-lint.test.ts:45-65` (**all 10 rules have a
  red-path fixture**, asserting exit 2); AD-4 t+1 via `test/loop.test.ts:233`; AD-4 key codes via
  `test/host-input.test.ts:409`; AD-6 via `test/machine-serve-drain.test.ts:449-452`; AD-15 constants via
  `test/sim-boundary.test.ts:267`; AD-10 via `test/collision-loader.test.ts:97,855`.

**The sweep, Part C — the six owned ledger entries:**
- **`DW-73`** — `test/machine-serve-drain.test.ts`; most load-bearing assertion `:501`
  (`ballsInPlay === 0` after drain), backed by `:451`. Mutation to run: drop `...entryResult.switchEvents`
  from the `switchEvents` spread at `src/sim/physics/machine.ts:173`, or short-circuit the trough-park
  branch in `src/sim/rules/ball-controller.ts`. **Also note `:474-486` hand-repositions the ball**, so the
  drain half proves geometry-below-the-flippers only — record that.
- **`DW-83`** — largely closed by Story 1.7's QA: same-tick multi-edge IS covered at
  `test/cabinet-slam.test.ts:252` (three actions on tick 1) and `test/cabinet-nudge.test.ts:275` (diagonal).
  **Residual:** never driven through `createLoop()` / `machine.step()` with a real `physics.step()`;
  `nudge_r` has no end-to-end ball-coupling test (`:349` checks cabinet velocity sign only).
- **`DW-6`** — `src/sim/physics/util/object-pool.ts`: `warned` `:50`, `skipped` `:55` (incremented `:84`,
  `:91`), all `private`, **nothing reads them**; exhaustion branch `:88-92` is `/* istanbul ignore next */`;
  `MAX_POOL_SIZE = 100` `:46`; **zero test references anywhere**. Reachable via `collision-event.ts:30,94`.
- **`DW-66`** — the two halves: `test/switch-zones.test.ts:106` (zone-tester half) and
  `test/machine-serve-drain.test.ts:449` (semantic half). A whole-run observable cannot see the raw edge
  (`FrameOutput` has no `switchEvents`), so it must observe `ball_launched` + `ballsInPlay`, or drive
  `machine.step()` in parallel as `test/cabinet-integration.test.ts:109-137` does.
- **`DW-79`** — `test/sim-boundary.test.ts` checks **headers only, never bodies**: `AUTHORED_FILES` `:83-93`
  (9 files), `VPINBALL_PORTED_FILES` `:113` (**three**: `cabinet/oscillator.ts`, `cabinet/nudge-impulse.ts`,
  `cabinet/plumb-bob.ts`), every other file under `src/sim/physics/**` (~40) defaulting to the vpx-js
  branch. **No vendored upstream copy and no checksum exists anywhere in the repo.**
- **`DW-64`** — `test/export-py.test.ts:102` is the single `describe.skipIf(!blenderPath)` holding **21**
  `it()` blocks; the two hull pins are `:256-278` and `:280-293`. `tools/export.py:304` `_convex_hull_2d`
  and `:331` `_rotate_to_lexicographic_first` are **pure plain Python**; only the module-level `import bpy`
  (`:33`) and `from mathutils import Vector` (`:34`) block a plain `python3` import — and
  `test/export-py-version-gate.test.ts:60-74` **already writes a `bpy`/`mathutils` stub and injects
  `PYTHONPATH`** (`:87`), with `resolvePlainPython()` at `:31-39`. The precedent is in-repo and in-footprint.

**The sweep, Part D — vacuity candidates found this pass:**
1. `RulesStepResult.commands` asserted `toEqual([])` at `test/rules-devices.test.ts:131`,
   `test/loop.test.ts:54`, `test/flipper-mover.test.ts:44,92` **as an AD-5 "no rules round trip" proof** —
   it is `readonly never[]`, so the assertion holds for every possible implementation and proves nothing.
2. Seven modules with **zero references in `test/**`**: `src/sim/physics/anim-object.ts`,
   `anim-slingshot.ts`, `line-seg-slingshot.ts`, `game/event-proxy.ts`, `hit-3dpoly.ts`,
   `util/object-pool.ts`, `src/sim/contracts/mode-view.ts`.
3. `state.machine.tilt.{tilted,slamTilted}` asserted **only ever `false`** despite Story 1.7 shipping a bob
   and a slam detector (`test/rules-devices.test.ts:29`, `machine-serve-drain.test.ts:419`,
   `ball-render.test.ts:38`, `contracts.test.ts:217,251`). Same shape: `multiball: null`,
   `ballSave.untilTick: null`, `rng: 0`.
4. `Snapshot.mechanisms.dropTargets` / `.spinner` hard-coded `{}` at `src/sim/loop/index.ts:236-237` and
   asserted `{}` — nothing distinguishes "empty in Epic 1" from "wired to nothing".
5. `test/cabinet-integration.test.ts:191-194` — `toBeGreaterThan(0)` on 6.59e-5 mm. Sibling inconsistency:
   `cabinet-nudge.test.ts:202-203` asserts at precision 3 what `:301-302` asserts at precision 6.
6. `src/sim/loop/index.ts:95-114` `buttonSwitchByAction()` enumerates by `settleClass === 'button'` and the
   name `'s_' + action`; a fifth button switch spelled otherwise silently gets no edge (shape 8).
7. No test asserts the **expected skip count** on the running platform, so coverage lost to a `skipIf` is
   invisible (`test/export-py.test.ts:102`, `export-py-version-gate.test.ts:76,143`,
   `blender-resolve.test.ts:117` — the last is win32-only, so local skips 21 and CI skips 22).

## Tasks & Acceptance

**Execution — PHASE 0: the sweep (BLOCKING; no golden is recorded until every task here is done).**

- `test/**` (audit, no edit yet) — enumerate every AD-* invariant Epic 1 claims, from the spine text and
  each Epic 1 spec's `### Governing ADs`, and for each one state the mutation that violates it. Produce the
  table in `## Design Notes` before writing any test.
- `src/sim/physics/machine.ts` + a new `test/hardware-rule-ordering.test.ts` — introduce a **registry or
  explicit enumeration of the four pre-step calls** and a table-driven ordering pin over it, so a fifth
  hardware rule added at `:140-147` without a pin fails loudly. Must cover `deviceMechanics.applyCommands()`
  `:147`, which has none today. Run each of the four mutations, observe red, record the observation.
- `test/cabinet-integration.test.ts:191-194` — strengthen the cabinet ordering observable so it does not
  rest on `toBeGreaterThan(0)` against 6.59e-5 mm. Do not weaken it; make the signal larger or assert the
  energisation rather than the displacement.
- `test/machine-serve-drain.test.ts` (`DW-73`) — **mutation spot-check, not inspection**: run the mutation
  named in the Code Map, confirm `:501` goes red, restore, record. Also record that `:474-486`
  hand-repositions the ball, so the drain half proves geometry-below-the-flippers only.
- `test/rules-devices.test.ts`, `test/loop.test.ts`, `test/flipper-mover.test.ts` — replace the
  `commands` `toEqual([])` assertions used as an AD-5 proof with an assertion that can fail, or delete the
  claim and record why the type makes it vacuous.
- A new `test/module-coverage.test.ts` — **the in-footprint substitute for coverage instrumentation**
  (which the attributions gate forbids): a static import-reachability check over `src/**` using
  `dependency-cruiser` (already a devDependency, already used by `tools/boundary-lint.mjs`), asserting every
  module is reachable from `test/**`, with an explicit allowlist naming each knowingly-unreached module and
  its reason. A new unreached module then fails loudly. Seeded from the seven modules named in Part D.
- `src/sim/physics/util/object-pool.ts` + a new test (`DW-6`) — surface the exhaustion counters through a
  readonly accessor and drive the `:88-92` exhaustion branch, asserting `skipped` / `warned`. Closes DW-6
  and vacuity shapes 2 and 5 together.
- `test/cabinet-*.test.ts` (`DW-83` residual) — drive two nudge rising edges in one tick through
  `createLoop()` with a real `physics.step()`, and add the `nudge_r` end-to-end ball-coupling case.
- `test/sim-boundary.test.ts` (`DW-79`) — add a **port-body freeze**: a manifest of content hashes for every
  declared ported file (computed over normalised line endings), so any later edit to a port fails with a
  message requiring re-verification against the upstream pin and a deliberate manifest update. This does not
  prove byte-identity to upstream (that was verified by hand, and vendoring upstream bytes is out of
  footprint) — it pins drift from the verified state, which is the reachable half. Record the residual.
- Findings the sweep cannot fix in footprint → spec frontmatter `deferred:` with the mutation named as the
  observable. **Never a silent carry-forward.**

**Execution — PHASE 1: the shipped replay module (only after Phase 0).**

- `src/sim/loop/replay.ts` (new, authored, GPL-3.0 header) — promote `canonicalize` / `quantize001Mm` /
  `fnv1aHex` / `stateHash` from `test/loop-determinism.test.ts:33-68` verbatim in behaviour; add
  `gameStateHash()` (the `GameState`-only portion, for browser parity), `tableHash()`, `assetHash(doc)`,
  `PHYSICS_VERSION` derived from the pinned solver constants plus `TICK_HZ`, `buildHeader()`, and
  `runReplay()`. Reject non-finite and `undefined` values with a named path rather than letting
  `JSON.stringify` collapse them.
- `test/loop-determinism.test.ts` — re-point at the shipped module, deleting the local copy, so one
  implementation exists.
- `src/sim/table/names.ts` — bind `GameStart` / `ReplayHeader`'s `TTuning` to `ResolveTuningResult`, which
  `src/sim/contracts/replay.ts:26-28` already claims and no code does.

**Execution — PHASE 2: record/play, goldens, browser parity, CI.**

- `src/host/dev/replay-recorder.ts` (new) — record and play attached at `src/host/loop.ts:86-91`; an
  `invalidate(reason)` seam and a `save()` that refuses once invalidated (AC 3). Exposed via
  `window.__dragonwarBoot` (`src/host/boot.ts:167`).
- `test/replays/*.golden.json` (new) + `test/replay-goldens.test.ts` (new) — the five goldens and their
  runner. The runner verifies `tickHz`, `tableHash`, `assetHash`, `physicsVersion` and the resolved tuning
  **before** hashing, and fails with a message naming the changed input.
- `tools/replay-parity/` (new) — the browser parity page plus a build/serve script using Vite's programmatic
  API (no `vite.config.ts` edit, no new package). Reports per-golden PASS/FAIL on the `GameState` portion.
- `test/export-py-hull.test.ts` (new, `DW-64`) — a Blender-free unit test over fixture polygons, importing
  `_convex_hull_2d` / `_rotate_to_lexicographic_first` under a `bpy`/`mathutils` stub, following
  `test/export-py-version-gate.test.ts:60-87`.
- `.github/workflows/ci.yml` — pin `node-version` to the exact version the goldens were recorded on, and add
  no step that needs Blender or a browser.

**Acceptance Criteria:**

- Given the sweep, when every mutation in the `## Design Notes` table has been run, then each one's red is
  observed and recorded verbatim in this spec — and no golden file exists in `test/replays/` until then.
- Given `src/sim/loop/replay.ts`, when a replay is written, then its header embeds the whole `GameStart`,
  `physicsSeed`, `tickHz`, `tableHash`, `assetHash` and `physicsVersion`, and its body is the ordered
  `InputTransition[]` (AC 1).
- Given a golden recorded on Windows and replayed on Linux CI, when the file is checked out with either line
  ending, then the recomputed hash is identical — because the runner parses JSON and never compares bytes.
- Given a golden whose `physicsVersion`, `tableHash`, `assetHash`, `tickHz` or resolved tuning no longer
  matches, when the runner runs, then it fails **before** hashing, naming the changed input and instructing
  a deliberate re-record.
- Given a recording in progress, when `invalidate()` is called, then `save()` refuses and names the reason
  (AC 3).
- Given the two-ball golden, when it replays, then momentum is transferred, no pair overlaps or sticks, and
  separation never drops below one ball diameter (AC 4).
- Given the parity page, when a golden is replayed in Chrome, then the `GameState` portion of the hash
  matches Node; ball positions are asserted only in Node (AC 5).
- Given any replay, when it runs, then `scatter` is 0 on every material and the physics PRNG is never drawn,
  asserted by a test (AC 6).
- Given `pnpm test` on a machine with `python3` and no Blender, when it runs, then `_convex_hull_2d` is
  exercised (`DW-64`).

## Spec Change Log

_Empty — no review loopback has occurred._

## Review Triage Log

_Empty — no review pass has occurred._

## Design Notes

### Governing ADs (Rule 6), read from the spine text

**AD-15 (line 202)** is the primary. Its rule text defines the artifact this story ships, verbatim:
"Physics is tested by replaying `test/replays/*.replay.json` (schema in `sim/contracts/replay.ts`) and
asserting the **state hash**: FNV-1a over canonical JSON of `GameState` plus ball positions quantised to
0.01 mm; goldens are recorded in Node in CI, and browser parity is asserted on `GameState` only." Its Binds
scope names `sim/loop/replay.ts` and `host/dev` — which is why the shipped hash goes to
`src/sim/loop/replay.ts` and record/play to `src/host/dev/`, not the other way round. Its Prevents list
contains "a golden that fails because Safari's `Math.sin` differs from V8's", which is the whole reason
browser parity is `GameState`-only and ball positions are asserted in Node alone.

**AD-4 (line 91)** supplies the sentence this story cannot currently satisfy: "A replay is
`ReplayHeader + InputTransition[]` and must reproduce the state hash." See the blocking condition.

**AD-3 (line 85)** — one clock; `TICK_HZ` is provisional and "if spike 1 forces 480 Hz, that constant
changes and golden replays are re-recorded"; "Physics has no randomness: scatter is 0 on every material by
default"; "Both seeds are in the replay header." This is why `physicsVersion` is derived from the solver
constants and `TICK_HZ` rather than hand-written: the re-record obligation then enforces itself.

**AD-17 (line 214)** governs the CI half. **AD-16 (line 208)** governs provenance and `DW-79`.
**AD-7 (line 128)**, **AD-2 (line 79)**, **AD-5 (line 116)**, **AD-6 (line 122)**, **AD-14**, **AD-1**,
**AD-10 (line 172)** are all in the sweep's Part 2 scope.

### The `cradle-and-release` golden — decision recorded, tied to `DW-72`

**This is a scoping call, not a product call, so it is decided here rather than escalated.** The product
requirement — a real cradle golden — is preserved and owned by Story 2.1 through `DW-72`, which already
carries a reciprocal acceptance criterion. What changes is only the name and window of an Epic 1 test
fixture, and the epic context already *requires* that change: "do not build any test or golden in this epic
that assumes a multi-second cradle."

**Decision:** record the golden now as **`hold-and-release`**, not `cradle-and-release`, with the hold kept
well inside the ~1 s window where behaviour is stable and will not change when Story 2.1 lands the inlane
guides and posts. That freezes the Epic 1 behaviour worth protecting — the coil as a hardware rule, the
input path, the release impulse — without encoding the roll-off that `DW-72` documents (a ball on a raised
bat departs after roughly 1.2–1.9 simulated seconds because the committed collision document has no geometry
beside either flipper). The golden stays valid across Story 2.1. The full cradle golden arrives in Epic 2
with `DW-72`.

**This rename requires the epics.md AC 4 wording to change**, so it is folded into the amendment requested
below rather than applied silently.

### Why coverage instrumentation is not added

The mandate's Part 1 says "If none is configured, propose adding it — in-footprint via `package.json` and
the CI workflow." Both files *are* in footprint, but the dependency is not: every coverage package
(`@vitest/coverage-v8`, `@vitest/coverage-istanbul`, `c8`, `nyc`) is a new npm package, and
`tools/check-attributions.mjs` fails CI **and** `pnpm test` for any package with no `ATTRIBUTIONS.md` row.
`ATTRIBUTIONS.md` is out of footprint with its one-time widening spent. The substitute planned above — a
static import-reachability check built on the already-attributed `dependency-cruiser` — catches the exact
shape the mandate cites ("two modules with no executed test host") statically rather than dynamically, and
its allowlist makes a new unreached module visible. The residual (statement-level coverage inside a reached
module) is a ledger entry, not a silent gap.

### Integration ACs, Consumed-by and Consumes (Rules 1 and 2)

This story introduces two shared modules.

- `src/sim/loop/replay.ts` — **Consumed-by:** `test/replay-goldens.test.ts` and `test/loop-determinism.test.ts`
  (this story, real instances, not mocks); `src/host/dev/replay-recorder.ts` (this story);
  `tools/replay-parity/` (this story); **Story 1.9** (the feel ritual records and compares replays).
  **Consumes:** `src/sim/contracts/replay.ts`, `src/sim/contracts/state.ts`, `src/sim/contracts/snapshot.ts`,
  `src/sim/physics/constants.ts` (read-only, for `physicsVersion`), `src/sim/table/dragonwar.ts`,
  `src/sim/table/tuning.ts`.
- `src/host/dev/replay-recorder.ts` — **Consumed-by: Story 1.9**, whose dev tuning panel calls
  `invalidate()` on hot-apply. AC 3's hot-apply half therefore has **no consumer in this story**; the seam is
  tested here by calling `invalidate()` directly, and the first real consumer is Story 1.9.
  **Consumes:** `src/host/loop.ts`, `src/sim/loop/replay.ts`.

### Ledger

Owned and adjudicated at this story's `ledger_adjudicated` gate: `DW-6`, `DW-64`, `DW-66`, `DW-73`, `DW-79`,
`DW-83` — all six are planned in scope above. Referenced but **not** this story's to fix: `DW-70` (live
AD-7 violation, escalated to the merge gate), `DW-72` (owned by Story 2.1), `DW-82` (out of footprint,
awaiting user authorization).

### Risk carried into implementation: AC 5's Safari leg

AC 5 names Chrome **and** Safari. Safari is macOS-only and this worktree is Windows; a Vitest browser run is
impossible in footprint (no new packages), so the AC's own "browser test page" branch is the path. Chrome is
runnable by the lead's per-story smoke; **Safari is an author-owned leg**, exactly as Spike 1's two macOS
gating legs were left author-owned and unmeasured while the story still closed. If the Safari leg is unrun
at story close it becomes a ledger entry with the observable named, not a silent pass. This is flagged as a
risk rather than an intent gap because the leg is measurable — just not by this agent on this platform.

## Verification

**Commands:**
- `pnpm typecheck` — expected: clean.
- `pnpm lint:boundaries` — expected: exit 0; `sim/**` stays DOM-free and random-free.
- `pnpm check:headers` — expected: exit 0; every new authored `.ts` carries the GPL-3.0 header.
- `pnpm check:attributions` — expected: exit 0; **proves no new package was added**.
- `pnpm test` — expected: green, with the golden replays and the sweep's new pins included.
- `node tools/replay-parity/serve.mjs` then open the printed URL in Chrome — expected: every golden reports
  PASS on the `GameState` portion.

**Manual checks (if no CLI):**
- Each mutation in the sweep table: apply, run `pnpm test`, **observe the red**, restore, record the
  observed failure verbatim in this spec. A mutation asserted but not run is not evidence.
- The Safari leg of AC 5, on the author's macOS machine.

## Auto Run Result

Status: blocked
Blocking condition: intent gap

### The gap, in one sentence

**Story 1.8's AC 4 requires five goldens under `test/replays/`, but no golden can be expressed as the
`ReplayHeader + InputTransition[]` that AC 1, AD-4 and AD-15 define a replay to be — because in Epic 1 no
input transition can put a ball in play, and all five named scenarios need at least one ball.**

### Evidence (type-level, not inferential)

1. `src/sim/rules/index.ts:30` declares `readonly commands: readonly never[]` on `RulesStepResult`, and
   `:52` returns `commands: []`. The rules layer therefore **cannot** issue a `CoilCommand` at the type
   level — not "does not today", but cannot.
2. A ball reaches the playfield only via `loop.pulseCoil('c_trough_eject')`
   (`src/sim/loop/index.ts:62,340`), documented in-file as a **dev-only escape hatch** and named in
   `src/host/loop.ts:36` as Story 2.5's to replace.
3. `InputAction` (`src/sim/contracts/input.ts:12-20`) is the closed set
   `flipper_l · flipper_r · plunger · nudge_l · nudge_r · nudge_up · start · menu`. None reaches a coil, and
   `start` reaches no rules path that serves (see 1).
4. Therefore all five goldens — roll-and-drain, cradle-and-release, full plunge, nudge coupling, two-ball
   collision — are unreachable from a replay body alone. `test/machine-serve-drain.test.ts:306,336,366,524`
   confirms the only working serve path in the suite is `loop.pulseCoil(...)`.

### The two defensible readings, and why I did not pick one

- **Reading A:** a golden file may carry a declared coil-pulse prologue **alongside** the
  `ReplayHeader + InputTransition[]`. AC 1 stays untouched (the `Replay` type is unchanged); AC 4 becomes
  satisfiable. Cost: AD-4's sentence "a replay … must reproduce the state hash" is no longer literally true
  in Epic 1, which under Rule 6 is a HIGH-severity AD deviation needing authorization, not agent judgement.
- **Reading B:** AC 4 is un-satisfiable as worded and `epics.md` is amended.

Nothing in the intent selects between them, and step-02's own rule forbids resolving an intent gap by
picking a reading. Rule 5 forbids planning around it. This is additionally the *same class of mistake the
sweep mandate exists to prevent*: recording five goldens on a foundation whose contract-completeness is
unresolved would promote the gap to specification, and the next person to see a golden break would
re-record it rather than question it.

### Recommended amendment (one edit to `_bmad-output/planning-artifacts/epics.md`, covering both open items)

Amend Story 1.8's AC 4 (`epics.md:629-632`) to name the Epic 1 prologue explicitly **and** rename the cradle
golden in the same edit:

> **Given** `test/replays/`
> **When** CI runs Vitest in Node
> **Then** goldens for roll-and-drain, **hold-and-release**, full plunge, nudge coupling, and a two-ball
> collision (momentum transferred, no overlap, no sticking) replay to their recorded hashes
> **And** the two-ball golden also asserts the balls' separation never drops below one diameter
> **And** because Epic 1's rules layer cannot yet issue a coil command (`RulesStepResult.commands` is
> `readonly never[]`), each golden carries a **declared coil prologue** alongside its
> `ReplayHeader + InputTransition[]` — the `pulseCoil` sequence that puts a ball in play — recorded as data
> in the golden file and re-asserted on replay; Story 2.5 removes the prologue when Start serves through the
> rules layer, and re-records the goldens.

The rename half is the mandate's own recorded decision, adopted here as a scoping call (see `## Design
Notes`): this table cannot hold a cradle (`DW-72`), so a golden named "cradle" would encode roll-off as the
cradle reference and would be re-recorded rather than questioned when Story 2.1 lands the pocket.

**Alternative the lead may prefer instead:** have Story 1.8 implement the minimal Start-to-serve rules path.
Rejected here because the epic context states "the rules layer in this epic is only the minimal step that
runs after every physics step" and this would pre-build Story 2.5's ball lifecycle.

### Two further findings the lead should see while amending (neither is blocking)

- **No new npm package can be added in this story.** `tools/check-attributions.mjs:54-60,75-80,102-106`
  fails CI and `pnpm test` for any dependency with no `ATTRIBUTIONS.md` row, and `ATTRIBUTIONS.md` is out of
  footprint with its one-time widening spent. This closes the sweep mandate's "propose adding coverage
  instrumentation" branch, and it closes AC 5's "Vitest browser run" branch. Both have in-footprint
  substitutes planned above (a `dependency-cruiser` import-reachability check; the AC's own "browser test
  page" branch under `tools/**`). If the lead would rather have real coverage, that needs an
  `ATTRIBUTIONS.md` widening, which is a user decision.
- **AC 5's Safari leg is author-owned.** Safari is macOS-only; this is a risk recorded in `## Design Notes`,
  not an intent gap, because Spike 1 set the precedent of closing with author-owned macOS legs recorded as
  unmeasured.

### What is already done and survives a re-dispatch

The full investigation is preserved in `## Code Map` and `## Design Notes` above: the AD-5 seam enumeration
(**four** pre-step calls, and `deviceMechanics.applyCommands()` at `src/sim/physics/machine.ts:147` is a
**fourth, unpinned instance** — the dispatch briefing was stale in believing the cabinet call was the
unpinned one; Story 1.7's commit `35636fe` pinned it), the invariant-to-test table, all six owned ledger
entries with named mutations, seven vacuity candidates, and the measured CRLF parity hazard. A re-plan after
the amendment should reuse this rather than re-derive it.
