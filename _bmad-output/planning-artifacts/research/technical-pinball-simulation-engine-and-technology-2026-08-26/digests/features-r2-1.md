# Digest: Feature gaps — device model & machine operations (round 2)

Scope note: this round privileged primary documents (MPF source code on GitHub, Stern's own game-code README, an OCR'd Stern operation manual, the rec.games.pinball glossary). Two intended primary surfaces failed: Stern's PDF manuals/rulesheets are image-or-binary PDFs that did not yield extractable text, and Jersey Jack's document hosts were unreachable. Those failures are recorded as findings under "Looked for but could not find."

---

## Findings

### Q1 — Diverter, lane change, flasher

**Diverter (definition).** A diverter is "A playfield object that can swing to divert the ball in to one of several paths."
- source: http://www.lysator.liu.se/pinball/glossary/ | publisher: rec.games.pinball glossary (Lysator, Linköping University) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: feature-taxonomy

**Diverter (device model).** Mission Pinball Framework models a diverter as a first-class typed device whose class docstring is "Represents a diverter in a pinball machine"; its config surface is `activation_coil` and `deactivation_coil` (the coils that move the blade), `type` which is either `pulse` (momentary activation) or `hold` (sustained activation), `activation_time` (duration before automatic deactivation), `targets_when_active` / `targets_when_inactive` (the destination devices the ball is routed to in each state), `feeder_devices` (source devices whose ejects pass through the diverter), `activation_switches`, `disable_switches`, and `ball_search_order`.
- source: https://raw.githubusercontent.com/missionpinball/mpf/dev/mpf/devices/diverter.py | publisher: Mission Pinball Framework (missionpinball/mpf, dev branch) | pub_date: unknown (live source) | accessed: 2026-08-26 | confidence: high | class: ontology

**Diverter (routing semantics — the simulator-relevant part).** The diverter is not driven by the rules directly; it is driven by *eject intent*. When a feeder device attempts an eject, the diverter receives the event, reads the intended target device, and sets its own state accordingly: if the target is in `targets_when_active` it enables, if the target is in `targets_when_inactive` it disables. It also manages concurrent ejects through queue management, blocking or allowing ejects depending on configuration.
- source: https://raw.githubusercontent.com/missionpinball/mpf/dev/mpf/devices/diverter.py | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ontology
- Implication for the sim: ball routing should be expressed as "device A ejects toward device C", with diverters resolving their own position from that declared target — not as scripted coil pulses.

**Diverter variants.** MPF's documentation navigation enumerates diverter sub-topics: Up-Down Ramps, Using a Servo as Diverter, Using a Stepper as Diverter, and Dual Coil Diverter — i.e. a diverter's actuator may be a single coil, two coils, a servo, or a stepper.
- source: https://missionpinball.org/latest/mechs/diverters/ | publisher: Mission Pinball Framework docs | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: ontology
- Caveat: only the navigation shell rendered; the body text did not. The four variant names are from nav links, and the events `diverter_(name)_activating` / `_deactivating` / `_enabling` / `_disabling` were visible in the same shell.

**Lane change (definition — CONFIRMED as a standard convention).** "Games featuring lane change allow the player to shift the lit lights in a set of lights on the playfield, such as a set of lights on the outlanes and inlanes."
- source: http://www.lysator.liu.se/pinball/glossary/ | publisher: rec.games.pinball glossary (Lysator) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: feature-taxonomy
- Note: this authoritative definition is *general* — a set of lights — and explicitly names outlanes/inlanes as the example, not top lanes.

**Lane change (which lanes, and the flipper-button trigger).** The convention that a flipper-button press rotates the lit insert to an adjacent lane is most commonly applied to the top skill-shot lanes, and also to inlanes/outlanes depending on the game; it was broadly standard on 1980s–1990s Bally/Williams solid-state and DMD games, and on modern Stern it is a per-title feature rather than universal.
- source: https://tecnopinball.org/beta/old/glosario_pw.php | publisher: Tecnopinball (Spanish-language Williams/Bally glossary) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: feature-taxonomy
- source: http://my.reset.jp/~yuhto-ishikawa/pinball/name.major.html | publisher: personal pinball reference (Yuhto Ishikawa) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: feature-taxonomy
- Honesty flag: reached via Perplexity aggregation; I did not open a manufacturer manual that states the flipper-button rotation rule in the manufacturer's own words. Treat "top lanes, rotate on flipper press, wraps around" as an *unverified-but-strongly-indicated* convention, medium confidence at best. Some Bally/Williams games use a dedicated lane-change switch rather than the flipper button itself.
- source: https://homepinballrepair.com/flipper-components-pinball-flipper-parts-part-numbers/ | publisher: Home Pinball Repair | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: hardware-fact

