# Bug report — `/epic-cycle` routed-entry planning gap, unvalidated ledger owner keys, and no gate that reads CI

**Filed:** 2026-08-30 (fourth report; first filed against kit `2026-08-30.1`)
**Kit version:** base `2026-08-30.1`, parallel `2026-08-30.1`
**BMAD:** 6.11.0 · **uv:** 0.12.5 · **Platform:** Windows 11, Git Bash
**Command file analysed:** `C:/git/dragonwar/.claude/commands/epic-cycle.md` (1296 lines; all `L<n>` refer to it)
**Rules file:** `C:/git/dragonwar/_bmad/custom/skill-rules.md`
**Context:** DragonWar (DW-1), Epic 1 Stories 1.9–1.10 + the full epic close, Orchestrator Mode + one epic-runner
**Reported by:** orchestrator session (Opus 5)

**Standing note — the `2026-08-30.1` changes are holding.** Rule 11's authority/concurrency split
removed the footprint friction that dominated report #3: the runner made **zero** clarifications
across Story 1.9, the burn-down gate, and Story 1.10, against 9 in the previous stretch. It applied
one amendment and reported four footprint extensions, and the post-hoc `amendments_verified` check
confirmed all of them (95 insertions, 0 deletions — a pure insertion, genuinely tier-1). Rule 19
worked as designed and caught three would-be vacuities *before* they shipped. BUG 1 below is the
one place where the ledger machinery introduced in `2026-08-30.1` does not yet close its own loop.

---

## Summary

Measured over Epic 1's final session (Stories 1.9–1.10 + close-out):

| Signal | Value |
|---|---|
| Runner clarifications | **0** across 2 stories + burn-down gate |
| User decisions required | 4 (merge path, retro, bug report, TICK_HZ) |
| Ledger total | 89 → 107 |
| Ledger at epic close | `open=0`, `escalated=0`, `decision_pending=0`, `burndown` owns nothing |
| Decision-sheet entries | 15 (7 born this session) |
| Entries owned by a single unplanned story (`2-1`) | **15** |
| Entries silently orphaned on a phantom owner key | **2** (DW-85, DW-87) |
| CI red duration on the epic branch | **~16 h, 2 full story pipelines, 5+ pushes** |
| `cr_complete` high+med per story | 4.40 (threshold 2.00) |
| Protocol violations | 1, in Story 1.8 (pre-session) |
| False halts | **0** |

All three bugs below are the same shape: **the pipeline records a belief it never checks.** The
ledger believes a story will pick up its entries; nobody verifies the story exists. The gates
believe the suite is green; nobody reads CI. Each is cheap to close.

---

## BUG 1 — routed ledger entries never reach the plan stage, so adjudication can only audit, never steer

### What happened

At the Epic 1 merge gate, eight entries were routed to named stories in epics 2, 6 and 3. Combined
with the burn-down overflow, **Story 2.1 now owns 15 ledger entries before a single line of Epic 2
has been planned.**

The pipeline order (L~"Per Story") is:

```
plan spawn -> spec written          <- LEDGER never consulted
spec validation                     <- checks `decision-pending` dependencies ONLY
implement -> code review
ledger_adjudicated                  <- NOW the runner discovers the story owns 15 entries
```

By the time `ledger_adjudicated` fires, the story is already `done`: code review has passed and the
design is fixed. The gate's three outcomes are *resolved-by*, *re-owned*, or *terminal* — **"fix it"
is not among them.** The only repair path is the Fix Pack, which the kit caps at LOW two-way-door
items (≈≤15 changed lines). Anything larger is re-owned, and the kit says so plainly:

> "re-owning is not failure, silent carry-forward is."

So `ledger_adjudicated` is an **audit** checkpoint, not a repair one. Facing 15 entries the delivered
work was never shaped to address, a runner has exactly two affordable moves: mass re-owning, or
optimistic `resolved-by` claims. Both are on the kit's own anti-pattern list ("Relabelling instead of
closing"). The gate that exists to stop drift is placed where it can only observe it.

The backstops are real but late: the epic's burn-down gate forces a conclusion for entries owned by
*that epic's* keys, and Story X.0 re-triages at the next epic's start. Within an epic, routing is
therefore safe. **Across epics it is not** — the entry rides until the receiving epic's own X.0, by
which point the story that was supposed to absorb it may already have shipped.

