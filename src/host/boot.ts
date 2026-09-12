// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- the minimal boot gate AD-17 requires: a WebGL2 check
// before any asset loads, a press-to-begin gesture before any engine exists,
// and one host error panel for any boot-stage failure instead of a white
// screen. Story 6.1 replaces this with the full platform gate, the walk-up
// flow and the complete error panel; this file ships only AD-17's floor.
//
// This is host/, not presentation/ (AD-1): it composes DOM, the gate and the
// scene, and owns no game logic of its own.
//
// Story 1.5: fetches and parses `dragonwar.collision.json` (sim/ never does
// I/O -- AD-1), creates `src/host/loop.ts`'s rAF driver over it, and wires
// its per-frame `FrameOutput` into presentation on every render-loop tick
// (`syncBalls()` + `applyPitch()`), via `bootScene()`'s new `onFrame` hook.

import { bootScene } from '../presentation/scene/create-engine';
import { syncBalls } from '../presentation/scene/balls';
import { applyPitch } from '../presentation/scene/playfield';
import { advanceBackglass, renderFrame, INITIAL_BACKGLASS_VIEW } from '../presentation/backglass/frame';
import { rasterise, type DmdRaster } from '../presentation/backglass/raster';
import { syncBackglass } from '../presentation/backglass/backglass';
import { FONT_5X7 } from '../presentation/backglass/font';
import { advanceLamps, INITIAL_LAMP_VIEW, type LampView } from '../presentation/lighting/lamp-view';
import { syncLamps } from '../presentation/lighting/lamp-driver';
import { createHostLoop, type HostLoop, type ResetOptions } from './loop';
import { viewConfigFromKeyMap } from './input';
import { createReplayRecorder, type InvalidRecordingResult, type RecordingResult } from './dev/replay-recorder';
import { createReplayPlayer, type PlayableRecording } from './dev/replay-player';
import { createTuningPanel, buildOverriddenTuning, type TuningPanel } from './dev/tuning-panel';
import { BUILD_SHA } from './build-info';
import { deriveGameSeed } from './game-seed';
import { resolveTuning, TUNING } from '../sim/table/tuning';
import { TABLE } from '../sim/table/dragonwar';
import type { CoilName, GameStart, Snapshot } from '../sim/table/names';

const GLB_URL = './assets/dragonwar.glb';
const COLLISION_URL = './assets/dragonwar.collision.json';

// AR-34: published as a DOM attribute (rather than merely imported and left
// unused) so the `import.meta.env.VITE_BUILD_SHA` substitution survives
// tree-shaking, and so it is available immediately -- Story 6.3's Settings
// panel does not need a game to have started to read it.
document.documentElement.setAttribute('data-build-sha', BUILD_SHA);

