---
name: 'DragonWar'
type: architecture-spine
purpose: build-substrate
altitude: feature
paradigm: 'Ports-and-adapters around a virtual pinball machine — Physics is the cabinet, Rules is the game CPU, Presentation is the drivers — on one fixed-step simulation clock'
scope: 'DragonWar v1 whole system: physics core, rules layer, presentation, host loop, assets, persistence, build and deployment'
status: final
created: '2026-08-26'
updated: '2026-09-11'
binds: [FR-1..FR-55, NFR-1..NFR-9, UJ-1..UJ-4]
sources:
  - _bmad-output/planning-artifacts/prds/prd-dragonwar-2026-08-26/prd.md
  - _bmad-output/planning-artifacts/prds/prd-dragonwar-2026-08-26/addendum.md
  - _bmad-output/planning-artifacts/briefs/brief-dragonwar-2026-08-26/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-dragonwar-2026-08-26/addendum.md
  - _bmad-output/planning-artifacts/research/technical-pinball-simulation-engine-and-technology-2026-08-26/research.md
companions: []
---

# Architecture Spine — DragonWar

## Design Paradigm

**Ports-and-adapters around a virtual pinball machine.** The Rules layer is the game CPU — the domain core, a pure function of cabinet and playfield switches. The Physics core is the cabinet: a driving-and-driven adapter behind a virtual I/O board (switches in, coils out). Presentation is the set of output drivers — lamps, flashers, GI, display, mechanisms, audio, camera. The Host is the composition root: boot, the frame loop, input, persistence, the dev panel. Everything in `sim/` runs on one fixed-step clock and knows nothing about the DOM, Babylon, or wall-clock time.

| Layer | Directory | Role |
| --- | --- | --- |
| Contracts | `src/sim/contracts/` | The closed unions every seam speaks (see *Seam Contracts*) |
| Table | `src/sim/table/` | The device registry (`TABLE`), frames and units, tunables |
| Physics (cabinet) | `src/sim/physics/` | vpx-js port; ball and flipper bodies, hardware rules, devices, cabinet oscillator, tilt bob, slam detector |
| Rules (game CPU) | `src/sim/rules/` | devices-and-shots layer, ball controller, players, modes, scoring |
| Loop | `src/sim/loop/` | Fixed-step conductor, cabinet-switch source, replay recorder and player |
| Presentation (drivers) | `src/presentation/` | scene, mechanisms, lighting, backglass, audio, camera |
| Host | `src/host/` | boot, rAF driver, input, persistence, settings, dev tuning panel |

```mermaid
graph LR
  host["host/ — composition root"]
  pres["presentation/ — drivers"]
  loop["sim/loop — conductor"]
  rules["sim/rules — game CPU"]
  physics["sim/physics — cabinet (vpx-js port)"]
  table["sim/table — TABLE, frames, tuning"]
  contracts["sim/contracts — seam types"]
  host --> pres
  host --> loop
  host --> contracts
  host --> table
  pres --> contracts
  pres --> table
  loop --> physics
  loop --> rules
  loop --> contracts
  loop --> table
  rules --> contracts
  rules --> table
  physics --> contracts
  physics --> table
  table --> contracts
```

Arrows are the only permitted import directions. `rules` and `physics` never import each other; `host` never imports `physics` or `rules` directly; nothing in `sim/` imports `presentation/`, `host/`, `@babylonjs/*`, or DOM globals.

## Invariants & Rules

`[ADOPTED]` marks a decision already settled by the PRD, brief, research, or verified reality; untagged decisions were made in this run. Time values in rules are named `…Ms` when authored and `…Ticks` once converted (AD-3).

### AD-1 — Virtual-machine ports-and-adapters with fixed dependency direction `[ADOPTED]`

- **Binds:** all
- **Prevents:** rules reaching into physics for a shortcut; presentation mutating sim state; the simulation becoming un-testable without a browser; the registry growing into a table-loading engine
- **Rule:** The dependency graph above is the law. `sim/**` is DOM-free and Babylon-free. Presentation reads `FrameOutput` and never calls into physics or rules. Host composes; it owns no game logic. **One table:** `sim/table/dragonwar.ts` is imported directly wherever a device is named; there is no `Table` interface, no table-loading API, no runtime table selection, no plugin or registration API.

### AD-2 — Switches are edges from one source per class; contacts and actuations go to presentation only `[ADOPTED]`

- **Binds:** FR-7, FR-11, FR-14, FR-46, NFR-5; `sim/physics`, `sim/loop`, `sim/rules/devices`, `presentation/audio`
- **Prevents:** ball velocity or position leaking into rules; two debounces stacked (or none); a rollover closing forty times per pass; flipper snap played from the key state during Tilt; switch semantics re-derived in presentation
- **Rule:** Physics emits **playfield and cabinet-mechanism** `SwitchEvent`s (`s_tilt_bob`, `s_slam_tilt` included) as edges only — one `closed: true` when a zone test transitions outside→inside, one `closed: false` on the reverse — with per-switch hysteresis and `settleTicks` from `TABLE.switches` (defaults by class: rollover 0, standup target 8, drop target 20, bumper skirt 2, tilt bob 0). **`settleTicks` gates the BREAK, never the MAKE** [AMENDED 2026-09-01, DW-67]: the outside→inside transition latches and emits `closed: true` on the very tick it is first observed, and `settleTicks` is then the number of ticks the zone test must read *outside* before `closed: false` is emitted. Debouncing the make instead would drop any zone crossing shorter than `settleTicks + 1` ticks entirely — at a standup target's 8 or a drop target's 20 that is a fast ball passing through with no edge at all, which falsifies FR-11 (“no ball is ever lost by a missed switch at any ball speed the Physics core can produce”) by construction the moment the first `standup` or `drop_target` switch is declared. A switch that is made and broken inside one settle window still emits both edges, in order. `sim/loop` emits only the **button** switches (`s_start`, `s_flipper_l`, `s_flipper_r`, `s_plunger`) from `InputFrame` transitions. Rules never debounce a switch; the only rules-side windows are semantic (`tiltWarningSpacingMs`, `tiltSettleMs`). Physics emits `ContactEvent`s to presentation only: ball contacts (with `speed`, `surface`, `pos`) **and** actuations (`coil_fire`, `flipper_eos`, `drop_target_down`, `bank_reset`, `eject`, `spinner_tick`) so every mechanical sound has exactly one source. Rules never receive a `ContactEvent`; presentation never reads `InputFrame` and never derives game state from contacts. **A switch owned end to end by a device module is excluded from the tracker entirely, so its `settleClass` no longer gates its break** [AMENDED 2026-09-05, Story 2.3]: `sim/physics/switches.ts` builds its zone set by subtracting `deviceModuleOwnedSwitches()`, because a tracker-owned switch opens `settleTicks` after the ball leaves and Story 2.3's AC 2 requires the six `s_dragon_*` switches to be **still closed** when `pulse c_dragon_bank_reset` emits their `closed:false` edges. The consequence is already in-tree and is the reason this is recorded here rather than left in a spec: `s_dragon_*` still declare `settleClass: 'drop_target'` (20 ms) in `sim/table/dragonwar.ts`, but nothing in production reads that class for them any more -- the declaration is now inert for the bank, and a later story reading only the spine would otherwise assume the settle window still applies.

### AD-3 — One simulation clock behind one constant; no wall-clock and no unseeded randomness inside `sim/`

- **Binds:** FR-8, FR-14, FR-19, FR-20, FR-22, FR-23, FR-24, FR-33, FR-34, NFR-2, NFR-5; `sim/**`
- **Prevents:** a ball-save timer on `performance.now()` while a hurry-up counts ticks; an unreplayable game; Match from `Math.random()`; a scatter draw inside the port silently breaking replays; a 480 Hz fallback that rewrites every timer
- **Rule:** `TICK_HZ` is one constant in `sim/contracts/time.ts`, set from the port's `PHYSICS_STEPTIME` (1000 µs → 1000 Hz); if spike 1 forces 480 Hz, that constant changes and golden replays are re-recorded — nothing else in `sim/` may contain a literal millisecond. `tick` (uint32, reset at game start) is the only time inside `sim/`. Every rules timer — ball save, grace, hurry-up, ball search, tilt spacing and settle, mode timers, and every display-paced sequence (bonus count-down, Match reveal, mode-select window, initials-entry timeout) — is authored in ms in `tuning.ts`, converted to ticks once at load, and drives presentation by emitting step events; presentation animates to them and never reports completion. All rules randomness (Match, skill-shot lane) draws from a seeded PRNG in `GameState.rng`. Physics has no randomness: scatter is 0 on every material by default; if ever enabled it draws from a second seeded PRNG in physics state. Both seeds are in the replay header.

### AD-4 — Loop contract: tick-stamped input, rules after every physics step, commands next tick, remainder carried, 200 ms cap

