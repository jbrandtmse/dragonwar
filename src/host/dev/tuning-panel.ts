// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9, AC 1: "the dev tuning panel lists every table tunable with its
// value, source and confidence, hot-applies an edit to the running sim, and
// exports the current set back to the tuning file in that file's own
// format. A hot-apply during a recording invalidates the recording so it
// cannot be saved as a golden" (AD-15). Off on the default path -- mounted
// only behind an explicit opt-in (`src/host/boot.ts`), so AC 5's
// default-renderer ritual run is never measuring a page with the panel on.
//
// No inline `<script>`/`<style>` (AD-17's pinned CSP -- `pnpm check:dist`
// greps it): every element is built with `document.createElement`, and
// every rule this file's DOM needs lives in `public/styles.css` (already
// linked statically from `index.html`, the same "bundle styles through the
// existing Vite pipeline" pattern the boot gate and error panel already
// use) under the `dw-tuning-panel` class prefix.
//
// `host/**`, not `sim/**` (AD-16): imports only `sim/table/tuning`
// (`TUNING`, `resolveTuning`, types) and `src/host/loop.ts`'s `HostLoop` --
// never `sim/physics` or `sim/rules`.

import { resolveTuning, TUNING, type Confidence, type ResolvedTuning, type TuningEntry } from '../../sim/table/tuning';
import { serialiseTuning, type TuningOverride } from './tuning-source';
import type { HostLoop } from '../loop';

export interface TuningRow {
	readonly path: readonly string[];
	readonly value: number;
	readonly source: string;
	readonly confidence: Confidence;
}

function isTuningEntryLike(value: unknown): value is TuningEntry<number> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'value' in value &&
		typeof (value as { value: unknown }).value === 'number' &&
		'source' in value &&
		'confidence' in value
	);
}

/**
 * Recursively enumerates `node` (default `TUNING`) into one row per leaf
 * `TuningEntry`, path-prefixed by every group it is nested under -- the I/O
 * matrix's own "nested groups (materials, flipper, cabinet, tiltBob,
 * switchSettleMsByClass) walked recursively" row. A function-typed value
 * (there is none directly on `TUNING` itself -- `plungerSpeedByHoldMs` is a
 * SEPARATE module export, never a `TUNING` property -- but the guard is
 * kept, defensively, matching the I/O matrix's own wording verbatim) is
 * skipped rather than descended into or emitted as a row.
 */
export function enumerateTuningRows(node: unknown = TUNING, path: readonly string[] = []): TuningRow[] {
	if (typeof node === 'function') {
		return [];
	}
	if (isTuningEntryLike(node)) {
		return [{ path, value: node.value, source: node.source, confidence: node.confidence }];
	}
	if (node === null || typeof node !== 'object') {
		return [];
	}
	const rows: TuningRow[] = [];
	for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
		rows.push(...enumerateTuningRows(value, [...path, key]));
	}
	return rows;
}

/**
 * Builds a `typeof TUNING`-shaped deep clone of `TUNING` with every
 * `overrides` entry's leaf `value` replaced, then resolves it
 * (`resolveTuning()`) -- the exact shape `sim/loop`'s rebuild seam
 * (`createLoop({ tuning })` / `hostLoop.reset({ tuning })`) expects. Every
 * `source`/`confidence` is preserved untouched; only the numeric `value`
 * moves.
 */
export function buildOverriddenTuning(overrides: ReadonlyMap<string, number>): ResolvedTuning {
	function clone(node: unknown, path: readonly string[]): unknown {
		if (isTuningEntryLike(node)) {
			const key = path.join('.');
			return overrides.has(key) ? { ...node, value: overrides.get(key)! } : node;
		}
		if (node === null || typeof node !== 'object') {
			return node;
		}
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
			out[k] = clone(v, [...path, k]);
		}
		return out;
	}
	return resolveTuning(clone(TUNING, []) as typeof TUNING);
}

export interface TuningPanelDeps {
	readonly hostLoop: HostLoop;
	/** Only the two members a hot-apply needs -- narrowed so this file cannot reach into the rest of `ReplayRecorder`'s surface. */
	readonly replayRecorder: { invalidate(reason: string): void; readonly isRecording: boolean };
}

export interface TuningPanel {
	readonly element: HTMLElement;
	/** The current set of edits, path (dotted) -> new value -- read by tests and by boot.ts's own GameStart construction (AC 1's "the panel's current set" replacing the hardcoded dev GameStart). */
	readonly overrides: ReadonlyMap<string, number>;
	destroy(): void;
}

