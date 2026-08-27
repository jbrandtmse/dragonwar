---
title: 'DragonWar — Solution Design'
status: final
created: '2026-08-26'
updated: '2026-08-26'
spine: ARCHITECTURE-SPINE.md
---

# DragonWar — Solution Design

## 1. What this document is — and what the spine is

`ARCHITECTURE-SPINE.md` is the binding contract: nineteen architecture decisions (AD-1..AD-19), each stating what it binds and prevents, plus the closed seam types, conventions, verified stack and diagrams. It is deliberately terse — rules, not reasons. Where this document and the spine disagree, the spine wins and this document gets corrected.

This document is the rationale. It is for the author, who needs the *why* written down before it evaporates, and for a future contributor from the virtual-pinball community who needs to know which walls are load-bearing. It restates rules only to explain them, cites the AD inline whenever it does, flags what the spine tags `[ASSUMPTION]`, and invents nothing absent from the spine, its memlog (the decision log kept beside it), or the spine's cited sources (the PRD and brief with their addenda, and the technical research).

## 2. The machine as a virtual machine

A solid-state pinball machine already has the architecture we want. The game CPU sees a switch matrix and nothing else — not where the ball is, only that a switch closed. Its outputs are coils, lamps, flashers, GI and a display; everything physical lives across an I/O board. DragonWar copies that split (AD-1): Physics is the cabinet, a driving-and-driven adapter behind a virtual I/O board (switches in, coils out); Rules is the game CPU, a pure function of switch events; Presentation is the output drivers; Host is the composition root that boots, runs the frame loop, reads the keyboard and persists. The spine's layer table says what each directory owns; `sim/contracts/` holds the closed unions every seam speaks and `sim/table/` holds `TABLE`, the single registry of every named device.

This beats generic game-engine layering because the real machine pre-answers seam questions. Should rules know ball velocity? A CPU never did. Should a mode fire a coil? A mode is a program on a CPU with one driver board. Should presentation derive game state from a contact sound? A lamp driver takes commands. "Would the real machine's CPU know that?" almost always gives the answer that keeps the simulation headless and replayable.

The dependency law is the spine's graph, and only those arrows exist (AD-1, enforced by AD-16). Rules and physics never import each other; host never imports physics or rules; nothing under `sim/` imports presentation, host, `@babylonjs/*` or a DOM global. That lets the whole simulation run in Node, which makes golden replays (§10) possible.

The one-table guard is the paradigm's other half (AD-1). DragonWar is a game, not an engine — the addendum notes "the field is littered with abandoned platforms" — so `sim/table/dragonwar.ts` is imported directly wherever a device is named. No `Table` interface, no loading API, no plugin API. A second table would be a later decision, not a hook left open now.

## 3. Time — one clock, one constant

Inside `sim/`, time is `tick`, a uint32 reset at game start, and `TICK_HZ` is one constant in `sim/contracts/time.ts` (AD-3), set to 1000 Hz verbatim from vpx-js's `PHYSICS_STEPTIME = 1000` µs. The memlog's Q6 reasoning: the ported solver constants were tuned at that rate, and changing the rate changes what they mean. The addendum calls 480 Hz a demonstrated browser floor and 1000 Hz "not load-bearing"; the port's rate is kept for the constants, not the feel.

If spike 1 (a 1 kHz JS loop over six bodies inside the frame budget) fails, the fallback is 480 Hz: one constant plus a golden re-record, which is only that cheap because nothing else in `sim/` may contain a literal millisecond — every timer is authored in ms in `tuning.ts` and converted to ticks at load (AD-3). It would still be a solver re-tune; the memlog calls it exactly that.

Rules step after every physics step, even with no switch change, and commands issued at tick *t* apply at *t+1* (AD-4). Timers count ticks, so a rules layer that ran only on switch events or once per frame would have a clock at the mercy of the ball or the refresh rate.

Input is a list of tick-stamped `InputTransition`s, not a per-frame latch (AD-4). The first draft latched once per frame; the adversary review showed a key press would then land on a different tick at 30 Hz than at 120 Hz, and a light tap inside one frame could vanish. So the host derives a tick from each DOM event's `timeStamp`, and a replay is simply `ReplayHeader + InputTransition[]`.

