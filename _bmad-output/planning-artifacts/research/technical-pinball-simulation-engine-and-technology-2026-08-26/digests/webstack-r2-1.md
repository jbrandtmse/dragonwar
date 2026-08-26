# Digest: Physics engine decision blockers resolved (round 2)

Accessed date for all sources: 2026-08-26.

## Findings

### Q1 — Which Rapier core does the shipped wasm binding wrap? (DECISION BLOCKER)

**The version-line mismatch is real but much smaller than the raw numbers suggest, and it does NOT cost you soft-CCD.** The npm `@dimforge/rapier3d` version line (0.x.y of the *binding*) is independent of the Rust core version line; the binding's changelog states which core each release wraps.

`softCcdPrediction` has been in the JavaScript API since rapier.js **0.13.0 (2024-05-05)**, which added `RigidBody.softCcdPrediction`, `.setSoftCcdPrediction`, and `RigidBodyDesc.setSoftCcdPrediction`, citing rapier PR #625 for details.
- source: https://raw.githubusercontent.com/dimforge/rapier.js/master/CHANGELOG.md | publisher: Dimforge (rapier.js repo) | pub_date: 2024-05 | accessed: 2026-08-26 | confidence: high | class: version-compat

**This corrects the round-1 premise.** Round 1 recorded "Rapier 0.35.0 rewrote CCD, adding soft_ccd_prediction." The JS binding exposed soft-CCD in May 2024, roughly five core releases before 0.35.0. Whatever 0.35.0 changed, the *introduction* of soft-CCD is not it. Treat the round-1 attribution as unverified.
- source: https://raw.githubusercontent.com/dimforge/rapier.js/master/CHANGELOG.md | publisher: Dimforge | pub_date: 2024-05 | accessed: 2026-08-26 | confidence: high | class: version-compat

The most recent core upgrade documented in the binding's changelog is **rapier.js 0.19.1 (03 Oct. 2025) → Rapier Rust core 0.30.0**; 0.19.0 (05 Sept. 2025) → core 0.29.0; 0.18.1 (8 Aug. 2025) → core 0.28.0 ("includes performance improvements when CCD is active").
- source: https://raw.githubusercontent.com/dimforge/rapier.js/master/CHANGELOG.md | publisher: Dimforge | pub_date: 2025-10 | accessed: 2026-08-26 | confidence: high | class: version-compat

**The shipped npm `latest` is 0.20.0, and it is undocumented in every repo artifact.** npm dist-tags report latest = 0.20.0, license Apache-2.0, repository git+https://github.com/dimforge/rapier.js.git. But: the repo has **no v0.20.0 git tag** (latest tag is v0.19.3), **no GitHub releases at all** (the releases API returns an empty array), and **no 0.20.0 CHANGELOG entry** (the changelog's top heading is 0.19.3, 05 Nov. 2025). So there is no primary artifact stating which Rust core 0.20.0 wraps.
- source: https://registry.npmjs.org/@dimforge/rapier3d | publisher: npm registry | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: version-compat
- source: https://api.github.com/repos/dimforge/rapier.js/tags | publisher: GitHub API | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ecosystem-health
- source: https://api.github.com/repos/dimforge/rapier.js/releases | publisher: GitHub API | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ecosystem-health

**Net answer:** the shipped binding contains soft-CCD (`softCcdPrediction`) with high confidence, because it has shipped since 0.13.0 and nothing in the changelog removes it. What remains **unresolved** is the exact core version behind npm 0.20.0. The documented floor is core 0.30.0 (via 0.19.1); the Rust core is at 0.35.2. So the binding trails the Rust core by roughly five minor releases, and the newest release is shipped to npm without a tag, release note, or changelog entry.
- confidence: medium (for the "0.20.0 wraps ≥0.30.0, <0.35.2" inference) | class: version-compat

**Ecosystem-health signal worth weighing:** dimforge publishes rapier.js to npm from `publish_all_prod.sh` and does not cut GitHub releases. Version provenance for the JS binding therefore depends entirely on the maintainer remembering to update CHANGELOG.md — and for the current `latest`, that did not happen.
- source: https://api.github.com/repos/dimforge/rapier.js/contents/ | publisher: GitHub API | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ecosystem-health

### Q2 — Real-world tunneling evidence from issue trackers

