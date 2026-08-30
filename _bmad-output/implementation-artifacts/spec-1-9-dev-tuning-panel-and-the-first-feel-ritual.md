---
title: 'Story 1.9: Dev tuning panel and the first feel ritual'
type: 'feature'
created: '2026-08-29'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-replays-golden-state-hashes-and-ci-parity.md'
warnings: ['oversized']
deferred:
  - id: 'ac5-reference-machine-leg-is-author-owned'
    finding: >-
      AC 5 runs the first feel ritual "against the Reference machine (Stern Dungeons &
      Dragons)". No agent can play a physical pinball machine. This story delivers the
      whole machinable half -- docs/feel-test.md, its three defined items (cradling,
      flipper snap, rejection/rebound), the dated-entry format, the link-to-golden
      mechanism, the measured build-side numbers per item, and the both-paths
      (?renderer=webgl2 and default) run of the BUILD side. The comparative verdict per
      item -- "no material difference" / a tuning change / an accepted difference -- is
      the author's, because only the author can play the reference machine.
      Settled precedent, not an intent gap: Story 1.8's
      ac5_safari_leg_is_author_owned_macos_precedent_spike_1, and DW-2's author-owned
      TICK_HZ ratification from Spike 1.
    observable: >-
      Done when docs/feel-test.md's three first dated entries each carry a verdict token
      (no-material-difference | tuning-change | accepted-difference) attributed to the
      author with an ISO date, and test/feel-test-docs.test.ts's verdict-token assertion
      passes without its pending-author allowance. Until then each entry reads
      "pending-author" and the docs test asserts exactly that.
    human: 'play the Stern Dungeons & Dragons reference machine and record the three comparative verdicts'
    footprint: 'in-story'
    severity: 'med'
---

<intent-contract>

## Intent

**Problem:** Every table tunable is deep-frozen and captured at construction, so there is no way to change a number and feel the result — `src/host/dev` holds one file (`replay-recorder.ts`), there is no panel, no export, no hop control, no live pitch, and `createHostLoop` cannot rebuild its sim. The feel ritual that is supposed to run "starting now and never stopping" has no document, and Story 1.8's record half has no play half (`DW-86`).

**Approach:** Add one rebuild seam and hang everything on it. `CreateLoopOptions` gains an optional `tuning`; `createHostLoop` gains `reset({ tuning })` that constructs a fresh `createLoop()` and rebases the tick origin. That single seam is the hot-apply (AC 1), the pitch-on-next-serve (AC 4), the elasticity-falloff live change (AC 3), the hop-control A/B (AC 2), and the fresh-loop start that finally lets a recording reproduce its own hash (`DW-86`). Then author `docs/feel-test.md` and its three items.

## Boundaries & Constraints

**Always:**
- **Rebuild, never mutate live physics.** `src/sim/physics/cabinet/plumb-bob.ts:55-58` already states this as the design: upstream's runtime setters were deliberately not ported because "Story 1.9's tuning panel **rebuilds the machine** rather than mutating live physics." `createMachine(collisionDoc, tuning)` (`src/sim/physics/machine.ts:115`) already takes a `ResolvedTuning`; `createLoop` (`src/sim/loop/index.ts:191-193`) just ignores the injectable parameter `resolveTuning()` already exposes (`src/sim/table/tuning.ts:428`). Wire those two together; do not add setters to frozen objects.
- **No ported file body may change.** `DW-79`'s SHA-256 port-body freeze (`test/sim-boundary.test.ts:325-370`) covers `ball/ball-hit.ts`, `flipper/flipper-hit.ts`, `flipper/flipper-mover.ts`, `functions.ts`, `hit-object.ts` and 36 others. Hop control is authored **beside** the port (`src/sim/physics/flippers.ts` and `flipper/flipper-config.ts` are authored, `test/sim-boundary.test.ts:89-90`), never inside it.
- **Every tunable this story adds carries `source` and `confidence`** via `entry<T>()` (`src/sim/table/tuning.ts:36`), and no key may end in `Ms` unless it is a top-level duration converted once by `resolveTuning()`.
- **Nothing under `src/host/` may import `sim/physics` or `sim/rules`** (AD-16, line 208). The panel and the play seam import `sim/table`, `sim/contracts` and `sim/loop` only — `runReplay`/`stateHash` live in `src/sim/loop/replay.ts`, which is a legal import for the host layer.
- **The panel adds no inline `<script>`/`<style>` and no network origin.** `pnpm check:dist` greps the pinned CSP and rejects inline content; build DOM with `document.createElement` and bundle styles through the existing Vite pipeline.
- **The panel is off on the default path.** It mounts only behind an explicit opt-in, so AC 5's default-renderer ritual run is not measuring a page with a panel on it.
- **Any tuning change re-stamps all five goldens.** `assertHeaderMatchesLiveEnvironment` (`src/sim/loop/replay.ts:236-247`) compares `header.gameStart.tuning` against live `resolveTuning()` and throws `StaleReplayHeaderError` on **any** drift — adding `hopControl` alone trips all five. Re-stamp them deliberately and record which expected hashes changed and which did not.

**Block If:**
- A flipper tunable would have to change **purely** to make `DW-80`'s "the tap rises only partially" criterion pass. That narrows a shipped AC of a `done` story (Rule 5 ask-first tier). Record the measurement and HALT — do not re-tune to fit.
- Hop control cannot be given a deterministic mechanism that is exactly zero at `hopControl = 0` without editing a `DW-79`-frozen file. Do not edit the port; HALT with the file and the reason.
- The rebuild seam turns out to require restructuring `createHostLoop`'s rAF/accumulator contract rather than an addition alongside it (see Design Notes — the investigation says it does not).

