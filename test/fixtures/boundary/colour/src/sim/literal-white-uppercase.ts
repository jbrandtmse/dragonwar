// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: sim-no-colour (AD-9). A CAPITALISED bare colour name
// string literal under src/sim/. The identifier matcher (h1) has always been
// case-insensitive; before the code-review pass-2 fix the anchored
// string-literal matcher (h2) was not, so this exact file passed the whole
// gate -- a bare colour name is a bare colour name in any casing.
export const shade = 'White';
