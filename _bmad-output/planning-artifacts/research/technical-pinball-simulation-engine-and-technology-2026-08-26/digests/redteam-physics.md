# Red team: custom physics core vs general-purpose engine

## Verdict

**SURVIVES ON SUBSTANCE — WEAKENED ON SPECIFICS.** I went hunting for the graveyard of
developers who wrote their own physics and regretted it, and I found it — the generic
"don't write your own physics engine" evidence is overwhelming and I document it below.
But it does not land on *this* conclusion, because pinball turns out to be the one genre
where the evidence runs the other way. Every serious pinball simulator I could verify
uses a purpose-built physics core, including the ones that adopted a general-purpose
*engine* for everything else: Visual Pinball X ships its own analytic hit-primitive
solver at exactly 1000 Hz fixed timestep; Visual Pinball Engine deliberately ported that
solver into Unity rather than use PhysX; and the one browser 3D pinball I found whose
author explicitly discusses the choice hand-wrote physics to get flipper feel right. The
general-purpose-engine pinball attempts I found are real and playable, but every one of
them is a thread about fighting tunneling, teleporting flippers, and substep counts.

Two specific clauses of the conclusion **are** refuted, and they matter:

1. **"written from scratch" is refuted as the only option.** `vpx-js` is an existing,
   actively-maintained (pushed 2026-08-26, *today*) TypeScript port of VPX's purpose-built
   pinball core, running in the browser, with `PHYSICS_STEPTIME = 1000` microseconds
   literally in its source. The conclusion argues for the right *architecture* and then
   jumps to the wrong *sourcing decision*. The real fork is adopt-vs-write, and the
   conclusion never considers adopt. (Caveat: GPL-2.0 — a genuine constraint, not a
   dismissal.)
2. **"simple primitives (circles, line segments, planes)" understates the job.** VPX's
   actual shipped primitive set includes triangles, 3D polygons, and 3D line segments,
   *plus two broadphase acceleration structures* (a quadtree and a k-d tree). The
   conclusion's implied simplicity budget is measurably smaller than what the reference
   implementation needed.

The 1000 Hz figure is also softer than stated — it is VPX's number, but the browser
pinball I verified sweeps at 480 Hz and claims nothing tunnels.

---

## Strongest arguments the conclusion is WRONG

### 1. "From scratch" is the weakest word in the sentence — a proven purpose-built pinball core already exists in TypeScript, in the browser

This is my single strongest hit. `vpx-js` is described as "Visual Pinball in the Browser,"
is a TypeScript port that "uses the same physics code than Visual Pinball" so that "the
gameplay is identical in the browser than when running VPX." It is not a dead experiment:
created 2019-05-03, **last pushed 2026-08-26** (the access date of this research), not
archived, not disabled, 993 commits, 58 open issues, GPL-2.0.

Its `lib/physics/` directory contains exactly the architecture the conclusion describes,
already written and already debugged against decades of real tables:

```
hit-circle.ts   hit-line-3d.ts  hit-line-z.ts   hit-plane.ts
hit-point.ts    hit-triangle.ts hit-3dpoly.ts   hit-object.ts
hit-quadtree.ts hit-kd.ts       hit-kd-node.ts
line-seg.ts     line-seg-slingshot.ts
collision-event.ts collision-type.ts mover-object.ts constants.ts functions.ts
```

And `lib/physics/constants.ts` contains, verbatim, `PHYSICS_STEPTIME = 1000` (microseconds)
and `PHYSICS_STEPTIME_S = 0.000001`, alongside `DEFAULT_STEPTIME = 10000` / `PHYS_FACTOR = 0.1`,
plus the tuning constants a bespoke core takes years to discover: `PHYS_SKIN = 25.0`
(contact layer), `PHYS_TOUCH = 0.05` (clearance detection), `C_PRECISION = 0.01`,
`C_LOWNORMVEL = 0.0001`, `C_CONTACTVEL = 0.099`, `C_DISP_GAIN = 0.9875`,
`C_DISP_LIMIT = 5.0`, `VELOCITY_EPSILON = 0.05`, `STATICTIME = 0.005`.

**Why this refutes rather than confirms:** the conclusion is right about the shape of the
solution and then recommends re-deriving it. Those magic constants are precisely the
long-tail knowledge a solo developer cannot shortcut. A recommendation to write this from
scratch, in a document that does not mention that it already exists in the target language
on the target platform, is under-informed.

