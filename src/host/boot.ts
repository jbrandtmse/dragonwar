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
import { createHostLoop } from './loop';
import { createReplayRecorder, type InvalidRecordingResult, type RecordingResult } from './dev/replay-recorder';
import { createReplayPlayer, type PlayableRecording } from './dev/replay-player';
import { createTuningPanel, buildOverriddenTuning, type TuningPanel } from './dev/tuning-panel';
import { BUILD_SHA } from './build-info';
import { resolveTuning } from '../sim/table/tuning';
import { TABLE } from '../sim/table/dragonwar';
import type { CoilName, Snapshot } from '../sim/table/names';

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
			 * `start()` throws `NonZeroStartTickError` unless the loop is
			 * genuinely at tick 0 -- call `pulseCoil`/`setCoilEnabled`'s sibling
			 * `hostLoop`-level `reset()` (via `openTuningPanel()`'s panel, or a
			 * fresh page load) first.
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
		hostLoop = createHostLoop(
			collisionDoc,
			(output) => {
				latestSnapshot = output.snapshot;
				replayPlayer.onFrame(output.snapshot);
			},
			(_elapsedMs, transitions, tick) => {
				replayRecorder.recordTransitions(transitions, tick);
			},
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
		});

		const hostLoopRef = hostLoop;
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
					replayRecorder.start(
						{
							seed: 0,
							tuning: tuningPanel ? buildOverriddenTuning(tuningPanel.overrides) : resolveTuning(),
							adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 },
							highscores: [],
						},
						physicsSeed,
						collisionDoc,
						latestSnapshot?.tick ?? 0,
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
