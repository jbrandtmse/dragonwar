---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-dragonwar-2026-08-26/prd.md
  - _bmad-output/planning-artifacts/prds/prd-dragonwar-2026-08-26/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/SOLUTION-DESIGN.md
  - _bmad-output/specs/spec-dragonwar/SPEC.md
  - _bmad-output/specs/spec-dragonwar/machine-behaviour.md
  - _bmad-output/specs/spec-dragonwar/physics-tuning.md
  - _bmad-output/specs/spec-dragonwar/user-journeys.md
  - _bmad-output/specs/spec-dragonwar/design-principles.md
  - _bmad-output/specs/spec-dragonwar/decisions-rejected.md
  - _bmad-output/specs/spec-dragonwar/licensing.md
  - _bmad-output/specs/spec-dragonwar/glossary.md
uxDesignContract: none
---

# DragonWar - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for DragonWar, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

Numbering is kept from the sources so traceability holds end to end: **FR-N** is the PRD's number, **CAP-N ≡ FR-N** in the SPEC, and the architecture spine's `binds:` resolve to the same ids. Architecture-derived requirements are numbered **AR-N** here (they have no number in the spine; each cites its AD). No UX design contract exists for this project (no `ux-designs/` run and no `*ux*.md`); presentation requirements are carried by FR-1..4, FR-42..48 and the AR entries, so the UX-DR section is intentionally empty.

## Requirements Inventory

### Functional Requirements

**Walk-up and presentation (§4.1)**

- FR-1: The Table plays the Walk-up (lit backbox and animating Backglass first, then the camera descends to the fixed playfield view) on first load and on every return to Attract; pressing Start during the Walk-up skips to the playfield and starts a game.
- FR-2: The player sees the Playfield from one authored, fixed point of view with no camera controls; both flippers, the Dragon, both Loops, the Ramp and the DRAGON bank are legible; the Backglass remains visible as a strip at the top.
- FR-3: The Backglass is an animated, pixelated, dot-matrix-style display carrying score(s), player-up and ball number, Mode prompts and timers, Jackpot value, Strikes remaining, Tilt warnings, Match and High-score entry; the war fiction plays in Attract.
- FR-4: Ball (26.99 mm), flipper bat (3.125 in rubbered), playfield (20.25 × 42.00 in = 514.4 × 1066.8 mm) and default Pitch (6.5°) are at real dimensions; the loader asserts playfield bounds and flipper lengths against `TABLE.reference` and fails on mismatch.

**Ball and flipper feel (§4.2)**

- FR-5: A player can cradle, live-catch, light-tap, dead-bounce, post-pass and backhand as on the Reference machine; holding a flipper keeps a cradled ball cradled, a brief tap moves the flipper partially, the left flipper can backhand the Dragon. Acceptance is the three-item feel test (cradling, flipper snap, rejection/rebound).
- FR-6: Rebounds off rubbers, posts and flippers are lively at low speed and never pingy or airball-prone at high speed; elasticity falloff is the primary control; after tuning the feel test names no "pingy" difference.
- FR-7: The ball never passes through Playfield geometry and the game never stalls at any display frame rate; identical inputs produce identical outcomes at 30, 60 and 120 Hz; owed simulated time beyond 200 ms is discarded (`sim_time_discarded`) rather than freezing or fast-forwarding.
- FR-8: Ball physics has no artificial randomness (scatter 0, fixed timestep); a recorded input sequence (`ReplayHeader + InputTransition[]`) replays to the same state hash; the only randomness is seeded Rules-layer draws (Match, Skill-shot lane).
- FR-9: Occasional ball hops come from one explicit tuning control; at zero there are no hops, the default produces occasional hops on hard hits; the control is neither scatter nor randomness.
- FR-10: The player can change Pitch within 6.0–8.5° (default 6.5°); steeper Pitch makes the game visibly faster; the change applies at the next game.
- FR-11: Rollovers, targets, the DRAGON bank, the Lock lane and the drain register fast balls without misses at any speed the Physics core can produce; switch zones test the ball's per-tick swept segment, never its end position.
- FR-12: Balls collide plausibly with each other during Quick multiball and the War; two balls never overlap or stick; collisions transfer momentum.

**Nudge and tilt (§4.3)**

- FR-13: The player can Nudge left, right and up from the keyboard and the ball responds as to a cabinet movement (the ball keeps its inertia while the cabinet moves — never a force on the ball); a Nudge during a cradle can free the ball and disturbs the Tilt bob.
- FR-14: Repeated or hard Nudges produce per-player Tilt warnings on the Backglass up to the Settings count (default 1); warnings are per player in Hot seat; the bob's continued swing cannot produce two warnings inside the spacing window.
- FR-15: Exceeding the warning count Tilts: flippers go dead, every ball drains, the End-of-ball bonus is forfeited, the score is kept; during a multiball the ball ends when the last ball drains and the Mode ends with it; the next ball starts normally; Backglass shows TILT.
- FR-16: Violent cabinet abuse triggers Slam tilt via a tick-windowed nudge count in physics with its own threshold (`slamNudgesPerWindow`, never the bob's) closing `s_slam_tilt`; all players' games end; the Table returns to Attract; the event is inside the replay.

**Standard game flow (§4.4)**

- FR-17: Start begins a game; Start again before the first ball ends adds a player, up to four; letters, Lock credits, Modes played, Tilt warnings and bonus are per player; Backglass shows player-up; balls per game is a Setting (default 3).
- FR-18: The player plunges manually with a variable-strength key hold on a launcher that is not bouncy; the Skill shot is the lit Top lane, rotating each plunge, awarding a fixed value plus a letter; "plunged" is the opening of `s_shooter_lane`; the Skill shot closes on the next playfield closure that is not a Top lane; Backglass shows ARM YOURSELF at plunge.
- FR-19: Ball save is enabled at launch, its timer starts on `ball_launched` (not on enable), shows a hurry-up state before expiry, and keeps a Grace period (default 2 s) past displayed expiry during which drains still save; saved balls auto-launch; multiball Modes arm their own windows, the longest live window wins, Tilt disarms all.
- FR-20: Each ball accumulates bonus by category (letters, Loops, Strikes) multiplied by the Bonus multiplier, paid at ball end unless tilted; completing the Top lanes advances the multiplier 2×→3×→5× (cap), reset each ball; Backglass counts the bonus down; Tilt pays nothing.
- FR-21: Extra balls are lit by at least three long-horizon achievements (win a War, complete a Joust at full Charge, play every Mode once) and collected at the Right Loop; Extra-ball Inserts are purple.
- FR-22: At game end a Match draw compares a multiple-of-ten number against each player's last two score digits and awards a free game; probability is a Setting defaulting to 8 %; drawn from the seeded rules PRNG; under v1 free play the award is display-only.
- FR-23: If no switch closes for 15 s during play, the Table runs an escalating Ball search (per-device `ballSearchOrder` pulses, then `RecoverCommand`) and on failure serves a new ball, emitting `ball_missing { count }`; it never releases locked balls while a Mode timer runs.
- FR-24: After the last ball the Table shows scores, offers High-score entry where earned, runs Match, and returns to Attract with the Walk-up; Attract cycles Backglass animations and the High-score table and shows the flipper keys once.
- FR-25: Flipper buttons rotate the lit Insert across the inlane/outlane set and the Top lanes, one position per press.

**Shot map and playfield devices (§4.5)**

- FR-26: A Left Loop and a Right Loop whose exits feed straight toward the flippers, distinguishable as shots; the Spinner is on the Left Loop only and awards per rotation; each Loop is a declared switch sequence with a tick window (`shot_left_loop`, `shot_right_loop`).
- FR-27: One Ramp whose completion advances the light-a-Mode progression and returns the ball to an inlane (return side decided in epic 2 geometry); a Ramp miss returns to a flipper.
- FR-28: A six-target drop bank: each target down lights its letter; all six down spell DRAGON, award, and reset the bank; letters persist per player across balls; a dropped target is non-collidable until `c_dragon_bank_reset` (on `bank_completed` and on `ball_will_start`); during the War a full bank counts as Strikes instead of letters.
- FR-29: The Dragon is an off-centre bash target with the Lock lane between its legs and the Mouth as the Lock's eject; a rejection deflects toward a flipper, not the drain; a precise Lock-lane shot enters the Lock, a slightly-off shot hits the body; the Mouth fires balls upward and out toward the flippers; the right flipper takes the Dragon straight and the left flipper backhands it.
- FR-30: The Dragon opens its Mouth whenever the Mouth ejects (`show_dragon_mouth_open` precedes every eject by `mouthOpenLeadMs`), holds it open for the War start, and reacts visibly to every hit; v1 scope is mouth open/close plus one hit reaction, no idle animation.
- FR-31: The Playfield also has two slingshots, pop bumpers, three Top lanes, two inlanes, two outlanes and a plunger lane; pops and slings score and disturb the ball as hardware rules in physics; outlanes drain; ball guides end at rubber posts, never bare metal.
- FR-32: Every shot's miss comes back playable (Lawlor's test), verified per shot in the feel test; no shot's most common rejection is a centre drain.

**Feature modes (§4.6)**

- FR-33: Ramp completions light Modes in campaign order (Hurry-up, then Quick multiball, then Joust); a lit Mode starts when the ball enters the Lock lane; with several lit the player selects with the flipper buttons inside `modeSelectMs` while the ball stays parked and Start or either flipper confirms; when lock and mode start both apply the lock is credited first and the Mode runs with the newly served ball; a Mode can be played again once all three have been played.
- FR-34: Hurry-up starts at 250,000 and decays to a 50,000 floor over 20 s, collected at the Ramp; Backglass shows the decaying value; the Ramp Insert is red while it runs; its timer keeps running under a multiball.
- FR-35: Quick multiball adds one ball (2-ball) with its own Ball save and awards on Dragon hits and Ramp shots; ends when one ball remains; the Lock is disabled (a Lock-lane entry is a bash hit); neither a War nor a lock can start inside it; it cannot start during the War; its Inserts are green.
- FR-36: Joust rewards alternating Loops: each consecutive alternating Loop builds the Charge, a miss or the same Loop twice breaks it; Charge multiplies the Loop award up to 10×; Backglass shows CHARGE ×N; Joust Inserts are blue.
- FR-37: A Lock-lane shot locks the ball whenever the player has fewer than two Lock credits and no multiball is running; the credit rises by one and a new ball is served; credits are per player, backed by one physical Lock; if the Lock is physically full of another player's balls it ejects one (`lock_lane_spit`) and the credit still counts; the Lock Insert is orange while lockable.
- FR-38: The War starts the instant the current player has both DRAGON spelled and two Lock credits, whichever completes last; the Mouth opens and fires every ball in the Lock; the trough auto-launches the difference to reach three in play; the Lock is disabled so a Lock-lane shot counts as a Strike; War Inserts are orange; the War start is the brightest, loudest event on the table.
- FR-39: Each Dragon hit during the War is a Strike; 10 Strikes win the War and pay the Jackpot on the winning Strike; each further Strike in the same War re-awards the Jackpot; the Jackpot is progressive (500,000 base plus 500,000 per War started this game, seeded per player); Backglass shows Strikes remaining; winning lights Extra ball once per game.
- FR-40: The War ends when one ball remains; DRAGON letters reset and Lock credits return to zero; the Jackpot seed carries; a second War must be earned again.
- FR-41: When Modes overlap the War takes presentation priority, then Quick multiball, then timed Modes; scoring from all active Modes accrues; priorities are unique (base 100, Skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500); the Backglass shows the highest-priority Mode; `modes[]` is empty between balls.

**Lighting and colour grammar (§4.7)**

- FR-42: GI, feature Inserts, Flashers and Architectural lighting are four independently driven channels; GI can dim during the War without affecting Inserts; Flashers have duty-cycle limits and never stay on.
- FR-43: Inserts are lights beneath the translucent Playfield through a cup, not decals; an Insert glows and spills onto adjacent art; the envelope is 50–150 individually addressable Inserts; every `l_` node carries lens and cup geometry and the playfield material carries a translucency mask.
- FR-44: Insert colour follows the held grammar and never varies — white = shot lit / qualifying; red = Hurry-up; green = Quick multiball; blue = Joust; orange = DRAGON letters, Lock and the War; purple = Extra ball / special; Jackpot progression is a brightness/blink ladder within the Mode colour; rules emit roles and steps 0–3, never RGB, and `grammar.ts` is the single role→colour table.
- FR-45: Flashers fire on Mode starts, locks, the Mouth ejecting, Jackpot and Tilt; the War start is the brightest event on the table; every `FlasherCommand` carries a duration honoured by the driver's duty-cycle limiter.

**Audio (§4.8)**

- FR-46: Flippers, slingshots, pops, the DRAGON bank drop and reset, the Lock, the Mouth, and the ball on wood and rubber each produce a sound driven by contacts and ball velocity; flipper snap is audible at every press and never during Tilt; ball roll varies with speed and surface as one continuous voice per ball; every mechanical sound has exactly one source (`ContactEvent`).
- FR-47: Every sound is addressed by name through an asset interface so recorded sounds can replace generated ones without touching game logic; replacing a sound file (or swapping a synth for a sample in `AudioAssetProvider`) changes the sound and nothing else.
- FR-48: Mode start, locks, War start, Jackpot, Tilt and Match each have an audio cue fired from `ShowCommand` only; the War start cue is distinct from everything else; cues are short generated stings — no music, no speech.

**Input, settings and persistence (§4.9)**

- FR-49: The Table is fully playable from a rebindable keyboard; defaults are left/right Shift for flippers, Enter to plunge (hold for strength), Space/arrow keys to Nudge, 1 for Start, Escape for Settings; Attract shows the current bindings once; bindings persist; key codes never enter `sim/`.
- FR-50: The player can set Pitch, Tilt warning count, balls per game, Match probability and volume, persisted across sessions; sim adjustments apply at the next game, volume and key bindings immediately; a reset-to-defaults exists; the build's commit SHA is shown.
- FR-51: The Table keeps a Grand Champion and a ranked High-score table with three-initial entry via the flippers and Start, persisted locally; a qualifying score prompts initials entry at game end (rules own the phase; the host persists on `highscore_entered` and nothing else); Attract cycles the table.
- FR-52: Persistence is per browser with no accounts and no network — one versioned `localStorage` document with forward migration; clearing site data resets the machine to factory; nothing is transmitted.

**Distribution (§4.10)**

- FR-53: The Table loads and plays from a URL with no install, plugin or account; a stranger reaches the Walk-up with only a press-to-begin gesture between; the build is a static `dist/` with relative paths deployed to GitHub Pages.
- FR-54: Current Chrome, Edge and Safari on Windows and macOS are supported, Firefox best-effort (Edge's functional support is unchanged; it is best-effort for the Story 1.1 frame-budget gate only — see that story's change log); WebGL2 is the floor and WebGPU an enhancement; an unsupported browser gets a message naming supported ones before any asset loads; the WebGL2 path is fully playable and equal in feel; WebGPU improves lighting quality only; `?renderer=webgl2` and a Settings toggle force the floor.
- FR-55: The repository is public under GPL-3.0 with a clean, verified attribution ledger — every third-party file and generated asset in `ATTRIBUTIONS.md` with source, author, licence and verification date before it enters; ported files keep their original notices plus the DragonWar marker, checked per file in CI; `v1.0.0` is tagged.

### NonFunctional Requirements

- NFR-1: Stable 60 FPS in the supported browsers on a mid-range laptop GPU from 2022 or later; physics is decoupled from render rate.
- NFR-2: Fixed physics timestep in the 480–1000 Hz band (`TICK_HZ` = 1000 from the port; 480 only if spike 1 fails); nothing tunnels at any display rate.
- NFR-3: Flipper response within one 60 Hz display frame of key press (≤ 16 ms added by software); the flipper loop is entirely local (a hardware rule in physics).
- NFR-4: First playable Walk-up within 10 s on a 50 Mbps connection; compressed initial payload ≤ 20 MB enforced in CI as the proxy (re-set by spike 3).
- NFR-5: The Rules layer runs headless as a pure function of Switch events; identical inputs replay identically to a state hash (FNV-1a over canonical `GameState` plus ball positions quantised to 0.01 mm).
- NFR-6: Windows 11 and macOS current-1 in current Chrome, Edge and Safari; Firefox best-effort; no mobile or Linux commitment.
- NFR-7: Local browser storage only; no network calls after load (CSP `default-src 'self'; connect-src 'self' blob:; img-src 'self' blob:`, grepped in CI).
- NFR-8: English only; rebindable keys are the sole accessibility feature; English literals live in `presentation/backglass` only.
- NFR-9: Provenance is a hard requirement: the `ATTRIBUTIONS.md` entry lands before the file; licences verified at source, never from package metadata; nothing unlicensed, non-commercial, GPL-2.0-only, or from a commercial machine; `vpinball/vpinball` only from files headed `// license:GPLv3+`; author recordings of generic mechanical noise only.

### Additional Requirements

**Starter template and repository shape**

