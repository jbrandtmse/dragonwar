# Epic 5 Context: Art Passes — the Dragon and the Table

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Turn the placeholder scene into a table a player can see and read: mechanisms that look like hardware, playfield art under saturated insert lenses, dot-matrix Backglass art, a cabinet and backbox at real scale, and the Dragon. Each pass replaces placeholder meshes behind fixed node names and lands with its attribution entries. v1 art is stylized and pipeline-generated, so author-made art can replace it later without code changes. Art may trail epics 1–4 and never blocks them.

## Stories

- Story 5.0a: Visible placeholder geometry
- Story 5.1: The Dragon
- Story 5.2: Playfield art and materials
- Story 5.3: Cabinet, backbox and glass
- Story 5.4: Mechanisms, plastics, ramp and guides
- Story 5.5: Backglass art and DMD frames

## Requirements & Constraints

- **Stylized at real dimensions.** Simplified geometry and painted-look textures at real proportions, one level of detail, at most 2,000 triangles per object (a cabinet object is a direct child of `cabinet_root` with its descendants). Hold 60 FPS on a 2022 mid-range laptop GPU and CI's 20 MB compressed-payload budget.
- **Fixed view.** The flippers, Dragon, Loops, Ramp and DRAGON bank stay legible, with the Backglass as a strip at the top.
- **The Dragon** crouches off-centre over its Lock lane, which runs between its legs: a precise shot passes under it into the Lock, a slightly-off shot hits the body. Locked balls fire back out of its mouth. v1 animates mouth open, close and one hit reaction, with no idle animation.
- **The cabinet** (body, backbox, glass, legs, lockdown bar) has a real machine's silhouette and scale.
  - Reference: cabinet 560 × 1400 mm, 400 mm high at the front and 605 mm at the back; backbox 730 × 730 mm; glass 533 × 1093 × 4.76 mm; lockdown bar 900–920 mm above the floor.
  - Assembled height is 1790 mm, not the reference 1930 mm: the backbox is seated to carry the Backglass quad where Story 2.6 put it.
  - In frame and checked on screen: the lockdown bar, side rails, glass, cabinet front and the lower backbox with the Backglass. None may hide the playable area, a flipper, an insert or the Backglass. The rest of the backbox and the legs' feet are verified by geometry.
  - The cabinet front sits about 22 mm toward the player, so both flippers and the gap between them are wholly visible, resting or held. The lockdown bar hides about the lowest fifth of the ball waiting in the shooter lane; its centre and top stay visible at every allowed pitch (6.0–8.5°).
  - Cabinet art is flat paint with no pictorial texture.
- **Provenance is a hard gate.** Each file's `ATTRIBUTIONS.md` entry lands before the file; generated files are recorded as generated, with tool and date. v1 uses no third-party asset.
- **Author action items, not story gates:** the Dragon's Lawlor re-run in `docs/feel-test.md` and the stranger link test of Attract.

## Technical Decisions

- **Nodes.** Only `col_` nodes collide; `vis_` nodes never do. Static meshes carry `TEXCOORD_1` and a `lightgroup`.
- **Playfield art parts.** A part replaces its placeholder `vis_` twin behind the same name as a direct child of `playfield_root`; extra materials go on child meshes named `<parent>_<part>`; materials are `mat_art_<kind>`. Geometry is derived from the source `col_` footprint in the same `tools/make-placeholder-blend.py` run, never re-typed. Up to one ball diameter above the playfield, every art vertex stays within 0.5 mm of that footprint, so the visible path matches the collision path.
- **Cabinet parts.** They are `vis_` nodes under `cabinet_root` in `lg_cabinet`, authored in the level frame (the table frame, unpitched): presentation pitches only `playfield_root`, and `cabinet_root` stays level. Their names live in `src/presentation/scene/vis-names.ts`. The glass visual is `vis_top_glass`, at real height; `col_glass` stays the physics ceiling with no twin, and no node is named `vis_glass`. The modelled backbox is `vis_head`; `vis_backbox` stays the dot-matrix quad.
- **Architectural lights.** Each lamp's position is an Empty under `cabinet_root` named exactly as its `TABLE.giChannels` key. Presentation creates one light per channel at load, scoped with `includedOnlyMeshes` to its authored targets (cabinet parts and the backbox translite, nothing else), and drives it by intensity only through `setArchitecturalLevel(scene, channel, level)`, level 0 to 1. Lights are never created, disposed or toggled after load.
- **Transparency is set in presentation.** No glTF extension is registered, so transparency authored in Blender, the glass included, is dropped at load; never assert it from the glb.
- **Dragon contract.** The mesh carries a named jaw node, a child of `vis_dragon` pivoted at the hinge, for the rig to open, close and shake; this epic creates no `src/presentation/mechanisms/dragon.ts`. `col_dragon_body`, `sw_lock_lane` and `bd_lock` keep their names or are re-authored to the same names. The rig animates only from the mouth and hit shows, never from snapshot state. `bd_lock` ejects at its authored pose, the Mouth.
- **Hashes.** A `vis_`-only change moves neither `tableHash` nor `assetHash`. A collision change such as a `col_` rename moves `assetHash` and stales every replay golden; a trajectory or state-hash re-record needs the author's explicit grant.
- **Verification.** `NullEngine` rasterises nothing, so any claim that something is visible needs a real browser capture.

## Cross-Story Dependencies

- **Plunger art.** The 22 mm fit lengthens the rod of Story 5.4's `vis_plunger` by the same 22 mm, so its knob stays outside the cabinet; the change is made and verified in Story 5.3.
- **Walk-up and lamps.** Story 4.6 owns the Walk-up that frames the backbox and descends past the glass. Story 4.1 routes `GiCommand` to the architectural seam and owns exposure and tonemapping.
- **Dragon collision.** The committed geometry has no `col_dragon_body` (DW-165); four `surface: 'dragon'` bodies share the `vis_dragon` twin. Renaming or adding a `col_` body to reconcile that falls under the hash rule.
- **Dragon rig.** Playing the open, close and hit shows on the new mesh is checked in Story 3.3b (Epic 3), built after Epic 5 merges.
