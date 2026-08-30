// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Real `spawnSync` invocations of tools/boundary-lint.mjs, in the shape of
// test/measure-cli.test.ts: exit code and message assertions against the
// actual shipped tool, never a mock. Covers this story's I/O matrix rows for
// the boundary lint, exercised against the repository as committed and
// against test/fixtures/boundary/** (one deliberate violation per rule) and
// test/fixtures/boundary/coverage-gap (the empty-graph/missing-file guard).

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const BOUNDARY_LINT_SCRIPT = path.join(REPO_ROOT, 'tools', 'boundary-lint.mjs');
const FIXTURES_ROOT = path.join(REPO_ROOT, 'test', 'fixtures', 'boundary');
const COVERAGE_GAP_ROOT = path.join(FIXTURES_ROOT, 'coverage-gap');
const SIM_CYCLE_ROOT = path.join(FIXTURES_ROOT, 'sim-cycle');
const TABLE_REACHES_PHYSICS_ROOT = path.join(FIXTURES_ROOT, 'table-reaches-physics');
const SUPPRESSION_ROOT = path.join(FIXTURES_ROOT, 'suppression');
const EXEMPTION_EXACT_ROOT = path.join(FIXTURES_ROOT, 'exemption-exact');
const EXEMPTION_NEAR_MISS_ROOT = path.join(FIXTURES_ROOT, 'exemption-near-miss');
const RUN_TIMEOUT_MS = 30_000;

interface RunResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

function run(args: string[]): RunResult {
	const result = spawnSync(process.execPath, [BOUNDARY_LINT_SCRIPT, ...args], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
		timeout: RUN_TIMEOUT_MS,
	});
	return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('tools/boundary-lint.mjs -- the repository as committed', () => {
	it('exits 0 and reports the number of .ts files under src/ it cruised', () => {
		const { status, stdout, stderr } = run([]);
		expect(stderr, `expected no stderr, got:\n${stderr}`).toBe('');
		expect(status, `expected exit 0, stderr:\n${stderr}`).toBe(0);
		expect(stdout).toMatch(/\[boundary-lint\] OK -- \d+ \.ts file\(s\) under src\/ cruised, no violations/);
	});
});