**There is a directly on-point closed issue: dimforge/rapier #509, "spheres with CCD enabled penetrate a heightfield collider", filed 2023-08-02, using balls of radius 0.1.** This is close to the pinball case (small fast sphere vs. static geometry).
- source: https://api.github.com/search/issues?q=repo:dimforge/rapier+tunneling | publisher: GitHub API / dimforge | pub_date: 2023-08 | accessed: 2026-08-26 | confidence: high | class: limitation

**The reporter closed #509 himself with "This was remedied by tuning the `IntegrationParameters`" (jonlamb-gh, 2023-08-06). No maintainer diagnosis appears in the thread.** He also reported the diagnostic signature `CollisionEvent::Started` followed by `CollisionEvent::Stopped` on the next sim step. So the resolution was scene/solver tuning by the user, not an engine fix — which means the failure mode is reachable with default parameters and the fix is a tuning burden that lands on the developer.
- source: https://api.github.com/repos/dimforge/rapier/issues/509/comments | publisher: GitHub / jonlamb-gh | pub_date: 2023-08 | accessed: 2026-08-26 | confidence: high | class: limitation

Two related CCD defects were fixed upstream: PR #334 "Fix bug where the CCD thickness wasn't initialized properly" and #338, where "contact compliance would result in undesired tunneling, despite CCD being enabled". PR #157 implemented nonlinear CCD via motion-clamping.
- source: https://api.github.com/search/issues?q=repo:dimforge/rapier+tunneling | publisher: GitHub API / dimforge | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: capability

Other tunneling reports are older and against superseded versions, so they are **not** live claims against current Rapier: #78 (2020-12, closed — mass set directly on the body rather than via collider density caused "sliding and bouncing ... and eventually tunneling through the floor") and #421 (2022-11, closed — a 64x64 cuboid under ~900000-magnitude impulses tunnels or sticks despite CCD).
- source: https://api.github.com/search/issues?q=repo:dimforge/rapier+tunneling | publisher: GitHub API / dimforge | pub_date: 2020-12 / 2022-11 | accessed: 2026-08-26 | confidence: high | class: limitation

**Pattern across the tracker:** no *open* bug alleging CCD fails for fast small spheres. The reports that exist are closed, several by user-side tuning rather than engine fixes, and the recurring theme is that CCD correctness is sensitive to mass setup, contact compliance, and integration parameters — not that CCD is broken.
- confidence: medium | class: limitation

**Not retrieved:** I did not get to the Jolt (`jrouwe/JoltPhysics`, `jrouwe/JoltPhysics.js`) or `dimforge/rapier.js` issue trackers within budget. The Jolt side of Q2 is unanswered — see "Looked for but could not find".

### Q3 — Havok's actual license terms for a commercial web game

**Babylon's official documentation states Havok for the web "is available, free to use, under the MIT license."** The npm package `@babylonjs/havok` (latest 1.3.14) carries `"license": "MIT"` in its metadata, described as "The Havok physics engine for the web".
- source: https://registry.npmjs.org/@babylonjs/havok | publisher: npm registry | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: licensing
- source: https://doc.babylonjs.com/features/featuresDeepDive/physics/havokPlugin | publisher: Babylon.js Documentation (quoted via retrieved search result; direct fetch returned a JS shell) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: licensing

**A Babylon.js team member (Cedric) answered the direct commercial-use question on the official forum with "Yes, it's free for commercial use too."**
- source: https://forum.babylonjs.com/t/havok-with-babylon-js-license-free-to/59637 | publisher: Babylon.js Forum | pub_date: unknown | accessed: 2026-08-26 | confidence: medium-high | class: licensing

**Countervailing finding — the paper trail is thin.** The `BabylonJS/havok` repo README contains **no** license, terms-of-use, commercial-use, or restrictions section; it is installation instructions, init/usage examples, and a support contact. The npm packument's readme likewise contains no license text, no `homepage`, and no `repository` field, and I found no LICENSE file. So the entire "MIT / free for commercial" claim rests on the `license` string in package.json, a docs sentence, and a forum reply — not on a license document accompanying the binary.
- source: https://raw.githubusercontent.com/BabylonJS/havok/master/README.md | publisher: BabylonJS/havok repo | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: licensing
- source: https://registry.npmjs.org/@babylonjs/havok | publisher: npm registry | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: licensing

**Operational restriction that IS documented:** the Babylon CDN "should not be used in production environments... to serve Babylon packages to users learning how to use the platform or running small experiments." Production/commercial use means consuming the npm package, not the CDN.
- source: https://doc.babylonjs.com/features/featuresDeepDive/physics/havokPlugin | publisher: Babylon.js Documentation | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: licensing

