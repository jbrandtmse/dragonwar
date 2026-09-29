# Epic 3 Context: The Campaign and the War

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 3 turns a complete but scoreless game into the campaign the project exists for. It adds playfield scoring, a real mode stack, the Lock and its arbiter, and the Dragon's mouth and hit reaction. It adds three campaign Modes: Hurry-up, Quick multiball and Joust. It adds the War: lock two balls under the Dragon and spell DRAGON, in either order, and the Mouth opens and fires them back with three balls in play; ten Strikes win a progressive Jackpot. The epic ends with an extra-ball achievement menu and the first full playtest, after which the scoring values and the Strike count freeze. It is judged by whether the dragon-fire moment lands for the author. Two inserted stories open it. Story 3.0, now done, closed the Epic 2 defects the author had already decided. Story 3.0a builds the base playfield scoring that Epic 2 listed but never built (a browser playthrough scored 0 points), and every mode builds on it.

## Stories

- Story 3.0: Epic 2 Deferred Cleanup (done)
- Story 3.0a: Playfield scoring
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

- **Delivered by 3.0 (now the baseline):**
  - The end-of-ball bonus counts DOWN. The score line starts at the pre-bonus score and rises by what each step pays. A Slam stops the count. `bonusCountTicks` is at least 1, and the longest count fits inside the Backglass hold.
  - Tilt spacing is one machine-wide physical debounce that runs from the last bob closure of any kind. The settle mark is per player.
  - A launched skill shot closes with no award on the first playfield closure or on entry into any parking device, so it never pays on a ball save's automatic re-launch.
