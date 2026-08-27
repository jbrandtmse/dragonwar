---
id: SPEC-dragonwar
companions:
  - glossary.md
  - user-journeys.md
  - machine-behaviour.md
  - physics-tuning.md
  - design-principles.md
  - decisions-rejected.md
  - licensing.md
  - ../../planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md
  - ../../../CLAUDE.md
sources:
  - ../../planning-artifacts/prds/prd-dragonwar-2026-08-26/prd.md
  - ../../planning-artifacts/prds/prd-dragonwar-2026-08-26/addendum.md
  - ../../planning-artifacts/briefs/brief-dragonwar-2026-08-26/brief.md
  - ../../planning-artifacts/briefs/brief-dragonwar-2026-08-26/addendum.md
  - ../../planning-artifacts/architecture/architecture-dragonwar-2026-08-26/SOLUTION-DESIGN.md
  - ../../planning-artifacts/research/technical-pinball-simulation-engine-and-technology-2026-08-26/research.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# DragonWar

## Why

A vision to realise and an opportunity to claim. The vision: the author played one moment on a real machine — targets spell D‑R‑A‑G‑O‑N, the dragon opens its mouth, and multiball begins as the balls come out like fire — and wants that machine to exist: one complete, tuned, open-source pinball table that runs in a browser. You are a knight, the flippers are your weapon, and the war is the multiball itself. The opportunity: the browser 3D pinball field is empty at the top — the only serious browser port of Visual Pinball stopped in 2020, no WebGPU-native pinball project of any maturity exists, and the Visual Pinball ecosystem is Windows-first, install-bound and licence-encumbered — so a finished, free, click-and-play table is a genuine gift to that community and an on-ramp for newcomers. Affected: the author first (solo, hobby stakes), then virtual-pinball players and strangers with a link. Everything is judged by whether it serves the moment; being finished is the moat; DragonWar is a game, not an engine.

## Capabilities

Capability IDs mirror the PRD's FR numbers (CAP-N ≡ FR-N) so the architecture spine's `binds:` resolve directly. Vocabulary is defined in `glossary.md`; seam names (`s_…`, `c_…`, `show_…`, `…Ms`) are the spine's.

### Walk-up and presentation

- **CAP-1 Walk-up sequence**
  - **intent:** The Table plays the Walk-up — lit backbox and animating Backglass first, then the camera descends to the fixed playfield view — on first load and on every return to Attract, so the frame is set before a ball is plunged.
  - **success:** Backglass is visible and animating before the playfield is; the descent ends at the fixed view; pressing Start during the Walk-up skips to the playfield and starts a game.
- **CAP-2 Fixed playfield view**
  - **intent:** The player sees the Playfield from one authored point of view with no camera controls.
  - **success:** Both flippers, the Dragon, both Loops, the Ramp and the DRAGON bank are legible from that view; the Backglass remains visible as a strip at the top.
- **CAP-3 Backglass**
  - **intent:** An animated, pixelated, dot-matrix-style Backglass carries every Rules-layer state a player must act on and plays the war fiction in Attract.
  - **success:** Score(s), player-up and ball number, Mode prompts and timers, Jackpot value, Strikes remaining, Tilt warnings, Match and High-score entry each have a Backglass representation; the war fiction plays in Attract.
- **CAP-4 Correct proportions**
  - **intent:** Ball, flipper and Playfield are at real dimensions so size ratios and the walk-up silhouette read as a real machine.
  - **success:** Ball 26.99 mm, flipper bat 3.125 in rubbered, playfield 20.25 × 42.00 in (514.4 × 1066.8 mm), Pitch default 6.5°; the loader asserts playfield bounds and flipper lengths against these and fails on mismatch.

### Ball and flipper feel

- **CAP-5 Flipper technique**
  - **intent:** A player can cradle, live-catch, light-tap, dead-bounce, post-pass and backhand as on the Reference machine.
  - **success:** Holding a flipper button keeps a cradled ball cradled; a brief tap moves the flipper partially; the left flipper can backhand the Dragon; the three-item feel test (cradling, flipper snap, rejection/rebound) names no material difference or an accepted, documented one.
- **CAP-6 Velocity-dependent rebound**
  - **intent:** Rebounds off rubbers, posts and flippers are lively at low speed and never pingy or airball-prone at high speed.
  - **success:** After tuning, the feel test names no "pingy" difference on rebound; elasticity falloff is the primary control.
