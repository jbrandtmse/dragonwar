---
title: 'Story 5.5: Backglass art and DMD frames'
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_revision: 'c9754b358d00b268d1b699f07dc0e647ec718e4d'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-13-match-game-over-and-return-to-attract.md'
warnings: [oversized]
deferred:
  - summary: >-
      On 2-4-player score layouts the mode fields line (row 24) masks most of the in-game strip (rows 24-31),
      so the Mode-prompt, War-start and Jackpot art is largely hidden there. The frozen intent's own
      text-priority rule and region table produce this; changing it is a product decision.
    evidence: |-
      buildScoreRows() puts the fields line at row (blockLines + 1) * 8, which is row 24 once two or more
      players are up (blockLines is 2 for 2, 3 and 4 players). Its protected box is rows 23-31 over the
      text's width, and the three in-game sequences draw only in rows 24-31 (STRIP_REGION). With the test
      fixture's 6-character fields text, columns 1-37 of the strip are masked; at the 21-character clamp,
      columns 1-127 are, which leaves one column.
      Measured, not only read: the mutation "skip the protected mask in rasterise" turns red exactly the
      2-, 3- and 4-players-with-fields legibility cases of lock_lane_mode_start, war_started and
      jackpot_awarded, and no Attract or Match legibility case.
      Not reachable in this tree: no lock_lane_mode_start, war_started or jackpot_awarded event exists
      yet. Story 4.5 owns the real-trigger check and is where this will first be seen.
      Not affected: Attract (PRESS START is at row 0, the art in rows 8-31) and Match (the game_over
      status row is at row 16 at most, so its box ends at row 23) at every player count; the score
      screen with one player (the fields line is at row 16).
      Why it is not a patch: the intent contract fixes the in-game region at rows 24-31 and says text
      always wins, and AC 2 (legibility) promises lit dots on the 1-player layout only. A fix moves the
      strip or the fields line, or lets art replace the fields line for two seconds. Recommended
      disposition: decision-pending for the story that verifies the real triggers.
    location: >-
      src/presentation/backglass/sequences.ts:57 (STRIP_REGION); src/presentation/backglass/frame.ts:762 (the fields line)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The Backglass shows only text screens. Nothing on it tells a stranger there is a dragon and a war, and there are no dot-matrix sequences for Attract, Mode prompts, the War start, the Jackpot or Match (FR-3, epics.md Story 5.5, amended 2026-09-29).

**Approach:**
- Author 1-bit dot-art sprites and five frame sequences in code, at the Backglass resolution (128 x 32).
- A presentation-side map, keyed by event-name strings, selects a sequence. Its timing comes from the triggering event's own `tick`.
- The rasteriser composites the sequence's art over the current screen. Text always takes priority, so every score and status dot stays exactly as it would be without the sequence.
- Attract and Match are wired into `src/host/boot.ts` and verified now. The Mode-prompt, War-start and Jackpot sequences are authored and keyed by their plain event-name strings. They fire through the same code path when an event of that `type` arrives, but no such event exists in this tree yet.

## Boundaries & Constraints

**Always:**
- **Provenance first.** `ATTRIBUTIONS.md` gets its "Generated content" row for `src/presentation/backglass/dmd-art.ts` BEFORE that file is created. The row names Claude Code, 2026-09-30, "drawn in code as ASCII dot masks at 128x32; no third-party art or font; nothing traced from a commercial machine".
- **No font in the art.** Sequences add no text rows and do not use `font.ts`. That file's own provenance row (authored in-project, 2026-09-06) was checked at planning and needs no change.
- **Dot art is ASCII-authored data.** A sprite is an array of equal-width strings using only `#` (lit) and `.` (unlit). It is parsed once at module load. A ragged row or any other character throws, naming the sprite (Conventions: load-time paths throw).
- **Timing is presentation's, driven by sim ticks** (AD-3, AD-4).
  - Frame holds are authored in ms and converted with `frame.ts`'s `msToTicks`; export it for this.
  - An event-keyed sequence starts at the triggering event's own `tick`, never at `snapshot.tick` (AD-9: the payload is complete).
  - The frame shown is a pure function of `snapshot.tick - startTick`.
  - A tick below `startTick` shows no art: a restarted timeline must not replay stale art (the `frame.ts` half-open-window discipline).
