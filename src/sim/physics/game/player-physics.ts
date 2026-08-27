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
// Source: lib/game/player-physics.ts
//
// This is the story's central deviation, so the notes are longer than usual — see
// docs/spikes/spike-1.md for the complete, cross-referenced deviation list.
//
//  - Dropped `table: Table` and `pinInput: PinInput` entirely, and with them
//    `init()`, `indexTableElements()` and `initOcTree(table)` — all three walk a
//    vpx-js `Table` (`getMovables()`, `getHittables()`, `getScriptables()`,
//    `generatePlayfieldHit()`, `generateGlassHit()`, `getBoundingBox()`,
//    `.flippers`), the table/item-loading system that is out of scope per AD-1.
//    In its place, this file exposes `addBall()`, `addStaticHitObject()`,
//    `setPlayfieldHit()`, `setTopGlassHit()` and `finalizeStatics()` so a harness
//    (`tools/spike-1/scene.ts`) can populate the same fields directly; a later
//    story's table loader (Story 1.4's `sim/physics/loader`) is the natural next
//    caller of the same seam.
//  - Dropped `flipperMovers: FlipperMover[]` and the "find earliest time where a
//    flipper collides with its stop" loop at the top of `physicsSimulateCycle`'s
//    while-loop — flippers are `lib/vpt/flipper/`, explicitly out of scope for this
//    story (Story 1.6). The loop is a no-op with an empty flipper list in any case;
//    it is removed rather than kept as dead code because `FlipperMover` is not
//    ported and there is nothing to type the (permanently empty) array as.
//  - Dropped the timer system (`hitTimers: TimerHit[]`, `changedHitTimers:
//    TimerOnOff[]`, `MAX_TIMERS_MSEC_OVERALL`, `scriptPeriod`) and the emulator hook
//    (`emu?: IEmulator`) — both belong to the rules/scripting layer (Story 1.3+),
//    not the physics step itself, and neither is touched by `physicsSimulateCycle`.
//  - Dropped `updatePhysics(time?)`, its FPS bookkeeping (`cFrames`, `fps`,
//    `fpsAvg`, `fpsCount`, `lastFpsTime`), its frame-timing bookkeeping
//    (`curPhysicsFrameTime`, `nextPhysicsFrameTime`, `startTimeUsec`,
//    `lastTimeUsec`, `lastFrameDuration`, `physPeriod`, `minPhysLoopTime`,
//    `lastFlipTime`) and `now()`/`SLOW_MO` (`lib/refs.node`, a `performance.now()`
//    wrapper) — this is exactly the wall-clock surface AD-3 and CLAUDE.md ban
//    inside `sim/`. What upstream's `updatePhysics()` loop actually *does* per
//    physics tick — once its host-driven "how many ticks am I owed" bookkeeping is
//    stripped away — is `this.updateVelocities(); this.physicsSimulateCycle(physicsDiffTime);`
//    with `physicsDiffTime` always equal to `PHYS_FACTOR` at a steady `PHYSICS_STEPTIME`
//    cadence (both `curPhysicsFrameTime` and `nextPhysicsFrameTime` advance by exactly
//    `PHYSICS_STEPTIME` each iteration, so `(next - cur) * (1 / DEFAULT_STEPTIME)`
//    collapses to `PHYSICS_STEPTIME_S / DEFAULT_STEPTIME_S`, i.e. `PHYS_FACTOR`,
//    itself a verbatim solver constant). That is preserved below as `step()` — one
//    clock (the harness's tick loop, itself driven by `TICK_HZ`), one call.
//  - Dropped `createBall()`/`destroyBall()` (built on `IBallCreationPosition` and
//    `Player`, the vpx-js game/table item system) in favour of the simpler
//    `addBall(ball)` below, which does the same essential bookkeeping
//    (`balls`/`movers`/`hitObjectsDynamic`/`hitOcTreeDynamic`) without the
//    ball-creator abstraction. The harness never removes a ball, so `destroyBall()`
//    has no caller and is not ported.
//  - Replaced both `Math.random() < 0.5` calls inside `physicsSimulateCycle`
//    ("swap order of dynamic and static obj checks randomly" and "swap order of
//    contact handling randomly") with reads of `swapBallCollisionHandling` — a
//    boolean this method already flips exactly once per while-iteration for the
//    ball-ball collision order, so reusing it costs no new state and keeps a
//    replay byte-identical across runs (AD-3: no unseeded randomness in `sim/`).
//  - Dropped `isPaused` and `lastPlungerHit` — both are read only from
//    `updatePhysics()` (dropped above) or the manual-plunger hardware rule
//    (Story 1.6), never from `physicsSimulateCycle()` or anything this story ports.

