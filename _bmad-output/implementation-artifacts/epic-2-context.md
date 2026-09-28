# Epic 2 Context: A Complete Game on the Real Shot Map

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 2 makes a stranger able to play a full 1–4 player game with no instructions: the real playfield
geometry drawn from reference dimensions, every device and shot with switches reliable at any ball
speed, start and Hot seat, plunge and Skill shot, ball save, end-of-ball bonus, lane change, tilt
warnings, Tilt and Slam tilt, ball search, Match, and game over back to a minimal Attract — all read
off a DMD Backglass and inserts lit in the held colour grammar. Geometry was the first story and
iterated with the rules. **All twenty of the epic's original stories are now done**, the lit Top
lane's rotation among them. What remains is the one story chartered afterwards: Story 2.15, the
burn-down that closes or consciously retires the deferred work this epic accumulated, so the
ledger's open count means something before Epic 3 starts.

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
- Story 2.14: The lit Top lane — rotation, and when it may move *(done)*
- Story 2.15: Epic 2 burn-down *(backlog — next, and last in the epic)*

## Requirements & Constraints

**The burn-down, and what closing an entry means.** Ten ledger entries are the acceptance bullets.
Each is either resolved with cited evidence — a test, a commit, a measurement — or made terminal
with a stated reason, until the ledger's burn-down slice reads empty of `routed` and `open` entries.
Falsifiability, not coverage, is the bar: where an entry names a missing or vacuous check, the
replacement's breaking mutation must be named, applied, observed red and reverted. This epic
recorded 70 vacuities, and a burn-down that adds unfalsifiable checks has made the problem worse.
The charter deliberately holds no `escalated` and no `decision-pending` entry, because a burn-down
story cannot ratify a product call; an entry that turns out to need one is raised, not guessed.

**What the ten are about**, in four shapes:

- *Geometry gates that do not bind.* A bevel with no test that would catch its removal or reversal;
  three turn constants that never got the dimensional gate every sibling figure has; a descending
  strand column that no longer touches the body whose cap it was meant to pin, measured missing it
  by tens of millimetres; and 14 of 39 shot cases with no reachability witness, where the harness
  cannot yet distinguish "genuinely unreachable" from "the witness search is too narrow" (the
  reviewer's judgement on that one: two root causes, a criterion mismatch for the synthetic drop
  columns and unsearched origin axes — and those columns are to be redirected onto the body they
  probe, not exempted).
- *Anti-vacuity floors that lag their own subject sets.* Every floor in the reachability and
  termination gates is a hand-typed literal; three sit below their own subject count today, so they
  no longer bind, and the same drift has recurred across several stories. The fix is to derive each
  floor from its own collection or assert it equal to a named constant, not to retype it higher.
- *A Fix Pack that executed nothing.* An iteration-3 review pack was bundled into a rework the
  author then narrowly scoped, so none of it ran and its items live in no artifact any gate reads;
  the instances were re-verified present at HEAD.
- *Three measured residuals.* A tunable's provenance `source` string cites a measurement its own doc
  comment retracts, and the retracted claim is frozen verbatim in all five committed goldens, so
  correcting it costs a header-only golden refresh. A nested-vitest test runs ~103–118 s against its
  own 120 s budget and is killed under full-suite load — it is the test that proves the zero-skipped
  claim every stage reports against, so its flake degrades the whole suite's evidentiary value, and
  the fix is a measured budget, not a retry. And the bonus count-up still fires a step due on the
  exact Start tick, because the drain at the top of `step()` runs before the new-game clear.
  A tenth entry's filed premise was corrected at the gate: the tick rate is ratified, not
  provisional, so its live residual is a stale source comment rather than a pending rate change.

**The goldens are the hard boundary of this story.** `test/replays/**` stays byte-unchanged unless an
entry's own fix requires a re-record — which is a Block-If needing the author's explicit grant. Note
the tension the burn-down must surface rather than resolve quietly: one entry's cheapest correct fix
is exactly such a refresh.

**The lit Top lane, as shipped.** The starting position is drawn once per game from the seeded PRNG
at the game's *first* ball start, and the lit lane then advances one position through the declared
Top order per **the player's own ball number**, wrapping — so the same lane is never lit on two
consecutive balls and a three-ball repeat is impossible by construction, which is what "rotating
each plunge" describes. Player-scoped advance is what makes it correct under Hot seat. The starting
position lives in the skill-shot factory's closure, deliberately *not* in the state tree, because
the tree is hashed into every golden and the value is reproducible from the seed. The not-all-same
property is pinned for every starting position rather than for one seed a test picks itself, and
the seed-reaches-the-RNG evidence was rewritten onto the new mechanism rather than deleted.

