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
import { MM_PER_VU, fromPhysics, toPhysics } from '../src/sim/table/frames';
import { TUNING } from '../src/sim/table/tuning';
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

/** A loosely-typed view of the committed document, for the mutation tests
 * below -- narrower than `any`, wide enough to reshape a node into an
 * intentionally-broken one without fighting the strict `CollisionNodeDoc`
 * shape that only `src/sim/physics/loader/index.ts` (out of footprint) sees. */
interface MutableNode {
	name: string;
	shape: string;
	physMaterial?: string;
	[key: string]: unknown;
}

interface MutableSwitchZone {
	name: string;
	switch: string;
	[key: string]: unknown;
}

interface MutableDoc {
	nodes: MutableNode[];
	switchZones: MutableSwitchZone[];
	[key: string]: unknown;
}

function loadMutableCommittedDoc(): MutableDoc {
	return loadCommittedDoc() as MutableDoc;
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

	it('rejects a non-finite coordinate reached through JSON.parse -- an overflowing literal, not a hand-built object', () => {
		// `1e999` is valid JSON and `JSON.parse` turns it into `Infinity`, so this
		// arrives through loadCollision()'s DOCUMENTED "already-parsed document"
		// contract rather than around it. Left unguarded, `Infinity - Infinity`
		// is `NaN`, and `NaN <= TOLERANCE_MM` is false in a way that made the
		// mis-sized-document assertion pass while a compound body of NaN geometry
		// loaded (review finding, this story's code-review pass).
		const raw = readFileSync(COLLISION_PATH, 'utf8');
		const overflowed = raw.replace('"w": 514.4', '"w": 1e999');
		expect(overflowed, 'the fixture substitution must actually have applied').not.toBe(raw);
		expect(JSON.parse(overflowed).reference.playfieldMm.w, 'JSON.parse must yield Infinity, or this test proves nothing').toBe(Infinity);

		const bboxOverflowed = JSON.parse(raw.replace('"x": 514.4', '"x": 1e999')) as unknown;
		expect(() => loadCollision(bboxOverflowed)).toThrowError(/finite/);
	});

	it('throws naming the node when a wall node\'s footprintMm has fewer than 3 points (review finding: the closed-polygon threshold, changed from < 2 to < 3 alongside the Review Findings HIGH wall-thickness fix, had no dedicated test on either value)', () => {
		// addWall() treats footprintMm as a CLOSED polygon (an edge between
		// every consecutive pair, plus one closing the last point back to the
		// first), so at least 3 points are needed for it to enclose any area
		// at all -- the threshold this guard enforces. Every sibling defensive
		// guard in this file (assertPlaneShaped(), the second-plane rejection,
		// findNode()'s duplicate-name guard, applyMaterial()'s
		// unknown-material guard, the switch-zone unknown-switch guard below)
		// has a matching hand-mutated-document test; this one previously did not.
		const doc = loadMutableCommittedDoc();
		const wallNode = doc.nodes.find((n) => n.name === 'col_wall_left')!;
		expect(wallNode.shape).toBe('wall');
		wallNode.footprintMm = [{ x: 0, y: 0 }, { x: 0, y: 100 }]; // 2 points -- one short of enclosing any area

		expect(() => loadCollision(doc)).toThrowError(/col_wall_left/);
		expect(() => loadCollision(doc)).toThrowError(/at least 3 points/);
	});
});

