#!/usr/bin/env node
// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-16: the boundary gate is three parts (this story's Design Notes,
// "Why the boundary gate is three parts, not one"), and this tool is two of
// them plus the coverage guard that makes the third (dependency-cruiser)
// honest:
//
//   (a) runs dependency-cruiser (tools/dependency-cruiser.config.mjs) over
//       `<root>/src` and fails on any import-rule violation -- exit 2,
//       naming the rule, per this story's I/O matrix ("sim/ imports
//       upward", "presentation/ reaches past the seam", "host/ reaches into
//       the core", "Engine physics anywhere" rows all read "Exit 2").
//   (b) fails if any `.ts` file under `<root>/src` is missing from the
//       cruise result -- "a lint that cannot see the files is a defect, not
//       a pass" (this story's own Always rule). Never exits 0 over an empty
//       graph.
//   (c) scans `<root>/src/sim/**` textually for `Date`, `Math.random` and
//       `globalThis` (legal ES2023, so `tsconfig.sim.json` cannot reject
//       them) plus the DOM/Node token list as defence in depth, outside
//       comments and string/template literals.
//   (d) enforces AD-3's tick/ms rule: `TICK_HZ` named anywhere under
//       `<root>/src/sim/**` other than `contracts/time.ts` and
//       `table/tuning.ts`; an `…Ms`-suffixed binding authored with a numeric
//       literal anywhere under `<root>/src/sim/**` other than
//       `table/tuning.ts`.
//   (e) enforces the device-name-literal rule over `<root>/src/**`, excluding
//       `src/sim/table/dragonwar.ts`: a string/template literal matching
//       `^(s|c|l|f|gi|bd|shot|show)_[a-z0-9_]+$`.
//
// (a) and (b) need a real import graph, which only dependency-cruiser (with
// the `@swc/core` parser) can produce -- it cannot see identifier references
// or string literals, so (c)-(e) are a hand-rolled textual pass instead.
// Node built-ins plus dependency-cruiser only, per this story's own
// constraint (AD-16: no lint may depend on the TypeScript compiler API).
//
// Usage: node tools/boundary-lint.mjs [root]
//   [root] -- defaults to the repository root; test/boundary-lint.test.ts
//   points it at test/fixtures/boundary so the tool's checks run for real
//   against deliberately violating input, one violation per rule.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPCRUISE_BIN = path.join(TOOL_ROOT, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruise.mjs');
const DEPCRUISE_CONFIG = path.join(TOOL_ROOT, 'tools', 'dependency-cruiser.config.mjs');

// Not just `.ts`: a `.js`/`.mjs`/`.cjs`/`.tsx` file dropped under src/ would
// otherwise bypass every textual check below entirely. This is the same
// extension set test/sim-boundary.test.ts's superseded stand-in scanned
// (review finding, this story's own review pass: the three textual checks
// below had narrowed to `.ts`-only, regressing that defense-in-depth). Only
// dependency-cruiser's own coverage guard (below) stays `.ts`-only -- that
// guard's job is specifically proving TypeScript files reach the swc parser
// (DW-15's own failure mode), not textual scanning breadth.
const TEXTUAL_SCAN_EXTENSION_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/;

const DEVICE_NAME_PATTERN = /^(?:s|c|l|f|gi|bd|shot|show)_[a-z0-9_]+$/;
const BANNED_TOKENS_ALWAYS = ['Date', 'Math.random', 'globalThis'];
// Defence in depth (task 10c): the DOM/Node globals tsconfig.sim.json's
// `types: []` / `lib: ["ES2023"]` already reject at the type level (DW-15) --
// kept here too so a `// @ts-expect-error`-suppressed or `any`-typed
// reference is still caught textually.
const BANNED_TOKENS_DEFENCE_IN_DEPTH = [
	'window',
	'document',
	'performance',
	'setTimeout',
	'setInterval',
	'requestAnimationFrame',
	'localStorage',
	'navigator',
];
const BANNED_GLOBAL_TOKENS = [...BANNED_TOKENS_ALWAYS, ...BANNED_TOKENS_DEFENCE_IN_DEPTH];

