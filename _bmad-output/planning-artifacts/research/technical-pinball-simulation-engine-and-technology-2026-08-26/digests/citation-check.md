# Semantic citation check

Fresh-context semantic verification of the twelve most decision-load-bearing cited claims in
`research.md`. Mechanical check (57 markers / 57 rows) already passed; this pass asks only whether
each cited source says what the sentence attached to it claims.

## Summary

**13 checks across 12 claims** (claim 12 splits into playfield dimensions and ball spec, which
resolve differently).

| Verdict | Count |
|---|---|
| SUPPORTS | 8 |
| OVERSTATES | 3 |
| MISATTRIBUTED | 1 |
| UNREACHABLE | 1 |

The load-bearing physics spine ([1], [3], [15], [29], [31], [41]) holds. The weaknesses cluster in
two places: the **renderer justification** ([33], [42]), where two sources are being read harder
than they read, and a **machine-operations detail** ([12] match percentage) that its cited source
does not contain at all. Nothing found here overturns a recommendation; three confidence values
should move.

## Per-claim verdicts

### 1. Jolt `mLinearCastThreshold = 0.75` means CCD does not engage at high tick rates — [15]

**Verdict: SUPPORTS.**
`PhysicsSettings.h` reads verbatim: `float mLinearCastThreshold = 0.75f;` with the comment
*"Fraction of its inner radius a body must move per step to enable casting for the LinearCast
motion quality"* (and `mLinearCastMaxPenetration = 0.25f`). The report's arithmetic checks out —
0.75 × 13.5 mm inner radius ≈ 10.1 mm vs ~6 mm per step at 1000 Hz. Note the conclusion "CCD never
engages" is the report's *inference* from the constant, not a statement in the source, and it
presupposes Jolt defaults and LinearCast (not Discrete) motion quality. The report presents it as
inference, which is fair.

### 2. VPX runs a fixed 1000 Hz timestep with analytic time-of-impact collision — [3]

**Verdict: SUPPORTS (by proxy; cited artifact not verifiable at file level).**
Citation [3] points at a GitHub *directory listing*
(`.../vpinball/tree/master/src/physics`), not a file, so no specific constant can be verified
against it directly; `src/physics/physics.h` returned 404, meaning the path the constant is usually
quoted from no longer exists at that location. The claim is corroborated by [32] (`vpx-js`
`constants.ts`, a direct TypeScript port), which reads verbatim
`export const PHYSICS_STEPTIME = 1000; // usecs to go between each physics update` — 1000 µs = 1 kHz —
along with `PHYS_SKIN = 25.0`, `PHYS_TOUCH = 0.05`, `C_DISP_GAIN = 0.9875`, `STATICTIME = 0.005`,
all exactly as §5 quotes them. One wrinkle worth knowing: the same file also carries
`DEFAULT_STEPTIME = 10000; // default physics rate: 1000Hz`, whose comment contradicts its own value
(10000 µs = 100 Hz). The report cites the correct constant, but anyone re-deriving this from source
will hit that inconsistency.

### 3. Visual Pinball's licence defaults to non-commercial for unmarked files — [1]

**Verdict: SUPPORTS.**
LICENSE reads verbatim *"Every file/snippet that doesn't feature any explicit license mentioning,
will stay (for now) under the 'old MAME'-like license"*, whose terms include *"Redistributions may
not be sold, nor may they be used in a commercial product or activity."* The `// license:GPLv3+`
first-line marker convention is confirmed. This is the highest-consequence claim in the document and
it is quoted accurately.

### 4. Godot web export supports only the Compatibility renderer and lacks AudioEffects — [29]

**Verdict: SUPPORTS.**
Godot docs confirm all three sub-claims verbatim: *"Godot 4 can only target WebGL 2.0 (using the
Compatibility rendering method). Forward+/Mobile are not supported on the web platform"*,
*"AudioEffects are not supported"* / *"Procedural audio generation is not supported"*, and
*"Projects written in C# using Godot 4 currently cannot be exported to the web."*

