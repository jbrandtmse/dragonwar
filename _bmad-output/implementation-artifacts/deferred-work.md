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

---

## Deferred from: code review of spec-1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies.md (2026-08-27)

Two new canonical entries. Everything else this review found was either fixed in place, or
closed at emission (`by-design` / `wontfix-theoretical`) with the rationale recorded in the
spec's `### Review Findings`. The gravity defect that invalidated the spike's measurements is
NOT ledgered as deferred work -- it was fixed, and its consequence is an occurrence against the
existing TICK_HZ entry below.

- **The production-build measurement surface has no scaffold in the repository**
  - status: routed
  - originating story: 1.1
  - severity: medium · fix-risk: low (two `package.json` scripts plus a Vite entry config)
  - occurrences: 1.1
  - rationale: >-
      Story 1.1's AC was amended on 2026-08-27 to measure the frame budget against a
      production build (`vite build` + `vite preview`) and to exclude the dev page as a
      measurement surface. Nothing in the repository implements that surface: `package.json`
      has only `dev` / `typecheck` / `test`, there is no `vite.config.ts`, and the deciding
      run survives only as prose in `docs/spikes/spike-1.md` (`npx vite build tools/spike-1
      --base ./ --outDir <scratch>/...` plus a bare `vite preview`, which as written does not
      reproduce -- the outDir is a placeholder outside the repo and the preview command shows
      no matching root). `tools/spike-1/measure.mjs` still DEFAULTS `--url` to the dev server
      on port 5173. Story 1.1's Never list explicitly bars it from building `vite build`, so
      this is Story 1.2's work, not a defect it could have fixed.
      Mitigated in this review: `measure.mjs` now prints its target and warns loudly when that
      target is the dev page, so the surface can no longer be got wrong silently.
  - suggested resolution: >-
      Story 1.2 adds `build` and `preview` scripts and whatever Vite entry configuration the
      harness page needs, then re-points `measure.mjs`'s DEFAULT_URL at the preview port and
      records the exact reproducible command in docs/spikes/spike-1.md.
  - location: package.json, tools/spike-1/measure.mjs

- **`measure.mjs`'s non-Windows paths are untested, and the macOS legs are its next caller**
  - status: routed
  - owner: pairs with "Author-owned: macOS / Safari measurement legs"
  - originating story: 1.1
  - severity: low · fix-risk: low
  - occurrences: 1.1
  - rationale: >-
      The runner is Windows-shaped throughout and no non-Windows path has ever executed.
      `DEFAULT_EXE` carries only Windows Chrome/Edge paths, so a macOS run needs `--exe` every
      time. `killTree()`'s else branch calls `process.kill(-pid, 'SIGKILL')` for "the whole
      process group, when detached", but the `spawn()` never passes `detached: true`, so the
      child is not a group leader and that call falls through to the plain `process.kill(pid)`
      the file's own header documents as leaving the browser's helper processes running.
      `process.exit()` immediately after `console.log`ing the result JSON is safe on Windows
      (pipe writes are synchronous there) but can truncate that JSON on POSIX when stdout is a
      pipe rather than a TTY -- and the JSON is the whole machine-readable output.
  - suggested resolution: >-
      Fix all three together immediately before the author's macOS leg runs, so the first
      macOS invocation is not also the first test of these paths: add macOS defaults to
      `DEFAULT_EXE`, pass `detached: true` on non-Windows spawns, and set `process.exitCode`
      plus clear the run timeout instead of calling `process.exit()`.
  - location: tools/spike-1/measure.mjs


---

## Deferred from: lead post-fix re-measurement of Story 1.1 (2026-08-27)

Two findings from the lead's re-measurement after code review's gravity fix. Both are
methodological and affect every later performance story, so neither is filed against 1.1 alone.

