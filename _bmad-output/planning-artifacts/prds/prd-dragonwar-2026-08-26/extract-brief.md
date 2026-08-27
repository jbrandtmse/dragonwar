---
title: 'Brief Extract: DragonWar'
purpose: Structured extraction from the product brief and addendum, for PRD authoring
sources:
  - ../../briefs/brief-dragonwar-2026-08-26/brief.md
  - ../../briefs/brief-dragonwar-2026-08-26/addendum.md
created: '2026-08-26'
---

# Brief Extract: DragonWar

Faithful extraction from `brief.md` and `addendum.md` (both status: complete, dated 2026-08-26). Section names in parentheses are citations. "Brief" = brief.md; "Addendum §n" = addendum.md section n. Quoted text is verbatim; unquoted text is close paraphrase.

---

## 1. Product in one paragraph

DragonWar is "a single, complete, open-source pinball table that runs in a browser — one machine, built properly, rather than a platform hosting many" (Brief, Executive Summary). It exists because its author played a specific moment on a real machine and wanted to build it: "targets spell D‑R‑A‑G‑O‑N, the dragon opens its mouth, and multiball begins as the balls come out like fire." The fiction: "You are a knight, the flippers are your weapon, and the war is the multiball itself." The core promise is that moment — "Light the letters, trigger dragon-fire multiball, land enough hits to win the war, collect the jackpot — with other feature modes layered alongside so the table has depth rather than one trick." It is for the author first, then the virtual pinball community, and its advantage "is simply that it will be finished and free" (Brief, Executive Summary). It runs browser-first on Windows and macOS, is licensed GPL-3.0, and is "a game, not an engine" (Brief, Scope).

---

## 2. Stakes / audience signals

**Stakes: hobby / passion project, shared openly.**

- "This is a passion project shared openly, and its advantage is simply that it will be finished and free." (Brief, Executive Summary)
- "The author, first and honestly. This is a passion project whose primary success condition is that its builder wants to play it. That is a legitimate and sufficient reason, and the brief does not dress it up as anything else." (Brief, Who This Serves)
- "The bet is not technical novelty." (Brief, Executive Summary)
- Solo: "The single scope decision that makes this achievable solo" (Addendum §6); risk "Solo project fatigue" (Brief, Key Risks); "the photoreal art budget that would sink a solo project" (Addendum §1).
- Project CLAUDE.md: "there is no deadline here worth infringing for" — consistent with hobby pace.

**Who plays it:**

- The author (primary). "The author has a real machine within walking distance and plays it regularly." (Brief, What "Realistic" Means Here)
- "Then the virtual pinball community." Visual Pinball's ecosystem is "active but almost entirely Windows-first, desktop-installed, and licence-encumbered." A "finished, free, click-and-play table is a useful thing to hand that community, and an unusually good on-ramp for people who have never installed a pinball simulator." (Brief, Who This Serves)
- "A stranger can play it from a link on Windows or macOS, with no install and no explanation." (Brief, Success Criteria 3)

**Who contributes:**

- Not explicitly addressed. Implicit: solo author. Vision mentions "whatever the people who play it ask for" and that "a table-authoring community would eventually want to build on" it (Brief, Vision) — but "The door stays shut for v1."

**Success criteria (Brief, Success Criteria) — verbatim, with measurement:**

1. "The author plays it for fun, unprompted, after it is finished. This is the real one." — Measured by observed behaviour post-release.
2. "The dragon-fire multiball lands — the moment that started the project produces the feeling that started the project." — Measured subjectively by the author.
3. "A stranger can play it from a link on Windows or macOS, with no install and no explanation." — Measured by a link test with a stranger, no help given.
4. "It holds up against the real machine. Play the machine at the bar, then play the build, and name what differs. Cradling, flipper snap, and how shots reject and rebound are the specific things to compare. This is a repeatable test, not an opinion — run it throughout, not at the end." — Measured by a repeatable A/B comparison against the physical reference, on three named dimensions (cradling, flipper snap, shot rejection/rebound), performed throughout development.
5. "It is finished and released, with the repository public and the licence clean." — Measured by public repo + clean licence audit (ATTRIBUTIONS.md discipline).

Note: criterion 4 is also the mitigation for the "Feel is unbounded" risk — "a fixed acceptance bar (criterion 4) rather than an open-ended pursuit of realism" (Brief, Key Risks).

---

## 3. Scope

### In scope (Brief, Scope — "In")

- "One table: DragonWar. Complete and tuned."
- "Browser-first, Windows and macOS. Desktop packaging via Tauri later, at near-zero cost from the same build."
- "1–4 player hot seat."
- "Nudge, tilt warnings, and slam tilt."
- "The walk-up-and-descend presentation."
- "Insert lighting driven by game state, general illumination, flashers, and mechanical audio."
- "Open-source release under GPL-3.0."
- Standard machine behaviour (Brief, The Table): "skill shot, ball save with grace period, end-of-ball bonus, extra balls, match, tilt warnings, slam tilt, and ball search" — "in scope because its absence is conspicuous."
- Additional feature modes (Brief, The Table; Addendum §8): skill shot, hurry-up, quick multiball, joust, dragon-fire multiball.

### Out of scope (Brief, Scope — "Out")

- "A table editor, a plugin system, or support for other tables. This is the single most important boundary in the brief and the thing most likely to erode. DragonWar is a game, not an engine."
- "ROM emulation of real machines, and any recreation of an existing commercial table."
- "VR, cabinet hardware, and physical controller support."
- "Online multiplayer and global leaderboards."
- "Mobile."
- PinMAME / ROM emulation: "Out of scope regardless, since DragonWar is an original table and needs no ROM emulation." (Addendum §5)

