# Digest: Simulation architecture & physics fidelity (round 1)

Scope note: the strongest evidence available this run is the **Visual Pinball X (VPX) C++ source on GitHub master**, fetched directly. That is a primary, readable, complete implementation of a shipping realistic-but-playable pinball sim, and it answers Q1/Q2/Q3 concretely. Commercial sims (Q4) are **documented thinly to not at all** at the engineering level — that absence is itself a finding. Q5 is answered mostly from table-author tuning practice, not from developer postmortems.

---

## Q1 — How VPX models ball physics

**VPX runs a fixed 1000 Hz physics timestep, defined as `#define PHYSICS_STEPTIME 1000` microseconds, with a legacy "VP Time unit" of 10 ms (`DEFAULT_STEPTIME 10000`) and a scaling constant `PHYS_FACTOR = PHYSICS_STEPTIME_S / DEFAULT_STEPTIME_S` (= 0.1) applied to all per-step force integration.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/physconst.h | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: numeric-parameter

**Ball integration is plain semi-implicit Euler in a custom engine — not a third-party rigid-body library: velocity is advanced by `m_d.m_vel += (float)PHYS_FACTOR * GetGravity()` in `UpdateVelocities()`, and position by `const Vertex3Ds ds = dtime * m_d.m_vel; m_d.m_pos += ds` in `UpdateDisplacements()`.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/hitball.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: architecture-fact

**VPX is full 3D for the ball, and it does model ball spin as real angular momentum: the ball carries `m_angularmomentum`, has an `Inertia()`, and computes contact-point surface velocity as `m_d.m_vel + CrossProduct(m_angularmomentum / Inertia(), surfP)`; a 3x3 `m_orientation` matrix is integrated and re-orthonormalized each step.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/hitball.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: architecture-fact

**Ball friction is a two-regime Coulomb model: `ApplyFriction()` switches to static friction when `slipspeed < C_PRECISION` (0.01) and otherwise uses dynamic friction along `slipDir = slip / slipspeed`, with the impulse clamped by `maxFric = fricCoeff * m_mass * -GetGravity().Dot(hitnormal)`.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/hitball.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: architecture-fact

**Collision detection is continuous and analytic, not discrete sampling: hit tests solve for time-of-impact in closed form — `HitCircle::HitTestBasicRadius` calls `SolveQuadraticEq(a, 2.0f*b, bcddsq - targetRadius*targetRadius, time1, time2)`, and `LineSeg::HitTestBasic` computes `hittime = bnd / -bnv` from normal distance over normal velocity. `HitPoint` and `HitLineZ` likewise solve quadratics for the earliest non-negative impact time inside the frame.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/collide.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: architecture-fact

**Flippers are true rigid bodies driven by torque, not scripted kinematic animations: `m_inertia = (1/3) * mass * flipperradius^2` (rod about its end), torque integrates as `m_angularMomentum += (float)PHYS_FACTOR * torque;` then `m_angleSpeed = m_angularMomentum / m_inertia;`, and hitting the end stop bounces via `m_angularMomentum *= -0.3f;`.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/hitflipper.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: architecture-fact

**The flipper coil is modeled as a ramped solenoid with an end-of-stroke hold: desired torque is `GetStrength()` while pressed and `-GetReturnRatio() * GetStrength()` on release, ramped by `m_curTorque = std::min(m_curTorque + torqueRampupSpeed * PHYS_FACTOR, desiredTorque)` (ramp clamped at `1e6f` for instantaneous), and EOS torque fades with a quartic `lerp = sqrf(sqrf(fabsf(m_angleCur - m_angleEnd) / EOS_angle))` controlled by `m_torqueDamping` / `m_torqueDampingAngle`.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/hitflipper.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: architecture-fact

**Every collidable in VPX exposes exactly four physics tunables on the base `HitObject`, with these defaults: `float m_elasticity = 0.3f; float m_elasticityFalloff = 0.f; float m_friction = 0.3f; float m_scatter = 0.f; // in radians` (plus `m_threshold` for event firing, not physics).**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/collide.h | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: numeric-parameter

