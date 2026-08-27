# Deferred work ledger

Canonical, append-only (union-merge across parallel epic branches -- see `.gitattributes`).
Rule 15: ONE canonical entry per root cause. Before filing anything, search this file --
an already-adjudicated item gets an **occurrence** annotation appended to its entry, never a new entry.

Status vocabulary: `open` | `escalated` | `routed` | `by-design` | `wontfix-theoretical` |
`decision-pending` | `resolved-by:<story>`.

---

## Pre-adjudicated: author-owned acceptance criteria (orchestrator, 2026-08-27)

Policy set by the user at cycle start: agents complete every agent-executable acceptance
criterion and measure the **Windows** legs; acceptance criteria that require the author
personally are recorded here as occurrences and the story proceeds. These three entries are
already adjudicated -- **append occurrences, do not re-file.**

- **Author-owned: macOS / Safari measurement legs**
  - status: routed
  - owner: author (needs the macOS machine; the cycle runs on Windows 11)
  - originating story: 1.1
  - severity: med · fix-risk: n/a (not a defect -- an environment-bound AC)
  - occurrences: (append story IDs here as each is reached)
  - rationale: >-
      Story 1.1 requires p95 sim cost measured in "Chrome and Safari on the author's macOS
      machine", 1.2 a cold Pages load in Safari on macOS, 1.8 goldens replayed in Safari,
      6.6 the full Chrome/Edge/Safari x Windows/macOS matrix. The cycle host is Windows 11
      with no macOS or Safari available, so these legs cannot be executed by an agent.
  - suggested resolution: >-
      Agent records the Windows Chrome/Edge numbers in the story's evidence file and leaves
      the macOS row present but marked pending. Author runs the macOS leg and fills the row.
      Batched into one worklist at the end of the range.

- **Author-owned: TICK_HZ ratification from Spike 1**
  - status: decision-pending
  - owner: author
  - originating story: 1.1
  - severity: high · fix-risk: n/a (architectural gate)
  - occurrences:
  - rationale: >-
      Story 1.1's final AC sets `TICK_HZ` in src/sim/contracts/time.ts to 1000 on pass or 480
      on fail, judged on p95 <= 4 ms across every measured path -- including the macOS legs above.
      Every later story is built on the resulting tick rate, so a wrong provisional value is
      expensive to unwind.
  - suggested resolution: >-
      Agent measures the Windows paths, records them in docs/spikes/spike-1.md, and sets the
      provisional TICK_HZ that the Windows numbers support. Author confirms or overrides after
      the macOS leg. Flag prominently at the epic-1 merge gate.

- **Author-owned: feel ritual, Lawlor's test and playtest judgments**
  - status: routed
  - owner: author
  - originating story: 1.9
  - severity: med · fix-risk: n/a (subjective human judgment)
  - occurrences: (append story IDs here as each is reached)
  - rationale: >-
      The feel ritual (UJ-4) and Lawlor's test are the author's judgment, written up in
      docs/feel-test.md. Story 2.1 needs a per-shot Lawlor entry; 3.11 needs at least five
      full games played by the author and freezes scoring at `confidence: playtested`;
      4.8 and 6.6 need the ritual re-run per renderer path. No agent can supply the judgment.
  - suggested resolution: >-
      Agent builds the deliverable, drives the browser smoke to prove the shot is reachable and
      the mechanics respond, and writes the docs/feel-test.md row with the objective columns
      filled and the judgment column left pending. Author plays and completes it. Story 3.11's
      scoring freeze must not be marked playtested by an agent.

- **Author-owned: hand-authored art assets (Epic 5)**
  - status: routed
  - owner: author (Blender / texture authoring, or a generator with tool+date recorded)
  - originating story: 5.1
  - severity: med · fix-risk: n/a (asset authoring)
  - occurrences: (append story IDs here as each is reached)
  - rationale: >-
      Epic 5's stories require a sculpted Dragon model authored in Blender within a 2,000-triangle
      single-LOD budget, hand-painted playfield textures, cabinet and backbox art, insert lenses
      and backglass art. CLAUDE.md's provenance rule requires an ATTRIBUTIONS.md entry recorded
      before any asset file is committed, naming the tool and date for generated work.
  - suggested resolution: >-
      Agent delivers everything around the asset: the export.py validation path, node-name
      contract conformance, the loader wiring, the triangle-budget and size-budget checks, the
      ATTRIBUTIONS.md scaffold, and a placeholder that satisfies the contract. Author supplies
      the authored mesh and textures. Do NOT commit an asset without its verified provenance entry.

---

## Deferred from: bmad-build-auto implement stage of spec-1-1-spike-1 (2026-08-27)

Harvested by the lead from the spec's frontmatter `deferred:` list (Rule 15). Six entries,
none matching an existing canonical entry above.

- **AGENTS.md scaffold-stage TODOs are now answerable but unrefreshed**
  - status: open
  - originating story: 1.1
  - severity: low · fix-risk: low (a doc refresh; `bmad-project-context` owns the block)
  - occurrences: 1.1
  - rationale: >-
      AGENTS.md still reads "TODO - no package.json yet ... Verify the real scripts here on the
      first refresh after scaffolding" and "TODO - CI is .github/workflows/ci.yml, not yet
      written." Story 1.1 added package.json / tsconfig.json / vitest.config.ts (the very
      "first refresh after scaffolding" the TODO names), and Story 1.2 adds the CI workflow.
      The story's footprint barred it from touching AGENTS.md.
  - suggested resolution: >-
      Refresh the AGENTS.md bmad:context block once Story 1.3 lands the full CI workflow and
      the dependency-cruiser scripts, so both TODOs are closed in one pass rather than two.

