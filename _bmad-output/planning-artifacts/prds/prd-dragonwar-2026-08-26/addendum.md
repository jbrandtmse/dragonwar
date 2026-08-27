---
title: 'PRD: DragonWar — Addendum'
status: final
created: '2026-08-26'
updated: '2026-08-27'
---

# PRD: DragonWar — Addendum

This addendum holds the depth that belongs downstream of the PRD — in the architecture, the physics tuning work, or the licence audit — rather than in the PRD's main narrative. Written for `bmad-architecture` and for whoever tunes the table. Sources: the product brief and its addendum, and the technical research (paths in PRD §0). Nothing here is a requirement; where this addendum is more specific than an FR, the FR governs and this is guidance.

## 1. Technical direction (from the research; confidence noted per row)

| Layer | Pick | Why | Confidence |
|---|---|---|---|
| Physics | Purpose-built analytic time-of-impact core **ported from `vpdb/vpx-js`** (TypeScript), fixed timestep 480–1000 Hz | Every verifiable serious pinball sim uses a purpose-built core; general rigid-body engines (Jolt, Rapier, Havok, PhysX, cannon-es, Ammo) reproduce the same failure catalogue — kinematic flippers teleporting, 64 substeps, thickened colliders. Porting inherits twenty years of tuning constants. vpx-js is dormant (HEAD 2020-11-12): "port from a frozen but proven reference," not "adopt a living library." | High |
| Renderer | **Babylon.js**, WebGL2 floor + WebGPU progressive enhancement | Structural grounds only: engine-shaped, first-party Havok plugin, fastest release cadence. The 130-light Three.js-vs-Babylon benchmark is unverified and must not carry the decision. | Medium — re-check by 2026-09-26 |
| Rules | **MPF-shaped** declarative rules layer (Mission Pinball Framework device ontology + event vocabulary, MIT) | Complete typed ontology (50+ devices incl. `multiball_lock` vs `ball_hold`, `dual_wound_coils`), four-phase event convention, explicit failure events. Rules are a pure function of switch events; headlessly testable. | High |
| Lighting | Baked per-light-group additive lightmaps, **standard UVs** (not camera-projected); inserts as a light below the playfield through a cup mesh with a translucency map; **bake RGB inserts to white and tint at runtime** (one texture per light group, not per colour — what makes the held colour grammar cheap) | Baking earns its place for indirect bounce and contact-soft shadows. Light count alone would not force it *if* clustered forward lighting is available: Babylon's clustered path does ~2,000 dynamic lights at 1080p/60 on an RTX 4070 laptop (300–500 at 4K), against a playfield's 50–150. But the research rates that medium confidence and notes that clustered lighting appears to be a **WebGPU-path feature**. On the WebGL2 floor (PRD FR-54, "fully playable, not degraded") light count may therefore still force baking. Standard UVs keep the camera free even though v1 fixes it. **Owner: architecture; decide before modelling starts.** | Medium |
| Packaging | Browser-first; **Tauri** later from the same build | Overrides the research's native-first recommendation; rationale under *Packaging override* below the table. | Decision |

**Layer separation is the load-bearing architectural rule:** Physics core emits switch events → Rules layer (no knowledge of ball velocity) → Presentation (lights, backglass, audio, camera). Audio sits behind a swappable named-asset interface from day one. Flashers are coil-class outputs with duty-cycle limits, charted with solenoid drivers, not on the insert/lamp layer.

