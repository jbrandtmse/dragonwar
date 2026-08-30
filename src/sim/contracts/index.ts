// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Barrel for every closed seam union (AD-1's Seam Contracts). Table-free:
// nothing in src/sim/contracts/** imports outside this directory.

export * from './input';
export * from './events';
export * from './commands';
export * from './state';
export * from './snapshot';
export * from './mode-view';
export * from './replay';
// TICK_HZ is deliberately NOT re-exported here: AD-3 states it is named
// nowhere under sim/** other than sim/contracts/time.ts (its declaration)
// and sim/table/tuning.ts (its one arithmetic site), and
// tools/boundary-lint.mjs enforces "named anywhere" literally, including a
// barrel re-export. Import it directly from './time' (or '../contracts/time').