### Deferred, not rejected (Addendum §9; Brief, Vision)

- "Final wizard mode beyond winning the war — legitimate to ship in a later code update, exactly as commercial machines do."
- "Desktop packaging via Tauri."
- "A table-authoring path. Keeping rules, physics and presentation separated preserves the option at no cost. The door stays shut for v1."
- 4-ball multiball: "4-ball stays reserved for a later finale" (Addendum §8, Device model consequences; §2 Ball-count grammar).
- Recorded real-machine sounds: "Generated for now, with recorded real-machine sounds swappable in later." (Addendum §8, Audio)
- Vision: "the obvious next step is not more tables — it is a better DragonWar: deeper code, a final wizard mode, tuning refined against real play, and whatever the people who play it ask for."

### MVP boundaries

- "a complete v1 does not require the final wizard mode" — "even commercial machines ship their deepest modes in later code updates" (Brief, Key Risks).
- "four qualifying features plus the headline multiball sits inside the typical three-to-five range" — "a healthy first release" (Addendum §8, The modes).
- "shipping one excellent table is the whole job" (Brief, Vision).
- Structural defences against fatigue: "One table, phased content, and a playable-early loop" (Brief, Key Risks).

---

## 4. Rules spine and feature modes — discrete capability statements

Each statement is a candidate Functional Requirement. Numbered C-nn for reference. Sources cited per item.

### 4.1 Rules-spine skeleton (Brief, The Table; Addendum §2)

- **C-01** The rules spine follows the modern Stern/JJP structure "qualifier → selector → tiered modes → wizard" so the table "reads as a real machine rather than an invented one." (Brief, The Table)
- **C-02** Qualifier: "Spell DRAGON on lit targets to qualify the dragon." (Brief, The Table; Addendum §2: "Lit targets spelling D‑R‑A‑G‑O‑N")
- **C-03** Selector: the dragon's mouth is the selector — the equivalent of "Scoop starts the chosen mode." (Addendum §2)
- **C-04** Headline multiball: "Dragon-fire multiball — the balls are launched from the dragon's mouth. This is the war." (Brief, The Table) — 3-ball (Addendum §2, §8).
- **C-05** Win condition: "Fight it — land enough scoring hits on the dragon, with the flippers, to win." (Brief, The Table)
- **C-06** "Jackpot on winning the war." (Brief, The Table)
- **C-07** Mode stack: "Additional feature modes, layered by priority" — "Modern tables layer several qualifying modes alongside the headline multiball, and stack them by priority." (Brief, The Table; Addendum §2)
- **C-08** Wizard: "'Win the war' → jackpot; deeper wizard content can follow in a later release." (Addendum §2)
- **C-09** Ball-count grammar: "3-ball for regular multiball, 4-ball reserved for the finale." (Addendum §2)
- **C-10** "Progressive jackpots are seeded by prior play ('500k + 500k per multiball started')." (Addendum §2)
- **C-11** "extra balls come from a menu of long-horizon achievements, not a single lane." (Addendum §2)
- **C-12** "Every flip during multiball is a strike against the dragon, which is why the war lives inside multiball rather than beside it." (Brief, The Moment)

### 4.2 Feature modes (Addendum §8, The modes)

- **C-13** Skill shot — fiction "Arming oneself" — "Standard skill shot at the plunge." Noted as "the sharpest theme fit in the set: it fires at the plunge, before the ball is in play, so 'arming oneself' and the mechanic land on the same beat."
- **C-14** Hurry-up — fiction "A call to arms" — "Timed, decaying value."
- **C-15** Quick multiball — fiction "Fight the monster" — "2-ball."
- **C-16** Joust — fiction "The charge" — "Looping / orbit shots — consecutive loops build, a miss breaks the charge."
- **C-17** Dragon-fire multiball — fiction "The war" — "3-ball, the headline mode."
- **C-18** Campaign structure (inferred, flagged as such): "these form a knight's campaign that escalates — arm yourself → answer the call → fight a monster → joust → war with the dragon. If that reading is right, the qualifying order should follow it rather than modes being independently available." Gating is Open Question 6 (Addendum §7).
- **C-19** The 2-ball / 3-ball split "respects the ball-count grammar in §2 (with 4-ball still reserved should a final wizard mode arrive later)."

### 4.3 Joust rules (Addendum §8, The joust; Shot layout)

- **C-20** "Consecutive loops build the charge; a miss breaks it."
- **C-21** Alternation required: "Alternate them — left, right, left. Same loop twice breaks the charge." Rationale: "Physically what a joust looks like, and harder than hammering one shot."
- **C-22** Precedent for build magnitude: "Stern's Godzilla builds loop combos up to 10x for consecutive shots" — a "proven rule pattern rather than an invention." (Precedent, not a decided value.)

### 4.4 Shot map (Addendum §8, Shot layout — "settled in principle"; "Geometry is the PRD's to draw")

- **C-23** Left loop / right loop — job: "The joust."
- **C-24** Spinner — "On one loop only. So the two orbits are not the same shot. That loop is the loud one; the other is the quiet return."
- **C-25** Ramp — job: "Qualifier. Lights modes — the ramp's role in the modern skeleton (§2)."
- **C-26** DRAGON targets — "Spell the letters. Qualifies the war."
- **C-27** The dragon — "Off-centre bash toy. Right flipper takes it straight; left flipper backhands it."
- **C-28** Between the dragon's legs — "Physical ball lock. A precise shot goes under the dragon and locks; a slightly-off shot hits the body. Two shots in one lane, separated by precision."
- **C-29** The dragon's mouth — "Multiball eject. A vertical up-kicker lifts the locked balls and fires them out of the mouth as dragon fire. The balls you locked are the balls that come back at you."
- **C-30** Off-centre placement is load-bearing ("so it survives layout pressure"): "a dead-centre bash toy rejects balls straight down the middle; off-centre, a rejection deflects toward a flipper (Lawlor's miss test). It also creates a backhand." Precedents: "Pulp Fiction's briefcase, Cactus Canyon's Bart, Godzilla."
- **C-31** Shot mix: "loops and ramp are flow shots, targets and dragon are stop-and-go."

