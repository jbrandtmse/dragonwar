// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- the engine and placeholder scene. Lives under
// src/presentation/ (AD-1: @babylonjs/* is imported only under presentation/
// and host/, never sim/). Deep ES imports throughout, not the side-effectful
// barrel (@babylonjs/core), so the production build only pays for what this
// scene actually uses -- this story's own payload measurement depends on it.
//
// AD-12: the engine is chosen exactly once at boot, before the scene exists.
// AD-10: the scene is right-handed (useRightHandedSystem = true), geometry is
// authored unpitched, and the glb is loaded through @babylonjs/loaders.
//
// Renderer selection (this story's amended AC, epics.md:379 / AD-12):
// EngineFactory.CreateAsync (v9.22.2; see node_modules/@babylonjs/core/Engines/
// engineFactory.js) always probes WebGPU first via
// `await WebGPUEngine.IsSupportedAsync`, with NO option to skip that probe or
// force WebGL2 -- so `?renderer=webgl2` is honoured by bypassing EngineFactory
// entirely and constructing the WebGL2 Engine directly.
//
// A REAL CSP finding, live-measured during this story (recorded in full in
// docs/spikes/spike-3.md): a bare PBRMaterial -- the material Babylon's glTF
// loader always builds, explicit glTF material or the loader's own default
// alike -- unconditionally loads a default "environment BRDF" lookup texture
// the first time one is needed (`GetEnvironmentBRDFTexture`,
// node_modules/@babylonjs/core/Misc/brdfTextureTools.js), from a `data:
// image/png;base64,...` URI baked into Babylon's own source. `default-src
// 'self'` -- the pinned CSP, unchanged from this story's own amendment --
// does NOT admit the `data:` scheme (only `'self'` origins), so Chrome blocks
// that image load outright: "Loading the image 'data:image/png;base64,...'
// violates the following Content Security Policy directive: default-src
// 'self'". This is IDENTICAL under WebGL2 and WebGPU (verified with
// `?renderer=webgl2` live) -- it is a materials-pipeline issue, not a
// renderer one, and it is exactly the class of failure AD-17's CSP was
// designed to surface rather than hide: a boot-time asset load this static
// bundle cannot actually serve. The fix is NOT to weaken the CSP (forbidden
// by this story's own Never list) but to pre-empt Babylon's lazy default:
// `seedEnvironmentBrdfTexture()` below hands every scene an in-memory
// `RawTexture` (built from raw pixel bytes, no network or `data:` load at
// all) as `scene.environmentBRDFTexture` BEFORE any material can ask for the
// baked-in one -- `GetEnvironmentBRDFTexture` only creates its own when
// `scene.environmentBRDFTexture` is still falsy. This placeholder scene has
// no environment/reflection texture to begin with, so the BRDF LUT's actual
// values are inert for it; Story 1.4/Epic 5's real materials may need a
// correct baked LUT of their own by the same mechanism.
//
// A WebGPU attempt is additionally verified against the whole boot sequence,
// not just engine construction, as a general fallback net for any OTHER
// WebGPU-specific failure this story's own scene does not happen to trigger:
// `bootScene()` arms a page-level `unhandledrejection` listener for the
// duration of one WebGPU attempt and treats a firing exactly like a thrown
// exception -- dispose the WebGPU engine and scene, retry the whole boot once
// forced to WebGL2. Nothing is surfaced to the player; the console evidence is
// captured on the result for docs/spikes/spike-3.md.

import { EngineFactory } from '@babylonjs/core/Engines/engineFactory';
import { Engine } from '@babylonjs/core/Engines/engine';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { ImportMeshOptions } from '@babylonjs/core/Loading/sceneLoader';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
// Side-effect-only: registers .createRawTexture on the engine prototype(s),
// which RawTexture.CreateRGBATexture calls internally. Babylon's
// tree-shakeable engine extensions require this explicit import; without it,
// CreateRGBATexture throws "engine.rawTexture needs to be imported before..."
// -- verified empirically while building this file's CSP workaround. WebGL2's
// `Engine` and WebGPU's `WebGPUEngine` are separate class hierarchies
// (ThinEngine vs. ThinWebGPUEngine, both under AbstractEngine) with their own
// separate extension modules -- both are needed since this scene may run on
// either.
import '@babylonjs/core/Engines/Extensions/engine.rawTexture';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.rawTexture';
// Deliberately the base loader module, not the '@babylonjs/loaders/glTF/2.0'
// barrel: that barrel also re-exports every extension (Draco, KTX2/Basis/DDS/
// EXR/HDR/TGA/IES texture codecs, Gaussian Splatting, the FlowGraph
// interactivity blocks...), none of which this placeholder box needs, and
// which measurably inflated this story's own payload figure during
// development (~1.5 MB raw / ~340 KB gzipped extra) before this was narrowed.
// glTFLoader.js self-registers the base .gltf/.glb SceneLoader plugin as a
// side effect on import; Story 1.4's real asset may need to add specific
// extensions back deliberately (e.g. Draco) when the real glb needs them.
import '@babylonjs/loaders/glTF/2.0/glTFLoader';