**Table-global physics defaults in VPX are: `DEFAULT_TABLE_GRAVITY 0.97f`, `GRAVITYCONST 1.81751f` (Earth gravity in VP units U/T²), `DEFAULT_TABLE_CONTACTFRICTION 0.075f`, `DEFAULT_TABLE_SCATTERANGLE 0.5f`, `DEFAULT_TABLE_ELASTICITY 0.25f`, `DEFAULT_TABLE_ELASTICITY_FALLOFF 0.f`, `DEFAULT_BALL_SIZE 25.f` (VP units, diameter).**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/physconst.h | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: numeric-parameter

**The official Visual Pinball Engine docs publish era-calibrated flipper values that a new sim can use as a sanity baseline: Strength 500–1000 (EM), 1400–1600 (late 70s–mid 80s), 2000–2600 (mid 80s–early 90s), 3200–3300 (mid 90s+); Mass 1, Elasticity 0.88, Elasticity Falloff 0.15, Friction 0.8–0.9, Coil Ramp Up 2.5, Scatter Angle 0 across all eras; Return Strength 0.11 / 0.09 / 0.07 / 0.055 and EOS Torque 0.3 / 0.3 / 0.275 / 0.275 with EOS Torque Angle 4 / 4 / 6 / 6.**
- source: https://docs.visualpinball.org/creators-guide/manual/mechanisms/flippers.html | publisher: Visual Pinball Engine documentation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: numeric-parameter

**The same doc states the design intent behind two of those parameters: Return Strength lower values "slow returns and assist light-tap techniques," and Coil Ramp Up is "time the solenoid needs to reach its full acceleration," explicitly enabling realistic light-tap mechanics; Friction is called "very important for enabling center shots on the playfield with a moving ball, as well as backhands."**
- source: https://docs.visualpinball.org/creators-guide/manual/mechanisms/flippers.html | publisher: Visual Pinball Engine documentation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: design-tradeoff

---

## Q2 — The known "hard problem" list

**Anti-tunneling in VPX is structural, not a patch: because collision is time-of-impact based, the engine advances only to the earliest hit (`if (htz <= hittime) hittime = htz;`), calls `UpdateDisplacements(hittime)`, resolves, and repeats within the same 1 ms step — so a fast ball cannot step over thin geometry. Colliders' bounding boxes are expanded for maximum per-step travel via `CalcHitBBox()`, and retroactive hits are rejected with `if (htz < 0.f) pball->m_coll.m_obj = nullptr;`.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/PhysicsEngine.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: architecture-fact

**The real stability hazard in this design is not tunneling but iteration explosion / stall, and VPX solves it with a deliberate accuracy sacrifice: when `hittime < STATICTIME` (0.02) it decrements a counter initialized to `STATICCNTS` (10) and, once exhausted, forces `hittime = STATICTIME`, deliberately over-advancing time to break out of collision clusters and embedded-ball situations.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/PhysicsEngine.cpp + physconst.h | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: design-tradeoff

**VPX has a hard real-time bailout that abandons pending physics cycles rather than stalling the frame: `if ((cur_time_usec - initial_time_usec > 200000) || (m_physicsMaxLoops != 0 && m_phys_iterations > m_physicsMaxLoops)) { m_curPhysicsFrameTime = initial_time_usec; break; }` — i.e. after 200 ms of catch-up, simulated time is snapped forward and the deficit discarded.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/PhysicsEngine.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: design-tradeoff

**Multiball / stacked-contact stability is handled by separating *contacts* from *collisions* and by randomizing solver order to remove directional bias: contacts are gathered when `m_recordContacts = true` and then resolved in forward or reverse order chosen by `if (rand_mt_01() < 0.5f)`; the broadphase query order between the static and dynamic trees is randomized the same way.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/PhysicsEngine.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: architecture-fact

**The collision/contact split is threshold-driven, with named constants: `C_LOWNORMVEL 0.0001f` ("Low Normal speed collision handled as contact"), `C_CONTACTVEL 0.099f`, `PHYS_TOUCH 0.05` ("Layer outside object which increases it's size"), `PHYS_SKIN 25.0` ("Physical Skin ... positive contact layer"), `VELOCITY_EPSILON 0.05f` ("threshold for zero velocity"), `C_PRECISION 0.01f`, `C_TOL_RADIUS 0.005f`, `C_INTERATIONS 20` (flipper precision cycles).**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/physconst.h | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: numeric-parameter

