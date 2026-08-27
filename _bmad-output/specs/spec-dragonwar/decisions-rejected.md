# Decisions: chosen and rejected

Recorded so downstream does not re-open them. Dates are when the author decided; undated rows were settled by the research, brief or spine on 2026-08-26.

## Product and rules

| Decision | Chosen | Rejected / deferred | Why |
| --- | --- | --- | --- |
| Scope | One table, complete and tuned | Platform hosting many tables; editor; plugin system | "A game, not an engine"; the field is littered with abandoned platforms. Authoring path deferred, door shut. |
| Campaign gating | Modes independent; escalation in fiction and scoring (2026-08-26) | Strict sequence; any-order-all-required | Author's call. |
| DRAGON qualifier | Six-target drop bank (2026-08-26) | Standup targets; mixed bank | Gives the bank-reset sound a home; all six down spells and resets. |
| War start | Order-free on the second condition (2026-08-26) | Spell-first-then-lock-then-start-shot; spell as sole trigger | Honours the founding sentence when the letters come last; keeps the lock mandatory. |
| Ball lock | Physical `multiball_lock`, per-player credits (2026-08-26) | Virtual lock; `ball_hold`; lock stealing; release on player change | The dragon returning your balls is the whole moment; per-player credits solve Hot seat. |
| Bash toy placement | Off-centre | Dead-centre | Dead-centre rejects to the drain and has no backhand. |
| Joust | Alternating loops | Same-loop repeats; spinner on both loops | Alternation is what a joust looks like; two spinners make the loops the same shot. |
| Hops | One explicit control | Emergent physics; non-zero scatter; zero-thickness walls | Feel parameters suppress hops; scatter 0 every era; thin planes tunnel. |
| Flashers | Coil-class with duty-cycle limits | Folded into the insert layer | Charted with solenoid drivers on real machines. |
| Extra ball | Achievement menu | Single lane | Feels authored. |
| Camera | Single fixed view (2026-08-26) | Presets; free camera | v1 scope; standard-UV lightmaps keep the option. |
| Art | Stylized at real dimensions | Photoreal; non-realistic (cel-shaded, exaggerated) | Photoreal sinks a solo project; non-realistic is a different product. |
| Inserts | Saturated functional colours | Muted earth tones | Undercuts the functional channel. |
| Backglass | DMD look | High-resolution backglass art | The DMD look removes the need. |
| v1 breadth | Minimal settings, keyboard, Chromium + Safari (2026-08-26) | Full operator menu; gamepad; all four browsers | Hobby scope. |
| Tilt default | 1 warning | Competition preset 2 | Confirmed 2026-08-27; preset deferred. |
| Reference machine | Stern *Dungeons & Dragons* (2026-08-27) | Leaving it unnamed | Feel test must be reproducible. |
| Match probability | 8 % chosen deliberately (2026-08-27) | Sourcing a primary figure | Conventional value; it is a Setting anyway. |
| Playfield geometry source | Reference dimensions alone (2026-08-27) | Sourcing a Bally template drawing | Avoids a licence check and an external dependency; tip gap and outlane widths are drawn and tuned. |
| Spikes 1 and 3 | Epic 1's first two stories (2026-08-27) | Undated pre-commit checks | They gate the browser-first premise; nothing else lands first. |
| Scoring freeze | After the first full playtest of epic 3 (2026-08-27) | Freeze at PRD time | Values are starting points until played. |

## Technology

| Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- |
| Physics | Analytic time-of-impact core ported from `vpdb/vpx-js` | Jolt, Rapier, Havok, PhysX, cannon-es, Ammo; deriving from scratch | General engines reproduce the same failure catalogue (kinematic flippers teleporting, 64 substeps, thickened colliders); deriving rediscovers twenty years of constants. |
| Physics source | vpx-js | `vpinball/vpinball` as a whole; PinMAME | vpinball is dual-licensed, unmarked files non-commercial; PinMAME non-profit-only and unneeded. |
| Renderer | Babylon.js, WebGL2 floor, WebGPU enhancement | Three.js; Unity Web; Godot 4; Unreal; Bevy | Engine-shaped with dual backend; Three ships no physics; Godot web is compatibility-only with no AudioEffects; Unreal has no web target; Bevy pre-1.0. Decision on structural grounds only — the 130-light benchmark is unverified. |
| Packaging | Browser-first, Tauri later | Native-first (research) | Click-and-play is the open-source share story; spikes 1 and 3 carry the residual risk. |
| Licence | GPL-3.0 | GPL-2.0-only | Incompatible with Apache-2.0 Babylon.js. |
| Tick | 1000 Hz verbatim | 480 Hz | Ported constants stay valid; 480 is a re-tune taken only if spike 1 fails. |
| Sim placement | Main thread, one rAF loop | Web Worker | GitHub Pages cannot serve COOP/COEP → no `SharedArrayBuffer`; a Worker means posted snapshots and an input hop. Deferred, not rejected. |
| Table definition | Typed TS module, `TABLE as const` | YAML + loader | Name unions for free; a literal elsewhere is a lint error. |
| Lighting | UV2 contract now, bake later; clustered forward on WebGL2 | Bake first; fully dynamic; camera-projected UVs | Bake-first is a sink on the critical path; fully dynamic forgoes bounce and soft shadows; camera-projected locks the camera. |
| Slam tilt | Nudge count in physics, own threshold | Host-side detector; distinct key; a Setting | Host-side is outside the replay; never the bob's threshold. |
| Hosting | GitHub Pages via Actions | Cloudflare Pages; Netlify | A static bundle needs no custom headers once the Worker is deferred. |
| Repository | Single package, lint-enforced seams | pnpm workspace | Packaging adds no boundary a lint cannot enforce. |
| Boundary lint | dependency-cruiser | typescript-eslint | TypeScript 7.0 ships no compiler API until 7.1. |
| Toolchain | Node 24 LTS | Node 22 | Node 22 enters maintenance 2026-10-24. |
| Shipped audio | `.mp3` | Ogg | Safari lacks Ogg. |
