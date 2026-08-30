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
| Cradling | Ball-on-bat drift ≤ 35 mm through the first simulated second (measured 27.5 mm); measurably departed by 5 s (measured ~4292 mm) — DW-72's 1 s bound, owed to Story 2.1 for the real 5 s pocket | [`test/replays/hold-and-release.golden.json`](../test/replays/hold-and-release.golden.json) | `pending-author` |
| Flipper snap | 30 ms tap: release 104.3998°, true peak 90.0416° — a margin of 0.0416° short of the 90° stop (DW-80, closed) | [`test/replays/hold-and-release.golden.json`](../test/replays/hold-and-release.golden.json) | `pending-author` |
| Rejection/rebound | Rebound-to-impact ratio at 1000/3000/5000 mm/s: 0.7584 / 0.7150 / 0.6886 (strictly decreasing, default `elasticityFalloff` 0.15); flat control at `elasticityFalloff` 0: 0.7819 / 0.7777 / 0.7776. Hop: `hopControl` 0 → max ball height 13.53 mm (no hop); default 0.35 → 25.41 mm, an 11.88 mm margin, nothing above the glass (400 mm) | [`test/replays/hold-and-release.golden.json`](../test/replays/hold-and-release.golden.json) | `pending-author` |

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
- Date: 2026-08-29 (UTC).
- Repository: `jbrandtmse/dragonwar`, branch `DW-1-epic1`.

## Items

**Cradling.** A ball resting on a raised, held flipper bat. This epic's
placeholder table has no pocket geometry beside either flipper (no inlane
guide or post — Epic 1 context), so a real, multi-second cradle does not
exist here; the machinable claim is bounded to the first simulated second
(DW-72), and the full 5 s claim is Story 2.1's, against the real playfield.

**Flipper snap.** The ported `FlipperMover`'s response to a light, 30 ms tap
— rises strictly between rest and the end-of-stroke angle, never completing
the stroke, then returns fully to rest (`DW-80`).

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

`pending-author`. Build-side measurement: with the left flipper held raised
and a ball placed against its face (`test/flipper-collision.test.ts`'s own
"(b)" case), drift stays ≤ 35 mm (measured 27.5 mm) through the first
simulated second, then measurably exceeds 500 mm (measured ~4292 mm) by 5 s
— the ball departs because this epic's placeholder table has no pocket
geometry (the 1 s bound is DW-72's, owed to Story 2.1 for the real 5 s
pocket), not because of a defect in the ported flipper (the bat is provably
static while held: `test/flipper-collision.test.ts`'s own "(a)" case,
unmoving within 0.01° for the full 5 s hold). Golden:
[`test/replays/hold-and-release.golden.json`](../test/replays/hold-and-release.golden.json)
(`fs.existsSync`-checked by `test/feel-test-docs.test.ts`).

### Flipper snap

`pending-author`. Build-side measurement (DW-80, closed this story): a 30 ms
tap releases the bat at 104.3998°, which coasts under its own momentum to a
true peak of 90.0416° — a margin of 0.0416° short of the 90° end-of-stroke
stop, then returns fully to rest. Re-measured on this story's final tuning
(the rebuild seam, pitch, hop control and elasticity falloff all land in this
story) and found numerically identical to Story 1.6's own baseline, because
none of this story's tunables touch `TUNING.flipper.*` or the ported mover.
Golden:
[`test/replays/hold-and-release.golden.json`](../test/replays/hold-and-release.golden.json).

### Rejection/rebound

`pending-author`. Build-side measurement: three impact speeds
(1000/3000/5000 mm/s) driven into the flipper rubber at the shipped default
falloff (0.15) give a strictly decreasing rebound-to-impact ratio — 0.7584,
0.7150, 0.6886 — while a falloff-0 control over the identical three speeds
gives a flat ratio (0.7819, 0.7777, 0.7776), the discriminator that makes
"decreases with speed" falsifiable rather than an artifact of the solver's
ordinary velocity-dependent contact response (AC 3). Separately, the paired
`hopControl = 0` vs. default (0.35) stress replay of hard flipper hits: at
`hopControl = 0`, max observed ball height 13.53 mm (the resting height,
13.495 mm, within a small contact epsilon — exactly zero hops); at the
shipped default, 25.41 mm — an 11.88 mm margin, comfortably clear of the
glass at 400 mm (AC 2). Golden:
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