- **CAP-7 No tunnelling, no stalls**
  - **intent:** The ball never passes through Playfield geometry and the game never stalls, at any display frame rate.
  - **success:** Identical inputs produce identical outcomes at 30, 60 and 120 Hz display; owed simulated time beyond 200 ms is discarded (`sim_time_discarded`) rather than freezing or fast-forwarding.
- **CAP-8 Determinism**
  - **intent:** Ball physics has no artificial randomness; a recorded input sequence replays to the same outcome.
  - **success:** A replay (`ReplayHeader + InputTransition[]`) reproduces the state hash; the only randomness is seeded Rules-layer draws (Match, Skill-shot lane).
- **CAP-9 Deliberate hops**
  - **intent:** Occasional ball hops come from one explicit tuning control, not as an emergent by-product.
  - **success:** Control at zero produces no hops; the default produces occasional hops on hard hits; the control is neither scatter nor randomness.
- **CAP-10 Pitch as a Setting**
  - **intent:** The player can change Pitch within a bounded range and feel the difference.
  - **success:** Default 6.5°, range 6.0–8.5°; steeper Pitch makes the game visibly faster; the change applies at the next game.
- **CAP-11 Reliable switches**
  - **intent:** Rollovers, targets, the DRAGON bank, the Lock lane and the drain register fast balls without misses.
  - **success:** No ball is ever lost to a missed switch at any speed the Physics core can produce; switch zones test the ball's per-tick swept segment, never its end position.
- **CAP-12 Multiball ball-to-ball behaviour**
  - **intent:** Balls collide plausibly with each other during Quick multiball and the War.
  - **success:** Two balls never overlap or stick; collisions transfer momentum.

### Nudge and tilt

- **CAP-13 Nudge**
  - **intent:** The player can Nudge left, right and up from the keyboard, and the ball responds as to a cabinet movement.
  - **success:** A Nudge during a cradle can free the ball; a Nudge disturbs the Tilt bob; the ball keeps its inertia while the cabinet moves under it — never a force applied to the ball.
- **CAP-14 Tilt warnings**
  - **intent:** Repeated or hard Nudges produce per-player Tilt warnings on the Backglass, up to the Settings count.
  - **success:** Default 1 warning; warnings are counted per player in Hot seat; the bob's continued swing cannot produce two warnings inside the spacing window.
- **CAP-15 Tilt**
  - **intent:** Exceeding the warning count Tilts: flippers go dead, every ball drains, the End-of-ball bonus is forfeited, and the score is kept.
  - **success:** Score is never zeroed; during a multiball the ball ends when the last ball drains and the Mode ends with it; the next ball starts normally; Backglass shows TILT.
