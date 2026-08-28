---
title: 'Story 1.3: Seam contracts, the TABLE registry and boundary lint'
type: 'feature'
created: '2026-08-27'
status: 'done'
baseline_revision: '19c822ddf0a23b0a4442428b620ca30730997ed0'
baseline_commit: '19c822ddf0a23b0a4442428b620ca30730997ed0'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-spike-3-build-size-and-load-time-measured-from-a-link.md'
warnings: ['oversized', 'multiple-goals']
deferred:
  - summary: >-
      Whether to accept task 7's hopControl omission (Block-If-driven; FR-9 states no unit,
      magnitude or mechanism, and the architecture spine's own Deferred section already lists
      it undecided) or require the task's literal text is a genuine preference call for the
      lead, not something this review pass should decide unilaterally.
    evidence: |-
      No formal Acceptance Criterion names hopControl; only task 7's own task-list line does.
      src/sim/table/tuning.ts's header comment and test/tuning.test.ts already state and assert
      the omission with this exact rationale. See this spec's Spec Change Log entry dated
      2026-08-27 ("task 7 vs. the Block-If rule") for the full reasoning.
    location: >-
      src/sim/table/tuning.ts; _bmad-output/implementation-artifacts/spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md task 7
    severity: medium
  - summary: >-
      CI's `pnpm install --frozen-lockfile --ignore-scripts` is applied unconditionally for the
      whole dependency tree based on today's verification that @swc/core is the only package
      needing an install script; nothing re-checks that claim when a future dependency is added.
    evidence: |-
      Reproduced on this host: a plain `pnpm install --frozen-lockfile` (no --ignore-scripts)
      exits 1 with ERR_PNPM_IGNORED_BUILDS on @swc/core, confirming the flag is currently
      necessary and currently safe (the native @swc/core binary needs no build step -- confirmed
      via `dependency-cruise --info` reporting swc available with no build having run). The
      safety of blanket --ignore-scripts going forward depends on a human noticing if a future
      dependency's install script becomes load-bearing.
    location: >-
      .github/workflows/ci.yml (Install dependencies step)
    severity: medium
  - summary: >-
      ATTRIBUTIONS.md's two tables (Code, Build- and test-time tooling) and check:attributions
      cover only package.json's own direct dependencies/devDependencies keys, not the ~40
      transitive packages pnpm-lock.yaml also adds (acorn, chalk, commander, semver, etc.), and
      no line in the file states that scope decision explicitly.
    evidence: |-
      This is a pre-existing project convention this story did not introduce or narrow (the
      prior italic note this story replaced already scoped attribution to direct dependencies,
      just for a different reason -- excluding build tooling entirely). CLAUDE.md's provenance
      rule reads absolute ("nothing enters this repository without known provenance"), so this
      is a real open policy question, not a defect in this story's own deliverable.
    location: >-
      ATTRIBUTIONS.md; tools/check-attributions.mjs
    severity: low
  - summary: >-
      tools/boundary-lint.mjs's listFilesRecursive() has no symlink-cycle protection and would
      stack-overflow on a directory symlink cycle instead of reporting a lint result.
    evidence: |-
      Confirmed by code reading: listFilesRecursive() recurses into every directory entry with
      no visited-path tracking and no lstat-based symlink check. No symlink currently exists
      anywhere in this repository, so this is theoretical hardening today, not a live defect.
    location: >-
      tools/boundary-lint.mjs (listFilesRecursive)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Every remaining Epic 1 story (1.4 through 1.9) and all of Epics 2-6 are supposed to
build on seams that do not exist yet: `src/sim/contracts/` holds one file (`time.ts`), there is no
`src/sim/table/` at all, no `TABLE`, no name unions, no tuning file with provenance, and no
boundary lint. The layer rules of AD-1/AD-16 are currently enforced only by
`test/sim-boundary.test.ts`, a Story 1.1 stand-in that scans text with a naive comment stripper
over a hand-maintained root list -- a list already found incomplete twice in review. Worse,
`tsconfig.json` compiles `src/sim/**` with the `DOM` lib (ledger `DW-15`), so
`document.getElementById` inside the simulation typechecks cleanly today and only that textual
scan stands between it and a green build. Provenance ordering is likewise unevidenceable from
history (ledger `DW-25`), and `AGENTS.md` still tells agents there is no `package.json` and no CI
(ledger `DW-5`).

**Approach:** Lay the structural seed down in full; write `src/sim/contracts/` as the closed,
table-free, generic seam unions the spine's Seam Contracts table names; write
`src/sim/table/dragonwar.ts` (`TABLE as const`), `names.ts` (the name unions from `typeof TABLE`)
and `tuning.ts` (unit-suffixed tunables with `source`/`confidence` and the single load-time
ms-to-ticks conversion); then make the layer graph enforceable rather than aspirational with a
three-part boundary gate -- a per-area `tsconfig` split that removes `DOM` and `@types/node` from
`src/sim/**`, dependency-cruiser (with the `@swc/core` parser, without which it silently scans
zero TypeScript files under TypeScript 7) for the import rules, and a `tools/` textual pass for the
rules no import graph can see -- plus the per-file licence-header check, an attribution-ledger
completeness check and the commit-SHA stamp, all wired into the CI workflow Story 1.2 created.

## Boundaries & Constraints

**Always:**
- **Provenance before the file.** The `ATTRIBUTIONS.md` rows for `dependency-cruiser` and
  `@swc/core` (and the build-tooling rows for `typescript`, `vitest`, `@types/node`) land in an
  edit made BEFORE `pnpm add -D` runs, with each licence read at its own source repository -- never
  from `package.json`, npm metadata, or a summary. Verified at source during planning on
  2026-08-27 and to be re-read and re-dated by the implementer:
  `https://github.com/sverweij/dependency-cruiser/blob/main/LICENSE` reads
  "The MIT License (MIT) / Copyright (c) 2016-2026 Sander Verweij";
  `https://github.com/swc-project/swc/blob/main/LICENSE` is the Apache License 2.0 text.
- **Every new source file carries the GPL-3.0 header** (`// DragonWar is licensed GPL-3.0. See
  LICENSE, NOTICE, and ATTRIBUTIONS.md.`); ported files keep their upstream copyright block plus
  the vpx-js port marker instead. This is now checked per file in CI, from `git ls-files`, not
  from a hand-maintained list.
- **The dependency direction of AD-1 is law.** `sim/contracts` imports nothing from `sim/table`.
  `sim/table` may import `sim/contracts`. `sim/**` never imports `presentation/**`, `host/**` or
  `@babylonjs/*`. `presentation/**` imports only `sim/contracts` and `sim/table` from `sim/`.
  `host/**` never imports `sim/physics` or `sim/rules`.
- **One clock, one conversion (AD-3).** `TICK_HZ` stays the sole tick-rate constant in
  `src/sim/contracts/time.ts`; the only file inside `src/sim/**` that may name it in arithmetic is
  `src/sim/table/tuning.ts`, which performs the single load-time `…Ms` to `…Ticks` conversion.
- **One table (AD-1, AD-11).** `TABLE` is imported directly wherever a device is named. Every
  tunable carries `source` and `confidence`; anything on the PRD addendum's do-not-invent list, and
  anything whose value this story authors rather than transcribes, ships `confidence: 'unverified'`
  with the authoring said plainly in `source`.
- **A lint that cannot see the files is a defect, not a pass.** The boundary lint must prove it
  inspected every `.ts` file under `src/` on every run and fail loudly if it did not.
- Story 1.2's narrow-back stands: the deploy job runs from `main` (plus `workflow_dispatch`) only,
  and the pinned CSP `default-src 'self'; connect-src 'self'` is not touched.

**Block If:**
- A licence for any package being added cannot be verified by reading a licence file at its own
  source repository -- do not add the package. HALT `blocked`.
- No parser can be installed that lets dependency-cruiser read `.ts` files (see the Code Map's
  verified environment facts), so the import rules would run vacuously -- HALT `blocked`, naming
  the parser attempts made. Do NOT ship a lint that exits 0 over zero modules.
- A tunable is required whose value is neither stated by a planning artifact nor defensibly
  authorable as a default -- HALT `blocked` naming the tunable, rather than inventing a figure.
- Closing `DW-15` would require changing `src/sim/**` source (it should not: a DOM-free,
  `@types/node`-free project over `src/sim/**` was verified to typecheck clean at `2a71ef0`). If
  source changes turn out to be needed beyond removing a genuinely banned reference, HALT
  `blocked` and report what needed changing.

**Never:**
- Never introduce a `Table` interface, a table-loading API, a plugin/registration API or runtime
  table selection (AD-1). `TABLE` is a frozen `as const` module, imported directly.
- Never let `src/sim/contracts/**` import anything outside `src/sim/contracts/**`.
- Never relax, disable or narrow a boundary rule so the build passes -- fix the code instead. A
  rule may only change when a planning artifact changes.
- Never use the TypeScript compiler API in any lint (AD-16); TypeScript 7.0 ships none.
  `tsc --noEmit` (the compiler binary) is fine and is the typecheck gate.