**Flasher — no glossary definition exists in the authoritative glossaries.** Neither the rec.games.pinball glossary nor Wikipedia's Glossary of pinball terms contains an entry for "flasher". This is a genuine absence, not a search failure.
- source: http://www.lysator.liu.se/pinball/glossary/ | publisher: rec.games.pinball glossary | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: feature-taxonomy
- source: https://en.wikipedia.org/wiki/Glossary_of_pinball_terms | publisher: Wikipedia | pub_date: unknown (live article) | accessed: 2026-08-26 | confidence: high | class: feature-taxonomy

**Flasher (what it actually is, from hardware documentation).** In a Stern operation manual, flashers / flash lamps are documented in the **coil and driver charts** (with transistor designations in the Q19–Q32 range), not in the lamp-matrix tables — i.e. a flasher is a high-current lamp driven from a solenoid/driver-board transistor output, and is electrically a coil-class output rather than a matrix-lamp-class output.
- source: https://archive.org/stream/Stern_Pinball_The_Sopranos_Manual/Sopranos_Manual_djvu.txt | publisher: Stern Pinball (manual OCR hosted by Internet Archive) | pub_date: unknown (game released 2005) | accessed: 2026-08-26 | confidence: medium | class: hardware-fact
- Implication for the sim: flashers belong in the driver/output layer alongside coils, with duty-cycle limits, not in the insert-lamp layer. This matters because round 1's "four lighting channels" model must not collapse flashers into inserts.

**Flasher is not a distinct MPF device type.** MPF's mechs index does not list flashers as a typed device; it lists "Lights / LEDs" and "Coils (Solenoids)" separately, and MPF's device-module registry contains `lights`, `light_stripes`, `light_rings`, `blinkenlights`, and `coils` — but no `flashers` collection.
- source: https://missionpinball.org/latest/mechs/ | publisher: Mission Pinball Framework docs | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ontology
- source: https://raw.githubusercontent.com/missionpinball/mpf/dev/mpf/mpfconfig.yaml | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ontology

---

### Q2 — Virtual vs physical ball lock

**Virtual locks are an acknowledged category in the general glossary.** Wikipedia's ball lock entry describes the physical case as "A mechanism during a game where achieving a certain shot will catch a ball and hold it in place…" and adds: "Some games may use 'virtual locks' which still allow a player to progress towards a multiball without physically trapping a ball."
- source: https://en.wikipedia.org/wiki/Glossary_of_pinball_terms | publisher: Wikipedia | pub_date: unknown (live) | accessed: 2026-08-26 | confidence: high | class: feature-taxonomy
- This closes round 1's gap on the *definition*: a virtual lock advances multiball qualification in software while the ball is returned to play; at multiball start the extra balls are auto-launched from the trough rather than released from a lock mech.

**MPF treats the lock as a logical, per-player counter by default, with physical lock devices as an optional add-on.** MPF defines `multiball_locks` as a device collection separate from `ball_devices` and separate from `ball_holds`, i.e. the lock count is a rules object, not a hardware object.
- source: https://raw.githubusercontent.com/missionpinball/mpf/dev/mpf/mpfconfig.yaml | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ontology
- Note: MPF's own prose pages (`/latest/game_logic/multiballs/multiball_locks/`, `/latest/config/multiball_locks/`) would not render body text for fetching, so the strongest MPF statement — that locks are stored per player and are *not* determined by how many balls a device physically contains — is reported here at **medium** confidence on aggregation only.
- source: https://missionpinball.org/latest/game_logic/multiballs/multiball_locks/ | publisher: Mission Pinball Framework docs | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: ontology

