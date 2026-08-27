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
