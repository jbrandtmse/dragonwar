#!/usr/bin/env node
// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8, AC 5: serves tools/replay-parity/index.html through Vite's
// PROGRAMMATIC dev-server API (`vite`'s own `createServer()`), never through
// this repository's own vite.config.ts (out of footprint -- a new build
// entry point there is exactly what this story's Code Map rules out: "a new
// parity page cannot become a Vite build input"). Follows
// tools/spike-1/{index.html,browser.ts} + tools/spike-1/measure.mjs's own
// precedent, adapted from "spawn a real browser over CDP and measure" to
// "serve a page and print its URL for the author to open".
//
// A small Connect middleware (`goldensPlugin` below) serves
// test/replays/*.golden.json and public/assets/dragonwar.collision.json at
// fixed `/dragonwar-goldens/*` URLs -- both live OUTSIDE this page's own
// `root` (tools/replay-parity/), and Vite's dev server does not serve
// arbitrary filesystem paths outside its root by default; a plugin-owned
// middleware is the in-footprint way to reach them without widening
// `server.fs.allow` (which would need per-Vite-version `/@fs/` URL
// knowledge this story does not want to depend on) and without a
// vite.config.ts edit.
//
// Usage: node tools/replay-parity/serve.mjs [--port <n>]
//   Then open the printed URL in Chrome (or Safari, on macOS -- the
//   author-owned leg, this story's Design Notes "Risk carried into
//   implementation: AC 5's Safari leg"). Every golden reports PASS/FAIL
//   automatically on load.

import { createServer } from 'vite';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.resolve(TOOL_ROOT, '..', '..');
const REPLAYS_DIR = path.join(REPO_ROOT, 'test', 'replays');
const COLLISION_PATH = path.join(REPO_ROOT, 'public', 'assets', 'dragonwar.collision.json');

// Exported (Review finding 2026-08-29) so this file's string/regex logic is
// unit-testable directly, without a live browser -- same reasoning as
// tools/spike-1/browser.ts's own exports (test/spike-1-browser-guard.test.ts);
// see test/replay-parity-logic.test.ts.
export const GOLDEN_NAME_PATTERN = /^[a-z0-9-]+$/;
export const GOLDEN_ROUTE_PATTERN = /^\/dragonwar-goldens\/([a-z0-9-]+)\.golden\.json$/;

function listGoldenNames() {
	if (!existsSync(REPLAYS_DIR)) {
		return [];
	}
	return readdirSync(REPLAYS_DIR)
		.filter((f) => f.endsWith('.golden.json'))
		.map((f) => f.slice(0, -'.golden.json'.length))
		.filter((name) => {
			if (GOLDEN_NAME_PATTERN.test(name)) {
				return true;
			}
			console.warn(`[replay-parity] skipping golden file with unexpected name: ${name}.golden.json (must match ${GOLDEN_NAME_PATTERN})`);
			return false;
		})
		.sort();
}

/** @returns {import('vite').Plugin} */
function goldensPlugin() {
	return {
		name: 'dragonwar-replay-goldens',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const url = req.url ?? '';

				if (url === '/dragonwar-goldens/index.json') {
					res.setHeader('Content-Type', 'application/json');
					res.end(JSON.stringify(listGoldenNames()));
					return;
				}

				if (url === '/dragonwar-goldens/collision.json') {
					if (!existsSync(COLLISION_PATH)) {
						res.statusCode = 404;
						res.end(`no such file: ${COLLISION_PATH}`);
						return;
					}
					res.setHeader('Content-Type', 'application/json');
					res.end(readFileSync(COLLISION_PATH, 'utf8'));
					return;
				}

				const match = GOLDEN_ROUTE_PATTERN.exec(url);
				if (match) {
					const name = match[1];
					const filePath = path.join(REPLAYS_DIR, `${name}.golden.json`);
					if (!existsSync(filePath)) {
						res.statusCode = 404;
						res.end(`no such golden: ${name}`);
						return;
					}
					res.setHeader('Content-Type', 'application/json');
					// JSON-parsed by the browser client, never byte-compared -- the
					// CRLF hazard this story's own goldens carry (core.autocrlf=true)
					// is immaterial here (this story's own "Always" rule).
					res.end(readFileSync(filePath, 'utf8'));
					return;
				}

				next();
			});
		},
	};
}

function parseArgs(argv) {
	let port = 5300;
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--port') {
			const value = argv[++i];
			if (value === undefined || Number.isNaN(Number(value))) {
				throw new Error('--port requires a numeric value');
			}
			port = Number(value);
		} else {
			throw new Error(`unrecognized argument: ${argv[i]}`);
		}
	}
	return { port };
}

async function main() {
	const { port } = parseArgs(process.argv.slice(2));

	const server = await createServer({
		root: TOOL_ROOT,
		configFile: false,
		plugins: [goldensPlugin()],
		server: { port, strictPort: false },
	});
	await server.listen();

	const names = listGoldenNames();
	console.log(`[replay-parity] serving ${names.length} golden(s): ${names.join(', ') || '(none found under test/replays/)'}`);
	server.printUrls();
	console.log('[replay-parity] open the printed URL in a browser -- every golden reports PASS/FAIL automatically on load.');
	console.log('[replay-parity] press Ctrl+C to stop.');
}

// Review finding 2026-08-29 (code review): `main()` used to run
// UNCONDITIONALLY at module scope, and `test/replay-parity-logic.test.ts`
// imports this module for its two exported regexes -- so every `pnpm test`
// run booted a real Vite dev server inside a Vitest worker (measured: the
// worker logged Vite's own "(client) Re-optimizing dependencies" and left a
// listening socket behind), and any throw out of `main()` -- an unrecognized
// argv entry the worker happened to carry, or a `server.listen()` refused by
// a sandboxed runner -- set `process.exitCode = 1`, turning a fully GREEN
// suite red for a reason no test reports. The standard entry-point guard
// keeps `node tools/replay-parity/serve.mjs` behaving exactly as before while
// making the import side-effect-free.
const invokedPath = process.argv[1];
const isDirectRun = invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href;

if (isDirectRun) {
	main().catch((err) => {
		console.error(`[replay-parity] FAILED: ${err instanceof Error ? err.message : String(err)}`);
		process.exitCode = 1;
	});
}
