---
title: 'Reconciliation: technical research → PRD + addendum'
input: '_bmad-output/planning-artifacts/research/technical-pinball-simulation-engine-and-technology-2026-08-26/research.md'
targets: 'prd.md, addendum.md (same folder as this file)'
created: '2026-08-26'
---

# Reconciliation: technical research → PRD and addendum

Scope: what the research contains that the PRD/addendum failed to carry, got wrong, or overstated — with attention to numbers, confidence levels, and things the research says do not exist. Two items are out of scope by instruction and are **not** flagged: the deliberate browser-first override of the research's native-first recommendation, and the research's "GPL-2.0" reading of vpx-js (resolved at project level as GPL-2.0-or-later per source headers).

Severity key: **blocker** = architecture/epics would be built on a wrong fact · **should-fix** = a downstream decision would be made without a fact the research supplies · **nice** = completeness.

---

## 1. Coverage table

| Research § | What landed where | Status |
|---|---|---|
| §1 Executive summary | Purpose-built physics core, Babylon, MPF-shaped rules → addendum §1. Tick rate (480–1000 Hz) not CCD → PRD NFR-2, SM-C3; addendum §2. Elasticity falloff + coil ramp-up, scatter 0 → PRD FR-6, FR-8; addendum §2. Browser-first as least-evidenced premise → overridden (addendum §1, §5) — but the *reason* for the override narrows the research's concern (see M8). Licensing encumbrance → PRD §9, addendum §6. | Covered; one misstatement (M8) |
| §2 Modern feature vocabulary | Stern skeleton (ramp qualifier → scoop mode-start → stacking by priority → wizard later) → PRD §4.6, FR-32, FR-40, §6.2. 3-ball/4-ball grammar → FR-37, §6.2, addendum §3. Progressive jackpot, extra-ball menu → FR-38, FR-21. Insert colour as state channel, four lighting channels, flashers coil-class → FR-42–45, glossary, addendum §1. Tilt/slam/ball-save/match/ball-search table → FR-14–16, FR-19, FR-22, FR-23, addendum §4. Layered adjustments, Competition preset → addendum §4. | Covered; tilt-warning default invented (I4); slam-tilt sensor distinction softened (M9) |
| §3 Machine geometry | Playfield, pitch, ball diameter → PRD FR-4, glossary; competition pitch range → addendum §2. Ball mass, bat length, pivots, durometer, coil banding → addendum §2. "Numbers that do not exist" → addendum §2. VPX constants (0.88 / 0.15 / 0.8–0.9), dimensionless-only porting → addendum §2. Tip gap as "the one unmeasured quantity" → addendum §2 only. FL-11629 coil spec → not carried. | Covered; confidence tags dropped on two values (M2); tip gap missing from PRD Open Questions (G1); two strength numbers invented (I1, I2) |
| §4 Simulation architecture | 1000 Hz step, semi-implicit Euler, adaptive subdivision, analytic TOI, flipper torque model, four tunables, nudge oscillator, tilt pendulum, 200 ms bailout, forced advancement, hardcoded ball–ball restitution, full primitive set + two broadphases, collision scaffolding → addendum §2. Verify constant against vpx-js not upstream → addendum §2. Do-not-cite FX/Pro Pinball → addendum §7. **"Stability hazard is iteration explosion, not tunneling"** → not carried. | Covered except G2 |
| §5 Technology selection | Hard gates → NFR-1, NFR-2, NFR-6; lamp count 50–150 → addendum §1 only. Field table → addendum §5. Babylon structural-not-benchmark → addendum §1. WebGL2 floor + WebGPU → FR-54. vpx-js dormant, HEAD 2020-11-12 → addendum §1. MPF ontology → addendum §1, §3. Lighting baked per-group, standard UVs, inserts-not-decals → FR-43, addendum §1. **Clustered-lighting-is-medium-confidence-and-possibly-WebGPU-only caveat** → dropped (M1). **Bake inserts white, tint at runtime; cup mesh + translucency map** → not carried (G4). vpx-js tuning constants → not carried (G5). | Covered with one should-fix misstatement (M1) |
| §6 Cross-dimension insights | Jolt constraints → compound body, real thickness, switches as zone tests → addendum §2, FR-11. Table-dependent realism, no realism benchmark → addendum §7, PRD SM-4. Field empty at the top → PRD §1 (overstated, M3). Browser attempt criticised on feel (ball size, bouncy launcher, too fast) → FR-4 partially; plunge/pace not in the feel test (G6). | Covered; M3, G6 |
| §7 Contrary evidence & licensing | Planck 400+ h, VPX open defects, general-engine counter-examples → addendum §5, §7. Licence table → addendum §6 (vpx_lightmapper correctly marked "not stated"). | Covered |
| §8 Recommendations 1–8 | 1, 3, 4, 5, 6, 8 → addendum §1/§2; 2 resolved at project level; 7 overridden by decision. Three spikes → addendum §1 (spike 2 carries an invented memory figure, I3). | Covered |
| §9 Open questions | See section 5 below. Tip-gap question not named in PRD OQ (G1); JJP question not carried (harmless). | Mostly covered |
| §10 Source appendix | Confidence levels partially carried: pulse model "medium", durometer "low", pivots "medium" survive in addendum §2; ball mass "medium" and bat length "medium" do not (M2); Babylon pick "medium" not carried (M7). | Partial |
| §11 Staleness map | 2026-09-26 re-check → addendum §1. Ecosystem (2027-02-26) and landscape (2027-08-26) windows not carried. | Partial (nice) |