**Why machines adopt virtual locks.** The reasons given are: trough capacity — a virtual lock keeps only one ball physically out of the trough so the trough can always supply a 3–4 ball multiball; BOM cost and mech complexity — physical locks need gates, diverters, magnets, subways, kickouts and their sensors; reliability — physical locks add stuck-ball and mis-count failure modes that trigger ball search; and per-player tracking — with a physical lock another player can "steal" your locked balls, whereas a software counter is per-player.
- source: (Perplexity aggregation over https://en.wikipedia.org/wiki/Glossary_of_pinball_terms, https://pinside.com/pinball/forum/topic/virtual-ball-locks, https://missionpinball.org/latest/config/multiball_locks/) | publisher: multiple/aggregated | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: rules-pattern
- Honesty flag: this rationale is coherent and consistently reported but I did not find a manufacturer document stating it. Mark as design-community consensus, not manufacturer fact.

**Concrete example — physical lock (documented in a manufacturer file).** Stern's Jurassic Park game code documents "Raptor Locks" with a ball physically "locked in Raptor Pen" toward a Triball multiball, alongside a "Raptor Up Post" and gate mechanics — a real ball-storing mech named in Stern's own code notes.
- source: https://sternpinball.com/wp-content/uploads/2024/11/jurassic_park_LE_1.15-README.txt | publisher: Stern Pinball | pub_date: 2024-11 | accessed: 2026-08-26 | confidence: high | class: hardware-fact

**Concrete example — Pro vs Premium/LE split (the canonical virtual/physical pairing).** Stern's Metallica is reported to lock balls physically in the Coffin via a magnet on Premium/LE, while the Pro model tracks the same Coffin locks virtually (captive-ball hits increment a lock count, no ball is stored, and multiball balls come from the trough).
- source: https://tiltforums.com/t/metallica-rulesheet/228 | publisher: Tilt Forums community rulesheet | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: rules-pattern
- source attempted: https://wp.sternpinball.com/wp-content/uploads/2025/04/Metallica-Remastered-Rulesheet.pdf | publisher: Stern Pinball | pub_date: 2025-04 | accessed: 2026-08-26 | confidence: n/a — **PDF was binary/unextractable; the primary confirmation was NOT obtained.**
- Implication for the sim: the Pro/Premium/LE model split is itself a design pattern worth reproducing — identical rules, one build with a lock mech and one with a counter.

---

### Q3 — Machine operations layer (tilt, slam tilt, ball search, match, ball save, bonus)

**Tilt (what it does to the ball and to scoring).** "A pinball machine will tilt, aborting the current ball and discarding End-of-ball bonus if the player moves the cabinet too violently."
- source: http://www.lysator.liu.se/pinball/glossary/ | publisher: rec.games.pinball glossary | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern
- The load-bearing detail for a sim: tilt **does not zero the score already earned this ball** — it forfeits the *end-of-ball bonus* and ends the ball.

**Tilt (detection).** "The penalty given to a player who is too physically rough with a pinball game. A tilt mechanism detects when the machine is being lifted, bumped, tilted or shaken beyond an acceptable level."
- source: https://en.wikipedia.org/wiki/Glossary_of_pinball_terms | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern

**Tilt (the switch, in manufacturer vocabulary).** A Stern manual refers to "Closure of the Plumb Bob Tilt Switch according to the number of tilts set" — i.e. the plumb-bob switch closure is counted against an operator-set warning count.
- source: https://archive.org/stream/Stern_Pinball_The_Sopranos_Manual/Sopranos_Manual_djvu.txt | publisher: Stern Pinball (via Internet Archive) | pub_date: unknown (2005 title) | accessed: 2026-08-26 | confidence: high | class: hardware-fact

**Tilt warnings are an operator adjustment with a low default.** Stern Standard Adjustment 15 is "Tilt Warnings", default **01** on this title; Stern's modern code exposes the same as `TILT_WARNINGS`, which Competition/tournament install sets to **2**.
- source: https://archive.org/stream/Stern_Pinball_The_Sopranos_Manual/Sopranos_Manual_djvu.txt | publisher: Stern Pinball | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: settings
- source: https://sternpinball.com/wp-content/uploads/2024/11/jurassic_park_LE_1.15-README.txt | publisher: Stern Pinball | pub_date: 2024-11 | accessed: 2026-08-26 | confidence: high | class: settings

**Tilt (state machine, from a working engine).** MPF's tilt mode reads `warnings_to_tilt` (warnings needed before a tilt), `multiple_hit_window` (milliseconds during which further switch hits do not count as a new warning — debounce for a swinging bob), `settle_time` (milliseconds to wait after the last tilt hit), and `tilt_warnings_player_var` (warning count is stored **per player**). It posts `tilt_warning`, `tilt_warning_(number)`, `tilt`, `slam_tilt`, and `tilt_clear` — the last described as "Posted after a tilt, when the settling time has passed after the last tilt switch hit."
- source: https://raw.githubusercontent.com/missionpinball/mpf/dev/mpf/modes/tilt/code/tilt.py | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ontology
- Three sim-critical details here: warnings are per-player and reset between players; the bob keeps swinging after a hit so a debounce window and a settle time are both required; and after a tilt the machine waits for **all** balls to drain before the ball actually ends.

**Tilt (effect on outputs).** On tilt MPF sets `game.tilted = True`, disables flippers and autofire coils, ends the current ball only, waits for balls to drain, then clears.
- source: https://raw.githubusercontent.com/missionpinball/mpf/dev/mpf/modes/tilt/code/tilt.py | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ontology

**Slam tilt (what it is and how it differs).** "Tilting the game so violently it immediately aborts all games in progress and reboots." Wikipedia adds it is "typically, the most severe penalty a solid-state pinball game can mete out for a player's rough handling."
- source: http://www.lysator.liu.se/pinball/glossary/ | publisher: rec.games.pinball glossary | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern
- source: https://en.wikipedia.org/wiki/Glossary_of_pinball_terms | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern

**Slam tilt (trigger — it is a cabinet switch, not the bob).** A Stern manual documents a **SLAM TILT switch on the Coin Door** that "ends the current game(s)." Slam tilt is therefore a *different sensor* from the plumb bob: it detects a sharp blow to the cabinet/coin door (historically an anti-cheat measure against pounding the machine to trip coin switches).
- source: https://archive.org/stream/Stern_Pinball_The_Sopranos_Manual/Sopranos_Manual_djvu.txt | publisher: Stern Pinball | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: hardware-fact

**Slam tilt (engine model).** MPF has a distinct `slam_tilt_switch_tag` and `tilt_slam_tilt_events`; on slam tilt it posts `slam_tilt`, and if a game is active sets `game.slam_tilted = True` and then calls `tilt()`.
- source: https://raw.githubusercontent.com/missionpinball/mpf/dev/mpf/modes/tilt/code/tilt.py | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ontology
- Gap flag: the MPF source I read did **not** show the multi-player game-termination or score-handling logic for slam tilt, so "ends the whole game for every player and typically discards the game" rests on the glossary and Stern manual, not on the engine source.

**Ball search (trigger and behavior).** "On most solid state games, if no scoring activity is detected for a certain period of time, all solenoids in the game will cycle in sequence. If a ball is trapped by one of the moving components, this should free any balls that may have become stuck." The rec.games.pinball glossary gives the same mechanism: "When a machine thinks a ball may be stuck, it will activate each solenoid in the machine in turn, to help a ball become unstuck."
- source: https://en.wikipedia.org/wiki/Glossary_of_pinball_terms | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern
- source: http://www.lysator.liu.se/pinball/glossary/ | publisher: rec.games.pinball glossary | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern

**Ball search (full engine model — the escalating-phase structure).** MPF starts a ball search when a playfield timeout expires with no switch activity during active play; any switch hit calls `reset_timer()` and cancels the search. The search runs in **three phases**, each with a configurable iteration count; devices register callbacks with a priority, and "Callbacks are called by priority," each receiving the current phase and iteration number, with a configured interval between callbacks. A phase configured with zero searches is skipped. After phase 3 completes without finding the ball, `give_up()` runs, posts `ball_search_failed`, and performs the configured action. Config surface: `enable_ball_search`, `ball_search_timeout`, `ball_search_interval`, `ball_search_phase_1/2/3_searches`, and `ball_search_failed_action` with values `new_ball`, `end_game`, or `end_ball`.
- source: https://raw.githubusercontent.com/missionpinball/mpf/dev/mpf/core/ball_search.py | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ontology
- Sim implication: ball search is not one coil sweep — it escalates over three phases (typically gentle nudges first, then everything), and the *order* is per-device (`ball_search_order` appears on the diverter config too), and it must terminate with a defined failure action.

**Ball search interacts with rules state.** Stern's Jurassic Park code notes that "Ball search will not release locked balls during multiplier timer" — i.e. real machines suppress parts of the search when rules state would be corrupted by it.
- source: https://sternpinball.com/wp-content/uploads/2024/11/jurassic_park_LE_1.15-README.txt | publisher: Stern Pinball | pub_date: 2024-11 | accessed: 2026-08-26 | confidence: high | class: rules-pattern

**Match (how the number is chosen — the exact algorithm).** "At the end of the last ball of a game… the system produces a random 2-digit number (a multiple of 10; 00 to 90). Matching the last 2 digits of the player's score with this number awards a credit."
- source: https://archive.org/stream/Stern_Pinball_The_Sopranos_Manual/Sopranos_Manual_djvu.txt | publisher: Stern Pinball | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern
- Note the constraint that makes the naive implementation wrong: the drawn number is a **multiple of 10 in {00, 10, …, 90}**, so only 10 outcomes exist, and a score's last two digits must be one of those to ever match.

**Match is a tunable percentage, not a flat 1-in-10.** Stern Standard Adjustment 13 is "Match Percentage", default **8%**. Modern Stern code exposes "MATCH AWARD" (CREDIT option).
- source: https://archive.org/stream/Stern_Pinball_The_Sopranos_Manual/Sopranos_Manual_djvu.txt | publisher: Stern Pinball | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: settings
- source: https://sternpinball.com/wp-content/uploads/2024/11/jurassic_park_LE_1.15-README.txt | publisher: Stern Pinball | pub_date: 2024-11 | accessed: 2026-08-26 | confidence: high | class: settings
- Sim implication: match is a *weighted* award targeting an operator-set payout rate, not a uniform draw. An 8% default is below the 10% a uniform draw would give.

**Ball save (definition).** "A game that will return a ball that is drained withing the first few seconds of play is said to be equipped with a ball saver." [sic — typo in source]
- source: http://www.lysator.liu.se/pinball/glossary/ | publisher: rec.games.pinball glossary | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: feature-taxonomy

**Ball save (full timing model including the grace period).** MPF's BallSave docstring is "Ball save device which will give back the ball within a certain time." Its timeline runs: at time 0 the ball save activates; at `active_time - hurry_up_time` the state becomes `hurry_up` (the visual/audio warning that the save is about to expire); at `active_time` the state becomes `grace_period`, **during which saves still function**; at `active_time + grace_period` the device disables. Config surface also includes `balls_to_save` (-1 for unlimited), `auto_launch` (auto-serve vs player plunge of the saved ball), `enable_events`, `timer_start_events` (separate from enable — the timer often starts on plunge, not on enable), `delayed_eject_events`, `eject_delay`, and `only_last_ball`.
- source: https://raw.githubusercontent.com/missionpinball/mpf/dev/mpf/devices/ball_save.py | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ontology
- Three details a sim usually gets wrong: (a) the grace period is time *past* the displayed expiry during which a drain is still saved; (b) `hurry_up_time` is measured backwards from expiry and exists to drive a distinct light/sound state; (c) enable and timer-start are separate events, which is why ball save typically does not begin counting until the ball is plunged.

**Ball save has an operator-facing form and a per-feature form.** Stern exposes a "COIN DOOR BALL SAVER" adjustment (opening the coin door mid-ball saves the ball) and also per-multiball timers such as "KOTI MB BALL SAVE TIMER" (default 30, max 40) — i.e. ball save time is not one global number but a global plus per-mode overrides.
- source: https://sternpinball.com/wp-content/uploads/2024/11/jurassic_park_LE_1.15-README.txt | publisher: Stern Pinball | pub_date: 2024-11 | accessed: 2026-08-26 | confidence: high | class: settings

**End-of-ball bonus (what is confirmed).** Stern's code notes reference a "Bonus" count-up during end-of-ball and a bonus multiplier system ("Bonus X"), and the glossary confirms that a tilt discards the end-of-ball bonus.
- source: https://sternpinball.com/wp-content/uploads/2024/11/jurassic_park_LE_1.15-README.txt | publisher: Stern Pinball | pub_date: 2024-11 | accessed: 2026-08-26 | confidence: medium | class: rules-pattern
- source: http://www.lysator.liu.se/pinball/glossary/ | publisher: rec.games.pinball glossary | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern
- **Gap:** I did not find a primary description of the *countdown behavior itself* — the per-item tally, the multiplier application order, the ability to skip/speed the countdown by pressing a flipper button, or whether the countdown is interruptible. This remains open. See "Looked for but could not find."

---

### Q4 — The adjustments / settings model (Stern's own vocabulary)

This was the highest-yield source of the round. Two Stern documents, ~19 years apart, give a consistent picture.

**Stern's classic numbered "Standard Adjustments" scheme.** A Stern manual documents "Standard Adjustments (01-55)" as a numbered list, including: Adj. 1 Adult Content Enabled (default PARTIAL), Adj. 2 Replay Percentage, Adj. 3 Replay Award (default CREDIT), Adj. 4 Replay Levels, Adj. 13 Match Percentage (default 8%), Adj. 15 Tilt Warnings (default 01), Adj. 16 Credit Limit, Adj. 29 High Score Initials (default 3 Initials), Adj. 30 Free Play, Adj. 31 Custom Message (default ON), Adj. 49 alert trigger (default NEVER), Adj. 50 Team Scores (default NO).
- source: https://archive.org/stream/Stern_Pinball_The_Sopranos_Manual/Sopranos_Manual_djvu.txt | publisher: Stern Pinball | pub_date: unknown (2005 title) | accessed: 2026-08-26 | confidence: high | class: settings
- Caveat: the full 01–55 table lives on manual pages 38–46 and was not fully present in the OCR excerpt; the above is the confirmed subset.

**Stern's modern adjustment vocabulary, by category (from Stern's own game code README).** The Jurassic Park LE 1.15 code notes enumerate adjustments in these clusters:

