// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-3: TICK_HZ is the single simulation-clock constant. No other file under
// sim/ may contain a literal millisecond or tick-rate number.

// PROVISIONAL - pending the author's macOS legs of Spike 1.
//
// Set from the Spike 1 PRODUCTION-BUILD measurement of 2026-08-27, not the Vite
// dev page: the dev page is not a valid proxy for the frame budget (it measured
// the Edge leg 0.4 ms slower and flipped that leg's verdict). Always measure the
// frame budget against a production build. See docs/spikes/spike-1.md.
//
// Gating paths for this value - all three must meet p95 <= 4 ms per 60 Hz frame:
//   Chrome / Windows   MEASURED 3.50 ms median (5/5 runs under the bar)
//   Chrome / macOS     PENDING - author's leg
//   Safari / macOS     PENDING - author's leg; JavaScriptCore, not V8, so it is
//                      the real remaining performance risk. It GATES.
// Best-effort for this gate only:
//   Edge / Windows     MEASURED 3.70 ms median (18/20 runs under the bar; a known
//                      tail at 4.3 and 4.4 ms). Recorded, never gating. Edge
//                      remains a fully supported browser - this is a frame-budget
//                      carve-out, not a support-tier demotion (FR-54, NFR-6).
//
// Two of the three gating paths are still unmeasured, so this value is NOT
// ratified. Ledger: "Author-owned: TICK_HZ ratification from Spike 1".
// Changing it re-records every golden replay (AD-3, AD-15).
export const TICK_HZ = 1000; // 1000 on PASS, 480 on FAIL
