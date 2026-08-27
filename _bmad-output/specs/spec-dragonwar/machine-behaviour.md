# Machine behaviour

Device-level detail behind the capabilities: the Dragon's device model, the Lock arbiter, Hot-seat consequences, and the machine-operations conventions a credible sim gets right. Seam names are the spine's (AD-6, AD-18, AD-19).

## The Dragon is two devices

| Device | MPF class | Role |
| --- | --- | --- |
| Dragon body | bash target | Every hit is `dragon_hit`; during the War, a Strike. Off-centre so a rejection deflects to a flipper (Lawlor's test) and the left flipper has a backhand — friction 0.8–0.9 is what makes that backhand possible. Precedents: Pulp Fiction's briefcase, Cactus Canyon's Bart, Godzilla. |
| Lock (`bd_lock`) | `multiball_lock` — balls out of play, deducted from the count; **not** `ball_hold` | Capacity 3 (two held + one staging), slots `s_lock_1..3`, eject coil `c_mouth`. Parks unconditionally into the lowest empty slot; ejects the highest filled slot one ball per pulse at the authored Mouth pose, aimed at the flippers. |

Lock credits are per player (MPF's `multiball_lock` default), backed by this one physical device. The lock is physical rather than virtual because the payoff — the dragon swallows your balls and spits them back — is the whole moment; the BOM and trough-reliability reasons real machines went virtual do not apply to a sim, and per-player tracking is solved by credits.

## Lock arbiter — what a Lock-lane entry means

The Lock arbiter in `sim/rules/ball-controller/` is the only consumer of `lock_lane_entered` and emits exactly one outcome. AD-18 names the four outcomes; the precedence below and the final "otherwise" row are the spec's reading (SPEC Assumptions, CAP-33/37).

| Condition (evaluated in this order) | Outcome | Effect |
| --- | --- | --- |
| A multiball is running (`machine.multiball !== null`) | `lock_lane_strike` | Lock disabled; in the War it is a Strike, in Quick multiball a bash hit. Ball is ejected back to play. |
| Player's credits < 2 and a Mode is lit | `lock_lane_locked` then `lock_lane_mode_start { candidates[] }` | Lock credited first; the Mode runs with the newly served ball. |
| Player's credits < 2 | `lock_lane_locked` | Credit +1; if the device is physically full of another player's balls → `lock_lane_spit` (one ball ejected, credit still counts). A new ball is served from the trough. |
| A Mode is lit | `lock_lane_mode_start { candidates[] }` | Ball stays parked during `modeSelectMs`; flipper edges move the selection; Start or either flipper confirms; then eject. |
| Otherwise | eject | Nothing to award; ball returns via the Mouth. |

Every Mouth eject is preceded by `show_dragon_mouth_open` and follows it by `mouthOpenLeadMs`. The arbiter alone pulses `c_mouth`, `c_trough_eject` and `c_autolaunch`, and alone mutates `ballsInPlay`.

## The War start, order-free

The War starts the instant both hold for the current player: DRAGON spelled and two Lock credits, whichever completes last.

- **Letters last:** the sixth drop target falls → the Mouth opens and fires the two locked balls; with the ball in play that makes three. The founding moment.
- **Lock last:** the second lock is credited → the Lock holds two balls, the plunged ball was just parked, so the Mouth fires what it holds and the trough auto-launches the difference to three.
- **Hot-seat opponent consumed the balls:** the Lock may hold fewer balls than the player's credits; the Mouth fires what it holds and the trough tops up.
- During the War the Lock is disabled (a Lock-lane shot is a Strike); at War end letters and credits reset; the Jackpot seed carries.

## Hot seat

Per-player under `players[i]`: score, letters, Lock credits, modes played, tilt warnings, bonus by category and multiplier, extra balls, lit and completed lanes, Jackpot seed and Wars started. Machine-scoped: device slots, `ballsInPlay`, `hardwareEnabled`, `ballSave`, `tilt`, `multiball`. `modes[]` is empty between balls, so no Mode runs into the next player's ball.

The machine carries 4 balls: two can sit in the Lock for player 1 while player 2 runs Quick multiball (two in play) — without the fourth ball Quick multiball would silently starve. A 4-ball finale would raise the count to five.

## Tilt

- Warnings per player, shown on the Backglass, up to the Settings count (default 1; the Competition preset sets 2).
- The bob is a real pendulum that keeps swinging: physics closes `s_tilt_bob` as edges; rules apply `tiltWarningSpacingMs` (no second warning inside the window) and `tiltSettleMs`. The bob is never reset by command — physical decay plus the settle time is the settle.
- On Tilt: flippers, slings, pops and autolaunch disabled together until every ball drains; bonus forfeited; score kept; `ball_will_start` resets the tilt state.
- Slam tilt is a different sensor: a tick-windowed nudge count in physics with threshold `slamNudgesPerWindow` — never the bob's threshold — closing `s_slam_tilt`; ends all games and returns to Attract.

## Ball save

- One machine device, `machine.ballSave`, owned by the ball controller; `ball_save_enabled` and `ball_save_timer_started` are distinct events — the timer starts on `ball_launched` (the opening of `s_shooter_lane`), not on enable.
- Hurry-up state measured backwards from expiry; Grace period past displayed expiry (default 2 s) during which drains still save; saved balls auto-launched via `c_autolaunch`.
- Modes arm their own windows (`arm({ ticks, source })` / `disarm(source)`); sources stack, the longest live window wins; Tilt disarms all.

## Ball search

- Triggers after 15 s with no switch closure during play.
- Escalating protocol of tick-timed coil pulses in each device's `ballSearchOrder`; final stage issues `RecoverCommand`, the one command that lets physics despawn every ball outside a device; physics returns the recovered count and the controller emits `ball_missing { count }` and serves a new ball.
- Suppression: never release locked balls while a Mode timer is running.
- Device failure events (`eject_failed`, `ball_missing`, `broken`, `device_overflow`) exist in the vocabulary and rules tolerate them even if the sim never emits some.

## Adjustments

Layered store: table defaults → install preset (deferred; a preset may lock keys — the slot a Competition mode would use) → player overrides. v1 exposes only Pitch, Tilt warning count, balls per game, Match probability (sim adjustments, next game) plus volume and key bindings (host settings, immediate). Match awards a free game; v1 is free play, so the award is display-only until a credit concept is wanted.

## Shot map

| Shot | Job | Notes |
| --- | --- | --- |
| Left Loop / Right Loop | The Joust | Alternate them — same Loop twice breaks the Charge. Exits feed straight toward the flippers. |
| Spinner | On the Left Loop only | Makes the two orbits different shots: the loud loop and the quiet return. |
| Ramp | Qualifier | Lights Modes; returns to an inlane; a miss returns to a flipper. Hurry-up collect. |
| DRAGON bank | Spell the letters | Six drop targets; qualifies the War; full bank in the War = Strikes. |
| Dragon body | Bash target | Right flipper straight, left flipper backhand; Strikes in the War. |
| Lock lane (between the legs) | Physical lock / mode start | Precise shot locks; slightly-off hits the body. Two shots in one lane, separated by precision. |
| Mouth | Multiball eject | VUK fires the locked balls out as dragon fire — the balls you locked come back at you. |
| Top lanes (3) | Skill shot; Bonus multiplier | Lit lane rotates per plunge; lane change on the flipper buttons. |
| Inlanes / outlanes | Lane change set; drains | Outlanes drain; guides end at rubber posts, never bare metal. |
| Right Loop | Extra ball collect | When lit (purple). |

Loops and the Ramp are flow shots; the bank and the Dragon are stop-and-go. Every shot passes Lawlor's test. The geometry itself (tip gap, outlane widths, post positions, loop entries, ramp height, Dragon position) is OQ-6 — epic 2's first design problem, owned by the Blender source.
