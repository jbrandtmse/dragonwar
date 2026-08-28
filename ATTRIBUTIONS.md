# Attributions

Every third-party thing in DragonWar, and where it came from.

DragonWar is GPL-3.0 and must stay free to distribute. This file is the ledger
that keeps that true. **The entry goes in before the file does** — see the
provenance rule in `CLAUDE.md`.

If something is in the repository and not in this file, that is a bug. Fix it by
establishing the provenance or removing the file.

**Ordering convention:** a dependency addition lands its row in this file
*before* (or, where a single commit is unavoidable, in the same commit as) the
`package.json` change that adds it. `pnpm check:attributions` enforces the
state half of that promise in CI — every `dependencies` and `devDependencies`
key in `package.json` must have a row somewhere below, checked whitespace-
normalised so a markdown rewrap cannot break the match — but it cannot see
commit order, so the *ordering* half is a convention this paragraph states and
review enforces, not something a script can verify from a single checkout.

---

## Code

| Component | Source | Author | Licence | Verified |
|---|---|---|---|---|
| BMad Method v6.11.0 (`.claude/skills/`, `_bmad/`) | https://docs.bmad-method.org | BMad Method project | Own upstream terms; no licence file ships with the install. Tooling only — not part of the program, removable without affecting it. | 2026-08-26 |
| vpdb/vpx-js physics port (`src/sim/physics/**`) | https://github.com/vpdb/vpx-js @ commit `e8a6d6f` (tag `v1.3.4`, 2020-11-12) | freezy <freezy@vpdb.io> (Copyright (C) 2019), with contributors Jason Millard <jsm174@gmail.com> and Michael Vogt <michael@neeo.com> | **GPL-2.0-or-later**, as verified in the source file headers (e.g. `lib/physics/hit-object.ts`) — **not** from `package.json`. `package.json` at this commit declares only `"license": "GPL-2.0"`, but every header-bearing file's licence paragraph reads "either version 2 of the License, or (at your option) any later version." DragonWar exercises that or-later clause to combine this GPL-2.0-or-later code with the project's Apache-2.0 dependencies (Babylon.js) and distribute the whole under **GPL-3.0**, per `CLAUDE.md`'s provenance rule and AD-16. A small number of upstream files carried no header at all (`lib/physics/constants.ts`, `lib/physics/functions.ts`, `lib/physics/mover-object.ts`, `lib/physics/collision-type.ts`, `lib/math/frect3d.ts`); their licence was established from the repository's other header-bearing source files, per the same GPL-2.0-or-later grant — see `docs/spikes/spike-1.md` for the full deviation list. | 2026-08-27 |
| `@babylonjs/core` @ `9.22.2` | https://github.com/BabylonJS/Babylon.js/blob/master/license.md | The Babylon.js team | **Apache-2.0**, as read in `license.md` at the repository root (first line: "# Apache License 2.0 (Apache)") — **not** from `package.json` or npm registry metadata (both also declare `license: Apache-2.0`, which corroborates but is explicitly not the verification source, per `CLAUDE.md`'s provenance rule). `NOTICE.md` at the same repository root reads "Babylon.js / Copyright 2023 The Babylon.js team" (46 bytes); its content, plus the full Apache-2.0 licence text, ships in `public/THIRD-PARTY-NOTICES.txt`, linked from the press-to-begin panel, satisfying Apache-2.0 sections 4(a) and 4(d) at this story's Pages deploy — the repository's first distribution. | 2026-08-27 |
| `@babylonjs/loaders` @ `9.22.2` | https://github.com/BabylonJS/Babylon.js/blob/master/license.md | The Babylon.js team | Same monorepo, same licence, same verification as the `@babylonjs/core` row above — **Apache-2.0**, read in `license.md` at source, not from package metadata. | 2026-08-27 |
| `babylonjs-gltf2interface` @ `9.22.2` | https://github.com/BabylonJS/Babylon.js/blob/master/license.md | The Babylon.js team | Transitive dependency pulled in by `@babylonjs/loaders`'s `peerDependencies` (`pnpm-lock.yaml`'s `autoInstallPeers`), not a direct `package.json` entry — flagged by review 2026-08-28 as a provenance gap the story's own careful treatment of the two direct Babylon packages had missed. Same monorepo as those two rows (`npm` registry `repository: git+https://github.com/BabylonJS/Babylon.js.git`, confirmed at source, not from that metadata) — same licence, same `license.md`, same verification. TypeScript type-declarations only (`typings: babylon.glTF2Interface.d.ts`, no runtime `.js`); contributes no bytes to the built bundle but is recorded per `CLAUDE.md`'s "no exception" provenance rule regardless. **Apache-2.0**, read in `license.md` at source, not from package metadata. | 2026-08-28 |
| `vite` @ `8.2.2` | https://github.com/vitejs/vite | VoidZero Inc. and Vite contributors | **MIT**, as read in `LICENSE.md` at the root of the published Vite package ("Vite is released under the MIT license", "Copyright (c) 2019-present, VoidZero Inc. and Vite contributors") — **not** from the `license` field of `package.json`. Vite is a build-time dependency, but it is listed here because its module-preload helper is **emitted into the shipped bundle** (`dist/assets/preload-helper-*.js`), so MIT's "include the copyright notice and this permission notice in all copies" obligation attaches to this story's Pages deploy. The notice ships in `public/THIRD-PARTY-NOTICES.txt`. Found by review 2026-08-28. | 2026-08-28 |