- **Binds:** FR-5, FR-7, NFR-1, NFR-2, NFR-3, NFR-5; `sim/loop`, `host/loop`, `host/input`
- **Prevents:** a key press landing on a different tick at 30 Hz than at 120 Hz; a light tap lost inside one frame; 4 % slow motion from a dropped remainder; a stalled tab freezing or fast-forwarding the game; a cue double-fired on a frame that owed zero steps
- **Rule:** The host stamps every key transition with the sim tick derived from the DOM event `timeStamp` against the accumulator origin and hands `advance(elapsedMs, transitions: InputTransition[])` an ordered list; the loop applies the `InputFrame` in force at each tick, and physics derives edges per tick from consecutive frames. Key codes never enter `sim/` — the key→action map lives only in `host/input`. The accumulator owes `elapsed × TICK_HZ` steps and **carries the fractional remainder**; owed time beyond 200 ms is discarded and `sim_time_discarded { ms }` is the first event of that frame. For each step: physics consumes the frame and the commands issued at the previous tick and emits events; then `rules.step(state, switchEvents, tick)` runs — every step, even with none. [AMENDED 2026-09-11, Story 2.12 spec gate — `rules.step` gains an optional fourth argument, the **machine report**: physics' `recovered` count from a `RecoverCommand` (the sequence below already returns it to the loop) and physics' device failure events (`eject_failed`, `device_overflow`), so ball search can reconcile `ballsInPlay` (AD-6) and rules can answer device failures without throwing; omitted, the call is exactly the three-argument form above.] Inside a step the time-of-impact loop is bounded by forced advance (`STATICTIME`, a solver constant) so a step always terminates deterministically. `FrameOutput` carries every event and command from all N steps in tick order (N = 0 → empty arrays, unchanged snapshot); presentation renders the latest snapshot without interpolation, treats lamp and GI commands as latest-wins per target, and treats every show, flasher, contact and semantic event as a discrete occurrence scheduled by its tick offset within the frame — rate-limited by the driver, never dropped by the host. A replay is `ReplayHeader + InputTransition[]` and must reproduce the state hash.

```mermaid
sequenceDiagram
  participant H as host loop (rAF)
  participant L as sim/loop
  participant P as sim/physics
  participant R as sim/rules
  participant V as presentation
  H->>L: advance(elapsedMs, InputTransition[])
  loop N = owed steps (remainder carried, cap 200 ms)
    L->>L: frame = input in force at tick — button switch edges
    L->>P: step(tick, frame, commands[t-1])
    P-->>L: switchEvents[t], contactEvents[t], recovered
    L->>R: step(state, switchEvents[t], tick)
    R-->>L: events[t], commands[t], lampsOf(state, hurryUpTicks)
  end
  L-->>H: FrameOutput { snapshot, events, contactEvents, commands }
  H->>V: apply(FrameOutput)
```

### AD-5 — Hardware rules live in physics, gated by coil enable; the flipper is the ported mover; nudge coupling is re-derived `[ADOPTED]` `[AMENDED 2026-09-11 — the manual plunger's coil named: it shares c_autolaunch, a serving coil outside the set Tilt, game over and Attract disable; fills a gap, reverses nothing]`

