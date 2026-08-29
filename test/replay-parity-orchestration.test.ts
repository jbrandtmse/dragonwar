// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8 QA pass -- AC 5's own I/O & Edge-Case Matrix row: "Page reports
// per-golden PASS/FAIL, never a silent skip." test/replay-parity-logic.test.ts
// already unit-tests judgeGoldenResult() and the URL-routing regexes in
// isolation; this file exercises runReplayParity() ITSELF -- the
// orchestration loop that fetches every golden, replays each through the
// SAME src/sim/loop/replay.ts module the Node runner uses, and assembles the
// PASS/FAIL report -- against a stubbed global fetch(), entirely in Node (no
// live browser, no DOM: the module's own `typeof document`/`typeof window`
// guards make importing it in Node safe, following
// test/spike-1-browser-guard.test.ts's precedent of stubbing a global
// directly with a save/restore pair rather than a mocking library).
//
// The risk this file targets (spec Design Notes, "tools/replay-parity/"):
// a parity page that silently reports FEWER results than goldens exist --
// e.g. a golden whose fetch or replay throws being dropped from the report
// entirely, rather than surfacing as a named FAIL -- would let a real
// cross-engine divergence (or a page that never actually ran anything) pass
// unnoticed at the merge gate. So this drives one golden through a REAL,
// successful runReplay() call (a genuine PASS against the real
// roll-and-drain golden and the real collision document -- not a canned
// string) and a second through a REAL thrown StaleReplayHeaderError
// (a deliberately staled tableHash) or a REAL fetch failure, and asserts
// BOTH still appear in the returned report array.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runReplayParity } from '../tools/replay-parity/browser';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const REPLAYS_DIR = path.resolve(__dirname, 'replays');

function loadCollisionDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function loadGoldenRaw(name: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path.join(REPLAYS_DIR, `${name}.golden.json`), 'utf8')) as Record<string, unknown>;
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		statusText: ok ? 'OK' : 'Not Found',
		json: async () => body,
	} as Response;
}

const ORIGINAL_FETCH = globalThis.fetch;

/** Stubs `globalThis.fetch` with a URL-keyed route table. Returns a restore function; `afterEach` below is a backstop in case a test throws before calling it. */
function installFakeFetch(routes: ReadonlyMap<string, () => Response>): () => void {
	globalThis.fetch = (async (url: string) => {
		const handler = routes.get(url);
		if (!handler) {
			throw new Error(`installFakeFetch: no route stubbed for ${url}`);
		}
		return handler();
	}) as typeof fetch;
	return () => {
		globalThis.fetch = ORIGINAL_FETCH;
	};
}

describe('tools/replay-parity/browser.ts -- runReplayParity() orchestration (AC 5: never a silent skip)', () => {
	afterEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	it('a genuinely passing golden and a genuinely throwing golden BOTH appear in the report -- the failure is never silently dropped', async () => {
		const collisionDoc = loadCollisionDoc();
		const goodGolden = loadGoldenRaw('roll-and-drain');
		const goodHeader = goodGolden.header as Record<string, unknown>;
		const badGolden = { ...goodGolden, header: { ...goodHeader, tableHash: 'deliberately-stale-for-this-test' } };

		const restore = installFakeFetch(new Map<string, () => Response>([
			['/dragonwar-goldens/index.json', () => jsonResponse(['good-one', 'bad-one'])],
			['/dragonwar-goldens/good-one.golden.json', () => jsonResponse(goodGolden)],
			['/dragonwar-goldens/bad-one.golden.json', () => jsonResponse(badGolden)],
			['/dragonwar-goldens/collision.json', () => jsonResponse(collisionDoc)],
		]));

		try {
			const reports = await runReplayParity();
			expect(reports, 'both goldens must appear in the report, not just the passing one').toHaveLength(2);

			const good = reports.find((r) => r.name === 'good-one');
			const bad = reports.find((r) => r.name === 'bad-one');
			expect(good, 'the passing golden must be present').toBeDefined();
			expect(bad, 'the failing golden must be present -- NOT silently dropped').toBeDefined();

			expect(good!.pass, 'the genuinely valid, unmodified golden must genuinely PASS -- a real runReplay() call against the real roll-and-drain golden, not a canned result').toBe(true);
			expect(bad!.pass, 'a golden whose header no longer matches the live environment must report FAIL, not be silently omitted').toBe(false);
			expect(bad!.detail, 'the FAIL detail must name what went wrong').toContain('tableHash');
		} finally {
			restore();
		}
	});

	it('an empty golden index throws rather than silently reporting zero results as a clean run', async () => {
		const restore = installFakeFetch(new Map<string, () => Response>([
			['/dragonwar-goldens/index.json', () => jsonResponse([])],
		]));
		try {
			await expect(runReplayParity()).rejects.toThrow(/no goldens found/i);
		} finally {
			restore();
		}
	});

	it('a golden whose OWN fetch fails (404) is reported as FAIL naming the fetch failure -- not dropped, and it does not crash a sibling golden\'s real run', async () => {
		const collisionDoc = loadCollisionDoc();
		const goodGolden = loadGoldenRaw('roll-and-drain');
		const restore = installFakeFetch(new Map<string, () => Response>([
			['/dragonwar-goldens/index.json', () => jsonResponse(['missing-one', 'good-one'])],
			['/dragonwar-goldens/missing-one.golden.json', () => jsonResponse(null, false, 404)],
			['/dragonwar-goldens/good-one.golden.json', () => jsonResponse(goodGolden)],
			['/dragonwar-goldens/collision.json', () => jsonResponse(collisionDoc)],
		]));
		try {
			const reports = await runReplayParity();
			expect(reports, 'the goldens that COULD fetch must not be swallowed by a sibling\'s 404').toHaveLength(2);

			const missing = reports.find((r) => r.name === 'missing-one');
			const good = reports.find((r) => r.name === 'good-one');
			expect(missing, 'the golden whose fetch failed must still be present in the report').toBeDefined();
			expect(missing!.pass).toBe(false);
			expect(missing!.detail, 'the failure detail must name the HTTP status').toContain('404');
			expect(good!.pass, 'one golden failing to fetch must not take down a sibling golden\'s own real, independent run').toBe(true);
		} finally {
			restore();
		}
	});
});
