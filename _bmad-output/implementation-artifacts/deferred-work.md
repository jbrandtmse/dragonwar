# Deferred Work Ledger

See _bmad/custom/skill-rules.md Rule 15 (entry grammar) and Rule 17 (the drain).
Migrated from the pre-2026-08-27.1 prose grammar; the original is kept verbatim as
`deferred-work.legacy.md` for forensics and is never read by the pipeline.

### DW-1: Author-owned: macOS / Safari measurement legs
- source: orchestrator-policy | severity: med | fix-risk: med | footprint: out-of-footprint
- evidence: Stories 1.1/1.2/1.8/6.6 require Chrome+Safari on macOS; cycle host is Windows 11 with neither available
- 2026-08-27T22:32:54Z status=routed owner=burndown by=migration note=Author runs the macOS legs; agents fill the Windows rows and mark macOS PENDING
- 2026-08-27T22:33:38Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=Spike 1 browser leg run on Windows only; macOS rows marked PENDING in docs/spikes/spike-1.md
- 2026-08-27T22:33:39Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=scope grows: the gravity correction invalidates the Windows legs too, so all four paths need re-measuring, with machine, browser version and date recorded in the deciding table
- 2026-08-27T22:33:40Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=still pending after the post-fix re-measurement; when the author runs the macOS legs, measure A/B in one session per DW-13

### DW-2: Author-owned: TICK_HZ ratification from Spike 1
- source: orchestrator-policy | severity: high | fix-risk: med | footprint: out-of-footprint
- evidence: Story 1.1 AC sets TICK_HZ 1000 on pass / 480 on fail judged across every gating path; two of three still unmeasured
- 2026-08-27T22:32:54Z status=decision-pending owner=burndown by=migration note=Provisionally 1000 per author 2026-08-27; ratify after Chrome/macOS and Safari/macOS
- 2026-08-27T22:33:38Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=TICK_HZ set to 1000 PROVISIONAL; Edge ranged 3.6-4.5 ms with 3 of 10 runs over the bar
- 2026-08-27T22:33:38Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=supersedes prior line: lead re-measurement gave Edge median 4.1 ms 7/20 passing, so the AC as written FAILED on Windows; TICK_HZ left at 1000 pending the author
- 2026-08-27T22:33:39Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=DECIDED by author 2026-08-27: TICK_HZ=1000 on production-build numbers; Edge carved to best-effort for the frame-budget gate only; FR-54/NFR-6/prd/SPEC untouched; Safari NOT demoted; entry stays open
- 2026-08-27T22:33:39Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=code review invalidated that measurement: harness used bare DEFAULT_TABLE_GRAVITY instead of the GRAVITYCONST-scaled value, running at about 55 percent of real down-slope gravity; scene.ts fixed
- 2026-08-27T22:33:40Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=post-fix re-measurement on the corrected scene: Chrome/Windows 1.8 ms 8/8 and Edge/Windows 1.8 ms 8/8, PASS with wide margin on the Windows evidence; macOS legs still gate; entry stays open

### DW-3: Author-owned: feel ritual, Lawlor's test and playtest judgments
- source: orchestrator-policy | severity: med | fix-risk: med | footprint: out-of-footprint
- evidence: UJ-4 feel ritual and Lawlor's test are author judgment in docs/feel-test.md; 1.9, 2.1, 3.11, 4.8, 6.6 all need it
- 2026-08-27T22:32:54Z status=routed owner=burndown by=migration note=Agents build and prove reachability; author supplies judgment. 3.11 scoring freeze must never be agent-marked playtested

### DW-4: Author-owned: hand-authored art assets (Epic 5)
- source: orchestrator-policy | severity: med | fix-risk: med | footprint: out-of-footprint
- evidence: Epic 5 needs a sculpted Blender Dragon under 2000 tris, hand-painted textures, cabinet and backglass art
- 2026-08-27T22:32:54Z status=routed owner=burndown by=migration note=Agents deliver export/loader/budget scaffolding and placeholders; author supplies meshes and textures with ATTRIBUTIONS entries first

