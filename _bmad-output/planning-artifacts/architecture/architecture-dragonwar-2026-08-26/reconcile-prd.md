---
title: 'Reconciliation: Architecture Spine vs PRD'
spine: ARCHITECTURE-SPINE.md
prd: ../../prds/prd-dragonwar-2026-08-26/prd.md
created: '2026-08-26'
---

# Reconciliation — ARCHITECTURE-SPINE.md against PRD: DragonWar

Method: every FR-1..FR-55, NFR-1..NFR-9, UJ-1..UJ-4, §6.3 sequencing intent and §10 open question was checked against the ADs, conventions, structural seed, Capability → Architecture Map and Deferred list. The bar is the spine's own: a finding is listed only where two independent builders could satisfy the PRD incompatibly, silently drop a requirement, or where an AD says something the PRD does not.

Counts: **Contradictions 5 · Missing/should-fix 16 · Minor 14.**

---

## 1. Contradictions (must fix)

### C-1 — Tick rate is hard-wired to 1 kHz; the PRD keeps a 480–1000 Hz band and a spike that may fail
- **PRD:** NFR-2 ("fixed timestep in the 480–1000 Hz band"), SM-C3 ("480 Hz that feels right beats 1000 Hz that does not"), OQ-8 / Deferred "spike 1 (1 kHz JS loop over 6 bodies) gates the browser-first premise".
- **Spine:** AD-3 "`tick` (uint32, 1000 Hz)"; AD-4 "owes ⌊elapsed / 1 ms⌋ steps"; conventions "`tick: number` (uint32, 1 kHz)"; tunables named `ballSaveTicks`.
- **Why it matters:** the spine's own Deferred list says spike 1 may send the sim to 480 Hz, but every tick-denominated timer, tunable name, replay format and the 200-step cap silently assumes 1 ms. A builder who honours SM-C3 has to touch every AD.
- **Fix:** one constant `TICK_HZ` in `sim/contracts` (default 1000, spike may set 480); all tunables authored in ms/s (`ballSaveMs`) and converted to ticks at load; the replay header records `TICK_HZ`; AD-4's cap is "200 ms of owed time", not "200 steps".

### C-2 — `bd_plunger` is a parking ball device, but the manual plunger is a physics hardware rule acting on a live ball
- **PRD:** FR-18 (manual, variable-strength key-hold plunge; launcher not bouncy), FR-19 ("a saved ball is auto-launched"), FR-38 ("the trough auto-launches the difference").
- **Spine:** AD-6 lists `bd_plunger` among devices that "park an entering ball — removed from the simulated set" and eject "only on `CoilCommand eject(device)`"; AD-5 makes the plunger a button→solenoid hardware rule inside physics.
- **Why it matters:** a parked ball is not in the simulated set, so the AD-5 plunger has nothing to strike. One builder will read `eject(bd_plunger)` as "unpark for manual plunge", another as "auto-launch onto the playfield"; ball save and War top-up (FR-19/38) diverge.
- **Fix:** AD-6: `bd_plunger` (shooter lane) is a **non-parking** device — the ball stays simulated resting on the plunger tip, its entry switch is `s_shooter_lane`; manual plunge is the AD-5 hardware rule; `eject(bd_plunger)` fires the auto-launch coil `c_autolaunch`. `bd_trough.eject` serves a ball into the shooter lane.

