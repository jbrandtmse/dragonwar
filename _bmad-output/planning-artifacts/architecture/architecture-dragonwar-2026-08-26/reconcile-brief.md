---
title: 'Reconciliation: Architecture Spine vs Brief, Brief Addendum, PRD Addendum'
status: draft
created: '2026-08-26'
spine: ARCHITECTURE-SPINE.md
sources:
  - ../../briefs/brief-dragonwar-2026-08-26/brief.md
  - ../../briefs/brief-dragonwar-2026-08-26/addendum.md
  - ../../prds/prd-dragonwar-2026-08-26/addendum.md
---

# Reconciliation — spine vs brief / brief addendum / PRD addendum

Scope: the *quiet* requirements these three documents carry — tone, constraints, device-model consequences, research red-team implementation notes, licensing conditions, spikes and gates, "do not invent" numbers — that the spine's AD structure dropped or would let a builder violate. The PRD proper is reconciled separately.

Section references: **B** = brief, **BA** = brief addendum, **PA** = PRD addendum. Spine references are AD-n, conventions table, Stack, Structural Seed, Deferred.

Note on the clustered-lighting caveat: PA §1 says Babylon's clustered forward lighting "appears to be a WebGPU-path feature". That is stale (verified 2026-08-26: works on WebGL2, ~23 lights per batch). It is **not** reported below as a contradiction with the addendum — but the spine currently reproduces the stale reading in its own Deferred list, which is C-2.

---

## 1. Contradictions (must fix)

### C-1 — Plunger lane: AD-5 and AD-6 cannot both be true as written
- **Source:** BA §8 ("skill shot fires at the plunge, *before* the ball is in play"); PA §3 ("the trough auto-launches the difference to reach three"); PA §4 ("saved balls auto-launched"); B ("skill shot" in scope).
- **Conflict:** AD-5 makes the plunger a hardware rule *inside physics* acting on a ball. AD-6 makes `bd_plunger` a `ball_device` that "parks an entering ball — removed from the simulated set" and "ejects only on `CoilCommand eject(device)`". A ball removed from the simulated set cannot be struck by a spring plunger, and a manual plunge is not a `CoilCommand`. Both the manual skill-shot plunge and rules-driven auto-launch (ball save, War top-up) need this lane, and the spine gives them incompatible models.
- **Fix (AD-6, one sentence):** `bd_plunger` is a *mechanical-eject* device (MPF `mechanical_eject: true`): the ball stays simulated, resting in the shooter lane; entry switch `s_shooter_lane`; two exits — the manual plunger (hardware rule, AD-5) and `c_autoplunge` (`CoilCommand eject(bd_plunger)`); rules learn of a launch from `s_shooter_lane` opening, not from an eject acknowledgement. `bd_trough` and `bd_lock` keep the park-and-remove model.

### C-2 — Deferred list calls clustered lighting "WebGPU-specific"; the spine's own stack verification says it is on WebGL2
- **Source:** PA §1 lighting row (stale caveat, see note above); FR-54 via AD-12 ("No feature may require WebGPU").
- **Conflict:** Deferred bullet 3 reads "WebGPU-specific enhancements (clustered lighting for more live inserts, …)". A builder reading that bullet — or PA §1 — will design the WebGL2 path without clustered lighting and the WebGPU path with it, which is exactly the degraded-floor outcome AD-12 forbids. AD-12 itself never states which dynamic-light path the WebGL2 floor uses or how many live lights it budgets ("a few dynamic lights").
- **Fix:** AD-12 rule, add: "Clustered forward lighting is the WebGL2 path (verified 2026-08-26: WebGL2, ~23 lights per batch; re-verify 2026-09-26); the live-light budget on the floor is N — PA §1's 'WebGPU-path feature' note is superseded." Deferred bullet 3 → "WebGPU-only quality: higher light counts per batch, better shadows — never a feature".