declare global {
	interface Window {
		// Read by tools/spike-3/measure-load.mjs over CDP -- the whole reason
		// this story records these two timestamps at all (the AC's
		// gesture-to-first-rendered-frame and navigation-to-first-rendered-frame
		// figures). Both are page-clock `performance.now()` values, and the
		// runner reports firstFrameMs directly as navigationToFirstFrameMs --
		// `performance.now()`'s own origin IS the navigation start for this
		// document, so no CDP-side timestamp is involved. (An earlier version of
		// this comment claimed the runner combined these with a CDP navigation
		// timestamp; it does not -- corrected by review 2026-08-28.)
		__dragonwarBoot?: {
			gestureMs: number;
			firstFrameMs: number;
			renderer: string;
			/**
			 * Dev-only, for the lead's manual per-story smoke (this story's own
			 * integration AC: "issues the two dev pulses"). Not read by any
			 * automated test; console-only, e.g.
			 * `window.__dragonwarBoot.pulseCoil('c_trough_eject')`.
			 */
			pulseCoil: (coil: CoilName) => void;
			/**
			 * Dev-only (Story 1.6), same terms as `pulseCoil` above: the lead's
			 * manual lever for the coil-enable/disable acceptance criterion, e.g.
			 * `window.__dragonwarBoot.setCoilEnabled('c_flipper_l', false)`.
			 */
			setCoilEnabled: (coil: CoilName, enabled: boolean) => void;
			/**
			 * Story 1.8 (AC 3) / Story 1.9 (DW-86), same dev-only/console-only
			 * terms as the two above: `src/host/dev/replay-recorder.ts`'s
			 * record/play seam, attached at `src/host/loop.ts`'s `onAdvance`
			 * hook. e.g. `window.__dragonwarBoot.replayRecorder.start(1)`, drive
			 * the machine a while (`pulseCoil`/keyboard), then
			 * `window.__dragonwarBoot.replayRecorder.save()` -- or `.play()` to
			 * replay the last saved recording back through the SAME host loop
			 * and log whether it reproduced its own hash (DW-86's own claim).
			 * `ReplayRecorder.start()` throws `NonZeroStartTickError` unless the
			 * loop is genuinely at tick 0, and the loop has been running since
			 * boot -- so this facade RESETS the host loop first and starts the
			 * recording on the fresh sim. Review finding, this pass: before that
			 * fix this hatch passed the live `latestSnapshot.tick`, which is
			 * past 0 within one frame of boot, so every console `start()` threw
			 * and DW-86's own record/save/play workflow was unreachable in a
			 * real browser (there was no reset affordance either -- the panel
			 * has no Record control, and `reset` was not exposed here).
			 */
			replayRecorder: {
				start: (physicsSeed: number) => void;
				invalidate: (reason: string) => void;
				save: () => RecordingResult | InvalidRecordingResult;
				play: () => void;
				readonly isRecording: boolean;
			};
			/**
			 * Story 1.9, AC 1: mounts the dev tuning panel into `document.body`
			 * (idempotent -- a second call is a no-op if it is already mounted).
			 * Off on the default path (this story's own "Always" rule) -- never
			 * called automatically, console-only, e.g.
			 * `window.__dragonwarBoot.openTuningPanel()`.
			 */
			openTuningPanel: () => void;
			/**
			 * Story 1.9: `src/host/loop.ts`'s rebuild seam, exposed so the
			 * console can put the loop back at tick 0 (what `replayRecorder`'s
			 * own `start()` needs, and what the tuning panel's hot-apply does
			 * as a side effect). Dev-only/console-only, same terms as above.
			 */
			reset: () => void;
			/**
			 * Story 2.8 (code review, HIGH 2a): the lead's own lever for the
			 * HIGH-2 rework's browser A/B, same dev-only/console-only terms as
			 * every hatch above. Overrides the `{ budget }` option
			 * `syncLamps()` is called with on every subsequent render frame --
			 * `null` restores the production default
			 * (`TUNING.liveLightBudget.value`). `setLightBudget(0)` is exactly
			 * "every lit insert still shows its own emissive colour, no
			 * dynamic light is enabled" (already pinned by
			 * `test/lighting-scene.test.ts`'s `{ budget: 2 }` trap-4 case at a
			 * non-zero budget), which turns the insert LIGHTS off while
			 * leaving their emissive material untouched -- the isolation this
			 * hatch exists to give the transmissive-lens pixel proof, since
			 * nothing else under `src/host/**` can turn only one of the two
			 * halves off. e.g.
			 * `window.__dragonwarBoot.setLightBudget(0)` /
			 * `window.__dragonwarBoot.setLightBudget(null)`.
			 * A non-`null` value that is not a finite number >= 0 is rejected
			 * with a console error and otherwise ignored (the override is left
			 * unchanged); the override is also cleared back to `null` by
			 * `reset()`, so a stale A/B setting never survives a reset.
			 */
			setLightBudget: (budget: number | null) => void;
		};
	}
}

function byId<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) {
		throw new Error(`boot.ts: expected element #${id} in index.html`);
	}
	return el as T;
}

const gate = byId<HTMLElement>('gate');
const gateMessage = byId<HTMLElement>('gate-message');
const beginButton = byId<HTMLButtonElement>('begin-button');
const errorPanel = byId<HTMLElement>('error-panel');
const errorMessage = byId<HTMLElement>('error-message');
const canvas = byId<HTMLCanvasElement>('render-canvas');

/**
 * A throwaway canvas, never the real render canvas -- so this probe cannot
 * bind a context to the element bootScene() will later hand to Babylon.
 */
function supportsWebGL2(): boolean {
	try {
		const probe = document.createElement('canvas');
		return probe.getContext('webgl2') !== null;
	} catch {
		return false;
	}
}