*The Code table above records every third-party component whose bytes are
compiled into or emitted alongside DragonWar's built bundle — each carries a
distribution obligation (a licence text or a notice) that
`public/THIRD-PARTY-NOTICES.txt` discharges. The Build- and test-time tooling
table below is a different class: dependencies that run only at build time or
test time and contribute no bytes to `dist/`, so they carry no distribution
obligation, but `CLAUDE.md`'s provenance rule and `pnpm check:attributions`
still require a row for every one of them, no exception.*

## Build- and test-time tooling

| Component | Source | Author | Licence | Verified |
|---|---|---|---|---|
| `typescript` @ `7.0.2` | https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt | Microsoft Corporation | **Apache-2.0**, as read in `LICENSE.txt` at source (opens directly with the Apache License, Version 2.0 header) — not from `package.json` or npm metadata. `tsc --noEmit` only; TypeScript 7.0 ships no compiler API for any lint to depend on (AD-16). Contributes no bytes to `dist/`. | 2026-08-27 |
| `vitest` @ `4.1.11` | https://github.com/vitest-dev/vitest/blob/main/LICENSE | VoidZero Inc. and Vitest contributors | **MIT**, as read in `LICENSE` at source ("MIT License / Copyright (c) 2021-Present VoidZero Inc. and Vitest contributors") — not from `package.json` or npm metadata. Test runner only; contributes no bytes to `dist/`. | 2026-08-27 |
| `@types/node` @ `24.13.3` | https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/LICENSE | DefinitelyTyped contributors (per-file copyright) | **MIT**, as read in `LICENSE` at source ("This project is licensed under the MIT license") — not from `package.json` or npm metadata. Type declarations only, used by the `node` typecheck project (`tsconfig.node.json`); contributes no bytes to `dist/`. | 2026-08-27 |
| `dependency-cruiser` @ `18.2.0` | https://github.com/sverweij/dependency-cruiser/blob/main/LICENSE | Sander Verweij | **MIT**, as read in `LICENSE` at source ("The MIT License (MIT) / Copyright (c) 2016-2026 Sander Verweij") — not from `package.json` or npm metadata. Boundary-lint devDependency (AD-16, Story 1.3): enforces the layer-graph import rules in CI (`pnpm lint:boundaries`). Contributes no bytes to `dist/`. | 2026-08-27 |
| `@swc/core` @ `1.16.1` | https://github.com/swc-project/swc/blob/main/LICENSE | SWC contributors | **Apache-2.0**, as read in `LICENSE` at source (opens directly with the Apache License header) — not from `package.json` or npm metadata. The TypeScript-aware parser dependency-cruiser needs to read `.ts` files at all under `typescript@7.0.2` (dependency-cruiser's own bundled TypeScript support is capped at `<7.0.0` and silently scans zero files without this — see `tools/dependency-cruiser.config.mjs`'s header comment). A Rust parser with no TypeScript-compiler dependency, honouring AD-16's "no lint may depend on the TypeScript compiler API" constraint. Ships platform binaries as transitive optional dependencies from the same Apache-2.0 monorepo. Contributes no bytes to `dist/`. | 2026-08-27 |

## Assets

Art, audio, models, textures and fonts go here as they are added. No
*third-party* asset is in the repository yet; every asset present is
project-generated and recorded under "Generated content" below.

| Asset | Source | Author | Licence | Verified |
|---|---|---|---|---|

## Generated content

AI-generated or tool-generated art, audio or code goes here with the tool and date.

