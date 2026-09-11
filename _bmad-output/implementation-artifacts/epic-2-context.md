# Epic 2 Context: A Complete Game on the Real Shot Map

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 2 makes a stranger able to play a full 1–4 player game with no instructions. It covers the real shot map, every device with reliable switches, and the standard game on top of them, all read from a DMD Backglass and inserts lit in the fixed colour grammar. Stories 2.0 through 2.12 are done, ball search included, so the epic stands at 18 of 20. Two stories remain:
- **Match, game over and the return to a minimal Attract**, so that the game closes the way a real machine does. On the author's decision of 2026-09-11 this story now also clears stray balls before every serve (DW-244).
- **The lit Top lane rotation**, a chartered correction to the skill shot.

Since the last compile, the spine has been amended three times:
- **AD-6, at Story 2.12's close:** what `ballsInPlay` means.
- **AD-6 and AD-9, today:** stray balls are cleared before every serve, which makes the ball controller a second `RecoverCommand` issuer. AD-6's `device_overflow` clause now cross-references AD-18's `bd_lock` phasing.

Story 2.13 has also gained its DW-235 and DW-244 acceptance bullets.

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
- Story 2.12: Ball search *(done)*
- Story 2.13: Match, game over and return to Attract ← **next** *(backlog)*
- Story 2.14: The lit Top lane — rotation, and when it may move *(backlog)*

## Requirements & Constraints

**Match, game over and Attract (2.13).**
- **Game over.** When the last ball of the last player ends, the phase becomes `game_over`. The Backglass shows final scores by player, and `game_ended { scores[] }` fires.
- **The Match draw.**
  - A multiple of ten, 00–90, is drawn from `GameState.rng`.
  - The odds of matching at least one player's last two score digits equal the configured probability. The 8% default was chosen deliberately; it is not a sourced figure.
  - `match_drawn { number, winners[] }` fires, and the reveal is paced by `matchRevealMs` step events. A win shows MATCH.
  - Under free play the award is display-only: credits are deferred.
- **Leaving game over.** After Match, `attractMs` or Start moves the machine to Attract (or starts a new game). Hardware is disabled, `modes[]` is empty, and `players[]` is cleared on the next Start.
- **Attract.** It cycles the last scores and shows the flipper, plunge and Start keys once, from `ViewConfig.bindings`. Three things it does not include: the Walk-up (Story 4.6), High-score entry (Epic 6) and Match flashers and audio (Epic 4).
- **DW-197, author-decided.** The ball number gets a shared or shortened line rather than a line of its own.
- **DW-198, author-decided.** The current player's row is rendered highlighted or boxed.
  - Binding (Rule 19): the pinning test asserts that **the rendered DOTS differ** between an emphasised and an unemphasised row.
  - Named mutation: force emphasis false, and the dot buffer changes.
- **DW-244, author-decided 2026-09-11: *clean up the strays, then start*.**
  - **When.** Before serving: on Start in Attract **and for every new ball**, mid-game ball starts included.
  - **What.** The ball controller clears stray balls itself:
    - a ball already **resting in `bd_shooter`** *is* the ball being served, so there is no `c_trough_eject` and nothing stacks;
    - a **loose** ball outside every device is removed through the `RecoverCommand` path Story 2.12 built.
  - **The invariant.** Exactly one ball is in play after the serve, never two. 2.13 specifies and pins how the stray recover reports its `recovered` count and how it orders against the serve.
  - **The two evidence routes.**
    1. A voided game's ball left loose by a Slam. Probe: slam@10, Start@20, the old ball drains@300. The result is a `ball_ended` for the new game's ball 1, then a second trough eject into the occupied lane.
    2. A ball left in the lane by a search pass cancelled after its trough slot served. The next `startBall()` stacks on it.
  - **Binding (Rule 19).**
    - One pinning test per route, each seen **RED on today's code**.
    - Each negative (no stacking, no misattributed drain) is paired in the **same test** with its positive: the resting ball IS served, the loose ball IS removed.
