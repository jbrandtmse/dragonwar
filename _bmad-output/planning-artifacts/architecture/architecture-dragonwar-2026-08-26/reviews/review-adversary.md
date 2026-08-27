---
title: 'Adversarial review — DragonWar architecture spine'
lens: adversary
target: ../ARCHITECTURE-SPINE.md
status: complete
created: '2026-08-26'
---

# Adversarial review — ARCHITECTURE-SPINE.md

**Method.** For each pair of build units one level down (physics port + loop · rules ball controller + game flow · modes and the War · lighting + colour grammar · backglass · audio · input/settings/persistence · assets/Blender export · build/CI/deploy) I tried to construct two implementations that each obey every AD as written and still fail to compose: a shared type with two shapes, an entity with two owners, a state mutation with two legal paths. Each success is a hole; each hole gets the AD text that closes it.

**Verdict.** The spine's seams are the right ones and the dependency law holds, but the *contents* of the seams are under-specified exactly where the game is most overloaded: the Lock lane, the trough/ball-save eject path, the input latch, and the three coordinate frames. Twenty-four holes; three would corrupt ball accounting or break replay determinism on first contact, six more would force a rewrite of a unit after it was built.

**Ranking** is likelihood × cost, where likelihood is "how probable is it that two independent implementers pick different legal readings" and cost is "what has to be rebuilt when they meet."

| Tier | Count |
| --- | --- |
| Critical | 3 |
| High | 6 |
| Medium | 10 |
| Low | 5 |

---

## Critical

### C1 — The Lock lane entry has two legal deciders and two legal eject commanders

**Units:** *rules ball controller + game flow* (R-flow) vs *modes and the War* (R-modes).

**What the spine says.** AD-6: "Whether a Lock-lane entry is a lock, a mode start, or a Strike is decided by rules from state." AD-7: Lock credits under `players[i]`, device counts under `machine`. AD-8: modes receive every event, highest priority first; "nothing else starts or stops a mode." FR-33 (assumption): if several modes are lit the player selects with the flippers "before the Mouth ejects"; if the Lock has room the ball locks *and* the mode starts with the newly served ball.

**Legal build A (R-flow).** The ball controller subscribes to `s_lock_entry`. Credits < 2 and no multiball → increment credit, emit `ball_locked`, pulse the trough eject to serve a new ball. Otherwise (lock disabled) → pulse `c_lock_eject` immediately so the device never holds a ball it should not. Both are "rules deciding from state."

**Legal build B (R-modes).** The War mode, at priority 500, also receives `s_lock_entry` first (AD-8) and counts a Strike; the base mode sees a lit Hurry-up and emits `mode_hurryup_will_start`, opens a flipper-select window that lasts N ticks, and holds the ball parked until the window closes, then pulses `c_lock_eject` to serve the mode's ball from the Mouth. Also "rules deciding from state," also a mode owning its timers.

**Collision.** One entry produces: two `CoilCommand` ejects on `bd_lock` in the same or adjacent ticks (physics: spawn two balls? `eject_failed`? undefined — AD-6 says physics ejects only on command, not what two commands mean); or the trough serves a ball while the mode holds the locked ball for selection and then *also* ejects it — three balls with no multiball active. During the War, build A ejects the ball on entry while build B counts a Strike — fine — but build A also increments a credit if it was built before the War epic and reads "no multiball running" from `machine.ballsInPlay > 1` while build B reads it from `modes[]` containing quickmb/war. Two definitions of "multiball running" (the ball-save top-up in C2 makes `ballsInPlay > 1` true for a few ticks during single-ball play).

**Cost.** The whole mode-start/lock/War-start flow is rebuilt after the two epics meet; every switch-script test written against either reading is invalid.

**Close with (new AD-6a, or tighten AD-6):**
> `s_lock_entry` is consumed by exactly one rules component, the Lock arbiter in `sim/rules/ball-controller/`. From `GameState` it emits exactly one of `lock_lane_locked`, `lock_lane_mode_start { candidates[] }`, `lock_lane_strike`, or `lock_lane_rejected`, and it alone issues every `pulse` of `c_lock_eject` and every trough serve that follows a Lock-lane entry. Modes react to those derived events and never emit a `CoilCommand`. "A multiball is running" means `machine.multiball !== null`, a machine-scoped field set only by the `_starting` phase of Quick multiball or the War and cleared only by their `_stopped` phase — never derived from `ballsInPlay`. When lock and mode start both apply, the arbiter credits the lock first, then emits `lock_lane_mode_start`; the selection window (`modeSelectTicks`) is the arbiter's timer, the ball stays parked in `bd_lock` for its duration, flipper edges (`s_left_flipper`/`s_right_flipper`) move the selection, and the arbiter serves the new ball from the trough (lock applied) or ejects the parked ball from the Mouth (lock not applied) when the window closes or `s_start`/either flipper confirms.

