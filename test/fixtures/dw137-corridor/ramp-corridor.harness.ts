// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// DW-137, CLOSED by Story 2.1f ("The bottom-right corridor"). The
// OUT-OF-PROCESS half, mirroring
// test/fixtures/dw70-ad7/ad7-device-slots.harness.ts's own structural
// precedent (DW-70, Story 1.8): a `*.harness.ts` file under test/fixtures/**
// never matches `test/**/*.test.ts` (vitest.config.ts's own `include`, out of
// footprint) and tsconfig.node.json:31 excludes `test/fixtures/**` from
// typecheck, so this file runs ONLY via its own nested vitest project
// (`test/fixtures/dw137-corridor/vitest.harness.config.ts`, driven by the
// `check:corridor` script in package.json) -- never inside `pnpm test` or
// `pnpm typecheck`, and CI's own fixed script list never picks it up.
//
// THIS CHECK IS NOW INTENDED GREEN. It was shipped by Story 2.1c as a
// deliberately-red gate over a live defect: the Ramp channel was unreachable
// by any shot from below, in the committed geometry, by a measured 50.990 mm.
// Story 2.1f re-solved the bottom-right quadrant as one budget -- the
// slingshot span, both Ramp walls, the DRAGON bank and the Loop lane
// together -- and the same arithmetic now passes:
//
//   before (committed at 65c14b2): col_sling_r's west face 314.000,
//     col_ramp_wall_l's east face 338.000. Reachable centre 300.505,
//     required centre 351.495 -- a SHORTFALL of 50.990 mm.
//   after  (this document):        col_sling_r's west face 332.400,
//     col_ramp_wall_l's east face 298.400. Reachable centre 318.905,
//     required centre 311.895 -- a CLEARANCE of 7.010 mm, i.e. the corridor
//     overlaps the Ramp channel by 34.000 mm against a 26.990 mm ball.
//
// Both bounds are still read LIVE from the committed collision document
// rather than hardcoded, so this check tracks the geometry and not a frozen
// number: re-narrow the corridor and it goes red again, naming both faces,
// the ball diameter and the residual.
//
// A green run here is NOT on its own evidence that the Ramp is a shot. That
// half is behavioural and lives in the suite: test/util/shot-cases.ts
// declares `ramp-return-geometry` reachable via the witness
// `plunge-then-bat-r-3899` -- a 285-tick plunge, the Right Loop's own return
// onto the RIGHT bat, one flip, no teleport anywhere in it -- and
// test/shot-routing.test.ts drives that case and asserts s_ramp_enter closes
// before s_ramp_made and that the return feeds the right inlane. If this
// check is ever green while no witness reaches the channel, that is a false
// green and the corridor has been re-narrowed under a passing gate.
//
// `pnpm check:ad7` (DW-70, Story 2.5) is now the only intended-red check in
// this repository.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABLE } from '../../../src/sim/table/dragonwar';

const COLLISION_PATH = path.resolve(__dirname, '..', '..', '..', 'public', 'assets', 'dragonwar.collision.json');

interface BboxMm {
	min: { x: number; y: number; z: number };
	max: { x: number; y: number; z: number };
}

interface CollisionNode {
	name: string;
	bboxMm: BboxMm;
}

interface CollisionDoc {
	nodes: CollisionNode[];
}

function loadDoc(): CollisionDoc {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8')) as CollisionDoc;
}

function findNode(doc: CollisionDoc, name: string): CollisionNode {
	const node = doc.nodes.find((n) => n.name === name);
	if (!node) {
		throw new Error(`DW-137 harness: collision node "${name}" not found in the committed document`);
	}
	return node;
}

describe('DW-137 (closed by Story 2.1f): the bottom-right corridor admits a ball into the Ramp channel -- out-of-process harness', () => {
	it('a ball approaching from below can reach far enough east to enter the Ramp channel', () => {
		const doc = loadDoc();
		const ballRadiusMm = TABLE.reference.ballMm / 2;

		// The reachable envelope's own east bound: a ball cannot overlap
		// col_sling_r, so its centre can reach at most this far east while
		// approaching from below.
		const colSlingR = findNode(doc, 'col_sling_r');
		const maxReachableCentreXMm = colSlingR.bboxMm.min.x - ballRadiusMm;

		// The Ramp channel's own west bound: a ball cannot overlap
		// col_ramp_wall_l, so its centre must reach at least this far east to
		// enter the channel.
		const colRampWallL = findNode(doc, 'col_ramp_wall_l');
		const rampEntryMinCentreXMm = colRampWallL.bboxMm.max.x + ballRadiusMm;

		const clearanceMm = maxReachableCentreXMm - rampEntryMinCentreXMm;

		expect(
			maxReachableCentreXMm,
			`DW-137: the bottom-right approach corridor must admit a ${TABLE.reference.ballMm} mm ball into the Ramp ` +
				`channel. A ball approaching from below can push its centre to x = ${maxReachableCentreXMm.toFixed(3)} mm ` +
				`(col_sling_r's west face at ${colSlingR.bboxMm.min.x.toFixed(3)} minus the ${ballRadiusMm.toFixed(3)} mm ` +
				`ball radius), and entering the Ramp channel needs a centre of at least ` +
				`x = ${rampEntryMinCentreXMm.toFixed(3)} mm (col_ramp_wall_l's east face at ` +
				`${colRampWallL.bboxMm.max.x.toFixed(3)} plus the ball radius) -- a residual of ` +
				`${clearanceMm.toFixed(3)} mm. Story 2.1f re-solved this corridor; a negative residual here means it has ` +
				`been re-narrowed and the Ramp is unreachable again.`,
		).toBeGreaterThanOrEqual(rampEntryMinCentreXMm);
	});
});