### C-3 — Flipper solenoid model: "pulse-then-hold" is a second model bolted onto the vpx-js port
- **Source:** PA §2 ("Flipper pulse ~30 ms at 70%, then 25% hold — *medium confidence*, an MPF documentation example, not a measurement"); PA §7 ("VPX still carries open physics defects after 20 years… **Port; do not derive**"); PA §1 ("Porting inherits twenty years of tuning constants").
- **Conflict:** AD-5 lists "ramped torque, pulse-then-hold, end-of-stroke fade"; AD-15 lists "coil ramp-up, pulse" as tunables; Deferred lists "pulse ms, hold %, ramp-up". vpx-js's flipper mover has strength, ramp-up, EOS torque and angle, return strength, mass — no pulse duration and no hold percentage. Naming pulse/hold as parameters instructs the builder to derive a hybrid coil model, which PA §7 forbids, and turns a medium-confidence documentation example into an architecture parameter.
- **Fix (AD-5):** "The solenoid model is vpx-js's `FlipperMover` ported verbatim (strength, ramp-up, EOS torque/angle, return, mass/inertia ⅓·m·r²); MPF's pulse/hold figures are calibration references only, not parameters." Strike "pulse" from the AD-15 list and "pulse ms, hold %" from Deferred.

---

## 2. Missing / should-fix

Each: source → what the spine drops → suggested one-line addition and where.

### M-1 — Tick period is hard-coded as 1 ms in three places; spike 1 may move it to 480 Hz
- **Source:** PA §1 spike 1 (gate on the premise); PA §2 ("480 Hz is a demonstrated working floor… 1000 Hz is not load-bearing. Verify the constant against vpx-js `PHYSICS_STEPTIME = 1000` µs"); B ("fixed 480–1000 Hz").
- **Gap:** AD-3 ("uint32, 1000 Hz"), AD-4 ("⌊elapsed / 1 ms⌋"), conventions ("uint32, 1 kHz") and every `*Ticks` tunable bake in 1 ms. If spike 1 fails at 1 kHz the fallback rewrites three ADs and every tick-count tunable.
- **Add (AD-3 + convention):** "The step period is one constant `PHYSICS_STEPTIME_US` (ported from vpx-js, 1000 µs) in `sim/loop`; the accumulator and all `*Ticks` tunables reference it; spike 1's fallback is 480 Hz (2083 µs) at that one constant — nothing else in `sim/` may contain a literal millisecond."

### M-2 — Slingshots and pop bumpers have no owner; tilt must also disable *autofire* coils
- **Source:** PA §4 ("on tilt, flippers **and autofire coils** are disabled until every ball drains"); BA §8 ("pop bumper and slingshot placement"); BA §8 audio ("a drop bank resetting").
- **Gap:** AD-5 covers only flippers and plunger as hardware rules. Slings, pops, and the bank-reset coil are either hardware rules in physics (MPF `autofire_coils`) or rules-issued `CoilCommand`s with one tick of latency — the spine never says which, and `flippers.enable(bool)` is the only tilt gate.
- **Add (AD-5):** "Slingshots and pop bumpers are autofire hardware rules in physics (switch → coil, same tick), gated with the flippers by one `hardware.enable(bool)`; their switches (`s_sling_l/r`, `s_pop_*`) still surface to rules for scoring."

### M-3 — The DRAGON bank is six *drop* targets: a stateful physics device the spine never mentions
- **Source:** PA §5 ("Standup DRAGON targets; mixed bank — Rejected 2026-08-26. Author chose a six-target drop bank"); BA §8 ("a drop bank resetting").
- **Gap:** A drop target's collision is switched off when it is down, the bank resets on a coil, and a ball must not collide with a dropped target. Physics device lists in the paradigm table, AD-6, AD-11 and the seed (`physics/devices/`) cover ball devices only; the letters (rules) vs up/down state (physics) split is unstated.
- **Add (AD-6):** "Stateful devices (drop targets `s_dragon_[d,r,a,g,o,n]`, bank reset `c_dragon_bank_reset`; spinner) keep mechanical state in physics — collision toggled by state, reset only on `CoilCommand` — and report through switches; letter progress lives only in `players[i]`."

