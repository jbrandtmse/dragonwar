// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate fixture, own root: the swc parser reports `.mts` as NOT
// scannable, so dependency-cruiser never returns this module. The coverage
// guard used to collect only `.ts`, so this file was neither cruised nor
// counted as missing -- four violations in one file, lint exit 0.
export const cooldownMs = 250;
export const device = 's_start';
export const stamp = new Date();