### 4.5 Dragon device model (Addendum §8, Device model consequences)

- **C-32** "The dragon is two devices: a bash target on the body and a `ball_device` (physical lock) beneath it, with the mouth as the lock's eject."
- **C-33** "In MPF terms the lock is a `multiball_lock` — balls out of play, deducted from the count — not a `ball_hold`."
- **C-34** "Lock 2, ball in play makes 3 for the war. 4-ball stays reserved for a later finale."
- **C-35** "The lock must be disabled during multiball, so an under-leg shot counts as a bash hit rather than a re-lock."
- **C-36** Physical lock, not virtual: "the payoff — the dragon swallows your balls and spits them back — is the whole moment."

### 4.6 Layout rules carried from research (Addendum §8, Shot layout)

- **C-37** "orbit exits feed straight toward the flippers"
- **C-38** "ball guides end at rubber posts so the ball does not rattle off bare metal"
- **C-39** "Lawlor's test for every shot — a miss must come back playable, not drain."
- **C-40** Playfield geometry still to be drawn: "where the loops enter and exit, ramp height and return, the dragon's exact position and the lock lane beneath it, pop bumper and slingshot placement" — implies pop bumpers and slingshots exist (Addendum §7, Q5).

### 4.7 Standard machine behaviour (Brief, The Table; Addendum §3)

- **C-41** Skill shot (also C-13).
- **C-42** Ball save with grace period.
- **C-43** End-of-ball bonus.
- **C-44** Extra balls (see C-11).
- **C-45** Match.
- **C-46** Tilt warnings.
- **C-47** Slam tilt.
- **C-48** Ball search.
- **C-49** Nudge — "Nudging without tilt risk is not nudging — the danger is the point." (Addendum §6)
- **C-50** All of the above specified by "Mission Pinball Framework's MIT-licensed device ontology and event vocabulary, which specifies all of this precisely enough to implement directly." (Brief, The Table)

### 4.8 Machine-behaviour details a sim usually gets wrong (Addendum §3 — "these details separate credible from not")

- **C-51** "Tilt forfeits the end-of-ball bonus and ends the ball — it does not zero the score."
- **C-52** Tilt "Warnings are per-player."
- **C-53** Tilt bob: "The bob keeps swinging, so both a debounce window and a settle time are required."
- **C-54** "Slam tilt is a different sensor — a coin-door switch, not the plumb bob — and it ends all games in progress."
- **C-55** "Ball save has a grace period past the displayed expiry during which drains still save."
- **C-56** Ball save has "a 'hurry up' state measured backwards from expiry."
- **C-57** Ball save has "a timer-start event separate from enable (which is why it does not count down until the ball is plunged)."
- **C-58** "Match: the number is always a multiple of ten." Probability: "Unverified: the widely-repeated 8% default could not be confirmed against a primary source — check before implementing."
- **C-59** "Ball search is an escalating three-phase protocol with per-device priority callbacks and a defined failure action, and real machines suppress parts of it when rules state would be corrupted."
- **C-60** "Flashers are coil-class outputs, charted with solenoid drivers rather than the lamp matrix, and need duty-cycle limits. Do not fold them into the insert layer."

### 4.9 Players (Brief, The Table; Addendum §6)

- **C-61** "1–4 player hot seat, like a real machine."
- **C-62** "This fixes per-player state in the rules layer from day one rather than retrofitting it through every rule later."

### 4.10 Colour grammar (Addendum §2; §8 Colour grammar — resolved)

- **C-63** "Insert colour is the mode-state channel, not decoration." It "is how the player reads the table without instructions." Reference: "Jurassic Park uses white = qualify, red = rescue, yellow = set trap, green = the moving target."
- **C-64** "Rustic playfield art and materials, saturated functional inserts." — "The rustic register lives in the art; the grammar lives in the light."
- **C-65** "DragonWar should assign a colour grammar early and hold it." The specific state-to-colour mapping is unassigned (Open Question 2).

### 4.11 Lighting (Brief, Scope; Addendum §1)

- **C-66** "Insert lighting driven by game state."
- **C-67** General illumination (GI).
- **C-68** Flashers (see C-60 for driver class).
- **C-69** "Four independently-driven channels: GI, feature inserts, flashers, architectural." (Addendum §1)
- **C-70** "Inserts modelled as a light below a translucent playfield with a cup mesh, not as decals." (Addendum §1)

### 4.12 Backglass (Addendum §8, Backglass)

- **C-71** "Animated, pixelated, dot-matrix-looking."
- **C-72** "It is also the first thing seen in the walk-up, so it carries the job of establishing the war before a ball is plunged."
- **C-73** Rationale: "period-authentic — Williams/Bally dot-matrix displays are exactly this"; "pairs with the stylized low-poly direction"; "removes the need for high-resolution backglass art entirely."

### 4.13 Audio (Brief, Scope; Addendum §8, Audio)

