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
