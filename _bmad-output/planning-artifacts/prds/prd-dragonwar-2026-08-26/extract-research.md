# Extract: Technical research → PRD inputs (DragonWar)

**Source of record:** `_bmad-output/planning-artifacts/research/technical-pinball-simulation-engine-and-technology-2026-08-26/research.md` (status: complete; 107 ledger claims — 87 verified, 14 unverified, 4 disputed, 2 overturned; citation check PASS with downgrades applied).
**Supplementary:** `digests/redteam-physics.md`, `digests/redteam-renderer.md` (cited by research.md as [X]/[R]); `digests/features-r1-1.md`, `digests/features-r2-1.md` (skimmed for feature-vocabulary detail only).
**Extracted:** 2026-08-26.

**Tagging convention.** `[R]` = stated in research.md. `[D]` = taken from a digest, not restated in research.md — lower standing; verify before it becomes load-bearing. `[R§n]` cites the research.md section. Bracketed numbers such as [5] are research.md's own source numbers (see §11 of this extract).

**Split rule.** Sections 1–4 and 6–10 are PRD-facing (capabilities, constraints, risks). Section 5 and every sub-list labelled *implementation notes (addendum-bound)* belong in the technical addendum, not the PRD body.

---

## 1. Decision the research was commissioned to make, and its recommendations

**Decision (verbatim frontmatter):** "Commit to a feature set, physics/simulation approach, and technology stack for a browser-first (Windows+macOS) realistic-but-playable pinball simulation." [R]

**Headline answer (R§1):** Build a purpose-built pinball physics core — not a general-purpose rigid-body engine — pair it with Babylon.js for rendering and an MPF-shaped declarative rules layer; build browser-capable but ship native-first.

**Final recommendations (R§8), each with rationale and stated confidence:**

| # | Recommendation | One-line rationale | Confidence (as stated) |
|---|---|---|---|
| 1 | **Physics: port a purpose-built analytic time-of-impact core from vpx-js's architecture**, fixed timestep 480–1000 Hz; budget for triangles, 3D polys, 3D line segments and a broadphase, not just circles and segments. | Every verifiable serious pinball sim uses a purpose-built core (VPX; VPE ported VPX physics into Unity rather than use PhysX); general engines produce the same failure catalogue everywhere. | High on architecture; sourcing hinges on the GPL-2.0 call. |
| 2 | **Resolve the licence question first**, before any code is written. If closed-source commercial, treat vpx-js as a reading reference and write fresh, naming GPL-2.0 as the reason. | Terms read verbatim from primary artifacts; VPX itself is not GPL, vpx-js is GPL-2.0. | High. |
| 3 | **Renderer: Babylon.js, WebGL2 floor with WebGPU progressive enhancement.** | Structural grounds: first-party Havok plugin, engine-shaped, fastest release cadence. The 130-light benchmark favouring it is unverified and must not carry the decision. | Medium. |
| 4 | **Rules: adopt MPF's device ontology and event vocabulary wholesale** (MIT). Rules layer is a pure function of switch events with zero knowledge of ball velocity. | Complete, typed, MIT-licensed ontology (50+ devices, 267-page event vocabulary, explicit failure states); separation makes rules headlessly testable. | High. |
| 5 | **Lighting: baked per-light-group additive lightmaps with standard UV lightmaps — not camera-projected.** Decide before modelling starts. | The shipped prior art (vpx_lightmapper) projects UVs from the camera, which locks the camera and rules out VR; standard UVs are view-independent. | (Not stated; carried as a decision-before-modelling gate.) |
| 6 | **Tune realism with elasticity falloff and coil ramp-up; set scatter to zero.** Randomness is tuned *down*. | VPE recommends Scatter Angle = 0 for every era; feel comes from velocity-dependent restitution and solenoid ramp-up, not noise. | (Not stated; sourced to [5][3].) |
| 7 | **Ship native-first via Tauri/Electron; treat browser as a demo channel.** | Browser-first is the least-evidenced premise in the research; the recommended architecture is browser-capable at no extra cost, so the option is preserved without betting on it. | (Not stated; sourced to [27].) |
| 8 | **Author the playfield as one compound collision body** regardless of engine, and model walls and floor with real thickness — never zero-thickness planes. | Seam-catching fixes do not cross bodies; zero-thickness planes are a known tunnelling hazard. | (Not stated; sourced to [43][16].) |

**Three spikes the research says to run before committing (R§8)** — each closes a gap research provably cannot:

- A 1000 Hz JS loop over 6 bodies vs the same scene in Rapier/Jolt WASM. Nobody has published this; the pinball-relevant regime (1–6 bodies) is unmeasured.
- The lightmap scaling envelope — light-group count, lightmap resolution, frame cost. vpx_lightmapper publishes no numbers.
- Browser build size and load time, measured. Every published figure traces to content farms and was discarded.

---

## 2. Feature vocabulary — what "Stern-like / modern machine" means

Each line is a capability statement a player would recognise. `[R]` items are in research.md §2; `[D]` items are digest-only enrichment.

### 2a. Rules spine (the modern Stern skeleton)

The Godzilla rulesheet read end-to-end gives a skeleton that Jurassic Park and CGC's Pulp Fiction independently reproduce [R][6][7][8]:

> skill shot → ramp qualifiers → scoop as mode selector → tiered battles that stack with multiball by priority → 3 mini-wizards → one final wizard mode

