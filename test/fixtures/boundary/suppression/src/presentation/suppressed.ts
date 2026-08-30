// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// DW-38 fixture: the in-file suppression syntax, and how narrow it is.

// boundary-lint-disable-next-line no-device-name-literal
export const suppressedName = 's_start';
export const stillFlagged = 's_shooter_lane';

// boundary-lint-disable-next-line no-havok
export const wrongRuleSuppression = 's_flipper_left';

// boundary-lint-disable-next-line not-a-real-rule
export const unknownRuleSuppression = 's_ball_launch';
