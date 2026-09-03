// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1c, DW-137's red test (spec's own "Tasks & Acceptance", the
// "2026-09-03 -- lead rework dispatch (final iteration)" dated heading,
// item 1) -- the OUT-OF-PROCESS half, mirroring
// test/fixtures/dw70-ad7/ad7-device-slots.harness.ts's own precedent (DW-70,
// Story 1.8): a `*.harness.ts` file under test/fixtures/** never matches
// `test/**/*.test.ts` (vitest.config.ts's own `include`, out of footprint)
// and tsconfig.node.json:31 excludes `test/fixtures/**` from typecheck, so
// this file runs ONLY via its own nested vitest project
// (`test/fixtures/dw137-corridor/vitest.harness.config.ts`, driven by the
// `check:corridor` script in package.json) -- never inside `pnpm test` or
// `pnpm typecheck`, and CI's own fixed script list never picks it up.
// `test/dw137-corridor-gate.test.ts` is the IN-SUITE wrapper that spawns
// this as a subprocess and asserts the failure's own CONTENT.
//
// DW-137 (chartered out of this story into Story 2.1f, "The bottom-right
// corridor"): the Ramp channel is unreachable by any shot from below, in
// the COMMITTED geometry, today. Both bounds below are read live from the
// committed collision document rather than hardcoded, so this check tracks
// the geometry, not a frozen number:
//   - a ball approaching from below cannot overlap `col_sling_r`, so its
//     centre can reach at most `col_sling_r`'s west face minus the ball
//     radius;
//   - entering the Ramp channel needs the ball's centre to clear
//     `col_ramp_wall_l`, i.e. at least that body's east face plus the ball
//     radius.
// Today the first bound (300.505 mm) sits WEST of the second (351.495 mm)
// -- a 50.990 mm gap no ball can cross -- so this harness is RED TODAY, by
// design. Do NOT "fix" this harness to make it pass, and do NOT re-solve
// the corridor here: Story 2.1f owns the fix (re-solving the slingshot
// span, both Ramp walls, the DRAGON bank and the Loop lane budget
// together), and this story's own boundaries forbid moving `col_sling_r`
// or either Ramp wall. Do NOT pin the shortfall as an expected value that
// goes green -- a test asserting a defect is correct is the laundering
// class this epic has hit repeatedly, and this check exists to prevent
// exactly that (Rule 19).
//
// Story 2.1f's own AC (epics.md): "Given the deliberately-red corridor
// gate Story 2.1c ships / When this story lands / Then that gate goes
// green because the corridor genuinely admits a ball, and its
// intended-red documentation is removed in the same change." When 2.1f
// re-solves the corridor, THIS assertion is the one that goes green -- and
// `test/dw137-corridor-gate.test.ts` then goes red, by design, until its
// own wrapper (and this file's header) are updated in the same change
// (mirroring DW-70's own documentation convention).

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

describe('DW-137 (Story 2.1f): the bottom-right corridor does not admit a ball into the Ramp channel -- out-of-process harness', () => {
	it('a ball approaching from below can reach far enough east to enter the Ramp channel -- RED TODAY, by design', () => {
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

		const shortfallMm = rampEntryMinCentreXMm - maxReachableCentreXMm;

		expect(
			maxReachableCentreXMm,
			`DW-137 (Story 2.1f, "The bottom-right corridor"): the bottom-right approach corridor does not admit a ` +
				`${TABLE.reference.ballMm} mm ball into the Ramp channel. A ball approaching from below cannot push its ` +
				`centre past x = ${maxReachableCentreXMm.toFixed(3)} mm (col_sling_r's west face at ` +
				`${colSlingR.bboxMm.min.x.toFixed(3)} minus the ${ballRadiusMm.toFixed(3)} mm ball radius), but entering ` +
				`the Ramp channel needs a centre of at least x = ${rampEntryMinCentreXMm.toFixed(3)} mm ` +
				`(col_ramp_wall_l's east face at ${colRampWallL.bboxMm.max.x.toFixed(3)} plus the ball radius) -- a ` +
				`shortfall of ${shortfallMm.toFixed(3)} mm. This is the live, uncaught DW-137 defect: Story 2.1f owns ` +
				`the fix (re-solving the slingshot span, both Ramp walls, the DRAGON bank and the Loop lane budget ` +
				`together); this harness only names it with a real, running red. Do NOT fix DW-137 here.`,
		).toBeGreaterThanOrEqual(rampEntryMinCentreXMm);
	});
});