---

## 2. Gaps

**G1 — Flipper tip gap and the Bally playfield template are not named in the PRD's Open Questions.** *should-fix*
Research §3: "The tip gap is the one unmeasured quantity in the entire drain triangle, and it is the geometry the whole game balances around." Research §9: "What is the measured flipper tip gap and arc? A DXF/SVG Bally playfield template — the highest-value unclaimed artifact. Would settle tip gap, outlane widths and post positions at once [23]."
PRD OQ6 lists playfield geometry generically (loops, ramp, dragon, pops, slings, bank) and never mentions the tip gap, the outlane widths, or the template as the way to close it. The addendum mentions the tip gap only inside the "do not invent" list. → **Destination: PRD §10 OQ6** — add the tip gap / outlane width / post positions as the first item and the Bally template as the answer path. Epics need this as a spike or a modelling prerequisite.

**G2 — "In a time-of-impact design the stability hazard is iteration explosion, not tunneling."** *should-fix*
Research §4, verbatim. The addendum carries the mitigations (forced time advancement, 200 ms bailout) as a list of implementation notes, and §7 says "tunnelling is the easy part", but nowhere states what the actual failure mode is. PRD FR-7 is titled "No tunnelling, no stalls" — the architecture will read that as the risk. → **Destination: addendum §2 implementation notes** (one sentence), and consider retitling FR-7's consequence to name the stall/iteration hazard explicitly.

**G3 — Residual risk of the browser premise is not stated once the native-first mitigation was removed.** *should-fix*
Research §1: "No named commercial browser game at 'visually rich 3D simulation' fidelity could be found … That is absence of evidence, not evidence of absence — but it is your foundational premise." Research §8 rec 7 was the mitigation; the project removed it. The addendum reframes the concern as "reasoned about a commercial product" (see M8) and lists the spikes, but nothing says the spikes are now the *only* mitigation. → **Destination: addendum §1** — state that spike 3 (build size/load) and spike 1 (1000 Hz JS loop) are early gates for the browser premise, not optional pre-commit checks; **PRD** has no risks section, so OQ or NFR-4's note should say "gate".

**G4 — Insert modelling detail and the white-bake trick.** *nice* (cheap, and it directly implements FR-44)
Research §5: "Inserts are not decals — the real look is a light below the playfield, a cup mesh, and a translucency map [40]. Cheap trick worth stealing: bake RGB inserts to white and tint at runtime." PRD FR-43 carries "light beneath the translucent playfield through a cup"; the translucency map and the white-bake-then-tint technique (which is what makes a fixed colour grammar cost one texture per group rather than one per colour) are absent. → **Destination: addendum §1 Lighting row.**

