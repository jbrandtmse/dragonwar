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

### DW-26: Task 7 asks tuning.ts for a hopControl tunable, but FR-9 names no unit, magnitude or mechanism and the architecture spine's own Deferred section lists hopControl as undecided, so the implementation omitted it and documented the omission
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: med | fix-risk: low | footprint: src/sim/table/tuning.ts
- evidence: No formal AC names hopControl; only task 7's list line does. tuning.ts's header comment and test/tuning.test.ts assert the omission with this rationale; spec Change Log 2026-08-27 'task 7 vs the Block-If rule'
- 2026-08-28T05:59:46Z status=open owner=1-3-seam-contracts-the-table-registry-and-boundary-lint by=harvest note=Lead call at this story's ledger gate: a tunable with no unit, magnitude or mechanism cannot carry AD-15's mandatory source and confidence, so authoring one would violate AD-15 to satisfy a task line the spine itself defers

### DW-27: CI applies pnpm install --frozen-lockfile --ignore-scripts to the whole dependency tree on the strength of a one-time check that @swc/core is the only package needing an install script; nothing re-validates that when a dependency is added
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: med | fix-risk: low | footprint: .github/workflows/ci.yml
- evidence: Plain pnpm install --frozen-lockfile exits 1 with ERR_PNPM_IGNORED_BUILDS on @swc/core, so the flag is currently necessary and currently safe; the native binary needs no build step. Future dependencies whose install script is load-bearing would fail silently
- 2026-08-28T05:59:46Z status=routed owner=6-7-release-the-ledger-audit-licence-headers-and-v1-0-0 by=harvest note=Supply-chain hygiene; natural home is the release ledger audit. Not in Story 1.3's delivered scope -- the flag is correct today

### DW-28: ATTRIBUTIONS.md and check:attributions cover only package.json's direct dependencies and devDependencies, not the roughly 40 transitive packages pnpm-lock.yaml adds, and no line states that scope decision explicitly
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: low | footprint: ATTRIBUTIONS.md; tools/check-attributions.mjs
- evidence: Pre-existing project convention this story did not introduce or narrow; the italic note this story replaced already scoped attribution to direct dependencies. CLAUDE.md's provenance rule reads absolute, so the scope boundary is an open policy question rather than a defect
- 2026-08-28T05:59:46Z status=routed owner=6-7-release-the-ledger-audit-licence-headers-and-v1-0-0 by=harvest note=Policy question for the release audit: either state the direct-dependency scope explicitly in ATTRIBUTIONS.md or widen the check to the lockfile

### DW-29: tools/boundary-lint.mjs listFilesRecursive() has no symlink-cycle guard and would stack-overflow on a directory symlink cycle instead of reporting a lint result
- source: spec-1-3-seam-contracts-the-table-registry-and-boundary-lint.md | severity: low | fix-risk: low | footprint: tools/boundary-lint.mjs
- evidence: Confirmed by code reading: listFilesRecursive() recurses into every directory entry with no visited-path tracking and no lstat symlink check. No symlink exists anywhere in this repository today
- 2026-08-28T05:59:46Z status=open owner=1-3-seam-contracts-the-table-registry-and-boundary-lint by=harvest note=Theoretical today; to be dispositioned at this story's ledger gate
