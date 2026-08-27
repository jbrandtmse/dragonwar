---
title: 'PRD: DragonWar'
status: final
created: '2026-08-26'
updated: '2026-08-26'
---

# PRD: DragonWar

*Working title — confirmed by the author.*

## 0. Document Purpose

This PRD is written for the author (solo, hobby stakes) and for the two workflows that consume it next: `bmad-architecture` and `bmad-create-epics-and-stories`. It builds on the product brief and its addendum (`_bmad-output/planning-artifacts/briefs/brief-dragonwar-2026-08-26/`) and the technical research (`_bmad-output/planning-artifacts/research/technical-pinball-simulation-engine-and-technology-2026-08-26/research.md`); it does not repeat them. Vocabulary is anchored in §3 Glossary; features are grouped in §4 with globally numbered FRs; inferences are tagged inline as `[ASSUMPTION]` and indexed in §11. Technical direction, tuning values, options considered, and licensing detail live in `addendum.md` beside this file; where the addendum is more specific than an FR, the FR governs.

One judging principle governs every decision in this document, carried verbatim from the brief: **everything is judged by whether it serves the moment** — targets spell D‑R‑A‑G‑O‑N, the dragon opens its mouth, and multiball begins as the balls come out like fire.

## 1. Vision

DragonWar is a single, complete, open-source pinball table that runs in a browser — one machine, built properly, rather than a platform hosting many. You walk up to it, the backbox is lit, the camera settles onto the playfield, and you play. You are a knight, the flippers are your weapon, and the war is the multiball itself: lock two balls under the dragon and spell DRAGON on the drop bank — in either order — and the moment both are true the dragon opens its mouth and spits your balls back at you as fire. Every flip during multiball is a strike against the dragon; land enough and you win the war and collect the jackpot. Four qualifying modes — arm yourself, answer the call, fight the monster, joust — give the table depth around that headline.

"Realistic" is replaced with four checkable criteria: it feels like real pinball and stays playable (feel wins over fidelity wherever the two conflict); the approach (backbox and backglass first, then the descent); lights and sound of a real machine; correct ball behaviour, bouncing, rebounding, and sometimes hopping. Realism lives in real dimensions, the insert glow, and the ball — not the polygon count. The author has a real machine within walking distance; "feels right" is an acceptance step someone can perform, not an opinion.

The bet is not technical novelty. The field is empty at the top, not contested: browser pinball exists, but no browser 3D pinball is cited anywhere as a physics benchmark and no WebGPU-native pinball project of any maturity exists. Being finished is the moat. DragonWar is a game, not an engine, and shipping one excellent table is the whole job.

## 2. Target User

### 2.1 Jobs To Be Done

- **The author** (primary): build the machine they wanted to exist, then play it for fun, unprompted, after it is finished. Functional: a table with real feel. Emotional: the dragon-fire moment lands.
- **A virtual-pinball player**: play a finished, free table from a link with no install, no Windows requirement, no ROM hunting — an on-ramp to the hobby that the Visual Pinball ecosystem cannot offer.
- **A stranger with a link**: understand what to do without instructions, because the table reads like a real machine.

### 2.2 Non-Users (v1)

Table authors and modders (no editor, no plugin path); cabinet owners wanting physical controls; mobile and VR players; anyone wanting a recreation of a commercial machine.

### 2.3 Key User Journeys

- **UJ-1. The author walks up and goes to war.** They open the link on their Mac after playing the Reference machine at the bar. The Walk-up plays: Backglass lit and animating the war, then the camera descends to the fixed playfield view. They press Start, plunge for the Skill shot, shoot the Lock lane twice, knock down five letters — and on the sixth drop target the Dragon opens its Mouth and fires three balls at them. They cradle one, backhand the Dragon with the left flipper, land the tenth Strike, and the Jackpot lands. **Climax:** the balls they locked come back at them as fire. **Resolution:** End-of-ball bonus, next ball, and afterwards they can name what differed from the bar machine on cradling, flipper snap, and rejection.
- **UJ-2. A stranger plays from a link.** Someone on Windows in Chrome clicks a link a friend sent. No install, no explanation. The Walk-up tells them it is a pinball machine; the Backglass tells them there is a dragon; the flipper keys are shown once in Attract. They play a three-ball game, tilt once, get a Match, and enter initials on a high score. **Edge case:** Safari on macOS gets the same table on the WebGL2 path; an unsupported browser gets a clear message naming the supported ones rather than a broken canvas.
- **UJ-3. Two friends on the couch.** Start pressed twice before the first ball ends → two-player Hot seat. Per-player state (letters, Lock credits, Modes played, Tilt warnings) is independent; the Backglass names whose ball it is. **Edge case:** player 1 drains with two balls in the Lock; player 2's Lock credits are still zero, and when player 2 eventually starts a War the trough tops up whatever the Lock cannot supply. A Slam tilt ends both games.
- **UJ-4. The feel test (development ritual, not a milestone).** Throughout development the author plays the Reference machine, then the build, and names what differs on three things: cradling, flipper snap, and how shots reject and rebound. Each named difference becomes a tuning change or a documented acceptance. Realises SM-4.

