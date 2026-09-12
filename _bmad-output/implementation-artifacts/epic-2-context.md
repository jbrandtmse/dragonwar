# Epic 2 Context: A Complete Game on the Real Shot Map

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 2 makes a stranger able to play a full 1–4 player game with no instructions: the real playfield
geometry drawn from reference dimensions, every device and shot with switches reliable at any ball
speed, start and Hot seat, plunge and Skill shot, ball save, end-of-ball bonus, lane change, tilt
warnings, Tilt and Slam tilt, ball search, Match, and game over back to a minimal Attract — all read
off a DMD Backglass and inserts lit in the held colour grammar. Geometry is the first story and
iterates with the rules. Nineteen of the twenty stories are done, the game's closing sequence
(Match, game over, return to Attract) among them; what remains is the chartered correction to how
the skill shot's lit Top lane moves.

## Stories

- Story 2.0: Epic 1 Deferred Cleanup *(done)*
- Story 2.1a: The drain triangle, the cradle pocket and the flipper's real dimensions *(done)*
- Story 2.1b: The full shot map and the switch set *(done)*
- Story 2.1c: The Loop returns and the inlane feed *(done)*
- Story 2.1d: Device behaviour and guide terminations *(done)*
- Story 2.1e: Every shot case proves its own start point is reachable *(done)*
- Story 2.1f: The bottom-right corridor — the Ramp and the DRAGON bank made reachable *(done)*
- Story 2.2: Slingshots and pop bumpers as hardware rules *(done)*
- Story 2.3: Drop targets, the spinner and the Lock in physics *(done)*
- Story 2.4: The devices-and-shots layer *(done)*
- Story 2.5: Start, Hot seat and the ball lifecycle *(done)*
- Story 2.6: The DMD Backglass *(done)*
- Story 2.7: Plunge, Skill shot and lane change *(done)*
- Story 2.8: Inserts in the held colour grammar *(done)*
- Story 2.9: Ball save *(done)*
- Story 2.10: End-of-ball bonus and the multiplier *(done)*
- Story 2.11: Tilt warnings, Tilt and Slam tilt *(done)*
- Story 2.12: Ball search *(done)*
- Story 2.13: Match, game over and return to Attract *(done)*
- Story 2.14: The lit Top lane — rotation, and when it may move *(backlog — next, and last in the epic)*

## Requirements & Constraints

**The lit Top lane — the only requirement still open.** The lit Top lane advances one position
through the declared lane order each plunge, wrapping, rather than being drawn afresh, so the same
lane is never lit on consecutive balls and a three-ball repeat is impossible **by construction** —
which is what the PRD's "rotating each plunge" describes. The *starting* position is still drawn
once per game from the seeded PRNG and then advanced: that is the recorded decision, and it is what
keeps the seed observable instead of making every machine play an identical lane sequence for ever.
The not-all-same property must be pinned for *every* starting position rather than for the one seed
a test picks for itself, and freezing the advance must redden that pin. The existing mutation-proven
evidence that the seed reaches the RNG and changes something observable is rewritten onto the new
mechanism, or deliberately retired with its replacement named — never silently deleted, and never
left asserting a lane the rotation now fixes. Ratified text still describing the superseded random
draw is amended in the same commit, with the reasoning recorded.

**Closing the game.** When the last ball of the last player ends the machine enters a game-over
phase, the Backglass shows final scores by player, and a payload-complete game-ended event carrying
the scores fires. The event fires on the drain tick; the final scores appear only when the last
ball's end-of-ball hold releases, so the bonus count-up is never cut short.

**The Match.** A multiple of ten from 00 to 90 is drawn from the game's seeded PRNG in a single
step, with the configured probability of matching at least one player's last two score digits. A
payload-complete match-drawn event carries the number and the winners; the Backglass reveals the
number paced by step events; a win shows MATCH and is display-only under free play, since credits
are deferred. The probability is a player-adjustable sim setting — a fraction defaulting to 0.08,
deliberately conventional rather than sourced, and marked unverified.