### Why it matters more under `2026-08-30.1`

The new burn-down bounding (`burndown_story_max`) is correct and worked — Story 1.10 chartered 12
entries and closed all 12 on evidence. But bounding the charter necessarily *increases* the
overflow, and the overflow is exactly the population this bug mishandles. Epic 1 re-owned 10 entries
outward. The better the burn-down gate behaves, the more load this gap carries.

### Proposed fix (author's preference)

**Write the routed entry into the receiving story's acceptance criteria in `epics.md`**, rather than
leaving it as ledger-only ownership.

This is not a new mechanism — it is the one the kit *already* uses twice:

- the burn-down charter inserts "one acceptance bullet per entry (`DW-n: <summary>`)";
- Story X.0 does the same, "one per triaged item, naming its source".

Extending it to the routing case makes the debt **planned scope**: visible in the planning artifact,
inherited by the spec (which is derived from `epics.md`), durable across re-planning and context
loss, and auditable by reading one file. Adjudication then checks a promise instead of discovering a
surprise.

Two constraints the fix must respect:

1. **Authority.** Rule 11(c) makes *another epic's story blocks* a Clarification for a runner — never
   a judgment call. So a runner routing DW-77 to Story 2.1 **cannot** write 2.1's ACs itself. The
   write must happen where cross-epic authority exists: either the **orchestrator at the merge gate**
   (it already assembles the decision sheet and knows every routing target), or the **receiving
   epic's X.0 gate** (which already has both the authority and the bullet-writing mechanism). The
   orchestrator is the better site — it closes the loop in the same sitting the routing decision is
   made, rather than one epic later.
2. **Volume.** 45 entries are currently routed. Unbounded AC injection would bloat stories. This
   needs the same treatment the burn-down got: a per-story bound analogous to `burndown_story_max`,
   with the excess staying ledger-only and counted, so an over-loaded story is a visible number
   rather than a silent 15-bullet spec.

A cheaper complement, not a substitute: at the plan spawn, pass `LEDGER slice <story-key>` into the
plan prompt as context to *address or explicitly decline*. That handles entries routed **after** the
target story's ACs were written, which the epics.md fix alone cannot. The kit already does exactly
this for `decision-pending` at spec validation; it simply never extended it to `routed`.

Telemetry to add either way: `spec_validated` already carries `decision_dependency=`; add
`owned_ledger=<DW-n csv>` so a spec that ignored its own inbox is visible in the log.

---

## BUG 2 — nothing validates a ledger owner key against the tracker, so a retitled story silently orphans its entries

### What happened

While assembling the Epic 1 decision sheet, I cross-checked every ledger owner key against
`sprint-status.yaml`. One did not exist:

```
ledger owner : 2-5-the-real-ball-lifecycle-serve-drain-and-ball-over
sprint-status: 2-5-start-hot-seat-and-the-ball-lifecycle
```

**DW-85 and DW-87 were owned by a story key that does not exist.** `LEDGER slice
2-5-start-hot-seat-and-the-ball-lifecycle` returns empty, and nobody ever queries the phantom string,
so no `ledger_adjudicated` gate would have enumerated them — ever. They were invisible to every drain
the kit has: adjudication, burn-down, and X.0 alike. Both are real Story 2.5 concerns (a golden with
no discriminating signal; `PHYSICS_VERSION` under-hashing its constants).

Cause: Story 2.5 was retitled in `epics.md` at some point after the entries were filed, and the
ledger kept the stale slug. Nothing anywhere validates the string.

This is a **silent, unbounded** failure mode. It produces no error, no warning, and no count anomaly
— `LEDGER load` cheerfully reports `owner:<phantom>=2` as though it were a real assignment. The
ledger's own health metrics (`open`, `routed`, `drain_ratio`) all look correct while entries sit in a
bucket no gate can reach. It scales with the number of story retitles, which is exactly what a Rule 5
amendment does.

### Proposed fix

1. **Validate on write.** `LEDGER new` / `LEDGER append` should reject an `owner=` that is neither
   `burndown` nor a key present in `sprint-status.yaml` (the script already knows the impl-artifacts
   path). Fail loudly; a typo'd or stale owner is never intentional.
