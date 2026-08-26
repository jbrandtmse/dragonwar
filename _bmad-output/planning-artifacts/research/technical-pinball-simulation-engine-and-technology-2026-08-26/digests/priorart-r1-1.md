# Digest: Prior art & the rest of the machine (round 1)

Scope note: all claims below are evidenced from sources retrieved on 2026-08-26. Where a number came only from an aggregator's synthesis and I could not trace it to a primary source, it is marked `confidence: low` and labelled as unverified. Effort estimates in particular are called out as **not sourced**.

---

## Findings

### 1. Existing simulations

**Visual Pinball X is a C++ pinball table editor and simulator maintained on GitHub by the `vpinball` org, with DirectX, OpenGL, and bgfx rendering backends, and it uses Visual Basic Script for table game logic.**
- source: https://github.com/vpinball/vpinball | publisher: vpinball (GitHub) | pub_date: unknown (repo, active) | accessed: 2026-08-26 | confidence: high | class: prior-art

**VPX ships "standalone" builds for Windows (x86), Linux (x86/Arm, incl. Raspberry Pi and RK3588), macOS, iOS/tvOS, and Android — but the repository README does not mention a web/WASM target.**
- source: https://github.com/vpinball/vpinball | publisher: vpinball (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: prior-art
- Implication: there is no official browser build of the realism-leading open simulator. A browser 3D pinball is not a "port the good one" problem.

**Visual Pinball is source-available freeware, not OSI open source: Visual Pinball 9.0.7 (2010) released its source under a license allowing free non-commercial use, modeled on the original MAME license; Wikipedia describes the project as "freeware and source-available."**
- source: https://en.wikipedia.org/wiki/Visual_Pinball | publisher: Wikipedia | pub_date: unknown (accessed revision) | accessed: 2026-08-26 | confidence: medium | class: legal-fact
- Consequence: VPX physics code cannot be safely embedded in a commercial product. Treat VPX as a **behavioural reference**, not a code source. (Confidence medium because I read this via aggregator citation, not the LICENSE file itself — see "could not find".)

**Visual Pinball X was released in December 2015 with significant improvements to graphics and the physics engine over VP9.**
- source: https://en.wikipedia.org/wiki/Visual_Pinball | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: prior-art

**`freezy/VisualPinball.Engine` ("VPE") is a separate, genuinely open-source Unity implementation of Visual Pinball licensed GPL-3.0 (relicensed from GPL-2.0); a contributor states GPL-3 was chosen specifically to prevent use in closed-source commercial Unity games.**
- source: https://github.com/freezy/VisualPinball.Engine | publisher: freezy (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: legal-fact
- source: https://discussions.unity.com/t/open-source-pinball-simulator/814312 | publisher: Unity Discussions | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: legal-fact
- Consequence: VPE is readable and copyable **only** if our project is GPL-compatible. Its *documentation* (see art pipeline below) is usable regardless.

**`vpdb/vpx-js` is a TypeScript port of the Visual Pinball player to the browser, GPLv2, rendering through an abstraction layer with a three.js adapter, with GLTF export and Draco mesh compression; its README states it "uses the same physics code than Visual Pinball. That means the gameplay is identical," while scripting is incomplete — "Work on scripting has begun with the wiring set up and the default table script working," with no JavaScript PinMAME.**
- source: https://github.com/vpdb/vpx-js | publisher: vpdb (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: prior-art

**vpx-js is dormant: its most recent commit on master is 12 November 2020 ("release: v1.3.4"), with prior commits in June, May, and April 2020.**
- source: https://github.com/vpdb/vpx-js/commits/master | publisher: vpdb (GitHub) | pub_date: 2020-11 | accessed: 2026-08-26 | confidence: high | class: prior-art
- This directly contradicts aggregator claims that vpx-js is "actively maintained through 2024–2025." **It is the single most relevant piece of prior art for a browser 3D pinball — and it is roughly six years stale, GPLv2, and never finished its scripting layer.** That is a finding, not a footnote.