## 3. Glossary

- **Table** — the whole DragonWar machine as presented: cabinet, backbox, Backglass, Playfield.
- **Playfield** — the standard-body playing surface (20.25 × 42.00 in) with its devices, at an exposed Pitch.
- **Pitch** — the playfield incline angle; a player-facing difficulty Setting (default 6.5°).
- **Walk-up** — the presentation sequence on load and in Attract: backbox and Backglass first, then the camera descends to the fixed playfield view.
- **Attract** — the idle state between games: the Walk-up, Backglass animations, the High-score table, and the key bindings shown once.
- **Backglass** — the animated, pixelated, dot-matrix-style display in the backbox; carries scores, player number, mode prompts, and the war fiction.
- **Physics core** — the simulation that moves balls and flippers and emits Switch events. It has no knowledge of rules.
- **Rules layer** — a pure function of Switch events → game state → Presentation commands. It has no knowledge of ball velocity.
- **Presentation** — lights, Backglass, audio, and camera driven by Rules layer commands.
- **Switch event** — a discrete signal from the Physics core that a ball has hit, entered, or left a device.
- **Insert** — a lamp beneath the translucent playfield, the atomic unit of game-state display; its colour follows the Colour grammar.
- **GI** — general illumination: the ambient playfield lamps.
- **Flasher** — a high-intensity coil-class lamp used for events, with duty-cycle limits.
- **Architectural lighting** — backbox, arch, and cabinet lamps not tied to game state.
- **Colour grammar** — the held mapping from Insert colour to game state (FR-44).
- **Mode** — any of Skill shot, Hurry-up, Quick multiball, Joust, War. Modes are independently available.
- **Skill shot** — the award available on the plunge before the ball is in play. Fiction: arming oneself.
- **Hurry-up** — a timed mode whose value decays until collected. Fiction: a call to arms.
- **Quick multiball** — a 2-ball multiball mode. Fiction: fight the monster.
- **Joust** — a mode built on alternating Loop shots; consecutive alternating Loops build the Charge. Fiction: the charge.
- **Charge** — the Joust's combo counter; broken by a miss or by repeating the same Loop.
- **War** — Dragon-fire multiball, the headline 3-ball mode; every Dragon hit is a Strike; enough Strikes win the War.
- **Strike** — one Dragon hit during the War.
- **Jackpot** — the award for winning the War; progressive, seeded by prior play.
- **Loop** — either of the two orbit shots (Left Loop, Right Loop); the Spinner is on one of them.
- **Spinner** — a rotating target on one Loop that awards per rotation; makes that Loop "the loud one".
- **Ramp** — the flow shot that lights Modes (the qualifier).
- **Top lanes** — the set of rollover lanes at the top of the Playfield; the Skill shot target and the Bonus multiplier advance.
- **DRAGON bank** — a single six-target drop-target bank; knocking all six down spells DRAGON and resets the bank.
- **Dragon** — the off-centre bash toy; the table's protagonist. Right flipper takes it straight; left flipper backhands it.
- **Lock lane** — the lane between the Dragon's legs; a precise shot enters it, a slightly-off shot hits the Dragon body.
- **Lock** — the physical ball lock beneath the Dragon, holding up to two balls out of play.
- **Lock credit** — a per-player count (0–2) of balls that player has locked; the War needs two.
- **Mouth** — the Lock's eject: a vertical up-kicker that fires locked balls out of the Dragon's mouth.
- **Ball save** — a period after launch during which a drained ball is returned; has a Grace period and a hurry-up state.
- **Grace period** — the interval past the displayed Ball save expiry during which drains still save.
- **Nudge** — a player-applied cabinet movement (left, right, up) that the ball responds to.
- **Tilt bob** — the pendulum sensor Nudges disturb; produces Tilt warnings and then a Tilt.
- **Tilt warning** — a per-player warning before a Tilt; count is a Setting.
- **Tilt** — ends the ball and forfeits the End-of-ball bonus; does not zero the score.
- **Slam tilt** — a separate cabinet-abuse sensor that ends all games in progress.
- **Ball search** — the escalating protocol the machine runs when a ball is missing.
- **End-of-ball bonus** — per-ball accumulated award, multiplied by the Bonus multiplier, paid at ball end unless tilted.
- **Bonus multiplier** — the per-ball multiplier on the End-of-ball bonus, advanced by completing the Top lanes.
- **Extra ball** — an additional ball awarded from a menu of long-horizon achievements.
- **Match** — the end-of-game draw against the last two score digits; always a multiple of ten.
- **Hot seat** — 1–4 players taking turns on one Table.
- **Settings** — the player-facing adjustments that persist locally (Pitch, Tilt warning count, balls per game, Match probability, volume, key bindings).
- **High-score table** — Grand Champion plus a ranked list with three-initial entry, persisted locally.
- **Reference machine** — the modern Stern/JJP-era machine within walking distance of the author, used for the feel test.

## 4. Features

### 4.1 Walk-up and Presentation

