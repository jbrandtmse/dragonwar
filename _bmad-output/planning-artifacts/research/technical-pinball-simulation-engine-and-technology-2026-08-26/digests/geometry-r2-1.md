# Digest: Component specs and drain geometry (round 2)

Browser-bypass status up front, because it determines how much of this round is primary:

- **marcospecialties.com — bypass WORKED, once.** A top-level `navigate_page` to `/pinball-parts/FL-11629` rendered the full product page including the spec block. But the site's Cloudflare rule then flagged the browser IP after two attempts to pull sibling product pages programmatically (same-origin `fetch()` → HTTP 403; same-origin `<iframe>` → 403 interstitial). Every subsequent request, including a plain top-level navigation to `/pinball-parts/FL-15411`, returned "Attention Required! | Cloudflare". **Net: FL-11629 is now primary-sourced verbatim; FL-15411, FL-11630 and AE-23-800 are not, and the IP is burned for this session.** A later session with a fresh IP should retrieve them by top-level navigation ONLY, one page per navigation, no fetch/iframe.
- **flippers.com — bypass FAILED.** `https://www.flippers.com/coil-resistance.html` sat on the Cloudflare "Just a moment... / Performing security verification" JS interlude through ~60 s of polling across three attempts and never resolved to content. The coil resistance chart was not retrieved.
- **manualslib.com / sternpinball.com — not attempted.** Budget was consumed by Q1/Q2/Q3; Q6 is unadvanced this round.

## Findings

### 1. Flipper pivot spacing and flipper arc

Flipper pivot holes on most WPC games are 1/2 in diameter, with hole centres located 7 in up from the bottom edge of the playfield, and the two flipper pivots spaced 6-13/16 in to 7 in apart centre-to-centre (173.0-177.8 mm).
- source: https://pinballmakers.com/wiki/index.php?title=Design | publisher: Pinball Makers wiki (homebrew/open-hardware community wiki, the same site that hosts the P3 and FAST documentation trails) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: dimension-spec

Bally-family lane widths at the bottom of the playfield: inlane and outlane are each 1-3/8 in wide, and the flipper shafts are 7 in centre-to-centre.
- source: https://pinside.com/pinball/forum/topic/general-lane-widths-and-flipper-spacing | publisher: Pinside forum (hobbyist, retrieved via WebSearch result summary rather than by opening the thread) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: estimate

Standard playfield blank is 42 in x 20.25 in, fabricated from 1/2 in plywood — consistent with the already-established figure, and now corroborated on a second independent hobbyist-build source.
- source: https://howtobuildapinballmachine.wordpress.com/2014/01/31/playfield-fabrication-blank/ (page itself returned HTTP 403 to WebFetch; figure taken from the search engine's extract of it) | publisher: "How to Build a Pinball Machine" build blog | pub_date: 2014-01 | accessed: 2026-08-26 | confidence: low | class: dimension-spec

**Honest status of the priority question.** The 7 in centre-to-centre figure is now attested on two independent hobbyist sources rather than one Pinside thread reached through an aggregator, and the pinballmakers.com wiki adds two genuinely new dimensions that were not in the prior round: pivot hole **diameter 1/2 in** and pivot centre **7 in up from the playfield's bottom edge**, which together fix the pivot points in playfield coordinates rather than just their separation. That is a real upgrade for a simulation — the drain triangle can now be anchored absolutely, not just relatively. But it remains **hobbyist-sourced, not manufacturer-sourced**: no Williams/Bally mechanical drawing, no dimensioned flipper-assembly drawing, and no CAD/DXF template file was actually opened this round. The tip gap (~3/8-1/2 in) is still a derivation, not a measurement — nothing found this round measures it. The 50-52 degree arc figure gained **no** new support this round; treat it as unconfirmed.

### 2. Coil specs from primary vendor pages

