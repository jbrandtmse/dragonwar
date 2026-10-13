---
title: 'Story 3.6: Joust -- the charge'
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_revision: '9c7d9187be1a533afaa939e7cb2a5f6258723821'
review_loop_iteration: 0
followup_review_recommended: true
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
  - summary: >-
      A made Ramp whose return to s_loop_r_in takes longer than loopDescentWindowMs arms the Right Loop and breaks it at the inlane, so a running Joust loses its Charge on a made Ramp; the window was sized from a sample whose slowest return (1893 ticks) is not this tree's slowest
    evidence: |-
      Measured 2026-10-13 at 9c7d918 plus this story (review; a real createMachine() feeding the real createShotTracker(); teleported launches straight up the Ramp mouth from y = 470). From (312.6, 470) at 1557 mm/s the ball closes s_ramp_made@286, s_loop_r_in@3090 (2804 ticks later) and s_inlane_r@4043, and the tracker emits shot_ramp_made, then shot_right_loop_broken@4043. Returns inside the window but past the documented range are ordinary between 1500 and 1600 mm/s: 1917 to 2456 ticks (2165 from the manifest's own point (315, 470) at 1580 mm/s; the documented slowest, 1893, is that point at 1600 mm/s exactly). At 1558 mm/s the ball does not return at all, it rolls back out of the Ramp, so the return time has no upper bound near the make threshold and no finite window covers every return.
      The sources of loopDescentWindowMs ("1070 to 1893 ticks", "607 ticks (32%) above the slowest of them") and loopBreakWindowMs ("546 to 2167 ticks"; the review measured 2187 at 1210 mm/s) record the planning sample. They are pinned only as substrings of that prose (test/tuning.test.ts), and the 638-timeline measurement is not in the tree. Correcting a source re-records all five golden headers (AD-15). AD-19's 2026-09-30 amendment carries the same sample claim ("no false break on a made Loop or a non-entry path").
      By real input this changes no state at this tree: no real shot makes a Loop (first item), so the Charge is 1 and the only effect is a joust_charge_broken{charge: 1}, which nothing reads yet. It becomes a lost Charge when a Loop can be made.
    location: >-
      src/sim/table/tuning.ts loopDescentWindowMs and loopBreakWindowMs; src/sim/rules/devices/shots.ts (the descent expiry); src/sim/table/dragonwar.ts shot_right_loop.fallBack
    severity: medium
    footprint: in-story
  - summary: >-
      A ball coming down a Loop lane that closes the entry switch twice arms the Loop on the second closure and breaks it at the inlane or outlane, because the first closure clears the descent mark
    evidence: |-
      Measured 2026-10-13 (review, same instruments). Balls released in the left lane above s_loop_l_out, at (39 to 41, 950) moving straight down at 900 to 1200 mm/s, close s_loop_l_out, s_loop_l_in, s_loop_l_in again 152 to 238 ticks later (a rebound), then the inlane or outlane; the tracker emits shot_left_loop_broken on that exit in 10 of 12 runs. These are teleported releases, and faster (377 to 457 ticks from the far switch to the entry) than any descent in the planning sample (564 to 1196). No real path shows a double closure: the planning sample's 532 non-entry paths, the three real plunges and a real autolaunch do not.
      The rule is the spec's as written ("Own _in with a pending descent: clear the descent ... Own _in otherwise: arm a flight"), and test/rules-devices.test.ts now pins it ("the entry closure consumes the descent mark"). Same bound on harm as the previous item.
    location: >-
      src/sim/rules/devices/shots.ts, the entry-switch rules of applyFallBackEdge()
    severity: medium
    footprint: in-story
  - summary: >-
      A descent mark that nothing consumes swallows the next real entry on that side for loopDescentWindowMs; a ball that rolls back out of the Ramp after closing s_ramp_made, or crosses a far switch without coming down the lane, leaves one
    evidence: |-
      By the entry-switch rule, an entry closure with a mark pending clears the mark and arms nothing, so a Loop entered inside 2500 ticks of a stray mark is never made, and Joust pays nothing for it, with no event. The lost Loop's own far-switch closure then lays a fresh mark.
      Measured 2026-10-13 (review, same instruments): from the manifest's Ramp point (315, 470), launches at 1650 to 2050 mm/s close s_ramp_enter, s_ramp_made, s_ramp_made again, then s_ramp_enter on the way back out, which leaves the Right Loop's mark pending (the Ramp still reads as made; that rule is Story 2.4's). The manifest's descend-loop-top-east closes s_loop_r_out and no s_loop_r_in.
      Not reachable in harm until a real shot can enter a Loop (first item).
    location: >-
      src/sim/rules/devices/shots.ts, the descents and entry-switch rules; src/sim/table/dragonwar.ts shot_right_loop.fallBack.descents
    severity: medium
    footprint: in-story
  - summary: >-
      A ball that passes a Loop's far switch inside loopWindowMs and then falls back down the same lane is credited as a made Loop on every off-centre launch tried, not only below 1400 mm/s as the third item says, and Joust now pays loopValue x Charge and builds the Charge on it
    evidence: |-
      Measured 2026-10-13 (review, same instruments; teleported launches straight up from y = 415). At x = 38, 42, 45 and 48 (the left entry column's centre is 31) at 1800, 2200 and 3000 mm/s, 12 of 12 close s_loop_l_in and s_loop_l_out inside the window (shot_left_loop_made), then s_loop_l_out and s_loop_l_in again on the way down and the left inlane, with no _broken; the manifest's own loop-off-column-left-east-45 is one of them. The centre at 1220, 1300 and 1350 mm/s, and the right centre at 1300, do the same and leave by the outlane.
      The made rule is Story 2.4's and this story leaves it unchanged, as the third item records for the sub-1400 case; this widens that item. No test pins either reading. Not reachable by real input until a real shot can enter a Loop (first item).
    location: >-
      src/sim/rules/devices/shots.ts, the made rule of applyFallBackEdge(); src/sim/table/tuning.ts loopWindowMs
    severity: medium
    footprint: in-story
  - summary: >-
      The fall-back signature reads an entry-switch closure that did not come from above, followed by that side's inlane or outlane, as a broken Loop; that is safe only while no field ball can reach an entry switch, which is the condition Story 3.3d is chartered to end
    evidence: |-
      Not verified, because no geometry exists to verify it on. At this tree the lane mouths are walled from the field (first item), and the planning measurement found no real trajectory that reaches an entry switch from the open field. If an opened mouth sits above s_loop_*_in, an ordinary inlane or outlane feed that crosses it will emit shot_<loop>_broken, and a running Joust will lose its Charge on it. The DW-133 row this story inverted (a bare s_loop_r_in then s_outlane_r is now a break) rests on the walled geometry.
      What would settle it: once the entries are open, run field-origin witnesses (inlane and outlane feeds, slingshot rebounds) through the real tracker and assert that they produce no Loop event. No such test exists.
    location: >-
      src/sim/table/dragonwar.ts shots.*.fallBack; assets/src/** (the opened mouths, Story 3.3d)
    severity: medium (unverified)
    footprint: in-epic
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
- 2026-10-13, clarification answered by the author (re-dispatched lead): DW-319 is routed to the new Story 3.3d "Open the Loop entries", a geometry story built after Epic 5 merges. This story is built now exactly as validated; none of its criteria depends on the answer. The first `deferred:` item above IS DW-319 (already ledgered, owner `3-3d-open-the-loop-entries`) and is not re-filed at harvest. Do not open a Loop entry here: the generator and `public/assets/**` are contended until the merge. No spec text changed.

## Review Triage Log

### 2026-10-13 — Review pass

Four layers ran in parallel on the diff since `9c7d918`. The stage verified each claim itself before grading it: the physics claims by its own probes on a real `createMachine()` and the real `createShotTracker()` (scratch files outside the repository), the rest by reading the code and the tests. BH = Blind Hunter, EC = Edge Case Hunter, VG = Verification Gap, IA = Intent Alignment. "Deferred item 4..8" are the items this pass appended to the frontmatter `deferred:` list.

- verdicts: 46 findings — high 1, medium 13, low 22, false 9, maybe-false 1
- findings:
  - `[medium]` `[defer]` BH1: a ball that passes a Loop's far switch inside the window and then falls back is paid as a made Loop — confirmed: 12 of 12 teleported launches 7 to 17 mm off the left column's centre at 1800 to 3000 mm/s, and the centre at 1220 to 1350 mm/s, give `_made` and no `_broken`. The made rule is Story 2.4's and the contract keeps it "(unchanged)", so it predates this story; it is wider than plan-time item 3 says. Deferred item 7.
  - `[low]` `[patch]` BH2: the `TABLE.shots` comment reads "39 of the 39 failed climbs" and "no false break" as if they covered every path — true of the planning sample only. Patched: the comment now says what those figures do and do not cover, and names the three measured exceptions.
  - `[medium]` `[defer]` BH3: the ranges that size the two new windows are not this tree's extremes — confirmed for the Ramp: returns of 1917 to 2456 ticks between 1500 and 1600 mm/s against the quoted 1070 to 1893 (the 1893 is the 1600 mm/s sample exactly). Same root cause as EC1. Deferred item 4.
  - `[low]` `[defer]` BH4: the window figures are pinned only as substrings of the `source` prose, the 638-timeline harness is not in the tree, and `joustMs`'s "at least about 2.9 s" is the 2200 mm/s cycle — confirmed by reading `test/tuning.test.ts`. Same root cause as EC1 (a sample recorded as a range, with no in-tree instrument). Deferred item 4.
  - `[low]` `[patch]` BH5: a comment in `test/rules-devices.test.ts` said eight figures were re-measured by the physics file, which pinned four — confirmed. Patched: the physics file now pins 1372, 1281, 582, 640 and 946 by equality (all hold at this tree), and the comment says 1893 is the planning sample's and is not re-driven.
  - `[low]` `[reject]` BH6: nothing rejects `loopBreakWindowMs` below `loopWindowMs`, and the `fallBack` window keys accept any `...Ms` tunable — true by reading `shots.ts`, but only a mis-tuned dev panel reaches it (the defaults are 3000 against 600), and the fix is a new cross-tunable guard the contract does not state.
  - `[low]` `[reject]` BH7: `joustChargeMax` is read unclamped (0, 1, 2.5) — true, but only a mis-tuned cap reaches it; the contract clamps T and takes M as given, and the fix is a clamp it does not state.
  - `[low]` `[reject]` BH8: one failed attempt can emit two `_broken` (break, re-arm on a third entry closure, break on the exit) — true, and it is rules (d), (f) and (g) as written: an entry closure with nothing pending is a new attempt. Every measured fall-back closes the entry twice at most and emits one break; in Joust the second break carries Charge 1 and changes nothing. A fix adds state.
  - `[medium]` `[defer]` BH9: a descent mark that nothing consumes swallows the next real entry — confirmed by rule (e), and the manifest's `descend-loop-top-east` closes `s_loop_r_out` with no `s_loop_r_in`. Needs a real Loop entry to matter (DW-319). Deferred item 6.
  - `[low]` `[patch]` BH10: the Story 2.4 paragraph and the new one describe the same sequence differently, `entryExclusive` is not read for the Loops, and the "neither" branch has no shot — confirmed. Patched: the `TABLE.shots` comment says a `fallBack` shot never reads the flag, and the `shots.ts` header says no declared shot takes that branch and no test exercises it. The branch stays (the spec keeps `entryExclusive`; testing it needs an injection seam).
  - `[maybe-false]` `[defer]` BH11: the signature is safe only while no field ball reaches an entry switch, and nothing pins that — cannot be checked at this tree, where the mouths are walled (DW-319). If true it is medium. What would settle it: field-origin witnesses through the tracker once Story 3.3d has opened the entries. Deferred item 8.
  - `[low]` `[patch]` BH12: Joust reads `<loop>_broken` as "fell back" with nothing tying its Loops to a `fallBack` declaration — confirmed. Patched: `test/table.test.ts` pins that every `joustLoops` shot declares one, with the Ramp as the control (mutation recorded).
  - `[low]` `[patch]` BH13: rows missing for the Slam and Attract stop, a ball-saved drain, the serves that precede a Joust Loop, and `plunge-weak-345` — Patched: a Slam row (the Attract entry with Joust live) and a `plunge-weak-345` real-plunge row with its control. Not added: a ball save is no ball end and Joust reads nothing of it; and the stage's probe shows a real autolaunch descends the left lane as `s_loop_l_out`, `s_loop_l_in`, `s_inlane_l` with no Loop event, and a real Mouth eject closes no shot switch.
  - `[low]` `[patch]` BH14: the measured orbit is copied by hand into three test files and the right orbit is its mirror, not a measurement — true. Patched: the one physics pin now names the three copies. The mirror is the contract's own definition of O_r; no shared constant was added, since the headless ratchet limits what `rules-joust.test.ts` may import.
  - `[low]` `[patch]` BH15: the corrected `plunge-weak-345` label was unpinned, and sibling prose is stale — the label is now pinned by the new physics row. The harness header and the 285 label are older than this story and are left as they are.
  - `[low]` `[patch]` BH16: a Backglass test title promised a hand-back it does not perform — confirmed. Patched: retitled to what it renders.
  - `[medium]` `[defer]` EC1: a made Ramp whose return is slower than `loopDescentWindowMs` breaks the Right Loop — confirmed: from (312.6, 470) at 1557 mm/s the return takes 2804 ticks and the tracker emits `shot_ramp_made`, then `shot_right_loop_broken` at the inlane. The window and its rule are the contract's, and the dispatch fixes the signature as validated; by real input the Charge is 1 at this tree (DW-319), so the break changes no state. Deferred item 4.
  - `[medium]` `[defer]` EC2: a ball that rolls back out of the Ramp after `s_ramp_made` leaves the Right Loop's mark pending — confirmed: launches at 1650 to 2050 mm/s from the manifest's Ramp point do exactly that. Same root cause as BH9. Deferred item 6.
  - `[medium]` `[defer]` EC3: a descending ball that closes the entry switch twice arms on the second closure and breaks at the exit — confirmed on 10 of 12 teleported descents at x 39 to 41, 900 to 1200 mm/s; not seen on any real path. It is rule (e) as the contract states it. Deferred item 5.
  - `[low]` `[reject]` EC4: `loopBreakWindowMs` below `loopWindowMs` — same finding as BH6, same reason.
  - `[low]` `[reject]` EC5: `joustChargeMax` at 0, negative or fractional — same finding as BH7, same reason.
  - `[medium]` `[defer]` EC6: the Approach's "a descent from above ... never arms" does not hold outside the window or after the first entry closure — confirmed by EC1 and EC3, whose items carry it. Deferred items 4 and 5.
  - `[medium]` `[patch]` VG1: no row observed the clearing half of rules (e) and (g). Patched: two rows in `test/rules-devices.test.ts`; each mutation turns exactly its row red.
  - `[medium]` `[patch]` VG2: Joust's award was never run at a `loopValue` other than the default. Patched: a row at `loopValue` 7; reading the module default turns it, and only it, red.
  - `[medium]` `[patch]` VG3: the Ball search row's "no `c_mouth`" could not fail, because the run ended 490 ticks before a Lock-stage open would pulse. Patched: both runs last past the Mouth lead and the control asserts the pulse; a probe shows `[]` at the old length and `[17600]` at the new one under the AC11 mutation. The same shape in `test/rules-lock-arbiter.test.ts` is Story 3.2's and is not touched.
  - `[medium]` `[patch]` VG4: `joust_full_charge.player` was only ever asserted as 0. Patched: player 1 reaches the cap; a hard-coded 0 turns the row, and only it, red.
  - `[false]` `[reject]` VG5: the Tilt row's score assertion cannot fail from removing Joust's own guard — it is not that guard's pin. It fails if `awardScore()`'s gate goes; the guard is pinned by the Charge and event assertions of the same row, as AC9's recorded mutation shows.
  - `[low]` `[patch]` VG6: every AC has a `mutation:` line, but some clauses had none of their own. Closed in-pass where the review added or changed a row: AC1 (`joustLoops`), AC2 (the two clears), AC5 (`loopValue`), AC7 (`player`), AC8 (a stop-time award: Ball end and the Slam), AC11 (re-run), AC12 (the comparison itself watched red). The other clauses rest on their AC's existing line, which is Rule 19's bar.
  - `[low]` `[patch]` VG7: `entryExclusive` is inert for the Loops and one branch has no test host — same finding as BH10, same patch.
  - `[low]` `[patch]` VG8: the re-measurement comment overclaims — same finding as BH5, same patch.
  - `[low]` `[reject]` VG9: the physics file hard-codes the plunge holds — true, but `WITNESSES` is not exported from `test/util/reachability.ts`, so reading them needs a new export from a shared helper; the file names each witness and its hold beside the number.
  - `[medium]` `[defer]` VG10: `left-loop-1200` breaks only because its far switch closes 17 ticks past the window, and the false make just inside it is pinned nowhere — same finding as BH1. Deferred item 7.
  - `[high]` `[defer]` IA1: every made Loop and fall-back is scripted, teleported or replayed; no real shot enters a Loop — true, and it is the first `deferred:` item already (DW-319, routed to Story 3.3d by the author on 2026-10-13). Not filed again.
  - `[low]` `[reject]` IA2: physics, rules and presentation are never run composed — AC 10 asks for recorded-then-replayed timelines and a folded, rasterised DMD, which is what the diff does; a `createLoop()` run cannot reach a Joust Loop by real input (DW-319), and the browser smoke is the lead's.
  - `[false]` `[reject]` IA3: the Windows and Exit-clears-descent rows run at the devices layer, not under Joust — AC 2 and task 5 put them there, and their expected outputs are tracker observables. The Joust rows assert the Charge and the pay on the `createRules()` run.
  - `[false]` `[reject]` IA4: the `mutation:` lines are in the spec, not beside the tests — Rule 19 records them in this file's `## Verification`.
  - `[false]` `[reject]` IA5: a repeat emits no `joust_charge_broken` — the Boundaries put that event only under `<loop>_broken`, and the Repeat row names Charges and awards, no event. Noted for the lead: a Charge lost to a repeat is visible only in state.
  - `[false]` `[reject]` IA6: no intra-tick order is asserted between the stop triple and `ball_ended` — the two travel on separate channels of one step, so no order between them is observable here; the row asserts what "before" means in effect (same tick, the entry gone, the score change equal to `ball_ended.total`), and a stop-time award turns it red.
  - `[false]` `[reject]` IA7: the Ball search row injects its Joust entry, and `joust.ts` tolerates an entry with no `startTick` or Charge — the row is built as 3.2's and 3.5's are and leaves the timer to the real tick hook; the guard is `hurry-up.ts`'s, needed to read the open `ActiveModeState` record.
  - `[false]` `[reject]` IA8: the No re-fire row overrides more than `joustChargeMax` — a second Joust entry in one game needs the first to end and Joust to be lit again; the expectation is unchanged.
  - `[low]` `[patch]` IA9: only the orbit figures were re-measured by equality — same finding as BH5, same patch.
  - `[medium]` `[defer]` IA10: the `loopWindowMs` source admits a false make that no test covers — same finding as BH1. Deferred item 7.
  - `[low]` `[reject]` IA11: the Backglass test hand-types priority 310 and its timers — fixture literals, as in `test/backglass-hurry-up.test.ts`; `test/rules-joust.test.ts` pins `MODE_PRIORITIES.joust` at 310, above Hurry-up. The 946 and 640 it mentions are now pinned to the machine (BH5).
  - `[low]` `[patch]` IA12: three Boundaries clauses were carried by code shape alone — same finding as BH13 for the Slam and Attract entry, same patch. The other two have no row: no mode above 310 does anything yet, and the lifecycle leaves no Joust entry outside a game.
  - `[false]` `[reject]` IA13: the diff changes things the contract does not name — each is named in the Code Map (the label, the pins that change by design) or follows from the `CHARGE X<n>` clause (the `backglass-frame` pin).
  - `[false]` `[reject]` IA14: the spec's `mutation:` lines contain a literal arrow — Rule 14 exempts prose, and Rule 19 prescribes that arrow.

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

**Mutations observed** (implement stage, 2026-10-13). Each was applied to the finished tree, the named test file was run and seen red, and the mutation was reverted to a byte-identical tree: `git status --short`, `git diff`, `git diff --stat` and the four untracked test files hashed equal before the mutation and after the revert, every time.
- mutation: AC1 -- `loopBreakWindowMs`'s confidence `'unverified'` changed to `'low'` (`tuning.ts`) → `test/tuning.test.ts`, "Story 3.6 AC1: joustChargeMax 10, loopValue 25000 ..." red (`loopBreakWindowMs is unverified: expected 'low' to be 'unverified'`); 1 failed of 80.
- mutation: AC1 -- `'s_ramp_made'` dropped from `shot_right_loop.fallBack.descents` (`dragonwar.ts`) → `test/table.test.ts`, "Story 3.6 AC1: both Loops declare fallBack with their descents, exits and two windows; the Ramp declares none" red; 1 failed of 95.
- mutation: AC2 -- the expiry pass emits `_broken` when it drops a lapsed Loop flight (`shots.ts`) → `test/rules-devices.test.ts`, Matrix "Windows" red: "a Loop never emits _broken on expiry" and "at +loopBreakWindowTicks + 1 the attempt has lapsed silently"; 2 failed of 79.
- mutation: AC2 -- rule (e) removed, so an entry closure with a pending descent arms and the descent is never consumed (`shots.ts`) → `test/rules-devices.test.ts`, Matrix "Non-entry" red (the Ramp return, the plunge descent, the measured orbit), with the descent-window row, the Exit-clears-descent control and the DW-173 rows; 9 failed of 79.
- mutation: AC2 -- rule (g) removed, so an `exits` switch no longer breaks an armed Loop (`shots.ts`) → `test/rules-devices.test.ts`, Matrix "Break" red: all four "exit:" rows, with both bare-entry controls, the other-side control, the late-`s_loop_l_out` row and the lapsed-descent row; 9 failed of 79.
- mutation: AC2 -- rule (h) removed, so an `exits` switch no longer clears the descent (`shots.ts`) → `test/rules-devices.test.ts`, Matrix "Exit clears descent" red: "s_ramp_made, then s_inlane_r with no s_loop_r_in, then s_loop_r_in and s_loop_r_out 200 ticks later -> shot_right_loop_made"; 1 failed of 79.
- mutation: AC3 -- rule (d) removed, so a second entry closure with a flight re-arms instead of breaking (`shots.ts`) → `test/loop-fall-back-physics.test.ts` red: "the left entry point at 800 mm/s", "the right entry point at 450 mm/s" and "left-loop-1200" (the break moves from the second entry closure to the outlane); 3 failed of 18.
- mutation: AC4 -- rule (e) also arms a flight, so an entry closure arms even while a descent is pending (`shots.ts`) → `test/rules-joust.test.ts`, Matrix "DW-173" red at all three offsets, and `test/rules-devices.test.ts`'s DW-173 rows with it: four shot events where two are expected, the spurious `shot_right_loop_made` on the second orbit's `s_loop_r_out` among them; 37 failed across the two files.
- mutation: AC5 -- `opens` no longer true for an absent `lastLoop`, so the first Loop "differs" (`joust.ts`) → `test/rules-joust.test.ts`, Matrix "Alternate" red (Charges start at 2; awards 50000, 75000, 100000 against 25000, 50000, 75000); 28 failed of 52.
- mutation: AC5 -- `Math.min(..., chargeMax)` removed (`joust.ts`) → `test/rules-joust.test.ts`, Matrix "Cap" red (the eleventh Charge is 11); 2 failed of 52.
- mutation: AC6 -- `onLoopBroken` keeps `lastLoop` (`joust.ts`) → `test/rules-joust.test.ts`, Matrix "Break (re-entry)" red: "the next O_l opens a new chain: Charge 1, paying V" got Charge 2; 6 failed of 52.
- mutation: AC7 -- `&& entry.fullCharge !== true` removed (`joust.ts`) → `test/rules-joust.test.ts`, Matrix "No re-fire" red (two `joust_full_charge` in the first entry, three in the game), and the Cap row with it; 3 failed of 52.
- mutation: AC8 -- the `e >= T` stop removed from the tick hook (`joust.ts`) → `test/rules-joust.test.ts`, Matrix "Timer" red: no stop triple at t0+T, and none in the `joustMs` 0 row; 5 failed of 52.
- mutation: AC8 -- Joust pays `loopValue` on `spinner_spin` (`joust.ts`) → `test/rules-joust.test.ts`, Matrix "Spinner" red (`expected 25500 to be 500`); 1 failed of 52.
- mutation: AC9 -- the `scoringOpen()` guard removed from `onEvent` (`joust.ts`) → `test/rules-joust.test.ts`, Matrix "Tilt" red (the tilted Loop set `lastLoop`: `[1, 'shot_left_loop']` against `[1, 'absent']`); 1 failed of 52. `awardScore()`'s own gate still withholds the points, so it is the Charge, `lastLoop` and the events this guard protects.
- mutation: AC9 -- `joust: 'JOUST'` removed from `MODE_DISPLAY_NAMES` (`frame.ts`) → `test/backglass-joust.test.ts` red: the status row is gone from every Joust frame; 6 failed of 11.
- mutation: AC9 -- `buildFieldsText` prints `String(mode.charge)` (`frame.ts`) → `test/backglass-joust.test.ts` red: every `CHARGE X<n>` row; 7 failed of 11.
- mutation: AC10 -- the award is `loopValue * (charge - 1)` (`joust.ts`) → `test/rules-joust-integration.test.ts` red: "the score rises by exactly V ..." (`expected +0 to be 25000`), the DMD score row, and both recorded-physics award rows; 4 failed of 11.
- mutation: AC11 -- the tick hook returns the state without republishing `timerTicks` (`joust.ts`) → `test/rules-joust.test.ts`, Matrix "Ball search" red: `show_dragon_mouth_open` at tick 16600 where none is expected; 7 failed of 52. Re-run at review after the row's runs were lengthened (below): the same seven rows red, 7 failed of 56.
- mutation: AC12 -- `header.gameStart.tuning.joustMs.value` 60000 changed to 60001 in `test/replays/full-plunge.golden.json` → `test/replay-goldens.test.ts` red: all six `full-plunge` tests throw `StaleReplayHeaderError`; 6 failed of 52.

**Mutations observed at review** (review pass, 2026-10-13, for the rows the review added or changed). Same discipline: applied to the finished tree, the named file run and seen red, then reverted; the hash of `git diff <baseline>` (which covers the four new test files) and of `git status --short` was equal before each mutation and after its revert.
- mutation: AC1 -- `modeWiring.joustLoops` changed to `['shot_left_loop', 'shot_ramp']` (`dragonwar.ts`) → `test/table.test.ts` red: "Story 3.6 AC1: modeWiring.joustLoops names two declared shots ..." and the new "Story 3.6: every modeWiring.joustLoops shot declares a fallBack signature ..."; 2 failed of 96.
- mutation: AC2 -- rule (g) breaks but no longer clears the flight (`state.flight = null` removed from the `exits` branch, `shots.ts`) → `test/rules-devices.test.ts`, new Matrix "Break" row "the exit break clears the attempt ..." red (a second `_broken` at the re-entry where a `_made` is expected); 1 failed of 81. No other row saw it: every other exit row ends on the exit.
- mutation: AC2 -- rule (e) no longer clears the descent (`state.descent = null` removed, `shots.ts`) → `test/rules-devices.test.ts`, new Matrix "Windows" row "the entry closure consumes the descent mark ..." red (no shot event where a `_made` is expected); 1 failed of 81. No other row saw it.
- mutation: AC5 -- `createJoustMode()` reads the module default `TUNING.loopValue.value` instead of the resolved `tuning.loopValue.value` (`joust.ts`) → `test/rules-joust.test.ts`, new row "the award follows the resolved loopValue ..." red (`expected [ 25000, 50000 ] to deeply equal [ 7, 14 ]`); 1 failed of 56. Every other row stayed green, which is the gap the row closes.
- mutation: AC7 -- `joust_full_charge` carries a hard-coded `player: 0` (`joust.ts`) → `test/rules-joust.test.ts`, new row 'Matrix "Hot seat", at the cap ...' red; 1 failed of 56. Every other row stayed green.
- mutation: AC8 -- Joust gains an `onStopping` hook that adds `loopValue` to its player's score (`joust.ts`) → `test/rules-joust.test.ts` red: Matrix "Timer" (the stop tick), Matrix "Ball end" (the drain tick's score change), and the new Slam row; 3 failed of 56.
- mutation: AC11 -- with the same mutation as above, a scratch probe outside the repository ran the Ball search script at both run lengths: at the old length (17110 ticks) it reads `show_dragon_mouth_open [16600]` and `c_mouth []`, so the row's "no c_mouth" could not fail; at the new length (17610) it reads `c_mouth [17600]`, so it can. Unmutated, both lengths read `[]` and `[]`.
- mutation: AC12 -- the per-field golden comparison (the third command above) was run on a scratch copy of the five goldens with `expectedHash` changed in one, `transitions` shortened and `loopWindowMs.value` changed in another, and `checkpointTicks` and `rampWindowMs.value` changed in a third → `FAIL`, naming each of the five movements. On the real tree it reads `PASS`.

**Results** (implement stage, 2026-10-13):
- `pnpm test`: 159 files passed (159), 2623 tests passed (2623), none failed, none skipped. That is 4 more files than the 155-file baseline, not the 5 expected above: the four new files are `test/loop-fall-back-physics.test.ts`, `test/rules-joust.test.ts`, `test/rules-joust-integration.test.ts` and `test/backglass-joust.test.ts`, which is every new file the tasks name.
- `pnpm typecheck`, `pnpm lint:boundaries`, `pnpm check:headers`, `pnpm check:attributions`, `pnpm build`, `pnpm check:dist`, `pnpm check:size`: each exits 0.
- Goldens, JSON-parsed per field against `HEAD` (all five): `transitions`, `coilPrologue`, `durationTicks`, `expectedHash`, `expectedGameStateHash`, `checkpointTicks` and `expectedCheckpointHashes` are identical. `header.tableHash` moved (`a0340e8c` to `8c29d2e5`). `header.gameStart.tuning` went from 84 to 92 keys: the eight named in AC 12 were added, and `loopWindowMs`/`loopWindowTicks` changed in `source` only. Nothing else in any header moved.
- One pin changed by design that the Code Map does not list: `test/backglass-frame.test.ts`, "an unlabelled mode above the skill shot publishing ONLY charge owns the fields line", expected the bare `'3'`; it now expects `'CHARGE X3'`, which is the format the Boundaries set.

**Results** (review pass, 2026-10-13, run by the stage itself on the patched tree; these are the final figures):
- `pnpm test`: 159 files passed (159), 2632 tests passed (2632), none failed, none skipped. The 9 tests more than the implement stage's 2623 are the review's rows: 4 in `test/rules-joust.test.ts`, 2 in `test/rules-devices.test.ts`, 2 in `test/loop-fall-back-physics.test.ts` and 1 in `test/table.test.ts`.
- `pnpm typecheck`, `pnpm lint:boundaries`, `pnpm check:headers`, `pnpm check:attributions`, `pnpm build`, `pnpm check:dist`, `pnpm check:size`: each exits 0.
- Goldens, JSON-parsed per field against the baseline `9c7d918` (all five): only `header.tableHash`, the eight new tuning keys and the `source` of `loopWindowMs`/`loopWindowTicks` differ. `transitions`, `coilPrologue`, `durationTicks`, `expectedHash`, `expectedGameStateHash`, `checkpointTicks` and `expectedCheckpointHashes` are identical. The review's comment edits in `dragonwar.ts` moved no hash.
- The first command above expects 5 more test files. There are 4, and the tasks name 4; the 5 was a miscount in this section.

## Auto Run Result

Status: done
Blocking condition: none

**Implement and review run (2026-10-13, `bmad-build-auto`, dispatched on this spec at `ready-for-dev`).**

The story is built as validated: every acceptance criterion and every Matrix row has a passing test, and every gate is green. The review's main result is not about the build. It is that the validated fall-back signature misreads some real-physics paths that lie outside the planning sample. Those are recorded as five new `deferred:` items (4 to 8) and are not fixed here. The lead should read "For the lead" below before closing the story.

- **Where it ran.** `C:/git/dragonwar/.worktrees/epic-3` on `DW-1-epic3`, baseline `9c7d9187be1a533afaa939e7cb2a5f6258723821`, tree clean on entry. One implementation subagent, then four review subagents in parallel. None committed or pushed: `HEAD` was still the baseline, and the tree matched the reviewed diff byte for byte, when each returned. The stage applied the review's patches itself.

- **What was built.**
  - **The tracker.** Both Loops declare a `fallBack` signature in `TABLE.shots`, and `createShotTracker()` applies the eight edge rules of the Boundaries, expiry first and silent. A Loop's `_broken` now means "entered and fell back"; a ball coming down a lane from above, or returning from the Ramp, does not arm it. The Ramp's path is the old code moved, unchanged. DW-288 is built and DW-173 is fixed.
  - **Joust.** The shell is filled in: Charge 1 at the start, `min(charge + 1, M)` on an alternating Loop, back to 1 on a repeat or a break, `loopValue x charge` paid through `awardScore()`, a `joustMs` timer on `tick - startTick`, `joust_charge_broken` and `joust_full_charge` (once per entry) on the `ModeEvent` channel, all behind `scoringOpen()`.
  - **Tuning.** Five `unverified` tunables (`joustChargeMax` 10, `loopValue` 25000, `joustMs` 60000, `loopBreakWindowMs` 3000, `loopDescentWindowMs` 2500), and `loopWindowMs`'s source corrected.
  - **Backglass.** `JOUST` on the status line and `CHARGE X<n>` on the fields line; Joust owns the panel over Hurry-up.
  - **Goldens.** Headers only, in all five.

- **Files changed** (27, paths from the worktree root).
  - `src/sim/table/tuning.ts`: the five tunables; `loopWindowMs`'s source.
  - `src/sim/table/dragonwar.ts`: `fallBack` on both Loops, `modeWiring.joustLoops`, the shots comment (with the review's scoping paragraph).
  - `src/sim/rules/devices/shots.ts`: the fall-back signature.
  - `src/sim/rules/devices/events.ts`, `src/sim/rules/devices/index.ts`: comments only.
  - `src/sim/rules/modes/joust.ts`: the Joust rules.
  - `src/sim/rules/modes/events.ts`, `src/sim/rules/modes/index.ts`, `src/sim/rules/index.ts`: the two events, their re-exports, `tuning` passed to `createJoustMode()`.
  - `src/presentation/backglass/frame.ts`: `JOUST` and `CHARGE X<n>`.
  - `test/rules-joust.test.ts` (new, 56 tests): the Joust Matrix rows, headless.
  - `test/rules-joust-integration.test.ts` (new, 11): AC 10, from a real Start to the rasterised DMD, and two recorded physics timelines replayed through the rules.
  - `test/loop-fall-back-physics.test.ts` (new, 20): AC 3 on a real `createMachine()`.
  - `test/backglass-joust.test.ts` (new, 11): AC 9's Backglass rows.
  - `test/rules-devices.test.ts`: the DW-133 block rewritten; the tracker's Break, Windows, Non-entry, Exit-clears-descent and DW-173 rows.
  - `test/tuning.test.ts`, `test/table.test.ts`: AC 1's pins.
  - `test/rules-devices-headless.test.ts`: `rules-joust.test.ts` joins `ENTRY_FILES`.
  - `test/backglass-frame.test.ts`: one pin, `'3'` to `'CHARGE X3'` (the Boundaries' format).
  - `test/util/reachability.ts`: the `plunge-weak-345` label. `test/util/switch-script.ts`: one comment.
  - `test/replays/*.golden.json` (five): headers only.
  - This spec.

- **Review findings: 46 from four layers** (every row is in `## Review Triage Log`): high 1, medium 13, low 22, false 9, maybe-false 1.
  - **Patched: 17 rows, 13 entries (4 medium, 9 low).** All are tests and comments; no production behaviour changed after the review.
    - Medium: rows that observe the clearing half of rules (e) and (g) (VG1); a row at a non-default `loopValue` (VG2); the Ball search row's "no `c_mouth`" made able to fail, with its positive control (VG3); `joust_full_charge` for player 1 (VG4).
    - Low: the shots comment scoped to its sample (BH2); the measured figures pinned by equality and the re-measurement comment corrected (BH5, VG8, IA9); `entryExclusive` and the untested branch described as they are (BH10, VG7); a pin that every `joustLoops` shot declares `fallBack` (BH12); a Slam row and a `plunge-weak-345` row (BH13, IA12, BH15); a note naming the three copies of the orbit figures (BH14); a test retitled (BH16); `mutation:` lines for the rows above (VG6).
  - **Deferred: 12 rows.** Eleven make the five new items; the twelfth (IA1) is the first item, DW-319, and was not filed again.
    - Item 4 (EC1, BH3, BH4, EC6): a made Ramp slower than `loopDescentWindowMs` breaks the Right Loop; the windows were sized from a sample that is not this tree's extreme.
    - Item 5 (EC3, EC6): a descending ball that closes the entry switch twice arms and breaks.
    - Item 6 (BH9, EC2): a descent mark that nothing consumes swallows the next entry.
    - Item 7 (BH1, VG10, IA10): a ball that passes the far switch and falls back is a made Loop, far more widely than item 3 says.
    - Item 8 (BH11): once Story 3.3d opens the entries, a field ball crossing an entry switch may read as a broken Loop. Not verifiable at this tree.
  - **Rejected: 17 rows.**
    - BH6, EC4 (`loopBreakWindowMs` below `loopWindowMs`) and BH7, EC5 (`joustChargeMax` at 0, 1 or a fraction): only a mis-tuned dev panel reaches either, and each fix is a guard the contract does not state.
    - BH8 (two `_broken` from one attempt): the rules as written; no measured fall-back does it, and in Joust the second break changes nothing.
    - VG9 (plunge holds hard-coded in the physics file): reading them needs a new export from a shared helper.
    - IA2 (physics, rules and presentation never composed): AC 10 asks for what the diff does, and no real input can reach a Joust Loop (DW-319).
    - IA11 (hand-typed priority and timers in the Backglass test): fixture literals, as in Story 3.5's file.
    - False, nine rows: VG5 (the Tilt score assertion is `awardScore()`'s pin, not the guard's); IA3 (AC 2 puts the tracker rows at the devices layer); IA4 and IA14 (Rule 19 puts the `mutation:` lines, arrows included, in this file); IA5 (the Boundaries give a repeat no event); IA6 (the stop triple and `ball_ended` travel on separate channels); IA7 (the injected entry and the type guard follow 3.2 and 3.5); IA8 (a second Joust entry needs the extra setup); IA13 (each unnamed change is in the Code Map or follows from a Boundaries clause).

- **Follow-up review recommended: true.** Four medium entries were patched on a first pass (0 high, 4 medium, 9 low). The specific unverified risk: nothing the stage added at triage has been seen by a review layer. Each new pinning row was watched red under its named mutation, so the risk is in what was not mutated: the Slam row and the lengthened Ball search runs rest on lifecycle and search timing the layers did not read (search slots 9 and 10 now fall inside the run), and the paragraph added to the `TABLE.shots` comment restates review measurements in source.

- **Verification performed** (by the stage, on the final tree).
  - `pnpm test`: 159 files, 2632 tests, all passed, none skipped. The baseline was 155 files and 2500 tests.
  - `pnpm typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`: each exits 0.
  - Goldens, parsed per field against the baseline: only `header.tableHash`, the eight new tuning keys and the `source` of `loopWindowMs`/`loopWindowTicks` differ. `expectedHash`, `expectedGameStateHash`, `transitions` and `checkpointTicks` are identical in all five. The comparison itself was watched red on a mutated copy.
  - Matrix Test Audit: all 16 rows have a covering test that ran and passed.
  - Mutations: 20 at implement and 8 at review, each recorded under `## Verification`.
  - No contended path is in the diff; no non-ASCII byte is in any changed source, test or golden file.

- **Residual risks.**
  - The five new deferred items. By real input none of them changes any state at this tree: no real shot makes a Loop (DW-319), so the Charge stays 1, and a false break only emits a `joust_charge_broken{charge: 1}` that nothing reads yet. They become lost Charges, unpaid Loops and unearned awards once a Loop can be made.
  - Every physics input in this story is a teleported launch, a recorded-and-replayed one, or a real plunge or serve. None is a flipper shot.
  - The exact-tick physics pins (223, 1759, 2618, 3568, 1372, 1281, 582, 640, 946, 1141) go red when the collision geometry moves. That is their purpose: it is the signal to re-measure.
  - The per-shot (not per-ball) tracker state and the Loops' untested `entryExclusive` branch stand as recorded (item 2; the `shots.ts` header).

- **For the lead.**
  - **A decision that is yours, not this stage's** (Rule 5, ask-first tier; Rule 20). Items 4 to 6 show the validated signature gives false breaks and swallowed entries on real-physics paths, and item 4's measured Ramp return (2804 ticks) contradicts two things the planning recorded as measured: the `source` of `loopDescentWindowMs`, and AD-19's 2026-09-30 sentence "no false break on a made Loop or a non-entry path". The stage did not halt, for four reasons: every criterion passes as validated; the implementation contradicts no AD Rule; the dispatch says to build the story exactly as validated; and none of the misreads changes state by real input until a Loop entry is open. It also did not touch the three tuning sources or the spine: a source correction re-records all five golden headers (AD-15), and the fix to the rule is a design choice (a longer window only narrows the slow-return band, because the return time has no upper bound near the Ramp's make threshold). Recommended: route items 4 to 8 to Story 3.3d, which moves the lane geometry these figures were measured on, and correct AD-19's sentence and the sources there. If you would rather amend the signature now, the items carry the recipes.
  - **Product note, not a finding.** A Charge lost to a repeated Loop emits no event; only a broken Loop emits `joust_charge_broken`. That is the Boundaries' wording. The first presentation reader of that event will not hear about repeats.
  - **AD-7.** `shots.ts` holds a second closure field, `fallBackStates`: at most one flight and one descent per Loop, both expiring on the clock, reproducible from tick 0. It meets AD-7's bar; the spine's inventory is yours to re-derive.
  - **Footprint extensions** (uncontended, as the Design Notes forecast): `src/presentation/backglass/frame.ts`; under `test/**`, the four new files, `rules-devices.test.ts`, `rules-devices-headless.test.ts`, `tuning.test.ts`, `table.test.ts`, `backglass-frame.test.ts`, `util/reachability.ts`, `util/switch-script.ts`.
  - **Spec bookkeeping.** `## Verification` expected 5 new test files; the tasks name 4 and 4 exist.
  - **What was written.** One local commit on `DW-1-epic3`: the reviewed diff and this spec. Nothing was pushed.

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
