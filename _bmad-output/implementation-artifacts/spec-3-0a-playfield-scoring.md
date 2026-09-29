---
title: 'Story 3.0a: Playfield scoring'
type: 'feature'
created: '2026-09-29'
status: 'done'
baseline_revision: '47860717fb2ff30113848d944274c7a17390259a'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Nothing on the playfield scores. Pops, slings, the Spinner and a completed DRAGON bank award nothing, so the scoring halves of FR-26, FR-28 and FR-31 are missing (DW-278). A browser playthrough scored 0 across four balls. Two defects sit in the same code. A tilted ball still earns letters, bonus credit and a skill-shot award (DW-246). A reset bank re-appends letters, so `players[p].letters` collects duplicates such as `DRAGOND` (DW-283).

**Approach:** Add one small scoring module, `sim/rules/scoring.ts`. It holds the scoring gate (`phase === 'game'` and not tilted), the only score-write helper modes use, and a letter append that skips duplicates. The base mode (priority 100) scores pops, slings, Spinner revolutions and bank completions from device events it already receives. The skill shot, the bonus folds and the letters fold all check the same gate. The four new values are `unverified` tunables. The golden headers get a header-only re-record.

## Boundaries & Constraints

**Always:**
- Scoring is **open** only when `state.phase === 'game'` and `!state.machine.tilt.tilted`. That is `scoringOpen(state)` in `src/sim/rules/scoring.ts`. Every earner in this story checks it: the four new ones, the skill-shot award and its letter, the letters fold, and both bonus folds (`creditBonusFromDeviceEvents` and `advanceBonusMultiplier`). This implements the author's DW-246 decision (2026-09-28): scoring STOPS under Tilt.
- `awardScore(state, player, points)` is the only path a mode uses to add to `players[player].score`. It returns the **same reference** when scoring is closed, when `points <= 0`, or when the player does not exist.
- The base mode scores against its own `active.player`, never against `currentPlayer`:
  - `playfield_switch_closed` whose `switch` is a `TABLE.popWiring[*].switch` → `popScore`.
  - `playfield_switch_closed` whose `switch` is a `TABLE.slingWiring[*].switch` → `slingScore`.
  - `spinner_spin { count }` → `count × spinnerScore`.
  - `bank_completed` → `dragonBankAward`, once per event.
  - The pop and sling sets are derived from `TABLE` once at module load. `s_spinner` is also a playfield switch, but it scores only through `spinner_spin`, never twice.
- Letters: `addDragonLetters(existing, incoming)` appends each uppercase letter not already present, in the order it arrives, so `letters` never holds a letter twice. Letters persist across balls. `bank_completed` does NOT clear them: DRAGON stays spelled until Story 3.9's War end resets it (FR-28, FR-40, AD-7). The bank reset is unchanged: `drop-bank.ts` still pulses `c_dragon_bank_reset` on the completion tick.
- The bonus `letters` category still counts every `bank_target_down` this ball, as Story 2.10 shipped it. DW-283 is about the `letters` string only.
- Four new top-level `TUNING` entries go after `bonusStrikeValue` in the existing `entry(value, source, 'unverified')` line shape (the `test/tuning-source.test.ts` round trip parses it):

  | Entry | Value | Source must quote |
  |---|---|---|
  | `popScore` | 1000 | PRD FR-31: "pops and slings score and disturb the ball" |
  | `slingScore` | 500 | the same FR-31 phrase |
  | `spinnerScore` | 250 | PRD FR-26: "the Spinner awards per rotation" |
  | `dragonBankAward` | 50000 | PRD FR-28: "all six down spells DRAGON, awards, and resets the bank" |

  - Each `source` starts `authored:`. It says that no planning artifact states the figure, gives its scale relative to `skillShotAward` (25000), and notes it is adjustable until the Story 3.11 playtest freeze.
  - Every double-quoted phrase in a source must be verbatim text from the FR it names. Invent no other quotation.
  - No key ends in `Ms`.
- Golden re-record, header only: in all five `test/replays/*.golden.json`, `header.gameStart.tuning` gains exactly the four new entries, and no other leaf changes. Verify per field by JSON parse, never by grep. This is pre-authorised.
- Rule 14 applies to source code: non-ASCII characters are written as escapes. Every AC has a pinning test with a `mutation:` line (Rule 19). Every negative is paired with its positive. No expectation is derived from the value under test: always use `resolveTuning()` symbols.

**Never:**
- Never add a `GameState`, `machine` or `PlayerState` field, and never add a `SemanticEvent` or `DeviceEvent` member. `playfield_switch_closed { switch }` already exists (AD-19).
- Never write a device-name literal (`s_`/`c_`) under `src/` outside `sim/table/dragonwar.ts`.
- Never score `dragon_hit`, lanes, outlanes or Loops. They belong to Stories 3.6, 3.7 and 3.9.
- Never move the drain-tick bonus write or change its tilted forfeit (`ball-controller.ts:1134-1154`).
- Never touch `src/sim/physics/**`, `src/presentation/**`, `src/presentation/mechanisms/**`, `src/presentation/scene/**`, `assets/src/**`, `public/assets/**`, `tools/make-placeholder-blend.py` or `ATTRIBUTIONS.md`. The mechanisms, scene, assets, blend tool and `ATTRIBUTIONS.md` paths are contended with Epic 5.
- Never let any golden `expectedHash`, `expectedGameStateHash`, `transitions`, `coilPrologue`, `durationTicks`, `checkpointTicks`, `expectedCheckpointHashes`, `tableHash` or `assetHash` move. A trajectory or hash move means HALT (intent gap).
- Never clear or reset letters on `bank_completed`. Never build the War's letter reset (Story 3.9).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pop / sling | game, ball in play (base active), untilted; close `s_pop_2`, then `s_sling_r` | the active player's score +`popScore`, then +`slingScore` | No error expected |
| Spinner | `spinner_spin` with `count` 1 on each of 3 ticks; also a base-mode step fed `{count: 3}` | +`3 × spinnerScore` in both cases; `s_spinner`'s own `playfield_switch_closed` adds nothing | No error expected |
| Bank completed | the six DRAGON targets, one per tick | letters `DRAGON`; bonus letters 6; exactly one `+dragonBankAward` on the sixth tick; `c_dragon_bank_reset` pulsed that tick | No error expected |
| Re-completion, no duplicates (DW-283) | after a completion, the bank reset edges (`open` ×6), then all six down again | a second `+dragonBankAward`; letters still `DRAGON` (6 chars) | No error expected |
| Across balls (DW-283) | ball 1: D, R down; drain; ball 2: D, A down | letters `DR` → `DRA` (D not re-added); ball-2 bonus letters = 2 | No error expected |
| Tilted (DW-246) | after the tilt: pop, sling, spinner, six targets, a Loop shot, the Top lanes completed, the lit Top lane with the skill shot launched | score, letters, `bonus.byCategory` and `bonus.multiplier` all unchanged; the skill shot is removed from `modes[]` with no award. Control: the same script untilted pays each one | No error expected |
| Same-tick Tilt | the tilting bob closure and a pop on one tick | no pop score (the tilt controller runs first) | No error expected |
| Next ball after Tilt | the tilted ball drains; next ball, a pop | +`popScore` (the tilt reset at `ball_will_start`) | No error expected |
| Outside a game | `game_over` with players and scores present, or Attract after a game; pop, spinner and DRAGON-target closures | every score, `letters` and `bonus` unchanged. Control: the same closures mid-ball score and add the letter | No error expected |
| Hot seat | two players, player 2 up; pop | only `players[1].score` rises | No error expected |
| Skill-shot miss on a pop or sling | skill shot launched and armed; first closure `s_pop_2` | the skill shot closes with no award; the score equals exactly `popScore` | No error expected |

