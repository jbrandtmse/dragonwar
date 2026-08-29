# Story 1.8 — the test-vacuity sweep runs BEFORE any golden is recorded

**Status:** binding mandate, user-approved 2026-08-29. Recorded by the Epic 1 runner during
Story 1.6 so it survives a context loss. Fold this into Story 1.8's spec at its plan stage.

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

## Sweep scope — the five vacuity shapes this epic has already produced

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

## The `cradle-and-release` golden needs a recorded decision

As of Story 1.6's findings this table **cannot hold a cradle**: with no geometry beside either
flipper, a ball on a raised bat departs after roughly 1.2-1.9 s. Recording a golden under the name
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
  `2-1-the-playfield-geometry-and-the-full-switch-set`, now backed by a reciprocal AC in Story 2.1.

## Note on Story 1.9

Burn-down Story 1.9 still runs, and still charters against `owner:burndown` versus a cap of 8.
Moving the sweep ahead of the goldens does not fold 1.9 into 1.8 — it only takes the
golden-poisoning risk off 1.9's plate.
