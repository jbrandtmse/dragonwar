# Digest: Modern pinball feature vocabulary (round 1)

Scope note on evidence quality: findings marked **high** were retrieved and read directly this run (WebFetch/WebSearch against the named page). Findings marked **medium** come from Perplexity aggregation where the underlying citation was named and is plausible-primary (Stern/CGC/JJP official pages, Tilt Forums rulesheets, IPDB) but the page itself was not opened this run. IPDB blocked direct fetch (HTTP 403) — anything sourced to IPDB is therefore medium at best.

---

## Q1 — Playfield feature taxonomy

The canonical vocabulary is stable and well-defined; the following definitions were read directly from the Wikipedia glossary of pinball terms this run.

A **ramp** is "a section of the playfield with a raised gradient," generally leading "either to raised playfields, habitrails, or to inlanes"; a **habitrail** (wireform) is "a wireform path for the ball to travel along," which "may be straight or consist of curving paths and loops."
- source: https://en.wikipedia.org/wiki/Glossary_of_pinball_terms | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: feature-taxonomy

An **orbit** is "a path for the ball that hugs the outer rim of the game," and "sending the ball into an orbit generally means it returns immediately from another"; **loop** is used synonymously.
- source: https://en.wikipedia.org/wiki/Glossary_of_pinball_terms | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: feature-taxonomy

A **spinner** "rotates and awards points with each rotation"; a **drop target** is "an upright, pressure-sensitive rectangle that drops below the playfield when hit"; a **standup target** is "similar to a drop target, but which does not drop into the playfield when struck."
- source: https://en.wikipedia.org/wiki/Glossary_of_pinball_terms | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: feature-taxonomy

A **captive ball** is "a pinball trapped on the playfield, either in one spot or with a limited area of motion." A **subway** is "a track underneath the playfield that moves the ball from one spot on the playfield to another." A **scoop/saucer** is "a hole that catches the ball." A **VUK** is a synonym for **popper**, which "launches the ball vertically, often to a raised playfield." A **ball lock** is "a mechanism during a game where achieving a certain shot will catch a ball and hold it in place."
- source: https://en.wikipedia.org/wiki/Glossary_of_pinball_terms | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: feature-taxonomy

A **kickback** is "a launching mechanism located inside an outlane that sends the ball back into play." An **up-post** ("magic post") is "a post that can rise up between the flipper fingers and completely block the middle drain." A **slingshot** is a "typically triangular-shaped playfield element that houses a kicker solenoid that acts on a thick rubber band." **Inlanes** "feed the ball to the flippers"; **outlanes** are "at the far ends and connect to the bottom (causing loss of the ball)."
- source: https://en.wikipedia.org/wiki/Glossary_of_pinball_terms | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: feature-taxonomy

**Gap (finding):** the Wikipedia glossary does NOT define **diverter**, **lane change**, or **flasher**, three terms the brief asked about. Their absence from the canonical glossary is itself a signal that they are trade/service-manual terms rather than player-facing vocabulary.
- source: https://en.wikipedia.org/wiki/Glossary_of_pinball_terms | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: feature-taxonomy

Concrete modern instantiation — Chicago Gaming's **Pulp Fiction** (2024/2025) is documented by the manufacturer with a feature list that reads as a direct enumeration of this vocabulary: a "rotating, illuminated custom sculpted briefcase" (bash toy), a "gun magnet" that can catch and throw the ball, "3 Jack Rabbit Slim's LED jet bumpers" (pop bumpers), "2 Adrenaline Heart Hall-effect spinning targets" (spinners), orbits, and a mini-ramp to a scoop.
- source: https://www.chicago-gaming.com/coinop/pulp-fiction | publisher: Chicago Gaming Company | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: feature-taxonomy

