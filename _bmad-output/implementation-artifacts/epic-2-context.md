# Epic 2 Context: A Complete Game on the Real Shot Map

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 2 turns Epic 1's placeholder vertical slice into a complete, playable machine. The real playfield geometry is drawn in the Blender source for the first time — the drain triangle, both Loops, the Ramp, the Dragon with the Lock lane between its legs, the DRAGON drop bank, Top lanes, slings and pops — and every device on it is wired into `TABLE` with a switch that registers reliably at the fastest speed the physics core can produce. On top of that geometry sits the whole standard game: Start and Hot seat for one to four players, the ball lifecycle, plunge and Skill shot, lane change, ball save, end-of-ball bonus and multiplier, tilt warnings, Tilt and Slam tilt, ball search, Match, game over and a return to a minimal Attract — all readable from a DMD Backglass with the inserts lit in the table's fixed colour grammar. The acceptance bar is a stranger playing a full game with no instructions. Geometry comes first and iterates with the rules that land on it.

## Stories

- Story 2.0: Epic 1 Deferred Cleanup — the provenance gate's rename and owner
- Story 2.1a: The drain triangle, the cradle pocket and the flipper's real dimensions
- Story 2.1b: The full shot map and the switch set
- Story 2.2: Slingshots and pop bumpers as hardware rules
- Story 2.3: Drop targets, the spinner and the Lock in physics
- Story 2.4: The devices-and-shots layer
- Story 2.5: Start, Hot seat and the ball lifecycle
- Story 2.6: The DMD Backglass
- Story 2.7: Plunge, Skill shot and lane change
- Story 2.8: Inserts in the held colour grammar
- Story 2.9: Ball save
- Story 2.10: End-of-ball bonus and the multiplier
- Story 2.11: Tilt warnings, Tilt and Slam tilt
- Story 2.12: Ball search
- Story 2.13: Match, game over and return to Attract

Story 2.1 was split into **2.1a** and **2.1b** as a partition — every acceptance criterion carried over verbatim and in order — and both land before Story 2.2. Any artifact that refers to "Story 2.1" is talking about the cradle and `DW-72`, which live in 2.1a.

## Requirements & Constraints

- **Every shot's miss must come back playable (Lawlor's test), verified per shot.** A per-shot entry lands in the feel-test log for each of the seven shots recording where the most common miss goes; none may be a centre drain, and any shot that fails is re-drawn before its story closes. Running that ritual needs the author at the Reference machine — it is human-owned work the pipeline cannot close on its own, the same class as Epic 1's feel ritual.
- **Switches register at maximum ball speed or the geometry is wrong.** Zone tests use the ball's per-tick swept segment, never its end position, and a test asserts no pass through a rollover, the bank, the Lock lane or the drain is missed by the fastest ball a full plunge and flipper hit can produce.
- **Geometry is drawn from the reference dimensions alone** — flipper tip gap, outlane widths and post positions first, then Loop entries and exits that feed straight toward the flippers, Ramp height and return side, the off-centre Dragon and the Lock lane beneath it. Guides end at rubber posts, never bare metal. Figures that cannot be measured ship marked `unverified`.
- **Two open questions are answered here and their answers recorded in a decisions document**: whether the Lock lane carries both lock and mode start (the fallback is a separate scoop and ball device, a table-and-geometry change only), and the Ramp's return inlane.
- **A cradle must be possible for a full 5 simulated seconds.** Epic 1 could only bound its ball-on-bat claim to 1 second because there was no geometry beside either flipper to form a pocket; the pocket is authored in 2.1a and the bound is widened back there, on measured evidence rather than inspection.
- **Per-player facts stay per player in Hot seat** — score, DRAGON letters, Lock credits, modes played, tilt warnings, bonus and multiplier, extra balls, lit lanes. One player's letters or tilt warnings must never appear on another's ball.
- **Ball save has a precise shape**: enabled at launch, its timer starting on the launch event and not on enable; a hurry-up display state before expiry; a grace period past the *displayed* expiry during which a drain still saves; saved balls auto-launch; multiple arming sources stack with the longest live window winning; Tilt disarms all.
- **Tilt keeps the score and forfeits the bonus.** Warnings are spaced by a semantic window and the bob is never reset by command — its physical decay plus a settle window is the settle. On Tilt, flippers, slings, pops and autolaunch are disabled together and the ball ends when the last ball in play drains. Slam tilt ends every player's game and returns the machine to Attract, and lives inside the replay.
- **Ball search never releases locked balls while a mode timer is running**, escalates through each device's declared order, and only at its final stage issues the one command that lets physics despawn balls outside a device.
- **Match draws a multiple of ten from the seeded rules PRNG** at the configured probability and is display-only under free play.
- **English literals live in the Backglass and nowhere else** in the simulation. Rules never format text.
- **`pnpm check:ad7` is deliberately red.** It is a recorded ledger entry routed to **Story 2.5** as that story's own deliverable — device slot state must come to be derived inside the ball controller rather than written after the rules step, and the test that currently asserts the failure exists is updated in the same change. No earlier story should touch it, and it is not a defect to repair on sight.
- **Provenance is a hard gate** and the attribution entry lands before the file does. A Bally playfield template would be the highest-value geometry input and needs a verified licence and an attribution entry first; the geometry can be drawn from reference dimensions without one.
- Epic 1's merge baseline for the suite is **76 files, 950 passing, 21 skipped**. A change to the tick rate or any solver constant is a physics-version bump that re-records every golden.

