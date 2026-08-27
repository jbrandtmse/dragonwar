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
// Source: lib/game/event-proxy.ts
//
// Deviation: upstream's `EventProxy` holds an `IPlayable` and, on `fireGroupEvent()`,
// dispatches into a `BallApi`/`IScriptable` event emitter (VPX's scripting system,
// out of scope per AD-1). DragonWar has its own event model
// (`SwitchEvent`/`ContactEvent`, `sim/loop` + `sim/rules`, Story 1.3) that will
// eventually own this seam. This story's harness never sets `obj` on a `HitObject`
// (no switches, triggers or kickers in the spike scene), so `fireGroupEvent()` is a
// no-op seam here — kept as a real method (not deleted) because `HitObject`,
// `BallHit`, and `HitQuadtree` all reference the `EventProxy` type structurally.
// TODO(story-1.3): replace this no-op with a bridge into `SwitchEvent`/`ContactEvent`
// emission once the seam contracts exist.

import { HitObject } from '../hit-object';
import { Ball } from '../ball/ball';
import { Event } from './event';

export class EventProxy {

	/**
	 * while playing and the ball hits the mesh the hit threshold is updated here
	 */
	public currentHitThreshold: number = 0;
	public singleEvents: boolean = true;
	public readonly eventCollection: EventProxy[] = [];
	public readonly eventCollectionItemPos: number[] = [];

	/**
	 * Logic executed on collision.
	 *
	 * This replaces the dreaded object casts in VP where the hit logic must
	 * be aware of the underlying object.
	 */
	public onCollision?: (obj: HitObject, ball: Ball, dot: number) => void;

	/**
	 * If implemented and false is returned, the hit test is skipped.
	 */
	public abortHitTest?: () => boolean;

	// TODO(story-1.3): no-op seam — see the deviation note above.
	public fireGroupEvent(_e: Event): void {
		// intentionally empty
	}
}
