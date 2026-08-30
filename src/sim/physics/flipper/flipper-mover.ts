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
// Source: lib/vpt/flipper/flipper-mover.ts
//
// Deviation: configuration arrives as the authored `FlipperConfig` (this
// story's `flipper-config.ts`, mirroring upstream's own `lib/vpt/flipper/
// flipper.ts` interface) plus the minimal authored `FlipperPhysicsData` and
// `FlipperState` stand-ins, instead of a `FlipperData`/`TableData` pair loaded
// from a `.vpx` file (AD-1: no table-loading path is ported).
// Deviation: dropped the `tableData: TableData` constructor parameter and
// `doOverridePhysics()` entirely -- DragonWar has no per-table
// physics-override system, so every getter below reads its field from `data`
// directly rather than choosing between a base and an `override*` field.
// Deviation: dropped every `logger().info(...)` debug call inside
// `updateDisplacements()` -- CLAUDE.md/AD-3: only `host/` logs, `sim/` is
// console-free. `fireVoidEventParm()` still fires (via the restored
// `EventProxy` hook, `game/event-proxy.ts`), so end-of-stroke/beginning-of-
// stroke is still observable to `sim/physics/flippers.ts`, just silently.
// Deviation: `getMass()`/`setMass()` are dropped -- nothing in this port's own
// closure calls them (they existed upstream for the VPX table editor's live
// mass slider, a scripting/UI concern out of scope per AD-1); `inertia` is
// still computed the same way in the constructor.
// Deviation: the `@deprecated applyImpulse()` alias is dropped; only
// `applyImpulseAndRelease()` (upstream's own recommended replacement, and the
// only one `flipper-hit.ts` calls) is kept.
// Deviation (recorded by code review 2026-08-29, previously undocumented):
// `setStartAngle()`/`setEndAngle()` are dropped. Upstream exposes them for the
// VPX table editor's live angle sliders (the same scripting/UI concern as the
// dropped `getMass()`/`setMass()`, out of scope per AD-1); DragonWar derives
// both angles once in `flipper-config.ts` from the committed collision
// geometry (AD-11), and nothing in this port's own closure calls either.
// Deviation (recorded by code review 2026-08-29, previously undocumented):
// upstream's degenerate-sweep guard MUTATES its caller's config
// (`config.angleEnd += 0.0001`); this port copies into a local `angleEnd`
// instead, so `FlipperConfig` stays the readonly value `flipper-config.ts`
// declares it to be and the caller's object is never written through. Behaviour
// differs only when `angleEnd === angleStart`, which the committed geometry
// cannot produce (pivot and tip are 79.375 mm apart).

import { Event } from '../game/event';
import { EventProxy } from '../game/event-proxy';
import { degToRad, radToDeg } from '../math/float';
import { Vertex2D } from '../math/vertex2d';
import { Vertex3D } from '../math/vertex3d';
import { PHYS_FACTOR } from '../constants';
import { HitCircle } from '../hit-circle';
import { MoverObject } from '../mover-object';
import { FlipperConfig, FlipperPhysicsData, FlipperState } from './flipper-config';

export class FlipperMover implements MoverObject {

	private readonly data: FlipperPhysicsData;
	private readonly state: FlipperState;
	private readonly events: EventProxy;

	public hitCircleBase: HitCircle;
	public endRadius: number;
	public readonly flipperRadius: number;

	// kinematic state
	private angularMomentum: number;
	private angularAcceleration: number;
	public angleSpeed: number;

	private curTorque: number;
	public contactTorque: number = 0;

	public angleStart: number;
	public angleEnd: number;

	public inertia: number; // moment of inertia

	public zeroAngNorm: Vertex2D = new Vertex2D(); // base norms at zero degrees

	public enableRotateEvent: number; // -1,0,1

	private readonly direction: boolean;

	private solState: boolean; // is solenoid enabled?
	public isInContact: boolean;

	public lastHitFace: boolean;

