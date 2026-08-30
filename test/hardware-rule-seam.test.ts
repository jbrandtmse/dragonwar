// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8's sweep, Part A: the user-directed hardware-rule registry
// (`src/sim/physics/machine.ts`'s `PRE_STEP_HARDWARE_RULES`), verified as a
// MANIFEST against the real source text -- never executed (see the spec's
// Design Notes, "The hardware-rule registry is a manifest, not an executable
// array", for why an executable loop would silently collapse `step()`'s
// three differently-ordered return-channel spreads into one order).
//
// Two independent checks, both table-driven over the manifest so a fifth
// hardware rule added later gets the same coverage automatically:
//   1. Ordering: every `receiver.method(` call site the manifest names must
//      appear in `step()`'s source TEXT before the `physics.step();`
//      statement, and never after it.
//   2. Completeness: every `const X = create…(...)` `createMachine()`
//      constructs must be either a manifest `receiver` or on the explicit
//      `NOT_A_HARDWARE_RULE` allowlist below -- so a sixth mechanics object
//      added without a manifest row fails loudly instead of silently
//      escaping both this test and AD-5.
//
// What this does NOT guarantee (state honestly, per the spec's Design
// Notes): (a) it only catches a participant built as a `const X =
// create…(...)` inside `createMachine` -- one built elsewhere or inlined
// escapes the scan, and the allowlist (not a regex) is where a developer
// would have to lie to hide one; (b) it is a source-text check on
// machine.ts ONLY -- a participant that keeps its call site but buffers its
// effect for the next tick passes this test, which is exactly why the four
// BEHAVIOURAL pins (flipper-mover.test.ts, plunger.test.ts,
// cabinet-integration.test.ts, machine-serve-drain.test.ts's eject-pose
// test) are not optional decoration; (c) a sub-rule added inside an
// existing participant is invisible to both checks; (d) the check is
// formatting-sensitive -- it splits on the literal statement
// `physics.step();` after stripping comments (line and block), so a
// reformat that changes that exact text surfaces as a clear failure here,
// not a silent pass.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRE_STEP_HARDWARE_RULES } from '../src/sim/physics/machine';

const REPO_ROOT = path.resolve(__dirname, '..');
const MACHINE_TS_PATH = path.resolve(REPO_ROOT, 'src', 'sim', 'physics', 'machine.ts');

/**
 * Every `const X = create…(...)` name `createMachine()` builds internally,
 * but is NOT itself a pre-step hardware rule:
 * - `switchTracker` runs its own `.step()` AFTER `physics.step()` (it
 *   consumes ball MOVEMENTS the step produces, not `frame`).
 * - `hopMechanics` (Story 1.9, AC 2) likewise runs its own
 *   `applyPostStep()` AFTER `physics.step()` -- it is a collision-RESPONSE
 *   modifier over what the step already produced (the ball's own
 *   post-step velocity change while a flipper bat is ACTIVELY ROTATING --
 *   its own measured angular velocity, deliberately not the raw coil-held
 *   boolean; see the hopControl entry in src/sim/table/tuning.ts), never a
 *   mover-commanding participant read from `frame` before the step runs.
 * Both are deliberately excluded from PRE_STEP_HARDWARE_RULES rather than
 * silently unlisted.
 */
const NOT_A_HARDWARE_RULE = new Set(['switchTracker', 'hopMechanics']);

/**
 * Strips line comments and block comments, so a call site mentioned only in
 * prose (machine.ts:11-25's own header names the physics-step call in
 * comments) can never be mistaken for the real statement. Simple and
 * sufficient here: no string or template literal in machine.ts contains a
 * comment-delimiter sequence (verified by inspection -- this file is small
 * and reviewed, unlike the general-purpose tokenizer tools/boundary-lint.mjs
 * needs for the whole of src/**).
 */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function loadMachineSource(): string {
	return readFileSync(MACHINE_TS_PATH, 'utf8');
}