- **C-74** "mechanical audio" is in scope (Brief, Scope). Named sounds: "coil fires, flipper snap, ball roll on wood, a drop bank resetting" (Addendum §8) — the drop-bank mention implies a drop-target bank may exist.
- **C-75** "Generated for now, with recorded real-machine sounds swappable in later."
- **C-76** "the audio layer must sit behind a swappable asset interface from day one, so sources can be replaced without touching game logic."
- **C-77** Ball-roll audio: "Ball roll in real simulators is sample playback driven by velocity and position with a pitch shift by surface, not synthesis — a generated-audio approach needs its own answer for that." (Addendum §7, Q4)
- **C-78** Provenance path for recordings: "the author can record his own reference machine's mechanical sounds on a phone ... Unambiguously his, no licensing question." (Addendum §8)

### 4.14 Walk-up presentation (Brief, The Moment; What "Realistic" Means Here)

- **C-79** "The walk-up is a first-class feature." Sequence: "walking up to a machine, seeing the backbox lit, the camera settling down onto the playfield." "Backbox and backglass first, then the descent to the playfield."
- **C-80** Walk-up must get "Correct silhouette and scale ... cabinet proportions, backbox height, the glass." (Addendum §1)

### 4.15 Physics-visible behaviours (Brief, What "Realistic" Means Here; Addendum §4)

- **C-81** "Correct ball behaviour — bouncing, rebounding, and sometimes hopping."
- **C-82** "Hopping gets one explicit tuning control, dialled in deliberately." — "The author wants occasional hops; this is deliberate, not emergent."
- **C-83** Flipper feel must support cradling, flipper snap, backhands, centre shots, and light-tap technique (Brief, Success Criteria 4; Addendum §4 notes on friction and coil ramp-up).

**Count of discrete capability statements in this section: 83.**

---

## 5. "Realistic" definition

### The premise (Brief, What "Realistic" Means Here)

"nobody has defined realism for pinball — there is no benchmark, no instrumented study, no reproducible test; every published ranking is forum opinion. So the term is replaced with the author's own criteria, which are checkable:"

1. "It feels like real pinball and stays playable. Feel wins over fidelity wherever the two conflict."
2. "The approach. Backbox and backglass first, then the descent to the playfield."
3. "Lights and sound of a real machine — insert lighting that carries game state, general illumination, flashers, and mechanical audio."
4. "Correct ball behaviour — bouncing, rebounding, and sometimes hopping."

Correction on 4: "hops are not a by-product of good physics — the parameters that make a ball feel right exist partly to suppress them. Hopping gets one explicit tuning control, dialled in deliberately."

### What "stylized" means (Brief; Addendum §1)

"'Stylized' here means simplified geometry and hand-painted textures, with real-world dimensions and real lighting behaviour preserved — the realism lives in the proportions, the insert glow and the ball, not the polygon count."

Addendum §1: "The research says geometry is not the bottleneck." VPE styleguide "budgets 500–2,000 triangles for standard playfield objects and uses a single LOD, because a pinball table is a small, fixed, near-field scene. What is expensive is lighting and texture memory."

Realism lives in:
- "Correct dimensions. Standard-body playfield 20.25 × 42.00 in, ball 26.99 mm at ~80 g, flipper bat 3.125 in rubbered, pitch 6.5°. They cost nothing to honour and everything to get wrong. The one browser pinball attempt the research found was criticised first for the ball being the wrong size relative to the playfield."
- "Correct lighting behaviour. Inserts modelled as a light below a translucent playfield with a cup mesh, not as decals. Four independently-driven channels: GI, feature inserts, flashers, architectural."
- "Correct ball behaviour. Elasticity falloff, coil ramp-up, scatter at zero."
- "Correct silhouette and scale on the walk-up — cabinet proportions, backbox height, the glass."

Warning: "If the author instead wants a genuinely non-realistic visual language — flat shading, exaggerated proportions, cel-shaded dragon — that is a legitimate and different product, and the brief's 'feels like a real machine' criterion should be rewritten rather than quietly contradicted."

### The calibration reference (Brief)

"The author has a real machine within walking distance and plays it regularly. ... DragonWar can be tuned against a physical reference, on demand, throughout development. 'Feels like real pinball' stops being an aspiration and becomes an acceptance step someone can actually perform — play the machine, play the build, name what differs." Specific comparison points: "Cradling, flipper snap, and how shots reject and rebound." (Success Criteria 4)

### Machine behaviours a sim usually gets wrong

See section 4.8 (C-51 to C-60) — tilt semantics, slam tilt sensor, ball-save grace/hurry-up/timer-start, match multiple-of-ten, ball search three-phase, flashers as coil-class.

### Tuning knobs and starting values (Addendum §4) — verbatim table

"Dimensionless VPX values port directly; the strength numbers are VPX-internal units and do not."

| Parameter | Starting value | Note |
|---|---|---|
| Physics tick | 480–1000 Hz fixed | 480 Hz is a demonstrated working floor for a browser pinball |
| Flipper elasticity | 0.88 | |
| Elasticity falloff | 0.15 | **The primary feel knob.** Lively at low speed, no pingy rebound at high speed |
| Flipper friction | 0.8–0.9 | What makes centre shots and backhands possible |
| Scatter angle | **0** | Recommended for every era; randomness is tuned *down* |
| Coil ramp-up | 2.5 | Solenoid acceleration time — this is what enables light-tap technique |
| Playfield pitch | 6.5° | Expose it. The strongest single global difficulty knob |
| Flipper pulse | ~30 ms at 70% power, then 25% hold | *Medium confidence* — MPF documentation example, not a measurement |
| Airball tendency | one explicit control | The author wants occasional hops; this is deliberate, not emergent |

"Do not model playfield walls and floor as zero-thickness planes — they need real thickness regardless of physics approach."

