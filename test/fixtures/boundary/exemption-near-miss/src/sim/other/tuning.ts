// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// DW-39 near-miss fixture: this file's BASENAME matches src/sim/table/tuning.ts,
// but its path does not -- the sim-no-literal-ms / sim-one-tick-constant
// exemptions are path-exact, never basename- or suffix-matched.
//
// (Placed under src/sim/** rather than src/sim/table/**, deliberately still
// INSIDE checkTickMsRule's own scan root -- both checks it exercises only
// ever scan src/sim/**, so a near-miss placed entirely outside that root,
// e.g. src/presentation/tuning.ts, would never be visited at all regardless
// of the exemption and the fixture would prove nothing. Verified empirically
// during this story's implementation.)
export const nudgeImpulseMs = 25;
// A local, self-contained declaration (not an import from the real
// sim/contracts/time.ts) -- the rule below is a pure textual /\bTICK_HZ\b/
// scan, so this still exercises the near-miss, but keeps the fixture valid
// TypeScript on its own rather than referencing an undefined identifier.
const TICK_HZ = 1000;
export const referencesTickHz = TICK_HZ;