The accumulator carries its fractional remainder (AD-4). At 60 Hz a frame owes 16.67 steps; truncating to 16 loses about 4 % of simulated time — silent slow motion. Owed time beyond 200 ms is discarded instead, with `sim_time_discarded { ms }` as the frame's first event: VPX's own bailout, which stops a backgrounded tab from freezing or fast-forwarding on return.

No wall-clock and no unseeded randomness inside `sim/` (AD-3, lint-enforced by AD-16). A replay must reproduce a state hash; a ball-save timer on `performance.now()` or a Match from `Math.random()` breaks that on the first run. Rules randomness draws from `GameState.rng`; physics has none by default (scatter 0 on every material), and if it ever gains any it uses a second seeded PRNG whose seed also sits in the replay header.

v1 runs the simulation on the main thread (memlog Q1): one `requestAnimationFrame`-driven (rAF) loop, flipper path entirely local. A Web Worker is deferred, not rejected — `sim/` is DOM-free, so the move is a host change — but GitHub Pages cannot serve the COOP/COEP cross-origin-isolation headers, so no `SharedArrayBuffer`: a Worker would post structured-cloned snapshots every frame and add a thread hop to input. Revisit only if spike 1 or profiling shows the sim contending with rendering.

## 4. The cabinet I/O board

Physics emits two event streams to two destinations (AD-2). `SwitchEvent`s go only to rules; `ContactEvent`s go only to presentation. Rules never see a position, velocity or surface; presentation never sees a switch and never derives game state from a contact.

Switches are edges — one `closed: true` on outside→inside, one `closed: false` on the reverse — with per-switch hysteresis and `settleTicks` from `TABLE.switches` by class: rollover 0, standup target 8, drop target 20, bumper skirt 2, tilt bob 0 (AD-2). Rules never debounce; their only windows are semantic (`tiltWarningSpacingMs`, `tiltSettleMs`). A debounce has one owner: two owners stack windows; no owner lets a rollover close forty times per pass. Zone tests use the ball's per-tick swept segment, never its end position (AD-11). Actuations (`coil_fire`, `flipper_eos`, `drop_target_down`, `bank_reset`, `eject`, `spinner_tick`) ride the contact stream so every mechanical sound has one source — never the key state, which would snap a disabled flipper during Tilt.

Flippers, the manual plunger, slingshots and pop bumpers are hardware rules inside the physics step (AD-5): button or switch to coil on the same tick, each behind its own coil, gated only by `CoilCommand enable | disable`; Tilt, game over and Attract disable them together. NFR-3 allows at most 16 ms of added flipper latency with the loop entirely local, but the deeper reason is ownership: a flipper routed through the rules tick has two owners of its state. Buttons still surface to rules as cabinet switches (`s_flipper_l`, `s_flipper_r`, `s_start`, `s_plunger`) for lane change, mode selection and initials — emitted by `sim/loop`, not physics.

The flipper solenoid is vpx-js's `FlipperMover` ported verbatim — strength, ramp-up, end-of-stroke torque and angle, return, inertia ⅓·m·r² (AD-5). MPF's pulse/hold figures (~30 ms at 70 % then 25 % hold; a documentation example) are calibration references only; a hybrid coil model on top of the port is the "derive rather than port" mistake the research warns against. The manual plunge maps `s_plunger` hold ticks through `plungerSpeedByHoldMs`.

Nudge is where the port is deliberately not verbatim. The damped-harmonic cabinet oscillator is ported; the ball coupling is re-derived as table-frame motion, so the ball keeps its inertia while the cabinet moves under it (AD-5). VPX's nudge-as-force-on-the-ball is a known open defect that survived two decades. Because this is a derivation, a golden replay pins it. The tilt bob is a real pendulum whose closure is `s_tilt_bob`.

Slam tilt moved. Question round two (Q7) first put a nudge-abuse detector in the host; the reconcile pass found the replay gap — a host-side detector cannot be reproduced. So it lives in physics beside the oscillator as a tick-windowed nudge count with its own threshold `slamNudgesPerWindow` and closure `s_slam_tilt` (AD-5), closing PRD OQ-4 without ever sharing the bob's threshold.

## 5. Balls, devices and accounting

