---
title: 'Second-pass verification — DragonWar architecture spine'
lens: verify
target: ../ARCHITECTURE-SPINE.md
status: complete
created: '2026-08-26'
inputs:
  - review-adversary.md (C1-C3, H1-H6)
  - review-rubric.md (H1-H6)
  - ../reconcile-prd.md (C-1..C-5)
  - ../reconcile-brief.md (C-1..C-3)
  - ../reconcile-research.md (C-1..C-3)
  - review-freshness.md (F-1)
---

# Verification — ARCHITECTURE-SPINE.md (re-distilled)

**Scope.** Closure of the 27 Critical/High/contradiction findings from round one; new internal contradictions introduced by the rewrite; Mermaid validity of the four diagrams.

**Verdict.** All 27 round-one findings are closed by the new text. The rewrite introduces 6 substantive internal contradictions (two of them ownership conflicts between AD-8/AD-19 and AD-7/AD-19 of the same kind round one was fighting), 6 low-severity inconsistencies, and one Mermaid line that will not render. None reopens a round-one finding; all are one-sentence edits.

---

## 1. Closure

| # | Source | Finding | Status | Closed by |
| --- | --- | --- | --- | --- |
| A-C1 | adversary | Lock lane: two deciders, two eject commanders, two "multiball running" definitions | CLOSED | AD-18 (Lock arbiter sole consumer of `lock_lane_entered`; four outcomes; alone pulses `c_mouth`; `machine.multiball !== null` set/cleared only in `_starting`/`_stopped`) |
| A-C2 | adversary | Ball save: two timer owners, two trough-eject commanders, two `ballsInPlay` methods | CLOSED | AD-18 (`machine.ballSave` owned by ball controller, `arm`/`disarm` by source, only it pulses `c_trough_eject`/`c_autolaunch` and mutates `ballsInPlay`); AD-6 (counts = closed slot switches only) |
| A-C3 | adversary | `InputFrame` per frame vs replay per tick | CLOSED | AD-4 (tick-stamped `InputTransition[]`, frame in force per tick, edges derived in physics, key map host-only); Seam Contracts `InputFrame` bitset, `InputTransition`, replay = `ReplayHeader + InputTransition[]` |
| A-H1 | adversary | Plunger lane: device vs hardware rule; no "plunged" switch | CLOSED | AD-6 (`bd_shooter` non-parking, `s_shooter_lane` opening = plunged, `c_autolaunch`); AD-5 (`plungerSpeedByHoldMs`) |
| A-H2 | adversary | Switch debounce has no owner | CLOSED | AD-2 (physics emits edges only, hysteresis + `settleTicks` by class, rules never debounce, `tiltWarningSpacingMs`/`tiltSettleMs` semantic only); AD-6 (spinner closes once per revolution) |
| A-H3 | adversary | `LampCommand.level`/`pattern` vocabulary | CLOSED | AD-9 (`step ∈ {0..3}`, closed `role` set, `grammar.ts` owns cadence, `GiCommand.level` only continuous, `FlasherCommand.ms` only duration); Seam Contracts |
| A-H4 | adversary | One entry switch per device; capacity enforcement | CLOSED | AD-6 (`s_trough_1..4`, `s_lock_1..3`, park unconditionally lowest-empty / eject highest-filled, `device_overflow` → immediate eject) |
| A-H5 | adversary | Third frame conversion forbidden; Babylon handedness | CLOSED | AD-10 (glb frame defined, `glbToTable`/`toPhysics`/`toScene`, `useRightHandedSystem = true`, no `__root__` flip) |
| A-H6 | adversary | Event-to-snapshot join race; `modes[i]` shape | CLOSED | AD-9 (payload-complete events, `ModeView` the only readable shape); Seam Contracts `ModeView`, `SemanticEvent` |
| R-H1 | rubric | No switch→shot translation layer | CLOSED | AD-19 (`sim/rules/devices/` sole consumer of `SwitchEvent`; `TABLE.shots` as ordered switch sequences with windows) |
| R-H2 | rubric | Plunger cannot be hardware rule and parking device; auto-launch undecided | CLOSED | AD-6 / AD-5 (as A-H1) |
| R-H3 | rubric | `LampCommand` semantics; nobody owns lamp state | CLOSED | AD-9 (`lampsOf(state)` pure projection every step; `sim/loop` emits the diff; modes contribute roles by priority); seed `sim/rules/lamps.ts` |
| R-H4 | rubric | `Snapshot` never defined | CLOSED | Seam Contracts `Snapshot { tick, balls[], mechanisms, game, effectivePitchDeg }`, structured-cloneable |
| R-H5 | rubric | Autofire devices unassigned | CLOSED | AD-5 (slings, pops as hardware rules behind `c_sling_*`, `c_pop_*`); AD-6 (drop targets and spinner mechanical state in physics; `c_dragon_bank_reset`) |
| R-H6 | rubric | Dragon animation has no home or trigger | CLOSED | AD-18 (`ShowCommand dragon_mouth_open` precedes every Mouth eject by `mouthOpenLeadMs`); AD-9 (`dragon_mouth_open` is a show); seed `presentation/mechanisms/` dragon rig; Capability map §4.5 row |
| P-C1 | reconcile-prd | Tick rate hard-wired to 1 kHz | CLOSED | AD-3 (`TICK_HZ` one constant; tunables authored `…Ms`, converted once at load); AD-4 (cap is 200 ms of owed time); `ReplayHeader.tickHz` |
| P-C2 | reconcile-prd | `bd_plunger` parking vs manual plunger | CLOSED | AD-6 (`bd_shooter` non-parking) |
| P-C3 | reconcile-prd | Slam tilt in host on wall clock | CLOSED | AD-5 (slam detector in physics beside the oscillator, `slamNudgesPerWindow` in `tuning.ts`, closure `s_slam_tilt`, OQ-4 resolved) — but see N-1 below |
| P-C4 | reconcile-prd | Dependency graph forbids host imports the ADs need | CLOSED | Dependency graph (`host --> contracts`, `host --> table`); AD-16 host import list |
| P-C5 | reconcile-prd | Accumulator discards sub-ms remainder | CLOSED | AD-4 ("carries the fractional remainder; owed time beyond 200 ms is discarded") |
| B-C1 | reconcile-brief | Plunger lane AD-5 vs AD-6 | CLOSED | AD-6 / AD-5 (as A-H1) |
| B-C2 | reconcile-brief | Clustered lighting called WebGPU-specific | CLOSED | AD-12 (clustered forward is the WebGL2 dynamic path, budget 20 `[ASSUMPTION]`, `?renderer=webgl2`); Deferred "WebGPU-only quality — never a feature" |
| B-C3 | reconcile-brief | Pulse-then-hold bolted onto the port | CLOSED | AD-5 (`FlipperMover` verbatim; MPF pulse/hold are calibration references, never parameters); AD-15 and Deferred list strength/ramp-up/EOS/return only |
| S-C1 | reconcile-research | Solver constants treated as tunables | CLOSED | AD-15 (two classes; solver constants incl. ball–ball restitution verbatim and never tunable; change = physics-version bump) |
| S-C2 | reconcile-research | Physics RNG unseeded | CLOSED | AD-3 (scatter 0 by default; second seeded PRNG in physics state; both seeds in header); AD-16 (`Math.random` banned under `sim/**`); `ReplayHeader.physicsSeed` |
| S-C3 | reconcile-research | Nudge ported as ball force | CLOSED | AD-5 (oscillator ported, ball coupling re-derived as table-frame motion, pinned by golden replay) |
| F-1 | freshness | TS 7.0 has no compiler API; boundary lint unspecified | CLOSED | Stack (TS 7.0.2 `tsc --noEmit` gate only, `types` explicit, no `baseUrl`; dependency-cruiser 18.2.0); AD-16 ("TypeScript-API-free tool") |

