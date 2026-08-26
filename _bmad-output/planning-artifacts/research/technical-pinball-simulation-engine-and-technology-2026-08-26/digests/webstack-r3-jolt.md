# Digest: Jolt tracker, tick-rate guidance, and Rapier core resolution (round 3)

## Findings

### Q1 — Jolt issue tracker: tunneling and fast spheres

**There are no open Jolt issues about CCD/LinearCast failing for small fast spheres.** A GitHub search API sweep of `repo:jrouwe/JoltPhysics` for `tunneling`, `LinearCast`, and `ccd sphere` returned 20 LinearCast-matching issues, of which exactly one is open (#1142, a sensor-contact limitation, not a tunneling bug). Every tunneling report is closed, and most were closed within one to three days of filing.
- source: https://api.github.com/search/issues?q=repo:jrouwe/JoltPhysics+LinearCast | publisher: GitHub REST API (jrouwe/JoltPhysics) | pub_date: 2026-08 (query date) | accessed: 2026-08-26 | confidence: high | class: ecosystem-health

**The one open LinearCast issue (#1142, opened 2024-06-13, still open as of the last comment 2025-06-23) is a scoped sensor limitation, not a solid-body tunneling bug.** jrouwe states plainly: "there is no support for rigid bodies with motion type LinearCast vs sensors (they will be treated as Discrete vs sensors)." He gives the mechanism: "since we only store the closest contact point during the LinearCast sweep, this also means that the body could penetrate the object behind the sensor." Workaround is `ContactListener::OnContactAdded` with `ContactSettings::mIsSensor`. **Directly relevant to pinball**: rollover switches, drain sensors and scoring triggers modelled as Jolt sensors will be missed by a fast CCD ball. This is the single most decision-relevant open defect found.
- source: https://api.github.com/repos/jrouwe/JoltPhysics/issues/1142/comments | publisher: GitHub (jrouwe comments) | pub_date: 2024-06 to 2025-06 | accessed: 2026-08-26 | confidence: high | class: limitation

**A follow-up request to add CCD/LinearCast support for sensors (#2035, filed 2026-05-27) was closed 2026-05-31 after four comments** — i.e. the gap was raised again recently and closed without shipping general sensor CCD, confirming #1142's limitation is current in the 5.6.0 era, not stale.
- source: https://api.github.com/search/issues?q=repo:jrouwe/JoltPhysics+LinearCast | publisher: GitHub REST API | pub_date: 2026-05 | accessed: 2026-08-26 | confidence: medium | class: limitation

**The classic "LinearCast bodies eventually tunnel through world geometry" report (#150, 2022-05-09) was closed in four days as caller error, not an engine defect.** jrouwe's diagnosis: "If you were only calling SetInverseMass and not SetInverseInertia then things go out of sync indeed." Fix is to use `SetMassProperties`; he closed with "Documentation updated" (2022-05-13). No engine code changed. Any citation of this issue as evidence that Jolt CCD leaks would be a false claim.
- source: https://api.github.com/repos/jrouwe/JoltPhysics/issues/150/comments | publisher: GitHub (jrouwe) | pub_date: 2022-05 | accessed: 2026-08-26 | confidence: high | class: version-compat

**The other "falls through floor with LinearCast" report (#1936, 2026-03-09, closed 2026-03-30) was likewise resolved as a mass-ratio problem** — a constrained body with a bad mass ratio tunnelled; not a CCD algorithm failure.
- source: https://api.github.com/search/issues?q=repo:jrouwe/JoltPhysics+LinearCast | publisher: GitHub REST API | pub_date: 2026-03 | accessed: 2026-08-26 | confidence: medium | class: version-compat

**One genuine historical CCD defect existed and is fixed: #340 (2022-11-28), switching motion quality from Discrete to LinearCast at update rates below 30 Hz caused an out-of-bounds write (heap corruption) to the CCD bodies array.** Closed same day. Only relevant as a caution that very low tick rates are the stressed path — the opposite of this project's regime.
- source: https://api.github.com/search/issues?q=repo:jrouwe/JoltPhysics+tunneling | publisher: GitHub REST API | pub_date: 2022-11 | accessed: 2026-08-26 | confidence: medium | class: version-compat

**Compared with Rapier's #509 (closed by the reporter himself with no maintainer diagnosis), Jolt's tunneling threads all terminate in a specific maintainer diagnosis naming the responsible setting or API misuse.** Across #150, #1155, #1686, #717 and #1142, jrouwe replies within one to three days with a mechanism and a named parameter. This is a qualitative but well-evidenced maintainer-responsiveness difference.
- source: https://api.github.com/repos/jrouwe/JoltPhysics/issues/717/comments | publisher: GitHub (jrouwe) | pub_date: 2023-09 to 2024-01 | accessed: 2026-08-26 | confidence: high | class: ecosystem-health

### Q2 — Jolt's own guidance on tick rate and collision steps

**Jolt documents stability at 60 Hz with one collision step, and describes collision steps as subdividing the step (60 Hz with 2 collision steps = alternating collision/integration at 1/120 s).** That is the only rate stated in the Architecture document.
- source: https://raw.githubusercontent.com/jrouwe/JoltPhysics/master/Docs/Architecture.md | publisher: jrouwe / JoltPhysics docs | pub_date: unknown (master, accessed 2026-08) | accessed: 2026-08-26 | confidence: high | class: capability

**Neither Architecture.md nor the `PhysicsSystem::Update()` header comment states a maximum recommended delta time per collision step.** The Update() doc comment is purely mechanical: "The world steps for a total of inDeltaTime seconds. This is divided in inCollisionSteps iterations. Each iteration consists of collision detection followed by an integration step." No upper bound, no recommended frequency, no warning about high rates. **Absence of evidence is the finding**: Jolt gives no documented ceiling and no documented guidance for running above 60 Hz.
- source: https://raw.githubusercontent.com/jrouwe/JoltPhysics/master/Jolt/Physics/PhysicsSystem.h | publisher: jrouwe / JoltPhysics source | pub_date: unknown (master) | accessed: 2026-08-26 | confidence: high | class: limitation

**The critical high-tick-rate interaction is in PhysicsSettings, not the docs: `mLinearCastThreshold = 0.75f`, commented "Fraction of its inner radius a body must move per step to enable casting for the LinearCast motion quality."** A body only gets swept when it moves more than 0.75x its inner radius in one step. At high tick rates the per-step displacement shrinks, so a LinearCast ball silently stops being cast and runs as Discrete. That is correct and cheap when the step is genuinely safe, but it means "I set LinearCast" does not imply "sweeping happens" — the behaviour is rate-dependent and this threshold is the tuning knob to lower if sweeping is wanted at high rates.
- source: https://raw.githubusercontent.com/jrouwe/JoltPhysics/master/Jolt/Physics/PhysicsSettings.h | publisher: jrouwe / JoltPhysics source | pub_date: unknown (master) | accessed: 2026-08-26 | confidence: high | class: capability

**Companion setting `mLinearCastMaxPenetration = 0.25f`, "Fraction of its inner radius a body may penetrate another body for the LinearCast motion quality."** This is the numeric form of the docs' "a body is always allowed to move a fraction of its inner radius" caveat established in round 2 — the allowance is quantified as a quarter of the inner radius. For a small ball this is a small absolute number, which is the favourable direction.
- source: https://raw.githubusercontent.com/jrouwe/JoltPhysics/master/Jolt/Physics/PhysicsSettings.h | publisher: jrouwe / JoltPhysics source | pub_date: unknown (master) | accessed: 2026-08-26 | confidence: high | class: capability

**Other solver defaults retrieved this run**: `mNumVelocitySteps = 10`, `mNumPositionSteps = 2`, `mBaumgarte = 0.2f` ("how much of the position error to 'fix' in 1 update"), `mSpeculativeContactDistance = 0.02f` (with the explicit warning "if this is too big you will get ghost collisions"), `mPenetrationSlop = 0.02f` ("How much bodies are allowed to sink into each other (unit: meters)"), `mMaxInFlightBodyPairs = 16384`.
- source: https://raw.githubusercontent.com/jrouwe/JoltPhysics/master/Jolt/Physics/PhysicsSettings.h | publisher: jrouwe / JoltPhysics source | pub_date: unknown (master) | accessed: 2026-08-26 | confidence: high | class: capability

### Q3 — Which Rapier core does npm 0.20.0 wrap? RESOLVED

**The rapier.js `master` Cargo.lock resolves `rapier3d` and `rapier2d` to version 0.30.1 from crates.io, with `parry3d` 0.25.3 and `nalgebra` 0.34.1 — no git overrides.** This is the definitive build artifact and it lands one patch above the previously documented floor (core 0.30.0 via binding 0.19.1).
- source: https://raw.githubusercontent.com/dimforge/rapier.js/master/Cargo.lock | publisher: dimforge / rapier.js repo | pub_date: unknown (master HEAD) | accessed: 2026-08-26 | confidence: high | class: version-compat

**Caveat that keeps this at medium for the specific npm 0.20.0 claim**: the lockfile read is `master` HEAD, and because npm 0.20.0 carries no git tag and no GitHub release (established round 2), there is no tagged commit to pin the lockfile to. The honest statement is: **npm @dimforge/rapier3d 0.20.0 almost certainly wraps rapier3d core 0.30.1**, since master is the branch 0.20.0 was published from and no newer core exists in the lock — but the binding project's own lack of tagging makes byte-exact attribution impossible from public artifacts. The version-provenance weakness found in round 2 is confirmed rather than dispelled.
- source: https://raw.githubusercontent.com/dimforge/rapier.js/master/Cargo.lock | publisher: dimforge / rapier.js repo | pub_date: unknown (master HEAD) | accessed: 2026-08-26 | confidence: medium | class: version-compat

### Q4 — JoltPhysics.js WASM-specific limitations

**JoltPhysics.js ships seven build flavors**: `wasm-compat` (WASM base64-embedded in the bundle), `wasm` (separate .wasm file), `asm` (asm.js fallback), multithreaded variants of the two WASM builds, and debug variants that "output errors to the console and enable the debug renderer."
- source: https://raw.githubusercontent.com/jrouwe/JoltPhysics.js/main/README.md | publisher: jrouwe / JoltPhysics.js | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: capability

**SIMD is a build flag (`-DENABLE_SIMD=ON`), included by default in the multithreaded builds, and the README notes "Safari 16.4 was the last major browser to support this (in March 2023)"** — i.e. WASM SIMD is universally available across current Windows and macOS browsers, so the macOS/Safari target does not cost SIMD. Getting SIMD by default, however, is coupled to taking the multithreaded build, which brings SharedArrayBuffer and therefore COOP/COEP cross-origin-isolation headers on the hosting side.
- source: https://raw.githubusercontent.com/jrouwe/JoltPhysics.js/main/README.md | publisher: jrouwe / JoltPhysics.js | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: capability

**Double precision is available in the browser build via `-DDOUBLE_PRECISION=ON` for "worlds larger than a couple of km"** — irrelevant to a playfield-scale pinball table, and worth avoiding for the performance cost.
- source: https://raw.githubusercontent.com/jrouwe/JoltPhysics.js/main/README.md | publisher: jrouwe / JoltPhysics.js | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: capability

**A `-DCROSS_PLATFORM_DETERMINISTIC=ON` build flag exists to make results match the native library.** Relevant if a table's physics must replay identically across machines (replays, leaderboards, ghost balls).
- source: https://raw.githubusercontent.com/jrouwe/JoltPhysics.js/main/README.md | publisher: jrouwe / JoltPhysics.js | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: capability

**The dominant practical WASM burden is manual memory management: "nothing is cleaned up automatically" in the Emscripten port, requiring explicit `Jolt.destroy()` calls.** This is the most-discussed open issue on the JS repo — #115, "Elimination of manual memory management via FinalizationRegistry/WeakRef", still OPEN with 12 comments, and the thread explicitly contrasts JS idiomaticity against Rapier. **For a solo dev this is the single largest ergonomics tax of choosing Jolt over Rapier in the browser.**
- source: https://api.github.com/search/issues?q=repo:jrouwe/JoltPhysics.js+tunneling+OR+performance+OR+simd+OR+memory | publisher: GitHub REST API (jrouwe/JoltPhysics.js) | pub_date: 2026-08 (query date) | accessed: 2026-08-26 | confidence: high | class: limitation

**Memory ceiling evidence: issue #244 (closed) reports "Aborted(OOM)" when creating more than three Jolt interfaces simultaneously**, and #243 (closed) covers updating Emscripten memory settings. A single-table pinball game creates one interface, so this is not a blocker, but it indicates the WASM heap is provisioned per-module and not generously.
- source: https://api.github.com/search/issues?q=repo:jrouwe/JoltPhysics.js+tunneling+OR+performance+OR+simd+OR+memory | publisher: GitHub REST API | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: limitation

**No performance-versus-native benchmark and no build-size figure is published in the README** — it links a Bundlephobia badge rather than stating numbers. Consistent with round 2's settled finding that no public browser-physics benchmark exists at high tick rates.
- source: https://raw.githubusercontent.com/jrouwe/JoltPhysics.js/main/README.md | publisher: jrouwe / JoltPhysics.js | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: performance-number

**No engine features are documented as unavailable in the browser build; the README states the JS interface is "the same as the C++ interface of JoltPhysics."** Secondary friction found in issues: debug builds are not in the npm package (#231, closed) and the documented build path is Linux-only with Windows users reporting difficulty.
- source: https://raw.githubusercontent.com/jrouwe/JoltPhysics.js/main/README.md | publisher: jrouwe / JoltPhysics.js | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: capability

### Q5 — Ball-in-funnel / resting contact stability in Jolt

**This is the area with the most real, reproduced sphere defects — and all the ones found are closed with a named setting as the fix.** Five directly relevant issues: #1686 (spheres won't stay still with sleeping off), #717 (sphere bounces on the seam between touching boxes), #1155 (spheres catch on mesh internal edges), #1403 (restitution fails for a resting sphere), #1286 (restitution 1.0 gains energy each bounce).
- source: https://api.github.com/search/issues?q=repo:jrouwe/JoltPhysics+sphere+jitter+OR+resting+OR+sleeping | publisher: GitHub REST API | pub_date: 2026-08 (query date) | accessed: 2026-08-26 | confidence: high | class: limitation

**#1686 is the most decision-relevant: "Dynamic sphere bodies will not remain stationary on a flat surface when sleeping is disabled" (2025-06-29, closed 2025-07-01).** jrouwe's diagnosis: "This is most likely due to contact caching which introduces a bit of error (especially for round objects)." The fix is a settings change, not a code change — set `mUseBodyPairContactCache = false` on `PhysicsSettings`. The reporter confirmed it resolved. **A pinball ball resting in the trough or a scoop with sleeping disabled (which a pinball sim often wants, since a "sleeping" ball must wake instantly on a flipper or kicker) will creep unless contact caching is turned off** — and turning it off costs the narrow-phase savings the cache exists to provide.
- source: https://api.github.com/repos/jrouwe/JoltPhysics/issues/1686/comments | publisher: GitHub (jrouwe) | pub_date: 2025-06 to 2025-07 | accessed: 2026-08-26 | confidence: high | class: limitation

**#717 is the ghost-collision case that matters for any table built from multiple adjacent bodies.** jrouwe (2023-09-24): "With the default convex radius the collision of the boxes will actually look like this: So there will be a gap between the two boxes," and "Jolt doesn't currently do 'contact welding' between different objects, meaning that even though you do not see an edge here, there is one and the sphere can collide with it." The fix shipped 2024-01-20 as `BodyCreationSettings::mEnhancedInternalEdgeRemoval = true`.
- source: https://api.github.com/repos/jrouwe/JoltPhysics/issues/717/comments | publisher: GitHub (jrouwe) | pub_date: 2023-09 to 2024-01 | accessed: 2026-08-26 | confidence: high | class: limitation

**The caveat on that fix is a hard architectural constraint on how a table must be authored.** jrouwe: "you'll have to make your boxes be part of the same body or else the algorithm will not work. Because of the way Jolt multithreads collision detection, collisions between different body pairs run on different threads, so it is very difficult to make this algorithm work across bodies." It works for box and mesh shapes provided mesh triangles form a manifold (no T-edges, 0.1 mm tolerance). **Practical consequence: the static playfield, walls, ramps and rails should be one compound/mesh body, not many separate bodies, or the ball will hit invisible seams.** This is a design constraint to lock in before modelling starts.
- source: https://api.github.com/repos/jrouwe/JoltPhysics/issues/717/comments | publisher: GitHub (jrouwe) | pub_date: 2024-01 | accessed: 2026-08-26 | confidence: high | class: limitation

**#1155 (2024-07-03, closed 2024-07-05) shows enhanced internal edge removal was not by itself sufficient for rolling spheres, and it too was closed with a settings recommendation.** jrouwe: "I've created a fix for the repro case," and recommended allowing a little penetration slop — `mPenetrationSlop = 0.002f` rather than 0.0f, i.e. "10x less than the default... Makes the ball roll down the slope without issues." The thread also records the LinearCast side-effect that matters here: using CCD as a workaround made the ball get **stuck spinning in place**. Contributor mihe confirmed both repro cases fixed. Turnaround: two days.
- source: https://api.github.com/repos/jrouwe/JoltPhysics/issues/1155/comments | publisher: GitHub (jrouwe, mihe) | pub_date: 2024-07 | accessed: 2026-08-26 | confidence: high | class: limitation

**Jolt's sleeping controls and their exact defaults, retrieved from source**: sleeping is island-wide — "all the bodies in an island are checked to see if they have come to rest, if this is the case then the entire island is put to sleep." Tuning is `PhysicsSettings::mTimeBeforeSleep = 0.5f` ("Time before object is allowed to go to sleep (unit: seconds)") and `PhysicsSettings::mPointVelocitySleepThreshold = 0.03f` (three tracked points per body; "if the velocity of all 3 points is lower than this value, the object is allowed to go to sleep"). Per-body opt-out is `SetAllowSleeping`. Island-wide sleeping is worth noting: a ball resting against a moving/awake element keeps its island awake.
- source: https://raw.githubusercontent.com/jrouwe/JoltPhysics/master/Jolt/Physics/PhysicsSettings.h + https://raw.githubusercontent.com/jrouwe/JoltPhysics/master/Docs/Architecture.md | publisher: jrouwe / JoltPhysics | pub_date: unknown (master) | accessed: 2026-08-26 | confidence: high | class: capability

**Restitution for a resting/low-speed sphere is a known rough edge**: #1403 (2024-12) reports two spheres with high restitution sticking instead of bouncing, and #1286 (2024-09 to 2024-11, 14 comments) reports restitution 1.0 producing a *higher* bounce each time — energy gain. For pinball, where bounce off rubbers is the feel of the game, both directions of error are relevant; both are closed but the threads indicate restitution near the extremes needs care rather than being a dial you can set to 1.0.
- source: https://api.github.com/search/issues?q=repo:jrouwe/JoltPhysics+sphere+jitter+OR+resting+OR+sleeping | publisher: GitHub REST API | pub_date: 2024-09 to 2024-12 | accessed: 2026-08-26 | confidence: medium | class: limitation

### Q6 — Does anyone ship Jolt-WASM in a real browser game?

**three.js ships exactly one Jolt example — `physics_jolt_instancing` — against six Ammo examples and six Rapier examples (basic, instancing, joints, character controller, vehicle controller, terrain).** Jolt is present in the three.js ecosystem but markedly less built-out than Rapier there. This is a concrete asymmetry for a solo dev who will lean on examples.
- source: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json | publisher: mrdoob / three.js (dev branch) | pub_date: unknown (dev HEAD) | accessed: 2026-08-26 | confidence: high | class: ecosystem-health

**The JoltPhysics.js README names four downstream integrations: a Babylon.js plugin (Jolt as a physics engine backend), GDevelop (open-source 2D/3D game engine), react-three-jolt / r3f-jolt, and Synthesis (Autodesk robotics simulator).** GDevelop is the strongest signal here — a shipping general-purpose game engine using Jolt-WASM for its 3D physics, meaning real end-user games run on this binding.
- source: https://raw.githubusercontent.com/jrouwe/JoltPhysics.js/main/README.md | publisher: jrouwe / JoltPhysics.js | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ecosystem-health

**npm adoption: `jolt-physics` 1.1.0 (published 2026-07-11) records 16,346 downloads/month.** Live wrappers around it: `r3f-jolt` 0.2.1 (published 2026-08-05, 984/month — actively maintained), `spoint` 0.1.694 (2026-08-09, 58,087/month, a multiplayer physics+netcode SDK built on jolt-physics), `jolt-ts` 0.1.1 (2026-07-12), `jolt-physics-node` 0.1.0 (2026-02-26), `@openfluke/isocard` (2025-10-17). Note that `@react-three/jolt` and `react-three-jolt` both sit at 0.0.1 from early 2024 with single/double-digit monthly downloads — the React-side integrations are largely abandoned except r3f-jolt.
- source: https://registry.npmjs.org/-/v1/search?text=jolt%20physics | publisher: npm registry | pub_date: 2026-08 (query date) | accessed: 2026-08-26 | confidence: high | class: ecosystem-health

**Negative result: no named, playable browser game (itch.io or otherwise) built on Jolt-WASM was identified within this round's budget.** Evidence of production use is indirect — via engines (GDevelop, Babylon.js) and SDKs (spoint) that embed it — rather than a nameable shipped title. Treat "Jolt-WASM is proven in shipped browser games" as unverified.
- source: (absence across https://raw.githubusercontent.com/jrouwe/JoltPhysics.js/main/README.md and https://registry.npmjs.org/-/v1/search?text=jolt%20physics) | publisher: n/a | pub_date: n/a | accessed: 2026-08-26 | confidence: medium | class: ecosystem-health

## Leads worth chasing

- **Babylon.js Jolt plugin was NOT confirmed this run.** A GitHub search of `repo:BabylonJS/Babylon.js jolt in:title` returned zero results, contradicting the JoltPhysics.js README's claim of a Babylon plugin. Likely explanations: the plugin lives in a community repo (a `@phoenixillusion/babylonjs-jolt-plugin`-style package) rather than Babylon core, or the title-scoped query was too narrow. Worth one targeted fetch of doc.babylonjs.com or an npm lookup before citing Babylon as a Jolt consumer.
- **Prototype the sensor gap early.** #1142's "LinearCast vs sensors are treated as Discrete" is the one open defect that maps directly onto pinball switch detection. Test whether a fast ball reliably triggers rollover/drain sensors, and if not, whether the `OnContactAdded` + `mIsSensor` workaround holds at speed.
- **Measure the cost of `mUseBodyPairContactCache = false`.** It is the prescribed fix for resting-sphere creep (#1686), but it disables an optimisation. Quantify the frame-time delta on a full table before committing to sleeping-disabled + cache-disabled.
- **Decide table body topology before modelling.** The `mEnhancedInternalEdgeRemoval` cross-body limitation (#717) means the static playfield must be authored as a single body. Retrofitting this later would be expensive.
- **`mLinearCastThreshold` at high tick rate.** Verify empirically at the intended rate whether the ball ever exceeds 0.75x inner radius per step — if it never does, LinearCast is inert and the ball is running Discrete regardless of the motion-quality setting.
- **Cross-check the Rapier 0.20.0 → core 0.30.1 mapping** against the published .wasm or a `cargo tree` in the package tarball if byte-exact provenance ever becomes load-bearing.

## Looked for but could not find

- **Any open Jolt issue reporting CCD/LinearCast tunneling for small fast spheres.** Searched three query variants; zero open results. The absence is itself the answer and it is favourable to Jolt.
- **A documented maximum delta time per collision step, or any Jolt guidance for update rates above 60 Hz.** Neither Architecture.md nor the `PhysicsSystem::Update()` header comment states one. Jolt documents that it "is stable when running at 60 Hz with 1 collision step" and stops there.
- **Any performance-versus-native benchmark or stated build size for JoltPhysics.js.** The README defers to a Bundlephobia badge; no figures published.
- **`mDeterministicSimulation` and an explicit max-linear-velocity setting** in PhysicsSettings.h — not present under those names in the retrieved file.
- **A named, playable browser game shipping Jolt-WASM.** See the negative finding under Q6.
- **Confirmation of a Babylon.js Jolt plugin in the Babylon core repository.** Zero-result GitHub search; see Leads.