- **CAP-16 Slam tilt**
  - **intent:** Violent cabinet abuse triggers Slam tilt and ends all games in progress.
  - **success:** A tick-windowed nudge count in physics with its own threshold (`slamNudgesPerWindow`, never the bob's) closes `s_slam_tilt`; all players' games end; the Table returns to Attract; the event is inside the replay.

### Standard game flow

- **CAP-17 Start and Hot seat**
  - **intent:** Start begins a game; Start again before the first ball ends adds a player, up to four, each with independent state.
  - **success:** Letters, Lock credits, Modes played, Tilt warnings and bonus are per player; Backglass shows player-up; balls per game is a Setting (default 3).
- **CAP-18 Plunge and Skill shot**
  - **intent:** The player plunges manually with a variable-strength key hold on a launcher that is not bouncy, and can take the Skill shot before the ball is in play.
  - **success:** The lit Top lane rotates each plunge and awards a fixed value plus a letter; "plunged" is the opening of `s_shooter_lane`; the Skill shot closes on the next playfield switch closure that is not a Top lane; Backglass shows ARM YOURSELF at plunge.
- **CAP-19 Ball save**
  - **intent:** A drained ball is returned during a Ball save window that starts at the plunge, shows a hurry-up state before expiry, and keeps a Grace period past displayed expiry.
  - **success:** The timer starts on `ball_launched`, not on enable; drains inside the Grace period (default 2 s) still save; saved balls auto-launch; multiball Modes arm their own windows, the longest live window wins, Tilt disarms all.
- **CAP-20 End-of-ball bonus**
  - **intent:** Each ball accumulates bonus by category (letters, Loops, Strikes), multiplied by the Bonus multiplier, paid at ball end unless tilted.
  - **success:** Completing the Top lanes advances the multiplier 2×→3×→5× (cap), reset each ball; Backglass counts the bonus down; Tilt pays nothing.
- **CAP-21 Extra ball**
  - **intent:** Extra balls are awarded from a menu of long-horizon achievements, not a single lane.
  - **success:** At least three achievements light Extra ball (win a War, complete a Joust at full Charge, play every Mode once); collected at the Right Loop; Extra-ball Inserts are purple.
- **CAP-22 Match**
  - **intent:** At game end a multiple-of-ten Match draw against each player's last two score digits awards a free game.
  - **success:** The number is always a multiple of ten; probability is a Setting defaulting to 8 %; drawn from the seeded rules PRNG; under v1 free play the award is display-only.
- **CAP-23 Ball search**
  - **intent:** When no switch closes during play, the Table runs an escalating Ball search and, on failure, serves a new ball.
  - **success:** Triggers after 15 s; escalates through per-device `ballSearchOrder` pulses to `RecoverCommand`; never releases locked balls while a Mode timer runs; emits `ball_missing { count }`.
- **CAP-24 Game over and Attract**
  - **intent:** After the last ball the Table shows scores, offers High-score entry where earned, runs Match, and returns to Attract with the Walk-up.
  - **success:** Attract cycles Backglass animations and the High-score table and shows the flipper keys once.
- **CAP-25 Lane change**
  - **intent:** Flipper buttons rotate the lit Insert across the inlane/outlane set and the Top lanes.
  - **success:** The lit lane moves one position per flipper press.

### Shot map and playfield devices

- **CAP-26 Loops**
  - **intent:** A Left Loop and a Right Loop — distinguishable shots whose exits feed straight toward the flippers — with the Spinner on one Loop only, making it the loud one and the other the quiet return.
  - **success:** The Spinner on the Left Loop awards per rotation; each Loop is a declared switch sequence with a tick window (`shot_left_loop`, `shot_right_loop`).
- **CAP-27 Ramp**
  - **intent:** One Ramp whose completion lights Modes (the qualifier) and returns the ball to an inlane.
  - **success:** Each Ramp shot advances the light-a-Mode progression; a Ramp miss returns to a flipper.
- **CAP-28 DRAGON bank**
  - **intent:** A six-target drop bank: each target down lights its letter; all six down spell DRAGON, award, and reset the bank.
  - **success:** Letters persist per player across balls; a dropped target is non-collidable until the bank resets (`c_dragon_bank_reset` on `bank_completed` and on `ball_will_start`); during the War a full bank counts as Strikes instead of letters.
- **CAP-29 Dragon, Lock lane, Mouth**
  - **intent:** The Dragon is an off-centre bash target with the Lock lane between its legs and the Mouth as the Lock's eject, so one lane holds two shots separated by precision.
  - **success:** A rejection off the Dragon deflects toward a flipper, not the drain; a precise Lock-lane shot enters the Lock and a slightly-off shot hits the body; the Mouth fires balls upward and out toward the flippers; the right flipper takes the Dragon straight and the left flipper backhands it.
- **CAP-30 Dragon animation**
  - **intent:** The Dragon opens its Mouth whenever the Mouth ejects, holds it open for the War start, and reacts visibly to every hit.
  - **success:** `show_dragon_mouth_open` precedes every eject by `mouthOpenLeadMs`; a Strike produces a visible reaction; v1 scope is mouth open/close plus one hit reaction, no idle animation.
- **CAP-31 Standard devices**
  - **intent:** The Playfield has two slingshots, pop bumpers, three Top lanes, two inlanes, two outlanes and a plunger lane.
  - **success:** Pops and slings score and disturb the ball as hardware rules in physics; outlanes drain; ball guides end at rubber posts, never bare metal.
- **CAP-32 Lawlor's test**
  - **intent:** Every shot's miss comes back playable.
  - **success:** Verified per shot in the feel test; no shot's most common rejection is a centre drain.

### Feature modes

Five Modes form a knight's campaign in fiction — arm yourself, answer the call, fight the monster, joust, war — but are independently available; escalation lives in fiction and scoring, not gating.

- **CAP-33 Mode lighting and start**
  - **intent:** Ramp completions light Modes in campaign order (Hurry-up, then Quick multiball, then Joust); a lit Mode starts when the ball enters the Lock lane.
  - **success:** With several Modes lit the player selects with the flipper buttons inside `modeSelectMs` while the ball stays parked, and Start or either flipper confirms; when lock and mode start both apply, the lock is credited first and the Mode runs with the newly served ball; a Mode can be played again once all three have been played.
- **CAP-34 Hurry-up**
  - **intent:** A timed Mode whose value decays until collected at the Ramp. Fiction: a call to arms.
  - **success:** 250,000 decaying to a 50,000 floor over 20 s; Backglass shows the decaying value; the Ramp Insert is red while it runs; its timer keeps running under a multiball.
- **CAP-35 Quick multiball**
  - **intent:** A 2-ball multiball with its own Ball save, awarding on Dragon hits and Ramp shots. Fiction: fight the monster.
  - **success:** Ends when one ball remains; the Lock is disabled, so a Lock-lane entry is a bash hit, not a lock; neither a War nor a lock can start inside it; it cannot start during the War; its Inserts are green.
- **CAP-36 Joust**
  - **intent:** Alternating Loop shots build the Charge; a miss or the same Loop twice breaks it. Fiction: the charge.
  - **success:** Charge multiplies the Loop award up to 10×; Backglass shows CHARGE ×N; Joust Inserts are blue.
- **CAP-37 Locking balls**
  - **intent:** A Lock-lane shot locks the ball whenever the player has fewer than two Lock credits and no multiball is running; credits are per player, backed by one physical Lock.
  - **success:** The locking player's credit rises by one and a new ball is served; if the Lock is physically full of another player's balls it ejects one (`lock_lane_spit`) and the credit still counts; the Lock Insert is orange while lockable.
- **CAP-38 The War (Dragon-fire multiball)**
  - **intent:** The War starts the instant the current player has both DRAGON spelled and two Lock credits, whichever completes last — the founding moment, whether the letters or the lock come last.
  - **success:** The Mouth opens and fires every ball in the Lock; the trough auto-launches the difference to reach three in play; the Lock is disabled so a Lock-lane shot counts as a Strike; War Inserts are orange; the War start is the brightest, loudest event on the table.
- **CAP-39 Winning the War and the Jackpot**
  - **intent:** Each Dragon hit during the War is a Strike; enough Strikes win the War and pay the Jackpot on the winning Strike.
  - **success:** 10 Strikes win; each further Strike in the same War re-awards the Jackpot; the Jackpot is progressive — 500,000 base plus 500,000 per War started this game, seeded per player; Backglass shows Strikes remaining; winning lights Extra ball once per game.
- **CAP-40 War end and re-qualification**
  - **intent:** The War ends when one ball remains; letters and Lock credits reset so a second War must be earned again.
  - **success:** DRAGON letters reset and Lock credits return to zero at War end; the Jackpot seed carries.
- **CAP-41 Mode stacking priority**
  - **intent:** When Modes overlap, the War takes presentation priority, then Quick multiball, then timed Modes; scoring from all active Modes accrues.
  - **success:** Unique priorities — base 100, Skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, War 500; Backglass shows the highest-priority Mode; a Hurry-up timer keeps running under a multiball; `modes[]` is empty between balls.

### Lighting and colour grammar

- **CAP-42 Four lighting channels**
  - **intent:** GI, feature Inserts, Flashers and Architectural lighting are driven independently by the Rules layer.
  - **success:** GI dims during the War without affecting Inserts; Flashers have duty-cycle limits and never stay on.
- **CAP-43 Inserts as lights**
  - **intent:** Inserts are lights beneath the translucent Playfield through a cup, not decals.
  - **success:** An Insert glows and spills onto adjacent playfield art; the design envelope is 50–150 individually addressable Inserts; every `l_` node carries lens and cup geometry and the playfield material carries a translucency mask.
- **CAP-44 Colour grammar (held)**
  - **intent:** Insert colour is the mode-state channel a player reads without instructions, and the mapping never varies.
  - **success:** White = shot lit / qualifying; red = Hurry-up; green = Quick multiball; blue = Joust; orange = DRAGON letters, Lock and the War; purple = Extra ball / special; Jackpot progression is a brightness/blink ladder within the Mode colour; rules emit roles (`lit, hurryup, quickmb, joust, dragon, special`) and steps 0–3, never RGB, and `grammar.ts` is the single role→colour table.
- **CAP-45 Flashers on events**
  - **intent:** Flashers fire on Mode starts, locks, the Mouth ejecting, Jackpot and Tilt.
  - **success:** The War start is the brightest event on the table; every `FlasherCommand` carries a duration honoured by the driver's duty-cycle limiter.

### Audio

- **CAP-46 Mechanical sounds**
  - **intent:** Flippers, slingshots, pops, the DRAGON bank drop and reset, the Lock, the Mouth, and the ball on wood and rubber each produce a sound driven by contacts and ball velocity.
  - **success:** Flipper snap is audible at every press and never during Tilt; ball roll varies with speed and surface as one continuous voice per ball; every mechanical sound has exactly one source (`ContactEvent`).
- **CAP-47 Swappable audio assets**
  - **intent:** Every sound is addressed by name so the author's recorded Reference-machine sounds can replace generated ones later without touching game logic.
  - **success:** Replacing a sound file (or swapping a synth for a sample in `AudioAssetProvider`) changes the sound and nothing else.
- **CAP-48 Mode and Backglass cues**
  - **intent:** Mode start, locks, War start, Jackpot, Tilt and Match each have an audio cue.
  - **success:** Cues fire from `ShowCommand` only; the War start cue is distinct from everything else; cues are short generated stings — no music, no speech.

### Input, settings and persistence

- **CAP-49 Keyboard control**
  - **intent:** The Table is fully playable from a rebindable keyboard.
  - **success:** Defaults — left/right Shift for flippers, Enter to plunge (hold for strength), Space/arrow keys to Nudge, 1 for Start, Escape for Settings; Attract shows the current bindings once; bindings persist; key codes never enter `sim/`.
- **CAP-50 Settings**
  - **intent:** The player can set Pitch, Tilt warning count, balls per game, Match probability and volume, persisted across sessions.
  - **success:** Sim adjustments apply at the next game; volume and key bindings apply immediately; a reset-to-defaults exists; the build's commit SHA is shown.
- **CAP-51 High-score table**
  - **intent:** The Table keeps a Grand Champion and a ranked High-score table with three-initial entry via the flippers and Start, persisted locally.
  - **success:** A qualifying score prompts initials entry at game end (rules own the phase; the host persists on `highscore_entered` and nothing else); Attract cycles the table.
- **CAP-52 Local-only persistence**
  - **intent:** Persistence is per browser, with no accounts and no network.
  - **success:** One versioned `localStorage` document with forward migration; clearing site data resets the machine to factory; nothing is transmitted.

### Distribution

- **CAP-53 Link-playable**
  - **intent:** The Table loads and plays from a URL with no install, plugin or account.
  - **success:** A stranger reaches the Walk-up from the link with only a press-to-begin gesture between; the build is a static `dist/` with relative paths deployed to GitHub Pages.
- **CAP-54 Browser support**
  - **intent:** Current Chrome, Edge and Safari on Windows and macOS are supported; Firefox is best-effort; WebGL2 is the floor and WebGPU an enhancement.
  - **success:** An unsupported browser gets a message naming supported ones before any asset loads; the WebGL2 path is fully playable and equal in feel; WebGPU improves lighting quality only and never changes gameplay; `?renderer=webgl2` and a Settings toggle force the floor.
- **CAP-55 Open-source release**
  - **intent:** The repository is public under GPL-3.0 with a clean, verified attribution ledger.
  - **success:** Every third-party file and generated asset is in `ATTRIBUTIONS.md` with source, author, licence and verification date before it enters; ported files keep their original notices plus the DragonWar marker, checked per file in CI; `v1.0.0` is tagged.

## Constraints

**Product**

- Everything is judged by whether it serves the moment; feel wins over fidelity wherever the two conflict; the feel test (UJ-4) is the acceptance bar and tuning past an accepted result is waste.
- One table, built properly: no `Table` interface, table-loading API, plugin or registration API — `sim/table/dragonwar.ts` is imported directly wherever a device is named.
- Real dimensions are non-negotiable (CAP-4) and asserted at load; art is stylized — simplified geometry, hand-painted textures, a single LOD — and realism lives in proportions, insert glow and the ball, not polygon count.
- Ball-count grammar: 3-ball for the War, 2-ball Quick multiball, 4-ball reserved for a later finale; the machine carries 4 balls, asserted at boot.
- The colour grammar is held (CAP-44); the rustic register lives in the art, the grammar lives in the light — no muted inserts.
- Randomness is tuned down: scatter 0 on every material; hops from one explicit control; no randomness in physics.
- Do-not-invent numbers ship marked `unverified` and change only by measurement against the Reference machine: steel-on-clearcoat and steel-on-rubber restitution and friction, manufacturer coil pulse duration, flipper tip gap, a dimensioned drain zone. (Match 8 % is a deliberate choice, not a measurement — it stays a Setting.)

**Architecture** — binding detail is AD-1..AD-19 in `ARCHITECTURE-SPINE.md`; these are the calls that bend everything else:

- Layer separation: Physics (the cabinet) emits switch events → Rules (the game CPU, a pure function of switches, blind to ball velocity) → Presentation (drivers). `sim/**` is DOM-free, Babylon-free, wall-clock-free and unseeded-random-free, enforced by dependency-cruiser in CI.
- Physics is an analytic time-of-impact core ported from `vpdb/vpx-js` (commit `e8a6d6f`) at a fixed 1000 Hz — `TICK_HZ` is one constant, 480 Hz only if spike 1 fails; solver constants are ported verbatim and are not tunable; general rigid-body engines (`@babylonjs/havok` included) are banned.
- Renderer is Babylon.js (Apache-2.0); no feature may require WebGPU.
- Rules vocabulary is MPF-shaped (device prefixes, four-phase events, `multiball_lock` semantics); the Lock, ball save and the multiball flag each have a single arbiter.
- Audio sits behind a named swappable asset interface from day one; flashers are coil-class with duty-cycle limits, never on the insert layer.
- Blender owns geometry and placement; `TABLE` owns devices, wiring, groups and tunables; `tools/export.py` enforces the contract; static meshes carry standard lightmap UVs (`TEXCOORD_1`) from the first model — never camera-projected.
- Browser-first static bundle: relative paths, CSP `default-src 'self'; connect-src 'none'`, no service worker, no network after load — so Tauri can wrap the same `dist/` later.
- Keyboard only; local-only persistence; English only; rebindable keys are the sole accessibility feature.

**Non-functional** — NFR ids as the spine binds them:

- NFR-1 Stable 60 FPS in the supported browsers on a mid-range laptop GPU from 2022 or later; physics decoupled from render rate.
- NFR-2 Fixed timestep in the 480–1000 Hz band; nothing tunnels at any display rate.
- NFR-3 Flipper response within one 60 Hz frame of key press (≤ 16 ms added); the flipper loop is entirely local (a hardware rule in physics).
- NFR-4 First playable Walk-up within 10 s on 50 Mbps; compressed initial payload ≤ 20 MB, enforced in CI as the proxy.
- NFR-5 The Rules layer runs headless; identical inputs replay identically to a state hash.
- NFR-6 Windows 11 and macOS current-1 in current Chrome, Edge and Safari; Firefox best-effort; no mobile or Linux commitment.
- NFR-7 Local browser storage only; no network calls after load.
- NFR-8 English only; rebindable keys are the only accessibility feature.
- NFR-9 Provenance (`CLAUDE.md`) is a hard requirement: the `ATTRIBUTIONS.md` entry lands before the file; the licence is verified at its source, never from package metadata; nothing unlicensed, non-commercial, GPL-2.0-only, or from a commercial machine; `vpinball/vpinball` only from files headed `// license:GPLv3+`; author recordings of generic mechanical noise only. Compatibility detail in `licensing.md`.

**Process**

- Sequencing for epics: (1) one ball, two flippers and a bare Playfield at real dimensions, with the feel test starting and never stopping and spikes 1 and 3 run; (2) full shot map geometry and standard game flow; (3) the Modes and the War; (4) presentation depth — lighting bake, Backglass animation, audio; (5) art passes, phased, allowed to trail. Nothing in (1)–(3) waits on art; epic 1 ships a placeholder `.blend` of primitives that already follows every node prefix.
- Spike 1 (the ported loop at 1 kHz over six bodies inside the frame budget) and spike 3 (measured build size and load) gate the browser-first premise and are **epic 1's first two stories** — nothing else in epic 1 lands before they do (owner author). Spike 2 (lightmap scaling envelope) runs before the light-group partition freezes.
- Scoring values (CAP-20, CAP-34, CAP-36, CAP-39) and Strike count are starting values until the first full playtest of epic 3, when they freeze and their tuning entries move to `confidence: playtested`.
- Decision freshness: renderer, WebGPU support and Node line re-checked by 2026-09-26; ecosystem health (vpx-js dormancy, Babylon cadence) by 2027-02-26; competitive landscape by 2027-08-26. Machine geometry and ball spec do not go stale.

## Non-goals

- Not an engine: no table editor, plugin system or support for other tables — the boundary most likely to erode.
- Not a recreation: no ROM emulation and no recreation of any commercial machine or its assets.
- Not a platform: no accounts, online multiplayer, global leaderboards or telemetry.
- Not photoreal — and not a non-realistic (flat-shaded, cel-shaded, exaggerated) language either; that would be a different product.
- Not mobile, VR, cabinet hardware, physical controllers or gamepad.
- Not tuned forever: feel is accepted by the feel test, not by an open-ended pursuit of realism.
- Deferred past v1 (nothing in the spine blocks them): final wizard mode and the 4-ball finale (emotionally load-bearing — revisit once v1 is playable end-to-end, as commercial machines ship their deepest modes in later code updates); recorded Reference-machine sounds (the interface is built now); music and speech callouts; full operator/service menu, presets and Competition mode; Tauri packaging; a table-authoring path; a Web Worker for the sim; camera presets or a free camera; credits and free-play accounting; all-four-browser support.
- Not optimised for (counter-metrics): feature count, visual fidelity, physics tick rate or engine sophistication, tuning time past an accepted feel-test result.

## Success signal

- **SM-1** The author plays it for fun, unprompted, after it is finished.
- **SM-2** The dragon-fire moment lands — CAP-30, CAP-37–40, CAP-45 and CAP-48 together produce the feeling that started the project, by the author's judgement.
- **SM-3** A stranger on Windows or macOS plays from a link with no install and no explanation — a link test, no help given (UJ-2).
- **SM-4** It holds up against the Reference machine: the feel test (UJ-4) judges cradling, flipper snap and shot rejection/rebound each "no material difference" or an accepted, documented difference — on both the WebGL2 and WebGPU paths.
- **SM-5** Finished and released: repository public, `v1.0.0` tagged, attribution ledger clean.

## Assumptions

Every starting value in the capabilities (rules, scoring, defaults, key bindings, NFR targets, mode priorities) was confirmed by the author on 2026-08-27; they remain tunables carrying `source` and `confidence` in code and freeze per OQ-3. What is still genuinely unconfirmed:

- CAP-27 — the Ramp's return side (decided in epic 2 geometry).
- CAP-33/37 — the Lock arbiter's evaluation order in `machine-behaviour.md` (multiball → lock → mode start), and that a Lock-lane entry with two credits, no Mode lit and no multiball simply ejects with no award — accepted readings of AD-18, which names the four outcomes but not their precedence or this case.
- NFR-4 — the 20 MB compressed payload budget, until spike 3 re-sets it; the 20-live-light budget on the WebGL2 floor, until spike 2 measures the envelope; a single `dragonwar.glb`, until spike 3's load profile.
- Physical figures below high confidence (`physics-tuning.md`): ball mass ~80 g and bat 3.000 in bare (VPE documentation); flipper pivot geometry (hobbyist-sourced); rubber 45–50 Shore A (low); flipper pulse ~30 ms at 70 % then 25 % hold (MPF documentation example, a calibration reference only).

## Open Questions

- **OQ-5** Does the Lock lane carry both the lock and the mode start cleanly in the drawn geometry? Left open by choice (2026-08-27). Fallback: a separate scoop with the Mouth as eject only — a `TABLE` and geometry change, not an architecture change. Owner: epic 2 geometry.
- **OQ-6** Playfield geometry, drawn from the reference dimensions alone — no Bally template will be sourced (2026-08-27; supersedes the spine's Deferred note recommending one). First the flipper tip gap, outlane widths and post positions — the one unmeasured quantity in the drain triangle — then Loop entries and exits, Ramp height and return, the Dragon's exact position and the Lock lane beneath it, pops, slings, the DRAGON bank and Top lanes. Epic 2's first design problem; iterates with the rules.

Closed, recorded so they are not re-opened: OQ-1 the Reference machine is Stern's *Dungeons & Dragons* (2026-08-27); OQ-2 Match 8 % chosen deliberately (2026-08-27); OQ-3 scoring values freeze after the first full playtest of epic 3 (2026-08-27); OQ-4 slam tilt (AD-5 → CAP-16); OQ-7 ball-roll audio (the seam is AD-13; synthesis technique presentation-internal); OQ-8 spikes 1 and 3 are epic 1's first two stories (2026-08-27); the renderer/WebGPU/Node re-check stays dated 2026-09-26.
