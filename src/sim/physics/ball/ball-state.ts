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
// Source: lib/vpt/ball/ball-state.ts
//
// Deviation: dropped `extends ItemState` (`lib/vpt/item-state.ts`) and the
// `Pool<BallState>`-based `claim()`/`release()`/`clone()`/`diff()`/`equals()`
// lifecycle. That machinery exists upstream for VPX's live-editing/replication
// system (snapshotting many transient BallState copies per frame); this story's
// harness constructs each ball's state exactly once at scene setup, not per tick, so
// pooling the state object itself buys nothing (the hot-path pooling that IS
// load-bearing — Vertex3D/Vertex2D/Matrix2D/CollisionEvent inside the collision
// math — is preserved verbatim). See docs/spikes/spike-1.md for the full deviation
// list.

import { Matrix2D } from '../math/matrix2d';
import { Vertex3D } from '../math/vertex3d';

/**
 * The dynamic ball state.
 *
 * This is the data we need to properly position the ball on the playfield.
 */
export class BallState {

	public name: string;
	public pos: Vertex3D = new Vertex3D();
	public orientation = new Matrix2D();
	public isFrozen: boolean = false;

	constructor(name: string, pos: Vertex3D) {
		this.name = name;
		this.pos.set(pos);
	}
}
