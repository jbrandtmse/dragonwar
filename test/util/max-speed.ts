// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1b task 16: the measured maximum ball speed the physics core can
// produce on a legitimate input path, shared between test/switch-max-speed.test.ts
// (AC 5) and test/vertical-containment.test.ts (AC 9) so the two never
// silently disagree about what "maximum" means. Measured, not assumed --
// see test/switch-max-speed.test.ts's own header for the full measurement
// recipe and both legs' raw figures.
//
// - Plunge leg (createLoop, full-strength manual plunge, polled
//   snapshot.balls[0].speed): 2497.92 mm/s.
// - Flipper leg (test/flipper-collision.test.ts's own driven-bat-strikes-a-
//   resting-ball harness, VU/T converted via mm/s = VU/T * MM_PER_VU * 100):
//   38.6389 VU/T = 2085.54 mm/s.
//
// The plunge leg is the larger of the two; a small margin is added so the
// derived tests genuinely exercise "at or above" the measured maximum.
//
// Code review 2026-09-02: both figures are FROZEN LITERALS -- nothing
// re-measures them, so raising `autolaunchSpeedMmPerS`,
// `plungerSpeedByHoldMs` or flipper strength would silently invalidate AC
// 5's "at any ball speed the Physics core can produce" without any test
// going red. `MEASURED_PLUNGE_MAX_MM_PER_S` is exported so
// `test/switch-max-speed.test.ts` can pin it against the live tunable it
// was measured from; the flipper leg has no single tunable to pin against
// and remains a recorded measurement only.
export const MEASURED_PLUNGE_MAX_MM_PER_S = 2497.92;
const MEASURED_FLIPPER_MAX_MM_PER_S = 2085.54;
export const MEASURED_MAX_SPEED_MM_PER_S = Math.max(MEASURED_PLUNGE_MAX_MM_PER_S, MEASURED_FLIPPER_MAX_MM_PER_S) * 1.02;