	constructor(config: FlipperConfig, flipperData: FlipperPhysicsData, state: FlipperState, events: EventProxy) {

		this.events = events;
		this.hitCircleBase = new HitCircle(config.center, config.baseRadius, config.zLow, config.zHigh);
		this.data = flipperData;
		this.state = state;

		this.endRadius = config.endRadius;                 // radius of flipper end
		this.flipperRadius = config.flipperRadius;         // radius of flipper arc, center-to-center radius

		let angleEnd = config.angleEnd;
		if (angleEnd === config.angleStart) {       // otherwise hangs forever in collisions/updates
			angleEnd += 0.0001;
		}

		this.direction = angleEnd >= config.angleStart;
		this.solState = false;
		this.isInContact = false;
		this.curTorque = 0.0;
		this.enableRotateEvent = 0;

		this.angleStart = config.angleStart;
		this.angleEnd = angleEnd;
		this.state.angle = config.angleStart;

		this.angularMomentum = 0;
		this.angularAcceleration = 0;
		this.angleSpeed = 0;

		const ratio = (config.baseRadius - config.endRadius) / config.flipperRadius;

		// model inertia of flipper as that of rod of length flipr around its end
		const mass = this.getFlipperMass();
		this.inertia = (1.0 / 3.0) * mass * (config.flipperRadius * config.flipperRadius);

		this.lastHitFace = false;                          // used to optimize hit face search order

		this.zeroAngNorm.x =  Math.sqrt(1.0 - ratio * ratio);     // F2 Norm, used in Green's transform, in FPM time search  // =  sinf(faceNormOffset)
		this.zeroAngNorm.y = -ratio;                                 // F1 norm, change sign of x component, i.e -zeroAngNorm.x // = -cosf(faceNormOffset)
	}

	public updateDisplacements(dtime: number): void {

		this.state.angle += this.angleSpeed * dtime;       // move flipper angle

		const angleMin = Math.min(this.angleStart, this.angleEnd);
		const angleMax = Math.max(this.angleStart, this.angleEnd);

		if (this.state.angle > angleMax) {
			this.state.angle = angleMax;
		}
		if (this.state.angle < angleMin) {
			this.state.angle = angleMin;
		}

		if (Math.abs(this.angleSpeed) < 0.0005) {          // avoids 'jumping balls' when two or more balls held on flipper (and more other balls are in play) //!! make dependent on physics update rate
			return;
		}

		let handleEvent = false;

		if (this.state.angle === angleMax) {               // hit stop?
			if (this.angleSpeed > 0) {
				handleEvent = true;
			}
		} else if (this.state.angle === angleMin) {
			if (this.angleSpeed < 0) {
				handleEvent = true;
			}
		}

		if (handleEvent) {
			const anglespd = Math.abs(radToDeg(this.angleSpeed));
			this.angularMomentum *= -0.3;                            // make configurable?
			this.angleSpeed = this.angularMomentum / this.inertia;

			if (this.enableRotateEvent > 0) {
				this.events.fireVoidEventParm(Event.LimitEventsEOS, anglespd); // send EOS event

			} else if (this.enableRotateEvent < 0) {
				this.events.fireVoidEventParm(Event.LimitEventsBOS, anglespd); // send Beginning of Stroke/Park event
			}
			this.enableRotateEvent = 0;
		}
	}

