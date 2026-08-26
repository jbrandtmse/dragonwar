---
title: 'Product Brief: DragonWar'
status: draft
created: '2026-08-26'
updated: '2026-08-26'
---

# Product Brief: DragonWar

## Executive Summary

DragonWar is a single, complete, open-source pinball table that runs in a browser — one machine, built properly, rather than a platform hosting many. It exists because its author played a specific moment on a real machine and wanted to build it: targets spell **D‑R‑A‑G‑O‑N**, the dragon opens its mouth, and multiball begins as the balls come out like fire.

Everything in this project is judged by whether it serves that moment. **You are a knight, the flippers are your weapon, and the war is the multiball itself.** Light the letters, trigger dragon-fire multiball, land enough hits to win the war, collect the jackpot — with other feature modes layered alongside so the table has depth rather than one trick.

The bet is not technical novelty. A companion technical research run established that the browser 3D pinball field is effectively **empty at the top** — the only serious browser port of Visual Pinball stopped in 2020 with its scripting unfinished, and no WebGPU-native pinball project of any maturity exists. This is a passion project shared openly, and its advantage is simply that it will be finished and free.

## The Moment

The anchor is a feeling: walking up to a machine, seeing the backbox lit, the camera settling down onto the playfield — then earning the letters and watching the dragon fire the balls at you.

Three design consequences follow:

- **The walk-up is a first-class feature.** It is cheap to build, it is the first thing anyone feels, and it sets the frame for everything after.
- **The dragon is the table's protagonist**, not set dressing. It is the bash target, the multiball source, and the thing you are at war with. Art and rules both answer to it.
- **The flippers are the weapon.** This is the theme's spine and it is unusually well-matched to the medium: the core verb of pinball *is* the core verb of the fiction. Every flip during multiball is a strike against the dragon, which is why the war lives inside multiball rather than beside it.

## The Table

The rules spine maps onto the structure the research found running through every modern Stern and Jersey Jack machine — qualifier → selector → tiered modes → wizard — so DragonWar reads as a real machine rather than an invented one.

- **Spell DRAGON** on lit targets to qualify the dragon.
- **Dragon-fire multiball** — the balls are launched from the dragon's mouth. *This is the war.*
- **Fight it** — land enough scoring hits on the dragon, with the flippers, to win.
- **Jackpot** on winning the war.
- **Additional feature modes** so the table is not a single-facet game. Modern tables layer several qualifying modes alongside the headline multiball, and stack them by priority.

Standard machine behaviour is in scope because its absence is conspicuous: skill shot, ball save with grace period, end-of-ball bonus, extra balls, match, tilt warnings, slam tilt, and ball search. The research captured Mission Pinball Framework's MIT-licensed device ontology and event vocabulary, which specifies all of this precisely enough to implement directly.

**1–4 player hot seat**, like a real machine. This fixes per-player state in the rules layer from day one rather than retrofitting it through every rule later.

## What "Realistic" Means Here

The technical research established that **nobody has defined realism for pinball** — there is no benchmark, no instrumented study, no reproducible test; every published ranking is forum opinion. So the term is replaced with the author's own criteria, which are checkable:

1. **It feels like real pinball and stays playable.** Feel wins over fidelity wherever the two conflict.
2. **The approach.** Backbox and backglass first, then the descent to the playfield.
3. **Lights and sound of a real machine** — insert lighting that carries game state, general illumination, flashers, and mechanical audio.
4. **Correct ball behaviour** — bouncing, rebounding, and *sometimes hopping*.

One correction on that last point: hops are not a by-product of good physics — the parameters that make a ball feel right exist partly to *suppress* them. **Hopping gets one explicit tuning control, dialled in deliberately.** (Addendum §4.)

**"Stylized" here means simplified geometry and hand-painted textures, with real-world dimensions and real lighting behaviour preserved** — the realism lives in the proportions, the insert glow and the ball, not the polygon count. That is what lets a low-poly table still feel like walking up to a real machine. (Addendum §1.)

**The author has a real machine within walking distance and plays it regularly.** This matters more than it sounds. Most people building pinball simulations tune against memory; DragonWar can be tuned against a physical reference, on demand, throughout development. "Feels like real pinball" stops being an aspiration and becomes an acceptance step someone can actually perform — play the machine, play the build, name what differs.

## Who This Serves

**The author, first and honestly.** This is a passion project whose primary success condition is that its builder wants to play it. That is a legitimate and sufficient reason, and the brief does not dress it up as anything else.

