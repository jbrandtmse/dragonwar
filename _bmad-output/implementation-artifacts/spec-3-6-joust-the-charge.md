---
title: 'Story 3.6: Joust -- the charge'
type: 'feature'
created: '2026-09-30'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: [oversized]
deferred:
  - summary: 'No real flipper shot makes either Loop at this tree, so Joust (and 3.10''s Right-Loop collect, and 3.11''s full-Charge Joust) cannot be played by real input'
    evidence: 'Measured 2026-09-30 at c98dd0a (planning subagents, createMachine() + the real createShotTracker): 9,780 flips swept across the ball''s arrival after 14 real orbits, 354 re-flips from a cradle, 1,975 flips after Ramp returns, and 332 more flips from the plunge-then-bat witnesses closed ZERO Loop switches; balls launched at 2085 mm/s from six clear strike points at y = 100, aimed -80..80 deg every 1 deg, never reached s_loop_l_in (one reached s_loop_r_in, never s_loop_r_out). The collision document walls the left lane mouth from the field between y = 200 and y = 1004.8. Every Loop made or broken in the existing corpus is a teleported launch or a plunge descending from the top.'
    location: 'assets/src/** geometry (contended with Epic 5); test/util/shot-cases.ts Loop cases'
    severity: high
    footprint: out-of-footprint
  - summary: 'The shot tracker keeps one attempt and one descent per Loop, not per ball, so in a multiball (3.7 Quick multiball and 3.8 War can run above a live Joust) one ball''s descent can cancel or complete another ball''s Loop attempt'
    evidence: 'By construction (shots.ts keys state by shot name). Synthetic two-ball merges at 50/300/550-tick offsets are fixed by the descent rule this story adds, but a second ball crossing a lane mid-attempt (e.g. descending r_in while another ball is armed on the right) still breaks or suppresses that attempt. Not reachable before 3.7 serves a second ball.'
    location: 'src/sim/rules/devices/shots.ts'
    severity: med
    footprint: in-epic
  - summary: 'loopWindowMs source text claims sub-1400 mm/s Loops rattle between the two switches; measured 2026-09-30 they close s_loop_*_out once inside the 600-tick window and then fall back, and the tracker (before and after this story) credits them as made'
    evidence: 'Centred Left Loop at 1250/1300/1350 mm/s: Lin@7 Lout@526 Lout@1755 Lin@2369 outL@3180. The source sentence is corrected in this story (task 1); the false make on a sub-1400 teleported launch is left as is, since no flipper shot reaches a Loop at all (first item).'
    location: 'src/sim/table/tuning.ts loopWindowMs'
    severity: low
    footprint: in-story
---

<intent-contract>

## Intent

**Problem:** Story 3.4 registered Joust (`modes/joust.ts`, priority 310) as a shell with no Charge, no award, no timer and no Backglass view. FR-36 asks for alternating Loops that build a Charge (capped at 10x) multiplying the Loop award, broken by a miss or a repeated Loop. The shot tracker cannot supply the miss: Loops never emit `_broken` (DW-288), and a Loop orbit's descent arms the opposite Loop, so two same-side orbits can fake an alternation (DW-173).

**Approach:**
- Teach the tracker a measured, data-declared **fall-back signature** for Loops. An attempt is armed only by an entry that did not come from above. It is broken when the ball comes back down through the entry, or out to that side's inlane or outlane, before the exit switch. A descent from above, whether the orbit's far lane or the Ramp return, never arms. This fixes DW-173 as a by-product.
- Fill the Joust shell with the Charge rules, `loopValue x charge` awards through `scoring.ts`, a `joustMs` timer, the two events, and `CHARGE Xn` on the Backglass.

## Boundaries & Constraints

