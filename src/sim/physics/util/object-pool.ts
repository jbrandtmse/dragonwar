/*
 * VPDB - Virtual Pinball Database
 * Copyright (C) 2019 freezy <freezy@vpdb.io>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */
// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0
// Source: lib/util/object-pool.ts
//
// Deviations:
//  - Dropped the opt-in debug/tracing path (`enableDebug()`, `setupDebug()`,
//    the `logger` import from `lib/util/logger.ts`, and the per-caller claim/unclaim
//    bookkeeping). It is tooling nothing in this story's harness turns on, its own
//    import chain is out of scope (AD-1), and `setupDebug()` drives its stats print
//    via `setInterval`, a literal token banned under `sim/` by AD-16 even though this
//    path is dead by default (`Pool.DEBUG = 0`). The load-bearing behaviour — `get()`
//    recycling an instance from the pool or constructing one, and `release()`
//    resetting and returning it — is kept verbatim; this is the object pool the
//    Design Notes call out as load-bearing for the frame budget (`ball-hit.ts`'s
//    `Vertex3D` pool).
//  - Dropped the `logger().warn(...)` calls on the "release a non-claimed object"
//    and "pool exhausted" paths (both kept, both still silently no-op exactly as
//    upstream's behaviour does). Upstream's own collision code — verbatim here too —
//    releases a `CollisionEvent`'s `hitNormal` (a plain, never-pool-claimed
//    `Vertex3D` field, see `collision-event.ts`) at the end of every collision;
//    this is expected, harmless, and fires on the hot path every tick. Upstream's
//    `logger()` is silent by default in its own test suite, so this is a like-for-
//    like port of the *effective* behaviour, not a new suppression — a bare
//    `console.warn` here would instead newly pollute every measurement in this
//    story with I/O noise it never had upstream.

export class Pool<T> {

	private static MAX_POOL_SIZE = 100;

	private readonly pool: T[];
	private readonly poolable: IPoolable<T>;
	private warned = false;

	private recycled = 0;
	private created = 0;
	private released = 0;
	private skipped = 0;

	constructor(poolable: IPoolable<T>) {
		this.pool = [];
		this.poolable = poolable;
	}

	public get(): T {
		let obj: any;

		if (this.pool.length) {                                      // something left in pool?
			this.recycled++;
			obj = this.pool.splice(0, 1)[0];

		} else {                                                     // if not, instantiate.
			if (this.pool.length < Pool.MAX_POOL_SIZE) {
				this.warned = false;
			}
			this.created++;
			obj = new this.poolable() as any;
		}

		obj.__pool = true;
		return obj;
	}

	public release(o: T): void {
		const obj = o as any;
		if (!obj.__pool) {
			this.skipped++;
			return;
		}
		/* istanbul ignore next: not supposed to happen! */
		if (this.pool.length >= Pool.MAX_POOL_SIZE) {
			this.warned = true;
			this.skipped++;
			return;
		}
		if (this.poolable.reset) {
			this.poolable.reset(o);
		}
		this.released++;
		this.pool.push(o);
	}
}

export interface IPoolable<T> {

	// constructor
	new(): T;

	// static
	reset?(obj: T): void;
}
