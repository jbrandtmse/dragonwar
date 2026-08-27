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
// Source: lib/math/vertex2d.ts
//
// Deviation: dropped the `RenderVertex` subclass (mesh authoring only, out of scope)
// and the buffer-reading `get()` static (VPX binary file loading, out of scope) and
// the commented-out `setTimeout(() => Vertex2D.POOL.enableDebug(...), ...)` debug line
// upstream left at the bottom of this file — the literal token is banned under sim/
// (AD-16) even though it was already dead/commented-out code.

/* tslint:disable:variable-name adjacent-overload-signatures */
import { Pool } from '../util/object-pool';
import { f4 } from './float';
import { Vertex } from './vertex';

export class Vertex2D implements Vertex {

	public static readonly POOL = new Pool(Vertex2D);

	public readonly isVector2 = true;
	public readonly isVector3 = false;

	set x(_x: number) { this._x = f4(_x); }
	set y(_y: number) { this._y = f4(_y); }

	get x() { return this._x; }
	get y() { return this._y; }

	private _x!: number;
	private _y!: number;

	constructor(x?: number, y?: number) {
		this.x = x || 0;
		this.y = y || 0;
	}

	public static claim(x?: number, y?: number): Vertex2D {
		return Vertex2D.POOL.get().set(x || 0, y || 0);
	}

	public static release(...vertices: Vertex2D[]) {
		for (const vertex of vertices) {
			Vertex2D.POOL.release(vertex);
		}
	}

	public static reset(v: Vertex2D): void {
		v.set(0, 0);
	}

	public set(x: number, y: number): this {
		this.x = x;
		this.y = y;
		return this;
	}

	public setZero(): this {
		return this.set(0, 0);
	}

	public clone(recycle = false): Vertex2D {
		if (recycle) {
			return Vertex2D.POOL.get().set(this._x, this._y);
		}
		return new Vertex2D(this._x, this._y);
	}

	public add(v: Vertex2D): this {
		this.x += v.x;
		this.y += v.y;
		return this;
	}

	public addAndRelease(v: Vertex2D): this {
		this.add(v);
		Vertex2D.release(v);
		return this;
	}

	public sub(v: Vertex2D): this {
		this.x -= v.x;
		this.y -= v.y;
		return this;
	}

	public subAndRelease(v: Vertex2D): this {
		this.sub(v);
		Vertex2D.release(v);
		return this;
	}

	public normalize(): this {
		return this.divideScalar(this.length() || 1 );
	}

	public divideScalar(scalar: number): this {
		return this.multiplyScalar(f4(1 / scalar));
	}

	public multiplyScalar(scalar: number): this {
		this.x *= f4(scalar);
		this.y *= f4(scalar);
		return this;
	}

	public length(): number {
		return f4(Math.sqrt( f4(f4(this.x * this.x) + f4(this.y * this.y))));
	}

	public lengthSq() {
		return this.x * this.x + this.y * this.y;
	}

	public dot(pv: Vertex2D) {
		return this.x * pv.x + this.y * pv.y;
	}

	public equals(v?: Vertex2D): boolean {
		if (!v) {
			return false;
		}
		return this.x === v.x && this.y === v.y;
	}
}