### DW-5: AGENTS.md scaffold-stage TODOs are now answerable but unrefreshed
- source: spec-1-1-spike-1 | severity: low | fix-risk: low | footprint: in-epic
- evidence: AGENTS.md still says no package.json and no CI workflow; 1.1 added both scaffolds and 1.2 adds CI
- 2026-08-27T22:32:55Z status=open owner=1-3-seam-contracts-the-table-registry-and-boundary-lint by=migration note=Refresh the bmad:context block once 1.3 lands CI and dependency-cruiser so both TODOs close in one pass

### DW-6: ObjectPool exhaustion counters are tracked but never surfaced
- source: spec-1-1-spike-1 | severity: low | fix-risk: low | footprint: in-epic
- evidence: release() sets warned and increments skipped but nothing reads either; src/sim/physics/util/object-pool.ts
- 2026-08-27T22:32:55Z status=open owner=1-8-replays-golden-state-hashes-and-ci-parity by=migration note=Surface via the dev tuning panel (1.9) or assert in the multi-ball goldens (1.8), whichever lands first

### DW-7: Corner HitPoint primitive may be unexercised by either correctness leg
- source: spec-1-1-spike-1 | severity: low | fix-risk: med | footprint: in-epic
- evidence: Six mid-field ball poses may never contact a corner HitPoint in the 10000-tick or 600-frame runs; tools/spike-1/scene.ts
- 2026-08-27T22:32:55Z status=open owner=1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi by=migration note=Cover in 1.4 when real placeholder geometry lands; do NOT redesign the spike scene and invalidate the baseline

### DW-8: The terminates-every-step test does not construct a genuinely non-convergent input
- source: spec-1-1-spike-1 | severity: med | fix-risk: med | footprint: in-epic
- evidence: test/spike-1.test.ts asserts a wall-clock ceiling on the ordinary scene; a true non-terminating loop hangs synchronously and defeats both that ceiling and Vitest testTimeout
- 2026-08-27T22:32:55Z status=open owner=1-5-a-ball-rolls-drains-and-is-served-on-the-fixed-step-loop by=migration note=Build the adversarial input plus an out-of-process timeout alongside 1.5's loop work; AD-4 is load-bearing
- 2026-08-27T22:33:40Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=seen again in code review; higher post-gravity approach velocities push the time-of-impact loop harder, making the unexercised forced-advance path more pressing
- 2026-08-27T22:33:40Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=sharper statement: a non-terminating physicsSimulateCycle hangs synchronously, defeating both the per-tick ceiling and Vitest testTimeout, so the current assertion cannot detect its named failure

### DW-9: Background-throttle guard is unit-tested but not end-to-end through measure.mjs
- source: spec-1-1-spike-1 | severity: low | fix-risk: med | footprint: in-epic
- evidence: runFrames() guard is covered with a fake rAF; the page-exception to CDP exceptionDetails to exitCode=1 chain is verified only by inspection
- 2026-08-27T22:32:55Z status=wontfix-theoretical owner=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=reopen_if=a throttled run reports a passing p95 via measure.mjs rather than runFrames()

### DW-10: measure.mjs hardcodes CDP port 9333 with no free-port check
- source: spec-1-1-spike-1 | severity: low | fix-risk: low | footprint: in-epic
- evidence: Two concurrent runs would both target 9333; documented usage runs Chrome and Edge strictly sequentially
- 2026-08-27T22:32:55Z status=wontfix-theoretical owner=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=reopen_if=the browser legs are parallelised or run from two epic worktrees at once (see Story 6.6)
- 2026-08-27T22:33:40Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=second direction: sweepStaleProfileDirs deleted every dragonwar-spike1-* temp dir including one an active run held; mitigated with an age gate, port collision itself unchanged

### DW-11: The production-build measurement surface has no scaffold in the repository
- source: cr spec-1-1-spike-1 | severity: med | fix-risk: low | footprint: in-epic
- evidence: package.json has only dev/typecheck/test, no vite.config.ts, and the deciding run survives only as prose with a placeholder outDir; measure.mjs still defaults --url to the dev server
- 2026-08-27T22:33:14Z status=routed owner=1-2-spike-3-build-size-and-load-time-measured-from-a-link by=migration note=1.2 adds build and preview scripts plus Vite entry config, re-points DEFAULT_URL at the preview port, and records a reproducible command