- **Text wins.** The rasteriser draws art only (a) inside the sequence's declared region, and (b) outside every text row's protected box, `[col-1, col+6n-1] x [row-1, row+7]` (`n` is the row's clamped length). Art is drawn after the emphasis pass. Placements that fall outside the region or the grid are clipped silently and never throw.
- **Host screens and regions:**

  | Sequence | Host screen | Region | Repeats |
  |---|---|---|---|
  | Attract | `attract_prompt` | rows 8-31, cols 0-127 | yes, while the prompt screen shows |
  | Match | `game_over` | rows 24-31 | no |
  | Mode prompt, War start, Jackpot | `score` | rows 24-31 | no |

  Art is composited only while the current screen equals the sequence's host screen.
- **Map keys**, exactly five: `mode_attract_started`, `match_drawn`, `lock_lane_mode_start`, `war_started`, `jackpot_awarded`.
  - The `match_drawn` key is typed `satisfies EventName`.
  - The other four are plain strings.
  - Where the names come from is in Design Notes.
- **Sequence lengths.**
  - Attract: at least 4 frames, and its total length is no more than `ATTRACT_PROMPT_HOLD_TICKS`. Export that constant from `frame.ts`.
  - Match: no more than 2500 ms.
  - Each in-game sequence: no more than 2000 ms.
- **Selection rules.**
  - The latest keyed event in a `FrameOutput`, by `tick`, wins, and a new one restarts the sequence rather than queueing behind it.
  - Attract is triggered by presentation itself, at the first frame of each `attract_prompt` screen.
- **Governing ADs:** AD-1, AD-3, AD-4, AD-9, AD-16, and Conventions (Events, Config, Assets, Licence headers). Every new file carries the GPL-3.0 header line.

**Never:**
- Any change under `src/sim/**`, including `src/sim/contracts/**`, any `TUNING` key or any `TABLE` field.
- Any change to `test/replays/**`, `public/assets/**`, `assets/src/**` or `tools/make-placeholder-blend.py`. No golden may move.
- A third-party font, image or asset of any kind, or a new npm dependency.
- New English display literals. Adding any to `test/backglass-frame.test.ts`'s `DISPLAY_LITERALS` or weakening that scan.
- Changing an existing screen's rows, the Attract cycle's timing, or `advanceBackglass()`'s branch order.
- Reading `performance.now()` for sequence timing.
- If a boundary-lint rule or a type forbids a plain string key in presentation: HALT with an intent gap naming the rule.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cold boot Attract | `players: []`, keys screen for 3 s, then the prompt pinned | Attract art plays under PRESS START from the first prompt frame, and loops while the prompt shows | No error expected |
| Attract with scores | the prompt/scores cycle | Art restarts at each prompt phase. The `attract_keys` and `attract_scores` rasters are byte-identical to the baseline | No error expected |
| Match | a real game over; `match_drawn` at tick M | From M, Match art sits in rows 24-31 of `game_over`. Players, GAME OVER and the reveal digits are unchanged. From M + duration the raster is identical to the baseline | No error expected |
| Control: events stripped | the same frames with `events: []` | No Match art on any frame | No error expected |
| Future key | a synthetic `{type:'war_started', tick}` (and the other two) on the score screen, 1-4 players, with and without a fields line | That sequence plays in rows 24-31. Every text protected box is unchanged | No error expected |
| Off-host screen | a keyed event while `ball_ended` is held | The timeline runs but nothing is drawn. The sequence resumes on its host screen only while it is still inside its window | No error expected |
| Two keyed events in one output | ticks t1 < t2 | The t2 event's sequence, started at t2 | No error expected |
| Restarted timeline | `snapshot.tick < startTick` | No art. Attract restarts at the current tick if the prompt is showing | No error expected |
| Unkeyed event | any other `type` | No change | No error expected |
| Malformed sprite | a ragged row, or a character other than `#`/`.` | The parser throws, naming the sprite | Load-time throw |
| Placement off-grid | art past the region or the panel edge | Clipped. Nothing lit outside the region | No throw |

</intent-contract>

## Code Map

- `src/presentation/backglass/frame.ts`
  - `DmdFrame` (:96): add an optional `art?: DmdArt`. Add the `DmdArt`, `DmdSprite` and `DmdSpritePlacement` types beside it.
  - `DmdScreen` (:93): unchanged.
  - Export `msToTicks` (:207) and `ATTRACT_PROMPT_HOLD_TICKS` (:228).
  - `advanceBackglass()` and `renderFrame()`: unchanged.
  - Literal `BackglassView`s at `test/backglass-frame.test.ts:306,410,612,870` must keep compiling, so `BackglassView` is not widened.
- `src/presentation/backglass/raster.ts`
  - `rasterise()` (:48): a third pass after emphasis (:79-101). It builds a protected mask from every row's box, then ORs in the art dots inside the region and outside the mask.
  - `toRgba()`: unchanged.
- `src/presentation/backglass/dmd-art.ts` (NEW)
  - `parseSprite(name, lines)`.
  - The sprites, including `dragon` and `knight`. Each is at least 16 rows tall on the Attract stage, and `dragon` is at least 32 columns wide.
  - The five sequences' frames: `{ placements, holdMs }[]`.
  - No import from `font.ts`.
- `src/presentation/backglass/sequences.ts` (NEW)
  - `BACKGLASS_SEQUENCES`: the key-to-sequence map, including host screen, region and repeat.
  - `SequenceView` and `INITIAL_SEQUENCE_VIEW` (`{ active: {key, startTick} | null, lastScreen }`).
  - `advanceSequences(seqView, backglassView, output)`.
  - `activeSequenceFrame(seqView, screen, tick)`, which returns `{key, index} | null`.
  - `composeSequence(frame, seqView, tick)`.
- `src/host/boot.ts:262,350-351`
  - Hold `sequenceView` beside `backglassView`.
  - In `onFrame`: `advanceBackglass`, then `advanceSequences`, then `rasterise(sequencesEnabled ? composeSequence(renderFrame(...), sequenceView, tick) : renderFrame(...), FONT_5X7)`.
  - Add `__dragonwarBoot.setBackglassSequencesEnabled(on)` as the lead's negative control, and `backglassState()`, which returns `{ screen, sequence, frameIndex }`. Type both in the `declare global` block (:51-174).
- `src/sim/contracts/events.ts:352-373`: read-only evidence.
  - There is no Attract event: `enterAttract()`, `ball-controller.ts:392`, writes `phase` only.
  - `match_drawn`/`match_reveal_step` exist.
  - `lock_lane_mode_start`, `war_started` and `jackpot_awarded` do not.
- `tools/boundary-lint.mjs:97`: `DEVICE_NAME_PATTERN` (`s|c|l|f|gi|bd|shot|show_`) does not match any of the five keys. The tick/ms rule scans `src/sim` only, so presentation ms constants are legal.
- `test/backglass-frame.test.ts:1466-1594`: the display-literal scan. It must stay green, and its list stays as it is.
- `test/game-over-integration.test.ts:40-110`: the real-loop game-over idiom to reuse (hazard coils off, `matchProbability: 1`, `ballsPerGame: 1`).
- `test/boot-mechanisms-wiring.test.ts:1-40`: the comment-stripped source-scan idiom for `boot.ts` wiring.
- `ATTRIBUTIONS.md:64-70`: the Generated content table. The `font.ts` row is the precedent.

## Tasks & Acceptance

**Execution:**
1. `ATTRIBUTIONS.md` -- add the `dmd-art.ts` Generated-content row -- the provenance gate, first.
2. `src/presentation/backglass/frame.ts` -- add the art types and export `msToTicks` and `ATTRACT_PROMPT_HOLD_TICKS` -- type seam; nothing else changes.
3. `src/presentation/backglass/raster.ts` -- the art pass with the text-priority mask and region clipping -- legibility by construction.
4. `src/presentation/backglass/dmd-art.ts` -- the parser, the sprites and the five sequences' frames within the lengths above.
   - Attract: a dragon and a knight shown as a scene, with at least one frame containing both.
   - Match: a small creature crossing the strip, with no digits.
   - Mode prompt, War start and Jackpot: distinct small motifs.
5. `src/presentation/backglass/sequences.ts` -- the map, the fold and the compositor, per the Always rules.
6. `src/host/boot.ts` -- the wiring and the two hatches.
7. `test/backglass-sequences.test.ts` (NEW) -- headless coverage of every I/O row, AC 1-3 and every task-3 mask case, using synthetic `FrameOutput`s built with the `test/backglass-frame.test.ts` builders.
8. `test/backglass-sequences-integration.test.ts` (NEW) -- the integration AC with a real `createLoop`, covering both a cold-boot Attract and a game over through Match, replicating `boot.ts`'s `onFrame` order.
9. `test/boot-backglass-sequences-wiring.test.ts` (NEW) -- a comment-stripped scan showing that `boot.ts` calls `advanceSequences` after `advanceBackglass` and passes `composeSequence(...)` into `rasterise`.

**Acceptance Criteria:**
- **AC 1.** Given the five sequences, when they are authored:
  - Every frame is 1-bit art whose composed dots lie inside 128 x 32 and inside its region.
  - Every sprite parses.
  - `ATTRIBUTIONS.md` carries the `dmd-art.ts` row with Claude Code and 2026-09-30.
  - No sequence uses a font.
- **AC 2 (selection and timing).** Given the real pipeline:
  - When `match_drawn` arrives, the Match sequence is selected from that event and timed from `event.tick`.
  - When a synthetic `war_started`, `jackpot_awarded` or `lock_lane_mode_start` arrives, its sequence is selected through the same map lookup.
  - With the events stripped, nothing is selected.
- **AC 2 (legibility).** Given every sequence on its host screen, at 0-4 players, with and without a mode fields line (as each screen allows), when each frame is rasterised:
  - Every dot inside every text protected box equals the no-art baseline.
  - On the 1-player layout (no text inside any region), at least one frame lights dots the baseline does not.
  - At `startTick + duration` (non-repeating sequences) the whole raster equals the baseline.
  - Non-host screens are always byte-identical to the baseline.
- **AC 2 (wiring, integration).** Given the consumer `src/host/boot.ts` `onFrame`, replicated over a real `createLoop`:
  - A cold boot reaches `attract_prompt` and art appears in rows 8-31 while PRESS START's box is unchanged.
  - A real game over shows Match art in rows 24-31 after `match_drawn`, and none after its window or in Attract.
  - The wiring scan passes.
- **AC 3 (proxy; SM-3 pending the author).** Given the Attract sequence, when it is inspected:
  - Named sprites `dragon` and `knight` exist and are non-empty at the sizes in the Code Map.
  - At least one frame places both of them.
  - No Attract frame adds a text row.
  - No sprite's bitmap equals a `FONT_5X7` glyph.
  - `dmd-art.ts` does not import `font.ts`.
- **AC 4 (browser, lead).** Given the served build, when the lead's in-page rAF sampler captures `vis_backbox`'s screen rect during `attract_prompt` and again during `game_over` after `match_drawn`:
  - Each art region's rendered pixels differ from the same capture taken after `setBackglassSequencesEnabled(false)`. The size of the difference is measured by the lead.
  - The PRESS START and score areas match their negative control within the noise the lead measures.
- **AC 5 (no sim, asset or golden movement).** Given the baseline revision, when the story completes:
  - `git diff` over `src/sim`, `test/replays`, `public/assets`, `assets/src` and `tools/make-placeholder-blend.py` is empty.
  - Every golden matches the baseline field by field.

## Spec Change Log

- 2026-09-30 (lead spec gate, epic-runner-5): accepted the plan's Attract reading and applied it to `epics.md` Story 5.5 AC 2 as an `[AMENDED 2026-09-30]` apply-and-report amendment (no Attract event exists; presentation starts the Attract sequence on the PRESS START screen under `mode_attract_started`). Rule 20: the event-keyed sequence map, the plain-string names for Epic 3's not-yet-declared events, and the draw-region rule were written into the spine as the Consistency Conventions row 'Backglass sequences' so Epic 3 declares the events under the same names. Story 4.5's block is not edited here (Epic 4's; the orchestrator writes its bullet post-merge).
- 2026-09-30 (implement): no intent change. Implementation choices recorded for review: (1) `ATTRIBUTIONS.md` also had its note under the Generated content table corrected from "not the `font.ts` row" to "not the `font.ts` or `dmd-art.ts` rows", so the prose stays true with the new row; (2) the Attract trigger also fires on a restarted timeline while PRESS START shows (the I/O row "Restarted timeline"), and a restarted timeline drops any other active sequence; (3) `backglassState()` reports the sequence due on the current screen even while `setBackglassSequencesEnabled(false)` hides it, so the lead can time the negative control; (4) authored placements are fully inside their region (the Match wyrm crosses cols 0-127 without leaving the panel), so the AC 1 containment test checks unclipped geometry.
- 2026-10-13 (lead recovery, re-dispatched epic-runner-5): no intent change. The session supervising this story's implement stage died on 2026-09-30 at 10:51:58Z, inside build-auto's review step. Primary cause of this re-dispatch: `environment`. The author decided on 2026-10-13 to keep the work and resume at the review step.
  - **State at death** (read from the dead stage's own transcript; a forensic record, NOT a review result). All four review layers had returned and left the tree unchanged. The stage had then applied patch-routed fixes that never reached the Review Triage Log:
    - `test/backglass-sequences.test.ts`: the "no sprite bitmap equals a FONT_5X7 glyph" case rewritten around a `glyphEqualTo` helper with a positive control.
    - `test/boot-backglass-sequences-wiring.test.ts`: two assertions tightened to exact strings (the whole `rasterise` argument list; the `backglassState()` body).
    - `ATTRIBUTIONS.md`: the sprite list in the `dmd-art.ts` row completed (selection pointers, sparks).
    - `test/backglass-sequences-integration.test.ts`: a real-loop events-stripped control (`strippedSeq`) added to the game-over case.
    It was then demonstrating Rule 19 mutations for the tests it had changed. None of those `mutation:` lines was written, so the lines under Verification predate those four edits.
  - **One leaked mutation, reverted by the lead.** `src/presentation/backglass/sequences.ts` held a three-line block in `advanceSequences()` that started Match from `backglassView.screen === 'game_over'` without the event. It was applied at 10:51:50Z; its revert command was issued and never ran. It turned both "events stripped" controls red (2 failed of 2301). The lead removed exactly those three lines. `git diff | sha256sum` then equalled the pre-mutation snapshot the dead stage had recorded three times (`b6ed7a2b4e3db7c523b93dadac73e21660e422d0b4dbc9d236483f48a7137595`), and the two suites returned to 98/98 and 2/2. Typecheck is green.
  - **Observed at death, unresolved.** The dead stage's first form of that mutation, `output.snapshot.game.phase === 'game_over'`, left `test/backglass-sequences-integration.test.ts` green (2 passed); only the screen-based form turned it red. Whether that is a hole in the new `strippedSeq` control or a no-op mutation is not established.
  - Nothing else was changed, reset or discarded. As far as this spec records, the WHOLE diff is unreviewed: the earlier layers' findings and the triage died with the session.
- 2026-10-13 (implement stage, resumed at the review step): no intent change; the `<intent-contract>` block is untouched. The whole diff was reviewed afresh by four read-only layers; triage, patches and results are in the Review Triage Log and under Verification. Changes of substance:
  - **The "observed at death" question is settled: the `strippedSeq` control had a hole, and the first form of the mutation was also invisible for a real reason.** In the real loop the phase becomes `game_over` at the drain (first seen in the frame that ends at tick 4274 in this run) while the Backglass holds the end-of-ball screen for 3000 ticks; the `game_over` screen first shows at tick 7282 and `match_drawn` fires at 9273. A Match selected once at the drain with no event therefore runs its whole 2500-tick window behind the hold and never reaches a raster. The control asserted only what was shown, so that mutation stayed green (demonstrated: 2 passed), while the same trigger on every frame, or latched on the screen, was red. The control now asserts selection (`strippedSeq.active`) on every frame, and the once-only phase form is red at tick 4274.
  - **Residue of the interrupted pass: none in source, some in the tests it had been patching.** No leftover mutation was found in `sequences.ts`, `raster.ts`, `frame.ts`, `dmd-art.ts` or `boot.ts`: `advanceSequences()` has exactly its three documented blocks; every executable line this story added to `boot.ts` is now pinned by exact text; all 14 sprites match their documented sizes. What the dead stage left half-done was in three of its own test edits: the events-stripped control above; the wiring scan's tightening (a helper comment made untrue, an orphan `from` parameter, hatch bodies still matched by substring windows); and a glyph positive control that could not see a reversed bit order. All three are patched and each has watched its mutation go red.
  - **One more vacuous instrument, found only by running its mutation:** the "ragged row throws" case passed with the ragged-row throw deleted, because its only input was a shorter row, which the character check also rejects. A longer row is now tested as well.
  - **Hatch behaviour changed (for the lead's AC 4).** `reset()` now sets `setBackglassSequencesEnabled` back to `true`, as it already clears the light-budget and lamp overrides. `replayRecorder.start()`, `replayRecorder.play()` and a tuning-panel hot-apply all reset the loop, so each of them re-enables the art: to keep the negative control across one of those, call `setBackglassSequencesEnabled(false)` again afterwards. The sequence timeline (`sequenceView`) is deliberately not cleared on reset; `advanceSequences()` drops a sequence from an earlier timeline itself.
  - `ATTRACT_SEQUENCE_KEY` is no longer exported from `sequences.ts` (nothing imported it).
  - `dmd-art.ts`: three JSDoc comments were moved from helper constants onto the exported frame arrays. Comments only — the file's sha256 with comment lines stripped is identical before and after — so no dot, placement or hold changed and the `ATTRIBUTIONS.md` row is unchanged and still true.
  - Rule 6: AD-1, AD-3, AD-4, AD-9, AD-16 and the Conventions rows "Backglass sequences" and "Visible placeholders" were re-read against the diff. No violation.

## Review Triage Log

### 2026-10-13 — Review pass
- verdicts: 76 findings — high 0, medium 13, low 55, false 8, maybe-false 0
- scope: the whole diff since `c9754b3` (nine files; the cycle log is the lead's and is excluded), reviewed as if none of it had been reviewed. All four layers ran read-only and left the tree byte-identical (`git diff | sha256sum` `1b0e1aa6…` before and after). Row ids: BH = blind hunter, ECH = edge-case hunter, VG = verification gap, IA = intent alignment; `R` = a layer's own "Residue" list. Mutation ids (`m01`…) are the runs recorded under Verification.
- findings:
  - `[medium]` `[defer]` BH-1 On 2-4-player score layouts the mode fields line (row 24) masks most of the in-game strip — real (`frame.ts:762` puts the line at row 24, box rows 23-31), but produced by the frozen intent's own text-priority rule and region table, and not reachable until Epic 3's events exist; recorded in frontmatter `deferred:` as a product call.
  - `[low]` `[patch]` BH-2 `reset()` clears the light-budget and lamp overrides but not the new negative control — real: the seam at `boot.ts` set neither. Patched: the reset seam sets `sequencesEnabled = true`, the hatch's JSDoc says so, the wiring scan pins it (`m19` red).
  - `[low]` `[reject]` BH-3 The hatch stores its argument unchecked — a non-boolean console call is unlikely for a parameter typed `boolean`, and the fix adds a guard and a log branch.
  - `[low]` `[reject]` BH-4 The two load-time throws in `sequence()` are untested — true, but they guard states the authored data cannot reach, and testing them needs the private function exported (new public surface).
  - `[low]` `[reject]` BH-5 A same-tick tie between two keyed events is unpinned — true, but the intent is silent on ties and only one keyed event exists in this tree; pinning an order would be inferring intent.
  - `[low]` `[patch]` BH-6 The region's bottom bound is unpinned — confirmed. Patched: the region-clipping case now uses a one-row region that ends above the panel's last row plus a placement below it (`m06` red in that case alone).
  - `[low]` `[reject]` BH-7 Three of the five keys are bare strings with nothing tying them to Epic 3 — intent-bound: the contract says "the other four are plain strings", Story 4.5 owns the real-trigger check, and the spine's "Backglass sequences" row records the names.
  - `[low]` `[patch]` BH-8 `DMD_SPRITES` is a hand-kept registry the frames do not go through — confirmed. Patched: a new AC 1 case asserts every placed sprite IS the registry entry of its name and every entry is placed (`m05`, `m22` red).
  - `[low]` `[reject]` BH-9 The glyph check never compares authored art (no sprite is 5 x 7) — true, and it is AC 3's literal wording ("equals"); the comparison is falsifiable (`m25` red). Letterforms inside a larger sprite are the author's SM-3 check, not a mechanical one (the blank glyph matches any empty window).
  - `[low]` `[reject]` BH-10 A keyed event on a continuing PRESS START frame would displace Attract — unreachable: no keyed event can fire in Attract, and a fresh Attract always shows the keys screen first; the fix guards a state never demonstrated.
  - `[low]` `[reject]` BH-11 `renderFrame(...)` is written in both ternary arms — cosmetic; it is the form the Code Map prescribes and it runs once per frame either way.
  - `[false]` `[reject]` BH-12 The "row recorded BEFORE the file" claim cannot be evidenced, and the test pins a date and a sentence — the row and the file land in one commit, so no revision holds the file without its row; the pinned text is AC 1's own wording.
  - `[low]` `[reject]` BH-13 `drawArt()` inputs are not validated (a zero-length row protects one column; a non-integer placement draws nothing) — the one-column box is the intent's formula at `n = 0`; every authored placement is an integer and a guard in the private `place()` would be untestable without new surface.
  - `[low]` `[reject]` BH-14 Panel size is hard-coded in `dmd-art.ts` — cosmetic; the intent fixes 128 x 32 and the containment case catches drift.
  - `[false]` `[reject]` BH-15 The integration run may not tell the event tick from the frame tick — measured: `match_drawn` fires at tick 9273 inside the frame that ends at 9282, and `m08b` turns the case red on exactly that difference.
  - `[low]` `[patch]` BH-R1 Three sequence JSDoc blocks sit on helper constants, not on the exported frames — confirmed in `dmd-art.ts`. Patched by moving the three comments (comments only: the file's sha256 with comment lines stripped is identical before and after, so no dot, placement or hold changed and the ATTRIBUTIONS row stays true).
  - `[low]` `[reject]` BH-R2 `runAttract()`'s `step = 16` is never overridden and `6000 - 16` is a one-sided bound — the parameter is used inside the helper, and the bound is closed from the other side by "exactly three prompt starts in 16 s"; original authoring, not residue.
  - `[low]` `[patch]` BH-R3 "one tick earlier it does not" asserted only that `.art` is defined — confirmed. Patched: the positive now compares rasters (`m13` red on that assertion).
  - `[low]` `[patch]` BH-R4 Two assertions repeat the one above them (`backglass-sequences.test.ts` non-host case; integration after-window) — confirmed duplicates. Patched by deleting each duplicate; the pinning assertions stay (`m14`, `m12` red).
  - `[low]` `[patch]` BH-R5 The unit file's header says no expectation is read from the map, yet some are — confirmed. Patched: `ATTRACT_FRAMES.length` became the literal `6` (import dropped), and the header now says which cases author literals and which probe the map.
  - `[low]` `[patch]` BH-R6 `ATTRACT_SEQUENCE_KEY` is exported and nothing imports it — confirmed by search. Patched: no longer exported.
  - `[low]` `[reject]` ECH-1 Keyed event while PRESS START already shows — same as BH-10.
  - `[false]` `[reject]` ECH-2 A real `mode_attract_started` event would start Attract through the event path — by design: Design Notes choose that key so a later real event matches; no such event is declared.
  - `[low]` `[patch]` ECH-3 Negative control survives `reset()` — same root as BH-2; patched there. (`sequenceView` is not cleared on purpose: `advanceSequences()` drops a sequence from an earlier timeline itself; the scan pins that it has no third writer.)
  - `[low]` `[reject]` ECH-4 Non-integer placement — same as BH-13.
  - `[false]` `[reject]` ECH-5 A `NaN` region bound would disable column clipping — cannot occur: `DmdArt['region']` is a typed four-number object and both instances are literals.
  - `[medium]` `[patch]` ECH-R1 `callArguments(…, from = 0)` has a parameter no caller passes — confirmed; left over from the interrupted tightening of the wiring scan. Patched with the rest of that file (see IA-R1): the helper is now `balancedAfter()` and `from` locates the `backglassState` implementation past its type line.
  - `[low]` `[patch]` ECH-R2 The integration sanity `tick >= matchTick` cannot fail — confirmed. Patched to `>`: the event must land strictly inside its frame, which is what makes the timing assertion discriminate.
  - `[medium]` `[patch]` VG-1 The real-loop events-stripped control observes what is shown, never what is selected — confirmed by mutation on the tree as received: Match selected once on `phase === 'game_over'` with no event left the integration file green (2 passed). Patched: the game-over case asserts `strippedSeq.active` on every frame (never Match; `null` in the game and on game_over; equal to the real fold's Attract on PRESS START) and `seq.active` is `null` before `match_drawn`; the cold-boot case reads the stripped fold too. The same mutation is now red at tick 4274 (`m07b`).
  - `[low]` `[reject]` VG-2 Everything Story 5.5 added to `boot.ts` is pinned by source text only — true and pre-existing (`boot.ts` is on the `module-coverage` allowlist; source scans are the repository's idiom for it). The layer's own demonstration (an extra statement in the hatch) is closed by the whole-body pins (`m18` red); the executed check is AC 4, run by the lead in Chrome. Carried under residual risks.
  - `[low]` `[patch]` VG-3 `reset()` does not clear `sequencesEnabled` — same root as BH-2; patched there.
  - `[medium]` `[patch]` VG-T1 "Every sprite parses" has no `mutation:` line — and its demonstration came back GREEN: with the ragged-row throw deleted, the case still passed, because a SHORTER row also trips the character check. The width check was unpinned. Patched: the case adds a LONGER ragged row (`m03` red after the patch).
  - `[low]` `[patch]` VG-T2 "No font" has no line — demonstrated and written (`m04`).
  - `[low]` `[patch]` VG-T3 "1-player layout lights dots" has no line — demonstrated and written (`m13`).
  - `[low]` `[patch]` VG-T4 "Non-host screens identical" has no line — demonstrated and written (`m14`).
  - `[low]` `[patch]` VG-T5 The real game-over case has no line of its own — demonstrated and written (`m21`).
  - `[low]` `[patch]` VG-T6 "Sprite sizes" has no line — demonstrated and written (`m23`).
  - `[low]` `[patch]` VG-T7 "No text row" has no line — demonstrated and written (`m24`).
  - `[low]` `[patch]` VG-T8 "No sprite equals a glyph" has no line — demonstrated and written (`m25`).
  - `[false]` `[reject]` VG-T9 AC 4 has no suite test — by the spec: AC 4 is the lead's browser capture; a headless engine rasterises nothing.
  - `[low]` `[patch]` VG-T10 AC 5 has no test and no mutation — it is a command check. Recorded with a positive control for each instrument instead of a tree mutation (`src/sim` may not be touched even temporarily): the same `git diff --exit-code` form over `src/host` exits 1; the golden comparer reports an in-memory tamper.
  - `[low]` `[patch]` VG-T11 The "select Match on phase" line was true of the unit control only — rewritten as three lines, each naming its file (`m07a`, `m07b`, `m07c`).
  - `[low]` `[patch]` VG-T12 The wiring line does not exercise the two tightened assertions — two lines added and demonstrated (`m16`, `m17`).
  - `[low]` `[patch]` VG-V1 Unit non-host case re-rasterises the same frame object — same as BH-R4; duplicate deleted.
  - `[low]` `[patch]` VG-V2 Integration after-window line repeats the one above — same as BH-R4; duplicate deleted.
  - `[low]` `[reject]` VG-V3 The glyph assertion exits at the size guard for all 14 sprites — same as BH-9.
  - `[medium]` `[patch]` VG-V4 The glyph test's positive control used `'A'`, which is symmetric and was built by the inverse of the helper, so it could not see a reversed bit order — confirmed. Patched: the control is cut from what the real rasteriser draws for `'R'`, checked against a mask authored in the test, and paired with its mirror image (not a glyph). A comparator that packs LSB-first now fails the control (`m26` red).
  - `[low]` `[patch]` VG-V5 `toBe(14)` pins the registry's size, not that every placed sprite is in it — same as BH-8; patched there.
  - `[low]` `[reject]` VG-V6a Tie-break unpinned — same as BH-5.
  - `[low]` `[patch]` VG-V6b The `Object.hasOwn` guard is unpinned — confirmed. Patched: the unkeyed-event case feeds `constructor` and `toString` (`m10` red).
  - `[low]` `[reject]` VG-V6c `sequence()` throws unpinned — same as BH-4.
  - `[medium]` `[patch]` VG-OQ The open question — the control had a hole AND the phase form is invisible for a real reason. Established by experiment, not by reading: an every-frame phase trigger is red (tick 7282); a once-only one is green before the patch and red after it. See VG-1 and the Spec Change Log.
  - `[medium]` `[patch]` VG-R1 The integration comment says "never select or draw", the code asserted only draw — the hole of VG-1; patched there.
  - `[medium]` `[patch]` VG-R2 The integration header still described one control, and the stripped fold was never read in the cold-boot case — residue of the same unfinished edit. Patched: header rewritten; the cold-boot case asserts the stripped fold equals the real one (Attract needs no event).
  - `[medium]` `[patch]` VG-R3a Wiring helper's unused `from` — same as ECH-R1.
  - `[low]` `[reject]` VG-R3b `runAttract`'s `step` — same as BH-R2.
  - `[low]` `[patch]` VG-R4 `toBe(ATTRACT_FRAMES.length)` under "all six frames" — same as BH-R5; now the literal.
  - `[low]` `[patch]` VG-R5 The two weaker lines under a stronger one — same as BH-R4.
  - `[low]` `[reject]` VG-R6a The Auto Run Result section still held the planner's ready-for-dev text — its fix is an edit to this spec; the section is rewritten at finalize as the workflow requires.
  - `[low]` `[reject]` VG-R6b The Verification command names `e2492f5` while `baseline_revision` is `c9754b3` — its fix is an edit to this spec; the check was run against both and exits 0 against both.
  - `[low]` `[reject]` VG-R6c The recorded pre-mutation hash cannot be reproduced now — its fix is an edit to this spec; this pass records its own snapshots.
  - `[false]` `[reject]` IA-D1a The "stranger sees a dragon and a war" expectation lives at the rendered Backglass, the tests at the dot buffer — by the spec's own split: AC 3 is closed on its proxy (SM-3 is the author's), AC 4 is the lead's capture.
  - `[low]` `[reject]` IA-D1b The integration replica calls `renderFrame` with two arguments and has no enable gate — the third argument only changes the keys screen's rows, where the test asserts no art; the gate's false branch is the test's own no-art control.
  - `[low]` `[reject]` IA-D2 Future keys are exercised by synthetic events only — same as BH-7.
  - `[medium]` `[defer]` IA-D3 "Plays in rows 24-31" is asserted as lit dots on the 1-player layout only; at 2-4 players the fields line covers the strip — same as BH-1; deferred with it.
  - `[false]` `[reject]` IA-D4 "Provenance first" is observable as row presence, not as order in history — same as BH-12.
  - `[low]` `[reject]` IA-D5 "No font" is checked by an import scan and whole-sprite equality — same as BH-9.
  - `[false]` `[reject]` IA-AD AD-1, AD-3, AD-4, AD-9, AD-16 and the Conventions rows: no line of the diff contradicts any (the auditor's note on AD-3's "display-paced sequence" clause: that clause is about rules timers under `sim/**`; the intent mandates presentation-authored holds through `msToTicks` and forbids a `TUNING` key). Re-checked against the spine by the stage (Rule 6): no violation.
  - `[medium]` `[patch]` IA-R1 The wiring scan's `squash` comment promised "a reformat cannot break a match", but the tightened whole-string match ended in a trailing comma that only the wrapped layout produces — confirmed; left over from the interrupted tightening. Patched: `squash` drops the wrapped list's trailing comma, both hatch bodies are matched whole instead of by a 120/400-character substring window, and every writer of the flag and of the view is enumerated (`m15`-`m19` red).
  - `[medium]` `[patch]` IA-R2 Unused `from` parameter — same as ECH-R1.
  - `[medium]` `[patch]` IA-R3 The events-stripped control was added to the test body only and is narrower than its unit twin — same as VG-1 / VG-R2.
  - `[low]` `[patch]` IA-R4 An unchanged comment in `boot.ts` ("the ONE place FrameOutput.events reaches anything today") is made untrue by this diff — confirmed. Patched: the comment now names `advanceSequences()` as the second reader.
  - `[low]` `[patch]` IA-R5 Unit header against its body — same as BH-R5.
  - `[low]` `[patch]` IA-R6 Detached doc comments — same as BH-R1.
  - `[low]` `[patch]` IA-R7 Export with no importer — same as BH-R6.
  - `[low]` `[reject]` IA-R8 Spec record items — same as VG-R6a/b/c.

## Design Notes

**Where the keys come from.**
- `match_drawn` is in `events.ts`.
- `lock_lane_mode_start` (the Mode prompt: the candidates window) is from AR-20 and Story 3.4, epics.md:160 and :1962.
- `war_started` is from Story 3.8, epics.md:2099.
- `jackpot_awarded` is from Story 3.9, epics.md:2119.
- Story 4.5 owns the real-trigger check. If Epic 3 ships a different name, the fix is a one-line key change.

**Attract has no event (amendment candidate, Rule 5 apply-and-report, for the lead).**
- AC 2 says every sequence is keyed by an event name. The tree has no Attract event: `enterAttract()` writes `phase` only.
- The Attract sequence is therefore keyed under MPF's own mode-start name, `mode_attract_started`, following the Events convention and AR-21's `mode_<name>_started`.
- Presentation raises that trigger at each `attract_prompt` start. This is the lead's "whatever Attract is driven by".
- If a later story emits a real `mode_attract_started`, the key already matches it.
- Suggested wording for AC 2: "Attract is keyed by `mode_attract_started`, raised in presentation from the Attract prompt screen until the sim emits it".

**Why it overlays instead of adding a new screen.** A new `DmdScreen` would change the Attract cycle and the existing tests. Overlaying with text priority makes "legible during and after" a byte-level property.

**Integration ACs (Rule 1).**
- Consumer: `src/host/boot.ts` `onFrame` (AC 2 wiring).
- Consumes (Rule 2): Story 2.6's renderer and raster, and Story 2.13's `match_drawn` and Attract cycle.
- Consumed-by:
  - Story 4.5: the real-event trigger check for the Mode-prompt, War-start and Jackpot keys.
  - Stories 3.4, 3.8 and 3.9: their events fire these keys.
  - Note for the orchestrator: Story 4.5's block in epics.md does not yet carry the moved check. That block is not Epic 5's to edit.

**Footprint extensions (Rule 11; uncontended, for the lead to report):**
- `src/presentation/backglass/frame.ts`, `raster.ts`, `dmd-art.ts` and `sequences.ts`.
- `src/host/boot.ts`.
- `test/backglass-sequences.test.ts`, `test/backglass-sequences-integration.test.ts` and `test/boot-backglass-sequences-wiring.test.ts`.

**Other.**
- Ledger inbox: empty (`owned_ledger=0`; `ledger.sh slice` returned nothing).
- SM-3, the stranger link test, is an author action item and does not gate this story.

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions` -- expected: green.
- `pnpm test` -- expected: all green, including `backglass-frame` (the display-literal scan), `backglass-raster`, `backglass-integration`, `game-over-integration`, `replay-goldens` and the three new files.
- `git diff --exit-code e2492f5317a87c13146d7783de4f29e6efd41d67 -- src/sim test/replays public/assets assets/src tools/make-placeholder-blend.py` -- expected: exit 0.
- A scratchpad node script: for each `test/replays/*.golden.json`, deep-compare every top-level and `header` field with `git show <baseline>:<file>`. Expected: every field equal.
- `pnpm build && pnpm check:dist && pnpm check:size` -- expected: within budget.

**Mutations (Rule 19: apply, observe red, revert, then confirm `git status --short` and `git diff --stat` are unchanged):**
The list below is the current one (rewritten 2026-10-13; every line was demonstrated in that pass, see "Mutation results (review, 2026-10-13)"). "unit" is `test/backglass-sequences.test.ts`, "integration" is `test/backglass-sequences-integration.test.ts`, "wiring" is `test/boot-backglass-sequences-wiring.test.ts`.
- AC 1:
  - `mutation: place an Attract sprite at col 120 → the unit grid/region containment case red`
  - `mutation: delete the dmd-art.ts ATTRIBUTIONS row → the unit attribution case red`
  - `mutation: delete the ragged-row throw in parseSprite → the unit "a ragged row throws … shorter OR longer" case red`
  - `mutation: add an import from './font' to dmd-art.ts → the unit no-font case red`
  - `mutation: drop coin from DMD_SPRITES → the unit "every sprite a frame places is the DMD_SPRITES entry" case red`
  - `mutation: delete the region's bottom bound (|| destRow > rowMax) in drawArt → the unit region-clipping case red`
- AC 2 (selection and timing):
  - `mutation: select Match once on phase === 'game_over' with no event (&& active === null) → the unit events-stripped control red`
  - `mutation: the same once-only phase trigger → the integration game-over case red at its "events stripped, Match is never selected" assertion`
  - `mutation: select Match once on backglassView.screen === 'game_over' with no event → the integration game-over case red`
  - `mutation: startTick = snapshot.tick → the unit timing case red, and the integration game-over case red`
  - `mutation: rename the war_started key → the unit future-key case red`
  - `mutation: look the key up without Object.hasOwn → the unit unkeyed-event case red`
- AC 2 (legibility):
  - `mutation: skip the protected mask in rasterise → the unit war_started 2-players-with-fields legibility case red`
  - `mutation: ignore duration for non-repeating sequences → the unit Match "at startTick + duration" case red`
  - `mutation: compose art with no placements → the unit 1-player "lights dots" case red, and the "one tick earlier it does not" positive red`
  - `mutation: drop the host-screen check in activeSequenceFrame → the unit non-host case red`
- AC 2 (wiring, integration):
  - `mutation: remove composeSequence from boot.ts → the wiring rasterise-arguments case red`
  - `mutation: compose in the negative control's branch too → the wiring rasterise-arguments case red`
  - `mutation: backglassState() reads tick 0 instead of latestSnapshot?.tick ?? 0 → the wiring hatch-bodies case red`
  - `mutation: the setter hatch also resets sequenceView → the wiring hatch-bodies case red`
  - `mutation: drop sequencesEnabled = true from the reset seam → the wiring reset-seam case red`
  - `mutation: drop the Attract trigger → the integration cold-boot case red`
  - `mutation: host Match on 'score' → the integration game-over case red`
- AC 3:
  - `mutation: remove knight from every Attract frame → the unit both-sprites case red`
  - `mutation: cut three rows off the knight → the unit sprite-sizes case red`
  - `mutation: composeSequence appends a text row → the unit "no Attract frame adds a text row" case red`
  - `mutation: draw coin as the font's R glyph → the unit glyph case red`
  - the glyph case's own control: `mutation: the test's glyph comparator packs LSB-first → its positive control red`
- AC 4 (lead): the negative control is `setBackglassSequencesEnabled(false)`.
- AC 5: a command check with no test, so no tree mutation exists for it (`src/sim` may not be touched, even to prove a point). Each instrument has a positive control instead: the same `git diff --exit-code` form over `src/host` must exit 1, and the golden comparer must report an in-memory tamper.

**Manual checks:** AC 4, run by the lead in Chrome.

**Results (implement, 2026-09-30; new files `git add -N` so the tracked-file gates see them) — SUPERSEDED 2026-10-13. Kept as the record of the first pass; it predates the later test edits and is not evidence. The current results are the two "review, 2026-10-13" blocks below.**
- `pnpm typecheck` green; `pnpm lint:boundaries` OK (115 files, no violations); `pnpm check:headers` OK; `pnpm check:attributions` OK.
- `pnpm test`: 141 files / 2301 tests passed, including `backglass-frame` (display-literal scan untouched), `backglass-raster`, `backglass-integration`, `game-over-integration`, `replay-goldens` and the three new files (98 + 2 + 3 tests).
- `git diff --exit-code e2492f5317a87c13146d7783de4f29e6efd41d67 -- src/sim test/replays public/assets assets/src tools/make-placeholder-blend.py`: exit 0 (also exit 0 against `c9754b3`).
- Golden field compare (scratchpad node script, JSON-parsed, `git show e2492f5:<file>`): 5 goldens, 77 top-level and `header` fields compared, 0 differing.
- `pnpm build && pnpm check:dist && pnpm check:size`: OK; 1.193 MB of the 2.750 MB budget.

**Mutation results (Rule 19; each applied, observed red, reverted; after every revert `git status --short`, `git diff --stat` and a sha256 of `git diff` matched the pre-mutation snapshot) — SUPERSEDED 2026-10-13, same reason:**
- `mutation: place an Attract sprite at col 120` (knight, frame 1) -> red: "grid/region containment ... unclipped" (1 failed / 98). Reverted, identical.
- `mutation: delete the dmd-art.ts ATTRIBUTIONS row` -> red: "ATTRIBUTIONS.md carries the dmd-art.ts Generated-content row ..." (1 failed). Reverted, identical.
- `mutation: select Match on phase === 'game_over' instead of on the match_drawn event` -> red: "control: events stripped ..." and "match_drawn selects Match, timed from event.tick" (2 failed). Reverted, identical.
- `mutation: startTick = snapshot.tick` -> red: "match_drawn selects Match, timed from event.tick -- NOT snapshot.tick", the three future-key cases and "two keyed events" (5 failed). Reverted, identical.
- `mutation: rename the war_started key` (to `war_start`) -> red: "future key war_started ...", the five-keys case, the lengths case, "is a key of BACKGLASS_SEQUENCES" (war_started legibility) and two timing cases that use it (6 failed). The first run crashed collection of the whole file; the legibility `describe.each` was then given a guard so a missing key fails as a test, and the mutation was re-run against the new snapshot. Reverted, identical.
- `mutation: skip the protected mask in rasterise` -> red: "war_started > 2 players with fields" (and 3/4 players with fields for all three in-game sequences, plus three Task-3 mask cases; 12 failed). Reverted, identical.
- `mutation: ignore duration for non-repeating sequences` (hold the last frame past the end) -> red: "match_drawn > at startTick + duration (and after) the whole raster equals the baseline" (and the same case for the three in-game sequences, the Match timing case and the off-host case; 6 failed). Reverted, identical.
- `mutation: remove composeSequence from boot.ts` -> red: "rasterise() is passed composeSequence(renderFrame(...), sequenceView, tick) ..." (1 failed / 3). Reverted, identical.
- `mutation: drop the Attract trigger` -> red: the integration "cold boot ..." case (and, after its Attract assertion was strengthened to require the Attract sequence and lit art on every post-game PRESS START frame, the "real game over" case too; re-run against the new snapshot). Reverted, identical.
- `mutation: remove knight from every Attract frame` (5 placements) -> red: "both-sprites: at least one Attract frame places both the dragon and the knight" (1 failed). Reverted, identical.
- The first four mutations ran before the two test edits above; those edits touch only the missing-key path and the post-game Attract assertions, which none of the four exercises.

**Results (review, 2026-10-13; the patched tree, new files still `git add -N`):**
- `pnpm typecheck` green; `pnpm lint:boundaries` OK (115 files, no violations); `pnpm check:headers` OK; `pnpm check:attributions` OK.
- `pnpm test`: 141 files / 2303 tests passed, none failed, none skipped (2301 before this pass, plus the registry case and the reset-seam case). It includes `backglass-frame` (58 cases; the display-literal scan and its list untouched), `backglass-raster` (17), `backglass-integration` (3), `game-over-integration` (1), `replay-goldens` (52) and the three files of this story: unit 99, integration 2, wiring 4.
- Matrix Test Audit: every row of the I/O & Edge-Case Matrix has a covering case that ran and passed in that run — Cold boot Attract (unit 2, integration 1); Attract with scores (unit 2); Match (integration game-over case, unit timing case, 13 `match_drawn` legibility cases); Control: events stripped (unit control, integration stripped fold); Future key (unit 3, plus 13 legibility cases per in-game key over 0-4 players with and without fields); Off-host screen (unit 1); Two keyed events (unit 1); Restarted timeline (unit 2); Unkeyed event (unit 1); Malformed sprite (unit 4); Placement off-grid (unit off-grid and region-clipping cases).
- AC 5: `git diff --exit-code <rev> -- src/sim test/replays public/assets assets/src tools/make-placeholder-blend.py` exits 0 against `e2492f5317a87c13146d7783de4f29e6efd41d67` and against `c9754b358d00b268d1b699f07dc0e647ec718e4d`; `git status --short` over the same five paths is empty. Positive control: the same form over `src/host` exits 1.
- Golden field compare (a scratch node script outside the tree; each `test/replays/*.golden.json` JSON-parsed and compared field by field with `git show <rev>:<file>`): 5 goldens, 77 top-level and `header` fields, 0 differing, against both revisions; `expectedHash` and `expectedGameStateHash` equal in all five. Positive control: an in-memory tamper of one golden's `expectedHash` and one header field is reported (3 entries).
- `pnpm build && pnpm check:dist && pnpm check:size`: OK; 141 files under `dist`; 1.193 MB of the 2.750 MB budget. The build left the tree unchanged.
- Rule 14: zero non-ASCII bytes and zero CR bytes in the eight source and test files of this story (byte count, not grep).
- Last of all, after the final mutation: two comment-only edits (the unit file's header; one comment in the wiring scan). The four gates and `pnpm test` were then run again on exactly the bytes that are committed: green, 141 files / 2303 tests passed, none failed, none skipped. The sha256 of `git diff` over everything but this spec was `26905ecf…` before and after that run.

**Mutation results (review, 2026-10-13; Rule 19).** Each mutation ran alone, inside ONE shell command: record `git diff | sha256sum`, `git status --short | sha256sum` and the target's sha256; copy the target to a backup outside the worktree; install a restore trap; apply the edit (refused unless its anchor matches exactly once); run the one test file; restore; compare all three hashes. Every run ended "identical". Snapshots: `1b0e1aa6…` for the three probes on the tree as received, `758d36e4…` for every run on the patched tree, `75505bfa…` for the one re-run after the ragged-row case was patched (that edit adds one assertion to one case of the unit file and changes no other case).
- On the tree as received, to settle the "observed at death" question:
  - Match selected ONCE on `phase === 'game_over'` with no event (`&& active === null`) -> integration GREEN, 2 passed. The hole.
  - The same trigger on every frame (no latch) -> integration red at tick 7282 ("no Match without match_drawn").
  - `startTick = snapshot.tick` -> integration red: `startTick: 9282` against the event's 9273. The run does tell the two ticks apart.
- On the patched tree:
  - `place an Attract sprite at col 120` (knight, frame 1) -> unit red: grid/region containment (1 failed of 99).
  - `delete the dmd-art.ts ATTRIBUTIONS row` -> unit red: the attribution case (1).
  - `delete the ragged-row throw in parseSprite` -> first run GREEN (99 passed): the case used only a shorter row, which the character check also rejects. The case was patched to add a longer row; re-run -> unit red: "a ragged row throws … shorter OR longer" (1).
  - `add an import from './font' to dmd-art.ts` -> unit red: the no-font case (1).
  - `drop coin from DMD_SPRITES` -> unit red: the placed-sprite registry case, and the glyph case's count sanity (2).
  - `delete the region's bottom bound` -> unit red: region clipping (1) — the case this pass rewrote; nothing else notices.
  - `select Match once on phase === 'game_over'` -> unit red: "control: events stripped" at tick 9000 (1); integration red at tick 4274, the drain frame: "events stripped, Match is never selected" (1 of 2). Green before the patch, red after it.
  - `select Match once on backglassView.screen === 'game_over'` -> integration red at tick 7282 (1 of 2).
  - `startTick = snapshot.tick` -> unit red: the timing case, the three future-key cases and "two keyed events" (5); integration red: 9282 against 9273 (1 of 2).
  - `rename the war_started key` (to `war_start`) -> unit red: the five-keys case, the lengths case, future key `war_started`, two timing cases that use it, and "is a key of BACKGLASS_SEQUENCES" (6 failed of 87 collected).
  - `look the key up without Object.hasOwn` -> unit red: "an unkeyed event changes nothing" (1) — on the `constructor`/`toString` events this pass added.
  - `skip the protected mask in rasterise` -> unit red: "war_started > 2 players with fields" and the 2/3/4-players-with-fields cases of all three in-game sequences, plus three Task-3 mask cases (12).
  - `ignore duration for non-repeating sequences` (hold the last frame) -> unit red: "match_drawn > at startTick + duration …" and the same case for the three in-game sequences, the Match timing case and the off-host case (6).
  - `compose art with no placements` -> unit red: the 1-player "lights dots" case of all five sequences, "one tick earlier it does not" for the four non-repeating ones (on the raster assertion this pass added), the three future-key cases and a cold-boot case (13).
  - `drop the host-screen check` -> unit red: the non-host case of all five sequences, the off-host case and an Attract-with-scores case (7).
  - `remove composeSequence from boot.ts` -> wiring red: the rasterise-arguments case (1 of 4).
  - `compose in the negative control's branch too` -> wiring red: the rasterise-arguments case (1).
  - `backglassState() reads tick 0` -> wiring red: the hatch-bodies case (1).
  - `the setter hatch also resets sequenceView` -> wiring red: the hatch-bodies case and the writers list (2).
  - `drop sequencesEnabled = true from the reset seam` -> wiring red: the reset-seam case (1).
  - `drop the Attract trigger` -> integration red: both cases (2 of 2).
  - `host Match on 'score'` -> integration red: the game-over case (1).
  - `remove knight from every Attract frame` (5 placements) -> unit red: both-sprites, and the registry case's "every entry is placed" (2).
  - `cut three rows off the knight` -> unit red: sprite sizes, 15 against 16 (1).
  - `composeSequence appends a text row` -> unit red: "no Attract frame adds a text row" and 45 legibility cases (46).
  - `draw coin as the font's R glyph` -> unit red: the glyph case, `[['coin', 'R']]` (1).
  - `the test's glyph comparator packs LSB-first` -> unit red: its positive control (1). The earlier control, built from the symmetric `'A'`, could not have seen this.

## Auto Run Result

Status: done
Blocking condition: none

**Summary of the implemented change.**
- The Backglass now carries dot art. `dmd-art.ts` authors 14 one-bit sprites as ASCII masks and the frames of five sequences at 128 x 32; `sequences.ts` holds the one event-name-keyed map (`mode_attract_started`, `match_drawn`, `lock_lane_mode_start`, `war_started`, `jackpot_awarded`), the fold that selects a sequence and times it from the triggering event's own tick, and the compositor.
- `raster.ts` draws the art in a third pass: inside the sequence's region, inside the panel and outside every text row's protected box, so text always wins and every score dot is what it would be without the art.
- `boot.ts` folds the sequences right after the Backglass view in `onFrame` and rasterises the composed frame. Attract (on the PRESS START screen) and Match (on `game_over`, from `match_drawn`) are live. The Mode-prompt, War-start and Jackpot sequences are authored and keyed; no event of those types exists in this tree yet.
- Two dev hatches for the lead's AC 4: `setBackglassSequencesEnabled(on)` and `backglassState()`.
- No file under `src/sim`, `test/replays`, `public/assets`, `assets/src` or `tools/make-placeholder-blend.py` changed. No golden moved. No third-party asset, font or dependency was added.

**Files changed.**
- `ATTRIBUTIONS.md` — the Generated-content row for `dmd-art.ts` (Claude Code, 2026-09-30); the note under the table names it beside `font.ts`.
- `src/presentation/backglass/dmd-art.ts` (new) — the sprite parser, the 14 sprites, the five sequences' frames.
- `src/presentation/backglass/sequences.ts` (new) — the map, `advanceSequences()`, `activeSequenceFrame()`, `composeSequence()`.
- `src/presentation/backglass/frame.ts` — the `DmdSprite`, `DmdSpritePlacement` and `DmdArt` types, `DmdFrame.art?`, and the `msToTicks` and `ATTRACT_PROMPT_HOLD_TICKS` exports.
- `src/presentation/backglass/raster.ts` — the art pass (`drawArt()`), with the protected mask and region clipping.
- `src/host/boot.ts` — the wiring, the two hatches, and the reset seam restoring the negative control.
- `test/backglass-sequences.test.ts` (new) — 99 headless cases: every I/O row, AC 1-3, every mask case.
- `test/backglass-sequences-integration.test.ts` (new) — a cold boot and a real game over through a real `createLoop`, in `boot.ts`'s `onFrame` order, with a no-art control and an events-stripped control.
- `test/boot-backglass-sequences-wiring.test.ts` (new) — the comment-stripped source scan of `boot.ts` (4 cases).
- this spec.

**Review findings (2026-10-13; four layers over the whole diff; 76 findings: 0 high, 13 medium, 55 low, 8 false). Per-row evidence is in the Review Triage Log.**
- Patched, 16 entries.
  - Medium, 4:
    - the real-loop events-stripped control asserted what was shown, never what was selected (VG-1, VG-OQ, VG-R1, VG-R2, VG-T11, IA-R3);
    - the wiring scan's tightening was left half-done: an untrue helper comment, an orphan parameter, hatch bodies matched by substring windows (ECH-R1, VG-R3a, IA-R1, IA-R2);
    - the glyph test's positive control could not see a reversed bit order (VG-V4);
    - the ragged-row case could not fail for the width check — found by running its mutation (VG-T1).
  - Low, 12: `reset()` now restores the negative control (BH-2, ECH-3, VG-3); the region's bottom bound is pinned (BH-6); a placed-sprite registry case (BH-8, VG-V5); the "strictly inside its frame" sanity (ECH-R2); three JSDoc blocks moved onto their exports (BH-R1, IA-R6); the after-window positive compares rasters (BH-R3); two duplicate assertions deleted (BH-R4, VG-V1, VG-V2, VG-R5); the unit header and a derived literal corrected (BH-R5, VG-R4, IA-R5); an unused export removed (BH-R6, IA-R7); a stale `boot.ts` comment corrected (IA-R4); the own-key lookup pinned (VG-V6b); missing and stale `mutation:` lines demonstrated and written (VG-T2 to VG-T8, VG-T10, VG-T12).
- Deferred, 1 entry (frontmatter `deferred:`): on 2-4-player score layouts the mode fields line masks most of the in-game strip (BH-1, IA-D3). It follows from the frozen intent's own rules and is not reachable until Epic 3's events exist.
- Rejected, 32 rows:
  - Unreachable in this tree, or the fix guards a state never demonstrated: BH-3 (hatch argument unchecked), BH-10 and ECH-1 (keyed event during a continuing PRESS START), BH-13 and ECH-4 (unvalidated placements), ECH-5 (`NaN` region bound).
  - Intent-bound or by design: BH-7 and IA-D2 (plain-string keys; Story 4.5 owns the real triggers), BH-9, VG-V3 and IA-D5 (the glyph check is AC 3's literal wording), ECH-2 (a real `mode_attract_started` would match the key, as Design Notes intend), BH-12 and IA-D4 (row and file land in one commit), VG-T9 and IA-D1a (AC 4 and SM-3 are not this stage's), IA-AD (no AD is contradicted).
  - No defect at the cited place, measured: BH-15 (the event lands at 9273 inside the frame ending 9282).
  - Unspecified by the intent, so pinning it would be inferring intent: BH-5 and VG-V6a (same-tick tie).
  - Cosmetic, or needs new public surface for no reachable gain: BH-4 and VG-V6c (`sequence()` throws), BH-11 (`renderFrame` in both arms; the Code Map's own form), BH-14 (panel size literals), BH-R2 and VG-R3b (`runAttract`'s default step), IA-D1b (the replica's two-argument `renderFrame`).
  - Pre-existing repository idiom with an executed check elsewhere: VG-2 (`boot.ts` is pinned by source text only; AC 4 is the executed check).
  - The fix is an edit to this spec: VG-R6a, VG-R6b, VG-R6c, IA-R8.

**Follow-up review recommendation: true.** Patched this pass: 0 high, 4 medium, 12 low. The named risk: this pass's own patches — the reset-seam line in `boot.ts` and the rewritten controls in the three test files — were written, verified and mutation-tested by the same agent, and no independent layer has read them.

**Verification performed (2026-10-13, on the patched tree; details under Verification).**
- `pnpm typecheck`, `pnpm lint:boundaries`, `pnpm check:headers`, `pnpm check:attributions`: green.
- `pnpm test`: 141 files / 2303 tests passed, none failed, none skipped.
- Matrix Test Audit: all 11 I/O rows have a covering case that ran and passed.
- AC 5: the five protected paths are unchanged against `e2492f5` and `c9754b3`; 5 goldens, 77 fields, 0 differing, compared field by field from parsed JSON; both instruments have a positive control.
- `pnpm build && pnpm check:dist && pnpm check:size`: OK, 1.193 MB of 2.750 MB.
- Rule 19: 28 `mutation:` lines, each demonstrated red by an atomic, self-restoring run with the tree byte-identical afterwards. Two instruments were green when first run and were patched: the integration events-stripped control and the ragged-row case.
- Rule 6: no AD or Conventions row is contradicted.

**Residual risks.**
- AC 4 is not verified by this stage. Nothing here proves the browser draws the art: `NullEngine` rasterises nothing, and `boot.ts` is pinned by source text only.
- AC 3 is closed on its proxy. Whether a stranger reads the scene as a dragon and a knight is SM-3, the author's.
- The Mode-prompt, War-start and Jackpot sequences have fired only from synthetic events. Story 4.5 owns the real triggers, and the deferred masking item bites exactly there.

**For the lead, before AC 4.**
- `reset()` now sets `setBackglassSequencesEnabled` back to `true`. So do `replayRecorder.start()`, `replayRecorder.play()` and a tuning-panel hot-apply, which reset the loop. To keep the negative control across one of those, call `setBackglassSequencesEnabled(false)` again afterwards.
- `backglassState()` returns `{ screen, sequence, frameIndex }` and keeps reporting the due sequence while the art is hidden, so one sampler can time a capture and its control.
- Attract art shows only on `attract_prompt`, in rows 8-31: six frames of 500 ms, looping. On a cold boot the keys screen holds for the first 3 s, and it carries no art.
- Match art shows on `game_over`, in rows 24-31, for 2.5 s from `match_drawn`: ten frames of 250 ms, a small wyrm crossing left to right. `match_drawn` comes about 5 s after the last drain, the first 3 s of which are the end-of-ball screen, so the capture window is short.
- Footprint extensions (Rule 11, uncontended) are unchanged from Design Notes: `src/presentation/backglass/{frame,raster,dmd-art,sequences}.ts`, `src/host/boot.ts` and the three new test files.
- Story 4.5's epics.md block still does not carry the moved real-trigger check. That block is not Epic 5's to edit.