**Never:**
- Never make `pnpm check:ad7` pass. It is a deliverable red (`DW-70`/AD-7/`bd_trough`). It lives one line from this story's work: `src/sim/loop/index.ts:326-329` is the overwrite it pins, and `createLoop` is being edited here. Leave those four lines exactly as they are.
- Never fix or lean on the roll-and-drain golden (`DW-85`: its terminal state equals its start state, routed to Story 2.5). Re-stamp it; do not use it as a pin for anything this story changes.
- Never widen Story 1.6's 1 s ball-on-bat bound, re-place its ball, or touch the `FlipperMover`/`FlipperHit` port (`DW-72`, owned by Story 2.1).
- Never add randomness. `scatter` stays 0 on every material; no PRNG is drawn in physics; `tools/boundary-lint.mjs:72`'s `Math.random` ban stays green.
- No new npm package (`tools/check-attributions.mjs` fails CI and `pnpm test` for any package with no `ATTRIBUTIONS.md` row; that file is out of footprint).
- Do not close Story 1.8's deferred `AD-14-gap` (`GameStart` into `createLoop`). AC 4 says "the pitch **tunable**" — take pitch from resolved tuning, not from `GameStart.adjustments`.
- Do not build a dev-server file writer or touch `vite.config.ts` (out of footprint).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Panel enumerates tunables | `TUNING` as shipped | One row per leaf `TuningEntry`, each showing value, `source`, `confidence`; nested groups (`materials`, `flipper`, `cabinet`, `tiltBob`, `switchSettleMsByClass`) walked recursively | `plungerSpeedByHoldMs` is a function, not an entry — excluded, asserted |
| Hot-apply a tunable | Panel edits `materials.flipper_rubber.elasticityFalloff`, live loop running | `hostLoop.reset({ tuning: override })` builds a fresh sim; next frame's snapshot reflects the new value | Non-finite / non-numeric edit is rejected at the input, sim untouched |
| Hot-apply during a recording | `replayRecorder.isRecording === true`, panel edits any tunable | `invalidate(reason)` is called before the rebuild; a later `save()` returns `{ ok: false, reason }` | First reason wins (`replay-recorder.ts:110`), idempotent |
| Export | Panel Export with no edits | Emitted text is byte-identical to `src/sim/table/tuning.ts` (LF-normalised) | — |
| Export with edits | One value changed | Emitted text differs from disk **only** at that value's line; group order, JSDoc blocks, tabs, quote style and `satisfies` clauses preserved | — |
| Hop control at 0 | `hopControl = 0`, stress replay of hard flipper hits | No ball's z exceeds the playfield surface (+ contact epsilon) on any tick | — |
| Hop control at default | default `hopControl`, identical stress input | Max ball z strictly exceeds the `hopControl = 0` run's max by a named margin; nothing passes the glass | Ball above glass ⇒ fail loudly, not clamp silently |
| Elasticity falloff sweep | Three impact speeds, `flipper_rubber.elasticityFalloff` at default | Rebound-to-impact ratio strictly decreases as impact speed rises | Control run at falloff 0 must give a flat ratio, else the test is not measuring falloff |
| Pitch in range | `defaultPitchDeg` set to 8.5, rebuild | `snapshot.effectivePitchDeg === 8.5`; gravity follows; `applyPitch` rotates `playfield_root` about `pivot_pitch` to the new angle | — |
| Pitch out of range | `defaultPitchDeg` set to 5.0 or 9.9 | Clamped to `[pitchMinDeg, pitchMaxDeg]` = `[6.0, 8.5]`; the panel shows the clamp | Never silently accepted out of band |
| Record then replay | Recorder started on a freshly reset loop, transitions + coil pulses captured, saved | `runReplay()` on the saved recording reproduces the live loop's `stateHash` at the same tick | Recorder `start()` on a loop whose tick is non-zero throws a named error, not a silently unreproducible recording |
| Replay a stale recording | Saved recording, then a tunable changed | `StaleReplayHeaderError`, named, before any hashing | Panel surfaces the message; does not retry |

</intent-contract>

## Code Map