**G5 — vpx-js tuning constants.** *nice*
Research §5: "`PHYS_SKIN 25.0`, `PHYS_TOUCH 0.05`, `C_DISP_GAIN 0.9875`, `STATICTIME 0.005` [32]" — "the tuning constants a bespoke core takes years to discover." Addendum §2 carries the VPX flipper values but not these engine constants. → **Destination: addendum §2 table** (or a pointer to `lib/physics/constants.ts`).

**G6 — The one browser pinball attempt's named feel failures are not in the feel test.** *nice*
Research §6: "criticised for feel — ball far too small relative to real proportions, launcher too bouncy, game too fast." PRD UJ-4/SM-4 test cradling, flipper snap, and rejection/rebound; FR-4 covers proportions. Plunger feel and overall pace are the two documented failure modes not covered. → **Destination: PRD UJ-4 / SM-4** — add "plunge" and "pace" to the named-difference list, or note why not.

**G7 — Lamp-count scale is absent from the PRD.** *nice*
Research §5 hard gate: "lighting-dominated scene (50–150 individually addressable lamps)". Only addendum §1 carries 50–150; PRD FR-42/43 bound nothing. The architecture will need an order of magnitude for inserts. → **Destination: PRD FR-43 consequence or §6.1**, tagged as a design envelope.

**G8 — Staleness windows beyond the first.** *nice*
Research §11 gives ecosystem-health re-check 2027-02-26 and landscape 2027-08-26; addendum §1 carries only 2026-09-26. → **Destination: addendum §1 "Decision freshness".**

Not gaps (checked, deliberately absent): FL-11629 coil resistance spec; Marco AWG/turn-count absence; MPF `psus` device; Kalman-filtered accelerometer (keyboard-only sim); Stern adjustment vocabulary specifics (`RIGHT FLIPPER POWER 235`) — operator menu is out of v1 scope; JJP mechanism details (no magnets or rocking playfield in DragonWar); wpc-emu (closed as "not needed").

---

## 3. Misstatements

**M1 — Addendum states baking is "not [about] light count" unconditionally; the research conditions that on clustered lighting, which it rates medium confidence and possibly WebGPU-only.** *should-fix*
Addendum §1 Lighting: "Baking earns its place for indirect bounce and contact-soft shadows, *not* light count (Babylon's clustered path handles 2,000 lights; a playfield needs 50–150)."
Research §5: "Babylon's clustered forward path does 2,000 dynamic lights at 1080p/60fps on an RTX 4070 laptop [41] (falling to 300–500 at 4K) … Clustered lighting appears to be a WebGPU-path feature in both engines [42][41], which would make it the *graphics baseline* rather than any property of pinball that forces baking. Treat that last step as **medium confidence**." Source [41] is itself medium confidence.
Why it matters: PRD FR-54 makes WebGL2 the floor and requires that path be "fully playable, not degraded in feel". If clustered lighting is WebGPU-only, then on the floor path light count *does* force baking, and the addendum's rationale would lead the architecture to treat dynamic lighting as free on WebGL2. The addendum should carry the caveat and the hardware qualifier on the 2,000 figure.

**M2 — Medium-confidence geometry presented as "real values".** *nice*
PRD FR-4: "Ball, flipper, and Playfield dimensions match the real values (… flipper bat 3.125 in rubbered …)." Addendum §2: "ball … ~80 g; flipper bat 3.000 in bare / 3.125 in rubbered" in the "usable as-is" sentence.
Research §3 table rates ball mass and flipper bat **medium**; source [18] explicitly notes "mass and bat length are not on this page, see [5]" (VPE docs, not a manufacturer). Playfield, pitch and ball diameter are high. The addendum carries "medium" for the pivot geometry and "low" for durometer but drops it for mass and bat length. Tag both.

**M3 — PRD overstates "nobody has shipped".** *should-fix (wording)*
PRD §1: "The field is empty, not contested: nobody has shipped a finished, free, click-and-play 3D pinball table with credible physics."
Research §1/§7/§6: "A single-file browser pinball demo achieves it at 480 Hz [31]" (Neon Gutter, "nothing tunnels", high confidence); "Browser pinball *does* run on general engines — three.js + cannon-es, R3F + Rapier, three.js + Ammo [50][51]. None is cited by the pinball community as a physics benchmark, but 'a general engine cannot do browser pinball' would be an overstatement." What the research supports is "no browser 3D pinball is cited as a physics benchmark and no WebGPU-native pinball project of any maturity exists [2]" — not that none has shipped. The addendum §2 simultaneously relies on Neon Gutter's 480 Hz as the working floor, which is inconsistent with the PRD's claim.