FL-11629 (blue) is a 3-terminal, dual-winding flipper coil with 1N4004 diodes, spec'd verbatim by the vendor as: "Primary winding (power) ~4 ohms (no diode)" and "Secondary winding (hold) ~132 ohms (no diode)". Vendor description: "high flipper strength, parallel wound coil, used on many Williams WPC system pinball games (original blue coil wrapper)". Used on Williams/Bally, Jersey Jack, Chicago Gaming, American Pinball. Cross-references: 23-2002-00, Wico 01-095500, JJP 23-002002-00. Weight 0.55 lb. No AWG or turn count is published on the page.
- source: https://www.marcospecialties.com/pinball-parts/FL-11629 | publisher: Marco Specialties | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: component-spec
- **Upgraded this round from aggregator-mediated to primary (verbatim quote from the vendor page itself).** It confirms the prior round's figures exactly: power ~4.0 ohm, hold ~132 ohm.

Marco publishes an explicit weakest-to-strongest ordering of the WPC-era flipper coil family, with an application note for each — this is the vendor's own strength ranking, quoted verbatim: "FL-11753 Yellow - Used with short flippers and close shots / FL-11722 Green - Used for close shots near drop targets / FL-11630 Red - The standard, most commonly used coil / FL-15411 Orange - Used for long playfield shots / FL-11629 Blue - Used for long shots and high ramps".
- source: https://www.marcospecialties.com/pinball-parts/FL-11629 | publisher: Marco Specialties | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: component-spec
- This is directly usable as the era/strength band for a flipper-strength model: five discrete tiers with stated shot-distance intent, ordered by the vendor. It is a stronger basis for banding flipper strength than an inferred ohms-only ranking.

Marco states the factory maintenance interval as a complete flipper rebuild every 500,000 cycles/flips.
- source: https://www.marcospecialties.com/pinball-parts/FL-11629 | publisher: Marco Specialties | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: component-spec

FL-11630 (red) is confirmed by the vendor as a "3 terminal, dual winding flipper coil with 1N4004" and as "The standard, most commonly used coil" — but **its resistances were not retrieved**; the page was blocked.
- source: https://www.marcospecialties.com/pinball-parts/FL-11629 (related-items block on the FL-11629 page) | publisher: Marco Specialties | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec

FL-15411 (orange, ~4.2 ohm power / ~145 ohm hold) and AE-23-800 (slingshot/pop) — **NOT confirmed and NOT corrected this round.** Both pages returned the Cloudflare block. The prior round's 4.2/145 for FL-15411 stands unverified. Given that FL-11629's prior figures proved exactly right against the primary page, the prior round's FL-15411 figures are plausibly from the same (accurate) upstream, but that is inference, not verification.
- source: n/a (retrieval failed) | publisher: n/a | pub_date: n/a | accessed: 2026-08-26 | confidence: low | class: component-spec

No vendor page found this round publishes AWG wire gauge or turn counts for any flipper coil. Marco's own spec block gives resistance only. Absence of evidence is the finding: **turns and gauge appear not to be published by the parts vendors at all**, and would have to come from a Williams engineering drawing or from destructive teardown measurements.

### 3. Flipper firing pulse duration in milliseconds

MPF's documented default coil pulse is 10 ms, and the docs explicitly flag it as deliberately non-representative: "The default amount of time, in milliseconds, that this coil will pulse for... **Default is 10ms, which is extremely weak, but set low for safety purposes.**" This is a safety floor, NOT a model of real hardware — do not use 10 ms as a flipper pulse.
- source: https://missionpinball.org/latest/config/coils/ | publisher: Mission Pinball Framework (open-source pinball controller framework) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: component-spec

MPF's canonical worked example in the coils reference gives realistic per-device values, quoted verbatim from the doc's example config: **flipper main coil `default_pulse_ms: 30`, `max_pulse_ms: 100`, `default_pulse_power: 0.7`, `max_pulse_power: 1.0`; flipper hold coil `default_hold_power: 0.25`, `max_hold_power: 0.5`; knocker `default_pulse_ms: 20`; pop bumper `default_pulse_ms: 18`, `max_pulse_ms: 100`; ball gate hold `default_hold_power: 0.375`.**
- source: https://missionpinball.org/latest/config/coils/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: component-spec
- **This is the answer to Q3, with the caveat that these are documentation example values, not measured values off a Williams machine.** They are the closest thing to a published, hardware-realistic number found anywhere across two rounds: flipper ~30 ms pulse at 70% power, then hold at 25% PWM. A slingshot value is not in the example block; the pop bumper's 18 ms is the nearest analogue and is a reasonable stand-in for a slingshot pulse.