**The rebuild seam (the story's spine — everything else hangs off it)**

- `src/sim/loop/index.ts:186-193` -- `CreateLoopOptions` is `{ collisionDoc }` only; `createLoop` calls `resolveTuning()` with no override at `:192`, then `createMachine(options.collisionDoc, tuning)`. Add optional `tuning?: ResolvedTuning`. **`:326-329` is `DW-70`'s live AD-7 overwrite — read-only, do not touch.**
- `src/sim/table/tuning.ts:428` -- `resolveTuning(tuning = TUNING, tickHz = TICK_HZ)` already accepts an injected tuning; nothing calls it that way. `msToTicks()` at `:365`; deep-freeze of the result at `:476-480`.
- `src/sim/physics/machine.ts:115` -- `createMachine(collisionDoc, tuning: ResolvedTuning)` already takes tuning. **`:119` `const effectivePitchDeg = TABLE.reference.pitchDeg;` is AC 4's wiring point** (its own doc at `:76` already says "Story 1.9's tuning panel are its readers"). `:120` `physics.setGravity(effectivePitchDeg, …)`. `:238` publishes it.
- `src/host/loop.ts:56-60` -- `createHostLoop(collisionDoc, onFrame, onAdvance?)`. `:61` `const loop = createLoop({ collisionDoc })` (construct-once; make it `let` + a rebuild closure). `:80-81` `originMs`/`originTick`; `:83-87` `tickAt()`; `:91-129` the rAF body; `:102-103` origin advance from `output.snapshot.tick`; `:132-152` `start`/`stop`; `:153-155` `pulseCoil`. **No reset seam exists today — this story adds one.**
- `src/presentation/scene/create-engine.ts:147-151` -- `createEngine()` throws if called twice (AD-12). **Read-only evidence: the reset seam rebuilds the SIM only, never the engine.**
- `src/presentation/scene/balls.ts:64-86` -- `syncBalls` disposes meshes for ids absent from the snapshot, so a reset to zero balls needs no presentation change.

**Tunables**

- `src/sim/table/tuning.ts` -- `Confidence` `:27`, `TuningEntry<T>` `:30-34`, `entry()` `:36`, `TUNING` `:79-331` (50 leaf entries), `ResolvedTuning` `:345-348`. Header block `:11-21` records the deliberate **absence** of `hopControl` with its spec citation — rewrite it when the tunable lands. Pitch trio: `defaultPitchDeg` 6.5 `:184`, `pitchMinDeg` 6.0 `:185`, `pitchMaxDeg` 8.5 `:186` — **all three dead today, no `src/` consumer.** `materials.flipper_rubber.elasticityFalloff` 0.15 `:94-98` ("the primary feel knob"); `materials.default.elasticityFalloff` 0 `:88`. `plungerSpeedByHoldMs` `:499-518` is a function, not an entry (`:483-497` calls its four scalars "the tunables a dev panel edits").
- `src/sim/physics/functions.ts:37-43` -- `elasticityWithFalloff()`, the AC 3 mechanism. **Frozen (`DW-79`) — read-only.** Consumed at `ball/ball-hit.ts:365` and `flipper/flipper-hit.ts:314`, both frozen.
- `src/sim/physics/flippers.ts:113-165` -- `createFlipperMechanics`, `applyFrame(tick, frame, coilEnabled) -> { contactEvents }` (`:131-160`; only `flipper_eos` today, no ball-bat contact speed). **Authored, editable** (`test/sim-boundary.test.ts:89-90`) — the sanctioned home for hop control beside the port. `:101-104` applies `TUNING.materials.flipper_rubber` to the bat.
- `test/hardware-rule-seam.test.ts:46` -- `NOT_A_HARDWARE_RULE = new Set(['switchTracker'])`. A new `const hopMechanics = createHop(…)` inside `createMachine` forces an explicit entry here. It is **not** a hardware rule (it is a collision-response modifier, not a switch→coil path) — add it to the allowlist, do not add a `PRE_STEP_HARDWARE_RULES` row.
- `test/tuning.test.ts:26-52` key lists, `:104` deep-freeze, **`:111` pins the ABSENCE of `hopControl`** (must become a presence pin), `:302-372` the flipper group.

**Replay record / play (`DW-86`)**

- `src/host/dev/replay-recorder.ts` -- `createReplayRecorder()` `:85` takes no arguments; `start()` `:91-96` builds the header and **captures no start tick**; `recordTransitions` `:98-103`; `invalidate` `:105-113` (first reason wins `:110`); `save()` `:115-124` copies transitions **unrebased**. `:11-13` names the hot-apply as Story 1.9's; `:20-22` names saving as Story 1.9's UI. **No playback entry point; nothing under `src/host/` calls `runReplay()`.**
- `src/sim/loop/replay.ts:301` -- `runReplay(options)`; `RunReplayOptions` `:256-268` (`replay`, `collisionDoc`, `durationTicks`, `coilPrologue?`, `checkpointTicks?`, `onTick?`); `:348` **always** builds a fresh `createLoop()` and runs `for (tick = 1; tick <= durationTicks; tick++)` `:365`; no start-tick offset. `buildHeader` `:193-202`; `stateHash` `:109`; `gameStateHash` `:127`; `CoilPrologueEntry` `:251-254`. **`assertHeaderMatchesLiveEnvironment` `:213-249` — `:236-247` compares `header.gameStart.tuning` to live `resolveTuning()`; this is why every tuning change re-stamps every golden.**
- `src/host/boot.ts:36-81` -- the `window.__dragonwarBoot` dev hatch declaration; assigned `:197-234` after a successful boot; `pulseCoil` `:201`, `setCoilEnabled` `:202`, the narrowed `replayRecorder` facade `:203-233`. `:205-207` says verbatim "Story 1.9's tuning panel is the first real caller with player-chosen adjustments"; `:218-223` is the hardcoded dev `GameStart` the panel replaces. `:173-175` wires `recordTransitions` as `createHostLoop`'s third arg. `:194` calls `applyPitch(nodes, latestSnapshot.effectivePitchDeg)` per frame — AC 4's presentation half already transports correctly.
- `test/host-loop.test.ts:29-124` -- **an existing manual rAF queue + `addEventListener`/`removeEventListener` stubs.** Reuse this harness: the record→replay round trip can be driven through the real `createHostLoop` in Node, deterministically. This is the real-runtime evidence for the host tier (Rule 3).
- `test/replay-goldens.test.ts` -- `GoldenFile` `:65-75` (9 keys incl. `coilPrologue`, `durationTicks`, `expectedHash`, `expectedGameStateHash`, `notes`), `GOLDEN_NAMES` `:77`, `loadGolden` `:79`, `toReplay` `:84`, coverage guard `:107`, hash match `:119`, `PARITY_INERT` allowlist `:191` + its falsifiability check `:200-236`, `DW-70` provenance-note guard `:140`. Five goldens under `test/replays/*.golden.json`. **There is no committed script that writes a golden** — they were hand-committed.

**Docs / verification surface**

- `docs/spikes/spike-3.md` -- the format `docs/feel-test.md` must match: H1 with ` — `, provenance paragraph, `## Verdict: **PASS**`, summary pipe table, ISO `YYYY-MM-DD` dated headings appended chronologically and never rewritten, environment table naming machine/OS/browser verbatim.
- `test/spike-1-docs.test.ts:52-57` -- the docs-as-tests precedent: whitespace-normalise, assert content not heading position, and cross-check named ledger entries actually exist in `deferred-work.md`.
- `test/ad7-device-slots.test.ts:29-73` + `test/fixtures/dw70-ad7/ad7-device-slots.harness.ts` -- the deliberate red. Wrapper pins `DW-70`, `AD-7`, `bd_trough`, `[true,true,true,true]`, `[true,true,true,false]`. **Read-only.**
- `package.json:11-24` -- `typecheck`, `test`, `build`, `lint:boundaries`, `check:headers`, `check:attributions`, `check:dist` (CSP grep, `tools/check-dist.mjs:35,87`), `check:size`, `check:ad7`.

## Tasks & Acceptance

**Execution:**

*Phase 1 — the rebuild seam (do this first; every later phase depends on it)*
- `src/sim/loop/index.ts` -- add optional `tuning?: ResolvedTuning` to `CreateLoopOptions` and pass it to `resolveTuning`/`createMachine`; default behaviour byte-identical when absent -- one seam serves hot-apply, pitch, falloff and the hop A/B. Do not touch `:326-329`.
- `src/host/loop.ts` -- rebind `loop` as `let`, add `reset(options?: { tuning?: ResolvedTuning }): void` that stops the rAF, constructs a fresh `createLoop({ collisionDoc, tuning })`, resets `originTick = 0` / `originMs = performance.now()` / `lastFrameMs = null`, and restarts if it was running; `pulseCoil`/`setCoilEnabled` delegate through the current binding -- this is the loop-reset seam `DW-86` names as missing.
- `test/host-loop.test.ts` -- extend with reset coverage using the file's existing manual rAF harness -- proves the seam without a browser.

*Phase 2 — pitch (AC 4), the smallest real consumer of the seam*
- `src/sim/physics/machine.ts` -- derive `effectivePitchDeg` at `:119` from the resolved tuning's `defaultPitchDeg`, clamped to `[pitchMinDeg, pitchMaxDeg]`, instead of `TABLE.reference.pitchDeg` -- makes three dead tunables live and keeps the shipped value at 6.5 so trajectories do not move.
- `test/pitch-tunable.test.ts` -- new: gravity + snapshot + clamp + the `applyPitch` rotation delta -- AC 4's two halves.

*Phase 3 — hop control (AC 2)*
- `src/sim/table/tuning.ts` -- add `hopControl` with `source`/`confidence` and rewrite the `:11-21` absence block to record the mechanism chosen and why -- AD-15 lists hop control as a table tunable.
- `src/sim/physics/flippers.ts` (or a new authored `src/sim/physics/hop.ts` it calls) -- a deterministic hard-hit hop that is exactly 0 when `hopControl` is 0 -- authored beside the port; **no `DW-79`-frozen file may change**.
- `test/hardware-rule-seam.test.ts` -- if a `create*` const is added inside `createMachine`, add it to `NOT_A_HARDWARE_RULE` with a one-line reason -- the manifest's designed forcing function; not a `PRE_STEP_HARDWARE_RULES` row.
- `test/hop-control.test.ts` -- new: the paired 0-vs-default stress replay -- AC 2, falsifiable by divergence rather than by an absolute nobody can fail.
- `test/tuning.test.ts` -- flip the `:111` absence pin to a presence pin and extend the key lists -- the pin is doing its job; update it deliberately.

*Phase 4 — elasticity falloff (AC 3)*
- `test/elasticity-falloff.test.ts` -- new: three impact speeds through the real loop plus a falloff-0 control -- AC 3; the control is what makes "decreases with speed" falsifiable.

*Phase 5 — the panel (AC 1)*
- `src/host/dev/tuning-source.ts` -- new: pure `serialiseTuning(overrides)` emitting the complete `src/sim/table/tuning.ts` text in the file's own format -- pinned by a byte-identity test, which is the only honest way to assert "in the file's own format".
- `src/host/dev/tuning-panel.ts` -- new: recursive enumeration of `TUNING` into rows (value, `source`, `confidence`), edit → `invalidate()` if recording → `hostLoop.reset({ tuning })`, Export → the serialiser's text in a readonly textarea; no inline script/style, no network -- AD-15's panel, under AD-17's CSP.
- `src/host/boot.ts` -- mount the panel behind an explicit opt-in and expose it on `window.__dragonwarBoot`; replace the hardcoded dev `GameStart` at `:218-223` with the panel's current set -- `:205-207` already names this story as the first real caller.
- `test/tuning-source.test.ts`, `test/tuning-panel.test.ts` -- new -- AC 1's three clauses.

*Phase 6 — `DW-86`, the play half*
- `src/host/dev/replay-recorder.ts` -- capture the start tick, rebase saved transitions to tick 1, record coil pulses into a `coilPrologue`, emit `durationTicks`, and throw a named error if `start()` is called on a loop whose tick is non-zero -- rebasing alone is insufficient; the initial state must also be fresh, which is why the guard exists.
- `src/host/dev/replay-player.ts` -- new: play a saved recording through the live host loop (reset → apply the prologue → feed the rebased transitions) and verify it against `runReplay()`'s hash -- the play seam `host/**` may legally hold, since `runReplay` lives in `sim/loop`.
- `test/replay-round-trip.test.ts` -- new: record through the real `createHostLoop`, save, replay, assert identical `stateHash` -- the claim `DW-86` says is provably false today.

*Phase 7 — goldens, `DW-80`, docs*
- `test/replays/*.golden.json` (all five) -- re-stamp `header.gameStart.tuning` from the live `resolveTuning()` and re-derive `expectedHash`/`expectedGameStateHash`; record per golden whether the hash changed and the measured reason -- forced by `replay.ts:236-247`; an unchanged hash is itself evidence the new tunable is a no-op at its default.
- `test/flipper-tap-bound.test.ts` (or the existing Story 1.6 tap test) -- re-measure the 30 ms tap's true peak against the 90° stop on this story's final tuning and assert the margin against an explicitly named number -- `DW-80`; record the measured value in `## Verification`.
- `docs/feel-test.md` -- new: the three items, the dated-entry format, the golden link, the build-side measurement per item, both renderer paths -- AC 5's machinable half.
- `test/feel-test-docs.test.ts` -- new, following `test/spike-1-docs.test.ts` -- including an `fs.existsSync` check on the linked golden so a dead link is red.

**Acceptance Criteria:**

- Given a running host loop, when a tunable is edited in the panel, then `hostLoop.reset({ tuning })` rebuilds the sim and the next frame's snapshot reflects the new value — and if a recording is in progress, `invalidate()` runs first and a later `save()` returns `{ ok: false }`. *(Integration AC, Rule 1: the panel is the first real consumer of Story 1.8's `replayRecorder.invalidate()` seam, exercised against a real recorder, not a mock.)*
- Given the panel is open, when it enumerates `TUNING`, then every leaf `TuningEntry` appears exactly once with its value, `source` and `confidence`, and `plungerSpeedByHoldMs` does not appear.
- Given no edits, when Export runs, then the emitted text is byte-identical to `src/sim/table/tuning.ts` (LF-normalised).
- Given exactly one edited value, when Export runs, then the emitted text differs from the file on disk only at that value's line — group order, JSDoc blocks, tab indentation, quote style and `satisfies` clauses all preserved.
- Given a recording started on a freshly reset loop, when it is saved and replayed, then `runReplay()` reproduces the live loop's `stateHash` at the same tick. *(Closes `DW-86`.)*
- Given `hopControl = 0`, when the stress replay of hard flipper hits runs, then no ball leaves the playfield surface on any tick.
- Given the default `hopControl` and the identical stress input, when the same replay runs, then the maximum ball height strictly exceeds the zero run's by a named margin, and `scatter` is still 0 on every material with no PRNG drawn in physics.
- Given three impact speeds, when rebounds are driven, then the rebound-to-impact ratio strictly decreases with speed, and a falloff-0 control over the same speeds gives a flat ratio.
- Given `defaultPitchDeg` set within 6.0–8.5°, when the sim rebuilds, then gravity and `snapshot.effectivePitchDeg` both follow and `applyPitch` rotates `playfield_root` to the new angle; outside that band the value is clamped.
- Given the 30 ms flipper tap, when it is re-measured on this story's final tuning, then the measured peak and its margin against the 90° stop are recorded with a named number and a test that fails if the margin is crossed. *(Closes `DW-80`.)*
- Given `docs/feel-test.md`, when the ritual's build side is run on `?renderer=webgl2` and on the default path, then the document defines cradling, flipper snap and rejection/rebound, carries one ISO-dated entry per item with its measured build-side numbers and a link to a real golden file, and names both renderer paths. *(The comparative verdict against the reference machine is the author's leg — frontmatter `deferred:`.)*
- Given every change in this story is applied, when `pnpm check:ad7` runs, then it still exits 1 and its output still contains `DW-70`, `AD-7`, `bd_trough`, `[true,true,true,true]` and `[true,true,true,false]` — the deliberate red survives the edit to `src/sim/loop/index.ts`.

