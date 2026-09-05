---
title: 'Story 2.3: Drop targets, the spinner and the Lock in physics'
type: 'feature' # feature | bugfix | refactor | chore
created: '2026-09-05'
status: 'ready-for-dev' # draft | ready-for-dev | in-progress | in-review | done | blocked
baseline_revision: 'ebc24676ae177a1466ffa88db51eb0acca7d2601'
baseline_commit: 'ebc24676ae177a1466ffa88db51eb0acca7d2601'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-slingshots-and-pop-bumpers-as-hardware-rules.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1d-device-behaviour-and-guide-terminations.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      DW-134's stated failure is closed by Story 2.1d, but a narrower residual of the
      same semantic claim is live: an under-powered but ON-AXIS Lock shot closes
      s_lock_lane without ever capturing, so lock_lane_entered still does not imply a
      lock.
    evidence: |-
      Measured at plan time on the committed document (release (x, 440), dirDeg 0,
      4000 ticks): at x = 165/170/175 the ball enters sw_lock_lane (y 480-540) at
      350-550 mm/s, stalls short of sw_lock_1's 544 mm face and rolls back out with no
      capture; from 600 mm/s up it captures. x = 158 and x = 182 never enter at all.
      The capture threshold is between 550 and 600 mm/s at the corridor centreline.
      DW-134's own note offers two options and this evidence selects the second: the
      AD-18 Lock arbiter must tolerate a non-shot entry. A geometry change here would
      undo the wedge fix col_dragon_leg_l's bevel reversal exists for.
    location: >-
      src/sim/physics/devices.ts:520 (entry test); AD-18 Lock arbiter, Epic 3
    severity: med
  - summary: >-
      The four-ball boot-occupancy sum throw (devices.ts:299-307) structurally shadows
      every single-field registry mutation of startsFullAtBoot, so the behavioural
      deviceSlots assertion at test/lock-device-behaviour.test.ts:99 cannot be
      falsified by one.
    evidence: |-
      Traced and reproduced at plan time: with bd_lock.startsFullAtBoot = true the sum
      becomes 7 and createDeviceMechanics() throws at the createMachine() line, so
      deviceSlots is never read. Confirmed empirically -- createMachine() threw and
      deviceSlots.bd_lock was never observed. Only a sum-preserving mutation (or a
      direct pin on the pre-throw derivation) can move :99. This is the general shape
      behind DW-155's first half and it will recur for every future ball device.
    location: >-
      src/sim/physics/devices.ts:299-307; test/lock-device-behaviour.test.ts:96-101
    severity: low
---

<intent-contract>

## Intent

**Problem:** The DRAGON bank, the spinner and the Lock are drawn, wired and reachable, but only the
Lock does anything. The six `col_dragon_*` targets are ordinary collidable walls that never fall;
`s_spinner` closes once per zone crossing because a ball passed through, with no rotation, no decay
and no per-revolution count behind it (FR-26 awards per rotation, so the switch as it stands cannot
carry the award); and the Lock parks and ejects correctly but its own gates cannot tell a real
capture from a switch make, its over-capacity path emits one `device_overflow` per tick of zone
contact rather than one per rejected entry, and nothing drives a fourth ball into it. Until this
story lands, Story 2.4 has no letters to count, no revolutions to award and no trustworthy
capacity signal.

**Approach:** Add two authored physics device modules -- a drop-target bank over the six existing
`s_dragon_*` switches and the existing `c_dragon_bank_reset` coil, and a pass-through spinner
driven off the existing `sw_spinner` zone crossing (AD-6 as amended 2026-09-03) -- each owning its
own switches end to end in the shape `devices.ts` already uses for parking-device slot switches, so
a latched drop and a per-revolution closure each have exactly one source. Then finish the Lock:
make its own gates read the capture rather than infer it, emit one overflow per rejected entry, and
fill `MechanismsSnapshot.dropTargets` / `.spinner`, which the contracts have reserved empty since
Epic 1. Four ledger entries ride along, including `DW-160`'s provenance correction, which is nearly
free because this story re-records the golden headers anyway.

## Boundaries & Constraints

**Always:**

- **The architecture spine governs.** Governing ids are recorded under `## Design Notes`; AD-6 is
  primary and both its amendments (2026-09-03 spinner, 2026-09-04 boot occupancy) are binding.
- **One source per switch.** A switch this story's modules own is removed from
  `createSwitchTracker`'s subject set by a **derivation from `TABLE`**, never a name literal --
  the same shape as `parkingDeviceOwnedSwitches()` (`src/sim/physics/switches.ts:51-61`). Two
  emitters for one switch is an AD-2 violation, not a merge.
- **A subject set is derived, never hand-typed** (`DW-149`): the six targets come from a `TABLE`
  registry key set, the spinner's zone from `switchZones.filter(...)` on its declared switch, and
  every anti-vacuity floor from the set it guards -- never from a second literal list and never
  from the length of the array it guards.
- **Frames.** `toPhysics()` negates y. Any assertion that mixes a physics-frame quantity with a
  table-frame quantity is this epic's eleventh vacuity repeated. Every comparison stays inside one
  frame and asserts **per axis**, so neither axis can mask the other.
- **Non-ASCII in source is authored as an escape sequence, never a literal byte** (Rule 14).
- **New authored physics files carry the GPL-3.0 header and all four registration duties** (see
  `## Design Notes`, "Provenance"). The `ATTRIBUTIONS.md` row lands before the file if anything is
  ported.
- **`pnpm check:ad7` stays red.** It is `DW-70`, Story 2.5's deliverable, and the only intended-red
  check. A green run is a regression to revert and report.
- **`check:corridor` and `check:reachability` stay green, behaviourally.** Never edit an
  `unreachable` verdict to reach green; re-measure both the case counts and the release count
  rather than carrying either forward.
- **A golden re-record honours the author's grant of 2026-09-02 (all five):** each traced correct
  *before* recording, each still asserting its own subject, the reasoning appended to its own
  `notes`. No threshold lowered, no `PARITY_INERT` entry added, no `transitions` body deleted, no
  scenario assertion removed, the `DW-70` and `deviceSlots` literals retained in every `notes`.

**Block If:**

- **A golden's recorded trajectory genuinely moves and the new trace cannot be shown correct**, or
  would need a threshold moved to pass. That is a HALT, not a re-record.
- **Any part of the drop-target or spinner model turns out to be ported or adapted** from
  `vpdb/vpx-js` or `vpinball/vpinball` and its licence cannot be established at source. HALT --
  never a judgement call. (`vpinball/vpinball` files are usable only if the first line reads
  `// license:GPLv3+`.)
- **Making a target non-collidable mid-flight cannot be done without rebuilding the statics tree.**
  `finalizeStatics()` throws on a second call, so if `HitObject.setEnabled()` proves insufficient
  there is no second mechanism in the ported architecture and the design must be re-decided.
- **The measured pop-kick sweep shows no safe window wide enough to ship**, i.e. the DW-148 clear
  band is narrower than the sweep's own resolution. That is a product question for the lead, not a
  value to pick.
- **`pnpm test` cannot be returned to 0 failures** without deleting, skipping or weakening an
  existing test.

**Never:**

- **Never touch `DW-70`.** Do not fix `check:ad7`, do not touch
  `src/sim/loop/index.ts:341-344`'s `deviceSlots` overwrite, and do not add a second field through
  that same seam -- deepening the AD-7 violation to carry spinner or drop-target state is
  explicitly out of scope.
- **Never change geometry.** No `.blend` edit, no re-export, no coordinate movement in
  `public/assets/dragonwar.collision.json`. Every deliverable here is runtime state over geometry
  that already ships. `assetHash` must not move.
- **Never implement the rules-side layer.** `bank_target_down { letter }`, `bank_completed`,
  `spinner_spin { count }`, `lock_lane_entered`, `TABLE.shots` and the pulsing of
  `c_dragon_bank_reset` on `ball_will_start` / `bank_completed` are all Story 2.4's (AD-19).
  This story emits switch edges and contacts; it does not consume them in rules.
- **Never move a solver constant.** `PHYSICS_VERSION` does not change; `PHYS_SKIN` is not tunable.
- **Never write the Blender path into a tracked file** (`DW-46` / `DW-131`).
- **Never write to `deferred-work.md`.** Findings go in this spec's frontmatter `deferred:` for the
  lead's harvest (Rule 15 (a)).