**M4 — Addendum gives a coil-strength band the research says does not port.** *should-fix*
Addendum §2: "Era note: modern Stern/JJP feel is the ~3200–3300 VPX-unit band; calibrating to the Reference machine inherits that." Same section, one paragraph earlier: "strength values are VPX-internal units and do not [port]."
Research §3: "era-banded coil strengths [5]. Dimensionless values port directly; the strength numbers are VPX-internal units and do not." No band value appears anywhere in the research. See I2.

**M5 — Coil ramp-up carries a value the research never gives.** *should-fix*
Addendum §2: "Coil ramp-up | 2.5 | Solenoid acceleration time."
Research §1 and §4 describe coil ramp-up qualitatively ("the solenoid's acceleration time", "a ramped solenoid model") with no number. See I1. It may be the VPE default, but then the addendum must cite VPE directly, not present it under "starting values" alongside research-sourced constants.

**M6 — Tilt-warning default presented as a Stern fact.** *should-fix*
PRD FR-14: "up to the Settings count (default 1)". Addendum §4: "Stern default warnings 1; Competition preset sets 2."
Research §2: "Enabling `COMPETITION MODE` *sets* `TILT_WARNINGS` to 2" — the research gives no factory default. See I4.

**M7 — Renderer pick's confidence dropped.** *nice*
Addendum §1 heading: "Technical direction (settled by the research; not re-argued)."
Research §8 rec 3: "*Confidence: medium on structural grounds …*"; §11 sets a 1-month re-check. The addendum carries the re-check date but not the confidence. "Settled by the research" overstates for the renderer row specifically; physics (rec 1) and rules (rec 4) are the high-confidence rows.

**M8 — Override reason narrows the research's concern.** *should-fix (see G3)*
Addendum §1 and §5: "Overrides the research's native-first recommendation, which reasoned about a commercial product."
Research §1: the concern is that no browser game at this *fidelity* exists ("Unity's own web showcase is demoware-scale while its high-fidelity titles ship native [27]"), plus payload (§5: empty Unity web build 7–11 MB) and unmeasured load (§8 spike 3). Only the §9 open question ("no public browser-vs-Steam revenue comparison") is commercial. The override is a valid decision; its stated rationale answers the distribution half and leaves the technical-precedent half unaddressed.

**M9 — Slam tilt: a different sensor, softened into a Nudge threshold.** *nice (already OQ4)*
Research §2: "Slam tilt — A **different sensor** — a switch on the coin door, not the plumb bob." PRD glossary carries "a separate cabinet-abuse sensor" correctly, but FR-16's assumption ("a rapid repeated Nudge past a threshold") drives it from the same input the bob reads. OQ4 already holds the question; note there that the research's point is that the two must not share a threshold.

**M10 — Ball-search suppression example is more specific than the research.** *nice*
PRD FR-23: "the Lock does not release locked balls during Ball search while a Mode timer is running." Addendum §4: "(do not release locked balls during a multiplier timer)."
Research §2: "Real machines suppress parts of it when rules state would be corrupted." The specific case is not in the research (possibly from MPF source [13] or the brief); the PRD and addendum also disagree with each other ("Mode timer" vs "multiplier timer"). Align and source.

**M11 — Addendum §7 makes claims about vpx_lightmapper the research does not.** *nice*
Addendum §7: "vpx_lightmapper is pre-alpha, no shadowing, no movable objects."
Research says only that it publishes no scaling numbers [55] and documents the per-group technique [40]. These details may come from the red-team digests, but they are not in research.md; cite or drop.

**M12 — Minor additions to research-sourced lists.** *nice*
Addendum §2 primitive list adds "points, planes" (research: circles, line segments, triangles, 3D polygons, 3D line segments); flipper model adds "and return spring" (not in research). Both are plausible from vpx-js source but are not research-sourced; harmless if the architecture reads the source.

