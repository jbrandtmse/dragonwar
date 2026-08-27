---
title: 'Story 1.2: Spike 3 - build size and load time measured from a link'
type: 'feature'
created: '2026-08-27'
status: 'blocked'
baseline_revision: '4034d467942c9835d7bd2f2298b6766db60653ef'
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

**Block If:**
- **The pinned CSP forbids loading the glb.** `connect-src 'none'` blocks every
  `fetch`/`XMLHttpRequest`, including same-origin ones, and Babylon's glTF loader fetches
  `dragonwar.glb` over exactly that interface. The pinned string and the runtime asset load
  cannot both hold. Do NOT weaken the CSP unilaterally and do NOT sidestep it by inlining the
  glb as a `data:` URL or as base64 inside the JS bundle - that would make the payload and
  first-frame numbers unrepresentative of the shipping architecture (AD-11 fetches
  `public/assets/dragonwar.glb` and `dragonwar.collision.json` at runtime), which is the one
  thing this spike exists to measure. HALT with status `blocked`, blocking condition
  `intent gap`. See `## Design Notes` -> "The CSP contradiction" for the evidence and the
  recommended amendment.
- **GitHub Pages cannot serve an anonymously reachable link.** Verified 2026-08-27:
  `jbrandtmse/dragonwar` is PRIVATE and `GET /repos/jbrandtmse/dragonwar/pages` returns 404
  (no Pages site configured). Publishing the repository, or enabling Pages on a private
  repository, is the author's decision and never an agent's. HALT with status `blocked`,
  blocking condition `pages deployment not authorized`.
- **The first Pages deployment cannot reach the default branch.** The deploy job runs on
  `main` only (AR-34, AD-17), and this story's work sits on the epic branch. If the lead has
  not authorised a route to a live deployment before the measurement legs run, HALT with
  status `blocked`, blocking condition `pages deployment not authorized` - do NOT substitute
  a local `vite preview` figure for the Pages figure, and do NOT relax the deploy job's
  branch condition to make the branch deploy itself.
- **`@babylonjs/core` or `@babylonjs/loaders` at `9.22.2` cannot have its licence established
  by reading the licence file in its source repository.** A licence that cannot be verified at
  source means the package is not added. HALT with blocking condition
  `provenance unverifiable`.

**Never:**
- Never edit the CSP string, the `20 MB` NFR-4 ceiling, or any other planning-artifact wording
  from inside this story. A contradiction in a planning artifact is a HALT for the lead to
  amend (Rule 5), never a code-side workaround.
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
| Renderer selection | A WebGPU-capable Chrome, no query string | The WebGPU engine is chosen | If WebGPU cannot initialise under the pinned CSP, record the exact console evidence and HALT `intent gap` - do not silently downgrade (AD-12 makes WebGL2 the floor, but the AC names WebGPU) |
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
- `CLAUDE.md` - the provenance rule; the "verify at source, not from `package.json`" trap.
- `NOTICE` - already names Babylon.js: "Apache-2.0. Retain the licence and any NOTICE content
  from the distribution." This story is the first distribution.
- `_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md`
  - AD-17 at line 210 (the pinned CSP, static bundle, size budget), AD-12 at 182 (engine
  choice, WebGL2 floor), AD-11 at 176 (`public/assets/` is where the glb lives), AD-10 at 168
  (right-handed scene, metres in glb), AD-1 at 69, AD-16 at 204. Stack table at 269
  (`@babylonjs/core` and `@babylonjs/loaders` pinned at `9.22.2`), Structural Seed at 291.
- `_bmad-output/planning-artifacts/epics.md` - Story 1.2 ACs at lines 361-392; NFR-4 at 122,
  NFR-6 at 126, NFR-7 at 124; AR-33 and AR-34 in "Host, persistence, boot and CI".
