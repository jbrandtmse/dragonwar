# Reconcile: Architecture Spine vs Technical Research

**Spine:** `ARCHITECTURE-SPINE.md` (draft, 2026-08-26)
**Research:** `research/technical-pinball-simulation-engine-and-technology-2026-08-26/research.md` + `digests/redteam-physics.md`, `digests/redteam-renderer.md`
**Method:** every §8 recommendation, §4 architecture finding, §6 engine-constraint lesson, §2 machine-ops behaviour, §7 licensing trap, §11 staleness row, red-team correction and "do not cite / do not invent" warning was checked for a structural home in the spine. Where the PRD/brief deliberately overrode the research (browser-first, scatter = 0) the override is treated as settled and only the spine's carrying of it is judged.

**Counts:** Contradictions 3 · Missing/should-fix 9 · Minor 10 · Confirmed-covered 27

---

## 1. Contradictions (must fix)

### C-1 — AD-15 treats every physics constant as a tunable; the research says the solver constants are the point of the port, and ball-ball restitution is deliberately hardcoded

- **Spine:** AD-15 *Prevents:* "magic numbers scattered across physics files"; *Rule:* "Every tunable ... is data in `sim/table/tuning.ts`; the dev tuning panel hot-applies to the running sim."
- **Research:** §4 — VPX exposes **four per-object tunables only** (elasticity, falloff, friction, scatter) and a set of *playability concessions* including **hardcoded ball-ball restitution**. §5 / redteam-physics #1 — `PHYS_SKIN 25.0`, `PHYS_TOUCH 0.05`, `C_DISP_GAIN 0.9875`, `STATICTIME 0.005`, `C_CONTACTVEL`, `C_LOWNORMVEL`, `VELOCITY_EPSILON` are "the tuning constants a bespoke core takes years to discover" — the reason to port rather than write.
- **Why it matters:** as written, AD-15 invites lifting solver constants out of `physics/constants.ts` into the hot-tunable panel. Changing any of them silently invalidates every golden replay (AD-15's own test strategy) and re-opens the long-tail defect classes the research documents (§7 [49]).
- **Fix (AD-15):** split the class. "Two constant classes: **solver constants** (`sim/physics/constants.ts`, ported verbatim from vpx-js, including ball-ball restitution; not hot-tunable; a change is a physics-version bump that re-records golden replays) and **table tunables** (`sim/table/tuning.ts`: the four per-object VPX tunables, coil ramp/pulse/hold, pitch bounds, timers, scoring) which the dev panel hot-applies." Reword *Prevents* to "table tunables scattered across physics files".

### C-2 — AD-3/AD-4/AD-15 promise bit-exact replay from `seed + inputs`, but AD-3 seeds only *rules* randomness; the ported physics has its own RNG path (scatter) that the spine never pins to zero or seeds

- **Spine:** AD-3 "All **rules** randomness ... draws from a seeded PRNG stored in `GameState.rng`." AD-4 "A replay ... must reproduce the state hash." Scatter is not mentioned anywhere in the spine.
- **Research:** §1, §8.6 — "set scatter to zero ... randomness is tuned *down*"; §4 — scatter is one of VPX's four per-object tunables, i.e. it is a live code path in the port, and in VPX it is fed by a random source. PRD addendum already decides scatter = 0, but the spine (the build substrate) does not carry it.
- **Why it matters:** one surviving unseeded `Math.random()` (or the port's own `rand_mt_01` equivalent) inside `sim/physics` makes the replay guarantee false and the boundary lint (AD-16) does not catch it today.
- **Fix (AD-3):** extend the rule to physics. "Scatter is 0 by default for every object (research §8.6). Any random draw inside `sim/physics` reads from a seeded PRNG held in physics state and captured in the replay header; `Math.random` is a lint error anywhere under `sim/**` (add to AD-16's forbidden list)."

### C-3 — AD-5 says nudge is cabinet motion, not ball force — but the spine's physics source ships the opposite as a known open defect

- **Spine:** AD-5 *Prevents:* "nudge modelled as a force on the ball"; *Rule:* "Nudge is an impulse to the cabinet oscillator in physics." Stack: physics = vpx-js port.
- **Research:** §7 [49] / redteam-physics #4 — VPX carries "a *physical model* error (nudge implemented as force on the ball rather than movement of the table) that survived two decades" — **open** since 2026-03-18. vpx-js is a faithful port of that code (§5: "uses the same physics code than Visual Pinball").
- **Why it matters:** a verbatim port delivers exactly what AD-5 claims to prevent, and nothing in the spine flags the nudge path as the one place the port must *not* be trusted.
- **Fix (AD-5):** add "The vpx-js nudge coupling is a known VPX model defect (research §7 [49]): port the damped-harmonic cabinet oscillator, but re-derive the ball coupling as table-frame motion (ball keeps inertia while the cabinet moves), and pin it with a golden replay (AD-15)."

---

## 2. Missing / should-fix

Each entry: research reference → suggested one-line addition and where.

### M-1 — Primitive set and broadphase are not named
- **Ref:** §4 ("the primitive set is bigger than circles and line segments ... triangles, 3D polygons, 3D line segments, **and two broadphase structures**"), §8.1 ("budget for ..."), redteam-physics #2.
- **Spine today:** Structural seed says only "hit objects, TOI collide, flipper, ball, broadphase".
- **Add (AD-11, after the `col_` prefix sentence):** "`col_` scaffolding must reduce to the ported primitive set — circle, point, line segment (2D, z-axis, 3D), plane, triangle, 3D polygon — under a quadtree + k-d tree broadphase; a mesh that does not decompose into these is a `vis_`, not a `col_`."

### M-2 — Port scope is stated as `lib/physics/` only; the step cycle and item movers live elsewhere in vpx-js
- **Ref:** §4 (fixed 1000 Hz outer step, TOI loop, forced advance, 200 ms bailout, flipper torque model, cabinet oscillator, tilt bob) — none of these are hit primitives; in vpx-js they sit in the player-physics cycle and the per-item `*-hit` / `*-mover` classes (`lib/game/player-physics.ts`, `lib/vpt/<ball|flipper|plunger|kicker|trigger|bumper|spinner|gate|...>/`). *Verify exact paths at port time; the research itself only cites `lib/physics/constants.ts` [32].*
- **Spine today:** Stack row "vpdb/vpx-js (port source) ... `lib/physics/`".
- **Add (Stack row):** "`lib/physics/` (primitives, broadphase, constants) + the physics cycle and per-item hit/mover classes (`lib/game/player-physics.ts`, `lib/vpt/*/`) — paths confirmed against the pinned commit before porting."

### M-3 — Forced time advancement inside the step is absent
- **Ref:** §4 — "forced time advancement to escape collision clusters ... **in a time-of-impact design the stability hazard is iteration explosion, not tunneling.**"
- **Spine today:** AD-4 has the 200 ms host-side cap and nothing bounding the inner TOI loop.
- **Add (AD-4 rule):** "Inside one step the TOI loop is bounded: a forced minimum advance (`STATICTIME`, a solver constant) breaks collision clusters, so a step always terminates and does so deterministically."

### M-4 — 1 kHz is hard-wired into the contract and every timer is authored in ticks; the research gives 480–1000 Hz as the range and spike 1 as the gate
- **Ref:** §1 ("the working range is 480–1000 Hz, not 1000 Hz specifically" [31]), §8.1, redteam-physics "soften ~1000 Hz", spike 1 ("nobody has published this").
- **Spine today:** AD-3 "`tick` (uint32, 1000 Hz)"; conventions "`ballSaveTicks`". If spike 1 fails, every tick-valued tunable and the replay format change together.
- **Add (AD-3 or conventions):** "`TICK_HZ = 1000` is one constant in `sim/table/frames.ts` (the port's `PHYSICS_STEPTIME`); time tunables are authored in ms (`ballSaveMs`) and converted once. Spike 1 may lower it to 480 Hz (research [31]); doing so also re-records golden replays." Note the `xxxTicks` naming convention would then change to `xxxMs`.

### M-5 — Clustered lighting on WebGL2: the spine should state it (not a contradiction)
- **Ref:** §5 hedged clustered lighting as a possible WebGPU-path feature at **medium confidence**; redteam-renderer #1 asserted WebGPU-only but admitted the Babylon doc page "failed to fetch ... a real gap in my evidence". Web-verified 2026-08-26 by the spine author: Babylon clustered forward works on WebGL2, ~23 lights per batch.
- **Spine today:** AD-12 is silent; **Deferred** lists "clustered lighting for more live inserts" under *WebGPU-specific enhancements* — which reads as the research's un-hedged, now-superseded version.
- **Add (AD-12 rule):** "Babylon clustered forward lighting runs on WebGL2 (verified 2026-08-26, ~23 lights per batch), so the WebGL2 path may use it for live inserts; the per-group bake is justified by indirect bounce and contact-soft shadows (research §5), not by light count." Then remove "clustered lighting" from the Deferred WebGPU bullet, leaving shadows/quality there.

### M-6 — Insert construction (not decals) is missing from the asset contract
- **Ref:** §5 [40] — "Inserts are **not decals** — the real look is a light *below* the playfield, a cup mesh, and a translucency map ... bake RGB inserts to *white* and tint at runtime."
- **Spine today:** AD-12 has the white-bake trick; AD-11 lists `l_` insert meshes but not how they are built. The research's parallel warning for lightmap UVs ("decide before modelling starts") applies equally here because it shapes the Blender source.
- **Add (AD-11, glb prefixes):** "`l_` inserts are geometry — a cup and a translucent insert face lit from below in the bake — never a decal texture on the playfield."

### M-7 — AD-16 omits the vpinball C++ first-line licence rule
- **Ref:** §7 [1] — "files converted to GPLv3+ carry `// license:GPLv3+` on their first line ... every file that doesn't ... will stay under the 'old MAME'-like license"; §4 [3] names the C++ source as "the single best available blueprint"; vpx-js is *unfinished*, so the port will consult it.
- **Spine today:** AD-16 covers vpx-js notices only. `CLAUDE.md` has the rule, but AD-16 is the spine's build rule and should not be narrower than the repo rule.
- **Add (AD-16 rule):** "Anything read from `vpinball/vpinball` is usable only if the file's first line is `// license:GPLv3+`; unmarked files are non-commercial and may not be ported or paraphrased."

### M-8 — Solver-constant dependency of the tick rate is unstated (couples M-4 and C-1)
- **Ref:** §5 [32] — `PHYSICS_STEPTIME = 1000` sits beside `STATICTIME`, `C_DISP_LIMIT`, etc.; several are per-step quantities.
- **Add (AD-15, after C-1's split):** "Solver constants are tuned for `TICK_HZ = 1000`; changing the tick rate is a physics-version bump, not a tunable change."

### M-9 — The three spikes: spike 2's output feeds the table definition, and spike 1's comparator is silently dropped
- **Ref:** §8 spikes — spike 2 = "light-group count, lightmap resolution, frame cost"; spike 1 = "1000 Hz JS loop over 6 bodies **vs the same scene in Rapier/Jolt WASM**".
- **Spine today:** Deferred runs 1 and 3 in epic 1 and defers 2 to the presentation-depth phase; spike 1 has no comparator; nothing says the `lightgroup` partition is provisional.
- **Add (Deferred, spikes bullet):** "Spike 1 is a pass/fail frame-budget test (the WASM comparator is dropped because sourcing is decided); spike 2's light-group count is an *input* to the table definition's `lightgroup` partition, which stays provisional until it runs."

---

## 3. Minor

- **N-1 Pin vpx-js by commit SHA, not "master @ 2020-11-12".** Research §5 corrected the red team precisely because `master`'s `pushed_at` moved on bot branches [2]. Stack row: replace the date with the HEAD SHA of the default branch.
- **N-2 Layered store: a preset both sets *and constrains*.** §2 [12] — Competition mode sets `TILT_WARNINGS = 2` *and removes options from other menus*. AD-14's layer order is right; add "a preset may lock keys" so the schema has that notion when Competition mode arrives (Deferred already reserves the slot).
- **N-3 Match percentage is unverified.** §2 ⚠️ — 8 % / multiple-of-ten traces to a 2005 OCR. Keep `matchPercent` as data in `tuning.ts` (AD-15) and tag it unverified rather than baking a literal into `rules/`.
- **N-4 Jackpot seed scope (cross-ref to reconcile-prd).** AD-7 places "Jackpot seed" under `machine`; the research pattern (§2 [6], per-player progressive) and PRD FR-41 ("persist per player for the game") both read per-player. Confirm before AD-7 is frozen.
- **N-5 Havok is not a dependency.** The research's Babylon pick leans on the first-party Havok plugin (§5 [34]); the spine uses none of it. One line in AD-16's forbidden imports (`@babylonjs/havok`) prevents drift toward the engine physics the research shows fighting the domain (§6).
- **N-6 Browser-first vs research §8.7.** The PRD addendum overrides native-first explicitly and names spikes 1 and 3 as gates; the spine carries the gates but not the override. Add "browser-first per PRD addendum, overriding research §8.7; AD-17 keeps native viable at zero cost" to Deferred's open-gates line so the spine is self-explaining.
- **N-7 Realism has no defined target** (§6 [2]). AD-15's golden replays are the only instrument; consider naming replay-derived trajectory logs from the dev panel as the project's realism measurement, since the research says "we would have to define and measure it ourselves".
- **N-8 Staleness rows beyond 2026-09-26.** The spine records only the earliest re-check. Ecosystem-health (2027-02-26) is moot once vpx-js is pinned (N-1); patterns (2028-08-26) are irrelevant post-port. Fine at spine altitude; note the Tauri row falls under "versions" (1 mo).
- **N-9 pinball-parts CC BY-SA carries one NC-SA node group** (§7 [54]). If any of those models enter `assets/src/`, the exclusion belongs in `ATTRIBUTIONS.md`; the spine's "ATTRIBUTIONS first" convention covers the mechanism.
- **N-10 Standard-body envelope.** §3 [14] 514.4 × 1066.8 mm and 6.5° factory pitch are the only "does not stale" numbers in the research; AD-10 could name the envelope so the Blender source and `frames.ts` bounds share one figure. Optional.

---

## 4. Confirmed-covered

| Research item | Spine home |
| --- | --- |
| Purpose-built analytic-TOI core, fixed timestep, ported from vpx-js not written blind (§1, §8.1, redteam "adopt or port") | Paradigm, Stack, AD-4, Structural seed |
| Physics runs as internal substeps per rAF, not a wall-clock 1 ms timer (redteam-physics) | AD-4 host accumulator |
| 200 ms catch-up bailout discards simulated time (§4) | AD-4 |
| Flippers as torque-driven rigid bodies: ramped solenoid, pulse-then-hold, end-of-stroke fade (§4, §3 [20]) | AD-5; Deferred (pulse/hold/ramp tunables) |
| Nudge = damped-harmonic cabinet oscillator (§4) — *modulo C-3* | AD-5 |
| Tilt bob as pendulum; debounce window + settle time (§2, §4) | AD-5, AD-3 |
| Slam tilt is a different sensor with its own threshold (§2) | AD-5 (`s_slam_tilt`, host detector) |
| Tilt warnings per player; bonus per player (§2) | AD-7 |
| Ball save grace period, hurry-up, timers as ticks (§2) | AD-3 |
| Switches are analytic zone tests, not physics sensors (§6 [45]) | AD-11 `sw_` |
| Playfield as one compound collision body (§8.8 [43]) | AD-11 |
| Walls and floor with real thickness, never zero-thickness planes (§8.8) | AD-11 |
| Simplified invisible collision scaffolding, visual mesh non-collidable (§4, redteam #7) | AD-11 `col_` / `vis_` |
| Rules layer = pure function of switch events, zero knowledge of ball velocity (§5, §8.4) | AD-2 |
| MPF device ontology and four-phase event vocabulary (§8.4) | AD-8, Conventions |
| MPF failure events (`eject_failed`, `ball_missing`) exist because mechanisms fail (§5 [39]) | Conventions (Events, Errors) |
| Physical vs virtual lock distinction (`ball_holds` vs `multiball_locks`) (§5) | AD-6 (device holds balls; credits on player) |
| Four lighting channels modelled separately (§2 [8][10]) | AD-12 |
| Flashers are coil-class, pulsed, duty-cycle limited (§2 [11]) | AD-9 `FlasherCommand { ms }` + driver limit |
| Insert colour is the mode-state channel (§2 [7]) | AD-9 role grammar |
| Per-light-group additive lightmaps, base + Σ group × tint × level (§5, §8.5 [40]) | AD-12 |
| Bake inserts white, tint at runtime (§5) | AD-12 |
| Standard UV lightmaps, not camera-projected — decided before modelling (§8.5, redteam-renderer) | AD-11 `TEXCOORD_1`, AD-12 *Prevents* |
| Bake pipeline is a productivity sink, kept off the critical path (redteam-renderer #5) | AD-12 (emissive first, bake later), Deferred |
| WebGL2 floor + WebGPU progressive enhancement; nothing WebGPU-only (§8.3 [38]) | AD-12, AD-17, Stack |
| Babylon on structural grounds; benchmark [33] not cited (§8.3) | Stack (no citation of [33]) |
| Fixed camera / walk-up is how the genre is played (redteam-renderer attack #4 failed) | `presentation/camera`, AD-12 |
| Pitch is a design surface — exposed, applied as gravity vector (§3 [17]) | AD-10, AD-15 pitch bounds, AD-14 overrides |
| Ball 26.99 mm / 50 VPU; VP units internal (§3 [18]) | AD-10 |
| Elasticity falloff + coil ramp-up as the realism levers (§8.6) | AD-15 tunables |
| Layered adjustments: defaults → preset → overrides (§2 [12]) — *see N-2* | AD-14 |
| vpx-js GPL-2.0(-or-later) port with notices preserved; ATTRIBUTIONS first (§7, §8.2) | AD-16, Conventions |
| vpx-js is a frozen reference, not a living library (§5 correction) — *see N-1* | Stack "port source" |
| Bally template DXF/SVG as highest-value geometry input (§9 [23]) | Deferred |
| Three spikes acknowledged; 1 and 3 gate browser-first (§8) — *see M-9* | Deferred |
| Earliest staleness re-check 2026-09-26 (§11) | Stack, Deferred |
| Do-not-cite items (Zen/Pro Pinball internals, Chipmunk, content-farm load figures) not cited; no hours figure invented (§4 [X8], §9 [56]) | — (absent, correctly) |
| Procedural audio must be possible in the browser (Godot disqualifier, §5) | AD-13 synth-or-sample provider |