- **DW-235.** The bonus count-up schedule, closure state `pendingBonusCountSteps`, has no reset across game over → new game.
  - Its drain at the top of the ball controller's `step()` runs **regardless of `phase`**.
  - A game-over drain arms a schedule, and no later ball end exists to cancel it.
  - 2.13 owns that lifecycle boundary. A per-lifecycle home would also answer sibling DW-234, which is wontfix-accepted.
- **Match has a naming mismatch to resolve, not paper over.**
  - The planning text (the 2.13 AC and AD-15's tunables list) says `matchPercent` (default 8).
  - The shipped contract field is `GameAdjustments.matchProbability`. It is `0.08` in `DEFAULT_ADJUSTMENTS` and in the real boot `GameStart`, but `0` in the dev replay recorder and all five golden headers.
  - It has **no reader** today. AD-14 makes it a sim adjustment that applies at the next game.

**Lit Top lane (2.14).** The author decided the whole form (DW-205, DW-214):
- The starting position is drawn **once per game** from `GameState.rng`. From there the lit lane advances deterministically one lane per plunge through `TOP_LANES`, wrapping, so a three-ball repeat is impossible *by construction*.
- A fixed start was rejected, because it would leave `GameStart.seed` with no observable effect anywhere.
- The not-all-same property is re-pinned for **every** starting position. A mutation that freezes the advance must turn it red.
- The DW-201 block in `test/rules-modes-integration.test.ts` is the only mutation-proven evidence that the seed reaches `rng`. Preserve it, rewrite it rather than delete it, or retire it with a named replacement.
- **Tension to reconcile at planning.** Story 2.14's AC 4 says Story 2.7's AC 5 and `spec-2-7`'s AC 6 are amended in the same commit. DW-214's later author note says the seeded-start form keeps 2.7's AC 5 true *verbatim*. Both artifacts must end up describing the game the code plays.

**Standing constraints for both stories.**
- **Baselines. Re-measure at your own tree; never transcribe these.**
  - The suite at 2.12's close: 121 files / 2009 tests / 0 skipped. State whether `BLENDER` was exported; with it unset, cases skip rather than fail.
  - This compile verified that `src/`, `test/` and `tools/` are unchanged since `e51f625` and that the working tree is clean.
  - The five goldens share `tableHash e22fbdcf` (moved by 2.12's header-only refresh), `assetHash ab163ff` and `physicsVersion v1-ce6772ef`, re-read by JSON parse at this compile.
  - No golden presses Start: all five end in `attract` at `rng = 0`. So no hashed replay covers a serve, a recover, a game over or a Match (DW-266).
  - The spine is `final`, updated 2026-09-11, with 19 ADs. **AD-20** is the next free id; no amendment today claimed one.
  - The vacuity count is **69**. 2.12 added five:
    - a phase-gate negative whose positive was never established;
    - a recover test that never issued a recover;
    - a by-value comparison claiming reference equality;
    - an expectation derived from the same `TABLE` fields the module reads;
    - a clause that was never asserted.
    Check for these shapes first at every gate.
- **Every gate is expected green; a red one is a regression.**
  - `check:ad7` exits 0 with **exactly 3** passing tests, pinning that `sim/loop`'s `state` binding has exactly two writes.
  - `check:corridor` and `check:reachability` exit 0.
- **The anti-vacuity rules this epic paid for:**
  - Any "nothing is emitted" or "nothing stacks" assertion needs an established precondition that something *could* have been emitted.
  - Boundary probes sit **on** the bound. The project's tick windows are inclusive `<=`.
  - A recorded mutation is a property of a tree: editing its line voids it. State the expected red before running a mutation.
  - Pin a new tunable at its **production** magnitude, by consequence.
  - A headless test that scripts the consequence it observes proves nothing. Pair it with a real `createLoop` case driven by real input.
  - A test that drives a ball to its end runs at `NO_BALL_SAVE_TUNING` and asserts that `ball_ended` actually **arrived**.
- **Every new tunable is a golden-header cost.**
  - `attractMs` and `matchRevealMs` do not exist in `TUNING`. `ballSearchMs` and `ballSearchStepMs` now do.
  - Each new key is built with `entry(value, source, confidence)` and listed in the `scalarKeys` ratchet. A `…Ms` key adds two header blocks: itself and its derived `…Ticks` sibling.
  - A header-only refresh of all five goldens is routine and needs no grant. Build the harness in the scratchpad, verify per field by JSON parse, never by grep, and append to `notes`.
  - A moved state hash or trajectory with no traced cause is a HALT.
- **English literals live only in `presentation/backglass`; rules never format text.**
- **Provenance is a hard gate.** An `ATTRIBUTIONS.md` entry lands before any third-party file.

## Technical Decisions

**AD-6, as amended three times since the last compile (near-verbatim).**
- **The stray-ball clause.**
  - "Before the ball controller serves a ball, on Start in Attract and at every ball start, it clears stray balls itself."
  - "A ball already resting in `bd_shooter` *is* the ball being served: no `c_trough_eject` pulse."
  - "A loose ball outside every device is removed through the same `RecoverCommand` path, which makes the ball controller's serve path the second sanctioned issuer of `RecoverCommand` after ball search."
  - "A ball resting on the plunger tip counts as inside `bd_shooter`, so the recover never removes the ball being served."
- **`ballsInPlay`'s meaning.**
  - It counts balls launched (`ball_launched`) and not yet arrived at any ball device.
  - A parking device's entry takes a ball out of play, and so does an **unpaired** arrival at a non-parking device (a roll-back onto the plunger tip).
  - A served ball's arrival, paired in the same batch with a parking device's `device_ball_left` whose `servesInto` is that entry, was never counted and changes nothing.
  - Ball search's `ball_missing` reconciliation corrects the count from what physics recovered. Story 3.7 builds on this definition.
- **The overflow clause.** A `device_overflow` is answered with an immediate eject, "except at `bd_lock` until Story 3.2". This is a cross-reference only; the shipped controller already skips the Lock.
- **Unchanged:** there are 4 balls. Device counts in `GameState` are the number of closed slot switches and nothing else. Only a parking eject spawns a ball, so recovered balls are never replenished (DW-257).

**AD-9, amended.** The rules→physics commands are `CoilCommand` and `RecoverCommand`: "ball search, and the ball controller's stray-ball clearing before a serve". The union stays closed. Every semantic event is payload-complete, and presentation never joins an event to the snapshot.

**The other ADs that bind 2.13 and 2.14.**
- **AD-4.**
  - Physics consumes the commands issued at the previous tick, so a coil or recover command takes effect on the **next** tick.
  - `rules.step`'s optional fourth argument, the **machine report**, carries physics' `recovered` count and its device failures.
- **AD-5.** Tilt, game over and Attract disable the flippers, slings and pops together (`HARDWARE_COILS`). The manual plunger shares `c_autolaunch`, a serving coil outside that set by design, so it **stays live in `game_over` and Attract**. Never disable `c_autolaunch`.
- **AD-18.** Nothing pulses `c_mouth` before Story 3.2's Lock arbiter. Only the ball controller pulses `c_trough_eject` and `c_autolaunch` and mutates `ballsInPlay`. "A multiball is running" means `machine.multiball !== null`.
- **AD-7.**
  - `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }`, JSON-serializable, mutated only inside `rules.step`.
  - `ball_will_start` resets `ballSave`, `tilt` and `multiball`; `ball_starting` enables hardware.
  - **Closure state is a *class*.** Re-derive the inventory from every mutable binding in a `create*()` factory under `sim/rules/`. 2.12 added ball search's `pass`, `wasInPlay` and `heldSince`.
    - `ballSearch.reset()`, called from `startBall()`, clears the timer and schedule but **never the held set**, so a hold spans a ball boundary by design.
    - Any new closure latch (a Match reveal schedule, an attract timer) must be reproducible from tick 0 and bounded or restart-safe.
  - `GameState` is **not** a mid-game resume point. Moving closure state into it re-records the goldens' state hashes and needs the author's grant.
  - The lane clause ("the skill-shot mode writes the lit Top lane once on `ball_starting` from `rng`") describes the per-ball draw 2.14 replaces. Check whether it owes an amendment.
- **AD-3.**
  - `tick` is the only time inside `sim/`. Every timer (Match reveal, attract) is authored in ms, converted once at load (`shotWindowTicks()` is the sanctioned reader), and drives presentation through step events; presentation never reports completion.
  - All rules randomness comes from `GameState.rng`, and its value is hashed. The lane draw at `skill-shot.ts:80` is the **only** consumer today. Match is the second, and 2.14 reshapes the first, so the two stories' order sets the stream offsets.
- **AD-8.** Epic 2's minimal stack (base 100 + skill shot 200) starts and stops modes directly. That conforms until Story 3.1.
- **AD-1, AD-16 and AD-19.**
  - `sim/rules/devices/` is the only consumer of `SwitchEvent`, so Start arrives as `button_pressed`.
  - Device-name literals outside `sim/table/dragonwar.ts` and `test/**` fail the lint. Derive names structurally.
  - `rules` and `physics` never import each other.

**What 2.13 will find at this tree (verified at this compile).**
- **`rules.step()` order:**
  1. the devices layer;
  2. `applyRecovery()`, where the report's `recovered` count corrects `ballsInPlay`;
  3. `applyDeviceEvents` / `deriveDeviceSlots`;
  4. the tilt stage;
  5. bonus credit;
  6. the ball controller;
  7. the mode stack;
  8. `advanceBonusMultiplier`.

  Inside the ball controller: search `observe()`, then the bonus-step drain, Start, ball save, the drain / game-over branch, the recover answer, the overflow answer, and search `step()`. `ball_will_start` and bank-reset requests reach the devices layer on the next tick.
- **Start** is honoured only from `attract` (plus the Hot-seat window in `game`). `attract → game` replaces `players[]` wholesale and calls `startBall()`.
  - `startBall()` pulses `c_trough_eject` with **no lane-occupancy or stray check**. That is the DW-244 site.
  - Ball-controller output already carries a `recoverCommands` channel, which ball search uses.
- **The recover answer.** Any non-null `machineReport.recovered` emits `ball_missing { count }`. In `game` with an empty lane it also pulses `c_trough_eject`.
  - A stray-clearing recover would reach this same branch a tick later.
  - Separating the two, or reusing it, is the reporting and ordering question AD-6 leaves to 2.13.
- **Physics order.** Physics applies a recover **before** the same step's coil commands (DW-264). The trough's eject pose lies inside `bd_shooter`'s entry zone, so a recover spares both a resting ball and a just-served one. A ball parked in `bd_lock` is out of the simulation, so no recover can touch it.
- **Ball search is phase-gated** (`phase === 'game' && ballsInPlay > 0`), so 2.13's transitions stop it without new code.
- **Game over.** `game → game_over` is written in the drain branch, with the `HARDWARE_COILS` disable batch and `hardwareEnabled: false`. **Nothing leaves `game_over` today.**
- **Slam tilt** (`sim/rules/tilt.ts`) writes the minimum: `phase: 'attract'`, `modes: []`, `hardwareEnabled: false` with the disable batch, and `slamTilted`.
  - It keeps `players[]`, does **not** zero `ballsInPlay`, and emits no `ball_ended`.
  - 2.13 should subsume this write in the general game-over → Attract path rather than build a second one.
- **Events.** `game_ended` and `match_drawn` are not yet in the `SemanticEvent` union. Each new member owes a `describeEvent` arm with an executing assertion.
- **Phases.** `GamePhase = 'attract' | 'game' | 'highscore_entry' | 'game_over'`. `highscore_entry` is Epic 6's; do not pre-build it.

**Stale or conflicting text noticed at this compile.**
- **The spine's Seam Contracts table** row for `RecoverCommand` now reads "ball search's final stage, and the ball controller's stray-ball clearing before a serve", matching amended AD-6 and AD-9. This compile found the row stale, and the lead corrected it in the same commit that recorded this context (a lead edit of this line, not a recompile).
- **AD-4's sequence diagram** still draws the three-argument `rules.step`. This is harmless, since the fourth argument is optional.
- **The `matchPercent` / `matchProbability` naming** (above), and **2.14's AC 4 against DW-214's note** (above).

## UX & Interaction Patterns

- **The Backglass is a 128×32, 1-bit DMD.** `DmdScreen` is a closed union: `attract_prompt | attract_scores | score | ball_ended | tilt_warning | tilt`. 2.13's final-scores and Match screens are new members.
- **The line budget is the live constraint (DW-197).** At four players the BALL row drops. At two players plus a mode, the mode's optional fields drop; from three the whole mode block drops. 2.11's TILT and WARNING screens sidestep this by replacing the panel wholesale.
- **Rendered-row tests use the differential band form.** Take the band from the row's own declared coordinate: non-empty where the row should appear, empty on a control frame. A whole-buffer `some(d => d === 1)` is forbidden.
- **The end-of-ball screen names the player from the event payload**, never from the advanced snapshot.
- **Claims only a rendered frame can settle need the lead's browser smoke**, because `NullEngine` rasterises nothing. The method:
  - Get past the press-to-begin gate by clicking `begin-button` inside an `evaluate`; `__dragonwarBoot` does not exist before that. Use a 1280×900 viewport at dpr 1.
  - Filmstrip the backglass crop inside one `evaluate` with `drawImage` in `requestAnimationFrame`.
  - Drive input with `KeyboardEvent` keydown/keyup pairs.
  - The discriminating channel: record with `replayRecorder.start(seed)` / `.save()`, replay in Node with `runReplay`, then apply a named mutation to the **same** browser input. `setCoilEnabled` is not recorded.
  - No flipper or plunger is rendered (DW-249).
- **The colour grammar is fixed.** Rules emit roles and steps 0–3, never RGB. Each flipper press moves the lit insert one position, wrapping, and lane change matters *before* the plunge.

## Cross-Story Dependencies

- **2.13 carries four ledger bullets:** DW-197, DW-198, DW-235 and DW-244, all above. DW-244 has left the decision sheet.
- **Couplings 2.13 must watch:**
  - **DW-254** (wontfix-theoretical) becomes real if Start can leave `game_over` inside the last ball's 3 s end-screen hold.
  - **DW-257** (wontfix-accepted): recovered balls are never replenished. Each stray recover shrinks the 4-ball machine too. Code review found that once the trough empties, no ball can drain, so the game hangs.
  - **DW-230's** reopen condition ("2.12 makes a stranded ball recoverable") has now fired, but the ledger has not reopened it. A stale `awaitingSaveLaunch` could auto-launch an unrequested ball; check it against the stray clearing.
  - **DW-263** (by-design) and **DW-268** (routed to 3.7) cover a recover deleting a ball its own search pass served or launched.
- **Story 3.2 owns the Lock clauses:** ball search's `bd_lock` steps, the `c_mouth` skip while a mode publishes `timerTicks`, and the `bd_lock` overflow eject. 2.13 must pulse no `c_mouth` and must not pre-build the arbiter.
- **2.14** has Story 2.7 as its prerequisite. It should carry **DW-204**'s answer (does the paying lane freeze at `ball_launched`) into the same pass if the author has decided it by then. Doing 2.14 before Epic 3 re-records the goldens through the rules layer (DW-175) is strictly cheaper.
- **No stage may decide the entries on the author's sheet.** Fence them in each spec's `Never` section.
  - Decision-pending: DW-204, DW-212, DW-226, DW-232, DW-236, DW-237, DW-240, DW-245, DW-246, DW-251. DW-236 and DW-237 concern the end-of-ball screen 2.13 sits beside.
  - Escalated: DW-140, DW-141, DW-142, DW-158, DW-159, DW-161, DW-173, DW-206, DW-210, DW-211, DW-255, DW-258.
- **Routed elsewhere, so nobody re-files them. Epic 2 must not pre-build any of them:**
  - DW-221 (a `bd_lock` capture read as a drain) and the Lock arbiter → 3.2;
  - the four-phase mode lifecycle and `_will_stop` → 3.1;
  - DW-219, DW-228 and DW-185 → 3.7;
  - flashers and audio cues on Tilt and Match → Epic 4;
  - the Walk-up camera → 4.6;
  - High-score entry and the Settings panel → Epic 6.
