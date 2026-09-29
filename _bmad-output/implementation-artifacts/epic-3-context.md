# Epic 3 Context: The Campaign and the War

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 3 turns a complete game into the campaign the project exists for. It adds a real mode stack, the Lock and its arbiter, and the Dragon's mouth and hit reaction. On top of those come three campaign Modes (Hurry-up, Quick multiball, Joust) and the War: lock two balls under the Dragon and spell DRAGON, in either order, and the Mouth opens and fires them back with three balls in play. Ten Strikes win a progressive Jackpot. An extra-ball achievement menu follows, then the first full playtest, after which the scoring values and the Strike count freeze. The epic is judged by whether the dragon-fire moment lands for the author. Two inserted stories opened it and are done: 3.0 closed the Epic 2 defects the author had already decided, and 3.0a built the base playfield scoring every mode builds on.

## Stories

- Story 3.0: Epic 2 Deferred Cleanup (done)
- Story 3.0a: Playfield scoring (done)
- Story 3.1: The mode stack
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
  - 3.0: the end-of-ball bonus counts DOWN while the score line rises from the pre-bonus score. Tilt spacing is one machine-wide debounce from the last bob closure of any kind; the settle mark is per player. A launched skill shot closes with no award on the first playfield closure or on entry into any parking device, so a save's automatic re-launch never pays it.
  - 3.0a: pops, slings, each Spinner revolution and a completed DRAGON bank score for the current player. DRAGON letters are de-duplicated and persist per player.