**Closed 27 / Open 0.** Stale round-one names are gone: no `c_lock_eject`, `bd_plunger`, `s_plunger_lane`, `s_lock_entry`, `c_bank_reset`, `s_left_flipper`, `c_autoplunge`, `mouth_will_open`, `ballSaveTicks`, `modeSelectTicks` anywhere in the spine.

---

## 2. New internal contradictions introduced by the rewrite

### Substantive

**N-1 — `s_slam_tilt` has two emitters (AD-2 vs AD-5).**
AD-2 lists `s_slam_tilt` among the cabinet switches `sim/loop` emits "from `InputFrame` transitions"; AD-5 puts the slam detector inside physics and makes `s_slam_tilt` its closure. A slam cannot be derived from input transitions by the loop *and* be a physics-side windowed count. Also, AD-2's "physics emits **playfield** switches" does not cover `s_tilt_bob` or `s_slam_tilt`, which are cabinet mechanisms in physics.
*Fix:* AD-2 → "Physics emits playfield **and cabinet-mechanism** switches (`s_tilt_bob`, `s_slam_tilt`) as edges …; `sim/loop` emits the **button** switches `s_start`, `s_flipper_l`, `s_flipper_r`, `s_plunger` from `InputFrame` transitions." Drop `s_slam_tilt` from the loop list.