**Deep penetration ("embedded ball") is an acknowledged failure mode with dedicated code: the engine counts `if (pball->m_coll.m_hitdistance < -0.0875f) ++c_embedcnts;`, and the ball applies a fixed escape impulse using `dot = -C_EMBEDSHOT` when embedded.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/PhysicsEngine.cpp + hitball.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: known-problem

**Scatter (deliberate randomization of bounce direction) is speed-dependent, not uniform — the ball applies `scatter *= (1.0f - scatter*scatter)*2.59808f * scatter_angle`, a shaped random perturbation that grows at higher velocity; flippers apply their own `m_scatter` (radians) perturbation to the collision normal.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/hitball.cpp + hitflipper.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: design-tradeoff

**Ball-on-ball restitution is hardcoded, not tunable: `const float impulse = -(float)(1.0 + 0.8) * dot / (myInvMass + pballInvMass)` — a fixed 0.8 coefficient of restitution for ball-ball collisions, unlike ball-object collisions which use the object's `m_elasticity` with falloff via `ElasticityWithFalloff(elasticity, falloff, vel)`.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/hitball.cpp + collide.h | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: numeric-parameter

**Nudge and tilt are a first-class subsystem in current VPX, not a scripted hack — `src/physics/cabinet/` contains `NudgeHandler`, `NudgeIntentHandler`, `CabinetNudgeSensor`, `CabinetPhysics`, `DampedHarmonicOscillator.h`, `MotionKalmanAxis.h`, `MotionGainCalibratorAxis.h`, `KeyboardNudge`, `GamepadNudge`, and `PlumbHandler` — i.e. a damped-harmonic cabinet model plus Kalman filtering of real accelerometer input.**
- source: https://api.github.com/repos/vpinball/vpinball/contents/src/physics/cabinet | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: architecture-fact

**Nudge enters the ball's equations of motion as a fictitious force corrected for playfield slope: `m_d.m_vel.x -= (float)PHYS_FACTOR * MS2TOVPUVPT2(g_pplayer->m_pininput.m_nudgeHandler->GetCabinetAcceleration().x)`.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/hitball.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: architecture-fact

**The tilt bob is simulated as an actual pendulum, self-described in the source as "a simplified pendulum with 3 (simplified) forces: gravity, nudge and pole, and some velocity dampening"; mass cancels out (`I = m L^2 => alpha = tau / L^2`), gravity is hardcoded `-9.80665f`, damping is nonlinear via `m_dampingCoef0`/`m_dampingCoef1`, the tilt threshold is `ANGTORAD(settings.GetPlayer_PlumbThresholdAngle())`, and edge impacts reflect velocity damped by a magic `0.8f`.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/cabinet/PlumbHandler.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: architecture-fact

**"Ball stuck" remains an open, current-version class of bug rather than a solved one: vpinball issue #3658 "BGFX Win64 - Space Cadet Galaxy Edition - Stuck Ball" was created 2026-07-13 and is open, and #555 "Kicker or Ramp stuck ball on VPX 10.8 Standalone (Mac ARM64)" (2023-06-07) is also still open; earlier instances (#1365, 2024-01-20; #1158, 2023-11-18) are closed.**
- source: https://github.com/vpinball/vpinball/issues/3658 | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: 2026-07 | accessed: 2026-08-26 | confidence: medium | class: known-problem

---

## Q3 — Physics tick rate and render decoupling

**1000 Hz is the concrete, source-verified answer for VPX (`PHYSICS_STEPTIME 1000` µs). The loop is a fixed-timestep catch-up loop: `while (m_nextPhysicsFrameTime < initial_time_usec)` calling `PhysicsSimulateCycle(physics_diff_time)`, then `m_curPhysicsFrameTime = m_nextPhysicsFrameTime; m_nextPhysicsFrameTime += PHYSICS_STEPTIME;`.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/PhysicsEngine.cpp + physconst.h | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: numeric-parameter

**Within each 1 ms step the simulation is further subdivided adaptively by collision events (`while (dtime > 0.f)`), so the effective integration granularity during contact is far finer than 1 ms — 1000 Hz is the *outer* rate, not the collision resolution.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/PhysicsEngine.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: architecture-fact