</intent-contract>

## Code Map

- `src/sim/rules/devices/index.ts:385-425` (Stage 3): emits `playfield_switch_closed { switch }` on every closed edge in `PLAYFIELD_SWITCHES`, which includes `s_pop_1..3`, `s_sling_l/r` and `s_spinner`. `:427-439` (Stage 4): one `spinner_spin { count }` per tick = the tick's closed `s_spinner` edges (physics closes it once per revolution, `sim/physics/spinner.ts` header). Read-only.
- `src/sim/rules/devices/drop-bank.ts:80-110`: `bank_target_down` per genuine letter (latched), and `bank_completed` once when six are down, paired with the reset pulse. The latch clears on any reset edge. The bank also resets on every `ball_will_start` and on a ball-search request, with no `bank_completed`. Read-only.
- `src/sim/table/dragonwar.ts:498-520`: `popWiring` (`c_pop_n → {switch}`) and `slingWiring`, the derivation sources. Read-only.
- `src/sim/rules/index.ts:300-352`: step order is devices → tilt → `creditBonusFromDeviceEvents` → ball controller → mode stack → `advanceBonusMultiplier`. A Tilt that engages on tick N is already set for every earner on tick N. Read-only.
- `src/sim/rules/modes/base.ts:99-166`: `createBaseMode()` / `step()`. Add `tuning` and the four scoring branches here.
- `src/sim/rules/modes/index.ts:93`: `createBaseMode()` → `createBaseMode(tuning)`. The `:117-148` fan-out comment names each mode's consumed events; update it.
- `src/sim/rules/modes/skill-shot.ts:213-231`: the award and letter write. Route both through `scoring.ts`. The mode still closes when scoring is shut.
- `src/sim/rules/bonus.ts:148-190,197-229`: the two folds, each gated on `phase === 'game'` today. Switch both to `scoringOpen`.
- `src/sim/rules/ball-controller.ts:914-930`: the letters fold, gated on `phase === 'game'` only, with no dedup (DW-283, DW-246).
- `src/sim/rules/lamps.ts:56`: `letterIsSpelled` (`includes`). This is why the dedup cannot change a lamp. Read-only.
- `src/sim/contracts/state.ts:103`: the `letters` doc. Add "each letter at most once; persists across balls".
- `src/sim/table/tuning.ts:671-722`: the `skillShotAward` and `bonus*Value` precedents. Insert after `:722`.
- `test/tuning.test.ts:66-95`: the `scalarKeys` ratchet (add the four keys). `:764-790`: the Story 3.0 verbatim-quote audit, the pattern for AC 8.
- `test/util/switch-script.ts:238`: `runRulesScript`. `test/rules-modes.test.ts:60-110`: the `gameState()`/`player()`/`armedAfterLaunch()` builders.
- `test/backglass-integration.test.ts:236-290`: the Story 3.0 AC 10 fold (`buildSnapshot` + `advanceBackglass` + `renderFrame`), the Integration AC pattern. On the `score` screen, `rows[i]` is player *i*'s `formatScoreCell(score)`.
- `src/sim/loop/index.ts:425-490`: the loop's step order (`buttonSwitchEdges` exported, `machine.step`, `rules.step` with `MachineReport`, next-tick commands), the pattern for AC 7's composition.
- Tests that go red by design: `test/rules-modes.test.ts:269-297` (the skill-shot misses on `s_sling_l`, `s_pop_2` and `s_pop_1` expect score 0).
- `test/replays/*.golden.json` (5): `header.gameStart.tuning` is compared canonicalised against `resolveTuning()` (`sim/loop/replay.ts:276`). No re-record script exists.

## Tasks & Acceptance