describe('tools/boundary-lint.mjs -- test/fixtures/boundary (one violation per rule)', () => {
	const { status, stderr } = run([FIXTURES_ROOT]);

	it('exits 2 (an import-graph rule violation is present)', () => {
		expect(status).toBe(2);
	});

	it.each([
		['sim-no-upward-import', 'src/sim/upward-import.ts'],
		['sim-no-babylon', 'src/sim/babylon-import.ts'],
		['contracts-no-outside-import', 'src/sim/contracts/outside-import.ts'],
		['presentation-only-contracts-and-table', 'src/presentation/reaches-physics.ts'],
		['host-no-physics-or-rules', 'src/host/reaches-physics.ts'],
		['no-havok', 'src/presentation/havok-import.ts'],
		['sim-no-banned-global', 'src/sim/banned-globals.ts'],
		['sim-one-tick-constant', 'src/sim/tick-hz-misuse.ts'],
		['sim-no-literal-ms', 'src/sim/literal-ms.ts'],
		['no-device-name-literal', 'src/presentation/device-name-literal.ts'],
		['no-literal-non-ascii', 'src/presentation/non-ascii-literal.ts'],
	])('names rule "%s" and file "%s"', (rule, file) => {
		expect(stderr).toContain(`[${rule}]`);
		expect(stderr).toContain(file);
	});

	it('catches a type-only upward import the same as a value import (I/O matrix: "Type-only upward import")', () => {
		expect(stderr).toContain('[sim-no-upward-import]');
		expect(stderr).toContain('src/sim/upward-import-type-only.ts');
	});

	it('ignores banned-global mentions inside a block comment and a string literal (I/O matrix error-handling column)', () => {
		const lines = stderr.split('\n').filter((line) => line.includes('src/sim/banned-globals.ts'));
		expect(lines, `expected exactly one violation for banned-globals.ts, got:\n${lines.join('\n')}`).toHaveLength(1);
		expect(lines[0]).toContain('"Date"');
	});

	it('ignores a device-name mention inside a comment (I/O matrix: "Only string literals count")', () => {
		const lines = stderr.split('\n').filter((line) => line.includes('src/presentation/device-name-literal.ts'));
		expect(lines, `expected exactly one violation for device-name-literal.ts, got:\n${lines.join('\n')}`).toHaveLength(1);
		expect(lines[0]).toContain('"s_start"');
	});

	it('ignores the same non-ASCII codepoint inside a comment -- only the string literal fires (Rule 14: comments are prose)', () => {
		const lines = stderr.split('\n').filter((line) => line.includes('src/presentation/non-ascii-literal.ts'));
		expect(lines, `expected exactly one violation for non-ascii-literal.ts, got:\n${lines.join('\n')}`).toHaveLength(1);
		expect(lines[0]).toContain('U+00A7');
	});

	it('does not fire on a literal non-ASCII byte inside a declared vpx-js/vpinball port (Rule 14 exemption)', () => {
		expect(stderr).not.toContain('src/sim/physics/ported-non-ascii.ts');
	});

	it('DOES fire when the "Ported from " marker is NOT the file\'s own first line-comment -- the exemption is not a whole-file text search', () => {
		const lines = stderr.split('\n').filter((line) => line.includes('src/sim/physics/fake-port-non-ascii.ts'));
		expect(lines, `expected exactly one violation for fake-port-non-ascii.ts, got:\n${lines.join('\n')}`).toHaveLength(1);
		expect(lines[0]).toContain('[no-literal-non-ascii]');
	});

	// Code review 2026-08-30: isDeclaredPort()'s doc comment claimed the marker
	// counts only when nothing but a block comment precedes it ("a /* */ header
	// before it is fine, but any code before it is not"), while the code did
	// `tokens.find(t => t.type === 'line-comment')`, which skips code spans too
	// -- so a file with real code above a later marker was still exempted
	// whole-file. That is the same hole the earlier fake-port fixture closed
	// from the other direction. Falsifiability (Rule 19): mutation: restore
	// `tokens.find((token) => token.type === 'line-comment')` in isDeclaredPort()
	// -> this test goes red (the fixture is wrongly exempted, 0 violations).
	it("DOES fire when the \"Ported from \" marker follows real CODE -- only a marker on the file's first substantive token exempts it", () => {
		const lines = stderr.split('\n').filter((line) => line.includes('src/sim/physics/code-before-port-marker.ts'));
		expect(lines, `expected exactly one violation for code-before-port-marker.ts, got: ${lines.join(' | ')}`).toHaveLength(1);
		expect(lines[0]).toContain('[no-literal-non-ascii]');
	});

	it('still catches a real violation after a two-interpolation template literal (tokenizer stack does not desync)', () => {
		expect(stderr).toContain('[sim-no-banned-global]');
		expect(stderr).toContain('src/sim/template-interpolation.ts');
		expect(stderr).toContain('"Date"');
	});

	it('catches a banned global in a .js file under sim/, not just .ts (I/O matrix: textual checks are not TypeScript-only)', () => {
		expect(stderr).toContain('[sim-no-banned-global]');
		expect(stderr).toContain('src/sim/banned-global.js');
	});

	// Review finding, this story's review pass: MS_BINDING_PATTERN matched
	// plain decimal only, so every one of these spellings declared a literal
	// millisecond inside src/sim/** while the lint reported OK.
	it.each([
		['separatorMs', 'a numeric separator (1_000)'],
		['exponentMs', 'exponent notation (1e3)'],
		['hexMs', 'a hex literal (0x10)'],
		['leadingDotMs', 'a leading-dot literal (.5)'],
		['DEBOUNCE_MS', 'the SCREAMING_SNAKE _MS suffix'],
	])('catches "%s" declared with %s (AD-3: no literal millisecond outside tuning.ts)', (binding) => {
		const lines = stderr.split('\n').filter((line) => line.includes('src/sim/ms-literal-spellings.ts'));
		expect(lines.join('\n')).toContain(`"${binding}"`);
	});

	it('catches a device name in the trailing chunk of a template literal, after a ${} interpolation', () => {
		const lines = stderr.split('\n').filter((line) => line.includes('src/presentation/device-name-template.ts'));
		expect(lines, `expected exactly one violation, got:\n${lines.join('\n')}`).toHaveLength(1);
		// Not "_troug": the delimiter strip is conditional, so the reported
		// name is the real device name a maintainer can search for.
		expect(lines[0]).toContain('"s_trough_1"');
	});
});

