# Epic 3 Context: The Campaign and the War

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 3 turns a complete-but-scoreless game into the campaign the project exists for: playfield scoring, a real mode stack, the Lock and its arbiter, the Dragon's mouth and hit reaction, three campaign Modes (Hurry-up, Quick multiball, Joust), and the War: lock two balls under the Dragon and spell DRAGON in either order, and the Mouth opens and fires them back with three balls in play; ten Strikes win a progressive Jackpot. It ends with an extra-ball achievement menu and the first full playtest, after which scoring values and the Strike count freeze. The epic is judged by whether the dragon-fire moment lands for the author. It opens with two inserted stories: cleanup of the Epic 2 defects the author has already decided, and the base playfield scoring that Epic 2 listed but never built. A browser playthrough scored 0 points, and every mode builds on that scoring.

## Stories

- Story 3.0: Epic 2 Deferred Cleanup
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

- **Base scoring.** Pops, slings, each Spinner revolution and a completed DRAGON bank score for the current player, only during a game and never under Tilt. The author has decided that scoring stops under Tilt. DRAGON letters must not accumulate duplicates. Tilt keeps the score and forfeits the bonus.
- **Campaign.** Ramp completions light Modes in the fixed order Hurry-up → Quick multiball → Joust, which restarts once all three have been played. A lit Mode starts at the Lock lane. With several lit, the ball stays parked while the flippers select inside `modeSelectMs`, and Start, either flipper held, or the window expiring confirms. When a lock and a mode start both apply, the lock is credited first.
- **Hurry-up.** Starts at 250,000 and decays linearly to a 50,000 floor over 20 s, then holds at the floor. A Ramp shot collects it. Its timer keeps running under a multiball.
- **Joust.** Alternating Loops build a Charge (cap 10×) that multiplies the Loop award. Repeating the same Loop or breaking a Loop resets the Charge. The Spinner keeps scoring independently.
- **Quick multiball.** Adds one ball with its own ball save and pays on Dragon hits and Ramp shots. A Lock-lane entry during it is a bash hit: no lock, no War, no mode start. It ends when one ball remains.
- **Locks.** Lock credits are per player and backed by one physical Lock of capacity 3. If the Lock is full of another player's balls it spits one, and the credit still counts. The Lock insert is lit while the player can lock.
- **War.** Starts the instant the player has both DRAGON spelled and two Lock credits, whichever completes last. The Mouth fires what the Lock holds, and the trough tops up to three in play (Hot-seat case: an opponent's War may have emptied the Lock). A Dragon hit or a Lock-lane entry is a Strike, and a full bank counts as `warStrikesPerBank` Strikes. Ten Strikes pay the Jackpot (500,000 + 500,000 × Wars started this game, per player), and each further Strike re-pays it. The War ends at one ball, resetting letters and credits. The Jackpot seed carries over, so a second War must be earned again. The War start is the brightest, loudest event: GI dims, every flasher fires.
- **Extra ball.** Lit by the first occurrence per game of each achievement (win a War, reach full Joust Charge, play every Mode) and collected at the Right Loop. The same player plays again with the ball number unchanged.
- **Scoring freeze.** After at least five recorded playtest games (two Wars, a Hurry-up collect, a full-Charge Joust, a Quick multiball), every scoring tunable moves to `confidence: playtested` and CI asserts it. The author records in the feel-test document whether the War start landed.
- **Gates for every story:** `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`.

## Technical Decisions

- **Mode stack.** Priorities are unique and declared once: base 100, skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500. A duplicate is a dev-mode assertion. Story 3.1 generalises Epic 2's minimal stack. From then on, start and stop go only through the six lifecycle events `mode_<name>_will_start/_starting/_started` and `_will_stop/_stopping/_stopped`, and any direct start/stop path is a defect. Every active mode receives every device and shot event, highest priority first, and scoring from all of them accrues. The Backglass shows the highest-priority `ModeView`. Modes never emit `CoilCommand`s and never read raw switches: they consume only device and shot events from the devices layer. `modes[]` is empty before `ball_ended`.
- **Single arbiters.** The Lock arbiter in `src/sim/rules/ball-controller/lock-arbiter.ts` is the only consumer of `lock_lane_entered`. It emits exactly one of `lock_lane_locked`, `lock_lane_mode_start { candidates[] }`, `lock_lane_strike` or `lock_lane_spit`, evaluated in the order multiball → lock (+mode) → mode → eject. Only the arbiter pulses `c_mouth`. Every Mouth eject follows `ShowCommand show_dragon_mouth_open` by `mouthOpenLeadMs`, and the last eject of a sequence is followed by `show_dragon_mouth_close`. Only the ball controller pulses `c_trough_eject` and `c_autolaunch` and mutates `ballsInPlay`. "Multiball running" means `machine.multiball !== null`, which is set only in `_starting` and cleared only in `_stopped` of Quick multiball or the War, never derived from `ballsInPlay`. Ball save is one device: `machine.ballSave.arm({ ticks, source })` / `disarm(source)`. Sources stack, the longest live window wins, and Tilt disarms them all.
- **Ball search at the Lock** (inherited from Story 2.12). Lock steps go through the arbiter. `c_mouth` is skipped while any mode publishes `timerTicks`. A `bd_lock` `device_overflow` is answered by an arbiter eject after the lead time.
- **State.** `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }` is plain JSON and is mutated only in `rules.step`. The following are player-scoped: score, letters, Lock credits, `modesLit`/`modesPlayed`, extra balls, Jackpot seed and `warsStarted`. Mode timers and counters live under `modes[i]` and are published only as `ModeView` (`value`, `timerTicks`, `charge`, …). Closure state outside `GameState` is allowed only if it is reproducible from tick 0 and bounded. The documented inventory is stale, so re-derive it from the code. `ball-controller.ts` has grown to about 1,300 lines, so decompose it rather than growing it further.
- **Outputs.** Rules emit only `LampCommand { lamp, role, step }`, `GiCommand`, `FlasherCommand { flasher, ms }` and `ShowCommand`. Lamps are the pure projection `lampsOf(state, hurryUpTicks)`, with modes contributing roles by priority (higher wins per lamp). `role ∈ {off, lit, hurryup, quickmb, joust, dragon, special}` and `step ∈ {0..3}`, never RGB. Semantic events are payload-complete (`war_strike { remaining, jackpot }`, `jackpot_awarded { value }`, `war_ended { player, strikes, won }`, …), and rules never format text.
- **Tunables.** Every tunable lives in `sim/table/tuning.ts` with `source` and `confidence`. New values ship `unverified`. Timers are authored in ms and converted to ticks once at load, and no millisecond literal may appear elsewhere in `sim/`. `source`/`confidence` are part of the hashed contract, so any edit there needs a golden header re-record. Any new `GameState`/`machine` field moves every golden state hash and needs the author's grant.
- **Determinism and testing.** Rules are tested headless with the switch-script DSL. Physics parity is tested with replay goldens (state hash). `tick` should reset at game start (open defect). Device-name literals are allowed only in `sim/table/dragonwar.ts` and `test/**`.

## UX & Interaction Patterns

- Inserts follow the fixed colour grammar: red for Hurry-up (step 3 in its last `hurryUpUrgentMs`), green for Quick multiball, blue for Joust (next-expected Loop at step 2), orange for Lock, letters and the War (War inserts at step 2, Jackpot ladder at step 3), and purple for Extra ball.
- The Backglass shows the decaying Hurry-up value, CHARGE ×N, the Mode-select candidates, Strikes remaining and the score row, all from `ModeView`/events.
- The Dragon rig (`src/presentation/mechanisms/dragon.ts`) animates only from show commands, never from device slots or `ballsInPlay`. It has exactly three animations: open, close and hit (overlapping hits restart it), with no idle animation. The mouth must be fully open before the first ball spawns.

## Cross-Story Dependencies

- Stories 3.0 and 3.0a come first. 3.1 is the framework for 3.4–3.10. 3.2 (arbiter) is required by 3.3, 3.4, 3.7 and 3.8. 3.8 precedes 3.9. 3.6 and 3.9 feed 3.10's achievements, and 3.11 requires 3.1–3.10.
- Story 3.6 depends on fixing Loop shot detection: Loops never emit `_broken`, and consecutive same-side orbits emit a spurious opposite-Loop `_made`.
- Epic 5 runs in parallel. Its visible-placeholder story adds the `vis_dragon` placeholder that 3.3 rigs, and the later Dragon art story rebinds 3.3's animations to the sculpted mesh by the same shows. Epic 4's flasher and cue stories consume the `ShowCommand`/`FlasherCommand`s this epic emits.
