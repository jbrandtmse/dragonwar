// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Negative control: an 8-hex-digit NUMERIC constant (the real repository's
// own FNV-1a idiom, replay.ts:106,109) -- must NOT fire sim-no-colour
// (AD-9). It is a bare `0x` numeric literal in code, never a `#`-prefixed
// string literal, and this rule has no `0x` matcher at all.
export const FNV_OFFSET_BASIS = 0x811c9dc5;
