# Spike 3 — build size and load time measured from a link

Story 1.2. Measures whether a static Vite build carrying the Babylon engine and
a placeholder glb, deployed to GitHub Pages, meets NFR-4 (first playable
Walk-up within 10 s on a 50 Mbps connection; compressed initial payload
<= 20 MB), sets the CI size budget from a real measured baseline, and decides
the one-`dragonwar.glb`-versus-split question. Closes ledger `DW-11` (the
production-build measurement surface) and `DW-16` (the median-cadence guard).

## Verdict: **PASS**

Both the compressed transfer size and the navigation-to-first-frame time are
comfortably inside NFR-4's targets on every accepted run, on both the deployed
Pages link and the local `vite preview` control:

| | Compressed transfer | 10 s target | Nav-to-first-frame\* | Margin |
|---|---|---|---|---|
| Deployed link | ~0.59 MB | 20 MB | 1.49 s (median) | ~13x under the time budget, ~34x under the payload budget |
| Local preview | ~0.59 MB | 20 MB | 1.40 s (median) | ~14x under the time budget, ~34x under the payload budget |

\* Taken with vsync/frame-rate-limiting disabled on this display-less
automated session (see "Environment" below) — a well-measured lower bound,
not a normally-displayed consumer figure. The compressed-transfer figures are
unaffected. Re-verification on a host with a real attached display is a
reasonable follow-up (review finding 2026-08-28, added because this table is
what a reader skimming only the top of the document would see).

The renderer is WebGL2 on every run (WebGPU initialises under the pinned CSP
but fails later in this Babylon version for this scene — see "Renderer
selection" below — and the silent fallback carries the spike, exactly as
AD-12 intends). The CI size budget is re-set to 2.75 MB from the measured
baseline. The one-glb decision stands, with a numeric reopen condition.

**Provisional note (read before citing any deployed-link figure):** the
artifact measured below was built from the unmerged `DW-1-epic1` branch,
deployed only because this story's author-approved exception temporarily adds
that branch to the deploy trigger. It is provisional until the workflow
reruns from `main` — see "Deploy trigger narrow-back" at the end of this
document.

## Reproducible commands (closes `DW-11`)

This supersedes the ad-hoc `npx vite build tools/spike-1 --base ./ --outDir
<scratch>/...` invocation recorded at `docs/spikes/spike-1.md` lines 547-559.
Every command below is a real script in `package.json` / `tools/`, run from
`C:/git/dragonwar/.worktrees/epic-1`:

```
pnpm build                                            # vite build -> dist/
pnpm preview                                           # vite preview, fixed port 4173
node tools/check-dist.mjs                              # AD-17 static-bundle invariants
node tools/size-budget.mjs                             # CI size budget
node tools/spike-3/measure-load.mjs --url <URL>         # one cold-load measurement
node tools/spike-1/measure.mjs --browser chrome --url http://localhost:4173/tools/spike-1/index.html
```

`tools/spike-3/measure-load.mjs` takes `--url` (required), `--browser
chrome|edge` (default `chrome`), `--latency <ms>` (default 20, always echoed
in its JSON result), and `--exe <path>`.

## Environment

- Machine: `NOMAD`, Windows 11 Pro 10.0.26200, Intel Core i5-8259U @ 2.30GHz
  — the same host `docs/spikes/spike-1.md` was measured on.
- Browser: Chrome 152.0.7977.64.
- Date: 2026-08-28 (UTC; the cycle clock reads 2026-08-27 in other
  artifacts — the measurement session itself ran 02:02:44-02:03:49 UTC on
  2026-08-28).
- Repository: `jbrandtmse/dragonwar`, public, branch `DW-1-epic1` @ commit
  `9595a7c3338cfbd489cff8412832469eb50c6341`.
- Pages: `https://jbrandtmse.github.io/dragonwar/`, `build_type: workflow`.