## Spec Change Log

## Review Triage Log

## Design Notes

### One seam, five consumers — why this story is smaller than it looks

Every AC here needs the same thing: *change a number, see the sim behave differently.* The codebase already decided how that must work. `src/sim/physics/cabinet/plumb-bob.ts:55-58` says it in prose — upstream's runtime `SetPlumbDamping()`/`SetPlumbTiltThreshold()` were **deliberately not ported** because "Story 1.9's tuning panel **rebuilds the machine** rather than mutating live physics." `flipper-mover.ts:36-48` says the same about `setMass`/`setStartAngle`. And the plumbing is already 90 % there: `createMachine(collisionDoc, tuning)` takes a `ResolvedTuning` (`machine.ts:115`), and `resolveTuning(tuning = TUNING, …)` takes an injectable tuning (`tuning.ts:428`). The only missing link is that `createLoop` calls `resolveTuning()` bare (`src/sim/loop/index.ts:192`) and `createHostLoop` binds `loop` as a `const` (`src/host/loop.ts:61`).

So Phase 1 is two small edits, and then AC 1's hot-apply, AC 3's "felt live", AC 4's "on the next serve", AC 2's 0-vs-default A/B, and `DW-86`'s fresh-loop start are all the *same* call.

### `DW-86` — the loop reset is an ADDITION, not a redesign (the dispatch asked for this explicitly)