/** Engine construction options, shared by every path (forced, WebGPU, fallback). */
const ENGINE_OPTIONS = {
	antialias: true,
	adaptToDeviceRatio: true,
} as const;

export type RendererChoice = 'webgpu' | 'webgl2' | 'webgl2-forced' | 'webgl2-fallback';

export interface CreateEngineResult {
	engine: AbstractEngine;
	renderer: RendererChoice;
	/** Set only on the webgl2-fallback path: the exact error WebGPU init raised. */
	webgpuFallbackReason?: string;
}

// Module-level guard, not a class: this file's whole surface is a handful of
// free functions called once each from src/host/boot.ts, per AD-12's "chosen
// once at boot" rule. A second call is a defect -- see the I/O matrix's
// "Engine created once" row -- caught here rather than left to manifest as
// two competing render loops. `bootScene()`'s own internal WebGPU-failure
// retry (below) deliberately does NOT go through this guard a second time --
// from the boot flow's perspective "try WebGPU, fall back to WebGL2 if it
// cannot actually render" is still ONE engine choice, matching the AC's own
// wording ("otherwise the engine falls back to WebGL2 silently").
let engineCreated = false;

function canvasOrNull(canvas: HTMLCanvasElement | undefined): HTMLCanvasElement | null {
	// Babylon's Engine constructor types its canvas param as
	// `HTMLCanvasElement | ... | null` (no `undefined`) -- this is a type-level
	// normalisation only: under Node (test/scene-smoke.test.ts) it still
	// constructs cleanly with no real canvas, per node_modules/@babylonjs/
	// core/Engines/engine.js.
	return canvas ?? null;
}

/**
 * Whether `engine` is a WebGPUEngine. Deliberately `engine.isWebGPU` (a public
 * getter on AbstractEngine, `false` by default and set `true` only in
 * WebGPUEngine's constructor) rather than `engine.constructor.name ===
 * 'WebGPUEngine'`: esbuild's production minifier renames class identifiers,
 * so a constructor-name string comparison silently and always fails on the
 * built bundle -- verified empirically during this story's own build, where
 * it mislabelled a genuine WebGPUEngine as WebGL2 in the printed result.
 * Property names are not mangled by Vite's default esbuild config, so this
 * survives minification.
 */
function isWebGPUEngine(engine: AbstractEngine): boolean {
	return (engine as unknown as { isWebGPU?: boolean }).isWebGPU === true;
}

/**
 * Creates the engine exactly once. `forceWebGL2` is the caller's already-parsed
 * `?renderer=webgl2` decision (kept out of this function so it stays testable
 * under Node with no `window`, per AD-15's NullEngine-smoke-only rule -- see
 * test/scene-smoke.test.ts).
 */
export async function createEngine(canvas: HTMLCanvasElement | undefined, forceWebGL2: boolean): Promise<CreateEngineResult> {
	if (engineCreated) {
		throw new Error(
			'createEngine() called more than once -- the engine is created exactly once at boot (AD-12).',
		);
	}
	engineCreated = true;

	const canvasArg = canvasOrNull(canvas);

	if (forceWebGL2) {
		return { engine: new Engine(canvasArg, true, ENGINE_OPTIONS), renderer: 'webgl2-forced' };
	}

	try {
		const engine = await EngineFactory.CreateAsync(canvasArg as HTMLCanvasElement, ENGINE_OPTIONS);
		const renderer: RendererChoice = isWebGPUEngine(engine) ? 'webgpu' : 'webgl2';
		return { engine, renderer };
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		// eslint-disable-next-line no-console
		console.warn(`[dragonwar] WebGPU engine init failed under the pinned CSP; falling back to WebGL2 silently: ${reason}`);
		return { engine: new Engine(canvasArg, true, ENGINE_OPTIONS), renderer: 'webgl2-fallback', webgpuFallbackReason: reason };
	}
}

/** Test-only: resets the single-creation guard between cases. Never called from boot.ts. */
export function resetEngineCreationGuardForTests(): void {
	engineCreated = false;
}

