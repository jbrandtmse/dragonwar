---
title: 'DragonWar Brief — Addendum'
status: draft
created: '2026-08-26'
updated: '2026-08-26'
---

# DragonWar Brief — Addendum

Depth that earned a place but does not belong in a 1–2 page brief. Written for whoever picks up the PRD or the architecture next.

---

## 1. Stylized realism vs. the real-machine goal

The author chose **stylized / low-poly** art while also stating the game should feel like walking up to a **real machine**. These pull against each other.

**The research says geometry is not the bottleneck.** The Visual Pinball Engine asset styleguide budgets 500–2,000 triangles for standard playfield objects and uses **a single LOD**, because a pinball table is a small, fixed, near-field scene. What *is* expensive is lighting and texture memory.

**Therefore the realism does not live in the polygon count.** It lives in:

- **Correct dimensions.** Standard-body playfield 20.25 × 42.00 in, ball 26.99 mm at ~80 g, flipper bat 3.125 in rubbered, pitch 6.5°. They cost nothing to honour and everything to get wrong. The one browser pinball attempt the research found was criticised first for the ball being *the wrong size relative to the playfield*.
- **Correct lighting behaviour.** Inserts modelled as a light *below* a translucent playfield with a cup mesh, not as decals. Four independently-driven channels: GI, feature inserts, flashers, architectural.
- **Correct ball behaviour.** Elasticity falloff, coil ramp-up, scatter at zero.
- **Correct silhouette and scale** on the walk-up — cabinet proportions, backbox height, the glass.

**Recommended reading of "stylized": simplified geometry and hand-painted textures, with real-world dimensions and real lighting behaviour preserved.** This keeps the walk-up moment intact while removing the photoreal art budget that would sink a solo project.

If the author instead wants a genuinely non-realistic visual language — flat shading, exaggerated proportions, cel-shaded dragon — that is a legitimate and different product, and the brief's "feels like a real machine" criterion should be rewritten rather than quietly contradicted.

---

## 2. Rules spine, mapped to the modern-machine skeleton

The modern Stern/JJP skeleton the research extracted, with DragonWar's fit:

| Structural role | Modern machine | DragonWar |
|---|---|---|
| Qualifier | Ramp shots light a mode | Lit targets spelling D‑R‑A‑G‑O‑N |
| Selector | Scoop starts the chosen mode | Dragon's mouth |
| Headline multiball | 3-ball, progressive jackpots | Dragon-fire multiball, balls launched from the mouth |
| Mode stack | Tiered battles, stack with multiball by priority | Additional feature modes, layered by priority |
| Wizard | 4-ball finale, often shipped post-launch | "Win the war" → jackpot; deeper wizard content can follow in a later release |

**Ball-count grammar to honour:** 3-ball for regular multiball, 4-ball reserved for the finale.

**Insert colour is the mode-state channel, not decoration.** Jurassic Park uses white = qualify, red = rescue, yellow = set trap, green = the moving target. DragonWar should assign a colour grammar early and hold it — it is how the player reads the table without instructions.

**Progressive jackpots are seeded by prior play** ("500k + 500k per multiball started"), and **extra balls come from a menu of long-horizon achievements**, not a single lane. Both are cheap to implement and make the table feel authored rather than generated.

---

## 3. Machine behaviour a sim usually gets wrong

Captured verbatim from the research — these details separate credible from not:

- **Tilt forfeits the end-of-ball bonus and ends the ball — it does not zero the score.** Warnings are per-player. The bob keeps swinging, so both a debounce window and a settle time are required.
- **Slam tilt is a different sensor** — a coin-door switch, not the plumb bob — and it ends all games in progress.
- **Ball save has a grace period past the displayed expiry** during which drains still save, a "hurry up" state measured *backwards* from expiry, and a timer-start event separate from enable (which is why it does not count down until the ball is plunged).
- **Match**: the number is always a multiple of ten. *Unverified*: the widely-repeated 8% default could not be confirmed against a primary source — check before implementing.
- **Ball search** is an escalating three-phase protocol with per-device priority callbacks and a defined failure action, and real machines suppress parts of it when rules state would be corrupted.
- **Flashers are coil-class outputs**, charted with solenoid drivers rather than the lamp matrix, and need duty-cycle limits. Do not fold them into the insert layer.

---

## 4. Tuning knobs and starting values

Dimensionless VPX values port directly; the strength numbers are VPX-internal units and do not.

