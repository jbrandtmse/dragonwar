---
title: 'Technical research: Realistic Williams/Stern-style pinball simulation (DragonWar)'
type: 'technical'
topic: 'Realistic Williams/Stern-style pinball simulation (DragonWar theme): features, mechanics, physics, machine dimensions, simulation engine architecture, and technology selection'
decision: 'Commit to a feature set, physics/simulation approach, and technology stack for a browser-first (Windows+macOS) realistic-but-playable pinball simulation'
source: 'native run (Perplexity MCP + primary-artifact fan-out, 6 dimensions, 11 assistants, 2 red-team passes)'
status: complete
preset: 'deep'
validation: 'normal + red team'
created: '2026-08-26'
updated: '2026-08-26'
claims: 'verified 87 · unverified 14 · disputed 4 · overturned 2 (of 107 ledger entries)'
citation_check: 'mechanical PASS (57 markers / 57 rows, no dangling or orphaned). Semantic pass over the 12 highest-risk claims: 8 supports, 3 overstates, 1 misattributed, 1 unreachable — all downgrades applied.'
---

# Technical research: Realistic Williams/Stern-style pinball simulation (DragonWar)

**Decision this research serves:** Commit to a feature set, physics/simulation approach, and technology stack for a browser-first (Windows + macOS) pinball simulation that is as realistic as possible while remaining playable.

---

## 1. Executive summary

**Build a purpose-built pinball physics core — not a general-purpose rigid-body engine — and pair it with Babylon.js for rendering and an MPF-shaped declarative rules layer.** That is the answer, and it is unusual enough to state the evidence for it up front.

**Three findings drive the recommendation.**

**Pinball is the genre where "write your own physics" is the *correct* answer.** The generic advice against writing your own physics engine is overwhelming and well-evidenced — and it does not apply here. Every verifiable serious pinball simulator uses a purpose-built core. The decisive case is Visual Pinball Engine: a developer building a high-fidelity pinball sim *inside Unity*, with PhysX available for free, who instead ported Visual Pinball's physics to C# [4][30]. An adversarial pass specifically hunting for a well-regarded pinball sim running unmodified general-purpose physics **found none** [X]. Meanwhile every general-engine pinball attempt is a thread about the same failures: kinematic flippers that teleport so the solver never sees velocity and CCD silently does nothing; substeps raised to 64; flipper colliders thickened beyond their visual size [24][25][26]. Those workarounds *are* swept analytic collision, reimplemented badly on top of an engine that was fighting you.

**The high tick rate — not CCD — is what stops the ball falling through the table.** Jolt's own source sets `mLinearCastThreshold = 0.75`: a body is only swept if it moves more than three-quarters of its inner radius in a step [15]. At 1000 Hz a 6 m/s ball moves ~6 mm per step against a ~10 mm threshold, so **CCD never engages** — and does not need to, because 6 mm cannot tunnel through real geometry. Visual Pinball reached the same place from the opposite direction: 1000 Hz fixed timestep plus analytic closed-form time-of-impact, making anti-tunneling *structural* rather than a feature you enable [3]. Two independent designs converging is the strongest evidence in this report. A single-file browser pinball demo achieves it at 480 Hz [31], so the working range is 480–1000 Hz, not 1000 Hz specifically.