- Never plan the Lock arbiter, mode select or `show_dragon_mouth_open` (AD-18, Epic 3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Target struck, drops | Bank up; ball's swept path genuinely contacts `col_dragon_g` | `s_dragon_g` emits one `closed: true` and **latches**; `col_dragon_g`'s hit objects go `isEnabled = false`; one `ContactEvent { kind: 'drop_target_down' }`; `mechanisms.dropTargets['s_dragon_g'] === true` | No error expected |
| Neighbour grazed, own target NOT struck (**`DW-122`-adjacent, the recorded false positive**) | Ball released at `x = 228.9` on the bank column: closes `sw_dragon_d` through its +2 mm x margin while measurably striking `col_dragon_r` (`test/util/shot-cases.ts:348-371`) | **`s_dragon_r` closes and R drops; `s_dragon_d` does NOT close and D does NOT drop** | No error expected. A design that drops D here is the vacuity this epic already shipped once |
| Dropped target re-struck | `col_dragon_g` already down; another ball crosses its zone and its former footprint | No second `closed: true`, no second `drop_target_down`, no collision response -- the ball passes through | No error expected |
| Bank reset | `pulse c_dragon_bank_reset`, coil enabled, some targets down | All six `isEnabled = true` **before** this tick's solve; one `closed: false` edge per target that was down; one `ContactEvent { kind: 'bank_reset' }`; `mechanisms.dropTargets` all `false` | No error expected |
| Bank reset with coil disabled | `CoilCommand disable c_dragon_bank_reset`, then `pulse` | Pulse is filtered at `machine.ts:293` (`DW-74`); nothing rises, no edges, no contact | No error expected |
| Bank reset with nothing down | All six up; `pulse c_dragon_bank_reset` | Targets stay collidable; **zero** `closed: false` edges (an edge is a transition, not a restatement); the `bank_reset` contact still fires once | No error expected |
| Spinner crossing | Ball's swept segment crosses `sw_spinner` at entry speed `v` | Spinner takes angular velocity proportional to `v`; `s_spinner` closes once per revolution and re-opens between; one `ContactEvent { kind: 'spinner_tick' }` per closure; `mechanisms.spinner` reports a non-zero decaying `speed` | No error expected |
| Spinner free-running after the ball has gone | Ball has left `sw_spinner`; spinner still turning | Closures **continue** on ticks when no ball's swept segment lies inside `sw_spinner`; spacing between closures strictly increases; the count is finite and `speed` reaches 0 | No error expected |
| Spinner, faster ball | Two drives from one start point, higher launch speed | Strictly more closures for the faster ball (AC's own "a faster ball produces more closures") | No error expected |
| Spinner, no crossing | Right Loop orbit (measured: crosses at x 52.2-52.3, `sw_spinner` spans x 5-45) | **Zero** `s_spinner` edges, zero `spinner_tick`, `speed` stays 0 | No error expected |
| Precise Lock shot | `lock-lane-long` release, `bd_lock` empty | `s_lock_lane` then `s_lock_1` close; **`machine.deviceSlots.bd_lock === [true, false, false]`**; a `ContactEvent { kind: 'hit', device: 'bd_lock', ballId }` on the same tick the ball leaves `machine.balls` | No error expected |
| Slightly-off Lock shot (**`DW-122`**) | `dragon-body` release | Ball strikes `col_dragon_leg_l` **or** `col_dragon_leg_r` and closes `s_dragon_body` through `sw_dragon_body_l` / `sw_dragon_body_r`; `deviceSlots.bd_lock` unchanged. **`col_dragon_body` does not exist; the AC's name is stale** | No error expected |
| Mouth eject, twice | `bd_lock` holds 2+; `pulse c_mouth`, then `pulse c_mouth` again | Each pulse spawns exactly one ball from the highest filled slot at the authored pose/speed, opens that slot switch and emits `ContactEvent { kind: 'eject', device: 'bd_lock' }`; neither ball re-parks | No error expected |
| Mouth eject, empty | `bd_lock` empty; `pulse c_mouth` | `eject_failed { device: 'bd_lock' }`; no ball spawned; slots unchanged | Existing behaviour, pinned |
| Over-capacity entry (**AC 6**) | Three balls parked; a fourth reaches the slot band | Physics parks nothing; the ball stays in the simulated set; **exactly one** `device_overflow { device: 'bd_lock' }` per rejected entry -- not one per tick of contact | Measured today: 315 events for one ball. That is the defect this row fixes |
| Wandering ball at the Lock lane (**`DW-134`**) | Descending columns over the Dragon legs / Ramp wall / Ramp turn | `s_lock_lane` does **not** close and no capture occurs. Measured 2026-09-05: 56 columns, 0 closes, 0 captures | No error expected |

</intent-contract>

## Code Map

**Read these first -- the investigation is here so it is not re-narrated at dispatch.**

### Registry and tunables

- `src/sim/table/dragonwar.ts:169-174` -- `s_dragon_d/r/a/g/o/n`, each `{ settleClass: 'drop_target' }`,
  in D-R-A-G-O-N order. `:175` `s_dragon_body` (`standup`). `:166` `s_spinner` (`rollover`), with the
  comment at `:157-161` reserving revolution counting for **this** story. `:176-179` `s_lock_lane`,
  `s_lock_1..3` (all `rollover`). `:213` `c_dragon_bank_reset` -- declared, defaulted enabled, and
  **completely unhandled**. `:214` `c_mouth`. `:301-346` `bd_lock` (kind `parking`, capacity 3, slots
  in fill order, `ejectCoil: 'c_mouth'`, `startsFullAtBoot: false`, `ejectSpeedMmPerS: null`,
  `ballSearchOrder` at `:316-320`). `:393-399` **`TABLE.popWiring` -- the shape to mirror** for a
  drop-bank and a spinner registry; `pnpm lint:boundaries` bans `s_`/`c_`/`bd_` literals outside this
  file, so a registry is the only legal way to express the wiring.
- `src/sim/table/tuning.ts:43-51` `TuningEntry<T>` and `entry()`. `:250-266`
  `switchSettleMsByClass` (`drop_target: 20`, `'high'`). `:504-540` the `hardware` group --
  **two traps**: the `satisfies Readonly<Record<'slingshotForce' | 'slingshotThresholdMmPerS' |
  'popKickMmPerS', TuningEntry<number>>>` clause at `:540` is a closed union that must be extended
  by hand, and `assertNoNestedMsKeys()` (`:618-636`, `DW-34`) **throws** on any `...Ms` key below
  the top level, so a spinner decay cannot be `spinnerDecayMs` inside `hardware`. `:535-539`
  `popKickMmPerS` -- value 200, confidence `'unverified'`, and the `source` string `DW-160`
  disproves. `:638` `resolveTuning(tuning = TUNING, tickHz = TICK_HZ)` -- the **override seam** is
  the first positional parameter; canonical use at `test/pop-bumper.test.ts:480-483`.

### Physics -- the seams this story extends

- `src/sim/physics/hit-object.ts:57` `isEnabled`, `:132-134` `setEnabled()`. **Every primitive's
  `hitTest()` early-returns `-1.0` when disabled** (`line-seg.ts:75`, `hit-line-z.ts:60`,
  `hit-3dpoly.ts:117`, `hit-triangle.ts:62`, `hit-circle.ts:64`, `hit-plane.ts:44`,
  `hit-point.ts:45`), and `fireHitEvent` guards on it at `:99`. This is the frozen vpx-js semantic
  and it is exactly "non-collidable". The bbox is untouched, so the quadtree stays valid.
- `src/sim/physics/game/player-physics.ts:223-228` `addStaticHitObject()` throws after
  `finalizeStatics()`; `:250-260` `finalizeStatics()` throws on a second call. **Statics cannot be
  rebuilt -- `setEnabled` is the only path, and it is the intended one.**
- `src/sim/physics/loader/index.ts:798-949` `loadCollision()`; `:850-869` the node loop;
  `:536-557` `addWall()` -- **one `LineSeg` per footprint edge plus one `HitLineZ` per vertex**, so
  a 4-point target is 8 hit objects and the bank is 48; the objects are pushed straight into
  `addStaticHitObject` with **no handle retained**. Two existing precedents for retaining a handle:
  `:806-827` (slings, a builder injected into `addWall()`'s 4th parameter, surface data returned on
  `LoadedCollision`) and `:620-626` / `:873-886` (pops, a second pass after `finalizeStatics()`
  keyed by node name, **throwing by name** if a node is missing). `LoadedCollision`'s interface is
  `:148-162`.
- `src/sim/physics/switches.ts:31-34` `BallMovement` (narrow: `before`/`after` only). `:51-61`
  `parkingDeviceOwnedSwitches()` -- **the derived exclusion set to copy**. `:74-79`, `:86` the
  tracker API. `:108-110` the swept-segment zone test. `:112-120` hysteresis. `:152-158` the make
  latches on the tick observed; `:160-171` `settleTicks` gates the break
  (`elapsedTicks >= settleTicks - 1`, `DW-67` + 2.1d's off-by-one correction). **There is no API to
  force a make or break independent of ball presence -- that gap is this story's real work.**
- `src/sim/physics/devices.ts:87-91` `BallStepMovement` (**wide**: `ball`, `beforeMm`, `afterMm`;
  `ballId` via `movement.ball.id`, velocity via `movement.ball.hit.vel` in VU/T, **post-step**).
  `:165-350` construction, incl. `:273` `fill(device.startsFullAtBoot)` and `:299-307` **the
  four-ball sum throw** (load-bearing for `DW-155`). `:366-430` `applyCommands` -- `:373-375`
  matches on `primaryPulseCoil`, `:380-384` `eject_failed`, `:389-391` the slot-switch open,
  `:399` speed fallback to `troughEjectSpeedMmPerS` = 300, `:401` `spawnBall`, `:409` `justEjected`,
  `:415` the `eject` contact. `:464-538` `detectEntries` -- `:520` the swept-segment entry test,
  `:524` `lowestEmpty`, **`:525-528` the overflow branch that fires once per tick**, `:529-533` the
  park (slot close + `kind: 'hit'` contact + `physics.removeBall`). `:541-543` `parkingSlots`.
- `src/sim/physics/machine.ts:133-138` `PRE_STEP_HARDWARE_RULES`; `:158-160`
  `SWITCH_EDGE_HARDWARE_RULES`; `:237` `c_dragon_bank_reset` defaulted enabled with the comment
  "bank-reset/Mouth actuation is Story 2.2/2.3's"; `:293` the `DW-74` enabled-pulse filter;
  `:294` `deviceMechanics.applyCommands`; `:309` `physics.step()`; `:354-365` movements built;
  `:367` `switchTracker.step(...)`; `:373-377` `popMechanics.applyPostSwitchEdges`;
  `:380-396` the hand-ordered return spreads (**ordering is deliberate and commented -- read
  `:382-393` before inserting**); `:404-418` `deviceSlots`; `:419-425` `mechanisms`, today
  `Pick<MechanismsSnapshot, 'flippers' | 'plunger'>` (`:53-54`).
- `src/sim/physics/pops.ts` -- **the closest template.** `:97-101` factory; `:59-64` the
  `applyPostSwitchEdges` signature; `:107-119` the derived subject set with two throws;
  `:130-133` the switch-edge trigger; `:141-143` the coil gate; `:145` ball resolution by swept
  segment; `:146-156` **throws when a make has no ball in the zone** -- note this invariant is
  exactly what a free-running spinner inverts; `:193-206` the impulse; `:208-216` the contact.
- `src/sim/physics/hop.ts:118-123` -- the precedent for **a scalar carried across ticks inside
  physics**: `createHopMechanics({ tuning })` reads its tunable once at construction and keeps a
  `WeakMap<Ball, number>` (`:123`, weak so a drained/parked ball is not pinned). `:87-115` shows the
  house convention for authored non-tunable constants with their measurement in the comment.
  `hopMechanics` is on `NOT_A_HARDWARE_RULE` (`test/hardware-rule-seam.test.ts:72`).
- `src/sim/physics/geometry.ts:29-57` `segmentIntersectsBox(before, after, minMm, maxMm)` -- the
  **only** shared swept-segment primitive; returns a boolean, no crossing parameter.

### Contracts

- `src/sim/contracts/events.ts:49-56` -- `ContactKind` **already** includes `'drop_target_down'`,
  `'bank_reset'`, `'eject'` and `'spinner_tick'`; `:64-76` `ContactEvent` already anticipates a
  mechanism name in `device`. `CONTACT_SURFACES` at `:30-43` already includes `'target'` and
  `'dragon'`. **No type-level work is owed on the contact channel.**
- `src/sim/contracts/snapshot.ts:12-14` states Epic 2 fills these rather than redefining them;
  `:50-55` `DropTargetMechanismState = Readonly<Record<string, boolean>>`; `:57-60`
  `SpinnerMechanismState { readonly speed: number }`; `:76-77` both on `MechanismsSnapshot`.
  Populated nowhere -- `src/sim/loop/index.ts:251-252` hard-codes `{}` and `{}`.
- `src/sim/rules/devices.ts:47-70` -- **verified: it reads only non-parking `entry` switches and
  parking-device slot switches.** `s_spinner` and `s_dragon_*` reach `rules.step` and are ignored,
  so neither can move `GameState` and therefore neither can move a golden's
  `expectedGameStateHash`. `src/sim/rules/index.ts:33-39,:50` filters `device_ball_entered` out of
  `FrameOutput.events` -- so it is **not** usable as this story's capture observable.

### Geometry that already ships (read-only -- no `.blend` change in this story)

- `public/assets/dragonwar.collision.json` -- six targets, `shape: "wall"`, `surface: "target"`,
  `y 700..708`, `z 0..50`, width 10.0, pitch 11.0:
  `col_dragon_d` `:306` x 217.4-227.4 - `col_dragon_r` `:534` x 228.4-238.4 -
  `col_dragon_a` `:234` x 239.4-249.4 - `col_dragon_g` `:344` x 250.4-260.4 -
  `col_dragon_o` `:496` x 261.4-271.4 - `col_dragon_n` `:458` x 272.4-282.4.
  Zones `sw_dragon_<letter>` at `:4672-4777`, each its body's x span **+/- 2 mm**, y 655.005-685.005
  (authored as `bank_y0 - ballRadius - 1.5`, i.e. **the zone leads contact by 1.5 mm**), z 0-30.
  **Adjacent zones therefore overlap by 3.0 mm** (`test/util/shot-cases.ts:343-347`).
  `col_dragon_bank_backstop` `:268` is the DW-119 anti-strand ramp north of the bank.
- `sw_spinner` `:5096-5110` -- box x 5..45, y 635..662, z 0..30; the **only** spinner node in the
  document. `col_spinner_l` was renamed `vis_spinner_l` in 2.1d and is presentation-only
  (`test/asset-contract.test.ts:1400-1425`). Measured: the Left Loop's ascending column runs
  x 27.5-36.5 (inside the zone); the descending/orbit return runs x 52.2-52.3 (**outside** it).
- **`col_dragon_body` does not exist.** `git grep -n col_dragon_body -- src test tools public assets`
  returns nothing. What ships: `col_dragon_leg_l` `:382` (footprint
  `(90,480)(150,480)(150,600)(90,620)` -- the reversed bevel) and `col_dragon_leg_r` `:420`
  (`(190,480)(213.4,480)(213.4,600)(190,620)`), with zones `sw_dragon_body_l` `:4687` and
  `sw_dragon_body_r` `:4702` both mapping to the one switch `s_dragon_body`.
- Lock corridor: `sw_lock_lane` x 152-188 y 480-540; `sw_lock_1/2/3` x 150-190 at
  y 544-558 / 561-575 / 578-592; `col_lock_ceiling` (x 146-194, y 598-642) and
  `col_lock_ceiling_west_fill` (x 90-150, y 598-672) seal it from the north; the only opening is
  the south mouth at y = 480. `bd_lock` eject pose `(170, 460, 13.495)` dir `(0,-1,0)` -- south of
  the whole corridor.

### Tests -- what exists, what must move

- `test/util/shot-cases.ts:374-433` -- **the six per-letter cases**, all `speedMmPerS: 1600`,
  `dirDeg: 0`, `ticks: 5000`, `z: 13.5`:
  `dragon-target-d` x 227.4 y 520 - `-r` x 233.4 y 520 - `-a` x 244.4 y 620 -
  `-g` x 255.4 y 480 - `-o` x 265.4 y 480 - `-n` x 272.4 y 480. Witnesses
  `plunge-then-bat-r-3906` (five of six) and `plunge-then-bat-l-3918` (o).
  `:336-343` records each one's clearance and closest approach.
  **`:348-371` is the load-bearing note**: d's release was corrected 2026-09-05 from 228.9 to 227.4
  because **228.9 closed `s_dragon_d` without ever striking `col_dragon_d`** -- it struck
  `col_dragon_r` and the zone's +2 mm margin did the rest. "The window is genuinely narrow --
  x in (226.895, 227.4] is the whole of it."
  `:304-322` `lock-lane-long`; `:1080-1105` `descend-pop-1` (the DW-148 column, release
  (130, 850, 13.5), rest (130.00, 833.55)); `:445-460` `top-lane-1` (x 130, y 900, 1500 mm/s) --
  the independent check that the pop **kick** fixed DW-148 rather than the release point dodging it;
  `:102-108` `MIN_SHOT_CASES` derived from the count of distinct zone-backed switches.
- `test/util/reachability.ts:104` witness `plunge-weak-345` -- already labelled as closing
  `s_spinner` on a partial climb; `:144`, `:275` the two bat witnesses. `plunge-then-bat-r-3906`
  crosses the bank band from the east and closes **four** letters in one pass -- a natural fixture
  for "targets stay down through further contact".
- `test/shot-routing.test.ts:228-303` `driveShot()` -- **records only `closed: true` switch events,
  first occurrence per switch (`:254-271`), no ticks, and discards `result.contactEvents` and the
  `machine` entirely.** `:134-151` `ShotResult`; `:107-132` `classifyTerminal()` --
  `terminal === 'locked'` is decided at `:113-115` **from `firstMakes`**, never from a capture.
  `:384` `driveCase(id)`. `:516-554` the Left Loop block, whose `s_spinner` assertion at `:549`
  **passes today with zero spinner code**. `:771-804` the `dragon-body` case. `:818-821` the
  `lock-lane-long` assertions. `:825-905` the six per-letter block; `:891-905` its non-vacuity check,
  derived from the committed document's zones.
- `test/switch-zones.test.ts:257-299` -- the `DW-67` 20-tick break unit test, whose subject is
  `s_dragon_d` with a synthetic zone. **It will need re-pointing or restructuring once the bank
  owns its switches. Re-point it; do not delete or weaken it.**
- `test/switch-max-speed.test.ts:190-242` -- drives the fastest producible ball at `sw_dragon_d`'s
  centre and asserts **exactly one make** across `s_dragon_d`/`s_dragon_r` in 60 ticks.
  Re-verify: once `col_dragon_d` goes non-collidable mid-flight the ball continues north into
  `col_dragon_bank_backstop` rather than rebounding.
- `test/hardware-rule-seam.test.ts:138-181` ordering; **`:183-213` set-equality** -- every
  `const X = create...(` inside `createMachine()` must be a manifest receiver or on
  `NOT_A_HARDWARE_RULE` (`:72`, today `{'switchTracker','hopMechanics'}`). Adding a module without
  a manifest row fails automatically.
- `test/lock-device-behaviour.test.ts` -- `:96-101` boot occupancy (the `DW-155` AC 1 subject);
  `:131-179` the four-ball throw; `:299-335` the inert `clearBeyond` backstop; `:358-389` one ball
  per pulse; `:391-403` `eject_failed`; `:471-522` the static enclosure; `:537-670` the descending
  drop probes; `:751-784` eject-pose-outside-own-slot-zones.
- `test/pop-bumper.test.ts:178` the DW-148 pin on the shipped value; **`:432-476` the DW-160
  narrative block that says in terms "NOT YET CORRECTED IN `tuning.ts`"**; `:477-527` the two
  corrected-bound pins -- `:479-517` `dw148TrailingProgressMm(v)` (**the sweep instrument**: boots,
  teleports to (130, 850, 13.5) at rest, runs 6600 ticks, returns net displacement over the final
  500 against a 15 mm floor); `:519` the 50 mm/s floor pin; **`:524` the 225 mm/s ceiling pin, which
  pins the BUG reproducing** -- a genuine pop-kick fix turns it red for a good change.
- `test/replay-goldens.test.ts:77`/`:107` name-set equality; **`:140-144` every golden's `notes`
  must contain the literals `DW-70` and `deviceSlots`**; `:212-256` the two-directional
  `PARITY_INERT` sweep (exactly `nudge-coupling` and `two-ball-collision`); `:265-391` the header
  guards.
- `src/sim/loop/replay.ts:138-146` `tableHash()` / `assetHash(doc)`; `:161-178` `PHYSICS_VERSION`;
  `:192-201` `buildHeader`; `:204` `StaleReplayHeaderError`; `:213-256`
  `assertHeaderMatchesLiveEnvironment` -- **the tuning check compares
  `JSON.stringify(canonicalize(resolveTuning()))` against `header.gameStart.tuning`, so `source`
  and `confidence` prose is hashed**; `:304` it is the **first statement of `runReplay()`**, before
  any tick.
- `test/port-provenance.test.ts:70-85` `AUTHORED_PHYSICS_FILE_RELATIVE_PATHS`; `:99`
  `AUTHORED_HEADER`; `:342-445` the `DW-79` port-body freeze; `:458-474` the cross-assertion against
  `tools/dependency-cruiser.config.mjs:61-76` `AUTHORED_PHYSICS_FILES` (extension-stripped).
  `test/story-2-0-rename-provenance.test.ts:249-250` **hard-pins that file at exactly 107 tests**;
  each new authored physics file adds one, so two new modules make it **109** -- bump it
  deliberately, exactly as the note at `:246-248` anticipates.
- `test/module-coverage.test.ts` -- every `src/**` module must be reachable from a `test/**` entry
  point or explicitly allowlisted, checked both ways.

## Tasks & Acceptance

**Execution** (ordered by dependency):

1. `src/sim/table/dragonwar.ts` -- add a **drop-bank registry** and a **spinner registry** in the
   shape of `TABLE.popWiring` (`:393-399`): the bank maps each letter key to its switch and its
   `col_` node name; the spinner maps its switch to its zone-bearing switch name. Rationale: the
   modules must derive their subject sets and the tracker must derive its exclusion set from
   `TABLE`, and `lint:boundaries` forbids `s_`/`c_`/`bd_` literals anywhere else. Keep
   `settleClass: 'drop_target'` on the six switches -- it stays the declared hardware class even
   though the bank, not the tracker, now decides the break.
2. `src/sim/table/tuning.ts` -- add the spinner tunables to `TUNING.hardware` (`:524-540`) with
   `source` and `confidence: 'unverified'` (no planning artifact states any of them), **extend the
   `satisfies` union at `:540`**, and **spell the decay in a non-`Ms` unit** because
   `assertNoNestedMsKeys()` throws below the top level (`DW-34`). Rationale: AD-15 -- table
   tunables in one file with provenance.
3. `src/sim/table/tuning.ts` -- **`DW-160`: correct `popKickMmPerS`'s `source` string in place**
   (`:535-539`) to the measured facts: **no ~180 mm/s floor** (any positive kick clears DW-148,
   verified to 0.5 mm/s); **the real ceiling is 221 mm/s**, where DW-148 re-strands at a *different*
   equilibrium near (93, 840) -- reproduced at 230 measuring 0.96 mm progress at (93.699, 838.695);
   the Top-lane cross-pop mechanism is real but starts at **425-600 mm/s**. State the safe window
   this story's own sweep measures (task 4). Rationale: AD-15 as amended 2026-09-05 -- the string is
   part of the hashed contract, and this story re-records anyway.
4. **`DW-160`, the margin question** -- sweep `popKickMmPerS` with
   `test/pop-bumper.test.ts:479`'s `dw148TrailingProgressMm(v)` (the instrument QA used) at fine
   resolution across the interval that brackets both the 0.5 mm/s floor and the 221 mm/s cliff, plus
   the `top-lane-1` and `descend-pop-1` behavioural columns. **Answer explicitly whether 200 with a
   21 mm/s margin is acceptable, or whether a value further from the cliff is better**, and record
   the measurement either way. If the value moves, re-derive `test/pop-bumper.test.ts:524`'s ceiling
   pin from the new sweep -- **never relax it**; it pins the bug reproducing and a genuine fix turns
   it red for a good reason.
5. `src/sim/physics/loader/index.ts` -- retain handles to each `col_dragon_<letter>`'s hit objects
   (all 8 per target: one `LineSeg` per edge plus one `HitLineZ` per vertex, `:536-557`) and expose
   them on `LoadedCollision` (`:148-162`), plus that target's own `footprintMm`. Follow the sling
   precedent (a collector/builder threaded through `addWall()`) or the pop precedent (a second pass
   keyed by node name after `finalizeStatics()`), and **throw by name if a node is missing**, as
   both existing paths do. Rationale: `setEnabled()` is the only way to make a body non-collidable
   and the statics tree cannot be rebuilt.
6. `src/sim/physics/drop-targets.ts` (**new, authored**) -- the bank. Derive the six targets from the
   task-1 registry (throw if empty). Own the six switches end to end: detect a **genuine strike on
   the target's own body**, latch `{ closed: true }` once, `setEnabled(false)` on that target's hit
   objects, emit `ContactEvent { kind: 'drop_target_down' }`, and hold until reset. On
   `pulse c_dragon_bank_reset` (coil-enabled), `setEnabled(true)` on all six, emit one
   `{ closed: false }` per target **that was down**, and one `ContactEvent { kind: 'bank_reset' }`.
   Expose the per-switch down/up map for the snapshot. Rationale: AC 1 and AC 2; AD-6's "a dropped
   target is non-collidable until `pulse c_dragon_bank_reset` raises the bank".
7. `src/sim/physics/switches.ts` -- widen the derived exclusion at `:51-61` so a switch owned by a
   device module (parking slots today, the bank and the spinner now) is not tracked. **Derive it
   from `TABLE`; never list switch names.** Rationale: AD-2, one source per switch.
8. `src/sim/physics/spinner.ts` (**new, authored**) -- the pass-through gate. On a swept-segment
   crossing of `sw_spinner`, take angular velocity proportional to the ball's entry speed (resolve
   the ball exactly as `pops.ts:145` does; throw if a crossing cannot be resolved). Then run free:
   accumulate angle per tick, emit one `{ closed: true }` + `{ closed: false }` pair on
   `s_spinner` and one `ContactEvent { kind: 'spinner_tick' }` **per revolution**, decay to rest,
   and expose `speed` for the snapshot. **Apply no impulse to the ball** -- it is a gate, not a
   body. Note that `pops.ts:146-156`'s "a make with no ball in the zone is a defect" invariant is
   *inverted* here and must not be copied: a free-running closure with no ball present is the
   correct behaviour and is this story's discriminating observable.
9. `src/sim/physics/machine.ts` -- wire both modules. The bank's **reset** runs pre-step (so a
   raised target is collidable during the same tick's solve) and joins
   `PRE_STEP_HARDWARE_RULES` (`:133-138`); the bank's **drop detection** and the spinner run after
   the solve and before the return spread, joining `SWITCH_EDGE_HARDWARE_RULES` (`:158-160`) --
   `test/hardware-rule-seam.test.ts:183-213`'s set-equality makes this mandatory, not optional.
   Merge their switch edges into `MachineStepResult.switchEvents` and their contacts into
   `contactEvents` at a **deliberately chosen, commented** position in the `:380-396` spreads.
   Widen `HardwareMechanismsState` (`:53-54`) to carry `dropTargets` and `spinner`.
10. `src/sim/loop/index.ts:251-252` -- replace the hard-coded `{}` / `{}` with the machine's real
    `dropTargets` and `spinner` state. **Do not route either through the `:341-344` `deviceSlots`
    overwrite** -- that seam is `DW-70` and is Story 2.5's to remove.
11. `src/sim/physics/devices.ts:525-528` -- **AC 6**: emit **one** `device_overflow` per rejected
    entry, not one per tick of zone contact. Measured today: 315 events for one ball. Use a
    per-ball latch cleared when the ball leaves the slot band, in the shape of `justEjected`
    (`:490-519`). Rationale: Story 2.4 consumes this signal and cannot debounce what physics
    should not have repeated.
12. `test/shot-routing.test.ts` -- **`DW-155`**: widen `driveShot()` (`:228-303`) / `ShotResult`
    (`:134-151`) to surface (a) `machine.deviceSlots` after the drive, (b) `result.contactEvents`,
    (c) every switch edge with its tick and `closed` flag -- not just the deduped first makes.
    Then replace `:820`'s `expect(result.terminal).toBe('locked')` with the **capture**:
    `deviceSlots.bd_lock` equals `[true, false, false]` **and** a
    `ContactEvent { kind: 'hit', device: 'bd_lock', ballId }` lands on the tick the ball leaves
    `machine.balls`. Keep `assertOrbitOrder`; the point is to add the observable a switch make
    cannot forge, not to remove one. Rationale: `terminal` is computed from `firstMakes` at
    `:113-115` and adds exactly one bit ("did not reach a flipper band") over the line above it.
13. `test/lock-device-behaviour.test.ts` -- **`DW-155`, the other half.** Record a mutation for the
    boot-occupancy assertion at `:96-101` that is **not shadowed by the four-ball sum throw**
    (`devices.ts:299-307`), which fires at `createMachine()` before `deviceSlots` is ever read.
    A sum-preserving mutation is the shape that works (e.g. move the full-at-boot declaration
    between devices of equal capacity so the total stays 4). If no sum-preserving mutation exists,
    say so in `## Verification` and pin the derivation directly instead -- **do not record a
    throw-based mutation as evidence for a behavioural assertion.**
14. `test/lock-device-behaviour.test.ts` -- add **AC 5's second pulse** (two `pulse c_mouth`
    commands eject two different balls, each once, neither re-parking) and **AC 6** (three parked,
    a fourth driven up the lane: nothing parks, the ball stays simulated, **exactly one**
    `device_overflow`). No existing test drives a fourth ball into `bd_lock`; the only overflow
    tests (`test/machine-serve-drain.test.ts:229-242`, `:292-326`) are `bd_trough`-scoped.
15. `test/shot-routing.test.ts` -- **`DW-134`**: pin the *absence*. Drive the descending columns
    named in the entry and their current committed successors (`descend-dragon-leg-l` (120, 680),
    `descend-ramp-wall-l` (280, 860), `descend-ramp-turn-cap` (344, 940)) and assert `s_lock_lane`
    does not close and `deviceSlots.bd_lock` is unchanged, with the real `lock-lane-long` capture as
    the paired true positive so the assertion is not vacuous. Record the measurement in
    `## Design Notes`.
16. `test/drop-targets.test.ts` and `test/spinner.test.ts` (**new**) -- in the
    `test/pop-bumper.test.ts` mould (drive `machine.step()` directly, read both `switchEvents` and
    `contactEvents`, use `resolveTuning()`'s override seam for tunable bounds, carry an I/O-matrix
    `describe` block for the degenerate rows above). Every anti-vacuity floor is derived from the
    committed document or the `TABLE` registry, never hand-typed (`DW-149`).
17. `test/switch-zones.test.ts:257-299` -- re-point or restructure the `DW-67` 20-tick break test so
    it still pins `drop_target`-class break semantics once `s_dragon_d` is device-owned.
    **Do not delete it and do not weaken the assertion.**
18. `test/switch-max-speed.test.ts:190-242` -- re-verify the "exactly one make" assertion under
    mid-flight non-collidability, and record what changed and why.
19. `test/port-provenance.test.ts:70-85`, `tools/dependency-cruiser.config.mjs:61-76`,
    `test/story-2-0-rename-provenance.test.ts:249-250` (**107 -> 109**), `test/module-coverage.test.ts`
    -- the four registration duties for the two new authored physics files. All four are asserted
    two-directionally, so a missed one is a red, not a silent pass.
20. `test/replays/*.golden.json` -- **trace first, then record.** Replay each golden against the
    pre- and post-change tree with `onTick` sampling and compare positions; if all five are
    byte-identical this is a **header-only refresh** of `header.tableHash` and
    `header.gameStart.tuning` (`assetHash` must not move -- no geometry changes here). Append the
    reasoning to each `notes` (never rewrite it; the `DW-70` and `deviceSlots` literals stay).
    If any trajectory genuinely moves, the author's grant conditions apply in full and a trace that
    cannot be shown correct is a **HALT**.
21. `docs/decisions.md` -- record the spinner's spin/decay model and the drop-bank ownership
    decision alongside the existing OQ-5 / OQ-6 entries, if `test/decisions-docs.test.ts` requires
    it for the new behaviour.

**Acceptance Criteria:**

- **AC 1 (drop, latch, non-collidable).** *Given* the DRAGON bank is up, *when* a ball's swept path
  genuinely strikes `col_dragon_r`, *then* `s_dragon_r` emits exactly one `closed: true` and stays
  closed through every subsequent tick until a bank reset, that target's hit objects report
  `isEnabled === false`, exactly one `ContactEvent { kind: 'drop_target_down' }` is emitted, and a
  second ball crossing the same zone produces no further edge, no further contact and no collision
  response.
- **AC 1b (the drop is caused by the strike, not by the zone).** *Given* the recorded release at
  `x = 228.9` on the bank column -- which closes `sw_dragon_d` through its +2 mm x margin while
  measurably striking `col_dragon_r` (`test/util/shot-cases.ts:348-371`) -- *when* it is driven,
  *then* **R drops and D does not**. This is the discriminating case; a design that drops D here is
  the "switch make through a neighbouring body's margin" vacuity this epic has already shipped.
- **AC 2 (bank reset).** *Given* one or more targets are down, *when* `pulse c_dragon_bank_reset` is
  processed with the coil enabled, *then* all six report `isEnabled === true` **before the same
  tick's solve**, one `closed: false` edge is emitted per target that was actually down (zero when
  none were), one `ContactEvent { kind: 'bank_reset' }` is emitted, and with the coil **disabled**
  the pulse produces nothing at all.