**The game's closing sequence, as shipped.** The last ball of the last player enters a game-over
phase; the Backglass shows final scores by player and a payload-complete game-ended event carries
them, firing on the drain tick while the scores appear only when the end-of-ball hold releases, so
the bonus count-up is never cut short. A multiple of ten from 00 to 90 is drawn from the same seeded
PRNG in one step, with the configured probability of matching a player's last two digits; a
payload-complete event carries the number and the winners, the Backglass reveals it paced by step
events, and a win is display-only under free play since credits are deferred. A configured Attract
delay or a Start press then leaves game over: hardware disabled, the mode stack empty, the player
list cleared on the next Start, and Attract cycling the last scores plus the flipper, plunge and
Start keys once from the host-supplied bindings view.

**One ball in play, and no ball lost.** Before serving — on Start from Attract and at every ball
start — the ball controller clears strays itself. A ball already resting in the shooter lane *is*
the ball being served, so nothing stacks in an occupied lane; a loose ball outside every device goes
through the recover path. A recovered ball is returned to the trough rather than destroyed and the
slot it lands in reports closed, so the four-ball invariant survives any number of recoveries, the
rules' device counts never drift from physics, and the serve can never answer with an eject failure
that leaves a ball unable to drain.

**Lifecycle hygiene and Backglass legibility.** No display schedule armed by a finished game may
animate into the next — the bonus count-up in particular, whose last residual is a burn-down bullet.
The score screen has no combined line budget of its own, so the ball number shares a shortened
status line rather than taking a row, which keeps four players plus an active mode on the panel. The
display must also identify *which* player a score belongs to: the current player's row is rendered
emphasised, and the pinning evidence must be that the rendered dots differ between an emphasised and
an unemphasised row — never merely that a field was set.

**Determinism and language.** The rules layer runs headless as a pure function of switch events, and
identical inputs replay identically. English only; display literals live in the backglass
presentation code alone and rules never format text.

## Technical Decisions

**Layering and gates (AD-1, AD-16).** `sim/**` is DOM-free and Babylon-free; rules and physics never
import each other; presentation reads frame output and never calls into either. Device-name string
literals outside the single table registry and the test tree are lint errors — derive names
structurally. Three complementary provenance gates (header presence, structural port provenance,
import boundaries) each stand alone; none may be retired in favour of another.

**Clock, randomness and tunables (AD-3, AD-15).** One tick constant is the only time inside `sim/`,
and it is **ratified**, not provisional. Every rules timer is authored in ms in the tunables file,
converted to ticks once at load, and drives presentation by emitting step events; presentation
animates to them and never reports completion. A `…Ms` tunable that resolves to exactly 0 is
reachable through the dev tuning panel, so arithmetic assuming a positive interval must clamp, and
the loader throws when a nonzero ms rounds to zero ticks — the epic-wide test convention of writing
`1` as a millisecond override sits against that guard and is a burn-down bullet. All rules
randomness draws from the seeded PRNG in game state, which has exactly **two** consumers and, since
the rotation shipped, a whole game consumes at most **two steps**: the lit-lane starting draw at the
game's first ball start, and the Match draw once at game end. The PRNG's own value is hashed, so any
change in how many steps a game consumes is hash-visible on its own *and* moves a given seed's Match
number. The Match tunable is **`matchProbability`**, a fraction defaulting to 0.08; `matchPercent`
appears in no live planning artifact, and the shipped adjustments contract was deliberately not
renamed because 0.08 and 8 % are the same odds while a rename would move five golden headers for no
behaviour change. Every tunable carries `source` and `confidence`, and both are part of the hashed
contract: even a prose-only provenance correction invalidates all five replay goldens, so budget a
header re-record with it.

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
not yet arrived at any ball device. The skill shot closes on the **first playfield closure of any
kind** at or after launch, Top lane included — an unlit Top lane is a miss, not a skip.

**Recover, as shipped.** `recover()` parks each ball it removes into the trough's lowest empty slot
and closes that slot's switch, exactly as a parking entry does, instead of despawning it. The close
edge is queued by physics and ordered *ahead* of any same-tick eject's own open edge — on a trough
with one slot free the parked and the ejected slot can be the same slot, and the wrong order leaves
it stuck reading closed while physics reads one ball fewer. The previous despawn behaviour lost a
ball per recovery and, once the trough emptied, produced a hard hang in which no ball could drain.
Both issuers — ball search's final stage and the serve path's stray clear — share this one call, so
the fix closed the hang for ball search too, and no live artifact still says "despawn". The stray
clear reports through the machine report on the tick *after* the ball start, emits its ball-missing
event only when the count is above zero, and never serves — the serve decision was already taken on
the start tick from the shooter lane's own slot. That pending report is snapshotted where it is
armed rather than read live at the end of the tick, because a same-tick Slam-plus-Start can
otherwise re-point it at a second ball start and leak a spurious ball-missing plus a second eject.
Within one physics step recover runs before commands are applied, and a ball resting on the plunger
tip counts as inside the shooter lane, so the ball being served is spared.

