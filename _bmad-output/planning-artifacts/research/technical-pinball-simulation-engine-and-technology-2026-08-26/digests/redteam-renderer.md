# Red team: web-native renderer + baked lightmaps

## Verdict

**WEAKENED** — the conclusion is a bundle of four claims, and they do not stand or fall together. Two survive the attack well (web-native over a game-engine web export; pre-baked per-light-group additive lightmaps *for pinball specifically*). One is **refuted**: naming Three.js as the pick is not supported by anything I found this run, and the evidence points at Babylon.js. One is **load-bearing and no longer obvious**: the WebGL2 baseline. The baking decision is not independently justified — it is *downstream* of the WebGL2 choice, because both Three.js `ClusteredLighting` and Babylon's clustered forward path are **WebGPU-only**. Choose WebGPU (which on a Windows+macOS-desktop-only target is now largely available) and the light-count argument for baking evaporates: a Babylon clustered-forward benchmark shows 2,000 dynamic lights at 1080p/60fps on an RTX 4070 laptop. Baking still buys indirect bounce and soft shadows that clustered lighting does not, but the conclusion as written asserts the wrong reason. Separately, the whole premise — browser as the target for a "visually rich 3D simulation" — is the weakest link and I found no evidence supporting it commercially.

Two important corrections to the attack brief itself, made in good faith against my own case: (1) the brief asserts "baked lighting is point-of-view dependent." For standard UV lightmaps this is **false** — diffuse irradiance is view-independent. (2) However, the actual prior art for this exact architecture (`vpx_lightmapper`) **is** strictly camera-dependent, because it projects UVs from the camera. So the camera-lock risk is real only if you copy VPX's specific implementation, not if you use conventional lightmap UVs. The conclusion does not say which, and that ambiguity is a genuine gap.

---

## Strongest arguments the conclusion is WRONG

### 1. The baking rationale is circular — clustered lighting is WebGPU-only, so "WebGL2 baseline" is what forces baking, not any property of pinball

Three.js documents `ClusteredLighting` as overwriting the default lighting system **in `WebGPURenderer`** — it does not run on `WebGLRenderer`. Defaults: `maxLights` 1024, `tileSize` 32, `zSlices` 24, `maxLightsPerCluster` 64. Babylon's clustered-forward benchmark explicitly targets WebGPU with **no WebGL2 fallback**. So on WebGL2 you are stuck with tens of lights and baking is nearly forced; on WebGPU you are not. The conclusion presents baking as the considered answer to a lighting problem when it is really a consequence of an unexamined API-baseline choice.

- source: https://threejs.org/docs/pages/ClusteredLighting.html | publisher: Three.js (official docs) | pub_date: unknown (current) | accessed: 2026-08-26 | confidence: high
- source: https://forum.babylonjs.com/t/clustered-forward-benchmark/61468 | publisher: Babylon.js Forum (author: Joshua_Brewster) | pub_date: 2025-11 | accessed: 2026-08-26 | confidence: medium

### 2. 2,000 dynamic lights at 1080p/60fps is measured, not theoretical — the light-count case for baking is dead on WebGPU

Babylon clustered forward, RTX 4070 laptop: **60fps at 1080p with ~2,000 lights**; ~300–500 lights near 4K. Methodology stated: worker + OffscreenCanvas, progressive 256-light steps, 50fps average over 240 frames. A pinball playfield has on the order of 50–150 lamps. That is an order of magnitude inside budget. Independently, a WebGPU clustered/deferred implementation reports 16,384 lights at ~401µs shading + 2.85ms binning versus 54.9ms unclustered (RTX 4090).

- source: https://forum.babylonjs.com/t/clustered-forward-benchmark/61468 | publisher: Babylon.js Forum (Joshua_Brewster) | pub_date: 2025-11 | accessed: 2026-08-26 | confidence: medium
- source: https://discourse.threejs.org/t/clustered-rendering-on-webgpu/81042 | publisher: Three.js Discourse (author: Usnul) | pub_date: 2025-04 (updated 2025-06) | accessed: 2026-08-26 | confidence: medium

### 3. Three.js is the wrong pick — and there is a direct measured datapoint against it on exactly this workload

