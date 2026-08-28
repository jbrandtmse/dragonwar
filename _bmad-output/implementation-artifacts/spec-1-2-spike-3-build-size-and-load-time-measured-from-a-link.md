---
title: 'Story 1.2: Spike 3 - build size and load time measured from a link'
type: 'feature'
created: '2026-08-27'
status: 'ready-for-dev'
baseline_revision: '28554bf641334e95c07520ef44817c56753b6c63'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** DragonWar's load NFR is an assumption, not a measurement: NFR-4's "10 s on
50 Mbps / compressed initial payload <= 20 MB" is marked `[ASSUMPTION - re-set by spike 3]`
in AD-17, and the repository has no production-build surface at all - no root `index.html`,
no `vite.config.*`, no `build`/`preview` script, no CI, no deploy (ledger `DW-11`). Until a
real static bundle carrying the Babylon engine and a glb is deployed and measured from a
link, the CI size budget cannot be set, the one-glb-versus-split question cannot be decided,
and every later story grows the table against an unknown ceiling.

**Approach:** Record `@babylonjs/core` and `@babylonjs/loaders` in `ATTRIBUTIONS.md` first,
then add them; stand up the static build (root `index.html` with the pinned CSP meta tag and
a press-to-begin gate, `vite.config.ts` with relative paths, a minimal `host/boot` + Babylon
scene, a generated placeholder `dragonwar.glb`); ship a GitHub Actions workflow that runs
the checks on every push and pull request and deploys `dist/` to GitHub Pages from the
default branch only; then measure the deployed link cold on a 50 Mbps throttle with the
cache disabled, as a median over repeated runs (ledger `DW-13`) taken through a
cadence-guarded runner (ledger `DW-16`), and write the numbers, the size budget and the
one-glb-versus-split decision into `docs/spikes/spike-3.md`.

## Boundaries & Constraints