- **Tilt and scoring.** While Tilted nothing scores: no switch or device award, no DRAGON letter, no bonus credit, no skill-shot award. Nothing scores outside a game. Tilt keeps the score and forfeits the bonus. During a multiball, a Tilt ends the ball when the last ball drains, and the Mode ends with it.
- **Campaign.** Ramp completions light Modes in the fixed order Hurry-up → Quick multiball → Joust, and the order restarts once all three have been played. A lit Mode starts at the Lock lane. With several lit, the ball stays parked while the flippers select inside `modeSelectMs`; Start, either flipper held, or the window expiring confirms. When a lock and a mode start both apply, the lock is credited first and the Mode runs with the newly served ball. No gating: escalation lives in fiction and scoring.
- **Hurry-up.** Starts at 250,000 and decays linearly to a 50,000 floor over 20 s, then holds at the floor. A Ramp shot collects it. Its timer keeps running under a multiball.
- **Joust.** Alternating Loops build a Charge (cap 10×) that multiplies the Loop award. Repeating a Loop or breaking one resets it to 1. The Spinner keeps scoring on its own.
- **Quick multiball.** Adds one ball with its own ball save and pays on Dragon hits and Ramp shots. A Lock-lane entry is a bash hit: no lock, no War, no mode start. It cannot start during the War, and it ends when one ball remains.
- **Locks.** Credits are per player, backed by one physical Lock (capacity 3). If the Lock is full of another player's balls it spits one and the credit still counts. The Lock insert is lit while the player can lock.
- **War.**
  - Starts the instant the player has both DRAGON spelled and two Lock credits, whichever completes last. The Mouth fires what the Lock holds and the trough tops up to three in play (in Hot seat an opponent's War may have emptied the Lock).
  - A Dragon hit or a Lock-lane entry is a Strike; a full bank counts as `warStrikesPerBank` Strikes and still resets.
  - Ten Strikes pay the Jackpot: 500,000 + 500,000 × Wars started this game, per player. Each further Strike re-pays it.
  - It ends at one ball: letters and credits reset, the Jackpot seed carries, and a second War must be earned again.
  - The War start is the brightest, loudest event: GI dims and every flasher fires.
- **Extra ball.** Lit the first time in a game by winning a War, reaching full Joust Charge, or having played every Mode. Collected at the Right Loop; the same player plays again with the ball number unchanged.
- **Scoring freeze.** After at least five recorded playtest games (covering two Wars, a Hurry-up collect, a full-Charge Joust and a Quick multiball), every scoring tunable moves to `confidence: playtested` and CI asserts it. The author records in `docs/feel-test.md` whether the War start landed.
- **Gates for every story:** `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`.

## Technical Decisions

- **One score gate.** Every score write goes through `sim/rules/scoring.ts`'s write helper, behind its gate (`phase === 'game'` and not tilted). The same gate guards DRAGON letters, bonus credit and the skill-shot award. Base playfield scoring lives in the base mode (priority 100); later modes add awards through the same helper and never write `score` directly.
- **Mode stack.**
  - Priorities are unique and declared once: base 100, skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500. A duplicate is a dev-mode assertion.
  - Story 3.1 generalises Epic 2's minimal stack. From then on, modes start and stop only through `mode_<name>_will_start → _starting → _started` and `_will_stop → _stopping → _stopped`; any direct path is a defect.
  - Every active mode receives every device and shot event, highest priority first; scoring from all accrues. Lamp roles combine by priority (higher wins per lamp); the Backglass shows the highest-priority `ModeView`.
  - Modes never emit `CoilCommand`s and never read raw switches; they consume only device and shot events. `modes[]` is empty before `ball_ended`.
- **Single arbiters.**
  - The Lock arbiter (`src/sim/rules/ball-controller/lock-arbiter.ts`) is the only consumer of `lock_lane_entered`. It emits exactly one of `lock_lane_locked`, `lock_lane_mode_start { candidates[] }`, `lock_lane_strike` or `lock_lane_spit`, evaluated multiball → lock (+mode) → mode → eject. It owns the mode-select window.
  - Only the arbiter pulses `c_mouth`. Every Mouth eject follows `show_dragon_mouth_open` by `mouthOpenLeadMs`; `show_dragon_mouth_close` follows the last eject of a sequence.
  - Only the ball controller pulses `c_trough_eject` and `c_autolaunch` and mutates `ballsInPlay`.
  - "Multiball running" means `machine.multiball !== null`, set only in `_starting` and cleared only in `_stopped` of Quick multiball or the War; never derived from `ballsInPlay`.
  - Ball save is one device: `arm({ ticks, source })` / `disarm(source)`. Sources stack, the longest live window wins, Tilt disarms all. A save's own re-serve never re-arms a window.
- **Ball accounting.** `ballsInPlay` counts balls launched and not yet arrived at any ball device; a Lock capture takes one out of play. Recovered balls return to the trough; strays are cleared before every serve; the machine always holds 4 balls. Ball search's Lock steps and a `bd_lock` overflow answer go through the arbiter; `c_mouth` is skipped while any mode publishes `timerTicks`.
- **State.**
  - `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }`, plain JSON, mutated only in `rules.step`.
  - Player-scoped: score, letters, Lock credits, Modes lit/played, extra balls, Jackpot seed, Wars started. Mode timers and counters live under `modes[i]` and reach presentation only as `ModeView` (`timerTicks`, `value`, `charge`, `strikesRemaining`).
  - Closure state outside `GameState` must be reproducible from tick 0 and bounded; the recorded inventory is stale, so re-derive it from code.
  - Any new `GameState` or `machine` field moves every golden state hash and needs the author's grant.
- **Outputs.** Rules emit only `LampCommand { lamp, role, step }`, `GiCommand`, `FlasherCommand { flasher, ms }` and `ShowCommand`. Lamps are the pure projection `lampsOf(state, hurryUpTicks)`; `role ∈ {off, lit, hurryup, quickmb, joust, dragon, special}`, `step ∈ {0..3}`, never RGB. Semantic events are payload-complete (`war_strike { remaining, jackpot }`, `jackpot_awarded { value }`, `war_ended { player, strikes, won }`); rules never format text.
- **Tunables.** Every value lives in `sim/table/tuning.ts` with `source` and `confidence`; new values ship `unverified`. Timers are authored in ms and converted to ticks once; no ms literal elsewhere in `sim/`. `source`/`confidence` are hashed into golden headers, so editing them needs a header re-record.
- **Determinism and testing.** Rules are tested headless with the switch-script DSL; replay goldens assert the state hash. `tick` is not yet reset at game start (open defect, owned by 3.7). Device-name literals only in `sim/table/dragonwar.ts` and `test/**`.

## UX & Interaction Patterns

- Inserts follow the colour grammar: Hurry-up red (step 3 in its last `hurryUpUrgentMs`); Quick multiball green; Joust blue (next-expected Loop at step 2); Lock, letters and War orange (War inserts step 2, Jackpot ladder step 3); Extra ball purple.
- The Backglass shows the decaying Hurry-up value, CHARGE ×N, the Mode-select candidates, Strikes remaining and the score row, from `ModeView` and events.
- The Dragon rig (`src/presentation/mechanisms/dragon.ts`) animates only from show commands, never from device slots or `ballsInPlay`. Exactly three animations (open, close, hit), no idle; an overlapping hit restarts the reaction; the mouth is fully open before the first ball spawns.

## Cross-Story Dependencies

- Story 3.1 is the framework for 3.4–3.10 and should decompose the ~1,300-line `ball-controller.ts` rather than grow it.
- Story 3.2 (the arbiter) is required by 3.3, 3.4, 3.7 and 3.8. Story 3.8 precedes 3.9.
- Stories 3.4, 3.6 and 3.9 feed 3.10's achievements; 3.11 requires 3.1–3.10.
- Story 3.6 depends on fixing Loop shot detection: Loops never emit `_broken`, and two consecutive same-side orbits emit a spurious opposite-Loop `_made`.
- Epic 5 runs in parallel: its placeholder-geometry story supplies the `vis_dragon` mesh 3.3 rigs, and its Dragon art story rebinds 3.3's animations through the same shows.
- Epic 4's flasher and cue stories consume the `ShowCommand`s and `FlasherCommand`s this epic emits.
