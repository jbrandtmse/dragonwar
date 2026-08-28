#!/usr/bin/env node
// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// DW-25's state half: every `dependencies`/`devDependencies` key in
// package.json must have a row somewhere in ATTRIBUTIONS.md. Whitespace is
// normalised before matching (collapsed to single spaces), the same way
// test/attributions.test.ts's own `normalize()` does, so a markdown rewrap of
// the file cannot break the match. A package no longer present in
// package.json but still mentioned in ATTRIBUTIONS.md is not an error --
// this check is one-directional (package.json -> ATTRIBUTIONS.md).
//
// Node built-ins only. Usage: node tools/check-attributions.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const ATTRIBUTIONS_PATH = path.join(REPO_ROOT, 'ATTRIBUTIONS.md');

export class CheckAttributionsError extends Error {}

function normalize(text) {
	return text.replace(/\s+/g, ' ');
}

export function checkAttributions(
	packageJsonPath = PACKAGE_JSON_PATH,
	attributionsPath = ATTRIBUTIONS_PATH,
) {
	let pkg;
	try {
		pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
	} catch (err) {
		throw new CheckAttributionsError(`could not read/parse ${packageJsonPath}: ${err instanceof Error ? err.message : String(err)}`);
	}
	let attributions;
	try {
		attributions = readFileSync(attributionsPath, 'utf8');
	} catch (err) {
		throw new CheckAttributionsError(`could not read ${attributionsPath}: ${err instanceof Error ? err.message : String(err)}`);
	}
	const normalizedAttributions = normalize(attributions);

	// CLAUDE.md's provenance rule draws no distinction between kinds of
	// dependency ("nothing enters this repository without known provenance"),
	// so every manifest key that can introduce a third-party package is read,
	// not just `dependencies`/`devDependencies` -- a package moved to
	// `optionalDependencies` or `peerDependencies` would otherwise silently
	// lose its attribution requirement (review finding, this story's review
	// pass). None of the three extra keys is present today; this keeps the
	// check total if one ever is.
	const declared = {
		...(pkg.dependencies ?? {}),
		...(pkg.devDependencies ?? {}),
		...(pkg.optionalDependencies ?? {}),
		...(pkg.peerDependencies ?? {}),
		...(pkg.bundledDependencies ?? {}),
	};

	const missing = [];
	for (const name of Object.keys(declared)) {
		// Whitespace-normalised match, same shape as test/attributions.test.ts --
		// a row need only *mention* the package name somewhere (e.g.
		// "`dependency-cruiser` @ `18.2.0`"), not follow one exact row format.
		// A plain substring search would false-negative here: "vite" is a
		// literal substring of "vitest", so if the `vite` row were ever deleted
		// while the unrelated `vitest` row remained, this check would still
		// report "covered" (review finding, this story's own review pass).
		// Package names can contain regex metacharacters (`@babylonjs/core`,
		// `@types/node`) -- escape before building the boundary pattern. A
		// non-word/path character (or start/end of text) on both sides keeps
		// the match anchored to a whole name, not a substring of a longer one.
		const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const boundary = '(?:^|[^\\w@/.-])';
		const pattern = new RegExp(`${boundary}${escaped}(?:$|[^\\w@/.-])`);
		if (!pattern.test(normalizedAttributions)) {
			missing.push(name);
		}
	}
	missing.sort();
	return missing;
}

function main() {
	let missing;
	try {
		missing = checkAttributions();
	} catch (err) {
		console.error(`[check-attributions] FAILED: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
		return;
	}

	if (missing.length === 0) {
		console.log('[check-attributions] OK -- every package.json dependency has an ATTRIBUTIONS.md row');
		process.exit(0);
		return;
	}

	console.error(`[check-attributions] FAILED -- ${missing.length} package(s) with no ATTRIBUTIONS.md row:`);
	for (const name of missing) {
		console.error(`  ${name}`);
	}
	process.exit(1);
}

const isMainModule = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMainModule) {
	main();
}
