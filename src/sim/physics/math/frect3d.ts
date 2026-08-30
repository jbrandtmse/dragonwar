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
// Source: lib/math/frect3d.ts
// Note: the upstream file at this path carried no licence header of its own; the
// canonical vpx-js GPL-2.0-or-later header above (copied unchanged from
// lib/physics/hit-object.ts) is attached per CLAUDE.md's provenance rule, since the
// licence for this file was established from the repository's other header-bearing
// source files rather than from the file itself. See ATTRIBUTIONS.md and the
// deviation list in docs/spikes/spike-1.md.
//
// Deviation: `FLT_MAX` came from upstream's `lib/vpt/mesh.ts` (out of scope, AD-1);
// relocated to our own `constants.ts`.

import { FLT_MAX } from '../constants';
import { Vertex3D } from './vertex3d';

export class FRect3D {

	public left: number = 0;
	public top: number = 0;
	public right: number = 0;
	public bottom: number = 0;
	public zlow: number = 0;
	public zhigh: number = 0;

	get width() { return Math.abs(this.left - this.right); }
	get height() { return Math.abs(this.top - this.bottom); }
	get depth() { return Math.abs(this.zlow - this.zhigh); }

	constructor(left?: number, right?: number, top?: number, bottom?: number, zLow?: number, zHigh?: number) {
		if (left !== undefined && right !== undefined && top !== undefined && bottom !== undefined  && zLow !== undefined  && zHigh !== undefined ) {
			this.left = left;
			this.right = right;
			this.top = top;
			this.bottom = bottom;
			this.zlow = zLow;
			this.zhigh = zHigh;
		} else {
			this.Clear();
		}
	}

	public Clear(): void {
		this.left = FLT_MAX;
		this.right = -FLT_MAX;
		this.top = FLT_MAX;
		this.bottom = -FLT_MAX;
		this.zlow = FLT_MAX;
		this.zhigh = -FLT_MAX;
	}

	public extend(other: FRect3D): void {
		this.left = Math.min(this.left, other.left);
		this.right = Math.max(this.right, other.right);
		this.top = Math.min(this.top, other.top);
		this.bottom = Math.max(this.bottom, other.bottom);
		this.zlow = Math.min(this.zlow, other.zlow);
		this.zhigh = Math.max(this.zhigh, other.zhigh);
	}

	public intersectSphere(sphereP: Vertex3D, sphereRsqr: number): boolean {
		let ex = Math.max(this.left - sphereP.x, 0) + Math.max(sphereP.x - this.right, 0);
		let ey = Math.max(this.top - sphereP.y, 0) + Math.max(sphereP.y - this.bottom, 0);
		let ez = Math.max(this.zlow - sphereP.z, 0) + Math.max(sphereP.z - this.zhigh, 0);
		ex *= ex;
		ey *= ey;
		ez *= ez;
		return ex + ey + ez <= sphereRsqr;
	}

	public intersectRect(rc: FRect3D): boolean {
		return this.right >= rc.left
			&& this.bottom >= rc.top
			&& this.left <= rc.right
			&& this.top <= rc.bottom
			&& this.zlow <= rc.zhigh
			&& this.zhigh >= rc.zlow;
	}
}