**Description:** The Walk-up is a first-class feature — the first thing anyone feels. On load and whenever the Table is idle, the camera holds on the lit backbox and the Backglass establishes the war before a ball is plunged, then descends to a single fixed playfield view. The Table has correct silhouette and scale: cabinet proportions, backbox height, the glass. Art is stylized — simplified geometry and hand-painted textures — with real-world dimensions and real lighting behaviour preserved. Realises UJ-1, UJ-2.

#### FR-1: Walk-up sequence
The Table plays the Walk-up on first load and on return to Attract. **Consequences:** Backglass is visible and animating before the playfield is; the descent ends at the fixed playfield view; pressing Start during the Walk-up skips to the playfield and starts a game.

#### FR-2: Fixed playfield view
The player sees the Playfield from one authored point of view with no camera controls in v1. **Consequences:** both flippers, the Dragon, both Loops, the Ramp and the DRAGON bank are legible from that view; the Backglass remains visible. `[ASSUMPTION: the Backglass is shown as a strip at the top of the fixed view, as commercial sims do.]`

#### FR-3: Backglass
The Backglass is animated, pixelated and dot-matrix-style, and carries: current score(s), player-up and ball number, Mode prompts and timers, Jackpot value, Strikes remaining, Tilt warnings, Match, and High-score entry. **Consequences:** every Rules-layer state a player needs to act on has a Backglass representation; the war fiction plays in Attract.

#### FR-4: Correct proportions
Ball, flipper, and Playfield dimensions match the real values (ball 26.99 mm; flipper bat 3.125 in rubbered; playfield 20.25 × 42.00 in; Pitch default 6.5°). **Consequences:** ball-to-flipper and ball-to-playfield size ratios are the real ones; the cabinet and backbox read at real scale in the Walk-up.

### 4.2 Ball and Flipper Feel

**Description:** This is where the project's schedule will actually go, and the feel test (UJ-4) is its acceptance bar. Flippers are real bodies driven by a solenoid with ramp-up and pulse-then-hold, so the techniques a player brings from a real machine work: cradling, live catches, light taps, dead bounces, post passes, backhands. Rebounds are lively at low speed and never pingy at high speed. Randomness is tuned down; hops are an authored, occasional event. The only prior browser 3D pinball was criticised for a too-small ball, a bouncy launcher, and a game too fast — FR-4, FR-18 and FR-10 cover those three. Realises UJ-1, UJ-4.

#### FR-5: Flipper technique
A player can cradle, live-catch, light-tap, dead-bounce, post-pass, and backhand as on the Reference machine. **Consequences:** holding a flipper button keeps the flipper up and a cradled ball stays cradled; a brief tap moves the flipper partially; the left flipper can backhand the Dragon. Acceptance is the three-item feel test (cradling, flipper snap, rejection/rebound), not a per-technique checklist; the six techniques are what the flipper model must make possible.

#### FR-6: Velocity-dependent rebound
Rebounds off rubbers, posts and flippers are lively at low speed with no pingy rebound or airball at high speed. **Consequences:** the feel test names no "pingy" difference on rebound after tuning; the elasticity-falloff knob is the primary control (values in addendum).

#### FR-7: No tunnelling, no stalls
The ball never passes through Playfield geometry and the game never stalls, regardless of display frame rate. **Consequences:** identical inputs produce identical outcomes at 30, 60, and 120 Hz display rates; a frame stall discards simulated time rather than freezing (in this class of physics the stall, not tunnelling, is the real hazard — see addendum §2).

#### FR-8: Determinism
There is no artificial randomness in ball physics (scatter is zero; fixed physics timestep). **Consequences:** a recorded input sequence replays to the same outcome; the only randomness in the game is in Rules-layer awards (Match, Skill shot lane rotation).

#### FR-9: Deliberate hops
Occasional ball hops are produced by one explicit tuning control, not as an emergent by-product. **Consequences:** setting the control to zero produces no hops; the default produces occasional hops on hard hits.

#### FR-10: Pitch as a Setting
The player can change the Pitch within a bounded range, and the change is felt. **Consequences:** default 6.5°; range 6.0–8.5° `[ASSUMPTION: bounds]`; steeper Pitch makes the game visibly faster.

#### FR-11: Reliable switches
Rollovers, targets, the DRAGON bank, the Lock lane and the drain register fast balls without misses. **Consequences:** no ball is ever "lost" by a missed switch at any ball speed the Physics core can produce.

#### FR-12: Multiball ball-to-ball behaviour
Balls collide with each other plausibly during Quick multiball and the War. **Consequences:** two balls never overlap or stick; collisions transfer momentum.

### 4.3 Nudge and Tilt

**Description:** Nudging without tilt risk is not nudging — the danger is the point. A Nudge moves the cabinet, not the ball; the Tilt bob is a real pendulum that keeps swinging, so warnings need a debounce and settle time. Realises UJ-2, UJ-3.

#### FR-13: Nudge
The player can Nudge left, right, and up from the keyboard, and the ball responds as to a cabinet movement. **Consequences:** a Nudge during a cradle can free the ball; a Nudge disturbs the Tilt bob.

