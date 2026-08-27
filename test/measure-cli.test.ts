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
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

	it('exits non-zero when a flag is given an empty value', () => {
		// An empty string parses fine and then reaches spawn() as an empty exe path,
		// which throws outside the try/finally -- leaking the temp profile directory.
		const { status, stderr } = runMeasure(['--browser', 'chrome', '--exe', '']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/--exe requires a value that is not empty/);
	});

	it('exits non-zero naming an unrecognized argument', () => {
		const { status, stderr } = runMeasure(['--bogus-flag']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/unrecognized argument: --bogus-flag/);
	});
});

describe('tools/spike-1/measure.mjs -- the dev-page measurement-surface warning', () => {
	// The amended AC bans a dev-page number from gating TICK_HZ, and this warning is
	// the only thing standing between a careless run and exactly that. It had no
	// coverage: every existing test fails argument parsing first, so it never ran.
	// A nonexistent --exe reaches the launch phase (printing target + warning) and
	// then exits 1 cleanly, which is what makes this testable without a browser.
	const NONEXISTENT_EXE = path.resolve(REPO_ROOT, 'no-such-browser-binary.exe');

	it('warns loudly when the target is the default Vite dev page', () => {
		const { stderr } = runMeasure(['--browser', 'chrome', '--exe', NONEXISTENT_EXE]);
		expect(stderr).toContain('Vite DEV page');
		expect(stderr).toMatch(/PRODUCTION build/i);
	});

	it('warns for a dev URL that is not byte-identical to the default (127.0.0.1, other port)', () => {
		// The guard used to be `args.url === DEFAULT_URL`, so every one of these
		// evaded it while still being the dev page.
		for (const url of [
			'http://127.0.0.1:5173/tools/spike-1/index.html',
			'http://localhost:5174/tools/spike-1/index.html',
			'http://localhost:5173/tools/spike-1/index.html?cachebust=1',
		]) {
			const { stderr } = runMeasure(['--browser', 'chrome', '--url', url, '--exe', NONEXISTENT_EXE]);
			expect(stderr, `expected a dev-page warning for ${url}`).toContain('Vite DEV page');
		}
	});

	it('does NOT warn for a production preview URL', () => {
		const { stderr } = runMeasure([
			'--browser', 'chrome',
			'--url', 'http://localhost:4174/tools/spike-1/index.html',
			'--exe', NONEXISTENT_EXE,
		]);
		expect(stderr).not.toContain('Vite DEV page');
	});
});

describe('tools/spike-1/measure.mjs -- argument parsing happens before the profile sweep', () => {
	it('a failed argument parse leaves existing spike-1 profile directories alone', () => {
		// sweepStaleProfileDirs() mutates %TEMP%. It must not run when the arguments
		// are invalid, or `pnpm test` (which spawns this script repeatedly) destroys a
		// live measurement's browser profile. Regression test for that ordering.
		const marker = path.join(tmpdir(), `dragonwar-spike1-cli-test-${process.pid}`);
		mkdirSync(marker, { recursive: true });
		try {
			const { status } = runMeasure(['--not-a-real-flag']);
			expect(status).toBe(1);
			expect(existsSync(marker), 'the profile directory was swept despite a parse failure').toBe(true);
		} finally {
			rmSync(marker, { recursive: true, force: true });
		}
	});
});