**N-2 — The base mode pulses a coil (AD-19) but modes never emit a `CoilCommand` (AD-8).**
AD-8: "[a mode] never emits a `CoilCommand`." AD-19: "The base mode alone pulses `c_dragon_bank_reset`, on `ball_will_start` and on `bank_completed`." AD-18 reinforces AD-8 by naming the ball controller the only puller of the trough and autolaunch coils. Two legal builds again: bank reset in the base mode (AD-19) or somewhere that is allowed to emit coils (AD-8).
*Fix:* AD-19 → "The drop-bank component of `sim/rules/devices/` (which AD-19 already says owns the 'reset request') pulses `c_dragon_bank_reset` on `ball_will_start` and on `bank_completed`; no mode pulses it." Strike "The base mode alone".

**N-3 — Lanes have two owners (AD-7 vs AD-19).**
AD-7: lanes "(lit flags and completed sets, owned by the base mode; the skill-shot mode writes the lit Top lane once …)". AD-19: `sim/rules/devices/` "owns … lanes and lane change" and emits `lane_lit { lane }`. Whether the devices layer or the base mode decides which lane is lit — and therefore who writes `players[i].lanes` — is undecided; the skill-shot exception in AD-7 cannot be honoured by a devices layer that emits `lane_lit`.
*Fix:* AD-19 → devices layer owns lane **switches** only and emits `lane_entered { lane }` and `lane_change { direction }`; the base mode owns lit flags and completion under `players[i].lanes` and emits `lane_lit { lane }` / `lanes_completed`. Remove "lanes and lane change" from the devices-layer ownership list.

**N-4 — The ball controller consumes raw switches it is forbidden to see (AD-6/AD-18 vs AD-19).**
AD-19: "Modes, scoring and the ball controller consume device and shot events and never a raw switch." AD-6: "the opening of `s_shooter_lane` is the one event that means 'plunged': it increments `ballsInPlay`, starts the ball-save timer …" — mutations that AD-18 reserves to the ball controller. AD-19's emitted vocabulary has no event for a shooter-lane exit, a trough or lock slot closure (drain, lock, device fill), or `device_overflow`. Only `lock_lane_entered` exists. The ball controller therefore either reads `SwitchEvent` (breaking AD-19) or waits for events nobody emits.
*Fix:* AD-19 emitted list += `ball_launched` (on `s_shooter_lane` opening), `device_ball_entered { device, slot }` / `device_ball_left { device, slot }` (on slot-switch edges; trough entry is the drain). AD-6 → "the `ball_launched` event (the opening of `s_shooter_lane`) is the one event that means plunged".