**Pinball FX (Zen Studios) is actively supported into 2026 across Steam, Epic, PS5, Xbox Series X|S and Switch, free to download with tables sold as DLC; Zen has announced that no new tables ship on PS4/Xbox One from April 2026 and Seasons support on those platforms ends 1 June 2026. Pinball FX3 on Steam is being rebranded "Pinball FX Classic."**
- source: https://zenstudios.com/news/important-pinball-updates/ | publisher: Zen Studios | pub_date: unknown (2025–2026) | accessed: 2026-08-26 | confidence: medium | class: prior-art

**Pinball M is Zen Studios' active horror-themed companion platform to Pinball FX, on Steam, PlayStation, Xbox, Switch and Epic, and is named in Zen's 2026 content announcements alongside Pinball FX and Pinball FX VR.**
- source: https://zenstudios.com/news/pinball-bites-season-4-episode-1-huge-table-announcements/ | publisher: Zen Studios | pub_date: unknown (2026) | accessed: 2026-08-26 | confidence: medium | class: prior-art

**Realism benchmark: Pro Pinball Ultra (Barnstorm Games) is the title most often named as the realism gold standard among commercial sims — a Steam forum participant states "Pro Pinball Ultra has without a doubt the most realistic physics of any pinball video game" — while VPX is described by players as "a lot less floaty and bouncy than FX3, but still more floaty and bouncy than a real pinball machine."**
- source: https://steamcommunity.com/app/442120/discussions/0/1520386297686978881/ | publisher: Steam Community | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: prior-art
- source: https://www.reddit.com/r/virtualpinball/comments/1mfcgr4/what_is_the_best_pinball_video_game_when_it_comes/ | publisher: Reddit r/virtualpinball | pub_date: 2025-08 (thread id suggests) | accessed: 2026-08-26 | confidence: low | class: prior-art
- **This is forum opinion, not measurement.** It is the *only* form of "realism ranking" evidence I found. There is no benchmark, no instrumented comparison, no published methodology. Report it as community consensus, weight it accordingly. Note also that Pro Pinball's realism reputation is confounded: it was a fixed, tiny table set with one studio tuning both engine and content, whereas VPX realism is per-table-author.

**VPX physics quality is table-dependent, not engine-fixed: tables carry their own scripts and parameters for flipper strength, elasticity and friction, so any "VPX realism" judgment is really a judgment about a specific table's tuning.**
- source: https://en.wikipedia.org/wiki/Visual_Pinball | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: prior-art
- Design consequence for us: physics realism is substantially a **tuning and authoring problem**, not only an engine problem.

**`francisdb/oss-virtual-pinball` is a curated list of open-source virtual pinball projects; Future Pinball, Pinball FX, Pro Pinball Ultra and Unit3D Pinball do not appear on it, consistent with all four being closed source.**
- source: https://github.com/francisdb/oss-virtual-pinball | publisher: francisdb (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: prior-art

**Other browser 3D pinball found: `patrick-s-young/pinball-xr`, a three.js + cannon-es pinball web app with WebXR support.**
- source: https://github.com/patrick-s-young/pinball-xr | publisher: patrick-s-young (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: prior-art
- I did not open this repo; treat scale/quality as unknown. It appears to be a demo-scale project, not a simulator.

**No dedicated WebGPU-native open-source pinball project of comparable maturity to vpx-js was surfaced. three.js ships a WebGPU renderer, but the existing pinball projects are WebGL-based.**
- source: https://threejs.org/ | publisher: three.js | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: capability
- Class this as absence-of-evidence: I searched for it and it did not turn up. That is genuinely informative — **the browser 3D pinball field is empty at the top.**

---

### 2. Rules engine

**MPF models a "mode" as a self-contained bundle of YAML config with its own file at `modes/<name>/config/<name>.yaml`, declaring `start_events`, `stop_events` and a numeric `priority`; when start events fire MPF loads that mode's config (shots, timers, players) into the running game and unloads it on stop.**
- source: https://missionpinball.org/latest/game_logic/modes/ | publisher: Mission Pinball Framework | pub_date: unknown (latest docs) | accessed: 2026-08-26 | confidence: high | class: architecture-pattern
- source: https://missionpinball.org/latest/config/mode/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern

**Mode `priority` resolves conflicts when several active modes want to handle the same event — MPF documents this as "mode layering."**
- source: https://missionpinball.org/latest/game_design/mode_layering/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern
- **This is the pattern to steal.** A prioritized stack of dynamically loaded/unloaded rule bundles is precisely how you avoid the monolithic-script trap. The same physical switch resolves to different behaviour depending on which modes are on the stack and in what order.

**A "shot" in MPF is a switch, sequence of switches, or event representing a target the player hits, declared in a `shots:` section, and it emits events such as `shot_<name>_hit` when its state changes. Shots are mode-scoped, so the same physical ramp can score 1,000 points in a base mode and a jackpot in a multiball mode by being defined separately in each mode.**
- source: https://missionpinball.org/latest/game_logic/shots/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern
- source: https://missionpinball.org/latest/config/shots/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern

**`shot_profiles:` are reusable state-machine templates: a named list of `states`, each optionally bound to a light show — e.g. a profile with `unlit` (show: "off") and `lit` (show: "on") states, which individual shots reference by name.**
- source: https://missionpinball.org/latest/config/shot_profiles/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern
- Note the coupling that MPF *deliberately* makes: shot state and its lighting presentation are declared together, but both are separate from the physics that detected the hit.

**`shot_groups:` treat several shots as a meta-state-machine with collective state and group-level events — the documented example declares `shots`, `rotate_left_events: sw_left_flipper`, `rotate_right_events: sw_right_flipper`, `reset_events`, `enable_events: ball_started`, `disable_events: ball_ending`, implementing the classic rotating-lanes rule with no imperative code.**
- source: https://missionpinball.org/latest/config/shot_groups/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern

**MPF's rules "engine" is an event bus plus a family of declarative "config players" — `event_player:` maps an incoming event to further posted events, with siblings like `variable_player:`, `show_player:` and `light_player:` handling scoring, shows and lights respectively.**
- source: https://missionpinball.org/latest/config_players/event_player/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern
- The architectural lesson for us, stated plainly: **physics emits switch events; the rules layer is a pure function of events → state → events → presentation.** Nothing in the MPF rules layer knows about a ball's velocity. That separation is what makes it testable headlessly.

**MPF's own developer documentation describes generic internal state-machine classes backing these YAML-declared devices — i.e. YAML front-end, Python state-machine backend.**
- source: https://developer.missionpinball.org/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: architecture-pattern

**By contrast, VPX rules are written in VBScript embedded in the `.vpx` binary, and real tables reach thousands of lines — an author's public writeup of the "Teacher's Pet" table explicitly cites a 3,500+ line single table script.**
- source: https://www.engineersneedart.com/blog/teacherspet/teacherspet.html | publisher: Engineers Need Art (table author blog) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: architecture-pattern

**VPX authors describe the resulting maintainability problem in their own words — a VPForums thread frames copy-pasting shared logic into every table script as a maintenance problem, and the community workaround is to keep the real script in an external `.vbs` file loaded by a one- or two-line stub in the table.**
- source: https://www.vpforums.org/index.php?showtopic=53137 | publisher: VPForums | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: architecture-pattern

**A parallel `vpx-standalone-scripts` repository exists specifically to hold sidecar `.vbs` scripts that override embedded table scripts for non-Windows VPX builds — evidence that the embed-the-script-in-the-binary decision has ongoing structural cost.**
- source: https://github.com/jsm174/vpx-standalone-scripts | publisher: jsm174 (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: architecture-pattern

**Microsoft has announced the deprecation and end of VBScript in Windows, which the virtual pinball community has publicly flagged as a concern for VPX's scripting engine.**
- source: https://www.reddit.com/r/virtualpinball/comments/1d1onwa/microsoft_is_killing_vbscript/ | publisher: Reddit r/virtualpinball | pub_date: 2024-05 (thread id suggests) | accessed: 2026-08-26 | confidence: low | class: prior-art

> **Synthesis for the decision:** the two credible reference architectures are *opposites*, and the comparison is unusually clean. MPF = declarative, event-driven, mode-layered, data-first, physics-agnostic, and it is what people building **real machines** use. VPX = imperative monolithic scripts inside a binary, and its own community has built escape hatches around it. Build the rules layer as MPF-shaped data (mode stack with priorities, shots with profiles, event bus, config-player-style declarative bindings) and keep it in a separate module from the physics tick. Nothing found this round argues for the VPX approach.