**Always:**
- **The tracker (AD-19, AD-3).** `TABLE.shots.shot_left_loop` and `shot_right_loop` gain a `fallBack` declaration:
  - `descents`: the left Loop has `['s_loop_l_out']`; the right Loop has `['s_loop_r_out', 's_ramp_made']`.
  - `exits`: `['s_inlane_l', 's_outlane_l']` and `['s_inlane_r', 's_outlane_r']`.
  - `windowMs: 'loopBreakWindowMs'` and `descentWindowMs: 'loopDescentWindowMs'`.

  The Ramp gets no `fallBack` and keeps its current behaviour exactly. For a shot with `fallBack`, keep at most one `flight { startTick }` and one `descent { tick }`, with every window resolved once through `shotWindowTicks`. Each tick:
  1. **Expiry first.** Silently drop a flight once `tick > startTick + breakTicks`, and a descent once `tick > descent.tick + descentTicks`. A Loop never emits `_broken` on expiry.
  2. **Then each closed edge, in order.** Each rule below fires on a closed edge of any switch this shot declares (its sequence, `descents` or `exits`), checked top-down:
     - **Own `_out` with a flight and `tick <= startTick + loopWindowTicks`:** emit `_made` and clear the flight (unchanged).
     - **A `descents` switch with no flight:** set the descent to this tick.
     - **A `descents` switch while a flight exists** (outside the made window): ignore it.
     - **Own `_in` with a flight:** emit `_broken` (the ball fell back through the entry) and clear the flight.
     - **Own `_in` with a pending descent:** clear the descent (the ball is passing down). Nothing is armed.
     - **Own `_in` otherwise:** arm a flight at this tick.
     - **An `exits` switch with a flight:** emit `_broken` and clear the flight.
     - **An `exits` switch in any case:** clear the descent.
- **Joust (AD-8, AD-7, AD-9).** Write V = `loopValue`, M = `joustChargeMax` and T = `max(1, shotWindowTicks('joustMs'))`. The Loop events come from `TABLE.modeWiring.joustLoops = ['shot_left_loop', 'shot_right_loop']` (AD-16: no `shot_` literal in rules).
  - **The entry.** It is `{ mode, priority, player, startTick, charge, timerTicks?, lastLoop?, fullCharge? }`. `onStart` returns `{ startTick: tick, charge: 1, timerTicks: T }`, with no `lastLoop`.
  - **The tick hook.** With `e = tick - startTick`, it republishes `timerTicks = T - e` while `e < T`, and returns `stop: true` at `e >= T`.
  - **Scoring gate.** The event rules below apply only while `scoringOpen(state)`. Under Tilt or outside a game every Loop event is ignored: no award, no Charge change, no event.
  - **`<loop>_made`:**
    - With no `lastLoop`, or the same Loop as `lastLoop`, the Charge becomes 1. The first Loop of a Joust, and the first after a break, **opens** the chain; it does not count as "differs".
    - Otherwise the Charge becomes `min(charge + 1, M)`.
    - Then `lastLoop` is set to this Loop, and `awardScore(state, entry.player, V * charge)` pays, using the new Charge.
    - When the new Charge equals M and `fullCharge` is not yet set, emit `joust_full_charge { player, tick }` and set `fullCharge: true`. This happens once per Joust entry.
  - **`<loop>_broken`:** emit `joust_charge_broken { player, shot, charge, tick }`, where `charge` is the Charge that was broken. Then the Charge becomes 1 and `lastLoop` is removed. It fires even at Charge 1.
  - **Stopping.** Joust has no stop hooks: the ball end, the Slam and the Attract entry stop it with no award. A higher mode never suppresses it.
  - **Other scoring.** Base spinner scoring (3.0a) is untouched and independent of Joust. Loops outside Joust still score nothing.
- **Events.** `JoustChargeBrokenEvent` and `JoustFullChargeEvent` join the `ModeEvent` union with no `mode` field, as `hurryup_collected` does. They stay off `SemanticEvent`.
- **Tuning** (`tuning.ts`, after `hurryUpUrgentMs`). Every entry is `unverified` and has an honest source:
  - `joustChargeMax` is 10. It quotes FR-36: `"Charge multiplies the Loop award up to 10"`.
  - `loopValue` is 25000, authored: "the x10 Loop equals Hurry-up's 250,000 start". Owner: Story 3.11.
  - `joustMs` is 60000, authored: "a measured Loop cycle is at least about 2.9 s, so ten alternating Loops need at least about 30 s". Owner: Story 3.11.
  - `loopBreakWindowMs` is 3000, measured: failed climbs resolve 546-2167 ticks after entry.
  - `loopDescentWindowMs` is 2500, measured: descending `_out` to `_in` takes 564-1196 ticks, and `s_ramp_made` to `s_loop_r_in` takes 1070-1893 ticks.
  - `loopWindowMs`'s source is corrected: sub-1400 mm/s runs fall back rather than rattle, and the last clause about `_broken` no longer holds.
- **Backglass** (`frame.ts`). `MODE_DISPLAY_NAMES.joust = 'JOUST'`. `buildFieldsText` prints `charge` as `CHARGE X<n>` (the DMD font has no multiplication sign), so the fields line reads `60.0  CHARGE X1`. Joust (310) is above Hurry-up (300), so while both run Joust owns the panel (AD-8), and a Ramp still collects Hurry-up.
- **Goldens.** Only the headers move:
  - `tableHash`;
  - the eight new `gameStart.tuning` keys: `joustChargeMax`, `loopValue`, `joustMs`/`Ticks`, `loopBreakWindowMs`/`Ticks`, `loopDescentWindowMs`/`Ticks`;
  - `loopWindowMs`/`Ticks` (source text only).

  No golden presses Start, and the hash covers only `GameState`: this was confirmed by JSON parse at c98dd0a.
