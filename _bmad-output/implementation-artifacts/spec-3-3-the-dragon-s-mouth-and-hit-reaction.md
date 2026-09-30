---
title: "Story 3.3: The Dragon's mouth and hit reaction"
type: 'feature'
created: '2026-09-29'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: [oversized]
deferred:
  - summary: 'FR-30 says "a Strike produces a visible reaction", but a Lock-lane Strike (lock_lane_strike, Story 3.9) never closes s_dragon_body, so it gets no show_dragon_hit from this story. Story 3.9 must decide whether a lock_lane_strike also emits show_dragon_hit.'
    evidence: 'Planning, 2026-09-29: show_dragon_hit is driven only by the devices layer''s dragon_hit (s_dragon_body closed edge, devices/index.ts:391-393). The Lock lane lies between the legs, and its corridor (x 150-190) does not overlap the body''s switch zones (x 94-146 and 194-209.4).'
    location: 'src/sim/rules/dragon-hit.ts (new); Story 3.9'
    severity: 'low'
  - summary: 'FR-30 says the Dragon "holds [the Mouth] open for the War start". This story closes the Mouth mouthCloseHoldMs after any sequence''s last pulse, the War''s included. Story 3.8 must decide whether the War start needs a longer hold.'
    evidence: 'Planning, 2026-09-29: one close rule for every sequence (Boundaries). The War fires the Lock through requestMouthEject (3.2), so it inherits the 300 ms hold unless 3.8 changes it.'
    location: 'src/sim/rules/ball-controller/lock-arbiter.ts; Story 3.8'
    severity: 'low'
---

<intent-contract>

## Intent

**Problem:** The Dragon's Mouth opens and never closes. Story 3.2 emits `show_dragon_mouth_open` before every Mouth sequence, but nothing marks the sequence's end. `TABLE.shows` has no `show_dragon_mouth_close` and no `show_dragon_hit`, and a `dragon_hit` from the devices layer reaches no show at all. No test sees any Mouth show reach `FrameOutput.commands` through a real `createLoop()`, so the loop's forwarding could be deleted with every test green (DW-298).

**Approach:** Declare the two missing shows in `TABLE.shows`.
- The Lock arbiter closes each Mouth sequence: `show_dragon_mouth_close`, exactly `mouthCloseHoldTicks` after the sequence's last `c_mouth` pulse. `mouthCloseHoldMs` is a new `unverified` tunable, 300 ms (measured, see Design Notes).
- A new pure rules module turns each `dragon_hit` into one `show_dragon_hit`.
- Both reach `FrameOutput.commands` through the existing `RulesStepResult.commands` channel. Two real-physics `createLoop()` games pin that path at the seam Story 3.3b's rig will read.

## Boundaries & Constraints

**Always:**
- **TABLE.**
  - `shows` declares exactly three shows: `show_dragon_mouth_open`, `show_dragon_mouth_close` and `show_dragon_hit`, each `{} as Record<string, never>`.
  - `lockLaneWiring` gains `mouthCloseShow: 'show_dragon_mouth_close'`, and `dragonBodyWiring` gains `hitShow: 'show_dragon_hit'`.
  - Code reaches show names only through these wiring fields, never a `show_` literal outside `sim/table/dragonwar.ts` (AD-16, boundary check (e)).
