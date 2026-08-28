#!/usr/bin/env node
// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- asserts AD-17's static-bundle invariants over a built
// dist/: the amended CSP meta tag on every emitted .html, only relative asset
// references in every HTML page and no root-relative asset path regression in
// an emitted chunk or an emitted stylesheet, no inline <script>/<style>/style=,
// no service worker, THIRD-PARTY-NOTICES.txt and LICENSE.txt both present and
// linked from the root page, the runtime-fetched glb actually present, and
// (Story 1.3, AR-34, conditional on `VITE_BUILD_SHA` being set for this
// script's own invocation) the commit-SHA stamp reaching the emitted bundle.
// Exits non-zero naming the FIRST violation found -- CI's `pnpm check:dist` step
// (this story's AC: "a CI step greps the CSP tag and fails if it is absent",
// widened to the sibling invariants named in the same AC). Node built-ins only.
//
// Deliberately NOT a blanket "grep every emitted chunk for the substring
// https://" check: Babylon.js's own third-party source legitimately embeds
// doc-comment URLs and optional-CDN-fallback string constants for features
// this scene never invokes (e.g. `Animation.SnippetUrl`, a static class field
// set unconditionally at module scope) -- verified during this story's own
// build. None of those are reachable network calls; the CSP's `connect-src
// 'self'` is what actually enforces "no network calls after load" (NFR-7) at
// runtime, for code we do not author and cannot practically scrub. What IS
// checked here is scoped to what this project actually authors: every href/src
// in our own HTML, and a root-relative "/assets/..." regression signal (a
// concrete symptom of a Vite `base` misconfiguration) in an emitted chunk.
//
// Usage: node tools/check-dist.mjs [distDir]   (default: dist)

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PINNED_CSP = "default-src 'self'; connect-src 'self' blob:; img-src 'self' blob:";

export class CheckDistError extends Error {}

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

function relPath(distDir, file) {
	return path.relative(distDir, file).split(path.sep).join('/');
}

/**
 * Every `href="..."` / `src="..."` attribute value in an HTML document.
 * Matches both quote styles -- Vite's own HTML output is consistently
 * double-quoted, but a single-quoted attribute would otherwise pass every
 * check below unexamined (review finding 2026-08-28).
 */
function extractAttrRefs(html) {
	const refs = [];
	const pattern = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
	let match;
	while ((match = pattern.exec(html)) !== null) {
		refs.push(match[1] ?? match[2]);
	}
	return refs;
}

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i; // e.g. https://, wss://

function isRootRelative(ref) {
	return ref.startsWith('/') && !ref.startsWith('//');
}

function isExternalOrigin(ref) {
	return ref.startsWith('//') || ABSOLUTE_URL_PATTERN.test(ref);
}

function checkCspTag(distDir, htmlFiles) {
	for (const file of htmlFiles) {
		const html = readFileSync(file, 'utf8');
		const metaMatch = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*>/i.exec(html);
		if (!metaMatch) {
			throw new CheckDistError(
				`${relPath(distDir, file)}: missing the Content-Security-Policy <meta> tag`,
			);
		}
		if (metaMatch[1] !== PINNED_CSP) {
			throw new CheckDistError(
				`${relPath(distDir, file)}: CSP directive mismatch -- expected "${PINNED_CSP}", ` +
				`found "${metaMatch[1]}"`,
			);
		}
	}
}

