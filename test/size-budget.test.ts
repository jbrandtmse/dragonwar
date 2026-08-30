// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- real subprocess invocations of tools/size-budget.mjs
// (the test/measure-cli.test.ts pattern) against a fixture dist/, including
// the AC's deliberately-failing case: a real script run with the budget
// lowered below the real measurement, asserting the exit code and BOTH
// numbers in the message -- not inspection of the source.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { measureGzippedDist, BUDGET_BYTES } from '../tools/size-budget.mjs';

const SIZE_BUDGET_SCRIPT = path.resolve(__dirname, '..', 'tools', 'size-budget.mjs');
const RUN_TIMEOUT_MS = 10_000;

const createdDirs: string[] = [];

function makeFixture(files: Record<string, string>): string {
	const dir = mkdtempSync(path.join(tmpdir(), 'dragonwar-size-budget-'));
	createdDirs.push(dir);
	for (const [rel, content] of Object.entries(files)) {
		const full = path.join(dir, rel);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, content, 'utf8');
	}
	return dir;
}

function runSizeBudget(args: string[]): { status: number | null; stdout: string; stderr: string } {
	const result = spawnSync(process.execPath, [SIZE_BUDGET_SCRIPT, ...args], {
		encoding: 'utf8',
		timeout: RUN_TIMEOUT_MS,
	});
	return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

afterEach(() => {
	for (const dir of createdDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe('tools/size-budget.mjs -- BUDGET_BYTES', () => {
	it('is a positive number, comfortably below NFR-4\'s 20 MB product ceiling', () => {
		expect(BUDGET_BYTES).toBeGreaterThan(0);
		expect(BUDGET_BYTES).toBeLessThan(20_000_000);
	});
});

describe('tools/size-budget.mjs -- measureGzippedDist()', () => {
	it('sums gzipped bytes across every file under dist/, largest first', () => {
		const dir = makeFixture({
			'index.html': '<!DOCTYPE html><html></html>',
			'assets/main.js': 'x'.repeat(10_000), // compresses far smaller than the html
		});
		const result = measureGzippedDist(dir);
		expect(result.totalBytes).toBeGreaterThan(0);
		expect(result.perFile.length).toBe(2);
		expect(result.perFile[0].file).toBe('assets/main.js');

		const expectedTotal =
			gzipSync(Buffer.from('<!DOCTYPE html><html></html>'), { level: 9 }).length +
			gzipSync(Buffer.from('x'.repeat(10_000)), { level: 9 }).length;
		expect(result.totalBytes).toBe(expectedTotal);
	});

	it('throws a named error when the directory does not exist', () => {
		expect(() => measureGzippedDist(path.join(tmpdir(), 'dragonwar-size-budget-missing'))).toThrow(/does not exist/);
	});
});

describe('tools/size-budget.mjs -- CLI, real subprocess (Rule 3)', () => {
	it('exits 0 and prints measured/budgeted bytes when the build is within budget', () => {
		const dir = makeFixture({ 'index.html': '<!DOCTYPE html><html></html>' });
		const { status, stdout } = runSizeBudget([dir, '--budget', '1000000']);
		expect(status).toBe(0);
		expect(stdout).toMatch(/measured:/);
		expect(stdout).toMatch(/budget:/);
		expect(stdout).toMatch(/OK -- within budget/);
	});

	it('exits non-zero with BOTH the measured and the budgeted numbers when the budget is lowered below the real measurement -- the AC\'s deliberately-exercised failure path', () => {
		const dir = makeFixture({
			'index.html': '<!DOCTYPE html><html></html>',
			'assets/main.js': 'x'.repeat(50_000),
		});
		// First measure for real, then set the budget one byte below it -- a
		// real subprocess run of the actual script, not a mock or an assertion
		// against the source.
		const measured = measureGzippedDist(dir).totalBytes;
		const { status, stdout, stderr } = runSizeBudget([dir, '--budget', String(measured - 1)]);
		expect(status).toBe(1);
		expect(stdout + stderr).toMatch(/measured:/);
		expect(stdout + stderr).toMatch(/budget:/);
		expect(stderr).toMatch(/FAILED: measured/);
		expect(stderr).toMatch(/exceeds the budget/);
	});

	it('lists the largest contributors on failure', () => {
		const dir = makeFixture({
			'index.html': '<!DOCTYPE html><html></html>',
			'assets/big.js': 'y'.repeat(200_000),
		});
		const { stderr } = runSizeBudget([dir, '--budget', '1']);
		expect(stderr).toMatch(/largest contributors/);
		expect(stderr).toMatch(/assets\/big\.js/);
	});

	it('exits non-zero when the dist directory does not exist', () => {
		const { status, stderr } = runSizeBudget([path.join(tmpdir(), 'dragonwar-size-budget-missing-2')]);
		expect(status).toBe(1);
		expect(stderr).toMatch(/does not exist/);
	});

	it('exits non-zero when --budget is given a non-numeric value', () => {
		const dir = makeFixture({ 'index.html': '<!DOCTYPE html><html></html>' });
		const { status, stderr } = runSizeBudget([dir, '--budget', 'not-a-number']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--budget must be a positive number/);
	});

	it('exits non-zero naming an unrecognized flag', () => {
		const dir = makeFixture({ 'index.html': '<!DOCTYPE html><html></html>' });
		const { status, stderr } = runSizeBudget([dir, '--bogus-flag']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/unrecognized argument: --bogus-flag/);
	});
});

// Review 2026-08-28: every case above passes an explicit `--budget`, so nothing
// asserted that the SHIPPED default -- the number CI's `pnpm check:size` step
// actually enforces -- is BUDGET_BYTES. Replacing `args.budgetOverride ??
// BUDGET_BYTES` with a 20 MB literal left the whole suite green while letting a
// ~19 MB bundle through the only gate standing in front of NFR-4's ceiling.
describe('tools/size-budget.mjs -- the shipped default IS BUDGET_BYTES', () => {
	it('fails a fixture just over BUDGET_BYTES when no --budget is supplied, naming the budgeted number', () => {
		// Incompressible bytes, so the gzipped total genuinely exceeds the budget
		// rather than deflating below it.
		const oversized = randomBytes(BUDGET_BYTES + 250_000).toString('base64');
		const dir = makeFixture({ 'assets/huge.bin': oversized });

		const { status, stderr } = runSizeBudget([dir]);

		expect(status).toBe(1);
		expect(stderr).toMatch(/exceeds the budget/);
		expect(stderr).toContain(BUDGET_BYTES.toLocaleString());
	});

	it('passes a small fixture when no --budget is supplied, printing BUDGET_BYTES as the budget in force', () => {
		const dir = makeFixture({ 'index.html': '<!DOCTYPE html><html></html>' });

		const { status, stdout } = runSizeBudget([dir]);

		expect(status).toBe(0);
		expect(stdout).toContain(BUDGET_BYTES.toLocaleString());
	});
});