describe('src/sim/physics/loader -- ledger DW-7: a corner HitPoint primitive is exercised by this story\'s own geometry', () => {
	it('firing a ball into a wall corner of the loaded compound body runs HitPoint.collide()', () => {
		const doc = loadCommittedDoc();
		const { physics } = loadCollision(doc);

		// col_wall_lane's lane-facing corner (table (480.4, 950) -- the far end
		// of its now-real lane-facing face, open space beyond it: the lane wall
		// simply ends there so a launched ball can cross into the main field)
		// is a real, literal corner of THIS story's own placeholder geometry
		// (not tools/spike-1/scene.ts, which stays untouched -- the reason this
		// closes ledger DW-7 from here). Since the Review Findings HIGH fix
		// (wall_footprint_mm() now preserves real thickness as a closed
		// four-corner polygon), col_wall_lane's footprint has genuine
		// rectangular corners of its own, not merely the capped ends of an
		// open segment.
		const collideSpy = vi.spyOn(HitPoint.prototype, 'collide');

		const data = new BallData(26.99 / 2 / 0.53975, 1, 1);
		const cornerPhysics = toPhysics({ x: 480.4, y: 950, z: 0 });

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

		// col_wall_left's INTERIOR-facing face (table x = 0, the real face a
		// ball approaching from the main field actually meets -- since the
		// Review Findings HIGH fix, the wall's footprint is the full-thickness
		// rectangle x:[-12, 0], not a virtual zero-thickness centreline at
		// x = -6) at its midpoint (table (0, 533.4)) is well clear of BOTH its
		// endpoints (table y = 0 and y = 1066.8), so only the wall's FACE --
		// the LineSeg orientedEdge() constructs, never a corner HitPoint --
		// can catch this approach. This is the regression guard
		// orientedEdge()'s own doc comment names: inverting its final ternary
		// (swapping the [p1,p2] / [p2,p1] branches) flips every wall to face
		// outward, and this is the only test in this suite that would notice.
		const collideSpy = vi.spyOn(LineSeg.prototype, 'collide');

		const data = new BallData(26.99 / 2 / 0.53975, 1, 1);
		const wallMidPhysics = toPhysics({ x: 0, y: 533.4, z: 0 });

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

describe('src/sim/physics/loader -- interior divider guards BOTH faces (Review Findings, HIGH)', () => {
	it('firing a ball from inside the plunger lane at col_wall_lane blocks it -- it must not cross into the main field', () => {
		const doc = loadCommittedDoc();
		const { physics } = loadCollision(doc);

		// The HIGH finding's own measured reproduction: `wall_footprint_mm()`
		// used to collapse every wall to a single zero-thickness centreline
		// oriented toward the TABLE's centre, which left col_wall_lane's
		// lane-facing side (the side actually inside the plunger lane)
		// completely unguarded -- a ball at table (504, 300, 13.5) moving -x
		// sailed straight through the divider and came to rest at table
		// x = 331.3, deep in the main field. col_wall_lane's lane-facing face
		// now sits at table x = 480.4 (widened from the original 494.4 -- see
		// tools/make-placeholder-blend.py's LANE_CLEAR_MM -- because a
		// correctly-guarded lane's old 20 mm clearance was narrower than the
		// 26.99 mm reference ball).
		const collideSpy = vi.spyOn(LineSeg.prototype, 'collide');

		const data = new BallData(26.99 / 2 / 0.53975, 1, 1);
		const startPhysics = toPhysics({ x: 504, y: 300, z: 13.5 });
		const state = new BallState('LaneBall', new Vertex3D(startPhysics.x, startPhysics.y, startPhysics.z));
		const velocity = new Vertex3D(-8, 0, 0);
		const ball = new Ball(0, data, state, velocity, TABLE_DATA);
		physics.addBall(ball);

		for (let i = 0; i < 200; i++) {
			physics.step();
		}

		expect(collideSpy).toHaveBeenCalled();
		const finalTable = fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
		// The wall's full footprint spans table x:[468.4, 480.4]. Bound on the
		// LANE-FACING face (480.4), not the far one: a ball stopped anywhere
		// inside the 12 mm wall volume has still penetrated the geometry that
		// is supposed to stop it, and a bound at 468.4 accepts that (re-review
		// finding -- the paired spy is on LineSeg.prototype, so it proves SOME
		// wall segment fired, not that this one held). The regression this
		// guards against reached table x = 331.3, far past either bound.
		expect(
			finalTable.x,
			`ball penetrated col_wall_lane: table x = ${finalTable.x} (the divider's lane-facing face is at x = 480.4; its main-field face is at x = 468.4)`,
		).toBeGreaterThanOrEqual(480.4);
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

// ---------------------------------------------------------------------------
// The loader's own defensive guards -- review findings this story's Review
// Triage Log records as patched, but which no existing test in this suite
// (nor test/asset-contract.test.ts, which only ever validates the committed,
// already-correct document) drives with input engineered to actually reach
// them. A malformed or hand-edited dragonwar.collision.json is exactly the
// input each of these exists to reject; a silent pass here would mean the
// physics world quietly built itself wrong instead of refusing to load.
// ---------------------------------------------------------------------------

describe('src/sim/physics/loader -- assertPlaneShaped() guard (col_playfield/col_glass must actually be plane-shaped)', () => {
	it('throws naming col_playfield and its actual shape when it is not plane-shaped', () => {
		const doc = loadMutableCommittedDoc();
		const playfieldNode = doc.nodes.find((n) => n.name === TABLE.nodes.colPlayfield)!;
		// 'box' is deliberate: the loader's own document parser needs no extra
		// fields for a box-shaped node, so parsing itself succeeds and it is
		// assertPlaneShaped() -- not an earlier shape-parsing failure -- that
		// must be what throws here.
		playfieldNode.shape = 'box';

		try {
			loadCollision(doc);
			expect.fail('loadCollision() should have thrown');
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain(TABLE.nodes.colPlayfield);
			expect(message).toContain('plane-shaped');
			expect(message).toContain('box');
		}
	});

	it('throws naming col_glass and its actual shape when it is not plane-shaped', () => {
		const doc = loadMutableCommittedDoc();
		const glassNode = doc.nodes.find((n) => n.name === TABLE.nodes.colGlass)!;
		glassNode.shape = 'box';

		try {
			loadCollision(doc);
			expect.fail('loadCollision() should have thrown');
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain(TABLE.nodes.colGlass);
			expect(message).toContain('plane-shaped');
			expect(message).toContain('box');
		}
	});
});

describe('src/sim/physics/loader -- only col_playfield/col_glass may be plane-shaped', () => {
	it('throws naming a third node that claims shape "plane"', () => {
		const doc = loadMutableCommittedDoc();
		const playfieldNode = doc.nodes.find((n) => n.name === TABLE.nodes.colPlayfield)!;
		// A full, validly-shaped clone of col_playfield under a different name:
		// every field parseCollisionDoc()'s 'plane' branch needs is already
		// present (copied), so parsing succeeds and it is loadCollision()'s own
		// node loop -- not document parsing -- that must reject the second plane.
		doc.nodes.push({ ...playfieldNode, name: 'col_extra_plane' });

		try {
			loadCollision(doc);
			expect.fail('loadCollision() should have thrown');
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain('col_extra_plane');
			expect(message).toContain('unexpected plane-shaped');
		}
	});
});

describe('src/sim/physics/loader -- findNode() rejects a duplicated node name (review finding: no silent first-match)', () => {
	it('throws naming the duplicated node when two nodes share col_flipper_l\'s name', () => {
		const doc = loadMutableCommittedDoc();
		const flipperNode = doc.nodes.find((n) => n.name === TABLE.nodes.colFlipperL)!;
		doc.nodes.push({ ...flipperNode });

		try {
			loadCollision(doc);
			expect.fail('loadCollision() should have thrown');
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain(TABLE.nodes.colFlipperL);
			expect(message).toContain('2 nodes named');
			expect(message).toContain('must be unique');
		}
	});
});

describe('src/sim/physics/loader -- applyMaterial() rejects an unrecognized phys_material (review finding: no silent default)', () => {
	it('throws naming the node and the bad value rather than silently falling back to materials.default', () => {
		const doc = loadMutableCommittedDoc();
		const wallNode = doc.nodes.find((n) => n.name === 'col_wall_left')!;
		wallNode.physMaterial = 'unobtainium';

		try {
			loadCollision(doc);
			expect.fail('loadCollision() should have thrown');
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain('col_wall_left');
			expect(message).toContain('unobtainium');
			expect(message).toContain('unknown phys_material');
		}
	});
});

describe('src/sim/physics/loader -- switch zones reject an unknown TABLE switch name (review finding: no silent cast)', () => {
	it('throws naming the zone and the unrecognized switch value', () => {
		const doc = loadMutableCommittedDoc();
		const zone = doc.switchZones[0];
		zone.switch = 's_nonexistent_switch';

		try {
			loadCollision(doc);
			expect.fail('loadCollision() should have thrown');
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain(zone.name);
			expect(message).toContain('s_nonexistent_switch');
			expect(message).toContain('unknown switch');
		}
	});
});

describe('src/sim/physics/loader -- AD-15 material tunables actually reach the built statics', () => {
	// applyMaterial() resolves TUNING.materials[physMaterial] and calls
	// setElasticity/setFriction/setScatter on EVERY primitive it builds, but
	// nothing read any of those values back: dropping the lookup (so every
	// flipper resolved to `default`) or removing the setter calls entirely
	// left the whole suite green -- measured during this story's re-review by
	// simulating exactly that regression. AD-15 makes these the per-object
	// feel parameters, so a silent no-op here is flipper rubber behaving like
	// bare wood, discovered in Story 1.6 as a feel problem with no failing
	// test pointing at its cause.
	it('flipper boxes carry flipper_rubber and wall segments carry default, as authored in the collision document', () => {
		const doc = loadCommittedDoc();

		const applied = new Map<string, { elasticity: number; falloff: number | undefined; friction: number; scatter: number }>();
		const track = (key: string) => {
			const record = applied.get(key) ?? { elasticity: NaN, falloff: undefined, friction: NaN, scatter: NaN };
			applied.set(key, record);
			return record;
		};
		const spies = [
			vi.spyOn(HitTriangle.prototype, 'setElasticity').mockImplementation(function (this: HitTriangle, e: number, f?: number) {
				const r = track('box'); r.elasticity = e; r.falloff = f; return this;
			}),
			vi.spyOn(HitTriangle.prototype, 'setFriction').mockImplementation(function (this: HitTriangle, f: number) {
				track('box').friction = f; return this;
			}),
			vi.spyOn(HitTriangle.prototype, 'setScatter').mockImplementation(function (this: HitTriangle, s: number) {
				track('box').scatter = s; return this;
			}),
			vi.spyOn(LineSeg.prototype, 'setElasticity').mockImplementation(function (this: LineSeg, e: number, f?: number) {
				const r = track('wall'); r.elasticity = e; r.falloff = f; return this;
			}),
			vi.spyOn(LineSeg.prototype, 'setFriction').mockImplementation(function (this: LineSeg, f: number) {
				track('wall').friction = f; return this;
			}),
			vi.spyOn(LineSeg.prototype, 'setScatter').mockImplementation(function (this: LineSeg, s: number) {
				track('wall').scatter = s; return this;
			}),
		];

		try {
			loadCollision(doc);
		} finally {
			for (const spy of spies) {
				spy.mockRestore();
			}
		}

		// The two box nodes are col_flipper_l/col_flipper_r, both
		// physMaterial "flipper_rubber"; every wall node is "default".
		const rubber = TUNING.materials.flipper_rubber;
		const plain = TUNING.materials.default;

		const box = applied.get('box');
		expect(box, 'no HitTriangle was built -- the flipper boxes did not reach applyMaterial()').toBeDefined();
		expect(box!.elasticity, 'flipper HitTriangle elasticity').toBe(rubber.elasticity.value);
		expect(box!.falloff, 'flipper HitTriangle elasticityFalloff').toBe(rubber.elasticityFalloff.value);
		expect(box!.friction, 'flipper HitTriangle friction').toBe(rubber.friction.value);
		expect(box!.scatter, 'flipper HitTriangle scatter').toBe(rubber.scatter.value);

		const wall = applied.get('wall');
		expect(wall, 'no LineSeg was built -- the wall footprints did not reach applyMaterial()').toBeDefined();
		expect(wall!.elasticity, 'wall LineSeg elasticity').toBe(plain.elasticity.value);
		expect(wall!.falloff, 'wall LineSeg elasticityFalloff').toBe(plain.elasticityFalloff.value);
		expect(wall!.friction, 'wall LineSeg friction').toBe(plain.friction.value);
		expect(wall!.scatter, 'wall LineSeg scatter').toBe(plain.scatter.value);

		// The two materials must actually differ, or the assertions above
		// would hold under a regression that collapsed both to `default`.
		expect(rubber.elasticity.value, 'the two materials must differ, or this test cannot discriminate').not.toBe(plain.elasticity.value);
	});
});

describe('src/sim/physics/loader -- AD-10 asserts the table frame ORIGIN, not only its extents', () => {
	it('throws naming col_playfield when the playfield is the right size but offset from the table origin', () => {
		const doc = loadMutableCommittedDoc();
		const playfield = doc.nodes.find((n) => n.name === TABLE.nodes.colPlayfield)!;
		const bbox = playfield.bboxMm as { min: { x: number; y: number }; max: { x: number; y: number } };
		// Slide the whole playfield 50 mm up the table: width and height are
		// unchanged, so the extent-only assertions still pass -- but
		// toPhysics() flips y about TABLE.reference.playfieldMm.h measured
		// from the origin, so every converted coordinate is now 50 mm wrong.
		bbox.min.y += 50;
		bbox.max.y += 50;

		try {
			loadCollision(doc);
			expect.fail('loadCollision() should have thrown on an offset playfield');
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain(TABLE.nodes.colPlayfield);
			expect(message).toContain('origin y');
			expect(message).toContain('50');
		}
	});
});

describe('src/sim/physics/loader -- the plunger lane is still TRAVERSABLE after the clearance widening', () => {
	// The interior-divider fix and the LANE_CLEAR_MM widening (20 -> 34 mm)
	// are both one-directional guards: every test added with them proves the
	// divider BLOCKS. Nothing proved the lane still lets a ball through, so
	// extending col_wall_lane to full height, narrowing the clearance back
	// below the ball diameter, or closing the top of the lane would leave
	// every one of those tests green while making the table unplayable and
	// Story 1.5's serve impossible (re-review finding).
	/** Fires a ball up the plunger lane and reports how far up-table it got
	 * and how far it strayed across the lane. `laneFaceMm` is col_wall_lane's
	 * lane-facing x, so the same run can be replayed against a narrower lane
	 * to prove this test discriminates. */
	function launchUpLane(laneFaceMm: number): { travelledMm: number; minXMm: number; maxXMm: number } {
		const doc = loadMutableCommittedDoc();
		if (laneFaceMm !== 480.4) {
			const laneWall = doc.nodes.find((n) => n.name === 'col_wall_lane')!;
			const bbox = laneWall.bboxMm as { min: { x: number }; max: { x: number } };
			const footprint = laneWall.footprintMm as Array<{ x: number; y: number }>;
			for (const point of footprint) {
				if (Math.abs(point.x - bbox.max.x) < 1e-6) {
					point.x = laneFaceMm;
				}
			}
			bbox.max.x = laneFaceMm;
		}
		const { physics } = loadCollision(doc);

		const startYMm = 60;
		const radiusVu = TABLE.reference.ballMm / 2 / MM_PER_VU;
		const data = new BallData(radiusVu, 1, 1);
		// Lane centre for the committed 34 mm clearance: col_wall_lane's
		// lane-facing face is x = 480.4 and col_wall_right's inner face is
		// x = 514.4, so the gap is centred on x = 497.4.
		const startPhysics = toPhysics({ x: 497.4, y: startYMm, z: 13.5 });
		const state = new BallState('LaunchBall', new Vertex3D(startPhysics.x, startPhysics.y, startPhysics.z));
		// Table +y is physics -y (frames.ts flips it), so "up the lane" is a
		// negative physics-y velocity.
		const ball = new Ball(0, data, state, new Vertex3D(0, -20, 0), TABLE_DATA);
		physics.addBall(ball);

		let minXMm = Infinity;
		let maxXMm = -Infinity;
		let travelledMm = 0;
		for (let i = 0; i < 400; i++) {
			physics.step();
			const t = fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
			minXMm = Math.min(minXMm, t.x);
			maxXMm = Math.max(maxXMm, t.x);
			travelledMm = t.y - startYMm;
		}
		return { travelledMm, minXMm, maxXMm };
	}

	it('a ball fired up the lane runs a long way up it without touching either lane wall', () => {
		const radiusMm = TABLE.reference.ballMm / 2;
		const { travelledMm, minXMm, maxXMm } = launchUpLane(480.4);

		// It travels: the lane is open along its length, not sealed or jammed.
		expect(
			travelledMm,
			`ball barely moved up the lane (${travelledMm} mm), x in [${minXMm}, ${maxXMm}] -- the lane is blocked or too narrow for the ${TABLE.reference.ballMm} mm ball`,
		).toBeGreaterThan(300);

		// And it never penetrates either wall bounding the lane: col_wall_lane's
		// lane-facing face at x = 480.4, col_wall_right's inner face at
		// x = 514.4. A ball centre closer than one radius to either has entered
		// the wall.
		expect(minXMm, `ball penetrated col_wall_lane: minimum table x = ${minXMm}`).toBeGreaterThanOrEqual(480.4 + radiusMm);
		expect(maxXMm, `ball penetrated col_wall_right: maximum table x = ${maxXMm}`).toBeLessThanOrEqual(514.4 - radiusMm);
	});

	it('...and the same run against the PRE-widening 20 mm lane does not, so this test discriminates', () => {
		// The original authored clearance (LANE_CLEAR_MM = 20, lane-facing face
		// at x = 494.4) is narrower than the 26.99 mm ball. Replaying the
		// identical launch against that geometry must NOT satisfy the
		// assertions above -- otherwise the test would pass whatever the lane
		// width, which is exactly the gap this pair of cases exists to close.
		const radiusMm = TABLE.reference.ballMm / 2;
		const { travelledMm, minXMm } = launchUpLane(494.4);
		const clean = travelledMm > 300 && minXMm >= 494.4 + radiusMm;
		expect(
			clean,
			`the 20 mm lane produced a clean traversal (travelled ${travelledMm} mm, min x ${minXMm}) -- the widened-lane assertions above are not discriminating`,
		).toBe(false);
	});
});
