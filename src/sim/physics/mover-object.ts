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
// Source: lib/physics/mover-object.ts
// Note: the upstream file at this path carried no licence header of its own; the
// canonical vpx-js GPL-2.0-or-later header above (copied unchanged from
// lib/physics/hit-object.ts) is attached per CLAUDE.md's provenance rule, since the
// licence for this file was established from the repository's other header-bearing
// source files rather than from the file itself. See ATTRIBUTIONS.md and the
// deviation list in docs/spikes/spike-1.md.

/**
 * Spinner, Gate, Flipper, Plunger and Ball
 */
import { PlayerPhysics } from './game/player-physics';

export interface MoverObject {

	updateDisplacements(dTime: number): void;

	updateVelocities(physics: PlayerPhysics): void;
}
