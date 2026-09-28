// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: sim-no-colour (AD-9). A numeric RGB triple under
// src/sim/ -- LAMP_GRAMMAR's own table shape, which is exactly what a
// second colour authority in rules would look like. AC 2 names "no RGB"
// first, and before the code-review pass-2 matcher nothing saw this form.
export const LIT = { r: 1, g: 1, b: 1 };
export const DRAGON = { r: 1, g: 0.5, b: 0 };
