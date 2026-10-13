# Epic 3 Context: The Campaign and the War

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 3 turns a complete game into the campaign the project exists for. It adds a real mode stack, the Lock and its arbiter, and the Dragon's mouth and hit shows. On top of those come three campaign Modes (Hurry-up, Quick multiball, Joust) and the War: lock two balls under the Dragon and spell DRAGON, in either order, and the Mouth opens and fires them back with three balls in play. Ten Strikes win a progressive Jackpot, and an extra-ball achievement menu follows. Once Epic 5 merges, the Dragon rig and every Epic 3 playfield insert are added and both Loop entries are opened, so that a flipper shot can make a Loop. The first full playtest comes last, and after it the scoring values and the Strike count freeze. The epic is judged by whether the dragon-fire moment lands for the author.

## Stories

- Story 3.0: Epic 2 Deferred Cleanup (done)
- Story 3.0a: Playfield scoring (done)
- Story 3.1: The mode stack (done)
- Story 3.2: Locking balls and the Lock arbiter (done)
- Story 3.3: The Dragon's mouth and hit reaction (done; sim side only)
- Story 3.3b: The Dragon rig
- Story 3.3c: Epic 3 inserts
- Story 3.3d: Open the Loop entries
- Story 3.4: Lighting Modes at the Ramp and starting them at the Lock lane (done)
- Story 3.5: Hurry-up — answer the call (done)
- Story 3.6: Joust — the charge (done)
- Story 3.7: Quick multiball — fight the monster
- Story 3.8: The War starts — dragon fire
- Story 3.9: Strikes, the Jackpot and the end of the War
- Story 3.10: Extra ball from the achievement menu
- Story 3.11: The first full playtest and the scoring freeze

Build order: 3.7 → 3.10. Three stories wait for Epic 5 to merge: 3.3b, then 3.3c, with 3.3d beside them. 3.11 comes last.

## Requirements & Constraints

- **Tilt and scoring.** Nothing scores while Tilted or outside a game: no award, letter, bonus credit or skill-shot award. Shows still fire. A Tilt during a multiball ends the ball when the last ball drains, and the Mode ends with it.
- **Campaign.** Every Ramp completion lights the next unplayed Mode (Hurry-up → Quick multiball → Joust, restarting once all three are played), so several can be lit at once. A lit Mode starts at the Lock lane; starting it moves it from lit to played and emits `show_mode_start`.
- **Hurry-up (built).** A value that decays from 250,000 to a 50,000 floor over 20 s and is collected at the Ramp. Its timer keeps running under a multiball, and a Ramp shot still collects it.
- **Joust (built).** Alternating Loops build a Charge, capped at 10, and each Loop pays `loopValue × charge`. The Charge is the length of the current alternating run: the first Loop of a Joust, and the first after a break, opens it at Charge 1. A repeated or broken Loop resets it to 1. `joust_full_charge` fires once per Joust.
- **Loops are not yet playable (DW-319).** No real flipper shot makes either Loop: the collision geometry walls the left lane's mouth off from the field, and every Loop in the tests was a teleported launch or a plunge coming down from the top. Until 3.3d opens both entries, Joust, the Right-Loop Extra-ball collect and a full-Charge Joust can be scored by the rules but not played.
- **Quick multiball.** Adds one ball (two in play) with its own ball save, and pays on Dragon hits and Ramp shots. A Lock-lane entry during it is a bash hit (`lock_lane_strike`): no credit, no Mode start and no War, and the ball comes back out of the Mouth. It ends when one ball remains and cannot start during the War.
- **Locks.** Credits are per player; there is one physical Lock. A Lock-lane shot locks whenever the player has fewer than two credits and no multiball is running. If the Lock is full of another player's balls it spits one, and the credit still counts.
- **War.**
  - Starts the instant the current player has both DRAGON spelled and two credits, whichever completes last, with no multiball running. No mode-select window opens.
  - The Mouth fires every ball the Lock holds and the trough launches the difference, so three balls are in play. `warsStarted` increments and `war_started { player, jackpot }` carries this War's Jackpot. The War arms ball save with its own source.
  - The start is the brightest, loudest event on the table: in the starting tick it emits `show_war_start`, dims the GI to `warGiLevel` and fires every flasher.
  - The Dragon should hold its Mouth open for the War start, but every Mouth sequence closes 300 ms after its last pulse. 3.8 decides whether the War needs a longer hold (DW-304).
  - A Dragon hit or a Lock-lane entry is a Strike, and each needs a visible reaction. A Lock-lane Strike never closes the Dragon's body switch, so 3.9 decides whether it also emits `show_dragon_hit` (DW-303).
  - A full DRAGON bank counts as `warStrikesPerBank` Strikes instead of letters; the bank still resets.
  - Ten Strikes pay the Jackpot: 500,000 + 500,000 × Wars started this game. `war_won` fires once, and every later Strike in the same War pays the Jackpot again.
  - Ends when one ball remains. DRAGON letters and Lock credits reset; the Jackpot seed carries.