| Item | Tool | Date | Notes |
|---|---|---|---|
| `assets/src/dragonwar.blend` (placeholder table primitives) | Blender 5.2.1 LTS, driven by `tools/make-placeholder-blend.py` (this repository) | 2026-08-28 | Generated, not sourced — original primitives at the AD-10 reference dimensions (playfield 514.4 x 1066.8 mm, 6.5 deg pitch, ball 26.99 mm, flipper bats 3.125 in), authored unpitched, nothing copied from any commercial machine. Story 1.5 re-ran the seeding script to relocate the `bd_trough` eject empty to the shooter-lane foot, add the angled triangular-prism `col_lane_deflector` at the top of the plunger lane, and retile `sw_trough_1..4` as four contiguous boxes spanning the drain aperture — all three are provisional placeholder geometry (`DW-58`), not derived from any acceptance criterion. `tools/make-placeholder-blend.py` is the one-time seeding script that built this file; from the moment this file is committed, per AD-11, **the `.blend` is the source of truth**, and the script is kept only as the reviewable record of how the placeholder was made and a way to regenerate one from scratch — it is not a build step and no npm script or CI step runs it. |
| `public/assets/dragonwar.glb` (presentation geometry) | Blender 5.2.1 LTS, driven by `tools/export.py` (this repository) from `assets/src/dragonwar.blend` | 2026-08-28 | Generated, not sourced — exported from the `.blend` row above; same dimensions, same provenance. Story 1.5 re-exported it after the `.blend` row's changes (the `bd_trough` mechanism node moved to its new eject pose); `col_lane_deflector` and the retiled trough zones are collision-only and never reach this file. This closes Story 1.2's loop: `tools/make-placeholder-glb.mjs`, Story 1.2's stand-in generator, is **retired** by this story, and `tools/export.py` is now the sole owner of this path. |
| `public/assets/dragonwar.collision.json` (physics collision data, millimetres, table frame) | Blender 5.2.1 LTS, driven by `tools/export.py` (this repository) from `assets/src/dragonwar.blend` | 2026-08-28 | Generated, not sourced — the same export run as the row above, reduced by `tools/export.py` to the ported vpx-js primitive set (`HitPlane`/`LineSeg`/`HitLineZ`/`HitTriangle`) that `src/sim/physics/loader` instantiates -- Story 1.5 replaced the corner-primitive site's `HitPoint` with `HitLineZ` (DW-7; a `HitPoint` at physics z = 0 is tangent to a deck-rolling ball's surface by construction, so it never fires). Story 1.5 re-exported it with the relocated `bd_trough` eject pose, the new `col_lane_deflector` wall (a non-axis-aligned footprint, reduced through `tools/export.py`'s convex-hull wall reduction) and the four retiled `sw_trough_*` zones. |

Blender itself is a **GPL tool** used to author and export the three rows above.
It is not vendored into this repository — no Blender file or code is copied into
the tree — and therefore carries no row of its own in the Code table above; every
export or authoring step locates it through the `BLENDER` environment variable
or a conventional install path, never a hardcoded machine-specific path.

---

## Planned dependencies, and their terms

Verified during technical research. Not yet in the repository — record them
properly here when they arrive.

| Project | Licence | Obligation on use |
|---|---|---|
| Mission Pinball Framework | MIT (docs CC BY 4.0) | Include its copyright and permission notice if its ontology, naming, or event vocabulary is adopted. |
| vbousquet/pinball-parts | CC BY-SA, except a "Thin Film Interaction" node group under CC BY-NC-SA 4.0 | Attribute; **exclude the non-commercial node group.** |
| vpinball/vpinball | Dual — GPLv3+ only where the first line reads `// license:GPLv3+`; otherwise MAME-derived non-commercial | Check **every file individually**. Unmarked files cannot be used. |
| vpinball/pinmame | MAME-derived, "strictly a non-profit project" | **Do not use.** Not needed — DragonWar is an original table with no ROM emulation. |

---

## Where to get assets that are safe to use

The practical answer to "how do I make this free without stepping on anyone."
Always check the individual item's licence — a permissive site can still host a
restrictively-licensed file.

**3D models** — Poly Haven (CC0) · Kenney.nl (CC0) · Sketchfab, filtered to
CC0/CC BY · Blender's own bundled assets · anything you model yourself.

**Textures and materials** — Poly Haven (CC0) · ambientCG (CC0) ·
Blender procedural materials.

**Audio** — Freesound, filtered to CC0 (its CC BY and sampling-plus licences
carry conditions worth reading) · Kenney's audio packs (CC0) ·
sounds you record yourself. A pinball machine's mechanical sounds are unusually
easy to record on a phone at the bar, and the result is unambiguously yours.

**Music** — Kevin MacLeod / incompetech (CC BY, attribution required) ·
Free Music Archive, filtered by licence · commissioned or self-composed.

**Fonts** — Google Fonts (OFL/Apache) · Open Font Library. Note that many
retro and DMD-style fonts are commercial or unlicensed; check before using one.

**Avoid entirely** — Google Images, Pinterest, asset sites with no stated
licence, ripped commercial game assets, and anything scraped from real pinball
machines.

*Recording your own reference machine's sounds, and using real published
dimensions, is both cheaper and safer than sourcing either.*
