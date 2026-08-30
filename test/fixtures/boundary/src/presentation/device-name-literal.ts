// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: no-device-name-literal (AD-1, AD-16). A device-name
// string literal belongs only in sim/table/dragonwar.ts.
//
// Also exercises the I/O matrix's "Only string literals count; the same
// text inside a comment is not a violation" requirement: this comment names
// s_shooter_lane, a real device name, and must NOT be flagged -- only the
// actual string literal below may be.
export const switchName = 's_start';