| Parameter | Starting value | Note |
|---|---|---|
| Physics tick | 480–1000 Hz fixed | 480 Hz is a demonstrated working floor for a browser pinball |
| Flipper elasticity | 0.88 | |
| Elasticity falloff | 0.15 | **The primary feel knob.** Lively at low speed, no pingy rebound at high speed |
| Flipper friction | 0.8–0.9 | What makes centre shots and backhands possible |
| Scatter angle | **0** | Recommended for every era; randomness is tuned *down* |
| Coil ramp-up | 2.5 | Solenoid acceleration time — this is what enables light-tap technique |
| Playfield pitch | 6.5° | Expose it. The strongest single global difficulty knob |
| Flipper pulse | ~30 ms at 70% power, then 25% hold | *Medium confidence* — MPF documentation example, not a measurement |
| Airball tendency | one explicit control | The author wants occasional hops; this is deliberate, not emergent |

**Do not model playfield walls and floor as zero-thickness planes** — they need real thickness regardless of physics approach.

---

## 5. Licence reasoning

The open-source decision is what makes the physics plan viable.

- **vpinball** is *not* GPL as commonly assumed. It is dual-licensed mid-migration: converted files carry `// license:GPLv3+` on the first line; everything unmarked stays under MAME-derived terms reading *"may not be sold, nor may they be used in a commercial product or activity."* GitHub reports NOASSERTION.
- **PinMAME** is stricter — *"selling is not allowed"*, *"strictly a non-profit project"*. Out of scope regardless, since DragonWar is an original table and needs no ROM emulation.
- **vpx-js** is cleanly **GPL-2.0**. Dormant since November 2020, scripting unfinished, but the physics is complete and readable.
- **MPF** is **MIT** (docs CC BY 4.0) — the ontology and event vocabulary can be adopted freely.
- **wpc-emu** is **Apache-2.0**, the only permissive project in the ecosystem. Not needed for an original table, but worth knowing it exists.

### Licence compatibility check — verified 2026-08-26

**DragonWar is GPL-3.0.** The reasoning is load-bearing and should not be re-derived later:

| Artifact | Licence | Verified how |
|---|---|---|
| vpx-js source headers (`lib/physics/hit-object.ts`) | *"either version 2 of the License, or (at your option) any later version"* → **GPL-2.0-or-later** | Header read directly |
| vpx-js `package.json` | declares only `"GPL-2.0"` — **ambiguous, do not rely on it** | Read directly |
| vpx-js `LICENSE` | GPLv2 text, June 1991 | Read directly |
| Babylon.js | **Apache-2.0** (`spdx_id: "Apache-2.0"`) | GitHub API |

Apache-2.0 is **incompatible with GPL-2.0-only** and **compatible with GPL-3.0**. Exercising vpx-js's *or-later* clause to take the ported physics to GPL-3.0 therefore lets the physics core and the renderer ship in the same program.

**Had vpx-js been GPL-2.0-only, the chosen renderer and the chosen physics core could not have been combined** — the project would have needed a different renderer or a different physics source. This is worth re-checking if either dependency is ever swapped.

Final stack: **DragonWar GPL-3.0 · Babylon.js Apache-2.0 · MPF ontology MIT.** All compatible. The author's stated requirement — free to distribute — is satisfied by GPL-3.0 by design, and copyleft guarantees it stays that way downstream.

*Not legal advice; this records what the licence documents say.*

---

## 6. Decisions taken, with rationale

| Decision | Rationale |
|---|---|
| One table, not an engine | The single scope decision that makes this achievable solo. The field is littered with abandoned platforms. |
| Browser-first | Overrides the research's native-first recommendation, which was reasoning about a *commercial* product. For open source, click-and-play is the entire share story. Tauri wraps the same build later at near-zero cost. |
| 1–4 player hot seat | Matches a real machine and fixes per-player state in the rules layer from day one. Retrofitting touches every rule. |
| Full nudge, tilt, slam tilt | Nudging without tilt risk is not nudging — the danger is the point. |
| Stylized art | Mitigates the largest unbudgeted risk. See §1 for the reconciliation with the realism goal. |
| Rules layer separate from physics | Physics emits switch events; rules are a pure function of events → state → presentation, with no knowledge of ball velocity. That makes the rules headlessly testable. |

---

## 7. Open questions for the PRD

