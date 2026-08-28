// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2's results document, docs/spikes/spike-3.md, carries several
// AC-named structural requirements. Mirrors test/spike-1-docs.test.ts's
// approach: content-based, whitespace-normalised, deliberately not
// heading-position-based, so a future rewrap or reorganisation doesn't break
// these on its own -- only a regression in the actual content they pin does.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { BUDGET_BYTES } from '../tools/size-budget.mjs';

const DOC_PATH = path.resolve(__dirname, '..', 'docs', 'spikes', 'spike-3.md');
const LEDGER_PATH = path.resolve(
	__dirname, '..', '_bmad-output', 'implementation-artifacts', 'deferred-work.md',
);
const CI_WORKFLOW_PATH = path.resolve(__dirname, '..', '.github', 'workflows', 'ci.yml');

function normalize(text: string): string {
	return text.replace(/\s+/g, ' ');
}

describe('docs/spikes/spike-3.md -- results document structure (Story 1.2 AC)', () => {
	const raw = readFileSync(DOC_PATH, 'utf8');
	const normalized = normalize(raw);

	it('states a verdict', () => {
		expect(normalized).toMatch(/verdict:?\s*\*{0,2}(PASS|FAIL)/i);
	});

	it('records the reproducible build, preview and measurement commands (closes DW-11)', () => {
		expect(normalized).toContain('pnpm build');
		expect(normalized).toContain('pnpm preview');
		expect(normalized).toContain('node tools/spike-3/measure-load.mjs');
		expect(normalized).toMatch(/supersedes/i);
		expect(normalized).toContain('547-559');
	});

	it('names the machine, browser version and date of the measurement runs', () => {
		expect(normalized).toContain('NOMAD');
		expect(normalized).toMatch(/Windows 11 Pro/);
		expect(normalized).toMatch(/Chrome 152\.\d+\.\d+\.\d+/);
		expect(normalized).toContain('2026-08-28');
	});

	it('records the throttling parameters, including the latency actually applied', () => {
		expect(normalized).toMatch(/6,?250,?000/);
		expect(normalized).toMatch(/50\s*Mbps/);
		expect(normalized).toMatch(/latency[^.]*20\s*ms/i);
	});

	it('records the cadence-guard threshold and its rationale', () => {
		expect(normalized).toMatch(/20\s*ms/);
		expect(normalized).toMatch(/16\.67\s*ms/);
		expect(normalized).toMatch(/34\.\d\s*ms|34\.6\s*ms/); // the DW-16 defect signature this guard rejects
	});

	it('records which engine was chosen and the WebGPU initialisation outcome under the pinned CSP', () => {
		expect(normalized).toMatch(/webgl2-fallback/);
		expect(normalized).toMatch(/WebGPU/);
		expect(normalized).toMatch(/createRenderPipeline/);
		expect(normalized).toMatch(/GPUDevice/);
	});

	it('records the actual console evidence for the WebGPU->WebGL2 fallback', () => {
		expect(normalized).toContain("Failed to execute 'createRenderPipeline' on 'GPUDevice'");
		expect(normalized).toContain('arrayStride');
	});

	it('records the CSP-blocked data: URI defect and its fix, without weakening the CSP', () => {
		expect(normalized).toMatch(/data:image\/png;base64/);
		expect(normalized).toMatch(/Content Security Policy/);
		expect(normalized).toMatch(/RawTexture/);
		expect(normalized).toMatch(/environmentBRDFTexture|environment-BRDF/i);
	});

	it('marks the Safari/macOS leg PENDING, referencing ledger entry DW-1 by name', () => {
		expect(normalized).toMatch(/PENDING/);
		expect(normalized).toContain('Author-owned: macOS / Safari measurement legs');
	});

	it('references DW-11, DW-13 and DW-16 by name, and both entries actually exist in deferred-work.md', () => {
		expect(normalized).toMatch(/`?DW-11`?/);
		expect(normalized).toMatch(/`?DW-13`?/);
		expect(normalized).toMatch(/`?DW-16`?/);
		const ledger = normalize(readFileSync(LEDGER_PATH, 'utf8'));
		expect(ledger).toContain('DW-11');
		expect(ledger).toContain('DW-13');
		expect(ledger).toContain('DW-16');
		expect(ledger).toContain('DW-1:');
	});

	it('records the CI run id and URL on a real push', () => {
		expect(normalized).toMatch(/github\.com\/jbrandtmse\/dragonwar\/actions\/runs\/\d+/);
		expect(normalized).toMatch(/\b3313441254\d\b/);
	});

	it('records the size budget arithmetic (baseline, rounding, headroom) and the re-setting stories', () => {
		// The final budget figure is cross-checked against tools/size-budget.mjs's
		// real, exported BUDGET_BYTES rather than a value hardcoded here: this
		// story's own measured baseline is provisional pending the lead's
		// independent re-measurement (see this spec's Review Triage Log), so a
		// literal MB figure here would fail the moment a legitimate
		// re-measurement updates BUDGET_BYTES without a separate doc-only edit
		// (review finding 2026-08-28). Cross-checking keeps the assertion
		// meaningful -- the document and the script that actually enforces the
		// budget in CI must agree -- without being brittle against a correction.
		const budgetMb = (BUDGET_BYTES / 1_000_000).toFixed(2);
		expect(normalized).toContain(`${budgetMb} MB`);
		expect(normalized).toMatch(/rounded up/i);
		expect(normalized).toMatch(/headroom/i);
		expect(normalized).toMatch(/Story 1\.4/);
		expect(normalized).toMatch(/Epic 5/);
	});

	it('records the one-glb-versus-split decision with supporting numbers and a numeric reopen condition', () => {
		expect(normalized).toMatch(/keep the single/i);
		expect(normalized).toMatch(/1,?560 bytes/);
		expect(normalized).toMatch(/40%/);
		expect(normalized).toMatch(/30%/);
	});

	it('states in its own sentence that the measured artifact is provisional, built from an unmerged branch', () => {
		expect(normalized).toMatch(/provisional/i);
		expect(normalized).toMatch(/unmerged/i);
		expect(normalized).toMatch(/DW-1-epic1/);
		expect(normalized).toMatch(/reruns from `?main`?/);
	});

	it('records every raw sample, the median, the range and the run count for both the deployed link and the local control', () => {
		// The exact byte-transfer figures are THIS PASS's live measurements,
		// explicitly flagged provisional pending the lead's independent
		// re-measurement (see this spec's Review Triage Log) -- pinning them
		// literally would fail the moment a legitimate re-measurement updates
		// the document. Assert the required STRUCTURE instead: at least 5
		// distinct byte-count-shaped raw samples under the deployed-link
		// section and at least 1 under the local-preview section, plus the
		// median/range vocabulary the AC requires (review finding 2026-08-28).
		const deployedStart = raw.indexOf('Deployed link');
		const localStart = raw.indexOf('Local preview control');
		expect(deployedStart).toBeGreaterThanOrEqual(0);
		expect(localStart).toBeGreaterThan(deployedStart);
		const byteCountPattern = /\b\d{1,3}(?:,\d{3})+\b/g;
		const deployedCounts = new Set(raw.slice(deployedStart, localStart).match(byteCountPattern) ?? []);
		const localCounts = new Set(raw.slice(localStart).match(byteCountPattern) ?? []);
		expect(deployedCounts.size).toBeGreaterThanOrEqual(5);
		expect(localCounts.size).toBeGreaterThanOrEqual(1);
		expect(normalized).toMatch(/median/i);
		expect(normalized).toMatch(/range/i);
	});

	it('states the 10s / 20MB NFR-4 targets alongside the measured figures', () => {
		expect(normalized).toMatch(/10\s*s/);
		expect(normalized).toMatch(/20\s*MB/);
		expect(normalized).toMatch(/NFR-4/);
	});
});

