# Epic 3 Context: The Campaign and the War

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 3 turns a complete game into the campaign the project exists for. It adds a real mode stack, the Lock and its arbiter, and the Dragon's mouth and hit reaction. On top of those come three campaign Modes (Hurry-up, Quick multiball, Joust) and the War: lock two balls under the Dragon and spell DRAGON, in either order, and the Mouth opens and fires them back with three balls in play. Ten Strikes win a progressive Jackpot. An extra-ball achievement menu follows, then the first full playtest, after which the scoring values and the Strike count freeze. The epic is judged by whether the dragon-fire moment lands for the author.

## Stories

- Story 3.0: Epic 2 Deferred Cleanup (done)
- Story 3.0a: Playfield scoring (done)
- Story 3.1: The mode stack (done)
- Story 3.2: Locking balls and the Lock arbiter
- Story 3.3: The Dragon's mouth and hit reaction
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
  - 3.0: the end-of-ball bonus counts DOWN while the score line rises from the pre-bonus score. Tilt spacing is one machine-wide debounce from the last bob closure of any kind; the settle mark is per player. A save's automatic re-launch never pays the skill shot.
  - 3.0a: pops, slings, each Spinner revolution and a completed DRAGON bank score for the current player. DRAGON letters are de-duplicated and persist per player.
  - 3.1: `sim/rules/ball-controller/` is a directory of modules (no longer one god-file). `modes/lifecycle.ts` is the only start/stop path; modes start in the same step as `ball_starting`; fan-out is event-major. A mode's lamp hooks are registered both on its definition and in `MODE_LAMP_ROLES`, kept in sync by a test. `runRulesScript` asserts every `modes` change comes from lifecycle events.
- **Tilt and scoring.** While Tilted nothing scores: no award, no DRAGON letter, no bonus credit, no skill-shot award. Nothing scores outside a game. During a multiball, a Tilt ends the ball when the last ball drains, and the Mode ends with it.
- **Campaign.** Ramp completions light Modes in the fixed order Hurry-up → Quick multiball → Joust, restarting once all three are played. A lit Mode starts at the Lock lane. With several lit, the ball stays parked while the flippers select inside `modeSelectMs`; Start, either flipper held, or expiry confirms. When a lock and a mode start both apply, the lock is credited first. `modesPlayed` is credited at `mode_<name>_started` for campaign Modes only — base and skill shot must never enter it (today every mode name is credited at ball end). No gating: escalation lives in fiction and scoring.
- **Hurry-up.** 250,000 decaying linearly to a 50,000 floor over 20 s, then holding. A Ramp shot collects it. Its timer keeps running under a multiball.
- **Joust.** Alternating Loops build a Charge (cap 10×) that multiplies the Loop award. Repeating a Loop or breaking one resets it to 1. The Spinner keeps scoring on its own.
- **Quick multiball.** Adds one ball with its own ball save; pays on Dragon hits and Ramp shots. A Lock-lane entry is a bash hit: no lock, no War, no mode start. It ends when one ball remains.
- **Locks.** Credits are per player, backed by one physical Lock. If the Lock is full of another player's balls it spits one and the credit still counts. The Lock insert is lit while the player can lock.
- **War.**
  - Starts the instant the player has both DRAGON spelled and two Lock credits, whichever completes last. The Mouth fires what the Lock holds and the trough tops up to three in play.
  - A Dragon hit or Lock-lane entry is a Strike; a full bank counts as `warStrikesPerBank` Strikes and still resets.
  - Ten Strikes pay the Jackpot: 500,000 + 500,000 × Wars started this game, per player; each further Strike re-pays it.
  - It ends at one ball: letters and credits reset, the Jackpot seed carries.
  - The War start is the brightest, loudest event: GI dims and every flasher fires.
- **Extra ball.** Lit the first time in a game by winning a War, reaching full Joust Charge, or having played every Mode. Collected at the Right Loop; the same player plays again with the ball number unchanged.
- **Scoring freeze.** After at least five recorded playtest games (two Wars, a Hurry-up collect, a full-Charge Joust, a Quick multiball), every scoring tunable moves to `confidence: playtested` and CI asserts it. The author records in `docs/feel-test.md` whether the War start landed.
- **Gates for every story:** `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`.

## Technical Decisions

- **One score gate.** Every score write goes through `sim/rules/scoring.ts`'s write helper, gated on `phase === 'game'` and not tilted; the same gate guards letters, bonus credit and the skill-shot award. Base scoring lives in the base mode (100); later modes never write `score` directly.
- **Mode stack (binds in full).**
  - Unique priorities, declared once: base 100, skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500. A duplicate is a dev-mode assertion.
  - Start/stop only via `mode_<name>_will_start → _starting → _started` and `_will_stop → _stopping → _stopped`; any direct path is a defect. Stop phases are pure and tuning-free, so ball end and Slam run them in place.
  - Fan-out is event-major: each device/shot event goes to every active mode in descending priority before the next event; a mode stopped by an event receives none of that tick's later events. No pending start lives outside `GameState`.
  - Scoring from all modes accrues; lamp roles combine by priority (higher wins per lamp); the Backglass shows the highest-priority `ModeView`. Modes never emit `CoilCommand`s or read raw switches. `modes[]` is empty before `ball_ended`.
