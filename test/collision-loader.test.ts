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
import { HitLineZ } from '../src/sim/physics/hit-line-z';
import { LineSeg } from '../src/sim/physics/line-seg';
import { HitTriangle } from '../src/sim/physics/hit-triangle';
import { PlayerPhysics } from '../src/sim/physics/game/player-physics';
import { HitPlane } from '../src/sim/physics/hit-plane';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex2D } from '../src/sim/physics/math/vertex2d';
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

	// DW-48: the assertion must be PER-AXIS (x, since the committed body is
	// x-major), not `Math.max` over all three extents -- a bat that measures
	// the reference length on the WRONG axis must still throw, naming the
	// node, the axis, the measured value and the expected value.
	it('DW-48: throws naming the node and the axis when col_flipper_l measures the reference length on y instead of x', () => {
		const doc = loadMutableCommittedDoc();
		const flipperNode = doc.nodes.find((n) => n.name === TABLE.nodes.colFlipperL)! as MutableNode & { bboxMm: { min: { x: number; y: number }; max: { x: number; y: number } } };
		const expectedMm = TABLE.reference.flipperBatIn * 25.4;

		// Shrink x to something implausibly short, and widen y to EXACTLY the
		// reference bat length -- the axis-agnostic `Math.max` regression would
		// pass this (SOME axis is long enough); the per-axis fix must not.
		flipperNode.bboxMm.max.x = flipperNode.bboxMm.min.x + 5;
		flipperNode.bboxMm.max.y = flipperNode.bboxMm.min.y + expectedMm;

		try {
			loadCollision(doc);
			expect.fail('loadCollision() should have thrown');
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain(TABLE.nodes.colFlipperL);
			expect(message, 'the throw must name the AXIS it measured, not just the node').toMatch(/x axis/);
			// Code review 2026-08-29: this was `toContain('5')`, which cannot
			// fail -- the expected value 79.375 is in the same message and
			// contains a '5' regardless of what was measured. Anchored to the
			// measured value's own phrase instead, so a throw that reported the
			// wrong number now fails.
			expect(message, 'the throw must report the value it actually measured').toContain('is 5 mm');
			expect(message).toContain(String(expectedMm));
		}
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

describe('src/sim/physics/loader -- DW-45: the version/units/frame load-time handshake', () => {
	it('throws naming "units" when it is "m" instead of "mm" -- must never load silently at 1000x scale', () => {
		const doc = loadMutableCommittedDoc() as unknown as { units: string };
		doc.units = 'm';
		try {
			loadCollision(doc);
			expect.fail('loadCollision() should have thrown');
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain('units');
			expect(message).toContain('"m"');
			expect(message).toContain('"mm"');
		}
	});

	it('throws naming "version" when it is 2 instead of 1', () => {
		const doc = loadMutableCommittedDoc() as unknown as { version: number };
		doc.version = 2;
		try {
			loadCollision(doc);
			expect.fail('loadCollision() should have thrown');
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain('version');
			expect(message).toContain('2');
			expect(message).toContain('1');
		}
	});

	it('throws naming "frame" when it is absent entirely', () => {
		const doc = loadMutableCommittedDoc() as unknown as { frame?: string };
		delete doc.frame;
		try {
			loadCollision(doc);
			expect.fail('loadCollision() should have thrown');
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain('frame');
			expect(message).toContain('"table"');
		}
	});
});

describe('src/sim/physics/loader -- devices parsing (Story 1.5, first reader of document.devices)', () => {
	it('parses every device into LoadedCollision.devices, each with its eject pose', () => {
		const doc = loadCommittedDoc();
		const { devices } = loadCollision(doc);
		expect(devices.length).toBeGreaterThan(0);
		const names = devices.map((d) => d.name).sort();
		expect(names).toEqual([...Object.keys(TABLE.ballDevices)].sort());
		for (const device of devices) {
			expect(typeof device.ejectPose.posMm.x).toBe('number');
			expect(typeof device.ejectPose.dir.x).toBe('number');
		}
	});

	it('throws naming an unknown device name rather than silently casting it', () => {
		const doc = loadMutableCommittedDoc() as unknown as { devices: Array<{ name: string }> };
		doc.devices[0].name = 'bd_not_a_real_device';
		expect(() => loadCollision(doc)).toThrowError(/bd_not_a_real_device/);
	});
});

describe('src/sim/physics/loader -- ledger DW-7 (answered and closed): a rolling ball reaches a wall corner through HitLineZ', () => {
	it('firing a ball ROLLING AT DECK HEIGHT (centre z = ball radius, not z = 0) into a wall corner of the loaded compound body runs HitLineZ.collide()', () => {
		const doc = loadCommittedDoc();
		const { physics } = loadCollision(doc);

		// col_wall_lane's lane-facing corner (table (480.4, 950) -- the far end
		// of its now-real lane-facing face, open space beyond it: the lane wall
		// simply ends there so a launched ball can cross into the main field)
		// is a real, literal corner of THIS story's own placeholder geometry
		// (not tools/spike-1/scene.ts, which stays untouched -- the reason this
		// closes ledger DW-7 from here).
		const collideSpy = vi.spyOn(HitLineZ.prototype, 'collide');

		const data = new BallData(26.99 / 2 / 0.53975, 1, 1);
		const cornerPhysics = toPhysics({ x: 480.4, y: 950, z: 0 });

		// DECK HEIGHT: centre z = one ball radius -- exactly where a rolling
		// ball actually sits, and exactly what the SUPERSEDED HitPoint
		// construction (z = zLow) could not reach except at a near-zero
		// horizontal offset (this loader's own header: "a HitPoint at z = 0 is
		// tangent to a deck-rolling ball's surface by construction"). Approached
		// DIAGONALLY from OUTSIDE both adjacent edges' own segment extent
		// (table x > 480.4 AND y > 950 -- past both the lane-facing edge's and
		// the top edge's own endpoint): a rolling ball is tall enough to touch
		// the flat wall FACES near the corner, so aiming straight along either
		// edge's own line hits that edge's LineSeg, not the corner -- only this
		// diagonal "outside both segments" approach isolates the corner
		// primitive itself, the actual DW-7 gap between two perpendicular
		// LineSegs.
		const start = new Vertex3D(cornerPhysics.x + 6, cornerPhysics.y - 6, data.radius);
		const state = new BallState('CornerBallDeckHeight', start);
		const velocity = new Vertex3D(-6, 6, 0);
		const ball = new Ball(0, data, state, velocity, TABLE_DATA);
		physics.addBall(ball);

		for (let i = 0; i < 50 && collideSpy.mock.calls.length === 0; i++) {
			physics.step();
		}

		expect(collideSpy).toHaveBeenCalled();
		collideSpy.mockRestore();
	});

	it('the SAME rolling-ball approach produces ZERO collisions against the pre-change construction (a bare HitPoint at z = zLow) -- proving the defect was real, not merely that HitLineZ happens to fire', () => {
		// A minimal side-by-side scene (not the committed geometry, whose
		// corner already has real walls around it that would confound a
		// direct comparison): a floor, a glass ceiling, and ONE corner
		// primitive of each kind at the identical (x, y) position, each fired
		// at by the identical deck-height trajectory with a horizontal
		// closest-approach offset comfortably inside the ball's radius (so a
		// HitLineZ, which tests horizontal distance only, is guaranteed to
		// register a hit if reachable at all) but with the ball's centre at
		// z = radius against a point at z = 0 -- a 3D distance of
		// sqrt(offsetHorizontal^2 + radius^2), which EXCEEDS the ball's radius
		// for any nonzero horizontal offset, so the point can mathematically
		// never be touched. This is DW-7's own answer, reproduced directly
		// rather than merely asserted.
		const radiusVu = 26.99 / 2 / MM_PER_VU;
		const cornerX = 100;
		const cornerY = 100;
		// A closest-approach horizontal offset of half a radius: well inside
		// range for HitLineZ, but -- combined with the z = radius vs z = 0
		// height difference -- geometrically unreachable for a single point.
		const offset = radiusVu / 2;

		function buildBall(): Ball {
			const data = new BallData(radiusVu, 1, 1);
			const start = new Vertex3D(cornerX + 40, cornerY + offset, radiusVu);
			const state = new BallState('SideBySideBall', start);
			const velocity = new Vertex3D(-8, 0, 0);
			return new Ball(0, data, state, velocity, TABLE_DATA);
		}

		function buildScene(corner: HitLineZ | HitPoint): PlayerPhysics {
			const physics = new PlayerPhysics();
			const playfield = new HitPlane(new Vertex3D(0, 0, 1), 0);
			playfield.setElasticity(0.3, 0).setFriction(0.3).setScatter(0);
			physics.setPlayfieldHit(playfield);
			const topGlass = new HitPlane(new Vertex3D(0, 0, -1), -500);
			topGlass.setElasticity(0.3, 0).setFriction(0.3).setScatter(0);
			physics.setTopGlassHit(topGlass);
			corner.setElasticity(0.3, 0).setFriction(0.3).setScatter(0);
			physics.addStaticHitObject(corner);
			physics.finalizeStatics();
			return physics;
		}

		const lineZSpy = vi.spyOn(HitLineZ.prototype, 'collide');
		const lineZScene = buildScene(new HitLineZ(new Vertex2D(cornerX, cornerY), 0, 50));
		lineZScene.addBall(buildBall());
		for (let i = 0; i < 50; i++) {
			lineZScene.step();
		}
		expect(lineZSpy, 'HitLineZ must catch a rolling ball offset by less than its radius').toHaveBeenCalled();
		lineZSpy.mockRestore();

		const pointSpy = vi.spyOn(HitPoint.prototype, 'collide');
		const pointScene = buildScene(new HitPoint(new Vertex3D(cornerX, cornerY, 0)));
		pointScene.addBall(buildBall());
		for (let i = 0; i < 50; i++) {
			pointScene.step();
		}
		expect(pointSpy, 'the pre-change HitPoint(z = zLow) construction must NOT catch the identical rolling-ball approach -- this is the DW-7 defect').not.toHaveBeenCalled();
		pointSpy.mockRestore();
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

// Superseded (Story 1.6): the box-orientation regression this describe block
// guarded (outwardTriangle()'s winding, verified by firing a ball at
// col_flipper_l's static box face) can no longer be exercised against the
// COMMITTED document -- col_flipper_l/col_flipper_r were the only two
// box-shaped nodes in it, and both are now excluded from addBox()'s dispatch
// entirely (DW-60: a moving bat must not also exist as a static box).
// outwardTriangle() itself is UNCHANGED by this story; it simply has no real
// caller left in the committed geometry. Replaced with the two assertions
// this story's own task list calls for: the flipper nodes are surfaced on
// `LoadedCollision.flippers` with the geometry derived from their committed
// bboxMm, and no static hit object exists at either node's old location any
// more (not merely narrowed to a slot -- gone).
describe('src/sim/physics/loader -- flippers are surfaced, not registered as static geometry (Story 1.6, DW-60)', () => {
	it('loadCollision() surfaces both flipper nodes on LoadedCollision.flippers with the derived pivot/tip/length/half-width', () => {
		const doc = loadCommittedDoc();
		const { flippers } = loadCollision(doc);

		expect(flippers).toHaveLength(2);
		const left = flippers.find((f) => f.side === 'l');
		const right = flippers.find((f) => f.side === 'r');
		expect(left, 'no "l"-side flipper').toBeDefined();
		expect(right, 'no "r"-side flipper').toBeDefined();
		expect(left!.name).toBe(TABLE.nodes.colFlipperL);
		expect(right!.name).toBe(TABLE.nodes.colFlipperR);

		const expectedBatMm = TABLE.reference.flipperBatIn * 25.4;
		expect(left!.lengthMm).toBeCloseTo(expectedBatMm, 1);
		expect(right!.lengthMm).toBeCloseTo(expectedBatMm, 1);
		expect(left!.halfWidthMm).toBeCloseTo(12.5, 1);
		expect(right!.halfWidthMm).toBeCloseTo(12.5, 1);
		expect(left!.zLowMm).toBeCloseTo(0, 1);
		expect(left!.zHighMm).toBeCloseTo(20, 1);

		// The pivot is the end FARTHER from the playfield x-centre (this
		// story's own Design Notes): col_flipper_l spans x [170, 249.375] --
		// its pivot is the near-170 end, its tip the near-249.375 end.
		// col_flipper_r spans x [265.025, 344.4] -- mirrored.
		expect(left!.pivotMm.x).toBeCloseTo(170.0, 1);
		expect(left!.tipMm.x).toBeCloseTo(249.375, 1);
		expect(right!.pivotMm.x).toBeCloseTo(344.4, 1);
		expect(right!.tipMm.x).toBeCloseTo(265.025, 1);
	});

	it('a ball fired at col_flipper_l\'s OLD static-box face location never triggers HitTriangle.collide() -- the box is gone, not merely slotted', () => {
		const doc = loadCommittedDoc();
		const { physics } = loadCollision(doc);

		// The exact trajectory the superseded static-box regression guard
		// used: aimed at the middle of the old box's +Y face.
		const collideSpy = vi.spyOn(HitTriangle.prototype, 'collide');

		const data = new BallData(26.99 / 2 / 0.53975, 1, 1);
		const targetPhysics = toPhysics({ x: 210, y: 82.5, z: 10 });
		const startPhysics = toPhysics({ x: 210, y: 150, z: 10 });
		const dx = targetPhysics.x - startPhysics.x;
		const dy = targetPhysics.y - startPhysics.y;
		const len = Math.hypot(dx, dy) || 1;
		const speed = 8;

		const start = new Vertex3D(startPhysics.x, startPhysics.y, targetPhysics.z);
		const state = new BallState('FlipperGoneBall', start);
		const velocity = new Vertex3D((dx / len) * speed, (dy / len) * speed, 0);
		const ball = new Ball(0, data, state, velocity, TABLE_DATA);
		physics.addBall(ball);

		for (let i = 0; i < 300; i++) {
			physics.step();
		}

		expect(collideSpy, 'no HitTriangle exists at the old flipper box location any more').not.toHaveBeenCalled();
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

	// Story 1.6, I/O matrix "Flipper node is not a static box" row, Error
	// Handling column: "The two nodes are still validated for length and
	// material" -- even though the flipper's OWN hit shape (built by
	// sim/physics/flippers.ts) does not read this field back (it applies
	// TUNING.materials.flipper_rubber unconditionally), the committed
	// document's phys_material value is still checked at load time.
	it('throws naming the flipper node and the bad value when col_flipper_l names an unrecognized phys_material', () => {
		const doc = loadMutableCommittedDoc();
		const flipperNode = doc.nodes.find((n) => n.name === TABLE.nodes.colFlipperL)!;
		flipperNode.physMaterial = 'unobtainium';

		try {
			loadCollision(doc);
			expect.fail('loadCollision() should have thrown');
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain(TABLE.nodes.colFlipperL);
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
	// nothing read any of those values back: dropping the lookup or removing
	// the setter calls entirely left the whole suite green -- measured during
	// this story's re-review by simulating exactly that regression. AD-15
	// makes these the per-object feel parameters, so a silent no-op here is a
	// material behaving like bare wood, discovered as a feel problem with no
	// failing test pointing at its cause.
	//
	// Story 1.6: the two `physMaterial: "flipper_rubber"` nodes in the
	// committed document (`col_flipper_l`/`col_flipper_r`) no longer reach
	// `addBox()`/`applyMaterial()` at all -- they are surfaced as
	// `LoadedCollision.flippers` instead (see the describe block above) and
	// their material is applied by `sim/physics/flippers.ts`'s own
	// `setElasticity()`/`setFriction()`/`setScatter()` calls on the
	// `FlipperHit`, pinned in `test/flipper-collision.test.ts`. This test now
	// covers the wall segments only -- the committed document's only
	// remaining `applyMaterial()` callers.
	it('wall segments carry the materials authored in the collision document (default)', () => {
		const doc = loadCommittedDoc();

		const applied = new Map<string, { elasticity: number; falloff: number | undefined; friction: number; scatter: number }>();
		const track = (key: string) => {
			const record = applied.get(key) ?? { elasticity: NaN, falloff: undefined, friction: NaN, scatter: NaN };
			applied.set(key, record);
			return record;
		};
		const spies = [
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

		const plain = TUNING.materials.default;

		const wall = applied.get('wall');
		expect(wall, 'no LineSeg was built -- the wall footprints did not reach applyMaterial()').toBeDefined();
		expect(wall!.elasticity, 'wall LineSeg elasticity').toBe(plain.elasticity.value);
		expect(wall!.falloff, 'wall LineSeg elasticityFalloff').toBe(plain.elasticityFalloff.value);
		expect(wall!.friction, 'wall LineSeg friction').toBe(plain.friction.value);
		expect(wall!.scatter, 'wall LineSeg scatter').toBe(plain.scatter.value);
	});

	it('no HitTriangle reaches applyMaterial() any more -- the only box-shaped nodes in the committed document are the two flippers, now excluded (DW-60)', () => {
		const doc = loadCommittedDoc();
		const setElasticitySpy = vi.spyOn(HitTriangle.prototype, 'setElasticity');
		try {
			loadCollision(doc);
		} finally {
			setElasticitySpy.mockRestore();
		}
		expect(setElasticitySpy).not.toHaveBeenCalled();
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