*Pricing / free play:* "FREE PLAY" (YES/NO), "GAME PRICING", "FREE PLAY LIMIT" (max free games per player), "REMOVE FRACTIONAL CREDITS" (NEVER / AFTER X MINUTES IDLE, 30–240), "COIN ACCEPTOR" (MECHANICAL / ELECTRONIC).

*Replay & awards:* "REPLAY TYPE" (DYNAMIC), "REPLAY LEVEL", "REPLAY AWARD" (CREDIT), "SPECIAL AWARD" (CREDIT), "HIGH SCORE AWARD" (CREDIT), "MATCH AWARD" (CREDIT), "HSTD INITIALS" (incl. 10 LETTER NAME), "HSTD RESET COUNT" (incl. OFF).

*Game behavior / difficulty:* "COMPETITION MODE" (YES/NO), "TILT_WARNINGS", "EXTRA BALL LIMIT" (incl. NO EXTRA BALLS), "MAX PLAYERS PER GAME" (1–4, default 4), "GAME_RESTART" (YES/NO), "LOST BALL RECOVERY" (YES/NO), "ALLOW LEFT+START TO END GAME" (NEVER / FREEPLAY ONLY / ALWAYS), "TARGET GAME TIME" (incl. NO TARGET TIME), "TIMED PLUNGER" (OFF), "FLIPPER BALL LAUNCH" (OFF), "GAME MODE ON START" (STANDARD / CHALLENGE), "PLAYER LANGUAGE SELECT" (YES/NO), "ACTION BUTTON BEHAVIOR" (DISABLED / ENTER GAME PLAY MENU / START GAME), "START BUTTON BEHAVIOR" (SINGLE CREDIT).