### C2 — Ball save has two legal timer owners and two legal eject commanders; `ballsInPlay` has two legal counting methods

**Units:** R-flow vs R-modes (and the *physics port + loop* unit for what a second eject on a one-ball device means).

**What the spine says.** AD-7: "ball-save timer" is machine-scoped. AD-8: "A mode owns its timers." FR-19: "multiball Modes set their own Ball save." FR-35: Quick multiball "with its own Ball save." AD-6: rules run "balls in play, per-device counts … trough top-up."

**Legal build A (R-flow).** `machine.ballSave = { active, expiresTick, graceTick }`; on `s_trough_N` closed while active → pulse `c_trough_eject` then `c_plunger_autolaunch`; `machine.ballsInPlay` incremented when a trough eject is *commanded* and decremented when a trough switch closes.

**Legal build B (R-modes).** Quick multiball stores `modes[i].ballSave` (AD-8 says mode-local timers live under `modes[i]`; AD-7 says the same), and on `s_trough_N` closed within its own window pulses `c_trough_eject` itself. Its "ends when one ball remains" test reads `machine.ballsInPlay`.

**Collision.** One drain inside both windows → two trough ejects → three balls in Quick multiball, or one eject and one `eject_failed` that nobody handles (the vocabulary exists "even if never emitted" — so no unit handles it). Build A's `ballsInPlay` counts a commanded eject that the mode also commanded → count 3 with two balls on the table → Quick multiball never ends, ball search never fires because switches keep closing. Conversely, if A counts by switches and B counts by commands, the War's trough top-up (FR-38) computes the wrong difference.

**Cost.** Multiball — the headline feature — ships with an intermittent extra ball or a stuck mode; the fix touches the ball controller, both multiball modes, and every replay golden recorded meanwhile.

**Close with (tighten AD-6 and AD-7):**
> Ball save is one machine-scoped device, `machine.ballSave`, owned by the ball controller. A mode requests `ballSave.arm({ ticks, source })` and `ballSave.disarm(source)` through a rules-internal call; sources stack and the longest live window wins; no mode holds a ball-save timer under `modes[i]`. Only the ball controller issues `pulse` on `c_trough_eject` and on the autolaunch coil, and only it mutates `machine.ballsInPlay` and `machine.devices[bd].count`. Those counts are derived exclusively from device slot switches (see H4): a ball is in play from the tick its plunger-lane switch opens to the tick it closes a trough or Lock slot switch, never from a command having been issued. AD-8's "a mode owns its timers" applies to mode-internal timers (Hurry-up decay, Charge windows, selection windows) only.

### C3 — `InputFrame` is latched per frame but the replay is defined per tick; two legal shapes, neither reproducible across display rates

**Units:** *input/settings/persistence* (I, produces `InputFrame`) vs *physics port + loop* (P, consumes it; `sim/loop` records the replay).

**What the spine says.** AD-4: "physics consumes the latched `InputFrame`"; a replay is "seed + table/tuning hash + per-tick input diffs"; FR-7: identical inputs produce identical outcomes at 30/60/120 Hz. AD-5: "Button edges also surface to rules as cabinet switches." AD-15: physics is tested "by replaying recorded `InputFrame` sequences."

**Legal build A (I).** `InputFrame = { left: boolean, right: boolean, plunger: boolean, nudgeL, nudgeR, nudgeUp, start: boolean }` — key levels sampled once per rAF and latched for every step of that frame. Key→action lookup in `host/input`.

**Legal build B (P).** Expects one `InputFrame` per tick with edges (`leftDown`, `leftUp`, …) so the flipper hardware rule can start the pulse on the exact tick and the nudge can be one impulse per press. Or: reads levels and derives edges per tick — which means a press-and-release inside one 16 ms frame (a light tap, FR-5) is invisible at 60 Hz and visible at 120 Hz, and a nudge held across two frames is either one impulse or two depending on where the frame boundary fell.

**Collision.** Same physical key sequence → different tick assignment at different display rates → FR-7 fails by construction, and the "per-tick input diffs" in the replay header cannot be produced from a per-frame latch. `sim/loop`'s recorder and `host/input`'s latch are two units building two shapes for one type; the golden replays under `test/replays/` depend on whichever was built first.