**Packaging override:** the research recommended native-first. That recommendation had two halves: a distribution half (browser economics are ad-portal economics; no browser-vs-Steam comparison exists) — answered, because for open source, click-and-play is the entire share story — and a technical-precedent half (no browser game at "visually rich 3D simulation" fidelity was found; Unity's web showcase is demoware-scale) — **not answered by the override.** Its only mitigation is now spikes 1 and 3 below, which are therefore gates on the premise, not optional pre-commit checks.

**Three spikes the research says to run before committing** — (1) and (3) gate browser-first:

1. A 1000 Hz JS loop over 6 bodies vs the same scene in Rapier/Jolt WASM. Nobody has published this; the 1–6-body regime is unmeasured (WASM's advantage at 3,000 bodies may vanish at 6).
2. The lightmap scaling envelope — light-group count, lightmap resolution, frame cost, memory. vpx_lightmapper publishes no numbers; as an illustrative calculation only, 10 × 2048² RGBA8 ≈ 160 MB uncompressed, which one forum judgement called "a lot".
3. Browser build size and load time, measured. Every published figure was content-farm sourced and discarded; the only comparator is an *empty* Unity 6 URP web build at 7–11 MB compressed.

**Decision freshness (research §11):** engine versions and WebGPU browser support by **2026-09-26**; ecosystem health (vpx-js dormancy, Babylon cadence) by 2027-02-26; the competitive landscape by 2027-08-26. Machine geometry and ball spec do not go stale.

## 2. Physics tuning knobs and starting values

Dimensionless VPX values port directly; strength values are VPX-internal units and do not. Sources: the brief's addendum §4 (itself from VPE/VPX documentation) and research §3.

| Parameter | Starting value | Note |
|---|---|---|
| Physics tick | 480–1000 Hz fixed | 480 Hz is a demonstrated working floor for a browser pinball (Neon Gutter); 1000 Hz is not load-bearing. Verify the constant against vpx-js (`PHYSICS_STEPTIME = 1000` µs), not upstream VPX. |
| Flipper elasticity | 0.88 | |
| Elasticity falloff | 0.15 | **The primary feel knob.** Lively at low speed, no pingy rebound at high speed. |
| Flipper friction | 0.8–0.9 | What makes centre shots and backhands possible. |
| Scatter angle | **0** | For every era; randomness is tuned down. |
| Coil ramp-up | 2.5 | Solenoid acceleration time — enables light-tap technique. *Value from the brief's addendum §4 (VPE default); the research describes ramp-up only qualitatively.* |
| Flipper pulse | ~30 ms at 70% power, then 25% hold | *Medium confidence* — an MPF documentation example, not a measurement. |
| Playfield pitch | 6.5° | Exposed (PRD FR-10). Competition range 6.5–8.5°, 7.5–8° common. |
| Airball tendency | one explicit control | Hops are authored, not emergent (PRD FR-9). |
| Per-object tunables | elasticity, elasticity falloff, friction, scatter | The only four; VPX per-object defaults 0.3 / 0.0 / 0.3 / 0.0. |
| vpx-js engine constants | `PHYS_SKIN 25.0`, `PHYS_TOUCH 0.05`, `C_DISP_GAIN 0.9875`, `STATICTIME 0.005` | "The tuning constants a bespoke core takes years to discover" — port verbatim from `lib/physics/constants.ts`. |

**Reference geometry:** playfield 20.25 × 42.00 in (514.4 × 1066.8 mm), pitch 6.5°, ball 1.0625 in / 26.99 mm — all high confidence. Ball mass ~80 g and flipper bat 3.000 in bare / 3.125 in rubbered — *medium* (VPE documentation, not a manufacturer). Flipper pivot holes ½ in, centres 7 in up from the bottom edge, 6-13/16 to 7 in apart — medium, hobbyist-sourced. Rubber 45–50 Shore A — low.

**Flipper strength:** banding flipper-coil strength by shot-distance intent (yellow < green < red < orange < blue) is a better basis than banding by resistance. Era note: the brief's addendum §7 records VPX flipper strength as era-banded (~500–1000 for electromechanicals up to ~3200–3300 for mid-90s-and-later, VPX-internal units, relative use only — they do not port as physical values); calibrating to the Reference machine inherits the modern band.

**Numbers that do not exist — do not invent them:** steel-on-clearcoat or steel-on-rubber restitution/friction; manufacturer coil pulse duration; a measured flipper tip gap ("the one unmeasured quantity in the entire drain triangle, and it is the geometry the whole game balances around"); a dimensioned drain zone; any hours-per-table figure. Match 8% is a deliberate choice (2026-08-27), not a measurement.

**Implementation notes carried from the research and its red-team digests:**

- semi-implicit Euler with adaptive subdivision within each step driven by collision events
- analytic closed-form time-of-impact over circles, line segments, triangles, 3D polygons and 3D line segments (vpx-js source adds points and planes) with quadtree and k-d broadphase
- flipper as inertia ⅓·m·r² with ramped torque, quartic end-of-stroke torque fade (and, per vpx-js source, a return spring)
- nudge as a damped-harmonic cabinet oscillator (never as force on the ball)
- tilt bob as an actual pendulum
- **in a time-of-impact design the stability hazard is iteration explosion, not tunnelling** — hence forced time advancement out of collision clusters and a 200 ms catch-up bailout that discards simulated time
- hardcoded ball–ball restitution
- the playfield as one compound collision body
- walls and floor with real thickness
- switches as analytic zone tests, not physics sensors
- detailed visual meshes non-collidable over hand-built simplified collision scaffolding

## 3. Device model of the dragon (MPF terms)

The Dragon is **two devices**: a bash target on the body and a `ball_device` beneath it (the Lock) with the Mouth as its eject (a VUK). The Lock is a **`multiball_lock`** — balls out of play, deducted from the count — not a `ball_hold`. Lock credits are **per player** (MPF's default for `multiball_lock`), backed by one physical device of capacity two:

- A player locks whenever their credits < 2 and no multiball is running (PRD FR-37). If the device is physically full with another player's balls, it ejects one ball to the playfield and the credit still counts.
- The War starts when the current player has both DRAGON spelled and two credits, in either order (PRD FR-38). The Mouth fires whatever the device holds; the trough auto-launches the difference to reach three in play (a lock was the completing event, or a Hot-seat opponent's War consumed the balls).
- The Lock is **disabled during any multiball** (Quick multiball and the War), so an under-leg shot counts as a bash hit, not a re-lock.
- 4-ball stays reserved for a later finale.

The Lock is physical rather than virtual because the payoff — the dragon swallows your balls and spits them back — is the whole moment. Real machines went virtual for BOM, trough-reliability and per-player-tracking reasons; the first two do not apply to a sim, and the third is solved above by per-player credits rather than by giving up the physical lock. Lock stealing (shared locks; whoever spells DRAGON fires them) and release-on-player-change were considered and rejected on 2026-08-26.

Off-centre placement is load-bearing: a dead-centre toy rejects straight down the middle; off-centre, a rejection deflects toward a flipper (Lawlor's miss test) and creates a backhand that rewards friction 0.8–0.9. Precedents: Pulp Fiction's briefcase, Cactus Canyon's Bart, Godzilla.

**PRD assumption to validate in geometry:** the Lock lane doubles as the mode-start scoop (PRD FR-33, Open Question 5). If the lane cannot carry both jobs cleanly, add a separate scoop and keep the Mouth as eject only.

## 4. Machine-operations detail (from MPF and the research)

- Tilt: warnings per player; debounce window and settle time because the bob keeps swinging; on tilt, flippers and autofire coils are disabled until every ball drains. The Competition preset sets warnings to 2 (research); the v1 default of 1 is the PRD's assumption.
- Ball save: displayed timer; hurry-up state measured backwards from expiry; grace period past displayed expiry; timer-start event separate from enable; per-mode timers override global; saved balls auto-launched.
- Ball search: escalating three-phase protocol with per-device priority callbacks and a defined failure action (new ball / end ball / end game); suppress parts of it when rules state would be corrupted — in DragonWar, do not release locked balls while a Mode timer is running (PRD FR-23).
- Adjustments are a layered store: factory defaults → install preset → operator overrides. Competition mode is a preset that both sets and constrains. v1 exposes only the minimal Settings (PRD FR-50); the layered store is the right shape to build even so.
- Ball devices have explicit failure states (`eject_failed`, `ball_missing`, `broken`); the Rules layer should tolerate those events even if the sim never emits them.

## 5. Options considered and rejected

| Alternative | Verdict | Reason |
|---|---|---|
| Platform hosting many tables; editor; plugin system | Rejected for v1 (authoring path deferred) | "A game, not an engine"; the field is littered with abandoned platforms. |
| Native-first (research recommendation) | Overridden | Click-and-play is the open-source share story; residual technical risk carried by spikes 1 and 3 (§1). |
| Unreal Engine | Disqualified | No UE5 web target; Pixel Streaming puts a network round-trip in the flipper loop. |
| Godot 4 web | Disqualified | Compatibility renderer only; no AudioEffects; docs steer away from Safari. |
| Bevy | Weak | Pre-1.0 churn; physics tracks a moving engine. |
| Unity Web | Viable, not chosen | Dual WebGPU/WebGL2 baseline built in, but we do not use its physics; empty URP web build 7–11 MB. |
| Three.js | Superseded | Rendering library, ships no physics; overturned by the renderer red team on structural grounds. |
| General-purpose physics engines | Rejected for ball physics | Workarounds are swept analytic collision reimplemented badly. Counter-examples exist but none is a benchmark. |
| Deriving physics from scratch | Rejected | Would rediscover twenty years of constants; Planck.js's *port* of Box2D took 400+ hours. |
| `vpinball/vpinball` as source | Rejected as a whole | Dual-licensed; unmarked files carry non-commercial MAME terms. Per-file `// license:GPLv3+` only. |
| PinMAME / ROM emulation | Out of scope | Non-profit-only licence; an original table needs no ROMs. |
| GPL-2.0-only for DragonWar | Rejected | Incompatible with Apache-2.0 Babylon.js. |
| Photoreal art | Rejected | The art budget that would sink a solo project. |
| Non-realistic visual language (cel-shaded, exaggerated) | Not chosen | A legitimate but different product; would rewrite the "feels like a real machine" criterion. |
| Muted earth tones on inserts | Rejected | Undercuts the functional colour channel. |
| High-resolution backglass art | Rejected | The DMD look removes the need. |
| Dead-centre bash toy | Rejected | Rejects to the drain; no backhand. |
| Virtual ball lock; `ball_hold` device | Rejected | Physical payoff is the whole moment; lock deducts from ball count. |
| Same-loop repeated joust; spinner on both loops | Rejected | Alternation is what a joust looks like; both spinners would make the loops the same shot. |
| Hops as emergent physics; non-zero scatter; zero-thickness walls | Rejected | Feel parameters suppress hops; scatter 0 for every era; thin planes tunnel. |
| Flashers folded into the insert layer | Rejected | Coil-class with duty-cycle limits. |
| Extra ball from a single lane | Rejected | Achievement menu makes the table feel authored. |
| Campaign gating (strict sequence / any-order-all-required) | Rejected 2026-08-26 | Author chose independent modes; escalation lives in fiction and scoring. |
| Standup DRAGON targets; mixed bank | Rejected 2026-08-26 | Author chose a six-target drop bank. |
| War start: spell-first-then-lock-then-start-shot; spell-as-sole-trigger | Rejected 2026-08-26 | Author chose order-free start on the second condition — honours the founding sentence when the letters come last, and keeps the lock mandatory. |
| Hot seat: lock stealing; release on player change | Rejected 2026-08-26 | Per-player lock credits backed by the physical device (MPF default). |
| Camera presets; free camera | Deferred 2026-08-26 | Single fixed view for v1; standard-UV lightmaps keep the option. |
| Full operator menu; gamepad; all-four-browser support | Deferred 2026-08-26 | Hobby scope; minimal settings, keyboard, Chromium + Safari. |

## 6. Licence compatibility (verified 2026-08-26 at source — not legal advice)

| Component | Licence | Usable | Condition |
|---|---|---|---|
| DragonWar | GPL-3.0 | — | Copyleft keeps it free downstream. |
| `vpdb/vpx-js` | GPL-2.0-**or-later** per source headers (`package.json` says only `GPL-2.0` — do not rely on it) | Yes | Port under GPL-3.0; **preserve its copyright notices** alongside ours. |
| Babylon.js | Apache-2.0 | Yes | Compatible with GPL-3.0, not with GPL-2.0-only — this is why the project is GPL-3.0. |
| Mission Pinball Framework | MIT (docs CC BY 4.0) | Yes | Ontology and event vocabulary adopted wholesale. |
| `freezy/VisualPinball.Engine` | GPL-3.0 | Yes | Reference for VPX-physics-in-an-engine. |
| `vpinball/vpinball` | Dual; NOASSERTION | Per file | Only files whose first line reads `// license:GPLv3+`. Algorithms as documented behaviour are safe to learn from. |
| `vpinball/pinmame` | Non-profit only | No | Out of scope anyway. |
| `neophob/wpc-emu` | Apache-2.0 | Yes | Not needed. |
| `vbousquet/pinball-parts` | CC BY-SA (one NC-SA node group) | Assets yes | Exclude the NC-SA node group. |
| `vbousquet/vpx_lightmapper` | Not stated in research | Learn from technique | Verify licence before any code use. |
| Author's own recordings of a real machine's mechanical noises | Author-made | Yes | Generic mechanical sound carries no copyrightable expression; record as author-made with date in `ATTRIBUTIONS.md`. Never speech, music, callouts or produced audio (PRD §9; project `CLAUDE.md`). |

Re-check compatibility if either the renderer or the physics reference is ever swapped.

## 7. Research red-team points worth remembering

- Feel is the hard part and where the schedule goes; tunnelling is the easy part. VPX "realism" is a judgement about individual table tuning — quality is table-dependent, not engine-fixed.
- No instrumented realism benchmark exists; the feel test against the Reference machine (PRD UJ-4, SM-4) is the project's own definition, and it must stay a repeatable ritual.
- VPX still carries open physics defects after 20 years (nudge as force on the ball survived two decades). Port; do not derive.
- The bake pipeline is a productivity sink — per the renderer red-team digest, vpx_lightmapper is self-described pre-alpha with no shadowing and no support for movable objects or lights, and Unity practitioners report multi-hour bakes. Budget it.
- Do not cite Pinball FX / Pro Pinball internals (player-forum sourced), or any content-farm build-size figure.

## 8. Qualitative intents the FR structure must not lose

Carried from the brief for whoever writes epics:

- everything is judged by whether it serves the moment
- the dragon is the protagonist, art and rules both answer to it
- each mode's mechanic *is* its fiction (skill shot and "arming" land on the same beat; joust is charge, pass, wheel around, charge again)
- feel wins over fidelity wherever the two conflict
- the walk-up sets the frame for everything after
- insert colour is how the player reads the table without instructions
- the loud loop and the quiet return
- the balls you locked are the balls that come back at you
- nudge danger is the point
- randomness tuned down, hops deliberate
- rustic art under bright RGB
- realism lives in proportions and light, not polygon count
- being finished is the moat
- Lawlor's miss test as a per-shot ethic
- one machine, built properly
