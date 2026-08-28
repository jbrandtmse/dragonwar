// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.4's fourth acceptance criterion: loads the committed
// dragonwar.collision.json, asserts col_playfield's bounds and both flipper
// node lengths against TABLE.reference within 0.1 mm, builds one compound
// body from the ported primitive set including a HitPoint at every wall
// corner, and pairs every sw_ zone with its TABLE switch; and a document
// whose playfield is mis-sized throws naming the node, the measured value
// and the expected value. The DW-7 case: a ball fired into a wall corner of
// the loaded body causes HitPoint.collide() to run -- closed from THIS
// story's own placeholder geometry, not tools/spike-1/scene.ts (untouched).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import { TABLE } from '../src/sim/table/dragonwar';
import { toPhysics } from '../src/sim/table/frames';
import { HitPoint } from '../src/sim/physics/hit-point';
import { LineSeg } from '../src/sim/physics/line-seg';
import { HitTriangle } from '../src/sim/physics/hit-triangle';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadCommittedDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };

describe('src/sim/physics/loader -- loadCollision() over the committed dragonwar.collision.json', () => {
	it('loads without throwing and returns a physics world plus every sw_ zone paired with its TABLE switch', () => {
		const doc = loadCommittedDoc();
		const { physics, switchZones } = loadCollision(doc);

		expect(physics).toBeDefined();
		expect(switchZones.length).toBeGreaterThan(0);

		const expectedSwitchZoneNames = ['sw_shooter_lane', 'sw_trough_1', 'sw_trough_2', 'sw_trough_3', 'sw_trough_4'];
		expect(switchZones.map((z) => z.name).sort()).toEqual([...expectedSwitchZoneNames].sort());

		for (const zone of switchZones) {
			expect(Object.keys(TABLE.switches), `switch zone "${zone.name}" names an unknown switch "${zone.switch}"`).toContain(zone.switch);
		}
	});

	it('builds a physics world ready to accept a ball -- step() does not throw the "setPlayfieldHit/setTopGlassHit" guard', () => {
		const doc = loadCommittedDoc();
		const { physics } = loadCollision(doc);

		const data = new BallData(26.99 / 2 / 0.53975, 1, 1);
		const state = new BallState('TestBall', new Vertex3D(300, 300, data.radius));
		const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
		physics.addBall(ball);

		expect(() => physics.step()).not.toThrow();
	});
});

describe('src/sim/physics/loader -- reference-dimension assertion (AD-10)', () => {
	it('throws naming col_playfield, the measured width and the expected width when the playfield is mis-sized', () => {
		const doc = loadCommittedDoc() as { nodes: Array<{ name: string; bboxMm: { min: { x: number }; max: { x: number } } }> };
		const playfieldNode = doc.nodes.find((n) => n.name === TABLE.nodes.colPlayfield)!;
		// Shrink the playfield to exactly 500 mm wide (this story's own
		// acceptance criterion: "a document whose playfield is 500 mm wide").
		playfieldNode.bboxMm.max.x = playfieldNode.bboxMm.min.x + 500;

		expect(() => loadCollision(doc)).toThrowError(/col_playfield/);
		try {
			loadCollision(doc);
			expect.fail('loadCollision() should have thrown');
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain('col_playfield');
			expect(message).toContain('500');
			expect(message).toContain(String(TABLE.reference.playfieldMm.w));
		}
	});

	it('throws naming the flipper node when a flipper bat is mis-sized', () => {
		const doc = loadCommittedDoc() as { nodes: Array<{ name: string; bboxMm: { min: { x: number }; max: { x: number } } }> };
		const flipperNode = doc.nodes.find((n) => n.name === TABLE.nodes.colFlipperL)!;
		flipperNode.bboxMm.max.x = flipperNode.bboxMm.min.x + 10; // far shorter than 79.375 mm

		expect(() => loadCollision(doc)).toThrowError(new RegExp(TABLE.nodes.colFlipperL));
	});
});

describe('src/sim/physics/loader -- document shape validation (load-time paths throw, AD-16)', () => {
	it('throws when the document is not an object', () => {
		expect(() => loadCollision(null)).toThrow();
		expect(() => loadCollision('not an object')).toThrow();
	});

	it('throws when a required node is missing entirely', () => {
		const doc = loadCommittedDoc() as { nodes: Array<{ name: string }> };
		doc.nodes = doc.nodes.filter((n) => n.name !== TABLE.nodes.colGlass);
		expect(() => loadCollision(doc)).toThrowError(new RegExp(TABLE.nodes.colGlass));
	});
});