**Execution:**
- `src/sim/table/tuning.ts` -- add `popScore`, `slingScore`, `spinnerScore` and `dragonBankAward` per Always, each with a JSDoc block -- DW-278.
- `src/sim/rules/scoring.ts` (new, GPL header) -- `scoringOpen`, `awardScore` and `addDragonLetters`. Pure, with no closure state and no imports from `physics`/`presentation`.
- `src/sim/rules/modes/base.ts` -- `createBaseMode(tuning)`; derived pop and sling switch sets; the four scoring branches via `awardScore`; header prose (AD-8: base scoring lives in the priority-100 mode) -- DW-278.
- `src/sim/rules/modes/index.ts` -- pass `tuning`; correct the fan-out comment.
- `src/sim/rules/modes/skill-shot.ts` -- award via `awardScore`; letter via `addDragonLetters` only when `scoringOpen` -- DW-246.
- `src/sim/rules/bonus.ts` -- both folds gate on `scoringOpen`; header note -- DW-246.
- `src/sim/rules/ball-controller.ts` -- the letters fold gates on `scoringOpen(nextState)` and appends via `addDragonLetters`; the file must not grow in net lines -- DW-246, DW-283.
- `src/sim/contracts/state.ts` -- `letters` doc only.
- `test/replays/*.golden.json` -- header-only re-record: insert the four entries exactly as `resolveTuning()` emits them. A throwaway generator is allowed; do not commit it. Keep LF and the existing formatting.
- `test/rules-scoring.test.ts` (new) -- AC 1-5 and every I/O row through `runRulesScript`, plus direct unit tests of the three `scoring.ts` helpers.
- `test/rules-modes.test.ts` -- the three miss cases now expect exactly that device's own base score (`popScore`/`slingScore` from `resolveTuning()`) and still no skill-shot award or letter. Keep their intent.
- `test/backglass-integration.test.ts` -- AC 6 and AC 7.
- `test/tuning.test.ts` -- the four keys in `scalarKeys`; AC 8's verbatim-quote and `unverified` checks.
- Any other pre-existing exact-score assertion that goes red may be updated only when its script closes a pop, sling or spinner switch or completes the bank. The fix adds that term from `resolveTuning()`. List every such edit in the Auto Run Result. Any other red is a defect.

**Acceptance Criteria:**
- AC1 (FR-31, DW-278): Given a ball in play in `phase: 'game'`, untilted, when a pop or sling switch closes, then the base mode's player scores `popScore` or `slingScore`, once per closure.
- AC2 (FR-26): Given the same, when `spinner_spin { count }` fires, then that player scores `count × spinnerScore`, and `s_spinner`'s `playfield_switch_closed` adds nothing further.
- AC3 (FR-28, DW-283): Given six targets going down, when `bank_completed` fires, then `dragonBankAward` is paid exactly once for that completion and `c_dragon_bank_reset` is pulsed that tick. Given a later re-completion, or a later ball's hits, then `letters` never holds a letter twice, keeps every letter already spelled, and a re-completion pays again.
- AC4 (DW-246, FR-15 as decided): Given `machine.tilt.tilted`, when any earner fires, then nothing scores. The earners are pop, sling, spinner, bank completion, target letter, bonus category, multiplier rung, and the skill-shot award or letter. The untilted control pays each one, and the next ball after the Tilt scores again.
- AC5: Given `game_over`, or Attract after a game, with players present, when a pop, spinner or DRAGON-target closure arrives, then no score, letter or bonus count changes. The same closures mid-ball are the positive.
- AC6 (Integration, Rule 1): Given a real `createRules()` run via `runRulesScript` in Hot seat (a pop, a sling, a 3-tick spinner, then six targets), when every tick is folded through `advanceBackglass()`/`renderFrame()` as `boot.ts` does, then the `score` screen's current-player row shows `formatScore(total)` after each scoring tick. The totals are `popScore`, then `+ slingScore`, then `+ 3 × spinnerScore`, then `+ dragonBankAward`, built from `resolveTuning()` symbols. The other player's row stays 0.
- AC7 (real runtime, Rule 3): Given a real `createMachine()` + `createRules()` composition in the loop's step order, with Start pressed, the served ball settled, and a 345-tick plunger hold, when the run proceeds to the first ball end or save, then:
  - an oracle built from the physics switch edges predicts the score: for every tick, `popScore × pop edges + slingScore × sling edges + spinnerScore × s_spinner edges`, counted from `machine.step().switchEvents` while `phase === 'game'` and untilted;
  - the gate for each tick is read from that tick's resulting state;
  - the DMD current-player score row, folded through `advanceBackglass()`/`renderFrame()`, shows exactly the oracle's running total on every tick the `score` screen is up;
  - sanity: at least one `s_spinner` edge occurs in-game, otherwise the test is vacuous;
  - sanity: no DRAGON-target and no Top-lane edge occurs (measured: none). If one ever does, the test fails loudly as a sanity break rather than extending the oracle.
- AC8 (AD-15): Given `TUNING`, then the four entries exist with `confidence: 'unverified'`, and every double-quoted phrase in each `source` appears verbatim in the PRD FR section it names (at least one per entry). All five goldens pass, and a JSON-parsed diff of each golden shows only the four added `header.gameStart.tuning` keys.
- AC9: Given the story, when the gates run, then `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` all pass.

## Spec Change Log

- 2026-09-29, lead spec gate: FR-15 amended in `prd.md` and `epics.md` with the author's DW-246 decision ("while Tilted nothing scores -- no switch or device award, no DRAGON letter, no bonus credit, no skill-shot award"); AD-8 amended (Rule 20): every score write goes through `sim/rules/scoring.ts`'s gate and helper, and base playfield scoring lives in the base mode. No spec text changed.

## Review Triage Log