Chicago Gaming's **Cactus Canyon Remake** is documented with "interactive LED quick draw targets," "LED-illuminated drop targets" including "independently driven enemy drop targets," an "artist-sculpted Bart bash toy," a die-cast metal train, and a "working mine shaft" used as the ball-lock/multiball moment — i.e. drop-target banks and a physical lock as headline mechanical features even in a 1998-layout remake.
- source: https://www.chicago-gaming.com/coinop/cactus-canyon | publisher: Chicago Gaming Company | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: feature-taxonomy

Jersey Jack's differentiator is **magnet count and magnet programming**, not just presence: **Dialed In!** is marketed with five magnet assemblies, one of which stops the ball and then shoots it upward, plus hidden magnets in the "Quantum Theater" area that make virtual drop targets feel physical. **Willy Wonka** reportedly carries seven magnets, including two triads of coil-sized magnets under clusters of tiny clear inserts, each magnet ringed by LEDs.
- source: https://pinside.com/pinball/machine/dialed-in | publisher: Pinside | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: feature-taxonomy
- source: https://www.pinball-magazine.com/?p=3928 | publisher: Pinball Magazine | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: feature-taxonomy

JJP **Pirates of the Caribbean** uses a variable-speed *rocking* elevated mini-playfield — the upper playfield itself tilts under software control, changing shot difficulty dynamically. This is the strongest example found of an upper playfield that is mechanically dynamic rather than a fixed shelf.
- source: https://www.ipdb.org/machine.cgi?id=6494 | publisher: Internet Pinball Machine Database | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: feature-taxonomy

**Universal vs. gimmick (design judgement, flagged as such):** ramps, orbits, inlanes/outlanes, slingshots, pop bumpers, scoops, standups and a central bash toy appear on essentially every modern machine surveyed. Rocking mini-playfields (JJP PotC), five-to-seven-magnet arrays (JJP), and Hall-effect spinning targets (CGC Pulp Fiction) are one-machine or one-manufacturer signatures. Kickbacks and up-posts are common but optional; captive balls and subways are common but not universal.
- source: (synthesis of the CGC, JJP and Wikipedia sources above) | publisher: n/a | pub_date: n/a | accessed: 2026-08-26 | confidence: low | class: design-opinion

---

## Q2 — Rule architecture patterns

The Tilt Forums Stern **Godzilla** rulesheet (read directly this run) documents a complete, representative modern rule stack. Skill shots: player-controlled plunging with four regular skill shots (short plunges to various switches/bumper, plus a full left spinner lane plunge) and three secret skill shots, including a "Super Secret" awarding 10M, +2 Power-Ups, and an Ally in one shot. Skill shots also grant ball save of 3–8 seconds depending on type.
- source: https://tiltforums.com/t/stern-godzilla-rulesheet/7210 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern

Godzilla's **mode start and stacking** rule: modes begin by shooting ramps to light selections at the scoop; "Jet Fighter Attack, Tesla Strike, and any Multiball modes can be activated during and stacked with Tier 1 battles," while Tier 2 battles take priority. Tier 1 battles require shooting either ramp twice; subsequent attempts require both ramps. This is the canonical "scoop = mode selector, ramps = qualifier, tiered priority governs stacking" pattern.
- source: https://tiltforums.com/t/stern-godzilla-rulesheet/7210 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern

Godzilla has **three distinct 3-ball multiballs** (Godzilla, Mechagodzilla, Saucer Attack) that cannot stack with each other but *can* layer with Tier 1 battles. Jackpot values are progressive and seeded by prior play: Godzilla jackpots start at "500k + 500k per Godzilla Multiball started" and progress through five color levels (blue through red), requiring six shots for Super Jackpot; Mechagodzilla uses "1M + 500K per Mechagodzilla Multiball started" with alternating shot/target-bank collection.
- source: https://tiltforums.com/t/stern-godzilla-rulesheet/7210 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern

The **mini-wizard / final-wizard split** is explicit in Godzilla: three mini-wizards (Monster Zero, lock-based; Terror of Mechagodzilla, flip-count based; Planet X Multiball, 3-ball) gate a final wizard mode, "King of the Monsters," which requires completing one mini-wizard plus Planet X plus reaching Power-Up level 8 or 11, and culminates in a **4-ball** King Ghidorah showdown. Note the ball counts: 3-ball for regular multiball, 4-ball reserved for the finale.
- source: https://tiltforums.com/t/stern-godzilla-rulesheet/7210 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern

Godzilla's final wizard mode was not present at launch — Stern shipped final wizard modes for Godzilla and Rush in a later code update, confirming that "wizard mode arrives in a post-launch code drop" is a real shipping pattern in this era.
- source: https://www.knapparcade.org/post/big-stern-pinball-code-update-rolls-out-final-wizard-modes-for-godzilla-and-rush-pinball-machines | publisher: Knapp Arcade | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: rules-pattern

**Playfield multipliers and combo multipliers** are separate systems in Godzilla: Rodan (an Ally) awards "2x Playfield for 60 seconds"; loop combos build "up to 10x" for consecutive shots; a Magna-Grab release enables "5x" loop values.
- source: https://tiltforums.com/t/stern-godzilla-rulesheet/7210 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern

**Combos** in Godzilla come in three named tiers: "City Combos" (unique 2–3 shot sequences per city, 5M each plus 10M for completing a city set), "Secret Combos" (10 total, 2.5M each, with rewards at 2, 5, 6 and 10 completions), and a "Rage Combo sequence" requiring five specific shots in order.
- source: https://tiltforums.com/t/stern-godzilla-rulesheet/7210 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern

**Extra balls are awarded for a menu of long-horizon achievements**, not a single lane: in Godzilla, for conquering 2 cities, destroying 3 saucers, destroying 10 jet fighters, completing 12 Monster Rampage shots, or collecting 5 City Combos.
- source: https://tiltforums.com/t/stern-godzilla-rulesheet/7210 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern

**End-of-ball bonus survives in modern code** as a per-category accumulator times an adjustable Bonus X: Godzilla pays 750K per city conquered, 250K per tail whip, 200K per Power-Up, 350K per jet destroyed, 150K per loop, all multiplied by Bonus X.
- source: https://tiltforums.com/t/stern-godzilla-rulesheet/7210 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern

Cross-title corroboration — Stern **Jurassic Park** (Keith Elwin, 2019) uses the same architectural skeleton with different naming: shoot lit white arrows to spell MAP, then left ramp to start/advance a **paddock** (mode); each paddock is a three-phase mini-mode (red "rescue" shots → yellow "Set Trap" targets and/or Helipad → a moving green shot representing the dinosaur, to capture). Multiballs: T-Rex Multiball (hurry-up converted into the jackpot value), CHAOS Multiball (spell C-H-A-O-S in order left-to-right, Amber Mine = Super Jackpot, bumpers progress add-a-balls), and Raptor tri-ball which can *upgrade in-flight into a 6-ball multiball*.
- source: https://tiltforums.com/t/stern-jurassic-park-rulesheet/5644 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: rules-pattern

Jurassic Park demonstrates **add-a-ball** and **mode-count-driven bonus multiplier** as standard: bumpers progress add-a-balls during CHAOS, and more paddocks played/completed increase end-of-ball bonus multipliers.
- source: https://tiltforums.com/t/stern-jurassic-park-rulesheet/5644 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: rules-pattern

Chicago Gaming **Pulp Fiction** shows the same architecture at a smaller scale on deliberately retro hardware: 5 multiball modes (e.g. Briefcase Boogie, Pawn Shop Panic), 5 "Roll Scene" modes (Twist Contest, BMF Wallet, Gold Watch, Clean the Car, The Shot), and **3 mini-wizard modes** (Cast Chaos, Pulp Fiction Frenzy, The Shot). The mini-wizard tier is therefore not a Stern-only convention.
- source: https://www.chicago-gaming.com/coinop/pulp-fiction | publisher: Chicago Gaming Company | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: rules-pattern
- source: https://www.chicago-gaming.com/brochures/Pulp_Fiction_Pinball_Rules_Manual.pdf | publisher: Chicago Gaming Company | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: rules-pattern