- **Binds:** FR-5, FR-13, FR-15, FR-16, FR-18, FR-25, FR-31, NFR-3; `sim/physics`, `sim/rules`, `host/input`
- **Prevents:** a flipper or slingshot kick routed through the rules tick; a hybrid coil model derived on top of the port; two owners of flipper state; nudge as a force on the ball; slam tilt sharing the bob's threshold or living outside the replay
- **Rule:** Flippers, the manual plunger, slingshots and pop bumpers are **hardware rules** inside the physics step — switch or button → coil on the same tick — each behind its coil (`c_flipper_l`, `c_flipper_r`, `c_sling_l`, `c_sling_r`, `c_pop_*`) and gated only by `CoilCommand enable | disable`; Tilt, game over and Attract disable all of them together. **The manual plunger's coil (recorded 2026-09-11, Story 2.12 spec gate; DW-241 decided by-design).** The sentence above lists the manual plunger as a hardware rule "behind its coil", yet its coil list names no plunger coil, and none exists: the manual plunger shares the autolauncher's serving coil, `c_autolaunch` (the physics step gates the manual plunge on `c_autolaunch`'s enable). That coil is a ball-serving coil — `bd_shooter`'s `ballSearchOrder` pulse step — and is outside `HARDWARE_COILS` by design (DW-74: a disable batched with a serve pulse would swallow the serve). So Tilt, game over and Attract disable the flippers, slingshots and pop bumpers together and leave the manual plunger live. This fills a gap the Rule left; it reverses nothing. The trade is the author's: a tilted player can still plunge, and the plunger is live in Attract, in exchange for a player always being able to free their own ball — measured at the Story 2.12 spec gate, a disabled `c_autolaunch` swallows ball search's shooter pulse and a ball on the plunger tip counts as inside `bd_shooter`, so no search could recover it. The flipper solenoid is vpx-js's `FlipperMover` ported verbatim — strength, ramp-up, end-of-stroke torque and angle, return strength, inertia ⅓·m·r² — and MPF's pulse/hold figures are calibration references, never parameters. The manual plunge maps `s_plunger` hold ticks through `plungerSpeedByHoldMs` in `tuning.ts`. Button edges surface to rules as cabinet switches for lane change, mode selection and initials. Nudge is an impulse to the cabinet oscillator; the oscillator is ported, but the **ball coupling is re-derived as table-frame motion** (the ball keeps its inertia while the cabinet moves — VPX's nudge-as-ball-force is a known open defect) and pinned by a golden replay. The tilt bob is a pendulum whose closure is `s_tilt_bob`. The slam detector is a tick-windowed nudge count in physics beside the oscillator, threshold `slamNudgesPerWindow` in `tuning.ts`, closure `s_slam_tilt` — this resolves PRD OQ-4.

### AD-6 — Physics owns ball bodies and mechanical state; rules own ball accounting; devices park and eject only on command `[ADOPTED]`

- **Binds:** FR-17, FR-18, FR-19, FR-23, FR-28, FR-29, FR-31, FR-35, FR-37, FR-38, FR-40, UJ-3; `sim/physics/devices`, `sim/rules/ball-controller`
- **Prevents:** two owners of "where is ball 2"; the Lock deciding to eject; a parked ball that a spring plunger cannot strike; a device whose count drifts on a double drain; Quick multiball silently starving in Hot seat; a stuck ball that no protocol can recover
- **Rule:** The machine carries **4 balls**, asserted at boot. **Boot occupancy is a declared property of each ball device, not a constant** [AMENDED 2026-09-04, Story 2.1d spec gate]: `bd_trough` boots full and `bd_lock` boots empty, and physics reads that declaration rather than filling every device's slots unconditionally at construction. The unconditional fill booted the machine with **seven** balls against this Rule's own four and produced 45 measured `device_overflow` events; the four-ball invariant is therefore checked by name at construction rather than assumed. Every future ball device declares its own boot occupancy. `bd_trough` (capacity 4, slots `s_trough_1..4`, eject `c_trough_eject`) and `bd_lock` (capacity 3 — two held plus one staging — slots `s_lock_1..3`, eject `c_mouth`) are **parking** devices: physics parks an entering ball unconditionally into the lowest empty slot, removes it from the simulated set and closes that slot's switch; on `pulse` of the eject coil it spawns the ball from the highest filled slot at the device's authored eject pose and speed and opens the switch — the Lock's pose *is* the Mouth, aimed at the flippers, one ball per pulse. `bd_shooter` (the plunger lane) is a **non-parking** mechanical-eject device: the served ball stays simulated resting on the plunger tip, entry switch `s_shooter_lane`, two exits — the manual plunge (AD-5) or `pulse c_autolaunch`. **The opening of `s_shooter_lane` is the one event that means "plunged"** — the devices layer (AD-19) emits it as `ball_launched`, on which the ball controller increments `ballsInPlay`, starts the ball-save timer and arms the skill shot — but **the ball-save timer is started only by a *player* plunge inside a game, never by a save's own re-serve** [AMENDED 2026-09-07, Story 2.9 author decision + spec gate. Two narrowings of this clause's unqualified wording, both measured rather than reasoned. (1) **Phase.** Arming is gated on `phase === 'game'`, **and separately on the ball controller's own source being present in `ballSave.sources`** — the latter added by this story's rework when the `enableBallSave` gate was wired. The reason the goldens stay clean is that all five plunge and never press `s_start`: no `ball_starting`, so no enable, so an empty `sources`. **CORRECTED 2026-09-08, and against this clause's own first wording:** the phase test was written here as load-bearing, and it is not — it is defence-in-depth. Measured after the rework: deleting the `phase === 'game'` conjunct alone leaves **29/29 ball-save tests and 52/52 golden tests green**, because the `sources` conjunct independently forbids arming outside a ball. Both conjuncts are kept — a future story that enables ball save outside a game would need the phase test — but a later reader must not believe the phase gate is what protects the state hashes, nor that removing it would be caught. The lesson is the one this epic keeps relearning, and this time it was the *architecture record itself* that carried the unverified claim: a guard nobody has watched fail is not known to guard anything. (2) **Re-arm.** A save re-serves through `c_autolaunch`, which opens `s_shooter_lane` and so emits `ball_launched` — the very event this clause arms on. Read unqualified, that re-arms a **fresh full window on every save**, and the ball becomes immortal: measured twice independently at production tuning (`ballSaveMs` 8000, grace 2000, `tickHz` 1000) over 120,000 ticks, seed 0, no input — **28 `ball_saved`, zero `ball_ended`**, because the 8,000-tick window exceeds the shipped table's ~4,274-tick natural drain interval and restarts on each save. Control: `ballSaveMs` 500 / grace 100 gives zero saves and `ball_ended` at the same tick 4273, so the null result is real and not a blind harness. Ball 2, the bonus, lane rotation, game over and Match were all unreachable. The author decided: **a player plunge arms the window; a save's own re-serve does not.** Behaviourally identical to one-window-per-ball in single-ball play — a player never plunges mid-ball — while keeping AD-18's multi-source arbitration meaningful so Story 3.7's multiball arming still has somewhere to live. Note for later stories: the implement stage's own review saw this shape and dismissed it as *mandated by this clause*, reasoning from the text without measuring the consequence] — which **closes on the next playfield closure of any kind, Top lane included**: the first Top lane the ball enters decides hit or miss, and an **unlit** Top lane is a *miss, not a skip* [AMENDED 2026-09-06, Story 2.7 implement gate — resolves a genuine AD-6 / PRD-FR-18 conflict. This parenthetical previously read "closes on the next playfield closure that is **not** a Top lane", which contradicts PRD FR-18's own "the Skill shot is only available until the first other switch closes" and Story 2.7 AC 2's "before any other playfield switch closes". The two readings are different games — under the old wording a ball could rattle through unlit Top lanes and still pay on the lit one, with lane change live during flight. The author decided the FR-18 reading: **lane change matters before the plunge, not during**, which is how most real machines score a skill shot. The old wording is read as shorthand for "not the Top lane you were aiming at"]. Device counts in `GameState` are the number of closed slot switches and nothing else; rules enforce capacity and answer a slot beyond it (`device_overflow`) with an immediate eject. Drop targets (`s_dragon_[d,r,a,g,o,n]`) and the spinner keep mechanical state in physics — a dropped target is non-collidable until `pulse c_dragon_bank_reset` raises the bank; the spinner is a **pass-through gate, not a collision body** [AMENDED 2026-09-03 — resolves the PRD:71 / AD-6 conflict Story 2.1c surfaced]: a ball crossing its `sw_spinner` zone imparts rotation proportional to entry speed, and the spinner then closes `s_spinner` **once per revolution until it decays** (FR-26 awards per rotation). A real spinner is a freely-rotating gate the ball passes *through*, not an obstacle it strikes. Story 2.1c measured thirteen-plus rigid-body variants across both Loop paths and every one that genuinely contacted the ball produced a permanent DW-119-class stall — a static rigid body cannot graze a 13.495 mm-radius ball with the precision the orbit paths allow — so the analytic swept-segment zone test (AD-11) is the physically correct model here, not a workaround for one. **Story 2.3 owns the spin and decay mechanism**, driven off that zone crossing. A node nothing collides with is not `col_` under AD-11's prefix contract, so `col_spinner_l` is renamed `vis_spinner_l` in the device-behaviour story, batched with `bd_lock`'s golden re-record because either change alone moves `assetHash` — while letters and counts live only in rules. Ball search is a rules protocol of tick-timed pulses in `TABLE.ballDevices[*].ballSearchOrder`; its final stage issues `RecoverCommand`, the one command that lets physics despawn every ball outside a device; physics returns the `recovered` count from `step()` and the ball controller emits `ball_missing { count }`.

### AD-7 — `GameState` is one plain-data tree with fixed ownership scopes

- **Binds:** FR-17, FR-20, FR-25, FR-28, FR-37, FR-39, FR-41, FR-51, UJ-3; `sim/rules`, `sim/contracts`
- **Prevents:** per-player facts on the machine and machine facts on a player; a Joust running into the next player's ball; a lit lane lost when the skill-shot mode stops; state that cannot be snapshotted, hashed, or replayed
- **Rule:** `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }`, JSON-serializable, no class instances or closures, mutated only inside `rules.step`. **Player-scoped** (only under `players[i]`): score, DRAGON letters, Lock credits, modes played, tilt warnings, bonus by category and multiplier, extra balls, lanes (lit flags and completed sets, owned by the base mode; the skill-shot mode writes the lit Top lane once on `ball_starting` from `rng` and never again), Jackpot seed and Wars started. **Machine-scoped** (only under `machine`): device slot states and `ballsInPlay`, `hardwareEnabled`, `ballSave`, `tilt`, `multiball` (`null` | `'quickmb'` | `'war'`), `highscores` (read-only, from `GameStart`). **Mode-local** (only under `modes[i]`): the mode's own timers and counters, published to presentation only as its typed `ModeView`. `modes[]` is empty between balls: every active mode receives `_will_stop` before `ball_ended`; `ball_will_start` resets `ballSave`, `tilt` and `multiball`; `ball_starting` enables hardware. The bob is never reset by command — its physical decay plus `tiltSettleMs` is the settle. [AMENDED 2026-09-10, Story 2.11 close. This records a shipped seam the Rule did not describe, found by the story-close spine check. **Rules controllers hold tick-scoped closure state outside `GameState`.** This is a class, not a list. [CORRECTED 2026-09-11 at Story 2.11's second code review, DW-255. The first version of this clause said five such fields had shipped, and required every new one to be named here. At least ten exist, and a list that must be kept complete by hand is exactly the kind of record this spine keeps finding stale.] The inventory at Story 2.11 can be re-derived as every mutable binding declared in a `create*()` factory's closure under `sim/rules/`:
- ball controller: `awaitingSaveLaunch`; `awaitingSaveRelaunch` (Story 2.9), which is bounded and clears once `startTick + ballSaveGraceTicks` has passed; and `pendingBonusCountSteps` (Story 2.10's bonus count-up schedule);
- tilt controller (`sim/rules/tilt.ts`, Story 2.11): `lastBobClosureTick` and `lastWarningTick`, the origins of the tilt spacing and settle windows, both discarded if `tick` runs backwards;
- rules root (`sim/rules/index.ts`): `pendingLifecycleEvents`;
- modes (`sim/rules/modes/index.ts`): `pendingStartPlayer`;
- devices layer (`sim/rules/devices/index.ts`): `occupancy` and `pendingLockLaneClosure`;
- shot tracker (`sim/rules/devices/shots.ts`): `inFlight`.

For the tilt and ball-controller fields, the reason for living in a closure is recorded: `machine` is serialized in every golden's snapshot, so a new machine-scoped field would re-record every `expectedGameStateHash`. All of them stay deterministic because `createRules()` builds every controller fresh inside `createLoop()`, and a replay always starts from `GameStart` at tick 0 (AD-4).

The consequence a later reader must not miss: **`GameState` is not a complete mid-game resume point.** A snapshot restored mid-ball would lose this state: a pending save relaunch forgotten, bonus count-up steps dropped, the tilt windows restarted, a shot in flight or a pending Lock-lane closure lost. The state hash cannot see any of it. A story that needs mid-game snapshot and restore must first move this state into `GameState`, which is a golden state-hash re-record and needs the author's grant. Any new closure field must meet the same bar: reproducible from tick 0, and bounded or restart-safe. Re-derive the inventory from the code rather than trusting the list above.]

```mermaid
erDiagram
  GAME_STATE ||--|| MACHINE : "has one"
  GAME_STATE ||--o{ PLAYER : "has 1..4"
  GAME_STATE ||--o{ ACTIVE_MODE : "stacks by priority, empty between balls"
  GAME_STATE ||--|| RNG : "seeds rules randomness"
  MACHINE ||--o{ BALL_DEVICE_SLOTS : "counts by slot switch"
  MACHINE ||--|| BALL_SAVE : "one device, armed by modes"
  ACTIVE_MODE ||--|| MODE_VIEW : "publishes"
  PLAYER {
    int score
    string letters
    int lockCredits
    int tiltWarnings
    int jackpotSeed
    json lanes
    json bonus
  }
  MACHINE {
    int ballsInPlay
    string multiball
    bool hardwareEnabled
    json tilt
  }
```

### AD-8 — Modes stack by unique numeric priority and speak the four-phase event convention `[ADOPTED]` `[AMENDED 2026-09-06 — phasing recorded: Epic 2 builds the minimal stack, Story 3.1 makes the four-phase convention real; no rule is relaxed]`

- **Binds:** FR-33..FR-41; `sim/rules/modes`
- **Prevents:** two modes both claiming the Backglass; a Hurry-up timer paused by a multiball; ad-hoc start/stop hooks; a mode parsing raw switches
- **Rule:** Priorities are unique — base 100, skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500 — and a duplicate is a dev-mode assertion. Each active mode receives every device and shot event (AD-19), highest priority first; scoring accrues from all active modes; presentation priority is the highest active mode. A mode owns its internal timers and contributes lamp roles by priority to `lampsOf(state, hurryUpTicks)` (AD-9); it never emits a `CoilCommand`. Start and stop go only through `mode_<name>_will_start / _starting / _started` and `_will_stop / _stopping / _stopped`. **Phasing (recorded 2026-09-06, Story 2.7 spec gate).** This Rule states the *target*, and the author's own epic structure already phases it: Story 3.1 (`epics.md`) is chartered to take “the minimal stack from Story 2.7” and *generalise* it — the once-declared priority table, the duplicate-registration assertion, and the four-phase lifecycle as the only start/stop path — and Story 2.5's AC 5 was formally amended on 2026-09-06 handing the `_will_stop` broadcast to 3.1 in writing. So Epic 2 ships a **minimal** stack (base 100 + skill shot 200) that starts and stops modes directly, with no lifecycle events and no registry. Until Story 3.1 lands, an implementation that omits the six lifecycle events is conforming, not violating; from Story 3.1 onward the Rule binds in full and a direct start/stop path is a defect. This amendment records a decision the planning artifacts already carry — it relaxes nothing and adds no new permission.

### AD-9 — Closed command union; outputs address devices by name and semantic step; lamp state is a projection

- **Binds:** FR-3, FR-30, FR-42..FR-45, FR-48; `sim/rules`, `sim/loop`, `presentation/*`
- **Prevents:** RGB or blink cadence in rules; a mode "turning its lamps off"; display strings formatted in rules; a flasher left on; presentation joining a tick-*t* event to a tick-*t+N* snapshot; the Dragon animated from three different truths
- **Rule:** The rules→physics commands are `CoilCommand { coil, action: 'pulse' | 'enable' | 'disable' }` — a device eject is `pulse` on `TABLE.ballDevices[bd].ejectCoil`, resolved by the ball controller — and `RecoverCommand` (ball search only, AD-6). Rules→presentation commands are `LampCommand { lamp, role, step }`, `GiCommand { channel, level }`, `FlasherCommand { flasher, ms }` and `ShowCommand { show }`, nothing else. **Lamp state is a pure projection** `lampsOf(state, hurryUpTicks): LampState` computed by rules every step (modes contribute roles by priority) [AMENDED 2026-09-07, Story 2.9 — signature corrected from `lampsOf(state)`. A lamp whose step depends on *elapsed time* (the ball-save hurry-up, this Rule's own named example) needs a duration the projection cannot read off `state`. The shipped seam threads it in as a parameter resolved from tuning by `sim/loop`, **not** as a new `GameState` field: `GameState` is hashed (AD-15), so a field there would move `expectedHash`/`expectedGameStateHash` on all five replay goldens for a value that is a constant of the build, not a fact about the game. Recorded because the next timed-lamp story would otherwise have no reason not to add the field and pay five state hashes for it. The projection stays pure — same inputs, same output. The sequence diagram above and AD-8's reference were updated to this signature in the same pass]; `sim/loop` emits the diff as `LampCommand`s; `step ∈ {0 off, 1 lit, 2 emphasised, 3 urgent}` is the only progression rules may express — Jackpot ladder, ball-save hurry-up, Charge — and `presentation/lighting/grammar.ts` is the one `(role, step)` → RGB, intensity and cadence table, with blinking timed by presentation. `role ∈ { off, lit, hurryup, quickmb, joust, dragon, special }` — never a colour. `GiCommand.level` (0..1) is the only continuous level and also drives the architectural channels (`gi_backbox`, `gi_cabinet`, `gi_arch`), set once per phase. `FlasherCommand.ms` is the only wall-time duration, honoured by the flasher driver's duty-cycle limiter. `ShowCommand` addresses any named non-lamp effect in `TABLE.shows` — audio cues and mechanism animations alike (`show_dragon_mouth_open` is a show). Every semantic event is **payload-complete** (`ball_ended { player, bonusByCategory, multiplier, total, tilted }`, `war_strike { remaining, jackpot }`, `match_drawn { number, winners[] }`, …); presentation never joins an event to the snapshot. The snapshot is for continuous display only, and `ModeView` is the only shape of `modes[i]` presentation may read. Rules never format text.

### AD-10 — One canonical frame, three sanctioned conversions, geometry authored unpitched, reference dimensions asserted

- **Binds:** FR-4, FR-10, FR-29; `sim/table/frames.ts`, `sim/physics/loader`, `presentation/scene`, `assets/`
- **Prevents:** Blender Z-up, glTF Y-up, VPX y-down and Babylon's left-handed default meeting in four files; the ball rendered at the mirror of its collision position; pitch applied twice or nowhere; a ball or playfield the wrong size
- **Rule:** The **table frame** is playfield-local millimetres, right-handed: origin at the playfield's bottom-left corner nearest the player, X across to the right, Y up the playfield away from the player, Z normal to the playfield toward the glass. `TABLE.reference = { playfieldMm: { w: 514.4, h: 1066.8 }, ballMm: 26.99, pitchDeg: 6.5, flipperBatIn: 3.125 }` and the loader asserts the `col_playfield` bounds and flipper node lengths against it within tolerance. Geometry is authored **unpitched**; Pitch is applied by physics as the gravity vector (the VPX slope model) and by presentation as a rotation of `playfield_root` only, about `pivot_pitch`, by the effective pitch read from the snapshot each frame — never by tilting geometry. The **glb frame** is Blender's default glTF export with no added rotation: metres; glb +X = table +X; glb +Y = table +Z; glb −Z = table +Y. Physics keeps VP units internally (1 U = 0.53975 mm; ball radius 25 U; VPX y-down frame). `frames.ts` exports exactly three conversions — `glbToTable()` (used only by the loaders at load time), `toPhysics()`, `toScene()` — and no other file converts units or axes. The Babylon scene is created with `useRightHandedSystem = true`, so no `__root__` handedness flip exists and `toScene()` is mm→m plus the same permutation as `glbToTable⁻¹`.

### AD-11 — Blender owns placement and geometry; `TABLE` owns devices, wiring, groups and tunables; the export script is the contract's enforcer

- **Binds:** FR-4, FR-11, FR-26..FR-31, FR-43, OQ-5, OQ-6, §6.3; `assets/src`, `tools/export.py`, `sim/table`, `sim/physics/loader`, `presentation/scene`
- **Prevents:** flipper positions in TypeScript disagreeing with the mesh; a device with no switch; a light-group spelled two ways; a decorative mesh the ball hits; `sim/` parsing glb (and therefore needing Babylon in a headless test); a fast ball skipping a thin rollover; art blocking epic 1
- **Rule:** `assets/src/dragonwar.blend` is the sole owner of every position, mesh and switch zone. `src/sim/table/dragonwar.ts` exports `TABLE as const` — the sole registry of switches (with `settleTicks` class), coils, lamps (channel + group), flashers, ball devices (capacity, slot switches in fill order, eject coil, `ballSearchOrder`), shots, shows, `lightGroups`, `reference` — plus wiring and glb node names. `tools/export.py` runs every export with `export_yup` and `export_extras` on, validates node names (`^[a-z][a-z0-9_]*$`, unique across all glbs, one material each) and every `lightgroup`, `surface` and `phys_material` property against a JSON dump of `TABLE`, writes `public/assets/dragonwar.glb` for presentation **and** `public/assets/dragonwar.collision.json` (`col_`/`sw_`/device nodes, mm, table frame) for `sim/physics/loader` — `sim/` never parses glb. Both loaders fail fast at load time on a missing node or an unknown property value. Node prefixes: `col_` collision scaffolding (invisible, the only thing the ball hits; must reduce to the ported primitive set — circle, point, 2D/z-axis/3D line segment, plane, triangle, 3D polygon — under the quadtree + k-d broadphase; carries `surface` and `phys_material`), `sw_` switch zones (analytic tests against the ball's per-tick swept segment, never the end position), `vis_` visuals (non-collidable), `l_` inserts (lens **and** cup geometry below the surface, never a decal; the playfield material carries a translucency mask from the first export), mechanisms named as their device. The glb has exactly two top-level nodes, `playfield_root` and `cabinet_root`, plus `pivot_pitch`. The playfield collision is one compound body; walls and floor have real thickness; static meshes carry `TEXCOORD_1` lightmap UVs and a `lightgroup` from `TABLE.lightGroups`; no LOD chains. Epic 1 ships a placeholder `.blend` of primitives that already follows every prefix — the pipeline, not the art, is the deliverable.

### AD-12 — Four lighting channels behind one lamp driver; clustered forward is the WebGL2 floor; UV2 contract now, per-group bake later

- **Binds:** FR-42, FR-43, FR-45, FR-54, NFR-1, UJ-4; `presentation/lighting`, `host/boot`, `assets/`
- **Prevents:** camera-projected lightmaps that lock the camera; a bake pipeline on the critical path; a WebGPU-only feature making the WebGL2 path degraded; a WebGL2 floor nobody ever runs
- **Rule:** GI, inserts, flashers and architectural lighting are four channels of named lamps behind `LampDriver`. Babylon clustered forward lighting runs on WebGL2 (verified 2026-08-26, ~23 lights per batch; re-verify 2026-09-26) and **is the WebGL2 dynamic path**; the live dynamic-light budget on the floor is 20 per frame `[ASSUMPTION]`. The runtime composite is `base + Σ groupᵢ × tintᵢ × levelᵢ`, inserts baked white and tinted by role; early phases drive inserts as emissive material plus dynamic lights behind the same driver, and the per-group additive bake — earned by indirect bounce and contact-soft shadows, not light count — replaces them later without touching rules, `TABLE`, or mesh names. **The early-phase insert lens is transmissive, so the "plus dynamic lights" half is load-bearing from its first story** [AMENDED 2026-09-07, Story 2.8, author-decided]: an insert's `PointLight` sits beneath its lens (table z = -4 mm, inside the cup) and the lens's only visible face is its top with normal +table-z, so N·L < 0 across that entire face — an opaque lens makes fourteen lights and the whole live-light-budget machinery govern a path that changes **no rendered pixel** (found at Story 2.8's code review against a green 1822-test suite; `NullEngine` rasterises nothing, so no automated test in that story could see it). `LampDriver` therefore sets `subSurface.isTranslucencyEnabled` on each insert's own cloned `mat_insert`: Babylon computes that transmitted-diffuse term **only** for back-hemisphere light (`computeDiffuseTransmittedLighting` runs under `NdotLUnclamped < 0`, GLSL and WGSL alike), which is exactly this geometry. It is a material change inside the driver this AD already names — it adds no light, changes no light list, raises no `maxSimultaneousLights`, touches no `vis_playfield`, keeps the insert in the opaque pass, moves neither `tableHash` nor `assetHash`, and does not pre-empt the per-group bake, which is still earned by indirect bounce and contact-soft shadows rather than by light count. Three clauses bind whoever touches it next. (1) The transmitted term is added *after* the albedo multiply, and an insert light's intensity is a **tuned** quantity that must preserve the role's colour rather than clip it to white — a lamp that reads yellow-white has lost the grammar this channel exists for. `mat_insert`'s own `usePhysicalLightFalloff` would give 1/d² at d ≈ 3.7 mm, i.e. an attenuation on the order of 73,000, so the driver **overrides each insert light to bounded `FALLOFF_STANDARD` with an authored `range`** precisely to satisfy this clause [AMENDED 2026-09-07, Story 2.8 rework 3, correcting this amendment's own stale premise — DW-215]. (3) **In the scene as it stands the insert light is not yet visually load-bearing, and that is a property of the SCENE, not of this driver.** Measured in a real browser on the WebGL2 path: a lit insert's entire visible signal is 7.8 luma out of 255 (~3%), and toggling its dynamic light moves the lit pixel by **0.00 luma**, because `create-engine.ts` creates a single unparameterised `HemisphericLight` at default intensity and the render path configures no exposure or tonemapping at all — so the insert is already at the LDR ceiling before any lamp contributes. Retuning the emissive to make headroom was tried under author authorisation and cannot work: the composited ceiling is reached near raw emissive 0.12–0.15, below the whole 0.5–0.7 band. **Story 4.1 owns creating the headroom** (exposure/tonemapping and a driven GI contribution) and **Story 4.2 owns the playfield's alpha dilution over the lens**; Story 2.8's AC 4 carries the numbers, the `setLightBudget(0)` instrument and the falsification condition, so neither story re-derives them. (2) glTF cannot carry this: Blender exports only `KHR_materials_transmission`, which Babylon maps to *refraction*, not translucency, and this project deliberately registers **no** glTF extensions (payload, `create-engine.ts`) — so an insert transmission authored into the glb is silently discarded at load and any assertion over it is vacuous. Author it in the driver, never in the asset. Spill through the playfield's translucency mask onto adjacent playfield art remains Story 4.2's. No feature may require WebGPU; WebGPU only improves quality. The engine is chosen once at boot (`EngineFactory.CreateAsync`) before the scene exists; `?renderer=webgl2` and a Settings toggle force the WebGL2 engine, and the feel ritual (UJ-4) runs on both paths.

### AD-13 — Audio shows by name behind an asset provider; mechanical sound from contacts, cues from shows `[ADOPTED]`

- **Binds:** FR-46..FR-48, OQ-7; `presentation/audio`, `sim/table`, `host/boot`
- **Prevents:** a sound triggered twice (from an event and from polled state); game code that knows whether a sound is synthesized or recorded; a swap of recordings touching rules; a silent walk-up
- **Rule:** Every sound is a named show in `TABLE.shows`. `AudioAssetProvider` resolves a show name to its source — a synth function or a sample URL — and is the only place that knows which. Mechanical sounds fire from `ContactEvent` (contact `speed` → gain and pitch, `surface` → sample; actuation kinds → coil, flipper, bank and eject sounds); rules-driven cues fire from `ShowCommand` only, never from state polling; ball roll is one continuous voice per `ballId` driven per frame from snapshot speed, surface and position. Events are scheduled by their tick offset within the frame. Masters are `.wav` in `assets/src/`; shipped samples are `.mp3` in `public/assets/`. The graph is Web Audio in presentation, unlocked by the press-to-begin gesture before the walk-up sounds; nothing in `sim/` references audio.

### AD-14 — Persistence is host-only; one versioned document; `GameStart` is the only bundle into sim; settings split by owner

- **Binds:** FR-49..FR-52, NFR-7, NFR-8; `host/persistence`, `host/settings`, `sim/loop`, `sim/rules`
- **Prevents:** rules reading `localStorage`; a volume change waiting for the next game; a high-score table with no path into the initials phase; an unversioned blob that breaks on the first schema change
- **Rule:** One `localStorage` key `dragonwar.save` holds `{ v, settings, keybindings, highscores }` with a forward-migration function per version bump. `sim/` never touches storage. `GameStart { seed, tuning, adjustments, highscores }` is the one bundle the host hands `sim/loop` at game start; `highscores` is read-only inside `sim/`; rules own the `highscore_entry` phase (driven by cabinet switches) and emit `highscore_entered { player, initials, score, rank, grandChampion }`, on which and nothing else the host persists. Settings split by owner: **sim adjustments** (Pitch, Tilt warning count, balls per game, Match probability) layer table defaults → preset (deferred; a preset may lock keys) → player overrides and apply at the next game; **host settings** (volume, key bindings) apply immediately, and the host passes `ViewConfig { bindings }` to presentation for Attract. Rebindable keys are the only accessibility feature in v1.

### AD-15 — Solver constants are ported verbatim; table tunables live in one file with provenance; replays and headless tests are first-class

- **Binds:** NFR-5, UJ-4, SM-4; `sim/physics/constants.ts`, `sim/table/tuning.ts`, `sim/loop/replay.ts`, `test/`, `host/dev`
- **Prevents:** `PHYS_SKIN` on a slider; a do-not-invent number invented; magic table values scattered across physics files; a feel-test change that cannot be captured; a golden that fails because Safari's `Math.sin` differs from V8's
- **Rule:** Two constant classes. **Solver constants** (`sim/physics/constants.ts`: `PHYS_SKIN`, `PHYS_TOUCH`, `C_DISP_GAIN`, `STATICTIME`, ball–ball restitution, and their peers) are ported verbatim, tuned for `TICK_HZ = 1000`, never tunable; changing one is a physics-version bump that re-records every golden. **Table tunables** (`sim/table/tuning.ts`: the four per-object material parameters `{ elasticity, elasticityFalloff, friction, scatter }` with VPX defaults 0.3/0/0.3/0 in a named material table; flipper strength, ramp-up, EOS, return; hop control; pitch bounds; every timer in ms; scoring values; `matchPercent`; `tiltWarnings`; slam threshold) each carry `source` and `confidence`, and the research's do-not-invent numbers ship marked `unverified`, changed only by measurement against the Reference machine. Rules are tested headless in Vitest via a switch-script DSL typed by `SwitchName`. Physics is tested by replaying `test/replays/*.replay.json` (schema in `sim/contracts/replay.ts`) and asserting the **state hash**: FNV-1a over canonical JSON of `GameState` plus ball positions quantised to 0.01 mm; goldens are recorded in Node in CI, and browser parity is asserted on `GameState` only. The dev tuning panel hot-applies table tunables to the running sim and exports to `tuning.ts`; a hot-apply during a recording invalidates it. When a tuning change trades feel for fidelity, feel wins and the Reference-machine ritual decides. No automated presentation tests in v1 beyond a `NullEngine` load smoke. **A tunable's `source` and `confidence` strings are part of the hashed contract, not commentary** [AMENDED 2026-09-05, Story 2.2]: `resolveTuning()`'s entire serialized output is hashed into every replay golden's `gameStart.tuning` header, so correcting a `source` string in place invalidates all five goldens with `StaleReplayHeaderError` exactly as a numeric change would -- measured at Story 2.2, where a prose-only fix took the suite from 93 files/1488 passing to 91/1454 with 34 skipped, reproduced 3/3 times. A provenance correction is therefore never free: budget a header-only re-record in the same change, or route the correction to a story that is re-recording anyway.

### AD-16 — Boundaries are linted in CI by a TypeScript-API-free tool; ported and borrowed files keep their notices `[ADOPTED]` `[AMENDED 2026-08-30 — three complementary gates: presence, structure, imports; supersedes the same day's single-authority amendment, which was factually wrong]`

- **Binds:** FR-55, NFR-9, AD-1..AD-3; `src/**`, `test/**`, `tools/**`, CI
- **Prevents:** the layer rule eroding one convenient import at a time; a wall-clock or random draw leaking into `sim/`; engine physics creeping in through Havok; a port that strips the copyright it depends on; a ported body drifting from upstream after review has passed; a non-commercial file entering the repository; and — the 2026-08-30 near-miss — one of these gates being retired as a duplicate of another when it is not
- **Rule:** dependency-cruiser runs in CI (TypeScript 7.0 ships no compiler API, so no lint may depend on one): `sim/**` may not import `presentation/**`, `host/**`, `@babylonjs/*`, or reference `window`, `document`, `performance`, `Math.random`, `Date`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `localStorage`, `navigator`, `globalThis`; `presentation/**` may import only `sim/contracts` and `sim/table` from `sim/`; `host/**` may import `sim/contracts`, `sim/table`, `sim/loop` and `presentation/**`, never `sim/physics` or `sim/rules`; `@babylonjs/havok` is banned everywhere; device-name string literals outside `sim/table/dragonwar.ts` and `test/**` are errors. Files ported from vpx-js live under `src/sim/physics/` with their original copyright headers preserved plus `// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0`; new files carry the GPL-3.0 header. Code from `vpinball/vpinball` only from files whose first line is `// license:GPLv3+`; `vpx_lightmapper` is technique-only until its licence is verified; assets from `pinball-parts` exclude its NC-SA node group; author recordings are mechanical noise only. The `ATTRIBUTIONS.md` entry lands before the file does, and licence compatibility is re-checked whenever the renderer or the physics source changes. **Three complementary gates enforce this, and none may be retired in favour of another:** (1) **presence** — `pnpm check:headers` (`tools/check-licence-headers.mjs`) asserts that every tracked source file, discovered from `git ls-files`, carries one of the three sanctioned markers. It is an existence check over the whole repository and performs no structural check. (2) **structure** — `test/port-provenance.test.ts` asserts that the upstream VPDB copyright block is intact verbatim, that the authored and ported branches are disjoint so an undeclared file can never reach the authored branch, and that `VPINBALL_PORTED_FILES` names only real files with the three provenance sets mutually disjoint. The same file carries the AD-15 verbatim solver-constants pin and the DW-79 port-body freeze (a hash manifest over every declared ported file, `resolved-by:1-8`). It reasons about content the presence gate never reads. (3) **imports** — `tools/boundary-lint.mjs` (`test/boundary-lint.test.ts`) owns this AD's first half: the import rules, the banned-global scan, the tick/ms rule and the device-name-literal rule. It asserts nothing about licence headers. Presence cannot detect a stripped copyright block; structure does not enumerate every file; imports are a different question entirely. Demonstrated 2026-08-30: deleting the whole upstream VPDB block from `src/sim/physics/anim-object.ts` while keeping the one-line port marker leaves `pnpm check:headers` green and turns the structural gate red. Ownership is explicit — `test/port-provenance.test.ts` is owned by Story 2.0 and names its owner in its header comment, because the file it was renamed from was edited by all ten Epic 1 stories with no owner at all.

### AD-17 — Static bundle, relative paths, gate and error panel before assets, no-network enforced, size budget and release identity in CI

- **Binds:** FR-53, FR-54, NFR-4, NFR-6, NFR-7; `host/boot`, `index.html`, build, CI
- **Prevents:** a build that assumes a URL origin and breaks under Tauri; a broken canvas on an unsupported browser or a failed asset; a stray fetch after load; the load-time NFR discovered at release; a release nobody can name
- **Rule:** The build is a static `dist/` with relative asset paths and no service worker. `index.html` carries `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' blob:; img-src 'self' blob:">` and CI greps for it; no network after load. Boot renders a press-to-begin panel, checks WebGL2 first and shows the unsupported-browser message naming Chrome, Edge and Safari before any asset loads; any later boot-stage failure (asset 404, glb parse, engine creation) renders the same host error panel; WebGL context loss uses Babylon's restore path while the sim keeps stepping. CI enforces a compressed initial-payload budget of 20 MB `[ASSUMPTION — re-set by spike 3]`, stamps the commit SHA into the build (shown in Settings), and `v1.0.0` is tagged at release.

- **Amended 2026-08-28 (Story 1.4):** the CSP is now `default-src 'self'; connect-src 'self' blob:; img-src 'self' blob:`. **Forced by:** Babylon.js serves images embedded in a `.glb` through `blob:` URLs, so the first textured asset (Story 1.4's placeholder playfield) made the app fail to boot under the previous policy -- the browser blocked the blob on `connect-src` and the image on `default-src` via the `img-src` fallback. `NullEngine` never decodes images, so all 442 automated tests passed; the lead's per-story browser smoke caught it. **Intent survives:** `blob:` is a same-document scheme that cannot reach the network or exfiltrate, so NFR-7's no-network guarantee still rests entirely on `connect-src` admitting no remote origin. The narrower grant was verified sufficient in a real browser -- `data:` was deliberately NOT added, because the re-smoke showed zero CSP violations without it.

### AD-18 — Single arbiters for the overloaded seams: the Lock lane, ball save and the multiball flag `[AMENDED 2026-09-11 — phasing recorded: until Story 3.2 builds the Lock arbiter nothing pulses c_mouth; ball search skips the Lock and a bd_lock overflow is tolerated without an eject; no rule is relaxed]`

- **Binds:** FR-19, FR-30, FR-33, FR-35, FR-37, FR-38, FR-40, FR-45, UJ-3; `sim/rules/ball-controller`, `sim/rules/modes`
- **Prevents:** the ball controller and the War mode both deciding a Lock-lane entry and both pulsing the Mouth; a mode and the ball controller both ejecting from the trough on one drain; two definitions of "a multiball is running"; a mouth that opens after the ball has left
- **Rule:** The **Lock arbiter** in `sim/rules/ball-controller/` is the only consumer of `lock_lane_entered` and emits exactly one of `lock_lane_locked`, `lock_lane_mode_start { candidates[] }`, `lock_lane_strike`, or `lock_lane_spit` (device full of another player's balls; the credit still counts). It alone pulses `c_mouth` and serves from the trough after a lock entry; when lock and mode start both apply it credits the lock first; the mode-select window (`modeSelectMs`) is its timer, the ball stays parked in `bd_lock` meanwhile, flipper edges move the selection and Start or either flipper confirms; every Mouth eject is preceded by `ShowCommand show_dragon_mouth_open` and follows it by `mouthOpenLeadMs` (converted at load). **"A multiball is running"** means `machine.multiball !== null`, set only in the `_starting` phase of Quick multiball or the War and cleared only in their `_stopped` phase — never derived from `ballsInPlay`. **Ball save** is one machine device, `machine.ballSave`, owned by the ball controller: a mode calls `ballSave.arm({ ticks, source })` / `disarm(source)` through a rules-internal interface, sources stack and the longest live window wins, Tilt disarms all; only the ball controller pulses `c_trough_eject` and `c_autolaunch` and mutates `ballsInPlay`. **Phasing (recorded 2026-09-11, Story 2.12 spec gate — AD-8's precedent).** This Rule's Lock clauses bind from Story 3.2, which builds the Lock arbiter, `show_dragon_mouth_open` and `mouthOpenLeadMs`; before it nothing may pulse `c_mouth` at all, because nothing can satisfy the Mouth-open lead. Ball search (Story 2.12) therefore issues nothing at `bd_lock`'s `ballSearchOrder` steps, and a `bd_lock` `device_overflow` is tolerated without an eject; the three clauses that would pulse the Mouth — ball search's Lock steps, the skip of `c_mouth` while a mode publishes `timerTicks`, and the Lock-overflow eject — are Story 3.2's acceptance criteria. Nothing is lost meanwhile: a ball parked in `bd_lock` is removed from simulation and counted by its closed slot switch (AD-6), so it is never missing and a search Mouth pulse could never find one. Author decision, relayed by the orchestrator.

### AD-19 — A devices-and-shots layer is the only consumer of switches; modes consume device and shot events

- **Binds:** FR-18, FR-25..FR-28, FR-32, FR-34, FR-36, FR-39; `sim/rules/devices`, `sim/table`
- **Prevents:** Joust, Hurry-up and the War each deciding what "a Loop" is; letter and spinner counting duplicated per mode; a shot window hard-coded in three places
- **Rule:** `sim/rules/devices/` is the only consumer of `SwitchEvent`. It owns the drop bank (letters and the reset coil) [AMENDED 2026-09-11, Story 2.12 spec gate — the drop-bank component remains the ONLY caller of `c_dragon_bank_reset`; ball search *requests* a bank reset through it and never pulses the coil itself], the spinner count, ball-device slots, the shooter lane, and **shots** — declared in `TABLE.shots` as ordered switch sequences with tick windows (`shot_left_loop = [s_loop_l_in, s_loop_l_out] within loopWindowMs`) — and emits device events only: `shot_<name>_made` / `_broken`, `ramp_made`, `bank_target_down { letter }`, `bank_completed`, `dragon_hit`, `lock_lane_entered`, `spinner_spin { count }`, `lane_entered { lane }`, `lane_change_pressed { side }`, `ball_launched`, `device_ball_entered { device, slot }`, `device_ball_left { device, slot }`, `button_pressed { button }`, and `playfield_switch_closed { switch }`, `tilt_bob_closed` and `slam_tilt_closed` [AMENDED 2026-09-08, Story 2.11 plan gate — the cabinet's two switches, `s_tilt_bob` and `s_slam_tilt`, already reach `rules.step()` and were **silently dropped**: `buildPlayfieldSwitches()` excludes both settle classes and no dispatch branch matched them, so no device event existed for the one input Tilt is built on. Story 2.11 adds the two branches. They deliberately do **not** join the derived `playfield_switch_closed` set — a tilt bob is not a playfield closure and must never decide the skill shot's *first playfield closure* (AD-6), which is exactly what folding them into that set would do. Recorded here rather than left to the implementation because the 2026-09-06 amendment below made this enumeration *binding*: it is the vocabulary later stories plan against, so a shipped event missing from it is a stale seam contract. The switch names are derived structurally from their unique `SettleClass`, never written as `s_`-prefixed literals, which the boundary lint forbids outside `dragonwar.ts`.] [AMENDED 2026-09-06, Story 2.7 code-review gate — this enumeration is the vocabulary later stories plan against, so a shipped event missing from it is a stale seam contract, not a documentation nicety. Story 2.7 needed "the first playfield closure" to be decidable and it was not: slingshots, pops, the drain and a bare ramp switch emit no device event at all, and this AD forbids a mode from reading a raw `SwitchEvent`. The event fires on each `closed: true` edge of a **derived** playfield set — every `TABLE.switches` key minus the button, tilt-bob and slam classes, minus every parking device's slots, minus each non-parking device's entry switch (28 switches at this tree) — derived by subtraction from `TABLE`, never hand-typed]. Modes, scoring and the ball controller consume device and shot events and never a raw switch. The drop-bank component alone pulses `c_dragon_bank_reset`, on `ball_will_start`, on `bank_completed`, and on ball search's reset request (Story 2.12) [AMENDED 2026-09-11 — third trigger listed; same amendment as the ownership note above]. Lane *state* (lit flags, completed sets, `lane_lit`) is the base mode's (AD-7); the devices layer reports lane entries and lane-change presses only.

## Seam Contracts

The closed unions in `sim/contracts/`; every field named here is binding, everything else is the code's. The name unions (`SwitchName`, `CoilName`, `LampName`, `GiChannel`, `FlasherName`, `ShowName`, `ShotName`) are exported by `sim/table/names.ts` from `typeof TABLE`; contracts are generic over them and never import the table.

| Type | Shape |
| --- | --- |
| `InputAction` | `flipper_l · flipper_r · plunger · nudge_l · nudge_r · nudge_up · start · menu` |
| `InputFrame` | bitset over `InputAction` (levels) |
| `InputTransition` | `{ tick, frame }` — the frame in force from `tick` |
| `SwitchEvent` | `{ type: 'switch', switch: SwitchName, closed: boolean, tick }` |
| `ContactSurface` | `wood · rubber_post · rubber_band · metal · plastic · ramp · flipper · target · bumper · glass · ball · dragon` |
| `ContactEvent` | `{ type: 'contact', kind: 'hit' \| 'coil_fire' \| 'flipper_eos' \| 'drop_target_down' \| 'bank_reset' \| 'eject' \| 'spinner_tick', ballId?, speed?, surface?, pos?, device?, tick }` — ball roll is driven from the snapshot, not an event |
| `CoilCommand` | `{ type: 'coil', coil: CoilName, action: 'pulse' \| 'enable' \| 'disable', tick }` |
| `RecoverCommand` | `{ type: 'recover', tick }` — ball search final stage only |
| `LampCommand` | `{ type: 'lamp', lamp: LampName, role: LampRole, step: 0 \| 1 \| 2 \| 3, tick }` |
| `GiCommand` | `{ type: 'gi', channel: GiChannel, level: number, tick }` |
| `FlasherCommand` | `{ type: 'flasher', flasher: FlasherName, ms, tick }` |
| `ShowCommand` | `{ type: 'show', show: ShowName, tick }` |
| `SemanticEvent` | `{ type: EventName, tick, ...payload }` — payload-complete (AD-9) |
| `Snapshot` | `{ tick, balls: { id, pos, vel, speed, surface }[], mechanisms: { flippers, plunger, dropTargets, spinner, devices }, game: Readonly<GameState>, effectivePitchDeg }` — structured-cloneable |
| `ModeView` | `{ mode, priority, player, timerTicks?, value?, charge?, strikesRemaining? }` |
| `FrameOutput` | `{ snapshot, events: SemanticEvent[], contactEvents: ContactEvent[], commands: (Lamp \| Gi \| Flasher \| Show)Command[] }` |
| `GameStart` | `{ seed, tuning, adjustments, highscores }` |
| `ReplayHeader` | `{ gameStart: GameStart, physicsSeed, tickHz, tableHash, assetHash, physicsVersion }` — the whole `GameStart` (seed, effective tuning, adjustments, high scores) is embedded, not hashed |

## Consistency Conventions

| Concern | Convention |
| --- | --- |
| Device names | MPF prefixes: `s_` switch, `c_` coil, `l_` lamp/insert, `f_` flasher, `gi_` GI channel, `bd_` ball device, `shot_` shot, `show_` show. Defined once in `TABLE`, typed through `sim/table/names.ts`; a literal elsewhere (outside `test/**`) is a lint error. |
| Events | `snake_case`, MPF vocabulary; four-phase lifecycle (`ball_will_start` … `ball_ended`); ball-save `_enabled` vs `_timer_started` are distinct; device failure events (`eject_failed`, `ball_missing`, `broken`, `device_overflow`) exist in the vocabulary even if never emitted. |
| Files & types | Files `kebab-case.ts`; types `PascalCase`; commands and events are discriminated unions on `type`. |
| Time & ids | `tick: number` on every event and command; tunables `…Ms` authored, `…Ticks` after load; entities identified by `TABLE` name, balls by `ballId`, never by index. |
| Geometry & units | Table frame per AD-10; mm in `sim/table`; VP units inside `sim/physics`; metres in glb and scene; every tunable carries its unit in the name (`pitchDeg`). |
| State mutation | `GameState` mutates only inside `rules.step`; physics state only inside `physics.step`; presentation holds view state and never writes back. |
| Errors | Load-time paths (`loader/`, `GameStart`) throw and boot reports them in the error panel; step paths never throw — invariant violations are dev-mode assertions; device failure is an event. |
| Logging | `sim/` emits events; only `host/` logs (dev console). No telemetry. |
| Config | Solver constants in `sim/physics/constants.ts`; table tunables in `sim/table/tuning.ts` → player adjustments from `dragonwar.save`; nothing reads env at runtime. No i18n scaffolding: English literals live in `presentation/backglass` only. |
| Licence headers | Ported: original header retained + `// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0`; new: GPL-3.0 header. Three complementary gates, none retirable in favour of another (AD-16): `pnpm check:headers` checks **presence** per file across `git ls-files`; `test/port-provenance.test.ts` checks **structure** (upstream block intact, provenance sets disjoint, AD-15 constants pin, DW-79 port-body freeze); `tools/boundary-lint.mjs` checks **imports**. Presence cannot see a stripped copyright block. |
| Assets | `assets/src/` (Blender, `.wav` masters — editable) vs `public/assets/` (exported glb, collision json, textures, `.mp3`); every third-party or generated file in `ATTRIBUTIONS.md` first; a playfield template drawing needs an entry like any other asset. |

## Stack

Verified current on 2026-08-26 (web); the code owns these once it exists. Re-check renderer, WebGPU support and Node line by 2026-09-26; ecosystem health (vpx-js, Babylon cadence) by 2027-02-26.

| Name | Version |
| --- | --- |
| TypeScript (`tsc --noEmit` gate only — 7.0 ships no compiler API until 7.1; `types` explicit, no `baseUrl`) | 7.0.2 |
| Node.js | 24 LTS |
| pnpm (12.0.0 released 2026-08-26, not adopted at day zero) | 11.24.0 |
| Vite | 8.2.2 |
| Vitest | 4.1.11 |
| dependency-cruiser (boundary lint; no TypeScript runtime dependency) | 18.2.0 |
| @babylonjs/core | 9.22.2 |
| @babylonjs/loaders | 9.22.2 |
| vpdb/vpx-js (port source: `lib/physics/`, `lib/vpt/ball/`, `lib/vpt/flipper/`, `lib/game/player-physics.ts`; headers checked per file) | commit `e8a6d6f` (v1.3.4, 2020-11-12) |
| Mission Pinball Framework (vocabulary only, MIT) | v0.80.0 |
| Blender | 5.2.1 LTS |
| glTF | 2.0 (.glb) |
| Web Audio API | AudioWorklet (Safari ≥ 14.1) |
| GitHub Actions + GitHub Pages (no custom headers; no cross-origin isolation) | current |
| Tauri (later, same `dist/`) | 2.11.5 |

## Structural Seed

```text
dragonwar/
  src/
    sim/
      contracts/      # time.ts (TICK_HZ), input, events, commands, state, snapshot, mode-view, replay
      table/          # dragonwar.ts (TABLE as const), names.ts (name unions), frames.ts, tuning.ts
      physics/        # constants.ts (solver, verbatim), vpx-js port, loader/ (collision json), devices/, hardware-rules/
      rules/          # devices/ (switch→shots), ball-controller/ (lock arbiter, ball save, ball search), players/, modes/{base,skillshot,hurryup,quickmb,joust,war}, scoring/, lamps.ts (lampsOf)
      loop/           # fixed-step conductor, cabinet switches, replay.ts
    presentation/
      scene/          # Babylon engine (right-handed), glb load, playfield_root pitch, cabinet_root
      mechanisms/     # flippers, drop targets, spinner, plunger, dragon rig (mouth show, hit reaction)
      lighting/       # LampDriver, grammar.ts, groups, flasher driver
      backglass/      # DMD renderer (snapshot + payload-complete events → frames)
      audio/          # Web Audio graph, AudioAssetProvider, roll voices by ballId
      camera/         # walk-up, fixed view
    host/
      boot.ts         # press-to-begin, platform gate, error panel, engine factory, asset load, compose
      loop.ts         # rAF accumulator (remainder carried) → sim/loop
      input/          # key map → InputAction, tick-stamped transitions
      persistence/    # dragonwar.save, migrations
      settings/       # panel, adjustments vs host settings, ?renderer=webgl2
      dev/            # tuning panel, replay record/play
  assets/src/         # dragonwar.blend (+ epic-1 placeholder), .wav masters
  public/assets/      # dragonwar.glb, dragonwar.collision.json, textures, .mp3
  test/replays/       # *.replay.json goldens + state hashes
  tools/              # export.py (validate + glb + collision json), bake script (later)
  .github/workflows/  # ci.yml: typecheck, dependency-cruiser, vitest, build, CSP grep, size budget, deploy Pages
```

```mermaid
graph TB
  dev["Developer — vite dev, Blender 5.2, tools/export.py"] -->|git push main| ci["GitHub Actions — typecheck, dependency-cruiser, vitest goldens, build, CSP grep, 20 MB budget, SHA stamp"]
  ci -->|deploy dist/| pages["GitHub Pages — static bundle, relative paths, no headers, no server"]
  pages -->|link| browser["Chrome / Edge / Safari on Windows + macOS — WebGL2 floor, WebGPU when available"]
  browser --> save[("localStorage dragonwar.save")]
  ci -.->|later, same dist/| tauri["Tauri 2 desktop wrapper"]
```

Environments: local (`vite dev`) and production (Pages on `main`). No staging; pull requests run the checks only.

## Capability → Architecture Map

| Capability / Area | Lives in | Governed by |
| --- | --- | --- |
| §4.1 Walk-up, fixed view, Backglass, proportions (FR-1..4) | `presentation/camera`, `presentation/backglass`, `host/boot`, `assets/` | AD-9, AD-10, AD-11, AD-17 |
| §4.2 Ball and flipper feel (FR-5..12) | `sim/physics`, `sim/physics/constants.ts`, `sim/table/tuning.ts` | AD-3, AD-4, AD-5, AD-10, AD-15 |
| §4.3 Nudge and tilt (FR-13..16) | `sim/physics` (oscillator, bob, slam), `sim/rules` (warnings) | AD-5, AD-7 |
| §4.4 Standard game flow (FR-17..25) | `sim/rules/ball-controller`, `sim/rules/players`, `sim/rules/devices` | AD-3, AD-6, AD-7, AD-8, AD-18, AD-19 |
| §4.5 Shot map and devices (FR-26..32) | `assets/src`, `TABLE`, `sim/physics/devices`, `presentation/mechanisms` | AD-6, AD-9, AD-11, AD-19 |
| §4.6 Feature modes and the War (FR-33..41) | `sim/rules/modes`, `sim/rules/ball-controller` | AD-7, AD-8, AD-9, AD-18, AD-19 |
| §4.7 Lighting and colour grammar (FR-42..45) | `presentation/lighting`, `sim/rules/lamps.ts` | AD-9, AD-12 |
| §4.8 Audio (FR-46..48) | `presentation/audio`, `TABLE.shows` | AD-2, AD-13 |
| §4.9 Input, settings, persistence (FR-49..52) | `host/input`, `host/settings`, `host/persistence` | AD-4, AD-5, AD-14 |
| §4.10 Distribution (FR-53..55) | `host/boot`, `.github/workflows`, `ATTRIBUTIONS.md` | AD-16, AD-17 |
| NFR-1 Frame rate | `presentation`, `host/loop` | AD-4, AD-12 |
| NFR-2 Physics rate | `sim/contracts/time.ts`, `sim/loop` | AD-3, AD-4 |
| NFR-3 Input latency | `host/input`, `sim/physics/hardware-rules` | AD-4, AD-5 |
| NFR-4 Load | CI size budget, `host/boot` | AD-17 |
| NFR-5 Determinism and testability | `sim/loop/replay.ts`, `test/` | AD-3, AD-4, AD-15 |
| NFR-6 Platform | `host/boot` gate | AD-12, AD-17 |
| NFR-7 Persistence | `host/persistence`, CSP | AD-14, AD-17 |
| NFR-8 Accessibility and localisation | `host/settings`, `presentation/backglass` | AD-14, Conventions (Config) |
| NFR-9 Provenance | `ATTRIBUTIONS.md`, CI | AD-16 |
| UJ-4 Feel test | `host/dev`, `test/replays`, `?renderer=webgl2` | AD-12, AD-15 |

## Deferred

- **Web Worker for the simulation** — v1 is main-thread; `sim/` is DOM-free so the move is a host change, and it must use `postMessage` snapshots — Pages cannot serve COOP/COEP, so no `SharedArrayBuffer`. Revisit if spike 1 or frame profiling shows the sim contending with rendering.
- **Per-group lightmap bake pipeline** (Blender scripts, resolution, texture format, memory envelope — spike 2) — the asset contract (AD-11/12) is fixed; spike 2's light-group count is an input to the `TABLE.lightGroups` partition, which stays provisional until it runs.
- **WebGPU-only quality** (more lights per batch, better shadows) — never a feature; only after the WebGL2 path is complete and equal in feel.
- **Playfield geometry itself** (PRD OQ-6: flipper tip gap, outlane widths, post positions, loop entries, ramp height, Dragon placement) — the first design problem of epic 2, owned by the Blender source under AD-11. Acceptance carried from the brief: every shot passes Lawlor's miss test (a miss returns playable); orbit exits feed the flippers -- and, **refined 2026-09-03 (Story 2.1c)**, each Loop is a true **orbit**: the ball goes up one side, **across the top**, and down the *other* side into the **opposite** inlane (PRD:71 defines a Loop as an orbit shot). The two lane rails must therefore be joined across the top; a Loop that returns down its own side into an outlane is not an orbit. Fifteen measured diverter designs failed trying to reverse a ball inside one lane before this was read correctly; guides end at rubber posts; the Dragon is off-centre with a right-flipper straight shot and a left-flipper backhand; spinner on one loop only; six-target drop bank. A Bally template DXF/SVG is the highest-value input and needs an `ATTRIBUTIONS.md` entry first.
- **Mode-start device** (PRD OQ-5) — the Lock arbiter (AD-18) decides from state, so a separate scoop is a `TABLE` and geometry change, not an architecture change.
- **Hop control mechanism** — one explicit tunable (AD-15); vpx-js has no such knob, and it must not be implemented as scatter or randomness (AD-3).
- **Flipper hardware-rule calibration** (strength, ramp-up, EOS, return) and every scoring value — tunables under AD-15, frozen after playtest (PRD OQ-3).
- **Ball-roll synthesis technique** — the seam is AD-13; the voice implementation is presentation-internal.
- **Backglass rendering technique** (canvas-2D texture on a quad vs shader) — presentation-internal.
- **Asset split** (single `dragonwar.glb` vs table/dragon/cabinet) — node names are unique across glbs already; decide from load profiling in spike 3.
- **Tauri packaging** — same `dist/`; AD-17 keeps it viable. No decision until v1 ships in the browser.
- **Operator presets / Competition mode** — the layered adjustments store (AD-14) has the slot and the lock-keys notion; no preset in v1.
- **Credits and free play** — Match awards a free game (FR-22); v1 is free play, so the award is display-only until a credit concept is wanted.
- **Gamepad, music and speech, wizard mode, 4-ball finale** — out of v1 per the PRD; nothing in the spine blocks them (a 4-ball finale raises the machine ball count to 5 under AD-6).
- **Open gates carried, not decided here:** browser-first overrides research §8.7 by the PRD addendum's decision, and AD-17 keeps native viable at zero cost; spike 1 (a pass/fail frame-budget test of the ported loop at 1 kHz over 6 bodies — the WASM comparator is dropped because sourcing is decided) and spike 3 (measured build size and load) gate that premise and run in epic 1; renderer, WebGPU support and Node line re-check due 2026-09-26; the Reference machine is unnamed (PRD OQ-1) and affects tuning targets only.
