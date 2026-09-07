// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Story 2.8 fixture (code review pass 3): the `sim-no-colour` rule wires
// `collectLineSuppressions` like every other textual rule, but no fixture
// exercised that branch for THIS rule -- the same "an unfalsified patch is
// not evidence" (Rule 19) class the review pass itself corrected for the
// hex matchers, left in place one function over. This file falsifies it.

// boundary-lint-disable-next-line sim-no-colour
export const suppressedColour = 'white';
export const stillFlaggedColour = 'red';

// boundary-lint-disable-next-line no-device-name-literal
export const wrongRuleSuppressionColour = '#ff8800';