**Match** is defined in the canonical glossary as "the chance to win a free game after the last ball has drained." No modern-title-specific evidence for Match behavior was retrieved this run.
- source: https://en.wikipedia.org/wiki/Glossary_of_pinball_terms | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern

---

## Q3 — Lighting and insert vocabulary

**GI (general illumination)** is defined as "lights on the playfield used simply to make the playfield visible in a dark room" — i.e. GI is architecturally separate from feature-insert lighting, which is per-shot state indication.
- source: https://en.wikipedia.org/wiki/Glossary_of_pinball_terms | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: hardware-fact

Stern announced the **Spike** electronics system in January 2015, with an all-LED lighting architecture. RGB inserts on Spike appear with **KISS (Pro)**, first shipped **May 2015**, whose IPDB entry lists "newly designed RGB LED in pop bumpers (4)" and "full spectrum smooth RGB LED playfield arrow inserts (6)." **Treat 2015 as the RGB-insert inflection year for Stern, at medium confidence — the IPDB page returned HTTP 403 on direct fetch this run and was not independently verified.**
- source: https://www.ipdb.org/machine.cgi?gid=6265 | publisher: Internet Pinball Machine Database | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: hardware-fact
- source: https://www.sternpinball.com/2015/01/05/dead-flip-chicago-to-showcase-stern-pinball-titles-on-twitch-tv/ | publisher: Stern Pinball | pub_date: 2015-01 | accessed: 2026-08-26 | confidence: medium | class: hardware-fact

The key architectural point for a simulator: the RGB arrow insert is the atomic unit of **insert-driven progress indication** — six full-spectrum RGB arrow inserts on KISS Pro is the pattern that becomes universal. Godzilla's rules then colour-code progression *through* those inserts: jackpots "progress through five color levels (blue through red)."
- source: https://tiltforums.com/t/stern-godzilla-rulesheet/7210 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: rules-pattern

Jurassic Park uses insert colour as a literal grammar for what to shoot: white arrows = advance/qualify, red = rescue phase, yellow = set trap, green = the moving dinosaur target. Colour is the mode-state channel, not decoration.
- source: https://tiltforums.com/t/stern-jurassic-park-rulesheet/5644 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: rules-pattern

Chicago Gaming's Pulp Fiction enumerates its lighting layer explicitly: "RGB LED general illumination," "a built-in RGB LED lighting system on the lower arch," and "15 RGB LED software-controlled feature inserts." Cactus Canyon Remake adds RGB GI including jet bumpers, RGB back-panel lighting, an RGB-lit mine popper and saloon trough, and "upgraded revolvers and LED flashers on the lower arch." This gives a clean four-channel model for a simulator: **GI / feature inserts / flashers / architectural (arch, back panel, speaker) lighting.**
- source: https://www.chicago-gaming.com/coinop/pulp-fiction | publisher: Chicago Gaming Company | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: hardware-fact
- source: https://www.chicago-gaming.com/coinop/cactus-canyon | publisher: Chicago Gaming Company | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: hardware-fact

Spike is a distributed **node-bus** architecture: node boards handle switches, coils and lights, and the CPU ("Node 0") reads switch states and sends commands back to fire coils and set LEDs. Lighting is therefore a commanded, per-LED addressable channel from game code, not a hardwired lamp matrix.
- source: https://missionpinball.org/latest/hardware/spike/ | publisher: Mission Pinball Framework docs | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: hardware-fact

---

## Q4 — Display, callout and audio layer

JJP's **The Wizard of Oz** (designer Joe Balcer, released April 2013) is "the first US pinball machine with an LCD in the back box as well as the first one to have color on the monitor produced in the US since the Pinball 2000 games." It is not the first worldwide — MarsaPlay in Spain shipped *New Canasta*, an Inder *Canasta* remake with a backbox LCD, in 2010.
- source: https://en.wikipedia.org/wiki/The_Wizard_of_Oz_(pinball) | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: hardware-fact