### M-4 — The spinner ("the loud loop") is a device with a pulse train, not a switch zone
- **Source:** BA §8 ("Spinner — on *one* loop only… That loop is the loud one"); PA §8 ("the loud loop and the quiet return").
- **Gap:** A spinner produces a decaying train of closures over many ticks after the ball passes, each of which scores and each of which sounds. AD-2's `ContactEvent` and the `sw_` analytic-zone model (AD-11) do not describe a self-driving device that emits switch events after contact.
- **Add (AD-11 node prefixes / AD-6):** "The spinner is a physics device: ball contact sets angular velocity; it emits `s_spinner` closures per revolution and a `ContactEvent { kind: 'spinner' }` per closure until it decays." Fits M-3's sentence.

### M-5 — No "shot" abstraction: joust, skill shot and the loop direction all need ordered switch sequences
- **Source:** BA §8 joust ("Consecutive loops build the charge; a miss breaks it… Alternate them — left, right, left. Same loop twice breaks the charge"); BA §8 skill shot; BA §8 layout rules ("orbit exits feed straight toward the flippers"); PA §8 ("joust is charge, pass, wheel around, charge again").
- **Gap:** Rules see bare `SwitchEvent`s (AD-2). "Left loop completed", "right loop rejected halfway", "skill-shot lane hit first after launch" are sequences with tick windows — MPF `shots`/`shot_groups`/`combos`. Without a named seam every mode will re-derive sequence detection.
- **Add (AD-8 or a new convention row):** "A *shot* is a named ordered switch sequence with a tick window, declared in `dragonwar.ts` (`shot_left_loop = [s_loop_l_in, s_loop_l_out] within N ticks`); `sim/rules/shots` turns switch events into `shot_<name>_hit` / `_broken` events; modes consume shots, never raw switch sequences."

### M-6 — Physics randomness is not under the determinism rule
- **Source:** BA §4 / PA §2 ("Scatter angle **0** — for every era; randomness is tuned *down*"); PA §8 ("randomness tuned down, hops deliberate").
- **Gap:** AD-3 seeds *rules* randomness only. vpx-js scatter draws a random number inside physics. The spine neither pins scatter at 0 nor says where physics randomness (if ever non-zero) draws from; a `Math.random()` in the port silently breaks AD-4's replay hash.
- **Add (AD-3):** "Physics has no randomness: scatter is 0 on every object (tunable, default 0); if scatter is ever enabled it draws from a second seeded PRNG in physics state, seed in the replay header."

### M-7 — Engine constants are not tunables; AD-15 would pull them into the hot-apply panel
- **Source:** PA §2 ("vpx-js engine constants `PHYS_SKIN 25.0`, `PHYS_TOUCH 0.05`, `C_DISP_GAIN 0.9875`, `STATICTIME 0.005` — port verbatim from `lib/physics/constants.ts`"; "hardcoded ball–ball restitution").
- **Gap:** AD-15 says "every tunable… is data in `sim/table/tuning.ts`; the dev tuning panel hot-applies". Read literally, the ported constants become sliders.
- **Add (AD-15 + convention):** "Engine constants ported from vpx-js (`sim/physics/constants.ts`: `PHYS_SKIN`, `PHYS_TOUCH`, `C_DISP_GAIN`, `STATICTIME`, ball–ball restitution) are not tunables: verbatim, not in `tuning.ts`, not on the panel."

### M-8 — Per-object materials: where elasticity/falloff/friction/scatter live per wall, post and rubber
- **Source:** PA §2 ("Per-object tunables — elasticity, elasticity falloff, friction, scatter. The only four; VPX per-object defaults 0.3 / 0.0 / 0.3 / 0.0"); BA §8 ("ball guides end at rubber posts").
- **Gap:** AD-11 gives Blender geometry and `dragonwar.ts` tunables; AD-15 puts every tunable in `tuning.ts`. Per-collision-mesh material values fall between the two — a builder will either put numbers on Blender custom properties (violating AD-15) or hand-map mesh names to values in TypeScript (violating AD-11).
- **Add (AD-11 node prefixes):** "`col_` meshes carry a `phys_material` custom property naming an entry in `tuning.ts`'s material table (`{ elasticity, elasticityFalloff, friction, scatter }`, defaults 0.3/0/0.3/0); the loader fails fast on an unknown material name."

