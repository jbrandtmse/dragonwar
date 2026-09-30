# Epic 3 Context: The Campaign and the War

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 3 turns a complete game into the campaign the project exists for. It adds a real mode stack, the Lock and its arbiter, and the Dragon's mouth and hit shows. On top of those come three campaign Modes (Hurry-up, Quick multiball, Joust) and the War: lock two balls under the Dragon and spell DRAGON, in either order, and the Mouth opens and fires them back with three balls in play. Ten Strikes win a progressive Jackpot. An extra-ball achievement menu follows. Once Epic 5 merges, the Dragon rig and every Epic 3 playfield insert are added. The first full playtest comes last, and after it the scoring values and the Strike count freeze. The epic is judged by whether the dragon-fire moment lands for the author.

## Stories

- Story 3.0: Epic 2 Deferred Cleanup (done)
- Story 3.0a: Playfield scoring (done)
- Story 3.1: The mode stack (done)
- Story 3.2: Locking balls and the Lock arbiter (done)
- Story 3.3: The Dragon's mouth and hit reaction (done; sim side only)
- Story 3.3b: The Dragon rig (waits for Epic 5 to merge)
- Story 3.3c: Epic 3 inserts (waits for Epic 5 to merge; comes after 3.3b)
- Story 3.4: Lighting Modes at the Ramp and starting them at the Lock lane
- Story 3.5: Hurry-up — answer the call
- Story 3.6: Joust — the charge
- Story 3.7: Quick multiball — fight the monster
- Story 3.8: The War starts — dragon fire
- Story 3.9: Strikes, the Jackpot and the end of the War
- Story 3.10: Extra ball from the achievement menu
- Story 3.11: The first full playtest and the scoring freeze

Build order: 3.4 → 3.10. After Epic 5 merges: 3.3b, then 3.3c, then 3.11.

## Requirements & Constraints

- **What earlier stories already deliver:**
  - 3.0: the end-of-ball bonus counts DOWN while the score line rises from the pre-bonus score. Tilt spacing is one machine-wide debounce, and the settle mark is kept per player. When a saved ball is re-launched automatically, it never pays the skill shot.
  - 3.0a: pop bumpers, slingshots, Spinner revolutions and a completed DRAGON bank score for the current player. Letters are de-duplicated and kept per player.
  - 3.1: `sim/rules/ball-controller/` is a directory of modules. `modes/lifecycle.ts` is the only way to start or stop a mode, and modes start in the same step as `ball_starting`. Each mode's lamp hooks are registered in two places, on its definition and in `MODE_LAMP_ROLES`, and a test keeps the two in sync.
  - 3.2: `ball-controller/lock-arbiter.ts` is the only consumer of `lock_lane_entered` and the only thing that pulses `c_mouth`. Later stories call `requestMouthEject`. A Lock capture is not a drain. A capture that earns no award (two credits with no Mode lit, or Tilt) emits `lock_lane_spit { credited: false }`. A capture into a full Lock emits `{ credited: true }`. Ball search and a `bd_lock` overflow request Mouth ejects and never pulse the coil. Until 3.7/3.8 refine it, any capture with `multiball !== null` is spat back uncredited. The Lock insert is `dragon` step 1 while the player can lock.
  - 3.3: the three Dragon shows are declared in `TABLE.shows`. Every Mouth sequence closes `mouthCloseHoldMs` (300 ms, `unverified`) after its last pulse, and open and close always alternate. `sim/rules/dragon-hit.ts` emits one `show_dragon_hit` per `dragon_hit`, in every phase.
- **Tilt and scoring.** Nothing scores while Tilted or outside a game. That covers every award, letter, bonus credit and skill-shot award. Shows are presentation, so they still fire. If a Tilt happens during a multiball, the ball ends when the last ball drains, and the Mode ends with it.
- **Campaign.**
  - Every Ramp completion lights the next unplayed Mode, even when a Mode is already lit, so several can be lit at once. The order is fixed: Hurry-up → Quick multiball → Joust. It restarts once all three have been played. Nothing gates it.
  - A lit Mode starts at the Lock lane. When several are lit, the ball stays parked while the player picks with the flippers inside `modeSelectMs`. Start, holding either flipper, or the window expiring confirms the pick.
  - If a lock and a mode start both apply, the lock is credited first and the Mode runs with the newly served ball.
  - `modesPlayed` is credited at `mode_<name>_started`, and only for campaign Modes. The Mode then stops showing as lit, and `show_mode_start` is emitted. The current code credits every mode name at ball end, and that must be removed.