- **FV-01** The game offers a **skill shot** at ball launch. [R]
- **FV-02** Shots (ramps) act as **qualifiers** that must be completed before a mode can be started. [R]
- **FV-03** A **scoop** serves as the **mode selector / mode-start device**. [R]
- **FV-04** The game has **tiered mode "battles"** that **stack with multiball by priority** (a mode and a multiball can run concurrently, with a defined precedence). [R]
- **FV-05** The game has **three mini-wizard modes** reached by completing tiers of content. [R]
- **FV-06** The game has **one final wizard mode**. It may ship **post-launch** — Stern shipped Godzilla's and Rush's final wizard modes in a later code drop, so v1 need not gate on it. [R][9]
- **FV-07** **Ball-count grammar:** regular multiball is **3-ball**; **4-ball** is reserved for the finale. [R][6]
- **FV-08** **Jackpots are progressive and seeded by prior play** (e.g. "500k + 500k per Godzilla Multiball started"). [R][6]
- **FV-09** **Extra balls** are awarded from a **menu of long-horizon achievements**, not one lane. [R][6]
- **FV-10** **Playfield multipliers** and **combo multipliers** are **separate systems** (e.g. timed 2x playfield vs up-to-10x loop combos). [D]
- **FV-11** **Combos** (named, ordered multi-shot sequences) are a scoring feature with tiered completion rewards. [D]
- **FV-12** **End-of-ball bonus** is a per-category accumulator multiplied by an adjustable **Bonus X**; it is **forfeited by tilt**. [R][D]
- **FV-13** **Code depth is layered:** obvious early objectives (start a mode, light multiball) over deeper strategy, with **multiple viable scoring routes** rather than one dominant exploit. Overpowered shot multipliers are a known balance hazard. [D] (design opinion, low confidence)
- **FV-14** **Rules evolve post-launch**; retrospectives judge final code, not launch code. Content can be phased. [R][D]

### 2b. Lighting as game state

- **FV-15** **Insert colour is the mode-state channel, not decoration** — e.g. white = qualify, red = rescue, yellow = set trap, green = the moving target; jackpot progression is shown as a colour ladder (blue → red). [R][7][D]
- **FV-16** Lighting has **four independently-driven channels** the sim must model separately: **GI, feature inserts, flashers, architectural** (arch, back panel, speaker). [R][8][10]
- **FV-17** **Flashers are coil-class outputs** (charted with solenoid drivers, not the lamp matrix) and need **duty-cycle limits**. [R][11]
- **FV-18** Lighting is a **commanded, per-LED addressable channel** from game code (Spike node-bus), not a hardwired lamp matrix; **RGB inserts** are the atomic unit of progress indication. [D]

### 2c. Machine-operations layer (what player glossaries omit but a realistic sim must reproduce) [R§2][12][13]

- **FV-19** **Tilt** forfeits the **end-of-ball bonus** and **ends the ball**; it does **not** zero the score. **Warnings are per-player.** Because the bob keeps swinging, tilt needs a **debounce window and a settle time**. On tilt, flippers and autofire coils are disabled until the ball drains. [R][D]
- **FV-20** **Tilt warnings** are an **operator adjustment** with a low default (Stern default 1; Competition preset sets 2). [R][D]
- **FV-21** **Slam tilt** is a **different sensor** (a switch on the coin door, not the plumb bob) and **ends all games in progress**. [R]
- **FV-22** **Ball save** has: a displayed timer; a **"hurry up" state measured backwards from expiry**; a **grace period past the displayed expiry during which drains still save**; and a **timer-start event separate from enable** (it does not count down until you plunge). Per-mode ball-save timers override the global value; saved balls may be **auto-launched** or player-plunged. [R][D]
- **FV-23** **Match** at end of game: the number is always a **multiple of ten**; Stern's default match percentage is reported as **8%** — below the 10% a uniform draw would give, making it a **weighted payout, not a lottery**. **Unverified** — traces to a 2005-era manual OCR and a widely repeated operator figure; confirm before implementing. [R]
- **FV-24** **Ball search** is an **escalating three-phase protocol** with per-device priority callbacks and a defined **failure action** (new ball / end ball / end game), not one coil sweep; real machines **suppress parts of it when rules state would be corrupted** (e.g. do not release locked balls during a multiplier timer). [R][D]
- **FV-25** **Adjustments are a layered store:** factory defaults → install preset → operator overrides. Vocabulary includes **per-mech calibration** (`RIGHT FLIPPER POWER` default 235, `TROUGH EJECT POWER`, per-mech millisecond timing offsets). [R][12]
- **FV-26** **Tournament/competition mode is a preset, not a flag:** enabling `COMPETITION MODE` *sets* `TILT_WARNINGS` to 2 **and removes options from other menus** — it both sets and constrains. [R][12]
- **FV-27** Classic operator adjustments also cover **replay percentage/award, match percentage, credit limit, free play, high-score initials, custom message**. [D]
- **FV-28** Ball devices have **explicit failure states** (`eject_failed`, `ball_missing`, `broken`) — the reference design assumes mechanisms fail. A sim may or may not model failure, but its rules layer should tolerate those events. [R][39]

### 2d. Playfield device vocabulary (what the table is made of)

Universal on essentially every modern machine surveyed [D] (design judgement, low confidence): ramps, orbits, inlanes/outlanes, slingshots, pop bumpers, scoops, standups, a central bash toy. Common but optional: kickbacks, up-posts. Common but not universal: captive balls, subways.

- **FV-29** **Flippers** (a lower pair; an **upper flipper** is optional and needs a reliable feed). [R][D]
- **FV-30** **Slingshots** (kicker solenoid acting on a rubber band). [D]
- **FV-31** **Pop bumpers / jet bumpers.** [D]
- **FV-32** **Ramps** and **wireforms/habitrails** returning to inlanes or raised playfields. [D]
- **FV-33** **Orbits / loops** — a shot that hugs the outer rim and returns from the other side. [D]
- **FV-34** **Spinner** — awards per rotation. [D]
- **FV-35** **Drop targets** and **drop-target banks** (independently resettable). [D]
- **FV-36** **Standup targets.** [D]
- **FV-37** **Scoop / saucer / VUK (popper)** — a hole that catches and ejects the ball, possibly vertically to a raised playfield. [R][D]
- **FV-38** **Inlanes and outlanes**, with **lane change** (flipper button rotates the lit insert across a lane set — a standard convention, per-title on modern Stern). [D]
- **FV-39** **Kickback** in an outlane (optional). [D]
- **FV-40** **Up-post** between the flippers that blocks the centre drain (optional). [D]
- **FV-41** **Captive ball** and **subway** (optional). [D]
- **FV-42** **Ball lock — physical vs virtual are distinct types** (MPF: `ball_holds` vs `multiball_locks`). Virtual locks progress toward multiball without trapping a ball; they exist for trough capacity, cost, reliability and per-player tracking (another player cannot "steal" your locks). [R][13][D]
- **FV-43** **Diverter** — a playfield element that routes the ball to one of several paths, driven by *eject intent* rather than directly by rules. [D]
- **FV-44** **Magnets** that catch, hold, throw or "shake" the ball (a JJP signature; not required). [D]
- **FV-45** **Bash toy** — a central sculpted target. [D]
- **FV-46** **Plunger / launch device** (manual and auto-launch) and **trough / drain** with ball counting. [D]

