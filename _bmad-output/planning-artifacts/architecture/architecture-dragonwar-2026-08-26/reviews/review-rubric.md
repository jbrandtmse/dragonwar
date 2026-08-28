---
title: 'Rubric review — DragonWar Architecture Spine'
reviewer: rubric-walker
target: ../ARCHITECTURE-SPINE.md
date: '2026-08-26'
verdict: 'Sound skeleton, not yet a build substrate'
counts: { critical: 0, high: 6, medium: 10, low: 17 }
---

# Rubric review — ARCHITECTURE-SPINE.md

Scope: the spine judged as a spine (divergence coverage, enforceability, completeness of dimensions, terseness, consistency). PRD reconciliation is a separate step and is not repeated here; PRD §4 and §8 were read for context only.

## Checklist walk

| # | Criterion | Result |
| --- | --- | --- |
| 1 | Fixes the real divergence points below; misses none | **Misses six** on the physics↔rules and rules↔presentation seams (H1–H6). The layer boundary, clock, state ownership and ball accounting are fixed well. |
| 2 | Every Rule enforceable and prevents its Prevents | Mostly yes. AD-3's ban on wall-clock/`Math.random` is not carried into AD-16's lint list (M3); AD-9's lamp rule cannot be checked because command semantics are undefined (H3). |
| 3 | Nothing under Deferred lets two units diverge | Deferred list is clean. The problem is the reverse: six undecided points are absent from both the ADs and Deferred (H1–H6, M4). |
| 4 | Named tech verified-current | Stack table dated 2026-08-26; accepted as verified. The boundary lint AD-16 mandates has no tool named (M6). |
| 5 | Every owned dimension decided/deferred/open | Deployment, infra, boundaries, state ownership, licensing, testing, build/CI, asset pipeline: decided. Gaps: runtime error handling beyond the platform gate (M10), performance budget number (M7), replay/data formats (L7), security enforcement of "no network" (L9), accessibility (L15), release identity (L14). |
| 6 | Terse; no placeholders; valid mermaid | All four diagrams parse (quoted labels, `loop` block, `||--o{` labels, cylinder node). No placeholders. Tagging is inconsistent (L1); erDiagram models scalars as entities (L11). |
| 7 | Capability map covers every PRD group | §4.1–§4.10 all mapped. Only NFR-5 of nine NFRs has a row (L10); FR-30 Dragon animation has no home (H6). |
| 8 | Internal consistency | Seed directories match AD citations. Contradictions: AD-5 plunger-as-hardware vs AD-6 plunger-as-parking-device (H2); AD-11 fail-fast loader vs Errors convention (M5); AD-5 host-injected switch vs AD-2 physics-only switches (M2); AD-4 per-frame input latch vs per-tick replay (M1). |

## Findings

### Critical

None.

### High

**H1 — AD-2 / AD-8 / seed: no switch→shot translation layer.** Modes "receive every event", but nothing decides who turns raw `SwitchEvent`s into shots (a Loop is an entry switch then an exit switch within N ticks; a Ramp is made-or-fell-back; a Dragon hit is a body switch outside the Lock lane). Built independently, each mode epic parses switches its own way and Joust, Hurry-up and War disagree on what "a Loop" is.
*Fix:* add `sim/rules/devices/` (shots, drop bank, spinner, lanes, ball devices) as the **only** consumer of `SwitchEvent`; modes and scoring consume device events only (`shot_left_loop_made`, `ramp_made`, `bank_target_down {letter}`, `dragon_hit`, `lock_lane_entered`).

**H2 — AD-5 vs AD-6: the plunger cannot be both a hardware rule and a parking device; auto-launch is undecided.** AD-6 makes `bd_plunger` a `ball_device` that removes the ball from the simulated set and ejects only on command; AD-5 makes the plunger a key-hold-driven physics mechanism that must strike a simulated ball. FR-19 and FR-38 also need an auto-launch that no AD names. Epic 1 (plunge) and epic 2/3 (ball save, multiball add-ball) will each invent one.
*Fix:* `bd_plunger` is not a parking device — `eject(bd_trough)` spawns the ball resting in the shooter lane on `s_shooter_lane`; manual plunge is a physics rod impulse from key-hold strength; auto-launch is the coil `c_autolaunch` commanded by rules; drop `bd_plunger` from AD-6's list.