In the same Three.js Discourse thread, the author benchmarks a **130-light candle scene** (16 torches, 22 lanterns, 91 candles — structurally very close to a pinball playfield's lamp count): his WebGPU engine hits **96 FPS** with CSM/SSR/SSAO/bloom/TAA; **Three.js hits 24 FPS**. Caveat: this is the author comparing against his own engine, so treat as directional, not neutral. Compounding it, Three.js ships **no physics** — for a simulation whose entire value is ball dynamics, you would hand-integrate Rapier/Jolt/cannon-es and hand-maintain transform sync, whereas Babylon ships a first-party Havok plugin. Three.js is a rendering library; a pinball sim is engine-shaped work.

- source: https://discourse.threejs.org/t/clustered-rendering-on-webgpu/81042 | publisher: Three.js Discourse (Usnul) | pub_date: 2025-06 | accessed: 2026-08-26 | confidence: medium
- source: https://threejs.org/docs/pages/ClusteredLighting.html | publisher: Three.js (official docs) | pub_date: unknown | accessed: 2026-08-26 | confidence: high

### 4. On a Windows+macOS *desktop* target, WebGL2-only leaves real capability unclaimed

caniuse puts WebGPU at **85.56% global usage** (data July 2026). Chrome/Edge: supported from 113. Firefox: **141 enabled WebGPU by default on Windows** (Mozilla's own release notes), with macOS Apple Silicon following in a later release. Safari 26+ shows partial support. Since the stated target excludes mobile and Linux — the two weakest surfaces — WebGL2-only is a more conservative floor than the target requires. That said, see the counter-evidence in the next section: MDN still classes WebGPU as **not Baseline**, so "WebGPU-only" would be over-correcting.

- source: https://caniuse.com/webgpu | publisher: caniuse.com | pub_date: 2026-07 (usage data) | accessed: 2026-08-26 | confidence: high
- source: https://www.firefox.com/en-US/firefox/141.0/releasenotes/ | publisher: Mozilla | pub_date: 2025-07 | accessed: 2026-08-26 | confidence: high

### 5. The bake pipeline is a documented productivity sink, and the one real reference implementation is self-described as pre-alpha with no shadows

`vpx_lightmapper` — the closest existing implementation of exactly this architecture — carries the author's own disclaimer: **"pre-alpha state, with no support"**, "bugs more or less everywhere", a hobby project with "no dedicated ressources behind this project", requiring "the latest, not yet released, build of Visual Pinball X". It also documents **no shadowing support** (VPX lacks the capability) and that bakes "won't work well on objects or lights that can be moved". On iteration cost, Unity practitioners report bakes of hours: one thread is titled "Lightmap baking taking too long around 4-5 hours". Lightmap memory is non-trivial too — a Unity discussion treats ~10× 2048² maps (≈160MB uncompressed RGBA8) as "on the 'a lot' side", and this architecture multiplies texture count by the number of light groups.

- source: https://github.com/vbousquet/vpx_lightmapper | publisher: GitHub (vbousquet) | pub_date: unknown (357 commits, active) | accessed: 2026-08-26 | confidence: high
- source: https://discussions.unity.com/t/lightmap-baking-taking-too-long-around-4-5-hours/762402 | publisher: Unity Discussions | pub_date: unknown | accessed: 2026-08-26 | confidence: medium

### 6. The killer premise: no full-scale, AAA-visual 3D game ships as a pure browser build, and browser economics are ad-portal economics

I could not find a single named commercial browser game at "visually rich 3D simulation" fidelity. Unity's *own* web-facing showcase surfaces small-scale titles ("Control Yourself", "Dwarf Legacy", "Tic Tactic", "Paul's Cube Roll") with tens of thousands of plays — demoware scale — while its high-fidelity showcase titles (Genshin Impact, Tainted Grail) are native builds, not browser builds. Meanwhile Unity's baseline engine tax for web is non-trivial: an **empty** Unity 6 URP web build measures **~7–11MB compressed** (Aras Pranckevičius, formerly Unity's graphics lead — a credible primary). The browser channel monetizes through portal ad revenue share, which is casual/hypercasual economics, not premium-simulation economics. If the product is premium-shaped, browser-first is the wrong distribution premise and every downstream rendering decision inherits the error.

- source: https://play.unity.com/en/showcases | publisher: Unity Technologies | pub_date: unknown (current) | accessed: 2026-08-26 | confidence: medium
- source: https://gist.github.com/aras-p/740c2d4f9977ce92b7de72b1394dd365 | publisher: GitHub Gist (Aras Pranckevičius) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium

### 7. Unity Web is *not* obviously disqualified — the conclusion's dismissal of it is asserted, not argued

Unity ships WebGPU as an official backend (experimental through 6.1/6.3, promoted out of experimental in 6.6, with WebGL2 remaining the default and WebGPU opt-in via the graphics API list). Unity's WebGPU device-filter defaults name concrete minimums (Chromium ≥146, Firefox ≥152, Safari ≥26) with automatic WebGL2 fallback — i.e. the exact dual-baseline strategy the conclusion would have to build by hand. Unity Web's real cost is payload and load time, not renderer quality, and the conclusion never engages with that trade.

- source: https://docs.unity3d.com/6000.3/Documentation/Manual/WebGPU.html | publisher: Unity Technologies | pub_date: unknown (6000.3 docs) | accessed: 2026-08-26 | confidence: high
- source: https://discussions.unity.com/t/webgpu-out-of-experimental-in-unity-6-6/1734694 | publisher: Unity Discussions (Unity staff post) | pub_date: unknown (post-6.6) | accessed: 2026-08-26 | confidence: medium

---

## Where the conclusion holds up despite the attack

**Baked per-light-group additive compositing is the *documented, shipped* architecture for virtual pinball.** This is the strongest confirmation I found and I tried hard to break it. `vpx_lightmapper` implements precisely what the conclusion describes: define **light groups**, bake one map per group in Blender, and at runtime VPX "renders the base bake, then each lightmap is added, modulated by its intensity and color." It further optimizes per light group by *removing faces that never receive light from that group*. Lamp state (ROM lamp matrix, GI dimming, scripted fades) drives only a scalar intensity and colour per layer. This is not a speculative design — it is the working approach in the dominant virtual-pinball platform.
- https://github.com/vbousquet/vpx_lightmapper | GitHub (vbousquet) | accessed 2026-08-26 | high

**Attack #4 (camera freedom) largely failed.** Visual Pinball X's own `View Setup.md` documents a perspective camera for desktop and a window/cabinet projection for cabinets — i.e. a **pre-configured static POV per table**, not an in-play free camera. VR in VPX and Future Pinball/BAM is a *fixed cabinet pose* plus head tracking, with "Force Arcade Mode"/"Static Cam" required. And Pinball FX players in community threads consistently self-report preferring the least-moving presets ("I am not a fan of the action cams either… 5 has the least amount of movement"; "#2 is the best full picture mode"). The fixed-camera assumption is well supported by how the genre is actually played.
- https://github.com/vpinball/vpinball/blob/master/docs/View%20Setup.md | GitHub (vpinball) | accessed 2026-08-26 | high
- https://www.reddit.com/r/PinballFX3/comments/reoie0/whats_your_camera_view_and_why/ | Reddit r/PinballFX3 | accessed 2026-08-26 | medium (community anecdote)

**WebGL2 as *a* baseline is still defensible — MDN does not consider WebGPU Baseline.** MDN's WebGPU API page carries an explicit banner: *"Limited availability — This feature is not Baseline because it does not work in some of the most widely-used browsers."* Combined with caniuse showing Safari at partial support and Firefox flagged, an argument for a WebGL2 floor with WebGPU as progressive enhancement survives. What does *not* survive is WebGL2 as the **only** path.
- https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API | MDN / Mozilla | accessed 2026-08-26 | high

**Clustered lighting is not a substitute for baking, only for light count.** Clustered forward gives you many *direct* lights. It does not give indirect bounce, colour bleed, or contact-soft shadows on static geometry. If the visual goal is "visually rich," a bake still earns its place — the conclusion is right about the artifact and wrong about the justification.

---

## What I searched for and could NOT find (failed attacks)

- **No named, credible commercial browser 3D game at simulation fidelity.** Candidate names surfaced (Shell Shockers, 1v1.LOL, Madalin Stunt Cars, Venge.io) but I found **no primary source attributing engine, revenue, or frame rate** to any of them this run. Treat as unverified. This is an absence-of-evidence finding that cuts *against* the browser premise, not for it.
- **No postmortem comparing browser vs Steam revenue for the same 3D title.** Repeated searching produced only platform-level generalities. The comparison does not appear to exist publicly.
- **No WebGL2 clustered-lighting path in either engine.** I looked specifically for a WebGL2 fallback for Three.js `ClusteredLighting` and for Babylon's clustered forward. Three.js docs are explicit that it is WebGPURenderer-only; the Babylon benchmark states WebGPU-only with no WebGL2 fallback. The Babylon clustered-lighting doc page itself **failed to fetch usable content** (returned an empty docs shell), so Babylon's WebGL2 position is confirmed only indirectly — a real gap in my evidence.
- **MDN's WebGPU browser-compatibility table did not render** through fetch; I have the Baseline banner but not per-version Firefox/Safari rows from MDN directly. Firefox versioning is sourced from Mozilla release notes instead; the macOS Apple Silicon version number (145/147) rests on aggregator claims I could **not** confirm against a primary Mozilla release note, so I am not asserting it.
- **No credible practitioner account of Unity Web load times.** Every "15–40MB / 3–15s TTFF" figure traced to sites with no named author and no stated methodology (abratabia.com, cinevva.com, genzopia.com, generalistprogrammer.com, testmuai.com, localmode.dev, utsubo.com, pistack.xyz, revolgames.co, maxed.wiki). **Discarded per epistemics.** The only Unity web build-size number I retained is Aras Pranckevičius's gist. Note that several of these SEO sites also asserted "WebGPU is Baseline in 2026" — which MDN directly contradicts. Do not let those numbers into the research corpus.
- **No lightmap memory budget from a shipped title.** Only forum rules of thumb. The "~160MB is a lot" figure is one Unity forum poster's judgement, not a measured shipping budget.
- **No evidence on Pinball M's camera system.** Nothing primary; excluded rather than inferred.

---

### Net recommendation to the parent

Keep: pre-baked per-light-group additive lightmaps (strong prior art, right for the genre) and the fixed-camera assumption (well supported).
Change: **Three.js → Babylon.js** (built-in Havok physics, mature WebGPU engine, and one adverse measured datapoint against Three.js on a comparable many-light scene).
Re-decide: **WebGL2-only → WebGL2 floor + WebGPU progressive enhancement.** State explicitly which is primary, and note that choosing WebGPU changes the lighting calculus.
Resolve before proceeding: **standard UV lightmaps or camera-projected UVs?** The conclusion is silent, and VPX's implementation — the model being copied — uses camera-projected UVs, which really does lock the camera and rules out VR head-tracking.
Validate separately: the **browser-first premise**. It is the least-evidenced part of the whole conclusion.