export interface BootSceneResult {
	engine: AbstractEngine;
	scene: Scene;
	renderer: RendererChoice;
	/** performance.now() at the moment the first frame actually rendered -- captured once, never delayed by WebGPU verification (see below). */
	firstFrameMs: number;
	webgpuFallbackReason?: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clones `canvas` (same id, class, attributes) into a brand-new element in the
 * same place in the DOM and returns it. Used only for the WebGPU-failed
 * fallback retry -- see the call site's comment on why a fresh canvas element
 * is required, not merely a fresh Engine.
 */
function replaceCanvasElement(canvas: HTMLCanvasElement): HTMLCanvasElement {
	const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
	canvas.replaceWith(fresh);
	return fresh;
}

// A second, DIFFERENT WebGPU defect measured live in this build (see this
// file's header comment): a render-pipeline construction TypeError
// ("Failed to read the 'arrayStride' property... Required member is
// undefined") that did not surface on the very first rendered frame, only a
// few animation frames later. It is a synchronous throw inside
// engine.runRenderLoop()'s rAF callback, which reaches the page as a plain
// `error` event, not `unhandledrejection`. Verifying a WebGPU attempt
// therefore means: keep BOTH listeners armed, and keep them armed for a short
// grace period after the first frame too, not only up to it.
const WEBGPU_VERIFY_GRACE_MS = 500;

/**
 * Pre-empts PBRMaterial's lazy default environment-BRDF texture (see this
 * file's header comment): a 1x1 opaque-white RawTexture built from raw bytes
 * in memory, no network or `data:` image load involved at all. Assigning
 * `scene.environmentBRDFTexture` before any material needs one makes
 * `GetEnvironmentBRDFTexture` return this instead of loading Babylon's own
 * baked `data:` URI default, which the pinned CSP blocks. This scene has no
 * environment/reflection texture, so the LUT's actual values are inert here.
 */
function seedEnvironmentBrdfTexture(scene: Scene): void {
	const pixel = new Uint8Array([255, 255, 255, 255]);
	scene.environmentBRDFTexture = RawTexture.CreateRGBATexture(pixel, 1, 1, scene, false, false);
}

export interface LoadAndRenderResult {
	scene: Scene;
	/** performance.now() at the instant the first frame rendered -- the true figure, independent of any later verification. */
	firstFrameMs: number;
}

/**
 * One attempt: build the scene against an already-created engine, start its
 * render loop, and capture the first-frame timestamp. `importOptions` is
 * `undefined` on every production call (bootScene()'s glbUrl is a real
 * same-origin path, so ImportMeshAsync infers the '.glb' plugin from the URL
 * itself); the parameter exists so test/scene-smoke.test.ts can drive this
 * exact function with a `data:` source with no file extension, via
 * `{ pluginExtension: '.glb' }`, without adding a test-only branch to the
 * shipped control flow.
 */
async function loadAndRenderOnce(
	engine: AbstractEngine,
	glbUrl: string,
	importOptions?: ImportMeshOptions,
): Promise<LoadAndRenderResult> {
	const scene = new Scene(engine);
	scene.useRightHandedSystem = true; // AD-10
	seedEnvironmentBrdfTexture(scene);

	// One fixed authored camera, no camera controls (UJ-4 / Structural Seed --
	// the walk-up and attract show are later work; presentation/camera/ owns
	// the real fixed view). This framing just needs to see the placeholder box.
	const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3, 1.8, Vector3.Zero(), scene);
	camera.minZ = 0.01;

	// eslint-disable-next-line no-new
	new HemisphericLight('light', new Vector3(0, 1, 0), scene);

	await ImportMeshAsync(glbUrl, scene, importOptions);

