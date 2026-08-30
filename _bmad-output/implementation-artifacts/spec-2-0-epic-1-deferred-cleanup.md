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
- `pnpm test` -- expected: **76 files, 950 passed, 21 skipped**.
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions && pnpm build && pnpm check:dist && pnpm check:size` -- expected: all exit 0.
- `pnpm check:ad7` -- expected: **exit 1** (deliberately red, `DW-70`, owned by Story 2.5). Exit 0 is a Block If.
- `git status --short && git diff --stat` -- expected: both empty after the mutation is reverted.

**Mutations (Rule 19):**

- `mutation: delete the 18-line upstream VPDB copyright block (lines 1-18) from src/sim/physics/anim-object.ts, keeping its one-line port marker → test/port-provenance.test.ts goes red on exactly 2 tests — "anim-object.ts carries either the upstream copyright block + port marker, or the DragonWar GPL-3.0 header" (header provenance, AD-16) and "anim-object.ts: content hash (normalised line endings) matches the pinned PORT_BODY_HASHES entry" (port-body freeze, DW-79) — while pnpm check:headers stays exit 0. Reverted with git checkout; sha256 of anim-object.ts back to 0e6308f212fe171d2b12ba79e50058e34b18b77a1447565696b5991812072e83, git status --short and git diff --stat both empty.` **Observed red at `c529d32` during planning**, against the pre-rename filename. **Re-observed post-rename** during this implementation pass: same 2 tests went red for the same reasons, `pnpm check:headers` stayed exit 0, revert restored the exact pinned sha256, `git status --short` and `git diff --stat` were both empty afterward (only this story's own staged rename/edits remained). AC 5 satisfied against the renamed file, not just the pre-rename planning observation.

**Manual checks:**

- Read `test/port-provenance.test.ts`'s new header comment and confirm it states the owner (Story 2.0), the four assertions the file makes, and the two it does not make with the owning gate named for each (AC 2).

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