**State (AD-7).** One plain-data, JSON-serializable tree with fixed ownership scopes — machine facts
under `machine`, per-player facts under `players[i]`, mode-local facts under `modes[i]` published
only as a typed mode view — mutated only inside `rules.step`. The mode stack is empty between balls;
the will-start event resets ball save, tilt and multiball; the starting event enables hardware.
Rules controllers legitimately hold tick-scoped state in factory closures *outside* the tree,
because the machine scope is serialized into every golden's state hash; the lit lane's per-game
starting position is the newest such field, joining the ball controller's, the tilt controller's,
the rules root's, the mode layer's and the devices layer's. Re-derive that inventory from the
`create*()` factories rather than trusting any written list. Any new latch must be reproducible from
tick 0 and either bounded or restart-safe. The tree is **not** a mid-game resume point, and moving
closure state into it re-records golden state hashes and needs the author's grant.

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

**Geometry and assets (AD-10, AD-11).** One canonical table frame in millimetres with three
sanctioned conversions, geometry authored unpitched with pitch applied as gravity and as a root
rotation, Blender owning every position and mesh, the table registry owning devices, wiring, groups
and tunables, and the export script enforcing node prefixes and properties against the registry. The
geometry stories are all complete, but four of the burn-down's ten entries live in this layer's test
tree, so it is back in the footprint.

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
  rasterises nothing, so a green suite cannot see a pixel-level defect. Story 2.14's own smoke made
  the point: the whole suite passes while the player still cannot *see* which Top lane is lit,
  because no playfield insert is rendered yet.
- The colour grammar is fixed: rules emit a role and a step, presentation owns RGB, intensity and
  blink cadence. Each flipper press moves the lit insert one position, wrapping, and lane change
  matters *before* the plunge, not during flight — an unlit Top lane taken first is a miss, not a
  skip.

## Cross-Story Dependencies

- **Story 2.14 is closed, and closed two ledger entries with it:** the repeated-lane defect and the
  question of where the rotation starts, answered as a seeded start plus a deterministic advance.
  It left Story 2.7's AC 5 verbatim on purpose — that criterion stays true under the rotation and
  the author's decision requires it be unreworded — and amended AC 1, which described the superseded
  draw, in the same commit with the reasoning recorded. It deliberately did **not** touch the two
  composition tests the coupled open question rests on, pinning them byte-identical instead.
- **Story 2.15's prerequisites are Stories 2.0 through 2.14** — it closes their residue. Its ten
  entries reach back across the whole epic (the Loop and guide-termination geometry stories, the
  reachability harness, ball save, the bonus, and 2.14 itself), so the story spans three areas with
  different gates: the geometry test tree, the tunables file with its hashed provenance headers, and
  the ball controller. Sequence the golden-touching entry last and on its own.
- **Whether the paying Top lane freezes at launch remains `decision-pending`** on the author's
  decision sheet, and is now mirrored in the spine's Deferred section with its ledger id because it
  bears on an AD-6 clause. The shipped skill shot keeps lane change live during flight, which
  satisfies AD-6's operative Rule and conflicts only with an amendment's rationale sentence — a
  documentation choice, not a code defect. It is **not** the burn-down's to settle.
- Two ordering hazards of one shape were found in the ball controller's closure state (a value read
  later in the step than a same-tick write that can precede it), and the bonus-step residual in the
  burn-down is a third instance of the same family. The other closure fields have not been swept for
  that pattern; that sweep is the standing follow-up recommendation.
- **Routed elsewhere — do not pre-build:** playfield insert rendering, which is what would make the
  lit lane visible at all (Story 5.2); the Lock arbiter, the Mouth-open lead and the Lock overflow
  eject (Story 3.2); the four-phase mode lifecycle and the priority registry (Story 3.1); multiball
  drain, arming, the recover-versus-own-launch case and the save-relaunch causal binding (Story
  3.7); flashers and audio cues for Tilt and Match (Epic 4); the Walk-up camera (Story 4.6);
  high-score entry and the Settings panel (Epic 6).
- No stage may settle an item sitting on the author's decision sheet; fence those in each spec's
  prohibitions section rather than deciding them in flight.
