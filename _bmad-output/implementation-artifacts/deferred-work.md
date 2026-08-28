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
- 2026-08-28T06:42:59Z status=routed owner=burndown by=adjudication note=Not closed by Story 1.3: the lead removed task 19 at the spec-validation gate because AGENTS.md is outside Epic 1's declared footprint (Rule 11). Residual restated: AGENTS.md's bmad:context block still says there is no package.json and no CI, both now false, and says the spine runs to AD-17 where it runs to AD-19. Proper fix is a bmad-project-context run, which regenerates the managed block. Burn-down gate to assign a specific next-epic story key.

### DW-6: ObjectPool exhaustion counters are tracked but never surfaced
- source: spec-1-1-spike-1 | severity: low | fix-risk: low | footprint: in-epic
- evidence: release() sets warned and increments skipped but nothing reads either; src/sim/physics/util/object-pool.ts
- 2026-08-27T22:32:55Z status=open owner=1-8-replays-golden-state-hashes-and-ci-parity by=migration note=Surface via the dev tuning panel (1.9) or assert in the multi-ball goldens (1.8), whichever lands first

### DW-7: Corner HitPoint primitive may be unexercised by either correctness leg
- source: spec-1-1-spike-1 | severity: low | fix-risk: med | footprint: in-epic
- evidence: Six mid-field ball poses may never contact a corner HitPoint in the 10000-tick or 600-frame runs; tools/spike-1/scene.ts
- 2026-08-27T22:32:55Z status=open owner=1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi by=migration note=Cover in 1.4 when real placeholder geometry lands; do NOT redesign the spike scene and invalidate the baseline
- 2026-08-28T11:55:55Z occurrence=1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi
- 2026-08-28T11:55:55Z status=open owner=1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi by=cr note=cr: closing test fires HitPoint only with ball centre at z=0, inside the playfield slab; 96-trajectory sweep of rolling balls = 0 collide() calls
- 2026-08-28T13:52:02Z status=routed owner=1-5-a-ball-rolls-drains-and-is-served-on-the-fixed-step-loop by=adjudication note=NOT closed by Story 1.4, and the review proved why: the corner HitPoints this story emits sit at physics z=0 while a rolling ball's centre rides at its 13.495mm radius above the deck, so a 96-trajectory sweep produced zero collide() calls. The entry's original question -- is the corner HitPoint primitive ever exercised -- is now answered NO, which turns it from a coverage gap into a geometry-modelling question about how walls reduce to primitives. Residual restated for 1.5: either give corner HitPoints the wall's z extent so a rolling ball can reach them, or establish that segment-end corners are unreachable by construction and drop them. Story 1.5 is where a ball first rolls into a corner under real gravity, and DW-51 already sends .blend re-authoring there, so the two land together.

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
- 2026-08-28T03:38:42Z status=resolved-by:1-2-spike-3-build-size-and-load-time-measured-from-a-link by=adjudication note=vite.config.ts plus build/preview/check:dist/check:size scripts, tools/spike-3/measure-load.mjs and the CI workflow are all real committed scaffold; the lead's own five-run ADR measurement ran through exactly these scripts against the live Pages deploy (588,022 B median). Supersedes the ad-hoc npx invocation spike-1.md recorded.

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
- 2026-08-28T06:43:00Z status=resolved-by:1-3-seam-contracts-the-table-registry-and-boundary-lint by=adjudication note=Closed at the compiler layer, not beside it: tsconfig.sim.json drops the DOM lib and @types/node for src/sim/**. Lead negative probe confirmed pnpm typecheck exits 1 with 'Cannot find name document' for a DOM reference in src/sim; QA added test/typecheck-sim-boundary.test.ts, a real tsc --noEmit subprocess regression test whose fixture extends the shipped tsconfig.sim.json, proven non-vacuous. Commit c41849e.

### DW-16: The background-throttle guard misses moderate throttling, so measurements taken outside measure.mjs are silently inflated
- source: lead smoke 1.1 | severity: high | fix-risk: low | footprint: in-epic
- evidence: Smoke via Chrome DevTools MCP read p95 4.8 ms vs measure.mjs 4.0 ms on the same build; the MCP browser ran rAF at 28.9 fps while reporting visible and focused, and the guard only rejects frames over 100 ms
- 2026-08-27T22:33:15Z status=open owner=1-2-spike-3-build-size-and-load-time-measured-from-a-link by=migration note=Reject runs whose median frame delta exceeds about 20 ms and report observed cadence beside the p95; do before 4.7 or 6.6 take further numbers
- 2026-08-28T03:38:42Z status=resolved-by:1-2-spike-3-build-size-and-load-time-measured-from-a-link by=adjudication note=median-rAF-delta guard added to both tools/spike-3/measure-load.mjs (MEDIAN_FRAME_DELTA_MS, 30-frame sample, rejects and reports) and tools/spike-1/browser.ts alongside the old 100ms per-frame guard; cadence reported beside every number and covered by test/spike-1-browser-guard.test.ts. Verified live: the lead's five runs each reported medianFrameDeltaMs 0.5-1.1ms.

### DW-17: This automated-cycle host has no display actively attached, so headed Chrome paces requestAnimationFrame to a stale 29 Hz and every first-frame timing figure taken here is a lower bound, not a consumer figure
- source: spec-1-2-spike-3-build-size-and-load-time-measured-from-a-link.md | severity: med | fix-risk: med | footprint: tools/spike-3/measure-load.mjs; docs/spikes/spike-3.md
- evidence: Win32 EnumDisplaySettings enumerates zero display modes (P/Invoke, not inferred); Win32_VideoController reports a stale 29Hz; headed Chrome paced rAF at ~34.5ms/frame despite every anti-throttle flag until --disable-gpu-vsync and --disable-frame-rate-limit were added
- 2026-08-28T02:53:46Z status=routed owner=4-7-spike-2-the-lightmap-scaling-envelope-and-the-light-group-pa by=harvest note=Distinct from DW-1 (macOS/Safari legs). Routed to Spike 2 as the next story that takes headed-browser timing on this host; Story 6.6 (browser matrix) hits it too. The vsync workaround makes timing a lower bound only; payload byte counts are unaffected and remain fully trustworthy.

### DW-18: The github-pages repository Environment still admits DW-1-epic1 as a deployment branch, a GitHub setting outside version control that no diff or workflow grep will ever surface
- source: spec-1-2-spike-3-build-size-and-load-time-measured-from-a-link.md | severity: low | fix-risk: low | footprint: GitHub repo Settings -> Environments -> github-pages -> Deployment branches
- evidence: Deploy run 33134412545 first failed with 'Branch DW-1-epic1 is not allowed to deploy to github-pages due to environment protection rules' until the policy was widened; the workflow YAML trigger has since been narrowed back to main but this separate setting has not
- 2026-08-28T02:53:57Z status=routed owner=burndown by=harvest note=Merge-gate item for the orchestrator, not a code change: Story 1.2's seventh AC covers only the workflow YAML trigger, which IS narrowed back and verified. This is the other half of the same grant and must be reverted to main-only when Epic 1 merges.
- 2026-08-28T03:30:13Z occurrence=1-2-spike-3-build-size-and-load-time-measured-from-a-link by=cr note=workflow_dispatch fires from any branch; deploy job now guarded by github.ref, Environment setting still open

### DW-19: create-engine.ts's WebGPU-verification failure handling arms its error listeners only through a short post-first-frame grace window and does not scope captured failures to WebGPU-originated errors
- source: spec-1-2-spike-3-build-size-and-load-time-measured-from-a-link.md | severity: low | fix-risk: low | footprint: src/presentation/scene/create-engine.ts:207,280-291
- evidence: Read during review 2026-08-28: WEBGPU_VERIFY_GRACE_MS at :207 bounds the arming window so a later render-pipeline failure would crash the loop with no fallback; the unfiltered onError/onUnhandledRejection at :280-291 would discard a working WebGPU engine on an unrelated window error
- 2026-08-28T02:53:57Z status=routed owner=6-1-press-to-begin-the-platform-gate-and-the-error-panel by=harvest note=Narrow: this story's fixed first-frame placeholder scene demonstrates neither gap live. The spec's own Never list assigns the full platform gate and error panel to Story 6.1, which is the natural owner of deepening this surface.

### DW-20: The minimal boot surface has no load timeout and no error path for failures that happen before onBegin, so several AD-17 boot-stage failures leave a dead page instead of the error panel, and the canvas is never resized
- source: spec-1-2-spike-3-build-size-and-load-time-measured-from-a-link.md | severity: med | fix-risk: med | footprint: out-of-footprint
- evidence: boot.ts awaits bootScene() with no timeout (a stalled glb fetch hides the gate, shows a blank canvas and never reveals #error-panel); byId() throws at module scope before any listener or showError() exists, so a renamed id or a 404 on any of the 66 emitted chunks leaves an enabled press-to-begin button that silently does nothing; no window.resize listener anywhere in src/, so engine.resize() is never called and the fixed inset:0 canvas stretches on any viewport change
- 2026-08-28T03:29:46Z status=routed owner=6-1-press-to-begin-the-platform-gate-and-the-error-panel by=cr note=Spec Never list assigns the full press-to-begin gate, platform gate and error panel to Story 6.1; found by three review layers 2026-08-28

### DW-21: The Babylon engine bundle is fetched during page load, before the WebGL2 check runs, so AD-17's before-any-asset-loads gate holds for the glb but not for the engine itself
- source: spec-1-2-spike-3-build-size-and-load-time-measured-from-a-link.md | severity: med | fix-risk: med | footprint: out-of-footprint
- evidence: index.html loads src/host/boot.ts as a module script; boot.ts statically imports create-engine.ts which statically imports Babylon, so main-*.js plus its 26 modulepreload links (the bulk of the 588 KB measured) transfer before supportsWebGL2() runs; a WebGL2-incapable browser pays the whole engine download before being told it is unsupported. Deferring it needs a dynamic import() inside onBegin(), which would change the load profile this spike exists to measure
- 2026-08-28T03:29:53Z status=routed owner=6-1-press-to-begin-the-platform-gate-and-the-error-panel by=cr note=Found by the acceptance auditor 2026-08-28; the spike doc's contradicting sentence was corrected in this review pass

### DW-22: The deploy-trigger narrow-back also removed CI from every non-main branch push, which the story's own task line requires
- source: spec-1-2-spike-3-build-size-and-load-time-measured-from-a-link.md | severity: low | fix-risk: low | footprint: in-epic
- evidence: ci.yml's single on: block is shared by both jobs, so on.push.branches:[main] silences the checks job on epic-branch pushes too; the spec's task line asks for the checks job on every push and pull request (AR-34 minimum CI) and its own AC (when a commit is pushed to the epic branch, the checks job runs and passes) is no longer reproducible. Branch work now gets CI only once a PR exists. Touches the author-settled narrow-back, so not changed unilaterally at review time
- 2026-08-28T03:30:05Z status=escalated owner=burndown by=cr note=Deploy is now separately guarded by github.ref == refs/heads/main, so re-widening on.push would not re-open the shipping rule
- 2026-08-28T06:43:00Z by=adjudication note=Evidence for the burn-down gate: Story 1.3 widened .github/workflows/ci.yml to a bare 'on: push:' with no branch filter, so CI now runs on every branch push again while the deploy job's own if: guard still restricts publishing to main. Appears closed; disposition deferred to the burn-down gate.

### DW-23: check-dist's external-origin scan is narrower than the frozen I/O matrix row it implements, a disclosed deviation never ratified by the lead
- source: spec-1-2-spike-3-build-size-and-load-time-measured-from-a-link.md | severity: low | fix-risk: low | footprint: in-epic
- evidence: The matrix's Relative paths only row covers every asset reference in dist/index.html AND every emitted chunk, none naming an external origin; check-dist.mjs checks href/src in HTML plus a root-relative /assets/ signal in .js chunks (and, after this review, url()/@import in .css). The narrowing is deliberate and reasoned in the tool header (Babylon embeds doc-comment and optional-CDN URL constants that are never reachable calls, and connect-src self is the real runtime enforcement) but the frozen contract cannot be edited from inside the story
- 2026-08-28T03:30:05Z status=escalated owner=burndown by=cr note=Lead to ratify the narrowing or widen the check; no reachable failure demonstrated either way

### DW-24: The CI workflow declares no default permissions block, so the checks job runs with whatever the repository default GITHUB_TOKEN scope is
- source: spec-1-2-spike-3-build-size-and-load-time-measured-from-a-link.md | severity: low | fix-risk: high | footprint: out-of-footprint
- evidence: Only the deploy job declares permissions (pages/id-token/contents); the checks job runs install, build and actions/upload-pages-artifact@v5 under the repo default, which on many repositories is still read/write. The obvious fix (a top-level permissions: contents: read) risks breaking upload-pages-artifact, which needs its own write scope, and cannot be validated from here without a real CI run
- 2026-08-28T03:30:13Z status=escalated owner=burndown by=cr note=Supply-chain hardening, not required by any AC or AD; verify against a live run at the merge gate rather than patching blind

### DW-25: Provenance ordering is no longer evidenceable from version control: ATTRIBUTIONS.md and package.json first change in the same commit, so CLAUDE.md's record-it-before-you-add-it rule rests on prose rather than on the history
- source: spec-1-2-spike-3-build-size-and-load-time-measured-from-a-link.md | severity: low | fix-risk: low | footprint: ATTRIBUTIONS.md; package.json; .github/workflows/ci.yml
- evidence: Both files first change together in 9595a7c, so no diff can show the attribution row predating the dependency; raised by code review 2026-08-28 as a note rather than a defect since the licences themselves were verified at source and are correct
- 2026-08-28T03:38:55Z status=routed owner=1-3-seam-contracts-the-table-registry-and-boundary-lint by=adjudication note=Substance is satisfied - every licence was read at its source repository and recorded correctly. What is missing is the audit trail. Story 1.3 already extends CI with the per-file licence-header check and is the natural home for a convention that dependency additions land as two commits (attribution first, then the add) or for a check that fails when package.json gains a dependency with no matching ATTRIBUTIONS row.
- 2026-08-28T06:43:00Z status=wontfix-accepted by=adjudication note=Substance closed: tools/check-attributions.mjs makes it impossible for a package.json dependency to exist without an ATTRIBUTIONS.md row, enforced in CI (lead probe: adding left-pad without a row fails check:attributions exit 1). The ordering-as-history half is genuinely not achievable here -- this pipeline finalises a story in one commit, so 'row written in an earlier commit than the pnpm add' cannot be demonstrated from version control. Mechanical enforcement is strictly stronger than the ordering evidence this entry asked for. reopen_if=a dependency lands whose licence is wrong or whose ATTRIBUTIONS.md row was written after the fact

### DW-26: Task 7 asks tuning.ts for a hopControl tunable, but FR-9 names no unit, magnitude or mechanism and the architecture spine's own Deferred section lists hopControl as undecided, so the implementation omitted it and documented the omission
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: med | fix-risk: low | footprint: src/sim/table/tuning.ts
- evidence: No formal AC names hopControl; only task 7's list line does. tuning.ts's header comment and test/tuning.test.ts assert the omission with this rationale; spec Change Log 2026-08-27 'task 7 vs the Block-If rule'
- 2026-08-28T05:59:46Z status=open owner=1-3-seam-contracts-the-table-registry-and-boundary-lint by=harvest note=Lead call at this story's ledger gate: a tunable with no unit, magnitude or mechanism cannot carry AD-15's mandatory source and confidence, so authoring one would violate AD-15 to satisfy a task line the spine itself defers
- 2026-08-28T06:36:24Z occurrence=1-3-seam-contracts-the-table-registry-and-boundary-lint
- 2026-08-28T06:43:00Z status=by-design by=adjudication note=Lead call: a hopControl tunable naming no unit, magnitude or mechanism cannot carry AD-15's mandatory source and confidence fields, so authoring one would violate AD-15 in order to satisfy a task-list line that the architecture spine's own Deferred section lists as undecided. No Acceptance Criterion names hopControl. The omission is documented in src/sim/table/tuning.ts's header and asserted in test/tuning.test.ts; spec task 7 text was corrected to match.

### DW-27: CI applies pnpm install --frozen-lockfile --ignore-scripts to the whole dependency tree on the strength of a one-time check that @swc/core is the only package needing an install script; nothing re-validates that when a dependency is added
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: med | fix-risk: low | footprint: .github/workflows/ci.yml
- evidence: Plain pnpm install --frozen-lockfile exits 1 with ERR_PNPM_IGNORED_BUILDS on @swc/core, so the flag is currently necessary and currently safe; the native binary needs no build step. Future dependencies whose install script is load-bearing would fail silently
- 2026-08-28T05:59:46Z status=routed owner=6-7-release-the-ledger-audit-licence-headers-and-v1-0-0 by=harvest note=Supply-chain hygiene; natural home is the release ledger audit. Not in Story 1.3's delivered scope -- the flag is correct today
- 2026-08-28T06:36:24Z occurrence=1-3-seam-contracts-the-table-registry-and-boundary-lint

### DW-28: ATTRIBUTIONS.md and check:attributions cover only package.json's direct dependencies and devDependencies, not the roughly 40 transitive packages pnpm-lock.yaml adds, and no line states that scope decision explicitly
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: low | footprint: ATTRIBUTIONS.md; tools/check-attributions.mjs
- evidence: Pre-existing project convention this story did not introduce or narrow; the italic note this story replaced already scoped attribution to direct dependencies. CLAUDE.md's provenance rule reads absolute, so the scope boundary is an open policy question rather than a defect
- 2026-08-28T05:59:46Z status=routed owner=6-7-release-the-ledger-audit-licence-headers-and-v1-0-0 by=harvest note=Policy question for the release audit: either state the direct-dependency scope explicitly in ATTRIBUTIONS.md or widen the check to the lockfile
- 2026-08-28T06:36:24Z occurrence=1-3-seam-contracts-the-table-registry-and-boundary-lint

### DW-29: tools/boundary-lint.mjs listFilesRecursive() has no symlink-cycle guard and would stack-overflow on a directory symlink cycle instead of reporting a lint result
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: low | footprint: tools/boundary-lint.mjs
- evidence: Confirmed by code reading: listFilesRecursive() recurses into every directory entry with no visited-path tracking and no lstat symlink check. No symlink exists anywhere in this repository today
- 2026-08-28T05:59:46Z status=open owner=1-3-seam-contracts-the-table-registry-and-boundary-lint by=harvest note=Theoretical today; to be dispositioned at this story's ledger gate
- 2026-08-28T06:43:00Z status=wontfix-theoretical by=adjudication note=No symlink exists anywhere in this repository and none is planned; listFilesRecursive() walks a checked-in source tree, not user input, so there is no realistic reachable failure. reopen_if=a directory symlink is introduced under src/, test/ or tools/, or the walker is ever pointed at a path outside the repository

### DW-30: check-licence-headers' authored-extension allowlist omits shader, script and vector extensions, so Epic 4's .glsl and any .sh/.ps1/.svg ship with no licence header and a green check
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: low | footprint: in-epic
- evidence: AUTHORED_EXTENSIONS lists 12 extensions; .glsl .sh .ps1 .svg .json and extension-less files are silently exempt. Spec task 11 enumerated this exact list, so the tool matches its instruction; the risk lands when Epic 4 adds shaders.
- 2026-08-28T06:36:24Z status=routed owner=6-7-release-the-ledger-audit-licence-headers-and-v1-0-0 by=cr note=inverted allowlist (check everything tracked except known-binary/generated) matches the stated intent

### DW-31: check-attributions accepts a bare name match anywhere in ATTRIBUTIONS.md, so a stale version or a prose mention satisfies a package's provenance row
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: low | footprint: in-epic
- evidence: Verified: package.json declaring vite 99.0.0 passes against the row recording vite 8.2.2, and an ATTRIBUTIONS.md body of 'We do not use left-pad because it is bad' satisfies a left-pad dependency. Spec task 12 asked only for 'no occurrence in ATTRIBUTIONS.md', so the tool matches its instruction.
- 2026-08-28T06:36:36Z status=routed owner=6-7-release-the-ledger-audit-licence-headers-and-v1-0-0 by=cr note=require the declared version and a licence token on the matched row

### DW-32: The three tsconfig projects do not provably cover all of src/, so a future src/*.tsx or a new src/ subdirectory outside sim|host|presentation is typechecked by nothing
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: med | fix-risk: low | footprint: in-epic
- evidence: sim includes src/sim/**, app includes src/host/** + src/presentation/**, node includes test|tools|root configs. A src/index.ts or src/shared/** is in no project. The pre-story tsconfig.json had include: [src,test,tools] and no such hole. boundary-lint does scan .tsx textually, so the two gates disagree about what exists.
- 2026-08-28T06:36:36Z status=routed owner=burndown by=cr note=assert the union of the three project file lists equals the real src listing

### DW-33: deepFreeze short-circuits on an already-frozen node, so children of a pre-frozen sub-object stay mutable while the DeepReadonly<T> return type claims otherwise
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: med | footprint: in-epic
- evidence: Reproduced: deepFreeze(Object.freeze({inner:{a:1}})) then inner.a=99 succeeds. Latent today (TABLE and TUNING are fresh literals) but the helper is exported for reuse. The !Object.isFrozen gate is also the current cycle guard, so a fix needs a visited set rather than unconditional recursion.
- 2026-08-28T06:36:36Z status=routed owner=burndown by=cr note=fix-risk is the cycle guard, not the freeze itself

### DW-34: resolveTuning returns an unfrozen object and converts only top-level scalar keys, so a nested ...Ms tunable is silently never converted and a hand-written ...Ticks key would be overwritten
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: med | fix-risk: low | footprint: in-epic
- evidence: The {...tuning, ...scalarTicks} spread is a fresh mutable object, unlike the frozen TUNING it derives from; the loop walks Object.entries(tuning) one level deep and switchSettleMsByClass is special-cased by name. Story 1.6 adds the ported FlipperMover parameters, which is where nested ...Ms first becomes real.
- 2026-08-28T06:36:49Z status=routed owner=1-6-flippers-and-the-manual-plunger-as-hardware-rules by=cr note=freeze the result and throw on a ...Ticks key collision when the nested case lands

### DW-35: msToTicks has no negative-value and no rounds-to-zero guard, so a sub-millisecond or negative tunable silently becomes 0 or a negative tick count
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: low | footprint: in-epic
- evidence: Math.round((ms * tickHz) / 1000) with only a Number.isFinite check. At the 480 Hz fallback time.ts calls live, any tunable under about 1.04 ms rounds to 0 ticks, disabling the timer it represents rather than failing loudly. No current tunable is affected at 1000 Hz.
- 2026-08-28T06:36:49Z status=routed owner=1-5-a-ball-rolls-drains-and-is-served-on-the-fixed-step-loop by=cr note=first story to consume resolveTuning against real timers

### DW-36: FR-14's tilt-warning default of 1 is never transcribed, so GameAdjustments.tiltWarnings has no table default even though AD-15 lists tiltWarnings among the table tunables
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: med | fix-risk: low | footprint: in-epic
- evidence: epics.md FR-14: 'per-player Tilt warnings on the Backglass up to the Settings count (default 1)'. contracts/replay.ts declares readonly tiltWarnings: number on GameAdjustments; tuning.ts seeds tiltWarningSpacingMs and tiltSettleMs but no tiltWarnings. The value is artifact-stated, so the Block-If does not apply; task 7's own seed list simply does not name it.
- 2026-08-28T06:36:49Z status=routed owner=2-11-tilt-warnings-tilt-and-slam-tilt by=cr note=the story that owns tilt warnings seeds the default

### DW-37: The dependency-cruiser config has no no-circular rule and no rules constraining direction inside sim/, so a cycle among the seam contracts or a sim/table to sim/physics import passes
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: low | footprint: in-epic
- evidence: Six forbidden rules cover sim to host|presentation, sim to Babylon, contracts to outside, presentation to sim internals, host to physics|rules, and Havok. Nothing forbids sim/table importing sim/physics or sim/rules, nothing constrains physics vs rules direction, and no no-circular rule exists. The repo has no cycle today. Spec task 9 named five rules; review added the sixth.
- 2026-08-28T06:37:03Z status=routed owner=burndown by=cr note=no-circular is six lines of config and would pass clean today

### DW-38: no-device-name-literal has broad single-letter prefixes and no suppression mechanism, so an ordinary c_ f_ or l_ string in presentation code is a violation with no in-file escape hatch
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: low | footprint: in-epic
- evidence: The pattern is ^(s|c|l|f|gi|bd|shot|show)_[a-z0-9_]+$ over all of src/**. A CSS class 'c_hidden', a shader uniform 'f_time' or an i18n key 'l_label' matches; the only remedy is editing tools/boundary-lint.mjs. Epic 4's lighting and Epic 5's art are where non-device strings in that shape become likely.
- 2026-08-28T06:37:03Z status=routed owner=burndown by=cr note=add a per-line suppression comment or a narrow allowlist before Epic 4

### DW-39: The boundary-lint fixtures prove every rule fires but never prove its exemptions hold, so an over-broad exemption edit would leave the whole suite green
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: med | fix-risk: low | footprint: in-epic
- evidence: Fixtures exist for TICK_HZ named outside its two permitted files and a literal ...Ms outside tuning.ts, but nothing asserts that sim/contracts/time.ts and sim/table/tuning.ts are themselves exempt, nor that the exemption is path-exact rather than basename-matched; the same holds for no-device-name-literal's single dragonwar.ts exemption. Changing the check to relative.endsWith('tuning.ts') would pass every existing test.
- 2026-08-28T06:37:03Z status=routed owner=burndown by=cr note=fixtures at the exact exempt paths plus a near-miss path each

### DW-40: no-havok is scoped from ^src/ and the cruise only ever walks src, so the 'banned everywhere' promise is not enforced in tools/, test/ or root config files
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: med | footprint: in-story
- evidence: tools/boundary-lint.mjs passes srcArg='src' to dependency-cruiser, so even an unscoped from: pattern could not reach tools/ or test/. Widening the cruise would subject test/fixtures/** (deliberate violations) to the real rules, so the fix is not a two-way door. No @babylonjs/havok entry can reach package.json without a check:attributions row first.
- 2026-08-28T06:37:17Z status=wontfix-theoretical owner=1-3-seam-contracts-the-table-registry-and-boundary-lint by=cr note=real if a havok import ever lands in tools/ or test/ with an attributions row already present

### DW-41: coilRampUp 2.5 from AR-17 is not seeded in tuning.ts
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: low | footprint: in-story
- evidence: AR-17 states 'coil ramp-up 2.5' and AD-15 lists ramp-up among table tunables, but task 7's own 'seed exactly' list does not name it, and the spec's Consumed-by section explicitly assigns the ported FlipperMover parameters (strength, ramp-up, end-of-stroke, return) to Story 1.6 because their units come from the port. AR-17 states the magnitude but no unit, so a unit-suffixed name cannot be authored here without inventing one.
- 2026-08-28T06:37:17Z status=by-design owner=1-3-seam-contracts-the-table-registry-and-boundary-lint by=cr note=Story 1.6 transcribes it with the port's units; re-raise there, not here

### DW-42: src/host/loop.ts is absent although epics.md Story 1.3 AC 1 and AR-1 both name it in the structural seed
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: low | footprint: in-story
- evidence: Verified absent: src/host holds boot.ts, build-info.ts and the four subdirectories. Task 8 rules it out explicitly ('src/host/loop.ts is Story 1.5's; note the gap in a comment') and the intent-contract's Never clause forbids building the fixed-step loop this story does not own; boot.ts carries the gap comment. A placeholder file would be the Never clause's violation, not its satisfaction.
- 2026-08-28T06:37:17Z status=by-design owner=1-3-seam-contracts-the-table-registry-and-boundary-lint by=cr note=Story 1.5 creates it with advance(); the seed AC is satisfied by every other path

### DW-43: The shipped page declares no favicon, so every load of the deployed site emits a 404 for /favicon.ico in the browser console
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: low | footprint: index.html; public/
- evidence: Observed at Story 1.3's browser smoke against a real preview of the current dist: the only console error on load is 'Failed to load resource: 404' for http://localhost:4187/favicon.ico. index.html declares no icon link and public/ ships no favicon
- 2026-08-28T06:46:08Z status=routed owner=6-1-press-to-begin-the-platform-gate-and-the-error-panel by=smoke note=Cosmetic and pre-existing (index.html is Story 1.2's, untouched by 1.3), but it is a console error on every load of a public site and Story 6.1 owns the press-to-begin shell and error panel, so it is the natural place to add an icon

### DW-44: docs/spikes/spike-3.md still describes public/assets/dragonwar.glb as the output of tools/make-placeholder-glb.mjs, which Story 1.4 retires
- source: spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md | severity: low | fix-risk: low | footprint: docs/spikes/spike-3.md
- evidence: Lines 198-204 name the generator and the date; line 509 records the one-glb-versus-split decision against the 1560-byte placeholder. No test reads those lines, so nothing goes red. docs/** is outside Epic 1's declared footprint and Story 1.3 forbade editing either spike record
- 2026-08-28T11:07:38Z status=open owner=1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi by=harvest note=To be adjudicated at this story's ledger gate; the plan recommends correct-as-history
- 2026-08-28T13:52:02Z status=wontfix-accepted by=adjudication note=docs/spikes/spike-3.md is a DATED record of what was true on 2026-08-27, not live documentation; a generator retired the next day does not make the record wrong, and docs/** is outside Epic 1's declared footprint (Rule 11) while Story 1.3's spec forbade editing either spike record. No test reads those lines and ATTRIBUTIONS.md -- which IS live -- now names exactly one owner for public/assets/dragonwar.glb. reopen_if=a reader is actually misled by the spike record, or the spike documents are ever promoted from dated records to live documentation

### DW-45: The collision loader ignores the document's own version/units/frame handshake that export.py writes, so a units:m or version:2 document loads silently at 1000x scale
- source: spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md | severity: med | fix-risk: low | footprint: in-epic
- evidence: tools/export.py writes version:1 units:mm frame:table; src/sim/physics/loader/index.ts's CollisionDoc interface declares only nodes and switchZones and reads none of them; test/asset-contract.test.ts does not check them either
- 2026-08-28T11:56:05Z status=routed owner=1-5-a-ball-rolls-drains-and-is-served-on-the-fixed-step-loop by=cr note=1.5 owns the host-side fetch that hands the loader its parsed document; assert the handshake there
- 2026-08-28T13:44:59Z occurrence=1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi

### DW-46: resolveBlender()'s conventional-location step hardcodes the C: drive and English Program Files, and its macOS/Linux candidates are absolute paths no test can inject
- source: spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md | severity: low | fix-risk: low | footprint: in-epic
- evidence: tools/blender.mjs expandBlenderFoundationDir('C:\Program Files\Blender Foundation') while the sibling per-user branch correctly reads env.LOCALAPPDATA; the darwin and Linux candidate lists are unreachable through the env parameter, so they are covered on no platform
- 2026-08-28T11:56:05Z status=routed owner=burndown by=cr note=env.ProgramFiles / env['ProgramFiles(x86)'] is the portable form; a base-dir env hook would also make the POSIX branches testable
- 2026-08-28T13:44:59Z occurrence=1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi

### DW-47: l_insert_left's lens protrudes 0.5 mm above the playfield surface, against AD-11's 'lens and cup geometry below the surface'
- source: spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md | severity: low | fix-risk: low | footprint: in-epic
- evidence: tools/make-placeholder-blend.py builds the lens box from z -1.0 to +0.5 while vis_playfield spans z -1.0 to 0.0; the cup (z -7 to -1) is correct. No physics effect (l_ is visual; only col_ is hit), but it is a lip in the authored surface
- 2026-08-28T11:56:20Z status=routed owner=burndown by=cr note=Fix needs the .blend regenerated, which this review is forbidden to do; Epic 2 re-authors this geometry -- lead to re-own to the 2.1 key

### DW-48: The collision loader's flipper-length assertion is axis-agnostic, so a bat with the right extent on the WRONG axis passes
- source: spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md | severity: low | fix-risk: low | footprint: in-epic
- evidence: src/sim/physics/loader/index.ts takes Math.max over the bbox's x, y and z extents and compares that to TABLE.reference.flipperBatIn * MM_PER_IN; the col_playfield assertion beside it is correctly per-axis
- 2026-08-28T11:56:20Z status=routed owner=1-6-flippers-and-the-manual-plunger-as-hardware-rules by=cr note=1.6 replaces the placeholder flipper collision behind the same node names and the same asserted 3.125 in length -- pin the axis there

### DW-49: The collision loader parses each node's surface property and then discards it, so AD-13's contact-sound selection has no carrier
- source: spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md | severity: low | fix-risk: low | footprint: in-epic
- evidence: src/sim/physics/loader/index.ts reads surface into CollisionNodeDoc but applyMaterial() keys only on physMaterial; no hit object ends up carrying a ContactSurface. The sibling 'devices' field got an explicit comment explaining its deferral; surface is dropped silently
- 2026-08-28T11:56:20Z status=routed owner=burndown by=cr note=AD-13 drives contact sound from ContactEvent.surface; the first audio consumer needs this wired -- lead to re-own to that story

### DW-50: Nothing automated covers ATTRIBUTIONS.md's generated-asset provenance rows, so a future asset can land with no row and every check stays green
- source: spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md | severity: low | fix-risk: low | footprint: out-of-footprint
- evidence: tools/check-attributions.mjs maps only package.json dependency keys onto ATTRIBUTIONS.md and has no concept of asset files; test/attributions.test.ts pins every earlier story's code rows in detail but adds nothing for the three assets Story 1.4 commits
- 2026-08-28T11:56:20Z status=routed owner=6-7-release-the-ledger-audit-licence-headers-and-v1-0-0 by=cr note=CLAUDE.md treats provenance as a hard gate and this is the first story to commit binary assets; the release-audit story already owns check-attributions scope

### DW-51: bd_trough's authored eject pose cannot deliver a ball to the shooter lane, so Story 1.5's serve AC is unrealisable from the delivered geometry
- source: spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md | severity: med | fix-risk: high | footprint: in-epic
- evidence: bd_trough is authored at table (255,-60,10) with eject dir (0,1,0) (tools/make-placeholder-blend.py:260-261, public/assets/dragonwar.collision.json devices[]); the shooter lane is x in [480.4,514.4]. Every placeholder wall and flipper is axis-aligned and every TUNING material has scatter 0, so a ball ejected with zero x-velocity keeps x=255 for all time and enters the playfield through the drain gap, never the lane -- no eject SPEED (the tunable 1.5 owns) can steer it 243 mm sideways. epics.md Story 1.5 AC: 'a ball spawns from the highest filled trough slot at the authored eject pose INTO THE SHOOTER LANE, s_shooter_lane closes'.
- 2026-08-28T13:45:17Z status=escalated owner=1-5-a-ball-rolls-drains-and-is-served-on-the-fixed-step-loop by=cr note=Story 1.4's own ACs are met (the empties exist, are posed and export); this is the handover to 1.5. Fix is geometry -- re-author the .blend and regenerate three byte-verified artifacts -- and the shape is a design choice (move the trough to the lane foot, add a feed channel, or give the eject a direction with an x component), so it is a named decision at the epic gate rather than a reviewer patch. Nothing cross-checks a device's eject pose against the sw_ zone it is supposed to reach either.

### DW-52: addWall()'s vertex-mean centroid orients faces outward only for a CONVEX footprint, so a non-convex wall polygon would face reflex edges inward
- source: spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md | severity: low | fix-risk: low | footprint: in-epic
- evidence: src/sim/physics/loader/index.ts addWall() takes the arithmetic mean of the footprint vertices as the 'inside' reference point orientedEdge() faces away from. That point is guaranteed inside the polygon only when the polygon is convex; for a non-convex footprint it can fall outside, and every reflex edge is then oriented INWARD -- a one-sided wall the ball passes through, the same class as the divider defect this story already fixed. Not reachable today: this review added an axis-aligned + non-degenerate guard to tools/export.py, and wall_footprint_mm() emits exactly four axis-aligned corners.
- 2026-08-28T13:45:17Z status=routed owner=2-1-the-playfield-geometry-and-the-full-switch-set by=cr note=Becomes real the first time a wall footprint is anything but an axis-aligned rectangle. Guard shape: assert convex CCW winding in addWall(), or emit a decomposed convex set from export.py.

### DW-53: The placeholder table has no vertical containment: walls are 50 mm tall with no top cap, so a ball above that height leaves the field laterally with nothing between it and the 400 mm glass
- source: spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md | severity: low | fix-risk: med | footprint: in-epic
- evidence: tools/make-placeholder-blend.py WALL_H_MM = 50.0; src/sim/physics/loader/index.ts addWall() spans each LineSeg from zLow to zHigh only, and places corner HitPoints at zLowVu. col_glass sits at z = 400 mm, so between z = 50 and z = 400 the playfield has no lateral boundary at all. No test bounds vertical escape.
- 2026-08-28T13:45:35Z status=routed owner=2-1-the-playfield-geometry-and-the-full-switch-set by=cr note=Placeholder geometry Epic 2 re-authors; recorded so the real geometry pass sets wall heights against a glass height that is itself a placeholder, and so 1.5's first live ball has a named reason if it ever exits the field sideways.

### DW-54: The new resolvePlayfieldNodes() throw between Scene creation and the render loop is neither ordering-verified nor leak-safe
- source: spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md | severity: low | fix-risk: med | footprint: in-epic
- evidence: src/presentation/scene/create-engine.ts now resolves TABLE.nodes and applies pitch after ImportMeshAsync and before the first frame. Two gaps in that new failure path: (1) the Scene is not disposed when the throw happens -- every sibling test wraps scene.dispose() in a finally, and the production path leaks it; (2) test/scene-smoke.test.ts's case is titled 'throws BEFORE THE FIRST FRAME RENDERS' but asserts only that the promise rejects, so moving the resolve after the render-loop promise would keep it green while a half-resolved unpitched frame reached the canvas ahead of AD-17's error panel.
- 2026-08-28T13:45:35Z status=routed owner=6-1-press-to-begin-the-platform-gate-and-the-error-panel by=cr note=6-1 owns AD-17's boot-stage failure path and already owns DW-19/20/21 on the same surface. Pin the ordering with a scene.render spy; dispose in a catch.

### DW-55: applyPitch() silently overwrites playfield_root's transform: its P - R*P correction is valid only while playfield_root is at identity and pivot_pitch is an unparented sibling, both true by authoring accident and asserted nowhere
- source: spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md | severity: low | fix-risk: low | footprint: in-epic
- evidence: src/presentation/scene/playfield.ts applyPitch() reads nodes.pivotPitch.position (a LOCAL translation) and assigns playfieldRoot.rotationQuaternion and .position outright. Correct only when playfieldRoot is at the identity and the pivot is expressed in its parent frame -- both hold today only because tools/make-placeholder-blend.py authors all three roots as unparented top-level empties. test/scene-smoke.test.ts's own comment says Epic 2 moves the pivot.
- 2026-08-28T13:45:35Z status=routed owner=2-1-the-playfield-geometry-and-the-full-switch-set by=cr note=Cheap guard: assert playfield_root is at identity on the first applyPitch(), or compose the pitch onto the authored transform instead of replacing it.

### DW-56: Story 1.4's embedded glTF texture cannot load under the CSP that AD-17, NFR-7, SOLUTION-DESIGN and Story 1.2's AC all pin verbatim, so the app fails to boot in a real browser
- source: spec-1-4-a-placeholder-table-at-real-dimensions-through-the-export-pi.md | severity: high | fix-risk: med | footprint: index.html CSP meta tag; tools/export.py texture embedding; ARCHITECTURE-SPINE AD-17; epics.md NFR-7 and Story 1.2 AC
- evidence: Lead per-story smoke on a real preview of the current dist: press-to-begin yields 'Something went wrong / Failed to start: Unable to load from ./assets/dragonwar.glb: /textures/0'. Console shows two CSP blocks -- connect-src 'self' blocks fetching the blob and default-src 'self' (img-src fallback) blocks loading the image. The glb embeds one PNG img_playfield_translucency as mat_playfield's baseColorTexture; Babylon serves embedded glTF images through blob: URLs. 442 tests pass because NullEngine never decodes images and no test enforces the CSP in a real browser
- 2026-08-28T13:55:29Z status=decision-pending owner=burndown by=smoke note=Rule 5 tripwire: the pinned CSP and the textured-playfield AC are incompatible as worded. Escalated to the user at the epic gate -- amending AD-17 is outside the epic footprint. Note the narrow fix does NOT weaken NFR-7's intent: blob: and data: are same-document schemes that cannot reach the network, and connect-src would still exclude remote origins