- `_bmad-output/implementation-artifacts/spec-1-1-...-six-bodies.md` - the measurement
  conventions to reuse, at `## Design Notes` ("p95 method", "Browser measurement must not be
  throttled") and `## Verification`.
- `docs/spikes/spike-1.md` - lines 617-778 are the variance investigation and the standing
  recommendation this story's protocol implements; lines 175-216 are the p95 and
  throttle-guard method to mirror.

**Existing code this story extends (all verified present at `4034d46`):**
- `package.json` - scripts are `dev`/`typecheck`/`test`; devDependencies pin
  `typescript@7.0.2`, `vite@8.2.2`, `vitest@4.1.11`, `@types/node@24.13.3`;
  `packageManager: "pnpm@11.24.0"` self-provisions (confirmed working in Story 1.1). Needs
  `build`, `preview` and the two Babylon runtime dependencies. There is no
  `dependencies` block yet - Babylon is the first.
- `tsconfig.json` - `strict`, `module: esnext`, `moduleResolution: bundler`,
  `types: ["node"]`, no `baseUrl`, `lib` already includes `DOM`, `include: [src, test, tools]`.
  Ledger `DW-15` (owned by Story 1.3) notes the `DOM` lib is granted to `src/sim/**` too;
  do not fix that here.
- `vitest.config.ts` - `environment: 'node'`, `include: ['test/**/*.test.ts']`,
  `reporters: ['verbose']`, `testTimeout: 60_000`. A `NullEngine` smoke runs fine under the
  Node environment.
- `.gitignore` - has `node_modules/`, `dist/`, `.vite/`. A second build output directory, if
  one is introduced, needs a line here.
- `tools/spike-1/measure.mjs` (408 lines) - **the runner to model the new one on and the file
  ledger `DW-11` names.** `DEFAULT_URL` at line 34 still points at the dev server
  (`http://localhost:5173/tools/spike-1/index.html`) with a comment saying Story 1.2 owns
  `vite build`; `looksLikeDevServer()` at 52 warns on the 5173-5183 band; `killTree()`,
  `waitForCdpReady()`, `findPageTarget()` (matches the substring `/tools/spike-1/`),
  `connectCdp()` and `sweepStaleProfileDirs()` are all directly reusable. Launch flags at
  line 303 are the anti-throttling set. A fresh `--user-data-dir` per invocation means one
  invocation is already one cold profile.
- `tools/spike-1/browser.ts` (151 lines) - `MAX_FRAME_DELTA_MS = 100` at line 21 is the
  guard ledger `DW-16` indicts; `runFrames()` at 47 is where the median-cadence check goes;
  `Spike1Result` at 24 gains the observed-cadence field; `nearestRankP95()` at 34 is
  exported for test.
- `tools/spike-1/index.html` - the harness entry that becomes a second Vite build input.
- `test/sim-boundary.test.ts` - already asserts no `@babylonjs/*` import under `src/sim/`;
  becomes load-bearing now.
- `test/attributions.test.ts` - pins the `vpdb/vpx-js` provenance record; extend it with the
  Babylon rows in the same shape.
- `test/spike-1-docs.test.ts` - the pattern for pinning a spike results document's structure;
  `test/spike-3-docs.test.ts` mirrors it.
- `test/measure-cli.test.ts` - spawns `measure.mjs` for argument validation; check it still
  passes after `DEFAULT_URL` changes.

**Verified environment facts (checked 2026-08-27; cite rather than re-derive):**
- `@babylonjs/core@9.22.2` and `@babylonjs/loaders@9.22.2` both exist on the registry and
  declare `license: Apache-2.0`; the source repository is
  `git+https://github.com/BabylonJS/Babylon.js.git`. Metadata is NOT the verification -
  read `license.md` at the repository root (confirmed present, first line
  "# Apache License 2.0 (Apache)"), and `NOTICE.md` (confirmed present, 46 bytes).
- `git remote origin` is `https://github.com/jbrandtmse/dragonwar.git`; `main`,
  `feature/DW-1_dragonwar-v1` and `DW-1-epic1` all exist on the remote; the default branch
  is `main`. The repository is **private** and has **no Pages site configured**.
- `gh` 2.86.0 is authenticated as `jbrandtmse` with `repo` and `workflow` scopes.
- Node 24.16.0, pnpm 11.24.0 on this host.

**Files this story creates:**
- `index.html` (root), `vite.config.ts`, `public/styles.css`,
  `public/THIRD-PARTY-NOTICES.txt`, `public/assets/dragonwar.glb`.
- `src/host/boot.ts`, `src/presentation/scene/create-engine.ts` (names indicative).
- `tools/make-placeholder-glb.mjs`, `tools/check-dist.mjs`, `tools/size-budget.mjs`,
  `tools/spike-3/measure-load.mjs`.
- `.github/workflows/ci.yml`.
- `docs/spikes/spike-3.md`.
- `test/attributions.test.ts` (edit), `test/check-dist.test.ts`,
  `test/size-budget.test.ts`, `test/scene-smoke.test.ts`, `test/spike-3-docs.test.ts`,
  `test/spike-1-browser-guard.test.ts` (edit).
- `ATTRIBUTIONS.md` (edit), `NOTICE` (edit), `package.json` (edit), `pnpm-lock.yaml`,
  `tools/spike-1/browser.ts` (edit), `tools/spike-1/measure.mjs` (edit).

## Tasks & Acceptance

**Execution:** (in dependency order; task 1 is a hard gate on everything after it)

- `ATTRIBUTIONS.md` + `NOTICE` -- BEFORE `pnpm add` runs: fetch and read
  `license.md` and `NOTICE.md` at the root of `https://github.com/BabylonJS/Babylon.js`,
  then add one **Code** table row each for `@babylonjs/core` and `@babylonjs/loaders` at
  `9.22.2` recording the source URL, "The Babylon.js team", `Apache-2.0` **as read in
  `license.md` at source, not from `package.json` or npm metadata**, and the verification
  date; move Babylon out of the "Planned dependencies" table into the Code table; update
  `NOTICE`'s Babylon paragraph from "not yet present" to present, naming where the licence
  text ships -- rationale: CLAUDE.md's hard gate, NFR-9, AD-16; the entry precedes the file.
- `package.json` + `pnpm-lock.yaml` -- add `dependencies` `@babylonjs/core@9.22.2` and
  `@babylonjs/loaders@9.22.2` (exact pins, no range, matching the spine's Stack table), and
  scripts `build` (`vite build`), `preview` (`vite preview`), `check:dist`
  (`node tools/check-dist.mjs`), `check:size` (`node tools/size-budget.mjs`) -- rationale:
  AR-1's pinned stack; ledger `DW-11` asks for a scripted production build and preview.
- `public/THIRD-PARTY-NOTICES.txt` -- the full Apache-2.0 licence text plus Babylon's
  `NOTICE.md` content, copied verbatim from source -- rationale: Apache-2.0 4(a) and 4(d)
  attach at first distribution, which is this story's Pages deploy.
- `tools/make-placeholder-glb.mjs` -- a Node-built-ins-only generator writing a valid glTF 2.0
  binary to `public/assets/dragonwar.glb`: one top-level node `playfield_root` containing one
  box mesh `vis_placeholder_box` sized 0.5144 x 1.0668 m in the playfield plane with a small
  thickness, authored unpitched, glTF Y-up per AD-10, node names matching
  `^[a-z][a-z0-9_]*$`; committed output plus the generator so it is reproducible -- rationale:
  the AC's playfield-sized box, with no dependency on Blender or on Story 1.4's `export.py`,
  and no third-party asset to source.
- `index.html` + `public/styles.css` -- the root entry: the CSP meta tag exactly as the
  planning artifacts pin it, a press-to-begin panel and a hidden error panel that are
  interactive from first paint, a render canvas, a link to `THIRD-PARTY-NOTICES.txt`, and a
  module script tag; **all styling in the external stylesheet** and no inline `<style>`,
  `style=` attribute or inline `<script>` anywhere -- rationale: AD-17; `default-src 'self'`
  blocks inline styles and scripts, so an inline gate panel would be invisible.
- `vite.config.ts` -- `base: './'` (relative paths), `build.modulePreload: { polyfill: false }`
  (the polyfill is injected as an inline script that `default-src 'self'` blocks),
  `build.assetsInlineLimit: 0` (a `data:` URI asset defeats the payload measurement),
  `build.rollupOptions.input` naming both `index.html` and `tools/spike-1/index.html`, and a
  fixed, `strictPort` preview port so the measurement URL is deterministic -- rationale:
  AD-17's static bundle; ledger `DW-11` wants the Spike 1 harness permanently buildable from
  the repository's own scripts.
- `src/presentation/scene/create-engine.ts` -- create the engine exactly once via
  `EngineFactory.CreateAsync` with `useRightHandedSystem = true`, honouring `?renderer=webgl2`
  as a forced WebGL2 path, and load the placeholder glb through `@babylonjs/loaders`;
  render one frame and report which engine was chosen -- rationale: AD-12, AD-10; Babylon
  lives in presentation, never in `sim/` (AD-1).
- `src/host/boot.ts` -- wire the gate: nothing loads until the gesture; on the gesture create
  the engine, load the glb, render, and record the first-rendered-frame timestamp on `window`
  for the runner to read; on any boot-stage failure render the error panel with the failure
  named. Comment that Story 6.1 owns the full platform gate and error panel -- rationale:
  AD-17; the gate is what the load measurement clicks.
- `tools/check-dist.mjs` -- one script asserting, over the built `dist/`: the CSP meta tag and
  its directives are present in `dist/index.html`; every asset reference is relative and no
  external origin appears; there is no inline `<script>`, `<style>` or `style=`; there is no
  service worker file and no `serviceWorker.register` in any chunk; the third-party notice
  file is present and linked. Exits non-zero naming the first violation -- rationale: the AC's
  "a CI step greps the CSP tag and fails if it is absent", widened to the sibling invariants
  in the same AC.
- `tools/size-budget.mjs` -- walk `dist/` recursively, gzip each file at level 9 in memory,
  sum, compare against a single `BUDGET_BYTES` constant, print measured and budgeted bytes
  (and the largest contributors on failure), exit non-zero when over. The constant carries a
  comment recording the measured baseline, the date, the headroom arithmetic and who re-sets
  it -- rationale: the AC's CI budget and its failure message.
- `tools/spike-1/browser.ts` + `tools/spike-1/measure.mjs` -- close ledger `DW-16`: add a
  median-rAF-delta check (reject above 20 ms) alongside the existing 100 ms per-frame guard,
  surface the observed median cadence in the result object and in the runner's JSON output;
  re-point `measure.mjs`'s `DEFAULT_URL` at the preview URL and update its header comment to
  the now-scripted build/preview commands -- rationale: `DW-16` and `DW-11` are this story's
  to close; a number taken through any channel must now carry its cadence.
- `tools/spike-3/measure-load.mjs` -- the load runner, modelled on `measure.mjs` and using
  only Node 24 built-ins over CDP: fresh temp profile per invocation (cold by construction),
  headed with the same anti-throttling flags, `Network.setCacheDisabled`,
  `Network.emulateNetworkConditions` at 50 Mbps expressed in bytes per second with a stated
  latency, accumulate `encodedDataLength` from `Network.loadingFinished` for the compressed
  transfer total, dispatch the press-to-begin gesture over `Input.dispatchMouseEvent` as soon
  as the panel is interactive, read the first-rendered-frame timestamp, sample the rAF cadence
  after it, apply the guard, and print one JSON result -- rationale: the AC's throttled cold
  load, taken through the only channel this project trusts (`DW-16`).
- `.github/workflows/ci.yml` -- on every push and pull request: install with pnpm, then
  `typecheck`, `test`, `build`, `check:dist`, `check:size`. A second job, gated on the default
  branch only, uploads `dist/` as a Pages artifact and deploys it, with `pages: write` and
  `id-token: write` permissions. Resolve each action's current major tag at implementation
  time (`gh api repos/<owner>/<repo>/releases/latest`) and pin it rather than floating
  -- rationale: AR-34's minimum CI for this story; Story 1.3 extends it with
  dependency-cruiser, the licence-header check and the SHA stamp.
- `test/**` -- unit-test every I/O Matrix row that does not need a browser: extend
  `test/attributions.test.ts` with the two Babylon rows; `test/check-dist.test.ts` and
  `test/size-budget.test.ts` invoke the real scripts as subprocesses against fixture
  directories and assert exit codes and message contents, including the deliberately-failing
  budget case; `test/scene-smoke.test.ts` is the `NullEngine` load smoke asserting the
  placeholder glb parses and `playfield_root` exists; `test/spike-1-browser-guard.test.ts`
  gains the median-cadence rejection case; `test/spike-3-docs.test.ts` pins the results
  document's required structure -- rationale: AD-15 allows exactly one presentation test (the
  `NullEngine` smoke); Rule 3 wants real invocations with exit-code assertions.
- `docs/spikes/spike-3.md` -- the results document; contents enumerated in the acceptance
  criteria below -- rationale: the AC's named output artefact.

**Acceptance Criteria:**

- Given `ATTRIBUTIONS.md` has no Babylon row in its Code table and `package.json` has no
  `@babylonjs/*` dependency, when the dependencies are added, then the two rows are written
  and committed to disk **before** `pnpm add` is invoked, each recording the source URL, the
  author, `Apache-2.0` as read in `license.md` in the Babylon.js repository (explicitly not
  from `package.json` or npm metadata) and the verification date -- and `pnpm test` asserts
  the rows' content so a later edit cannot silently trim them.
- Given the deployed build, when `THIRD-PARTY-NOTICES.txt` is opened from the link on the
  press-to-begin panel, then it shows the full Apache-2.0 licence text and Babylon's
  `NOTICE.md` content verbatim.
- Given `pnpm build` has run, when `node tools/check-dist.mjs` is invoked, then it exits 0
  having confirmed the CSP meta tag and its directives in `dist/index.html`, only relative
  asset references, no inline `<script>`/`<style>`/`style=`, no service worker, and the
  notice file present and linked; and when any one of those is removed from a fixture, it
  exits non-zero naming that violation.
- Given a WebGL2-capable browser and a fresh load of the built page, when the press-to-begin
  gesture fires, then `EngineFactory.CreateAsync` is called exactly once with
  `useRightHandedSystem = true`, the placeholder `dragonwar.glb` loads, and a frame renders --
  and with `?renderer=webgl2` appended, the WebGL2 engine is created even where WebGPU is
  available.
- Given the CI workflow, when a commit is pushed to this branch, then the checks job runs
  install, typecheck, test, build, the static-bundle check and the size budget, and passes;
  the run id and URL are recorded in `docs/spikes/spike-3.md`.
- Given the workflow on the default branch, when a commit lands there, then `dist/` is
  deployed to GitHub Pages and the Pages URL renders the placeholder in Chrome on Windows;
  the Safari/macOS confirmation is recorded as `PENDING - author's macOS leg` referencing
  ledger entry `DW-1`, with no new ledger entry filed.
- Given the Pages URL, when it is loaded cold at least 5 times through
  `tools/spike-3/measure-load.mjs` with the cache disabled and the connection throttled to
  50 Mbps, interleaved back-to-back with the same number of local `vite preview` control runs
  of the byte-identical `dist/`, then `docs/spikes/spike-3.md` records for each path: every
  raw sample, the median, the range, the run count, the observed median rAF cadence, the
  compressed transfer size, the request count, and the navigation-to-first-rendered-frame and
  gesture-to-first-rendered-frame times -- with the 10 s and 20 MB NFR-4 targets stated
  alongside and the median named as the figure of record (ledger `DW-13`).
- Given a run whose median rAF delta exceeds 20 ms, when the runner completes it, then the run
  is rejected with a non-zero exit naming the observed cadence, and no rejected run appears in
  the results document (ledger `DW-16`).
- Given the measured compressed baseline, when `BUDGET_BYTES` is set, then it equals the
  baseline rounded up to the next 0.25 MB plus 2.00 MB of authored headroom for the remainder
  of Epic 1, is below NFR-4's 20 MB product ceiling, and the arithmetic, the date and the
  stories that re-set it (1.4 when the real glb lands, and the Epic 5 art passes) are recorded
  both in the script's comment and in `docs/spikes/spike-3.md`.
- Given the size budget is set, when a build's gzipped `dist/` total exceeds it, then
  `node tools/size-budget.mjs` exits non-zero with both the measured and the budgeted numbers
  in the message -- demonstrated by a test that lowers the budget below the real measurement,
  not by inspection.
- Given the measured load profile, when `docs/spikes/spike-3.md` is written, then it records
  the one-glb-versus-split decision with the numbers that support it and the observable
  condition that would reopen it, closing the spine's "Asset split" deferral for now.
- Given the spike is complete, when `docs/spikes/spike-3.md` is read, then it also carries:
  the exact reproducible build, preview and measurement commands (superseding the ad-hoc
  invocation `docs/spikes/spike-1.md` records, which closes ledger `DW-11`); the machine,
  browser versions and date of every run; the throttling parameters including the stated
  latency; the cadence-guard threshold and its rationale; which engine was chosen and whether
  WebGPU initialised under the pinned CSP; and references by name to ledger entries `DW-1`,
  `DW-11`, `DW-13` and `DW-16` with no new entries filed for matters already adjudicated.

## Spec Change Log

## Review Triage Log

## Design Notes

### The CSP contradiction (the blocking condition)

**NFR-7 as worded cannot hold together with this story's own asset-loading AC, and the
conflict is structural rather than incidental.**

The pinned string is `default-src 'self'; connect-src 'none'`. It appears verbatim in three
places, all of which CI is required to grep for: `epics.md:124` (NFR-7), `epics.md:373`
(this story's own second AC), and `ARCHITECTURE-SPINE.md:214` (AD-17).

`connect-src` governs `fetch()`, `XMLHttpRequest`, `WebSocket`, `EventSource` and
`sendBeacon`. Unlike most directives it does **not** fall back to `default-src` when set, and
`'none'` admits no URL at all - **including same-origin URLs**. `<meta http-equiv>` enforces
`connect-src` (only `frame-ancestors`, `report-uri` and `sandbox` are ignored in meta form).
Babylon's glTF loader fetches the `.glb` over exactly that interface. So under the pinned
string, `dragonwar.glb` cannot load, and this story's third AC ("when a placeholder
`dragonwar.glb` ... loads, then a frame renders on WebGL2") cannot be satisfied.

This is not a one-story inconvenience. AD-11 has the runtime fetching **two** files at load
time (`public/assets/dragonwar.glb` for presentation and `public/assets/dragonwar.collision.json`
for physics) and requires both loaders to "fail fast at load time on a missing node". AD-17's
own text corroborates that assets are fetched: it lists "asset 404" as a boot-stage failure
the error panel must render - a 404 is only reachable if a request was made. The architecture
therefore both requires runtime asset fetches and forbids them.

The workarounds are all worse than the amendment and are barred by Rule 5:

- **Inline the glb as a `data:` URL or as base64 inside the JS bundle.** Technically works
  (Babylon decodes `data:` URLs without a request) but inflates the payload about 33 %, makes
  the measured transfer size and first-frame time unrepresentative of the shipping load path,
  and so destroys the one thing this spike exists to establish. It also does not survive
  Story 1.4's collision JSON or Epic 5's textures.
- **Silently write `connect-src 'self'` into `index.html`.** That is amending a planning
  artifact from inside a story, and CI greps for the pinned string, so it would fail its own
  check.

**Recommended amendment (one edit, two parts, to be made by the lead in `epics.md` NFR-7,
`epics.md` Story 1.2's second AC and `ARCHITECTURE-SPINE.md` AD-17 together):**

1. `connect-src 'none'` -> `connect-src 'self'`. This preserves everything NFR-7 is actually
   protecting - no telemetry, no third-party calls, no API or analytics origin, nothing off
   the static origin - while permitting the same-origin asset loads the architecture already
   mandates. NFR-7's prose ("Local browser storage only; no network calls after load") is
   unchanged in meaning: there is still no server and nothing to call.
2. Decide at the same time whether `script-src 'self' 'wasm-unsafe-eval'` is added. Babylon's
   WebGPU engine path may need to instantiate WebAssembly (the WGSL/GLSL transpiler), and
   Chrome blocks `WebAssembly.instantiate` under a `script-src` that grants neither
   `'wasm-unsafe-eval'` nor `'unsafe-eval'`. Whether 9.22.2's WebGPU path actually needs it is
   an empirical question the implement stage answers in one run - but deciding it in the same
   amendment avoids a second HALT, because this story's fourth AC names the WebGPU engine
   while AD-12 makes WebGL2 the floor and forbids any feature *requiring* WebGPU. If the
   author prefers not to grant `'wasm-unsafe-eval'`, the matching amendment is to reword the
   engine-selection AC to "WebGPU is chosen where it can initialise under the pinned CSP;
   WebGL2 is the floor" and record the outcome in `docs/spikes/spike-3.md`.

Everything else in this spec is unaffected by the amendment and is ready to execute the
moment it lands. Rule 5's path applies: amend in place, record original-versus-amended wording
here in `## Spec Change Log`, re-run the epic-context pre-warm (the amendment makes the
planning artifacts newer than `epic-1-context.md`), reset this spec's `status` to `draft`, and
re-dispatch on the spec path.

### Deployment prerequisites the lead owns (verified 2026-08-27)

Independent of the CSP question, three things must be true before the implement stage can
satisfy the Pages ACs. None is an agent's decision.

1. **The repository is private and has no Pages site** (`gh api repos/jbrandtmse/dragonwar/pages`
   -> 404; `visibility: PRIVATE`). Pages on a private repository requires a paid plan and
   serves an access-controlled site, which a cold anonymous load cannot measure. The project
   is GPL-3.0 and described as open source, so **making the repository public** is the
   expected resolution - but publishing is the author's call.
2. **Pages must be enabled with source = GitHub Actions**, so `actions/deploy-pages` has a
   target.
3. **The first deployment has to reach the default branch.** The deploy job is authored to run
   on `main` only (AR-34, AD-17), and this story's work sits on `DW-1-epic1`. Either the lead
   brings this story's merge gate forward so the commit reaches `main`, or the lead authorises
   a one-off deployment from the epic branch. Relaxing the job's branch condition to make the
   epic branch self-deploy is not an option the implementer may take.

### Governing ADs (Rule 6)

The registry for this project is the architecture spine's numbered invariants at
`_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md`,
not a `docs/adr/` directory. Governing this story:

- **AD-17** (static bundle, relative paths, gate and error panel before assets, no-network
  enforced, size budget and release identity in CI) - the primary invariant, and the one whose
  CSP clause this story cannot satisfy as written.
- **AD-12** (four lighting channels; clustered forward is the WebGL2 floor) - the engine is
  chosen once at boot via `EngineFactory.CreateAsync`, `?renderer=webgl2` forces the floor,
  and no feature may *require* WebGPU.
- **AD-1** (ports-and-adapters, fixed dependency direction) - `@babylonjs/*` enters
  `presentation/` and `host/` only; `src/sim/**` stays DOM-free and engine-free, which
  `test/sim-boundary.test.ts` now actually tests against a real Babylon install.
- **AD-10** (canonical frame, right-handed, reference dimensions) - the scene is created with
  `useRightHandedSystem = true`; the placeholder glb is metres, Y-up, unpitched, at the
  514.4 x 1066.8 mm reference footprint.
- **AD-11** (Blender owns placement; `public/assets/` holds the exported glb) - the
  placeholder is a **deviation recorded on purpose**: it is generated by a script, not by
  `tools/export.py`, because the export pipeline is Story 1.4's. It borrows only the node-name
  grammar so Story 1.4 replaces it behind the same contract.
- **AD-16** (boundaries linted in CI; ported and borrowed files keep their notices) - the
  Apache-2.0 obligations and the GPL-3.0 headers on new files. dependency-cruiser itself is
  Story 1.3's.
- **AD-15** (replays and headless tests are first-class) - "no automated presentation tests in
  v1 beyond a `NullEngine` load smoke" is why `test/scene-smoke.test.ts` is the only
  presentation test this story adds.

### Integration ACs, Consumed-by and Consumes (Rules 1 and 2)

This story introduces shared surfaces (`src/host/boot.ts`, `src/presentation/scene/**`, the
build config, three `tools/` scripts and the CI workflow). It has real in-story consumers,
none mocked - the last row of the I/O Matrix is their Integration AC: the CI workflow consumes
the build scripts and the checks on a real push, and the deployed Pages URL consumes `dist/`
and renders the placeholder. The size-budget failure path is exercised by a consumer-tier test
that runs the real script with a lowered budget and asserts the exit code and both numbers in
the message.

- `Consumes:`
  - Story 1.1 - `package.json`, `tsconfig.json`, `vitest.config.ts` (the scaffold);
    `src/sim/contracts/time.ts` and `src/sim/physics/**` indirectly, through the Spike 1
    harness page that becomes a second build input; `tools/spike-1/measure.mjs` and
    `tools/spike-1/browser.ts` as the model and the edit target for the new runner;
    `test/attributions.test.ts` and `test/spike-1-docs.test.ts` as the test patterns.
- `Consumed-by:`
  - Story 1.3 - extends `.github/workflows/ci.yml` with dependency-cruiser, the per-file
    licence-header check and the SHA stamp, and consumes `vite.config.ts` and the build
    scripts.
  - Story 1.4 - replaces `public/assets/dragonwar.glb` with the `tools/export.py` output
    behind the same path and node-name contract, and re-sets `BUDGET_BYTES`.
  - Stories 1.5-1.7 - render through the scene this story boots.
  - Story 1.8 - adds the replay-goldens and browser-parity jobs to this workflow.
  - Story 4.7 (Spike 2) and Story 6.6 - reuse this story's measurement protocol and the
    cadence guard; `docs/spikes/spike-1.md` line 714 names both explicitly.
  - Story 6.1 - replaces the minimal press-to-begin gate and error panel with the full
    platform gate; Story 6.3 replaces `?renderer=webgl2` with the Settings toggle.

### Ledger entries this story owns

- **`DW-11`** (routed, owner = this story) - closed by the `build`/`preview` scripts, the
  two-entry `vite.config.ts`, `measure.mjs`'s re-pointed `DEFAULT_URL`, and the reproducible
  commands recorded in `docs/spikes/spike-3.md`. `docs/spikes/spike-1.md` is Story 1.1's dated
  record and is deliberately left unedited; the new document states that it supersedes the
  ad-hoc invocation recorded there.
- **`DW-16`** (open, owner = this story) - closed by the median-cadence guard in
  `tools/spike-1/browser.ts` and in the new load runner, by reporting observed cadence beside
  every number, and by the new rejection test. The 20 ms threshold is authored: 60 fps is a
  16.67 ms delta, 20 ms leaves about 20 % slack, and the observed defect (28.9 fps, 34.6 ms)
  is rejected comfortably. Story 1.1's recorded runs all ran at 60 fps, so the tighter guard
  does not retroactively invalidate them.
- **`DW-13`** (escalated, owner = `burndown`) - **not closed here.** Its standing rule is
  obeyed: medians over at least 5 runs, all raw samples published, and any comparison measured
  as an interleaved A/B adjacent in time. The local-preview control runs exist for exactly
  that reason, not as a substitute for the Pages figure.

### Decisions this spec makes that the planning artifacts leave open

- **"Compressed `dist/`" means** the sum of every file under `dist/` gzipped at level 9. This
  build has no lazy-loaded route, so everything emitted is initial payload; gzip is also what
  a static host negotiates, which keeps the CI number comparable to the transfer size the
  runner measures. A later story that introduces lazy loading must refine the definition.
- **The Spike 1 harness page is built into `dist/` and therefore deployed and counted.** It is
  a few tens of KB against a Babylon baseline in the megabytes, the budget carries authored
  headroom anyway, and publishing it is what makes the production measurement surface
  permanent (`DW-11`). Record its share of the total in the results document.
- **50 Mbps is expressed to CDP as 6,250,000 bytes per second**, with the latency the runner
  applies stated explicitly in the results document so a re-run is comparable. The AC names a
  throughput and no latency; whichever value is used, it is recorded rather than left implicit.
- **The figure of record is the median**, not the mean and not a single run (`DW-13`).
- **Headroom arithmetic:** baseline rounded up to the next 0.25 MB, plus 2.00 MB. Stated as
  authored, not derived, so it is cheap for the author to overrule - and it must stay below
  NFR-4's 20 MB ceiling, which no later re-set may exceed.
- **Reopen condition for the one-glb decision:** authored thresholds, stated as such - reopen
  the split if the glb alone exceeds 40 % of compressed transfer or 30 % of
  navigation-to-first-frame. The spine's "Asset split" deferral asks for a load-profiling
  call, and a bare decision with no reopen condition would not survive Epic 5's art passes.

### Footprint note

Epic 1's declared footprint is `src/**`, `test/**`, `tools/**`, `assets/src/**`,
`.github/workflows/**`, `package.json`, plus `docs/spikes/**`, `ATTRIBUTIONS.md`,
`index.html` and the build config this story's ACs name. Three additions fall outside it and
are flagged rather than taken silently:

- **`public/`** - `styles.css`, `THIRD-PARTY-NOTICES.txt` and `assets/dragonwar.glb`.
  AR-26 and AD-11 name `public/assets/` as the architecture's own location for the exported
  glb, and Vite's `publicDir` is where a static bundle's unbundled files must live. There is
  no in-footprint alternative that does not fight AR-26.
- **`NOTICE`** - its Babylon paragraph says "None of the following is yet present in this
  repository", which stops being true the moment `pnpm add` runs.
- **`.gitignore`** - only if a second build output directory is introduced.

Epic 1 runs alone in wave 1 and no other epic claims these paths, but the expansion is the
lead's to confirm at the validation gate.

## Verification

**Commands:** (run from `C:/git/dragonwar/.worktrees/epic-1`)

- `pnpm install` -- expected: exits 0; `pnpm-lock.yaml` updated with both Babylon packages
  pinned at `9.22.2`.
- `pnpm typecheck` -- expected: `tsc --noEmit` exits 0 with no diagnostics.
- `pnpm test` -- expected: exits 0; Story 1.1's 187 existing tests still pass alongside the
  new ones; `test/sim-boundary.test.ts` still proves no `@babylonjs/*` import under
  `src/sim/`.
- `pnpm build` -- expected: exits 0; `dist/index.html` and `dist/tools/spike-1/index.html`
  both emitted; no inline script or style in either.
- `node tools/check-dist.mjs` -- expected: exits 0 reporting each invariant it checked.
- `node tools/size-budget.mjs` -- expected: exits 0 printing measured and budgeted bytes.
- `pnpm preview` (background) then
  `node tools/spike-3/measure-load.mjs --url <preview URL>` -- expected: exits 0 printing JSON
  with a compressed transfer total, a request count, a first-frame time and an observed median
  rAF delta at or under 20 ms.
- `node tools/spike-3/measure-load.mjs --url <Pages URL>` at least 5 times, interleaved with
  the control -- expected: each exits 0; every sample recorded.
- `node tools/spike-1/measure.mjs --browser chrome --url <preview URL>` -- expected: exits 0,
  still prints `samples: 600` and a p95, now with the observed cadence beside it.
- `git status --porcelain` -- expected: clean apart from this story's intended files; no
  `node_modules/`, `dist/` or stray build output tracked.

**Manual checks:**
- The `ATTRIBUTIONS.md` Babylon rows exist and are complete **before** any `@babylonjs`
  dependency appears in `package.json` - confirm by the commit/edit order, not just the end
  state.
- The deployed Pages URL renders the placeholder box in Chrome on Windows; the Safari/macOS
  row in `docs/spikes/spike-3.md` reads `PENDING - author's macOS leg` and references `DW-1`.
- `docs/spikes/spike-3.md` carries every element the acceptance criteria enumerate, including
  all raw samples, and files no new ledger entry for `DW-1`, `DW-13` or any other
  already-adjudicated matter.
- `_bmad-output/implementation-artifacts/deferred-work.md` is unchanged by this story;
  deferred findings go in this spec's frontmatter `deferred:` list for the lead to harvest.

## Auto Run Result

Status: blocked
Blocking condition: intent gap

### Plan stage (2026-08-27)

Planning completed and the spec is fully drafted, but it cannot be marked ready for
development: **NFR-7 is internally contradictory as worded, and this story is the first one
that has to satisfy both halves of it at once.**

**The NFR:** NFR-7 (`epics.md:124`), mirrored verbatim in AD-17
(`ARCHITECTURE-SPINE.md:214`) and again in this story's own second acceptance criterion
(`epics.md:373`): `<meta http-equiv="Content-Security-Policy" content="default-src 'self';
connect-src 'none'">`, grepped in CI.

**Why it is un-implementable as worded:** `connect-src` governs `fetch`, `XMLHttpRequest`,
`WebSocket`, `EventSource` and `sendBeacon`; it does not fall back to `default-src` when set,
and `'none'` admits no URL at all, same-origin included. It is enforced from a `<meta>` tag.
Babylon's glTF loader fetches the `.glb` over exactly that interface. So this story's third
acceptance criterion - "when a placeholder `dragonwar.glb` (a playfield-sized box) loads, then
a frame renders on WebGL2" - cannot be satisfied while the pinned CSP holds. The conflict is
structural, not incidental to this story: AD-11 requires the runtime to fetch both
`public/assets/dragonwar.glb` and `public/assets/dragonwar.collision.json` at load time, and
AD-17's own text lists "asset 404" as a boot-stage failure the error panel must render, which
is only reachable if a request was made. The available workarounds (inlining the glb as a
`data:` URL or as base64 in the JS bundle) would make the payload and first-frame numbers
unrepresentative of the shipping load path, which is the only thing this spike exists to
measure - planning around the NFR rather than resolving it, which Rule 5 forbids.

**Recommended amendment** (one edit spanning `epics.md` NFR-7, `epics.md` Story 1.2's second
AC, and `ARCHITECTURE-SPINE.md` AD-17):

1. Change `connect-src 'none'` to `connect-src 'self'`. Everything NFR-7 protects survives -
   no telemetry, no third-party origin, no API call, nothing off the static origin - while the
   same-origin asset loads the architecture already mandates become possible. NFR-7's prose is
   unchanged in meaning: there is no server and nothing to call.
2. Decide in the same amendment whether `script-src 'self' 'wasm-unsafe-eval'` is granted.
   Babylon's WebGPU path may need to instantiate WebAssembly, which Chrome blocks under a
   `script-src` granting neither `'wasm-unsafe-eval'` nor `'unsafe-eval'`. Whether 9.22.2
   needs it is empirical and the implement stage settles it in one run, but deciding now
   avoids a second HALT, because this story's fourth AC names the WebGPU engine while AD-12
   makes WebGL2 the floor. If the author prefers not to grant it, the matching amendment is to
   reword that AC to "WebGPU is chosen where it can initialise under the pinned CSP; WebGL2 is
   the floor", with the outcome recorded in `docs/spikes/spike-3.md`.

**Also blocking, and the lead's to clear before re-dispatch** (not an intent gap - environment
prerequisites, detailed under `## Design Notes` -> "Deployment prerequisites the lead owns"):
`jbrandtmse/dragonwar` is private with no Pages site configured, and the deploy job runs from
the default branch only while this story's work sits on `DW-1-epic1`. The Pages ACs cannot be
satisfied until the repository is publishable (or Pages is otherwise enabled) and a route to a
live deployment is authorised.

Everything else in this spec is complete and executable the moment the amendment lands: the
Code Map, the task order, the acceptance criteria, the measurement protocol implementing
`DW-13`, and the `DW-11` and `DW-16` closures. Per Rule 5, the lead amends the planning
artifacts in place, records original-versus-amended wording with rationale in this spec's
`## Spec Change Log`, re-runs the epic-context pre-warm (the amendment makes the planning
artifacts newer than `epic-1-context.md`), resets this spec's `status` to `draft`, commits, and
re-dispatches on the spec path. The `<intent-contract>` block above is preserved verbatim on
re-plan.
