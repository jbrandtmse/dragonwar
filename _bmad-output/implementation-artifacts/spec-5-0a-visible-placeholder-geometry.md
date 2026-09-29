---
title: 'Story 5.0a: Visible placeholder geometry'
type: 'feature'
created: '2026-09-29'
status: 'done'
baseline_revision: '3c5c41b61f318b73f45a57ed877cda6402177541'
baseline_commit: '3c5c41b61f318b73f45a57ed877cda6402177541'
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
  - summary: >-
      The boot.ts render-hook wiring of the mechanism twins has no automated test; only the lead's AC 4 browser check would catch its removal.
    evidence: |-
      src/host/boot.ts calls resolveMechanismNodes() before the latestSnapshot guard and syncMechanisms() after syncBalls(). boot.ts is allowlisted as unreached in test/module-coverage.test.ts (DOM + WebGL2 by design). Deleting the syncMechanisms call, or moving resolveMechanismNodes below the guard (turning a missing twin into an uncaught render-loop error instead of the error panel), leaves every automated test green. AC 4's "hold the left flipper changes vis_flipper_l's region" is the only falsifier. A cheap partial: a loadAndRenderOnceForTests(..., onFrame) test asserting that a missing vis_flipper_l rejects the first-frame promise naming it.
    location: >-
      src/host/boot.ts:356
    severity: medium
  - summary: >-
      vis_dragon_bank_backstop takes the target colour under the mechanical surface-to-family rule and sits directly behind the six drop targets, so a dropped target may be barely visible on screen.
    evidence: |-
      col_dragon_bank_backstop carries surface 'target' (x 202.4-286.4, y 708-723, z 0-50), so its twin gets mat_vis_target red and the target family's 52 mm top. The six targets are at y 700-708, with the same red and the same 52 mm top. When a target drops (hidden and lowered, as specified), the camera sees the backstop's red south face 8 mm further back in the same place. This is spec-bound: the intent's Always rule takes the family from surface, and AC 1 pins mat_vis_target on the backstop. Fixing it (for example, static target-surface bodies take the wall family) amends the spine's "Visible placeholders" convention, so it is a product call for the decision sheet or Story 5.4. Settle it with the lead's AC 4 browser session by striking a target and sampling nodeScreenRect('vis_dragon_d') before and after.
    location: >-
      tools/make-placeholder-blend.py (VIS_FAMILY_BY_SURFACE); public/assets/dragonwar.glb vis_dragon_bank_backstop
    severity: medium
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
  - [AMENDED 2026-09-29 -- see the story change log] **Exception:** a `target`-surface body that is not a drop target (not a `node` in `TABLE.dropBankWiring`) -- at this tree only `col_dragon_bank_backstop` -- takes the walls-and-guides family (`mat_vis_wall`, the wall family's top offset), so a dropped target reveals a different colour behind it (DW-294).
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

### Review Findings

Code review 2026-09-29 (`bmad-code-review`, review tier `full-opus`; layers blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor; worktree `C:/git/dragonwar/.worktrees/epic-5`). 37 raw rows -> 19 entries: high 0, medium 2, low 13, false 4. Decision-needed 0, patch 7 (all applied), defer 1, rejected 11.

- [x] [Review][Patch] DW-294 amendment not built: script, glb and test still gave `vis_dragon_bank_backstop` `mat_vis_target` (medium; fix-risk low -- one family branch plus a regenerate, collision untouched) [tools/make-placeholder-blend.py:1767] -- `add_visible_twins()` now takes the bank's `col_dragon_<letter>` names (from `DRAGON_LETTERS`, the same nodes as `TABLE.dropBankWiring`) and maps any other `target`-surface body to `wall`, failing loudly if a named drop target is not a visible target body. Regenerated the `.blend` and re-exported: the glb's ONLY `vis_` change is the backstop, `mat_vis_target` top 52 mm -> `mat_vis_wall` top 50 mm (node set, node count, BIN length unchanged). `test/placeholder-geometry.test.ts` derives drop-target membership from `TABLE.dropBankWiring` (`familyOf()`), and a new DW-294 case pins both halves. `git diff --exit-code -- public/assets/dragonwar.collision.json test/replays src/sim` exit 0. Sources: all four layers.
- [x] [Review][Patch] AC 4's lead measurement lives only in the cycle log, and predates the DW-294 regenerate (low; fix-risk low -- tracking-section note) [spec ## Verification] -- recorded below under Manual checks, with the backstop re-sample flagged for the smoke gate.
- [x] [Review][Patch] `nodeScreenRect` hatch scan: `hatchEnd` never checked against -1, so the slice could scan the rest of `boot.ts` (low; fix-risk low) [test/boot-mechanisms-wiring.test.ts:133]
- [x] [Review][Patch] `WALL_H_MM` doc comment claimed a witness that does not exist (low; fix-risk low) [test/placeholder-geometry.test.ts:52] -- reworded to the real witness, the 400 mm walls' cap assertion.
- [x] [Review][Patch] Test header's coplanar-top mutation disagreed with the recorded one (low; fix-risk low) [test/placeholder-geometry.test.ts:35] -- now names the recorded `vis_post_divider_l_hi` mutation and the new DW-294 mutation.
- [x] [Review][Patch] `add_visible_twins()` docstring said it returns the twins; it returns `(twins, materials)` (low; fix-risk low) [tools/make-placeholder-blend.py:1732]
- [x] [Review][Patch] The Story 5.0a provenance notes did not name the AI tool, as CLAUDE.md's generated-asset rule and the `font.ts` row's precedent require (low; fix-risk low) [ATTRIBUTIONS.md:71-72] -- both notes now name the project's AI-assisted pipeline (Claude Code). `pnpm check:attributions` green.
- [x] [Review][Defer] `boot.ts`'s render-hook wiring is pinned only by a comment-stripped source scan; no executed test runs `boot.ts`'s own hook, and `bootShapedHook`'s post-guard lines never execute (medium; fix-risk high -- needs a real-runtime host test harness the project does not have) [src/host/boot.ts:356] -- deferred: same root cause as DW-100 (no real-runtime DOM test host for `host/**`, routed to 6-6); ledger `occurrence=5-0a-visible-placeholder-geometry` appended. Compensating evidence: the lead's AC 4 browser run with the `syncMechanisms` call disabled froze `vis_flipper_l` (mutation observed). DW-293's residual for the lead's adjudication: QA's scan closes "deleted call" and "resolve below the guard"; a semantically-dead but textually-present call is not caught.

**Rejected:**
- low: spec and ledger records are stale (frontmatter `deferred:` still lists DW-293/DW-294 as open, Auto Run Result counts predate QA, `followup_review_recommended`, `med` vs `medium` vocabulary, spec `status: done` vs sprint `review`). Fixing them edits the spec's build-owned sections; ledger status is the lead's `ledger_adjudicated` gate; spec `done` is build-auto's contract, and sprint `review` is correct at this stage.
- low: the source-scan comment stripper keeps trailing `//` comments, so `x(); // syncMechanisms(...)` would pass. Nobody comments out a call that way in everyday use, and the fix is a tokenizer.
- low: the drop distance assumes a twin with identity rotation/scale. Every twin is authored identity (the pose case asserts no rotation or scale). It becomes real only if an art pass (5.4) replaces a target with a rotated or scaled node, and 5.4 owns the follower's extension. A guard would add a branch.
- low: test I/O helpers (`glbDataUrl`, `renameGlbNode`, the glb JSON reader) are duplicated across three test files. No caller diverges today; the fix is a refactor.
- low: the `nodeScreenRect` hatch called in the WebGPU-to-WebGL2 fallback window reads a disposed scene. It is a dev-only hatch, the window lasts only until the rebuilt scene's first frame, and the fix is a guard.
- low: a twin name colliding with an existing object would be renamed `.001` by Blender. No `col_` name at this tree maps onto an existing `vis_` except the excluded `col_playfield`, and AC 1's "exists exactly once" case reddens on a renamed twin. The fix is a guard.
- low: `visTwinName()` does not carry the dragon merge. Spec task 3 defines it as `col_x -> vis_x`, with `VIS_DRAGON_NODE_NAME` as the separate constant. Spec-bound.
- false: a missing snapshot key silently leaves a target up. The sim's `dropTargets` record and the follower both derive from `TABLE.dropBankWiring` (`drop-targets.ts:190`, `sync-mechanisms.ts:131`), so the keys cannot diverge.
- false: the "90 bodies -> 87 twins" case cannot fail. It pins the spec's count against the collision document (input drift). AC 1's pinning test is the exactly-once case, which has a recorded mutation.
- false: AC 1's pivot clause has no `mutation:` line. Rule 19 asks for one demonstrated mutation per AC, not per assertion. AC 1 has several.
- false: the QA test file is untracked, so its licence header was never checked. Line 1 carries the project header verbatim, and `pnpm check:headers` will cover it once the lead stages it.

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
- Added at review (2026-09-29), each applied, observed red and reverted from a byte copy (tree identical after):
  - AC 1 (cap rule's purpose): `mutation: lower vis_post_divider_l_hi's POSITION accessor top 0.053 -> 0.050 inside the glb JSON chunk → placeholder-geometry coplanar-top case red (vis_guide_divider_l vs vis_post_divider_l_hi, gap 7e-7 < 0.1)`.
  - AC 2 (statelessness across frames): `mutation: base each pose on the node's CURRENT pose in sync-mechanisms.ts (flipper rotationQuaternion, drop-target position, plunger position) → mechanisms-follow rest-tip (103.9 mm off), held (5.1 mm), target-struck (top -52 vs floor 0) and plunger (-120 vs -80) cases red`.
  - AC 4 headless (`nodeScreenRect` orientation): `mutation: flip node-screen-rect.ts to a bottom-left pixel origin (y := renderHeight - y) → mechanisms-follow nodeScreenRect case red (vis_flipper_l above vis_dragon)`.
- Added at QA (2026-09-29), each applied, observed red and reverted from a byte copy (`git status --short` and `git diff --stat` identical after):
  - (QA) new test file: `test/boot-mechanisms-wiring.test.ts` -- DW-293: a comment-stripped source scan of `src/host/boot.ts`'s `bootScene()` render hook, plus the first-frame contract that hook's ordering relies on, through the same `loadAndRenderOnce()` (NullEngine + committed glb, `vis_flipper_l` renamed out).
  - AC 4 integration / task 6 (boot drives the twins): `mutation: comment out boot.ts's syncMechanisms(scene, nodes.playfieldRoot, latestSnapshot) call → boot-mechanisms-wiring "syncMechanisms(...) runs inside the hook AFTER the latestSnapshot guard" red (call not found)`.
  - I/O row "Missing twin" (host error panel half): `mutation: move boot.ts's resolveMechanismNodes(scene, nodes.playfieldRoot) below the if (!latestSnapshot) guard → boot-mechanisms-wiring "resolveMechanismNodes(...) runs inside the hook BEFORE the latestSnapshot guard" red (69 not < 26)`. The same file's negative control shows this ordering is load-bearing: with the resolve below the guard, a glb missing vis_flipper_l boots without a first-frame error.
  - I/O row "Missing twin" (first-frame rejection names the node): `mutation: make requireMechanismMesh() in sync-mechanisms.ts return undefined for a missing node → boot-mechanisms-wiring "Missing twin ... rejects the first-frame promise naming vis_flipper_l" red (got a TypeError without the name)`.
  - Task 6 (`nodeScreenRect` hatch): `mutation: delete boot.ts's liveScene = scene; → boot-mechanisms-wiring "the hook captures liveScene" red`.
  - I/O row "Bank reset" (audit of an existing assertion that had never been seen red on its own): `mutation: sync-mechanisms.ts sets isVisible only when down (never restores it) → mechanisms-follow "Target struck ... Bank reset" red at "vis_dragon_d: visible after the reset"`.
  - I/O row "Plunger" (direction, audit): `mutation: sync-mechanisms.ts translates +posMm instead of -posMm along table Y → mechanisms-follow Plunger case red (min.y 0.000 vs -80.000)`.
- Added at code review (2026-09-29), applied, observed red and reverted from a byte copy (`git status --short` and `git diff --stat` identical after):
  - AC 1 (amended family rule, DW-294): `mutation: set vis_dragon_bank_backstop's primitive material back to mat_vis_target inside the glb JSON chunk → placeholder-geometry "DW-294: every drop target ... the bank backstop is drawn as a wall" red, and the family-material case red (expected 'mat_vis_target' to be 'mat_vis_wall')`.

**Manual checks (lead, AC 4):** `pnpm dev --port 5185 --strictPort` (Epic 5's port; Epic 3 uses 5183 on the same machine -- verify the server serves THIS worktree before trusting it), press to begin, stay in Attract. Inside one `evaluate`, an rAF sampler `drawImage`s `#render-canvas` and averages the RGB over each `nodeScreenRect` region.
- **Measure first:** capture the same regions on 5 consecutive frames. Set Δ = 5 × the largest per-channel standard deviation observed, floored at 1 level. Record the measured means, the noise and Δ here before claiming a pass.
- The negative control (two playfield-only regions below Δ) is the check's own falsifier.
- **Representative node per family:** pick one node whose projected footprint fills most of its screen rect (an axis-aligned wall segment, a post, a target, a bumper, a sling, a flipper, `vis_dragon`, a Ramp segment, `vis_plunger`); a diagonal thin wall's rect is mostly playfield and is not a fair sample. Record the node chosen per family with the measured means.
- Then hold the left flipper (`KeyboardEvent`) and re-sample `vis_flipper_l`.
- **Recorded (lead AD gate, 2026-09-29T11:17:40Z, port 5185, WebGL2; copied at code review from `cycle-log-epic-5.md`):** noise SD 0 over 5 frames, so Δ = 1 level (floor). Negative control: two playfield regions identical at (146,125,103). Family centres: wall (194,201,215); post (`vis_post_pocket_l`) (36,36,36); target (165,55,45); bumper (61,84,170); sling (165,154,56); flipper (251,251,251); dragon (77,175,92); ramp (214,124,234); plunger (248,179,65). Smallest pair gap: wall vs flipper, 57 levels. Flipper hold moved `vis_flipper_l`'s rect (884,664,934,723 -> 887,667,946,690). Mutation: with boot.ts's `syncMechanisms` call disabled, the rect stayed frozen under the hold (red), then was reverted. **This measurement predates the DW-294 regenerate.** The smoke gate should re-sample the drop-target versus backstop pair on the regenerated glb: strike a target and sample `vis_dragon_d`'s rect before and after. The backstop's south face should now read the wall colour, not (165,55,45).

## Spec Change Log

- 2026-09-29 (lead, after dev_complete, Rule 5 apply-and-report, intent-preserving): DW-294. Original: every twin's family comes from its body's `surface`. Amended: a non-drop-target `target`-surface body (`col_dragon_bank_backstop`) takes the walls-and-guides family. Why: the lead's browser measurement (port 5185, in-page rAF sampler) read the drop targets' south faces and the backstop's south face at the identical colour (165,55,45), so a dropped target revealed exactly the colour it hid -- AC 2's promise 'a dropped target is shown down' was not observable to a player. The spine's 'Visible placeholders' convention row is amended in the same commit. AC 1's material assertion for the backstop follows the amended rule.

- 2026-09-29 (lead spec gate, epic-runner-5): Manual-check dev-server port 5180 -> 5185 (Epic 5's assigned port; 5183 is Epic 3's). Added the representative-node rule to AC 4's manual check. Rule 20: the naming/exclusion/family rule this spec defines was written into the spine as the Consistency Conventions row 'Visible placeholders'. Lead measurement recorded at the gate: `assetHash()` (src/sim/loop/replay.ts:150) hashes the collision document only, so AC 3 expects NO golden field to move, not even the header.
- 2026-09-29 (implement, 5-0a-visible-placeholder-geometry-implement): no path outside the footprint was touched; `src/presentation/mechanisms/.gitkeep` deleted per task 4. Decisions made inside the Always rules, recorded for review:
  - `topOffsetMm`: wall 0.0, ramp 0.4, dragon 0.8, sling 1.2, bumper 1.6, target 2.0, post 3.0, flipper 0.0. The flipper is 0.0 because the 20 mm bats are never coplanar with any 50 mm family's top, and it keeps the "Flipper held" row's bbox equal to `col_flipper_l` in z as well as x/y.
  - Family colours (linear RGB): wall (0.55, 0.60, 0.70), post (0.03, 0.03, 0.03), target (0.90, 0.08, 0.05), bumper (0.10, 0.20, 0.95), sling (0.95, 0.80, 0.05), flipper (0.98, 0.98, 0.98), dragon (0.10, 0.65, 0.15), ramp (0.70, 0.20, 0.85), plunger (0.95, 0.45, 0.02). The script asserts the 0.25 separation at authoring time; the test re-asserts it from the glb.
  - `bd_shooter`'s literal pose became the named `BD_SHOOTER_POS_MM` (same values) so `vis_plunger` derives from it. `vis_plunger`: x 493-503, y -40 to 21.505, z 3-23.
  - `sync-mechanisms.ts` also exports `resolveMechanismNodes()`. `boot.ts` calls it on every render frame before the `latestSnapshot` guard (cached per scene), so a glb missing a twin fails inside `loadAndRenderOnce()`'s first-frame guard and reaches the error panel (I/O row "Missing twin"), not an uncaught render-loop error. `boot.ts` names the scene type as `Parameters<typeof nodeScreenRect>[0]` so `host/` gains no direct `@babylonjs/*` import.
  - Flipper rotation: angle between the twin's authored tip direction (its local bbox centre, origin = pivot) and `toScene(fromPhysics(sin theta, -cos theta) - fromPhysics(0))`, about `toScene(table +Z)`; degrees go through Babylon's `Angle.FromDegrees`. A drop target's drop is its own bbox extent along that same axis.
  - Mutations (Rule 19) were run as written. The AC 4 headless colour mutation was applied to the glb's JSON chunk (`mat_vis_post.baseColorFactor := mat_vis_wall`'s) rather than through a re-export; the test reads the same field either way. Observed red: missing twin (`vis_post_sling_l`), pose (`max.x` +1 mm), colour separation (0 < 0.25), rest tip (103.9 mm off), target down (top 52.0 mm), and `replay-goldens` 35 failures with `StaleReplayHeaderError`. Every mutation was reverted from byte copies; `git status --short` and `git diff --stat` were unchanged.

## Review Triage Log

### 2026-09-29 — Review pass
- verdicts: 34 findings — high 0, medium 9, low 18, false 7, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind Hunter: ATTRIBUTIONS.md rows 71/72 Date column still reads 2026-09-01 to 2026-09-07 though both rows now record a 2026-09-29 regeneration. Fixed: both Date cells read `2026-09-01 to 2026-09-29`; `pnpm check:attributions` green.
  - `[false]` `[reject]` Blind Hunter: the .glb row's note names the wrong tool. The note says the story "re-exported it", and says the twins were generated by `tools/make-placeholder-blend.py`, which is what task 1 prescribes and is true: the seeding script authors the geometry and `export.py` (the row's Tool column) exports it.
  - `[low]` `[reject]` Blind Hunter: vis_plunger extends to y -40, past vis_playfield's y=0 edge, where there is no apron mesh. Spec-bound: task 2 authors "y from -40", and the fix would edit this build's spec. It is also cosmetic, placeholder only. AC 4 residual: the lead's plunger sample should use the on-board part of its rect.
  - `[low]` `[reject]` Blind Hunter: on a WebGPU-capable browser, a missing twin is first reported as a WebGPU render failure before the WebGL2 retry. Verified in create-engine.ts:388-432. The retry fails the same way and bootScene rejects, so the error panel still shows the node name, which satisfies the matrix row. This is the existing behaviour for every first-frame glb-contract failure. Fixing it means tagging error types in create-engine, which is added complexity for a developer-only path.
  - `[low]` `[reject]` Blind Hunter: the bats show their authored end-of-stroke pose until the first snapshot arrives. The window is only the frames before the host loop's first output (created just before bootScene), the same window in which balls are not yet synced. Posing without a snapshot would add a branch for a transient that lasts a frame or two.
  - `[low]` `[reject]` Blind Hunter: _cap_twin_heights compares against a floor rounded to 4 decimals with a 1e-6 epsilon, and a body floored at or above WALL_H_MM would invert. Theoretical at this tree: every visible body floors at z 0, and the only z-400 body, col_glass, is excluded. AC 1's z-floor assertion (within 0.01 mm of zLow) would redden on either case in the exported artifact.
  - `[false]` `[reject]` Blind Hunter: the merged vis_dragon floor comes from the lowest body, so higher bodies are distorted. All four dragon bodies floor at z 0 (collision.json bboxMm.min.z), so no body sits above the shared floor.
  - `[low]` `[reject]` Blind Hunter: _world_bbox_mm divides by MM where export.py multiplies by 1000 and uses BBOX_ROUND, so they could drift. Both round to 4 decimals today, and the exported-artifact case "the set without a twin equals the exclusion rule exactly" would redden on any divergence at the max.y <= 0 edge.
  - `[false]` `[reject]` Blind Hunter: twin baking double-applies playfield_root's transform. playfield_root is authored at (0, 0, 0) with no rotation (make-placeholder-blend.py:1822), so there is no parent transform to apply twice. The x/y 0.01 mm pose case would catch a moved root.
  - `[medium]` `[patch]` Blind Hunter: the coplanar-top purpose of topOffsetMm is never tested (all-zero offsets pass). Fixed: new placeholder-geometry case asserting every cross-family pair of twins with overlapping x/y footprints has tops at least 0.1 mm apart (40 pairs at this tree). Mutation recorded in Verification.
  - `[low]` `[patch]` Blind Hunter: the vis_plunger test checks only centre x and tip y. Fixed: it now also asserts the 10 mm width, the -40 mm south end, and the z band 3-23 mm.
  - `[medium]` `[patch]` Blind Hunter: nodeScreenRect's orientation is unchecked; a y-flipped rect passes. Fixed: the nodeScreenRect case now asserts both flipper rects lie below vis_dragon's rect and that the left flipper is left of the right one. Mutation recorded.
  - `[low]` `[patch]` Blind Hunter: placeholder-geometry's header claims an "AC 3 byte-identity guard" it cannot provide. Fixed: the header now says it is the collision-document/assetHash guard and that byte identity is the Verification git-diff command.
  - `[low]` `[reject]` Blind Hunter: the new legibility case skips bumper, sling, post and plunger twins. Spec-bound: task 9 applies the checks to "each feature's" twins, meaning the existing FEATURES list. AC 4 covers all nine families in the browser.
  - `[low]` `[reject]` Blind Hunter: the dragon naming exception is restated in three test sites instead of a shared helper. The tests restate the rule independently on purpose, as an oracle. A `visTwinNameFor` helper adds public surface and names no caller that would diverge.
  - `[low]` `[reject]` Blind Hunter: syncMechanisms allocates about 30 small Vector3/Quaternion objects per frame. Negligible at 11 nodes, and it matches balls.ts's per-frame pattern.
  - `[false]` `[reject]` Blind Hunter: the spec's status and Auto Run Result are inconsistent and verification results are missing. That is mid-run state; this finalize writes both. The fix would also edit this build's spec.
  - `[low]` `[reject]` Edge Case Hunter: vis_dragon's AABB rect is about 40% lock-lane playfield, which dilutes AC 4's mean RGB. Spec-bound: AC 4 defines the sample as the central 50% of nodeScreenRect. Recorded as a residual risk for the lead's measurement.
  - `[low]` `[reject]` Edge Case Hunter: nodeScreenRect returns a rect for a hidden mesh (a down target). The only consumer, the lead's AC 4 capture, samples in Attract with every target up. A guard adds a branch for a case nobody calls.
  - `[low]` `[reject]` Edge Case Hunter: bbox corners behind the camera or outside the frustum give out-of-canvas coordinates. The camera is fixed and every feature twin projects inside NDC (the shot-map-legibility twin case). Theoretical.
  - `[low]` `[reject]` Edge Case Hunter: a body floored at or above WALL_H_MM inverts. Same root cause as the _cap_twin_heights row above: none exists at this tree, and AC 1's z-floor assertion guards it.
  - `[false]` `[reject]` Edge Case Hunter: a zero in-plane tip direction would freeze the flipper. The flipper box is about 100 mm long against a 12.5 mm half-width, so the bbox centre is far from the pivot. The rest-tip case measures a real 103.9 mm swing under the negation mutation.
  - `[low]` `[reject]` Edge Case Hunter: the per-scene cache ignores the playfieldRoot argument and later disposal. One scene has exactly one playfield_root, and no code path disposes a twin mid-scene. Theoretical.
  - `[low]` `[reject]` Edge Case Hunter: a missing twin triggers a spurious WebGPU fallback. Same root cause as the Blind Hunter WebGPU row; rejected on the same evidence.
  - `[medium]` `[patch]` Verification Gap: nothing checks that syncMechanisms is stable across repeated calls, so accumulating onto the current pose would pass. Fixed: rest-tip syncs three times, held syncs rest, held, held, struck syncs twice and asserts the drop equals exactly its own height, and the plunger syncs 40 twice. The accumulation mutation reddens all four cases.
  - `[medium]` `[patch]` Verification Gap: nodeScreenRect's top-left origin is never checked. Same root cause as the Blind Hunter orientation row; fixed by the same orientation assertions.
  - `[medium]` `[defer]` Verification Gap: the boot.ts per-frame wiring (the syncMechanisms call and the eager resolve) is checked only by the manual AC 4. boot.ts has no test host by design (the module-coverage allowlist). Added to frontmatter `deferred:`.
  - `[false]` `[reject]` Verification Gap: AC sub-clauses and matrix rows lack their own mutation lines. Rule 19 requires one demonstrated mutation per AC, not per assertion. AC 1, AC 2, AC 3 and AC 4-headless each carry one (now more). AC 4's browser half is the lead's check, with its own negative control.
  - `[medium]` `[patch]` Verification Gap: distinct top offsets between overlapping families are unpinned. Same root cause as the Blind Hunter coplanar row; fixed by the same case.
  - `[low]` `[reject]` Verification Gap (other): a missing twin is misreported as a WebGPU failure. Same root cause as the Blind Hunter WebGPU row; rejected on the same evidence.
  - `[false]` `[reject]` Intent Alignment: no automated test measures rendered pixels, which is where the Problem statement lives. By design: the spec gives AC 4's rendered check to the lead, and this stage is forbidden a browser. The headless tier covers the glb contract and scene-graph poses.
  - `[medium]` `[defer]` Intent Alignment: the boot.ts wiring is untested. Same root cause as the Verification Gap boot.ts row; deferred there.
  - `[medium]` `[defer]` Intent Alignment: the static vis_dragon_bank_backstop is target-red, has the same 52 mm top and sits right behind the six targets, so a dropped target may not read on screen. Verified from collision.json (backstop y 708-723, targets y 700-708, both surface target). Spec-bound product call: the intent mandates family from surface, and the fix amends the spine convention. Added to frontmatter `deferred:` for the decision sheet or Story 5.4.
  - `[medium]` `[reject]` Intent Alignment: vis_plunger is static in real play because posMm is hard-wired 0. Duplicate of the frontmatter `deferred:` entry already recorded at the spec gate (src/sim/physics/plunger.ts:100).

## Auto Run Result

Status: done
Blocking condition: none

**Summary.** DW-279's visible placeholder pass is in place. `tools/make-placeholder-blend.py` now copies every visible `col_` body's own mesh into a flat-shaded `vis_` twin: 87 twins, the four dragon bodies merged into `vis_dragon`, nine `mat_vis_*` family materials, the height cap plus per-family top offsets, and flipper twins with their origin at the pivot. It also authors `vis_plunger`. The `.blend` and `.glb` were regenerated. A new stateless follower, `syncMechanisms`, poses the flipper, drop-target and plunger twins from each snapshot, and `src/host/boot.ts` calls it every frame. `nodeScreenRect` is exposed on `window.__dragonwarBoot` for the lead's AC 4 capture. Collision, `TABLE` and every replay golden are unchanged.

**Files changed:**
- `ATTRIBUTIONS.md` -- Story 5.0a provenance note on the `.blend` and `.glb` rows (author-made, Blender 5.2.1, 2026-09-29, nothing sourced); Date cells extended to 2026-09-29.
- `tools/make-placeholder-blend.py` -- the twin pass (`add_visible_twins`, `add_visible_plunger`), the family, colour and offset tables, the authoring-time colour-separation guard, and `BD_SHOOTER_POS_MM`.
- `assets/src/dragonwar.blend`, `public/assets/dragonwar.glb` -- regenerated (glb 49 KB to 259 KB, 88 new `vis_` nodes). `dragonwar.collision.json` is byte-identical.
- `src/presentation/scene/vis-names.ts` (new) -- the naming rule: `visTwinName`, `VIS_DRAGON_NODE_NAME`, `VIS_PLUNGER_NODE_NAME`.
- `src/presentation/mechanisms/sync-mechanisms.ts` (new; `.gitkeep` deleted) -- `syncMechanisms` and `resolveMechanismNodes`.
- `src/presentation/scene/node-screen-rect.ts` (new) -- `nodeScreenRect(scene, name)`, a canvas-pixel rect with a top-left origin.
- `src/host/boot.ts` -- footprint extension (planned, uncontended): an eager resolve and a `syncMechanisms` call in the render hook, plus the `nodeScreenRect` hatch.
- `test/placeholder-geometry.test.ts` (new) -- AC 1, the colour separation, the cross-family coplanar-top pin, and AC 3's `assetHash` guard, all from the exported artifacts.
- `test/mechanisms-follow.test.ts` (new) -- every I/O matrix row against real snapshots on NullEngine plus the committed glb, the repeated-sync stability checks, and `nodeScreenRect`'s bounds and orientation.
- `test/shot-map-legibility.test.ts` -- the same NDC and `MIN_LEGIBLE_NDC_SPAN` checks, applied to each feature's loaded `vis_` twins; header updated.

**Review findings (one pass, 34 findings: high 0, medium 9, low 18, false 7):**
- **Patches applied (6 entries):**
  - medium: the cross-family coplanar-top pin; the `nodeScreenRect` orientation check; the repeated-sync stability checks.
  - low: the ATTRIBUTIONS Date cells; the fuller `vis_plunger` checks; the placeholder-geometry header wording.
  - All six are test or provenance edits. No production code changed at review.
- **Deferred (2 new, in frontmatter `deferred:`):**
  - medium: the boot.ts wiring has no automated test.
  - medium: a spec-bound product call. `vis_dragon_bank_backstop` is target-red directly behind the drop targets, so a dropped target may not read on screen.
- **Rejected:** 7 false and 18 low findings, plus one duplicate of the existing plunger `deferred:` entry. Each has its reason in the Review Triage Log, above.
- **Follow-up review recommendation:** `false`. The patched entries were 0 high, 3 medium and 3 low. The medium-count rule would say `true`, but every patch is a test-only assertion demonstrated red under its named mutation, so no specific unverified risk remains to name.

**Verification performed:**
- `pnpm typecheck`, `pnpm lint:boundaries`, `pnpm check:headers` (the new files were marked intent-to-add so the tracked-file scan covered them) and `pnpm check:attributions`: all green.
- `pnpm test` with Blender resolvable: 131 files, 2106 tests passed, 0 skipped.
- `git diff --exit-code -- public/assets/dragonwar.collision.json test/replays`: exit 0. The goldens were parsed per field: all five `header.assetHash` = ab163ff, and `expectedHash`/`expectedGameStateHash` are unchanged since the baseline.
- `pnpm build`, `pnpm check:dist` and `pnpm check:size`: green, 0.900 MB of the 2.75 MB budget.
- Rule 19: every mutation in `## Verification` was applied, observed red and reverted, with `git status --short`, `git diff --stat` and the glb bytes identical afterwards. This includes the three added at review.
- Matrix Test Audit: all six I/O rows are covered in `test/mechanisms-follow.test.ts`, which ran in the default suite and passed.

**Residual risks (for the lead's AC 4 browser smoke):**
- AC 4 has not been run. The rendered colour separation and the flipper-hold region change are unmeasured.
- `vis_dragon`'s screen rect is an AABB, and its central 50% includes lock-lane playfield, which dilutes the mean.
- `vis_plunger`'s south 40 mm lies past the playfield edge, so sample the on-board part.
- Flipper white and wall blue-grey differ mainly in the red channel.
- On a WebGPU-capable browser, a missing twin passes through a spurious WebGPU-to-WebGL2 fallback before the error panel shows it.
- `vis_plunger` never moves in real play: `posMm` is hard-wired 0, per the existing `deferred:` entry.
