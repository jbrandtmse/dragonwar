---
title: 'Story 5.5: Backglass art and DMD frames'
type: 'feature'
created: '2026-09-30'
status: 'ready-for-dev'
baseline_revision: 'e2492f5317a87c13146d7783de4f29e6efd41d67'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-13-match-game-over-and-return-to-attract.md'
warnings: [oversized]
deferred: []
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

## Review Triage Log

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
- AC 1: `mutation: place an Attract sprite at col 120 → the grid/region containment case red`, and `mutation: delete the dmd-art.ts ATTRIBUTIONS row → the attribution case red`.
- AC 2 (selection): `mutation: select Match on phase === 'game_over' instead of on the match_drawn event → the events-stripped control red`, `mutation: startTick = snapshot.tick → the timing case red`, and `mutation: rename the war_started key → the future-key case red`.
- AC 2 (legibility): `mutation: skip the protected mask in rasterise → the war_started 2-player-with-fields legibility case red`, and `mutation: ignore duration for non-repeating sequences → the Match "after" case red`.
- AC 2 (wiring): `mutation: remove composeSequence from boot.ts → the wiring scan red`, and `mutation: drop the Attract trigger → the integration Attract case red`.
- AC 3: `mutation: remove knight from every Attract frame → the both-sprites case red`.
- AC 4 (lead): the negative control is `setBackglassSequencesEnabled(false)`.

**Manual checks:** AC 4, run by the lead in Chrome.

## Auto Run Result

Status: ready-for-dev
Blocking condition: none

**Planning summary (halted after planning, as directed).**
- Ledger inbox: empty, `owned_ledger=0`.
- Governing ADs: AD-1, AD-3, AD-4, AD-9 and AD-16.
- Checked at planning, nothing forbids the plain-string keys:
  - `DEVICE_NAME_PATTERN` does not match any of the five keys.
  - The tick/ms lint rule is scoped to `src/sim` only.
  - A `Record<string, ...>` lookup by `event.type` type-checks.
- Font: `font.ts` has an in-project provenance row. The sequences use no font and add no text.

**Amendment candidate (Rule 5 apply-and-report, for the lead).** AC 2 asks for every sequence to be keyed by an event name, but the tree has no Attract event. Attract is keyed `mode_attract_started` and raised in presentation at each `attract_prompt` start. See Design Notes.

**Footprint extensions (Rule 11, uncontended):**
- `src/presentation/backglass/{frame,raster,dmd-art,sequences}.ts`
- `src/host/boot.ts`
- Three new test files.

**Cross-epic note.** Story 4.5's epics.md block does not carry the moved real-trigger check. That block is not Epic 5's to edit.