- **Base scoring.** Pops, slings, each Spinner revolution and a completed DRAGON bank score for the current player, only during a game and never under Tilt (author decision). DRAGON letters must not accumulate duplicates. Tilt keeps the score and forfeits the bonus.
- **Campaign.** Ramp completions light Modes in the fixed order Hurry-up → Quick multiball → Joust. The order restarts once all three have been played. A lit Mode starts at the Lock lane. When several are lit, the ball stays parked while the flippers select inside `modeSelectMs`. Start, either flipper held, or the window expiring confirms the selection. When a lock and a mode start both apply, the lock is credited first.
- **Hurry-up.** Starts at 250,000 and decays linearly to a 50,000 floor over 20 s, then holds at the floor. A Ramp shot collects it, and its timer keeps running under a multiball.
- **Joust.** Alternating Loops build a Charge (cap 10×) that multiplies the Loop award. Repeating the same Loop or breaking one resets the Charge. The Spinner keeps scoring on its own.
- **Quick multiball.** Adds one ball with its own ball save and pays on Dragon hits and Ramp shots. During it, a Lock-lane entry is a bash hit: no lock, no War and no mode start. It ends when one ball remains.
- **Locks.** Lock credits are per player and backed by one physical Lock of capacity 3. If the Lock is full of another player's balls, it spits one and the credit still counts. The Lock insert is lit while the player can lock.
- **War.** Starts the instant the player has both DRAGON spelled and two Lock credits, whichever completes last. The Mouth fires what the Lock holds, and the trough tops up to three in play (in Hot seat, an opponent's War may have emptied the Lock).
  - A Dragon hit or a Lock-lane entry is a Strike, and a full bank counts as `warStrikesPerBank` Strikes.
  - Ten Strikes pay the Jackpot: 500,000 + 500,000 × Wars started this game, per player. Each further Strike pays it again.
  - The War ends at one ball, which resets the letters and credits. The Jackpot seed carries over, and a second War must be earned again.
  - The War start is the brightest, loudest event: GI dims and every flasher fires.
- **Extra ball.** Each achievement lights it the first time it happens in a game: winning a War, reaching full Joust Charge, or playing every Mode. It is collected at the Right Loop, and the same player plays again with the ball number unchanged.
- **Scoring freeze.** After at least five recorded playtest games (covering two Wars, a Hurry-up collect, a full-Charge Joust and a Quick multiball), every scoring tunable moves to `confidence: playtested` and CI asserts it. The author records in `docs/feel-test.md` whether the War start landed.
- **Gates for every story:** `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`.

## Technical Decisions

- **Mode stack.**
  - Priorities are unique and declared once: base 100, skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500. A duplicate is a dev-mode assertion.
  - Story 3.1 generalises Epic 2's minimal stack. From then on, modes start and stop only through the six lifecycle events: `mode_<name>_will_start`, `_starting`, `_started`, `_will_stop`, `_stopping` and `_stopped`. Any direct start/stop path is a defect.
  - Every active mode receives every device and shot event, highest priority first, and scoring from all of them accrues. The Backglass shows the highest-priority `ModeView`.
  - Modes never emit `CoilCommand`s and never read raw switches: they consume only device and shot events from the devices layer. `modes[]` is empty before `ball_ended`.
- **Single arbiters.**
  - The Lock arbiter in `src/sim/rules/ball-controller/lock-arbiter.ts` is the only consumer of `lock_lane_entered`. It emits exactly one of `lock_lane_locked`, `lock_lane_mode_start { candidates[] }`, `lock_lane_strike` or `lock_lane_spit`, evaluated in the order multiball → lock (+mode) → mode → eject.
  - Only the arbiter pulses `c_mouth`. Every Mouth eject follows `show_dragon_mouth_open` by `mouthOpenLeadMs`, and `show_dragon_mouth_close` follows the last eject of a sequence.
  - Only the ball controller pulses `c_trough_eject` and `c_autolaunch` and mutates `ballsInPlay`.
  - "Multiball running" means `machine.multiball !== null`. It is set only in `_starting` and cleared only in `_stopped` of Quick multiball or the War, and is never derived from `ballsInPlay`.
  - Ball save is one device: `machine.ballSave.arm({ ticks, source })` / `disarm(source)`. Sources stack, the longest live window wins, and Tilt disarms them all. A save's own re-serve never re-arms a window.
- **Ball accounting.**
  - `ballsInPlay` counts balls launched and not yet arrived at any ball device. A parking entry, such as a Lock capture, takes one out of play.
  - A recovered ball goes back to the trough; it is not destroyed. Strays are cleared before every serve, and the machine always holds 4 balls.
  - Ball search's Lock steps go through the arbiter. `c_mouth` is skipped while any mode publishes `timerTicks`. The arbiter answers a `bd_lock` `device_overflow` with an eject after the lead time.
- **State.**
  - `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }` is plain JSON and is mutated only in `rules.step`.
  - Player-scoped: score, letters, Lock credits, `modesLit`/`modesPlayed`, extra balls, the Jackpot seed and `warsStarted`.
  - Mode timers and counters live under `modes[i]` and are published only as `ModeView` (`value`, `timerTicks`, `charge`, `strikesRemaining`).
  - Closure state outside `GameState` must be reproducible from tick 0 and bounded. The documented inventory is stale, so re-derive it from the code.
  - `ball-controller.ts` is about 1,300 lines, so decompose it rather than growing it further.
- **Outputs.**
  - Rules emit only `LampCommand { lamp, role, step }`, `GiCommand`, `FlasherCommand { flasher, ms }` and `ShowCommand`.
  - Lamps are the pure projection `lampsOf(state, hurryUpTicks)`, with modes contributing roles by priority (the higher priority wins per lamp). `role ∈ {off, lit, hurryup, quickmb, joust, dragon, special}` and `step ∈ {0..3}`, never RGB.
  - Semantic events are payload-complete (`war_strike { remaining, jackpot }`, `jackpot_awarded { value }`, `war_ended { player, strikes, won }`), and rules never format text.
- **Tunables.**
  - Every tunable lives in `sim/table/tuning.ts` with `source` and `confidence`, and new values ship `unverified`.
  - Timers are authored in ms and converted to ticks once at load; no millisecond literal may appear elsewhere in `sim/`.
  - `source` and `confidence` are part of the hashed contract, so any edit to them needs a golden header re-record.
  - Any new `GameState` or `machine` field moves every golden state hash and needs the author's grant.
- **Determinism and testing.**
  - Rules are tested headless with the switch-script DSL, and physics parity is tested with replay goldens (state hash).
  - `tick` is not yet reset at game start (open defect, owned by 3.7).
  - Device-name literals are allowed only in `sim/table/dragonwar.ts` and `test/**`.

## UX & Interaction Patterns

- Inserts follow the fixed colour grammar:
  - red for Hurry-up, at step 3 in its last `hurryUpUrgentMs`
  - green for Quick multiball
  - blue for Joust, with the next-expected Loop at step 2
  - orange for the Lock, the letters and the War: War inserts at step 2, the Jackpot ladder at step 3
  - purple for Extra ball
- The Backglass shows the decaying Hurry-up value, CHARGE ×N, the Mode-select candidates, Strikes remaining and the score row, all from `ModeView` and events.
- The Dragon rig (`src/presentation/mechanisms/dragon.ts`) animates only from show commands, never from device slots or `ballsInPlay`. It has exactly three animations (open, close and hit) and no idle animation. An overlapping hit restarts the hit animation. The mouth must be fully open before the first ball spawns.

## Cross-Story Dependencies

- Story 3.0a comes next, and every scoring mode builds on it. Story 3.1 is the framework for 3.4–3.10.
- Story 3.2 (the arbiter) is required by 3.3, 3.4, 3.7 and 3.8. Story 3.8 precedes 3.9.
- Stories 3.4, 3.6 and 3.9 feed 3.10's achievements, and 3.11 requires 3.1–3.10.
- Story 3.6 depends on fixing Loop shot detection. Loops never emit `_broken`, and two consecutive orbits on the same side emit a spurious `_made` for the opposite Loop.
- Epic 5 runs in parallel. Its visible-placeholder story adds the `vis_dragon` placeholder that 3.3 rigs. The later Dragon art story rebinds 3.3's animations to the sculpted mesh through the same shows.
- Epic 4's flasher and cue stories consume the `ShowCommand`s and `FlasherCommand`s this epic emits.