- **Tests.** Every AC has a pinning test with a `mutation:` line (Rule 19), and every negative is paired with its positive. Ticks and values are derived from `resolveTuning()`, never from Joust's own functions. Escapes are used for non-ASCII characters (Rule 14).

**Never:**
- Never touch `TABLE.lamps`, `sim/rules/lamps.ts`, `MODE_LAMP_ROLES` or any insert: the Loop inserts are Story 3.3c's.
- Never touch the paths contended with Epic 5: `src/presentation/mechanisms/**`, `src/presentation/scene/**`, `assets/src/**`, `public/assets/**`, `tools/make-placeholder-blend.py` and `ATTRIBUTIONS.md`. So no new font glyph.
- Never write `score` except through `awardScore`. Never add or remove a `modes[]` entry outside `lifecycle.ts`, and never emit a `CoilCommand` from a mode.
- Never add a `GameState` or `machine` field, and never change `ModeView`, `contracts/**` or `sim/loop/**`.
- Never let `expectedHash`, `expectedGameStateHash`, `transitions` or `checkpointTicks` move in any golden. If one does, HALT with an intent gap.
- Never change the Ramp's `_made`/`_broken`/re-entry behaviour. Never build a second ball (Story 3.7).

## I/O & Edge-Case Matrix

The rules rows run headless (`runRulesScript` on a real `createRules()`, with 3.5's helpers). t0 is a capture of `s_lock_1` with `[joust]` lit and credits 0, so Joust starts at t0.

A **Loop orbit** `O_l(t)` is the measured made-Left-Loop timeline: `s_loop_l_in@t`, `s_loop_l_out@t+223`, `s_loop_r_out@t+1759`, `s_loop_r_in@t+2618`, `s_inlane_r@t+3568`. `O_r(t)` is its mirror. Loops are spaced 4000 ticks apart.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Start | capture at t0 | entry at t0: `charge` 1, `timerTicks` T, no `lastLoop`; at t0+1, `timerTicks` T-1 | No error expected |
| Alternate | O_l, O_r, O_l | Charges 1, 2, 3. Awards V, 2V, 3V, each on its `_made` tick. No right `_made` from the first orbit's descent | No error expected |
| Repeat | O_l, O_r, O_r | Charges 1, 2, 1. Awards V, 2V, V | No error expected |
| Cap | 11 alternating orbits | Charges 1..10, then 10. The last two award 10V each. `joust_full_charge{player}` exactly once, on the 10th `_made` tick | No error expected |
| Break (re-entry) | O_l, O_r, then `s_loop_l_in@t`, `s_loop_l_in@t+1372` | `shot_left_loop_broken`@t+1372. `joust_charge_broken{charge: 2}`. Charge 1, no `lastLoop`. The next O_l pays V at Charge 1 | No error expected |
| Break (exit) | `s_loop_l_in@t`, `s_outlane_l@t+1281` (mirror: r, `s_inlane_r`) | `shot_left_loop_broken`@t+1281; `joust_charge_broken{charge: 1}` | No error expected |
| No re-fire | override `joustChargeMax` 3: three alternating orbits, then a break, then three more | exactly one `joust_full_charge`, on the first reach of 3. Control: a second Joust entry, started later in the same game, fires again | No error expected |
| DW-173 | O_l(t), then a compressed second left orbit `l_in@g-40`, `l_out@g-20`, `r_out@g`, `r_in@g+60`, where g = the first orbit's `r_in` + 50 / 300 / 550 | exactly two `shot_left_loop_made`, zero `shot_right_loop_*`. Charges 1, 1; awards V, V. Control: O_l then O_r gives Charge 2 | No error expected |
| Non-entry | plunge descent `l_out, l_in@+582, s_inlane_l`; Ramp return `s_ramp_enter, s_ramp_made, s_loop_r_in@+1893, s_inlane_r` | no Loop events, Charge unchanged. Control: bare `s_loop_r_in, s_outlane_r` gives a right `_broken` | No error expected |
| Windows | `s_loop_l_in` then a second `_in` at +breakTicks / +breakTicks+1; `l_out` then `l_in` at +descentTicks / +descentTicks+1 | broken / nothing, and the late `_in` arms a flight; consumed / armed (a later `s_inlane_l` gives broken) | No error expected |
| Exit clears descent | `s_ramp_made`, then `s_inlane_r` with no `r_in`, then `r_in, r_out` +200 | `shot_right_loop_made` | No error expected |
| Timer | a Loop at t0+T-1; a Loop at t0+T; `joustMs` 0 | the first pays; at t0+T the stop triple fires and the Loop pays nothing; T clamps to 1 | No error expected |
| Ball end / Tilt | a drain while Joust runs; a tilted O_l | the stop triple comes before `ball_ended`, with no award / no award, no Charge change, no events, Joust still active. Control: the untilted O_l | No error expected |
| Spinner / Hot seat | `spinner_spin` in Joust; player 1's Joust | the score delta equals `count x spinnerScore`, the same with no Joust, and the Charge is unchanged / `players[1]` is paid and `players[0]` is untouched | No error expected |
| Hurry-up below | Hurry-up at t0, then Joust at t1, then O_l, then a Ramp | Joust pays V; the Ramp collects v(e) and stops Hurry-up; Joust stays active | No error expected |
| Ball search | 3.2's `stuckState({ held: 2 })` with a real `joust` entry | the Lock stage opens no Mouth while `timerTicks` is published. Control: after Joust's stop, the stage opens it | No error expected |

</intent-contract>

## Code Map

Measured at `c98dd0af1505b6f8258f14dff502a7cc491a89ad` on `DW-1-epic3`.

- `src/sim/rules/devices/shots.ts:47-115` `createShotTracker`:
  - the expiry pass (:61-73) and the edge pass (:75-109);
  - the Ramp keeps the (re)arm-on-first-switch (:92-95) and the expiry `_broken`;
  - add the `fallBack` branch per the Boundaries, and rewrite the header (the DW-133 prose) to describe it.
- `src/sim/rules/devices/events.ts:170-190` (the `ShotBrokenEvent` doc) and `devices/index.ts:88-95,280`: comments only.
- `src/sim/table/dragonwar.ts`:
  - :630-634 `modeWiring`: add `joustLoops`;
  - :646-690 `shots` and their doc: add `fallBack`, keep `entryExclusive`, and state the measured signature.
- `src/sim/table/tuning.ts`:
  - :320-324 `loopWindowMs`: correct its source;
  - after :414 (`hurryUpUrgentMs`): add the five entries;
  - `shotWindowTicks` is at :1098.
- `src/sim/rules/modes/joust.ts`: the shell. Fill it: `createJoustMode(tuning)`, with `onStart`, `tick` and `onEvent`, and no `lamps` and no stop hooks. Follow `hurry-up.ts` for the entry-update pattern (`state.modes.map`) and the `scoringOpen`/`awardScore` usage.
- `src/sim/rules/modes/index.ts:93`: pass `tuning` to `createJoustMode`, and re-export the two events (:61). Also re-export them from `src/sim/rules/index.ts:120`.
- `src/sim/rules/modes/events.ts:64-77`: add the two events to `ModeEvent`.
- `src/sim/rules/modes/index.ts:153-195` `step()`: the tick hooks run before the events, so on tick t0+T Joust stops before any Loop reaches it. The fan-out is event-major. Read-only.
- `src/sim/rules/ball-search.ts:292`: the `timerTicks` guard. Read-only.
- `src/sim/rules/modes/base.ts:259-261`: base spinner scoring (`spinnerScore`). Read-only. `bonusLoopValue` (tuning.ts:793) is the end-of-ball bonus, not `loopValue`.
- `src/presentation/backglass/frame.ts`:
  - :796 `MODE_DISPLAY_NAMES`: add `joust`;
  - :920-935 `buildFieldsText`: format `charge` as `CHARGE X<n>`;
  - :953 `buildScoreRows`: read-only.
- `test/util/reachability.ts:113-120`: the `plunge-weak-345` label is stale. At this tree it crosses the top and descends the Left lane (`Lout@3939 Lin@4523 outL@5500`). Correct the label text only.
- Test helpers:
  - `test/rules-hurry-up.test.ts:31-165`: `gameState`, `capture`, `ramp`, `press`, `entryAt`, `scoreAt`, `modeEventsAt`;
  - `test/rules-lock-arbiter.test.ts:470` `stuckState`, `:483` `slotTick`;
  - `test/rules-hurry-up-integration.test.ts`: the DMD fold and read-back;
  - `test/backglass-hurry-up.test.ts`;
  - `test/shot-routing.test.ts:248` `driveShot` and `:425` `driveCase` (copy them; never import a `.test.ts`);
  - `test/util/shot-cases.ts` `shotCase(id)`;
  - `test/util/reachability.ts` `witnessPath(id)`, and its witness replay for switch timelines.
- Physics recipes (measured; teleported launches at y = 415, z = 13.5, dirDeg 0; ticks after launch):
  - made: `left-loop-orbit-31`, `right-loop-orbit-31`, and L x=31 at 1800 mm/s (`Lin@5 Lout@308 Rout@2349 Rin@2932 inR@3575`);
  - fall-back:
    - L x=31 at 800 (`Lin@12 Lin@1384 outL@2188`);
    - R x=437.4 at 450 (`Rin@24 Rin@570 outR@1572`);
    - L x=31 at 300 (`Lin@44 outL@1325`);
    - `left-loop-1200` (`Lin@8 Lout@625 Lout@1394 Lin@2175`);
  - non-entry:
    - `plunge-full` (`Lout@2813 Lin@3395 inL@4035`);
    - `plunge-medium-285` (`Rout@2538 Rin@3214`);
    - `ramp-return-geometry` (`rMade@150 Rin@1291 inR@2237`).
- Pins that may change by design:
  - `test/rules-devices.test.ts:243`: the bare `s_loop_r_in, s_outlane_r, s_drain` script now gives `shot_right_loop_broken`. Rewrite it as the Non-entry row plus its control. The measurement found no real trajectory that reaches `s_loop_r_in` from the field.
  - `test/table.test.ts:311` (the `entryExclusive` pin): extend it.
  - `test/tuning.test.ts:29` `scalarKeys`: +5.
  - Any DSL script that closes `s_ramp_made` and then scripts a right Loop within `loopDescentTicks` with no `s_loop_r_in`/exit in between. Grep for these and re-space them.

  Diagnose every other red test; never loosen one.

## Tasks & Acceptance

**Execution:**
1. `src/sim/table/tuning.ts` and `src/sim/table/dragonwar.ts`: add the five tunables, correct `loopWindowMs`'s source, and add `fallBack` and `modeWiring.joustLoops`.
2. `src/sim/rules/devices/shots.ts` (plus the comments in `events.ts` and `devices/index.ts`): add the fall-back signature.
3. `src/sim/rules/modes/events.ts`, `modes/index.ts`, `rules/index.ts` and `modes/joust.ts`: add the Joust rules and the two events.
4. `src/presentation/backglass/frame.ts`: add `JOUST` and `CHARGE X<n>`.
5. `test/rules-devices.test.ts` (the DW-133 block rewritten; new describe blocks): add the tracker rows (Break, Windows, Non-entry, Exit clears descent, DW-173 at the device level).
6. `test/loop-fall-back-physics.test.ts` (new; createMachine() and the real tracker): AC 3.
7. `test/rules-joust.test.ts` (new, headless, added to `ENTRY_FILES`): the Joust Matrix rows. `test/rules-joust-integration.test.ts` (new): AC 10.
8. `test/backglass-joust.test.ts` (new): AC 9. Then `test/tuning.test.ts` and `test/table.test.ts`: AC 1. Then `test/util/reachability.ts`: the label.
9. Finish:
   - refresh the golden headers only;
   - update the by-design pins;
   - record one `mutation:` line per AC in `## Verification`.

**Acceptance Criteria:**
- **AC1.** Given `TUNING`, `resolveTuning()` and `TABLE`, when the tuning and table tests run, then:
  - the five keys are `unverified`, with the values above, and `joustChargeMax` quotes FR-36 verbatim;
  - `joustTicks` is 60000, `loopBreakWindowTicks` is 3000 and `loopDescentWindowTicks` is 2500;
  - both Loops declare `fallBack` with the `descents`/`exits` above, and the Ramp has none;
  - `modeWiring.joustLoops` names two declared shots.
- **AC2** (rows Break, Windows, Non-entry, Exit clears descent). Given scripted switch edges, when the tracker runs, then Loop `_broken` fires exactly per the fall-back signature, never on expiry, and the Ramp's rows are unchanged (`rules-devices.test.ts:161-225` green, untouched).
- **AC3** (DW-288 on real physics). Given the recipes, when real `createMachine()` switch edges feed a real `createShotTracker`, then:
  - each made recipe gives exactly one own `_made`, and no `_broken` and no opposite-Loop event;
  - each fall-back gives exactly one own `_broken` (at the second `_in` or the exit), and no `_made`;
  - each non-entry recipe gives no Loop event.
- **AC4** (DW-173; row DW-173). Given two same-side orbits whose second far-lane `_out` lands within `loopWindowTicks` of the first orbit's far-lane `_in`, when both complete, then no opposite `_made` fires, and Joust treats the second Loop as a repeat. Design Notes record that a single real ball cannot reach the pre-fix gap: G >= 2206 ticks against 600.
- **AC5** (rows Start, Alternate, Repeat, Cap). Given Joust started (priority 310), when Loops are made, then the Charge, `lastLoop` and awards follow the Boundaries, and the first Loop opens the chain at Charge 1.
- **AC6** (rows Break). Given Joust at Charge c, when a Loop `_broken` arrives, then `joust_charge_broken { player, shot, charge: c }` fires, the Charge is 1 and `lastLoop` is absent.
- **AC7** (rows Cap, No re-fire). Given Joust running, when a made Loop takes the Charge to M, then `joust_full_charge { player }` fires, and at most once per Joust entry.
- **AC8** (rows Timer, Ball end, Spinner). Given Joust running, when `joustMs` elapses or the ball ends, then Joust stops through the lifecycle with no award; when `spinner_spin` arrives, then the score changes exactly as it does with no Joust.
- **AC9** (rows Tilt, Hot seat, Hurry-up below, plus the Backglass). Given Joust running under Tilt, for player 1, or above a running Hurry-up, when a Loop (or a Ramp) is made, then the outcome is exactly the Matrix row's. Given a snapshot with a Joust entry, when `renderFrame` draws the score screen, then:
  - the status line is `JOUST` / `BALL 1`, and the fields line is `60.0  CHARGE X1`, then `CHARGE X3`;
  - with Hurry-up also running, `JOUST` owns the panel;
  - with the entry gone, there is no fields line.
- **AC10** (Integration, Rules 1/2). Given a real `createRules()` in `runRulesScript`, from Attract with a real Start: three Ramps light [hurryup, quickmb, joust], and a capture opens the window, where one left-flipper press moves the selection back (wrapping) to `JOUST` and Start confirms. When O_l and then O_r are made, then:
  - the score rises by exactly V and then 2V;
  - the DMD, folded and rasterised, reads `JOUST` and `CHARGE X2`.

  Also, the switch timelines recorded from AC 3's physics recipes, L x=31 at 2200 and at 800, replayed through `createRules()` with Joust running, pay V and then emit `joust_charge_broken`.
- **AC11** (row Ball search). Given the Lock holding balls and a real Joust entry, when a ball-search pass reaches its Lock stage, then it requests no Mouth eject while Joust publishes `timerTicks`, and it opens the Mouth once Joust has stopped.
- **AC12.** Given the story, when the gates run, then every gate passes, and the goldens differ only in `tableHash`, the eight new tuning keys and `loopWindowMs`/`Ticks`'s source.

## Spec Change Log

- 2026-09-30, lead spec gate: AD-19 amended with the fall-back signature (Rule 20). The first `deferred:` item (no flipper shot makes a Loop) was ledgered now as a decision-pending HIGH and raised to the orchestrator, because it is cross-epic geometry; it does not block this story's criteria, which are built and tested on switch events and teleported physics. No spec text changed.

## Review Triage Log

## Design Notes

**Governing ADs:**
- AD-19: the tracker stays the only switch consumer, and the fall-back is declared data with tick windows in `TABLE.shots`.
- AD-8: priority 310, stop only through the lifecycle, the tick hook stops at T, event-major fan-out, no coils, and the top mode owns the panel.
- AD-7: the fields are mode-local.
- AD-9: `ModeView.charge`/`timerTicks`; English only in `frame.ts`.
- AD-3: ms to ticks once, clamped.
- AD-16: `joustLoops` wiring.
- AD-18: the ball-search `timerTicks` guard.
- AD-15: the tunables' provenance.

No AC contradicts an AD's Rule. **Rule 20 candidate (the lead's call):** AD-19 could record that a non-entry-exclusive shot may declare a fall-back signature, and that a Loop's `_broken` means "entered and fell back". This extends the Rule and does not contradict it.