## Technical Decisions

- **The devices-and-shots layer is the only consumer of switch events.** Nothing else under the rules tree may import one; the build fails if it does. That layer owns the drop bank (letters and the reset coil, pulsed on ball start and on bank completion), the spinner count, ball-device slots, the shooter lane and the declared shots, and emits only device events — shot made and broken, ramp made, target down with its letter, bank completed, dragon hit, lock lane entered, spinner spins, lane entered, lane change pressed, ball launched, device ball entered and left, button pressed — each payload-complete. Lane *state* belongs to the base mode; the layer reports entries and presses only.
- **Shots are declared data, not code.** Each is an ordered switch sequence in the table registry with a tick window converted from a millisecond tunable. In order inside the window emits made; a broken sequence or an expired window emits broken; a Loop taken the wrong way emits nothing.
- **Hardware rules run inside the physics step.** Slingshots and pop bumpers join the flippers and plunger: switch closes at tick *t*, coil energises inside tick *t*'s own physics step with no rules round trip, each gated only by coil enable/disable. Disabled, they act as passive rubber and emit no actuation. Every actuation emits a contact event to presentation so each mechanical sound has exactly one source; rules never receive a contact event.
- **Physics owns ball bodies and mechanical state; rules own accounting.** The Lock is a parking device (capacity three, ejecting from the highest filled slot at the Mouth pose, one ball per pulse); the shooter lane is non-parking with the served ball resting simulated on the plunger tip. Device counts in game state are the number of closed slot switches and nothing else; a slot beyond capacity surfaces as an overflow event that rules answer with an immediate eject. A dropped target is non-collidable until the bank reset coil raises it; the spinner spins from contact and closes once per revolution until it decays.
- **Game state is one plain-data tree with fixed ownership scopes** — JSON-serializable, no class instances or closures, mutated only inside the rules step, with player-scoped, machine-scoped and mode-local facts strictly separated. The mode stack is empty between balls: every active mode receives its will-stop before the ball-ended event; ball-will-start resets ball save, tilt and multiball; ball-starting enables hardware.
- **Single arbiters for the overloaded seams.** The ball controller alone pulses the trough and autolaunch coils and alone mutates balls-in-play; ball save is one machine device it owns, armed and disarmed by source through a rules-internal interface; the Lock arbiter is the only consumer of lock-lane entries. "A multiball is running" is a flag set and cleared in mode lifecycle phases, never derived from balls in play.
- **The command union is closed.** Rules to physics: coil pulse/enable/disable, plus the recover command for ball search alone. Rules to presentation: lamp, GI, flasher and show commands, nothing else.
- **Lamp state is a pure projection**, recomputed from state every step; the loop emits only the diff. No mode ever issues a lamp command. Roles are a closed union and steps are 0 to 3; no RGB, hex or colour name may appear anywhere in the simulation, and one presentation-side table is the sole role-to-colour mapping.
- **One clock, no wall-clock or unseeded randomness in the simulation.** Every timer is authored in milliseconds in the tuning file, converted to ticks once at load, and paces presentation by emitting step events that presentation animates to — presentation never reports completion. All rules randomness draws from the seeded PRNG in game state, so the Skill-shot lane and the Match number replay identically.
- **Modes have unique numeric priorities** — base 100, skill shot 200 — and speak the four-phase start and stop convention. Epic 2 runs a minimal stack; the rest arrive in Epic 3.
- **Blender owns placement, the table registry owns wiring, and the export script is the contract's enforcer.** Node prefixes are load-bearing: collision scaffolding, switch zones, visuals, insert lens-and-cup geometry, mechanisms named as their device. The export validates the source against a dump of the registry and writes both the render asset and a collision file in table-frame millimetres; the simulation never parses the render asset, and both loaders fail fast on a missing node or unknown property.
- **Layering is law and is linted.** Device-name string literals outside the table file and the test tree are errors, so every new switch, coil, lamp and device name enters through the registry. Three complementary provenance gates exist and none may be retired in favour of another: a per-file **presence** check across tracked files, a **structural** provenance test (the upstream copyright block intact, the provenance sets disjoint, the solver-constant pin and the port-body freeze), and the **import** linter. Presence cannot detect a stripped copyright block; Story 2.0 is the structural gate's documented owner.
- **Tunables carry a source and a confidence.** Material parameters are named entries with scatter at zero. Scoring values stay adjustable through Epic 2 — they freeze only after Epic 3's first full playtest.

