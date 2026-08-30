// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- real subprocess invocations of tools/check-dist.mjs
// (the test/measure-cli.test.ts pattern: the actual shipped script, not a
// mock) against constructed fixture dist/ directories, one per invariant the
// I/O & Edge-Case Matrix names. Each failure case is exercised deliberately
// (Rule 3), not only reasoned about.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const CHECK_DIST_SCRIPT = path.resolve(__dirname, '..', 'tools', 'check-dist.mjs');
const RUN_TIMEOUT_MS = 10_000;

const VALID_CSP_TAG =
	'<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; connect-src \'self\' blob:; img-src \'self\' blob:">';

const createdDirs: string[] = [];

function makeFixture(files: Record<string, string>): string {
	const dir = mkdtempSync(path.join(tmpdir(), 'dragonwar-check-dist-'));
	createdDirs.push(dir);
	for (const [rel, content] of Object.entries(files)) {
		const full = path.join(dir, rel);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, content, 'utf8');
	}
	return dir;
}

function runCheckDist(
	distDir: string,
	env?: Record<string, string>,
): { status: number | null; stdout: string; stderr: string } {
	const result = spawnSync(process.execPath, [CHECK_DIST_SCRIPT, distDir], {
		encoding: 'utf8',
		timeout: RUN_TIMEOUT_MS,
		env: env ? { ...process.env, ...env } : process.env,
	});
	return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function validIndexHtml(extraHead = ''): string {
	return `<!DOCTYPE html>
<html>
<head>
${VALID_CSP_TAG}
${extraHead}
<link rel="stylesheet" href="./styles.css">
</head>
<body>
<a href="./THIRD-PARTY-NOTICES.txt">notices</a>
<a href="./LICENSE.txt">licence</a>
<script type="module" src="./assets/main.js"></script>
</body>
</html>`;
}

afterEach(() => {
	for (const dir of createdDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe('tools/check-dist.mjs -- a fully-compliant fixture', () => {
	it('exits 0', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml(),
			'styles.css': 'body { margin: 0; }',
			'THIRD-PARTY-NOTICES.txt': 'Apache License 2.0...',
			'LICENSE.txt': 'GNU GENERAL PUBLIC LICENSE Version 3...',
			'assets/dragonwar.glb': 'glTF-binary-placeholder',
			'assets/dragonwar.collision.json': '{}',
			'assets/main.js': 'console.log("hello");',
		});
		const { status, stdout } = runCheckDist(dir);
		expect(status).toBe(0);
		expect(stdout).toMatch(/OK/);
	});
});

describe('tools/check-dist.mjs -- missing dist directory', () => {
	it('exits non-zero naming the missing directory', () => {
		const { status, stderr } = runCheckDist(path.join(tmpdir(), 'dragonwar-check-dist-does-not-exist'));
		expect(status).toBe(1);
		expect(stderr).toMatch(/does not exist/);
	});
});

describe('tools/check-dist.mjs -- dist directory exists but has no .html files', () => {
	it('exits non-zero naming the missing build output, telling the caller to run "pnpm build"', () => {
		const dir = makeFixture({
			'THIRD-PARTY-NOTICES.txt': 'x',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/contains no \.html files/);
		expect(stderr).toMatch(/pnpm build/);
	});
});

describe('tools/check-dist.mjs -- CSP tag', () => {
	it('exits non-zero when the CSP meta tag is absent', () => {
		const dir = makeFixture({
			'index.html': `<!DOCTYPE html><html><head><link rel="stylesheet" href="./styles.css"></head>` +
				`<body><a href="./THIRD-PARTY-NOTICES.txt">n</a></body></html>`,
			'THIRD-PARTY-NOTICES.txt': 'x',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/missing the Content-Security-Policy/);
	});

	it('exits non-zero when the CSP directives are altered', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml().replace(VALID_CSP_TAG, '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">'),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/CSP directive mismatch/);
	});
});

describe('tools/check-dist.mjs -- relative paths only', () => {
	it('exits non-zero naming a root-relative href', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml('<link rel="icon" href="/favicon.ico">'),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/absolute \(root-relative\) reference "\/favicon\.ico"/);
	});

	it('exits non-zero naming a reference to an external origin', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml('<link rel="preconnect" href="https://cdn.example.com">'),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/external origin/);
	});

	it('exits non-zero naming a root-relative asset reference inside an emitted chunk', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml(),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'assets/main.js': 'fetch("/assets/dragonwar.glb");',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/root-relative asset reference "\/assets\/dragonwar\.glb"/);
	});
});

