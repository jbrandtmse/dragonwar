# Review — Freshness lens

**Artifact:** `ARCHITECTURE-SPINE.md` (DragonWar, 2026-08-26)
**Lens brief:** Verify every committed decision was web-researched or reality-checked rather than asserted from training data: current library/framework versions, that each named technology still exists and fits, and — greenfield — the live defaults of any starter it leans on. Flag anything that could be out of date and wasn't confirmed against the web, the existing project, or the current starter.
**Method:** Read the spine and the memlog `(version)` entries. Did not re-verify what the memlog verified today (all Stack-table versions; `EngineFactory.CreateAsync` + WebGL fallback; vpx-js HEAD date and `PHYSICS_STEPTIME`; WebGPU support matrix; Babylon clustered lighting on WebGL2; AudioWorklet in Safari 14.1; Blender 5.2.1 exporter writing `TEXCOORD_n`; MPF licence). Spot-checked the remaining asserted facts with 15 web fetches/searches.

**Verdict:** No committed decision rests on a technology that no longer exists or a version that is wrong; the spine's factual claims about Babylon, vpx-js, VPX units and GitHub Pages all confirmed. Two things are stale-adjacent and unstated: TypeScript 7.0 ships with no programmatic API (breaks any TS-API-based lint in the CI "boundary lint" step), and Node 22 enters Maintenance LTS in two months.

| Tier | Count |
| --- | --- |
| Critical | 0 |
| High | 1 |
| Medium | 3 |
| Low | 4 |

---

## Checked claims

### F-1 — TypeScript 7.0.2 with Vite 8 / Vitest 4 — **confirmed with a caveat** · tier: **HIGH**

