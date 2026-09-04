<!-- bmad:context -->
<!-- Verified 2026-08-30 against 969a528. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## DragonWar

An open-source pinball simulation: one original table, browser-first, Windows and macOS, GPL-3.0. TypeScript on Vite, Babylon.js rendering with a WebGL2 floor, a time-of-impact physics core ported from vpx-js, Vitest goldens; Node 24 LTS and pnpm. Planning is complete and lives in `_bmad-output/`; the code is being written from it now.

## Policy

- Read `CLAUDE.md` before adding or porting any third-party file — code, model, texture, sound, font. Its provenance rule is a hard requirement, and the `ATTRIBUTIONS.md` entry goes in before the file does.

## Where things are

- Structural decisions are governed by the architecture spine: `_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md` (invariants AD-1..AD-19), with `SOLUTION-DESIGN.md` beside it for the reasoning. It supersedes the brief and the research where they disagree.
- Story breakdown — 6 epics, 53 stories: `_bmad-output/planning-artifacts/epics.md`
- Machine behaviour, physics tuning figures, and the domain glossary: `_bmad-output/specs/spec-dragonwar/`

## Running and verifying

- Resolve BMad config as `PYTHONIOENCODING=utf-8 uv run _bmad/scripts/resolve_config.py --project-root .` — plain `uv run` dies with a `UnicodeEncodeError` on the agent icons under a cp1252 console.
- `package.json`'s fourteen scripts, pnpm 11.24.0 / Vite 8.2.2 / Vitest 4.1.11 / TypeScript 7.0.2 / Node >=24 as the spine fixed them: `dev`, `typecheck` (`tsc --noEmit` over the three tsconfig projects), `test` (`vitest run`), `build`, `preview`, `check:dist`, `check:size`, `lint:boundaries`, `check:headers`, `check:attributions`, `export:assets`, `check:ad7`, `check:corridor`, `check:reachability`. `check:ad7` (DW-70, Story 1.8) and `check:corridor` (DW-137, Story 2.1c, owned by Story 2.1f) are both intended-red: each is a live, documented defect, wired outside `pnpm test` and CI's fixed script list, with an in-suite wrapper test (`test/ad7-device-slots.test.ts`, `test/dw137-corridor-gate.test.ts`) that asserts the failure's own content rather than merely its exit code. `check:reachability` (Story 2.1e) is different in kind, not degree: it is opt-in and **intended green** — a real check (the dense out-of-process sweep that proves each shot-routing release point reachable, or genuinely not) kept out of `pnpm test` for cost (472 release trajectories, ~75-78 s measured -- 471 until Story 2.1d's rework added `plunge-medium-295` as the 11th explicit `WITNESSES` recipe; re-measured at that story's iteration-2 code review, 2026-09-04), not because it documents a live defect. **Run it whenever the committed geometry moves** (any `pnpm export:assets`, any edit to `tools/make-placeholder-blend.py`), whenever a case is added to or moved in `test/util/shot-cases.ts`, and whenever a story changes an `unreachable` verdict — it is in neither CI nor `pnpm test`, and it is not typechecked (`tsconfig.node.json` excludes `test/fixtures/**`), so nothing else will notice it rotting.
- CI is `.github/workflows/ci.yml`: a `Checks` job (typecheck, boundary lint, licence headers, attribution ledger, test, build, static-bundle check, size budget, then uploads the Pages artifact on `main`) followed by a `Deploy to GitHub Pages` job gated on that job succeeding and on `main`.

## Conventions that differ from defaults

- Never import `src/presentation/`, `src/host/` or `@babylonjs/*` from `src/sim/`, and never reference `window`, `document`, `performance`, `Date`, `Math.random`, `setTimeout` or `requestAnimationFrame` there — the simulation must run headless in Node for golden replays.
- Author every duration in ms in `src/sim/table/tuning.ts` and convert to ticks once at load; no literal millisecond belongs anywhere else under `sim/`.
- Draw all randomness in `sim/` from the seeded PRNG in `GameState.rng`, never `Math.random()` — a replay must reproduce its state hash.
- Name devices only through `TABLE` in `src/sim/table/dragonwar.ts`; a device-name string literal anywhere else outside `test/**` is a lint error.
- Convert units and axes only in `src/sim/table/frames.ts` — the table frame is millimetres right-handed, and physics keeps VP units (1 U = 0.53975 mm) internally.

<!-- /bmad:context -->