**H3 — AD-9: `LampCommand` semantics undefined; nobody owns current lamp state.** Edge (emit on change) or level (emit every tick)? When a mode stops, who turns its lamps off? Where is the Jackpot brightness/blink ladder held so the Backglass, the lighting driver and a replay agree? A lighting epic and a modes epic built apart will pick opposite answers.
*Fix:* lamp state is a pure projection `lampsOf(state): LampState` computed by rules every step from `GameState` (modes contribute roles by priority); `sim/loop` emits the diff as `LampCommand`s; presentation mirrors it; no mode ever "turns a lamp off".

**H4 — AD-1 / AD-4 / contracts: `Snapshot` is named but never defined.** Scene (ball poses, flipper angles), backglass (game state), and audio roll voices (per-ball speed and surface) all read it; three presentation stories will each assume a different shape, and the deferred Worker move needs it structured-cloneable.
*Fix:* define in `sim/contracts`: `Snapshot = { tick, balls[]{ id, pos, vel, speed, surface }, flippers[]{ angle }, devices{ name → count/state }, game: Readonly<GameState> }`, plain data, structured-cloneable.

**H5 — AD-5: autofire devices unassigned.** Slingshots, pop bumpers, drop-target reset and the spinner are neither "hardware rules inside physics" (AD-5 lists only flippers and plunger) nor rules coils (AD-6 lists only ball-device ejects). A sling kick routed through rules arrives one tick late and needs a coil command the physics epic may never expose.
*Fix:* extend AD-5: slings and pops are hardware rules in physics (switch → kick same tick; the switch still reaches rules for scoring); spinner is passive; drop-bank reset (`c_bank_reset`) and every ball-device eject are rules coils.

**H6 — Capability map §4.5 / FR-30: the Dragon animation has no home and no trigger.** FR-30 requires the mouth to open *before* the first ball leaves the Mouth, but the eject is a `CoilCommand` to physics that presentation never sees. No AD, directory or map row covers it.
*Fix:* rules emit `mouth_will_open` then issue `eject(bd_lock)` after `mouthOpenTicks` (tunable); add `presentation/scene/dragon/` driven by semantic events (`mouth_will_open`, `mouth_closed`, `dragon_hit`); add it to the §4.5 map row.

### Medium

**M1 — AD-4 vs replay / FR-7 / NFR-3: input is latched per frame but replays are "per-tick input diffs".** With one `InputFrame` per rAF, the tick at which a press lands depends on display rate (33 steps at 30 Hz, 8 at 120 Hz), so "identical inputs at 30/60/120 Hz" is unachievable and the per-tick recording is fiction.
*Fix:* host tick-stamps key edges from `event.timeStamp` relative to the accumulator; `InputFrame` = held state + tick-stamped edges within the owed range; the replay records exactly that.

**M2 — AD-5 vs AD-2: slam tilt is a second switch source.** AD-2 makes physics the only emitter of `SwitchEvent`; AD-5 has host "inject" `s_slam_tilt`, which also bypasses `InputFrame` and therefore the replay.
*Fix:* slam detector output is a field of `InputFrame`; `sim/loop` emits all cabinet switches (`s_start`, `s_left_flipper`, `s_right_flipper`, `s_plunger`, `s_slam_tilt`) from `InputFrame`; physics emits playfield switches only.

**M3 — AD-16: banned-globals list does not enforce AD-3.** Lint bans `window`, `document`, `performance` but not `Math.random`, `Date`, `setTimeout`/`setInterval`, `requestAnimationFrame`, `localStorage`, `navigator`, `globalThis` — exactly the leaks AD-3 and AD-14 exist to prevent.
*Fix:* add those identifiers to the `sim/**` restricted-globals rule.

**M4 — AD-14: high-score table has no read path into rules.** Rules must decide whether to prompt for initials (FR-51, `phase` in `GameState`), but only host reads `dragonwar.save` and AD-14 passes settings only.
*Fix:* host passes `highscores` into `newGame(config)` alongside tuning overrides; rules emit `highscore_entered { initials, score, rank }`; host persists.

**M5 — AD-11 vs Errors convention.** "The loader fails fast on a missing node" contradicts "`sim/` never throws in production paths" — `sim/physics/loader` is in `sim/`.
*Fix:* reword Errors: "load-time paths (`loader/`, `newGame`) throw and boot reports them; step paths never throw."

**M6 — Stack: the boundary lint AD-16 mandates has no tool.** No linter or formatter is named at all.
*Fix:* add a row, e.g. `ESLint 9.x (no-restricted-imports, no-restricted-globals)` or `dependency-cruiser 17.x`, with version and verification date.

**M7 — AD-17: the CI payload budget has no number.** "A compressed initial-payload budget" is unenforceable until a figure exists; spike 3 is listed but no provisional value.
*Fix:* set a provisional budget (e.g. ≤ 20 MB compressed initial payload, ~4 s at 50 Mbps) and note it is re-set by spike 3.

