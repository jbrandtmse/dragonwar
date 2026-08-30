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
// Source: lib/vpt/ball/ball.ts
//
// Deviation: upstream's `Ball implements IPlayable, IMovable, IRenderable<BallState>,
// IScriptable<BallApi>` and carries a mesh generator, an `EventProxy`, a `BallApi`
// (scripting) and a `BallUpdater`, plus `addToScene()`/`removeFromScene()`/
// `getMeshes()` (Babylon rendering) and `setupPlayer()`/`getApi()` (VPX scripting).
// None of that is in scope for a headless physics spike (AD-1: presentation and
// scripting are out of `sim/`); this story ports only the structural core other
// ported files actually touch — `id`, `data`, `state`, `hit`, the `coll` getter and
// `getMover()`. `oldVel` and `idCounter` are dropped too: nothing in the physics
// closure reads `oldVel` (it was written only by the unported `BallApi`), and the
// harness assigns each of its six balls an explicit id instead of using a shared
// counter. See docs/spikes/spike-1.md for the full deviation list.

import { BallData } from './ball-data';
import { BallHit, BallHitTableData } from './ball-hit';
import { BallMover } from './ball-mover';
import { BallState } from './ball-state';
import { Vertex3D } from '../math/vertex3d';

export class Ball {

	public readonly id: number;
	public readonly data: BallData;
	public readonly state: BallState;
	public readonly hit: BallHit;

	// public props
	get coll() { return this.hit.coll; }

	constructor(id: number, data: BallData, state: BallState, initialVelocity: Vertex3D, tableData: BallHitTableData) {
		this.id = id;
		this.data = data;
		this.state = state;
		this.hit = new BallHit(this, this.data, this.state, initialVelocity, tableData);
	}

	public getName(): string {
		return `Ball${this.id}`;
	}

	public getMover(): BallMover {
		return this.hit.getMoverObject();
	}
}