*Coin door:* "COIN DOOR BALL SAVER" (YES), "COIN DOOR DISABLE TILT" (YES).

*Audio / display / lighting:* "KNOCKER VOLUME" (OFF / VERY LOW / LOW / NORMAL), "LCD DISPLAY BRIGHTNESS" (0–100%), "SPEAKER LED BRIGHTNESS" (0–100%), "SELECT AUDIO FILTER" (NONE / HIGH-LOW SHELF / 10 BAND EQ), "BACKBOX SPEAKER TYPE" (4 OHM / 8 OHM), "CABINET SPEAKER TYPE", "START BUTTON ATTRACT MODE ILLUM." (ALWAYS OFF / BLINKING / ALWAYS ON), "STATIC BACKBOX GI".

*Per-mech calibration and power (the category player-facing glossaries never mention):* "TROUGH EJECT POWER" (min 64), "POP BUMPER POWER", "RIGHT FLIPPER POWER" (default 235), "RAPTOR MOTOR SPEED" (default 51, min 20, max 62), "T-REX MAGNET DISABLED", "T-REX JAW DISABLED", "T-REX STEPPER DISABLED", "T-REX VERTICAL MOTOR DISABLED", "T-REX JAW HOLD POWER", "T-REX THROW BALL ENABLED", "T-REX STEPPER LEFT/MIDDLE/RIGHT POS BIAS" (per-position offsets), and a family of millisecond timing adjustments — "T-REX STEP KEEP JAW OPEN TICKS", "T-REX STEP DROP JAW OPEN TICKS", "T-REX STEP THROW LEFT TICKS", "T-REX STEP THROW RIGHT TICKS", "T-REX STEP THROW MAG OFF TICKS", "T-REX STEP THROW JAW OPEN TICKS".

