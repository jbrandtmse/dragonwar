// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// A trivial, otherwise-valid host/ file -- exists only as a real import
// target for src/sim/upward-import.ts's deliberate violation (value import)
// and src/sim/upward-import-type-only.ts's deliberate violation (type-only
// import; I/O matrix "Type-only upward import" row).
export const helperValue = 1;
export type HelperType = typeof helperValue;
