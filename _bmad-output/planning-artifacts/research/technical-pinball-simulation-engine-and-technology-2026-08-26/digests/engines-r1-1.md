# Digest: Full game engine candidates (round 1)

Scope: dimension 4b — full game engines with browser/web export, viability for a realistic-but-playable 3D pinball simulation (small fast sphere, high tick rate, 60+ FPS, good playfield lighting, solo/small team). Accessed 2026-08-26.

**Reading note on confidence.** Where a claim rests only on an aggregator's synthesis of secondary sources (SEO comparison sites), it is marked `low` and labelled as such. Two classes of claim in this brief came back materially thinner than expected and are recorded in "Looked for but could not find": (a) primary-source build-size/load-time numbers for Unity Web, and (b) genuine 6–12-month developer post-mortems for physics-heavy 3D browser games. Absence of that evidence is itself a finding.

---

## Findings

### 1. Unity Web / WebGL

**Unity 6 currently runs two concurrent LTS streams: Unity 6.0 LTS (support ending ~October 2026) and Unity 6.3 LTS (first released 2025-12-04, supported to December 2027), with Unity 6.4 shipping March 2026 as a non-LTS "supported" release.**
- source: https://unity.com/releases/unity-6/support | publisher: Unity Technologies | pub_date: unknown (page live 2026-08) | accessed: 2026-08-26 | confidence: medium | class: version-compat
- source: https://endoflife.date/unity | publisher: endoflife.date | pub_date: 2026-08 | accessed: 2026-08-26 | confidence: medium | class: version-compat
- caveat: retrieved via aggregator citation chain, not read directly from unity.com this run. Patch builds cited for August 2026 are 6000.0.82f1 and 6000.3.22f1. **Treat exact patch numbers as unverified.**

**Unity's WebGPU support is documented by Unity itself as experimental in the Unity 6.3 manual: "WebGPU is experimental and not supported by all browsers and devices."**
- source: https://docs.unity3d.com/6000.3/Documentation/Manual/WebGPU.html | publisher: Unity Technologies | pub_date: unknown (6000.3 manual) | accessed: 2026-08-26 | confidence: medium | class: capability
- implication: as of Unity 6.3 LTS there is no production-grade "Unity Web on WebGPU". The stable path is still WebGL 2.

**Unity's own 6.3 browser-compatibility page defines Unity Web support as: Chrome, Firefox, Safari and Edge on Windows/macOS/Linux, requiring WebGL 2, HTML5 compliance, and 64-bit WebAssembly support; iOS Safari 15+ and Android Chrome 58+ on mobile. The page does not mention WebGPU at all.**
- source: https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-browsercompatibility.html | publisher: Unity Technologies | pub_date: unknown (6000.3 manual) | accessed: 2026-08-26 | confidence: high | class: version-compat
- read directly this run. The silence on WebGPU on the *compatibility* page, while a separate WebGPU manual page exists, is consistent with WebGPU being experimental and outside the supported matrix.

**Unity documents two Safari-specific defects: Safari before version 15 has no WebGL 2, and Safari does not support IndexedDB for content running in an iframe.**
- source: https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-browsercompatibility.html | publisher: Unity Technologies | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: limitation
- relevance to this decision: the iframe/IndexedDB defect directly affects caching and save state for a game embedded on itch.io or any host page — a macOS Safari requirement is in scope for this project.

**Unity has an open, acknowledged issue titled "WebGL: bad performance when playing in Safari", attributed to Safari's WebGL→Metal translation path rather than Unity engine code.**
- source: https://issuetracker.unity3d.com/issues/webgl-bad-performance-when-playing-in-safari | publisher: Unity Technologies (Issue Tracker) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: limitation
- caveat: surfaced via aggregator; the issue's current status/resolution was **not** verified this run. Before treating this as a blocker, check the issue's live status — an unfixed-in-2022 issue is not evidence about 2026.

**Unity's licensing has no runtime fee: Unity publicly cancelled the 2023 Runtime Fee and replaced it with subscription price increases.**
- source: https://unity.com/blog/unity-is-canceling-the-runtime-fee | publisher: Unity Technologies | pub_date: 2024-09 | accessed: 2026-08-26 | confidence: high | class: pricing
- source: https://www.reuters.com/technology/unity-software-scraps-runtime-fee-pricing-policy-introduces-price-hikes-2024-09-12/ | publisher: Reuters | pub_date: 2024-09-12 | accessed: 2026-08-26 | confidence: high | class: pricing
- two independent sources; the cancellation is solid.