### 2026-09-29 — Review pass
- verdicts: 41 findings — high 0, medium 4, low 33, false 4, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) No test shows the base mode reads the `ResolvedTuning` it is given rather than the `TUNING` singleton — added an override test through a real `createRules()` run; its mutation is recorded.
  - `[false]` `[reject]` (blind) The skill shot keeps only `.players` from `awardScore()` — `awardScore` changes nothing but `players`, so no field is dropped today; the concern is a hypothetical future helper.
  - `[low]` `[patch]` (blind) AC 7's `maxShown` stores the oracle rather than the DMD text, and `stateMismatches` reads `players[0]` while the row reads `currentPlayer` — reworded the sanity message and keyed `stateMismatches` on `currentPlayer`.
  - `[low]` `[reject]` (blind) The real-runtime AC 7 never sees a pop or sling edge — the intent fixes this plunge path, with at least one Spinner edge as its sanity check. Pops and slings are pinned through a real `createRules()` in AC 1 and AC 6. Forcing a physics pop needs a different scenario, not a direct correction.
  - `[low]` `[patch]` (blind) Docs disagree on letter order (spelling vs arrival) — `state.ts` and the `scoring.ts` header now say "in the order each was first struck", matching the intent's "in the order it arrives".
  - `[false]` `[reject]` (blind) `addDragonLetters` accepts non-DRAGON characters — both callers pass only `TABLE.dropBankWiring` letters (the typed `bank_target_down.letter` and `nextUnspelledLetter`), so no other character reaches it.
  - `[low]` `[patch]` (blind) Nothing enforces the single score-write path — added `test/ad8-score-write-path.test.ts`, a source ratchet over `src/sim/rules/modes/**` with a pattern control, and recorded its mutation. It lives outside the headless `rules-*` set because it reads the filesystem.
  - `[low]` `[patch]` (blind) `PlayerState.score` has no doc — added one naming `awardScore()` and the drain-tick bonus as its only writers.
  - `[low]` `[reject]` (blind) In Hot seat the bank award goes to `active.player` and the letters to `currentPlayer`, untested — the two are always equal in play (the stack starts the base mode for `currentPlayer`). Only a constructed state separates them, so no user can meet it.
  - `[low]` `[patch]` (blind) "Completion paid once" checked the score only on the completion tick — it now also asserts the score before the drain equals `dragonBankAward`, and that ball 2's D adds nothing. (A first attempt compared the final score to `BANK` and went red on the drain-tick bonus, which is legitimate.)
  - `[low]` `[patch]` (blind) AC 6 reads `rows[0]` without checking `currentPlayer === 0` — added that sanity assertion.
  - `[low]` `[reject]` (blind) The new tests duplicate helpers (`player()`, `gameState()`, `NO_BALL_SAVE_TUNING`, `commas()`) — this test-local duplication follows the `rules-modes.test.ts` precedent. A shared-util refactor is more than a direct correction. A hand-written `commas()` also keeps the expectation independent of the code under test.
  - `[low]` `[reject]` (blind) AC 7 repeats the loop step-order harness from `rules-tilt-integration.test.ts` — extracting a shared harness is a cross-file refactor. If `sim/loop` drifts, the oracle fails loudly.
  - `[low]` `[reject]` (blind) `tuning.test.ts` has two versions of the FR quote audit — folding the older Story 3.0 block into the general helper would refactor a passing test outside this story.
  - `[medium]` `[patch]` (blind + verification-gap) `expect(key.endsWith('Ms'))` checks a literal from the test's own `CASES` table and cannot fail (Rule 19) — deleted it. The typed `TUNING[key]` access and `resolveTuning()`'s own `Ms` handling carry the rule.
  - `[low]` `[reject]` (blind) The spec's Verification section keeps two stale mutation predictions — the fix edits this build's spec. Both deviations are recorded under Recorded mutations and in the Auto Run Result.
  - `[low]` `[reject]` (blind) The spec's status fields disagree ("Status: implemented") — the fix edits the spec, and finalize rewrites the Auto Run Result to `done` anyway.
  - `[low]` `[patch]` (blind) The `base.ts` header "(never `currentPlayer`, which is right in Hot seat)" is ambiguous — reworded.
  - `[low]` `[patch]` (blind) Nothing in the code points Story 3.9 to FR-28's War exception — added a comment on the bank branch quoting FR-28 verbatim ("counts as Strikes instead of letters", checked against prd.md).
  - `[low]` `[reject]` (blind) A scoring closure on the drain tick gets its letter but no award — a single ball cannot be at the drain and at a target, pop or Spinner on the same 1 ms tick. In multiball, one ball draining neither ends the ball nor tears down the modes. The fix would reorder the step pipeline.
  - `[low]` `[patch]` (blind) `wiredSwitches()` widens the switch to `string` and casts it back — the parameter is now typed `{ readonly switch: SwitchName }` with no cast; typecheck passes.
  - `[low]` `[reject]` (blind) No test covers a Slam on the same tick as a scoring switch — a Slam sets `phase` to Attract before any earner runs. The phase conjunct is already pinned by AC 5 and the helper tests, so another row adds no discriminating power.
  - `[low]` `[reject]` (edge-case) The same-tick drain asymmetry — same root cause and reason as the blind drain-tick row: physically unreachable with one ball.
  - `[low]` `[reject]` (edge-case) A lane set completed while Tilted still appends to `completedSets` — the intent's Tilted row lists only score, letters, `bonus.byCategory` and `bonus.multiplier` as unchanged, and its earner list excludes lane state. Gating it would change specified behaviour (by-design).
  - `[false]` `[reject]` (edge-case) `addDragonLetters` could duplicate if `existing` held lowercase letters — every writer of `letters` goes through `addDragonLetters`, which upper-cases, and the initial value is `''`. A lowercase `existing` cannot arise.
  - `[low]` `[patch]` (edge-case) The `state.ts` doc says "spelling order" but the helper uses arrival order — same patch as the blind letter-order row.
  - `[low]` `[reject]` (edge-case) AC 7's oracle gate ignores base-mode presence on a drain tick — a pop on the drain tick is unreachable with one ball, and a mismatch would fail loudly, never a false green.
  - `[medium]` `[patch]` (verification-gap) AC 5's `scores` assertion cannot fail for any change to the gate (the fixture has `modes: []`), and its comment overclaims — added constructed `game_over`/`attract` cases with a base entry present, reworded the comment, and recorded the phase-conjunct mutation turning the new cases red on scores.
  - `[medium]` `[patch]` (verification-gap) The `endsWith('Ms')` tautology — same patch as the blind row.
  - `[low]` `[reject]` (verification-gap) AC 9 has no `mutation:` line — AC 9 is a command gate, and adding a line would edit the spec. The review-pass note records why none applies.
  - `[low]` `[patch]` (verification-gap) AC 7's `maxShown` message overstates what it measures — same patch as the blind row.
  - `[low]` `[reject]` (verification-gap) AC 7 is coupled to `public/assets/dragonwar.collision.json`, which Epic 5 may change — its sanity asserts fail loudly, never a false green. The file is contended with Epic 5, so this story may not touch it.
  - `[low]` `[reject]` (intent-alignment) The Problem is stated at the browser, but the tests exercise the rules and harness — the lead's browser smoke in ## Verification covers the browser. The Rule 3 real-runtime evidence is AC 7, a real machine + rules run folded to the DMD.
  - `[low]` `[reject]` (intent-alignment) The bank award runs only on scripted edges, and AC 7 excludes the bank — this is the AC 7 shape the intent fixes (a bank edge is a declared sanity break). AC 3 and AC 6 run the bank through a real `createRules()`.
  - `[low]` `[reject]` (intent-alignment) The Tilted rows start from a `tilted: true` fixture — "Same-tick Tilt" and "Next ball after Tilt" tilt through a real `s_tilt_bob` closure, and the gate reads only `machine.tilt.tilted`.
  - `[medium]` `[patch]` (intent-alignment) Outside a game, the score line is guarded by the teardown, not the gate — same patch as the verification-gap AC 5 row.
  - `[low]` `[reject]` (intent-alignment) The Hot-seat payee split uses a constructed fixture — the two never differ in play; same reason as the blind Hot-seat row.
  - `[low]` `[reject]` (intent-alignment) The letters and bonus folds use `currentPlayer`, so a split state would pay two players — the intent's "never against `currentPlayer`" binds the base mode only, and the split is unreachable in play.
  - `[low]` `[patch]` (intent-alignment) Nothing checks structurally that `awardScore` is the only path — same patch as the blind ratchet row.
  - `[low]` `[patch]` (intent-alignment) The letters doc says "spelling order" — same patch as the blind letter-order row.
  - `[false]` `[reject]` (intent-alignment) The goldens never run the scoring code — the intent requires only that no golden hash or trajectory moves. No golden presses Start (measured in Design Notes), so there is nothing for the scoring code to run, and the new behaviour is pinned elsewhere.