- **AC 3 (spin, per-revolution closure, decay).** *Given* a ball crosses `sw_spinner` on the Left
  Loop's ascending column, *when* physics steps, *then* `s_spinner` closes **more than once** for
  that single crossing, **at least one closure lands on a tick when no ball's swept segment lies
  inside `sw_spinner`**, the interval between consecutive closures strictly increases, the total is
  finite, and `mechanisms.spinner`'s `speed` returns to 0. A Right Loop orbit -- measured to cross
  at x 52.2-52.3, outside the zone's x 5-45 -- produces **zero** closures and zero `spinner_tick`
  contacts.
- **AC 3b (a faster ball produces more closures).** *Given* two drives from the same release point
  at two launch speeds inside the measured entry band (~390-2720 mm/s at the zone), *when* both are
  driven, *then* the faster ball produces strictly more `s_spinner` closures. The ordering is the
  assertion, not a threshold.
- **AC 4 (the Lock captures, and the gate reads the capture).** *Given* `bd_lock` is empty, *when*
  `lock-lane-long` is driven, *then* `machine.deviceSlots.bd_lock === [true, false, false]`, a
  `ContactEvent { kind: 'hit', device: 'bd_lock', ballId }` lands on the tick that ball leaves
  `machine.balls`, and the assertion **does not** rest on `terminal` or on any value derived from
  `firstMakes` (`DW-155`). *And* a slightly-off shot strikes `col_dragon_leg_l` or
  `col_dragon_leg_r` and closes `s_dragon_body`, leaving `deviceSlots.bd_lock` unchanged
  (`DW-122` -- `col_dragon_body` does not exist).