- **Single arbiters.**
  - The Lock arbiter (`sim/rules/ball-controller/lock-arbiter.ts`) is the only consumer of `lock_lane_entered`; it emits exactly one of `lock_lane_locked`, `lock_lane_mode_start { candidates[] }`, `lock_lane_strike`, `lock_lane_spit`, and owns the mode-select window.
  - Only the arbiter pulses `c_mouth`, always `mouthOpenLeadMs` after `show_dragon_mouth_open`; `show_dragon_mouth_close` follows the last eject of a sequence.
  - Only the ball controller pulses `c_trough_eject`/`c_autolaunch` and mutates `ballsInPlay`.
  - "Multiball running" means `machine.multiball !== null`, set only in `_starting` and cleared only in `_stopped` of Quick multiball or the War.
  - Ball save is one device: `arm({ ticks, source })` / `disarm(source)`; sources stack, the longest live window wins, Tilt disarms all.
- **Ball accounting.** A Lock capture takes a ball out of play (not a drain). Ball search's Lock steps and a `bd_lock` overflow answer go through the arbiter; `c_mouth` is skipped while any mode publishes `timerTicks`.
- **State.**
  - `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }`, plain JSON, mutated only in `rules.step`. Player-scoped: score, letters, Lock credits, Modes lit/played, extra balls, Jackpot seed, Wars started. Mode timers and counters live under `modes[i]`, reaching presentation only as `ModeView` (`timerTicks`, `value`, `charge`, `strikesRemaining`).
  - Closure state in `create*()` factories is permitted only if reproducible from tick 0 and bounded; `GameState` is not a mid-game resume point. The inventory was re-derived at 3.1, but re-derive from code rather than trust any list.
  - Any new `GameState` or `machine` field moves every golden state hash and needs the author's grant.
- **Outputs.** Rules emit only `LampCommand { lamp, role, step }`, `GiCommand`, `FlasherCommand { flasher, ms }`, `ShowCommand`. Lamps are the pure projection `lampsOf(state, hurryUpTicks)`; `role ∈ {off, lit, hurryup, quickmb, joust, dragon, special}`, `step ∈ {0..3}`, never RGB. Semantic events are payload-complete (`war_strike { remaining, jackpot }`, `jackpot_awarded { value }`, `war_ended { player, strikes, won }`); rules never format text.
- **Tunables.** Every value lives in `sim/table/tuning.ts` with `source` and `confidence`; new values ship `unverified`. Timers authored in ms, converted to ticks once. Editing `source`/`confidence` needs a golden header re-record.
- **Determinism.** Rules are tested headless with the switch-script DSL; replay goldens assert the state hash. `tick` is not yet reset at game start (open, owned by 3.7). Device-name literals only in `sim/table/dragonwar.ts` and `test/**`.

## UX & Interaction Patterns

- Insert colour grammar: Hurry-up red (step 3 in its last `hurryUpUrgentMs`); Quick multiball green; Joust blue (next-expected Loop at step 2); Lock, letters and War orange (War inserts step 2, Jackpot ladder step 3); Extra ball purple.
- The Backglass shows the decaying Hurry-up value, CHARGE ×N, Mode-select candidates, Strikes remaining and the score row, from `ModeView` and events.
- The Dragon rig (`src/presentation/mechanisms/dragon.ts`) animates only from show commands, never from device slots or `ballsInPlay`: exactly open, close and hit, no idle; an overlapping hit restarts; the mouth is fully open before the first ball spawns.

## Cross-Story Dependencies

- Story 3.1's stack is the framework for 3.4–3.10; new modes register through it and its lifecycle.
- Story 3.2 (the arbiter) is required by 3.3, 3.4, 3.7 and 3.8; 3.8 precedes 3.9.
- Stories 3.4, 3.6 and 3.9 feed 3.10's achievements; 3.11 requires 3.1–3.10.
- Story 3.6 first fixes Loop shot detection: Loops never emit `_broken`, and two same-side orbits emit a spurious opposite-Loop `_made`.
- Epic 5 runs in parallel: its placeholder-geometry story supplies the Dragon mesh 3.3 rigs; its Dragon art story rebinds the same shows.
- Epic 4's flasher and cue stories consume the `ShowCommand`s and `FlasherCommand`s this epic emits.