class BoundaryLintError extends Error {}

/** Recursively lists every file (not directory) under `root`, absolute paths. */
function listFilesRecursive(root) {
	if (!existsSync(root)) {
		return [];
	}
	const out = [];
	for (const dirent of readdirSync(root)) {
		const full = path.join(root, dirent);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			out.push(...listFilesRecursive(full));
		} else {
			out.push(full);
		}
	}
	return out;
}

function toPosix(p) {
	return p.split(path.sep).join('/');
}

function lineOf(source, index) {
	let line = 1;
	for (let i = 0; i < index && i < source.length; i++) {
		if (source[i] === '\n') {
			line++;
		}
	}
	return line;
}

/**
 * Splits `source` into typed spans: `code`, `line-comment`, `block-comment`,
 * `string` (single- or double-quoted) and `template` (the literal parts of a
 * template string; `${...}` interpolation content is re-classified back to
 * `code`, brace-depth tracked via a stack so nested braces/templates inside
 * an interpolation resolve correctly). Not regex-literal aware -- no `/…/`
 * regex literal exists anywhere under `src/` today (verified by inspection
 * during this story's implementation); a future one containing `//` or `/*`
 * could confuse this tokenizer, the same class of accepted limitation
 * `test/sim-boundary.test.ts`'s superseded stand-in documented for its own
 * simpler `//`-only comment stripper.
 */
function tokenize(source) {
	const tokens = [];
	const n = source.length;
	let i = 0;
	let start = 0;
	let mode = 'code';
	// Stack of 'template' (this frame closes a `${…}` back into a template
	// literal) or 'brace' (an ordinary nested `{…}` inside code/interpolation).
	const stack = [];

	function emit(type, end) {
		if (end > start) {
			tokens.push({ type, start, end });
		}
		start = end;
	}

	while (i < n) {
		const c = source[i];
		if (mode === 'code') {
			if (c === '/' && source[i + 1] === '/') {
				emit('code', i);
				mode = 'line-comment';
				i += 2;
				continue;
			}
			if (c === '/' && source[i + 1] === '*') {
				emit('code', i);
				mode = 'block-comment';
				i += 2;
				continue;
			}
			if (c === "'") {
				emit('code', i);
				mode = 'string-single';
				i += 1;
				continue;
			}
			if (c === '"') {
				emit('code', i);
				mode = 'string-double';
				i += 1;
				continue;
			}
			if (c === '`') {
				emit('code', i);
				mode = 'template';
				stack.push('template');
				i += 1;
				continue;
			}
			if (c === '{') {
				stack.push('brace');
				i += 1;
				continue;
			}
			if (c === '}') {
				const top = stack.pop();
				if (top === 'template') {
					emit('code', i + 1);
					mode = 'template';
				}
				i += 1;
				continue;
			}
			i += 1;
			continue;
		}
		if (mode === 'line-comment') {
			if (c === '\n') {
				emit('line-comment', i);
				mode = 'code';
			}
			i += 1;
			continue;
		}
		if (mode === 'block-comment') {
			if (c === '*' && source[i + 1] === '/') {
				emit('block-comment', i + 2);
				mode = 'code';
				i += 2;
				continue;
			}
			i += 1;
			continue;
		}
		if (mode === 'string-single' || mode === 'string-double') {
			if (c === '\\') {
				i += 2;
				continue;
			}
			const quote = mode === 'string-single' ? "'" : '"';
			if (c === quote) {
				emit(mode, i + 1);
				mode = 'code';
				i += 1;
				continue;
			}
			if (c === '\n') {
				// Unterminated string (should not happen in valid source): bail back
				// to code rather than consuming the rest of the file as a string.
				emit(mode, i);
				mode = 'code';
				i += 1;
				continue;
			}
			i += 1;
			continue;
		}
		if (mode === 'template') {
			if (c === '\\') {
				i += 2;
				continue;
			}
			if (c === '`') {
				emit('template', i + 1);
				mode = 'code';
				stack.pop(); // the 'template' frame this backtick opened
				i += 1;
				continue;
			}
			if (c === '$' && source[i + 1] === '{') {
				emit('template', i);
				mode = 'code';
				// Push a frame for THIS interpolation's own closing `}` to pop --
				// distinct from the outer backtick's frame, which must survive
				// until the literal's real closing backtick. Without this push, a
				// template literal with two or more `${...}` interpolations
				// desyncs: the first `}` consumes the outer backtick's frame, the
				// second `}` has nothing to pop, mode never reverts to 'template',
				// and everything from there to end-of-file is misclassified,
				// blinding checkBannedGlobals/checkTickMsRule/checkDeviceNameLiterals
				// for the rest of the file (review finding, this story's own review
				// pass; reproduced with a two-interpolation template).
				stack.push('template');
				i += 2;
				continue;
			}
			i += 1;
			continue;
		}
		i += 1;
	}
	emit(mode, n);
	return tokens;
}