## UX & Interaction Patterns

- **One fixed authored camera, no camera controls.** Both flippers, the Dragon, both Loops, the Ramp and the DRAGON bank must all be legible from it, with the Backglass occupying a strip at the top of the view.
- **The Backglass is a low-resolution dot-matrix display** — a visible dot grid, no smoothing — showing every player's score, the current player highlighted, and the ball number, plus the highest-priority mode's name and whichever published fields it carries, converted to display units in presentation.
- **Presentation never joins a tick-*t* event to a later snapshot.** When an end-of-ball screen names a player, it names the one in the event payload, never the one the snapshot has already advanced to.
- **The colour grammar is fixed and never varies**: white for a lit or qualifying shot, orange for DRAGON letters and the Lock, red for Hurry-up, green for Quick multiball, blue for Joust, purple for extra ball and special. Progression within a mode's colour is a brightness and blink ladder expressed as the step value; blink cadence is timed by presentation.
- **Flipper buttons move the lit insert** one position per press across the Top lanes and across the inlane/outlane set, wrapping.
- **Attract in this epic is minimal**: the Backglass cycles the last game's scores with a start prompt and shows the flipper, plunge and Start keys once from the view configuration. The camera walk-up sequence belongs to Epic 4.

## Cross-Story Dependencies

- **Story 2.0 is the epic's opening gate** and is bounded to renaming the structural provenance test, giving it a documented owner and reconciling it with the architecture decision that was rewritten alongside it. It adds no product behaviour.
- **2.1a then 2.1b, both before 2.2.** 2.1a authors the drain triangle, the cradle pocket and the bat's real collision dimensions and proves the 5-second hold; 2.1b draws the rest of the shot map on that proved geometry, completes the switch and coil declarations, and answers the two open geometry questions. Every later story in the epic lands on shots and switches these two declare.
- **2.3 (physics devices) precedes 2.4 (the devices-and-shots layer), which precedes every rules story.** 2.5, 2.7, 2.9, 2.10, 2.11, 2.12 and 2.13 all consume device and shot events and must never reach for a raw switch.
- **Story 2.5 owns the real ball lifecycle** and is where Epic 1's dev-only coil escape hatch is replaced: each golden replay's declared coil prologue is removed and the goldens are re-recorded. It also carries the device-slot ownership fix that the currently-red architecture check is waiting on.
- **2.6 (Backglass) consumes what 2.5 establishes**; 2.8 (inserts) consumes the lamp projection over state that 2.5 and 2.7 populate.
- **Epic 2 must not pre-build Epic 3's modes** beyond the base and skill-shot modes, nor Epic 4's audio, flashers, GI, walk-up or baked lighting, nor Epic 6's persistence, settings panel, high-score table or platform gate. The Dragon's mouth show and hit reaction are Epic 3's; the art passes that replace the placeholder primitives behind the same node contract are Epic 5's.
- **Inherited from Epic 1:** contracts, the table registry, tuning, boundary lint, the export pipeline and both loaders, the fixed-step conductor with trough serve and drain, tick-stamped input, the ported flipper mover and hold-to-charge plunge, the cabinet oscillator, tilt bob and slam counter as sensors closing switches inside physics, five golden replays with CI parity, and the dev tuning panel. The rules that consume the bob and slam sensor are this epic's work.