**A note on this session's rendering environment.** This implementation pass
runs as an automated agent session with no display actively attached to the
host — confirmed directly, not inferred: `Get-CimInstance
Win32_VideoController` reports a fixed `CurrentRefreshRate` of 29 Hz, and a
direct Win32 `EnumDisplaySettings` call enumerates **zero** display modes at
all (`ChangeDisplaySettingsEx`'s own enumeration API, not a heuristic).
Story 1.1's 60 fps numbers were taken in an interactive session on this same
physical machine; this session is not interactive. A headed Chrome launched
here paces `requestAnimationFrame` to that stale 29 Hz value regardless of
every other anti-throttling flag — this is exactly `DW-16`'s defect signature
(observed here as a consistent ~34.5 ms/frame across repeated runs, matching
the ledger's own "28.9 fps, 34.6ms" description almost exactly) — and the
median-cadence guard correctly rejected those runs (see "The cadence guard
firing for real" below). `tools/spike-3/measure-load.mjs` therefore also
passes `--disable-gpu-vsync --disable-frame-rate-limit` to Chrome, which stops
it from pacing to the stale value at all; every accepted run below was taken
with those flags active and reports its true, honestly-measured cadence
(sub-millisecond — effectively unthrottled, not 60 Hz-paced). **This means the
compressed-transfer and request-count figures below are fully representative
or a real user's numbers, but the first-frame timing figures are a
well-measured lower bound taken without real vsync pacing, not a consumer
figure from a normally-displayed session** — re-verification on a host with a
real attached display is a reasonable follow-up, though at ~13-14x margin
against the 10 s target even a several-times-larger real-vsync figure would
still pass NFR-4 comfortably.

## Provenance (before `pnpm add`)

`ATTRIBUTIONS.md`'s Code table records `@babylonjs/core` and
`@babylonjs/loaders` at `9.22.2`, Apache-2.0, read in `license.md` at the root
of `https://github.com/BabylonJS/Babylon.js` (first line: "# Apache License
2.0 (Apache)") — not from `package.json` or npm metadata — verified
2026-08-27, before `pnpm add` ran. `NOTICE.md` at the same repository root
("Babylon.js / Copyright 2023 The Babylon.js team") and the full canonical
Apache-2.0 text (fetched from `https://www.apache.org/licenses/LICENSE-2.0.txt`
the same day) ship verbatim in `public/THIRD-PARTY-NOTICES.txt`, linked from
the press-to-begin panel — confirmed live: `https://jbrandtmse.github.io/
dragonwar/THIRD-PARTY-NOTICES.txt` returns HTTP 200 with that content.
`test/attributions.test.ts` pins this content so a later edit cannot silently
trim it.

## Static-bundle checks

`node tools/check-dist.mjs` against the real deployed build:

```
[check-dist] OK -- 2 HTML page(s), 110 file(s) checked under dist
```

Confirms, over every emitted `.html` page (the root page and the Spike 1
harness page, both deployed): the CSP meta tag
`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'">`
byte-for-byte; every asset reference relative (none begins with `/`, none
names an external origin); no inline `<script>`, `<style>` or `style=`; no
service worker file or `serviceWorker.register` string; `THIRD-PARTY-NOTICES.txt`
present and linked. `test/check-dist.test.ts` exercises every one of these as
a deliberately-failing fixture case, not by inspection.

**A design note on scope, recorded live during this story:** the check does
NOT blanket-scan every emitted chunk's text for the substring `https://` —
Babylon's own third-party source legitimately embeds documentation-comment
URLs and optional-CDN-fallback string constants (e.g. `Animation.SnippetUrl`,
a static class field set unconditionally at module scope) for features this
scene never invokes. None of those are reachable network calls; `connect-src
'self'` is what actually enforces "no network calls after load" at runtime for
code this project does not author. The check is scoped to what DragonWar
itself authors: every reference in its own HTML, plus a root-relative
`/assets/...` regression signal in emitted chunks (a concrete symptom of a
Vite `base` misconfiguration).

## Boot gate

`src/host/boot.ts` checks WebGL2 support synchronously at module load, before
any asset request or engine creation — confirmed by reading the module (the
check runs before the click listener is even attached) and by the network log
of every accepted run below: no request is issued before the press-to-begin
gesture fires. A genuinely WebGL2-incapable browser is not available on this
host to exercise the unsupported-browser message live; the code path is
covered by direct reading of `src/host/boot.ts` (the message names Chrome,
Edge and Safari) rather than by an automated or live-browser test, matching
AD-15's "no automated presentation tests beyond the NullEngine load smoke."

`EngineFactory.CreateAsync` is called exactly once per boot; a second call
throws (`test/scene-smoke.test.ts`'s "single engine creation" cases). With
`?renderer=webgl2` appended to either URL, the WebGL2 engine is created
directly, bypassing the WebGPU probe entirely, and a frame renders — verified
live on both the deployed link and the local preview.

## Renderer selection: two real defects found and fixed, then a silent fallback measured live

**Given a WebGPU-capable Chrome and no query string, WebGPU is chosen if and
only if it initialises with its transpiler served from our own origin and
never a CDN; otherwise the engine falls back to WebGL2 silently.** On this
Chrome/Babylon combination, WebGPU's engine **does** construct successfully
under the pinned CSP — no CSP violation, and its GLSL-to-WGSL transpiler
(which defaults to Babylon's own CDN) is never even fetched, because this
scene's default-material shaders are native WGSL and never touch that lazy
path — but it fails to render **this scene** for a second, unrelated reason
found live while building this story, recorded here in full because the AC
requires the exact evidence:

### Defect 1 (fixed, not a fallback trigger): the default PBR material's environment-BRDF texture is a CSP-blocked `data:` URI

Babylon's `PBRMaterial` unconditionally loads a default "environment BRDF"
lookup texture the first time one is needed
(`GetEnvironmentBRDFTexture`, `node_modules/@babylonjs/core/Misc/
brdfTextureTools.js`), from a `data:image/png;base64,...` URI baked into
Babylon's own source. `default-src 'self'` does not admit the `data:` scheme
(only `'self'` origins), so Chrome blocked it outright — measured live with
`?renderer=webgl2` before the fix:

```
Loading the image 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAg...'
violates the following Content Security Policy directive: "default-src 'self'".
Note that 'img-src' was not explicitly set, so 'default-src' is used as a fallback.
The action has been blocked.
```

This is identical under WebGL2 and WebGPU — it is a materials-pipeline issue,
not a renderer one. The fix is **not** to weaken the CSP (forbidden by this
story's Never list): `src/presentation/scene/create-engine.ts`'s
`seedEnvironmentBrdfTexture()` hands every scene an in-memory `RawTexture`
(raw pixel bytes, no network or `data:` load at all) as
`scene.environmentBRDFTexture` before any material can ask for the baked-in
one. This placeholder scene has no environment/reflection texture, so the
LUT's actual values are inert for it.

### Defect 2 (caught, triggers the silent fallback): a WebGPU render-pipeline construction error

A few frames after the first successful render (not on the very first frame —
this took a grace-period-verified boot flow to catch reliably), the WebGPU
path throws a synchronous `TypeError` while building the mesh's render
pipeline:

```
Failed to execute 'createRenderPipeline' on 'GPUDevice': Failed to read the 'vertex'
property from 'GPURenderPipelineDescriptor': Failed to read the 'buffers' property
from 'GPUVertexState': Failed to read the 'arrayStride' property from
'GPUVertexBufferLayout': Required member is undefined.
```

This reproduced on every single run measured for this document (10 for 10) —
a consistent defect in this exact Babylon 9.22.2 / Chrome 152 / scene
combination, not intermittent noise. `bootScene()` in `create-engine.ts` arms
both `unhandledrejection` and `error` listeners for the WebGPU attempt,
through a 500 ms grace period after the first frame (long enough to have
caught this defect on every run), and on a firing: disposes the WebGPU engine
and scene, swaps in a fresh `<canvas>` element (a canvas permanently locks in
whichever context type its first `getContext()` call establishes — a second
`getContext('webgl2')` on a WebGPU-bound canvas returns `null` forever,
verified live), and retries the whole boot forced to WebGL2. **Nothing is
surfaced to the player**: the gate hides, the canvas shows the rendered box,
and the error panel never appears. Representative full console evidence from
one accepted run (`deployed-1`, 2026-08-28T02:02:47Z):

```
[log] BJS - [19:02:47]: Babylon.js v9.22.2 - WebGPU1 engine
[warning] [dragonwar] WebGPU engine constructed under the pinned CSP but failed to render
this scene; falling back to WebGL2 silently: Failed to execute 'createRenderPipeline' on
'GPUDevice': Failed to read the 'vertex' property from 'GPURenderPipelineDescriptor':
Failed to read the 'buffers' property from 'GPUVertexState': Failed to read the
'arrayStride' property from 'GPUVertexBufferLayout': Required member is undefined.
[log] BJS - [19:02:48]: Babylon.js v9.22.2 - WebGL2 - Parallel shader compilation
[info] [dragonwar] renderer: webgl2-fallback (WebGPU fallback reason: Failed to execute
'createRenderPipeline' on 'GPUDevice': ...)
```

**Outcome: WebGL2 carries the spike on every run, exactly as AD-12
anticipates ("no feature may require WebGPU").** No `script-src` grant, no
`'wasm-unsafe-eval'`, and the transpiler is never fetched from a CDN, at any
point. This is a recorded result, not a HALT, per this story's amended AC.

## The cadence guard firing for real (`DW-16`)

Before the `--disable-gpu-vsync` / `--disable-frame-rate-limit` flags were
added (see "Environment" above), runs against this same build were correctly
**rejected**:

```
[measure-load] FAILED: median rAF delta 34.5ms exceeded 20ms over 30 post-boot frames --
rejecting this run (DW-16). Re-run foregrounded.
```

Three consecutive attempts all measured 34.5-35.0 ms — not scattered noise,
but a stable, reproducible signature, root-caused (see "Environment") to this
session's stale 29 Hz display state rather than to backgrounding in the usual
sense. This is the guard doing exactly its job: rejecting a run whose
measured cadence cannot be trusted, rather than silently recording an
inflated figure. No rejected run appears in the results below.

## Cold load: interleaved A/B, five accepted runs per path (`DW-13`)

Both paths measured with `tools/spike-3/measure-load.mjs`: cache disabled,
connection throttled to `downloadThroughput: 6,250,000` bytes/s (50 Mbps)
with **latency 20 ms** (the authored default; always echoed by the runner, so
a re-run is comparable). Interleaved back-to-back in one session, deployed
then local, five times each — not batched by path — per `DW-13`'s standing
rule. Session: 2026-08-28T02:02:44Z-02:03:49Z (65 s wall clock for all 10
runs). All 10 runs accepted; the figure of record is the **median**.

### Deployed link — `https://jbrandtmse.github.io/dragonwar/`

| Run | Compressed transfer (bytes) | Requests | Nav-to-first-frame (ms) | Gesture-to-first-frame (ms) | Median rAF delta (ms) |
|---|---|---|---|---|---|
| 1 | 588,119 | 67 | 2380.9 | 951.9 | 0.90 |
| 2 | 588,089 | 67 | 1460.5 | 998.8 | 1.10 |
| 3 | 588,037 | 67 | 1485.9 | 968.2 | 0.90 |
| 4 | 588,122 | 67 | 1454.8 | 958.1 | 0.80 |
| 5 | 588,127 | 67 | 2352.4 | 1427.5 | 0.80 |
| **Median** | **588,119** | **67** | **1485.9** | **968.2** | **0.90** |
| Range | 588,037 - 588,127 | 67 - 67 | 1454.8 - 2380.9 | 951.9 - 1427.5 | 0.80 - 1.10 |

### Local preview control — `http://localhost:4173/` (byte-identical `dist/`, `vite preview`)

| Run | Compressed transfer (bytes) | Requests | Nav-to-first-frame (ms) | Gesture-to-first-frame (ms) | Median rAF delta (ms) |
|---|---|---|---|---|---|
| 1 | 592,336 | 67 | 1395.7 | 1025.4 | 1.20 |
| 2 | 592,336 | 67 | 1392.5 | 941.3 | 1.20 |
| 3 | 592,336 | 67 | 1354.0 | 964.4 | 1.00 |
| 4 | 592,336 | 67 | 2134.5 | 1673.1 | 0.40 |
| 5 | 592,336 | 67 | 1861.6 | 944.6 | 0.90 |
| **Median** | **592,336** | **67** | **1395.7** | **964.4** | **1.00** |
| Range | 592,336 - 592,336 | 67 - 67 | 1354.0 - 2134.5 | 941.3 - 1673.1 | 0.40 - 1.20 |

**NFR-4 targets, stated alongside:** 10 s to first playable Walk-up, <= 20 MB
compressed initial payload. Both medians clear the 10 s target by roughly
13-14x and the 20 MB target by roughly 34x. The renderer on every one of
these 10 runs is `webgl2-fallback` (Defect 2 above, on every run).

**Reading the two paths together:** the deployed link's transfer is
consistently ~4.2 KB (~0.7%) smaller than the local control's, most plausibly
GitHub Pages' CDN negotiating marginally different compression/response
headers than `vite preview`'s own static server for byte-identical files —
this is a minor, expected difference between the control and the real
artifact, not a discrepancy that changes any verdict. The deployed link's
timing figures run slightly higher on two of five runs (2380.9 ms and
2352.4 ms nav-to-first-frame) than the local control's worst case
(2134.5 ms) — consistent with the deployed path crossing a real network
(even throttled identically) that the local path does not, and still nowhere
close to the 10 s target.

## CI and Pages deployment

`.github/workflows/ci.yml`'s checks job (install, typecheck, test, build,
`check:dist`, `check:size`) and deploy job both ran green on a real push to
`DW-1-epic1`:

- Run: `https://github.com/jbrandtmse/dragonwar/actions/runs/33134412545`
  (id `33134412545`), commit `9595a7c3338cfbd489cff8412832469eb50c6341`,
  conclusion `success`.
- The deploy job initially failed with "Branch DW-1-epic1 is not allowed to
  deploy to github-pages due to environment protection rules" — a repository
  Environment setting (`github-pages`'s deployment branch policy), separate
  from the workflow YAML's own trigger, previously allowing only `main`.
  `DW-1-epic1` was added to that policy (temporarily, alongside `main`,
  mirroring the workflow trigger's own author-approved exception) and the
  deploy job was re-run on the same commit, after which it succeeded.
- Review finding (2026-08-28): a second, separate real workflow run also
  happened — `https://github.com/jbrandtmse/dragonwar/actions/runs/33135084208`
  (id `33135084208`), a manual `workflow_dispatch` against commit `8461e15`
  (this document's own commit, after the deploy-trigger narrow-back below was
  already applied) — verifying that both jobs still pass and Pages still
  redeploys correctly once the `DW-1-epic1` push trigger was gone, using
  `workflow_dispatch`'s own always-available manual trigger. Also `success`.
  `dist/`'s inputs are unchanged between the two commits (docs-only diff), so
  this did not alter anything measured above.
- `https://jbrandtmse.github.io/dragonwar/` renders the placeholder box in
  Chrome on Windows — confirmed live via screenshot, and via the cold-load
  runs above. `THIRD-PARTY-NOTICES.txt` and `assets/dragonwar.glb` both
  return HTTP 200 from the deployed origin.
- Safari / macOS: **PENDING — author's macOS leg**, per ledger entry `DW-1`
  ("Author-owned: macOS / Safari measurement legs"). No new ledger entry
  filed.

## Size budget

`node tools/size-budget.mjs`:

```
[size-budget] measured: 0.725 MB (725,152 bytes)
[size-budget] budget:   2.750 MB (2,750,000 bytes)
[size-budget] OK -- within budget
```

**Arithmetic** (also recorded as a comment in `tools/size-budget.mjs`):
baseline 0.725152 MB (every file under `dist/` — both the root page and the
Spike 1 harness page, gzip level 9, summed), rounded up to the next 0.25 MB
increment (**0.75 MB**), plus **2.00 MB** authored headroom for the remainder
of Epic 1 = **2.75 MB** (`BUDGET_BYTES = 2_750_000`). 2.75 MB sits at about
14% of NFR-4's 20 MB ceiling — comfortable headroom remains even after this
budget's own 2 MB allowance. Re-set by Story 1.4 (the real glb replaces the
placeholder) and again by the Epic 5 art passes; must always stay below the
20 MB ceiling.

**Why 0.725 MB (CI, whole `dist/`) differs from ~0.59 MB (a real root-page
load, measured above):** `check-dist.mjs` confirmed 110 files under `dist/`
across 2 HTML pages, but a real load of the root page issues only 67
requests — the Spike 1 harness page (`tools/spike-1/index.html` and its own
chunk set) is deployed and counted in the CI budget (this story's own
decision: "the Spike 1 harness page is built into `dist/` and therefore
deployed and counted"), but a visitor to `/` never requests it. The CI number
is the conservative, whole-bundle figure the budget script is designed to
guard; the runner's number is what an actual visitor's browser transfers.

**Failure path, demonstrated not inspected:** `test/size-budget.test.ts`
lowers the budget below a real measured total via a real subprocess
invocation of `tools/size-budget.mjs` and asserts both the non-zero exit code
and that both the measured and budgeted numbers appear in the message.

## One-glb-versus-split decision

**Decision: keep the single `dragonwar.glb`.** The placeholder glb is 1,560
bytes raw / 635 bytes gzipped — about **0.1%** of the ~588 KB a real page load
transfers, and a rounding error against the budget. The entire measured
payload is Babylon engine code (the main chunk alone is 249,763 bytes gzipped
in the CI accounting; the PBR/OpenPBR material pipeline chunks together add
roughly another 150 KB), not asset content — splitting an asset that is
currently three-tenths of one percent of the payload would not move any
number that matters.

**Reopen condition** (authored, from the spine's "Asset split" deferral):
reopen the split if the glb alone exceeds 40% of compressed transfer, or 30%
of navigation-to-first-frame. Neither is remotely close today; both become
live questions once Story 1.4's real geometry and Epic 5's art passes land.

## Deploy trigger narrow-back

**This document's own measurements were taken from the unmerged `DW-1-epic1`
branch and are provisional until the workflow reruns from `main`.** Once
every measurement above was recorded, `.github/workflows/ci.yml`'s deploy
trigger was narrowed back to `main` plus `workflow_dispatch` only — the
`DW-1-epic1` entry is removed from `on.push.branches`, restoring AD-17 /
AR-34's `main`-only shipping rule, per this story's seventh acceptance
criterion. `grep -n "DW-1-epic1" .github/workflows/ci.yml` finds no match
after that edit. The `github-pages` environment's deployment branch policy
retains `DW-1-epic1` alongside `main` for now (harmless once the workflow
trigger no longer offers it a path to fire) — narrowing that repository
setting back to `main`-only is Epic 1's merge-gate owner's to do alongside
the branch's own deletion, not a workflow-file change this story makes.

## References (no new ledger entries filed)

- **`DW-11`** ("The production-build measurement surface has no scaffold in
  the repository") — **closed** by the `build`/`preview` scripts,
  `vite.config.ts`, `measure.mjs`'s re-pointed `DEFAULT_URL`, the live
  deployment, and the reproducible commands above.
- **`DW-16`** ("The background-throttle guard misses moderate throttling") —
  **closed** by the median-cadence guard in `tools/spike-1/browser.ts` and in
  `tools/spike-3/measure-load.mjs`, the 20 ms threshold (60 fps is 16.67 ms;
  20 ms leaves ~20% slack; the original 34.6 ms defect is rejected
  comfortably), and a real rejection observed and recorded above.
- **`DW-13`** ("This host's session-to-session measurement variance exceeds
  every effect being measured") — **survived, not closed** (owned by
  `burndown`). Its standing rule was followed: medians over 5+ runs, every
  raw sample published above, and the deployed-vs-local comparison measured
  as an interleaved A/B adjacent in time in one session.
- **`DW-1`** ("Author-owned: macOS / Safari measurement legs") — **not
  closed, no new entry filed.** The Safari/macOS row above reads `PENDING`
  and references this entry by name.