**Then the virtual pinball community.** Visual Pinball's ecosystem is active but almost entirely Windows-first, desktop-installed, and licence-encumbered — the dominant projects carry non-commercial or copyleft terms, and the one browser port is dormant. A finished, free, click-and-play table is a useful thing to hand that community, and an unusually good on-ramp for people who have never installed a pinball simulator.

## What Makes This Different

Stated plainly, because fabricating a moat here would be worse than having none:

- **The field is empty, not contested.** No mature browser 3D pinball exists. That is the opportunity and the warning in the same sentence — nobody has done it, and nobody has proved it can be done well.
- **Click-and-play distribution.** No install, no Windows requirement, no ROM hunting. For open-source sharing this is the entire advantage.
- **Being finished is the moat.** The research catalogued abandoned projects in this space. A complete, playable, well-tuned single table is rarer than an ambitious platform.

## Scope

**In**

- One table: DragonWar. Complete and tuned.
- Browser-first, Windows and macOS. Desktop packaging via Tauri later, at near-zero cost from the same build.
- 1–4 player hot seat.
- Nudge, tilt warnings, and slam tilt.
- The walk-up-and-descend presentation.
- Insert lighting driven by game state, general illumination, flashers, and mechanical audio.
- Open-source release under **GPL-3.0**.

**Out**

- **A table editor, a plugin system, or support for other tables.** This is the single most important boundary in the brief and the thing most likely to erode. DragonWar is a game, not an engine.
- ROM emulation of real machines, and any recreation of an existing commercial table.
- VR, cabinet hardware, and physical controller support.
- Online multiplayer and global leaderboards.
- Mobile.

## Success Criteria

1. **The author plays it for fun**, unprompted, after it is finished. This is the real one.
2. **The dragon-fire multiball lands** — the moment that started the project produces the feeling that started the project.
3. **A stranger can play it from a link** on Windows or macOS, with no install and no explanation.
4. **It holds up against the real machine.** Play the machine at the bar, then play the build, and name what differs. Cradling, flipper snap, and how shots reject and rebound are the specific things to compare. This is a repeatable test, not an opinion — run it throughout, not at the end.
5. **It is finished and released**, with the repository public and the licence clean.

## Key Risks

- **Art is the largest unbudgeted item.** No published effort figure for authoring one pinball table exists anywhere — the research looked twice and found only unattributed month-scale claims. The stylized direction is the mitigation, but art remains the most likely place this project stalls.
- **Feel is unbounded.** Flipper tuning has no natural stopping point. The mitigation is a fixed acceptance bar (criterion 4) rather than an open-ended pursuit of realism.
- **The physics reference is frozen.** The proven core this project should port from stopped development in November 2020 with its scripting layer unfinished. The physics is sound and readable; nobody is maintaining it.
- **Solo project fatigue.** One table, phased content, and a playable-early loop are the structural defences. The research confirmed that even commercial machines ship their deepest modes in later code updates — so a complete v1 does not require the final wizard mode.

## Technical Direction

Settled by the companion research and not re-argued here: a purpose-built analytic time-of-impact physics core at a fixed 480–1000 Hz, ported rather than derived; **Babylon.js** for rendering on a WebGL2 floor with WebGPU progressive enhancement; and MPF's device ontology and event vocabulary for a rules layer kept strictly separate from physics.

The open-source decision de-risks the largest work item: the licence wall that blocked reusing proven pinball physics applies to *commercial* use. A GPL-compatible DragonWar can port that core directly, including twenty years of tuning constants that would otherwise have to be rediscovered.

**GPL-3.0 specifically, and the reason is not cosmetic:** Apache-2.0 (Babylon.js) is incompatible with GPL-2.0-only but compatible with GPL-3.0, and vpx-js's *or-later* clause is what makes that move available. Verification and the counterfactual are in Addendum §5. Final picture: DragonWar GPL-3.0, Babylon.js Apache-2.0, MPF ontology MIT.

Full detail, evidence and citations: [`../research/technical-pinball-simulation-engine-and-technology-2026-08-26/research.md`](../../research/technical-pinball-simulation-engine-and-technology-2026-08-26/research.md)

## Vision

If DragonWar works, the obvious next step is not more tables — it is a *better* DragonWar: deeper code, a final wizard mode, tuning refined against real play, and whatever the people who play it ask for.

A finished, open, browser-native pinball table with a clean rules layer is the thing a table-authoring community would eventually want to build on. Keeping rules, physics, and presentation properly separated costs nothing now and leaves that door open. The door stays shut for v1, and shipping one excellent table is the whole job.
