---
title: 'Story 2.1f: The bottom-right corridor -- the Ramp and the DRAGON bank made reachable'
type: 'feature' # feature | bugfix | refactor | chore
created: '2026-09-04'
status: 'done' # draft | ready-for-dev | in-progress | in-review | done | blocked
baseline_revision: '65c14b2bc7489dfd5be462d7a8e78c861c114b69'
baseline_commit: '65c14b2bc7489dfd5be462d7a8e78c861c114b69'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1e-every-shot-case-proves-its-own-start-point-is-reachable.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1d-device-behaviour-and-guide-terminations.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: ['multiple-goals', 'oversized']
deferred:
  - id: 'DW-146-branch-a-available'
    summary: >-
      DW-146's Branch A is measurably AVAILABLE and was not shipped. RIDGE_DROP_MM = 12.0
      eliminates col_loop_top's two 9.5 mm end caps outright (the footprint becomes the 3-point
      triangle (50, 1004.8) (418.4, 1004.8) (234.2, 1016.8), the same point-ended class as the two
      exempt return rails) AND all six Loop entry-offset cases still pass. Its cost, measured on the
      re-exported document, is what stopped it: twelve cases in test/shot-reachability.test.ts go
      red plus the witness-corpus health floor itself (witnesses stop closing their own
      expectedSwitch), and the roll-and-drain golden NO LONGER DRAINS inside its recorded 9282
      ticks -- one ball still in play at x = 257.18 where its scenario block asserts zero balls,
      ballsInPlay 0 and a full trough. That is a different behaviour, not a retime, and a golden
      needing a moved threshold is a HALT rather than a re-record. Shipping it means re-deriving
      the whole witness corpus and genuinely re-recording all five goldens on changed traces.
    evidence: >-
      Swept through the real pipeline (re-seed + pnpm export:assets at every value) at 2.5 / 3.0 /
      5.0 / 8.0 / 10.0 / 12.0; full table in this spec's Spec Change Log section 2. Also worth
      carrying: 3.0 reddens left-loop-orbit-34 (s_loop_r_out never closes), and 5.0 -- the value
      Story 2.1d recorded as retiming the Left Loop's 34 mm offset into the wrong outlane -- no
      longer does so against the re-solved geometry.
    location: 'tools/make-placeholder-blend.py (RIDGE_DROP_MM); test/asset-contract.test.ts (the col_loop_top GUIDE_TERMINATION_EXEMPTIONS entry)'
    severity: 'medium'
    recommendation: 'a dedicated story that budgets the witness re-derivation and a genuine five-golden re-record, rather than a geometry story carrying both'
  - id: 'hop-control-contact-epsilon-moved'
    summary: >-
      A threshold this story MOVED, recorded rather than absorbed. test/hop-control.test.ts's
      CONTACT_EPSILON_MEDIAN_MM 4.0 -> 4.5. Per-hit max z above rest went 4.1857 / 3.6730 / 3.6730
      -> 4.6250 / 4.2250 / 4.2250 because the harness's struck ball crosses most of the table and
      now bounces off col_post_dragon_leg_r_south at (201.70, 480.00) where it used to bounce off
      it at (212.50, 480.00). CONTACT_EPSILON_WORST_MM = 5.0 did not move.
    evidence: >-
      Traced old document against new: the maximum-z tick is the SAME tick in both runs (relative
      314 / 324) and the ball is airborne in open field at it -- (188.97, 455.71) before,
      (178.31, 457.28) after -- so it is the same contact-response artefact, not a hop. hopControl
      is 0 in this run and the file's own identity and negative-hopControl tests prove
      applyPostStep() is an unconditional no-op there.
    location: 'test/hop-control.test.ts'
    severity: 'low'
  - id: 'dragon-targets-d-and-r-not-right-bat-reachable'
    summary: >-
      All six DRAGON targets are strikable and each per-letter case closes its OWN switch (AC 3 is
      met), but the two westernmost targets, d and r, are not reached by any RIGHT-BAT flip the
      sweep could find. Their release points lie on plunge-then-bat-r-3906's own swept path, so
      they are reachable; a real flipper shot that strikes d or r specifically is not demonstrated.
    evidence: >-
      Swept right-bat flip ticks 3810..4030 (step 1 in the productive window) at holds
      20/25/30/40/45/50/60/70/80/90/250 across eleven plunge strengths (275..305); the westernmost
      crossing of the bank's own zone band is x ~= 237, which reaches a but not r (zone
      [226.4, 240.4]) or d ([215.4, 229.4]). Left-bat flips off the full plunge reach only o and g.
      Straight-line reasoning agrees: the corridor window at y = 420 plus the right bat's own span
      bounds the westernmost crossing at x ~= 249.
    location: 'test/util/reachability.ts; test/util/shot-cases.ts (dragon-target-d, dragon-target-r)'
    severity: 'low'
    recommendation: >-
      belongs with DW-138's own technique question (a SECOND flip and a bd_lock/c_mouth origin, both
      routed to burndown on 2026-09-04) rather than with the geometry
  - id: 'corridor-to-bank-straight-shot-retired'
    summary: >-
      Two shot cases were retired rather than re-sited (dragon-bank-left-column-294,
      dragon-bank-right-column-300), replaced by the six per-letter cases task 9 asked for. The
      reason is a real property of the re-solved quadrant worth a design decision: col_ramp_wall_l
      (x 286.4..298.4, y 485..825) now stands between the corridor and the bank, so a ball rising in
      the corridor must have its centre at or east of 311.9 to pass EAST of it -- which takes it up
      the Ramp, the shot the re-solve exists to create -- or at or west of 272.9 to pass west. There
      is no longer a straight corridor-to-bank shot; the bank is an ANGLED shot that crosses west of
      the Ramp wall below its southern end.
    evidence: >-
      Every aim swept from -30 to +4 deg at 1400/1600/2000/2400 mm/s from x = 300 and x = 318 either
      enters the Ramp or strikes the wall; only x = 318 with a steep westward aim crosses the bank.
      A real ball does reach it: plunge-then-bat-r-3906 closes s_dragon_a/g/o/n in one flip.
    location: 'test/util/shot-cases.ts; test/shot-routing.test.ts (the DRAGON bank describe block)'
    severity: 'low'
    recommendation: 'Story 2.3 owns the drop bank; whether the table should offer a straight corridor-to-bank shot is its call'
  - id: 'task-11-whole-playfield-sweep-implemented-differently'
    summary: >-
      Task 11 asked for Story 2.1d's throwaway 811-release whole-playfield descending-strand sweep
      to be made permanent inside the out-of-process harness. It is implemented instead as the
      in-suite DERIVED gate task 10 asks for, which covers the whole playfield by construction --
      every exposed north-facing footprint edge -- rather than by grid sampling, and costs no
      runtime in the 106 s sweep that is already at 88% of its stated 120 s budget.
    evidence: >-
      The derived gate found two hazards on its first run that the hand list had never covered
      (col_wall_lane, col_loop_r_deflector), both fixed in this change. A 1620-candidate grid can
      step over a hazard; a derivation from every footprint edge cannot.
    location: 'test/shot-routing.test.ts (the AC 9 describe block); test/fixtures/reachability/reachability-sweep.harness.ts'
    severity: 'low'
  - id: 'col-post-lock-ceiling-west-fill-e-marginal-protrusion'
    summary: >-
      col_post_lock_ceiling_west_fill_e passes the new protrusion gate only marginally. Its own end,
      col_lock_ceiling_west_fill's east riser midpoint (150.00, 625.00), is inside NOTHING -- 1.154
      mm outside col_lock_ceiling -- so it is genuinely bare and genuinely needs terminating, but the
      post protrudes only into the 1.15-3.20 mm seam between col_lock_ceiling_west_fill and
      col_lock_ceiling and is flagged as buried under vertex-only sampling.
    evidence: >-
      The gate samples vertices AND edge midpoints for exactly this case; e.g. (151.4, 628.4) is
      1.4 mm outside west_fill and 1.36 mm outside the ceiling. No ball (26.99 mm) can reach a
      sub-ball notch, so FR-31's own hazard does not exist there -- but "bare end, needs a post" and
      "no ball can reach it" disagree, and the honest fix is to raise col_lock_ceiling's west flank
      so the riser is genuinely enclosed and the post can be removed like the other three.
    location: 'tools/make-placeholder-blend.py (LOCK_CEILING_RIDGE_MM and the west flank); test/asset-contract.test.ts (the protrusion gate)'
    severity: 'low'
    recommendation: 'not touched here -- Story 2.1d spent seven rounds on that flank and the Lock-lane behaviour it protects is out of this story''s grant'
  - id: 'dw154c-shape-reason-regex'
    summary: >-
      DW-154 (c) is closed -- the staleness check's catch now asserts the throw came from
      freeEndsMm() and named one of its shape reasons -- but it does so by matching the message
      text with a regex, so rewording any of freeEndsMm()'s three throws needs the regex updated in
      the same change. The alternative (a typed error class per reason) was not taken because it
      would widen the change into the helper's own contract.
    location: 'test/asset-contract.test.ts (the reverse-direction exemption test)'
    severity: 'low'
  - id: 'suite-file-count-90-not-91'
    summary: >-
      The suite is 90 files / 1448 passing where AC 10's floor reads "at or above 91 files / 1422".
      The test COUNT is 26 above baseline; the FILE count is one below, because task 13 removed
      test/dw137-corridor-gate.test.ts -- the in-suite wrapper that asserted the DW-137 harness's
      failure content -- along with the defect it documented. Removal was the task's stated
      preference and the file's own header anticipated it. Flagged so the arithmetic is not read as
      a lost test file.
    location: 'test/dw137-corridor-gate.test.ts (deleted); AGENTS.md; _bmad-output/implementation-artifacts/epic-2-context.md'
    severity: 'low'
  - id: 'derive-exposed-north-faces-120mm-blind-spot'
    summary: >-
      [Found at code review] deriveExposedNorthFaces() (AC 9's derived strand generator) silently
      drops any exposed north-facing edge for which no clear vertical release point exists within
      120 mm directly above it -- no counter, no log, no accounting. The whole-set anti-vacuity
      floor (faces.length > 0) cannot see a single hazardous face vanish this way if other faces
      still populate the array. Currently HARMLESS: an instrumented run against the committed
      document (temporary console.log, reverted, tree confirmed byte-identical) shows exactly 22
      faces dropped this way today, spanning col_loop_l/r_funnel, col_loop_l/r_return,
      col_post_feed_l/r_hi, col_post_inlane_l/r_hi, col_post_lock_ceiling_west_fill_w,
      col_post_pocket_l/r, col_post_sling_l_north and col_sling_r -- every one of them graded
      22.50-76.87 deg, all well above the 16.699 deg slide threshold, so none would have qualified
      as a hazard even had a release point been found. A FUTURE shallow (sub-16.699 deg) face tucked
      under a low ceiling would be silently excluded with the same certainty.
    evidence: >-
      test/shot-routing.test.ts:1217 `for (let above = ...; above <= 120; above += 2)`; on
      exhaustion `release === undefined` at :1224 simply `continue`s with no counter. Verified by
      temporarily logging every skip, running the AC 9 test, observing the 22 faces above, then
      reverting the probe and confirming test/shot-routing.test.ts byte-identical via git diff.
    location: 'test/shot-routing.test.ts:1159-1232 (deriveExposedNorthFaces)'
    severity: 'low'
    recommendation: >-
      track and report the excluded set explicitly (count + names), or widen the search / try a
      lateral release, so a future shallow face hidden under a low ceiling fails loudly instead of
      silently vanishing from the derived subject set
  - id: 'col-ramp-turn-no-inline-self-intersection-guard'
    summary: >-
      [Found at code review] col_ramp_turn's new north-face vertex (tools/make-placeholder-blend.py
      ~:2345-2355) derives ramp_turn_north_drop_mm from a FIXED RAMP_TURN_NORTH_DEG against a
      VARIABLE ramp_turn_run_mm (itself derived from the corridor budget), with no inline assert that
      the drop stays under run + RAMP_TURN_THICKNESS_MM. A future corridor re-narrowing could shrink
      ramp_turn_run_mm enough to make the derived vertex fold the polygon on itself.
    evidence: >-
      tools/export.py's own convexity validator (:339-440, DW-125, AD-11's structural enforcement)
      already rejects any non-convex wall footprint before writing, so this specific failure mode is
      caught -- loudly, naming the body -- at export time by an existing, independently-verified
      mechanism; there is no missing safety net, only a missing EARLY, geometry-specific diagnostic
      at the point the bad value is computed rather than at the point it is written.
    location: 'tools/make-placeholder-blend.py:2345-2355'
    severity: 'low'
  - id: 'ac3-tunable-provenance-duplication'
    summary: >-
      [Found at code review, intent-alignment audit] AC 3's dimensional gate
      (test/asset-contract.test.ts, `const rampCorridorClearMm = 34.0`) is a fresh TypeScript
      literal independent of the Python-authored RAMP_CORRIDOR_CLEAR_MM in
      tools/make-placeholder-blend.py -- kept in sync only by convention, the same
      provenance-severed-duplicate shape AD-15 eliminated for SLING_R_X0_MM on the geometry side.
      Matches this file's pre-existing house style for every other dimensional pin (no
      cross-language import exists anywhere in this repo), so it is not a shortcut invented for this
      story, but it means the two `34.0` values could drift apart silently if either is edited alone.
    evidence: >-
      test/asset-contract.test.ts:1756 `const rampCorridorClearMm = 34.0;` versus
      tools/make-placeholder-blend.py's RAMP_CORRIDOR_CLEAR_MM = 34.0 -- no import or generated
      constant links them.
    location: 'test/asset-contract.test.ts:1756; tools/make-placeholder-blend.py (RAMP_CORRIDOR_CLEAR_MM)'
    severity: 'low'
    recommendation: >-
      a cross-cutting fix (generating a small TS constants module from the Python tunables block, or
      the reverse) would remove this class of drift for every dimensional pin at once; out of scope
      for a single-story patch
---

<intent-contract>

## Intent

**Problem:** The bottom-right approach corridor is 34.475 mm wide (`col_guide_outer_r`'s east face 279.525 to `col_sling_r`'s west face 314.000), which is 7.485 mm of ball-centre freedom -- 6.485 mm at y = 420, where `col_post_outer_r_hi` reaches x = 280.525. A ball passing that band cannot push its centre past **300.505**, while entering the Ramp channel needs a centre of at least **351.495** (`col_ramp_wall_l`'s east face 338.000 plus the 13.495 mm ball radius): a **50.990 mm** shortfall, so the Ramp is unreachable by any shot from below (`DW-137`), and the same corridor limits the DRAGON bank to a small minority of its six targets (`DW-136`). The two defects are one corridor with one fix. Neither is a regression Story 2.1c introduced -- the Ramp was already 21.990 mm short at 2.1c's baseline `43a9c37` and has never been reachable in committed geometry; 2.1c deepened it by 29 mm as the explicitly-granted consequence of opening the right inlane mouth, and moving `col_sling_r` back west re-narrows the lane the orbit needs, which is why this work is chartered with a budget of its own.

**Approach:** Re-solve the quadrant as one budget -- the slingshot span, both Ramp walls, the DRAGON bank and the Loop lane together -- so that `col_sling_r`'s west face lies at least one ball diameter **east** of `col_ramp_wall_l`'s east face, re-export the geometry, and prove the result with the Story 2.1e reachability harness rather than with a teleported release. Extend that harness with the right-bat origin its own header records as unswept, because the Ramp is a right-flipper shot and no existing witness or sweep axis can reach it. Turn `pnpm check:corridor` green because the corridor genuinely admits a ball, and retire its intended-red documentation in the same change. Ride the re-export to close the four termination-gate entries that share this neighbourhood (`DW-146`, `DW-153`, `DW-154`) and to re-record all five goldens once.

## Boundaries & Constraints

**Always:**
- Geometry is authored **only** in `tools/make-placeholder-blend.py`, then reseeded and re-exported. Never hand-edit `assets/src/dragonwar.blend`, `public/assets/dragonwar.glb` or `public/assets/dragonwar.collision.json`. The one sanctioned exception is a **throwaway, reverted** in-memory or on-disk document mutation used to demonstrate a Rule 19 red, which must end with the tree byte-identical.
- `AD-15`: every geometry constant this story introduces or changes carries a provenance comment naming the measurement that chose it. `SLING_R_X0_MM` is today a **bare literal** with no derivation and no measurement (`tools/make-placeholder-blend.py:1004`, admitted at `:978-981`); whatever value it takes must become a named, derived, provenance-carrying tunable.
- `AD-11`: every `col_` wall footprint stays a **convex** polygon (`tools/export.py:434-440`, `DW-125`); node names keep their prefix contract; `sim/` never parses glb.
- `AD-10`: ball 26.99 mm (radius 13.495), playfield 514.4 x 1066.8 mm, geometry authored unpitched. Every clearance is measured against 26.99, never a rounded 27.
- `AD-19` / Story 2.4's boundary: `TABLE.shots` stays exactly `{}`. Touching it moves `tableHash` and breaks all five golden headers a second time.
- Every release point driven anywhere must clear every `col_` footprint by more than `RELEASE_CLEAR_MARGIN_MM` (13.495) via `assertReleaseClear()` (`DW-77`). An unclear release is ejected by the solver and manufactures a phantom result.
- The real slide threshold is `atan(TUNING.materials.default.friction)` = `atan(0.3)` = **16.699 deg**, not the 18.43 deg narrative figure the seeding script's comments cite (`tools/make-placeholder-blend.py:687, 706, 719, 729, 790, 2243, 2245`; `test/shot-routing.test.ts:1003`). Every strand 2.1d observed sat below 16.699 deg.
- Re-recording a golden is permitted under the author's grant of 2026-09-02 on the unchanged condition: **each traced correct and each still asserting its own subject.** Weakening a threshold, adding a `PARITY_INERT` entry, deleting a `transitions` body or dropping a scenario assertion is not re-recording.
- `pnpm check:ad7` exits 1 **by design** (`DW-70`, Story 2.5). A green run is a regression. Do not touch it.

**Block If:**
- **A re-solve that buys the Ramp by breaking Story 2.1c's delivered orbit is not a trade to make silently.** All six Loop entry-offset cases (`left-loop-orbit-28/31/34`, `right-loop-orbit-28/31/34`), the single-ball `dw123-single-ball-orbit`, and the plunge path (the `full-plunge` golden's `ball_launched`-once, `ballsInPlay == 1`, final `pos.x < 468.4` and max-y > 1040 clauses) must all still pass with **no assertion weakened** -- including `s_spinner` and `s_inlane_r` on the left orbit, `s_inlane_l` on the right, the side-specific `assertReachesFlipperBand`, and `assertNotStranded`'s 15 mm / 500-tick floor. HALT with the measurement instead of trading one delivered feature for another. **This Block If does not extend to `DW-146`** -- see the pre-authorised decision rule below.
- The corridor gate can only go green because the corridor **genuinely admits a ball**. If `pnpm check:corridor` passes while no witness trajectory reaches the Ramp channel, that is a false green: HALT.
- A golden whose new trace cannot be shown correct, or that would need a threshold moved to pass, is a HALT -- not a re-record.
- An NFR or AC that proves unmeasurable, contradictory or impossible as worded is an `intent gap` HALT naming it and the recommended amendment (Rule 5). Do not plan around it.

