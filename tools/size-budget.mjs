#!/usr/bin/env node
// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- CI size budget. Walks the built dist/, gzips every
// file at level 9 in memory, sums the compressed bytes, and compares against
// BUDGET_BYTES. This re-sets NFR-4's `[ASSUMPTION - re-set by spike 3]` 20 MB
// ceiling from a real measured production build rather than a guess.
//
// "Compressed dist/" means every file under dist/ gzipped at level 9, summed
// (this story's own decision -- see docs/spikes/spike-3.md, "Decisions this
// spec makes"): this build has no lazy-loaded route, so everything emitted is
// initial payload, and gzip is what a static host like GitHub Pages
// negotiates, keeping this number comparable to the transfer size
// tools/spike-3/measure-load.mjs measures over the wire.
//
// BUDGET_BYTES -- measured baseline, rounded up to the next 0.25 MB, plus
// 2.00 MB of authored headroom for the remainder of Epic 1 (see
// docs/spikes/spike-3.md, "Size budget", for the full write-up). Re-set by
// Story 1.4 when the real glb replaces the placeholder, and again by the
// Epic 5 art passes. Must always stay below NFR-4's 20 MB product ceiling.
//
// Measured 2026-08-27 on this story's production build (root page +
// Spike 1 harness page, both counted -- "the Spike 1 harness page is built
// into dist/ and therefore deployed and counted", this spec's own decision):
//   baseline  = 0.725152 MB (725,152 bytes gzipped -- every file under dist/,
//               gzip level 9, summed; see docs/spikes/spike-3.md for the
//               distinction from the ~588-592 KB a real root-page load
//               actually transfers, which excludes the separate Spike 1
//               harness page's own files)
//   rounded   = 0.75 MB   (next 0.25 MB increment above the baseline)
//   headroom  = 2.00 MB   (authored, for the remainder of Epic 1)
//   BUDGET    = 0.75 + 2.00 = 2.75 MB = 2,750,000 bytes
// 2.75 MB is comfortably below NFR-4's 20 MB ceiling -- about 86% headroom
// remains against that product ceiling even after this budget's own 2 MB.
//
// Usage: node tools/size-budget.mjs [distDir]
//   --budget <bytes>   TEST-ONLY override of BUDGET_BYTES, so
//                       test/size-budget.test.ts can exercise the failure
//                       path (a budget set below the real measurement)
//                       against a real subprocess invocation of this exact
//                       script, not a mock.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// See docs/spikes/spike-3.md "Size budget" for the full derivation. Measured
// 2026-08-27 on a production build of this story's placeholder scene
// (Babylon.js core + loaders + the placeholder glb + the Spike 1 harness
// page, all gzipped): baseline rounded up to the next 0.25 MB, plus 2.00 MB
// authored headroom. Re-set by Story 1.4 (real glb) and by the Epic 5 art
// passes; must stay below NFR-4's 20 MB ceiling.
export const BUDGET_BYTES = 2_750_000;

const GZIP_LEVEL = 9;

/** Recursively lists every file (not directory) under `root`, absolute paths. */
function listFilesRecursive(root) {
	const out = [];
	for (const entry of readdirSync(root)) {
		const full = path.join(root, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			out.push(...listFilesRecursive(full));
		} else {
			out.push(full);
		}
	}
	return out;
}

export function measureGzippedDist(distDir) {
	if (!existsSync(distDir)) {
		throw new Error(`${distDir} does not exist -- run "pnpm build" first`);
	}
	const files = listFilesRecursive(distDir);
	const perFile = files.map((file) => {
		const raw = readFileSync(file);
		const gz = gzipSync(raw, { level: GZIP_LEVEL });
		return { file: path.relative(distDir, file).split(path.sep).join('/'), bytes: gz.length };
	});
	perFile.sort((a, b) => b.bytes - a.bytes);
	const totalBytes = perFile.reduce((sum, f) => sum + f.bytes, 0);
	return { totalBytes, perFile };
}

function formatMb(bytes) {
	return `${(bytes / 1_000_000).toFixed(3)} MB (${bytes.toLocaleString()} bytes)`;
}

function parseArgs(argv) {
	let distDir;
	let budgetOverride;
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--budget') {
			i++;
			if (argv[i] === undefined) {
				throw new Error('--budget requires a value');
			}
			budgetOverride = Number(argv[i]);
			if (!Number.isFinite(budgetOverride) || budgetOverride <= 0) {
				throw new Error(`--budget must be a positive number of bytes, got "${argv[i]}"`);
			}
		} else if (!argv[i].startsWith('--')) {
			distDir = argv[i];
		} else {
			throw new Error(`unrecognized argument: ${argv[i]}`);
		}
	}
	return { distDir, budgetOverride };
}

function main() {
	let args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (err) {
		console.error(`[size-budget] FAILED: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
		return;
	}

	const distDir = path.resolve(REPO_ROOT, args.distDir ?? 'dist');
	const budget = args.budgetOverride ?? BUDGET_BYTES;

	let result;
	try {
		result = measureGzippedDist(distDir);
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error(`[size-budget] FAILED: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
		return;
	}

	// eslint-disable-next-line no-console
	console.log(`[size-budget] measured: ${formatMb(result.totalBytes)}`);
	// eslint-disable-next-line no-console
	console.log(`[size-budget] budget:   ${formatMb(budget)}`);

	if (result.totalBytes > budget) {
		// eslint-disable-next-line no-console
		console.error(
			`[size-budget] FAILED: measured ${formatMb(result.totalBytes)} exceeds the budget of ${formatMb(budget)}`,
		);
		// eslint-disable-next-line no-console
		console.error('[size-budget] largest contributors:');
		for (const f of result.perFile.slice(0, 10)) {
			// eslint-disable-next-line no-console
			console.error(`  ${formatMb(f.bytes)}  ${f.file}`);
		}
		process.exit(1);
		return;
	}

	// eslint-disable-next-line no-console
	console.log('[size-budget] OK -- within budget');
	process.exit(0);
}

const isMainModule = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMainModule) {
	main();
}
