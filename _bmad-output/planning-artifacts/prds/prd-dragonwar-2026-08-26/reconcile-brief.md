---
title: 'Reconciliation: brief + brief addendum → PRD + PRD addendum'
input: briefs/brief-dragonwar-2026-08-26/{brief.md, addendum.md}
targets: prds/prd-dragonwar-2026-08-26/{prd.md, addendum.md}
created: '2026-08-26'
---

# Reconciliation: product brief → PRD

Deliberate decisions taken with the author today are **not** treated as gaps or contradictions: independently available modes; six-target DRAGON drop bank; single fixed camera; modern Stern/JJP era; the held colour mapping; Chrome/Edge + Safari; local high scores + minimal settings; keyboard only; technical "how" moved to the PRD addendum.

Severity: **blocker** = architecture/epics would build the wrong thing · **should-fix** = a downstream workflow will have to invent or guess · **nice** = precision/tone.

---

## 1. Coverage table

| Input section | Status | Where |
|---|---|---|
| Brief · Executive Summary | Covered | PRD §0 (judging principle verbatim), §1 |
| Brief · The Moment — walk-up first-class | Covered | PRD §4.1 desc, FR-1, FR-3 |
| Brief · The Moment — dragon is the protagonist | **Partial** | Glossary "Dragon"; addendum §8. No FR gives the dragon presence or animation — the mouth *opening* is absent (G1) |
| Brief · The Moment — flippers are the weapon | Covered | PRD §1; FR-38 (every hit a strike) |
| Brief · The Table — rules spine | Covered | PRD §4.6; addendum §3 |
| Brief · The Table — spell → fire → fight → jackpot beat | **Contradiction** | FR-36/37 put three lock shots between spelling and the mouth (C1) |
| Brief · The Table — standard machine behaviour | Covered | FR-18–FR-25; addendum §4 |
| Brief · The Table — 1–4 hot seat, per-player state from day one | **Partial** | FR-17, UJ-3. Physical lock vs per-player lock count unreconciled (G3) |
| Brief · What "Realistic" Means — four criteria | Covered | PRD §1 |
| Brief · Realistic — hops as one explicit control | Covered | FR-9; addendum §2 |
| Brief · Realistic — stylized = simplified geometry, real dimensions/lighting | Covered | §4.1 desc, FR-4, FR-43, §5 "Not photoreal", addendum §5 |
| Brief · Realistic — reference machine as a performable acceptance step | Covered | UJ-4, SM-4, OQ1 |
| Brief · Who This Serves | Covered | PRD §2.1 |
| Brief · What Makes This Different | Covered | PRD §1 para 3; SM-5 |
| Brief · Scope In / Out | Covered | PRD §6.1, §5 |
| Brief · Success Criteria 1–5 | Covered | SM-1–SM-5 |
| Brief · Key Risks — art unbudgeted; feel unbounded; frozen reference; solo fatigue | **GAP** | Feel → §5 "Not tuned forever", SM-C4; frozen reference → addendum §1. Art risk and the "phased content, playable-early loop" defence have no home (G4) |
| Brief · Technical Direction | Covered | Addendum §1, §6; PRD §9 |
| Brief · Vision (better DragonWar; door stays shut) | Covered | PRD §6.2; addendum §5 |
| Addendum §1 · Stylized realism vs real-machine goal | Covered | §4.1 desc, FR-4, FR-42, FR-43; addendum §5 |
| Addendum §2 · Rules spine table; ball-count grammar; jackpot seeding; extra-ball menu | Covered | §4.6, FR-37, FR-38, FR-21, FR-41; §6.2 (4-ball reserved) |
| Addendum §3 · Tilt (bonus forfeited, score kept, per-player, debounce + settle) | **Partial** | FR-14, FR-15. Settle time absent from FR-15 (G8) |
| Addendum §3 · Slam tilt is a different sensor | **Contradiction (tagged)** | FR-16 assumption derives it from Nudge (C2) |
| Addendum §3 · Ball save grace / hurry-up / timer-start | Covered | FR-19 |
| Addendum §3 · Match multiple of ten; 8% unverified | Covered | FR-22, OQ2 |
| Addendum §3 · Ball search three-phase, suppression | Covered | FR-23; addendum §4 |
| Addendum §3 · Flashers are coil-class | Covered | Glossary, FR-42; addendum §1 |
| Addendum §4 · Tuning knobs; wall thickness | Covered | Addendum §2 |
| Addendum §5 · Licence reasoning and compatibility check | Covered | PRD §9; addendum §6 |
| Addendum §6 · Decisions with rationale | Covered | §4.3 desc, §5, NFR-5, addendum §1, §5 |
| Addendum §7 · Open questions 1–6 | Covered | OQ1, FR-44, addendum §1 (UV — see D8), OQ7, OQ6, §4.6 (decided) |
| Addendum §8 · Modes table and fictions | **Partial** | FR-18, FR-33–FR-35, FR-37. Only the Skill shot's fiction is surfaced to the player (G5); "the monster" undefined (G6) |
| Addendum §8 · Backglass DMD | Covered | FR-3; addendum §5 |
| Addendum §8 · Colour grammar split | Covered | §4.7 desc, FR-44 |
| Addendum §8 · Joust = alternating loops | Covered | FR-35, FR-26 |
| Addendum §8 · Shot map (loops, spinner, ramp, bank, dragon, lock lane, mouth) | Covered | FR-26–FR-29; Glossary |
| Addendum §8 · Device model — two devices, `multiball_lock`, lock 2+1 | Covered | Addendum §3; FR-37 |
| Addendum §8 · Device model — lock disabled during multiball | **Partial** | FR-37 disables only during the War; Quick multiball unaddressed (G2) |
| Addendum §8 · Layout rules (orbit exits, rubber posts, Lawlor) | Covered | FR-26, FR-30, FR-31 |
| Addendum §8 · Audio — generated, swappable, record own machine | **Contradiction** | FR-46–FR-48, §6.2; but PRD §9 forbids "any asset from a commercial pinball machine" (C3) |
| Addendum §9 · Deferred, not rejected | Covered | PRD §6.2 |