## Design Notes

**Measured at this tree (lead guidance: measure before you prescribe).**
- **Pops and slings DO emit a rules event.** The retrospective's "no rules event at all" is stale. Since Story 2.7, the AD-19 amendment of 2026-09-06 added `playfield_switch_closed { switch }` for the 28-switch derived playfield set, which includes `s_pop_1..3` and `s_sling_l/r` (`devices/index.ts` Stage 3). No new event is needed and AD-19 is not amended. This relies on AD-19's clause "Modes, scoring and the ball controller consume device and shot events and never a raw switch". The skill shot already matches `playfield_switch_closed.switch` against a TABLE-derived switch (`skill-shot.ts:216`).
- **`spinner_spin`**: one event per tick carrying the count of closed `s_spinner` edges. Physics closes `s_spinner` once per revolution. **`bank_completed`**: one per completion, on the sixth target's tick, together with the reset pulse (consumed at N+1). It is re-armed only by a reset edge.
- **Score writes today** (two): the drain-tick bonus (`ball-controller.ts:1154`) and the skill-shot award (`skill-shot.ts:224`). Nothing reads `spinner_spin`, `bank_completed` or the pop and sling closures.
- **Letters today**: `ball-controller.ts:914-930` appends every `bank_target_down` letter, gated only on `phase === 'game'`. There is no dedup and no tilt gate. `bank_completed` does not touch them, which is already conformant with FR-28 and FR-40. Every `ball_will_start` resets the bank, so a player who re-hits D on ball 2 re-appends D. That is the DW-283 path. The skill shot's `nextUnspelledLetter` already skips spelled letters.
- **Tilt today**: `tiltController.step` runs before every earner, and `startBall` clears `tilt` at `ball_will_start`. Modes stay in `modes[]` under Tilt until `ball_ended`. Slam goes straight to Attract through `enterAttract` (`modes: []`).
- **The real plunge path**, measured by a throwaway headless probe using the loop's own step order, since deleted. After a 345-tick hold in a started game:
  - `ball_launched` +24 ticks after release, `s_loop_l_out` +3242, `s_loop_l_in` +3825, `s_outlane_l` +4799, **`s_spinner` +4920 (one closure)**, `s_drain` +5084, then `ball_saved` and an automatic re-launch.
  - Holds of 330 and 360 ticks: exactly one `s_spinner` closure on the first pass (+5204 and +4679).
  - No pop, sling or bank edge occurs before the spinner. The skill shot closes with no award on `s_loop_l_out`.