#### FR-14: Tilt warnings
Repeated or hard Nudges produce per-player Tilt warnings, shown on the Backglass, up to the Settings count (default 1 `[ASSUMPTION: default; the research gives only the Competition preset value of 2]`). **Consequences:** warnings are counted per player in Hot seat; the bob's continued swing cannot produce two warnings inside the debounce window.

#### FR-15: Tilt
Exceeding the warning count Tilts: flippers go dead, every ball in play drains, the End-of-ball bonus is forfeited, and the score is kept. **Consequences:** score is never zeroed by Tilt; during a multiball the ball ends when the last ball drains and the Mode ends with it; the next ball starts normally; the Backglass shows TILT.

#### FR-16: Slam tilt
A violent cabinet abuse triggers Slam tilt and ends all games in progress. `[ASSUMPTION: triggered by a rapid repeated Nudge past a threshold distinct from the Tilt bob's — the research is explicit that it is a different sensor.]` **Consequences:** all players' games end; the Table returns to Attract.

### 4.4 Standard Game Flow

**Description:** Everything a real machine does whose absence is conspicuous. A pinball player should need no instructions. Realises UJ-2, UJ-3.

#### FR-17: Start and Hot seat
Pressing Start begins a game; pressing Start again before the first ball ends adds a player, up to four. **Consequences:** per-player state (letters, Lock credits, Modes played, Tilt warnings, bonus) is independent; the Backglass shows player-up; balls per game is a Setting (default 3, the standard convention).

#### FR-18: Plunge and Skill shot
The player plunges manually with a variable-strength key hold, and the launcher is not bouncy; the Skill shot is the lit Top lane, rotating each plunge `[ASSUMPTION: skill-shot device]`, and awards a fixed value plus lighting a letter `[ASSUMPTION: award]`. **Consequences:** the Skill shot is only available until the first other switch closes; the Backglass shows "ARM YOURSELF" at plunge.

#### FR-19: Ball save
Ball save is enabled at launch, starts its timer when the ball is plunged (not when enabled), shows a hurry-up state before expiry, and has a Grace period past displayed expiry during which drains still save. **Consequences:** a drain inside the Grace period (default 2 s `[ASSUMPTION]`) is still saved; a saved ball is auto-launched; multiball Modes set their own Ball save.

#### FR-20: End-of-ball bonus
Each ball accumulates bonus by category (letters, Loops, Strikes) multiplied by the Bonus multiplier, paid at ball end unless tilted. **Consequences:** completing the Top lanes advances the Bonus multiplier one step, to a cap `[ASSUMPTION: 2×→3×→5×, reset each ball]`; the Backglass counts the bonus down; Tilt pays nothing.

#### FR-21: Extra ball
Extra balls are awarded from a menu of long-horizon achievements, not a single lane. **Consequences:** at least three distinct achievements light Extra ball `[ASSUMPTION: win a War, complete a Joust at full Charge, play every Mode once]`; the lit Extra ball is collected at the Right Loop `[ASSUMPTION: collect shot]`.

#### FR-22: Match
At game end, a Match draw compares a multiple-of-ten number against each player's last two score digits and awards a free game. **Consequences:** number is always a multiple of ten; probability is a Setting defaulting to 8% `[ASSUMPTION: unverified figure — see Open Questions]`.

#### FR-23: Ball search
If no switch closes for 15 s `[ASSUMPTION: period]` during play, the Table runs an escalating Ball search and, on failure, serves a new ball. **Consequences:** Ball search does not release locked balls while a Mode timer is running.

#### FR-24: Game over and Attract
After the last ball, the Table shows scores, offers High-score entry where earned, runs Match, and returns to Attract with the Walk-up. **Consequences:** Attract cycles Backglass animations and shows the flipper keys once.

#### FR-25: Lane change
Flipper buttons rotate the lit Insert across the inlane/outlane set and the Top lanes. **Consequences:** the lit lane moves one position per flipper press `[ASSUMPTION: standard convention adopted]`.

### 4.5 Shot Map and Playfield Devices

**Description:** The shot map is settled; the geometry is the architecture's first design problem and iterates with the rules. Loops and the Ramp are flow shots; the DRAGON bank and the Dragon are stop-and-go. Every shot passes Lawlor's test: a miss must come back playable, not drain. The Dragon is the protagonist, not set dressing — art and rules both answer to it. Realises UJ-1.

#### FR-26: Loops
There are a Left Loop and a Right Loop whose exits feed straight toward the flippers; the Spinner is on one Loop only `[ASSUMPTION: the Left Loop]`. **Consequences:** the two Loops are distinguishable shots; the Spinner awards per rotation.

#### FR-27: Ramp
There is one Ramp whose completion lights Modes (the qualifier) and returns the ball to an inlane `[ASSUMPTION: return side]`. **Consequences:** each Ramp shot advances the "light a Mode" progression; a Ramp miss returns to a flipper.

#### FR-28: DRAGON bank
There is a six-target drop bank; each target down lights its letter; all six down spells DRAGON, awards, and resets the bank. **Consequences:** letters persist per player across balls; during the War a full bank counts as Strikes instead of letters `[ASSUMPTION]`.