- **Extra ball.** Lit the first time in a game the player wins a War, reaches full Joust Charge, or has played all three Modes. A repeat of the same achievement does not relight it; a different one does. It is collected at the Right Loop, and the same player then plays again with the ball number unchanged.
- **Scoring freeze.** At least five recorded playtest games covering two Wars, a Hurry-up collect, a full-Charge Joust and a Quick multiball. Then every scoring tunable moves to `confidence: playtested`, checked in CI, and the author records the War-start verdict in `docs/feel-test.md`.
- **Gates for every story:** `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`.

## Technical Decisions

- **One score gate.** Every score write goes through the helper in `sim/rules/scoring.ts` (`phase === 'game'`, not tilted); the same gate covers letters, bonus credit and the skill shot. Base scoring lives in the base mode; other modes never write `score` directly.
- **Mode stack.**
  - Unique priorities: base 100, skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500.
  - Start only via `_will_start → _starting → _started`, stop only via `_will_stop → _stopping → _stopped`; stop phases are pure and read no tuning.
  - Fan-out is event-major, highest priority first; a mode stopped by an event gets none of that tick's later events.
  - Scoring from all active modes adds up; lamp roles combine by priority; the Backglass shows the highest-priority `ModeView`.
  - Modes never emit `CoilCommand`s or read raw switches. `modes[]` is empty before `ball_ended`.
  - Campaign Modes start only through `startCampaignMode()`, called by the Lock arbiter.
- **Lock arbiter.**
  - It is the only consumer of `lock_lane_entered` and the only thing that pulses `c_mouth`; anything else that needs a Mouth eject requests one from it.
  - Per captured entry it checks multiball, then lock (plus mode), then mode, then eject. Outcomes: `lock_lane_locked`, `lock_lane_mode_start { candidates, selected }`, `lock_lane_strike`, `lock_lane_spit { credited }`. A Lock capture is not a drain.
  - Mouth sequence: `show_dragon_mouth_open`, the first pulse `mouthOpenLeadMs` later, each further pulse `mouthEjectIntervalMs` apart, and `show_dragon_mouth_close` `mouthCloseHoldMs` after the last. Open and close strictly alternate.
- **Balls and multiball.**
  - The machine has four balls; `bd_lock` holds two plus a staging slot.
  - Only the ball controller pulses `c_trough_eject`/`c_autolaunch` and changes `ballsInPlay`, which counts balls launched and not yet arrived at a ball device. A Mouth eject puts one back in play.
  - A multiball is running exactly when `machine.multiball !== null`, set only in `_starting` and cleared only in `_stopped` of Quick multiball or the War, never derived from `ballsInPlay`.
  - Ball save uses `arm({ ticks, source })`/`disarm(source)`; sources stack, the longest live window wins and Tilt disarms all. The ball controller's own window starts on a player plunge, never on a save's re-serve.
  - The stray-ball clear before a ball start's serve never serves; 3.7 checks it against a multiball drain.
- **State.**
  - `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }` is plain JSON, changed only inside `rules.step`. Per player: score, letters, Lock credits, `modesLit`, `modesPlayed` (an append-only log of campaign Mode starts), extra balls, the Jackpot seed and Wars started.
  - Mode timers and counters live in `modes[i]`, visible to presentation only via `ModeView` (`timerTicks`, `value`, `charge`, `strikesRemaining`).
  - Closure state in `create*()` factories must be reproducible from tick 0 and bounded. Re-check it against the code rather than a written inventory; it now includes the shot tracker's `fallBackStates`.
  - A new `GameState` or `machine` field moves every golden state hash and needs the author's permission.
- **Loop detection.**
  - A shot in `TABLE.shots` may declare a fall-back signature. For a Loop, `shot_<loop>_broken` means "entered and fell back": an armed Loop breaks when its entry switch closes again, or the ball reaches that side's inlane or outlane, within `loopBreakWindowMs`. A descent mark (`loopDescentWindowMs`) stops a ball coming down from the top from arming the Loop.
  - The signature is not known to be free of false breaks. It is established only on the planning sample and the paths pinned in `test/loop-fall-back-physics.test.ts`.
  - Its known gaps belong to 3.3d and cannot be reached by real input while the entries are closed. A slow Ramp return arms the Right Loop and breaks it at the inlane, costing a running Joust its Charge (DW-322). An entry switch that closes twice on a descent breaks the Loop (DW-323). An unconsumed descent mark swallows the next real entry on that side (DW-324). A ball that passes the far switch and falls back still counts as a made Loop (DW-325). Once the entries open, a field ball that crosses an entry switch must produce no Loop event (DW-326).
