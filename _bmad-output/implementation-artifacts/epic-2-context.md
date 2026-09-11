# Epic 2 Context: A Complete Game on the Real Shot Map

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 2 makes a stranger able to play a full 1–4 player game with no instructions. It covers the real shot map, every device with reliable switches, and the standard game on top of them, all read from a DMD Backglass and inserts lit in the fixed colour grammar. Delivered so far: the geometry, physics, device vocabulary, lifecycle, display, lamps, ball save, bonus, tilt warnings, Tilt and Slam tilt. The epic stands at 17 of 20. On 2026-09-11, at Story 2.12's spec gate, the author's decisions amended the planning text: Story 2.12's and Story 3.2's blocks, and spine AD-4, AD-5, AD-18 and AD-19. Two follow-up edits the same day closed conflicts the previous compile flagged: Story 2.11's AC 2 now matches AD-5, and AD-19's reset-trigger list now names ball search's request. This compile reflects all of it. Three stories remain:
- **ball search**, so that a stuck ball never ends a game;
- **Match, game over and the return to a minimal Attract**, so that the game closes the way a real machine does;
- **the lit Top lane rotation**, a chartered correction to the skill shot.

## Stories

- Story 2.0: Epic 1 Deferred Cleanup *(done)*
- Story 2.1a: The drain triangle, the cradle pocket and the flipper's real dimensions *(done)*
- Story 2.1b: The full shot map and the switch set *(done)*
- Story 2.1c: The Loop returns and the inlane feed *(done)*
- Story 2.1d: Device behaviour and guide terminations *(done)*
- Story 2.1e: Every shot case proves its own start point is reachable *(done)*
- Story 2.1f: The bottom-right corridor — the Ramp and the DRAGON bank made reachable *(done)*
- Story 2.2: Slingshots and pop bumpers as hardware rules *(done)*
- Story 2.3: Drop targets, the spinner and the Lock in physics *(done)*
- Story 2.4: The devices-and-shots layer *(done)*
- Story 2.5: Start, Hot seat and the ball lifecycle *(done)*
- Story 2.6: The DMD Backglass *(done)*
- Story 2.7: Plunge, Skill shot and lane change *(done)*
- Story 2.8: Inserts in the held colour grammar *(done)*
- Story 2.9: Ball save *(done)*
- Story 2.10: End-of-ball bonus and the multiplier *(done)*
- Story 2.11: Tilt warnings, Tilt and Slam tilt *(done)*
- Story 2.12: Ball search ← **next** (re-plan after the 2026-09-11 decisions)
- Story 2.13: Match, game over and return to Attract
- Story 2.14: The lit Top lane — rotation, and when it may move

## Requirements & Constraints

