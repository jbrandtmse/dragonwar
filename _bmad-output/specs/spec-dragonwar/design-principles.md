# Design principles

The tie-breakers. When a capability admits two readings, or an epic has to choose what to cut, these decide.

## The judging principle

Everything is judged by whether it serves the moment: targets spell D‑R‑A‑G‑O‑N, the dragon opens its mouth, and multiball begins as the balls come out like fire. Three consequences:

- **The walk-up is a first-class feature** — cheap to build, the first thing anyone feels, and it sets the frame for everything after.
- **The dragon is the protagonist**, not set dressing: the bash target, the multiball source, the thing you are at war with. Art and rules both answer to it.
- **The flippers are the weapon.** The core verb of pinball is the core verb of the fiction, which is why the war lives inside multiball rather than beside it.

## What "realistic" means here

Nobody has defined realism for pinball — no benchmark, no instrumented study; every published ranking is forum opinion. So the term is replaced with four checkable criteria:

1. It feels like real pinball and stays playable — feel wins over fidelity wherever the two conflict.
2. The approach: backbox and backglass first, then the descent to the playfield.
3. Lights and sound of a real machine — inserts that carry game state, GI, flashers, mechanical audio.
4. Correct ball behaviour — bouncing, rebounding, and *sometimes* hopping (one explicit control; the parameters that make a ball feel right exist partly to suppress hops).

The author has a real machine within walking distance and plays it regularly, so "feels right" is an acceptance step someone can perform (UJ-4), not an opinion. No instrumented benchmark exists; the feel test is the project's own definition and must stay a repeatable ritual.

## Qualitative intents (carried for whoever writes epics)

- Each mode's mechanic *is* its fiction: skill shot and "arming" land on the same beat; the joust is charge, pass, wheel around, charge again.
- Insert colour is how the player reads the table without instructions.
- The loud loop and the quiet return.
- The balls you locked are the balls that come back at you.
- Nudge danger is the point — nudging without tilt risk is not nudging.
- Randomness tuned down, hops deliberate.
- Rustic art under bright RGB — the rustic register lives in the art, the grammar lives in the light.
- Realism lives in proportions and light, not polygon count.
- Being finished is the moat.
- Lawlor's miss test as a per-shot ethic.
- One machine, built properly.
- Progressive Jackpot seeding and the Extra-ball achievement menu exist to make the table feel authored, not generated.
- A pinball player should need no instructions; everything a real machine does whose absence is conspicuous is in scope.

## Art direction

- **Stylized** = simplified geometry and hand-painted textures, with real-world dimensions and real lighting behaviour preserved. Geometry is not the bottleneck: VPE budgets 500–2,000 triangles per playfield object at a single LOD, because a table is a small, fixed, near-field scene. Lighting and texture memory are what cost.
- Correct silhouette and scale on the walk-up: cabinet proportions, backbox height, the glass.
- Inserts as lights below a translucent playfield through a cup mesh, never decals; bake inserts white and tint at runtime — one texture per light group, not per colour — which is what makes the held grammar cheap.
- Backglass as an animated, pixelated, dot-matrix display: period-authentic (Williams/Bally DMDs), pairs with low-poly, and removes the need for high-resolution backglass art.
- Rustic playfield art and materials; saturated functional inserts. Muted earth tones on inserts are rejected.

## Risks and structural defences

| Risk | Defence |
| --- | --- |
| Art is the largest unbudgeted item; no published effort figure for one table exists. Most likely place the project stalls. | Stylized direction; realism in proportions and light; epic 1 ships a placeholder `.blend` so nothing in epics 1–3 waits on art; art passes phased and allowed to trail. |
| Feel is unbounded — flipper tuning has no natural stopping point. | Fixed acceptance bar (SM-4, UJ-4); tuning past acceptance is a counter-metric. |
| The physics reference is frozen — vpx-js stopped November 2020, scripting unfinished. | Port from a proven, readable, complete physics core; pin by commit; solver constants verbatim. |
| Solo-project fatigue. | One table; phased content; playable-early loop; commercial machines ship their deepest modes in later code updates, so v1 needs no wizard mode. |
| Browser-first is unproven at this fidelity (the research's technical-precedent objection is unanswered). | Spikes 1 and 3 gate the premise in epic 1; the static bundle keeps native (Tauri) viable at zero cost. |
| The bake pipeline is a productivity sink (vpx_lightmapper is pre-alpha, no shadowing, no movable objects; Unity practitioners report multi-hour bakes; vpx_lightmapper publishes no scaling numbers — illustratively, 10 × 2048² RGBA8 ≈ 160 MB uncompressed). | Fixed asset contract (UV2 + light groups) now; the bake is a later swap behind the same driver and cannot block anything; spike 2 measures the envelope before the light-group partition freezes. |

## Research cautions

- VPX "realism" is a judgement about individual table tuning — quality is table-dependent, not engine-fixed.
- Do not cite Pinball FX / Pro Pinball internals (player-forum sourced) or any content-farm build-size figure; the only build-size comparator is an *empty* Unity 6 URP web build at 7–11 MB compressed.
- The only prior browser 3D pinball was criticised for a too-small ball, a bouncy launcher and a game too fast — CAP-4, CAP-18 and CAP-10 cover those three.

## Vision beyond v1

If DragonWar works, the next step is a *better* DragonWar — deeper code, a final wizard mode, tuning refined against real play — not more tables. The layer separation leaves a table-authoring door open at no cost; it stays shut for v1.