- **This host's session-to-session measurement variance (~1.9x) exceeds every effect being measured**
  - status: escalated
  - originating story: 1.1
  - severity: high - fix-risk: n/a (a measurement-environment property, not a code defect)
  - occurrences: 1.1
  - rationale: >-
      Byte-identical code (the pre-fix scene, production build, Chrome/Windows) measured 3.50 ms
      p95 in one session and 1.8 ms in another. Controlled same-session A/B tests showed the
      gravity fix and the dev-vs-production build BOTH have no measurable effect - each apparent
      delta previously attributed to them was cross-session noise. Across all sessions the figure
      ranged roughly 1.6-4.6 ms, straddling the 4 ms bar. Likely cause is thermal/power throttling
      on a 15 W 2018 mobile part (i5-8259U) under varying prior load; not instrumented, so
      unproven. Consequence: the Edge/Windows best-effort carve-out and the "dev page is not a
      valid proxy" conclusion were both decided on differences this host cannot resolve.
  - suggested resolution: >-
      Adopt a standing rule: every performance claim on this host must be an A/B measured
      back-to-back in ONE session, interleaved - never a comparison against a number from another
      session. Applies to Story 1.2 (payload/load time), 4.7 (Spike 2) and 6.6 (browser matrix).
      If an absolute number ever needs to gate, measure on a machine with stable sustained clocks,
      or pin CPU frequency and report the distribution across sessions rather than a point.
  - location: docs/spikes/spike-1.md

- **The Spike 1 harness scene is near-quiescent for about half the measured window**
  - status: routed
  - originating story: 1.1
  - severity: medium - fix-risk: med (a scene redesign re-invalidates every recorded number)
  - occurrences: 1.1
  - rationale: >-
      Probed total ball speed across a full 11,220-tick run: 72.3 at tick 0, 53.6 at the end of
      the 60-frame warm-up, 6.9 by tick 3,000, then flat at about 1.4 from tick 6,000 onward -
      six balls creeping in the STATICTIME forced-advance regime. The p95 therefore reflects a
      short violent opening plus a long quiet tail, not a steady-state pinball workload. Pre-fix
      and post-fix settle identically, so this is a harness property, not a consequence of the
      gravity fix. It makes the recorded figure optimistic as a characterization of a real table.
  - suggested resolution: >-
      Do not redesign the spike scene - that would re-invalidate the recorded baseline for a third
      time. Re-take the frame-budget characterization in Story 1.5, where a served ball on the
      real placeholder geometry gives a continuously-active workload, and treat Spike 1's number
      as a floor until then. Related: the existing "corner HitPoint may be unexercised" entry has
      the same root cause (an unrepresentative scene).
  - location: tools/spike-1/scene.ts


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
- 2026-08-27 · Story 1.1 · **Author-owned: TICK_HZ ratification from Spike 1** — *supersedes the
  occurrence line immediately above (append-only: that line is left intact, not edited).* The lead's
  independent re-measurement did **not** reproduce the implement stage's Edge result. Over 20 runs on
  an idle host the Edge/Windows median p95 is **4.1 ms** with only **7 of 20 runs** meeting the
  `p95 <= 4 ms` bar, while Chrome/Windows held at **3.7 ms median, 10 of 10 passing** in the same
  session — an engine difference, not host load. **By the story's AC as written ("passes if
  p95 <= 4 ms on every measured path"), Spike 1 FAILS on the Windows numbers**, routing to the AC's
  fail branch (`TICK_HZ = 480` plus a logged solver re-tune before Story 1.3). `TICK_HZ` has been
  left at its provisional 1000 and NOT changed, because the fail branch bundles a solver re-tune and
  both are the author's decision. Full evidence, sample lists and a 480 Hz estimate are in
  `docs/spikes/spike-1.md` under "Independent lead verification". **Epic 1 is halted at this fork.**
- 2026-08-27 · Story 1.1 · **Author-owned: TICK_HZ ratification from Spike 1** — **DECIDED by the
  author 2026-08-27.** `TICK_HZ = 1000`, set from the **production-build** measurement (Chrome/Windows
  3.50 ms median 5/5 under; Edge/Windows 3.70 ms median 18/20 under, known tail at 4.3 and 4.4 ms).
  The dev-page failure the lead escalated was an artifact of the unoptimized build — a 0.4 ms delta
  that flipped the Edge verdict; the lead's measurement was sound, the surface was wrong. The story's
  AC has been amended to measure against a production build, and Edge/Windows is now **best-effort
  for the frame-budget gate only** (its functional support is unchanged; FR-54, NFR-6, prd.md and
  SPEC.md untouched). Gating paths are Chrome/Windows, Chrome/macOS and Safari/macOS. **This entry
  stays open**: two of the three gating paths are still unmeasured, so TICK_HZ remains provisional.
  **Safari was NOT demoted** — JavaScriptCore rather than V8, still unmeasured, and the real
  remaining performance risk. Author action: run the Chrome/macOS and Safari/macOS legs.

