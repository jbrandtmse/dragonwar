# Epic 3 Context: The Campaign and the War

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 3 turns a complete game into the campaign the project exists for. It adds a real mode stack, the Lock and its arbiter, and the Dragon's mouth and hit reaction. On top of those come three campaign Modes (Hurry-up, Quick multiball, Joust) and the War: lock two balls under the Dragon and spell DRAGON, in either order, and the Mouth opens and fires them back with three balls in play. Ten Strikes win a progressive Jackpot. An extra-ball achievement menu follows, then the first full playtest, after which the scoring values and the Strike count freeze. The epic is judged by whether the dragon-fire moment lands for the author.

## Stories

- Story 3.0: Epic 2 Deferred Cleanup (done)
- Story 3.0a: Playfield scoring (done)
- Story 3.1: The mode stack (done)
- Story 3.2: Locking balls and the Lock arbiter (done)
- Story 3.3: The Dragon's mouth and hit reaction (sim side: shows, timing, path to presentation)
- Story 3.3b: The Dragon rig (waits for Epic 5's merge)
- Story 3.4: Lighting Modes at the Ramp and starting them at the Lock lane
- Story 3.5: Hurry-up — answer the call
- Story 3.6: Joust — the charge
- Story 3.7: Quick multiball — fight the monster
- Story 3.8: The War starts — dragon fire
- Story 3.9: Strikes, the Jackpot and the end of the War
- Story 3.10: Extra ball from the achievement menu
- Story 3.11: The first full playtest and the scoring freeze

## Requirements & Constraints

- **Baseline already delivered:**
  - 3.0: the end-of-ball bonus counts DOWN while the score line rises from the pre-bonus score. Tilt spacing is one machine-wide debounce; the settle mark is per player. A save's automatic re-launch never pays the skill shot.
  - 3.0a: pops, slings, Spinner revolutions and a completed DRAGON bank score for the current player. Letters are de-duplicated and persist per player.
  - 3.1: `sim/rules/ball-controller/` is a directory of modules. `modes/lifecycle.ts` is the only start/stop path, and modes start in the same step as `ball_starting`. Lamp hooks are registered both on the mode's definition and in `MODE_LAMP_ROLES`, and a test keeps the two in sync.
  - 3.2: `ball-controller/lock-arbiter.ts` is the only consumer of `lock_lane_entered` and the only `c_mouth` pulser. Mouth ejects run as one sequence: `show_dragon_mouth_open`, the first `c_mouth` `mouthOpenLeadMs` later, and each further pulse `mouthEjectIntervalMs` after the previous one. `requestMouthEject` is the entry point for later stories. A Lock capture is not a drain. A no-award capture (two credits with no Mode lit, Tilt) emits `lock_lane_spit { credited: false }`, and a full-device spit emits `{ credited: true }`. Ball search and `bd_lock` overflow request Mouth ejects and never pulse the coil. Until 3.7/3.8 refine it, `multiball !== null` takes the uncredited spit.
- **Tilt and scoring.** Nothing scores while Tilted or outside a game: no award, letter, bonus credit or skill-shot award. Under multiball, a Tilt ends the ball when the last ball drains, and the Mode ends with it.
- **Campaign.**
  - Ramp completions light Modes in the fixed order Hurry-up → Quick multiball → Joust, and the order restarts once all three are played. A lit Mode starts at the Lock lane.
  - With several Modes lit, the ball stays parked while the flippers select inside `modeSelectMs`. Start, either flipper held, or expiry confirms.
  - When a lock and a mode start both apply, the lock is credited first.
  - `modesPlayed` is credited at `mode_<name>_started` for campaign Modes only. Today every mode name is credited at ball end, and that must change.
  - No gating.
- **Hurry-up:** 250,000 decays linearly to a 50,000 floor over 20 s, then holds. A Ramp shot collects it, and its timer keeps running under a multiball.
- **Joust:** alternating Loops build a Charge (cap 10×) that multiplies the Loop award. A repeated or broken Loop resets it to 1. The Spinner scores independently.
- **Quick multiball:** adds one ball with its own ball save and pays on Dragon hits and Ramp shots. A Lock-lane entry is a bash hit: no lock, no War, no mode start. It ends at one ball.
- **Locks:** credits are per player, backed by one physical Lock. If the Lock is full of another player's balls, it spits one and the credit still counts.
- **War:**
  - It starts the instant both DRAGON and two credits hold, whichever completes last. The Mouth fires what the Lock holds and the trough tops up to three balls in play.
  - A Dragon hit or a Lock-lane entry is a Strike. A full bank counts as `warStrikesPerBank` Strikes and the bank still resets.
  - Ten Strikes pay the Jackpot: 500,000 + 500,000 × Wars started. Each further Strike re-pays it.
  - It ends at one ball: letters and credits reset, and the seed carries.
  - The War start is the brightest, loudest event: GI dims and every flasher fires.
- **Extra ball:** lit the first time in a game by a War win, a full Joust Charge, or every Mode played. It is collected at the Right Loop, and the same player plays again with the ball number unchanged.
- **Scoring freeze:** requires at least five recorded playtest games covering two Wars, a Hurry-up collect, a full-Charge Joust and a Quick multiball. Every scoring tunable then moves to `confidence: playtested`, CI asserts it, and the author records the War-start verdict in `docs/feel-test.md`.
- **Gates for every story:** `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`.

## Technical Decisions

- **One score gate.** Every score write goes through `sim/rules/scoring.ts`'s helper (`phase === 'game'` and not tilted), and the same gate guards letters, bonus and the skill-shot award. Base scoring lives in the base mode, and modes never write `score` directly.
- **Mode stack.**
  - Priorities are unique: base 100, skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500.
  - Modes start and stop only through `_will_start → _starting → _started` and `_will_stop → _stopping → _stopped`. Stop phases are pure and tuning-free.
  - Fan-out is event-major, highest priority first. A mode stopped by an event receives none of that tick's later events.
  - Scoring from all modes accrues. Lamp roles combine by priority, and the Backglass shows the highest-priority `ModeView`.
  - Modes never emit `CoilCommand`s or read raw switches, and `modes[]` is empty before `ball_ended`.
- **Single arbiters.**
  - The Lock arbiter emits exactly one of `lock_lane_locked`, `lock_lane_mode_start { candidates[] }`, `lock_lane_strike` or `lock_lane_spit { credited }` per captured entry, and owns the mode-select window.
  - `show_dragon_mouth_close` follows a sequence's last pulse (Story 3.3 adds it).
  - Only the ball controller pulses `c_trough_eject`/`c_autolaunch` and mutates `ballsInPlay`.
  - A multiball is running exactly when `machine.multiball !== null`. It is set only in `_starting` and cleared only in `_stopped` of Quick multiball or the War.
  - Ball save uses `arm({ ticks, source })`/`disarm(source)`. The longest live window wins, and Tilt disarms all.
  - `c_mouth` is skipped by ball search while any mode publishes `timerTicks`.
- **State.**
  - `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }` is plain JSON, mutated only in `rules.step`.
  - Player-scoped: score, letters, credits, Modes lit/played, extra balls, Jackpot seed, Wars started.
  - Mode timers and counters live in `modes[i]` and reach presentation only as `ModeView` (`timerTicks`, `value`, `charge`, `strikesRemaining`).
  - Closure state in `create*()` factories must be reproducible from tick 0 and bounded. The ball controller's `mouth` sequence is one such field. Re-derive the inventory from code.
  - Any new `GameState`/`machine` field moves every golden state hash and needs the author's grant.
- **Outputs.**
  - Rules emit only `LampCommand { lamp, role, step }`, `GiCommand`, `FlasherCommand { flasher, ms }` and `ShowCommand`, where shows are declared in `TABLE.shows`.
  - Lamps come from `lampsOf(state, hurryUpTicks)`, with `role ∈ {off, lit, hurryup, quickmb, joust, dragon, special}` and `step 0..3`, and never an RGB value.
  - Events are payload-complete (`war_strike { remaining, jackpot }`, `jackpot_awarded { value }`, `war_ended { player, strikes, won }`), and rules never format text.
- **Tunables.** Every value lives in `sim/table/tuning.ts` with `source`/`confidence`, and new values ship `unverified`. Author timers in ms and convert them once. Tests derive ticks from `resolveTuning()`.
- **Determinism.** Test headless with the switch-script DSL; replay goldens assert the state hash. `tick` is not reset at game start, which Story 3.7 owns. Device-name literals appear only in `sim/table/dragonwar.ts` and `test/**`.

## UX & Interaction Patterns

- **Insert colours:**
  - Hurry-up red, step 3 in its last `hurryUpUrgentMs`.
  - Quick multiball green.
  - Joust blue, with the next-expected Loop at step 2.
  - Lock, letters and War orange (`dragon`): the Lock insert is at step 1 while the player can lock, War inserts at step 2, and the Jackpot ladder at step 3.
  - Extra ball purple (`special`).
- The Backglass shows the decaying Hurry-up value, CHARGE ×N, Mode-select candidates, Strikes remaining and the score row.
- **Dragon rig** (`src/presentation/mechanisms/dragon.ts`):
  - It animates only from show commands, never from device slots or `ballsInPlay`.
  - It has exactly three animations (open, close, hit) and no idle.
  - An overlapping hit restarts the reaction.
  - The mouth is fully open before the first ball spawns.

## Cross-Story Dependencies

- 3.1's stack is the framework for 3.4–3.10. 3.2's arbiter feeds 3.3, 3.4, 3.7, 3.8 and 3.9, and the War fires the Lock through `requestMouthEject`. 3.8 precedes 3.9.
- A capture that locks while a Mouth eject is pending gets spat by that eject. This was accepted at 3.2 and reopens if 3.8/3.9 plan such a capture.
- 3.3 adds the missing test that the arbiter's show reaches `FrameOutput.commands` through `createLoop`.
- 3.3b waits for Epic 5 to merge. Story 5.1 delivers `vis_dragon` with a named jaw node and pivot, and does not create `dragon.ts`. 3.3b creates `dragon.ts` and wires it into Epic 5's `sync-mechanisms.ts`.
- 3.4, 3.6 and 3.9 feed 3.10's achievements, and 3.11 requires 3.1–3.10.
- 3.6 first fixes Loop detection: Loops never emit `_broken`, and two same-side orbits emit a spurious opposite-Loop `_made`.
- Epic 4's flasher and cue stories consume this epic's `ShowCommand`s and `FlasherCommand`s.