---

## 2. Gaps

### G1 — The dragon opens its mouth (should-fix)
**Input:** "targets spell D‑R‑A‑G‑O‑N, *the dragon opens its mouth*, and multiball begins as the balls come out like fire" (brief, Executive Summary; quoted verbatim as the PRD's own judging principle in §0). "The dragon is the table's protagonist, not set dressing … Art and rules both answer to it" (brief, The Moment).
**PRD:** FR-29 defines the Mouth as an up-kicker eject; nothing requires the dragon to *animate* — mouth opening before the fire, reacting to strikes, idle presence in attract/walk-up. The "fire" is carried only by FR-45 (flashers) and FR-48 (a sting). UJ-1's climax skips the mouth opening.
**Land:** a new FR in §4.5 or §4.7 (Dragon presentation: mouth opens on War start before the Mouth fires; visible reaction to each strike; present in the Walk-up/Backglass), and add "the dragon opens its mouth" to addendum §8. Epics need this to scope rig/animation work, which is art budget — the brief's biggest risk.

### G2 — Lock behaviour during Quick multiball (should-fix)
**Input:** "The lock must be disabled during *multiball*, so an under-leg shot counts as a bash hit rather than a re-lock" (addendum §8 device model).
**PRD:** FR-37 disables the Lock only "during the War". Quick multiball (FR-34, 2-ball) is also a multiball; with the Lock lit, a Lock-lane shot during Quick MB would lock a ball, deduct it, and end the mode. Also unspecified: whether Hurry-up/Joust can start (FR-32, Lock-lane entry) while the War or Quick MB is running — FR-34 only forbids Quick MB starting during the War.
**Land:** FR-34 and FR-37 (Lock disabled during any multiball; under-leg shot = Dragon hit); FR-32/FR-40 (mode-start rules while a multiball is running).

### G3 — Physical lock vs per-player lock state in Hot seat (should-fix)
**Input:** "1–4 player hot seat … fixes per-player state in the rules layer from day one" (brief, The Table); the lock is "a `multiball_lock` — balls out of play, deducted from the count" (addendum §8).
**PRD:** FR-17 makes "Lock count" per-player and independent; FR-36 says the physical Lock "holds up to two". With two players, P1 locks two and drains; P2's per-player count is zero but two balls sit in the Lock. Real machines resolve this with virtual locks or lock stealing; the PRD addendum §3 asserts "per-player lock theft … do[es] not apply to a sim" — the brief only claimed BOM and trough reliability do not apply, and theft plainly does apply to a hot-seat physical lock unless the sim reconciles it (teleport balls at player change, or allow steals as period-authentic).
**Land:** FR-17/FR-36 (state the reconciliation rule); addendum §3 (correct the claim; give the architecture the `ball_device` count vs Rules-layer count contract).

### G4 — Risks → sequencing intent for epics (should-fix)
**Input:** "Art is the largest unbudgeted item … the most likely place this project stalls" · "Solo project fatigue. One table, phased content, and a *playable-early loop* are the structural defences" · "a complete v1 does not require the final wizard mode" (brief, Key Risks).
**PRD:** no Risks section; §6.2's `[NOTE FOR PM]` is the only trace. Nothing tells `bmad-create-epics-and-stories` to order work so a grey-box playable loop exists before art, and modes are phased after the War.
**Land:** a short §6.3 "Sequencing intent" (playable loop with placeholder geometry first → War → the four modes → art/lighting passes → polish) or a Risks subsection under §5/§7. Three lines, but they decide epic order.

### G5 — Mode fiction is not surfaced (nice)
**Input:** "each mode's mechanic *is* its fiction" (PRD addendum §8, carrying brief addendum §8: Hurry-up = "a call to arms", Quick MB = "fight the monster", Joust = "the charge").
**PRD:** only FR-18 requires the fiction on screen ("ARM YOURSELF"). FR-33 shows a decaying value; FR-35 shows "CHARGE ×N"; FR-34 shows nothing named. FR-3's "Mode prompts" is generic.
**Land:** FR-3 or FR-33–FR-35 consequences: each Mode announces its fiction on the Backglass at start ("TO ARMS", "FIGHT THE MONSTER", "THE CHARGE", "WAR").

### G6 — What is "the monster"? (nice)
**Input:** the campaign escalates "fight a monster → joust → war with the dragon" (addendum §8) — the monster reads as a lesser foe than the dragon.
**PRD:** FR-34 awards Quick multiball "on Dragon hits and Ramp shots", silently making the monster the dragon. Untagged. If the monster is the dragon, the escalation flattens; if it is something else (pops? a standup?), it needs a device.
**Land:** FR-34, tag as `[ASSUMPTION]` or decide.

### G7 — "Escalation lives in the fiction and the scoring" has no scoring FR (nice)
**Input:** the campaign "gives the table a spine a player can feel without being told" (addendum §8).
**PRD:** §4.6 desc asserts escalation in scoring; FR-33/35/38 values do not establish an order (Hurry-up 250k vs Joust loop ×10 vs Jackpot 500k+). FR-32 lights modes in campaign order, which helps.
**Land:** FR-41 (one line: mode values ascend in campaign order; the War outscores the rest).

### G8 — Tilt settle time (nice)
**Input:** "The bob keeps swinging, so both a debounce window and a *settle time* are required" (addendum §3).
**PRD:** FR-14 has debounce; FR-15 says "the next ball starts normally" with no settle delay. PRD addendum §4 mentions settle time, but nothing requires it.
**Land:** FR-15 consequence.

### G9 — Own recordings and provenance — see C3 (should-fix).

### G10 — Tauri-wrappable build constraint (nice)
**Input:** "Desktop packaging via Tauri later, at near-zero cost from the same build" (brief, Scope; addendum §6).
**PRD:** §6.2 defers Tauri but no NFR keeps the build wrappable (static assets, no server component, no browser-only API the WebView cannot provide). NFR-7 "no network calls after load" covers part of it.
**Land:** NFR-10 (static, serverless build; renderer path must run in a WebView).

### G11 — Lights and sound have no acceptance step (nice)
**Input:** realism criterion 3, "Lights and sound of a real machine" (brief, What "Realistic" Means).
**PRD:** SM-4/UJ-4 judge only cradling, flipper snap, rejection — correctly mirroring brief criterion 4. Criterion 3 is stated in §1 but nothing checks it.
**Land:** UJ-4 or SM-3 (the stranger test): add "lights and mechanical sound read as a real machine" to the ritual, or accept it as unmeasured.

### G12 — Continuous physics→presentation channel (nice)
**Input:** "Ball roll in real simulators is sample playback driven by velocity and position" (addendum §7 Q4).
**PRD:** FR-46 drives sound "by Switch events *and ball velocity*", but the Glossary says Presentation is "driven by Rules layer commands" and the Rules layer "has no knowledge of ball velocity". OQ7 carries the question; the layering rule should admit a direct physics→presentation stream for continuous quantities (ball position for rendering, velocity for roll audio) so the architecture does not read it as a violation.
**Land:** Glossary "Presentation"; addendum §1 layer-separation paragraph.

### G13 — Auto-launch device implied but not listed (nice)
**Input:** brief lists ball save and the physical lock; MPF vocabulary carries "saved balls auto-launched".
**PRD:** FR-19 "a saved ball is auto-launched"; FR-34 "adds one ball"; FR-36 "a new ball is served"; but FR-18 is manual plunge and FR-30 lists only a "plunger lane". An auto-launcher (or a rule that served balls are auto-plunged) is needed.
**Land:** FR-30.

### G14 — Match "awards a free game" with no credit model (nice)
**PRD:** FR-22 awards a free game; FR-17 has no credits or coin door, so the award has no meaning. Real machines pay a credit plus knocker.
**Land:** FR-22 — define the award (a credit shown on the Backglass + knocker sound, or purely ceremonial).

---

## 3. Contradictions

### C1 — The beat of the moment: spelling triggers the fire (should-fix)
**Brief:** "targets spell D‑R‑A‑G‑O‑N, the dragon opens its mouth, and multiball begins as the balls come out like fire" (Executive Summary, twice; also §0 of the PRD). Addendum §2: Qualifier = spelling DRAGON, Selector = the dragon's mouth.
**PRD:** FR-36 "Spelling DRAGON lights the Lock"; FR-37 "With two balls locked, the next Lock-lane shot starts the War". Spelling is three shots removed from the mouth; the last letter produces a lit insert, not a dragon.
The brief supports both the letters and the physical lock, but it never says which comes first. The PRD chose spell → lock → lock → start, untagged. The alternative — lock two balls at any time (lock lit by the Ramp, say), then the *sixth letter* opens the mouth and the balls come out — keeps the sentence the project is built on literally true. This ordering decides the War's rules, the DRAGON bank's role, and the emotional beat; it needs an explicit decision, whichever way.
**Land:** FR-36/FR-37 + `[ASSUMPTION]` or a decision line; UJ-1.

### C2 — Slam tilt sensor (nice — already tagged, OQ4)
**Brief:** "Slam tilt is a *different sensor* — a coin-door switch, not the plumb bob" (addendum §3).
**PRD:** FR-16 "`[ASSUMPTION: a rapid repeated Nudge past a threshold]`" — the one mechanism the input rules out (it makes slam tilt a harder tilt). OQ4 lists the alternatives. Recommend a distinct key (or a Setting to disable) so the two sensors stay distinct, per the input.

### C3 — Recording the Reference machine vs the provenance rule (should-fix)
**Brief:** "the author can record his own reference machine's mechanical sounds on a phone — coil fires, flipper snap, ball roll on wood, a drop bank resetting. Unambiguously his, no licensing question" (addendum §8 Audio). PRD §6.2 defers "Recorded Reference-machine sounds" as planned work.
**PRD §9:** "Not acceptable: … any asset from a commercial pinball machine" (and project `CLAUDE.md`: "sound and speech" from commercial machines). Read literally, §9 forbids the recordings §6.2 plans. The intent is clearly a carve-out — mechanical noise the author records himself is his; the machine's speech, music, and callouts are not — but the PRD does not say so, and provenance is the one hard rule.
**Land:** §9 (explicit carve-out: own field recordings of mechanical sounds are acceptable and recorded in `ATTRIBUTIONS.md` as author-generated; no speech/music/callouts/display audio); §6.2.

### C4 — What counts as a strike (should-fix, or tag)
**Brief:** "land enough scoring hits *on the dragon, with the flippers*, to win" (The Table); "Every flip during multiball is a strike against the dragon" (The Moment).
**PRD:** FR-28 "a full bank during the War counts as strikes instead of letters" — drop targets count toward winning the War. Untagged; not supported by the input; dilutes the dragon as the single thing you are at war with.
**Land:** FR-28 — remove, or tag and make the bank a War *scoring* award rather than strikes.

### C5 — Airballs vs deliberate hops (nice, internal)
**PRD:** FR-6 "no pingy rebound *or airball* at high speed" vs FR-9 "the default produces occasional hops on hard hits". The brief asks for elasticity falloff (no pingy rebound) and one explicit hop control; FR-6 added "airball", which FR-9 then requires.
**Land:** FR-6 — drop "or airball"; hops are FR-9's business.

---

## 4. Drift (invented, untagged)

| # | Where | What the PRD adds | Input support | Severity |
|---|---|---|---|---|
| D1 | FR-5 | Six techniques "as on the Reference machine": cradle, live-catch, light-tap, dead-bounce, post-pass, backhand | Brief fixes the acceptance bar at three things (cradling, flipper snap, rejection/rebound) *precisely because* "feel is unbounded". FR-5 widens the bar the brief deliberately narrowed. | should-fix — subordinate FR-5 to SM-4's three, or tag the other three as desirable-not-acceptance |
| D2 | FR-7, FR-8, NFR-5 | Bit-identical replay from recorded inputs; identical outcomes at 30/60/120 Hz display rates | Brief: scatter 0, "randomness is tuned down", rules headlessly testable. Replay determinism across display rates is a much stronger claim (inputs must be timestamped in sim time, not frame time) and is a real architecture constraint | should-fix — tag as `[ASSUMPTION]` or state it as intent ("physics is display-rate independent") rather than a test |
| D3 | FR-28 | Full bank during the War = strikes | None (C4) | should-fix |
| D4 | PRD addendum §3 | "per-player lock theft … do not apply to a sim" | Brief cites only BOM cost and trough reliability (G3) | should-fix |
| D5 | NFR-1 | 60 FPS on a "mid-range 2022+ laptop GPU" | None; research has no verified hardware target | nice — tag |
| D6 | NFR-6 | "Windows 11 and macOS current-1" | Brief: "Windows and macOS" | nice — tag |
| D7 | FR-27 | Ramp "returns the ball to an inlane" | Brief addendum §7: "ramp height and return" is geometry still to be drawn | nice — tag or move to OQ6 |
| D8 | PRD addendum §1 | Standard-UV lightmaps chosen | Brief addendum §7 Q3 left it open "before modelling starts"; not in today's decision list. Reasonable, but it closes an author question without saying who closed it | nice — mark as an architecture decision to confirm |
| D9 | FR-39 | War end resets DRAGON letters and unlights the Lock; a second War needs everything again | None; plausible | nice — tag |
| D10 | FR-18, FR-25 vs FR-30 | Top lanes (skill shot, lane change) | Not in the brief's shot map; FR-30's device list omits them while FR-18/FR-25 rely on them | nice — add to FR-30 |
| D11 | FR-38 | "collected at the Dragon" in the body vs "collected at the Mouth via the Lock lane" in the tag — and the Lock lane is simultaneously a strike (FR-37) | Internal ambiguity | nice — pick one |
| D12 | FR-41 | Jackpot seed and extra-ball menu "reset at game end" | Brief: "seeded by prior play" — ambiguous whether across games | nice — tag |
| D13 | FR-22 | Match "awards a free game" | No credit model exists (G14) | nice |

---

## 5. Qualitative intents — carried vs. thinned

Carried well (PRD addendum §8 is a good list): judged by the moment · dragon as protagonist (in words) · mechanic is fiction · feel over fidelity · walk-up sets the frame · colour as the reading channel · loud loop / quiet return · the balls you locked come back · nudge danger is the point · randomness down, hops deliberate · rustic under RGB · realism in proportions and light · finished is the moat · Lawlor per shot · one machine, built properly.

Thinned or lost: **the dragon opens its mouth** (G1) · **spelling is the trigger** (C1) · **the playable-early principle** behind "a complete v1 does not require the final wizard mode" (G4) · **the bar is fixed on purpose** (D1) · **the author's own recordings as the truest sound source** (C3) · **the honest framing** ("stated plainly, because fabricating a moat here would be worse than having none"; "the author, first and honestly") survives in §2.1 and the counter-metrics, which is enough.
