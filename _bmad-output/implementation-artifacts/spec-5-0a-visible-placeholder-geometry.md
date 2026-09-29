---
title: 'Story 5.0a: Visible placeholder geometry'
type: 'feature'
created: '2026-09-29'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: [oversized]
deferred:
  - summary: 'Snapshot plunger.posMm is hard-wired 0, so no plunger visual can show travel until physics publishes it'
    evidence: 'src/sim/physics/plunger.ts:100-104 returns { posMm: 0, holdTicks }. This story''s vis_plunger follows posMm faithfully but is static in real play. Publishing travel is src/sim work, outside Epic 5''s footprint. Story 5.4''s AC 1 ("plunger travel") and DW-249 depend on it.'
    location: 'src/sim/physics/plunger.ts:100'
    severity: med
---

<intent-contract>

## Intent

**Problem:** `public/assets/dragonwar.glb` holds 18 meshes: 15 inserts, `vis_playfield`, `vis_backbox` and `vis_spinner_l`. No wall, Loop, Ramp, Dragon, target, bumper, slingshot, flipper or plunger is ever drawn, so a player watches a ball cross a bare board (DW-279).

**Approach:**
- `tools/make-placeholder-blend.py` gains a final pass. It copies every visible `col_` body's own mesh data into a flat-shaded `vis_` twin, colouring each twin by the family its `surface` names, and adds a `vis_plunger`.
- A new `src/presentation/mechanisms/` follower poses the flipper, drop-target and plunger visuals from each frame's snapshot.
- Collision, `TABLE` and every replay hash stay untouched.

## Boundaries & Constraints

**Always:**
- **Copy, don't re-author.** Each twin's vertices are copied from its `col_` object inside the same script run.
- **Naming rule.** The twin of `col_<x>` is `vis_<x>`. The one exception is the four `surface: 'dragon'` bodies (`col_dragon_leg_l/_r`, `col_lock_ceiling`, `col_lock_ceiling_west_fill`), which are merged into one `vis_dragon`, the mesh Story 5.1 replaces.
- **Exclusions (mechanical rule).** Exactly these `col_` bodies get no twin:
  - `col_playfield`, whose visual is the existing `vis_playfield`;
  - `col_glass`, which belongs to Story 5.3;
  - every body whose `bboxMm.max.y <= 0`: the below-deck channels, channel posts and drain-edge walls under the apron.

  At this tree that leaves 90 bodies, which become 87 `vis_` nodes, plus `vis_plunger`.