**DW-288: build it (measured, not assumed).** A planning subagent recorded full switch timelines for 638 trajectories: 43 made, 39 failed climbs, 532 non-entry and 24 ambiguous. It then evaluated candidate rules offline.
- **Re-entry alone** is safe, but it catches 2 of 39 failed climbs: most fall-backs take 546-2167 ticks, and slow ones close `_in` only once.
- **Naive expiry** is unusable: it gives 40 false breaks on made Loops and 382 on non-entry trajectories.
- **The Boundaries' signature** (descent suppression with the Ramp as a descent, re-entry or exit break, and a 3000-tick break window) scores:
  - 39/39 failed climbs;
  - 0 false or missed on the made Loops;
  - 0 false breaks on every real non-entry path.

  Its one false break is a teleported drop onto the Ramp return rail, which skips `s_ramp_made` and which no real ball can make. The break arrives late, when the ball has visibly come back. That is the miss.

**DW-173: fixed, and unreachable before the fix by one ball.**
- **The fix.** After a made Loop, the far lane's `_out` has no flight, so it sets a descent, and the trailing `_in` consumes it. Nothing is armed.
- **Why one ball cannot reach it.** Measured over 54 orbits, the lower bound is the descent to the flipper band (701 ticks), plus flipper to lane (126 ticks, geometric, at the maximum speed), plus `_in` to the far `_out` (1379 ticks). So G >= 2206 ticks, 1606 over the 600-tick window.
- **Multiball.** A second ball (3.7/3.8) could reach the gap. That is why the fix matters, and the per-shot state limit is in `deferred`.