### DW-12: measure.mjs non-Windows paths are untested and the macOS legs are its next caller
- source: cr spec-1-1-spike-1 | severity: low | fix-risk: low | footprint: out-of-footprint
- evidence: DEFAULT_EXE is Windows-only; killTree's detached branch never applies because spawn omits detached:true; process.exit() can truncate the result JSON on POSIX pipes
- 2026-08-27T22:33:14Z status=routed owner=burndown by=migration note=Fix all three immediately before the author's macOS leg so the first macOS run is not also the first test of these paths

### DW-13: This host's session-to-session measurement variance (~1.9x) exceeds every effect being measured
- source: lead re-measurement 1.1 | severity: high | fix-risk: med | footprint: out-of-footprint
- evidence: Byte-identical code spanned roughly 1.6-4.8 ms across runs and the 4 ms bar sits inside that range; same command measured 1.8 then 4.0 ms forty minutes apart in ONE session
- 2026-08-27T22:33:14Z status=escalated owner=burndown by=migration note=Standing rule: every perf claim is an A/B measured back-to-back and adjacent in time in one session. Affects 1.2, 4.7, 6.6. Ratify TICK_HZ only on a host with stable sustained clocks
- 2026-08-27T22:33:40Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=the retracted dev-page-is-not-a-valid-proxy conclusion is still asserted in epics.md and epic-1-context.md; the AC amendment stands on its own merits but its stated justification needs correcting
- 2026-08-27T22:33:41Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=strengthened by the per-story smoke: drift is within a single session too (1.8 then 4.0 ms forty minutes apart), so A/B pairs must be adjacent in time, not merely same-session

### DW-14: The Spike 1 harness scene is near-quiescent for about half the measured window
- source: lead re-measurement 1.1 | severity: med | fix-risk: med | footprint: in-epic
- evidence: Total ball speed falls 72.3 at tick 0 to about 1.4 from tick 6000 on; p95 reflects a short violent opening plus a long quiet tail, not steady-state pinball
- 2026-08-27T22:33:15Z status=routed owner=1-5-a-ball-rolls-drains-and-is-served-on-the-fixed-step-loop by=migration note=Do NOT redesign the spike scene. Re-take the characterization in 1.5 on real geometry; treat Spike 1's number as a floor
- 2026-08-27T22:33:41Z occurrence=1-1-spike-1-the-ported-physics-loop-at-1-khz-over-six-bodies by=migration note=corroborated from the Node leg: corrected-scene Node p95 derives 3.75-4.09 ms per frame while the browser leg reads 1.8 ms, because the two statistics weight the violent opening differently

### DW-15: tsconfig.json gives src/sim/** the DOM lib, so a banned DOM reference typechecks
- source: cr re-review spec-1-1-spike-1 | severity: med | fix-risk: med | footprint: in-epic
- evidence: lib is ES2023+DOM+DOM.Iterable over one include covering src, test and tools, so document.getElementById inside src/sim compiles; only a naive textual scan stands between that and a green build
- 2026-08-27T22:33:15Z status=routed owner=1-3-seam-contracts-the-table-registry-and-boundary-lint by=migration note=1.3 owns AD-16 boundary enforcement: give src/sim its own tsconfig project without DOM, keep tools and test theirs, wire both into dependency-cruiser

### DW-16: The background-throttle guard misses moderate throttling, so measurements taken outside measure.mjs are silently inflated
- source: lead smoke 1.1 | severity: high | fix-risk: low | footprint: in-epic
- evidence: Smoke via Chrome DevTools MCP read p95 4.8 ms vs measure.mjs 4.0 ms on the same build; the MCP browser ran rAF at 28.9 fps while reporting visible and focused, and the guard only rejects frames over 100 ms
- 2026-08-27T22:33:15Z status=open owner=1-2-spike-3-build-size-and-load-time-measured-from-a-link by=migration note=Reject runs whose median frame delta exceeds about 20 ms and report observed cadence beside the p95; do before 4.7 or 6.6 take further numbers