**Cost.** Determinism (NFR-5) and the replay test strategy (AD-15) are both hollow until this is fixed, and every golden recorded before the fix is discarded.

**Close with (tighten AD-4; new text for `sim/contracts`):**
> `InputFrame` is a bitset over the closed action set `{ flipper_l, flipper_r, plunger, nudge_l, nudge_r, nudge_up, start, menu }` — levels, not edges. The host stamps every key transition with a sim tick computed from the DOM event `timeStamp` against the accumulator's origin, and `advance()` receives an ordered list `InputTransition { tick, frame }[]` rather than one latched frame; the loop applies the frame in force at each tick. Physics derives edges per tick from consecutive frames. Key codes never enter `sim/`; the key→action map lives only in `host/input`. A replay is `seed + tableHash + InputTransition[]`, and a transition list is therefore identical regardless of display rate.

---

## High

### H1 — The plunger lane is a `ball_device` (AD-6) and a manual mechanism (AD-5) at once; two legal physics models

**Units:** P vs R-flow (and R-modes for the skill shot).

**Legal build A (P, reading AD-6).** `bd_plunger` parks the entering ball (removed from the simulated set); it leaves only on `CoilCommand eject(bd_plunger)`. Manual plunge therefore has to become a rules decision: rules see `s_plunger` hold duration and command an eject with a strength — but AD-9 gives `CoilCommand` no strength field and AD-5 says the plunger is a hardware rule inside physics.

**Legal build B (P, reading AD-5).** The ball is a live body sitting on a vpx-js plunger rod in a shooter lane; hold time compresses the rod; ball-save auto-launch is a separate `c_autolaunch` kicker acting on the live ball. `bd_plunger` in the table definition has capacity 1 but never actually parks anything, so R-flow's per-device count is always wrong by one.

**Collision.** R-flow asks "how many balls are in `bd_plunger`" and gets a different answer per model; ball save "starts its timer when the ball is plunged" (FR-19) and the skill-shot window closes "at the first other switch" (FR-18) — neither model names the switch that means *plunged*. R-modes could legally use `s_plunger` (the button), R-flow could use the lane switch opening. Auto-launch after a save: `eject(bd_plunger)` in model A, a kicker pulse in model B — R-flow builds one.

**Close with (new AD-6b):**
> `bd_plunger` is a capacity-1 `ball_device` with entry switch `s_plunger_lane`. It has two eject paths and both are physics hardware rules: the manual plunge, where physics maps `s_plunger` hold ticks through the authored curve `plungerSpeedByHoldTicks` in `tuning.ts` and spawns the ball at the eject pose with that speed on release; and `CoilCommand { coil: 'c_autolaunch', action: 'pulse' }`, which spawns at `autolaunchSpeed`. The opening of `s_plunger_lane` is the one event that means "plunged": it increments `ballsInPlay`, starts the ball-save timer, and opens the skill-shot arming; the skill shot closes on the next playfield switch closure that is not a Top lane. Rules never send a strength.

### H2 — Nobody owns switch debounce; physics can chatter, rules can re-debounce, tests assume either

**Units:** P vs R-flow (and `test/` DSL under AD-15).

**Legal build A (P).** `SwitchEvent` is emitted every tick the ball's centre is inside a `sw_` zone (analytic test, no memory). A ball rolling over a rollover emits ~40 closures; a ball rattling on a drop target emits dozens; the tilt bob emits one closure per swing through the ring for two seconds after a nudge; a spinner emits one per tick it is in contact.

**Legal build B (R-flow).** Assumes MPF-style clean edges from the platform — one `closed:true` per actuation — and counts each as a hit. Or, defensively, debounces every switch with `switchDebounceTicks`, adding latency on top of whatever P does; the switch-script DSL tests then encode one or the other and are wrong against the real physics.

**Collision.** Pops score forty times per pass; DRAGON letters light on rattles; the spinner "per rotation" award has no rotation; tilt warnings (AD-3 puts tilt debounce in rules) fire on every swing unless rules re-debounce, at which point two debounces stack. FR-11 ("no missed switches at any speed") and FR-14 ("the bob cannot produce two warnings inside the debounce window") were written assuming one owner and the spine names none.