- **AC 5 (Mouth, twice).** *Given* `bd_lock` holds two or more balls, *when* `c_mouth` is pulsed
  twice, *then* each pulse spawns exactly one ball from the highest filled slot at the authored pose
  and speed, opens that slot's switch as an edge, emits one
  `ContactEvent { kind: 'eject', device: 'bd_lock' }`, and neither ejected ball re-parks.
- **AC 6 (over capacity).** *Given* three balls are parked in `bd_lock`, *when* a fourth reaches the
  slot band, *then* physics parks nothing, the ball remains in the simulated set, and **exactly one**
  `device_overflow { device: 'bd_lock' }` is emitted for that rejected entry -- against the 315
  measured today.
- **AC 7 (`DW-134` -- a wandering ball does not enter the Lock).** *Given* the descending columns
  named in `DW-134` and their committed successors, *when* each is driven with the sweep's own
  release parameters, *then* `s_lock_lane` does not close and `deviceSlots.bd_lock` is unchanged,
  while the paired `lock-lane-long` control does close it and does capture -- so the assertion can
  observably fail.
- **AC 8 (`DW-160` -- the provenance is true and the margin is answered).** *Given* the corrected
  `source` string, *when* `pnpm test` runs, *then* the five goldens are green on refreshed headers,
  `test/pop-bumper.test.ts:519` and `:524` still hold (re-derived, never relaxed, if the value
  moved), and `## Design Notes` records the measured safe window with an explicit answer to whether
  200 and a 21 mm/s margin ship.
