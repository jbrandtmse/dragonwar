# Epic 5 Context: Art Passes — the Dragon and the Table

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Turn the placeholder scene into a table a player can see and read: mechanisms that look like hardware, playfield art under saturated insert lenses, dot-matrix Backglass art that sets up the dragon-and-knight fiction, a cabinet and backbox at real scale, and the Dragon. Each pass replaces flat-shaded placeholder meshes behind fixed node names and lands with its attribution entries. v1 art is stylized and pipeline-generated, so author-made art can replace it later without code changes. Art may trail epics 1–4 and never blocks them.

## Stories

- Story 5.0a: Visible placeholder geometry
- Story 5.1: The Dragon
- Story 5.2: Playfield art and materials
- Story 5.3: Cabinet, backbox and glass
- Story 5.4: Mechanisms, plastics, ramp and guides
- Story 5.5: Backglass art and DMD frames

## Requirements & Constraints

- **Stylized at real dimensions.** Simplified geometry and painted-look textures with real proportions and real lighting behaviour. Photoreal detail is not a goal.
- **Budget.** One level of detail per object, 500–2,000 triangles (the Dragon at most 2,000). Texture memory and lighting are the real costs: hold 60 FPS on a 2022 mid-range laptop GPU and a compressed initial payload of at most 20 MB, enforced in CI.
- **Legible from the one fixed view:** both flippers, the Dragon, both Loops, the Ramp and the DRAGON bank, with the Backglass as a strip at the top.
- **The Dragon** crouches off-centre over its Lock lane, which runs between its legs: a precise shot passes under it into the Lock, a slightly-off shot hits the body. Locked balls are fired back out of its mouth. v1 animates mouth open, close and one hit reaction, with no idle animation.
- **The cabinet:** cabinet, backbox, glass, legs and lockdown bar at standard-body dimensions, framed by the fixed camera. Architectural lamps on the backbox and arch light the cabinet art and the backbox translucency.
  - No requirement fixes the numbers. Research reference figures for a standard Bally/Williams WPC machine: cabinet 560 mm wide, 1400 mm deep, 400 mm high at the front and 605 mm at the back; backbox 730 × 730 mm; assembled height about 1930 mm; lockdown bar 900–920 mm above the floor; glass 533 × 1093 mm, 4.76 mm thick.
- **Provenance is a hard gate.** Every file gets its `ATTRIBUTIONS.md` entry before it lands; generated files are recorded as generated, with tool and date (Claude Code, Blender 5.2.1). v1 uses no third-party asset. New source files carry the GPL-3.0 header.
- **Human-only checks are author action items, not story gates:** the Dragon's Lawlor re-run in `docs/feel-test.md` and the stranger link test of the Attract sequence.

## Technical Decisions