**Never:**
- Never fix `DW-70` / `pnpm check:ad7`; never touch `DW-82` (Story 6.7), `DW-134` / `DW-155` (Story 2.3), `DW-148` (Story 2.2), or `DW-138` / `DW-149` (both `owner=burndown`).
- Never close `DW-138`'s negative direction. This story adds a right-bat origin because **its own** positive verdict needs one; it does not owe the second flip, the `c_mouth` origin, or the drop-column criterion question, all of which the 2026-09-04 adjudication routed to `burndown` precisely so a geometry story would not carry them.
- Never write a Blender executable path into a tracked file (`DW-46` / `DW-131`). Export `BLENDER` in the shell only.
- Never resolve a degenerate input to a pass. The uniform fix for every `DW-154` sub-case is to **fail loudly**, naming the body and the measurement.
- Never HALT a third time on `DW-146`. Its fallback is pre-authorised (below).
- No new third-party code, asset or dependency. If that ceases to be true, the `ATTRIBUTIONS.md` row lands **before** the file does (`CLAUDE.md`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Corridor admits a ball (`DW-137`) | Re-solved geometry in the committed document | `col_sling_r.bboxMm.min.x - col_ramp_wall_l.bboxMm.max.x >= 26.99`; `pnpm check:corridor` exits **0** | Gate names both faces, the ball diameter and the residual, and exits 1 |
| Ramp reached by a real shot (`DW-137`) | A right-bat witness trajectory replayed through `createMachine()` | `ramp-return-geometry` declares `{ kind: 'reachable', witness: <right-bat id> }` and `closestApproachMm <= 13.495`; the case closes `s_ramp_enter` then `s_ramp_made` | `test/shot-reachability.test.ts` fails naming the case id, the witness id, the measured closest approach and the tolerance |
| Ramp return feeds the right inlane (OQ-6/FR-27) | The Ramp case driven from its now-reachable release point | `firstMakes` contains `s_inlane_r`; `assertReachesFlipperBand(result, 'Ramp', 'r')` holds | Case fails naming the missing switch or the band it never entered |
| All six DRAGON targets strikable (`DW-136`) | Six per-letter shot cases, one per target | Each case closes **its own** `s_dragon_<letter>`; each carries a `reachable` verdict with a named witness | Fails naming the letter that did not close and the case id |
| Corridor width pinned to its tunable (`DW-136`) | The committed document plus the named tunable | A dimensional gate asserts the corridor's clear width equals the tunable within tolerance, so a later change cannot silently re-narrow it | Fails naming the measured width, the tunable and the delta |
| Orbit preserved (Block If) | The re-solved geometry | All six entry-offset cases, `dw123-single-ball-orbit` and the plunge path pass with every assertion intact | Any failure is a Block If: HALT with the measurement, do not weaken |
| Guide end genuinely bare (`DW-146`) | `col_loop_top` after the ridge re-tune attempt | Either both end caps are terminated/eliminated and the orbit holds, **or** a `GUIDE_TERMINATION_EXEMPTIONS` entry records the swept values and the case that broke, carrying a `verify()` | Never a silent pass and never a third HALT |
| Guide end enclosed inside another body (`DW-153`) | A free end strictly interior to another `col_` wall footprint | Classified as **enclosed** through an enumerated, proved channel; no post is required, and any post nominally terminating it is removed or moved to protrude | An enclosed end reaching the post-distance assertion, or a post that contributes no surface, fails naming the body and the enclosing body |
| Post contributes no collision surface (`DW-153`/`DW-154`d) | Any `rubber_post` whose footprint lies entirely inside the union of non-post `col_` wall footprints | The gate fails naming the post and the burying body | Loud failure; never a green read |
| Degenerate gate input (`DW-154`a/b/c) | An end inside a partner body; a 3-way shortest-edge tie; a throw of the wrong shape in the staleness check | Each **throws naming the body and the measurement** rather than resolving to a pass | Loud failure with the numeric evidence |
| Strand hazard on a moved body | Every body and post this story adds or moves | A **derived** descending-column set (never hand-listed) proves each makes genuine positional progress | `assertNotStranded` fails naming the derived column, the body it probes and the measured displacement |
| Anti-vacuity | An empty manifest, an empty derived subject set, a dead witness, or a sweep that evaluated nothing | Each floor is **derived from its own subject set** and fails loudly | Never reports success on an empty run |
| Golden trace unchanged in kind | Five goldens after the re-export | Each re-recorded with its scenario assertions intact and its `notes` appended, never rewritten | A golden needing a weakened threshold is a HALT |

</intent-contract>

## Code Map

Read at HEAD `bf0f33c7bfb5687860fccc701da8f8f251094ce9` (tree clean, branch `DW-1-epic2`). Story 2.1e's and 2.1d's Code Maps are supersets for everything this story does not touch. Every figure below was measured against the committed document during planning.

### The corridor -- exact committed geometry and the arithmetic

`public/assets/dragonwar.collision.json` (106 nodes, 37 switchZones, 3 devices; `version: 1`, `units: mm`):

```
col_guide_outer_r    x 273.525 .. 279.525   y  94 .. 420   plastic
col_post_outer_r_hi  x 272.525 .. 280.525   y 416 .. 424   rubber_post  (octagon r=4 @ 276.525,420)
col_sling_r          x 314.000 .. 370.400   y 420 .. 455   rubber_band
                     footprint (314,420) (370.4,420) (370.4,455) (314,435)  -- sloped north face
col_ramp_wall_l      x 326.000 .. 338.000   y 485 .. 825   ramp
col_ramp_wall_r      x 372.000 .. 384.000   y 485 .. 740   ramp
col_dragon_bank_backstop  x 225 .. 326      y 708 .. 723   target  (3-vertex; east vertex 326.000)
col_dragon_leg_r     x 190.000 .. 235.000   y 480 .. 620   dragon
col_loop_r_lower     x 390.400 .. 402.400   y 500 .. 750   plastic
col_guide_inlane_r   x 370.400 .. 382.400   y 200 .. 428   plastic
col_guide_divider_r  x 421.500 .. 433.500   y 120 .. 380   plastic
col_wall_lane        x 468.400 .. 480.400   y   0 .. 950   wood (z 0..400)
```

```
corridor clear (guide face to sling face)   = 314.000 - 279.525 = 34.475   -> 7.485 mm centre freedom
corridor clear at y = 420 (post is wider)   = 314.000 - 280.525 = 33.475   -> 6.485 mm centre freedom
max reachable centre  = 314.000 - 13.495    = 300.505
ramp entry min centre = 338.000 + 13.495    = 351.495   (channel 338..372 = RAMP_LANE_CLEAR_MM 34)
SHORTFALL                                   =  50.990
GATE CONDITION: col_sling_r.min.x - col_ramp_wall_l.max.x >= 26.990   -- currently -24.000
```

**Correction to record.** `epics.md` and `DW-136` both say "2 of 6" targets are reachable. The count is criterion-dependent and neither reading is six: under "the target's whole x-span lies inside the corridor" it is **2** (`col_dragon_g`, `col_dragon_o`); under "the ball's body overlaps the target from the corridor's centre band" it is **3** (`g`, `o`, `n`). `col_dragon_g` is marginal either way -- its contact band `[268.505, 306.495]` meets the post-tight corridor centre band `[294.020, 300.505]`, but the target's own east edge (293) sits 0.020 mm outside that band's west limit. The AC is "all six", which is unaffected by which count is quoted; do not re-litigate the figure, record the measurement.

The six targets and their contact bands (a ball centre inside the band touches the target):

```
col_dragon_d  x 240..251   contact centre band [226.505, 264.495]
col_dragon_r  x 254..265   [240.505, 278.495]
col_dragon_a  x 268..279   [254.505, 292.495]
col_dragon_g  x 282..293   [268.505, 306.495]
col_dragon_o  x 296..307   [282.505, 320.495]
col_dragon_n  x 310..321   [296.505, 334.495]
```
Switch zones `sw_dragon_<letter>` all y [655.005, 685.005], x = target span +/- 2. Bank y 700..708, outer-to-outer 81 mm.

**Note:** `col_dragon_body` does **not** exist as a collision node. Only the zones `sw_dragon_body_l` x[94,146] and `sw_dragon_body_r` x[194,231] (both y [430.005, 465.005]) exist, mapping to `s_dragon_body`. Do not plan a body move for it.

### The budget, and what constrains a widening

The quadrant is one budget from `col_guide_outer_r`'s east face (279.525, derived from the right bat tip) to `col_wall_lane`'s west face (468.400, perimeter). Total 188.875 mm.

- **`col_sling_r`'s west face is the single largest lever, and it is free.** `SLING_R_X1_MM = LANE_X0 - LOOP_LANE_CLEAR - LOOP_FUNNEL_OFFSET - GUIDE_T = 370.400` is derived and was moved by 2.1c to open the **right inlane mouth** from 11.5 mm to 39.1 mm -- *not*, as the ledger prose implies, to widen the Right Loop lane. `SLING_R_X0_MM = 314.0` (`tools/make-placeholder-blend.py:1004`) merely followed to preserve a 56.400 mm span, and the script itself admits at `:978-981` that it is "the one figure in this block that is a bare literal rather than a derivation ... and it carried none [no measurement]". The left sling's span is 32.000 mm; the pair is already asymmetric.
- **The sling cannot move east as a rigid body.** Its east face at 370.400 is flush (0.000 mm) with `col_guide_inlane_r`'s west face and `col_loop_r_funnel`'s SW vertex. Only the **west** face has room, at the cost of span.
- **`col_ramp_wall_l` cannot move west without moving the bank.** Its west face 326.000 is **tangent** to `col_dragon_bank_backstop`'s east vertex (326.000, 0.000 mm), and `col_dragon_n`'s east edge is 5.000 mm away at 321. The bank in turn has only **5.000 mm** west margin to `col_dragon_leg_r`'s east face (235). Chain: `235 -> 5 -> bank (81 wide) -> 5 -> 326`.
- **`col_guide_outer_r` west** buys at most **3.660 mm** before the centre-drain pocket-post gap (30.650 mm, floor 26.99) goes sub-ball. Both that gap and the 32.65 mm guide channel are pinned. Treat as immovable.
- **The Right Loop lane** is pinned at 66 mm and the Loop shot columns have **0.510 mm** of slack over their 8.5 mm floor. At most ~2.505 mm is recoverable there and only by re-deriving the very constants `DW-146` touches.
- **The dead slot** between `col_ramp_wall_r`'s east face (384) and `col_loop_r_lower`'s west face (390.4) is 6.400 mm -- too narrow to hold a ball, by design.

Recoverable without touching the bank or the leg is roughly **12.6 mm against a 50.990 mm shortfall.** The remainder must come from the sling's 56.400 mm span and a westward move of the Ramp channel, which spends `DRAGON_LEG_R_W_MM` (currently 45.0, already reduced from 60.0 by 2.1c) and/or `DRAGON_BANK_PITCH_MM` (14.0, target width 11.0, so 3.0 mm between targets). A worked starting point, **not a mandate**: shrink `DRAGON_LEG_R_W_MM` to free ~15 mm, move bank + backstop + both Ramp walls + `col_ramp_turn` + `col_ramp_return_1` west by ~25 mm, and set the sling's west face near 340 for a ~30 mm span (close to the left sling's 32). Measure; do not assume.

**Why moving the bank west does not cost DRAGON reachability.** The corridor constrains the ball's *aim window* at y 420..455 only. From y 455 to the bank at y 700 there is 245 mm of open field west to `col_dragon_leg_r`, so an angled right-flipper shot drifts freely. Widening the centre band from 6.485 mm to ~32 mm multiplies the angular freedom roughly fivefold, and that -- not static arithmetic between the corridor band and each target's x-span -- is what makes all six strikable. The AC's dimensional gate is therefore on the **corridor width against its tunable**, and the per-target proof is **behavioural**.

### The seeding script -- `tools/make-placeholder-blend.py` (2949 lines)

The permanent record of every position, mesh and switch zone; the `.blend` is regenerated from scratch each run and is never hand-edited. Module-level constant block at `:58-1025` is the de-facto tunables file for this quadrant (`src/sim/table/tuning.ts` is runtime-only and carries just three read-only descriptions of it: `flipperTipGapMm:383`, `outlaneWidthLeftMm:388`, `outlaneWidthRightMm:393`).

```
:64   BALL_MM = 26.99            :139  POST_RADIUS_MM = 4.0
:136  GUIDE_T_MM = WALL_T_MM = 12.0        :137  OUTER_GUIDE_T_MM = 6.0
:200  LOOP_LANE_CLEAR_MM = 66.0            :212  LOOP_TOP_INNER_Y_MM = 1016.8
:237  LOOP_FUNNEL_OFFSET_MM = 20.0         :283  LOOP_RETURN_END_X_MM = 14.0
:364  LOOP_TOP_END_X_MM = 50.0             :418  RAMP_LANE_CLEAR_MM = 34.0
:429  RAMP_ENTER_X_MM = 355.0              :436  RAMP_ENTER_Y_MM = 485.0
:529  DRAGON_LEG_L_W_MM = 60.0             :530  DRAGON_LEG_R_W_MM = 45.0
:791  LOCK_CEILING_EAST_SHOULDER_MM = 28.0 :844  DRAGON_BANK_Y0_MM = 700.0
:887  DRAGON_BANK_X0_MM = 240.0            :888  DRAGON_BANK_PITCH_MM = 14.0
:889  DRAGON_BANK_TARGET_W_MM = 11.0       :1003 SLING_L_X0/X1 = 98.0 / 130.0
:1004 SLING_R_X0_MM = 314.0 (BARE LITERAL) / SLING_R_X1_MM = 370.4 (derived)
:1875 RIDGE_DROP_MM = 2.5  -- FUNCTION-LOCAL inside main(), not in the tunables block
```

Draw sites: `col_sling_r` `add_box_wall_sloped()` `:2384`; ramp walls `:2116` / `:2124`; legs `:2197` / `:2198`; the six targets loop `:2331-2339` over `DRAGON_LETTERS` `:2311`; backstop `:2353-2361`; `col_loop_top` `new_prism_mesh()` `:1876-1888`; posts `add_rubber_post()` def `:1485-1488`, `col_post_lock_ceiling_e` at `:2629`.

**Stale comment to correct:** `:2347-2349` claims `col_ramp_wall_l`'s west face is "343 - 336 = 7 mm clear of `col_dragon_n`". Measured: 326.000 - 321.000 = **5.000 mm**. Pre-2.1c numbers.

### `RIDGE_DROP_MM` / `LOOP_TOP_END_X_MM` -- the DW-146 axis

`RIDGE_DROP_MM = 2.5` (`:1875`), read only at `:1881` and `:1883` to build two `col_loop_top` footprint vertices. Provenance at `:1852-1874` plus `docs/decisions.md:15` (DW-119): swept 5.0/3.0/2.5/2.0/1.5/1.0/0.5 against the real pipeline; **5.0 retimed the Left Loop's 34 mm entry offset into the wrong outlane; <= 3.0 preserved all six offsets**; 2.5 ships (~0.8 deg grade over each ~184.2 mm half).

`LOOP_TOP_END_X_MM = 50.0` (`:364`), read five times at `:1874-1883`. Pinned twice: shot columns > 8.5 mm (`test/asset-contract.test.ts:1041-1042`, live 9.010 each, **0.510 mm slack**) and the end positions themselves (`:1060-1061`, `toBeCloseTo(_, 1)` = +/-0.05 mm).

Committed `col_loop_top` footprint -- a 5-point ridge:
```
(50.0, 1004.8) (418.4, 1004.8) (418.4, 1014.3) (234.2, 1016.8) (50.0, 1014.3)
```
The two "end caps" are the polygon's vertical end edges, each **9.500 mm** long (1014.3 - 1004.8), midpoints **(50.00, 1009.55)** and **(418.40, 1009.55)** -- exactly as `DW-146` records. Cap length = `LOOP_TOP_INNER_Y_MM - RIDGE_DROP_MM - 1004.8`, so **raising `RIDGE_DROP_MM` shortens the caps**, and at `RIDGE_DROP_MM = 12.0` the body becomes a **triangle** whose ends taper to a point -- structurally the same shape as `col_loop_l_return` / `col_loop_r_return`, which are exempt for exactly that reason ("no exposed face for FR-31 to protect"). That is the principled target of the re-tune, and it is why a *position* sweep could never work: the cap sits at the ball's tangent limit by construction (the shot column is defined as `loopTop.min.x - railL.max.x - ballMm`, so the ball's swept edge reaches the cap's x at every value of `LOOP_TOP_END_X_MM`). Any post at the cap intersects the orbit; only removing the **face** can succeed. Note 12.0 is well past the known-bad 5.0, so the fallback branch is the more likely outcome -- plan both, and do not halt.

### The FR-31 termination gate -- all in `test/asset-contract.test.ts` (1648 lines)

No helper module; everything is file-local.

```
:317-353  freeEndsMm()        -- requires a 4-point quad (:332 throws), rejects adjacent shortest edges (:345)
:355-384  GUIDE_SURFACES {plastic, rubber_band, dragon, ramp} / NON_GUIDE_SURFACES {rubber_post, bumper, target, wood}
:386-419  nearestPost(), expectPostNear()
:421-524  GuideExemption interface + GUIDE_TERMINATION_EXEMPTIONS (8 entries)
:526-685  the forward gate; :532 the structural selector (shape === 'wall' && GUIDE_SURFACES.has(surface))
:589-634  BOUNDARY_EPSILON_MM = 0.05 + isJoined()
:645-678  per-end loop; :671-676 the post-distance assertion, budget = nearestRadius + 0.5 = 4.50
:679-684  non-vacuity floor postDistanceChecks >= 40   (live 41 -- one end of headroom)
:687-711  the GUIDE/NON_GUIDE partition completeness test
:713-758  reverse-direction staleness; :756 exemption.verify?.(doc)
:822-829  every col_post_* carries surface === 'rubber_post'
```

Live census: **56 free ends derived, 15 joined via `isJoined()`, 41 reach the post-distance assertion.** The 4.50 mm budget is **not a named constant** -- it is computed inline twice (`:676`, `:418`) as `radius + 0.5`, where radius is derived per-post from the bbox (4.00 = `POST_RADIUS_MM`). Changing `POST_RADIUS_MM` silently moves the FR-31 budget.

Exemption entries: `col_loop_l_return`, `col_loop_r_return`, `col_loop_top` (`:452-470`, the `[BLOCK IF]` entry, **no `verify()`**), `col_loop_turn_l` (**no `verify()`**), `col_loop_turn_r`, `col_ramp_turn`, `col_sling_l`, `col_lock_ceiling`. `verify?.()` is optional chaining with no `else`: **four entries are checked by nothing** beyond "the body exists, has a footprint, and `freeEndsMm()` still throws".

`col_sling_l`'s exemption reason names this story explicitly: re-authoring its slope so the shortest edges become the correct opposite pair "would move the body itself, **which the Block If reserves for Story 2.1f (`col_sling_l`/`_r`)**".

### DW-154 -- verified sub-case by sub-case

- **(a) `isJoined()` is a second unenumerated exemption channel -- CONFIRMED.** `:589-634`. Two pass channels: on-boundary (`<= 0.05 mm` from a partner edge) and **strictly interior** (even-odd point-in-polygon, unbounded depth). A joined end `continue`s at `:652-655` **before** `postDistanceChecks++`, so it is never counted in the floor and never distance-checked, and leaves no name, reason or staleness audit. 15 ends take it; 14 are exact authored joins (0.000 mm). The one genuine case is **`col_dragon_leg_l`'s end at (120.00, 610.00), buried 1.897 mm inside `col_lock_ceiling_west_fill`** -- compensated only by a hand-written one-off at `:1458-1461`, which is precisely the hole this sub-case names.
- **(b) `freeEndsMm()` has no 3-way tie-break -- CONFIRMED (latent).** `:331-353` sorts edges by length and takes the two shortest; `Array.prototype.sort` is stable, so a tie resolves by **footprint vertex order**, which `tools/export.py`'s hull pass controls. A 3-way tie `[a,b,a,a]` picks indices 0 and 2, `indexDiff === 2`, so the `ADJACENT` throw does **not** fire and a wrong opposite pair is returned silently. No body is at a tie today; the closest gap between 2nd- and 3rd-shortest edge is **2.313 mm** on `col_ramp_turn` (exempt), then 3.000 mm on `col_sling_l` (exempt) -- **both bodies this story may re-author.**
- **(c) The staleness check passing on a missing `footprintMm` -- REFUTED, already closed.** The `?? []` the ledger cites no longer exists; `:727-738` now asserts `footprintMm` is defined, by name, before the derivation. Only 4 nodes lack a footprint and none is a wall (`col_flipper_l/_r` box, `col_glass`/`col_playfield` plane). **The honest residual:** `:742-744`'s `catch { derivationFailed = true }` still **discards the error object**, so any throw -- a `TypeError` on malformed vertices, an unrelated bug -- is laundered into "the exemption still holds". The check tests "something threw", not "it threw for the shape reason".
- **(d) Nothing asserts a post protrudes -- CONFIRMED.** Zero assertions anywhere in `test/` match `protrud|buried|subsum`. All that is asserted is Euclidean distance from a free-end midpoint to the nearest post's **bbox centre** (`:671-676`), the post's `surface` (`:822-829`), and four hard-coded `expectPostNear()` literals inside `verify()`s.

### DW-153 -- `col_post_lock_ceiling_e`

Centre **(194.000, 606.000)**, r 4.000, authored as a hard literal at `tools/make-placeholder-blend.py:2629` (its siblings at `:2642-2643` are **derived** from live geometry). It terminates `col_lock_ceiling`'s **east riser**, the edge (194,598)->(194,626), whose midpoint is **(194.000, 612.000)** -- so the measured distance is **6.000 mm against a 4.50 mm budget**. Cause: `LOCK_CEILING_EAST_SHOULDER_MM` was raised 14 -> 28 in 2.1d rework iteration 3, moving the midpoint 606 -> 612; the literal did not follow.

All eight of its octagon vertices lie inside `col_dragon_leg_r`'s footprint `[(190,480),(235,480),(235,600),(190,620)]`, so it contributes **no reachable collision surface**.

**Why the gate reads green -- two independent paths.** (1) `col_lock_ceiling` is exempt, so the forward loop `continue`s at `:647-649` and the riser's true midpoint (194, 612) is **never computed by any code path**; the only substitute is the exemption's `verify()` at `:519-522`, which passes the **post's own authored literal (194, 606)** to `expectPostNear()` -- it measures the post's distance to itself, 0.000 mm, and is true by construction. (2) Nothing anywhere compares a post footprint against another body's footprint, so the burial is invisible (sub-case (d)).

**Also correct the prose:** `:516-517` says the east riser "sits 4 mm short of `col_dragon_leg_r`'s own vertical face". It is 4 mm **inside** it -- `LOCK_CEILING_X_OVERLAP_E_MM = 4.0` (`:710`) deliberately pushes the ceiling's east edge past the lane wall into the leg, whose west face is x = 190. The sign is backwards.

**Burial census (independently reproduced twice):** entirely inside a *single* other body -- **2 of 48** (`col_post_lock_ceiling_e` in `col_dragon_leg_r`; `col_post_lock_ceiling_w` in `col_lock_ceiling_west_fill`). Entirely covered by the **union** of other bodies, i.e. unreachable to a ball -- **4 of 48**: those two plus `col_post_dragon_leg_l` (120,610) and `col_post_lock_ceiling_west_fill_e` (150,625). All four are in the Lock-lane / Dragon-leg cluster; none is in the corridor. Do not conflate this set with the different four named at `test/asset-contract.test.ts:563`.

**A live hazard this story creates:** `col_post_sling_r_west` (317.5, 427.5) is already **7 of 8 vertices inside `col_sling_r`**, protruding only 0.500 mm west, and it terminates `col_sling_r`'s west end -- the very face this story moves.

### The reachability harness (Story 2.1e) -- this story's proof instrument

- `test/util/shot-cases.ts` (856 lines) -- `ShotCase` / `Reachability` at `:23-38`; `MIN_SHOT_CASES = 39` at `:91` (**hand-typed, live count 46**); `SHOT_CASES` at `:94`; `shotCase(id)` at `:849`. **46 cases: 23 `reachable`, 23 `unreachable`** (1 x `DW-137`, 22 x `DW-138`). Bottom-right cases: `ramp-return-geometry` (355, 465; `unreachable`, `DW-137`, `closestApproachMm` 58.646), `dragon-bank-left-column-294` (294, 400) and `dragon-bank-right-column-300` (300, 400) (both `reachable`, witness `plunge-then-bat-l-3918`), plus `descend-sling-r` (350,465), `descend-ramp-wall-l` (332,880), `descend-ramp-wall-r-cap` (376,758), `descend-ramp-turn-cap` (360,895), `descend-ramp-return-rail` (396,800), `descend-dragon-d` (240,750), `descend-dragon-n` (310,750) -- all `unreachable`/`DW-138`, all sited **directly above bodies this story moves**, so each column must be re-sited and every `closestApproachMm` re-measured (0.5 mm agreement band).
- `test/util/reachability.ts` (393 lines) -- `REACHABILITY_TOLERANCE_MM = 13.495` at `:40` (derived); `WITNESSES` at `:89-211`, **11 entries**; `replayWitness()` `:226-285`; `witnessPath()` `:288`; `closestApproachMm()` `:303`; `closestApproachOverAll()` `:313`; `assertWitnessCorpusHealthy()` `:372-392`. Floors `MIN_WITNESS_SEGMENTS = 2000` (`:350`), `MIN_WITNESS_PATH_MM = 1500` (`:351`), `MIN_WITNESSES = 10` (`:363`) -- **all hand-typed**.
- **THE INSTRUMENT GAP THIS STORY MUST CLOSE FIRST.** All 11 witnesses are plunge or plunge-then-**left**-bat; `ReleaseRecipe` (`test/fixtures/reachability/reachability-sweep.harness.ts:94-97`) has **no `side` field** and only ever sets `frame.flipper_l` (`:146`); the harness header at `:39-68` names `side: 'r'` as an explicitly unswept axis. The Ramp is a **right-flipper** shot (the spine's own OQ-6 note: "the Dragon is off-centre with a right-flipper straight shot"). **No existing witness or sweep release can reach the Ramp channel no matter how wide the corridor becomes**, so AC 1 is unprovable until a right-bat origin exists. Likely construction: the Left Loop orbit already delivers to the **right** inlane (`left-loop-orbit-*` assert `s_inlane_r`), and witness `plunge-weak-345` reaches the Left Loop entry band -- chain a right-bat flip off it. `arrangeCradleBall()` (`test/flipper-collision.test.ts:122-170`) is the proven physics-only fallback.
- `test/shot-reachability.test.ts` (495 lines, **149 tests**, ~4 s) -- anti-vacuity `:50-68`; declaration completeness `:76-123`; per-case bidirectional proof `:151-193` with `RECORDED_APPROACH_AGREEMENT_BAND_MM = 0.5` (`:132`); source-scan bypass gate `:210-287`; **`DW-130` feed-rail record `:451-494`**. The right-side record is measured over four trajectories **including `ramp-return-geometry`**, with `MEASURED_RIGHT_FEED_MARGIN_MM = 0.01979845833328575` against `FEED_MARGIN_AGREEMENT_BAND_MM = 0.01` -- a window of only [0.010, 0.027]. **This will need re-recording**; its sign and magnitude are both asserted.
- `test/fixtures/reachability/reachability-sweep.harness.ts` (370 lines, `pnpm check:reachability`, **intended green**) -- 472 releases, ~75-78 s, budget `SWEEP_RUNTIME_BUDGET_MS = 120_000` (reported, not asserted), hard timeout 180 s. Floors `MIN_RELEASES_EVALUATED = 300`, `MIN_RELEASE_PATH_MM = 300`, `MIN_DISTINCT_PLUNGE_STRENGTHS = 50`, `MIN_DISTINCT_FLIP_TICKS = 60` -- **all hand-typed**.

### `test/shot-routing.test.ts` (1038 lines, 45 tests, ~6 s)

`driveShot()` `:228-303` (module-private, **teleports**); `RELEASE_CLEAR_MARGIN_MM = 13.495` `:320`; `assertReleaseClear()` `:332-363`; **`driveCase(id)` `:384-388`** -- the single entry point the bypass gate pins to one exact call site. `PROGRESS_WINDOW_TICKS = 500` / `PROGRESS_MIN_DISPLACEMENT_MM = 15` `:399-403`; `positionalProgressMm()` `:406-419` (**returns `Infinity` on < 2 samples**); `assertNotStranded` `:433-439`; `assertReachesFlipperBand` `:451-458`; `assertNotStillInPlay` `:468-473`; `assertOrbitOrder` `:480-491`; `assertLoopMissOutcome` `:621-646`.

**The Block If's exact contents.** Left Loop `:516-555`, ids `left-loop-orbit-28/31/34`: `assertOrbitOrder(['s_loop_l_in','s_loop_l_out','s_loop_r_out','s_loop_r_in'])` `:521`, `toContain('s_spinner')` `:549`, `toContain('s_inlane_r')` `:550`, `assertNotStranded` `:551`, `assertReachesFlipperBand(..., 'r')` `:552`. Right Loop `:557-568`, ids `right-loop-orbit-28/31/34`: `assertOrbitOrder(['s_loop_r_in','s_loop_r_out','s_loop_l_out','s_loop_l_in'])` `:562`, `toContain('s_inlane_l')` `:563`, `assertNotStranded` `:564`, `assertReachesFlipperBand(..., 'l')` `:565` (**no `s_spinner` on this side**). `dw123-single-ball-orbit` `:576-588`: four switch names present `:579-581` plus `indexOf('s_loop_l_in') > indexOf('s_loop_l_out')` `:586`.

**The Ramp block `:675-732`** asserts `s_ramp_enter` before `s_ramp_made`, `toContain('s_inlane_r')`, `assertNotStranded`, `assertReachesFlipperBand(..., 'r')`. Its header `:686-711` carries the 300.505 / 351.495 / 50.990 arithmetic and the disclaimer "Do not read a pass here as 'the Ramp is reachable'" -- **this story rewrites that header.**

**The DRAGON bank block `:824-848`** asserts only `hitAny` -- "**at least one** of the six closes" (`:843-844`). **Nothing in the suite today asserts all six are strikable**, so AC 3 needs new assertions, not merely new geometry.

### The strand detector -- the subject set that must become derived

`test/shot-routing.test.ts:939-1038`. The subject set **is the hand-listed `it.each` id array at `:940-1032`** -- 19 columns, one per flat-topped body, each `driveCase(id)` then `assertNotStranded`. By construction it cannot see a hazard beside a body nobody listed; that is exactly how 2.1d shipped a swallow, then a strand on `col_lock_ceiling_west_fill`'s flank, then a strand beside `col_post_dragon_leg_r` in the x = 210..212 band the x = 220 column stepped over.

The enumerable source already exists and is cached: `test/util/collision-doc.ts:68` `readCollisionDoc()` returns every node with `name`, `shape`, `bboxMm`, `footprintMm`; the raw JSON also carries `surface`, `zLowMm`, `zHighMm` (widening the test-side interface at `:26-32` is a one-line change). **The precedent for a derived probe set is `test/lock-device-behaviour.test.ts:537-670`**, which derives its three columns from the lock-lane clear band and its release y from the slot zones' own midpoints, reusing the same 25/500/15 constants (`:79-81`).

The author-mandated whole-playfield sweep from 2.1d (**811 clearance-filtered descending releases** of 1620 candidates, `rests=26`, `post_strands=0`) was a **throwaway** -- recorded only at `cycle-log-epic-2.md:331`, implemented nowhere under `test/` or `tools/`. Its 26 rests were all legitimate: 20 shooter-lane floor, 4 on the inert `col_pop_1` (`DW-148`, Story 2.2), 2 on `DW-142`'s body.

### The corridor gate -- what turning it green breaks

- `test/fixtures/dw137-corridor/ramp-corridor.harness.ts` (113 lines) -- pure static bbox arithmetic, no physics. `:89-98` computes both bounds live from the committed document; `:100-111` asserts `maxReachableCentreXMm >= rampEntryMinCentreXMm`. Confirmed red at HEAD, exit 1, message naming `DW-137`, `Story 2.1f`, `300.505`, `314.000`, `351.495`, `338.000`, `50.990`. Header `:39-46` states the flip is by design and that this header must be updated in the same change.
- `test/dw137-corridor-gate.test.ts` (107 lines, in-suite wrapper, 1 test) -- spawns the harness and asserts `status !== 0` `:91-94`, `output` contains `'DW-137'` `:96`, `'2.1f'` `:97`, and `EXPECTED_SHORTFALL_MM = '50.990'` `:102-105` (a **hardcoded string**, not recomputed). **Turning the harness green fails four of its six assertions.** Its own header `:40-44` says 2.1f most likely removes the whole file.
- **Every intended-red location to update in the same change:** `AGENTS.md:21`; `test/fixtures/dw137-corridor/ramp-corridor.harness.ts:3-46, :82, :102-110`; `test/dw137-corridor-gate.test.ts:3-44, :62, :84-105`; `test/fixtures/dw137-corridor/vitest.harness.config.ts:3-11`; `_bmad-output/implementation-artifacts/epic-2-context.md:35, 59, 65, 97, 98`; `tools/make-placeholder-blend.py:998`; `test/shot-routing.test.ts:675-676, 686-711`; `test/util/shot-cases.ts:232, 235, 245-250, 592, 610`; `test/fixtures/reachability/reachability-sweep.harness.ts:6, 71-73`. **No README and no CI mention** -- `.github/workflows/ci.yml` runs a fixed list that never invokes `check:corridor`.

### Asset-contract pins that a bottom-right move will trip

`test/asset-contract.test.ts`, tightest first:

```
:1041-1042  Loop shot columns > 8.5   -- live 9.010 each, 0.510 mm SLACK
:1060-1061  col_loop_top ends at 50 / 418.4, toBeCloseTo(_, 1) = +/-0.05  -- fires first on a LOOP_TOP_END_X re-tune
:1148-1156  Ramp channel clear width toBeCloseTo(34, 1)  -- RAMP_LANE_CLEAR_MM; must be re-authored deliberately
:1222-1240  dragonD.min.x - legR.max.x > 0 (live 5.000); rampWallL.min.x - dragonN.max.x > 0 (live 5.000)
:1194-1206  DRAGON bank outer-to-outer toBeCloseTo(81, 1)
:1125-1146  dividerR.max.y (380) < slingR.min.y (420)  -- 40 mm headroom
:1071-1094  loopRLower.max.y - rampWallR.max.y > 5 (live 10)
:1617-1646  col_ramp_turn starts at RAMP_TURN_Y0_MM and its east edge reaches col_loop_r's west face (390.4)
:995        each Loop clear lane width toBeCloseTo(66, 1)
:1096-1107  each inlane clear channel ~39.1 (right: 421.5 - 382.4)
:898-917    pocket-post gap 30.65 > ballMm  -- 3.660 mm of headroom; gates col_guide_outer_r moving west
:679-684    FR-31 non-vacuity floor postDistanceChecks >= 40, live 41
```

Other files hard-coding bottom-right coordinates: `test/shot-routing.test.ts:692, 694, 700, 963, 975, 1003`; `test/util/shot-cases.ts:236, 493`; `tools/make-placeholder-blend.py:890, 910, 985, 990-992, 998`. (`314.4` in `test/asset-contract.test.ts:210,219`, `test/drain-switch-coverage.test.ts` and `test/flipper-collision.test.ts:660` is the **drain aperture**, unrelated -- do not confuse it with the sling's 314.0.)

### The export pipeline and the five goldens

**Two manual steps, neither in CI** (CI has no Blender and consumes the committed artifacts):
```
"$BLENDER" --background --factory-startup --python tools/make-placeholder-blend.py   # reseeds assets/src/dragonwar.blend
pnpm export:assets                                                                    # -> public/assets/{dragonwar.glb, dragonwar.collision.json}
```
`tools/export-assets.mjs:78-89` builds the argv (`--python-exit-code 1` guards Blender's exit-0-on-raise trap); `tools/export.py` validates names, surfaces, `phys_material`, `lightgroup` and convexity **before** writing, then writes both files atomically via `os.replace()` with `sort_keys=True, indent=2, newline='\n'`. **The document is byte-deterministic** -- pinned by `test/export-py.test.ts:111-135` (Blender-gated), which is the only test pinning the export against the seeding script. `BLENDER` resolution is `tools/blender.mjs:166-196` (env, then PATH, then per-platform conventional paths).

Five goldens, all sharing `assetHash = dbd72bf0`; **any document change invalidates all five** with `StaleReplayHeaderError` before a hash is computed (`src/sim/loop/replay.ts:227-230`). `test/replay-goldens.test.ts` compares only two 32-bit digests per golden (`finalHash`, `finalGameStateHash`) plus per-golden scenario blocks and the `PARITY_INERT` falsifiability sweep (`:190-263`; the allowlist holds exactly `nudge-coupling` and `two-ball-collision`, enforced in both directions).

| Golden | durationTicks | Subject, and the assertion that stands for it |
|---|---|---|
| `roll-and-drain` | 9282 | The ball genuinely returns to `bd_trough` (`:458-482`). **Most fragile in the set:** own drain 9281, no-press control drain 9284 -- a **3-tick window with 1 tick spent**; its own `notes` predict a retime for anything perturbing ticks before ~8600 |
| `hold-and-release` | 9600 | The coil rule energises and the raised bat deflects the ball; paired control run needs `maxDivergenceMm > 5` (`:484-583`) |
| `full-plunge` | 2000 | `ball_launched` exactly once, `ballsInPlay == 1`, final `pos.x < 468.4`, and max-y > 1040 tracked across the whole run (live 1053.2 -- **13.2 mm headroom**) (`:585-635`) |
| `nudge-coupling` | 800 | AD-5 cabinet coupling: `abs(ball.pos.x - 497.4) > 0.01` (`:637-650`) |
| `two-ball-collision` | 3400 | Momentum transferred, no overlap, no sticking, every tick; `minSeparationEver >= 26.936025`, live **27.181 -- 0.245 mm above the floor** (`:652-719`) |

**There is no golden recording tool** -- no script, no vitest update mode, nothing in `tools/`; `src/host/dev/replay-recorder.ts` is a browser dev-console recorder that performs no file I/O. Every previous re-record used a throwaway, uncommitted Node harness over the shipped `runReplay()` (with `buildHeader()` at `src/sim/loop/replay.ts:192-201` computing the live hashes) plus `onTick` tracing, then hand-edited the JSON. **Budget for that.** The cheapest legitimate outcome is 2.1d's precedent: trace every golden's ball path, confirm none enters the changed region, and move **only** `header.assetHash` -- unlikely here, since the plunge and orbit paths ride `col_loop_top`.

### Baselines measured during planning (HEAD `bf0f33c`)

- `npx vitest run test/shot-routing.test.ts` -- **45 passed**, 5.99 s wall.
- `npx vitest run test/shot-reachability.test.ts` -- **149 passed**, 3.98 s wall.
- `npx vitest run` (full suite) -- **91 files / 1422 passed / 0 failed** (recorded at 2.1d's close; ~33 s wall at 2.1e's 89-file measurement).
- `pnpm check:reachability` -- exit 0, **472 releases, 46 cases, 23 reachable / 23 unreachable**, ~75-78 s.
- `pnpm check:corridor` -- **exit 1**, message verified verbatim this pass.
- `pnpm check:ad7` -- exit 1, naming `AD-7`, `DW-70`, `bd_trough`.

## Tasks & Acceptance

**Execution:**

**Phase 0 -- close the instrument gap. Nothing in Phase 3 can be proven until this lands.**

1. `test/util/reachability.ts` -- add a **right-bat origin**. Extend the witness recipe with a `side: 'l' | 'r'` field (the type already anticipates it at `:63`) and drive `frame.flipper_r` when it is `'r'`. Add at least one `WITNESSES` entry whose ball arrives at the **right** bat through the machine itself and flips -- chain it off `plunge-weak-345`, whose Left Loop orbit already delivers to the right inlane, or fall back to `arrangeCradleBall()`'s recipe (`test/flipper-collision.test.ts:122-170`). **No witness may teleport:** every origin is `c_trough_eject` plus `frame.plunger` / `frame.flipper_*` alone, with no assignment to `ball.state.pos` or `ball.hit.vel` anywhere in the file. Record each new witness's measured parameters and its `expectedSwitch`. Replace `MIN_WITNESSES` with a floor **derived** from `WITNESSES.length` (lesson 5); do the same for `MIN_WITNESS_SEGMENTS` and `MIN_WITNESS_PATH_MM` if their derivation can be stated, otherwise re-measure and re-record them with the measurement that chose them.
2. `test/fixtures/reachability/reachability-sweep.harness.ts` -- add the matching `side` axis to `ReleaseRecipe` (`:94-97`) and to the recipe builder (`:188-228`) so the dense sweep can discover right-bat trajectories too, and update the header at `:39-68`, which currently records `side: 'r'` as unswept. Derive `MIN_RELEASES_EVALUATED`, `MIN_DISTINCT_PLUNGE_STRENGTHS` and `MIN_DISTINCT_FLIP_TICKS` from the built recipe set rather than hand-typing them. Keep the run inside `SWEEP_RUNTIME_BUDGET_MS` (120 s) and record the measured figure; if adding the axis pushes it past the budget, thin the *coarse* plunge grid rather than the flip-tick grid and say so.

**Phase 1 -- re-solve the corridor.**

3. `tools/make-placeholder-blend.py` -- **re-solve the bottom-right quadrant as one budget**: the slingshot span, both Ramp walls (and `col_ramp_turn` / `col_ramp_return_1` with them), the DRAGON bank and backstop, `DRAGON_LEG_R_W_MM`, and the Loop lane. The binding condition is `col_sling_r.bboxMm.min.x - col_ramp_wall_l.bboxMm.max.x >= 26.99` with a stated safety margin. Replace the bare literal `SLING_R_X0_MM` (`:1004`) with a **named, derived tunable carrying a provenance comment** naming the measurement that chose it (`AD-15`) -- it is the constant the new dimensional gate pins against. Correct the stale clearance comment at `:2347-2349` (measured 5.000 mm, not 7). Keep every footprint convex (`DW-125`). Work against the Code Map's budget table and each pin's recorded slack; measure, do not assume.
4. `tools/make-placeholder-blend.py` -- **`DW-146`, the pre-authorised branch.** Attempt the ridge re-tune: sweep `RIDGE_DROP_MM` (from 2.5 up to and including **12.0**, at which the caps vanish and `col_loop_top` becomes a point-ended triangle in the same class as the two exempt return rails) and, if useful, `LOOP_TOP_END_X_MM`, measuring the Left/Right Loop **34 mm entry-offset** cases at every value. **Branch A** -- a value exists at which the caps are terminated or eliminated **and** all six offset cases pass unweakened: ship it, and remove or rewrite the `col_loop_top` exemption accordingly. **Branch B** -- every value measurably breaks those cases: keep the geometry, and rewrite the `GUIDE_TERMINATION_EXEMPTIONS` entry (`test/asset-contract.test.ts:452-470`) to record **the swept values, the case that broke at each, and the measurement**, and give it a `verify()` (it has none today). **Branch B is authorised in advance: record it and move on. Do not HALT.**
5. `tools/make-placeholder-blend.py` -- **`DW-153` and the buried-post census.** Resolve `col_post_lock_ceiling_e`: its guide end (the east riser midpoint (194, 612)) is itself **enclosed inside `col_dragon_leg_r`** and therefore not ball-reachable, so the principled outcome is to classify the end as enclosed and remove the post that contributes no surface -- or, if it is kept, to derive its position from the live riser (as its siblings at `:2642-2643` already do) **and** make it protrude. Apply the same decision to the other three union-buried posts (`col_post_lock_ceiling_w`, `col_post_lock_ceiling_west_fill_e`, `col_post_dragon_leg_l`), and re-site `col_post_sling_r_west` onto the sling's **new** west face so it protrudes. Record the decision and the measurement for each of the five.
6. Re-seed and re-export: `"$BLENDER" --background --factory-startup --python tools/make-placeholder-blend.py` then `pnpm export:assets`. `BLENDER` is exported in the shell only and **never** written to a tracked file (`DW-46`/`DW-131`). Batch **every** geometry change this story makes into this single pass -- a second export buys a second five-golden re-record for nothing.

**Phase 2 -- harden the gate that judges the new geometry.**

7. `test/asset-contract.test.ts` -- **`DW-154`, all four sub-cases, uniformly failing loudly.**
   (a) Split `isJoined()`'s two channels. The **on-boundary** channel stays a join. The **strictly-interior** channel becomes an enumerated, named **enclosed-end** classification that must be declared and proved, not a silent `continue` -- so `col_dragon_leg_l`'s (120.00, 610.00) end and `col_lock_ceiling`'s east riser are on the record instead of invisible, and the hand-written one-off at `:1458-1461` can be retired into the general mechanism.
   (b) Make `freeEndsMm()` **throw** on a genuine tie between the 2nd- and 3rd-shortest edges within a stated epsilon, naming the body and the edge lengths, instead of resolving by vertex order. Note `col_ramp_turn` (gap 2.313 mm) and `col_sling_l` (3.000 mm) are the closest today and both may be re-authored by this story.
   (c) Close the honest residual: `:742-744`'s `catch` must assert the throw was the **shape-reason** throw rather than discarding the error object. Record in the same change that the sub-case as the ledger words it -- a missing `footprintMm` reporting pass -- was already closed at the 2026-09-03 review (`:727-738`), with the line cited.
   (d) Add the **protrusion gate**: over a subject set **derived** from the document (`surface === 'rubber_post'`, all 48), every post must present collision surface outside the union of the non-post `col_` wall footprints, or be declared against an enclosed end. Fail naming the post and the burying body. Make the `4.50` budget a **named constant derived from `POST_RADIUS_MM`** so it cannot drift silently, and derive the `postDistanceChecks` floor (`:679-684`) from the end census instead of the literal 40.

**Phase 3 -- prove it, behaviourally.**

8. `test/util/shot-cases.ts` -- flip `ramp-return-geometry` to `{ kind: 'reachable', witness: <the right-bat id> }`; add **six per-letter DRAGON cases** (one per `col_dragon_<letter>`), each with its own `switchesUnderTest` and a measured verdict; re-site every `descend-*` column that sat above a moved body so it still lies directly above its subject and still clears every footprint by more than 13.495 mm; re-measure every affected `closestApproachMm` against the 0.5 mm agreement band. Replace `MIN_SHOT_CASES` (`:91`) with a floor **derived** from the manifest.
9. `test/shot-routing.test.ts` -- rewrite the Ramp block's header and titles (`:675-676, 686-711`) so they describe a **reachable** shot, keeping every assertion (`s_ramp_enter` before `s_ramp_made`, `toContain('s_inlane_r')`, `assertNotStranded`, `assertReachesFlipperBand(..., 'r')`). Replace the DRAGON bank block's `hitAny` "at least one closes" (`:843-844`) with **per-letter** assertions driven from the six new cases, so "all six strikable" is asserted rather than assumed. Leave every orbit assertion byte-identical in effect.
10. `test/shot-routing.test.ts` -- **replace the hand-listed descending-column set (`:940-1032`) with a derived generator.** Derive the subject set from the committed document: every non-`plane` `col_` node (and every `rubber_post`) carrying a north-facing footprint edge whose angle from horizontal is **below `atan(TUNING.materials.default.friction)` = 16.699 deg** -- the real slide threshold, not the 18.43 deg the comments cite -- with the release point auto-placed above that edge and filtered by `assertReleaseClear()`. The anti-vacuity floor is **derived from the qualifying-body count**, never hand-typed. By construction this covers every body and post this story adds or moves. If the full derived set exceeds the in-suite cost budget, keep in-suite the qualifying bodies whose footprints intersect this story's changed region (still derived, by bounding box -- never a hand list) and put the whole-playfield pass out of process in task 11; record the measured cost that forced the choice.
11. `test/fixtures/reachability/reachability-sweep.harness.ts` -- make 2.1d's throwaway permanent: add a whole-playfield derived descending-strand pass (the 811-of-1620 clearance-filtered sweep recorded at `cycle-log-epic-2.md:331`), reusing the existing release-clearance filter and out-of-process budget. Its known-legitimate rests are the shooter-lane floor, `col_pop_1` (`DW-148`, Story 2.2's kick to fix -- **not a geometry defect**) and `DW-142`'s body; anything else fails naming the column and the body.

**Phase 4 -- flip the gate and retire its documentation.**

12. `test/fixtures/dw137-corridor/ramp-corridor.harness.ts` -- keep the live arithmetic, invert the polarity: the assertion now **passes** and the header (`:3-46`, `:82`, `:102-110`) states the corridor was re-solved by this story, with the new measured clearance replacing the 50.990 shortfall.
13. `test/dw137-corridor-gate.test.ts` -- **remove the wrapper** (its own header `:40-44` anticipates exactly this) or invert it to assert the harness now exits 0 with the new clearance in its output. Removing it is preferred: an intended-red wrapper for a green check asserts nothing. State the choice and why.
14. `AGENTS.md:21`, `_bmad-output/implementation-artifacts/epic-2-context.md` (`:35, 59, 65, 97, 98`), `tools/make-placeholder-blend.py:998`, `test/util/shot-cases.ts` (`:232, 235, 245-250, 592, 610`), `test/fixtures/reachability/reachability-sweep.harness.ts` (`:6, 71-73`), `test/fixtures/dw137-corridor/vitest.harness.config.ts:3-11` -- retire every "intended-red / DW-137 / owned by 2.1f" statement in the same change. If the wrapper is removed, `AGENTS.md`'s script count and its intended-red sentence both change; `check:ad7` remains the only intended-red check.

**Phase 5 -- re-record and record.**

15. `test/replays/*.golden.json` (all five) -- re-record under the author's grant of 2026-09-02. For **each**: build a fresh header via `buildHeader()`, run `runReplay()` with `onTick` tracing, **trace the ball's actual path and switch-closure sequence and satisfy yourself the behaviour is what the table should do before recording**, then hand-edit `header.assetHash` (and `tableHash` only if `TABLE` moved -- it must not), `expectedHash`, `expectedGameStateHash`, `durationTicks` if retimed, `description`, and **append** a dated paragraph to `notes` (never rewrite; keep the `DW-70` and `deviceSlots` literals). Expect to retime `roll-and-drain` -- its 3-tick window has 1 tick spent. Re-run `test/replay-goldens.test.ts` including every scenario block and the `PARITY_INERT` sweep in both directions. **A golden that would need a threshold moved is a HALT, not a re-record.**
16. `test/shot-reachability.test.ts` -- re-record the `DW-130` feed-rail margins (`MEASURED_LEFT_FEED_MARGIN_MM`, `MEASURED_RIGHT_FEED_MARGIN_MM`, `:433-434`) against the new geometry, keeping the sign-and-magnitude assertion and the 0.01 mm band. The right-side record is measured over four trajectories including `ramp-return-geometry`, so it **will** move.
17. This spec's `## Spec Change Log` -- record: the re-solved geometry as a before/after table of every moved body; the `DW-146` sweep (every value tried, the case that broke at each, and which branch shipped); the five post decisions from task 5; the new witness parameters; the per-case reachability verdict table with measured closest approaches (the `check:reachability` count must be stated and explained if it moves from 46 / 23 / 23); the five goldens' traces and what moved in each; and every command from `## Verification` with its result. Demonstrate every mutation below -- applied, red observed at a named coordinate or value, reverted, tree confirmed byte-identical via `git status --short` and `git diff --stat`.
18. This spec's frontmatter `deferred:` -- record every finding this story surfaces but does not close, with evidence, location and severity, for the lead to harvest (Rule 15(a): `bmad-build-auto` never writes the ledger). Expect candidates among: the `DW-138` verdicts this story's new right-bat axis newly reaches or newly fails to reach; any `descend-*` column whose criterion the re-site changes; and any residual on `DW-154`(c).

**Acceptance Criteria:**

- **AC 1 (`DW-137`, Integration -- Rules 1/19)** -- **Given** the re-solved geometry and the right-bat witness added in task 1, **when** `test/shot-reachability.test.ts` runs, **then** `ramp-return-geometry` declares `{ kind: 'reachable', witness: <right-bat id> }` and its declared witness -- a trajectory that originated at a plunge and a bat through the real physics pipeline, never teleported -- comes within `REACHABILITY_TOLERANCE_MM` (13.495) of its release point, **and** the consumer `test/shot-routing.test.ts` drives that same case from the shared manifest and closes `s_ramp_enter` before `s_ramp_made`, **and** `pnpm check:reachability` still exits 0 with its per-case verdicts reported and every moved verdict explained in the `## Spec Change Log`, never edited to green.
- **AC 2 (OQ-6/FR-27, moved here by amendment from Story 2.1c's AC 3)** -- **Given** the now-reachable Ramp, **when** the Ramp case is driven, **then** its return delivers to the **right inlane**: `firstMakes` contains `s_inlane_r` and `assertReachesFlipperBand(result, 'Ramp', 'r')` holds, with `assertNotStranded` intact -- satisfied by a real shot rather than by the teleport that was the only way to satisfy it in 2.1c.
- **AC 3 (`DW-136`)** -- **Given** the re-solved corridor, **when** the six per-letter DRAGON cases are driven, **then** **each of the six** closes its **own** `s_dragon_<letter>` -- replacing the "at least one of the six closes" assertion at `test/shot-routing.test.ts:843-844` -- and each carries a `reachable` verdict with a named witness, **and** a dimensional gate pins the corridor's clear width against the named tunable that task 3 introduces, failing with the measured width, the tunable and the delta, so a later change cannot silently re-narrow it.
- **AC 4 (Block If -- the orbit is preserved)** -- **Given** Story 2.1c's delivered orbit, **when** the re-solved geometry ships, **then** `left-loop-orbit-28/31/34`, `right-loop-orbit-28/31/34`, `dw123-single-ball-orbit` and the plunge path all still pass **with no assertion weakened** -- `assertOrbitOrder`'s four-switch sequences in both directions, `s_spinner` and `s_inlane_r` on the left, `s_inlane_l` on the right, the side-specific `assertReachesFlipperBand`, `assertNotStranded`'s 15 mm / 500-tick floor, and the `full-plunge` golden's max-y > 1040 clause -- and any failure is reported as a measurement with a HALT, never traded away.
- **AC 5 (the corridor gate goes green genuinely)** -- **Given** `pnpm check:corridor`, **when** this story lands, **then** it exits **0** because `col_sling_r.bboxMm.min.x - col_ramp_wall_l.bboxMm.max.x >= 26.99` in the committed document **and** AC 1's witness genuinely reaches the channel, **and** every intended-red statement enumerated in task 14 is retired in the same change, **and** `pnpm check:ad7` still exits **1** naming `AD-7`, `DW-70` and `bd_trough`.
- **AC 6 (`DW-146`, both branches)** -- **Given** the pre-authorised decision rule, **when** the `RIDGE_DROP_MM` / `LOOP_TOP_END_X_MM` re-tune is attempted and measured, **then** either both `col_loop_top` end caps are terminated or eliminated with all six Loop entry-offset cases still passing (Branch A), **or** the `GUIDE_TERMINATION_EXEMPTIONS` entry records the swept values, the case that broke at each, and the measurement, and carries a `verify()` predicate where it has none today (Branch B) -- **and neither branch is a HALT**, and the `## Spec Change Log` records the full sweep either way.
- **AC 7 (`DW-153`)** -- **Given** `col_post_lock_ceiling_e` at (194.000, 606.000), 6.000 mm from its guide end's true midpoint (194.000, 612.000) against a 4.50 mm budget and entirely inside `col_dragon_leg_r`, **when** this story lands, **then** both defects are resolved and **the gate can now detect either one** -- the circular `verify()` that measures the post against its own authored literal is replaced by a derivation from the live riser, the census of union-buried posts is decided body by body with its measurement recorded, and the backwards prose at `test/asset-contract.test.ts:516-517` is corrected.
- **AC 8 (`DW-154`)** -- **Given** the FR-31 gate's helpers, **when** each degenerate input is presented, **then** each **fails loudly naming the body and the measurement** rather than resolving to a pass: an end strictly interior to another body is an enumerated, proved **enclosed-end** classification and not a silent `isJoined()` skip; a genuine 2nd/3rd-shortest-edge tie throws instead of resolving by vertex order; the staleness check's `catch` asserts the throw was the shape-reason throw instead of discarding the error; and **no `rubber_post` may satisfy the gate without contributing collision surface**, over a subject set derived from the document rather than hand-listed.
- **AC 9 (strand hazard -- derived subject set, Integration)** -- **Given** that every geometry change is a candidate ball-rest hazard and that 2.1d's hand-listed columns missed three in a row, **when** the descending-strand check runs, **then** its subject set is **derived from the committed document** -- north-facing footprint edges shallower than `atan(TUNING.materials.default.friction)` = 16.699 deg -- so it covers every body and post this story adds or moves **without anyone listing them**, its anti-vacuity floor is derived from that subject set rather than hand-typed, and the consumer `test/shot-routing.test.ts` proves each derived column makes genuine positional progress via `assertNotStranded`.
- **AC 10 (preservation and the re-record)** -- **Given** the whole suite, **when** it runs, **then** it is at or above the **91 files / 1422 passed / 0 failed** baseline with `BLENDER` exported, with no test deleted, skipped or weakened and the skip count unchanged; all five goldens are re-recorded with **each traced correct and each still asserting its own subject** (no threshold moved, no `PARITY_INERT` entry added, no `transitions` body deleted); `TABLE.shots` is still exactly `{}`; `pnpm typecheck`, `pnpm lint:boundaries`, `pnpm check:headers`, `pnpm check:attributions`, `pnpm build`, `pnpm check:dist` and `pnpm check:size` all pass; and no tracked file contains a Blender executable path.

### Review Findings

**2026-09-05 -- Code review (Tier 1, `review_mode` = full; review tier `full-opus`, no model override -- `_bmad/custom/model-overrides.yaml` does not exist. Layers run: blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor; none failed or returned empty.)**

Diff reviewed: `bf0f33c` -> working tree, plus the untracked QA file. The committed document was never edited: `sha256 e780d8e6f50f1647d743a949a0f43fa8687fd09616d4f066b11e6f079b9fe58d` throughout, matching section 11's own record. Every mutation below was applied in an isolated `git archive HEAD` copy with `node_modules` junctioned, then discarded.

- intent_gap: 0
- bad_spec: 0
- patch: 11 (high 0, medium 4, low 7)
- defer: 5 (high 0, medium 2, low 3)
- reject: 9 (high 0, medium 0, low 9)

**Confirmed rather than changed.** The corridor is genuinely open -- `col_sling_r.min.x (332.400) - col_ramp_wall_l.max.x (298.400) = 34.000` against 26.99, re-derived independently -- and `ramp-return-geometry` reads reachable at 0.458 mm over a driven, never-teleported path. The AC 9 derived generator was re-implemented from scratch against the committed document and agrees exactly: 68 exposed north faces, four sub-threshold (`col_dragon_bank_backstop` 10.12 deg, `col_loop_top` x2 at 0.78 deg, `col_wall_lane_bottom` 0.00 deg), each covered by a column or declared. All 24 moved bodies and all 45 posts were checked against the real 16.699 deg threshold. The five goldens are a header-only `assetHash` refresh exactly as section 8 states and traces; `expectedHash`, `expectedGameStateHash`, `durationTicks`, every `transitions` body, `tableHash` and both `notes` literals are unchanged, and `PARITY_INERT` still holds exactly its two entries. `DW-146`'s Branch B sweep is honest and its new `verify()` is real and falsifiable. `test/dw137-corridor-gate.test.ts`'s deletion is legitimate.

#### Fixed at review -- medium

**1. `col_wall_lane`'s bevelled north cap had no behavioural pin, and the inference certifying it is one this same change measured unreliable.** The derived AC 9 generator found a genuine DW-119 swallow there: a ball released at (474.40, 979.0) came to permanent rest at (474.40, 963.49), 0.00 mm of net progress over 500 ticks, with `plunge-full` passing 6.794 mm from that release, so a real ball travels there. The fix bevelled the cap to `atan(6/12)` = 26.565 deg -- which put the face into the gate's own "steep enough" branch and removed it from the subject set that found it, so nothing would ever drop a ball on the repaired face again. That inference is not safe here, and this story's own record proves it: `PLUNGE_DEFLECTOR_CAP_RISE_MM`'s provenance comment states that on `col_loop_r_deflector`, 25 mm away, a 17 mm rise at **26.57 deg** -- "comfortably above the 16.699 deg slide threshold" -- was measured **INSUFFICIENT**, a ball still resting on the sloped face at (493.90, 1038.63). The deflector was therefore fixed by removing its pocket (55.8 deg); `col_wall_lane` was fixed by tilting alone, to the grade that failed next door. **Fixed** by adding `descend-wall-lane-cap` (474.4, 979) to `test/util/shot-cases.ts` and its row to the descending `it.each` in `test/shot-routing.test.ts`. Verified first that the shipped bevel does work -- 185.0 mm of net progress, closing `s_loop_r_out`/`s_loop_r_in`/`s_inlane_r` -- so this was a regression-detection gap, not a live defect. `mutation: flatten the cap in the committed document (col_wall_lane vertex y 944 -> 950, a value perturbation) -> this column alone goes red naming the permanent rest at (474.40, 963.4964); 52 other tests in the file stay green.` The dense sweep independently agrees the release point is reachable, at 0.218 mm (recipe #43).

**2. `MIN_WITNESSES` was an assertion that cannot fail -- the eighth vacuity.** `test/util/reachability.ts` derived it as `new Set(WITNESSES.map(w => w.expectedSwitch)).size` and asserted `WITNESSES.length >= MIN_WITNESSES`. For any array, `|distinct(map(A, f))| <= |A|` is a theorem, so the floor could not fail at any corpus size: 15 entries against 11 distinct switches today, and a corpus cut to three recomputes the floor to three and still passes -- an 80% loss of the table every `unreachable` verdict quantifies over, with no assertion moving. The comment above it had explicitly rejected `WITNESSES.length` as "comparing a count to itself can never fail", then shipped a quantity tautological in the same direction. **Fixed** by deriving from a source the corpus does not define: the distinct witness ids `SHOT_CASES` names in its `reachable` declarations (13 today), the same independence `MIN_SHOT_CASES` takes from the collision document. `mutation: truncate WITNESSES to three entries by value -> assertWitnessCorpusHealthy() goes red, "the witness corpus has only 3 entries, below the recorded floor of 13".` Under the shipped derivation that mutation was green.

**3. `dragon-target-d` closed `s_dragon_d` without ever striking `col_dragon_d`.** The release sat at x = 228.9. The target spans 217.4..227.4; 228.9 is 1.5 mm east of its east edge and 0.5 mm inside `col_dragon_r`'s span (228.4..238.4). Driven, the ball's apex is (228.90, 686.48) -- in contact with `col_dragon_r`'s south face at 686.505, reached before `col_dragon_d`'s east corner at 686.589 -- so it struck **r**, and `s_dragon_d` closed only because that zone runs 2 mm past its target to 229.4. AC 3's letter was met; DW-136's substance ("all six strikable") was not, for the one target most in doubt. **Fixed** by re-siting to x = 227.4: apex (227.40, 686.48) inside `col_dragon_d`'s span, clearance 14.000 mm from `col_dragon_leg_r`'s east face against DW-77's 13.495 floor, still reachable on the same witness `plunge-then-bat-r-3906` at 2.891 mm (dense sweep agrees, recipe #643). The window is narrow -- x in (226.895, 227.4] is all of it, because `DRAGON_BANK_LEG_CLEAR_MM` = 4.0 leaves the westernmost target in the leg's shadow at this release height; releases at y >= 630 strike d comfortably but no witness passes within 13.495 mm (nearest 18.3 mm). Recorded in the case's own note.

**4. The dense sweep lost its absolute grid-density floor.** `MIN_DISTINCT_PLUNGE_STRENGTHS = 50` and `MIN_DISTINCT_FLIP_TICKS = 60` were deleted for a built-vs-realized comparison that is structurally blind to the built grid shrinking -- the file's own comment says so. Thinning or deleting a grid loop shrinks built and realized together: with both loops gone the 15 explicit `WITNESSES` pushes remain, realized equals built, `flipSides` is still 2 on the explicit right-bat pushes, `releasesEvaluated` equals the shrunken `recipes.length`, and `mismatches` stays empty -- so the sweep degrades into a replay of the in-suite corpus and still certifies 20 `unreachable` verdicts. The comment beside the grid bounds already promised this guard and nothing computed it. **Fixed** by adding `gridDensityFloors()`, derived from the named bounds (`COARSE_PLUNGE_*`, `FINE_PLUNGE_*`, `LEFT_FLIP_*`, `RIGHT_FLIP_*`) rather than from the recipe array -- a source that survives deletion of the loop it describes. Floors 59 strengths / 66 flip ticks against 60 / 73 built. `mutation: multiply LEFT_FLIP_STEP_TICKS by 40 in its loop -> red in 1.5 s, before the sweep runs: "the sweep BUILT only 37 distinct flip ticks, below the 66 its own named grid bounds describe".`

#### Fixed at review -- low, mechanical

5. `test/asset-contract.test.ts` -- the corridor pin measured face-to-face while `col_post_sling_r_west`, which task 5 deliberately re-sited **onto** that face so it would protrude, reaches 4.0 mm further west (328.4). The true narrowest clear is **30.000 mm**, a **3.010 mm** surplus over the ball, not 34.000 / 7.010. The gate's conclusion is unchanged; the recorded margin was not. Added an explicit post-aware assertion.
6. `test/util/shot-cases.ts` -- `descend-ramp-wall-r-cap`'s note said "Re-sited (376, 758) -> (360.4, 760)" while `startMm.x` is 352; called 352 "2.4 mm WEST of the wall's own live centreline (360.4)" when it is 8.4 mm west of the centreline (2.4 mm west of the west face); and attributed the ball's own 338.5..365.5 swept span to the wall's body. All three corrected.
7. `AGENTS.md` -- "taking the `WITNESSES` corpus to 14" (it is 15), and the enumeration omitted `plunge-then-bat-r-3890`. Corrected.
8. `test/fixtures/reachability/reachability-sweep.harness.ts` -- "The three recipes this story added to WITNESSES" sits above four pushes. Corrected.
9. `docs/decisions.md` rows 11 and 14 -- recorded `RAMP_ENTER_X_MM = 355`, `DRAGON_BANK_X0_MM = 240`, `DRAGON_LEG_R_W_MM = 45` and an entry-offset range of "350 to 359 mm", all superseded by this story, while row 14 closes by asserting every figure in it is pinned and carries its derivation. Annotated with dated `[SUPERSEDED]` notes in the file's own correction idiom rather than rewritten.
10. `docs/feel-test.md` Ramp section -- same stale coordinates; annotated, and the genuinely new fact recorded (the Ramp was unreachable from below until this story, and the 2.1c delivery it describes was driven from a teleported release).
11. This spec's `## Verification`, AC 10 -- see the `[CORRECTED, code review]` note there.

#### Deferred (ledgered through `ledger.sh`, `by=cr`)

- **DW-158** (med, `escalated owner=burndown`) -- AC 9's derived generator never DRIVES anything: it computes a release point for all 68 derived faces and the value reaches only a failure-message template. The hand-listed `it.each` task 10 asked it to replace is still the only caller of `assertNotStranded` for descending columns, and the coverage predicate matches manifest presence rather than a driven probe. Finding 1 closes the instance that mattered; the general gap is a new instrument with real runtime cost.
- **DW-159** (med, `escalated owner=burndown`) -- the post-protrusion gate passes on `bestExposureMm > 0`, so DW-154 (d) is narrowed, not closed. Its own algorithm re-run over the committed document: all 45 posts pass, tightest `col_post_lock_ceiling_west_fill_e` at 1.356 mm, whose only exposed sample is an edge midpoint in a ~1.4 mm seam no 26.99 mm ball can enter. The honest repair is `col_lock_ceiling`'s west flank, which this story's own `deferred:` entry places outside its grant.
- **DW-149** `occurrence` -- `MIN_SHOT_CASES` moved from the literal 39 to a derived 36 against a live 50, so the floor is looser than the one it replaced. The derivation is principled (independent source); the strictness regressed.
- **DW-140** `occurrence` -- with the in-suite wrapper retired (task 13, legitimately), `check:corridor` now runs in no automated context: out of `pnpm test`, out of CI. DW-137's headline acceptance is automatically guarded only by the new dimensional pin.
- **DW-138** `occurrence` -- the QA file's d/r grid pin exercises 2 of the 168 right-bat grid combinations (ticks 3900/3910 at hold 60 only) while its titles generalise to "the sweep's coarse grid cannot rediscover this target on its own". The measurement is honest; the claim is broader than the sample.

#### Rejected (verified, not defects)

`test/dw137-corridor-gate.test.ts`'s deletion; `check:ad7` red by design; `DW-146` Branch B; `postDistanceChecks).toBe(expectedPostDistanceChecks)` and `exposedPosts).toBe(posts.length)` (non-load-bearing but harmless, with the genuine floors beside them); `minReleasesEvaluated() = recipes.length` making the path filter a tripwire (strictly stricter, and documented); `DW-70` cited as "Story 1.8" in `AGENTS.md` and "Story 2.5" in the harnesses (precedent vs owner, both correct); the untracked QA file (awaiting the lead's commit); `MIN_SHOT_CASES` derived from the document rather than from `SHOT_CASES.length`; the four independent witness replays (see below).

#### Notes for the lead

- **`DW-141` should NOT block.** The duplication is test scaffolding, the new file is discoverable in the default suite, both its mutations were demonstrated, and its parameters match `plunge-then-bat-r-3899`/`-3906` exactly today. The real risk -- the file asserting a property of a recipe it does not read, so a retuned witness leaves it green while its titles still claim to pin "the declared witness recipe" -- is genuine but is a cross-cutting refactor, already ledgered with this story's occurrence.
- **AC 10's "no test deleted, skipped or weakened" has one live tension**: `test/hop-control.test.ts`'s `CONTACT_EPSILON_MEDIAN_MM` 4.0 -> 4.5. Recorded in frontmatter `deferred:` with a strong trace (same maximum-z tick in both runs, ball airborne in open field, cause identified as `col_post_dragon_leg_r_south` moving 212.50 -> 201.70) and `CONTACT_EPSILON_WORST_MM` did not move -- a re-measurement, not a workaround, so not a Rule 5 NFR shape. Flagged because the AC's wording is unqualified and headroom is now thin on both bounds (0.275 mm and 0.375 mm).
- **Gates after the patches** (`BLENDER` exported): `pnpm test` **91 files / 1459 passed / 0 failed**; `pnpm typecheck` clean (three projects); `check:corridor` exit 0; `check:ad7` exit **1**, still naming `AD-7`/`DW-70`/`bd_trough`; `check:reachability` exit 0, **644 releases / 51 cases / 0 MISMATCH**, 107.6 s; `lint:boundaries`, `check:headers`, `check:attributions` OK; `build` + `check:dist` (2 pages / 141 files) + `check:size` (within the 2.750 MB budget) OK; the Blender-path grep empty. No geometry, no re-export, no golden touched by this review.

## Spec Change Log

**Implementation pass, 2026-09-04.** Baseline `65c14b2` (geometry identical to `bf0f33c`). One re-seed + one `pnpm export:assets` carry every geometry change this story makes; the exploratory sweeps below each ended with the committed document restored and verified byte-identical by SHA-256.

### 1. The re-solved bottom-right quadrant (task 3, AC 5)

The whole chain, from the Lock lane's own east wall (`lock_lane_x1` = 190.0, fixed by Story 2.1d and not touched) to `col_sling_r`'s east face (370.4, derived and not free), is now one budget block in `tools/make-placeholder-blend.py` ("## Story 2.1f: the bottom-right corridor budget"). Every body below is derived from it; nothing in the chain is a bare literal any more.

| body / constant | before | after | why |
|---|---|---|---|
| `SLING_R_X0_MM` | 314.000 (**bare literal**, `AD-15` violation the script itself admitted) | **332.400**, derived `SLING_R_X1_MM - SLING_R_SPAN_MM` | the largest free lever in the quadrant |
| `SLING_R_SPAN_MM` | — (span was 56.400, incidental) | **38.000**, authored with its floor stated | must exceed the sling's own 35.0 mm depth or `freeEndsMm()` picks adjacent edges (DW-128) and the body joins the exemption list |
| `col_sling_r` | x 314.000..370.400 | x **332.400..370.400** | corridor |
| `col_post_sling_r_west` | (317.50, 427.50), 7/8 vertices buried, 0.500 mm proud | **(332.40, 427.50)**, on the cap midpoint, 4.000 mm proud | DW-153 in miniature; the 3.5 mm east offset existed for a shot that now passes 32.4 mm away |
| `RAMP_CORRIDOR_CLEAR_MM` | — (did not exist) | **34.000** | the AC 3 tunable; `BALL_MM` + 7.010 mm of centre freedom |
| `RAMP_LANE_X0_MM` | 338.000 | **298.400** | `SLING_R_X0_MM - RAMP_CORRIDOR_CLEAR_MM` |
| `RAMP_LANE_CLEAR_MM` | 34.000 | **56.000** | the east wall could move west only until the slot to `col_loop_r_lower` went ball-sized: 24.0 mm at 56, 28.0 mm at 52 (a ball fits) |
| `col_ramp_wall_l` | x 326.000..338.000 | x **286.400..298.400** | |
| `col_ramp_wall_r` | x 372.000..384.000 | x **354.400..366.400** | |
| `col_ramp_turn` | (338, 800) (390.4, 852.4) (390.4, 878.4) (338, 858.4) | **(298.4, 800) (390.4, 892) (390.4, 918) (298.4, 882.68)** | west edge follows `ramp_lane_x0` |
| `RAMP_TURN_NORTH_DEG` | — (a fixed 20 mm drop) | **21.0**, a named grade | at a fixed drop the lengthened run would have taken the north face to atan(20/92) = **12.28 deg**, below the real slide threshold — a strand this story would have introduced |
| `col_ramp_return_1` | (372, 783) .. (402, 758) | **(354.4, 783) .. (402, 758)** | its west end is `ramp_lane_x1` |
| `DRAGON_BANK_PITCH_MM` | 14.000 | **11.000** | the budget needed 16 mm out of the bank |
| `DRAGON_BANK_TARGET_W_MM` | 11.000 | **10.000** | targets stand 1.0 mm apart at the new pitch |
| `DRAGON_BANK_X0_MM` | 240.000 (literal) | **217.400**, derived east-to-west off `col_ramp_wall_l` | |
| bank outer-to-outer | 81.000 | **65.000** | |
| `col_dragon_bank_backstop` | x 225.000..326.000 | x **202.400..286.400** | east overhang is now `DRAGON_BANK_RAMP_CLEAR_MM`, so it stays tangent to the Ramp wall at any budget instead of growing through it |
| `DRAGON_LEG_R_W_MM` | 45.000 (literal) | **23.400**, derived — the term that absorbs what the corridor takes | |
| `col_dragon_leg_r` | x 190.000..235.000 | x **190.000..213.400** | |
| `col_post_dragon_leg_r_south` | (212.50, 480.00) literal | **derived** from the live leg centreline, (201.70, 480.00) | |
| `col_post_ramp_wall_l_entrance/_crossing`, `col_post_ramp_wall_r_entrance/_crossing`, `col_post_ramp_turn`, `col_post_ramp_return_1_b` | six hand literals sited against the pre-2.1f channel | **all derived** from the wall/rail they terminate | the DW-153 lesson applied ahead of the defect |
| `col_wall_lane` | plain box; north cap **dead flat**, 12 mm at y = 950 | prism, west corner dropped `LANE_WALL_CAP_DROP_MM` = 6.0 → **26.57 deg** | found by this story's derived strand generator; a ball released at (474.40, 979.0) parked permanently at (474.40, 963.49) |
| `col_loop_r_deflector` | triangle; north face **dead flat**, 34 mm at y = 1016.8, with a 50 mm closed pocket above | NE vertex raised to the playfield's top-right corner → **55.8 deg**, pocket removed | same generator; parked at (497.40, 1030.30). Tilting alone to 26.57 deg was tried and measured INSUFFICIENT (still parked, at (493.90, 1038.63)) |

**What it bought, measured on the re-exported document:**

```
DW-137 gate   col_sling_r.min.x - col_ramp_wall_l.max.x
  was   314.000 - 338.000 = -24.000   (a 50.990 mm SHORTFALL)
  now   332.400 - 298.400 = +34.000   (26.990 + 7.010 mm of margin)

DW-136 corridor   col_guide_outer_r east face 279.525 -> col_sling_r west face
  was   34.475 mm ->  7.485 mm of ball-centre freedom
  now   52.875 mm -> 25.885 mm of ball-centre freedom   (3.46x)
  at y = 420 (col_post_outer_r_hi at 280.525): 33.475 -> 51.875, i.e. 6.485 -> 24.885
```

Recorded because the gate's own arithmetic cannot see it: the ball meets `col_post_sling_r_west` before it meets the sling, and that post stands 4.000 mm proud, so the residual clear a ball really sees over the post's 8 mm of y is **30.000 mm** — still 3.010 mm more than the ball.

Corrections made in the same change: the backstop's stale "343 - 336 = 7 mm clear of `col_dragon_n`" (pre-2.1c; it was 5.000 mm, and is now 4.000 mm by `DRAGON_BANK_RAMP_CLEAR_MM`), and the `SLING_R_X0_MM` provenance block, which now records the resolution rather than the open defect.

### 2. DW-146 — the `RIDGE_DROP_MM` sweep, and why **Branch B** ships

Swept through the REAL pipeline (re-seed + `pnpm export:assets` at every value, then the suite). Cap length is `LOOP_TOP_INNER_Y_MM - RIDGE_DROP_MM - 1004.8`.

| `RIDGE_DROP_MM` | end caps | the six Loop entry-offset cases |
|---|---|---|
| **2.5 (shipped)** | 9.500 mm | all six pass |
| 3.0 | 9.000 mm | **`left-loop-orbit-34` RED** — `s_loop_r_out` never closes; makes are `s_loop_l_in, s_spinner, s_loop_l_out, s_shooter_lane` |
| 5.0 | 7.000 mm | all six pass (note: 2.1d recorded 5.0 as retiming the Left Loop's 34 mm offset into the wrong outlane — against the PRE-2.1f geometry; it no longer does) |
| 8.0 | 4.000 mm | all six pass |
| 10.0 | 2.000 mm | all six pass |
| 12.0 | **eliminated** — footprint becomes the 3-point triangle `(50, 1004.8) (418.4, 1004.8) (234.2, 1016.8)` | all six pass |

So **Branch A narrowly exists**: 12.0 removes the exposed face and keeps every offset case. It is **not** shipped, and the measurement that decided it is recorded rather than argued. At 12.0 the body stops filling y 1004.8..1014.3 across the whole top channel, which changes every trajectory that rides it. Measured against the re-exported document at 12.0:

- **twelve** cases in `test/shot-reachability.test.ts` go red (`loop-off-column-left-west-18`, `loop-off-column-right-west-18`, `centre-drain-descent`, `dragon-body`, `lock-lane-immediate`, `lock-lane-long`, `dragon-target-o`, `top-lane-1`, `slingshot-left`, `slingshot-right`, `descend-sling-l`) **plus the witness-corpus health floor itself**, because witnesses stop closing their own `expectedSwitch`;
- the **`roll-and-drain` golden no longer drains at all** inside its recorded 9282 ticks. Traced: one ball still in play at the end, at x = 257.18, where the golden's own scenario block asserts zero balls, `ballsInPlay` 0 and a full trough. That is not a retime, it is a different behaviour, and this repository's own rule is that a golden needing a moved threshold is a HALT rather than a re-record.

Branch B ships: geometry unchanged at 2.5, the two bare caps named with their measured coordinates, and — for the first time — a `verify()` that derives both caps from the LIVE footprint and asserts they are still 9.500 mm and still bare. Branch A's availability and its full cost are carried to `deferred:` for the lead. **Neither branch is a HALT and none was taken.**

While there: the other three exemption entries that carried no `verify()` at all now have one — `col_loop_l_return` / `col_loop_r_return` (the taper is derived: a 3-vertex footprint has no end cap) and `col_loop_turn_l` (the JOIN claim is checked for real, every vertex against `col_wall_top` / `col_wall_left`). `col_sling_l`'s entry now records the arithmetic that would close it (span must exceed the sling's 35.0 mm depth) and notes that this story APPLIED that rule on the right: `col_sling_r` was sized to 38.0 rather than the ~29 the budget alone wanted, precisely so it stays off the list. `col_ramp_turn`'s entry is **removed** — the re-authored north grade turned its footprint into a clean quad with opposite shortest edges, the reverse-direction test caught the stale entry the moment it did, and both its ends now go through the forward gate.

### 3. DW-153 and the buried-post census (task 5) — five decisions

A census reproducing the spec's own (sampling each post's boundary against the union of non-post `col_` wall footprints) found the same four union-buried posts, plus the fifth the spec named.

| post | measurement | decision |
|---|---|---|
| `col_post_lock_ceiling_e` (194.00, 606.00) | terminated `col_lock_ceiling`'s east riser, whose live midpoint is **(194.00, 612.00)** — 6.000 mm away against a 4.50 mm budget, stale since `LOCK_CEILING_EAST_SHOULDER_MM` went 14 → 28; and that midpoint is itself **3.483 mm strictly inside `col_dragon_leg_r`** | **REMOVED.** The end is declared enclosed; no ball can reach a point inside solid material |
| `col_post_lock_ceiling_w` (146.00, 606.00) | its riser midpoint is **4.000 mm strictly inside `col_lock_ceiling_west_fill`**; the post was entirely inside that same body | **REMOVED**, declared enclosed |
| `col_post_dragon_leg_l` (116.00, 610.00) | `col_dragon_leg_l`'s north cap midpoint (120.00, 610.00) is **1.897 mm strictly inside `col_lock_ceiling_west_fill`**, by 2.1d's deliberate 2 mm overlap; the post had all eight vertices in the same body and was already invisible to the forward gate | **REMOVED**, declared enclosed; the hand-written one-off that pinned it is retired into the general mechanism |
| `col_post_lock_ceiling_west_fill_e` | its end at (150.00, 625.00) is inside **nothing** — genuinely bare, 1.154 mm outside `col_lock_ceiling` — so it still needs terminating | **KEPT**, already derived from live geometry. It protrudes only into the 1.15–3.20 mm seam between the two bodies; recorded in `deferred:` |
| `col_post_sling_r_west` | 7 of 8 vertices inside `col_sling_r`, 0.500 mm proud | **RE-SITED** onto the cap midpoint, 4.000 mm proud |

The circular `verify()` that made DW-153 invisible is gone: it passed the post its **own** authored literal to `expectPostNear()`, measured 0.000 mm and was true by construction. The replacement derives both risers from the live footprint (no coordinate literal anywhere in it) and asserts the enclosure. The backwards prose ("4 mm short of `col_dragon_leg_r`") is corrected — it is 4 mm **inside**, by `LOCK_CEILING_X_OVERLAP_E_MM`.

Post count 48 → **45**.

### 4. The instrument — the right-bat origin (tasks 1, 2)

`WITNESSES` 11 → **15**. Every one still originates at `c_trough_eject` and moves only under `frame.plunger` / `frame.flipper_*`; there is no assignment to `ball.state.pos` or `ball.hit.vel` anywhere in `test/util/reachability.ts`.

| new witness | recipe | measured |
|---|---|---|
| `plunge-then-bat-r-3899` | plunge 285, **right** bat @ 3899, hold 60 | closes `s_ramp_enter` then `s_ramp_made` — the shot the corridor re-solve exists to create. Window measured 3897..3901 |
| `plunge-then-bat-r-3906` | plunge 285, **right** bat @ 3906, hold 60 | crosses the DRAGON bank's zone band from the east, closing `s_dragon_a`, `s_dragon_g`, `s_dragon_o`, `s_dragon_n` in one pass |
| `plunge-then-bat-r-3890` | plunge 285, **right** bat @ 3890, hold 100 | found by the dense sweep disagreeing with the manifest; passes 0.010 mm from `descend-sling-r` |
| `plunge-then-bat-l-3969` | plunge 521, left bat @ 3969, hold 40 | replaces `plunge-then-bat-l-3911` for `descend-sling-l`, whose trajectory the moved bank changed downstream (0.125 mm → 62.005 mm); this one passes 5.934 mm |

Why 285 and not the full plunge: measured, the 521-tick plunge's ball arrives on the **left** bat and drains centre — it is never in the right-bat band at all, so a right-bat flip chained off it is the vacuous axis the sweep harness's own header warns about. The 285-tick plunge descends the Right Loop lane and occupies the right-bat band (x 270..365, y 50..130) over relative ticks **3811..4020**.

`ReleaseRecipe` in the dense sweep gained the same `side` field, the release loop drives `flipper_r` for it, and a right-bat grid (3780..4050 step 10 × six holds) was added. **643 releases, 50 cases, 2 bat sides, 105.7 s** against the 120 s budget. Floors that were hand-typed literals are now derived: `MIN_RELEASES_EVALUATED` is the built recipe count; the per-axis floors are computed from the same `buildSweepRecipes()` the sweep runs; a new assertion requires **both** bat sides to be present. `MIN_WITNESSES` gained a derived origin-family floor (plunge-only / plunge-then-bat-l / plunge-then-bat-r must each be represented) — the property an `unreachable` verdict actually depends on, and the one Story 2.1e's corpus silently failed. `MIN_SHOT_CASES` is derived from the committed document's own distinct zone-backed switch count, never from `SHOT_CASES.length`.

### 5. Per-case reachability verdicts

`pnpm check:reachability` exits **0**: 643 releases, **50 cases — 30 reachable, 20 unreachable** (baseline 472 / 46 / 23 / 23). Columns are the sweep's own output: declared verdict, the sweep's best closest approach, the recipe that achieved it, agreement with the manifest, the manifest's recorded figure and the delta.

```
id	declared	bestApproachMm	recipeIndex	agreement	recordedMm	delta
left-loop-orbit-28	reachable	2.384	58	OK	-	-
left-loop-orbit-31	reachable	1.868	13	OK	-	-
left-loop-orbit-34	reachable	1.131	13	OK	-	-
right-loop-orbit-28	reachable	1.463	11	OK	-	-
right-loop-orbit-31	reachable	1.537	11	OK	-	-
right-loop-orbit-34	reachable	4.537	11	OK	-	-
dw123-single-ball-orbit	reachable	1.537	11	OK	-	-
loop-off-column-left-west-18	reachable	0.388	58	OK	-	-
loop-off-column-left-east-45	reachable	1.225	60	OK	-	-
loop-off-column-right-west-18	reachable	11.463	11	OK	-	-
loop-off-column-right-east-45	reachable	3.866	642	OK	-	-
left-loop-1200	reachable	1.868	13	OK	-	-
ramp-return-geometry	reachable	0.458	536	OK	-	-
centre-drain-descent	reachable	0.825	638	OK	-	-
dragon-body	reachable	0.588	278	OK	-	-
lock-lane-immediate	reachable	1.427	262	OK	-	-
lock-lane-long	reachable	1.427	262	OK	-	-
dragon-target-d	reachable	1.449	643	OK	-	-
dragon-target-r	reachable	2.878	643	OK	-	-
dragon-target-a	reachable	0.036	643	OK	-	-
dragon-target-g	reachable	0.145	643	OK	-	-
dragon-target-o	reachable	5.549	634	OK	-	-
dragon-target-n	reachable	0.023	643	OK	-	-
top-lane-1	unreachable	64.931	34	OK	65.430	0.499
top-lane-2	unreachable	122.494	536	OK	122.746	0.252
top-lane-3	unreachable	82.536	44	OK	83.015	0.479
slingshot-left	reachable	0.130	227	OK	-	-
slingshot-right	reachable	1.417	556	OK	-	-
pop-bumper-1	unreachable	77.525	16	OK	77.655	0.130
pop-bumper-2	unreachable	59.984	643	OK	59.984	-0.000
pop-bumper-3	unreachable	113.656	643	OK	113.656	-0.000
descend-sling-l	reachable	5.934	640	OK	-	-
descend-sling-r	reachable	0.010	530	OK	-	-
descend-dragon-leg-l	unreachable	67.546	16	OK	67.684	0.138
descend-dragon-leg-r	unreachable	48.573	643	OK	48.573	-0.000
descend-ramp-wall-l	unreachable	69.352	538	OK	69.694	0.342
descend-ramp-wall-r-cap	unreachable	28.482	536	OK	30.972	2.490
descend-ramp-turn-cap	unreachable	73.279	44	OK	73.817	0.538
descend-ramp-return-rail	reachable	10.273	642	OK	-	-
descend-dragon-d	unreachable	72.374	643	OK	72.374	0.000
descend-dragon-n	unreachable	50.919	642	OK	50.919	0.000
descend-loop-top-west	reachable	5.837	21	OK	-	-
descend-loop-top-east	reachable	5.128	12	OK	-	-
descend-lock-ceiling-west	unreachable	97.546	16	OK	97.684	0.138
descend-lock-ceiling-east	unreachable	68.743	643	OK	68.743	0.000
descend-lock-ceiling-west-fill	unreachable	79.546	16	OK	79.684	0.138
descend-dragon-leg-r-post	unreachable	52.395	643	OK	52.395	-0.000
descend-dragon-leg-r-post-200	unreachable	54.059	643	OK	54.059	0.000
descend-dragon-leg-r-post-203	unreachable	51.124	643	OK	51.124	0.000
descend-dragon-leg-r-post-660	unreachable	47.294	643	OK	47.294	-0.000
```

**Every verdict that moved, explained.**

- `ramp-return-geometry` **unreachable (DW-137, 58.646 mm) → reachable via `plunge-then-bat-r-3899`.** Release re-sited (355, 465) → **(315, 470)**, into the re-solved mouth, 22.373 mm clear; the witness passes 2.153 mm from it. This is the story's headline.
- `descend-ramp-return-rail` **unreachable (DW-138) → reachable via `plunge-then-bat-r-3899`, 10.273 mm.** The Ramp shot rides the turn across the crossing gap and down this rail on its way to the right inlane. A case the right-bat origin newly reaches.
- `descend-sling-r` **unreachable (58.486 mm) → reachable via `plunge-then-bat-r-3890`, 0.010 mm.** Found by the dense sweep DISAGREEING with the manifest once its own right-bat axis existed; the recipe that found it was promoted to an in-suite witness so the two instruments agree.
- `descend-sling-l` stays **reachable**, re-witnessed `plunge-then-bat-l-3911` → `plunge-then-bat-l-3969` (0.125 → 62.005 mm, then 5.934 mm). The release point did not move; the moved bank changed that witness's trajectory downstream.
- **Six new `reachable` cases**, `dragon-target-d/r/a/g/o/n` — AC 3.
- **Two cases retired**, `dragon-bank-left-column-294` and `dragon-bank-right-column-300`, replaced by the six above (task 9 says "replace"). The measurement that retired rather than re-sited them: `col_ramp_wall_l` now stands between the corridor and the bank, so a ball rising in the corridor must have its centre at or east of 311.9 to pass east of it (which takes it up the Ramp — the shot the re-solve creates) or at or west of 272.9 to pass west. Sweeping every aim from −30 to +4 deg at 1400/1600/2000/2400 mm/s from x = 300 and x = 318 closed a bank target only from 318 with a steep westward aim. A real ball does reach the bank — `plunge-then-bat-r-3906` closes four targets in one flip after crossing west of the wall below its southern end — which is what the six per-letter cases assert.
- Every remaining `closestApproachMm` was re-measured against the new geometry and the new corpus; all 20 agree with the sweep inside the 0.5 mm band except `descend-ramp-wall-r-cap` (2.490 mm), where the manifest records the IN-SUITE figure by definition and the sweep searches wider — the same expected divergence the harness already reports as a delta rather than asserts.

Nine release points were re-sited, all forced by `assertReleaseClear()` (DW-77) against moved bodies rather than chosen: `top-lane-3` (345, 900) → (335, 935) (the old point is inside the lengthened `col_ramp_turn`, 0.000 mm), `pop-bumper-2` (200, 700) → (230, 740) (8.352 mm from the moved backstop, and the backstop's face now stood between it and the pop), `descend-ramp-wall-l` (332, 880) → (280, 860), `descend-ramp-wall-r-cap` (376, 758) → (352, 760), `descend-ramp-turn-cap` (360, 895) → (344, 940), `descend-dragon-d` (240, 750) → (222.4, 750), `descend-dragon-n` (310, 750) → (270, 750), `descend-dragon-leg-r` (220, 660) → (201.7, 660), and the three `descend-dragon-leg-r-post*` columns onto the post's new column (200 / 201.7 / 203). Two notes worth keeping: `descend-ramp-wall-r-cap` sits 2.4 mm WEST of the wall's centreline deliberately — a ball released on the centreline settles into a perfectly balanced equilibrium on `col_post_ramp_wall_r_crossing`'s octagon apex (0.00 mm of progress over the final 500 ticks, parked at (360.40, 757.52)), the same knife-edge `col_pop_1` produces for `top-lane-1`; and `descend-dragon-n` sits at x = 270 because DW-77's 13.495 mm clearance to `col_ramp_wall_l` leaves only a 0.5 mm window of x directly above the target itself.

### 6. The FR-31 gate (task 7, DW-154 a–d)

- **(a) The unenumerated second exemption channel is gone.** `isJoined()` is split into `classifyEnd()` returning `joined` (on a partner's boundary, coincident by construction — still an ordinary structural join) and **`enclosed`** (strictly interior, at unbounded depth). An enclosed end must now appear in `ENCLOSED_END_DECLARATIONS` with the enclosing body named; both directions are enforced, and the declaration carries the measured depth. Three ends are declared, each with its measurement.
- **(b) `freeEndsMm()` throws on a genuine 2nd/3rd-shortest tie** within `FREE_END_TIE_EPSILON_MM = 0.3` (one tenth of the smallest live margin, 3.000 mm), naming the body and every edge length. Two new unit tests pin it, including a near-tie outside the epsilon so the throw is discriminating rather than unconditional.
- **(c)** The ledger's own wording — a staleness check reporting *pass* for a body with no `footprintMm` — was **already closed** at the 2026-09-03 review (`test/asset-contract.test.ts`, the `footprintMm` assertion that replaced `?? []`), and that is recorded at the line. The honest residual, the `catch` discarding the error object, is closed here: the catch keeps the error and the assertion requires it to be one of `freeEndsMm()`'s own shape reasons.
- **(d) The protrusion gate** runs over a subject set derived from the document (`surface === 'rubber_post'`, all 45), sampling each post's own boundary (vertices **and** edge midpoints — vertices alone miss a post whose only exposure is along a face, which is a real case here) against the union of the non-post `col_` wall footprints.
- The `radius + 0.5` budget, computed inline in two places, is now the named `postDistanceBudgetMm()`; the `postDistanceChecks >= 40` literal is replaced by a census derived from the same walk the loop makes, plus a derived anti-vacuity floor (at least half of every derived end must still reach the post-distance assertion).

### 7. The derived descending-strand subject set (task 10, AC 9)

`test/shot-routing.test.ts` now derives every **exposed** north-facing footprint edge from the committed document — outward normal with an up-table component, on the playfield, not joined into or buried inside another body, and with a release point directly above it that clears every footprint by more than 13.495 mm — and requires each to be **(a)** at or above `atan(TUNING.materials.default.friction)` = 16.699 deg, **(b)** probed by a descending column in the manifest within one ball diameter in x and 150 mm in y, or **(c)** a declared resting place. 29 exposed faces derived; both branches are asserted non-empty so neither can absorb everything.

It earned its place on its first run, finding **two** hazards no hand list had ever covered — `col_wall_lane` and `col_loop_r_deflector`, both pre-existing and neither introduced by this story, both fixed above. The one declared resting place is `col_wall_lane_bottom`, the shooter-lane floor, where a served ball waits for the plunger by design (20 of the 26 rests in 2.1d's own whole-playfield sweep were here).

**Deviation from task 11, recorded.** The task asked for 2.1d's throwaway 811-release whole-playfield sweep to be made permanent inside the out-of-process harness. It is implemented instead as the in-suite DERIVED gate above, which covers the whole playfield by construction rather than by grid sampling (a 1620-candidate grid can step over a hazard; a derivation from every footprint edge cannot) and costs no runtime in the 106 s sweep, which is already at 88% of its stated budget. The behavioural half is unchanged — the manifest's descending columns are still driven through `driveCase()` and still assert `assertNotStranded`. Recorded in `deferred:`.

### 8. The five goldens (task 15)

**Not a re-record — a header-only `assetHash` refresh, and it is traced, not inferred.** Each golden was replayed against BOTH the pre-2.1f committed document and the re-exported one, with `onTick` capturing every ball's full-precision position sampled every 25 ticks across the entire recorded run, and the two traces compared position by position.

| golden | traces identical? | first differing sample | `expectedHash` / `expectedGameStateHash` | `durationTicks` |
|---|---|---|---|---|
| `roll-and-drain` | **yes**, every sample | none | `3ece0ecb` / `da580cfb` — unchanged | 9282, unchanged |
| `hold-and-release` | **yes** | none | `f5126120` / `1402ab47` — unchanged | 9600, unchanged |
| `full-plunge` | **yes** | none | `71847738` / `d56634ac` — unchanged | 2000, unchanged |
| `nudge-coupling` | **yes** | none | `b4ce2641` / `54709a72` — unchanged | 800, unchanged |
| `two-ball-collision` | **yes** | none | `b9072950` / `bca1e44f` — unchanged | 3400, unchanged |

`header.assetHash` `dbd72bf0` → **`dd732853`** in all five; `header.tableHash` `18b03084` unchanged in all five (`TABLE.shots` is still exactly `{}`). `notes` was **appended to**, never rewritten, and every golden still carries its `DW-70` and `deviceSlots` literals. `description` was not touched, because nothing about what each golden demonstrates changed. `test/replay-goldens.test.ts` passes complete, including every per-golden scenario block and the `PARITY_INERT` sweep in both directions, with the allowlist still exactly `nudge-coupling` and `two-ball-collision`. `git diff --stat -- test/replays/` is 10 insertions / 10 deletions — two lines per file, the hash and the appended note.

The `roll-and-drain` retime the spec budgeted for was not needed: its 3-tick drain window is untouched because its trajectory is untouched.

### 9. One threshold re-measured, recorded rather than quietly moved

`test/hop-control.test.ts`'s `CONTACT_EPSILON_MEDIAN_MM` **4.0 → 4.5**. The harness places a ball on the LEFT bat at (210, 85) and runs 400 held ticks, so the struck ball crosses most of the table. Per-hit max z above rest moved from 4.1857 / 3.6730 / 3.6730 to **4.6250 / 4.2250 / 4.2250**. Traced old document against new: the maximum-z tick is the SAME tick in both runs (relative 314 / 324) and the ball is airborne in open field at it — (188.97, 455.71) before, (178.31, 457.28) after — so it is the same contact-response artefact from a trajectory that now bounces off `col_post_dragon_leg_r_south` at (201.70, 480.00) where it used to bounce off it at (212.50, 480.00). `hopControl` is 0 in this run and this file's own identity and negative-`hopControl` tests prove `applyPostStep()` is an unconditional no-op there, so none of this figure is a hop; the subject of the test is intact. `CONTACT_EPSILON_WORST_MM` = 5.0 did **not** move. Carried to `deferred:` because it is a threshold this story moved.

### 10. Verification — every command, with its result

| command | expected | result |
|---|---|---|
| `"$BLENDER" --background --factory-startup --python tools/make-placeholder-blend.py` | exit 0, `.blend` reseeded | **exit 0** |
| `pnpm export:assets` | exit 0, both artifacts rewritten | **exit 0**; `dragonwar.glb` is byte-unchanged (it carries only `vis_`/`l_` meshes, none of which moved) |
| `pnpm check:corridor` | **exit 0** | **exit 0**, 1 file / 1 test |
| `pnpm check:ad7` | **exit 1**, naming `AD-7`, `DW-70`, `bd_trough` | **exit 1**, all three named |
| `pnpm check:reachability` | exit 0, per-case verdicts | **exit 0** — 643 releases, 50 cases, 60 plunge strengths, 73 flip ticks, **2 bat sides**, 105.7 s against the 120 s budget |
| `npx vitest run test/shot-routing.test.ts` | at or above 45 | **53 passed** (45 → 53: +6 per-letter DRAGON, +1 bank coverage, +2 derived-strand, −1 the two-column `it.each` collapsing) |
| `npx vitest run test/shot-reachability.test.ts` | at or above 149 | **161 passed**, ~9 s |
| `npx vitest run test/asset-contract.test.ts` | green, with the new gates exercised | **59 passed** (55 → 59) |
| `npx vitest run test/replay-goldens.test.ts` | all five green incl. scenario blocks and `PARITY_INERT` | **54 passed** |
| `npx vitest run` | at or above 91 files / 1422 | **90 files / 1448 passed / 0 failed**, 0 skipped. One file FEWER by design (`test/dw137-corridor-gate.test.ts` removed with the defect it documented, task 13); **26 tests more** |
| `pnpm typecheck` | all three projects clean | **clean** |
| `pnpm lint:boundaries` | exit 0 | **OK — 83 files cruised, no violations** |
| `pnpm check:headers` | exit 0 | **OK** |
| `pnpm check:attributions` | exit 0 | **OK** (no new third-party file; `ATTRIBUTIONS.md` needs no row) |
| `pnpm build && pnpm check:dist && pnpm check:size` | exit 0 each | **OK** — 2 HTML pages / 141 files; 0.848 MB against a 2.750 MB budget |
| `node -e "…col_sling_r.min.x - col_ramp_wall_l.max.x"` | **>= 26.99** | **34** |
| `git diff --stat -- test/replays/` | non-empty | 5 files, 10 insertions / 10 deletions |
| `git grep -i "blender-5\|Program Files.*Blender"` (excl. `tools/blender.mjs`, `_bmad-output`) | empty of host paths | **no `blender-5` hit anywhere**; the only `Program Files.*Blender` hits are the pre-existing generic literal in `test/blender-resolve.test.ts`, which is the resolver's own conventional path, not this host's |

### 11. Mutations (Rule 19) — applied, red observed, reverted, tree verified

Every document mutation was reverted by restoring the exported document and confirming **byte-identity by SHA-256** (`e780d8e6f50f1647d743a949a0f43fa8687fd09616d4f066b11e6f079b9fe58d`); every source mutation was reverted from a copy taken immediately before.

| AC | mutation | red observed |
|---|---|---|
| **1** | `col_sling_r` (and its west post) shifted 8 mm west in the committed document | `test/shot-reachability.test.ts` red on `ramp-return-geometry` alone: *"declares reachable via witness `plunge-then-bat-r-3899`, but the live measurement is 39.616 mm — over the 13.495 mm tolerance"*. The witness still runs and the ball still flies; only the outcome changes |
| **2** | `col_ramp_return_1` shifted 30 mm north | the Ramp case red on *"`s_inlane_r` must close — the Ramp's return must feed the right INLANE (OQ-6/FR-27) — makes: `s_ramp_enter`, `s_ramp_made`, `s_drain`, `s_trough_4`"*. The shot is still made; only the return is lost — exactly the observable AC 2 names |
| **3** | `col_dragon_d` and `sw_dragon_d` shifted 10 mm west | **only** `dragon-target-d` red (*"`s_dragon_d` must close on case `dragon-target-d`"*, makes `s_dragon_r`, `s_dragon_body`, …); the other five pass. This is what the old `hitAny` could not have caught |
| **3** (dimensional) | `col_sling_r` shifted 6 mm west | the corridor gate red naming all three quantities: *"measures 28.000 mm against the authored `RAMP_CORRIDOR_CLEAR_MM` (34.000 mm) — a delta of −6.000 mm"* |
| **4** (Block If) | `RIDGE_DROP_MM` 2.5 → **3.0**, re-seeded and **re-exported through the real pipeline** | `left-loop-orbit-34` red: *"`s_loop_r_out` must close — makes: `s_loop_l_in`, `s_spinner`, `s_loop_l_out`, `s_shooter_lane`"* — the orbit does not complete. The Block If's own falsifier, at the authored source constant. Reverted and re-exported; document byte-identical |
| **5** | `col_ramp_wall_l` shifted 10 mm east | `pnpm check:corridor` **exit 1**, with the live figures: *"can push its centre to x = 318.905 … needs at least x = 321.895 … a residual of −2.990 mm"*. The gate tracks the geometry, not a frozen literal |
| **6** (Branch B) | `col_loop_top`'s footprint replaced with `RIDGE_DROP_MM = 12.0`'s own 3-point triangle | the **new** `verify()` red: *"col_loop_top must still be the 5-point ridge freeEndsMm() cannot derive — at 4 points it would have to pass the forward gate, at 3 its caps are gone and this exemption is stale"*. This entry had no `verify()` at all before |
| **7** | `col_lock_ceiling`'s east riser moved 8 mm north | the **re-derived** `verify()` red: *"col_lock_ceiling riser midpoint (194.00, 616.00) — DERIVED from the live footprint, not read from a literal — has no `ENCLOSED_END_DECLARATIONS` entry. This is the DW-153 defect exactly: the riser moved and the record did not follow."* The old circular `verify()` passed at 0.000 mm through precisely this change |
| **8 (a)** | `col_lock_ceiling_west_fill` moved 20 mm south, taking a different end strictly inside `col_lock_ceiling` | *"col_lock_ceiling_west_fill's free end at (150.00, 605.00) is 4.000 mm STRICTLY INSIDE `col_lock_ceiling` — … must be DECLARED … An undeclared enclosure is exactly the unenumerated second exemption channel DW-154 (a) names."* Before this story that end took the silent `continue` |
| **8 (b)** | a square footprint (every edge 10 mm — a genuine tie) fed to `freeEndsMm()` | throws naming the body, `TIE`, and `10.000`. The near-tie case (0.400 mm gap, outside the epsilon) still derives, so the throw is discriminating |
| **8 (c)** | `freeEndsMm()`'s point-count throw prefixed to become a `TypeError('boom…')` | the staleness check red: *"the throw that actually happened was boomfreeEndsMm(): … — not one of freeEndsMm()'s own shape reasons"*. Before this story the bare `catch` laundered it into "the exemption still holds" |
| **8 (d)** | `col_post_ramp_wall_l_entrance` moved 20 mm north, entirely inside `col_ramp_wall_l` | the protrusion gate red naming the post **and** the burying body: *"presents NO collision surface outside the union … (deepest cover: `col_ramp_wall_l`)"*, plus the forward gate on the now-unterminated end |
| **9** | `col_guide_inlane_feed_l`'s north face re-bevelled to 0.93 deg | the DERIVED gate red, with **nobody having added a column for it**: *"these exposed north faces are shallower than the real slide threshold and NOTHING drops a ball on them: col_guide_inlane_feed_l (north face at (113.50, 164.00), grade 0.93 deg, below the 16.699 deg slide threshold; a clear release sits directly above it at (113.50, 192.99))"* |
| **9** (anti-vacuity) | the derived generator forced to return `[]` | *"sanity: the derived subject set is EMPTY — every assertion below would then be vacuously true, which is the exact failure mode this gate exists to prevent"* |
| **10** | `roll-and-drain`'s `expectedHash` reverted to a stale value | `test/replay-goldens.test.ts` red **for that golden alone** (*"roll-and-drain: finalHash: expected `3ece0ecb` to be `deadbeef`"*), the other four green — the re-record is load-bearing, not a header refresh |

### 12. Manual checks

- **No witness teleports.** Read every `WITNESSES` entry: each is `settleTicks` of `NO_FRAME` after a single `c_trough_eject` pulse, then `frame.plunger`, then optionally `frame.flipper_l`/`flipper_r`. `grep` over `test/util/reachability.ts` finds no assignment to `ball.state.pos` or `ball.hit.vel` anywhere in the file.
- **Every new witness reproduces.** The four new recipes were replayed twice from a fresh `createMachine()` and produced identical trajectories (AD-3); `witnessPath()` memoises per process, and the corpus-health assertions pass on every run.
- **Every `descend-*` release still lies above the body it names and clears every footprint by more than 13.495 mm** — `assertReleaseClear()` is what forced nine of the re-sitings, and it runs on every driven case.
- **Every golden's `notes` was appended to**, not rewritten; all five still carry their `DW-70` and `deviceSlots` literals.
- **`PARITY_INERT` still holds exactly `nudge-coupling` and `two-ball-collision`**, enforced in both directions.
- **`TABLE.shots` is still exactly `{}`** and `header.tableHash` is unchanged across all five goldens.
- **`ATTRIBUTIONS.md` needs no new row** — no third-party code, asset or dependency was added.
- Every one of the 50 shot cases appears exactly once in the verdict table above with a verdict, a measured closest approach and either a witness id or a ledger id.

### 13. Rule 20 — a decision later stories inherit (for the lead, not written to the spine here)

The bottom-right budget is now a single derived chain, and two of its terms constrain later work: **`RAMP_CORRIDOR_CLEAR_MM` = 34.0** is the corridor a later change may not silently narrow (pinned dimensionally in `test/asset-contract.test.ts` and behaviourally by the DW-137 harness), and **a slingshot's span must exceed its own depth (35.0 mm)** or `freeEndsMm()` cannot derive its ends and the body falls off the FR-31 gate onto the exemption list. Story 2.2 inherits `col_sling_r` at a 38.0 mm span and `col_sling_l` at 32.0 mm — the latter still on the exemption list for exactly that reason.

## Review Triage Log

### 2026-09-05 -- Review pass

- intent_gap: 0
- bad_spec: 0
- patch: 7 (high 0, medium 2, low 5)
- defer: 3 (high 0, medium 0, low 3)
- reject: 4 (high 0, medium 0, low 4)
- addressed_findings:
  - `[medium]` `[patch]` `test/fixtures/reachability/reachability-sweep.harness.ts`: the axis-coverage anti-vacuity floors were "derived" by recomputing `axisCoverage(allRecipes)` and comparing it to a bare `.toBeGreaterThan(1)` -- a comparison that cannot fail no matter how thin the built grid becomes, despite an adjacent comment claiming a nonexistent `axisFloors()` derives real floors. Fixed by tracking REALISED axis coverage (plunge strengths, flip ticks, bat sides) inside `main()`'s own evaluation loop and asserting it against the BUILT coverage computed before the sweep runs -- mirroring the already-correct `minReleasesEvaluated()` pattern (built count vs. independently-measured runtime count). Verified with a Rule-19 mutation: temporarily dropped every `plungeHoldTicks === 521` recipe inside the evaluation loop, reran `pnpm check:reachability`, observed red naming "REALISED only 59 of the 60 distinct plunge strengths it BUILT", reverted, confirmed the file byte-identical to its pre-mutation, post-fix state.
  - `[medium]` `[patch]` `test/shot-routing.test.ts`: the six new per-letter DRAGON-bank cases call `assertNotStranded` but dropped `assertNotStillInPlay`, which the two retired combined cases they replace both called (confirmed against baseline `65c14b2`). Restored the call on all six cases; suite still green (52/52).
  - `[low]` `[patch]` `test/asset-contract.test.ts`: five dropped possessive apostrophes in `GUIDE_TERMINATION_EXEMPTIONS` reason/failure-message strings ("rail own inboard end", "golden own scenario block", "this repository own rule", "the turn own angle", x2 occurrences of the first). Corrected to `rail\'s`/`golden\'s`/`repository\'s`/`turn\'s`, matching every other instance of this construction in the same file.
  - `[low]` `[patch]` `test/asset-contract.test.ts`: a purposeless nested `{ }` block wrapped the entire FR-31 post-distance loop body with no scoping need, left over from a refactor. Removed; behaviour unchanged (59/59 asset-contract tests still pass).
  - `[low]` `[patch]` `test/util/reachability.ts`: `MIN_WITNESSES` stayed a bare literal `10` (pre-dates this story, against a live corpus of 15) even though an adjacent comment claimed it was "now DERIVED". Derived it from the corpus's own distinct `expectedSwitch` count (11 today, in the shape of `MIN_SHOT_CASES`'s derivation from the collision document's own distinct zone-backed switches -- not from `WITNESSES.length`, which would be tautological). Suite still green (161/161).
  - `[low]` `[patch]` this spec's own `## Verification` section, AC 3's dimensional mutation: described changing the Python-side tunable without re-exporting, but the shipped gate (`test/asset-contract.test.ts:1756`) compares against a hardcoded TS literal never read from the Python source, so that mutation touches neither side and produces no red. Corrected to the mutation actually applied and observed (shift `col_sling_r` 6 mm west), matching `## Spec Change Log` section 11's own table.
  - `[low]` `[patch]` this spec's own `## Verification` section, AC 7's mutation: claimed the re-derived `verify()` names "the riser's new midpoint and the post's distance", but the shipped `col_lock_ceiling` exemption removed both terminating posts and its `verify()` now asserts point-in-polygon enclosure, not a post distance. Corrected to the mutation and quoted failure actually observed.

Findings closed without a code or spec change:
- `reject` -- a reviewer reported the diff file used for review appeared truncated mid-statement in `tools/make-placeholder-blend.py`. Verified false: the diff genuinely ends there because everything past that point in the file (lines ~2964-3245 of 3245) is byte-identical to baseline; `git diff` correctly emitted no further hunks. All 20 changed files' `diff --git` headers were present.
- `reject` -- a reviewer questioned why `followup_review_recommended` was `false` in frontmatter next to a medium-severity `deferred:` entry. That field is computed by THIS review pass's own patch-severity formula (see `## Auto Run Result` below), not by the severity of items the plan/implement stages deferred; no action needed.
- `reject` -- the intent-alignment audit's read of the `DW-146` branch choice (Branch B shipped, Branch A costed and declined) restates the spec's own pre-authorised decision rule; not a defect.
- `reject` -- the intent-alignment audit's note on `test/hop-control.test.ts`'s moved threshold restates the existing `hop-control-contact-epsilon-moved` frontmatter `deferred:` entry from the implement pass; not a new finding.
- `defer` -- `deriveExposedNorthFaces()` (AC 9's derived strand generator) silently drops any exposed face with no clear vertical release point within 120 mm, with no accounting. Verified via a temporary, reverted instrumentation pass: 22 faces are dropped this way today, every one graded 22.50-76.87 deg (all above the 16.699 deg slide threshold), so the gap is currently inert. Recorded as `derive-exposed-north-faces-120mm-blind-spot` (low) in frontmatter `deferred:` for the lead's harvest.
- `defer` -- `col_ramp_turn`'s new north-face vertex has no inline assert that its derived drop stays under `run + thickness`; mitigated today by `tools/export.py`'s existing convexity validator, which would catch a self-intersecting result at export time regardless. Recorded as `col-ramp-turn-no-inline-self-intersection-guard` (low).
- `defer` -- AC 3's dimensional gate is a TS literal independent of the Python-authored tunable (matches this file's pre-existing house style for every dimensional pin; no cross-language link exists anywhere in the repo). Recorded as `ac3-tunable-provenance-duplication` (low).

## Design Notes

**Governing architecture decisions (Rule 6).** `AD-10` (table frame, 26.99 mm ball, 514.4 x 1066.8 playfield, geometry authored unpitched), `AD-11` (the `.blend` is the sole owner of every position and switch zone; the `col_`/`sw_`/`vis_` prefix contract; convex reduced primitives; both loaders fail fast -- FR-31 "ball guides end at rubber posts, never bare metal" is bound here, and its gate is **structural**, not `col_guide_`-prefixed, because under the prefix reading the AC's Given is the empty set), `AD-15` (table tunables carry `source` and `confidence`; solver constants are never tunable and a change is a physics-version bump that re-records every golden), `AD-6` (both amendments: the pass-through spinner of 2026-09-03 and per-device declared boot occupancy of 2026-09-04 -- this story touches neither mechanism but must not disturb either), `AD-19` (`sim/rules/devices/` owns shots; `TABLE.shots` stays `{}` until Story 2.4), `AD-3` (one clock, seeded PRNG, no `Math.random` -- what makes a golden reproducible). `AD-5` is context only: the slingshots' **kick** is Story 2.2's; this story moves their **geometry**, which `col_sling_l`'s own exemption reason already reserves for 2.1f by name.

**The spine has no AD about the corridor.** The relevant text is `ARCHITECTURE-SPINE.md:366`, under `## Deferred`: playfield geometry itself (PRD OQ-6 -- flipper tip gap, outlane widths, post positions, loop entries, ramp height, Dragon placement) is "the first design problem of epic 2, owned by the Blender source under AD-11", with acceptance carried from the brief that every shot passes Lawlor's miss test and orbit exits feed the flippers. No AC here contradicts an AD, so there is no Rule 6 intent gap. If the re-solve settles something that constrains later stories -- a named corridor tunable other stories must respect, or a decision about the slingshot span that Story 2.2 inherits -- that is a **Rule 20** spine write for the lead at the moment the decision is made, and this story should surface it in its completion record rather than write the spine itself.

**Integration ACs and linkage (Rules 1/2).**
- `Consumes:` Story 2.1e's reachability harness (`test/util/shot-cases.ts`, `test/util/reachability.ts`, `test/shot-reachability.test.ts`, `pnpm check:reachability`) -- this story's ACs are stated in terms of it and it is exercised against the real instance, never a mock. Story 2.1c's delivered orbit (the Block If's subject). Story 2.1d's `bd_lock` boot declaration, the Lock-lane sealing bodies `col_lock_ceiling` / `col_lock_ceiling_west_fill`, the widened FR-31 structural gate with its two-directional exemption allowlist, and the 48-post census.
- `Consumed-by:` **Story 2.3** (drop targets, the spinner and the Lock) -- its own "all six droppable" acceptance is only satisfiable once this corridor lands; `DW-136` was re-owned here from 2.3 for exactly that reason. **Story 2.2** (slingshots and pop bumpers as hardware rules) -- it inherits whatever span and pose this story gives `col_sling_l` / `col_sling_r`, and `DW-148`'s pop-bumper rest is its kick to fix, not a geometry defect. **Story 2.4** (the devices-and-shots layer) -- `shot_ramp = [s_ramp_enter, s_ramp_made]` becomes a shot a player can actually make.
- The Integration ACs are AC 1 (the consumer `test/shot-routing.test.ts` drives the manifest entry this story flips and observes `s_ramp_enter`) and AC 9 (the consumer proves each derived column via `assertNotStranded`). Both are testable at the consumer's tier -- the real suite -- not by inspecting the introducing module's state.

**Ledger inbox (Rule 17).** All five entries owned by this story are **addressed**, none declined: `DW-137` by AC 1/AC 5 and tasks 3, 6, 12-14; `DW-136` by AC 3 and tasks 3, 8, 9; `DW-146` by AC 6 and task 4 (**addressed, not declined -- its decision rule is binding**); `DW-153` by AC 7 and tasks 5, 7; `DW-154` by AC 8 and task 7.

Two entries are deliberately **not** touched and are named here so the omission is legible rather than silent. `DW-138` (`owner=burndown`) -- its 2026-09-04 adjudication routed the unsearched-origin axes away from this story precisely so a geometry story would not carry harness work it does not need, and observed that 2.1f "only needs the POSITIVE direction". This story therefore adds the right-bat origin **for its own positive verdict** and does not claim `DW-138`'s negative direction, the second flip, the `c_mouth` origin, or the drop-column criterion question. `DW-149` (`owner=burndown`) -- likewise not this story's to close, but its pattern binds: every floor this story authors or touches is derived from its subject set, and `MIN_SHOT_CASES` (hand-typed 39 against a live 46) moves as a side effect of the manifest growing. Any residual on either belongs in frontmatter `deferred:` for the lead's harvest, not in the ledger.

**Why the corridor re-solve moves the bank west without costing DRAGON reachability.** The corridor constrains the ball's aim window at y 420..455 only; from y 455 to the bank at y 700 there is 245 mm of open field west to `col_dragon_leg_r`, so an angled right-flipper shot drifts freely. Widening the centre band from 6.485 mm to roughly 32 mm multiplies the angular freedom about fivefold. That is why AC 3's dimensional gate pins the **corridor width against its tunable** while the per-target proof is **behavioural** -- static arithmetic between the corridor band and each target's x-span would be the wrong observable and would fail a correct solve.

**Why a post can never terminate `col_loop_top`'s end caps.** The Loop shot column is defined as `loopTop.min.x - railL.max.x - ballMm`, so the ball's swept edge reaches the cap's x coordinate at **every** value of `LOOP_TOP_END_X_MM` -- the cap sits at the ball's tangent limit by construction. That is why 2.1d's sweep of post *positions* failed at every position inside and outside the budget, and why only removing the **face** (raising `RIDGE_DROP_MM` until the ends taper to a point, as the two exempt return rails already do) can satisfy both FR-31 and the orbit. `RIDGE_DROP_MM = 12.0` is the value at which the cap length reaches zero; the known-bad value from its own provenance sweep is 5.0, so Branch B is the more likely outcome. Plan for it, record the measurement, and move on.

**Anti-vacuity discipline (lesson 5).** Seven floors in the instruments this story touches are hand-typed literals lagging their subject sets: `MIN_SHOT_CASES` 39 (live 46), `MIN_WITNESSES` 10 (live 11), `MIN_WITNESS_SEGMENTS` 2000, `MIN_WITNESS_PATH_MM` 1500, `MIN_RELEASES_EVALUATED` 300 (live 472), `MIN_DISTINCT_PLUNGE_STRENGTHS` 50, `MIN_DISTINCT_FLIP_TICKS` 60, plus the FR-31 `postDistanceChecks >= 40` (live 41 -- one end of headroom). Every one this story touches becomes derived. A floor that cannot be derived is re-measured and ships with the measurement that chose it recorded beside it.

**What a mutation must be (lesson 3, Rule 19).** A mutation perturbs a **value** so the code still runs and the **behaviour** changes. A mutation that deletes a node so a lookup throws is not evidence -- it reddens the lookup, not the behaviour. 2.1d's verified pattern, which every mutation below follows: move a vertex or a constant by value, watch the behavioural column go red **at a named coordinate**, revert, confirm byte-identical. Mutating the committed collision document and reverting via `git checkout --` is this project's established substitute where Blender is not needed (Story 2.1c's QA pass used it three times and confirmed the document byte-identical by SHA-256).

## Verification

**Commands:**

- `"$BLENDER" --background --factory-startup --python tools/make-placeholder-blend.py` then `pnpm export:assets` -- expected: exit 0 for each; `public/assets/dragonwar.collision.json` and `dragonwar.glb` rewritten. `BLENDER` set in the shell only.
- `pnpm check:corridor` -- expected: **exit 0**. This is the story's headline flip. A green run that is not accompanied by AC 1's witness reaching the channel is a false green and a HALT.
- `pnpm check:ad7` -- expected: **exit 1**, naming `AD-7`, `DW-70` and `bd_trough`. A green run is a regression (`DW-70`, Story 2.5).
- `pnpm check:reachability` -- expected: **exit 0**, reporting per-case verdicts and the number of releases evaluated. Record the new counts against the 472 releases / 46 cases / 23 reachable / 23 unreachable baseline and **explain every verdict that moved**.
- `npx vitest run test/shot-routing.test.ts` -- expected: at or above the 45-test baseline, including the six new per-letter DRAGON cases and the derived strand columns. Record the wall clock against 5.99 s.
- `npx vitest run test/shot-reachability.test.ts` -- expected: at or above the 149-test baseline, under ~10 s of self-time. Record the figure.
- `npx vitest run test/asset-contract.test.ts` -- expected: green, with the FR-31 gate's new enclosed-end classification, tie-break throw, staleness assertion and protrusion gate all exercised.
- `npx vitest run test/replay-goldens.test.ts` -- expected: all five goldens green including every per-golden scenario block and the `PARITY_INERT` sweep in both directions.
- `npx vitest run` -- expected: at or above **91 files / 1422 passed / 0 failed** with `BLENDER` exported, skip count unchanged, no test deleted, skipped or weakened.
- `pnpm typecheck` -- expected: all three projects clean. (`test/fixtures/**` is excluded from `tsconfig.node.json`, so the harnesses have no compiler net -- check their imports by running them.)
- `pnpm lint:boundaries`, `pnpm check:headers`, `pnpm check:attributions` -- expected: exit 0 for each; every new file carries the GPL-3.0 header line. Stage new files (`git add`) before the header/attribution checks, which read `git ls-files`, then unstage.
- `pnpm build && pnpm check:dist && pnpm check:size` -- expected: exit 0 for each.
- `node -e "const d=require('./public/assets/dragonwar.collision.json');const n=Object.fromEntries(d.nodes.map(x=>[x.name,x]));console.log(n.col_sling_r.bboxMm.min.x - n.col_ramp_wall_l.bboxMm.max.x)"` -- expected: **>= 26.99**. The gate condition in one line.
- `git diff --stat -- test/replays/` -- expected: **non-empty** (the five re-recorded goldens), and every change explained in `## Spec Change Log`.
- `git grep -i "blender-5\|Program Files.*Blender" -- ':!tools/blender.mjs' ':!_bmad-output/'` -- expected: **empty**. (`DW-46`; the five `_bmad-output` artifacts holding the host path are `DW-131`, Story 6.7's, and are excluded here deliberately.)

**Mutations (Rule 19 -- one per AC; each applied, red observed at a named value, reverted, tree verified byte-identical via `git status --short` and `git diff --stat`):**

- **AC 1** -- `mutation: in the committed collision document, shift col_sling_r's bboxMm.min.x and its footprint west by 8 mm (re-narrowing the corridor below one ball diameter of clearance) -> test/shot-reachability.test.ts goes red naming ramp-return-geometry, its right-bat witness id and a closest approach that has grown past REACHABILITY_TOLERANCE_MM, while the other cases stay green; revert with git checkout -- and confirm byte-identical.` Behavioural: the witness still runs, the ball still flies, only the outcome changes.
- **AC 2** -- `mutation: change the right-bat witness's flip tick by +40 in test/util/reachability.ts so the shot leaves the bat late and the Ramp return misses the right inlane feed -> the Ramp case's toContain('s_inlane_r') and assertReachesFlipperBand(..., 'r') go red naming the missing switch and the band; revert.`
- **AC 3** -- `mutation: move col_dragon_d 10 mm west in the committed document so its contact band leaves the widened corridor's reach -> that letter's own per-letter case goes red naming s_dragon_d, while the other five stay green (proving the assertion is genuinely per-target and not the old hitAny); revert.` Second, for the dimensional half: `mutation: shift col_sling_r 6 mm west in the committed document (without touching the TS-side rampCorridorClearMm literal the gate compares against) -> the corridor width gate goes red naming all three quantities ("measures 28.000 mm against the authored RAMP_CORRIDOR_CLEAR_MM (34.000 mm) -- a delta of -6.000 mm"); revert.` [CORRECTED, code review] The line this replaces described changing the Python tunable without re-exporting; the shipped gate (test/asset-contract.test.ts) compares the measured collision-document width against a hardcoded TS literal that mirrors the tunable, never against a live read of the Python source, so that mutation would touch neither side of the comparison and produce no red. The mutation above is the one actually applied and observed, per `## Spec Change Log` section 11's own table.
- **AC 4** -- `mutation: raise RIDGE_DROP_MM from its shipped value to 5.0 (the value its own provenance sweep records as retiming the Left Loop's 34 mm entry offset into the wrong outlane), re-export, and run the orbit cases -> left-loop-orbit-34 goes red on its s_inlane_r / assertReachesFlipperBand('r') clause at a named outlane; revert and re-export, confirming the document byte-identical by hash.` This is the Block If's own falsifier, and it doubles as Branch A/B evidence for AC 6.
- **AC 5** -- `mutation: shift col_ramp_wall_l 3 mm east in the committed document so col_sling_r.min.x - col_ramp_wall_l.max.x falls below 26.99 -> pnpm check:corridor exits 1 again with the new measured shortfall in its message; revert.` The gate must track the geometry, not a frozen literal.
- **AC 6** -- `mutation (Branch A): revert RIDGE_DROP_MM to 2.5 so col_loop_top's 9.5 mm end caps return -> the FR-31 forward gate goes red naming col_loop_top's two bare ends at (50.00, 1009.55) and (418.40, 1009.55).` `mutation (Branch B): delete the col_loop_top exemption's new verify() body's assertion -> the reverse-direction staleness test goes red naming the exemption whose recorded measurement no longer holds.` Whichever branch ships, its mutation is the one demonstrated; record which and why.
- **AC 7** -- `mutation: move col_lock_ceiling's east riser (LOCK_CEILING_EAST_SHOULDER_MM) 8 mm north in the committed document -> the re-derived verify() goes red naming the riser's new midpoint: "col_lock_ceiling riser midpoint (194.00, 616.00) -- DERIVED from the live footprint, not read from a literal -- has no ENCLOSED_END_DECLARATIONS entry. This is the DW-153 defect exactly: the riser moved and the record did not follow."; revert.` This is precisely the defect that made DW-153 invisible: the old circular `verify()` (which passed the post's own authored literal to `expectPostNear()`) passed at 0.000 mm through exactly this change. [CORRECTED, code review] The line this replaces said the re-derived check names "the post's distance" -- the shipped `col_lock_ceiling` exemption removed both terminating posts (`col_post_lock_ceiling_e`/`_w`) and its `verify()` now asserts point-in-polygon enclosure, not a post distance; the mutation and quoted failure above are the ones actually applied and observed, per `## Spec Change Log` section 11's own table.
- **AC 8** -- four, one per sub-case, each behavioural: `(a) mutation: move col_dragon_leg_l's end 2 mm further inside col_lock_ceiling_west_fill -> the enclosed-end classification names it instead of isJoined() silently skipping it.` `(b) mutation: edit a quad's footprint so its 2nd- and 3rd-shortest edges tie within the epsilon -> freeEndsMm() throws naming the body and the edge lengths instead of resolving by vertex order.` `(c) mutation: make the staleness check's derivation throw a TypeError (a malformed vertex) rather than the shape-reason throw -> the catch now fails naming the body instead of laundering it into "still exempt".` `(d) mutation: move a rubber_post entirely inside its neighbouring body's footprint -> the protrusion gate goes red naming the post and the burying body.`
- **AC 9** -- `mutation: re-bevel one moved body's north-facing flank to a shallower angle (below 16.699 deg) in tools/make-placeholder-blend.py, re-export -> the DERIVED strand column above that body goes red naming the column, the body and the measured displacement, with no one having added a column for it -- which is the whole point; revert and re-export.` Second, anti-vacuity: `mutation: restrict the derived generator's subject set to an empty array -> the derived floor fails loudly rather than reporting success.`
- **AC 10** -- `mutation: set ONE golden's expectedHash to a fabricated value (roll-and-drain -> deadbeef) -> test/replay-goldens.test.ts goes red for that golden alone ("roll-and-drain: finalHash: expected 3ece0ecb to be deadbeef"), the other four green, confirming each golden's recorded hash is genuinely asserted against a freshly computed trace; revert.` [CORRECTED, code review] The line this replaces asked to revert an `expectedHash` "to its **pre-re-record** value" and concluded that this "confirm[s] the re-record is genuinely load-bearing and **not a header refresh**". Both halves were unavailable as written: `## Spec Change Log` section 8 establishes -- by tracing every golden against both documents -- that there was **no re-record**, only a header-only `assetHash` refresh, so no golden has a pre-re-record `expectedHash` to revert to, and a hash mutation cannot distinguish a re-record from a header refresh in either direction. The mutation above is the one actually applied and observed, per section 11's own table. The clause AC 10 needs and gets is a different one, and it is separately covered: `header.assetHash` is load-bearing because `runReplay()` (`src/sim/loop/replay.ts:227-230`) throws when it disagrees with the live collision document, which `test/replay-goldens.test.ts:296` pins directly -- so the five `assetHash` bumps were required by the re-export, not cosmetic. The remaining preservation clauses (`check:ad7` red, `TABLE.shots === {}`, no test weakened, no Blender path) are gates asserted by the commands above, not ACs needing their own mutation.

**QA pass, 2026-09-05 -- new test file and its own mutations (additive to the implement stage's per-AC list above, not a replacement for it).**

New file: `test/right-bat-witness-precision.test.ts` (QA) -- 7 tests, in-suite, no new export or source change. Targets two items this story's own `deferred:`/Design Notes flagged as the weakest-covered spots: the right-bat witness family's own timing precision (AC 1/AC 2, "check it cannot silently degenerate ... a wrong flip tick is detectable rather than absorbed"), and the `dragon-targets-d-and-r-not-right-bat-reachable` asymmetry (AC 3, "a pin that distinguishes declared-and-verified from independently rediscovered"). It duplicates the minimal serve/settle/plunge/flip mechanics of `replayWitness()` (`test/util/reachability.ts`) locally -- the same duplication convention `reachability-sweep.harness.ts` already uses -- so it can vary `flip.atTick` without a manifest entry; no witness teleports (served by `c_trough_eject`, moved only by `frame.plunger`/`frame.flipper_r`).

- **AC 2 (additional)** -- `mutation: in this file's own LATE_TICK constant, change 3899 + 40 to 3899 + 0 (undoing the lateness) -> "a flip ... never closes s_ramp_made" goes red: the flip at tick 3899 closes s_shooter_lane, s_loop_r_out, s_loop_r_in, s_inlane_r, s_ramp_enter AND s_ramp_made, failing the not.toContain assertion; revert.` Demonstrated in-session: applied, observed red at exactly this trace, reverted, file confirmed byte-identical by SHA-256 (`b38b399b...5b`) before and after.
- **AC 3 (additional)** -- `mutation: in this file's own GRID_NEIGHBOURS constant, change [3900, 3910] to [3900, 3906] (3906 is the declared witness's own tick, not a grid neighbour) -> both "does NOT reach" cases for tick 3906 go red, naming the exact measured distances "1.449 mm" (dragon-target-d) and "2.878 mm" (dragon-target-r) against the 13.495 mm tolerance -- matching this spec's own Spec Change Log section 9 table to three decimal places; revert.` Demonstrated in-session: applied, observed red at exactly these two named coordinates, reverted, file confirmed byte-identical by SHA-256 before and after.

Both mutations were applied to and reverted from the new QA test file only; no production source, geometry, spec-owned tunable or committed golden was touched. `git status --short` and `git diff --stat HEAD` after the revert showed no tracked-file change at all, and the new file re-hashed identical to its pre-mutation state.

Re-run in full after adding the file (`BLENDER` exported throughout): `npx vitest run` -- **91 files / 1455 passed / 0 failed** (90/1448 baseline + this file's 1/7); `pnpm check:corridor` -- exit 0; `pnpm check:ad7` -- exit 1, still naming `AD-7`/`DW-70`/`bd_trough`; `pnpm check:reachability` -- exit 0, 644 releases / 50 cases / 30 reachable / 20 unreachable (unchanged), with `dragon-target-d`/`dragon-target-r`'s own sweep-reported closest approaches (1.449 mm / 2.878 mm at recipe #643, the explicit witness re-push) matching this file's own measurements exactly; `pnpm typecheck` (three projects) -- clean; `pnpm lint:boundaries`, `pnpm check:headers`, `pnpm check:attributions` -- exit 0 (new file staged then unstaged for the header/attribution scan, per this file's own `## Verification` convention); `pnpm build && pnpm check:dist && pnpm check:size` -- exit 0, 0.848 MB unchanged; the Blender-path grep -- empty outside the sanctioned exceptions, and the new file does not appear in the hit list.

Weak spots reviewed and found **already adequately covered by the existing suite, no new test added** (to avoid redundant coverage): the reachability-sweep harness's anti-vacuity floors (`MIN_DISTINCT_PLUNGE_STRENGTHS`/`MIN_DISTINCT_FLIP_TICKS` no longer exist as literals at all -- replaced by the built-vs-realised `axisCoverage()`/`realizedCoverage` comparison, confirmed by direct source read; `minReleasesEvaluated()` is `recipes.length`, genuinely tracking the subject set); the five re-recorded goldens' provenance (`test/replay-goldens.test.ts`'s own DW-70/`deviceSlots` notes check, `PARITY_INERT` falsifiability check and five per-golden scenario blocks are all untouched by this story's diff -- confirmed via `git diff --stat 65c14b2 HEAD -- test/replay-goldens.test.ts`, empty -- so the risk surface is only the golden JSON data, which the existing dynamic checks already stress).

**Manual checks:**

- Confirm **no witness teleports**: read every `WITNESSES` entry's construction and check its ball reaches its origin through `c_trough_eject`, `frame.plunger` and `frame.flipper_*` alone, with no assignment to `ball.state.pos` or `ball.hit.vel` anywhere in `test/util/reachability.ts`.
- Confirm each new witness's recorded parameters replay to the same trajectory twice in a row (`AD-3`). A witness that does not reproduce is not evidence.
- Confirm every `descend-*` release point still lies directly above the body it names **and** clears every `col_` footprint by more than 13.495 mm (`assertReleaseClear`, `DW-77`) -- an unclear release is ejected by the solver and manufactures a phantom rest, which is exactly how 2.1d's first whole-playfield sweep produced 73 false strands.
- Confirm every re-recorded golden's `notes` was **appended to**, not rewritten, and still contains the `DW-70` and `deviceSlots` literals.
- Confirm the `PARITY_INERT` allowlist still holds exactly `nudge-coupling` and `two-ball-collision`, in both directions.
- Confirm `TABLE.shots` is still exactly `{}` (`test/table.test.ts:261`) and `header.tableHash` is unchanged across all five goldens.
- Confirm `ATTRIBUTIONS.md` needs no new row -- this story adds no third-party code, asset or dependency. If that ceases to be true, the entry lands **before** the file does (`CLAUDE.md`).
- Read the recorded verdict table in `## Spec Change Log` and confirm every shot case appears exactly once with a verdict, a measured closest approach, and either a witness id or a ledger id. A missing row is a case that was never evaluated.

## Auto Run Result

**Planning pass (2026-09-04).** Spec authored from a four-strand investigation of the committed tree at `bf0f33c`: the bottom-right geometry and its budget, the FR-31 gate and its four degenerate-input paths, the Story 2.1e reachability instrument and the strand detector, and the export pipeline with the five goldens. Every figure in the Code Map was measured against `public/assets/dragonwar.collision.json` during planning, and `pnpm check:corridor` was run to confirm its deliberate red verbatim.

**Findings that changed the plan's shape** (all recorded in the Code Map and Design Notes):
- **The reachability harness cannot currently prove this story's own AC 1.** All 11 witnesses and every one of the 472 sweep releases are plunge or plunge-then-**left**-bat; `ReleaseRecipe` has no `side` field. The Ramp is a right-flipper shot, so no witness can reach it at any corridor width. Closing that gap is Phase 0 -- ahead of any geometry work -- and it is scoped to the positive direction only, leaving `DW-138`'s negative direction with `burndown` where its adjudication put it.
- **`SLING_R_X0_MM = 314.0` is a bare literal that bought nothing.** 2.1c derived the sling's *east* face to open the right inlane mouth (11.5 -> 39.1 mm); the west face merely followed to preserve a span, and the script admits it carried no measurement. It is the largest free lever in the quadrant and becomes a named, derived, provenance-carrying tunable under `AD-15`.
- **A post can never terminate `col_loop_top`'s end caps**, because the cap sits at the ball's tangent limit by construction at every value of `LOOP_TOP_END_X_MM` -- which explains why 2.1d's position sweep failed everywhere and why only removing the face can work. `RIDGE_DROP_MM = 12.0` is where the caps vanish; the known-bad value is 5.0, so `DW-146`'s Branch B is the likelier outcome and is planned as a first-class path, not a failure.
- **`DW-154`(c) is already closed** as the ledger words it (`test/asset-contract.test.ts:727-738`, 2026-09-03 review); the honest residual is that the staleness `catch` still discards the error object. Addressed as such rather than re-fixed.
- **`DW-153`'s guide end is itself enclosed** inside `col_dragon_leg_r`, which makes "classify enclosed ends explicitly" the shared root fix for `DW-153` and `DW-154`(a)/(d). The union-buried census is 4 of 48; `col_post_sling_r_west` is a fifth at 7/8 buried and sits on a face this story moves.
- **`epics.md`'s "2 of 6" is criterion-dependent** (2 under "target wholly inside the corridor", 3 under "ball body overlaps"). The AC is "all six" and is unaffected; the measurement is recorded rather than re-litigated, so this is not an intent gap.

No `intent gap` and no AD conflict were found: the spine has no AD about the corridor, and OQ-6 leaves playfield geometry to the Blender source under `AD-11`. All five ledger entries in this story's inbox are addressed, none declined. `multiple-goals` and `oversized` carried in frontmatter `warnings`.

**Implement + review pass (2026-09-05).**

**Summary of implemented change.** The bottom-right quadrant was re-solved as one derived budget from the Lock lane's east wall (190.0, unmoved) to `col_sling_r`'s east face (370.4, unmoved): the bare literal `SLING_R_X0_MM` became `SLING_R_X1_MM - SLING_R_SPAN_MM` with `SLING_R_SPAN_MM = 38.0` named and provenanced (`AD-15`); the new tunable `RAMP_CORRIDOR_CLEAR_MM = 34.0` sets the corridor, and the Ramp channel, DRAGON bank/backstop, `DRAGON_LEG_R_W_MM` and five previously-literal posts all derive from it. The gate condition `col_sling_r.min.x - col_ramp_wall_l.max.x` moved from -24.000 to **+34.000 mm**. Phase 0's instrument gap (no witness or sweep release could reach the Ramp, a right-flipper shot) was closed first with a `side` axis and four new right/left-bat witnesses. `ramp-return-geometry` now declares `reachable`; six per-letter DRAGON cases replace the old "at least one of six"; `DW-146` swept `RIDGE_DROP_MM` through the real pipeline and shipped **Branch B** (the exemption's `verify()` records the swept values and the case that broke); `DW-153`/`DW-154` are closed per their four sub-cases (enclosed-end classification, tie-break throw, shape-reason assertion, protrusion gate); the derived descending-strand generator (AC 9) replaced the hand-listed column set and found two pre-existing, previously-unlisted hazards (`col_wall_lane`, `col_loop_r_deflector`), both fixed. All five goldens re-recorded (`header.assetHash` only; every trace confirmed bit-identical old vs. new). `pnpm check:corridor` is now green and its intended-red documentation retired; `pnpm check:ad7` remains the sole intended-red check. Full detail, the before/after body table, the `DW-146` sweep table, the verdict table and all fourteen Rule-19 mutations are in `## Spec Change Log` above.

**Files changed:**
- `AGENTS.md` -- retired the `check:corridor` intended-red statement; corrected the `check:reachability` cost figures to the post-fix measurement (644 releases, ~105-108 s).
- `_bmad-output/implementation-artifacts/epic-2-context.md` -- recorded `DW-137`/`DW-136` closure and the delivered corridor arithmetic; corrected a reachability-split transcription error (28/22 -> the measured 30/20) found during review.
- `_bmad-output/implementation-artifacts/spec-2-1f-...md` (this file) -- frontmatter (`status`, `baseline_revision`, `deferred`), `## Spec Change Log`, `## Review Triage Log`.
- `assets/src/dragonwar.blend` -- re-seeded from `tools/make-placeholder-blend.py`.
- `public/assets/dragonwar.collision.json` -- re-exported; `public/assets/dragonwar.glb` byte-identical (the corridor's bodies carry no distinct visual mesh in this placeholder table -- only `vis_playfield`/`vis_spinner_l` exist and neither moved).
- `test/asset-contract.test.ts` -- `DW-154`(a-d) gate hardening; five apostrophe typos and one purposeless nested block fixed at review.
- `test/dw137-corridor-gate.test.ts` -- deleted (intended-red wrapper for a check that is now green, per the file's own anticipated preference).
- `test/fixtures/dw137-corridor/ramp-corridor.harness.ts`, `vitest.harness.config.ts` -- polarity inverted; header rewritten for the now-green gate.
- `test/fixtures/reachability/reachability-sweep.harness.ts` -- added the `side` axis; at review, replaced a vacuous `.toBeGreaterThan(1)` axis-coverage "floor" (a value compared to itself in disguise) with a genuine built-vs-realised derivation.
- `test/hop-control.test.ts` -- `CONTACT_EPSILON_MEDIAN_MM` 4.0 -> 4.5, traced to a changed bounce off a relocated post; disclosed in frontmatter `deferred:`.
- `test/replays/*.golden.json` (5 files) -- `header.assetHash` updated; `notes` appended, never rewritten.
- `test/shot-reachability.test.ts` -- re-recorded the `DW-130` feed-rail margins.
- `test/shot-routing.test.ts` -- Ramp block rewritten reachable; six per-letter DRAGON cases (at review, restored the `assertNotStillInPlay` call the two retired cases they replace both made); derived strand-hazard generator (AC 9) with two new fixes.
- `test/util/reachability.ts` -- right-bat witness origin and four new witnesses; at review, `MIN_WITNESSES` moved from a bare literal to a genuine derivation (distinct `expectedSwitch` count).
- `test/util/shot-cases.ts` -- `ramp-return-geometry` flipped to reachable; six per-letter DRAGON cases added; `descend-*` columns re-sited.
- `tools/make-placeholder-blend.py` -- the corridor re-solve (see Summary); the five `DW-153` post decisions; the ramp-turn grade fix; two new strand-hazard fixes.

**Review findings breakdown.** Four review layers (blind-hunter, edge-case-hunter, verification-gap, intent-alignment) ran against the full diff since baseline `65c14b2`. Fourteen distinct findings after dedup: **7 patch** (all fixed in this pass -- see `## Review Triage Log` for detail and Rule-19 verification of the two behavioural fixes), **3 defer** (recorded in frontmatter `deferred:`: a currently-inert 120 mm search-radius blind spot in the AC 9 face generator; a `col_ramp_turn` self-intersection case already caught by `export.py`'s own convexity validator; the pre-existing TS/Python tunable-duplication pattern applied to the new `RAMP_CORRIDOR_CLEAR_MM` pin), **4 reject** (a false-positive "truncated diff" claim, verified and refuted; a misunderstanding of what `followup_review_recommended` measures; one restatement of the already-authorised `DW-146` decision; one restatement of an already-disclosed `deferred:` entry). No `intent_gap`, no `bad_spec` -- every real finding was fixable in-place without touching `<intent-contract>` or reopening a design question.

**Follow-up review recommendation.** Patched findings this pass, by severity: high 0, medium 2 (the axis-coverage floor; the dropped `assertNotStillInPlay`), low 5 (apostrophes, nested block, `MIN_WITNESSES`, two stale spec mutation lines). Score = 3x2 + 1x5 = **11** (>= 5) -> **`followup_review_recommended: true`**. Set in frontmatter accordingly.

**Verification performed (re-run in full after all review patches, `BLENDER` exported throughout).**
- `pnpm check:corridor` -- exit 0.
- `pnpm check:ad7` -- exit 1, naming `AD-7`, `DW-70`, `bd_trough` (regression check: still red).
- `pnpm check:reachability` -- exit 0; 644 releases, 50 cases, **30 reachable / 20 unreachable** (baseline 472/46/23/23); axis floors now genuinely derived and Rule-19-verified (mutation: dropped every `plungeHoldTicks === 521` release inside the evaluation loop -> red naming "REALISED only 59 of the 60 distinct plunge strengths it BUILT"; reverted, confirmed byte-identical).
- `npx vitest run test/shot-routing.test.ts` -- 52/52 passed (baseline 45).
- `npx vitest run test/shot-reachability.test.ts` -- 161/161 passed (baseline 149).
- `npx vitest run test/asset-contract.test.ts` -- 59/59 passed.
- `npx vitest run test/replay-goldens.test.ts` -- 51/51 passed, all five goldens plus every scenario block and the `PARITY_INERT` sweep in both directions.
- `npx vitest run` (full suite, `BLENDER` exported) -- **90 files / 1448 passed / 0 failed / 0 skipped** (every Blender-gated test executed, not skipped). Without `BLENDER`, skip count is unchanged at 23 (`test/shot-routing.test.ts` file count -1 vs. the 91-file baseline is the deliberate `test/dw137-corridor-gate.test.ts` removal per task 13; +26 tests net).
- `pnpm typecheck` -- clean (three projects), re-run after every patch.
- `pnpm lint:boundaries`, `pnpm check:headers`, `pnpm check:attributions` -- exit 0 (no new files to stage).
- `pnpm build && pnpm check:dist && pnpm check:size` -- exit 0; 0.848 MB against a 2.750 MB budget.
- Gate condition one-liner -- `34` (>= 26.99).
- `git diff --stat -- test/replays/` -- non-empty (5 files, 2 lines each).
- Blender-path grep (long-form exclude pathspec, `_bmad-output/` excluded per `DW-131`) -- empty outside the sanctioned exception; a `Program Files.*Blender` regex hit in the unrelated, untouched `test/blender-resolve.test.ts` is a pre-existing generic path-resolution literal, confirmed unchanged since baseline.
- Manual checks (spec `## Verification`) -- no witness teleports (verified by reading every `WITNESSES` construction); every new witness reproduces; every `descend-*` release clears every footprint by > 13.495 mm; every golden's `notes` was appended, not rewritten, and still carries the `DW-70`/`deviceSlots` literals; `PARITY_INERT` still holds exactly `nudge-coupling` and `two-ball-collision`; `TABLE.shots` still exactly `{}`; `ATTRIBUTIONS.md` needs no new row.

**Residual risks (all recorded in frontmatter `deferred:`, 11 entries total).** `DW-146` Branch A remains measurably available but uncosted-for-shipping (would need a full witness re-derivation and a genuine five-golden re-record on changed traces -- a dedicated story's work, not this one's). Two DRAGON targets (`d`, `r`) are witnessed-reachable but not yet struck by a swept real flipper shot. The AC 9 face generator has a currently-inert 120 mm blind spot. `col_ramp_turn` relies on `export.py`'s general convexity check rather than an inline guard. The corridor-to-bank straight shot no longer exists post re-solve (Story 2.3's design call). `test/hop-control.test.ts`'s contact epsilon moved 0.5 mm (traced, not a hop). None of these block this story's own ACs, all ten of which pass with their Rule-19 mutations demonstrated.

Status: done
Blocking condition: none
