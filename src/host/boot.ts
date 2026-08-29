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
import { BUILD_SHA } from './build-info';
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
		hostLoop = createHostLoop(collisionDoc, (output) => {
			latestSnapshot = output.snapshot;
		});
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

		window.__dragonwarBoot = { gestureMs, firstFrameMs, renderer, pulseCoil: hostLoop.pulseCoil, setCoilEnabled: hostLoop.setCoilEnabled };

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