### M-9 — Insert cup mesh and playfield translucency map are part of the asset contract, not the bake
- **Source:** BA §1 ("Inserts modelled as a light *below* a translucent playfield with a cup mesh, not as decals"); PA §1 ("inserts as a light below the playfield through a cup mesh with a translucency map").
- **Gap:** AD-11 fixes the glb contract now (`l_` insert lamp meshes) and AD-12 defers the bake. The early "emissive material" path needs no cup or translucency map, so the Blender source will be authored without them and the later bake will require re-modelling every insert — the retrofit AD-12 promises to avoid.
- **Add (AD-11):** "`l_<name>` is the insert lens *and* its cup mesh below the playfield surface; the playfield material carries a translucency/insert mask (`TEXCOORD_0`) from the first export, even while inserts are driven emissively."

### M-10 — The reference dimensions are "high confidence, do not go stale" and the spine pins only the ball
- **Source:** BA §1 ("Correct dimensions… cost nothing to honour and everything to get wrong. The one browser pinball attempt… criticised first for the ball being the wrong size relative to the playfield"); PA §2 ("playfield 20.25 × 42.00 in (514.4 × 1066.8 mm), pitch 6.5°, ball 26.99 mm — all high confidence"; flipper bat 3.125 in rubbered, pivot centres 7 in up, 6-13/16 to 7 in apart — medium).
- **Gap:** AD-10 fixes 26.99 mm via the VPU conversion; nothing pins the playfield to standard-body dimensions or checks the exported glb against them.
- **Add (AD-10 or AD-11):** "`sim/table/dragonwar.ts` carries `PLAYFIELD_MM = { w: 514.4, h: 1066.8 }`, `BALL_MM = 26.99`, `PITCH_DEG = 6.5` as the reference geometry; the loader asserts the `col_playfield` bounds and the flipper bat length against them (± tolerance) and fails fast."

### M-11 — Physical ball count is a device-model consequence nobody has written down
- **Source:** PA §3 ("one physical device of capacity two… If the device is physically full with another player's balls, it ejects one ball… Lock is disabled during any multiball (Quick multiball and the War)"); BA §8 ("Quick multiball — 2-ball"; "Lock 2, ball in play makes 3"); BA §2 ("4-ball reserved for the finale").
- **Gap:** Quick multiball (2 in play) can start while the Lock holds two balls (the current player's, or an opponent's), so the trough must hold at least four balls; the War needs three. `bd_trough` capacity is a registry field in AD-11 but its value and the rule deriving it are absent — a three-ball trough makes Quick MB silently a one-ball mode in hot seat.
- **Add (AD-6):** "Total balls = `bd_trough` capacity = Lock capacity (2) + max balls-in-play of any multiball that can run with the Lock full (Quick MB, 2) = 4 (5 if a 4-ball finale ships); the ball controller asserts this at boot."

### M-12 — A way to *force* the WebGL2 path, or the floor rots
- **Source:** PA §1 (FR-54 "fully playable, not degraded"); Deferred ("only after the WebGL2 path is complete and equal in feel"); PA §7 ("the feel test… must stay a repeatable ritual").
- **Gap:** AD-12 chooses the engine once at boot, WebGPU when available. Every developer on Chrome will only ever see WebGPU; "equal in feel" on WebGL2 is unverifiable without an override.
- **Add (AD-17 / host/boot):** "`?renderer=webgl2` (and the Settings panel) force the WebGL2 engine; the feel ritual (UJ-4) is run on both paths."

### M-13 — "One table, not an engine" has no structural guard
- **Source:** B Scope Out ("A table editor, a plugin system, or support for other tables. This is the single most important boundary in the brief and the thing most likely to erode. DragonWar is a game, not an engine"); BA §6, §9; PA §8 ("one machine, built properly").
- **Gap:** The spine's registry/loader/`TABLE` shape is exactly the seed of a generic table runtime. Nothing prevents a `loadTable(def)` API, a `Table` interface with two implementations, or runtime table selection — the erosion the brief names.
- **Add (convention row "Scope" or AD-1 Prevents):** "One table: `sim/table/dragonwar.ts` is imported directly everywhere; no table-loading interface, no `Table` abstraction wider than DragonWar's own registry, no runtime table selection, no plugin or registration API."