import { degToRad } from '../math/float';
import { Vertex3D } from '../math/vertex3d';
import { CollisionEvent } from '../collision-event';
import { PHYS_FACTOR, STATICCNTS, STATICTIME } from '../constants';
import { HitKD } from '../hit-kd';
import { HitObject } from '../hit-object';
import { HitPlane } from '../hit-plane';
import { HitQuadtree } from '../hit-quadtree';
import { MoverObject } from '../mover-object';
import { Ball } from '../ball/ball';

export class PlayerPhysics {

	public readonly balls: Ball[] = [];
	public gravity = new Vertex3D();
	public timeMsec: number = 0;

	public recordContacts: boolean = false;
	public contacts: CollisionEvent[] = [];
	public activeBall?: Ball;
	public activeBallBC?: Ball;
	public swapBallCollisionHandling: boolean = false;
	public ballControl = false;
	public bcTarget?: Vertex3D;

	private readonly movers: MoverObject[] = [];

	private readonly hitObjects: HitObject[] = [];
	private readonly hitObjectsDynamic: HitObject[] = [];
	private hitPlayfield!: HitPlane; // HitPlanes cannot be part of octree (infinite size)
	private hitTopGlass!: HitPlane;

	private meshAsPlayfield: boolean = false;
	private hitOcTreeDynamic: HitKD = new HitKD();
	private hitOcTree: HitQuadtree = new HitQuadtree();
	// Deviation (hardening, not upstream): guards below are new DragonWar plumbing
	// around this file's harness-facing API, not part of the ported solver — they
	// turn two silent-failure setup mistakes into a clear thrown error, caught by
	// code review of this story's diff. See docs/spikes/spike-1.md's deviation list.
	private staticsFinalized: boolean = false;

	/**
	 * Registers a ball with the physics world: adds it to the stepped ball list, its
	 * mover to the mover list, and its hit shape to the dynamic broadphase tree.
	 * Deviation: replaces upstream's `createBall()` — see the file header.
	 */
	public addBall(ball: Ball): void {
		this.balls.push(ball);
		this.movers.push(ball.getMover());
		this.hitObjectsDynamic.push(ball.hit);
		this.hitOcTreeDynamic.fillFromVector(this.hitObjectsDynamic);
	}

	/**
	 * Registers a static (non-ball) hit shape — a wall segment, a corner point, etc.
	 * Call `finalizeStatics()` once every static shape has been added.
	 * Deviation: replaces the static half of upstream's `indexTableElements()` /
	 * `initOcTree(table)` — see the file header. Throws if called after
	 * `finalizeStatics()`: the octree is already built at that point, so a later
	 * addition would otherwise be silently excluded from collision detection (a
	 * ball would pass straight through it with no error) rather than failing loudly.
	 */
	public addStaticHitObject(obj: HitObject): void {
		if (this.staticsFinalized) {
			throw new Error(
				'PlayerPhysics.addStaticHitObject: cannot add a static hit object after ' +
				'finalizeStatics() has already built the octree — it would be silently ' +
				'excluded from collision detection.',
			);
		}
		obj.calcHitBBox();
		this.hitObjects.push(obj);
	}

	public setPlayfieldHit(plane: HitPlane): void {
		this.hitPlayfield = plane;
	}

	public setTopGlassHit(plane: HitPlane): void {
		this.hitTopGlass = plane;
	}

	/**
	 * Builds the static broadphase tree from every shape passed to
	 * `addStaticHitObject()`. Call once, after the last such call.
	 */
	public finalizeStatics(): void {
		for (const hitObject of this.hitObjects) {
			this.hitOcTree.addElement(hitObject);
		}
		this.hitOcTree.initialize();
		this.staticsFinalized = true;
	}