*Per-feature rules tuning:* "DNA COMBOS EXTRA BALL" (default 6, range 1–11), "AMBER TARGETS TIMER" (default 40s), "AMBER SLINGS TIMER" (default 30s), "AMBER RAMPS TIMER" (default 50s), "AMBER POPS TIMER" (default 20s), "KOTI MB BALL SAVE TIMER" (default 30, max 40), "LIGHT ESCAPE TIMER DECREASE" (default 5), "LIGHT ESCAPE TIMER MINIMUM" (default 5), "SMART MISSILE INVALID CHOICE" (YES/NO; Competition default NO), "IC GOAT MANIA SUPER SUPPLY DROP", "TOPPER LETTERS START GOAT MANIA", "JP SYSTEM FAILURE SPEECH".

*Connected services:* "ENABLE HOME TEAM IN COINPLAY", "USE INSIDER HOME TEAM" (FREE PLAY ONLY / OFF), "HOME TEAM MENU LOGS IN USER #1".
- source: https://sternpinball.com/wp-content/uploads/2024/11/jurassic_park_LE_1.15-README.txt | publisher: Stern Pinball | pub_date: 2024-11 | accessed: 2026-08-26 | confidence: high | class: settings

**Tournament mode is an install *preset* that overrides many individual adjustments, not a single flag.** Stern documents an "Install->Competition" settings preset; enabling COMPETITION MODE sets TILT_WARNINGS to 2, forces "SMART MISSILE INVALID CHOICE" to NO, overrides "TOPPER LETTERS START GOAT MANIA" to NO, and removes the Standard game mode from the GAME MODE ON START choice.
- source: https://sternpinball.com/wp-content/uploads/2024/11/jurassic_park_LE_1.15-README.txt | publisher: Stern Pinball | pub_date: 2024-11 | accessed: 2026-08-26 | confidence: high | class: settings
- Sim implication: model adjustments as a layered store — factory defaults, then an install preset (Competition / Home / Location), then individual operator overrides — because the real machine does exactly this and the preset both *sets* and *constrains* values.

---

### Q5 — MPF device model (a ready-made ontology)