MPF's power model is a normalized float 0-1 rather than a raw PWM duty specification, by design: `default_pulse_power` and `default_hold_power` are "float(0,1) (i.e. 0% power to 100% power) which controls the relative power... Different hardware platforms implement the hold power in different ways, so this 0-1 default_hold_power setting provides a generic interface that works with all hardware platforms."
- source: https://missionpinball.org/latest/config/coils/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: component-spec
- Practical consequence for a simulator: the two-stage model is pulse-at-power-P-for-T-ms then hold-at-power-H, with `allow_enable` gating any 100% continuous hold because "many coils will burn up if you enable them on solid". A simulated flipper should model the same two stages.

MPF documents `default_recycle` as the anti-machine-gun delay and names exactly the devices it exists for: "Controls whether this coil should add a small delay before it's allowed to be fired again. (This is used on things like pop bumpers and slingshots to prevent 'machine gunning.')" The delay's duration is platform-specific and is not given a number in the docs.
- source: https://missionpinball.org/latest/config/coils/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: component-spec

MPF's `flippers:` section documents the control structure but **no numeric defaults**: required `main_coil:`, optional `hold_coil:`, `use_eos:` ("whether to use the end-of-stroke switch"), `power_setting_name:` (operator-adjustable flipper strength), `eos_switch:`, `activation_switch:`, plus `repulse_on_eos_open:` and `eos_active_ms_before_repulse:`. The EOS-repulse settings are worth noting for simulation fidelity: real hardware re-pulses the flipper if the end-of-stroke switch opens under ball load.
- source: https://missionpinball.org/latest/config/flippers/ | publisher: Mission Pinball Framework | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec

No Williams WPC or Stern SPIKE service manual was opened this round, so **no manufacturer-stated pulse time was obtained.** The operator-menu coil-pulse adjustment hypothesis remains untested.

### 4. Playfield surface and rubber material properties

Titan silicone pinball rubber is stated at **45 Shore A**; White Happ rubber ring at **45 Shore A**; Black Happ rubber ring at **50 Shore A**.
- source: https://www.kineticist.com/news/pinball-flipper-rubber-comparison and https://pinside.com/pinball/forum/topic/titans-competition-silicone-rubber-vids-review | publisher: Kineticist (pinball news site) / Pinside forum — retrieved via WebSearch result summary, NOT by opening either page | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: component-spec
- **This is genuinely new** — the prior round found no durometer at all. It is still aggregator-mediated (search-summary, not the page itself) and the Titan/Happ numbers should be verified against the vendor pages before being used as a physics input. Note the practical implication: the spread between common rubber compounds is narrow (45-50 Shore A), so durometer is unlikely to be the dominant free parameter in a bounce model.

Coefficient of restitution and coefficient of friction for a steel ball against a clearcoated playfield, and against a rubber ring: **still not found.** No pinball-specific bounce or material testing was located. Treating this as a confirmed absence after two rounds: these numbers do not appear to be published anywhere, by vendors or by the hobbyist community. They will have to be derived from VPX's tuned values (already established: elasticity 0.88, falloff 0.15, friction 0.8-0.9) or measured.

VPX/VPE default material tables: **not retrieved.** `docs.visualpinball.org/creators-guide/manual/editor-materials.html` returned HTTP 404 — the docs site has been restructured and the materials page now lives at some other path. This is a live lead, not a dead end.

### 5. Outlane / drain zone geometry

Bally-family inlane and outlane widths are each 1-3/8 in (34.9 mm).
- source: https://pinside.com/pinball/forum/topic/general-lane-widths-and-flipper-spacing | publisher: Pinside forum, via WebSearch summary | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: estimate

Adjustable outlane posts are described in terms of discrete hole positions rather than dimensions: some machines expose four settings, others two holes per side, named open/middle/narrow. **No source states the dimensional delta between positions in inches.**
- source: https://pinside.com/pinball/forum/topic/adjustable-outlane-posts-what-position | publisher: Pinside forum, via WebSearch summary | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: estimate
- The finding for Q5 is that "opening the outlane posts" is specified by the manufacturer as a hole index, not a width — so a simulator has to pick the dimensional interpretation itself, or measure the hole spacing off a playfield template. Note the existence of a 3D-printable "Homebrew Pinball Outlane Post Alignment Tool" (thingiverse.com/thing:6598198) whose STL geometry would encode a real post spacing — an unusual but genuinely dimensioned lead.

