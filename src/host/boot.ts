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

import { bootScene } from '../presentation/scene/create-engine';

const GLB_URL = './assets/dragonwar.glb';

declare global {
	interface Window {
		// Read by tools/spike-3/measure-load.mjs over CDP -- the whole reason
		// this story records these two timestamps at all (the AC's
		// gesture-to-first-rendered-frame and navigation-to-first-rendered-frame
		// figures; navigation time is the CDP navigation timestamp the runner
		// already has, gestureMs/firstFrameMs are the two this page must expose).
		__dragonwarBoot?: {
			gestureMs: number;
			firstFrameMs: number;
			renderer: string;
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

	try {
		gate.hidden = true;
		canvas.hidden = false;

		// firstFrameMs comes from bootScene()'s own result, not a fresh
		// performance.now() here: a WebGPU attempt runs a verification grace
		// period AFTER its first frame renders (create-engine.ts), and using the
		// timestamp captured at the true first-render moment keeps that
		// verification latency out of the reported figure.
		const { renderer, firstFrameMs, webgpuFallbackReason } = await bootScene(canvas, GLB_URL);

		window.__dragonwarBoot = { gestureMs, firstFrameMs, renderer };

		// eslint-disable-next-line no-console
		console.info(
			webgpuFallbackReason
				? `[dragonwar] renderer: ${renderer} (WebGPU fallback reason: ${webgpuFallbackReason})`
				: `[dragonwar] renderer: ${renderer}`,
		);
	} catch (err) {
		// Load-time paths throw and boot reports them in the error panel rather
		// than white-screening (AD-17, Conventions/Errors) -- asset 404, glb
		// parse failure and engine-creation failure all land here.
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