	public physicsSimulateCycle(dTime: number) {

		let StaticCnts = STATICCNTS;    // maximum number of static counts

		// it's okay to have this code outside of the inner loop, as the ball hitrects already include the maximum distance they can travel in that timespan
		this.hitOcTreeDynamic.update();

		while (dTime > 0) {
			let hitTime = dTime;

			this.recordContacts = true;
			CollisionEvent.release(...this.contacts);
			this.contacts.length = 0;

			for (const ball of this.balls) {
				const ballHit = ball.hit;

				if (!ball.state.isFrozen) {                   // don't play with frozen balls

					ballHit.coll.hitTime = hitTime;        // search upto current hit time
					ballHit.coll.clear();

					// always check for playfield and top glass
					if (!this.meshAsPlayfield) {
						this.hitPlayfield.doHitTest(ball, ball.coll, this);
					}
					this.hitTopGlass.doHitTest(ball, ball.coll, this);

					// swap order of dynamic and static obj checks — deterministic
					// stand-in for upstream's `Math.random() < 0.5`, see file header
					if (this.swapBallCollisionHandling) {
						this.hitOcTreeDynamic.hitTestBall(ball, ball.coll, this);  // dynamic objects
						this.hitOcTree.hitTestBall(ball, ball.coll, this);         // find the hit objects and hit times
					} else {
						this.hitOcTree.hitTestBall(ball, ball.coll, this);         // find the hit objects and hit times
						this.hitOcTreeDynamic.hitTestBall(ball, ball.coll, this);  // dynamic objects
					}

					const htz = ball.coll.hitTime;                                 // this ball's hit time

					if (htz < 0) {                         // no negative time allowed
						ball.coll.clear();
					}

					if (ball.coll.obj) {
						///////////////////////////////////////////////////////////////////////////
						if (htz <= hitTime) {
							hitTime = htz;                 // record actual event time

							if (htz < STATICTIME) {
								if (--StaticCnts < 0) {
									StaticCnts = 0;        // keep from wrapping
									hitTime = STATICTIME;
								}
							}
						}
					}
				}
			} // end loop over all balls

			this.recordContacts = false;

			// hittime now set ... or full frame if no hit
			// now update displacements to collide-contact or end of physics frame
			// !!!!! 2) move objects to hittime

			if (hitTime > STATICTIME) { // allow more zeros next round
				StaticCnts = STATICCNTS;
			}

			for (const mover of this.movers) {
				mover.updateDisplacements(hitTime);
			}

			// find balls that need to be collided and script'ed (generally there will be one, but more are possible)
			for (let i = 0; i < this.balls.length; i++) {

				const ball = this.balls[i];
				const pho = ball.coll.obj; // object that ball hit in trials

				// find balls with hit objects and minimum time
				if (pho && ball.coll.hitTime <= hitTime) {
					// now collision, contact and script reactions on active ball (object)+++++++++

					this.activeBall = ball;                         // For script that wants the ball doing the collision
					pho.collide(ball.coll, this);          // !!!!! 3) collision on active ball
					ball.coll.clear();                     // remove trial hit object pointer

					// Collide may have changed the velocity of the ball,
					// and therefore the bounding box for the next hit cycle
					if (this.balls[i] !== ball) { // Ball still exists? may have been deleted from list

						// collision script deleted the ball, back up one count
						--i;

					} else {
						ball.hit.calcHitBBox(); // do new boundings
					}
				}
			}

			/*
			 * Now handle contacts.
			 *
			 * At this point UpdateDisplacements() was already called, so the state is different
			 * from that at HitTest(). However, contacts have zero relative velocity, so
			 * hopefully nothing catastrophic has happened in the meanwhile.
			 *
			 * Maybe a two-phase setup where we first process only contacts, then only collisions
			 * could also work.
			 */
			// swap order of contact handling — deterministic stand-in for upstream's
			// second `Math.random() < 0.5`, see file header
			if (!this.swapBallCollisionHandling) {
				// tslint:disable-next-line:prefer-for-of
				for (let i = 0; i < this.contacts.length; ++i) {
					this.contacts[i].obj!.contact(this.contacts[i], hitTime, this);
				}
			} else {
				for (let i = this.contacts.length - 1; i !== -1; --i) {
					this.contacts[i].obj!.contact(this.contacts[i], hitTime, this);
				}
			}
			CollisionEvent.release(...this.contacts);
			this.contacts.length = 0;

			// fixme ballspinhack

			dTime -= hitTime;
			this.swapBallCollisionHandling = !this.swapBallCollisionHandling; // swap order of ball-ball collisions
		}
	}

	public updateVelocities() {
		for (const mover of this.movers) {
			mover.updateVelocities(this); // always on integral physics frame boundary (spinner, gate, flipper, plunger, ball)
		}
	}

	/**
	 * Advances the physics world by exactly one tick (`1 / TICK_HZ` of simulated
	 * time). Deviation: replaces upstream's wall-clock-driven `updatePhysics()` —
	 * see the file header for the derivation of `PHYS_FACTOR` as its `dTime`.
	 * Throws if the harness never called `setPlayfieldHit()` / `setTopGlassHit()`:
	 * without this guard, the first tick would instead throw a confusing
	 * "Cannot read properties of undefined" from deep inside `physicsSimulateCycle`.
	 */
	public step(): void {
		if (!this.meshAsPlayfield && !this.hitPlayfield) {
			throw new Error('PlayerPhysics.step: setPlayfieldHit() must be called before the first step().');
		}
		if (!this.hitTopGlass) {
			throw new Error('PlayerPhysics.step: setTopGlassHit() must be called before the first step().');
		}
		this.updateVelocities();
		this.physicsSimulateCycle(PHYS_FACTOR);
	}

	public setGravity(slopeDeg: number, strength: number): void {
		this.gravity.x = 0;
		this.gravity.y = Math.sin(degToRad(slopeDeg)) * strength;
		this.gravity.z = -Math.cos(degToRad(slopeDeg)) * strength;
	}
}