- **Spine says:** Stack pins TypeScript 7.0.2; CI runs "typecheck, boundary lint, vitest, build".
- **Found:** TypeScript 7.0 (stable 2026-07-08) is published as `typescript` with the `tsc` entry point, but **"TypeScript 7.0 does not ship with an API. We expect TypeScript 7.1 to ship with a new (and different) API."** Microsoft ships `@typescript/typescript6` (`tsc6`) alongside for tools that embed the compiler, and says projects using tools that embed TS "will need to continue using TypeScript 6.0 for now." Vite 8 (Rolldown/oxc transpile) and Vitest 4 do not load the `typescript` package to run tests or build, so `vite build` and `vitest` are unaffected; `tsc --noEmit` works. What breaks is anything using the TS compiler API: typescript-eslint, ts-morph, ts-jest, `vite-plugin-checker` (open issue #516 for tsgo). Also new 7.0 defaults: `strict: true`, `module: esnext`, `types: []` (no auto-discovery — `vitest/globals`, `@webgpu/types` etc. must be listed), `rootDir: ./`; `baseUrl` and `moduleResolution: node` are hard errors.
- **Why it matters here:** AD-16's "import-boundary lint" is unspecified. If it is implemented as ESLint + typescript-eslint (`eslint-plugin-boundaries`, `import/no-restricted-paths` with the TS resolver), it needs a TS 6 API path and will not run on `typescript@7.0.2` alone.
- **Sources:** https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ · https://github.com/fi3ework/vite-plugin-checker/issues/516 · https://www.infoq.com/news/2026/08/typescript-7-released/
- **Fix:** In the Stack table add a note: "TypeScript 7.0.2 (`tsc --noEmit` gate only; no compiler API until 7.1). Boundary lint uses a tool with no TS-API dependency (dependency-cruiser, or an ESLint path rule with `@typescript/typescript6` as the parser's TS)." Add to AD-16 that the boundary lint must not depend on the TS 7 compiler API. Add a tsconfig note: `types` is explicit under TS 7.

### F-2 — Node.js 22 LTS (≥ 22.12) — **confirmed, but ageing** · tier: **MEDIUM**

- **Found:** Node 22 "Jod" is LTS today, enters **Maintenance LTS on 2026-10-24**, EOL 2027-04-24. Node 24 "Krypton" has been Active LTS since 2025-11-06 (EOL 2028-05-06). Vite 8's floor is Node ≥ 20.19 / ≥ 22.12 (memlog-verified), so 24 is in range.
- **Source:** https://nodejs.org/en/about/previous-releases
- **Fix:** Pin "Node.js 24 LTS" (or "≥ 22.12, 24 LTS recommended") so the repo does not start life on a line that goes maintenance-only two months after the first commit. Include Node in the 2026-09-26 re-check note.

### F-3 — vpx-js port source `lib/physics/` contains hit objects, flipper, ball, quadtree/kd — **partly wrong (path)** · tier: **MEDIUM**

- **Spine says:** Stack row "vpdb/vpx-js (port source) master @ 2020-11-12 (v1.3.4), `lib/physics/`"; seed says `sim/physics/` is a "vpx-js port (hit objects, TOI collide, flipper, ball, broadphase)".
- **Found:** `lib/physics/` holds the hit objects and broadphase only: `hit-object`, `hit-circle`, `hit-line-3d`, `hit-line-z`, `hit-triangle`, `hit-plane`, `hit-point`, `hit-3dpoly`, `hit-quadtree`, `hit-kd`, `hit-kd-node`, `collision-event`, `collision-type`, `mover-object`, `anim-object`, `anim-slingshot`, `line-seg`, `line-seg-slingshot`, `constants`, `functions`. **Ball** bodies live in `lib/vpt/ball/` (`ball-data`, `ball-hit`, `ball-mover`, `ball-state`, `ball`), **flipper** in `lib/vpt/flipper/` (`flipper-data`, `flipper-hit`, `flipper-mover`, `flipper-state`), and the **physics step / TOI loop** in `lib/game/player-physics.ts`. Headers spot-checked on `lib/physics/hit-kd.ts` and `lib/vpt/ball/ball-data.ts` both read "either version 2 of the License, or (at your option) any later version" — or-later confirmed for both trees.
- **Sources:** https://github.com/vpdb/vpx-js/tree/master/lib/physics · https://github.com/vpdb/vpx-js/tree/master/lib/vpt/ball · https://github.com/vpdb/vpx-js/tree/master/lib/vpt/flipper · https://github.com/vpdb/vpx-js/tree/master/lib/game · https://raw.githubusercontent.com/vpdb/vpx-js/master/lib/physics/hit-kd.ts · https://raw.githubusercontent.com/vpdb/vpx-js/master/lib/vpt/ball/ball-data.ts
- **Fix:** Change the Stack row to "`lib/physics/`, `lib/vpt/ball/`, `lib/vpt/flipper/`, `lib/game/player-physics.ts`". Keep AD-16's per-file header check — only two files were sampled here; the `(ported)` marker must be applied per file, not per directory.

### F-4 — Babylon glTF loader: right-handed +Y-up glTF into the left-handed scene — **confirmed; default unstated in spine** · tier: **MEDIUM**

- **Found (loader source, master):** when `!scene.useRightHandedSystem` (Babylon's default), the loader creates a `__root__` mesh and applies `rotation = [0, 1, 0, 0]` (180° about Y) and `scale = [1, 1, -1]` to it; every glTF node is parented under `__root__`. With `scene.useRightHandedSystem = true` no flip is applied and glTF coordinates are the scene coordinates.
- **Why it matters:** AD-10 makes `toScene()` in `sim/table/frames.ts` "the only unit or axis conversion in the codebase". Under the default left-handed scene, the glb's geometry arrives already flipped under `__root__`, while dynamic bodies (ball, flippers driven from the physics snapshot) placed by `toScene()` must either be parented under `__root__` or reproduce the flip — a second, implicit conversion the spine says must not exist. The spine does not state which handedness the scene uses.
- **Source:** https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/packages/dev/loaders/src/glTF/2.0/glTFLoader.pure.ts
- **Fix:** State in AD-10 or AD-12: "The Babylon scene is created with `useRightHandedSystem = true` so the glb loads without the `__root__` handedness flip; `toScene()` is then mm→m plus the pitch rotation only." (Alternative: mandate that all dynamic meshes are children of `__root__` — but the explicit right-handed scene is the simpler invariant.)

### F-5 — `TEXCOORD_1` consumed by Babylon as uv2 — **confirmed** · tier: —

- **Found:** `loadAttribute("TEXCOORD_0", VertexBuffer.UVKind); loadAttribute("TEXCOORD_1", VertexBuffer.UV2Kind);` … through `TEXCOORD_5 → UV6Kind`. AD-11/AD-12's "UV2 contract" holds.
- **Source:** https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/packages/dev/loaders/src/glTF/2.0/glTFLoader.pure.ts

### F-6 — GitHub Pages serves no custom headers (no cross-origin isolation) — **confirmed** · tier: **LOW** (note only)

- **Found:** GitHub Pages does not let you set response headers; the 2023 community request to serve COOP/COEP by default is still "Unanswered". So `SharedArrayBuffer` is unavailable on Pages. The spine's v1 design needs none of it (main-thread sim, `postMessage`-style Worker later), so the dependency is consistent.
- **Sources:** https://github.com/orgs/community/discussions/46419 · https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- **Fix (optional):** In Deferred → "Web Worker for the simulation", add "must use structured-clone/`postMessage` snapshots, not `SharedArrayBuffer` — Pages cannot serve COOP/COEP". This closes a door the Worker design might otherwise walk through.

### F-7 — VPX unit convention: 50 VPU = ball diameter 26.99 mm — **confirmed** · tier: —

- **Found:** vpx-js `lib/physics/constants.ts`: "one VP length unit corresponds to 1 U = .53975 mm"; `lib/vpt/ball/ball-data.ts`: `radius: number = 25`. 50 × 0.53975 = 26.99 mm (= 1 1/16 in). Community convention (VPForums, VPE docs) agrees: 50 units = ball diameter; 47 units ≈ 1 inch.
- **Sources:** https://raw.githubusercontent.com/vpdb/vpx-js/master/lib/physics/constants.ts · https://raw.githubusercontent.com/vpdb/vpx-js/master/lib/vpt/ball/ball-data.ts · https://docs.visualpinball.org/creators-guide/editor/units-3d-space.html · https://www.vpforums.org/index.php?showtopic=24895
- **Note:** constants.ts also fixes VP's internal time unit at 10 ms and `GRAVITYCONST = 1.81751 U/T²`; `toPhysics()` must convert mm and the 1 kHz tick consistently with those. Not a finding — a hint for `frames.ts`.

### F-8 — Blender glTF export: "+Y up", `lightgroup` custom property — **confirmed with a caveat** · tier: **LOW**

- **Found:** the exporter's "+Y Up" option ("Export using glTF convention, +Y up") is the default. **"Custom Properties" (export as glTF `extras`) is an opt-in Include checkbox**, off by default. The 5.2 manual returned HTTP 403; confirmed on the 4.5 manual mirror (option set stable since 2.93; memlog verified the 5.2.1 exporter separately for `TEXCOORD_n`).
- **Sources:** https://github.com/wlk-r-dev/blender-manual-4.5/blob/main/addons/import_export/scene_gltf2.md · https://docs.blender.org/manual/en/2.93/addons/import_export/scene_gltf2.html
- **Fix:** AD-11 relies on the `lightgroup` custom property reaching the glb; state that the `tools/` export script sets `export_extras=True` (and `export_yup=True` explicitly), so a hand export from the Blender UI cannot silently drop the light groups. The loader's fail-fast on missing nodes should also fail on a static mesh with no `lightgroup` extra.

### F-9 — `EngineFactory.CreateAsync` exists in Babylon 9.x with WebGL fallback — **not re-checked** (memlog-verified today) · tier: —

### F-10 — WebGL2 floor on Safari (macOS) — **unconfirmed** · tier: **LOW**

- The spine's platform gate names Chrome, Edge and Safari with WebGL2 as the floor. WebGL2 has shipped in Safari since 15 (2021); not re-verified this session and not in the memlog. Risk is negligible; noting only for completeness of the "verified" claim in the Stack preamble.
- **Fix:** none required; optionally cite caniuse `webgl2` in the memlog when the renderer re-check is done on 2026-09-26.

### F-11 — pnpm 11.24.0 vs pnpm 12.0.0 (published today) — **not re-checked** (memlog-verified) · tier: **LOW**

- The memlog already flags 12.0.0 as day-old. The spine pins 11.24.0 without saying why; a one-clause note ("12.0.0 released 2026-08-26, not adopted at day zero") would stop a reader from "fixing" the pin. Cosmetic.

---

## Not verified and not needed

- Tauri 2.11.5, MPF v0.80.0, Blender 5.2.1 LTS, Vite 8.2.2 (Node floor), Vitest 4.1.11, @babylonjs/* 9.22.2 — all memlog-verified today; not repeated.
- glTF 2.0 / .glb, Web Audio API — stable standards; no freshness risk.

## Summary of fixes to apply to the spine

1. **(High)** Stack/AD-16: TS 7.0 has no compiler API until 7.1 — make the boundary lint TS-API-free (dependency-cruiser or plain path rules) or add `@typescript/typescript6` for the lint toolchain; note TS 7 tsconfig defaults (`types: []`, no `baseUrl`).
2. **(Medium)** Stack: Node 24 LTS instead of 22 (22 → Maintenance 2026-10-24).
3. **(Medium)** Stack: vpx-js port source is `lib/physics/` + `lib/vpt/ball/` + `lib/vpt/flipper/` + `lib/game/player-physics.ts`.
4. **(Medium)** AD-10/AD-12: declare `scene.useRightHandedSystem = true` (or the `__root__` parenting rule) so the glTF handedness flip is not a hidden second conversion.
5. **(Low)** AD-11/tools: export script sets `export_extras=True`; Deferred/Worker: no `SharedArrayBuffer` on Pages; note pnpm 12 exists.