Era note (Addendum §7, Q1): "flipper strength is era-banded (roughly 500–1000 for electromechanicals up to 3200–3300 for mid-90s-and-later, in VPX units), so calibrating against a specific machine means inheriting that machine's era feel."

---

## 6. Presentation decisions

### Camera / walk-up

- "The anchor is a feeling: walking up to a machine, seeing the backbox lit, the camera settling down onto the playfield — then earning the letters and watching the dragon fire the balls at you." (Brief, The Moment)
- "The walk-up is a first-class feature. It is cheap to build, it is the first thing anyone feels, and it sets the frame for everything after."
- "The approach. Backbox and backglass first, then the descent to the playfield."
- Scope item: "The walk-up-and-descend presentation."
- Camera lock is undecided: lightmap UV scheme is "standard UVs (camera-free, VR-capable) or camera-projected (VPX-style, locks the camera)? Must be decided before modelling starts." (Addendum §7, Q3)

### Visual style

- "stylized / low-poly" (Addendum §1); "simplified geometry and hand-painted textures, with real-world dimensions and real lighting behaviour preserved."
- "the realism lives in the proportions, the insert glow and the ball, not the polygon count."
- "That is what lets a low-poly table still feel like walking up to a real machine."
- Triangle budget reference: "500–2,000 triangles for standard playfield objects ... a single LOD."

### Colour

- "Rustic playfield art and materials, saturated functional inserts."
- "Muted earth tones across the board would have undercut it."
- "The split costs nothing thematically because it is how real machines already look: painted wood under bright RGB."
- "The rustic register lives in the art; the grammar lives in the light."

### The dragon as visual protagonist

- "The dragon is the table's protagonist, not set dressing. It is the bash target, the multiball source, and the thing you are at war with. Art and rules both answer to it." (Brief, The Moment)
- Off-centre bash toy; mouth ejects locked balls "as dragon fire"; "the dragon swallows your balls and spits them back."

### Backglass

- "Animated, pixelated, dot-matrix-looking."
- "period-authentic — Williams/Bally dot-matrix displays are exactly this."
- "carries the job of establishing the war before a ball is plunged."

### Lighting

- "insert lighting that carries game state, general illumination, flashers, and mechanical audio" are "Lights and sound of a real machine."
- Four channels: "GI, feature inserts, flashers, architectural."
- Inserts as sub-playfield light with cup mesh, not decals.
- Spinner loop is "the loud one; the other is the quiet return."

### Audio

- "mechanical audio" — coil fires, flipper snap, ball roll on wood, drop bank resetting.
- "Generated for now, with recorded real-machine sounds swappable in later."
- Recorded sounds "will sound more like a real machine than any sample pack because it is one."

### Tone / voice / feel words (verbatim)

- "the balls come out like fire"
- "You are a knight, the flippers are your weapon, and the war is the multiball itself."
- "the thing you are at war with"
- "Every flip during multiball is a strike against the dragon"
- "the core verb of pinball is the core verb of the fiction"
- "watching the dragon fire the balls at you"
- "The balls you locked are the balls that come back at you."
- "the dragon swallows your balls and spits them back — is the whole moment"
- Mode fictions: "Arming oneself", "A call to arms", "Fight the monster", "The charge", "The war"
- "a knight's campaign that escalates — arm yourself → answer the call → fight a monster → joust → war with the dragon"
- "a spine a player can feel without being told"
- Joust: "charge, pass, wheel around, charge again"
- "Nudging without tilt risk is not nudging — the danger is the point."
- "Feel wins over fidelity wherever the two conflict."
- "It feels like real pinball and stays playable."
- "feels like walking up to a real machine"
- "Lively at low speed, no pingy rebound at high speed"
- "randomness is tuned down"
- "make the table feel authored rather than generated"
- "reads as a real machine rather than an invented one"
- "Rustic" / "painted wood under bright RGB" / "saturated functional inserts"
- "the loud one" / "the quiet return"
- "so the table has depth rather than one trick"
- "one machine, built properly"

---

## 7. Constraints

### Licence / provenance (Brief, Technical Direction; Addendum §5; project CLAUDE.md)

- "Open-source release under GPL-3.0." "GPL-3.0 specifically, and the reason is not cosmetic: Apache-2.0 (Babylon.js) is incompatible with GPL-2.0-only but compatible with GPL-3.0, and vpx-js's or-later clause is what makes that move available."
- "Final stack: DragonWar GPL-3.0 · Babylon.js Apache-2.0 · MPF ontology MIT. All compatible."
- vpx-js: "GPL-2.0-or-later" per source headers; `package.json` "declares only 'GPL-2.0' — ambiguous, do not rely on it."
- "Had vpx-js been GPL-2.0-only, the chosen renderer and the chosen physics core could not have been combined ... This is worth re-checking if either dependency is ever swapped."
- vpinball: "dual-licensed mid-migration: converted files carry `// license:GPLv3+` on the first line; everything unmarked stays under MAME-derived terms" forbidding commercial use. PinMAME "strictly a non-profit project" — out of scope.
- MPF is MIT (docs CC BY 4.0). wpc-emu is Apache-2.0, "Not needed."
- "The author's stated requirement — free to distribute — is satisfied by GPL-3.0 by design, and copyleft guarantees it stays that way downstream."
- "Not legal advice; this records what the licence documents say."
- Project rule (CLAUDE.md): "nothing enters this repository without known provenance" — record in ATTRIBUTIONS.md first, verify at source, no unlicensed / NC / GPL-2.0-only / commercial-machine assets; generated assets recorded with tool and date; vpx-js port must preserve its copyright notices.

