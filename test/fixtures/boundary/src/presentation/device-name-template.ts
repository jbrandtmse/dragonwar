// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate fixture: a device name in the TRAILING chunk of a template
// literal, i.e. after a `${...}` interpolation. extractStringLiterals() used
// to strip one character unconditionally from each end of every span, so this
// chunk became "_troug" and the device name was missed entirely.
const prefix = 'lamp';
export const target = `${prefix}s_trough_1`;
