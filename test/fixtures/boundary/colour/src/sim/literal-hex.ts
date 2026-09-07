// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: sim-no-colour (AD-9). Hex colour string literals
// under src/sim/ -- all four authored widths, so every entry in
// SIM_NO_COLOUR_HEX_PATTERN_SOURCES is exercised by a fixture rather than
// shipped unfalsified (the 4-digit #rgba form was added by an earlier
// review pass with no fixture at all).
export const shade = '#ff8800';
export const shortShade = '#f80';
export const shortShadeAlpha = '#f80c';
export const shadeAlpha = '#ff8800cc';