---

## 4. Invented numbers (untagged, not supported by the research)

| # | Where | Number | Research position | Action |
|---|---|---|---|---|
| I1 | Addendum §2 | Coil ramp-up **2.5** | No value given; ramp-up described only qualitatively | Tag `[ASSUMPTION]` or cite the VPE flipper docs directly |
| I2 | Addendum §2 | "**~3200–3300** VPX-unit band" for modern Stern/JJP | No band value; research states strength numbers are VPX-internal and do not port | Remove, or tag and cite; at minimum reconcile with the "do not port" sentence above it |
| I3 | Addendum §1 spike 2 | "~**10 × 2048² RGBA8 ≈ 160 MB** is 'a lot'" | "vpx_lightmapper publishes no numbers at all [55]" | Tag as an illustrative calculation, not a research figure |
| I4 | PRD FR-14; addendum §4 | Tilt warnings **default 1**; "Stern default warnings 1" | Only "Competition sets TILT_WARNINGS to 2" | Tag `[ASSUMPTION]` in FR-14 and index in §11; drop "Stern default" wording in addendum |
| I5 | PRD NFR-1 | "**mid-range 2022+ laptop GPU**" | Hard gate is "stable 60+ FPS" with no hardware target | Tag `[ASSUMPTION]` and index; architecture needs a target machine and should know it is chosen, not sourced |
| I6 | PRD FR-17 | Balls per game **default 3** | Not stated (UJ-2 says "three-ball game"; universal convention) | Negligible; optionally tag "standard convention" like FR-25 |
| I7 | PRD FR-7 | "**30, 60, and 120 Hz** display rates" | Not stated; determinism across display rates follows from the fixed timestep | Negligible; illustrative — leave or mark as test cases |
| I8 | PRD FR-19 | "a drain **1 s** after the timer reads zero" | Illustration under the tagged 2 s grace | Negligible |

Correctly tagged and not flagged: FR-10 pitch range, FR-19 grace 2 s, FR-22 8 %, FR-33/35/38 scoring values, NFR-3 latency, NFR-4 load. The research's "do not invent" list (restitution/friction, coil pulse duration, tip gap, drain zone, hours-per-table) is honoured: no such figure appears in either document.

---

## 5. Research open questions and spikes — carried?

| Research item | Carried? | Where |
|---|---|---|
| OQ: Is browser-first the right distribution premise? | Yes — decided (browser-first) | Addendum §1, §5. Residual technical risk not stated (G3, M8) |
| OQ: Measured flipper tip gap and arc (Bally template) | **Partially** — tip gap in addendum "do not invent" list only | Not in PRD OQ (G1). Add to OQ6 |
| OQ: Restitution/friction steel-on-clearcoat / rubber | Yes — as a "does not exist" | Addendum §2 |
| OQ: Can wpc-emu be driven externally? | Yes — closed | Addendum §6 "Not needed" (no ROMs, original table) |
| OQ: Hours per table — "do not let one be invented" | Yes | Addendum §2; no hours figure appears in PRD or addendum |
| OQ: JJP mechanism details unverified | Not carried | Harmless — DragonWar has no magnets or rocking playfield. PRD OQ1 names JJP only as a Reference-machine era |
| Spike 1: 1000 Hz JS loop, 6 bodies vs Rapier/Jolt WASM | Yes | Addendum §1 (wording "1–6 body regime" vs research "6 bodies" — trivial) |
| Spike 2: lightmap scaling envelope | Yes | Addendum §1 — with an invented memory figure (I3) |
| Spike 3: browser build size and load time, measured | Yes | Addendum §1; PRD NFR-4 tagged "measure in a spike" |
| Rec 2: resolve the licence before any code | Yes — resolved | PRD §9, addendum §6 |
| Rec 5: standard-UV lightmaps, decide before modelling | Yes | Addendum §1 |
| §11 re-check 2026-09-26 (engine versions, WebGPU support) | Yes | Addendum §1 |
| §11 later windows (2027-02-26, 2027-08-26) | No | G8 (nice) |

None of the spikes appears in PRD §10 Open Questions; the addendum is an acceptable home, but epics should treat spikes 1 and 3 as gates (G3).