/**
 * Builds the panel's DOM (never mounts it -- the caller appends
 * `panel.element` wherever it wants, e.g. `document.body`). Every edit:
 * rejects a non-finite input at the input itself (never reaching the sim,
 * I/O matrix: "Non-finite / non-numeric edit is rejected at the input, sim
 * untouched"); invalidates the in-progress recording FIRST if one is
 * running (AD-15's own ordering: "a hot-apply during a recording
 * invalidates it"); then rebuilds the sim via `hostLoop.reset({ tuning })`
 * (Phase 1's seam) with EVERY accumulated override applied, not just the
 * one just edited -- so a second edit does not silently discard the first.
 */
export function createTuningPanel(deps: TuningPanelDeps): TuningPanel {
	const overrides = new Map<string, number>();
	const rows = enumerateTuningRows();

	const root = document.createElement('div');
	root.className = 'dw-tuning-panel';

	const heading = document.createElement('h2');
	heading.className = 'dw-tuning-panel__heading';
	heading.textContent = 'Dev tuning panel';
	root.appendChild(heading);

	const list = document.createElement('div');
	list.className = 'dw-tuning-panel__list';
	root.appendChild(list);

	function hotApply(): void {
		if (deps.replayRecorder.isRecording) {
			deps.replayRecorder.invalidate(`dev tuning panel: hot-apply (${overrides.size} pending edit${overrides.size === 1 ? '' : 's'})`);
		}
		deps.hostLoop.reset({ tuning: buildOverriddenTuning(overrides) });
	}

	for (const row of rows) {
		const pathKey = row.path.join('.');

		const rowEl = document.createElement('div');
		rowEl.className = 'dw-tuning-panel__row';

		const pathEl = document.createElement('span');
		pathEl.className = 'dw-tuning-panel__path';
		pathEl.textContent = pathKey;
		rowEl.appendChild(pathEl);

		const input = document.createElement('input');
		input.type = 'number';
		input.step = 'any';
		input.className = 'dw-tuning-panel__value';
		input.value = String(row.value);
		input.dataset.path = pathKey;
		rowEl.appendChild(input);

		const metaEl = document.createElement('span');
		metaEl.className = 'dw-tuning-panel__meta';
		metaEl.textContent = `${row.confidence} — ${row.source}`;
		rowEl.appendChild(metaEl);

		input.addEventListener('change', () => {
			// Review finding, this pass: `Number('')` and `Number('   ')` both
			// coerce to 0, which passes `Number.isFinite()` -- so clearing the
			// field and tabbing away used to silently hot-apply an override of
			// 0, contradicting the I/O matrix's "Non-finite / non-numeric edit
			// is rejected at the input, sim untouched" contract (a blank field
			// is non-numeric input, not the number zero). Reject blank/
			// whitespace-only input the SAME way as non-finite input, before
			// ever calling Number() on it.
			if (input.value.trim() === '') {
				input.value = String(overrides.get(pathKey) ?? row.value);
				return;
			}
			const parsed = Number(input.value);
			if (!Number.isFinite(parsed)) {
				// I/O matrix: "Non-finite / non-numeric edit is rejected at the
				// input, sim untouched" -- revert the field, touch nothing else.
				input.value = String(overrides.get(pathKey) ?? row.value);
				return;
			}
			overrides.set(pathKey, parsed);
			hotApply();
		});

		list.appendChild(rowEl);
	}

	const exportSection = document.createElement('div');
	exportSection.className = 'dw-tuning-panel__export-section';

	const exportButton = document.createElement('button');
	exportButton.type = 'button';
	exportButton.className = 'dw-tuning-panel__export-button';
	exportButton.textContent = 'Export';

	const exportArea = document.createElement('textarea');
	exportArea.className = 'dw-tuning-panel__export-area';
	exportArea.readOnly = true;
	exportArea.setAttribute('aria-label', 'Exported tuning.ts text');

	exportButton.addEventListener('click', () => {
		const overrideList: TuningOverride[] = [...overrides.entries()].map(([pathKey, value]) => ({ path: pathKey.split('.'), value }));
		exportArea.value = serialiseTuning(overrideList);
		exportArea.focus();
		exportArea.select();
	});

	exportSection.append(exportButton, exportArea);
	root.appendChild(exportSection);

	return {
		element: root,
		overrides,
		destroy(): void {
			root.remove();
		},
	};
}