- **`ObjectPool` exhaustion counters are tracked but never surfaced**
  - status: open
  - originating story: 1.1
  - severity: low · fix-risk: low (in-file; add an assertion or a dev-mode read)
  - occurrences: 1.1
  - rationale: >-
      `release()` sets `this.warned` and increments `this.skipped` when the pool is full, but
      nothing reads either field. A pool-exhaustion regression in a later story would be
      invisible until it surfaced as a physics anomaly. Story 1.1's fixed six-ball scene never
      exercises exhaustion.
  - suggested resolution: >-
      Surface both counters through the dev tuning panel (Story 1.9) or assert them in the
      multi-ball goldens (Story 1.8), whichever lands first.
  - location: src/sim/physics/util/object-pool.ts

- **Corner `HitPoint` primitive may be unexercised by either correctness leg**
  - status: open
  - originating story: 1.1
  - severity: low · fix-risk: med (a scene redesign invalidates the recorded measurements)
  - occurrences: 1.1
  - rationale: >-
      The six ball start poses sit mid-field (110-410 mm on a 514 mm table) at moderate
      velocities; whether any ball ever contacts a corner `HitPoint` in the 10,000-tick Node
      run or the 600-frame browser run was not confirmed. The primitive is header-tested but
      possibly never executed.
  - suggested resolution: >-
      Cover it in Story 1.4, where the real placeholder collision geometry replaces the harness
      scene and corner contacts become natural - not by redesigning the spike scene, which
      would invalidate the recorded p95 baseline.
  - location: tools/spike-1/scene.ts

- **The "terminates every step" test does not construct a genuinely non-convergent input**
  - status: open
  - originating story: 1.1
  - severity: medium · fix-risk: med (needs solver expertise to build a non-flaky adversarial case)
  - occurrences: 1.1
  - rationale: >-
      `test/spike-1.test.ts`'s termination test runs the ordinary six-ball scene and asserts a
      wall-clock ceiling per tick. That is a sanity net around STATICTIME's guarantee (AD-4),
      not a targeted test of the forced-advance mechanism the I/O matrix's "Step termination"
      row names as its input.
  - suggested resolution: >-
      Build the adversarial case alongside Story 1.5's loop work, where `advance()` and the
      forced-advance path are under active development and the solver behaviour is fresh.
      AD-4 is load-bearing for the whole loop, so this should not drift past Epic 1.
  - location: test/spike-1.test.ts

- **Background-throttle guard is unit-tested but not end-to-end through `measure.mjs`**
  - status: wontfix-theoretical
  - originating story: 1.1
  - severity: low · fix-risk: med (needs a mocked CDP layer or real window-visibility automation)
  - occurrences: 1.1
  - rationale: >-
      `test/spike-1-browser-guard.test.ts` drives `runFrames()` with a fake
      `requestAnimationFrame` and does cover the guard's logic. The untested remainder is the
      page-exception -> CDP `exceptionDetails` -> `exitCode=1` chain, verified by inspection.
      Closing it needs either a mocked CDP layer (against this project's real-runtime testing
      preference) or automating a real window's visibility state.
  - what would make it real: >-
      A measurement run that is silently throttled and still reports a passing p95 - i.e. the
      guard failing open in `measure.mjs` rather than in `runFrames()`. If a future spike's
      numbers are ever suspected of throttling, reopen this.
  - location: tools/spike-1/measure.mjs

- **`measure.mjs` hardcodes CDP port 9333 with no free-port check**
  - status: wontfix-theoretical
  - originating story: 1.1
  - severity: low · fix-risk: low
  - occurrences: 1.1
  - rationale: >-
      Two simultaneous `measure.mjs` runs, or a leftover process still holding 9333, would send
      the second run's CDP calls to the wrong browser. The documented usage runs the Chrome and
      Edge legs strictly sequentially, so there is no present user-reachable failure.
  - what would make it real: >-
      Parallelising the browser legs, or running the spike from two epic worktrees at once.
      Story 6.6 re-runs the browser matrix - if it parallelises, fix the port first.
  - location: tools/spike-1/measure.mjs

---

## Occurrence log

Append-only. Each line records one occurrence against a canonical entry above, naming the entry
verbatim. Rule 15 forbids rewriting prior lines, so occurrences accumulate here rather than being
edited into the entry's own `occurrences:` field.

- 2026-08-27 · Story 1.1 · **Author-owned: macOS / Safari measurement legs** — Spike 1's browser
  measurement leg was executed on Windows only. `docs/spikes/spike-1.md` carries the Chrome-macOS
  and Safari-macOS rows marked `PENDING - author's macOS leg`. Windows Chrome p95 3.90 ms and
  Windows Edge p95 3.75 ms are recorded and PASS the 4 ms bar. Author action: run the two macOS
  rows and fill them in.
- 2026-08-27 · Story 1.1 · **Author-owned: TICK_HZ ratification from Spike 1** — `TICK_HZ` set to
  **1000** in `src/sim/contracts/time.ts`, marked PROVISIONAL in a loud comment block pending the
  author's macOS leg. Justified by the Windows numbers above. **Caveat the author must weigh:** the
  margin is narrow, not comfortable. Across repeated runs Edge ranged 3.6-4.5 ms and **3 of 10
  individual runs exceeded the 4 ms bar**; Chrome ranged 3.5-3.9 ms with all 5 runs under. The PASS
  verdict rests on the median of repeated runs, and `docs/spikes/spike-1.md` discloses this in its
  "Repeat-run variance" section. If the macOS legs also land near 4 ms, the 480 Hz fallback deserves
  a second look before Epic 2 builds further on 1 kHz. Author action: ratify 1000 or direct 480.