### M-14 — Licensing conditions the spine drops (AD-16 covers vpx-js only)
- **Source:** PA §6 rows: `vpinball/vpinball` ("Only files whose first line reads `// license:GPLv3+`"); `vbousquet/pinball-parts` ("CC BY-SA (one NC-SA node group) — Assets yes — Exclude the NC-SA node group"); `vbousquet/vpx_lightmapper` ("Not stated… Verify licence before any code use"); author recordings ("Never speech, music, callouts"); "Re-check compatibility if either the renderer or the physics reference is ever swapped." BA §5.
- **Gap:** AD-16 and the Licence-headers/Assets conventions name vpx-js only. Deferred names "a Bally template DXF/SVG" (provenance unstated) and "Blender scripts" for the bake (vpx_lightmapper is the obvious source and its licence is unknown).
- **Add (AD-16 rule):** "Code from `vpinball/vpinball` only from files whose first line is `// license:GPLv3+`, header retained; `vpx_lightmapper` is technique-only until its licence is verified; assets from `pinball-parts` exclude its NC-SA node group; author recordings are mechanical noise only. Licence compatibility is re-checked whenever the renderer or the physics source changes." Also add the template drawing's provenance requirement to the Deferred playfield entry.

### M-15 — "Do not invent" numbers need a home, or `tuning.ts` will invent them
- **Source:** PA §2 ("**Numbers that do not exist — do not invent them:** steel-on-clearcoat or steel-on-rubber restitution/friction; manufacturer coil pulse duration; a measured flipper tip gap; a dimensioned drain zone; any hours-per-table figure. Match 8% is unverified"); BA §3 (Match 8% unverified); PA §2 confidence notes per row.
- **Gap:** AD-15 makes `tuning.ts` the single source of every number, with no way to mark provenance or confidence; the tip gap (geometry) has no marker at all.
- **Add (convention row "Config" or AD-15):** "Every `tuning.ts` entry carries `source` and `confidence`; PA §2's do-not-invent list and Match % ship marked `unverified` and are changed only by measurement against the Reference machine; the flipper tip gap in Blender is annotated the same way."

### M-16 — The Deferred playfield-geometry entry drops the layout rules the research handed it
- **Source:** BA §8 ("orbit exits feed straight toward the flippers; ball guides end at rubber posts…; Lawlor's test for every shot — *a miss must come back playable, not drain*"; off-centre dragon "so it survives layout pressure"; spinner on one loop; six-drop bank); PA §3 (off-centre load-bearing); PA §8 ("Lawlor's miss test as a per-shot ethic").
- **Gap:** The spine's Deferred entry lists what to draw, not the acceptance rules; epic 2's builder reads the spine, not the brief addendum.
- **Add (Deferred, playfield entry):** "Acceptance: every shot passes Lawlor's miss test (a miss returns playable); orbit exits feed the flippers; guides end at rubber posts; the dragon is off-centre with a right-flipper straight shot and a left-flipper backhand; spinner on one loop only; six-target drop bank."

### M-17 — Jackpot seed scope: machine or player? (verify against the PRD)
- **Source:** BA §2 ("Progressive jackpots are seeded by prior play ('500k + 500k per multiball started')"); B ("1–4 player hot seat… fixes per-player state in the rules layer from day one").
- **Gap:** AD-7 puts "Jackpot seed" under `machine`. In hot seat that lets player 2 collect a jackpot seeded by player 1's Wars. If the PRD defines it per player, AD-7 misplaces it; if per machine, say so deliberately.
- **Add (AD-7):** either move "Jackpot seed / multiballs started" to `players[i]`, or add "Jackpot seed is machine-scoped by design (carries across players within one game)".

---

## 3. Minor