- source: https://github.com/vpdb/vpx-js | publisher: vpdb (GitHub) | pub_date: 2019-05 (created), 2026-08 (last push) | accessed: 2026-08-26 | confidence: high
- source: https://api.github.com/repos/vpdb/vpx-js | publisher: GitHub API | pub_date: 2026-08-26 (pushed_at) | accessed: 2026-08-26 | confidence: high
- source: https://raw.githubusercontent.com/vpdb/vpx-js/master/lib/physics/constants.ts | publisher: vpdb (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: high

### 2. The "simple primitives" premise is contradicted by the reference implementation's own file list

The conclusion scopes collision to "circles, line segments, planes." The canonical
purpose-built pinball core needed more than that, and the file listing above is direct
evidence: `hit-triangle`, `hit-3dpoly`, and `hit-line-3d` are triangle-mesh and 3D-polygon
collision, not 2.5D primitives. Independent description of VPX's object model confirms
`HitTriangle` for flat surfaces, `HitLine3D` for edges and wires, `HitPoint` for vertices,
and `Hit3DPoly` for complex 3D shapes, with collidable 3D mesh "primitives" converted into
those hit objects at table load.

Critically, VPX **also needed broadphase acceleration** — `hit-quadtree.ts` and
`hit-kd.ts`/`hit-kd-node.ts`. The red-team brief asked whether a custom core forgoes
broadphase; the answer from the reference implementation is that it does not forgo it, it
*reimplements* it. That is work the conclusion's scope does not budget for.

- source: https://api.github.com/repos/vpdb/vpx-js/contents/lib/physics | publisher: GitHub API | pub_date: unknown | accessed: 2026-08-26 | confidence: high
- source: https://deepwiki.com/vpinball/vpinball/3.3-physical-objects | publisher: DeepWiki (auto-generated from vpinball/vpinball) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium (derived documentation, not source; corroborated by the file listing above)

### 3. The generic "write your own physics" failure evidence is real and severe

The strongest transferable number I verified: **shakiba, author of Planck.js, reported
"So far I have spent more than 400 hours for developing this project and it consists of
around 20k lines of code"** — and Planck.js is a *port* of Box2D's already-solved
algorithms into JavaScript, not original design work. Porting a known-good 2D engine cost
400+ hours. Deriving an original one is strictly more.

Erin Catto's GDC 2005 material on iterative dynamics documents that box stacking — the
standard physics-engine smoke test — simultaneously requires contact caching, friction,
and stable constraint resolution, and Box2D's own manual documents *permanent* limitations
(instability past ~10:1 mass ratios, joint stretching under load, ~0.5 cm of collision
slop, and continuous collision that "does not handle joints"). If a dedicated physics
engineer's decade-matured engine ships with those caveats documented, a solo pinball
developer's from-scratch core will have worse ones, undocumented.

- source: https://news.ycombinator.com/item?id=14050974 | publisher: Hacker News (comment by shakiba, Planck.js author) | pub_date: 2017-04 | accessed: 2026-08-26 | confidence: high
- source: https://box2d.org/files/ErinCatto_IterativeDynamics_GDC2005.pdf | publisher: Erin Catto / GDC | pub_date: 2005 | accessed: 2026-08-26 | confidence: high
- source: https://github.com/erincatto/box2d/blob/main/docs/FAQ.md | publisher: Erin Catto (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium

### 4. The long-tail correctness bear case is demonstrated *inside pinball specifically*

The brief asked for evidence that bespoke cores accumulate defects only findable after
months. Visual Pinball is the strongest possible test: a purpose-built pinball core with
20+ years of development and a large active community. Its issue tracker still carries
open and recently-closed physics defects across exactly the predicted failure classes:

| Issue | State | Created |
|---|---|---|
| Unrealistic Nudge Physics | **Open** | 2026-03-18 |
| Broken ball physics in WINE 10.14 | **Open** | 2025-09-07 |
| 10.8.1 Physics trouble (in some tables) | Closed | 2025-03-02 |
| Default PBWEnabled value breaks table physics | Closed | 2025-02-25 |
| Standalone 10.8.1 – Ball have very weird physics | Closed | 2024-04-10 |
| Physics "Hit Event" detection does not work consistently | Closed | 2023-12-13 |
| Analog plunger can apply physics-breaking force | Closed | 2023-11-21 |
| Physics Issues, Ball Stuck in Shooter Lane | Closed | 2023-11-18 |
| Ball physics collision problems with plungers | Closed | 2023-10-29 |