### 5. Three.js managed 24 FPS vs 96 on a 130-light scene — [33]

**Verdict: OVERSTATES.**
The numbers are real: author Usnul, 130 lights (16 torches, 22 lanterns, 91 candles), three.js 24 FPS
vs 96 FPS. But the comparison is weaker than "directional" in two ways the report does not surface:
(a) the 96 FPS run was doing *more* work simultaneously — "4 cascades of CSM at 2k, SSR, SSAO, Bloom,
TAA" — which makes it not a controlled comparison in either direction; (b) **the thread does not
state which backend three.js was using** (WebGL vs WebGPU), so the datapoint cannot establish that
three.js is structurally slower at high light counts. The report already flags the self-benchmark
conflict; the missing backend is the more damaging gap, because the renderer recommendation turns on
it.

### 6. Babylon clustered forward does 2000 dynamic lights at 1080p/60fps — [41]

**Verdict: SUPPORTS.**
Forum post confirms 2000 dynamic lights at 1080p/60fps on an RTX 4070 laptop, using
`BABYLON.WebGPUEngine` and `BABYLON.ClusteredLightContainer` — Clustered Forward+, WebGPU. The
report's use is accurate. Context the report omits but which does not harm it: at 4K the same test
falls to 300–500 lights, so the headline figure is resolution-bound.

### 7. Three.js ClusteredLighting is WebGPU-only — [42]

**Verdict: OVERSTATES.**
The docs say ClusteredLighting *"overwrites the default lighting system in WebGPURenderer"* and never
mention WebGL. That establishes it is a `WebGPURenderer` feature — but `WebGPURenderer` itself has a
WebGL2 backend, so "WebGPU-only" does not follow from the quoted text; the page is silent on backend,
not restrictive. This matters because §5 uses [42] to carry the load-bearing conclusion *"it is the
WebGL2 baseline that forces baking, not any property of pinball."* The conclusion may well be right;
this source does not establish it.

### 8. Stern's default match percentage is 8% and the match number is a multiple of ten — [11]/[12]

**Verdict: MISATTRIBUTED.**
The Stern Jurassic Park LE 1.15 README — the source cited at the head of the §2 machine-operations
table — contains **no MATCH adjustment and no match percentage at all**. The same document *does*
verify the two neighbouring claims: *"Service Menu->Util->Install->Competition to set: 'COMPETITION
MODE' to YES... 'TILT_WARNINGS' to 2"* and *"'RIGHT FLIPPER POWER' - default to 235 from 255"*. So the
citation is good for the adjustments/Competition-preset sentence and does not reach the match row.
Another source may well support 8% (it is a widely repeated operator figure), but neither cited
artifact does.

### 9. MPF's flipper example is 30 ms pulse at 0.7 power then 0.25 hold — [20]

**Verdict: UNREACHABLE.**
Both `missionpinball.org/latest/config/coils/` and `.../config/flippers/` return only navigation
chrome to a fetcher — the configuration examples with numeric values are client-rendered and did not
retrieve. The claim could not be confirmed or refuted. Note the internal inconsistency this exposes:
§3's table marks this "medium" confidence while appendix row [20] marks it "high".

### 10. A browser pinball demo runs at 480 Hz with no tunneling — [31]

**Verdict: SUPPORTS.**
Neon Gutter thread reads verbatim: *"Collision is swept at a fixed 480 Hz, so nothing tunnels
regardless of frame rate."* Browser demo (CodePen / GitHub Pages / single HTML file) by
red-reddington. Two honest caveats: it is the author's own assertion about his own demo, not an
instrumented result, and the word is *"swept"* — so the demo is doing swept collision at 480 Hz, not
relying on tick rate alone. That is consistent with the report's architecture argument but slightly
different from the "high tick rate alone is the mechanism" framing in §1.