2. **Validate on read.** Add a check to `ledger_load` at epic start — every non-terminal owner key
   resolves, or the load HALTs the way a legacy-grammar ledger already does. This catches entries
   orphaned by a *later* retitle, which write-time validation cannot.
3. **Repair path.** When a story is retitled, the key changes; the amendment that retitles it should
   carry a ledger re-own. Cheapest general form is (2): detect at the next `ledger_load` and re-own
   as part of the X.0 close.

Repaired in this run by re-owning both entries to the real key (`by=merge_gate`, intent unchanged),
and logged as `report_error fault=lead field=ledger_owner_key`.

---

## BUG 3 — no gate in the pipeline reads CI, so a red branch passed every quality gate for two stories

### What happened

`test/export-py-skip-visibility.test.ts`, added by Story 1.8, failed on the GitHub Actions runner
from the moment it was pushed. It stayed red through **Story 1.9, the burn-down gate, and Story
1.10** — roughly 16 hours and five pushes — and was surfaced only when I checked `gh run list` while
preparing the merge gate. The runner's completion contract proposed `ready_for_merge: true` with the
branch head red.

No party misreported anything. The runner quoted no CI fact, because **nothing in the kit asks it
to.** Every quality gate — implement, QA, code review, ADR verification, per-story smoke — runs
`pnpm test` locally. On the Windows host the test passes; on the Ubuntu runner it does not. The
pipeline treats "local suite green" and "CI green" as the same claim, and they were never the same
claim.

The failure itself is instructive: the test spawned a nested vitest run and regex-scraped its
`Tests …` summary line. The CI runner advertises colour support, so vitest emitted ANSI escapes
between `Tests` and the count; every segment after `Tests` was optional, so the pattern matched the
bare word with both capture groups undefined. **It could not be reproduced locally at all** —
`FORCE_COLOR`, `CI` and `GITHUB_ACTIONS` all fail to make the nested run colourise on Windows,
because that decision is platform-gated. A defect literally unreachable from the machine every gate
runs on.

This is the "Normalizing known test failures" anti-pattern, except worse: nobody normalized it,
because nobody saw it.

### Proposed fix

1. **Add a CI check to the per-story `committed` step.** After the push, poll the run for the pushed
   sha and record `ci=<success|failure|pending> run=<id>` on the `committed` entry. Cheap (`gh run
   list --branch <b>`), and it makes the claim explicit rather than assumed.
2. **Make it a merge-gate precondition.** SC-4 / SC-4-P should not present the merge question while
   the branch head's CI run is red — surface it as a blocker with the failing job, the way this
   session did manually. A green tip is a weaker guarantee than a green suite, but it is the
   guarantee the project actually ships on.
3. **Note the platform asymmetry in the smoke gate's guidance.** The per-story smoke is explicitly
   "the final check that the wired-up system produces the user-observable outcome" — it should say
   that a suite passing only on the developer's platform is not evidence about the deployed one.

Fixed in this run by reading vitest's JSON reporter (`--reporter=json --outputFile`, whose
`numPendingTests` *is* the skip count) instead of scraping human output — a reporter contract cannot
drift with a terminal's colour support. Three mutations demonstrated; the assertion was strengthened
rather than loosened (it gained nonzero-total, zero-failure and `passed + skipped === total` guards).
Filed and closed as DW-107.

---

## Also observed (not bugs)

- **Model-tier checkpoint fired correctly and is unarmed.** Mean 4.40 `cr_complete` high+med per
  story against a threshold of 2.00, with `implement` on `claude-sonnet-5` for all 12 stage runs.
  `result=recommend_escalate armed=false`. The second and third sub-thresholds were *not* met —
  rework stayed bounded at one story and nothing reached `review_loop_iteration >= 3` — so the
  pipeline absorbed the findings rather than thrashing. Worth a decision, not an alarm.
- **Worktree teardown leaves an empty directory on Windows.** `remove-epic-worktree.sh` deregistered
  the worktree and emptied it, then failed `rmdir` with `Device or resource busy` (a lingering handle
  from the resumable runner's shell) and reported failure overall. Harmless — git no longer tracks
  it, and `.worktrees/` is gitignored — but the script's exit status implies the teardown failed when
  the only residue is an empty directory. Consider treating "deregistered + empty" as success with a
  warning.
