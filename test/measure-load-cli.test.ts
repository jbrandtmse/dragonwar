// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- tools/spike-3/measure-load.mjs's CLI argument
// validation. Mirrors test/measure-cli.test.ts's shape exactly (that file's
// own header comment explains the rationale): real subprocess invocations of
// the actual shipped script (Rule 3: CLI real-runtime evidence), scoped to
// the argument-parsing path only (parseArgs()/requireValue(), which run and
// throw before any browser is ever spawned, per this script's own
// `main()` -- parseArgs() before sweepStaleProfileDirs() before run()), so
// these tests need no Chrome/Edge install and no CDP connection.
//
// Review finding 2026-08-28: this is the tool that produces every gating
// number this story records, yet -- unlike its two sibling scripts,
// tools/check-dist.mjs and tools/size-budget.mjs, each with their own
// subprocess-driven test file -- it shipped with zero automated coverage.
// The browser-dependent success path is out of this suite's reach without a
// real browser (covered instead by this story's own documented manual
// measurement runs in docs/spikes/spike-3.md); what IS in reach, and had no
// coverage before this file, is every argument-validation error path.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { median } from '../tools/spike-3/measure-load.mjs';

const MEASURE_LOAD_SCRIPT = path.resolve(__dirname, '..', 'tools', 'spike-3', 'measure-load.mjs');
const REPO_ROOT = path.resolve(__dirname, '..');
const RUN_TIMEOUT_MS = 10_000;

interface MeasureRunResult {
	status: number | null;
	stderr: string;
	stdout: string;
}

function runMeasureLoad(args: string[]): MeasureRunResult {
	const result = spawnSync(process.execPath, [MEASURE_LOAD_SCRIPT, ...args], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
		timeout: RUN_TIMEOUT_MS,
	});
	return { status: result.status, stderr: result.stderr ?? '', stdout: result.stdout ?? '' };
}

describe('tools/spike-3/measure-load.mjs -- CLI argument validation (real subprocess, no browser)', () => {
	it('exits non-zero naming --url when it is missing entirely', () => {
		const { status, stderr } = runMeasureLoad([]);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--url is required/);
	});

	it('exits non-zero when --url is the last argument with no value', () => {
		const { status, stderr } = runMeasureLoad(['--url']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--url requires a value/);
	});

	it('exits non-zero naming the offending value when --browser is unrecognized', () => {
		const { status, stderr } = runMeasureLoad(['--url', 'http://localhost:4173/', '--browser', 'firefox']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--browser must be "chrome" or "edge" \(got "firefox"\)/);
	});

	it('exits non-zero when --browser is the last argument with no value', () => {
		const { status, stderr } = runMeasureLoad(['--url', 'http://localhost:4173/', '--browser']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--browser requires a value/);
	});

	it('exits non-zero when --exe is the last argument with no value', () => {
		const { status, stderr } = runMeasureLoad(['--url', 'http://localhost:4173/', '--exe']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--exe requires a value/);
	});

	it('exits non-zero when a flag is given an empty value', () => {
		const { status, stderr } = runMeasureLoad(['--url', 'http://localhost:4173/', '--exe', '']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--exe requires a value that is not empty/);
	});

	it('exits non-zero when --latency is the last argument with no value', () => {
		const { status, stderr } = runMeasureLoad(['--url', 'http://localhost:4173/', '--latency']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--latency requires a value/);
	});

	it('exits non-zero naming the offending value when --latency is not a number', () => {
		const { status, stderr } = runMeasureLoad(['--url', 'http://localhost:4173/', '--latency', 'fast']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--latency must be a non-negative number of milliseconds, got "fast"/);
	});

	it('exits non-zero when --latency is negative', () => {
		const { status, stderr } = runMeasureLoad(['--url', 'http://localhost:4173/', '--latency', '-5']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--latency must be a non-negative number of milliseconds, got "-5"/);
	});

	it('exits non-zero naming an unrecognized argument', () => {
		const { status, stderr } = runMeasureLoad(['--url', 'http://localhost:4173/', '--bogus-flag']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/unrecognized argument: --bogus-flag/);
	});
});

describe('tools/spike-3/measure-load.mjs -- median()', () => {
	// This file's own header comment ("Exported so a direct unit test can
	// assert this against a known-correct expected value, rather than only
	// indirectly through a live CDP run -- mirrors tools/spike-1/browser.ts's
	// own median()") names exactly this test as the reason the function is
	// exported. tools/spike-1/browser.ts's median() got that direct unit test
	// (test/spike-1-browser-guard.test.ts); this separate, duplicate
	// implementation in tools/spike-3/measure-load.mjs did not -- until now.
	it('averages the two middle values for an even-length sorted array', () => {
		expect(median([10, 20, 30, 40])).toBe(25);
	});

	it('picks the middle value for an odd-length sorted array', () => {
		expect(median([10, 20, 30])).toBe(20);
	});

	it('returns 0 for an empty array (no rAF deltas observed)', () => {
		expect(median([])).toBe(0);
	});
});

describe('tools/spike-3/measure-load.mjs -- argument parsing happens before the profile sweep', () => {
	it('a failed argument parse leaves existing spike-3 profile directories alone', () => {
		// sweepStaleProfileDirs() mutates %TEMP%, matching every entry that starts
		// with PROFILE_DIR_PREFIX ('dragonwar-spike3-'). It must not run when the
		// arguments are invalid -- mirrors test/measure-cli.test.ts's identical
		// regression test for tools/spike-1/measure.mjs's own sweep.
		const marker = path.join(tmpdir(), `dragonwar-spike3-cli-test-${process.pid}`);
		mkdirSync(marker, { recursive: true });
		try {
			const { status } = runMeasureLoad(['--not-a-real-flag']);
			expect(status).toBe(1);
			expect(existsSync(marker), 'the profile directory was swept despite a parse failure').toBe(true);
		} finally {
			rmSync(marker, { recursive: true, force: true });
		}
	});
});