1. **Which machine is at the bar, and from which era?** The author has a real machine within walking distance and plays it regularly — the calibration reference is real. But flipper strength is era-banded (roughly 500–1000 for electromechanicals up to 3200–3300 for mid-90s-and-later, in VPX units), so calibrating against a specific machine means inheriting that machine's era feel. Fine, but it should be deliberate.
2. **Which colour means what?** The grammar is settled in principle (§8) but the specific state-to-colour mapping is not. Assign it early and hold it.
3. **Which lightmap UV scheme** — standard UVs (camera-free, VR-capable) or camera-projected (VPX-style, locks the camera)? Must be decided before modelling starts.
4. **How is sound generated?** The strategy is settled (§8); the synthesis approach is not. Ball roll in real simulators is sample playback driven by velocity and position with a pitch shift by surface, not synthesis — a generated-audio approach needs its own answer for that.
5. **Shot layout.** The modes now imply their shots — a loop for the joust, targets for DRAGON, a mouth to feed. Turning that into a playfield is the next real design problem, and it iterates with the rules rather than following them.

*Resolved since first draft: the theme spine (knight, flippers as weapon, war = multiball); the project licence (GPL-3.0, §5); physical access to a reference machine; the feature-mode set, backglass treatment and audio strategy (§8); the colour-grammar split and the joust mechanic (§8).*

---

## 8. Feature modes and presentation — author input for the PRD

Supplied by the author after the brief was drafted. Recorded verbatim in intent; the structural reading is flagged as such.

### The modes

| Mode | Fiction | Form |
|---|---|---|
| Skill shot | **Arming oneself** | Standard skill shot at the plunge |
| Hurry-up | **A call to arms** | Timed, decaying value |
| Quick multiball | **Fight the monster** | 2-ball |
| Joust | **The charge** | Looping / orbit shots — consecutive loops build, a miss breaks the charge |
| Dragon-fire multiball | **The war** | 3-ball, the headline mode |

**Structural reading (inferred, not stated by the author):** these form a *knight's campaign* that escalates — arm yourself → answer the call → fight a monster → joust → war with the dragon. If that reading is right, the qualifying order should follow it rather than modes being independently available, and the campaign gives the table a spine a player can feel without being told.

Note the skill shot is the sharpest theme fit in the set: it fires at the plunge, *before* the ball is in play, so "arming oneself" and the mechanic land on the same beat.

Against the researched skeleton, this gives a healthy first release: four qualifying features plus the headline multiball sits inside the typical three-to-five range, and the 2-ball / 3-ball split respects the ball-count grammar in §2 (with 4-ball still reserved should a final wizard mode arrive later).

### Backglass

**Animated, pixelated, dot-matrix-looking.** Three things recommend this beyond taste:

- It is period-authentic — Williams/Bally dot-matrix displays are exactly this.
- It pairs with the stylized low-poly direction rather than fighting it.
- It removes the need for high-resolution backglass art entirely, which is a real saving on the project's largest unbudgeted item.

It is also the first thing seen in the walk-up, so it carries the job of establishing the war before a ball is plunged.

### Colour grammar — resolved

**Rustic playfield art and materials, saturated functional inserts.**

The tension this resolves: insert colour does a *functional* job — the research established it is the mode-state channel, how a player reads the table without instructions (Jurassic Park: white = qualify, red = rescue, yellow = set trap, green = the moving target). Muted earth tones across the board would have undercut it.

The split costs nothing thematically because it is how real machines already look: painted wood under bright RGB. **The rustic register lives in the art; the grammar lives in the light.**

The specific colour-to-state mapping is still to be assigned, and should be settled early and then held.

### The joust — resolved

**Looping / orbit shots.** Consecutive loops build the charge; a miss breaks it.

The fit is exact: a joust is repeated passes — charge, pass, wheel around, charge again — which is mechanically what an orbit shot is. It is also a proven rule pattern rather than an invention; the research found Stern's Godzilla builds **loop combos up to 10x for consecutive shots**.

*Suggested, not yet decided:* a **spinner on the loop**. Classic orbit furniture, and the rip of a spinner is the sound of a charge.

### Audio

**Generated for now, with recorded real-machine sounds swappable in later.**

This is an architecture constraint as much as a content decision: **the audio layer must sit behind a swappable asset interface from day one**, so sources can be replaced without touching game logic. Cheap if designed in, painful to retrofit.

Worth pairing with an earlier suggestion: the author can record his own reference machine's mechanical sounds on a phone — coil fires, flipper snap, ball roll on wood, a drop bank resetting. Unambiguously his, no licensing question, and it will sound more like a real machine than any sample pack because it is one.

---

## 9. Deferred, not rejected

Recorded so these are not silently lost:

- Final wizard mode beyond winning the war — legitimate to ship in a later code update, exactly as commercial machines do.
- Desktop packaging via Tauri.
- A table-authoring path. Keeping rules, physics and presentation separated preserves the option at no cost. The door stays shut for v1.
