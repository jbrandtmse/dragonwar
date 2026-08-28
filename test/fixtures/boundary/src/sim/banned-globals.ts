// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: a banned global (AD-3, AD-16). Date, Math.random and
// globalThis are legal ES2023, so tsconfig.sim.json cannot reject them --
// this is the textual pass's job.
//
// Also exercises the I/O matrix's "Must ignore matches inside comments and
// string literals (block comments included -- the Story 1.1 stand-in
// stripped only `//` lines)" requirement: the block comment and string
// literal below each mention a banned token and must NOT be flagged --
// `now()`'s real `Date.now()` call below must be the only violation this
// file produces.
/* Math.random and globalThis inside a block comment must not be flagged. */
const globalThisMentionInAString = 'globalThis is only a string here, not a reference';
export function now(): number {
	return Date.now();
}