- AR-1 (Stack, Structural Seed): **No starter template is specified — greenfield.** A single package (no workspace) on Node 24 LTS, pnpm 11.24.0, Vite 8.2.2, TypeScript 7.0.2 (`tsc --noEmit` gate only; explicit `types`, no `baseUrl`), Vitest 4.1.11, dependency-cruiser 18.2.0, `@babylonjs/core` and `@babylonjs/loaders` 9.22.2, Blender 5.2.1 LTS, glTF 2.0. The directory seed is fixed: `src/sim/{contracts,table,physics,rules,loop}`, `src/presentation/{scene,mechanisms,lighting,backglass,audio,camera}`, `src/host/{boot.ts,loop.ts,input,persistence,settings,dev}`, `assets/src/`, `public/assets/`, `test/replays/`, `tools/`, `.github/workflows/`. This shapes Epic 1's scaffold story.
- AR-2 (PRD §6.3, SPEC Process, OQ-8): **Spike 1 and spike 3 are Epic 1's first two stories; nothing else in Epic 1 lands before them.** Spike 1: pass/fail frame-budget test of the ported loop at 1 kHz over six bodies (fail → `TICK_HZ` 480, solver re-tune, goldens re-recorded). Spike 3: measured build size and load time (re-sets the 20 MB budget and the single-`dragonwar.glb` assumption).
- AR-3 (Deferred, SPEC Process): Spike 2 (lightmap scaling envelope — group count, resolution, frame cost, memory) runs before the `TABLE.lightGroups` partition freezes; it is not on Epic 1's critical path.
- AR-4 (PRD §6.3): Epic sequencing is binding: (1) one ball, two flippers, bare Playfield at real dimensions, feel test starting and never stopping; (2) full shot map geometry and standard game flow; (3) Modes and the War; (4) presentation depth — lighting bake, Backglass animation, audio; (5) art passes, phased, allowed to trail. Nothing in (1)–(3) waits on art. Scoring values and Strike count freeze after the first full playtest of epic 3 (`confidence: playtested`).

**Layering, time and the loop**

- AR-5 (AD-1, AD-16): The dependency graph is law: `sim/**` is DOM-free, Babylon-free, wall-clock-free and unseeded-random-free; `presentation/**` imports only `sim/contracts` and `sim/table`; `host/**` never imports `sim/physics` or `sim/rules`; `@babylonjs/havok` is banned everywhere; device-name string literals outside `sim/table/dragonwar.ts` and `test/**` are lint errors. dependency-cruiser enforces all of it in CI. One table: `sim/table/dragonwar.ts` is imported directly; no `Table` interface, loader API or plugin API.
- AR-6 (AD-3): `TICK_HZ` is one constant in `sim/contracts/time.ts`; `tick` (uint32, reset at game start) is the only time in `sim/`; every rules timer is authored in ms in `tuning.ts` and converted to ticks once at load; no literal millisecond elsewhere in `sim/`. Rules randomness draws from a seeded PRNG in `GameState.rng`; physics scatter is 0 and any physics randomness uses a second seeded PRNG; both seeds sit in the replay header.
- AR-7 (AD-4): Host stamps every key transition with a sim tick from the DOM event `timeStamp`; `advance(elapsedMs, InputTransition[])` applies the `InputFrame` in force at each tick; the accumulator carries the fractional remainder; owed time beyond 200 ms is discarded with `sim_time_discarded { ms }` first; `rules.step` runs after every physics step; commands issued at tick *t* apply at *t+1*; `FrameOutput` carries every event and command from all N steps in tick order; presentation renders the latest snapshot without interpolation, lamp/GI latest-wins, shows/flashers/contacts scheduled by tick offset, never dropped.
- AR-8 (Seam Contracts): `sim/contracts/` holds the closed unions — `InputAction`, `InputFrame`, `InputTransition`, `SwitchEvent`, `ContactSurface`, `ContactEvent`, `CoilCommand`, `RecoverCommand`, `LampCommand`, `GiCommand`, `FlasherCommand`, `ShowCommand`, `SemanticEvent`, `Snapshot`, `ModeView`, `FrameOutput`, `GameStart`, `ReplayHeader` — with the fields the spine names; name unions (`SwitchName`, `CoilName`, `LampName`, `GiChannel`, `FlasherName`, `ShowName`, `ShotName`) come from `sim/table/names.ts` via `typeof TABLE`; contracts are generic over them and never import the table.
- AR-9 (AD-11): `src/sim/table/dragonwar.ts` exports `TABLE as const` — the sole registry of switches (with `settleTicks` class), coils, lamps (channel + group), flashers, ball devices (capacity, slot switches in fill order, eject coil, `ballSearchOrder`), shots, shows, `lightGroups`, `reference`, wiring and glb node names. Names use MPF prefixes (`s_`, `c_`, `l_`, `f_`, `gi_`, `bd_`, `shot_`, `show_`).

**Physics (the cabinet)**