- **Source and export.** `tools/make-placeholder-blend.py` generates `assets/src/dragonwar.blend`, which owns all geometry. `tools/export.py` checks node names (`^[a-z][a-z0-9_]*$`, unique, one material each) and each `lightgroup`, `surface` and `phys_material` against `TABLE`. Both loaders fail fast on a missing node or unknown value.
- **Node contract.** `col_` is invisible collision, the only thing the ball hits; `sw_` is switch zones; `vis_` is non-collidable visuals; `l_` is inserts. The glb has exactly two top-level nodes, `playfield_root` and `cabinet_root`, plus `pivot_pitch`. Static meshes carry `TEXCOORD_1` lightmap UVs and a `lightgroup` from `TABLE.lightGroups`.
- **Placeholder twins.** Each player-visible `col_<x>` has a `vis_<x>` twin; the four `surface: 'dragon'` bodies merge into one `vis_dragon`. `col_glass` has no twin: its visual is Story 5.3's and must be `vis_` only.
- **Art parts.** An art part replaces its twin behind the same name and stays a direct child of `playfield_root`. A second material means child meshes named `<parent>_<part>`. Materials are `mat_art_<kind>` (colour, roughness, metallic 0, no texture unless recorded). Geometry is derived from the source `col_` footprint in the same script run, never re-typed.
- **Ball-band rule.** Between table z 0 and one ball diameter (`TABLE.reference.ballMm`), every art vertex stays within 0.5 mm of its source body's footprint, so the visible path matches the collision path. Parts the ball passes beneath sit wholly above the band.
- **Dragon contract.** The mesh carries a named jaw node, a child of `vis_dragon` with its pivot at the hinge, so the rig can open, close and shake the mouth with no code written here; this epic creates no `src/presentation/mechanisms/dragon.ts`. `col_dragon_body`, `sw_lock_lane` and `bd_lock` keep their names or are re-authored to the same names. The rig animates only from `show_dragon_mouth_open` and the hit-reaction shows, never from snapshot state. `bd_lock` ejects from its authored pose, which is the Mouth, aimed at the flippers.
- **Frames and pitch.** Geometry is authored unpitched in the table frame: mm, X right, Y up the playfield, Z toward the glass. Presentation rotates only `playfield_root`, about `pivot_pitch`, by the snapshot's pitch (6.0–8.5°, default 6.5°); `cabinet_root` stays level.
- **Lighting.** The architectural channels `gi_backbox`, `gi_cabinet` and `gi_arch` sit behind `LampDriver` and take a level from 0 to 1, set once per phase. The WebGL2 floor has a budget of 20 live lights per frame. As recorded on 2026-09-07, the scene has no exposure or tonemapping, so every surface sits near the low-dynamic-range ceiling before any lamp contributes; creating headroom is Story 4.1's.
- **Translucency is not carried by the glb.** The project registers no glTF extensions, so transmission authored in Blender is discarded at load and any assertion over it is vacuous. Insert lenses get theirs in the lamp driver; the same limit applies to any other material, such as the glass.
- **Playfield mask.** It is the alpha channel of the generated playfield texture, with lens openings derived from the generator's own `l_` lens list. Spill onto the art is Story 4.2's.
- **Backglass sequences** live in `src/presentation/backglass/`, keyed by MPF event name in one presentation-side map and timed from the event's `tick`. Attract is a phase, not an event, so presentation starts its sequence on the PRESS START screen under `mode_attract_started`. No sequence draws within 1 dot of a text row, so the score stays byte-identical.
- **Hashes.** A `vis_`-only change enters neither the collision document nor `tableHash` nor `assetHash`. A `col_` or `sw_` change moves `assetHash` (a header re-record of the goldens) and, if trajectories change, the state hashes, whose re-record needs the author's grant.
- **Verification.** `NullEngine` rasterises nothing, so any claim that something is visible needs a real browser capture. The content security policy admits `blob:` images (textures embedded in the glb) but not `data:`.

## Cross-Story Dependencies

- **Dragon and collision.** `vis_dragon` is the merged twin of four collision bodies, and the committed geometry has no `col_dragon_body` (DW-165). Reconciling that is a collision change, with the hash consequences above.
- **Dragon rig.** Playing the open, close and hit-reaction shows on the new mesh is checked in Story 3.3b (Epic 3), built after Epic 5 merges.
- **Backbox and the Backglass.** Story 2.6 authored the `vis_backbox` quad under `cabinet_root` and maps the dot-matrix canvas onto it. The modelled backbox must keep that quad and its mapping visible at the top of the fixed view.
- **Walk-up and lamps.** Story 4.6 owns the Walk-up that frames the backbox and descends past the glass. Story 4.1 owns the driver that scales the architectural channels.
- **Backglass triggers.** The Mode-prompt, War-start and Jackpot sequences sit under plain strings (`lock_lane_mode_start`, `war_started`, `jackpot_awarded`). Epic 3 declares the events under exactly those names and Story 4.5 verifies the triggers; this epic wires and verifies only Attract and Match.