describe('.github/workflows/ci.yml -- deploy trigger narrowed back (Story 1.2 seventh AC)', () => {
	it('no longer mentions DW-1-epic1 anywhere in the committed workflow', () => {
		const workflow = readFileSync(CI_WORKFLOW_PATH, 'utf8');
		expect(workflow).not.toMatch(/DW-1-epic1/);
	});

	it('the push trigger is main plus workflow_dispatch only', () => {
		const workflow = readFileSync(CI_WORKFLOW_PATH, 'utf8');
		expect(workflow).toMatch(/branches:\s*\[main\]/);
		expect(workflow).toMatch(/workflow_dispatch/);
	});
});

// Review 2026-08-28: the block above pins only the workflow's TRIGGER. Nothing
// pinned the steps that actually gate the build, so deleting the size-budget
// step, adding `continue-on-error: true` to the static-bundle check, or dropping
// `needs: checks` from the deploy job all left 288 tests and `pnpm typecheck`
// green while letting an over-budget or CSP-less build deploy to Pages.
describe('.github/workflows/ci.yml -- the checks that gate the build actually gate it', () => {
	const gatingSteps = [
		'pnpm typecheck',
		'pnpm test',
		'pnpm build',
		'pnpm check:dist',
		'pnpm check:size',
	];

	for (const step of gatingSteps) {
		it(`runs "${step}" in the checks job`, () => {
			const workflow = readFileSync(CI_WORKFLOW_PATH, 'utf8');
			expect(workflow).toContain(`run: ${step}`);
		});
	}

	it('lets no step opt out of failing the job', () => {
		const workflow = readFileSync(CI_WORKFLOW_PATH, 'utf8');
		expect(workflow).not.toMatch(/continue-on-error/);
	});

	it('gates the deploy job on the checks job', () => {
		const workflow = readFileSync(CI_WORKFLOW_PATH, 'utf8');
		expect(workflow).toMatch(/needs:\s*checks/);
	});

	it('deploys only from main, so workflow_dispatch on another branch cannot ship', () => {
		const workflow = readFileSync(CI_WORKFLOW_PATH, 'utf8');
		expect(workflow).toMatch(/github\.ref == 'refs\/heads\/main'/);
	});
});