/** `source` with every comment, string and template-literal span blanked to spaces (newlines preserved) -- for identifier-level checks that must ignore both. */
function maskForCodeOnly(source, tokens) {
	const chars = source.split('');
	for (const token of tokens) {
		if (token.type === 'code') {
			continue;
		}
		for (let i = token.start; i < token.end; i++) {
			if (chars[i] !== '\n') {
				chars[i] = ' ';
			}
		}
	}
	return chars.join('');
}

/** Every string/template-literal span's inner text (quotes stripped), with its 1-based start line. */
function extractStringLiterals(source, tokens) {
	const out = [];
	for (const token of tokens) {
		if (token.type !== 'string-single' && token.type !== 'string-double' && token.type !== 'template') {
			continue;
		}
		const raw = source.slice(token.start, token.end);
		// Strip exactly one leading and one trailing quote/backtick -- `emit()`
		// always includes both delimiters for a well-formed literal.
		const inner = raw.length >= 2 ? raw.slice(1, -1) : '';
		out.push({ text: inner, line: lineOf(source, token.start) });
	}
	return out;
}

function bannedTokenPattern(token) {
	const escaped = token.replace(/[.]/g, '\\.');
	return new RegExp(`\\b${escaped}\\b`, 'g');
}

/** Check (c): banned globals, textual, comments/strings excluded. */
function checkBannedGlobals(simRoot, relRoot) {
	const violations = [];
	const files = listFilesRecursive(simRoot).filter((f) => TEXTUAL_SCAN_EXTENSION_PATTERN.test(f));
	for (const file of files) {
		const source = readFileSync(file, 'utf8');
		const codeOnly = maskForCodeOnly(source, tokenize(source));
		const relative = toPosix(path.relative(relRoot, file));
		for (const token of BANNED_GLOBAL_TOKENS) {
			const pattern = bannedTokenPattern(token);
			let match;
			while ((match = pattern.exec(codeOnly)) !== null) {
				violations.push({
					rule: 'sim-no-banned-global',
					file: relative,
					line: lineOf(source, match.index),
					message: `references banned token "${token}" (sim/ must be DOM-free, wall-clock-free and unseeded-random-free -- AD-3, AD-16)`,
				});
			}
		}
	}
	return violations;
}

const MS_BINDING_PATTERN = /\b([A-Za-z_$][A-Za-z0-9_$]*Ms)\b\s*(?::\s*number\s*)?[:=]\s*(-?\d+(?:\.\d+)?)\b/g;
const TICK_HZ_PATTERN = /\bTICK_HZ\b/g;