### 11. WebGPU is at 85.56% global usage and Firefox 141 enabled it on Windows — [36][37]

**Verdict: SUPPORTS.**
caniuse shows *"83.99% + 1.57% = 85.56%"* — the report's figure includes 1.57% *partial* support,
which is worth knowing but is standard caniuse convention. Firefox 141 release notes read *"Enabled
the WebGPU API ... on Windows."* One live-data wrinkle: caniuse's Firefox column as fetched still
renders every version as disabled/unsupported, which conflicts with [37]. That is almost certainly
caniuse data lag rather than an error in the report, but it reinforces the §11 one-month re-check on
this row.

### 12a. Standard playfield is 20.25 × 42.00 in — [14]

**Verdict: SUPPORTS.**
Pinball Makers' Playfield Sizes table lists 20.25" × 42.00" as SS Standard for Bally, Williams
(System 1–11), Stern Electronics, Gottlieb (System 1 and System 80), Game Plan, Alvin G and Zaccaria
— an unusually strong multi-manufacturer confirmation. The metric figures (514.4 × 1066.8 mm) are the
report's own conversion and are arithmetically correct. The second source in the pair
(flippers.be) does **not** carry this number — it gives playfield *glass* at 109.3 × 53.3 cm — so the
pair is really one source, not two.

### 12b. Ball is 26.99 mm / ~80 g — [18]

**Verdict: OVERSTATES.**
The VPE units page confirms only *"A ball being 1¹⁄₁₆ inch"*. 26.99 mm is exact arithmetic from that,
so the diameter is safe. **The ~80 g weight is not on the cited page**, and neither are the flipper
bat figures (3.000 in bare / 3.125 in rubbered) that the same [18] citation carries one row below. Two
of the three quantities attributed to [18] are unverified against it.

## Recommended confidence downgrades

Confidence values only — no substantive rewrites proposed.

1. **§3 geometry table, row "Ball | 1.0625 in / 26.99 mm, ~80 g carbon steel [18]"** — and appendix
   row 18 — should move from **high → medium**. The diameter is solid; the 80 g mass and the flipper
   bat lengths in the adjacent row are not present in the cited artifact. Either the row splits its
   citation or the confidence reflects that only part of it is sourced.

2. **§2 table, the Match row** ("The number is always a **multiple of ten**, and Stern's default
   match percentage is **8%**") — should be marked **unverified / low**, or given a different source.
   Its section-head citation [12] demonstrably does not contain a match adjustment. The rest of that
   table's rows are unaffected, and [12] verifies the adjustments paragraph beneath it accurately.

3. **§5, "Clustered lighting is WebGPU-only in both engines [42][41]"** — the [42] half should move
   from **high → medium** (appendix row 42). The three.js docs place ClusteredLighting in
   `WebGPURenderer` but do not state that the WebGL2 backend is excluded, and `WebGPURenderer` runs on
   WebGL2. The downstream sentence *"it is the WebGL2 baseline that forces baking, not any property of
   pinball"* inherits that softness.

4. **Recommendation 3, "Renderer: Babylon.js ... *Confidence: medium*"** — should move to
   **low–medium**. The report's stated reason (self-benchmark) is correct but incomplete: [33] also
   never states which three.js backend produced the 24 FPS, and the 96 FPS comparator was running a
   heavier post-processing stack. The Babylon pick has an independent structural justification
   (first-party Havok plugin, engine-shaped, release cadence [34][35]) that is unaffected — this
   downgrade applies to the benchmark leg only.

5. **Appendix row 20 (MPF flipper pulse)** — should move from **high → medium**, aligning it with the
   "medium" already shown in the §3 table, and flagged as not independently re-verifiable via web
   fetch (the docs pages render their examples client-side).

Not a downgrade, but worth a footnote: **citation [3] points at a directory, not a file**, and the
path that historically held `PHYSICS_STEPTIME` now 404s. The claim survives via [32], but the
citation as written is not directly checkable by a future reader.
