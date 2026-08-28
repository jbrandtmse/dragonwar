// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate fixture: five millisecond literals written in spellings the
// original MS_BINDING_PATTERN (`-?\d+(?:\.\d+)?\b`) could not match, so each
// evaded AD-3's literal-millisecond rule while the lint reported OK.
// Numeric separator, exponent, hex, leading dot, and the SCREAMING_SNAKE
// spelling of the same suffix.
export const separatorMs = 1_000;
export const exponentMs = 1e3;
export const hexMs = 0x10;
export const leadingDotMs = .5;
export const DEBOUNCE_MS = 20;