### Platform

- "Browser-first, Windows and macOS."
- "Desktop packaging via Tauri later, at near-zero cost from the same build."
- "Click-and-play distribution. No install, no Windows requirement, no ROM hunting."
- Not: mobile, VR, cabinet hardware, physical controllers.

### Performance expectations

- Physics: "a purpose-built analytic time-of-impact physics core at a fixed 480–1000 Hz, ported rather than derived"; "480 Hz is a demonstrated working floor for a browser pinball."
- Rendering: "Babylon.js for rendering on a WebGL2 floor with WebGPU progressive enhancement."
- Asset budget: geometry is not the bottleneck; "What is expensive is lighting and texture memory." Single LOD.
- Must "stay playable" (realism criterion 1).

### Technical direction statements (Brief, Technical Direction; Addendum §6)

- "Settled by the companion research and not re-argued here."
- Physics "ported rather than derived" from vpx-js: "A GPL-compatible DragonWar can port that core directly, including twenty years of tuning constants that would otherwise have to be rediscovered."
- "MPF's device ontology and event vocabulary for a rules layer kept strictly separate from physics."
- "Physics emits switch events; rules are a pure function of events → state → presentation, with no knowledge of ball velocity. That makes the rules headlessly testable."
- "Keeping rules, physics, and presentation properly separated costs nothing now and leaves that door open."
- Audio "behind a swappable asset interface from day one."
- Walls and floor need real thickness.
- Dragon lock is an MPF `multiball_lock`, not `ball_hold`.
- Flashers charted as coil-class outputs with duty-cycle limits, not on the lamp matrix / insert layer.
- Playfield pitch should be exposed as a knob.
- Full research: `_bmad-output/planning-artifacts/research/technical-pinball-simulation-engine-and-technology-2026-08-26/research.md`.

---

## 8. Decisions taken with rationale

### From Addendum §6 (verbatim table)

| Decision | Rationale |
|---|---|
| One table, not an engine | The single scope decision that makes this achievable solo. The field is littered with abandoned platforms. |
| Browser-first | Overrides the research's native-first recommendation, which was reasoning about a *commercial* product. For open source, click-and-play is the entire share story. Tauri wraps the same build later at near-zero cost. |
| 1–4 player hot seat | Matches a real machine and fixes per-player state in the rules layer from day one. Retrofitting touches every rule. |
| Full nudge, tilt, slam tilt | Nudging without tilt risk is not nudging — the danger is the point. |
| Stylized art | Mitigates the largest unbudgeted risk. See §1 for the reconciliation with the realism goal. |
| Rules layer separate from physics | Physics emits switch events; rules are a pure function of events → state → presentation, with no knowledge of ball velocity. That makes the rules headlessly testable. |

### From elsewhere

| Decision | Rationale | Source |
|---|---|---|
| GPL-3.0 (not GPL-2.0) | Apache-2.0 Babylon.js is incompatible with GPL-2.0-only, compatible with GPL-3.0; vpx-js's or-later clause permits the move. | Brief, Technical Direction; Addendum §5 |
| Open source at all | "de-risks the largest work item: the licence wall that blocked reusing proven pinball physics applies to commercial use." | Brief, Technical Direction |
| Port physics from vpx-js rather than derive | "twenty years of tuning constants that would otherwise have to be rediscovered"; "The physics is sound and readable." | Brief, Technical Direction; Key Risks |
| Babylon.js, WebGL2 floor + WebGPU enhancement | Settled by research. | Brief, Technical Direction |
| MPF ontology / event vocabulary | MIT-licensed; "specifies all of this precisely enough to implement directly." | Brief, The Table; Addendum §5 |
| Realism replaced by four checkable criteria | "nobody has defined realism for pinball." | Brief, What "Realistic" Means Here |
| Hopping as one explicit control | Good-feel parameters suppress hops; author wants occasional hops deliberately. | Brief; Addendum §4 |
| Calibrate against the real machine within walking distance | Turns "feels like real pinball" into "an acceptance step someone can actually perform." | Brief |
| Walk-up as first-class feature | "cheap to build, it is the first thing anyone feels, and it sets the frame." | Brief, The Moment |
| Dragon as protagonist | "It is the bash target, the multiball source, and the thing you are at war with." | Brief, The Moment |
| War lives inside multiball | "Every flip during multiball is a strike against the dragon." | Brief, The Moment |
| Standard machine behaviours in scope | "its absence is conspicuous." | Brief, The Table |
| Backglass: animated pixelated DMD look | Period-authentic; pairs with low-poly; removes hi-res backglass art cost. | Addendum §8 |
| Colour grammar: rustic art, saturated inserts | Insert colour is functional; muted tones would undercut it; real machines already look this way. | Addendum §8 |
| Joust = alternating orbit shots | Joust is repeated passes; orbit is mechanically that; Godzilla loop-combo precedent. | Addendum §8 |
| Spinner on one loop only | "So the two orbits are not the same shot." | Addendum §8 |
| Off-centre bash toy | Dead-centre rejects to the drain; off-centre deflects to a flipper and creates a backhand that rewards friction 0.8–0.9; modern standard. | Addendum §8 |
| Physical (not virtual) lock | Real machines went virtual for BOM/trough reasons that don't apply; the physical payoff is the whole moment. | Addendum §8 |
| Lock 2 + 1 in play = 3-ball | Honours ball-count grammar; reserves 4-ball. | Addendum §8 |
| Lock disabled during multiball | Under-leg shot counts as a bash hit, not re-lock. | Addendum §8 |
| Audio generated now, swappable interface | "Cheap if designed in, painful to retrofit." | Addendum §8 |
| Author records own machine sounds | "Unambiguously his, no licensing question"; sounds more real than sample packs. | Addendum §8 |
| Scatter angle 0 | "Recommended for every era; randomness is tuned down." | Addendum §4 |
| Expose playfield pitch | "The strongest single global difficulty knob." | Addendum §4 |
| Progressive jackpots seeded by prior play; extra balls from an achievement menu | "cheap to implement and make the table feel authored rather than generated." | Addendum §2 |
| Wizard mode deferred | "even commercial machines ship their deepest modes in later code updates." | Brief, Key Risks; Addendum §9 |