Defect classes present: ball stuck/trapped, hit detection non-determinism ("hit detection
is very inconsistent"), energy gain (plunger driving the ball to "supersonic speeds"),
gravity anomalies (ball floating), and modelling error (nudge implemented as direct ball
force rather than table movement). Note the last one — that is not a coding bug, it is a
*physical model* bug that survived 20 years and is still open in 2026.

**This is the honest cost of the recommendation.** Not "it won't work" — VPX plainly
works — but "the asymptote of a from-scratch pinball core still has open physics bugs
after two decades and many contributors."

- source: https://api.github.com/search/issues?q=repo:vpinball/vpinball+physics+in:title+is:issue | publisher: GitHub API / vpinball project | pub_date: 2023–2026 (issue range) | accessed: 2026-08-26 | confidence: high

### 5. Browser pinball on general-purpose engines demonstrably exists and runs

Counter-examples do exist and should not be waved away:

- `pinball-xr` — three.js + **cannon-es** WebXR pinball web app, with flippers and drain.
- A React Three Fiber pinball table wired to **Rapier**, with all parts (flippers, pins,
  slingshots, launch rail, ramps) and cabinet-tilted gravity.
- A three.js + **Ammo.js** (via enable3d) pinball demo that explicitly advertises
  "CCD Motion Clamping" to solve tunneling, and runs on smartphones.
- Sean Bradley's R3F + cannon-es pinball tutorial with compound flipper bodies.

So "a general engine cannot do browser pinball" is false, and if the conclusion rests on
that, it is overstated. What these do *not* establish is enthusiast-grade flipper feel —
none of them is cited by the pinball simulation community as a physics benchmark.

- source: https://github.com/patrick-s-young/pinball-xr | publisher: GitHub | pub_date: unknown | accessed: 2026-08-26 | confidence: medium
- source: https://discourse.threejs.org/t/physics-ccd-motion-clamping-pinball-with-enable3d-three-ammo-now-a-progressive-web-app/35149 | publisher: three.js Discourse | pub_date: unknown | accessed: 2026-08-26 | confidence: medium
- source: https://sbcode.net/react-three-fiber/pinball/ | publisher: Sean Bradley | pub_date: unknown | accessed: 2026-08-26 | confidence: medium

### 6. The 1000 Hz number is not load-bearing, and WASM's speed advantage is real at scale

Two separate softenings:

**(a) 1000 Hz is one point, not the answer.** "Neon Gutter," a single-file three.js 3D
pinball with hand-written physics (posted 2026-07-27), sweeps collisions at a **fixed
480 Hz** and reports "nothing tunnels regardless of frame rate." That is less than half
the conclusion's rate, achieving the stated goal. VPX's 1000 Hz is a real number from real
code, but presenting ~1000 Hz as *the* requirement is not supported — the requirement is
"swept/analytic collision at a rate high enough that nothing tunnels," and 480 Hz cleared it.

**(b) WASM genuinely wins at scale.** Dimforge report their SIMD-enabled Rapier npm
packages are "between 2× and 5× faster" than their 2024 releases in web environments, and
publish `world.step()` at roughly 1.15 ms for 3000 3D bodies on an M1 Max under Node.
Independent-ish 2D benchmarking (Box2D JS build vs `Box2D_v2.3.1_min.wasm.js`) shows the
WASM build outperforming its JS counterpart in the same scenario. If the project ever
scales past a handful of bodies, hand-written JS is on the wrong side of that curve.

- source: https://discourse.threejs.org/t/neon-gutter-single-file-3d-pinball-with-hand-written-physics/93181 | publisher: three.js Discourse | pub_date: 2026-07-27 | accessed: 2026-08-26 | confidence: high
- source: https://dimforge.com/blog/2026/01/09/the-year-2025-in-dimforge/ | publisher: Dimforge (Rapier authors) | pub_date: 2026-01-09 | accessed: 2026-08-26 | confidence: high (vendor self-report — treat the multiplier as a vendor claim)
- source: http://olegkikin.com/js-physics-engines-benchmark/ | publisher: Oleg Kikin | pub_date: unknown | accessed: 2026-08-26 | confidence: low (undated independent benchmark; direction credible, magnitudes not verified)

---

## Where the conclusion holds up despite the attack

**Every verifiable serious pinball simulator uses a purpose-built physics core — including
the ones built on general-purpose engines.** This is the finding that saved the conclusion,
and I did not expect it.

- **Visual Pinball X** implements its own physics rather than embedding a general engine.
  VP10 raised the physics rate "from 100 Hz to 1000 Hz" and made physics "always use a
  fixed timestep" — the exact two design choices the conclusion names. It simulates ball
  spin, sliding-to-rolling friction transition, and models flippers as "true dynamic rigid
  bodies" subject to solenoid, return-spring, and ball forces that "properly bounce off
  their stoppers."
- **Visual Pinball Engine (VPE)** is the decisive natural experiment: a developer building
  a high-fidelity pinball sim *inside Unity*, with PhysX sitting right there, chose instead
  to port VPX's physics to C# and run it through Burst/Jobs. That is someone who had the
  general engine for free and declined it — after five-plus years of active development.
- **Pinball FX on Unreal**: the community claim that Zen carried FX3's physics into UE
  rather than adopting PhysX/Chaos is *unverified* (see failed attacks), so I am not
  counting it as support.

**General-purpose engines applied to pinball produce a consistent, cross-engine catalogue
of pain**, which is the substantive case for the conclusion:

- *Godot/Jolt*: kinematic flippers moved by `Tween` teleport, so the solver sees no
  velocity and **CCD does not work**; Jolt does not allow substepping a single body from
  script, forcing global changes.
- *Unreal*: CCD fixes ball-vs-static-geometry but not flippers rotated by direct transform
  writes — same teleporting-flipper failure, different engine.
- *Godot 3D*: a working 4.4 table required raising "max physics steps per frame" to **64**
  and hand-tuning the gravity vector and ball mass.
- *Godot defaults*: "performed quite effectively," but "the ball sometimes penetrates the
  flippers"; community advice is that default physics "isn't up to this task."
- *Ammo/Physi.js*: an HTML5 three.js pinball author found "collision detection was poor"
  and switched away from it.

The recurring workaround list — raise substeps, enable CCD, thicken flipper colliders
beyond their visual size, raycast-sweep the ball's path and manually correct — is a
developer reimplementing swept analytic collision *on top of* the general engine. That is
the conclusion's argument, arrived at empirically by people who tried the other way.

The **browser performance objection also fails** against the conclusion's actual scene.
A pinball table is 1–6 dynamic bodies. WASM's advantage is documented at hundreds to
thousands of bodies; at single-digit body counts the JS↔WASM boundary-crossing overhead is
comparable to the math saved, and a 1000 Hz *internal substep* schedule (≈16 substeps per
rAF frame, not a wall-clock 1 ms timer) is well within a modern browser's budget for an
allocation-free loop. `vpx-js` is the existence proof that VPX's 1000 Hz core runs in
browser TypeScript at all.

- source: https://github.com/c-f-h/vpinball/wiki/VP10-Physics | publisher: Visual Pinball project wiki | pub_date: unknown | accessed: 2026-08-26 | confidence: high
- source: https://github.com/freezy/VisualPinball.Engine | publisher: freezy (GitHub) | pub_date: unknown (active through 2025) | accessed: 2026-08-26 | confidence: high
- source: https://docs.visualpinball.org/creators-guide/introduction/overview.html | publisher: Visual Pinball Engine docs | pub_date: 2025 | accessed: 2026-08-26 | confidence: medium
- source: https://www.reddit.com/r/godot/comments/1urhdq7/avoiding_tunneling_with_pinball_paddles/ | publisher: Reddit r/godot | pub_date: unknown | accessed: 2026-08-26 | confidence: medium
- source: https://forums.unrealengine.com/t/pinball-collisions-problems-advice/5512 | publisher: Epic Games / Unreal Engine forums | pub_date: unknown | accessed: 2026-08-26 | confidence: medium
- source: https://forum.godotengine.org/t/godot-4-4-pinball-table-build/107655 | publisher: Godot Engine forum | pub_date: unknown | accessed: 2026-08-26 | confidence: medium
- source: https://www.reddit.com/r/gamedev/comments/g1m8ue/should_i_write_my_physics_engine_or_use_a_made/ | publisher: Reddit r/gamedev | pub_date: 2020-04 | accessed: 2026-08-26 | confidence: low (anonymous forum opinion; included as sentiment, not fact)

---

## What I searched for and could NOT find (failed attacks)

**Absence of evidence is itself a finding. These are the attacks that did not land:**

1. **No commercial pinball sim on a stock general-purpose engine.** I looked specifically
   for a named, well-regarded pinball simulator whose developers state they use an
   unmodified general-purpose rigid-body engine for ball physics. I found none. This was
   my intended kill shot and it missed.

2. **The Zen Studios / Pinball FX claim is NOT verified — in either direction.** The widely
   repeated assertion that Zen carried FX3's custom physics into Unreal rather than
   adopting PhysX/Chaos traces to a **player** ("Mal") on a Steam forum saying "FX is FX3
   using the Unreal Engine as a wrapper," citing unlinked "old posts... and/or interviews."
   The only quasi-official statement in that thread is a Zen rep (Ghz) via Discord: "The
   pinball tables are also designed to run at 60fps... Running the game at higher frame
   rates may cause issues due to the animation and physics systems we use." That is
   consistent with a frame-locked custom system but does **not** state which physics engine
   is used. **Do not cite Zen as evidence for the conclusion.** I could not locate a
   primary Zen engineering statement.

3. **Pro Pinball Ultra / Timeshock engine choice: unverified.** Aggregator output asserted
   a custom core but explicitly hedged ("it is highly unlikely that..."), which is inference,
   not retrieval. I found no primary source. Treat as unknown.

4. **No developer regretting a custom *pinball* core.** The generic "I wrote my own physics
   and regretted it" genre is abundant, but I found zero accounts of someone abandoning a
   bespoke pinball physics core to adopt a general engine. Every migration I found runs the
   other direction (VPE → ported VPX physics into Unity).

5. **No head-to-head benchmark of hand-written JS physics vs WASM engines at small body
   counts.** All published comparisons target hundreds-to-thousands of bodies. The
   pinball-relevant regime (1–6 bodies, 1000 Hz) is unmeasured in anything I could
   retrieve. Claims that "for <100 bodies the difference is negligible" appeared only in
   sources I judged to be SEO content farms (`abratabia.com`, `mysimulator.uk`) and I have
   **deliberately excluded them** rather than launder them into findings. The small-scene
   performance question is therefore **open**, and the conclusion's implicit performance
   claim rests on argument, not measurement. *This is a genuine gap the conclusion should
   acknowledge — it is cheap to close with a spike.*

6. **Chipmunk author's pinball guidance: could not verify.** `chipmunk-physics.net` served a
   self-signed certificate and the fetch failed. Secondhand reporting attributes to Chipmunk's
   author advice that pinball needs timesteps down to 1/180 s and warnings that Chipmunk and
   Box2D deliberately permit overlap causing "bumps and pops" across seams. **Unverified — do
   not cite.**

7. **No evidence on airballs / ball-leaving-plane sufficiency.** I could not find primary
   evidence establishing whether analytic primitives are adequate for modern multi-level
   geometry. What I did establish is narrower but useful: VPX handles complex 3D geometry by
   having table authors build *simplified invisible collision scaffolding* (walls, lines,
   under-ramp floors) while the detailed visual mesh is flagged non-collidable. That is an
   authoring-cost finding, not a physics-capability finding, and it means "the geometry is
   simple" is partly achieved by *hand-authoring* simplicity rather than by the geometry
   being inherently simple.

---

## Recommended revision to the conclusion

Not a rejection — a re-scoping:

- **Keep**: purpose-built pinball physics core; fixed timestep; swept/analytic time-of-impact.
  This is what every verifiable serious pinball sim does, including inside Unity.
- **Change "written from scratch" → "adopt or port an existing purpose-built pinball core
  (`vpx-js`) unless GPL-2.0 is disqualifying."** Evaluate the licence explicitly; if GPL-2.0
  is a blocker, say so as the *reason* for writing fresh.
- **Soften "~1000 Hz" → "a fixed sweep rate high enough that nothing tunnels; 480–1000 Hz is
  the observed range."**
- **Expand the primitive set** beyond circles/segments/planes to include triangles, 3D polys,
  and 3D line segments, and **budget explicitly for a broadphase** (quadtree or k-d tree).
  The reference implementation needed all of these.
- **Add a measurement task**: benchmark a 1000 Hz JS loop over 6 bodies against the same
  scene in Rapier/Jolt WASM. Nobody has published this; it is the one factual gap under the
  decision and it is cheap to close.