- **The Mouth sequence (AD-18), extending Story 3.2's scheduler in `lock-arbiter.ts`.**
  - A sequence is one `show_dragon_mouth_open`, its pulses (unchanged from 3.2), and one `show_dragon_mouth_close`.
  - When a sequence's last pulse fires at tick P, the arbiter records a pending close due at `P + mouthCloseHoldTicks`. It pushes `ShowCommand { show: TABLE.lockLaneWiring.mouthCloseShow, tick }` on the first tick ≥ that due tick. The check runs in the SL seam right after the pulse check, so a hold of 0 closes on the pulse tick itself, after the pulse.
  - **A request while a close is pending** (the last pulse has fired and the close has not): the arbiter pushes the pending close first, on the request tick, and then opens a new sequence exactly as Story 3.2 does: the open show on this tick and the pulse `mouthOpenLeadTicks` later. Open and close shows therefore strictly alternate, starting with open, and every `c_mouth` falls between an open and its close.
  - A request while pulses are pending is unchanged from 3.2: it appends a pulse and emits no show.
  - The pending close is closure state beside `ControllerState.mouth`: `mouthClose: { lastPulseTick, dueTick } | null`. It is emitted in any phase, and a ball end, a Slam or a phase change never cancels it. It is discarded only if `tick < lastPulseTick` (the tick-backwards reset, `discardStaleMouth`'s rule).
  - "Pending" stays exactly as 3.2 defines it: `cs.mouth`, plus the pulse tick. The drain gate, ball search and the overflow answer never read `mouthClose`.
- **The hit reaction.**
  - The new `src/sim/rules/dragon-hit.ts` exports a pure function. For each `dragon_hit` in this tick's device events, in batch order, it returns one `ShowCommand { show: TABLE.dragonBodyWiring.hitShow, tick }`: N events give N shows.
  - It fires in every phase and under Tilt, because FR-30 says the Dragon "reacts visibly to every hit" and a show is presentation, not score (FR-15 stops scoring only).
  - It keeps no state and emits no coil. `dragon_hit` still reaches the mode stack unchanged.
- **Composition (`sim/rules/index.ts`).** `commands` = the ball controller's `showCommands` (the Mouth, in seam order), then the hit shows. `sim/loop/index.ts` already forwards `commands` into `FrameOutput.commands` in tick order. Leave its code unchanged; updating its comment is fine.
- **Tunable.**
  - `mouthCloseHoldMs` is 300, `unverified`. Its source is the measurement in Design Notes. It goes in `tuning.ts` beside `mouthEjectIntervalMs` and is read once in `createBallController` through `shotWindowTicks`.
  - Tests derive every tick from `resolveTuning()`, never a literal. The two measured physics ticks below are the only exceptions, and they are planning measurements, not tunables.
- **Invariants kept from 3.2.**
  - The arbiter is the only `c_mouth` pulser, and ball search and the overflow answer only request.
  - No mode emits a `CoilCommand`.
  - `lock_lane_entered` still has one consumer.
  - No `GameState`, `machine` or `PlayerState` field is added.
- **Goldens.** Re-record only the headers: `tableHash`, plus `gameStart.tuning`'s new `mouthCloseHoldMs` and its derived `mouthCloseHoldTicks`. Commands are not hashed (`stateHash(game, balls)`), so no `expectedHash` may move.
- **Tests.** Every AC has a pinning test, and `## Verification` carries a `mutation:` line for it (Rule 19). Every negative is paired with its positive. Write non-ASCII characters in source as escapes (Rule 14).

**Never:**
- Never create or touch anything under `src/presentation/mechanisms/**`, `src/presentation/scene/**`, `assets/src/**` or `public/assets/**`, nor `tools/make-placeholder-blend.py` or `ATTRIBUTIONS.md`. These are contended with Epic 5; the rig is Story 3.3b.
- Never let a golden's `expectedHash`, `expectedGameStateHash`, `transitions` or `checkpointTicks` move. That is an intent gap, so HALT.
- Never add a `GameState` or `machine` field, a `SemanticEvent`, or a show beyond the three.
- Never gate `show_dragon_hit` on the score gate (`scoringOpen`).
- Never emit a close without its open, and never let two opens meet without a close between them.
- Never touch `src/sim/physics/**`, the architecture spine, or `epics.md`. Text for the spine goes to the lead in Design Notes.

## I/O & Edge-Case Matrix

L = `mouthOpenLeadTicks`, I = `mouthEjectIntervalTicks`, H = `mouthCloseHoldTicks`, all from `resolveTuning()`. These rows are headless, through `runRulesScript`: a Mouth request is an uncredited park (a hand-closed `s_lock_1` with no `s_lock_lane`), and a hit is a closed `s_dragon_body`.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| One eject | game; park at t | `commands` Mouth shows = [open@t, close@t+L+H]; `c_mouth` only at t+L | No error expected |
| Two ejects, one sequence | parks at t and t+5 | Mouth shows = [open@t, close@t+L+I+H]; pulses at t+L and t+L+I; no close after the first pulse | No error expected |
| Request inside the hold | park at t; the slot is opened at t+L+1, and a second park comes at r = t+L+k, 1<k<H | At r: [close@r, open@r], in that order; pulse at r+L; last close at r+L+H. Shows: open, close, open, close | No error expected |
| Request after the hold | as above with k > H | close@t+L+H; open@r; close@r+L+H | No error expected |
| Hold 0 (dev tuning) | `mouthCloseHoldMs` 0; park at t | close on tick t+L, after that tick's `c_mouth` | No error expected |
| Close survives a Slam | park at t; Slam before t+L | pulse at t+L and close@t+L+H in Attract | No error expected |
| Tick runs backwards | last pulse at P; the timeline restarts at tick 1 before P+H | no close ever; the uninterrupted control closes at P+H | No error expected |
| Hit | game, untilted; `s_dragon_body` closes at t | exactly one `show_dragon_hit`@t. Control: `s_dragon_d` closing at t gives none | No error expected |
| Hit under Tilt / Attract | tilted game; or phase `attract` | one `show_dragon_hit`@t in each, and nothing scores | No error expected |
| Two hits in one batch | `dragonHitShows` given two `dragon_hit` | two shows, in batch order | No error expected |
| Same-tick hit and open | park and `s_dragon_body` at t | `commands` at t = [open, hit] | No error expected |

</intent-contract>

## Code Map

- `src/sim/rules/ball-controller/lock-arbiter.ts`:
  - `requestMouthEject` (:108-121): add the pending-close branch.
  - `pulseDueMouth` (:130-143): record `mouthClose` when the last pulse fires.
  - `discardStaleMouth` (:92-97): also discard `mouthClose`.
  - `arbitrateLockLane` (:207-239): add the close check right after `pulseDueMouth` (:215). It runs every tick, before S8a's early return (`ball-controller/index.ts:229-243`), so the early return never skips a close.
- `src/sim/rules/ball-controller/shared.ts`: `MouthSequence` (:190), `ControllerState.mouth` (:365, add `mouthClose` beside it with a doc comment), and `ControllerContext` (:383-385, add `mouthCloseHoldTicks`).
- `src/sim/rules/ball-controller/index.ts:159-160` (resolve `mouthCloseHoldTicks`; no clamp is needed) and `:169-176` (`cs`: `mouthClose: null`).
- `src/sim/rules/devices/index.ts:391-393` emits `dragon_hit` on each closed edge of `TABLE.dragonBodyWiring.switch`: one switch, so at most one per tick in practice. `DragonHitEvent` is at `devices/events.ts:74-77`.
- `src/sim/rules/index.ts:362` -- `commands: controllerResult.showCommands`; append the hit shows. The comment at :124-137 describes the channel.
- `src/sim/loop/index.ts:456` -- `commands.push(...rulesResult.commands)`, the forwarding DW-298 pins. Only its comment (:458) may change.
- `src/sim/table/dragonwar.ts` -- `dragonBodyWiring` (:585-587), `lockLaneWiring.mouthOpenShow` (:606), `shows` (:711-713), and the header comment (:131).
- `src/sim/table/tuning.ts:336-354` -- the Mouth tunables. Add `mouthCloseHoldMs` after `mouthEjectIntervalMs`.
- `src/sim/table/names.ts:41` -- `ShowName` widens by itself. Nothing in `src/presentation/**` or `src/host/**` switches on a show name (the only command reader, `presentation/lighting/lamp-view.ts:39`, filters `type === 'lamp'`).
- `src/sim/rules/scoring.ts:28` -- `scoringOpen`, deliberately not used.
- Tests whose pins change by design:
  - `test/table.test.ts:265-272` (`shows` holds exactly one → three; the wiring names each);
  - `test/tuning.test.ts:66-67` (`scalarKeys` gains `mouthCloseHoldMs`);
  - `test/lock-arbiter-physics.test.ts:222`, the spit run's `shows` toEqual [open] → [open@c, close@c+L+H]. That is a new real-physics pin; its run continues to `ball_ended`, far past the close;
  - `test/rules-ball-search.test.ts:314` (exact `commands` for the overflow) only if its run reaches t+L+H. Diagnose it, don't loosen it.
  - `test/rules-lock-arbiter*.test.ts` filter by `MOUTH_SHOW` (open) and stay green unchanged.
- `test/rules-devices-headless.test.ts:193` -- `ENTRY_FILES`: list the new headless file.
- `test/util/switch-script.ts:202` -- `RunRulesScriptResult.commands` already exists.
- Integration harness: the Lock run in `test/lock-arbiter-physics.test.ts:47-120`. Start goes on tick 2, the plunge is held from tick 323 for 521 ticks, and the release is tick 844. `FrameOutput.contactEvents` carries `{ kind: 'eject', device: 'bd_lock' }` on the tick physics consumes a `c_mouth` pulse. `snapshot.game.machine.deviceSlots.bd_lock` shows the park.

## Tasks & Acceptance

**Execution:**
1. `src/sim/table/tuning.ts`, `src/sim/table/dragonwar.ts` -- `mouthCloseHoldMs`, the two shows, and the two wiring fields (Always).
2. `src/sim/rules/ball-controller/shared.ts`, `index.ts`, `lock-arbiter.ts` -- `mouthClose`, `mouthCloseHoldTicks`, and the close emission, pending-close branch and discard (Always).
3. `src/sim/rules/dragon-hit.ts` (new, GPL header) -- `dragonHitShows(deviceEvents)`. `src/sim/rules/index.ts` -- compose it after the controller's shows.
4. `test/rules-dragon-shows.test.ts` (new, headless, listed in `ENTRY_FILES`) -- every Matrix row.
5. `test/dragon-shows-physics.test.ts` (new) -- AC 5 and AC 6 on a real `createLoop()`.
6. The listed test edits, plus the header-only refresh of the five goldens. Diagnose any other red test; don't edit it to pass. List every edit in the Auto Run Result.

**Acceptance Criteria:**
- AC1: Given `TABLE`, when `table.test.ts` runs, then `shows` holds exactly the three shows, and `lockLaneWiring.mouthOpenShow`, `lockLaneWiring.mouthCloseShow` and `dragonBodyWiring.hitShow` each name a declared show.
- AC2: Given any Mouth sequence, when its last `c_mouth` pulse fires at P, then `show_dragon_mouth_close` is emitted at exactly P+H and not before. With several ejects, one close follows the last pulse (Matrix rows 1, 2 and 5).
- AC3: Given a request while a close is pending, when it arrives at r, then the close is emitted at r before the new open, the new pulse lands at r+L, and across any run the Mouth shows strictly alternate open/close with every pulse between a pair (rows 3 and 4).
- AC4: Given a `dragon_hit`, when rules step, then exactly one `show_dragon_hit` is emitted at that tick, in a game, under Tilt and in Attract alike. A non-Dragon closure emits none, and N hits in a batch give N shows (rows 8-11).
- AC5 (Integration, Rule 1, DW-298): Given a real `createLoop({ collisionDoc, gameStart, tuning })` on production tuning, and the input Start, the full plunge (521) and `flipper_l` at release+3957 held 25 (measured: an uncredited park):
  - when the run passes the park by L+H+500, then `FrameOutput.commands`' Mouth shows are exactly [open@T, close@T+L+H];
  - T is the tick `snapshot.game.machine.deviceSlots.bd_lock` first reads `[true,false,false]` (measured 5506), and no `lock_lane_*` event fires;
  - the `eject` contact for `bd_lock` lies between them, at T+L+1 (AD-4).
- AC6 (Integration): Given the same game set-up with the `plunge-then-bat-l-3911` input (`flipper_l` at release+3911 held 60), when it runs to tick 7000, then `FrameOutput.commands` holds exactly one `show_dragon_hit`, at tick 4990 (planning measurement of `s_dragon_body`'s one closure in this run, phase `game`, untilted).
- AC7: Given the story, when the gates run, then `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` pass, and the goldens differ only in their headers.

## Spec Change Log

- 2026-09-29, lead spec gate: the Rule 20 sentences under Design Notes were written into the spine (AD-18 close + alternation, AD-19 hit show, AD-7 `mouthClose`). No spec text changed.

## Review Triage Log

## Design Notes

**Measured at this tree** (`4a94d96`, two read-only probe agents; every probe was deleted and the tree left clean).
- **Mouth clearance, which sizes H.** The ejected ball leaves the pose (170, 460) straight down x = 170 at about 300 mm/s (`troughEjectSpeedMmPerS`; `bd_lock.ejectSpeedMmPerS` is null). Its distance from the pose:

  | Ticks after the pulse | 100 | 200 | 300 | 500 |
  |---|---|---|---|---|
  | Distance | 27.3 mm | 60.6 mm | 101.5 mm | 206 mm |

  The Dragon body's switch zones lie at y 430-465, beside the lane. At 300 ms the ball sits about 58 mm south of them, 3.7 ball diameters out. No switch closes during the eject. `mouthCloseHoldMs` 300 is `unverified`: Story 3.3b's jaw geometry and the Story 3.11 playtest own it.
- **DW-298: a real loop path exists.**
  - A sweep of 410 left-flipper taps after the full plunge (production tuning) found exactly one Mouth show: 3957/25, an uncredited park.
    - The show comes at absolute tick 5506, with the slot and `ballsInPlay` changes on the same tick, and no `lock_lane_*` event.
    - The `eject` contact comes at +1001.
    - The spat ball drains inside the save (`ball_saved` at +2408).
  - The recipe is isolated: its neighbours lock or drain. A run takes under 2 s.
  - The fallback, the 3945/30 witness with `lockCaptureWindowMs` 20, also parks (at 4316), but it needs a tuning override, so it is not used.
- **Dragon hit through the loop.** 3911/60 closes `s_dragon_body` once, at 4990, in `game`, untilted, with no earlier drain. 3918/60 gives 5221. 3969/40 hits twice, 46 ticks apart. No two hits ever shared a tick.
- **Why "close then open" inside the hold.** Joining the open Mouth instead would cost the second request its own open show, which breaks Story 3.2's AC 7 ("each Lock eject … `show_dragon_mouth_open`, then `c_mouth` `mouthOpenLeadMs` later"). Ball search's second Lock stage lands 250 ticks after the first pulse, inside H. For consumers (3.3b, Epic 4), a close and an open on one tick means the Mouth stays open for a new sequence.
- **Why the close is timed, not triggered by the ball leaving.** A timed close always follows, even when a pulse ejects nothing (`eject_failed`, DW-297), so the Mouth can never stick open.
- **Goldens.** Commands are not hashed. Only `tableHash` and the two `gameStart.tuning` keys move.
- **Browser smoke (lead).** Nothing new is drawn: the rig is Story 3.3b. Real input does reach both shows:
  - a slightly-off Lock shot hits the Dragon body in ordinary play;
  - a Mouth sequence needs a third Lock shot at two credits, or a slow park.

  The deciding check is headless: AC 5 and AC 6, plus a browser recording replayed through `createLoop` or `runReplay()` with `FrameOutput.commands` inspected.

**Governing ADs:**
- AD-18: the one Mouth sequence and its close; one pulser.
- AD-9: `ShowCommand` in `TABLE.shows`, and outputs by name.
- AD-19: `dragon_hit` from the devices layer only.
- AD-4: shows reach `FrameOutput.commands` in tick order, and a pulse is consumed at N+1.
- AD-3 and AD-15: the hold in ms in `tuning.ts`, converted once; the goldens.
- AD-7: the new closure field.
- AD-8: modes emit no coils.
- AD-13: shows drive the cues.
- AD-16: no show literals.

**For the lead (Rule 20), sentences for the spine:**
- AD-18: "A Mouth sequence ends with `show_dragon_mouth_close`, `mouthCloseHoldMs` after its last pulse, in any phase. A request while that close is pending emits the close, then opens a new sequence (open now, pulse `mouthOpenLeadMs` later), so open and close strictly alternate."
- AD-7 inventory: "`ControllerState.mouthClose` (the pending close after a sequence's last pulse; at most one; discarded if `tick` runs backwards)."
- AD-9/AD-19: "`sim/rules/dragon-hit.ts` turns each `dragon_hit` into one `show_dragon_hit`, in every phase and under Tilt (FR-30: 'every hit')."

**Integration (Rules 1/2).**
- Consumed-by:
  - 3.3b: the rig animates open, close and hit from these three shows only;
  - 3.8: the War's Mouth sequence, and whether it needs a longer hold (see deferred);
  - 3.9: the Strike reaction (see deferred);
  - 4.3: the flashers on every Mouth eject.

  The first presentation consumer is 3.3b.
- Consumes:
  - 3.2's Lock arbiter and Mouth scheduler;
  - 2.4's `dragon_hit`;
  - `sim/loop`'s `commands` forwarding.
- Integration ACs: AC5 and AC6, both on real physics and a real `createLoop()`.

**Ledger inbox (Rule 17).** DW-298 → AC5, which observes the arbiter's shows in `FrameOutput.commands` through `createLoop`. None is declined.

**Footprint.** In footprint: `src/sim/rules/**`, `src/sim/table/**` and `test/replays/**` (headers only). Extensions to report: `test/*.test.ts`, and `src/sim/loop/index.ts` (comment only, if touched). None is contended. No presentation change is needed.

## Verification

**Commands** (run with `export BLENDER=C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe`; baseline 141 files / 2308 tests):
- `pnpm test` -- expected: all green.
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions && pnpm build && pnpm check:dist && pnpm check:size` -- expected: each exits 0.
- `git diff -- test/replays` -- expected: only `tableHash` and the two new `gameStart.tuning` keys change.

**Mutations** (Rule 19; planned here. The implement stage applies each one, observes red, reverts it, and records the line):
- AC1: delete `show_dragon_hit` from `TABLE.shows` → `table.test.ts` red, and typecheck red.
- AC2: record the close due at `P + H - 1` → the "One eject" row red. Emit the close on every pulse, not only the last → the "Two ejects" row red.
- AC3: drop the pending-close push in `requestMouthEject` → the "Request inside the hold" row red (two opens meet).
- AC4: wrap the hit-show composition in `scoringOpen(...)` → the Tilt/Attract row red. Emit on `bank_target_down` too → the control row red.
- AC5: delete `commands.push(...rulesResult.commands)` in `sim/loop/index.ts` → the AC5 run red (DW-298). Add 1 to H → red.
- AC6: drop the hit shows from `commands` in `sim/rules/index.ts` → the AC6 run red.
- AC7: the golden replay tests (per-field header parse).

## Auto Run Result

Status: ready-for-dev
Blocking condition: none

Planned at `4a94d96db0a357cc2a74772a0ca5f323d8d6f0d7` on `DW-1-epic3`. The run halted after planning, as the invocation asked.
- It used the committed `epic-3-context.md` without recompiling it, and Story 3.2's spec (`done`) for continuity.
- Two read-only probe agents took measurements through real `createLoop()` games:
  - a Dragon-hit recipe (3911/60, a hit at 4990);
  - the Mouth eject's clearance, which sizes `mouthCloseHoldMs` 300;
  - a production-tuned uncredited park (3957/25, the show at 5506), found in a 410-run sweep, which is DW-298's real loop path.
- Every probe file was deleted, and `git status --short` was clean afterwards.
- Decisions pinned in the spec:
  - The close comes `mouthCloseHoldMs` after a sequence's last pulse.
  - A request inside the hold emits the close, then a new open.
  - `show_dragon_hit` fires in every phase and under Tilt, one per `dragon_hit` (FR-30: "every hit").
- The frontmatter defers two items: the War's Mouth hold (3.8) and the Lock-lane Strike's visible reaction (3.9).
- The lead has three items (Design Notes): the Rule 20 spine sentences (AD-18, AD-7, AD-9/AD-19), and the footprint extension `test/*.test.ts`. No presentation path is touched.
