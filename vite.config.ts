// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- the production build config AD-17 and DW-11 require.
//
// base: './' -- relative asset paths only (AD-17); the build must load correctly
// from a project-site subpath (https://jbrandtmse.github.io/dragonwar/) and from
// wherever Tauri later serves it, never assuming a root origin.
//
// build.modulePreload.polyfill: false -- Vite's default modulePreload polyfill is
// injected as an INLINE <script>, which `default-src 'self'` blocks outright
// (there is no 'unsafe-inline'). Every browser this project supports (current
// Chrome, Edge, Safari) has native ES module preloading, so the polyfill buys
// nothing here and its absence costs nothing.
//
// build.assetsInlineLimit: 0 -- a small asset inlined as a data: URI would defeat
// this story's own payload measurement (and, for the glb specifically, is banned
// outright by the spec's Never list: it inflates the payload about 33% and
// describes a load path DragonWar does not ship).
//
// rollupOptions.input names both HTML entry points this build ships: the real
// root page and the Spike 1 harness page, which DW-11 asks to stay permanently
// buildable from the repository's own scripts (and which is therefore deployed
// and measured too -- see docs/spikes/spike-3.md).
//
// preview.port is fixed and strictPort so the local control URL
// (http://localhost:<port>/) is deterministic across runs -- tools/spike-3's
// measurement runner and tools/spike-1/measure.mjs both depend on a stable URL
// to A/B against the deployed Pages figure.

import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
	base: './',
	build: {
		modulePreload: {
			polyfill: false,
		},
		assetsInlineLimit: 0,
		rollupOptions: {
			input: {
				main: resolve(import.meta.dirname, 'index.html'),
				spike1: resolve(import.meta.dirname, 'tools/spike-1/index.html'),
			},
		},
	},
	preview: {
		port: 4173,
		strictPort: true,
	},
});