---

### 3. Light shows

**MPF "shows" are YAML files of timed steps; each step has a `duration` and a `lights:` block assigning colours to named lights — e.g. four 500ms steps cycling `l_arrow1` through green, yellow, red, off.**
- source: https://missionpinball.org/latest/config/light_player/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern

**Shows are parameterised by tokens written in parentheses inside the show and substituted at runtime — a show can use `(leds): (color)` and `show_player:` supplies `show_tokens: {leds: l_ball_save, color: orange}`, so one show file drives any light group in any colour.**
- source: https://missionpinball.org/latest/shows/tokens/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern
- source: https://missionpinball.org/latest/config_players/show_player/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern
- This is the "don't write a light show per insert" mechanism, and it is cheap to reimplement. A show is a small timeline document; tokens make it a template.

**`show_player:` entries accept `loops` (-1 = indefinite), `priority`, and `key` — the key identifies a running instance so multiple concurrent instances of the same show on different light groups can be stopped individually.**
- source: https://missionpinball.org/latest/config_players/show_player/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern
- Note the priority field again: **shows compose by priority the same way modes do.** One coherent conflict-resolution idea reused across the whole framework.

**MPF ships default shows (`on`, `off`, `flash`, `led_color`) that accept the standard tokens `light`, `lights`, `led`, `leds`, so common cases need no custom show file.**
- source: https://missionpinball.org/latest/shows/default_shows/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern

**How a real simulator renders hundreds of lights in 3D — the VPX Lightmapper is a Blender add-on that bakes lighting offline for VPX. It groups lights into "light groups," bakes a lightmap texture per group, and the engine composites them additively over the base baked geometry at runtime. The README states: "For each light group, derive an optimized mesh by removing unlit faces. For all of these meshes, compute a texture map from the initial renders."**
- source: https://github.com/vbousquet/vpx_lightmapper | publisher: vbousquet (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern
- **This is the answer to question 3 and it is the most technically transferable finding in this digest.** Not instanced real-time lights. Not emissive textures alone. *Per-light-group baked lightmaps, additively blended at runtime, with per-group meshes optimised by deleting unlit faces.* Each group's runtime cost is one texture multiply-add over a reduced mesh, so N lights cost N cheap additive passes rather than N real-time light evaluations. For a browser target where real-time light counts are the binding constraint, this technique is close to essential.

**The lightmapper models inserts specifically by moving the light slightly below the playfield, generating a cup mesh with a core reflective material, and making the playfield material partly translucent for inserts via an automatically generated translucency map.**
- source: https://github.com/vbousquet/vpx_lightmapper | publisher: vbousquet (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern
- Inserts are not decals. The real look comes from a translucent playfield over a lit cup.

**The stated limitation of the technique: it is "highly point of view dependent and won't work well on objects or lights that can be moved."**
- source: https://github.com/vbousquet/vpx_lightmapper | publisher: vbousquet (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: capability
- This constrains camera design. Pinball's fixed-ish viewpoint is what makes the technique viable — a free-fly camera would break it. Worth deciding early.

**The README states no explicit limits on light count, texture size, or performance.**
- source: https://github.com/vbousquet/vpx_lightmapper | publisher: vbousquet (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: capability
- Absence of evidence: nobody has published the scaling numbers. We would have to measure.

---

### 4. Audio

**VPX does not synthesise ball roll — tables use a bank of rolling samples (conventionally `fx_ballrolling00`–`09`, one per ball) driven from a script timer that reads each ball's velocity and position each tick and calls `PlaySound` with computed volume, pan, pitch and fade arguments.**
- source: https://www.vpforums.org/index.php?showtopic=32992 | publisher: VPForums | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: architecture-pattern

**The documented parameter mapping is: volume from a function of ball speed (community scripts use a squared-velocity term divided by a tuning constant), pan from ball X, fade from ball Y, and pitch offset by surface — one community pattern branches on ball Z (`If BOT(b).z < 30`) to apply a lower volume and a large positive pitch offset when the ball is on a ramp versus the wooden playfield.**
- source: https://www.vpforums.org/index.php?showtopic=32992 | publisher: VPForums | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: architecture-pattern
- Worth internalising: **surface material is expressed as a pitch/volume transform on one shared sample set, not as separate sample libraries.** That is a cheap and apparently convincing trick, and it maps directly onto Web Audio's `playbackRate` on a looping buffer source.