- 2026-08-27 · Story 1.1 · **Author-owned: TICK_HZ ratification from Spike 1** — *code review
  invalidates the measurement the author's 2026-08-27 decision rested on.* The harness built its
  gravity vector from the bare `DEFAULT_TABLE_GRAVITY` multiplier (0.97) instead of the
  `GRAVITYCONST`-scaled strength upstream feeds that formula (`vpx-js lib/vpt/table/table-api.ts:156-158`
  defines `Gravity` as `data.gravity / GRAVITYCONST`, so the value `init()` consumes is already
  scaled; `GRAVITYCONST` was ported and then referenced by nothing). The six balls therefore ran
  at **0.593 m/s² of down-slope acceleration instead of ~1.08 m/s²** — about 55% of a real 6.5°
  playfield — making the collision workload, and every recorded p95, optimistic. Correcting it
  raises the Node leg's p95 **1.40×** (171,300 → 240,500 ns/tick; derived per-frame 2.91 → 4.09 ms,
  i.e. *over* the 4 ms bar). `tools/spike-1/scene.ts` has been fixed; the browser legs have **not**
  been re-run. `TICK_HZ` has deliberately been left at **1000** — unchanged — because the fail
  branch bundles a solver re-tune and both are the author's call, exactly as the earlier Edge
  escalation was handled. **This entry stays open and its severity rises: the PASS verdict is now
  unestablished on all four paths, not just the two macOS ones.** Author action: re-run the
  browser legs on the corrected scene against a production build, then ratify 1000 or direct 480.
- 2026-08-27 · Story 1.1 · **Author-owned: macOS / Safari measurement legs** — scope grows: the
  gravity correction above invalidates the *Windows* legs too, so Chrome/Windows and Edge/Windows
  must be re-measured alongside Chrome/macOS and Safari/macOS rather than being carried forward as
  already-done. The re-run must also record machine identification, browser versions and the run
  date in the deciding table itself — the AC requires all three and the production-build table
  currently carries none of them (they appear only in the section the document marks superseded).
- 2026-08-27 · Story 1.1 · **The "terminates every step" test does not construct a genuinely
  non-convergent input** — seen again in code review, and the gravity correction makes it more
  pressing rather than less: higher approach velocities push the time-of-impact loop harder, so the
  STATICTIME forced-advance path is closer to being exercised for real while still being asserted
  only as a 250 ms wall-clock ceiling on the ordinary scene. No change to the entry's disposition
  (still `open`, still targeted at Story 1.5's loop work).
- 2026-08-27 · Story 1.1 · **Author-owned: TICK_HZ ratification from Spike 1** — post-fix
  re-measurement on the corrected scene (production build, this session): Chrome/Windows **1.8 ms**
  median 8/8 under the bar, Edge/Windows **1.8 ms** median 8/8 under. **PASS on the gating path with
  wide margin**, so `TICK_HZ = 1000` is comfortable on the Windows evidence. Two caveats the author
  must carry: (1) this host's session variance is ~1.9x on identical code, so treat the Windows
  figure as a range (~1.6-4.6 ms across sessions), not a point; (2) the harness scene is
  near-quiescent for about half the measured window, so the number is a floor rather than a
  characterization. Chrome/macOS and Safari/macOS remain unmeasured and both gate. Entry stays open.
- 2026-08-27 · Story 1.1 · **Author-owned: macOS / Safari measurement legs** — still pending after
  the post-fix re-measurement; the corrected-scene production numbers above are Windows-only. When
  the author runs the macOS legs, measure them A/B in one session per the variance entry above.