- **M-min-1 — Ported-header marker wording.** Convention says `// license:GPL-2.0-or-later (ported)`. PA §6: "Port under GPL-3.0; preserve its copyright notices." The file's effective licence in this program is GPL-3.0 via or-later. Suggest: original header retained + `// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0`.
- **M-min-2 — Device-failure vocabulary.** PA §4 lists `eject_failed`, `ball_missing`, `broken`; the Events convention lists the first two. Add `broken`.
- **M-min-3 — Tunables list omissions (AD-15).** PA §4 `tiltWarnings` (v1 default 1, Competition 2); BA §3 `matchPercent` (unverified); PA §2 `scatter` (default 0). Name them.
- **M-min-4 — AD-8 priorities.** Skill shot and Joust have no priority band (base 100, timed 300, Quick MB 400, War 500). Say whether Joust is a mode or a base-rule combo counter, and where the skill shot sits.
- **M-min-5 — Ball-save vocabulary.** BA §3 / PA §4: a timer-start event separate from enable ("does not count down until the ball is plunged"), hurry-up measured backwards from expiry, grace past expiry, per-mode timers override global. AD-3 has the ticks; the Events convention could name `ball_save_<name>_enabled` vs `_timer_start` so the distinction survives.
- **M-min-6 — Snapshot contract.** AD-13's roll voice is "driven per frame from snapshot speed and surface"; BA §7 Q4 adds *position* (pan). The spine never lists Snapshot fields — state that each ball carries `pos, vel, surface` in `Snapshot`.
- **M-min-7 — Audio unlock before the walk-up.** B ("the walk-up is the first thing anyone feels"); BA §8 (backglass "carries the job of establishing the war before a ball is plunged"). Browsers block Web Audio until a user gesture; host/boot needs a press-to-begin step before the walk-up plays sound, or the walk-up is silent.
- **M-min-8 — Deferred Web Worker.** Structural Seed says Pages serves "no headers": no COOP/COEP → no `SharedArrayBuffer`, so a Worker sim would be `postMessage` snapshots only. Note it in the Deferred entry.
- **M-min-9 — Third frame conversion.** AD-10 allows only `toPhysics()` and `toScene()`, but geometry arrives in glb space (m, +Y up) not the table frame; the loader's glb → table-frame read is a third conversion. Sanction it explicitly (`fromGlb()` in `frames.ts`) or define `toPhysics()` as taking glb space.
- **M-min-10 — Decision freshness.** Stack notes 2026-09-26 for renderer/WebGPU; PA §1 also sets ecosystem health (vpx-js dormancy, Babylon cadence) by 2027-02-26. Add the second date.
- **M-min-11 — Hop control mechanism.** BA §4 / PA §2: "one explicit control… deliberate, not emergent"; vpx-js has no such knob. Deferred should say the mechanism is undecided and must not be implemented as scatter or randomness (M-6).
- **M-min-12 — Single LOD.** BA §1: VPE uses one LOD because the scene is small, fixed, near-field. Add "no LOD chains" to the Assets convention so nobody builds them.
- **M-min-13 — Ball mass.** BA §1 / PA §2: ~80 g (medium confidence). vpx-js's ball mass is dimensionless; note that mass is not a physical tunable here so nobody "corrects" it to 80.
- **M-min-14 — Ball-search order.** PA §4: per-device priority callbacks. The AD-11 registry field list for ball devices/coils should include `ballSearchOrder`.
- **M-min-15 — Feel over fidelity as tie-break.** B ("Feel wins over fidelity wherever the two conflict"); PA §8. The spine carries no rationale, but a one-line tie-break in AD-15 ("when a tuning change trades feel for physical fidelity, feel wins; the Reference-machine ritual decides") keeps the tuning panel honest.
- **M-min-16 — Mouth eject as fire.** PA §8 ("the balls you locked are the balls that come back at you"); BA §8 (VUK lifts the locked balls and fires them out of the mouth). AD-6's "authored eject pose and velocity" should say the Lock's eject pose *is the Mouth*, aimed at the flippers, and that multiple ejects are issued by rules with a tick stagger (a VUK fires one ball at a time).
- **M-min-17 — Lock-full eject path.** PA §3: a full device ejects one ball when another player locks. That eject also goes out the Mouth (same coil) — a fiction and presentation consequence worth one word so the backglass/audio treat it as a "spit", not a War start.
- **M-min-18 — Blender template provenance.** Deferred names "a Bally template DXF/SVG" as the highest-value input; a manufacturer drawing has no established licence. Tie to `pinball-parts` (CC BY-SA, minus the NC-SA node) or require an `ATTRIBUTIONS.md` entry first (project `CLAUDE.md`).
- **M-min-19 — Backglass first in the walk-up.** BA §8: the DMD is the first thing seen and must establish the war in attract. `phase: attract` exists; state that attract-mode DMD frames and lamp `pattern`s are rules content driven from the snapshot, so the walk-up is not a presentation-only animation.