**Mechanical sounds (coils, flippers, slingshots, drops) in VPX are sample packs, not synthesis; "Fleep's sound package" is the widely used community reference set covering ball drops, collisions, releases, flipper, bumper and coil actions.**
- source: https://vpinball.com/cmdownloads/fleeps-sound-package/ | publisher: vpinball.com | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: prior-art

**Positional audio in VPX is per-event, anchored to the emitting object's playfield coordinates — coil and slingshot sounds are panned/faded to where the mechanism physically is, the same way ball sounds are.**
- source: https://www.vpforums.org/index.php?showtopic=32992 | publisher: VPForums | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: architecture-pattern

**Cabinet builders route mechanical sounds to separate surround/exciter channels ("SSF" — surround sound feedback) mounted on the physical playfield, distinct from the backbox/ROM audio channels.**
- source: http://mjrnet.org/pinscape/BuildGuideV2/BuildGuide.php?sid=audio | publisher: Pinscape Build Guide (mjrnet.org) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: architecture-pattern
- Not directly applicable to browser, but it tells us the **mental model real builders use: two audio buses, mechanical-positional and music/speech.** Worth mirroring in the mixer graph even with stereo output.

**VPX has a documented audio subsystem in its codebase (deepwiki section "2.4 audio system" for vpinball/vpinball).**
- source: https://deepwiki.com/vpinball/vpinball/2.4-audio-system | publisher: DeepWiki | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: prior-art
- Unread this round; flagged as a lead.

