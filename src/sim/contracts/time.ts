// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-3: TICK_HZ is the single simulation-clock constant. No other file under
// sim/ may contain a literal millisecond or tick-rate number.

// PROVISIONAL - pending the author's macOS legs of Spike 1.
//
// Set from the Spike 1 PRODUCTION-BUILD measurement of 2026-08-27, re-taken on
// the CORRECTED-GRAVITY harness after code review found the scene had been run
// at about 55% of a real 6.5 deg playfield. Measure the frame budget against a
// production build, not the Vite dev page - that is the standing practice and
// the story's amended acceptance criterion. (A same-session A/B later showed the
// dev page and the production build are indistinguishable on this host, so the
// practice stands but the original "the dev page measured 0.4 ms slower"
// justification for it does not.) See docs/spikes/spike-1.md.
//
// Gating paths for this value - all three must meet p95 <= 4 ms per 60 Hz frame:
//   Chrome / Windows   MEASURED 1.8 ms median (8/8 runs under the bar)
//   Chrome / macOS     PENDING - author's leg
//   Safari / macOS     PENDING - author's leg; JavaScriptCore, not V8, so it is
//                      the real remaining performance risk. It GATES.
// Best-effort for this gate only:
//   Edge / Windows     MEASURED 1.8 ms median (8/8 runs under the bar). Recorded,
//                      never gating. Edge remains a fully supported browser -
//                      this is a frame-budget carve-out, not a support-tier
//                      demotion (FR-54, NFR-6).
//
// Treat the Windows figure as a range, not a point: this host's session-to-
// session variance is about 1.9x on byte-identical code (roughly 1.6-4.6 ms
// observed across sessions), and the harness scene is near-quiescent for about
// half the measured window, so the number is a floor rather than a
// characterization. Both are ledgered; Story 1.5 re-takes the characterization.
//
// Two of the three gating paths are still unmeasured, so this value is NOT
// ratified. Ledger: "Author-owned: TICK_HZ ratification from Spike 1".
// Changing it re-records every golden replay (AD-3, AD-15).
export const TICK_HZ = 1000; // 1000 on PASS, 480 on FAIL
