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
// Source: lib/vpt/ball/ball-data.ts
//
// Deviation: upstream's `BallData extends ItemData`, which extends `BiffParser`
// (`lib/vpt/item-data.ts`, `lib/io/biff-parser.ts`) — the VPX binary table-file
// parser, entirely out of scope per AD-1. `ItemData`'s own behaviour (parsing named
// BIFF blocks out of a `.vpx` file) is never used by `BallData`, so the inheritance
// is dropped. Also dropped are the rendering-only fields (`color`, `environmentMap`,
// `frontDecal`, `decalMode`, `isReflectionEnabled`, `playfieldReflectionStrength`,
// `forceReflection`) — nothing in the physics closure reads them, since Ball's
// render path (`getMeshes()`) is not ported (AD-1: presentation is out of scope
// here). See docs/spikes/spike-1.md for the full deviation list.

export class BallData {

	public radius: number;
	public mass: number;
	public bulbIntensityScale: number;

	constructor(radius: number = 25, mass: number = 1, bulbIntensityScale = 1) {
		this.radius = radius;
		this.mass = mass;
		this.bulbIntensityScale = bulbIntensityScale;
	}
}