Physics owns ball bodies; rules own ball accounting (AD-6). "Where is ball 2?" is two questions: physics knows which bodies are simulated, rules know how many balls are in play and which slots are full.

`bd_trough` (capacity 4, slots `s_trough_1..4`, eject `c_trough_eject`) and `bd_lock` (capacity 3 — two held plus one staging — slots `s_lock_1..3`, eject `c_mouth`) are *parking* devices: physics parks an entering ball unconditionally into the lowest empty slot, removes it from the simulated set and closes that switch; a `pulse` on the eject coil spawns from the highest filled slot at the authored pose, one ball per pulse. The Lock's pose *is* the Mouth. `bd_shooter` is *non-parking*: the served ball stays simulated on the plunger tip, because a spring plunger has to strike it; entry is `s_shooter_lane`, exits are the manual plunge or `c_autolaunch`.

Counts are the number of closed slot switches and nothing else (AD-6): a separately kept integer drifts on a double drain; a switch-derived count cannot. Rules enforce capacity and answer `device_overflow` with an immediate eject. Why four balls, asserted at boot? The Lock holds two, and in Hot seat player 2 can be in Quick multiball while player 1's two balls sit in the Lock — the spine's **Prevents** entry names it: "Quick multiball silently starving in Hot seat". The reserved 4-ball finale would raise the count to five.

"Plunged" is one event: the *opening* of `s_shooter_lane` (AD-6), which the devices layer emits as `ball_launched`; on it the ball controller increments `ballsInPlay`, starts ball save and arms the skill shot. Every other candidate — the plunger key, a rollover, a timer — has a case where it is wrong.

Drop targets and the spinner are stateful physics devices: a dropped target is non-collidable until `pulse c_dragon_bank_reset` raises the bank; the spinner closes `s_spinner` once per revolution. Letters and counts live only in rules (AD-6, AD-19). Ball search is a rules protocol of tick-timed pulses in each device's `ballSearchOrder`; its final stage issues `RecoverCommand`, the one command that lets physics despawn every loose ball, and the controller emits `ball_missing { count }` from the returned `recovered`. PRD FR-23 adds one suppression: never release locked balls while a Mode timer runs.

## 6. The game CPU

Modes never see raw switches. `sim/rules/devices/` is the only consumer of `SwitchEvent` (AD-19); it owns the drop bank, spinner count, ball-device slots, shooter lane and *shots* — declared in `TABLE.shots` as ordered switch sequences with tick windows, `shot_left_loop = [s_loop_l_in, s_loop_l_out] within loopWindowMs` — and emits only device events. Without it, Joust, Hurry-up and the War would each decide what "a Loop" is.