### 2e. Display, audio, and the "connected" surface

- **FV-47** A **backbox display** — full-colour **LCD** is the modern Stern norm (Spike 2, from 2016); DMD and 13-segment alphanumeric displays are legitimate alternatives (CGC Pulp Fiction ships segment displays and is still "modern"). [D]
- **FV-48** A **large, event-indexed callout pool**, music cues and animations, all resolved from **one code path per switch closure** (display and audio are not independent subsystems). Modern scale: 250–1000+ speech calls. [D]
- **FV-49** **Player accounts, achievements, leaderboards** (Stern Insider Connected, 2021) are now part of the expected modern feature surface. [D] — a scope decision for the PRD, not a research recommendation.

### 2f. "Feel" features that separate great from mediocre [D] (mostly design opinion)

- **FV-50** **What happens on a miss** is a first-class design concern: missed shots must not return "clunky" or "in your face"; **shot rejection frequency on core shots** is what gets a machine labelled bad (live 2025 example: Fall of the Empire). [D]
- **FV-51** Shots should be **thematically motivated** — represent something from the theme, not just be "there". [D]
- **FV-52** Geometry rules a sim can implement directly: the ball should not hit bare metal except true ball guides; ball guides end at rubber posts; orbit exits feed the flippers; **stop-and-go shots mixed with flow shots**; middle shots easier for beginners; very fast games are hard for beginners. "Challenging, but not intimidating." [D] (medium confidence)

**Not covered by the research (do not invent from it):** attract mode, high-score entry flow beyond the initials adjustment, replay/credit economics beyond adjustment names, per-mode timers other than ball save, audio mixing, Jersey Jack mechanisms (unverified — see §9).

---

## 3. Machine geometry and physical numbers (R§3)

**Staleness:** machine geometry and physical specs **do not stale** — standard-body dimensions and ball spec have been constant for decades (R§11).

### 3a. Well-sourced, usable as-is

| Quantity | Value | Confidence | Note |
|---|---|---|---|
| Standard-body playfield | **20.25 × 42.00 in (514.4 × 1066.8 mm)** [14] | high | Multi-manufacturer table; cabinet dims from Flippers.be only |
| Factory pitch (modern) | **6.5°** (EM era ~5°) [16] | high | From a Spooky manual (2024) |
| Competition pitch range | **6.5–8.5°, 7.5–8° common; no mandated standard** [17] | high | PAPA varies it per game → pitch is a *design surface*, expose it |
| Ball diameter | **1.0625 in / 26.99 mm** [18] | high | |
| Ball mass | **~80 g** carbon steel (80–82 g spread) [5] | medium | |
| Flipper bat | **3.000 in bare, 3.125 in rubbered** [5] | medium | |
| Flipper coil FL-11629 (blue) | **power ~4 Ω / hold ~132 Ω, dual-wound, 50 V** [19] | high | |
| Flipper pulse model | **~30 ms at 70% power, then hold at 25% PWM** [20] | medium | MPF page renders client-side; not re-verifiable by fetch |
| Rubber durometer | **45–50 Shore A** across common compounds [21] | low | |
| Flipper pivots (absolute coords) | holes **1/2 in** diameter, centres **7 in** up from the bottom edge, **6-13/16 to 7 in** apart [23] | medium | **Hobbyist-sourced** |
| Flipper-coil strength banding | Marco's five-tier ordering by shot-distance intent: **yellow** (short flippers, close shots) < **green** (close shots near drops) < **red** (standard) < **orange** (long shots) < **blue** (long shots, high ramps) [19] | high | Better basis for banding flipper strength than resistance alone |

### 3b. De-facto tuning constants (VPX / vpx-js) — dimensionless values port; strength values do not

| Quantity | Value | Note |
|---|---|---|
| Flipper elasticity | **0.88** [5] | dimensionless, ports directly |
| Elasticity falloff | **0.15** [5] | dimensionless |
| Friction | **0.8–0.9** [5] | dimensionless |
| Scatter | **0** — for every era [5] | randomness tuned down |
| Coil strengths | era-banded, **VPX-internal units, do not port** [5] | |
| Per-object defaults in VPX core | elasticity 0.3, falloff 0.0, friction 0.3, scatter 0.0 rad [3] | four tunables only |
| vpx-js constants | `PHYSICS_STEPTIME = 1000` µs, `PHYS_SKIN 25.0`, `PHYS_TOUCH 0.05`, `C_DISP_GAIN 0.9875`, `STATICTIME 0.005` [32] | addendum-bound; "the tuning constants a bespoke core takes years to discover" |

### 3c. Numbers that **do not exist** (confirmed absent after two rounds of targeted search [22])

- Any **coefficient of restitution or friction** for a steel ball against a clearcoated playfield or a rubber ring.
- **AWG and turn counts** for coils from any vendor.
- **Manufacturer-stated coil pulse duration.**
- A **dimensioned drain-zone specification.**
- A **measured flipper tip gap** — "the one unmeasured quantity in the entire drain triangle, and it is the geometry the whole game balances around."
- Any **hours figure for authoring one table** — "do not let one be invented" [56].
- **Jersey Jack mechanism details** (magnet counts, rocking playfield) — doc host unreachable; not usable as spec [57].

**Consequence for the PRD:** VPX's tuned constants are the de facto standard *because they are the only published, coherent, working parameter set* — and VPX physics quality is **table-dependent, not engine-fixed** (each table ships its own tuning) [2]. Realism is a tuning-and-authoring problem more than an engine problem.

---

## 4. Simulation fidelity requirements (R§4, R§6)

### 4a. Player-perceivable requirements

