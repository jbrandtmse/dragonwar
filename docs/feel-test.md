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
  triangle and the flipper reconciliation) on the same host.
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