/** Check (d): AD-3's tick/ms rule, textual. */
function checkTickMsRule(simRoot, relRoot) {
	const violations = [];
	const timeFile = toPosix(path.join('src', 'sim', 'contracts', 'time.ts'));
	const tuningFile = toPosix(path.join('src', 'sim', 'table', 'tuning.ts'));
	const files = listFilesRecursive(simRoot).filter((f) => TEXTUAL_SCAN_EXTENSION_PATTERN.test(f));
	for (const file of files) {
		const source = readFileSync(file, 'utf8');
		const codeOnly = maskForCodeOnly(source, tokenize(source));
		const relative = toPosix(path.relative(relRoot, file));

		if (relative !== timeFile && relative !== tuningFile) {
			let match;
			const tickPattern = new RegExp(TICK_HZ_PATTERN.source, 'g');
			while ((match = tickPattern.exec(codeOnly)) !== null) {
				violations.push({
					rule: 'sim-one-tick-constant',
					file: relative,
					line: lineOf(source, match.index),
					message: 'names TICK_HZ outside sim/contracts/time.ts and sim/table/tuning.ts (AD-3: one clock behind one constant)',
				});
			}
		}

		if (relative !== tuningFile) {
			let match;
			const msPattern = new RegExp(MS_BINDING_PATTERN.source, 'g');
			while ((match = msPattern.exec(codeOnly)) !== null) {
				violations.push({
					rule: 'sim-no-literal-ms',
					file: relative,
					line: lineOf(source, match.index),
					message: `declares "${match[1]}" with a literal numeric value outside sim/table/tuning.ts (AD-3: durations are authored in ms only in tuning.ts and converted to ticks once at load)`,
				});
			}
		}
	}
	return violations;
}

/** Check (e): device-name string literals, textual, over `src/**` excluding the table file. */
function checkDeviceNameLiterals(srcRoot, relRoot) {
	const violations = [];
	const tableFile = toPosix(path.join('src', 'sim', 'table', 'dragonwar.ts'));
	const files = listFilesRecursive(srcRoot).filter((f) => TEXTUAL_SCAN_EXTENSION_PATTERN.test(f));
	for (const file of files) {
		const relative = toPosix(path.relative(relRoot, file));
		if (relative === tableFile) {
			continue;
		}
		const source = readFileSync(file, 'utf8');
		const literals = extractStringLiterals(source, tokenize(source));
		for (const literal of literals) {
			if (DEVICE_NAME_PATTERN.test(literal.text)) {
				violations.push({
					rule: 'no-device-name-literal',
					file: relative,
					line: literal.line,
					message: `string literal "${literal.text}" names a device outside sim/table/dragonwar.ts (AD-1, AD-16: device names are typed through sim/table/names.ts)`,
				});
			}
		}
	}
	return violations;
}