describe('tools/boundary-lint.mjs -- fails closed rather than scanning blind', () => {
	it('throws, naming the file, when the tokenizer ends inside an unterminated span (regex literal containing a backtick)', () => {
		const { status, stdout, stderr } = run([path.join(FIXTURES_ROOT, 'unterminated-span')]);
		expect(status, `expected non-zero exit, stdout:\n${stdout}`).not.toBe(0);
		expect(stderr).toContain('src/sim/regex-backtick.ts');
		expect(stderr).toMatch(/unterminated template span/);
		// The whole point: it must not silently report success over a file it
		// could only partially classify.
		expect(stdout).not.toMatch(/OK --/);
	});

	it('counts .mts toward graph coverage, so a file the swc parser cannot scan is reported, not skipped', () => {
		const { status, stdout, stderr } = run([path.join(FIXTURES_ROOT, 'mts-coverage')]);
		expect(status, `expected non-zero exit, stdout:\n${stdout}`).not.toBe(0);
		expect(stderr).toContain('src/sim/hidden.mts');
		expect(stderr).toContain('a lint that cannot see the files is a defect');
		expect(stdout).not.toMatch(/OK --/);
	});

	it('never reports OK over a src/ tree containing no TypeScript at all (I/O matrix: "never exit 0 over an empty graph")', () => {
		const { status, stdout, stderr } = run([path.join(FIXTURES_ROOT, 'empty-graph')]);
		expect(status, `expected non-zero exit, stdout:\n${stdout}`).not.toBe(0);
		expect(stderr).toMatch(/inspected nothing/);
		expect(stdout).not.toMatch(/OK --/);
	});
});

describe('tools/boundary-lint.mjs -- empty-graph / missing-file guard (test/fixtures/boundary/coverage-gap)', () => {
	it('never exits 0 over a cruise result missing a real .ts file, and names the missing file and the installed parser', () => {
		const { status, stderr } = run([COVERAGE_GAP_ROOT]);
		expect(status).not.toBe(0);
		expect(stderr).toMatch(/missing 1 of 2 \.ts file\(s\)/);
		expect(stderr).toContain('src/vendored_node_modules_copy/orphan.ts');
		expect(stderr).toMatch(/Installed parser:.*swc/);
	});
});

describe('tools/boundary-lint.mjs -- test/fixtures/boundary/sim-cycle (DW-37: no-circular)', () => {
	it('exits 2 and reports no-circular for a cycle introduced among the seam contracts', () => {
		const { status, stderr } = run([SIM_CYCLE_ROOT]);
		expect(status, `expected exit 2, stderr:\n${stderr}`).toBe(2);
		expect(stderr).toContain('[no-circular]');
		expect(stderr).toContain('src/sim/contracts/a.ts');
	});
});

describe('tools/boundary-lint.mjs -- test/fixtures/boundary/table-reaches-physics (DW-37: sim-table-no-physics-rules-loop)', () => {
	it('exits 2 and reports sim-table-no-physics-rules-loop for a sim/table -> sim/physics import', () => {
		const { status, stderr } = run([TABLE_REACHES_PHYSICS_ROOT]);
		expect(status, `expected exit 2, stderr:\n${stderr}`).toBe(2);
		expect(stderr).toContain('[sim-table-no-physics-rules-loop]');
		expect(stderr).toContain('src/sim/table/reaches-physics.ts');
	});
});