No dimensioned drain-gap specification was found. Combined with the Q1 finding, the drain zone can currently be bounded only by: pivots 7 in apart, pivot centres 7 in up from the bottom edge, bat 3.125 in rubbered, lanes 1-3/8 in — leaving the tip gap as the one unmeasured quantity in the whole drain triangle.

### 6. Stern service manual spec block, verbatim

**Not advanced this round.** No Stern manual PDF and no ManualsLib page was opened; the budget was spent on Q1-Q3 as instructed. The prior round's figures (210 lb, 78 x 27.75 x 57 in, via a ManualsLib search-result snippet) remain aggregator-mediated and unverified, and no stated pitch or electrical spec was obtained.
- source: n/a (not attempted) | publisher: n/a | pub_date: n/a | accessed: 2026-08-26 | confidence: low | class: dimension-spec

## Leads worth chasing

- **Marco Specialties, from a fresh IP.** The bypass provably works for a single top-level navigation. Retrieve `/pinball-parts/FL-15411`, `/pinball-parts/FL-11630`, `/pinball-parts/FL-11722`, `/pinball-parts/FL-11753` and `/pinball-parts/AE-23-800` as five separate top-level navigations, reading each with `evaluate_script` before navigating away. Do NOT use `fetch()` or iframes — that is what triggered the block. Five navigations plus five reads would complete the entire WPC flipper coil family as primary spec, which with the vendor's own strength ordering is a complete flipper-strength band table.
- **flippers.com coil resistance chart.** The Cloudflare JS interstitial never cleared under automation. Worth one more try with a longer settle, or look for the chart mirrored elsewhere (it is widely reproduced in pinball repair guides).
- **VPX materials defaults.** `docs.visualpinball.org` 404'd on the guessed path; the site's search or the `vpinball/vpinball` source tree (material presets are compiled into the editor defaults) will have it. This is the most likely place to find a coherent material table covering playfield, rubber, posts, metal walls and plastics in one place.
- **The Thingiverse outlane post alignment tool** (thing:6598198) — an STL built to align outlane posts necessarily encodes real post spacing. Unconventional source, but dimensioned.
- **Pinball Makers wiki, beyond the Design page.** The Design page yielded three new dimensions in one fetch and was the single highest-yield source of the round. Its Construction page and any playfield-template subpages are the best remaining shot at a dimensioned drain zone, and it is WebFetch-accessible (no 403).
- **DXF/SVG Bally blank playfield templates** are referenced as existing (in DXF and SVG, for CAD/Illustrator) but no URL was captured. Finding and parsing one would settle the tip gap, outlane widths and post positions in a single stroke — this is the highest-value unclaimed artifact in the whole brief.
- **MPF example machine configs** (`mpf/examples/` in the missionpinball/mpf GitHub repo) contain working configs for real machines and would give per-device pulse_ms values beyond the doc's illustrative example.

## Looked for but could not find

- Any Williams/Bally **manufacturer** mechanical drawing giving flipper pivot spacing, tip gap or flipper arc. Two rounds, zero hits. The 50-52 degree arc figure has now failed to corroborate twice.
- A measured (as opposed to derived) **flipper tip gap**.
- **AWG wire gauge or turn counts** for any pinball flipper coil, from any vendor. Marco publishes resistance only. This looks like a genuine publication gap, not a search failure.
- Any **manufacturer-stated coil pulse duration** in ms — Williams WPC service manual, Stern SPIKE service manual, FAST or Multimorphic controller docs. MPF's documentation example is the only numeric source found across both rounds.
- **Coefficient of restitution or friction** for steel-on-clearcoat or steel-on-rubber, pinball-specific. Confirmed absent after two rounds of targeted search.
- A **dimensioned outlane/drain specification** in inches, including what a post position change actually changes dimensionally.
- `mpf/mpfconfig.yaml` on the dev branch turned out to be only ~15 KB of module registrations and machine-wide defaults (it does contain a `flipper_power:` operator setting and `both_flippers:`/`flipper_cradle:` combo-switch definitions), **not** the config-validator spec with per-setting defaults. Whatever file now holds MPF's validator defaults was not located; the rendered docs site was the better source anyway.