**Leaving game over.** A configured Attract delay, or a Start press, moves the machine into Attract
or starts a new game. Hardware is disabled, the mode stack is empty, and the player list is cleared
on the next Start. Attract cycles the last scores and shows the flipper, plunge and Start keys once
from the host-supplied bindings view. The Walk-up camera sequence, high-score entry, and Match
flashers and audio belong to later epics and must not be pre-built here.

**One ball in play, always.** Before serving — on Start from Attract and at every ball start — the
ball controller clears strays itself. A ball already resting in the shooter lane *is* the ball being
served: no trough eject, so nothing stacks in an occupied lane. A loose ball outside every device is
removed through the recover path. Exactly one ball is in play after the serve, never two. This
closes two strays: a voided game's ball left loose by a Slam tilt, whose later drain would otherwise
end the new game's ball 1, and a ball left in the lane by a search pass cancelled after its serve.

**No hang, no ball loss.** A recovered ball is returned to the trough rather than destroyed, and the
slot it lands in reports closed, so the four-ball invariant survives any number of recoveries, the
rules' device counts never drift from physics, and the serve can never answer with an eject failure
that leaves a ball unable to drain (see Technical Decisions).

**Lifecycle hygiene.** No display schedule armed by a finished game — the bonus count-up in
particular — may animate into the next game.

**Backglass legibility.** The score screen has no combined line budget of its own, so the ball
number shares a shortened status line rather than taking a row, which keeps four players plus an
active mode on the panel. The display must also identify *which* player a score belongs to: the
current player's row is rendered emphasised, and the pinning evidence must be that the rendered dots
differ between an emphasised and an unemphasised row — never merely that a field was set.

**Determinism and language.** The rules layer runs headless as a pure function of switch events, and
identical inputs replay identically. English only; display literals live in the backglass
presentation code alone and rules never format text.

## Technical Decisions

**Layering and gates (AD-1, AD-16).** `sim/**` is DOM-free and Babylon-free; rules and physics never
import each other; presentation reads frame output and never calls into either. Device-name string
literals outside the single table registry and the test tree are lint errors — derive names
structurally. Three complementary provenance gates (header presence, structural port provenance,
import boundaries) each stand alone; none may be retired in favour of another.

**Clock, randomness and tunables (AD-3, AD-15).** One tick constant is the only time inside `sim/`.
Every rules timer — the Match delay, the Match reveal and the Attract delay included — is authored
in ms in the tunables file, converted to ticks once at load, and drives presentation by emitting step
events; presentation animates to them and never reports completion. A `…Ms` tunable that resolves to
exactly 0 is reachable through the dev tuning panel, so arithmetic that assumes a positive interval
must clamp. All rules randomness draws from the seeded PRNG in game state, which now has **two**
consumers: the lit-lane draw at each ball start and the Match draw once at game end. The PRNG's own
value is part of the hashed state, so a change in how many steps a game consumes is hash-visible on
its own *and* moves a given seed's Match number. The Match tunable is **`matchProbability`**, a
fraction defaulting to 0.08; `matchPercent` appears in no live planning artifact, and the shipped
adjustments contract was deliberately not renamed because 0.08 and 8 % are the same odds while a
rename would move five golden headers for no behaviour change. Every tunable carries `source` and
`confidence`, and both are part of the hashed contract: even a prose-only provenance correction
invalidates all five replay goldens, so budget a header re-record with it.

**Loop contract (AD-4).** Commands issued at tick *t* are consumed by physics at *t+1*, so a coil or
recover command takes effect on the next tick. `rules.step` takes an optional fourth argument, the
machine report: physics' recovered count and its device failure events (eject failure, device
overflow), so ball accounting can be reconciled and device failures answered as events rather than
thrown.

**Hardware enable (AD-5).** Tilt, game over, and an Attract *entered from a game* disable the
flippers, slingshots and pop bumpers together, all through one shared enter-Attract path that the
Slam route also uses. The **boot** Attract deliberately ships with every coil enabled, and two
replay goldens flip in exactly that Attract, so their trajectories depend on it — darkening boot is
a golden re-record and the author's grant to give, not a tidy-up. The manual plunger shares the
autolauncher's serving coil, which is outside the disable set by design and therefore stays live in
game over and Attract; never disable it, or a search pulse and a player's own plunge are both
swallowed.

