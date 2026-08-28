#!/usr/bin/env node
// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- asserts AD-17's static-bundle invariants over a built
// dist/: the amended CSP meta tag on every emitted .html, only relative asset
// references in every HTML page and no root-relative asset path regression in
// an emitted chunk, no inline <script>/<style>/style=, no service worker, and
// THIRD-PARTY-NOTICES.txt present and linked from the root page. Exits
// non-zero naming the FIRST violation found -- CI's `pnpm check:dist` step
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
const PINNED_CSP = "default-src 'self'; connect-src 'self'";

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

/** Every `href="..."` / `src="..."` attribute value in an HTML document. */
function extractAttrRefs(html) {
	const refs = [];
	const pattern = /\b(?:href|src)\s*=\s*"([^"]*)"/gi;
	let match;
	while ((match = pattern.exec(html)) !== null) {
		refs.push(match[1]);
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

		const styleAttrMatch = /\sstyle\s*=\s*"/i.exec(html);
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
}

function checkNoServiceWorker(distDir, allFiles) {
	for (const file of allFiles) {
		const base = path.basename(file).toLowerCase();
		if (base === 'service-worker.js' || /sw\.js$/i.test(base)) {
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

	const indexPath = path.join(distDir, 'index.html');
	if (!existsSync(indexPath)) {
		throw new CheckDistError('dist/index.html is missing -- cannot verify the notices link');
	}
	const html = readFileSync(indexPath, 'utf8');
	const linked = extractAttrRefs(html).some((ref) => ref.replace(/^\.\//, '') === 'THIRD-PARTY-NOTICES.txt');
	if (!linked) {
		throw new CheckDistError('dist/index.html does not link to THIRD-PARTY-NOTICES.txt');
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