Stern moved from DMD to full-colour LCD with **Spike 2**, beginning with **Batman 66** at the end of **2016**; Ghostbusters was among the last Stern DMD titles. **Medium confidence — asserted by aggregated secondary sources (Flip Commons, Kineticist) that were not opened directly this run.**
- source: https://flipcommons.org/systems/stern-spike-2 | publisher: Flip Commons | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: hardware-fact
- source: https://www.kineticist.com/news/the-details-of-spike | publisher: Kineticist | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: hardware-fact

Scale of the modern audio/video asset layer: Stern's **Metallica Remastered** (Oct 2024) is marketed with 8 songs "seamlessly integrated into the game," all-new animations, movies and HD live concert footage, and **over 1000 new speech calls** by the band. For a simulator this sets the expectation of a very large, event-indexed callout pool rather than a handful of stock lines.
- source: https://www.sternpinball.com/2024/10/16/stern-pinball-revisits-a-timeless-classic-with-metallica-remastered-available-now/ | publisher: Stern Pinball | pub_date: 2024-10 | accessed: 2026-08-26 | confidence: medium | class: hardware-fact

Stern's Spike 3 era pairs an 18.5" full-HD LCD with "high-quality film assets and custom animations," and licensed score plus purpose-recorded character callouts (Star Wars: Fall of the Empire — John Williams music with C-3PO callouts recorded by Chris Bartlett).
- source: https://manuals.plus/m/d176329255bf5e891b04272add760c51c50326360875fc96cd1eb87a0e53016a | publisher: manuals.plus (hosting Stern brochure) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: hardware-fact

Architecturally, display and audio are **not independent subsystems**: the Spike CPU board carries both the backbox stereo speaker outputs and the LCD display connector plus HDMI out, so a single switch closure resolves through one code path into callout, music cue and animation together.
- source: https://www.sternpinball.com/wp-content/uploads/2020/11/SPIKE-System-Manual.pdf | publisher: Stern Pinball | pub_date: 2020-11 | accessed: 2026-08-26 | confidence: medium | class: hardware-fact

A meaningful non-LCD counterexample: CGC's **Pulp Fiction** deliberately ships **13-segment alphanumeric LED scoring displays instead of an LCD**, while still carrying 250+ lines of dialogue from 19 characters and 5 licensed songs. Display technology and audio depth are decoupled — a modern-feeling machine does not strictly require an LCD.
- source: https://www.chicago-gaming.com/coinop/pulp-fiction | publisher: Chicago Gaming Company | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: hardware-fact

**Insider Connected** — Stern announced it on **26 August 2021** as "a comprehensive technology initiative to connect the universe of Stern pinball machines," covering player accounts, achievements, leaderboards, operator audits and remote maintenance. It shipped on all new Spike 2 LCD games produced after the September 2021 launch, with 7 titles at launch and all 17 Spike 2 LCD titles added by year-end, plus a retrofit kit for existing LCD games. This is now part of the expected modern feature surface (login QR, achievements, quests) alongside the ruleset proper.
- source: https://www.sternpinball.com/2021/08/26/stern-pinball-launches-insider-connected-platform/ | publisher: Stern Pinball | pub_date: 2021-08-26 | accessed: 2026-08-26 | confidence: high | class: hardware-fact

---

## Q5 — "Feel" features that separate great from mediocre

Pat Lawlor frames shot design around **what happens on a miss**, not on a hit: "When a shot is missed, what happens to the ball? Is it a bad, clunky thing? Does the ball come back in my face?" He also frames layout as mixing shot types — "how to mix stop and go shots with nice return flow shots" — and notes "middle shots are easier for beginners" and "very fast games are very difficult for beginners."
- source: https://www.gamedeveloper.com/game-platforms/interview-lawlor-on-modern-pinball-market-small-team-creativity | publisher: Game Developer (Gamasutra) | pub_date: 2009-01-14 | accessed: 2026-08-26 | confidence: high | class: design-opinion