**Balls and devices (AD-6).** The machine carries four balls, asserted by name at construction; boot
occupancy is a declared property of each device. Trough and Lock are parking devices (park into the
lowest empty slot, remove from simulation, close that slot's switch; eject the highest filled slot,
one ball per pulse, at the authored pose); the shooter lane is non-parking, the served ball staying
simulated on the plunger tip. Device counts are the number of closed slot switches and nothing else.
Overflow is answered with an immediate eject *except* at the Lock until Story 3.2. The opening of the
shooter-lane switch is the one event meaning "plunged"; the ball-save window is armed only by a
player plunge inside a game, never by a save's own re-serve. Balls-in-play counts balls launched and
not yet arrived at any ball device.

**Recover, as amended and now shipped.** `recover()` parks each ball it removes into the trough's
lowest empty slot and closes that slot's switch, exactly as a parking entry does, instead of
despawning it. The close edge is queued by physics and ordered *ahead* of any same-tick eject's own
open edge — on a trough with one slot free the parked and the ejected slot can be the same slot, and
the wrong order leaves it stuck reading closed while physics reads one ball fewer. The previous
despawn behaviour lost a ball per recovery and, once the trough emptied, produced a hard hang in
which no ball could drain. Both issuers — ball search's final stage and the serve path's stray clear
— share this one call, so the fix closed the hang for ball search too. The requirements inventory,
the solution design and the spine all now carry this wording; no live artifact still says "despawn".
The stray clear reports through the machine report on the tick *after* the ball start, emits its
ball-missing event only when the count is above zero, and never serves — the serve decision was
already taken on the start tick from the shooter lane's own slot. That pending report is snapshotted
where it is armed rather than read live at the end of the tick, because a same-tick Slam-plus-Start
can otherwise re-point it at a second ball start and leak a spurious ball-missing plus a second
eject. Within one physics step recover runs before commands are applied, and a ball resting on the
plunger tip counts as inside the shooter lane, so the ball being served is spared.

**State (AD-7).** One plain-data, JSON-serializable tree with fixed ownership scopes — machine facts
under `machine`, per-player facts under `players[i]`, mode-local facts under `modes[i]` published only
as a typed mode view — mutated only inside `rules.step`. The mode stack is empty between balls; the
will-start event resets ball save, tilt and multiball; the starting event enables hardware. Rules
controllers legitimately hold tick-scoped state in factory closures *outside* the tree, because the
machine scope is serialized into every golden's state hash; re-derive that inventory from the
`create*()` factories rather than trusting any written list. Any new latch (a Match reveal schedule,
an Attract timer) must be reproducible from tick 0 and either bounded or restart-safe. The tree is
**not** a mid-game resume point, and moving closure state into it re-records golden state hashes and
needs the author's grant.

**Commands and events (AD-9).** A closed union: coil commands and the recover command to physics;
lamp, GI, flasher and show commands to presentation. Recover has exactly two sanctioned issuers —
ball search's final stage and the ball controller's stray clear before a serve. Lamp state is a pure
projection computed every step, expressing only role plus step 0–3 and never a colour or a cadence.
Every semantic event is payload-complete, because a frame carries N steps and presentation must never
join a tick-*t* event to a later snapshot.

**Modes (AD-8).** Epic 2 ships a minimal stack (base plus skill shot) that starts and stops modes
directly. The base mode owns lane state and the skill-shot mode reads the lit lane live rather than
caching a lane of its own — the composition tests pin exactly that. The four-phase lifecycle events
and the priority registry are Story 3.1's; omitting them is conforming until that story lands.

**Devices layer (AD-19).** It is the only consumer of raw switch events and emits device and shot
events, which modes, scoring and the ball controller consume. The derived playfield-closure set is
computed by subtraction from the table registry — buttons, tilt bob and slam, parking slots and each
non-parking entry switch are excluded. Tilt-bob and slam closures have their own events and must
never count as the skill shot's first playfield closure. The drop-bank component alone pulses the
bank reset coil.