**Ball search (2.12), as amended 2026-09-11.**
- **Start.** If no switch closes for `ballSearchMs` (the PRD's 15 s, marked as an assumption) while a ball is in play, `ball_search_started` fires. The ball controller then pulses coils on a tick schedule: **slings, pops, bank reset, then the shooter and trough ejects**.
- **The Lock is skipped until Story 3.2.** Ball search issues **nothing** at `bd_lock`'s `ballSearchOrder` steps. The Lock arbiter, `show_dragon_mouth_open` and `mouthOpenLeadMs` do not exist yet, so nothing may pulse `c_mouth` at all.
  - The old "skip `c_mouth` while an active mode publishes `timerTicks`" criterion is **no longer 2.12's**. It moved verbatim to Story 3.2.
  - Nothing is lost meanwhile. A ball parked in `bd_lock` is out of the simulation and counted by its closed slot switch, so it is never missing.
- **Final stage.** `RecoverCommand` is issued **exactly once**. Physics despawns every ball outside a device and returns a `recovered` count. `ball_missing { count }` fires, `ballsInPlay` is corrected from slot switches, and a new ball is served.
- **Cancel.** Any switch closure during the search cancels it and restarts the timer.
- **Failures.** Rules handle `eject_failed`, `ball_missing`, `broken` and `device_overflow` without throwing. `device_overflow` is answered with an immediate eject from that device, **except `bd_lock`**, whose overflow is **tolerated without an eject** until Story 3.2's arbiter owns the Mouth.
- **DW-187 is IN 2.12's scope (author decision, 2026-09-11).** Its effective severity is MED: a hard hang a player can reach today with two weak plunges.
  - The defect: a weak manual plunge emits one `ball_launched`, and the ball rolls back onto the plunger tip still counted in play. A second launch of the same ball counts it twice. After its drain, `ballsInPlay` stays 1 with no ball and no `ball_ended`.
  - The mechanism: `applyDeviceEvents` increments on every `ball_launched` and never decrements on a non-parking arrival.
  - **Pinning test (Rule 19): the lead's two-weak-plunge probe.** Drive `createLoop()` at `NO_BALL_SAVE` tuning and production pitch: Start, a 20-tick plunge, the roll-back to `deviceSlots.bd_shooter [true]`, a full plunge of the same ball, then the drain.
    - It must be seen **RED on today's code**: `ballsInPlay` reads 1 after the roll-back, 2 after the second launch, 1 after the drain, and no `ball_ended` arrives.
    - It must be **green after** the fix.
  - **A golden trajectory re-record is pre-authorised** if the fix moves one, on the standing condition: traced correct, and each golden still asserts its own subject, verified structurally field by field. A header-only refresh needs no grant. A moved state hash with no traced cause is still a HALT.
- **DW-241 is decided by-design.** The manual plunger stays live under Tilt, game over and Attract (AD-5, below). 2.12 must not disable `c_autolaunch` anywhere. The spec gate also ruled out three tilt additions: a tilted-recovery ball end, an end-on-shooter-arrival while tilted, and a `c_autolaunch` re-enable in `startBall()`.
  - Story 2.11's AC 2 was corrected to match (its change log, 2026-09-11; no code change). Tilt's `CoilCommand disable` batch covers the flippers, slings and pops. The autolaunch is **suppressed by rules** while tilted, not coil-disabled. At this tree that suppression is the ball controller's `!tilt.tilted && phase === 'game'` guard on the save's `c_autolaunch` pulse.
- **DW-244 is NOT decided.** It concerns Start's meaning when balls are not home. Do not design Start semantics in 2.12; fence it in the spec's `Never`.
- **Tunables.** The same gate approved `ballSearchMs` 15000 (from the PRD) and `ballSearchStepMs` 250 (authored), relayed in the spec's author decisions. Neither exists in `TUNING` yet.
- **The research's framing.** Ball search is an escalating protocol with a defined failure action, and real machines suppress the parts of it that would corrupt rules state.

**Match, game over, Attract (2.13).**
- When the last ball of the last player ends, the phase becomes `game_over`, the Backglass shows final scores by player, and `game_ended { scores[] }` fires.
- Match draws a multiple of ten, 00–90, from `GameState.rng`. The odds of matching at least one player's last two score digits equal the configured probability; the default of 8% is a deliberate choice, not a sourced figure.
- `match_drawn { number, winners[] }` fires. The reveal is paced by `matchRevealMs` step events, and a win shows MATCH. Under free play the award is display-only.
- After Match, `attractMs` or Start moves the machine to Attract (or starts a new game). Hardware is disabled, `modes[]` is empty, and `players[]` is cleared on the next Start.
- Attract cycles the last scores and shows the flipper, plunge and Start keys once, from `ViewConfig.bindings`.
- Two ledger entries are routed here with the author's decisions:
  - **DW-197** (no line budget): the ball number gets a shared or shortened line rather than a line of its own.
  - **DW-198** (`DmdRow.emphasis` is never rendered): the current player's row is rendered highlighted or boxed. The author's binding condition is that the pinning test asserts **the rendered DOTS differ** between an emphasised and an unemphasised row. The named mutation is to force emphasis false and see the dot buffer change.

**Lit Top lane (2.14).** The author decided the whole form (DW-205, DW-214):
- The starting position is drawn **once per game** from `GameState.rng`.
- From there the lit lane advances deterministically one lane per plunge through `TOP_LANES`, wrapping. A three-ball repeat is then impossible *by construction*.
- A fixed start was explicitly rejected, because it would leave `GameStart.seed` with no observable effect anywhere.
- The not-all-same property is re-pinned for **every** starting position, and a mutation that freezes the advance must turn it red.
- The DW-201 block in `test/rules-modes-integration.test.ts` is the only mutation-proven evidence that the seed reaches `rng`. It is preserved, rewritten rather than deleted, or retired with a named replacement.
- **Tension to reconcile at planning:** Story 2.14's AC 4 says Story 2.7 AC 5 and `spec-2-7` AC 6 are both amended in the same commit. DW-214's later author note says the seeded-start form keeps 2.7 AC 5 true *verbatim*. Both artifacts must end up describing the game the code plays.

**Standing constraints for every remaining story.**
- **Baselines. Re-measure at your own tree; never transcribe these.**
  - Suite at 2.11's close: 117 files / 1971 tests / 0 skipped, with `BLENDER` exported. State whether it was exported; with it unset, cases skip rather than fail.
    - This compile verified that `src/`, `test/` and `tools/` are unchanged since that close (`e17350b`); only planning and bookkeeping files moved.
  - The five goldens share `tableHash 8838dd46`, `assetHash ab163ff` and `physicsVersion v1-ce6772ef`, re-measured at this compile.
  - The spine is `final`, updated 2026-09-11, with 19 ADs. Today's four amendments claimed no id, so **AD-20** is still the next free id.
  - The vacuity count is **64**. 2.11 alone added 13, and every one was a *negative assertion whose positive was never established*, or a self-comparison. Check for that shape first at every gate.
- **Every gate is expected green; a red one is a regression.**
  - `check:ad7` exits 0 with **exactly 3** passing tests. It also pins that `sim/loop`'s `state` binding has exactly two writes, so the loop can never advance a `GameState` field.
  - `check:corridor` and `check:reachability` both exit 0.
- **Anti-vacuity rules this epic paid for:**
  - Any "nothing is emitted" assertion needs an established precondition that something *could* have been emitted. This now applies to 2.12's "nothing issued at the Lock" and "Lock overflow tolerated".
  - Boundary probes must sit **on** the bound. The project's tick windows are all inclusive `<=`.
  - A recorded mutation is a property of a tree: editing its line voids it.
  - State the expected red before running a mutation.
  - Pin a new tunable at its **production** magnitude, by consequence, never under an override tuning.
  - A headless test that *scripts* the consequence it observes proves nothing. Pair it with a real `createLoop` integration case driven by real input.
  - A test that drives a ball to its end runs at `NO_BALL_SAVE_TUNING` and asserts `ball_ended` actually **arrived**. A live save returns early from the entire drain branch.
- **Every new tunable is a golden-header cost.**
  - `ballSearchMs`, `ballSearchStepMs`, `attractMs` and `matchRevealMs` do not exist in `TUNING` today.
  - Each is built with `entry(value, source, confidence)` and listed in the `scalarKeys` ratchet. A `…Ms` key is top-level only and adds two header blocks: itself and its derived `…Ticks` sibling.
  - A header-only refresh of all five goldens is routine and needs no grant. Build the harness in the scratchpad, never under `test/`. Verify by parsing JSON per field, never by grep, and append to `notes`.
- **Match has a naming mismatch to resolve, not paper over.** The planning text (the 2.13 AC and AD-15's tunables list) says `matchPercent` (default 8). The shipped contract field is `GameAdjustments.matchProbability`, set to `0.08` in `DEFAULT_ADJUSTMENTS` and the real boot path; all five golden headers carry `0`. AD-14 binds adjustments to *apply at the next game*.
- **English literals live only in `presentation/backglass`; rules never format text.**
- **Provenance is a hard gate.** An attribution entry lands before any third-party file.

## Technical Decisions

**The four ADs amended 2026-09-11 for 2.12, near-verbatim.**
- **AD-4, the loop contract.** "`rules.step` gains an optional fourth argument, the **machine report**: physics' `recovered` count from a `RecoverCommand` (the sequence below already returns it to the loop) and physics' device failure events (`eject_failed`, `device_overflow`), so ball search can reconcile `ballsInPlay` (AD-6) and rules can answer device failures without throwing; omitted, the call is exactly the three-argument form above."
  - Unchanged around it: physics consumes the commands issued at the previous tick, so a coil command takes effect on the **next** tick.
- **AD-5, hardware rules gated by coil enable.** The coil list names `c_flipper_l`, `c_flipper_r`, `c_sling_l`, `c_sling_r` and `c_pop_*`, gated only by `CoilCommand enable | disable`. The amendment reads:
  - "the manual plunger shares the autolauncher's serving coil, `c_autolaunch` (the physics step gates the manual plunge on `c_autolaunch`'s enable). That coil is a ball-serving coil — `bd_shooter`'s `ballSearchOrder` pulse step — and is outside `HARDWARE_COILS` by design (DW-74: a disable batched with a serve pulse would swallow the serve). So Tilt, game over and Attract disable the flippers, slingshots and pop bumpers together and leave the manual plunger live. This fills a gap the Rule left; it reverses nothing."
  - The deciding measurement: "a disabled `c_autolaunch` swallows ball search's shooter pulse and a ball on the plunger tip counts as inside `bd_shooter`, so no search could recover it."
  - Physics drops a `pulse` to a disabled coil, so after a Tilt or game over a search pulse on a sling or pop coil is a no-op.
- **AD-18, single arbiters, with phasing recorded.** "This Rule's Lock clauses bind from Story 3.2, which builds the Lock arbiter, `show_dragon_mouth_open` and `mouthOpenLeadMs`; before it nothing may pulse `c_mouth` at all, because nothing can satisfy the Mouth-open lead. Ball search (Story 2.12) therefore issues nothing at `bd_lock`'s `ballSearchOrder` steps, and a `bd_lock` `device_overflow` is tolerated without an eject."
  - Unchanged: "**Ball save** is one machine device, `machine.ballSave`, owned by the ball controller … Tilt disarms all; only the ball controller pulses `c_trough_eject` and `c_autolaunch` and mutates `ballsInPlay`."
  - "A multiball is running" means `machine.multiball !== null`, never derived from `ballsInPlay`.
- **AD-19, the devices layer as sole switch consumer.** It owns the drop bank (letters and the reset coil). The amendment adds: "the drop-bank component remains the ONLY caller of `c_dragon_bank_reset`; ball search *requests* a bank reset through it and never pulses the coil itself."
  - The Rule's trigger list is now complete: the drop-bank component pulses `c_dragon_bank_reset` "on `ball_will_start`, on `bank_completed`, and on ball search's reset request (Story 2.12)".
  - At this tree `sim/rules/devices/drop-bank.ts` exposes only `step()` and `onBallWillStart()`, and its header names two triggers. 2.12 adds the request entry point there and must never emit the coil from the ball controller.

**The ADs that bind ball search, unchanged.**
- **AD-6.** "Physics owns ball bodies and mechanical state; rules own ball accounting; devices park and eject only on command." The machine carries 4 balls.
  - Parking devices `bd_trough` and `bd_lock` park an entering ball unconditionally and eject from the highest filled slot, one ball per `pulse`. `bd_shooter` is non-parking; the opening of `s_shooter_lane` is the one event that means "plunged".
  - "Device counts in `GameState` are the number of closed slot switches and nothing else; rules enforce capacity and answer a slot beyond it (`device_overflow`) with an immediate eject." AD-18's phasing excepts `bd_lock` until 3.2.
  - "its final stage issues `RecoverCommand`, the one command that lets physics despawn every ball outside a device; physics returns the `recovered` count from `step()` and the ball controller emits `ball_missing { count }`."
- **AD-9, the closed command union.** The rules→physics commands are `CoilCommand { coil, action }` (a device eject is `pulse` on the device's `ejectCoil`) and `RecoverCommand { type: 'recover', tick }`, "ball search only". Every semantic event is payload-complete, and presentation never joins an event to the snapshot.

**What 2.12 will find at this tree (verified at this compile):**
- **`RecoverCommand` is a contract declaration only.** Physics `step()` accepts `CoilCommand[]` and returns no `recovered` count. The loop calls `rules.step(state, switchEvents, tick)`, so rules never see physics' `eject_failed` or `device_overflow`. 2.12 builds the handler, the count and the AD-4 machine report, whose type belongs in `sim/contracts`.
- **`ballSearchOrder` is declared only on the three ball devices:**
  - trough: `pulse c_trough_eject` ×2, then `recover`;
  - shooter: `pulse c_autolaunch`, then `recover`;
  - lock: `pulse c_mouth` ×2, then `recover`. **Must not be issued before 3.2.**
- **`TABLE.popWiring` exists and `TABLE.slingWiring` does not.** The draft spec also measured that a commanded sling pulse is **physically inert**: physics has no commanded-pulse response for a slingshot, and a resting ball sits just outside each sling's switch zone. It is deferred there as low.
- **`HARDWARE_COILS` is derived as a complement**: every coil that is neither a ball-device eject coil nor a `ballSearchOrder` pulse step, minus the bank reset. So `c_autolaunch` and `c_mouth` are never in a disable batch, which AD-5 now ratifies for `c_autolaunch`. A `disable` batched with a `pulse` for the same coil swallows the pulse (DW-74).
- **`ball_search_started` is not in the `SemanticEvent` union.** `ball_missing`, `eject_failed`, `broken` and `device_overflow` are. Each new event owes a `describeEvent` arm with an executing assertion.
- **"Any switch closes" (AC 4) still has to name which closures count.** The derived `playfield_switch_closed` set (28 switches) excludes device slots, the shooter entry and the tilt-bob and slam events. It must also cover closures the search's own pulses cause.
- **Recovered balls are never replenished.** Only a parking eject spawns a ball, so each recovery shrinks the 4-ball machine for the session. Once the trough is empty, a serve answers `eject_failed`. The draft spec defers this as low, matching a real machine.

**Rules composition.**
- `rules.step()` runs in this order: devices layer → device-event accounting → **tilt stage** (`sim/rules/tilt.ts`) → bonus credit → **ball controller** → mode stack → `advanceBonusMultiplier`.
- The tilt stage runs before the controller so that a Tilt engaging on a given tick is seen by the save, autolaunch and bonus guards on that same tick.
- Pick a seat for the search timer and for the machine-report fold deliberately, and say why.

**AD-7, as currently amended and corrected.**
- `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }`, JSON-serializable, mutated only inside `rules.step`.
- `ball_will_start` resets `ballSave`, `tilt` and `multiball`; `ball_starting` enables hardware.
- **Rules controllers hold tick-scoped closure state outside `GameState`, and the spine records this as a *class*, not a list.** Re-derive the inventory from every mutable binding in a `create*()` factory under `sim/rules/`. At 2.11 it held at least ten fields:
  - ball controller: `awaitingSaveLaunch`, `awaitingSaveRelaunch`, `pendingBonusCountSteps`;
  - tilt controller: `lastBobClosureTick`, `lastWarningTick`;
  - rules root: `pendingLifecycleEvents`;
  - modes: `pendingStartPlayer`;
  - devices layer: `occupancy`, `pendingLockLaneClosure`;
  - shot tracker: `inFlight`.
- A new closure field (a search timer, a search stage) needs **no** spine write. It must meet the bar: reproducible from tick 0, and bounded or restart-safe. Every such latch also owes a reset at `ball_will_start` and a bounded lifetime.
- `GameState` is therefore **not** a mid-game resume point. Moving closure state into it means re-recording the goldens' state hashes, which needs the author's grant. This is separate from DW-187's pre-authorised *trajectory* re-record.

**Phase and lifecycle at this tree (for 2.13).**
- `GamePhase = 'attract' | 'game' | 'highscore_entry' | 'game_over'`.
- The shipped phase writes:
  - `attract → game` on Start, which replaces `players[]` wholesale;
  - `game → game_over`, with `hardwareEnabled: false` and the disable sweep;
  - 2.11's Slam tilt, which writes `phase: 'attract'`.
- Slam tilt is the *minimum* state change: `phase`, `modes: []`, `hardwareEnabled: false` with the disable batch, and `machine.tilt.slamTilted`.
  - It keeps `players[]`, so Attract cycles the last scores.
  - It does **not** zero `ballsInPlay`, because a ball may still be live.
  - It emits no `ball_ended`.
- **Nothing leaves `game_over` today, and Start is honoured only from Attract.** 2.13 owns the general game-over → Attract path and should subsume Slam's write rather than build a second path.
- Under AD-5 as amended, the manual plunger stays live in `game_over` and Attract.
- `highscore_entry` belongs to Epic 6; do not pre-build it.
- AD-8 is phased: Epic 2's minimal stack (base 100 + skill shot 200) starts and stops modes directly, and that is conforming until Story 3.1.

**Randomness and time (AD-3).**
- `tick` is the only time inside `sim/`. Every timer (search, search step, Match reveal, attract) is authored in ms, converted once at load (`shotWindowTicks()` is the sanctioned reader), and drives presentation through step events. Presentation never reports completion.
- All rules randomness comes from the seeded PRNG in `GameState.rng`, and its value is hashed.
- The lane draw is today the **only** `rng` consumer. Match is the second (2.13) and 2.14 re-shapes the first, so the two stories' order determines stream offsets.
- No golden starts a game (all five end at `rng = 0` in `attract`), so neither change reddens a golden today.
- AD-7's lane clause ("the skill-shot mode writes the lit Top lane once on `ball_starting` from `rng`") describes the per-ball draw that 2.14 replaces. Check whether it owes an amendment.
- `players[p].ballNumber` already exists, is player-scoped and hashed. A per-ball advance needs no new field.

**Layering (AD-1, AD-16, AD-19).**
- `sim/rules/devices/` is the only consumer of `SwitchEvent`. Modes, scoring and the ball controller consume device and shot events only. A failure event is neither a `SwitchEvent` nor a `ContactEvent`.
- Device-name literals outside `sim/table/dragonwar.ts` and `test/**` fail the lint. Derive names structurally, the way `shooterLaunchCoil()` reads `bd_shooter.ballSearchOrder`, and skip `bd_lock` by structure, never by a literal.
- AD-19's event enumeration is *binding*. A new device event amends it in the same change, as a lead write.
- `rules` and `physics` never import each other.

**Conflicts between the amended planning text and the tree, noticed at this compile.** The previous compile's two headline conflicts, Story 2.11's AC 2 and AD-19's trigger list, are resolved in the planning text. What remains:
- **Three projections of AD-5 still read as if the plunger is disabled.** None governs 2.12, but none should be cited as authority:
  - `epics.md`'s AR-12 digest and the solution design both say "Flippers, the manual plunger, slingshots and pop bumpers … Tilt, game over and Attract disable them together".
  - AD-5's own first sentence says the same, but its 2026-09-11 amendment in the same Rule narrows it explicitly. The amended AD-5 is the authority.
- **AC 1 names slings, but a sling search pulse does nothing at this tree.** There is no `slingWiring` and no commanded-kick path, so a sling step can only be a physically inert pulse.
- **The Lock's slot in the search order is only partly specified.** Story 3.2's received clause places the Lock steps "after the bank reset, before the trough eject". 2.12's AC 1 lists "the shooter and trough ejects" and leaves the Lock's position relative to the shooter unstated. The draft spec orders Lock, shooter, trough, which is consistent.
- **AD-4's sequence diagram still draws the three-argument `rules.step`.** This is harmless, since the fourth argument is optional.

## UX & Interaction Patterns

- **The Backglass is a 128×32, 1-bit DMD.** `DmdScreen` is a closed union, and 2.13's final-scores, Match and Attract screens are anticipated members.
- **The line budget is the live constraint (DW-197).** With four players the BALL row drops; at three the mode block drops. 2.11's TILT and WARNING screens sidestep it by replacing the panel wholesale.
- **Rendered-row tests use the differential band form.** Take the band from the row's own declared coordinate: non-empty where the row should appear, empty on a control frame. A whole-buffer `some(d => d === 1)` is forbidden.
- **The end-of-ball screen names the player from the event payload**, never from the advanced snapshot.
- **Presentation claims only a rendered frame can settle need the lead's browser smoke**, because `NullEngine` rasterises nothing. The method, from 2.11's handoff:
  - Filmstrip the backglass crop inside one `evaluate`, via `drawImage` in `requestAnimationFrame`, because a screenshot misses transients shorter than the agent's turn latency.
  - Drive input with `KeyboardEvent` keydown/keyup pairs.
  - Tilt warnings persist across a player's balls, so a fresh warning on a later ball needs two players.
  - No flipper or plunger is rendered (DW-249, routed to 5.4).
  - Aimed play is impossible in smoke. A weak plunge, which DW-187 needs, is a short key hold.
- **The colour grammar is fixed.** Rules emit roles and steps 0–3, never RGB. Flipper buttons move the lit insert one position per press, wrapping, and lane change matters *before* the plunge.

## Cross-Story Dependencies

- **2.12 is the automatic recovery several entries wait on:**
  - **DW-187** is in scope (above). It is the reason a golden trajectory re-record is pre-authorised for 2.12.
  - **DW-222** stays resolved. Its "reopens as a hard hang if DW-241 is decided disable" condition can no longer fire, because DW-241 is decided by-design.
  - **DW-230**'s reopen condition fires once 2.12 makes a stranded ball recoverable: a stale `awaitingSaveLaunch` could then auto-launch an unrequested ball.
  - **DW-244** (escalated, **not decided**) is coupled to 2.12 and 2.13: Slam returns to Attract with the voided ball still live, and Start has no balls-home gate.
- **Story 3.2 now owns three former 2.12 clauses** (AD-18 phasing):
  - ball search's Lock steps, through the arbiter: `show_dragon_mouth_open`, then `c_mouth` `mouthOpenLeadMs` later;
  - the `c_mouth` skip while a mode publishes `timerTicks`;
  - the `bd_lock` overflow eject, through the arbiter and after the lead, with "immediate" dropped.
  - 2.12 must leave a seam 3.2 can fill without re-planning the schedule, and must not pre-build the arbiter.
- **2.13 inherits:**
  - DW-197 and DW-198 (above);
  - **DW-235**: the bonus count-up schedule has no reset across game over → new game, and its drain loop runs regardless of `phase`;
  - **DW-254** (wontfix-theoretical): it becomes real if Start can leave `game_over` inside the last ball's 3 s hold;
  - the Slam → Attract path it must generalise, and DW-244's Start question if the author decides it there.
- **2.14** has Story 2.7 as its prerequisite. It should carry **DW-204**'s answer (does the paying lane freeze at `ball_launched`) into the same pass if the author has decided it. Doing it before Epic 3 re-records the goldens through the rules layer is strictly cheaper.
- **No stage may decide the entries on the author's sheet:**
  - decision-pending: DW-204, DW-212, DW-226, DW-232, DW-236, DW-237, DW-240, DW-245, DW-246, DW-251;
  - escalated: DW-244, DW-255.
  - DW-241 has left the sheet, decided by-design on 2026-09-11.
  - Fence them explicitly in each spec's `Never` section.
- **Routed elsewhere, so nobody re-files them:**
  - DW-221 (a `bd_lock` capture read as a drain), the Lock arbiter and the three Mouth clauses → 3.2;
  - the four-phase mode lifecycle and `_will_stop` → 3.1;
  - DW-219 and DW-228 (second ball-save source) and DW-185 → 3.7;
  - flashers and audio cues on Tilt and Match → Epic 4;
  - the walk-up camera → 4.6;
  - high-score entry and the Settings panel → Epic 6.
  - Epic 2 must not pre-build any of them.