#### FR-29: Dragon, Lock lane, Mouth
The Dragon is an off-centre bash target with the Lock lane between its legs and the Mouth as the Lock's eject. **Consequences:** a rejection off the Dragon deflects toward a flipper, not the drain; a precise Lock-lane shot enters the Lock, a slightly-off shot hits the body; the Mouth fires balls upward and out onto the Playfield toward the flippers.

#### FR-30: Dragon animation
The Dragon opens its Mouth whenever the Mouth ejects and holds it open for the War start, and reacts visibly to every hit. **Consequences:** the mouth-open animation precedes the first ball leaving the Mouth; a Strike produces a visible reaction. `[ASSUMPTION: v1 animation scope is mouth open/close and one hit reaction; no idle animation.]`

#### FR-31: Standard devices
The Playfield also has two slingshots, pop bumpers, a set of three Top lanes `[ASSUMPTION: count]`, two inlanes, two outlanes, and a plunger lane. **Consequences:** pops and slings score and disturb the ball; outlanes drain; ball guides end at rubber posts, never bare metal.

#### FR-32: Lawlor's test
Every shot's miss comes back playable. **Consequences:** verified per shot in the feel test; no shot's most common rejection is a centre drain.

### 4.6 Feature Modes

**Description:** Five Modes form a knight's campaign in fiction — arm yourself, answer the call, fight the monster, joust, war — but they are **independently available**: escalation lives in the fiction and the scoring, not in gating. The Ramp lights Hurry-up, Quick multiball and Joust; a lit Mode is started at the Lock lane `[ASSUMPTION: the Lock lane doubles as the mode-start "scoop"; if the Lock also has room the ball locks and the Mode runs with the newly served ball]`. The Lock lane always locks while the player has fewer than two Lock credits and no multiball is running. The War starts the instant both conditions — DRAGON spelled and two Lock credits — hold, in either order. Modes stack by priority with the War. Progressive Jackpot seeding and the Extra-ball achievement menu exist to make the table feel authored rather than generated. Realises UJ-1.

#### FR-33: Mode lighting and start
Ramp completions light Modes in the campaign order (Hurry-up, then Quick multiball, then Joust); a lit Mode starts when the ball enters the Lock lane. **Consequences:** if more than one Mode is lit, the player selects with the flipper buttons before the Mouth ejects `[ASSUMPTION]`; a Mode can be played again once all three have been played.

#### FR-34: Hurry-up
Hurry-up starts at a value that decays over time and is collected at the Ramp `[ASSUMPTION: collect shot]`. **Consequences:** start 250,000 decaying to a 50,000 floor over 20 s `[ASSUMPTION: values]`; Backglass shows the decaying value; the Ramp Insert is red while Hurry-up runs.

#### FR-35: Quick multiball
Quick multiball adds one ball (2-ball), with its own Ball save, and awards on Dragon hits and Ramp shots. **Consequences:** ends when one ball remains; the Lock is disabled during Quick multiball as during any multiball, so neither the War nor a lock can start inside it; Quick multiball cannot start during the War.

#### FR-36: Joust
Joust rewards alternating Loops: each consecutive alternating Loop builds the Charge; a miss or the same Loop twice breaks it. **Consequences:** Charge multiplies the Loop award up to 10× `[precedent: Stern Godzilla; value is an ASSUMPTION]`; Backglass shows "CHARGE ×N"; Joust Inserts are blue.

#### FR-37: Locking balls
A Lock-lane shot locks the ball whenever the player has fewer than two Lock credits and no multiball is running; a new ball is served. Lock credits are per player, backed by one physical Lock. **Consequences:** the locking player's credit count rises by one; if the physical Lock is already full (another player's balls), the Lock ejects one ball to the Playfield and the credit still counts; the Lock Insert is orange while lockable.

