// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9, AC 1: "given no edits, when Export runs, then the emitted text
// is byte-identical to src/sim/table/tuning.ts (LF-normalised). Given
// exactly one edited value, when Export runs, then the emitted text differs
// from the file on disk only at that value's line -- group order, JSDoc
// blocks, tab indentation, quote style and satisfies clauses all preserved."
//
// A browser page cannot write a repository file (AD-17's pinned CSP; this
// story's Design Notes, "Export: what 'exports to src/sim/table/tuning.ts'
// means here, and why"). The honest reading the architecture selects is:
// Export produces the complete, correctly formatted tuning.ts TEXT, and the
// author moves it into the file in one paste.
//
// What makes "byte-identical with no edits" a real guarantee rather than a
// hand-rolled pretty-printer that HAPPENS to match today is where it sits:
// this file imports `sim/table/tuning.ts`'s own source text VERBATIM via
// Vite's built-in `?raw` import (a real import, not a hand-copied
// duplicate -- it can never silently drift out of sync with the file it
// describes) and, for an edit, locates the target tunable's `entry(...)`
// call by walking the SAME nested-group structure the file's own indentation
// encodes, replacing only that call's first (value) argument. Every other
// byte -- comments, group order, quote style, `satisfies` clauses -- is the
// file's own text, untouched.
//
// `sim/table/tuning.ts` is a legal host/** import (AD-16: "host/** may
// import sim/contracts, sim/table, sim/loop"), and the `?raw` suffix imports
// its TEXT, not its runtime module -- this file never evaluates TUNING
// itself, so it carries no physics.

// eslint-disable-next-line import/no-unresolved -- Vite's built-in `?raw` raw-text import (vite/client.d.ts declares `declare module '*?raw'`); resolved at build/test time, not a real TypeScript module.
import TUNING_SOURCE_RAW from '../../sim/table/tuning.ts?raw';

/** One edit: the dotted path to a leaf `TuningEntry` (e.g. `['materials', 'flipper_rubber', 'elasticityFalloff']`) and its new numeric value. Every `TUNING` leaf is numeric (Story 1.9's own survey: `TuningEntry<number>` throughout). */
export interface TuningOverride {
	readonly path: readonly string[];
	readonly value: number;
}

/** LF-normalised, matching this story's own "byte-identical (LF-normalised)" wording -- `core.autocrlf` can check this file out with either line ending (Story 1.8's own CRLF hazard). */
function normaliseLineEndings(text: string): string {
	return text.replace(/\r\n/g, '\n');
}

const TUNING_SOURCE = normaliseLineEndings(TUNING_SOURCE_RAW);

const GROUP_OPEN = /^(\t+)(\w+):\s*\{\s*$/;
const GROUP_CLOSE = /^\t+\}/;
const ENTRY_OPEN = /^\t+(\w+):\s*entry\(/;

/** Thrown when an override names a path `serialiseTuning()` cannot find in the live template -- e.g. a stale panel row referencing a renamed tunable. Named, never a silent no-op edit. */
export class UnknownTuningPathError extends Error {}

function pathsEqual(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((segment, i) => segment === b[i]);
}

/**
 * Replaces the FIRST argument of the `entry(...)` call opened at
 * `lines[entryLineIndex]` with `newValue`, formatted the plain JS-numeric
 * way (`String(value)`) -- correct for every value this story's panel edits
 * (a plain finite number, rejected at the input before it ever reaches
 * here, per the panel's own "non-finite is rejected at the input" rule).
 * Handles both of `tuning.ts`'s own layouts: the value inline on the
 * `entry(` line itself, or -- when the call is multi-line -- alone on the
 * very next line.
 */
function replaceEntryValue(lines: string[], entryLineIndex: number, newValue: number): void {
	const line = lines[entryLineIndex]!;
	const marker = 'entry(';
	const markerIdx = line.indexOf(marker);
	const afterMarker = line.slice(markerIdx + marker.length);
	const formatted = String(newValue);

	if (afterMarker.trim().length > 0) {
		// Inline form: "…entry(0.3, "…", 'high'),": the value runs from right
		// after "entry(" to the first comma, on this SAME line.
		const commaIdx = afterMarker.indexOf(',');
		const before = line.slice(0, markerIdx + marker.length);
		const rest = afterMarker.slice(commaIdx);
		lines[entryLineIndex] = `${before}${formatted}${rest}`;
		return;
	}

	// Multi-line form: "…entry(" ends the line; the value is alone on the
	// NEXT line, e.g. "\t\t\t\t0.15,".
	const valueLineIndex = entryLineIndex + 1;
	const valueLine = lines[valueLineIndex]!;
	const indentMatch = /^(\s*)/.exec(valueLine);
	const indent = indentMatch ? indentMatch[1] : '';
	const trailingComma = valueLine.trimEnd().endsWith(',') ? ',' : '';
	lines[valueLineIndex] = `${indent}${formatted}${trailingComma}`;
}

/**
 * Locates the `entry(...)` call for `path` inside `lines` (a nested-group
 * walk driven entirely by `tuning.ts`'s own indentation -- `groupName: {`
 * opens a level, a line starting with `}` at that same tab depth closes it,
 * `key: entry(` is a leaf at the CURRENT depth) and replaces its value.
 * Throws `UnknownTuningPathError` naming the path if no leaf matches --
 * never a silent no-op.
 */
function applyOverride(lines: string[], override: TuningOverride): void {
	const stack: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const groupMatch = GROUP_OPEN.exec(line);
		if (groupMatch) {
			stack.push(groupMatch[2]!);
			continue;
		}
		const entryMatch = ENTRY_OPEN.exec(line);
		if (entryMatch) {
			const fullPath = [...stack, entryMatch[1]!];
			if (pathsEqual(fullPath, override.path)) {
				replaceEntryValue(lines, i, override.value);
				return;
			}
			continue;
		}
		if (GROUP_CLOSE.test(line)) {
			stack.pop();
		}
	}
	throw new UnknownTuningPathError(`serialiseTuning(): no tunable found at path "${override.path.join('.')}"`);
}

/**
 * The complete `src/sim/table/tuning.ts` text, with every override's target
 * value substituted in place -- AC 1's Export. `serialiseTuning([])` is
 * byte-identical (LF-normalised) to the file on disk, by construction (the
 * template IS the file's own text). `serialiseTuning([oneOverride])` differs
 * from the file on disk only at that override's value line.
 */
export function serialiseTuning(overrides: readonly TuningOverride[]): string {
	if (overrides.length === 0) {
		return TUNING_SOURCE;
	}
	const lines = TUNING_SOURCE.split('\n');
	for (const override of overrides) {
		applyOverride(lines, override);
	}
	return lines.join('\n');
}