**N-5 — `recover_stuck_balls` and `ball_missing` have no seam (AD-6 vs AD-9, AD-2, Seam Contracts).**
AD-9: "The rules→physics command is `CoilCommand { coil, action }`" and the Seam Contracts table has no other rules→physics type; yet AD-6 has ball search issue `recover_stuck_balls`, "the one command that lets physics despawn any ball". Conversely physics is to "report `ball_missing { count }`", but AD-2 gives physics only `SwitchEvent` and `ContactEvent` outputs and the sequence diagram shows no physics→rules semantic channel; `ball_missing` is a `SemanticEvent` in the Conventions vocabulary.
*Fix:* Seam Contracts += `RecoverCommand { type: 'recover', tick }`; AD-9 → "rules→physics commands are `CoilCommand` and `RecoverCommand`, nothing else". Physics answers recovery with a `ContactEvent`-style result the loop hands to rules, or simplest: physics returns `recovered: number` from `step()` and the **ball controller** emits `ball_missing { count }`. Pick one and state it in AD-6.

**N-6 — `ballSave.arm({ ms, source })` takes milliseconds at runtime (AD-18 vs AD-3 / Conventions).**
AD-3: timers are "authored in ms in `tuning.ts`, converted to ticks once at load … nothing else in `sim/` may contain a literal millisecond"; Conventions: "`…Ms` authored, `…Ticks` after load". AD-18's rules-internal `arm({ ms, source })` is an ms value crossing a runtime call inside `sim/rules`, so either the ball controller converts at call time (a second conversion site) or the mode passes an unconverted literal.
*Fix:* AD-18 → `ballSave.arm({ ticks, source })`; a mode passes its already-converted `…Ticks` tunable.

### Low

**N-7 — `show_` prefix is declared but never used.** Conventions: "`show_` show". AD-9 and AD-18 name the show `dragon_mouth_open`, and AD-13 says every sound is a show in `TABLE.shows` with no prefix shown. *Fix:* either `show_dragon_mouth_open` in AD-9/AD-18 or drop `show_` from the Conventions row (shots keep `shot_`, so keep the prefix and rename).

**N-8 — `spinner_tick` names two different events on two seams.** AD-2 / Seam Contracts: `ContactEvent.kind = 'spinner_tick'` (physics → presentation). AD-19: `spinner_tick` as a rules device `SemanticEvent`. Presentation receives both per revolution — the exact double-trigger AD-13 forbids — and the DSL/test vocabulary is ambiguous. *Fix:* rename the rules event `spinner_spin { count }` (or the contact kind `spinner_click`).

**N-9 — `sim/loop` names cabinet switches but has no `loop --> table` arrow.** AD-2 makes `sim/loop` emit `s_start`, `s_flipper_l`, … ; AD-16 makes a device-name literal outside `dragonwar.ts` a lint error; AD-1 says `dragonwar.ts` "is imported directly wherever a device is named". The graph LR has `loop --> physics | rules | contracts` only. *Fix:* add `loop --> table` to the diagram and to AD-16's import list. Related: `SwitchName`/`CoilName`/`LampName`/`ShowName` are used by `sim/contracts` but must be derived from `typeof TABLE` (else they are literals outside `dragonwar.ts`), which needs a type-only `contracts -.-> table` edge against the `table --> contracts` arrow. State where the name unions live (suggest `sim/table/names.ts`, imported type-only by contracts).

**N-10 — Sequence diagram has rules returning `lampDiff[t]`; AD-9 has `sim/loop` computing the diff.** AD-9: "`lampsOf(state)` … computed by rules every step …; `sim/loop` emits the diff as `LampCommand`s". *Fix:* diagram line → `R-->>L: events[t], commands[t], lampsOf(state)`.