	public updateVelocities(): void {

		let desiredTorque = this.getStrength();
		if (!this.solState) {                              // this.solState: true = button pressed, false = released
			desiredTorque *= -this.getReturnRatio();
		}

		// hold coil is weaker
		const eosAngle = degToRad(this.getTorqueDampingAngle());
		if (Math.abs(this.state.angle - this.angleEnd) < eosAngle) {
			// fade in/out damping, depending on angle to end
			const lerp = Math.sqrt(Math.sqrt(Math.abs(this.state.angle - this.angleEnd) / eosAngle));
			desiredTorque *= lerp + this.getTorqueDamping() * (1 - lerp);
		}

		if (!this.direction) {
			desiredTorque = -desiredTorque;
		}

		let torqueRampupSpeed = this.getRampUpSpeed();
		if (torqueRampupSpeed <= 0) {
			torqueRampupSpeed = 1e6;                       // set very high for instant coil response
		} else {
			torqueRampupSpeed = Math.min(this.getStrength() / torqueRampupSpeed, 1e6);
		}

		// update current torque linearly towards desired torque
		// (simple model for coil hysteresis)
		if (desiredTorque >= this.curTorque) {
			this.curTorque = Math.min(this.curTorque + torqueRampupSpeed * PHYS_FACTOR, desiredTorque);
		} else {
			this.curTorque = Math.max(this.curTorque - torqueRampupSpeed * PHYS_FACTOR, desiredTorque);
		}

		// resolve contacts with stoppers
		let torque = this.curTorque;
		this.isInContact = false;
		if (Math.abs(this.angleSpeed) <= 1e-2) {
			const angleMin = Math.min(this.angleStart, this.angleEnd);
			const angleMax = Math.max(this.angleStart, this.angleEnd);

			if (this.state.angle >= angleMax - 1e-2 && torque > 0) {
				this.state.angle = angleMax;
				this.isInContact = true;
				this.contactTorque = torque;
				this.angularMomentum = 0;
				torque = 0;

			} else if (this.state.angle <= angleMin + 1e-2 && torque < 0) {
				this.state.angle = angleMin;
				this.isInContact = true;
				this.contactTorque = torque;
				this.angularMomentum = 0;
				torque = 0;
			}
		}

		this.angularMomentum += PHYS_FACTOR * torque;
		this.angleSpeed = this.angularMomentum / this.inertia;
		this.angularAcceleration = torque / this.inertia;
	}

	public setSolenoidState(s: boolean): void {
		this.solState = s;
	}

	public getReturnRatio(): number {
		return this.data.returnRatio;
	}

	public getStrength(): number {
		return this.data.strength;
	}

	private getTorqueDampingAngle(): number {
		return this.data.torqueDampingAngleDeg;
	}
	private getFlipperMass(): number {
		return this.data.mass;
	}

	private getTorqueDamping(): number {
		return this.data.torqueDamping;
	}

	private getRampUpSpeed(): number {
		return this.data.rampUp;
	}

	// rigid body functions
	public surfaceVelocity(surfP: Vertex3D, recycle = false): Vertex3D {
		return Vertex3D.crossZ(this.angleSpeed, surfP, recycle);
	}

	public getHitTime(): number {
		if (this.angleSpeed === 0) {
			return -1.0;
		}

		const angleMin = Math.min(this.angleStart, this.angleEnd);
		const angleMax = Math.max(this.angleStart, this.angleEnd);
		const dist = this.angleSpeed > 0
			? angleMax - this.state.angle       // >= 0
			: angleMin - this.state.angle;      // <= 0

		const hitTime = dist / this.angleSpeed;

		if (!isFinite(hitTime) || hitTime < 0) {
			return -1.0;
		} else {
			return hitTime;
		}
	}

	public applyImpulseAndRelease(rotI: Vertex3D): void {
		this.angularMomentum += rotI.z;            // only rotation about z axis
		this.angleSpeed = this.angularMomentum / this.inertia;    // TODO: figure out moment of inertia
		Vertex3D.release(rotI);
	}

	public surfaceAcceleration(surfP: Vertex3D, recycle = false): Vertex3D {
		// tangential acceleration = (0, 0, omega) x surfP
		const tangAcc = Vertex3D.crossZ(this.angularAcceleration, surfP, recycle);

		// centripetal acceleration = (0,0,omega) x ( (0,0,omega) x surfP )
		const av2 = this.angleSpeed * this.angleSpeed;
		const centrAcc = Vertex3D.claim(-av2 * surfP.x, -av2 * surfP.y, 0);

		return tangAcc.addAndRelease(centrAcc);
	}
}
