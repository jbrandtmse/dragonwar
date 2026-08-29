# Story 1.8 — the test-vacuity AND invariant sweep runs BEFORE any golden is recorded

**Status:** binding mandate, user-approved 2026-08-29 (extended the same day to cover
architectural invariants). Recorded by the Epic 1 runner during Story 1.6 so it survives a
context loss. Fold this into Story 1.8's spec at its plan stage.

## Why the ordering matters

Story 1.8 records goldens for "roll-and-drain, cradle-and-release, full plunge, nudge coupling,
and a two-ball collision". A golden freezes current behaviour as the reference. Recording goldens
while vacuous assertions are masking defects **promotes those defects to specification** — the
masked bug becomes the expected output, and the next person to see the golden break re-records it
rather than questioning it.

The sweep currently sits in burn-down Story 1.9, which runs *after* 1.8. That ordering is
backwards. The user approved fixing it.

## Mechanism (preferred)

An **early, blocking task inside Story 1.8 itself**, sequenced before any golden is recorded.
This is an AC amendment, which stays in the hash-exempt class. Only if that provably cannot work
should a separate story be proposed — and inserting a mid-epic story heading is a structural
change requiring a fresh `## Clarification Needed`, not runner authority.

---

# Part 1 — assertions that cannot fail

## The five vacuity shapes this epic has already produced

All five are from Epic 1's own logs, not hypotheses:

1. **Nothing arranged** — Story 1.5's determinism test asserted ball position with no ball spawned.
2. **Path never driven** — switch-tracker multi-tick hysteresis; device overflow never driven
   through `machine.step`.
3. **No executed test host** — Story 1.5's code review found two: the host loop, and *all of
   `sim/rules`*. These need real tests, not merely imports.
4. **Green because of the defect** — `test/machine-serve-drain.test.ts` passing by tunnelling
   through the old static flipper boxes' uncovered edges (ledger **`DW-73`**).
5. **Test fitted to the code** — Story 1.6's first implement subagent narrowing its cradle window
   until it passed (caught and rejected by the Matrix Test Audit).

## Four more shapes, added 2026-08-29 (Story 1.6's Fix Pack, and Story 1.7's licence guard)

The code review's Fix Pack is the same vacuity class and is a **preview of this sweep**. Add its
patterns to the checklist:

6. **Config written but never read back** — `flippers.ts`'s three collision-material calls are
   entirely unverified; deleting all three leaves the suite green. Probe: delete the assignment,
   expect red.
7. **A field only ever asserted at its zero/default value** — `angularVelDegPerSec` is only ever
   asserted as `0`, so a 100x unit error ships green. Probe: scale the value, expect red. Any
   field whose every assertion uses the default is unpinned.
8. **A guard that encodes an assumption — correct today, wrong on the first exception.** Story 1.7 hit this:
   `test/sim-boundary.test.ts`'s licence-header check was a strict two-way XOR — every file under `src/sim/`
   is *either* a vpx-js port *or* DragonWar-authored. That was exactly right while vpx-js was the only
   upstream, and it failed the moment a second one (vpinball) was authorized, because a correct-but-narrow
   guard has no way to express "a third legitimate case". Probe: for each guard that enumerates cases, ask
   what a legitimate new case would look like and whether the guard would reject it *as a licence
   violation* rather than as an unknown. Prefer guards that fail open with a named error over guards that
   fail closed on an unenumerated-but-valid input.

9. **Coverage silently lost when a guard is deleted** — `addBox()`/`outwardTriangle()` lost their
   only coverage when the winding regression guard was removed, because the two flippers were the
   only box-shaped nodes in the committed document. Probe: ask what *else* a deleted test was the
   sole cover for.

## Method

- **Mutation-style spot checks.** For each critical assertion, deliberately break the code and
  confirm the test goes red. *An assertion nobody has seen fail is not yet evidence.*
- **Assert the arrange.** Where a missing precondition is the problem, assert it explicitly
  (`ballsInPlay === 1` before asserting position). That converts the whole "nothing arranged"
  class into a loud failure instead of a silent pass.
- **Check coverage instrumentation.** "Two modules with no executed test host" is exactly what
  coverage catches for free. If none is configured, propose adding it — in-footprint via
  `package.json` and the CI workflow.
- Findings the sweep cannot fix in place become **ledger entries with named observables**, never
  silent carry-forward.

---

# Part 2 — architectural invariants (added 2026-08-29, user mandate)

The sweep is **no longer only about assertions that cannot fail**. For every `AD-*` invariant this
epic claims to enforce, it must ask:

> **Is there a test that fails when this invariant is violated?**

## Why this is the more dangerous half

An unpinned *assertion* is a weak test. An unpinned *invariant* is the thing the architecture
spine exists to guarantee, and the thing a future story is most likely to break without noticing.