- **Pose.** A twin's table-frame x/y extent equals its `col_` bbox within 0.01 mm.
  - Its z range is `[zLow, min(zHigh, WALL_H_MM) + topOffsetMm(family)]`.
  - `topOffsetMm` is an authored per-family constant in `[0, 3]` mm. It exists so that overlapping families never share a coplanar top face; the 400 mm perimeter and lane walls are capped the same way.
  - Static twins keep identity transforms with baked vertices, like every mesh today.
  - `vis_flipper_l/_r` instead have their object origin at the flipper pivot, derived exactly as `loaded-flipper.ts` derives it (one half-width in from the box's outer end; x 170.0 / 344.4, y 70). Their vertices are relative to that origin, and the authored pose is the end-of-stroke pose, the same as the `col_` box.
- **Families and colours.** There are nine flat-colour families, one material each, all with no texture. The family is taken from the `col_` body's `surface`:

  | Family | Surfaces | Material |
  |---|---|---|
  | walls and guides | `wood`, `plastic` | `mat_vis_wall` |
  | posts | `rubber_post` | `mat_vis_post` |
  | drop targets | `target` | `mat_vis_target` |
  | pop bumpers | `bumper` | `mat_vis_bumper` |
  | slingshots | `rubber_band` | `mat_vis_sling` |
  | flippers | `flipper` | `mat_vis_flipper` |
  | Dragon | `dragon` | `mat_vis_dragon` |
  | Ramp | `ramp` | `mat_vis_ramp` |
  | plunger | (authored) | `mat_vis_plunger` |

  - Every pair of family base colours, and each family against `mat_playfield`'s base colour `(0.45, 0.30, 0.15)`, differs by at least 0.25 in at least one linear-RGB channel.
  - The script fails on a surface that maps to no family.
- **Export contract.** Every `vis_` mesh carries `uv_base` and `uv_lightmap` (TEXCOORD_1), `lightgroup: 'lg_playfield'`, exactly one material, and `playfield_root` as parent.
- **The follower.**
  - It is stateless: snapshot in, pose out, no interpolation (AD-4).
  - It is read-only towards the simulation (AD-1).
  - It resolves nodes with `getRequiredNode`, so a missing node throws with its name.
  - It derives node names from `TABLE.nodes.colFlipperL/R` and `TABLE.dropBankWiring[*].node` through the naming rule, and never from `s_…` literals (AD-16).
  - Every frame crossing goes through `src/sim/table/frames.ts` (`fromPhysics`, `toScene`). The flipper's rotation is derived from the snapshot's physics-frame `angleDeg` using the mover's own convention (tip at `(sin θ, −cos θ)`, `flipper-config.ts:108-117`) passed through `fromPhysics`. No hand-written axis flip or unit factor.
- **Drop targets.** A target that is down is translated down its own table-z height and not rendered; a target that is up sits at its authored pose, visible.
- **Plunger.** `vis_plunger` translates `posMm` toward table −Y.
- **Headers.** New source files carry the GPL-3.0 header.

**Never:**
- Edit anything under `src/sim/**`. That includes `TABLE`, `names.ts`, `frames.ts` and the snapshot.
- Change any `col_` or `sw_` object.
- Re-record a replay trajectory (`expectedHash`/`expectedGameStateHash`).
- Add any third-party asset, texture or glTF extension.
- Animate the spinner, the Dragon's mouth, or anything else beyond the three moving families. Those belong to Stories 5.4 and 5.1.
- Close DW-249, which stays with Story 5.4.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Flipper at rest | real `createLoop` snapshot, no flipper input | The image of the loader's `tipMm` under `vis_flipper_l/_r`'s local transform lies within 0.5 mm of the expected tip, and is lower (smaller table y) than the pivot. The expected tip is `fromPhysics(pivotPhys + R·(sin θ, −cos θ))` at the snapshot's `angleDeg`. All positions are measured in `playfield_root`'s local frame, converted to table mm. | none |
| Flipper held (DW-279) | `flipper_l` held until `angleDeg` settles | `vis_flipper_l`'s bbox, in `playfield_root`'s local frame, matches the `col_flipper_l` box within 0.5 mm | none |
| Target struck | real physics strike → `dropTargets[s_dragon_d] = true` | `vis_dragon_d` has its top at or below table z 0 and is not rendered; the other five stay up and visible | none |
| Bank reset | record goes back to all `false` | all six targets are back at their authored pose and visible | none |
| Plunger | `posMm` 0, then 40 (synthetic) | at the authored pose, then translated 40 mm toward table −Y | none |
| Missing twin | loaded scene with `vis_flipper_l` disposed before the first sync | `syncMechanisms` throws, naming the node | throws at the first sync; the host error panel shows it |

</intent-contract>

## Code Map

- `tools/make-placeholder-blend.py` -- the authoring source.
  - `main()` 1566+. Box helper `new_box_mesh` 1481. Materials `new_material` 1550. `set_props` 1535.
  - Flipper boxes and pivots: 1715-1733 (`left_pivot_x`, `BASE_RADIUS_MM`).
  - `WALL_H_MM = 50` at 67.
  - `bd_shooter` empty: 3286, at (498, 35, 13).
  - `vis_playfield` 3290; `vis_backbox` 3394 (the pattern to follow: material, `second_uv`, `lightgroup`).
  - Selection list 3413-3424 (cosmetic: `export.py` re-selects by prefix). Save 3436.
- `tools/export.py:95-100` -- `is_presentation_object()` sends everything except `col_`/`sw_` to the glb. Presentation meshes need 2 UV layers, a `lightgroup` and a material (120-133). collision.json is `col_`-only, sorted, `newline='\n'`, byte-stable (446-512, 597-629). Read-only.
- `tools/export-assets.mjs` -- `pnpm export:assets`. Needs `BLENDER=C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe`. Only the lightgroups `lg_playfield`, `lg_inserts` and `lg_cabinet` exist (`src/sim/table/dragonwar.ts:705`).
- `public/assets/dragonwar.collision.json` -- 103 `col_` nodes. `surface` counts: plastic 27, rubber_post 45, wood 9, target 7, dragon 4, bumper 3, ramp 3, rubber_band 2, flipper 2, glass 1. It must stay byte-identical.
- `src/sim/loop/replay.ts:150` -- `assetHash` hashes the collision document only. `assertHeaderMatchesLiveEnvironment` (247-285) throws `StaleReplayHeaderError`. Read-only.
- `src/sim/contracts/snapshot.ts:38-79` -- mechanism shapes:
  - `flippers.{l,r}.angleDeg` is the mover's physics-frame angle (`flippers.ts:179`).
  - `dropTargets` is keyed by switch; `true` means down.
  - `plunger.posMm` is always 0 (`plunger.ts:100-104`).

  Read-only.
- `src/sim/physics/flipper/flipper-config.ts:104-131` -- `angleEnd = atan2(dx, −dy)` is the committed box pose; rest is `angleEnd ± sweepDeg`, drooping toward the player. `src/sim/physics/loader/loaded-flipper.ts:30-49` holds the pivot/tip derivation. Tests may import both; presentation may not.
- `src/sim/table/frames.ts` -- `toScene` 85 (linear), `fromPhysics` (affine, with linear part `diag(k, −k, k)`). It is the only converter (AD-10). Read-only (contended with Epic 3).
- `src/sim/table/dragonwar.ts` -- `TABLE.nodes` 711-733; `dropBankWiring` 157-162 (`{switch, node: 'col_dragon_x'}`). Read-only.
- `src/presentation/scene/playfield.ts:33-51` -- `getRequiredNode`. Reuse it.
- `src/presentation/scene/balls.ts` -- `syncBalls`, the per-frame driver pattern to copy (free function plus a scene cache).
- `src/presentation/scene/create-engine.ts:334` -- `loadAndRenderOnceForTests(NullEngine, dataUrl, {pluginExtension: '.glb'}, onFrame)`.
- `src/presentation/lighting/lamp-driver.ts:4-8,274` -- `WeakMap` per-scene cache precedent.
- `src/presentation/backglass/backglass.ts:40-48` -- `BACKBOX_NODE_NAME` shows that `vis_` string constants are lint-legal (`tools/boundary-lint.mjs:97` covers only `s|c|l|f|gi|bd|shot|show`).
- `src/host/boot.ts` -- the render hook at 327-355, with `syncBalls` at 336. The `__dragonwarBoot` hatch is typed at 46-60 and assigned at 385.
- `test/ball-render.test.ts` -- the NullEngine + committed-glb + synthetic snapshot template. `test/loop.test.ts:318-331` shows how to hold a flipper through `createLoop`. `test/drop-targets.test.ts` has the real-strike harness (`bootMachine`, `driveStraight`). `test/util/snapshot-factory.ts` builds snapshots.
- `test/shot-map-legibility.test.ts` -- projects `col_` bboxes (`projectMm` 81, `MIN_LEGIBLE_NDC_SPAN` 61). The header comment at 18-19 says nothing is drawn.
- `test/asset-contract.test.ts` -- every glb mesh must carry TEXCOORD_1 and a known lightgroup (170-221); no `vis_` in collision.json (1506). It must stay green, unedited.
- `ATTRIBUTIONS.md:71-72` -- the rows for the `.blend` and `.glb`.

## Tasks & Acceptance

**Execution:**
1. `ATTRIBUTIONS.md` -- append a Story 5.0a note to rows 71 (`.blend`) and 72 (`.glb`), before the regenerated files exist. The note says: the `vis_` twins are copied from the `col_` bodies and `vis_plunger` is authored; all of it is author-made and generated by `tools/make-placeholder-blend.py` with Blender 5.2.1 on 2026-09-29; nothing is sourced. Row 73 is unchanged. -- CLAUDE.md provenance rule.
2. `tools/make-placeholder-blend.py` -- add a twin pass after every `col_` exists and before the selection list:
   - naming rule, exclusions, family map, `topOffsetMm`, the height cap and the merged `vis_dragon`;
   - flipper twins with their origin at the pivot;
   - nine `mat_vis_*` materials;
   - `vis_plunger`: a box on `bd_shooter`'s x (±5 mm), y from −40 to `bd_shooter.y − ballRadius`, z 3-23, all authored constants with comments;
   - add every twin to `presentation_objects`.

   Then run `blender --background --factory-startup --python tools/make-placeholder-blend.py` and `pnpm export:assets`. -- DW-279; same source, cannot drift.
3. `src/presentation/scene/vis-names.ts` (new) -- export `visTwinName(colName)` (`col_x` → `vis_x`), `VIS_DRAGON_NODE_NAME` and `VIS_PLUNGER_NODE_NAME`. -- one naming rule shared by the follower, the tests and later stories.
4. `src/presentation/mechanisms/sync-mechanisms.ts` (new; delete the `.gitkeep`) -- `syncMechanisms(scene, playfieldRoot, snapshot)` per the Always rules. -- DW-279, the moving half.
5. `src/presentation/scene/node-screen-rect.ts` (new) -- `nodeScreenRect(scene, name)` returns the node's world bbox projected through the active camera, as canvas-pixel `{x0, y0, x1, y1}`. -- lets the browser smoke locate each body.
6. `src/host/boot.ts` -- call `syncMechanisms(scene, nodes.playfieldRoot, latestSnapshot)` beside `syncBalls`. Keep the scene reference and expose `nodeScreenRect(name)` on `window.__dragonwarBoot`, typed in the `declare global` block. -- Integration consumer. This is a footprint extension (`src/host/**`, uncontended); report it.
7. `test/placeholder-geometry.test.ts` (new) -- reads only the committed glb JSON chunk and collision.json. No Blender needed. It proves AC 1 and AC 3's byte-identity guard, and the authored colour separation.
8. `test/mechanisms-follow.test.ts` (new) -- NullEngine plus the committed glb, fed real `createLoop` / physics snapshots. Covers every I/O matrix row, and `nodeScreenRect` returns a finite rect inside the canvas for `vis_dragon`. -- Rule 3's headless real-runtime artifact.
9. `test/shot-map-legibility.test.ts` -- keep every existing `col_` assertion. Add the same NDC-inside and `MIN_LEGIBLE_NDC_SPAN` checks against each feature's loaded `vis_` twin world bbox, and update the header comment at 18-19. -- strengthened, not weakened.

**Acceptance Criteria:**
- **AC 1.** Given the exported model, when `test/placeholder-geometry.test.ts` reads the glb and collision.json:
  - every `col_` body outside the exclusion rule has exactly one `vis_` node under the naming rule;
  - that node's table-frame x/y bbox matches within 0.01 mm, and its z range follows the cap rule;
  - its material is its surface's family material, and it carries TEXCOORD_1 and `lg_playfield`;
  - the set of bodies without a twin equals the exclusion rule exactly;
  - `vis_flipper_l/_r` node translations equal the loader-derived pivots (DW-279).
- **AC 2.** Given real physics snapshots, when `syncMechanisms` runs on the loaded scene, then every I/O matrix row holds (DW-279; the visible half of DW-249).
- **AC 3.** Given the new visuals, when the export has been re-run:
  - `git diff --exit-code -- public/assets/dragonwar.collision.json test/replays` is empty;
  - `test/replay-goldens.test.ts` passes, with no golden field moved (no `assetHash` refresh needed, because `assetHash` covers collision.json only).
- **AC 4 (Integration).** Given Attract in a real browser (the WebGL2 fallback is expected, DW-57), when the lead's in-page capture samples `#render-canvas`, then:
  - each of the nine families' representative regions (the central 50% of `nodeScreenRect`) has a mean RGB that differs from an adjacent playfield-only region, and from every other family, by more than Δ;
  - two playfield-only regions differ by less than Δ (the negative control);
  - holding the left flipper button changes `vis_flipper_l`'s region, which shows that consumer `host/boot.ts` drives `syncMechanisms`.

## Design Notes

**Governing ADs:**
- AD-1: presentation is read-only towards the simulation.
- AD-4: render the latest snapshot, with no interpolation.
- AD-10: `frames.ts` is the only converter.
- AD-11: the node prefixes; `vis_` is non-collidable; `TEXCOORD_1` and `lightgroup`.
- AD-12: lightgroups and the UV2 contract.
- AD-15: collision-only `assetHash`; the NullEngine tier.
- AD-16: the boundary lint and headers.
- AD-17: the hatch performs no network access.

**Why copy the mesh.** `obj.data.copy()` of the `col_` object is the literal "same authoring source". The test then proves the correspondence from the exported artifacts, never from the script text. Family comes from `surface`, a property the collision document already carries, so the test can check it independently.

**Budgets.** The 500–2,000 triangle budget (VPE reference) governs art objects. Placeholders stay far under its ceiling (12–28 triangles each), and the floor is not a performance requirement. About 88 added meshes sit well inside the 2.75 MB `check:size` budget.

**Integration ACs:**
- Consumed-by:
  - 5.1: replaces `vis_dragon`.
  - 5.2: playfield material; the twins sit on `vis_playfield`.
  - 5.3: `col_glass` is left for it.
  - 5.4: replaces the `vis_` mechanisms and extends `syncMechanisms` with the spinner angle and plunger travel.
- Consumes: `Snapshot.mechanisms` (sim/contracts), `TABLE.nodes` and `dropBankWiring` (sim/table), and `frames.ts`.

**Rule 20 candidate (for the lead):** the naming rule, the exclusion rule and the surface→family map are a convention that 5.1–5.4 build on, so they are a Consistency Conventions row.

**Footprint extensions:** `src/host/boot.ts` and three test files under `test/`. No contended path is touched.

**DW-279:** addressed by Tasks 2–9 and AC 1, 2 and 4.

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions` -- expected: all green.
- `pnpm test` -- expected: the full suite green, including `asset-contract`, `replay-goldens`, `scene-smoke`, `shot-map-legibility` and the two new files.
- `git diff --exit-code -- public/assets/dragonwar.collision.json test/replays` -- expected: exit 0.
- `pnpm build && pnpm check:dist && pnpm check:size` -- expected: within budget.

**Mutations (Rule 19; apply, observe red, revert, confirm that `git status --short` and `git diff --stat` are unchanged):**
- AC 1: `mutation: rename vis_post_sling_l to a same-length name inside the glb JSON chunk → test/placeholder-geometry.test.ts red (missing twin)`. Also shift one twin's accessor `max` digit → pose assertion red.
- AC 2: `mutation: negate the flipper rotation in sync-mechanisms.ts → test/mechanisms-follow.test.ts rest-tip case red`. Also skip the drop-target translation → target-down case red.
- AC 3: `mutation: change one coordinate digit in public/assets/dragonwar.collision.json → test/replay-goldens.test.ts red (StaleReplayHeaderError)`.
- AC 4, headless: `mutation: set mat_vis_post's base colour equal to mat_vis_wall's → placeholder-geometry colour-separation red`.

**Manual checks (lead, AC 4):** `pnpm dev --port 5185 --strictPort` (Epic 5's port; Epic 3 uses 5183 on the same machine -- verify the server serves THIS worktree before trusting it), press to begin, stay in Attract. Inside one `evaluate`, an rAF sampler `drawImage`s `#render-canvas` and averages the RGB over each `nodeScreenRect` region.
- **Measure first:** capture the same regions on 5 consecutive frames. Set Δ = 5 × the largest per-channel standard deviation observed, floored at 1 level. Record the measured means, the noise and Δ here before claiming a pass.
- The negative control (two playfield-only regions below Δ) is the check's own falsifier.
- **Representative node per family:** pick one node whose projected footprint fills most of its screen rect (an axis-aligned wall segment, a post, a target, a bumper, a sling, a flipper, `vis_dragon`, a Ramp segment, `vis_plunger`); a diagonal thin wall's rect is mostly playfield and is not a fair sample. Record the node chosen per family with the measured means.
- Then hold the left flipper (`KeyboardEvent`) and re-sample `vis_flipper_l`.

## Spec Change Log

- 2026-09-29 (lead spec gate, epic-runner-5): Manual-check dev-server port 5180 -> 5185 (Epic 5's assigned port; 5183 is Epic 3's). Added the representative-node rule to AC 4's manual check. Rule 20: the naming/exclusion/family rule this spec defines was written into the spine as the Consistency Conventions row 'Visible placeholders'. Lead measurement recorded at the gate: `assetHash()` (src/sim/loop/replay.ts:150) hashes the collision document only, so AC 3 expects NO golden field to move, not even the header.

## Review Triage Log

## Auto Run Result

Status: ready-for-dev
Blocking condition: none