**Readings pinned here (the lead asked for them):**
- **First Loop.** With no previous Loop, the first Loop opens the chain at Charge 1 and pays V. The Charge is the length of the current alternating run: L, R, L gives 1, 2, 3. A repeat restarts the run the same way.
- **After a break.** `lastLoop` is cleared, so the next Loop opens a new run.
- **Break at Charge 1.** `joust_charge_broken` fires anyway, as the AC states.
- **Tilt.** A Loop event under Tilt is ignored entirely, as with 3.5's tilted Ramp.
- **The DMD sign.** `CHARGE Xn` uses the letter X. The 5x7 font has no multiplication sign, and adding a glyph would stale `ATTRIBUTIONS.md`'s font row, which is contended with Epic 5. This is a restated observable, not a new intent (Rule 5, apply and report).
- **`loopValue`.** It did not exist; only `bonusLoopValue`, the end-of-ball bonus, did. Only Joust pays it, and base Loops still score nothing.
- **Joust over Hurry-up.** AD-8 gives the panel to 310, and 3.5's review deferred this choice to 3.6. DW-311's LIT-row drop in 2+ player games applies to Joust exactly as to Hurry-up.

**Planning risk (for the lead, before implementation): no flipper shot makes a Loop at this tree** (see `deferred`, high).
- Both measurement subagents found it independently. Every Loop in the corpus is a teleported launch or a plunge coming down from the top.
- This story still builds and pins every AC: the rules run on the event level, and physics runs through teleported launches, the same method as `shot-routing.test.ts`.
- But real input cannot play Joust, collect 3.10's Right-Loop Extra ball, or reach 3.11's full-Charge game until the geometry owner opens a Loop entry. That geometry is `assets/src/**`, which is contended.

