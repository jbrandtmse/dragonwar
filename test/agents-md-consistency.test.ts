// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// DW-5: three scaffold-stage TODOs in AGENTS.md's managed `<!-- bmad:context
// --> ... <!-- /bmad:context -->` block outlived the scaffolding they were
// written against -- claiming `package.json` and `.github/workflows/ci.yml`
// did not exist (they both do), and naming an `AD-1..AD-17` invariant range
// the spine had already grown past (`AD-1..AD-19`). A snapshot test pinning
// the block's exact prose would itself be fragile against a legitimate
// `bmad-project-context` refresh, so this is a CONSISTENCY check instead:
// it computes each fact fresh from its own source of truth at test time,
// so it fails on drift in either direction -- a stale claim left behind by
// a partial refresh, or a refreshed AGENTS.md that no longer matches a
// spine/toolchain that changed after it.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const AGENTS_MD_PATH = path.join(REPO_ROOT, 'AGENTS.md');
const SPINE_PATH = path.join(
	REPO_ROOT,
	'_bmad-output',
	'planning-artifacts',
	'architecture',
	'architecture-dragonwar-2026-08-26',
	'ARCHITECTURE-SPINE.md',
);
const CI_WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml');
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');

function readAgentsMd(): string {
	return readFileSync(AGENTS_MD_PATH, 'utf8');
}

/** Highest `### AD-<n>` heading in the spine, computed fresh -- never a hard-coded number. */
function highestSpineAdNumber(): number {
	const spine = readFileSync(SPINE_PATH, 'utf8');
	const pattern = /^### AD-(\d+)\b/gm;
	let max = -Infinity;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(spine)) !== null) {
		max = Math.max(max, Number(match[1]));
	}
	if (!Number.isFinite(max)) {
		throw new Error(`found no "### AD-<n>" heading in ${path.relative(REPO_ROOT, SPINE_PATH)} -- the spine changed shape, or this pattern is out of date`);
	}
	return max;
}

describe('AGENTS.md -- consistency with the spine and the real toolchain (DW-5)', () => {
	it('sanity: the spine actually contains at least one "### AD-n" heading, or the computed max below is vacuous', () => {
		expect(highestSpineAdNumber()).toBeGreaterThan(0);
	});

	it('names the AD-1..AD-N invariant range that matches the spine\'s own highest heading, computed at test time', () => {
		const agentsMd = readAgentsMd();
		const expected = highestSpineAdNumber();
		const match = /AD-1\.\.AD-(\d+)/.exec(agentsMd);
		expect(match, 'AGENTS.md does not name an "AD-1..AD-N" range at all').not.toBeNull();
		expect(Number(match![1]), `AGENTS.md names AD-1..AD-${match?.[1]}, but the spine's highest heading is AD-${expected}`).toBe(expected);
	});

	it('does not claim package.json is absent while it exists', () => {
		expect(existsSync(PACKAGE_JSON_PATH), 'sanity: package.json must actually exist for this claim to mean anything').toBe(true);
		const agentsMd = readAgentsMd();
		expect(agentsMd).not.toMatch(/no `?package\.json`? yet/i);
	});

	it('does not claim the CI workflow is absent / not yet written while it exists', () => {
		expect(existsSync(CI_WORKFLOW_PATH), 'sanity: .github/workflows/ci.yml must actually exist for this claim to mean anything').toBe(true);
		const agentsMd = readAgentsMd();
		expect(agentsMd).not.toMatch(/not yet written/i);
	});
});