**Unity Personal is free for individuals/organizations with total annual revenue and funding of $0–$200,000 USD; Unity Pro is required above $200K and below $25M, at a listed ~$2,200 USD per seat per year; Unity Enterprise is required at $25M+.**
- source: https://unity.com/products/pricing-updates | publisher: Unity Technologies | pub_date: unknown (terms effective 2025-01-01) | accessed: 2026-08-26 | confidence: medium | class: pricing
- source: https://unity.com/blog/terms-update-runtime-fee-cancellation | publisher: Unity Technologies | pub_date: 2024-09 | accessed: 2026-08-26 | confidence: medium | class: pricing
- **FRESHNESS FAILURE — flag this.** The brief requires pricing ≤ 3 months old read directly from the pricing page. `unity.com/pricing` returned **HTTP 403** to direct fetch this run, and `unity.com/products` was not successfully read. These numbers come from an aggregator citing Unity pages and from Unity's own 2024 blog. The $200K/$25M thresholds and no-runtime-fee status are consistent across sources and almost certainly correct; **the $2,200/seat figure is a 2025-01-01 number and must be re-verified before it goes in a decision document.**
- for this project's purposes the operative fact is: a solo developer under $200K revenue/funding uses Unity Personal at $0 with no royalty and no runtime fee.

**Unity 6 still uses NVIDIA PhysX as its built-in 3D physics backend, offering four collision detection modes: Discrete, Continuous, Continuous Dynamic, and Continuous Speculative.**
- source: https://docs.unity3d.com/6000.4/Documentation/Manual/PhysicsOverview.html | publisher: Unity Technologies | pub_date: unknown (6000.4 manual) | accessed: 2026-08-26 | confidence: medium | class: capability
- source: https://docs.unity3d.com/6000.4/Documentation/Manual/ContinuousCollisionDetection.html | publisher: Unity Technologies | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: capability
- caveat: surfaced via aggregator, not read directly. **Unity does not publicly expose a PhysX major-version number** (4.x vs 5.x) in the editor or the manual — so "which PhysX version" is not answerable from public docs. That is a finding, not a gap in the search.

**Unity's speculative CCD ("Continuous Speculative") works by inflating the body's broad-phase AABB from start-of-step velocity and feeding predicted contacts to the solver; it is therefore cheaper but strictly less robust than swept-volume CCD, and can still tunnel when a body gains large velocity mid-step.**
- source: https://docs.unity3d.com/6000.0/Documentation/Manual/speculative-ccd.html | publisher: Unity Technologies | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: limitation
- **directly load-bearing for pinball**: a pinball ball receives exactly the failure case — large impulses applied within a single step (flipper strikes, bumper kicks). The engineering implication is: use sweep-based **Continuous Dynamic** on the ball and **Continuous** on the surfaces it hits, not Continuous Speculative.

### 2. Godot 4 web export