function checkNoInlineScriptStyleAttr(distDir, htmlFiles) {
	for (const file of htmlFiles) {
		const html = readFileSync(file, 'utf8');

		const scriptTagPattern = /<script\b[^>]*>/gi;
		let match;
		while ((match = scriptTagPattern.exec(html)) !== null) {
			if (!/\bsrc\s*=/i.test(match[0])) {
				throw new CheckDistError(
					`${relPath(distDir, file)}: inline <script> with no src= attribute -- ` +
					`default-src 'self' blocks it (tag: ${match[0]})`,
				);
			}
		}

		if (/<style\b/i.test(html)) {
			throw new CheckDistError(`${relPath(distDir, file)}: inline <style> block found -- move it to an external stylesheet`);
		}

		const styleAttrMatch = /\sstyle\s*=\s*["']/i.exec(html);
		if (styleAttrMatch) {
			throw new CheckDistError(`${relPath(distDir, file)}: a style= attribute was found -- default-src 'self' blocks it`);
		}
	}
}

function checkRelativePathsOnly(distDir, allFiles, htmlFiles) {
	for (const file of htmlFiles) {
		const html = readFileSync(file, 'utf8');
		for (const ref of extractAttrRefs(html)) {
			if (ref.startsWith('#') || ref.startsWith('mailto:') || ref === '') {
				continue;
			}
			if (isRootRelative(ref)) {
				throw new CheckDistError(`${relPath(distDir, file)}: absolute (root-relative) reference "${ref}" -- must be relative`);
			}
			if (isExternalOrigin(ref)) {
				throw new CheckDistError(`${relPath(distDir, file)}: reference to an external origin "${ref}"`);
			}
		}
	}

	// Every emitted chunk (I/O matrix, "Relative paths only" row): a
	// root-relative asset path is the concrete symptom of a `base`
	// misconfiguration in a bundled chunk.
	for (const file of allFiles) {
		if (path.extname(file) !== '.js') {
			continue;
		}
		const code = readFileSync(file, 'utf8');
		const rootAssetMatch = /["'](\/assets\/[^"']*)["']/.exec(code);
		if (rootAssetMatch) {
			throw new CheckDistError(
				`${relPath(distDir, file)}: root-relative asset reference "${rootAssetMatch[1]}" in an emitted chunk`,
			);
		}
	}

	// Emitted stylesheets were previously unscanned entirely (review finding
	// 2026-08-28): the `.js`-only filter above skipped them, so a
	// `url(/assets/...)` -- the same `base` misconfiguration symptom -- or an
	// external `url()`/`@import` would ship unnoticed and then be blocked at
	// runtime by `default-src 'self'`. CSS references are unquoted as often as
	// not, so this matches all three forms.
	for (const file of allFiles) {
		if (path.extname(file) !== '.css') {
			continue;
		}
		const css = readFileSync(file, 'utf8');
		const pattern = /(?:url\(\s*|@import\s+)(?:"([^"]*)"|'([^']*)'|([^)'";\s]+))/gi;
		let match;
		while ((match = pattern.exec(css)) !== null) {
			const ref = (match[1] ?? match[2] ?? match[3] ?? '').trim();
			if (ref === '' || ref.startsWith('#') || ref.startsWith('data:')) {
				continue;
			}
			if (isRootRelative(ref)) {
				throw new CheckDistError(
					`${relPath(distDir, file)}: root-relative reference "${ref}" in an emitted stylesheet -- must be relative`,
				);
			}
			if (isExternalOrigin(ref)) {
				throw new CheckDistError(
					`${relPath(distDir, file)}: reference to an external origin "${ref}" in an emitted stylesheet`,
				);
			}
		}
	}
}

function checkNoServiceWorker(distDir, allFiles) {
	for (const file of allFiles) {
		const base = path.basename(file).toLowerCase();
		// A word-boundary-ish separator before "sw.js" (not a bare substring
		// match) so a legitimately-named file merely ending in that letter
		// sequence -- there is none in this build today, but nothing stops one
		// existing later -- is not misreported as a forbidden service worker
		// (review finding 2026-08-28).
		if (base === 'service-worker.js' || /(?:^|[._-])sw\.js$/i.test(base)) {
			throw new CheckDistError(`${relPath(distDir, file)}: looks like a service worker file -- AD-17 forbids one`);
		}
	}
	for (const file of allFiles) {
		if (path.extname(file) !== '.js') {
			continue;
		}
		const code = readFileSync(file, 'utf8');
		if (code.includes('serviceWorker.register')) {
			throw new CheckDistError(`${relPath(distDir, file)}: contains "serviceWorker.register" -- AD-17 forbids a service worker`);
		}
	}
}