**It is an addition.** `createHostLoop` keeps its signature, its rAF body (`:91-129`), its accumulator maths (`:80-87`, `:102-103`), its keyboard wiring (`:89`) and its `start`/`stop` semantics. What changes: `loop` becomes `let`, and one new method rebuilds it and resets `originTick`/`originMs`/`lastFrameMs`. Nothing about the loop contract (AD-4) moves. Three things confirm the blast radius is contained:

1. **The renderer is not involved.** `createEngine()` throws if called twice (`create-engine.ts:147-151`, AD-12), but this seam rebuilds the *sim*, never the engine.
2. **Presentation already handles a ball-set reset.** `syncBalls` (`balls.ts:82-86`) disposes meshes for ids absent from the snapshot, so a reset to zero balls needs no presentation change.
3. **`sim/loop`'s own contract is unchanged.** `Loop` stays `{ advance, pulseCoil, setCoilEnabled }`; `createLoop` gains one optional field. Nobody gets a `reset()` inside `sim/`.

**Rebasing alone would be a false fix — say so plainly.** The ledger's evidence is that a mid-session recording carries absolute ticks while `runReplay()` drives a fresh loop from tick 1. Rebasing the ticks fixes the *alignment* but not the *initial state*: the machine at the moment recording began has balls in play, device slots set and a cabinet oscillator mid-decay, none of which a fresh `createLoop()` reproduces. So the recorder does **both**: `start()` throws a named error unless the loop's tick is zero (the panel's Record resets first), and `save()` rebases to tick 1 and emits `durationTicks`. The recording also carries a `coilPrologue`, for exactly the reason Story 1.8 amended AC 4 — nothing in an `InputTransition[]` body can put a ball in play, because `RulesStepResult.commands` is typed `readonly never[]`. A saved recording is therefore the same nine-field shape as `GoldenFile` (`test/replay-goldens.test.ts:65-75`), which makes it directly promotable to a golden — the mechanism AC 5's "links the golden replay that captures any change" needs.

### Every tuning change re-stamps every golden — this is forced, not optional

`assertHeaderMatchesLiveEnvironment` (`src/sim/loop/replay.ts:236-247`) canonicalises `header.gameStart.tuning` and compares it to live `resolveTuning()`. **Adding `hopControl` alone makes all five goldens throw `StaleReplayHeaderError`** — the error's own message says "Re-record it deliberately; do not investigate the hash." AD-15 and the epic context agree ("any change to the tick rate or to a solver constant re-records every golden").

The useful consequence: `GameState` does not contain tuning, and the hashes cover `GameState` + ball positions. So a tunable whose default is a physics no-op re-stamps the header and leaves `expectedHash` **unchanged** — and an unchanged hash is then positive evidence that the default really is a no-op. Record per golden which of the two happened and why. Pitch is expected to be in the first class: `TUNING.defaultPitchDeg` is 6.5 and `TABLE.reference.pitchDeg` is 6.5, so AC 4 changes the *source* of the number without changing the number.

`DW-85` (roll-and-drain is silently insensitive — terminal state equals start state) is routed to Story 2.5. Re-stamp that golden like the others; do not use it as a pin for anything this story changes, and do not fix it.

### Hop control: authored beside the port, never inside it

The spine's Deferred section lists the hop *mechanism* as undecided ("vpx-js has no such knob"), and `tuning.ts:11-21` records its deliberate absence. AD-15 (line 202) nevertheless lists "hop control" among the table tunables, so authoring the tunable is sanctioned; this story picks the mechanism. Three constraints decide it almost completely:

1. **`DW-79`'s port-body freeze** (`test/sim-boundary.test.ts:325-370`) covers `ball/ball-hit.ts`, `flipper/flipper-hit.ts`, `flipper/flipper-mover.ts`, `functions.ts` and `hit-object.ts`. The obvious place to put a hop — inside `collide3DWall` or `elasticityWithFalloff` — is exactly the place that is frozen.
2. **AD-3 / AC 2 forbid randomness.** Deterministic, and `physics-tuning.md:31` is explicit: hops are "authored, not emergent; must not be implemented as scatter or randomness."
3. **It must be inside physics**, so it is inside the replay and hashed.

That leaves the authored seam: `src/sim/physics/flippers.ts` (which already holds the movers, the bat's material and the per-tick `applyFrame`) or a new authored module it calls, deriving a hard-hit from the ball's own post-step velocity change while a flipper coil is energised, and scaling a z-component by `hopControl × (speed − threshold)` clamped at zero. Exact form is the implementer's; the boundaries above and AC 2's paired observable are the contract. If a `const hopMechanics = create…()` lands inside `createMachine`, `test/hardware-rule-seam.test.ts:110-125` will demand a decision — put it on `NOT_A_HARDWARE_RULE` (it is a collision-response modifier, not a switch→coil path), do not give it a `PRE_STEP_HARDWARE_RULES` row.

### `DW-80`: re-measure, do not re-tune

Measured during Story 1.6's review through the real `createLoop()`: a 30 ms tap releases at 104.4°, coasts to a true peak of **90.0416°**, against an end-of-stroke stop at **90°** — epics.md's "the tap rises only partially" is met by 0.04°. This story ships tuning changes, so that margin is live. Re-measure it on the final tuning and pin the number explicitly. **If the margin has gone to zero or negative, that is not a bug to tune away** — it means a 30 ms tap completes the stroke on this tuning and a `done` story's AC is factually wrong. Record the measurement and take the Block If; narrowing a shipped AC is Rule 5's ask-first tier.

### AC 5: what this story delivers and what is the author's

The AC runs the ritual "against the Reference machine (Stern *Dungeons & Dragons*)". No agent can play a physical machine. **Settled precedent in this epic, twice** — Story 1.8's `ac5_safari_leg_is_author_owned_macos_precedent_spike_1` and `DW-2`'s author-owned TICK_HZ ratification from Spike 1 — so this is not an intent gap and not a HALT.

**Delivered here (machinable, all of it):** `docs/feel-test.md` in the `docs/spikes/spike-3.md` house format; the three items defined (cradling, flipper snap, rejection/rebound); the dated-entry format with the three verdict tokens; the link-to-golden mechanism, demonstrated against a real golden file and checked by `fs.existsSync`; the **measured build-side number** for each item (what the build actually does — e.g. the flipper-snap tap peak from `DW-80`, the rebound ratios from AC 3, the ball-on-bat departure window from `DW-72`); and the both-paths (`?renderer=webgl2` and default) run of the *build* side, which is the lead's per-story smoke.

**The author's leg:** playing the reference machine and turning each item into one of the three verdicts. **What marks it done:** each of the three first entries carries a verdict token plus an ISO date, and `test/feel-test-docs.test.ts`'s verdict assertion passes without its `pending-author` allowance. Until then each entry reads `pending-author` and the docs test asserts exactly that — so the gap is visible in CI, not silent. Filed in frontmatter `deferred:` for the lead to harvest with `note=human=`.

### Export: what "exports to `src/sim/table/tuning.ts`" means here, and why

A browser page in this project cannot write a repository file. AD-17 (line 214) pins the CSP to `default-src 'self'; connect-src 'self' blob:; img-src 'self' blob:` with "no network after load", and AD-14 (line 196) makes host persistence a single `localStorage` key. The architecture selects the reading, so this is a settled reading rather than a coin-flip between two defensible ones: **Export produces the complete, correctly formatted `tuning.ts` text**, and the author moves it into the file in one paste.

What makes that honest rather than hand-wavy is where the guarantee sits: `serialiseTuning({})` must be **byte-identical to the file on disk**, LF-normalised. That single test enforces every convention `tuning.ts` actually has — tabs, single quotes except where the source string contains an apostrophe, authorship-chronological group order, the JSDoc block per group, one-line vs multi-line `entry()` layout, and the `} satisfies …,` closers — without anyone having to enumerate them. Rejected alternatives, recorded so they are not revisited: a Vite dev-server write plugin (`vite.config.ts` is out of footprint, and it would only work under `pnpm dev`, which is not the measured artifact), and a `<a download>` blob (the CSP grants `blob:` on `connect-src`/`img-src` only, and download behaviour under the pinned policy is unproven in a real browser).

### Pitch has three sources today — which one wins

`TUNING.defaultPitchDeg` (6.5), `TABLE.reference.pitchDeg` (6.5) and `GameStart.adjustments.pitchDeg` all exist, and physics currently uses the middle one (`machine.ts:119`). AD-10 (line 172) makes `TABLE.reference` the **reference dimensions the loader asserts against**, not the runtime pitch. AD-14 (line 196) makes pitch a sim adjustment that layers *table defaults → preset → player overrides* and applies at the next game. AC 4 says "the pitch **tunable**". So: physics reads the resolved tuning's `defaultPitchDeg`, clamped to `[pitchMinDeg, pitchMaxDeg]`; `TABLE.reference.pitchDeg` stays the loader's reference; the `GameStart.adjustments` layer stays Story 1.8's deferred `AD-14-gap` and is **not** opened here. Presentation needs no change — `boot.ts:194` already feeds `snapshot.effectivePitchDeg` into `applyPitch`.

### The deliberate red must stay red

`pnpm check:ad7` exits 1 by design with a real `bd_trough` slot-array assertion naming `DW-70`/`AD-7`; `test/ad7-device-slots.test.ts:29-73` keeps `pnpm test` green by asserting the *content* of that failure, including both `[true,true,true,true]` and `[true,true,true,false]`. **This story edits `src/sim/loop/index.ts`** — and the violation it pins is at `src/sim/loop/index.ts:326-329`, the overwrite of `GameState.machine.deviceSlots` outside `rules.step`. Adding `tuning` to `CreateLoopOptions` must not touch, tidy, move or "clean up" those four lines. Re-run `pnpm check:ad7` after Phase 1 and confirm it still exits 1 with both arrays; a green `check:ad7` is a regression in this story, not a win.

### Integration ACs, Consumed-by and Consumes (Rules 1 and 2)

This story introduces four shared units. None is consumerless.

- `src/host/loop.ts`'s `reset()` seam — **Consumed-by:** the tuning panel's hot-apply (this story), `src/host/dev/replay-player.ts` (this story), `test/host-loop.test.ts` and `test/replay-round-trip.test.ts` (this story, real instances); **Story 2.5** (the real ball lifecycle re-serves through it); **Epic 6** (playtest replay). **Consumes:** `src/sim/loop/index.ts`, `src/sim/table/tuning.ts`.
- `src/host/dev/tuning-panel.ts` + `tuning-source.ts` — **Consumed-by:** `src/host/boot.ts`'s dev hatch (this story — the observable effect is a rebuilt sim and an invalidated recording); **Story 2.1** (re-runs the ritual against real geometry); **Epic 6** (the settings panel reuses the provenance display). **Consumes:** `src/sim/table/tuning.ts`, `src/host/loop.ts`, `src/host/dev/replay-recorder.ts`.
- `src/host/dev/replay-player.ts` — **Consumed-by:** the panel's Play control and `test/replay-round-trip.test.ts` (this story); **Story 2.5** (re-records the goldens without the prologue). **Consumes:** `src/sim/loop/replay.ts` (`runReplay`, `stateHash`), `src/host/loop.ts`, `src/host/dev/replay-recorder.ts`.
- `hopControl` + its mechanism — **Consumed-by:** `test/hop-control.test.ts` and the panel (this story); `docs/feel-test.md`'s rejection/rebound item; **Story 2.1** (re-tuned against real geometry). **Consumes:** `src/sim/table/tuning.ts`, `src/sim/physics/flippers.ts`.

### Governing ADs (Rule 6), read from the spine text

- **AD-15 (line 202)** — primary. Verbatim: "The dev tuning panel hot-applies table tunables to the running sim and exports to `tuning.ts`; a hot-apply during a recording invalidates it." Its tunables list names "hop control; pitch bounds" explicitly, and its two-class rule ("solver constants … never tunable") is what forces hop control beside the port rather than inside it. Its closing line governs AC 5: "When a tuning change trades feel for fidelity, feel wins and the Reference-machine ritual decides."
- **AD-4 (line 91)** — the loop contract and "A replay is `ReplayHeader + InputTransition[]` and must reproduce the state hash." That last clause is precisely what `DW-86` says is false today.
- **AD-10 (line 172)** — AC 4's two halves: "Pitch is applied by physics as the gravity vector (the VPX slope model) and by presentation as a rotation of `playfield_root` only, about `pivot_pitch`, by the effective pitch read from the snapshot each frame." Also fixes `TABLE.reference` as the asserted reference dimensions.
- **AD-14 (line 196)** — sim adjustments (Pitch first in the list) layer table defaults → preset → player overrides and apply at the next game; persistence is host-only, one `localStorage` key. Governs both the pitch-source reconciliation and why Export cannot write a repo file.
- **AD-3 (line 85)** — one clock, ms→ticks once at load, "Physics has no randomness: scatter is 0 on every material by default." Governs AC 2's no-randomness clause and any `…Ms` tunable the panel emits.
- **AD-5 (line 116)** — hardware rules inside the physics step; "The flipper solenoid is vpx-js's `FlipperMover` ported verbatim." Governs where hop control may live and why the `PRE_STEP_HARDWARE_RULES` manifest must not gain a row for it.
- **AD-12 (line 184)** — "`?renderer=webgl2` and a Settings toggle force the WebGL2 engine, and the feel ritual (UJ-4) runs on both paths." AC 5's dual-path clause; also the engine-created-once rule the reset seam must not violate.
- **AD-16 (line 208)** — `host/**` may import `sim/contracts`, `sim/table`, `sim/loop` and `presentation/**`, never `sim/physics` or `sim/rules`; ported files keep their notices. Governs the panel's and the player's imports and `DW-79`'s freeze.
- **AD-17 (line 214, amended line 216)** — the pinned CSP and "no network after load". Governs Export and forbids inline script/style in the panel.
- **AD-7 (line 128)** — "`GameState` … mutated only inside `rules.step`." Not implemented here; it is the invariant whose live violation (`DW-70`) must stay loudly red.
- **AD-1 (line 69)** — fixed dependency direction, the frame every layering rule above sits in.

### Ledger

Owned and adjudicated at this story's `ledger_adjudicated` gate: **`DW-86`** (Phase 1 + Phase 6, closed by `test/replay-round-trip.test.ts`) and **`DW-80`** (Phase 7, closed by a re-measurement with a named number, or escalated via the Block If if the margin has been crossed). Referenced but explicitly **not** this story's to fix: `DW-70` (must stay red), `DW-85` (roll-and-drain insensitivity, Story 2.5), `DW-72` (the 5 s cradle assertion, Story 2.1), and Story 1.8's deferred `AD-14-gap` and `AD-2-residual`.

## Verification

**Commands:**
- `pnpm typecheck` — expected: clean across all three tsconfigs.
- `pnpm lint:boundaries` — expected: exit 0. The panel and the player must not import `sim/physics`/`sim/rules`; no `…Ms` numeric literal outside `tuning.ts`; no device-name literal outside `sim/table/dragonwar.ts` and `test/**`.
- `pnpm check:headers` && `pnpm check:attributions` — expected: exit 0; every new authored file carries the GPL-3.0 header, no new dependency.
- `pnpm test` — expected: green, including the five re-stamped goldens.
- `pnpm build` && `pnpm check:dist` && `pnpm check:size` — expected: exit 0; the pinned CSP tag intact, no inline script/style introduced by the panel, size still inside budget.
- **`pnpm check:ad7` — expected: STILL EXITS 1**, output containing `DW-70`, `AD-7`, `bd_trough`, `[true,true,true,true]` and `[true,true,true,false]`. A zero exit is a regression.

**Falsifiability — one named mutation per AC (Rule 19). Each must be applied, observed red, reverted, and the working tree confirmed byte-identical (`git status --short` and `git diff --stat` unchanged) before the next.**

- **AC 1 (enumeration):** pinning test `test/tuning-panel.test.ts` — row count equals a leaf count produced by an *independent* recursive walk written in the test, not by the panel's own walk. `mutation: drop the 'materials' group from the panel's enumeration → test/tuning-panel.test.ts's row-count assertion goes red.`
- **AC 1 (export format):** pinning test `test/tuning-source.test.ts` — `serialiseTuning({})` byte-equals `src/sim/table/tuning.ts`, LF-normalised. `mutation: emit entry(value, source) without the confidence argument → test/tuning-source.test.ts's byte-identity assertion goes red.`
- **AC 1 (hot-apply):** pinning test `test/host-loop.test.ts` reset block — run N frames, `reset({ tuning: override })`, run N frames, assert the snapshot observable changed. `mutation: make reset() keep the existing loop instead of constructing a fresh one → the post-reset snapshot assertion goes red.`
- **AC 2 (hop control):** pinning test `test/hop-control.test.ts` — the **paired** run: `hopControl = 0` and `hopControl = default` over the identical stress input, asserting max ball z diverges by a named margin, plus the absolute surface bound on the 0 run. The pairing is what makes it falsifiable: an absolute "no ball leaves the surface" alone is true with no hop mechanism at all — the same vacuity Story 1.8 fixed with a no-flipper control. `mutation: clamp the hop impulse to 0 unconditionally → the divergence assertion goes red (while the absolute bound stays green, which is the point).`
- **AC 3 (elasticity falloff):** pinning test `test/elasticity-falloff.test.ts` — ratio strictly decreasing across three speeds, with a falloff-0 control asserting a flat ratio over the same speeds. `mutation: override materials.flipper_rubber.elasticityFalloff to 0 through the new tuning seam → the strictly-decreasing assertion goes red.` (This mutation runs through the Phase 1 seam, so it also proves the seam.)
- **AC 4 (pitch):** pinning test `test/pitch-tunable.test.ts` — `defaultPitchDeg` 8.5 vs 6.0, asserting `snapshot.effectivePitchDeg`, a measurable downfield acceleration difference, and a differing `playfield_root` rotation. `mutation: revert machine.ts:119 to TABLE.reference.pitchDeg → effectivePitchDeg stays 6.5 and the acceleration-difference assertion goes red.`
- **AC 5 (feel-test doc):** pinning test `test/feel-test-docs.test.ts` — the three item names, one ISO-dated entry each, a golden link resolved with `fs.existsSync`, both renderer paths named. `mutation: delete the "rejection/rebound" item from docs/feel-test.md → the three-items assertion goes red.` Second, independent: `mutation: point the golden link at a non-existent file → the fs.existsSync assertion goes red.`
- **`DW-86` (record→replay round trip):** pinning test `test/replay-round-trip.test.ts` — record through the real `createHostLoop` on the existing manual-rAF harness, save, `runReplay()`, assert identical `stateHash`. `mutation: remove the start-tick rebasing from save() → the hash-equality assertion goes red.` Second, independent: `mutation: remove the non-zero-tick guard from start() and begin recording mid-session → the same assertion goes red.`
- **`DW-80` (tap bound):** pinning test `test/flipper-tap-bound.test.ts` — the 30 ms tap's true peak (tracking the post-release coast, not the release angle) against the 90° stop, asserting the margin against a named number. `mutation: raise TUNING.flipper.strength through the tuning seam → the margin assertion goes red.`
- **Goldens:** already falsifiable by construction — `assertHeaderMatchesLiveEnvironment` throws on any tuning drift. `mutation: revert one golden's header.gameStart.tuning to its pre-story value → that golden's test goes red with StaleReplayHeaderError.`

**Numbers this story must record in this section before it closes:**
- The re-measured 30 ms tap peak and its margin against the 90° stop, on the final tuning (`DW-80`; the Story 1.6 baseline was peak 90.0416° vs stop 90.0°, release 104.4°).
- Per golden: whether `expectedHash` changed after the re-stamp, and the measured reason.
- The chosen `hopControl` default, its unit-suffixed name, its `source` and `confidence`, and the measured max ball height at 0 vs at the default under the stress replay.
- The three rebound-to-impact ratios at the three impact speeds, and the flat control ratios.

**Manual checks (lead, per-story smoke — Rule 7 places browser-tooled checks on the lead):**
- Load the production build (`pnpm build` + `pnpm preview`) on the default path: press-to-begin, serve, flip. Panel absent. Screenshot.
- Same on `?renderer=webgl2`: open the panel, edit `elasticityFalloff`, confirm the rebuild is visible and the ball behaves differently. Screenshot.
- Both runs are AC 5's build-side dual-path evidence; record them as dated entries in `docs/feel-test.md`.

## Auto Run Result

Status: ready-for-dev
Blocking condition: none