- AR-10 (AD-15, AD-16, licensing): Port `vpdb/vpx-js` at commit `e8a6d6f` — `lib/physics/`, `lib/vpt/ball/`, `lib/vpt/flipper/`, `lib/game/player-physics.ts` — under `src/sim/physics/`, headers checked per file, original copyright retained plus `// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0`; the `ATTRIBUTIONS.md` entry lands first. Solver constants (`PHYS_SKIN 25.0`, `PHYS_TOUCH 0.05`, `C_DISP_GAIN 0.9875`, `STATICTIME 0.005`, ball–ball restitution and peers) live verbatim in `sim/physics/constants.ts`, never tunable; changing one is a physics-version bump.
- AR-11 (AD-2): Physics emits playfield and cabinet-mechanism `SwitchEvent`s as edges only, with per-switch hysteresis and `settleTicks` by class (rollover 0, standup 8, drop target 20, bumper skirt 2, tilt bob 0); `sim/loop` emits the button switches (`s_start`, `s_flipper_l`, `s_flipper_r`, `s_plunger`) from `InputFrame` transitions; rules never debounce. Physics emits `ContactEvent`s (ball hits with `speed`, `surface`, `pos`, and actuations `coil_fire`, `flipper_eos`, `drop_target_down`, `bank_reset`, `eject`, `spinner_tick`) to presentation only.
- AR-12 (AD-5): Flippers, the manual plunger, slingshots and pop bumpers are hardware rules inside the physics step behind their coils (`c_flipper_l/r`, `c_sling_l/r`, `c_pop_*`), gated only by `CoilCommand enable | disable`; Tilt, game over and Attract disable them together. `FlipperMover` is ported verbatim (strength, ramp-up, EOS torque and angle, return, inertia ⅓·m·r²); MPF pulse/hold figures are calibration references only. The manual plunge maps `s_plunger` hold ticks through `plungerSpeedByHoldMs`.
- AR-13 (AD-5): The cabinet oscillator is ported; the ball coupling is re-derived as table-frame motion and pinned by a golden replay; the tilt bob is a pendulum closing `s_tilt_bob`; the slam detector is a tick-windowed nudge count beside the oscillator with threshold `slamNudgesPerWindow`, closing `s_slam_tilt`.
- AR-14 (AD-6): The machine carries 4 balls, asserted at boot. `bd_trough` (capacity 4, `s_trough_1..4`, `c_trough_eject`) and `bd_lock` (capacity 3, `s_lock_1..3`, `c_mouth`) are parking devices: park unconditionally into the lowest empty slot, eject the highest filled slot one ball per pulse at the authored pose (the Lock's pose is the Mouth). `bd_shooter` is non-parking: the served ball rests on the plunger tip, entry `s_shooter_lane`, exits by manual plunge or `pulse c_autolaunch`. Device counts are the number of closed slot switches; rules enforce capacity and answer `device_overflow` with an eject.
- AR-15 (AD-6): Drop targets (`s_dragon_[d,r,a,g,o,n]`) and the spinner keep mechanical state in physics — a dropped target is non-collidable until `pulse c_dragon_bank_reset`; the spinner spins from contact and closes `s_spinner` once per revolution until it decays. `RecoverCommand` is the one command that lets physics despawn every ball outside a device; `step()` returns the `recovered` count.
- AR-16 (AD-10): The table frame (playfield-local mm, right-handed, origin bottom-left nearest the player, X right, Y up the playfield, Z toward the glass) is canonical; `TABLE.reference = { playfieldMm: { w: 514.4, h: 1066.8 }, ballMm: 26.99, pitchDeg: 6.5, flipperBatIn: 3.125 }`; physics keeps VP units internally (1 U = 0.53975 mm, ball radius 25 U, y-down); `frames.ts` exports exactly `glbToTable()`, `toPhysics()`, `toScene()`; geometry is authored unpitched and Pitch is applied by physics as the gravity vector and by presentation as a rotation of `playfield_root` about `pivot_pitch`; the Babylon scene uses `useRightHandedSystem = true`.
- AR-17 (physics-tuning): Table tunables in `sim/table/tuning.ts` each carry `source` and `confidence`; starting values: flipper elasticity 0.88, elasticity falloff 0.15, flipper friction 0.8–0.9, scatter 0, coil ramp-up 2.5, per-object material table `{ elasticity, elasticityFalloff, friction, scatter }` with VPX defaults 0.3/0/0.3/0 referenced by `phys_material`; hop control as one explicit tunable; do-not-invent numbers ship marked `unverified`.

**Rules (the game CPU)**

- AR-18 (AD-7): `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }`, JSON-serializable, mutated only inside `rules.step`. Player-scoped: score, letters, Lock credits, modes played, tilt warnings, bonus by category and multiplier, extra balls, lanes, Jackpot seed, Wars started. Machine-scoped: device slots and `ballsInPlay`, `hardwareEnabled`, `ballSave`, `tilt`, `multiball` (`null | 'quickmb' | 'war'`), read-only `highscores`. Mode-local under `modes[i]`, published only as `ModeView`. Lifecycle: `_will_stop` before `ball_ended`; `ball_will_start` resets `ballSave`, `tilt`, `multiball`; `ball_starting` enables hardware.
- AR-19 (AD-19): `sim/rules/devices/` is the only consumer of `SwitchEvent`; it owns the drop bank (letters and the reset coil — pulsed on `ball_will_start` and `bank_completed`), spinner count, ball-device slots, shooter lane and shots (`TABLE.shots` as ordered switch sequences with tick windows, e.g. `shot_left_loop = [s_loop_l_in, s_loop_l_out] within loopWindowMs`), emitting only device events: `shot_<name>_made/_broken`, `ramp_made`, `bank_target_down { letter }`, `bank_completed`, `dragon_hit`, `lock_lane_entered`, `spinner_spin { count }`, `lane_entered { lane }`, `lane_change_pressed { side }`, `ball_launched`, `device_ball_entered/left { device, slot }`, `button_pressed { button }`. Lane state is the base mode's.
- AR-20 (AD-18, machine-behaviour): The Lock arbiter in `sim/rules/ball-controller/` is the only consumer of `lock_lane_entered` and emits exactly one of `lock_lane_locked`, `lock_lane_mode_start { candidates[] }`, `lock_lane_strike`, `lock_lane_spit`, evaluated in the order multiball → lock (+ mode) → mode → otherwise eject; it alone pulses `c_mouth`, `c_trough_eject`, `c_autolaunch` and mutates `ballsInPlay`; every Mouth eject is preceded by `show_dragon_mouth_open` by `mouthOpenLeadMs`. "A multiball is running" means `machine.multiball !== null`, set only in `_starting` and cleared only in `_stopped` of Quick multiball or the War. `machine.ballSave` is one device with `arm({ ticks, source })` / `disarm(source)`.
- AR-21 (AD-8): Modes stack by unique numeric priority (base 100, skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500; a duplicate is a dev-mode assertion); each active mode receives every device and shot event highest-priority first; start/stop only through `mode_<name>_will_start / _starting / _started` and `_will_stop / _stopping / _stopped`; a mode contributes lamp roles by priority and never emits a `CoilCommand`.
- AR-22 (AD-9): Rules→physics commands are `CoilCommand` and `RecoverCommand`; rules→presentation are `LampCommand { lamp, role, step }`, `GiCommand { channel, level }`, `FlasherCommand { flasher, ms }`, `ShowCommand { show }`, nothing else. `lampsOf(state): LampState` is a pure projection computed every step; `sim/loop` emits the diff. `role ∈ { off, lit, hurryup, quickmb, joust, dragon, special }`, `step ∈ {0,1,2,3}`. `GiCommand.level` also drives `gi_backbox`, `gi_cabinet`, `gi_arch`. Every semantic event is payload-complete (`ball_ended { player, bonusByCategory, multiplier, total, tilted }`, `war_strike { remaining, jackpot }`, `match_drawn { number, winners[] }`, `highscore_entered { player, initials, score, rank, grandChampion }`, …); rules never format text.
- AR-23 (AD-6, machine-behaviour): Ball search is a rules protocol of tick-timed pulses in `TABLE.ballDevices[*].ballSearchOrder` ending in `RecoverCommand`; the ball controller emits `ball_missing { count }`. Device failure events (`eject_failed`, `ball_missing`, `broken`, `device_overflow`) exist in the vocabulary and rules tolerate them.

**Assets and the export pipeline**

- AR-24 (AD-11): `assets/src/dragonwar.blend` is the sole owner of every position, mesh and switch zone. `tools/export.py` runs every export with `export_yup` and `export_extras`, validates node names (`^[a-z][a-z0-9_]*$`, unique across glbs, one material each) and every `lightgroup`, `surface`, `phys_material` against a JSON dump of `TABLE`, and writes `public/assets/dragonwar.glb` (presentation) and `public/assets/dragonwar.collision.json` (`col_`/`sw_`/device nodes, mm, table frame) for `sim/physics/loader`; `sim/` never parses glb. Both loaders fail fast on a missing node or unknown property.
- AR-25 (AD-11): Node prefixes — `col_` collision scaffolding (invisible, reduces to the ported primitive set, carries `surface` and `phys_material`), `sw_` switch zones (swept-segment tests), `vis_` visuals, `l_` inserts (lens and cup), mechanisms named as their device. Exactly two top-level nodes, `playfield_root` and `cabinet_root`, plus `pivot_pitch`. Playfield collision is one compound body; walls and floor have real thickness; static meshes carry `TEXCOORD_1` and a `lightgroup`; single LOD. **Epic 1 ships a placeholder `.blend` of primitives that already follows every prefix — the pipeline, not the art, is the deliverable.**
- AR-26 (Conventions): `assets/src/` holds editable sources (Blender, `.wav` masters); `public/assets/` holds exported glb, collision json, textures, `.mp3`; every third-party or generated asset is in `ATTRIBUTIONS.md` first.

**Presentation drivers**

- AR-27 (AD-12): Four lighting channels behind one `LampDriver`; Babylon clustered forward lighting on WebGL2 is the dynamic path (live-light budget 20 per frame on the floor); runtime composite `base + Σ groupᵢ × tintᵢ × levelᵢ`, inserts baked white and tinted by role; early phases drive inserts as emissive material plus dynamic lights behind the same driver, the per-group additive bake replaces them later without touching rules, `TABLE` or mesh names. The engine is chosen once at boot via `EngineFactory.CreateAsync`; `?renderer=webgl2` and a Settings toggle force WebGL2; no feature may require WebGPU.
- AR-28 (AD-9, AD-12): `presentation/lighting/grammar.ts` is the one `(role, step)` → RGB, intensity and cadence table, blinking timed by presentation; the flasher driver enforces duty-cycle limits on `FlasherCommand.ms`.
- AR-29 (AD-13): Every sound is a named show in `TABLE.shows`; `AudioAssetProvider` resolves a show name to a synth function or a sample URL and is the only place that knows which; mechanical sounds fire from `ContactEvent`, cues from `ShowCommand` only; ball roll is one continuous voice per `ballId` driven per frame from snapshot speed, surface and position; Web Audio graph (AudioWorklet) in presentation, unlocked by the press-to-begin gesture; masters `.wav`, shipped `.mp3`.
- AR-30 (AD-9, Structural Seed): The Backglass is a DMD renderer in `presentation/backglass` consuming the snapshot plus payload-complete events; the Dragon rig in `presentation/mechanisms` animates from `show_dragon_mouth_open` and hit-reaction shows only (one truth); `presentation/camera` owns the walk-up and the fixed view; rendering technique is presentation-internal.

**Host, persistence, boot and CI**

- AR-31 (AD-14): One `localStorage` key `dragonwar.save` holds `{ v, settings, keybindings, highscores }` with a forward-migration function per version bump; `sim/` never touches storage; `GameStart { seed, tuning, adjustments, highscores }` is the one bundle the host hands `sim/loop`; the host persists on `highscore_entered` and nothing else. Settings split by owner: sim adjustments (Pitch, Tilt warnings, balls per game, Match %) layer table defaults → preset (deferred) → player overrides, applied next game; host settings (volume, key bindings) apply immediately and reach presentation as `ViewConfig { bindings }`.
- AR-32 (AD-4, AD-5): The key→action map lives only in `host/input`; key codes never enter `sim/`; button edges surface to rules as cabinet switches for lane change, mode selection and initials.
- AR-33 (AD-17): Boot renders a press-to-begin panel, checks WebGL2 before any asset loads and shows the unsupported-browser message naming Chrome, Edge and Safari; any later boot failure (asset 404, glb parse, engine creation) renders the same host error panel; WebGL context loss uses Babylon's restore path while the sim keeps stepping. `index.html` carries the CSP meta tag; the build is a static `dist/` with relative paths and no service worker; the commit SHA is stamped into the build and shown in Settings.
- AR-34 (AD-16, AD-17, Structural Seed): CI (`.github/workflows/ci.yml`) runs typecheck, dependency-cruiser, Vitest (including replay goldens recorded in Node), build, CSP grep, the 20 MB compressed-payload budget, per-file licence-header check, SHA stamp, and deploys `dist/` to GitHub Pages on `main`; pull requests run the checks only; `v1.0.0` is tagged at release.
- AR-35 (AD-15): Rules are tested headless in Vitest via a switch-script DSL typed by `SwitchName`; physics is tested by replaying `test/replays/*.replay.json` (schema in `sim/contracts/replay.ts`) and asserting the state hash; browser parity is asserted on `GameState` only; the only presentation test is a `NullEngine` load smoke. The dev tuning panel (`host/dev`) hot-applies table tunables to the running sim and exports to `tuning.ts`; a hot-apply during a recording invalidates it; replay record/play lives beside it.

**Conventions carried into every story**

- AR-36 (Conventions): Events are `snake_case` MPF vocabulary with the four-phase lifecycle; files `kebab-case.ts`, types `PascalCase`, commands and events discriminated on `type`; `tick` on every event and command; tunables `…Ms` authored and `…Ticks` after load; entities identified by `TABLE` name and balls by `ballId`; load-time paths throw and boot reports them, step paths never throw (dev-mode assertions), device failure is an event; only `host/` logs, no telemetry; nothing reads env at runtime; new files carry the GPL-3.0 header.

**Open questions and deferrals that shape stories**

- AR-37 (SPEC OQ-5, OQ-6): Epic 2's first design problem is the playfield geometry drawn from the reference dimensions alone (no Bally template): flipper tip gap, outlane widths and post positions first, then Loop entries/exits, Ramp height and return side, the Dragon's position and the Lock lane beneath it, pops, slings, the DRAGON bank and Top lanes. Whether the Lock lane carries both lock and mode start is confirmed against that geometry; the fallback is a separate scoop (a `TABLE` and geometry change only).
- AR-38 (Deferred, SPEC Non-goals): Not built in v1: a Web Worker for the sim, the per-group bake pipeline beyond spike 2's measurement, WebGPU-only quality, Tauri packaging, operator presets/Competition mode, credits and free-play accounting, gamepad, music and speech, wizard mode and the 4-ball finale, a table-authoring path. Nothing in the spine blocks them; stories must not pre-build them.
- AR-39 (Stack, SPEC Process): Decision freshness: renderer, WebGPU support and Node line re-checked by 2026-09-26 (a dated task, not a story dependency); ecosystem health by 2027-02-26.

### UX Design Requirements

No UX design contract exists for DragonWar (no `ux-designs/ux-*/DESIGN.md` + `EXPERIENCE.md` pair and no legacy `*ux*.md`). The player-facing presentation is fully specified by the PRD (FR-1..FR-4 walk-up and Backglass, FR-42..FR-45 lighting and colour grammar, FR-46..FR-48 audio, FR-49..FR-50 input and settings) and the architecture (AR-27..AR-30, AR-31..AR-33), and the visual direction by `design-principles.md` (stylized at real dimensions, DMD-look Backglass, rustic art under saturated functional inserts). No separate UX-DR list is generated.

### FR Coverage Map

| FR | Epic | Primary story (contributing) | Brief |
| --- | --- | --- | --- |
| FR-1 | Epic 4 | 4.6 | Walk-up sequence on load and return to Attract |
| FR-2 | Epic 2 | 2.1 (1.4) | Fixed authored view with the full shot map legible |
| FR-3 | Epic 2 | 2.6 (2.13, 3.x ModeViews) | DMD Backglass carrying every actionable rules state |
| FR-4 | Epic 1 | 1.4 (1.3) | Real dimensions asserted at load |
| FR-5 | Epic 1 | 1.6 (1.9) | Flipper technique — the feel test's first two items |
| FR-6 | Epic 1 | 1.9 (1.6) | Velocity-dependent rebound — the feel test's third item |
| FR-7 | Epic 1 | 1.5 (1.1, 1.8) | No tunnelling, no stalls, rate-independent |
| FR-8 | Epic 1 | 1.8 (1.3) | Determinism and replays |
| FR-9 | Epic 1 | 1.9 | Deliberate hops from one control |
| FR-10 | Epic 6 | 6.3 (1.9) | Pitch as a player-facing Setting (a dev-panel tunable from Epic 1) |
| FR-11 | Epic 2 | 2.1 (2.3) | Reliable switches on every device of the full shot map |
| FR-12 | Epic 1 | 1.8 (1.1) | Ball-to-ball collisions (ported; verified with two balls in a replay) |
| FR-13 | Epic 1 | 1.7 | Nudge as table-frame motion; bob and slam sensor in physics |
| FR-14 | Epic 2 | 2.11 | Per-player Tilt warnings |
| FR-15 | Epic 2 | 2.11 (2.10) | Tilt consequences |
| FR-16 | Epic 2 | 2.11 (1.7) | Slam tilt ends all games |
| FR-17 | Epic 2 | 2.5 | Start and Hot seat, per-player state |
| FR-18 | Epic 2 | 2.7 (1.6) | Manual plunge and Skill shot |
| FR-19 | Epic 2 | 2.9 | Ball save with grace and hurry-up state |
| FR-20 | Epic 2 | 2.10 | End-of-ball bonus and multiplier |
| FR-21 | Epic 3 | 3.10 (3.6, 3.9) | Extra-ball achievement menu (achievements are mode outcomes) |
| FR-22 | Epic 2 | 2.13 | Match |
| FR-23 | Epic 2 | 2.12 | Ball search |
| FR-24 | Epic 2 | 2.13 (4.6, 6.5) | Game over and return to Attract |
| FR-25 | Epic 2 | 2.7 | Lane change |
| FR-26 | Epic 2 | 2.4 (2.1, 2.3) | Loops and the Spinner |
| FR-27 | Epic 2 | 2.4 (2.1) | Ramp |
| FR-28 | Epic 2 | 2.4 (2.3, 3.9) | DRAGON bank as a device (War semantics in Epic 3) |
| FR-29 | Epic 2 | 2.1 (2.3) | Dragon, Lock lane, Mouth geometry and devices (lock rules in Epic 3) |
| FR-30 | Epic 3 | 3.3 (3.2, 5.1) | Dragon mouth-open and hit-reaction shows |
| FR-31 | Epic 2 | 2.2 (2.1) | Standard devices |
| FR-32 | Epic 2 | 2.1 | Lawlor's test per shot |
| FR-33 | Epic 3 | 3.4 | Mode lighting and start at the Lock lane |
| FR-34 | Epic 3 | 3.5 | Hurry-up |
| FR-35 | Epic 3 | 3.7 | Quick multiball |
| FR-36 | Epic 3 | 3.6 | Joust |
| FR-37 | Epic 3 | 3.2 | Locking balls, per-player credits |
| FR-38 | Epic 3 | 3.8 | The War |
| FR-39 | Epic 3 | 3.9 | Strikes and the Jackpot |
| FR-40 | Epic 3 | 3.9 | War end and re-qualification |
| FR-41 | Epic 3 | 3.1 | Mode stacking priority |
| FR-42 | Epic 4 | 4.1 | Four lighting channels |
| FR-43 | Epic 4 | 4.2 (5.2) | Inserts as lights through cups |
| FR-44 | Epic 2 | 2.8 | Held colour grammar from the first insert (`grammar.ts`) |
| FR-45 | Epic 4 | 4.3 | Flashers on events |
| FR-46 | Epic 4 | 4.4 | Mechanical sounds from contacts |
| FR-47 | Epic 4 | 4.4 (4.5) | Swappable audio assets |
| FR-48 | Epic 4 | 4.5 | Mode and Backglass cues |
| FR-49 | Epic 6 | 6.4 (1.6) | Rebindable keyboard (default map is an Epic 1 enabler) |
| FR-50 | Epic 6 | 6.3 | Settings panel |
| FR-51 | Epic 6 | 6.5 | High-score table and initials entry |
| FR-52 | Epic 6 | 6.2 | Local-only persistence |
| FR-53 | Epic 6 | 6.1 (1.2) | Link-playable (a dev deploy exists from Epic 1's spike 3) |
| FR-54 | Epic 6 | 6.1 (6.6) | Browser support, boot gate, WebGL2 floor |
| FR-55 | Epic 6 | 6.7 (1.1, 1.2) | GPL-3.0 release with a clean ledger, `v1.0.0` |

Epic 5 (art passes) carries no primary FR: it delivers the PRD §6.1 scope item "stylized art at real dimensions" and deepens FR-2, FR-4, FR-29, FR-30 and FR-43 without changing their acceptance.

## Epic List

### Epic 1: First Flip — a ball and two flippers that feel right

The author opens a dev build in a browser and plays a bare playfield at real dimensions: plunge, flip, cradle, tap, nudge, drain. Spikes 1 and 3 are the first two stories and gate everything else; the feel ritual (UJ-4) starts here and never stops. The whole vertical slice exists — contracts, `TABLE`, the vpx-js port, the fixed-step loop, placeholder `.blend` through `export.py`, a Babylon scene at the fixed view, keyboard input, dev tuning panel, replay goldens, CI with boundary lint — with the pipeline, not the art, as the deliverable.
**FRs covered:** FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-12, FR-13
**Also delivers:** AR-1, AR-2, AR-5..AR-13, AR-16, AR-17, AR-24, AR-25, AR-34 (minimum CI), AR-35

### Epic 2: A Complete Game on the Real Shot Map

A stranger can play a full 1–4 player game with no instructions: the real geometry (OQ-6 answered, OQ-5 confirmed or a scoop added), every device and shot, reliable switches, Lawlor's test per shot, start and Hot seat, plunge and Skill shot, ball save, bonus, lane change, tilt warnings, Tilt and Slam tilt, ball search, Match, game over back to a minimal Attract — all read from a DMD Backglass and inserts lit in the held colour grammar. Geometry is the first story and iterates with the rules.
**FRs covered:** FR-2, FR-3, FR-11, FR-14, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-22, FR-23, FR-24, FR-25, FR-26, FR-27, FR-28, FR-29, FR-31, FR-32, FR-44
**Also delivers:** AR-14, AR-15, AR-18, AR-19, AR-22, AR-23, AR-28 (grammar table), AR-37

### Epic 3: The Campaign and the War

The five modes and the moment: lock two balls under the Dragon, spell DRAGON in either order, the Mouth opens and fires them back as fire, ten Strikes win the Jackpot. Hurry-up, Quick multiball, Joust, the Lock arbiter, the War, Strikes and the progressive Jackpot, re-qualification, stacking by priority, the extra-ball achievement menu, and the Dragon's mouth and hit-reaction shows. Scoring values freeze after this epic's first full playtest.
**FRs covered:** FR-21, FR-30, FR-33, FR-34, FR-35, FR-36, FR-37, FR-38, FR-39, FR-40, FR-41
**Also delivers:** AR-20, AR-21 (SM-2 is judged here)

### Epic 4: Lights, Sound and the Walk-up

The table looks and sounds like a real machine: the Walk-up and Attract show, four independent lighting channels behind one driver, inserts as lights through cups spilling onto the art, flashers on events with duty-cycle limits, mechanical audio from contacts, cues from shows, ball roll per ball, and the swappable asset provider that the author's recordings will drop into later. Spike 2 runs before the light-group partition freezes; the bake is a later swap behind the same driver.
**FRs covered:** FR-1, FR-42, FR-43, FR-45, FR-46, FR-47, FR-48
**Also delivers:** AR-3, AR-27, AR-29, AR-30

### Epic 5: Art Passes — the Dragon and the Table

Phased, allowed to trail, never blocking epics 1–4: the Dragon model and rig, playfield art and materials in the rustic register, cabinet and backbox at real scale for the Walk-up silhouette, insert lenses and the translucency mask, the DMD Backglass art. Each pass replaces placeholder primitives behind the fixed node contract and lands with its `ATTRIBUTIONS.md` entries.
**FRs covered:** none primary — delivers PRD §6.1 "stylized art at real dimensions"; deepens FR-2, FR-4, FR-29, FR-30, FR-43
**Also delivers:** AR-26

### Epic 6: Ship It — your machine, from a link

Anyone on Windows or macOS plays from a link: press-to-begin, WebGL2 gate and error panel, `?renderer=webgl2`, rebindable keys shown once in Attract, the Settings panel (Pitch, Tilt warnings, balls per game, Match %, volume, reset, SHA), the high-score table with initials entry, one versioned local save, the CSP and size budget enforced, the attribution ledger audited, and `v1.0.0` tagged.
**FRs covered:** FR-10, FR-49, FR-50, FR-51, FR-52, FR-53, FR-54, FR-55
**Also delivers:** AR-31, AR-32, AR-33, AR-34 (full), AR-38, AR-39

## Epic 1: First Flip — a ball and two flippers that feel right

The author opens a dev build in a browser and plays a bare playfield at real dimensions: plunge, flip, cradle, tap, nudge, drain. Spikes 1 and 3 are the first two stories and gate everything else; the feel ritual (UJ-4) starts here and never stops. The whole vertical slice exists — contracts, `TABLE`, the vpx-js port, the fixed-step loop, placeholder `.blend` through `export.py`, a Babylon scene at the fixed view, keyboard input, dev tuning panel, replay goldens, CI with boundary lint — with the pipeline, not the art, as the deliverable.

**FRs covered:** FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-12, FR-13 · **NFRs:** NFR-2, NFR-3, NFR-4, NFR-5, NFR-9 · **ARs:** AR-1, AR-2, AR-5..AR-13, AR-16, AR-17, AR-24, AR-25, AR-34 (minimum CI), AR-35

### Story 1.1: Spike 1 — the ported physics loop at 1 kHz over six bodies

As the author,
I want the vpx-js time-of-impact core ported far enough to step six balls at 1000 Hz and measured against the frame budget in Node, Chrome and Safari,
So that the browser-first premise is proven — or the 480 Hz fallback is taken — before anything else is built on it.

**Acceptance Criteria:**

**Given** `ATTRIBUTIONS.md` has no entry for `vpdb/vpx-js`
**When** the port begins
**Then** `ATTRIBUTIONS.md` records `vpdb/vpx-js` at commit `e8a6d6f`, its authors, `GPL-2.0-or-later` as verified in the source file headers (not `package.json`), and the verification date, before any ported file is committed
**And** every ported file keeps its original copyright header followed by `// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0`

**Given** a fresh single-package repository on Node 24 LTS, pnpm 11, Vite 8, TypeScript 7.0 (`tsc --noEmit`, explicit `types`, no `baseUrl`) and Vitest 4
**When** `lib/physics/` (constants, math, collision primitives, ball hit and kinematics, quadtree/k-d broadphase), `lib/vpt/ball/` and `lib/game/player-physics.ts` are ported under `src/sim/physics/`
**Then** `tsc --noEmit` passes, the solver constants (`PHYS_SKIN 25.0`, `PHYS_TOUCH 0.05`, `C_DISP_GAIN 0.9875`, `STATICTIME 0.005`, ball–ball restitution) live verbatim in `src/sim/physics/constants.ts`
**And** no file under `src/sim/` references `window`, `document`, `performance`, `Math.random`, `Date`, timers or `@babylonjs/*`

**Given** a harness of a 514.4 × 1066.8 mm playfield plane with thick walls, gravity for a 6.5° pitch, and six 26.99 mm balls
**When** 10,000 ticks are stepped in Node
**Then** no ball leaves the bounds or overlaps another, every step terminates (forced advance by `STATICTIME`), and the mean and p95 cost per tick are reported

**Given** the same harness served from a **production build** (`vite build` + `vite preview`), not the Vite dev page `[AMENDED 2026-08-27 — see the story change log below]`
**When** 17 steps (one 60 Hz frame of simulated time) are measured per frame over 600 frames in Chrome and Safari on the author's macOS machine and Chrome and Edge on the Windows machine
**Then** the p95 sim cost per frame is recorded per browser and machine
**And** the spike passes if p95 ≤ 4 ms on every **gating** path — Chrome/Windows, Chrome/macOS and Safari/macOS — `[ASSUMPTION: leaves ≥ 12 ms of a 16.67 ms frame for rendering]`, fails otherwise
**And** Edge/Windows is measured and recorded but is **best-effort for this gate**: its number never decides the verdict. Edge remains a fully supported browser (FR-54, NFR-6 unchanged) — this is a frame-budget carve-out, not a support-tier demotion

**Given** the measured result
**When** the spike closes
**Then** `TICK_HZ` in `src/sim/contracts/time.ts` is set to 1000 on pass or 480 on fail, the numbers, machines, browsers and date are recorded in `docs/spikes/spike-1.md`
**And** on fail the solver re-tune is logged there as the next piece of work before Story 1.3

**Change log**

- **2026-08-27 — measurement surface amended from the Vite dev page to a production build.**
  The amendment stands: a frame-budget number that gates anything should come from the artifact
  that ships, and Story 1.2's size and load-time numbers must come from the real production
  artifact for the same reason.
  **Its original justification has since been retracted.** The amendment was made on a 0.4 ms
  dev-vs-production delta (Edge/Windows 4.1 ms median on the dev page against 3.70 ms on a
  production build) measured in two different sessions. A later same-session A/B — dev and
  production measured alternately on identical code — found **no measurable difference** (both
  1.8 ms). That delta was session noise. Keep the rule as standing practice; do not cite the
  0.4 ms figure as evidence for it. See `docs/spikes/spike-1.md`, "Post-fix re-measurement and a
  variance investigation", and the ledger entry on this host's ~1.9x session variance.
- **2026-08-27 — Edge/Windows carved out to best-effort for this gate.** Author decision after
  the spike escalation: Chrome is the primary target, so Chrome/Windows, Chrome/macOS and
  Safari/macOS gate `TICK_HZ` while Edge is measured and recorded only. **Safari was NOT
  demoted** — it runs JavaScriptCore rather than V8, is still unmeasured, and is the real
  remaining performance risk. Edge's functional support is untouched: it keeps its place in
  Story 6.1's boot message and Story 6.6's release matrix, and FR-54, NFR-6, `prd.md` and
  `SPEC.md` are unchanged.
- Outcome: `TICK_HZ = 1000`, provisional pending the author's two macOS legs.

### Story 1.2: Spike 3 — build size and load time measured from a link

As the author,
I want a static Vite build carrying the Babylon engine and a placeholder glb deployed to GitHub Pages and measured for compressed payload and time-to-first-render on a throttled connection,
So that the load NFR is a measured number and the CI size budget is set before the table grows.

**Acceptance Criteria:**

**Given** `ATTRIBUTIONS.md` has no entries for `@babylonjs/core` and `@babylonjs/loaders`
**When** they are added at 9.22.2
**Then** each is recorded with Apache-2.0 verified at the package's LICENSE in the source repository, with the date, before `pnpm add`

**Given** `index.html` carries `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' blob:; img-src 'self' blob:">` and a press-to-begin panel
**When** `vite build` runs
**Then** `dist/` contains only relative asset paths, no service worker, and a CI step greps the CSP tag and fails if it is absent

**Given** the engine is created once via `EngineFactory.CreateAsync` with `useRightHandedSystem = true` after the press-to-begin gesture
**When** a placeholder `dragonwar.glb` (a playfield-sized box) loads
**Then** a frame renders on WebGL2, and on a WebGPU-capable Chrome the WebGPU engine is chosen where it can initialise under the pinned CSP - its transpiler served from our own origin, never a CDN - falling back silently to WebGL2 otherwise; `?renderer=webgl2` forces WebGL2 in every case, and no feature may require WebGPU (AR-27)

**Given** a GitHub Actions workflow on `main`
**When** a commit is pushed
**Then** the workflow builds and deploys `dist/` to GitHub Pages, and the Pages URL renders the placeholder in Chrome (Windows) and Safari (macOS)

**Given** Chrome DevTools throttled to 50 Mbps with cache disabled
**When** the Pages URL is loaded cold in Chrome on Windows and in Safari on macOS
**Then** the compressed transfer size and the time from navigation to first rendered frame are recorded in `docs/spikes/spike-3.md` alongside the 10 s / 20 MB targets
**And** the CI size budget is set to the measured baseline plus authored headroom (re-setting the 20 MB assumption), and whether one glb or a split is used is recorded as a decision

**Given** the size budget is set
**When** a build's compressed `dist/` exceeds it
**Then** CI fails with the measured and budgeted sizes in the message

**Given** the deploy workflow is temporarily triggered on `DW-1-epic1` and `workflow_dispatch` so this spike can measure a live deployment before Epic 1 merges
**When** the spike's measurements are recorded
**Then** the epic-branch trigger is removed and the workflow is narrowed back to `main` plus `workflow_dispatch` before Epic 1's merge gate, restoring AD-17 / AR-34's `main`-only shipping rule
**And** `docs/spikes/spike-3.md` records that the measured artifact was built from an unmerged branch and is provisional until it reruns from `main`

### Story 1.3: Seam contracts, the TABLE registry and boundary lint

As the author,
I want the closed seam types, the `TABLE` registry with the real reference dimensions, the tunables file with provenance, and dependency-cruiser enforcing the layer graph in CI,
So that every later story builds on the spine's contracts and a boundary violation fails the build instead of eroding one import at a time.

**Acceptance Criteria:**

**Given** the spine's structural seed
**When** the repository is laid out
**Then** `src/sim/{contracts,table,physics,rules,loop}`, `src/presentation/{scene,mechanisms,lighting,backglass,audio,camera}`, `src/host/{input,persistence,settings,dev}` plus `host/boot.ts` and `host/loop.ts`, `assets/src/`, `public/assets/`, `test/replays/`, `tools/` and `.github/workflows/` exist
**And** every new source file carries the GPL-3.0 header

**Given** `src/sim/contracts/`
**When** it is written
**Then** it exports `InputAction`, `InputFrame`, `InputTransition`, `SwitchEvent`, `ContactSurface`, `ContactEvent`, `CoilCommand`, `RecoverCommand`, `LampCommand`, `GiCommand`, `FlasherCommand`, `ShowCommand`, `SemanticEvent`, `Snapshot`, `ModeView`, `FrameOutput`, `GameStart` and `ReplayHeader` with exactly the fields the spine's Seam Contracts table names, discriminated on `type`, each event and command carrying `tick`
**And** the contracts are generic over the name unions and import nothing from `sim/table`

**Given** `src/sim/table/dragonwar.ts`
**When** it exports `TABLE as const`
**Then** it contains `reference = { playfieldMm: { w: 514.4, h: 1066.8 }, ballMm: 26.99, pitchDeg: 6.5, flipperBatIn: 3.125 }`, the switches this epic needs (`s_start`, `s_flipper_l`, `s_flipper_r`, `s_plunger`, `s_shooter_lane`, `s_trough_1..4`, `s_tilt_bob`, `s_slam_tilt`) each with a `settleTicks` class, the coils (`c_flipper_l`, `c_flipper_r`, `c_trough_eject`, `c_autolaunch`), and the ball devices `bd_trough` (capacity 4, slots in fill order, `c_trough_eject`, `ballSearchOrder`) and `bd_shooter` (non-parking, entry `s_shooter_lane`)
**And** `src/sim/table/names.ts` derives `SwitchName`, `CoilName`, `LampName`, `GiChannel`, `FlasherName`, `ShowName` and `ShotName` from `typeof TABLE`

**Given** `src/sim/table/tuning.ts`
**When** a tunable is declared
**Then** it carries a unit-suffixed name (`…Ms`, `…Deg`), a value, a `source` and a `confidence`, the research's do-not-invent figures are marked `unverified`
**And** a single load-time conversion turns every `…Ms` into `…Ticks` using `TICK_HZ`, and a CI check fails on any other literal millisecond or `TICK_HZ` arithmetic inside `src/sim/`

**Given** a dependency-cruiser configuration
**When** CI runs it
**Then** the build fails if `src/sim/**` imports `presentation/**`, `host/**` or `@babylonjs/*` or references `window`, `document`, `performance`, `Math.random`, `Date`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `localStorage`, `navigator` or `globalThis`; if `presentation/**` imports anything from `sim/` other than `sim/contracts` and `sim/table`; if `host/**` imports `sim/physics` or `sim/rules`; if `@babylonjs/havok` is imported anywhere; or if a device-name string literal (`s_`, `c_`, `l_`, `f_`, `gi_`, `bd_`, `shot_`, `show_` prefix) appears outside `src/sim/table/dragonwar.ts` and `test/**`

**Given** the CI workflow from Story 1.2
**When** it is extended
**Then** it runs typecheck, dependency-cruiser, Vitest, build, the CSP grep and the size budget on every push and pull request, and deploys only from `main`

### Story 1.4: A placeholder table at real dimensions through the export pipeline

As the author,
I want a placeholder `.blend` of primitives that follows every node prefix, exported by `tools/export.py` into `dragonwar.glb` and `dragonwar.collision.json` and loaded by both loaders with the reference dimensions asserted,
So that the asset contract is proven before any art exists and a wrong-size table is a load failure, not a feel problem discovered months later.

**Acceptance Criteria:**

**Given** `assets/src/dragonwar.blend` authored unpitched in Blender 5.2 with `playfield_root`, `cabinet_root` and `pivot_pitch` as the only top-level nodes
**When** it contains `col_playfield` (514.4 × 1066.8 mm with real thickness), thick `col_wall_*`, `col_flipper_l` and `col_flipper_r` at the reference pivot geometry with 3.125 in bats, a plunger lane, `sw_shooter_lane`, `sw_trough_1..4`, a drain, `bd_trough` and `bd_shooter` nodes with authored eject poses, one `vis_` placeholder mesh, one `l_` insert with lens and cup geometry, a playfield material with a translucency mask, `TEXCOORD_1` on every static mesh and a `lightgroup` custom property on each
**Then** the file is recorded in `ATTRIBUTIONS.md` as author-made with the date

**Given** `tools/export.py` run headless in Blender
**When** it exports with `export_yup` and `export_extras` on
**Then** it validates every node name against `^[a-z][a-z0-9_]*$`, uniqueness and one-material-per-mesh, validates every `lightgroup`, `surface` and `phys_material` property against a JSON dump of `TABLE`, writes `public/assets/dragonwar.glb` and `public/assets/dragonwar.collision.json` (`col_`/`sw_`/device nodes in mm, table frame)
**And** on any violation it exits non-zero naming the offending node and property

**Given** `src/sim/table/frames.ts`
**When** it is written
**Then** it exports exactly `glbToTable()`, `toPhysics()` and `toScene()`, a unit test round-trips a point through glb → table → scene and table → physics → table, and no other file converts units or axes

**Given** `dragonwar.collision.json`
**When** `src/sim/physics/loader` loads it
**Then** it asserts `col_playfield` bounds and both flipper node lengths against `TABLE.reference` within tolerance and throws a descriptive error on mismatch, builds one compound collision body from the ported primitive set, registers each `sw_` zone against its `TABLE` switch
**And** a test loads a deliberately mis-sized collision file and asserts the throw

**Given** `dragonwar.glb`
**When** `src/presentation/scene` loads it
**Then** it fails fast on a missing named node, applies the effective pitch as a rotation of `playfield_root` about `pivot_pitch` only, keeps `cabinet_root` level, and renders from the fixed authored camera
**And** a `NullEngine` load smoke test in Vitest passes

### Story 1.5: A ball rolls, drains and is served on the fixed-step loop

As the author,
I want a ball served onto the placeholder table, rolling under pitch gravity, rendered at the fixed view and draining into the trough, on a fixed-step loop that is independent of display rate,
So that the first vertical slice — host to loop to physics to rules to scene — is real and every later feature lands on it.

**Acceptance Criteria:**

**Given** `src/sim/loop` exposes `advance(elapsedMs, transitions: InputTransition[])`
**When** a frame owes `elapsed × TICK_HZ` steps
**Then** the fractional remainder is carried to the next frame, owed time beyond 200 ms is discarded and `sim_time_discarded { ms }` is the first event of that frame, physics consumes the frame in force at each tick and the commands from the previous tick, a minimal `rules.step(state, switchEvents, tick)` runs after every physics step
**And** `FrameOutput` carries the latest snapshot and every event and command of all N steps in tick order, with empty arrays and an unchanged snapshot when N = 0

**Given** `src/host/loop.ts` drives `advance` from `requestAnimationFrame`
**When** the scene applies a `FrameOutput`
**Then** the ball is rendered at `toScene(pos)` from the latest snapshot without interpolation, and the effective pitch from the snapshot drives `playfield_root`

**Given** boot completes
**When** the machine is inspected
**Then** four balls are parked in `bd_trough` (all four slot switches closed) and boot asserts the count, and `machine.ballsInPlay` is 0

**Given** a dev action issues `pulse c_trough_eject` followed by `pulse c_autolaunch`
**When** physics processes them
**Then** a ball spawns from the highest filled trough slot at the authored eject pose into the shooter lane, `s_shooter_lane` closes, the ball rests simulated on the plunger tip, and the autolaunch sends it onto the playfield so `s_shooter_lane` opens and the devices layer emits `ball_launched`
**And** `machine.ballsInPlay` becomes 1 on `ball_launched`

**Given** the ball rolls down the placeholder playfield into the drain
**When** it enters `bd_trough`
**Then** physics parks it in the lowest empty slot, that slot switch closes as one edge, the ball leaves the snapshot, and the ball controller derives the device count from closed slot switches and decrements `ballsInPlay`

**Given** a scripted 5 s input sequence
**When** it is driven through `advance` with elapsed patterns for 30, 60 and 120 Hz frame cadences and with one 2 s gap
**Then** the final state hashes are identical across cadences and the gap produces exactly one `sim_time_discarded` event

### Story 1.6: Flippers and the manual plunger as hardware rules

As a player,
I want two flippers and a hold-to-charge plunger driven by the keyboard, with the flipper as vpx-js's `FlipperMover` so holding, tapping and cradling behave like a real coil,
So that I can play the ball rather than watch it.

**Acceptance Criteria:**

**Given** `src/host/input` maps the default keys (left/right Shift, Enter, 1) to `InputAction`s
**When** a key transitions
**Then** an `InputTransition { tick, frame }` is stamped from the DOM event's `timeStamp` against the accumulator origin and handed to the next `advance`
**And** no key code appears anywhere under `src/sim/`

**Given** `s_flipper_l` closes at tick *t* in the `InputFrame`
**When** physics steps tick *t*
**Then** `c_flipper_l` energises inside the same physics step as a hardware rule with no rules round trip, and a test asserts the flipper angle changes on tick *t*
**And** `sim/loop` also emits `s_flipper_l`, `s_flipper_r`, `s_start` and `s_plunger` as `SwitchEvent` edges from `InputFrame` transitions

**Given** the ported `FlipperMover` (strength, ramp-up, end-of-stroke torque and angle, return strength, inertia ⅓·m·r²)
**When** its parameters are exposed
**Then** they live in `tuning.ts` with `source` and `confidence` (ramp-up 2.5, elasticity 0.88, elasticity falloff 0.15, friction 0.85), and MPF's pulse/hold figures appear only as a comment marked calibration reference

**Given** a ball resting on a raised flipper
**When** the flipper key is held for 5 s
**Then** the flipper reaches its end-of-stroke angle and holds it, unmoving and without oscillating at the stop, for the whole 5 s `[AMENDED 2026-08-29 — see the story change log below]`
**And** the ball is held on the bat — at rest, its position on the bat unchanged within tolerance — for at least the first 1 s of that hold, which is what this epic's placeholder geometry can support; the full multi-second cradle is **Story 2.1's** (ledger `DW-72`), once the playfield carries the inlane guides and posts that form the pocket a real cradle needs
**And** when the key is tapped for 30 ms, the flipper rises partially and returns

**Given** `CoilCommand { coil: 'c_flipper_l', action: 'disable' }` has been issued
**When** the flipper key is pressed
**Then** the flipper does not move; **and** after `enable` it does

**Given** `s_plunger` is held for N ticks and released
**When** physics applies `plungerSpeedByHoldMs`
**Then** the ball leaves the shooter lane at the mapped speed, `s_shooter_lane` opens once and `ball_launched` fires once
**And** a full-strength plunge replay shows the ball reaching the top of the placeholder playfield without rebounding back into the lane

**Change log**

- **2026-08-29 — the 5 s cradle claim split: the bat's half kept in full, the ball's half bounded
  to 1 s, and the real cradle moved to Story 2.1.**
  The original criterion asked that a ball resting on a raised flipper "stays cradled" for a 5 s
  hold. That is not satisfiable on this epic's placeholder table, and the reason is **geometry,
  not the flipper**. The committed collision document has twelve `col_*` nodes — the playfield,
  the glass, five outer walls, two lane walls, the lane deflector and the two bats — and
  **nothing beside either flipper**. A real cradle is a pocket formed by the raised bat together
  with the inlane guide or post next to it; with no such adjacent geometry the ball rolls along
  the bat under the 6.5° pitch and leaves it after roughly 1.2–1.9 simulated seconds.
  The ported `FlipperMover` / `FlipperHit` are **not** at fault, and were not altered to
  accommodate this: the bat is provably static while held, `FlipperHit.contact()` matches the
  pinned upstream `vpdb/vpx-js @ e8a6d6f` byte-for-byte, total mechanical energy is dissipated
  rather than injected, and a control ball that never touches a flipper runs away *faster* than
  the held-flipper ball — so the departure is not flipper-specific. Measurements are recorded in
  `_bmad-output/implementation-artifacts/probe-1-6-cradle-energy.txt`.
  What Story 1.6 owns — the coil as a hardware rule that reaches its stop and holds it under a
  sustained hold — is still asserted in full, and the bounded ball claim is tested with a
  discriminating negative rather than a window the ball would survive anyway. The part that needs
  geometry which does not exist yet is deferred to **Story 2.1**, tracked as ledger `DW-72`,
  where the original 5 s cradle is re-asserted against the real playfield.

### Story 1.7: Nudge, the tilt bob and the slam sensor

As a player,
I want to nudge the cabinet left, right and up and have the ball react as inertia against a moving table, with a real pendulum bob and a separate slam detector closing their switches inside physics,
So that nudging is a real technique with real danger from the first build, and both sensors are inside the replay.

**Acceptance Criteria:**

**Given** the ported damped-harmonic cabinet oscillator
**When** `nudge_l`, `nudge_r` or `nudge_up` has a rising edge in the `InputFrame`
**Then** an impulse is applied to the oscillator, and the ball's coupling is table-frame motion — the ball keeps its inertia while the cabinet moves under it — with no force applied to the ball

**Given** a ball cradled on a raised flipper
**When** the player nudges up
**Then** the ball leaves the flipper, verified by a golden replay

**Given** the tilt bob is a pendulum in physics
**When** its displacement crosses the closure threshold
**Then** `s_tilt_bob` closes as one edge and opens as one edge on the way back, the bob keeps swinging and decays physically, and no command resets it

**Given** `slamNudgesPerWindow` in `tuning.ts`
**When** that many nudge edges occur inside the tick window
**Then** `s_slam_tilt` closes, independently of the bob's threshold or state
**And** both switches appear in `TABLE.switches` with `settleTicks` 0 and their closures reproduce in a replay

**Given** the default keys Space and the arrow keys
**When** they are pressed
**Then** they map to the three nudge actions in `host/input` and nothing else

### Story 1.8: Replays, golden state hashes and CI parity

As the author,
I want every session recordable as `ReplayHeader + InputTransition[]` and replayable to a state hash, with goldens recorded in Node in CI and browser parity asserted on `GameState`,
So that determinism is enforced by tests, ball-to-ball behaviour is pinned, and every feel change is capturable.

**Acceptance Criteria:**

**Given** `src/sim/contracts/replay.ts`
**When** a replay is written
**Then** its header embeds the whole `GameStart`, `physicsSeed`, `tickHz`, `tableHash`, `assetHash` and `physicsVersion`, and its body is the ordered `InputTransition[]`

**Given** `GameState` and the ball set at any tick
**When** the state hash is computed
**Then** it is FNV-1a over canonical JSON of `GameState` plus ball positions quantised to 0.01 mm, and two runs from the same header and body produce the same hash

**Given** `src/host/dev` offers record and play
**When** a recording is in progress and a tunable is hot-applied
**Then** the recording is marked invalid and cannot be saved as a golden

**Given** `test/replays/`
**When** CI runs Vitest in Node
**Then** goldens for roll-and-drain, cradle-and-release, full plunge, nudge coupling, and a two-ball collision (momentum transferred, no overlap, no sticking) replay to their recorded hashes
**And** the two-ball golden also asserts the balls' separation never drops below one diameter

**Given** a browser test page or Vitest browser run
**When** each golden is replayed in Chrome and Safari
**Then** the `GameState` portion of the hash matches Node; the ball-position portion is asserted only in Node

**Given** physics materials
**When** any replay runs
**Then** `scatter` is 0 on every material and the physics PRNG is never drawn, asserted by a test

### Story 1.9: Dev tuning panel and the first feel ritual

As the author,
I want a dev panel that hot-applies table tunables to the running sim and exports them to `tuning.ts`, with the hop control and elasticity falloff wired,
So that I can play the Reference machine, play the build, and turn each named difference into a tuning change or a documented acceptance — starting now and never stopping.

**Acceptance Criteria:**

**Given** the dev panel in `src/host/dev`
**When** it opens
**Then** it lists every table tunable with its value, `source` and `confidence`, hot-applies a change to the running sim on edit, and exports the current set to `src/sim/table/tuning.ts` in the file's own format

**Given** the hop control tunable
**When** it is set to 0 and a stress replay of hard flipper hits runs
**Then** no ball leaves the playfield surface; **and** at the default value occasional hops occur on hard hits
**And** the implementation adds no randomness — `scatter` stays 0 and no PRNG is drawn in physics

**Given** elasticity falloff is exposed
**When** a replay drives rebounds at three impact speeds
**Then** the rebound-to-impact speed ratio decreases with speed, and the panel change is felt live

**Given** the pitch tunable
**When** it is set within 6.0–8.5°
**Then** the gravity vector and the `playfield_root` rotation both follow it on the next serve

**Given** `docs/feel-test.md`
**When** the first ritual is run against the Reference machine (Stern *Dungeons & Dragons*)
**Then** the document defines the three items (cradling, flipper snap, rejection/rebound), records the first dated entry per item as "no material difference", a tuning change, or an accepted difference, and links the golden replay that captures any change
**And** the ritual is run on both the WebGL2 (`?renderer=webgl2`) and default paths

## Epic 2: A Complete Game on the Real Shot Map

A stranger can play a full 1–4 player game with no instructions: the real geometry (OQ-6 answered, OQ-5 confirmed or a scoop added), every device and shot, reliable switches, Lawlor's test per shot, start and Hot seat, plunge and Skill shot, ball save, bonus, lane change, tilt warnings, Tilt and Slam tilt, ball search, Match, game over back to a minimal Attract — all read from a DMD Backglass and inserts lit in the held colour grammar. Geometry is the first story and iterates with the rules.

**FRs covered:** FR-2, FR-3, FR-11, FR-14, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-22, FR-23, FR-24, FR-25, FR-26, FR-27, FR-28, FR-29, FR-31, FR-32, FR-44 · **NFRs:** NFR-5, NFR-8 · **ARs:** AR-14, AR-15, AR-18, AR-19, AR-22, AR-23, AR-28, AR-37

### Story 2.1: The playfield geometry and the full switch set

As the author,
I want the whole shot map drawn in the Blender source from the reference dimensions — drain triangle first, then Loops, Ramp, Dragon and Lock lane, pops, slings, DRAGON bank and Top lanes — with every switch zone placed and every shot's miss checked,
So that the geometry the whole game balances around exists, OQ-5 and OQ-6 are answered, and every later rule lands on real shots.

**Acceptance Criteria:**

**Given** `assets/src/dragonwar.blend` from Story 1.4
**When** the drain triangle is drawn
**Then** the flipper tip gap, the two outlane widths, the inlane guides and every post position are authored as `col_` primitives with the tip gap recorded in `tuning.ts` as `unverified`, and guides end at `rubber_post` surfaces, never bare metal

**Given** the inlane guides and posts authored above, and the ported `FlipperMover` from Story 1.6 `[ADDED 2026-08-29 — see the story change log below]`
**When** a ball resting on a raised bat is held with the flipper key for a full 5 simulated seconds
**Then** the ball stays within the cradle pocket for the whole hold — at rest, its position on the bat unchanged within tolerance — and does not depart the bat
**And** this closes ledger `DW-72`: it is the half of Story 1.6's cradle criterion deferred to this story because Epic 1's placeholder table had no geometry beside either flipper to form a pocket (see Story 1.6's change log), so `test/flipper-collision.test.ts`'s 1 s ball bound is widened back to the full 5 s here

**Given** the drain triangle is placed
**When** the shot map is drawn
**Then** the Left Loop and Right Loop have entries and exits whose exit paths feed straight toward the flippers, one Ramp has an authored height and a decided return inlane (recorded as the OQ-5/FR-27 decision in `docs/decisions.md`), the Dragon body is off-centre with the Lock lane between its legs and a Mouth eject pose aimed at the flippers, the six-target DRAGON bank, three Top lanes, two slingshots, pop bumpers, two inlanes, two outlanes and the plunger lane all exist as `col_` and `sw_` nodes following the prefix contract

**Given** every device has a switch
**When** `TABLE.switches` is completed
**Then** it declares `s_loop_l_in/out`, `s_loop_r_in/out`, `s_spinner`, `s_ramp_enter/made`, `s_dragon_[d,r,a,g,o,n]`, `s_dragon_body`, `s_lock_lane`, `s_lock_1..3`, `s_top_1..3`, `s_inlane_l/r`, `s_outlane_l/r`, `s_sling_l/r`, `s_pop_*`, `s_drain` with the `settleTicks` class per device, plus `bd_lock` (capacity 3, `c_mouth`, `ballSearchOrder`) and the coils `c_sling_l/r`, `c_pop_*`, `c_dragon_bank_reset`, `c_mouth`
**And** `export.py` validates the `.blend` against the updated `TABLE` dump and both loaders load it

**Given** a replay of the fastest ball a full-strength plunge and flipper hit can produce
**When** it passes through each rollover, the bank, the Lock lane and the drain
**Then** every switch closes exactly once per pass because zone tests use the per-tick swept segment, and a test asserts no pass is missed at the maximum speed

**Given** the geometry loads
**When** the author runs the feel ritual on each shot from the fixed camera
**Then** `docs/feel-test.md` gains a per-shot Lawlor entry (Left Loop, Right Loop, Ramp, Dragon, Lock lane, bank, Top lanes) recording where the most common miss goes, none is a centre drain, and any shot that fails is re-drawn before the story closes
**And** the decision whether the Lock lane carries both lock and mode start (OQ-5) is recorded; if not, a separate `sw_scoop` and `bd_scoop` are added with the Mouth as eject only

**Given** the fixed camera from Story 1.4
**When** the full geometry is in view
**Then** both flippers, the Dragon, both Loops, the Ramp and the DRAGON bank are legible and the Backglass quad occupies a strip at the top of the view

**Change log**

- **2026-08-29 — cradle criterion added, as the receiving half of Story 1.6's split.**
  Story 1.6 could not assert a 5 s cradle: Epic 1's placeholder table has no geometry beside
  either flipper, so a ball rolls along the raised bat under the 6.5° pitch and leaves it after
  roughly 1.2–1.9 s. That was proved to be missing geometry rather than a defect in the ported
  `FlipperMover` (energy dissipates rather than being injected, and a control ball that never
  touches a flipper runs away faster). Story 1.6's ball claim was therefore bounded to 1 s and
  the full cradle deferred here as ledger `DW-72`.
  This story already **authors** the pocket — the inlane guides and posts are in its first
  criterion — but asserted no behaviour that geometry enables, so it would have built the pocket,
  never tested it, and met `DW-72` at its ledger gate with nothing delivered to close it against.
  The criterion above closes that gap. `DW-72` is deliberately written to close on evidence
  rather than on inspection.

### Story 2.2: Slingshots and pop bumpers as hardware rules

As a player,
I want the slingshots and pop bumpers to kick the ball the instant it touches them,
So that the lower playfield is alive and the pops disturb the ball as on a real machine.

**Acceptance Criteria:**

**Given** `s_sling_l` closes at tick *t*
**When** physics steps tick *t*
**Then** `c_sling_l` fires as a hardware rule inside the same step, applying the sling's kick from the ported model, and a `ContactEvent { kind: 'coil_fire', device: 'c_sling_l' }` is emitted to presentation

**Given** a pop bumper skirt switch (`settleTicks` 2)
**When** the ball touches the skirt
**Then** the pop coil fires on the same tick, the ball is kicked away from the bumper centre, and the switch cannot re-close inside its settle window

**Given** `CoilCommand disable` has been issued for the slings and pops
**When** the ball hits them
**Then** they act as passive rubber (elastic contact, no kick) and no `coil_fire` contact is emitted

**Given** the material table in `tuning.ts`
**When** slings, posts and rubber bands are assigned `phys_material`
**Then** each `col_` mesh references a named material with `{ elasticity, elasticityFalloff, friction, scatter }` and `scatter` is 0

### Story 2.3: Drop targets, the spinner and the Lock in physics

As a player,
I want the six drop targets to fall when hit and stay down until the bank resets, the spinner to spin with the ball's speed, and the Lock to swallow a precise Lock-lane shot and eject it out of the Mouth,
So that the stop-and-go shots and the Dragon's physical lock behave like machine hardware.

**Acceptance Criteria:**

**Given** a ball strikes `s_dragon_r` at speed
**When** the target drops
**Then** it closes `s_dragon_r` (drop target class, `settleTicks` 20), becomes non-collidable, emits `ContactEvent { kind: 'drop_target_down' }`, and stays down through any further ball contact

**Given** `pulse c_dragon_bank_reset`
**When** physics processes it
**Then** all six targets rise, become collidable, their switches open as edges, and `ContactEvent { kind: 'bank_reset' }` is emitted

**Given** the spinner on the Left Loop
**When** a ball passes through it
**Then** the spinner gains angular velocity from the contact, closes `s_spinner` once per revolution while it spins, emits `spinner_tick` contacts, and decays to rest; a faster ball produces more closures

**Given** a ball enters the Lock lane precisely
**When** it reaches `bd_lock`
**Then** physics parks it in the lowest empty slot (`s_lock_1` first), removes it from the simulated set and closes the slot switch; a slightly-off shot hits `col_dragon_body` and closes `s_dragon_body` instead

**Given** `pulse c_mouth`
**When** the Lock holds balls
**Then** one ball spawns from the highest filled slot at the Mouth pose with the authored eject speed, travels upward and out toward the flippers, the slot switch opens, and `ContactEvent { kind: 'eject', device: 'bd_lock' }` is emitted; a second pulse ejects the next ball

**Given** three balls are parked in `bd_lock`
**When** a fourth enters the lane
**Then** physics parks nothing, the ball rests at the lane's entry, and the rules layer (Story 2.4) sees `device_ball_entered` with a slot beyond capacity so it can answer `device_overflow`

### Story 2.4: The devices-and-shots layer

As the author,
I want a single rules component that consumes every switch edge and emits device and shot events — Loops made, Ramp made, letters down, bank completed, Dragon hit, Lock lane entered, spinner spins, lane entries, button presses,
So that no mode ever parses a raw switch and "what a Loop is" is defined once.

**Acceptance Criteria:**

**Given** `src/sim/rules/devices/` is the only importer of `SwitchEvent`
**When** dependency-cruiser runs
**Then** any other file under `src/sim/rules/` consuming `SwitchEvent` fails the build

**Given** `TABLE.shots` declares `shot_left_loop = [s_loop_l_in, s_loop_l_out]`, `shot_right_loop`, `shot_ramp = [s_ramp_enter, s_ramp_made]` each with a `…WindowMs` from `tuning.ts`
**When** the switches close in order inside the window
**Then** `shot_<name>_made` is emitted once; when the sequence breaks or the window expires, `shot_<name>_broken` is emitted; a Loop shot in the wrong direction emits nothing

**Given** a drop-target switch closes
**When** the devices layer processes it
**Then** it emits `bank_target_down { letter }`; when all six are down it emits `bank_completed` and alone pulses `c_dragon_bank_reset`; it also pulses the reset on `ball_will_start`

**Given** switch edges from the Dragon body, Lock lane, spinner, Top lanes, inlanes/outlanes, the shooter lane and the cabinet buttons
**When** they arrive
**Then** the layer emits `dragon_hit`, `lock_lane_entered`, `spinner_spin { count }`, `lane_entered { lane }`, `lane_change_pressed { side }`, `ball_launched` (on the opening of `s_shooter_lane`), `device_ball_entered { device, slot }`, `device_ball_left { device, slot }` and `button_pressed { button }`, each payload-complete

**Given** a switch-script DSL in Vitest typed by `SwitchName` (`close('s_loop_l_in').at(100).open().at(120)…`)
**When** the rules tests run headless in Node
**Then** every event above has at least one scripted test with no physics or rendering loaded

### Story 2.5: Start, Hot seat and the ball lifecycle

As a player,
I want to press Start to begin a game, press it again to add up to four players before the first ball ends, and have the machine serve each ball, end it on the drain and rotate players,
So that a complete game is playable from Start to the last ball.

**Acceptance Criteria:**

**Given** `GameState = { tick, phase, machine, players[], currentPlayer, modes[], rng }`
**When** it is defined
**Then** it is JSON-serializable with no class instances or closures, mutated only inside `rules.step`, with score, letters, Lock credits, modes played, tilt warnings, bonus, extra balls, lanes, Jackpot seed and Wars started under `players[i]` and device slots, `ballsInPlay`, `hardwareEnabled`, `ballSave`, `tilt` and `multiball` under `machine`

**Given** the machine is in Attract
**When** `s_start` closes
**Then** phase becomes `playing`, one player is created from `GameStart`, `ball_will_start` → `ball_starting` → `ball_started` fire, hardware is enabled on `ball_starting`, and the ball controller alone pulses `c_trough_eject` to serve ball 1

**Given** ball 1 of player 1 has not ended
**When** `s_start` closes again
**Then** a player is added, up to four; a fifth press does nothing; `s_start` after the first ball ends does nothing

**Given** `ballsInPlay` reaches 0 by a drain outside a save window
**When** the ball controller processes it
**Then** every active mode receives `_will_stop` before `ball_ended { player, bonusByCategory, multiplier, total, tilted }` fires, `modes[]` is empty, and the next player (or the same player's next ball) starts with `ball_will_start` resetting `ballSave`, `tilt` and `multiball`

**Given** balls per game is an adjustment (default 3)
**When** the last player's last ball ends
**Then** phase becomes `game_over` and hardware is disabled

**Given** two players in Hot seat
**When** player 1 drops three letters and player 2 starts a ball
**Then** player 2's letters are empty and player 1's persist, verified by a switch-script test

### Story 2.6: The DMD Backglass

As a player,
I want a pixelated dot-matrix Backglass in the backbox strip showing my score, whose ball it is and the ball number,
So that I can read the game without instructions.

**Acceptance Criteria:**

**Given** `src/presentation/backglass/`
**When** it renders
**Then** it draws to a low-resolution dot-matrix canvas mapped onto the backbox quad visible at the top of the fixed view, with a visible dot grid and no smoothing

**Given** the snapshot's read-only `GameState`
**When** a frame is applied
**Then** the display shows every player's score, highlights the current player, and shows the ball number, formatted only in `presentation/backglass` (English literals live here and nowhere in `sim/`)

**Given** a payload-complete event such as `ball_ended { player, … }` arrives in the same frame as a snapshot where `currentPlayer` has already advanced
**When** the Backglass shows the end-of-ball screen
**Then** it names the player from the event payload, never from the snapshot

**Given** the machine is in Attract
**When** no game is running
**Then** the display cycles the last game's scores and a "PRESS START" prompt

**Given** a `ModeView` is present in `modes[]`
**When** the display renders
**Then** it shows the highest-priority mode's name and any `timerTicks`, `value`, `charge` or `strikesRemaining` it publishes, converted to display units in presentation

### Story 2.7: Plunge, Skill shot and lane change

As a player,
I want the plunge to offer a Skill shot on a lit, rotating Top lane, and the flipper buttons to move the lit lanes,
So that arming myself on the plunge is a real shot and I can steer which lane is lit.

**Acceptance Criteria:**

**Given** `ball_starting` fires
**When** the skill-shot mode (priority 200) starts on a minimal mode stack (base mode 100 + skill shot)
**Then** it draws the lit Top lane once from `GameState.rng`, writes it to the player's lane state, and the Backglass shows ARM YOURSELF

**Given** the ball is plunged and enters the lit Top lane before any other playfield switch closes
**When** `lane_entered` matches the lit lane
**Then** the player is awarded the skill-shot value from `tuning.ts` plus one DRAGON letter, and the mode stops; when the first closure is any non-Top-lane playfield switch, the mode stops with no award

**Given** the base mode owns lane state
**When** `lane_change_pressed { side }` arrives
**Then** the lit insert among the Top lanes and among the inlane/outlane set moves one position in that direction, wrapping, and a completed set is recorded on the player

**Given** all three Top lanes have been entered this ball
**When** the set completes
**Then** `lanes_completed { set: 'top' }` fires and the set resets, so the Bonus multiplier (Story 2.10) can advance on it

**Given** the plunge from Story 1.6
**When** the player plunges each ball
**Then** the lit lane differs across balls under the seeded PRNG and replays identically for the same seed

### Story 2.8: Inserts in the held colour grammar

As a player,
I want the inserts to light in the table's fixed colour language — white for a lit shot, orange for DRAGON letters and the Lock — projected from game state,
So that I can read the table without instructions and a colour always means the same thing.

**Acceptance Criteria:**

**Given** `lampsOf(state): LampState` in `src/sim/rules/lamps.ts`
**When** rules step
**Then** every lamp's `{ role, step }` is recomputed from state (base mode contributes lane and letter roles), `sim/loop` emits only the diff as `LampCommand`s, and no mode ever issues a lamp command directly

**Given** `role ∈ { off, lit, hurryup, quickmb, joust, dragon, special }` and `step ∈ {0,1,2,3}`
**When** any file under `src/sim/` is inspected
**Then** no RGB, hex or colour name appears; a test asserts the role union is closed

**Given** `src/presentation/lighting/grammar.ts`
**When** a `(role, step)` is looked up
**Then** it yields exactly white / red / green / blue / orange / purple for `lit / hurryup / quickmb / joust / dragon / special`, with `step` 1 lit, 2 emphasised and 3 urgent as intensity/cadence and blinking timed by presentation

**Given** `LampDriver` and the `l_` insert nodes
**When** a `LampCommand` arrives
**Then** the insert's emissive material and a dynamic light beneath the lens follow the grammar, latest-wins per lamp within a frame, and the driver stays within the live-light budget from `tuning.ts`

**Given** a player's lit Top lane, lit inlane/outlane and dropped letters
**When** the table is viewed
**Then** the lit lanes show white and the dropped letters and the Lock show orange, and the skill-shot lane blinks at step 2

### Story 2.9: Ball save

As a player,
I want a drained ball returned during a save window that starts at the plunge, warns before it expires and still saves briefly after,
So that an early drain is not a lost ball.

**Acceptance Criteria:**

**Given** `machine.ballSave` is one device owned by the ball controller with `arm({ ticks, source })` and `disarm(source)`
**When** `ball_starting` fires
**Then** `ball_save_enabled` is emitted and the timer has not started

**Given** `ball_launched` fires
**When** the save is enabled
**Then** `ball_save_timer_started` is emitted and the window counts `ballSaveMs` in ticks; the ball-save insert shows role `lit` step 1, moves to step 3 for the last `ballSaveHurryUpMs`, and off at expiry

**Given** the ball drains inside the window or inside `ballSaveGraceMs` after the displayed expiry
**When** `ballsInPlay` would reach 0
**Then** the ball controller alone pulses `c_trough_eject` then `c_autolaunch`, `ball_saved` fires, and the ball does not end

**Given** two sources arm the device with different windows
**When** both are live
**Then** the longest live window wins; `disarm(source)` of one leaves the other; Tilt disarms all

**Given** a switch-script test
**When** drains occur at expiry − 1 tick, expiry + grace − 1 tick and expiry + grace + 1 tick
**Then** the first two save and the third ends the ball

### Story 2.10: End-of-ball bonus and the multiplier

As a player,
I want my letters, Loops and Strikes counted into a bonus that a multiplier grows when I complete the Top lanes, paid at the end of the ball,
So that every ball has a payoff beyond its live scoring.

**Acceptance Criteria:**

**Given** the player's `bonus` by category (letters, loops, strikes) and `multiplier`
**When** `bank_target_down`, `shot_left_loop_made` / `shot_right_loop_made` arrive
**Then** the matching category increments; `multiplier` starts each ball at 1× and advances 2× → 3× → 5× on each `lanes_completed { set: 'top' }`, capped at 5×

**Given** the ball ends untilted
**When** `ball_ended` is built
**Then** `bonusByCategory`, `multiplier` and `total = Σ category × value × multiplier` are in the payload, the total is added to the score, and rules emit `bonus_count_step` events paced by `bonusCountMs` that the Backglass animates to

**Given** the ball ends tilted
**When** `ball_ended` fires
**Then** `total` is 0, `tilted` is true and the score is unchanged

**Given** the next ball starts
**When** `ball_will_start` fires
**Then** the bonus categories and multiplier reset while the letters persist

### Story 2.11: Tilt warnings, Tilt and Slam tilt

As a player,
I want nudging too hard to warn me and then tilt the ball, and cabinet abuse to slam-tilt the whole game,
So that nudge danger is real and the machine punishes abuse the way a real one does.

**Acceptance Criteria:**

**Given** `s_tilt_bob` closes
**When** no closure has occurred within `tiltWarningSpacingMs`
**Then** the current player's `tiltWarnings` increments, `tilt_warning { player, remaining }` fires and the Backglass shows the warning; a closure inside the spacing window is ignored; the bob is never reset by command and `tiltSettleMs` applies before the next warning can count

**Given** the warning count equals the adjustment (default 1)
**When** `s_tilt_bob` closes again
**Then** `tilt { player }` fires, `machine.tilt` is set, flippers, slings, pops and autolaunch are disabled together via `CoilCommand disable`, ball save is disarmed, the Backglass shows TILT, and the ball ends when the last ball in play drains

**Given** a tilt ended the ball
**When** the next ball starts
**Then** `ball_will_start` clears `machine.tilt`, hardware is re-enabled on `ball_starting`, the score is unchanged and the bonus was forfeited (Story 2.10)

**Given** two players
**When** player 1 collects a warning
**Then** player 2's warning count is unaffected

**Given** `s_slam_tilt` closes during any phase with a game running
**When** rules process it
**Then** `slam_tilt` fires, every player's game ends without bonus, hardware is disabled and the machine returns to Attract

### Story 2.12: Ball search

As a player,
I want the machine to hunt for a stuck ball and, failing that, serve a new one,
So that a stuck ball never ends the game.

**Acceptance Criteria:**

**Given** a ball is in play
**When** no switch closes for `ballSearchMs`
**Then** `ball_search_started` fires and the ball controller pulses coils in each device's `ballSearchOrder` on a tick schedule (slings, pops, bank reset, then the Lock and trough ejects)

**Given** any active mode publishes a `timerTicks`
**When** ball search runs
**Then** `c_mouth` is skipped so locked balls are not released

**Given** the search completes with no switch closure
**When** the final stage runs
**Then** `RecoverCommand` is issued once, physics despawns every ball outside a device and returns the `recovered` count, `ball_missing { count }` fires, `ballsInPlay` is corrected from slot switches and a new ball is served

**Given** a switch closes during the search
**When** rules process it
**Then** the search cancels and the timer restarts

**Given** the device failure vocabulary (`eject_failed`, `ball_missing`, `broken`, `device_overflow`)
**When** any is emitted
**Then** rules handle it without throwing, and `device_overflow` is answered with an immediate eject from that device

### Story 2.13: Match, game over and return to Attract

As a player,
I want the game to end with the scores shown, a Match draw and a return to Attract,
So that the game closes the way a real machine does.

**Acceptance Criteria:**

**Given** the last ball of the last player ends
**When** phase becomes `game_over`
**Then** the Backglass shows final scores by player and `game_ended { scores[] }` fires

**Given** `matchPercent` (default 8) and `GameState.rng`
**When** the Match runs
**Then** a multiple-of-ten number from 00 to 90 is drawn with the configured probability of matching at least one player's last two score digits, `match_drawn { number, winners[] }` fires, the Backglass reveals the number paced by `matchRevealMs` step events, and a win shows MATCH — display-only under free play

**Given** Match has resolved
**When** `attractMs` elapses or `s_start` closes
**Then** the machine enters Attract (or starts a new game), hardware is disabled, `modes[]` is empty and `players[]` is cleared on the next Start

**Given** Attract
**When** it runs
**Then** the Backglass cycles the last scores and shows the flipper, plunge and Start keys once from `ViewConfig.bindings` before cycling; the Walk-up camera sequence is added in Epic 4

## Epic 3: The Campaign and the War

The five modes and the moment: lock two balls under the Dragon, spell DRAGON in either order, the Mouth opens and fires them back as fire, ten Strikes win the Jackpot. Hurry-up, Quick multiball, Joust, the Lock arbiter, the War, Strikes and the progressive Jackpot, re-qualification, stacking by priority, the extra-ball achievement menu, and the Dragon's mouth and hit-reaction shows. Scoring values freeze after this epic's first full playtest.

**FRs covered:** FR-21, FR-30, FR-33, FR-34, FR-35, FR-36, FR-37, FR-38, FR-39, FR-40, FR-41 · **ARs:** AR-20, AR-21 · **Judges:** SM-2

### Story 3.1: The mode stack

As the author,
I want modes to stack by unique priority, speak the four-phase lifecycle, receive every device and shot event highest-first, and publish only a `ModeView`,
So that every mode in this epic drops into one framework and two modes can never both claim the Backglass.

**Acceptance Criteria:**

**Given** the minimal stack from Story 2.7
**When** it is generalised in `src/sim/rules/modes/`
**Then** priorities are declared once — base 100, skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500 — and registering a duplicate is a dev-mode assertion

**Given** a mode starts or stops
**When** the transition runs
**Then** only `mode_<name>_will_start` → `_starting` → `_started` and `_will_stop` → `_stopping` → `_stopped` fire, in that order, and no other start/stop path exists

**Given** two active modes
**When** a device or shot event arrives
**Then** both receive it, higher priority first, scoring from both accrues to the player, each contributes lamp roles to `lampsOf` by priority (higher wins per lamp), and the Backglass shows the highest-priority `ModeView`

**Given** a mode with a timer is active under a higher-priority mode
**When** ticks advance
**Then** its timer keeps running and its `timerTicks` in `ModeView` decreases

**Given** the ball ends
**When** `ball_ended` is about to fire
**Then** every active mode has received `_will_stop`, `modes[]` is empty, and a test asserts no mode survives into the next player's ball

**Given** any mode
**When** it is inspected
**Then** it never emits a `CoilCommand`; a test wraps each mode's outputs and asserts

### Story 3.2: Locking balls and the Lock arbiter

As a player,
I want a precise Lock-lane shot to lock my ball under the Dragon and serve me a new one, up to two locks, with the Lock lit orange while I can lock,
So that I can feed the Dragon the balls it will spit back at me.

**Acceptance Criteria:**

**Given** `src/sim/rules/ball-controller/lock-arbiter.ts` is the only consumer of `lock_lane_entered`
**When** dependency-cruiser and a rules test run
**Then** no other consumer exists and the arbiter emits exactly one outcome per entry

**Given** the player has fewer than two Lock credits and `machine.multiball === null`
**When** `lock_lane_entered` arrives
**Then** the arbiter emits `lock_lane_locked { player, credits }`, the player's credits rise by one, and the ball controller alone pulses `c_trough_eject` and `c_autolaunch` to serve a new ball; `ballsInPlay` is unchanged

**Given** the physical Lock is full of another player's balls
**When** the current player's lock is credited
**Then** the arbiter emits `lock_lane_spit`, issues `ShowCommand show_dragon_mouth_open`, and pulses `c_mouth` exactly `mouthOpenLeadMs` (in ticks) later; the credit still counts

**Given** the player has two credits, no Mode is lit and no multiball is running
**When** `lock_lane_entered` arrives
**Then** the arbiter emits no award, opens the Mouth and ejects the ball back to play after the lead time

**Given** the player's credits are below two
**When** `lampsOf` runs
**Then** the Lock insert carries role `dragon` step 1; at two credits it is off

**Given** UJ-3's edge case
**When** player 1 drains with two balls locked and player 2 shoots the Lock lane
**Then** player 2's credits go 0 → 1, one ball is spat, and player 1's credits remain two — verified by a switch-script test

### Story 3.3: The Dragon's mouth and hit reaction

As a player,
I want the Dragon to open its mouth before anything comes out of it and to react when I hit it,
So that the Dragon is the protagonist and not set dressing.

**Acceptance Criteria:**

**Given** `TABLE.shows` declares `show_dragon_mouth_open`, `show_dragon_mouth_close` and `show_dragon_hit`
**When** rules emit them
**Then** `dragon_hit` from the devices layer causes `ShowCommand show_dragon_hit`, and every Mouth eject is preceded by `show_dragon_mouth_open` by `mouthOpenLeadMs` and followed by `show_dragon_mouth_close` after the last eject of that sequence

**Given** the Dragon rig in `src/presentation/mechanisms/dragon.ts` on the placeholder mesh
**When** `show_dragon_mouth_open` arrives
**Then** the mouth animates open within the lead time so it is fully open before the first ball spawns, stays open until `show_dragon_mouth_close`, and the animation reads the show commands only — never the snapshot's device slots or `ballsInPlay`

**Given** `show_dragon_hit`
**When** it arrives
**Then** a visible reaction plays once per hit and overlapping hits restart it rather than queue

**Given** v1 scope
**When** the rig is reviewed
**Then** it has exactly the open, close and hit animations and no idle animation

### Story 3.4: Lighting Modes at the Ramp and starting them at the Lock lane

As a player,
I want Ramp shots to light Hurry-up, Quick multiball and Joust in campaign order and the Lock lane to start a lit Mode — letting me pick with the flippers when more than one is lit,
So that the campaign has a qualifier and a start shot without any gating.

**Acceptance Criteria:**

**Given** the base mode tracks `modesLit` and `modesPlayed` per player
**When** `shot_ramp_made` arrives with no Mode lit
**Then** the next unplayed Mode in the order Hurry-up → Quick multiball → Joust is lit and its insert shows its role at step 1; once all three are played, the order restarts

**Given** exactly one Mode is lit and the player has two credits (or a lock was just credited)
**When** `lock_lane_entered` arrives outside a multiball
**Then** the arbiter emits `lock_lane_mode_start { candidates: [mode] }` (after `lock_lane_locked` if the lock applied), starts the Mode, and ejects the ball via the Mouth (or serves from the trough when the lock applied) so the Mode runs with the ball now in play

**Given** more than one Mode is lit
**When** `lock_lane_mode_start` fires
**Then** the ball stays parked in `bd_lock`, a `modeSelectMs` window opens, flipper edges (`button_pressed`) move the selection, Start or either flipper held confirms, the window's expiry confirms the current selection, the Backglass shows the candidates, and the Mouth then opens and ejects

**Given** a Mode starts
**When** `mode_<name>_started` fires
**Then** it is added to the player's `modesPlayed`, its insert goes off, and `ShowCommand show_mode_start` is emitted

**Given** a switch-script test
**When** the Ramp is made three times and the Lock lane entered after each
**Then** Hurry-up, then Quick multiball, then Joust start in that order across balls, with letters and credits per player unaffected by the Mode starts

### Story 3.5: Hurry-up — answer the call

As a player,
I want Hurry-up to start a value counting down that I collect by shooting the Ramp before it hits the floor,
So that the call to arms is a race.

**Acceptance Criteria:**

**Given** Hurry-up starts (priority 300)
**When** its `_started` fires
**Then** its value starts at `hurryUpStartValue` (250,000) and decays linearly to `hurryUpFloor` (50,000) over `hurryUpMs` (20 s), published each tick as `ModeView.value` and `timerTicks`

**Given** Hurry-up is running
**When** `shot_ramp_made` arrives
**Then** the current value is awarded, `hurryup_collected { value }` fires and the Mode stops

**Given** the timer reaches the floor
**When** `hurryUpMs` elapses
**Then** the value holds at the floor until the ball ends or the Ramp is made `[reading of FR-34: "decays to a floor"]`, and the ball ending stops the Mode with no award

**Given** Hurry-up is running
**When** `lampsOf` runs
**Then** the Ramp insert carries role `hurryup` step 1, moving to step 3 in the last `hurryUpUrgentMs`

**Given** Quick multiball starts while Hurry-up runs
**When** ticks advance
**Then** the Hurry-up timer keeps counting and a Ramp shot still collects it

### Story 3.6: Joust — the charge

As a player,
I want alternating Loop shots to build a Charge that multiplies the Loop award, broken by a miss or by repeating the same Loop,
So that the joust is charge, pass, wheel around, charge again.

**Acceptance Criteria:**

**Given** Joust starts (priority 310)
**When** `shot_left_loop_made` or `shot_right_loop_made` arrives
**Then** if it differs from the previous Loop the Charge increments (to a cap of `joustChargeMax`, 10) and the award is `loopValue × charge`; if it repeats the previous Loop the Charge resets to 1 and the base award is paid

**Given** a Loop is started and broken (`shot_<loop>_broken`)
**When** the break arrives
**Then** the Charge resets to 1 and `joust_charge_broken` fires

**Given** the Charge changes
**When** `ModeView` is published
**Then** `charge` carries the current value and the Backglass shows CHARGE ×N; both Loop inserts carry role `joust`, the next-expected Loop at step 2

**Given** the Charge reaches the cap
**When** it happens
**Then** `joust_full_charge { player }` fires once per Joust so the Extra-ball menu (Story 3.10) can consume it

**Given** Joust has a duration `joustMs`
**When** it elapses or the ball ends
**Then** the Mode stops; the spinner continues to award per rotation independently of Joust

### Story 3.7: Quick multiball — fight the monster

As a player,
I want Quick multiball to add a second ball with its own ball save and pay on Dragon hits and Ramp shots,
So that fighting the monster is a two-ball scrap.

**Acceptance Criteria:**

**Given** Quick multiball starts (priority 400) and `machine.multiball === null`
**When** its `_starting` fires
**Then** `machine.multiball = 'quickmb'` is set there and nowhere else, the ball controller serves one additional ball from the trough (`ballsInPlay` 2), and the Mode arms `ballSave` with `{ ticks: quickMbBallSaveTicks, source: 'quickmb' }`

**Given** Quick multiball is running
**When** `dragon_hit` or `shot_ramp_made` arrives
**Then** the Mode's award is paid, and the inserts for the Dragon and Ramp carry role `quickmb`

**Given** Quick multiball is running
**When** `lock_lane_entered` arrives
**Then** the arbiter emits `lock_lane_strike` (a bash hit for this Mode), no credit is added, and the ball is ejected back via the Mouth

**Given** `ballsInPlay` drops to 1
**When** the ball controller reports it
**Then** the Mode stops and `machine.multiball` is cleared only in `_stopped`; its ball-save source is disarmed

**Given** `machine.multiball !== null`
**When** a Lock-lane Mode start or a War start would otherwise apply
**Then** neither happens; a switch-script test covers Quick multiball → Lock lane → no lock, no War

### Story 3.8: The War starts — dragon fire

As a player,
I want the moment I have both DRAGON spelled and two balls locked — whichever comes last — the Dragon to open its mouth and fire my locked balls back at me, with three balls in play,
So that the founding moment of the project lands.

**Acceptance Criteria:**

**Given** the current player has two Lock credits and `machine.multiball === null`
**When** `bank_completed` arrives
**Then** the War (priority 500) starts: `machine.multiball = 'war'` in `_starting`, `show_dragon_mouth_open` then `c_mouth` pulses once per ball in the Lock after `mouthOpenLeadMs`, and the trough auto-launches the difference so `ballsInPlay` becomes 3

**Given** the current player has DRAGON spelled
**When** the second lock is credited (`lock_lane_locked` with credits 2)
**Then** the War starts the same way — the Lock fires what it holds and the trough tops up to three — and no Mode-select window opens

**Given** a Hot-seat opponent's War consumed the locked balls
**When** the current player's War starts with credits 2 but fewer balls in the Lock
**Then** the Mouth fires what it holds and the trough launches the difference; `ballsInPlay` is 3

**Given** the War is running
**When** `lock_lane_entered` arrives
**Then** the arbiter emits `lock_lane_strike` and the War counts it as a Strike

**Given** the War starts
**When** its `_starting` fires
**Then** `ShowCommand show_war_start`, `GiCommand` dimming the playfield GI to `warGiLevel`, and `FlasherCommand`s on every flasher are emitted in that tick, the War arms `ballSave` with its own source, and every War insert carries role `dragon` step 2

**Given** the player's `warsStarted`
**When** the War starts
**Then** it increments and `war_started { player, jackpot }` carries the Jackpot for this War

### Story 3.9: Strikes, the Jackpot and the end of the War

As a player,
I want every Dragon hit during the War to be a Strike, the tenth Strike to pay the Jackpot, and further Strikes to pay it again, until one ball remains,
So that winning the War is the biggest payoff on the table.

**Acceptance Criteria:**

**Given** the War is running
**When** `dragon_hit` or `lock_lane_strike` arrives
**Then** `war_strike { remaining, jackpot }` fires with `remaining = warStrikesToWin − strikes`, the Backglass shows Strikes remaining, and `show_dragon_hit` plays

**Given** `bank_completed` arrives during the War
**When** the War processes it
**Then** it counts as `warStrikesPerBank` Strikes instead of resetting letters, and the bank still resets

**Given** the Strike count reaches `warStrikesToWin` (10)
**When** the winning Strike lands
**Then** the Jackpot — `jackpotBase` (500,000) + `jackpotPerWar` (500,000) × the player's `warsStarted` — is awarded, `jackpot_awarded { value }` fires with `ShowCommand show_jackpot` and flashers, `war_won { player }` fires once, and the player's Extra-ball achievement "won a War" is recorded once per game

**Given** the War is won
**When** further Strikes land in the same War
**Then** each re-awards the Jackpot, and the Jackpot insert ladder shows step 3

**Given** `ballsInPlay` drops to 1
**When** the ball controller reports it
**Then** the War stops, `machine.multiball` clears in `_stopped`, the player's DRAGON letters reset, Lock credits return to zero, `warsStarted` (the Jackpot seed) carries, and `war_ended { player, strikes, won }` fires

**Given** the War ended
**When** the player spells DRAGON and locks two balls again in the same game
**Then** a second War starts with a Jackpot 500,000 higher than the first

### Story 3.10: Extra ball from the achievement menu

As a player,
I want Extra ball lit by long-horizon achievements — winning a War, a full-Charge Joust, playing every Mode — and collected at the Right Loop,
So that the table feels authored and an extra ball is earned, not stumbled into.

**Acceptance Criteria:**

**Given** `war_won`, `joust_full_charge`, or `modesPlayed` containing all three Modes
**When** any occurs for the first time this game for the player
**Then** `extra_ball_lit { player, achievement }` fires and the Right Loop's Extra-ball insert carries role `special` step 1

**Given** Extra ball is lit
**When** `shot_right_loop_made` arrives
**Then** the player's `extraBalls` increments, `extra_ball_awarded` fires with `show_extra_ball`, and the insert goes off

**Given** the player's ball ends with `extraBalls > 0`
**When** the ball controller rotates
**Then** the same player starts again with `extraBalls` decremented and the ball number unchanged on the Backglass

**Given** the same achievement occurs twice in one game
**When** the second occurrence fires
**Then** it does not light Extra ball again; a different achievement does

### Story 3.11: The first full playtest and the scoring freeze

As the author,
I want to play complete games through every Mode and the War with the dev panel open, then freeze the scoring values and Strike count,
So that the numbers stop being starting values and SM-2 — the dragon-fire moment landing — gets its first honest judgement.

**Acceptance Criteria:**

**Given** Epic 3 stories 3.1–3.10 are complete
**When** the author plays at least five full games including two Wars, a Hurry-up collect, a full-Charge Joust and a Quick multiball
**Then** each game is recorded as a replay in `test/replays/playtest-*.replay.json` and its state hash passes in CI

**Given** the dev panel
**When** scoring tunables (skill shot, loop, spinner, letter, bonus values, Hurry-up start/floor/duration, Joust cap, Strikes to win, Jackpot base and increment) are adjusted during play
**Then** the final set is exported to `tuning.ts` with `confidence: playtested` and `source` naming the playtest date

**Given** `docs/feel-test.md`
**When** the playtest closes
**Then** it records the author's judgement of the War start (mouth open → balls out → three in play) as landing or not, with the named differences that became changes

**Given** the tuning file
**When** CI runs after the freeze
**Then** a test asserts every scoring tunable carries `confidence: playtested`

## Epic 4: Lights, Sound and the Walk-up

The table looks and sounds like a real machine: the Walk-up and Attract show, four independent lighting channels behind one driver, inserts as lights through cups spilling onto the art, flashers on events with duty-cycle limits, mechanical audio from contacts, cues from shows, ball roll per ball, and the swappable asset provider that the author's recordings will drop into later. Spike 2 runs before the light-group partition freezes; the bake is a later swap behind the same driver.

**FRs covered:** FR-1, FR-42, FR-43, FR-45, FR-46, FR-47, FR-48 · **NFRs:** NFR-1 · **ARs:** AR-3, AR-27, AR-29, AR-30

### Story 4.1: Four lighting channels behind one driver

As a player,
I want the general illumination, the inserts, the flashers and the cabinet lighting to be separately driven — the GI dimming for the War while the inserts stay bright,
So that the table's light behaves like a real machine's four circuits.

**Acceptance Criteria:**

**Given** `LampDriver` in `src/presentation/lighting/`
**When** it is structured
**Then** it exposes four channels — `gi`, `inserts`, `flashers`, `architectural` — each a set of named lamps from `TABLE.lamps` with a `channel` and a `group`

**Given** `GiCommand { channel, level }` for `gi_playfield`, `gi_backbox`, `gi_cabinet` and `gi_arch`
**When** it arrives
**Then** that channel's lamps scale to `level` (0..1), latest-wins per channel within a frame, and the inserts are unaffected

**Given** the War start (Story 3.8) dims `gi_playfield`
**When** the frame renders
**Then** the playfield GI is visibly dimmer while the War inserts glow orange at full intensity

**Given** the WebGL2 engine
**When** the scene lights
**Then** Babylon clustered forward lighting is active with the live dynamic-light count capped at `liveLightBudget` (20) by the driver, and the same scene on WebGPU renders the same states

**Given** the GI level is set once per phase (Attract, playing, game over)
**When** the phase changes
**Then** rules emit one `GiCommand` per channel and the architectural channels follow it

### Story 4.2: Inserts as lights through cups

As a player,
I want each insert to glow from beneath the translucent playfield through its cup and spill onto the surrounding art,
So that the inserts read as lamps under plastic, not stickers.

**Acceptance Criteria:**

**Given** every `l_` node carries lens and cup geometry and the playfield material has a translucency mask
**When** an insert is lit
**Then** the lens emissive lights, a point light beneath the lens illuminates the cup interior and spills through the mask onto adjacent playfield art, and the insert is dark when off

**Given** between 50 and 150 inserts in `TABLE.lamps`
**When** all are lit at once on the WebGL2 path
**Then** the frame stays at 60 FPS on the target hardware with the driver batching lights within the budget (emissive for all, dynamic light for the nearest N to the camera or by priority)

**Given** the `(role, step)` grammar
**When** an insert is at step 2 or 3
**Then** the lens intensity and spill scale up and the cadence blinks in presentation, with no command traffic from rules per blink

**Given** the future per-group bake
**When** the driver is reviewed
**Then** the emissive-plus-dynamic path sits behind the same `LampDriver` interface so the bake can replace it without touching rules, `TABLE` or mesh names

### Story 4.3: Flashers on events

As a player,
I want the flashers to fire on Mode starts, locks, the Mouth ejecting, the Jackpot and Tilt, with the War start the brightest thing on the table,
So that the big moments hit the eyes.

**Acceptance Criteria:**

**Given** `TABLE.flashers` and the flasher driver
**When** `FlasherCommand { flasher, ms }` arrives
**Then** the flasher lights at full intensity for `ms` and the driver's duty-cycle limiter refuses to keep any flasher on beyond `flasherMaxOnMs` per `flasherWindowMs`

**Given** rules emit flashers on `mode_<name>_started`, `lock_lane_locked`, every Mouth eject, `jackpot_awarded` and `tilt`
**When** a switch-script test runs those events
**Then** each produces the expected `FlasherCommand`s with durations from `tuning.ts`

**Given** the War start
**When** its flashers fire
**Then** every flasher fires together at the longest permitted duration, and no other event fires more than half of them

**Given** a flasher command with `ms` longer than the limit
**When** the driver processes it
**Then** it is clipped, never dropped, and never left on

### Story 4.4: Mechanical sounds from contacts

As a player,
I want to hear the flippers snap, the slings and pops kick, the drop targets fall and reset, the Lock swallow and the Mouth kick, and the ball roll on wood and rubber,
So that the table sounds like a machine and not a video game.

**Acceptance Criteria:**

**Given** `src/presentation/audio/` builds a Web Audio graph (AudioWorklet where available)
**When** the press-to-begin gesture occurs
**Then** the context is resumed before any sound is scheduled, and nothing under `src/sim/` references audio

**Given** `AudioAssetProvider`
**When** a show name from `TABLE.shows` is resolved
**Then** it returns either a synth function or a sample URL and is the only place that knows which; every sound in this story ships as a synth function

**Given** a `ContactEvent { kind: 'hit', speed, surface }`
**When** it arrives
**Then** the surface selects the sound (`wood`, `rubber_post`, `rubber_band`, `metal`, `plastic`, `ramp`, `flipper`, `target`, `bumper`, `glass`, `ball`, `dragon`) and speed sets gain and pitch; contacts below `contactAudibleSpeed` are silent

**Given** actuation contacts `coil_fire`, `flipper_eos`, `drop_target_down`, `bank_reset`, `eject` and `spinner_tick`
**When** they arrive
**Then** each plays its named show once, scheduled at its tick offset within the frame; because a disabled flipper emits no `coil_fire`, no flipper snap plays during Tilt

**Given** each ball in the snapshot
**When** frames render
**Then** one continuous roll voice per `ballId` follows its speed, surface and position, starts when the ball spawns and stops when it parks

**Given** a generated sound
**When** it is added
**Then** `ATTRIBUTIONS.md` records it as generated with the tool and date; `.wav` masters live in `assets/src/` and any shipped sample is `.mp3` in `public/assets/`

### Story 4.5: Mode and Backglass cues

As a player,
I want a short cue for Mode start, locks, the War start, the Jackpot, Tilt and Match, with the War start unmistakable,
So that the big beats are heard as well as seen.

**Acceptance Criteria:**

**Given** `TABLE.shows` declares `show_mode_start`, `show_lock`, `show_war_start`, `show_jackpot`, `show_tilt`, `show_match` and `show_extra_ball`
**When** rules emit them (Stories 3.4, 3.2, 3.8, 3.9, 2.11, 2.13, 3.10)
**Then** each resolves through `AudioAssetProvider` to a short generated sting, fired from `ShowCommand` only — a test asserts no cue fires from polled state

**Given** `show_war_start`
**When** it plays
**Then** it is longer and louder than every other cue and shares no waveform with them

**Given** a swap test
**When** `show_lock` is re-pointed from its synth to an `.mp3` in `AudioAssetProvider`
**Then** only that sound changes and no file under `src/sim/` or `src/presentation/` outside the provider is touched

**Given** v1 scope
**When** the audio set is reviewed
**Then** there is no music and no speech

### Story 4.6: The Walk-up and the Attract show

As a stranger with a link,
I want the machine to greet me with the lit backbox and the Backglass telling me about the war before the camera settles onto the playfield,
So that I know what this is before I press anything.

**Acceptance Criteria:**

**Given** boot completes after press-to-begin
**When** the Walk-up plays
**Then** the camera holds on the backbox with `gi_backbox` lit and the Backglass animating the war fiction, then descends along an authored path to the fixed playfield view over `walkUpMs`, and the Backglass strip remains visible at the end

**Given** the Walk-up is playing
**When** `s_start` closes
**Then** the camera cuts to the fixed view and a game starts

**Given** Attract
**When** it cycles
**Then** the Backglass rotates through the war fiction animation, the last scores, the key bindings shown once, and (from Epic 6) the High-score table, and the architectural lighting is on

**Given** a game ends and Match resolves
**When** the machine returns to Attract
**Then** the Walk-up plays again from the backbox

**Given** the DMD renderer
**When** the war-fiction frames are authored
**Then** they are dot-matrix frames stored under `public/assets/` with an `ATTRIBUTIONS.md` entry, and the sequence runs at the Backglass's frame cadence in presentation

### Story 4.7: Spike 2 — the lightmap scaling envelope and the light-group partition

As the author,
I want to measure how many light groups at what resolution the bake can afford in frame cost and memory before the partition freezes,
So that the bake is a known-size job behind a fixed contract and never a sink on the critical path.

**Acceptance Criteria:**

**Given** a Blender bake script in `tools/`
**When** it bakes N light groups of the placeholder table at 1024² and 2048²
**Then** bake time per group, texture memory (compressed and on-GPU) and the additive-composite frame cost on the WebGL2 path are recorded in `docs/spikes/spike-2.md`

**Given** the measured envelope
**When** the spike closes
**Then** `TABLE.lightGroups` is partitioned to a group count inside the envelope, every static mesh's `lightgroup` property is re-validated by `export.py`, and the decision (bake or stay dynamic for v1) is recorded

**Given** the vpx_lightmapper technique
**When** it is consulted
**Then** no code from it enters the repository until its licence is verified — technique only

### Story 4.8: Per-group baked lighting behind the same driver

As a player,
I want the inserts and GI to carry soft shadows and bounce from a bake, tinted live by the same lamp driver,
So that the light looks like a real machine's while the grammar and the rules stay untouched.

**Acceptance Criteria:**

**Given** spike 2 decided to bake
**When** the bake runs
**Then** each light group produces one white additive lightmap on `TEXCOORD_1`, composited at runtime as `base + Σ groupᵢ × tintᵢ × levelᵢ` with tint from `grammar.ts` and level from the lamp state

**Given** the baked path is enabled
**When** `LampCommand`s and `GiCommand`s arrive
**Then** the same `LampDriver` interface serves them and no file under `src/sim/`, `TABLE` or any mesh name changed to enable it

**Given** the WebGL2 path
**When** the baked scene renders
**Then** it holds 60 FPS within the spike-2 memory envelope and the feel ritual on both paths records no difference in play

**Given** spike 2 decided not to bake for v1
**When** this story is reached
**Then** it is closed as deferred with the reason recorded and the emissive-plus-dynamic path remains the shipped one

## Epic 5: Art Passes — the Dragon and the Table

Phased, allowed to trail, never blocking epics 1–4: the Dragon model and rig, playfield art and materials in the rustic register, cabinet and backbox at real scale for the Walk-up silhouette, insert lenses and the translucency mask, the DMD Backglass art. Each pass replaces placeholder primitives behind the fixed node contract and lands with its `ATTRIBUTIONS.md` entries.

**FRs covered:** none primary — delivers PRD §6.1 "stylized art at real dimensions"; deepens FR-2, FR-4, FR-29, FR-30, FR-43 · **ARs:** AR-26

### Story 5.1: The Dragon

As a player,
I want the Dragon to be a sculpted creature crouched off-centre over its Lock lane, mouth and all,
So that the thing I am at war with looks like a dragon.

**Acceptance Criteria:**

**Given** a Dragon model authored in Blender (or generated, with tool and date recorded)
**When** it replaces the placeholder `vis_dragon` mesh
**Then** the `col_dragon_body`, `sw_lock_lane` and `bd_lock` nodes are unchanged or re-authored to the same names, `export.py` validates, both loaders load, and the Lawlor entry for the Dragon in `docs/feel-test.md` is re-run with no regression

**Given** the rig from Story 3.3
**When** the model is bound
**Then** the mouth open, close and hit-reaction animations play on the new mesh from the same shows, and the mouth is fully open before the first ball spawns

**Given** the stylized direction
**When** the model is reviewed
**Then** it is within the single-LOD triangle budget (≤ 2,000), hand-painted textures, and its `ATTRIBUTIONS.md` entry exists before the file is committed

### Story 5.2: Playfield art and materials

As a player,
I want the playfield painted in the rustic register with the inserts as saturated lenses set into it,
So that realism lives in the light and the proportions while the art tells the war.

**Acceptance Criteria:**

**Given** hand-painted playfield textures
**When** they replace the placeholder material
**Then** the translucency mask matches every `l_` lens position, the material keeps `TEXCOORD_1` and `lightgroup`, and the collision scaffolding is untouched

**Given** the inserts lit in the grammar
**When** the playfield is viewed
**Then** every insert's colour reads clearly against the art at the fixed camera distance, and no insert uses a muted tone

**Given** the art files
**When** they are added
**Then** each is in `ATTRIBUTIONS.md` as author-made or generated with the tool and date, and the compressed build stays within the CI size budget

### Story 5.3: Cabinet, backbox and glass

As a stranger with a link,
I want the cabinet and backbox to have the silhouette and scale of a real machine when the camera walks up,
So that the first thing I see says "pinball machine".

**Acceptance Criteria:**

**Given** `cabinet_root` in the Blender source
**When** the cabinet, backbox, glass, legs and lockdown bar are modelled at standard-body dimensions
**Then** the Walk-up (Story 4.6) frames the backbox and descends past the glass, the glass surface is `vis_` only, and `cabinet_root` stays level while `playfield_root` pitches

**Given** architectural lamps on the backbox and arch
**When** `gi_backbox`, `gi_cabinet` and `gi_arch` are set
**Then** they light the cabinet art and the backbox translucency as authored

**Given** the cabinet art
**When** it is added
**Then** it carries `ATTRIBUTIONS.md` entries and stays within the single-LOD budget per object

### Story 5.4: Mechanisms, plastics, ramp and guides

As a player,
I want the flippers, slings, pops, drop targets, spinner, plunger, ramp, plastics and ball guides to look like the parts on a real machine,
So that the playfield reads as hardware, not scaffolding.

**Acceptance Criteria:**

**Given** `vis_` meshes for each mechanism named as its device
**When** they replace the primitives
**Then** each mechanism's visual follows its physics state from the snapshot (flipper angle, target up/down, spinner angle, plunger travel) and the `col_` scaffolding is unchanged

**Given** the ramp, plastics and guides
**When** they are modelled
**Then** the ball's visible path matches the collision path (no ball passing through a visual), rubber posts and bands are visibly rubber, and no part exceeds the triangle budget

**Given** `pinball-parts` or any other external asset is used
**When** it is added
**Then** its CC BY-SA licence is verified at source, the NC-SA node group is excluded, and the `ATTRIBUTIONS.md` entry precedes the file

### Story 5.5: Backglass art and DMD frames

As a stranger with a link,
I want the Backglass animations to tell me there is a dragon and a war,
So that the fiction is set before I plunge.

**Acceptance Criteria:**

**Given** DMD-resolution frame sequences for Attract, Mode prompts, the War start, the Jackpot and Match
**When** they are authored
**Then** they are dot-matrix frames at the Backglass resolution, with any font's licence verified at source and recorded, and `ATTRIBUTIONS.md` entries preceding the files

**Given** the Backglass renderer
**When** it plays a sequence on a payload-complete event
**Then** the sequence is selected and timed in presentation from the event, and the score layout remains legible during and after it

**Given** the war-fiction Attract sequence
**When** a stranger watches the Walk-up
**Then** it conveys a dragon and a knight without text instructions, judged by the SM-3 link test

## Epic 6: Ship It — your machine, from a link

Anyone on Windows or macOS plays from a link: press-to-begin, WebGL2 gate and error panel, `?renderer=webgl2`, rebindable keys shown once in Attract, the Settings panel (Pitch, Tilt warnings, balls per game, Match %, volume, reset, SHA), the high-score table with initials entry, one versioned local save, the CSP and size budget enforced, the attribution ledger audited, and `v1.0.0` tagged.

**FRs covered:** FR-10, FR-49, FR-50, FR-51, FR-52, FR-53, FR-54, FR-55 · **NFRs:** NFR-4, NFR-6, NFR-7, NFR-8, NFR-9 · **ARs:** AR-31, AR-32, AR-33, AR-34 (full), AR-38, AR-39

### Story 6.1: Press-to-begin, the platform gate and the error panel

As a stranger with a link,
I want an unsupported browser to tell me which browsers work, a supported one to start with a single press, and any failure to show a clear message rather than a blank canvas,
So that the link never dead-ends.

**Acceptance Criteria:**

**Given** `host/boot.ts`
**When** the page loads
**Then** a press-to-begin panel renders before any asset request, WebGL2 availability is checked first, and an unsupported browser sees a message naming current Chrome, Edge and Safari on Windows and macOS

**Given** a supported browser
**When** the press-to-begin gesture occurs
**Then** the audio context unlocks, the engine is created once via `EngineFactory.CreateAsync` (WebGPU when available unless `?renderer=webgl2` or the Settings toggle forces WebGL2), assets load, and the Walk-up begins

**Given** an asset 404, a glb parse error, a collision-json assertion or engine creation failure
**When** it occurs during boot
**Then** the same host error panel renders with the stage and the error message, and the console log names the failing asset

**Given** WebGL context loss during play
**When** the browser restores it
**Then** Babylon's restore path rebuilds the scene while the sim has kept stepping, and play continues without a game reset

**Given** Firefox
**When** it loads the page
**Then** it is allowed through as best-effort with no gate message and no dedicated fixes

### Story 6.2: The local save with migrations

As a player,
I want my settings, key bindings and high scores kept in this browser and nowhere else, surviving updates,
So that the machine remembers me without an account or a network.

**Acceptance Criteria:**

**Given** `host/persistence/`
**When** the save is written
**Then** one `localStorage` key `dragonwar.save` holds `{ v, settings, keybindings, highscores }` and no other key is used

**Given** a save with an older `v`
**When** it is loaded
**Then** a forward-migration function per version bump upgrades it, a test covers each migration, and an unreadable document falls back to factory defaults without throwing

**Given** the site data is cleared
**When** the page loads
**Then** the machine is at factory settings, default keys and an empty high-score table

**Given** `GameStart { seed, tuning, adjustments, highscores }`
**When** a game starts
**Then** it is the only object the host hands `sim/loop`, `highscores` is read-only inside `sim/`, and dependency-cruiser confirms nothing under `src/sim/` references `localStorage`

**Given** the CSP `connect-src 'self' blob:`
**When** the game runs through a full session
**Then** the network panel shows no request after the initial asset load

### Story 6.3: The Settings panel

As a player,
I want to set the Pitch, Tilt warnings, balls per game, Match probability and volume, force WebGL2, reset to defaults and see which build I'm on,
So that the machine is mine to adjust.

**Acceptance Criteria:**

**Given** Escape (or the bound `menu` action)
**When** pressed in Attract or during a game
**Then** the Settings panel opens over the scene, pausing input to the sim, and closes on Escape again

**Given** the sim adjustments Pitch (6.0–8.5°, default 6.5), Tilt warnings (default 1), balls per game (default 3) and Match % (default 8)
**When** one is changed
**Then** it is stored as a player override in the layered store (table defaults → preset slot, empty in v1 → player overrides), persisted, and applied via `GameStart.adjustments` at the next game; a steeper Pitch is visibly faster on the next ball

**Given** volume and the renderer toggle
**When** changed
**Then** volume applies immediately to the audio graph and the renderer toggle takes effect on next load, both persisted

**Given** reset-to-defaults
**When** pressed
**Then** every adjustment, host setting and key binding returns to factory without touching high scores

**Given** the build
**When** the panel is open
**Then** the commit SHA stamped at build time is shown

### Story 6.4: Rebindable keys shown in Attract

As a player,
I want to rebind every control and see the current bindings once in Attract,
So that the keyboard works the way I want and a stranger knows which keys flip.

**Acceptance Criteria:**

**Given** the Settings panel
**When** the player rebinds `flipper_l`, `flipper_r`, `plunger`, `nudge_l`, `nudge_r`, `nudge_up`, `start` or `menu`
**Then** the next key pressed is captured, a key already bound to another action is refused with a message, and the binding is persisted and applied immediately

**Given** `host/input`
**When** bindings change
**Then** the key→action map is the only place key codes exist and `ViewConfig { bindings }` is passed to presentation

**Given** Attract
**When** it cycles
**Then** the Backglass shows the current flipper, plunge and Start keys once per cycle from `ViewConfig`, reflecting any rebinding

**Given** the defaults
**When** the save is reset
**Then** they are left/right Shift, Enter, Space and the arrow keys, 1 and Escape

### Story 6.5: The High-score table and initials entry

As a player,
I want a qualifying score to prompt me for three initials with the flippers and Start, and Attract to show the Grand Champion and the ranked table,
So that a good game is remembered.

**Acceptance Criteria:**

**Given** `game_over` and a player's score exceeding an entry in `machine.highscores`
**When** the phase advances
**Then** rules enter `highscore_entry` for that player, the Backglass shows three initial slots, `flipper_l`/`flipper_r` button presses change the letter, Start confirms each slot, and `initialsTimeoutMs` confirms the current letters on expiry

**Given** the initials are confirmed
**When** rules finish the phase
**Then** `highscore_entered { player, initials, score, rank, grandChampion }` fires, the host persists the updated table to `dragonwar.save` on that event and nothing else, and the next qualifying player is prompted in turn

**Given** the Grand Champion and a ranked list of `highscoreCount` entries
**When** a score qualifies
**Then** it is inserted at its rank, the lowest entry drops, and a Grand Champion beat replaces the champion

**Given** Attract
**When** it cycles
**Then** the Backglass shows the Grand Champion and the ranked table, read from the persisted save via `GameStart.highscores`

### Story 6.6: The browser matrix and the feel ritual on both paths

As the author,
I want the game verified on Chrome, Edge and Safari on Windows and macOS, on both the WebGL2 and WebGPU paths, with the feel ritual passing on each,
So that "supported" is a checked claim and the WebGL2 floor is equal in feel, not degraded.

**Acceptance Criteria:**

**Given** the Pages URL
**When** loaded on current Chrome and Edge on Windows 11 and current Chrome and Safari on macOS current-1
**Then** each reaches the Walk-up and completes a three-ball game, and the matrix with versions and date is recorded in `docs/browser-matrix.md`

**Given** each browser
**When** `?renderer=webgl2` is added
**Then** the WebGL2 engine is used, the game is fully playable, and the feel ritual (cradling, flipper snap, rejection) records no difference from the default path

**Given** the replay goldens
**When** replayed in each browser
**Then** the `GameState` hash matches Node for every golden

**Given** the target hardware
**When** a full game is played on a mid-range 2022 laptop GPU
**Then** the frame rate stays at 60 FPS in the supported browsers, recorded with the machine's spec

### Story 6.7: Release — the ledger audit, licence headers and v1.0.0

As the author,
I want every file's provenance verified, licence headers checked in CI, and `v1.0.0` tagged and live on Pages,
So that the repository is public, free to distribute and infringes nobody.

**Acceptance Criteria:**

**Given** a CI check over `src/sim/physics/`
**When** it runs
**Then** every ported file carries its original vpx-js copyright header plus the DragonWar marker line, every other source file carries the GPL-3.0 header, and a missing or altered header fails the build

**Given** `ATTRIBUTIONS.md`
**When** an audit script compares it to the repository
**Then** every third-party or generated file under `src/`, `assets/`, `public/` and `tools/` has an entry with source, author, licence and verification date, no entry is non-commercial, GPL-2.0-only or unlicensed, and no asset originates from a commercial machine

**Given** `LICENSE`, `NOTICE` and `README.md`
**When** reviewed
**Then** the licence is GPL-3.0, the notice lists vpx-js, Babylon.js and MPF vocabulary with their licences, and the README links the Pages URL, the supported browsers and the controls

**Given** `main` passes CI
**When** `v1.0.0` is tagged
**Then** the tag's build is the one deployed to Pages, the Settings panel shows its SHA, and the size budget and CSP checks passed on that build