**The latest stable Godot is 4.7.2, released 2026-08-18; Godot 4.6-stable released 2026-01-26 and 4.7-stable released 2026-06-18.**
- source: https://godotengine.org/download/archive/ | publisher: Godot Foundation | pub_date: 2026-08 | accessed: 2026-08-26 | confidence: medium | class: version-compat
- source: https://endoflife.date/godot | publisher: endoflife.date | pub_date: 2026-08 | accessed: 2026-08-26 | confidence: medium | class: version-compat
- caveat: via aggregator citation chain; the 4.7-stable archive page (https://godotengine.org/download/archive/4.7-stable/) is the primary to confirm.

**Godot's web export supports ONLY the Compatibility rendering method on WebGL 2.0. Forward+ and Mobile renderers are explicitly not supported on web "as these rendering methods are designed around modern low-level graphics APIs."**
- source: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html | publisher: Godot Foundation | pub_date: unknown (stable docs) | accessed: 2026-08-26 | confidence: high | class: limitation
- read directly this run. **This is the single most important finding for a pinball playfield.** Godot's good 3D lighting (SDFGI, volumetrics, full clustered lighting, SSR) lives in Forward+. On web you get the Compatibility renderer, which is a deliberately reduced lighting feature set. A "good 3D lighting for a pinball playfield" requirement collides head-on with Godot's web target.

**Godot web export explicitly does not support WebGPU.**
- source: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html | publisher: Godot Foundation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: limitation
- read directly. Listed alongside other unsupported web features.

**Godot's web export lists as unsupported: C# projects, low-level networking, AudioEffects and procedural audio generation, Forward+/Mobile rendering, WebGPU, and arbitrary fullscreen/cursor capture outside an input event context.**
- source: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html | publisher: Godot Foundation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: limitation
- **C# on web is still unsupported in 2026.** A solo dev who wants C# must use GDScript for a Godot web build.
- **No AudioEffects / procedural audio on web** is a real cost for a pinball game, where the audio is a large part of the feel.

**Threaded Godot web exports require SharedArrayBuffer and therefore cross-origin isolation via `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Godot offers two escapes: a single-threaded export (available since Godot 4.3) and a Progressive Web App mode that uses a service worker to simulate the headers without server control.**
- source: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html | publisher: Godot Foundation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: capability
- read directly. **This substantially defuses the classic "Godot web export breaks itch.io/GitHub Pages" complaint** — that complaint dates to Godot 4.0–4.2 when SharedArrayBuffer was mandatory. Verify-before-citing check performed: the limitation WAS fixed, in 4.3.

**The historical itch.io/SharedArrayBuffer problem is itself stale: itch.io added SharedArrayBuffer support (initially via an Origin Trial) for both Chrome and Firefox as of February 2023, making the pop-out-to-new-tab and dual-wasm workarounds largely unnecessary.**
- source: https://gist.github.com/nisovin/577e5596a36e899e8932747de1b7a353 | publisher: nisovin (GitHub Gist) | pub_date: 2023-02 | accessed: 2026-08-26 | confidence: medium | class: limitation
- read directly. Author's own caveat retained: enabling it "adds a lot of browser security restrictions that may affect your game, so you will want to test thoroughly."
- combined with the 4.3 single-threaded export, the hosting story for Godot web in 2026 is: **not a blocker, but threading requires either a host that sets COOP/COEP or the PWA service-worker mode.** Note this leaves GitHub Pages awkward — GitHub Pages does not let you set arbitrary response headers, so the PWA/service-worker route is the option there.

**Godot's docs recommend against Safari for web exports: "Safari has several issues with WebGL 2.0 support that other browsers don't have, so we recommend using a Chromium-based browser or Firefox if possible."**
- source: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html | publisher: Godot Foundation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: limitation
- read directly. **Direct conflict with the macOS browser requirement.** Godot's own documentation steers users away from the default macOS browser. This does not mean Safari fails, but Godot is declining to warrant it.

**Jolt Physics was incorporated into Godot as a built-in core module in version 4.4, and new projects use it as the physics engine by default.**
- source: https://docs.godotengine.org/en/stable/tutorials/physics/using_jolt_physics.html | publisher: Godot Foundation | pub_date: unknown (stable docs) | accessed: 2026-08-26 | confidence: high | class: version-compat
- read directly this run. **CORRECTION OF A CIRCULATING CLAIM:** an aggregated secondary source (gtstu.com) asserted Jolt "became the default in Godot 4.6 (January 2026)". Godot's own documentation says **4.4**. Prefer the primary source. It is possible 4.6 changed something adjacent (e.g. migration defaults for existing projects); that nuance was not resolved this run.

**Godot's Jolt integration has documented behavioral gaps vs Godot Physics: many joint properties (bias, damping, softness, restitution) are unsupported and emit warnings if set; single-body joints interpret reference frames differently and can produce inverted limits; collision margins shrink the shape rather than expand it; and Baumgarte stabilization applies only to position, not velocity, so it cannot overshoot but may take longer to resolve penetration.**
- source: https://docs.godotengine.org/en/stable/tutorials/physics/using_jolt_physics.html | publisher: Godot Foundation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: limitation
- read directly. **Joint restitution being unsupported is worth a second look for pinball** — flipper hinges and gates are joints, and bounce behavior on them matters.

**Godot's physics engine runs at a fixed rate defaulting to 60 iterations per second.**
- source: https://docs.godotengine.org/en/stable/tutorials/physics/physics_introduction.html | publisher: Godot Foundation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: capability
- read directly. Configurable via `physics_ticks_per_second`; a companion setting `max_physics_steps_per_frame` bounds catch-up steps.

**Godot documents a dedicated physics troubleshooting guide covering fast-moving-body tunneling, and CCD is per-body (`continuous_cd`) and off by default because of its cost.**
- source: https://docs.godotengine.org/en/4.7/tutorials/physics/troubleshooting_physics_issues.html | publisher: Godot Foundation | pub_date: unknown (4.7 docs) | accessed: 2026-08-26 | confidence: medium | class: capability
- caveat: surfaced via aggregator; the 4.7 troubleshooting page was not read directly this run.
- Jolt's own documentation describes the relevant motion qualities as Discrete (cheap, tunnels) vs LinearCast (sweeps the shape via CastShape after the discrete step) — for a small fast sphere you want the shape-cast quality.
- source: https://jrouwe.github.io/JoltPhysics/ | publisher: Jolt Physics (Jorrit Rouwe) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: capability

### 3. Unreal Engine — browser export

**Epic migrated HTML5 support out of the engine as of Unreal Engine 4.24 into a community-maintained Platform Extension; Unreal Engine 5 has no built-in HTML5/WebAssembly export target, and Epic has announced no plan to restore one.**
- source: https://forums.unrealengine.com/t/html5-support/1172997 | publisher: Epic Games (Unreal Engine Forums, staff response) | pub_date: unknown (post-4.24) | accessed: 2026-08-26 | confidence: medium | class: capability
- source: https://stackoverflow.com/questions/76291206/unreal-engine-5-support-html5 | publisher: Stack Overflow | pub_date: 2023-05 | accessed: 2026-08-26 | confidence: medium | class: capability
- caveat: both surfaced via aggregator; neither read directly this run. The claim is long-standing, consistent across many independent sources, and no counter-evidence surfaced. Confidence in the *direction* is high; confidence in "as of August 2026 nothing has changed" is medium because no 2026-dated primary source was retrieved.
- practical signature of the gap: HTML5 does not appear in File → Package Project, and command-line HTML5 targets fail as unknown/unsupported platform.

**Epic's documented path for running Unreal content in a browser is Pixel Streaming: the app runs natively on a GPU server and streams encoded video to the browser over WebRTC, with input sent back.**
- source: https://unrealcontainers.com/docs/use-cases/pixel-streaming | publisher: Unreal Containers (community documentation project) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: capability
- **Assessment for this decision: Pixel Streaming disqualifies Unreal for this project.** It requires per-session GPU server capacity, and it adds network round-trip latency to every input. A pinball game is a latency-critical twitch input loop (flipper response), and a solo developer cannot economically run GPU instances per concurrent player. Unreal should be scored as "no viable browser path" for this use case.

### 4. Bevy (Rust) and emerging options

**The latest Bevy release is 0.19, released 2026-06-19 (261 contributors, 1185 pull requests); preceded by 0.18 on 2026-01-13, 0.17 on 2025-09-30, and 0.16 on 2025-04-24.**
- source: https://bevy.org/news/ | publisher: Bevy Foundation | pub_date: 2026-06 | accessed: 2026-08-26 | confidence: high | class: version-compat
- read directly this run. **This corrected an aggregator answer that reported Bevy 0.14 (July 2024) as "the latest visible release" — that was a stale-index artifact.** Note the cadence: roughly 4 releases in 16 months.

**Bevy remains pre-1.0 in the 0.x series, where each minor release may introduce significant breaking changes to core ECS, rendering, input, asset, and plugin APIs; ecosystem plugins pin exact Bevy version ranges.**
- source: https://bevy.org/news/ | publisher: Bevy Foundation | pub_date: 2026-06 | accessed: 2026-08-26 | confidence: medium | class: limitation
- **Assessment for a solo developer on a multi-month project: this is the dominant risk with Bevy.** Four breaking releases in 16 months, each requiring migration of the project plus every physics/UI/audio plugin, is a recurring tax that competes directly with shipping.

**Bevy runs in the browser via WebAssembly using `wgpu`, which supports both WebGL2 and WebGPU (`Backends::BROWSER_WEBGPU`, enabled via the `webgpu` feature); WebGPU support landed in Bevy 0.11.**
- source: https://bevy.org/news/bevy-webgpu/ | publisher: Bevy Foundation | pub_date: unknown (0.11 era, ~2023) | accessed: 2026-08-26 | confidence: medium | class: capability
- source: https://docs.rs/bevy/latest/bevy/render/settings/struct.Backends.html | publisher: docs.rs (Bevy API docs) | pub_date: 2026 (latest) | accessed: 2026-08-26 | confidence: medium | class: capability
- **Bevy is the only candidate examined that has a real, non-experimental WebGPU path for the browser.** That is its distinguishing strength.

**Bevy's web target has documented limitations: no multithreading on web (limiting performance and causing audio glitches), and WebGL2-backed builds are capped, e.g. a maximum of 256 lights in 3D scenes.**
- source: https://bevy-cheatbook.github.io/platforms.html | publisher: Bevy Cheat Book (community, unofficial) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: limitation
- **freshness warning**: the Cheat Book is community-maintained and historically lags releases. This claim was NOT verified against Bevy 0.19. The no-multithreading-on-web constraint in particular may have changed. **Do not cite this against Bevy 0.19 without re-checking.**

**Bevy ships no built-in physics engine; physics comes from ecosystem crates, principally `bevy_rapier` (binding to the standalone Rapier engine, which syncs a separate physics world with Bevy's ECS) and Avian (ECS-native, successor to `bevy_xpbd`, described by ecosystem docs as the de facto ECS-native physics solution for Bevy).**
- source: https://taintedcoders.com/bevy/physics/rapier | publisher: Tainted Coders (community) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: capability
- source: https://taintedcoders.com/bevy/physics/avian | publisher: Tainted Coders (community) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: capability
- **This is a real structural finding regardless of source quality**: physics in Bevy is a third-party dependency with its own version-compatibility matrix against a fast-moving pre-1.0 engine. For a physics-heavy game that is the load-bearing dependency, this compounds the API-churn risk above.
- Rapier does support CCD; whether Rapier or Avian handles a small fast sphere at high tick rate well was **not established this run**.

### 5. Wildcards — other browser-3D options

**PlayCanvas is a web-first open-source 3D engine supporting both WebGL and WebGPU, with full 3D rigid-body physics powered by ammo.js (a WASM port of Bullet). Pricing: Free tier at $0/month with unlimited public projects; Personal ~$15/month; Organization ~$50 per seat/month.**
- source: https://playcanvas.com/ | publisher: PlayCanvas | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: capability
- source: https://playcanvas.com/plans | publisher: PlayCanvas | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: pricing
- source: https://playcanvas.com/products/engine | publisher: PlayCanvas | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: capability
- caveat: surfaced via aggregator, pages not read directly. **Pricing fails the ≤3-month freshness bar — re-verify before use.**
- **Why this matters for the decision**: PlayCanvas is the only candidate that is *web-native by design* (browser is the primary target, not an export) AND has shipping WebGPU. Its weakness for this project is physics: ammo.js/Bullet is an older engine than Jolt or PhysX, and Bullet's small-fast-sphere behavior would need its own investigation. It also has no free tier for private projects. **Recommend promoting PlayCanvas to a first-class candidate in round 2, not leaving it as a wildcard.**

**Defold is completely free with no licensing fee and no revenue share, protected under Swedish foundation law; it uses Bullet for 3D physics and Box2D for 2D, and added experimental WebGPU as an optional HTML5 graphics backend during 2025, expected to mature in 2026. An empty Defold HTML5 build is reported at ~1.14 MB.**
- source: https://defold.com/product/ | publisher: Defold Foundation | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: capability
- source: https://www.defold.com/2026/01/02/Defold-2025-Retrospective/ | publisher: Defold Foundation | pub_date: 2026-01-02 | accessed: 2026-08-26 | confidence: medium | class: capability
- caveat: surfaced via aggregator; the retrospective is a good primary source and **should be read directly in round 2**.
- assessment: Defold's runtime size is outstanding, but Defold is predominantly a 2D engine with 3D as a secondary capability, and its lighting toolset is not comparable to Unity/Godot for a visually rich playfield. Weak fit on the lighting requirement.

**Wonderland Engine is a C++/WebAssembly web engine using Jolt Physics for 3D rigid bodies, licensed free up to $120k/year revenue across all projects, then a 10% royalty.**
- source: https://wonderlandengine.com/pricing/ | publisher: Wonderland Engine | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: pricing
- caveat: surfaced via aggregator, not read directly; the Jolt-backend claim was hedged by the aggregator as "consistent with community knowledge" rather than sourced. **Both the physics backend and the royalty terms need direct verification.** If the Jolt claim holds, Wonderland is interesting — Jolt is the best-regarded of the available physics engines for this workload — but it is primarily a WebXR-focused engine and its WebGPU status is unclear.

**Cocos Creator offers multiple 3D physics backends (ammo.js, cannon.js, a built-in lightweight engine, and NVIDIA PhysX since version 3.1); the engine is free; WebGPU is not a stable headline backend.**
- source: https://docs.cocos.com/creator/3.0/manual/en/physics-3d/ | publisher: Cocos | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: capability
- source: https://www.cocos.com/en/post/cocos-creator-3-1-brings-physx-physics-and-multi-threading | publisher: Cocos | pub_date: unknown (3.1 era) | accessed: 2026-08-26 | confidence: low | class: capability
- caveat: surfaced via aggregator; version cited (3.0/3.1) is old and current-version status was not established. Low priority for this decision — documentation and community are heavily China-centric and the 3D lighting story is not competitive.

**Needle Engine's public data is genuinely thin: no clear WebGPU commitment, no advertised first-party physics backend (physics is stack-dependent on the underlying Three.js ecosystem, e.g. Cannon/Ammo), and no simply-quoted engine license price.**
- source: aggregator synthesis, no primary source retrieved | publisher: n/a | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: limitation
- **This is a reportable finding, not a gap**: the absence of clear public specification on physics and WebGPU is itself a reason to deprioritize Needle for a physics-critical project.

### 6. Evidence from practice — post-mortems and retrospectives

**A developer building a pinball table in Godot 4.7 documented their working physics configuration publicly: `physics_ticks_per_second` = 240 with `max_physics_steps_per_frame` = 32; Jolt velocity and position solver steps raised to 100; gravity z-component set to 0.03 to emulate table slope; ball mass 0.001–0.5 depending on desired behavior; flipper thrust 800.**
- source: https://forum.godotengine.org/t/godot-v4-7-pinball-table-build/107655 | publisher: Godot Forums (community) | pub_date: 2026 (4.7 era) | accessed: 2026-08-26 | confidence: medium | class: postmortem
- read directly this run. **The single most directly relevant practitioner datapoint found.** It confirms that a Godot 4.7 + Jolt pinball simulation is achievable, and gives concrete starting settings.

**The same developer reported specific failure modes and their fixes: flipper collisions using BoxShape3D behaved poorly and were replaced with HeightMapShape3D for directional control; the ball jammed in the tray requiring geometry rework and higher collision-mesh detail on the carousel; the plunger gate's one-way hinge joint buckled until gate mass was raised to 0.1; the spinner plate required its collision mesh converted to a "very thin pancake"; and flipper thrust had to be tuned carefully to prevent the ball being "gobbled". They also moved Jolt from separate threads back to single-threaded for performance.**
- source: https://forum.godotengine.org/t/godot-v4-7-pinball-table-build/107655 | publisher: Godot Forums (community) | pub_date: 2026 | accessed: 2026-08-26 | confidence: medium | class: postmortem
- read directly. **Note what this tells you about effort distribution: nearly every problem was collision-shape authoring and joint tuning, not renderer or engine choice.** This is a strong signal that engine selection is less determinative of schedule than the geometry/tuning work, for this genre.
- **Note also**: they moved Jolt to single-threaded *for performance*. Multithreaded physics was a net loss in their case.

**That same thread contains NO web-export metrics and no browser testing: the developer benchmarked only on native desktop hardware (Nvidia GeForce 2070/4060, Intel i7/i9).**
- source: https://forum.godotengine.org/t/godot-v4-7-pinball-table-build/107655 | publisher: Godot Forums | pub_date: 2026 | accessed: 2026-08-26 | confidence: high | class: postmortem
- **This absence is a finding.** The one credible pinball-in-Godot practitioner account is a native-desktop account. It does not validate the browser path.

**A community-run comparative benchmark repository exists comparing Godot and Unity performance, reportedly showing Unity ahead for scenes with 500+ rigid bodies and Godot competitive at moderate physics loads.**
- source: https://github.com/svprdga/godot-vs-unity-performance-benchmark | publisher: svprdga (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: performance-number
- **DO NOT CITE THE NUMBERS.** The repository was not opened this run; its date, methodology, engine versions, and whether it tests web builds at all are all unknown. It is listed only as a lead. The brief requires two independent sources for any performance number and this has zero verified ones.

**No credible, numbers-bearing 6–12 month developer post-mortem about shipping a physics-heavy 3D game to the browser was located for ANY of these engines.**
- source: n/a — negative result from targeted search | accessed: 2026-08-26 | confidence: high | class: postmortem
- What the searches surfaced instead was a layer of low-quality SEO comparison content (engineranked.com, tech-insider.org, godotlearning.com, app.cinevva.com, generalistprogrammer.com) publishing confident-sounding but unsourced figures — e.g. "Godot web builds ~5–9 MB compressed empty runtime, real projects 15–25 MB; Unity WebGL empty builds ~8 MB+, real games 30–50 MB+". **These numbers are recorded here as UNVERIFIED and must not enter a decision document.** They appear across multiple sites in mutually-citing form, which is a hallmark of content-farm propagation rather than independent confirmation.
- **This is the most important epistemic finding in the digest.** The practical build-size and load-time reality of Unity Web and Godot web in 2026 is not well documented in public, verifiable sources. It should be established empirically — by building a trivial 3D scene in each and measuring — rather than researched further.

---

## Comparison table

| Engine | Latest version (date) | Web export status | Physics | License / cost (solo) | Small-team fit |
|---|---|---|---|---|---|
| **Unity 6** | 6.3 LTS (2025-12-04); 6.0 LTS EOS Oct 2026; 6.4 non-LTS Mar 2026 | Unity Web on **WebGL 2**, supported on Chrome/FF/Safari/Edge, Win/mac/Linux. **WebGPU experimental** in 6.3. Safari: no WebGL2 <15, no IndexedDB in iframe, open perf issue | **PhysX** (version not publicly stated). 4 CCD modes incl. sweep-based Continuous Dynamic — the right tool for a fast ball. Speculative CCD documented as failing on mid-step velocity spikes | **Free** (Personal) under $200K rev+funding. No runtime fee. Pro ~$2,200/seat/yr above that *(2025 figure — reverify)* | Strong. Largest asset store, most tutorials, best lighting tooling of the WebGL-capable set |
| **Godot 4** | 4.7.2 (2026-08-18) | WebGL 2 / **Compatibility renderer only** — Forward+ and Mobile NOT supported on web. **No WebGPU.** No C#. No AudioEffects/procedural audio. Docs steer away from Safari. Threads need COOP/COEP or PWA mode; **single-threaded export since 4.3** removes the hard SharedArrayBuffer dependency | **Jolt in core since 4.4**, default for new projects. Per-body CCD (off by default). Documented joint gaps (bias/damping/softness/**restitution** unsupported). Default 60 Hz, configurable | **Free**, MIT, no royalty, no threshold | Good. Fast iteration, small runtime. GDScript-only on web is the catch. **Web lighting ceiling is the real problem for a playfield** |
| **Unreal 5** | n/a for this purpose | **None.** HTML5 removed from engine at 4.24; no UE5 target; no announced plan. Only Pixel Streaming (server-side render + WebRTC video) | Chaos | Free under $1M lifetime rev (not verified this run) | **Disqualified for browser.** Pixel Streaming needs per-player GPU servers and adds network latency to flipper input |
| **Bevy** | 0.19 (2026-06-19) | wasm via `wgpu`, **real WebGPU path** (`BROWSER_WEBGPU`, since 0.11) plus WebGL2 fallback. Community docs report no web multithreading + 256-light WebGL cap — **unverified against 0.19** | **None built in.** Rapier (`bevy_rapier`) or Avian (ECS-native). Both third-party, both version-pinned to Bevy | **Free**, MIT/Apache-2.0 | **Weak for this project.** Pre-1.0, ~4 breaking releases in 16 months, and the physics layer is a third-party dep tracking a moving engine. Highest churn tax of any candidate |
| **PlayCanvas** | not established | **Web-native by design.** WebGL2 + **WebGPU shipping** | ammo.js (Bullet) — older engine than Jolt/PhysX | Free tier ($0, public projects only); Personal ~$15/mo; Org ~$50/seat/mo *(reverify)* | Promising — **promote to candidate in R2.** Physics quality is the open question |
| **Defold** | not established | HTML5 WebGL, **experimental WebGPU** added 2025. ~1.14 MB empty build | Bullet (3D), Box2D (2D) | **Free**, no fees, no royalty, foundation-protected | Weak fit — predominantly a 2D engine; playfield lighting not competitive |
| **Wonderland** | not established | WebGL/WebXR-focused; WebGPU status unclear | **Jolt** *(unverified)* | Free to $120k/yr, then **10% royalty** *(unverified)* | Niche (WebXR-first). Verify Jolt claim before considering |
| **Cocos Creator** | not established | WebGL; WebGPU not mainstream | ammo.js / cannon.js / built-in / PhysX (since 3.1) | Free | Low priority — docs/community China-centric, lighting not competitive |

---

## Leads worth chasing

1. **Build a two-engine spike instead of researching build size further.** The public data on Unity Web and Godot web build size and load time is content-farm noise. A trivial 3D scene built in Unity 6.3 and Godot 4.7.2, measured on Chrome and Safari on both Windows and macOS, would settle in a day what further searching cannot settle at all.
2. **Read the Defold 2025 Retrospective directly** (https://www.defold.com/2026/01/02/Defold-2025-Retrospective/) — a dated, first-party engine retrospective is exactly the source class this brief wants, and it was only reached via aggregator.
3. **Verify Unity pricing directly.** `unity.com/pricing` returned 403 to automated fetch. A human should open it, or try `unity.com/products/pricing-updates`. The $2,200/seat figure is from January 2025 and fails the freshness bar.
4. **Check the live status of the Unity Safari WebGL performance issue** on issuetracker.unity3d.com. If it is fixed, the strongest argument against Unity Web on macOS evaporates.
5. **Resolve the Godot Jolt version discrepancy** (docs say 4.4; a secondary source claims 4.6 made it default). Check the Godot 4.4 and 4.6 release blog posts. Something may have changed at 4.6 regarding existing-project migration defaults.
6. **Investigate the Godot web lighting ceiling concretely.** What *can* the Compatibility renderer do for a pinball playfield — baked lightmaps plus a few realtime lights may be entirely sufficient for a table under a glass top. This may be a non-issue in practice, and it is currently the biggest strike against Godot's web path.
7. **PlayCanvas + ammo.js small-fast-sphere behavior.** PlayCanvas is otherwise the best-positioned web-native option; Bullet's CCD quality for this workload is the deciding unknown.
8. **Verify Wonderland's physics backend.** If it genuinely uses Jolt in a WASM-native web engine, that is the most technically apt combination found — but the claim is currently unsourced, and the 10% royalty above $120k is a material term.
9. **Open the godot-vs-unity-performance-benchmark repo** and check its methodology, dates, engine versions, and whether it covers web builds. Currently unusable as evidence.
10. **Search for pinball-specific prior art in Unity WebGL.** The Godot pinball thread was found; the Unity equivalent was not searched for and likely exists.

---

## Looked for but could not find

- **Any genuine 6–12-month post-mortem, in any engine, about shipping a physics-heavy 3D game to the browser with real numbers.** This was question 6 and it came back empty. The search surfaced SEO comparison articles rather than practitioner retrospectives. Reported as thin because it is thin.
- **Primary-source build size and load time figures for Unity Web or Godot web in 2026.** Every number encountered traces to unsourced comparison blogs. None met the two-independent-sources bar.
- **The PhysX major version in Unity 6.** Unity does not expose it in the editor or the manual. This appears to be genuinely unavailable publicly, not merely unfound.
- **Any verified performance number, for any engine, in a browser.** Zero performance-number claims in this digest meet the brief's two-source requirement. The `performance-number` class is effectively empty — a notable outcome for a viability assessment.
- **Confirmation of Bevy's current web threading and light-count limits against version 0.19.** Only the community Cheat Book was found, undated and version-ambiguous.
- **A 2026-dated primary Epic source on Unreal browser export.** The conclusion rests on 4.24-era Epic statements plus consistent secondary sources. Directionally certain, but not freshly confirmed.
- **Current versions for PlayCanvas, Wonderland, Needle, and Cocos Creator.** None established; all fail the ≤1-month version-freshness bar and are reported as wildcards only.
- **Direct reads of `unity.com/pricing` (HTTP 403) and the Godot 4.6 release announcement (HTTP 404 on the guessed URL).** Both blocked this run.