	// A synchronous throw from scene.render() on its FIRST call (corrupt
	// geometry, a broken shader, GPU context loss) happens inside a scheduled
	// rAF callback, after this promise's executor has already returned -- it
	// does not reject this promise on its own, and the AWAIT below would hang
	// forever, permanently disabling the press-to-begin button with no error
	// panel shown (violates AD-17's "never white-screen" / always-report
	// boot-stage failures). The try/catch below only covers calls BEFORE the
	// first successful render; once firstFrameSeen is true, later throws are
	// deliberately left to propagate as uncaught `error` events, since
	// bootScene()'s WebGPU-verification window (see this file's header
	// comment, "Defect 2") relies on exactly that global event to catch a
	// delayed post-first-frame render-pipeline failure (review finding
	// 2026-08-28).
	const firstFrameMs = await new Promise<number>((resolve, reject) => {
		let firstFrameSeen = false;
		scene.onAfterRenderObservable.addOnce(() => {
			firstFrameSeen = true;
			resolve(performance.now());
		});
		engine.runRenderLoop(() => {
			if (firstFrameSeen) {
				scene.render();
				return;
			}
			try {
				scene.render();
			} catch (err) {
				engine.stopRenderLoop();
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
	});

	return { scene, firstFrameMs };
}

/**
 * Test-only: exercises the REAL shipped scene-construction path -- camera,
 * light, the CSP-defect BRDF-texture seed, the glb import, and the
 * first-rendered-frame capture -- against a caller-supplied engine (a
 * NullEngine under vitest's Node environment; see test/scene-smoke.test.ts).
 * `bootScene()` is browser-only (reads `window.location.search`) and cannot
 * run under Node, but the scene-construction logic it delegates to,
 * `loadAndRenderOnce()`, has no DOM dependency and is exercised here
 * directly rather than through a hand-rolled parallel loader sequence.
 * Never called from boot.ts.
 */
export async function loadAndRenderOnceForTests(
	engine: AbstractEngine,
	glbUrl: string,
	importOptions?: ImportMeshOptions,
): Promise<LoadAndRenderResult> {
	return loadAndRenderOnce(engine, glbUrl, importOptions);
}

/**
 * The browser-only entry: reads `?renderer=webgl2` from the page URL, creates
 * the engine, builds the minimal placeholder scene, and resolves once the
 * first frame has rendered. Not exercised by any automated test (AD-15) --
 * `window`/`location` access here is exactly the DOM boundary sim/ must never
 * cross, and presentation/ is where it belongs.
 */
export async function bootScene(canvas: HTMLCanvasElement, glbUrl: string): Promise<BootSceneResult> {
	const forceWebGL2 = new URLSearchParams(window.location.search).get('renderer') === 'webgl2';
	const first = await createEngine(canvas, forceWebGL2);

	if (!isWebGPUEngine(first.engine)) {
		// Not attempting WebGPU at all (forced, unsupported, or engine
		// construction already fell back) -- WebGL2 is the floor and is expected
		// to just work; no extra monitoring needed.
		const { scene, firstFrameMs } = await loadAndRenderOnce(first.engine, glbUrl);
		return { engine: first.engine, scene, renderer: first.renderer, firstFrameMs, webgpuFallbackReason: first.webgpuFallbackReason };
	}

	// WebGPU engine constructed successfully. Verify it can actually load and
	// render THIS scene before committing to it -- see this file's header
	// comment for the two distinct defects this guards against (an unawaited
	// rejected promise, and a delayed synchronous throw inside the render
	// loop). Both listener kinds are armed through loading AND through a short
	// grace period after the first frame renders.
	let capturedFailure: string | undefined;
	const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
		const reason = event.reason;
		capturedFailure ??= reason instanceof Error ? reason.message : String(reason);
		event.preventDefault(); // this is exactly the failure being handled; do not also let it hit the console as uncaught
	};
	const onError = (event: ErrorEvent): void => {
		capturedFailure ??= event.error instanceof Error ? event.error.message : event.message;
		event.preventDefault();
	};
	window.addEventListener('unhandledrejection', onUnhandledRejection);
	window.addEventListener('error', onError);

	let loaded: LoadAndRenderResult | undefined;
	let thrown: unknown;
	try {
		loaded = await loadAndRenderOnce(first.engine, glbUrl);
		if (capturedFailure === undefined) {
			await sleep(WEBGPU_VERIFY_GRACE_MS);
		}
	} catch (err) {
		thrown = err;
	} finally {
		window.removeEventListener('unhandledrejection', onUnhandledRejection);
		window.removeEventListener('error', onError);
	}

	const webgpuReason = thrown !== undefined
		? (thrown instanceof Error ? thrown.message : String(thrown))
		: capturedFailure;

	if (webgpuReason === undefined && loaded) {
		// The WebGPU path genuinely worked, verified past the grace period.
		return { engine: first.engine, scene: loaded.scene, renderer: 'webgpu', firstFrameMs: loaded.firstFrameMs };
	}

	// eslint-disable-next-line no-console
	console.warn(
		`[dragonwar] WebGPU engine constructed under the pinned CSP but failed to render this scene; ` +
		`falling back to WebGL2 silently: ${webgpuReason}`,
	);
	loaded?.scene.dispose();
	first.engine.dispose();

	// A canvas element permanently locks in whichever context type its FIRST
	// getContext() call establishes -- once WebGPUEngine has bound a 'webgpu'
	// context to `canvas`, a later getContext('webgl2') on that same element
	// returns null forever (verified empirically: retrying on the original
	// canvas surfaced Babylon's own "WebGL2 not supported", even though a
	// fresh page load on the identical browser renders WebGL2 fine). The
	// fallback therefore needs a FRESH canvas element, not the WebGPU-tainted
	// one, swapped into the same place in the DOM.
	const freshCanvas = replaceCanvasElement(canvas);

	// A controlled, single retry -- NOT a second call to createEngine() (see
	// that function's guard comment above). Constructed directly, bypassing
	// EngineFactory's WebGPU probe entirely, matching the forced-WebGL2 path.
	const fallbackEngine = new Engine(freshCanvas, true, ENGINE_OPTIONS);
	const fallback = await loadAndRenderOnce(fallbackEngine, glbUrl);
	return {
		engine: fallbackEngine,
		scene: fallback.scene,
		renderer: 'webgl2-fallback',
		firstFrameMs: fallback.firstFrameMs,
		webgpuFallbackReason: webgpuReason,
	};
}