function checkThirdPartyNotices(distDir) {
	const noticesPath = path.join(distDir, 'THIRD-PARTY-NOTICES.txt');
	if (!existsSync(noticesPath)) {
		throw new CheckDistError('dist/THIRD-PARTY-NOTICES.txt is missing (Apache-2.0 4(a)/4(d) obligation)');
	}

	// GPL-3.0 sections 4-6 bind this deploy exactly as Apache-2.0 4(a)/4(d) do:
	// the bundle conveys DragonWar's own GPL-3.0 code and the minified vpx-js
	// port, whose per-file headers the minifier strips. Shipping the licence
	// text and linking it is that obligation's other half, and it was missing
	// entirely until review 2026-08-28 -- so it is gated here, not left to
	// intent.
	const licensePath = path.join(distDir, 'LICENSE.txt');
	if (!existsSync(licensePath)) {
		throw new CheckDistError('dist/LICENSE.txt is missing (GPL-3.0 sections 4-6 obligation)');
	}

	const indexPath = path.join(distDir, 'index.html');
	if (!existsSync(indexPath)) {
		throw new CheckDistError('dist/index.html is missing -- cannot verify the notices link');
	}
	const html = readFileSync(indexPath, 'utf8');
	const refs = extractAttrRefs(html).map((ref) => ref.replace(/^\.\//, ''));
	if (!refs.includes('THIRD-PARTY-NOTICES.txt')) {
		throw new CheckDistError('dist/index.html does not link to THIRD-PARTY-NOTICES.txt');
	}
	if (!refs.includes('LICENSE.txt')) {
		throw new CheckDistError('dist/index.html does not link to LICENSE.txt');
	}
}

/**
 * AR-34's SHA stamp (Story 1.3): `src/host/build-info.ts` bakes
 * `import.meta.env.VITE_BUILD_SHA` into the emitted bundle as a build-time
 * literal (Vite's own substitution, not a runtime env read). Conditional on
 * `process.env.VITE_BUILD_SHA` being set for THIS script's own invocation --
 * "when `VITE_BUILD_SHA` was set at build time" (this story's Acceptance
 * Criterion); a plain `pnpm build && pnpm check:dist` with no such variable
 * set anywhere makes this a deliberate no-op, not a failure.
 */
function checkBuildShaStamp(distDir, allFiles) {
	const expectedSha = process.env.VITE_BUILD_SHA;
	if (!expectedSha) {
		return;
	}
	const jsFiles = allFiles.filter((f) => f.endsWith('.js'));
	const found = jsFiles.some((f) => readFileSync(f, 'utf8').includes(expectedSha));
	if (!found) {
		throw new CheckDistError(
			`VITE_BUILD_SHA="${expectedSha}" was set but no emitted .js file under ${path.relative(REPO_ROOT, distDir)} contains it -- ` +
			`the build-time stamp did not reach the bundle`,
		);
	}
}

/**
 * The assets the shipped page actually requests at runtime must exist in the
 * build. `src/host/boot.ts` fetches './assets/dragonwar.glb' as a plain
 * runtime string, so Vite never resolves it and no build step fails when it
 * goes missing: a dropped `publicDir`, a renamed file or a moved asset would
 * pass typecheck, the whole test suite, `check:size` and the previous version
 * of this script, deploy green, and hand every visitor the error panel
 * (review finding 2026-08-28).
 *
 * Story 1.4 -- `dragonwar.collision.json` is the second pipeline artifact
 * `Vite` copies verbatim from `public/` (never bundled or imported by
 * specifier, so a missing or renamed file is equally invisible to every
 * other check): required alongside the glb so a regression here is caught
 * the same way, naming which of the two artifacts is missing.
 */
function checkRuntimeAssets(distDir) {
	const glbPath = path.join(distDir, 'assets', 'dragonwar.glb');
	if (!existsSync(glbPath)) {
		throw new CheckDistError(
			'dist/assets/dragonwar.glb is missing -- src/host/boot.ts requests it at runtime, so the deployed page would fail to boot',
		);
	}
	const collisionPath = path.join(distDir, 'assets', 'dragonwar.collision.json');
	if (!existsSync(collisionPath)) {
		// Not yet a live boot-time dependency (review finding, this story's
		// review pass): src/host/boot.ts does not fetch this file in this
		// story's diff -- src/sim/physics/loader is only ever called from
		// tests today. Story 1.5 is the stated runtime consumer (this
		// story's Design Notes: "Story 1.5 ... owns the host-side fetch of
		// dragonwar.collision.json"). It still belongs in dist/ -- and is
		// still worth failing the build over -- as a required pipeline
		// artifact, just not phrased as an already-live boot dependency.
		throw new CheckDistError(
			'dist/assets/dragonwar.collision.json is missing -- it is a required pipeline artifact for physics collision (Story 1.5 owns its runtime consumer)',
		);
	}
}

export function checkDist(distDir) {
	if (!existsSync(distDir)) {
		throw new CheckDistError(`${distDir} does not exist -- run "pnpm build" first`);
	}
	const allFiles = listFilesRecursive(distDir);
	const htmlFiles = allFiles.filter((f) => f.endsWith('.html'));
	if (htmlFiles.length === 0) {
		throw new CheckDistError(`${distDir} contains no .html files -- run "pnpm build" first`);
	}

	checkCspTag(distDir, htmlFiles);
	checkRelativePathsOnly(distDir, allFiles, htmlFiles);
	checkNoInlineScriptStyleAttr(distDir, htmlFiles);
	checkNoServiceWorker(distDir, allFiles);
	checkThirdPartyNotices(distDir);
	checkRuntimeAssets(distDir);
	checkBuildShaStamp(distDir, allFiles);

	return { htmlFilesChecked: htmlFiles.length, filesChecked: allFiles.length };
}

function main() {
	const distDir = path.resolve(REPO_ROOT, process.argv[2] ?? 'dist');
	try {
		const result = checkDist(distDir);
		// eslint-disable-next-line no-console
		console.log(
			`[check-dist] OK -- ${result.htmlFilesChecked} HTML page(s), ${result.filesChecked} file(s) checked under ${path.relative(REPO_ROOT, distDir)}`,
		);
		process.exit(0);
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error(`[check-dist] FAILED: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}
}

const isMainModule = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMainModule) {
	main();
}
