# Digest: Web renderer + physics candidates (round 1)

Scope: dimension 4a of 5. Round 1 of research. All dates accessed 2026-08-26.

**Epistemic header.** Version and release-date claims below are pinned to primary sources (GitHub API `published_at`, npm registry `version`, upstream CHANGELOG). Performance/benchmark claims are the weakest part of this record: the aggregator surfaced numbers almost entirely from low-quality secondary sites (`abratabia.com`, `mysimulator.uk`, `cinevva.com`) that read as SEO/AI-generated content farms. I have marked those `confidence: low` and labelled them UNVERIFIED rather than laundering them into fact. **There is no credible public head-to-head browser benchmark of Rapier vs Jolt vs Ammo that I could retrieve this run.** That absence is itself a finding.

---

## Findings

### 1. Renderers

**Three.js's current release is r185, published 2026-07-01, corresponding to npm package `three@0.185.1`.**
- source: https://api.github.com/repos/mrdoob/three.js/releases | publisher: GitHub / mrdoob (three.js) | pub_date: 2026-07 | accessed: 2026-08-26 | confidence: high | class: version-compat
- source: https://registry.npmjs.org/three/latest | publisher: npm registry | pub_date: 2026-07 | accessed: 2026-08-26 | confidence: high | class: version-compat

**Three.js ships roughly every two months, with r184 on 2026-04-16, r183 on 2026-02-20, and r182 on 2025-12-10 — a cadence indicating a healthy, actively released project.**
- source: https://api.github.com/repos/mrdoob/three.js/releases | publisher: GitHub / mrdoob (three.js) | pub_date: 2026-07 | accessed: 2026-08-26 | confidence: high | class: ecosystem-health

**Three.js's WebGPURenderer was still receiving substantial feature work through r183–r185 (reversed depth buffer support, WebXR-with-WebGPU, hardware clipping, texture-array render targets, BPTC formats), meaning it is actively maturing rather than feature-frozen.**
- source: https://api.github.com/repos/mrdoob/three.js/releases | publisher: GitHub / mrdoob (three.js) | pub_date: 2026-07 | accessed: 2026-08-26 | confidence: medium | class: capability
- Caveat: I did NOT find a primary statement from the three.js maintainers declaring WebGPURenderer production-default. Secondary blogs asserted "WebGPU is now the recommended renderer," but those same blogs also carried a demonstrably false claim (see below), so I do not carry that assertion forward.