### C-3 — Slam tilt lives in `host/` on a wall-clock sliding window, against AD-3, AD-15 and NFR-5
- **PRD:** FR-16, OQ-4 (must not share the bob's threshold), FR-8/NFR-5 (identical inputs replay identically), UJ-3 ("a Slam tilt ends both games").
- **Spine:** AD-5 "Slam tilt is a host-side nudge-abuse detector (sliding window, its own threshold) that injects the synthetic switch `s_slam_tilt`"; AD-3 "every rules timer … is a tick count"; AD-15 "every tunable … is data in `sim/table/tuning.ts`" including "slam threshold".
- **Why it matters:** the detector's window is a timer outside `sim/`, its threshold is a tunable the host must read from `sim/table`, and unless `s_slam_tilt` is part of the per-tick input diff a replay cannot reproduce a slam. The spine also resolves OQ-4 without saying so.
- **Fix:** move the detector into `sim/physics` (next to the cabinet oscillator): a tick-windowed count of nudge impulses whose closure is the switch `s_slam_tilt`, threshold in `tuning.ts`. Record OQ-4 as resolved by AD-5. Nothing then needs host-side switch injection.

### C-4 — The dependency graph forbids imports that AD-5, AD-14 and AD-15 require
- **Spine:** graph arrows are "the only permitted import directions"; there is no `host → sim/contracts` and no `host → sim/table`. Yet `host/input` builds `InputFrame` (contracts), `host/settings` layers tuning overrides (table), `host/dev` exports to `tuning.ts` (table), `host/loop` consumes `FrameOutput` (contracts). AD-16's lint text does not restrict `host/` at all, so lint and graph disagree.
- **Fix:** add `host --> contracts` and `host --> table` arrows and state in AD-16 that `host/**` may import `sim/contracts`, `sim/table`, `sim/loop` and `presentation/**` — never `sim/physics` or `sim/rules` directly.

### C-5 — Accumulator discards the sub-millisecond remainder every frame
- **PRD:** FR-7 ("identical inputs produce identical outcomes at 30, 60, and 120 Hz"), NFR-2.
- **Spine:** AD-4 "The host accumulator owes ⌊elapsed / 1 ms⌋ steps per frame … owed time beyond the cap is discarded" — nothing says the floor remainder is carried.
- **Why it matters:** read literally, a 60 Hz frame (16.67 ms) runs 16 steps and loses 0.67 ms — 4 % slow motion, and a different amount at 30 / 120 Hz. That is exactly the frame-rate dependence FR-7 forbids.
- **Fix:** "the accumulator carries the remainder; only time beyond the 200 ms cap is discarded".

---

## 2. Missing / should-fix

Each entry: PRD ref → what the spine leaves open → suggested one-line addition.

### S-1 — Input edges are latched per frame, so live outcomes still vary with display rate (FR-7, NFR-3)
AD-4 latches one `InputFrame` per rAF; the same physical key press lands on a different tick at 30 Hz than at 120 Hz. Replays are deterministic; live play across display rates is not, which is the letter of FR-7's consequence.
**Add to AD-4:** "`InputFrame` carries per-tick edges: the host maps each key event's `timeStamp` onto the tick it falls in, so a press applies at the same tick regardless of frame rate." (Borderline contradiction; listed here because the fixed-step intent is met.)

### S-2 — Coil-fire and mechanism sounds have no event source (FR-46, FR-30)
AD-2/AD-13 give mechanical audio one source, `ContactEvent` (ball contacts). Flipper snap "at every press", sling/pop kicks, drop-bank reset, Mouth kick and end-of-stroke are actuations, not ball contacts; flippers are hardware rules so no `CoilCommand` exists to key off either. A builder will fall back to reading `InputFrame` in presentation and play snap during Tilt.
**Add to AD-2:** "`ContactEvent.kind` includes physics-side actuations — `coil_fire`, `flipper_eos`, `drop_target_down`, `bank_reset`, `eject` — so every mechanical sound has exactly one source; `InputFrame` is never read by presentation."

### S-3 — The Mouth must open *before* the first ball leaves (FR-30, FR-38, SM-2)
FR-30: "the mouth-open animation precedes the first ball leaving the Mouth". Under AD-6 `eject(bd_lock)` spawns the ball on the tick the command applies; presentation learns of it at the earliest the same frame. Nothing gives the animation a lead.
**Add to AD-6 or AD-9:** "Rules emit `mouth_opening` at least `mouthOpenLeadMs` (tunable) before the first `eject(bd_lock)`; the Dragon's hit reaction is keyed from `ContactEvent.surface = dragon`, the mouth from the rules event — one source each."

### S-4 — Lock physical capacity and total ball count are unspecified (FR-37, FR-38, FR-35, UJ-3)
FR-37: a third ball entering a full Lock is ejected "and the credit still counts" — under AD-6 the ball must park first, so `bd_lock` needs capacity 3 (2 held + 1 staging) and a rules `eject(bd_lock)` on overflow. UJ-3 + FR-35: Quick multiball with two of the other player's balls in the Lock needs 2 in play + 2 locked = **4** physical balls; with 3 the trough is empty and Quick multiball silently fails.
**Add to AD-6:** "The machine carries 4 balls; `bd_trough` capacity 4, `bd_lock` capacity 3 (2 held + 1 staging, FIFO eject). Rules handle `eject_failed`/empty trough as a reported condition, never as a hang."

### S-5 — Slingshots, pop bumpers and the drop-bank reset have no stated owner (FR-31, FR-28, FR-15, FR-23)
AD-5 covers flippers and plunger; AD-6 covers ball devices. Slings and pops could be physics autofire rules or rules-issued `CoilCommand`s one tick later; either works for feel, but Tilt (FR-15; real machines kill all coils), Ball search (FR-23 pulses them) and audio (S-2) depend on which. Drop targets: down = non-collidable (physics state), letter = rules state; reset is a coil.
**Add to AD-5:** "Slingshots and pops are autofire hardware rules in physics behind the same `coils.enable(bool)` gate as the flippers; the DRAGON bank's target-down state is physics-owned, raised only by `CoilCommand reset(c_dragon_bank)`; letter state is rules-owned."

### S-6 — Ball search has no way to recover a stuck ball (FR-23)
FR-23 "on failure, serves a new ball". A ball wedged in geometry stays in the simulated set forever; rules' ball accounting (AD-6) then disagrees with physics permanently. The vocabulary has `ball_missing` but no command that acts on it.
**Add to AD-6:** "Ball search is a rules protocol of tick-timed `CoilCommand`s (eject every device, pulse slings/pops); its final stage issues `recover_stuck_balls`, the one command that lets physics despawn any ball outside a device and report `ball_missing` with the count."

### S-7 — High-score table crosses the sim boundary in both directions with no stated path (FR-51, FR-3, FR-24, UJ-2)
Persistence is host-only (AD-14) but "a qualifying score prompts initials entry" and entry is "via the flippers and Start" — a rules phase. Rules need the current table as input; host needs the entered initials out. One builder puts the whole thing in host over the snapshot; another in rules. Grand Champion is not mentioned.
**Add to AD-14:** "The high-score table (Grand Champion + ranked list) enters `GameState.machine.highscores` read-only at game start alongside tuning overrides; initials entry is a rules phase driven by cabinet switches; `highscore_entered { player, initials, score, rank }` is the event the host persists."

### S-8 — Display-paced sequences need a rules-side clock (FR-20, FR-22, FR-24, FR-33)
Bonus count-down, Match reveal, game-over scores and the mode-selection window are sequences whose *duration* someone must own. The conventions say presentation "never writes back", so it cannot signal completion; nothing says rules pace them.
**Add to AD-3:** "Every display-paced sequence (bonus count-down, Match, mode select, high-score entry timeout) is a rules tick timer emitting step events; presentation animates to them and never reports completion."

### S-9 — AD-14 makes volume and key bindings wait for the next game (FR-49, FR-50)
AD-14: settings "reach sim as tuning overrides at game start … and apply to the next game". Volume and bindings are not sim tunables and must apply immediately; Pitch, Tilt warnings, balls per game and Match probability are and must not.
**Add to AD-14:** "Settings split by owner: sim tunables (Pitch, Tilt warning count, balls per game, Match probability) apply at the next game; host/presentation settings (volume, key bindings) apply immediately. The snapshot carries the effective Pitch so presentation's table tilt (AD-10) matches physics."

### S-10 — Switch zones tested per tick can miss a fast ball (FR-11, NFR-2)
AD-11: `sw_` zones are "analytic tests, not physics sensors". A ball at 10 m/s moves 10 mm per 1 kHz tick (≈ 20 mm at 480 Hz); a rollover zone thinner than that is skipped by a point-in-volume test.
**Add to AD-11:** "Switch zones are tested against the ball's per-tick swept segment (and device entry against the swept sphere), never against the end position alone."

### S-11 — Headless physics tests and epic 1 need geometry without Babylon (NFR-5, AD-15, §6.3)
`sim/**` may not import `@babylonjs/*` (AD-1/16), yet AD-11 makes the glb "the sole owner of every position, mesh and switch zone" and AD-15 replays physics in Vitest. Nothing says how `sim/physics/loader` reads a glb in Node. Separately, §6.3's epic 1 ("one ball, two flippers and a bare Playfield … nothing in (1)–(3) should wait on art") meets a loader that "fails fast on a missing node".
**Add to AD-11:** "`tools/export` emits `public/assets/dragonwar.glb` for presentation **and** `dragonwar.collision.json` (col_/sw_/device nodes, mm, table frame) for `sim/physics/loader`; sim never parses glb. Epic 1 ships a placeholder `.blend` of primitives that already follows the node prefixes, so the pipeline, not the art, is the epic-1 deliverable."

### S-12 — Real dimensions are asserted nowhere (FR-4)
AD-10 fixes the ball at 26.99 mm; playfield 20.25 × 42.00 in and flipper bat 3.125 in live only in the PRD. The Blender file could drift and nothing would notice.
**Add to AD-11:** "`sim/table/dragonwar.ts` declares playfield size, ball diameter and flipper length as constants; the loader fails fast if the collision bounds or flipper nodes disagree beyond a tolerance."

### S-13 — `Snapshot` content is undefined; mechanism visuals have no driver (FR-30, FR-28, FR-26, FR-46)
The structural seed's presentation has scene, lighting, backglass, audio, camera — no place for flipper angles, drop-target up/down, spinner rotation, plunger position, Lock ball count or the Dragon rig. AD-13's roll voice needs per-ball speed and surface in the snapshot.
**Add to AD-4/contracts:** "`Snapshot = { tick, balls[{id,pos,vel,speed,surface}], mechanisms{flippers,plunger,dropTargets,spinner,devices}, game: GameState }`; add `presentation/mechanisms/` (flipper, drop target, spinner, Dragon rig) that renders poses from the snapshot."

### S-14 — Replay header must carry the effective tuning, and hot-apply must be recorded (FR-8, NFR-5, AD-15)
AD-4: replay = "seed + table/tuning hash + per-tick input diffs". Player overrides (Pitch!) change physics, and a hash verifies but cannot reproduce; the dev panel "hot-applies to the running sim", which AD-3/AD-4 do not account for.
**Add to AD-4:** "The replay header embeds the effective tuning (defaults + overrides) and `TICK_HZ`; a dev-panel hot-apply is recorded in the input stream as a `tuning_patch` at its tick or invalidates the replay."

### S-15 — Architectural lighting has no command and no owner (FR-42, glossary)
FR-42 says all four channels are "driven independently by the Rules layer"; the glossary says architectural lighting is "not tied to game state". AD-9 defines Lamp/Flasher/Gi commands only.
**Add to AD-9:** "Architectural lighting is a set of `gi_` channels (`gi_backbox`, `gi_cabinet`, `gi_arch`) driven by `GiCommand`; rules set them once per phase (attract/game/tilt) and never per event."

### S-16 — Ball save vs Tilt, and multiball Ball save ownership (FR-15, FR-19, FR-35)
FR-19 "multiball Modes set their own Ball save" and FR-15 "every ball in play drains" — a builder who leaves Ball save armed on Tilt returns the drained balls. AD-7 puts the ball-save timer under `machine`; AD-8 says a mode owns its timers.
**Add to AD-8:** "Ball save is a machine timer that modes may *arm* via a command (`ball_save.arm(ticks)`); Tilt disarms it; there is one ball-save timer, never one per mode."

---

## 3. Minor

- **M-1** FR-18 says the Skill-shot lane *rotates* each plunge; AD-3 lists "skill-shot lane" as rules randomness (PRD FR-8 says the same). Pick one; if rotating, drop it from the PRNG list.
- **M-2** AD-8 priorities enumerate base/timed/Quick/War; Skill shot and Joust are not assigned. State "Skill shot 200, Hurry-up and Joust 300".
- **M-3** AD-7 scopes the Jackpot seed to `machine`; FR-39 "per War started this game" is ambiguous per player vs per game in Hot seat. The spine has chosen — note it as a decision in AD-7.
- **M-4** FR-22 Match "awards a free game"; no credit concept anywhere. Either `machine.credits` with Start consuming one, or state that Match is display-only in v1 (free play).
- **M-5** Capability map has rows for FR groups and NFR-5 only; add NFR-1 (frame budget: `presentation`, AD-12/Deferred worker), NFR-3 (`host/input`, AD-5), NFR-4 (AD-17), NFR-6/8 (AD-17), NFR-7/9 (AD-14/16), and UJ-1..4.
- **M-6** `[ADOPTED]` appears on AD-1,2,5,6,8,9,11,13,16 but not AD-3,4,7,10,12,14,15,17. If untagged means proposed, say so; otherwise tag them.
- **M-7** AD-10 "geometry is authored flat" reads as planar; the Ramp is 3D. Say "authored unpitched (zero slope)".
- **M-8** One `FrameOutput` can carry up to 200 ticks of `ContactEvent`s; audio should schedule each by its tick offset within the frame, not fire them all at frame time (FR-46 roll/contacts collapse into one click otherwise).
- **M-9** §10 status: OQ-4 is resolved by AD-5 (say so, see C-3); OQ-2 (Match %) is a tunable and is not mentioned; OQ-1/3/5/6/7/8 are correctly carried in Deferred.
- **M-10** NFR-6 (Windows 11 / macOS current-1) and NFR-8 (English only) are absent; a one-line convention "no i18n scaffolding; English literals in `presentation/backglass` only" prevents a builder adding string tables.
- **M-11** FR-49 "Attract shows the current bindings once": the Backglass renders from snapshot + events, but bindings are host data. Note that host passes a `ViewConfig { bindings }` to presentation at compose time.
- **M-12** During the War every Lock-lane Strike parks and re-ejects through the Mouth (AD-6 park-and-eject), so FR-30's mouth animation and FR-45's "Mouth ejecting" flasher fire on every lane Strike. Probably desirable; confirm, or add a physical `c_lock_post` diverter to the table definition.
- **M-13** AD-4 `FrameOutput.commands` exposes `CoilCommand`s to presentation while AD-9 says `CoilCommand` is rules-to-physics only. Clarify: presentation may observe commands for eject/reset animation but never re-issues them (unnecessary if S-2/S-3 actuation events exist).
- **M-14** `tick` as uint32 at 1 kHz wraps at 49.7 days; harmless, but state that `tick` resets at game start or note the wrap.

---

## 4. Confirmed-covered summary

| PRD group | Verdict |
| --- | --- |
| §4.1 Walk-up & Presentation (FR-1..4) | Covered by AD-9/10/11 and `presentation/camera`, `backglass`; Walk-up keyed off `GameState.phase`. Gaps: S-12 (dimension assertion), M-11. |
| §4.2 Ball & Flipper Feel (FR-5..12) | Covered by AD-3/4/5/10/15 (hop control, elasticity falloff, pitch bounds as tunables; ball-ball via vpx-js port). Gaps: C-1, C-5, S-1, S-10. |
| §4.3 Nudge & Tilt (FR-13..16) | Covered by AD-5/7 (oscillator, bob, per-player warnings, debounce ticks). Gaps: C-3 (slam), S-5, S-16. |
| §4.4 Standard Game Flow (FR-17..25) | Covered by AD-3/6/7/8 (Hot seat, ball controller, seeded Match, tick timers). Gaps: C-2 (plunger), S-6 (ball search), S-7 (high score), S-8 (paced sequences), M-1, M-4. |
| §4.5 Shot Map & Devices (FR-26..32) | Covered by AD-6/11 with geometry correctly deferred (OQ-5/6). Gaps: S-3 (mouth lead), S-4 (capacities), S-5 (slings/pops/bank), S-11 (loader), S-13 (snapshot/mechanisms). |
| §4.6 Feature Modes & War (FR-33..41) | Covered by AD-6/7/8/9 (park-and-eject decides lock/mode/Strike, priority stack, four-phase events, per-player credits, machine-scoped Jackpot seed). Gaps: S-4, S-16, M-2, M-3, M-12. |
| §4.7 Lighting & Colour Grammar (FR-42..45) | Covered by AD-9/12 (role table, four channels, UV2 contract, WebGL2 floor). Gap: S-15 (architectural lighting). |
| §4.8 Audio (FR-46..48) | Covered by AD-2/13 (cues by name, asset provider, contact-driven mechanical sound, roll voice). Gaps: S-2 (actuation events), M-8. |
| §4.9 Input, Settings, Persistence (FR-49..52) | Covered by AD-5/14 (versioned `dragonwar.save`, layered overrides, no network). Gaps: S-7, S-9, M-11. |
| §4.10 Distribution (FR-53..55) | Covered by AD-16/17 (static bundle, platform gate, size budget, boundary lint, licence headers, ATTRIBUTIONS-first). No gaps. |
| NFR-1..4 | AD-4 (decoupled fixed step, catch-up cap), AD-5 (local flipper loop), AD-17 (payload budget). Gaps: C-1, C-5, S-1, M-5. |
| NFR-5 | AD-3/4/15 (headless rules, replay by state hash). Gaps: C-3, S-11, S-14. |
| NFR-6..9 | AD-14/16/17. Gap: M-10 (OS floor / English-only not stated). |
| UJ-1..4 | UJ-1/2 via §4.1–4.6; UJ-3 Hot seat isolation via AD-7 scopes, trough top-up via AD-6; UJ-4 via AD-15 tuning file + dev panel. Gaps: S-4 (UJ-3 ball count), C-3 (UJ-3 slam replay). |
| §6.3 Sequencing intent | Nothing contradicts; Deferred places spikes in epic 1 and geometry in epic 2. Gap: S-11 (epic-1 placeholder blend so art never blocks (1)–(3)). |
| §10 Open questions | OQ-1/3/5/6/7/8 carried in Deferred; OQ-4 resolved by AD-5 (unrecorded, and see C-3); OQ-2 unmentioned (tunable). |