**Integration (Rules 1/2).**
- Consumes:
  - 2.4's tracker (extended here);
  - 3.0a's `scoring.ts`;
  - 3.1's stack and lifecycle;
  - 3.4's `startCampaignMode`;
  - 2.13's fields line;
  - 3.2's ball-search guard.
- Consumed-by:
  - **3.10** reads `joust_full_charge` from `RulesStepResult.modeEvents` for the Extra-ball achievement. The first consumer will be Story 3.10.
  - **3.3c** reads `lastLoop`/`charge` for the next-expected Loop insert (step 2).
  - **3.7/3.8** stack above Joust, and inherit the multiball residual.
  - **3.11** needs a full-Charge Joust in the playtest.
  - The first presentation reader of `joust_charge_broken`.
- AC 10 is the real-runtime Integration AC.

**Ledger inbox (Rule 17).** DW-288 is addressed: `_broken` is built (AC 2, AC 3). DW-173 is addressed: fixed and pinned (AC 4). Nothing is declined.

**Footprint.**
- In the footprint: `src/sim/rules/**`, `src/sim/table/**`, and `test/replays/**` (headers only).
- Extensions to report (uncontended): `src/presentation/backglass/frame.ts`, and under `test/**` the new files, the pins, and the `reachability.ts` label.
- No `contracts/**`, `loop/**` or contended path.