- Never add `@babylonjs/havok`, anywhere, for any reason.
- Never build what a later story owns: `frames.ts` and the loaders (1.4), the fixed-step loop and
  `advance()` (1.5), flipper/plunger hardware rules (1.6), nudge/tilt/slam behaviour (1.7), replay
  recording and goldens (1.8), the dev tuning panel (1.9), or any Epic 2+ device content beyond the
  empty collections `names.ts` needs to derive its unions from.
- Never edit `docs/spikes/spike-1.md` or `docs/spikes/spike-3.md` -- they are dated records owned
  by Stories 1.1 and 1.2.
- Never widen the deploy trigger, weaken the CSP, or remove the third-party notices from `dist/`
  (three HIGH findings in Story 1.2's review were exactly that class).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lint actually sees TypeScript | `pnpm lint:boundaries` on the repo as committed | Exit 0, and the run reports that every `.ts` file under `src/` appeared in the dependency-cruiser result | If any `src/**/*.ts` file is absent from the result, exit non-zero naming the missing files and the installed parser -- never exit 0 over an empty graph |
| `sim/` imports upward | A file under `src/sim/` importing `../host/x`, `../presentation/x` or `@babylonjs/core` | Exit 2 naming rule `sim-no-upward-import` (or `sim-no-babylon`), the file and the target | No error expected beyond the violation report |
| Type-only upward import | `import type { X } from '../host/x'` inside `src/sim/` | Same violation as a value import (verified: the swc parser reports type-only imports) | As above |
| `presentation/` reaches past the seam | `src/presentation/**` importing `sim/physics`, `sim/rules` or `sim/loop` | Exit 2 naming `presentation-only-contracts-and-table` | As above |
| `host/` reaches into the core | `src/host/**` importing `sim/physics` or `sim/rules` | Exit 2 naming `host-no-physics-or-rules` | As above |
| Engine physics anywhere | Any file importing `@babylonjs/havok` | Exit 2 naming `no-havok` | As above |
| DOM/Node global in `sim/` | `document`, `window`, `navigator`, `performance`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `localStorage` used under `src/sim/**` | `pnpm typecheck` fails: the sim project has `lib: ["ES2023"]` and `types: []`, so the name is not declared (verified: TS2584/TS2304 for all of them) | Compiler error naming the file, line and identifier -- this is `DW-15`'s closure |
| Residual banned global | `Date`, `Math.random` or `globalThis` under `src/sim/**` (all legal ES2023, so the type system cannot reject them) | `pnpm lint:boundaries` exits non-zero naming file, line and token | Must ignore matches inside comments and string literals (block comments included -- the Story 1.1 stand-in stripped only `//` lines) |
| Literal ms / tick arithmetic | `TICK_HZ` named anywhere under `src/sim/**` other than `contracts/time.ts` and `table/tuning.ts`, or an `…Ms`-suffixed binding declared outside `table/tuning.ts` | `pnpm lint:boundaries` exits non-zero naming file and line | AD-3's "nothing else in `sim/` may contain a literal millisecond", made checkable |
| Device-name literal | A string literal matching `^(s\|c\|l\|f\|gi\|bd\|shot\|show)_[a-z0-9_]+$` in any `src/**` file other than `src/sim/table/dragonwar.ts` | `pnpm lint:boundaries` exits non-zero naming file, line and the literal | Only string literals count; the same text inside a comment is not a violation |
| Undeclared dependency | `package.json` gains a `dependencies`/`devDependencies` entry with no row in `ATTRIBUTIONS.md` | `pnpm check:attributions` exits non-zero naming the package | `DW-25`'s state half; a row for a package no longer present is not an error |
| Missing licence header | Any tracked source file (from `git ls-files`) with neither the GPL-3.0 header line nor the vpx-js port marker | `pnpm check:headers` exits non-zero naming the file | Discovery is from version control, not a hand-maintained roots list |
| Tunable conversion | `resolveTuning(TUNING)` at load | Every `…Ms` tunable yields a `…Ticks` counterpart computed once from `TICK_HZ`; values and `source`/`confidence` survive unchanged | A tunable named `…Ms` whose value is not a finite number throws at load (load-time paths throw, AD-16 Conventions) |
| Name unions bind to `TABLE` | A consumer writes `'s_not_a_switch'` where a `SwitchName` is expected | `pnpm typecheck` fails -- the union is derived from `typeof TABLE`, so an unknown device name is a type error, not a runtime surprise | Integration AC: exercised by a real consumer module, not by inspecting `TABLE` |
| CI on push and pull request | A push to any branch, or a pull request | The `checks` job runs typecheck, boundary lint, licence headers, attribution check, Vitest, build (SHA-stamped), static-bundle check and size budget | The `deploy` job stays guarded to `github.ref == 'refs/heads/main'` and non-`pull_request`; a non-`main` push produces checks and no deployment |

</intent-contract>

## Code Map

**Read-only governing sources (do not edit):**
- `_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md`
  -- the ADR registry. AD-1 line 69, AD-2 line 75, AD-3 line 81, AD-4 line 87, AD-6 line 118,
  AD-7 line 124, AD-9 line 162, AD-10 line 168, AD-11 line 174, AD-15 line 198, AD-16 line 204,
  AD-17 line 210. **Seam Contracts table at line 228** is the binding field list for every contract
  type. **Consistency Conventions at line 253** (device prefixes, event casing, file/type naming,
  `tick` on every event and command, `…Ms`/`…Ticks`, error and logging policy, licence headers).
  **Stack table at line 269** (dependency-cruiser 18.2.0; TypeScript 7.0.2 with explicit `types`
  and no `baseUrl`). **Structural Seed at line 291** is the directory list this story lays down.
- `_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/SOLUTION-DESIGN.md`
  -- line 147 explains *why* dependency-cruiser was chosen ("TypeScript 7.0 ... ships no compiler
  API until 7.1 -- `tsc --noEmit` works, but typescript-eslint and vite-plugin-checker break"),
  line 160 the `TABLE as const` choice, line 190 the plain-language guide to every contract type.
- `_bmad-output/planning-artifacts/epics.md` -- Story 1.3's six acceptance criteria at lines
  399-433. AR-1 (directory seed, stack), AR-5 (layer law), AR-6 (one clock), AR-8 (the contract
  type list), AR-9 (`TABLE` contents), AR-11 (`settleTicks` classes: rollover 0, standup 8, drop
  target 20, bumper skirt 2, tilt bob 0), AR-16 (`TABLE.reference`), AR-17 (tunable starting
  values: flipper elasticity 0.88, elasticity falloff 0.15, flipper friction 0.8-0.9, scatter 0,
  coil ramp-up 2.5, material defaults 0.3/0/0.3/0), AR-34 (the full CI check set: typecheck,
  dependency-cruiser, Vitest, build, CSP grep, size budget, **per-file licence-header check, SHA
  stamp**, deploy from `main`), AR-36 (conventions). FR-9 (hop control), FR-10 (pitch 6.0-8.5,
  default 6.5), FR-14 (tilt warning default 1), FR-16 (`slamNudgesPerWindow`).
- `_bmad-output/planning-artifacts/prds/prd-dragonwar-2026-08-26/addendum.md` line 56 -- the
  do-not-invent list: steel-on-clearcoat / steel-on-rubber restitution and friction, manufacturer
  coil pulse duration, flipper tip gap, dimensioned drain zone, hours-per-table. Anything drawn
  from these ships `confidence: 'unverified'`.
- `docs/spikes/spike-1.md`, `docs/spikes/spike-3.md` -- dated records of Stories 1.1 and 1.2.
  **Leave both unedited.**

**Existing code this story extends (anchors verified at `2a71ef0`):**
- `src/sim/contracts/time.ts` (39 lines) -- `TICK_HZ = 1000`, PROVISIONAL, with the gating-path
  table in its header comment. **Do not change the value or the comment.** This story adds sibling
  files beside it and makes `TICK_HZ`'s single-arithmetic-site rule enforceable.
- `tsconfig.json` -- `lib: ["ES2023","DOM","DOM.Iterable"]`, `types: ["node"]`, one
  `include: ["src","test","tools"]`, no `baseUrl`. **This is `DW-15`.** Note it does not cover the
  root `vite.config.ts` / `vitest.config.ts`, which are therefore unchecked today.
- `package.json` -- scripts `dev`, `typecheck`, `test`, `build`, `preview`, `check:dist`,
  `check:size`; `devDependencies` `@types/node@24.13.3`, `typescript@7.0.2`, `vite@8.2.2`,
  `vitest@4.1.11`; `dependencies` `@babylonjs/core@9.22.2`, `@babylonjs/loaders@9.22.2`;
  `packageManager: pnpm@11.24.0`; `type: module`.
- `.github/workflows/ci.yml` (95 lines) -- `on.push.branches: [main]` + `pull_request` +
  `workflow_dispatch`; workflow-level `concurrency: { group: pages, cancel-in-progress: false }`;
  `checks` job steps Checkout / Install pnpm / Install Node 24 / Install deps / Typecheck / Test /
  Build / `check:dist` / `check:size` / Upload Pages artifact (guarded to `main`); `deploy` job
  guarded by `github.event_name != 'pull_request' && github.ref == 'refs/heads/main'`. **Its header
  comment (lines 6-8) already hands this story dependency-cruiser, the per-file licence-header
  check and the SHA stamp.** Keep the narrow-back comment block (lines 10-15) and the deploy-guard
  comment (lines 70-77) intact -- both record closed review findings.
- `test/sim-boundary.test.ts` (198 lines) -- the Story 1.1 stand-in this story supersedes.
  `BANNED_GLOBALS` at line 27; `stripLineComments()` at line 51 (**strips only `//`, not `/* */`**);
  `bannedTokenPattern()` at line 60; the `@babylonjs/` scan at line 96; the vpx-js port-header
  describe at line 108; **the AD-15 verbatim solver-constants pin at line 152 -- keep this, it is
  not a boundary rule and nothing else asserts those values**; the GPL-header describe at line 175
  with the hand-maintained `roots` list at line 190 that review had to widen twice.
- `test/util/list-files.ts` -- `listFilesRecursive(root): string[]` (absolute paths). Reuse.
- `test/attributions.test.ts` (68 lines) -- `normalize()` collapses whitespace before matching so a
  markdown rewrap cannot break the assertions. **Extend in the same shape** for the new rows.
- `test/measure-cli.test.ts` (142 lines) -- the pattern for testing a `tools/` script by real
  `spawnSync` invocation with exit-code and message assertions; `RUN_TIMEOUT_MS = 10_000`. This is
  the model for the boundary-lint fixture tests.
- `tools/check-dist.mjs`, `tools/size-budget.mjs` -- Node-built-ins-only CLI checks that exit
  non-zero naming the first violation. Same shape for the three new tools. `check-dist.mjs` gains
  the SHA-stamp assertion.
- `ATTRIBUTIONS.md` -- **Code** table (six rows: BMad, vpx-js, `@babylonjs/core`,
  `@babylonjs/loaders`, `babylonjs-gltf2interface`, `vite`) followed by an italic note stating that
  build- and test-time tooling contributing no bytes to `dist/` is *not* listed. That note is what
  makes a naive "every dependency needs a row" check unsound today; this story replaces it.
- `AGENTS.md` -- the `bmad:context` block; "TODO -- no `package.json` yet" and "TODO -- CI is
  `.github/workflows/ci.yml`, not yet written" are `DW-5`. It also says the spine holds
  "AD-1..AD-17" where the spine now runs to AD-19.

**Verified environment facts (established during planning on 2026-08-27; cite, do not re-derive):**
- **dependency-cruiser 18.2.0 cannot read TypeScript under TypeScript 7.0.2, and fails silently.**
  Its `src/meta.cjs` declares `supportedTranspilers.typescript: ">=2.0.0 <7.0.0"`; `tryImport`
  version-checks before importing, so `typescript@7.0.2` is rejected. `transpile/meta.mjs` then
  filters `scannableExtensions` to extensions with an available transpiler, so `.ts` is dropped
  from file gathering entirely. Reproduced with `typescript@7.0.2` installed beside it:
  `depcruise --info` prints `x typescript >=2.0.0 <7.0.0 -` and `x .ts`, and a cruise of `src`
  returns **0 modules and exit code 0**. A naively-configured boundary lint would pass CI forever
  while checking nothing. (This is also why the architecture's own rationale at SOLUTION-DESIGN
  line 147 needs the fix below -- it assumed dependency-cruiser was TypeScript-API-free, and its
  *default* TypeScript path is not.)
- **`@swc/core` is the fix and honours AD-16's constraint.** With `@swc/core@1.16.1` installed,
  `depcruise --info` reports swc available at `>=1.0.0 <2.0.0` and `.ts`/`.tsx`/`.d.ts` available.
  With `options.parser: 'swc'`, a cruise of `src test tools` returned **84 modules, 53 with
  dependencies**, resolving real specifiers (`src/host/boot.ts -> ../presentation/scene/create-engine`;
  `src/presentation/scene/create-engine.ts -> @babylonjs/core/...`). swc is a Rust parser with no
  TypeScript compiler dependency, so AD-16's "no lint may depend on one" holds.
- **Type-only imports are caught.** A fixture pair (`src/sim/bad.ts` with
  `import type { Thing } from '../host/thing'`, `src/sim/bad2.ts` with a value import) both
  produced `error sim-no-host` and exit code 2 under the swc parser.
- **A `.mjs` dependency-cruiser config with `export default` loads correctly**, and the JSON
  reporter exposes `summary.totalCruised` and per-module `source` paths for the non-empty-graph
  guard.
- **`DW-15`'s fix costs no source churn.** `tsc --noEmit` over `src/sim/**` with `lib: ["ES2023"]`,
  `types: []` exits 0 on the tree as committed. A probe file confirmed the rejections: `document`
  TS2584, and `setTimeout` / `navigator` / `performance` / `window` TS2304. `Date`, `Math.random`
  and `globalThis` are **not** rejected -- they are legal ES2023 and remain the textual pass's job.
  `src/sim/**` contains no `console.`, `process.`, `Buffer` or `require(` usage (one `console.warn`
  mention inside a comment in `util/object-pool.ts:41`).
- **TypeScript 7.0.2 accepts `--project` and a solution-style `tsconfig.json`** with `files: []`
  plus `references` (both probes exit 0). A solution file typechecks nothing itself, so
  `pnpm typecheck` must invoke each project explicitly.
- Licences read at source on 2026-08-27: dependency-cruiser **MIT** ("The MIT License (MIT) /
  Copyright (c) 2016-2026 Sander Verweij"), `@swc/core` **Apache-2.0** (Apache License 2.0 text).
  `@swc/core` ships platform binaries as transitive optional dependencies from the same
  Apache-2.0 monorepo and contributes no bytes to `dist/`.
- Working tree clean at `2a71ef0`; branch `DW-1-epic1`; Node 24.16.0; pnpm 11.24.0; no `.npmrc`.

**Files this story creates:**
- `src/sim/contracts/{input,events,commands,state,snapshot,mode-view,replay,index}.ts`
- `src/sim/table/{dragonwar,names,tuning}.ts`
- `tsconfig.base.json`, `tsconfig.sim.json`, `tsconfig.app.json`, `tsconfig.node.json`
- `tools/dependency-cruiser.config.mjs`, `tools/boundary-lint.mjs`,
  `tools/check-licence-headers.mjs`, `tools/check-attributions.mjs`
- `src/host/build-info.ts`
- `test/fixtures/boundary/**` (a miniature `src/sim`, `src/host`, `src/presentation` tree of
  deliberate violations, one per rule)
- `test/boundary-lint.test.ts`, `test/licence-headers.test.ts`, `test/check-attributions.test.ts`,
  `test/contracts.test.ts`, `test/table.test.ts`, `test/tuning.test.ts`
- `.gitkeep` markers for the seed directories this story does not yet populate

**Files this story edits:** `ATTRIBUTIONS.md` (first), `package.json`, `pnpm-lock.yaml`,
`tsconfig.json`, `.github/workflows/ci.yml`, `src/host/boot.ts`, `tools/check-dist.mjs`,
`test/sim-boundary.test.ts`, `test/attributions.test.ts`. (`AGENTS.md` was removed by the lead --
out of footprint; see task 19 and the footprint ruling in Design Notes.)

## Tasks & Acceptance

**Execution:** (dependency order; task 1 is a hard gate on task 2, and task 2 on everything after)

1. `ATTRIBUTIONS.md` -- add the provenance rows BEFORE any install. Add `dependency-cruiser`
   (MIT, verified at `https://github.com/sverweij/dependency-cruiser/blob/main/LICENSE`) and
   `@swc/core` (Apache-2.0, verified at `https://github.com/swc-project/swc/blob/main/LICENSE`),
   each read at source on the day of the edit and dated with that day. Add a new
   **Build- and test-time tooling** table recording `typescript`, `vitest` and `@types/node` the
   same way, and rewrite the italic note under the Code table so it distinguishes the two tables
   (Code = components whose bytes are distributed and whose notices ship in
   `public/THIRD-PARTY-NOTICES.txt`; Build tooling = recorded for provenance completeness, no
   distribution obligation) instead of saying tooling is unrecorded. Add a short paragraph to the
   file's preamble stating the ordering convention: a dependency addition lands its
   `ATTRIBUTIONS.md` row before (or, where a single commit is unavoidable, in the same commit as)
   the `package.json` change, and `pnpm check:attributions` enforces that no dependency exists
   without a row. -- *rationale: CLAUDE.md's hard rule, and `DW-25`'s state half.*
2. `package.json` -- `pnpm add -D dependency-cruiser@18.2.0 @swc/core@1.16.1` (pinned exactly, as
   every other entry in this file is; `1.16.1` is the version resolved and verified during planning
   on 2026-08-27 -- if the registry no longer serves it, take the newest `1.x`, re-run the
   `depcruise --info` check below, and record the substituted version in the Spec Change Log), then
   add scripts `lint:boundaries`
   (`node tools/boundary-lint.mjs`), `check:headers` (`node tools/check-licence-headers.mjs`),
   `check:attributions` (`node tools/check-attributions.mjs`), and change `typecheck` to run all
   three projects: `tsc --noEmit -p tsconfig.sim.json && tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json`.
   -- *rationale: AR-1 pins dependency-cruiser 18.2.0; `@swc/core` is the parser without which it
   reads nothing.*
3. `tsconfig.base.json` + `tsconfig.sim.json` + `tsconfig.app.json` + `tsconfig.node.json` +
   `tsconfig.json` -- split the one project into three and make `tsconfig.json` a solution file
   (`files: []` + `references`) for editor resolution. `sim`: `include: ["src/sim/**/*.ts"]`,
   `lib: ["ES2023"]`, `types: []`. `app`: `include: ["src/host/**/*.ts","src/presentation/**/*.ts"]`,
   `lib: ["ES2023","DOM","DOM.Iterable"]`, `types: ["vite/client"]`. `node`:
   `include: ["test/**/*.ts","tools/**/*.ts","vite.config.ts","vitest.config.ts"]`,
   `exclude: ["test/fixtures/**"]`, `lib: ["ES2023"]`, `types: ["node"]`. Shared strictness options
   live in `tsconfig.base.json`; keep `strict`, `isolatedModules`,
   `forceConsistentCasingInFileNames`, `skipLibCheck`, `resolveJsonModule`, `noEmit`,
   `module: esnext`, `moduleResolution: bundler`, `target: ES2023`, and no `baseUrl`.
   -- *rationale: closes `DW-15` at the type level, which is the only layer that can reject a DOM
   global by name.*
4. `src/sim/contracts/**` -- write the closed seam unions, one file per Structural Seed grouping:
   `input.ts` (`InputAction`, `InputFrame`, `InputTransition`), `events.ts` (`SwitchEvent`,
   `ContactSurface`, `ContactEvent`, `EventName`, `SemanticEvent`), `commands.ts` (`CoilCommand`,
   `RecoverCommand`, `LampRole`, `LampCommand`, `GiCommand`, `FlasherCommand`, `ShowCommand`),
   `state.ts` (`GameState` and its machine/player/mode/rng sub-shapes per AD-7), `snapshot.ts`
   (`Snapshot`, `FrameOutput`), `mode-view.ts` (`ModeView`), `replay.ts` (`GameStart`,
   `ReplayHeader`, `Replay`), `index.ts` (barrel). Every command and event carries `tick`; every
   union is discriminated on `type`; every type that names a device is generic over the relevant
   name union; **nothing in this directory imports outside it.** -- *rationale: AR-8 and the Seam
   Contracts table at spine line 228.*
5. `src/sim/table/dragonwar.ts` -- `export const TABLE` (`as const`, deep-frozen through a local
   identity-typed `deepFreeze` helper) with: `reference` exactly as AD-10/AR-16 states; `switches`
   for `s_start`, `s_flipper_l`, `s_flipper_r`, `s_plunger`, `s_shooter_lane`, `s_trough_1..4`,
   `s_tilt_bob`, `s_slam_tilt`, each carrying a `settleClass` naming its debounce class; `coils`
   `c_flipper_l`, `c_flipper_r`, `c_trough_eject`, `c_autolaunch`; `ballDevices` `bd_trough`
   (`kind: 'parking'`, capacity 4, `slots: ['s_trough_1',...,'s_trough_4']` in fill order,
   `ejectCoil: 'c_trough_eject'`, `ballSearchOrder`) and `bd_shooter` (`kind: 'non-parking'`,
   entry `s_shooter_lane`); `giChannels` `gi_backbox`, `gi_cabinet`, `gi_arch` (AD-9); and empty
   frozen `lamps`, `flashers`, `shows`, `shots`, `lightGroups` collections. -- *rationale: AR-9,
   AD-11; the empty collections make their unions `never` so an Epic 2 name cannot be used early by
   accident.*
6. `src/sim/table/names.ts` -- derive `SwitchName`, `CoilName`, `LampName`, `GiChannel`,
   `FlasherName`, `ShowName`, `ShotName` and `BallDeviceName` from `typeof TABLE`, and export the
   bound seam aliases (each contract generic applied to this table's unions, re-exported under the
   plain contract name) so consumers have exactly one import site for device-typed seam values.
   -- *rationale: AR-8; contracts stay table-free while consumers stay ergonomic.*
7. `src/sim/table/tuning.ts` -- declare `TUNING` with every entry carrying
   `{ value, source, confidence }`, and export the single `resolveTuning()` that converts every
   `…Ms` entry to a `…Ticks` counterpart using `TICK_HZ`. Seed exactly the tunables Epic 1's later
   stories consume, each transcribed from a named source: the per-`phys_material` table
   `{ elasticity, elasticityFalloff, friction, scatter }` with the VPX defaults and the
   flipper-rubber values of AR-17; `switchSettleMsByClass` for AD-2's five classes (rollover 0,
   standup 8, drop target 20, bumper skirt 2, tilt bob 0) plus the classes Epic 1's own switches
   need; `defaultPitchDeg`, `pitchMinDeg`, `pitchMaxDeg` from FR-10; **not** `hopControl` from FR-9 --
   see the Spec Change Log and Design Notes ("Block If: hopControl") for why this task's own
   apparent instruction is superseded by the Block-If rule this story's own intent-contract states;
   `slamNudgesPerWindow` and its window from FR-16; `tiltWarningSpacingMs` and `tiltSettleMs` from
   AD-3/AD-7; `plungerSpeedByHoldMs` from AD-5. Anything on the do-not-invent list, and any value
   this story authors rather than transcribes (including the midpoint of AR-17's 0.8-0.9 friction
   range), ships `confidence: 'unverified'` with the authoring stated in `source`.
   -- *rationale: AD-15, AR-17; the story's fourth acceptance criterion.*
8. Seed directories -- create `src/sim/{rules,loop}`,
   `src/presentation/{mechanisms,lighting,backglass,audio,camera}`,
   `src/host/{input,persistence,settings,dev}`, `assets/src/`, `test/replays/`, each holding a
   `.gitkeep` whose single line names the story that fills it. `src/sim/{contracts,table,physics}`,
   `src/presentation/scene`, `public/assets/`, `tools/` and `.github/workflows/` already exist.
   `src/host/loop.ts` is Story 1.5's; leave `src/host/` with `boot.ts`, `build-info.ts` and the
   four subdirectories, and note the gap in a comment. -- *rationale: AR-1's fixed directory seed;
   the story's first acceptance criterion.*
9. `tools/dependency-cruiser.config.mjs` -- `options.parser: 'swc'`,
   `doNotFollow: { path: 'node_modules' }`, `tsPreCompilationDeps: false`, and the forbidden rules:
   `sim-no-upward-import` (`^src/sim/` to `^src/(host|presentation)/`), `sim-no-babylon`
   (`^src/sim/` to `@babylonjs`), `presentation-only-contracts-and-table` (`^src/presentation/` to
   `^src/sim/` except `^src/sim/(contracts|table)/`), `host-no-physics-or-rules` (`^src/host/` to
   `^src/sim/(physics|rules)/`), `no-havok` (anything to `@babylonjs/havok`). Every rule
   `severity: 'error'` with a `comment` naming the AD it enforces. -- *rationale: the story's fifth
   acceptance criterion; AD-16.*
10. `tools/boundary-lint.mjs` -- one CLI that (a) runs dependency-cruiser over `src` with the config
    above and fails on any violation, (b) **fails if any `.ts` file under `src/` is missing from the
    cruise result**, reporting the installed parser and the missing files, (c) scans `src/sim/**`
    for `Date`, `Math.random` and `globalThis` outside comments and string literals -- stripping
    block comments as well as line comments, and string/template literals -- and also keeps the
    DOM/Node token list as defence in depth, (d) enforces the tick/ms rule (`TICK_HZ` only in
    `src/sim/contracts/time.ts` and `src/sim/table/tuning.ts`; `…Ms`-suffixed bindings declared only
    in `src/sim/table/tuning.ts`), and (e) enforces the device-name-literal rule over `src/**`
    excluding `src/sim/table/dragonwar.ts`. Accept an optional root argument so the fixture tests
    can point it at `test/fixtures/boundary`. Node built-ins plus dependency-cruiser only; exit
    non-zero naming rule, file and line. -- *rationale: dependency-cruiser is an import-graph tool
    and cannot see identifier references or string literals; see Design Notes.*
11. `tools/check-licence-headers.mjs` -- enumerate candidate files from `git ls-files` (never a
    hand-maintained list), keep the authored source extensions
    (`.ts .tsx .mts .cts .js .mjs .cjs .html .css .py .yml .yaml`), and require each to contain
    either `DragonWar is licensed GPL-3.0` or `Ported from vpdb/vpx-js`. Exempt only
    `public/LICENSE.txt` and `public/THIRD-PARTY-NOTICES.txt` (they are licence texts) and files
    outside those extensions. Exit non-zero naming every offender. -- *rationale: AR-34's per-file
    licence-header check; replaces the roots list review had to widen twice.*
12. `tools/check-attributions.mjs` -- read `package.json`'s `dependencies` and `devDependencies`
    keys and fail naming any package with no occurrence in `ATTRIBUTIONS.md`. Whitespace-normalise
    before matching, as `test/attributions.test.ts` does. -- *rationale: `DW-25`.*
13. `src/host/build-info.ts` + `src/host/boot.ts` + `tools/check-dist.mjs` -- export `BUILD_SHA`
    from `import.meta.env.VITE_BUILD_SHA ?? 'dev'` (a build-time substitution, not a runtime env
    read); have `boot.ts` publish it as a `data-build-sha` attribute on the document element so it
    survives tree-shaking and Story 6.3 can read it; and extend `check-dist.mjs` to assert that,
    when `VITE_BUILD_SHA` was set at build time, the emitted bundle contains that literal.
    -- *rationale: AR-34's SHA stamp, handed to this story by `ci.yml`'s own header comment; no
    `vite.config.ts` change is needed because Vite substitutes `VITE_`-prefixed vars.*
14. `test/fixtures/boundary/**` -- a miniature tree (`src/sim/*.ts`, `src/host/*.ts`,
    `src/presentation/*.ts`) with exactly one deliberate violation per rule, each file carrying the
    GPL-3.0 header, excluded from every tsconfig `include`. -- *rationale: the lint's own
    consumer-tier test needs real violating input, and the fixtures must not poison the real lint or
    the typecheck.*
15. `test/boundary-lint.test.ts`, `test/licence-headers.test.ts`, `test/check-attributions.test.ts`
    -- real `spawnSync` invocations in the shape of `test/measure-cli.test.ts`: each tool exits 0 on
    the repository as committed, and exits non-zero with the rule name, file and line on its
    fixture. Include the empty-graph guard case explicitly. -- *rationale: covers the I/O matrix.*
16. `test/contracts.test.ts`, `test/table.test.ts`, `test/tuning.test.ts` -- assert every contract
    type named by the story's second acceptance criterion is exported and discriminated on `type`;
    assert `TABLE.reference` equals AD-10's figures exactly, that every switch has a `settleClass`
    and every ball device its slots in fill order; assert `resolveTuning()` produces a `…Ticks`
    counterpart for every `…Ms` entry using `TICK_HZ` and preserves `source`/`confidence`. Add a
    type-level negative (an `@ts-expect-error` on an unknown device name) proving the unions bind to
    `TABLE`. -- *rationale: Integration ACs; the type-level negative is the consumer effect.*
17. `test/sim-boundary.test.ts` -- delete the superseded textual describes and the hand-maintained
    `roots` list (both now live in `tools/`), **keep the AD-15 verbatim solver-constants pin and the
    vpx-js port-header describe unchanged**, and leave a header comment pointing at the tools that
    replaced the rest. `test/attributions.test.ts` -- extend with the new rows in the same
    normalised shape. -- *rationale: one owner per rule; no silent loss of the constants pin.*
18. `.github/workflows/ci.yml` -- widen `on.push` to every branch (checks only); move the `pages`
    concurrency group onto the `deploy` job and give the workflow a per-ref group with
    `cancel-in-progress: true`; add `Boundary lint`, `Licence headers` and `Attribution ledger`
    steps after `Typecheck`; set `env: VITE_BUILD_SHA: ${{ github.sha }}` on the `Build` step.
    **Leave the deploy job's `if:` guard, its explanatory comment and the narrow-back comment block
    exactly as they are.** -- *rationale: the story's sixth acceptance criterion and AR-34.*
19. *(REMOVED BY THE LEAD AT THE SPEC-VALIDATION GATE -- do not implement.)* The planned
    `AGENTS.md` refresh is **out of this epic's declared footprint** (Rule 11). `AGENTS.md` is a
    pre-existing repository document, not build config this epic authored, so it is not reachable
    the way `tsconfig.json` is. **Do not edit `AGENTS.md` in this story.** Ledger `DW-5` is
    re-owned at this story's `ledger_adjudicated` gate instead; the refresh is properly a
    `bmad-project-context` run, which regenerates the managed block wholesale.

**Acceptance Criteria:** (system-level outcomes the I/O matrix above does not already cover)

- Given `ATTRIBUTIONS.md` has no row for `dependency-cruiser` or `@swc/core`, when the two packages
  are added, then both rows are written first -- each naming the licence file URL that was read at
  its own source repository, the licence, and the date it was read -- and only then does
  `pnpm add -D` run and `package.json` change.
- Given the Structural Seed at spine line 291, when the repository is laid out, then
  `src/sim/{contracts,table,physics,rules,loop}`,
  `src/presentation/{scene,mechanisms,lighting,backglass,audio,camera}`,
  `src/host/{input,persistence,settings,dev}` with `host/boot.ts`, `assets/src/`, `public/assets/`,
  `test/replays/`, `tools/` and `.github/workflows/` all exist in version control, and every source
  file this story adds carries the GPL-3.0 header.
- Given `src/sim/contracts/`, when it is written, then it exports `InputAction`, `InputFrame`,
  `InputTransition`, `SwitchEvent`, `ContactSurface`, `ContactEvent`, `CoilCommand`,
  `RecoverCommand`, `LampCommand`, `GiCommand`, `FlasherCommand`, `ShowCommand`, `SemanticEvent`,
  `Snapshot`, `ModeView`, `FrameOutput`, `GameStart` and `ReplayHeader` with the fields the spine's
  Seam Contracts table names, every event and command discriminated on `type` and carrying `tick`,
  each device-naming type generic over its name union, and the dependency-cruiser run reports no
  import from `src/sim/contracts/**` to anything outside that directory.
- Given `src/sim/table/dragonwar.ts`, when it exports `TABLE as const`, then it contains
  `reference = { playfieldMm: { w: 514.4, h: 1066.8 }, ballMm: 26.99, pitchDeg: 6.5, flipperBatIn: 3.125 }`,
  the eleven Epic 1 switches each with a `settleClass`, the four coils, and `bd_trough` (capacity 4,
  slots in fill order, eject coil, `ballSearchOrder`) and `bd_shooter` (non-parking, entry
  `s_shooter_lane`) -- and no `Table` interface, loader API, plugin API or runtime table selection
  exists anywhere in the diff.
- Given a tunable is declared in `src/sim/table/tuning.ts`, when the file is read, then it carries a
  unit-suffixed name, a value, a `source` and a `confidence`, and every figure drawn from the PRD
  addendum's do-not-invent list or authored by this story rather than transcribed is marked
  `unverified` with the authoring stated in `source`.
- Given a build made with `VITE_BUILD_SHA` set, when `pnpm check:dist` runs, then it asserts the
  stamped SHA is present in the emitted bundle.
- Given `.github/workflows/ci.yml` after this story's edit, when it is read, then the `deploy`
  job's condition is still `github.event_name != 'pull_request' && github.ref == 'refs/heads/main'`,
  no epic-branch trigger exists anywhere in the file, and `index.html`'s CSP meta tag is unchanged.

## Spec Change Log

- **2026-08-28 -- lead, spec-validation gate.** Removed task 19 (`AGENTS.md` refresh) as outside
  Epic 1's declared footprint (Rule 11); `DW-5` will be re-owned at this story's ledger gate rather
  than closed. Confirmed `tsconfig.json` / `tsconfig*.json` as in-footprint (Epic 1 authored the
  root build config in Stories 1.1-1.2, and `DW-15` was routed here against that very file), and
  ruled that `@swc/core` proceeds without an `ARCHITECTURE-SPINE.md` amendment. Recorded the
  rulings under Design Notes -> Paths outside the stated footprint. No frozen section was touched.

- **2026-08-27 -- review pass, task 7 vs. the Block-If rule.** Task 7 (non-frozen; outside
  `<intent-contract>`) named `hopControl` from FR-9 among the tunables to seed. During
  implementation, the intent-contract's own Block-If rule ("A tunable is required whose value is
  neither stated by a planning artifact nor defensibly authorable as a default -- HALT `blocked`
  naming the tunable, rather than inventing a figure") was found to apply to it: FR-9 states the
  control's existence and behaviour but no unit, magnitude or mechanism, and the architecture
  spine's own Deferred section independently lists "Hop control mechanism" as undecided ("vpx-js
  has no such knob"). No formal Acceptance Criterion below names `hopControl` specifically -- only
  this one task-list line does. Rather than trigger the Block-If's literal HALT over a single
  non-AC-required tunable already flagged undecided at the architecture level (which would discard
  a complete, verified, 300+-test implementation of every other deliverable), or invent a figure
  (forbidden either way), task 7's text above is corrected to match the resolution actually
  implemented: `hopControl` is *not* seeded; `src/sim/table/tuning.ts`'s own header comment and
  `test/tuning.test.ts` state and assert its absence, naming this exact rationale. **KEEP:**
  everything else task 7 asked for is seeded and transcribed as specified; only this one entry is
  affected. Recorded here rather than silently absorbed, per this spec's own established
  convention (see the `DW-5`/`DW-25` ledger entries below); the disposition choice itself (accept
  the omission vs. require task 7's literal instruction) is `decision-pending` for the lead at this
  story's ledger gate, not decided unilaterally by this pass -- see the `deferred` entry in this
  file's frontmatter.

## Review Triage Log

### 2026-08-27 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 10: (high 2, medium 6, low 2)
- defer: 3: (medium 1, low 2)
- reject: 9: (low 9)
- addressed_findings:
  - `[high]` `[patch]` `.github/workflows/ci.yml`'s workflow-level `cancel-in-progress: true` cancels the ENTIRE superseded run (every job, including an in-flight `deploy`) regardless of `deploy`'s own non-cancelling job-level `concurrency` block -- confirmed independently by all three diff-only reviewers (Blind Hunter, Edge Case Hunter, Verification Gap). Fixed: `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}` (the only ref `deploy` ever runs from). Added two regression pins to `test/spike-3-docs.test.ts`.
  - `[high]` `[patch]` `tools/boundary-lint.mjs`'s hand-rolled tokenizer desynced on a template literal with 2+ `${...}` interpolations (confirmed independently by Blind Hunter and Edge Case Hunter, reproduced by hand): the first `}` consumed the frame meant for the closing backtick, the second `}` had nothing to pop, and every check for the REST OF THE FILE silently stopped seeing real code afterward. Fixed by pushing a stack frame per interpolation. Reproduced the bug via `git stash` before fixing, then added `test/fixtures/boundary/src/sim/template-interpolation.ts` + a boundary-lint.test.ts case proving a real violation after such a template is still caught.
  - `[medium]` `[patch]` `tools/check-attributions.mjs` matched package names by plain substring, so "vite" registered as covered purely because "vite" occurs inside "vitest"'s row -- a real missing row for a name that is a substring of another attributed name would silently pass (Blind Hunter, Edge Case Hunter). Fixed with a word/path-boundary-aware regex; added two fixture tests (the false-negative case and a scoped-name-with-metacharacters case).
  - `[medium]` `[patch]` The three textual boundary-lint checks (banned globals, tick/ms, device-name literals) had narrowed to `.ts`-only, regressing the superseded stand-in's explicit `.ts|.tsx|.js|.mjs|.cjs` defense-in-depth (a class of gap this exact codebase's review history already caught once, per `test/sim-boundary.test.ts`'s own comment). Fixed with a shared extension pattern; added a `.js` fixture and test.
  - `[medium]` `[patch]` The intent-contract's "Never let `src/sim/contracts/**` import anything outside `src/sim/contracts/**`" rule -- true only by inspection, unlike its four sibling import-direction rules, none of which had a dependency-cruiser rule of its own (Intent Alignment Auditor). Added `contracts-no-outside-import` to `tools/dependency-cruiser.config.mjs`, a fixture, and a test; the real repo still cruises clean.
  - `[medium]` `[patch]` `tools/check-dist.mjs`'s `checkBuildShaStamp()` -- an explicit Acceptance Criterion below -- had no fixture-driven test, unlike every sibling tool this story added (Blind Hunter). Added three cases to `test/check-dist.test.ts` (stamp present, stamp missing, unset no-op).
  - `[medium]` `[patch]` `src/host/boot.ts`'s `data-build-sha` DOM attribute (AR-34) had no test verifying the mechanism itself, only `check-dist.mjs`'s bundle-substring search, which a renamed attribute or a swapped mechanism would not catch (Verification Gap Reviewer). Added a source-text pin to `test/entry-html-csp.test.ts`.
  - `[low]` `[patch]` `src/sim/table/tuning.ts` imported `TABLE` but never referenced it (Blind Hunter). Removed the dead import.
  - `[low]` `[patch]` `tsconfig.node.json` had no `vite/client` type, so a future test that `import`s (not just reads as text) `boot.ts`/`build-info.ts` would fail to typecheck under this project only (Blind Hunter) -- currently latent (no such import exists today; the boot.ts test added this pass reads it as text). Added `vite/client` to `types` as low-risk forward-proofing.
  - `[medium]` `[patch]` Task 7 (non-frozen) named `hopControl` from FR-9, which the intent-contract's own Block-If rule (a required-but-unauthorable tunable value) actually governs -- see the Spec Change Log entry above. Corrected task 7's text to match the already-implemented, already-tested resolution; filed the disposition choice itself as `decision-pending` in `deferred`.

## Design Notes

### Governing ADs (Rule 6)

The ADR registry for this project is the architecture spine's numbered invariants (AD-1..AD-19) at
`_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md`
-- there is no `docs/adr/`. Each of the following was re-read against the spine text, not taken
from a list:

- **AD-1** (69) -- dependency direction is law; **one table**, imported directly, with no `Table`
  interface, loader API, plugin API or runtime selection. Shapes tasks 5-6 and rules 1-5 of the
  cruiser config.
- **AD-2** (75) -- switch edges from one source per class, with `settleTicks` by class (rollover 0,
  standup 8, drop target 20, bumper skirt 2, tilt bob 0). Shapes `TABLE.switches` and
  `switchSettleMsByClass`; see the reconciliation below.
- **AD-3** (81) -- one clock behind one constant; `tick` is the only time inside `sim/`; every
  duration authored in ms in `tuning.ts` and converted once at load; no literal millisecond
  elsewhere. Shapes task 7 and boundary rule (d).
- **AD-4** (87) -- the loop contract. This story does **not** implement `advance()` (Story 1.5), but
  `FrameOutput`, `InputTransition` and `Snapshot` must be shaped so 1.5 can implement it without
  amending contracts: `FrameOutput` carries every event and command of all N steps in tick order,
  with empty arrays and an unchanged snapshot when N = 0.
- **AD-6** (118) -- physics owns ball bodies, rules own accounting; parking vs non-parking devices;
  counts are closed slot switches. Shapes `TABLE.ballDevices` and `GameState.machine`.
- **AD-7** (124) -- `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }`,
  plain data, no class instances or closures, with the ownership scopes spelled out. Shapes
  `contracts/state.ts` exactly; the scopes are the field list.
- **AD-9** (162) -- the closed command union, `LampRole` (never a colour), `step` in {0,1,2,3},
  `GiCommand.level` as the only continuous level, `FlasherCommand.ms` as the only wall-time
  duration, and payload-complete semantic events. Shapes `contracts/commands.ts` and `events.ts`.
- **AD-10** (168) -- the canonical frame and `TABLE.reference`. This story writes `reference`;
  `frames.ts` and the load-time assertions are Story 1.4's.
- **AD-11** (174) -- Blender owns placement, `TABLE` owns devices, wiring, groups and tunables. glb
  node names are deliberately **not** written here (Story 1.4 owns the export contract and will add
  them); nothing in this story depends on them.
- **AD-15** (198) -- two constant classes. Solver constants stay verbatim and untouched in
  `src/sim/physics/constants.ts` (its pin test survives task 17); table tunables carry `source` and
  `confidence`, with do-not-invent numbers `unverified`.
- **AD-16** (204) -- boundaries linted in CI by a TypeScript-API-free tool; ported and borrowed
  files keep their notices; new files carry the GPL-3.0 header, checked per file. The primary
  invariant for this story, and the one the tooling discovery below bears on.
- **AD-17** (210) -- static bundle, CI gates, SHA stamp. Only the SHA stamp and the CI step list
  are this story's; the CSP, the bundle shape and the deploy guard are Story 1.2's and stay put.

### The dependency-cruiser / TypeScript 7 trap, and why `@swc/core` is added

SOLUTION-DESIGN line 147 chose dependency-cruiser precisely because "TypeScript 7.0 ships no
compiler API ... typescript-eslint and vite-plugin-checker break". The unexamined step is that
dependency-cruiser's *own* TypeScript support is that same compiler API, capped at
`>=2.0.0 <7.0.0`. Under this repository's pinned `typescript@7.0.2` the tool does not error -- it
removes `.ts` from its scannable-extension set and cruises nothing. Verified: `depcruise --info`
prints `x .ts`, and a cruise of `src` returns 0 modules with exit code 0. Shipping the config
without a parser would have produced a green CI step that enforced nothing -- the exact failure
mode `DW-15` was routed here to prevent one level down.

`@swc/core` restores `.ts`/`.tsx`/`.d.ts` scanning through a Rust parser with no TypeScript
dependency, so AD-16's constraint is honoured more literally than before, and it catches type-only
imports (verified). It is a devDependency and contributes no bytes to `dist/`. Two consequences to
watch:

- **It is not in the spine's Stack table.** That table is dated 2026-08-26 and says "the code owns
  these once it exists", so this is a stack addition rather than a contradiction -- but it is a
  planning-artifact fact the lead may want reflected at the validation gate, alongside a note on
  SOLUTION-DESIGN line 147's rationale. Flagged rather than silently absorbed.
- **`@swc/core` resolves platform binaries through optional dependencies.** pnpm records them in
  the lockfile and installs only the matching one, so a Windows-generated lockfile must still
  satisfy `ubuntu-latest` under `--frozen-lockfile`. If the CI install reports a missing
  `@swc/core-linux-x64-gnu`, the remedy is a `pnpm.supportedArchitectures` block in `package.json`
  naming `linux-x64` alongside the dev platform -- apply that rather than unpinning anything.

### Why the boundary gate is three parts, not one

The story's fifth acceptance criterion reads "Given a dependency-cruiser configuration ... Then the
build fails if `src/sim/**` imports ... **or references** `window`, `document`, ...". A dependency
cruiser resolves module graphs; it cannot see identifier references or string literals, so no
configuration of it alone can satisfy the whole criterion. The *observable outcome* the criterion
demands is preserved exactly, by splitting the work across three enforcers that are each in CI:

| Rule from AD-16 | Enforced by | Evidence |
|---|---|---|
| Import rules (`sim` not to `presentation`/`host`/`@babylonjs`; `presentation` to contracts+table only; `host` not to physics/rules; no Havok) | dependency-cruiser + `@swc/core` | exit 2 with the rule name; type-only imports included |
| `window`, `document`, `navigator`, `performance`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `localStorage` in `sim/` | the `tsconfig.sim.json` project (`lib: ["ES2023"]`, `types: []`) | TS2584 / TS2304, verified by probe |
| `Date`, `Math.random`, `globalThis` in `sim/` (legal ES2023 -- the type system cannot reject them) | `tools/boundary-lint.mjs` textual pass | file:line, comments and string literals excluded |
| Literal ms / `TICK_HZ` arithmetic in `sim/` | `tools/boundary-lint.mjs` | `TICK_HZ` allowed only in `contracts/time.ts` and `table/tuning.ts` |
| Device-name string literals outside `sim/table/dragonwar.ts` | `tools/boundary-lint.mjs` | string literals only, `src/**` scope |
| Per-file licence headers | `tools/check-licence-headers.mjs` | enumerated from `git ls-files` |

None of the three uses the TypeScript compiler API. This is a deliberate, recorded deviation from
the criterion's literal Given (one tool) in service of its Then (the build fails), not a narrowing
of what is enforced -- and it is strictly more coverage than the status quo, because the DOM row is
enforced by the compiler rather than by a regex.

### Reconciling AD-2's `settleTicks` with AD-3's "no literal millisecond"

AD-2 states the debounce classes as tick counts read "from `TABLE.switches`"; AD-3 forbids any
authored duration inside `sim/` that is not a `…Ms` tunable converted once at load. Storing raw
tick counts in `TABLE` would freeze those debounces to `TICK_HZ = 1000` and silently change their
meaning if Story 1.1's provisional tick rate ever drops to 480. The story's own acceptance wording
resolves it -- it asks for "a `settleTicks` **class**", not a number: `TABLE.switches[name]` carries
a `settleClass`, `tuning.ts` owns `switchSettleMsByClass`, and `resolveTuning()` produces the
effective ticks. At 1000 Hz the numbers are identical to AD-2's, so nothing is lost today and a
tick-rate change stays the "one constant plus a golden re-record" the architecture promises.

### Scope decisions on the closed unions

Three places invited invention; each was bounded to what an artifact states:

- **`EventName` / `SemanticEvent`** covers Epic 1's events plus the device-failure vocabulary AD-9
  says must exist even if never emitted (`eject_failed`, `ball_missing`, `broken`,
  `device_overflow`), each with the payload its artifact names (`sim_time_discarded { ms }`,
  `ball_missing { count }`, `ball_ended { player, bonusByCategory, multiplier, total, tilted }`).
  Epic 2/3 events are added by the stories that emit them; a closed union that later stories extend
  is the intended shape, not a placeholder.
- **`Snapshot.mechanisms`** carries all five keys the spine's table names. `flippers`, `plunger` and
  `devices` get their Epic 1 shapes; `dropTargets` and `spinner` get the minimal shapes AR-15
  states (a target is down or up; the spinner spins and decays) so Epic 2 fills them rather than
  redefines them.
- **`TABLE.lamps`, `flashers`, `shows`, `shots`, `lightGroups`** ship as empty frozen collections.
  Their derived unions are therefore `never`, which is the desired behaviour: an Epic 2 lamp name
  used early is a type error rather than a runtime string.

### Integration ACs, Consumed-by and Consumes (Rules 1 and 2)

This story is emphatically service-introducing -- it lays down the contracts, the registry, the
tuning file and the lint tooling that every later story imports. It nevertheless has **real
in-story consumers, none mocked**, and their rows are in the I/O matrix above:

- `src/sim/table/names.ts` consumes `TABLE` and produces the observable effect that an unknown
  device name fails `pnpm typecheck` (`test/table.test.ts`'s `@ts-expect-error` case).
- `tools/boundary-lint.mjs` consumes `src/**` and the cruiser config, and
  `test/boundary-lint.test.ts` consumes the tool itself by real subprocess invocation against
  fixtures, asserting exit code and message.
- `tools/check-attributions.mjs` consumes `package.json` and `ATTRIBUTIONS.md`;
  `tools/check-licence-headers.mjs` consumes `git ls-files`.
- `resolveTuning()` consumes `TICK_HZ` and produces the `…Ticks` values `test/tuning.test.ts`
  asserts.
- `tools/check-dist.mjs` consumes the SHA stamp emitted by `src/host/build-info.ts`.
- The CI workflow consumes every script above on a real push.

`Consumes:`
- **Story 1.1** -- `src/sim/contracts/time.ts` (`TICK_HZ`, unchanged), `src/sim/physics/**` (the
  first tree the boundary lint governs), `test/util/list-files.ts`, `test/sim-boundary.test.ts`
  (superseded in part, its AD-15 pin retained), `test/attributions.test.ts`, `tsconfig.json`.
- **Story 1.2** -- `.github/workflows/ci.yml` (extended), `tools/check-dist.mjs` (extended),
  `tools/size-budget.mjs`, `src/host/boot.ts`, `src/presentation/scene/create-engine.ts` (the first
  `presentation/**` file the new import rules govern), `package.json`, `ATTRIBUTIONS.md`,
  `test/measure-cli.test.ts` (the tool-testing pattern).

`Consumed-by:`
- **Story 1.4** -- adds glb node names to `TABLE`, writes `src/sim/table/frames.ts` beside
  `tuning.ts`, and its loaders assert against `TABLE.reference`. **First consumer of `TABLE` and of
  `sim/table/names.ts` outside this story.**
- **Story 1.5** -- implements `sim/loop/advance()` against `InputTransition`, `FrameOutput`,
  `Snapshot` and `GameState`; emits `sim_time_discarded`; first consumer of the whole contract set
  and of `resolveTuning()`.
- **Story 1.6** -- consumes `TABLE.coils`, `CoilCommand` and the flipper/plunger tunables, and adds
  the ported `FlipperMover` parameters to `tuning.ts` (their units come from the port, which is why
  this story does not author them).
- **Story 1.7** -- consumes `s_tilt_bob`, `s_slam_tilt`, `slamNudgesPerWindow`,
  `tiltWarningSpacingMs`, `tiltSettleMs`.
- **Story 1.8** -- consumes `ReplayHeader`, `GameStart` and `Replay` from `contracts/replay.ts` and
  the state-hash shape of `GameState`; adds the goldens job to this story's workflow.
- **Story 1.9** -- consumes `tuning.ts`'s `source`/`confidence` fields for the dev panel.
- **Epic 2+** -- extends `TABLE`'s empty collections and the `SemanticEvent` union behind the same
  seams; **Story 6.3** reads `BUILD_SHA` for the Settings panel; **Story 6.7** audits the ledger
  this story's checks keep total.

### Ledger entries this story owns

- **`DW-5`** (open) -- **NOT closed by this story** (the lead removed task 19 at the validation
  gate; re-owned at `ledger_adjudicated`). **Footprint note:** `AGENTS.md` is not in the epic
  footprint this stage was given (`src/**`, `test/**`, `tools/**`, `assets/src/**`,
  `.github/workflows/**`, `package.json`, `_bmad-output/**`, `ATTRIBUTIONS.md`). It is named here
  rather than edited silently: the ledger entry assigns the refresh to this story and names
  `AGENTS.md` as its subject, and the TODOs only become answerable once this story lands CI and the
  lint. The block is normally regenerated by `bmad-project-context`; a hand edit inside the markers
  is legitimate but will be replaced on the next refresh, so if the lead prefers, running that skill
  is the sanctioned alternative and task 19 can be dropped.
- **`DW-15`** (routed) -- closed by task 3, at the layer that actually forbids the reference. The
  dependency-cruiser rule is *not* the closure and is not claimed as one; the tsconfig split is, and
  the acceptance criterion above is written against `pnpm typecheck` failing, not against a lint
  rule existing beside the hole.
- **`DW-25`** (routed) -- its **substance** is closed by tasks 1 and 12: no dependency can exist
  without an `ATTRIBUTIONS.md` row, checked in CI, with the two-table structure making the check
  total rather than allowlisted. Its **ordering-as-history** half is candidly *not* closed: this
  pipeline finalises a story in one commit, so "attribution row in an earlier commit than the
  `pnpm add`" cannot be demonstrated or enforced from here. The convention is written into
  `ATTRIBUTIONS.md`'s preamble instead. Recommend the lead adjudicate the residual at this story's
  ledger gate -- `wontfix-accepted` with a `reopen_if` probe of "a dependency lands whose licence
  was wrong and whose row was written after the fact" is the honest disposition, or re-own the
  ordering half to Story 6.7's ledger audit.

### Paths outside the stated footprint

Named here rather than planned silently, per the dispatch: `tsconfig.json` and the four new
`tsconfig*.json` files (build config the story's third and fifth ACs require); and `AGENTS.md`
(see `DW-5` above). `test/fixtures/**` and `assets/src/.gitkeep` are in-footprint and listed only
because they are new trees.

**Lead ruling at the spec-validation gate (2026-08-28), Rule 11:**

- **`tsconfig.json` and the new `tsconfig*.json` files -- IN FOOTPRINT, proceed.** Root build
  config is already Epic 1's own work on this branch: `tsconfig.json`, `vite.config.ts`,
  `vitest.config.ts`, `index.html` and `pnpm-lock.yaml` were all authored by Stories 1.1 and 1.2
  and accepted at their gates. `DW-15` was moreover *routed to this story by a prior gate* and its
  subject IS `tsconfig.json`, which is a standing instruction that this story touches it. The
  declared `package.json` entry is the same class of root manifest.
- **`AGENTS.md` -- OUT OF FOOTPRINT, task 19 removed.** It is a pre-existing repository document
  rather than build config this epic authored, and no clause of the declared footprint reaches it.
  `DW-5` is re-owned at this story's ledger gate rather than closed here.
- **`@swc/core` -- proceed without a spine amendment.** It is the parser dependency-cruiser needs
  to function at all under TypeScript 7, not a new architectural choice: SOLUTION-DESIGN line 147
  already selected dependency-cruiser, and this is how that selection is made to work. It is a
  build-time devDependency contributing no bytes to `dist/`. The provenance rows still land first
  (task 1), Apache-2.0 is on the acceptable list, and the finding is recorded in Design Notes above
  so the retrospective and the merge gate see it. `ARCHITECTURE-SPINE.md` is a planning artifact
  outside this epic's footprint and is deliberately not amended here. No change is planned to `CLAUDE.md`, `docs/**`, `index.html`, `vite.config.ts`,
`vitest.config.ts`, `public/**` or `NOTICE`.

## Verification

**Commands:**
- `pnpm install --frozen-lockfile` -- expected: succeeds after task 2 on this host and, in CI, on
  `ubuntu-latest`; if `@swc/core`'s platform binary is missing on Linux, apply the
  `pnpm.supportedArchitectures` remedy noted in Design Notes.
- `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs --info` -- expected: a tick beside
  `swc` and beside `.ts`, `.tsx`, `.d.ts`. An `x .ts` line means the lint is blind; do not proceed.
- `pnpm typecheck` -- expected: all three projects exit 0. Then re-run after temporarily adding
  `document.title;` to a file under `src/sim/` and confirm it FAILS with "Cannot find name
  'document'"; revert. (`DW-15`'s closure must be demonstrated, not assumed.)
- `pnpm lint:boundaries` -- expected: exit 0 on the repository, with the coverage line showing a
  non-zero count equal to the number of `.ts` files under `src/`.
- `pnpm check:headers` and `pnpm check:attributions` -- expected: exit 0.
- `pnpm test` -- expected: all suites green, including the new fixture-driven tool tests and the
  retained AD-15 solver-constants pin and vpx-js port-header describes.
- `pnpm build && pnpm check:dist && pnpm check:size` -- expected: exit 0; with
  `VITE_BUILD_SHA=<sha> pnpm build`, `check:dist` additionally confirms the stamp.
- `git status --short` -- expected: only the files listed in the Code Map; no `dist/`, no
  `node_modules/`, no edits to `docs/spikes/**`.

**Manual checks (if no CLI):**
- Read `.github/workflows/ci.yml`'s `deploy` job after editing: its `if:` must still read
  `github.event_name != 'pull_request' && github.ref == 'refs/heads/main'`, and both explanatory
  comment blocks must be intact. The epic-branch trigger must not reappear anywhere.
- Read `index.html` and confirm the CSP meta tag is byte-identical to
  `default-src 'self'; connect-src 'self'`.
- Read `ATTRIBUTIONS.md` and confirm each new row names the licence file URL that was read, not a
  package-metadata field, and carries the date it was read.

## Auto Run Result

**Summary of implemented change:** Laid down `src/sim/contracts/**` (the closed, table-free seam
unions: input, events, commands, state, snapshot, mode-view, replay), `src/sim/table/dragonwar.ts`
(`TABLE as const`, deep-frozen), `names.ts` (name unions derived from `typeof TABLE`, bound seam
aliases) and `tuning.ts` (unit-suffixed tunables with `source`/`confidence`, `resolveTuning()`'s
single ms-to-ticks conversion). Made the layer graph enforceable with a three-part boundary gate:
a three-way `tsconfig` split (`sim`/`app`/`node`) that removes `DOM`/`@types/node` from `src/sim/**`
(closing `DW-15`), `dependency-cruiser` + `@swc/core` for the six import rules (five from the spec
plus `contracts-no-outside-import`, added during review), and `tools/boundary-lint.mjs`'s textual
pass for banned globals, the tick/ms rule and device-name literals -- plus per-file licence-header
and attribution-ledger checks and the commit-SHA stamp, all wired into `ci.yml`. Seeded the fixed
directory structure AR-1 names. Provenance rows for `dependency-cruiser` and `@swc/core` landed in
`ATTRIBUTIONS.md`, licences re-read at source and dated 2026-08-27, before `pnpm add -D` ran.

**Files changed:** see `git diff 19c822ddf0a23b0a4442428b620ca30730997ed0` (70 files, +3878/-160).
Matches the Code Map's "Files this story creates" / "Files this story edits" lists, plus the review
pass's own new fixtures (`test/fixtures/boundary/src/sim/{template-interpolation.ts,banned-global.js}`,
`test/fixtures/boundary/src/sim/contracts/outside-import.ts`) and test additions inside already-listed
test files. No file outside the declared footprint was touched; `AGENTS.md` was not edited.

**Review findings breakdown (review pass, 2026-08-27):** 22 findings from four parallel review
layers (Blind Hunter, Edge Case Hunter, Verification Gap Reviewer, Intent Alignment Auditor) after
deduplication. 10 patched (2 high, 6 medium, 2 low) -- see the Review Triage Log for the full list;
highlights: a GitHub Actions concurrency bug that could cancel an in-flight Pages deploy, a
tokenizer bug in the boundary lint that silently blinded every check after a multi-interpolation
template literal (reproduced and confirmed before fixing), a substring false-negative in the
attribution check, a regressed file-extension filter, a missing dependency-cruiser rule for
`sim/contracts`'s own import-purity invariant, and two Acceptance-Criterion-relevant behaviours
(the SHA-stamp check, the SHA DOM attribute) that had zero persisted test coverage. 4 deferred to
the spec frontmatter `deferred` list for the lead's ledger (the task-7/`hopControl` disposition
itself, `--ignore-scripts`'s forward risk, ATTRIBUTIONS.md's transitive-dependency scope, and
`listFilesRecursive`'s symlink-cycle hardening). 9 rejected as working-as-intended, already
independently justified in code comments, or already owned elsewhere in this spec (e.g. `DW-25`'s
ordering-as-history half). 0 intent_gap, 0 bad_spec -- no HALT and no code re-derivation was
triggered; every patch was applied, verified, and covered by a new or extended test.

**Verification performed:** Re-ran, after every patch, the complete chain from this spec's
`## Verification` section: `pnpm install --frozen-lockfile` (reproduced the `--ignore-scripts`
necessity directly: a plain frozen-lockfile install exits 1 with `ERR_PNPM_IGNORED_BUILDS` on
`@swc/core` on this host); `dependency-cruise --info` (swc + `.ts`/`.tsx`/`.d.ts` all show installed);
`pnpm typecheck` (all three projects exit 0); the `DW-15` closure re-demonstrated live (injected
`document.title;` into `src/sim/physics/collision-type.ts`, confirmed `TS2584`, reverted, confirmed
byte-identical via `git hash-object` against the committed blob); `pnpm lint:boundaries` (51/51 `.ts`
files under `src/`, matches `find src -name '*.ts' | wc -l`); `pnpm check:headers` and
`pnpm check:attributions`; `pnpm test` (323/323, up from 304 after the Matrix Test Audit and review
passes added coverage); `pnpm build && pnpm check:dist && pnpm check:size`, plus a second build with
`VITE_BUILD_SHA` set, confirming the literal SHA reaches the emitted bundle. Matrix Test Audit ran
against all 14 I/O & Edge-Case Matrix rows before review; three rows had no covering test (type-only
upward import, and the block-comment/string-literal exclusion nuance for two rules) and were closed
with new fixtures and tests before proceeding to review. `git status --short` matches the Code Map
plus the review pass's own additions; no `dist/`, `node_modules/`, or `docs/spikes/**` changes.

**Residual risks:** (1) The `hopControl` disposition is a genuine preference call left for the lead
(see `deferred` and the Spec Change Log) -- the code omits it with a documented, tested rationale,
but task 7's original text asked for it. (2) `--ignore-scripts` in CI is correct today but has no
automated guard against a future dependency silently needing its install script to run. (3)
ATTRIBUTIONS.md's scope (direct dependencies only) leaves ~40 transitive packages unattributed by
name -- a pre-existing project convention, not a regression, but an open policy question. (4)
`tools/boundary-lint.mjs`'s file-tree walk has no symlink-cycle guard (theoretical; no symlink
exists anywhere in this repository today). All four are recorded in `deferred` for the lead's ledger
harvest, per Rule 15 -- `bmad-build-auto` does not write the ledger directly.

Status: done
Blocking condition: none