**A widely-surfaced secondary claim that "Three.js r160 released 2026-02-28" is FALSE and should be treated as a contamination marker for that source set.** The GitHub API shows r183 on 2026-02-20; r160 is a much older revision. Several 2026-dated blog posts repeat this error, which suggests AI-generated filler in the Three.js commentary space.
- source: https://api.github.com/repos/mrdoob/three.js/releases | publisher: GitHub / mrdoob (three.js) | pub_date: 2026-07 | accessed: 2026-08-26 | confidence: high | class: limitation
- (the erroneous claim appeared at https://digitalstrategyforce.com/journal/what-does-threejs-r160-mean-for-web-developers-in-2026/)

**Babylon.js's current published core package is `@babylonjs/core` 9.22.2.**
- source: https://registry.npmjs.org/@babylonjs/core/latest | publisher: npm registry | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: version-compat
- Gap: single source. I did not retrieve a second confirmation of 9.22.2 nor its publish date. The 9.x major line and a 2026-03-26 announcement of Babylon.js 9.0 (Windows Developer Blog) came only via aggregator and is `confidence: medium`.

**Babylon.js treats physics as a first-class engine subsystem: a documented "Physics V2" API with a plugin architecture (HavokPlugin, Cannon, Oimo), whereas Three.js core embeds no solver and instead ships thin example-level wrappers under `examples/jsm/physics` (RapierPhysics, JoltPhysics, AmmoPhysics, OimoPhysics).**
- source: https://doc.babylonjs.com/features/featuresDeepDive/physics | publisher: Babylon.js docs (Microsoft) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: capability
- source: https://threejs.org/manual/en/physics.html | publisher: three.js | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: capability
- Decision note: for a pinball table this cuts toward Babylon if you want the integration handed to you, and toward Three.js if you want direct control of the physics step (which a 500–1000 Hz fixed-tick pinball loop probably does want — the wrappers assume a render-rate step).

**PlayCanvas's engine is free and open source, while the Editor is a paid SaaS: Free $0/mo with 1GB storage, Personal $15/mo with 10GB, Organization $50 per seat/mo with 50GB; all tiers list unlimited private projects, but cancelling a subscription locks private projects until you resubscribe or make them public.**
- source: https://playcanvas.com/plans | publisher: PlayCanvas | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ecosystem-health
- Gap: the plans page says only "PlayCanvas is free and open source" without naming the engine license on that page. The commonly-cited MIT license for the engine repo is NOT confirmed by a source retrieved this run.

### 2. Physics engines — versions, license, activity

**Jolt Physics core released v5.6.0 on 2026-07-11, preceded by v5.5.0 (2025-12-28), v5.4.0 (2025-09-27) and v5.3.0 (2025-03-15) — four releases in ~16 months, the strongest release cadence in this comparison set.**
- source: https://api.github.com/repos/jrouwe/JoltPhysics/releases | publisher: GitHub / jrouwe (Jolt Physics) | pub_date: 2026-07 | accessed: 2026-08-26 | confidence: high | class: ecosystem-health

**The Jolt v5.6.0 release notes claim up to 40% performance improvement and up to 70% memory reduction depending on scene, and add GPU compute shader support and a new friction model.**
- source: https://api.github.com/repos/jrouwe/JoltPhysics/releases | publisher: GitHub / jrouwe (Jolt Physics) | pub_date: 2026-07 | accessed: 2026-08-26 | confidence: medium | class: performance-number
- Caveat: vendor self-report, scene-dependent, and the GPU compute path is very unlikely to be reachable from the wasm build.

**The wasm binding JoltPhysics.js reached 1.1.0 on 2026-07-11 — the same day as Jolt core 5.6.0 — and its release note states it "Updates to Jolt 5.6.0", showing the browser binding tracks upstream with essentially zero lag.** The npm package `jolt-physics` is at 1.1.0 under MIT.
- source: https://api.github.com/repos/jrouwe/JoltPhysics.js/releases | publisher: GitHub / jrouwe (JoltPhysics.js) | pub_date: 2026-07 | accessed: 2026-08-26 | confidence: high | class: version-compat
- source: https://registry.npmjs.org/jolt-physics/latest | publisher: npm registry | pub_date: 2026-07 | accessed: 2026-08-26 | confidence: high | class: version-compat
- Significance: the wasm binding is maintained by Jolt's own author (jrouwe), not a third party. This is a materially better maintenance position than Ammo.js, where the browser port is a community fork of an old Bullet.

**JoltPhysics.js reached its 1.0.0 milestone on 2025-12-28 (tracking Jolt v5.5.0), having been on 0.39.0 as recently as 2025-11-04 — so the browser binding only left 0.x within the last ~8 months.**
- source: https://api.github.com/repos/jrouwe/JoltPhysics.js/releases | publisher: GitHub / jrouwe (JoltPhysics.js) | pub_date: 2026-07 | accessed: 2026-08-26 | confidence: high | class: ecosystem-health

**Rapier's Rust core is at v0.35.2 (2026-08-15), with v0.35.1 and v0.35.0 both on 2026-08-08 — i.e. a major release landed 11 days before the access date, and a patch followed within a week.**
- source: https://github.com/dimforge/rapier/blob/master/CHANGELOG.md (raw) | publisher: GitHub / dimforge (Rapier) | pub_date: 2026-08 | accessed: 2026-08-26 | confidence: high | class: version-compat
- **Risk flag:** a physics core that shipped a major version 11 days ago, needed two patches in a week, and rewrote its CCD in that same release is not yet field-proven. For a project whose single hardest requirement is CCD correctness, this is a timing hazard, not a feature.

**The npm JS binding `@dimforge/rapier3d` is at 0.20.0 under Apache-2.0 — a different version line from the Rust core's 0.35.x, and I could NOT establish which core version 0.20.0 wraps.**
- source: https://registry.npmjs.org/@dimforge/rapier3d/latest | publisher: npm registry | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: version-compat
- **This is a load-bearing unknown.** All the CCD-rewrite reasoning below is about Rust core 0.35.x. If the published JS binding still wraps a pre-0.35 core, the browser-facing CCD behaviour is the OLD sweep-based implementation, not the new one. Round 2 must resolve this before any Rapier decision.

**Rapier publishes no GitHub Releases (the releases API returns empty); version history lives only in CHANGELOG.md and crates.io.** This makes automated freshness checking harder and means release-note quality depends on one hand-maintained file.
- source: https://api.github.com/repos/dimforge/rapier/releases | publisher: GitHub / dimforge (Rapier) | pub_date: 2026-08 | accessed: 2026-08-26 | confidence: high | class: ecosystem-health

**Havok for Babylon.js ships as npm `@babylonjs/havok` 1.3.14, described as "The Havok physics engine for the web"; the npm `license` field reads MIT.**
- source: https://registry.npmjs.org/@babylonjs/havok/latest | publisher: npm registry | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: version-compat
- **Treat the MIT field with suspicion.** Havok is a proprietary commercial engine (Microsoft); an MIT string in package metadata almost certainly covers the JS wrapper, not the wasm binary's engine terms. The real grant is a Babylon/Havok partnership allowing free web use. Anyone shipping commercially must read the actual bundled license, not the npm field. Unresolved this run.

**cannon-es is effectively dormant as a core engine: latest npm release 0.20.0, reported as roughly three years old (~2022).**
- source: https://app.unpkg.com/cannon-es@0.10.0 | publisher: unpkg | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: ecosystem-health
- Confidence low: this came through the aggregator and I did not confirm the publish date directly. But nothing retrieved this run contradicts it, and no 2025–2026 cannon-es release surfaced anywhere.

**Ammo.js wraps Bullet 2.82 in its source tree — a Bullet line predating Bullet 3.x entirely — and the canonical repo (kripken/ammo.js) is old, with activity having migrated to forks (Mozilla/enable3d, Cocos). License is zlib.**
- source: https://github.com/kripken/ammo.js/ | publisher: GitHub / kripken | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: ecosystem-health
- Assessment: Bullet's CCD is genuinely mature, but you would be adopting a decade-plus-old snapshot of it through an emscripten port with no first-party maintainer. For a solo dev this is the highest-friction option in the set.

### 3. Small fast sphere / tunneling — THE decision question

**Jolt documents its CCD honestly and in the engine's own words, and the caveats matter directly for pinball.** Primary quotes from the EMotionQuality header docs:
- Discrete: *"Update the body in discrete steps. Body will tunnel through thin objects if its velocity is high enough. This is the cheapest way of simulating a body."*
- LinearCast: *"Update the body using linear casting. When stepping the body, its collision shape is cast from start to destination using the starting rotation. The body will not be able to tunnel through thin objects at high velocity, but tunneling is still possible if the body is long and thin and has high angular velocity."*
- source: https://jrouwe.github.io/JoltPhysics/_motion_quality_8h.html | publisher: Jolt Physics API docs (jrouwe) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: capability
- **Read for pinball: a sphere is the best possible case for LinearCast.** The documented failure mode is "long and thin with high angular velocity" — the exact opposite of a ball. A pinball is short, round, and its angular velocity does not change its swept volume. This is strong positive evidence for Jolt on requirement #1.

**Jolt's LinearCast steals time on impact: *"Time is stolen from the object (which means it will move up to the first collision and will not bounce off the surface until the next integration step)."* At a 60 Hz tick this would be a visible hitch on every bumper hit; at 500–1000 Hz the stolen interval is 1–2 ms and imperceptible.**
- source: https://jrouwe.github.io/JoltPhysics/_motion_quality_8h.html | publisher: Jolt Physics API docs (jrouwe) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: limitation
- **This finding independently justifies the high tick rate in the requirements.** The stated preference for 500–1000 Hz is not merely about accuracy — under Jolt it is what makes CCD time-theft invisible. A pinball hits bumpers constantly, so this is a per-second, not per-edge-case, concern.

**Jolt's anti-stick escape hatch is a documented residual tunneling path: *"In order to not get stuck, the body is always allowed to move by a fraction of it's inner radius, which may eventually lead it to pass through geometry."* For a small ball, "a fraction of its inner radius" is a small absolute distance, but it accumulates every frame while in contact.**
- source: https://jrouwe.github.io/JoltPhysics/_motion_quality_8h.html | publisher: Jolt Physics API docs (jrouwe) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: limitation
- Design consequence: playfield walls and the table floor should be modelled with real thickness (or as closed solids), never as zero-thickness planes or thin shells. This is a scene-authoring requirement, not a tuning knob, and it applies to whichever engine is chosen.

**Rapier rewrote its CCD in v0.35.0, replacing the sweep-based time-of-impact approach, and introduced `soft_ccd_prediction` — described in the changelog as "a form of CCD based on predictive contacts" that is "generally cheaper than the normal (time-dropping) CCD implemented so far" and can be combined with full CCD.**
- source: https://github.com/dimforge/rapier/blob/master/CHANGELOG.md | publisher: GitHub / dimforge (Rapier) | pub_date: 2026-08 | accessed: 2026-08-26 | confidence: medium | class: capability
- Architecture read: this gives Rapier a two-tier model — cheap speculative contacts for moderate speeds, expensive time-dropping TOI for extreme ones — with per-body opt-in via `setCcdEnabled(true)` / `enableCcd(true)`. The soft-CCD tier is explicitly scoped by its own docs to "moderately fast" objects, which a pinball at full plunge speed may exceed; the full TOI tier would then be required for the ball specifically.
- **Confidence capped at medium and NOT higher, for two reasons:** (a) the changelog was read through a summarizing fetch rather than quoted line-by-line, and (b) per finding above, it is unconfirmed whether the shipped JS/wasm binding contains this rewrite at all.

**I found no first-hand developer post-mortem, issue thread, or bug report describing actual tunneling outcomes for a small fast sphere in either Rapier-wasm or Jolt-wasm.** The aggregator, asked directly, conceded "there is very little formal documentation that lists specific 'small fast sphere' tunneling anecdotes" and fell back to restating both engines' own docs.
- source: (negative result across mcp__perplexity-mcp__reason citation set) | publisher: n/a | pub_date: 2026-08 | accessed: 2026-08-26 | confidence: high | class: limitation
- **This is the most important gap in round 1.** Both engines' vendor docs say the right things. Neither claim has been checked against a shipped browser game with a fast ball. Round 2 must go to the issue trackers directly.

**Cannon-es exposes only a speed-threshold CCD (`ccdSpeedThreshold` on the body/world), a markedly simpler mechanism than Bullet's swept spheres, Jolt's LinearCast, or Rapier's two-tier system.** Combined with its dormancy, this rules it out for the stated requirement.
- source: https://pmndrs.github.io/cannon-es/docs/ | publisher: pmndrs (cannon-es docs) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: capability

### 4. Performance and tick rate

**No credible benchmark comparing Rapier, Jolt and Ammo in the browser was retrievable this run.** Every comparative number the aggregator produced (Rapier "58 fps at 10k bodies" vs Ammo "~50 fps"; Jolt "~2x faster than Rapier in large scenes"; Rapier "2000+ bodies at 60fps") traces to `abratabia.com`, `mysimulator.uk` or `cinevva.com` — sites with no identifiable authorship, no methodology, and characteristics of generated SEO content. **I am not carrying these numbers as findings.**
- source: (negative result) | publisher: n/a | pub_date: 2026-08 | accessed: 2026-08-26 | confidence: high | class: limitation
- Practical note: for a pinball table the body count is ~dozens, not thousands. Every benchmark in this space measures large-scene throughput, which is the wrong axis entirely for this decision. Even a good large-scene benchmark would not answer the question. **The right benchmark is one you run yourself: one CCD sphere, a realistic playfield, at the target tick rate.**

**Dimforge's own 2025 year-in-review claims the fastest Rapier npm packages are 2–5x faster than the fastest package available in 2024 (v0.24.0).**
- source: https://dimforge.com/blog/2026/01/09/the-year-2025-in-dimforge/ | publisher: Dimforge | pub_date: 2026-01 | accessed: 2026-08-26 | confidence: low | class: performance-number
- Confidence low: vendor self-report reached via aggregator; I did not fetch the post directly and cannot see its methodology. Flagged for round 2.

**Physics in a Web Worker communicating via SharedArrayBuffer + Atomics is the commonly-described architecture for decoupling a high-rate physics tick from the render loop, but I found no production post-mortem with real numbers for this pattern in a game.** Note the deployment cost: SharedArrayBuffer requires cross-origin isolation (COOP/COEP headers), which constrains hosting and can break third-party embeds.
- source: (aggregator synthesis; no primary post-mortem located) | publisher: n/a | pub_date: 2026-08 | accessed: 2026-08-26 | confidence: low | class: limitation
- Honest assessment: at ~dozens of bodies, a 500–1000 Hz tick is very likely achievable on the main thread on desktop Windows/macOS without a worker at all. The worker architecture is an optimization to reach for if measurement demands it, not a day-one requirement — and its COOP/COEP tax is real for a solo dev.

### 5. Determinism

**Rapier documents an `enhanced-determinism` feature intended to give cross-platform bitwise-identical results on IEEE-754-compliant platforms including wasm, and v0.35.0 specifically removed a divergence source by canonicalizing signed zeros in stored contact impulses.**
- source: https://github.com/dimforge/rapier/blob/master/CHANGELOG.md | publisher: GitHub / dimforge (Rapier) | pub_date: 2026-08 | accessed: 2026-08-26 | confidence: medium | class: capability
- Note: determinism is documented as trading off against the `parallel` feature. Rapier is the only engine here that treats cross-platform determinism as an explicit, named, tested feature.

**Jolt documents deterministic simulation as achievable under stated conditions — identical API call order, identical binary, precise floating-point model, and use of Jolt's own trig functions — rather than as an unconditional guarantee.**
- source: https://jrouwe.github.io/JoltPhysics/ | publisher: Jolt Physics docs (jrouwe) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: capability
- For a browser wasm target, "identical binary" is actually easier to satisfy than on native, since every player runs the same .wasm.

**Havok-via-Babylon, Ammo.js and cannon-es publish no cross-platform determinism guarantees.** For Havok the Babylon docs abstract the engine and do not document determinism controls at all.
- source: https://doc.babylonjs.com/features/featuresDeepDive/physics/havokPlugin | publisher: Babylon.js docs (Microsoft) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: limitation

**Does determinism matter for single-player pinball? Largely no, with two specific exceptions.** Nothing retrieved this run bears on the design question directly, so this is reasoning, not a sourced claim: a single-player game needs no lockstep sync, and score is computed from events rather than replayed. Determinism earns its keep only if you want (a) recorded replays stored as input streams rather than as transform tracks, or (b) reproducible bug reports and regression tests for table behaviour — which for a physics-heavy solo project is genuinely valuable during development even if it never ships as a feature. Local run-to-run determinism (same machine, same binary) is sufficient for both; cross-platform bitwise determinism is not required.

### 6. Existing browser 3D pinball on these stacks

**"Neanderthal Pinball" by Tr909 is a browser 3D pinball built on Babylon.js with the Havok physics plugin, posted to the Babylon.js forum on 2024-04-15, playable at https://tr909.itch.io/neanderthal-proto.** The thread includes a Babylon Playground of the author's basic physics setup.
- source: https://forum.babylonjs.com/t/pinball-game-with-havok-physics/49675 | publisher: Babylon.js forum | pub_date: 2024-04 | accessed: 2026-08-26 | confidence: high | class: capability
- **Caveat: this is 2+ years old, below the 12-month landscape freshness bar, and predates Babylon 9.x.** It is evidence the combination *works*, not evidence about current versions.

**Feedback in that thread is directly instructive for the design: the author admits cutting corners on the launcher; a commenter with real pinball experience said the ball was "way too small" relative to real proportions; another suggested reducing launcher bounciness; and one reported the game ran too fast to play.** Notably, the author never discusses CCD or tunneling.
- source: https://forum.babylonjs.com/t/pinball-game-with-havok-physics/49675 | publisher: Babylon.js forum | pub_date: 2024-04 | accessed: 2026-08-26 | confidence: high | class: limitation
- **Read carefully, this is the most useful finding in section 6.** The complaints about this real pinball attempt were about *feel* — ball scale, launcher tuning, game speed — not about the ball falling through the table. That inverts the framing of the brief slightly: tunneling may be the requirement that's easiest to satisfy, while "realistic-but-playable" feel is the one that actually sank a shipped attempt.

**No named Three.js pinball game using Rapier or Jolt surfaced.** The closest public reference points are the official three.js physics examples (`physics / rapier / instancing`, `physics / jolt / instancing`) and a community "Bowling mini-game with Rapier physics" on the three.js forum (https://discourse.threejs.org/t/bowling-mini-game-with-rapier-physics/44309) — a rolling-ball-into-rigid-targets scenario mechanically adjacent to pinball.
- source: https://threejs.org/manual/en/physics.html | publisher: three.js | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: ecosystem-health
- source: https://discourse.threejs.org/t/bowling-mini-game-with-rapier-physics/44309 | publisher: three.js forum | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: capability
- Confidence low on the bowling demo: reached via aggregator, not fetched directly, and its date is unknown.

---

## Comparison table — physics engines

| Engine | Browser package / version | Core version + date | CCD mechanism | Determinism | License | Activity (last 12 mo) |
|---|---|---|---|---|---|---|
| **Jolt** | `jolt-physics` 1.1.0 (npm), MIT | Jolt 5.6.0, 2026-07-11 | LinearCast shape-cast per body via `EMotionQuality`; documented to prevent tunneling for fast bodies except long-thin-with-spin (a sphere is best case). Steals time on impact. | Documented conditionally (same binary, precise FP model, Jolt trig, call order) | MIT | **Strongest.** 4 core releases; wasm binding 0.39→1.1.0, maintained by Jolt's own author, ships same-day as core |
| **Rapier** | `@dimforge/rapier3d` 0.20.0 (npm), Apache-2.0 | Rust core 0.35.2, 2026-08-15 | **Rewritten in 0.35.0.** Two-tier: `soft_ccd_prediction` (speculative contacts, "moderately fast") + full time-dropping TOI, per-body opt-in | **Best documented.** Named `enhanced-determinism` feature targeting cross-platform bitwise identity incl. wasm; trades off vs `parallel` | Apache-2.0 | Active, but major version is 11 days old with 2 patches in a week; **no GitHub Releases**; JS-binding-to-core version mapping unresolved |
| **Havok (Babylon)** | `@babylonjs/havok` 1.3.14 | proprietary; internal version not public | AAA-grade, but Babylon docs expose no CCD controls or details | Not documented | npm field says MIT — **almost certainly covers wrapper only**; engine is proprietary, free via Babylon partnership. Unresolved. | Active alongside Babylon 9.x |
| **Ammo.js (Bullet)** | various forks (Mozilla/enable3d, Cocos) | wraps **Bullet 2.82** | Bullet's mature swept-sphere CCD, but low-level and easy to misconfigure | Repeatable w/ fixed timestep; no cross-platform guarantee | zlib | Canonical repo stale; life is in forks. No first-party maintainer. |
| **cannon-es** | `cannon-es` 0.20.0 | ~2022 (unconfirmed) | `ccdSpeedThreshold` only — simplest mechanism in set | None | MIT | **Dormant.** No 2025–26 release surfaced. |

**Renderers:** Three.js r185 (2026-07-01, `three@0.185.1`) — no built-in physics, example-level wrappers, largest ecosystem. Babylon.js `@babylonjs/core` 9.22.2 — formal Physics V2 plugin architecture, Havok is the natural pairing. PlayCanvas — engine open source, Editor $0 / $15 / $50-per-seat per month.

---

## Leads worth chasing

1. **Resolve which Rapier core `@dimforge/rapier3d` 0.20.0 wraps.** Highest-priority open item. Check the binding repo's Cargo.toml / bindings changelog. If the CCD rewrite isn't in the shipped wasm, the Rapier CCD story reverts to the old sweep-based implementation and the comparison changes materially.
2. **Go to the issue trackers for real tunneling reports.** Search `dimforge/rapier` and `jrouwe/JoltPhysics` issues for "tunnel", "fast sphere", "CCD not working", "bullet through paper". Vendor docs are unanimously positive; issue trackers are where docs and reality diverge.
3. **Havok's actual license terms for a commercial web game.** Read the license file inside the `@babylonjs/havok` package rather than trusting the npm `license` field. This is a shipping blocker if it turns out restrictive.
4. **Build the benchmark rather than searching for it.** One CCD sphere at pinball speed against a realistic playfield, Rapier vs Jolt, stepping at 60/120/240/500/1000 Hz, measuring step cost and counting escapes. Two days of work would produce better evidence than the entire public record.
5. **Confirm Babylon 9.x release date and the 9.22.2 publish date** from Babylon's own changelog — currently single-sourced from npm.
6. **The "feel" problem.** The one real pinball attempt found was criticized for ball scale, launcher tuning and game speed, not tunneling. Worth a dedicated dimension: real pinball dimensions/masses, flipper impulse modelling, and what makes simulated pinball feel right (the Visual Pinball / VPX community is the obvious body of knowledge and was not touched this round).
7. **Three.js WebGPU production-readiness from a primary maintainer statement**, not from the blog layer that fabricated the r160 date.

## Looked for but could not find

- **Any credible browser benchmark comparing Rapier vs Jolt vs Ammo.** All comparative numbers traced to unattributed content-farm sites. Reported as thin because it is thin.
- **Any first-hand developer account of small-fast-sphere tunneling behaviour in Rapier-wasm or Jolt-wasm.** The single most decision-relevant evidence class, and the public record appears empty. Vendor documentation is all that exists.
- **Any production post-mortem of Web Worker + SharedArrayBuffer physics in a shipped browser game, with numbers.**
- **A Three.js pinball game on any modern physics engine.** Nearest neighbour is a bowling demo.
- **Rapier GitHub Releases** — the project doesn't publish them; CHANGELOG.md is the only release record.
- **Havok's internal engine version, and its real license terms** for the web distribution.
- **A confirmed publish date for cannon-es 0.20.0** and for `@babylonjs/core` 9.22.2 / `@dimforge/rapier3d` 0.20.0 (npm `latest` endpoint carries no timestamp; would need the full packument or npm web UI).
- **A primary three.js maintainer statement on WebGPURenderer production status.**