describe('tools/check-dist.mjs -- no inline script, style or style= attribute', () => {
	it('exits non-zero naming an inline <script> with no src', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml().replace(
				'<script type="module" src="./assets/main.js"></script>',
				'<script type="module" src="./assets/main.js"></script><script>console.log(1)</script>',
			),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/inline <script> with no src=/);
	});

	it('exits non-zero when an inline <style> block is present', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml('<style>body{color:red}</style>'),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/inline <style> block/);
	});

	it('exits non-zero when a style= attribute is present', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml().replace('<body>', '<body><div style="color:red"></div>'),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/style= attribute/);
	});
});

describe('tools/check-dist.mjs -- external origin references in OUR OWN markup', () => {
	// See tools/check-dist.mjs's header comment: this is deliberately scoped to
	// href/src attributes in our own authored HTML (already covered by the
	// "relative paths only" describe block above), not a blanket scan of every
	// emitted chunk -- third-party library internals (e.g. Babylon's
	// `Animation.SnippetUrl` static field) legitimately embed URL string
	// constants for features this build never invokes, and the CSP's
	// `connect-src 'self'` is what actually enforces no network call reaches
	// them. This fixture is the corroborating case: a build carrying such a
	// literal (simulated here without needing a real Babylon build) still
	// passes, because it is not a reference WE authored.
	it('does not fail on a URL-shaped string constant inside a third-party chunk we do not reference from our own HTML', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml(),
			'THIRD-PARTY-NOTICES.txt': 'Licensed under the Apache License, Version 2.0\nhttp://www.apache.org/licenses/LICENSE-2.0',
			'LICENSE.txt': 'GNU GENERAL PUBLIC LICENSE Version 3...',
			'assets/dragonwar.glb': 'glTF-binary-placeholder',
			'assets/dragonwar.collision.json': '{}',
			'assets/main.js': 'class Animation { }\nAnimation.SnippetUrl = "https://snippet.babylonjs.com";',
		});
		const { status } = runCheckDist(dir);
		expect(status).toBe(0);
	});
});

describe('tools/check-dist.mjs -- no service worker', () => {
	it('exits non-zero naming a sw.js file', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml(),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'assets/main.js': '1',
			'sw.js': 'self.addEventListener("install", () => {});',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/service worker/);
	});

	it('exits non-zero when a chunk registers a service worker', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml(),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'assets/main.js': 'navigator.serviceWorker.register("/sw.js");',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/serviceWorker\.register/);
	});
});

describe('tools/check-dist.mjs -- THIRD-PARTY-NOTICES.txt present and linked', () => {
	it('exits non-zero when the notices file is missing', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml(),
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/THIRD-PARTY-NOTICES\.txt is missing/);
	});

	it('exits non-zero when the notices file exists but is not linked from index.html', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml().replace('<a href="./THIRD-PARTY-NOTICES.txt">notices</a>', ''),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'LICENSE.txt': 'GNU GENERAL PUBLIC LICENSE Version 3...',
			'assets/dragonwar.glb': 'glb',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/does not link to THIRD-PARTY-NOTICES\.txt/);
	});
});

describe('tools/check-dist.mjs -- every emitted .html page, not just index.html', () => {
	it('checks a second HTML page (the Spike 1 harness) for the CSP tag too', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml(),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'assets/main.js': '1',
			'tools/spike-1/index.html': '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/tools\/spike-1\/index\.html: missing the Content-Security-Policy/);
	});
});

// --- Review 2026-08-28: the distribution's own licence obligations, the
// runtime-fetched asset, and emitted stylesheets were all ungated. ---

describe('tools/check-dist.mjs -- LICENSE.txt present and linked (GPL-3.0 sections 4-6)', () => {
	it('exits non-zero when the licence text is missing from the build', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml(),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'assets/dragonwar.glb': 'glb',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/LICENSE\.txt is missing/);
		expect(stderr).toMatch(/GPL-3\.0/);
	});

	it('exits non-zero when the licence ships but is not linked from index.html', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml().replace('<a href="./LICENSE.txt">licence</a>', ''),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'LICENSE.txt': 'GNU GENERAL PUBLIC LICENSE Version 3...',
			'assets/dragonwar.glb': 'glb',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/does not link to LICENSE\.txt/);
	});
});

describe('tools/check-dist.mjs -- the glb the page fetches at runtime is in the build', () => {
	it('exits non-zero when dist/assets/dragonwar.glb is absent', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml(),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'LICENSE.txt': 'GNU GENERAL PUBLIC LICENSE Version 3...',
			'assets/dragonwar.collision.json': '{}',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/dragonwar\.glb is missing/);
		expect(stderr).toMatch(/boot/);
	});
});