Lawlor also asks whether shots are thematically motivated: "Are these shots just 'there,' or do they represent something from the theme?" — i.e. shot identity, not just shot geometry.
- source: https://www.gamedeveloper.com/game-platforms/interview-lawlor-on-modern-pinball-market-small-team-creativity | publisher: Game Developer (Gamasutra) | pub_date: 2009-01-14 | accessed: 2026-08-26 | confidence: high | class: design-opinion

"Clunky" is a live, load-bearing term of art in the player community, discussed at length on Pinside, where it is characterised as many "dead shots" and "dead spots" that kill ball speed and break rhythm — a game can have good rules and theme and still be dismissed as clunky.
- source: https://pinside.com/pinball/forum/topic/why-do-people-use-the-term-clunky | publisher: Pinside | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: design-opinion

Mission Pinball's layout guidelines (used by homebrew and professional designers) codify geometry rules that a simulator can implement directly: the ball should not hit bare metal except true ball guides; ball guides should end at rubber posts to avoid rattle-induced trajectory changes; orbit exits should feed directly toward flippers; and upper flippers need reliable feeds because their shots are inherently tougher. **Medium confidence — the page's section headers ("Pop Bumpers," "Upper Flippers," "Inserts," "Ball Guides and Posts," "Shot Lines") were confirmed by direct fetch this run, but the body text was truncated and the specific rules above come from aggregation.**
- source: https://missionpinball.org/latest/physical_building/layout_considerations/ | publisher: Mission Pinball Framework docs | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: design-opinion

**Shot rejection is a named failure mode** with a live 2025 example: players complained at length about the frequency of rejected shots on Stern's *Fall of the Empire*, specifically the middle ramp and Death Star toy bouncing balls off the backboard and sideways. Rejection frequency on core shots is, empirically, what gets a modern machine labelled bad.
- source: https://www.reddit.com/r/pinball/comments/1nlul5p/the_rejected_shot_frequency_on_fall_of_the_empire/ | publisher: Reddit r/pinball | pub_date: 2025-09 | accessed: 2026-08-26 | confidence: medium | class: design-opinion

Bowen Kerins (rules designer, Dune) has publicly discussed how powerful **shot multipliers** can "dictate everything the player does," to the point of needing tournament adjustments to cap their strength — a concrete warning about multiplier balance in rule design.
- source: https://www.reddit.com/r/pinball/comments/1ki5h1d/bowen_kerins_on_designing_dune_and_the_art_of/ | publisher: Reddit r/pinball | pub_date: 2025 | accessed: 2026-08-26 | confidence: low | class: design-opinion

Eric Meunier (JJP, Harry Potter) frames features explicitly in risk/reward terms — features that can double or boost score but demand attention away from the game's main "story," forcing the player to choose between score-chasing and content progression.
- source: https://www.youtube.com/watch?v=Lg6Wnfm9feE | publisher: YouTube (designer interview, exact channel unverified) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: design-opinion

Community consensus on **code depth** is that the good games layer: obvious early objectives (start a mode, light multiball) over deeper advanced strategy, with multiple viable scoring routes rather than one dominant exploit; Pinside threads on deepest rulesets repeatedly cite Star Wars, Batman 66, Iron Maiden, Willy Wonka and Pirates of the Caribbean. Lawlor's own summary of a great machine is one that is "challenging, but not intimidating."
- source: https://pinside.com/pinball/forum/topic/top-10-pins-with-the-deepest-rulesets- | publisher: Pinside | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: design-opinion
- source: https://www.highwaygames.com/arcade-news/interview-with-pat-lawlor-by-stern-pinball-522/ | publisher: Highway Games | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: design-opinion