describe('src/sim/physics/loader -- ledger DW-7: a corner HitPoint primitive is exercised by this story\'s own geometry', () => {
	it('firing a ball into a wall corner of the loaded compound body runs HitPoint.collide()', () => {
		const doc = loadCommittedDoc();
		const { physics } = loadCollision(doc);

		// col_wall_lane's far end (table (488.4, 950), open space beyond it --
		// the lane wall simply ends there so a launched ball can cross into the
		// main field) is a real corner of THIS story's own placeholder
		// geometry (not tools/spike-1/scene.ts, which stays untouched -- the
		// reason this closes ledger DW-7 from here).
		const collideSpy = vi.spyOn(HitPoint.prototype, 'collide');

		const data = new BallData(26.99 / 2 / 0.53975, 1, 1);
		const cornerPhysics = toPhysics({ x: 488.4, y: 950, z: 0 });

		// A ball resting exactly at the corner's own z (0 -- floor level, where
		// the wall's rounded corner point sits) fired directly at it from a
		// short distance: the deliberately engineered "shot at the primitive"
		// this story's own phrasing describes, not organic rolling (a ball
		// resting at z = ball radius on the playfield only ever comes within
		// radius of a z=0 point when its horizontal offset is a fraction of a
		// millimetre -- exactly the reachability DW-7 questioned).
		const start = new Vertex3D(cornerPhysics.x + 5, cornerPhysics.y, 0);
		const state = new BallState('CornerBall', start);
		const velocity = new Vertex3D(-8, 0, 0);
		const ball = new Ball(0, data, state, velocity, TABLE_DATA);
		physics.addBall(ball);

		for (let i = 0; i < 50 && collideSpy.mock.calls.length === 0; i++) {
			physics.step();
		}

		expect(collideSpy).toHaveBeenCalled();
		collideSpy.mockRestore();
	});
});

describe('src/sim/physics/loader -- LineSeg regression guard (orientedEdge() orientation)', () => {
	it('firing a ball at the MIDDLE of a wall footprint edge (not a corner) runs LineSeg.collide() -- a wall face, not just its endpoints, must actually block the ball', () => {
		const doc = loadCommittedDoc();
		const { physics } = loadCollision(doc);

		// col_wall_left's footprint midpoint (table (-6, 533.4)) is well clear
		// of BOTH its endpoints (table y=0 and y=1066.8), so only the wall's
		// FACE -- the LineSeg orientedEdge() constructs, never a corner
		// HitPoint -- can catch this approach. This is the regression guard
		// orientedEdge()'s own doc comment names: inverting its final ternary
		// (swapping the [p1,p2] / [p2,p1] branches) flips every wall to face
		// outward, and this is the only test in this suite that would notice.
		const collideSpy = vi.spyOn(LineSeg.prototype, 'collide');

		const data = new BallData(26.99 / 2 / 0.53975, 1, 1);
		const wallMidPhysics = toPhysics({ x: -6, y: 533.4, z: 0 });

		const start = new Vertex3D(wallMidPhysics.x + 5, wallMidPhysics.y, data.radius);
		const state = new BallState('WallFaceBall', start);
		const velocity = new Vertex3D(-8, 0, 0);
		const ball = new Ball(0, data, state, velocity, TABLE_DATA);
		physics.addBall(ball);

		for (let i = 0; i < 50 && collideSpy.mock.calls.length === 0; i++) {
			physics.step();
		}

		expect(collideSpy).toHaveBeenCalled();
		collideSpy.mockRestore();
	});
});

describe('src/sim/physics/loader -- HitTriangle regression guard (outwardTriangle() orientation)', () => {
	it('firing a ball at a face of the col_flipper_l compound box runs HitTriangle.collide() -- the box must actually block the ball, not let it sail through', () => {
		const doc = loadCommittedDoc();
		const { physics } = loadCollision(doc);

		// col_flipper_l spans table x:[170, 249.375], y:[57.5, 82.5], z:[0, 20].
		// Aim at the middle of its +Y face (table y=82.5, x=210, z=10) from
		// just outside it -- the regression guard outwardTriangle()'s own doc
		// comment names: inverting its final ternary flips every face to point
		// inward, and this is the only test in this suite that would notice.
		const collideSpy = vi.spyOn(HitTriangle.prototype, 'collide');

		const data = new BallData(26.99 / 2 / 0.53975, 1, 1);
		const targetPhysics = toPhysics({ x: 210, y: 82.5, z: 10 });
		const startPhysics = toPhysics({ x: 210, y: 150, z: 10 });
		const dx = targetPhysics.x - startPhysics.x;
		const dy = targetPhysics.y - startPhysics.y;
		const len = Math.hypot(dx, dy) || 1;
		const speed = 8;

		const start = new Vertex3D(startPhysics.x, startPhysics.y, targetPhysics.z);
		const state = new BallState('FlipperFaceBall', start);
		const velocity = new Vertex3D((dx / len) * speed, (dy / len) * speed, 0);
		const ball = new Ball(0, data, state, velocity, TABLE_DATA);
		physics.addBall(ball);

		// Run a FIXED step budget (not "stop at the first collide() call"):
		// merely checking "collide() fired at least once" turned out NOT to
		// distinguish correct from broken winding here -- with
		// outwardTriangle()'s ternary inverted, the ball still triggers a
		// collide() almost immediately, but then gets trapped, oscillating
		// between two inward-facing triangles a fraction of a millimetre
		// apart (measured: 3164 collide() calls over these same 300 steps,
		// vs. exactly 1 with correct winding, which cleanly deflects the
		// ball away). Bounding the call count is what actually catches the
		// regression.
		for (let i = 0; i < 300; i++) {
			physics.step();
		}

		expect(collideSpy).toHaveBeenCalled();
		expect(
			collideSpy.mock.calls.length,
			'the box must cleanly deflect the ball, not trap it oscillating between inward-facing triangles',
		).toBeLessThanOrEqual(3);
		collideSpy.mockRestore();
	});
});