- **SF-01** The ball **never falls through the table or passes through geometry**, at any speed and regardless of display frame rate. ("Nothing tunnels regardless of frame rate" is the bar a 480 Hz browser demo already clears [31].)
- **SF-02** **Flipper technique works as on a real machine:** live catches, light taps, dead bounces, post passes — because flippers are true rigid bodies driven by torque with a **coil ramp-up** (solenoid acceleration time), and they **bounce off their stoppers properly**. [3][5]
- **SF-03** **Flipper pulse-then-hold behaviour** is reproduced (strong pulse, then hold at reduced power), so holding a flipper up is possible and a cradled ball stays cradled. [20]
- **SF-04** **Rebounds feel right at every speed:** lively at low speed, **no pingy rebounds or airballs at high speed** — velocity-dependent restitution ("elasticity falloff"). [5]
- **SF-05** **No artificial randomness.** Scatter is zero; two identical inputs produce identical outcomes. Realism comes from the physics, not from noise. [5]
- **SF-06** **Nudging moves the table, not the ball** — a cabinet oscillation that the ball responds to; VPX's long-lived defect of implementing nudge as force on the ball is the anti-pattern. [3][49]
- **SF-07** **Tilt is a real pendulum:** the tilt bob swings and settles, producing warnings then a tilt, with debounce and settle time (ties to FV-19/20). [3]
- **SF-08** **Ball spin and the sliding-to-rolling friction transition** are simulated (the ball behaves differently when spinning off a flipper vs rolling). [D — redteam-physics; VP10 wiki [30]]
- **SF-09** **Ball-to-ball collisions** during multiball behave plausibly (restitution is hardcoded in the reference). [3]
- **SF-10** **Switches trigger reliably for fast balls** — rollovers, targets and the drain never miss a ball because it was moving quickly (a documented failure of general engines' sensors [45]).
- **SF-11** **No stuck balls, no energy gain, no frame stalls.** The reference's explicit playability concessions are the model: forced time advancement to escape collision clusters, a catch-up bailout that discards simulated time rather than stalling the frame, and stable resting contact (no creep). [3][44]
- **SF-12** **Pitch is an exposed, player/operator-facing difficulty knob** (see §3). [17]
- **SF-13** **Real proportions.** The one browser 3D pinball found was criticised for feel — ball far too small relative to real proportions, launcher too bouncy, game too fast — and never for tunnelling. Ball, flipper and playfield dimensions must match §3. [46]
- **SF-14** **Lighting is simulated as four channels** (GI / inserts / flashers / architectural), inserts are modelled as **a light below the playfield through a translucent cup**, not as decals. [40]
- **SF-15** **A defined, measurable realism target.** No quantitative or instrumented realism benchmark for pinball simulators exists anywhere; every ranking is forum opinion. If realism is DragonWar's differentiator, **the project must define and measure it itself** — a genuine opportunity and a genuine risk. [2]
- **SF-16** **The rules layer never knows ball velocity.** Physics emits switch events; rules are a pure function of events → state → presentation. This is what makes the rules **headlessly testable** without rendering or physics. [R§5]

### 4b. Implementation notes (addendum-bound)

- **Fixed timestep 480–1000 Hz** (VPX: `PHYSICS_STEPTIME 1000` µs; Neon Gutter: 480 Hz), **semi-implicit Euler**, with **adaptive subdivision within each step driven by collision events** so effective resolution during contact is far finer than 1 ms. [3][30][31] Verify the constant against vpx-js [32], not upstream [3] (the upstream path 404s and carries a contradictory `DEFAULT_STEPTIME = 10000`).
- **Analytic closed-form time-of-impact collision:** `SolveQuadraticEq` for circles; `hittime = bnd / -bnv` for line segments; advance to earliest hit, resolve, repeat. **Anti-tunnelling is architectural, not a feature.** The high tick rate — not CCD — is the mechanism: at 1000 Hz a 6 m/s ball moves ~6 mm per step, below Jolt's `mLinearCastThreshold = 0.75` × inner radius (~10 mm), so CCD never engages and does not need to. [15][3]
- **Primitive set is bigger than circles + segments:** triangles, 3D polygons, 3D line segments, points, planes, **plus two broadphase structures (quadtree and k-d tree)**. [X][32]
- **Complex 3D geometry** is handled by authors hand-building **simplified invisible collision scaffolding**, with the detailed visual mesh flagged non-collidable — "the geometry is simple" is an authoring discipline. [X]
- **Flipper model:** inertia = ⅓·mass·radius², ramped solenoid torque, quartic end-of-stroke torque fade, return spring. [3][5]
- **Four per-object tunables only:** elasticity, elasticity falloff, friction, scatter. [3]
- **Nudge/tilt:** damped-harmonic cabinet oscillator, Kalman-filtered accelerometer input, tilt bob as an actual pendulum. [3]
- **Stability concessions to copy:** forced time advancement out of collision clusters; a **200 ms catch-up bailout** that discards simulated time; hardcoded ball-ball restitution. In a TOI design the stability hazard is **iteration explosion, not tunnelling**. [3]
- **Playfield as one compound collision body; walls and floor with real thickness** (Jolt's seam fix does not cross bodies; resting spheres creep unless contact caching is disabled; LinearCast bodies are Discrete against sensors) — every one of these engine constraints disappears in a purpose-built core where **switches are analytic zone tests, not physics sensors**. [43][44][45]
- **Rules layer:** MPF device ontology (50+ typed devices incl. `dual_wound_coils`, `ball_holds` vs `multiball_locks`, `playfield_transfers`, `psus`), four-phase event convention (`X_will_start` → `X_starting` → `X_started` …), explicit failure events. [13][39]
- **Lighting:** one baked texture per light group, group mesh optimised by deleting unlit faces, composited additively over baked base geometry; cost is one multiply-add per group. Bake RGB inserts to **white** and tint at runtime. Use **standard UV lightmaps** (view-independent), not camera-projected. [40][R]
- **No commercial pinball sim publishes engineering-level physics detail** (Zen, Barnstorm, FarSight): no tick rate, solver, collision strategy; claims about Pinball FX / Pro Pinball internals trace to player forum posts and **must not be cited**. The public engineering record is VPX's source and essentially nothing else. [3][X]

---

## 5. Technology selection (R§5) — addendum-bound

**Requirements frame (hard gates):** runs on Windows + macOS; high-fidelity ball dynamics at 480–1000 Hz; stable 60+ FPS; lighting-dominated scene (50–150 individually addressable lamps); solo/small team; commercially unencumbered.

### 5a. Candidates and verdicts

| Candidate | Verdict | Reason |
|---|---|---|
| **Unreal Engine** | Disqualified | HTML5 left the engine at 4.24; no UE5 web target or plan. Pixel Streaming puts a network round-trip in the flipper loop and needs per-session GPU capacity [28]. |
| **Godot 4 web** | Disqualified for browser | Web export supports **only** the Compatibility renderer (no Forward+, so the good lighting is unavailable), **no AudioEffects or procedural audio**, no C#, docs steer users away from Safari [29]. Fine natively; wrong for this target. |
| **Bevy** | Weak | Pre-1.0, ~4 breaking releases in 16 months, each requiring migration of the project and every pinned plugin; physics is a third-party dep tracking a moving engine. Highest churn tax [28]. |
| **Unity Web** | Viable, not chosen | Free under $200k revenue, no runtime fee. WebGPU promoted out of experimental in 6.6 with automatic WebGL2 fallback [R7]. Cost: an **empty** Unity 6 URP web build is ~7–11 MB compressed [27]. Rejected because we are not using its physics anyway, which removes most of what it offers. |
| **Three.js** | Superseded by red team | Rendering **library**, ships no physics; the initial finding named it, the renderer red team overturned it on structural grounds [34]. |
| **Babylon.js** | **Recommended** | See below. |
| **General-purpose physics (Jolt / Rapier / Havok / PhysX / cannon-es / Ammo)** | Rejected for ball physics | Every general-engine pinball attempt fights the same failures (kinematic flippers teleport so CCD never sees velocity; substeps raised to 64; flipper colliders thickened) — those workarounds *are* swept analytic collision reimplemented badly [24][25][26]. Counter-examples run but none is a community physics benchmark [50][51]. |

### 5b. The picks

- **Renderer: Babylon.js.** Structural leg (solid): Babylon is engine-shaped, ships a first-party Havok plugin, and is the most actively released component in the stack (~12 releases in 5 weeks; 9.22.2 on 2026-08-24) [34][35]. Benchmark leg (weak, **unverified**): 130-light scene, Three.js 24 FPS vs 96 FPS — backend unstated and the comparator ran heavier post-processing; **do not let it carry the decision** [33].
- **Graphics baseline: WebGL2 floor + WebGPU progressive enhancement.** WebGPU at 85.56% global usage; Firefox 141 default-on for Windows; target excludes mobile and Linux (the two weakest surfaces) [36][37]. But MDN still marks WebGPU *not Baseline*, so WebGPU-only over-corrects [38]. Clustered lighting appears to be a WebGPU-path feature in both engines (medium confidence — Three.js docs are silent on the WebGL2 backend) [41][42].
- **Physics: purpose-built core, ported from vpx-js rather than written blind.** vpx-js already contains this exact architecture in TypeScript (`hit-circle`, `hit-line-3d`, `hit-triangle`, `hit-quadtree`, `hit-kd`, constants) [32]. **Correction to the red team:** vpx-js is **dormant** — default-branch HEAD is **2020-11-12**; later activity is bot branches. This is "port from a frozen but proven reference," not "adopt a living library" [2]. GPL-2.0 is the decision variable (§7).
- **Rules layer: MPF-shaped, declarative, fully separated from physics** (MIT) [13][39].
- **Lighting: baked per-light-group additive lightmaps, standard UV.** The red team caught a circular justification: baking is **not** required by light count — Babylon's clustered forward path does 2,000 dynamic lights at 1080p/60 fps on an RTX 4070 laptop (300–500 at 4K) and a playfield needs 50–150 [41]. Baking still earns its place because it delivers **indirect bounce and contact-soft shadows** that clustered lighting does not — that is the reason, not light count [40][R].
- **Packaging: native-first via Tauri/Electron; browser build as demo channel** [27].

---

## 6. Non-functional requirement candidates

Numbers and hard constraints only. Items marked *gap* are things the research does **not** quantify — the PRD must set them or flag them.

| # | Candidate | Value / constraint | Source |
|---|---|---|---|
| NFR-01 | **Target platforms** | Windows + macOS (hard gate). **Mobile and Linux are explicitly outside the target** (they are the two weakest WebGPU surfaces). | R§5 |
| NFR-02 | **Physics rate** | Fixed timestep, **480–1000 Hz**; effective sub-ms resolution during contact. | R§1, §4, [30][31][32] |
| NFR-03 | **Frame rate** | **Stable 60+ FPS**; physics decoupled from render rate (≈16 substeps per rAF frame at 1000 Hz, not a wall-clock 1 ms timer). | R§5; [X] |
| NFR-04 | **Frame-rate independence** | Nothing tunnels and gameplay is identical regardless of display frame rate. | [31] |
| NFR-05 | **Stall behaviour** | A catch-up bailout (**200 ms** in the reference) that discards simulated time rather than stalling the frame. | [3] |
| NFR-06 | **Lighting scale** | **50–150 individually addressable lamps** driven as four channels; clustered lighting gives ~2,000 direct lights at 1080p/60 on an RTX 4070 laptop, 300–500 at 4K (WebGPU path). | R§5, [41] |
| NFR-07 | **Graphics API baseline** | **WebGL2 floor, WebGPU progressive enhancement.** WebGPU 85.56% global usage (2026-07); Chrome/Edge from 113; Firefox 141 default on Windows; Safari 26+ partial; MDN "not Baseline". | [36][37][38] |
| NFR-08 | **Browser support matrix** | Not set by the research. Reference minimums from Unity's WebGPU filter: Chromium ≥146, Firefox ≥152, Safari ≥26 with WebGL2 fallback. *Gap: PRD must state the supported browsers.* | [R7] |
| NFR-09 | **Packaging** | Native-first desktop via **Tauri or Electron**; browser build maintained as a demo channel at no extra architectural cost. | R§8 |
| NFR-10 | **Payload / load time** | **No verified figure exists.** Comparator: an empty Unity 6 URP web build is ~7–11 MB compressed. All "15–40 MB / 3–15 s" claims were content-farm sourced and discarded. *Must be measured (spike).* | [27], R§8 |
| NFR-11 | **Input latency** | *Gap.* Not quantified. Only constraint stated: the flipper loop must be local — Pixel Streaming was disqualified for putting a network round-trip in it. | [28] |
| NFR-12 | **Determinism** | Scatter = 0; no randomness in ball physics. | [5] |
| NFR-13 | **Licensing** | Commercially unencumbered and GPL-3.0-compatible; **no non-commercial components**; every vpinball file checked individually. | R§7; project CLAUDE.md |
| NFR-14 | **Team constraint** | Solo/small team → dependency churn is a selection criterion (Bevy rejected on it). | R§5 |
| NFR-15 | **Camera** | Fixed, pre-configured POV per table is how the genre is played (VPX View Setup; Pinball FX players prefer least-moving presets). VR head-tracking is a possible future only if lightmaps use standard UVs. | [R] |
| NFR-16 | **Lightmap memory** | *Gap.* No shipped budget exists; one forum judgement treats ~10 × 2048² RGBA8 (≈160 MB uncompressed) as "a lot", and per-light-group baking multiplies texture count by group count. *Must be measured (spike).* | [R], [55] |
| NFR-17 | **Audio in the browser** | The browser build needs an audio-effects path (Godot web was disqualified partly for having none). | [29] |
| NFR-18 | **Testability** | Rules layer runs headless (no physics, no rendering) as a pure function of switch events. | R§5 |
| NFR-19 | **Accessibility, offline, localisation, save/persistence** | *Not covered by the research at all.* PRD must decide independently. | — |
| NFR-20 | **Decision freshness** | Engine versions and WebGPU browser support must be re-checked by **2026-09-26** before the renderer decision is finalised. | R§11 |

---

## 7. Licensing trap and provenance (R§7)

**Headline:** *every* open-source pinball physics implementation is encumbered, and **Visual Pinball is not GPL** as commonly believed.

### 7a. The findings, exactly

| Project | Licence | Status | Usable by DragonWar? |
|---|---|---|---|
| **vpinball/vpinball** | **Dual, NOASSERTION.** LICENSE describes a migration begun in 2020: files converted to GPLv3+ carry `// license:GPLv3+` on their **first line**; verbatim, *"Every file/snippet that doesn't feature any explicit license mentioning, will stay (for now) under the 'old MAME'-like license"*, whose terms read *"Redistributions may not be sold, nor may they be used in a commercial product or activity."* GitHub's detector reports NOASSERTION, not GPL [1]. | Active | **Only files whose first line reads `// license:GPLv3+`. Unmarked files are non-commercial and cannot be used.** Check every file individually. Algorithms *as documented behaviour* are safe to learn from. |
| **vpinball/pinmame** | Old-MAME → BSD-3 migration; *"Selling either is not allowed"*, *"strictly a non-profit project"* [52]. | Active | **No.** Explicitly non-profit. |
| **vpdb/vpx-js** | **GPL-2.0**, cleanly detected by GitHub [2]. | **Dormant since 2020-11-12** (later activity is bot branches); scripting unfinished. | Only if DragonWar ships GPL-compatible. **Porting inherits its authorship: preserve its copyright notices alongside ours** (project CLAUDE.md — stripping them breaks the licence grant). |
| **freezy/VisualPinball.Engine** | **GPL-3.0**, unambiguous [2]. | Active (HEAD 2026-08-23) | Yes, GPL-3.0 is our licence. |
| **missionpinball/mpf** | **MIT** (docs CC BY 4.0) [39]. | Active | Yes — ontology and event vocabulary safe to adopt wholesale. |
| **neophob/wpc-emu** | **Apache-2.0** [53]. | Active | Yes — *the only permissive option found*. |
| **vbousquet/pinball-parts** | **CC BY-SA** (one NC-SA node group to exclude) [54]. | — | Yes for assets, excluding the NC-SA node group. |
| **vbousquet/vpx_lightmapper** | (licence not stated in research.md) [40] | Active, self-described pre-alpha | Learn from the technique; verify licence before any code use. |

### 7b. Practical consequences (R§7 verbatim intent)

- MPF's ontology and vpinball's *algorithms as documented behaviour* are safe to learn from.
- Copying vpinball code requires checking **each file's first line**.
- A GPL-2.0 port of vpx-js is only viable if DragonWar ships GPL-compatible.
- Recommendation 2: **resolve the licence question before any code is written.**

### 7c. Note outside research.md — project state as of this extract

The repository's `CLAUDE.md` records that DragonWar is **GPL-3.0** and that the project "already found one case where `package.json` said `GPL-2.0` while the source headers granted `GPL-2.0-or-later`, and the difference decided the whole licensing plan." It also lists **GPL-2.0-only as not acceptable** (it conflicts with Apache-2.0 dependencies). The research's "vpx-js is GPL-2.0, cleanly detected" reading is therefore a *package-metadata* reading; the load-bearing licence is what the **source headers** grant, and per CLAUDE.md that was verified as GPL-2.0-or-later. The PRD author should treat the licence question as **resolved at the project level** (GPL-3.0, vpx-js portable under or-later with notices preserved) but should **not** cite research.md for that resolution — research.md predates it.

---

## 8. Contrary evidence and risks (R§7 plus the red-team digests)

### 8a. Against the custom-physics recommendation

- **Writing your own physics is a documented way to lose a year.** Planck.js's author reported **400+ hours and ~20k lines** for a *port* of Box2D's already-solved algorithms, not original design [47]. Box2D's own manual documents permanent limitations after a decade [48].
- **The asymptote is visible:** Visual Pinball, with 20+ years and many contributors, still carries **open** physics defects — "Unrealistic Nudge Physics" (open since 2026-03-18), "Broken ball physics in WINE" (open), plus a closed history of stuck balls, inconsistent hit detection, energy gain to "supersonic speeds", floating balls, and a *physical model* error (nudge as force on the ball rather than table movement) that survived two decades [49]. **Mitigation:** port from vpx-js rather than derive fresh.
- **Counter-examples exist and should not be waved away:** browser pinball runs on three.js + cannon-es, R3F + Rapier, three.js + Ammo with CCD motion clamping [50][51]. None is a community physics benchmark, but "a general engine cannot do browser pinball" would be an overstatement.
- **1000 Hz is not load-bearing:** the requirement is "swept/analytic collision at a rate high enough that nothing tunnels"; 480 Hz cleared it [31].
- **WASM wins at scale** (Rapier reports 2–5× vs 2024 releases; ~1.15 ms for 3000 bodies) — but at 1–6 bodies the JS↔WASM boundary cost is comparable to the maths saved, and the small-body regime is **unmeasured** [X]. Spike recommended.
- **"Simple primitives" understated the job** — triangles, 3D polys, 3D segments and two broadphase structures were all needed by the reference [X].

### 8b. Against the renderer / browser recommendation

- **Browser-first is the least-evidenced premise in the research.** No named commercial browser game at "visually rich 3D simulation" fidelity was found; Unity's own web showcase is demoware-scale while its high-fidelity titles ship native. Browser economics are ad-portal economics. Absence of evidence, not evidence of absence — but it is a foundational premise and deserves an explicit decision [27][R].
- **The Three.js-vs-Babylon benchmark is not controlled in either direction** — backend unstated, comparator ran heavier post-processing [33]. Take the pick on structural grounds only.
- **The baking justification was circular** — light count does not force baking on WebGPU; indirect bounce and soft shadows do [41][R].
- **The bake pipeline is a productivity sink:** vpx_lightmapper is self-described "pre-alpha, no support, bugs everywhere", has **no shadowing support**, and bakes do not work for movable objects or lights; Unity practitioners report multi-hour bakes [R].
- **Unity Web was dismissed too quickly** in the initial finding — it has the dual-baseline WebGPU/WebGL2 strategy built in; its real cost is payload [R7].
- **Camera-projected lightmaps lock the camera** and rule out VR head-tracking; standard UV lightmaps do not — resolve before modelling [R].

### 8c. Risks the research names explicitly

- **Feel is the hard part, and it is where the schedule will actually go.** Tunnelling was the expected risk; it is the easiest to solve. VPX realism is a judgement about one author's table tuning [2][46].
- **Nobody has defined the realism target.** If realism is the differentiator, the project must define and instrument it [2].
- **The field is empty at the top:** vpx-js stopped in 2020 with scripting unfinished; no WebGPU-native pinball project of any maturity exists. "Nobody has done this. That is either the opportunity or the warning, and honestly it is both" [2].
- **Do not cite** Pinball FX / Pro Pinball internals (player-forum sourced), the Chipmunk author's pinball guidance (unreachable), or any content-farm build-size figure [X].
- **JJP mechanism claims are unverified** and must not become spec inputs [57].

---

## 9. Open questions (R§9, verbatim)

| Question | What would answer it |
|---|---|
| Is browser-first the right distribution premise? | A business decision, not a research one. No public browser-vs-Steam revenue comparison for a 3D title exists [27]. |
| What is the measured flipper tip gap and arc? | A DXF/SVG Bally playfield template — the highest-value unclaimed artifact. Would settle tip gap, outlane widths and post positions at once [23]. |
| Restitution/friction for steel-on-clearcoat and steel-on-rubber? | Measurement. Confirmed unpublished after two rounds [22]. |
| Can `neophob/wpc-emu` (Apache-2.0) be driven by an external simulation? | One round on its API surface. The only permissive asset in the ecosystem [53]. |
| How many hours does one table actually take? | A VPUniverse version history gives a sourced *elapsed-time* span. No hours figure exists anywhere — **do not let one be invented** [56]. |
| Jersey Jack mechanism details (magnet counts, rocking playfield)? | Their doc host has a broken certificate. Unverified after two rounds — not usable as spec [57]. |

---

## 10. Staleness map (R§11)

| Claim class | Window | Re-check by | Why |
|---|---|---|---|
| **Versions & compatibility** (Babylon, Jolt, Rapier, Unity, Godot) | 1 mo | **2026-09-26** | Babylon shipped ~12 releases in 5 weeks [35]; Rapier's binding lacks tags entirely [W8] |
| **WebGPU browser support** | 1 mo | **2026-09-26** | Firefox/Safari status is actively moving [36][37] |
| **Pricing** (Unity, PlayCanvas) | 3 mo | **2026-11-26** | Unity's $2,200/seat figure is already a 2025-01 number and failed the freshness bar [28] |
| **Ecosystem health** (repo activity, maintenance) | 6 mo | **2027-02-26** | vpx-js dormancy, wpc-emu activity, Jolt/Rapier cadence [2][53] |
| **Landscape** (engine field, browser-game viability) | 12 mo | **2027-08-26** | [27][28] |
| **Patterns** (VPX architecture, MPF ontology, rule structure) | 2 yr | **2028-08-26** | Stable; VPX's core design has held since VP10 [3][30] |
| **Machine geometry & physical specs** | — | *does not stale* | Standard-body dimensions and ball spec have been constant for decades [14][18] |

**Earliest re-check: 2026-09-26** — engine versions and WebGPU browser support; both feed the renderer decision directly.

**Time-sensitive facts inside this extract:** Babylon 9.22.2 (2026-08-24); WebGPU 85.56% (caniuse 2026-07); Firefox 141 WebGPU default on Windows; Unity 6.6 WebGPU status and $200k revenue threshold; vpx-js HEAD 2020-11-12; VPE HEAD 2026-08-23; wpc-emu activity (2026-05); VPX open-issue state (2026-03-18). The Match 8% figure is not time-sensitive but is **unverified**.

---

## 11. Source appendix (compact; licence status where the research states it)

| # | Supports | Source | Licence status | Conf |
|---|---|---|---|---|
| 1 | VPX dual-licence, non-commercial default | vpinball LICENSE (raw, master) | **Dual / NOASSERTION**; unmarked files non-commercial | high |
| 2 | Repo licences, vpx-js dormancy, table-dependent realism | GitHub API (vpdb/vpx-js) · Wikipedia (Visual Pinball) | vpx-js **GPL-2.0**; VPE **GPL-3.0** | high |
| 3 | VPX physics architecture, TOI, flipper torque | vpinball `src/physics` (directory) | per-file (see 1) | medium — directory not file; constants verified via 32 |
| 4 | VPE ported VPX physics into Unity | freezy/VisualPinball.Engine | **GPL-3.0** | high |
| 5 | Flipper tuning values, scatter = 0, elasticity falloff | VPE docs — flippers | docs | high |
| 6 | Godzilla rule architecture, multiball, wizard tiers | Tilt Forums Godzilla rulesheet | n/a (rules description) | high |
| 7 | Jurassic Park rules, insert colour grammar | Tilt Forums JP rulesheet | n/a | medium |
| 8 | CGC feature/lighting enumeration | Chicago Gaming — Pulp Fiction | n/a (marketing) | medium |
| 9 | Wizard modes shipped post-launch | Knapp Arcade | n/a | medium |
| 10 | Spike node-bus, per-LED addressing | Stern SPIKE System Manual (2020-11) | n/a | medium |
| 11 | Flashers charted with coil drivers | Stern Sopranos manual OCR (2005) | n/a | medium |
| 12 | Stern adjustments vocabulary, Competition preset | Stern JP LE 1.15 README (2024-11) | n/a | high |
| 13 | MPF tilt/ball-search/ball-save/diverter source | missionpinball/mpf `mpfconfig.yaml` | **MIT** | high |
| 14 | Playfield dimensions; cabinet dims | Pinball Makers wiki · Flippers.be | n/a | high |
| 15 | `mLinearCastThreshold`, solver defaults | Jolt `PhysicsSettings.h` | (Jolt is MIT — not stated in research) | high |
| 16 | Factory pitch 6.5°, EM ~5° | Spooky Rick and Morty manual (2024-08) | n/a | medium |
| 17 | Competition pitch range; no standard | Tilt Forums | n/a | high |
| 18 | Ball diameter, VP unit system | VPE docs — units | docs | high |
| 19 | FL-11629 spec; five-tier coil ordering | Marco Specialties | n/a | high |
| 20 | Flipper pulse 30 ms @ 0.7, hold 0.25 | MPF coils reference | MIT docs (CC BY 4.0) | medium — client-rendered |
| 21 | Rubber durometer 45–50 Shore A | Kineticist | n/a | low |
| 22 | Absence of COR/friction/pulse data | negative result, two rounds | n/a | high |
| 23 | Flipper pivot geometry | Pinball Makers — Design | n/a (hobbyist) | medium |
| 24 | Godot/Jolt teleporting flippers defeat CCD | Reddit r/godot | n/a | medium |
| 25 | Unreal pinball collision problems | Unreal forums | n/a | medium |
| 26 | Godot 4.x pinball: 240 Hz, 64 substeps | Godot forum (2026) | n/a | medium |
| 27 | Browser-premise weakness; Unity web build size | Unity showcase · Aras Pranckevičius gist | n/a | medium |
| 28 | Unreal/Bevy/Unity web status and licensing | Unity WebGPU docs · Bevy news (2026) | n/a | medium |
| 29 | Godot web: Compatibility renderer only, no AudioEffects | Godot docs — web export | n/a | high |
| 30 | VP10 physics: 100→1000 Hz, fixed timestep | VP10 Physics wiki (c-f-h/vpinball) | n/a | high |
| 31 | Browser pinball at 480 Hz, "nothing tunnels" | three.js Discourse — Neon Gutter (2026-07-27) | not stated | high |
| 32 | vpx-js physics primitives and constants | vpx-js `lib/physics/constants.ts` | **GPL-2.0** (see §7c) | high |
| 33 | 130-light scene: Three.js 24 FPS vs 96 | three.js Discourse (2025-06) | n/a | **unverified** |
| 34 | Babylon Physics V2 / Havok plugin | Babylon docs | (Babylon Apache-2.0 — not stated in research) | medium |
| 35 | Babylon release cadence, 9.22.2 on 2026-08-24 | GitHub API | — | high |
| 36 | WebGPU support 85.56% | caniuse (2026-07) | n/a | high |
| 37 | Firefox 141 WebGPU default on Windows | Mozilla release notes (2025-07) | n/a | high |
| 38 | WebGPU "not Baseline" | MDN | n/a | high |
| 39 | MPF ontology, event vocabulary, licence | MPF docs source · MPF repo | **MIT**; docs **CC BY 4.0** | high |
| 40 | Lightmap-per-group technique, insert modelling | vbousquet/vpx_lightmapper (2025-12) | not stated | high |
| 41 | Babylon clustered forward: 2000 lights @ 1080p/60 | Babylon forum (2025-11) | n/a | medium |
| 42 | Three.js ClusteredLighting in `WebGPURenderer` | Three.js docs | n/a | medium — silent on WebGL2 |
| 43 | Edge removal doesn't cross bodies | Jolt issue 717 (2024-01) | n/a | high |
| 44 | Resting spheres creep; contact-cache fix | Jolt issue 1686 (2025-07) | n/a | high |
| 45 | LinearCast treated as Discrete vs sensors | Jolt issue 1142 (2024-06) | n/a | high |
| 46 | Browser pinball criticised on feel, not tunnelling | Babylon forum (2024-04) | n/a | high |
| 47 | Planck.js: 400+ hours for a port | Hacker News (2017-04) | n/a | high |
| 48 | Box2D documented permanent limitations | Box2D FAQ | (Box2D MIT — not stated) | medium |
| 49 | VPX open physics defects after 20 years | GitHub issue search (2023–2026) | n/a | high |
| 50 | three.js + Ammo pinball with CCD clamping | three.js Discourse | n/a | medium |
| 51 | R3F + cannon-es pinball tutorial | Sean Bradley (sbcode.net) | n/a | medium |
| 52 | PinMAME non-profit terms | PinMAME LICENSE (2019-05) | **non-profit; "selling not allowed"** | high |
| 53 | wpc-emu: browser WPC emulator | neophob/wpc-emu (2026-05) | **Apache-2.0** | high |
| 54 | Measured pinball part models | vbousquet/pinball-parts | **CC BY-SA** (one NC-SA node group to exclude) | high |
| 55 | Lightmapper publishes no scaling numbers | vpx_lightmapper `__init__.py` | — | high |
| 56 | No sourced table-authoring effort figure | negative result, two rounds | n/a | high |
| 57 | JJP documentation unreachable | JJP support | n/a | high |
| X | Red-team passes (physics, renderer) | `digests/redteam-physics.md`, `digests/redteam-renderer.md` | — | high |
| R | Renderer red-team corrections | `digests/redteam-renderer.md` | — | high |

**Excluded by the research (do not launder back in):** SEO content-farm figures for Unity web load time and JS-vs-WASM small-body performance (abratabia.com, mysimulator.uk, cinevva.com, etc.); Pinball FX / Pro Pinball engine claims (player-forum sourced); Chipmunk author's pinball guidance (unreachable); JJP magnet counts and rocking playfield (unverified); the Match 8% figure is retained but flagged unverified.