**Browser capability: the Web Audio API exposes `AudioContext.baseLatency` (browser's internal processing buffer) and `AudioContext.outputLatency` (OS/hardware/device portion), both in seconds; the practical audio-out delay for interactive use is their sum.**
- source: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency | publisher: MDN | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: capability
- source: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency | publisher: MDN | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: capability
- `outputLatency` support is not universal — feature-detect before use.

**Measured latency reality: a developer's measurements report Firefox on macOS built-in speakers at ~0 ms outputLatency, built-in speaker after a device switch at ~24.9 ms, Bluetooth AirPods at ~177.8 ms, and in a Codesandbox environment with wired headphones Firefox ~15.4 ms and Chrome ~24 ms.**
- source: https://www.jamieonkeys.dev/posts/web-audio-api-output-latency/ | publisher: Jamie on Keys | pub_date: 2022-07-01 | accessed: 2026-08-26 | confidence: medium | class: capability
- **The load-bearing number here is Bluetooth: ~178 ms.** Wired/built-in output in the 15–25 ms range is fine for a flipper snap; Bluetooth is catastrophic for it and we cannot fix it. Design implication: detect high `outputLatency` and either warn the user or shift to a less timing-critical audio presentation. Caveat: single developer, four years old, one machine — directionally useful, not authoritative.

---

### 5. Art / asset pipeline

**VPE's asset library style guide sets the texture density target explicitly: "We're aiming for a resolution of about 6 pixels per millimeter (approximately 150 DPI)," and "For a playfield texture, this means roughly 4096×8192 pixels."**
- source: https://docs.visualpinball.org/creators-guide/editor/asset-library-styleguide.html | publisher: Visual Pinball Engine docs | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: effort-estimate
- This is a real, primary, quotable number and it should anchor our texture budget. Note it implies a **non-square, power-of-two 1:2 playfield texture**.

**The same guide requires power-of-two dimensions for all maps ("e.g., 256, 512, 1024") and states that "for metallic/smoothness maps, half the resolution of the color map is a good balance between performance and visual fidelity."**
- source: https://docs.visualpinball.org/creators-guide/editor/asset-library-styleguide.html | publisher: Visual Pinball Engine docs | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: effort-estimate

**The guide gives per-part triangle budgets: small objects (spinners, drop targets) "can typically stay under 500 triangles"; standard playfield objects (flippers, bumpers) "can range from about 500 to 2,000 triangles"; hero pieces (large ramps, toys) allow higher counts. It uses only one LOD, because playfield compactness and typical asset size make multiple detail levels unnecessary.**
- source: https://docs.visualpinball.org/creators-guide/editor/asset-library-styleguide.html | publisher: Visual Pinball Engine docs | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: effort-estimate
- The single-LOD decision is a gift for a browser target: the whole table is a small, fixed, near-field scene. Geometry is not the bottleneck; **lighting and texture memory are.**

**Normal maps are the recommended vehicle for surface detail: "Surface details (scratches, small dents, panel seams)," "Shallow details (<5mm in real scale)," "Beveled edges," "Text or logo embossing," and "Pattern detailing."**
- source: https://docs.visualpinball.org/creators-guide/editor/asset-library-styleguide.html | publisher: Visual Pinball Engine docs | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: architecture-pattern

**An open asset library of pinball parts exists: `vbousquet/pinball-parts`, whose README states the project "aims at collecting and sharing assessed blender models of common pinball parts (bats, posts, screws,...) in order to ease the process of recreating these pinball tables in 3D." It covers posts, flippers, bumpers, switches, bulbs, kickers, lane guides and misc parts, distributed as unpacked Blender `.blend` files with textures in separate folders.**
- source: https://github.com/vbousquet/pinball-parts | publisher: vbousquet (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: prior-art

**pinball-parts is licensed CC BY-SA, with one exception: the Thin Film Interaction NodeGroup is CC BY-NC-SA 4.0.**
- source: https://github.com/vbousquet/pinball-parts | publisher: vbousquet (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: legal-fact
- **Actionable:** CC BY-SA permits commercial use with attribution and share-alike on the *assets*; the NC-SA node group must be excluded from any commercial build. This is the one asset dependency found this round that is usable in a commercial original game — worth a proper license read before relying on it.

**The library tags each part with a quality classification (Scan, Measure, Photos, Imprecise) and identifies real-world equivalents by manufacturer and part number.**
- source: https://github.com/vbousquet/pinball-parts | publisher: vbousquet (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: prior-art
- Real part numbers and measured dimensions are exactly what a physics-realistic sim needs for correct scale. This is a meaningful shortcut.

**VPE publishes a documented "realistic playfield" pipeline in stages — textures, then modeling — describing a 2D artwork → vector masks per material → Blender → engine workflow, with a companion "realistic plastics" tutorial covering artwork preparation.**
- source: https://docs.visualpinball.org/creators-guide/tutorials/realistic-playfield/index.html | publisher: Visual Pinball Engine docs | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: architecture-pattern
- source: https://docs.visualpinball.org/creators-guide/tutorials/realistic-playfield/2-modeling.html | publisher: Visual Pinball Engine docs | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: architecture-pattern

**For Blender → VPX geometry transfer, community tutorials specify OBJ export with normals written, UVs included, and faces triangulated, because VPX's renderer expects triangles and missing UVs produce broken textures.**
- source: https://www.vpforums.org/index.php?app=tutorials&article=166 | publisher: VPForums | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: architecture-pattern

**EFFORT ESTIMATE — UNVERIFIED.** I could not find a published, sourced figure for how many hours it takes to author one pinball table. The ranges an aggregator produced (roughly 10–40 h for a reskin, 60–150 h for a recreation with existing assets, 150–400+ h for a high-fidelity original table with custom rules and baked lighting) are **model-generated inference with no primary source attached**, and I am reporting them only so the number is not mistaken for evidence later.
- source: none | publisher: n/a | pub_date: n/a | accessed: 2026-08-26 | confidence: low | class: effort-estimate
- What the evidence *does* support: an original table requires original rule design and balancing, full 3D modeling, multiple texture sets at ~4096×8192 for the playfield, and iterative lightmap baking — four substantial and largely serial workstreams. Treat "one table is a multi-month project for one person" as plausible but unproven, and get a real number from a table author before planning around it.

---

### 6. Legal / IP

*Reported as fact with sources. This is not legal advice, and nothing below should be relied on as such.*

**FarSight Studios announced that its longstanding licenses for the Williams and Bally pinball trademarks would end on 30 June 2018, after which those tables could no longer be sold in The Pinball Arcade; more than 60 Williams/Bally tables were removed from sale, with existing owners retaining access.**
- source: https://www.polygon.com/2018/5/8/17333300/pinball-arcade-bally-williams-license/ | publisher: Polygon | pub_date: 2018-05-08 | accessed: 2026-08-26 | confidence: high | class: legal-fact
- source: https://gameinformer.com/b/news/archive/2018/05/08/pinball-arcade-loses-all-bally-and-williams-tables.aspx | publisher: Game Informer | pub_date: 2018-05-08 | accessed: 2026-08-26 | confidence: high | class: legal-fact
- source: https://toucharcade.com/2018/05/09/pinball-arcade-loses-bally-williams-license-more-than-60-tables-to-be-removed-from-sale-june-30th/ | publisher: TouchArcade | pub_date: 2018-05-09 | accessed: 2026-08-26 | confidence: high | class: legal-fact

**The Pinball Arcade's own FAQ states the WMS rights holder chose not to renew the agreement — this was a non-renewal, not litigation.**
- source: https://pinballarcade.com/News/ | publisher: FarSight Studios / Pinball Arcade | pub_date: 2018 | accessed: 2026-08-26 | confidence: medium | class: legal-fact

**Zen Studios acquired the worldwide digital rights to the Williams/Bally pinball library, announced 4 September 2018, with early releases including Fish Tales, Junk Yard, Medieval Madness and The Getaway: High Speed II.**
- source: https://www.nintendolife.com/news/2018/09/zen_studios_acquires_bally_and_williams_pinball_licence_tables_headed_to_pinball_fx3 | publisher: Nintendo Life | pub_date: 2018-09-04 | accessed: 2026-08-26 | confidence: high | class: legal-fact
- source: https://gameinformer.com/2018/09/04/licensed-williams-bally-tables-coming-to-pinball-fx3 | publisher: Game Informer | pub_date: 2018-09-04 | accessed: 2026-08-26 | confidence: high | class: legal-fact

**The 2018 coverage concerns Williams/Bally only; Stern tables were not reported as removed from The Pinball Arcade, indicating Stern content sat under separate agreements.**
- source: https://en.wikipedia.org/wiki/The_Pinball_Arcade | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: legal-fact
- The transferable fact: **commercial digital reproduction of real tables is done under formal, per-portfolio licensing that can simply lapse.** Any business model depending on recreating real machines is a licensing business, not a software business.

**ABSENCE OF EVIDENCE — no lawsuit or DMCA campaign against Visual Pinball table authors surfaced in this round's searching.** The mainstream coverage of the 2018 licensing upheaval (Polygon, Game Informer, TouchArcade) discusses only rights-holder-to-publisher licensing and does not mention litigation against fan recreations.
- source: https://www.polygon.com/2018/5/8/17333300/pinball-arcade-bally-williams-license/ | publisher: Polygon | pub_date: 2018-05-08 | accessed: 2026-08-26 | confidence: medium | class: legal-fact
- This is genuinely thin data and must be read carefully. It establishes that **no such case was reported in the sources I reached** — not that none exists, and not that recreations are lawful. Unlicensed recreations copying artwork, logos, names and ROMs implicate copyright and trademark regardless of whether anyone has sued. Low observed enforcement is not a legal safe harbour.

**No source found this round asserts that original-themed tables using standard pinball mechanics have been legally challenged.** The mechanics at issue — flippers, pop bumpers, drop targets, multiball — are functional elements of a machine rather than creative expression, and the manufacturers themselves all build machines using the same mechanical vocabulary.
- source: none (absence) | publisher: n/a | pub_date: n/a | accessed: 2026-08-26 | confidence: low | class: legal-fact
- **This is reasoning, not retrieved evidence, and I am flagging it as such.** I found no published guidance document addressing the specific question "is an original themed table safe?" — see "could not find" below. The distinction that the sources *do* support is between the categories: what got licensed and de-licensed in 2018 was **names, artwork, and trademarks** (Williams, Bally, *Medieval Madness*), never the mechanics. Nobody licenses the flipper.
- Residual risk areas that a qualified lawyer should be asked about before any commercial release: playfield layout and art that closely tracks an identifiable existing table (potential trade dress / copyright in the arrangement and artwork), names or typography evoking known titles, and any still-valid patents on modern mechanisms. Documentation of independent design development is the standard mitigation.

---

## Leads worth chasing

1. **Read the actual VPX `LICENSE` file** at github.com/vpinball/vpinball. Every claim about VPX's non-commercial terms in this digest is second-hand via Wikipedia. If we ever consider touching that code, this file is the gating document, and it is one fetch away.
2. **`francisdb/oss-virtual-pinball`** — the curated OSS virtual pinball index. A single page that likely surfaces projects this round missed, including anything browser-targeted more recent than vpx-js.
3. **`deepwiki.com/vpinball/vpinball/2.4-audio-system`** — a structured walkthrough of VPX's actual audio subsystem. Would upgrade the audio findings from forum-script-anecdote to implementation fact.
4. **The VPE "realistic playfield" tutorial series, read in full** (textures → modeling → plastics). This is the only complete, documented, modern pinball art pipeline found. Its *documentation* is usable to us regardless of VPE's GPL-3.0 code license.
5. **`vpx_lightmapper` source, beyond the README** — specifically how many light groups a real table uses in practice, lightmap resolutions, and how the additive composite is actually performed. This technique is the likeliest thing we adopt wholesale; we need its real numbers.
6. **A table author's own build retrospective with hours logged.** The engineersneedart.com "Teacher's Pet" blog is a first-person VPX table build writeup and is the best candidate found for a real effort figure. This would close the biggest evidence gap in the digest.
7. **MPF's `variable_player` / scoring and multiball/ball-save device docs.** I covered modes, shots and shows but not the scoring and ball-lifecycle devices, which are the other half of question 2.
8. **`patrick-s-young/pinball-xr`** — unopened. Worth ten minutes to size up whether it is a usable three.js + cannon-es reference or a toy.
9. **Barnstorm Games' current status.** Pro Pinball Ultra is the named realism benchmark but I could not confirm it is a currently available product; the aggregator's claim that it is not actively supported is unverified and needs a primary check.
10. **Any instrumented physics comparison** between sims and real machines (high-speed camera studies, ball-trajectory measurement). If one exists it would replace forum opinion as our realism target definition.

## Looked for but could not find

- **Any quantitative or instrumented realism benchmark** across pinball simulators. Every "realism ranking" available is forum opinion from individual players. The "Pro Pinball Ultra is the most realistic" consensus rests on subjective posts, and the "VPX is less floaty than FX3 but more floaty than real" comparison likewise. There is no published methodology, no measurement, no reproducible test. **If realism is our differentiator, no one has defined the target — we would have to define and measure it ourselves.**
- **A published, sourced effort estimate (in hours or months) for authoring one pinball table.** The numbers in circulation are model inference. Reported here as unverified rather than omitted, precisely so they are not laundered into a plan.
- **A mature browser-based 3D pinball simulator.** vpx-js is the only serious attempt and it stopped in November 2020 with scripting unfinished. No WebGPU-native pinball project of any maturity surfaced. This absence is the most strategically significant finding in the digest: **the field we are entering is empty, which is both the opportunity and the warning.**
- **Any published legal guidance specifically addressing original-themed pinball tables** that mimic standard machine mechanics. No article, no law-firm writeup, no developer post. The IP position stated above is assembled from the licensing news plus general IP categories, not from a source that answers our question directly.
- **Any reported lawsuit or DMCA action against Visual Pinball table authors.** Searched; nothing surfaced. Reported as absence of evidence, explicitly not as evidence of absence.
- **Scaling numbers for the lightmap-per-light-group technique** — light group counts, lightmap resolutions, frame cost. The `vpx_lightmapper` README states no limits at all.
- **`baseLatency` measurements** to pair with the `outputLatency` figures. The one measurement source found reports `outputLatency` only, on one machine, in 2022. Browser audio latency for our platforms in 2026 is effectively unmeasured in public.
- **Unit3D Pinball's stack, license, or current status.** It does not appear in current OSS pinball indexes and nothing substantive surfaced. Treat as historical.
- **Future Pinball's stack or current maintenance status.** Confirmed only as free and closed source; no primary source reached.