#### FR-38: The War (Dragon-fire multiball)
The War starts the moment the current player has both DRAGON spelled and two Lock credits, whichever completes last. **Consequences:** the Dragon opens its Mouth and fires every ball in the Lock; if the Lock holds fewer balls than needed for three in play (a lock was the completing event, or a Hot seat opponent's War consumed them), the trough auto-launches the difference. Three balls are in play; the Lock is disabled during the War so a Lock-lane shot counts as a Strike; War Inserts are orange; the War start is the brightest, loudest event on the table.

#### FR-39: Winning the War and the Jackpot
Each Dragon hit during the War is a Strike; enough Strikes win the War and award the Jackpot on the winning Strike. **Consequences:** 10 Strikes win `[ASSUMPTION]`; each further Strike in the same War awards the Jackpot again `[ASSUMPTION]`; Jackpot is progressive — base 500,000 plus 500,000 per War started this game `[ASSUMPTION: values, from the Stern pattern]`; the Backglass shows Strikes remaining; winning the War lights Extra ball once per game.

#### FR-40: War end and re-qualification
The War ends when one ball remains; DRAGON letters reset and Lock credits return to zero. **Consequences:** a second War in one game requires spelling DRAGON and locking two balls again; the Jackpot seed carries.

#### FR-41: Mode stacking priority
When Modes overlap, the War takes presentation priority, then Quick multiball, then timed Modes; scoring from all active Modes accrues. **Consequences:** the Backglass shows the highest-priority Mode; a Hurry-up timer keeps running under a multiball.

### 4.7 Lighting and Colour Grammar

**Description:** Insert colour is the mode-state channel, not decoration — it is how a player reads the table without instructions. Rustic playfield art and materials, saturated functional Inserts: the rustic register lives in the art, the grammar lives in the light. Four independently driven lighting channels.

#### FR-42: Four lighting channels
GI, feature Inserts, Flashers, and Architectural lighting are driven independently by the Rules layer. **Consequences:** GI can dim during the War without affecting Inserts; Flashers have duty-cycle limits and never stay on.

#### FR-43: Inserts as lights
Inserts are modelled as lights beneath the translucent Playfield through a cup, not as decals. **Consequences:** an Insert glows and spills onto adjacent playfield art; the design envelope is 50–150 individually addressable Inserts.

#### FR-44: Colour grammar (held)
Insert colour follows this mapping and does not vary: **white** = shot lit / qualifying; **red** = Hurry-up; **green** = Quick multiball; **blue** = Joust; **orange** = DRAGON letters, Lock, and the War; **purple** = Extra ball / special. Jackpot progression is shown as a brightness/blink ladder within the Mode colour. **Consequences:** no state uses a colour outside the mapping; a player who has read one Mode's colour can read the rest.

#### FR-45: Flashers on events
Flashers fire on Mode starts, locks, the Mouth ejecting, Jackpot, and Tilt. **Consequences:** the War start is the brightest event on the table.

### 4.8 Audio

**Description:** Mechanical audio of a real machine — coil fires, flipper snap, ball roll on wood, the drop bank resetting, the Mouth kicking. Generated for now, with the author's own recordings of the Reference machine's mechanical sounds to be swapped in later, so the audio layer sits behind a swappable asset interface from day one.

#### FR-46: Mechanical sounds
Flippers, slingshots, pops, the DRAGON bank drop and reset, the Lock and the Mouth, and the ball on wood and rubber each produce a sound, driven by Switch events and ball velocity. **Consequences:** flipper snap is audible at every press; ball roll varies with speed and surface.

#### FR-47: Swappable audio assets
Every sound is addressed by name through an asset interface so recorded sounds can replace generated ones without touching game logic. **Consequences:** replacing a sound file changes the sound and nothing else.

#### FR-48: Mode and Backglass cues
Mode start, locks, War start, Jackpot, Tilt and Match each have an audio cue. `[ASSUMPTION: music and speech callouts are out of v1 scope; cues are short generated stings.]` **Consequences:** the War start cue is distinct from everything else.

### 4.9 Input, Settings and Persistence

**Description:** Keyboard only in v1, rebindable. A small Settings panel and a High-score table persist locally in the browser.

#### FR-49: Keyboard control
Default keys: left/right Shift for flippers, Enter to plunge (hold for strength), Space/arrow keys to Nudge, 1 for Start, Escape for the Settings panel `[ASSUMPTION: defaults]`; all rebindable. **Consequences:** Attract shows the current bindings once; bindings persist.

#### FR-50: Settings
The player can set Pitch, Tilt warning count, balls per game, Match probability, and volume, and the Settings persist across sessions. **Consequences:** Settings changes apply to the next game; a reset-to-defaults exists.

#### FR-51: High-score table
The Table keeps a Grand Champion and a ranked High-score table with three-initial entry via the flippers and Start, persisted locally. **Consequences:** a qualifying score prompts initials entry at game end; Attract cycles the High-score table.

#### FR-52: Local-only persistence
Persistence is per-browser, with no accounts and no network. **Consequences:** clearing site data resets the machine to factory; nothing is transmitted.

### 4.10 Distribution

**Description:** Click-and-play from a link on Windows and macOS. Desktop packaging via Tauri comes later from the same build.

#### FR-53: Link-playable
The Table loads and is playable from a URL with no install, plugin, or account. **Consequences:** a stranger reaches the Walk-up from the link with no steps in between.

#### FR-54: Browser support
Current releases of Chrome, Edge and Safari are supported on Windows and macOS; Firefox is best-effort; WebGL2 is the floor and WebGPU an enhancement. **Consequences:** an unsupported browser shows a message naming supported ones; the WebGL2 path is fully playable, not degraded in feel; WebGPU may improve lighting quality only — it never changes gameplay.

#### FR-55: Open-source release
The repository is public under GPL-3.0 with a clean, verified attribution ledger. **Consequences:** every third-party file and generated asset appears in `ATTRIBUTIONS.md` with source, author, licence and verification date.

## 5. Non-Goals (Explicit)

- **Not an engine.** No table editor, plugin system, or support for other tables. This is the boundary most likely to erode.
- **Not a recreation.** No ROM emulation and no recreation of any commercial machine or its assets.
- **Not a platform.** No accounts, online multiplayer, global leaderboards, or telemetry.
- **Not photoreal.** Geometry and textures are stylized; realism lives in dimensions, light, and the ball.
- **Not mobile, not VR, not cabinet hardware, not physical controllers.**
- **Not tuned forever.** Feel is accepted by the feel test (UJ-4), not by an open-ended pursuit of realism.

## 6. MVP Scope

### 6.1 In Scope (v1)

- One complete, tuned Table
- Walk-up with fixed view
- Stylized art at real dimensions
- The full shot map (§4.5) including the animated Dragon
- Five independently available Modes including the War with physical Lock, per-player Lock credits and Mouth eject
- Standard game flow (§4.4)
- Nudge, Tilt warnings, Tilt, Slam tilt
- Four-channel lighting with the held Colour grammar
- Generated mechanical audio behind a swappable interface
- Keyboard input
- Local Settings and High-score table
- Chrome/Edge/Safari on Windows and macOS
- GPL-3.0 release with a clean attribution ledger

### 6.2 Out of Scope for MVP

- **Final wizard mode** beyond winning the War — deferred to a later code update, as commercial machines do. `[NOTE FOR PM: emotionally load-bearing; revisit once v1 is playable end-to-end.]`
- **4-ball finale multiball** — reserved for the wizard mode.
- **Recorded Reference-machine sounds** — the interface is built now; the author's recordings come later (see §9 for the provenance rule).
- **Music and speech callouts** — deferred; mechanical audio and short cues only.
- **Full operator/service menu** (replay, per-mech calibration, Competition preset) — minimal Settings only.
- **Gamepad input** — deferred; keyboard only.
- **Desktop packaging via Tauri** — same build, later.
- **Table-authoring path** — layer separation preserves the option; the door stays shut.

### 6.3 Sequencing Intent (for epics)

The brief's structural defences against solo-project fatigue are *phased content* and a *playable-early loop*. Epics should honour that order: (1) one ball, two flippers and a bare Playfield at real dimensions, with the feel test (UJ-4) starting here and never stopping; (2) the full shot map geometry and standard game flow (§4.4–4.5); (3) the Modes and the War (§4.6); (4) presentation depth — lighting bake, Backglass animation, audio; (5) art passes, phased, allowed to trail the rules. Art is the brief's largest unbudgeted risk; nothing in (1)–(3) should wait on it.

## 7. Success Metrics

**Primary**
- **SM-1: The author plays it for fun, unprompted, after it is finished.** Observed behaviour post-release. Validates everything.
- **SM-2: The dragon-fire moment lands.** The author's own judgement that FR-30, FR-37–FR-39, FR-45 and FR-48 together produce the feeling that started the project.
- **SM-3: A stranger can play from a link on Windows or macOS with no install and no explanation.** A link test with a stranger, no help given. Validates FR-1, FR-3, FR-24, FR-49, FR-53, FR-54.
- **SM-4: It holds up against the Reference machine.** The feel test (UJ-4), run throughout development: cradling, flipper snap, and shot rejection/rebound each judged "no material difference" or an accepted, documented difference. Validates FR-5, FR-6, FR-29, FR-32.
- **SM-5: Finished and released** — repository public, licence clean. Validates FR-55.

**Counter-metrics (do not optimize)**
- **SM-C1: Feature count.** More Modes, more devices, or a second table do not count. Counterbalances SM-2; guards §5.
- **SM-C2: Visual fidelity.** Triangle counts, texture resolution and photoreal materials are not goals. Counterbalances SM-4; guards the stylized decision.
- **SM-C3: Physics tick rate and engine sophistication.** 480 Hz that feels right beats 1000 Hz that does not. Counterbalances SM-4.
- **SM-C4: Tuning time.** Time spent tuning past an accepted feel-test result is waste. Counterbalances SM-4.

## 8. Cross-Cutting Non-Functional Requirements

- **NFR-1 Frame rate:** stable 60 FPS in the supported browsers on a mid-range laptop GPU from 2022 or later `[ASSUMPTION: hardware target — the research sets "stable 60+ FPS" with no machine named]`; physics is decoupled from render rate.
- **NFR-2 Physics rate:** fixed timestep in the 480–1000 Hz band; nothing tunnels at any display rate (FR-7).
- **NFR-3 Input latency:** flipper response within one display frame of key press at 60 Hz (≤ 16 ms added by the software) `[ASSUMPTION: target; the research quantifies none]`; the flipper loop is entirely local.
- **NFR-4 Load:** first playable Walk-up within 10 s on a 50 Mbps connection `[ASSUMPTION: target — the research found no verified figure]`. Measured in the build-size spike, which is a gate on the browser-first premise, not an optional check (addendum §1).
- **NFR-5 Determinism and testability:** the Rules layer runs headless as a pure function of Switch events with no physics or rendering; identical inputs replay identically (from the research's fixed-timestep, zero-scatter requirement).
- **NFR-6 Platform:** Windows 11 and macOS current-1 `[ASSUMPTION: OS floor]` in current Chrome, Edge and Safari; Firefox best-effort; no mobile or Linux commitment.
- **NFR-7 Persistence:** local browser storage only; no network calls after load.
- **NFR-8 Accessibility and localisation:** English only; rebindable keys are the sole accessibility feature in v1 `[ASSUMPTION: hobby scope]`.
- **NFR-9 Provenance:** see §9 — a hard requirement, not a quality attribute.

## 9. Provenance and Licensing

Nothing enters the repository without known provenance (project `CLAUDE.md`). The licence is **GPL-3.0**, chosen because Apache-2.0 (the renderer's licence) is incompatible with GPL-2.0-only but compatible with GPL-3.0, and the physics reference's "or-later" grant makes that move available.

- Every third-party file — code, model, texture, sound, font — is recorded in `ATTRIBUTIONS.md` with source URL, author, licence and verification date *before* it enters, verified at its source, not from package metadata.
- Not acceptable: anything unlicensed, anything non-commercial, GPL-2.0-only, and any asset from a commercial pinball machine — playfield art, sculpted toys, logos, speech, music, callouts, ROMs.
- The one exception: recordings the author makes of a real machine's generic mechanical noises (coil fires, flipper snap, ball rolling on wood) carry no copyrightable expression and may be added, recorded as author-made with the date.
- Generated assets (AI art, audio, code) are recorded with tool and date.
- Ported physics code preserves its original copyright notices alongside ours.
- Any file from `vpinball/vpinball` is usable only if its first line reads `// license:GPLv3+`.

Detail and the verified compatibility check are in `addendum.md`.

## 10. Open Questions

1. **Which machine is the Reference machine?** The era is decided (modern Stern/JJP); the specific title should be named so the feel test is reproducible. Owner: author.
2. **Match probability.** The widely repeated 8% default could not be confirmed against a primary source; confirm or pick deliberately before implementing FR-22.
3. **Scoring values** (FR-20, FR-34, FR-36, FR-39) are starting values to be tuned in play; when do they freeze?
4. **Slam tilt trigger** in a keyboard-only sim (FR-16): a distinct key, a Nudge threshold separate from the Tilt bob's, or drop it to a Setting? The research's point stands either way: it must not share the bob's threshold.
5. **Mode-start device.** The assumption that the Lock lane doubles as the mode-start scoop (FR-33) should be confirmed against the drawn geometry; if it overloads the lane, a separate scoop is the fallback.
6. **Playfield geometry.** First, the flipper tip gap, outlane widths and post positions — the geometry the whole game balances around, and the one unmeasured quantity in the drain triangle. A DXF/SVG Bally playfield template is the highest-value artifact: it would settle all three at once. Then where Loops enter and exit, Ramp height and return, the Dragon's exact position and the Lock lane beneath it, pop and sling placement, the DRAGON bank and Top lanes. The architecture's first design problem; iterates with the rules.
7. **Ball-roll audio under a generated-audio strategy** (FR-46): real sims use velocity-driven sample playback; the generated approach needs its own answer.
8. **Decision freshness.** Renderer choice and WebGPU browser support are to be re-checked by 2026-09-26; the two research spikes that gate the browser-first premise (a 6-body 1000 Hz JS loop vs WASM; measured build size and load time) have no owner or date yet.

## 11. Assumptions Index

- §4.1 FR-2 — Backglass shown as a strip at the top of the fixed view.
- §4.2 FR-10 — Pitch range 6.0–8.5°.
- §4.3 FR-14 — Tilt warning default 1.
- §4.3 FR-16 — Slam tilt triggered by rapid repeated Nudge past a threshold distinct from the Tilt bob's.
- §4.4 FR-18 — Skill shot is a rotating lit Top lane; awards a value plus a letter.
- §4.4 FR-19 — Grace period 2 s.
- §4.4 FR-20 — Bonus multiplier 2×→3×→5× via Top lanes, reset each ball.
- §4.4 FR-21 — Extra-ball achievements: win a War, full-Charge Joust, play every Mode; collected at the Right Loop.
- §4.4 FR-22 — Match 8% (unverified).
- §4.4 FR-23 — Ball search after 15 s.
- §4.4 FR-25 — Lane change adopted as standard.
- §4.5 FR-26 — Spinner on the Left Loop.
- §4.5 FR-27 — Ramp return side.
- §4.5 FR-28 — Full DRAGON bank during the War counts as Strikes.
- §4.5 FR-30 — v1 Dragon animation scope: mouth open/close and one hit reaction.
- §4.5 FR-31 — Three Top lanes.
- §4.6 (description), FR-33 — Lock lane doubles as mode-start scoop; ball locks and Mode starts together when both apply; flipper-button Mode selection when several are lit.
- §4.6 FR-34 — Hurry-up collected at the Ramp; 250,000 → 50,000 over 20 s.
- §4.6 FR-36 — Joust Charge cap 10×.
- §4.6 FR-39 — 10 Strikes win the War; each further Strike re-awards the Jackpot; Jackpot 500,000 + 500,000 per War started.
- §4.8 FR-48 — No music or speech in v1.
- §4.9 FR-49 — Default key bindings.
- §8 NFR-1 — Mid-range 2022+ laptop GPU as the 60 FPS target.
- §8 NFR-3 — ≤ 16 ms added input latency.
- §8 NFR-4 — 10 s first-playable on 50 Mbps.
- §8 NFR-6 — Windows 11 / macOS current-1 as the OS floor.
- §8 NFR-8 — English only; rebindable keys as the only accessibility feature.
