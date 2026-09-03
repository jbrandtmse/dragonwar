// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1b task 21 (DW-65): the hoisted, PARSE-ONCE form of the
// `nodeBboxMm()` helper `test/drain-routing.test.ts:56-63` invented --
// re-reading and re-JSON.parse-ing `dragonwar.collision.json` on every call
// is cheap for one call, but this story gives the helper four consumers
// (`drain-routing`, `machine-serve-drain`, and the new `shot-routing` and
// `switch-max-speed`), several of which call it inside tight per-tick sweep
// loops -- `vitest.config.ts`'s `testTimeout` is 60 s PER CASE, and a sweep
// bound of up to 8000 ticks per case makes the re-parse cost add up for no
// reason. Parsed once, on first use, and cached for the life of the test
// process; every caller gets the SAME frozen document.
//
// `test/util/` did not exist before this story -- created here.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const COLLISION_PATH = path.resolve(__dirname, '..', '..', 'public', 'assets', 'dragonwar.collision.json');

interface BBoxMm {
	readonly min: { readonly x: number; readonly y: number; readonly z: number };
	readonly max: { readonly x: number; readonly y: number; readonly z: number };
}

interface CollisionNodeForTest {
	readonly name: string;
	readonly shape: 'plane' | 'wall' | 'box';
	readonly bboxMm: BBoxMm;
	/** Wall-shaped nodes only (export.py's own footprint contract) -- the plan-view polygon a `col_` body's collision footprint is extruded from. Absent on `box` (the flippers) and `plane` (`col_playfield`/`col_glass`) nodes. Story 2.1c task 2: `assertReleaseClear()`'s own polygon-distance check reads this directly, rather than approximating every body as its bbox rectangle. */
	readonly footprintMm?: readonly { readonly x: number; readonly y: number }[];
}

interface SwitchZoneForTest {
	readonly name: string;
	readonly switch: string;
	readonly minMm: { readonly x: number; readonly y: number; readonly z: number };
	readonly maxMm: { readonly x: number; readonly y: number; readonly z: number };
}

interface CollisionDocForTest {
	readonly nodes: readonly CollisionNodeForTest[];
	readonly switchZones: readonly SwitchZoneForTest[];
}

let cachedDoc: CollisionDocForTest | null = null;

/**
 * Recursively freezes the parsed document. Code review 2026-09-02: the doc
 * comment below promised every caller "the SAME frozen document", but
 * nothing froze it -- the `readonly` modifiers on the interfaces above are
 * TypeScript-only and erased at runtime, so one consumer mutating a node's
 * `bboxMm` would silently change the geometry every later test in the same
 * vitest worker reads. Freezing makes the promise real rather than
 * aspirational.
 */
function deepFreezeDoc<T>(value: T): T {
	if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const key of Object.keys(value as Record<string, unknown>)) {
			deepFreezeDoc((value as Record<string, unknown>)[key]);
		}
	}
	return value;
}

/** The committed `dragonwar.collision.json`, parsed once, deep-frozen and cached -- every caller shares the same frozen object, so no consumer can mutate the geometry out from under another. */
export function readCollisionDoc(): CollisionDocForTest {
	if (!cachedDoc) {
		cachedDoc = deepFreezeDoc(JSON.parse(readFileSync(COLLISION_PATH, 'utf8')) as CollisionDocForTest);
	}
	return cachedDoc;
}

/** A named `col_` node's `bboxMm`, from the cached document. Throws naming the node if it is missing -- the same named-throw behaviour `test/drain-routing.test.ts`'s original per-call helper had. */
export function nodeBboxMm(name: string): BBoxMm {
	const node = readCollisionDoc().nodes.find((n) => n.name === name);
	if (!node) {
		throw new Error(`nodeBboxMm(): expected a "${name}" node in the committed collision document, found none`);
	}
	return node.bboxMm;
}

/** A named `sw_` switch zone's `{minMm, maxMm}`, from the cached document. Throws naming the zone if it is missing. */
export function switchZoneMm(name: string): { readonly minMm: BBoxMm['min']; readonly maxMm: BBoxMm['max'] } {
	const zone = readCollisionDoc().switchZones.find((z) => z.name === name);
	if (!zone) {
		throw new Error(`switchZoneMm(): expected a "${name}" switch zone in the committed collision document, found none`);
	}
	return { minMm: zone.minMm, maxMm: zone.maxMm };
}