**Code evolves post-launch and retrospectives judge final code, not launch code.** Evidenced concretely by Stern shipping final wizard modes for Godzilla and Rush in a later update, and by Stern publishing per-version README files for Jurassic Park (v1.06, v1.15) on its own site.
- source: https://sternpinball.com/wp-content/uploads/2024/11/jurassic_park_LE_1.15-README.txt | publisher: Stern Pinball | pub_date: 2024-11 | accessed: 2026-08-26 | confidence: medium | class: rules-pattern

---

## Leads worth chasing

1. **Stern's own README/code-notes files** (e.g. `sternpinball.com/wp-content/uploads/2024/11/jurassic_park_LE_1.15-README.txt`, `.../2022/08/Jurassic_Park-1_06_0-README_PRO.txt`) are primary, dated, and enumerate adjustments, feature flags and scoring changes in Stern's own vocabulary. Highest-value unexploited primary source for a simulator's settings/adjustments model.
2. **Stern service/operation manuals per title** (e.g. Godzilla Premium Service and Operation Manual) — these contain the authoritative switch/coil/lamp matrices and the exact mech names Stern uses. Would resolve the diverter/lane-change/flasher gap definitively.
3. **CGC Pulp Fiction Rules Manual PDF** (`chicago-gaming.com/brochures/Pulp_Fiction_Pinball_Rules_Manual.pdf`) and **Feature Matrix PDF** — manufacturer-published rulesheet + feature enumeration in one place, unusual and directly usable.
4. **Mission Pinball Framework docs** (`missionpinball.org/latest/mechs/...`, `.../physical_building/layout_considerations/`) — an open-source pinball *engine* that already models scoops, VUKs, diverters, drop-target banks etc. as first-class typed devices. This is arguably the single most directly transferable source for a simulator's device model; the layout_considerations page needs a full retrieval (it truncated this run).
5. **Tilt Forums rulesheets for Iron Maiden, Star Wars, Deadpool, Elwin's Avengers/Godzilla/JP** — to separate universal rule patterns from per-title invention across a wider sample.
6. **IPDB** needs a non-WebFetch retrieval path (it returned 403); it is the authority for dates and per-title feature notes.
7. **Pinside "Design theory discussion #1: Flow"** thread — a dedicated community treatment of flow that would sharpen Q5 beyond anecdote.

## Looked for but could not find

- **Diverter, lane change, and flasher** are not defined in the canonical Wikipedia glossary. No authoritative definition was retrieved this run for any of the three. Lane change (the standard "flipper button rotates the lit top-lane arrows" convention) is universally present on modern machines in my prior belief, but I have **no evidence retrieved this run** and state it only as unverified belief.
- **Virtual vs. physical ball lock** — the brief asked to distinguish these. The glossary defines ball lock only physically. No source retrieved this run defines "virtual lock" or documents a specific modern title's virtual-lock implementation. Gap.
- **No direct evidence retrieved** on Match behaviour, tilt/slam-tilt implementation, or ball-search on any specific modern title.
- **IPDB was unreachable via WebFetch (HTTP 403)**, so the KISS Pro RGB-insert claim — the load-bearing evidence for "2015 is the RGB inflection year" — rests on aggregation and is medium confidence only. Do not treat 2015 as settled.
- **Stern's SPIKE System Manual PDF was retrieved but not text-extractable** by the fetch tool (5.6MB binary), so no direct quotes on GI/flasher/node-board lighting architecture were obtained from the primary manual. The file was saved locally during the fetch and could be parsed offline.
- **Jersey Jack official documentation** was not directly opened this run; all JJP findings are medium-or-lower confidence via aggregation. JJP manual PDFs exist at `marketing.jerseyjackpinball.com` and should be fetched in round 2.
- **Chicago Gaming public data is genuinely thin** compared to Stern/JJP — their feature information lives almost entirely in marketing brochures and YouTube walkthroughs, with little independent rulesheet coverage. Report this as thin, not as absent features.