- **Hurry-up:** the value starts at 250,000 and decays linearly to a 50,000 floor over 20 s, then holds there. A Ramp shot collects it. Its timer keeps running under a multiball. `hurryUpUrgentMs` is authored here, but 3.3c is what uses it.
- **Joust:** alternating Loops build a Charge, capped at 10×, that multiplies the Loop award. Repeating a Loop or breaking one resets the Charge to 1. The Spinner scores on its own, independent of Joust.
- **Quick multiball:** adds one ball with its own ball save. It pays on Dragon hits and Ramp shots. A Lock-lane entry during it is a bash hit: no lock, no War and no mode start. The Mode ends when one ball remains.
- **Locks:** credits are per player, but there is one physical Lock. If the Lock is full of another player's balls, it spits one and the current player's credit still counts.
- **War:**
  - The War starts the instant the player has both DRAGON spelled and two credits, whichever completes last. The Mouth fires whatever the Lock holds, and the trough tops up to three balls in play.
  - The Dragon should hold its Mouth open for the War start. Right now the War inherits the 300 ms close hold, and 3.8 decides whether it needs a longer one (DW-304).
  - A Dragon hit or a Lock-lane entry counts as a Strike, and every Strike needs a visible reaction. A Lock-lane Strike never closes the body switch, so 3.9 decides whether `lock_lane_strike` also emits `show_dragon_hit` (DW-303).
  - A full DRAGON bank counts as `warStrikesPerBank` Strikes, and the bank still resets.
  - Ten Strikes pay the Jackpot: 500,000 + 500,000 × Wars started. Every Strike after that pays it again.
  - The War ends when one ball remains. DRAGON letters and Lock credits reset, and the Jackpot seed carries over.
  - The War start is the brightest, loudest event on the table: the GI dims and every flasher fires.
- **Extra ball:** lit the first time in a game that the player wins a War, reaches full Joust Charge, or has played every Mode. It is collected at the Right Loop. The same player then plays again, and the ball number does not change.
- **Scoring freeze:**
  - At least five recorded playtest games, covering two Wars, a Hurry-up collect, a full-Charge Joust and a Quick multiball.
  - After that, every scoring tunable moves to `confidence: playtested`, and CI checks it.
  - The author records the War-start verdict in `docs/feel-test.md`.
- **Gates for every story:** `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size`.

## Technical Decisions

- **One score gate.** Every score write goes through the helper in `sim/rules/scoring.ts`, which requires `phase === 'game'` and no Tilt. The same gate covers letters, the bonus and the skill-shot award. Base scoring lives in the base mode. Other modes never write `score` directly.
- **Mode stack.**
  - Every mode has a unique priority: base 100, skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500.
  - A mode starts only through `_will_start → _starting → _started` and stops only through `_will_stop → _stopping → _stopped`. The stop phases are pure and read no tuning.
  - Events go out event by event, highest priority first. A mode stopped by an event gets none of the events later in that tick.
  - Scoring from every active mode adds up. Lamp roles combine by priority. The Backglass shows the highest-priority `ModeView`.
  - Modes never emit `CoilCommand`s and never read raw switches. `modes[]` is empty before `ball_ended` fires.
- **Single arbiters.**
  - For each captured entry, the Lock arbiter emits exactly one of `lock_lane_locked`, `lock_lane_mode_start { candidates[] }`, `lock_lane_strike` or `lock_lane_spit { credited }`. It checks in this order: multiball, then lock (plus mode), then mode, then eject. It also owns the mode-select window.
  - A Mouth sequence emits `show_dragon_mouth_open`, then the first `c_mouth` pulse `mouthOpenLeadMs` later. Each further pulse comes `mouthEjectIntervalMs` after the one before, and `show_dragon_mouth_close` comes `mouthCloseHoldMs` after the last. If a request arrives while a close is pending, the close is emitted first and a new sequence opens.
  - Only the ball controller pulses `c_trough_eject`/`c_autolaunch` and changes `ballsInPlay`.
  - A multiball is running exactly when `machine.multiball !== null`. The field is set only in `_starting` and cleared only in `_stopped`, by Quick multiball or the War.
  - Ball save uses `arm({ ticks, source })`/`disarm(source)`. The longest live window wins, and Tilt disarms every source.
  - Ball search skips `c_mouth` while any mode publishes `timerTicks`.
- **State.**
  - `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }` is plain JSON and changes only inside `rules.step`.
  - Kept per player: score, letters, credits, Modes lit and played, extra balls, the Jackpot seed and Wars started.
  - Mode timers and counters live in `modes[i]`. Presentation sees them only through `ModeView` (`timerTicks`, `value`, `charge`, `strikesRemaining`).
  - Closure state held in `create*()` factories must be reproducible from tick 0 and bounded in size. Re-check the list against the code rather than trusting a written inventory.
  - A new `GameState` or `machine` field changes every golden state hash, so it needs the author's permission.
