# Physics tuning

Starting values, their provenance, and the rules for changing them. Two constant classes (AD-15): **solver constants** are ported verbatim and never tunable; **table tunables** live in `sim/table/tuning.ts`, each with `source` and `confidence`, hot-applied from the dev panel and frozen after playtest (OQ-3). Dimensionless VPX values port directly; VPX strength values are internal units and do not.

## Reference geometry

| Quantity | Value | Confidence |
| --- | --- | --- |
| Playfield (standard body) | 20.25 × 42.00 in = 514.4 × 1066.8 mm | High |
| Pitch | 6.5° default; competition range 6.5–8.5°, 7.5–8° common; Setting bounds 6.0–8.5° | High (bounds assumed) |
| Ball diameter | 1.0625 in = 26.99 mm | High |
| Ball mass | ~80 g | Medium (VPE docs) |
| Flipper bat | 3.000 in bare / 3.125 in rubbered | Medium (VPE docs) |
| Flipper pivot holes | ½ in; centres 7 in up from the bottom edge, 6-13/16 to 7 in apart | Medium (hobbyist) |
| Rubber hardness | 45–50 Shore A | Low |
| VP units | 1 U = 0.53975 mm; ball radius 25 U | Verified |

The loader asserts `col_playfield` bounds and flipper node lengths against `TABLE.reference` — a wrong-size playfield is a load failure.

## Table tunables — starting values

| Parameter | Start | Note |
| --- | --- | --- |
| Flipper elasticity | 0.88 | |
| Elasticity falloff | 0.15 | **The primary feel knob** — lively at low speed, no pingy rebound at high speed. |
| Flipper friction | 0.8–0.9 | What makes centre shots and backhands possible. |
| Scatter angle | **0** | Every material, every era; randomness is tuned down. |
| Coil ramp-up | 2.5 | Solenoid acceleration time — enables the light tap. Source: VPE default via the brief addendum §4. |
| Flipper pulse | ~30 ms at 70 %, then 25 % hold | MPF documentation example, medium confidence — a **calibration reference**, not a parameter; the ported `FlipperMover` (strength, ramp-up, EOS torque and angle, return strength, inertia ⅓·m·r²) is the model. |
| Plunger | `plungerSpeedByHoldMs` curve | Launcher must not be bouncy. |
| Airball / hop tendency | one explicit control | Hops authored, not emergent; must not be implemented as scatter or randomness. |
| Per-object material params | `{ elasticity, elasticityFalloff, friction, scatter }` | The only four; VPX defaults 0.3 / 0.0 / 0.3 / 0.0 in a named material table; `col_` meshes reference materials by `phys_material`. |
| Slam threshold | `slamNudgesPerWindow` | Distinct from the bob's threshold. |
| Timers | authored in ms, converted to ticks at load | Ball save, grace, hurry-up, ball search, tilt spacing/settle, mode select, mouth-open lead, bonus countdown, Match reveal, initials timeout. |
| Scoring | all values in `tuning.ts` | CAP-20, CAP-34, CAP-36, CAP-39 starting values; freeze after first full playtest. |

**Flipper strength:** band coil strength by shot-distance intent rather than by resistance. VPX's era bands (~500–1000 electromechanical up to ~3200–3300 mid-90s-and-later, internal units, relative use only) mean calibrating to the Reference machine inherits the modern band.

## Solver constants — verbatim, never tunable

From `vpdb/vpx-js` `lib/physics/constants.ts` at commit `e8a6d6f` (v1.3.4, 2020-11-12), tuned for `PHYSICS_STEPTIME = 1000 µs` → `TICK_HZ = 1000`:

`PHYS_SKIN 25.0` · `PHYS_TOUCH 0.05` · `C_DISP_GAIN 0.9875` · `STATICTIME 0.005` · ball–ball restitution (hardcoded) and their peers. Changing any is a physics-version bump that re-records every golden. 480 Hz is a demonstrated browser floor (Neon Gutter) but is a solver re-tune, taken only if spike 1 fails; 1000 Hz is not load-bearing for feel, only for the constants.

## Numbers that do not exist — do not invent them

Ship marked `unverified`; change only by measurement against the Reference machine:

- steel-on-clearcoat and steel-on-rubber restitution and friction
- manufacturer coil pulse duration
- a measured flipper tip gap — the one unmeasured quantity in the drain triangle, and the geometry the whole game balances around
- a dimensioned drain zone
- any hours-per-table effort figure

Match 8 % is no longer on this list: it was chosen deliberately on 2026-08-27 as the default Setting (conventional, not sourced).

## Implementation notes carried from the research

- Semi-implicit Euler with adaptive subdivision within each step driven by collision events.
- Analytic closed-form time-of-impact over circles, points, line segments (2D, z-axis, 3D), planes, triangles and 3D polygons, with quadtree and k-d broadphase — `col_` scaffolding must reduce to this primitive set.
- Flipper as inertia ⅓·m·r² with ramped torque, quartic end-of-stroke torque fade and a return spring.
- Nudge as a damped-harmonic cabinet oscillator — ported — with the ball coupling **re-derived** as table-frame motion (the ball keeps its inertia while the cabinet moves; VPX's nudge-as-force-on-the-ball is a known open defect) and pinned by a golden replay.
- Tilt bob as an actual pendulum.
- In a time-of-impact design the stability hazard is iteration explosion, not tunnelling: forced time advancement out of collision clusters (`STATICTIME`) and a 200 ms catch-up bailout that discards simulated time.
- The playfield as one compound collision body; walls and floor with real thickness (thin planes tunnel).
- Switches as analytic zone tests against the per-tick swept segment, not physics sensors, with per-switch hysteresis and `settleTicks` by class (rollover 0, standup 8, drop target 20, bumper skirt 2, tilt bob 0).
- Detailed visual meshes non-collidable over hand-built simplified collision scaffolding; VPE budgets 500–2,000 triangles per playfield object at a single LOD.
- Feel is where the schedule goes; tunnelling is the easy part. Port; do not derive — VPX still carries open physics defects after 20 years, and Planck.js's port of Box2D took 400+ hours.