**M8 — AD-3 / Conventions: 1 kHz is baked into every `*Ticks` tunable and the 200-step cap while spike 1 may force 480 Hz.** A rate change would touch every tunable and the loop.
*Fix:* one `TICK_HZ` constant in `sim/contracts`; tunables in ms (`ballSaveMs`) converted once at load; the cap stated in ms.

**M9 — AD-15: "state hash" is undefined and float determinism across engines is unaddressed.** V8 and JavaScriptCore differ in transcendental functions; golden hashes recorded in Node may not match Safari.
*Fix:* hash = FNV-1a over canonical JSON of `GameState` plus ball positions quantised to 0.01 mm; goldens are per-engine (Node in CI); browser parity is asserted on `GameState` only.

**M10 — AD-17 / Errors: runtime failure after the platform gate is silent.** Asset 404, glb parse failure, engine creation failure and WebGL context loss have no decided behaviour.
*Fix:* extend AD-17: any boot-stage failure renders the same host error panel as the platform gate; context loss uses Babylon's restore path and the sim keeps stepping.

### Low

**L1 — ADs:** `[ADOPTED]` appears on 8 of 17 ADs with no stated meaning. *Fix:* define the tag (e.g. "carried from research") or remove it.

**L2 — AD-8:** Skill shot is a Mode (PRD §3) but has no priority. *Fix:* assign 200.

**L3 — AD-11 / AD-13:** `TABLE.cues` refers to an export never named. *Fix:* AD-11: "`dragonwar.ts` exports `TABLE as const`."

**L4 — AD-14:** "settings apply to the next game" is over-broad; volume and keybindings are host/presentation and should apply immediately. *Fix:* "sim-affecting settings apply at next game; host settings apply immediately."

**L5 — AD-3:** "Wall-clock exists only in the host accumulator" contradicts presentation's legitimate ms use (`FlasherCommand.ms`, camera Walk-up). *Fix:* "no wall-clock inside `sim/`."

**L6 — Conventions/Device names:** the "string literal anywhere else is a lint error" rule would flag the switch-script test DSL. *Fix:* type the DSL by `SwitchName` and exempt `test/**`.

**L7 — AD-15:** replay file format unnamed. *Fix:* `test/replays/*.replay.json`, schema in `sim/contracts/replay.ts`.

**L8 — AD-13:** audio sample container undecided; Safari has no Ogg Vorbis. *Fix:* `.wav` masters in `assets/src/`, `.mp3` shipped in `public/assets/`.

**L9 — AD-17 / NFR-7:** "no network after load" has no enforcement; Pages sets no headers. *Fix:* `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'">` in `index.html` plus a CI grep.

**L10 — Capability map:** only NFR-5 has a row. *Fix:* add rows for NFR-1..4 and 6..9 (AD-12/17, AD-4, AD-4/5, AD-17, AD-17, AD-14, AD-14, AD-16).

**L11 — AD-7 erDiagram:** `LOCK_CREDITS`, `DRAGON_LETTERS`, `BONUS` are scalars drawn as entities. *Fix:* use attribute blocks on `PLAYER` or drop them.

**L12 — AD-15 Binds:** cites SM-4 and SM-C4, outside the frontmatter `binds` vocabulary. *Fix:* bind to NFR-5/UJ-4 only.

**L13 — Testing:** presentation testing is silent. *Fix:* one line: "no automated presentation tests in v1" or a Babylon `NullEngine` load smoke test.

**L14 — Deployment:** every push to `main` is a release with no identity. *Fix:* stamp the commit SHA into the build and show it in the settings panel; tag `v1.0.0` at release.

**L15 — NFR-8:** accessibility never mentioned. *Fix:* add to AD-14: "rebindable keys satisfy NFR-8; no other accessibility feature in v1."

**L16 — Deferred/Asset split:** if the glb is split, the loader's node-name lookup needs uniqueness across files. *Fix:* "node names are unique across all glbs."

**L17 — AD-15:** dev-panel hot-apply changes tuning mid-session, invalidating the replay header's tuning hash. *Fix:* the recorder snapshots the effective tuning at record start and refuses to record after a hot-apply.

## Verdict

The spine gets the big cuts right — one clock, switches-only into rules, plain-data state with fixed scopes, linted boundaries — but six undecided points on its own seams (shot translation, plunger/auto-launch, lamp state, snapshot shape, autofire devices, Dragon animation) would let epics 1–3 diverge if cut today, so it is a sound skeleton that is not yet a build substrate.