---

## 9. Rejected alternatives / options considered

| Alternative | Verdict | Reason | Source |
|---|---|---|---|
| Platform / engine hosting many tables; table editor; plugin system | Rejected for v1 (authoring path deferred) | "DragonWar is a game, not an engine"; "The field is littered with abandoned platforms"; "the thing most likely to erode." | Brief, Scope; Addendum §6, §9 |
| Native-first (research recommendation) | Overridden | Research "was reasoning about a commercial product"; for open source "click-and-play is the entire share story." | Addendum §6 |
| Photoreal art | Rejected | "the photoreal art budget that would sink a solo project." | Addendum §1 |
| Genuinely non-realistic visual language (flat shading, exaggerated proportions, cel-shaded dragon) | Not chosen; flagged as "a legitimate and different product" | Would require rewriting the "feels like a real machine" criterion "rather than quietly contradicted." | Addendum §1 |
| Muted earth tones across the board (including inserts) | Rejected | "would have undercut" the functional insert-colour channel. | Addendum §8 |
| High-resolution backglass art | Rejected | DMD look "removes the need ... entirely." | Addendum §8 |
| Dead-centre bash toy | Rejected | "rejects balls straight down the middle"; fails Lawlor's miss test; no backhand. | Addendum §8 |
| Virtual ball lock | Rejected | Real-machine reasons (BOM, trough reliability) don't apply to a sim; physical payoff is "the whole moment." | Addendum §8 |
| `ball_hold` device for the lock | Rejected | Lock is a `multiball_lock` — balls out of play, deducted from count. | Addendum §8 |
| Same-loop repeated joust | Rejected | Alternation is "Physically what a joust looks like, and harder than hammering one shot." | Addendum §8 |
| Spinner on both loops | Rejected | Would make the two orbits the same shot. | Addendum §8 |
| Hops as emergent physics by-product | Rejected | Feel parameters exist "partly to suppress them"; must be an explicit control. | Brief; Addendum §4 |
| Non-zero scatter angle | Rejected as default | Scatter 0 "Recommended for every era." | Addendum §4 |
| Zero-thickness walls/floor | Rejected | "they need real thickness regardless of physics approach." | Addendum §4 |
| Folding flashers into the insert layer | Rejected | Flashers are coil-class with duty-cycle limits. | Addendum §3 |
| Extra ball from a single lane | Rejected | Menu of long-horizon achievements instead. | Addendum §2 |
| vpinball as physics source | Rejected | Dual-licensed; unmarked files carry non-commercial MAME terms. | Addendum §5 |
| PinMAME / ROM emulation | Out of scope | "strictly a non-profit project"; original table needs no ROMs. | Addendum §5; Brief, Scope |
| GPL-2.0-only for DragonWar | Rejected | Incompatible with Apache-2.0 Babylon.js. | Addendum §5 |
| Relying on vpx-js `package.json` licence field | Rejected | "ambiguous, do not rely on it"; headers say or-later. | Addendum §5 |
| Deriving physics from scratch | Rejected | Would have to rediscover "twenty years of tuning constants." | Brief, Technical Direction |
| Open-ended pursuit of realism | Rejected | Replaced by "a fixed acceptance bar (criterion 4)." | Brief, Key Risks |
| Fabricating a moat / differentiation | Rejected | "fabricating a moat here would be worse than having none." | Brief, What Makes This Different |
| Multiple tables as next step | Rejected | "the obvious next step is not more tables — it is a better DragonWar." | Brief, Vision |
| Modes independently available (vs. campaign gating) | Undecided | Open Question 6. | Addendum §7, §8 |

---

## 10. Open questions for the PRD

### Addendum §7 — verbatim

1. **Which machine is at the bar, and from which era?** The author has a real machine within walking distance and plays it regularly — the calibration reference is real. But flipper strength is era-banded (roughly 500–1000 for electromechanicals up to 3200–3300 for mid-90s-and-later, in VPX units), so calibrating against a specific machine means inheriting that machine's era feel. Fine, but it should be deliberate.
2. **Which colour means what?** The grammar is settled in principle (§8) but the specific state-to-colour mapping is not. Assign it early and hold it.
3. **Which lightmap UV scheme** — standard UVs (camera-free, VR-capable) or camera-projected (VPX-style, locks the camera)? Must be decided before modelling starts.
4. **How is sound generated?** The strategy is settled (§8); the synthesis approach is not. Ball roll in real simulators is sample playback driven by velocity and position with a pitch shift by surface, not synthesis — a generated-audio approach needs its own answer for that.
5. **Playfield geometry.** The shot map is settled (§8); drawing it — where the loops enter and exit, ramp height and return, the dragon's exact position and the lock lane beneath it, pop bumper and slingshot placement — is the PRD's first real design problem, and it iterates with the rules rather than following them.
6. **How the campaign gates.** Are the modes independently available, or does the joust need the monster beaten first? The escalating reading in §8 suggests a sequence; the PRD should decide.