- **AC 9 (Integration -- `sim/loop` is the consumer, Rule 1).** *Given* a full `advance()` through
  `src/sim/loop`, *when* a ball drops a target and another crosses the spinner, *then*
  `FrameOutput.contactEvents` carries the `drop_target_down` and `spinner_tick` events and
  `FrameOutput.snapshot.mechanisms.dropTargets` / `.spinner` report that target down and a non-zero
  decaying `speed` -- asserted at `FrameOutput`, the outermost surface the intent reaches, not at
  `MachineStepResult`.
- **AC 10 (baselines).** *Given* the finished change, *when* the gates run, *then* `pnpm test` is at
  or above **93 files / 1490 passed / 0 failed** with `BLENDER` set and no test deleted, skipped or
  weakened; `pnpm check:ad7` **still exits 1** naming `AD-7`, `DW-70`, `bd_trough` and both array
  literals; `pnpm check:corridor` exits 0; `pnpm check:reachability` exits 0 with every moved
  verdict explained and no `unreachable` edited; `pnpm typecheck`, `pnpm lint:boundaries`,
  `pnpm check:headers`, `pnpm check:attributions` all pass; and
  `git diff public/assets/dragonwar.collision.json` is **empty**.

## Spec Change Log

## Review Triage Log

## Design Notes

### Governing architecture decisions (Rule 6)

- **AD-6 (primary; both amendments read in full).** Three clauses bind directly. (a) "a dropped
  target is non-collidable until `pulse c_dragon_bank_reset` raises the bank" -- collidability, not
  position, which is why no geometry moves. (b) The 2026-09-03 amendment: the spinner is a
  **pass-through gate, not a collision body**; a ball crossing `sw_spinner` imparts rotation
  proportional to entry speed and the spinner "closes `s_spinner` **once per revolution until it
  decays** (FR-26 awards per rotation)", and "**Story 2.3 owns the spin and decay mechanism**,
  driven off that zone crossing". Story 2.1c measured thirteen-plus rigid-body variants and every
  one that genuinely contacted the ball produced a permanent DW-119-class stall -- so a `col_`
  spinner body is a closed question, not an option. (c) The 2026-09-04 amendment: boot occupancy is
  a declared per-device property and the four-ball invariant is checked by name at construction --
  which is exactly what shadows `DW-155`'s first mutation (below).
- **AD-2 (amended 2026-09-01, `DW-67`).** Switches are edges from **one source per class**, and
  `settleTicks` gates the **break**, never the make. Two consequences this story must state rather
  than absorb silently. First, **AC 2 forces device ownership of the six bank switches**: it
  requires the reset to open them "as edges", which can only happen if they were still closed --
  and a tracker-owned switch opens 20 ticks after the ball leaves the zone, long before any reset.
  Second, once the bank owns them, `settleTicks: 20` is the switch's declared hardware class but no
  longer gates a break; the bank reset is the only break. That is a **Rule 20 decision with
  architectural weight** and is recommended to the lead as an AD-2 clarification, not something this
  spec may write into the spine itself.
- **AD-15 (amended 2026-09-05, Story 2.2).** Table tunables live in one file with `source` and
  `confidence`; solver constants are never tunable. The amendment is the operative one here: "a
  tunable's `source` and `confidence` strings are part of the hashed contract, not commentary" --
  `resolveTuning()`'s entire serialized output is hashed into `header.gameStart.tuning`, so
  `DW-160`'s prose fix invalidates all five goldens exactly as a numeric change would. **This story
  is the carrier the amendment names.** No solver constant moves, so `PHYSICS_VERSION` is unchanged.
- **AD-11.** Blender owns placement; `TABLE` owns devices, wiring, groups and tunables; `sw_` zones
  are analytic tests against the ball's per-tick **swept segment, never its end position**. Both
  registries added here are `TABLE`'s side of that contract. A node nothing collides with is not
  `col_` -- which is why the spinner is `vis_spinner_l` and absent from the collision document.
- **AD-3.** One clock; no wall-clock and no unseeded randomness in `sim/`. The spinner's decay is
  authored in tunable units converted once, never a literal millisecond, and its angular state
  advances by tick.
- **AD-5.** Hardware rules live in physics, gated by coil enable. `c_dragon_bank_reset` goes through
  the same `DW-74` enabled-pulse filter (`machine.ts:293`) as every other coil; a disabled bank
  cannot be reset.
- **AD-7.** `GameState` is one plain-data tree with fixed ownership scopes; device slot counts are
  machine-scoped and are "the number of closed slot switches and nothing else". Mechanism state
  (`flippers`, `plunger`, and now `dropTargets`, `spinner`) lives on the **snapshot**, not in
  `GameState`, and is therefore outside the replay state hash by design. Routing spinner or
  drop-target state through `src/sim/loop/index.ts:341-344` would deepen `DW-70`; explicitly
  forbidden above.
- **AD-17.** Static bundle and size budget: `pnpm build && pnpm check:dist && pnpm check:size` stay
  green.
- **AD-19.** `sim/rules/devices/` is the only consumer of `SwitchEvent`, and the drop bank's letters,
  the spinner's count and the reset pulsing are **Story 2.4's**. This story consumes switch edges
  *inside physics* and emits them outward; it does not encroach.
- Also read: **AD-9** (the closed command union -- `c_dragon_bank_reset` is an ordinary
  `CoilCommand pulse`), **AD-16** (three complementary provenance gates), **AD-10** (`toPhysics()`
  negates y -- the frame trap), **AD-18** (the Lock arbiter is Epic 3's; this story only supplies
  the physics it will arbitrate over).

**No AC contradicts an AD, so there is no Rule 6 intent gap.** The one place two readings were
available -- whether the bank's switches stay tracker-owned or become device-owned -- is settled by
AC 2's own wording ("their switches open as edges"), the same way Story 2.2's two device placements
were selected by its own ACs rather than chosen.

### The one real design decision: what causes a target to drop

A zone make is **not** the same event as a strike on that target's body, and the tree already
records the case that proves it. `sw_dragon_<letter>` is its body's x span **+/- 2 mm** and its
north edge is authored 1.5 mm before contact, so at `x = 228.9` a ball measurably strikes
`col_dragon_r` while closing `s_dragon_d` through D's margin -- which is why d's release point was
corrected to 227.4 on 2026-09-05, with the honest window recorded as
`x in (226.895, 227.4]` (`test/util/shot-cases.ts:348-371`). Adjacent zones also overlap by 3.0 mm,
so one shot legitimately makes two switches.