**Reporting, not advising:** what the sources say is "MIT, free for commercial use." What the sources do **not** contain is a signed license text, an explicit grant from Havok Inc./Microsoft, or any statement about whether the grant is conditional on use *through Babylon.js* versus standalone. The distributed artifact is a prebuilt, closed-source wasm blob whose only license assertion is a metadata string. I found no evidence contradicting the MIT claim, and no evidence substantiating it beyond those three assertions.
- confidence: medium | class: licensing

### Q4 — Physics tick rate feasibility (LARGELY UNRESOLVED)

**Rapier's documented CCD cost model is explicit that CCD trades correctness for simulated time.** The JS user guide states CCD "is used to make sure that fast-moving objects don't miss any contacts (a problem usually called tunneling)"; that "CCD takes action only if the CCD-enabled rigid-body is moving fast relative to another rigid-body. Therefore it is useless to enable CCD on fixed rigid-bodies and rigid-bodies that are expected to move slowly"; that CCD "is disabled for all the rigid-bodies because it requires additional computations"; and that the resulting "time loss" for fast bodies "can be reduced by increasing the maximum number of CCD substeps executed."
- source: https://rapier.rs/docs/user_guides/javascript/rigid_bodies/ | publisher: Dimforge / rapier.rs | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: capability

This matters for the tick-rate decision: **Jolt and Rapier both describe CCD as "stealing time," and both offer substep counts as the remedy.** That makes substeps and tick rate two knobs on the same budget, not independent choices.
- confidence: medium | class: capability

**The `softCcdPrediction` knob is not documented in the JS user guide** — the rigid-bodies page describes only `setCcdEnabled` and says nothing about soft-CCD, despite the API existing since 0.13.0. The feature is shipped but undocumented on the JS side.
- source: https://rapier.rs/docs/user_guides/javascript/rigid_bodies/ | publisher: Dimforge / rapier.rs | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: limitation

**I found no evidence — none — bearing on whether stepping a ~50-body scene at 500-1000 Hz fits a 16.6 ms frame budget in a browser.** No benchmark, no named developer's blog post, no forum thread with real numbers. Round 1's conclusion stands unchanged and unimproved. This is a genuine absence-of-evidence finding, and the honest read is that **this question is not answerable from published sources and must be settled by a spike** — build a ~50-body scene in both engines, step it at 500/1000 Hz on the actual target machines, and measure. That spike is cheap relative to the cost of choosing wrong.
- confidence: high (that the evidence does not exist in reachable sources) | class: performance-number

### Q5 — Three.js WebGPU production status

**The official three.js manual states WebGPURenderer "is still in an experimental state although its maturity level has been greatly improved in the last years," and warns that "depending on your application and scene setup, you will encounter missing features or a better performance with WebGLRenderer."** This directly contradicts the round-1 blog-layer claim that WebGPU is "now recommended."
- source: https://threejs.org/manual/en/webgpurenderer.html | publisher: three.js (official manual) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium-high | class: capability

**The fallback story is built in:** "If a device/browser doesn't support WebGPU, the renderer can automatically fall back to using a WebGL 2 backend." The renderer ships a node-based material system and TSL (three.js shading language), which "can be transpiled to WGSL or GLSL depending on the available backend."
- source: https://threejs.org/manual/en/webgpurenderer.html | publisher: three.js (official manual) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium-high | class: capability

**Browser support for WebGPU on desktop is good on Chromium, absent on Firefox, partial on Safari.** Chrome 113+ and Edge 113+ have full support (current channels through 154 / 151). Safari shows **partial** support from 26.0 through 26.6 and 27-TP. Firefox is "Disabled by default" through version 157 — i.e., no shipping support. Global usage 85.56%.
- source: https://caniuse.com/webgpu | publisher: caniuse.com | pub_date: 2026-08 (live data) | accessed: 2026-08-26 | confidence: high | class: capability

**Decision-relevant read:** for a Windows+macOS browser target, WebGPU covers Chrome/Edge on both platforms; Safari on macOS is partial; Firefox users on both platforms get nothing. A WebGL2 fallback is therefore not optional, it is the path for a real slice of macOS and all of Firefox. And the maintainers themselves still call the renderer experimental.
- confidence: high | class: capability

### Q6 — Babylon.js 9.x confirmation