// Story 1.4 -- the second pipeline artifact this build must carry
// (dragonwar.collision.json), gated the same way as the glb above -- not yet
// a live boot-time fetch (src/sim/physics/loader is only called from tests
// today; Story 1.5 owns the real host-side fetch), but still a required
// pipeline artifact worth failing the build over.
describe('tools/check-dist.mjs -- the collision doc, a required pipeline artifact, is in the build', () => {
	it('exits non-zero when dist/assets/dragonwar.collision.json is absent', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml(),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'LICENSE.txt': 'GNU GENERAL PUBLIC LICENSE Version 3...',
			'assets/dragonwar.glb': 'glb',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/dragonwar\.collision\.json is missing/);
		expect(stderr).toMatch(/pipeline artifact/);
	});
});

describe('tools/check-dist.mjs -- emitted stylesheets are scanned too', () => {
	it('exits non-zero on a root-relative url() in an emitted stylesheet', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml(),
			'styles.css': 'body { background: url(/assets/bg.png); }',
			'THIRD-PARTY-NOTICES.txt': 'x',
			'LICENSE.txt': 'GNU GENERAL PUBLIC LICENSE Version 3...',
			'assets/dragonwar.glb': 'glb',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/root-relative reference "\/assets\/bg\.png" in an emitted stylesheet/);
	});

	it('exits non-zero on an external-origin url() in an emitted stylesheet', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml(),
			'styles.css': "@font-face { src: url('https://fonts.example.com/x.woff2'); }",
			'THIRD-PARTY-NOTICES.txt': 'x',
			'LICENSE.txt': 'GNU GENERAL PUBLIC LICENSE Version 3...',
			'assets/dragonwar.glb': 'glb',
			'assets/main.js': '1',
		});
		const { status, stderr } = runCheckDist(dir);
		expect(status).toBe(1);
		expect(stderr).toMatch(/external origin "https:\/\/fonts\.example\.com\/x\.woff2" in an emitted stylesheet/);
	});

	it('accepts a relative url() and an inline data: URI in a stylesheet', () => {
		const dir = makeFixture({
			'index.html': validIndexHtml(),
			'styles.css': 'body { background: url("./bg.png"); cursor: url(data:image/png;base64,AAA), auto; }',
			'THIRD-PARTY-NOTICES.txt': 'x',
			'LICENSE.txt': 'GNU GENERAL PUBLIC LICENSE Version 3...',
			'assets/dragonwar.glb': 'glb',
			'assets/dragonwar.collision.json': '{}',
			'assets/main.js': '1',
		});
		const { status } = runCheckDist(dir);
		expect(status).toBe(0);
	});
});

// Story 1.3, AR-34 -- the commit-SHA stamp assertion (this story's own
// Acceptance Criterion: "Given a build made with VITE_BUILD_SHA set, when
// pnpm check:dist runs, then it asserts the stamped SHA is present in the
// emitted bundle"). checkBuildShaStamp() had no fixture-driven test of its
// own before this -- only a real `pnpm build` + `pnpm check:dist` manual run
// exercised it, unlike every other invariant in this file.
describe('tools/check-dist.mjs -- the commit-SHA stamp (VITE_BUILD_SHA)', () => {
	function distWithMainJs(mainJsContent: string): string {
		return makeFixture({
			'index.html': validIndexHtml(),
			'THIRD-PARTY-NOTICES.txt': 'x',
			'LICENSE.txt': 'GNU GENERAL PUBLIC LICENSE Version 3...',
			'assets/dragonwar.glb': 'glb',
			'assets/dragonwar.collision.json': '{}',
			'assets/main.js': mainJsContent,
		});
	}

	it('exits 0 when VITE_BUILD_SHA is set and an emitted .js file contains it', () => {
		const dir = distWithMainJs('console.log("build deadbeef1234cafe");');
		const { status, stdout } = runCheckDist(dir, { VITE_BUILD_SHA: 'deadbeef1234cafe' });
		expect(status).toBe(0);
		expect(stdout).toMatch(/OK/);
	});

	it('exits non-zero naming the SHA when it was set but no emitted .js file contains it', () => {
		const dir = distWithMainJs('console.log("no stamp here");');
		const { status, stderr } = runCheckDist(dir, { VITE_BUILD_SHA: 'deadbeef1234cafe' });
		expect(status).toBe(1);
		expect(stderr).toContain('VITE_BUILD_SHA="deadbeef1234cafe" was set but no emitted .js file');
		expect(stderr).toMatch(/did not reach the bundle/);
	});

	it('is a no-op (exits 0) when VITE_BUILD_SHA is unset, even though no .js file carries any SHA', () => {
		const dir = distWithMainJs('console.log("no stamp here");');
		const { status } = runCheckDist(dir, { VITE_BUILD_SHA: '' });
		expect(status).toBe(0);
	});
});