**Always:**
- **Provenance before the file.** The `ATTRIBUTIONS.md` **Code** table rows for
  `@babylonjs/core` and `@babylonjs/loaders` at `9.22.2` land BEFORE `pnpm add` runs. The
  licence is verified by reading the package's own licence file in its source repository -
  `https://github.com/BabylonJS/Babylon.js/blob/master/license.md`, which reads
  "Apache License 2.0" - NOT from `package.json`, NOT from npm metadata, NOT from an
  aggregator (CLAUDE.md's hard gate; NFR-9; AD-16). Each row records source URL, author,
  licence, and the verification date.
- **Apache-2.0 obligations attach at first distribution, and this story is it.** Babylon.js
  ships `NOTICE.md` at its repository root ("Babylon.js / Copyright 2023 The Babylon.js
  team"). Deploying `dist/` to Pages distributes a work containing Babylon code, so the
  build must carry a readable copy of the Apache-2.0 licence text and that NOTICE content,
  reachable from the page (Apache-2.0 sections 4(a) and 4(d)). `NOTICE` in the repository
  root already anticipates this obligation by name.
- **Measure the production artifact, never the dev server** (epic-context standing practice;
  Story 1.1's amended AC). Every number recorded by this story comes from a `vite build`
  output - the deployed Pages artifact for the gating figures, a local `vite preview` of the
  byte-identical `dist/` for the control.
- **No performance or load number is ever a single run** (ledger `DW-13`, escalated). This
  host's measurement variance spans roughly 1.6-4.8 ms on byte-identical code, within a
  single session as well as across sessions. Every recorded figure is a median over at least
  5 runs, with every raw sample, the range and the run count printed in
  `docs/spikes/spike-3.md`. Any comparison between two configurations is an A/B measured
  back-to-back and adjacent in time, interleaved, in one session.
- **Every load measurement carries a cadence guard and reports the observed cadence beside
  the number** (ledger `DW-16`, this story's to close). A run whose median
  `requestAnimationFrame` delta exceeds 20 ms is rejected as throttled, not recorded. 60 fps
  is a 16.67 ms delta; the defect this closes was a browser reporting `visible` and `focused`
  while running rAF at 28.9 fps (34.6 ms), inflating a p95 about 2.7x through a guard that
  only rejected deltas over 100 ms.
- **Layering holds** (AD-1, AD-16). `@babylonjs/*` is imported only under
  `src/presentation/**` and `src/host/**`; nothing under `src/sim/**` gains a Babylon import,
  a DOM reference or a `performance` call. `test/sim-boundary.test.ts` must stay green and
  becomes load-bearing the moment Babylon enters the repository.
- **Newly authored source files carry the GPL-3.0 header** (AD-16), and non-ASCII characters
  in source are written as escape sequences, never literal bytes (Rule 14).
- `pnpm typecheck` passes and the default `pnpm test` suite is green, including Story 1.1's
  187 existing tests.
- **The CSP string is now `default-src 'self'; connect-src 'self'`** (author amendment,
  2026-08-27, applied by the lead to NFR-7, AD-17, SOLUTION-DESIGN, review-rubric L9 and both
  epic ACs). `index.html` carries
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'">`
  verbatim and CI greps for that exact amended string. NFR-7's intent is unchanged and still
  enforced: no telemetry, no third-party origin, nothing off the static origin. `'self'` admits
  the same-origin `dragonwar.glb` fetch and nothing else.
- **WebGPU is taken only where it initialises cleanly under that CSP** (author amendment,
  2026-08-27). No `script-src` grant, no `'wasm-unsafe-eval'`. Babylon's WebGPU transpiler is
  never fetched from a CDN; if it cannot be served from our own origin, or WebGPU cannot come
  up under the CSP, the engine falls back to WebGL2 silently and WebGL2 carries the spike.
  `?renderer=webgl2` forces WebGL2 in every case. No feature may require WebGPU (AR-27, AD-12).
- **The measurement surface is live and public.** `jbrandtmse/dragonwar` is PUBLIC and Pages is
  provisioned at `https://jbrandtmse.github.io/dragonwar/` (`build_type=workflow`,
  `https_enforced=true`); no deployment has run yet, so the first workflow run populates it.
  The gating figures are cold anonymous loads of that URL, exactly as the ACs specify.
- **The deploy workflow may trigger on `DW-1-epic1` and `workflow_dispatch` for this spike
  only, and MUST be narrowed back before Epic 1's merge gate.** Removing the epic-branch
  trigger (leaving `main` + `workflow_dispatch`, restoring AD-17 / AR-34's `main`-only shipping
  rule) is an acceptance item of this story, not a follow-up. `docs/spikes/spike-3.md` states
  that the measured artifact was built from an unmerged branch and is provisional until it
  reruns from `main`.

**Block If:**
- **RESOLVED 2026-08-27 - the three halts this spec originally carried are lifted by author
  decision.** The CSP contradiction, the private-repository/no-Pages-site blocker and the
  `main`-only deploy restriction were all decided by the author and applied to the planning
  artifacts by the lead; see `## Design Notes` and `## Spec Change Log`. Do NOT re-raise them.
  The CSP is amended, Pages is live, and the epic-branch deploy trigger is authorised for this
  spike with a mandatory narrow-back. What remains forbidden is unchanged: never weaken the
  amended CSP further from inside this story, and never inline the glb to dodge a fetch - the
  payload and first-frame numbers must describe the shipping load path (AD-11 fetches
  `public/assets/dragonwar.glb` and `dragonwar.collision.json` at runtime).
- **`@babylonjs/core` or `@babylonjs/loaders` at `9.22.2` cannot have its licence established
  by reading the licence file in its source repository.** A licence that cannot be verified at
  source means the package is not added. HALT with blocking condition
  `provenance unverifiable`.

**Never:**
- Never edit the CSP string, the `20 MB` NFR-4 ceiling, or any other planning-artifact wording
  from inside this story. A contradiction in a planning artifact is a HALT for the lead to
  amend (Rule 5), never a code-side workaround. The CSP amendment of 2026-08-27 was made that
  way - author decision, lead edit, recorded in `## Spec Change Log` - and the implementation's
  only job is to use the amended string verbatim. Re-setting the `20 MB` ceiling from this
  story's own measurement IS in scope; it is what the spike exists to do, and NFR-4 marks the
  figure `[ASSUMPTION - re-set by spike 3]`.
- Never record a macOS or Safari number this host cannot take. The Safari/macOS legs are
  already adjudicated as author-owned under ledger entry `DW-1` ("Author-owned: macOS /
  Safari measurement legs") - mark them `PENDING - author's macOS leg`, reference `DW-1` by
  name, and file no new ledger entry for them. The same applies to `DW-13`, which is owned by
  `burndown` and must not be closed here.
- Never fabricate, estimate or extrapolate a payload or load-time figure, and never report a
  number taken through a channel other than the cadence-guarded runner.
- Never build Story 1.3's work (the full directory seed, seam contracts beyond `time.ts`,
  `TABLE`, `names.ts`, `tuning.ts`, `frames.ts`, dependency-cruiser, the per-file licence
  header check, the SHA stamp), Story 1.4's export pipeline (`tools/export.py`, the real
  `.blend`, the collision JSON), or Story 6.1's full press-to-begin, platform gate and error
  panel. This story ships the minimum of each and names the owning story in a comment.
- Never add a service worker, an absolute asset path, an external origin, or an inline
  `<script>`/`<style>`/`style=` attribute to the built page.
- Never introduce a browser-automation dependency (Playwright, Puppeteer, Selenium). The
  measurement runner uses Node 24 built-ins over CDP, as `tools/spike-1/measure.mjs` does.
- Never take a gating number from the Vite dev server.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Provenance gate | `ATTRIBUTIONS.md` Code table has no Babylon rows; `package.json` has no `@babylonjs/*` dependency | The two rows are written first, each citing `https://github.com/BabylonJS/Babylon.js/blob/master/license.md` as the licence read at source, Apache-2.0, and the verification date; only then does `pnpm add @babylonjs/core@9.22.2 @babylonjs/loaders@9.22.2` run | A licence not establishable at source means the package is not added - HALT `provenance unverifiable` |
| Apache-2.0 notice | The built `dist/` contains Babylon code | `dist/` carries a third-party notice file with the full Apache-2.0 text and Babylon's `NOTICE.md` content, linked from the press-to-begin panel | Missing file or missing link fails the static-bundle check |
| CSP tag present | `vite build` has produced `dist/index.html` | The static-bundle check finds the `Content-Security-Policy` meta tag with the exact directives the planning artifacts pin, and exits 0 | Absent or altered directives: exit non-zero naming the missing directive; the CI step fails |
| Relative paths only | Every asset reference in `dist/index.html` and every emitted chunk | No reference begins with `/` and none names an external origin; the page loads correctly from a project-site subpath | Exit non-zero listing each offending reference |
| No inline script or style | `dist/index.html` after Vite's HTML transform | No `<script>` without `src`, no `<style>` block, no `style=` attribute - `default-src 'self'` blocks all three | Exit non-zero naming the element; the fix is an external stylesheet and `build.modulePreload.polyfill: false`, never a CSP relaxation |
| No service worker | The whole of `dist/` | No `*sw.js`/`service-worker.js` emitted and no `serviceWorker.register` string in any emitted chunk | Exit non-zero naming the file |
| Press-to-begin gate | A fresh page load | The gate panel is interactive from first paint, before any engine or asset work begins; no engine exists and no glb request has been made until the gesture | n/a - this is the gate's whole purpose (AD-17) |
| Engine created once | The gesture fires on a WebGL2-capable browser | `EngineFactory.CreateAsync` is called exactly once with `useRightHandedSystem = true`; the placeholder `dragonwar.glb` loads; a frame renders and boot records the first-rendered-frame timestamp | A second engine creation is a defect; assert single creation in the NullEngine smoke |
| Renderer selection | A WebGPU-capable Chrome, no query string | The WebGPU engine is chosen where it initialises under the pinned CSP with its transpiler served from our own origin | If WebGPU cannot initialise under the pinned CSP, fall back to WebGL2 SILENTLY - no HALT, nothing surfaced to the player - and record the exact console evidence in `docs/spikes/spike-3.md`. WebGL2 is the floor and carries the spike (AD-12, AR-27: no feature may require WebGPU). Never grant `script-src` or `'wasm-unsafe-eval'` to make WebGPU come up, and never fetch the transpiler from a CDN |
| Forced WebGL2 | The same browser with `?renderer=webgl2` | The WebGL2 engine is created instead, and a frame still renders | The query parameter is the only override in this story; the Settings toggle is Story 6.3 |
| Boot failure | The glb is absent or unparseable | The host error panel renders with the failure named; the page does not white-screen | Load-time paths throw and boot reports them (AD-17, Conventions/Errors) |
| Cold load, deployed link | The Pages URL, fresh browser profile, cache disabled, network throttled to 6,250,000 bytes/s with the latency the runner states | Per run: total compressed transfer bytes summed from CDP `Network.loadingFinished`, request count, navigation-to-first-rendered-frame ms, gesture-to-first-rendered-frame ms, and the observed median rAF delta | Runner exits non-zero if the page errors, the first frame never arrives before its deadline, or the cadence guard rejects the run |
| Cadence guard | A run whose measured window has a median rAF delta above 20 ms | The run is rejected and not recorded; the observed cadence is printed | Exit non-zero naming the observed median delta and frame count; re-run foregrounded |
| Repeat protocol | At least 5 accepted runs per path, interleaved with the local-preview control adjacent in time | Median, full sample list, range and run count recorded per path in `docs/spikes/spike-3.md` | Fewer than 5 accepted runs on a gating path is not a result; re-run |
| Safari / macOS leg | No macOS host on this cycle host | The Safari/macOS row exists in `docs/spikes/spike-3.md` and reads `PENDING - author's macOS leg`, referencing ledger entry `DW-1` | Not an error; no new ledger entry is filed |
| Size budget under | A build whose gzipped `dist/` total is below the budget | `node tools/size-budget.mjs` prints measured and budgeted bytes and exits 0 | n/a |
| Size budget over | The same script with the budget set below the measured total | Exits non-zero with both the measured and the budgeted numbers in the message, plus the largest contributors | This is the failure path the AC requires; it is exercised deliberately, not only reasoned about |
| Integration (consumer) | The CI workflow runs `typecheck`, `test`, `build`, the static-bundle check and the size budget on a real push; the deploy job consumes `dist/` | The checks job passes on a real push of this branch (run id recorded), and the deployed Pages URL renders the placeholder - the observable effect of every artifact this story introduces | A red CI run is the finding; the workflow is fixed, not the evidence |

</intent-contract>

## Code Map

**Read-only governing sources (do not edit):**
- `CLAUDE.md` -- the provenance rule; the "verify at source, not from `package.json`" trap.
- `NOTICE` -- lines 61-63 already name Babylon.js: "Apache-2.0. Retain the licence and any
  NOTICE content from the distribution", under a heading (line 40) that says "None of the
  following is yet present in this repository". This story is the first distribution, so that
  sentence stops being true.
- `_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md`
  -- **AD-17 at line 210, re-read 2026-08-27 after the amendment: it now pins
  `default-src 'self'; connect-src 'self'`.** Same rule also requires relative asset paths, no
  service worker, a press-to-begin panel, a **WebGL2 check before any asset loads** with an
  unsupported-browser message naming Chrome, Edge and Safari, one host error panel for every
  later boot-stage failure, and a compressed initial-payload budget marked
  `[ASSUMPTION - re-set by spike 3]`. AD-12 at 182 (engine chosen once via
  `EngineFactory.CreateAsync`; WebGL2 is the floor; `?renderer=webgl2` forces it; no feature
  may require WebGPU). AD-11 at 176 (`public/assets/dragonwar.glb` + `dragonwar.collision.json`
  are fetched at runtime; node-name grammar `^[a-z][a-z0-9_]*$`; exactly two top-level nodes
  `playfield_root` and `cabinet_root` plus `pivot_pitch`). AD-10 at 168 (right-handed scene,
  glb in metres Y-up, playfield 514.4 x 1066.8 mm, geometry authored unpitched). AD-1 at 69,
  AD-15 at 198 (one `NullEngine` load smoke is the only sanctioned presentation test), AD-16
  at 204. Stack table at 269 pins `@babylonjs/core` and `@babylonjs/loaders` at `9.22.2`,
  Vite `8.2.2`, Node 24, pnpm `11.24.0`; Structural Seed at 291.
- `_bmad-output/planning-artifacts/epics.md` -- Story 1.2 at line 361; its ACs now run to a
  **seventh** criterion (the epic-branch deploy trigger and its mandatory narrow-back). NFR-4
  at 122, NFR-6 at 126, **NFR-7 at 124 (amended: `connect-src 'self'`)**; AR-33/AR-34 under
  "Host, persistence, boot and CI".
- `_bmad-output/implementation-artifacts/epic-1-context.md` -- recompiled against the amended
  `epics.md`; its "Requirements & Constraints" and "Technical Decisions" already state the
  amended CSP, the silent WebGPU fallback and the temporary-trigger-plus-narrow-back rule.
  Reuse it; it does not need recompiling.
- `_bmad-output/implementation-artifacts/spec-1-1-...-six-bodies.md` -- the measurement
  conventions to reuse (`## Design Notes` "p95 method", "Browser measurement must not be
  throttled"; `## Verification`).
- `docs/spikes/spike-1.md` (778 lines) -- lines 617-778 are the variance investigation;
  **line 714 "Standing recommendation for every later performance story" names Story 1.2 by
  number** ("an A/B measured back-to-back in one session, interleaved"). Lines 175-191 are the
  p95 method and 203-216 the background-throttle guard, both to mirror. Lines 547-559 record
  the ad-hoc `npx vite build tools/spike-1 --base ./ --outDir <scratch>/...` invocation with a
  placeholder outDir that ledger `DW-11` indicts and this story supersedes. **Leave this file
  unedited** -- it is Story 1.1's dated record.

**Existing code this story extends (all anchors re-verified at `28554bf`):**
- `package.json` -- scripts are exactly `dev` / `typecheck` / `test`; `devDependencies` pin
  `@types/node@24.13.3`, `typescript@7.0.2`, `vite@8.2.2`, `vitest@4.1.11`;
  `"packageManager": "pnpm@11.24.0"` self-provisions (confirmed working in Story 1.1);
  `"type": "module"`; `"engines": { "node": ">=24" }`. **There is no `dependencies` block yet
  -- Babylon is the first.**
- `tsconfig.json` -- `strict`, `target: ES2023`, `lib: ["ES2023","DOM","DOM.Iterable"]`,
  `module: esnext`, `moduleResolution: bundler`, `types: ["node"]`, `noEmit`, no `baseUrl`,
  `include: ["src","test","tools"]`. Ledger `DW-15` (owner Story 1.3) notes `DOM` reaches
  `src/sim/**`; **do not fix that here.**
- `vitest.config.ts` -- `environment: 'node'`, `include: ['test/**/*.test.ts']`,
  `reporters: ['verbose']`, `testTimeout: 60_000`.
- `.gitignore` -- has `.worktrees/`, `node_modules/`, `dist/`, `.vite/`. A second build output
  directory, if one is introduced, needs a line here.
- `tools/spike-1/measure.mjs` (408 lines) -- **the runner to model the new one on, and the file
  `DW-11` names.** `DEFAULT_URL` line 34 still `http://localhost:5173/tools/spike-1/index.html`
  with a comment saying Story 1.2 owns `vite build`; `looksLikeDevServer()` line 51 (5173-5183
  band); `parseArgs` line 80; `killTree()` 110; `waitForCdpReady()` 131; `findPageTarget()` 147
  (matches the substring `/tools/spike-1/`); `connectCdp()` 161; `sweepStaleProfileDirs()` 236;
  fresh `--user-data-dir` line 278 and the anti-throttling launch flags at 281-283
  (`--disable-background-timer-throttling`, `--disable-backgrounding-occluded-windows`,
  `--disable-renderer-backgrounding`); the dev-server warning at 294. A fresh profile dir per
  invocation already makes one invocation one cold profile.
- `tools/spike-1/browser.ts` (151 lines) -- `MAX_FRAME_DELTA_MS = 100` at **line 21** is the
  guard `DW-16` indicts; `Spike1Result` at **23**; `nearestRankP95()` at **35** (exported for
  test); `runFrames()` at **46** and its per-frame `delta > MAX_FRAME_DELTA_MS` rejection at
  **54** are where the median-cadence check goes; `runSpike1()` at **105** computes the p95 at
  118 and is where the observed cadence joins the result.
  **Constraint:** `test/spike-1-harness-boundary.test.ts` pins `browser.ts` and `scene.ts` to
  imports matching `^(\.\./\.\./src/sim/contracts/time|\.\./\.\./src/sim/physics/.+)$` --
  every module-specifier form, including bare side-effect imports and dynamic `import()`. The
  cadence work must add **no** new import to `browser.ts`.
- `tools/spike-1/index.html` (13 lines) -- `<script type="module" src="./browser.ts">`, no CSP
  meta tag, no inline script or style. Becomes a second Vite build input.
- `tools/spike-1/scene.ts` (184 lines) -- the shared six-ball scene; untouched by this story.
- `test/sim-boundary.test.ts` (198 lines) -- line 96-101 already fails any `@babylonjs/` match
  under `src/sim/`; **load-bearing the moment Babylon is installed.** Also pins the verbatim
  solver constants (AD-15).
- `test/spike-1-harness-boundary.test.ts` (82 lines) -- the harness import allowlist above.
- `test/attributions.test.ts` (68 lines) -- pins the `vpdb/vpx-js` row; `normalize()` collapses
  all whitespace before matching so markdown rewrap cannot break it. **Extend in the same
  shape** for the two Babylon rows.
- `test/spike-1-docs.test.ts` (132 lines) -- the pattern for pinning a spike document's
  structure: content-based, whitespace-normalised, deliberately not heading-position-based, and
  it reads `deferred-work.md` to assert the doc references the pre-adjudicated ledger entry
  rather than filing a new one. `test/spike-3-docs.test.ts` mirrors it exactly.
- `test/measure-cli.test.ts` (142 lines) -- real `spawnSync` subprocess invocations of
  `measure.mjs`, argument-validation paths only (they throw before any browser spawns).
  `RUN_TIMEOUT_MS = 10_000`. The model for `test/check-dist.test.ts` and
  `test/size-budget.test.ts`; **re-run it after `DEFAULT_URL` changes.**
- `test/spike-1-browser-guard.test.ts` (87 lines) -- `installFakeRaf()` feeds `runFrames()` a
  controlled timestamp sequence to drive the throttle guard without backgrounding a window.
  **The median-cadence rejection test is a new case in this exact harness.**
- `test/util/list-files.ts` -- `listFilesRecursive(root)` returns absolute paths; reuse it for
  the `dist/` walks in `check-dist.mjs`'s and `size-budget.mjs`'s tests.

**Verified environment facts (re-checked 2026-08-27 at `28554bf`; cite rather than re-derive):**
- `jbrandtmse/dragonwar` is **PUBLIC**; `default_branch: main`; `has_pages: true`. Pages:
  `html_url: https://jbrandtmse.github.io/dragonwar/`, `build_type: workflow`,
  `https_enforced: true`, `source: { branch: main, path: / }`, **`status: null`** -- Pages is
  provisioned but no deployment has run; the first workflow run populates it. The `source`
  field is inert under `build_type: workflow`.
- Current branch is `DW-1-epic1`; `main`, `feature/DW-1_dragonwar-v1` and `DW-1-epic1` all
  exist on the remote; working tree clean at `28554bf`.
- `gh` 2.86.0 authenticated as `jbrandtmse` with `repo` and `workflow` scopes.
- Node 24.16.0, pnpm 11.24.0 on this host.
- `@babylonjs/core@9.22.2` and `@babylonjs/loaders@9.22.2` exist on the registry and declare
  `license: Apache-2.0`; source repository `git+https://github.com/BabylonJS/Babylon.js.git`.
  **Metadata is not the verification** -- `license.md` at the repository root was read at
  source (first line "# Apache License 2.0 (Apache)") and `NOTICE.md` is present (46 bytes,
  "Babylon.js / Copyright 2023 The Babylon.js team"). The implementer re-reads both at source
  before `pnpm add` and records the date it read them.

**Files this story creates:**
- `index.html` (root), `vite.config.ts`, `public/styles.css`,
  `public/THIRD-PARTY-NOTICES.txt`, `public/assets/dragonwar.glb`.
- `src/host/boot.ts`, `src/presentation/scene/create-engine.ts` (names indicative).
- `tools/make-placeholder-glb.mjs`, `tools/check-dist.mjs`, `tools/size-budget.mjs`,
  `tools/spike-3/measure-load.mjs`.
- `.github/workflows/ci.yml`.
- `docs/spikes/spike-3.md`.
- `test/check-dist.test.ts`, `test/size-budget.test.ts`, `test/scene-smoke.test.ts`,
  `test/spike-3-docs.test.ts`.

**Files this story edits:** `ATTRIBUTIONS.md`, `NOTICE`, `package.json`, `pnpm-lock.yaml`,
`tools/spike-1/index.html`, `tools/spike-1/browser.ts`, `tools/spike-1/measure.mjs`,
`test/attributions.test.ts`, `test/spike-1-browser-guard.test.ts`, `.gitignore` (only if a
second build output directory is introduced).

## Tasks & Acceptance

**Execution:** (dependency order; task 1 is a hard gate on everything after it)

- `ATTRIBUTIONS.md` + `NOTICE` -- BEFORE `pnpm add` runs: fetch and read `license.md` and
  `NOTICE.md` at the root of `https://github.com/BabylonJS/Babylon.js`, then add one **Code**
  table row each for `@babylonjs/core` and `@babylonjs/loaders` at `9.22.2` recording the
  source URL, "The Babylon.js team", `Apache-2.0` **as read in `license.md` at source, not
  from `package.json` or npm metadata**, and the verification date; move Babylon out of the
  "Planned dependencies" table into the Code table; update `NOTICE`'s Babylon paragraph from
  "not yet present" to present, naming `public/THIRD-PARTY-NOTICES.txt` as where the licence
  text ships -- rationale: CLAUDE.md's hard gate, NFR-9, AD-16; the entry precedes the file.
  **If the licence cannot be established by reading the licence file at source, HALT
  `provenance unverifiable` and add nothing.**
- `package.json` + `pnpm-lock.yaml` -- add a `dependencies` block with
  `@babylonjs/core` and `@babylonjs/loaders` at exactly `9.22.2` (no range, matching the
  spine's Stack table), and scripts `build` (`vite build`), `preview` (`vite preview`),
  `check:dist` (`node tools/check-dist.mjs`), `check:size` (`node tools/size-budget.mjs`)
  -- rationale: AR-1's pinned stack; `DW-11` asks for a scripted production build and preview.
- `public/THIRD-PARTY-NOTICES.txt` -- the full Apache-2.0 licence text plus Babylon's
  `NOTICE.md` content, copied verbatim from source -- rationale: **the repository is public and
  Pages now actually distributes the build**, so Apache-2.0 4(a) and 4(d) attach at this
  story's deploy, not at some later release.
- `tools/make-placeholder-glb.mjs` -- a Node-built-ins-only generator writing a valid glTF 2.0
  binary to `public/assets/dragonwar.glb`: top-level node `playfield_root` containing one box
  mesh `vis_placeholder_box` sized 0.5144 x 1.0668 m in the playfield plane with a small
  thickness, authored unpitched, glTF Y-up per AD-10, every node name matching
  `^[a-z][a-z0-9_]*$`; commit both the generator and its output so the asset is reproducible
  -- rationale: the AC's playfield-sized box with no dependency on Blender or on Story 1.4's
  `export.py`, and no third-party asset to source.
- `index.html` + `public/styles.css` -- the root entry: the CSP meta tag
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'">`
  **byte-for-byte as the planning artifacts now pin it**, a press-to-begin panel and a hidden
  error panel that are interactive from first paint, a render canvas, a visible link to
  `THIRD-PARTY-NOTICES.txt`, and one module `<script src>`; **all styling in the external
  stylesheet** -- no inline `<style>`, no `style=` attribute, no inline `<script>` anywhere
  -- rationale: AD-17; `default-src 'self'` blocks inline styles and scripts, so an inline gate
  panel would be invisible.
- `tools/spike-1/index.html` -- add the same CSP meta tag, so every HTML page the deploy
  publishes carries it and `check-dist.mjs` can assert the tag on **every** emitted page rather
  than on one special-cased path -- rationale: the harness page is deployed too (see
  `## Design Notes` -> "Decisions this spec makes"); the harness needs no directive beyond
  `'self'` because it fetches nothing.
- `vite.config.ts` -- `base: './'` (relative paths), `build.modulePreload: { polyfill: false }`
  (the polyfill is injected as an **inline** script that `default-src 'self'` blocks),
  `build.assetsInlineLimit: 0` (a `data:` URI asset defeats the payload measurement),
  `build.rollupOptions.input` naming both `index.html` and `tools/spike-1/index.html`, and a
  fixed `preview.port` with `strictPort: true` so the control URL is deterministic
  -- rationale: AD-17's static bundle; `DW-11` wants the Spike 1 harness permanently buildable
  from the repository's own scripts.
- `src/presentation/scene/create-engine.ts` -- create the engine exactly once via
  `EngineFactory.CreateAsync` with `useRightHandedSystem = true`; honour `?renderer=webgl2` as
  a forced WebGL2 path; load the placeholder glb through `@babylonjs/loaders`; render one frame
  and report which engine was actually chosen. **A WebGPU attempt that cannot initialise under
  the pinned CSP falls back to WebGL2 silently** -- the console evidence is captured and
  written into `docs/spikes/spike-3.md`, and nothing is surfaced to the player
  -- rationale: AD-12, AD-10, and the amended `epics.md:379`; Babylon lives in presentation,
  never in `sim/` (AD-1). Carry the GPL-3.0 header (AD-16).
- `src/host/boot.ts` -- wire the gate: **check WebGL2 support first and render the
  unsupported-browser message naming Chrome, Edge and Safari before any engine or asset work**
  (AD-17's minimum); nothing loads until the gesture; on the gesture create the engine, load
  the glb, render, and record the first-rendered-frame timestamp on `window` (plus the
  gesture timestamp) for the runner to read; on any boot-stage failure render the error panel
  with the failure named rather than white-screening. Comment that Story 6.1 owns the full
  platform gate and error panel -- rationale: AD-17; the gate is what the load measurement
  clicks.
- `tools/check-dist.mjs` -- one script asserting over the built `dist/`: **every** emitted
  `.html` carries the CSP meta tag with the exact amended directives; every asset reference is
  relative (none begins with `/`) and no external origin appears anywhere in `dist/`; there is
  no inline `<script>`, `<style>` or `style=`; no `*sw.js` / `service-worker.js` is emitted and
  no `serviceWorker.register` string appears in any chunk; `THIRD-PARTY-NOTICES.txt` is present
  and linked from `dist/index.html`. Exit non-zero naming the first violation
  -- rationale: the AC's "a CI step greps the CSP tag and fails if it is absent", widened to
  the sibling invariants named in the same AC.
- `tools/size-budget.mjs` -- walk `dist/` recursively (reuse `listFilesRecursive`'s shape),
  gzip each file at level 9 in memory, sum, compare against a single `BUDGET_BYTES` constant,
  print measured and budgeted bytes (and the largest contributors on failure), exit non-zero
  when over. The constant carries a comment recording the measured baseline, the date, the
  headroom arithmetic and which stories re-set it -- rationale: the AC's CI budget and its
  failure message.
- `tools/spike-1/browser.ts` + `tools/spike-1/measure.mjs` -- close `DW-16`: add a
  **median**-rAF-delta check (reject above 20 ms) alongside the existing 100 ms per-frame
  guard, surface the observed median cadence on `Spike1Result` and in the runner's JSON output;
  re-point `measure.mjs`'s `DEFAULT_URL` at the preview URL and update its header comment to
  the now-scripted build/preview commands. **Add no import to `browser.ts`** (the harness
  boundary test) -- rationale: `DW-16` and `DW-11` are this story's to close; every number now
  carries its cadence.
- `tools/spike-3/measure-load.mjs` -- the load runner, modelled on `measure.mjs` and using only
  Node 24 built-ins over CDP (no Playwright, Puppeteer or Selenium): fresh temp profile per
  invocation (cold by construction), headed, same anti-throttling flags,
  `Network.setCacheDisabled(true)`, `Network.emulateNetworkConditions` with
  `downloadThroughput: 6_250_000` bytes/s and an explicit `latency` (authored default 20 ms,
  overridable by flag, always printed), accumulate `encodedDataLength` from
  `Network.loadingFinished` for the compressed transfer total and count requests, dispatch the
  press-to-begin gesture over `Input.dispatchMouseEvent` at the panel's measured centre as soon
  as it is interactive, read the first-rendered-frame and gesture timestamps, sample rAF
  cadence after first frame, apply the 20 ms median guard, and print one JSON result
  -- rationale: the AC's throttled cold load, taken through the only channel this project
  trusts (`DW-16`).
- `.github/workflows/ci.yml` -- on every push and pull request: install with pnpm (via
  `packageManager`), then `typecheck`, `test`, `build`, `check:dist`, `check:size`. A second
  job deploys `dist/` as a Pages artifact, with `permissions: { pages: write, id-token: write,
  contents: read }`, `environment: github-pages` and a `pages` concurrency group. **Its trigger
  is `main` + `workflow_dispatch` + `DW-1-epic1`, the last carrying a comment naming the
  narrow-back acceptance item below.** Resolve each action's current major tag at
  implementation time (`gh api repos/<owner>/<repo>/releases/latest`) and pin it rather than
  floating -- rationale: AR-34's minimum CI for this story; Story 1.3 extends it with
  dependency-cruiser, the licence-header check and the SHA stamp.
- `.github/workflows/ci.yml` (second edit, **after every measurement is recorded**) -- remove
  the `DW-1-epic1` trigger, leaving `main` + `workflow_dispatch` -- rationale: the seventh
  acceptance criterion added to `epics.md`; restores AD-17 / AR-34's `main`-only shipping rule
  before Epic 1's merge gate. This is an item of this story, not a follow-up.
- `test/**` -- unit-test every I/O Matrix row that does not need a browser: extend
  `test/attributions.test.ts` with the two Babylon rows in its existing normalised-content
  shape; `test/check-dist.test.ts` and `test/size-budget.test.ts` invoke the real scripts as
  subprocesses (the `test/measure-cli.test.ts` pattern) against fixture directories and assert
  exit codes and message contents, **including the deliberately-failing budget case**;
  `test/scene-smoke.test.ts` is the `NullEngine` load smoke asserting the placeholder glb
  parses and `playfield_root` exists; `test/spike-1-browser-guard.test.ts` gains the
  median-cadence rejection case through `installFakeRaf()`; `test/spike-3-docs.test.ts` pins
  the results document's required structure the way `test/spike-1-docs.test.ts` pins Spike 1's
  -- rationale: AD-15 allows exactly one presentation test (the `NullEngine` smoke); Rule 3
  wants real invocations with exit-code assertions.
- `docs/spikes/spike-3.md` -- the results document; contents enumerated in the acceptance
  criteria below -- rationale: the AC's named output artefact.

**Acceptance Criteria:**

- Given `ATTRIBUTIONS.md` has no Babylon row in its Code table and `package.json` has no
  `@babylonjs/*` dependency, when the dependencies are added, then the two rows are written and
  saved to disk **before** `pnpm add` is invoked, each recording the source URL, the author,
  `Apache-2.0` as read in `license.md` in the Babylon.js repository (explicitly not from
  `package.json` or npm metadata) and the verification date -- and `pnpm test` asserts the rows'
  content so a later edit cannot silently trim them.
- Given the deployed build, when `THIRD-PARTY-NOTICES.txt` is opened from the link on the
  press-to-begin panel, then it shows the full Apache-2.0 licence text and Babylon's `NOTICE.md`
  content verbatim.
- Given `pnpm build` has run, when `node tools/check-dist.mjs` is invoked, then it exits 0
  having confirmed the amended CSP meta tag and its directives on every emitted `.html`, only
  relative asset references, no inline `<script>`/`<style>`/`style=`, no service worker, and the
  notice file present and linked; and when any one of those is removed from a fixture, it exits
  non-zero naming that violation.
- Given a browser without WebGL2, when the built page loads, then the unsupported-browser
  message naming Chrome, Edge and Safari renders before any engine is created and before any
  asset is requested (AD-17's minimum; Story 6.1 owns the full gate).
- Given a WebGL2-capable browser and a fresh load of the built page, when the press-to-begin
  gesture fires, then `EngineFactory.CreateAsync` is called exactly once with
  `useRightHandedSystem = true`, the placeholder `dragonwar.glb` loads over the same-origin
  fetch the amended `connect-src 'self'` admits, and a frame renders -- and with
  `?renderer=webgl2` appended, the WebGL2 engine is created even where WebGPU is available.
- Given a WebGPU-capable Chrome and no query string, when the engine is created under the
  pinned CSP, then WebGPU is chosen **if and only if** it initialises with its transpiler served
  from our own origin and never a CDN; otherwise the engine falls back to WebGL2 **silently**,
  the page still renders a frame, and the outcome plus the exact console evidence is recorded in
  `docs/spikes/spike-3.md`. A WebGPU failure is a recorded result, **not** a HALT, and no
  `script-src` grant or `'wasm-unsafe-eval'` is added to obtain it.
- Given the CI workflow, when a commit is pushed to `DW-1-epic1`, then the checks job runs
  install, typecheck, test, build, the static-bundle check and the size budget, and passes; the
  run id and URL are recorded in `docs/spikes/spike-3.md`.
- Given the deploy job, when it runs, then `dist/` is published to
  `https://jbrandtmse.github.io/dragonwar/` and that URL renders the placeholder in Chrome on
  Windows; the Safari/macOS confirmation is recorded as `PENDING - author's macOS leg`
  referencing ledger entry `DW-1`, with no new ledger entry filed.
- Given `https://jbrandtmse.github.io/dragonwar/`, when it is loaded cold at least 5 times
  through `tools/spike-3/measure-load.mjs` with the cache disabled and the connection throttled
  to 50 Mbps, interleaved back-to-back with the same number of local `vite preview` control runs
  of the byte-identical `dist/`, then `docs/spikes/spike-3.md` records for each path: every raw
  sample, the median, the range, the run count, the observed median rAF cadence, the compressed
  transfer size, the request count, and the navigation-to-first-rendered-frame and
  gesture-to-first-rendered-frame times -- with the 10 s and 20 MB NFR-4 targets stated
  alongside and the median named as the figure of record (`DW-13`).
- Given a run whose median rAF delta exceeds 20 ms, when the runner completes it, then the run
  is rejected with a non-zero exit naming the observed cadence and frame count, and no rejected
  run appears in the results document (`DW-16`).
- Given the measured compressed baseline, when `BUDGET_BYTES` is set, then it equals the
  baseline rounded up to the next 0.25 MB plus 2.00 MB of authored headroom for the remainder of
  Epic 1, is below NFR-4's 20 MB product ceiling, and the arithmetic, the date and the stories
  that re-set it (1.4 when the real glb lands, and the Epic 5 art passes) are recorded both in
  the script's comment and in `docs/spikes/spike-3.md`.
- Given the size budget is set, when a build's gzipped `dist/` total exceeds it, then
  `node tools/size-budget.mjs` exits non-zero with both the measured and the budgeted numbers in
  the message -- demonstrated by a test that lowers the budget below the real measurement, not
  by inspection.
- Given the measured load profile, when `docs/spikes/spike-3.md` is written, then it records the
  one-glb-versus-split decision with the numbers that support it and the observable condition
  that would reopen it, closing the spine's "Asset split" deferral for now.
- Given every measurement is recorded, when the story finishes, then the `DW-1-epic1` trigger has
  been removed from `.github/workflows/ci.yml` -- leaving `main` plus `workflow_dispatch` only --
  and `docs/spikes/spike-3.md` states in its own sentence that the measured artifact was built
  from an unmerged branch and is provisional until the workflow reruns from `main`. Verified by
  reading the committed workflow, not by intent.
- Given the spike is complete, when `docs/spikes/spike-3.md` is read, then it also carries: the
  exact reproducible build, preview and measurement commands (superseding the ad-hoc invocation
  at `docs/spikes/spike-1.md` lines 547-559, which closes `DW-11`); the machine, browser
  versions and date of every run; the throttling parameters **including the latency actually
  applied**; the cadence-guard threshold and its rationale; which engine was chosen and whether
  WebGPU initialised under the pinned CSP; and references by name to ledger entries `DW-1`,
  `DW-11`, `DW-13` and `DW-16` with no new entries filed for matters already adjudicated.

## Spec Change Log

**2026-08-27 - plan stage HALT `intent gap` resolved by author decision; spec reset to `draft`
for re-plan.** The plan stage refused to plan around a contradictory NFR (Rule 5). The author
decided all three blockers; the lead applied them:

1. **NFR-7 CSP amended.** `default-src 'self'; connect-src 'none'` ->
   `default-src 'self'; connect-src 'self'` in all six pinned locations:
   `epics.md:124` (NFR-7), `epics.md:373` (this story's AC 2), `epics.md:1686` (Story 6.2 AC),
   `ARCHITECTURE-SPINE.md:214` (AD-17), `SOLUTION-DESIGN.md:149` (deployment),
   `reviews/review-rubric.md:103` (L9). The CI grep is kept and now greps the amended string.
   Rationale: `connect-src` does not fall back to `default-src` once set and `'none'` admits no
   URL, same-origin included, so Babylon's glTF loader could never fetch `dragonwar.glb`;
   `'self'` preserves everything NFR-7 protects (no telemetry, no third-party origin) while
   admitting the same-origin asset load. `.memlog.md:68` was deliberately NOT edited - it is a
   historical decision record and stays as-written.
2. **WebGPU AC reworded** (`epics.md:379`): WebGPU is chosen only where it initialises under the
   pinned CSP, with its transpiler served from our own origin and never a CDN, falling back to
   WebGL2 silently otherwise; `?renderer=webgl2` still forces WebGL2. No `script-src` grant and
   no `'wasm-unsafe-eval'`. This matches AD-12 / AR-27's "no feature may require WebGPU".
3. **Measurement surface provisioned.** `jbrandtmse/dragonwar` was made PUBLIC and Pages
   provisioned at `https://jbrandtmse.github.io/dragonwar/` (`build_type=workflow`,
   `https_enforced=true`, no deployment yet). The story therefore measures the real cold
   anonymous from-a-link load as originally specified, and ledger `DW-11` becomes closeable
   within this story rather than re-owned.
4. **Deploy trigger authorised on the epic branch, with a mandatory narrow-back.** The workflow
   may trigger on `DW-1-epic1` and `workflow_dispatch` so the spike can measure a live
   deployment now. A new acceptance criterion was added to `epics.md` (after this story's
   existing ACs) requiring the epic-branch trigger to be removed - narrowing back to `main` +
   `workflow_dispatch` - before Epic 1's merge gate, and requiring `docs/spikes/spike-3.md` to
   record that the measured artifact came from an unmerged branch and is provisional until it
   reruns from `main`.

The `<intent-contract>` block was updated in place: the three resolved `Block If` halts are
lifted and replaced with the corresponding `Always` constraints. The provenance `Block If`
(licence unverifiable at source) is untouched and still binding.

**2026-08-27 - re-plan against the amended artifacts (this pass).** The spec was re-dispatched
at `status: draft`. The `<intent-contract>` block was preserved verbatim, as the workflow
requires; `## Code Map`, `## Tasks & Acceptance`, `## Design Notes` and `## Verification` were
re-derived around the amendments above. What changed, and why:

- **`baseline_revision` advanced** `4034d467942c9835d7bd2f2298b6766db60653ef` ->
  `28554bf641334e95c07520ef44817c56753b6c63`, read from version control at re-plan time. The
  older value predates the lead's amendment commits, so a ledger adjudication measuring "the
  diff since `baseline_revision`" would otherwise have attributed the lead's planning-artifact
  edits to this story's delivered scope.
- **Environment facts corrected.** The previous Code Map recorded the repository as private
  with no Pages site. Re-verified at re-plan time: `visibility: public`, `has_pages: true`,
  Pages `html_url: https://jbrandtmse.github.io/dragonwar/`, `build_type: workflow`,
  `https_enforced: true`, `status: null` (provisioned, no deployment yet). The Pages ACs are
  now measurable as written, so nothing is deferred and `DW-11` closes inside this story.
- **AD-17 re-read after the amendment.** The `### Governing ADs` entry no longer describes
  AD-17 as an invariant this story cannot satisfy; it now also carries AD-17's
  WebGL2-check-before-assets clause, which was previously left implicit and is now an explicit
  acceptance criterion and a `boot.ts` task.
- **The WebGPU acceptance criterion was inverted** to match the amended `epics.md:379`: a
  WebGPU path that cannot initialise under the pinned CSP is a **recorded result with a silent
  WebGL2 fallback**, not a HALT. See the superseded-row note under `## Design Notes` -- the
  frozen I/O Matrix still carries the pre-amendment instruction and cannot be edited from here.
- **The narrow-back became a checkable acceptance item**, with its own Given/When/Then and its
  own task line, verified by reading the committed workflow. It was previously only prose.
- **Code Map anchors re-verified at `28554bf`** and four were off by one or stale
  (`Spike1Result` 24->23, `nearestRankP95` 34->35, `runFrames` 47->46, `looksLikeDevServer`
  52->51; the anti-throttling launch flags are at 281-283, not 303). Two constraints the
  previous map omitted were added: `test/spike-1-harness-boundary.test.ts` forbids any new
  import in `tools/spike-1/browser.ts`, and `docs/spikes/spike-1.md` line 714 names Story 1.2
  by number in its standing A/B recommendation.
- **`tools/spike-1/index.html` gains the CSP tag** so `check-dist.mjs` can assert the tag on
  every emitted page rather than special-casing one path. The harness page is deployed by this
  story's own decision to build it into `dist/`.

## Review Triage Log

## Design Notes

### Corrected row inside the intent block (lead edit at the validation gate, 2026-08-27)

The re-plan correctly flagged that the I/O & Edge-Case Matrix's **"Renderer selection"** row
still carried the pre-amendment instruction *"HALT `intent gap` - do not silently downgrade"*,
which contradicted the amended `epics.md:379`, the `Always` clause in the same block, and the
epic context. The plan stage cannot edit the frozen `<intent-contract>`, so it overrode the row
in prose and escalated the choice.

**The lead corrected the row at source instead of leaving the override standing.** A
contradiction inside the authoritative contract is a defect an implementer can trip over even
when a note elsewhere says to ignore it - and the intent block is precisely what the lead
amends under the re-dispatch protocol. The row now reads: WebGPU is chosen where it initialises
under the pinned CSP with its transpiler served from our own origin; otherwise WebGL2 is taken
**silently**, with the console evidence recorded in `docs/spikes/spike-3.md` and nothing
surfaced to the player; `script-src` / `'wasm-unsafe-eval'` are never granted and the
transpiler is never fetched from a CDN.

There is no longer any superseded text to work around: the Matrix row, the sixth acceptance
criterion and the amended `epics.md:379` now say the same thing.

### The CSP amendment (RESOLVED 2026-08-27 - retained as its rationale)

> **Status: resolved by author decision. Do not re-raise.** The pinned string is now
> `default-src 'self'; connect-src 'self'` in all six locations
> (`epics.md:124` NFR-7, `epics.md:373` this story's AC, `epics.md:1686` Story 6.2's AC,
> `ARCHITECTURE-SPINE.md:214` AD-17, `SOLUTION-DESIGN.md:149`, `reviews/review-rubric.md:103`
> L9). Re-read at re-plan time and confirmed amended in `epics.md` and `ARCHITECTURE-SPINE.md`.
> `.memlog.md:68` deliberately still reads `'none'`: it is a historical decision record, not a
> live artifact. **Do not "fix" it and do not treat the difference as a contradiction.**

The reason the amendment was needed, kept because it is the evidence the amendment rests on:
`connect-src` governs `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon`;
unlike most directives it does **not** fall back to `default-src` when set, and `'none'`
admits no URL at all -- same-origin included. `<meta http-equiv>` enforces it (only
`frame-ancestors`, `report-uri` and `sandbox` are ignored in meta form). Babylon's glTF loader
fetches the `.glb` over exactly that interface, and AD-11 has the runtime fetching **two**
files at load time (`dragonwar.glb` and `dragonwar.collision.json`), while AD-17 lists "asset
404" as a boot-stage failure the error panel must render -- a 404 only reachable if a request
was made. `'self'` preserves everything NFR-7 protects (no telemetry, no third-party origin,
nothing off the static origin) while admitting the same-origin asset load that the
architecture already mandates.

**What is still forbidden and unchanged:** never weaken the CSP further from inside this
story; never inline the glb as a `data:` URL or base64 in the JS bundle to dodge a fetch -- it
inflates the payload about 33 % and makes the transfer-size and first-frame numbers describe
something other than the shipping load path, which is the one thing this spike exists to
establish. (A `data:` URL inside the Node `NullEngine` **test** is not the shipping load path
and is not covered by that prohibition -- see the test note below.)

### Deployment (RESOLVED 2026-08-27 - repository public, Pages live)

> **Status: resolved. Do not re-raise.** `jbrandtmse/dragonwar` is PUBLIC; Pages is
> provisioned at `https://jbrandtmse.github.io/dragonwar/` with `build_type: workflow` and
> `https_enforced: true`, `status: null` until the first workflow run deploys it. The deploy
> workflow is authorised to trigger on `DW-1-epic1` plus `workflow_dispatch` for this spike,
> and **MUST be narrowed back to `main` plus `workflow_dispatch` before Epic 1's merge gate**
> -- an acceptance item of this story, with its own Given/When/Then above.
> `docs/spikes/spike-3.md` states that the measured artifact was built from an unmerged branch
> and is provisional until it reruns from `main`.

Because the repository is public and Pages actually distributes the build, Apache-2.0 section 4(a)
and section 4(d) bind now rather than at some later release: `dist/` must carry
`THIRD-PARTY-NOTICES.txt` (Apache-2.0 text plus Babylon's `NOTICE.md` content) reachable from
the page, and `check-dist.mjs` fails the build if it is missing or unlinked.

### Governing ADs (Rule 6)

The registry for this project is the architecture spine's numbered invariants (AD-1 .. AD-19)
at `_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md`
-- there is no `docs/adr/` directory. Governing this story:

- **AD-17** (line 210, **re-read after the 2026-08-27 amendment**) -- static `dist/`, relative
  paths, no service worker, the amended CSP meta tag grepped in CI, a press-to-begin panel, a
  **WebGL2 check and unsupported-browser message naming Chrome, Edge and Safari before any
  asset loads**, one host error panel for every later boot-stage failure, and the compressed
  payload budget this spike re-sets. The primary invariant; the amendment removed the clash
  its CSP clause used to have with this story's asset load.
- **AD-12** (182) -- the engine is chosen once at boot via `EngineFactory.CreateAsync`;
  WebGL2 is the floor and always renders; `?renderer=webgl2` forces it; **no feature may
  require WebGPU**, which is exactly why the silent fallback is correct and a HALT is not.
- **AD-1** (69) -- ports-and-adapters with a fixed dependency direction. `@babylonjs/*` enters
  `presentation/` and `host/` only; `src/sim/**` stays DOM-free and engine-free, which
  `test/sim-boundary.test.ts` now tests against a real Babylon install rather than against an
  absence.
- **AD-10** (168) -- canonical frame, right-handed scene, glb in metres Y-up, geometry
  authored unpitched, playfield 514.4 x 1066.8 mm.
- **AD-11** (176) -- Blender owns placement and `public/assets/` holds the exported glb. The
  generated placeholder is a **deviation recorded on purpose**: it comes from
  `tools/make-placeholder-glb.mjs`, not from `tools/export.py`, because the export pipeline is
  Story 1.4's. It borrows only the node-name grammar and the `playfield_root` top-level node,
  so Story 1.4 replaces it behind the same contract and the same path.
- **AD-16** (204) -- boundaries linted in CI; ported and borrowed files keep their notices.
  Here that is the Apache-2.0 obligations and the GPL-3.0 header on every new file.
  dependency-cruiser itself is Story 1.3's.
- **AD-15** (198) -- "no automated presentation tests in v1 beyond a `NullEngine` load smoke",
  which is why `test/scene-smoke.test.ts` is the only presentation test this story adds.

### Integration ACs, Consumed-by and Consumes (Rules 1 and 2)

This story introduces shared surfaces (`src/host/boot.ts`, `src/presentation/scene/**`, the
build config, four `tools/` scripts and the CI workflow). It has real in-story consumers, none
mocked -- the last row of the I/O Matrix is their Integration AC: the CI workflow consumes the
build scripts and the checks on a real push, and the deployed Pages URL consumes `dist/` and
renders the placeholder. The size-budget failure path is exercised by a consumer-tier test that
runs the real script with a lowered budget and asserts the exit code and both numbers in the
message.

- `Consumes:`
  - **Story 1.1** -- `package.json`, `tsconfig.json`, `vitest.config.ts` (the scaffold);
    `src/sim/contracts/time.ts` and `src/sim/physics/**` indirectly, through the Spike 1
    harness page that becomes a second build input; `tools/spike-1/measure.mjs` and
    `tools/spike-1/browser.ts` as the model and the edit target for the new runner;
    `test/attributions.test.ts`, `test/measure-cli.test.ts` and `test/spike-1-docs.test.ts` as
    the test patterns; `test/util/list-files.ts` as a helper.
- `Consumed-by:`
  - **Story 1.3** -- extends `.github/workflows/ci.yml` with dependency-cruiser, the per-file
    licence-header check and the SHA stamp, and consumes `vite.config.ts` and the build
    scripts. Also owns `DW-15` (the `DOM` lib reaching `src/sim/**`).
  - **Story 1.4** -- replaces `public/assets/dragonwar.glb` with the `tools/export.py` output
    behind the same path and node-name contract, adds `dragonwar.collision.json`, and re-sets
    `BUDGET_BYTES`.
  - **Stories 1.5-1.7** -- render through the scene this story boots.
  - **Story 1.8** -- adds the replay-goldens and browser-parity jobs to this workflow.
  - **Story 4.7 (Spike 2)** and **Story 6.6** -- reuse this story's measurement protocol and
    the cadence guard; `docs/spikes/spike-1.md` line 714 names both explicitly.
  - **Story 6.1** -- replaces the minimal press-to-begin gate, the WebGL2 check and the error
    panel with the full platform gate; **Story 6.3** replaces `?renderer=webgl2` with the
    Settings toggle; **Story 6.2** re-asserts the same pinned CSP.
  - **Epic 1's merge gate** -- consumes the narrow-back acceptance item; the epic cannot close
    with the `DW-1-epic1` deploy trigger still present.

### Ledger entries this story owns

- **`DW-11`** (routed, owner = this story) -- **fully closeable here now that Pages is live.**
  Closed by the `build` / `preview` scripts, the two-entry `vite.config.ts`, `measure.mjs`'s
  re-pointed `DEFAULT_URL`, the live deployment, and the reproducible commands recorded in
  `docs/spikes/spike-3.md`. `docs/spikes/spike-1.md` is Story 1.1's dated record and is
  deliberately left unedited; the new document states that it supersedes the ad-hoc invocation
  recorded there at lines 547-559.
- **`DW-16`** (open, owner = this story) -- closed by the median-cadence guard in
  `tools/spike-1/browser.ts` and in the new load runner, by reporting the observed cadence
  beside every number, and by the new rejection test. The 20 ms threshold is authored: 60 fps
  is a 16.67 ms delta, 20 ms leaves about 20 % slack, and the observed defect (28.9 fps,
  34.6 ms) is rejected comfortably. Story 1.1's recorded runs all ran at 60 fps, so the tighter
  guard does not retroactively invalidate them.
- **`DW-13`** (escalated, owner = `burndown`) -- **survived, not closed.** Its standing rule is
  obeyed: medians over at least 5 runs, every raw sample published, and every comparison
  measured as an interleaved A/B adjacent in time in one session. The local-preview control
  runs exist for exactly that reason, not as a substitute for the Pages figure.
- **`DW-1`** (routed, owner = `burndown`) -- **not closed, and no new entry filed.** The
  Safari/macOS legs are author-owned; the row in `docs/spikes/spike-3.md` reads
  `PENDING - author's macOS leg` and references `DW-1` by name.
- **`DW-15`** (routed, owner = Story 1.3) -- untouched here. Do not fix `tsconfig.json`'s
  `DOM` lib in this story.

### Decisions this spec makes that the planning artifacts leave open

- **"Compressed `dist/`" means** the sum of every file under `dist/` gzipped at level 9. This
  build has no lazy-loaded route, so everything emitted is initial payload; gzip is also what a
  static host negotiates, which keeps the CI number comparable to the transfer size the runner
  measures. A later story that introduces lazy loading must refine the definition.
- **The Spike 1 harness page is built into `dist/` and therefore deployed and counted.** It is
  a few tens of KB against a Babylon baseline in the megabytes, the budget carries authored
  headroom anyway, and publishing it is what makes the production measurement surface permanent
  (`DW-11`). Record its share of the total in the results document. Because it is published, it
  gets the CSP tag too, and `check-dist.mjs` asserts the tag on **every** emitted page.
- **50 Mbps is expressed to CDP as `downloadThroughput: 6_250_000` bytes per second**, with an
  **authored default latency of 20 ms** (overridable by flag) stated explicitly in the results
  document so a re-run is comparable. The AC names a throughput and no latency; whichever value
  is used, it is recorded rather than left implicit.
- **The figure of record is the median**, not the mean and not a single run (`DW-13`).
- **Headroom arithmetic:** baseline rounded up to the next 0.25 MB, plus 2.00 MB. Stated as
  authored, not derived, so it is cheap for the author to overrule -- and it must stay below
  NFR-4's 20 MB ceiling, which no later re-set may exceed.
- **Reopen condition for the one-glb decision:** authored thresholds, stated as such -- reopen
  the split if the glb alone exceeds 40 % of compressed transfer or 30 % of
  navigation-to-first-frame. The spine's "Asset split" deferral asks for a load-profiling call,
  and a bare decision with no reopen condition would not survive Epic 5's art passes.
- **The `NullEngine` smoke imports Babylon by deep ES path** (`@babylonjs/core/Engines/nullEngine`,
  `@babylonjs/core/Loading/sceneLoader`, `@babylonjs/loaders/glTF/2.0`), not the side-effectful
  barrel, so it runs under `vitest`'s existing `environment: 'node'` with no DOM and no new
  devDependency. It reads `public/assets/dragonwar.glb` off disk and feeds the bytes to the
  loader; a `data:` URL is acceptable **inside this test only** -- it is not the shipping load
  path. If a jsdom/happy-dom environment ever looks necessary, that is a new dependency and
  therefore an `ATTRIBUTIONS.md` entry first, not a quiet install.

### Footprint note

Epic 1's declared footprint is `src/**`, `test/**`, `tools/**`, `assets/src/**`,
`.github/workflows/**`, `package.json`, plus `docs/spikes/**`, `ATTRIBUTIONS.md`, `index.html`
and the build config this story's ACs name (`vite.config.*`, `tsconfig*.json`,
`pnpm-lock.yaml`). Three further paths were flagged by the previous plan pass and the lead has
since confirmed them **in footprint**:

- **`public/`** -- `styles.css`, `THIRD-PARTY-NOTICES.txt` and `assets/dragonwar.glb`. AR-26
  and AD-11 name `public/assets/` as the architecture's own location for the exported glb, and
  Vite's `publicDir` is where a static bundle's unbundled files must live.
- **`NOTICE`** -- its Babylon paragraph says "None of the following is yet present in this
  repository", which stops being true the moment `pnpm add` runs.
- **`.gitignore`** -- only if a second build output directory is introduced.

Nothing else is touched. `docs/spikes/spike-1.md`, `_bmad-output/**` (beyond this spec's own
frontmatter) and `.memlog.md` are explicitly out of scope for this story's edits.

## Verification

**Commands:** (run from `C:/git/dragonwar/.worktrees/epic-1`)

- `pnpm install` -- expected: exits 0; `pnpm-lock.yaml` updated with both Babylon packages
  pinned at exactly `9.22.2`.
- `pnpm typecheck` -- expected: `tsc --noEmit` exits 0 with no diagnostics.
- `pnpm test` -- expected: exits 0; Story 1.1's 187 existing tests still pass alongside the new
  ones; `test/sim-boundary.test.ts` still proves no `@babylonjs/*` import under `src/sim/`;
  `test/spike-1-harness-boundary.test.ts` still proves `tools/spike-1/browser.ts` gained no
  import.
- `pnpm build` -- expected: exits 0; `dist/index.html` and `dist/tools/spike-1/index.html` both
  emitted; no inline script or style in either.
- `node tools/check-dist.mjs` -- expected: exits 0 reporting each invariant it checked.
- `node tools/size-budget.mjs` -- expected: exits 0 printing measured and budgeted bytes.
- `pnpm preview` (background) then `node tools/spike-3/measure-load.mjs --url <preview URL>`
  -- expected: exits 0 printing JSON with a compressed transfer total, a request count, the two
  first-frame times and an observed median rAF delta at or under 20 ms.
- `node tools/spike-3/measure-load.mjs --url https://jbrandtmse.github.io/dragonwar/` at least
  5 times, interleaved back-to-back with the control -- expected: each exits 0; every sample
  recorded, none discarded silently.
- `node tools/spike-1/measure.mjs --browser chrome --url <preview URL>` -- expected: exits 0,
  still prints `samples: 600` and a p95, now with the observed median cadence beside it.
- `gh run list --branch DW-1-epic1 --limit 5` and `gh run view <id>` -- expected: the checks job
  is green on a real push; record the run id and URL.
- `gh api repos/jbrandtmse/dragonwar/pages --jq '.status'` -- expected: no longer `null` once
  the first deployment lands.
- `grep -n "DW-1-epic1" .github/workflows/ci.yml` -- expected, **at story end**: no match; the
  triggers are `main` and `workflow_dispatch` only.
- `git status --porcelain` -- expected: clean apart from this story's intended files; no
  `node_modules/`, `dist/` or stray build output tracked.

**Manual checks:**
- The `ATTRIBUTIONS.md` Babylon rows exist and are complete **before** any `@babylonjs`
  dependency appears in `package.json` -- confirm by the edit order, not just the end state.
- `https://jbrandtmse.github.io/dragonwar/` renders the placeholder box in Chrome on Windows,
  and `THIRD-PARTY-NOTICES.txt` opens from the link on the panel; the Safari/macOS row in
  `docs/spikes/spike-3.md` reads `PENDING - author's macOS leg` and references `DW-1`.
- With `?renderer=webgl2` the WebGL2 engine is created; without it, whichever engine
  initialises is recorded, and a WebGPU failure is a logged result rather than a stopped run.
- `docs/spikes/spike-3.md` carries every element the acceptance criteria enumerate, including
  all raw samples, the applied latency, the provisional-artifact sentence, and files no new
  ledger entry for `DW-1`, `DW-13` or any other already-adjudicated matter.
- `_bmad-output/implementation-artifacts/deferred-work.md` is unchanged by this story; deferred
  findings go in this spec's frontmatter `deferred:` list for the lead to harvest.

## Auto Run Result

Status: ready-for-dev
Blocking condition: none

### Plan stage (2026-08-27, re-plan)

Re-planned against the amended planning artifacts. The three blockers the previous pass HALTed
on are resolved and were verified as resolved rather than assumed: the CSP now reads
`default-src 'self'; connect-src 'self'` in `epics.md` NFR-7 (line 124), in this story's AC
(373) and in `ARCHITECTURE-SPINE.md` AD-17 (214); `epics.md:379` now makes WebGPU conditional
with a silent WebGL2 fallback and no `script-src` grant; `jbrandtmse/dragonwar` is public with
Pages provisioned at `https://jbrandtmse.github.io/dragonwar/`; and `epics.md` carries a
seventh acceptance criterion requiring the epic-branch deploy trigger to be narrowed back
before Epic 1's merge gate. The only `Block If` still binding is the provenance one -- a
Babylon licence that cannot be verified by reading the licence file at source.

No new NFR tripwire (Rule 5). One item is flagged for the lead at the validation gate rather
than raised as a HALT: the frozen `<intent-contract>` block's "Renderer selection" Matrix row
still carries the pre-amendment "HALT `intent gap`" instruction for a WebGPU failure. The
workflow preserves that block verbatim on a `draft` re-plan, so it was overridden explicitly in
`## Design Notes` and in an acceptance criterion that names the silent fallback as governing.
If the lead prefers the frozen text corrected, that is a lead edit.

**Lead resolution (validation gate, 2026-08-27):** the row WAS corrected at source rather
than left overridden -- see `## Design Notes` -> "Corrected row inside the intent block".
The Matrix row, the acceptance criterion and `epics.md:379` now agree; there is no
superseded text left to work around.