**Babylon.js 9.22.2 was published 2026-08-24**, two days before this research date. The release cadence is aggressive: 9.22.1 and 9.22.0 both on 2026-08-20, 9.21.2 on 2026-08-14, 9.21.1 and 9.21.0 on 2026-08-13, 9.20.1 on 2026-08-12, 9.20.0 on 2026-08-06, 9.19.1 on 2026-08-04, 9.19.0 on 2026-07-30, 9.18.2 on 2026-07-29, 9.18.0 on 2026-07-23.
- source: https://api.github.com/repos/BabylonJS/Babylon.js/releases | publisher: GitHub API / BabylonJS | pub_date: 2026-08-24 | accessed: 2026-08-26 | confidence: high | class: ecosystem-health

This confirms round 1's npm-sourced 9.22.2 with a second, timestamped, first-party source, and adds a strong ecosystem-health signal: **roughly 12 releases in ~5 weeks.** Babylon is the most actively released component in this stack by a wide margin.
- confidence: high | class: ecosystem-health

**The 9.0.0 release date was NOT confirmed.** The first page of the releases API (12 most recent) reaches back only to 9.18.0 (2026-07-23); 9.0.0 requires paginating further and I ran out of budget. Round 1's 9.0 date remains single-sourced.
- confidence: n/a | class: version-compat

## Leads worth chasing

- **Resolve npm 0.20.0's core version directly.** Fetch `https://registry.npmjs.org/@dimforge/rapier3d/0.20.0` (single-version doc, small) — but note the published artifact is prebuilt wasm, so the definitive route is `Cargo.lock` on the rapier.js master branch (`raw.githubusercontent.com/dimforge/rapier.js/master/Cargo.lock`), which pins the exact resolved `rapier3d` version. That one fetch likely closes Q1 completely. Also worth filing/searching an issue asking why 0.20.0 has no tag or changelog entry.
- **The root Cargo.toml has a commented-out `[patch.crates-io]` block** pinning both rapier2d and rapier3d to git rev `82416e3ca66dcdc34c0f350cec570ef1019a199f`. Resolving that commit in dimforge/rapier would show which core the maintainer was last testing against. It is commented out, so it is not active — but it is a breadcrumb.
- **Jolt's issue tracker is entirely unexamined.** Search `repo:jrouwe/JoltPhysics ccd sphere`, `repo:jrouwe/JoltPhysics tunnel`, and `repo:jrouwe/JoltPhysics.js`. Jrouwe is a notably responsive maintainer and his replies are usually technically specific — likely the highest-yield unexplored source in this whole brief.
- **The Havok wasm binary itself.** If a LICENSE or license header ships inside the npm tarball (not the README), that would upgrade Q3 from "medium, three assertions" to "high, documented grant." Worth unpacking the tarball.
- **Babylon 9.0.0 date** via `?page=2`/`?page=3` on the releases API, or the Babylon docs "What's New" page.
- **The three.js manual page should be fetched directly** rather than relayed through a search summarizer, to get the experimental-status language verbatim and check for a version stamp.
- **Q4 belongs in a spike, not in research.** Recommend a timeboxed prototype: ~50 bodies, one fast small sphere, 500 Hz and 1000 Hz, Rapier vs. Jolt, measured on the actual Windows and macOS targets.

## Looked for but could not find

- **Which Rust core `@dimforge/rapier3d@0.20.0` wraps.** No git tag, no GitHub release (the releases array is literally empty), no CHANGELOG entry. Stated plainly: unresolved.
- **npm publish timestamps** for any `@dimforge/rapier3d` version. The packument's `time` object was not surfaced by two retrieval attempts; version *numbers* came back but not dates.
- **Any Jolt issue-tracker evidence.** Budget exhausted before reaching it. Q2 is answered for Rapier only — do not read the Rapier findings as a comparative result.
- **Any maintainer (sebcrozet) response in rapier #509.** The thread contains only the reporter's own comments; he diagnosed and closed it himself.
- **Any browser benchmark, blog post, or forum discussion of running physics at 500-1000 Hz in a browser.** Round 1 found none; round 2 found none. Two independent rounds of failure is itself the finding.
- **A LICENSE file or license text for `@babylonjs/havok`.** Not in the repo README, not in the npm readme. The `license: "MIT"` metadata string and a forum reply are the whole basis.
- **A primary mrdoob/maintainer statement in a GitHub discussion or release note** about WebGPURenderer production readiness. The official *manual* served as the primary source instead, which is arguably better — but a dated maintainer statement was not located. Note also GitHub issue #28957, "Documentation: State of `WebGPURenderer` and Nodes," which appeared in results and looks like the canonical status thread; it was not fetched.
- **Babylon.js 9.0.0 release date** from a first-party timestamped source.
