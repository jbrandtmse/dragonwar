// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Recursively lists every file (not directory) under `root`, absolute paths. */
export function listFilesRecursive(root: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(root)) {
		const full = path.join(root, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			out.push(...listFilesRecursive(full));
		} else {
			out.push(full);
		}
	}
	return out;
}
