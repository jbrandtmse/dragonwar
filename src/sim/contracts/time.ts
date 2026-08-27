// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-3: TICK_HZ is the single simulation-clock constant. No other file under
// sim/ may contain a literal millisecond or tick-rate number.

// PROVISIONAL - pending the author's macOS leg of Spike 1.
// Set from the Windows Chrome + Windows Edge p95 measured 2026-08-27; see
// docs/spikes/spike-1.md. The macOS Chrome and Safari rows are still PENDING, so this
// value is NOT ratified. Ledger: "Author-owned: TICK_HZ ratification from Spike 1".
// Changing it re-records every golden replay (AD-3, AD-15).
export const TICK_HZ = 1000; // 1000 on PASS, 480 on FAIL