**Browser smoke (lead).**
- **What cannot be reached.** Real input cannot make a Loop (measured). Reaching Joust by hand also needs three tick-exact Ramps and a capture.
- **The most forgiving real input that exercises the new code** is a full plunge (`Lout, Lin, s_inlane_l`) or a medium plunge (`Rout, Rin, s_inlane_r`) on a game in progress. Record the session, replay it through `createLoop()`, and assert:
  - zero `shot_*_loop_broken` and zero Loop `_made` from the plunge descent (the descent rule on real input);
  - play otherwise unchanged.
- **The Joust DMD** (`JOUST`, `60.0  CHARGE X1` decaying) is observable via the in-page sampler only if the lead reaches a Joust start. AC 9 and AC 10 pin it headless on the rasterised dots.

## Verification

**Commands** (first run `export BLENDER=C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe`; the baseline is 155 files / 2500 tests):
- `pnpm test` -- expected: all green, with 5 more files.
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions && pnpm build && pnpm check:dist && pnpm check:size` -- expected: each exits 0.
- JSON-parse each `test/replays/*.golden.json` against `HEAD` -- expected: only `header.tableHash` and the tuning keys named in AC 12 differ. Any movement in `expectedHash`, `expectedGameStateHash`, `transitions` or `checkpointTicks` means HALT with an intent gap.

**Mutations** (Rule 19). They are planned here; the implement stage applies each one, observes red, reverts, and records it as `mutation: <change> → <red test>`:
- AC1: change `loopBreakWindowMs` confidence to `'low'`; the tuning pin goes red. Drop the Ramp from the `descents` of `shot_right_loop`; the table pin goes red.
- AC2: emit `_broken` on Loop expiry; Windows goes red. Drop the descent consumption; Non-entry goes red. Drop the exit break; Break (exit) goes red. Make exits not clear the descent; Exit clears descent goes red.
- AC3: remove the second-`_in` break; the L-800 and R-450 physics rows go red.
- AC4: arm on `_in` even while a descent is pending; the DW-173 row goes red (a spurious right `_made`).
- AC5: treat the first Loop as "differs" (Charge 2); Alternate goes red. Drop the cap; Cap goes red.
- AC6: keep `lastLoop` after a break; the post-break Loop's Charge goes red.
- AC7: drop the `fullCharge` flag; No re-fire goes red.
- AC8: skip the tick-hook stop; Timer goes red. Award V to the spinner in Joust; Spinner goes red.
- AC9: drop the `scoringOpen` guard; Tilt goes red. Remove `MODE_DISPLAY_NAMES.joust`; the Backglass status row goes red. Print a bare `charge`; the `CHARGE X` row goes red.
- AC10: award `V * (charge - 1)`; the integration score delta goes red.
- AC11: never publish `timerTicks`; the Ball search row goes red.
- AC12: change one golden header's `joustMs`; `replay-goldens.test.ts` goes red.

## Auto Run Result

Status: ready-for-dev
Blocking condition: none

**Planning run (2026-09-30, `bmad-build-auto`, halt after planning).**
- **Where it ran.** Planned at `c98dd0af1505b6f8258f14dff502a7cc491a89ad` on `DW-1-epic3`. The worktree was verified as `C:/git/dragonwar/.worktrees/epic-3`, and the tree was clean on entry.
- **Context.** It reused the committed `epic-3-context.md` (valid, and newer than every planning artifact) without recompiling it. Continuity came from Story 3.5's `done` spec.
- **Measurements.** Two synchronous measurement subagents ran on real physics, using `createMachine()` and the real tracker. They wrote only to the scratchpad, and the tree was left clean.
  - They recorded switch timelines for 638 trajectories and evaluated the candidate break rules offline (DW-288).
  - They measured the inter-orbit re-shot gap (DW-173).
- **DW-288: built, not amended.** A declared fall-back signature scores 39/39 failed climbs, with 0 false breaks on made Loops and on real non-entry paths.
- **DW-173: fixed** by the descent rule and pinned. Before the fix, a single real ball could not reach it: G >= 2206 ticks against 600.
- **Checked against READY FOR DEVELOPMENT.**
  - Every task names its files, and the tasks are in dependency order.
  - Every AC is Given/When/Then, with a planned mutation.
  - There are no TBDs.
  - No NFR or AD is contradicted, so there is no intent gap.
- **For the lead, before dispatching implement: no real flipper shot makes either Loop at this tree** (frontmatter `deferred`, high, out-of-footprint geometry). The story's ACs are still fully buildable and testable at the event level and through teleported physics. But Joust, 3.10's Right-Loop collect and 3.11's full-Charge Joust cannot be played by real input until a Loop entry is opened.
- **Readings applied** (Rule 5, apply and report; Design Notes):
  - the first Loop opens the chain at Charge 1;
  - the DMD shows `CHARGE X<n>` with the letter X, since a new glyph would touch `ATTRIBUTIONS.md`, which is contended;
  - Joust owns the panel over Hurry-up (AD-8).
- **What was written.** No files other than this spec. No commit and no push.