If the drop triggered on the zone make, this story would ship a device whose "the target dropped"
observable is indistinguishable from "the target *next to it* was hit" -- the same shape as the
switch make that closed through a 2 mm margin off a neighbouring body's face, which is one of the
eleven vacuous assertions this epic has already paid for. **So the drop is caused by a genuine
strike on the target's own body**, and the zone is at most a cheap pre-filter.

**The implementation is deliberately not specified.** Two seams exist and either is acceptable:
retained `HitObject` handles from task 5 (the bodies whose `hitTest` actually produced the
collision), or a per-tick swept-segment proximity witness against that target's own `footprintMm` --
the geometric-witness pattern Story 2.2's Design Notes already prescribe. What is fixed is the
observable, and AC 1b pins it at a release point the tree has already measured.

**Knock-on effects, stated so they are not surprises.** Making `s_dragon_*` contact-driven changes
what a make means for six switches: `test/switch-zones.test.ts:257-299` (whose `DW-67` subject is
`s_dragon_d`) must be re-pointed rather than deleted, and `test/switch-max-speed.test.ts:190-242`'s
"exactly one make" must be re-verified now that a struck target stops being a body mid-flight and
the ball continues into `col_dragon_bank_backstop` instead of rebounding. The six per-letter routing
assertions are **containment** checks (`shot-routing.test.ts:878-890`), so losing an incidental
neighbour make does not fail them -- but `:891-905`'s non-vacuity check derives its expected set
from the committed document's zones and may need to derive it from the registry instead. Any change
there must be a strengthening.

### The spinner's falsifiability problem, and the four observables that solve it

**`s_spinner` closes today, with zero spinner code**, and `test/shot-routing.test.ts:549` asserts
exactly that. It passes on the committed tree, and it would pass unchanged after this story ships
*and* after this story is entirely reverted. It must therefore **not** be this story's pinning
assertion for AC 3 -- taking it at face value would be the twelfth vacuity, pre-loaded.

`driveShot()` cannot even see the difference: it records only the **first** `closed: true` per
switch (`:254-271`), keeps no ticks, and discards `contactEvents` entirely. Revolutions 2..N are
structurally invisible to it.

Four observables distinguish a revolution-driven closure from the ball's own crossing, all
measurable against the baseline measured on the committed tree (one make + one break per crossing,
at every offset and speed):

1. **More than one closure per single crossing.** The baseline is exactly one. Two or more is
   producible only by a counter.
2. **A closure on a tick when no ball's swept segment lies inside `sw_spinner`** -- computed with
   the same `segmentIntersectsBox` the tracker uses. This is the one observable geometry cannot
   forge, and it is precisely the condition `pops.ts:146-156` throws on, which is why the spinner
   must not copy that invariant.
3. **Closure count strictly increasing with entry speed** (AC 3b) -- an ordering, not a threshold.
4. **Strictly increasing interval between consecutive closures**, a finite total, and `speed`
   returning to 0 -- which separates a real decay from a fixed-rate pulse train.

Free true negatives, both already measured: the Right Loop orbit crosses at x 52.2-52.3, outside
`sw_spinner`'s x 5-45, so it must produce **zero** closures; and an 800 mm/s launch never reaches
y = 635 at all.