**N-11 — `ReplayHeader` omits `highscores` and `adjustments`.** AD-14's `GameStart { seed, tuning, adjustments, highscores }` shapes `GameState` (balls per game, Match probability, the `highscore_entry` phase and `rank`), and AD-15 hashes `GameState`; the header carries `effectiveTuning` only. A replay of a game reaching initials entry cannot reproduce the hash. *Fix:* `ReplayHeader` carries the whole `GameStart` (or add `adjustments`, `highscores`), and AD-15 says so.

**N-12 — `ContactEvent.kind` includes `'roll'` but AD-13 drives roll from the snapshot.** AD-13: "ball roll is one continuous voice per `ballId` driven per frame from snapshot speed, surface and position", never from events; AD-2 lists ball contacts as hits. A per-tick `roll` contact would flood `contactEvents` and create a second roll source. *Fix:* remove `'roll'` from the kind union, or state it is reserved and never emitted in v1.

### Noted, not contradictions

- AD-11: "exactly two top-level nodes, `playfield_root` and `cabinet_root`, plus `pivot_pitch`" — say whether `pivot_pitch` is a third top-level node or an empty under `playfield_root`'s parent (AD-10 rotates `playfield_root` *about* it).
- AD-10: `glbToTable()` "used only by the loaders" — `sim/physics/loader` reads the collision JSON already in table-frame mm (AD-11), so the sole TS consumer is `presentation/scene`; `tools/export.py`'s Blender→mm write is the one conversion outside `frames.ts` and should be named as such.
- Two files called `replay.ts` (`sim/contracts/replay.ts` schema, `sim/loop/replay.ts` recorder) — fine, but worth a note in the seed.
- AD-3 / AD-15: a move to 480 Hz is also a solver-constant re-derivation (AD-15 says they are "tuned for `TICK_HZ = 1000`"), i.e. a physics-version bump — say so in AD-3's spike-1 sentence.
- `ViewConfig { bindings }` (AD-14) is a host→presentation type and not in the Seam Contracts table; acceptable since the table is scoped to `sim/contracts`, but say where it lives.
- Deferred "4-ball finale raises the machine ball count to 5" also needs `bd_trough` capacity 5 (`s_trough_5`) under AD-6's slot model.

---

## 3. Mermaid

| Diagram | Result |
| --- | --- |
| `graph LR` (dependency graph) | Renders. Quoted labels contain `—`, `/`, `(`, `)` — all safe inside quotes. |
| `sequenceDiagram` (loop) | **Fails.** Line `L->>L: frame = input in force at tick; cabinet switch edges` — the sequence-diagram lexer terminates message text at `;`, so `cabinet switch edges` is parsed as a new statement and the diagram errors. *Fix:* replace `;` with ` — ` or the entity code `#59;`. Everything else (`loop … end`, self-message `L->>L:`, `-->>`, brackets and braces in message text, parentheses in participant aliases) is valid. |
| `erDiagram` (GameState) | Renders. Quoted relationship labels with commas and `..`, attribute blocks with `int`/`string`/`bool`/`json` types, `||--o{` / `||--||` cardinalities all valid. |
| `graph TB` (deployment) | Renders. Cylinder `save[("localStorage dragonwar.save")]`, edge labels `|git push main|`, `|deploy dist/|`, `|later, same dist/|`, dotted `-.->` all valid. |

---

## 4. Summary

| Job | Result |
| --- | --- |
| Closure | 27 closed, 0 open |
| New contradictions | 6 substantive (N-1..N-6), 6 low (N-7..N-12) |
| Mermaid | 1 failure (sequence diagram, `;` in self-message text) |

Recommended order: N-2, N-3, N-4 (ownership — the same class of hole round one was closing), then N-1, N-5, N-6 (seam completeness), then the low items and the Mermaid fix, all as one-line edits.