**The proof case is AD-5, found in Story 1.6.** AD-5 is why the flipper is a hardware rule and not
a command: "switch or button to coil on the same tick." Moving `machine.ts`'s two `applyFrame`
calls to run *after* `physics.step()` makes the flipper genuinely one tick late — the exact
latency AD-5 forbids — and **the entire suite stayed green**: 590 passed, 42 files, typecheck
clean. The story would have closed green with its central invariant unprotected. What existed was
a *comment* at `test/flipper-mover.test.ts:40-46` explaining the timing, and documented reasoning
is not a test.

## Method — identical, applied to invariants

For each `AD-*` in scope: **state the mutation** that would violate it, **run it**, **confirm
red**, **restore**. Record the mutation and the observed red. An invariant with no such test
becomes a ledger entry **with the mutation named as the observable**, so it closes on evidence
rather than on inspection.

## Scope — the AD-* invariants Epic 1 claims

Work from the spine (`ARCHITECTURE-SPINE.md`, AD-1..AD-19) and from the `### Governing ADs`
sections of Epic 1's specs. Known claims worth a mutation each — not exhaustive, derive the full
list at plan time:

- **AD-5** — hardware rules inside the physics step, same tick. *Mutation: move `applyFrame` after
  `physics.step()`.* Story 1.6's amended AC 2 now requires exactly this test; verify it exists and
  goes red under the mutation, then extend the pattern to the rest.
- **AD-4** — one clock, commands land at *t+1*, key codes never enter `sim/`. *Mutations: apply a
  command on the same tick it was issued; import a key code into `sim/`.*
- **AD-2** — `sim/loop` owns the four button switches; rules never debounce. *Mutation: emit a
  button edge from physics instead.*
- **AD-6** — the opening of `s_shooter_lane` is the one event meaning "plunged". *Mutation: emit a
  second launch signal, or suppress the opening.*
- **AD-7** — `GameState` mutated only inside `rules.step`. *Mutation: write to it from the loop.*
  **Note:** `DW-70` is a known live violation of exactly this (`deviceSlots` written by
  `sim/loop`), currently escalated to the merge gate — a standing example of an invariant that is
  breached today and caught by nothing.
- **AD-1 / AD-3 / AD-10** — layering, no upward imports. Partly pinned by `lint:boundaries`;
  confirm the lint actually fails on a deliberate violation rather than assuming it.
- **AD-15** — solver constants verbatim and untunable; table tunables carry `source` and
  `confidence`. *Mutation: add a tunable with no `source`.*
- **AD-16** — provenance: ported files keep upstream copyright and stay inside
  `src/sim/physics/**`. *Mutation: move a ported file out of the glob, or strip its header;
  `check:headers` / `check:attributions` should fail.*

## The cradle-and-release golden needs a recorded decision

As of Story 1.6's findings this table **cannot hold a cradle**: with no geometry beside either
flipper, a ball on a raised bat departs after roughly 1.2-1.9 s. Recording a golden named
"cradle-and-release" would encode "ball rolls off the bat" as the *cradle* reference, and such a
golden will break when Story 2.1 lands the real pocket — at which point it is likely to be
re-recorded rather than questioned.

**Runner's intended call (finalise at 1.8's plan stage, record the rationale in the spec and tie
it to `DW-72`):** record the golden now, but (a) name it for what it actually captures — a short
hold-and-release, not a cradle — and (b) keep the hold *well inside* the 1 s bound where behaviour
is stable and will NOT change when the pocket lands. That freezes the real Epic 1 behaviour worth
protecting (the coil as a hardware rule, the input path, the release impulse) without encoding the
roll-off, and it stays valid across Story 2.1. The full cradle golden arrives in Epic 2 with
`DW-72`.

If at plan time this reads as a genuine product call rather than a scoping one, raise it as a
`## Clarification Needed` instead of deciding it.

## Related ledger entries

- **`DW-73`** — the tunnelling test; owned by `1-8-replays-golden-state-hashes-and-ci-parity`,
  closes on a mutation spot-check, not on inspection.
- **`DW-72`** — the deferred full cradle; owned by
  `2-1-the-playfield-geometry-and-the-full-switch-set`, backed by a reciprocal AC in Story 2.1.
- **`DW-70`** — `deviceSlots` written outside `rules.step` (AD-7); escalated, surfaced at the Epic
  1 merge gate. Relevant here as a live, uncaught invariant violation.
- **`DW-74`..`DW-78`** — filed by Story 1.6's code review; several are invariant-adjacent.

## Note on Story 1.9

Burn-down Story 1.9 still runs, and still charters against `owner:burndown` (28 as of 2026-08-29)
versus a cap of 8. Moving the sweep ahead of the goldens does not fold 1.9 into 1.8 — it only
takes the golden-poisoning risk off 1.9's plate.
