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
| vpinball/vpinball cabinet physics port (`src/sim/physics/cabinet/**`) | https://github.com/vpinball/vpinball @ commit `3f838c14bd2e37fb49a0b5aa6a9d76d421846bef` (2026-08-29) | Visual Pinball development team and contributors — taken from the root `LICENSE` (2000-2026, "unless specifically noted differently in a respective source file"), because **none of the ported files carries a per-file copyright line**. | **GPL-3.0-or-later**, established **per file, from each file's own `// license:GPLv3+` first line** — **not** from repository metadata, the README, or the root `LICENSE` alone. That distinction is load-bearing here: `vpinball/vpinball` is **dual-licensed mid-migration**. Its root `LICENSE` does grant GPLv3+ ("either version 3 of the License, or (at your option) any later version"), but it also states that the migration is incomplete — so the root file tells you nothing about whether any *particular* source file is usable. Only a file whose literal first line reads `// license:GPLv3+` has completed the migration; every other file remains under the inherited 'old MAME'-like **non-commercial** terms, which GPL-3.0 cannot absorb and this project cannot distribute. Each file below was fetched at the pinned commit and its first line read individually on 2026-08-29: `src/physics/cabinet/DampedHarmonicOscillator.h`, `CabinetPhysics.h`, `CabinetPhysics.cpp`, `KeyboardNudge.h`, `KeyboardNudge.cpp`, `PlumbHandler.h`, `PlumbHandler.cpp` — **all seven begin `// license:GPLv3+`**. **`src/physics/cabinet/NudgeHandler.h` is EXCLUDED**: its first line is `#pragma once`, so it carries no marker and stays under the non-commercial terms. It must not be ported, transcribed, quoted or paraphrased. It is dispatch-only (no physics), so its exclusion costs nothing. | 2026-08-29 |
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
| `assets/src/dragonwar.blend` (placeholder table primitives) | Blender 5.2.1 LTS, driven by `tools/make-placeholder-blend.py` (this repository) | 2026-09-01 to 2026-09-02 | Story 2.1b re-ran the seeding script to draw the rest of the shot map above `GUIDE_Y_TOP_MM = 420`: the Left and Right Loops (a chain of convex prisms from the existing `col_post_divider_*_hi` posts, joined across the top so a full orbit passes both), the spinner gate (Left Loop only), the Ramp (deck-height channel, entrance right of centre, a bent-rail return into the right inlane), the off-centre Dragon with the Lock lane between its legs and the Mouth (`bd_lock`) aimed down-table, the six-target DRAGON bank, three Top lanes, two slingshots and three pop bumpers — every figure authored, none sourced from any commercial machine (PRD OQ-6, this story's own "Always" rule). Also: `col_lane_deflector` is retired (`DW-58`) and replaced by an angled deflector authored as part of the Right Loop's own upper arc; the four true perimeter walls now reach the glass (`DW-53`, `PERIMETER_WALL_H_MM = GLASS_Z_MM`). Generated, not sourced — original primitives at the AD-10 reference dimensions (playfield 514.4 x 1066.8 mm, 6.5 deg pitch, ball 26.99 mm, flipper bats 3.125 in), authored unpitched, nothing copied from any commercial machine. Story 2.1a re-ran the seeding script to author the drain triangle: both flipper boxes moved outward by `baseRadius` (12.5 mm) so their pivots stay at table x = 170.0 / 344.4 while the box becomes the WHOLE rubbered bat (`DW-78`); two outlanes, two inlanes and their divider/outer guides as convex prisms, each ending in an octagonal `rubber_post` node (`DW-72`, `DW-77`); the tip gap and both outlane widths are recorded, `unverified`, in `src/sim/table/tuning.ts`. Task 22 (`DW-119`) additionally opened a gap under each outlane in `col_wall_bottom_l`/`col_wall_bottom_r` (each a chamfered trapezoid rather than a box, so the wall's own inner corner sweeps clear of the channel below it), and added a below-deck return channel (one knee-bent, convex-quad rail per side, entirely outside the visible playfield rectangle) that carries a ball dropped in either outlane to the same untouched drain aperture the centre drain already uses — a real machine's outlane subway, modelled the same way, since the flippers occupy the direct on-deck path. This pass (task 25, `DW-119` residual) re-ran the seeding script again: `col_wall_bottom_l`/`col_wall_bottom_r`'s own TOP edge — the face a ball resting between the outlane and the drain aperture actually contacts — no longer runs flat at y = 0 across its ~165 mm span (this solver's gravity has no x-component, so a flat face gave a resting ball zero sideways force and stranded it there permanently); it now descends 10 mm toward the drain end, giving every resting point on that span a genuine tangential pull toward the aperture. All geometry is drawn from the reference dimensions and the flipper mover's own derived sweep alone — no Bally (or any commercial) playfield template, DXF or SVG (PRD OQ-6). `tools/make-placeholder-blend.py` is the one-time seeding script that built this file; from the moment this file is committed, per AD-11, **the `.blend` is the source of truth**, and the script is kept only as the reviewable record of how the placeholder was made and a way to regenerate one from scratch — it is not a build step and no npm script or CI step runs it. Story 2.1b rework iteration 2 (same date) re-ran the seeding script again: sloped the north face of every flat-topped shot-map body (`col_sling_l`/`_r`, `col_dragon_leg_l`/`_r`, `col_ramp_wall_l`, the six DRAGON-bank targets) so a ball resting against it is no longer stranded (`DW-119` mechanism, this time on the shot map's own bodies), and added `col_dragon_bank_backstop`, a wide sloped wall behind the whole DRAGON bank (each 11 mm-wide target proved too narrow, on its own, for the slope mechanism to work). A separate attempt to route each Loop's own return into its inlane (rather than its outlane) was tried at length and reverted — see this story's own final report — leaving the Loops at their original full-height geometry. Rework iteration 3 (2026-09-02): re-ran the seeding script twice more for the plunge-routing fix and DW-121. First, `col_loop_r_deflector` re-sited to a steeper hypotenuse (`PLUNGE_DEFLECTOR_DROP_MM`, 34 mm drop over the shooter lane's own 34 mm width, raised to 50 mm — 85 mm was tried first and rejected, measured to lower the hypotenuse's own low point below `LANE_WALL_TOP_Y_MM = 950`, back into `col_wall_lane`'s own reach and into a fresh corner trap) so a full-strength plunge clears the Right Loop's own entrance instead of rattling in its pocket (measured, this pass: ~1300 stray ticks in that pocket before the fix, 0 afterward), and `col_loop_top` shortened at its own LEFT end (from x = 40 to x = 220, clear of both loops' own rails at x = 50-62 / 406.4-418.4) so a ball crossing the top detaches into the open interior field — the Dragon's legs, the DRAGON bank, the Ramp — this story's own rework-iteration-2 fix already proves handles a descending ball, rather than the Left Loop's own lane, which returns to the outlane, a separate defect this story does not own (Story 2.1c). Second, `sw_drain` (a switch zone, not a wall) widened from the centre-aperture-only band (`DRAIN_X0_MM..DRAIN_X1_MM`, y -5..15) to the whole below-deck corridor short of the shooter lane (x 0..`LANE_X0_MM`, y -80..15) so a ball draining via either outlane surfaces a genuine `s_drain` edge (DW-121) — narrowed from a first attempt that also spanned the shooter lane and spuriously closed `s_drain` on an ordinary trough eject. Traced against the real replay/physics pipeline: the plunge now crosses the top (max y = 1053.3 mm), spends 500+ ticks in the flipper-reachable band, and comes within 7.9-20.4 mm of the left flipper's own tip (against a pre-shot-map reference of 29.61 mm) before draining or being caught. Every figure authored, none sourced from any commercial machine. |
| `public/assets/dragonwar.glb` (presentation geometry) | Blender 5.2.1 LTS, driven by `tools/export.py` (this repository) from `assets/src/dragonwar.blend` | 2026-09-01 to 2026-09-02 | Generated, not sourced — exported from the `.blend` row above; same dimensions, same provenance. Story 2.1b re-exported it after drawing the full shot map; every new `col_`/`sw_` node is collision-only and never reaches this file (Design Notes, "What goes into the glb"), so this row's own visible content is otherwise unchanged — the committed glb still holds only the three roots, `vis_playfield`, `l_insert_left`, `bd_trough`, `bd_shooter` and the new `bd_lock`. Story 2.1a re-exported it after the `.blend` row's drain-triangle changes, again after the outlane-routing fix, and again this pass after the bottom-wall slope fix; every new `col_` guide, divider, post and below-deck channel rail is collision-only and never reaches this file (Design Notes, "What goes into the glb"), so this row's own visible content is otherwise unchanged from Story 1.5's. This closes Story 1.2's loop: `tools/make-placeholder-glb.mjs`, Story 1.2's stand-in generator, is **retired** by this story, and `tools/export.py` is now the sole owner of this path. Story 2.1b rework iteration 2 (same date) re-exported it again after the bevel/backstop fix above; still collision-only, so this row's own visible content is unchanged. Rework iteration 3 (2026-09-02) re-exported it twice more, after the deflector/col_loop_top fix and again after the sw_drain fix, both above; still collision-only (every touched node is `col_`/`sw_`), so this row's own visible content is unchanged. |
| `public/assets/dragonwar.collision.json` (physics collision data, millimetres, table frame) | Blender 5.2.1 LTS, driven by `tools/export.py` (this repository) from `assets/src/dragonwar.blend` | 2026-09-01 to 2026-09-02 | Generated, not sourced — the same export run as the row above, reduced by `tools/export.py` to the ported vpx-js primitive set (`HitPlane`/`LineSeg`/`HitLineZ`/`HitLine3D`/`HitTriangle`) that `src/sim/physics/loader` instantiates. Story 2.1b re-exported it with the full shot map: ~27 new `col_` nodes (the Loops, the Ramp, the Dragon's legs, the DRAGON bank, the Top-lane dividers, both slingshots, three pop bumpers, the Right Loop's own deflector) and 27 new `sw_` switch zones, plus a third ball device (`bd_lock`). Story 2.1a re-exported it with both flipper boxes' new (outward-moved) extents, the drain triangle's divider and outer guide walls (each a convex quad, reduced through `tools/export.py`'s existing convex-hull wall reduction) and their terminal octagonal `rubber_post` nodes — `DW-72`, `DW-77`, `DW-78`. Task 22 (`DW-119`) re-exported it again with `col_wall_bottom_l`/`col_wall_bottom_r` each reshaped into a chamfered trapezoid that opens an outlane-width gap and sweeps its own inner corner clear of the channel below it, and four new `col_channel_l_1`/`col_channel_l_2`/`col_channel_r_1`/`col_channel_r_2` wall nodes (the below-deck outlane return channel, one knee-bent pair of convex quads per side through the same wall reduction) that route a ball dropped in either outlane into the unmoved `DRAIN_X0_MM..DRAIN_X1_MM` aperture. This pass (task 25, `DW-119` residual) re-exports it once more with `col_wall_bottom_l`/`col_wall_bottom_r`'s own footprint reshaped from a flat-topped trapezoid into a four-point convex quad whose top edge slopes 10 mm toward the drain aperture over its outlane-to-aperture span, so a ball resting anywhere along it is pulled sideways toward `DRAIN_X0_MM..DRAIN_X1_MM` instead of stopping dead. Story 2.1b rework iteration 2 (same date) re-exports it once more: seven shot-map bodies gain a sloped north face and one new node, `col_dragon_bank_backstop`, is added (no switches or coils changed, so `TABLE`'s own `tableHash` is unaffected — only `assetHash` moves). Rework iteration 3 (2026-09-02) re-exports it twice more: first, `col_loop_r_deflector`'s footprint changes shape (steeper hypotenuse) and `col_loop_top`'s footprint shortens (DW-121's sibling fix); second, `sw_drain`'s own switch-zone bounds widen, then narrow again to exclude the shooter lane (DW-121) — no switch or coil NAME changes either time, so `TABLE`'s own `tableHash` is unaffected, only `assetHash` moves. |

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
| vpinball/vpinball | Dual — GPLv3+ only where the first line reads `// license:GPLv3+`; otherwise MAME-derived non-commercial | **No longer planned — IN THE REPOSITORY since 2026-08-29** (Story 1.7's cabinet-physics port). See the row in the Code table above for the pin, the seven included files, and the excluded `NudgeHandler.h`. The per-file rule still governs every future addition: check **every file individually**; unmarked files cannot be used. |
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