function splitAtPhysicsStep(codeOnly: string): { pre: string; post: string } {
	const marker = 'physics.step();';
	const idx = codeOnly.indexOf(marker);
	if (idx === -1) {
		throw new Error(
			`hardware-rule-seam.test.ts: could not find the exact statement "${marker}" in machine.ts's stripped source -- ` +
			'this check splits on it literally; if step() was reformatted, update this test\'s marker to match.',
		);
	}
	return { pre: codeOnly.slice(0, idx), post: codeOnly.slice(idx + marker.length) };
}

describe('src/sim/physics/machine.ts -- PRE_STEP_HARDWARE_RULES is a real (never executed) manifest, checked against the source text', () => {
	it('the manifest is non-empty, or every check below would vacuously pass', () => {
		expect(PRE_STEP_HARDWARE_RULES.length).toBeGreaterThan(0);
	});

	it.each(PRE_STEP_HARDWARE_RULES.map((rule) => [rule.receiver, rule.method, rule.pinnedBy] as const))(
		'%s.%s(...) is called BEFORE physics.step() and never after it (pinned behaviourally by %s)',
		(receiver, method, pinnedBy) => {
			const { pre, post } = splitAtPhysicsStep(stripComments(loadMachineSource()));
			const callSite = `${receiver}.${method}(`;
			expect(pre, `"${callSite}" must appear before "physics.step();" in machine.ts's step()`).toContain(callSite);
			expect(post, `"${callSite}" must NOT appear after "physics.step();" in machine.ts's step() -- AD-5 forbids a hardware rule running one tick late`).not.toContain(callSite);

			// Review finding 2026-08-29: `pinnedBy` was destructured only to be
			// interpolated into this test's title -- the one field in each
			// manifest row carried at its declared value and never verified,
			// while `receiver` and `method` are both checked against the real
			// source. A renamed or deleted behavioural pin would leave the
			// manifest advertising coverage that no longer exists. Same
			// "no stale manifest entry" discipline PORT_BODY_HASHES and
			// ALLOWLIST_REASONS already apply to themselves.
			const pinnedByPath = path.resolve(REPO_ROOT, pinnedBy);
			expect(existsSync(pinnedByPath), `PRE_STEP_HARDWARE_RULES names "${pinnedBy}" as ${receiver}'s behavioural pin, but that file does not exist -- a stale manifest row advertising coverage that is gone`).toBe(true);
			// Deliberately EXISTENCE only, not content. A first attempt also
			// asserted the cited file mentions `receiver` by name; it failed,
			// correctly -- the four behavioural pins drive the seam through
			// `createLoop()`/`createMachine()`'s PUBLIC surface and never name
			// the internal `…Mechanics` const, which is the right way to write
			// them. Requiring the identifier would have pushed those tests
			// toward naming internals purely to satisfy this check.
		},
	);

	it('set-equality: every `const X = create…(...)` createMachine() constructs is either a manifest receiver or on NOT_A_HARDWARE_RULE, and every manifest receiver is really constructed', () => {
		const codeOnly = stripComments(loadMachineSource());
		const constructed = new Set<string>();
		const pattern = /const\s+(\w+)\s*=\s*create[A-Za-z]+\(/g;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(codeOnly)) !== null) {
			constructed.add(match[1]!);
		}
		expect(constructed.size, 'sanity: this scan must actually find createMachine()\'s own const declarations, or this check is vacuous').toBeGreaterThan(0);

		const manifestReceivers: Set<string> = new Set(PRE_STEP_HARDWARE_RULES.map((r): string => r.receiver));

		for (const name of constructed) {
			expect(
				manifestReceivers.has(name) || NOT_A_HARDWARE_RULE.has(name),
				`"${name}" is constructed by createMachine() but is neither a PRE_STEP_HARDWARE_RULES receiver nor on the explicit NOT_A_HARDWARE_RULE allowlist -- ` +
				'either it is a hardware rule missing a manifest row (AD-5 is now unpinned for it), or it genuinely is not one and belongs on the allowlist (a deliberate, reviewable edit, never a silent omission)',
			).toBe(true);
		}

		for (const receiver of manifestReceivers) {
			expect(constructed.has(receiver), `manifest receiver "${receiver}" is not constructed by createMachine() at all -- a stale or mistyped manifest row`).toBe(true);
		}
	});
});