**Single arbiters (AD-18).** Only the ball controller pulses the trough eject and autolaunch coils
and mutates balls-in-play. Nothing may pulse the Mouth until Story 3.2 builds the Lock arbiter, since
nothing before it can satisfy the Mouth-open lead. "A multiball is running" is the machine flag, never
derived from balls-in-play.

**Persistence (AD-14).** Sim adjustments — pitch, tilt warning count, balls per game, Match
probability — layer table defaults under player overrides and apply at the *next* game. One bundle
(seed, tuning, adjustments, high scores) is the only thing handed into the sim at game start; high
scores are read-only inside `sim/`, and the host persists on the high-score-entered event and nothing
else.

**Geometry and assets (AD-10, AD-11).** Relevant to the geometry stories, all complete: one canonical
table frame in millimetres with three sanctioned conversions, geometry authored unpitched with pitch
applied as gravity and as a root rotation, Blender owning every position and mesh, the table registry
owning devices, wiring, groups and tunables, and the export script enforcing node prefixes and
properties against the registry.

## UX & Interaction Patterns

- The Backglass is a 128×32, 1-bit DMD driven by a closed union of screens; the game-over /
  final-scores screen and the Attract keys screen are members of it.
- The line budget is the live constraint: the ball number rides a shared status line, and a mode's
  optional fields drop before its whole block does. The tilt screens sidestep this by replacing the
  panel wholesale.
- Assertions about a rendered row take a differential band from the row's own declared coordinate —
  non-empty where the row should appear, empty on a control frame. A whole-buffer "some dot is lit"
  check proves nothing.
- An end-of-ball or game-over screen names its player from the event payload, never from the
  advanced snapshot.
- Claims only a rendered frame can settle need a real-browser smoke by the lead; the headless engine
  rasterises nothing, so a green suite cannot see a pixel-level defect.
- The colour grammar is fixed: rules emit a role and a step, presentation owns RGB, intensity and
  blink cadence. Each flipper press moves the lit insert one position, wrapping, and lane change
  matters *before* the plunge, not during flight — an unlit Top lane taken first is a miss, not a
  skip.

## Cross-Story Dependencies

- **Story 2.13 is closed, and carried its five ledger items to done:** the score-screen line budget,
  the player-identifying row emphasis, the bonus count-up lifecycle reset, the stray-ball clear
  before every serve, and the recovered-ball replenishment — the last of these in both halves, the
  park *and* the slot-switch edge. Its Attract entry is one exported helper that the Slam path now
  reuses, so there is no second game-over-to-Attract route left to reconcile.
- **Story 2.14's prerequisite is Story 2.7** (done): the skill shot, the lit lane and lane change.
  2.14 reshapes the *first* consumer of the game RNG, and the Match — shipped by 2.13 — is now the
  live second one, so how many steps a game draws before the Match is observable in the Match number
  as well as in the hashed PRNG value. Measured at 2.13's close: no replay golden ever starts a game
  and all five end with the PRNG unadvanced, so this change cannot redden a golden today — landing
  it before Epic 3 re-records the goldens through the rules layer is strictly cheaper.
- **Story 2.14 should carry the coupled open question** — whether the paying lane freezes at launch
  — into the same pass rather than edit the same composition tests twice. It sits on the author's
  decision sheet and is not the story's to settle unilaterally.
- Two ordering hazards of one shape were found independently in the ball controller's Story-2.13
  closure state (a value read later in the step than a same-tick write that can precede it). The
  other pre-existing closure fields have not been swept for that pattern; that sweep is the standing
  follow-up recommendation for whichever story or burn-down takes it.
- **Routed elsewhere — do not pre-build:** the Lock arbiter, the Mouth-open lead and the Lock
  overflow eject (Story 3.2); the four-phase mode lifecycle and the priority registry (Story 3.1);
  multiball drain, arming, and the recover-versus-own-launch case (Story 3.7); flashers and audio
  cues for Tilt and Match (Epic 4); the Walk-up camera (Story 4.6); high-score entry and the
  Settings panel (Epic 6).
- No stage may settle an item sitting on the author's decision sheet; fence those in each spec's
  prohibitions section rather than deciding them in flight.