**Close with (new AD-2a):**
> Physics is the switch hardware and emits edges only: one `closed: true` when a zone test transitions from outside to inside and one `closed: false` on the reverse transition, with per-switch enter/exit hysteresis and a `settleTicks` value from the table definition (`switches[s].settleTicks`, default per switch class: rollover 0, target 8, drop target 20, bumper skirt 2, tilt bob 0). The spinner is a device whose switch closes once per authored rotation from the ball's speed through it. Rules never debounce a switch; the only rules-side time windows are semantic — `tiltWarningSpacingTicks` and `tiltSettleTicks` between warnings, which AD-3 currently mislabels "tilt debounce." The switch-script DSL feeds edges only.

### H3 — `LampCommand.level` and `pattern` have no vocabulary; the brightness/blink ladder can be built in rules or in the grammar

**Units:** R-modes (emits) vs *lighting + colour grammar* (L, consumes) — and *backglass* if it mirrors lamp state.

**Legal build A (R-modes).** `level: 0..1`, `pattern: 'solid' | 'blink_slow' | 'blink_fast' | 'pulse'`; the War mode implements FR-44's "brightness/blink ladder within the mode colour" by emitting `level 0.4 → 0.7 → 1.0` and `blink_slow → blink_fast` as Strikes accumulate. The ladder now lives in rules, which AD-9 says it must not ("the colour grammar lives in one table").

**Legal build B (L).** Expects `level ∈ {0,1,2,3}` as a ladder step and `pattern` as an opaque string it ignores; blink timing runs on the presentation clock. Or expects `pattern: { onTicks, offTicks }` and animates in sim ticks. Meanwhile `GiCommand.level` is a continuous dimmer — the same word, a different scale, in the same union.

**Collision.** A insert lit at `level 0.6` renders black or full; a blink encoded in rules by toggling commands every 250 ticks floods `FrameOutput.commands` and looks different under the 200 ms cap; two epics each believe they own the ladder.

**Close with (tighten AD-9):**
> `LampCommand = { type: 'lamp', lamp, role, step, tick }` with `step ∈ {0, 1, 2, 3}` — off, lit, emphasised, urgent. `grammar.ts` maps `(role, step)` to RGB, intensity and blink cadence; blinking is timed by presentation, never by rules toggling. Rules express every progression (Jackpot ladder, ball-save hurry-up, Charge) as a step, never as a brightness or a cadence. `GiCommand.level` is a continuous 0..1 dimmer and the only continuous level in the union; `FlasherCommand.ms` is the only wall-time duration and is honoured by the flasher driver's duty-cycle limiter.

### H4 — A `ball_device` with one entry switch cannot report two balls in one tick, and physics may or may not enforce capacity

**Units:** P vs R-flow.