**The 100 Hz → 1000 Hz change is historical and deliberate: a VP developer states on VPForums that the physics framerate was raised from 100 Hz to 1000 Hz and made fixed-timestep, removing FPS dependence — which is why `DEFAULT_STEPTIME 10000` (10 ms = the old 100 Hz) survives in the source only as a unit-scaling legacy.**
- source: https://www.vpforums.org/index.php?showtopic=27416 | publisher: VPForums (developer forum post) | pub_date: unknown (PhysMOD era, pre-VPX) | accessed: 2026-08-26 | confidence: medium | class: architecture-fact

**VPX's stated frame-pacing design is to "run the input & physics simulation continuously in real time instead of only once per frame," to lower input latency and allow vsync without stutter or aiming artifacts; script timers with interval `-1` fire after physics and animation but before rendering, defining the loop order physics → timers/animation → render.**
- source: https://github.com/vpinball/vpinball/blob/master/docs/Changelog.txt | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: architecture-fact

---

## Q4 — What commercial sims say about their physics

**The honest finding is that none of the major commercial pinball sims publish engineering-level physics detail. No physics tick rate, substep count, solver type, or collision strategy could be found this run for Pinball FX / Zen Studios, Pro Pinball / Barnstorm, or Stern Pinball Arcade / FarSight. No GDC talk or engineering postmortem on pinball physics surfaced.**
- source: (negative result across searches) | publisher: n/a | pub_date: n/a | accessed: 2026-08-26 | confidence: high | class: known-problem

**Zen Studios ships two named physics models and treats the split as a product feature: the Pinball FX physics toggle offers "Normal" (described as the FX3 legacy model) and "Challenging" (the newest model, which "allows for more advanced flipper skills").**
- source: https://steamcommunity.com/app/2328760/discussions/0/4032476115588051039/ | publisher: Steam Community (Pinball FX, pinned dev/community explanation) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: design-tradeoff

**Pinball FX is documented as offering "realistic" physics with a more forgiving "normal" option on newer tables, with the Switch version using a hybrid of physics simulations and maintaining separate leaderboards per physics setting.**
- source: https://en.wikipedia.org/wiki/Pinball_FX_(2023_video_game) | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: design-tradeoff

**Zen's own framing of the engine move is at marketing altitude only: marketing manager Akos Györkei says they used their own engine "for a long time" but "needed to move on to Unreal 4" to get "upgraded lighting, upgraded physics, new features and a long roadmap."**
- source: https://www.gamingnexus.com/Article/11837/Kickback-Activated---Zen-Studios-talks-Pinball-FX | publisher: GamingNexus | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: design-tradeoff

**FarSight (The Pinball Arcade) has publicly acknowledged that platform CPU budget forces physics simplification — a FarSight-affiliated commenter states that "everything is influenced by the target platform" and that without enough CPU power, especially on phones, they "can't do the same type of physics calculation to get the same accuracy and gameplay."**
- source: https://steamcommunity.com/app/564010/discussions/0/1727575977598006022/ | publisher: Steam Community (Pinball FX2 VR / FarSight discussion) | pub_date: unknown | accessed: 2026-08-26 | confidence: low-medium | class: design-tradeoff

**FarSight also indicated that fixing a widely criticized flipper-physics issue was "doable, but it requires a pretty big overhaul of the engine" — evidence that flipper behavior is structurally baked into a pinball engine and is not a tuning-constant change.**
- source: https://www.vpforums.org/index.php?showtopic=16705&page=14 | publisher: VPForums (relayed developer statement) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: design-tradeoff

**UNVERIFIED: Pro Pinball / Timeshock! Ultra Edition's "true physics" positioning is widely repeated but I found no primary Barnstorm Games source this run describing timestep, solver, or determinism guarantees. Treat any claim about Pro Pinball's internals as belief, not evidence.**
- source: (no primary source found) | publisher: n/a | pub_date: n/a | accessed: 2026-08-26 | confidence: low | class: known-problem

---

## Q5 — The realism-vs-playability tradeoff

