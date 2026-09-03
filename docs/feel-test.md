# Feel test — the Reference-machine ritual

Story 1.9. The feel ritual Epic 1's own goal names ("starts here and never
stopping") and AD-15's closing line governs: "When a tuning change trades
feel for fidelity, feel wins and the Reference-machine ritual decides."
Three items, each run against the Reference machine (Stern *Dungeons &
Dragons* — a feel reference only; no art, audio or rules are taken from it):
cradling, flipper snap, rejection/rebound. Each item's first dated entry is
closed as one of three verdicts — `no-material-difference`,
`tuning-change`, or `accepted-difference` — against the physical machine.

This document delivers the **machinable, headless** half: the three items
defined below, the dated-entry format, the link-to-golden mechanism
(demonstrated against a real, checked-in golden file), and the measured
build-side number for each item, taken from this story's own real physics
harness in Node. Two legs remain open and are named as such throughout: the
**both-renderer-paths browser run** of the build side (defined below, not yet
performed -- Rule 7 places browser-tooled checks on the lead, and no
browser-automation tool was available to the implementation pass) and **the
comparative verdict against the Reference machine, which is the author's own
leg** (frontmatter `deferred:`,
`ac5-reference-machine-leg-is-author-owned`) — no agent can play a physical
pinball machine. Until played, each item's first entry reads `pending-author`
and `test/feel-test-docs.test.ts` asserts exactly that, so the gap is visible
in CI rather than silent.

## Verdict: **headless build-side PASS — browser dual-path run and reference-machine comparison both pending author**