"Resolved since first draft: the theme spine (knight, flippers as weapon, war = multiball); the project licence (GPL-3.0, §5); physical access to a reference machine; the feature-mode set, backglass treatment and audio strategy; the colour-grammar split, the joust mechanic, and the shot map including the dragon's placement and physical lock (§8)."

### Open items found elsewhere (not in §7's list)

7. Match probability: "the widely-repeated 8% default could not be confirmed against a primary source — check before implementing." (Addendum §3)
8. Flipper pulse timing "~30 ms at 70% power, then 25% hold" is "Medium confidence — MPF documentation example, not a measurement." (Addendum §4)
9. Flipper strength in real units — "the strength numbers are VPX-internal units and do not [port directly]." (Addendum §4)
10. Physics tick: fixed somewhere in 480–1000 Hz; exact value unchosen. (Addendum §4)
11. Whether the stylized reading in Addendum §1 is confirmed by the author, or whether a non-realistic language is wanted (which would rewrite success criterion 4's framing). (Addendum §1)
12. How many scoring hits win the war; jackpot values; hurry-up values; joust build magnitude (Godzilla 10x is a precedent, not a decision). (Addendum §2, §8 — unspecified)
13. Which loop carries the spinner. (Addendum §8 — "On one loop only", side unstated)
14. Whether a drop-target bank exists (mentioned only as a sound example: "a drop bank resetting"). (Addendum §8)

---

## 11. Key risks (Brief, Key Risks — verbatim)

- **Art is the largest unbudgeted item.** "No published effort figure for authoring one pinball table exists anywhere — the research looked twice and found only unattributed month-scale claims. The stylized direction is the mitigation, but art remains the most likely place this project stalls."
- **Feel is unbounded.** "Flipper tuning has no natural stopping point. The mitigation is a fixed acceptance bar (criterion 4) rather than an open-ended pursuit of realism."
- **The physics reference is frozen.** "The proven core this project should port from stopped development in November 2020 with its scripting layer unfinished. The physics is sound and readable; nobody is maintaining it."
- **Solo project fatigue.** "One table, phased content, and a playable-early loop are the structural defences. The research confirmed that even commercial machines ship their deepest modes in later code updates — so a complete v1 does not require the final wizard mode."

Additional risk signals elsewhere:

- "The field is empty, not contested. ... nobody has done it, and nobody has proved it can be done well." (Brief, What Makes This Different)
- Scope erosion: table editor / plugin / other tables is "the thing most likely to erode." (Brief, Scope)
- Licence re-check "if either dependency is ever swapped." (Addendum §5)
- Provenance: one already-found case where `package.json` disagreed with source headers (project CLAUDE.md).
- Stylized-vs-realism tension: "These pull against each other." (Addendum §1)

---

## 12. Qualitative / feel content at risk of being dropped by an FR structure

These are intents, not behaviours. An FR list will lose them unless carried explicitly (e.g. as design principles, a "feel" section, or acceptance notes).

1. **The judging principle.** "Everything in this project is judged by whether it serves that moment." (Brief, Executive Summary) — the dragon-fire multiball is the yardstick for every feature decision.
2. **The dragon is the protagonist.** "not set dressing ... Art and rules both answer to it." (Brief, The Moment)
3. **Fiction/mechanic alignment.** "the core verb of pinball is the core verb of the fiction"; skill shot lands "on the same beat" as arming; joust is "charge, pass, wheel around, charge again." Each mode's mechanic *is* its fiction, not decorated by it.
4. **Escalating campaign feel.** "a spine a player can feel without being told." Even if gating is left open, the escalation should be legible.
5. **"Feel wins over fidelity wherever the two conflict."** and "stays playable" — a tie-breaker rule, not a feature.
6. **The walk-up as emotional frame.** "the first thing anyone feels, and it sets the frame for everything after." The backglass "carries the job of establishing the war before a ball is plunged."
7. **Readability without instructions.** Insert colour is "how the player reads the table without instructions." Hold the grammar once assigned.
8. **"Authored rather than generated."** Progressive jackpots seeded by prior play and achievement-menu extra balls exist to make the table feel authored.
9. **Loud loop / quiet return.** Asymmetry between the two orbits is a feel decision, not just a spinner placement.
10. **The lock payoff.** "The balls you locked are the balls that come back at you." / "the dragon swallows your balls and spits them back — is the whole moment." The physical lock is there for this feeling.
11. **Nudge danger.** "the danger is the point." Nudge without tilt risk fails the intent.
12. **Randomness tuned down; hops deliberate.** "Lively at low speed, no pingy rebound at high speed." Scatter 0; airballs are an authored occasional event.
13. **Rustic register.** "painted wood under bright RGB"; "The rustic register lives in the art; the grammar lives in the light."
14. **Realism lives in proportions and light.** "the insert glow and the ball, not the polygon count." Wrong ball size was the first criticism of the only prior browser attempt.
15. **Honesty of positioning.** "fabricating a moat here would be worse than having none"; "Being finished is the moat." The PRD should not inflate ambition.
16. **The bar-machine test as ritual.** "run it throughout, not at the end" — a development practice, not a milestone.
17. **Sound provenance as feel.** Author-recorded machine sounds "will sound more like a real machine than any sample pack because it is one."
18. **"One machine, built properly."** / "shipping one excellent table is the whole job." — the anti-scope-creep sentiment that must survive every scope discussion.
19. **Lawlor's miss test as design ethic.** "a miss must come back playable, not drain" — a per-shot design principle rather than a single FR.
20. **Standard-machine literacy.** "reads as a real machine rather than an invented one"; standard behaviours are in because "its absence is conspicuous" — the table should feel familiar to pinball players.