**VPX's own defaults deviate from "pure physics" in at least four documented places, each a playability concession: (1) forced time advancement via `STATICCNTS`/`STATICTIME` when collisions cluster; (2) the 200 ms catch-up bailout that discards simulated time; (3) a hardcoded 0.8 ball-ball restitution rather than a material property; (4) `m_angularMomentum *= -0.3f` as a flipper end-stop bounce rather than a modeled stop.**
- source: https://raw.githubusercontent.com/vpinball/vpinball/master/src/physics/PhysicsEngine.cpp + hitball.cpp + hitflipper.cpp | publisher: Visual Pinball (vpinball/vpinball, GitHub) | pub_date: unknown (master branch) | accessed: 2026-08-26 | confidence: high | class: design-tradeoff

**Randomness is a knob turned *down* for playability by serious tuners, not up: the official VPE flipper table recommends Scatter Angle = 0 for every era, and a widely used community global physics set (published on VPUniverse, dated 2021-10-29) sets Playfield Scatter to 0 alongside Gravity Constant 1.55, Friction 0.0025, Elasticity 0.25, Elasticity Falloff 0 — i.e. competitive tuning prefers determinism over "natural" variability.**
- source: https://vpuniverse.com/files/file/7799-my-global-physics-settings/ | publisher: VPUniverse | pub_date: 2021-10 | accessed: 2026-08-26 | confidence: medium | class: design-tradeoff

**Elasticity falloff is the specific mechanism used to keep a table lively at low speed while preventing "pingy" high-speed rebounds and airballs — flippers ship at Elasticity 0.88 with Falloff 0.15, and the VPE docs define falloff as reducing elasticity with impact velocity (1.0 = elasticity halved at 1 m/s).**
- source: https://docs.visualpinball.org/creators-guide/manual/mechanisms/flippers.html | publisher: Visual Pinball Engine documentation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: design-tradeoff

**"Floaty" in the VPX community is a specific, diagnosable complaint — slow roll, long hang time, easy ramps, sluggish flipper feel — and the community's first-line fixes are raising table Slope / Difficulty Slope (typical values "hover around 6", kept equal to each other) and lowering Playfield Friction; the standard warning is that raising friction to slow a fast table is what *causes* floatiness.**
- source: https://www.reddit.com/r/virtualpinball/comments/1h9pmlp/how_to_change_ball_speed_in_vpx/ | publisher: Reddit r/virtualpinball | pub_date: 2024-12 | accessed: 2026-08-26 | confidence: medium | class: design-tradeoff

**"Too fast / pingy" is the mirror complaint — hyper-fast rebounds, wild lateral movement, balls impossible to trap — and the community fix order is: reduce Playfield Elasticity in ~0.01 increments (e.g. 0.25 → 0.23), raise Elasticity Falloff on flippers/slings, raise friction slightly, reduce flipper Strength toward era-appropriate ranges, and drive Scatter toward 0.**
- source: https://www.reddit.com/r/virtualpinball/comments/10z1fgo/settings_to_tweak_in_vpx_if_ball_feels_a_bit/ | publisher: Reddit r/virtualpinball | pub_date: 2023-02 | accessed: 2026-08-26 | confidence: medium | class: design-tradeoff

**A named, dated community tuning corpus exists and is specifically about making a raised flipper behave for trapping: "JP's Arcade Physics v3.0 (2nd edition)" is dated 2025-10-05 and explicitly targets reducing ball rebound off a raised flipper; "JP's VPX7 Physics" is dated 2025-06-26.**
- source: https://www.scribd.com/document/639661430/JP-s-Arcade-Physics-v3-0-2nd-edition | publisher: Scribd (community-authored VPX physics guide, author "JP") | pub_date: 2025-10 | accessed: 2026-08-26 | confidence: low-medium | class: design-tradeoff

---

## Q6 — Open-source implementations worth studying

**vpinball/vpinball — the reference implementation. Custom C++ engine, 1000 Hz fixed step, analytic swept-primitive CCD, quadtree (static) + kd-tree (dynamic) broadphase, full flipper/plunger/spinner/nudge/tilt models. License reported as GPL-3.0-or-later with MAME-style non-commercial constraints on emulation-derived parts.**
- source: https://github.com/vpinball/vpinball | publisher: Visual Pinball (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: high (code), medium (license detail) | class: repo

**freezy/VisualPinball.Engine (VPE) — a port of Visual Pinball's physics into Unity, with the documentation site docs.visualpinball.org that carries the best published parameter guidance found this run. Relicensed from GPL-2.0 to GPL-3.0.**
- source: https://github.com/freezy/VisualPinball.Engine | publisher: freezy (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: repo