- **Outputs.**
  - Rules emit only `LampCommand { lamp, role, step }`, `GiCommand`, `FlasherCommand { flasher, ms }` and `ShowCommand`; every show is declared in `TABLE.shows`.
  - Lamps come from `lampsOf(state, hurryUpTicks)`. `role` is `off`/`lit`/`hurryup`/`quickmb`/`joust`/`dragon`/`special` with `step` 0–3, never a colour; only `presentation/lighting/grammar.ts` maps to RGB.
  - Events carry full payloads (`war_strike { remaining, jackpot }`, `jackpot_awarded { value }`, `war_ended { player, strikes, won }`); rules never format text. Every `dragon_hit` yields one `show_dragon_hit`, in every phase and under Tilt.
- **Tunables.** Every value lives in `sim/table/tuning.ts` with `source` and `confidence`; new values ship `unverified`. Timers are authored in ms and converted to ticks once at load. Any change to the tuning record moves every golden's header.
- **Determinism.**
  - Test rules headless with the switch-script DSL; replay goldens assert the state hash. Device-name literals appear only in `sim/table/dragonwar.ts` and `test/**`.
  - Re-recording a golden's trajectory hashes needs the author. The one exception is 3.3d, and only for goldens whose path crosses the changed geometry: each re-record logs the old and new hashes and the geometry change, and the reviewer confirms the new path is plausible. A golden that moves without crossing that geometry means the change leaked: stop and ask.
  - `tick` is not reset at game start yet; 3.7 owns that fix (DW-280).
- **Inserts (3.3c).** Each new insert needs an `l_` node in `tools/make-placeholder-blend.py` and the exported model, a `TABLE.lamps` entry and a `lampsOf` role; the asset contract passes and only golden headers move. An `l_` node is lens and cup geometry, never a decal, following Epic 5's lens convention (dark in its own colour when off, covered by the playfield translucency mask).

## UX & Interaction Patterns

- **Backglass first.** Stories 3.5–3.10 add no inserts or insert roles. They show state on the Backglass: lit Modes and the mode-select candidates, the decaying Hurry-up value, the Charge, Strikes remaining and Extra ball lit. The Charge prints as `CHARGE XN` with the letter X (`CHARGE X3`), because the DMD's 5×7 font has no multiplication sign.
- **Insert grammar (delivered by 3.3c).**
  - A lit Mode's insert is step 1 in its colour (Hurry-up red, Quick multiball green, Joust blue), off when the Mode starts.
  - Hurry-up running: the Ramp insert is `hurryup` step 1, then step 3 in the last `hurryUpUrgentMs`.
  - Joust running: both Loop inserts are `joust`, the next-expected Loop at step 2.
  - Quick multiball running: the Dragon and Ramp inserts are `quickmb`.
  - War running: every War insert is `dragon` step 2; the Jackpot ladder is step 3 once the War is won.
  - Extra ball lit: the Right Loop insert is `special` (purple) step 1, off when awarded.
- **Dragon rig (3.3b, `src/presentation/mechanisms/dragon.ts`).** It animates only from show commands, never from device slots or `ballsInPlay`. It has exactly open, close and hit, with no idle. A hit during a reaction restarts it rather than queueing. The mouth is fully open before the first ball spawns.

## Cross-Story Dependencies

- 3.7 is the first story to set `machine.multiball` and to emit `lock_lane_strike`. The War (3.8, then 3.9) counts that event as a Strike.
- 3.7 also owns two open ball-save defects: a `disarm()` of the longest source leaves its deadline in force (DW-219), and a ball loses save eligibility once a window's grace lapses (DW-226). 3.8 arms the War's own source on the same device.
- The War fires the Lock by requesting Mouth ejects from the arbiter. A capture that locks while a Mouth eject is pending is the ball that eject spits back. 3.2 accepted this; it reopens if 3.8 or 3.9 plans such a capture (DW-299).
- 3.10 consumes `war_won` (3.9), `joust_full_charge` (3.6) and `modesPlayed` (3.4). Its Right-Loop collect can be tested through the rules now but not played until 3.3d.
- Until Epic 5 merges, the model generator, the exported assets, Epic 5's `sync-mechanisms.ts` and the DMD font's `ATTRIBUTIONS.md` row are contended with it, so stories 3.7–3.10 leave them alone. After the merge:
  - 3.3b builds the rig against Epic 5's `vis_dragon` (Story 5.1 delivers a named jaw node and pivot, not `dragon.ts`) and wires it into `sync-mechanisms.ts`.
  - 3.3c follows 3.3b and shows the states 3.4–3.10 produce.
  - 3.3d opens both Loop entries in the generator and the exported assets, and re-validates the Loop fall-back signature on real paths. It is done only when `test/util/reachability.ts` carries a recorded real flipper recipe that makes each Loop on real physics; a teleported launch cannot stand in.
- 3.11 needs 3.1–3.10 complete and 3.3d for its full-Charge Joust, and plays against 3.3c's inserts.
- Epic 4's flasher and cue stories consume this epic's `FlasherCommand`s and `ShowCommand`s.