---

## 4. Confirmed covered

| Quiet requirement | Source | Spine |
|---|---|---|
| Rules see switch events only; no ball velocity; headlessly testable | BA §6, PA §1 | AD-1, AD-2, AD-15 |
| Audio behind a swappable named-asset interface from day one; generated now, recordings later | BA §8, PA §1 | AD-13 |
| Flashers are coil-class with duty-cycle limits, not in the insert layer | BA §3, PA §1, PA §5 | AD-9 (`FlasherCommand`, duty-cycle in driver), `f_` prefix |
| Standard UVs (not camera-projected); decide before modelling; bake inserts white, tint at runtime; four channels | BA §1, BA §7 Q3, PA §1 | AD-11 (`TEXCOORD_1`, `lightgroup`), AD-12 |
| Nudge as damped-harmonic cabinet oscillator, never force on the ball; tilt bob as a pendulum; debounce + settle | BA §3, PA §2 | AD-3, AD-5 |
| Slam tilt is a different sensor, ends all games | BA §3 | AD-5 (`s_slam_tilt`, own threshold) |
| Compound playfield body; walls and floor with thickness; switches as analytic zones; non-collidable visuals over hand-built scaffolding | BA §4, PA §2 | AD-11 |
| 200 ms catch-up bailout that discards simulated time | PA §2 | AD-4 |
| Dragon is two devices; `multiball_lock` not `ball_hold`; per-player credits over one physical device of capacity two; lock disabled during any multiball; rules decide lock/mode-start/strike | BA §8, PA §3 | AD-6, AD-7 |
| Lock lane doubling as mode-start scoop is an assumption to validate | PA §3 | Deferred (OQ-5) |
| Layered adjustments store (defaults → preset → overrides), v1 minimal settings | PA §4 | AD-14 |
| Settings apply to the next game; sim never reads storage | B, PA §4 | AD-14 |
| vpx-js is GPL-2.0-or-later per headers (not `package.json`); or-later exercised; notices preserved; `ATTRIBUTIONS.md` first | BA §5, PA §6 | AD-16, conventions |
| Spikes 1 and 3 gate the browser-first premise; renderer/WebGPU re-check 2026-09-26; spike 2 is the bake envelope | PA §1 | Deferred, Stack |
| Tilt / ball-save / grace / ball-search / mode timers as ticks; Match from seeded RNG; Match multiple of ten is rules content | BA §3, PA §4 | AD-3 |
| 1–4 player hot seat; per-player facts under `players[i]` from day one | B, BA §6 | AD-7 |
| DMD-style backglass rendered from state + events; rules never format text | BA §8 | AD-9, seed `presentation/backglass` |
| Hop as one explicit tunable; pitch exposed with bounds; falloff/friction/elasticity/ramp-up as tunables | BA §4, PA §2 | AD-15 |
| Dimensionless VPX values port directly; physics keeps VPU internally so strength values port as VPX-internal numbers | BA §4, PA §2 | AD-10 |
| Campaign gating rejected — modes independent, stacked by priority | PA §5 | AD-8 (no gating) |
| Chromium + Safari; unsupported message names Chrome, Edge, Safari; gate is WebGL2 not user-agent | PA §5 | AD-17 |
| Single fixed camera for v1; standard UVs keep presets possible | PA §5 | AD-12, Deferred |
| Tauri later from the same static `dist/`; no origin assumptions | B, BA §6 | AD-17, Deferred |
| Wizard mode / 4-ball finale deferred, not rejected | BA §9 | Deferred |
| Port, do not derive; vpx-js pinned to a frozen HEAD | PA §1, §7 | Stack (master @ 2020-11-12) |
| Playfield geometry iterates with rules, not after them | BA §7 Q5 | Deferred (epic 2, Blender-owned under AD-11) |
| Feel test against the Reference machine as a repeatable ritual: replays + tuning export | PA §7, B criterion 4 | AD-15 |
| Reference machine unnamed; affects tuning targets only | BA §7 Q1 | Deferred |