**Measured entry band at the zone (this story's planning measurement, on the committed tree):**
1789.8 mm/s at every Left Loop orbit offset (28/31/34), dwelling 16 ticks; sweeping the launch speed
gives ~390-2720 mm/s at the zone over 12-66 ticks of dwell, and at 1000-1200 mm/s the ball climbs
partway and **falls back through the zone**, giving a real two-crossing case (the same shape as the
`plunge-weak-345` witness). Both the double crossing and the free-running tail must behave.

### `DW-134` -- measured before planning, and the verdict

The entry names three descending columns -- (120, 660), (332, 880), (360, 895) -- that closed
`s_lock_lane` with nothing but `s_drain`/`s_trough_4`. All three were re-sited by 2.1d/2.1f and
**all three original points now have 0.000 mm clearance** (they lie inside
`col_lock_ceiling_west_fill` and `col_ramp_turn` respectively), so they could not legally be driven
today. Driven anyway, and driven at their committed successors, and then swept densely:

- Original three: `s_lock_lane` **does not close** at any of them; two drain normally, one is a
  DW-77 teleport artefact embedded in a body.
- Committed successors `descend-dragon-leg-l` (120, 680), `descend-ramp-wall-l` (280, 860),
  `descend-ramp-turn-cap` (344, 940), plus four neighbours: **0 closes, 0 captures**.
- Dense confirmation: `x = 92..232 step 4` at `y = 680` and `y = 700` -- **56 driven columns
  (16 skipped as DW-77 violations), `s_lock_lane` closed 0 times, `bd_lock` captured 0 times,
  0 stranded.** Low-energy mouth probes (`y = 440/460/470`, `x = 145..195 step 5`): 28 driven,
  0 closes.
- Non-vacuity control: the real `lock-lane-long` shot closes `s_lock_lane` at tick 388 and
  `s_lock_1` at 439, with `deviceSlots.bd_lock = [true, false, false]`. The measurement can see a
  lane close; it simply never sees one from open field.

**Verdict: `DW-134` as written is closed by Story 2.1d**, and the mechanism is structural rather
than incidental -- `col_lock_ceiling` (x 146-194, y 598-642) and `col_lock_ceiling_west_fill`
(x 90-150, y 598-672) now cover the surface the shed-off-the-bevel ball used to land on, and the
corridor's only opening is the south mouth at y = 480. AC 7 pins the absence so it cannot silently
return.

**Harness parameters used (put these in the AC 7 test):** `createMachine(readCollisionDoc(),
resolveTuning())`; 320-tick pre-roll with `pulse c_trough_eject` at tick 1 and `NO_FRAME`
throughout; release by setting `ball.state.pos` from `toPhysics(startMm)` with
`speedVuPerT = speedMmPerS / (MM_PER_VU * 100)`, `vel = (sin(dirDeg), -cos(dirDeg), 0) * speedVuPerT`,
angular velocity and momentum zeroed; descending-sweep case parameters `z = 13.5`,
`speedMmPerS = 1`, `dirDeg = 0`, `ticks = 6600`; clearance filter
`RELEASE_CLEAR_MARGIN_MM = TABLE.reference.ballMm / 2 = 13.495` against every non-`plane` node's
footprint.

**The live residual, and why it is a finding rather than this story's fix.** `lock_lane_entered`
still does not imply a capture, but for a different and narrower reason: an **under-powered but
on-axis** shot enters `sw_lock_lane` (y 480-540), stalls short of `sw_lock_1`'s 544 mm face and
rolls back out. Measured at release `(x, 440)`, `dirDeg 0`: at x = 165/170/175 the lane closes at
350-550 mm/s with no capture, and captures from 600 mm/s up; x = 158 and x = 182 never enter at all.
**The capture threshold is between 550 and 600 mm/s at the corridor centreline.** That argues for
the ledger's own second option -- "the arbiter must tolerate a non-shot entry" (AD-18, Epic 3) --
rather than a geometry change, so it goes to frontmatter `deferred:` for the lead's harvest with
these numbers, not into this story's scope.

### `DW-155` -- why both recorded mutations fail, and what replaces them

**AC 1's mutation is shadowed by a construction-time throw.** The recorded text
(`spec-2-1d...:1471`) claims that setting `bd_lock.startsFullAtBoot: true` makes the boot-occupancy
test "go red reporting `[true,true,true]` against the expected `[false,false,false]`". It cannot.
`createDeviceMechanics()` accumulates `totalBootFull` at `devices.ts:292` and throws at `:299-307`
("AD-6 requires exactly 4 balls ... sums to 7 (bd_trough=4, bd_lock=3)") **at the
`createMachine()` line**, before `deviceSlots` is ever read. Confirmed empirically: `createMachine()`
throws and `deviceSlots.bd_lock` is never observed. The mutation reddens only the second half of its
own claim -- and that half is already independently pinned at
`test/lock-device-behaviour.test.ts:131-179`. **The finding to record is structural**: the sum check
shadows *every* single-field registry mutation of this flag, so the behavioural assertion at
`:99` is currently unfalsifiable by one. Task 13 must find a **sum-preserving** mutation or pin the
derivation directly, and must say which.

**The Lock-lane case's `terminal` is a restatement, not a stronger observable.**
`classifyTerminal()` (`test/shot-routing.test.ts:109-132`) decides `'locked'` at `:113-115` purely
from `firstMakes.includes('s_lock_1')`, and `assertOrbitOrder(result, ['s_lock_lane','s_lock_1'])`
on the line above (`:819`) already establishes exactly that. So `:820` adds **one bit** ("did not
reach a flipper band") and **zero bits** about whether `bd_lock` holds a ball. It is sound today only
because `s_lock_1` is tracker-excluded so `devices.ts:530` is its sole emitter -- an accident of the
current exclusion set that this very story widens.

**The replacement observables, all already emitted, none needing new production code:**

| Observable | Where | Why it discriminates |
|---|---|---|
| `machine.deviceSlots.bd_lock` | getter `machine.ts:404-418`, backed by `devices.ts:541-543` | The **only state a real park writes** (`:529`). A switch make cannot set it. |
| `ContactEvent { kind: 'hit', device: 'bd_lock', ballId }` | `devices.ts:531`, merged at `machine.ts:394` | Carries the **ballId** -- proves *which* ball was taken and on which tick. |
| `machine.balls.length` dropping on that same tick | `physics.removeBall` at `devices.ts:533` | Separates a park from a drain; `leftPlay` alone explicitly does not (`shot-routing.test.ts:137-138`). |

**Do not use `device_ball_entered`** -- `src/sim/rules/index.ts:33-39,:50` filters it out of
`FrameOutput.events`, and reaching it means calling `processSwitchEvents()` on the same switch edge,
i.e. the inference restated one layer up. **Do not use `GameState.machine.deviceSlots`** -- it is
overwritten by `src/sim/loop/index.ts:341-344`, which is `DW-70`.

### `DW-122` -- an AC name repair, not a behaviour change

`col_dragon_body` **does not exist**: `git grep -n col_dragon_body -- src test tools public assets`
returns nothing, and Story 2.1f's spec already recorded the correction. The Dragon ships as
`col_dragon_leg_l` (footprint `(90,480)(150,480)(150,600)(90,620)`) and `col_dragon_leg_r`
(`(190,480)(213.4,480)(213.4,600)(190,620)`), with **two** zones -- `sw_dragon_body_l` (x 94-146,
y 430.005-465.005) and `sw_dragon_body_r` (x 194-209.4, same y) -- unioned onto the single switch
`s_dragon_body` by `switches.ts:94-102`. The behaviour the AC describes already ships and is already
tested (`test/shot-routing.test.ts:771-777`).

There is exactly one defensible referent, and the AC names the switch itself, so this is a stale
name rather than an intent gap -- but the epics text should be repaired so no later story reads it
at face value. **Recommended amendment for the lead (Rule 5, apply-and-report tier -- "correcting a
wrong file/API/name the AC cites"),** at `epics.md:1242` and the mirrored line at `:2115`:

> "...; a slightly-off shot hits `col_dragon_leg_l` or `col_dragon_leg_r` and closes `s_dragon_body`
> (through `sw_dragon_body_l` / `sw_dragon_body_r`) instead."

`bmad-build-auto` cannot amend planning artifacts mid-run, so the spec plans against the real names
and cites `DW-122` in the I/O matrix and in AC 4. **No code or geometry consequence.**

### AC 6's "the ball rests at the lane's entry" -- how it is read, and what was measured

Read against the AC's own purpose clause ("so it [the rules layer] can answer `device_overflow`",
and AD-6's "rules enforce capacity and answer a slot beyond it with an immediate eject"), the
physics obligations are: park nothing, keep the ball in the simulated set at the lane, and signal
the rejected entry. All three are in scope and the third is the defect this story fixes.

**Measured, so the record is honest:** with three balls parked, a fourth driven up the lane at
800 mm/s from (170, 440) is correctly not parked -- but it does not *rest*. It sits in the slot band
for ~315 ticks, rolls back down the corridor and drains at tick 3868, then is re-served into
`bd_trough`. Making it literally rest would need geometry that does not exist and that nothing else
in this story calls for; `bd_lock`'s capacity of 3 is "two held plus one staging" (AD-6), so a fourth
ball genuinely has nowhere to go. **Recommended amendment for the lead**, at `epics.md`'s AC 6:
replace "the ball rests at the lane's entry" with "the ball stays in the simulated set at the lane
and returns to play". Recorded here rather than resolved unilaterally.

### Provenance (`CLAUDE.md`, the project's hardest constraint)

**Both new modules are authored from scratch. Nothing in the ported closure applies, and no
`ATTRIBUTIONS.md` row is owed** -- the same finding, by the same reasoning, that Story 2.2 recorded
for the pop bumper. Four independent lines of evidence: no `spinner.ts` / `drop-target.ts` /
`hit-target.ts` exists under `src/sim/physics/`, and the only spinner/gate/target references there
are **enum members and comments inside already-ported files** (`CollisionType.Spinner`/`.Gate`/
`.HitTarget` at `collision-type.ts:42,53`, `EventType.SpinnerEventsSpin` at `game/event.ts:43`);
`ATTRIBUTIONS.md:28` scopes the vpx-js port to `src/sim/physics/**` from **`lib/physics/` only**,
and upstream's spinner and hit-target models live in `lib/vpt/spinner/` and `lib/vpt/hittarget/`,
outside it exactly as `lib/vpt/bumper/` was; there is no attribution row for either; and AD-6's
2026-09-03 amendment has already closed the question of a ported/collision spinner on measurement.

If a later reviewer wants upstream's model instead, the two traps apply in full: a `vpdb/vpx-js`
file from a **different upstream directory** was not part of row 2's 2026-08-27 verification and
would require amending that row after reading the file's own header at the pinned commit; and a
`vpinball/vpinball` file is usable **only** if its own first line reads `// license:GPLv3+`, and
row 3's glob covers `src/sim/physics/cabinet/**` only, so it would need a new row plus
`VPINBALL_PORTED_FILES` and `PORT_BODY_HASHES` entries. Either way the row lands **before** the
file, and if a licence cannot be established that is a HALT, not a judgement call.
`pnpm check:attributions` reads npm dependencies only and **cannot catch a mistake here** -- the
real gates are `pnpm check:headers`, `test/port-provenance.test.ts` and human review.

**Header for each new authored file** (copied from `src/sim/physics/pops.ts`), plus the declaration
paragraph:

```ts
// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// ... module rationale, AD references, measurements ...
//
// This file is authored, not ported (AD-16, declared in
// `test/port-provenance.test.ts`'s `AUTHORED_PHYSICS_FILE_RELATIVE_PATHS`
// and `tools/dependency-cruiser.config.mjs`'s `AUTHORED_PHYSICS_FILES`).
```

### Integration ACs and linkage (Rules 1/2)

- **`Consumes:`** `HitObject.setEnabled()` and the frozen `isEnabled` early-return in every
  primitive (Story 1.1's port); `createSwitchTracker` and the amended `settleTicks` semantics
  (`DW-67`, 2.1b/2.1d); `createDeviceMechanics`'s parking/eject/overflow behaviour and the declared
  boot occupancy (2.1d); the coil-enable map and its proven disable semantics (`DW-74`);
  Story 2.1b's `s_dragon_*` / `s_spinner` / `s_lock_*` declarations, `c_dragon_bank_reset` and
  `c_mouth`; Story 2.1f's corridor and its six per-letter cases with named witnesses; Story 2.1e's
  reachability harness; Story 2.2's `TUNING.hardware` group, `pops.ts` module shape and
  `resolveTuning()` override-seam test pattern. **All exercised against real instances, never
  mocks.**
- **`Consumed-by:`** **Story 2.4** -- the devices-and-shots layer consumes the `s_dragon_*` edges to
  emit `bank_target_down { letter }` / `bank_completed` and to pulse `c_dragon_bank_reset`, the
  `s_spinner` edges to emit `spinner_spin { count }`, and `s_lock_lane` / the slot switches for
  `lock_lane_entered` / `device_ball_entered`. **Story 3.x / AD-18** -- the Lock arbiter is the only
  consumer of `lock_lane_entered` and alone pulses `c_mouth`; the measured 550-600 mm/s
  non-capturing-entry band above is its problem to tolerate. **Epic 4 / AD-13 audio** -- the first
  real consumer of `drop_target_down`, `bank_reset`, `spinner_tick` and `eject` contacts; one
  mechanical sound per actuation is exactly why AD-2 puts actuations on the contact channel.
  **Story 2.11** -- Tilt consumes the coil-disable path that makes AC 2's disabled-coil row
  meaningful.
- **The Integration AC is AC 9**, deliberately placed at `FrameOutput` -- the object
  `src/host/loop.ts` hands to `onFrame` -- rather than at `MachineStepResult`, because that is the
  outermost surface the intent reaches and Rule 1 requires the consumer's own tier.
  **Honest caveat:** no presentation module reads `contactEvents` or `mechanisms` yet, so AC 9
  proves the state and events reach the boundary, not that anything is drawn or heard. That is the
  correct scope; the consumers are Story 2.4's and Epic 4's.

### Ledger inbox (Rule 17) -- all four addressed, none declined

- **`DW-122`** -- addressed by the I/O matrix's "slightly-off Lock shot" row, by AC 4's second
  clause, and by the recommended `epics.md` amendment above. Evidence: `git grep` returns zero.
- **`DW-134`** -- addressed by task 15 and AC 7, with the measurement above. **Resolve, do not
  re-fix**: 2.1d closed it structurally. The narrower live residual goes to frontmatter `deferred:`.
- **`DW-155`** -- addressed by tasks 12 and 13 and by AC 4's "does not rest on `terminal`" clause,
  with both failure modes traced to the line that causes them.
- **`DW-160`** -- addressed by tasks 3 and 4 and AC 8: the prose correction rides the re-record this
  story owes anyway, and the margin question is answered with its own sweep rather than assumed.

Entries deliberately **not** touched, named so the omission is legible: **`DW-70`** (Story 2.5, and
its red check is a fixture of this story's baseline -- do not fix it), **`DW-138`** (`burndown`, the
unreachable cohort), **`DW-149`** (`burndown`, but its derived-floor discipline binds every floor
here), **`DW-148`/`DW-161`/`DW-162`/`DW-163`** (Story 2.2's, closed or terminal), **`DW-82`** and
**`DW-157`** (Story 6.7's), **`DW-136`** (re-owned to 2.1f and delivered). Any residual finding goes
in frontmatter `deferred:` for the lead's harvest -- **never written to `deferred-work.md` by this
stage** (Rule 15 (a)).

### Anti-vacuity discipline -- eleven found, none by a passing run

Every one of this epic's eleven vacuous assertions was caught by a deliberate falsification attempt.
Four traps apply directly here, each of which this epic has actually shipped:

1. **A switch make is not evidence that a body was struck.** A make already closed through a zone's
   2 mm margin off a *neighbouring* body's face. AC 1b is written specifically to catch that shape
   for the bank, at a release point the tree has already measured.
2. **A terminal state inferred from a make is not a capture.** That is `DW-155`'s second half
   exactly; AC 4 replaces the inference with the state a park actually writes.
3. **A mutation that makes something throw reddens the lookup, not the behaviour.** That is
   `DW-155`'s first half, and the four-ball sum throw is a live example that shadows the assertion
   under test. Every mutation below perturbs a **value** so the code still runs.
4. **Watch the frames.** The most recent vacuity dotted a physics-frame velocity against a
   table-frame offset, so a full sign inversion of the kick's y axis made all three cases pass
   *more strongly* -- and it had been added by a previous review pass specifically to close the
   "direction unproven" gap. `toPhysics()` negates y; every assertion here stays in one frame and
   asserts per axis.

Every floor is derived from its subject set (`DW-149`) -- the six targets from the `TABLE` registry,
the spinner's zone from `switchZones.filter(...)`, the release columns from the shot-case manifest --
never a second hand-typed list and never `|A|` compared against `|distinct(map(A, f))|`, which is a
theorem, not an assertion.

## Verification

**Commands (all with `BLENDER` exported in the shell only, never written to a tracked file --
`DW-46` / `DW-131`):**

- `export BLENDER="C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe"` -- shell only.
- `pnpm test` -- expected: at or above **93 files / 1490 passed / 0 failed** (the measured baseline,
  re-verified on this tree at `ebc2467`; ~78 s). No test deleted, skipped or weakened; record the
  actual numbers rather than carrying these forward.
- `pnpm check:ad7` -- expected: **exit 1**, output naming `AD-7`, `DW-70`, `bd_trough` and both
  `[true,true,true,true]` / `[true,true,true,false]` literals. **A green run is a regression to
  revert and log** (Story 2.5 owns `DW-70`).
- `pnpm check:corridor` -- expected: **exit 0**.
- `pnpm check:reachability` -- expected: **exit 0**; re-measure and record cases / reachable /
  unreachable / releases against **52 / 32 / 20 / 644** (~113 s), explaining every verdict that
  moved. The release count is the sweep's own recipe count and does **not** track the case manifest
  -- re-measure both, never derive one from the other. **Never edit an `unreachable` verdict.**
- `npx vitest run test/replay-goldens.test.ts` -- expected: all five green including every
  per-golden scenario block, the `DW-70`/`deviceSlots` `notes` literals, and the two-directional
  `PARITY_INERT` sweep (exactly `nudge-coupling` and `two-ball-collision`).
- `npx vitest run test/hardware-rule-seam.test.ts test/switch-zones.test.ts test/cabinet-switch-tracker-agreement.test.ts test/coil-enable.test.ts test/switch-max-speed.test.ts` -- expected: green with the extended manifests exercised.
- `npx vitest run test/lock-device-behaviour.test.ts test/machine-serve-drain.test.ts test/device-eject-pose.test.ts test/shot-routing.test.ts` -- expected: green.
- `npx vitest run test/drop-targets.test.ts test/spinner.test.ts test/pop-bumper.test.ts` -- expected: green.
- `npx vitest run test/port-provenance.test.ts test/story-2-0-rename-provenance.test.ts test/attributions.test.ts test/module-coverage.test.ts` -- expected: green; both new files declared in all four places and the total pin moved 107 -> 109.
- `pnpm typecheck` -- expected: all three projects clean. (`test/fixtures/**` is excluded from
  `tsconfig.node.json`, so harnesses have no compiler net -- check their imports by running them.)
- `pnpm lint:boundaries`, `pnpm check:headers`, `pnpm check:attributions` -- expected: exit 0 each.
  Stage new files (`git add`) before the header/attribution checks, which read `git ls-files`, then
  unstage.
- `pnpm build && pnpm check:dist && pnpm check:size` -- expected: exit 0 each (AD-17).
- `git diff --stat -- public/assets/` -- expected: **empty**. No geometry changes in this story;
  `assetHash` must not move.
- `git diff --stat -- test/replays/` -- expected: **non-empty** (the five refreshed headers), every
  change explained in `## Spec Change Log` and appended to each golden's own `notes`.
- `git grep -i "blender-5\|Program Files.*Blender" -- ':!tools/blender.mjs' ':!_bmad-output/'` --
  expected: **empty** (`DW-46`).

**Golden re-record procedure (there is no recording tool -- follow this exactly):**

1. **Trace before recording.** For each of the five, replay against the pre- and post-change tree
   with `onTick` sampling of every ball position (every 25 ticks across the whole run) and compare
   position by position. Only when all five are bit-identical is this a **header-only refresh**.
2. **Header-only refresh** rewrites exactly `header.tableHash` and `header.gameStart.tuning` (and
   `header.assetHash` only if geometry moved -- it must not here), leaves `transitions`,
   `coilPrologue`, `durationTicks`, `expectedHash` and `expectedGameStateHash` **byte-identical**,
   and appends -- never rewrites -- each golden's `notes`.
3. The instrument is a **throwaway, uncommitted Node harness** over the shipped surface:
   `runReplay(options)` (`src/sim/loop/replay.ts:301`), `buildHeader({ gameStart, physicsSeed,
   collisionDoc })` (`:192`), `tableHash()` (`:139`), `assetHash(doc)` (`:144`), `PHYSICS_VERSION`
   (`:161`). Serialize with `JSON.stringify(doc, null, 2) + '\n'` to keep the diff to the intended
   fields.
4. **If any trajectory genuinely moves**, the author's grant of 2026-09-02 (all five) applies with
   its condition unchanged: each traced correct *before* recording and each still asserting its own
   subject, with the reasoning written into its own `notes`. Weakening a threshold, adding a
   `PARITY_INERT` entry, deleting a `transitions` body or dropping a scenario assertion is **not**
   re-recording -- it is re-authoring, and it is a **HALT**. Note `nudge-coupling` lost its historic
   control role when its own hashes started moving; if this story moves them again, name a
   replacement control.
5. Expected risk profile, from the Code Map: `s_spinner` and `s_dragon_*` reach `rules.step` and are
   **ignored** by `src/sim/rules/devices.ts`, so neither can move `expectedGameStateHash`; a
   pass-through spinner applies no impulse, so it cannot move `expectedHash`. The one genuine
   trajectory risk is a golden whose ball **strikes a DRAGON target**, which now stops being a body
   mid-flight. That is what step 1 measures.

**Mutations (Rule 19 -- one named behavioural mutation per AC, written at plan time. Each is
applied, red observed at a named value, reverted, and the tree confirmed byte-identical via
`git status --short` and `git diff --stat`. Every one perturbs a VALUE so the code still runs and
the behaviour changes -- a mutation that makes something throw, or deletes a node so a lookup fails,
reddens the lookup and is NOT evidence):**

- **AC 1 (drop, latch, non-collidable).**
  `mutation: in src/sim/physics/drop-targets.ts, make the drop non-latching -- clear the down flag
  and re-enable the target's hit objects at the end of each tick instead of holding until reset ->
  the "stays down through further contact" test goes red naming the tick of the second
  drop_target_down and the second closed:true edge on s_dragon_r, while the first drop still
  happens exactly as before; revert.` Behavioural: the code runs identically and only the hold
  changes. Second, for the non-collidable half:
  `mutation: skip the setEnabled(false) call while still emitting the switch edge and the contact ->
  the collision test goes red naming the ball's measured rebound velocity off a target that is
  supposed to be gone, while every event assertion still passes -- proving the events and the
  collidability are asserted separately; revert.`
- **AC 1b (the strike, not the zone, causes the drop).**
  `mutation: replace the body-strike condition with the zone make alone -> the x = 228.9 case goes
  red naming s_dragon_d as closed and col_dragon_d as dropped when the measured strike was on
  col_dragon_r, while every one of the six per-letter cases still passes -- which is exactly why
  the per-letter cases alone are not sufficient evidence; revert.`
- **AC 2 (bank reset).**
  `mutation: emit the six closed:false edges unconditionally rather than only for targets that were
  down -> the "reset with nothing down" case goes red naming six spurious edges against the expected
  zero, while the reset-after-a-drop case still passes; revert.` Second, the ordering:
  `mutation: move the reset from PRE_STEP_HARDWARE_RULES to after physics.step() -> the
  same-tick-collidable test goes red naming the tick on which a ball passes through a target the
  reset had already raised, and test/hardware-rule-seam.test.ts goes red on the ordering scan;
  revert.`
- **AC 3 (spin, per-revolution closure, decay).**
  `mutation: set the spinner's decay to zero so it never slows -> the strictly-increasing-interval
  assertion goes red naming the first two equal intervals, and the finite-count assertion goes red
  naming the closure count at the tick budget, while the first closure and the free-running closures
  with no ball present both still happen; revert.` Second, the observable that cannot be forged:
  `mutation: gate every closure on a ball being inside sw_spinner this tick -> the "closure with no
  ball in the zone" assertion goes red naming the tick and the measured swept-segment result, while
  the per-crossing count assertion may still pass -- which is why both are asserted; revert.`
- **AC 3b (faster ball, more closures).**
  `mutation: clamp the entry-speed-to-angular-velocity gain to a constant, ignoring the ball's
  speed -> the ordering assertion goes red naming both launch speeds and their now-equal closure
  counts, while every single-drive assertion still passes; revert.`
- **AC 4 (the Lock captures, and the gate reads it).**
  `mutation: in src/sim/physics/devices.ts:529, set the slot true but skip physics.removeBall() ->
  the capture test goes red naming machine.balls.length as unchanged on the tick the bd_lock hit
  contact fired, while s_lock_1 still closes and terminal is still 'locked' -- demonstrating that
  the new assertion reads the capture and the old one could not; revert.` This mutation is the
  direct demonstration that `DW-155`'s second finding is fixed.
- **AC 5 (Mouth, twice).**
  `mutation: in devices.ts:380-384, take lastIndexOf(true) once and cache it across pulses so the
  second pulse re-ejects the same slot -> the two-pulse test goes red naming the slot index and the
  ball id repeated, while the single-pulse test still passes; revert.`
- **AC 6 (over capacity).**
  `mutation: revert the per-entry overflow latch to the per-tick emission -> the AC 6 test goes red
  naming the measured event count (315 today) against the expected 1, while "parks nothing" and
  "stays simulated" both still pass; revert.`
- **AC 7 (`DW-134`).**
  `mutation: widen sw_lock_lane's y span north in an ISOLATED COPY of the committed collision
  document (never in the worktree) so the descending columns re-enter it -> the absence test goes
  red naming the column and the tick s_lock_lane closed, while the lock-lane-long control still
  captures -- proving the assertion can fail and is not vacuous on an empty subject set; revert and
  confirm the committed document is byte-identical.`
- **AC 8 (`DW-160`).**
  `mutation: set TUNING.hardware.popKickMmPerS to a value inside the measured re-strand band
  (>= 221) -> test/pop-bumper.test.ts's DW-148 clearance test goes red naming the trailing-window
  progress against the 15 mm floor and the ball's resting position near (93, 840) -- the DIFFERENT
  equilibrium, not the original (130.00, 833.55) apex; revert.` Note the ceiling pin at `:524`
  asserts the bug reproducing, so it is the floor pin at `:519` that carries this mutation.
- **AC 9 (Integration at `FrameOutput`).**
  `mutation: in src/sim/loop/index.ts, restore the hard-coded mechanisms.dropTargets = {} while
  leaving the contact events flowing -> the integration test goes red naming the empty map against
  the expected down target, while the contactEvents half still passes -- proving the two halves are
  asserted independently; revert.`
- **AC 10 (baselines).** Not mutation-bearing: it is the regression envelope, verified by the
  commands above and by recording each measured number rather than carrying one forward.

**Manual checks:**

- Confirm `git diff public/assets/dragonwar.collision.json` and `git diff public/assets/dragonwar.glb`
  are both **empty** -- this story changes no geometry and must not re-export.
- Confirm each golden's `notes` was **appended to**, not rewritten, and still contains `DW-70` and
  `deviceSlots`.
- Confirm every mutation above was actually applied and reverted, with `git status --short` and
  `git diff --stat` clean afterwards, and record the observed red for each next to its test in this
  section.

## Auto Run Result

Status: ready-for-dev
Blocking condition: none