/** Checks (a) and (b): the real import graph, via dependency-cruiser + @swc/core. */
function runImportGraphChecks(root) {
	const srcArg = 'src';
	const srcDir = path.join(root, 'src');
	if (!existsSync(DEPCRUISE_BIN)) {
		throw new BoundaryLintError(
			`dependency-cruiser is not installed at ${path.relative(TOOL_ROOT, DEPCRUISE_BIN)} -- run "pnpm install" first`,
		);
	}
	const result = spawnSync(
		process.execPath,
		[DEPCRUISE_BIN, '--config', DEPCRUISE_CONFIG, '-T', 'json', srcArg],
		{ cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
	);
	if (result.error) {
		throw new BoundaryLintError(`failed to run dependency-cruiser: ${result.error.message}`);
	}
	let report;
	try {
		report = JSON.parse(result.stdout);
	} catch {
		throw new BoundaryLintError(
			`dependency-cruiser did not produce valid JSON (exit ${result.status}). stderr:\n${result.stderr}`,
		);
	}

	const violations = [];
	for (const v of report.summary?.violations ?? []) {
		if (v.rule?.severity !== 'error') {
			continue;
		}
		violations.push({
			rule: v.rule.name,
			file: v.from,
			line: undefined,
			message: `${v.from} → ${v.to}`,
			importRule: true,
		});
	}

	// Check (b): every `.ts` file under `<root>/src` must appear in the cruise
	// result -- "a lint that cannot see the files is a defect, not a pass."
	const expected = new Set(
		listFilesRecursive(srcDir)
			.filter((f) => f.endsWith('.ts'))
			.map((f) => toPosix(path.relative(root, f))),
	);
	const seen = new Set((report.modules ?? []).map((m) => toPosix(m.source)));
	const missing = [...expected].filter((f) => !seen.has(f)).sort();

	if (missing.length > 0 || (expected.size > 0 && report.summary?.totalCruised === 0)) {
		// A best-effort, separately-invoked `--info` for the failure message --
		// the JSON reporter's own `environment` field was found empirically not
		// to be populated reliably across runs, so this dedicated call is the
		// trustworthy source for "the installed parser" this failure must name.
		const info = spawnSync(process.execPath, [DEPCRUISE_BIN, '--info'], { cwd: root, encoding: 'utf8' });
		const swcLine = /^.*\bswc\b.*$/m.exec(info.stdout ?? '');
		const parserInfo = swcLine ? swcLine[0].trim() : 'swc: could not be determined (dependency-cruiser --info produced no swc line)';

		throw new BoundaryLintError(
			`dependency-cruiser's cruise result is missing ${missing.length} of ${expected.size} .ts file(s) under ` +
			`${toPosix(path.relative(TOOL_ROOT, srcDir))} -- a lint that cannot see the files is a defect, not a pass.\n` +
			`Installed parser: ${parserInfo}.\n` +
			`Missing: ${missing.slice(0, 25).join(', ')}${missing.length > 25 ? `, ... (${missing.length - 25} more)` : ''}`,
		);
	}

	return { violations, coverage: expected.size };
}

function parseArgs(argv) {
	if (argv.length > 1) {
		throw new BoundaryLintError(`unexpected extra argument(s): ${argv.slice(1).join(' ')}`);
	}
	const root = argv[0] ? path.resolve(argv[0]) : TOOL_ROOT;
	if (!existsSync(root)) {
		throw new BoundaryLintError(`root does not exist: ${root}`);
	}
	return { root };
}

export function runBoundaryLint(root) {
	const { violations: importViolations, coverage } = runImportGraphChecks(root);

	const simRoot = path.join(root, 'src', 'sim');
	const srcRoot = path.join(root, 'src');
	const textualViolations = [
		...checkBannedGlobals(simRoot, root),
		...checkTickMsRule(simRoot, root),
		...checkDeviceNameLiterals(srcRoot, root),
	];

	return { importViolations, textualViolations, coverage };
}

function formatViolation(v) {
	const location = v.line ? `${v.file}:${v.line}` : v.file;
	return `  [${v.rule}] ${location} -- ${v.message}`;
}

function main() {
	let args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (err) {
		console.error(`[boundary-lint] FAILED: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
		return;
	}

	let result;
	try {
		result = runBoundaryLint(args.root);
	} catch (err) {
		console.error(`[boundary-lint] FAILED: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
		return;
	}

	const { importViolations, textualViolations, coverage } = result;
	const allViolations = [...importViolations, ...textualViolations];

	if (allViolations.length === 0) {
		console.log(`[boundary-lint] OK -- ${coverage} .ts file(s) under src/ cruised, no violations`);
		process.exit(0);
		return;
	}

	console.error(`[boundary-lint] FAILED -- ${allViolations.length} violation(s):`);
	for (const v of allViolations) {
		console.error(formatViolation(v));
	}
	// This story's I/O matrix: import-graph rule violations (sim-no-upward-import,
	// sim-no-babylon, presentation-only-contracts-and-table, host-no-physics-or-rules,
	// no-havok) exit 2; every other violation kind exits 1.
	process.exit(importViolations.length > 0 ? 2 : 1);
}

const isMainModule = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMainModule) {
	main();
}
