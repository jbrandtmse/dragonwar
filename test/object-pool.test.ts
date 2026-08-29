// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8's sweep (DW-6, ledger; Code Map Part D items 2 and 7): before
// this file, `src/sim/physics/util/object-pool.ts` had ZERO references
// anywhere in `test/**` -- it is reachable transitively (imported by
// `sim/physics/ball/ball-hit.ts` for its pooled `Vertex3D` allocations,
// itself reached by every physics test), but nothing ever drove or asserted
// its own load-bearing exhaustion branch (`release()`'s `pool.length >=
// MAX_POOL_SIZE` guard, marked `/* istanbul ignore next: not supposed to
// happen! */` in the ported source -- exactly the "not supposed to happen"
// path a real pool exhaustion (a leak, or MAX_POOL_SIZE=100 genuinely
// undersized for a burst) needs to be OBSERVABLE, not merely assumed dead).
// `warned`/`skipped` are surfaced as two new read-only accessors (this
// story's own deviation note in object-pool.ts's header) -- no ported
// LOGIC changed, only two counters the file already computed made visible.
//
// Drives the class directly (unit-level, no collision document / real
// physics needed): `Pool<T>` only needs an `IPoolable<T>` -- a bare
// constructor, optionally a static `reset()`.

import { describe, expect, it } from 'vitest';
import { Pool } from '../src/sim/physics/util/object-pool';

/** A minimal `IPoolable<T>` -- a plain, zero-argument constructor, matching every real caller's own usage (e.g. `sim/physics/ball/ball-hit.ts`'s `Vertex3D` pool). */
class Widget {
	value = 0;
}

const MAX_POOL_SIZE = 100; // Pool's own private static -- mirrored here since it is not exported (DW-6's task: drive "more than MAX_POOL_SIZE releases").

describe('src/sim/physics/util/object-pool.ts -- DW-6: warned/skipped start at their defaults', () => {
	it('a fresh pool reports skipped 0 and warned false', () => {
		const pool = new Pool<Widget>(Widget);
		expect(pool.skipped).toBe(0);
		expect(pool.warned).toBe(false);
	});
});

describe('src/sim/physics/util/object-pool.ts -- DW-6: releasing a non-claimed object increments skipped without touching warned', () => {
	it('an object never obtained via get() (no __pool marker) is dropped by release(), incrementing skipped only', () => {
		const pool = new Pool<Widget>(Widget);
		const foreign = new Widget(); // constructed directly, never claimed from the pool
		pool.release(foreign);
		expect(pool.skipped).toBe(1);
		expect(pool.warned, 'this branch is the OTHER drop reason (an unclaimed release) -- it must not set warned, which is exhaustion-specific').toBe(false);
	});
});

describe('src/sim/physics/util/object-pool.ts -- DW-6: more than MAX_POOL_SIZE releases drives the exhaustion branch (the ":88-92" guard) to non-default values', () => {
	it(`releasing ${MAX_POOL_SIZE + 1} pool-claimed objects fills the pool to MAX_POOL_SIZE and drops the (MAX_POOL_SIZE + 1)th, setting warned=true and skipped>0`, () => {
		const pool = new Pool<Widget>(Widget);
		const claimed: Widget[] = [];
		for (let i = 0; i < MAX_POOL_SIZE + 1; i++) {
			claimed.push(pool.get());
		}
		expect(pool.skipped, 'sanity: nothing has been released yet').toBe(0);
		expect(pool.warned, 'sanity: nothing has been released yet').toBe(false);

		for (const obj of claimed) {
			pool.release(obj);
		}

		// The first MAX_POOL_SIZE releases fill the internal array exactly to
		// MAX_POOL_SIZE; the (MAX_POOL_SIZE + 1)th release finds
		// `pool.length >= MAX_POOL_SIZE` already true and is dropped -- the
		// exhaustion branch, previously reachable but never actually driven by
		// any test in this repository.
		expect(pool.skipped, 'exactly one release must have been dropped by pool exhaustion').toBe(1);
		expect(pool.warned, 'the exhaustion branch must have set warned to true -- a non-default value, unlike every prior assertion on this class').toBe(true);
	});

	it('draining the pool back to empty and then getting ONE MORE clears warned back to false (the ported "recovered" signal only fires once the pool is fully recycled, not on the first get() back) -- skipped stays a monotonic count throughout', () => {
		const pool = new Pool<Widget>(Widget);
		const claimed: Widget[] = [];
		for (let i = 0; i < MAX_POOL_SIZE + 1; i++) {
			claimed.push(pool.get());
		}
		for (const obj of claimed) {
			pool.release(obj);
		}
		expect(pool.warned).toBe(true); // pool.length is now exactly MAX_POOL_SIZE (100 pooled objects)

		// The ported guard only resets `warned_` inside the "construct new"
		// branch (`pool.length === 0`), never on a plain recycle -- so the
		// FIRST `MAX_POOL_SIZE` get() calls here each recycle one pooled object
		// (pool.length counting 100 -> 0) and leave `warned` untouched.
		for (let i = 0; i < MAX_POOL_SIZE; i++) {
			pool.get();
		}
		expect(pool.warned, 'recycling the pool back to empty must not, by itself, clear warned -- only a fresh construct() does').toBe(true);

		pool.get(); // pool.length is now 0 -- this ONE call takes the construct branch and clears warned_
		expect(pool.warned, 'the first get() to actually construct a new instance (pool.length === 0) clears warned').toBe(false);
		expect(pool.skipped, 'skipped is a running count, never reset by get()').toBe(1);
	});
});