describe('tools/boundary-lint.mjs -- test/fixtures/boundary/suppression (DW-38: in-file suppression, narrow)', () => {
	const { stderr } = run([SUPPRESSION_ROOT]);
	const lines = (n: number) => stderr.split('\n').filter((line) => line.includes(`src/presentation/suppressed.ts:${n}`));

	it('exempts exactly the line named by "// boundary-lint-disable-next-line no-device-name-literal"', () => {
		expect(lines(5), `expected no violation on line 5, got:\n${lines(5).join('\n')}`).toHaveLength(0);
	});

	it('does not exempt the line after the suppressed one', () => {
		expect(lines(6), `expected exactly one violation on line 6, got:\n${lines(6).join('\n')}`).toHaveLength(1);
		expect(lines(6)[0]).toContain('[no-device-name-literal]');
	});

	it('a suppression naming a DIFFERENT rule does not suppress the real violation', () => {
		expect(lines(9), `expected exactly one violation on line 9, got:\n${lines(9).join('\n')}`).toHaveLength(1);
		expect(lines(9)[0]).toContain('[no-device-name-literal]');
	});

	it('a suppression naming an UNRECOGNISED rule does not suppress the real violation', () => {
		expect(lines(12), `expected exactly one violation on line 12, got:\n${lines(12).join('\n')}`).toHaveLength(1);
		expect(lines(12)[0]).toContain('[no-device-name-literal]');
	});
});

describe('tools/boundary-lint.mjs -- test/fixtures/boundary/exemption-exact (DW-39: exact-path exemptions really hold)', () => {
	it('exits 0 -- no violation for the sim-no-literal-ms/sim-one-tick-constant/no-device-name-literal patterns at the exact exempt paths', () => {
		const { status, stdout, stderr } = run([EXEMPTION_EXACT_ROOT]);
		expect(status, `expected exit 0, stderr:\n${stderr}`).toBe(0);
		expect(stdout).toMatch(/OK --/);
	});
});

describe('tools/boundary-lint.mjs -- test/fixtures/boundary/exemption-near-miss (DW-39: exemption is path-exact, not basename- or suffix-matched)', () => {
	const { status, stderr } = run([EXEMPTION_NEAR_MISS_ROOT]);

	it('exits non-zero (both near-miss files fire)', () => {
		expect(status).not.toBe(0);
	});

	it('src/sim/other/tuning.ts (basename matches src/sim/table/tuning.ts, path does not) still fires sim-no-literal-ms and sim-one-tick-constant', () => {
		const lines = stderr.split('\n').filter((line) => line.includes('src/sim/other/tuning.ts'));
		expect(lines.join('\n')).toContain('[sim-no-literal-ms]');
		expect(lines.join('\n')).toContain('[sim-one-tick-constant]');
	});

	it('src/sim/table/nested/dragonwar.ts (basename matches src/sim/table/dragonwar.ts, path does not) still fires no-device-name-literal', () => {
		// QA: correlate the rule and the file on the SAME violation line
		// (mirroring the sim/other/tuning.ts test above), rather than two
		// independent stderr-wide toContain calls -- which a fixture-root
		// change producing "[no-device-name-literal]" and this path's name on
		// unrelated lines could satisfy without the near-miss file's own
		// violation ever having fired.
		const lines = stderr.split('\n').filter((line) => line.includes('src/sim/table/nested/dragonwar.ts'));
		expect(lines.join('\n'), `expected a violation naming src/sim/table/nested/dragonwar.ts, got:\n${stderr}`).toContain('[no-device-name-literal]');
	});
});

describe('tools/boundary-lint.mjs -- argument handling', () => {
	it('exits non-zero naming an unrecognized extra argument', () => {
		const { status, stderr } = run(['a', 'b']);
		expect(status).toBe(1);
		expect(stderr).toMatch(/unexpected extra argument/);
	});

	it('exits non-zero when the given root does not exist', () => {
		const { status, stderr } = run([path.join(REPO_ROOT, 'no-such-root-directory')]);
		expect(status).toBe(1);
		expect(stderr).toMatch(/root does not exist/);
	});
});
