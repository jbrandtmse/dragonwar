// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.1, Spike 1 -- tools/spike-1/measure.mjs's CLI argument validation.
// Real subprocess invocations (Rule 3: CLI real-runtime evidence) of the actual
// shipped script, not a mock of child_process -- but exercising only the
// argument-parsing path (parseArgs()/requireValue(), which run and throw before
// any browser is ever spawned), so these tests need no Chrome/Edge install and
// no CDP connection. The browser-dependent success path (exit 0, JSON with
// samples: 600 and a numeric p95Ms) is covered by the story's own documented
// `pnpm dev` + `node tools/spike-1/measure.mjs` manual verification runs (see
// docs/spikes/spike-1.md) and is out of this suite's reach without a real
// browser. What IS in this suite's reach, and had zero test coverage before
// this file: the argument-validation error paths -- missing flag values, an
// unrecognized --browser value, and an unrecognized flag altogether. (This is
// distinct from the two pre-adjudicated deferred gaps for this tool: an
// end-to-end CDP test of the throttle-guard's exit code, and the hardcoded CDP
// port -- neither is touched here.)

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MEASURE_SCRIPT = path.resolve(__dirname, '..', 'tools', 'spike-1', 'measure.mjs');
const REPO_ROOT = path.resolve(__dirname, '..');
const RUN_TIMEOUT_MS = 10_000;

interface MeasureRunResult {
	status: number | null;
	stderr: string;
	stdout: string;
}

function runMeasure(args: string[]): MeasureRunResult {
	const result = spawnSync(process.execPath, [MEASURE_SCRIPT, ...args], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
		timeout: RUN_TIMEOUT_MS,
	});
	return { status: result.status, stderr: result.stderr ?? '', stdout: result.stdout ?? '' };
}

describe('tools/spike-1/measure.mjs -- CLI argument validation (real subprocess, no browser)', () => {
	it('exits non-zero naming --browser when it is missing entirely', () => {
		const { status, stderr } = runMeasure(['--url', 'http://localhost:5173/tools/spike-1/index.html']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--browser must be "chrome" or "edge"/);
	});

	it('exits non-zero naming the offending value when --browser is unrecognized', () => {
		const { status, stderr } = runMeasure(['--browser', 'firefox']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--browser must be "chrome" or "edge" \(got "firefox"\)/);
	});

	it('exits non-zero when --browser is the last argument with no value', () => {
		const { status, stderr } = runMeasure(['--browser']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--browser requires a value/);
	});

	it('exits non-zero when --url is the last argument with no value', () => {
		const { status, stderr } = runMeasure(['--browser', 'chrome', '--url']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--url requires a value/);
	});

	it('exits non-zero when --exe is the last argument with no value', () => {
		const { status, stderr } = runMeasure(['--browser', 'chrome', '--exe']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--exe requires a value/);
	});

	it('exits non-zero naming an unrecognized argument', () => {
		const { status, stderr } = runMeasure(['--bogus-flag']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/unrecognized argument: --bogus-flag/);
	});
});