**MPF's complete device-collection registry.** The `device_modules` section of MPF's master config defines these device types: `coils`, `digital_outputs`, `dual_wound_coils`, `switches`, `lights`, `autofire_coils`, `ball_devices`, `playfields`, `drop_targets`, `drop_target_banks`, `extra_balls`, `extra_ball_groups`, `shot_profiles`, `shots`, `shot_groups`, `flippers`, `diverters`, `score_reels`, `score_reel_groups`, `spinners`, `playfield_transfers`, `multiballs`, `motors`, `dc_motors`, `ball_saves`, `accelerometers`, `servos`, `achievements`, `achievement_groups`, `digital_score_reels`, `dmds`, `rgb_dmds`, `light_stripes`, `light_rings`, `neoseg_displays`, `magnets`, `kickbacks`, `combo_switches`, `ball_holds`, `multiball_locks`, `timed_switches`, `psus`, `counters`, `accruals`, `sequences`, `timers`, `segment_displays`, `sequence_shots`, `shakers`, `speedometers`, `hardware_sound_systems`, `steppers`, `state_machines`, `score_queues`, `ball_routings`, `show_queues`, `blinkenlights`.
- source: https://raw.githubusercontent.com/missionpinball/mpf/dev/mpf/mpfconfig.yaml | publisher: Mission Pinball Framework | pub_date: unknown (dev branch, live) | accessed: 2026-08-26 | confidence: high | class: ontology

**Notes on the ontology that matter for a simulator's type system:**
- Physical mechs, rules abstractions, and display hardware share one flat registry. `shots`, `achievements`, `counters`, `accruals`, `sequences`, `state_machines` are pure rules objects; `coils`, `magnets`, `steppers`, `servos` are hardware.
- `ball_holds` and `multiball_locks` are **separate types** — a hold is physical retention, a lock is rules progress. This is precisely the virtual/physical lock distinction expressed in the type system.
- `psus` (power supply units) exist as a device type, implying coil firing must be budgeted against shared power — a real constraint a naive sim ignores.
- `playfield_transfers` and `ball_routings` type the movement of a ball between playfields and between devices as first-class, which is the abstraction that makes diverters declarative.
- `dual_wound_coils` vs `coils` types the classic high-power/hold-winding flipper coil distinction.
- No `flashers` type; no `tilt` device type (tilt is a **mode**, at `mpf/modes/tilt/`, and the sensor appears in the mechs docs as "Tilt Bob").

**MPF's documented mechs list (docs-side view, which differs slightly from the code registry).** The mechs index enumerates: Flippers, Switches, Troughs / Ball Drains, Targets, Plungers / Launch Devices, Pop Bumpers, Servos, Coils (Solenoids), Magnets, Ball Devices, Playfields, Lights / LEDs, Loops / Orbits / Ramps, Spinners, Diverters, Kickback Lanes, Score Reels, Scoops / Vertical Up Kickers (VUKs) / Saucer holes, Autofire Coils, Accelerometers, Motors, Slingshot, Tilt Bob.
- source: https://missionpinball.org/latest/mechs/ | publisher: Mission Pinball Framework docs | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: ontology

**MPF license — MIT.** "MPF and related projects are released under the MIT License. Refer to the LICENSE file for details." MPF is described as "open source, cross-platform software for powering real pinball machines" and a "community-developed project released under the MIT license."
- source: https://github.com/missionpinball/mpf | publisher: Mission Pinball Framework (GitHub README) | pub_date: unknown (live) | accessed: 2026-08-26 | confidence: high | class: ontology
- Practical consequence: MIT is permissive, so MPF's *ontology and naming* can be adopted freely with attribution; this makes it a safe reference model for the simulator's device taxonomy.

---

### Q6 — JJP primary docs

**NOT CLOSED. No Jersey Jack primary documentation was retrieved this round.** Both JJP surfaces failed:
- `marketing.jerseyjackpinball.com` returned a TLS error ("unable to verify the first certificate") and could not be fetched.
  - source: https://marketing.jerseyjackpinball.com/ | publisher: Jersey Jack Pinball | pub_date: n/a | accessed: 2026-08-26 | confidence: n/a | class: hardware-fact
- `jerseyjackpinball.com/support/` returned only a navigation shell: per-title support tiles (Dialed In, Willy Wonka & The Chocolate Factory, Pirates of The Caribbean, The Wizard of Oz) each linking to a sub-page such as `/pages/support/dialed-in-collectors-edition`. No manuals, rulesheets, or code notes were exposed at this level, and nothing about magnets or upper playfields appeared.
  - source: https://www.jerseyjackpinball.com/support/ | publisher: Jersey Jack Pinball | pub_date: unknown | accessed: 2026-08-26 | confidence: high (about the page's contents) | class: hardware-fact

**Consequence: the round-1 JJP claims remain UNVERIFIED.** The magnet counts on Dialed In! and Willy Wonka, and the rocking upper playfield on Pirates of the Caribbean, are still supported only by aggregation. They should be carried forward as unverified beliefs, **not** as facts, and must not be used as load-bearing specification inputs until a JJP manual is opened. Per-title support sub-pages are the next place to look (see Leads).