- **Outputs.**
  - Rules emit only `LampCommand { lamp, role, step }`, `GiCommand`, `FlasherCommand { flasher, ms }` and `ShowCommand`. Every show must be declared in `TABLE.shows`.
  - Lamp state comes from `lampsOf(state, hurryUpTicks)`. `role` is one of `off`, `lit`, `hurryup`, `quickmb`, `joust`, `dragon` or `special`, with `step` 0–3, and is never a colour. `presentation/lighting/grammar.ts` is the only place a role and step become RGB.
  - Every event carries its full payload (`war_strike { remaining, jackpot }`, `jackpot_awarded { value }`, `war_ended { player, strikes, won }`). Rules never format text.
- **Tunables.** Every value lives in `sim/table/tuning.ts` with a `source` and a `confidence`, and new values ship as `unverified`. Timers are authored in ms and converted to ticks once. Tests derive ticks from `resolveTuning()`. Adding a tunable changes only the golden headers.
- **Determinism.** Test headless with the switch-script DSL. Replay goldens assert the state hash. `tick` is not reset at game start yet, and Story 3.7 owns that fix. Device-name literals appear only in `sim/table/dragonwar.ts` and `test/**`.
- **Inserts (3.3c only).** Each new insert needs an `l_` node in `tools/make-placeholder-blend.py` and in the exported model, a `TABLE.lamps` entry and a `lampsOf` role. The asset contract must pass, and only golden headers may move. An `l_` node is lens and cup geometry, never a decal. Inserts follow the lens convention Epic 5 ships: when off, the lens is dark in the insert's own colour, and the playfield's translucency mask covers every lens.

## UX & Interaction Patterns

- **Backglass first.** Stories 3.4–3.10 add no inserts and no insert roles. They show their state on the Backglass: which Modes are lit, the mode-select candidates, the decaying Hurry-up value, CHARGE ×N, Strikes remaining, Extra ball lit, and the score row. The insert behaviour those stories describe is all built in 3.3c.
- **Insert grammar, delivered by 3.3c:**
  - A lit Mode's insert is at step 1 in its colour (Hurry-up red, Quick multiball green, Joust blue) and goes off when that Mode starts.
  - During Hurry-up, the Ramp insert is `hurryup` step 1, rising to step 3 in the last `hurryUpUrgentMs`.
  - During Joust, both Loop inserts are `joust`, and the Loop the player should shoot next is at step 2.
  - During Quick multiball, the Dragon and Ramp inserts are `quickmb`.
  - During the War, every War insert is `dragon` step 2. After the War is won, the Jackpot ladder is at step 3.
  - Extra ball is the Right Loop insert, `special` (purple) step 1, and goes off once the extra ball is awarded.
- **Dragon rig** (3.3b, `src/presentation/mechanisms/dragon.ts`):
  - It animates only from show commands, never from device slots or `ballsInPlay`.
  - It has exactly three animations (open, close and hit) and no idle animation.
  - A hit that arrives mid-reaction restarts the reaction rather than queuing it.
  - The mouth is fully open before the first ball spawns.

## Cross-Story Dependencies

- 3.1's mode stack is the framework for 3.4–3.10. The War fires the Lock through `requestMouthEject`. 3.8 comes before 3.9.
- DW-299: if a capture locks while a Mouth eject is still pending, that eject spits the ball back out. 3.2 accepted this. It becomes a live problem again if 3.8 or 3.9 plans for such a capture.
- 3.3b waits for Epic 5 to merge. Story 5.1 delivers `vis_dragon` with a named jaw node and pivot, but does not create `dragon.ts`. 3.3b creates `dragon.ts` and wires it into Epic 5's `sync-mechanisms.ts`. The final value of `mouthCloseHoldMs` is settled by the rig's jaw geometry together with the 3.11 playtest.
- 3.3c waits for Epic 5 to merge and comes after 3.3b. It shows on the table the states that 3.4–3.10 produce, so it follows them. 3.11 plays against its inserts.
- 3.4, 3.6 and 3.9 supply the achievements 3.10 uses. 3.11 requires 3.1–3.10.
- Before building Joust, 3.6 must fix Loop detection. Loops currently never emit `_broken`, and two orbits on the same side emit a false `_made` for the opposite Loop.
- Epic 4's flasher and cue stories consume this epic's `ShowCommand`s and `FlasherCommand`s.