**Legal build A (P).** `bd_trough` has one entry switch `s_trough`. On Tilt (FR-15) or a Quick multiball double drain, two balls enter within a few ticks; edge semantics (H2) yield one closure. Capacity is a rules fact (AD-6 lists it in the table definition's ball device entry), so physics parks unconditionally — the Lock can hold three.

**Legal build B (P).** Physics reads capacity from the table definition and refuses to park a ball into a full device, letting it roll back out. No switch fires; rules never learn the ball reached the lane. During the War (Lock "disabled") the ball enters, is refused, and rolls out — no Strike, because the entry never registered.

**Collision.** R-flow's counts drift by one on the first Tilt with two balls out; ball search fires with all balls accounted for; the War's top-up arithmetic is off by the drift. Build B silently eats the FR-38 "Lock-lane shot counts as a Strike" event.

**Close with (tighten AD-6 and AD-11):**
> Every `ball_device` has one switch per slot in the table definition (`s_trough_1..4`, `s_lock_1..2`, `s_plunger_lane`), listed in fill order. Physics parks unconditionally, fills the lowest empty slot on entry and empties the highest filled slot on eject, and closes or opens the corresponding slot switch; capacity is authored in the table definition and enforced by rules, which treat a closure on a slot beyond capacity as `device_overflow { device }` and respond with an immediate eject. A device's count in `GameState` is the number of closed slot switches and nothing else.

### H5 — Three frames, two conversion functions: the glb→table conversion is forbidden and Babylon's handedness is undecided

**Units:** *assets/Blender export* (X), P (loader), L (scene).

**What the spine says.** AD-10: table frame is mm, Z toward the glass, Y up the playfield; `toPhysics()` and `toScene()` "are the only unit or axis conversions in the codebase." AD-11: glb "export metres, +Y up." glTF 2.0 is right-handed, +Y up, −Z forward; Babylon's default scene is left-handed and its glTF loader compensates with a `__root__` node scaled −1 in Z.

**Legal build A (X + P).** The exporter leaves Blender's Z-up→Y-up conversion in place, so in the glb table-Z (toward glass) is +Y and table-Y (up the playfield) is −Z. The loader needs a third conversion, glb→table, which AD-10 forbids, so it converts glb→VPU directly inside `physics/loader/` — a second axis mapping outside `frames.ts`.

**Legal build B (X).** The exporter rotates the whole scene −90° about X first so that glb +Y equals table +Y ("Y up the playfield"), reading AD-11's "+Y up" as the table's Y. The playfield now stands on end in any viewer and the loader's assumption in build A is wrong by a quarter turn.

**Legal build C (L).** The scene is left-handed (Babylon default) and `toScene()` flips Z; or `useRightHandedSystem = true` and `toScene()` is a pure scale. Whichever L picks, P's loader placed collision meshes from the glb without going through `toScene()`, so the ball renders mirrored relative to the collision scaffold.

**Collision.** Classic and near-certain: the ball is at the visual mirror of its collision position, or the flippers face the wrong way, discovered when the first glb meets the first physics step. Cost is every position-bearing line in three units.

**Close with (tighten AD-10 and AD-11):**
> The glb frame is defined once: metres; glb +X = table +X; glb +Y = table +Z (toward the glass); glb −Z = table +Y (up the playfield) — exactly what Blender's glTF exporter produces from a scene authored with the table frame as Blender X/Y/Z, with no additional rotation. `frames.ts` exports three functions and no others: `glbToTable()` (used only by `physics/loader` and `presentation/scene` at load), `toPhysics()` and `toScene()`. The Babylon scene is created with `useRightHandedSystem = true` so `toScene()` is the mm→m scale plus the same permutation as `glbToTable⁻¹`, and every loaded node keeps the glb transform under a table root that `toScene()` also positions.

### H6 — Presentation joins tick-*t* events to a tick-*t+N* snapshot; the Backglass and Dragon animation each need payload the spine does not promise

**Units:** *backglass* (B) and L (mechanism animation) vs R-flow and R-modes.

**What the spine says.** AD-4: `FrameOutput { snapshot, events, contactEvents, commands }`, snapshot is the latest state; AD-9: the Backglass "renders from the state snapshot plus the semantic event stream"; rules never format text.

**Legal build A (R-flow).** Emits `ball_ended` with no payload; `players[currentPlayer]` and `bonus` are in the snapshot, so why duplicate. Emits `player_turn_started` two ticks later. At 60 Hz both are in one `FrameOutput` and the snapshot already shows the next player with `bonus = 0`.

**Legal build B (B).** On `ball_ended`, reads the snapshot to run the bonus countdown (FR-20) — for the wrong player, from zero. On `mode_hurryup_started`, reads `modes[]` for the decaying value — shape defined ad hoc by R-modes (`modes[i].value`? `modes[i].hurryup.remaining`?); B guessed.

**Collision.** Every event-triggered display (bonus count-down, TILT, ARM YOURSELF, CHARGE ×N, Jackpot value on the winning Strike, Match number) has a race against the snapshot inside one frame, and the per-mode data B needs is a type R-modes owns and B can only read by convention.

**Close with (new AD-9a):**
> Every semantic event carries the full payload presentation needs to render it (`ball_ended { player, bonusByCategory, multiplier, total, tilted }`, `mode_hurryup_started { player, value, ticks }`, `war_strike { remaining, jackpot }`, `match_drawn { number, winners[] }`, …); presentation never joins an event to the snapshot. The snapshot is for continuous display only — scores, ball number, timers — and each mode publishes its continuous display state as a typed `ModeView` in `sim/contracts` (`{ mode, priority, player, timerTicks?, value?, charge?, strikesRemaining? }`), which is the only shape of `modes[i]` that presentation may read.

---

## Medium

### M1 — `ContactEvent.surface` has no owner or vocabulary

**Units:** P (emits) vs *audio* (A, consumes) vs X (must author it somewhere).

P can legally emit the vpx-js hit-object class (`HitCircle`, `LineSeg`, `Flipper`) or the material name from the mesh; A wants `wood | rubber | metal | plastic | flipper | ball`; the glb `col_` prefix carries no material and the table definition has no surface field, so nobody authors it. Cheap to fix, certain to be built twice.

**Close with (tighten AD-2 and AD-11):**
> `ContactSurface` is a closed enum in `sim/contracts`: `wood, rubber_post, rubber_band, metal, plastic, ramp, flipper, target, bumper, glass, ball, dragon`. Every `col_` node carries a `surface` custom property whose value is a member; the loader fails fast on a missing or unknown value; the audio provider maps every member.

### M2 — `FrameOutput` at N = 0 and N = 200 is unspecified; the cap discards time silently

**Units:** P/loop vs L, A, B.

At 144 Hz or after a fast frame the accumulator owes zero steps: does `FrameOutput` carry empty arrays and the same snapshot, or the previous frame's events again (double-firing every cue)? At the cap, 200 ticks of events and commands land in one frame: a lamp on at t+3 and off at t+150 — presentation may legally apply both in order or only the last per lamp; a cue at t+3 and again at t+150 — coalescing drops one; a `FlasherCommand { ms }` issued 190 ms ago fires now. Nothing tells presentation or the dev panel that time was discarded.

**Close with (tighten AD-4):**
> `FrameOutput` carries every event and command from all N steps in tick order and, when N = 0, empty arrays and the unchanged snapshot. Presentation consumes the full list in order: lamp and GI commands are latest-wins per target, every cue, flasher, contact and semantic event is a discrete occurrence that drivers must honour (rate-limited by the driver, never dropped by the host). When owed time is discarded the loop emits `sim_time_discarded { ms }` as the first event of that frame.

### M3 — The replay header's "table/tuning hash" has no computer, no input set, and no place for settings

**Units:** loop (recorder) vs *build/CI/deploy* (C, runs goldens) vs I (pitch and other settings enter as tuning overrides).

`sim/loop` could hash `tuning.ts` (JSON key order undefined); CI could hash `dragonwar.glb` bytes (collision geometry does change outcomes); neither includes the player's Pitch override, so a replay recorded at 7.5° "matches" a golden at 6.5° and diverges at tick 300.

**Close with (tighten AD-4/AD-15):**
> `sim/loop/replay.ts` owns the header: `{ seed, tuningHash, tableHash, assetHash }` — canonical-JSON SHA-256 of the *effective* tuning after AD-14 layering, of `TABLE`, and of the glb bytes respectively. A golden whose hashes differ from the build's is reported by CI as *stale*, distinct from a determinism failure.

### M4 — Hot-seat player switch: nothing says modes stop at ball end, or which machine facts reset

**Units:** R-flow vs R-modes.

`modes[]` is game-scoped; no AD says a mode ends at `ball_ended`, so a Joust started by player 1 can legally run into player 2's ball (FR-41 even says timers keep running under multiball). `machine.ballSave`, `machine.tilt`, `flippersEnabled` are machine-scoped; who clears them for the next player, and when relative to `player_turn_will_start`, is unstated; the tilt bob is still swinging in physics.

**Close with (tighten AD-7/AD-8):**
> `ball_ended` is preceded by `_will_stop` for every active mode; `modes[]` is empty between balls. The ball controller resets `machine.ballSave`, `machine.tilt` and `machine.multiball` in `ball_will_start`, and enables flippers in `ball_starting`. The bob is never reset by command; its physical decay plus `tiltSettleTicks` is the settle. `machine.jackpotSeed` is game-scoped and shared by all players in a hot-seat game.

### M5 — Light-group names have two owners and no conformance check

**Units:** X vs L (and the table definition).

AD-11 puts `lightgroup` on meshes; AD-12 says groups are "named in the table definition and on meshes." Either side can spell one differently, an insert can name a group no mesh carries, and a mesh can carry a group no lamp lights — none of which the loader's "missing node" check catches.

**Close with (tighten AD-11):**
> `TABLE.lightGroups` (as const) is the only definition of light-group names. A mesh's `lightgroup` property must be a member; every lamp's group must be a member with at least one mesh; the loader fails fast on any of the three violations, and `tools/export.py` validates the same list (read from a JSON dump of `TABLE`) before writing the glb.

### M6 — Pitch rotates "the table root," but the cabinet must stay level and the glb hierarchy decides which is which

**Units:** X vs L.

If Blender authors the cabinet around a flat playfield and presentation pitches the whole glb root, the cabinet, backbox and Backglass strip tilt with it; if presentation pitches only some nodes, the set is chosen by whoever writes the scene code and not recorded anywhere. Switch zones ride with the playfield (flat frame) either way, so physics is unaffected — the hole is visual and hierarchical.

**Close with (tighten AD-10/AD-11):**
> The glb has exactly two top-level nodes: `playfield_root` (everything that pitches — playfield, devices, inserts, lock, dragon, ball spawn poses) and `cabinet_root` (cabinet, backbox, glass, backglass quad — level). Presentation rotates only `playfield_root` about table-frame X at the empty `pivot_pitch` by the effective `pitchDeg`, read from the snapshot each frame, not cached at load.

### M7 — `flippers.enable(bool)` and `eject(device)` are not expressible as `CoilCommand { coil, action }`

**Units:** R-flow vs P.

AD-5 names a `flippers.enable(bool)` command, AD-6 names `eject(device)`, AD-9 says `CoilCommand { coil, action }` is the only rules→physics command. R-flow will emit `{ type: 'flippers_enable', on }` and `{ type: 'eject', device }`; P will expect coil-keyed hardware rules. Cheap, certain.

**Close with (tighten AD-9):**
> `CoilCommand = { type: 'coil', coil, action: 'pulse' | 'enable' | 'disable', tick }`. A device eject is `pulse` on `TABLE.ballDevices[bd].ejectCoil`, resolved by the ball controller; flipper gating is `enable`/`disable` on `c_flipper_l` and `c_flipper_r`; physics hardware rules are keyed by coil name.

### M8 — The lit Top lane is written by lane change (base) and by the skill shot (mode), and lives nowhere in AD-7

**Units:** R-flow/base mode vs R-modes (skill shot).

Lane change (FR-25) rotates the lit lane on every flipper press; the skill shot (FR-18) picks the lit lane from the rng at each plunge. Both mutate one fact; AD-7 does not say whether it is player-scoped, machine-scoped or mode-local, so the skill-shot mode can legally keep it under `modes[i]` and lose it when the mode stops.

**Close with (tighten AD-7):**
> Lane state (`topLanes[]`, `inlanes[]`, `outlanes[]` lit flags and completed sets) is player-scoped under `players[i].lanes`, owned by the base mode; the skill-shot mode sets the lit Top lane once on `ball_starting` from `rng` and never writes lanes again.

### M9 — Dragon animation (FR-30) has no trigger in the command set

**Units:** L (mechanism animation) vs R-flow/R-modes.

`CueCommand` is audio (AD-13); lamp/flasher/GI are lights; nothing addresses a mechanism. L can legally drive the mouth from `mode_war_will_start`, from an echoed `CoilCommand` on `c_lock_eject`, or from a `ContactEvent` on the dragon body — three units of truth, and the spine says presentation "never derives game state from contacts."

**Close with (tighten AD-9):**
> `CueCommand` becomes `ShowCommand { show }`, addressing any named non-lamp presentation effect in `TABLE.shows` — audio cues and mechanism animations alike; the provider decides what a show is. The Dragon's mouth opens on `show: 'dragon_mouth_open'` emitted by the Lock arbiter before its eject pulse; the hit reaction is presentation-local from `ContactEvent { surface: 'dragon' }` and carries no game meaning.

### M10 — High-score qualification needs the table inside rules, but rules never touch storage

**Units:** R-flow vs I (persistence).

Initials entry uses flippers and Start (FR-51) — cabinet switches, so the entry phase is a rules phase; but whether a score qualifies needs the persisted table, which AD-14 keeps out of `sim/`. R-flow can legally emit `game_ended { scores }` and leave the host to decide — and the host then has no way to run an entry phase. I can legally inject the table as a "tuning override," which it is not.

**Close with (tighten AD-14):**
> `GameStart { seed, tuning, adjustments, highscores }` is the one bundle the host hands `sim/loop` at game start; `highscores` is read-only inside `sim/`. Rules own the `highscore_entry` phase and emit `highscore_entered { rank, initials, score, grandChampion }`; the host persists on that event and on nothing else.

---

## Low

### L1 — glb node-name uniqueness and the primitive split

Babylon names `TransformNode`s after glTF nodes and splits multi-material meshes into `name_primitive0..n`; the exporter appends `.001` on collisions. The loader's "fail fast on a missing node" then fires or, worse, matches the wrong child. **Close:** references are to glTF *node* (Blender object) names matching `^[a-z][a-z0-9_]*$`; the exporter fails on any `col_`, `sw_`, `l_` or mechanism object with more than one material; the loader looks up nodes by exact name and never by mesh name.

### L2 — DRAGON bank reset has two plausible commanders

The ball controller could reset the bank at `ball_will_start`; the base mode could reset it on the sixth target; both pulsing `c_bank_reset` is harmless but double-fires the reset sound. **Close:** the base mode alone pulses `c_bank_reset`, on `ball_will_start` and on the sixth target down; physics raises all six on the pulse.

### L3 — Two timed modes share priority 300

Hurry-up and Joust both at 300 make "highest active mode" and Backglass priority undefined when both run. **Close:** priorities are unique — skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500; a duplicate is a dev-mode assertion.

### L4 — Ball identity across park/spawn

Roll voices (AD-13, one per ball) and ball meshes need a stable key; physics that re-indexes the ball array on park makes a voice jump between balls. **Close:** every spawned ball carries a monotonically increasing `ballId` in the snapshot; presentation keys meshes and voices by it.

### L5 — Dev tuning panel hot-applies to a running sim while a replay is recording

AD-15's hot-apply changes tuning mid-game; the replay header (M3) hashes effective tuning once. **Close:** a hot-apply during recording invalidates the recording (`replay_invalidated` event); the panel's export path is the only way a tuning change reaches a golden.

---

## Summary table

| # | Tier | Units | Hole | Closes via |
| --- | --- | --- | --- | --- |
| C1 | Critical | R-flow / R-modes | Lock-lane entry: two deciders, two eject commanders, two definitions of "multiball running" | new AD-6a: Lock arbiter, `machine.multiball` |
| C2 | Critical | R-flow / R-modes | Ball save: two timer owners, two trough-eject commanders, two `ballsInPlay` counting methods | tighten AD-6/AD-7: one ball-save device, slot-switch-derived counts |
| C3 | Critical | I / P (loop) | `InputFrame` per frame vs replay per tick; tap loss and rate dependence | tighten AD-4: tick-stamped `InputTransition[]` bitset |
| H1 | High | P / R-flow | Plunger lane: ball device (AD-6) vs hardware rule (AD-5); no "plunged" switch | new AD-6b |
| H2 | High | P / R-flow | Switch debounce has no owner; tilt bob chatter | new AD-2a: physics emits edges with `settleTicks` |
| H3 | High | R-modes / L | `level`/`pattern` vocabulary; ladder built in rules | tighten AD-9: `(role, step)` |
| H4 | High | P / R-flow | One entry switch per device; capacity enforcement undefined | tighten AD-6/AD-11: per-slot switches |
| H5 | High | X / P / L | Third frame conversion forbidden; Babylon handedness undecided | tighten AD-10/AD-11: `glbToTable`, right-handed scene |
| H6 | High | B, L / R-flow, R-modes | Event-to-snapshot join race; `modes[i]` shape unowned | new AD-9a: payload-complete events, `ModeView` |
| M1 | Medium | P / A / X | `surface` vocabulary | closed enum + `surface` property |
| M2 | Medium | loop / L, A, B | N = 0 and N = 200 semantics; silent discard | tighten AD-4 |
| M3 | Medium | loop / C / I | Replay hash owner and inputs | tighten AD-15 |
| M4 | Medium | R-flow / R-modes | Hot-seat carry-over of modes and machine facts | tighten AD-7/AD-8 |
| M5 | Medium | X / L | Light-group names, two owners | tighten AD-11 |
| M6 | Medium | X / L | Which nodes pitch | two glb roots, `pivot_pitch` |
| M7 | Medium | R-flow / P | `flippers.enable`, `eject` not expressible as `CoilCommand` | tighten AD-9 |
| M8 | Medium | base / skill shot | Lit lane fact unowned | tighten AD-7 |
| M9 | Medium | L / rules | Dragon animation trigger | `ShowCommand` |
| M10 | Medium | R-flow / I | High-score table inside rules | `GameStart` bundle |
| L1 | Low | X / P, L | Node naming and primitive split | export lint |
| L2 | Low | R-flow / base | Bank reset commander | base mode |
| L3 | Low | R-modes | Priority tie at 300 | unique priorities |
| L4 | Low | P / A, L | Ball identity | `ballId` |
| L5 | Low | dev / loop | Hot-apply during recording | invalidate |

**One structural observation.** Every critical and four of the six high holes are between the two rules units or between rules and physics — the spine's seam vocabulary is complete for presentation (AD-9, AD-12, AD-13) and thin for the cabinet I/O board (AD-2, AD-5, AD-6). A short `sim/contracts` appendix listing the closed unions verbatim — `InputFrame`, `SwitchEvent`, `ContactEvent`, `CoilCommand`, `LampCommand`, `GiCommand`, `FlasherCommand`, `ShowCommand`, `FrameOutput`, `ModeView`, `GameStart` — would close most of the medium tier at once and give the epics something to lint against.