| Item | Measured build-side number | Golden | First entry |
|---|---|---|---|
| Cradling | The real 5 s cradle, DW-72 closed: a ball the physics settles (never placed) into the drain triangle's tip-side pocket drifts under 0.2 mm over the full 5000-tick held hold (measured 0.172 mm), then reaches `bd_trough` within a generous window when released instead (measured tick 591) | [`test/replays/hold-and-release.golden.json`](../test/replays/hold-and-release.golden.json) | `pending-author` |
| Flipper snap | 10 ms tap (DW-118; 30 ms is no longer usable — DW-78's reconciliation now carries its coast to the stop EXACTLY, and 25 ms clears it by only 0.0122°, the same knife-edge that let 30 ms break silently): still mid-stroke at the exact release tick (measured 139.1871°, between rest 141° and end 90°); its own momentum carries it to a peak of 109.3221°, a real ~19.3° clear of the end-of-stroke stop — DW-78's reconciliation shortened `flipperRadius`, so `inertia = (1/3) m flipperRadius²` fell to ~68% of its old value | [`test/replays/hold-and-release.golden.json`](../test/replays/hold-and-release.golden.json) | `pending-author` |
| Rejection/rebound | Rebound-to-impact ratio at 1000/2000/3000 mm/s (re-measured this story at these three speeds — 5000 mm/s now lands too close to the reconciled bat's own tapered tip for a consistent face hit): 0.7560 / 0.7347 / 0.7183 (strictly decreasing, default `elasticityFalloff` 0.15); flat control at `elasticityFalloff` 0: 0.7789 / 0.7777 / 0.7775. Hop: `hopControl` 0 → max ball height 13.53 mm (no hop); default 0.35 → 24.53 mm, an 11.00 mm margin, nothing above the glass (400 mm) | [`test/replays/hold-and-release.golden.json`](../test/replays/hold-and-release.golden.json) | `pending-author` |

## Environment

- Machine: `NOMAD`, Windows 11 Pro 10.0.26200, Intel Core i5-8259U @ 2.30GHz
  — the same host `docs/spikes/spike-1.md` and `docs/spikes/spike-3.md` were
  measured on.
- Browser: not yet exercised. The headless numbers below come from Node
  (Vitest) through this story's own `sim/loop`/`sim/physics` harness, which
  is the authoritative leg for a physics claim (AD-15). The browser leg
  (`?renderer=webgl2` and the default path) is recorded as `pending-author`
  under "Both renderer paths" below, and its own machine/OS/browser row
  belongs with that dated entry when it is run.
- Date: 2026-08-29 (UTC); re-measured 2026-08-30 (Story 2.1a, the drain
  triangle and the flipper reconciliation) and again 2026-08-31 (Story 2.1a
  rework iteration 3 — the `DW-119` outlane routing fix and `DW-118`'s
  re-measured light tap), both on the same host. Story 2.1a rework iteration
  4 regenerated the `.blend` and re-exported both artifacts again the same
  day (`BOTTOM_WALL_DRAIN_DROP_MM`, the `DW-119` bottom-wall slope): every
  figure below was re-verified green against that document and none of them
  moved, because that change touches only `col_wall_bottom_l/_r`'s top edge
  and neither the cradle pocket nor the flipper is anywhere near it.
  Re-measured again 2026-09-03 (Story 2.1c, the orbit routing and the inlane
  feed) on the same host: the drain triangle, the cradle pocket and both
  flipper boxes are untouched by that change and every figure below was
  re-verified green against the regenerated document, with the Loop, Ramp
  and plunge entries updated where the routing genuinely moved them. The
  plunge was re-measured under ONE named harness -- `runReplay()` over
  `test/replays/roll-and-drain.golden.json`'s own header and coilPrologue
  with its transitions removed, i.e. the real conductor and a real
  autolaunch, never a hand-placed ball: it clears the Loop entrance (mouth
  x 428.4-480.4) at tick 5595, crosses the top at max y 1053.19 mm, is in
  the LEFT bat band for 326 ticks from tick 8639, and its closest approach
  to the left bat's own box is 0.00 mm (it genuinely contacts the bat).
  Neither of the two conflicting figures previously on record (574+ band
  ticks / 7.9-20.4 mm, and 438 / 3.66 mm) is carried forward; this
  measurement supersedes both.
- Repository: `jbrandtmse/dragonwar`, branch `DW-1-epic2`.

## Items

**Cradling.** A ball the physics settles, by itself, into the cradle pocket
beside a raised, held flipper bat. Story 2.1a authors the drain-triangle
geometry that closes that pocket (the outlanes, inlanes, divider and outer
guides, and a rubber post at the bat's own tip) and proves the full 5 s hold
`DW-72` names — closed this story, on evidence against the real playfield
rather than Epic 1's bounded 1 s claim.

**Flipper snap.** The ported `FlipperMover`'s response to a light, 10 ms tap
(`DW-118`) — still mid-stroke at the exact tick the key comes up, then its own
momentum carries it partway toward the end-of-stroke stop under
`updateDisplacements()`'s own clamp, clearing it by a real, comfortable
margin. Story 2.1a's flipper reconciliation (`DW-78`) lowered
`flipperRadius`, and therefore the ported mover's own
`inertia = (1/3) m flipperRadius²`, so a 30 ms tap's coast now reaches the
true end-of-stroke stop EXACTLY rather than falling 0.0416° short — FR-5's
light-tap promise survives, but only a shorter tap still demonstrates it, so
the example duration moved to 10 ms (`epics.md`'s Story 1.6 AC amended
accordingly, under a one-time scoped grant).

**Rejection/rebound.** How a ball leaves the flipper rubber on contact:
`materials.flipper_rubber.elasticityFalloff` (AC 3, "the primary feel knob")
governs rebounds staying lively at low speed and never pingy at high speed;
`hopControl` (AC 2) governs the occasional vertical hop a hard hit produces —
zero at `hopControl = 0`, a measurable margin at the shipped default.

## 2026-08-29 — first entries (build-side numbers; browser smoke and reference-machine comparison both pending author)

**Provenance:** the physics numbers below come from this story's own real
test harness (`sim/loop`/`sim/physics`, driven headlessly in Node — the
authoritative leg for a physics claim, AD-15) — genuinely measured, not
estimated. The **browser-tooled per-story smoke** on both renderer paths
(`pnpm build` + `pnpm preview`, press-to-begin, serve, flip; then the panel
opened via the console hatch on `?renderer=webgl2`) is Rule 7's own
allocation to the lead, not this implementation pass — this environment has
no browser-automation tool available to it, so that leg is recorded as
`pending-author` below, alongside the Reference-machine comparison itself,
rather than fabricated.

### Cradling

`pending-author`. Build-side measurement, re-measured 2026-08-30 (Story
2.1a, DW-72 closed): a ball is never placed on the raised bat — it is
DROPPED, clear of the modelled body, and the physics settles it into the
drain triangle's tip-side pocket by itself (`test/flipper-collision.test.ts`'s
`arrangeCradleBall()`). Held for the full 5000-tick (5 s) hold, drift from
the settled position stays under 0.2 mm (measured 0.172 mm, against a
one-ball-radius bound of 13.495 mm) and speed stays at rest (measured
0.139 VU/T) throughout — the pocket closes at the bat's own TIP, not its
pivot (the pivot's own `hitCircleBase` is a full circle, angle-invariant
regardless of stroke, so a pocket that closed there would trap a ball
permanently and could never pass the discriminating negative below). The
SAME arrangement, released instead of held, reaches `bd_trough` within a
generous window (measured tick 591 after release) — proving the 5 s hold is
produced by the guide AND the flipper together, not by the static guide
alone. Golden:
[`test/replays/hold-and-release.golden.json`](../test/replays/hold-and-release.golden.json)
(`fs.existsSync`-checked by `test/feel-test-docs.test.ts`).

### Flipper snap

`pending-author`. Build-side measurement (`DW-80`, closed Story 1.6/1.9;
re-measured 2026-08-30, Story 2.1a's `DW-78` reconciliation; re-measured
again 2026-08-31, Story 2.1a rework iteration 3, `DW-118`): `DW-78`
shortened the modelled body's own `flipperRadius` from 71.8169 mm to
59.3169 mm to match the authored box exactly, and the ported
`FlipperMover`'s own (frozen, DW-79) `inertia = (1/3) mass * flipperRadius²`
falls with the square of that, to ~68% of its old value — the same torque
now accelerates the bat harder. A 30 ms tap's own post-release coast no
longer merely nears the 90° stop (Story 1.6/1.9's own 0.0416° margin); it
reaches it EXACTLY, and 25 ms only narrowly avoids the same fate (0.0122°
short of a full stroke) — so the light-tap example moved to a duration whose
margin is real, not a knife-edge: a 10 ms tap is STILL mid-stroke at the
exact release tick (measured 139.1871°, strictly between rest 141° and end
90°) — a light press has not instantly completed the stroke while the key is
still down. Its own momentum then carries it, under the ported mover's own
end-of-stroke clamp, to a peak of 109.3221° — a comfortable ~19.3° clear of
the 90° stop, never reaching it. `epics.md`'s Story 1.6 AC was amended
30 ms → 10 ms by the lead under a one-time scoped grant, with the full
measured sweep (30/25/20/15/12/10/8/5 ms) recorded in that story's change
log; FR-5's light-tap promise is unchanged, only the demonstrating duration
moved. Neither `TUNING.flipper.*` nor the ported mover itself changed.
Golden:
[`test/replays/hold-and-release.golden.json`](../test/replays/hold-and-release.golden.json).

### Rejection/rebound

`pending-author`. Build-side measurement, re-measured 2026-08-30 (Story
2.1a): three impact speeds — 1000/2000/3000 mm/s, not the superseded
1000/3000/5000 mm/s (`DW-78`'s reconciliation shortened the rest bat's own
reach, and 5000 mm/s now lands too close to the tapered tip for a consistent
face hit across all three speeds; the spawn also moved from table x = 210 to
x = 195 for the same reason) — driven into the flipper rubber at the shipped
default falloff (0.15) give a strictly decreasing rebound-to-impact ratio —
0.7560, 0.7347, 0.7183 — while a falloff-0 control over the identical three
speeds gives a flat ratio (0.7789, 0.7777, 0.7775), the discriminator that
makes "decreases with speed" falsifiable rather than an artifact of the
solver's ordinary velocity-dependent contact response (AC 3). Separately, the
paired `hopControl = 0` vs. default (0.35) stress replay of hard flipper
hits (unaffected by the spawn-point change, still at table (210, 85)): at
`hopControl = 0`, max observed ball height 13.53 mm (the resting height,
13.495 mm, within a small contact epsilon — exactly zero hops); at the
shipped default, 24.53 mm — an 11.00 mm margin (was 11.88 mm against the
pre-reconciliation geometry — the harder-accelerating bat above changes
strike dynamics slightly), comfortably clear of the glass at 400 mm (AC 2).
Golden:
[`test/replays/hold-and-release.golden.json`](../test/replays/hold-and-release.golden.json).

## Both renderer paths (build side, the lead's own per-story smoke)

Both runs are `pnpm build` + `pnpm preview` (the production artifact, never
the dev server — epic context's own standing rule). **Both named here, per
AC 5; neither yet run** — Rule 7 places browser-tooled checks on the lead,
and this implementation pass has no browser-automation tool available to it:

- **Default path** (`?renderer=webgl2` NOT forced): press-to-begin, serve,
  flip. The dev tuning panel must be absent — off on the default path,
  mounted only behind the explicit console opt-in
  `window.__dragonwarBoot.openTuningPanel()` (this story's own "Always"
  rule), so this run is genuinely what AC 5's ritual measures.
- **`?renderer=webgl2`** (forced): the panel opened via the console hatch
  above, `materials.flipper_rubber.elasticityFalloff` edited, and the
  rebuild confirmed visible in the next frame (Phase 1's rebuild seam) — the
  ball's rebound behaviour should change live.

Both runs, and the three Reference-machine verdicts above, are the author's
to record as dated entries once performed; this document's own dated-entry
format is what that later run appends to, never rewriting the entries above
it.

## 2026-09-01 -- Story 2.1b: the shot map (AC 6, the seven-shot Lawlor ritual)

`pending-author`. Story 2.1b draws the rest of the shot map and completes
the switch/coil registry -- this pipeline cannot close AC 6, the Lawlor
"every miss returns playable" ritual (FR-32), which is judged against the
physical Reference machine (Stern *Dungeons & Dragons*) exactly as
Cradling/Flipper snap/Rejection above are. The seven entries below land the
build-side geometry they will be judged against. [AMENDED 2026-09-02, matching
the spec's own AC 6 amendment: the miss-destination judgement itself --
where each shot's most common miss goes, and that none may be a centre
drain, per the epic's own requirement -- cannot be derived from geometry
alone and is part of what stays `pending-author` until the Reference-machine
ritual runs; this preamble states that rather than asserting a judgement
nobody has made.] The `sprint-status.yaml` action item `epic-2-retro-item-10`
tracks this as an open author task.

### Left Loop

`pending-author`. Geometry: a chain of convex prisms from
`col_post_divider_l_hi` (the existing 2.1a post at table y = 420) up the
left side of the table (`col_loop_l_funnel`, `col_loop_l`) toward
`col_loop_top`. [CORRECTED 2026-09-02: rework iteration 3 shortened
`col_loop_top`'s own left end (x 40 -> 220) for the plunge-routing fix, so
it no longer met `col_loop_l` and a full orbit did not pass both Loops --
`DW-123`, routed to Story 2.1c.] [RE-JOINED 2026-09-03 (Story 2.1c): the
connector spans x 50 to 418.4 again and each Loop is a true ORBIT -- up one
lane, across the joined top, down the OTHER lane into the OPPOSITE inlane.
One ball now closes all four Loop switches in a single run. The lane widened
50 -> 66 mm to carry a ball in both directions, `col_loop_l_return` hands
the descending ball to the left inlane and `col_guide_inlane_feed_l` carries
it onto the left bat; `col_spinner_l` moved from the loop guide's inner face
to the perimeter face, clear of the widened lane. [CORRECTED 2026-09-03,
review fix: this note previously claimed the spinner "closes on every orbit"
-- measured false. `s_spinner` closes on the Left Loop's own ascending
entry (verified, `test/shot-routing.test.ts`, every offset in the sweep),
but does NOT close when the Left lane instead carries the Right Loop's own
RETURN descent (verified false at every offset in that sweep too):
`col_loop_l_return` hands the descending ball inboard, past
`col_spinner_l`'s own column, before it reaches the spinner's y-position.
So it counts a direct Left-Loop shot but not a Right-Loop orbit passing
through the same lane -- asymmetric, not "every orbit".]
`s_loop_l_in`/`s_loop_l_out` mark entry and exit; the spinner
(`col_spinner_l`/`s_spinner`) sits partway up the straight run. Build-side
routing verified in `test/shot-routing.test.ts`. Golden:
[`test/replays/roll-and-drain.golden.json`](../test/replays/roll-and-drain.golden.json).

### Right Loop

`pending-author`. Mirrors the Left Loop from `col_post_divider_r_hi`, and
its own upper arc (`col_loop_r`, `col_loop_r_deflector`) is what turns a
launched ball into the field now that `col_lane_deflector` is retired
(DW-58) -- verified directly: a full-strength plunge crosses
`LANE_WALL_TOP_Y_MM = 950` and is deflected off the plunger lane into the
open field (`test/plunger.test.ts`, `test/machine-serve-drain.test.ts`).
`s_loop_r_in`/`s_loop_r_out` mark entry and exit. Golden:
[`test/replays/full-plunge.golden.json`](../test/replays/full-plunge.golden.json).

### Ramp

`pending-author`. Entrance right of centre (`RAMP_ENTER_X_MM = 355`, moved
2026-09-03 from 372 to free the widened Right Loop lane, still >
`PLAYFIELD_W_MM / 2 = 257.2`) so the LEFT flipper shoots it; a return rail
carries the ball back down into the RIGHT inlane (`docs/decisions.md`
records the OQ-6 choice and why). **DELIVERED 2026-09-03 (Story 2.1c)**,
replacing the 2026-09-02 code-review note that it was not: the old return
rail's channel measured 11.5-26.0 mm over y 480-750, all under the 26.99 mm
ball, and it interpenetrated `col_loop_r` by 144.000 mm2 besides. It is
redrawn as a CROSSING, which is what a real ramp return is: `col_ramp_turn`
(a 45 deg angled prism at the top of the Ramp's own channel) turns the climb
into an eastward crossing, `col_ramp_wall_r` stops below it so the turned
ball has somewhere to go, and `col_loop_r` is split into `col_loop_r` /
`col_loop_r_lower` to leave a gap at the crossing's height. Measured:
`s_ramp_enter -> s_ramp_made -> s_inlane_r`, then the right bat band, at
every in-channel entry offset from 350 to 359 mm.
`s_ramp_enter`/`s_ramp_made` mark entry and
completion. No sloped-plane primitive exists in this collision model (see
`tools/make-placeholder-blend.py`'s own constants-block note), so the bed is
authored at deck height with `surface = 'ramp'`; `RAMP_HEIGHT_MM`/
`RAMP_GRADIENT` are recorded, unverified figures for a future visual mesh.

### Dragon

`pending-author`. Off-centre, left of `PLAYFIELD_W_MM / 2 = 257.2`
(`DRAGON_CENTER_X_MM = 170`) so a rejection deflects to a flipper -- the
right flipper takes it straight, the left flipper backhands it
(`decisions-rejected.md:14`, `machine-behaviour.md:9`). Two legs
(`col_dragon_leg_l/r`) flank the Lock lane; `s_dragon_body` (standup class)
catches a slightly-off shot against either leg's face.

### Lock lane

`pending-author`. The narrow gap between the Dragon's legs
(`LOCK_LANE_CLEAR_MM = 40`), `s_lock_lane` confirming a clean pass-through,
`bd_lock` (the Mouth) parking up to 3 balls above the legs and ejecting
through `c_mouth` aimed down-table at the flippers (AD-6). OQ-5 (the Lock
lane carries both the lock and the mode start) is recorded in
`docs/decisions.md`.

### DRAGON bank

`pending-author`. Six standup faces spelling D-R-A-G-O-N
(`col_dragon_d/r/a/g/o/n`, `s_dragon_d/r/a/g/o/n`, `settleClass:
'drop_target'`), left of the Ramp's own channel so neither crosses the
other. Drop/reset mechanics are Story 2.3's; this story authors the bodies,
zones and registry entries only.

### Top lanes

`pending-author`. Three lanes (`col_top_divider_1..4`, `s_top_1..3`) in the
upper field, on a launched ball's own path -- above the Ramp and the pop
nest, below the loop's own top connector.
