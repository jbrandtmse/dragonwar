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
- Story 3.4: Lighting Modes at the Ramp and starting them at the Lock lane (done)
- Story 3.5: Hurry-up — answer the call
- Story 3.6: Joust — the charge
- Story 3.7: Quick multiball — fight the monster
- Story 3.8: The War starts — dragon fire
- Story 3.9: Strikes, the Jackpot and the end of the War
- Story 3.10: Extra ball from the achievement menu
- Story 3.11: The first full playtest and the scoring freeze

Build order: 3.5 → 3.10. After Epic 5 merges: 3.3b, then 3.3c, then 3.11.

## Requirements & Constraints

- **What earlier stories already deliver:**
  - 3.0: the end-of-ball bonus counts DOWN while the score line rises from the pre-bonus score. Tilt spacing is one machine-wide debounce; the settle mark is per player. An automatic re-launch after a save never pays the skill shot.
  - 3.0a: pops, slings, Spinner revolutions and a completed DRAGON bank score for the current player. Letters are de-duplicated and per player.
  - 3.1: `sim/rules/ball-controller/` is a directory of modules. `modes/lifecycle.ts` is the only way to start or stop a mode; modes start in the same step as `ball_starting`. Each mode's lamp hooks are registered on its definition and in `MODE_LAMP_ROLES`, kept in sync by a test.
  - 3.2: `ball-controller/lock-arbiter.ts` is the only consumer of `lock_lane_entered` and the only thing that pulses `c_mouth`; later stories call `requestMouthEject`. A Lock capture is not a drain. A capture that earns nothing (two credits and no Mode lit, a multiball, or Tilt) emits `lock_lane_spit { credited: false }`; a capture into a full Lock emits `{ credited: true }`. Until 3.7/3.8 refine it, any capture with `multiball !== null` is spat back uncredited. The Lock insert is `dragon` step 1 while the player can lock.
  - 3.3: the three Dragon shows are declared in `TABLE.shows`. Every Mouth sequence closes `mouthCloseHoldMs` (300 ms, `unverified`) after its last pulse; open and close always alternate. `sim/rules/dragon-hit.ts` emits one `show_dragon_hit` per `dragon_hit`, in every phase.
  - 3.4: player-scoped `modesLit` (in lit order, persists across balls). `modesPlayed` is now an append-only log of campaign Mode starts, never written at ball end. The three campaign Modes — `hurryup`, `quickmb`, `joust` — are registered **shells** (name, priority, lifecycle only) for 3.5, 3.7 and 3.6 to fill; the Quick-multiball shell never sets `machine.multiball`. The Lock arbiter starts them through `startCampaignMode()` (`modes/campaign.ts`). The Backglass score screen shows `HURRY-UP LIT` / `QUICK MB LIT` / `JOUST LIT` and a SELECT MODE screen during the window. Tunables `modeSelectMs` (10 s) and `modeSelectHoldMs` (500 ms) ship `unverified`.
- **Tilt and scoring.** Nothing scores while Tilted or outside a game — every award, letter, bonus credit and skill-shot award. Shows still fire. A Tilt during a multiball ends the ball when the last ball drains, and the Mode ends with it.
- **Campaign.** Every Ramp completion lights the next unplayed Mode (Hurry-up → Quick multiball → Joust, restarting once all three are played); several can be lit at once. A capture's candidates are the lit Modes not already active. Starting a Mode moves it from `modesLit` to `modesPlayed` and emits `show_mode_start`.
- **Hurry-up:** value starts at 250,000 and decays linearly to a 50,000 floor over 20 s, then holds. A Ramp shot collects it and stops the Mode; the ball ending stops it with no award. Its timer keeps running under a multiball. `hurryUpUrgentMs` is authored here; 3.3c uses it.
- **Joust:** alternating Loops build a Charge, capped at 10×, multiplying the Loop award. A repeated or broken Loop resets the Charge to 1. `joust_full_charge` fires once per Joust. The Mode stops after `joustMs` or at ball end. The Spinner scores independently of Joust.
- **Quick multiball:** adds one ball with its own ball save and pays on Dragon hits and Ramp shots. A Lock-lane entry during it is a bash hit (`lock_lane_strike`): no lock, no War, no Mode start. Ends when one ball remains.
- **Locks:** credits are per player; there is one physical Lock. If it is full of another player's balls it spits one and the current player's credit still counts.
- **War:**
  - Starts the instant the player has both DRAGON spelled and two credits, whichever completes last; no mode-select window opens. The Mouth fires what the Lock holds and the trough tops up to three balls in play.
  - The War currently inherits the 300 ms Mouth close hold; 3.8 decides whether it needs a longer one (DW-304).
  - A Dragon hit or a Lock-lane entry is a Strike, and each needs a visible reaction. A Lock-lane Strike never closes the body switch, so 3.9 decides whether `lock_lane_strike` also emits `show_dragon_hit` (DW-303).
  - A full DRAGON bank counts as `warStrikesPerBank` Strikes; the bank still resets.
  - Ten Strikes pay the Jackpot: 500,000 + 500,000 × Wars started; every later Strike pays it again.
  - Ends when one ball remains: DRAGON letters and Lock credits reset, the Jackpot seed carries.
  - The War start is the brightest, loudest event: GI dims to `warGiLevel` and every flasher fires.