The Lock lane is the most overloaded seam on the table, so it has one arbiter (AD-18) in `sim/rules/ball-controller/` — the only consumer of `lock_lane_entered`, emitting exactly one of: `lock_lane_locked` (credits below two, no multiball); `lock_lane_mode_start { candidates[] }` (the lane doubling as the mode-start scoop, PRD FR-33); `lock_lane_strike` (a multiball is running and the Lock is disabled; in the War the entry counts as a Strike, PRD FR-38); or `lock_lane_spit` (the device is full of another player's balls — one is ejected, the credit still counts). When lock and mode start both apply, the lock is credited first. The mode-select window `modeSelectMs` is the arbiter's timer: the ball stays parked, flipper edges move the selection, Start or either flipper confirms. It alone pulses `c_mouth`, always `mouthOpenLeadMs` after `ShowCommand show_dragon_mouth_open`, so the Mouth is open before the ball appears. The adversary review had found the ball controller and the War mode both deciding a Lock entry and both pulsing the Mouth.

Two more single arbiters (AD-18). "A multiball is running" means `machine.multiball !== null`, set only in the `_starting` phase of Quick multiball or the War and cleared only in `_stopped` — never derived from `ballsInPlay`, which lags and overlaps. Ball save is one machine device, `machine.ballSave`, owned by the ball controller: a mode calls `ballSave.arm({ ticks, source })` or `disarm(source)`; sources stack, the longest live window wins, Tilt disarms all. Only the ball controller pulses `c_trough_eject` and `c_autolaunch` and mutates `ballsInPlay`, so a mode and the controller can never both eject on one drain.

Modes stack by unique numeric priority — base 100, skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500; a duplicate is a dev-mode assertion (AD-8). Every active mode receives every device and shot event, highest priority first; scoring accrues from all; presentation priority is the highest active mode. Start and stop go only through the four-phase convention (`_will_start / _starting / _started`, `_will_stop / _stopping / _stopped`). A mode never emits a `CoilCommand`.

`GameState` is one plain-data tree with fixed ownership scopes (AD-7): `{ tick, phase, machine, players[], currentPlayer, modes[], rng }`, JSON-serializable, mutated only inside `rules.step`. **Player-scoped**, only under `players[i]`: score, letters, Lock credits, modes played, tilt warnings, bonus, extra balls, lanes, and the Jackpot seed and Wars started — those two carry an `[ASSUMPTION]` in the memlog, reading PRD FR-39's "per War started this game" per player for Hot seat fairness. **Machine-scoped**, only under `machine`: device slots, `ballsInPlay`, `hardwareEnabled`, `ballSave`, `tilt`, `multiball`, read-only `highscores`. **Mode-local**, under `modes[i]`, published only as a typed `ModeView`. Hot seat follows: UJ-3's edge case (player 1 drains with two balls locked, player 2's credits zero) is `lock_lane_spit` plus a trough top-up when player 2's War starts.

`modes[]` is empty between balls — every mode receives `_will_stop` before `ball_ended`, so a Joust cannot run into the next player's ball; `ball_will_start` resets `ballSave`, `tilt` and `multiball`; `ball_starting` enables hardware.

Lamp state is a projection, not a mutation. `lampsOf(state): LampState` is computed by rules every step from the modes' role contributions by priority, and `sim/loop` emits the diff as `LampCommand`s (AD-9). No mode ever "turns its lamps off" — the bug this closes is the base mode's lit lane vanishing when the skill-shot mode stops — and lamp state lands in the replay for free.

## 7. Presentation

Rules speak to presentation through a closed union (AD-9): `LampCommand { lamp, role, step }`, `GiCommand { channel, level }`, `FlasherCommand { flasher, ms }`, `ShowCommand { show }` — nothing else. `step ∈ {0 off, 1 lit, 2 emphasised, 3 urgent}` is the only progression rules may express (Jackpot ladder, ball-save hurry-up, Charge); `role` is never a colour. `presentation/lighting/grammar.ts` is the one `(role, step)` → RGB, intensity and cadence table, with blinking timed by presentation. The roles map one-to-one onto the PRD's held colour grammar (FR-44):

| Role | Colour | Meaning |
| --- | --- | --- |
| `lit` | white | shot lit / qualifying |
| `hurryup` | red | Hurry-up |
| `quickmb` | green | Quick multiball |
| `joust` | blue | Joust |
| `dragon` | orange | DRAGON letters, Lock, the War |
| `special` | purple | Extra ball / special |
| `off` | — | dark |

Keeping colour out of rules is what makes the grammar *held*: no code path lets a mode light an insert in a colour the table does not use. `FlasherCommand.ms` is the only wall-time duration, honoured by the flasher driver's duty-cycle limiter, because flashers are coil-class — driven like a coil, so the driver limits how long they stay on.

Every semantic event is payload-complete (AD-9) — `ball_ended { player, bonusByCategory, multiplier, total, tilted }`, `war_strike { remaining, jackpot }`, `match_drawn { number, winners[] }`. The race: a frame carries N steps, an event from tick *t* arrives beside a snapshot from tick *t+N*, and by then the current player may have changed; a Backglass that joined `ball_ended` to the snapshot would name the wrong player on a fast frame. The snapshot is for continuous display only; `ModeView` is the only shape of `modes[i]` presentation may read; rules never format text — English literals live in `presentation/backglass` only.

Shows cover everything that is neither lamp, GI nor flasher: `ShowCommand` addresses any named non-lamp effect in `TABLE.shows`, audio cues and mechanism animations alike — `show_dragon_mouth_open` is a show (AD-9), so the Dragon is animated from one truth rather than three.

Lighting sits behind one `LampDriver` with four channels — GI, inserts, flashers, architectural (AD-12). The composite is `base + Σ groupᵢ × tintᵢ × levelᵢ`, inserts baked white and tinted by role — one texture per light group, not per colour, which makes a held grammar cheap. Question round one (Q2) chose "UV2 asset contract now, bake later": every static mesh carries `TEXCOORD_1` and a `lightgroup` from the first model, so the eventual per-group bake replaces the early emissive-plus-dynamic-lights path without touching rules, `TABLE` or mesh names.

Stack verification corrected a stale premise: the addendum said clustered forward lighting "appears to be a WebGPU-path feature", which would have forced baking on the WebGL2 floor. Verified 2026-08-26, Babylon's clustered forward runs on WebGL2 (~23 lights per batch), so it *is* the WebGL2 dynamic path; the bake earns its place for bounce and contact-soft shadows, not light count. The floor's dynamic-light budget of 20 per frame is an `[ASSUMPTION]`. No feature may require WebGPU. Re-verify by 2026-09-26.

Audio (AD-13): every sound is a named show, and `AudioAssetProvider` is the only place that knows whether a show is a synth function or a sample URL — recordings swap in without touching game code, closing PRD OQ-7 at the seam. Mechanical sounds fire from `ContactEvent` (speed → gain and pitch, surface → sample, actuation kinds → coil, flipper, bank and eject sounds); rules cues fire from `ShowCommand` only, never from polled state, so nothing fires twice. Ball roll is one continuous voice per `ballId` driven from the snapshot, not an event. Masters are `.wav`, shipped samples `.mp3` (Safari lacks Ogg). The press-to-begin gesture unlocks the graph before the walk-up sounds.

## 8. Assets and frames

Blender owns placement and geometry; `TABLE` owns devices (AD-11). `assets/src/dragonwar.blend` is the sole owner of every position, mesh and switch zone; `src/sim/table/dragonwar.ts` exports `TABLE as const` — every switch, coil, lamp, flasher, ball device, shot, show and light group, the reference dimensions, wiring and glb node names. Question round one (Q3) chose a typed TypeScript module over YAML because one `as const` registry yields the name unions through `sim/table/names.ts` for free, and a device-name literal anywhere else becomes a lint error. Three drifting device lists were the failure to avoid.

`tools/export.py` is the contract's enforcer. It exports with `export_yup` and `export_extras` on, validates node names (`^[a-z][a-z0-9_]*$`, unique across all glbs, one material each) and every `lightgroup`, `surface` and `phys_material` against a JSON dump of `TABLE`, and writes `dragonwar.glb` for presentation plus `dragonwar.collision.json` (`col_`/`sw_`/device nodes, mm, table frame) for `sim/physics/loader`. The split exists because `sim/` never parses glb — a glb parser drags Babylon into the simulation and ends headless Node goldens. Both loaders fail fast on a missing node or unknown property.

Prefixes encode intent: `col_` is invisible collision scaffolding, the only thing the ball hits, which must reduce to the ported primitive set; `sw_` a switch zone; `vis_` non-collidable visual; `l_` an insert as lens *and* cup geometry, never a decal; mechanisms named as their device. Walls and floor have real thickness because thin planes tunnel; the playfield collision is one compound body.

Four frames meet here and the spine sanctions exactly three conversions (AD-10). The **table frame** is canonical: playfield-local mm, right-handed, origin at the bottom-left corner nearest the player, X right, Y up the playfield, Z toward the glass. The **glb frame** is Blender's default export, no added rotation: metres, glb +X = table +X, glb +Y = table +Z, glb −Z = table +Y. **Physics** keeps VP units (1 U = 0.53975 mm, ball radius 25 U, y-down). The **scene** is metres with `useRightHandedSystem = true`, so no `__root__` flip exists and `toScene()` is mm→m plus the inverse glb permutation. `frames.ts` exports `glbToTable()` (loaders only), `toPhysics()` and `toScene()`; nothing else converts units or axes, so the ball cannot render at the mirror of its collision position.

Geometry is authored unpitched. Pitch is applied by physics as the gravity vector (the VPX slope model) and by presentation as a rotation of `playfield_root` only, about `pivot_pitch`, by the effective pitch read from the snapshot each frame; `cabinet_root` stays level. Tilting the geometry would apply pitch twice or nowhere.

`TABLE.reference = { playfieldMm: { w: 514.4, h: 1066.8 }, ballMm: 26.99, pitchDeg: 6.5, flipperBatIn: 3.125 }`, and the loader asserts `col_playfield` bounds and flipper node lengths against it (AD-10): realism lives in proportions, so a wrong-size playfield is a load failure. Epic 1 ships a placeholder `.blend` of primitives that already follows every prefix (AD-11) — the pipeline is the deliverable; art must not block it.

## 9. Host

Boot (AD-17) renders a press-to-begin panel (the Web Audio unlock), checks WebGL2 before any asset loads, and shows an unsupported-browser message naming Chrome, Edge and Safari rather than a broken canvas. Any later boot failure — asset 404, glb parse, engine creation — renders the same error panel. The engine is chosen once via `EngineFactory.CreateAsync` before the scene exists (AD-12). Context loss uses Babylon's restore path while the sim keeps stepping.

Persistence is host-only (AD-14): one `localStorage` key `dragonwar.save` holding `{ v, settings, keybindings, highscores }` with a forward migration per version. `GameStart { seed, tuning, adjustments, highscores }` is the one bundle the host hands `sim/loop`; `highscores` is read-only inside `sim/`, rules own the `highscore_entry` phase, and the host persists on `highscore_entered` and nothing else.

Settings split by owner. Sim adjustments (Pitch, Tilt warnings, balls per game, Match probability) layer table defaults → preset (deferred; a preset may lock keys, the slot a Competition mode would use) → player overrides, applied at the next game. Host settings (volume, key bindings) apply immediately, and `ViewConfig { bindings }` lets Attract show the keys once. Rebindable keys are the only accessibility feature in v1.

The dev tuning panel hot-applies table tunables and exports to `tuning.ts` (AD-15); a hot-apply during a recording invalidates it. It is the tool behind UJ-4, the feel-test ritual: play the Reference machine, play the build, name what differs on cradling, flipper snap and rejection, and turn each difference into a tuning change or a documented acceptance. `?renderer=webgl2` and a Settings toggle force the WebGL2 engine so the ritual runs on both paths (AD-12).

## 10. Determinism and testing

Two constant classes, not interchangeable (AD-15). **Solver constants** in `sim/physics/constants.ts` — `PHYS_SKIN`, `PHYS_TOUCH`, `C_DISP_GAIN`, `STATICTIME`, ball–ball restitution — are ported verbatim, tuned for `TICK_HZ = 1000`, never tunable. `PHYS_SKIN` is not a slider because it governs solver stability, not table feel; changing one is a physics-version bump that re-records every golden. **Table tunables** in `sim/table/tuning.ts` — the four material parameters `{ elasticity, elasticityFalloff, friction, scatter }` (VPX defaults 0.3/0/0.3/0), flipper strength, ramp-up, EOS (end-of-stroke), return, hop control, pitch bounds, timers, scoring, `matchPercent`, `tiltWarnings`, slam threshold — are the feel knobs; the addendum names elasticity falloff the primary one.

Every table tunable carries `source` and `confidence`, and the research's do-not-invent numbers ship marked `unverified`, changed only by measurement against the Reference machine: steel-on-clearcoat or steel-on-rubber restitution and friction, manufacturer coil pulse duration, the flipper tip gap, a dimensioned drain zone, any hours-per-table figure. Match 8 % is unverified (PRD OQ-2). Hop control is one explicit tunable and must not be scatter or randomness.

A replay is `ReplayHeader + InputTransition[]`; the header embeds the whole `GameStart` plus `physicsSeed`, `tickHz`, `tableHash`, `assetHash` and `physicsVersion`. The state hash is FNV-1a over canonical JSON of `GameState` plus ball positions quantised to 0.01 mm. Goldens under `test/replays/*.replay.json` are recorded in Node in CI; browser parity is asserted on `GameState` only, because Safari's `Math.sin` need not match V8's to the last bit — so the ball-position part of the hash is asserted only in the engine that recorded it.

Rules are tested headless in Vitest through a switch-script DSL typed by `SwitchName`: timed closures and openings against `GameState`, the whole point of the game-CPU paradigm. Presentation has no automated tests in v1 beyond a `NullEngine` load smoke.

## 11. Build, deploy and licensing

The repository is a single package with directory seams (memlog Q8); a workspace was rejected because, for a solo project with one deploy artefact, packaging adds ceremony without adding a boundary a lint cannot enforce. dependency-cruiser enforces the boundaries in CI (AD-16): the import rules of §2, the banned globals under `sim/**`, `@babylonjs/havok` banned everywhere, device-name literals outside `sim/table/dragonwar.ts` and `test/**` as errors. The tool was chosen because TypeScript 7.0 (the native Go port) ships no compiler API until 7.1 — `tsc --noEmit` works, but typescript-eslint and vite-plugin-checker break. The freshness lens caught this and also moved the toolchain to Node 24 LTS.

Deployment is GitHub Pages via Actions on `main` (memlog Q5): typecheck, dependency-cruiser, Vitest goldens, build, CSP grep, size budget, SHA stamp, deploy `dist/`; local `vite dev` and production are the only environments. The bundle is static with relative paths and no service worker so Tauri can wrap the same `dist/` later (AD-17). `index.html` carries `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'">` and CI greps for it — no network after load is enforced, not promised. The compressed initial payload budget is 20 MB, an `[ASSUMPTION]` spike 3 re-sets. The commit SHA is stamped into the build and shown in Settings; `v1.0.0` is tagged at release.

The licence is GPL-3.0 by compatibility chain, not preference. vpx-js's source headers grant GPL-2.0-*or-later* (its `package.json` says only `GPL-2.0`, which is why the project never trusts package metadata); Babylon.js is Apache-2.0, compatible with GPL-3.0 but not GPL-2.0-only; MPF is MIT. GPL-3.0 is the only licence above all three. Ported files keep their original headers plus `// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0`, checked per file — stripping a notice breaks the grant the port depends on.

Per-file rules for the rest (AD-16): `vpinball/vpinball` code only from files whose first line reads `// license:GPLv3+`, because unmarked files carry non-commercial MAME terms; `vpx_lightmapper` technique-only until its licence is verified; `pinball-parts` (CC BY-SA) minus its NC-SA node group; author recordings of a real machine are mechanical noise only. The `ATTRIBUTIONS.md` entry lands before the file, and compatibility is re-checked whenever the renderer or physics source changes.

## 12. Alternatives considered

| Decision | Chosen | Alternatives | Why |
| --- | --- | --- | --- |
| Sim placement (Q1) | Main thread, one rAF loop | Web Worker | No COOP/COEP on Pages → no `SharedArrayBuffer`; a Worker means posted snapshots and an input hop. |
| Table definition (Q3) | Typed TS module, `TABLE as const` | YAML with a loader | Name unions for free; literals elsewhere lint. |
| Lighting (Q2) | UV2 contract now, bake later; clustered forward on WebGL2 | Bake first; fully dynamic | Bake-first is a sink on the critical path; fully dynamic forgoes bounce and soft shadows. |
| Tick (Q6) | 1000 Hz verbatim | 480 Hz | Ported constants stay valid; 480 Hz is a re-tune, taken only if spike 1 fails. |
| Slam tilt (Q7, OQ-4) | Nudge count in physics, own threshold | Host-side detector; distinct key; a Setting | Host-side is outside the replay; never the bob's threshold. |
| Hosting (Q5) | GitHub Pages via Actions | Cloudflare Pages, Netlify | A static bundle needs no custom headers once the Worker is deferred. |
| Repository (Q8) | Single package, lint-enforced seams | pnpm workspace | Packaging adds no boundary a lint cannot. |
| Boundary lint | dependency-cruiser | typescript-eslint | TS 7.0 has no compiler API. |
| Physics (inherited) | Time-of-impact core ported from vpx-js | Jolt, Rapier, Havok, PhysX, cannon-es, Ammo; derive from scratch | General engines reproduce the failure catalogue; deriving rediscovers twenty years of constants. |
| Renderer (inherited) | Babylon.js, WebGL2 floor, WebGPU enhancement | Three.js, Unity Web, Godot 4, Unreal, Bevy | Engine-shaped, dual backend; Three ships no physics; Godot web is compatibility-only; Unreal has no web target. |
| Ball lock (inherited) | Physical `multiball_lock`, per-player credits | Virtual lock; `ball_hold`; lock stealing; release on player change | The dragon returning your balls is the whole moment; per-player credits solve Hot seat. |
| Packaging (inherited) | Browser-first, Tauri later | Native-first (research) | Click-and-play is the share story; spikes 1 and 3 carry the residual risk. |

## 13. Open gates and risks

**Spikes 1 and 3 gate browser-first.** The research recommended native-first; the addendum overrode it on distribution grounds but concedes the technical-precedent half is unanswered — no browser game at this fidelity was found. Spike 1 is a pass/fail frame-budget test of the ported loop at 1 kHz over six bodies (the WASM comparator is dropped because sourcing is decided); spike 3 is measured build size and load. Both run in epic 1; the author owns them. Spike 1 failing means 480 Hz and a solver re-tune; spike 3 failing re-sets the 20 MB budget and possibly the single-glb assumption.

**Spike 2** is the lightmap scaling envelope — group count, resolution, frame cost, memory; its group count feeds the provisional `TABLE.lightGroups` partition. The addendum's illustrative 10 × 2048² RGBA8 ≈ 160 MB is why the bake is deferred rather than assumed.

**Renderer re-check 2026-09-26.** Clustered-on-WebGL2, WebGPU support (Safari partial; default-on only on macOS 26 Tahoe+) and the Node line carry that date; ecosystem health (vpx-js dormancy, Babylon cadence) is due 2027-02-26.

**The Reference machine is unnamed** (PRD OQ-1) — tuning targets only, but the feel test is not reproducible until it is named.

**Art is the unbudgeted risk.** The addendum calls photoreal art "the art budget that would sink a solo project"; the structural answer is the epic-1 placeholder `.blend` and realism placed in proportions and light. The playfield geometry (PRD OQ-6: flipper tip gap, outlane widths, post positions) is epic 2's first design problem; a Bally template drawing is the highest-value input and needs an `ATTRIBUTIONS.md` entry like any asset.

**The bake pipeline is a sink.** vpx_lightmapper is self-described pre-alpha with no shadowing; Unity practitioners report multi-hour bakes. It sits behind a fixed contract precisely so it cannot block anything.

**Feel is unbounded.** The research's red team is blunt: feel is where the schedule goes, tunnelling is the easy part, and no instrumented realism benchmark exists. The bar is UJ-4 — a repeatable ritual against the Reference machine on cradling, flipper snap and rejection — and AD-15 sets the tie-break: when tuning trades feel for fidelity, feel wins.

## 14. Reading the seams

Plain-language guide to `sim/contracts/`; the spine's Seam Contracts table is the binding shape.

- **`InputAction` / `InputFrame`** — the closed action set and a bitset of which are held; `host/input` produces, key codes never cross.
- **`InputTransition`** — `{ tick, frame }`, the frame in force from that tick; the body of every replay.
- **`SwitchEvent`** — one edge of one named switch; physics and `sim/loop` produce, only `sim/rules/devices` consumes.
- **`ContactEvent`** — a ball hit or an actuation; physics produces, only presentation consumes.
- **`ContactSurface`** — the closed material enum a `col_` mesh carries.
- **`CoilCommand`** — `pulse | enable | disable` on a named coil; rules produce, physics consumes next tick.
- **`RecoverCommand`** — ball-search final stage; physics's only licence to despawn a loose ball.
- **`LampCommand`** — `{ lamp, role, step }`, the diff of `lampsOf(state)`, looked up in `grammar.ts`.
- **`GiCommand`** — `{ channel, level }`, the only continuous light level; latest wins.
- **`FlasherCommand`** — `{ flasher, ms }`, coil-class; the driver enforces duty cycle.
- **`ShowCommand`** — a named non-lamp effect: audio cue or mechanism animation.
- **`SemanticEvent`** — a game fact carrying everything a listener needs; never joined to the snapshot.
- **`Snapshot`** — balls, mechanisms, read-only `GameState`, effective pitch; once per frame; structured-cloneable.
- **`ModeView`** — the only view of an active mode presentation may read.
- **`FrameOutput`** — snapshot, events, contacts and commands for all N steps of a frame, in tick order.
- **`GameStart`** — `{ seed, tuning, adjustments, highscores }`, the one bundle host hands sim.
- **`ReplayHeader`** — `GameStart` plus `physicsSeed`, `tickHz`, `tableHash`, `assetHash`, `physicsVersion`.