- **The suite at this tree**: 129 files / 2128 tests, all passing.
- **The goldens** (re-verified from Story 3.0's JSON-parse audit): every transition has `start: false`, so no game runs, no mode is active and nothing can score in any golden. `header.gameStart.tuning` holds 64 keys.

**Decisions and why.**
- **Base scoring lives in the base mode, not the ball controller.** AD-8 says "scoring accrues from all active modes". The base mode is active exactly while a ball is in play in a game, and its `active.player` is the right payee in Hot seat. Story 3.1 generalises the stack around it. The letters fold stays in the ball controller (moving it would change which ticks count), but it shrinks.
- **One gate, one write path (`scoring.ts`).** DW-246's decision covers "every score write", and Stories 3.5-3.9 add more writers. One helper keeps them from each re-implementing the gate. The drain-tick bonus write is deliberately outside it: it runs at ball end and already forfeits on Tilt.
- **The multiplier is gated too.** A rung earned under Tilt is bonus credit, which DW-246 says stops. It has no score effect, since the bonus is forfeited and the multiplier resets per ball. Lane lit state is not scoring and keeps its Story 2.7 behaviour.
- **A completed bank keeps its letters.** FR-28 gives the award and the bank reset. FR-40 says letters reset only at War end. Stories 3.8 and 3.9 read "DRAGON spelled" as all six present. The award pays on every physical completion, whether or not the letters were already complete. Story 3.9 decides whether a completion during the War also pays (FR-28: "counts as Strikes instead of letters").
- **Values** are scaled to the one existing award, `skillShotAward` 25000. A bank of six aimed targets is worth 2×. A pop is incidental (1/25), a sling half a pop, and a Spinner revolution 1/100. All four are `unverified` until Story 3.11.

**Governing ADs:**
- AD-7: score and letters are player-scoped, with no new state.
- AD-8: scoring accrues from active modes, and base is priority 100.
- AD-19: device events only.
- AD-5: FR-15 Tilt.
- AD-15: tunables with provenance, and the header re-record.
- AD-3: no ms literal.
- AD-16: no device-name literal.
- AD-1: `sim` imports no `presentation`.

**Integration (Rules 1/2).** `sim/rules/scoring.ts` is a new shared module.
- Consumed-by:
  - this story's base mode, skill shot, bonus folds and letters fold, with the Backglass score row as the observable consumer (AC6, AC7);
  - 3.1: the generalised stack keeps base scoring in the base mode;
  - 3.5: the Hurry-up collect;
  - 3.6: the Joust Loop award;
  - 3.7: the Quick multiball awards;
  - 3.8/3.9: DRAGON spelled from the de-duplicated letters, and the Jackpot via `awardScore`;
  - 3.11: freezes the four values.
- Consumes: Story 2.4's device events, Story 2.6's Backglass, Story 2.7's stack and skill shot, Story 2.10's bonus folds, and Story 2.11's tilt controller.

**Ledger inbox (Rule 17).**
- DW-278 is addressed by AC1, AC2, AC3, AC6 and AC7.
- DW-283 is addressed by AC3 and the rows "Re-completion" and "Across balls".
- DW-246 is addressed by AC4 and the rows "Tilted", "Same-tick Tilt" and "Next ball after Tilt".

None is declined.

**For the lead.**
- (a) The author asked for FR-15 to be amended at this gate. Suggested added consequence: "while Tilted nothing scores: no switch award, no DRAGON letter, no bonus credit, no skill-shot award".
- (b) Rule 20: "every score write goes through one gate that is closed under Tilt and outside a game" is a convention later builders would drift on. Consider a Consistency Conventions row, or one sentence on AD-8.

**Footprint extensions to report:** `src/sim/contracts/state.ts` (doc only) and `test/*.test.ts` outside `test/replays`. Neither is contended.

## Verification

**Commands** (in a shell with `export BLENDER=C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe`; baseline 129 files / 2128 tests, all green):
- `pnpm test` -- expected: all green, including `test/replay-goldens.test.ts` and `test/tuning-source.test.ts`.
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions && pnpm build && pnpm check:dist && pnpm check:size` -- expected: each exits 0.
- Golden diff: a scratchpad Node helper parses each golden before and after and diffs the objects leaf by leaf. Expected: only `header.gameStart.tuning.{popScore,slingScore,spinnerScore,dragonBankAward}` are added.

**Mutations (Rule 19; apply, observe red, revert, confirm `git status --short` and `git diff --stat` unchanged, then record the actual test names here):**
- AC1: the base mode's pop branch removed → the pop row goes red. Separately, the sling set derived from `popWiring` → the sling row goes red.
- AC2: `spinner_spin` scores `spinnerScore` ignoring `count` → the `{count: 3}` case goes red. Separately, `s_spinner` added to the pop set → the "adds nothing further" case goes red.
- AC3: `dragonBankAward` paid per `bank_target_down` → the once-per-completion test goes red. Separately, `addDragonLetters` replaced by concatenation → the re-completion and across-balls rows go red. Separately, letters cleared on `bank_completed` → the across-balls row goes red.
- AC4: remove the `tilted` conjunct from `scoringOpen` → every tilted row goes red while its controls stay green. Separately, the gate removed only from `advanceBonusMultiplier` → the multiplier case goes red. Separately, the gate removed only from the skill shot → the skill-shot case goes red.
- AC5: remove the `phase` conjunct from `scoringOpen` → the outside-a-game test goes red on its DRAGON-target letter/bonus assertion. The base mode is already torn down in `game_over`, so the pop and spinner halves guard the teardown, not the gate. Record which assertion went red.
- AC6: the base mode pays `currentPlayer` instead of `active.player` → the Hot-seat row and AC6 go red. Separately, the bank award removed → the AC6 final row goes red.
- AC7: `spinnerScore` read as 0 in the base mode → the AC7 oracle comparison goes red, and the spinner sanity still holds.
- AC8: the `dragonBankAward` source misquotes FR-28 → the quote audit goes red. Separately, one golden's added entry removed → `StaleReplayHeaderError` goes red.

**Recorded mutations (implement stage, 2026-09-29).** A scratchpad script applied each mutation, ran the named test files, and reverted it. After each one, `git status --short`, `git diff --stat` and the md5 of both new files matched the pre-mutation baseline. File keys: `S` = `test/rules-scoring.test.ts`, `M` = `test/rules-modes.test.ts`, `B` = `test/backglass-integration.test.ts`, `T` = `test/tuning.test.ts`, `G` = `test/replay-goldens.test.ts`.
- mutation: base mode's pop branch removed → S `AC 1 ... Matrix row "Pop / sling"` red. Also red: S `every TABLE.popWiring switch pays popScore ...`, S `once per closure ...`, S `Matrix row "Skill-shot miss on a pop or sling"`, M `AC 3 -- skill shot missed > s_pop_2 ...` and M `... no Top lane lit ...`. 13 red in all, each one a pop assertion.
- mutation: `SLING_SWITCHES` derived from `TABLE.popWiring` → S `AC 1 ... Matrix row "Pop / sling"` red (expected 1000 to be 1500). Also red: S `every TABLE.popWiring switch pays popScore and every TABLE.slingWiring switch pays slingScore`, M `AC 3 -- skill shot missed > s_sling_l ...`, S `AC 4 ... sling: control, untilted -> paid`, S `Matrix row "Tilted", control`.
- mutation: `spinner_spin` pays `spinnerScore` ignoring `count` → S `AC 2 ... Matrix row "Spinner": a base-mode step fed { count: 3 } pays 3 x spinnerScore` red (250 vs 750). No other test went red.
- mutation: the Spinner switch added to the pop set → S `AC 2 ... a base-mode step fed only the Spinner switch's playfield_switch_closed pays nothing (same state reference)` and S `AC 2 ... Matrix row "Spinner": count 1 on each of 3 ticks -> exactly 3 x spinnerScore` red. Three AC 4 and AC 5 controls whose totals include a Spinner closure also went red.
- mutation: `dragonBankAward` paid per `bank_target_down` instead of per `bank_completed` → S `AC 3 ... Matrix row "Bank completed" ... exactly one +dragonBankAward on the sixth tick` red. Also red: S `Re-completion`, S `a completed bank keeps its letters into the next ball`, and three AC 4 and AC 5 controls.
- mutation: `addDragonLetters` in the ball controller's letters fold replaced by concatenation (`player.letters + lettersDelta.toUpperCase()`) → S `AC 3 ... Matrix row "Re-completion" (DW-283)` red (`DRAGONDRAGON`) and S `AC 3 ... Matrix row "Across balls" (DW-283)` red (`DRDA`). Also red: S `a completed bank keeps its letters into the next ball` (`DRAGOND`) and S `Matrix row "Tilted", control` (`DDRAGON`). A first run with bare concatenation, without upper-casing, also went red, but on letter case alone. The upper-cased form isolates the duplicate.
- mutation: letters cleared on `bank_completed` (in the base mode's bank branch) → S `AC 3 ... Matrix row "Bank completed"`, S `Re-completion`, S `a completed bank keeps its letters into the next ball (FR-28, FR-40)` and S `Matrix row "Tilted", control` red. **Deviation:** the spec named the "Across balls" row here, but that row completes no bank, so this mutation cannot affect it. The test "a completed bank keeps its letters into the next ball" was added to pin this mutation.
- mutation: the `tilted` conjunct removed from `scoringOpen` → every S `AC 4 ... <earner>: Tilted -> unchanged` row went red: pop, sling, spinner, bank completion, target letter, bonus category, multiplier rung and skill shot. S `Matrix row "Tilted"`, S `Matrix row "Same-tick Tilt"`, S `Matrix row "Next ball after Tilt"` and the two helper unit tests also went red. Every `control` row stayed green.
- mutation: the gate removed only from `advanceBonusMultiplier` (back to `phase !== 'game'`) → S `AC 4 ... multiplier rung (the Top lanes completed): Tilted -> unchanged` and S `Matrix row "Tilted"` red. Nothing else went red.
- mutation: `scoringOpen` removed only from the skill shot's award condition → S `AC 4 ... skill shot (award, letter, and the mode closes either way): Tilted -> unchanged` and S `Matrix row "Tilted"` red on the letter (`'D'`). The score stays 0 because `awardScore` still gates it.
- mutation: the `phase` conjunct removed from `scoringOpen` → S `AC 5 ... game_over with players present: every player unchanged` and S `AC 5 ... attract with players present: every player unchanged` red on the **letters** assertion (`['DR', 'A']`). The two helper unit tests also went red. The scores assertion stayed green, as expected: the base mode is torn down outside a game, so the pop and spinner halves guard the teardown, not the gate.
- mutation: the base mode pays `currentPlayer` instead of `active.player` (pop branch) → S `Matrix row "Hot seat" ... the payee is the mode's own player, never currentPlayer: a (constructed) base entry for player 2 while currentPlayer is 0 pays player 2` red. **Deviation:** the plain Hot-seat row and AC 6 stayed green. In production the base mode always starts for `currentPlayer`, so the two values agree during play and no real script can tell them apart. The constructed-divergence test was added to give the Always clause an observable pin.
- mutation: the bank award removed (`awardScore(..., 0)`) → B `Story 3.0a AC 6 ... the current player's row reads popScore, + slingScore, + 3 x spinnerScore (one per tick), + dragonBankAward; the other player's row stays 0` red on its final row. S's five bank assertions also went red.
- mutation: `spinnerScore` read as 0 in the base mode → B `Story 3.0a AC 7 ... popScore x pop edges + slingScore x sling edges + spinnerScore x Spinner edges, counted in-game and untilted, equals the current player's row on every score-screen tick` red on `the DMD row equals the oracle on every score-screen tick`. Its Spinner sanity check, asserted earlier in the same test, held. B AC 6 also went red.
- mutation: `dragonBankAward`'s source quotes "all six down spells DRAGON and awards a jackpot" → T `Story 3.0a AC 8 (AD-15) ... dragonBankAward: confidence 'unverified', source starts 'authored:' and names PRD FR-28, and every quoted phrase is FR-28's own words (at least one)` red. No other test in T went red.
- mutation: `header.gameStart.tuning.dragonBankAward` deleted from `roll-and-drain.golden.json` → G `roll-and-drain: finalHash and finalGameStateHash match the recorded goldens` red with `runReplay(): header.gameStart.tuning no longer matches the live resolveTuning() output` (`StaleReplayHeaderError`). The other five roll-and-drain cases in G also went red.

**Measured at the implement stage.**
- Suite: 130 files / 2179 tests, all passing (baseline 129 / 2128; +1 file, +51 tests).
- `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`: each exits 0.
- Golden diff: a scratchpad Node helper JSON-parsed all five goldens before and after and compared them leaf by leaf. Only `header.gameStart.tuning.{popScore,slingScore,spinnerScore,dragonBankAward}` were added (12 leaves each). No leaf was removed or changed. `notes` was deliberately left alone, because the spec allows no other leaf to move.
- AC 7's real run: one in-game `s_spinner` edge, oracle 250. The first save came at tick 6954, with release at 1345 (+5609). No DRAGON-target or Top-lane edge occurred. From the Spinner tick on, the DMD row read 250, as the browser smoke expects.

**Recorded mutations (review pass, 2026-09-29).** A scratchpad script applied each one, observed red, and reverted it. Before and after each, `git status --short`, `git diff --stat` and the md5 of `src/sim/rules/scoring.ts` + `test/rules-scoring.test.ts` matched. `A` = `test/ad8-score-write-path.test.ts`.
- mutation: the `phase` conjunct removed from `scoringOpen` → S `AC 5 ... game_over, a (constructed) base-mode entry still present: pop and spinner pay nothing -- awardScore's phase gate, not the teardown` and its `attract` twin went red on **scores**. The two earlier AC 5 rows went red on letters, and the two helper tests also went red. This closes the verification-gap finding that AC 5's score half guarded only the teardown.
- mutation: the base mode's pop branch writes `score: p.score + tuning.popScore.value` directly instead of calling `awardScore` → A `AD-8 (Story 3.0a): no mode writes players[].score except through scoring.ts awardScore() > no file under src/sim/rules/modes holds a direct score write` red. The S gate rows also went red, because the direct write bypasses the gate.
- mutation: `createBaseMode` ignores its argument and uses `resolveTuning()` → S `the base mode reads the ResolvedTuning it is given, never the raw TUNING singleton > an override of all four values reaches every branch through a real createRules() run` red; nothing else went red.
- AC 9 has no `mutation:` line. It is a command gate (each command's exit code), not a behaviour a test pins.

**Measured after the review patches.**
- Suite: 131 files / 2184 tests, all passing.
- `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`: each exits 0.
- Golden JSON-parse diff: each of the five goldens still adds only the four `header.gameStart.tuning` keys (12 leaves). None is removed or changed, and LF is kept.

**Browser smoke (the lead runs it; only the ball is drawn on the playfield; read the DMD through an in-page rAF sampler cropping `#render-canvas`):**
- Start a game, then hold Enter for about 345 ms and release.
- Expected: the score row stays 0 through the launch and the Left Loop climb. The skill shot misses, because its first closure is `s_loop_l_out`.
- Then, when the Spinner completes its revolution, the row changes to a whole multiple of `spinnerScore`. The headless probe measured exactly one revolution, so expect **250**, about 4.7-5.2 s after release. A hold that differs by a frame may give 2 × 250. No earlier nonzero score should appear.
- Any later sling or pop hit raises the row by 500 or 1,000. The ball save's re-serve keeps the score.
- Nothing scores after a Tilt, and the next ball scores again.

## Auto Run Result

Status: done
Blocking condition: none

**Summary.** Pops (1,000), slings (500), Spinner revolutions (250 each) and a completed DRAGON bank (50,000) now score, through the priority-100 base mode, for the mode's own player (DW-278). A new `src/sim/rules/scoring.ts` holds three helpers:
- the one scoring gate (in a game and untilted);
- the one score-write helper for modes;
- a letter append that skips duplicates.

The skill shot, both bonus folds and the letters fold use the same gate, so nothing scores under Tilt (DW-246). Letters no longer duplicate. They carry across balls and survive a bank completion (DW-283). The four new values are `unverified` tunables, and the golden headers were re-recorded, header only.

**Files changed:**
- `src/sim/rules/scoring.ts` (new): `scoringOpen`, `awardScore`, `addDragonLetters`.
- `src/sim/rules/modes/base.ts`: `createBaseMode(tuning)`; pop and sling sets derived from `TABLE`; the four scoring branches via `awardScore`; header prose; a FR-28 War pointer for Story 3.9.
- `src/sim/rules/modes/index.ts`: passes `tuning`; fan-out and write-scope comments corrected.
- `src/sim/rules/modes/skill-shot.ts`: award and letter through `scoring.ts`, only while `scoringOpen`; the mode still closes.
- `src/sim/rules/bonus.ts`: both folds gate on `scoringOpen`; header note.
- `src/sim/rules/ball-controller.ts`: the letters fold is gated and de-duplicated; net line change 0.
- `src/sim/contracts/state.ts`: docs only (the `score` writers; `letters` order and uniqueness).
- `src/sim/table/tuning.ts`: `popScore`, `slingScore`, `spinnerScore`, `dragonBankAward`, all `unverified`.
- `test/replays/*.golden.json` (5): header only, four tuning entries each.
- `test/rules-scoring.test.ts` (new): AC 1-5, every I/O row, the three helpers and the tuning-override pin.
- `test/ad8-score-write-path.test.ts` (new, review): the AD-8 source ratchet over `src/sim/rules/modes/**`.
- `test/backglass-integration.test.ts`: AC 6 and AC 7.
- `test/tuning.test.ts`: the four keys added to `scalarKeys`; the AC 8 quote audit.
- `test/rules-modes.test.ts`: the three skill-shot miss cases now expect their own base award, read from `TUNING`.
- `test/rules-devices-headless.test.ts`: `rules-scoring.test.ts` added to `ENTRY_FILES`, as its completeness ratchet requires.

**Pre-existing assertions edited:** in `test/rules-modes.test.ts`, under `AC 3 -- skill shot missed`, the `s_sling_l`, `s_pop_2` and `no Top lane lit` (`s_pop_1`) cases now expect `TUNING.slingScore.value` or `TUNING.popScore.value` instead of 0. Letters are still `''` and modes still `['base']`. No other pre-existing assertion changed.

**Footprint extensions (none contended):** `src/sim/contracts/state.ts` (docs), `test/rules-devices-headless.test.ts` and `test/ad8-score-write-path.test.ts`, plus the spec's own `test/*.test.ts` files.

**Review findings:** four layers reported 41 findings: 0 high, 4 medium, 33 low, 4 false.
- **Patched: 12 entries (2 medium, 10 low).**
  - Medium: AC 5 now has a constructed case that pins the phase gate on base-mode awards, and the tautological `endsWith('Ms')` assertion was removed.
  - Low: the letter-order docs, the AD-8 ratchet test, the `score` doc, the tuning-override test, the AC 7 sanity message and player key, the AC 6 `currentPlayer` sanity check, the "paid once" assertion, the `base.ts` wording, the FR-28 pointer, and the `wiredSwitches` typing.
- **Deferred:** none.
- **Rejected: 20 low and 4 false,** each with its reason in the Review Triage Log. The main groups:
  - the same-tick drain (physically unreachable with one ball);
  - Hot-seat payee splits (unreachable in play);
  - helper and harness duplication (refactors);
  - AC 7's surface and coverage bounds, which the intent fixes;
  - spec-only edits.

**Follow-up review recommendation: false.** This pass patched 2 medium entries and 0 high. Both are test-adequacy fixes: AC 5's gate pin and a removed tautology. Each new pin had its mutation applied and observed red, so no unverified risk remains to name.

**Deviations from the spec's predicted mutations** (recorded under ## Verification):
- Clearing letters on `bank_completed` cannot turn "Across balls" red, because that row completes no bank. The added test "a completed bank keeps its letters into the next ball" pins it.
- Paying `currentPlayer` cannot turn the plain Hot-seat row or AC 6 red, because the two players agree in play. A constructed-divergence test pins it.

**Verification performed:**
- `pnpm test`: 131 files / 2184 tests, all passing (baseline 129 / 2128).
- `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist`, `check:size`: each exits 0.
- JSON-parse golden diff: only the four header tuning keys were added. No hash, transition, trajectory or checkpoint moved.
- Matrix Test Audit: every I/O row has a named, passing test in `test/rules-scoring.test.ts`, and none is skipped.
- Every mutation in ## Verification was applied, observed red and reverted, with the tree byte-identical afterwards.
- No added line contains a non-ASCII byte.

**Residual risks:**
- The browser smoke (the lead's gate) has not run yet. Expect 250 on the first Spinner revolution, about 4.7-5.2 s after a 345 ms hold.
- AC 7 depends on `public/assets/dragonwar.collision.json`, which Epic 5 may change. If the plunge path moves, AC 7 fails loudly.
- A scoring closure on the same tick as a single-ball drain would get its letter but no award. This is physically unreachable today. Revisit it if a later story changes when the drain tears down the modes.