---

## Leads worth chasing

1. **JJP per-title support sub-pages.** `https://www.jerseyjackpinball.com/pages/support/dialed-in-collectors-edition` and siblings — the tile links resolve one level deeper than the index I fetched, and manuals are likely hosted there. This is the single highest-value unclosed item.
2. **Stern PDFs need local text extraction, not WebFetch.** Two Stern PDFs were downloaded but returned as binary/image content: the Star Wars Pro manual (6.5 MB) and the official Metallica Remastered Rulesheet (4.3 MB, dated 2025-04). The Metallica rulesheet almost certainly contains Stern's own statement of the Pro-virtual / Premium-physical Coffin lock split — the exact primary confirmation this round could not get. Run a local PDF text extractor (or OCR) over the saved files.
3. **Internet Archive `_djvu.txt` is the reliable route into Stern manuals.** The Sopranos manual OCR worked where PDFs failed. Other confirmed archive.org Stern manuals: `Stern_Pinball_Family_Guy_Manual`, `Stern_Pinball_24_Manual`. A manual whose OCR includes the complete Standard Adjustments table (pages ~38–46) would close the full 01–55 enumeration.
4. **MPF docs body text requires the docs source repo, not the rendered site.** `missionpinball.org/latest/...` pages render as navigation shells to fetchers; the code at `raw.githubusercontent.com/missionpinball/mpf/dev/mpf/...` worked every time. For the remaining prose (multiball_locks semantics, tilt config reference), fetch the `mpf-docs` repository markdown directly.
5. **MPF device source files not yet read**, each a ready-made spec: `mpf/devices/drop_target.py`, `magnet.py`, `kickback.py`, `autofire.py`, `ball_device/`, `multiball_lock.py`, `ball_hold.py`, and `mpf/core/ball_controller.py` (trough/ball-count management, which is the substrate under virtual locks).
6. **`psus` device type** — MPF models power-supply budgeting for coil firing. Worth a dedicated look if the sim intends realistic coil behavior under simultaneous fire.
7. **Lane change in manufacturer words** was never found. Try an archive.org `_djvu.txt` of a Bally/Williams-era manual (WPC games), where lane change originated, rather than Stern.
8. **Bonus countdown mechanics** — try a tiltforums.com rulesheet or a WPC-era manual; the "hold flipper to speed/skip countdown" convention needs a real source.

---

## Looked for but could not find

- **A dictionary definition of "flasher."** Genuinely absent from both the rec.games.pinball glossary and Wikipedia's pinball glossary, and MPF has no `flashers` device type. The functional characterization above (a high-current lamp on a driver-board transistor output, charted with coils rather than matrix lamps) is inferred from where flashers appear in a Stern manual's charts — medium confidence, not a quoted definition.
- **Manufacturer wording for "lane change."** No Stern or Bally/Williams manual text stating the flipper-button-rotates-lit-top-lanes convention was retrieved. The glossary definition I do have is broader (any set of lights, exampled with in/outlanes) and does not confirm the top-lane-specific, flipper-button-triggered form as universal. Round 1's gap is *partially* closed only.
- **Stern's own statement of virtual vs physical lock.** The official Metallica Remastered Rulesheet PDF (2025-04) would not yield text. The Pro/Premium-LE Coffin lock split rests on a community rulesheet (tiltforums.com) — medium confidence.
- **MPF's prose on multiball locks.** `/latest/game_logic/multiballs/multiball_locks/` and `/latest/config/multiball_locks/` rendered navigation only. The type-level evidence (a `multiball_locks` collection distinct from `ball_holds` and `ball_devices`) is solid; the explicit "locks are per-player and independent of balls physically contained" statement is aggregation-only.
- **MPF's diverter and tilt-bob documentation pages.** Same nav-shell problem. Recovered from source code instead, which is arguably better, except that the docs' plain-language mechanical description is still unquoted.
- **Slam tilt's effect on scores and on other players, in engine terms.** MPF's `tilt.py` sets `game.slam_tilted` and calls `tilt()`, but the multi-player termination and score-handling path was not visible in what I read. The claim that slam tilt "aborts all games in progress and reboots" is glossary-sourced (high confidence as a description of real machines) but not corroborated by engine source.
- **End-of-ball bonus countdown behavior.** No primary source found for the tally sequence, multiplier application order, or whether/how a player can skip or speed the countdown. Only two confirmed facts: a bonus count-up and a "Bonus X" multiplier exist (Stern code notes), and a tilt discards the end-of-ball bonus (glossary).
- **All Jersey Jack Pinball primary documentation.** See Q6. `marketing.jerseyjackpinball.com` is TLS-broken; the main support index exposes no documents. No JJP claim from round 1 has been verified.
- **ipdb.org** was not attempted — the brief notes it returns HTTP 403 to fetchers.
