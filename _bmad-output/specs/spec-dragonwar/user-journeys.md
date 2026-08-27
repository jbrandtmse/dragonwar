# User journeys

The four journeys the PRD and the spine bind to (UJ-1..UJ-4). Each names its climax and the edge case it must survive.

## UJ-1 — The author walks up and goes to war

Opens the link on their Mac after playing the Reference machine at the bar. The Walk-up plays: Backglass lit and animating the war, then the camera descends to the fixed view. Presses Start, plunges for the Skill shot, shoots the Lock lane twice, knocks down five letters — and on the sixth drop target the Dragon opens its Mouth and fires three balls at them. Cradles one, backhands the Dragon with the left flipper, lands the tenth Strike, the Jackpot lands.

- **Climax:** the balls they locked come back at them as fire.
- **Resolution:** End-of-ball bonus, next ball; afterwards they can name what differed from the bar machine on cradling, flipper snap and rejection.
- **Binds:** CAP-1, CAP-5, CAP-18, CAP-28–30, CAP-37–39.

## UJ-2 — A stranger plays from a link

Someone on Windows in Chrome clicks a link a friend sent. No install, no explanation. The Walk-up tells them it is a pinball machine; the Backglass tells them there is a dragon; the flipper keys are shown once in Attract. They play a three-ball game, tilt once, get a Match, and enter initials on a high score.

- **Edge case:** Safari on macOS gets the same table on the WebGL2 path; an unsupported browser gets a clear message naming the supported ones rather than a broken canvas.
- **Binds:** CAP-1, CAP-3, CAP-15, CAP-22, CAP-24, CAP-49, CAP-51, CAP-53, CAP-54. Realises SM-3.

## UJ-3 — Two friends on the couch

Start pressed twice before the first ball ends → two-player Hot seat. Per-player state (letters, Lock credits, Modes played, Tilt warnings) is independent; the Backglass names whose ball it is.

- **Edge case:** player 1 drains with two balls in the Lock; player 2's Lock credits are still zero. When player 2 later locks into the full device, the Lock spits one ball and the credit counts; when player 2 starts a War, the trough tops up whatever the Lock cannot supply. A Slam tilt ends both games.
- **Binds:** CAP-14, CAP-16, CAP-17, CAP-37, CAP-38.

## UJ-4 — The feel test (development ritual, not a milestone)

Throughout development the author plays the Reference machine, then the build, and names what differs on three things: cradling, flipper snap, and how shots reject and rebound. Each named difference becomes a tuning change (via the dev tuning panel, exported to `tuning.ts`) or a documented acceptance. Runs on both the WebGL2 and WebGPU paths.

- **Rule:** starts in epic 1 and never stops; time spent tuning past an accepted result is waste.
- **Binds:** CAP-5, CAP-6, CAP-29, CAP-32. Realises SM-4.