**Realism does not come from randomness — it comes from velocity-dependent restitution and coil ramp-up.** This directly answers the "realistic but playable" constraint and it is counter-intuitive: Visual Pinball Engine recommends **Scatter Angle = 0 for every era**, and the widely-used community physics set zeroes playfield scatter too [5]. What produces authentic feel is *elasticity falloff* (lively at low speed, no pingy rebounds or airballs at high speed) and *coil ramp-up* (the solenoid's acceleration time, which is what makes light-tap technique work) [5][3].

**The biggest caveat is not technical.** The browser-first premise is the least-evidenced part of this entire research. No named commercial browser game at "visually rich 3D simulation" fidelity could be found; Unity's own web showcase is demoware-scale while its high-fidelity titles ship native [27]. That is absence of evidence, not evidence of absence — but it is your foundational premise and it deserves an explicit decision rather than silent inheritance. **Recommendation: build browser-capable, ship native-first via Tauri/Electron, treat the browser build as a demo channel.** The architecture recommended here supports both at no extra cost.

Second caveat: **every open-source pinball physics implementation is encumbered.** Visual Pinball is *not* GPL as commonly believed — it is a dual-license repo mid-migration whose default for unmarked files reads *"Redistributions may not be sold, nor may they be used in a commercial product or activity"* [1]. Details in §7.

---

## 2. Modern feature vocabulary — what "Stern-like" actually means

Modern Stern rule architecture is far more regular than it looks. The Godzilla rulesheet read end-to-end gives a skeleton that Jurassic Park and Chicago Gaming's Pulp Fiction independently reproduce [6][7][8]:

> skill shot → ramp qualifiers → **scoop as mode selector** → tiered battles that stack with multiball by priority → 3 mini-wizards → one final wizard mode

Note the ball-count grammar: **3-ball for regular multiball, 4-ball reserved for the finale** [6]. Jackpots are progressive and seeded by prior play ("500k + 500k per Godzilla Multiball started"), and extra balls are awarded for a *menu* of long-horizon achievements rather than one lane [6].

**Wizard modes ship post-launch.** Stern shipped Godzilla's and Rush's final wizard modes in a later code drop [9]. DragonWar's deepest content can be phased; v1 does not need to gate on it.

**Insert colour is the mode-state channel, not decoration.** Jurassic Park uses white = qualify, red = rescue, yellow = set trap, green = the moving dinosaur [7]. Lighting decomposes into four independently-driven channels a simulation must model separately — **GI, feature inserts, flashers, architectural** [8][10]. Flashers specifically are *coil-class outputs*: Stern's manuals chart them with the solenoid drivers, not the lamp matrix, and they need duty-cycle limits [11].

**The machine-operations layer** that player glossaries omit but a realistic sim must reproduce [12][13]:

| Behaviour | The detail sims get wrong |
|---|---|
| **Tilt** | Forfeits the *end-of-ball bonus* and ends the ball — it does **not** zero the score. Warnings are per-player. The bob keeps swinging, so you need a debounce window *and* a settle time. |
| **Slam tilt** | A **different sensor** — a switch on the coin door, not the plumb bob. Ends all games in progress. |
| **Ball save** | Has a **grace period past the displayed expiry** where drains still save, a "hurry up" state measured *backwards* from expiry, and a timer-start event separate from enable (which is why it doesn't count down until you plunge). |
| **Match** | The number is always a **multiple of ten**, and Stern's default match percentage is reported as **8%** — below the 10% a uniform draw would give, making it a weighted payout rather than a lottery. ⚠️ *Unverified: the section's cited source [12] contains no match adjustment; this traces to a 2005-era manual OCR [11] and a widely-repeated operator figure. Confirm before implementing.* |
| **Ball search** | An **escalating three-phase protocol** with per-device priority callbacks and a defined failure action, not one coil sweep. Real machines suppress parts of it when rules state would be corrupted. |

**Adjustments are a layered store, and tournament mode is a preset, not a flag.** Stern's own game-code README enumerates their real vocabulary, including per-mech calibration (`RIGHT FLIPPER POWER` default 235, `TROUGH EJECT POWER`, per-mech millisecond timing offsets). Enabling `COMPETITION MODE` *sets* `TILT_WARNINGS` to 2 and *removes* options from other menus — the preset both sets and constrains [12]. Model as: factory defaults → install preset → operator overrides.

---

## 3. Machine geometry — the numbers, and the numbers that don't exist

**Well-sourced and usable as-is:**

| Quantity | Value | Conf. |
|---|---|---|
| Standard-body playfield | 20.25 × 42.00 in (514.4 × 1066.8 mm) [14] | high |
| Factory pitch (modern) | **6.5°** (EM era ~5°) [16] | high |
| Competition pitch range | 6.5–8.5°, 7.5–8° common; **no mandated standard** [17] | high |
| Ball diameter | 1.0625 in / **26.99 mm** [18] | high |
| Ball mass | **~80 g** carbon steel (80–82 g spread) [5] | medium |
| Flipper bat | 3.000 in bare, 3.125 in rubbered [5] | medium |
| Flipper coil FL-11629 (blue) | power ~4 Ω / hold ~132 Ω, dual-wound, 50 V [19] | high |
| Flipper pulse model | **~30 ms at 70% power, then hold at 25% PWM** [20] | medium |
| Rubber durometer | 45–50 Shore A across common compounds [21] | low |

Two structural insights matter more than any single number.

**Pitch is the single strongest global difficulty knob**, and the fact that PAPA deliberately varies it per game rather than standardising [17] tells you it is a *design surface*, not a constant. Expose it.

**Marco Specialties publishes its own five-tier flipper coil ordering with stated shot-distance intent** — yellow (short flippers, close shots) < green (close shots near drops) < red (the standard) < orange (long shots) < blue (long shots and high ramps) [19]. That is a better basis for banding flipper strength in a sim than resistance alone.

**The physical-constant literature pinball needs mostly does not exist.** Confirmed absent after two rounds of targeted search: any coefficient of restitution or friction for a steel ball against a clearcoated playfield or a rubber ring; AWG and turn counts from any vendor; manufacturer-stated coil pulse duration; a dimensioned drain-zone specification; a *measured* flipper tip gap [22]. **VPX's tuned constants are the de facto standard because they are the only published, coherent, working parameter set** — flipper elasticity 0.88, falloff 0.15, friction 0.8–0.9, era-banded coil strengths [5]. Dimensionless values port directly; the strength numbers are VPX-internal units and do not.

Flipper pivots are now fixed in *absolute* playfield coordinates — holes 1/2 in diameter, centres 7 in up from the bottom edge, 6-13/16 to 7 in apart [23] — but this remains hobbyist-sourced. The tip gap is the one unmeasured quantity in the entire drain triangle, and it is the geometry the whole game balances around.

---

## 4. Simulation architecture — how the benchmark actually works

Visual Pinball X's source, read directly, is the single best available blueprint [3]:

- **Fixed 1000 Hz outer step** (`PHYSICS_STEPTIME 1000` µs), semi-implicit Euler, with adaptive subdivision *within* each step driven by collision events — so effective resolution during contact is far finer than 1 ms. *Verify against [32], the TypeScript port, rather than [3]: the upstream C++ path that historically held this constant now 404s, and the same file carries a `DEFAULT_STEPTIME = 10000` whose comment contradicts its own value.*
- **Analytic closed-form time-of-impact collision.** `SolveQuadraticEq` for circles; `hittime = bnd / -bnv` for line segments. The engine advances only to the earliest hit, resolves, repeats. **Anti-tunneling is architectural, not a feature.**
- **Flippers are true rigid bodies driven by torque** — inertia = ⅓·mass·radius², a ramped solenoid model, and a quartic end-of-stroke torque fade. This is the mechanism behind live catches and light taps [3][5].
- **Four per-object tunables only**: elasticity (0.3), elasticity falloff (0.0), friction (0.3), scatter (0.0 rad).
- **Nudge and tilt are first-class** — a damped-harmonic cabinet oscillator, Kalman-filtered accelerometer input, and a tilt bob simulated as an actual pendulum [3].

**The playability concessions are explicit, few, and worth copying**: forced time advancement to escape collision clusters, a 200 ms catch-up bailout that discards simulated time rather than stalling the frame, and hardcoded ball-ball restitution [3]. Note what this tells you — **in a time-of-impact design the stability hazard is iteration explosion, not tunneling.**

**Scope honestly.** The red-team pass established that the primitive set is bigger than "circles and line segments": the reference implementation also needs triangles, 3D polygons, 3D line segments, **and two broadphase structures (a quadtree and a k-d tree)** [X][32]. And complex 3D geometry is handled by authors hand-building *simplified invisible collision scaffolding* while the detailed visual mesh is flagged non-collidable — so "the geometry is simple" is partly achieved by authoring discipline, not by the geometry being simple [X].

**No commercial pinball sim publishes any engineering-level physics detail** — no tick rate, solver type, or collision strategy from Zen Studios, Barnstorm, or FarSight; no GDC talk; no academic paper [3]. Claims about Pinball FX's or Pro Pinball's internals trace to player forum posts, not developers, and **should not be cited** [X8]. The public engineering record for pinball physics is VPX's source code and essentially nothing else.

---

## 5. Technology selection

### Requirements frame

Hard gates: runs on Windows + macOS; high-fidelity ball dynamics at 480–1000 Hz; stable 60+ FPS; lighting-dominated scene (50–150 individually addressable lamps); solo/small-team; commercially unencumbered.

### The field, and why most of it fell away

| Candidate | Verdict |
|---|---|
| **Unreal Engine** | **Disqualified.** HTML5 left the engine at 4.24; no UE5 web target, no announced plan. Pixel Streaming puts a network round-trip in the flipper loop and needs per-session GPU capacity [28]. |
| **Godot 4 web** | **Disqualified for browser.** Godot's own docs: web export supports **only** the Compatibility renderer — Forward+ is unsupported, so all the good lighting is unavailable exactly where a playfield needs it. Web export also has **no AudioEffects or procedural audio** and no C#, and the docs steer users away from Safari [29]. Fine natively; wrong for this target. |
| **Bevy** | **Weak.** Pre-1.0 with ~4 breaking releases in 16 months, each requiring migration of the project *and* every pinned plugin. Physics is a third-party dep tracking a moving engine. Highest churn tax of any candidate [28]. |
| **Unity Web** | **Viable, not chosen.** Free under $200k revenue, no runtime fee [28]. WebGPU was promoted out of experimental in 6.6 with automatic WebGL2 fallback — the dual-baseline strategy a hand-rolled stack must build itself [R7]. Its real cost is payload: an *empty* Unity 6 URP web build is ~7–11 MB compressed [27]. Rejected because we are not using its physics anyway, which removes most of what it offers. |
| **Babylon.js** | **Recommended.** See below. |

### The picks

**Renderer: Babylon.js.** This is a *change* from the initial finding, made by the red-team pass — but the two legs of the argument are not equally strong, and the weaker one should be discounted.

The *structural* leg is solid: Three.js ships no physics and is a rendering **library**, while Babylon ships a first-party Havok plugin and is engine-shaped — which is the shape of this work [34] — and Babylon is the most actively released component in the stack by a wide margin, ~12 releases in 5 weeks [35].

The *benchmark* leg is weak and should not carry weight. On a structurally comparable 130-light scene Three.js reportedly managed 24 FPS against 96 [33], but the citation check found the thread never states which Three.js backend produced that number, and the 96 FPS comparator was simultaneously running a heavier post-processing stack (CSM, SSR, SSAO, bloom, TAA). It is not a controlled comparison in either direction. **Take the pick on the structural grounds; treat the benchmark as unverified.**

**Graphics baseline: WebGL2 floor + WebGPU progressive enhancement.** Not WebGL2-only. WebGPU is at 85.56% global usage, Firefox 141 enabled it by default on Windows, and this target excludes mobile and Linux — the two weakest surfaces [36][37]. But MDN still carries *"not Baseline because it does not work in some of the most widely-used browsers"*, so WebGPU-only over-corrects [38].

**Physics: a purpose-built core, ported from vpx-js rather than written blind.** The red team's sharpest hit: vpx-js already contains this exact architecture in TypeScript — `hit-circle`, `hit-line-3d`, `hit-triangle`, `hit-quadtree`, `hit-kd` — with `PHYSICS_STEPTIME = 1000` and the tuning constants a bespoke core takes years to discover (`PHYS_SKIN 25.0`, `PHYS_TOUCH 0.05`, `C_DISP_GAIN 0.9875`, `STATICTIME 0.005`) [32]. **Correction to the red team:** it read GitHub's `pushed_at` as evidence of active maintenance; the default branch's HEAD commit is **2020-11-12**, and the later activity is bot branches [2]. vpx-js is *dormant with unfinished scripting* — so this is "port from a frozen but proven reference," not "adopt a living library." Different risk profile, and it must not be sold as the former. It is GPL-2.0, which is the decision variable (§7).

**Rules layer: MPF-shaped, declarative, fully separated from physics.** Mission Pinball Framework publishes a complete **MIT-licensed** device ontology — 50+ typed devices including `dual_wound_coils`, `ball_holds` vs `multiball_locks` as separate types (the physical/virtual lock distinction in the type system), `playfield_transfers`, and even `psus` because coil firing must be budgeted against shared power [13][39]. Its 267-page event vocabulary uses one consistent four-phase convention (`X_will_start` → `X_starting` → `X_started` … ) across game, ball and mode, and its ball-device events include explicit **failure** states — `eject_failed`, `ball_missing`, `broken` — because the design assumes mechanisms fail [39]. The architectural rule: **physics emits switch events; the rules layer is a pure function of events → state → presentation and knows nothing about ball velocity.** That is what makes it headlessly testable.

**Lighting: baked per-light-group lightmaps, additively composited.** One baked texture per group of lights, with each group's mesh optimised by deleting unlit faces, composited additively over baked base geometry at runtime [40]. Cost is one texture multiply-add per group rather than N real-time light evaluations. Inserts are **not decals** — the real look is a light *below* the playfield, a cup mesh, and a translucency map [40]. Cheap trick worth stealing: bake RGB inserts to *white* and tint at runtime.

**But the justification must be restated.** The red team caught a circular argument: baking is not required because a playfield has too many lights — Babylon's clustered forward path does **2,000 dynamic lights at 1080p/60fps** on an RTX 4070 laptop [41] (falling to 300–500 at 4K), and a playfield needs 50–150. Clustered lighting appears to be a WebGPU-path feature in both engines [42][41], which would make it the *graphics baseline* rather than any property of pinball that forces baking. Treat that last step as **medium confidence**: Three.js's docs place `ClusteredLighting` in `WebGPURenderer` but never state that its WebGL2 backend is excluded, and `WebGPURenderer` does run on WebGL2 [42]. Either way baking still earns its place — it delivers indirect bounce and contact-soft shadows that clustered lighting does not — but for that reason, not the light count.

---

## 6. Cross-dimension insights

**The convergence.** Dimension 4 evaluated physics engines on CCD quality. Dimension 3 found VPX built a custom analytic-TOI core. Reading Jolt's source closed the loop: at the tick rate this project wants, **Jolt's CCD does not engage at all** because per-step displacement falls below `mLinearCastThreshold` — and that is fine, because the displacement is smaller than the ball radius [15][3]. Two independent designs, opposite directions, same answer: *the tick rate is the mechanism*. This reframes the whole engine question — it should never have been decided on CCD.

**The engine constraints all point the same way.** Jolt's fix for balls catching on invisible seams between adjacent shapes explicitly does not work across bodies, so the playfield must be one compound mesh [43]; resting balls creep unless contact caching is disabled [44]; and LinearCast bodies are treated as *Discrete against sensors*, so a fast ball can miss rollover switches and drain sensors entirely [45]. Every one of these is a constraint you inherit *from the engine*, and every one disappears in a purpose-built core where switches are analytic zone tests rather than physics sensors. The engine's abstractions are fighting the domain.

**Realism is a tuning-and-authoring problem more than an engine problem.** VPX physics quality is **table-dependent, not engine-fixed** — each table ships its own flipper strength, elasticity and friction, so "VPX is realistic" is really a judgment about one author's tuning [2]. The one browser 3D pinball attempt found was criticised for *feel* — ball far too small relative to real proportions, launcher too bouncy, game too fast — and never discussed tunneling at all [46]. Tunneling was the risk we expected; it is the one that is easiest to solve. **Feel is the hard part, and it is where the schedule will actually go.**

**Nobody has defined the target.** There is no quantitative or instrumented realism benchmark for pinball simulators anywhere — every ranking is forum opinion, with no methodology, no measurement, no high-speed-camera study [2]. If realism is DragonWar's differentiator, **we would have to define and measure it ourselves.** That is a genuine opportunity and a genuine risk in the same sentence.

**The field is empty at the top, which cuts both ways.** vpx-js is the only serious browser port of VPX and it stopped in 2020 with scripting unfinished; no WebGPU-native pinball project of any maturity exists [2]. Nobody has done this. That is either the opportunity or the warning, and honestly it is both.

---

## 7. Contrary evidence and the licensing trap

**The strongest argument against the physics recommendation** is that writing your own physics is a well-documented way to lose a year. The Planck.js author reported **400+ hours and ~20k lines** — for a *port* of Box2D's already-solved algorithms, not original design [47]. Box2D's own manual documents permanent limitations after a decade of maturity [48]. And the asymptote is visible: Visual Pinball, with 20+ years and many contributors, still carries **open** physics defects — "Unrealistic Nudge Physics" open since 2026-03-18, plus a closed history spanning stuck balls, inconsistent hit detection, energy gain driving balls to "supersonic speeds", and a *physical model* error (nudge implemented as force on the ball rather than movement of the table) that survived two decades [49]. This does not refute the recommendation — pinball is the genre where custom cores win — but it is the honest cost, and porting from vpx-js rather than deriving fresh is the mitigation.

**Counter-examples exist and should not be waved away.** Browser pinball *does* run on general engines — three.js + cannon-es, R3F + Rapier, three.js + Ammo with CCD motion clamping [50][51]. None is cited by the pinball community as a physics benchmark, but "a general engine cannot do browser pinball" would be an overstatement.

**The licensing trap — read this before copying any code.** Visual Pinball is **not** GPL-3.0 as commonly believed. Its LICENSE describes a migration begun in 2020: files converted to GPLv3+ carry `// license:GPLv3+` on their first line, and — verbatim — *"Every file/snippet that doesn't feature any explicit license mentioning, will stay (for now) under the 'old MAME'-like license"*, whose terms read *"Redistributions may not be sold, nor may they be used in a commercial product or activity"* [1]. GitHub's detector reports **NOASSERTION**, not GPL. PinMAME is stricter still — *"Selling either is not allowed"*, *"strictly a non-profit project"* [52].

The clean picture:

| Project | License | Status |
|---|---|---|
| vpinball/vpinball | **Dual, NOASSERTION** — non-commercial default for unmarked files [1] | Active |
| vpinball/pinmame | Old-MAME → BSD-3 migration; **explicitly non-profit** [52] | Active |
| vpdb/vpx-js | **GPL-2.0**, cleanly detected [2] | **Dormant since 2020-11** |
| freezy/VisualPinball.Engine | **GPL-3.0**, unambiguous [2] | Active (HEAD 2026-08-23) |
| missionpinball/mpf | **MIT** (docs CC BY 4.0) [39] | Active |
| neophob/wpc-emu | **Apache-2.0** [53] | Active — *the only permissive option found* |
| vbousquet/pinball-parts | **CC BY-SA** (one NC-SA node group to exclude) [54] | Usable commercially |

**Practical consequence:** MPF's ontology and vpinball's *algorithms as documented behaviour* are safe to learn from. Copying vpinball code requires checking each file's first line. A GPL-2.0 port of vpx-js is only viable if DragonWar ships GPL-compatible.

---

## 8. Recommendations

1. **Physics: port a purpose-built analytic-TOI core from vpx-js's architecture**, fixed timestep at 480–1000 Hz. Budget for triangles, 3D polys, 3D line segments and a broadphase — not just circles and segments [32][X]. *Confidence: high on architecture; the sourcing decision hinges on the GPL-2.0 call.* → feeds architecture spine.
2. **Resolve the licence question first**, before any code is written. If DragonWar must be closed-source commercial, treat vpx-js as a *reading reference* and write fresh, naming GPL-2.0 as the reason. *Confidence: high — terms read verbatim from primary artifacts [1][2].*
3. **Renderer: Babylon.js, WebGL2 floor with WebGPU progressive enhancement.** *Confidence: medium on structural grounds (first-party Havok, engine-shaped, release cadence [34][35]); the supporting benchmark [33] is **unverified** and the recommendation should not rest on it.*
4. **Rules: adopt MPF's device ontology and event vocabulary wholesale** (MIT). Keep the rules layer a pure function of switch events, with zero knowledge of ball velocity. *Confidence: high [13][39].*
5. **Lighting: baked per-light-group additive lightmaps, with standard UV lightmaps — not camera-projected.** VPX's implementation projects UVs from the camera, which locks the camera and rules out VR; standard lightmap UVs are view-independent. **Decide this before modelling starts** [40][R].
6. **Tune realism with elasticity falloff and coil ramp-up; set scatter to zero.** Randomness is tuned *down* [5]. → feeds the physics tuning spec.
7. **Ship native-first via Tauri/Electron; treat browser as a demo channel.** The recommended architecture is browser-capable at no extra cost, which preserves the option without betting the product on the least-evidenced premise [27].
8. **Author the playfield as one compound collision body** regardless of engine choice, and model walls and floor with real thickness — never zero-thickness planes [43][16].

**Three spikes worth running before committing** — each closes a gap that research provably cannot:
- **A 1000 Hz JS loop over 6 bodies vs the same scene in Rapier/Jolt WASM.** Nobody has published this; the pinball-relevant regime is unmeasured [X7].
- **The lightmap scaling envelope** — light-group count, lightmap resolution, frame cost. vpx_lightmapper publishes no numbers at all [55].
- **Browser build size and load time**, measured. Every published figure traces to content farms [27].

---

## 9. Open questions

| Question | What would answer it |
|---|---|
| Is browser-first the right distribution premise? | A business decision, not a research one. No public browser-vs-Steam revenue comparison for a 3D title exists [27]. |
| What is the measured flipper tip gap and arc? | A DXF/SVG Bally playfield template — the highest-value unclaimed artifact. Would settle tip gap, outlane widths and post positions at once [23]. |
| Restitution/friction for steel-on-clearcoat and steel-on-rubber? | Measurement. Confirmed unpublished after two rounds [22]. |
| Can `neophob/wpc-emu` (Apache-2.0) be driven by an external simulation? | One round on its API surface. The only permissive asset in the ecosystem [53]. |
| How many hours does one table actually take? | A VPUniverse version history gives a sourced *elapsed-time* span. No hours figure exists anywhere — **do not let one be invented** [56]. |
| Jersey Jack mechanism details (magnet counts, rocking playfield)? | Their doc host has a broken certificate. Unverified after two rounds — not usable as spec [57]. |

---

## 10. Source appendix

| # | Supports | Publisher | Pub | Accessed | Conf |
|---|---|---|---|---|---|
| 1 | VPX dual-license, non-commercial default | [vpinball LICENSE](https://raw.githubusercontent.com/vpinball/vpinball/master/LICENSE) | 2025-10 | 2026-08-26 | high |
| 2 | Repo licences, vpx-js dormancy, table-dependent realism | [GitHub API](https://api.github.com/repos/vpdb/vpx-js) · [Wikipedia](https://en.wikipedia.org/wiki/Visual_Pinball) | live | 2026-08-26 | high |
| 3 | VPX physics architecture, TOI, flipper torque | [vpinball source](https://github.com/vpinball/vpinball/tree/master/src/physics) | master | 2026-08-26 | medium — directory, not a file; constants verified via [32] |
| 4 | VPE ported VPX physics into Unity | [freezy/VisualPinball.Engine](https://github.com/freezy/VisualPinball.Engine) | active | 2026-08-26 | high |
| 5 | Flipper tuning values, scatter=0, elasticity falloff | [VPE docs — flippers](https://docs.visualpinball.org/creators-guide/manual/mechanisms/flippers.html) | unknown | 2026-08-26 | high |
| 6 | Godzilla rule architecture, multiball, wizard tiers | [Tilt Forums](https://tiltforums.com/t/stern-godzilla-rulesheet/7210) | unknown | 2026-08-26 | high |
| 7 | Jurassic Park rules, insert colour grammar | [Tilt Forums](https://tiltforums.com/t/stern-jurassic-park-rulesheet/5644) | unknown | 2026-08-26 | medium |
| 8 | CGC feature/lighting enumeration | [Chicago Gaming](https://www.chicago-gaming.com/coinop/pulp-fiction) | unknown | 2026-08-26 | medium |
| 9 | Wizard modes shipped post-launch | [Knapp Arcade](https://www.knapparcade.org/post/big-stern-pinball-code-update-rolls-out-final-wizard-modes-for-godzilla-and-rush-pinball-machines) | unknown | 2026-08-26 | medium |
| 10 | Spike node-bus, per-LED addressing | [Stern SPIKE manual](https://www.sternpinball.com/wp-content/uploads/2020/11/SPIKE-System-Manual.pdf) | 2020-11 | 2026-08-26 | medium |
| 11 | Flashers charted with coil drivers | [Stern Sopranos manual OCR](https://archive.org/stream/Stern_Pinball_The_Sopranos_Manual/Sopranos_Manual_djvu.txt) | 2005 | 2026-08-26 | medium |
| 12 | Stern adjustments vocabulary, Competition preset | [Stern JP LE 1.15 README](https://sternpinball.com/wp-content/uploads/2024/11/jurassic_park_LE_1.15-README.txt) | 2024-11 | 2026-08-26 | high |
| 13 | MPF tilt/ball-search/ball-save/diverter source | [missionpinball/mpf](https://raw.githubusercontent.com/missionpinball/mpf/dev/mpf/mpfconfig.yaml) | dev | 2026-08-26 | high |
| 14 | Playfield dimensions (multi-manufacturer table); cabinet dims from Flippers.be only | [Pinball Makers](https://pinballmakers.com/wiki/index.php?title=Playfield_Sizes) · [Flippers.be](https://www.flippers.be/basics/101_pinball_dimensions.html) | unknown | 2026-08-26 | high |
| 15 | `mLinearCastThreshold`, solver defaults, sleeping | [Jolt PhysicsSettings.h](https://raw.githubusercontent.com/jrouwe/JoltPhysics/master/Jolt/Physics/PhysicsSettings.h) | master | 2026-08-26 | high |
| 16 | Factory pitch 6.5°, EM ~5° | [Spooky Rick and Morty manual](https://www.spookypinball.com/wp-content/uploads/2024/08/Rick-and-Morty-Manual.pdf) | 2024-08 | 2026-08-26 | medium |
| 17 | Competition pitch range; no mandated standard | [Tilt Forums](https://tiltforums.com/t/what-playfield-angle-for-competition-play/688) | unknown | 2026-08-26 | high |
| 18 | Ball **diameter** (1¹⁄₁₆ in) and VP unit system only — mass and bat length are not on this page, see [5] | [VPE docs — units](https://docs.visualpinball.org/creators-guide/editor/units-3d-space.html) | unknown | 2026-08-26 | high |
| 19 | FL-11629 spec verbatim; five-tier coil ordering | [Marco Specialties](https://www.marcospecialties.com/pinball-parts/FL-11629) | unknown | 2026-08-26 | high |
| 20 | Flipper pulse 30 ms @ 0.7, hold 0.25 | [MPF coils reference](https://missionpinball.org/latest/config/coils/) | unknown | 2026-08-26 | medium — page renders examples client-side; not re-verifiable by fetch |
| 21 | Rubber durometer 45–50 Shore A | [Kineticist](https://www.kineticist.com/news/pinball-flipper-rubber-comparison) | unknown | 2026-08-26 | low |
| 22 | Absence of COR/friction/pulse data | (negative result, two rounds) | n/a | 2026-08-26 | high |
| 23 | Flipper pivot geometry in absolute coordinates | [Pinball Makers — Design](https://pinballmakers.com/wiki/index.php?title=Design) | unknown | 2026-08-26 | medium |
| 24 | Godot/Jolt teleporting flippers defeat CCD | [Reddit r/godot](https://www.reddit.com/r/godot/comments/1urhdq7/avoiding_tunneling_with_pinball_paddles/) | unknown | 2026-08-26 | medium |
| 25 | Unreal pinball collision problems | [Unreal forums](https://forums.unrealengine.com/t/pinball-collisions-problems-advice/5512) | unknown | 2026-08-26 | medium |
| 26 | Godot 4.x pinball build: 240 Hz, 64 substeps, tuning | [Godot forum](https://forum.godotengine.org/t/godot-v4-7-pinball-table-build/107655) | 2026 | 2026-08-26 | medium |
| 27 | Browser-premise weakness; Unity web build size | [Unity showcase](https://play.unity.com/en/showcases) · [Aras Pranckevičius gist](https://gist.github.com/aras-p/740c2d4f9977ce92b7de72b1394dd365) | unknown | 2026-08-26 | medium |
| 28 | Unreal/Bevy/Unity web status and licensing | [Unity WebGPU docs](https://docs.unity3d.com/6000.3/Documentation/Manual/WebGPU.html) · [Bevy news](https://bevy.org/news/) | 2026 | 2026-08-26 | medium |
| 29 | Godot web: Compatibility renderer only, no AudioEffects | [Godot docs — web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) | stable | 2026-08-26 | high |
| 30 | VP10 physics: 100→1000 Hz, fixed timestep | [VP10 Physics wiki](https://github.com/c-f-h/vpinball/wiki/VP10-Physics) | unknown | 2026-08-26 | high |
| 31 | Browser pinball at 480 Hz, "nothing tunnels" | [three.js Discourse — Neon Gutter](https://discourse.threejs.org/t/neon-gutter-single-file-3d-pinball-with-hand-written-physics/93181) | 2026-07-27 | 2026-08-26 | high |
| 32 | vpx-js physics primitives and constants | [vpx-js constants.ts](https://raw.githubusercontent.com/vpdb/vpx-js/master/lib/physics/constants.ts) | unknown | 2026-08-26 | high |
| 33 | 130-light scene: Three.js 24 FPS vs 96 | [three.js Discourse](https://discourse.threejs.org/t/clustered-rendering-on-webgpu/81042) | 2025-06 | 2026-08-26 | **unverified** — backend unstated; comparator ran heavier post-processing |
| 34 | Babylon Physics V2 / Havok plugin | [Babylon docs](https://doc.babylonjs.com/features/featuresDeepDive/physics) | unknown | 2026-08-26 | medium |
| 35 | Babylon release cadence, 9.22.2 on 2026-08-24 | [GitHub API](https://api.github.com/repos/BabylonJS/Babylon.js/releases) | 2026-08 | 2026-08-26 | high |
| 36 | WebGPU support 85.56%, per-browser status | [caniuse](https://caniuse.com/webgpu) | 2026-07 | 2026-08-26 | high |
| 37 | Firefox 141 WebGPU default on Windows | [Mozilla release notes](https://www.firefox.com/en-US/firefox/141.0/releasenotes/) | 2025-07 | 2026-08-26 | high |
| 38 | WebGPU "not Baseline" | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) | live | 2026-08-26 | high |
| 39 | MPF ontology, event vocabulary, MIT licence | [MPF docs source](https://github.com/missionpinball/mpf-docs) · [MPF](https://github.com/missionpinball/mpf) | live | 2026-08-26 | high |
| 40 | Lightmap-per-group technique, insert modelling | [vpx_lightmapper](https://github.com/vbousquet/vpx_lightmapper) | 2025-12 | 2026-08-26 | high |
| 41 | Babylon clustered forward: 2000 lights @ 1080p/60 | [Babylon forum](https://forum.babylonjs.com/t/clustered-forward-benchmark/61468) | 2025-11 | 2026-08-26 | medium |
| 42 | Three.js ClusteredLighting lives in `WebGPURenderer` | [Three.js docs](https://threejs.org/docs/pages/ClusteredLighting.html) | current | 2026-08-26 | medium — docs are silent on the WebGL2 backend, so "WebGPU-only" overreads |
| 43 | Enhanced internal edge removal doesn't cross bodies | [Jolt issue 717](https://api.github.com/repos/jrouwe/JoltPhysics/issues/717/comments) | 2024-01 | 2026-08-26 | high |
| 44 | Resting spheres creep; contact-cache fix | [Jolt issue 1686](https://api.github.com/repos/jrouwe/JoltPhysics/issues/1686/comments) | 2025-07 | 2026-08-26 | high |
| 45 | LinearCast treated as Discrete vs sensors | [Jolt issue 1142](https://api.github.com/repos/jrouwe/JoltPhysics/issues/1142/comments) | 2024-06 | 2026-08-26 | high |
| 46 | Browser pinball criticised on feel, not tunneling | [Babylon forum](https://forum.babylonjs.com/t/pinball-game-with-havok-physics/49675) | 2024-04 | 2026-08-26 | high |
| 47 | Planck.js: 400+ hours for a port | [Hacker News](https://news.ycombinator.com/item?id=14050974) | 2017-04 | 2026-08-26 | high |
| 48 | Box2D documented permanent limitations | [Box2D FAQ](https://github.com/erincatto/box2d/blob/main/docs/FAQ.md) | unknown | 2026-08-26 | medium |
| 49 | VPX open physics defects after 20 years | [GitHub issue search](https://api.github.com/search/issues?q=repo:vpinball/vpinball+physics+in:title+is:issue) | 2023–2026 | 2026-08-26 | high |
| 50 | three.js + Ammo pinball with CCD clamping | [three.js Discourse](https://discourse.threejs.org/t/physics-ccd-motion-clamping-pinball-with-enable3d-three-ammo-now-a-progressive-web-app/35149) | unknown | 2026-08-26 | medium |
| 51 | R3F + cannon-es pinball tutorial | [Sean Bradley](https://sbcode.net/react-three-fiber/pinball/) | unknown | 2026-08-26 | medium |
| 52 | PinMAME non-profit terms | [PinMAME LICENSE](https://raw.githubusercontent.com/vpinball/pinmame/master/LICENSE) | 2019-05 | 2026-08-26 | high |
| 53 | wpc-emu: browser WPC emulator, Apache-2.0 | [neophob/wpc-emu](https://github.com/neophob/wpc-emu) | 2026-05 | 2026-08-26 | high |
| 54 | Measured pinball part models, CC BY-SA | [vbousquet/pinball-parts](https://github.com/vbousquet/pinball-parts) | unknown | 2026-08-26 | high |
| 55 | Lightmapper publishes no scaling numbers | [vpx_lightmapper source](https://raw.githubusercontent.com/vbousquet/vpx_lightmapper/master/addons/vpx_lightmapper/__init__.py) | 2025-12 | 2026-08-26 | high |
| 56 | No sourced table-authoring effort figure exists | (negative result, two rounds) | n/a | 2026-08-26 | high |
| 57 | JJP documentation unreachable | [JJP support](https://www.jerseyjackpinball.com/support/) | live | 2026-08-26 | high |
| X | Red-team passes (physics, renderer) | `digests/redteam-physics.md`, `digests/redteam-renderer.md` | 2026-08-26 | 2026-08-26 | high |
| R | Renderer red-team corrections | `digests/redteam-renderer.md` | 2026-08-26 | 2026-08-26 | high |

---

## 11. Staleness map

| Claim class | Window | Re-check by | Why |
|---|---|---|---|
| **Versions & compatibility** (Babylon, Jolt, Rapier, Unity, Godot) | 1 mo | **2026-09-26** | Babylon shipped ~12 releases in 5 weeks [35]; Rapier's binding lacks tags entirely [W8] |
| **WebGPU browser support** | 1 mo | **2026-09-26** | Firefox/Safari status is actively moving [36][37] |
| **Pricing** (Unity, PlayCanvas) | 3 mo | **2026-11-26** | Unity's $2,200/seat figure is already a 2025-01 number and failed the freshness bar [28] |
| **Ecosystem health** (repo activity, maintenance) | 6 mo | **2027-02-26** | vpx-js dormancy, wpc-emu activity, Jolt/Rapier cadence [2][53] |
| **Landscape** (engine field, browser-game viability) | 12 mo | **2027-08-26** | [27][28] |
| **Patterns** (VPX architecture, MPF ontology, rule structure) | 2 yr | **2028-08-26** | Stable; VPX's core design has held since VP10 [3][30] |
| **Machine geometry & physical specs** | — | *does not stale* | Standard-body dimensions and ball spec have been constant for decades [14][18] |

**Earliest re-check: 2026-09-26** — engine versions and WebGPU browser support. Both feed the renderer decision directly, and a Refresh run scoped to those two rows would be cheap.