**vpdb/vpx-js — a browser/JavaScript implementation that states it uses "the same physics code than Visual Pinball," with the physics loop in its `Player` class; useful as a readable, hackable transcription of the VPX algorithm. Licensed GPL-2.0.**
- source: https://github.com/vpdb/vpx-js | publisher: vpdb (GitHub) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: repo

**missionpinball/mpf (Mission Pinball Framework) — the RULES layer, not physics: game logic, modes, scoring, hardware drivers for real machines. Code is MIT-licensed and docs are CC BY 4.0, making it the only permissively licensed piece in this stack.**
- source: https://missionpinball.org/latest/about/license/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: repo

**vpinball/pinmame + libpinmame — real ROM emulation for the game rules of actual machines; MAME-derived and therefore carrying MAME-style non-commercial conditions alongside GPL terms. This is the licensing landmine for any commercial project.**
- source: https://en.wikipedia.org/wiki/Visual_Pinball | publisher: Wikipedia | pub_date: unknown | accessed: 2026-08-26 | confidence: low-medium | class: repo

**LICENSING CAVEAT — the whole VPX-derived family is GPL copyleft. Every physics implementation worth reading (vpinball, VPE, vpx-js) is GPL-2.0 or GPL-3.0. If the new sim is to be commercial and closed-source, these repos are study material and algorithm references, not code to copy. MPF (MIT) is the only piece that can be linked freely, and it covers rules, not physics.**
- source: https://github.com/vpdb/vpx-js + https://github.com/freezy/VisualPinball.Engine + https://missionpinball.org/latest/about/license/ | publisher: multiple (GitHub / MPF) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: repo

---

## Leads worth chasing

- `src/physics/collideex.cpp` and `collideex.h` — not fetched this run. Likely holds bumpers, slingshots, kickers, spinners, drop targets, gates: the mechanisms with the most gameplay-feel-critical hand-tuned behavior.
- `src/physics/cabinet/DampedHarmonicOscillator.h` and `NudgeIntentHandler.cpp` — the actual cabinet nudge model. `MotionKalmanAxis.h` suggests real-accelerometer filtering worth reading before designing a nudge input path.
- `src/physics/AsyncDynamicQuadTree.cpp` — suggests a threaded/async broadphase rebuild; worth understanding for multiball scaling.
- Exact body of `ElasticityWithFalloff(elasticity, falloff, vel)` in `collide.h` — the fetch returned only the signature. This one function encodes the single most important feel knob.
- `docs/Changelog.txt` in vpinball — a dated, primary record of physics changes; would let claims be version-pinned (VPX 10.8.x era) rather than "master branch, unknown date".
- VPX docs site table-level physics page — WebSearch showed a Materials page defining "Scatter — Adds a random factor to the collision angle" but the direct physics-settings URL 404'd. The right URL exists somewhere under docs.visualpinball.org/creators-guide/editor/.
- `hitplunger.cpp` — plunger modeling was not examined at all.
- Whether VPX interpolates ball position between physics steps for rendering, or simply samples latest state. Not established this run.

## Looked for but could not find

- **Any engineering-level physics documentation from a commercial pinball sim.** No GDC talk, no postmortem, no dev blog with a tick rate or solver description from Zen Studios, Barnstorm (Pro Pinball), or FarSight. The strongest commercial statements found are marketing-altitude ("upgraded physics") or forum-relayed constraints ("can't do the same type of physics calculation" on phones).
- **Any academic paper on rigid-body pinball simulation.** Nothing surfaced.
- **A primary Barnstorm Games source on Pro Pinball's physics.** The "true physics" claim is repeated widely; I could not trace it to a technical statement by the developer.
- **A confirmed statement that VPX does or does not tunnel in current versions.** Anti-tunneling is architecturally sound (TOI-based), and open issues are about *stuck* balls (over-constraint), not pass-through — but I found no authoritative statement either way, and one Perplexity answer asserting tunneling was a known VPX problem returned **zero citations**, so it is excluded from the findings above.
- **The render-side interpolation scheme in VPX.** The frame-pacing intent is documented; the interpolation (if any) is not.
- **Direct verification of repo LICENSE files.** License claims above come from an aggregator citing the repos; the LICENSE files themselves were not fetched.
