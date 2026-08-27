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
// Source: lib/math/vertex.ts
//
// Deviation: upstream also exports `IRenderVertex`, `Vertex3DNoTex2`, `RenderVertex`
// and `RenderVertex3D` from this file (and from vertex2d.ts/vertex3d.ts) for mesh
// rendering and VPX binary-buffer loading. Nothing in the Story 1.1 physics closure
// uses them (rendering and file loading are out of scope, AD-1), so only the
// structural `Vertex` interface is ported. See docs/spikes/spike-1.md deviation list.

export interface Vertex {
	x: number;
	y: number;
	clone(): Vertex;
	sub(v: Vertex): this;
	length(): number;
}