function showError(message: string): void {
	gate.hidden = true;
	// Re-query by id rather than closing over the module-level `canvas` const:
	// create-engine.ts's WebGPU-fallback path (bootScene() -> a WebGPU attempt
	// that constructs but fails to render) swaps the live canvas element for a
	// same-id clone (replaceCanvasElement()) so the fallback WebGL2 context can
	// bind cleanly. If bootScene() then throws AGAIN on that fallback attempt
	// (review finding 2026-08-28), hiding the stale, already-detached `canvas`
	// reference has no on-screen effect -- the new element stays visible and,
	// being last in index.html's DOM order among the three fixed, inset:0
	// panels, paints OVER #error-panel's opaque background, hiding the very
	// message this function exists to show. AD-17 forbids white-screening on
	// any boot-stage failure; this closes that gap for the element itself,
	// whichever one is actually live in the DOM at the moment of failure.
	const liveCanvas = document.getElementById('render-canvas');
	if (liveCanvas) {
		liveCanvas.hidden = true;
	}
	errorMessage.textContent = message;
	errorPanel.hidden = false;
}

async function onBegin(): Promise<void> {
	const gestureMs = performance.now();
	beginButton.disabled = true;

	// Declared outside the try block (review finding 2026-08-28): if
	// bootScene() below throws AFTER hostLoop.start() has already begun its
	// own independent requestAnimationFrame chain, the catch block must be
	// able to reach it and stop it -- otherwise the sim loop keeps ticking
	// forever in the background (wasted CPU/battery, a live rAF handle) even
	// though the error panel is now showing and canvas/gate are no longer
	// wired to anything that reads its output.
	let hostLoop: ReturnType<typeof createHostLoop> | undefined;

	try {
		gate.hidden = true;
		canvas.hidden = false;

		// sim/ never does I/O (AD-1) -- the host fetches and JSON.parses the
		// already-exported collision document and hands the plain value to
		// sim/loop's createLoop(). A 404 or malformed document throws here and
		// lands in the same showError() path as every other boot-stage failure
		// (AD-17).
		const collisionResponse = await fetch(COLLISION_URL);
		if (!collisionResponse.ok) {
			throw new Error(`Failed to fetch ${COLLISION_URL}: ${collisionResponse.status} ${collisionResponse.statusText}`);
		}
		const collisionDoc: unknown = await collisionResponse.json();

		let latestSnapshot: Snapshot | undefined;
		// Story 2.6: the Backglass's own view state, folded forward every SIM
		// frame (never the Babylon render frame -- the two rAF chains are
		// independent, and driving BackglassView from the render chain would
		// let one `ball_ended` be seen zero, one or several times depending on
		// how the chains happen to interleave). `latestRaster` is the one thing
		// the render hook below actually blits -- it never touches
		// `backglassView` or `advanceBackglass()` itself.
		let backglassView = INITIAL_BACKGLASS_VIEW;
		let latestRaster: DmdRaster | undefined;
		// Story 2.13 (AD-1, AD-14): built ONCE from the real `KEY_MAP` --
		// `renderFrame()`'s own `ViewConfig` argument for the Attract keys
		// screen. `host/input`'s `KEY_MAP` never changes at runtime, so this
		// never needs rebuilding per frame.
		const viewConfig = viewConfigFromKeyMap();
		// Story 2.8 -- the lamp channel's own view state, folded forward every
		// SIM frame exactly like `backglassView` above (never the Babylon
		// render frame, for the same reason: the two rAF chains are
		// independent). `syncLamps()` below reads this on every render frame.
		let lampView: LampView = INITIAL_LAMP_VIEW;
		// Story 2.8 (code review, HIGH 2a): the lead's console-only override
		// for `syncLamps()`'s own `{ budget }` option, driven by
		// `window.__dragonwarBoot.setLightBudget()` below. `null` (the
		// default) means "no override" -- `syncLamps()` resolves its own
		// production default (`TUNING.liveLightBudget.value`) exactly as it
		// did before this hatch existed.
		let lightBudgetOverride: number | null = null;
		// Story 1.8 (AC 3): the recorder is constructed once per boot and
		// tapped via createHostLoop()'s third argument -- never wired into
		// sim/ itself (AD-1). start()/save()/invalidate() are exposed on
		// window.__dragonwarBoot.replayRecorder below for the lead's manual
		// smoke; nothing calls them automatically.
		const replayRecorder = createReplayRecorder();
		// Story 1.9 (DW-86): the play half -- onFrame below always forwards to
		// it (a no-op when nothing is playing, the same "dev-only tap, always
		// wired, mostly inert" pattern the recorder's onAdvance tap already
		// establishes).
		// deps.replayRecorder: starting playback mid-recording must invalidate
		// that recording (review finding, this pass -- DW-93 gap 3). See
		// src/host/dev/replay-player.ts's start().
		const replayPlayer = createReplayPlayer((result) => {
			// eslint-disable-next-line no-console
			console.info(`[dragonwar] replay playback complete: finalHash=${result.finalHash} finalGameStateHash=${result.finalGameStateHash}`);
		});
		let lastSavedRecording: RecordingResult | undefined;
		// Story 1.9, AC 1: the panel this dev hatch's GameStart reads from once
		// opened -- see the replayRecorder.start() lever below, which replaces
		// this story's own hardcoded dev GameStart with "the panel's current
		// set" once the panel exists.
		let tuningPanel: TuningPanel | undefined;
		// DW-201: a real, non-constant seed for the game the player is about to
		// actually play -- see game-seed.ts's own header for why the previous
		// hardcoded literal-zero seed was a defect (every real machine lit the
		// same Top lane on every ball of every game) and why deriving it here,
		// host-side, is the fix AD-3 allows (sim/ still only ever reads
		// GameState.rng).
		// `tuning`/`adjustments`/`highscores` mirror this loop's own PRE-EXISTING
		// implicit defaults exactly -- createLoop()'s own `options.tuning ??
		// resolveTuning()` and createRules()'s own DEFAULT_ADJUSTMENTS
		// (`src/sim/rules/index.ts`) -- so this is a seed-only fix, never a
		// behaviour change to the tuning or sim adjustments a real game boots
		// with.
		const gameStart: GameStart = {
			seed: deriveGameSeed(),
			tuning: resolveTuning(),
			// Story 2.11 (DW-36): tiltWarnings reads TUNING.tiltWarnings.value --
			// the same table-tunable entry sim/rules/index.ts's own
			// DEFAULT_ADJUSTMENTS reads -- rather than a second, hand-typed
			// literal. host/** may not import sim/rules/** directly (AD-1/AD-16),
			// but sim/table/** is fine (TABLE.reference.pitchDeg on this same
			// line is the existing precedent for reading the table layer here).
			// Story 2.13 (AD-14, AD-15): matchProbability reads TUNING.matchProbability.value,
			// mirroring tiltWarnings' own precedent exactly (the one place AD-15's
			// Rule names it, sim/table/tuning.ts) -- the dev replay recorder's own
			// SEPARATE GameStart (below) keeps its deliberate literal 0 (DW-185,
			// routed to Story 3.7).
			adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: TUNING.tiltWarnings.value, ballsPerGame: 3, matchProbability: TUNING.matchProbability.value },
			highscores: [],
		};
		hostLoop = createHostLoop(
			collisionDoc,
			(output) => {
				latestSnapshot = output.snapshot;
				replayPlayer.onFrame(output.snapshot);
				// Story 2.6: fold this frame's events into the Backglass view
				// (`ball_ended` reads output.events -- the ONE place FrameOutput.events
				// reaches anything today) and rasterise it against this same frame's
				// snapshot -- state from the sim chain, blit from the render chain.
				backglassView = advanceBackglass(backglassView, output);
				latestRaster = rasterise(renderFrame(backglassView, output.snapshot, viewConfig), FONT_5X7);
				// Story 2.8 (AD-9): fold this frame's LampCommands (if any) into the
				// held view -- the render hook below is what actually drives the
				// Babylon driver from it.
				lampView = advanceLamps(lampView, output);
			},
			(_elapsedMs, transitions, tick) => {
				replayRecorder.recordTransitions(transitions, tick);
			},
			gameStart,
		);
		hostLoop.start();

		// firstFrameMs comes from bootScene()'s own result, not a fresh
		// performance.now() here: a WebGPU attempt runs a verification grace
		// period AFTER its first frame renders (create-engine.ts), and using the
		// timestamp captured at the true first-render moment keeps that
		// verification latency out of the reported figure.
		const { renderer, firstFrameMs, webgpuFallbackReason } = await bootScene(canvas, GLB_URL, (scene, nodes) => {
			// The host loop's own rAF and Babylon's render loop are two separate
			// requestAnimationFrame chains driven by the same browser scheduler --
			// this callback simply re-syncs presentation to whatever FrameOutput
			// the host loop most recently produced, every time Babylon is about
			// to draw a frame (AD-4: render the latest snapshot, no interpolation).
			if (!latestSnapshot) {
				return;
			}
			syncBalls(scene, nodes.playfieldRoot, latestSnapshot);
			applyPitch(nodes, latestSnapshot.effectivePitchDeg);
			if (latestRaster) {
				syncBackglass(scene, latestRaster);
			}
			// Story 2.8 (AD-12): drives every insert's emissive material and its
			// own dynamic light from the latest folded lamp view -- the render
			// chain's own wall clock (`performance.now()`) is what times the
			// blink cadence `presentation/lighting/grammar.ts` declares.
			// HIGH 2a: null means no override -- syncLamps() resolves its own
			// production default (TUNING.liveLightBudget.value) exactly as before
			// this hatch existed.
			syncLamps(
				scene,
				nodes.playfieldRoot,
				lampView,
				performance.now(),
				lightBudgetOverride === null ? undefined : { budget: lightBudgetOverride },
			);
		});

		// Story 2.8 (code review pass 3). `lampView` is purely command-driven
		// -- unlike `backglassView`, which self-corrects every frame because
		// `renderFrame()` re-derives it from the live snapshot -- and a rebuilt
		// loop re-seeds its own `previousLamps` all-off, so it emits NO "off"
		// command for a lamp that was lit before the reset. Code review pass 2
		// found that and fixed it at the two reset-shaped hatches INSIDE this
		// file. It is now fixed at the seam instead, because `hostLoop.reset()`
		// has TWO MORE call sites that reach this same live loop from other
		// modules and were missed: `dev/replay-player.ts`'s reset-before-play
		// (reached from `replayRecorder.play()`) and `dev/tuning-panel.ts`'s
		// hot-apply. Both left every insert lit before the reset lit forever,
		// with no state behind it. `HostLoop.reset()`'s own doc comment names
		// those exact two as "the ONE seam" it exists for, so everything
		// downstream of this line receives a wrapper whose `reset()` clears the
		// view state the rebuilt loop can no longer restate. `lightBudgetOverride`
		// rides along for the same reason `setLightBudget`'s own JSDoc already
		// claims ("the override is also cleared back to `null` by `reset()`, so a
		// stale A/B setting never survives a reset") -- true of one hatch before
		// this, true of every reset path now.
		const liveHostLoop = hostLoop;
		const hostLoopRef: HostLoop = {
			...liveHostLoop,
			reset: (resetOptions?: ResetOptions): void => {
				liveHostLoop.reset(resetOptions);
				lampView = INITIAL_LAMP_VIEW;
				lightBudgetOverride = null;
			},
		};
		window.__dragonwarBoot = {
			gestureMs,
			firstFrameMs,
			renderer,
			pulseCoil: (coil: CoilName) => {
				hostLoopRef.pulseCoil(coil);
				// Story 1.9, DW-86: a coil pulsed through this dev hatch while
				// recording lands in the saved recording's own coilPrologue -- a
				// no-op when nothing is recording (ReplayRecorder's own contract).
				// The pulse lands on the NEXT tick (pulseCoil()'s own contract),
				// so it is recorded at latestSnapshot.tick + 1.
				replayRecorder.recordCoilPulse(coil, (latestSnapshot?.tick ?? 0) + 1);
			},
			setCoilEnabled: hostLoopRef.setCoilEnabled,
			replayRecorder: {
				start: (physicsSeed: number) => {
					// Story 1.9: "replace the hardcoded dev GameStart with the
					// panel's current set" -- once the panel exists (opened via
					// window.__dragonwarBoot.openTuningPanel()), its accumulated
					// edits are what the recording's own header describes;
					// otherwise this falls back to the shipped default, exactly as
					// before this story (there is deliberately NO golden-recording
					// script in this repository: the five goldens were recorded
					// once, and re-recording is a deliberate act, never a routine
					// one).
					// The loop has been running since boot, so its tick is past 0
					// and ReplayRecorder.start()'s NonZeroStartTickError guard
					// would reject every console call. Reset FIRST -- the error's
					// own message says to ("Reset the loop first (hostLoop.reset()),
					// then start()") and the Design Notes say the same ("the
					// panel's Record resets first"). The fresh loop really is at
					// tick 0, so 0 is what is passed, not a stale snapshot tick.
					// Story 2.8: `hostLoopRef.reset()` also clears `lampView` and
					// `lightBudgetOverride` -- see its wrapper above.
					hostLoopRef.reset();
					replayRecorder.start(
						{
							seed: 0,
							tuning: tuningPanel ? buildOverriddenTuning(tuningPanel.overrides) : resolveTuning(),
							adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 },
							highscores: [],
						},
						physicsSeed,
						collisionDoc,
						0,
					);
				},
				invalidate: (reason: string) => replayRecorder.invalidate(reason),
				save: () => {
					const result = replayRecorder.save();
					if (result.ok) {
						lastSavedRecording = result;
					}
					return result;
				},
				play: () => {
					if (!lastSavedRecording) {
						// eslint-disable-next-line no-console
						console.error('[dragonwar] replayRecorder.play(): no saved recording -- call start() then save() first.');
						return;
					}
					const recording: PlayableRecording = lastSavedRecording;
					replayPlayer.start(hostLoopRef, recording);
				},
				get isRecording(): boolean {
					return replayRecorder.isRecording;
				},
			},
			reset: () => {
				// Story 2.8: clears `lampView` and `lightBudgetOverride` too --
				// see `hostLoopRef`'s wrapper above for why that lives on the
				// seam rather than here.
				hostLoopRef.reset();
			},
			setLightBudget: (budget: number | null) => {
				// Story 2.8 (code review, rework iteration 3 follow-up): reject
				// NaN/Infinity/negative rather than passing them straight into
				// syncLamps()'s own `{ budget }` option, where a NaN or negative
				// budget silently disables every dynamic light with no console
				// signal at all -- console-hatch input is exactly where a typo
				// (a stray minus sign, a divide-by-zero) reaches this unchecked.
				if (budget !== null && !(Number.isFinite(budget) && budget >= 0)) {
					// eslint-disable-next-line no-console
					console.error(`[dragonwar] setLightBudget(${String(budget)}): budget must be a finite number >= 0, or null to restore the default -- ignored.`);
					return;
				}
				lightBudgetOverride = budget;
			},
			openTuningPanel: () => {
				if (tuningPanel) {
					return; // idempotent -- already mounted
				}
				tuningPanel = createTuningPanel({ hostLoop: hostLoopRef, replayRecorder });
				document.body.appendChild(tuningPanel.element);
			},
		};

		// eslint-disable-next-line no-console
		console.info(
			webgpuFallbackReason
				? `[dragonwar] renderer: ${renderer} (WebGPU fallback reason: ${webgpuFallbackReason})`
				: `[dragonwar] renderer: ${renderer}`,
		);
	} catch (err) {
		// Load-time paths throw and boot reports them in the error panel rather
		// than white-screening (AD-17, Conventions/Errors) -- asset 404, glb
		// parse failure and engine-creation failure all land here. Stop the
		// host loop's own rAF chain if it was already started (review finding
		// 2026-08-28, see the declaration above) -- otherwise it survives this
		// failure and keeps advancing the simulation with nothing reading it.
		hostLoop?.stop();
		const reason = err instanceof Error ? err.message : String(err);
		showError(`Failed to start: ${reason}`);
	}
}

// AD-17's minimum: WebGL2 is checked BEFORE any asset loads and before any
// engine exists -- this runs synchronously at module load, before the
// press-to-begin gesture is even wired up. The gate panel itself is already
// interactive from first paint (index.html renders it with no script
// dependency), so this can only make it LESS interactive, never delay it.
if (supportsWebGL2()) {
	beginButton.addEventListener('click', onBegin, { once: true });
} else {
	beginButton.disabled = true;
	gateMessage.textContent =
		'This browser does not support WebGL2. DragonWar needs a recent version of Chrome, Edge or Safari.';
}