- **Extra ball:** lit the first time in a game the player wins a War, reaches full Joust Charge, or has played every Mode; a repeat of the same achievement does not relight it. Collected at the Right Loop; the same player plays again with the ball number unchanged.
- **Scoring freeze:** at least five recorded playtest games covering two Wars, a Hurry-up collect, a full-Charge Joust and a Quick multiball. Then every scoring tunable moves to `confidence: playtested`, checked in CI, and the author records the War-start verdict in `docs/feel-test.md`.
- **Gates for every story:** `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`.

## Technical Decisions

- **One score gate.** Every score write goes through `sim/rules/scoring.ts`'s helper (`phase === 'game'`, not tilted); the same gate covers letters, bonus and skill shot. Base scoring lives in the base mode; other modes never write `score` directly.
- **Mode stack.**
  - Unique priorities: base 100, skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500.
  - Start only via `_will_start → _starting → _started`, stop only via `_will_stop → _stopping → _stopped`; stop phases are pure and read no tuning.
  - Fan-out is event-major, highest priority first; a mode stopped by an event gets none of that tick's later events.
  - Scoring from all active modes adds up; lamp roles combine by priority; the Backglass shows the highest-priority `ModeView`.
  - Modes never emit `CoilCommand`s or read raw switches. `modes[]` is empty before `ball_ended`.
  - Campaign Modes start only through `startCampaignMode()`, called by the Lock arbiter; never write `modes[]` outside `lifecycle.ts`.
