---
title: 'Story 2.0: Epic 1 Deferred Cleanup — the provenance gate''s rename and owner'
type: 'chore'
created: '2026-08-30'
status: 'done'
baseline_revision: '02fa9222e2545f1970018138928ad3a87f7ca5ac'
baseline_commit: 'c529d324596763604ff06037dc6b94d4b87f92f0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-epic-1-burn-down.md'
warnings: ['oversized']
deferred:
  - summary: >-
      sprint-status.yaml's retro action item 5 (give test/sim-boundary.test.ts
      a deliberate owner) is not marked done even though this story's
      completion fully resolves it.
    evidence: |-
      The entry epic-1-retro-item-5-give-test-sim-boundary-test-ts-a-deliber
      remains status: open in _bmad-output/implementation-artifacts/sprint-status.yaml.
      The established convention (retro items 4, 6-8) closes such items in a
      dedicated chore commit once the underlying work lands (commits 40a7d44,
      1a234cf) -- that closing commit is lead/runner bookkeeping, outside
      bmad-build-auto's own contract of editing only the spec file and the
      reviewed diff.
    location: >-
      _bmad-output/implementation-artifacts/sprint-status.yaml
    severity: low
  - summary: >-
      test/spike-1-harness-boundary.test.ts:10,17 misattributes to
      test/port-provenance.test.ts a banned-global/DOM-global scan that
      Story 1.3 actually moved to tools/boundary-lint.mjs.
    evidence: |-
      Confirmed pre-existing at baseline (c529d32): git show
      c529d324596763604ff06037dc6b94d4b87f92f0:test/spike-1-harness-boundary.test.ts
      carries the identical wording against the old filename
      ("test/sim-boundary.test.ts checks the opposite direction ... stay
      clean of DOM/engine globals"), which was already stale before this
      story since Story 1.3 moved that scan to tools/boundary-lint.mjs. This
      story's Task 8 mechanical path-token substitution correctly carried the
      pre-existing string forward without introducing the misattribution;
      fixing the underlying claim is outside this story's mechanical-only
      scope for that file.
    location: >-
      test/spike-1-harness-boundary.test.ts:10,17
    severity: low
---

<intent-contract>

## Intent

**Problem:** Epic 1's retrospective (Finding 2) measured `test/sim-boundary.test.ts` as modified by 10 of 10 stories — the only file with that distinction — while carrying the epic's licensing gate and having no owner. Its name promises import-direction assertions it has not contained since Story 1.3 moved those to `tools/boundary-lint.mjs`. The first proposed remedy (make `pnpm check:headers` the single authority and strip the test) rested on a false premise and was overturned by measurement; AD-16 was rewritten on 2026-08-30 to record three complementary gates instead. This story implements that correction.

**Approach:** `git mv` the file to `test/port-provenance.test.ts` so history follows, update all 21 references across 18 files, rewrite the file's header comment to name Story 2.0 as its documented owner and to state what the file does and does not assert, and prove by mutation that the rename did not quietly stop the gate enforcing. No assertion is added, removed or weakened; no product behaviour changes.

## Boundaries & Constraints

**Always:**

- Operate from `C:/git/dragonwar/.worktrees/epic-2`. Verify `git rev-parse --show-toplevel` equals it before reading state or editing.
- Rename with `git mv`, never delete-and-create — the AC requires history to follow.
- All three of the file's `describe` blocks survive intact and unedited: header provenance (56 tests), the AD-15 verbatim solver-constants pin (1 test), and the DW-79 port-body freeze (44 tests). 101 tests in, 101 tests out. Only the filename, the header comment and the references change.
- Match references on the **full path token** `test/sim-boundary.test.ts`, never the bare substring `sim-boundary` (see Design Notes — a bare-substring sweep corrupts two unrelated names).
- All seven gates stay green: `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`. Suite baseline is 76 files / 950 pass / 21 skip.
- The AC-5 mutation is applied to the source, observed red, reverted, and the tree confirmed byte-identical (`git status --short` and `git diff --stat` both empty) before finishing. Record it under `## Verification` as a `mutation:` line (Rule 19).

**Block If:**

- **`pnpm check:ad7` exits 0.** It is a deliverable RED naming a live AD-7 violation (`DW-70`), routed to Story 2.5 as that story's own deliverable. If it goes green, that is a regression to revert, not a win.
- Any of the five golden hashes in `test/replays/*.golden.json` changes. Nothing here touches simulated behaviour; a moved hash means something was misread. STOP and report — do not re-stamp.
- The rename appears to require editing a `DW-79`-frozen port body, or re-pinning any `PORT_BODY_HASHES` entry. It does not (see Code Map); if it appears to, the premise is wrong.
- An AC appears to contradict AD-16 as written on disk. HALT as an `intent gap` naming the AD (Rule 6).

**Never:**

- **Never reopen `DW-79`.** It is `resolved-by:1-8-replays-golden-state-hashes-and-ci-parity` and its resolution IS this file's port-body hash manifest. The manifest must keep working across the new filename; no entry is reopened, retired or re-pinned.
- **Never retire either sibling gate.** `pnpm check:headers` and `tools/boundary-lint.mjs` both stay exactly as they are. AD-16 forbids retiring any of the three in favour of another.
- Never rename, touch or "tidy" `test/typecheck-sim-boundary.test.ts`, `test/fixtures/tsc-sim-boundary/**`, or `test/spike-1-harness-boundary.test.ts`'s own filename. They are different files that merely share a word.
- Never edit the Story 2.0 block in `_bmad-output/planning-artifacts/epics.md` or the architecture `.memlog.md`. Both deliberately name the old path to describe the pre-rename state.
- No new behaviour, no new tunable, no new dependency, no assertion added or removed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rename lands | `git mv test/sim-boundary.test.ts test/port-provenance.test.ts` | `vitest.config.ts`'s `include: ['test/**/*.test.ts']` glob discovers it unchanged; 101 tests still run; `git log --follow` traces history | No config edit needed; if the file is not collected, the glob or the name is wrong |
| Manifest across the rename | `PORT_BODY_HASHES` keys resolved via `PHYSICS_ROOT = resolve(__dirname, '..','src','sim','physics')` | All 41 entries still resolve; `__dirname` is unchanged because old and new names share the `test/` directory | A "stale entry" or "missing entry" failure means the rename moved directories — it must not |
| Stripped copyright block (AC 5) | Delete the 18-line upstream VPDB block from `src/sim/physics/anim-object.ts`, keep the one-line port marker | `pnpm check:headers` exits **0** (presence satisfied); `test/port-provenance.test.ts` goes **red** on exactly 2 tests | Revert restores a byte-identical tree; suite returns to 950 pass / 21 skip / 76 files |
| Bare-substring sweep (the trap) | `sed s/sim-boundary/port-provenance/g` | Corrupts `typecheck-sim-boundary` (13 refs) and `tsc-sim-boundary` (2 refs) into names that no longer resolve | Forbidden; match `test/sim-boundary\.test\.ts` only |

</intent-contract>

## Code Map

Every anchor below was read and every count measured at `c529d32`.

**The file under rename — `test/sim-boundary.test.ts`, 427 lines, 101 tests**

- `:1-19` the header comment to be rewritten. Currently narrates what Story 1.3 superseded; says nothing about ownership.
- `:21-42` imports; `:41` `SIM_ROOT`, `:42` `PHYSICS_ROOT = path.resolve(SIM_ROOT, 'physics')` — **derived from `__dirname`**, so a same-directory rename changes nothing.
- `:45` `describe('src/sim/physics/** header provenance (AD-16)')` — 56 tests. `:84` `AUTHORED_FILES` (11 entries).
- `:261` `describe('src/sim/physics/constants.ts — AD-15 verbatim solver constants pin')` — 1 test.
- `:312` `describe('... port-body freeze (DW-79) ...')` — 44 tests (3 structural + 41 per-file hashes). `:333-374` `PORT_BODY_HASHES`, 41 entries **keyed relative to `PHYSICS_ROOT`, not to this file** — the rename cannot disturb them. `:376` `AUTHORED_FILES_LOCAL`.
- **Two self-references to update:** `:290` (a quoted claim about the file) and `:423` (a failure message telling the reader which file to re-pin).

**The 21 references, across 18 files** — all matched by `test/sim-boundary\.test\.ts`:

- `src/sim/loop/replay.ts:153`; `src/sim/physics/devices.ts:18`, `flippers.ts:14`, `geometry.ts:8`, `loader/index.ts:11`, `machine.ts:28`, `plunger.ts:16`, `switches.ts:22` — all prose comments citing `AUTHORED_FILES` or the constants pin.
- `src/sim/physics/hop.ts:5` — **the only line-anchored reference**: `` `test/sim-boundary.test.ts:325-370` ``. The range is **already stale** (the freeze describe starts at `:312`) and the AC-2 header rewrite shifts every line anyway. Replace the path *and* drop the brittle range in favour of naming the describe block.
- `tools/check-licence-headers.mjs:47` — **named explicitly by AC 1**: the comment defers structural checking to "test/sim-boundary.test.ts's own, stricter third branch" and must name the new path. The tool's actual check is `:98`, a three-way OR of substring **presence** (`AUTHORED_HEADER` / `PORT_MARKER` / `VPINBALL_PORT_MARKER`) — this is the measured proof it is not a duplicate of the test.
- `tools/boundary-lint.mjs:74`, `:108`; `tools/dependency-cruiser.config.mjs:127`.
- `test/ac6-scatter-and-prng.test.ts:88`; `test/entry-html-csp.test.ts:56`; `test/spike-1-harness-boundary.test.ts:10`, `:17` (content only — **not** its own filename).
- `test/fixtures/boundary/src/sim/banned-global.js:5`; `test/fixtures/boundary/src/sim/physics/fake-port-non-ascii.ts:7`.

**Must NOT change — 15 refs sharing the word, naming different things**

- `typecheck-sim-boundary` ×13 — `tools/boundary-lint.d.mts:6`, `tools/boundary-lint.mjs:84` (**same file as two must-change refs**), `test/module-coverage.test.ts:72`, and the 10 fixture headers under `test/fixtures/tsc-sim-boundary/`. All name `test/typecheck-sim-boundary.test.ts`, the DW-32 typecheck-coverage suite.
- `tsc-sim-boundary` ×2 — `test/typecheck-sim-boundary.test.ts:24`, `:39` (its fixture directory).

**Read-only evidence (measured this pass, no edit required)**

- `vitest.config.ts:8` `include: ['test/**/*.test.ts']` — glob discovery; no test-file name is enumerated anywhere.
- `package.json` and `.github/workflows/ci.yml` contain **zero** `sim-boundary` hits. Root docs (`AGENTS.md`, `CLAUDE.md`, `ATTRIBUTIONS.md`) contain **zero**. Nothing to change in either place.
- `ARCHITECTURE-SPINE.md` AD-16 (`:~204`) and the Conventions "Licence headers" row (`:268`) **already name `test/port-provenance.test.ts`**. The spine is already in the target state — do not edit it.
- Historical records that keep the old name by design: `epics.md:799,803,805,806,827` (Story 2.0's own charter), the architecture `.memlog.md:77-78`, `cycle-log-epic-1.md`, `cycle-log-epic-2.md`, `deferred-work.md`, `epic-1-retro-2026-08-30.md`, and the ten Epic 1 `spec-1-*.md` files.

## Tasks & Acceptance

**Execution:**

1. `test/sim-boundary.test.ts` -- `git mv` to `test/port-provenance.test.ts` -- history follows the file (AC 1); no content change in this step.
2. `test/port-provenance.test.ts` -- rewrite the header comment `:1-19` -- name **Story 2.0** as the documented owner; state what it asserts (structural provenance: upstream copyright block intact, authored/ported branches disjoint, `VPINBALL_PORTED_FILES` real and disjoint, plus the AD-15 constants pin and the DW-79 port-body freeze) and what it deliberately does **not** assert (per-file presence → `check:headers`; import direction → `tools/boundary-lint.mjs`), so the duplicate-gate confusion cannot be re-derived (AC 2).
3. `test/port-provenance.test.ts` -- update the two self-references at `:290` and `:423` -- the failure message must tell the reader the file's real name.
4. `tools/check-licence-headers.mjs` -- update the `:47` comment to name `test/port-provenance.test.ts` -- AC 1 names this file explicitly; leave the `:98` presence check untouched.
5. `src/sim/physics/hop.ts` -- update `:5` to the new path **and** replace the stale `:325-370` range with a reference to the port-body-freeze describe block -- line anchors into this file are invalidated by task 2 and should not be re-introduced.
6. `src/sim/loop/replay.ts`, `src/sim/physics/{devices,flippers,geometry,machine,plunger,switches}.ts`, `src/sim/physics/loader/index.ts` -- update the one comment reference in each -- grouped: identical mechanical substitution, one line each.
7. `tools/boundary-lint.mjs` (`:74`, `:108`), `tools/dependency-cruiser.config.mjs` (`:127`) -- update path references -- **leave `boundary-lint.mjs:84` alone**; it names `typecheck-sim-boundary`.
8. `test/ac6-scatter-and-prng.test.ts`, `test/entry-html-csp.test.ts`, `test/spike-1-harness-boundary.test.ts` (`:10`, `:17`), `test/fixtures/boundary/src/sim/banned-global.js`, `test/fixtures/boundary/src/sim/physics/fake-port-non-ascii.ts` -- update path references -- comments only; no assertion changes.
9. Verification sweep -- run the commands in `## Verification`, including the AC-5 mutation with its byte-identical revert.

**Acceptance Criteria:**

- **AC 1 (rename + references).** Given `test/sim-boundary.test.ts`, when it is renamed with `git mv` to `test/port-provenance.test.ts` and every reference is updated, then `git grep -n "test/sim-boundary\.test\.ts" -- src test tools package.json .github` returns **zero** hits, `git log --follow test/port-provenance.test.ts` shows the pre-rename history, all eight named gates pass, and the only surviving `sim-boundary` mentions are the 15 `typecheck-sim-boundary`/`tsc-sim-boundary` refs plus historical records.
- **AC 2 (documented owner).** Given the "everybody edits it, nobody owns it" pattern, when the header comment is read, then it names Story 2.0 as owner, lists the four things the file asserts, and names the two things it deliberately does not assert with the gate that owns each.
- **AC 3 (three gates intact).** Given AD-16 as rewritten 2026-08-30, when the tree is checked, then all three gates are present and none retired: `tools/check-licence-headers.mjs` (presence, `git ls-files`), `test/port-provenance.test.ts` (structure + AD-15 pin + DW-79 freeze), `tools/boundary-lint.mjs` (imports, banned globals, tick/ms, device-name literals).
- **AC 4 (DW-79 intact).** Given `DW-79` is `resolved-by:1-8-...`, when the rename lands, then all 41 `PORT_BODY_HASHES` entries still resolve and pass, the freeze describe still reports 44 tests, no hash is re-pinned, and `DW-79` stays resolved.
- **AC 5 (mutation — the gate still enforces).** Given a rename that quietly stopped enforcing would be invisible, when the 18-line upstream VPDB copyright block is deleted from `src/sim/physics/anim-object.ts` while its one-line port marker is kept, then `pnpm check:headers` exits **0** and `test/port-provenance.test.ts` goes **red on exactly 2 tests**; reverting restores a byte-identical tree and the suite returns to 76 files / 950 pass / 21 skip.

### Review Findings

**bmad-code-review, 2026-08-30 — full mode (spec present), review tier: all four layers run (`blind-hunter`, `edge-case-hunter`, `verification-gap`, `acceptance-auditor`), no model override (all at opus).** Every finding carries severity / fix-risk / footprint / spec-status per Rule 15 and is dispositioned here, at review time.

**Index** — 0 `decision-needed`, 7 `patch` (all applied), 0 `defer`, 5 closed at emission (`by-design` 4, `wontfix-accepted` 1), 3 groups dismissed as noise.

- [x] [Review][Patch] QA pinning file's `git grep` assertions self-invalidate on commit [test/story-2-0-rename-provenance.test.ts:56,62]
- [x] [Review][Patch] Rule 19 — AC 2 had no pinning test and no `mutation:` line [test/port-provenance.test.ts:1-32]
- [x] [Review][Patch] Rule 19 — the zero-hit sweep assertion could pass vacuously under `grep.patternType=fixed` [test/story-2-0-rename-provenance.test.ts:57]
- [x] [Review][Patch] AC 3's test claimed the gates were "wired" but never read CI [test/story-2-0-rename-provenance.test.ts:76]
- [x] [Review][Patch] DW-108 — banned-global scan misattributed to the renamed file [test/spike-1-harness-boundary.test.ts:10,17]
- [x] [Review][Patch] Dangling "this tool" referent in a fixture [test/fixtures/boundary/src/sim/banned-global.js:5]
- [x] [Review][Patch] `## Verification` stated the pre-QA suite baseline as the expected result [spec-2-0-epic-1-deferred-cleanup.md:194]

**Resolved by patch (7)**

1. **HIGH · fix-risk low · in-story · spec-clear — the QA pinning file's `git grep` assertions self-invalidate the moment the file is committed.** Found independently by all four layers. `git grep` searches TRACKED files; `test/story-2-0-rename-provenance.test.ts` was untracked, and its own prose and test names spell the very tokens it asserts about. Measured: with `--untracked` (byte-identical to the post-commit state, as it was the only untracked file in scope) the old-path token returned **3 hits** at `:5`, `:55`, `:56` instead of zero, and the sweep-hazard counts went **13 → 17** and **2 → 5**. Two of the four tests would have gone red on the lead's own finalize commit, turning `pnpm test` — and therefore CI at `.github/workflows/ci.yml:117` — red, while AC 1's own stated acceptance command stopped returning zero hits. Their green was a property of the index, not of the sweep. *Patched:* every search now runs through one helper that appends `SELF_PATHSPEC = ':(exclude)test/story-2-0-rename-provenance.test.ts'`, with a header note saying why it must not be removed. Verified stable in both index states (tracked-only and `--untracked`: zero hits, counts 13 / 2).
2. **MED · fix-risk low · in-story · spec-clear — Rule 19: AC 2 (documented owner) had no pinning test anywhere and no `mutation:` line.** Raised by `verification-gap`; `acceptance-auditor` reached the same place from the other side. AD-16's Rule ends by requiring that `test/port-provenance.test.ts` "is owned by Story 2.0 and names its owner in its header comment" — and nothing read that header. The whole AC-2 deliverable could be deleted with 101/101 green, all eight gates green, and all four QA tests green; the "everybody edits it, nobody owns it" condition the story exists to end could silently return. *Patched:* added a fifth test pinning the ownership sentence, the four enumerated assertions, and the two "deliberately does NOT assert" entries with their owning gate. Mutation demonstrated and reverted byte-identically (see `## Verification`).
3. **MED · fix-risk low · in-story · spec-clear — Rule 19 falsifiability: the zero-hit sweep assertion could pass vacuously.** Raised by `edge-case-hunter`. The check used a regex (`test/sim-boundary\.test\.ts`) whose meaning depends on `grep.patternType` in the ambient gitconfig; under `patternType=fixed` the escaped-dot pattern matches nothing, so the assertion would pass while a real stale reference sat in the tree, and nothing would notice. *Patched:* all searches now use `-F` (fixed strings), pinning the meaning regardless of gitconfig, and the test opens with a **positive control** — the post-rename token must be found (21 hits) — so a zero-hit result can no longer be vacuous.
4. **MED · fix-risk low · in-story · spec-clear — AC 3's test claimed the gates were "wired" but never read CI.** Raised by `blind-hunter`. It checked `package.json` script text plus file existence, so deleting the `Boundary lint` or `Licence headers` step from `.github/workflows/ci.yml` left it green while the gate stopped running — precisely the "quietly retired" failure AD-16 was rewritten to prevent. *Patched:* the test now also asserts CI still invokes `pnpm check:headers`, `pnpm lint:boundaries` and `pnpm test`. Mutation demonstrated: the same edit that was previously invisible now turns it red.
5. **LOW · fix-risk low · in-story · two-way door — `DW-108`: `test/spike-1-harness-boundary.test.ts:10,17` misattributed the banned-global / DOM-global scan to `test/port-provenance.test.ts`.** Found by three layers. Confirmed pre-existing at baseline `c529d32` and carried forward mechanically by Task 8's path-token sweep — but the Task 2 header rewrite landed in the same commit and states the opposite ("This file deliberately does NOT assert ... Import direction"), so a stale line became a live, same-commit contradiction between two files this story touched. Verified by grep that `test/port-provenance.test.ts` contains no banned-global, `window`, `document` or `@babylonjs` scan at all, and that `tools/boundary-lint.mjs:429` owns it (`sim-no-banned-global`). *Patched:* both lines now name `tools/boundary-lint.mjs`, with the AD-16 pointer. Ledger entry closed `resolved-by:2-0-epic-1-deferred-cleanup`.
6. **LOW · fix-risk low · in-story · two-way door — `test/fixtures/boundary/src/sim/banned-global.js:5-6` had a dangling referent.** Found by `blind-hunter` and `acceptance-auditor`. The build-auto review pass reworded this comment to "superseded **by this tool** per AD-16", phrasing correct in `tools/boundary-lint.mjs` where it originated but meaningless in a fixture, which is not a tool. *Patched:* now names `tools/boundary-lint.mjs` explicitly.
7. **MED · fix-risk low · in-story · spec-clear — the spec's `## Verification` still stated the pre-QA suite baseline as the expected result.** Found by `acceptance-auditor` and `verification-gap`. `pnpm test` was listed as "expected: 76 files, 950 passed, 21 skipped" while the delivered tree produces 77 / 954 (now 77 / 955), so anyone re-running the story's own verification would read a false failure. *Patched:* that line updated with a dated `[UPDATED …]` marker. The `## Auto Run Result` section was deliberately **not** rewritten — it is build-auto's historical record of what it observed, and 76 / 950 / 21 was true when written.

**Robustness patches folded into the same file (no separate finding IDs):** `result.error` / `result.signal` now checked on every child process (a git binary absent, a non-git checkout or a killed child previously surfaced as a misleading "expected 1, received null"); both git helpers carry a 30 s timeout (previously none — a stalled git blocked the suite with no diagnostic); the nested vitest run's child timeout (120 s) and its test timeout (180 s) no longer race at the same value; `JSON.parse` is wrapped so an unparseable report names itself instead of throwing a bare `SyntaxError`; the hard-coded shape counts and describe-title lookups now carry messages telling a future story what to do when a physics file is legitimately added; the AD-16 spine slice terminates on the next `### AD-` heading rather than on `AD-17` specifically, so renumbering an unrelated AD no longer reports "AD-16 is missing"; and `resolveVitestBin()` replaces the hard-coded `node_modules/vitest/vitest.mjs` literal — the exact literal `DW-71` removed from `test/solver-termination.test.ts`, reintroduced here.

**Rule 14 note (self-inflicted, caught and fixed in this pass):** while rewriting the QA file the reviewer's own `Write`/`Edit` tooling normalised QA's correct `—` escape into a literal U+2014 byte in the AD-15 describe-title lookup — the identical failure Rule 14 documents ("the reviewer's own Edit tool normalized the literal BOM away mid-patch"). Detected by a byte scan (`tr -d '\000-\177'` → 3 bytes), restored to the escape form via a script file rather than an inline shell replacement (`sed` ate the `\u`, and two nested-quoting attempts re-inserted the literal), and re-verified: the file is now pure ASCII (0 non-ASCII bytes) and all five tests pass. Worth recording because the escape survives review only if someone measures bytes — reading the diff shows an em dash either way.

**Closed at emission — `by-design` (4)**

- **The sweep did not cover `_bmad-output/planning-artifacts/`, which `epics.md:805` names.** Real divergence, and the right call: the two files involved are this story's own charter in `epics.md` (which must keep saying "rename `test/sim-boundary.test.ts` to `test/port-provenance.test.ts`" to remain intelligible) and the architecture `.memlog.md` (append-only by `.gitattributes` `merge=union`; editing its history is forbidden by construction). The epic's own exception clause — "historical records that describe the past" — covers both by intent, and the spec recorded the reasoning explicitly in its Code Map. Documented deviation, no product impact.
- **The `## Boundaries` "no assertion added or removed" clause versus the QA pass adding a whole test file.** Raised by `acceptance-auditor` as a contradiction. The clause is scoped by its own neighbours ("All three of the file's `describe` blocks survive intact and unedited … 101 tests in, 101 tests out. Only the filename, the header comment and the references change") to `test/port-provenance.test.ts`, not to the suite; a chore spec's intent contract cannot bind the later QA stage out of existence. The build-auto review pass's *rejection rationale* citing this clause was wrong, and the residual it left is finding 2 above, now fixed.
- **`deferred-work.md`'s `DW-79` entry body and the Epic 1 `spec-1-*.md` line anchors still name the old path.** Ledger entry bodies are write-once by Rule 15 (only trailers are appended) and `DW-79` is terminal; the Epic 1 specs are historical records of what was true then. Rewriting either would falsify history.
- **AC 3's recorded mutation exercised one of the test's assertion groups, not all five.** Rule 19 is explicit: "One demonstrated mutation per AC, not per assertion — the discipline scopes to the pinning test, not the suite." `verification-gap` separately confirmed the undemonstrated assertions are genuinely falsifiable.

**Closed at emission — `wontfix-accepted` (1)**

- **LOW · comment reflow left ragged lines in `tools/boundary-lint.mjs:72-79` and `src/sim/physics/hop.ts:5-9`,** and `boundary-lint.mjs:180`'s bare "the superseded stand-in" lost its nearest antecedent when `:74` was reworded. Cosmetic only; every claim is accurate. Not worth diff noise in a physics source file and a lint tool during a rename chore. `reopen_if=` a reader files a confusion report against either comment, or a later story misreads the extension set `boundary-lint.mjs:72-79` describes.

**Dismissed (noise / false positive)**

- **"AC 1's history-follows clause was never observed."** False at review time: the story's code diff is already committed (`2bebbac`), so `git log --follow --oneline test/port-provenance.test.ts` reaches Story 1.1's commits (`6d2be83`) — run and confirmed this pass. The `## Auto Run Result` note saying it "cannot show pre-rename history until the finalize commit lands" was true when written and is now merely stale.
- **"The AC-5 mutation no longer reds exactly 2 tests."** AC 5's wording is scoped to `test/port-provenance.test.ts`, where it remains exactly 2. Worth knowing for a future re-observer that at *suite* level the QA file's nested run also reds, but AC 5 is not contradicted.
- Style preferences with no correctness consequence: sharing the spine path with `test/agents-md-consistency.test.ts`, `existsSync` versus `readFileSync().not.toThrow()`, consolidating the two git helpers, renaming the QA file away from a story number, replacing the nested vitest run with a body-diff against `c529d32`, widening the sweep pathspec beyond AC 1's own five paths, and the header's "STRUCTURE" label covering two value pins.

**Verification after patching:** `pnpm test` = 77 files / 955 passed / 21 skipped. `pnpm typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size` all exit 0. `pnpm check:ad7` still exits 1 naming `DW-70` / `AD-7` / `bd_trough` — the deliberate red is intact, no regression. `git diff --stat -- test/replays/` empty; no golden moved. All three review mutations reverted byte-identically.

## Spec Change Log

## Review Triage Log

### 2026-08-30 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 1, low 1)
- defer: 2: (high 0, medium 0, low 2)
- reject: 2: (high 0, medium 0, low 2)
- addressed_findings:
  - `medium` `patch` The spec's `## Verification` mutation line only recorded the pre-rename, planning-time observation of AC 5's mutation; per Rule 19 a mutation re-observed only in an earlier context is not evidence for this pass. Re-ran the mutation independently against the renamed file (deleted the 18-line VPDB block from `src/sim/physics/anim-object.ts`, confirmed `test/port-provenance.test.ts` went red on exactly the same 2 named tests while `pnpm check:headers` stayed exit 0, reverted, confirmed byte-identical tree) and appended the post-rename re-observation to the mutation line.
  - `low` `patch` `tools/boundary-lint.mjs:74` and `test/fixtures/boundary/src/sim/banned-global.js:5` referred to "test/port-provenance.test.ts's superseded stand-in" — a narrative this story's own header rewrite (Task 2) removed from that file, orphaning the cross-reference. Reworded both comments to describe the historical Story 1.1 stand-in directly (with an AD-16 pointer) instead of depending on prose that no longer exists in the renamed file's header. Re-ran the full verification sweep afterward (gates + `pnpm test`) — unchanged: 76 files / 950 passed / 21 skipped, all eight gates in their expected state.

Rejected: the Verification Gap layer's observation that AC 1/AC 2 have no permanent vitest pinning test (checked only by one-off `git grep`/`git log` commands and a manual header read) — the reviewer itself judged this not a behavioral gap, and adding a new assertion to pin it would violate the intent-contract's own "no assertion added or removed" constraint. Also rejected: the Intent Alignment layer's secondary observation that the DW-79 freeze describe block's failure-message string was edited — Task 3 explicitly authorizes updating this exact self-reference, and the Boundaries clause's "only the filename, the header comment and the references change" carve-out covers it.

Deferred: sprint-status.yaml's still-open retro action item 5 (closing it is lead/runner bookkeeping outside this story's file scope) and `test/spike-1-harness-boundary.test.ts`'s pre-existing (confirmed present at baseline, before this story) misattribution of a banned-global scan to the renamed file — both recorded in frontmatter `deferred:` above.

## Design Notes

**Governing architecture decisions (Rule 6):** **AD-16** governs this story end to end — it is the decision rewritten on 2026-08-30 that names the three complementary gates, already specifies `test/port-provenance.test.ts` as the structural gate's name, and states that the file "is owned by Story 2.0 and names its owner in its header comment". **AD-15** is touched only in that its verbatim solver-constants pin lives inside the renamed file and must survive unchanged. The spine's Conventions "Licence headers" row (`:268`) is already consistent with the target state. No spine edit is required by this story, so Rule 20 does not fire.

**Integration ACs (Rule 1) — escape clause, stated explicitly:** this story introduces **no** service, module or shared component. It renames one test file, rewrites one comment block and updates 21 comment references. There is therefore no consumer to integrate against and no Integration AC. The nearest thing to a consumer relationship is AC 5, which exercises the renamed gate end to end through its real runtime (`vitest` + `pnpm check:headers`) rather than by inspection.

**Consumed-by (Rule 2):** none — no downstream story consumes an interface introduced here. **Consumes:** `tools/check-licence-headers.mjs` and `tools/boundary-lint.mjs` only as sibling gates whose comments cross-reference this file; neither is modified behaviourally.

**Ledger inbox (Rule 17):** empty. Story 2.0 owns no ledger entries — Epic 1's decision sheet left every routed entry owned by a specific later story key (2.1a takes DW-77/78/105/52/55/59, 2.1b takes DW-58/67/68, 2.5 takes DW-70/85). `DW-79` is closed and stays closed. Do not adopt entries owned by other stories.

**Why a bare-substring sweep is forbidden.** `sim-boundary` names three unrelated things in this repo: the file being renamed, `test/typecheck-sim-boundary.test.ts` (DW-32's typecheck-coverage suite, 13 refs), and `test/fixtures/tsc-sim-boundary/` (its fixture directory, 2 refs). `test/typecheck-sim-boundary.test.ts` does **not** contain the substring `test/sim-boundary.test.ts` — the character before `sim-boundary` is `-`, not `/` — so the anchored pattern `test/sim-boundary\.test\.ts` selects exactly the 21 references to change and nothing else. `tools/boundary-lint.mjs` contains both kinds (`:74`/`:108` change, `:84` must not), so a per-file blanket substitution is unsafe even there.

**Why the manifest survives the rename.** `PORT_BODY_HASHES` is keyed on paths relative to `PHYSICS_ROOT`, which is computed from `__dirname`. Old and new filenames sit in the same `test/` directory, so `__dirname` — and therefore every key's resolution — is unchanged. This is what makes AC 4 a verification rather than a migration.

## Verification

**Commands:**

- `git rev-parse --show-toplevel` -- expected: exactly `C:/git/dragonwar/.worktrees/epic-2` before any edit (Rule 13).
- `git grep -n "test/sim-boundary\.test\.ts" -- src test tools package.json .github` -- expected: **zero hits**.
- `git grep -o "typecheck-sim-boundary" -- src test tools | wc -l` -- expected: **13**, unchanged. `git grep -o "tsc-sim-boundary" -- src test tools | wc -l` -- expected: **2**, unchanged.
- `git log --follow --oneline test/port-provenance.test.ts | tail -3` -- expected: pre-rename commits present (history followed).
- `npx vitest run test/port-provenance.test.ts` -- expected: **101 passed**, in three describes (56 / 1 / 44).
- `pnpm test` -- expected: **77 files, 954 passed, 21 skipped**. `[UPDATED 2026-08-30 at code review — was 76 / 950 / 21, the pre-QA baseline. The QA pass added test/story-2-0-rename-provenance.test.ts (4 tests), and the code-review pass added a fifth (the AC-2 header pin), so a re-runner following this line literally would otherwise read a false failure. AC 5 and the I/O matrix row still quote the 76 / 950 / 21 figure as the state observed when they were written; the '## Auto Run Result' section is left exactly as build-auto recorded it.]`
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions && pnpm build && pnpm check:dist && pnpm check:size` -- expected: all exit 0.
- `pnpm check:ad7` -- expected: **exit 1** (deliberately red, `DW-70`, owned by Story 2.5). Exit 0 is a Block If.
- `git status --short && git diff --stat` -- expected: both empty after the mutation is reverted.

**Mutations (Rule 19):**

- `mutation: delete the 18-line upstream VPDB copyright block (lines 1-18) from src/sim/physics/anim-object.ts, keeping its one-line port marker → test/port-provenance.test.ts goes red on exactly 2 tests — "anim-object.ts carries either the upstream copyright block + port marker, or the DragonWar GPL-3.0 header" (header provenance, AD-16) and "anim-object.ts: content hash (normalised line endings) matches the pinned PORT_BODY_HASHES entry" (port-body freeze, DW-79) — while pnpm check:headers stays exit 0. Reverted with git checkout; sha256 of anim-object.ts back to 0e6308f212fe171d2b12ba79e50058e34b18b77a1447565696b5991812072e83, git status --short and git diff --stat both empty.` **Observed red at `c529d32` during planning**, against the pre-rename filename. **Re-observed post-rename** during this implementation pass: same 2 tests went red for the same reasons, `pnpm check:headers` stayed exit 0, revert restored the exact pinned sha256, `git status --short` and `git diff --stat` were both empty afterward (only this story's own staged rename/edits remained). AC 5 satisfied against the renamed file, not just the pre-rename planning observation.

**Manual checks:**

- Read `test/port-provenance.test.ts`'s new header comment and confirm it states the owner (Story 2.0), the four assertions the file makes, and the two it does not make with the owning gate named for each (AC 2).

### QA pinning tests (bmad-qa-generate-e2e-tests pass, 2026-08-30)

New file (QA): `test/story-2-0-rename-provenance.test.ts` -- 4 tests, pinning the CHORE's own invariants that nothing else in the suite asserts (does not duplicate anything `test/port-provenance.test.ts` already checks about its own content). Discoverable by the default `pnpm test` run (`test/*.test.ts`, no skip tag); raises the suite baseline from 76 files / 950 passed / 21 skipped to **77 files / 954 passed / 21 skipped** (re-confirmed after all four mutations below were reverted). `pnpm check:ad7` re-confirmed still exit 1 (DW-70/AD-7/bd_trough named) -- no regression introduced by this pass.

Each of the four tests was confirmed falsifiable by a real, reverted mutation (`git status --short` / `git diff --stat` empty and file sha256 back to its pre-mutation value after every revert):

- `mutation: append a stale "test/sim-boundary.test.ts" comment line to tools/check-licence-headers.mjs → test/story-2-0-rename-provenance.test.ts's "no reference to the pre-rename path token ... survives" test goes red (git grep now returns 1 hit, status 0, instead of status 1 / zero hits).` Reverted with `git checkout -- tools/check-licence-headers.mjs`; sha256 back to its tracked value, `git status --short` and `git diff --stat` both empty, test green again.
- `mutation: in tools/boundary-lint.mjs, change the one "test/typecheck-sim-boundary.test.ts" reference (a must-not-change ref naming the unrelated DW-32 suite) to "test/typecheck-port-provenance.test.ts" → the "reference-sweep hazard survives untouched" test goes red (typecheck-sim-boundary count 12, expected 13).` Reverted with `git checkout -- tools/boundary-lint.mjs`; sha256 back to `e307744ca5b16f4c9897aefe1219b8e1c86ab836bd32300a078c2fb484b6b07d`, `git status --short` and `git diff --stat` both empty, test green again.
- `mutation: in package.json, retarget the "check:headers" script to a non-existent "tools/check-headers-renamed-for-qa-mutation.mjs" → the "all three AD-16 gates are present and wired" test goes red (script no longer contains "tools/check-licence-headers.mjs").` Reverted with `git checkout -- package.json`; sha256 back to `8614146e36e9e8fb2328dab59ea6deee37689c9a4f13e57ef50d9db507e819c4`, `git status --short` and `git diff --stat` both empty, test green again.
- `mutation: in test/port-provenance.test.ts, comment out the single "it(...)" block inside the AD-15 constants-pin describe (lines 283-299) → the "still reports its pre-rename structural shape" test goes red (numTotalTests 100, expected 101).` Reverted with `git checkout -- test/port-provenance.test.ts`; sha256 back to `0b50a3a39fb38db91ef7113b5c1f3cbe656b235d57cd6773b69d0c899ebffb23`, `git status --short` and `git diff --stat` both empty, test green again.

`mutations_demonstrated=4`.

### Code-review pinning tests (bmad-code-review pass, 2026-08-30)

The QA file was hardened and gained a fifth test (the AC-2 header pin). Suite baseline rises again, to **77 files / 955 passed / 21 skipped**. Three mutations were applied, observed red, and reverted byte-identically by the reviewing pass itself (`git status --short` / `git diff --stat` empty for each target and its sha256 restored):

- `mutation: change "Owned by Story 2.0" to "Owned by Story 9.9" in test/port-provenance.test.ts's header comment → test/story-2-0-rename-provenance.test.ts's new "AC 2: ... header still names Story 2.0 as its owner ..." test goes red ("the header comment must name Story 2.0 as the file's documented owner (AC 2, AD-16)"), and it alone — the other four stay green.` Reverted with `git checkout --`; sha256 back to `0b50a3a39fb38db91ef7113b5c1f3cbe656b235d57cd6773b69d0c899ebffb23`. **This is AC 2's pinning test — before this pass AC 2 had none, and its entire deliverable could be deleted with a green suite (Rule 19).**
- `mutation: append a stale "test/sim-boundary.test.ts" comment line to tools/check-licence-headers.mjs → the "no reference to the pre-rename path token ... survives" test goes red.` Reverted with `git checkout --`; sha256 back to `5cfd01d2df8dfb38a8b6fa49173692074a42deb75cdcb185929ad38abbe0416f`. This re-demonstrates the QA pass's own first mutation **after** the self-exclusion pathspec was added, proving the exclusion is scoped to the asserting file only and has not blinded the sweep check.
- `mutation: replace ci.yml's "run: pnpm lint:boundaries" step with "run: pnpm typecheck" → the "all three AD-16 gates are present and wired" test goes red ("CI must still run the AD-16 imports gate").` Reverted with `git checkout --`; sha256 back to `81c79dc168e314ded0b6359132c669c8144448296784f89992bcdb4011e9d3f0`. Before this pass the same mutation left that test **green** — the test read `package.json` and file existence only, so a gate could be retired from CI while the test that exists to detect exactly that went on passing (AD-16, AC 3).

`mutations_demonstrated=3` (code review), `7` cumulative for the story.

## Auto Run Result

Status: done
Blocking condition: none

**Summary of implemented change:** `git mv test/sim-boundary.test.ts test/port-provenance.test.ts` (history preserved via a detected 92%-similarity rename), the file's header comment rewritten to name Story 2.0 as owner and state the four things it asserts plus the two it deliberately does not (with the owning gate for each), all 21 references across 18 files updated to the new path (matched on the anchored token `test/sim-boundary\.test\.ts`, never the bare substring), and `tools/check-licence-headers.mjs`'s `:47` comment updated to name the new path as the structural authority. No test assertion, describe-block structure, or product behaviour changed. Two review-triggered documentation patches were applied on top (see Review Triage Log).

**Files changed:**
- `test/sim-boundary.test.ts` -> `test/port-provenance.test.ts` (git mv; header rewritten; two internal self-references updated)
- `tools/check-licence-headers.mjs` -- comment at old `:47` now names the new path
- `src/sim/physics/hop.ts` -- path + stale line-range replaced with a describe-block name reference
- `src/sim/loop/replay.ts`, `src/sim/physics/{devices,flippers,geometry,machine,plunger,switches}.ts`, `src/sim/physics/loader/index.ts` -- one comment reference each, mechanical substitution
- `tools/boundary-lint.mjs` (`:74`, `:108`) -- path references updated; `:84`'s `typecheck-sim-boundary` reference left untouched; `:74` additionally reworded in the review patch pass (see below)
- `tools/dependency-cruiser.config.mjs` -- one comment reference
- `test/ac6-scatter-and-prng.test.ts`, `test/entry-html-csp.test.ts`, `test/spike-1-harness-boundary.test.ts` (`:10`, `:17`), `test/fixtures/boundary/src/sim/banned-global.js`, `test/fixtures/boundary/src/sim/physics/fake-port-non-ascii.ts` -- path references updated; `banned-global.js` additionally reworded in the review patch pass
- `_bmad-output/implementation-artifacts/spec-2-0-epic-1-deferred-cleanup.md` -- this file: status/baseline frontmatter, `deferred:` list, Review Triage Log, this section

**Review findings breakdown:** 2 patches applied, 2 items deferred, 2 items rejected (0 intent_gap, 0 bad_spec). See `## Review Triage Log` above for the full breakdown and rationale.

**Follow-up review recommendation:** `false`. This pass's patched findings: 1 medium (the `## Verification` mutation line lacked a post-rename re-observation), 1 low (two stale "superseded stand-in" cross-references orphaned by the header rewrite) -- no high-severity patch, and `3 x medium(1) + 1 x low(1) = 4`, below the threshold of 5.

**Verification performed:** All Verification-section commands run and passing after the patch pass: `git rev-parse --show-toplevel` = `C:/git/dragonwar/.worktrees/epic-2`; `git grep -n "test/sim-boundary\.test\.ts" -- src test tools package.json .github` = zero hits; `typecheck-sim-boundary` count = 13 (unchanged), `tsc-sim-boundary` count = 2 (unchanged); `npx vitest run test/port-provenance.test.ts` = 101 passed (56 header-provenance / 1 AD-15 pin / 44 DW-79 freeze); `pnpm test` = 76 files / 950 passed / 21 skipped (baseline exactly preserved, re-confirmed after the patch pass); `pnpm typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size` all exit 0; `pnpm check:ad7` stays exit 1, still naming `DW-70`/`AD-7`/`bd_trough` -- no Block-If fired. AC-5 mutation independently re-applied and observed by this reviewing pass (not merely the implementation subagent's self-report, per Rule 19): deleted the 18-line VPDB block from `src/sim/physics/anim-object.ts`, confirmed `test/port-provenance.test.ts` went red on exactly the 2 named tests while `pnpm check:headers` stayed exit 0, reverted with `git checkout --`, confirmed sha256 back to `0e6308f2...072e83` and `git diff --stat -- src/sim/physics/anim-object.ts` empty. `git diff --stat -- test/replays/` confirmed empty (no golden hash moved). `git log --follow` for the renamed file cannot show pre-rename history until the finalize commit lands (build-auto commits only at finalize per Rule 16); this is a re-checked at finalize, not a pending gap -- see below.

**Residual risks:** None blocking. Two low-severity pre-existing/administrative items recorded in frontmatter `deferred:` for the lead/runner to harvest: closing `sprint-status.yaml`'s retro action item 5, and a pre-existing (predates this story) misattribution comment in `test/spike-1-harness-boundary.test.ts`.
