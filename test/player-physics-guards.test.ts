// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.1 — pins the three setup guards on `PlayerPhysics`, the DragonWar
// plumbing added around the ported solver's harness-facing API. Two of them were
// added in response to this story's own review findings (one of them `high`
// severity: `addStaticHitObject()` after `finalizeStatics()` used to be a silent
// no-op, so the new shape was pushed to the list but never added to the
// already-built octree and a ball passed straight through it with no error).
//
// Nothing else in the suite exercises them: `tools/spike-1/scene.ts` is the only
// `new PlayerPhysics()` in the repository and it always calls the setters in the
// correct order, so every guard could be deleted with all other tests still green.
// Story 1.4's collision loader is the next caller of this same seam.

import { describe, expect, it } from 'vitest';
import { PlayerPhysics } from '../src/sim/physics/game/player-physics';
import { HitPlane } from '../src/sim/physics/hit-plane';
import { HitPoint } from '../src/sim/physics/hit-point';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';

function playfield(): HitPlane {
	return new HitPlane(new Vertex3D(0, 0, 1), 0);
}

function topGlass(): HitPlane {
	return new HitPlane(new Vertex3D(0, 0, -1), -100);
}

describe('PlayerPhysics setup guards (DragonWar hardening around the ported solver)', () => {
	it('addStaticHitObject() after finalizeStatics() throws instead of silently skipping the octree', () => {
		const physics = new PlayerPhysics();
		physics.addStaticHitObject(new HitPoint(new Vertex3D(0, 0, 0)));
		physics.finalizeStatics();

		expect(() => physics.addStaticHitObject(new HitPoint(new Vertex3D(1, 1, 0))))
			.toThrow(/finalizeStatics/);
	});

	it('finalizeStatics() called twice throws instead of duplicating every static in the octree', () => {
		const physics = new PlayerPhysics();
		physics.addStaticHitObject(new HitPoint(new Vertex3D(0, 0, 0)));
		physics.finalizeStatics();

		expect(() => physics.finalizeStatics()).toThrow(/already called/);
	});

	it('step() without setPlayfieldHit() throws naming the missing call', () => {
		const physics = new PlayerPhysics();
		physics.finalizeStatics();
		physics.setTopGlassHit(topGlass());

		expect(() => physics.step()).toThrow(/setPlayfieldHit/);
	});

	it('step() with statics added but finalizeStatics() never called throws instead of ignoring them', () => {
		const physics = new PlayerPhysics();
		physics.setPlayfieldHit(playfield());
		physics.setTopGlassHit(topGlass());
		physics.addStaticHitObject(new HitPoint(new Vertex3D(0, 0, 0)));
		// Without the guard the octree is never built, so the static simply is not in
		// the broadphase: the step succeeds and balls pass straight through it. This
		// is the third member of the same family as the two guards above -- and the
		// only one of the three that was still missing.
		expect(() => physics.step()).toThrow(/finalizeStatics\(\) must be called/);
	});

	it('step() without setTopGlassHit() throws naming the missing call', () => {
		const physics = new PlayerPhysics();
		physics.finalizeStatics();
		physics.setPlayfieldHit(playfield());

		expect(() => physics.step()).toThrow(/setTopGlassHit/);
	});
});

const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };

function buildBall(id: number, x: number, y: number, vx: number): Ball {
	const data = new BallData(25, 1, 1);
	const state = new BallState(`Ball${id}`, new Vertex3D(x, y, data.radius));
	return new Ball(id, data, state, new Vertex3D(vx, 0, 0), TABLE_DATA);
}

describe('PlayerPhysics.removeBall() -- Story 1.5, the authored inverse of addBall()', () => {
	function scene(): PlayerPhysics {
		const physics = new PlayerPhysics();
		physics.setPlayfieldHit(playfield());
		physics.setTopGlassHit(topGlass());
		physics.finalizeStatics();
		return physics;
	}

	it('a removed ball no longer moves and no longer collides', () => {
		const physics = scene();
		const removed = buildBall(0, 100, 100, 5);
		const stationary = buildBall(1, 300, 300, 0);
		physics.addBall(removed);
		physics.addBall(stationary);

		physics.removeBall(removed);
		expect(physics.balls).toEqual([stationary]);

		const removedXBefore = removed.state.pos.x;
		for (let i = 0; i < 20; i++) {
			physics.step();
		}

		// No longer stepped: its position is frozen exactly where it was.
		expect(removed.state.pos.x).toBe(removedXBefore);
		// And no longer collidable: stepping never throws reaching into a torn-down mover/hit shape.
		expect(() => physics.step()).not.toThrow();
	});

	// Review finding 2026-08-28: task 13 asks for a case proving a removed
	// ball "no longer moves AND no longer collides", but the collision half
	// above is only `expect(() => physics.step()).not.toThrow()` -- which
	// proves stepping does not crash, not that the removed body left the
	// broadphase. If removeBall() spliced `balls` but forgot
	// `hitObjectsDynamic` / the rebuilt hitOcTreeDynamic, that assertion would
	// still pass while the invisible body kept deflecting live balls.
	it('a removed ball is genuinely out of the collision set -- a live ball passes straight through where it sat', () => {
		function run(removeTheObstacle: boolean): number {
			const physics = scene();
			// The obstacle sits directly in the traveller's path.
			const obstacle = buildBall(1, 200, 100, 0);
			const traveller = buildBall(0, 100, 100, 60);
			physics.addBall(obstacle);
			physics.addBall(traveller);
			if (removeTheObstacle) {
				physics.removeBall(obstacle);
			}
			for (let i = 0; i < 200; i++) {
				physics.step();
			}
			return traveller.state.pos.x;
		}

		const blocked = run(false);
		const clear = run(true);

		// Control: with the obstacle present the traveller is genuinely
		// deflected/stopped -- otherwise this case would prove nothing.
		expect(clear, 'a removed obstacle must not deflect a live ball -- if it still does, removeBall() left it in the broadphase').toBeGreaterThan(blocked);
	});

	it('throws when removing a ball that was never added', () => {
		const physics = scene();
		const notAdded = buildBall(0, 100, 100, 0);
		expect(() => physics.removeBall(notAdded)).toThrow(/not registered/);
	});

	it('throws when removing the same ball twice', () => {
		const physics = scene();
		const ball = buildBall(0, 100, 100, 0);
		physics.addBall(ball);
		physics.removeBall(ball);
		expect(() => physics.removeBall(ball)).toThrow(/not registered/);
	});
});