- **Lock arbiter.**
  - Per captured entry it checks multiball, then lock (plus mode), then mode, then eject. Outcomes: `lock_lane_locked`, `lock_lane_mode_start { candidates, selected }`, `lock_lane_strike`, `lock_lane_spit { credited }`.
  - Lock-first pairs are the only two-event outcomes: `lock_lane_locked` (or `lock_lane_spit { credited: true }` when that capture fills the Lock) followed by `lock_lane_mode_start`, and the Mode then runs with the newly served ball. A full-device entry (never captured) never starts a Mode.
  - Mode-select window: with two or more candidates the ball stays in `bd_lock` for `modeSelectMs`; flipper presses move the selection, and Start, a `modeSelectHoldMs` flipper hold or expiry confirms (`mode_select_ended`). Only then do the start and the release (serve or Mouth) run. A Tilt ends the window with no start but still runs the release; a Slam in an unlocked capture's window still requests the owed Mouth eject.
  - No new game starts while a Mouth eject is pending (its ball is parked out of the stray clear's reach); Start is ignored until the sequence's last pulse.
  - Mouth sequence: `show_dragon_mouth_open`, first `c_mouth` pulse `mouthOpenLeadMs` later, each further pulse `mouthEjectIntervalMs` apart, `show_dragon_mouth_close` `mouthCloseHoldMs` after the last. A request while a close is pending emits the close first, then opens a new sequence.
- **Other single arbiters.** Only the ball controller pulses `c_trough_eject`/`c_autolaunch` and changes `ballsInPlay`. A multiball is running exactly when `machine.multiball !== null`, set only in `_starting` and cleared only in `_stopped` of Quick multiball or the War. Ball save uses `arm({ ticks, source })`/`disarm(source)`; the longest live window wins; Tilt disarms all. Ball search skips `c_mouth` while any mode publishes `timerTicks`.
- **State.**
  - `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }` is plain JSON, changed only inside `rules.step`.
  - Per player: score, letters, credits, `modesLit`, `modesPlayed`, extra balls, the Jackpot seed and Wars started.
  - Mode timers and counters live in `modes[i]`, visible to presentation only via `ModeView` (`timerTicks`, `value`, `charge`, `strikesRemaining`).
  - Closure state in `create*()` factories must be reproducible from tick 0 and bounded; re-check against the code rather than a written inventory.
  - A new `GameState` or `machine` field changes every golden state hash and needs the author's permission.
- **Outputs.** Rules emit only `LampCommand { lamp, role, step }`, `GiCommand`, `FlasherCommand { flasher, ms }` and `ShowCommand`; every show is declared in `TABLE.shows`. Lamps come from `lampsOf(state, hurryUpTicks)`; `role` is `off`/`lit`/`hurryup`/`quickmb`/`joust`/`dragon`/`special` with `step` 0–3, never a colour; only `presentation/lighting/grammar.ts` maps to RGB. Events carry full payloads (`war_strike { remaining, jackpot }`, `jackpot_awarded { value }`, `war_ended { player, strikes, won }`); rules never format text.
- **Tunables.** Every value lives in `sim/table/tuning.ts` with `source` and `confidence`; new values ship `unverified`. Timers are authored in ms, converted to ticks once, clamped to at least one tick; tests derive ticks from `resolveTuning()`. Adding a tunable moves only golden headers.
- **Determinism.** Test headless with the switch-script DSL; replay goldens assert the state hash. `tick` is not reset at game start yet — Story 3.7 owns that fix (DW-280). Device-name literals appear only in `sim/table/dragonwar.ts` and `test/**`.
- **Inserts (3.3c only).** Each new insert needs an `l_` node in `tools/make-placeholder-blend.py` and the exported model, a `TABLE.lamps` entry and a `lampsOf` role; the asset contract passes and only golden headers move. An `l_` node is lens and cup geometry, never a decal, following Epic 5's lens convention (dark in its own colour when off, covered by the playfield translucency mask).

## UX & Interaction Patterns

- **Backglass first.** Stories 3.5–3.10 add no inserts or insert roles. They show state on the Backglass: the decaying Hurry-up value, CHARGE ×N, Strikes remaining, Extra ball lit, and the score row (lit Modes and SELECT MODE already exist from 3.4).
- **Insert grammar, delivered by 3.3c:** a lit Mode's insert at step 1 in its colour (Hurry-up red, Quick multiball green, Joust blue), off when it starts; Hurry-up's Ramp insert `hurryup` step 1, step 3 in the last `hurryUpUrgentMs`; Joust's Loop inserts `joust`, next-expected Loop step 2; Quick multiball's Dragon and Ramp inserts `quickmb`; every War insert `dragon` step 2, the Jackpot ladder step 3 once won; Extra ball is the Right Loop insert, `special` (purple) step 1, off when awarded.
- **Dragon rig** (3.3b, `src/presentation/mechanisms/dragon.ts`): animates only from show commands, never device slots or `ballsInPlay`; exactly open, close and hit, no idle; a hit mid-reaction restarts rather than queues; the mouth is fully open before the first ball spawns.

## Cross-Story Dependencies

- 3.5–3.7 fill the 3.4 shells (`hurry-up.ts`, `joust.ts`, `quick-multiball.ts`) rather than creating new modes. 3.7 is the first to set `machine.multiball`; 3.8 comes before 3.9. The War fires the Lock through `requestMouthEject`.
- DW-299: a capture that locks while a Mouth eject is still pending gets spat back by that eject. 3.2 accepted this; it matters again if 3.8 or 3.9 plans for such a capture.
- Before building Joust, 3.6 must fix Loop detection: Loops never emit `_broken` (DW-288), and two same-side orbits emit a false `_made` for the opposite Loop (DW-173).
- 3.4, 3.6 and 3.9 supply the achievements 3.10 uses. 3.11 requires 3.1–3.10 and plays against 3.3c's inserts.
- 3.3b waits for Epic 5: Story 5.1 delivers `vis_dragon` with a named jaw node and pivot but not `dragon.ts`; 3.3b creates it and wires it into Epic 5's `sync-mechanisms.ts`. `mouthCloseHoldMs`'s final value is settled by the jaw geometry and the 3.11 playtest.
- 3.3c waits for Epic 5 and comes after 3.3b; it shows the states 3.4–3.10 produce.
- Epic 4's flasher and cue stories consume this epic's `ShowCommand`s and `FlasherCommand`s.
